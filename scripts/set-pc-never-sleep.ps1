# Prevent sleep while plugged in (24/7 old PC). Run as Administrator once.
$ErrorActionPreference = "Stop"

powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 30

Write-Host "AC power: sleep and hibernate disabled (monitor off after 30 min is OK)." -ForegroundColor Green
Write-Host "Also set: Settings -> System -> Power -> Sleep -> Never (when plugged in)."
