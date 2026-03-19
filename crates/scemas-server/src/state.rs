use crate::access::AccessManager;
use crate::distribution::DataDistributionManager;
use scemas_alerting::controller::AlertingManager;
use scemas_telemetry::controller::TelemetryManager;
use scemas_telemetry::health::IngestionHealth;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub access: Arc<AccessManager>,
    pub distribution: Arc<DataDistributionManager>,
    pub telemetry: Arc<TelemetryManager>,
    pub alerting: Arc<AlertingManager>,
    pub health: Arc<IngestionHealth>,
}
