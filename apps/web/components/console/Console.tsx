"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiError, api, ASK_TIMEOUT_MS, errorMessage } from "@/lib/api";
import { useHealth, useOverview } from "@/lib/hooks";
import type { AskRequest, AskResponse, Mode } from "@/lib/types";
import { buttonClass, Card, cx, ModeBadge, PanelBar, Spinner, StatusChip } from "../ui";
import { askStream, StreamError, type StreamEvent } from "@/lib/stream";
import { LiveTrace } from "./LiveTrace";
import { ResultView } from "./ResultView";

const PRESET_LABEL: Record<string, string> = {
  A: "Failure triage",
  B: "Flaky tests & cost",
  C: "Conflicting evidence",
};

// Fired by the console hero to run a preset from outside this component.
export const RUN_PRESET_EVENT = "testops:run-preset";

const MODES: { id: Mode; label: string; explain: string }[] = [
  {
    id: "live",
    label: "Live model",
    explain: "The model plans tool calls and writes the explanation. The verdict still comes from the policy function.",
  },
  {
    id: "replay",
    label: "Replayed trace",
    explain: "Plays back a recorded live run for this preset, re-checked against current data. No model call.",
  },
  {
    id: "offline",
    label: "Offline rules",
    explain: "No language model: keyword planner and templates over the same tools, policy and validator.",
  },
];

type RunState =
  | { status: "idle" }
  | { status: "loading"; req: AskRequest; seq: number; events: StreamEvent[]; startedAt: number }
  | { status: "done"; req: AskRequest; res: AskResponse; events: StreamEvent[]; startedAt: number }
  | { status: "error"; req: AskRequest; error: unknown; events: StreamEvent[]; startedAt: number };

