#!/usr/bin/env python3
"""Build Rassim Muzaffar trading portfolio PDF (updated trade counts, trimmed sections)."""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "portfolio/Rassim_Muzaffar_Trading_Portfolio.pdf"
EQUITY_PDF = ROOT / "portfolio/AFNY-equity-risk-report.pdf"
CHART_PNG = ROOT / "out/reports/portfolio-equity-chart.png"
YOY = ROOT / "out/reports/AFNY-year-by-year-chained.json"


def export_equity_chart() -> Path:
    CHART_PNG.parent.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(EQUITY_PDF)
    pix = doc[0].get_pixmap(matrix=pymupdf.Matrix(2, 2))
    pix.save(str(CHART_PNG))
    return CHART_PNG


def page_decor(canvas, doc):  # noqa: ANN001
    canvas.saveState()
    w, h = letter
    canvas.setFont("Helvetica", 10)
    canvas.setFillColor(colors.black)
    canvas.drawString(0.75 * inch, h - 0.5 * inch, "Rassim Muzaffar  |  Trading Portfolio")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.grey)
    canvas.drawCentredString(
        w / 2,
        0.45 * inch,
        "Historical backtest research only • Not live trading performance",
    )
    canvas.restoreState()


def build() -> None:
    export_equity_chart()
    yoy = json.loads(YOY.read_text()) if YOY.exists() else None

    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "Title",
        parent=styles["Heading1"],
        fontSize=22,
        spaceAfter=12,
        alignment=TA_CENTER,
    )
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=14, spaceBefore=14, spaceAfter=8)
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=14, alignment=TA_LEFT)
    cover_line = ParagraphStyle("CoverLine", parent=body, alignment=TA_CENTER, spaceAfter=4)
    small = ParagraphStyle("Small", parent=body, fontSize=8, textColor=colors.grey)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.65 * inch,
    )
    story: list = []

    # Page 1 — cover
    story.append(Spacer(1, 1.2 * inch))
    story.append(Paragraph("TRADING PORTFOLIO", title))
    story.append(
        Paragraph(
            "Cryptocurrency Trading | Systematic Strategy Research | Market Analysis",
            ParagraphStyle("sub", parent=body, alignment=TA_CENTER, fontSize=11),
        )
    )
    story.append(Spacer(1, 0.4 * inch))
    story.append(Paragraph("Rassim Muzaffar", cover_line))
    story.append(
        Paragraph(
            "Target roles: Trading Analyst · Trader · Systematic Trading Analyst",
            cover_line,
        )
    )
    story.append(Paragraph("Rassimwani27@gmail.com · 6006803879", body))
    story.append(Paragraph("Education: Degree completed in 2026 · Srinagar, India", body))
    story.append(Spacer(1, 0.3 * inch))
    story.append(
        Paragraph(
            "Software Engineering graduate focused on BTC/USDT perpetual futures, rule-based trading, "
            "multi-timeframe technical analysis, and systematic strategy evaluation. I developed a Python-based "
            "backtesting tool with a Streamlit dashboard to test trading rules against historical market data.",
            body,
        )
    )
    story.append(
        Paragraph(
            "I am seeking an opportunity to contribute to a trading or research team through market analysis, "
            "clear trading rules, risk-aware position sizing, and transparent performance evaluation.",
            body,
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("<b>CORE FOCUS</b>", h2))
    for line in (
        "BTC/USDT perpetuals",
        "Rule-based setups",
        "Python backtesting",
        "Risk analysis",
    ):
        story.append(Paragraph(f"• {line}", body))
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        Paragraph(
            "Performance figures are historical backtest results. They are not independently audited and are not live trading results.",
            small,
        )
    )
    story.append(PageBreak())

    # Page 2 — strategy (no risk-parameter clarification block)
    story.append(Paragraph("01 | Strategy Framework", h2))
    story.append(
        Paragraph(
            "My approach prioritizes selectivity and repeatable rules rather than frequent trading or a large number of indicators.",
            body,
        )
    )
    story.append(Paragraph("<b>Session-based analysis</b>", body))
    story.append(
        Paragraph(
            "The London session provides market context and helps assess price behavior around the daily reference level. "
            "Trade execution is considered during the New York session, after the first two 3-minute candles have been skipped.",
            body,
        )
    )
    story.append(Paragraph("<b>Anchor level and timeframe alignment</b>", body))
    align_data = [
        ["Component", "Role in the strategy"],
        ["5:30 AM candle close", "Daily reference/anchor level"],
        ["15-minute chart", "Session behavior and anchor-level context"],
        ["3-minute chart", "Entry conditions and price-action confirmation"],
        ["3-period EMA", "Short-term confirmation on 3-minute timeframe"],
        ["4-hour 50-period EMA", "Directional filter for bullish or bearish setups"],
        ["Candlestick patterns", "Engulfing, hammer, shooting star, doji variants as confirmation"],
    ]
    t = Table(align_data, colWidths=[2.0 * inch, 4.3 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph("<b>Execution workflow</b>", body))
    story.append(
        Paragraph(
            "1. Mark the 5:30 AM reference close. 2. Analyze London session vs anchor. 3. Prepare for New York. "
            "4. Skip first two 3-minute candles. 5. Wait for setup + pattern confirmation. 6. Apply 4h EMA filter. "
            "7. Size by risk and stop distance. 8. Enter only when all conditions align.",
            body,
        )
    )
    story.append(
        Paragraph(
            "Rules: BTC/USDT perpetual futures; max one trade per day; no weekend entries; predefined stop/target; "
            "3% compounded equity risk (fees included in reported results).",
            body,
        )
    )
    story.append(PageBreak())

    # Page 3 — results (no primary-summary block)
    story.append(Paragraph("02 | Backtest Results", h2))
    story.append(
        Paragraph(
            "Equity curve from the AFNY backtest (2021-08-01 → 2026-08-01). Fees modeled at 0.045% per side; "
            "slippage and funding off in this headline run.",
            body,
        )
    )
    story.append(Image(str(CHART_PNG), width=6.5 * inch, height=4.0 * inch))
    metrics = [
        ["118", "39.83%", "+$3,551.77", "+355.2%"],
        ["Total trades", "Win rate (47W / 71L)", "Net P&L", "Return on $1,000 start"],
    ]
    mt = Table(metrics, colWidths=[1.6 * inch] * 4)
    mt.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 14),
                ("FONTSIZE", (0, 1), (-1, 1), 8),
                ("TEXTCOLOR", (0, 1), (-1, 1), colors.grey),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ]
        )
    )
    story.append(mt)
    story.append(Spacer(1, 0.1 * inch))
    story.append(
        Paragraph(
            "Checks: 47 + 71 = 118 trades · 47 ÷ 118 = 39.83% · $1,000 + $3,551.77 = $4,551.77 · "
            "$3,551.77 ÷ 118 ≈ $30.10 expectancy per trade (net, after fees).",
            body,
        )
    )
    story.append(PageBreak())

    # Page 4 — trades by year (corrected counts; no drawdown / reconciliation blocks)
    story.append(Paragraph("03 | Trades by Year", h2))
    trade_rows = [
        ["Year", "Trades"],
        ["2021 (Aug–Dec only)", "13"],
        ["2022", "21"],
        ["2023", "23"],
        ["2024", "32"],
        ["2025", "19"],
        ["2026 (Jan–Jul only)", "10"],
        ["Total", "118"],
    ]
    tt = Table(trade_rows, colWidths=[3.5 * inch, 1.5 * inch])
    tt.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ("ALIGN", (1, 0), (1, -1), "CENTER"),
            ]
        )
    )
    story.append(tt)
    story.append(Spacer(1, 0.25 * inch))
    story.append(Paragraph("<b>Chained annual performance (after fees)</b>", body))
    if yoy:
        perf = [["Year", "Start equity", "End equity", "Return", "Trades"]]
        for row in yoy["by_year_chained"]:
            perf.append(
                [
                    str(row["year"]),
                    f"${row['start_equity']:,.2f}",
                    f"${row['end_equity']:,.2f}",
                    f"{row['return_pct']:+.1f}%",
                    str(row["trades"]),
                ]
            )
        pt = Table(perf, colWidths=[0.9 * inch, 1.2 * inch, 1.2 * inch, 0.9 * inch, 0.7 * inch])
        pt.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ]
            )
        )
        story.append(pt)
    story.append(PageBreak())

    # Page 5 — data setup only (no important limitations)
    story.append(Paragraph("04 | Data & Method", h2))
    data_rows = [
        ["Item", "Details"],
        ["Market", "BTCUSDT perpetual (Binance USD-M futures)"],
        ["Data", "Binance Vision monthly USD-M futures kline ZIPs"],
        ["Test window", "2021-08-01 inclusive → 2026-08-01 exclusive"],
        ["Intervals", "3m execution; 15m anchor/session; 4h trend EMA; daily 30d regime filter"],
        ["Fees", "0.045% per notional side (0.05% taker × 0.9 discount)"],
        ["Slippage / funding", "Not included in headline results ($0 modeled)"],
        ["Fills", "Signal close entry; stop/target at level when touched"],
    ]
    dt = Table(data_rows, colWidths=[1.5 * inch, 4.8 * inch])
    dt.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(dt)
    story.append(PageBreak())

    # Page 6 — project (no disclosure footer block)
    story.append(Paragraph("05 | Technical Project & Career Objective", h2))
    story.append(Paragraph("<b>Python backtester & Streamlit dashboard</b>", body))
    story.append(
        Paragraph(
            "Python tool to evaluate rules-based BTC/USDT perpetual strategy on historical data, with repeatable "
            "tests and performance inspection via Streamlit.",
            body,
        )
    )
    proj = [
        ["Area", "Experience"],
        ["Programming", "Python"],
        ["Interface", "Streamlit dashboard"],
        ["Research", "Backtesting, trade stats, position sizing, performance analysis"],
        ["Markets", "BTC/USDT, candlesticks, session & multi-timeframe analysis"],
    ]
    story.append(Table(proj, colWidths=[1.5 * inch, 4.8 * inch], style=TableStyle([("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey), ("FONTSIZE", (0, 0), (-1, -1), 9)])))
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        Paragraph(
            "<b>Career objective:</b> As a 2026 Software Engineering graduate, I aim to contribute to a trading or "
            "research team with technical development, market study, and evidence-based strategy validation.",
            body,
        )
    )
    story.append(Spacer(1, 0.3 * inch))
    story.append(
        Paragraph(
            "Rassimwani27@gmail.com | 6006803879 | Srinagar, India",
            ParagraphStyle("foot", parent=body, alignment=TA_CENTER, fontSize=8, textColor=colors.grey),
        )
    )

    doc.build(story, onFirstPage=page_decor, onLaterPages=page_decor)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    # Canonical output is the patched original styled PDF (see patch_rassim_portfolio_pdf.py).
    import subprocess
    import sys

    subprocess.run([sys.executable, str(ROOT / "tools/patch_rassim_portfolio_pdf.py")], check=True)
