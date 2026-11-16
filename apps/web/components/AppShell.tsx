"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useHealth } from "@/lib/hooks";
import { CommandPalette } from "./CommandPalette";
import { cx } from "./ui";

// Product shell: grouped sidebar, sticky top bar, sandbox indicator. The workspace is a sandbox with synthetic data.

type NavItem = { href: string; label: string; icon: ReactNode };
const icon = (d: string) => (
  <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Release",
    items: [
      { href: "/", label: "Overview", icon: icon("M2.5 2.5h4.5v5H2.5zM9 2.5h4.5v3H9zM9 7.5h4.5v6H9zM2.5 9.5h4.5v4H2.5z") },
      { href: "/history", label: "Test history", icon: icon("M2.5 3.5h11M2.5 6.5h11M2.5 9.5h11M2.5 12.5h11M5.5 2v12M9 2v12") },
    ],
  },
  {
    group: "Workflows",
    items: [
      { href: "/dev", label: "Developer", icon: icon("M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9 3l-2 10") },
      { href: "/triage", label: "Triage inbox", icon: icon("M2.5 9.5h3l1 2h3l1-2h3M2.5 9.5l1.5-6h8l1.5 6v4h-11z") },
    ],
  },
  {
    group: "Quality",
    items: [
      { href: "/flaky", label: "Flaky tests", icon: icon("M2 9.5l3-3 2.5 2.5L11 4l3 3M2 13.5h12") },
      { href: "/data-quality", label: "Data quality", icon: icon("M8 2.5v6M8 11v.5M3 13.5h10L8 2.5z") },
    ],
  },
  {
    group: "Agent",
    items: [
      { href: "/evals", label: "Agent evals", icon: icon("M3 8.5l3 3 7-7M2.5 13.5h11") },
      { href: "/rules", label: "Rules & policy", icon: icon("M4 2.5h8v11H4zM6 5.5h4M6 8h4M6 10.5h2.5") },
    ],
  },
  {
    group: "Platform",
    items: [
      { href: "/architecture", label: "Architecture", icon: icon("M2.5 3h4v3h-4zM9.5 3h4v3h-4zM6 10h4v3H6zM4.5 6v2h7V6M8 8v2") },
      { href: "/pilot", label: "Pilot plan", icon: icon("M3 13.5V3l4 2 4-2 2 1v9.5l-2-1-4 2-4-2z") },
    ],
  },
  {
    group: "Help",
    items: [
      { href: "/docs", label: "Docs", icon: icon("M3 2.5h7l3 3v8H3zM10 2.5v3h3M5.5 8.5h5M5.5 11h5") },
      { href: "/changelog", label: "What's new", icon: icon("M8 2v2M8 12v2M2 8h2M12 8h2M4 4l1.5 1.5M10.5 10.5L12 12M4 12l1.5-1.5M10.5 5.5L12 4") },
    ],
  },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const [drawer, setDrawer] = useState(false);
  const title =
    NAV.flatMap((g) => g.items)
      .filter((i) => isActive(path, i.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? "TestOps";

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="min-h-dvh">
      <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[2px] bg-accent" />
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-[#110d09] pt-[2px] transition-transform lg:translate-x-0",
          drawer ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Sidebar"
      >
        <Sidebar path={path} onNavigate={() => setDrawer(false)} />
      </aside>
      {drawer && <div aria-hidden className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setDrawer(false)} />}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas pt-[2px]">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              className="-ml-1 rounded-[3px] p-1.5 text-muted hover:text-ink lg:hidden"
              aria-label="Open navigation"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              {icon("M2.5 4h11M2.5 8h11M2.5 12h11")}
            </button>
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="hidden text-[13px] text-faint sm:inline">Kestrel Commerce</span>
              <span aria-hidden className="hidden text-faint sm:inline">/</span>
              <span className="truncate text-[14px] font-medium text-ink">{title}</span>
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <CommandPalette />
              <Link
                href="/#ask"
                className="hidden shrink-0 items-center gap-1.5 rounded-[3px] border border-accent/60 bg-accent/10 px-3 py-1.5 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent/20 sm:inline-flex"
              >
                Ask agent
              </Link>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1280px] px-4 pb-20 pt-6 sm:px-6 sm:pt-8 lg:px-8">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-1 px-4 py-4 font-mono text-[10.5px] text-faint sm:flex-row sm:justify-between sm:px-6 lg:px-8">
            <span>Sandbox workspace · Kestrel Commerce is fictional and every CI record is synthetic · read-only</span>
            <a href="https://github.com/dangtrinh3006/testops-intelligence-agent" target="_blank" rel="noopener noreferrer" className="hover:text-accent">
              Source on GitHub
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Sidebar({ path, onNavigate }: { path: string; onNavigate: () => void }) {
  return (
    <>
      <Link href="/" onClick={onNavigate} className="flex h-14 items-center gap-2.5 border-b border-line px-4" aria-label="TestOps overview">
        <Logo />
        <span className="font-serif text-[19px] leading-none tracking-[-0.02em] text-ink">
          TestOps<em className="text-accent">.ai</em>
        </span>
      </Link>

      <div className="border-b border-line px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-[4px] border border-line bg-surface px-2.5 py-2">
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-[3px] bg-accent/15 font-serif text-[15px] text-accent">
            K
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-ink">Kestrel Commerce</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-accent">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              Sandbox
            </span>
          </span>
        </div>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-4">
            <div className="label-mono mb-1.5 px-2 text-[10px] text-faint">{g.group}</div>
            <ul className="space-y-0.5">
              {g.items.map((n) => {
                const active = isActive(path, n.href);
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "flex items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-[13.5px] transition-colors",
                        active ? "bg-accent/10 text-ink shadow-[inset_2px_0_0_var(--accent)]" : "text-muted hover:bg-surface hover:text-ink",
                      )}
                    >
                      <span className={active ? "text-accent" : "text-faint"}>{n.icon}</span>
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line px-3 py-3">
        <SystemStatus />
      </div>
    </>
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

function SystemStatus() {
  const { data, error, loading } = useHealth();
  const rows: [string, string, string][] = loading
    ? [["API", "checking…", "bg-faint"]]
    : error || !data
      ? [["API", "unreachable", "bg-block"]]
      : [
          ["API", data.status === "ok" ? "operational" : "degraded", data.status === "ok" ? "bg-ship" : "bg-accent"],
          ["Data", data.data.status === "ok" ? data.data.source : "unavailable", data.data.status === "ok" ? "bg-ship" : "bg-block"],
          ["Model", data.model.configured ? (data.model.model ?? "configured") : "offline only", data.model.configured ? "bg-ship" : "bg-accent"],
          ["Rules", `v${data.rules_version}`, "bg-ship"],
        ];
  return (
    <dl role="status" aria-label="System status" className="space-y-1">
      {rows.map(([k, v, dot]) => (
        <div key={k} className="flex items-center gap-2 font-mono text-[10.5px]">
          <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", dot)} />
          <dt className="w-10 shrink-0 uppercase tracking-[0.08em] text-faint">{k}</dt>
          <dd className="min-w-0 truncate text-muted" title={v}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
