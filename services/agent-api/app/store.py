"""Where the dataset comes from: Neon/PostgreSQL (raw_events table) or the committed fixtures.

Both paths feed the same ETL, so a number computed locally and on the deployed demo is identical.
At pilot scale the ingestion job would materialise the normalised tables and tools would query them
with indexed SQL; the schema for that already exists in migrations/001_schema.sql.
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

from .etl import Dataset, build, load_raw

DATA_DIR = Path(os.environ.get("TESTOPS_DATA_DIR", Path(__file__).resolve().parents[1] / "data" / "synthetic"))
if not DATA_DIR.exists():  # repo layout: data/ lives at the root
    DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "synthetic"
CACHE_SECONDS = 300

_lock = threading.Lock()
_cache: tuple[float, Dataset, str] | None = None


class DataUnavailable(RuntimeError):
    pass


def _database_url() -> str | None:
    return os.environ.get("DATABASE_URL_READONLY") or os.environ.get("DATABASE_URL")


def _load_from_db(url: str) -> tuple[dict, list[dict]]:
    import psycopg

    # Bounded: the PoC log is ~2k rows; the LIMIT protects the function if the table grows.
    with psycopg.connect(url, connect_timeout=10, options="-c statement_timeout=8000") as conn, conn.cursor() as cur:
        cur.execute("SELECT document FROM catalog WHERE id = 'current'")
        row = cur.fetchone()
        if not row:
            raise DataUnavailable("catalog not seeded")
        catalog = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        cur.execute(
            "SELECT ingest_id, event_id, source, event_type, payload, received_at FROM raw_events ORDER BY ingest_id LIMIT 50000"
        )
        events = [
            {"ingest_id": r[0], "event_id": r[1], "source": r[2], "event_type": r[3], "payload": r[4],
             "received_at": r[5].isoformat().replace("+00:00", "Z")}
            for r in cur.fetchall()
        ]
    return catalog, events


def dataset() -> tuple[Dataset, str]:
    """Returns (dataset, source label). Cached per process for CACHE_SECONDS."""
    global _cache
    with _lock:
        if _cache and time.monotonic() - _cache[0] < CACHE_SECONDS:
            return _cache[1], _cache[2]
        url = _database_url()
        if url and os.environ.get("TESTOPS_DATA_SOURCE", "db") == "db":
            try:
                catalog, events = _load_from_db(url)
                source = "postgres"
            except Exception as e:  # noqa: BLE001 - surfaced as a typed error, never with the URL
                raise DataUnavailable(f"database unavailable ({type(e).__name__})") from None
        else:
            catalog, events = load_raw(DATA_DIR)
            source = "fixtures"
        ds = build(catalog, events)
        _cache = (time.monotonic(), ds, source)
        return ds, source


def reset_cache() -> None:
    global _cache
    with _lock:
        _cache = None
