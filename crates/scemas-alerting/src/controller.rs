// AlertingManager controller (from class diagram)
//
// coordinates the blackboard pattern:
// 1. receives new telemetry from the pipe-and-filter output
// 2. evaluates against active rules (knowledge source: evaluator)
// 3. posts alerts to the blackboard
// 4. triggers notification dispatch (knowledge source: dispatcher)

use chrono::Utc;
use scemas_core::error::{Error, Result};
use scemas_core::models::{
    Alert, AlertStatus, AlertSubscription, Comparison, IndividualSensorReading, MetricType,
    RuleStatus, Severity, ThresholdRule,
};
use sqlx::PgPool;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::blackboard::Blackboard;
use crate::dispatcher;
use crate::evaluator;
use crate::lifecycle;

pub struct AlertingManager {
    db: PgPool,
    blackboard: RwLock<Blackboard>,
}

impl AlertingManager {
    pub fn new(db: PgPool) -> Self {
        Self {
            db,
            blackboard: RwLock::new(Blackboard::new()),
        }
    }

    /// load active rules from database into the blackboard
    pub async fn load_rules(&self) -> Result<()> {
        let rows: Vec<ThresholdRuleRow> = sqlx::query_as(
            "SELECT id, metric_type, threshold_value, comparison, zone, rule_status FROM threshold_rules WHERE rule_status = 'active'"
        )
        .fetch_all(&self.db)
        .await?;

        self.blackboard.write().await.replace_rules(
            rows.into_iter()
                .filter_map(|row: ThresholdRuleRow| row.try_into().ok()),
        );
        Ok(())
    }

    /// evaluate a reading against the blackboard's active rules
    pub async fn evaluate_reading(&self, reading: &IndividualSensorReading) -> Result<Vec<Alert>> {
        let active_rules: Vec<ThresholdRule> = self
            .blackboard
            .read()
            .await
            .active_rules
            .values()
            .cloned()
            .collect();
        let alerts = evaluator::evaluate(reading, active_rules.iter());

        for alert in &alerts {
            self.persist_alert(alert).await?;
        }

        let mut blackboard = self.blackboard.write().await;
        for alert in &alerts {
            blackboard.post_alert(alert.clone());
        }

        // knowledge source 3: dispatcher — notify matching subscribers (best-effort)
        if !alerts.is_empty() {
            self.dispatch_alerts(&alerts).await.ok();
        }

        Ok(alerts)
    }

    pub async fn create_rule(
        &self,
        metric_type: MetricType,
        threshold_value: f64,
        comparison: Comparison,
        zone: Option<String>,
        created_by: Uuid,
    ) -> Result<ThresholdRule> {
        let row: ThresholdRuleRow = sqlx::query_as(
            "INSERT INTO threshold_rules (metric_type, threshold_value, comparison, zone, rule_status, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, metric_type, threshold_value, comparison, zone, rule_status",
        )
        .bind(metric_type.to_string())
        .bind(threshold_value)
        .bind(comparison_label(&comparison))
        .bind(&zone)
        .bind(rule_status_label(&RuleStatus::Active))
        .bind(created_by)
        .fetch_one(&self.db)
        .await?;

        let rule = row.try_into_rule()?;
        self.blackboard.write().await.upsert_rule(rule.clone());
        self.insert_audit_log(
            Some(created_by),
            "rule.created",
            serde_json::json!({
                "ruleId": rule.id,
                "metricType": metric_type.to_string(),
                "thresholdValue": threshold_value,
                "comparison": comparison_label(&comparison),
                "zone": zone,
            }),
        )
        .await?;

        Ok(rule)
    }

    pub async fn update_rule_status(
        &self,
        rule_id: Uuid,
        rule_status: RuleStatus,
        updated_by: Uuid,
    ) -> Result<()> {
        let row: ThresholdRuleRow = sqlx::query_as(
            "UPDATE threshold_rules SET rule_status = $1 WHERE id = $2 RETURNING id, metric_type, threshold_value, comparison, zone, rule_status",
        )
        .bind(rule_status_label(&rule_status))
        .bind(rule_id)
        .fetch_one(&self.db)
        .await?;

        let rule = row.try_into_rule()?;
        let mut blackboard = self.blackboard.write().await;
        match rule.rule_status {
            RuleStatus::Active => blackboard.upsert_rule(rule),
            RuleStatus::Inactive => blackboard.remove_rule(&rule_id),
        }

        self.insert_audit_log(
            Some(updated_by),
            "rule.updated",
            serde_json::json!({
                "ruleId": rule_id,
                "ruleStatus": rule_status_label(&rule_status),
            }),
        )
        .await?;

        Ok(())
    }

