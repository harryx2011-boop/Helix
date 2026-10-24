"""Metadata scanning and scrubbing — EXIF, XMP, PDF DocInfo, Office docProps.

Two operations over the same finding model. `scan` reads what a file discloses
about the person and machine that made it; `scrub` rewrites the bytes with the
disclosing parts removed and reports what it took out.

**Findings are risk-ranked, not merely listed.** A camera model is a fingerprint
and a GPS coordinate is a home address; presenting them as equal rows is what
makes a metadata report unreadable. Each finding carries a category and a risk
band, and the band is assigned by the key it was read from, never guessed.

**Scrub rewrites, it does not blank.** Setting a field to the empty string
leaves the field present, and the file still says a tool touched it. The strip
path removes the container entry where the format allows and rebuilds the file
without it where it does not.

**What a scrub achieved is measured, not assumed.** Every scrubber returns the
findings it removed AND the ones that survived, so a caller is never told a
file is clean because the code intended to clean it.

No third-party metadata library. Pillow would pull an imaging stack for tag
names this module has to enumerate for risk ranking anyway, and the OOXML and
PDF paths are zipfile and pypdfium2 work either way.
"""

from __future__ import annotations

import io
import re
import struct
import zipfile
import zlib
from dataclasses import dataclass, field, replace
from enum import Enum
from xml.etree import ElementTree

# --- model ------------------------------------------------------------------


