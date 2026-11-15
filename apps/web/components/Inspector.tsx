"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { attemptIdFromEvent, idKind } from "@/lib/ids";
import type { AttemptRecord, RecordResponse, RunDetails } from "@/lib/types";
import { AttemptTimeline, RawVsNormal, TimestampView, UntrustedLog } from "./Attempts";
import { ChipList, EvidenceChip, LinkifiedText } from "./Evidence";
import { InspectorContext } from "./inspector-context";
import { buttonClass, cx, Field, LoadingBlock, Pill, severityTone, statusTone, VerdictBadge } from "./ui";

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<string[]>([]);
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = useCallback((id: string) => {
    setStack((s) => {
      if (s.length === 0) returnFocus.current = document.activeElement as HTMLElement | null;
      if (s[s.length - 1] === id) return s;
      return [...s, id];
    });
  }, []);

  const close = useCallback(() => {
    setStack([]);
    // Restore focus to the chip that opened the drawer.
    requestAnimationFrame(() => returnFocus.current?.focus?.());
  }, []);

  const back = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const ctx = useMemo(() => ({ open }), [open]);
  const current = stack[stack.length - 1];

  return (
    <InspectorContext.Provider value={ctx}>
      {children}
      {current && <Drawer id={current} depth={stack.length} onClose={close} onBack={back} />}
    </InspectorContext.Provider>
  );
}

function Drawer({ id, depth, onClose, onBack }: { id: string; depth: number; onClose: () => void; onBack: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtn.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      // Keep keyboard focus inside the dialog.
      const items = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])');
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40">
      <div aria-hidden className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspector-title"
        className="absolute inset-0 flex flex-col overflow-y-auto bg-surface shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(640px,92vw)] sm:border-l sm:border-line"
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
          {depth > 1 && (
            <button type="button" onClick={onBack} className={buttonClass("ghost")} aria-label="Back to previous record">
              ← Back
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-faint">Evidence inspector · {idKind(id)}</div>
            <h2 id="inspector-title" className="break-all font-mono text-sm font-semibold text-ink">
              {id}
            </h2>
          </div>
          <button ref={closeBtn} type="button" onClick={onClose} className={buttonClass("secondary")} aria-label="Close inspector">
            Close
          </button>
        </div>
        <div className="flex-1 p-4" aria-live="polite">
          <RecordLoader key={id} id={id} />
        </div>
      </div>
    </div>
  );
}