    pub async fn delete_rule(&self, rule_id: Uuid, deleted_by: Uuid) -> Result<()> {
        sqlx::query("DELETE FROM threshold_rules WHERE id = $1")
            .bind(rule_id)
            .execute(&self.db)
            .await?;

        self.blackboard.write().await.remove_rule(&rule_id);
        self.insert_audit_log(
            Some(deleted_by),
            "rule.deleted",
            serde_json::json!({
                "ruleId": rule_id,
            }),
        )
        .await?;

        Ok(())
    }

    pub async fn acknowledge_alert(&self, alert_id: Uuid, user_id: Uuid) -> Result<()> {
        self.transition_alert(
            alert_id,
            AlertStatus::Acknowledged,
            user_id,
            "alert.acknowledged",
        )
        .await
    }

    pub async fn resolve_alert(&self, alert_id: Uuid, user_id: Uuid) -> Result<()> {
        self.transition_alert(alert_id, AlertStatus::Resolved, user_id, "alert.resolved")
            .await
    }

    async fn persist_alert(&self, alert: &Alert) -> Result<()> {
        sqlx::query(
            "INSERT INTO alerts (id, rule_id, sensor_id, severity, status, triggered_value, zone, metric_type, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
        )
        .bind(alert.id)
        .bind(alert.rule_id)
        .bind(&alert.sensor_id)
        .bind(alert.severity as i32)
        .bind(alert_status_label(&alert.status))
        .bind(alert.triggered_value)
        .bind(&alert.zone)
        .bind(alert.metric_type.to_string())
        .bind(alert.created_at)
        .execute(&self.db)
        .await?;

        Ok(())
    }

    async fn transition_alert(
        &self,
        alert_id: Uuid,
        next_status: AlertStatus,
        user_id: Uuid,
        audit_action: &str,
    ) -> Result<()> {
        let current_status =
            sqlx::query_scalar::<_, String>("SELECT status FROM alerts WHERE id = $1")
                .bind(alert_id)
                .fetch_optional(&self.db)
                .await?
                .ok_or_else(|| Error::NotFound(format!("alert {alert_id} was not found")))?;

        let current_status = parse_alert_status(&current_status)?;
        if !lifecycle::can_transition(&current_status, &next_status) {
            return Err(Error::Validation(format!(
                "cannot transition alert {alert_id} from {} to {}",
                alert_status_label(&current_status),
                alert_status_label(&next_status),
            )));
        }

        let acknowledged_by = if next_status == AlertStatus::Acknowledged {
            Some(user_id)
        } else {
            None
        };
        let acknowledged_at = if next_status == AlertStatus::Acknowledged {
            Some(Utc::now())
        } else {
            None
        };
        let resolved_at = if next_status == AlertStatus::Resolved {
            Some(Utc::now())
        } else {
            None
        };

        sqlx::query(
            "UPDATE alerts SET status = $1, acknowledged_by = COALESCE($2, acknowledged_by), acknowledged_at = COALESCE($3, acknowledged_at), resolved_at = COALESCE($4, resolved_at) WHERE id = $5",
        )
        .bind(alert_status_label(&next_status))
        .bind(acknowledged_by)
        .bind(acknowledged_at)
        .bind(resolved_at)
        .bind(alert_id)
        .execute(&self.db)
        .await?;

        let mut blackboard = self.blackboard.write().await;
        if let Some(mut alert) = blackboard.get_alert(&alert_id).cloned() {
            alert.status = next_status.clone();
            blackboard.post_alert(alert);
        }

        self.insert_audit_log(
            Some(user_id),
            audit_action,
            serde_json::json!({
                "alertId": alert_id,
                "status": alert_status_label(&next_status),
            }),
        )
        .await?;

        Ok(())
    }

    async fn load_subscriptions(&self) -> Result<Vec<AlertSubscription>> {
        let rows: Vec<AlertSubscriptionRow> = sqlx::query_as(
            "SELECT id, user_id, metric_types, zones, min_severity FROM alert_subscriptions",
        )
        .fetch_all(&self.db)
        .await?;

        Ok(rows.into_iter().filter_map(|row| row.try_into().ok()).collect())
    }

    async fn dispatch_alerts(&self, alerts: &[Alert]) -> Result<()> {
        let subscriptions = self.load_subscriptions().await?;
        for alert in alerts {
            let subscribers = dispatcher::find_subscribers(alert, &subscriptions);
            for sub in subscribers {
                self.insert_audit_log(
                    None,
                    "alert.dispatched",
                    serde_json::json!({
                        "alertId": alert.id,
                        "userId": sub.user_id,
                        "zone": &alert.zone,
                        "metricType": alert.metric_type.to_string(),
                        "severity": alert.severity as i32,
                    }),
                )
                .await
                .ok();
            }
        }
        Ok(())
    }