class Risk(str, Enum):
    """How much a value discloses. An ordinal band, not a probability."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Category(str, Enum):
    LOCATION = "location"
    IDENTITY = "identity"
    DEVICE = "device"
    SOFTWARE = "software"
    TIMESTAMP = "timestamp"
    CONTENT = "content"
    OTHER = "other"


@dataclass(frozen=True)
class Finding:
    """One disclosed value: where it was read from, and what it gives away."""

    group: str
    key: str
    value: str
    risk: Risk
    category: Category
    # Whether a scrub can remove this one. A few entries are structural and
    # survive by necessity; saying so beats silently keeping them.
    removable: bool = True


@dataclass
class ScanResult:
    file_type: str
    findings: list[Finding] = field(default_factory=list)
    # Set when a container opened but one of its parts could not be read. The
    # scan is still returned — a partial report beats none — but the caller has
    # to know it is partial or it will read absence as safety.
    warnings: list[str] = field(default_factory=list)


@dataclass
class ScrubResult:
    data: bytes
    removed: list[Finding] = field(default_factory=list)
    # Detected and NOT removed. Never silently empty: a scrub that left
    # something behind must name it.
    retained: list[Finding] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class MetadataError(Exception):
    """The bytes could not be read as the type they were declared to be."""

    def __init__(self, kind: str, cause: BaseException | str) -> None:
        detail = str(cause).strip() or cause.__class__.__name__
        super().__init__(f"the file could not be read as {kind}: {detail}")
        self.kind = kind


# --- risk ranking ------------------------------------------------------------

# Exact keys first, then substrings. A key matched by neither lands at
# LOW / OTHER: an unknown tag is still reported, but it does not inflate the
# risk summary on the strength of a name nobody recognised.
_EXACT_RISK: dict[str, tuple[Risk, Category]] = {
    # Location — the highest-consequence disclosure in a consumer photo.
    "gpslatitude": (Risk.HIGH, Category.LOCATION),
    "gpslongitude": (Risk.HIGH, Category.LOCATION),
    "gpsaltitude": (Risk.HIGH, Category.LOCATION),
    "gpsdatestamp": (Risk.HIGH, Category.LOCATION),
    "gpstimestamp": (Risk.HIGH, Category.LOCATION),
    "gpsmapdatum": (Risk.MEDIUM, Category.LOCATION),
    "gpsprocessingmethod": (Risk.MEDIUM, Category.LOCATION),
    "gpsversionid": (Risk.LOW, Category.LOCATION),
    "gpslatituderef": (Risk.MEDIUM, Category.LOCATION),
    "gpslongituderef": (Risk.MEDIUM, Category.LOCATION),
    # Identity — names a person, not a machine.
    "artist": (Risk.HIGH, Category.IDENTITY),
    "author": (Risk.HIGH, Category.IDENTITY),
    "creator": (Risk.HIGH, Category.IDENTITY),
    "lastmodifiedby": (Risk.HIGH, Category.IDENTITY),
    "cameraownername": (Risk.HIGH, Category.IDENTITY),
    "owner": (Risk.HIGH, Category.IDENTITY),
    "ownername": (Risk.HIGH, Category.IDENTITY),
    "copyright": (Risk.MEDIUM, Category.IDENTITY),
    "manager": (Risk.MEDIUM, Category.IDENTITY),
    "company": (Risk.MEDIUM, Category.IDENTITY),
    # Device — a serial number is a durable cross-file fingerprint.
    "bodyserialnumber": (Risk.HIGH, Category.DEVICE),
    "serialnumber": (Risk.HIGH, Category.DEVICE),
    "lensserialnumber": (Risk.HIGH, Category.DEVICE),
    "cameraserialnumber": (Risk.HIGH, Category.DEVICE),
    "hostcomputer": (Risk.HIGH, Category.DEVICE),
    "make": (Risk.MEDIUM, Category.DEVICE),
    "model": (Risk.MEDIUM, Category.DEVICE),
    "lensmake": (Risk.LOW, Category.DEVICE),
    "lensmodel": (Risk.LOW, Category.DEVICE),
    # Software — reveals the toolchain, and often an internal build string.
    "software": (Risk.MEDIUM, Category.SOFTWARE),
    "producer": (Risk.MEDIUM, Category.SOFTWARE),
    "application": (Risk.MEDIUM, Category.SOFTWARE),
    "generator": (Risk.MEDIUM, Category.SOFTWARE),
    "creatortool": (Risk.MEDIUM, Category.SOFTWARE),
    "processingsoftware": (Risk.MEDIUM, Category.SOFTWARE),
    "appversion": (Risk.LOW, Category.SOFTWARE),
    # Timestamps — a working-hours pattern across many files deanonymises.
    "datetime": (Risk.LOW, Category.TIMESTAMP),
    "datetimeoriginal": (Risk.MEDIUM, Category.TIMESTAMP),
    "datetimedigitized": (Risk.LOW, Category.TIMESTAMP),
    "creationdate": (Risk.LOW, Category.TIMESTAMP),
    "moddate": (Risk.LOW, Category.TIMESTAMP),
    "modificationtime": (Risk.LOW, Category.TIMESTAMP),
    "totaltime": (Risk.MEDIUM, Category.TIMESTAMP),
    # Content descriptors.
    "title": (Risk.LOW, Category.CONTENT),
    "subject": (Risk.LOW, Category.CONTENT),
    "keywords": (Risk.LOW, Category.CONTENT),
    "description": (Risk.LOW, Category.CONTENT),
    "usercomment": (Risk.MEDIUM, Category.CONTENT),
    "imagedescription": (Risk.LOW, Category.CONTENT),
    "template": (Risk.MEDIUM, Category.CONTENT),
}

_SUBSTRING_RISK: tuple[tuple[str, Risk, Category], ...] = (
    ("gps", Risk.HIGH, Category.LOCATION),
    ("location", Risk.HIGH, Category.LOCATION),
    ("geo", Risk.HIGH, Category.LOCATION),
    ("serial", Risk.HIGH, Category.DEVICE),
    ("author", Risk.HIGH, Category.IDENTITY),
    ("creator", Risk.HIGH, Category.IDENTITY),
    ("email", Risk.HIGH, Category.IDENTITY),
    ("owner", Risk.HIGH, Category.IDENTITY),
    ("user", Risk.MEDIUM, Category.IDENTITY),
    ("camera", Risk.MEDIUM, Category.DEVICE),
    ("device", Risk.MEDIUM, Category.DEVICE),
    ("lens", Risk.LOW, Category.DEVICE),
    ("software", Risk.MEDIUM, Category.SOFTWARE),
    ("producer", Risk.MEDIUM, Category.SOFTWARE),
    ("tool", Risk.LOW, Category.SOFTWARE),
    ("date", Risk.LOW, Category.TIMESTAMP),
    ("time", Risk.LOW, Category.TIMESTAMP),
)

# A value shaped like an email address or a home-directory path is high-risk
# whatever key it arrived under: the key vocabularies of XMP and docProps are
# open-ended, so the name alone can never be the whole test.
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]{2,}")
_USER_PATH_RE = re.compile(r"(?:[A-Za-z]:\\Users\\|\\\\[^\\]+\\|/(?:home|Users)/)")

# Beyond this a value is a blob (a thumbnail, an ICC profile, a base64 packet)
# and pasting it into the response helps nobody.
_MAX_VALUE_CHARS = 512


def classify(key: str, value: str) -> tuple[Risk, Category]:
    """Rank one key/value pair: key vocabulary first, then the value's shape."""
    normalized = key.strip().lower()
    if normalized in _EXACT_RISK:
        risk, category = _EXACT_RISK[normalized]
    else:
        # Drop a namespace prefix ("xmp:CreatorTool") before the substring pass,
        # and try the bare name against the exact table first.
        bare = normalized.rsplit(":", 1)[-1]
        if bare in _EXACT_RISK:
            risk, category = _EXACT_RISK[bare]
        else:
            for needle, needle_risk, needle_category in _SUBSTRING_RISK:
                if needle in bare:
                    risk, category = needle_risk, needle_category
                    break
            else:
                risk, category = Risk.LOW, Category.OTHER

    # The value can only raise the band, never lower it.
    if _EMAIL_RE.search(value) or _USER_PATH_RE.search(value):
        return Risk.HIGH, Category.IDENTITY
    return risk, category


