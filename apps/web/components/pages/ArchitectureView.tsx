"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { useOverview, useRun } from "@/lib/hooks";
import { useApi } from "@/lib/useApi";
import { EvidenceChip, LinkifiedText } from "../Evidence";
import { buttonClass, Card, cx, ModeBadge, Numeral, Pill, SectionHeading, Skeleton, statusTone, VerdictBadge } from "../ui";
import { RequestLifecycle } from "./RequestLifecycle";

const LINEAGE_RUN = "run-pay-main-0233";
const LINEAGE_EVENT = `ci:run.summary:${LINEAGE_RUN}`;

const TOOLS = [
  "find_pipeline_runs",
  "get_run_details",
  "inspect_failure_evidence",
  "evaluate_release_gate",
  "analyze_flaky_tests",
  "estimate_triage_cost",
  "get_data_quality_report",
  "get_record",
];

export function ArchitectureView() {
  return (
    <div className="space-y-24">
      <RequestLifecycle />
      <SystemDiagram />
      <Lineage />
      <AgentLoop />
      <Modes />
      <Safety />
      <MvpToProduction />
      <MultiWorkspace />
    </div>
  );
}

/* ---------- (a) system diagram ---------- */

function Node({ tag, title, sub, className, accent }: { tag: string; title: ReactNode; sub?: ReactNode; className?: string; accent?: boolean }) {
  return (
    <div className={cx("min-w-0 rounded-[4px] border bg-surface p-3.5", accent ? "border-accent/50" : "border-line-strong", className)}>
      <div className={cx("label-mono text-[10px]", accent ? "text-accent" : "text-faint")}>{tag}</div>
      <div className="mt-1 font-serif text-[18px] leading-snug text-ink">{title}</div>
      {sub && <div className="mt-1 text-[12.5px] leading-snug text-muted">{sub}</div>}
    </div>
  );
}

// Connector that runs down on phones and across from lg up (when `across`).
function Conn({ label, across, dashed }: { label?: string; across?: boolean; dashed?: boolean }) {
  const line = dashed ? "border-dashed border-accent/70" : "border-solid border-line-strong";
  return (
    <div
      aria-hidden
      className={cx("flex items-center justify-center gap-1.5", across ? "flex-col py-1 lg:flex-row lg:px-1 lg:py-0" : "flex-col py-1")}
    >
      <span className={cx("h-4 border-l", line, across && "lg:h-0 lg:w-4 lg:border-l-0 lg:border-t")} />
      {label && <span className={cx("label-mono whitespace-nowrap text-[9.5px]", dashed ? "text-accent" : "text-faint")}>{label}</span>}
      <span className={cx("h-4 border-l", line, across && "lg:h-0 lg:w-4 lg:border-l-0 lg:border-t")} />
      <span className={cx("text-[11px] leading-none", dashed ? "text-accent" : "text-faint")}>
        {across ? (
          <>
            <span className="lg:hidden">↓</span>
            <span className="hidden lg:inline">→</span>
          </>
        ) : (
          "↓"
        )}
      </span>
    </div>
  );
}

function Boundary({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("relative rounded-[4px] border border-dashed border-accent/45 p-3 pt-6 sm:p-4 sm:pt-7", className)}>
      <span className="label-mono absolute -top-2 left-3 bg-canvas px-1.5 text-[10px] text-accent">{label}</span>
      {children}
    </div>
  );
}

