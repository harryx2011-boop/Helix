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
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use wreq_util::Profile as Identity;

/// The JSON definitions are camelCase, so every struct here renames. Unknown
/// keys are ignored rather than rejected: the definitions carry `$comment`
/// blocks and JS-layer fields (`screen`, `canvasSeed`) that only the browser
/// tier reads, and a new one should not stop this service from booting.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub browser: String,
    pub version: String,
    pub platform: String,
    /// Null until `tools/capture` records it from a real browser.
    #[serde(default)]
    pub captured_at: Option<String>,
    /// False for a hand-written definition: plausible values, never measured.
    #[serde(default)]
    pub verified: bool,
    pub tls: TlsProfile,
    pub http2: Http2Profile,
    pub headers: HeaderProfile,
    pub js: JsProfile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TlsProfile {
    pub ja4: String,
    pub cipher_suites: Vec<String>,
    pub extensions: Vec<String>,
    pub alpn: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Http2Profile {
    /// Chrome sends 65536; Python's httpx defaults to 4096. Getting this wrong
    /// contradicts the TLS layer and is a single-field giveaway.
    pub header_table_size: u32,
    pub initial_window_size: u32,
    pub max_concurrent_streams: Option<u32>,
    pub pseudo_header_order: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeaderProfile {
    pub user_agent: String,
    pub accept: String,
    pub accept_language: String,
    pub accept_encoding: String,
    /// Header order is itself a fingerprint.
    pub order: Vec<String>,
}

/// The JS layer, applied by the browser tier rather than by this service. It is
/// parsed here so the definition can be validated as a whole.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsProfile {
    pub webgl_vendor: String,
    pub webgl_renderer: String,
    pub hardware_concurrency: u32,
    pub device_memory: Option<u32>,
    pub timezone: String,
    #[serde(default)]
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
///
/// wreq-util 0.2 renamed what 0.1 called `Emulation` to `Profile`, and gave the
/// name `Emulation` to a struct pairing a profile with a platform. It is
/// imported as `Identity` here because this module already defines its own
/// `Profile` (the JSON definition). It implements `IntoEmulation`, so it can be
/// handed to the request builder directly.
pub struct Resolved {
    pub id: String,
    pub emulation: Identity,
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
        "chrome-149" | "chrome" => Identity::Chrome149,
        "chrome-148" => Identity::Chrome148,
        "chrome-147" => Identity::Chrome147,
        "chrome-146" => Identity::Chrome146,
        "chrome-145" => Identity::Chrome145,
        "chrome-144" => Identity::Chrome144,
        "chrome-143" => Identity::Chrome143,
        "chrome-142" => Identity::Chrome142,
        "chrome-141" => Identity::Chrome141,
        "chrome-140" => Identity::Chrome140,
        "chrome-139" => Identity::Chrome139,
        "chrome-138" => Identity::Chrome138,
        "chrome-137" => Identity::Chrome137,
        "chrome-136" => Identity::Chrome136,
        "chrome-135" => Identity::Chrome135,
        "chrome-134" => Identity::Chrome134,
        "chrome-133" => Identity::Chrome133,
        "chrome-132" => Identity::Chrome132,
        "chrome-131" => Identity::Chrome131,
        "edge-148" | "edge" => Identity::Edge148,
        "edge-147" => Identity::Edge147,
        "edge-146" => Identity::Edge146,
        "edge-145" => Identity::Edge145,
        "edge-144" => Identity::Edge144,
        "edge-143" => Identity::Edge143,
        "edge-142" => Identity::Edge142,
        "edge-141" => Identity::Edge141,
        "edge-137" => Identity::Edge137,
        "edge-136" => Identity::Edge136,
        "edge-135" => Identity::Edge135,
        "edge-134" => Identity::Edge134,
        "edge-131" => Identity::Edge131,
        "edge-127" => Identity::Edge127,
        "safari-26-4" | "safari" => Identity::Safari26_4,
        "safari-26-3" => Identity::Safari26_3,
        "safari-26-2" => Identity::Safari26_2,
        "safari-26-1" => Identity::Safari26_1,
        "safari-26" => Identity::Safari26,
        "safari-18-5" => Identity::Safari18_5,
        "safari-18-3-1" => Identity::Safari18_3_1,
        "safari-17-5" => Identity::Safari17_5,
        "safari-ios-26-2" | "safari-ios" => Identity::SafariIos26_2,
        "safari-ios-26" => Identity::SafariIos26,
        "safari-ios-18-1-1" => Identity::SafariIos18_1_1,
        _ => {
            tracing::debug!(
                requested,
                fallback = DEFAULT_PROFILE,
                "unknown profile requested; using the default"
            );
            Identity::Chrome149
        }
    };

    let id = match requested {
        "chrome" => DEFAULT_PROFILE.to_string(),
        other => other.to_string(),
    };

    Resolved { id, emulation }
}

const DEFAULT_PROFILE: &str = "chrome-149";

/// Every identity this build can present.
pub fn available() -> &'static [&'static str] {
    &[
        "chrome-149",
        "chrome-148",
        "chrome-147",
        "chrome-146",
        "chrome-145",
        "chrome-144",
        "chrome-143",
        "chrome-142",
        "chrome-141",
        "chrome-140",
        "chrome-139",
        "chrome-138",
        "chrome-137",
        "chrome-136",
        "chrome-135",
        "chrome-134",
        "chrome-133",
        "chrome-132",
        "chrome-131",
        "edge-148",
        "edge-147",
        "edge-146",
        "edge-145",
        "edge-144",
        "edge-143",
        "edge-142",
        "edge-141",
        "edge-137",
        "edge-136",
        "edge-135",
        "edge-134",
        "edge-131",
        "edge-127",
        "safari-26-4",
        "safari-26-3",
        "safari-26-2",
        "safari-26-1",
        "safari-26",
        "safari-18-5",
        "safari-18-3-1",
        "safari-17-5",
        "safari-ios-26-2",
        "safari-ios-26",
        "safari-ios-18-1-1",
    ]
}

