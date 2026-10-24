"""OOXML scan and scrub refuse archives that would inflate past a bound.

A small upload can declare gigabytes of entries. The limits are lowered here
so the tests build kilobytes, not gigabytes; the check reads the declared
sizes, so the shape of the refusal is the same at any scale.
"""

from __future__ import annotations

import io
import zipfile

import pytest

from helix_extract import metadata as m


def _docx(entries: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<w:document><w:body/></w:document>")
        for name, body in entries.items():
            archive.writestr(name, body)
    return buffer.getvalue()


def test_scrub_refuses_an_archive_that_inflates_past_the_total(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(m, "_OOXML_MAX_TOTAL_BYTES", 10_000)
    data = _docx({"word/media/big.bin": b"\x00" * 50_000})
    with pytest.raises(m.MetadataError):
        m.scrub_ooxml(data)


def test_scan_refuses_an_archive_with_too_many_entries(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(m, "_OOXML_MAX_ENTRIES", 5)
    data = _docx({f"word/media/{i}.bin": b"x" for i in range(10)})
    with pytest.raises(m.MetadataError):
        m.scan_ooxml(data)


def test_scan_skips_a_property_part_larger_than_the_cap(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(m, "_OOXML_MAX_PART_BYTES", 100)
    data = _docx({"docProps/core.xml": "<cp:coreProperties>" + "x" * 500 + "</cp:coreProperties>"})
    result = m.scan_ooxml(data)
    assert any("docProps/core.xml" in warning for warning in result.warnings)


def test_an_ordinary_document_still_scrubs() -> None:
    data = _docx({"docProps/core.xml": "<cp:coreProperties/>"})
    result = m.scrub_ooxml(data)
    with zipfile.ZipFile(io.BytesIO(result.data)) as archive:
        assert "docProps/core.xml" not in archive.namelist()
