# Upload this project to GitHub (run on your PC after installing GitHub CLI).
# Usage:
#   gh auth login
#   powershell -ExecutionPolicy Bypass -File .\scripts\push-to-github.ps1 -Owner YOUR_GITHUB_USER -Repo AAR-YA-PAAR

param(
  [Parameter(Mandatory = $true)]
  [string]$Owner,
  [string]$Repo = "AAR-YA-PAAR",
  [ValidateSet("public", "private")]
  [string]$Visibility = "private"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Error "Install GitHub CLI: https://cli.github.com/ then run: gh auth login"
}

gh auth status | Out-Null

$full = "$Owner/$Repo"
$exists = gh repo view $full 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creating $full ($Visibility)..."
  gh repo create $full --$Visibility --source=. --remote=github --push
} else {
  if (-not (git remote get-url github 2>$null)) {
    git remote add github "https://github.com/$full.git"
  }
  git push -u github main
}

Write-Host "Done: https://github.com/$full"
