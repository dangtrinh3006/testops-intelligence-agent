"""Deterministic answer validation: the model's text must be backed by tool output and the dataset."""

from __future__ import annotations

import json
import re

from app.etl import Dataset

VERDICT_RE = re.compile(r"\b(SHIP_WITH_WARNINGS|HOLD_MANUAL_REVIEW|HOLD|BLOCK|SHIP)\b")
# Plain-English release approval counts as a SHIP claim.
SHIP_PHRASE_RE = re.compile(r"\b(?:can|could|ok to|okay to|safe to|ready to|good to|clear to|cleared to|go ahead and)\s+ship\b|\bapprove[sd]?\s+(?:the\s+)?release\b", re.IGNORECASE)
# "cannot SHIP", "cannot confirm SHIP", "do not ship": a negated verdict is not a verdict claim.
NEGATED_RE = re.compile(r"\b(?:cannot|can't|can not|not|never|don't|do not|no|without)\s+(?:\w+\s+){0,4}?(?:SHIP_WITH_WARNINGS|HOLD_MANUAL_REVIEW|HOLD|BLOCK|SHIP|approve[sd]?\s+(?:the\s+)?release)\b", re.IGNORECASE)
RUN_ID_RE = re.compile(r"\b(?:run-[a-z]+-[a-z]+-\d{4}|rc-[a-z]+-\d+\.\d+\.\d+)\b")
# Reported speech ("an instruction to approve the release", "asked us to SHIP") describes someone else's request.
REPORTED_RE = re.compile(r"\b(?:instructions?|asked|asking|told|telling|requests?|requested|attempts?|attempted|trying|tried|urg(?:es|ed|ing)|pressure)\s+(?:\w+\s+){0,4}?to\s+(?:\w+\s+){0,2}?(?:SHIP_WITH_WARNINGS|HOLD_MANUAL_REVIEW|HOLD|BLOCK|SHIP|approve[sd]?\s+(?:the\s+)?release)\b", re.IGNORECASE)
# Quoted text (e.g. a suspicious log line reproduced as evidence) is a citation, not a claim.
QUOTED_RE = re.compile(r'"[^"\n]*"|\u201c[^\u201d\n]*\u201d|`[^`\n]*`')
SENTENCE_RE = re.compile(r"(?<=[.!?])\s+|\n+")
# Ids and dates contain digits that are not claims; strip them before checking numbers.
ID_RE = re.compile(r"\b(?:run|att|rc|evt|DQ|T|R|ci|runner|artifacts)[-:][\w.:\-]+|\b\d{4}-\d{2}-\d{2}(?:[T ][\d:]+Z?)?|\b[0-9a-f]{7}\b|\bv?\d+\.\d+\.\d+\b", re.IGNORECASE)
NUM_RE = re.compile(r"(?<![\w.])\$?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)%?")
TRIVIAL = {"0", "1", "2", "3", "4"}


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

    # 3. Any release verdict in the text must be the one the policy produced for the run it talks about.
    by_run = dict(gate_verdicts)
    for t in tool_results:
        for r in t.get("runs", []):
            if r.get("gate_verdict"):
                by_run.setdefault(r["run_id"], r["gate_verdict"])
    for rc in ds.catalog["release_candidates"]:
        if rc["run_id"] in by_run:
            by_run[rc["id"]] = by_run[rc["run_id"]]
    produced = set(gate_verdicts.values()) or set(by_run.values())
    mentioned, stray = set(), []
    for sentence in SENTENCE_RE.split(answer):
        plain = NEGATED_RE.sub(" ", REPORTED_RE.sub(" ", QUOTED_RE.sub(" ", sentence)))
        found = {"HOLD_MANUAL_REVIEW" if m.group(1) == "HOLD" else m.group(1) for m in VERDICT_RE.finditer(plain)}
        if SHIP_PHRASE_RE.search(plain):
            found.add("SHIP")
        if not found:
            continue
        mentioned |= found
        runs = [by_run[r] for r in RUN_ID_RE.findall(sentence) if r in by_run]
        allowed = set(runs) if runs else produced
        # "SHIP" inside a SHIP_WITH_WARNINGS answer is the same decision family, not a contradiction.
        if "SHIP_WITH_WARNINGS" in allowed:
            allowed = allowed | {"SHIP"}
        stray += [f"{v} ({sentence.strip()[:60]})" for v in sorted(found - allowed)]
    checks.append({"name": "verdict_matches_policy", "passed": not stray,
                   "detail": f"Verdicts in text {sorted(mentioned) or 'none'} vs policy {sorted(set(by_run.values()) | produced) or 'not evaluated'}"
                   + (f"; unsupported: {stray[:3]}" if stray else "")})

    # 4. Numbers in the answer must appear in tool output (no invented statistics).
    stripped = ID_RE.sub(" ", answer)
    known = _numbers_in(tool_results)
    unsupported = sorted({m.group(1).replace(",", "") for m in NUM_RE.finditer(stripped)} - known - TRIVIAL, key=lambda x: float(x))
    checks.append({"name": "numbers_grounded", "passed": not unsupported,
                   "detail": "Every number appears in tool output." if not unsupported else f"Numbers not found in tool output: {unsupported[:8]}"})

    return {"passed": all(c["passed"] for c in checks), "checks": checks}