def _finding(group: str, key: str, value: object, *, removable: bool = True) -> Finding | None:
    """Build a finding, dropping empties so a report carries no blank rows."""
    if value is None:
        return None
    text = value.decode("utf-8", "replace") if isinstance(value, bytes) else str(value)
    text = text.replace("\x00", "").strip()
    if not text:
        return None
    if len(text) > _MAX_VALUE_CHARS:
        # Say it was cut. A value silently truncated to look complete is how a
        # reader concludes the rest of it does not exist.
        text = f"{text[: _MAX_VALUE_CHARS - 32]}… [{len(text)} chars, truncated]"
    risk, category = classify(key, text)
    return Finding(group=group, key=key, value=text, risk=risk, category=category, removable=removable)


# --- JPEG --------------------------------------------------------------------

_SOI = b"\xff\xd8"

# Segments carrying metadata rather than image data. APP0 (JFIF) is structural
# and stays: some decoders read density and thumbnail framing from it.
_JPEG_META_MARKERS: dict[int, str] = {
    0xE1: "exif",  # APP1 — EXIF and XMP
    0xE2: "icc",  # APP2 — ICC profile / FlashPix
    0xE3: "app3",
    0xE4: "app4",
    0xE5: "app5",
    0xE6: "app6",
    0xE7: "app7",
    0xE8: "app8",
    0xE9: "app9",
    0xEA: "app10",
    0xEB: "app11",
    0xEC: "app12",  # Picture Info / Ducky
    0xED: "iptc",  # APP13 — Photoshop IRB / IPTC
    0xEE: "adobe",  # APP14
    0xEF: "app15",
    0xFE: "comment",  # COM
}

# EXIF tag ids this module names. An unnamed tag is still reported, as
# "Tag0x<id>", so a scan never calls a file clean for want of a label.
_EXIF_TAGS: dict[int, str] = {
    0x010E: "ImageDescription",
    0x010F: "Make",
    0x0110: "Model",
    0x0131: "Software",
    0x0132: "DateTime",
    0x013B: "Artist",
    0x013C: "HostComputer",
    0x8298: "Copyright",
    0x9003: "DateTimeOriginal",
    0x9004: "DateTimeDigitized",
    0x9286: "UserComment",
    0xA430: "CameraOwnerName",
    0xA431: "BodySerialNumber",
    0xA433: "LensMake",
    0xA434: "LensModel",
    0xA435: "LensSerialNumber",
    0x8769: "ExifIFDPointer",
    0x8825: "GPSInfoIFDPointer",
}

_GPS_TAGS: dict[int, str] = {
    0x0000: "GPSVersionID",
    0x0001: "GPSLatitudeRef",
    0x0002: "GPSLatitude",
    0x0003: "GPSLongitudeRef",
    0x0004: "GPSLongitude",
    0x0005: "GPSAltitudeRef",
    0x0006: "GPSAltitude",
    0x0007: "GPSTimeStamp",
    0x0012: "GPSMapDatum",
    0x001B: "GPSProcessingMethod",
    0x001D: "GPSDateStamp",
}

# Bytes per component, by EXIF type id.
_TYPE_SIZES: dict[int, int] = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}

# Guards on values read out of a file that may be malformed or hostile: a
# corrupt entry count would otherwise drive a multi-million-iteration loop, and
# a corrupt size a gigabyte-sized slice.
_MAX_IFD_ENTRIES = 512
_MAX_VALUE_BYTES = 1 << 20


def _segments(data: bytes) -> list[tuple[int, int, int]]:
    """Walk JPEG markers, returning (marker, start, end) per segment.

    Stops at SOS: past it is entropy-coded image data with no marker structure
    to walk. A malformed chain ends the walk rather than raising, so the caller
    still gets the segments read up to the break.
    """
    if not data.startswith(_SOI):
        raise MetadataError("jpeg", "missing SOI marker")
    out: list[tuple[int, int, int]] = []
    i = 2
    n = len(data)
    while i + 4 <= n:
        if data[i] != 0xFF:
            break
        marker = data[i + 1]
        if marker == 0xDA:  # SOS
            break
        if marker == 0xD9 or 0xD0 <= marker <= 0xD8:  # standalone markers
            i += 2
            continue
        (length,) = struct.unpack(">H", data[i + 2 : i + 4])
        if length < 2 or i + 2 + length > n:
            break
        out.append((marker, i, i + 2 + length))
        i += 2 + length
    return out


