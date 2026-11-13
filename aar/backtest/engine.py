from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from aar.config import AppConfig
from aar.core.models import Candle, Signal, Trade
from aar.core.rules import Strategy, create_strategy
from aar.core.sessions import in_london, in_observation, ms_to_ist_date, ms_to_ist_time, OBSERVATION_START
from aar.strategies.london_mid_engulf import LondonMidEngulfStrategy
from aar.core.sessions import interval_ms as bar_interval_ms
from aar.data.vision import KlineFetchError, load_klines
from aar.strategies.break_fade import build_levels_for_day
from aar.backtest.trailing import (
    TrailingConfig,
    TrailingState,
    check_exit_trailing,
    init_trailing_state,
    register_swing,
    trailing_config_from_raw,
    update_trailing,
)
from aar.strategies.fade_reversal import FadeReversalStrategy


def _resolve_trailing_cfg(cfg: AppConfig) -> TrailingConfig:
    raw = cfg.raw.get("strategy", {})
    block = raw.get("london_mid_engulf", {}).get("trailing")
    if block is None:
        block = cfg.section("backtest").get("trailing")
    return trailing_config_from_raw(block)


@dataclass
class OpenPosition:
    side: str
    entry_price: float
    qty: float
    stop_dist: float
    target_dist: float
    entry_time_ms: int
    entry_fee: float
    reason: str
    max_hold_bars: int | None = None
    bars_held: int = 0
    entry_slippage: float = 0.0
    funding_paid: float = 0.0
    trailing: TrailingState | None = None
    bar_history: list[Candle] | None = None
    swing_bar_history: list[Candle] | None = None


@dataclass
class BacktestResult:
    trades: list[Trade]
    initial_equity: float
    final_equity: float
    net_pnl: float
    return_pct: float
    win_rate: float
    config_path: str
    symbol: str
    strategy: str
    start: str
    end: str

    def summary(self) -> dict:
        n = len(self.trades)
        wins = sum(1 for t in self.trades if t.net_pnl > 0)
        return {
            "trades": n,
            "win_rate": round(wins / n, 4) if n else 0.0,
            "net_pnl": round(self.net_pnl, 2),
            "return_pct": round(self.return_pct, 4),
            "final_equity": round(self.final_equity, 2),
        }


def _date_ms(d: date) -> int:
    return int(datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc).timestamp() * 1000)


def _fee_rate(cfg: AppConfig) -> float:
    bt = cfg.section("backtest")
    taker = float(bt.get("taker_fee", 0.0005))
    discount = float(bt.get("fee_discount", 0.9))
    return taker * discount


def _cost_params(cfg: AppConfig) -> tuple[float, float, bool, float, int]:
    bt = cfg.section("backtest")
    slip_usd = float(bt.get("slippage_usdt_per_fill", 0.0))
    slip_bps = float(bt.get("slippage_bps_per_fill", 0.0))
    use_funding = bool(bt.get("use_real_funding", False))
    funding_rate = float(bt.get("funding_rate", 0.0001))
    exec_iv_ms = bar_interval_ms(cfg.interval)
    return slip_usd, slip_bps, use_funding, funding_rate, exec_iv_ms


def _fill_slippage_usd(qty: float, price: float, slip_usd: float, slip_bps: float) -> float:
    notional = qty * price
    return slip_usd + notional * (slip_bps / 10_000.0)


def _accrue_funding(pos: OpenPosition, mark: float, funding_rate: float, bar_ms: int) -> float:
    if funding_rate == 0:
        return 0.0
    notional = pos.qty * mark
    frac = bar_ms / (8 * 3_600_000)
    payment = notional * funding_rate * frac
    if pos.side == "long":
        return payment if funding_rate > 0 else -payment
    return -payment if funding_rate > 0 else payment


def _position_size(
    equity: float,
    risk_pct: float,
    stop_dist: float,
    compound: bool,
    base_equity: float,
) -> float:
    bal = equity if compound else base_equity
    risk_usd = bal * (risk_pct / 100.0)
    if stop_dist <= 0:
        return 0.0
    return max(risk_usd / stop_dist, 0.0)


