use crate::error::{Error, Result};

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub jwt_secret: String,
    pub jwt_expiry_hours: u64,
    pub device_auth_secret: String,
    pub device_catalog_path: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        let database_url = std::env::var("DATABASE_URL")
            .map_err(|_| Error::Internal("DATABASE_URL not set".into()))?;
        let port = std::env::var("RUST_PORT")
            .unwrap_or_else(|_| "3001".into())
            .parse::<u16>()
            .map_err(|_| Error::Internal("invalid RUST_PORT".into()))?;
        let jwt_secret = std::env::var("JWT_SECRET")
            .map_err(|_| Error::Internal("JWT_SECRET not set".into()))?;
        let jwt_expiry_hours = std::env::var("JWT_EXPIRY_HOURS")
            .unwrap_or_else(|_| "24".into())
            .parse::<u64>()
            .map_err(|_| Error::Internal("invalid JWT_EXPIRY_HOURS".into()))?;
        let device_auth_secret = std::env::var("DEVICE_AUTH_SECRET")
            .map_err(|_| Error::Internal("DEVICE_AUTH_SECRET not set".into()))?;
        let device_catalog_path = std::env::var("DEVICE_CATALOG_PATH")
            .unwrap_or_else(|_| "data/hamilton-sensors.json".into());

        Ok(Self {
            database_url,
            port,
            jwt_secret,
            jwt_expiry_hours,
            device_auth_secret,
            device_catalog_path,
        })
    }
}