def _format_value(raw: bytes, type_id: int, components: int, order: str) -> str:
    if type_id == 2:  # ASCII
        return raw.split(b"\x00", 1)[0].decode("utf-8", "replace")
    if type_id in (5, 10):  # RATIONAL / SRATIONAL — GPS coordinates live here
        code = "ii" if type_id == 10 else "II"
        parts: list[str] = []
        for k in range(components):
            chunk = raw[k * 8 : k * 8 + 8]
            if len(chunk) < 8:
                break
            num, den = struct.unpack(order + code, chunk)
            parts.append(f"{num / den:g}" if den else "0")
        return ", ".join(parts)
    if type_id in (3, 4, 8, 9):
        width = 2 if type_id in (3, 8) else 4
        code = {(2, False): "H", (4, False): "I", (2, True): "h", (4, True): "i"}[(width, type_id in (8, 9))]
        return ", ".join(
            str(struct.unpack(order + code, raw[k * width : k * width + width])[0])
            for k in range(min(components, len(raw) // width))
        )
    # BYTE / SBYTE / UNDEFINED, and anything unrecognised.
    text = raw.split(b"\x00", 1)[0].decode("utf-8", "replace").strip()
    return text or raw[:32].hex()


def _read_ifd(
    payload: bytes, offset: int, order: str, names: dict[int, str]
) -> tuple[list[tuple[str, str]], dict[str, int]]:
    """Read one IFD. Returns (named values, sub-IFD pointers)."""
    values: list[tuple[str, str]] = []
    pointers: dict[str, int] = {}
    if offset <= 0 or offset + 2 > len(payload):
        return values, pointers
    (count,) = struct.unpack(order + "H", payload[offset : offset + 2])
    count = min(count, _MAX_IFD_ENTRIES)

    for index in range(count):
        entry = offset + 2 + index * 12
        if entry + 12 > len(payload):
            break
        tag, type_id, components = struct.unpack(order + "HHI", payload[entry : entry + 8])
        size = _TYPE_SIZES.get(type_id, 0) * components
        if size == 0 or size > _MAX_VALUE_BYTES:
            continue
        if size <= 4:
            raw = payload[entry + 8 : entry + 8 + size]
        else:
            (value_offset,) = struct.unpack(order + "I", payload[entry + 8 : entry + 12])
            if value_offset + size > len(payload):
                continue
            raw = payload[value_offset : value_offset + size]

        name = names.get(tag)
        if name in ("ExifIFDPointer", "GPSInfoIFDPointer"):
            (pointer,) = struct.unpack(order + "I", raw[:4].ljust(4, b"\x00"))
            pointers[name] = pointer
            continue
        values.append((name or f"Tag0x{tag:04X}", _format_value(raw, type_id, components, order)))
    return values, pointers


def _parse_exif(payload: bytes) -> list[Finding]:
    """Parse a TIFF-structured EXIF payload (`Exif\\0\\0` header already gone)."""
    if len(payload) < 8:
        return []
    if payload[:2] == b"MM":
        order = ">"
    elif payload[:2] == b"II":
        order = "<"
    else:
        return []
    (first_ifd,) = struct.unpack(order + "I", payload[4:8])

    findings: list[Finding] = []
    values, pointers = _read_ifd(payload, first_ifd, order, _EXIF_TAGS)
    for key, value in values:
        if (found := _finding("exif", key, value)) is not None:
            findings.append(found)

    if (exif_pointer := pointers.get("ExifIFDPointer")) is not None:
        sub_values, sub_pointers = _read_ifd(payload, exif_pointer, order, _EXIF_TAGS)
        for key, value in sub_values:
            if (found := _finding("exif", key, value)) is not None:
                findings.append(found)
        # A GPS pointer can sit in either IFD; the outer one wins if both name it.
        if "GPSInfoIFDPointer" in sub_pointers:
            pointers.setdefault("GPSInfoIFDPointer", sub_pointers["GPSInfoIFDPointer"])

    if (gps_pointer := pointers.get("GPSInfoIFDPointer")) is not None:
        gps_values, _ = _read_ifd(payload, gps_pointer, order, _GPS_TAGS)
        for key, value in gps_values:
            if (found := _finding("gps", key, value)) is not None:
                findings.append(found)
        # A raw DMS triple ("51, 30, 26") is the single most consequential
        # finding in a consumer photo and the least readable. Resolving it to a
        # decimal pair is what makes the report actionable rather than technically
        # correct — a reader should not have to do the arithmetic to learn that
        # the file gives away a home address.
        if (coordinate := _decimal_coordinate(dict(gps_values))) is not None:
            findings.append(
                Finding(
                    group="gps",
                    key="Coordinates",
                    value=coordinate,
                    risk=Risk.HIGH,
                    category=Category.LOCATION,
                )
            )
    return findings


def _dms_to_degrees(value: str) -> float | None:
    parts = [piece.strip() for piece in value.split(",")]
    try:
        numbers = [float(piece) for piece in parts if piece]
    except ValueError:
        return None
    if not numbers:
        return None
    degrees, minutes, seconds = (numbers + [0.0, 0.0])[:3]
    return degrees + minutes / 60 + seconds / 3600


def _decimal_coordinate(gps: dict[str, str]) -> str | None:
    """Fold GPSLatitude/Longitude plus their hemisphere refs into "lat, lon"."""
    latitude = gps.get("GPSLatitude")
    longitude = gps.get("GPSLongitude")
    if not latitude or not longitude:
        return None
    lat = _dms_to_degrees(latitude)
    lon = _dms_to_degrees(longitude)
    if lat is None or lon is None:
        return None
    if gps.get("GPSLatitudeRef", "N").upper().startswith("S"):
        lat = -lat
    if gps.get("GPSLongitudeRef", "E").upper().startswith("W"):
        lon = -lon
    return f"{lat:.6f}, {lon:.6f}"


_XMP_STRUCTURAL_TAGS = frozenset({"RDF", "Description", "Seq", "Bag", "Alt", "li", "xmpmeta"})
_XMP_STRUCTURAL_ATTRS = frozenset({"about", "parseType", "lang"})


def _parse_xmp(payload: bytes) -> list[Finding]:
    """Read an XMP RDF packet. Namespaced names are kept: `dc:creator` ranks on the tag."""
    try:
        root = ElementTree.fromstring(payload.decode("utf-8", "replace"))
    except ElementTree.ParseError:
        return []
    findings: list[Finding] = []
    seen: set[tuple[str, str]] = set()
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        text = (element.text or "").strip()
        if text and tag not in _XMP_STRUCTURAL_TAGS and (tag, text) not in seen:
            seen.add((tag, text))
            if (found := _finding("xmp", tag, text)) is not None:
                findings.append(found)
        for attr, value in element.attrib.items():
            name = attr.rsplit("}", 1)[-1]
            if name in _XMP_STRUCTURAL_ATTRS or (name, value) in seen:
                continue
            seen.add((name, value))
            if (found := _finding("xmp", name, value)) is not None:
                findings.append(found)
    return findings


def scan_jpeg(data: bytes) -> ScanResult:
    result = ScanResult(file_type="jpg")
    for marker, start, end in _segments(data):
        group = _JPEG_META_MARKERS.get(marker)
        if group is None:
            continue
        body = data[start + 4 : end]
        if marker == 0xE1:
            if body.startswith(b"Exif\x00\x00"):
                result.findings.extend(_parse_exif(body[6:]))
            elif b"<x:xmpmeta" in body[:512]:
                result.findings.extend(_parse_xmp(body[body.find(b"<x:xmpmeta") :]))
            continue
        if marker == 0xFE:
            if (found := _finding("comment", "Comment", body)) is not None:
                result.findings.append(found)
            continue
        # The rest are vendor-specific inside, but their presence and size are
        # themselves the disclosure — an ICC profile names the editing suite.
        result.findings.append(
            Finding(
                group=group,
                key="segment",
                value=f"{len(body)} bytes",
                risk=Risk.LOW,
                category=Category.OTHER,
            )
        )
    return result


def scrub_jpeg(data: bytes) -> ScrubResult:
    """Rewrite a JPEG keeping only structural and image-bearing segments.

    Metadata segments are dropped whole rather than emptied: a zero-length APP1
    still tells a reader the file once carried EXIF.
    """
    scanned = scan_jpeg(data)
    drop = [(start, end) for marker, start, end in _segments(data) if marker in _JPEG_META_MARKERS]
    if not drop:
        return ScrubResult(data=data)

    out = bytearray(data[:2])
    cursor = 2
    for start, end in drop:
        out.extend(data[cursor:start])
        cursor = end
    out.extend(data[cursor:])
    return ScrubResult(data=bytes(out), removed=scanned.findings, warnings=scanned.warnings)


# --- PNG ---------------------------------------------------------------------

_PNG_SIG = b"\x89PNG\r\n\x1a\n"

# Ancillary chunks carrying metadata. Critical chunks (IHDR, PLTE, IDAT, IEND)
# and rendering-relevant ancillaries (gAMA, cHRM, sRGB, tRNS, pHYs) are never
# touched: dropping them changes how the image displays.
_PNG_META_CHUNKS = frozenset({b"tEXt", b"zTXt", b"iTXt", b"tIME", b"eXIf", b"iCCP"})


def _png_chunks(data: bytes) -> list[tuple[bytes, int, int, bytes]]:
    """Walk PNG chunks: (type, start, end, payload)."""
    if not data.startswith(_PNG_SIG):
        raise MetadataError("png", "missing PNG signature")
    out: list[tuple[bytes, int, int, bytes]] = []
    i = len(_PNG_SIG)
    n = len(data)
    while i + 8 <= n:
        (length,) = struct.unpack(">I", data[i : i + 4])
        kind = data[i + 4 : i + 8]
        end = i + 12 + length
        if end > n:
            break
        out.append((kind, i, end, data[i + 8 : i + 8 + length]))
        if kind == b"IEND":
            break
        i = end
    return out


def _png_text(kind: bytes, payload: bytes) -> tuple[str, str] | None:
    if kind == b"tEXt":
        key, _, value = payload.partition(b"\x00")
        return key.decode("latin-1", "replace"), value.decode("latin-1", "replace")
    if kind == b"zTXt":
        key, _, rest = payload.partition(b"\x00")
        try:
            value = zlib.decompress(rest[1:]).decode("latin-1", "replace")
        except (zlib.error, IndexError):
            value = "<compressed, unreadable>"
        return key.decode("latin-1", "replace"), value
    if kind == b"iTXt":
        parts = payload.split(b"\x00", 5)
        if len(parts) < 6:
            return None
        key = parts[0].decode("utf-8", "replace")
        if parts[1:2] == [b"\x01"]:
            try:
                return key, zlib.decompress(parts[5]).decode("utf-8", "replace")
            except zlib.error:
                return key, "<compressed, unreadable>"
        return key, parts[5].decode("utf-8", "replace")
    return None


def scan_png(data: bytes) -> ScanResult:
    result = ScanResult(file_type="png")
    for kind, _, _, payload in _png_chunks(data):
        if kind not in _PNG_META_CHUNKS:
            continue
        if kind == b"eXIf":
            result.findings.extend(_parse_exif(payload))
            continue
        if kind == b"tIME":
            if len(payload) >= 7:
                year, month, day, hour, minute, second = struct.unpack(">HBBBBB", payload[:7])
                stamp = f"{year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:{second:02d}Z"
                if (found := _finding("png", "ModificationTime", stamp)) is not None:
                    result.findings.append(found)
            continue
        if kind == b"iCCP":
            name = payload.split(b"\x00", 1)[0].decode("latin-1", "replace")
            if (found := _finding("icc", "ProfileName", name)) is not None:
                result.findings.append(found)
            continue
        pair = _png_text(kind, payload)
        if pair is None:
            continue
        key, value = pair
        # An XMP packet arrives as an iTXt keyed `XML:com.adobe.xmp`.
        if "xmp" in key.lower() and "<" in value:
            result.findings.extend(_parse_xmp(value.encode("utf-8")))
            continue
        if (found := _finding("png", key, value)) is not None:
            result.findings.append(found)
    return result


def scrub_png(data: bytes) -> ScrubResult:
    scanned = scan_png(data)
    chunks = _png_chunks(data)
    keep = [chunk for chunk in chunks if chunk[0] not in _PNG_META_CHUNKS]
    if len(keep) == len(chunks):
        return ScrubResult(data=data)
    out = bytearray(_PNG_SIG)
    for _, start, end, _ in keep:
        out.extend(data[start:end])
    return ScrubResult(data=bytes(out), removed=scanned.findings, warnings=scanned.warnings)


# --- OOXML (docx / pptx / xlsx) ----------------------------------------------

# The parts carrying authorship. `custom.xml` holds whatever the organisation
# put there, which in practice is where template and matter references hide.
_OOXML_PROP_PARTS = ("docProps/core.xml", "docProps/app.xml", "docProps/custom.xml")

# Parts naming people that cannot be dropped without corrupting the document:
# a relationship elsewhere in the package still points at them.
_OOXML_TRACKED_SUFFIXES = ("/comments.xml", "/people.xml", "/commentsExtended.xml")

_OOXML_STRUCTURAL_TAGS = frozenset({"coreProperties", "Properties", "property"})


def _ooxml_kind(names: list[str]) -> str:
    if any(name.startswith("word/") for name in names):
        return "docx"
    if any(name.startswith("ppt/") for name in names):
        return "pptx"
    if any(name.startswith("xl/") for name in names):
        return "xlsx"
    return "ooxml"


def _tracked_findings(names: list[str]) -> list[Finding]:
    return [
        Finding(
            group="tracked",
            key=name,
            value="present",
            risk=Risk.HIGH,
            category=Category.IDENTITY,
            removable=False,
        )
        for name in names
        if name.endswith(_OOXML_TRACKED_SUFFIXES)
    ]


# A small upload can declare gigabytes of entries. Read sizes are bounded by
# what each entry declares, so checking the declared sizes bounds the inflate.
_OOXML_MAX_ENTRIES = 10_000
_OOXML_MAX_TOTAL_BYTES = 256 * 1024 * 1024
_OOXML_MAX_PART_BYTES = 4 * 1024 * 1024


def _open_ooxml(data: bytes) -> zipfile.ZipFile:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except (zipfile.BadZipFile, OSError) as exc:
        raise MetadataError("ooxml", exc) from exc
    infos = archive.infolist()
    if len(infos) > _OOXML_MAX_ENTRIES:
        raise MetadataError("ooxml", f"the archive has more than {_OOXML_MAX_ENTRIES} entries")
    if sum(info.file_size for info in infos) > _OOXML_MAX_TOTAL_BYTES:
        raise MetadataError("ooxml", f"the archive inflates past {_OOXML_MAX_TOTAL_BYTES} bytes")
    return archive


def scan_ooxml(data: bytes) -> ScanResult:
    archive = _open_ooxml(data)

    names = archive.namelist()
    result = ScanResult(file_type=_ooxml_kind(names))

    for part in _OOXML_PROP_PARTS:
        if part not in names:
            continue
        if archive.getinfo(part).file_size > _OOXML_MAX_PART_BYTES:
            result.warnings.append(
                f"{part} is larger than {_OOXML_MAX_PART_BYTES} bytes and was not read"
            )
            continue
        try:
            body = archive.read(part)
        except (KeyError, zipfile.BadZipFile, OSError, RuntimeError) as exc:
            result.warnings.append(f"{part} could not be read: {exc}")
            continue
        group = part.rsplit("/", 1)[-1].removesuffix(".xml")
        try:
            root = ElementTree.fromstring(body.decode("utf-8", "replace"))
        except ElementTree.ParseError as exc:
            result.warnings.append(f"{part} is not valid XML: {exc}")
            continue
        # custom.xml wraps each value in a typed child (`<vt:lpwstr>`) whose own
        # tag is meaningless — the name lives on the parent's attribute. Those
        # children are consumed by their parent and skipped on their own pass,
        # or every custom property is reported twice, once under a useless key.
        consumed: set[int] = set()
        for element in root.iter():
            tag = element.tag.rsplit("}", 1)[-1]
            if id(element) in consumed:
                continue
            if tag in _OOXML_STRUCTURAL_TAGS and "name" not in element.attrib:
                continue
            key = element.attrib.get("name", tag)
            text = (element.text or "").strip()
            if not text:
                for child in element:
                    consumed.add(id(child))
                    if not text:
                        text = (child.text or "").strip()
            if (found := _finding(group, key, text)) is not None:
                result.findings.append(found)

    result.findings.extend(_tracked_findings(names))
    return result


def scrub_ooxml(data: bytes) -> ScrubResult:
    """Rebuild the container without its metadata parts.

    The zip is rebuilt rather than edited: removing an entry means rewriting the
    central directory anyway, and a rebuild guarantees no stale local header
    survives. Entry timestamps are flattened too — a zip entry's own mtime is
    metadata, and keeping it would leak what the scrub just removed.
    """
    scanned = scan_ooxml(data)
    source = _open_ooxml(data)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as target:
        for item in source.infolist():
            if item.filename in _OOXML_PROP_PARTS:
                continue
            info = zipfile.ZipInfo(item.filename, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = item.compress_type
            info.external_attr = item.external_attr
            target.writestr(info, source.read(item.filename))

    retained = [found for found in scanned.findings if found.group == "tracked"]
    removed = [found for found in scanned.findings if found.group != "tracked"]
    warnings = list(scanned.warnings)
    if retained:
        warnings.append(
            f"{len(retained)} part(s) naming people were kept: removing them would break a "
            "relationship and corrupt the document. Accept the comments in the editor and re-run."
        )
    return ScrubResult(data=buffer.getvalue(), removed=removed, retained=retained, warnings=warnings)


# --- PDF ---------------------------------------------------------------------

_PDF_INFO_KEYS = ("Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate")

_EMPTY_XMP = (
    b'<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF '
    b'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF></x:xmpmeta>'
)
_XMP_TERMINATOR = b'<?xpacket end="w"?>'


def _pdf_document(data: bytes):  # noqa: ANN202 - pdfium does not export its type
    try:
        import pypdfium2 as pdfium
    except ImportError as exc:  # pragma: no cover - declared dependency
        raise MetadataError("pdf", "pypdfium2 is not installed") from exc
    try:
        return pdfium.PdfDocument(io.BytesIO(data))
    except Exception as exc:  # pdfium raises its own error types
        raise MetadataError("pdf", exc) from exc


def _xmp_span(data: bytes) -> tuple[int, int] | None:
    """Locate the XMP packet, as a (start, end) byte span, or None."""
    start = data.find(b"<?xpacket begin=")
    if start == -1:
        return None
    end = data.find(b"<?xpacket end=", start)
    if end == -1:
        return None
    terminator = data.find(b"?>", end)
    return (start, terminator + 2) if terminator != -1 else None


def scan_pdf(data: bytes) -> ScanResult:
    result = ScanResult(file_type="pdf")
    document = _pdf_document(data)
    try:
        for key in _PDF_INFO_KEYS:
            try:
                value = document.get_metadata_value(key)
            except Exception:  # a key pdfium cannot read is not a scan failure
                continue
            if (found := _finding("docinfo", key, value)) is not None:
                result.findings.append(found)
    finally:
        document.close()

    # XMP lives in a metadata stream pdfium does not expose. Reading it out of
    # the raw bytes is crude, but it is the packet's documented framing, and a
    # PDF whose XMP names an author while DocInfo is empty is common enough
    # that skipping it would make the scan actively misleading.
    span = _xmp_span(data)
    if span is not None:
        packet = data[span[0] : span[1]]
        body_start = packet.find(b"<x:xmpmeta")
        body_end = packet.rfind(b"</x:xmpmeta>")
        if body_start != -1 and body_end != -1:
            result.findings.extend(_parse_xmp(packet[body_start : body_end + len(b"</x:xmpmeta>")]))
    return result


def scrub_pdf(data: bytes) -> ScrubResult:
    """Re-save a PDF through pdfium, then blank its XMP packet.

    Saving through pdfium rebuilds the file and drops the incremental-update
    chain, which is where a previous author's edits hide in a revised document.
    pdfium cannot write DocInfo, so what actually survives is measured by
    re-scanning the output rather than assumed from the intent.
    """
    scanned = scan_pdf(data)
    document = _pdf_document(data)
    buffer = io.BytesIO()
    try:
        document.save(buffer)
    except Exception as exc:
        raise MetadataError("pdf", exc) from exc
    finally:
        document.close()

    out = buffer.getvalue()

    # The packet keeps its byte length: xref offsets past it are absolute, so it
    # is overwritten with padding rather than deleted.
    span = _xmp_span(out)
    if span is not None:
        start, end = span
        width = end - start
        if len(_EMPTY_XMP) + len(_XMP_TERMINATOR) <= width:
            padding = b" " * (width - len(_EMPTY_XMP) - len(_XMP_TERMINATOR))
            out = out[:start] + _EMPTY_XMP + padding + _XMP_TERMINATOR + out[end:]

    # Re-scan: a finding still present afterwards is retained, not removed.
    try:
        after = scan_pdf(out)
        warnings = list(scanned.warnings)
    except MetadataError as exc:
        # The rewrite produced bytes we cannot re-open. Return the original
        # rather than a file we cannot vouch for.
        return ScrubResult(
            data=data,
            removed=[],
            retained=[replace(found, removable=False) for found in scanned.findings],
            warnings=[*scanned.warnings, f"the scrubbed PDF could not be re-read, so nothing was changed: {exc}"],
        )

    surviving = {(found.group, found.key, found.value) for found in after.findings}
    removed = [found for found in scanned.findings if (found.group, found.key, found.value) not in surviving]
    retained = [
        replace(found, removable=False)
        for found in scanned.findings
        if (found.group, found.key, found.value) in surviving
    ]
    if retained:
        warnings.append(
            f"{len(retained)} PDF metadata value(s) survived the rewrite: pypdfium2 cannot write DocInfo, "
            "so entries it re-emits are reported rather than silently claimed as removed."
        )
    return ScrubResult(data=out, removed=removed, retained=retained, warnings=warnings)


# --- dispatch ----------------------------------------------------------------

_SCANNERS = {
    "jpg": scan_jpeg,
    "png": scan_png,
    "pdf": scan_pdf,
    "docx": scan_ooxml,
    "pptx": scan_ooxml,
    "xlsx": scan_ooxml,
}

_SCRUBBERS = {
    "jpg": scrub_jpeg,
    "png": scrub_png,
    "pdf": scrub_pdf,
    "docx": scrub_ooxml,
    "pptx": scrub_ooxml,
    "xlsx": scrub_ooxml,
}

SUPPORTED_TYPES: tuple[str, ...] = tuple(_SCANNERS)


def scan(data: bytes, file_type: str) -> ScanResult:
    scanner = _SCANNERS.get(file_type)
    if scanner is None:
        raise ValueError(f"unsupported file type for metadata: {file_type}")
    return scanner(data)


def scrub(data: bytes, file_type: str) -> ScrubResult:
    scrubber = _SCRUBBERS.get(file_type)
    if scrubber is None:
        raise ValueError(f"unsupported file type for metadata: {file_type}")
    return scrubber(data)


def summarize(findings: list[Finding]) -> dict[str, int]:
    """Counts per risk band.

    Always carries all three keys, so a caller rendering a summary never has to
    tell an absent band from a zero one.
    """
    counts = {Risk.HIGH.value: 0, Risk.MEDIUM.value: 0, Risk.LOW.value: 0}
    for found in findings:
        counts[found.risk.value] += 1
    return counts
