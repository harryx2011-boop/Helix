# Builds dist\helix-scrape\helix-scrape.exe: one-folder, windowed (about 150 MB).
# Run from anywhere: powershell -NoProfile -File apps/scrape/build-exe.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'
$dist = Join-Path $root 'dist'
$work = Join-Path $root 'build'
$spec = Join-Path $root 'helix-scrape.spec'

if (-not (Test-Path $python)) { throw "No venv interpreter at $python" }

# The venv is made by uv and has no pip; PyInstaller is a build tool, not a dependency.
# Windows PowerShell turns a native command's stderr into a terminating error under 'Stop',
# even with 2>$null, so the probe runs under 'Continue' and is judged by its exit code.
$ErrorActionPreference = 'Continue'
& $python -c "import PyInstaller" 2>$null
$probe = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($probe -ne 0) {
    & uv pip install --python $python pyinstaller
    if ($LASTEXITCODE -ne 0) { throw "Could not install PyInstaller into $python" }
}

Push-Location $root
try {
    # PyInstaller logs to stderr; keep PowerShell from treating that as failure.
    $ErrorActionPreference = 'Continue'
    & $python -m PyInstaller --noconfirm --clean --log-level WARN --distpath $dist --workpath $work $spec
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -ne 0) { throw "PyInstaller exited with code $code" }
}
finally {
    Pop-Location
}

$folder = Join-Path $dist 'helix-scrape'
$exe = Join-Path $folder 'helix-scrape.exe'
if (-not (Test-Path $exe)) { throw "Build finished but $exe is missing" }

$bytes = (Get-ChildItem $folder -Recurse -File | Measure-Object Length -Sum).Sum
Write-Output ("Built {0} ({1:N1} MB)" -f $exe, ($bytes / 1MB))