function SystemDiagram() {
  return (
    <section aria-labelledby="sys-title">
      <SectionHeading id="sys-title" eyebrow="The system" title={<>From the browser to the <em className="italic text-accent">record</em></>}>
        One request path, three trust boundaries. Every arrow below exists in the repository today.
      </SectionHeading>
      <div className="rounded-[4px] border border-line bg-canvas p-4 sm:p-6" role="img" aria-label="System diagram: browser, Next.js console, API proxy, FastAPI, LangGraph agent with eight read-only tools and an LLM that only explains, deterministic domain, Neon Postgres and the rule file.">
        <div className="grid items-center lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <Node tag="client" title="Browser" sub="Console, evidence inspector, mode badge" />
          <Conn across label="https" />
          <Node tag="vercel" title="Next.js console" sub="apps/web · React 19 · read-only UI" />
          <Conn across label="same origin" />
          <Node tag="route handler" title="/api/* proxy" sub="Upstream URL read at runtime; 120 s max; streams SSE through" />
        </div>
        <Conn label="json · sse" />
        <div className="mx-auto max-w-xl">
          <Node tag="vercel python · sin1" title="FastAPI" sub="POST /api/ask, POST /api/ask/stream; everything else is GET" />
        </div>
        <Conn />
        <Boundary label="Model never writes a verdict">
          <div className="grid items-center lg:grid-cols-[1fr_auto_1.15fr_auto_1.3fr]">
            <Node tag="llm · openai-compatible" title="Gemini" sub="Flash-Lite primary, Flash fallback. Chooses tools, writes the explanation." />
            <Conn across dashed label="explains only" />
            <Node accent tag="langgraph" title="Agent" sub="tools → compose → validate → revise once" />
            <Conn across label="≤ 8 calls" />
            <Boundary label="Logs are untrusted data" className="border-line-strong">
              <div className="label-mono text-[10px] text-faint">8 read-only tools</div>
              <ul className="mt-1.5 flex flex-wrap gap-1">
                {TOOLS.map((t) => (
                  <li key={t} className="rounded-[3px] border border-line bg-surface px-1.5 py-px font-mono text-[10.5px] text-muted">
                    {t}
                  </li>
                ))}
              </ul>
            </Boundary>
          </div>
        </Boundary>
        <Conn label="typed records · evidence ids" />
        <div className="mx-auto max-w-xl">
          <Node accent tag="deterministic domain" title="ETL · gate · flake · cost" sub="Pure Python functions with their own tests. The verdict comes from the gate function." />
        </div>
        <Conn />
        <div className="grid gap-3 lg:grid-cols-2">
          <Boundary label="Read-only role">
            <Node tag="neon postgres · sin1" title="raw_events + normalised tables" sub="SELECT-only role testops_reader; two fixed queries, no model-written SQL. Local dev reads the committed fixtures." />
          </Boundary>
          <Boundary label="Versioned, customer-owned" className="border-line-strong">
            <Node tag="knowledge/testops_rules.yaml" title="Rule file" sub="Taxonomy, R1–R6, gate precedence, quarantine, effort assumptions. Changing a rule is a reviewed YAML edit." />
          </Boundary>
        </div>
      </div>
    </section>
  );
}

/* ---------- (b) lineage ---------- */

function Step({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <li className="relative flex min-w-0 flex-col rounded-[4px] border border-line bg-surface">
      <div className="border-b border-line px-4 py-2">
        <Numeral n={n} label={label} />
      </div>
      <div className="flex-1 space-y-2 p-4 text-[13.5px] text-muted">{children}</div>
    </li>
  );
}

