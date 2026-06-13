# Single-command launcher for the Dawa load-test control dashboard.
#
#   powershell -ExecutionPolicy Bypass -File loadtest\start-dashboard.ps1
#
# - ensures the Python venv + dashboard deps exist
# - builds the React UI (ui/dist) if missing
# - starts the FastAPI server on http://127.0.0.1:8765 and opens a browser
#
# Pass -Rebuild to force a fresh UI build.

param([switch]$Rebuild)

$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Venv = Join-Path $Here ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"
$UiDir = Join-Path $Here "ui"
$Dist = Join-Path $UiDir "dist\index.html"

# 1. Python venv
if (-not (Test-Path $Py)) {
    Write-Host "[dashboard] creating venv..." -ForegroundColor Cyan
    python -m venv $Venv
}

# 2. Python deps (install if FastAPI is missing)
& $Py -c "import fastapi, uvicorn, dotenv" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[dashboard] installing Python deps..." -ForegroundColor Cyan
    & $Py -m pip install -r (Join-Path $Here "requirements.txt")
}

# 3. UI build
if ($Rebuild -or -not (Test-Path $Dist)) {
    if (-not (Test-Path (Join-Path $UiDir "node_modules"))) {
        Write-Host "[dashboard] npm install (ui)..." -ForegroundColor Cyan
        npm install --prefix $UiDir
    }
    Write-Host "[dashboard] building ui..." -ForegroundColor Cyan
    npm run build --prefix $UiDir
}

# 4. Launch (cwd = loadtest so 'dashboard' + 'cleanup_core' import cleanly)
Write-Host "[dashboard] starting on http://127.0.0.1:8765 ..." -ForegroundColor Green
Push-Location $Here
try {
    & $Py -m dashboard.main
} finally {
    Pop-Location
}