export function Console() {
  const health = useHealth();
  const overview = useOverview();
  const presets = overview.data?.presets ?? [];

  const [question, setQuestion] = useState("");
  const [chosenMode, setChosenMode] = useState<Mode | null>(null);
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const qId = useId();

  const liveOk = health.data?.model.configured ?? false;
  const replays = health.data?.replays ?? [];
  const scenario = presets.find((p) => p.question === question.trim())?.id ?? null;
  const replayOk = (s: string | null) => !!s && replays.includes(`scenario-${s.toUpperCase()}`);
  const defaultMode: Mode = liveOk ? "live" : "offline";
  const isAvailable = (m: Mode, s: string | null) => (m === "live" ? liveOk : m === "replay" ? replayOk(s) : true);
  // Replay stays selectable while typing; it only applies to questions that have a recorded trace.
  const selectable = (m: Mode) => (m === "live" ? liveOk : m === "replay" ? replays.length > 0 : true);
  const mode: Mode = chosenMode && selectable(chosenMode) ? chosenMode : defaultMode;
  const replayBlocked = mode === "replay" && !replayOk(scenario);

  const submit = async (req: AskRequest) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    seqRef.current += 1;
    const seq = seqRef.current;
    const startedAt = performance.now();
    const events: StreamEvent[] = [];
    setRun({ status: "loading", req, seq, events: [], startedAt });
    const onEvent = (ev: StreamEvent) => {
      if (abortRef.current !== ctrl) return;
      if (ev.type === "notice" && ev.data.reset) events.length = 0; // primary model failed: the fallback restarts the graph
      events.push(ev);
      setRun({ status: "loading", req, seq, events: [...events], startedAt });
    };
    try {
      let res: AskResponse;
      try {
        res = await askStream(req, onEvent, ctrl.signal);
      } catch (e) {
        // An HTTP error (rate limit, validation) is final; a dropped stream falls back to the plain endpoint.
        if (ctrl.signal.aborted || (e instanceof StreamError && e.status != null)) throw e;
        onEvent({ type: "notice", at: performance.now() - startedAt, data: { message: "Stream interrupted; fetching the answer without streaming." } });
        res = await api.ask(req, ctrl.signal);
      }
      if (abortRef.current === ctrl) setRun({ status: "done", req, res, events: [...events], startedAt });
    } catch (e) {
      if (abortRef.current !== ctrl) return;
      if ((e instanceof ApiError && e.kind === "aborted") || (e instanceof DOMException && e.name === "AbortError")) setRun({ status: "idle" });
      else {
        const err = e instanceof StreamError ? new ApiError("http", e.message, e.status ?? undefined) : e;
        setRun({ status: "error", req, error: err, events: [...events], startedAt });
      }
    }
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  const runPresetRef = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    const onRun = (e: Event) => runPresetRef.current(String((e as CustomEvent<string>).detail));
    window.addEventListener(RUN_PRESET_EVENT, onRun);
    return () => window.removeEventListener(RUN_PRESET_EVENT, onRun);
  }, []);

  useEffect(() => {
    if (run.status === "done" || run.status === "error") {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [run.status]);

  const ask = (q: string, s: string | null, m: Mode = mode) => {
    const text = q.trim();
    if (text.length < 3) return;
    void submit({ question: text, mode: isAvailable(m, s) ? m : defaultMode, scenario: s });
  };

  const runPreset = (id: string, q: string) => {
    setQuestion(q);
    ask(q, id);
  };

  useEffect(() => {
    runPresetRef.current = (id: string) => {
      const p = presets.find((x) => x.id === id);
      if (p && run.status !== "loading") runPreset(p.id, p.question);
    };
  });

  const busy = run.status === "loading";
  const tooShort = question.trim().length < 3;
  const canSubmit = !busy && !tooShort && !replayBlocked;

  return (
    <div className="space-y-6">
      <Card aria-labelledby="ask-title">
        <PanelBar label="agent · read-only">
          <StatusChip tone="amber" dot>
            gate: deterministic · verify
          </StatusChip>
          <ModeBadge mode={mode} />
        </PanelBar>
        <div className="border-b border-line px-4 py-4 sm:px-5">
          <h2 id="ask-title" className="font-serif text-[1.45rem] leading-tight tracking-[-0.02em] text-ink">
            Ask the agent
          </h2>
          <p className="mt-1 text-[13.5px] text-muted">Read-only. The agent reaches data only through bounded tools; the policy function decides verdicts.</p>
        </div>
        <div className="space-y-5 p-4 sm:p-5">
          <div>
            <div className="label-mono mb-2 text-faint" id="presets-label">
              Demo scenarios
            </div>
            <div className="grid gap-2 sm:grid-cols-3" role="group" aria-labelledby="presets-label">
              {(presets.length ? presets : ["A", "B", "C"].map((id) => ({ id, question: "" }))).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!p.question || busy}
                  onClick={() => runPreset(p.id, p.question)}
                  className={cx(
                    "group rounded-[4px] border bg-canvas/40 p-3.5 text-left transition-colors hover:border-accent/60 hover:bg-accent/[0.05] disabled:opacity-60",
                    run.status !== "idle" && run.req.scenario === p.id ? "border-accent/70 bg-accent/[0.07]" : "border-line",
                  )}
                >
                  <div className="label-mono flex items-center gap-2 text-[10.5px]">
                    <span className="text-accent">{p.id}</span>
                    <span aria-hidden className="text-faint">·</span>
                    <span className="text-ink">{PRESET_LABEL[p.id] ?? `Preset ${p.id}`}</span>
                    <span aria-hidden className="ml-auto text-faint transition-colors group-hover:text-accent">→</span>
                  </div>
                  <div className="mt-2 line-clamp-2 text-[13px] leading-snug text-muted">{p.question || "Loading…"}</div>
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) ask(question, scenario);
            }}
            className="space-y-3"
          >
            <div>
              <label htmlFor={qId} className="label-mono mb-2 block text-faint">
                Your question
              </label>
              <textarea
                id={qId}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (canSubmit) ask(question, scenario);
                  }
                }}
                rows={3}
                maxLength={600}
                placeholder="e.g. Can we ship checkout-web 5.8.0? Which payments tests retried last week?"
                className="block w-full resize-y rounded-[3px] border border-line-strong bg-canvas px-3 py-2.5 text-[15px] text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
              />
              <div className="mt-1.5 flex justify-between gap-3 font-mono text-[10.5px] text-faint">
                <span>{scenario ? `Matches preset ${scenario}` : "Free-form question"} · Ctrl/⌘+Enter to ask</span>
                <span className="tabular">{question.length}/600</span>
              </div>
            </div>

            <fieldset>
              <legend className="label-mono mb-2 text-faint">Mode</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {MODES.map((m) => {
                  const available = selectable(m.id);
                  const checked = mode === m.id;
                  const why =
                    m.id === "live" && !liveOk
                      ? "No model key configured on this server."
                      : m.id === "replay" && replays.length === 0
                        ? "No recorded traces on this server."
                        : m.id === "replay" && checked && replayBlocked
                          ? "Recorded traces exist only for the preset questions."
                          : null;
                  return (
                    <label
                      key={m.id}
                      className={cx(
                        "relative flex cursor-pointer gap-2.5 rounded-[4px] border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                        checked ? "border-accent/60 bg-accent/[0.06]" : "border-line hover:border-line-strong hover:bg-sunken/60",
                        !available && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input
                        type="radio"
                        name="mode"
                        value={m.id}
                        checked={checked}
                        disabled={!available}
                        onChange={() => setChosenMode(m.id)}
                        className="mt-0.5 accent-[var(--accent)]"
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-ink">
                          {m.label} <ModeBadge mode={m.id} />
                        </span>
                        <span className="mt-1 block text-[12.5px] leading-snug text-muted">{m.explain}</span>
                        {why && <span className="mt-1 block text-[12px] font-medium text-accent">{why}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={!canSubmit} className={buttonClass("primary", "md")}>
                {busy ? <Spinner /> : null}
                Ask in {MODES.find((m) => m.id === mode)?.label.toLowerCase()} mode
                {!busy && <span aria-hidden>→</span>}
              </button>
              {busy && (
                <button type="button" onClick={() => abortRef.current?.abort()} className={buttonClass("ghost", "md")}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </Card>

      <div ref={resultRef} className="scroll-mt-28">
        <div className="sr-only" aria-live="polite" role="status">
          {run.status === "loading" && "Asking the agent…"}
          {run.status === "done" &&
            `Answer ready${run.res.gate ? `. Verdict ${run.res.gate.verdict}, rule ${run.res.gate.deciding_rule}` : ""}. Validation ${run.res.validation.passed ? "passed" : "failed"}.`}
          {run.status === "error" && `Request failed: ${errorMessage(run.error)}`}
        </div>
        {run.status !== "idle" && (
          <div className="mb-4">
            <LiveTrace key={run.startedAt} events={run.events} running={run.status === "loading"} startedAt={run.startedAt} res={run.status === "done" ? run.res : undefined} />
          </div>
        )}
        {run.status === "loading" && run.events.length === 0 && <LoadingCard key={run.seq} mode={run.req.mode} />}
        {run.status === "error" && (
          <ErrorCard
            error={run.error}
            mode={run.req.mode}
            onRetry={() => void submit(run.req)}
            onOffline={() => void submit({ ...run.req, mode: "offline" })}
          />
        )}
        {run.status === "done" && <ResultView res={run.res} requestedMode={run.req.mode} />}
      </div>
    </div>
  );
}

function LoadingCard({ mode }: { mode: Mode }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, (now - startedAt) / 1000);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4 p-5">
        <Spinner className="size-5 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <span className="label-mono text-ink">Working</span>
            <ModeBadge mode={mode} />
            <span className="tabular font-mono text-muted">{s.toFixed(1)}s</span>
          </div>
          <div className="mt-1 font-mono text-[11.5px] text-muted">
            Planning <span aria-hidden>→</span> Calling tools <span aria-hidden>→</span> Validating
          </div>
        </div>
        <div className="font-mono text-[10.5px] text-faint">times out after {Math.round(ASK_TIMEOUT_MS / 1000)}s</div>
      </div>
    </Card>
  );
}

function ErrorCard({ error, mode, onRetry, onOffline }: { error: unknown; mode: Mode; onRetry: () => void; onOffline: () => void }) {
  const e = error instanceof ApiError ? error : null;
  const title =
    e?.kind === "timeout"
      ? "The agent did not answer in time"
      : e?.status === 429
        ? "Rate limit reached"
        : e?.kind === "network"
          ? "Cannot reach the agent API"
          : "The request failed";
  return (
    <div role="alert" className="rounded-[4px] border border-block/45 bg-block/[0.07] p-5 text-sm text-ink">
      <div className="label-mono text-block">{title}</div>
      <p className="mt-1.5 text-muted">{errorMessage(error)}</p>
      {(e?.code || e?.requestId) && (
        <p className="mt-1 font-mono text-xs text-faint">
          {e.code && <>code {e.code}</>} {e.requestId && <>· request {e.requestId}</>}
        </p>
      )}
      <p className="mt-2 text-xs text-faint">Your question is kept above.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className={buttonClass("secondary")}>
          Retry
        </button>
        {mode !== "offline" && (
          <button type="button" onClick={onOffline} className={buttonClass("primary")}>
            Try offline mode
          </button>
        )}
      </div>
    </div>
  );
}
