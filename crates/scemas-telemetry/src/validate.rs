// ValidateTelemetryData boundary (from class diagram)
//
// pipe-and-filter: each function is a filter in the pipeline.
// takes a reading, returns the same reading if valid, or an error.
// filters are composable and independent of each other.

use chrono::Utc;
use scemas_core::error::{Error, Result};
use scemas_core::models::{IndividualSensorReading, MetricType};

/// filter 1: validate that all required fields are present and non-empty
pub fn schema_validator(reading: IndividualSensorReading) -> Result<IndividualSensorReading> {
    if reading.sensor_id.is_empty() {
        return Err(Error::Validation("sensor_id is empty".into()));
    }
    if reading.zone.is_empty() {
        return Err(Error::Validation("zone is empty".into()));
    }
    Ok(reading)
}

/// filter 2: validate that the value is within plausible range for its metric type
pub fn range_validator(reading: IndividualSensorReading) -> Result<IndividualSensorReading> {
    let (min, max) = plausible_range(&reading.metric_type);
    if reading.value < min || reading.value > max {
        return Err(Error::Validation(format!(
            "{} value {} is outside plausible range [{}, {}]",
            reading.metric_type, reading.value, min, max
        )));
    }
    Ok(reading)
}

/// filter 3: validate that the timestamp is within acceptable drift (5 minutes)
pub fn timestamp_validator(reading: IndividualSensorReading) -> Result<IndividualSensorReading> {
    let now = Utc::now();
    let drift = (now - reading.timestamp).num_seconds().unsigned_abs();
    let max_drift_seconds = 5 * 60; // 5 minutes per SRS PR-PA1

    if drift > max_drift_seconds {
        return Err(Error::Validation(format!(
            "timestamp drift of {}s exceeds maximum of {}s",
            drift, max_drift_seconds
        )));
    }
    Ok(reading)
}

/// plausible value ranges per metric type (from SRS PR-PA1)
fn plausible_range(metric_type: &MetricType) -> (f64, f64) {
    match metric_type {
        MetricType::Temperature => (-50.0, 60.0), // celsius
        MetricType::Humidity => (0.0, 100.0),     // percentage
        MetricType::AirQuality => (0.0, 1000.0),  // PM2.5 μg/m³
        MetricType::NoiseLevel => (0.0, 194.0),   // decibels
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn sample_reading() -> IndividualSensorReading {
        IndividualSensorReading {
            sensor_id: "temp-dt-001".into(),
            metric_type: MetricType::Temperature,
            value: 22.5,
            zone: "downtown".into(),
            timestamp: Utc::now(),
        }
    }

    #[test]
    fn schema_validator_rejects_empty_sensor_id() {
        let mut reading = sample_reading();
        reading.sensor_id = String::new();
        assert!(schema_validator(reading).is_err());
    }

    #[test]
    fn range_validator_accepts_valid_temperature() {
        let reading = sample_reading();
        assert!(range_validator(reading).is_ok());
    }

    #[test]
    fn range_validator_rejects_impossible_temperature() {
        let mut reading = sample_reading();
        reading.value = 999.0;
        assert!(range_validator(reading).is_err());
    }

    #[test]
    fn timestamp_validator_accepts_current_time() {
        let reading = sample_reading();
        assert!(timestamp_validator(reading).is_ok());
    }

    #[test]
    fn timestamp_validator_rejects_old_timestamp() {
        let mut reading = sample_reading();
        reading.timestamp = Utc::now() - chrono::Duration::hours(1);
        assert!(timestamp_validator(reading).is_err());
    }
}
