# Stop only Node.js listening on a port (never Chrome / other apps).
param([int]$Port = 43123)

Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -match "^(node|Node)$") {
      Write-Host "Stopping node PID $($p.Id) on port $Port"
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
  }
