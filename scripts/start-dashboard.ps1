# Start dashboard in a new window and wait until /api/ping works.
param(
  [string]$Root = "",
  [int]$Port = 3000,
  [string]$OpenBrowserPath = "/"
)

$ErrorActionPreference = "Continue"
if (-not $Root) {
  $Root = Split-Path $PSScriptRoot -Parent
}

$dash = Join-Path $Root "dashboard"
$log = Join-Path $dash "dashboard-start.log"

function Write-Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $log -Value $line
  Write-Host $msg
}

Write-Log "=== start-dashboard ==="
Write-Log "Root: $Root"

$preflight = Join-Path $Root "scripts\preflight-repo.ps1"
if (Test-Path $preflight) {
  & $preflight -Root $Root
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

if (-not (Test-Path (Join-Path $dash "package.json"))) {
  Write-Host "ERROR: Missing $dash\package.json" -ForegroundColor Red
  exit 1
}

try {
  $null = Get-Command node -ErrorAction Stop
  Write-Log "node: $(node -v)"
} catch {
  Write-Host "ERROR: Node.js not installed. Install LTS from https://nodejs.org/ then retry." -ForegroundColor Red
  exit 1
}

$ensureNode = Join-Path $Root "scripts\ensure-node.ps1"
if (Test-Path $ensureNode) {
  & $ensureNode
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

$killNode = Join-Path $Root "scripts\kill-node-on-port.ps1"
foreach ($p in @(3000, 43123)) {
  if (Test-Path $killNode) {
    Write-Log "Stopping node on port $p (if any)"
    & $killNode -Port $p
  }
}

$assertPort = Join-Path $Root "scripts\assert-dashboard-port.ps1"
if (Test-Path $assertPort) {
  Write-Log "Checking port $Port is not held by Cursor/another app"
  & $assertPort -Port $Port -KillNodeFirst
  if ($LASTEXITCODE -ne 0) {
    Write-Log "Port $Port blocked - see message above"
    exit 1
  }
}

Set-Location $dash

if (-not (Test-Path "node_modules")) {
  Write-Log "npm install..."
  npm install 2>&1 | Tee-Object -FilePath $log -Append
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

$env:AAR_REPO_ROOT = $Root
$envFile = Join-Path $dash ".env.local"
$envLines = @(
  "AAR_REPO_ROOT=$Root"
  "AAR_PYTHON=py"
  "AAR_NO_REST=1"
)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($envFile, $envLines, $utf8NoBom)
Write-Log "Wrote $envFile (repo root for /api/health)"
$env:AAR_PYTHON = "py"
$env:AAR_NO_REST = "1"
Remove-Item Env:AAR_DISABLE_EXEC -ErrorAction SilentlyContinue
$env:NEXT_DISABLE_TURBOPACK = "1"
$env:NODE_OPTIONS = "--max-old-space-size=768"

$npmCmd = if ($Port -eq 43123) { "npm run serve:alt" } else { "npm run serve" }
Write-Log "Launching: $npmCmd (build + production - keep window open)"

Start-Process -FilePath "cmd.exe" -ArgumentList "/k $npmCmd" -WorkingDirectory $dash -WindowStyle Normal

$pingUrl = "http://127.0.0.1:$Port/api/ping"
$waitSec = 1800
Write-Host "Waiting for $pingUrl (up to $waitSec seconds on first build)..." -ForegroundColor Cyan
Write-Host "If the npm window shows red text, copy it - do not close that window yet." -ForegroundColor DarkGray

$ok = $false
for ($i = 0; $i -lt $waitSec; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest -Uri $pingUrl -UseBasicParsing -TimeoutSec 3
    $pingJsonOk = ($r.Content -match 'aar-dashboard') -and ($r.Content -match '\bok\b')
    if ($r.StatusCode -eq 200 -and $pingJsonOk) {
      $ok = $true
      break
    }
    if ($r.StatusCode -eq 200 -and $r.Content -match 'vercel-root-shell') {
      Write-Host "WRONG APP on port $Port (repo-root shell). Use START-HERE-43123.bat only." -ForegroundColor Red
      exit 1
    }
  } catch {
    if ($i -gt 0 -and $i % 60 -eq 0) {
      Write-Host "  still waiting... ${i}s elapsed - first npm run build can take 10-25 min on old HDD" -ForegroundColor DarkYellow
    }
  }
}

if ($ok) {
  Write-Host "SUCCESS: $pingUrl" -ForegroundColor Green
  Write-Host "Open lab: http://127.0.0.1:$Port$OpenBrowserPath" -ForegroundColor Green
  Write-Host "For 24/7 use START-24-7-WATCHDOG.bat instead of this window." -ForegroundColor DarkYellow
  & (Join-Path $Root "scripts\open-lab-browser.ps1") -Port $Port -Path $OpenBrowserPath
  exit 0
}

Write-Host "FAILED: nothing answered on port $Port after $waitSec seconds." -ForegroundColor Red
Write-Host "ERR_CONNECTION_REFUSED means the server never started or crashed." -ForegroundColor Red
Write-Host "Look at the npm window (red text). Log: $log" -ForegroundColor Yellow
$doctorScript = Join-Path $Root "scripts\doctor-dashboard.ps1"
Write-Host "Run: powershell -ExecutionPolicy Bypass -File $doctorScript" -ForegroundColor Yellow
exit 1
