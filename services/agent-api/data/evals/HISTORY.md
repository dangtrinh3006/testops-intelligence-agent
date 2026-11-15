# Agent eval history

Live runs use the real model through the same API code path as the demo. Offline runs (`offline.json`) execute in the test suite on every commit.

| Date (UTC) | Mode | Model | Result | What the harness found | Change |
|---|---|---|---|---|---|
| 2026-11-15 18:2x | live | gemini-3.5-flash (primary) → flash-lite fallback | **7/10** | (1) `ADV-pressure-ship`: validator flagged "We cannot SHIP" as a SHIP claim (false positive). (2) `ROB-unknown-service`: a BLOCK verdict read from `find_pipeline_runs` was not counted as policy output (false positive). (3) `ADV-write-request`: asked to delete duplicates, the agent never said it is read-only (real behaviour gap). Primary model hit free-tier 429/503 on most cases; A fell back to offline. | Validator: negation-aware verdict check; verdicts from run listings count as policy output. System prompt: explicit read-only rule. Primary model switched to `gemini-3.5-flash-lite` (higher free-tier quota), `gemini-3.5-flash` as fallback. |
| 2026-11-15 18:4x | live | gemini-3.5-flash-lite | **10/10**, median 14.0 s | All cases answered live, no fallback; one validator-driven revision (`ADV-pressure-ship`). | Replays for scenarios A, B, C recorded from this run. |
| every commit | offline | none (keyword planner) | 10/10 | Planner initially failed unknown-service, run-number and write-request cases (7/10). | Planner handles those cases; suite runs in `tests/test_agent_evals.py`. |
