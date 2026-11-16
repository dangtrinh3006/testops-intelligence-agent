"use client";

import { useId, useState } from "react";
import { buttonClass, Card, cx, Numeral, SectionHeading, StatusChip } from "../ui";

const WEEKS = [
  {
    when: "W1",
    title: "Baseline & data-quality report",
    work: "Read-only CI token; ingest the last 30 days of runs; run the ETL; measure the triage baseline from ticket or chat timestamps, not from recall.",
    keeps: "Data-quality report on the real feed, baseline numbers, targets fixed for W4.",
  },
  {
    when: "W2–3",
    title: "Shadow mode, accept / override",
    work: "The agent triages every failed run as it lands. Engineers see verdict, evidence and hypothesis and accept or override. The QA lead edits the rule file once a week.",
    keeps: "Accept/override log; rule file v2 with your own error classes.",
  },
  {
    when: "W4",
    title: "Measure, tune rules, go / no-go",
    work: "Measure against the W1 baseline with the same method, tune the rules, hold the go/no-go meeting.",
    keeps: "Pilot report and a decision.",
  },
];

const CRITERIA = [
  { c: "Classification accepted without edit", t: "≥ 70% of failed runs", m: "accept/override log" },
  { c: "Median time to first classification", t: "down ≥ 30% vs W1", m: "timestamps, same method as the baseline" },
  { c: "Unsafe recommendations", t: "0 SHIP on a run a human later held", m: "release log vs gate verdicts" },
  { c: "Provenance", t: "0 evidence ids that fail to resolve", m: "validator check evidence_ids_resolve, per request" },
  { c: "Data-quality value", t: "≥ 1 integration defect found", m: "W1 report, confirmed by the platform team" },
];

const DRIVERS = [
  { k: "Integration engineering", v: "Your CI API's quirks: pagination, redelivery, attempt granularity, artifact access. The largest and least certain line." },
  { k: "Inference", v: "Per question at most 8 tool calls, one revision, temperature 0; a daily cap. Price = tokens × the list price of the model you choose." },
  { k: "Hosting & database", v: "One Python service and one Postgres. Small until ingestion is continuous." },
  { k: "Security review", v: "Read-only role, no model-written SQL, logs as untrusted data, endpoint choice. Starts in W1, not W4." },
  { k: "Rule maintenance", v: "The QA lead's time editing YAML weekly. The file is yours; no vendor needed to change a rule." },
];

const RISKS = [
  { k: "Wrong explanation", v: "Validator rejects unknown ids, ungrounded numbers and stray verdicts; an engineer accepts or overrides every item." },
  { k: "Model or provider outage", v: "Fallback model, then offline mode, always labelled. Tools and the gate answer without a model." },
  { k: "Incomplete or late CI feed", v: "Incomplete or missing summary means HOLD, never PASS by default. W1 report names the gaps first." },
  { k: "Rules do not fit", v: "Versioned YAML you own; unknown error classes show as UNCLASSIFIED; weekly rule review." },
  { k: "Security objection to a cloud model", v: "OpenAI-compatible endpoint chosen with your security team in W1; read-only database role." },
];

type Inputs = { runs: string; base: string; assisted: string; share: string; rate: string };
const DEFAULTS: Inputs = { runs: "200", base: "25", assisted: "15", share: "70", rate: "60" };

const num = (s: string) => {
  const v = Number(s);
  return s.trim() !== "" && Number.isFinite(v) && v >= 0 ? v : null;
};
const hoursFor = (runs: number, share: number, saved: number) => (runs * (share / 100) * saved) / 60;
const fmtH = (h: number) => h.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmtUsd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

export function PilotView() {
  return (
    <div className="space-y-24">
      <Timeline />
      <Criteria />
      <Roi />
      <DriversAndRisks />
      <Exit />
    </div>
  );
}

