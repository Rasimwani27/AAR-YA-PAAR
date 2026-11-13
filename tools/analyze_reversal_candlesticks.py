#!/usr/bin/env python3
"""Which TF has the most classic reversal candlesticks at swing pivots."""

from __future__ import annotations

import json
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from aar.core.sessions import ms_to_ist_date
from aar.data.vision import load_klines
from aar.reversal.candle_patterns import best_pattern_for_reversal, single_bar_patterns, two_bar_patterns
from aar.reversal.levels import resample_candles

DB = ROOT / "out/reversal_levels.db"
CACHE = ROOT / "out/cache"
SYMBOL = "BTCUSDT"


def load_series(start: date, end: date) -> dict[int, list]:
    pad = start - timedelta(days=2)
    end_ex = end + timedelta(days=2)
    c1 = load_klines(SYMBOL, "1m", pad, end_ex, CACHE, require_data=False)
    out: dict[int, list] = {}
    if not c1:
        return out
    out[1] = c1
    for imin in range(2, 16):
        if imin in (3, 5, 15):
            iv = {3: "3m", 5: "5m", 15: "15m"}[imin]
            s = load_klines(SYMBOL, iv, pad, end_ex, CACHE, require_data=False)
            out[imin] = s if s else resample_candles(c1, imin)
        else:
            out[imin] = resample_candles(c1, imin)
    return out


def main() -> int:
    conn = sqlite3.connect(DB)
    meta = {r[0]: r[1] for r in conn.execute("SELECT key, value FROM build_meta")}
    days = [date.fromisoformat(x) for x in meta.get("trading_days", "").split(",") if x]
    start, end = min(days), max(days)
    rows = conn.execute(
        "SELECT interval_min, kind, candle_open_ms FROM reversal_level WHERE symbol=?",
        (SYMBOL,),
    ).fetchall()
    conn.close()

    series = load_series(start, end)
    idx_maps = {imin: {c.open_time_ms: i for i, c in enumerate(cs)} for imin, cs in series.items()}

    per_tf_total: Counter[int] = Counter()
    per_tf_strict_aligned: Counter[int] = Counter()
    per_tf_any_aligned: Counter[int] = Counter()
    per_tf_pattern: dict[int, Counter[str]] = defaultdict(Counter)
    per_tf_strict_pattern: dict[int, Counter[str]] = defaultdict(Counter)

    for imin, kind, oms in rows:
        candles = series.get(imin)
        if not candles:
            continue
        imap = idx_maps[imin]
        idx = imap.get(oms)
        if idx is None:
            idx = next((i for i, c in enumerate(candles) if c.open_time_ms >= oms), None)
        if idx is None:
            continue
        c = candles[idx]
        prev = candles[idx - 1] if idx > 0 else None
        per_tf_total[imin] += 1

        low = kind == "swing_low"
        want = "bullish_reversal" if low else "bearish_reversal"
        singles = single_bar_patterns(c, at_swing_low=low, at_swing_high=not low)
        doubles = two_bar_patterns(prev, c, at_swing_low=low, at_swing_high=not low)
        all_p = singles + doubles

        aligned = [p for p in all_p if p.family == want]
        strict_aligned = [p for p in aligned if p.strict]
        neutral_strict = [p for p in all_p if p.family == "neutral_reversal" and p.strict]

        best = best_pattern_for_reversal(prev, c, kind)
        if best:
            per_tf_pattern[imin][best.name] += 1
            if best.strict:
                per_tf_strict_pattern[imin][best.name] += 1

        if strict_aligned:
            per_tf_strict_aligned[imin] += 1
        elif neutral_strict:
            per_tf_strict_aligned[imin] += 1  # doji at pivot counts as classic
        if aligned or neutral_strict:
            per_tf_any_aligned[imin] += 1

    ranked = []
    for imin in sorted(per_tf_total.keys()):
        n = per_tf_total[imin]
        ranked.append(
            {
                "interval_min": imin,
                "swing_events": n,
                "pct_strict_reversal_candle": round(100 * per_tf_strict_aligned[imin] / n, 1) if n else 0,
                "pct_any_reversal_candle": round(100 * per_tf_any_aligned[imin] / n, 1) if n else 0,
                "top_patterns": per_tf_pattern[imin].most_common(5),
                "top_strict_patterns": per_tf_strict_pattern[imin].most_common(5),
            }
        )

    ranked.sort(key=lambda x: (x["pct_strict_reversal_candle"], x["pct_any_reversal_candle"]), reverse=True)

    # Global pattern names pooled by TF weight
    global_by_tf_best = Counter()
    for imin, ctr in per_tf_pattern.items():
        for name, cnt in ctr.items():
            global_by_tf_best[(imin, name)] += cnt

    report = {
        "symbol": SYMBOL,
        "trading_days": len(days),
        "ranked_timeframes": ranked,
        "winner_strict": ranked[0] if ranked else None,
        "winner_any": max(ranked, key=lambda x: x["pct_any_reversal_candle"]) if ranked else None,
        "notes": [
            "strict = textbook hammer/shooting star/doji/engulfing",
            "close = long wick, harami, piercing heuristics",
            "swing_low expects bullish family; swing_high expects bearish",
        ],
    }

    out = ROOT / "out/reports/reversal-candlestick-by-tf.json"
    out.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
