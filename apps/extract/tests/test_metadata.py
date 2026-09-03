"""Metadata scanning and scrubbing, against bytes built here rather than fixtures.

Every file in this module is constructed in-test, so a failure points at the
parser and never at a checked-in binary nobody can read in a diff.
"""

from __future__ import annotations

import io
import struct
import zipfile
import zlib

import pytest

from helix_extract import metadata as m

# --- builders ----------------------------------------------------------------


def _tiff(entries: list[tuple[int, int, bytes]], gps: list[tuple[int, int, bytes]] | None = None) -> bytes:
    """Assemble a little-endian TIFF block, optionally with a GPS sub-IFD."""
    gps = gps or []

    def ifd_size(count: int) -> int:
        return 2 + count * 12 + 4

    ifd0_offset = 8
    entry_count = len(entries) + (1 if gps else 0)
    gps_offset = ifd0_offset + ifd_size(entry_count)
    heap_offset = gps_offset + (ifd_size(len(gps)) if gps else 0)
    heap = bytearray()

    def place(raw: bytes) -> bytes:
        if len(raw) <= 4:
            return raw.ljust(4, b"\x00")
        offset = heap_offset + len(heap)
        heap.extend(raw)
        return struct.pack("<I", offset)

    def components(type_id: int, raw: bytes) -> int:
        return len(raw) if type_id in (1, 2, 6, 7) else len(raw) // m._TYPE_SIZES[type_id]

    def build(items: list[tuple[int, int, bytes]]) -> bytes:
        out = bytearray(struct.pack("<H", len(items)))
        for tag, type_id, raw in items:
            out += struct.pack("<HHI", tag, type_id, components(type_id, raw)) + place(raw)
        return bytes(out + struct.pack("<I", 0))

    gps_ifd = build(gps) if gps else b""
    ifd0 = build(entries + ([(0x8825, 4, struct.pack("<I", gps_offset))] if gps else []))
    return b"II" + struct.pack("<HI", 42, ifd0_offset) + ifd0 + gps_ifd + bytes(heap)


def _jpeg(*segments: bytes) -> bytes:
    """A structurally valid JPEG: SOI, the given segments, SOS, data, EOI."""
    sos = b"\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00"
    return b"\xff\xd8" + b"".join(segments) + sos + b"\x00\x11\x22" + b"\xff\xd9"


def _segment(marker: int, payload: bytes) -> bytes:
    return bytes([0xFF, marker]) + struct.pack(">H", len(payload) + 2) + payload


def _exif_segment(entries: list[tuple[int, int, bytes]], gps: list[tuple[int, int, bytes]] | None = None) -> bytes:
    return _segment(0xE1, b"Exif\x00\x00" + _tiff(entries, gps))


def _png(*chunks: tuple[bytes, bytes]) -> bytes:
    out = bytearray(m._PNG_SIG)
    for kind, payload in chunks:
        out += struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))
    return bytes(out)


def _png_image(*extra: tuple[bytes, bytes]) -> bytes:
    return _png(
        (b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)),
        *extra,
        (b"IDAT", zlib.compress(b"\x00\xff\x00\x00")),
        (b"IEND", b""),
    )


def _docx(parts: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<w:document><w:body/></w:document>")
        for name, body in parts.items():
            archive.writestr(name, body)
    return buffer.getvalue()


CORE_XML = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
    'xmlns:dc="http://purl.org/dc/elements/1.1/">'
    "<dc:creator>Jane Roe</dc:creator>"
    "<cp:lastModifiedBy>john.smith@acme.example</cp:lastModifiedBy>"
    "<dc:title>Q3 Memo</dc:title>"
    "</cp:coreProperties>"
)


# --- risk ranking ------------------------------------------------------------


