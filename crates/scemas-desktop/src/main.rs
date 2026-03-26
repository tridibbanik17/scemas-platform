#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod commands;
mod error;
mod notifications;
mod postgres;
pub mod queries;
mod sync;
mod tray;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use auth::RemoteAuth;
use postgres::EmbeddedPostgres;
use scemas_core::config::Config;
use scemas_server::ScemasRuntime;
use tauri::Manager;
use tokio::sync::{Mutex, watch};

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env().add_directive(
                "sqlx_postgres::options::parse=error"
                    .parse()
                    .expect("valid directive"),
            ),
        )
        .try_init()
        .ok();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle().clone();

            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app data dir must be resolvable");
            std::fs::create_dir_all(&data_dir)?;

            let repo_root = find_repo_root();

            let device_catalog = app
                .path()
                .resolve(
                    "data/hamilton-sensor-catalog.json",
                    tauri::path::BaseDirectory::Resource,
                )
                .ok()
                .filter(|p| p.exists())
                .unwrap_or_else(|| repo_root.join("data/hamilton-sensor-catalog.json"));

            let schema_sql = app
                .path()
                .resolve("resources/schema.sql", tauri::path::BaseDirectory::Resource)
                .ok()
                .filter(|p| p.exists())
                .unwrap_or_else(|| repo_root.join("crates/scemas-desktop/resources/schema.sql"));

            let secrets = load_or_generate_secrets(&data_dir);

            let remote_url = std::env::var("INTERNAL_RUST_URL")
                .or_else(|_| std::env::var("SCEMAS_REMOTE_URL"))
                .unwrap_or_else(|_| "http://localhost:3001".to_string());
            let remote_auth = Arc::new(RemoteAuth::new(remote_url));
            app.manage(Arc::clone(&remote_auth));

            let (shutdown_tx, shutdown_rx) = watch::channel(false);
            app.manage(ShutdownSignal(shutdown_tx));

            let remote_db_url = std::env::var("SCEMAS_REMOTE_DB_URL").ok();

            tauri::async_runtime::block_on(async move {
                // postgres mode: DATABASE_URL takes priority (dev, docker-compose, nix).
                // if DATABASE_URL is not set, start embedded postgres as fallback.
                let database_url = if let Ok(url) = std::env::var("DATABASE_URL") {
                    tracing::info!(url = %url, "using DATABASE_URL");
                    url
                } else {
                    // start embedded postgres
                    let bundled_pg = app_handle
                        .path()
                        .resolve("resources/pg/bin", tauri::path::BaseDirectory::Resource)
                        .ok()
                        .filter(|p| p.join("pg_ctl").exists());
                    let pg_bin_dir = find_pg_bin_dir(bundled_pg.as_deref()).expect(
                        "postgres not found. either:\n  \
                             - set POSTGRES_BIN_DIR to your postgres bin directory\n  \
                             - ensure pg_ctl is in PATH (e.g. `nix develop`)\n  \
                             - install postgres: brew install postgresql@16",
                    );

                    let pg_port = find_available_port();
                    let pg =
                        EmbeddedPostgres::start(&pg_bin_dir, data_dir.clone(), pg_port, "scemas")
                            .await
                            .expect("failed to start embedded postgres");

                    let url = pg.connection_url();
                    tracing::info!(url = %url, "started embedded postgres");

                    pg.apply_schema(&schema_sql)
                        .await
                        .expect("failed to apply schema");

                    app_handle.manage(Arc::new(Mutex::new(pg)));
                    url
                };

                let config = Config::new(
                    database_url,
                    secrets.jwt_secret,
                    secrets.device_auth_secret,
                    device_catalog.to_string_lossy().to_string(),
                );

                let runtime = ScemasRuntime::from_config(&config)
                    .await
                    .expect("failed to connect to database");

                ensure_default_accounts(&runtime).await;

                let sync_pool = runtime.pool.clone();
                app_handle.manage(runtime);

                let (mut sync_svc, sync_trigger) = sync::SyncService::new(
                    remote_auth,
                    sync_pool,
                    remote_db_url,
                    Duration::from_secs(300),
                    shutdown_rx,
                );
                app_handle.manage(sync_trigger);
                tauri::async_runtime::spawn(async move {
                    sync_svc.run().await;
                });
            });

            tray::create_tray(app.handle())?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::local::telemetry_ingest,
            commands::local::rules_create,
            commands::local::rules_edit,
            commands::local::rules_update_status,
            commands::local::rules_delete,
            commands::local::alerts_acknowledge,
            commands::local::alerts_resolve,
            commands::local::alerts_batch_resolve,
            commands::local::alerts_batch_acknowledge,
            commands::local::tokens_create,
            commands::local::health_get,
            commands::local::subscriptions_update,
            commands::local::reports_submit,
            commands::local::reports_update_status,
            commands::reads::telemetry_get_by_zone,
            commands::reads::telemetry_get_latest,
            commands::reads::telemetry_time_series,
            commands::reads::alerts_list,
            commands::reads::alerts_get,
            commands::reads::alerts_count,
            commands::reads::alerts_frequency,
            commands::reads::rules_list,
            commands::reads::users_list,
            commands::reads::users_get,
            commands::reads::users_active_sessions,
            commands::reads::devices_list,
            commands::reads::devices_get,
            commands::reads::audit_list,
            commands::reads::audit_count,
            commands::reads::audit_frequency,
            commands::reads::health_status,
            commands::reads::ingestion_failures_list,
            commands::reads::subscriptions_get,
            commands::reads::reports_list,
            commands::reads::public_zone_summary,
            commands::reads::public_feed_status,
            commands::reads::public_zone_history,
            commands::remote::auth_login,
            commands::remote::auth_signup,
            commands::remote::tray_set_auth,
        ])
        .build(tauri::generate_context!())
        .expect("error building tauri application");

    // graceful shutdown: drain runtime + stop embedded postgres
    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            tracing::info!("exit requested, draining...");

            if let Some(signal) = app_handle.try_state::<ShutdownSignal>() {
                let _ = signal.0.send(true);
            }

            tauri::async_runtime::block_on(async {
                if let Some(runtime) = app_handle.try_state::<ScemasRuntime>() {
                    runtime.drain().await;
                    tracing::info!("runtime drained");
                }
                if let Some(pg) = app_handle.try_state::<Arc<Mutex<EmbeddedPostgres>>>() {
                    let mut pg = pg.lock().await;
                    if let Err(e) = pg.stop().await {
                        tracing::warn!("postgres stop error: {e}");
                    }
                }
            });
        }
    });
}

