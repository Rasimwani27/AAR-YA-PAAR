"""Download monthly klines from data.binance.vision (stdlib only)."""

from __future__ import annotations

import csv
import io
import os
import time
import zipfile
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from aar.core.models import Candle

BASE = "https://data.binance.vision/data/futures/um/monthly/klines"


class KlineFetchError(Exception):
    """Could not load enough candle data for the backtest range."""

    def __init__(
        self,
        message: str,
        *,
        symbol: str,
        interval: str,
        start: date,
        end: date,
        missing_months: list[str] | None = None,
        candle_count: int = 0,
    ):
        super().__init__(message)
        self.symbol = symbol
        self.interval = interval
        self.start = start
        self.end = end
        self.missing_months = missing_months or []
        self.candle_count = candle_count

    def to_dict(self) -> dict:
        return {
            "error": str(self),
            "symbol": self.symbol,
            "interval": self.interval,
            "start": str(self.start),
            "end": str(self.end),
            "missing_months": self.missing_months,
            "candle_count": self.candle_count,
            "hint": "Check internet, firewall, and VPN. Data comes from data.binance.vision. "
            "Try a shorter date range or wait and retry — cached months load offline.",
        }


def _month_range(start: date, end: date) -> list[tuple[int, int]]:
    months: list[tuple[int, int]] = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        months.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


def _cache_path(cache_dir: Path, symbol: str, interval: str, year: int, month: int) -> Path:
    return cache_dir / symbol / interval / f"{symbol}-{interval}-{year:04d}-{month:02d}.csv"


def _download_month(symbol: str, interval: str, year: int, month: int, retries: int = 4) -> bytes | None:
    if os.environ.get("AAR_NO_REST") == "1":
        # Still allow vision downloads; AAR_NO_REST blocks live exchange REST elsewhere.
        pass
    name = f"{symbol}-{interval}-{year:04d}-{month:02d}.zip"
    url = f"{BASE}/{symbol}/{interval}/{name}"
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            with urlopen(url, timeout=120) as resp:
                return resp.read()
        except HTTPError as e:
            if e.code == 404:
                return None
            last_err = e
        except (URLError, TimeoutError, OSError) as e:
            last_err = e
        if attempt < retries - 1:
            time.sleep(1.5 * (attempt + 1))
    if last_err:
        raise KlineFetchError(
            f"Download failed for {year:04d}-{month:02d} ({interval}): {last_err}",
            symbol=symbol,
            interval=interval,
            start=date(year, month, 1),
            end=date(year, month, 28),
        )
    return None


def _parse_csv(text: str) -> list[Candle]:
    out: list[Candle] = []
    reader = csv.reader(io.StringIO(text))
    for row in reader:
        if len(row) < 6:
            continue
        try:
            ot = int(row[0])
            o, h, l, c = float(row[1]), float(row[2]), float(row[3]), float(row[4])
            v = float(row[5]) if len(row) > 5 else 0.0
            ct = int(row[6]) if len(row) > 6 else ot
        except ValueError:
            continue
        out.append(Candle(ot, o, h, l, c, v, ct))
    return out


def load_klines(
    symbol: str,
    interval: str,
    start: date,
    end: date,
    cache_dir: Path,
    *,
    require_data: bool = True,
) -> list[Candle]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    from datetime import datetime, timezone

    all_candles: dict[int, Candle] = {}
    start_ms = int(datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc).timestamp() * 1000)
    end_ms = int(datetime.combine(end, datetime.min.time(), tzinfo=timezone.utc).timestamp() * 1000)

    missing: list[str] = []
    months = _month_range(start, end)

    for year, month in months:
        label = f"{year:04d}-{month:02d}"
        path = _cache_path(cache_dir, symbol, interval, year, month)
        text: str | None = None
        if path.exists():
            text = path.read_text(encoding="utf-8")
        else:
            try:
                raw = _download_month(symbol, interval, year, month)
            except KlineFetchError:
                raise
            if raw is None:
                missing.append(label)
                continue
            with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                names = zf.namelist()
                if not names:
                    missing.append(label)
                    continue
                text = zf.read(names[0]).decode("utf-8")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")

        if text:
            for c in _parse_csv(text):
                if c.open_time_ms >= start_ms and c.open_time_ms < end_ms:
                    all_candles[c.open_time_ms] = c

    result = [all_candles[k] for k in sorted(all_candles)]

    if require_data and interval == "15m" and not result:
        raise KlineFetchError(
            f"No {interval} candles for {symbol} between {start} and {end}. "
            f"Missing or empty months: {', '.join(missing) if missing else 'unknown'}.",
            symbol=symbol,
            interval=interval,
            start=start,
            end=end,
            missing_months=missing,
            candle_count=0,
        )

    return result


def merge_candles(series: list[list[Candle]]) -> list[Candle]:
    merged: dict[int, Candle] = {}
    for s in series:
        for c in s:
            merged[c.open_time_ms] = c
    return [merged[k] for k in sorted(merged)]
