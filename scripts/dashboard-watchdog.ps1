# Keeps dashboard on port 43123 running - restarts if Node crashes, hangs, or fails /api/ping.
param(
  [string]$Root = "",
  [int]$Port = 43123,
  [int]$HealthSec = 45,
  [int]$MaxHeapMb = 768
)

if (-not $Root) { $Root = Split-Path $PSScriptRoot -Parent }
$dash = Join-Path $Root "dashboard"
$log = Join-Path $dash "watchdog.log"
$serverLog = Join-Path $dash "node-server.log"
$killPort = Join-Path $Root "scripts\kill-node-on-port.ps1"

function Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $log -Value $line
  Write-Host $line
}

function Test-DashboardPing {
  param([int]$P)
  $url = "http://127.0.0.1:$P/api/ping"
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
    return ($r.StatusCode -eq 200 -and $r.Content -match '"ok"\s*:\s*true' -and $r.Content -match "aar-dashboard")
  } catch {
    return $false
  }
}

function Stop-DashboardNode {
  param([int]$P)
  if (Test-Path $killPort) {
    & $killPort -Port $P
  } else {
    Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object {
        $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -match "node") {
          Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
      }
  }
}

Log "=== dashboard-watchdog (24/7 stable) ==="
Log "Root: $Root  Port: $Port  Health every ${HealthSec}s  Node heap cap: ${MaxHeapMb}MB"
Log "Do NOT close this window. Chrome is separate - use OPEN-LAB-BROWSER.bat"

$preflight = Join-Path $Root "scripts\preflight-repo.ps1"
if (Test-Path $preflight) {
  & $preflight -Root $Root
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

& (Join-Path $Root "scripts\ensure-node.ps1")
if ($LASTEXITCODE -ne 0) { exit 1 }

$envFile = Join-Path $dash ".env.local"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines(
  $envFile,
  @(
    "AAR_REPO_ROOT=$Root",
    "AAR_PYTHON=py",
    "AAR_NO_REST=1",
    "NODE_OPTIONS=--max-old-space-size=$MaxHeapMb"
  ),
  $utf8NoBom
)
$env:AAR_REPO_ROOT = $Root
$env:AAR_PYTHON = "py"
$env:AAR_NO_REST = "1"
$env:NODE_OPTIONS = "--max-old-space-size=$MaxHeapMb"
Remove-Item Env:AAR_DISABLE_EXEC -ErrorAction SilentlyContinue
$env:NEXT_DISABLE_TURBOPACK = "1"

Set-Location $dash
if (-not (Test-Path "node_modules")) {
  Log "npm install (first time)..."
  npm install 2>&1 | Tee-Object -FilePath $log -Append
}

$buildId = Join-Path $dash ".next\BUILD_ID"
if (-not (Test-Path $buildId)) {
  Log "First build (10-25 min on slow PC)..."
  npm run build 2>&1 | Tee-Object -FilePath $log -Append
}

$npmCmd = if ($Port -eq 43123) { "npm run start:alt" } else { "npm run start" }
Log "Watchdog loop: $npmCmd (Ctrl+C to stop watchdog only)"

while ($true) {
  Stop-DashboardNode -P $Port
  Start-Sleep -Seconds 2

  Log "Starting dashboard (log: node-server.log)..."
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $serverLog -Value "`n=== START $stamp ==="

  $proc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c $npmCmd >> `"$serverLog`" 2>&1" `
    -WorkingDirectory $dash `
    -PassThru `
    -WindowStyle Minimized

  try {
    $proc.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal
  } catch {
    Log "Note: could not set BelowNormal priority (non-fatal)"
  }

  $failStreak = 0
  $started = Get-Date

  while (-not $proc.HasExited) {
    Start-Sleep -Seconds $HealthSec
    if ($proc.HasExited) { break }

    if (Test-DashboardPing -P $Port) {
      $failStreak = 0
      continue
    }

    $failStreak++
    $upMin = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
    Log "Health FAIL $failStreak/3 (uptime ${upMin} min) - /api/ping not OK"

    if ($failStreak -ge 3) {
      Log "Server hung or dead - stopping Node PID $($proc.Id)"
      Stop-DashboardNode -P $Port
      try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
      break
    }
  }

  if (-not $proc.HasExited) {
    Wait-Process -Id $proc.Id -ErrorAction SilentlyContinue
  }
  $code = $proc.ExitCode
  Log "Dashboard exited (code $code). Restarting in 20 seconds..."
  Log "If Chrome also closed, RAM was likely exhausted - close tabs or use one browser window."
  Start-Sleep -Seconds 20
}
