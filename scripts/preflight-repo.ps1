param([string]$Root = "")

if (-not $Root) { $Root = Split-Path $PSScriptRoot -Parent }

$errors = @()

if (-not (Test-Path (Join-Path $Root "dashboard\app\page.tsx"))) {
  $errors += "Missing dashboard\app\page.tsx - extract the full AAR-YA-PAAR.zip (not dashboard alone)."
}
if (-not (Test-Path (Join-Path $Root "aar\__main__.py"))) {
  $errors += "Missing aar\ Python package - extract the full zip to e.g. C:\AAR-YA-PAAR"
}
if (-not (Test-Path (Join-Path $Root "START-HERE-43123.bat"))) {
  $errors += "Missing START-HERE-43123.bat - you are not in the project root folder."
}

if ($errors.Count -gt 0) {
  Write-Host "PREFLIGHT FAILED:" -ForegroundColor Red
  $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
  exit 1
}

exit 0
