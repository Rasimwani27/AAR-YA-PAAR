from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Side = Literal["long", "short"]


@dataclass(frozen=True, slots=True)
class Candle:
    open_time_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    close_time_ms: int = 0

    @property
    def is_green(self) -> bool:
        return self.close > self.open

    @property
    def is_red(self) -> bool:
        return self.close < self.open

    @property
    def is_flat(self) -> bool:
        return self.close == self.open


@dataclass
class LevelSet:
    date_ist: str
    anchor: float
    spacing_d: float
    levels: list[float]
    valid: bool
    reason: str = ""


@dataclass
class Signal:
    side: Side
    entry_price: float
    stop_dist: float
    target_dist: float
    reason: str = ""
    max_hold_bars: int | None = None


@dataclass
class Trade:
    entry_time_ms: int
    exit_time_ms: int
    side: Side
    entry_price: float
    exit_price: float
    qty: float
    gross_pnl: float
    fees: float
    net_pnl: float
    exit_reason: str
    slippage: float = 0.0
    funding: float = 0.0
