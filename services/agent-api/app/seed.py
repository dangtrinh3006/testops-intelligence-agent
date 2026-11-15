"""Idempotent database seed: schema, catalog, raw events, then a full rebuild of the normalised tables.

Run with a privileged connection (DATABASE_URL). The agent itself reads with DATABASE_URL_READONLY,
a role that only has SELECT. Re-running the seed produces identical tables.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from .etl import build, load_raw
from .store import DATA_DIR

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
READONLY_ROLE = "testops_reader"
DERIVED = ("dq_findings", "log_lines", "attempts", "ci_summaries", "runs")


def seed(url: str, readonly_password: str | None = None) -> dict:
    import psycopg
    from psycopg import sql
    from psycopg.types.json import Jsonb

    catalog, events = load_raw(DATA_DIR)
    ds = build(catalog, events)
    with psycopg.connect(url, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            for f in sorted(MIGRATIONS.glob("*.sql")):
                cur.execute(f.read_text(encoding="utf-8"))
            cur.execute("INSERT INTO catalog (id, document) VALUES ('current', %s) ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document, updated_at = now()",
                        (Jsonb(catalog),))
            cur.executemany(
                "INSERT INTO raw_events (ingest_id, event_id, source, event_type, payload, received_at) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (ingest_id) DO NOTHING",
                [(e["ingest_id"], e["event_id"], e["source"], e["event_type"], Jsonb(e["payload"]), e["received_at"]) for e in events],
            )
            cur.execute("TRUNCATE " + ", ".join(DERIVED))
            cur.executemany("INSERT INTO runs VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", [
                (r.run_id, r.pipeline_id, r.service_id, r.run_number, r.commit, str(r.queued.raw), r.queued.utc, r.event_id) for r in ds.runs.values()])
            cur.executemany("INSERT INTO ci_summaries VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", [
                (r.run_id, r.summary.status, str(r.summary.status_raw), str(r.summary.finished.raw), r.summary.finished.utc, r.summary.finished.fmt,
                 r.summary.event_id, r.summary.ingest_id) for r in ds.runs.values() if r.summary])
            cur.executemany("INSERT INTO attempts VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", [
                (a.attempt_id, a.run_id, a.test_id, a.attempt_no, a.status, a.started.raw, a.started.utc,
                 a.finished.raw, a.finished.utc, a.error_class, a.message, a.result_event_id, a.result_ingest_ids) for a in ds.attempts])
            cur.executemany("INSERT INTO log_lines VALUES (%s,%s,%s,%s,%s,%s,%s)", [
                (x.event_id, x.run_id, x.attempt_id, str(x.ts.raw), x.ts.utc, x.level, x.message) for x in ds.logs])
            cur.executemany("INSERT INTO dq_findings VALUES (%s,%s,%s,%s,%s,%s)", [
                (f.id, f.kind, f.severity, f.detail, f.record_ids, f.count) for f in ds.findings])
            if readonly_password:
                cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (READONLY_ROLE,))
                verb = "ALTER" if cur.fetchone() else "CREATE"
                cur.execute(sql.SQL("{} ROLE {} WITH LOGIN PASSWORD {}").format(sql.SQL(verb), sql.Identifier(READONLY_ROLE), sql.Literal(readonly_password)))
                cur.execute(f"GRANT USAGE ON SCHEMA public TO {READONLY_ROLE}")
                cur.execute(f"GRANT SELECT ON ALL TABLES IN SCHEMA public TO {READONLY_ROLE}")
                cur.execute(f"REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM {READONLY_ROLE}")
            cur.execute("SELECT (SELECT count(*) FROM raw_events), (SELECT count(*) FROM runs), (SELECT count(*) FROM attempts), (SELECT count(*) FROM dq_findings)")
            raw, runs, attempts, findings = cur.fetchone()
        conn.commit()
    return {"raw_events": raw, "runs": runs, "attempts": attempts, "dq_findings": findings}


if __name__ == "__main__":
    url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("Set DATABASE_URL (privileged) to seed.")
    print(json.dumps(seed(url, os.environ.get("READONLY_PASSWORD"))))
