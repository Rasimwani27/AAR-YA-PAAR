"""Paper positions + closed trade ledger for forward test."""

from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass, field, fields
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Literal

Side = Literal["long", "short"]
ExitReason = Literal["target", "stop", "manual", "signal_replace"]


MANUAL_STRATEGY_ID = "manual"


def _position_from_dict(p: dict[str, Any]) -> OpenPosition:
    allowed = {f.name for f in fields(OpenPosition)}
    return OpenPosition(**{k: v for k, v in p.items() if k in allowed})


@dataclass
class OpenPosition:
    id: str
    strategy_id: str
    strategy_name: str
    side: Side
    entry_price: float
    stop_price: float
    target_price: float
    qty: float
    stop_usdt: float
    target_usdt: float
    opened_at: str
    reason: str
    signal_bar_ms: int | None = None
    manual: bool = False
    leverage: float = 1.0
    risk_pct: float = 0.0
    notional_usd: float = 0.0
    account_equity_usd: float = 0.0
    bybit_order_id: str = ""
    bybit_live: bool = False

    def unrealized_pnl(self, mark: float) -> float:
        if self.side == "long":
            return (mark - self.entry_price) * self.qty
        return (self.entry_price - mark) * self.qty

    def distance_pct_to_target(self, mark: float) -> float:
        span = abs(self.target_price - self.entry_price)
        if span <= 0:
            return 0.0
        if self.side == "long":
            return max(0.0, min(100.0, ((mark - self.entry_price) / span) * 100.0))
        return max(0.0, min(100.0, ((self.entry_price - mark) / span) * 100.0))

    def to_public(self, mark: float) -> dict[str, Any]:
        upnl = self.unrealized_pnl(mark)
        return {
            **asdict(self),
            "mark_price": mark,
            "unrealized_pnl_usd": round(upnl, 2),
            "progress_to_target_pct": round(self.distance_pct_to_target(mark), 1),
        }


@dataclass
class ClosedTrade:
    id: str
    strategy_id: str
    strategy_name: str
    side: Side
    entry_price: float
    exit_price: float
    qty: float
    gross_pnl_usd: float
    opened_at: str
    closed_at: str
    exit_reason: ExitReason
    hold_minutes: float
    reason: str
    net_pnl_usd: float | None = None
    source: str = "paper"

    def realized_usd(self) -> float:
        if self.source == "bybit" and self.net_pnl_usd is not None:
            return self.net_pnl_usd
        if self.net_pnl_usd is not None:
            return self.net_pnl_usd
        return self.gross_pnl_usd

    def to_public(self) -> dict[str, Any]:
        return asdict(self)


def _trade_from_dict(h: dict[str, Any]) -> ClosedTrade:
    allowed = {f.name for f in fields(ClosedTrade)}
    return ClosedTrade(**{k: v for k, v in h.items() if k in allowed})


