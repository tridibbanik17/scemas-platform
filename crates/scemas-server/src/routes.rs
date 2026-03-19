use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use scemas_core::models::IndividualSensorReading;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::state::AppState;

pub fn create_router(state: AppState) -> Router {
    Router::new()
        // internal API (called by tRPC, not by browser)
        .route("/internal/telemetry/ingest", post(ingest_telemetry))
        .route("/internal/health", get(health))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// POST /internal/telemetry/ingest
///
/// pipe-and-filter entry point: receives a sensor reading,
/// runs it through the validation pipeline, persists, then
/// triggers blackboard alert evaluation.
async fn ingest_telemetry(
    State(state): State<AppState>,
    Json(reading): Json<IndividualSensorReading>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    state.health.record_received();

    // pipe-and-filter: validate + persist
    let reading = state.telemetry.ingest(reading).await.map_err(|e| {
        state.health.record_rejected();
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
    })?;

    state.health.record_accepted();

    // blackboard: evaluate rules against the new reading
    let mut alerting = state.alerting.write().await;
    match alerting.evaluate_reading(&reading).await {
        Ok(alerts) if !alerts.is_empty() => {
            tracing::info!(count = alerts.len(), "alerts triggered");
        }
        Err(e) => {
            tracing::error!("alert evaluation failed: {e}");
        }
        _ => {}
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
