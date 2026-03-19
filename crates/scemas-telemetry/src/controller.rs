use scemas_core::error::Result;
use scemas_core::models::IndividualSensorReading;
use sqlx::PgPool;

use crate::validate;

/// TelemetryManager controller (from class diagram)
///
/// implements pipe-and-filter architecture:
/// ingest → schema validate → range validate → timestamp validate → persist
///
/// each validate fn is a "filter" in the pipeline. the "pipe" is sequential
/// function composition. if any filter rejects, the reading is dropped with
/// an error. simple and traceable.
pub struct TelemetryManager {
    db: PgPool,
}

impl TelemetryManager {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    /// pipe-and-filter pipeline: validate then persist
    pub async fn ingest(
        &self,
        reading: IndividualSensorReading,
    ) -> Result<IndividualSensorReading> {
        // filter 1: schema validation (are all fields present and typed correctly?)
        let reading = validate::schema_validator(reading)?;

        // filter 2: value range validation (is the value plausible for this metric?)
        let reading = validate::range_validator(reading)?;

        // filter 3: timestamp validation (is the timestamp within acceptable drift?)
        let reading = validate::timestamp_validator(reading)?;

        // sink: persist to database
        self.persist(&reading).await?;

        Ok(reading)
    }

    async fn persist(&self, reading: &IndividualSensorReading) -> Result<()> {
        sqlx::query(
            "INSERT INTO sensor_readings (time, sensor_id, metric_type, value, zone) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(reading.timestamp)
        .bind(&reading.sensor_id)
        .bind(reading.metric_type.to_string())
        .bind(reading.value)
        .bind(&reading.zone)
        .execute(&self.db)
        .await?;

        Ok(())
    }
}
