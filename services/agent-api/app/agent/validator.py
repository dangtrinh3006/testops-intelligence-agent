"""Deterministic answer validation: the model's text must be backed by tool output and the dataset."""

from __future__ import annotations

import json
import re

from app.etl import Dataset

VERDICT_RE = re.compile(r"\b(SHIP_WITH_WARNINGS|HOLD_MANUAL_REVIEW|HOLD|BLOCK|SHIP)\b")
# "cannot SHIP", "do not BLOCK": a negated verdict word is not a verdict claim.
NEGATED_RE = re.compile(r"\b(?:cannot|can't|can not|not|never|don't|do not|no)\s+(?:be\s+)?(?:SHIP_WITH_WARNINGS|HOLD_MANUAL_REVIEW|HOLD|BLOCK|SHIP)\b", re.I)
# Ids and dates contain digits that are not claims; strip them before checking numbers.
ID_RE = re.compile(r"\b(?:run|att|rc|evt|DQ|T|R|ci|runner|artifacts)[-:][\w.:\-]+|\b\d{4}-\d{2}-\d{2}(?:[T ][\d:]+Z?)?|\b[0-9a-f]{7}\b|\bv?\d+\.\d+\.\d+\b", re.I)
NUM_RE = re.compile(r"(?<![\w.])\$?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)%?")
TRIVIAL = {"0", "1", "2", "3", "4", "100"}


def _numbers_in(obj) -> set[str]:
    text = json.dumps(obj, default=str)
    found = set()
    for m in re.finditer(r"-?\d+(?:\.\d+)?", text):
        v = m.group(0).lstrip("-")
        found.add(v)
        try:
            f = float(v)
            found.update({f"{f:g}", f"{round(f, 1):g}", f"{round(f):g}", f"{round(f * 100, 1):g}"})
        except ValueError:
            pass
    return found


def validate(answer: str, claims: list[dict], tool_results: list[dict], ds: Dataset, gate_verdicts: dict[str, str]) -> dict:
    checks = []
    returned_ids = {e for r in tool_results for e in r.get("evidence", [])}

    # 1. Every cited id exists in the dataset and was returned by a tool in this request.
    unknown, unreturned = [], []
    for c in claims:
        c.setdefault("supported", True)
        for e in c.get("evidence", []):
            if not ds.record_exists(e):
                unknown.append(e)
                c["supported"], c["note"] = False, f"cites unknown record {e}"
            elif e not in returned_ids:
                unreturned.append(e)
    checks.append({"name": "evidence_ids_resolve", "passed": not unknown,
                   "detail": "All cited ids exist." if not unknown else f"Unknown ids cited: {sorted(set(unknown))}"})
    checks.append({"name": "evidence_retrieved_this_request", "passed": not unreturned,
                   "detail": "Every cited id was returned by a tool call." if not unreturned else f"Cited without retrieval: {sorted(set(unreturned))[:6]}"})

    # 2. Claims carry evidence.
    bare = [c["text"][:60] for c in claims if not c.get("evidence")]
    checks.append({"name": "claims_have_evidence", "passed": not bare, "detail": "Each claim cites evidence." if not bare else f"{len(bare)} claim(s) without evidence"})
    for c in claims:
        if not c.get("evidence"):
            c["supported"], c["note"] = False, "no evidence cited"

    # 3. Any release verdict in the text must be one the policy function produced.
    mentioned = {m.group(1) for m in VERDICT_RE.finditer(NEGATED_RE.sub(" ", answer))}
    mentioned = {"HOLD_MANUAL_REVIEW" if v == "HOLD" else v for v in mentioned}
    # Verdicts the policy produced in this request: explicit gate calls and the gate column of run listings.
    produced = set(gate_verdicts.values()) | {r["gate_verdict"] for t in tool_results for r in t.get("runs", []) if r.get("gate_verdict")}
    stray = sorted(mentioned - produced)
    checks.append({"name": "verdict_matches_policy", "passed": not stray,
                   "detail": f"Verdicts in text {sorted(mentioned) or 'none'} vs policy {sorted(produced) or 'not evaluated'}"
                   + (f"; unsupported: {stray}" if stray else "")})

    # 4. Numbers in the answer must appear in tool output (no invented statistics).
    stripped = ID_RE.sub(" ", answer)
    known = _numbers_in(tool_results)
    unsupported = sorted({m.group(1).replace(",", "") for m in NUM_RE.finditer(stripped)} - known - TRIVIAL, key=lambda x: float(x))
    checks.append({"name": "numbers_grounded", "passed": not unsupported,
                   "detail": "Every number appears in tool output." if not unsupported else f"Numbers not found in tool output: {unsupported[:8]}"})

    return {"passed": all(c["passed"] for c in checks), "checks": checks}
