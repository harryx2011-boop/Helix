"""The private-address guard. Ported from apps/fetch/src/main.rs and resolver.rs."""

from __future__ import annotations

import pytest

from helix_scrape.guard import is_private_host, is_private_ip, public_only


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254",  # cloud metadata
        "0.0.0.0",
        "0.1.2.3",  # all of 0.0.0.0/8, not only the unspecified address
        "100.64.0.1",  # CGNAT
        "100.127.255.255",
        "192.0.0.1",
        "198.18.0.1",  # benchmarking
        "198.19.255.255",
        "224.0.0.1",  # multicast
        "240.0.0.1",
        "255.255.255.255",
        "::1",
        "::",
        "::7f00:1",  # deprecated v4-compatible form
        "fec0::1",  # deprecated site-local
        "fe80::1",
        "fc00::1",
        "ff02::1",
        "::ffff:127.0.0.1",  # v4-mapped
        "64:ff9b::7f00:1",  # NAT64 carrying loopback
        "2002:7f00:1::",  # 6to4 carrying loopback
        "2002:a9fe:a9fe::1",  # 6to4 carrying metadata
    ],
)
def test_private_ips_are_refused(ip: str) -> None:
    assert is_private_ip(ip), f"{ip} passed"


@pytest.mark.parametrize(
    "ip",
    [
        "93.184.216.34",
        "8.8.8.8",
        "100.63.255.255",
        "100.128.0.1",
        "198.17.0.1",
        "2002:5db8:d822::1",
        "2606:4700:4700::1111",
    ],
)
def test_public_ips_pass(ip: str) -> None:
    assert not is_private_ip(ip), f"{ip} was refused"


@pytest.mark.parametrize(
    "host",
    ["localhost", "LOCALHOST", "localhost.", "app.localhost", "127.0.0.1", "[::1]", "10.0.0.5"],
)
def test_local_hosts_are_refused(host: str) -> None:
    assert is_private_host(host)


def test_missing_host_is_refused_not_allowed() -> None:
    assert is_private_host(None)
    assert is_private_host("")


@pytest.mark.parametrize("host", ["example.com", "93.184.216.34", "notlocalhost.com"])
def test_public_hosts_pass_the_literal_check(host: str) -> None:
    assert not is_private_host(host)


def test_public_only_refuses_any_private_answer() -> None:
    assert public_only(["93.184.216.34"]) == ["93.184.216.34"]
    with pytest.raises(ValueError, match="private or local"):
        public_only(["127.0.0.1"])
    with pytest.raises(ValueError, match="private or local"):
        public_only(["93.184.216.34", "169.254.169.254"])


def test_public_only_refuses_an_empty_answer() -> None:
    with pytest.raises(ValueError, match="did not resolve"):
        public_only([])
