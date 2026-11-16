"use client";

import Link from "next/link";
import type { AskResponse, GateView, Mode } from "@/lib/types";
import { ChipList, EvidenceChip, LinkifiedText } from "../Evidence";
import { Markdown } from "../Markdown";
import { Card, CardHeader, cx, ModeBadge, PanelBar, Pill, StatusChip, VERDICT_ACCENT, VERDICT_TEXT, VerdictBadge, verdictLabel } from "../ui";
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
          className="flex flex-wrap items-start gap-3 rounded-[4px] border border-violet/35 bg-violet/[0.06] px-4 py-3 text-sm text-ink"
        >
          <ModeBadge mode={res.mode} />
          <div className="min-w-0 flex-1">
            {requestedMode !== res.mode && (
              <p className="font-mono text-[12px] uppercase tracking-[0.06em] text-violet">
                Requested {requestedMode.toUpperCase()}, served {res.mode.toUpperCase()}.
              </p>
            )}
            {res.notice && <p className="mt-0.5 text-muted">{res.notice}</p>}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          {res.gate ? <VerdictCard gate={res.gate} /> : <NoVerdictCard />}
        </div>
        <Card className="lg:col-span-7" aria-labelledby="answer-title">
          <PanelBar label={res.mode === "offline" ? "answer · template text, no model" : "answer · model explanation"}>
            <ModeBadge mode={res.mode} />
            <StatusChip tone={res.validation.passed ? "green" : "red"} dot>
              validator {res.validation.passed ? "pass" : "fail"}
            </StatusChip>
          </PanelBar>
          <CardHeader id="answer-title" title="Answer">
            <span className="break-words">“{res.question}”</span>
          </CardHeader>
          <div className="space-y-4 p-4 sm:p-5">
            <Markdown source={res.answer} />
            {res.recommendation && (
              <div className="rounded-[4px] border border-accent/30 bg-accent/[0.05] p-3.5">
                <div className="label-mono text-accent">Recommended next action →</div>
                <p className="mt-1.5 text-sm text-ink">
                  <LinkifiedText text={res.recommendation} />
                </p>
              </div>
            )}
            {!res.gate && /flak/i.test(res.question) && (
              <Link href="/flaky" className="inline-block font-mono text-[12px] uppercase tracking-[0.08em] text-accent hover:text-accent-hover">
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
                    "mt-0.5 flex h-5 min-w-7 shrink-0 items-center justify-center rounded-[3px] border font-mono text-[10.5px]",
                    c.supported ? "border-ship/40 text-ship" : "border-accent/50 text-accent",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <LinkifiedText text={c.text} />
                  </p>
                  {c.note && <p className="mt-1 text-xs text-accent">{c.note}</p>}
                  <div className="mt-1.5">
                    {c.evidence.length ? (
                      <ChipList ids={c.evidence} missing={missing} />
                    ) : (
                      <span className="font-mono text-[11px] text-accent">No evidence cited</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {res.evidence.length > 0 && (
            <details className="border-t border-line">
              <summary className="label-mono cursor-pointer select-none px-4 py-3 text-faint hover:text-ink sm:px-5">
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
                    <span aria-hidden className="mt-2 h-px w-3 shrink-0 bg-accent" />
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
                      <span className="label-mono mr-1.5 text-[10px] text-faint">Assumption</span>
                      <LinkifiedText text={a} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No assumptions declared.</p>
              )}
              {res.uncertainty && (
                <p className="rounded-[3px] border-l-2 border-accent bg-sunken/70 px-3 py-2 text-ink">
                  <span className="label-mono mr-1.5 text-[10px] text-accent">Uncertainty</span>
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
                  className={cx("mt-0.5 w-9 shrink-0 font-mono text-[11px] font-medium", c.passed ? "text-ship" : "text-block")}
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
                {i < res.tool_trace.length - 1 && <span aria-hidden className="absolute left-[11.5px] top-6 h-[calc(100%-1rem)] w-px bg-line-strong" />}
                <span
                  className={cx(
                    "z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-surface font-mono text-[10.5px]",
                    t.ok ? "border-accent/60 text-accent" : "border-block text-block",
                  )}
                  aria-label={`Step ${t.step}${t.ok ? "" : ", failed"}`}
                >
                  {t.step}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-medium text-ink">{t.tool}</span>
                    <span className="tabular font-mono text-[11px] text-faint">{t.ms} ms</span>
                    {!t.ok && <Pill tone="red">error</Pill>}
                  </div>
                  <pre className="mt-1.5 overflow-x-auto rounded-[3px] border border-line bg-canvas px-2 py-1 font-mono text-[11px] text-muted">{JSON.stringify(t.args)}</pre>
                  <p className="mt-1 text-xs text-ink">
                    <LinkifiedText text={t.summary} />
                  </p>
                  {t.evidence.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer select-none font-mono text-[10.5px] text-faint hover:text-ink">{t.evidence.length} record ids returned</summary>
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[4px] border border-line bg-surface px-4 py-2.5 font-mono text-[11px] text-muted">
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
    <Card className={cx("h-full border-t-2", VERDICT_ACCENT[gate.verdict])} aria-labelledby="verdict-title">
      <PanelBar label={<span id="verdict-title">Release gate verdict</span>}>
        <StatusChip tone="neutral">policy · not model</StatusChip>
      </PanelBar>
      <div className="p-4 sm:p-5">
        <div className={cx("font-serif text-[30px] leading-tight tracking-[-0.02em] sm:text-[34px]", VERDICT_TEXT[gate.verdict])}>
          {verdictLabel(gate.verdict)}
        </div>
        <div className="mt-3">
          <VerdictBadge verdict={gate.verdict} size="lg" />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-2">
          <div>
            <dt className="label-mono text-[10px] text-faint">Deciding rule</dt>
            <dd className="font-mono text-ink">{gate.deciding_rule}</dd>
          </div>
          <div>
            <dt className="label-mono text-[10px] text-faint">Policy</dt>
            <dd>
              <EvidenceChip id={gate.policy_id} />
            </dd>
          </div>
          <div>
            <dt className="label-mono text-[10px] text-faint">Rules version</dt>
            <dd className="font-mono text-ink">{gate.rules_version}</dd>
          </div>
          <div>
            <dt className="label-mono text-[10px] text-faint">Run</dt>
            <dd>
              <EvidenceChip id={gate.run_id} />
            </dd>
          </div>
        </dl>
        <p className="mt-4 flex items-start gap-2 rounded-[3px] border-l-2 border-accent bg-sunken px-3 py-2 text-xs text-muted">
          <span>
            Computed by a deterministic policy function, not by the model. The model may only explain it; a mismatch fails validation.
          </span>
        </p>
      </div>
      <div className="border-t border-line">
        <div className="label-mono px-4 pt-3 text-faint sm:px-5">Gate checks · first match wins</div>
        <ol className="space-y-1.5 px-4 py-3 sm:px-5">
          {gate.checks.map((c) => {
            const isDeciding = c === deciding;
            return (
              <li key={c.condition} className={cx("rounded-[3px] border px-2 py-1.5 text-xs", isDeciding ? "border-accent/40 bg-accent/[0.06]" : "border-transparent")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-label={c.triggered ? "triggered" : "not triggered"}
                    className={cx("size-1.5 shrink-0 rounded-full", c.triggered ? "bg-accent" : "bg-line-strong")}
                  />
                  <span className={cx("font-mono", c.triggered ? "text-ink" : "text-faint")}>{c.condition}</span>
                  <span className="font-mono text-faint">{c.rule}</span>
                  {isDeciding && <Pill tone="amber" mono>decides</Pill>}
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
        <div id="noverdict-title" className="label-mono text-faint">
          Release gate verdict
        </div>
        <p className="mt-3 font-serif text-[22px] leading-snug text-ink">Not evaluated for this question.</p>
        <p className="mt-1 text-xs text-muted">
          The gate runs only when a question is about a specific run or release candidate. The agent cannot produce a SHIP/BLOCK verdict on its
          own.
        </p>
      </div>
    </Card>
  );
}
