// AlertingManager controller (from class diagram)
//
// coordinates the blackboard pattern:
// 1. receives new telemetry from the pipe-and-filter output
// 2. evaluates against active rules (knowledge source: evaluator)
// 3. posts alerts to the blackboard
// 4. triggers notification dispatch (knowledge source: dispatcher)

use scemas_core::error::Result;
use scemas_core::models::{Alert, IndividualSensorReading, ThresholdRule};
use sqlx::PgPool;
use uuid::Uuid;

use crate::blackboard::Blackboard;
use crate::evaluator;

pub struct AlertingManager {
    db: PgPool,
    pub blackboard: Blackboard,
}

impl AlertingManager {
    pub fn new(db: PgPool) -> Self {
        Self {
            db,
            blackboard: Blackboard::new(),
        }
    }

    /// load active rules from database into the blackboard
    pub async fn load_rules(&mut self) -> Result<()> {
        let rows: Vec<ThresholdRuleRow> = sqlx::query_as(
            "SELECT id, metric_type, threshold_value, comparison, zone, rule_status FROM threshold_rules WHERE rule_status = 'active'"
        )
        .fetch_all(&self.db)
        .await?;

        self.blackboard.active_rules = rows
            .into_iter()
            .filter_map(|r: ThresholdRuleRow| r.try_into().ok())
            .collect();
        Ok(())
    }

    /// evaluate a reading against the blackboard's active rules
    /// this is the core blackboard interaction: knowledge sources reading shared state
    pub async fn evaluate_reading(
        &mut self,
        reading: &IndividualSensorReading,
    ) -> Result<Vec<Alert>> {
        let alerts = evaluator::evaluate(reading, &self.blackboard.active_rules);

        for alert in &alerts {
            // post to blackboard (in-memory)
            self.blackboard.post_alert(alert.clone());

            // persist to database
            self.persist_alert(alert).await?;
        }

        Ok(alerts)
    }

    async fn persist_alert(&self, alert: &Alert) -> Result<()> {
        sqlx::query(
            "INSERT INTO alerts (id, rule_id, sensor_id, severity, status, triggered_value, zone, metric_type, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
        )
        .bind(alert.id)
        .bind(alert.rule_id)
        .bind(&alert.sensor_id)
        .bind(alert.severity as i32)
        .bind(serde_json::to_string(&alert.status).unwrap_or_default().trim_matches('"'))
        .bind(alert.triggered_value)
        .bind(&alert.zone)
        .bind(alert.metric_type.to_string())
        .bind(alert.created_at)
        .execute(&self.db)
        .await?;

        Ok(())
    }
}

// internal row type for sqlx deserialization
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