// --- helpers ---

#[allow(dead_code)]
struct ShutdownSignal(watch::Sender<bool>);

#[derive(serde::Serialize, serde::Deserialize)]
struct Secrets {
    jwt_secret: String,
    device_auth_secret: String,
}

fn load_or_generate_secrets(data_dir: &std::path::Path) -> Secrets {
    let secrets_path = data_dir.join("secrets.json");

    if secrets_path.exists()
        && let Ok(data) = std::fs::read_to_string(&secrets_path)
        && let Ok(secrets) = serde_json::from_str::<Secrets>(&data)
    {
        return secrets;
    }

    let jwt: [u8; 32] = rand::random();
    let device: [u8; 32] = rand::random();

    fn to_hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    let secrets = Secrets {
        jwt_secret: to_hex(&jwt),
        device_auth_secret: to_hex(&device),
    };

    if let Ok(json) = serde_json::to_string_pretty(&secrets) {
        let _ = std::fs::write(&secrets_path, json);
        tracing::info!("generated new secrets at {}", secrets_path.display());
    }

    secrets
}

async fn ensure_default_accounts(runtime: &ScemasRuntime) {
    use scemas_server::access::SignupRequest;

    let defaults = [
        ("admin@example.com", "admin", "1234"),
        ("operator@example.com", "operator", "1234"),
        ("viewer@example.com", "viewer", "1234"),
    ];

    for (email, username, password) in defaults {
        match runtime
            .access
            .signup(SignupRequest {
                email: email.to_string(),
                username: username.to_string(),
                password: password.to_string(),
            })
            .await
        {
            Ok(_) => tracing::info!(email, "created default account"),
            Err(scemas_core::error::Error::Validation(_)) => {}
            Err(e) => tracing::warn!(email, "failed to create default account: {e}"),
        }
    }

    let _ = ::sqlx::query("UPDATE accounts SET role = 'admin' WHERE email = 'admin@example.com'")
        .execute(&runtime.pool)
        .await;
    let _ = ::sqlx::query("UPDATE accounts SET role = 'viewer' WHERE email = 'viewer@example.com'")
        .execute(&runtime.pool)
        .await;
}

fn find_repo_root() -> PathBuf {
    let compile_time = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(root) = compile_time.parent().and_then(|p| p.parent())
        && root.join("data").exists()
    {
        return root.to_path_buf();
    }

    if let Ok(cwd) = std::env::current_dir() {
        let mut dir = cwd.as_path();
        loop {
            if dir.join("Cargo.toml").exists() && dir.join("data").exists() {
                return dir.to_path_buf();
            }
            match dir.parent() {
                Some(parent) => dir = parent,
                None => break,
            }
        }
    }

    PathBuf::from(".")
}

fn find_available_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .expect("bind to port 0")
        .local_addr()
        .expect("local addr")
        .port()
}

/// find postgres bin directory. checks: bundled resource, POSTGRES_BIN_DIR env, PATH, well-known locations.
fn find_pg_bin_dir(bundled: Option<&std::path::Path>) -> Option<PathBuf> {
    if let Some(dir) = bundled {
        tracing::info!(dir = %dir.display(), "using bundled postgres from app resources");
        return Some(dir.to_path_buf());
    }

    if let Ok(dir) = std::env::var("POSTGRES_BIN_DIR") {
        let p = PathBuf::from(&dir);
        if p.join("pg_ctl").exists() {
            tracing::info!(dir = %dir, "found postgres via POSTGRES_BIN_DIR");
            return Some(p);
        }
    }

    if let Ok(path_var) = std::env::var("PATH") {
        for dir in path_var.split(':') {
            let candidate = PathBuf::from(dir);
            if candidate.join("pg_ctl").exists() {
                tracing::info!(dir = %candidate.display(), "found postgres in PATH");
                return Some(candidate);
            }
        }
    }

    let candidates = [
        "/opt/homebrew/opt/postgresql@16/bin",
        "/usr/local/opt/postgresql@16/bin",
        "/usr/lib/postgresql/16/bin",
    ];
    for dir in candidates {
        let p = PathBuf::from(dir);
        if p.join("pg_ctl").exists() {
            tracing::info!(dir, "found postgres at well-known location");
            return Some(p);
        }
    }

    None
}
