//! The shared secret between the API and this service.
//!
//! When `HELIX_SERVICE_TOKEN` is set, `/fetch` answers only a request that
//! carries it, so another process or container that can reach the port cannot
//! use this service (and its `allow_private` switch) directly. `/health` stays
//! open for the container and desktop health checks. Unset keeps the old,
//! open behaviour for setups that bind loopback only.

use axum::{
    extract::Request,
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::sync::LazyLock;

pub const HEADER: &str = "x-helix-service-token";

static EXPECTED: LazyLock<Option<String>> = LazyLock::new(|| {
    std::env::var("HELIX_SERVICE_TOKEN")
        .ok()
        .filter(|v| !v.is_empty())
});

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// True when no token is configured, or the request carries the configured one.
pub fn token_ok(headers: &HeaderMap, expected: Option<&str>) -> bool {
    let Some(expected) = expected else {
        return true;
    };
    let presented = headers
        .get(HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    constant_time_eq(presented.as_bytes(), expected.as_bytes())
}

pub async fn require(request: Request, next: Next) -> Response {
    if token_ok(request.headers(), EXPECTED.as_deref()) {
        next.run(request).await
    } else {
        (StatusCode::UNAUTHORIZED, "missing or invalid service token").into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with(token: Option<&str>) -> HeaderMap {
        let mut headers = HeaderMap::new();
        if let Some(token) = token {
            headers.insert(HEADER, token.parse().unwrap());
        }
        headers
    }

    #[test]
    fn open_when_no_token_is_configured() {
        assert!(token_ok(&with(None), None));
    }

    #[test]
    fn refuses_a_missing_or_wrong_token() {
        assert!(!token_ok(&with(None), Some("secret-token")));
        assert!(!token_ok(&with(Some("secret-tokeX")), Some("secret-token")));
        assert!(!token_ok(&with(Some("secret")), Some("secret-token")));
    }

    #[test]
    fn accepts_the_configured_token() {
        assert!(token_ok(&with(Some("secret-token")), Some("secret-token")));
    }
}
