# Diagnose ERR_EMPTY_RESPONSE / connection reset on http://127.0.0.1:3000
param([string]$Root = "")

if (-not $Root) { $Root = Split-Path $PSScriptRoot -Parent }
$dash = Join-Path $Root "dashboard"

Write-Host "=== Dashboard doctor ===" -ForegroundColor Cyan
Write-Host "Root: $Root"
Write-Host "Dash: $dash"

Write-Host "`n[0] Node.js (required)"
try {
  Write-Host "  OK node $(node -v) npm $(npm -v)" -ForegroundColor Green
} catch {
  Write-Host "  MISSING — install https://nodejs.org/ LTS" -ForegroundColor Red
}

Write-Host "`n[1] Port 3000 and 43123 listeners"
foreach ($port in @(3000, 43123)) {
  $listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $listen) {
    Write-Host "  Port $port: NOTHING LISTENING -> ERR_CONNECTION_REFUSED in browser" -ForegroundColor Red
    continue
  }
  $listen | ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "  Port $port PID $($_.OwningProcess) process=$($p.ProcessName)" -ForegroundColor Green
  }
}

Write-Host "`n[2] Quick HTTP probe (PowerShell)"
foreach ($url in @("http://127.0.0.1:3000/api/ping", "http://127.0.0.1:43123/api/ping", "http://127.0.0.1:3000/")) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    if ($url -match "/api/ping") {
      $j = $r.Content | ConvertFrom-Json
      if ($j.ok -eq $true -and $j.service -eq "aar-dashboard") {
        Write-Host "  OK $url -> aar-dashboard" -ForegroundColor Green
      } elseif ($j.service -eq "vercel-root-shell") {
        Write-Host "  WRONG APP $url -> repo-root Next (no backtest). Kill port 3000; use START-HERE.bat or use :43123" -ForegroundColor Yellow
      } else {
        Write-Host "  WARN $url -> $($r.Content)" -ForegroundColor Yellow
      }
    } else {
      Write-Host "  OK $url -> $($r.StatusCode) len=$($r.Content.Length)" -ForegroundColor Green
    }
  } catch {
    Write-Host "  FAIL $url -> $($_.Exception.Message)" -ForegroundColor Red
    if ($url -match ":3000/api/ping") {
      Write-Host "       (listen on 3000 but no dashboard ping = wrong Next app or still compiling)" -ForegroundColor DarkYellow
    }
  }
}

Write-Host "`n[3] Node / npm"
node -v
npm -v

Write-Host "`n[4] Engine files"
@("aar\__main__.py", "tools\year_by_year_report.py", "dashboard\package.json") | ForEach-Object {
  $p = Join-Path $Root $_
  Write-Host "  $(if (Test-Path $p) {'OK'} else {'MISSING'}) $_"
}

Write-Host "`n[5] Recommended fix (copy/paste)"
Write-Host @"
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id `$_.OwningProcess -Force -ErrorAction SilentlyContinue }
cd `"$dash`"
if (Test-Path .next) { Remove-Item -Recurse -Force .next }
npm install
npm run dev
"@ -ForegroundColor Yellow

Write-Host "`nWait for 'Ready' in the terminal, then open http://127.0.0.1:3000/api/ping" -ForegroundColor Green
