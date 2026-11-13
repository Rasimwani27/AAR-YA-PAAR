# Open the lab in the default browser - separate from npm/Node (survives server restarts).
param(
  [int]$Port = 43123,
  [string]$HostName = "127.0.0.1",
  [string]$Path = "/"
)

$pathNorm = if ($Path.StartsWith("/")) { $Path } else { "/$Path" }
$url = "http://${HostName}:$Port$pathNorm"
# "start" detaches from this PowerShell window (unlike binding browser to a cmd session).
Start-Process "cmd.exe" -ArgumentList "/c", "start", "", $url -WindowStyle Hidden
