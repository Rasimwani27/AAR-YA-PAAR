#!/usr/bin/env python3
"""Build AAR-YA-PAAR-download.zip for browser download (Windows-friendly paths)."""

from __future__ import annotations

import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIR_NAMES = {
    ".git",
    "node_modules",
    ".next",
    "__pycache__",
    "out",
    ".cursor",
    "releases",
    "portfolio",
    "brochure",
    "tmp-scaffold",
}
SKIP_FILE_SUFFIX = {".zip", ".pyc"}


def should_skip(path: Path) -> bool:
    if path.suffix.lower() in SKIP_FILE_SUFFIX:
        return True
    for part in path.parts:
        if part in SKIP_DIR_NAMES:
            return True
    return False


def write_zip(dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file() or should_skip(path):
                continue
            arc = path.relative_to(ROOT).as_posix()
            zf.write(path, arc)
            count += 1
    return count


def main() -> int:
    norm = ROOT / "tools" / "normalize_windows_ps1.py"
    if norm.is_file():
        subprocess.run([sys.executable, str(norm)], check=False, cwd=ROOT)
    primary = ROOT / "dashboard" / "public" / "AAR-YA-PAAR.zip"
    n = write_zip(primary)
    size = primary.stat().st_size
    aliases = [
        ROOT / "dashboard" / "public" / "AAR-YA-PAAR-download.zip",
        ROOT / "public" / "AAR-YA-PAAR.zip",
        ROOT / "public" / "AAR-YA-PAAR-download.zip",
        ROOT / "AAR-YA-PAAR.zip",
        ROOT / "AAR-YA-PAAR-download.zip",
    ]
    for t in aliases:
        t.parent.mkdir(parents=True, exist_ok=True)
        t.write_bytes(primary.read_bytes())
    print(f"Packed {n} files -> {primary} ({size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
