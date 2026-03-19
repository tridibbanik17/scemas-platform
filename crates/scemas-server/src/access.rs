use argon2::Argon2;
use argon2::password_hash::{
    PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng,
};
use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::{EncodingKey, Header};
use scemas_core::error::{Error, Result};
use scemas_core::models::{DeviceIdentity, DeviceStatus, MetricType, Role, UserInformation};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

pub struct AccessManager {
    db: PgPool,
    jwt_secret: String,
    jwt_expiry_hours: u64,
    device_auth_secret: String,
}

impl AccessManager {
    pub fn new(
        db: PgPool,
        jwt_secret: String,
        jwt_expiry_hours: u64,
        device_auth_secret: String,
    ) -> Self {
        Self {
            db,
            jwt_secret,
            jwt_expiry_hours,
            device_auth_secret,
        }
    }

    pub async fn signup(&self, request: SignupRequest) -> Result<AuthSessionResponse> {
        let existing = sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM accounts WHERE email = $1 OR username = $2 LIMIT 1",
        )
        .bind(&request.email)
        .bind(&request.username)
        .fetch_optional(&self.db)
        .await?;

        if existing.is_some() {
            return Err(Error::Validation(
                "an account with that email or username already exists".into(),
            ));
        }

        let password_hash = hash_password(&request.password)?;

        let account = sqlx::query_as::<_, AccountRow>(
            "INSERT INTO accounts (email, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, username, password_hash, role",
        )
        .bind(&request.email)
        .bind(&request.username)
        .bind(password_hash)
        .bind(role_label(&Role::Operator))
        .fetch_one(&self.db)
        .await?;

        let user = account.try_into_user()?;
        let session = self.issue_session(&user).await?;

        self.insert_audit_log(
            Some(user.id),
            "auth.signup.success",
            serde_json::json!({
                "email": user.email,
                "role": role_label(&user.role),
            }),
        )
        .await?;

