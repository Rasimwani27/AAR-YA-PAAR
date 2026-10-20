from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from aar.config import AppConfig
from aar.core.models import Candle, LevelSet, Signal


class Strategy(ABC):
    @abstractmethod
    def on_day_levels(self, levels: LevelSet | None) -> None:
        ...

    @abstractmethod
    def on_candle(self, candle: Candle, *, in_trading_window: bool) -> Signal | None:
        ...

    @abstractmethod
    def risk_pct(self) -> float:
        ...

    @abstractmethod
    def compound(self) -> bool:
        ...


REGISTRY: dict[str, type[Strategy]] = {}


def register(name: str):
    def deco(cls: type[Strategy]) -> type[Strategy]:
        REGISTRY[name] = cls
        return cls

    return deco


def create_strategy(cfg: AppConfig) -> Strategy:
    name = cfg.strategy_name
    if name not in REGISTRY:
        raise KeyError(f"unknown strategy: {name}")
    return REGISTRY[name](cfg)