function RecordLoader({ id }: { id: string }) {
  const [state, setState] = useState<{ rec?: RecordResponse; via?: string; error?: unknown }>({});

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        setState({ rec: await api.record(id, ctrl.signal) });
      } catch (e) {
        const alias = attemptIdFromEvent(id);
        if (alias && e instanceof ApiError && e.isNotFound) {
          try {
            setState({ rec: await api.record(alias, ctrl.signal), via: alias });
            return;
          } catch (e2) {
            if (!ctrl.signal.aborted) setState({ error: e2 });
            return;
          }
        }
        if (!ctrl.signal.aborted) setState({ error: e });
      }
    })();
    return () => ctrl.abort();
  }, [id]);

  if (state.error) {
    const nf = state.error instanceof ApiError && state.error.isNotFound;
    return (
      <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
        <div className="font-semibold">{nf ? "Record not found" : "Could not load record"}</div>
        <p className="mt-1">{errorMessage(state.error)}</p>
        {nf && <p className="mt-2 text-xs">A cited id that does not resolve is exactly what the response validator is built to catch.</p>}
      </div>
    );
  }
  if (!state.rec) return <LoadingBlock label="Loading record" rows={5} />;

  return (
    <div className="space-y-4">
      {state.via && (
        <p className="rounded-md bg-sunken px-3 py-2 text-xs text-muted">
          Raw runner event shown through its attempt record <span className="font-mono">{state.via}</span>.
        </p>
      )}
      <RecordBody rec={state.rec} />
      <details className="rounded-lg border border-line">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted">Raw JSON from /api/records</summary>
        <pre className="max-h-96 overflow-auto border-t border-line bg-sunken p-3 font-mono text-[11px] leading-relaxed text-ink">
          {JSON.stringify(state.rec, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function RecordBody({ rec }: { rec: RecordResponse }) {
  switch (rec.kind) {
    case "attempt":
      return <AttemptBody r={rec.record} />;
    case "ci_summary": {
      const r = rec.record;
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            CI summary webhook for <EvidenceChip id={r.run_id} />. Advisory only: test-runner attempt results outrank it (rule R5).
          </p>
          <RawVsNormal label="Status" raw={r.status_raw} normal={r.status} />
          <TimestampView label="Started" ts={r.started} />
          <TimestampView label="Finished" ts={r.finished} />
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Ingest id">
              <span className="font-mono">{r.ingest_id ?? "—"}</span>
            </Field>
            <Field label="Received at">
              <span className="font-mono text-xs">{r.received_at ?? "—"}</span>
            </Field>
          </dl>
        </div>
      );
    }
    case "log": {
      const r = rec.record;
      return (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Run">
              <EvidenceChip id={r.run_id} />
            </Field>
            <Field label="Attempt">{r.attempt_id ? <EvidenceChip id={r.attempt_id} /> : "—"}</Field>
          </dl>
          <UntrustedLog text={r.untrusted_text} flagged={r.possible_prompt_injection} level={r.level} />
          {r.possible_prompt_injection && (
            <p className="text-xs text-muted">
              This line contains instructions aimed at an AI assistant. Tools return log text as quoted data; the agent never follows
              it and the verdict comes from the policy function either way.
            </p>
          )}
          <TimestampView label="Timestamp" ts={{ raw: r.ts_raw, utc: r.ts_utc, format: "not reported by record API" }} />
        </div>
      );
    }
    case "finding": {
      const r = rec.record;
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={severityTone(r.severity)}>{r.severity}</Pill>
            <Pill mono>{r.kind}</Pill>
            <span className="text-xs text-muted">count {r.count}</span>
          </div>
          <p className="text-sm text-ink">
            <LinkifiedText text={r.detail} />
          </p>
          {r.record_ids.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Affected records</div>
              <ChipList ids={r.record_ids} />
            </div>
          )}
        </div>
      );
    }
    case "test": {
      const r = rec.record;
      return (
        <dl className="grid grid-cols-2 gap-3">
          <Field label="Name">{r.name}</Field>
          <Field label="Service">{r.service_id}</Field>
          <Field label="Suite">
            <Pill mono tone={r.suite === "critical" ? "violet" : "neutral"}>
              {r.suite}
            </Pill>
            {r.suite === "critical" && <span className="ml-2 text-xs text-muted">gating</span>}
          </Field>
          <Field label="Kind">{r.kind}</Field>
        </dl>
      );
    }
    case "policy": {
      const r = rec.record;
      return (
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink">{r.name}</p>
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Source of truth (in order)</div>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {r.source_of_truth.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Gate precedence (first match wins)</div>
            <ol className="space-y-1">
              {r.gate.precedence.map((p, i) => (
                <li key={p.when} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-5 text-right font-mono text-xs text-faint">{i + 1}.</span>
                  <span className="font-mono text-xs">{p.when}</span>
                  <span aria-hidden className="text-faint">→</span>
                  <VerdictBadge verdict={p.verdict} size="sm" />
                  <Pill mono>{p.rule}</Pill>
                </li>
              ))}
            </ol>
          </div>
        </div>
      );
    }
    case "release_candidate": {
      const r = rec.record;
      return (
        <dl className="grid grid-cols-2 gap-3">
          <Field label="Service">{r.service_id}</Field>
          <Field label="Version">
            <span className="font-mono">{r.version}</span>
          </Field>
          <Field label="Candidate run">
            <EvidenceChip id={r.run_id} />
          </Field>
        </dl>
      );
    }
    case "run":
      return <RunBody d={rec} />;
    default:
      return null;
  }
}

function AttemptBody({ r }: { r: AttemptRecord }) {
  const dup = r.result_ingest_ids.length > 1;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Run">
          <EvidenceChip id={r.run_id} />
        </Field>
        <Field label="Test">
          <EvidenceChip id={r.test_id} />
        </Field>
        <Field label="Attempt">
          <span className="font-mono">#{r.attempt_no}</span>
        </Field>
        <Field label="Environment">{r.environment ?? "—"}</Field>
        <Field label="Worker">{r.worker ?? "—"}</Field>
        <Field label="Duration">{r.duration_s != null ? `${r.duration_s}s` : <span className="text-faint">unknown (not imputed)</span>}</Field>
      </dl>
      <div className="rounded-lg border border-line">
        <div className="border-b border-line px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">Status</div>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <Pill tone={statusTone(r.status ?? "NO_RESULT")} mono>
            {r.status ?? "NO_RESULT"}
          </Pill>
          {r.status == null && <span className="text-xs text-muted">No result event was received for this attempt.</span>}
          {r.error_class && <span className="font-mono text-xs">{r.error_class}</span>}
        </div>
        {r.message && <p className="px-3 pb-3 text-xs text-muted">“{r.message}”</p>}
      </div>
      <TimestampView label="Started" ts={r.started} />
      <TimestampView label="Finished" ts={r.finished} />
      <div className="rounded-lg border border-line p-3 text-sm">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">Source events</div>
        <dl className="space-y-2">
          <Field label="Started event">
            <span className="break-all font-mono text-xs">{r.started_event_id ?? "—"}</span>
          </Field>
          <Field label="Result event">
            <span className="break-all font-mono text-xs">{r.result_event_id ?? <em className="text-faint">missing</em>}</span>
          </Field>
          <Field label="Result ingest ids">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{r.result_ingest_ids.length ? r.result_ingest_ids.join(", ") : "—"}</span>
              {dup && <Pill tone="amber">ingested {r.result_ingest_ids.length}× · counted once</Pill>}
            </span>
          </Field>
        </dl>
      </div>
    </div>
  );
}

