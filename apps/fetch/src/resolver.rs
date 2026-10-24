//! The DNS resolver used when private addresses are not allowed.
//!
//! The connection goes to the addresses checked here, so a second lookup
//! cannot swap a private one in, and every redirect hop resolves through it.
//! The literal check in the redirect policy still covers IP-literal hops,
//! which skip DNS.

use std::net::SocketAddr;
use wreq::dns::{Addrs, Name, Resolve, Resolving};

use crate::is_private_ip;

/// Every answer must be public; an empty answer is a failed lookup.
pub fn public_only(addrs: Vec<SocketAddr>) -> Result<Vec<SocketAddr>, String> {
    if addrs.is_empty() {
        return Err("name did not resolve".into());
    }
    if let Some(bad) = addrs.iter().find(|a| is_private_ip(a.ip())) {
        return Err(format!("resolves to a private or local address ({})", bad.ip()));
    }
    Ok(addrs)
}

/// Resolves a name and refuses it when any answer is not a public address.
pub struct PublicOnlyResolver;

impl Resolve for PublicOnlyResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_owned();
        Box::pin(async move {
            let found: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 0)).await?.collect();
            let addrs = public_only(found)?;
            Ok(Box::new(addrs.into_iter()) as Addrs)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_only_refuses_any_private_answer() {
        let public: SocketAddr = "93.184.216.34:0".parse().unwrap();
        let loopback: SocketAddr = "127.0.0.1:0".parse().unwrap();
        let metadata: SocketAddr = "169.254.169.254:0".parse().unwrap();
        assert!(public_only(vec![public]).is_ok());
        assert!(public_only(vec![loopback]).is_err());
        assert!(public_only(vec![public, metadata]).is_err());
        assert!(public_only(vec![]).is_err());
    }

    #[tokio::test]
    async fn resolver_refuses_a_name_that_resolves_to_loopback() {
        let result = PublicOnlyResolver.resolve(Name::from("localhost")).await;
        let error = result.err().map(|e| e.to_string()).unwrap_or_default();
        assert!(error.contains("private or local"), "got {error:?}");
    }
}
