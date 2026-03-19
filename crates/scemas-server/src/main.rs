use scemas_core::config::Config;
use std::sync::Arc;
use tokio::sync::RwLock;

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

    let telemetry = scemas_telemetry::controller::TelemetryManager::new(pool.clone());
    let mut alerting = scemas_alerting::controller::AlertingManager::new(pool.clone());

    // load active rules into the blackboard on startup
    if let Err(e) = alerting.load_rules().await {
        tracing::warn!("failed to load alert rules: {e}");
    }

    let state = state::AppState {
        db: pool,
        telemetry: Arc::new(telemetry),
        alerting: Arc::new(RwLock::new(alerting)),
        health: Arc::new(scemas_telemetry::health::IngestionHealth::new()),
    };

    let app = routes::create_router(state);

    let addr = format!("0.0.0.0:{}", config.port);
    tracing::info!("rust engine listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
