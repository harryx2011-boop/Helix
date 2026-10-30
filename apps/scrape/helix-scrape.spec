# PyInstaller spec: one-folder, windowed helix-scrape.exe for the desktop app.
# Build with build-exe.ps1. The collect list is the one the Phase 0 freeze proved
# (docs/adr/0001-scrapling.md): without apify_fingerprint_datapoints the exe
# starts but fails at run time on a missing input-network-definition.zip.

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas, binaries, hiddenimports = [], [], []
for package in (
    "scrapling", "patchright", "browserforge", "apify_fingerprint_datapoints",
    "curl_cffi", "tld",
):
    d, b, h = collect_all(package)
    datas += d
    binaries += b
    hiddenimports += h
for package in ("helix_scrape", "uvicorn"):
    hiddenimports += collect_submodules(package)

a = Analysis(
    ["helix_scrape/__main__.py"],
    pathex=[SPECPATH],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "_tkinter", "pytest", "mypy", "IPython", "matplotlib"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="helix-scrape",
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
    name="helix-scrape",
)
