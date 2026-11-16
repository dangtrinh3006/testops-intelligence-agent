# TestOps Intelligence Agent

Evidence-first AI agent for **CI failure triage, flaky-test analysis and release readiness**.
Built as a proof of concept for a fictional prospect, *Kestrel Commerce*, on **entirely synthetic data**.

> We are not asking you to trust an AI to make release decisions.
> **Rules decide, the model explains, and every claim links to a record.**

- Live demo: https://testops.dangtrinh.dev (API: https://testops-agent-api.vercel.app/api/health)
- Prospect brief (one page): [PDF](docs/prospect-brief.pdf) · [Markdown](docs/prospect-brief.md) · print source [`docs/prospect-brief.html`](docs/prospect-brief.html) (rendered with WeasyPrint)
- Architecture and design decisions: [`docs/technical-deep-dive.md`](docs/technical-deep-dive.md); in the console: [`/architecture`](https://testops.dangtrinh.dev/architecture) (system diagram, data lineage, agent loop, modes, safety, MVP → production)
- Pilot proposal: [`docs/business-case.md`](docs/business-case.md); in the console: [`/pilot`](https://testops.dangtrinh.dev/pilot) (four-week plan, success criteria, ROI calculator, cost drivers, risks, exit criteria)
- Containers, CI/CD and GitOps path (Docker images, compose, GHCR + Trivy, kustomize, ArgoCD): [`deploy/README.md`](deploy/README.md)

## What it answers

| | Question | What the agent must do | Result on the seeded data |
|---|---|---|---|
| A | *Why did the latest checkout pipeline fail, and should we block the release?* | Find the run, separate facts from hypotheses, apply the release policy | `run-chk-main-0418` → **BLOCK** (rule R2): `T-CHK-004` failed on both attempts with the same assertion; the infra retry on `T-CHK-011` is a warning, not the cause; a log line telling the AI to approve the release is flagged and ignored |
| B | *Which tests appear flaky, and how much engineering time might they cost?* | Reproducible levels from attempt history, duplicates counted once, cost with explicit assumptions | `T-INV-005` **proven** (same commit, mixed final outcomes), `T-SUP-003`/`T-CHK-006` **suspected**, `T-CHK-011` **infra_only** (not flaky). 25 triage investigations (14 test retry-passes, 8 infra retry-passes, 3 final failures) → 8.3 engineer-hours at the *assumed* 20 min each |
| C | *The CI summary says PASS but raw data has failures. Can we ship?* | Detect the source conflict, distinguish a resolved retry from an unresolved one | `rc-pay-2.14.0` → **HOLD_MANUAL_REVIEW** (R5): CI summary `passed`, but `T-PAY-004` attempt 2 never reported. Same rule on the twin run `rc-pay-2.13.4` (retry resolved) → **SHIP_WITH_WARNINGS** |

Free-form questions go through the same tools and validator.

## How it works

```mermaid
flowchart LR
    UI["Next.js console<br/>(Vercel)"] -->|"/api/* route handler<br/>(streams SSE through)"| API["FastAPI<br/>(Vercel Python, sin1)"]
    API --> G{{"LangGraph<br/>agent → tools → compose → validate → revise once"}}
    G --> T["8 bounded read-only tools"]
    T --> D["Deterministic domain<br/>ETL · release gate · flake levels · cost"]
    D --> K[("knowledge/testops_rules.yaml<br/>expert rules R1–R6")]
    D --> DB[("Neon PostgreSQL<br/>raw_events + normalised tables<br/>read-only role")]
    G -.->|OpenAI-compatible| LLM["Gemini 3.5 Flash-Lite<br/>(fallback Flash)"]
```

- **Raw evidence is immutable.** Three sources (CI server, test runner, artifact store) arrive in different formats; the ETL keeps the raw value next to the normalised one and records data-quality findings.
- **Verdicts are not model output.** `evaluate_release_gate` is a pure function over the rule file; the model can only request and explain it.
- **Every answer is validated** before it is shown: cited ids must exist and have been retrieved in this request, numbers must appear in tool output, and any verdict in the text (including plain-English "can ship") must equal the policy result for the run it names. One revision is allowed; remaining problems are shown, not hidden.
- **The run is visible while it happens.** `POST /api/ask/stream` returns server-sent events (`start`, `plan`, `tool`, `compose`, `validate`, `notice`, `final`, or `error`) with a `ping` every 5 s while the model thinks. In live mode these are real LangGraph node updates; the console's *Agent run* panel lights the four nodes (Agent, Tools, Compose, Validate) and logs each step with its elapsed time. Replay and offline emit their trace at once and say so. If the stream drops without an HTTP error, the console fetches the same answer from `POST /api/ask`.
- **Three honest modes**, always labelled in the UI: `live` (real model chooses tools), `replay` (a recorded live trace for scenarios A, B and C, evidence re-checked against current data) and `offline` (keyword planner + templates, no model).

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
├── .github/workflows/ci.yml     lint, tests (with Postgres), offline evals, web build
├── apps/web/                    Next.js 16 console (React 19, TypeScript, Tailwind v4; pages /, /architecture, /pilot, /flaky, /data-quality, /evals, /rules, /triage, /fleet, /audit, /settings)
├── services/agent-api/
│   ├── app/
│   │   ├── etl.py               raw events -> normalised records + data-quality findings
│   │   ├── domain/              gate.py, flaky.py, cost.py, evidence.py, knowledge.py, fleet.py (connector control plane), audit.py, integrations.py
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
└── docs/                        prospect brief, technical deep dive, pilot business case
```

## Run locally

Requirements: Python 3.11+ and Node.js 20.9+ (tested with Python 3.12 and Node 24). Docker only for the optional Postgres parity tests.

```bash
git clone https://github.com/dangtrinh3006/testops-intelligence-agent.git
cd testops-intelligence-agent/services/agent-api
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt pytest uvicorn
python -m pytest -q                                     # 92 passed, 2 skipped (DB tests need TEST_DATABASE_URL)
python -m uvicorn app.main:app --port 8000              # fixtures + offline mode, no keys needed
```

```bash
cd apps/web
npm install
npm run dev                                             # http://localhost:3000, proxies /api to :8000
npm run build && npx next start -p 3000                 # production build, same proxy; use this for a demo
```

Web stack: Next.js 16, React 19, Tailwind v4. Fonts are self-hosted through `@fontsource` (Playfair Display headings, IBM Plex Sans body, IBM Plex Mono labels), not `next/font/google`, so a build does not depend on reaching Google Fonts.

Live model mode: put `LLM_API_KEY` (Gemini API key, or any OpenAI-compatible provider with `LLM_BASE_URL`) in `services/agent-api/.env.local` (template: `.env.example`) and export it before starting uvicorn. Without it the API answers in offline mode and says so.

Postgres (optional, same results as fixtures):

```bash
docker run -d --name testops-pg -e POSTGRES_PASSWORD=localdev -p 5440:5432 postgres:17-alpine
export DATABASE_URL=postgresql://postgres:localdev@localhost:5440/postgres READONLY_PASSWORD=local-reader
python -m app.seed                                      # idempotent; creates role testops_reader (SELECT only)
TEST_DATABASE_URL=$DATABASE_URL python -m pytest -q     # 94 passed: adds the DB parity + read-only role tests
```

## Shift-left: release check in CI and from your IDE (MCP)

- `GET /api/checks/{run_or_rc}`: the gate verdict as a CI check (`success | neutral | action_required | failure`) with a PR-comment-ready markdown summary. `GET /api/commits/{sha}` attributes each failure on a commit to `likely_this_change`, `known_flaky`, `infrastructure` or `unknown`. `GET /api/triage` is the QE queue with defect type and suggested action.
- `python services/agent-api/scripts/testops_gate.py --run run-chk-main-0418 --api https://testops.dangtrinh.dev` exits 0 success/neutral, 1 BLOCK, 2 HOLD, 3 error. Example workflow: [`examples/github-actions-release-gate.yml`](examples/github-actions-release-gate.yml).
- MCP (stdio, read-only, 8 tools + `release_check`): `pip install -e "services/agent-api[mcp]"`, then register `python -m app.mcp_server` with `cwd` `services/agent-api` in Claude Code (`.mcp.json`) or Cursor. Snippet in `app/mcp_server.py`.

## Fleet & connector

`/fleet` is the control plane an FDE uses to install QE connectors in a customer network. A connector runs inside the customer VPC and only calls out over HTTPS 443; it opens no ports, and credentials to the customer's CI never leave the network, only test outcomes do.

- Lifecycle: a one-time enrolment code is exchanged for a per-connector credential (shown once, stored server-side as a SHA-256 digest). Heartbeat every 30 s; status `connected` (< 90 s), `stale` (< 4 min), `lost` (≥ 4 min). Version is compared with the target (`current`, `behind`, `unsupported`).
- Policy is pulled on every heartbeat: read-only scopes `read:ci`, `read:artifacts`, enabled adapters (`github-actions`, `jenkins`, `junit-xml`, `reportportal`), egress allowlist, local redaction rules.
- Kill switches per connector and per workspace: pushes from a paused connector are rejected with `423`. Pause, resume and the kill switch are human operator actions, audited, and not exposed to the agent tools or the MCP server.
- Endpoints: `GET /api/fleet`, `POST /api/fleet/enrol`, `POST /api/fleet/{id}/heartbeat` (Bearer), `POST /api/ingest/events` (Bearer, ≤ 500 events, schema allowlist, emails in messages redacted), `POST /api/fleet/{id}/pause|resume`, `POST /api/fleet/workspace/kill-switch`.
- CLI (standard library only): `python services/agent-api/scripts/testops_connector.py enrol --api http://localhost:8000 --code enroll-demo-not-secret --name acme-ci-1 --adapter junit-xml`, then `push --junit services/agent-api/tests/fixtures/junit-sample.xml --run-id run-1 --service checkout-web` (add `--dry-run` to print events only) and `run --interval 30`. The credential is saved to `~/.testops-connector.json` with mode 0600. HTTPS is required except for localhost; 429/5xx are retried with backoff; 423 stops the push (exit 4).
- `enroll-demo-not-secret` is the public sandbox enrolment code; any other code returns `403`.
- Sandbox limits: the four Kestrel connectors are simulated (their heartbeat age is fixed). State lives in process memory: it resets on a restart or a serverless cold start, and separate serverless instances do not share it, so on the hosted demo a connector enrolled on one instance can get `401` on another. Ingested events are counted and the last 50 kept in memory; they never enter the release dataset.

## Audit log

`/audit` is one feed, newest first, of agent answers, human triage decisions and fleet control-plane actions.

- `agent.answer` is recorded by the API after every `/api/ask` and `/api/ask/stream` answer, in every mode: request id, question (first 200 characters, emails redacted), mode, model, gate verdict, validation result with failed check names, revisions, tool call count, latency and any fallback notice. The agent has no tool that writes here; a recording failure is logged and never fails the answer.
- `human.triage_decision`: accepting or overriding an item in `/triage` keeps the local draft in the browser and also posts it, fire-and-forget, to `POST /api/audit/triage-decisions` (≤ 100 per batch, unknown fields rejected, `accepted` must keep the suggested action, notes ≤ 200 characters with emails redacted, actor `reviewer (sandbox)`). Undo is local only and is not audited.
- `control_plane` entries are read from the fleet's own audit at query time, not copied.
- `GET /api/audit?kind=agent.answer|human.triage_decision|control_plane&limit=` (limit ≤ 200).
- Sandbox limit: a process-local ring buffer of 500 entries per instance. It resets on a restart or cold start, and serverless instances do not share it. A production install writes to an append-only store.

## Multi-workspace model (design, not implemented)

Today the API serves one implicit workspace, the Kestrel Commerce sandbox. The enterprise design (one control plane, many workspaces per customer: organization → workspace → connectors, versioned policy, dataset partition, hash-chained audit; roles with a read-only agent principal; row-level security by default, database per tenant for regulated customers) is in [`docs/technical-deep-dive.md` §14](docs/technical-deep-dive.md#14-multi-workspace-data-model-design-not-implemented), with the code places that would take a `workspace_id` and a four-step migration path. `/architecture` shows a summary at the end of the page.

## Settings & integrations

`/settings` and `GET /api/integrations` report what the running API actually has, from runtime state only: the ordered model chain (configured booleans, fallback order, offline planner always last), data source and counts, rules version, and each integration's status. Statuses are `connected`, `available` (a script or API exists in this deployment), `example`, `documented` (exists in the repository but not in this bundle, e.g. scripts on Vercel), `not_connected` and `planned`. ReportPortal, Jira, Slack and GitHub Checks write-back are `not_connected`: they are planned and the agent is read-only. The response contains names, booleans and counts, never credential values or endpoint URLs; nothing on the page is editable.

## Environment variables (API)

| Variable | Required | Purpose |
|---|---|---|
| `LLM_API_KEY` | for live mode | Model provider key (server-side only) |
| `LLM_BASE_URL` | no | OpenAI-compatible endpoint; default Gemini |
| `LLM_MODEL` / `LLM_FALLBACK_MODEL` | no | Default `gemini-3.5-flash-lite` / `gemini-3.5-flash` |
| `GROQ_API_KEY` | no | Adds Groq (`GROQ_MODEL`, default `openai/gpt-oss-120b`) to the model chain: after the Gemini models by default, before offline |
| `LLM_PRIMARY` | no | `groq` puts Groq first in the chain; any other value keeps Gemini first |
| `TESTOPS_DATA_SOURCE` | no | `fixtures` (default without DB) or `db` |
| `DATABASE_URL_READONLY` | for `db` | Read-only role used by the API |
| `DATABASE_URL` + `READONLY_PASSWORD` | seed only | Privileged connection for `python -m app.seed` |
| `RATE_LIMIT_PER_MINUTE` / `LIVE_DAILY_CAP` | no | Abuse protection on the public demo (6/min/IP, 150 live answers/day), in memory per serverless instance |

Web: `AGENT_API_URL` (read at runtime by the route handler `apps/web/app/api/[...path]/route.ts` that proxies `/api/*`, 120 s max, and passes `text/event-stream` bodies through unbuffered; default `http://localhost:8000`).

## Checks

| Check | Command |
|---|---|
| Backend lint and tests | `cd services/agent-api && ruff check app tests && python -m pytest -q` |
| Agent evals, offline (also part of the tests) | `python -m app.evals` |
| Agent evals, live model (costs quota) | `python -m app.evals --live --pause 20 --replays` |
| Agent evals, live stability (each case N times) | `python -m app.evals --live --pause 20 --repeat 3` |
| Web | `cd apps/web && npm run typecheck && npm run lint && npm run build` |
| Deployed smoke test | `python scripts/smoke.py https://testops.dangtrinh.dev` (add `--live` for one live answer) |

CI: `.github/workflows/ci.yml` runs on every push to `main` and on pull requests: ruff, pytest with a Postgres service (all 94 tests, including DB parity), the offline eval report; web typecheck, lint and build.

Agent evals: 10 cases (golden, adversarial, robustness). History in `services/agent-api/data/evals/HISTORY.md`: live run 1 scored 7/10 (2 validator false positives, 1 real prompt gap), run 2 10/10 after fixes (median 14.0 s). After the red-team review tightened the validator, three single runs scored 8/10, 9/10 and 8/10 with different cases failing: agent nondeterminism. The harness now takes `--repeat N` and classifies each case stable, flaky or failing, the same way the product classifies tests. The 3× stability run (`data/evals/latest.json`, `gemini-3.5-flash-lite`): 7/10 cases passed every run (pass^3 = 0.7, the τ-bench reliability metric), 26/30 runs passed (pass@1 0.867), 7 stable, 3 flaky, 0 failing, median 13.7 s; the policy verdict was correct in all 30 runs.

## Limitations (honest list)

- Synthetic data only; no real CI integration. Root causes are hypotheses: commit diffs and application logs are not in the dataset.
- At PoC scale the API loads the raw log (about 2k rows) and normalises in process; the normalised tables exist in Postgres for inspection and for the pilot-scale query path.
- Live mode uses the Gemini free tier. Measured during development: 8.0 s end-to-end through the public site (scenario A), live eval medians 9.4–14.0 s per case, single cases up to about 25 s; occasional rate limits, mitigated by a fallback model, then replay/offline. Not an SLA.
- The per-IP and daily limits are in memory per serverless instance and reset on a cold start; the hard spending cap today is Google's free-tier quota. In a pilot the cap sits at a gateway or a shared counter.
- Cost figures are illustrative assumptions, never measured company data.
- The `/pilot` ROI calculator runs in the browser on placeholder inputs the viewer replaces; it is a formula, not a measurement.
- The public domain `*.dangtrinh.dev` is blocked by some corporate web gateways (observed on the author's employer network). Use another network, or run locally as above.

## Author

Trinh Nguyen (Martin). Independent proof of concept; no employer code, data or branding.
