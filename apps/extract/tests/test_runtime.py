"""The local-embeddings runtime: sys.path activation and the fetch state machine.

A fake pack stands in for torch: a zip holding one importable module under
site-packages/, fetched over file:// exactly as the real one is over https.
"""

from __future__ import annotations

import hashlib
import os
import sys
import uuid
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from helix_extract import runtime
from helix_extract.main import app
from helix_extract.runtime import EmbeddingsRuntime, RuntimeNotReadyError, State

MODEL = "org/tiny-model"


@pytest.fixture(autouse=True)
def _isolate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "path", list(sys.path))
    for name in ("HF_HOME", "SENTENCE_TRANSFORMERS_HOME"):
        monkeypatch.delenv(name, raising=False)


def _module_name() -> str:
    return f"helix_fake_embeddings_{uuid.uuid4().hex[:8]}"


def _pack(path: Path, module: str, *, site_packages: bool = True) -> Path:
    with zipfile.ZipFile(path, "w") as bundle:
        top = "site-packages" if site_packages else "lib"
        bundle.writestr(f"{top}/{module}/__init__.py", "VALUE = 384\n")
        bundle.writestr("models/org--tiny-model/modules.json", "[]\n")
    return path


def _runtime(tmp_path: Path, url: str, module: str) -> EmbeddingsRuntime:
    return EmbeddingsRuntime(root=tmp_path / "rt", url=url, module=module)


def test_activate_without_a_pack_leaves_sys_path_alone(tmp_path: Path) -> None:
    before = list(sys.path)
    rt = _runtime(tmp_path, "file:///nowhere.zip", _module_name())

    assert rt.activate() is False
    assert sys.path == before
    assert rt.state() == State("missing")


def test_activate_puts_an_unpacked_pack_first_on_sys_path(tmp_path: Path) -> None:
    module = _module_name()
    rt = _runtime(tmp_path, "file:///nowhere.zip", module)
    with zipfile.ZipFile(_pack(tmp_path / "pack.zip", module)) as bundle:
        bundle.extractall(rt.home)

    assert rt.activate() is True
    assert sys.path[0] == str(rt.site_packages)
    assert rt.state() == State("ready")
    assert __import__(module).VALUE == 384
    assert os.environ["HF_HOME"] == str(rt.models)
    assert os.environ["SENTENCE_TRANSFORMERS_HOME"] == str(rt.models / "hub")
    assert rt.model_path(MODEL) == str(rt.models / "org--tiny-model")
    assert rt.model_path("org/absent-model") is None


def test_activate_never_shadows_an_installed_module(tmp_path: Path) -> None:
    rt = _runtime(tmp_path, "file:///nowhere.zip", "json")
    (rt.site_packages / "json").mkdir(parents=True)
    before = list(sys.path)

    assert rt.activate() is False
    assert sys.path == before
    assert rt.state() == State("ready")


def test_ensure_downloads_once_then_reports_ready(tmp_path: Path) -> None:
    module = _module_name()
    pack = _pack(tmp_path / "pack.zip", module)
    rt = _runtime(tmp_path, pack.as_uri(), module)

    with pytest.raises(RuntimeNotReadyError) as first:
        rt.ensure()
    assert first.value.state.state == "downloading"
    assert first.value.retry_after == 30
    assert "downloading" in str(first.value) and "%" in str(first.value)

    assert rt.wait(30) == State("ready")
    rt.ensure()
    assert sys.path[0] == str(rt.site_packages)
    assert module in sys.modules
    assert not (rt.root / "embeddings-runtime.zip.part").exists()
    assert not (rt.root / "embeddings.partial").exists()


def test_ensure_does_not_start_a_second_download(tmp_path: Path) -> None:
    rt = _runtime(tmp_path, "file:///unused.zip", _module_name())
    rt._state = State("downloading", percent=42)

    with pytest.raises(RuntimeNotReadyError) as raised:
        rt.ensure()
    assert raised.value.state.percent == 42
    assert "42%" in str(raised.value)
    assert rt._thread is None


def test_a_matching_sha256_sidecar_is_accepted(tmp_path: Path) -> None:
    module = _module_name()
    pack = _pack(tmp_path / "pack.zip", module)
    digest = hashlib.sha256(pack.read_bytes()).hexdigest()
    Path(str(pack) + ".sha256").write_text(f"{digest}  pack.zip\n")
    rt = _runtime(tmp_path, pack.as_uri(), module)

    with pytest.raises(RuntimeNotReadyError):
        rt.ensure()
    assert rt.wait(30) == State("ready")