    async fn insert_audit_log(
        &self,
        user_id: Option<Uuid>,
        action: &str,
        details: serde_json::Value,
    ) -> Result<()> {
        sqlx::query("INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)")
            .bind(user_id)
            .bind(action)
            .bind(details)
            .execute(&self.db)
            .await?;

        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct ThresholdRuleRow {
    id: Uuid,
    metric_type: String,
    threshold_value: f64,
    comparison: String,
    zone: Option<String>,
    rule_status: String,
}

impl TryFrom<ThresholdRuleRow> for ThresholdRule {
    type Error = String;

    fn try_from(row: ThresholdRuleRow) -> std::result::Result<Self, Self::Error> {
        use scemas_core::models::{Comparison, MetricType, RuleStatus};

        let metric_type = match row.metric_type.as_str() {
            "temperature" => MetricType::Temperature,
            "humidity" => MetricType::Humidity,
            "air_quality" => MetricType::AirQuality,
            "noise_level" => MetricType::NoiseLevel,
            other => return Err(format!("unknown metric type: {other}")),
        };

        let comparison = match row.comparison.as_str() {
            "gt" => Comparison::Gt,
            "lt" => Comparison::Lt,
            "gte" => Comparison::Gte,
            "lte" => Comparison::Lte,
            other => return Err(format!("unknown comparison: {other}")),
        };

        let rule_status = match row.rule_status.as_str() {
            "active" => RuleStatus::Active,
            "inactive" => RuleStatus::Inactive,
            other => return Err(format!("unknown rule status: {other}")),
        };

        Ok(ThresholdRule {
            id: row.id,
            metric_type,
            threshold_value: row.threshold_value,
            comparison,
            zone: row.zone,
            rule_status,
        })
    }
}

impl ThresholdRuleRow {
    fn try_into_rule(self) -> Result<ThresholdRule> {
        self.try_into()
            .map_err(|error: String| Error::Internal(error))
    }
}

#[derive(sqlx::FromRow)]
struct AlertSubscriptionRow {
    id: Uuid,
    user_id: Uuid,
    metric_types: Option<Vec<String>>,
    zones: Option<Vec<String>>,
    min_severity: Option<i32>,
}

impl TryFrom<AlertSubscriptionRow> for AlertSubscription {
    type Error = String;

    fn try_from(row: AlertSubscriptionRow) -> std::result::Result<Self, Self::Error> {
        let metric_types: Vec<MetricType> = row
            .metric_types
            .unwrap_or_default()
            .iter()
            .filter_map(|s| match s.as_str() {
                "temperature" => Some(MetricType::Temperature),
                "humidity" => Some(MetricType::Humidity),
                "air_quality" => Some(MetricType::AirQuality),
                "noise_level" => Some(MetricType::NoiseLevel),
                _ => None,
            })
            .collect();

        let min_severity = match row.min_severity.unwrap_or(1) {
            3 => Severity::Critical,
            2 => Severity::Warning,
            _ => Severity::Low,
        };

        Ok(AlertSubscription {
            id: row.id,
            user_id: row.user_id,
            metric_types,
            zones: row.zones.unwrap_or_default(),
            min_severity,
        })
    }
}

fn comparison_label(comparison: &Comparison) -> &'static str {
    match comparison {
        Comparison::Gt => "gt",
        Comparison::Lt => "lt",
        Comparison::Gte => "gte",
        Comparison::Lte => "lte",
    }
}

fn rule_status_label(rule_status: &RuleStatus) -> &'static str {
    match rule_status {
        RuleStatus::Active => "active",
        RuleStatus::Inactive => "inactive",
    }
}

fn alert_status_label(alert_status: &AlertStatus) -> &'static str {
    match alert_status {
        AlertStatus::Triggered => "triggered",
        AlertStatus::Active => "active",
        AlertStatus::Acknowledged => "acknowledged",
        AlertStatus::Resolved => "resolved",
    }
}

fn parse_alert_status(value: &str) -> Result<AlertStatus> {
    match value {
        "triggered" => Ok(AlertStatus::Triggered),
        "active" => Ok(AlertStatus::Active),
        "acknowledged" => Ok(AlertStatus::Acknowledged),
        "resolved" => Ok(AlertStatus::Resolved),
        other => Err(Error::Internal(format!("unknown alert status: {other}"))),
    }
}
