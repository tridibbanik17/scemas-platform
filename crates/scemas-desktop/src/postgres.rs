//! embedded postgres lifecycle management.
//! fallback mode when DATABASE_URL is not set.
//! manages initdb, start, stop, schema apply, and stale PID cleanup.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;

#[derive(Debug, thiserror::Error)]
pub enum PgError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("database setup: {0}")]
    Setup(String),

    #[error("postgres not found at {0}")]
    NotFound(PathBuf),
}

pub struct EmbeddedPostgres {
    pg_bin_dir: PathBuf,
    pg_lib_dir: Option<PathBuf>,
    pg_ctl: PathBuf,
    data_dir: PathBuf,
    port: u16,
    database: String,
}

fn pg_cmd(bin: &Path, lib_dir: &Option<PathBuf>) -> Command {
    let mut cmd = Command::new(bin);
    if let Some(lib) = lib_dir {
        let key = if cfg!(target_os = "macos") {
            "DYLD_LIBRARY_PATH"
        } else {
            "LD_LIBRARY_PATH"
        };
        cmd.env(key, lib);
    }
    cmd
}

impl EmbeddedPostgres {
    pub async fn start(
        pg_bin_dir: &Path,
        data_dir: PathBuf,
        port: u16,
        database: &str,
    ) -> Result<Self, PgError> {
        let initdb = pg_bin_dir.join("initdb");
        let pg_ctl = pg_bin_dir.join("pg_ctl");
        let createdb = pg_bin_dir.join("createdb");

        if !pg_ctl.exists() {
            return Err(PgError::NotFound(pg_ctl));
        }

        let pg_lib_dir = {
            let lib = pg_bin_dir.parent().map(|p| p.join("lib"));
            lib.filter(|p| p.exists())
        };

        let pg_data = data_dir.join("pg-data");
        std::fs::create_dir_all(&pg_data)?;

        // initdb if fresh
        if !pg_data.join("PG_VERSION").exists() {
            tracing::info!(?pg_data, "initializing postgres data directory");
            let output = pg_cmd(&initdb, &pg_lib_dir)
                .arg("-D")
                .arg(&pg_data)
                .arg("--no-locale")
                .arg("--encoding=UTF8")
                .arg("--auth=trust")
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(PgError::Setup(format!("initdb failed: {stderr}")));
            }
        }

        // clean up stale PID from previous crash
        let pid_file = pg_data.join("postmaster.pid");
        if pid_file.exists() {
            let status = pg_cmd(&pg_ctl, &pg_lib_dir)
                .arg("status")
                .arg("-D")
                .arg(&pg_data)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await?;

            if !status.status.success() {
                // postgres isn't actually running, stale PID
                tracing::warn!("removing stale postmaster.pid from previous crash");
                std::fs::remove_file(&pid_file)?;
            } else {
                // postgres IS running (from a previous session?). stop it first.
                tracing::info!("stopping previously running postgres");
                let _ = pg_cmd(&pg_ctl, &pg_lib_dir)
                    .arg("stop")
                    .arg("-D")
                    .arg(&pg_data)
                    .arg("-m")
                    .arg("fast")
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output()
                    .await;
                // brief wait for shutdown
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
        }

        // start postgres
        tracing::info!(port, "starting embedded postgres");
        let output = pg_cmd(&pg_ctl, &pg_lib_dir)
            .arg("start")
            .arg("-D")
            .arg(&pg_data)
            .arg("-o")
            .arg(format!("-p {port} -k /tmp"))
            .arg("-l")
            .arg(data_dir.join("pg.log"))
            .arg("-w")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(PgError::Setup(format!("pg_ctl start failed: {stderr}")));
        }

        // create database if needed
        let check = pg_cmd(&pg_bin_dir.join("psql"), &pg_lib_dir)
            .arg("-h")
            .arg("/tmp")
            .arg("-p")
            .arg(port.to_string())
            .arg("-U")
            .arg(whoami())
            .arg("-d")
            .arg("postgres")
            .arg("-tAc")
            .arg(format!(
                "SELECT 1 FROM pg_database WHERE datname = '{database}'"
            ))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;

        let exists = String::from_utf8_lossy(&check.stdout).trim().contains('1');

        if !exists {
            tracing::info!(database, "creating database");
            let output = pg_cmd(&createdb, &pg_lib_dir)
                .arg("-h")
                .arg("/tmp")
                .arg("-p")
                .arg(port.to_string())
                .arg("-U")
                .arg(whoami())
                .arg(database)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(PgError::Setup(format!("createdb failed: {stderr}")));
            }
        }

        tracing::info!(port, database, "embedded postgres ready");

        Ok(Self {
            pg_bin_dir: pg_bin_dir.to_path_buf(),
            pg_lib_dir,
            pg_ctl,
            data_dir: pg_data,
            port,
            database: database.to_string(),
        })
    }

    pub fn connection_url(&self) -> String {
        format!(
            "postgres://{}@localhost:{}/{}",
            whoami(),
            self.port,
            self.database
        )
    }

    pub async fn apply_schema(&self, sql_path: &Path) -> Result<(), PgError> {
        let check = pg_cmd(&self.pg_bin_dir.join("psql"), &self.pg_lib_dir)
            .arg("-h")
            .arg("/tmp")
            .arg("-p")
            .arg(self.port.to_string())
            .arg("-U")
            .arg(whoami())
            .arg("-d")
            .arg(&self.database)
            .arg("-tAc")
            .arg("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'accounts')")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;

        let already_applied = String::from_utf8_lossy(&check.stdout).trim().contains('t');

        if already_applied {
            tracing::info!("schema already applied, skipping");
            return Ok(());
        }

        tracing::info!(?sql_path, "applying schema");
        let output = pg_cmd(&self.pg_bin_dir.join("psql"), &self.pg_lib_dir)
            .arg("-h")
            .arg("/tmp")
            .arg("-p")
            .arg(self.port.to_string())
            .arg("-U")
            .arg(whoami())
            .arg("-d")
            .arg(&self.database)
            .arg("-f")
            .arg(sql_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(PgError::Setup(format!("schema apply failed: {stderr}")));
        }

        tracing::info!("schema applied successfully");
        Ok(())
    }

    pub async fn stop(&mut self) -> Result<(), PgError> {
        tracing::info!("stopping embedded postgres");
        let output = pg_cmd(&self.pg_ctl, &self.pg_lib_dir)
            .arg("stop")
            .arg("-D")
            .arg(&self.data_dir)
            .arg("-m")
            .arg("fast")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::warn!("pg_ctl stop: {stderr}");
        }

        Ok(())
    }
}

fn whoami() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "postgres".to_string())
}
