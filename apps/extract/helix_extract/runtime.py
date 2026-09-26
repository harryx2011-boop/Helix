"""The local-embeddings runtime, fetched on first use.

The desktop exe ships without torch (DESKTOP-PLAN D6): sentence-transformers and
its stack are over a gigabyte, and most installs never embed locally. When the
local provider is first needed and the import fails, the runtime pack is
downloaded once into the runtime dir, unpacked, and put on `sys.path`.

Pack layout, unpacked into `<runtime>/embeddings/`:

    site-packages/   pip --target output (torch, sentence-transformers, ...)
    models/<org>--<name>/   the default model, saved flat so it loads offline
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.util
import os
import shutil
import sys
import threading
import time
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

from .settings import settings

RETRY_AFTER_SECONDS = 30
# A failed attempt is retried by a later request, not by a loop, and not sooner
# than this: a bad checksum is only known after the whole pack has downloaded.
FAILED_RETRY_SECONDS = 300
_CHUNK_BYTES = 1 << 20


def default_runtime_dir() -> Path:
    if settings.helix_runtime_dir:
        return Path(settings.helix_runtime_dir)
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(base) / "Helix" / "runtime"


@dataclass(frozen=True)
class State:
    state: str
    percent: int | None = None
    message: str | None = None

    def describe(self) -> str:
        if self.state == "downloading":
            step = self.message or "downloading"
            return f"The local embeddings runtime is {step} ({self.percent or 0}%)."
        if self.state == "failed":
            return f"The local embeddings runtime failed to install: {self.message}"
        if self.state == "missing":
            return "The local embeddings runtime is missing."
        return "The local embeddings runtime is ready."


class RuntimeNotReadyError(RuntimeError):
    """The runtime is being fetched, or the last fetch failed."""

    def __init__(self, state: State) -> None:
        self.state = state
        self.retry_after = RETRY_AFTER_SECONDS
        super().__init__(state.describe())


class EmbeddingsRuntime:
    def __init__(
        self,
        root: Path,
        url: str,
        module: str = "sentence_transformers",
    ) -> None:
        self.root = root
        self.url = url
        self.module = module
        self._lock = threading.Lock()
        self._state = State("missing")
        self._failed_at = 0.0
        self._thread: threading.Thread | None = None

    @property
    def home(self) -> Path:
        return self.root / "embeddings"

    @property
    def site_packages(self) -> Path:
        return self.home / "site-packages"

    @property
    def models(self) -> Path:
        return self.home / "models"

    def state(self) -> State:
        with self._lock:
            return self._state

    def activate(self) -> bool:
        """Put an unpacked pack on `sys.path`. True when it was added.

        An environment that already provides the module (the dev venv) keeps its
        own copy: the pack only fills a gap, it never shadows an install.
        """
        if self._importable():
            self._set(State("ready"))
            return False
        if not self.site_packages.is_dir():
            return False
        self._install()
        if self._importable():
            self._set(State("ready"))
        return True

    def ensure(self) -> None:
        """Return when the module can be imported; otherwise fetch it and raise."""
        with self._lock:
            if self._state.state == "ready":
                return
            if self._state.state == "downloading":
                raise RuntimeNotReadyError(self._state)
            if self._importable():
                self._state = State("ready")
                return
            recent = time.monotonic() - self._failed_at < FAILED_RETRY_SECONDS
            if self._state.state == "failed" and recent:
                raise RuntimeNotReadyError(self._state)
            self._state = State("downloading", percent=0)
            self._thread = threading.Thread(
                target=self._fetch_and_install, name="helix-embeddings-runtime", daemon=True
            )
            self._thread.start()
            raise RuntimeNotReadyError(self._state)

    def wait(self, timeout: float | None = None) -> State:
        thread = self._thread
        if thread is not None:
            thread.join(timeout)
        return self.state()

    def _set(self, state: State) -> None:
        with self._lock:
            self._state = state

    def _importable(self) -> bool:
        importlib.invalidate_caches()
        try:
            return importlib.util.find_spec(self.module) is not None
        except (ImportError, ValueError):
            return False

    def model_path(self, name: str) -> str | None:
        """The pack's saved copy of `name`, loadable with no network, if present."""
        folder = self.models / name.replace("/", "--")
        return str(folder) if (folder / "modules.json").is_file() else None

    def _install(self) -> None:
        path = str(self.site_packages)
        if path not in sys.path:
            sys.path.insert(0, path)
        # Any model beyond the bundled one downloads beside the pack, not into a
        # user-wide cache the uninstaller would never clean.
        os.environ["HF_HOME"] = str(self.models)
        os.environ["SENTENCE_TRANSFORMERS_HOME"] = str(self.models / "hub")
        importlib.invalidate_caches()

    def _fetch_and_install(self) -> None:
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            archive = self.root / "embeddings-runtime.zip.part"
            expected = self._expected_sha256()
            digest = self._download(archive)
            if expected is not None and digest != expected:
                raise ValueError(f"checksum mismatch: expected {expected}, got {digest}")
            self._set(State("downloading", percent=100, message="unpacking"))
            self._unpack(archive)
            archive.unlink(missing_ok=True)
            self._set(State("downloading", percent=100, message="loading"))
            self._install()
            importlib.import_module(self.module)
        except Exception as exc:
            shutil.rmtree(_long(self.root / "embeddings.partial"), ignore_errors=True)
            with self._lock:
                self._state = State("failed", message=f"{type(exc).__name__}: {exc}")
                self._failed_at = time.monotonic()
            return
        self._set(State("ready"))

    def _expected_sha256(self) -> str | None:
        try:
            with urllib.request.urlopen(self.url + ".sha256", timeout=60) as response:
                text = response.read(4096).decode("ascii", errors="replace")
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            raise
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, FileNotFoundError):
                return None
            raise
        token = text.split()[0].lower() if text.split() else ""
        if len(token) != 64 or any(c not in "0123456789abcdef" for c in token):
            raise ValueError("the .sha256 sidecar does not hold a SHA-256 digest")
        return token

    def _download(self, target: Path) -> str:
        digest = hashlib.sha256()
        with urllib.request.urlopen(self.url, timeout=60) as response, target.open("wb") as out:
            total = int(response.headers.get("Content-Length") or 0)
            done = 0
            while chunk := response.read(_CHUNK_BYTES):
                out.write(chunk)
                digest.update(chunk)
                done += len(chunk)
                if total:
                    self._set(State("downloading", percent=min(99, done * 100 // total)))
        return digest.hexdigest()

    def _unpack(self, archive: Path) -> None:
        partial = _long(self.root / "embeddings.partial")
        shutil.rmtree(partial, ignore_errors=True)
        with zipfile.ZipFile(archive) as bundle:
            bundle.extractall(partial)
        if not os.path.isdir(os.path.join(partial, "site-packages")):
            raise ValueError("the runtime pack has no site-packages directory")
        if self.home.exists():
            # A broken earlier install may hold loaded DLLs; move it aside rather
            # than fail on a delete Windows refuses.
            stale = _long(self.root / f"embeddings.stale-{int(time.time())}")
            os.rename(_long(self.home), stale)
            shutil.rmtree(stale, ignore_errors=True)
        os.rename(partial, _long(self.home))


def _long(path: Path) -> str:
    # Extended-length form: torch's deepest files pass MAX_PATH under a long
    # runtime dir, and LongPathsEnabled is off on a default Windows install.
    text = str(path.resolve())
    if sys.platform == "win32" and not text.startswith("\\\\?\\"):
        return "\\\\?\\" + text
    return text


embeddings_runtime = EmbeddingsRuntime(
    root=default_runtime_dir(),
    url=settings.helix_embeddings_runtime_url,
)
