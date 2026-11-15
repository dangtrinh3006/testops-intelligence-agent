"""Postgres path gives the same answers as the fixtures, and the agent's role cannot write (needs TEST_DATABASE_URL)."""

import os

import pytest

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = [pytest.mark.db, pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")]
RO_PASSWORD = "parity-reader-not-secret"


@pytest.fixture(scope="module")
def db_dataset():
    from app import store
    from app.seed import seed

    first = seed(URL, RO_PASSWORD)
    assert seed(URL, RO_PASSWORD) == first  # idempotent
    ro = URL.replace(URL.split("//", 1)[1].split("@", 1)[0], f"testops_reader:{RO_PASSWORD}")
    os.environ["DATABASE_URL_READONLY"], os.environ["TESTOPS_DATA_SOURCE"] = ro, "db"
    store.reset_cache()
    try:
        ds, source = store.dataset()
        yield ds, source, ro
    finally:
        os.environ.pop("DATABASE_URL_READONLY")
        os.environ["TESTOPS_DATA_SOURCE"] = "fixtures"
        store.reset_cache()


def test_same_verdicts_and_flake_levels_as_fixtures(ds, db_dataset):
    from app.domain import flaky, gate

    db, source, _ = db_dataset
    assert source == "postgres" and db.raw_event_count == ds.raw_event_count
    for rid in ds.runs:
        assert gate.evaluate(db, rid).verdict == gate.evaluate(ds, rid).verdict, rid
    assert [(t.test_id, t.level) for t in flaky.analyze(db)["tests"]] == [(t.test_id, t.level) for t in flaky.analyze(ds)["tests"]]


def test_reader_role_cannot_write(db_dataset):
    import psycopg

    _, _, ro = db_dataset
    with psycopg.connect(ro) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("DELETE FROM raw_events")
