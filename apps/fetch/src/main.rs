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
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::{Duration, Instant};
use wreq::redirect;
use url::Url;

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
    /// Operator opt-in. Off, the request and every redirect hop must resolve
    /// to a public address; the core has already checked the URL it sends, and
    /// this closes the redirect that a check-before-fetch cannot see.
    #[serde(default)]
    allow_private: bool,
}

fn default_timeout_ms() -> u64 {
    30_000
}
fn default_true() -> bool {
    true
}

/// Loopback, link-local, private-range, multicast or reserved.
fn is_private_v4(ip: Ipv4Addr) -> bool {
    let [a, b, _, _] = ip.octets();
    ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_multicast()
        || ip.is_broadcast()
        || (a == 100 && (64..=127).contains(&b))
        || (a == 192 && b == 0)
        || (a == 198 && (b == 18 || b == 19))
        || a >= 240
}

fn is_private_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return is_private_v4(v4);
    }
    let segments = ip.segments();
    // 64:ff9b::/96 (NAT64) carries a v4 address in the last two groups.
    if segments[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
        return is_private_v4(Ipv4Addr::from(
            ((segments[6] as u32) << 16) | segments[7] as u32,
        ));
    }
    ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_multicast()
        || (segments[0] & 0xfe00) == 0xfc00
        || (segments[0] & 0xffc0) == 0xfe80
}

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_private_v4(v4),
        IpAddr::V6(v6) => is_private_v6(v6),
    }
}

/// The literal-only check: an address, or a name that is local by definition.
/// No DNS, so it is cheap enough to run on every redirect hop.
/// Takes the host rather than a URL type: wreq 0.16 replaced `Url` with
/// `http::Uri`, and this guard only ever needed the host. A missing host is
/// treated as private, so a URL we cannot read a host from is refused rather
/// than allowed.
fn is_private_host(host: Option<&str>) -> bool {
    let Some(host) = host else {
        return true;
    };
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_private_ip(ip);
    }
    let name = host.trim_end_matches('.').to_ascii_lowercase();
    name == "localhost" || name.ends_with(".localhost")
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
    /// Identities this build can present. Unchanged in meaning since 0.1.
    profiles_loaded: usize,
    /// JSON definitions read and validated at boot. These describe the JS layer
    /// the browser tier applies, and are independent of the count above.
    definitions_loaded: usize,
}

async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        profiles_loaded: profile::available_count(),
        definitions_loaded: profile::loaded_count(),
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

    if !req.allow_private {
        builder = builder.redirect(redirect::Policy::custom(|attempt| {
            if is_private_host(attempt.uri.host()) {
                attempt.error("redirected to a private or local address")
            } else if attempt.previous.len() >= 10 {
                attempt.error("too many redirects")
            } else {
                attempt.follow()
            }
        }));
    }

    Ok((builder.build()?, profile_used))
}

async fn fetch(Json(req): Json<FetchRequest>) -> Json<FetchResponse> {
    let started = Instant::now();
    let elapsed = |t: Instant| t.elapsed().as_millis() as u64;

    if !req.allow_private {
        match Url::parse(&req.url) {
            Ok(url) if !is_private_host(url.host_str()) => {}
            Ok(_) => {
                return Json(FetchResponse::failure(
                    "private or local address, which this instance does not fetch",
                    elapsed(started),
                ))
            }
            Err(error) => {
                return Json(FetchResponse::failure(
                    format!("invalid url: {error}"),
                    elapsed(started),
                ))
            }
        }
    }

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
    let final_url = response.uri().to_string();

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
    // The desktop app binds loopback only; the container default stays open for compose.
    let host: std::net::IpAddr = std::env::var("HELIX_FETCH_HOST")
        .unwrap_or_else(|_| "0.0.0.0".into())
        .parse()?;
    let addr = SocketAddr::from((host, port));

    tracing::info!(
        %addr,
        profiles = profile::available_count(),
        definitions = profile::loaded_count(),
        "helix-fetch listening"
    );

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
