use scemas_core::config::Config;
use std::sync::Arc;

mod access;
mod distribution;
mod routes;
mod state;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = Config::from_env().expect("failed to load config");
    let pool = sqlx::PgPool::connect(&config.database_url).await?;

    tracing::info!("connected to database");

    let access = access::AccessManager::new(
        pool.clone(),
        config.jwt_secret.clone(),
        config.jwt_expiry_hours,
        config.device_auth_secret.clone(),
    );
    let registered_devices = access
        .sync_device_registry(&config.device_catalog_path)
        .await?;
    tracing::info!(registered_devices, "device registry synchronized");
    let distribution = distribution::DataDistributionManager::new(pool.clone());
    let telemetry = scemas_telemetry::controller::TelemetryManager::new(pool.clone());
    let alerting = scemas_alerting::controller::AlertingManager::new(pool.clone());

    // load active rules into the blackboard on startup
    if let Err(e) = alerting.load_rules().await {
        tracing::warn!("failed to load alert rules: {e}");
    }

    let (base_recv, base_accepted, base_rejected) = distribution.load_ingestion_counters().await?;
    tracing::info!(
        base_recv,
        base_accepted,
        base_rejected,
        "restored ingestion counters"
    );

    let state = state::AppState {
        access: Arc::new(access),
        distribution: Arc::new(distribution),
        telemetry: Arc::new(telemetry),
        alerting: Arc::new(alerting),
        health: Arc::new(
            scemas_telemetry::health::IngestionHealth::new_with_baseline(
                base_recv,
                base_accepted,
                base_rejected,
            ),
        ),
    };

    let app = routes::create_router(state);

    let addr = format!("0.0.0.0:{}", config.port);
    tracing::info!("rust engine listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
