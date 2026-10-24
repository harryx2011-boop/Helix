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
mod resolver;
mod service_auth;

use resolver::PublicOnlyResolver;

use axum::{
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::{LazyLock, Mutex, PoisonError};
use std::time::{Duration, Instant};
use http_body_util::{BodyExt, LengthLimitError, Limited};
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
    // 2002::/16 (6to4) embeds a v4 address in groups 1 and 2.
    if segments[0] == 0x2002 {
        return is_private_v4(Ipv4Addr::from(
            ((segments[1] as u32) << 16) | segments[2] as u32,
        ));
    }
    // ::/96 covers ::, ::1 and the deprecated v4-compatible form (::7f00:1);
    // fec0::/10 is deprecated site-local.
    segments[..6] == [0, 0, 0, 0, 0, 0]
        || ip.is_multicast()
        || (segments[0] & 0xfe00) == 0xfc00
        || (segments[0] & 0xffc0) == 0xfe80
        || (segments[0] & 0xffc0) == 0xfec0
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
    /// Every Set-Cookie value; `headers` keeps only one of them.
    set_cookies: Vec<String>,
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
            set_cookies: Vec::new(),
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

/// Everything a client's identity is made of. `profile` is None for the plain tier.
#[derive(Clone, PartialEq, Eq, Hash)]
struct ClientKey {
    profile: Option<String>,
    proxy: Option<String>,
    allow_private: bool,
}

// ponytail: cleared wholesale past 64 keys; LRU if callers rotate many proxies.
const MAX_CLIENTS: usize = 64;
static CLIENTS: LazyLock<Mutex<HashMap<ClientKey, wreq::Client>>> =
    LazyLock::new(Default::default);

static MAX_BODY_BYTES: LazyLock<usize> = LazyLock::new(|| {
    std::env::var("HELIX_FETCH_MAX_BODY_BYTES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10 * 1024 * 1024)
});

/// The client for this request's identity, built on first use.
///
/// Clients are shared only between requests with the same key, so a pooled
/// connection never carries another identity's TLS session — which would
/// defeat the point of choosing a profile at all.
fn client_for(req: &FetchRequest) -> anyhow::Result<(wreq::Client, Option<String>)> {
    let resolved = req
        .impersonate
        .then(|| profile::resolve(req.profile.as_deref()));
    let key = ClientKey {
        profile: resolved.as_ref().map(|r| r.id.clone()),
        proxy: req.proxy.clone(),
        allow_private: req.allow_private,
    };

    let mut clients = CLIENTS.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some(client) = clients.get(&key) {
        return Ok((client.clone(), key.profile));
    }

    let mut builder = wreq::Client::builder();

    if let Some(resolved) = resolved {
        builder = builder.emulation(resolved.emulation);
    }

    if let Some(proxy) = &req.proxy {
        builder = builder.proxy(wreq::Proxy::all(proxy)?);
    }

    // Through a proxy the proxy resolves the target, and the proxy host itself
    // was checked by the core (the operator's, or a caller's under the URL guard).
    if !req.allow_private && req.proxy.is_none() {
        builder = builder.dns_resolver(PublicOnlyResolver);
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

    let client = builder.build()?;
    if clients.len() >= MAX_CLIENTS {
        clients.clear();
    }
    clients.insert(key.clone(), client.clone());
    Ok((client, key.profile))
}

/// The error and every cause beneath it, so a DNS failure says "dns".
fn error_chain(error: &dyn std::error::Error) -> String {
    let mut text = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source {
        // wreq's Display already inlines some causes; skip the repeats.
        let cause_text = cause.to_string();
        if !text.contains(&cause_text) {
            text.push_str(": ");
            text.push_str(&cause_text);
        }
        source = cause.source();
    }
    text
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

    let (client, profile_used) = match client_for(&req) {
        Ok(pair) => pair,
        Err(error) => {
            return Json(FetchResponse::failure(
                format!("failed to build client: {error}"),
                elapsed(started),
            ))
        }
    };

    let mut request = client
        .get(&req.url)
        .timeout(Duration::from_millis(req.timeout_ms));

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
                format!("connection failed: {}", error_chain(&error))
            } else {
                format!("request failed: {}", error_chain(&error))
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

    let set_cookies = response
        .headers()
        .get_all(wreq::header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok().map(str::to_string))
        .collect();

    // The cap counts decoded bytes, so a compression bomb stops at it too.
    let max = *MAX_BODY_BYTES;
    let mut error = None;
    // A body that fails to decode is still a real answer about the transport —
    // report the status and headers rather than discarding everything.
    let body = match Limited::new(wreq::Body::from(response), max).collect().await {
        Ok(collected) => Some(String::from_utf8_lossy(&collected.to_bytes()).into_owned()),
        Err(e) if e.is::<LengthLimitError>() => {
            error = Some(format!("body exceeds {max} bytes"));
            None
        }
        Err(e) => {
            tracing::debug!(error = %e, url = %req.url, "failed to read body");
            None
        }
    };

    Json(FetchResponse {
        success: error.is_none(),
        status: Some(status),
        headers,
        set_cookies,
        body,
        profile_used,
        final_url: Some(final_url),
        timing_ms: elapsed(started),
        error,
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
        .route(
            "/fetch",
            post(fetch).route_layer(axum::middleware::from_fn(service_auth::require)),
        )
        .route("/health", get(health));

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    const BIG_BODY: usize = 11 * 1024 * 1024;

    fn gzip(data: &[u8]) -> Vec<u8> {
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(data).unwrap();
        encoder.finish().unwrap()
    }

    fn respond(head: &str) -> Vec<u8> {
        let path = head.split_whitespace().nth(1).unwrap_or("/");
        let accepts_gzip = head
            .lines()
            .any(|l| l.starts_with("accept-encoding:") && l.contains("gzip"));
        let mut extra = "";
        let body = match path {
            "/gzip" if accepts_gzip => {
                extra = "content-encoding: gzip\r\n";
                gzip(b"compressed hello")
            }
            "/gzip" => b"not compressed".to_vec(),
            "/big" => vec![b'x'; BIG_BODY],
            "/cookies" => {
                extra = "set-cookie: a=1; Path=/\r\nset-cookie: b=2; Path=/\r\n";
                b"ok".to_vec()
            }
            _ => head.as_bytes().to_vec(),
        };
        let mut out = format!("HTTP/1.1 200 OK\r\ncontent-length: {}\r\n{extra}\r\n", body.len())
            .into_bytes();
        out.extend(body);
        out
    }

    /// Keep-alive HTTP/1.1 server; `/echo` returns the lowercased request head.
    /// The counter is TCP connections accepted, which is how client reuse shows.
    async fn serve() -> (String, Arc<AtomicUsize>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let connections = Arc::new(AtomicUsize::new(0));
        let counter = connections.clone();
        tokio::spawn(async move {
            loop {
                let (mut socket, _) = listener.accept().await.unwrap();
                counter.fetch_add(1, Ordering::SeqCst);
                tokio::spawn(async move {
                    let mut buf = Vec::new();
                    let mut chunk = [0u8; 4096];
                    loop {
                        let n = match socket.read(&mut chunk).await {
                            Ok(0) | Err(_) => return,
                            Ok(n) => n,
                        };
                        buf.extend_from_slice(&chunk[..n]);
                        while let Some(end) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                            let head = String::from_utf8_lossy(&buf[..end + 4]).to_lowercase();
                            buf.drain(..end + 4);
                            if socket.write_all(&respond(&head)).await.is_err() {
                                return;
                            }
                        }
                    }
                });
            }
        });
        (base, connections)
    }

    async fn call(body: serde_json::Value) -> FetchResponse {
        fetch(Json(serde_json::from_value(body).unwrap())).await.0
    }

    #[tokio::test]
    async fn tls_tier_asks_for_compression_like_chrome_and_decodes_it() {
        let (base, _) = serve().await;
        let echo = call(serde_json::json!({ "url": format!("{base}/echo"), "allow_private": true })).await;
        let head = echo.body.unwrap();
        assert!(
            head.contains("accept-encoding: gzip, deflate, br, zstd\r\n"),
            "no Chrome accept-encoding in: {head}"
        );

        let res = call(serde_json::json!({ "url": format!("{base}/gzip"), "allow_private": true })).await;
        assert_eq!(res.body.as_deref(), Some("compressed hello"));
    }

    #[tokio::test]
    async fn same_identity_reuses_a_client_and_another_identity_does_not() {
        let (base, connections) = serve().await;
        let plain = serde_json::json!({ "url": format!("{base}/echo"), "allow_private": true, "impersonate": false });

        call(plain.clone()).await;
        tokio::time::sleep(Duration::from_millis(100)).await;
        call(plain).await;
        assert_eq!(connections.load(Ordering::SeqCst), 1, "same key opened a second connection");

        call(serde_json::json!({ "url": format!("{base}/echo"), "allow_private": true, "profile": "edge-148" })).await;
        assert_eq!(connections.load(Ordering::SeqCst), 2, "another identity shared a connection");
    }

    #[tokio::test]
    async fn body_over_the_cap_is_refused() {
        let (base, _) = serve().await;
        let res = call(serde_json::json!({ "url": format!("{base}/big"), "allow_private": true })).await;
        assert!(res.body.is_none());
        let error = res.error.unwrap_or_default();
        assert!(error.starts_with("body exceeds "), "got error {error:?}");
        assert_eq!(res.status, Some(200));
    }

    #[tokio::test]
    async fn default_identity_presents_windows() {
        let (base, _) = serve().await;
        let res = call(serde_json::json!({ "url": format!("{base}/echo"), "allow_private": true })).await;
        let head = res.body.unwrap();
        assert!(head.contains("sec-ch-ua-platform: \"windows\"\r\n"), "head: {head}");
        assert!(head.contains("user-agent: mozilla/5.0 (windows nt 10.0; win64; x64)"), "head: {head}");
    }

    #[tokio::test]
    async fn transport_error_keeps_its_dns_cause() {
        let res = call(serde_json::json!({ "url": "https://nonexistent-host-helix-test.invalid/" })).await;
        let error = res.error.unwrap_or_default();
        assert!(error.to_lowercase().contains("dns"), "got error {error:?}");
    }

    #[tokio::test]
    async fn every_set_cookie_survives() {
        let (base, _) = serve().await;
        let res = call(serde_json::json!({ "url": format!("{base}/cookies"), "allow_private": true })).await;
        let json = serde_json::to_value(&res).unwrap();
        assert_eq!(json["set_cookies"], serde_json::json!(["a=1; Path=/", "b=2; Path=/"]));
        assert!(json["headers"]["set-cookie"].is_string());
    }
}
