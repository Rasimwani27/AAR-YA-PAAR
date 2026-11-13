# Auto-start dashboard watchdog when you log in to Windows (restarts if npm crashes).
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-dashboard-24-7-task.ps1 -RepoRoot "C:\path\AAR-YA-PAAR"
param(
  [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = "Stop"
$taskName = "AAR-Dashboard-24-7-Watchdog"
$ps1 = Join-Path $RepoRoot "scripts\dashboard-watchdog.ps1"

if (-not (Test-Path $ps1)) {
  Write-Error "Missing $ps1"
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`" -Root `"$RepoRoot`" -Port 43123" `
  -WorkingDirectory $RepoRoot

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Force | Out-Null

Write-Host "Created scheduled task: $taskName" -ForegroundColor Green
Write-Host "It runs at Windows logon and restarts the watchdog if it stops."
Write-Host "Log: $RepoRoot\dashboard\watchdog.log"
Write-Host ""
Write-Host "Also run (Admin): scripts\set-pc-never-sleep.ps1"
Write-Host "Forward test: after reboot click Start once in dashboard, OR use install-home-pc-task.ps1 for Python-only 24/7 engine."
