"""Acceptance 1-4 and 12: dirty data is handled, never hidden, and the dataset is reproducible."""

import hashlib
from pathlib import Path

from app.etl import parse_ts
from app.store import DATA_DIR
from app.synthetic.generate import write


def test_missing_finished_at_never_gets_an_invented_duration(ds):
    a = next(x for x in ds.attempts if x.attempt_id == "att-chk-main-0418-T-CHK-002-1")
    assert a.status == "PASS"
    assert a.finished.utc is None and a.finished.fmt == "missing"
    assert a.duration_s is None
    assert any(f.kind == "MISSING_FINISHED_AT" and a.attempt_id in f.record_ids for f in ds.findings)


def test_mixed_timestamp_formats_normalise_to_the_same_utc_instant():
    iso_offset = parse_ts("2026-11-13T16:12:05+07:00")
    iso_z = parse_ts("2026-11-13T09:12:05Z")
    epoch_s = parse_ts(1794561125)
    epoch_ms = parse_ts(1794561125000)
    naive = parse_ts("2026-11-13 09:12:05")
    assert {s.utc for s in (iso_offset, iso_z, epoch_s, epoch_ms, naive)} == {iso_z.utc}
    assert [s.fmt for s in (iso_offset, iso_z, epoch_s, epoch_ms, naive)] == ["iso-offset", "iso-z", "epoch-s", "epoch-ms", "naive-assumed-utc"]
    assert iso_offset.raw == "2026-11-13T16:12:05+07:00"  # original preserved
    assert parse_ts("13/11/2026").fmt == "unparseable" and parse_ts("13/11/2026").utc is None


def test_duplicate_raw_events_are_counted_once_but_kept(ds):
    assert ds.raw_event_count - ds.unique_event_count == 2
    dup = [f for f in ds.findings if f.kind == "DUPLICATE_EVENT"]
    assert len(dup) == 2 and all(f.count == 2 for f in dup)
    a = next(x for x in ds.attempts if x.attempt_id == "att-chk-main-0403-T-CHK-011-1")
    assert len(a.result_ingest_ids) == 2  # both ingests are traceable
    assert sum(1 for x in ds.attempts if x.attempt_id == a.attempt_id) == 1


def test_incomplete_attempt_and_missing_summary_are_reported(ds):
    kinds = {f.kind for f in ds.findings}
    assert {"INCOMPLETE_ATTEMPT", "MISSING_CI_SUMMARY", "STATUS_VOCABULARY", "NAIVE_TIMESTAMP", "MIXED_TIMESTAMP_FORMATS"} <= kinds
    inc = next(x for x in ds.attempts if x.attempt_id == "att-pay-main-0233-T-PAY-004-2")
    assert inc.status is None and not inc.terminal
    assert ds.runs["run-inv-main-0144"].summary is None


def test_summary_vocabulary_is_normalised_with_raw_kept(ds):
    s = ds.runs["run-pay-main-0233"].summary
    assert (s.status, s.status_raw) == ("PASS", "passed")
    sup = ds.runs["run-sup-eval-0030"].summary
    assert sup.status == "PASS" and sup.status_raw == "SUCCESS" and sup.started.fmt == "epoch-ms"


def test_generator_is_deterministic_and_matches_committed_fixtures(tmp_path: Path):
    write(tmp_path)
    for name in ("catalog.json", "raw_events.jsonl"):
        fresh = hashlib.sha256((tmp_path / name).read_bytes()).hexdigest()
        committed = hashlib.sha256((DATA_DIR / name).read_bytes()).hexdigest()
        assert fresh == committed, f"{name} drifted from the generator; run scripts/generate_data.py"
