"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHealth } from "@/lib/hooks";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Console" },
  { href: "/architecture", label: "Architecture" },
  { href: "/pilot", label: "Pilot" },
  { href: "/flaky", label: "Flaky tests" },
  { href: "/data-quality", label: "Data quality" },
  { href: "/evals", label: "Agent evals" },
  { href: "/rules", label: "Rules" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2.5 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-[3px]" aria-label="TestOps Intelligence Agent — console">
          <Logo />
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="font-serif text-[19px] leading-none tracking-[-0.02em] text-ink">TestOps</span>
            <span className="label-mono truncate text-[10px] text-muted">Intelligence Agent</span>
          </span>
        </Link>
        <span className="label-mono hidden rounded-[3px] border border-dashed border-accent/60 px-2 py-0.5 text-[10px] text-accent md:inline">
          Synthetic data · Proof of concept
        </span>
        <div className="ml-auto flex min-w-0 max-w-full">
          <HealthChip />
        </div>
        <nav aria-label="Primary" className="order-last -mx-2 flex w-full flex-wrap gap-x-1 gap-y-0.5 lg:order-none lg:mx-0 lg:w-auto">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "label-mono relative rounded-[3px] px-2 py-1.5 text-[11.5px] transition-colors",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                {n.label}
                {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-px bg-accent" />}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="label-mono border-t border-line bg-accent/[0.08] px-4 py-1 text-center text-[10px] text-accent md:hidden">
        Synthetic data · Proof of concept
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <rect x="2" y="2" width="20" height="20" rx="3" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HealthChip() {
  const { data, error, loading } = useHealth();
  const base = "inline-flex max-w-full items-center gap-2 rounded-[3px] border px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em]";
  if (loading)
    return (
      <span role="status" className={cx(base, "border-line text-faint")}>
        checking api…
      </span>
    );
  if (error || !data)
    return (
      <span role="status" className={cx(base, "border-block/40 text-block")}>
        <span aria-hidden className="size-1.5 rounded-full bg-block" />
        api unreachable
      </span>
    );
  const ok = data.status === "ok";
  const source = data.data.status === "ok" ? data.data.source : "data unavailable";
  const model = data.model.configured ? (data.model.model ?? "model configured") : "offline/replay only";
  return (
    <span
      role="status"
      title={`API ${data.status} · data source ${source} · ${model} · rules ${data.rules_version}`}
      className={cx(base, "min-w-0 border-line bg-surface text-muted")}
    >
      <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", ok ? "bg-ship" : "bg-accent")} />
      <span className="shrink-0 text-ink">{source}</span>
      <span aria-hidden className="text-faint">·</span>
      <span className={cx("min-w-0 truncate normal-case tracking-normal", data.model.configured ? "text-accent" : "")}>{model}</span>
      <span aria-hidden className="hidden text-faint sm:inline">·</span>
      <span className="hidden shrink-0 sm:inline">rules {data.rules_version}</span>
    </span>
  );
}
