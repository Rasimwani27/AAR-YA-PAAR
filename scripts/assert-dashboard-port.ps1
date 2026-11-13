# Ensures a dashboard port is free for node.exe (not Cursor/IDE holding 43123).
param(
  [int]$Port = 43123,
  [switch]$KillNodeFirst
)

function Get-PortBlockers([int]$p, [bool]$killNode) {
  $blockers = [System.Collections.ArrayList]@()
  $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) { return @() }

  foreach ($conn in $conns) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    if ($proc.ProcessName -match "^(node|Node)$") {
      if ($killNode) {
        Write-Host "Stopping node PID $($proc.Id) on port $p" -ForegroundColor Yellow
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      }
      continue
    }
    [void]$blockers.Add($proc)
  }
  return @($blockers)
}

if ($KillNodeFirst) {
  $null = Get-PortBlockers -p $Port -killNode $true
  Start-Sleep -Seconds 2
}

$blockers = @(Get-PortBlockers -p $Port -killNode $false)

if ($blockers.Count -eq 0) {
  exit 0
}

Write-Host ""
Write-Host "PORT $Port BLOCKED - AAR dashboard cannot start (needs node.exe)." -ForegroundColor Red
foreach ($b in $blockers) {
  Write-Host "  Listener: $($b.ProcessName) PID $($b.Id)" -ForegroundColor Red
  if ($b.Path) { Write-Host "    $($b.Path)" -ForegroundColor DarkGray }
}

$cursorLike = $blockers | Where-Object { $_.ProcessName -match "^(Cursor|Code|devenv)$" }
if ($cursorLike) {
  Write-Host ""
  Write-Host "Cursor/VS Code often grabs this port when you forward a Cloud Agent to $Port." -ForegroundColor Yellow
  Write-Host "Fix:" -ForegroundColor Yellow
  Write-Host "  1. Cursor -> Ports -> stop forwarding port $Port"
  Write-Host "  2. Close Simple Browser on http://127.0.0.1:$Port"
  Write-Host "  3. netstat -ano | findstr :$Port  (should be empty)"
  Write-Host "  4. START-HERE-43123.bat"
  Write-Host ""
  Write-Host "Do not taskkill Cursor.exe - release the port in Ports instead."
}

Write-Host ""
$doctorScript = Join-Path $PSScriptRoot "doctor-dashboard.ps1"
Write-Host "Diagnose: powershell -ExecutionPolicy Bypass -File $doctorScript" -ForegroundColor Cyan
exit 1