function Lineage() {
  const rec = useApi(`record:${LINEAGE_EVENT}`, () => api.record(LINEAGE_EVENT));
  const run = useRun(LINEAGE_RUN);
  const overview = useOverview();
  const summary = rec.data?.kind === "ci_summary" ? rec.data.record : null;
  const check = run.data?.gate.checks.find((c) => c.condition === "summary_conflict");
  const first = run.data?.gate.checks.find((c) => c.triggered);
  const rc = overview.data?.release_candidates.find((r) => r.run_id === LINEAGE_RUN);
  const wait = <Skeleton className="h-3.5 w-2/3" />;

  return (
    <section aria-labelledby="lineage-title">
      <SectionHeading id="lineage-title" eyebrow="Provenance" title={<>Where a number <em className="italic text-accent">comes from</em></>}>
        One example, scenario C, followed from the raw webhook to the sentence in the answer. Values below are read live from the API; every id
        opens the evidence inspector.
      </SectionHeading>
      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Step n={1} label="Raw event">
          <EvidenceChip id={LINEAGE_EVENT} />
          {summary ? (
            <dl className="grid grid-cols-2 gap-2 font-mono text-[12px]">
              <div>
                <dt className="label-mono text-[9.5px] text-faint">status</dt>
                <dd className="text-ink">&quot;{summary.status_raw}&quot;</dd>
              </div>
              <div>
                <dt className="label-mono text-[9.5px] text-faint">started · {summary.started.format}</dt>
                <dd className="text-ink">{String(summary.started.raw)}</dd>
              </div>
            </dl>
          ) : (
            wait
          )}
          <p>As the CI server sent it, append-only in raw_events.</p>
        </Step>
        <Step n={2} label="Normalised">
          {summary ? (
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={statusTone(summary.status)} mono>
                {summary.status}
              </Pill>
              <span className="font-mono text-[12px] text-ink">{summary.started.utc}</span>
            </div>
          ) : (
            wait
          )}
          <p>Status word mapped to PASS, epoch converted to UTC. The raw value stays beside the normalised one.</p>
        </Step>
        <Step n={3} label="Gate check · R5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] text-accent">summary_conflict</span>
            {check && <Pill tone={check.triggered ? "amber" : "neutral"} mono>{check.triggered ? "triggered" : "clear"}</Pill>}
          </div>
          {check ? (
            <p className="text-[12.5px]">
              <LinkifiedText text={check.detail} />
            </p>
          ) : (
            wait
          )}
          {first && first.condition !== "summary_conflict" && (
            <p className="text-[12px] text-faint">
              First match in the precedence list is <span className="font-mono">{first.condition}</span> ({first.rule}); both hold the run.
            </p>
          )}
        </Step>
        <Step n={4} label="Verdict">
          {run.data ? <VerdictBadge verdict={run.data.gate.verdict} /> : wait}
          <div className="flex flex-wrap gap-1">
            {rc && <EvidenceChip id={rc.id} />}
            {run.data && <EvidenceChip id={run.data.gate.policy_id} />}
          </div>
          <p>Returned by the policy function with its rule and rules version. The model has no field to write it into.</p>
        </Step>
        <Step n={5} label="Validator">
          <span className="font-mono text-[12px] text-accent">verdict_matches_policy</span>
          <p>A verdict next to a run or release-candidate id must equal that run&apos;s policy verdict. A stray &ldquo;can ship&rdquo; fails the check and sends the draft back once.</p>
        </Step>
        <Step n={6} label="In the answer">
          <p>The answer cites the same ids as chips; the verdict card and gate checks are rendered from the policy output, not from the text.</p>
          <Link href="/" className={cx(buttonClass("primary"), "mt-1")}>
            Ask scenario C on the console <span aria-hidden>→</span>
          </Link>
        </Step>
      </ol>
    </section>
  );
}

/* ---------- (c) agent loop ---------- */

const LOOP: { id: string; line: string }[] = [
  { id: "agent", line: "One chat call with the 8 tool specs, tool_choice auto, temperature 0." },
  { id: "tools", line: "Runs each requested call; argument errors return {error, hint}; at most 8 calls; payloads over 9,000 chars truncated." },
  { id: "compose", line: "Forces submit_answer: answer, next action, 3–6 claims with ids. Computed verdicts are appended so the model states them exactly." },
  { id: "validate", line: "Five deterministic checks: ids resolve, ids retrieved this request, claims cited, verdict equals policy, numbers grounded." },
  { id: "END", line: "Ships the response. If validation still fails after one revision, validation.passed is false and flagged claims are marked unsupported." },
];

function LoopNode({ id, end }: { id: string; end?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex min-w-24 items-center justify-center rounded-[4px] border px-3 py-2 font-mono text-[13px]",
        end ? "border-line-strong text-muted" : "border-accent/60 bg-accent/[0.06] text-accent",
      )}
    >
      {id}
    </span>
  );
}

function Edge({ label, back }: { label: string; back?: boolean }) {
  return (
    <span aria-hidden className="flex flex-col items-center px-1 font-mono text-[10px] text-faint">
      <span className="label-mono text-[9.5px]">{label}</span>
      <span className="text-[15px] leading-none text-line-strong">{back ? "⇄" : "→"}</span>
    </span>
  );
}

