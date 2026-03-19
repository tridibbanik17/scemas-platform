// IngestSensorStreams boundary (from class diagram)
//
// handles incoming sensor data submission.
// in this implementation: accepts JSON POST, deserializes, passes to controller.

use scemas_core::models::IndividualSensorReading;

/// parse raw JSON into a sensor reading
/// this is the "ingest" boundary: the entry point of the pipe-and-filter
pub fn parse_reading(json: &str) -> Result<IndividualSensorReading, serde_json::Error> {
    serde_json::from_str(json)
}