@dataclass
class ForwardLedger:
    positions: list[OpenPosition] = field(default_factory=list)
    history: list[ClosedTrade] = field(default_factory=list)

    @staticmethod
    def load(path: Path) -> ForwardLedger:
        if not path.exists():
            return ForwardLedger()
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return ForwardLedger()
        positions = [_position_from_dict(p) for p in raw.get("positions") or []]
        history = [_trade_from_dict(h) for h in raw.get("history") or []]
        return ForwardLedger(positions=positions, history=history)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "positions": [asdict(p) for p in self.positions],
            "history": [asdict(h) for h in self.history],
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def open_for_strategy(self, strategy_id: str) -> OpenPosition | None:
        for p in self.positions:
            if p.strategy_id == strategy_id:
                return p
        return None

    def _close(self, pos: OpenPosition, exit_price: float, reason: ExitReason, closed_at: str) -> ClosedTrade:
        if pos.side == "long":
            gross = (exit_price - pos.entry_price) * pos.qty
        else:
            gross = (pos.entry_price - exit_price) * pos.qty
        opened = datetime.fromisoformat(pos.opened_at.replace("Z", "+00:00"))
        closed = datetime.fromisoformat(closed_at.replace("Z", "+00:00"))
        hold_min = max(0.0, (closed - opened).total_seconds() / 60.0)
        trade = ClosedTrade(
            id=pos.id,
            strategy_id=pos.strategy_id,
            strategy_name=pos.strategy_name,
            side=pos.side,
            entry_price=pos.entry_price,
            exit_price=exit_price,
            qty=pos.qty,
            gross_pnl_usd=round(gross, 2),
            opened_at=pos.opened_at,
            closed_at=closed_at,
            exit_reason=reason,
            hold_minutes=round(hold_min, 1),
            reason=pos.reason,
        )
        self.positions = [p for p in self.positions if p.id != pos.id]
        self.history.insert(0, trade)
        self.history = self.history[:500]
        return trade

    def update_mark(
        self,
        mark: float,
        now_iso: str,
        before_close: Callable[[OpenPosition], None] | None = None,
    ) -> list[ClosedTrade]:
        """No simulated stop/target exits — exchange manages open risk."""
        _ = (mark, now_iso, before_close)
        return []

    def close_manual(self, position_id: str, exit_price: float, now_iso: str) -> ClosedTrade:
        for pos in self.positions:
            if pos.id == position_id:
                return self._close(pos, exit_price, "manual", now_iso)
        raise KeyError(position_id)

    def update_position(
        self,
        position_id: str,
        *,
        stop_price: float | None = None,
        target_price: float | None = None,
        qty: float | None = None,
        leverage: float | None = None,
        risk_pct: float | None = None,
        stop_usdt: float | None = None,
        target_usdt: float | None = None,
        reason: str | None = None,
    ) -> OpenPosition:
        for i, pos in enumerate(self.positions):
            if pos.id != position_id:
                continue
            if stop_price is not None:
                pos.stop_price = round(float(stop_price), 2)
            if target_price is not None:
                pos.target_price = round(float(target_price), 2)
            if qty is not None:
                pos.qty = round(float(qty), 6)
            if leverage is not None:
                pos.leverage = round(float(leverage), 2)
            if risk_pct is not None:
                pos.risk_pct = round(float(risk_pct), 4)
            if stop_usdt is not None:
                pos.stop_usdt = round(float(stop_usdt), 2)
            if target_usdt is not None:
                pos.target_usdt = round(float(target_usdt), 2)
            if reason is not None:
                pos.reason = str(reason)
            entry = pos.entry_price
            if pos.side == "long":
                pos.stop_usdt = round(max(0.0, (entry - pos.stop_price) * pos.qty), 2)
                pos.target_usdt = round(max(0.0, (pos.target_price - entry) * pos.qty), 2)
            else:
                pos.stop_usdt = round(max(0.0, (pos.stop_price - entry) * pos.qty), 2)
                pos.target_usdt = round(max(0.0, (entry - pos.target_price) * pos.qty), 2)
            pos.notional_usd = round(entry * pos.qty, 2)
            self.positions[i] = pos
            return pos
        raise KeyError(position_id)

    def open_manual(
        self,
        *,
        side: Side,
        entry_price: float,
        stop_price: float,
        target_price: float,
        qty: float,
        leverage: float,
        risk_pct: float,
        account_equity_usd: float,
        reason: str,
        now_iso: str,
    ) -> OpenPosition:
        entry_price = float(entry_price)
        stop_price = float(stop_price)
        target_price = float(target_price)
        qty = round(float(qty), 6)
        if side == "long":
            if stop_price >= entry_price or target_price <= entry_price:
                raise ValueError("long: stop must be below entry; target above entry")
        else:
            if stop_price <= entry_price or target_price >= entry_price:
                raise ValueError("short: stop must be above entry; target below entry")
        stop_dist = abs(entry_price - stop_price)
        target_dist = abs(target_price - entry_price)
        pos = OpenPosition(
            id=str(uuid.uuid4()),
            strategy_id=MANUAL_STRATEGY_ID,
            strategy_name="Manual",
            side=side,
            entry_price=round(entry_price, 2),
            stop_price=round(stop_price, 2),
            target_price=round(target_price, 2),
            qty=qty,
            stop_usdt=round(stop_dist * qty, 2),
            target_usdt=round(target_dist * qty, 2),
            opened_at=now_iso,
            reason=reason,
            manual=True,
            leverage=round(float(leverage), 2),
            risk_pct=round(float(risk_pct), 4),
            notional_usd=round(entry_price * qty, 2),
            account_equity_usd=round(float(account_equity_usd), 2),
        )
        self.positions.append(pos)
        return pos

    def open_from_signal(
        self,
        *,
        strategy_id: str,
        strategy_name: str,
        side: Side,
        entry_price: float,
        stop_dist: float,
        target_dist: float,
        reason: str,
        now_iso: str,
        signal_bar_ms: int | None = None,
        qty: float | None = None,
        leverage: float = 10.0,
        risk_pct: float = 0.0,
        account_equity_usd: float = 0.0,
        bybit_live: bool = False,
        bybit_order_id: str = "",
    ) -> OpenPosition | None:
        if self.open_for_strategy(strategy_id):
            return None
        stop_dist = float(stop_dist)
        target_dist = float(target_dist)
        if qty is None or qty <= 0:
            qty = 0.001
        qty = round(float(qty), 6)
        if side == "long":
            stop_price = entry_price - stop_dist
            target_price = entry_price + target_dist
        else:
            stop_price = entry_price + stop_dist
            target_price = entry_price - target_dist
        pos = OpenPosition(
            id=str(uuid.uuid4()),
            strategy_id=strategy_id,
            strategy_name=strategy_name,
            side=side,
            entry_price=entry_price,
            stop_price=round(stop_price, 2),
            target_price=round(target_price, 2),
            qty=qty,
            stop_usdt=stop_dist,
            target_usdt=target_dist,
            opened_at=now_iso,
            reason=reason,
            signal_bar_ms=signal_bar_ms,
            leverage=round(float(leverage), 2),
            risk_pct=round(float(risk_pct), 4),
            notional_usd=round(entry_price * qty, 2),
            account_equity_usd=round(float(account_equity_usd), 2),
            bybit_live=bybit_live,
            bybit_order_id=bybit_order_id,
        )
        self.positions.append(pos)
        return pos


