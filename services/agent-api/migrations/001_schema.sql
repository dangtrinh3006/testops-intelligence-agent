-- TestOps Intelligence Agent: storage schema.
-- raw_events is append-only evidence; every other table is derived by the ETL and can be rebuilt.

CREATE TABLE IF NOT EXISTS catalog (
    id          text PRIMARY KEY,
    document    jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw_events (
    ingest_id    bigint PRIMARY KEY,           -- order of arrival at our ingestion endpoint
    event_id     text NOT NULL,                -- identity assigned by the source; NOT unique (redeliveries happen)
    source       text NOT NULL CHECK (source IN ('ci', 'runner', 'artifacts')),
    event_type   text NOT NULL,
    payload      jsonb NOT NULL,               -- exactly as received
    received_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS raw_events_event_id_idx ON raw_events (event_id);
CREATE INDEX IF NOT EXISTS raw_events_run_idx ON raw_events ((payload->>'run_id'));

-- Normalised views of the same evidence. Raw value and normalised value are stored side by side.
CREATE TABLE IF NOT EXISTS runs (
    run_id          text PRIMARY KEY,
    pipeline_id     text NOT NULL,
    service_id      text NOT NULL,
    run_number      int  NOT NULL,
    commit_sha      text NOT NULL,
    queued_raw      text,
    queued_utc      timestamptz,
    source_event_id text NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_service_queued_idx ON runs (service_id, queued_utc DESC);
CREATE INDEX IF NOT EXISTS runs_pipeline_queued_idx ON runs (pipeline_id, queued_utc DESC);

CREATE TABLE IF NOT EXISTS ci_summaries (
    run_id          text PRIMARY KEY REFERENCES runs (run_id),
    status          text,           -- PASS | FAIL | UNKNOWN
    status_raw      text,
    finished_raw    text,
    finished_utc    timestamptz,
    finished_format text,
    source_event_id text NOT NULL,
    ingest_id       bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
    attempt_id        text PRIMARY KEY,
    run_id            text NOT NULL REFERENCES runs (run_id),
    test_id           text NOT NULL,
    attempt_no        int  NOT NULL,
    status            text,          -- NULL = started, never reported a result
    started_raw       text,
    started_utc       timestamptz,
    finished_raw      text,
    finished_utc      timestamptz,  -- NULL when the source omitted it; duration is never imputed
    error_class       text,
    message           text,
    result_event_id   text,
    result_ingest_ids bigint[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS attempts_run_idx ON attempts (run_id);
CREATE INDEX IF NOT EXISTS attempts_test_idx ON attempts (test_id, run_id);

CREATE TABLE IF NOT EXISTS log_lines (
    event_id    text PRIMARY KEY,
    run_id      text NOT NULL,
    attempt_id  text,
    ts_raw      text,
    ts_utc      timestamptz,
    level       text,
    message     text            -- untrusted text from the CI system
);
CREATE INDEX IF NOT EXISTS log_lines_run_idx ON log_lines (run_id);

CREATE TABLE IF NOT EXISTS dq_findings (
    id          text PRIMARY KEY,
    kind        text NOT NULL,
    severity    text NOT NULL,
    detail      text NOT NULL,
    record_ids  text[] NOT NULL,
    count       int NOT NULL
);
