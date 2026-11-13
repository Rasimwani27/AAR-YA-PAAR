# Allow dashboard port 43123 (localhost + LAN + Tailscale 100.x.x.x)
# Run once on the old PC as Administrator.

$ErrorActionPreference = "Stop"
$name = "AAR-YA-PAAR Dashboard TCP 43123"

$existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
if ($existing) {
  Remove-NetFirewallRule -DisplayName $name
}

New-NetFirewallRule `
  -DisplayName $name `
  -Direction Inbound `
  -LocalPort 43123 `
  -Protocol TCP `
  -Action Allow `
  -Profile Any `
  -Enabled True | Out-Null

Write-Host "Firewall OK: inbound TCP 43123 allowed (all profiles)." -ForegroundColor Green
Write-Host "On this PC test: http://127.0.0.1:43123/api/ping"
Write-Host "Then from phone (Tailscale on): http://YOUR-100.x-IP:43123/api/ping"