def test_a_mismatched_sha256_sidecar_fails_and_is_not_retried_at_once(tmp_path: Path) -> None:
    module = _module_name()
    pack = _pack(tmp_path / "pack.zip", module)
    Path(str(pack) + ".sha256").write_text("0" * 64 + "  pack.zip\n")
    rt = _runtime(tmp_path, pack.as_uri(), module)

    with pytest.raises(RuntimeNotReadyError):
        rt.ensure()
    failed = rt.wait(30)
    assert failed.state == "failed"
    assert "checksum mismatch" in (failed.message or "")
    assert not rt.home.exists()

    thread = rt._thread
    with pytest.raises(RuntimeNotReadyError) as again:
        rt.ensure()
    assert again.value.state.state == "failed"
    assert rt._thread is thread


def test_a_failed_fetch_is_retried_after_the_cooldown(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = _module_name()
    rt = _runtime(tmp_path, (tmp_path / "absent.zip").as_uri(), module)
    with pytest.raises(RuntimeNotReadyError):
        rt.ensure()
    assert rt.wait(30).state == "failed"

    _pack(tmp_path / "absent.zip", module)
    monkeypatch.setattr(runtime, "FAILED_RETRY_SECONDS", 0)
    with pytest.raises(RuntimeNotReadyError) as retried:
        rt.ensure()
    assert retried.value.state.state == "downloading"
    assert rt.wait(30) == State("ready")


def test_unpacking_survives_paths_past_max_path(tmp_path: Path) -> None:
    module = _module_name()
    deep = "d" * 120 + "/" + "e" * 120 + "/weights.bin"
    pack = _pack(tmp_path / "pack.zip", module)
    with zipfile.ZipFile(pack, "a") as bundle:
        bundle.writestr(f"site-packages/{module}/{deep}", "x")
    rt = _runtime(tmp_path, pack.as_uri(), module)

    with pytest.raises(RuntimeNotReadyError):
        rt.ensure()
    assert rt.wait(30) == State("ready")


def test_a_pack_without_site_packages_fails(tmp_path: Path) -> None:
    module = _module_name()
    pack = _pack(tmp_path / "pack.zip", module, site_packages=False)
    rt = _runtime(tmp_path, pack.as_uri(), module)

    with pytest.raises(RuntimeNotReadyError):
        rt.ensure()
    failed = rt.wait(30)
    assert failed.state == "failed"
    assert "site-packages" in (failed.message or "")
    assert not (rt.root / "embeddings.partial").exists()


def test_runtime_dir_defaults_under_localappdata(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runtime.settings, "helix_runtime_dir", None)
    monkeypatch.setenv("LOCALAPPDATA", r"C:\Users\x\AppData\Local")
    assert runtime.default_runtime_dir() == Path(r"C:\Users\x\AppData\Local\Helix\runtime")

    monkeypatch.setattr(runtime.settings, "helix_runtime_dir", r"D:\rt")
    assert runtime.default_runtime_dir() == Path(r"D:\rt")


def test_health_reports_local_embeddings_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runtime.embeddings_runtime, "_state", State("downloading", percent=7))
    body = TestClient(app).get("/health").json()

    assert body["local_embeddings"] == {"state": "downloading", "percent": 7, "message": None}
    assert body["status"] == "ok"
    assert body["embedding_model"]


def test_chunk_answers_503_with_retry_after_while_fetching(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from helix_extract import embeddings

    def pending() -> None:
        raise RuntimeNotReadyError(State("downloading", percent=12))

    embeddings._local_model.cache_clear()
    monkeypatch.setattr(runtime.embeddings_runtime, "ensure", pending)
    monkeypatch.setattr(embeddings.settings, "helix_embedding_provider", "local")

    response = TestClient(app).post(
        "/chunk",
        json={"text": "# Title\n\nSome text to embed.", "url": "https://x.test/", "embed": True},
    )

    assert response.status_code == 503
    assert response.headers["retry-after"] == "30"
    assert "downloading" in response.json()["detail"]
    assert "12%" in response.json()["detail"]
