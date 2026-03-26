use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Notify, watch};

use crate::auth::RemoteAuth;

/// shared handle to trigger a manual sync from outside (e.g. tray menu).
pub type SyncTrigger = Arc<Notify>;

/// background sync service. when `remote_db_url` is set, syncs directly
/// database-to-database (embedded ← remote). falls back to HTTP API sync
/// when no remote DB is configured (production mode).
pub struct SyncService {
    auth: Arc<RemoteAuth>,
    local: PgPool,
    remote_db_url: Option<String>,
    remote: Option<PgPool>,
    interval: Duration,
    shutdown_rx: watch::Receiver<bool>,
    trigger: SyncTrigger,
}

impl SyncService {
    pub fn new(
        auth: Arc<RemoteAuth>,
        local: PgPool,
        remote_db_url: Option<String>,
        interval: Duration,
        shutdown_rx: watch::Receiver<bool>,
    ) -> (Self, SyncTrigger) {
        let trigger = Arc::new(Notify::new());
        (
            Self {
                auth,
                local,
                remote_db_url,
                remote: None,
                interval,
                shutdown_rx,
                trigger: Arc::clone(&trigger),
            },
            trigger,
        )
    }

    pub async fn run(&mut self) {
        // connect to remote DB if configured
        if let Some(url) = self.remote_db_url.as_deref().filter(|u| !u.is_empty()) {
            match PgPool::connect(&url).await {
                Ok(pool) => {
                    tracing::info!("sync: connected to remote database");
                    self.remote = Some(pool);
                }
                Err(e) => {
                    tracing::warn!("sync: failed to connect to remote DB: {e}");
                }
            }
        }

        tracing::info!(
            interval_secs = self.interval.as_secs(),
            mode = if self.remote.is_some() {
                "database"
            } else {
                "http"
            },
            "sync service started"
        );

        // fast poll counter: run alert poll every 6th tick of a 5-second loop
        // (= every 30 seconds), full sync every interval/5s ticks
        let fast_poll_interval = Duration::from_secs(30);
        let mut last_full_sync = std::time::Instant::now()
            .checked_sub(self.interval)
            .unwrap_or_else(std::time::Instant::now);
        let mut last_alert_poll = std::time::Instant::now()
            .checked_sub(fast_poll_interval)
            .unwrap_or_else(std::time::Instant::now);

        loop {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(5)) => {
                    let now = std::time::Instant::now();

                    // fast poll: alerts every 30s
                    if now.duration_since(last_alert_poll) >= fast_poll_interval {
                        if let Err(e) = self.poll_alerts().await {
                            tracing::debug!("sync alert poll: {e}");
                        }
                        last_alert_poll = now;
                    }

                    // full sync every interval (default 5 min)
                    if now.duration_since(last_full_sync) >= self.interval {
                        if let Err(e) = self.full_sync().await {
                            tracing::warn!("sync tick failed: {e}");
                        }
                        last_full_sync = now;
                    }
                }
                _ = self.trigger.notified() => {
                    tracing::info!("sync: manual trigger received");
                    if let Err(e) = self.full_sync().await {
                        tracing::warn!("sync manual tick failed: {e}");
                    }
                    last_full_sync = std::time::Instant::now();
                }
                _ = self.shutdown_rx.changed() => {
                    tracing::info!("sync service shutting down");
                    if let Some(pool) = &self.remote {
                        pool.close().await;
                    }
                    break;
                }
            }
        }
    }

    async fn full_sync(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(remote) = &self.remote {
            self.pull_accounts(remote).await?;
            self.pull_rules(remote).await?;
            self.pull_alerts(remote).await?;
            self.pull_analytics(remote).await?;
            self.push_queued(remote).await?;
        } else {
            self.pull_rules_http().await?;
            self.push_queued_http().await?;
        }
        Ok(())
    }

    async fn poll_alerts(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(remote) = &self.remote {
            self.pull_recent_alerts(remote).await?;
        }
        Ok(())
    }

    // ── database-to-database sync ──────────────────────────────────────

    async fn pull_accounts(
        &self,
        remote: &PgPool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query_as::<_, (String, String, String, String, String)>(
            "SELECT id::text, email, username, password_hash, role FROM accounts",
        )
        .fetch_all(remote)
        .await?;

        let count = rows.len();
        for (id, email, username, password_hash, role) in rows {
            sqlx::query(
                "INSERT INTO accounts (id, email, username, password_hash, role)
                 VALUES ($1::uuid, $2, $3, $4, $5)
                 ON CONFLICT (email) DO UPDATE
                 SET id = EXCLUDED.id,
                     username = EXCLUDED.username,
                     password_hash = EXCLUDED.password_hash,
                     role = EXCLUDED.role",
            )
            .bind(&id)
            .bind(&email)
            .bind(&username)
            .bind(&password_hash)
            .bind(&role)
            .execute(&self.local)
            .await?;
        }
        if count > 0 {
            tracing::debug!(count, "synced accounts from remote");
        }
        Ok(())
    }

    async fn pull_rules(
        &self,
        remote: &PgPool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query_as::<_, (String, String, f64, String, Option<String>, String)>(
            "SELECT id::text, metric_type, threshold_value, comparison, zone, rule_status
             FROM threshold_rules",
        )
        .fetch_all(remote)
        .await?;

        let count = rows.len();
        for (id, metric_type, threshold_value, comparison, zone, rule_status) in rows {
            sqlx::query(
                "INSERT INTO threshold_rules (id, metric_type, threshold_value, comparison, zone, rule_status)
                 VALUES ($1::uuid, $2, $3, $4, $5, $6)
                 ON CONFLICT (id) DO UPDATE
                 SET metric_type = EXCLUDED.metric_type,
                     threshold_value = EXCLUDED.threshold_value,
                     comparison = EXCLUDED.comparison,
                     zone = EXCLUDED.zone,
                     rule_status = EXCLUDED.rule_status"
            )
            .bind(&id).bind(&metric_type).bind(threshold_value).bind(&comparison).bind(&zone).bind(&rule_status)
            .execute(&self.local)
            .await?;
        }
        if count > 0 {
            tracing::debug!(count, "synced rules from remote");
        }
        Ok(())
    }

    async fn pull_alerts(
        &self,
        remote: &PgPool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // pull alerts created in the last 24 hours
        let rows = sqlx::query_as::<_, (String, Option<String>, String, i32, String, f64, String, String, chrono::DateTime<chrono::Utc>)>(
            "SELECT id::text, rule_id::text, sensor_id, severity, status, triggered_value, zone, metric_type, created_at
             FROM alerts
             WHERE created_at > NOW() - INTERVAL '24 hours'"
        )
        .fetch_all(remote)
        .await?;

        let count = rows.len();
        for (
            id,
            rule_id,
            sensor_id,
            severity,
            status,
            triggered_value,
            zone,
            metric_type,
            created_at,
        ) in rows
        {
            sqlx::query(
                "INSERT INTO alerts (id, rule_id, sensor_id, severity, status, triggered_value, zone, metric_type, created_at)
                 VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (id) DO UPDATE
                 SET status = EXCLUDED.status"
            )
            .bind(&id).bind(&rule_id).bind(&sensor_id).bind(severity).bind(&status)
            .bind(triggered_value).bind(&zone).bind(&metric_type).bind(created_at)
            .execute(&self.local)
            .await?;
        }
        if count > 0 {
            tracing::debug!(count, "synced alerts from remote");
        }
        Ok(())
    }

    async fn pull_recent_alerts(
        &self,
        remote: &PgPool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // fast poll: only active alerts from last 5 minutes
        let rows = sqlx::query_as::<_, (String, Option<String>, String, i32, String, f64, String, String, chrono::DateTime<chrono::Utc>)>(
            "SELECT id::text, rule_id::text, sensor_id, severity, status, triggered_value, zone, metric_type, created_at
             FROM alerts
             WHERE created_at > NOW() - INTERVAL '5 minutes'
               AND status = 'active'"
        )
        .fetch_all(remote)
        .await?;

        for (
            id,
            rule_id,
            sensor_id,
            severity,
            status,
            triggered_value,
            zone,
            metric_type,
            created_at,
        ) in rows
        {
            sqlx::query(
                "INSERT INTO alerts (id, rule_id, sensor_id, severity, status, triggered_value, zone, metric_type, created_at)
                 VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (id) DO UPDATE
                 SET status = EXCLUDED.status"
            )
            .bind(&id).bind(&rule_id).bind(&sensor_id).bind(severity).bind(&status)
            .bind(triggered_value).bind(&zone).bind(&metric_type).bind(created_at)
            .execute(&self.local)
            .await?;
        }
        Ok(())
    }

    async fn pull_analytics(
        &self,
        remote: &PgPool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // pull recent analytics (last 24 hours of 5m_avg data)
        let rows = sqlx::query_as::<_, (String, String, f64, String, i32, f64, chrono::DateTime<chrono::Utc>)>(
            "SELECT zone, metric_type, aggregated_value, aggregation_type, sample_count, sample_sum, time
             FROM analytics
             WHERE time > NOW() - INTERVAL '24 hours'
               AND aggregation_type = '5m_avg'"
        )
        .fetch_all(remote)
        .await?;

        let count = rows.len();
        for (
            zone,
            metric_type,
            aggregated_value,
            aggregation_type,
            sample_count,
            sample_sum,
            time,
        ) in rows
        {
            sqlx::query(
                "INSERT INTO analytics (zone, metric_type, aggregated_value, aggregation_type, sample_count, sample_sum, time)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (zone, metric_type, aggregation_type, time) DO UPDATE
                 SET aggregated_value = EXCLUDED.aggregated_value,
                     sample_count = EXCLUDED.sample_count,
                     sample_sum = EXCLUDED.sample_sum"
            )
            .bind(&zone).bind(&metric_type).bind(aggregated_value).bind(&aggregation_type)
            .bind(sample_count).bind(sample_sum).bind(time)
            .execute(&self.local)
            .await?;
        }
        if count > 0 {
            tracing::debug!(count, "synced analytics from remote");
        }
        Ok(())
    }

    async fn push_queued(
        &self,
        remote: &PgPool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let items = sqlx::query_as::<_, SyncQueueItem>(
            "SELECT id, command, payload, status FROM sync_queue
             WHERE status = 'pending'
             ORDER BY created_at ASC
             LIMIT 50",
        )
        .fetch_all(&self.local)
        .await?;

        if items.is_empty() {
            return Ok(());
        }

        for item in &items {
            let result = match item.command.as_str() {
                "telemetry_ingest" => {
                    // write sensor reading directly to remote DB
                    if let (Some(sensor_id), Some(metric_type), Some(value), Some(zone)) = (
                        item.payload.get("sensorId").and_then(|v| v.as_str()),
                        item.payload.get("metricType").and_then(|v| v.as_str()),
                        item.payload.get("value").and_then(|v| v.as_f64()),
                        item.payload.get("zone").and_then(|v| v.as_str()),
                    ) {
                        sqlx::query(
                            "INSERT INTO sensor_readings (sensor_id, metric_type, value, zone)
                             VALUES ($1, $2, $3, $4)",
                        )
                        .bind(sensor_id)
                        .bind(metric_type)
                        .bind(value)
                        .bind(zone)
                        .execute(remote)
                        .await
                        .map(|_| ())
                    } else {
                        Ok(())
                    }
                }
                _ => {
                    tracing::debug!(command = %item.command, "unknown sync command, skipping");
                    Ok(())
                }
            };

            let new_status = match result {
                Ok(()) => "synced",
                Err(e) => {
                    tracing::debug!(command = %item.command, "push failed: {e}");
                    break;
                }
            };

            sqlx::query("UPDATE sync_queue SET status = $1 WHERE id = $2")
                .bind(new_status)
                .bind(item.id)
                .execute(&self.local)
                .await?;
        }

        Ok(())
    }

    // ── HTTP fallback (production mode) ─────────────────────────────────

    async fn pull_rules_http(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let base_url = &self.auth.base_url();
        let resp = reqwest::get(format!("{base_url}/api/v1/rules")).await;
        match resp {
            Ok(r) if r.status().is_success() => {
                let rules: Vec<serde_json::Value> = r.json().await?;
                tracing::debug!(count = rules.len(), "pulled remote rules (http)");
                for rule in rules {
                    if let (Some(id), Some(metric_type), Some(threshold_value), Some(comparison)) = (
                        rule.get("id").and_then(|v| v.as_str()),
                        rule.get("metricType").and_then(|v| v.as_str()),
                        rule.get("thresholdValue").and_then(|v| v.as_f64()),
                        rule.get("comparison").and_then(|v| v.as_str()),
                    ) {
                        let zone = rule.get("zone").and_then(|v| v.as_str());
                        let rule_status = rule
                            .get("ruleStatus")
                            .and_then(|v| v.as_str())
                            .unwrap_or("active");

                        let _ = sqlx::query(
                            "INSERT INTO threshold_rules (id, metric_type, threshold_value, comparison, zone, rule_status)
                             VALUES ($1::uuid, $2, $3, $4, $5, $6)
                             ON CONFLICT (id) DO UPDATE
                             SET metric_type = EXCLUDED.metric_type,
                                 threshold_value = EXCLUDED.threshold_value,
                                 comparison = EXCLUDED.comparison,
                                 zone = EXCLUDED.zone,
                                 rule_status = EXCLUDED.rule_status",
                        )
                        .bind(id).bind(metric_type).bind(threshold_value).bind(comparison).bind(zone).bind(rule_status)
                        .execute(&self.local)
                        .await;
                    }
                }
            }
            Ok(r) => tracing::debug!(status = %r.status(), "remote rules endpoint unavailable"),
            Err(e) => tracing::debug!("remote unreachable: {e}"),
        }
        Ok(())
    }

    async fn push_queued_http(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let items = sqlx::query_as::<_, SyncQueueItem>(
            "SELECT id, command, payload, status FROM sync_queue
             WHERE status = 'pending'
             ORDER BY created_at ASC
             LIMIT 50",
        )
        .fetch_all(&self.local)
        .await?;

        if items.is_empty() {
            return Ok(());
        }

        let base_url = self.auth.base_url();
        let client = reqwest::Client::new();

        for item in &items {
            let endpoint = match item.command.as_str() {
                "telemetry_ingest" => format!("{base_url}/internal/telemetry/ingest"),
                "rules_create" => format!("{base_url}/internal/alerting/rules"),
                other => {
                    tracing::warn!(command = other, "unknown sync command, marking failed");
                    let _ = sqlx::query("UPDATE sync_queue SET status = 'failed' WHERE id = $1")
                        .bind(item.id)
                        .execute(&self.local)
                        .await;
                    continue;
                }
            };

            let resp = client.post(&endpoint).json(&item.payload).send().await;
            let new_status = match resp {
                Ok(r) if r.status().is_success() => "synced",
                Ok(r) => {
                    tracing::debug!(status = %r.status(), command = %item.command, "sync push rejected");
                    "failed"
                }
                Err(e) => {
                    tracing::debug!(command = %item.command, "sync push failed: {e}");
                    break;
                }
            };

            let _ = sqlx::query("UPDATE sync_queue SET status = $1 WHERE id = $2")
                .bind(new_status)
                .bind(item.id)
                .execute(&self.local)
                .await;
        }

        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct SyncQueueItem {
    id: i64,
    command: String,
    payload: serde_json::Value,
    #[allow(dead_code)]
    status: String,
}
