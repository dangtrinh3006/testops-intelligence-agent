"""Flakiness analysis over attempt history (rules R1, R3, R6). Pure and reproducible."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.etl import Dataset

from .evidence import run_outcomes
from .knowledge import NON_TEST_CATEGORIES, category

LEVEL_ORDER = {"proven": 0, "suspected": 1, "possible": 2, "consistent_failure": 3, "infra_only": 4}


@dataclass
class TestFlakiness:
    test_id: str
    name: str
    service_id: str
    suite: str
    runs_observed: int
    first_attempt_failures: int
    retry_passes_test: int  # non-infra fail-then-pass series
    retry_passes_infra: int  # INFRA / EXTERNAL_DEPENDENCY fail-then-pass series
    final_failures: int
    incomplete_runs_excluded: int
    mixed_outcome_commits: list[str]
    level: str
    error_classes: list[str]
    retry_minutes_measured: float  # CI time spent on attempts >= 2 (measured durations only)
    retry_attempts_without_duration: int
    evidence: list[str] = field(default_factory=list)

    @property
    def first_attempt_failure_rate(self) -> float:
        return round(self.first_attempt_failures / self.runs_observed, 3) if self.runs_observed else 0.0


def analyze(ds: Dataset, service_id: str | None = None, lookback_days: int = 30) -> dict:
    as_of = datetime.fromisoformat(ds.catalog["as_of"].replace("Z", "+00:00"))
    since = as_of - timedelta(days=lookback_days)
    runs = [r for r in ds.runs.values() if (service_id is None or r.service_id == service_id) and r.queued.utc and r.queued.utc >= since]

    per_test: dict[str, dict] = defaultdict(lambda: {
        "runs": 0, "first_fail": 0, "rp_test": 0, "rp_infra": 0, "rp_infra_final": 0, "final_fail": 0, "incomplete": 0,
        "commits": defaultdict(set), "classes": set(), "retry_s": 0.0, "retry_missing": 0, "evidence": [],
    })
    for run in sorted(runs, key=lambda r: r.run_id):
        for o in run_outcomes(ds, run):
            t = per_test[o.test_id]
            if o.final_status == "INCOMPLETE":
                t["incomplete"] += 1  # unknown outcome: excluded from rates, never guessed
                continue
            t["runs"] += 1
            t["commits"][run.commit].add(o.final_status)
            first = o.attempts[0]
            if first.status in ("FAIL", "ERROR"):
                t["first_fail"] += 1
            for a in o.attempts:
                if a.error_class:
                    t["classes"].add(a.error_class)
                if a.attempt_no >= 2:
                    if a.duration_s is None:
                        t["retry_missing"] += 1
                    else:
                        t["retry_s"] += a.duration_s
            if o.resolution == "passed_on_retry":
                if set(o.failure_categories) <= NON_TEST_CATEGORIES:
                    t["rp_infra"] += 1
                else:
                    t["rp_test"] += 1
                t["evidence"].append(o.attempts[0].attempt_id)
            elif o.final_status == "FAIL":
                last_cat = category(o.attempts[-1].error_class)
                if last_cat in NON_TEST_CATEGORIES:
                    t["rp_infra_final"] += 1  # platform failed on the final attempt: not a product or test failure (R1)
                else:
                    t["final_fail"] += 1
                t["evidence"].append(o.final_attempt_id)

    results: list[TestFlakiness] = []
    for test_id, t in per_test.items():
        mixed = sorted(c for c, statuses in t["commits"].items() if {"PASS", "FAIL"} <= statuses)
        if mixed:
            level = "proven"
        elif t["rp_test"] >= 2:
            level = "suspected"
        elif t["rp_test"] == 1:
            level = "possible"
        elif t["final_fail"]:
            level = "consistent_failure"
        elif t["rp_infra"] or t["rp_infra_final"]:
            level = "infra_only"
        else:
            continue
        meta = ds.test(test_id) or {}
        results.append(TestFlakiness(
            test_id, meta.get("name", test_id), meta.get("service_id", "?"), meta.get("suite", "?"), t["runs"], t["first_fail"],
            t["rp_test"], t["rp_infra"], t["final_fail"], t["incomplete"], mixed, level, sorted(t["classes"]),
            round(t["retry_s"] / 60, 1), t["retry_missing"], t["evidence"][:12],
        ))
    results.sort(key=lambda r: (LEVEL_ORDER[r.level], -r.retry_passes_test - r.retry_passes_infra, r.test_id))

    dup = [f for f in ds.findings if f.kind == "DUPLICATE_EVENT"]
    return {
        "scope": {"service_id": service_id or "all", "lookback_days": lookback_days, "as_of": ds.catalog["as_of"], "runs_analyzed": len(runs)},
        "tests": results,
        "totals": {
            "retry_pass_series_test": sum(r.retry_passes_test for r in results),
            "retry_pass_series_infra": sum(r.retry_passes_infra for r in results),
            "retry_minutes_measured": round(sum(r.retry_minutes_measured for r in results), 1),
            "incomplete_runs_excluded": sum(r.incomplete_runs_excluded for r in results),
        },
        "data_handling": [
            f"{len(dup)} duplicate raw events were counted once (findings {', '.join(f.id for f in dup)}).",
            "Runs where a test never reported a final result are excluded from its rates, not counted as pass or fail.",
            "Retry minutes use measured durations only; attempts without an end time are listed, not imputed.",
            "INFRA / EXTERNAL_DEPENDENCY retries are reported separately and do not raise a test's flake level (R1).",
        ],
    }
