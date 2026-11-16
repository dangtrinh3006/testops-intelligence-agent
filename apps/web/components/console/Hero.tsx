"use client";

import Link from "next/link";
import { useHealth, useOverview } from "@/lib/hooks";
import { buttonClass, Eyebrow, Skeleton } from "../ui";
import { RUN_PRESET_EVENT } from "./Console";

const fmt = (n: number | undefined) => (n == null ? null : n.toLocaleString("en-US"));

export function Hero() {
  const runC = () => {
    document.getElementById("ask-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.dispatchEvent(new CustomEvent(RUN_PRESET_EVENT, { detail: "C" }));
  };

  return (
    <section aria-labelledby="hero-title" className="pb-12 pt-4 sm:pb-16 sm:pt-8">
      <Eyebrow className="mb-6">Kestrel Commerce · Release console</Eyebrow>
      <h1 id="hero-title" className="max-w-4xl font-serif text-[38px] leading-[1.06] tracking-[-0.03em] text-ink sm:text-[56px] lg:text-[68px]">
        A Digital TestOps Engineer for <em className="italic text-accent">release decisions</em>.
      </h1>
      <p className="mt-6 max-w-2xl font-serif text-[20px] leading-relaxed text-muted sm:text-[22px]">
        Rules decide. The model explains. Every claim links to a record.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button type="button" onClick={runC} className={buttonClass("primary", "md")}>
          Run scenario C <span aria-hidden>→</span>
        </button>
        <Link href="/architecture" className={buttonClass("secondary", "md")}>
          How it works
        </Link>
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