function AgentLoop() {
  return (
    <section aria-labelledby="loop-title">
      <SectionHeading id="loop-title" eyebrow="The agent loop" title={<>A graph with <em className="italic text-accent">two loops</em>, not decoration</>}>
        The model may keep fetching evidence until it has enough, and a deterministic checker can send the draft back with the exact defects.
      </SectionHeading>
      <Card>
        <div
          className="flex flex-wrap items-center justify-center gap-x-1 gap-y-3 border-b border-line px-4 py-6"
          role="img"
          aria-label="agent and tools loop until enough evidence, then compose, validate, revise once on failure, then end"
        >
          <LoopNode id="agent" />
          <Edge back label="tool_calls" />
          <LoopNode id="tools" />
          <Edge label="enough" />
          <LoopNode id="compose" />
          <Edge back label="fail · once" />
          <LoopNode id="validate" />
          <Edge label="pass" />
          <LoopNode id="END" end />
        </div>
        <dl className="divide-y divide-line">
          {LOOP.map((n) => (
            <div key={n.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr] sm:px-5">
              <dt className="font-mono text-[12.5px] text-accent">{n.id}</dt>
              <dd className="text-[14px] text-muted">{n.line}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-line px-4 py-3.5 text-[13.5px] text-muted sm:px-5">
          <span className="label-mono mr-2 text-[10px] text-accent">Streaming</span>
          POST /api/ask/stream sends server-sent events as each node finishes (start, plan, tool, compose, validate, final), with a ping every 5 s so
          proxies keep the connection open. In live mode these are real node-by-node LangGraph updates, not a progress animation; replay and
          offline send their recorded or deterministic trace at once and say so.
        </p>
      </Card>
    </section>
  );
}

/* ---------- (d) modes ---------- */

const MODES = [
  {
    mode: "live" as const,
    title: "Live model",
    what: "The graph with the configured model. On a model error the fallback model answers; if both fail, offline answers.",
    label: "mode live, the model name, and a notice when a fallback was used.",
  },
  {
    mode: "replay" as const,
    title: "Replayed trace",
    what: "A recorded live response for presets A, B and C, from passing live eval runs. Cited ids are re-checked against today's data.",
    label: "mode replay, with the model and request id of the recorded run.",
  },
  {
    mode: "offline" as const,
    title: "Offline rules",
    what: "Keyword planner and templates over the same tools, policy and validator. No language model. Also the answer when no key is configured.",
    label: "mode offline, with a notice saying no language model was used.",
  },
];

function Modes() {
  return (
    <section aria-labelledby="modes-title">
      <SectionHeading id="modes-title" eyebrow="Three honest modes" title={<>Always labelled, <em className="italic text-accent">never</em> disguised</>}>
        Tools and the gate answer in every mode. The badge on each answer says which one produced it.
      </SectionHeading>
      <div className="grid gap-3 md:grid-cols-3">
        {MODES.map((m, i) => (
          <Card key={m.mode} as="article" className="flex flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
              <Numeral n={i + 1} label={m.title} />
              <ModeBadge mode={m.mode} />
            </div>
            <div className="flex-1 space-y-3 p-4 text-[14px]">
              <p className="text-ink">{m.what}</p>
              <p className="text-muted">
                <span className="label-mono mr-1.5 text-[10px] text-faint">Label</span>
                {m.label}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

/* ---------- (e) safety ---------- */

const SAFETY: { k: string; v: string }[] = [
  { k: "Read-only API surface", v: "The only POST routes are /api/ask and /api/ask/stream; there is no PUT, PATCH or DELETE. A test asserts it." },
  { k: "Bounded tools", v: "Pydantic arguments: at most 20 runs per listing, a 1–30 day window, record ids up to 120 chars, at most 8 tool calls per question." },
  { k: "No text-to-SQL", v: "The model never sees SQL. The Postgres path runs two fixed queries under a SELECT-only role with an 8 s statement timeout." },
  { k: "Untrusted log text", v: "Logs reach the model as quoted untrusted_text; injection phrases are flagged. The real defence: the verdict is not model-writable." },
  { k: "Rate limits", v: "6 live questions per minute per IP and 150 live calls per day per instance, in memory. Replay and offline are not limited." },
  { k: "Secrets server-side", v: "Model key and database URLs are server env vars. Errors return a request id, never a connection string." },
];

function Safety() {
  return (
    <section aria-labelledby="safety-title">
      <SectionHeading id="safety-title" eyebrow="Safety" title={<>What the agent <em className="italic text-accent">cannot</em> do</>} />
      <ul className="border-t border-line">
        {SAFETY.map((s, i) => (
          <li key={s.k} className="grid gap-1 border-b border-line py-4 transition-colors hover:bg-surface/60 sm:grid-cols-[16rem_1fr] sm:gap-6 sm:px-2">
            <Numeral n={i + 1} label={s.k} />
            <span className="text-[14.5px] text-muted">{s.v}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- (f) MVP to production ---------- */

const MVP_ROWS: { area: string; mvp: string; prod: string }[] = [
  {
    area: "Ingestion",
    mvp: "Committed synthetic event log, seeded into Postgres.",
    prod: "CI webhooks would post to a signed ingest endpoint, then a queue (SQS or Kafka) and idempotent normaliser workers keyed by source event id, with a dead-letter queue and replay from the raw store.",
  },
  {
    area: "Storage",
    mvp: "Neon Postgres: raw_events plus normalised tables, read-only role.",
    prod: "Postgres partitioned by tenant and day, normalised tables materialised by the workers, row-level security per tenant, raw events also kept in object storage (S3) for audit.",
  },
  {
    area: "Agent runtime",
    mvp: "LangGraph in a stateless serverless function, at most 8 tool calls, one revision.",
    prod: "LangGraph with a Postgres checkpointer so long investigations would resume after a crash, a job queue (e.g. Temporal) for slow triage, and per-tenant budgets.",
  },
  {
    area: "Streaming",
    mvp: "Server-sent events from the function with 5 s keep-alive pings; real node-by-node LangGraph updates.",
    prod: "SSE for the asker plus realtime fan-out (an Ably or WebSocket channel per release) so a release war-room would see the same investigation live; reconnect with the last event id.",
  },
  {
    area: "Model access",
    mvp: "Gemini via an OpenAI-compatible API, a fallback model, replay and offline modes.",
    prod: "An LLM gateway (LiteLLM) with model routing, per-tenant keys and spend caps, and an on-prem or VPC model option for customers who cannot send logs out.",
  },
  {
    area: "Trust",
    mvp: "Deterministic gate, validator and eval harness with repeat runs and stability.",
    prod: "The same, plus evals as a release gate for every prompt, model or rule change, and human accept/override feedback stored as new eval cases.",
  },
  {
    area: "Observability",
    mvp: "Request ids and structured JSON logs.",
    prod: "OpenTelemetry traces across ingest, tools and model, LangFuse for prompt and tool traces, dashboards on override rate and evidence-resolution rate, with alerts.",
  },
  {
    area: "Security",
    mvp: "Read-only API, bounded tools, untrusted log text, per-IP rate limit, secrets server-side.",
    prod: "SSO and RBAC, tenant isolation, a secret manager, a pen-test and data-processing review before go-live, and an audit log of every agent answer.",
  },
];

function MvpToProduction() {
  return (
    <section aria-labelledby="mvp-title">
      <SectionHeading id="mvp-title" eyebrow="System design beyond the demo" title={<>From MVP to <em className="italic text-accent">production</em></>}>
        What runs today, and what a production design would add. The right column is a plan, not a feature list.
      </SectionHeading>
      <Card className="overflow-hidden">
        <table className="hidden w-full text-[14px] md:table" aria-labelledby="mvp-title">
          <thead className="border-b border-line bg-sunken/50">
            <tr>
              <th scope="col" className="label-mono w-40 px-5 py-3 text-left font-medium text-faint">
                Area
              </th>
              <th scope="col" className="label-mono px-4 py-3 text-left font-medium text-faint">
                This demo (MVP)
              </th>
              <th scope="col" className="label-mono px-5 py-3 text-left font-medium text-accent">
                Production design
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {MVP_ROWS.map((r) => (
              <tr key={r.area} className="align-top transition-colors hover:bg-sunken/40">
                <th scope="row" className="label-mono px-5 py-4 text-left font-medium text-accent">
                  {r.area}
                </th>
                <td className="px-4 py-4 text-ink">{r.mvp}</td>
                <td className="px-5 py-4 text-muted">{r.prod}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-y divide-line md:hidden">
          {MVP_ROWS.map((r) => (
            <li key={r.area} className="space-y-2 px-4 py-4">
              <div className="label-mono text-accent">{r.area}</div>
              <div>
                <div className="label-mono text-[9.5px] text-faint">This demo (MVP)</div>
                <p className="mt-0.5 text-[14px] text-ink">{r.mvp}</p>
              </div>
              <div>
                <div className="label-mono text-[9.5px] text-accent">Production design</div>
                <p className="mt-0.5 text-[14px] text-muted">{r.prod}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/* ---------- (g) multi-workspace model (design only) ---------- */

const WORKSPACE_PARTS: { k: string; v: string }[] = [
  { k: "Connectors", v: "Enrolled per workspace; credential stored as a SHA-256 digest, version and policy version tracked." },
  { k: "Policy version", v: "Versioned rule file that inherits the organization default and overrides keys." },
  { k: "Dataset partition", v: "raw_event, run, attempt and finding rows, every one keyed by workspace_id." },
  { k: "Audit chain", v: "Append-only entries, each hashing the previous one; actor, kind, request id." },
];

const EXAMPLE_WORKSPACES = ["payments-prod", "payments-staging"];

const ISOLATION: { name: string; how: string; fit: string; recommended?: boolean }[] = [
  {
    name: "Row-level security",
    how: "Shared Postgres, workspace_id on every row, policy per table set per transaction.",
    fit: "Default for most customers.",
    recommended: true,
  },
  {
    name: "Schema per workspace",
    how: "One schema each, chosen by search_path per request.",
    fit: "Every migration runs N times; rarely better than RLS.",
  },
  {
    name: "Database per tenant",
    how: "Own database, credentials, region and keys per organization.",
    fit: "Regulated customers and data residency.",
  },
];

function MultiWorkspace() {
  return (
    <section aria-labelledby="mws-title">
      <SectionHeading id="mws-title" eyebrow="Design · not implemented yet" title={<>Multi-workspace <em className="italic text-accent">model</em></>}>
        For an enterprise install: one control plane, many workspaces per customer. Data model and migration path in
        docs/technical-deep-dive.md §14.
      </SectionHeading>
      <p className="mb-5 inline-flex items-center gap-2 rounded-[3px] border border-line-strong bg-sunken px-3 py-1.5 text-[13px] text-ink">
        <span className="label-mono text-[10px] text-faint">Today</span>
        One implicit workspace (Kestrel Commerce sandbox). No table or endpoint takes a workspace id yet.
      </p>
      <div className="rounded-[4px] border border-line bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-xl">
          <Node tag="organization · tenant" title="Organization" sub="SSO, users and role bindings, default policy, data residency" />
        </div>
        <Conn label="one to many" />
        <ul className="grid gap-3 lg:grid-cols-2">
          {EXAMPLE_WORKSPACES.map((w) => (
            <li key={w}>
              <Boundary label={`workspace · ${w}`}>
                <h3 className="sr-only">Workspace {w}</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {WORKSPACE_PARTS.map((p) => (
                    <li key={p.k} className="rounded-[3px] border border-line bg-surface p-2.5">
                      <div className="label-mono text-[10px] text-accent">{p.k}</div>
                      <p className="mt-1 text-[12.5px] leading-snug text-muted">{p.v}</p>
                    </li>
                  ))}
                </ul>
              </Boundary>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-muted">
          Roles: org admin, workspace operator, QE reviewer, viewer. The agent is a separate read-only principal bound to one workspace per request.
        </p>
      </div>
      <h3 className="label-mono mb-3 mt-8 text-faint">Isolation options</h3>
      <ul className="grid gap-3 md:grid-cols-3">
        {ISOLATION.map((o) => (
          <li key={o.name}>
            <Card as="div" className={cx("h-full p-4", o.recommended && "border-accent/60 bg-accent/[0.05]")}>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-serif text-[17px] leading-snug text-ink">{o.name}</h4>
                {o.recommended && <Pill tone="amber">Recommended</Pill>}
              </div>
              <p className="mt-2 text-[13px] text-muted">{o.how}</p>
              <p className="mt-2 text-[13px] text-ink">{o.fit}</p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
