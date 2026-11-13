#!/usr/bin/env python3
"""Upload AAR-YA-PAAR.zip to tmpfiles and write direct download URL (not the HTML page)."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _zip_content_type(url: str) -> str | None:
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    except Exception:
        return None


def _resolve_direct_zip(page_url: str, page_html: str) -> str:
    m = re.search(r'href="(https://tmpfiles\.org/dl/[^"]+aar-ya-paar\.zip)"', page_html, re.I)
    if not m:
        raise SystemExit(f"Could not find direct dl link on {page_url}")
    direct = m.group(1)
    ctype = _zip_content_type(direct)
    if ctype == "application/zip":
        return direct
    import urllib.request

    page_req = urllib.request.Request(page_url, headers={"User-Agent": "Mozilla/5.0"})
    fresh = urllib.request.urlopen(page_req, timeout=60).read().decode("utf-8", errors="replace")
    m2 = re.search(r'href="(https://tmpfiles\.org/dl/[^"]+aar-ya-paar\.zip)"', fresh, re.I)
    if not m2:
        raise SystemExit(f"Tmpfiles page has no zip link: {page_url}")
    direct2 = m2.group(1)
    if _zip_content_type(direct2) != "application/zip":
        raise SystemExit(f"Tmpfiles did not return application/zip for {direct2}")
    return direct2


def main() -> int:
    subprocess.run([sys.executable, str(ROOT / "tools" / "pack_download_zip.py")], check=True, cwd=ROOT)
    zip_path = ROOT / "dashboard" / "public" / "AAR-YA-PAAR.zip"
    import urllib.request

    boundary = "----AARBoundary"
    data = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="AAR-YA-PAAR.zip"\r\n'
        f"Content-Type: application/zip\r\n\r\n"
    ).encode()
    data += zip_path.read_bytes()
    data += f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        "https://tmpfiles.org/api/v1/upload",
        data=data,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        meta = json.loads(resp.read().decode())
    page_url = meta["data"]["url"]
    page_req = urllib.request.Request(page_url, headers={"User-Agent": "Mozilla/5.0"})
    page = urllib.request.urlopen(page_req, timeout=60).read().decode("utf-8", errors="replace")
    direct = _resolve_direct_zip(page_url, page)
    size = zip_path.stat().st_size
    lab_build = "unknown"
    lab_path = ROOT / "dashboard" / "lib" / "lab-version.ts"
    if lab_path.is_file():
        m_build = re.search(r'LAB_BUILD\s*=\s*"([^"]+)"', lab_path.read_text(encoding="utf-8"))
        if m_build:
            lab_build = m_build.group(1)
    payload = {
        "zipName": "AAR-YA-PAAR.zip",
        "bytes": size,
        "mirrorPageUrl": page_url,
        "directDownloadUrl": direct,
        "note": "Use directDownloadUrl — saves the real zip (~498 KB). After save, unzip and run START-HERE-43123.bat",
        "labBuild": lab_build,
    }
    out = ROOT / "dashboard" / "public" / "download-link.json"
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    (ROOT / "PUBLIC-DOWNLOAD-LINK.txt").write_text(
        f"Direct zip (click or right-click Save link as):\n\n{direct}\n\n"
        f"Size: {size} bytes. Must contain START-HERE-43123.bat after extract.\n",
        encoding="utf-8",
    )
    print(direct)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
