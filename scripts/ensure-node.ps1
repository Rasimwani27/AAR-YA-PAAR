# Require Node 20+ (Next.js 16). Older Node shows: SyntaxError: Unexpected token
param()

function Get-NodeMajor {
  try {
    $v = (node -v).TrimStart("v")
    return [int]($v.Split(".")[0])
  } catch {
    return 0
  }
}

$ver = (node -v 2>$null)
$major = Get-NodeMajor
if ($major -lt 20) {
  Write-Host ""
  Write-Host "ERROR: Node.js 20+ is required (you have: $ver)." -ForegroundColor Red
  Write-Host "Old Node shows: SyntaxError: Unexpected token" -ForegroundColor Yellow
  Write-Host "Install Node 20 LTS from https://nodejs.org/ then retry." -ForegroundColor Cyan
  Write-Host ""
  exit 1
}

Write-Host "Node OK: $ver" -ForegroundColor DarkGreen
if ($major -ge 24) {
  Write-Host "Note: Node 24 is very new. If build fails, install Node 22 LTS alongside and retry." -ForegroundColor DarkYellow
}
exit 0
