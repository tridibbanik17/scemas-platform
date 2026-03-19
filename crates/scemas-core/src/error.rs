use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("validation failed: {0}")]
    Validation(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("unauthorized: {0}")]
    Unauthorized(String),

    #[error("forbidden: {0}")]
    Forbidden(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("internal error: {0}")]
    Internal(String),
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let status = match &self {
            Error::Validation(_) => StatusCode::BAD_REQUEST,
            Error::NotFound(_) => StatusCode::NOT_FOUND,
            Error::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            Error::Forbidden(_) => StatusCode::FORBIDDEN,
            Error::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Error::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        let body = serde_json::json!({
            "error": self.to_string(),
        });

        (status, axum::Json(body)).into_response()
    }
}

pub type Result<T> = std::result::Result<T, Error>;
