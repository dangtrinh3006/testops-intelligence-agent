"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHealth } from "@/lib/hooks";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Console" },
  { href: "/flaky", label: "Flaky tests" },
  { href: "/data-quality", label: "Data quality" },
  { href: "/evals", label: "Agent evals" },
  { href: "/rules", label: "Rules" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="TestOps Intelligence Agent — console">
          <Logo />
          <span className="truncate text-sm font-semibold tracking-tight text-ink">TestOps Intelligence Agent</span>
        </Link>
        <span className="hidden rounded-full border border-dashed border-amber-500/60 px-2 py-0.5 text-[11px] font-medium text-amber-800 sm:inline dark:text-amber-300">
          Synthetic data · Proof of concept
        </span>
        <div className="ml-auto">
          <HealthPill />
        </div>
        <nav aria-label="Primary" className="order-last -mx-1 flex w-full flex-wrap gap-1 lg:order-none lg:mx-0 lg:w-auto">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active ? "bg-sunken font-medium text-ink" : "text-muted hover:bg-sunken hover:text-ink",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="border-t border-line bg-amber-50/70 px-4 py-1 text-center text-[11px] font-medium text-amber-900 sm:hidden dark:bg-amber-500/10 dark:text-amber-200">
        Synthetic data · Proof of concept
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" className="shrink-0 text-ink">
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="currentColor" />
      <path d="M7 12.5l3 3 7-7" fill="none" stroke="var(--surface)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HealthPill() {
  const { data, error, loading } = useHealth();
  if (loading) return <span className="text-xs text-faint">Checking API…</span>;
  if (error || !data)
    return (
      <span role="status" className="inline-flex items-center gap-1.5 rounded-full border border-red-300 px-2 py-0.5 text-[11px] text-red-700 dark:border-red-500/40 dark:text-red-300">
        <span aria-hidden className="size-1.5 rounded-full bg-red-500" />
        API unreachable
      </span>
    );
  const ok = data.status === "ok";
  const source = data.data.status === "ok" ? data.data.source : "data unavailable";
  const model = data.model.configured ? (data.model.model ?? "model configured") : "offline/replay only";
  return (
    <span
      role="status"
      title={`API ${data.status} · data source ${source} · ${model} · rules ${data.rules_version}`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-muted"
    >
      <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", ok ? "bg-emerald-500" : "bg-amber-500")} />
      <span className="font-mono">{source}</span>
      <span aria-hidden className="text-faint">·</span>
      <span className={cx("truncate", data.model.configured ? "text-violet-700 dark:text-violet-300" : "")}>{model}</span>
      <span aria-hidden className="hidden text-faint sm:inline">·</span>
      <span className="hidden font-mono sm:inline">rules {data.rules_version}</span>
    </span>
  );
}
