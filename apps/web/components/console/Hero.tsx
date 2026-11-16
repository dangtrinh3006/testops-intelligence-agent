"use client";

import Link from "next/link";
import { useHealth, useOverview } from "@/lib/hooks";
import { buttonClass, Eyebrow, Skeleton } from "../ui";
import { RUN_PRESET_EVENT } from "./Console";
import { HeroConsole } from "./HeroConsole";

const fmt = (n: number | undefined) => (n == null ? null : n.toLocaleString("en-US"));

export function Hero() {
  const runC = () => {
    document.getElementById("ask-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.dispatchEvent(new CustomEvent(RUN_PRESET_EVENT, { detail: "C" }));
  };

  return (
    <section aria-labelledby="hero-title" className="pb-12 pt-4 sm:pb-16 sm:pt-8">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <div className="min-w-0">
          <Eyebrow className="mb-6">Kestrel Commerce · Release console</Eyebrow>
          <h1 id="hero-title" className="font-serif text-[40px] leading-[1.04] tracking-[-0.03em] text-ink sm:text-[56px] lg:text-[60px]">
            A Digital TestOps Engineer for <em className="italic text-accent">release decisions</em>.
          </h1>
          <p className="mt-6 max-w-xl font-serif text-[19px] leading-relaxed text-muted sm:text-[21px]">
            <span className="text-ink">Rules decide. The model explains.</span> Every claim links to a record, and every answer is checked before
            you see it.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" onClick={runC} className={buttonClass("primary", "md")}>
              Run scenario C <span aria-hidden>→</span>
            </button>
            <Link href="/architecture" className={buttonClass("secondary", "md")}>
              How it works
            </Link>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-5">
            {[
              ["8", "read-only tools"],
              ["R1–R6", "versioned rules"],
              ["5", "checks per answer"],
            ].map(([n, l]) => (
              <div key={l}>
                <dt className="sr-only">{l}</dt>
                <dd className="font-serif text-[26px] leading-none text-ink">{n}</dd>
                <dd className="label-mono mt-2 text-[10px] text-faint">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        <HeroConsole onRunLive={runC} />
      </div>
      <Layers />
    </section>
  );
}

function Layers() {
  const overview = useOverview();
  const health = useHealth();
  const t = overview.data?.totals;
  const rules = health.data?.rules_version;

  const rows: { label: string; desc: string; note: React.ReactNode }[] = [
    {
      label: "Evidence",
      desc: "Raw events from CI server, test runner, artifact store",
      note: t ? `immutable, ${fmt(t.raw_events)} events` : "immutable raw events",
    },
    {
      label: "Normalisation",
      desc: "UTC timestamps, deduplication, status vocabularies, data-quality findings",
      note: t ? `raw kept beside normalised · ${fmt(t.findings)} findings` : "raw kept beside normalised",
    },
    {
      label: "Expert rules",
      desc: "Failure taxonomy, flake levels, release gate R1–R6 (versioned YAML)",
      note: rules ? `rules decide · v${rules}` : "rules decide",
    },
    {
      label: "Agent",
      desc: "LangGraph: tools → compose → validate → revise once",
      note: "model explains",
    },
  ];

  return (
    <div className="mt-14 border-y border-line" role="table" aria-label="System layers">
      <div role="row" className="sr-only">
        <span role="columnheader">Layer</span>
        <span role="columnheader">What it does</span>
        <span role="columnheader">Note</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.label}
          role="row"
          className="grid gap-x-6 gap-y-1 border-b border-line py-4 transition-colors last:border-b-0 hover:bg-surface/60 sm:grid-cols-[13rem_1fr_auto] sm:items-baseline sm:px-2"
        >
          <span role="rowheader" className="label-mono flex items-center gap-2.5 text-accent">
            <span className="text-faint">{String(i + 1).padStart(2, "0")}</span>
            {r.label}
          </span>
          <span role="cell" className="text-[15px] text-ink">
            {r.desc}
          </span>
          <span role="cell" className="font-mono text-[11.5px] text-faint sm:text-right">
            {overview.loading && i < 2 ? <Skeleton className="h-3 w-40 sm:ml-auto" /> : r.note}
          </span>
        </div>
      ))}
    </div>
  );
}
