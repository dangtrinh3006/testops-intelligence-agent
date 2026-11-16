"use client";

import { useId, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Band, FlakyResponse, FlakyTest } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { ChipList, EvidenceChip, LinkifiedText } from "../Evidence";
import { Tooltip } from "../Tooltip";
import { buttonClass, Card, CardHeader, cx, ErrorBlock, LoadingBlock, Pill, StatTile } from "../ui";

// Levels outside rule R3 are not in the knowledge file; these definitions follow R1 and R2.
const EXTRA_LEVELS: Record<string, string> = {
  consistent_failure: "Failed on every attempt with no retry-pass in the window. A failure to fix, not flakiness (R2).",
  infra_only: "Every retry-pass was caused by an INFRA or EXTERNAL_DEPENDENCY error. Tracked as platform reliability, not test flakiness (R1).",
};

const LEVEL_TONE: Record<string, string> = {
  proven: "border-block bg-block/15 text-block",
  suspected: "border-accent/60 bg-accent/10 text-accent",
  possible: "border-accent/30 bg-transparent text-accent-hover",
  consistent_failure: "border-block/40 bg-block/[0.06] text-block",
  infra_only: "border-line-strong bg-sunken text-muted",
};

function LevelBadge({ level, levels, align }: { level: string; levels: Record<string, string>; align?: "start" | "end" }) {
  const def = levels[level] ?? EXTRA_LEVELS[level];
  const badge = (
    <span className={cx("inline-flex rounded-[3px] border px-1.5 py-0.5 font-mono text-[11px]", LEVEL_TONE[level] ?? LEVEL_TONE.infra_only)}>{level}</span>
  );
  if (!def) return badge;
  return (
    <Tooltip
      align={align}
      content={
        <>
          <span className="font-mono text-accent">{level}</span>: {def}
          {levels[level] && <span className="mt-1 block text-faint">Rule R3 · knowledge file</span>}
        </>
      }
    >
      {badge}
    </Tooltip>
  );
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function FlakyView() {
  const { data, error, loading, reload } = useApi("flaky", () => api.flaky());
  if (loading) return <Card><LoadingBlock rows={6} label="Loading flaky-test analysis" /></Card>;
  if (error || !data) return <ErrorBlock message={errorMessage(error)} onRetry={reload} />;
  const f = data.flaky;
  const levels = f.levels;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Runs analysed" value={f.scope.runs_analyzed} sub={`${f.scope.lookback_days}-day window`} />
        <StatTile label="Test retry-pass series" value={f.totals.retry_pass_series_test} sub="count toward flakiness" />
        <StatTile label="Infra retry-pass series" value={f.totals.retry_pass_series_infra} sub="platform, not the test (R1)" />
        <StatTile label="Retry CI minutes" value={f.totals.retry_minutes_measured} sub="measured durations only" />
      </div>

      <Card aria-labelledby="flaky-title">
        <CardHeader id="flaky-title" title={`Tests with retries or failures (${f.tests.length})`} eyebrow={`Scope: ${f.scope.service_id} · as of ${f.scope.as_of}`}>
          Hover or focus a level for its definition.
        </CardHeader>
        <div className="hidden overflow-x-auto md:block xl:overflow-visible">
          <table className="w-full text-sm">
            <thead className="label-mono border-b border-line bg-sunken/50 text-left text-[10.5px] text-faint">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Test</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Service</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Level</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">1st-attempt fail rate</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Test retry-passes</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Infra retry-passes</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Final failures</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Incomplete excluded</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Retry CI min</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {f.tests.map((t) => (
                <tr key={t.test_id} className="align-top transition-colors hover:bg-sunken/40">
                  <td className="px-4 py-3">
                    <EvidenceChip id={t.test_id} />
                    <div className="mt-1 max-w-xs text-xs text-muted">{t.name}</div>
                    <div className="mt-1 font-mono text-[11px] text-faint">{t.error_classes.join(", ")}</div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-muted">{t.service_id}</td>
                  <td className="px-3 py-3">
                    <LevelBadge level={t.level} levels={levels} />
                    {t.confidence === "insufficient_data" && (
                      <div className="mt-1 font-mono text-[10.5px] text-accent" title={`Fewer than ${t.min_runs} completed runs: treat the level as provisional.`}>
                        insufficient data · {t.runs_observed}/{t.min_runs} runs
                      </div>
                    )}
                    {t.flip_rate != null && (
                      <div className="mt-1 font-mono text-[10.5px] text-faint" title="Final-status changes between consecutive runs, oldest first.">
                        flip rate {pct(t.flip_rate)} · {t.flips} flips
                      </div>
                    )}
                    <MixedCommits t={t} />
                  </td>
                  <td className="tabular px-3 py-3 text-right">
                    {pct(t.first_attempt_failure_rate)}
                    <div className="text-[11px] text-faint">
                      {t.first_attempt_failures}/{t.runs_observed} runs
                    </div>
                  </td>
                  <td className="tabular px-3 py-3 text-right">{t.retry_passes_test}</td>
                  <td className="tabular px-3 py-3 text-right">{t.retry_passes_infra}</td>
                  <td className="tabular px-3 py-3 text-right">{t.final_failures}</td>
                  <td className="tabular px-3 py-3 text-right">{t.incomplete_runs_excluded}</td>
                  <td className="tabular px-4 py-3 text-right">
                    {t.retry_minutes_measured}
                    {t.retry_attempts_without_duration > 0 && (
                      <div className="text-[11px] text-accent">+{t.retry_attempts_without_duration} without duration</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-line md:hidden">
          {f.tests.map((t) => (
            <li key={t.test_id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <EvidenceChip id={t.test_id} />
                <LevelBadge level={t.level} levels={levels} align="end" />
              </div>
              <div className="text-xs text-muted">
                {t.name} · <span className="font-mono">{t.service_id}</span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <MiniStat label="1st-attempt fail" value={`${pct(t.first_attempt_failure_rate)} (${t.first_attempt_failures}/${t.runs_observed})`} />
                <MiniStat label="Test retry-pass" value={t.retry_passes_test} />
                <MiniStat label="Infra retry-pass" value={t.retry_passes_infra} />
                <MiniStat label="Final failures" value={t.final_failures} />
                <MiniStat label="Incomplete excl." value={t.incomplete_runs_excluded} />
                <MiniStat label="Retry CI min" value={t.retry_minutes_measured} />
              </dl>
              <MixedCommits t={t} />
            </li>
          ))}
        </ul>
        <details className="border-t border-line">
          <summary className="label-mono cursor-pointer select-none px-4 py-3 text-faint hover:text-ink sm:px-5">Evidence attempts per test</summary>
          <ul className="space-y-2 px-4 pb-3 sm:px-5">
            {f.tests.map((t) => (
              <li key={t.test_id} className="text-xs">
                <span className="mr-2 font-mono text-muted">{t.test_id}</span>
                <ChipList ids={t.evidence} />
              </li>
            ))}
          </ul>
        </details>
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5" aria-labelledby="handling-title">
          <CardHeader id="handling-title" title="Data handling" eyebrow="How the counts were produced" />
          <ul className="space-y-2 p-4 text-sm sm:px-5">
            {f.data_handling.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-accent" />
                <span className="min-w-0">
                  <LinkifiedText text={d} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <CostModel cost={data.cost} />
      </div>
    </div>
  );
}

function MixedCommits({ t }: { t: FlakyTest }) {
  if (!t.mixed_outcome_commits.length) return null;
  return (
    <div className="mt-1 text-[11px] text-muted">
      same commit passed and failed: <span className="font-mono text-ink">{t.mixed_outcome_commits.join(", ")}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="label-mono text-[10px] text-faint">{label}</dt>
      <dd className="tabular text-ink">{value}</dd>
    </div>
  );
}

// Python's round() is half-to-even; mirror it so client numbers equal the API's.
function roundHalfEven(x: number, digits = 0): number {
  const m = 10 ** digits;
  const v = x * m;
  const floor = Math.floor(v);
  const diff = v - floor;
  const r = diff > 0.5 ? floor + 1 : diff < 0.5 ? floor : floor % 2 === 0 ? floor : floor + 1;
  return r / m;
}

const BANDS: Band[] = ["low", "base", "high"];

function CostModel({ cost }: { cost: FlakyResponse["cost"] }) {
  const initial = () => ({
    minutes: { ...cost.assumed.minutes_per_investigation },
    rate: { ...cost.assumed.loaded_cost_per_engineer_hour_usd },
  });
  const [a, setA] = useState(initial);
  const n = cost.measured.investigations;
  const uid = useId();
  const edited = BANDS.some((b) => a.minutes[b] !== cost.assumed.minutes_per_investigation[b] || a.rate[b] !== cost.assumed.loaded_cost_per_engineer_hour_usd[b]);

  const set = (key: "minutes" | "rate", band: Band, raw: string) => {
    const v = Number(raw);
    setA((s) => ({ ...s, [key]: { ...s[key], [band]: Number.isFinite(v) && v >= 0 ? v : 0 } }));
  };

  return (
    <Card className="lg:col-span-7" aria-labelledby="cost-title">
      <CardHeader
        id="cost-title"
        title="Triage cost model"
        eyebrow="Illustrative — replace with your measured baseline"
        actions={
          edited && (
            <button type="button" className={buttonClass("ghost")} onClick={() => setA(initial())}>
              Reset to file values
            </button>
          )
        }
      />
      <div className="space-y-4 p-4 sm:p-5">
        <pre className="overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-[3px] border border-line bg-canvas px-3 py-2 font-mono text-xs text-accent-hover">{cost.formula.replace(/;\s*/g, ";\n")}</pre>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-[4px] border border-line p-3">
            <div className="label-mono text-[10.5px] text-faint">Triage investigations (measured)</div>
            <div className="tabular mt-1 font-serif text-[26px] leading-tight text-ink">{n}</div>
            {cost.measured.split && (
              <div className="tabular text-[11px] text-ink">
                {cost.measured.split.test_retry_passes} test retries · {cost.measured.split.infra_retry_passes} infra retries · {cost.measured.split.final_failures} final failures
              </div>
            )}
            <div className="text-[11px] text-muted">{cost.measured.window_days} days · not only flaky tests: every failure an engineer looks at</div>
          </div>
          {cost.measured.retry_ci_minutes != null && (
            <div className="rounded-[4px] border border-line p-3">
              <div className="label-mono text-[10.5px] text-faint">Retry CI minutes</div>
              <div className="tabular mt-1 font-serif text-[26px] leading-tight text-ink">{cost.measured.retry_ci_minutes}</div>
              <div className="text-[11px] text-muted">measured, not part of the cost</div>
            </div>
          )}
          {cost.measured.breakdown && (
            <div className="col-span-2 rounded-[4px] border border-line p-3 sm:col-span-1">
              <div className="label-mono text-[10.5px] text-faint">Breakdown</div>
              <ul className="mt-1 grid grid-cols-2 gap-x-3 text-xs">
                {Object.entries(cost.measured.breakdown).map(([k, v]) => (
                  <li key={k} className="flex justify-between font-mono">
                    <span className="text-muted">{k}</span>
                    <span className="tabular text-ink">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Low, base and high cost scenarios; minutes and rates are editable assumptions</caption>
            <thead className="text-left label-mono text-[10.5px] text-faint">
              <tr>
                <th scope="col" className="py-1.5 pr-2 font-medium">Scenario</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Min / investigation</th>
                <th scope="col" className="px-2 py-1.5 font-medium">USD / hour</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">Engineer-hours</th>
                <th scope="col" className="py-1.5 pl-2 text-right font-medium">Cost (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {BANDS.map((b) => {
                const hours = (n * a.minutes[b]) / 60;
                return (
                  <tr key={b} className={b === "base" ? "font-medium" : ""}>
                    <th scope="row" className="py-2 pr-2 text-left capitalize text-ink">{b}</th>
                    <td className="px-2 py-2">
                      <label className="sr-only" htmlFor={`${uid}-m-${b}`}>Minutes per investigation, {b}</label>
                      <input id={`${uid}-m-${b}`} type="number" min={0} max={240} step={1} value={a.minutes[b]} onChange={(e) => set("minutes", b, e.target.value)} className="tabular w-16 rounded-[3px] border border-line-strong bg-canvas px-2 py-1 font-mono text-sm text-ink focus:border-accent focus:outline-none" />
                    </td>
                    <td className="px-2 py-2">
                      <label className="sr-only" htmlFor={`${uid}-r-${b}`}>USD per hour, {b}</label>
                      <input id={`${uid}-r-${b}`} type="number" min={0} max={500} step={5} value={a.rate[b]} onChange={(e) => set("rate", b, e.target.value)} className="tabular w-16 rounded-[3px] border border-line-strong bg-canvas px-2 py-1 font-mono text-sm text-ink focus:border-accent focus:outline-none" />
                    </td>
                    <td className="tabular px-2 py-2 text-right">{roundHalfEven(hours, 1).toFixed(1)}</td>
                    <td className="tabular py-2 pl-2 text-right">${roundHalfEven(hours * a.rate[b]).toLocaleString("en-US")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="rounded-[3px] border-l-2 border-accent bg-accent/[0.06] px-3 py-2 text-xs text-ink" aria-live="polite">
          {cost.caveat} {edited && <Pill tone="amber">edited locally, not saved</Pill>}
        </p>
      </div>
    </Card>
  );
}
