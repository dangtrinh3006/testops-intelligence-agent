"""Release check for one run: the gate verdict shaped like a CI check run (GitHub Checks style).

The conclusion maps one-to-one from the policy verdict; nothing here is model output.
"""

from __future__ import annotations

from app.etl import Dataset

from . import flaky, gate
from .evidence import run_outcomes
from .history import _cell

CONCLUSION = {"SHIP": "success", "SHIP_WITH_WARNINGS": "neutral", "HOLD_MANUAL_REVIEW": "action_required", "BLOCK": "failure"}
_LEVELS: dict[tuple[int, int], tuple[Dataset, dict[str, str]]] = {}


def flake_levels(ds: Dataset, lookback_days: int = 30) -> dict[str, str]:
    """Test id -> flake level (R3) over the window; tests with no retries or failures are absent."""
    key = (id(ds), lookback_days)
    hit = _LEVELS.get(key)
    if hit is None or hit[0] is not ds:  # datasets are immutable; the stored reference guards against id reuse
        hit = (ds, {t.test_id: t.level for t in flaky.analyze(ds, None, lookback_days)["tests"]})
        _LEVELS[key] = hit
    return hit[1]


def _md_escape(s: str) -> str:
    return s.replace("|", "\\|")


def release_check(ds: Dataset, run_id: str) -> dict:
    """`run_id` must already be resolved to a run (see tools._resolve_run)."""
    run = ds.runs[run_id]
    g = gate.evaluate(ds, run_id)
    outcomes = run_outcomes(ds, run)
    levels = flake_levels(ds)
    failures = []
    for o in outcomes:
        if o.resolution == "passed_first":
            continue
        c = _cell(o)
        failures.append({
            "test_id": o.test_id, "name": o.name, "suite": o.suite, "attempt_id": c["attempt_id"], "state": c["state"],
            "defect": c["triage"], "flake_level": levels.get(o.test_id), "error_class": c["error_class"],
        })
    counts = {
        "tests": len(outcomes),
        "failed": sum(o.final_status == "FAIL" for o in outcomes),
        "retried": sum(o.resolution == "passed_on_retry" for o in outcomes),
        "incomplete": sum(o.final_status == "INCOMPLETE" for o in outcomes),
    }
    n = len(failures)
    title = f"{g.verdict} · rule {g.deciding_rule} · {n} test{'s' if n != 1 else ''} need{'s' if n == 1 else ''} attention"
    return {
        "run_id": run_id, "service_id": run.service_id, "pipeline_id": run.pipeline_id, "commit": run.commit, "branch": run.branch,
        "verdict": g.verdict, "deciding_rule": g.deciding_rule, "policy_id": g.policy_id, "rules_version": g.rules_version,
        "conclusion": CONCLUSION[g.verdict], "title": title,
        "summary_markdown": _markdown(run_id, run.service_id, run.commit, g, failures, counts),
        "counts": counts, "failures": failures,
    }


def _markdown(run_id: str, service_id: str, commit: str, g: gate.GateResult, failures: list[dict], counts: dict) -> str:
    lines = [
        f"### Release gate: **{g.verdict}** (rule {g.deciding_rule})",
        "",
        f"`{run_id}` · {service_id} · commit `{commit}` · {counts['tests']} tests, {counts['failed']} failed, "
        f"{counts['retried']} passed on retry, {counts['incomplete']} without a result",
        "",
    ]
    triggered = [c for c in g.checks if c.triggered]
    if triggered:
        lines += [f"- **{c.condition}** ({c.rule}): {_md_escape(c.detail)}" for c in triggered] + [""]
    if failures:
        lines += ["| Test | State | Defect type | Flake level | Attempt |", "|---|---|---|---|---|"]
        for f in failures:
            defect = f"{f['defect']['code']} {f['defect']['label']}" if f["defect"] else "–"
            lines.append(f"| `{f['test_id']}` {_md_escape(f['name'])} | {f['state']} | {defect} | {f['flake_level'] or '–'} | `{f['attempt_id']}` |")
        lines.append("")
    else:
        lines += ["Every test passed on its first attempt.", ""]
    lines += [
        f"The verdict comes from `{g.policy_id}`, a deterministic policy function, not from a language model.",
        "",
        f"<sub>TestOps Intelligence Agent · rules {g.rules_version}</sub>",
    ]
    return "\n".join(lines)