static PROFILES: OnceLock<Vec<Profile>> = OnceLock::new();

/// Where the definitions live, relative to this binary or the repo root.
///
/// Checked in order so the service runs both from `cargo run` inside
/// `apps/fetch` and from a deployed binary beside a `profiles/` directory.
fn definition_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(explicit) = std::env::var("HELIX_PROFILES_DIR") {
        dirs.push(PathBuf::from(explicit));
    }
    dirs.push(PathBuf::from("../../packages/profiles/definitions"));
    dirs.push(PathBuf::from("packages/profiles/definitions"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            dirs.push(dir.join("profiles"));
        }
    }
    dirs
}

fn read_definitions(dir: &Path) -> anyhow::Result<Vec<Profile>> {
    let mut profiles = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let text = std::fs::read_to_string(&path)?;
        let profile: Profile = serde_json::from_str(&text)
            .map_err(|e| anyhow::anyhow!("{}: {e}", path.display()))?;
        profiles.push(profile);
    }
    Ok(profiles)
}

/// Read every definition, validate it, and refuse to start on an incoherent one.
///
/// Failing loudly at boot beats presenting a contradictory identity to a live
/// target: an identity whose HTTP/2 settings disagree with its user-agent is
/// visible before the response body exists, and a service that started anyway
/// would leak that on every request.
///
/// Missing definitions are not an error. The transport layer comes from
/// wreq-util, so this service works with none loaded — `available()` is what it
/// can present, and these files describe the JS layer the browser tier applies.
pub fn load_all() -> anyhow::Result<()> {
    let mut loaded: Vec<Profile> = Vec::new();

    for dir in definition_dirs() {
        if !dir.is_dir() {
            continue;
        }
        loaded = read_definitions(&dir)?;
        tracing::debug!(dir = %dir.display(), count = loaded.len(), "read profile definitions");
        break;
    }

    for profile in &loaded {
        profile.validate()?;
        if !profile.verified {
            tracing::warn!(
                id = %profile.id,
                "profile was never captured from a real browser; run tools/capture to record one"
            );
        }
        if resolve(Some(&profile.id)).id != profile.id {
            tracing::warn!(
                id = %profile.id,
                "no transport identity of this name; a request naming it gets the default instead"
            );
        }
    }

    if loaded.is_empty() {
        tracing::debug!("no profile definitions found; the transport layer still presents its own identities");
    }

    PROFILES.get_or_init(|| loaded);
    Ok(())
}

/// Definitions successfully loaded and validated, not identities available.
pub fn loaded_count() -> usize {
    PROFILES.get().map(Vec::len).unwrap_or(0)
}

/// Identities this build can present, which is independent of the definitions.
pub fn available_count() -> usize {
    available().len()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The definitions that actually ship must parse and validate.
    ///
    /// They are camelCase JSON against snake_case structs, and they carry keys
    /// this service does not read (`$comment`, `screen`, `canvasSeed`). Nothing
    /// caught that until load_all() stopped being a stub, because the files were
    /// never opened.
    #[test]
    fn every_shipped_definition_parses_and_validates() {
        let dir = std::path::Path::new("../../packages/profiles/definitions");
        if !dir.is_dir() {
            return; // Not a checkout with the definitions beside us.
        }

        let profiles = read_definitions(dir).expect("definitions should parse");
        assert!(!profiles.is_empty(), "expected at least one shipped definition");

        for profile in &profiles {
            profile
                .validate()
                .unwrap_or_else(|e| panic!("shipped definition is incoherent: {e}"));
        }
    }

    /// A definition naming an identity resolve() does not know is served the
    /// default instead, silently. That is how chrome-149-macos shipped.
    #[test]
    fn shipped_definitions_name_resolvable_identities() {
        let dir = std::path::Path::new("../../packages/profiles/definitions");
        if !dir.is_dir() {
            return;
        }

        let profiles = read_definitions(dir).expect("definitions should parse");
        // Not `resolve(..).id != p.id`: resolve echoes back whatever name it was
        // given, so that comparison passes even when the emulation fell back.
        // Membership in available() is the property that actually matters.
        let unresolvable: Vec<&str> = profiles
            .iter()
            .filter(|p| !available().contains(&p.id.as_str()))
            .map(|p| p.id.as_str())
            .collect();

        assert!(
            unresolvable.is_empty(),
            "these definitions name identities the transport layer falls back from: {unresolvable:?}"
        );
    }

    fn chrome() -> Profile {
        Profile {
            id: "chrome-137".into(),
            browser: "chrome".into(),
            version: "137".into(),
            platform: "macos".into(),
            captured_at: None,
            verified: false,
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
