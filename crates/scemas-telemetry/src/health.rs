// MonitorIngestionHealth boundary (from class diagram)
//
// tracks ingestion pipeline health metrics.

use std::sync::atomic::{AtomicU64, Ordering};

pub struct IngestionHealth {
    pub total_received: AtomicU64,
    pub total_accepted: AtomicU64,
    pub total_rejected: AtomicU64,
}

impl IngestionHealth {
    pub fn new() -> Self {
        Self {
            total_received: AtomicU64::new(0),
            total_accepted: AtomicU64::new(0),
            total_rejected: AtomicU64::new(0),
        }
    }

    pub fn record_received(&self) {
        self.total_received.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_accepted(&self) {
        self.total_accepted.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_rejected(&self) {
        self.total_rejected.fetch_add(1, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> HealthSnapshot {
        HealthSnapshot {
            total_received: self.total_received.load(Ordering::Relaxed),
            total_accepted: self.total_accepted.load(Ordering::Relaxed),
            total_rejected: self.total_rejected.load(Ordering::Relaxed),
        }
    }
}

impl Default for IngestionHealth {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, serde::Serialize)]
pub struct HealthSnapshot {
    pub total_received: u64,
    pub total_accepted: u64,
    pub total_rejected: u64,
}
