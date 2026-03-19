// entity structs from UML class diagram
// every struct here maps 1:1 to a drizzle table in packages/db/src/schema.ts
// and a zod schema in packages/types/src/

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ─── AccessManager entities ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInformation {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub role: Role,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Operator,
    Admin,
    Viewer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveSessionToken {
    pub token_value: String,
    pub user_id: Uuid,
    pub role: Role,
    pub expiry: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceIdentity {
    pub device_id: String,
    pub device_type: MetricType,
    pub zone: String,
    pub status: DeviceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceStatus {
    Active,
    Inactive,
    Revoked,
}

// ─── TelemetryManager entities ───

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndividualSensorReading {
    pub sensor_id: String,
    pub metric_type: MetricType,
    pub value: f64,
    pub zone: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MetricType {
    Temperature,
    Humidity,
    AirQuality,
    NoiseLevel,
}

impl std::fmt::Display for MetricType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MetricType::Temperature => write!(f, "temperature"),
            MetricType::Humidity => write!(f, "humidity"),
            MetricType::AirQuality => write!(f, "air_quality"),
            MetricType::NoiseLevel => write!(f, "noise_level"),
        }
    }
}

// ─── AlertingManager entities ───

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThresholdRule {
    pub id: Uuid,
    pub metric_type: MetricType,
    pub threshold_value: f64,
    pub comparison: Comparison,
    pub zone: Option<String>,
    pub rule_status: RuleStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Comparison {
    Gt,
    Lt,
    Gte,
    Lte,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RuleStatus {
    Active,
    Inactive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub id: Uuid,
    pub rule_id: Uuid,
    pub sensor_id: String,
    pub severity: Severity,
    pub status: AlertStatus,
    pub triggered_value: f64,
    pub zone: String,
    pub metric_type: MetricType,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, PartialOrd)]
#[repr(i32)]
pub enum Severity {
    Low = 1,
    Warning = 2,
    Critical = 3,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AlertStatus {
    Triggered,
    Active,
    Acknowledged,
    Resolved,
}

// ─── DataDistributionManager entities ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsRecord {
    pub zone: String,
    pub metric_type: MetricType,
    pub aggregated_value: f64,
    pub aggregation_type: String,
    pub time: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformStatus {
    pub subsystem: String,
    pub status: String,
    pub uptime: f64,
    pub latency_ms: f64,
    pub error_rate: f64,
    pub time: DateTime<Utc>,
}

// ─── Innovative feature: alert subscriptions ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertSubscription {
    pub id: Uuid,
    pub user_id: Uuid,
    pub metric_types: Vec<MetricType>,
    pub zones: Vec<String>,
    pub min_severity: Severity,
}
