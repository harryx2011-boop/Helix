# PyInstaller spec: one-folder, windowed helix-extract.exe (DESKTOP-PLAN Phase 5).
# Build with build-exe.ps1. torch and the embeddings stack are left out on
# purpose; runtime.py fetches them on first use (D6).

import sys

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# The runtime pack is plain site-packages run by this frozen interpreter, so it
# can only import stdlib modules the exe carries. Carry all of them.
STDLIB_SKIP = {
    "__phello__", "_tkinter", "antigravity", "curses", "ensurepip", "idlelib",
    "lib2to3", "msilib", "test", "this", "tkinter", "turtle", "turtledemo",
}
stdlib = []
for name in sorted(sys.stdlib_module_names - STDLIB_SKIP):
    if name.startswith(("_test", "xx")):
        continue
    try:
        __import__(name)
    except Exception:
        continue
    stdlib += collect_submodules(
        name, filter=lambda m: ".test" not in m, on_error="ignore"
    )

hiddenimports = stdlib
for package in (
    "helix_extract", "uvicorn", "trafilatura", "justext", "courlan", "htmldate",
    "dateparser", "tld", "readability", "openai", "anthropic", "google.genai",
):
    hiddenimports += collect_submodules(package, on_error="ignore")

datas = []
for package in (
    "trafilatura", "justext", "courlan", "htmldate", "dateparser", "tld", "babel",
    "certifi", "docx", "pptx", "openpyxl", "readability", "pypdfium2", "pypdfium2_raw",
    "lxml", "google.genai",
):
    datas += collect_data_files(package)

EXCLUDES = [
    "torch", "torchvision", "torchaudio", "sentence_transformers", "transformers",
    "sklearn", "scipy", "numpy", "huggingface_hub", "hf_xet", "tokenizers", "safetensors",
    "sympy", "mpmath", "networkx", "triton", "pandas", "matplotlib", "IPython",
    "tkinter", "_tkinter", "pytest", "mypy", "marker", "docling", "setuptools",
]

a = Analysis(
    ["helix_extract/__main__.py"],
    pathex=[SPECPATH],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=EXCLUDES,
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="helix-extract",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="helix-extract",
)