        Ok(session)
    }

    pub async fn login(&self, request: LoginRequest) -> Result<AuthSessionResponse> {
        let account = sqlx::query_as::<_, AccountRow>(
            "SELECT id, email, username, password_hash, role FROM accounts WHERE email = $1 LIMIT 1",
        )
        .bind(&request.email)
        .fetch_optional(&self.db)
        .await?;

        let Some(account) = account else {
            self.insert_audit_log(
                None,
                "auth.login.failure",
                serde_json::json!({
                    "email": request.email,
                    "reason": "account_not_found",
                }),
            )
            .await?;

            return Err(Error::Unauthorized("invalid credentials".into()));
        };

        verify_password(&account.password_hash, &request.password).map_err(
            |error| match error {
                Error::Unauthorized(_) => Error::Unauthorized("invalid credentials".into()),
                other => other,
            },
        )?;

        let user = account.try_into_user()?;
        let session = self.issue_session(&user).await?;

        self.insert_audit_log(
            Some(user.id),
            "auth.login.success",
            serde_json::json!({
                "email": user.email,
                "role": role_label(&user.role),
            }),
        )
        .await?;

        Ok(session)
    }

    pub async fn sync_device_registry(&self, catalog_path: &str) -> Result<usize> {
        let catalog = std::fs::read_to_string(catalog_path)
            .map_err(|error| Error::Internal(format!("failed to read device catalog: {error}")))?;
        let devices: Vec<DeviceCatalogEntry> = serde_json::from_str(&catalog)
            .map_err(|error| Error::Internal(format!("failed to parse device catalog: {error}")))?;

        for device in &devices {
            sqlx::query(
                "INSERT INTO devices (device_id, device_type, zone, status) VALUES ($1, $2, $3, 'active')
                 ON CONFLICT (device_id) DO UPDATE SET device_type = EXCLUDED.device_type, zone = EXCLUDED.zone",
            )
            .bind(&device.sensor_id)
            .bind(&device.device_type)
            .bind(&device.zone)
            .execute(&self.db)
            .await?;
        }

        Ok(devices.len())
    }

    pub async fn authorize_device(
        &self,
        request: DeviceAuthorizationRequest,
    ) -> Result<DeviceIdentity> {
        let device = sqlx::query_as::<_, DeviceRow>(
            "SELECT device_id, device_type, zone, status FROM devices WHERE device_id = $1 LIMIT 1",
        )
        .bind(&request.device_id)
        .fetch_optional(&self.db)
        .await?;

        let Some(device) = device else {
            self.insert_audit_log(
                None,
                "device.auth.failure",
                serde_json::json!({
                    "deviceId": request.device_id,
                    "reason": "not_registered",
                }),
            )
            .await?;

            return Err(Error::Unauthorized("device is not registered".into()));
        };

        let device = device.try_into_identity()?;

        if device.status != DeviceStatus::Active {
            self.insert_audit_log(
                None,
                "device.auth.failure",
                serde_json::json!({
                    "deviceId": request.device_id,
                    "reason": "inactive",
                    "status": device_status_label(&device.status),
                }),
            )
            .await?;

            return Err(Error::Forbidden(
                "device is not allowed to submit telemetry".into(),
            ));
        }

        if device.device_type != request.expected_metric_type
            || device.zone != request.expected_zone
        {
            self.insert_audit_log(
                None,
                "device.auth.failure",
                serde_json::json!({
                    "deviceId": request.device_id,
                    "reason": "identity_mismatch",
                    "expectedMetricType": request.expected_metric_type.to_string(),
                    "expectedZone": request.expected_zone,
                }),
            )
            .await?;

            return Err(Error::Unauthorized(
                "device identity does not match the submitted telemetry".into(),
            ));
        }

        if request.device_token != self.device_auth_secret {
            self.insert_audit_log(
                None,
                "device.auth.failure",
                serde_json::json!({
                    "deviceId": request.device_id,
                    "reason": "invalid_token",
                }),
            )
            .await?;

            return Err(Error::Unauthorized("device token is invalid".into()));
        }

        Ok(device)
    }

    async fn issue_session(&self, user: &UserInformation) -> Result<AuthSessionResponse> {
        let expiry_hours = i64::try_from(self.jwt_expiry_hours)
            .map_err(|_| Error::Internal("JWT_EXPIRY_HOURS exceeded i64 bounds".into()))?;
        let expires_at = Utc::now() + Duration::hours(expiry_hours);
        let exp = usize::try_from(expires_at.timestamp())
            .map_err(|_| Error::Internal("session expiry exceeded usize bounds".into()))?;

        let claims = SessionClaims {
            sub: user.id.to_string(),
            role: role_label(&user.role).to_owned(),
            exp,
        };

        let token = jsonwebtoken::encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
        )
        .map_err(|error| Error::Internal(format!("failed to sign session token: {error}")))?;

        sqlx::query(
            "INSERT INTO active_session_tokens (token_value, user_id, role, expiry) VALUES ($1, $2, $3, $4)",
        )
        .bind(&token)
        .bind(user.id)
        .bind(role_label(&user.role))
        .bind(expires_at)
        .execute(&self.db)
        .await?;

        Ok(AuthSessionResponse {
            token,
            expires_at,
            user: user.clone(),
        })
    }

    async fn insert_audit_log(
        &self,
        user_id: Option<Uuid>,
        action: &str,
        details: serde_json::Value,
    ) -> Result<()> {
        sqlx::query("INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)")
            .bind(user_id)
            .bind(action)
            .bind(details)
            .execute(&self.db)
            .await?;

        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignupRequest {
    pub email: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionResponse {
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub user: UserInformation,
}

pub struct DeviceAuthorizationRequest {
    pub device_id: String,
    pub device_token: String,
    pub expected_metric_type: MetricType,
    pub expected_zone: String,
}

#[derive(Debug, Serialize)]
struct SessionClaims {
    sub: String,
    role: String,
    exp: usize,
}

#[derive(Debug, FromRow)]
struct AccountRow {
    id: Uuid,
    email: String,
    username: String,
    password_hash: String,
    role: String,
}

#[derive(Debug, Deserialize)]
struct DeviceCatalogEntry {
    sensor_id: String,
    device_type: String,
    zone: String,
}

#[derive(Debug, FromRow)]
struct DeviceRow {
    device_id: String,
    device_type: String,
    zone: String,
    status: String,
}

impl AccountRow {
    fn try_into_user(self) -> Result<UserInformation> {
        Ok(UserInformation {
            id: self.id,
            username: self.username,
            email: self.email,
            role: parse_role(&self.role)?,
        })
    }
}

impl DeviceRow {
    fn try_into_identity(self) -> Result<DeviceIdentity> {
        Ok(DeviceIdentity {
            device_id: self.device_id,
            device_type: parse_metric_type(&self.device_type)?,
            zone: self.zone,
            status: parse_device_status(&self.status)?,
        })
    }
}

fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| Error::Internal(format!("failed to hash password: {error}")))
}

fn verify_password(password_hash: &str, password: &str) -> Result<()> {
    let parsed_hash = PasswordHash::new(password_hash)
        .map_err(|error| Error::Internal(format!("stored password hash is invalid: {error}")))?;

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| Error::Unauthorized("invalid credentials".into()))
}

fn parse_role(value: &str) -> Result<Role> {
    match value {
        "operator" => Ok(Role::Operator),
        "admin" => Ok(Role::Admin),
        "viewer" => Ok(Role::Viewer),
        other => Err(Error::Internal(format!("unknown role: {other}"))),
    }
}

fn role_label(role: &Role) -> &'static str {
    match role {
        Role::Operator => "operator",
        Role::Admin => "admin",
        Role::Viewer => "viewer",
    }
}

fn parse_metric_type(value: &str) -> Result<MetricType> {
    match value {
        "temperature" => Ok(MetricType::Temperature),
        "humidity" => Ok(MetricType::Humidity),
        "air_quality" => Ok(MetricType::AirQuality),
        "noise_level" => Ok(MetricType::NoiseLevel),
        other => Err(Error::Internal(format!("unknown metric type: {other}"))),
    }
}

fn parse_device_status(value: &str) -> Result<DeviceStatus> {
    match value {
        "active" => Ok(DeviceStatus::Active),
        "inactive" => Ok(DeviceStatus::Inactive),
        "revoked" => Ok(DeviceStatus::Revoked),
        other => Err(Error::Internal(format!("unknown device status: {other}"))),
    }
}

fn device_status_label(status: &DeviceStatus) -> &'static str {
    match status {
        DeviceStatus::Active => "active",
        DeviceStatus::Inactive => "inactive",
        DeviceStatus::Revoked => "revoked",
    }
}
