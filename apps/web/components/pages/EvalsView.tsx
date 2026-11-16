"use client";

import { useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { isRecordId } from "@/lib/ids";
import type { EvalCase, EvalCheck, EvalReport, EvalRun, Mode } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { EvidenceChip, LinkifiedText } from "../Evidence";
import { Markdown } from "../Markdown";
import { buttonClass, Card, CardHeader, cx, ErrorBlock, LoadingBlock, ModeBadge, Pill } from "../ui";

const HARNESS = [
  {
    title: "Golden scenarios",
    body: "The three demo questions plus variants, each with the expected verdict, deciding rule and the record ids that must be cited.",
  },
  {
    title: "Adversarial prompts",
    body: "Prompt injection planted in CI logs and typed into the question, unknown services and runs, and pressure to say SHIP. Expected behaviour: ignore, refuse or HOLD, never comply.",
  },
  {
    title: "Grounding checks",
    body: "Every cited id resolves to a record, every number appears in tool output, and the verdict in the text equals the policy verdict.",
  },
  {
    title: "When it runs",
    body: "Offline mode on every commit (deterministic, no model key). Live mode on demand against the configured model, with the same assertions.",
  },
];

const REPORT_LABEL: Record<string, string> = { offline: "Offline rules (CI)", live: "Live model" };

const asMode = (m: unknown): Mode | null => (m === "live" || m === "replay" || m === "offline" ? m : null);

function countCases(r: EvalRun) {
  const cases = (r.suites ?? []).flatMap((s) => s.cases ?? []);
  return { passed: r.summary?.passed ?? cases.filter((c) => c.passed).length, total: r.summary?.total ?? cases.length };
}

export function EvalsView() {
  const { data, error, loading, reload } = useApi("evals", () => api.evals());
  if (loading) return <Card><LoadingBlock rows={5} label="Loading eval report" /></Card>;
  if (error instanceof ApiError && error.isNotFound) return <EmptyState />;
  if (error || !data) return <ErrorBlock message={errorMessage(error)} onRetry={reload} />;
  return <Reports report={data} />;
}

function EmptyState() {
  return (
    <div className="space-y-4">
      <Card>
        <div className="p-5">
          <Pill tone="amber">No eval report published yet</Pill>
          <p className="mt-3 max-w-2xl text-sm text-ink">The API has no eval report. Results appear here once the harness has run. This is what it checks:</p>
        </div>
      </Card>
      <HarnessGrid />
    </div>
  );
}

function HarnessGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {HARNESS.map((h) => (
        <Card key={h.title} as="article">
          <div className="p-4">
            <h3 className="font-serif text-[18px] leading-snug text-ink">{h.title}</h3>
            <p className="mt-1 text-sm text-muted">{h.body}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Reports({ report }: { report: EvalReport }) {
  const entries: [string, EvalRun][] = report.reports && Object.keys(report.reports).length ? Object.entries(report.reports) : [[report.mode ?? "report", report]];
  // Offline first: it is the deterministic CI gate; live is the on-demand check.
  entries.sort((a, b) => (a[0] === "offline" ? -1 : b[0] === "offline" ? 1 : 0));
  const [active, setActive] = useState(entries[0]![0]);
  const current = entries.find((e) => e[0] === active)?.[1] ?? entries[0]![1];

  return (
    <div className="space-y-6">
      {entries.length > 1 && (
        <div role="tablist" aria-label="Eval runs" className="inline-flex flex-wrap gap-1 rounded-[4px] border border-line bg-surface p-1">
          {entries.map(([key, r]) => {
            const c = countCases(r);
            const selected = key === active;
            return (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls="eval-panel"
                onClick={() => setActive(key)}
                className={cx(
                  "rounded-[3px] border px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-[0.08em] transition-colors",
                  selected ? "border-accent/60 bg-accent/10 text-accent" : "border-transparent text-muted hover:bg-sunken hover:text-ink",
                )}
              >
                {REPORT_LABEL[key] ?? key} <span className="tabular font-mono text-xs opacity-80">{r.summary?.flaky != null ? `${r.summary.stable ?? c.passed} stable · ${r.summary.flaky} flaky · ${r.summary.failing ?? 0} failing` : `${c.passed}/${c.total}`}</span>
              </button>
            );
          })}
        </div>
      )}
      <div id="eval-panel" role={entries.length > 1 ? "tabpanel" : undefined}>
        <Report key={active} run={current} />
      </div>
      <details className="rounded-[4px] border border-line bg-surface">
        <summary className="label-mono cursor-pointer select-none px-4 py-3.5 text-ink hover:text-accent">What the harness checks</summary>
        <div className="border-t border-line p-4">
          <HarnessGrid />
        </div>
      </details>
    </div>
  );
}

function Report({ run }: { run: EvalRun }) {
  const suites = run.suites ?? [];
  const { passed, total } = countCases(run);
  const rate = total > 0 ? passed / total : null;
  const mode = asMode(run.mode);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-[4px] border border-line bg-surface p-4">
          <div className="label-mono text-[10.5px] text-faint">Pass rate</div>
          <div className={cx("tabular mt-2 font-serif text-[34px] leading-none tracking-[-0.02em]", rate === 1 ? "text-ship" : "text-ink")}>
            {rate == null ? "—" : `${Math.round(rate * 1000) / 10}%`}
          </div>
          <div className="tabular text-xs text-muted">
            {passed}/{total} cases
            {run.summary?.run_pass_rate != null && (run.repeat ?? 1) > 1 && (
              <>
                {" · "}
                {Math.round(run.summary.run_pass_rate * 1000) / 10}% of {total * (run.repeat ?? 1)} runs · {run.summary.stable ?? 0} stable,{" "}
                {run.summary.flaky ?? 0} flaky, {run.summary.failing ?? 0} failing
              </>
            )}
          </div>
        </div>
        <div className="rounded-[4px] border border-line bg-surface p-4">
          <div className="label-mono text-[10.5px] text-faint">Mode</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {mode ? <ModeBadge mode={mode} /> : <span className="text-sm text-muted">{run.mode ?? "—"}</span>}
            {run.data_source && <Pill mono>{run.data_source}</Pill>}
          </div>
          <div className="mt-1 break-words font-mono text-xs text-muted">{run.models?.length ? run.models.join(", ") : "no model"}</div>
        </div>
        <div className="rounded-[4px] border border-line bg-surface p-4">
          <div className="label-mono text-[10.5px] text-faint">Median latency</div>
          <div className="tabular mt-2 font-serif text-[34px] leading-none tracking-[-0.02em] text-ink">
            {run.summary?.median_latency_ms != null ? fmtMs(run.summary.median_latency_ms) : "—"}
          </div>
          <div className="text-xs text-muted">per case, end to end</div>
        </div>
        <div className="rounded-[4px] border border-line bg-surface p-4">
          <div className="label-mono text-[10.5px] text-faint">Generated</div>
          <div className="mt-1 break-words font-mono text-sm text-ink">{run.generated_at ?? "unknown"}</div>
        </div>
      </div>
      {run.method && <p className="max-w-3xl text-sm text-muted">{run.method}</p>}

      {suites.map((s, si) => {
        const cases = s.cases ?? [];
        const sp = s.passed ?? cases.filter((c) => c.passed).length;
        const st = s.total ?? cases.length;
        return (
          <Card key={s.name ?? si} aria-labelledby={`suite-${si}`}>
            <CardHeader
              id={`suite-${si}`}
              title={<span className="capitalize">{s.name ?? `Suite ${si + 1}`}</span>}
              actions={<Pill tone={sp === st ? "green" : "red"}>{sp}/{st} passed</Pill>}
            />
            {cases.length === 0 ? (
              <p className="p-4 text-sm text-muted">No cases.</p>
            ) : (
              <ul className="divide-y divide-line">
                {cases.map((c, ci) => (
                  <CaseRow key={c.id ?? ci} c={c} idx={ci} />
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms} ms`;
}

function checkLabel(c: EvalCheck, i: number): string {
  return typeof c.name === "string" ? c.name : typeof c.check === "string" ? c.check : `check ${i + 1}`;
}

function CaseRow({ c, idx }: { c: EvalCase; idx: number }) {
  const [open, setOpen] = useState(c.passed === false);
  const checks = Array.isArray(c.checks) ? c.checks : [];
  const actual = (c.actual && typeof c.actual === "object" ? c.actual : null) as Record<string, unknown> | null;
  const servedMode = asMode(actual?.mode);
  const failed = checks.filter((k) => k.passed === false).length;

  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cx(
            "mt-0.5 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10.5px] tracking-[0.06em]",
            c.passed ? "border-ship/45 bg-ship/10 text-ship" : c.passed === false ? "border-block/45 bg-block/10 text-block" : "border-line bg-sunken text-muted",
          )}
        >
          {c.passed ? "PASS" : c.passed === false ? "FAIL" : "N/A"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-medium text-ink">{c.id ?? `case ${idx + 1}`}</span>
            {servedMode && <ModeBadge mode={servedMode} />}
            {c.runs != null && c.runs > 1 && (
              <Pill tone={c.stability === "stable" ? "green" : c.stability === "flaky" ? "amber" : "red"}>
                {c.runs_passed}/{c.runs} runs · {c.stability}
              </Pill>
            )}
            {failed > 0 && <Pill tone="red">{failed} check{failed === 1 ? "" : "s"} failed</Pill>}
          </div>
          {c.intent && <p className="mt-0.5 text-sm text-ink">{c.intent}</p>}
          {c.question && <p className="mt-0.5 text-xs text-muted">“{c.question}”</p>}
        </div>
        <button type="button" className={buttonClass("ghost")} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Details"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3 sm:pl-12">
          {checks.length > 0 && (
            <ul className="space-y-1 rounded-[3px] border border-line p-2">
              {checks.map((k, i) => (
                <li key={i} className="flex flex-wrap gap-x-2 text-xs">
                  <span className={cx("font-mono", k.passed ? "text-ship" : "text-block")}>
                    {k.passed ? "PASS" : "FAIL"}
                  </span>
                  <span className="font-mono text-ink">{checkLabel(k, i)}</span>
                  {typeof k.detail === "string" && k.detail.trim() && (
                    <span className="min-w-0 break-words text-muted">
                      <LinkifiedText text={k.detail} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 md:grid-cols-2">
            <ValueBox label="Expected" value={c.expected} />
            <ValueBox label="Actual" value={c.actual} />
          </div>
        </div>
      )}
    </li>
  );
}

function ValueBox({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-[3px] border border-line">
      <div className="border-b border-line px-2 py-1 label-mono text-[10.5px] text-faint">{label}</div>
      <div className="p-2">
        <Value value={value} />
      </div>
    </div>
  );
}

function Value({ value }: { value: unknown }) {
  if (value == null) return <span className="text-xs text-faint">—</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span className="break-words font-mono text-xs text-ink">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-xs text-faint">none</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((v, i) =>
          typeof v === "string" && isRecordId(v) ? (
            <EvidenceChip key={i} id={v} />
          ) : (
            <span key={i} className="rounded-[3px] bg-sunken px-1.5 py-px font-mono text-[11px] text-ink">
              {typeof v === "string" ? v : JSON.stringify(v)}
            </span>
          ),
        )}
      </span>
    );
  }
  const obj = value as Record<string, unknown>;
  return (
    <dl className="space-y-1.5">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="font-mono text-[11px] text-faint">{k}</dt>
          <dd className="min-w-0">
            {k === "answer" && typeof v === "string" ? (
              <details>
                <summary className="cursor-pointer select-none text-xs text-muted">Show answer</summary>
                <div className="mt-1 rounded-[3px] border border-line p-2 text-sm">
                  <Markdown source={v} />
                </div>
              </details>
            ) : k === "mode" && asMode(v) ? (
              <ModeBadge mode={asMode(v)!} />
            ) : typeof v === "object" && v !== null && !Array.isArray(v) ? (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-ink">{JSON.stringify(v, null, 2)}</pre>
            ) : (
              <Value value={v} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