def _check_exit(
    pos: OpenPosition,
    c: Candle,
    trail_cfg: TrailingConfig,
) -> tuple[float, str] | None:
    if trail_cfg.enabled and pos.trailing is not None:
        return check_exit_trailing(
            pos.side,
            pos.entry_price,
            pos.trailing,
            c,
            pos.target_dist,
            trail_cfg,
        )
    if pos.side == "long":
        stop_price = pos.entry_price - pos.stop_dist
        target_price = pos.entry_price + pos.target_dist
        if c.low <= stop_price:
            return stop_price, "stop"
        if pos.target_dist > 0 and c.high >= target_price:
            return target_price, "target"
    else:
        stop_price = pos.entry_price + pos.stop_dist
        target_price = pos.entry_price - pos.target_dist
        if c.high >= stop_price:
            return stop_price, "stop"
        if pos.target_dist > 0 and c.low <= target_price:
            return target_price, "target"
    return None


def _gross(side: str, entry: float, exit_p: float, qty: float) -> float:
    if side == "long":
        return (exit_p - entry) * qty
    return (entry - exit_p) * qty


def _run_backtest_level_grid(
    cfg: AppConfig,
    start: date,
    end: date,
    strategy,
    *,
    trading_window,
    use_fade_extras: bool,
) -> BacktestResult:
    """Shared day-grid backtest (fade-reversal or london-mid-engulf)."""
    bt = cfg.section("backtest")
    initial = float(bt.get("initial_equity", 1000.0))
    fee_rate = _fee_rate(cfg)
    slip_usd, slip_bps, use_funding, funding_rate, exec_bar_ms = _cost_params(cfg)

    start_ms = _date_ms(start)
    end_ms = _date_ms(end)
    raw_exec = load_klines(cfg.symbol, cfg.interval, start, end, cfg.cache_dir, require_data=True)
    exec_candles = [c for c in raw_exec if start_ms <= c.open_time_ms < end_ms]

    pad = start - timedelta(days=2)
    level_candles = load_klines(cfg.symbol, cfg.level_interval, pad, end, cfg.cache_dir, require_data=False)
    anchor_candles = load_klines(cfg.symbol, cfg.anchor_interval, pad, end, cfg.cache_dir, require_data=False)
    ema_candles = level_candles
    analysis_15m: list[Candle] = []
    swing_15m: list[Candle] = []
    swing_15m_idx = 0
    trend_htf: list[Candle] = []
    if use_fade_extras and isinstance(strategy, FadeReversalStrategy):
        analysis_15m = load_klines(cfg.symbol, "15m", pad, end, cfg.cache_dir, require_data=False)
        if strategy._trend_interval:
            trend_pad = start - timedelta(days=400)
            trend_htf = load_klines(
                cfg.symbol,
                strategy._trend_interval,
                trend_pad,
                end,
                cfg.cache_dir,
                require_data=False,
            )
        if strategy._bf._regime_min_return_30d is not None:
            regime_pad = start - timedelta(days=45)
            daily = load_klines(cfg.symbol, "1d", regime_pad, end, cfg.cache_dir, require_data=False)
            strategy.set_daily_closes(daily)

    if not exec_candles:
        raise KlineFetchError(
            f"No execution candles in range {start} → {end} for {cfg.symbol} ({cfg.interval}).",
            symbol=cfg.symbol,
            interval=cfg.interval,
            start=start,
            end=end,
            candle_count=0,
        )

    equity = initial
    base_equity = initial
    trades: list[Trade] = []
    position: OpenPosition | None = None
    trail_cfg = _resolve_trailing_cfg(cfg)
    if trail_cfg.enabled and trail_cfg.swing_interval == "15m":
        swing_15m = load_klines(cfg.symbol, "15m", pad, end, cfg.cache_dir, require_data=False)

    ema_obs_by_day: dict[date, list[float]] = {}
    level_obs_by_day: dict[date, list[Candle]] = {}
    anchor_price_by_day: dict[date, float] = {}
    for ec in ema_candles:
        if in_observation(ec.open_time_ms):
            d = ms_to_ist_date(ec.open_time_ms)
            ema_obs_by_day.setdefault(d, []).append(ec.close)
    for lc in level_candles:
        if in_observation(lc.open_time_ms):
            d = ms_to_ist_date(lc.open_time_ms)
            level_obs_by_day.setdefault(d, []).append(lc)
    for ac in anchor_candles:
        if ms_to_ist_time(ac.open_time_ms) == OBSERVATION_START:
            anchor_price_by_day[ms_to_ist_date(ac.open_time_ms)] = ac.close

    ema_global_idx = 0
    analysis_15m_idx = 0
    trend_htf_idx = 0
    current_day: date | None = None

    for c in exec_candles:
        day = ms_to_ist_date(c.open_time_ms)
        if day != current_day:
            current_day = day
            if use_fade_extras and isinstance(strategy, FadeReversalStrategy):
                strategy._bf._ema_closes = []
                for close in ema_obs_by_day.get(day, []):
                    strategy.feed_ema_bar(close)
            levels = build_levels_for_day(
                cfg,
                day,
                level_candles,
                anchor_candles,
                obs_candles=level_obs_by_day.get(day),
                anchor_price=anchor_price_by_day.get(day),
            )
            strategy.on_day_levels(levels)

        if use_fade_extras and isinstance(strategy, FadeReversalStrategy):
            while analysis_15m_idx < len(analysis_15m) and analysis_15m[analysis_15m_idx].open_time_ms <= c.open_time_ms:
                strategy.on_analysis_15m(analysis_15m[analysis_15m_idx])
                analysis_15m_idx += 1
            while trend_htf_idx < len(trend_htf) and trend_htf[trend_htf_idx].open_time_ms <= c.open_time_ms:
                strategy.ingest_trend_bar(trend_htf[trend_htf_idx])
                trend_htf_idx += 1
            while ema_global_idx < len(ema_candles) and ema_candles[ema_global_idx].open_time_ms <= c.open_time_ms:
                ec = ema_candles[ema_global_idx]
                ema_global_idx += 1
                if ms_to_ist_date(ec.open_time_ms) != day:
                    continue
                if in_london(ec.open_time_ms):
                    strategy.feed_ema_bar(ec.close)

        if position is not None:
            position.bars_held += 1
            if use_funding:
                fp = _accrue_funding(position, c.close, funding_rate, exec_bar_ms)
                position.funding_paid += fp
                equity -= fp
            if trail_cfg.enabled and position.trailing is not None:
                if position.bar_history is not None:
                    position.bar_history.append(c)
                if trail_cfg.swing_interval == "15m" and position.swing_bar_history is not None:
                    while swing_15m_idx < len(swing_15m) and swing_15m[swing_15m_idx].open_time_ms <= c.open_time_ms:
                        bc = swing_15m[swing_15m_idx]
                        swing_15m_idx += 1
                        if bc.open_time_ms >= position.entry_time_ms:
                            position.swing_bar_history.append(bc)
                            register_swing(
                                position.trailing,
                                position.side,
                                position.swing_bar_history,
                                trail_cfg.pivot_bars,
                            )
                elif position.bar_history is not None:
                    register_swing(
                        position.trailing,
                        position.side,
                        position.bar_history,
                        trail_cfg.pivot_bars,
                    )
                update_trailing(
                    position.trailing,
                    position.side,
                    position.entry_price,
                    c,
                    trail_cfg,
                )
            hit = _check_exit(position, c, trail_cfg)
            if hit is None and position.max_hold_bars and position.bars_held >= position.max_hold_bars:
                hit = (c.close, "time")
            if hit:
                exit_p, reason = hit
                exit_fee = fee_rate * position.qty * exit_p
                exit_slip = _fill_slippage_usd(position.qty, exit_p, slip_usd, slip_bps)
                gross = _gross(position.side, position.entry_price, exit_p, position.qty)
                fees = position.entry_fee + exit_fee
                slip_total = position.entry_slippage + exit_slip
                funding_total = position.funding_paid
                net = gross - fees - slip_total - funding_total
                equity += gross - exit_fee - exit_slip
                trades.append(
                    Trade(
                        position.entry_time_ms,
                        c.open_time_ms,
                        position.side,
                        position.entry_price,
                        exit_p,
                        position.qty,
                        gross,
                        fees,
                        net,
                        reason,
                        slippage=slip_total,
                        funding=funding_total,
                    )
                )
                position = None

        if position is None:
            sig = strategy.on_candle(c, in_trading_window=trading_window(c.open_time_ms))
            if isinstance(sig, Signal):
                qty = _position_size(equity, strategy.risk_pct(), sig.stop_dist, strategy.compound(), base_equity)
                if qty > 0:
                    entry_fee = fee_rate * qty * sig.entry_price
                    entry_slip = _fill_slippage_usd(qty, sig.entry_price, slip_usd, slip_bps)
                    if equity <= entry_fee + entry_slip:
                        continue
                    equity -= entry_fee + entry_slip
                    t_state = (
                        init_trailing_state(sig.side, sig.entry_price, sig.stop_dist)
                        if trail_cfg.enabled
                        else None
                    )
                    target_dist = sig.target_dist
                    if trail_cfg.enabled and not trail_cfg.use_target:
                        target_dist = 0.0
                    position = OpenPosition(
                        sig.side,
                        sig.entry_price,
                        qty,
                        sig.stop_dist,
                        target_dist,
                        c.open_time_ms,
                        entry_fee,
                        sig.reason,
                        max_hold_bars=sig.max_hold_bars,
                        entry_slippage=entry_slip,
                        trailing=t_state,
                        bar_history=[c] if trail_cfg.enabled else None,
                        swing_bar_history=[] if trail_cfg.enabled and trail_cfg.swing_interval == "15m" else None,
                    )

    net_pnl = equity - initial
    ret = (equity / initial - 1.0) * 100.0 if initial else 0.0
    wins = sum(1 for t in trades if t.net_pnl > 0)
    wr = wins / len(trades) if trades else 0.0
    return BacktestResult(
        trades=trades,
        initial_equity=initial,
        final_equity=equity,
        net_pnl=net_pnl,
        return_pct=ret,
        win_rate=wr,
        config_path=str(cfg.path),
        symbol=cfg.symbol,
        strategy=cfg.strategy_name,
        start=str(start),
        end=str(end),
    )


