//! helix-fetch — the TLS-impersonating fetch tier.
//!
//! Tiers 0 and 1 of the escalation ladder live here: a plain HTTP fetch, and one
//! that presents a coherent browser identity at the transport layer.
//!
//! Why a separate service in a third language: detection happens before a single
//! byte of HTML is read. A ClientHello produced by a general-purpose HTTP client
//! does not match any real browser, and JA4 fingerprinting is universally
//! deployed. Shaping the handshake needs a client that exposes it, and this is
//! also the one layer on the hot path for every page fetched.
//!
//! This service reports what happened at the transport layer and applies no
//! policy of its own. Block classification lives in the core, so the rules stay
//! in one place and stay testable without a network.

mod profile;

use axum::{
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::{Duration, Instant};

#[derive(Debug, Deserialize)]
struct FetchRequest {
    url: String,
    /// Browser identity to present. Omit for an automatic choice.
    #[serde(default)]
    profile: Option<String>,
    /// Proxy, supplied by the operator. Helix ships no pool of its own.
    #[serde(default)]
    proxy: Option<String>,
    #[serde(default)]
    headers: Option<HashMap<String, String>>,
    #[serde(default = "default_timeout_ms")]
    timeout_ms: u64,
    /// False for tier 0 (plain), true for tier 1 (impersonating).
    #[serde(default = "default_true")]
    impersonate: bool,
}

fn default_timeout_ms() -> u64 {
    30_000
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize)]
struct FetchResponse {
    success: bool,
    status: Option<u16>,
    headers: HashMap<String, String>,
    body: Option<String>,
    /// Which identity was actually presented, so a failure can be reproduced.
    profile_used: Option<String>,
    final_url: Option<String>,
    timing_ms: u64,
    error: Option<String>,
}

impl FetchResponse {
    fn failure(error: impl Into<String>, timing_ms: u64) -> Self {
        Self {
            success: false,
            status: None,
            headers: HashMap::new(),
            body: None,
            profile_used: None,
            final_url: None,
            timing_ms,
            error: Some(error.into()),
        }
    }
}

#[derive(Debug, Serialize)]
struct Health {
    status: &'static str,
    version: &'static str,
    profiles_loaded: usize,
}

async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        profiles_loaded: profile::loaded_count(),
    })
}

/// Build a client for one request.
///
/// A client is not reused across requests because identity and proxy vary per
/// call, and a pooled connection carries the previous identity's TLS session
/// with it — which would defeat the point of choosing a profile at all.
fn build_client(req: &FetchRequest) -> anyhow::Result<(wreq::Client, Option<String>)> {
    let mut builder = wreq::Client::builder().timeout(Duration::from_millis(req.timeout_ms));

    let mut profile_used = None;

    if req.impersonate {
        let resolved = profile::resolve(req.profile.as_deref());
        builder = builder.emulation(resolved.emulation);
        profile_used = Some(resolved.id);
    }

    if let Some(proxy) = &req.proxy {
        builder = builder.proxy(wreq::Proxy::all(proxy)?);
    }

    Ok((builder.build()?, profile_used))
}

async fn fetch(Json(req): Json<FetchRequest>) -> Json<FetchResponse> {
    let started = Instant::now();
    let elapsed = |t: Instant| t.elapsed().as_millis() as u64;

    let (client, profile_used) = match build_client(&req) {
        Ok(pair) => pair,
        Err(error) => {
            return Json(FetchResponse::failure(
                format!("failed to build client: {error}"),
                elapsed(started),
            ))
        }
    };

    let mut request = client.get(&req.url);

    // Caller headers are applied last so they win over the profile's defaults.
    // Someone who explicitly sets a header meant it, even if it weakens the
    // identity — that is their call to make, not ours to silently override.
    if let Some(headers) = &req.headers {
        for (name, value) in headers {
            request = request.header(name, value);
        }
    }

    let response = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            // Distinguish the transport failures the core routes differently.
            let reason = if error.is_timeout() {
                format!("timeout after {}ms", req.timeout_ms)
            } else if error.is_connect() {
                format!("connection failed: {error}")
            } else {
                format!("request failed: {error}")
            };
            return Json(FetchResponse::failure(reason, elapsed(started)));
        }
    };

    let status = response.status().as_u16();
    let final_url = response.url().to_string();

    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|v| (name.as_str().to_lowercase(), v.to_string()))
        })
        .collect::<HashMap<_, _>>();

    // A body that fails to decode is still a real answer about the transport —
    // report the status and headers rather than discarding everything.
    let body = match response.text().await {
        Ok(text) => Some(text),
        Err(error) => {
            tracing::debug!(%error, url = %req.url, "failed to read body");
            None
        }
    };

    Json(FetchResponse {
        success: true,
        status: Some(status),
        headers,
        body,
        profile_used,
        final_url: Some(final_url),
        timing_ms: elapsed(started),
        error: None,
    })
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Support the container healthcheck without needing curl in the image.
    if std::env::args().any(|a| a == "--healthcheck") {
        let port = std::env::var("HELIX_FETCH_PORT").unwrap_or_else(|_| "7401".into());
        let url = format!("http://localhost:{port}/health");
        return match healthcheck(&url).await {
            Ok(true) => Ok(()),
            _ => std::process::exit(1),
        };
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    profile::load_all()?;

    let app = Router::new()
        .route("/health", get(health))
        .route("/fetch", post(fetch));

    let port: u16 = std::env::var("HELIX_FETCH_PORT")
        .unwrap_or_else(|_| "7401".into())
        .parse()?;
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    tracing::info!(%addr, profiles = profile::loaded_count(), "helix-fetch listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn healthcheck(url: &str) -> anyhow::Result<bool> {
    let client = wreq::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()?;
    Ok(client
        .get(url)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false))
}
