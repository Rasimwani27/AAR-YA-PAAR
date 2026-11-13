"""UTF-8 BOM + ASCII punctuation for Windows PowerShell 5.1 (avoids ParserError on em-dash)."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOM = b"\xef\xbb\xbf"
REPLACEMENTS = {
    "\u2014": "-",  # em dash
    "\u2013": "-",  # en dash
    "\u201c": '"',
    "\u201d": '"',
    "\u2018": "'",
    "\u2019": "'",
}


def normalize_file(path: Path) -> bool:
    raw = path.read_bytes()
    if raw.startswith(BOM):
        text = raw[len(BOM) :].decode("utf-8")
    else:
        text = raw.decode("utf-8")
    for old, new in REPLACEMENTS.items():
        text = text.replace(old, new)
    out = BOM + text.encode("utf-8")
    if out == raw:
        return False
    path.write_bytes(out)
    return True


def ensure_bom(path: Path) -> None:
    raw = path.read_bytes()
    if raw.startswith(BOM):
        return
    text = raw.decode("utf-8")
    path.write_bytes(BOM + text.encode("utf-8"))


def main() -> int:
    changed = 0
    for path in sorted((ROOT / "scripts").glob("*.ps1")):
        if normalize_file(path):
            changed += 1
        else:
            ensure_bom(path)
    print(f"Normalized {changed} script(s) under scripts/ (UTF-8 BOM on all)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
