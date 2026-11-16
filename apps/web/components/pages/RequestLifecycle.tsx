"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cx, ModeBadge, SectionHeading } from "../ui";

// Interactive walkthrough of one POST /api/ask/stream request. Every stage cites the code that implements it.

type Path = "happy" | "failure";

type Stage = {
  key: string;
  label: string;
  title: string;
  role: string;
  what: string;
  contract: string;
  failure: string;
  /** Short chip shown on the card when the failure path is selected. */
  failChip: string;
  code: string[];
};

const STAGES: Stage[] = [
  {
    key: "browser",
    label: "01 · client",
    title: "Browser console",
    role: "Posts the question, reads SSE",
    what: "fetch() POSTs the question and reads the response body as server-sent events (EventSource cannot POST). Each event updates the Agent run panel as it arrives.",
    contract: `→ POST /api/ask/stream
  { question, mode: "live", scenario: "C" }
← event: start | plan | tool | compose
         validate | notice | final | error`,
    failure: "A dropped stream falls back to POST /api/ask once; an HTTP error (rate limit, validation) is shown as is, with the question kept.",
    failChip: "stream drop → /api/ask",
    code: ["apps/web/lib/stream.ts", "apps/web/components/console/Console.tsx"],
  },
  {
    key: "proxy",
    label: "02 · edge",
    title: "Route handler",
    role: "Same-origin proxy, streams through",
    what: "A Next.js route handler (not a rewrite) forwards to AGENT_API_URL at runtime and passes the body through as a stream, so events reach the browser as they happen.",
    contract: `/api/* → $AGENT_API_URL/api/*
content-type: text/event-stream
x-accel-buffering: no   maxDuration 120 s`,
    failure: "Upstream timeout (115 s) or unreachable API returns a typed JSON error instead of hanging.",
    failChip: "upstream_timeout",
    code: ["apps/web/app/api/[...path]/route.ts"],
  },
  {
    key: "api",
    label: "03 · api",
    title: "FastAPI",
    role: "Guards, then streams from a worker thread",
    what: "Live requests pass a per-IP rate limit and a daily cap. A worker thread runs the agent and pushes events to a queue; the response generator drains it.",
    contract: `RATE_LIMIT_PER_MINUTE = 6 per IP
LIVE_DAILY_CAP = 150 (in memory)
queue.get(timeout=5) → event: ping`,
    failure: "Over the limit: HTTP 429 with a message pointing to replay or offline. Silence while the model thinks: a ping every 5 s keeps proxies from closing the stream.",
    failChip: "429 rate_limited",
    code: ["services/agent-api/app/main.py"],
  },
  {
    key: "agent",
    label: "04 · plan",
    title: "LangGraph agent",
    role: "Model chooses which evidence to fetch",
    what: "The agent node sends the 8 tool specs to the model (temperature 0). The graph loops agent → tools until the model has enough evidence or the tool budget is spent.",
    contract: `candidates(cfg) =
  gemini-3.5-flash-lite → gemini-3.5-flash
  → GROQ_MODEL (if GROQ_API_KEY) → offline`,
    failure: "Provider error (429, 503, timeout) moves to the next (endpoint, model) in the chain and resets the trace with a notice. If every provider fails, the offline planner answers with the same tools and rules.",
    failChip: "429 → next model → offline",
    code: ["services/agent-api/app/agent/llm.py", "services/agent-api/app/agent/service.py", "services/agent-api/app/agent/graph.py"],
  },
  {
    key: "tools",
    label: "05 · tools",
    title: "Bounded tools",
    role: "8 read-only tools, typed arguments",
    what: "Each call is validated by a Pydantic model and runs one fixed query. Log text is returned as untrusted_text with a possible_prompt_injection flag. Large payloads are truncated.",
    contract: `MAX_TOOL_CALLS = 8
MAX_TOOL_CHARS = 9000
→ { ..., "evidence": [record ids], "summary" }`,
    failure: "Unknown id or bad argument returns {error, message, hint} to the model instead of an exception; the 9th call returns budget_exceeded.",
    failChip: "{ error, hint }",
    code: ["services/agent-api/app/tools.py", "services/agent-api/app/agent/graph.py"],
  },
  {
    key: "domain",
    label: "06 · rules",
    title: "Deterministic domain",
    role: "Rules decide, not the model",
    what: "ETL normalises the raw events and keeps raw values beside them. The release gate, flake levels and defect types are pure functions over the versioned rule file R1–R6.",
    contract: `evaluate(ds, run_id) →
  { verdict, deciding_rule, policy_id,
    rules_version, checks[] }`,
    failure: "Missing or contradictory evidence never becomes PASS: an incomplete gating test or a CI summary that disagrees with its attempts yields HOLD_MANUAL_REVIEW (R5, R6).",
    failChip: "HOLD_MANUAL_REVIEW",
    code: ["services/agent-api/app/etl.py", "services/agent-api/app/domain/gate.py", "services/agent-api/knowledge/testops_rules.yaml"],
  },
  {
    key: "validate",
    label: "07 · verify",
    title: "Validator",
    role: "5 checks before anyone sees it",
    what: "The draft is checked against what the tools actually returned in this request. A failed check sends the draft back to compose with the exact defects, once.",
    contract: `evidence_ids_resolve
evidence_retrieved_this_request
claims_have_evidence
verdict_matches_policy · numbers_grounded`,
    failure: "Still failing after one revision: the answer ships with validation.passed = false and the unsupported claims flagged. It is never silently passed.",
    failChip: "revise ×1 → flagged",
    code: ["services/agent-api/app/agent/validator.py", "services/agent-api/app/agent/graph.py"],
  },
  {
    key: "response",
    label: "08 · answer",
    title: "Response",
    role: "Verdict, cited claims, mode label",
    what: "The final event carries the policy verdict, claims with evidence ids, the tool trace and validation result. The UI renders the verdict from the policy output, not from the text.",
    contract: `event: final
{ mode, model, gate.verdict, claims[{text, evidence}],
  tool_trace, validation, notice }`,
    failure: "Every degraded answer says so: mode is offline or replay and the notice names the reason.",
    failChip: "mode: offline + notice",
    code: ["services/agent-api/app/schemas.py", "apps/web/components/console/ResultView.tsx"],
  },
];

