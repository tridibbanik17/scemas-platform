// blackboard shared state (from D2 architecture: alerting management uses blackboard pattern)
//
// the blackboard is a shared data structure that multiple "knowledge sources" read and write:
// - evaluator: reads rules + readings, writes alerts
// - dispatcher: reads pending notifications, writes delivery status
// - lifecycle: reads alerts, writes state transitions
//
// in this simplified implementation the blackboard is a plain struct.
// synchronous access is fine at demo throughput.

use scemas_core::models::{Alert, ThresholdRule};
use std::collections::HashMap;
use uuid::Uuid;

/// shared state for the alerting subsystem
/// this IS the blackboard: a data store that knowledge sources post to and read from
pub struct Blackboard {
    pub active_rules: Vec<ThresholdRule>,
    pub active_alerts: HashMap<Uuid, Alert>,
}

impl Blackboard {
    pub fn new() -> Self {
        Self {
            active_rules: Vec::new(),
            active_alerts: HashMap::new(),
        }
    }

    pub fn add_rule(&mut self, rule: ThresholdRule) {
        self.active_rules.push(rule);
    }

    pub fn post_alert(&mut self, alert: Alert) {
        self.active_alerts.insert(alert.id, alert);
    }

    pub fn get_alert(&self, id: &Uuid) -> Option<&Alert> {
        self.active_alerts.get(id)
    }
}

impl Default for Blackboard {
    fn default() -> Self {
        Self::new()
    }
}
