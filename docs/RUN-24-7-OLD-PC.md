# Old PC shuts down the app after a few hours

## Why it stops

| Cause | Fix |
|-------|-----|
| **Sleep / hibernate** | Never sleep when plugged in |
| **npm / Node crash** | Use **watchdog** (auto-restart + health ping) |
| **Chrome closes too** | Usually **4 GB RAM** — see **`docs/FIX-CRASHES-OLD-PC.md`**, use **OPEN-LAB-BROWSER.bat**, fewer tabs |
| **Closed cmd window** | Use watchdog + Task Scheduler |
| **Windows Update reboot** | Schedule updates; PC may still reboot |
| **Power cut** | UPS optional; task restarts at logon |

Forward test (Python) stops when the dashboard restarts — click **Start forward test** again, or use `install-home-pc-task.ps1` for engine-only 24/7.

## Setup once (Jarvis 24/7 mode)

### 1. Never sleep (Admin PowerShell)

```powershell
cd "C:\path\AAR-YA-PAAR"
powershell -ExecutionPolicy Bypass -File .\scripts\set-pc-never-sleep.ps1
```

Settings → Power → **Sleep: Never** (plugged in).

### 2. Watchdog instead of START-HERE

Double-click **`START-24-7-WATCHDOG.bat`**  
Leave it **minimized** (do not close).  
Open the site with **`OPEN-LAB-BROWSER.bat`** (Chrome is not tied to the server).  
Logs: `dashboard\watchdog.log`, `dashboard\node-server.log` — or run **`CHECK-CRASH-LOGS.bat`**

### 3. Start when Windows boots (Admin)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-dashboard-24-7-task.ps1 -RepoRoot "C:\path\AAR-YA-PAAR"
```

Log in to Windows once after power loss (or enable auto-logon at home only).

### 4. Tailscale

Start Tailscale with Windows (tray → Preferences → **Run at startup**).

Remote URL: **http://100.x.x.x:43123/** (always include **:43123**).
