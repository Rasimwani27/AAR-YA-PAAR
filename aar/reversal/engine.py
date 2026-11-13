"""SQLite persistence for precomputed reversal levels."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from threading import Lock
from typing import Any

from aar.reversal.levels import ReversalLevel

DEFAULT_DB = Path("out/reversal_levels.db")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS reversal_level (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    interval_min INTEGER NOT NULL,
    trading_date_ist TEXT NOT NULL,
    kind TEXT NOT NULL,
    price REAL NOT NULL,
    candle_open_ms INTEGER NOT NULL,
    left_bars INTEGER NOT NULL,
    right_bars INTEGER NOT NULL,
    UNIQUE(symbol, interval_min, trading_date_ist, kind, candle_open_ms, price)
);
CREATE INDEX IF NOT EXISTS idx_rev_lookup
    ON reversal_level(symbol, interval_min, trading_date_ist);
CREATE TABLE IF NOT EXISTS build_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

_store: ReversalStore | None = None
_lock = Lock()


class ReversalStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    def set_meta(self, key: str, value: str) -> None:
        self._conn.execute(
            "INSERT INTO build_meta(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
        self._conn.commit()

    def get_meta(self, key: str) -> str | None:
        row = self._conn.execute("SELECT value FROM build_meta WHERE key=?", (key,)).fetchone()
        return row["value"] if row else None

    def replace_day(
        self,
        symbol: str,
        interval_min: int,
        trading_date_ist: str,
        levels: list[ReversalLevel],
    ) -> int:
        cur = self._conn.cursor()
        cur.execute(
            "DELETE FROM reversal_level WHERE symbol=? AND interval_min=? AND trading_date_ist=?",
            (symbol, interval_min, trading_date_ist),
        )
        n = 0
        for lv in levels:
            cur.execute(
                """
                INSERT OR IGNORE INTO reversal_level
                (symbol, interval_min, trading_date_ist, kind, price, candle_open_ms, left_bars, right_bars)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    lv.symbol,
                    lv.interval_min,
                    lv.trading_date_ist,
                    lv.kind,
                    lv.price,
                    lv.candle_open_ms,
                    lv.left_bars,
                    lv.right_bars,
                ),
            )
            n += cur.rowcount
        self._conn.commit()
        return n

    def levels_for_day(self, symbol: str, interval_min: int, trading_date_ist: str) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            """
            SELECT kind, price, candle_open_ms, left_bars, right_bars
            FROM reversal_level
            WHERE symbol=? AND interval_min=? AND trading_date_ist=?
            ORDER BY candle_open_ms, kind
            """,
            (symbol, interval_min, trading_date_ist),
        ).fetchall()
        return [dict(r) for r in rows]

    def count(self, symbol: str | None = None) -> int:
        if symbol:
            row = self._conn.execute(
                "SELECT COUNT(*) AS c FROM reversal_level WHERE symbol=?", (symbol,)
            ).fetchone()
        else:
            row = self._conn.execute("SELECT COUNT(*) AS c FROM reversal_level").fetchone()
        return int(row["c"])


def get_store(path: Path | None = None) -> ReversalStore:
    global _store
    db = path or DEFAULT_DB
    with _lock:
        if _store is None or _store.path != db.resolve():
            if _store is not None:
                _store.close()
            _store = ReversalStore(db.resolve())
        return _store
