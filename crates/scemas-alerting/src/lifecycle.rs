// alert lifecycle state machine
// from class diagram: triggered → active → acknowledged → resolved

use scemas_core::models::AlertStatus;

/// valid state transitions for alerts
pub fn can_transition(from: &AlertStatus, to: &AlertStatus) -> bool {
    matches!(
        (from, to),
        (AlertStatus::Triggered, AlertStatus::Active)
            | (AlertStatus::Active, AlertStatus::Acknowledged)
            | (AlertStatus::Acknowledged, AlertStatus::Resolved)
            // direct resolution from active is also valid (auto-resolve)
            | (AlertStatus::Active, AlertStatus::Resolved)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_transitions() {
        assert!(can_transition(
            &AlertStatus::Triggered,
            &AlertStatus::Active
        ));
        assert!(can_transition(
            &AlertStatus::Active,
            &AlertStatus::Acknowledged
        ));
        assert!(can_transition(
            &AlertStatus::Acknowledged,
            &AlertStatus::Resolved
        ));
        assert!(can_transition(&AlertStatus::Active, &AlertStatus::Resolved));
    }

    #[test]
    fn invalid_transitions() {
        assert!(!can_transition(
            &AlertStatus::Triggered,
            &AlertStatus::Resolved
        ));
        assert!(!can_transition(
            &AlertStatus::Acknowledged,
            &AlertStatus::Active
        ));
        assert!(!can_transition(
            &AlertStatus::Resolved,
            &AlertStatus::Triggered
        ));
    }
}