function Timeline() {
  return (
    <section aria-labelledby="plan-title">
      <SectionHeading id="plan-title" eyebrow="Four weeks" title={<>One CI source, one service, <em className="italic text-accent">read-only</em></>}>
        One tenant, no SSO, no write access to CI, tickets or releases. The model endpoint is chosen with your security team in week 1.
      </SectionHeading>
      <ol className="grid gap-3 md:grid-cols-3">
        {WEEKS.map((w, i) => (
          <li key={w.when} className="flex flex-col rounded-[4px] border border-line bg-surface">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
              <Numeral n={i + 1} label={w.when} />
              {i === 0 && <StatusChip tone="amber">fixed fee · go/no-go</StatusChip>}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <h3 className="font-serif text-[22px] leading-snug tracking-[-0.01em] text-ink">{w.title}</h3>
              <p className="mt-2 text-[14px] text-muted">{w.work}</p>
              <p className="mt-auto border-t border-line pt-3 text-[13.5px] text-ink">
                <span className="label-mono mr-1.5 text-[10px] text-accent">You keep</span>
                {w.keeps}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Criteria() {
  return (
    <section aria-labelledby="crit-title">
      <SectionHeading id="crit-title" eyebrow="Success criteria" title={<>Targets set from <em className="italic text-accent">your</em> W1 baseline</>}>
        Starting proposals. Each one has a measurement method agreed before shadow mode starts.
      </SectionHeading>
      <Card className="overflow-hidden">
        <table className="w-full text-[14px]">
          <thead className="hidden border-b border-line bg-sunken/50 sm:table-header-group">
            <tr>
              <th scope="col" className="label-mono px-5 py-3 text-left font-medium text-faint">Criterion</th>
              <th scope="col" className="label-mono px-4 py-3 text-left font-medium text-faint">Starting target</th>
              <th scope="col" className="label-mono px-5 py-3 text-left font-medium text-faint">How it is measured</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {CRITERIA.map((r, i) => (
              <tr key={r.c} className="grid gap-1 px-4 py-3.5 transition-colors hover:bg-sunken/40 sm:table-row sm:p-0">
                <th scope="row" className="text-left font-normal text-ink sm:px-5 sm:py-3.5">
                  <span className="label-mono mr-2 text-[10.5px] text-accent">{String(i + 1).padStart(2, "0")}</span>
                  {r.c}
                </th>
                <td className="font-mono text-[13px] text-accent sm:px-4 sm:py-3.5">{r.t}</td>
                <td className="text-muted sm:px-5 sm:py-3.5">{r.m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function NumberInput({
  id,
  label,
  unit,
  value,
  onChange,
  max,
  step = 1,
}: {
  id: string;
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  step?: number;
}) {
  const invalid = num(value) == null || (num(value) ?? 0) > max;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label-mono block text-[10.5px] text-faint">
        {label}
      </label>
      <div className="mt-1.5 flex items-center rounded-[3px] border border-line-strong bg-canvas focus-within:border-accent">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={step}
          value={value}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
          className="tabular w-full min-w-0 bg-transparent px-3 py-2 font-mono text-[15px] text-ink focus:outline-none"
        />
        {unit && <span className="shrink-0 pr-3 font-mono text-[11px] text-faint">{unit}</span>}
      </div>
      {invalid && <p className="mt-1 text-[11.5px] text-block">Enter a number from 0 to {max.toLocaleString("en-US")}.</p>}
    </div>
  );
}

function Roi() {
  const uid = useId();
  const [v, setV] = useState<Inputs>(DEFAULTS);
  const set = (k: keyof Inputs) => (x: string) => setV((s) => ({ ...s, [k]: x }));

  const runs = Math.min(num(v.runs) ?? 0, 100000);
  const base = num(v.base) ?? 0;
  const assisted = num(v.assisted) ?? 0;
  const share = Math.min(num(v.share) ?? 0, 100);
  const rate = num(v.rate) ?? 0;
  const saved = Math.max(0, base - assisted);
  const hours = hoursFor(runs, share, saved);
  const edited = (Object.keys(DEFAULTS) as (keyof Inputs)[]).some((k) => v[k] !== DEFAULTS[k]);

  const runCols = [0.5, 1, 1.5].map((f) => ({ f, runs: runs * f }));
  const savedRows = [
    { label: "Low", f: 0.5 },
    { label: "Base", f: 1 },
    { label: "High", f: 1.5 },
  ].map((r) => ({ ...r, saved: saved * r.f }));

  return (
    <section aria-labelledby="roi-title">
      <SectionHeading id="roi-title" eyebrow="ROI calculator" title={<>Your numbers, <em className="italic text-accent">our formula</em></>}>
        Nothing here is measured data. The defaults are neutral placeholders; replace them with your own, then with the W1 baseline.
      </SectionHeading>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sunken/50 px-4 py-2 sm:px-5">
          <span className="label-mono text-faint">calculator · runs in your browser</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusChip tone="amber">your numbers · not measured</StatusChip>
            {edited && (
              <button type="button" className={buttonClass("ghost")} onClick={() => setV(DEFAULTS)}>
                Reset
              </button>
            )}
          </span>
        </div>
        <div className="grid gap-px bg-line lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-5 bg-surface p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput id={`${uid}-runs`} label="Failed runs per month" value={v.runs} onChange={set("runs")} max={100000} />
              <NumberInput id={`${uid}-share`} label="Share triaged by the agent" unit="%" value={v.share} onChange={set("share")} max={100} />
              <NumberInput id={`${uid}-base`} label="Baseline minutes per triage" unit="min" value={v.base} onChange={set("base")} max={600} />
              <NumberInput id={`${uid}-assisted`} label="Assisted minutes per triage" unit="min" value={v.assisted} onChange={set("assisted")} max={600} />
              <NumberInput id={`${uid}-rate`} label="Loaded hourly cost" unit="USD/h" value={v.rate} onChange={set("rate")} max={1000} step={5} />
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-[3px] border border-line bg-canvas px-3 py-2.5 font-mono text-[12px] leading-relaxed text-accent-hover">
              {"hours_saved / month = failed_runs × share_triaged × (baseline_min − assisted_min) / 60\ncost_saved / month  = hours_saved × hourly_cost"}
            </pre>
            {assisted > base && <p className="text-[13px] text-accent">Assisted minutes exceed the baseline, so minutes saved is 0.</p>}
          </div>
          <div className="flex flex-col bg-surface p-4 sm:p-5" aria-live="polite">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[4px] border border-line p-4">
                <div className="label-mono text-[10.5px] text-faint">Hours saved / month</div>
                <div className="tabular mt-2 break-all font-serif text-[30px] leading-none tracking-[-0.02em] text-ink sm:text-[38px]">{fmtH(hours)}</div>
              </div>
              <div className="rounded-[4px] border border-accent/40 bg-accent/[0.05] p-4">
                <div className="label-mono text-[10.5px] text-accent">Cost saved / month</div>
                <div className="tabular mt-2 break-all font-serif text-[30px] leading-none tracking-[-0.02em] text-accent sm:text-[38px]">{fmtUsd(hours * rate)}</div>
              </div>
            </div>
            <p className="mt-3 font-mono text-[11.5px] text-muted">
              {runs.toLocaleString("en-US")} × {share}% × ({base} − {assisted}) / 60 = {fmtH(hours)} h
            </p>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[20rem] text-[13px]">
                <caption className="label-mono pb-2 text-left text-[10.5px] text-faint">
                  Sensitivity · hours and cost per month
                </caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="label-mono py-2 pr-2 text-left text-[10px] font-medium text-faint">
                      Min saved ↓ · runs →
                    </th>
                    {runCols.map((c) => (
                      <th key={c.f} scope="col" className="label-mono px-2 py-2 text-right text-[10px] font-medium text-faint">
                        {Math.round(c.runs).toLocaleString("en-US")}
                        <span className="block normal-case tracking-normal">{c.f === 1 ? "as entered" : c.f < 1 ? "−50%" : "+50%"}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {savedRows.map((r) => (
                    <tr key={r.label}>
                      <th scope="row" className="py-2 pr-2 text-left font-normal text-ink">
                        <span className="label-mono text-[10px] text-faint">{r.label}</span>{" "}
                        <span className="font-mono">{fmtH(r.saved).replace(/\.0$/, "")} min</span>
                      </th>
                      {runCols.map((c) => {
                        const h = hoursFor(c.runs, share, r.saved);
                        const center = r.f === 1 && c.f === 1;
                        return (
                          <td key={c.f} className={cx("tabular px-2 py-2 text-right font-mono", center ? "bg-accent/[0.07] text-accent" : "text-ink")}>
                            {fmtH(h)} h<span className="block text-[11px] text-muted">{fmtUsd(h * rate)}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[12.5px] text-muted">
              Hours saved cannot exceed total triage time. What this line does not capture: releases held that would have shipped on a wrong PASS,
              and infra incidents found through infra-only retries.
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}

function KList({ items }: { items: { k: string; v: string }[] }) {
  return (
    <ul className="border-t border-line">
      {items.map((x, i) => (
        <li key={x.k} className="grid gap-1 border-b border-line py-3.5 sm:grid-cols-[13rem_1fr] sm:gap-5">
          <Numeral n={i + 1} label={x.k} />
          <span className="text-[14px] text-muted">{x.v}</span>
        </li>
      ))}
    </ul>
  );
}

function DriversAndRisks() {
  return (
    <section aria-labelledby="cost-title" className="grid gap-12 lg:grid-cols-2">
      <div>
        <SectionHeading id="cost-title" eyebrow="Cost drivers" title="What the pilot price is made of">
          No dollar price here. Integration is the largest line; the rest is small and bounded.
        </SectionHeading>
        <KList items={DRIVERS} />
      </div>
      <div>
        <SectionHeading eyebrow="Risks" title="And how each one is contained">
          Mitigations already in the build, plus what the pilot adds.
        </SectionHeading>
        <KList items={RISKS} />
      </div>
    </section>
  );
}

function Exit() {
  return (
    <section aria-labelledby="exit-title" className="rounded-[4px] border border-accent/45 bg-accent/[0.05] p-5 sm:p-8">
      <div className="label-mono flex items-center gap-3 text-accent">
        <span aria-hidden className="h-px w-8 bg-accent" />
        Exit criteria
      </div>
      <h2 id="exit-title" className="mt-4 max-w-3xl font-serif text-[26px] leading-snug tracking-[-0.02em] text-ink sm:text-[32px]">
        If the W1 baseline shows no triage pain, <em className="italic text-accent">stop</em> and keep the data-quality report.
      </h2>
      <p className="mt-4 max-w-3xl text-[14.5px] text-muted">
        Later exit: if the acceptance rate is under 50% at the end of W3 with the rule file already tuned once, stop. You keep the measured
        baseline, the data-quality report and the rule file. If the criteria are met, the next step is a second service and a production
        integration plan.
      </p>
    </section>
  );
}
