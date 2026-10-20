# Start dashboard in a new window and wait until /api/ping works on port 3000.
param(
  [string]$Root = "",
  [int]$Port = 3000
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

foreach ($p in @(3000, 43123)) {
  Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue |
    ForEach-Object {
      Write-Log "Killing PID $($_.OwningProcess) on port $p"
      Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
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
@"
AAR_REPO_ROOT=$Root
AAR_PYTHON=py
AAR_NO_REST=1
"@ | Set-Content -Path $envFile -Encoding utf8
Write-Log "Wrote $envFile (repo root for /api/health)"
$env:AAR_PYTHON = "py"
$env:AAR_NO_REST = "1"
Remove-Item Env:AAR_DISABLE_EXEC -ErrorAction SilentlyContinue
$env:NEXT_DISABLE_TURBOPACK = "1"

$npmCmd = if ($Port -eq 43123) { "npm run serve:alt" } else { "npm run serve" }
Write-Log "Launching: $npmCmd (build + production — keep window open)"

# /k = keep window open if npm crashes (so you can read errors)
Start-Process -FilePath "cmd.exe" -ArgumentList "/k $npmCmd" -WorkingDirectory $dash -WindowStyle Normal

$pingUrl = "http://127.0.0.1:$Port/api/ping"
Write-Host "Waiting for $pingUrl (up to 90s)..." -ForegroundColor Cyan

$ok = $false
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest -Uri $pingUrl -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200 -and $r.Content -match '"ok"\s*:\s*true') {
      $ok = $true
      break
    }
  } catch {
    if ($i % 15 -eq 14) {
      Write-Host "  still waiting... ($i s) — check the 'npm run dev' window for errors" -ForegroundColor DarkYellow
    }
  }
}

if ($ok) {
  Write-Host "SUCCESS: $pingUrl" -ForegroundColor Green
  Write-Host "Open lab: http://127.0.0.1:$Port/" -ForegroundColor Green
  Start-Process "http://127.0.0.1:$Port/"
  exit 0
}

Write-Host "FAILED: nothing answered on port $Port after 90s." -ForegroundColor Red
Write-Host "ERR_CONNECTION_REFUSED means the server never started or crashed." -ForegroundColor Red
Write-Host "Look at the npm window (red text). Log: $log" -ForegroundColor Yellow
Write-Host "Run: powershell -File `"$Root\scripts\doctor-dashboard.ps1`"" -ForegroundColor Yellow
exit 1