def run_backtest(cfg: AppConfig, start: date, end: date) -> BacktestResult:
    import aar.strategies  # noqa: F401

    if cfg.strategy_name == "london-mid-engulf":
        strategy = create_strategy(cfg)
        if not isinstance(strategy, LondonMidEngulfStrategy):
            raise TypeError("expected LondonMidEngulfStrategy")
        return _run_backtest_level_grid(
            cfg,
            start,
            end,
            strategy,
            trading_window=lambda _ms: True,
            use_fade_extras=False,
        )

    if cfg.strategy_name != "fade-reversal":
        raise ValueError(f"Unsupported strategy: {cfg.strategy_name!r}")

    strategy = create_strategy(cfg)
    if not isinstance(strategy, FadeReversalStrategy):
        raise TypeError("expected FadeReversalStrategy")
    from aar.core.sessions import in_new_york

    return _run_backtest_level_grid(
        cfg,
        start,
        end,
        strategy,
        trading_window=in_new_york,
        use_fade_extras=True,
    )


def save_report(result: BacktestResult, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        **result.summary(),
        "initial_equity": result.initial_equity,
        "config": result.config_path,
        "symbol": result.symbol,
        "strategy": result.strategy,
        "start": result.start,
        "end": result.end,
        "trades_detail": [asdict(t) for t in result.trades],
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
