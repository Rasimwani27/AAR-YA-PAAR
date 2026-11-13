# Register a Windows Task Scheduler job to run forward test on boot (engine only).
# Run as Administrator from repo root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-home-pc-task.ps1 -RepoRoot "C:\AAR-YA-PAAR"
param(
  [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = "Stop"
$taskName = "AAR-ForwardTest-Engine"
$python = "python"
if (Get-Command py -ErrorAction SilentlyContinue) { $python = "py -3" }

$configs = "fade-reversal:config.btc.fade-reversal-ny-trend.toml,london-mid-engulf:config.btc.london-mid-engulf-winner.toml"
$script = Join-Path $RepoRoot "tools\forward_test_run.py"
if (-not (Test-Path $script)) {
  Write-Error "Missing $script - set -RepoRoot to your AAR-YA-PAAR folder."
}

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c cd /d `"$RepoRoot`" && set AAR_REPO_ROOT=$RepoRoot && set BINANCE_API_KEY=PASTE_KEY_HERE && set BINANCE_API_SECRET=PASTE_SECRET_HERE && $python `"$script`" --configs `"$configs`" --poll-seconds 90" -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null

Write-Host "Created task: $taskName"
Write-Host "IMPORTANT: Open Task Scheduler -> edit the task -> replace PASTE_KEY_HERE / PASTE_SECRET_HERE in the action."
Write-Host "Or store keys in System Environment Variables and edit the task command to use %BINANCE_API_KEY%."
