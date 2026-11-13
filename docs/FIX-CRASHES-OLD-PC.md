# Fix: app crashes and Chrome closes (4 GB old PC)

Windows stays on, but the **lab stops** and **Chrome closes** (sometimes after a freeze or force restart). That pattern is almost always **low RAM** or **Node crashing**, not Windows shutting down.

## Do this setup (once)

### 1. Run the **watchdog**, not START-HERE, for 24/7

| Use | Avoid for 24/7 |
|-----|----------------|
| **`START-24-7-WATCHDOG.bat`** (minimize, never close) | **`START-HERE-43123.bat`** (single window — if it dies, nothing restarts) |

Watchdog:

- Restarts Node if it **crashes** or **hangs** (checks `/api/ping` every 45s)
- Caps Node memory (`768 MB`) so Chrome + Python keep more RAM
- Logs to `dashboard\watchdog.log` and `dashboard\node-server.log`

### 2. Open Chrome **separately**

Double-click **`OPEN-LAB-BROWSER.bat`** (or bookmark `http://127.0.0.1:43123/`).

Do **not** depend on the server to “open” the browser — that ties your workflow to one startup script. A detached browser keeps running when Node restarts (unless RAM runs out).

### 3. After a watchdog restart

Forward test runs **inside** Node. When Node restarts, click **Start forward test** once in the dashboard (keys are not stored on disk).

For engine-only 24/7 without the dashboard UI, see `scripts/install-home-pc-task.ps1` (Python loop; keys in Task Scheduler).

### 4. Free RAM on a 4 GB machine

- One Chrome window, few tabs (close YouTube, extra dashboards)
- Optional: use **Edge** with a single tab for the lab
- Disable Chrome “Continue running background apps” if you want less memory when you close the window
- Settings → System → About → **Advanced system settings** → Performance → ensure **virtual memory (page file)** is **System managed** (helps avoid hard freezes)

### 5. Boot recovery (optional, Admin)

```powershell
cd "C:\path\AAR-YA-PAAR"
powershell -ExecutionPolicy Bypass -File .\scripts\install-dashboard-24-7-task.ps1 -RepoRoot "C:\path\AAR-YA-PAAR"
powershell -ExecutionPolicy Bypass -File .\scripts\set-pc-never-sleep.ps1
```

### 6. When it happens again

Double-click **`CHECK-CRASH-LOGS.bat`** and read the last lines of `watchdog.log` / `node-server.log`.

Common log patterns:

| Log / symptom | Likely cause | Fix |
|---------------|--------------|-----|
| `JavaScript heap out of memory` | Node used too much RAM | Watchdog already caps heap; close Chrome tabs |
| Chrome + everything frozen | RAM + page file exhausted | Fewer tabs; reboot; use watchdog |
| `Health FAIL` then restart | Server hung | Watchdog auto-restart; check `node-server.log` |
| You ran **START-HERE** while watchdog ran | Two starters fighting | Only watchdog for 24/7 |
| Forward test stopped, site works | Node restarted | Click **Start forward test** again |

## Tailscale

Server can be up while Chrome died on the **PC monitor**. From phone/laptop try `http://100.x.x.x:43123/api/ping` — if JSON `ok:true`, only the browser on the PC needs reopening (`OPEN-LAB-BROWSER.bat`).

## Not a Windows shutdown?

If the PC truly reboots, check **Windows Update** active hours and **Event Viewer** → Windows Logs → System (Kernel-Power). Sleep is covered by `set-pc-never-sleep.ps1`.
