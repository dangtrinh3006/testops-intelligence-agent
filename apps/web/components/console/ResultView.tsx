"use client";

import Link from "next/link";
import type { AskResponse, GateView, Mode } from "@/lib/types";
import { ChipList, EvidenceChip, LinkifiedText } from "../Evidence";
import { Markdown } from "../Markdown";
import { Card, CardHeader, cx, ModeBadge, Pill, VERDICT_ACCENT, VerdictBadge, verdictLabel } from "../ui";
import { SourceConflict } from "./SourceConflict";

const CHECK_LABEL: Record<string, string> = {
  evidence_ids_resolve: "Cited ids resolve to real records",
  evidence_retrieved_this_request: "Cited ids were retrieved in this request",
  claims_have_evidence: "Every claim cites evidence",
  verdict_matches_policy: "Verdict in text equals policy verdict",
  numbers_grounded: "Numbers appear in tool output",
};

export function ResultView({ res, requestedMode }: { res: AskResponse; requestedMode: Mode }) {
  const missing = new Set(res.evidence.filter((e) => !e.exists).map((e) => e.id));
  const conflict = res.gate?.checks.find((c) => c.condition === "summary_conflict" && c.triggered);

  return (
    <div className="space-y-4">
      {(res.notice || requestedMode !== res.mode) && (
        <div
          role="note"
          className="flex flex-wrap items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100"
        >
          <ModeBadge mode={res.mode} />
          <div className="min-w-0 flex-1">
            {requestedMode !== res.mode && (
              <p className="font-medium">
                Requested {requestedMode.toUpperCase()}, served {res.mode.toUpperCase()}.
              </p>
            )}
            {res.notice && <p>{res.notice}</p>}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          {res.gate ? <VerdictCard gate={res.gate} /> : <NoVerdictCard />}
        </div>
        <Card className="lg:col-span-7" aria-labelledby="answer-title">
          <CardHeader id="answer-title" title="Answer" eyebrow={res.mode === "offline" ? "Template text, no model" : "Explanation"}>
            <span className="break-words">“{res.question}”</span>
          </CardHeader>
          <div className="space-y-4 p-4 sm:p-5">
            <Markdown source={res.answer} />
            {res.recommendation && (
              <div className="rounded-lg border border-line bg-sunken/70 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Recommended next action</div>
                <p className="mt-1 text-sm font-medium text-ink">
                  <LinkifiedText text={res.recommendation} />
                </p>
              </div>
            )}
            {!res.gate && /flak/i.test(res.question) && (
              <Link href="/flaky" className="inline-block text-sm text-accent underline underline-offset-2">
                Open the flaky-test table and cost model →
              </Link>
            )}
          </div>
        </Card>
      </div>

      {conflict && res.gate && <SourceConflict runId={res.gate.run_id} check={conflict} />}

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7" aria-labelledby="claims-title">
          <CardHeader id="claims-title" title={`Claims (${res.claims.length})`} eyebrow="Every claim links to a record" />
          <ul className="divide-y divide-line">
            {res.claims.map((c, i) => (
              <li key={i} className="flex gap-3 px-4 py-3 sm:px-5">
                <span
                  aria-label={c.supported ? "Supported" : "Unsupported"}
                  className={cx(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    c.supported
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
                  )}
                >
                  {c.supported ? "✓" : "⚠"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <LinkifiedText text={c.text} />
                  </p>
                  {c.note && <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{c.note}</p>}
                  <div className="mt-1.5">
                    {c.evidence.length ? (
                      <ChipList ids={c.evidence} missing={missing} />
                    ) : (
                      <span className="text-xs text-amber-700 dark:text-amber-300">No evidence cited</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {res.evidence.length > 0 && (
            <details className="border-t border-line">
              <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-medium text-muted sm:px-5">
                All cited evidence ({res.evidence.length})
              </summary>
              <ul className="space-y-1.5 px-4 pb-3 sm:px-5">
                {res.evidence.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <EvidenceChip id={e.id} missing={!e.exists} />
                    <span className="text-muted">{e.label}</span>
                    {!e.exists && <Pill tone="red">not found in current data</Pill>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-5">
          {res.data_quality_warnings.length > 0 && (
            <Card aria-labelledby="dq-title">
              <CardHeader id="dq-title" title="Data-quality warnings" eyebrow="Reported, never imputed (R6)" />
              <ul className="space-y-2 p-4 text-sm sm:px-5">
                {res.data_quality_warnings.map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span className="min-w-0 text-ink">
                      <LinkifiedText text={w} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card aria-labelledby="unc-title">
            <CardHeader id="unc-title" title="Assumptions & uncertainty" />
            <div className="space-y-3 p-4 text-sm sm:px-5">
              {res.assumptions.length > 0 ? (
                <ul className="space-y-1.5">
                  {res.assumptions.map((a, i) => (
                    <li key={i} className="text-ink">
                      <span className="mr-1 font-mono text-[11px] text-faint">ASSUMPTION</span>
                      <LinkifiedText text={a} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No assumptions declared.</p>
              )}
              {res.uncertainty && (
                <p className="rounded-md border-l-2 border-amber-400 bg-sunken/70 px-3 py-2 text-ink">
                  <span className="mr-1 font-mono text-[11px] text-faint">UNCERTAINTY</span>
                  {res.uncertainty}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5" aria-labelledby="val-title">
          <CardHeader
            id="val-title"
            title="Response validation"
            eyebrow="Checked before the answer is returned"
            actions={
              <Pill tone={res.validation.passed ? "green" : "red"}>
                {res.validation.passed ? "passed" : "failed"} · {res.validation.revisions} revision{res.validation.revisions === 1 ? "" : "s"}
              </Pill>
            }
          />
          <ul className="divide-y divide-line">
            {res.validation.checks.map((c) => (
              <li key={c.name} className="flex gap-3 px-4 py-2.5 sm:px-5">
                <span
                  aria-label={c.passed ? "pass" : "fail"}
                  className={cx("mt-0.5 font-mono text-xs font-bold", c.passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}
                >
                  {c.passed ? "PASS" : "FAIL"}
                </span>
                <div className="min-w-0">
                  <div className="text-sm text-ink">{CHECK_LABEL[c.name] ?? c.name}</div>
                  {c.detail && (
                    <div className="break-words text-xs text-muted">
                      <LinkifiedText text={c.detail} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-7" aria-labelledby="trace-title">
          <CardHeader id="trace-title" title={`Tool trace (${res.tool_trace.length} calls)`} eyebrow="Bounded, read-only tools" />
          <ol className="p-4 sm:px-5">
            {res.tool_trace.map((t, i) => (
              <li key={`${t.step}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                {i < res.tool_trace.length - 1 && <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%-1rem)] w-px bg-line-strong" />}
                <span
                  className={cx(
                    "z-10 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold",
                    t.ok ? "bg-ink text-canvas" : "bg-red-600 text-white",
                  )}
                  aria-label={`Step ${t.step}${t.ok ? "" : ", failed"}`}
                >
                  {t.step}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-ink">{t.tool}</span>
                    <span className="tabular font-mono text-[11px] text-faint">{t.ms} ms</span>
                    {!t.ok && <Pill tone="red">error</Pill>}
                  </div>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-sunken px-2 py-1 font-mono text-[11px] text-muted">{JSON.stringify(t.args)}</pre>
                  <p className="mt-1 text-xs text-ink">
                    <LinkifiedText text={t.summary} />
                  </p>
                  {t.evidence.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer select-none text-[11px] text-faint">{t.evidence.length} record ids returned</summary>
                      <div className="mt-1">
                        <ChipList ids={t.evidence} />
                      </div>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-xs text-muted">
        <ModeBadge mode={res.mode} />
        <span>
          model <span className="font-mono text-ink">{res.model ?? "none"}</span>
        </span>
        <span>
          request <span className="font-mono text-ink">{res.request_id}</span>
        </span>
        <span className="tabular">{res.latency_ms} ms server time</span>
      </div>
    </div>
  );
}

function VerdictCard({ gate }: { gate: GateView }) {
  const deciding = gate.checks.find((c) => c.triggered);
  return (
    <Card className={cx("h-full border-t-4", VERDICT_ACCENT[gate.verdict])} aria-labelledby="verdict-title">
      <div className="p-4 sm:p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-faint" id="verdict-title">
          Release gate verdict
        </div>
        <div className="mt-2">
          <VerdictBadge verdict={gate.verdict} size="lg" />
        </div>
        <div className="mt-1 text-sm text-muted">{verdictLabel(gate.verdict)}</div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-2">
          <div>
            <dt className="text-[11px] text-faint">Deciding rule</dt>
            <dd className="font-mono font-semibold text-ink">{gate.deciding_rule}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-faint">Policy</dt>
            <dd>
              <EvidenceChip id={gate.policy_id} />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-faint">Rules version</dt>
            <dd className="font-mono text-ink">{gate.rules_version}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-faint">Run</dt>
            <dd>
              <EvidenceChip id={gate.run_id} />
            </dd>
          </div>
        </dl>
        <p className="mt-4 flex items-start gap-2 rounded-md bg-sunken px-3 py-2 text-xs text-ink">
          <span aria-hidden>⚖</span>
          <span>
            Computed by a deterministic policy function, not by the model. The model may only explain it; a mismatch fails validation.
          </span>
        </p>
      </div>
      <div className="border-t border-line">
        <div className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wider text-faint sm:px-5">Gate checks · first match wins</div>
        <ol className="space-y-1.5 px-4 py-3 sm:px-5">
          {gate.checks.map((c) => {
            const isDeciding = c === deciding;
            return (
              <li key={c.condition} className={cx("rounded-md px-2 py-1.5 text-xs", isDeciding ? "bg-sunken ring-1 ring-line-strong" : "")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-label={c.triggered ? "triggered" : "not triggered"}
                    className={cx("size-2 shrink-0 rounded-full", c.triggered ? "bg-amber-500" : "bg-line-strong")}
                  />
                  <span className={cx("font-mono", c.triggered ? "font-semibold text-ink" : "text-muted")}>{c.condition}</span>
                  <span className="font-mono text-faint">{c.rule}</span>
                  {isDeciding && <Pill tone="violet">decides</Pill>}
                </div>
                {c.triggered && (
                  <p className="mt-1 pl-4 text-muted">
                    <LinkifiedText text={c.detail} />
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

function NoVerdictCard() {
  return (
    <Card className="h-full" aria-labelledby="noverdict-title">
      <div className="p-4 sm:p-5">
        <div id="noverdict-title" className="text-[11px] font-semibold uppercase tracking-wider text-faint">
          Release gate verdict
        </div>
        <p className="mt-2 text-sm text-ink">Not evaluated for this question.</p>
        <p className="mt-1 text-xs text-muted">
          The gate runs only when a question is about a specific run or release candidate. The agent cannot produce a SHIP/BLOCK verdict on its
          own.
        </p>
      </div>
    </Card>
  );
}
