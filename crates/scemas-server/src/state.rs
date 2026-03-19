use scemas_alerting::controller::AlertingManager;
use scemas_telemetry::controller::TelemetryManager;
use scemas_telemetry::health::IngestionHealth;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub telemetry: Arc<TelemetryManager>,
    pub alerting: Arc<RwLock<AlertingManager>>,
    pub health: Arc<IngestionHealth>,
}
