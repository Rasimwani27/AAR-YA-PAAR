#!/usr/bin/env python3
"""Patch the original styled Rassim portfolio PDF (layout + content edits)."""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
SRC_CANDIDATES = [
    ROOT / "portfolio/Rassim_Muzaffar_Trading_Portfolio_ORIGINAL.pdf",
    Path("/home/ubuntu/.cursor/projects/workspace/uploads/Rassim_Muzaffar_Trading_Portfolio_6c12.pdf"),
]
OUT = ROOT / "portfolio/Rassim_Muzaffar_Trading_Portfolio.pdf"
PUBLIC = ROOT / "dashboard/public/Rassim_Muzaffar_Trading_Portfolio.pdf"
YOY_JSON = ROOT / "out/reports/AFNY-year-by-year-chained.json"

HEADER_BG = (0.078431, 0.149020, 0.239216)
ROW_A = (0.956863, 0.968627, 0.984314)
ROW_B = (1.0, 1.0, 1.0)
TOTAL_BG = (0.917647, 0.945098, 1.0)
BORDER = (0.847059, 0.878431, 0.917647)


def _src() -> Path:
    for p in SRC_CANDIDATES:
        if p.is_file():
            return p
    raise FileNotFoundError("Original portfolio PDF not found")


def white_out(page: pymupdf.Page, rect: pymupdf.Rect) -> None:
    page.add_redact_annot(rect, fill=(1, 1, 1))
    page.apply_redactions()


def _period_label(year: int) -> str:
    if year == 2021:
        return "2021 (Aug-Dec only)"
    if year == 2026:
        return "2026 (Jan-Jul only)"
    return str(year)


def _load_yoy_rows() -> list[dict]:
    data = json.loads(YOY_JSON.read_text())
    return data["by_year_chained"]


def draw_annual_table(page: pymupdf.Page, rows: list[dict]) -> None:
    """Styled multi-column table matching the original portfolio design."""
    left, right = 59.53, 535.75
    col_x = [left, 198, 252, 318, 402, 478, right]
    headers = ["Period", "Trades", "Win rate", "Return", "Start equity", "End equity"]
    row_h = 20.0
    top = 128.0

    body: list[list[str]] = [headers]
    for r in rows:
        body.append(
            [
                _period_label(int(r["year"])),
                str(r["trades"]),
                f"{r['win_rate_pct']:.1f}%",
                f"{r['return_pct']:+.1f}%",
                f"${r['start_equity']:,.2f}",
                f"${r['end_equity']:,.2f}",
            ]
        )
    body.append(["Overall total", "118", "39.83%", "+355.2%", "$1,000.00", "$4,551.77"])

    n = len(body)
    bottom = top + n * row_h

    for i in range(n):
        y0 = top + i * row_h
        y1 = y0 + row_h
        if i == 0:
            fill = HEADER_BG
        elif i == n - 1:
            fill = TOTAL_BG
        else:
            fill = ROW_A if i % 2 == 1 else ROW_B
        page.draw_rect(pymupdf.Rect(left, y0, right, y1), color=BORDER, fill=fill, width=0.4)

    for x in col_x:
        page.draw_line(pymupdf.Point(x, top), pymupdf.Point(x, bottom), color=BORDER, width=0.4)
    page.draw_line(pymupdf.Point(left, top), pymupdf.Point(right, top), color=BORDER, width=0.4)
    page.draw_line(pymupdf.Point(left, bottom), pymupdf.Point(right, bottom), color=BORDER, width=0.4)

    for i, row in enumerate(body):
        y_text = top + i * row_h + 14
        for j, cell in enumerate(row):
            x_text = col_x[j] + 6
            if j >= 1:
                x_text = col_x[j] + (col_x[j + 1] - col_x[j]) / 2 - 2
            font = "hebo" if i == 0 or i == n - 1 else "helv"
            color = (1, 1, 1) if i == 0 else (0, 0, 0)
            fs = 7.8
            if j == 0:
                page.insert_text((col_x[0] + 6, y_text), cell, fontsize=fs, fontname=font, color=color)
            else:
                # right-align numeric columns
                tw = pymupdf.get_text_length(cell, fontname=font, fontsize=fs)
                cx = col_x[j + 1] - 6 - tw
                page.insert_text((cx, y_text), cell, fontsize=fs, fontname=font, color=color)


def patch() -> None:
    src = _src()
    doc = pymupdf.open(src)

    # Page 1 — stack name above Target roles (9pt, same as original contact block)
    p = doc[0]
    white_out(p, pymupdf.Rect(60, 216, 510, 250))
    fs = 9
    x = 64.19
    p.insert_text((x, 228), "Rassim Muzaffar", fontsize=fs, fontname="hebo", color=(0, 0, 0))
    p.insert_text((x, 241), "Target roles", fontsize=fs, fontname="hebo", color=(0, 0, 0))
    p.insert_text(
        (x, 254),
        "Trading Analyst · Trader · Systematic Trading Analyst",
        fontsize=fs,
        fontname="helv",
        color=(0, 0, 0),
    )

    # Page 2 — remove risk parameter clarification
    white_out(doc[1], pymupdf.Rect(50, 465, 550, 550))

    # Page 3 — remove primary summary selected
    white_out(doc[2], pymupdf.Rect(50, 512, 550, 600))

    # Page 4 — annual results table (correct trade counts + equity; fees included)
    p = doc[3]
    white_out(p, pymupdf.Rect(50, 58, 550, 520))
    p.insert_text((54, 72), "03 | Annual Results", fontsize=18, fontname="hebo", color=(0, 0, 0))
    p.insert_text(
        (54, 96),
        "Calendar-year results with chained equity (after fees). Trade counts by exit year.",
        fontsize=9,
        fontname="helv",
        color=(0.2, 0.2, 0.2),
    )
    draw_annual_table(p, _load_yoy_rows())

    # Page 5 — remove important limitations
    white_out(doc[4], pymupdf.Rect(50, 338, 550, 470))

    # Page 6 — remove disclosure block
    white_out(doc[5], pymupdf.Rect(50, 518, 550, 572))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT, garbage=4, deflate=True)
    doc.save(PUBLIC, garbage=4, deflate=True)
    print(f"Patched {src.name} -> {OUT}")


if __name__ == "__main__":
    patch()
