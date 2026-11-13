# Download full AAR-YA-PAAR.zip on Windows when the browser button fails.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\GET-LATEST-AAR.ps1
$ErrorActionPreference = "Stop"
$dest = Join-Path $env:USERPROFILE "Downloads\AAR-YA-PAAR.zip"
$urls = @(
    "http://127.0.0.1:43123/api/download-zip?confirm=1",
    "http://127.0.0.1:43123/AAR-YA-PAAR.zip",
    "http://127.0.0.1:43123/AAR-UPDATE-MANUAL-TRADE.zip"
)
foreach ($u in $urls) {
    try {
        Write-Host "Trying $u ..."
        Invoke-WebRequest -Uri $u -OutFile $dest -UseBasicParsing
        if ((Get-Item $dest).Length -gt 100000) {
            Write-Host "Saved: $dest"
            Write-Host "Right-click zip -> Extract All -> run START-HERE-43123.bat"
            exit 0
        }
    } catch {
        Write-Host "Failed: $($_.Exception.Message)"
    }
}
Write-Host ""
Write-Host "Could not download automatically."
Write-Host "1) Start OLD project with START-HERE-43123.bat, then run this script again, OR"
Write-Host "2) Open http://127.0.0.1:43123/download in Edge -> Alternate API download, OR"
Write-Host "3) Git: git pull  (if you cloned the repo), OR"
Write-Host "4) Ask Cursor agent to attach the smaller AAR-UPDATE-MANUAL-TRADE.zip patch."
exit 1
