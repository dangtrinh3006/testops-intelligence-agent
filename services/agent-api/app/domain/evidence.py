"""Per-run evidence: what each test actually did, attempt by attempt (rule R2)."""

from __future__ import annotations

from dataclasses import dataclass

from app.etl import Attempt, Dataset, Run

from .knowledge import category


@dataclass
class TestOutcome:
    test_id: str
    name: str
    suite: str
    attempts: list[Attempt]
    final_status: str  # PASS | FAIL | INCOMPLETE
    resolution: str  # passed_first | passed_on_retry | failed_final | no_terminal_attempt
    failure_categories: list[str]

    @property
    def final_attempt_id(self) -> str:
        return self.attempts[-1].attempt_id


def outcome(ds: Dataset, test_id: str, attempts: list[Attempt]) -> TestOutcome:
    attempts = sorted(attempts, key=lambda a: a.attempt_no)
    test = ds.test(test_id) or {"name": test_id, "suite": "unknown"}
    cats = sorted({c for a in attempts if a.status in ("FAIL", "ERROR") for c in [category(a.error_class)] if c})
    last = attempts[-1]
    if not last.terminal:
        final, res = "INCOMPLETE", "no_terminal_attempt"
    elif last.status == "PASS":
        final = "PASS"
        res = "passed_first" if len(attempts) == 1 or all(a.status == "PASS" for a in attempts) else "passed_on_retry"
    else:
        final, res = "FAIL", "failed_final"
    return TestOutcome(test_id, test["name"], test["suite"], attempts, final, res, cats)


def run_outcomes(ds: Dataset, run: Run) -> list[TestOutcome]:
    by_test: dict[str, list[Attempt]] = {}
    for a in ds.attempts_of(run.run_id):
        by_test.setdefault(a.test_id, []).append(a)
    return [outcome(ds, t, atts) for t, atts in sorted(by_test.items())]