const STEP_MS = 2200;

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

export function RequestLifecycle() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [path, setPath] = useState<Path>("happy");
  const reduced = useReducedMotion();
  const last = STAGES.length - 1;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setActive((i) => {
        if (i >= last) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, last]);

  const play = () => {
    if (active >= last) setActive(0);
    setPlaying((p) => !p);
  };
  const go = (i: number) => {
    setPlaying(false);
    setActive(Math.max(0, Math.min(last, i)));
  };
  const stage = STAGES[active] ?? STAGES[0]!;
  const failing = path === "failure";
  const pct = (active / last) * 100;

  return (
    <section aria-labelledby="lifecycle-title">
      <SectionHeading eyebrow="Request lifecycle" title={<>One question, <em className="italic text-accent">eight hops</em>, every one cited</>} id="lifecycle-title">
        Step through what happens between the click and the verdict. Switch to the failure path to see how each hop degrades instead of breaking.
      </SectionHeading>

      <div className="overflow-hidden rounded-[6px] border border-line-strong bg-[#100c08]">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div role="group" aria-label="Walkthrough controls" className="flex items-center gap-1">
            <CtrlButton label="Previous stage" onClick={() => go(active - 1)} disabled={active === 0}>
              ‹
            </CtrlButton>
            <CtrlButton label={playing ? "Pause walkthrough" : "Play walkthrough"} onClick={play} wide>
              {playing ? "❚❚ Pause" : active >= last ? "↻ Replay" : "▶ Play"}
            </CtrlButton>
            <CtrlButton label="Next stage" onClick={() => go(active + 1)} disabled={active === last}>
              ›
            </CtrlButton>
          </div>
          <div role="radiogroup" aria-label="Path" className="ml-auto flex rounded-[3px] border border-line p-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em]">
            {(["happy", "failure"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={path === p}
                onClick={() => setPath(p)}
                className={cx(
                  "rounded-[2px] px-2.5 py-1 transition-colors",
                  path === p ? (p === "failure" ? "bg-block/15 text-block" : "bg-accent/15 text-accent") : "text-muted hover:text-ink",
                )}
              >
                {p === "happy" ? "Happy path" : "Failure path"}
              </button>
            ))}
          </div>
        </div>

        {/* Scrubber */}
        <div className="px-3 pt-3">
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={active}
            onChange={(e) => go(Number(e.target.value))}
            aria-label="Stage"
            aria-valuetext={`${stage.label} ${stage.title}`}
            className="w-full accent-[var(--accent)]"
          />
        </div>

        {/* Connector with packets (desktop) */}
        <div aria-hidden className="relative hidden px-[calc(100%/16)] pt-2 lg:block">
          <svg viewBox="0 0 1000 20" preserveAspectRatio="none" className="block h-5 w-full overflow-visible">
            <line x1="0" y1="10" x2="1000" y2="10" stroke="var(--line-strong)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <line
              x1="0"
              y1="10"
              x2={(active / last) * 1000}
              y2="10"
              stroke={failing ? "var(--block)" : "var(--accent)"}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              style={{ transition: reduced ? undefined : "all 600ms ease" }}
            />
            {!reduced &&
              playing &&
              [0, 1, 2].map((n) => (
                <circle key={n} r="4" cy="10" fill={failing ? "var(--block)" : "var(--accent)"}>
                  <animate attributeName="cx" from={(Math.max(0, active - 1) / last) * 1000} to={(active / last) * 1000} dur="1.2s" begin={`${n * 0.4}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0;1;1;0" dur="1.2s" begin={`${n * 0.4}s`} repeatCount="indefinite" />
                </circle>
              ))}
            {STAGES.map((s, i) => (
              <circle key={s.key} cx={(i / last) * 1000} cy="10" r={i === active ? 6 : 4} fill={i <= active ? (failing ? "var(--block)" : "var(--accent)") : "var(--line-strong)"} />
            ))}
          </svg>
        </div>

        {/* Stages */}
        <ol className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-8" aria-label="Stages">
          {STAGES.map((s, i) => {
            const on = i === active;
            const done = i < active;
            return (
              <li key={s.key} className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={on ? "step" : undefined}
                  className={cx(
                    "flex h-full w-full min-w-0 flex-col rounded-[4px] border p-2.5 text-left transition-colors",
                    on ? (failing ? "border-block/60 bg-block/[0.07]" : "border-accent/70 bg-accent/[0.08]") : done ? "border-line-strong bg-surface" : "border-line bg-surface/50 hover:border-line-strong",
                  )}
                >
                  <span className={cx("label-mono text-[9.5px]", on ? (failing ? "text-block" : "text-accent") : "text-faint")}>{s.label}</span>
                  <span className="mt-1 font-serif text-[15px] leading-tight text-ink">{s.title}</span>
                  <span className="mt-1 text-[11.5px] leading-snug text-muted">{s.role}</span>
                  {failing && (
                    <span className={cx("mt-2 inline-block max-w-full self-start break-words rounded-[3px] border px-1.5 py-px font-mono text-[10px]", on ? "border-block/50 text-block" : "border-line text-faint")}>
                      {s.failChip}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        {/* Detail */}
        <div className="border-t border-line px-3 py-4 sm:px-5" aria-live="polite">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={cx("label-mono text-[10.5px]", failing ? "text-block" : "text-accent")}>{stage.label}</span>
            <h3 className="font-serif text-[22px] leading-tight text-ink">{stage.title}</h3>
            {active === last && <ModeBadge mode={failing ? "offline" : "live"} />}
            <span className="ml-auto font-mono text-[10.5px] tabular-nums text-faint">
              {active + 1}/{STAGES.length} · {Math.round(pct)}%
            </span>
          </div>
          {failing && active === 3 && <FallbackChain />}
          <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-3 text-[14px] leading-relaxed">
              <Detail label={failing ? "Happy path" : "What happens"}>{stage.what}</Detail>
              <Detail label={failing ? "When it fails" : "Failure mode"} tone={failing ? "bad" : undefined}>
                {stage.failure}
              </Detail>
            </div>
            <div className="min-w-0 space-y-3">
              <div>
                <div className="label-mono mb-1.5 text-[10px] text-faint">Contract in / out</div>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-[3px] border border-line bg-canvas px-3 py-2 font-mono text-[11.5px] leading-relaxed text-accent-hover [overflow-wrap:anywhere]">{stage.contract}</pre>
              </div>
              <div>
                <div className="label-mono mb-1.5 text-[10px] text-faint">Code path</div>
                <ul className="flex flex-wrap gap-1.5">
                  {stage.code.map((c) => (
                    <li key={c} className="max-w-full break-all rounded-[3px] border border-line bg-sunken px-1.5 py-px font-mono text-[11px] text-ink">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CtrlButton({ children, label, onClick, disabled, wide }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; wide?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "rounded-[3px] border border-line-strong font-mono text-[11px] uppercase tracking-[0.08em] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-40",
        wide ? "min-w-[6.5rem] px-3 py-1.5" : "px-2.5 py-1.5",
      )}
    >
      {children}
    </button>
  );
}

function Detail({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "bad" }) {
  return (
    <div>
      <div className={cx("label-mono mb-1 text-[10px]", tone === "bad" ? "text-block" : "text-faint")}>{label}</div>
      <p className="text-muted">{children}</p>
    </div>
  );
}

// The degradation order of service.ask_stream: each provider is tried, then the offline planner answers.
function FallbackChain() {
  const steps = [
    { name: "gemini-3.5-flash-lite", out: "429" },
    { name: "gemini-3.5-flash", out: "503" },
    { name: "GROQ_MODEL", out: "429" },
    { name: "offline planner", out: "answers" },
  ];
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-[11px]" aria-label="Model fallback chain">
      {steps.map((s, i) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span className={cx("rounded-[3px] border px-1.5 py-0.5", i === steps.length - 1 ? "border-ship/50 text-ship" : "border-block/40 text-muted line-through decoration-block/70")}>
            {s.name}
          </span>
          <span className={i === steps.length - 1 ? "text-ship" : "text-block"}>{s.out}</span>
          {i < steps.length - 1 && <span aria-hidden className="text-faint">→</span>}
        </li>
      ))}
      <li className="text-faint">· example statuses; each hop emits a notice event</li>
    </ol>
  );
}
