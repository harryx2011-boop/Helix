# Builds dist\helix-extract\helix-extract.exe: one-folder, windowed, no torch.
# Run from anywhere: powershell -NoProfile -File apps/extract/build-exe.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'
$dist = Join-Path $root 'dist'
$work = Join-Path $root 'build'
$spec = Join-Path $root 'helix-extract.spec'

if (-not (Test-Path $python)) { throw "No venv interpreter at $python" }

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

$folder = Join-Path $dist 'helix-extract'
$exe = Join-Path $folder 'helix-extract.exe'
if (-not (Test-Path $exe)) { throw "Build finished but $exe is missing" }

$bytes = (Get-ChildItem $folder -Recurse -File | Measure-Object Length -Sum).Sum
Write-Output ("Built {0} ({1:N1} MB)" -f $exe, ($bytes / 1MB))
