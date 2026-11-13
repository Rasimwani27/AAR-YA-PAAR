#!/usr/bin/env python3
"""Small update zip — overlay on an existing AAR extract (manual trade + build bump)."""

from __future__ import annotations

import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Paths relative to repo root; keep minimal for a small download.
PATCH_PATHS = [
    "dashboard/lib/lab-version.ts",
    "dashboard/lib/forward-ledger.ts",
    "dashboard/lib/forward-state.ts",
    "dashboard/app/api/manual-trade/route.ts",
    "dashboard/app/components/manual-trade-panel.tsx",
    "dashboard/app/components/trading-desk.tsx",
    "dashboard/app/components/live-positions-panel.tsx",
    "dashboard/app/components/forward-test-panel.tsx",
    "dashboard/app/components/strategy-badge.tsx",
    "aar/live/forward_tracker.py",
    "FIX-DOWNLOAD-AAR.txt",
    "scripts/APPLY-UPDATE-ZIP.ps1",
    "scripts/GET-LATEST-AAR.ps1",
    "UPDATE-FROM-PATCH.bat",
    "CLICK-ME-GET-UPDATES.bat",
    "DOWNLOAD-NEW-FOLDER.bat",
    "CLICK-ME.txt",
    "scripts/download-to-new-folder.ps1",
    "scripts/click-open-download.ps1",
    "scripts/open-lab-browser.ps1",
    "scripts/start-dashboard.ps1",
]

README = """AAR patch overlay
==================
1. You already have an older AAR folder with START-HERE-43123.bat.
2. Extract THIS zip INTO that same folder (merge/replace files).
3. Run scripts\\APPLY-UPDATE-ZIP.ps1 or double-click UPDATE-FROM-PATCH.bat (if present).
4. Restart START-HERE-43123.bat.
5. Check Trading desk shows Build 2026.11.11-manual-trade and tab "Manual trade".
"""


def main() -> int:
    dest = ROOT / "dashboard" / "public" / "AAR-UPDATE-MANUAL-TRADE.zip"
    dest.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        zf.writestr("PATCH-README.txt", README)
        for rel in PATCH_PATHS:
            path = ROOT / rel
            if not path.is_file():
                print("skip missing", rel)
                continue
            zf.write(path, rel.replace("\\", "/"))
    size = dest.stat().st_size
    for alias in (
        ROOT / "AAR-UPDATE-MANUAL-TRADE.zip",
        ROOT / "public" / "AAR-UPDATE-MANUAL-TRADE.zip",
    ):
        alias.write_bytes(dest.read_bytes())
    print(f"Wrote {dest} ({size} bytes, {len(PATCH_PATHS)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
