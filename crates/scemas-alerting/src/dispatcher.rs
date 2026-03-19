// DispatchAlertNotifications boundary (from class diagram)
//
// knowledge source in the blackboard pattern: reads new alerts,
// checks subscriptions, dispatches notifications to relevant operators.
//
// in this simplified version, "dispatch" means marking the notification
// in the database. a real system would send emails/webhooks.

use scemas_core::models::{Alert, AlertSubscription};

/// check if an alert matches an operator's subscription preferences
pub fn matches_subscription(alert: &Alert, sub: &AlertSubscription) -> bool {
    if (alert.severity as i32) < (sub.min_severity as i32) {
        return false;
    }

    if !sub.metric_types.is_empty() && !sub.metric_types.contains(&alert.metric_type) {
        return false;
    }

    if !sub.zones.is_empty() && !sub.zones.contains(&alert.zone) {
        return false;
    }

    true
}

/// determine which operators should be notified for this alert
pub fn find_subscribers<'a>(
    alert: &Alert,
    subscriptions: &'a [AlertSubscription],
) -> Vec<&'a AlertSubscription> {
    subscriptions
        .iter()
        .filter(|sub| matches_subscription(alert, sub))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use scemas_core::models::{AlertStatus, MetricType, Severity};
    use uuid::Uuid;

    fn sample_alert() -> Alert {
        Alert {
            id: Uuid::new_v4(),
            rule_id: Uuid::new_v4(),
            sensor_id: "temp-dt-001".into(),
            severity: Severity::Warning,
            status: AlertStatus::Active,
            triggered_value: 38.0,
            zone: "downtown".into(),
            metric_type: MetricType::Temperature,
            created_at: chrono::Utc::now(),
        }
    }

    fn sample_subscription() -> AlertSubscription {
        AlertSubscription {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            metric_types: vec![MetricType::Temperature],
            zones: vec!["downtown".into()],
            min_severity: Severity::Low,
        }
    }

    #[test]
    fn matches_when_all_criteria_met() {
        let alert = sample_alert();
        let sub = sample_subscription();
        assert!(matches_subscription(&alert, &sub));
    }

    #[test]
    fn does_not_match_wrong_zone() {
        let alert = sample_alert();
        let mut sub = sample_subscription();
        sub.zones = vec!["west_mountain".into()];
        assert!(!matches_subscription(&alert, &sub));
    }

    #[test]
    fn does_not_match_low_severity() {
        let mut alert = sample_alert();
        alert.severity = Severity::Low;
        let mut sub = sample_subscription();
        sub.min_severity = Severity::Critical;
        assert!(!matches_subscription(&alert, &sub));
    }
}