class TestClassify:
    def test_gps_and_author_are_high(self) -> None:
        assert m.classify("GPSLatitude", "51.5") == (m.Risk.HIGH, m.Category.LOCATION)
        assert m.classify("Author", "Jane Roe") == (m.Risk.HIGH, m.Category.IDENTITY)

    def test_device_and_software_are_medium(self) -> None:
        assert m.classify("Make", "Canon")[0] is m.Risk.MEDIUM
        assert m.classify("Software", "GIMP 2.10")[0] is m.Risk.MEDIUM

    def test_unknown_key_lands_low_rather_than_inflating_the_summary(self) -> None:
        assert m.classify("SomeVendorTag", "42") == (m.Risk.LOW, m.Category.OTHER)

    def test_namespace_prefix_is_stripped_before_ranking(self) -> None:
        assert m.classify("dc:creator", "Jane Roe") == (m.Risk.HIGH, m.Category.IDENTITY)
        assert m.classify("xmp:CreatorTool", "Photoshop")[0] is m.Risk.MEDIUM

    def test_an_email_in_the_value_escalates_whatever_the_key(self) -> None:
        # The key vocabularies of XMP and docProps are open-ended, so the name
        # alone can never be the whole test.
        assert m.classify("Comment", "ping me at jane@example.com") == (m.Risk.HIGH, m.Category.IDENTITY)

    def test_a_home_directory_path_escalates(self) -> None:
        assert m.classify("Template", r"C:\Users\jroe\Templates\matter.dotx")[0] is m.Risk.HIGH
        assert m.classify("Comment", "/home/jroe/photos")[0] is m.Risk.HIGH

    def test_the_value_can_only_raise_the_band(self) -> None:
        # A plain value under a high-risk key stays high.
        assert m.classify("GPSLatitude", "51.5")[0] is m.Risk.HIGH


class TestSummarize:
    def test_all_three_bands_are_always_present(self) -> None:
        assert m.summarize([]) == {"high": 0, "medium": 0, "low": 0}

    def test_counts_each_band(self) -> None:
        findings = [
            m.Finding("g", "k", "v", m.Risk.HIGH, m.Category.IDENTITY),
            m.Finding("g", "k", "v", m.Risk.HIGH, m.Category.LOCATION),
            m.Finding("g", "k", "v", m.Risk.LOW, m.Category.OTHER),
        ]
        assert m.summarize(findings) == {"high": 2, "medium": 0, "low": 1}


# --- JPEG --------------------------------------------------------------------


class TestJpeg:
    def test_reads_exif_identity_and_device_tags(self) -> None:
        data = _jpeg(
            _exif_segment(
                [
                    (0x010F, 2, b"ACME Camera Co\x00"),
                    (0x0110, 2, b"XR-9000\x00"),
                    (0x013B, 2, b"Jane Roe\x00"),
                    (0xA431, 2, b"SN-889912\x00"),
                ]
            )
        )
        result = m.scan_jpeg(data)
        found = {f.key: f for f in result.findings}

        assert found["Make"].value == "ACME Camera Co"
        assert found["Artist"].risk is m.Risk.HIGH
        assert found["BodySerialNumber"].risk is m.Risk.HIGH
        assert found["BodySerialNumber"].category is m.Category.DEVICE

    def test_resolves_gps_to_a_decimal_coordinate(self) -> None:
        data = _jpeg(
            _exif_segment(
                [(0x010F, 2, b"ACME\x00")],
                [
                    (0x0001, 2, b"N\x00"),
                    (0x0002, 5, struct.pack("<IIIIII", 51, 1, 30, 1, 26, 1)),
                    (0x0003, 2, b"W\x00"),
                    (0x0004, 5, struct.pack("<IIIIII", 0, 1, 7, 1, 39, 1)),
                ],
            )
        )
        found = {f.key: f for f in m.scan_jpeg(data).findings}

        # A raw DMS triple is the least readable form of the most consequential
        # finding; the decimal pair is what makes the report actionable.
        assert found["Coordinates"].value == "51.507222, -0.127500"
        assert found["Coordinates"].risk is m.Risk.HIGH
        assert found["Coordinates"].category is m.Category.LOCATION

    def test_southern_and_western_hemispheres_are_negative(self) -> None:
        data = _jpeg(
            _exif_segment(
                [(0x010F, 2, b"A\x00")],
                [
                    (0x0001, 2, b"S\x00"),
                    (0x0002, 5, struct.pack("<IIIIII", 33, 1, 51, 1, 35, 1)),
                    (0x0003, 2, b"W\x00"),
                    (0x0004, 5, struct.pack("<IIIIII", 70, 1, 39, 1, 40, 1)),
                ],
            )
        )
        found = {f.key: f for f in m.scan_jpeg(data).findings}
        assert found["Coordinates"].value.startswith("-33.859")
        assert ", -70.66" in found["Coordinates"].value

    def test_reads_xmp_and_a_comment_segment(self) -> None:
        xmp = (
            b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF '
            b'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
            b'<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">'
            b"<dc:creator>Jane Roe</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>"
        )
        data = _jpeg(
            _segment(0xE1, b"http://ns.adobe.com/xap/1.0/\x00" + xmp),
            _segment(0xFE, b"internal build 4471"),
        )
        result = m.scan_jpeg(data)
        keys = {f.key for f in result.findings}

        assert "creator" in keys
        assert "Comment" in keys

    def test_scrub_removes_every_metadata_segment_and_keeps_the_image(self) -> None:
        data = _jpeg(
            _exif_segment([(0x013B, 2, b"Jane Roe\x00")]),
            _segment(0xFE, b"internal build 4471"),
        )
        result = m.scrub_jpeg(data)

        assert result.removed
        assert result.retained == []
        assert result.data.startswith(b"\xff\xd8")
        assert result.data.endswith(b"\xff\xd9")
        # A re-scan is the only honest proof; the intent to remove is not proof.
        assert m.scan_jpeg(result.data).findings == []

    def test_scrub_is_a_no_op_on_a_file_that_carries_nothing(self) -> None:
        data = _jpeg()
        result = m.scrub_jpeg(data)
        assert result.data == data
        assert result.removed == []

    def test_a_zero_length_segment_is_not_left_behind(self) -> None:
        # Emptying rather than removing would still tell a reader the file once
        # carried EXIF; the segment must be gone entirely.
        data = _jpeg(_exif_segment([(0x013B, 2, b"Jane Roe\x00")]))
        assert b"\xff\xe1" not in m.scrub_jpeg(data).data

    def test_bytes_that_are_not_a_jpeg_raise(self) -> None:
        with pytest.raises(m.MetadataError):
            m.scan_jpeg(b"not a jpeg at all")

    def test_a_truncated_segment_chain_does_not_hang_or_raise(self) -> None:
        # A length that runs past the end stops the walk rather than looping.
        data = b"\xff\xd8" + b"\xff\xe1" + struct.pack(">H", 60000) + b"short"
        assert m.scan_jpeg(data).findings == []


