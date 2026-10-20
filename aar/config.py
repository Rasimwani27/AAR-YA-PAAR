from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class AppConfig:
    raw: dict[str, Any]
    path: Path

    @property
    def symbol(self) -> str:
        return self.raw["market"]["symbol"]

    @property
    def interval(self) -> str:
        return self.raw["market"]["interval"]

    @property
    def level_interval(self) -> str:
        return self.raw["market"].get("level_interval", self.interval)

    @property
    def anchor_interval(self) -> str:
        return self.raw["market"].get("anchor_interval", "15m")

    @property
    def anchor_position(self) -> str:
        return self.raw["market"].get("anchor_position", "first_session")

    @property
    def tick_size(self) -> float:
        return float(self.raw["market"]["tick_size"])

    @property
    def strategy_name(self) -> str:
        return self.raw["strategy"]["name"]

    @property
    def cache_dir(self) -> Path:
        return Path(self.raw["paths"]["cache_dir"])

    @property
    def reports_dir(self) -> Path:
        return Path(self.raw["paths"]["reports_dir"])

    def section(self, name: str) -> dict[str, Any]:
        return self.raw.get(name, {})


def load_config(path: Path) -> AppConfig:
    with path.open("rb") as f:
        raw = tomllib.load(f)
    return AppConfig(raw=raw, path=path)
