"""IST session window arithmetic (UTC+5:30, no DST)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
IST_OFFSET = timedelta(hours=5, minutes=30)

OBSERVATION_START = time(5, 30)
OBSERVATION_END = time(12, 30)
LONDON_START = time(12, 30)
LONDON_END = time(18, 30)
# US cash session ~9:30–16:00 ET mapped to IST (approx.; crypto uses fixed window)
NEW_YORK_START = time(19, 0)
NEW_YORK_END = time(1, 30)  # next IST calendar day


def ist_midnight_utc_ms(d: date) -> int:
    dt = datetime.combine(d, time(0, 0), tzinfo=IST)
    return int(dt.timestamp() * 1000)


def ist_to_utc_ms(d: date, t: time) -> int:
    dt = datetime.combine(d, t, tzinfo=IST)
    return int(dt.timestamp() * 1000)


def ms_to_ist_date(ms: int) -> date:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone(IST).date()


def ms_to_ist_time(ms: int) -> time:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone(IST).time()


def in_observation(ms: int) -> bool:
    t = ms_to_ist_time(ms)
    return OBSERVATION_START <= t < OBSERVATION_END


def in_london(ms: int) -> bool:
    t = ms_to_ist_time(ms)
    return LONDON_START <= t < LONDON_END


def in_new_york(ms: int) -> bool:
    t = ms_to_ist_time(ms)
    if NEW_YORK_START <= NEW_YORK_END:
        return NEW_YORK_START <= t < NEW_YORK_END
    return t >= NEW_YORK_START or t < NEW_YORK_END


def in_session(ms: int, start: time, end: time) -> bool:
    t = ms_to_ist_time(ms)
    if start <= end:
        return start <= t < end
    return t >= start or t < end


def session_candle_index(ms: int, interval_minutes: int, start: time, end: time) -> int:
    """0-based index within session; -1 if outside session."""
    if not in_session(ms, start, end):
        return -1
    t = ms_to_ist_time(ms)
    start_min = start.hour * 60 + start.minute
    cur_min = t.hour * 60 + t.minute
    if start > end and cur_min < end.hour * 60 + end.minute:
        cur_min += 24 * 60
    return max(0, (cur_min - start_min) // interval_minutes)


def london_minutes_from_open(ms: int) -> int:
    """Minutes since London session start (12:30 IST); -1 if outside London."""
    if not in_london(ms):
        return -1
    t = ms_to_ist_time(ms)
    start_min = LONDON_START.hour * 60 + LONDON_START.minute
    return t.hour * 60 + t.minute - start_min


def london_candle_index(ms: int, interval_minutes: int) -> int:
    """0-based index of the London-session candle containing open time ms."""
    t = ms_to_ist_time(ms)
    if t < LONDON_START:
        return -1
    start_min = LONDON_START.hour * 60 + LONDON_START.minute
    cur_min = t.hour * 60 + t.minute
    return (cur_min - start_min) // interval_minutes


def new_york_candle_index(ms: int, interval_minutes: int) -> int:
    return session_candle_index(ms, interval_minutes, NEW_YORK_START, NEW_YORK_END)


def interval_ms(interval: str) -> int:
    unit = interval[-1]
    n = int(interval[:-1])
    if unit == "m":
        return n * 60_000
    if unit == "h":
        return n * 3_600_000
    if unit == "d":
        return n * 86_400_000
    raise ValueError(f"unknown interval: {interval}")
