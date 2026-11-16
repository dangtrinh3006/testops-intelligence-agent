"use client";

import { errorMessage } from "@/lib/api";
import { useKnowledge, useOverview } from "@/lib/hooks";
import { EvidenceChip } from "../Evidence";
import { Card, CardHeader, cx, ErrorBlock, LoadingBlock, Pill, VerdictBadge } from "../ui";
import { TriagePill } from "../Attempts";

export function RulesView() {
  const { data: k, error, loading, reload } = useKnowledge();
  const overview = useOverview();
  if (loading) return <Card><LoadingBlock rows={8} label="Loading knowledge file" /></Card>;
  if (error || !k) return <ErrorBlock message={errorMessage(error)} onRetry={reload} />;

  // Expiry is judged against the dataset's as-of date so the demo stays stable over time.
  const asOf = overview.data?.as_of?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const effort = k.effort_assumptions;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Pill mono tone="violet">version {k.version}</Pill>
        {k.owner && <Pill>owner: {k.owner}</Pill>}
        <Pill mono>knowledge/testops_rules.yaml</Pill>
        <span>Served verbatim by /api/knowledge. Every verdict names the rule and this version.</span>
      </div>

      <Card aria-labelledby="rules-title">
        <CardHeader id="rules-title" title={`Rules (${k.rules.length})`} eyebrow="How a senior test-platform engineer reads CI evidence" />
        <ol className="divide-y divide-line">
          {k.rules.map((r) => (
            <li key={r.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[4rem_1fr] sm:px-5">
              <div>
                <span className="inline-flex rounded-[3px] border border-accent/60 px-2 py-1 font-mono text-[13px] text-accent">{r.id}</span>
              </div>
              <div className="min-w-0 space-y-1.5">
                <h3 className="font-serif text-[18px] leading-snug text-ink">{r.title}</h3>
                {r.rationale && (
                  <p className="text-sm text-muted">
                    <span className="mr-1 font-mono text-[11px] uppercase text-faint">Why</span>
                    {r.rationale}
                  </p>
                )}
                {r.effect && (
                  <p className="text-sm text-ink">
                    <span className="mr-1 font-mono text-[11px] uppercase text-faint">Effect</span>
                    {r.effect}
                  </p>
                )}
                {r.levels && (
                  <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                    {Object.entries(r.levels).map(([lvl, def]) => (
                      <div key={lvl} className="rounded-[3px] border border-line p-2">
                        <dt className="font-mono text-xs text-accent">{lvl}</dt>
                        <dd className="text-xs text-muted">{def}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-6" aria-labelledby="gate-title">
          <CardHeader id="gate-title" title="Release gate precedence" eyebrow="First match wins">
            <span className="inline-flex flex-wrap items-center gap-1">
              Policy <EvidenceChip id={k.release_gate.policy_id} /> · gating suites:{" "}
              {k.release_gate.gating_suites.map((s) => (
                <Pill key={s} mono tone="violet">
                  {s}
                </Pill>
              ))}
            </span>
          </CardHeader>
          <ol className="divide-y divide-line">
            {k.release_gate.precedence.map((p, i) => (
              <li key={p.when} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:px-5">
                <span className="w-5 text-right font-mono text-xs text-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 font-mono text-sm text-ink">{p.when}</span>
                <VerdictBadge verdict={p.verdict} size="sm" />
                <Pill mono>{p.rule}</Pill>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="lg:col-span-6" aria-labelledby="q-title">
          <CardHeader id="q-title" title="Quarantine" eyebrow="Human decision with an expiry (R4)">
            Judged against dataset date {asOf}. The agent can recommend a quarantine, never write one.
          </CardHeader>
          {k.quarantine?.length ? (
            <ul className="divide-y divide-line">
              {k.quarantine.map((q) => {
                const expired = q.expires < asOf;
                return (
                  <li key={q.test_id} className={cx("px-4 py-3 sm:px-5", expired && "bg-block/[0.05]")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <EvidenceChip id={q.test_id} />
                      {expired ? <Pill tone="red">expired {q.expires} — back in the gate</Pill> : <Pill tone="green">active until {q.expires}</Pill>}
                    </div>
                    <p className="mt-1 text-sm text-ink">{q.reason}</p>
                    <p className="text-xs text-muted">Owner: {q.owner}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted">No quarantine entries.</p>
          )}
        </Card>
      </div>

      <Card aria-labelledby="tax-title">
        <CardHeader id="tax-title" title="Failure taxonomy" eyebrow="Error class → category → defect type (ReportPortal vocabulary). System issues never count against a test (R1)" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="label-mono border-b border-line bg-sunken/50 text-left text-[10.5px] text-faint">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Category</th>
                <th scope="col" className="px-3 py-2 font-medium">Defect type</th>
                <th scope="col" className="px-3 py-2 font-medium">Error classes</th>
                <th scope="col" className="px-4 py-2 font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {Object.entries(k.taxonomy).map(([cat, v]) => (
                <tr key={cat} className="align-top">
                  <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs text-accent">
                    {cat}
                  </th>
                  <td className="whitespace-nowrap px-3 py-3">
                    {v.triage && k.triage_buckets?.[v.triage] ? <TriagePill code={v.triage} label={k.triage_buckets[v.triage].label} /> : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {v.classes.map((c) => (
                        <span key={c} className="rounded-[3px] bg-sunken px-1.5 py-px font-mono text-[11px] text-ink">
                          {c}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="min-w-[14rem] px-4 py-3 text-muted">{v.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {effort && (
        <Card aria-labelledby="eff-title">
          <CardHeader id="eff-title" title="Effort assumptions" eyebrow="Assumptions, not measurements — a pilot replaces them" />
          <div className="overflow-x-auto p-4 sm:px-5">
            <table className="w-full max-w-lg text-sm">
              <thead className="text-left label-mono text-[10.5px] text-faint">
                <tr>
                  <th scope="col" className="py-1.5 font-medium">Assumption</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Low</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Base</th>
                  <th scope="col" className="py-1.5 text-right font-medium">High</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(
                  [
                    ["Triage minutes / investigation", effort.triage_minutes_per_investigation, ""],
                    ["Loaded cost / engineer-hour", effort.loaded_cost_per_engineer_hour_usd, "$"],
                  ] as const
                ).map(([label, v, prefix]) =>
                  v ? (
                    <tr key={label}>
                      <th scope="row" className="py-2 text-left font-normal text-ink">{label}</th>
                      <td className="tabular py-2 text-right">{prefix}{v.low}</td>
                      <td className="tabular py-2 text-right font-medium">{prefix}{v.base}</td>
                      <td className="tabular py-2 text-right">{prefix}{v.high}</td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
