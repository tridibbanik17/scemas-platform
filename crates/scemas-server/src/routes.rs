use axum::{
    Json, Router,
    extract::{Path, State},
    http::HeaderMap,
    routing::{get, post},
};
use scemas_core::error::Result;
use scemas_core::models::{
    Comparison, IndividualSensorReading, MetricType, RuleStatus, ThresholdRule,
};
use serde::Deserialize;
use std::time::Instant;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::access::{AuthSessionResponse, DeviceAuthorizationRequest, LoginRequest, SignupRequest};
use crate::state::AppState;

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/internal/auth/signup", post(signup))
        .route("/internal/auth/login", post(login))
        .route("/internal/alerting/rules", post(create_rule))
        .route(
            "/internal/alerting/rules/{rule_id}/status",
            post(update_rule_status),
        )
        .route(
            "/internal/alerting/rules/{rule_id}/delete",
            post(delete_rule),
        )
        .route(
            "/internal/alerting/alerts/{alert_id}/acknowledge",
            post(acknowledge_alert),
        )
        .route(
            "/internal/alerting/alerts/{alert_id}/resolve",
            post(resolve_alert),
        )
        // internal API (called by tRPC, not by browser)
        .route("/internal/telemetry/ingest", post(ingest_telemetry))
        .route("/internal/health", get(health))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn signup(
    State(state): State<AppState>,
    Json(request): Json<SignupRequest>,
) -> Result<Json<AuthSessionResponse>> {
    let session = state.access.signup(request).await?;
    Ok(Json(session))
}

async fn login(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<Json<AuthSessionResponse>> {
    let session = state.access.login(request).await?;
    Ok(Json(session))
}

async fn create_rule(
    State(state): State<AppState>,
    Json(request): Json<CreateRuleRequest>,
) -> Result<Json<ThresholdRule>> {
    let rule = state
        .alerting
        .create_rule(
            request.metric_type,
            request.threshold_value,
            request.comparison,
            request.zone,
            request.created_by,
        )
        .await?;
    Ok(Json(rule))
}

async fn update_rule_status(
    State(state): State<AppState>,
    Path(rule_id): Path<Uuid>,
    Json(request): Json<UpdateRuleStatusRequest>,
) -> Result<Json<serde_json::Value>> {
    state
        .alerting
        .update_rule_status(rule_id, request.rule_status, request.updated_by)
        .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn delete_rule(
    State(state): State<AppState>,
    Path(rule_id): Path<Uuid>,
    Json(request): Json<DeleteRuleRequest>,
) -> Result<Json<serde_json::Value>> {
    state
        .alerting
        .delete_rule(rule_id, request.deleted_by)
        .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn acknowledge_alert(
    State(state): State<AppState>,
    Path(alert_id): Path<Uuid>,
    Json(request): Json<AlertActorRequest>,
) -> Result<Json<serde_json::Value>> {
    state
        .alerting
        .acknowledge_alert(alert_id, request.user_id)
        .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn resolve_alert(
    State(state): State<AppState>,
    Path(alert_id): Path<Uuid>,
    Json(request): Json<AlertActorRequest>,
) -> Result<Json<serde_json::Value>> {
    state
        .alerting
        .resolve_alert(alert_id, request.user_id)
        .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

/// POST /internal/telemetry/ingest
///
/// pipe-and-filter entry point: receives a sensor reading,
/// runs it through the validation pipeline, persists, then
/// triggers blackboard alert evaluation.
async fn ingest_telemetry(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(reading): Json<IndividualSensorReading>,
) -> Result<Json<serde_json::Value>> {
    let request_started_at = Instant::now();
    state.health.record_received();

    let device_id = required_header(&headers, "x-scemas-device-id")?;
    let device_token = required_header(&headers, "x-scemas-device-token")?;

    if device_id != reading.sensor_id {
        state.health.record_rejected();
        return Err(scemas_core::error::Error::Unauthorized(
            "device id header does not match sensor payload".into(),
        ));
    }

    if let Err(error) = state
        .access
        .authorize_device(DeviceAuthorizationRequest {
            device_id,
            device_token,
            expected_metric_type: reading.metric_type.clone(),
            expected_zone: reading.zone.clone(),
        })
        .await
    {
        state.health.record_rejected();
        return Err(error);
    }

    let reading = match state.telemetry.ingest(reading).await {
        Ok(reading) => reading,
        Err(error) => {
            state.health.record_rejected();
            return Err(error);
        }
    };

    state.health.record_accepted();

    match state.alerting.evaluate_reading(&reading).await {
        Ok(alerts) if !alerts.is_empty() => {
            tracing::info!(count = alerts.len(), "alerts triggered");
        }
        Err(error) => {
            record_ingestion_failure(&state, "alerting", &reading, &error).await;
            tracing::error!("alert evaluation failed: {error}");
        }
        _ => {}
    }

    if let Err(error) = state.distribution.aggregate_reading(&reading).await {
        record_ingestion_failure(&state, "aggregation", &reading, &error).await;
        tracing::error!("analytics materialization failed: {error}");
    }

    let snapshot = state.health.snapshot();
    let latency_ms = request_started_at.elapsed().as_secs_f64() * 1000.0;
    if let Err(error) = state
        .distribution
        .record_ingestion_health(
            snapshot.total_received,
            snapshot.total_accepted,
            snapshot.total_rejected,
            latency_ms,
        )
        .await
    {
        record_ingestion_failure(&state, "health_snapshot", &reading, &error).await;
        tracing::error!("platform status update failed: {error}");
    }

    Ok(Json(serde_json::json!({
        "status": "accepted",
        "sensor_id": reading.sensor_id,
    })))
}

/// GET /internal/health
async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    let snapshot = state.health.snapshot();
    Json(serde_json::json!(snapshot))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateRuleRequest {
    metric_type: MetricType,
    threshold_value: f64,
    comparison: Comparison,
    zone: Option<String>,
    created_by: Uuid,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateRuleStatusRequest {
    rule_status: RuleStatus,
    updated_by: Uuid,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteRuleRequest {
    deleted_by: Uuid,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AlertActorRequest {
    user_id: Uuid,
}

fn required_header(headers: &HeaderMap, name: &'static str) -> Result<String> {
    let value = headers
        .get(name)
        .ok_or_else(|| {
            scemas_core::error::Error::Unauthorized(format!("missing required header: {name}"))
        })?
        .to_str()
        .map_err(|_| {
            scemas_core::error::Error::Unauthorized(format!("invalid header encoding: {name}"))
        })?;

    Ok(value.to_owned())
}

async fn record_ingestion_failure(
    state: &AppState,
    stage: &str,
    reading: &IndividualSensorReading,
    error: &scemas_core::error::Error,
) {
    if let Err(record_error) = state
        .distribution
        .record_ingestion_failure(stage, reading, &error.to_string())
        .await
    {
        tracing::error!(
            stage,
            original_error = %error,
            record_error = %record_error,
            "failed to record ingestion failure"
        );
    }
}
