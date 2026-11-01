"""Which addresses this instance may fetch.

Ported from apps/fetch/src/main.rs (`is_private_*`) and resolver.rs (`public_only`) so the
Python service refuses exactly what the Rust one did: loopback, private, link-local, CGNAT,
benchmarking, multicast and reserved ranges, and the IPv6 forms that carry an IPv4 address.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket

_RFC1918 = [ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]


def _is_private_v4(ip: ipaddress.IPv4Address) -> bool:
    a, b = ip.packed[0], ip.packed[1]
    return (
        a == 0  # 0.0.0.0/8 is "this network" as a whole, not only the unspecified address
        or ip.is_loopback
        or any(ip in net for net in _RFC1918)
        or ip.is_link_local
        or ip.is_multicast
        or (a == 100 and 64 <= b <= 127)  # CGNAT
        or (a == 192 and b == 0)
        or (a == 198 and b in (18, 19))  # benchmarking
        or a >= 240  # reserved, and 255.255.255.255
    )


def _v4_from_groups(high: int, low: int) -> ipaddress.IPv4Address:
    return ipaddress.IPv4Address((high << 16) | low)


def _is_private_v6(ip: ipaddress.IPv6Address) -> bool:
    if ip.ipv4_mapped is not None:
        return _is_private_v4(ip.ipv4_mapped)
    groups = [int.from_bytes(ip.packed[i : i + 2], "big") for i in range(0, 16, 2)]
    # 64:ff9b::/96 (NAT64) carries a v4 address in the last two groups.
    if groups[:6] == [0x64, 0xFF9B, 0, 0, 0, 0]:
        return _is_private_v4(_v4_from_groups(groups[6], groups[7]))
    # 2002::/16 (6to4) embeds a v4 address in groups 1 and 2.
    if groups[0] == 0x2002:
        return _is_private_v4(_v4_from_groups(groups[1], groups[2]))
    # ::/96 covers ::, ::1 and the deprecated v4-compatible form (::7f00:1);
    # fec0::/10 is deprecated site-local.
    return (
        groups[:6] == [0] * 6
        or ip.is_multicast
        or (groups[0] & 0xFE00) == 0xFC00
        or (groups[0] & 0xFFC0) == 0xFE80
        or (groups[0] & 0xFFC0) == 0xFEC0
    )


def is_private_ip(text: str) -> bool:
    """True for a private, local or reserved address. An unreadable address counts as private."""
    try:
        ip = ipaddress.ip_address(text.strip().strip("[]"))
    except ValueError:
        return True
    if isinstance(ip, ipaddress.IPv4Address):
        return _is_private_v4(ip)
    return _is_private_v6(ip)


def is_private_host(host: str | None) -> bool:
    """The literal-only check: an address, or a name that is local by definition.

    No DNS, so it is cheap enough to run on every redirect hop. A missing host is refused.
    """
    if not host:
        return True
    host = host.strip("[]")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        name = host.rstrip(".").lower()
        return name == "localhost" or name.endswith(".localhost")
    return is_private_ip(host)


def public_only(addresses: list[str]) -> list[str]:
    """Every answer must be public; an empty answer is a failed lookup."""
    if not addresses:
        raise ValueError("name did not resolve")
    for address in addresses:
        if is_private_ip(address):
            raise ValueError(f"resolves to a private or local address ({address})")
    return addresses


async def lookup_public(host: str, port: int) -> list[str]:
    """Resolve `host` once and return its addresses, or ValueError when any answer is private.

    The caller connects to exactly these addresses, so a second lookup cannot swap a private
    one in (DNS rebinding).
    """
    try:
        found = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise ConnectionError(f"dns error: {error}") from error
    return public_only(list(dict.fromkeys(str(info[4][0]) for info in found)))