function RunBody({ d }: { d: RunDetails }) {
  const s = d.ci_summary;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Pipeline">
          <span className="font-mono text-xs">{d.run.pipeline_id}</span>
        </Field>
        <Field label="Run #">{d.run.run_number}</Field>
        <Field label="Commit">
          <span className="font-mono text-xs">{d.run.commit}</span>
        </Field>
        <Field label="Tests">
          {d.tests_passed_first_attempt}/{d.tests_total} clean
        </Field>
      </dl>
      <TimestampView label="Queued" ts={d.run.queued} />
      <div className="rounded-lg border border-line p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-faint">
          CI summary (advisory)
          {s && <EvidenceChip id={s.event_id} />}
        </div>
        {s ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">&quot;{s.status_raw}&quot;</span>
            <span aria-hidden className="text-faint">→</span>
            <Pill tone={statusTone(s.status)} mono>
              {s.status ?? "?"}
            </Pill>
          </div>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-300">No CI summary event. Not assumed PASS (R6).</p>
        )}
      </div>
      {d.tests_needing_attention.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">Tests needing attention</div>
          <div className="space-y-4">
            {d.tests_needing_attention.map((o) => (
              <div key={o.test_id} className="rounded-lg border border-line p-3">
                <AttemptTimeline outcome={o} />
              </div>
            ))}
          </div>
        </div>
      )}
      {d.logs.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-faint">Logs</div>
          <p className="text-xs text-muted">{d.logs_note}</p>
          {d.logs.map((l) => (
            <UntrustedLog key={l.event_id} text={l.untrusted_text} flagged={l.possible_prompt_injection} level={l.level} eventId={l.event_id} />
          ))}
        </div>
      )}
      {d.data_quality_findings.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">Data-quality findings</div>
          <ul className="space-y-2">
            {d.data_quality_findings.map((f) => (
              <li key={f.id} className={cx("rounded-md border border-line p-2 text-sm")}>
                <EvidenceChip id={f.id} /> <span className="font-mono text-xs text-muted">{f.kind}</span>
                <p className="mt-1 text-xs text-muted">
                  <LinkifiedText text={f.detail} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
