# Fail fast if GitHub would deploy a broken Vercel site (404 / NOT_FOUND).
param(
  [string]$Root = "."
)

$ErrorActionPreference = "Stop"
$dash = Join-Path $Root "dashboard"

$required = @(
  "dashboard\package.json",
  "dashboard\app\page.tsx",
  "dashboard\app\layout.tsx",
  "dashboard\vercel.json",
  "dashboard\next.config.ts"
)

Write-Host "Checking deploy files under: $(Resolve-Path $Root)"
$missing = @()
foreach ($rel in $required) {
  $p = Join-Path $Root ($rel -replace '\\', [IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path $p)) {
    $missing += $rel
    Write-Host "  MISSING $rel" -ForegroundColor Red
  } else {
    Write-Host "  OK     $rel" -ForegroundColor Green
  }
}

if ($missing.Count -gt 0) {
  Write-Host ""
  Write-Host "Fix: copy the full dashboard folder from the agent repo, then commit and push." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "Ready to push. After push, Vercel -> Root Directory = dashboard -> Redeploy."
