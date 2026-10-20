"""Aggregate trade statistics for reports."""

from __future__ import annotations

from aar.core.models import Trade


def summarize_trades(trades: list[Trade], *, cost_note: str = "") -> dict:
    n = len(trades)
    if not n:
        return {"trade_count": 0, "cost_note": cost_note}

    wins = [t for t in trades if t.net_pnl > 0]
    losses = [t for t in trades if t.net_pnl < 0]
    flats = [t for t in trades if t.net_pnl == 0]

    gross_profit = sum(t.net_pnl for t in wins)
    gross_loss = sum(t.net_pnl for t in losses)
    pf = (gross_profit / abs(gross_loss)) if gross_loss < 0 else None

    total_fees = sum(t.fees for t in trades)
    total_slippage = sum(t.slippage for t in trades)
    total_funding = sum(t.funding for t in trades)
    total_costs = total_fees + total_slippage + total_funding

    expectancy = sum(t.net_pnl for t in trades) / n
    avg_win = (sum(t.net_pnl for t in wins) / len(wins)) if wins else 0.0
    avg_loss = (sum(t.net_pnl for t in losses) / len(losses)) if losses else 0.0

    def _notional(t: Trade) -> float:
        return max(t.qty * t.entry_price, 1e-9)

    avg_win_pct = (sum(t.net_pnl / _notional(t) * 100 for t in wins) / len(wins)) if wins else 0.0
    avg_loss_pct = (sum(t.net_pnl / _notional(t) * 100 for t in losses) / len(losses)) if losses else 0.0

    return {
        "cost_note": cost_note,
        "trade_count": n,
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "breakeven_trades": len(flats),
        "win_rate_pct": round(100 * len(wins) / n, 2),
        "profit_factor_net": round(pf, 3) if pf is not None else None,
        "expectancy_usd_per_trade": round(expectancy, 2),
        "avg_winning_trade_usd": round(avg_win, 2),
        "avg_losing_trade_usd": round(avg_loss, 2),
        "avg_winning_trade_pct_notional": round(avg_win_pct, 4),
        "avg_losing_trade_pct_notional": round(avg_loss_pct, 4),
        "total_gross_pnl_before_costs": round(sum(t.gross_pnl for t in trades), 2),
        "total_fees_usd": round(total_fees, 2),
        "total_slippage_usd": round(total_slippage, 2),
        "total_funding_usd": round(total_funding, 2),
        "total_costs_usd": round(total_costs, 2),
        "total_net_pnl_usd": round(sum(t.net_pnl for t in trades), 2),
    }