def compute_stats(ledger: ForwardLedger, mark: float) -> dict[str, Any]:
    history = ledger.history
    wins = sum(1 for t in history if t.realized_usd() > 0)
    losses = sum(1 for t in history if t.realized_usd() < 0)
    total = len(history)
    net = sum(t.realized_usd() for t in history)
    unrealized = sum(p.unrealized_pnl(mark) for p in ledger.positions)
    today = datetime.now(timezone.utc).date().isoformat()
    today_net = sum(t.realized_usd() for t in history if t.closed_at.startswith(today))
    by_strategy: dict[str, dict[str, Any]] = {}
    for t in history:
        r = t.realized_usd()
        bucket = by_strategy.setdefault(
            t.strategy_id,
            {"strategy_id": t.strategy_id, "strategy_name": t.strategy_name, "trades": 0, "wins": 0, "net_usd": 0.0},
        )
        bucket["trades"] += 1
        bucket["wins"] += 1 if r > 0 else 0
        bucket["net_usd"] = round(bucket["net_usd"] + r, 2)
    return {
        "open_count": len(ledger.positions),
        "closed_trades": total,
        "wins": wins,
        "losses": losses,
        "win_rate_pct": round((wins / total) * 100.0, 1) if total else 0.0,
        "realized_pnl_usd": round(net, 2),
        "unrealized_pnl_usd": round(unrealized, 2),
        "total_pnl_usd": round(net + unrealized, 2),
        "today_realized_usd": round(today_net, 2),
        "by_strategy": list(by_strategy.values()),
    }
