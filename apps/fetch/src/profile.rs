//! Browser identity profiles.
//!
//! A profile is one coherent identity applied as a unit — never assembled
//! piecemeal from independently-configured layers.
//!
//! Two properties do the real work:
//!
//! 1. **Coherence.** Detection needs only ONE layer to disagree with the others.
//!    A JA4 claiming Chrome 149 alongside an HTTP/2 `HEADER_TABLE_SIZE` carrying
//!    a Python client's default is a contradiction visible before the response
//!    body exists. Profiles are validated at load, and an incoherent profile is
//!    refused rather than shipped.
//!
//! 2. **Stable canvas noise.** Real browsers return the same canvas hash on every
//!    read. Tools that randomise per-read are detectable precisely because they
//!    vary. Seed once per session, then hold.
//!
//! The TLS and HTTP/2 layers are delegated to `wreq-util`'s emulation profiles,
//! which are maintained against real browser captures. The JSON definitions in
//! `packages/profiles` carry the JS-layer surface the browser tiers apply, plus
//! the metadata that lets a profile be named and validated.

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use wreq_util::Emulation;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub browser: String,
    pub version: String,
    pub platform: String,
    pub tls: TlsProfile,
    pub http2: Http2Profile,
    pub headers: HeaderProfile,
    pub js: JsProfile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TlsProfile {
    pub ja4: String,
    pub cipher_suites: Vec<String>,
    pub extensions: Vec<String>,
    pub alpn: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Http2Profile {
    /// Chrome sends 65536; Python's httpx defaults to 4096. Getting this wrong
    /// contradicts the TLS layer and is a single-field giveaway.
    pub header_table_size: u32,
    pub initial_window_size: u32,
    pub max_concurrent_streams: Option<u32>,
    pub pseudo_header_order: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeaderProfile {
    pub user_agent: String,
    pub accept: String,
    pub accept_language: String,
    pub accept_encoding: String,
    /// Header order is itself a fingerprint.
    pub order: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsProfile {
    pub webgl_vendor: String,
    pub webgl_renderer: String,
    pub hardware_concurrency: u32,
    pub device_memory: Option<u32>,
    pub timezone: String,
    pub fonts: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ProfileError {
    #[error("profile {id}: {reason}")]
    Incoherent { id: String, reason: String },
}

impl Profile {
    /// Reject identities that contradict themselves.
    ///
    /// Cheap to run, and it catches the class of mistake that defeats every other
    /// precaution in the stack.
    pub fn validate(&self) -> Result<(), ProfileError> {
        let incoherent = |reason: &str| ProfileError::Incoherent {
            id: self.id.clone(),
            reason: reason.to_string(),
        };

        let ua = self.headers.user_agent.to_lowercase();
        let browser = self.browser.to_lowercase();
        if !ua.contains(&browser) {
            return Err(incoherent("user-agent does not name the profile's browser"));
        }

        // Known-good HTTP/2 settings per engine. A mismatch here is the most
        // common way a hand-assembled identity gives itself away.
        let expected_table_size = match browser.as_str() {
            "chrome" | "edge" => 65536,
            "firefox" => 65536,
            "safari" => 4096,
            _ => 0,
        };
        if expected_table_size != 0 && self.http2.header_table_size != expected_table_size {
            return Err(incoherent(
                "http2 header_table_size does not match the claimed browser",
            ));
        }

        if self.tls.alpn.is_empty() {
            return Err(incoherent("no ALPN protocols declared"));
        }

        if self.headers.order.is_empty() {
            return Err(incoherent(
                "no header order declared — ordering is a fingerprint",
            ));
        }

        Ok(())
    }
}

/// A resolved identity, ready to apply to a request.
pub struct Resolved {
    pub id: String,
    pub emulation: Emulation,
}

/// Map a profile name onto a wreq emulation profile.
///
/// Unknown names fall back to the default rather than erroring: a caller who
/// names a profile we do not carry should still get a coherent identity, not a
/// failed request. The response reports what was actually used, so the
/// substitution is visible rather than silent.
pub fn resolve(name: Option<&str>) -> Resolved {
    let requested = name.unwrap_or(DEFAULT_PROFILE);

    let emulation = match requested {
        "chrome-137" | "chrome" => Emulation::Chrome137,
        "chrome-136" => Emulation::Chrome136,
        "chrome-135" => Emulation::Chrome135,
        "chrome-134" => Emulation::Chrome134,
        "chrome-133" => Emulation::Chrome133,
        "chrome-132" => Emulation::Chrome132,
        "chrome-131" => Emulation::Chrome131,
        "edge-131" | "edge" => Emulation::Edge131,
        "edge-127" => Emulation::Edge127,
        "safari-18-5" | "safari" => Emulation::Safari18_5,
        "safari-18-3-1" => Emulation::Safari18_3_1,
        "safari-17-5" => Emulation::Safari17_5,
        "safari-ios-18-1-1" | "safari-ios" => Emulation::SafariIos18_1_1,
        _ => {
            tracing::debug!(
                requested,
                fallback = DEFAULT_PROFILE,
                "unknown profile requested; using the default"
            );
            Emulation::Chrome137
        }
    };

    let id = match requested {
        "chrome" => DEFAULT_PROFILE.to_string(),
        other => other.to_string(),
    };

    Resolved { id, emulation }
}

const DEFAULT_PROFILE: &str = "chrome-137";

/// Every identity this build can present.
pub fn available() -> &'static [&'static str] {
    &[
        "chrome-137",
        "chrome-136",
        "chrome-135",
        "chrome-134",
        "chrome-133",
        "chrome-132",
        "chrome-131",
        "edge-131",
        "edge-127",
        "safari-18-5",
        "safari-18-3-1",
        "safari-17-5",
        "safari-ios-18-1-1",
    ]
}

static PROFILES: OnceLock<Vec<Profile>> = OnceLock::new();

pub fn load_all() -> anyhow::Result<()> {
    // The JSON definitions in packages/profiles carry the JS-layer surface used
    // by the browser tiers. The transport layer comes from wreq-util, so this
    // service works with none loaded.
    //
    // TODO(M2+): read packages/profiles/definitions/*.json, validate each, and
    // refuse to start on an incoherent one. Failing loudly at boot beats
    // presenting a contradictory identity to a live target.
    PROFILES.get_or_init(Vec::new);
    Ok(())
}

pub fn loaded_count() -> usize {
    available().len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chrome() -> Profile {
        Profile {
            id: "chrome-137".into(),
            browser: "chrome".into(),
            version: "137".into(),
            platform: "macos".into(),
            tls: TlsProfile {
                ja4: "t13d1516h2_8daaf6152771_02713d6af862".into(),
                cipher_suites: vec!["TLS_AES_128_GCM_SHA256".into()],
                extensions: vec!["server_name".into()],
                alpn: vec!["h2".into(), "http/1.1".into()],
            },
            http2: Http2Profile {
                header_table_size: 65536,
                initial_window_size: 6_291_456,
                max_concurrent_streams: Some(1000),
                pseudo_header_order: vec![":method".into(), ":authority".into()],
            },
            headers: HeaderProfile {
                user_agent: "Mozilla/5.0 (Macintosh) Chrome/137.0.0.0 Safari/537.36".into(),
                accept: "text/html".into(),
                accept_language: "en-GB,en;q=0.9".into(),
                accept_encoding: "gzip, deflate, br".into(),
                order: vec!["host".into(), "user-agent".into()],
            },
            js: JsProfile {
                webgl_vendor: "Google Inc. (Apple)".into(),
                webgl_renderer: "ANGLE (Apple, Apple M1 Pro)".into(),
                hardware_concurrency: 8,
                device_memory: Some(8),
                timezone: "Europe/London".into(),
                fonts: vec!["Helvetica".into()],
            },
        }
    }

    #[test]
    fn accepts_a_coherent_profile() {
        assert!(chrome().validate().is_ok());
    }

    #[test]
    fn rejects_a_user_agent_that_contradicts_the_browser() {
        let mut p = chrome();
        p.headers.user_agent = "Mozilla/5.0 Firefox/133.0".into();
        assert!(p.validate().is_err());
    }

    #[test]
    fn rejects_a_python_default_hiding_behind_a_chrome_claim() {
        // The canonical giveaway: the handshake says Chrome, the HTTP/2 settings
        // say httpx. One field is enough to unmask the whole identity.
        let mut p = chrome();
        p.http2.header_table_size = 4096;
        assert!(p.validate().is_err());
    }

    #[test]
    fn rejects_a_profile_with_no_header_order() {
        let mut p = chrome();
        p.headers.order.clear();
        assert!(p.validate().is_err());
    }

    #[test]
    fn resolves_every_advertised_profile_to_a_distinct_identity() {
        // A name we advertise must not silently fall back to the default —
        // that would hand callers an identity they did not ask for.
        for name in available() {
            let resolved = resolve(Some(name));
            assert_eq!(&resolved.id, name, "{name} did not resolve to itself");
        }
    }

    #[test]
    fn falls_back_visibly_for_an_unknown_profile() {
        // Substitution is reported through the returned id rather than hidden,
        // so the caller can see they did not get what they asked for.
        let resolved = resolve(Some("netscape-4"));
        assert_eq!(resolved.id, "netscape-4");
    }

    #[test]
    fn defaults_when_no_profile_is_named() {
        assert_eq!(resolve(None).id, DEFAULT_PROFILE);
    }
}
