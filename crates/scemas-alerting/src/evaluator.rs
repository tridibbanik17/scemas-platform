// rule evaluator knowledge source (blackboard pattern)
//
// reads: sensor readings (from telemetry pipeline) + active rules (from blackboard)
// writes: new alerts (to blackboard + database)
//
// this is the "knowledge source" that determines if an alert should fire.

use scemas_core::models::{
    Alert, AlertStatus, Comparison, IndividualSensorReading, Severity, ThresholdRule,
};
use uuid::Uuid;

/// evaluate a reading against all active rules
/// returns alerts for any rules that are violated
pub fn evaluate<'a, I>(reading: &IndividualSensorReading, rules: I) -> Vec<Alert>
where
    I: IntoIterator<Item = &'a ThresholdRule>,
{
    rules
        .into_iter()
        .filter(|rule| matches_reading(rule, reading))
        .filter(|rule| threshold_exceeded(rule, reading))
        .map(|rule| create_alert(rule, reading))
        .collect()
}

fn matches_reading(rule: &ThresholdRule, reading: &IndividualSensorReading) -> bool {
    if rule.metric_type != reading.metric_type {
        return false;
    }
    if let Some(ref zone) = rule.zone
        && zone != &reading.zone
    {
        return false;
    }
    true
}

fn threshold_exceeded(rule: &ThresholdRule, reading: &IndividualSensorReading) -> bool {
    match rule.comparison {
        Comparison::Gt => reading.value > rule.threshold_value,
        Comparison::Lt => reading.value < rule.threshold_value,
        Comparison::Gte => reading.value >= rule.threshold_value,
        Comparison::Lte => reading.value <= rule.threshold_value,
    }
}

fn create_alert(rule: &ThresholdRule, reading: &IndividualSensorReading) -> Alert {
    let severity = classify_severity(rule, reading);

    Alert {
        id: Uuid::new_v4(),
        rule_id: rule.id,
        sensor_id: reading.sensor_id.clone(),
        severity,
        status: AlertStatus::Active,
        triggered_value: reading.value,
        zone: reading.zone.clone(),
        metric_type: reading.metric_type.clone(),
        created_at: chrono::Utc::now(),
    }
}

fn classify_severity(rule: &ThresholdRule, reading: &IndividualSensorReading) -> Severity {
    let ratio = reading.value / rule.threshold_value;
    if ratio > 1.5 {
        Severity::Critical
    } else if ratio > 1.2 {
        Severity::Warning
    } else {
        Severity::Low
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use scemas_core::models::{MetricType, RuleStatus};

    fn sample_rule() -> ThresholdRule {
        ThresholdRule {
            id: Uuid::new_v4(),
            metric_type: MetricType::Temperature,
            threshold_value: 35.0,
            comparison: Comparison::Gt,
            zone: Some("downtown".into()),
            rule_status: RuleStatus::Active,
        }
    }

    fn sample_reading(value: f64) -> IndividualSensorReading {
        IndividualSensorReading {
            sensor_id: "temp-dt-001".into(),
            metric_type: MetricType::Temperature,
            value,
            zone: "downtown".into(),
            timestamp: Utc::now(),
        }
    }

    #[test]
    fn evaluate_fires_when_threshold_exceeded() {
        let rules = vec![sample_rule()];
        let reading = sample_reading(40.0);
        let alerts = evaluate(&reading, &rules);
        assert_eq!(alerts.len(), 1);
    }

    #[test]
    fn evaluate_does_not_fire_below_threshold() {
        let rules = vec![sample_rule()];
        let reading = sample_reading(30.0);
        let alerts = evaluate(&reading, &rules);
        assert!(alerts.is_empty());
    }

    #[test]
    fn evaluate_ignores_wrong_zone() {
        let rules = vec![sample_rule()];
        let mut reading = sample_reading(40.0);
        reading.zone = "west_mountain".into();
        let alerts = evaluate(&reading, &rules);
        assert!(alerts.is_empty());
    }
}
