"""Commit view for developers: which failures on a commit are likely theirs (shift-left triage).

Attribution of each non-clean test outcome on the commit, first match wins:
1. infrastructure     - the failing attempts are INFRA or EXTERNAL_DEPENDENCY only (R1).
2. known_flaky        - the test's flake level in the 30-day window is proven or suspected (R3).
3. likely_this_change - final failure with PRODUCT_ASSERTION or TEST_CODE, and the previous run of the same
                        pipeline passed that test; evidence holds both attempt ids.
4. unknown            - anything else, including results that never arrived (R6): never guessed.
Attribution is a triage hint for the author; the release verdict still comes only from the gate.
"""

from __future__ import annotations

from app.etl import Dataset, Run

from . import gate
from .checks import flake_levels
from .evidence import TestOutcome, run_outcomes
from .history import _cell
from .knowledge import NON_TEST_CATEGORIES, category

VERDICT_RANK = {"SHIP": 0, "SHIP_WITH_WARNINGS": 1, "HOLD_MANUAL_REVIEW": 2, "BLOCK": 3}
CHANGE_CATEGORIES = {"PRODUCT_ASSERTION", "TEST_CODE"}
MIN_PREFIX = 7


def _key(r: Run) -> tuple[str, str]:
    return (r.queued.iso() or "", r.run_id)


def list_commits(ds: Dataset, limit: int = 20) -> list[dict]:
    by_commit: dict[str, list[Run]] = {}
    for r in ds.runs.values():
        by_commit.setdefault(r.commit, []).append(r)
    rows = []
    for sha, runs in by_commit.items():
        verdicts = [gate.evaluate(ds, r.run_id).verdict for r in runs]
        latest = max(runs, key=_key)
        rows.append({
            "commit": sha, "branch": latest.branch, "service_ids": sorted({r.service_id for r in runs}), "runs": len(runs),
            "worst_verdict": max(verdicts, key=VERDICT_RANK.__getitem__), "latest_queued_utc": latest.queued.iso(),
        })
    rows.sort(key=lambda x: (x["latest_queued_utc"] or "", x["commit"]), reverse=True)
    return rows[:limit]


def resolve_commit(ds: Dataset, sha: str) -> str | None:
    """Full commit for a unique prefix of at least MIN_PREFIX characters; None if unknown or ambiguous."""
    sha = sha.strip().lower()
    if len(sha) < MIN_PREFIX:
        return None
    matches = {r.commit for r in ds.runs.values() if r.commit.lower().startswith(sha)}
    return matches.pop() if len(matches) == 1 else None


def _previous_run(ds: Dataset, run: Run) -> Run | None:
    earlier = [r for r in ds.runs.values() if r.pipeline_id == run.pipeline_id and _key(r) < _key(run)]
    return max(earlier, key=_key) if earlier else None


def _attribute(ds: Dataset, run: Run, o: TestOutcome, levels: dict[str, str]) -> tuple[str, str, list[str]]:
    failing = [a for a in o.attempts if a.status in ("FAIL", "ERROR")]
    ids = [a.attempt_id for a in o.attempts]
    cats = {category(a.error_class) for a in failing}
    if failing and cats <= NON_TEST_CATEGORIES:
        return "infrastructure", f"Failed attempts are {', '.join(sorted(c for c in cats if c))} only: platform, not the change (R1).", ids
    level = levels.get(o.test_id)
    if level in ("proven", "suspected"):
        return "known_flaky", f"Flake level {level} in the last 30 days (R3): a known nondeterministic test.", ids
    if o.final_status == "FAIL" and category(o.attempts[-1].error_class) in CHANGE_CATEGORIES:
        prev = _previous_run(ds, run)
        if prev:
            before = next((p for p in run_outcomes(ds, prev) if p.test_id == o.test_id), None)
            if before and before.final_status == "PASS":
                return ("likely_this_change",
                        f"Failed on every attempt here and passed in the previous {run.pipeline_id} run ({prev.run_id}, commit {prev.commit}).",
                        [*ids, before.final_attempt_id])
            return "unknown", f"Failed here, but the previous {run.pipeline_id} run did not pass it either.", ids
        return "unknown", "Failed here; there is no earlier run of this pipeline to compare.", ids
    if o.final_status == "INCOMPLETE":
        return "unknown", "The last attempt never reported a result (R6): cause not determinable.", ids
    if o.resolution == "passed_on_retry":
        return "unknown", "Failed, then passed on retry: possible flakiness (R3), not enough history to say more.", ids
    return "unknown", "Not enough evidence to attribute.", ids


def commit_assessment(ds: Dataset, sha: str) -> dict:
    runs = sorted((r for r in ds.runs.values() if r.commit == sha), key=_key)
    levels = flake_levels(ds)
    assessment = []
    for run in runs:
        for o in run_outcomes(ds, run):
            if o.resolution == "passed_first":
                continue
            attribution, reason, evidence = _attribute(ds, run, o, levels)
            c = _cell(o)
            assessment.append({
                "test_id": o.test_id, "name": o.name, "run_id": run.run_id, "state": c["state"], "defect": c["triage"],
                "attribution": attribution, "reason": reason, "evidence": evidence,
            })
    summary = {k: 0 for k in ("likely_this_change", "known_flaky", "infrastructure", "unknown")}
    for a in assessment:
        summary[a["attribution"]] += 1
    return {
        "commit": sha, "branch": runs[-1].branch if runs else None,
        "runs": [{"run_id": r.run_id, "service_id": r.service_id, "pipeline_id": r.pipeline_id,
                  "verdict": gate.evaluate(ds, r.run_id).verdict, "queued_utc": r.queued.iso()} for r in runs],
        "assessment": assessment, "summary": summary,
    }
