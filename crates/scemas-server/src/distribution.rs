use chrono::{DateTime, TimeZone, Utc};
use scemas_core::error::{Error, Result};
use scemas_core::models::IndividualSensorReading;
use sqlx::PgPool;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::Instant;

const HEALTH_SNAPSHOT_INTERVAL_SECONDS: i64 = 60;

pub struct DataDistributionManager {
    db: PgPool,
    started_at: Instant,
    last_health_snapshot_at: AtomicI64,
}

impl DataDistributionManager {
    pub fn new(db: PgPool) -> Self {
        Self {
            db,
            started_at: Instant::now(),
            last_health_snapshot_at: AtomicI64::new(0),
        }
    }

    pub async fn aggregate_reading(&self, reading: &IndividualSensorReading) -> Result<()> {
        let metric_type = reading.metric_type.to_string();
        let five_minute_bucket = bucket_start(reading.timestamp, 300)?;
        let hourly_bucket = bucket_start(reading.timestamp, 3600)?;

        self.upsert_average(
            &reading.zone,
            &metric_type,
            five_minute_bucket,
            reading.value,
        )
        .await?;
        self.upsert_maximum(&reading.zone, &metric_type, hourly_bucket, reading.value)
            .await?;

        Ok(())
    }

    pub async fn record_ingestion_health(
        &self,
        total_received: u64,
        total_rejected: u64,
        latency_ms: f64,
    ) -> Result<()> {
        let now = Utc::now().timestamp();
        let previous = self.last_health_snapshot_at.load(Ordering::Relaxed);
        if now - previous < HEALTH_SNAPSHOT_INTERVAL_SECONDS {
            return Ok(());
        }

        if self
            .last_health_snapshot_at
            .compare_exchange(previous, now, Ordering::Relaxed, Ordering::Relaxed)
            .is_err()
        {
            return Ok(());
        }

        let error_rate = if total_received == 0 {
            0.0
        } else {
            total_rejected as f64 / total_received as f64
        };
        let status = if error_rate > 0.05 { "degraded" } else { "ok" };

        sqlx::query(
            "INSERT INTO platform_status (subsystem, status, uptime, latency_ms, error_rate) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind("telemetry_ingestion")
        .bind(status)
        .bind(self.started_at.elapsed().as_secs_f64())
        .bind(latency_ms)
        .bind(error_rate)
        .execute(&self.db)
        .await
        .inspect_err(|_| {
            let _ = self.last_health_snapshot_at.compare_exchange(
                now,
                previous,
                Ordering::Relaxed,
                Ordering::Relaxed,
            );
        })?;

        Ok(())
    }

    pub async fn record_ingestion_failure(
        &self,
        stage: &str,
        reading: &IndividualSensorReading,
        error: &str,
    ) -> Result<()> {
        let payload = serde_json::to_value(reading).map_err(|serialization_error| {
            Error::Internal(format!(
                "failed to serialize ingestion failure payload: {serialization_error}"
            ))
        })?;

        sqlx::query(
            "INSERT INTO ingestion_failures (stage, sensor_id, metric_type, zone, payload, error, status) VALUES ($1, $2, $3, $4, $5, $6, 'pending')",
        )
        .bind(stage)
        .bind(&reading.sensor_id)
        .bind(reading.metric_type.to_string())
        .bind(&reading.zone)
        .bind(payload)
        .bind(error)
        .execute(&self.db)
        .await?;

        Ok(())
    }

    async fn upsert_average(
        &self,
        zone: &str,
        metric_type: &str,
        bucket: DateTime<Utc>,
        reading_value: f64,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO analytics (zone, metric_type, aggregated_value, aggregation_type, sample_count, sample_sum, time)
             VALUES ($1, $2, $3, '5m_avg', 1, $4, $5)
             ON CONFLICT (zone, metric_type, aggregation_type, time) DO UPDATE
             SET sample_count = COALESCE(analytics.sample_count, 0) + 1,
                 sample_sum = COALESCE(analytics.sample_sum, 0) + EXCLUDED.sample_sum,
                 aggregated_value = (COALESCE(analytics.sample_sum, 0) + EXCLUDED.sample_sum)
                   / (COALESCE(analytics.sample_count, 0) + 1)",
        )
        .bind(zone)
        .bind(metric_type)
        .bind(reading_value)
        .bind(reading_value)
        .bind(bucket)
        .execute(&self.db)
        .await?;

        Ok(())
    }

    async fn upsert_maximum(
        &self,
        zone: &str,
        metric_type: &str,
        bucket: DateTime<Utc>,
        reading_value: f64,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO analytics (zone, metric_type, aggregated_value, aggregation_type, time)
             VALUES ($1, $2, $3, '1h_max', $4)
             ON CONFLICT (zone, metric_type, aggregation_type, time) DO UPDATE
             SET aggregated_value = GREATEST(analytics.aggregated_value, EXCLUDED.aggregated_value)",
        )
        .bind(zone)
        .bind(metric_type)
        .bind(reading_value)
        .bind(bucket)
        .execute(&self.db)
        .await?;

        Ok(())
    }
}

fn bucket_start(timestamp: DateTime<Utc>, window_seconds: i64) -> Result<DateTime<Utc>> {
    let unix_timestamp = timestamp.timestamp();
    let bucket = unix_timestamp - unix_timestamp.rem_euclid(window_seconds);

    Utc.timestamp_opt(bucket, 0).single().ok_or_else(|| {
        Error::Internal(format!("failed to compute aggregation bucket for {bucket}"))
    })
}