# --- PNG ---------------------------------------------------------------------


class TestPng:
    def test_reads_text_chunks(self) -> None:
        data = _png_image((b"tEXt", b"Author\x00Jane Roe"), (b"tEXt", b"Software\x00GIMP 2.10"))
        found = {f.key: f for f in m.scan_png(data).findings}

        assert found["Author"].risk is m.Risk.HIGH
        assert found["Software"].risk is m.Risk.MEDIUM

    def test_reads_a_compressed_text_chunk(self) -> None:
        payload = b"Author\x00" + b"\x00" + zlib.compress(b"Jane Roe")
        found = {f.key: f for f in m.scan_png(_png_image((b"zTXt", payload))).findings}
        assert found["Author"].value == "Jane Roe"

    def test_reads_a_modification_timestamp(self) -> None:
        data = _png_image((b"tIME", struct.pack(">HBBBBB", 2026, 9, 3, 14, 30, 0)))
        found = {f.key: f for f in m.scan_png(data).findings}
        assert found["ModificationTime"].value == "2026-09-03T14:30:00Z"

    def test_scrub_keeps_the_image_and_drops_the_metadata(self) -> None:
        data = _png_image((b"tEXt", b"Author\x00Jane Roe"), (b"tIME", struct.pack(">HBBBBB", 2026, 9, 3, 1, 2, 3)))
        result = m.scrub_png(data)

        assert result.removed
        assert m.scan_png(result.data).findings == []
        # The image itself must survive intact.
        assert b"IDAT" in result.data
        assert b"IEND" in result.data
        assert result.data.startswith(m._PNG_SIG)

    def test_scrub_keeps_rendering_chunks_that_are_not_metadata(self) -> None:
        # Dropping gAMA would change how the image displays.
        data = _png_image((b"gAMA", struct.pack(">I", 45455)), (b"tEXt", b"Author\x00Jane Roe"))
        assert b"gAMA" in m.scrub_png(data).data

    def test_bytes_that_are_not_a_png_raise(self) -> None:
        with pytest.raises(m.MetadataError):
            m.scan_png(b"\x89PNGX")


# --- OOXML -------------------------------------------------------------------


