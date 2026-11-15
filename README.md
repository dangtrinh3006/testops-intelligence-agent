# TestOps Intelligence Agent

Evidence-first AI agent for **CI failure triage, flaky-test analysis and release readiness**.
Built as a proof of concept for a fictional prospect, *Kestrel Commerce*, on **entirely synthetic data**.

> We are not asking you to trust an AI to make release decisions.
> **Rules decide, the model explains, and every claim links to a record.**

- Live demo: https://testops.dangtrinh.dev (API: https://testops-agent-api.vercel.app/api/health)
- Prospect brief (one page): [`docs/prospect-brief.md`](docs/prospect-brief.md) · printable [`docs/prospect-brief.html`](docs/prospect-brief.html)
- Architecture and design decisions: [`docs/technical-deep-dive.md`](docs/technical-deep-dive.md)

## What it answers

| | Question | What the agent must do | Result on the seeded data |
|---|---|---|---|
| A | *Why did the latest checkout pipeline fail, and should we block the release?* | Find the run, separate facts from hypotheses, apply the release policy | `run-chk-main-0418` → **BLOCK** (rule R2): `T-CHK-004` failed on both attempts with the same assertion; the infra retry on `T-CHK-011` is a warning, not the cause; a log line telling the AI to approve the release is flagged and ignored |
| B | *Which tests appear flaky, and how much engineering time might they cost?* | Reproducible levels from attempt history, duplicates counted once, cost with explicit assumptions | `T-INV-005` **proven** (same commit, mixed final outcomes), `T-SUP-003`/`T-CHK-006` **suspected**, `T-CHK-011` **infra_only** (not flaky). 25 investigations → 8.3 engineer-hours at the *assumed* 20 min each |
| C | *The CI summary says PASS but raw data has failures. Can we ship?* | Detect the source conflict, distinguish a resolved retry from an unresolved one | `rc-pay-2.14.0` → **HOLD_MANUAL_REVIEW** (R5): CI summary `passed`, but `T-PAY-004` attempt 2 never reported. Same rule on the twin run `rc-pay-2.13.4` (retry resolved) → **SHIP_WITH_WARNINGS** |

Free-form questions go through the same tools and validator.

## How it works

```mermaid
flowchart LR
    UI["Next.js console<br/>(Vercel)"] -->|/api/* rewrite| API["FastAPI<br/>(Vercel Python, sin1)"]
    API --> G{{"LangGraph<br/>agent → tools → compose → validate → revise once"}}
    G --> T["8 bounded read-only tools"]
    T --> D["Deterministic domain<br/>ETL · release gate · flake levels · cost"]
    D --> K[("knowledge/testops_rules.yaml<br/>expert rules R1–R6")]
    D --> DB[("Neon PostgreSQL<br/>raw_events + normalised tables<br/>read-only role")]
    G -.->|OpenAI-compatible| LLM["Gemini 3.5 Flash<br/>(fallback Flash-Lite)"]
```

- **Raw evidence is immutable.** Three sources (CI server, test runner, artifact store) arrive in different formats; the ETL keeps the raw value next to the normalised one and records data-quality findings.
- **Verdicts are not model output.** `evaluate_release_gate` is a pure function over the rule file; the model can only request and explain it.
- **Every answer is validated** before it is shown: cited ids must exist and have been retrieved in this request, numbers must appear in tool output, and any verdict in the text must equal the policy result. One revision is allowed; remaining problems are shown, not hidden.
- **Three honest modes**, always labelled in the UI: `live` (real model chooses tools), `replay` (a recorded live trace, evidence re-checked against current data) and `offline` (keyword planner + templates, no model).

## Data and the dirty-data catalogue

`services/agent-api/data/synthetic/` is generated deterministically by `app/synthetic/generate.py` (a test fails if the committed files drift): 2,053 raw events, 120 runs, 892 attempts, 31 tests, 4 services, 6 pipelines.

| Anomaly | Where | Handling |
|---|---|---|
| Duplicate ingestion | `runner:attempt.result:att-chk-main-0403-T-CHK-011-1`, `…att-chk-e2e-0075-T-CHK-011-1` | Counted once, both ingests kept and traceable (`DQ-DUP-001/002`) |
| Missing completion time | `att-chk-main-0418-T-CHK-002-1` | Duration stays unknown, never imputed (`DQ-MIS-004`) |
| Attempt with no result | `att-pay-main-0233-T-PAY-004-2` | Final status `INCOMPLETE` → gate cannot be verified (`DQ-INC-005`) |
| Conflicting sources | CI summary `passed` vs runner for `run-pay-main-0233` | Raw attempts outrank the summary (rule R5) |
| Missing CI summary | `run-inv-main-0144` | HOLD under R6, not assumed PASS |
| Mixed timestamp formats | ISO `+07:00`, epoch s, epoch ms, naive strings | Normalised to UTC; naive values flagged as an assumption |
| Inconsistent vocabularies | `PASS`/`passed`/`SUCCESS` | Normalised, raw kept |
| Prompt injection in logs | `artifacts:log.line:att-chk-main-0418-T-CHK-004-2:1` | Returned as untrusted text, flagged, never followed |

