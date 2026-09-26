# Builds dist\helix-embeddings-runtime-win-x64.zip (+ .sha256): the local-embeddings
# runtime that helix-extract.exe downloads on first use (DESKTOP-PLAN D6).
# Layout: site-packages\ (CPU torch + sentence-transformers) and models\<org>--<name>\.
# Run from anywhere: powershell -NoProfile -File apps/extract/build-runtime-pack.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'
$stage = Join-Path $root 'build\runtime-pack'
$site = Join-Path $stage 'site-packages'
$models = Join-Path $stage 'models'
$dist = Join-Path $root 'dist'
$zip = Join-Path $dist 'helix-embeddings-runtime-win-x64.zip'
$model = 'sentence-transformers/all-MiniLM-L6-v2'

if (-not (Test-Path $python)) { throw "No venv interpreter at $python" }

function Invoke-Native([string]$label, [scriptblock]$block) {
    # Native tools log to stderr; judge them by exit code alone.
    $ErrorActionPreference = 'Continue'
    & $block
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -ne 0) { throw "$label exited with code $code" }
}

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $site, $models, $dist | Out-Null

# Pin the pack to the venv's versions: the exe's own copies of shared packages
# (httpx, typing_extensions, ...) then match what the pack was resolved against.
$constraints = Join-Path $stage 'constraints.txt'
Invoke-Native 'pip freeze' {
    & $python -m pip freeze --exclude-editable --disable-pip-version-check |
        Where-Object { $_ -notmatch ' @ ' -and $_ -notmatch '^-e ' } |
        Set-Content -Encoding ascii $constraints
}

Invoke-Native 'pip install' {
    & $python -m pip install --target $site --only-binary=:all: --no-warn-script-location `
        --disable-pip-version-check -c $constraints `
        'sentence-transformers>=3.3.0' 'torch' `
        --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple
}
# Scripts and C++ headers are never used at runtime, and the headers are the
# deepest paths in the pack.
foreach ($unused in @('bin', 'torch\include')) {
    $path = Join-Path $site $unused
    if (Test-Path $path) { Remove-Item $path -Recurse -Force }
}

# Save the weights flat through the pack itself, which also proves it imports.
# The hub cache stays outside the pack: its snapshot paths are deep.
$saved = Join-Path $models ($model -replace '/', '--')
$env:PYTHONPATH = $site
$env:HF_HOME = Join-Path $root 'build\runtime-pack-hf'
$env:HF_HUB_DISABLE_PROGRESS_BARS = '1'
try {
    Invoke-Native 'weights download' {
        & $python -c "import sys, torch, sentence_transformers as st; m = st.SentenceTransformer('$model'); m.save(sys.argv[1]); v = st.SentenceTransformer(sys.argv[1]).encode(['helix']); assert v.shape == (1, 384), v.shape; print('pack ok', torch.__version__, torch.__file__)" $saved
    }
}
finally {
    Remove-Item Env:PYTHONPATH, Env:HF_HOME, Env:HF_HUB_DISABLE_PROGRESS_BARS -ErrorAction SilentlyContinue
}

if (Test-Path $zip) { Remove-Item $zip -Force }
Invoke-Native 'zip' {
    & $python -c @"
import sys, zipfile
from pathlib import Path
stage, out = Path(sys.argv[1]), sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for top in ('site-packages', 'models'):
        for f in sorted((stage / top).rglob('*')):
            if f.is_file() and '__pycache__' not in f.parts:
                z.write(f, f.relative_to(stage).as_posix())
"@ $stage $zip
}

$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
Set-Content -Encoding ascii -NoNewline -Path "$zip.sha256" -Value "$hash  helix-embeddings-runtime-win-x64.zip"
$size = (Get-Item $zip).Length
Write-Output ("Built {0} ({1:N1} MB) sha256 {2}" -f $zip, ($size / 1MB), $hash)
