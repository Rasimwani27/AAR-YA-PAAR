# Expose local dashboard (127.0.0.1:43123) on your Tailscale network without binding 100.x.
# Run on the OLD PC after START-HERE-43123.bat shows Ready.
# Requires: tailscale CLI in PATH, Tailscale logged in.

$ErrorActionPreference = "Stop"
$local = "http://127.0.0.1:43123"

if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
  Write-Host "tailscale not in PATH. Install Tailscale for Windows and reboot, or use tray icon." -ForegroundColor Red
  exit 1
}

try {
  $null = Invoke-WebRequest -Uri "$local/api/ping" -UseBasicParsing -TimeoutSec 3
} catch {
  Write-Host "Dashboard not running at $local - start START-HERE-43123.bat first." -ForegroundColor Red
  exit 1
}

Write-Host "Enabling Tailscale Serve -> $local" -ForegroundColor Cyan
Write-Host "(Resets any previous tailscale serve on this machine.)" -ForegroundColor DarkGray
tailscale serve reset 2>$null
tailscale serve --bg --http=80 $local

Write-Host ""
Write-Host "Done. On your PHONE (Tailscale on), open the HTTPS URL shown above, e.g.:" -ForegroundColor Green
Write-Host "  https://YOUR-PC-NAME.tailXXXX.ts.net/" -ForegroundColor Green
Write-Host "Or run: tailscale serve status" -ForegroundColor DarkGray
Write-Host "Local PC browser: keep using http://127.0.0.1:43123/" -ForegroundColor DarkGray
