# commit-grapher — one-command setup & run (Windows / PowerShell).
#   .\start.ps1          build the frontend once, then serve everything on http://localhost:8000
#   .\start.ps1 dev      run backend (:8000) + Vite hot-reload frontend (:5173) together
# ponytail: mirrors start.sh for Windows; keep the two in sync when steps change.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$Port = if ($env:PORT) { $env:PORT } else { '8000' }
$Py   = if ($env:PYTHON) { $env:PYTHON } else { 'python' }

function Need($cmd) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "X '$cmd' not found — please install it first." -ForegroundColor Red; exit 1
  }
}
Need $Py; Need node; Need npm

# 1) Python venv + backend (idempotent: only create/install when missing).
if (-not (Test-Path .venv)) {
  Write-Host "> Creating virtualenv (.venv)..."
  & $Py -m venv .venv
}
$VenvPy = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
& $VenvPy -c "import app.main" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "> Installing backend (pip install -e backend)..."
  & $VenvPy -m pip install -q --upgrade pip
  & $VenvPy -m pip install -q -e backend
}

# 2) Frontend deps (idempotent).
if (-not (Test-Path frontend\node_modules)) {
  Write-Host "> Installing frontend deps (npm install)..."
  Push-Location frontend; npm install --silent; Pop-Location
}

# dev mode: backend + Vite together, Vite proxies /api to :8000.
if ($args[0] -eq 'dev') {
  Write-Host "> Dev mode — backend on :$Port, frontend on :5173"
  $backend = Start-Process -FilePath $VenvPy `
    -ArgumentList '-m','uvicorn','app.main:app','--app-dir','backend','--reload','--port',$Port `
    -PassThru -NoNewWindow
  try { Push-Location frontend; npm run dev } finally { Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue; Pop-Location }
  exit 0
}

# default: build the SPA once, let the backend serve it on a single port.
Write-Host "> Building frontend (npm run build)..."
Push-Location frontend; npm run build --silent; Pop-Location
Write-Host "> Ready -> http://localhost:$Port"
& $VenvPy -m uvicorn app.main:app --app-dir backend --port $Port
