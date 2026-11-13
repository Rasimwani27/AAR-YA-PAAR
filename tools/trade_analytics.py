"""Trade-level analytics for dashboard JSON."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone


def _day_key(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def analyze_trades(trades: list[dict], meta: dict) -> dict:
    if not trades:
        return {
            "trade_count": 0,
            "wins": 0,
            "losses": 0,
            "breakeven": 0,
            "win_rate_pct": 0.0,
            "stated_rr": meta.get("rr"),
            "realized_rr": None,
            "profit_factor": None,
            "expectancy_usd": 0.0,
            "best_trade_usd": 0.0,
            "worst_trade_usd": 0.0,
            "avg_win_usd": None,
            "avg_loss_usd": None,
            "total_fees_usd": 0.0,
            "targets_hit": 0,
            "stops_hit": 0,
            "other_exits": 0,
            "max_consecutive_wins": 0,
            "max_consecutive_losses": 0,
            "profitable_days": 0,
            "losing_days": 0,
            "flat_days": 0,
            "daily_pnl": [],
        }

    wins = [t for t in trades if t["net_pnl"] > 0]
    losses = [t for t in trades if t["net_pnl"] < 0]
    flat = [t for t in trades if t["net_pnl"] == 0]

    avg_win = sum(t["net_pnl"] for t in wins) / len(wins) if wins else None
    avg_loss = sum(t["net_pnl"] for t in losses) / len(losses) if losses else None
    realized = None
    if avg_win is not None and avg_loss is not None and avg_loss != 0:
        realized = round(abs(avg_win / avg_loss), 2)

    gross_w = sum(t["gross_pnl"] for t in wins)
    gross_l = abs(sum(t["gross_pnl"] for t in losses))
    pf = round(gross_w / gross_l, 2) if gross_l > 0 else None

    targets = sum(1 for t in trades if t.get("exit_reason") == "target")
    stops = sum(1 for t in trades if t.get("exit_reason") == "stop")
    other = len(trades) - targets - stops

    best = max(t["net_pnl"] for t in trades)
    worst = min(t["net_pnl"] for t in trades)

    streak_w = streak_l = max_w = max_l = 0
    for t in trades:
        if t["net_pnl"] > 0:
            streak_w += 1
            streak_l = 0
            max_w = max(max_w, streak_w)
        elif t["net_pnl"] < 0:
            streak_l += 1
            streak_w = 0
            max_l = max(max_l, streak_l)
        else:
            streak_w = streak_l = 0

    daily: dict[str, dict] = defaultdict(lambda: {"net": 0.0, "trades": 0, "wins": 0, "losses": 0})
    for t in trades:
        d = _day_key(t["exit_time_ms"])
        daily[d]["net"] += t["net_pnl"]
        daily[d]["trades"] += 1
        if t["net_pnl"] > 0:
            daily[d]["wins"] += 1
        elif t["net_pnl"] < 0:
            daily[d]["losses"] += 1

    daily_list = []
    prof_days = lose_days = flat_days = 0
    for day in sorted(daily.keys()):
        row = daily[day]
        net = round(row["net"], 2)
        if net > 0:
            prof_days += 1
        elif net < 0:
            lose_days += 1
        else:
            flat_days += 1
        daily_list.append(
            {
                "date": day,
                "net_pnl": net,
                "trades": row["trades"],
                "wins": row["wins"],
                "losses": row["losses"],
            }
        )

    return {
        "trade_count": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "breakeven": len(flat),
        "win_rate_pct": round(100.0 * len(wins) / len(trades), 2),
        "stated_rr": meta.get("rr"),
        "stated_stop_usdt": meta.get("stop_usdt"),
        "stated_target_usdt": meta.get("target_usdt"),
        "realized_rr": realized,
        "profit_factor": pf,
        "expectancy_usd": round(sum(t["net_pnl"] for t in trades) / len(trades), 2),
        "best_trade_usd": round(best, 2),
        "worst_trade_usd": round(worst, 2),
        "avg_win_usd": round(avg_win, 2) if avg_win is not None else None,
        "avg_loss_usd": round(avg_loss, 2) if avg_loss is not None else None,
        "total_fees_usd": round(sum(t["fees"] for t in trades), 2),
        "targets_hit": targets,
        "stops_hit": stops,
        "other_exits": other,
        "max_consecutive_wins": max_w,
        "max_consecutive_losses": max_l,
        "profitable_days": prof_days,
        "losing_days": lose_days,
        "flat_days": flat_days,
        "daily_pnl": daily_list,
    }