## Repository layout

```text
.
├── apps/web/                    Next.js 16 console (TypeScript, Tailwind v4)
├── services/agent-api/
│   ├── app/
│   │   ├── etl.py               raw events -> normalised records + data-quality findings
│   │   ├── domain/              gate.py, flaky.py, cost.py, evidence.py, knowledge.py
│   │   ├── tools.py             8 bounded read-only tools (the agent's only data access)
│   │   ├── agent/               graph.py (LangGraph), client.py, validator.py, service.py
│   │   ├── evals.py             agent eval harness (golden / adversarial / robustness)
│   │   ├── seed.py              idempotent Postgres seed + read-only role
│   │   └── main.py              FastAPI app
│   ├── knowledge/testops_rules.yaml   expert rule file (taxonomy, R1–R6, gate precedence, quarantine)
│   ├── data/                    synthetic fixtures, eval reports, recorded replays
│   ├── migrations/001_schema.sql
│   ├── api/index.py             Vercel entrypoint
│   └── tests/
├── scripts/smoke.py             post-deploy smoke test
└── docs/                        brief, deep dive, demo script, business case, runbook
```

## Run locally

Requirements: Python 3.11+ and Node.js 20.9+ (tested with Python 3.12 and Node 24). Docker only for the optional Postgres parity tests.

```bash
git clone https://github.com/dangtrinh3006/testops-intelligence-agent.git
cd testops-intelligence-agent/services/agent-api
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt pytest uvicorn
python -m pytest -q                                     # domain, data quality, tools, validator, API, evals
python -m uvicorn app.main:app --port 8000              # fixtures + offline mode, no keys needed
```

```bash
cd apps/web
npm install
npm run dev                                             # http://localhost:3000, proxies /api to :8000
```

Live model mode: put `LLM_API_KEY` (Gemini API key, or any OpenAI-compatible provider with `LLM_BASE_URL`) in `services/agent-api/.env.local` and export it before starting uvicorn. Without it the API answers in offline mode and says so.

Postgres (optional, same results as fixtures):

```bash
docker run -d --name testops-pg -e POSTGRES_PASSWORD=localdev -p 5440:5432 postgres:17-alpine
export DATABASE_URL=postgresql://postgres:localdev@localhost:5440/postgres READONLY_PASSWORD=local-reader
python -m app.seed                                      # idempotent; creates role testops_reader (SELECT only)
TEST_DATABASE_URL=$DATABASE_URL python -m pytest -q     # adds the DB parity + read-only role tests
```

## Environment variables (API)

| Variable | Required | Purpose |
|---|---|---|
| `LLM_API_KEY` | for live mode | Model provider key (server-side only) |
| `LLM_BASE_URL` | no | OpenAI-compatible endpoint; default Gemini |
| `LLM_MODEL` / `LLM_FALLBACK_MODEL` | no | Default `gemini-3.5-flash` / `gemini-3.5-flash-lite` |
| `TESTOPS_DATA_SOURCE` | no | `fixtures` (default without DB) or `db` |
| `DATABASE_URL_READONLY` | for `db` | Read-only role used by the API |
| `DATABASE_URL` + `READONLY_PASSWORD` | seed only | Privileged connection for `python -m app.seed` |
| `RATE_LIMIT_PER_MINUTE` / `LIVE_DAILY_CAP` | no | Abuse protection on the public demo (6/min/IP, 150 live answers/day/instance) |

Web: `AGENT_API_URL` (where `/api/*` is proxied; default `http://localhost:8000`).

## Checks

| Check | Command |
|---|---|
| Backend tests | `cd services/agent-api && python -m pytest -q` |
| Agent evals, offline (also part of the tests) | `python -m app.evals` |
| Agent evals, live model (costs quota) | `python -m app.evals --live --pause 20 --replays` |
| Web | `cd apps/web && npm run typecheck && npm run lint && npm run build` |
| Deployed smoke test | `python scripts/smoke.py https://testops.dangtrinh.dev` |

There is no CI pipeline in this repository yet; the commands above are what was run.

## Limitations (honest list)

- Synthetic data only; no real CI integration. Root causes are hypotheses: commit diffs and application logs are not in the dataset.
- At PoC scale the API loads the raw log (about 2k rows) and normalises in process; the normalised tables exist in Postgres for inspection and for the pilot-scale query path.
- Live mode uses the Gemini free tier: 15–50 s per question and occasional rate limits, mitigated by a fallback model, then replay/offline. Not an SLA.
- Rate limiting is per serverless instance, not global.
- Cost figures are illustrative assumptions, never measured company data.

## Author

Trinh Nguyen (Martin). Independent proof of concept; no employer code, data or branding.
