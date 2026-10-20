"""Paper positions + closed trade ledger for forward test."""

from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

Side = Literal["long", "short"]
ExitReason = Literal["target", "stop", "manual", "signal_replace"]


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

    def to_public(self) -> dict[str, Any]:
        return asdict(self)


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
        positions = [OpenPosition(**p) for p in raw.get("positions") or []]
        history = [ClosedTrade(**h) for h in raw.get("history") or []]
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

    def update_mark(self, mark: float, now_iso: str) -> list[ClosedTrade]:
        closed: list[ClosedTrade] = []
        still: list[OpenPosition] = []
        for pos in self.positions:
            hit_stop = hit_target = False
            if pos.side == "long":
                hit_stop = mark <= pos.stop_price
                hit_target = mark >= pos.target_price
            else:
                hit_stop = mark >= pos.stop_price
                hit_target = mark <= pos.target_price
            if hit_target:
                closed.append(self._close(pos, pos.target_price, "target", now_iso))
            elif hit_stop:
                closed.append(self._close(pos, pos.stop_price, "stop", now_iso))
            else:
                still.append(pos)
        self.positions = still
        return closed

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
    ) -> OpenPosition | None:
        if self.open_for_strategy(strategy_id):
            return None
        stop_dist = float(stop_dist)
        target_dist = float(target_dist)
        qty = round(stop_dist / stop_dist, 4) if stop_dist > 0 else 0.001
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
        )
        self.positions.append(pos)
        return pos


def compute_stats(ledger: ForwardLedger, mark: float) -> dict[str, Any]:
    history = ledger.history
    wins = sum(1 for t in history if t.gross_pnl_usd > 0)
    losses = sum(1 for t in history if t.gross_pnl_usd < 0)
    total = len(history)
    net = sum(t.gross_pnl_usd for t in history)
    unrealized = sum(p.unrealized_pnl(mark) for p in ledger.positions)
    today = datetime.now(timezone.utc).date().isoformat()
    today_net = sum(
        t.gross_pnl_usd for t in history if t.closed_at.startswith(today)
    )
    by_strategy: dict[str, dict[str, Any]] = {}
    for t in history:
        bucket = by_strategy.setdefault(
            t.strategy_id,
            {"strategy_id": t.strategy_id, "strategy_name": t.strategy_name, "trades": 0, "wins": 0, "net_usd": 0.0},
        )
        bucket["trades"] += 1
        bucket["wins"] += 1 if t.gross_pnl_usd > 0 else 0
        bucket["net_usd"] = round(bucket["net_usd"] + t.gross_pnl_usd, 2)
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
