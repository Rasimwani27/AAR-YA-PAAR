$ErrorActionPreference = "Stop"
$downloads = Join-Path $env:USERPROFILE "Downloads"
if (-not (Test-Path $downloads)) {
  Write-Host "Downloads folder not found: $downloads" -ForegroundColor Red
  exit 1
}

$matches = Get-ChildItem -Path $downloads -File | Where-Object {
  (
    $_.Name -match "^AAR-YA-PAAR" -or $_.Name -eq "file" -or $_.Name -match "^file \("
  ) -and (
    $_.Extension -eq "" -or $_.Extension -eq ".download" -or $_.Extension -eq ".file"
  )
}

if (-not $matches) {
  Write-Host "No misnamed AAR-YA-PAAR-download* file in Downloads." -ForegroundColor Yellow
  Write-Host "If you already have AAR-YA-PAAR.zip, right-click -> Extract All."
  exit 0
}

foreach ($f in $matches) {
  $zipPath = Join-Path $downloads "AAR-YA-PAAR.zip"
  if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
  Rename-Item -LiteralPath $f.FullName -NewName "AAR-YA-PAAR.zip"
  Write-Host "Renamed to: $zipPath" -ForegroundColor Green
  $dest = Join-Path $downloads "AAR-YA-PAAR"
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Expand-Archive -Path $zipPath -DestinationPath $dest -Force
  Write-Host "Extracted folder: $dest" -ForegroundColor Green
  Write-Host "Next: open that folder and double-click START-HERE-43123.bat"
}

exit 0