class TestOoxml:
    def test_reads_core_properties(self) -> None:
        found = {f.key: f for f in m.scan_ooxml(_docx({"docProps/core.xml": CORE_XML})).findings}

        assert found["creator"].value == "Jane Roe"
        assert found["creator"].risk is m.Risk.HIGH
        assert found["lastModifiedBy"].risk is m.Risk.HIGH
        assert found["title"].risk is m.Risk.LOW

    def test_reads_custom_properties_once_under_their_real_name(self) -> None:
        custom = (
            '<?xml version="1.0"?>'
            '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" '
            'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
            '<property fmtid="{D5}" pid="2" name="MatterNumber"><vt:lpwstr>ACM-2026-118</vt:lpwstr></property>'
            "</Properties>"
        )
        findings = m.scan_ooxml(_docx({"docProps/custom.xml": custom})).findings
        keys = [f.key for f in findings]

        assert keys.count("MatterNumber") == 1
        # The typed wrapper's own tag is meaningless and must not be reported.
        assert "lpwstr" not in keys

    def test_detects_the_file_kind_from_the_package_layout(self) -> None:
        assert m.scan_ooxml(_docx({})).file_type == "docx"

    def test_scrub_drops_the_property_parts_and_keeps_the_document(self) -> None:
        data = _docx({"docProps/core.xml": CORE_XML})
        result = m.scrub_ooxml(data)

        with zipfile.ZipFile(io.BytesIO(result.data)) as archive:
            names = archive.namelist()
        assert "docProps/core.xml" not in names
        assert "word/document.xml" in names
        assert m.scan_ooxml(result.data).findings == []

    def test_scrub_reports_a_comments_part_as_retained_rather_than_claiming_it_is_clean(self) -> None:
        data = _docx(
            {
                "docProps/core.xml": CORE_XML,
                "word/comments.xml": "<w:comments><w:comment w:author='Jane Roe'/></w:comments>",
            }
        )
        result = m.scrub_ooxml(data)

        # Dropping it would break a relationship and corrupt the document, so it
        # stays — and the report must say so, or the caller acts on "clean".
        assert [f.key for f in result.retained] == ["word/comments.xml"]
        assert result.retained[0].removable is False
        assert result.warnings
        with zipfile.ZipFile(io.BytesIO(result.data)) as archive:
            assert "word/comments.xml" in archive.namelist()

    def test_scrub_flattens_entry_timestamps(self) -> None:
        # A zip entry's own mtime is metadata; keeping it would leak what the
        # scrub just removed.
        result = m.scrub_ooxml(_docx({"docProps/core.xml": CORE_XML}))
        with zipfile.ZipFile(io.BytesIO(result.data)) as archive:
            assert all(info.date_time == (1980, 1, 1, 0, 0, 0) for info in archive.infolist())

    def test_a_malformed_property_part_warns_instead_of_failing_the_scan(self) -> None:
        result = m.scan_ooxml(_docx({"docProps/core.xml": "<not-closed"}))
        # A partial report beats none, but the caller has to know it is partial.
        assert result.warnings
        assert "core.xml" in result.warnings[0]

    def test_bytes_that_are_not_a_zip_raise(self) -> None:
        with pytest.raises(m.MetadataError):
            m.scan_ooxml(b"PK not really")


# --- dispatch ----------------------------------------------------------------


class TestDispatch:
    def test_scan_and_scrub_route_by_file_type(self) -> None:
        data = _png_image((b"tEXt", b"Author\x00Jane Roe"))
        assert m.scan(data, "png").findings
        assert m.scrub(data, "png").removed

    def test_an_unsupported_type_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="unsupported file type"):
            m.scan(b"", "gif")
        with pytest.raises(ValueError, match="unsupported file type"):
            m.scrub(b"", "gif")

    def test_every_supported_type_has_both_a_scanner_and_a_scrubber(self) -> None:
        assert set(m._SCANNERS) == set(m._SCRUBBERS) == set(m.SUPPORTED_TYPES)


class TestValueHandling:
    def test_an_oversized_value_says_it_was_truncated(self) -> None:
        # A value silently cut to look complete is how a reader concludes the
        # rest of it does not exist.
        finding = m._finding("g", "Comment", "x" * 5000)
        assert finding is not None
        assert "truncated" in finding.value
        assert "5000" in finding.value

    def test_empty_and_whitespace_values_produce_no_row(self) -> None:
        assert m._finding("g", "Author", "") is None
        assert m._finding("g", "Author", "   ") is None
        assert m._finding("g", "Author", None) is None

    def test_null_bytes_are_stripped(self) -> None:
        finding = m._finding("g", "Author", b"Jane Roe\x00\x00")
        assert finding is not None
        assert finding.value == "Jane Roe"
