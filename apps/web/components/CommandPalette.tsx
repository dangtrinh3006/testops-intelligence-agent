"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { useOverview } from "@/lib/hooks";
import type { Verdict } from "@/lib/types";
import { useInspector } from "./inspector-context";
import { cx, VerdictBadge } from "./ui";

// Global ⌘K palette: pages, releases, runs and tests; records open in the evidence inspector.

type Kind = "page" | "release" | "run" | "test" | "ask";
// Items are plain data; the action runs in event handlers, never during render.
type Item = { key: string; kind: Kind; id: string; label: string; verdict?: Verdict; href?: string; inspectId?: string };
type Group = { title: string; items: Item[] };

const PAGES: { href: string; label: string }[] = [
  { href: "/", label: "Overview" },
  { href: "/history", label: "Test history" },
  { href: "/flaky", label: "Flaky tests" },
  { href: "/data-quality", label: "Data quality" },
  { href: "/evals", label: "Agent evals" },
  { href: "/rules", label: "Rules" },
  { href: "/audit", label: "Audit log" },
  { href: "/fleet", label: "Agent fleet & connectors" },
  { href: "/architecture", label: "Architecture" },
  { href: "/pilot", label: "Pilot" },
  { href: "/settings", label: "Settings & integrations" },
  { href: "/dev", label: "Developer workspace" },
  { href: "/triage", label: "Triage inbox" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "What's new" },
];

const TEST_ID = /^T-[A-Z]+-\d+$/i;
const PER_GROUP = 8;

const noopSubscribe = () => () => {};
const readIsMac = () => {
  const p = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform;
  return /mac|iphone|ipad/i.test(p);
};

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

export function CommandPalette() {
  const router = useRouter();
  const { open: inspect } = useInspector();
  const overview = useOverview();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Server renders the Mac hint; the client switches after hydration without a mismatch.
  const isMac = useSyncExternalStore(noopSubscribe, readIsMac, () => true);
  const [tests, setTests] = useState<{ id: string; name: string }[] | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId();

  const openPalette = useCallback(() => {
    setQuery("");
    setActive(0);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) close();
        else openPalette();
      } else if (e.key === "/" && !isOpen && !isTyping(e.target)) {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close, openPalette]);

  // Tests load lazily on first open; failures just leave the group empty.
  useEffect(() => {
    if (!isOpen || tests) return;
    let alive = true;
    api
      .flaky()
      .then((r) => alive && setTests(r.flaky.tests.map((t) => ({ id: t.test_id, name: t.name }))))
      .catch(() => alive && setTests([]));
    return () => {
      alive = false;
    };
  }, [isOpen, tests]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const groups: Group[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (...xs: (string | undefined)[]) => !q || xs.some((x) => x?.toLowerCase().includes(q));
    const pages: Item[] = PAGES.filter((p) => match(p.label, p.href)).map((p) => ({
      key: `page:${p.href}`, kind: "page", id: p.href, label: p.label, href: p.href,
    }));
    const releases: Item[] = (overview.data?.release_candidates ?? [])
      .filter((rc) => match(rc.id, rc.service_id, rc.version, rc.run_id))
      .map((rc) => ({
        key: `rc:${rc.id}`, kind: "release", id: rc.id, label: `${rc.service_id} ${rc.version}`, verdict: rc.verdict, inspectId: rc.id,
      }));
    const runs: Item[] = (overview.data?.latest_runs ?? [])
      .filter((r) => match(r.run_id, r.service_id, r.pipeline_id, r.commit))
      .map((r) => ({
        key: `run:${r.run_id}`, kind: "run", id: r.run_id, label: `${r.service_id} · #${r.run_number} · ${r.commit.slice(0, 7)}`,
        verdict: r.gate_verdict, inspectId: r.run_id,
      }));
    const known = (tests ?? []).filter((t) => match(t.id, t.name));
    const typed = query.trim().toUpperCase();
    const testItems: Item[] = known.map((t) => ({ key: `test:${t.id}`, kind: "test", id: t.id, label: t.name, inspectId: t.id }));
    if (TEST_ID.test(typed) && !testItems.some((t) => t.id === typed)) {
      testItems.unshift({ key: `test:${typed}`, kind: "test", id: typed, label: "Open test by id", inspectId: typed });
    }

    const out: Group[] = [
      { title: "Pages", items: pages },
      { title: "Release candidates", items: releases },
      { title: "Recent runs", items: runs },
      { title: "Tests", items: testItems },
    ].map((g) => ({ ...g, items: g.items.slice(0, PER_GROUP) }));
    if (query.trim().length >= 3) {
      const text = query.trim();
      out.push({
        title: "Agent",
        items: [{ key: "ask", kind: "ask", id: "ask", label: `Ask the agent: “${text}”`, href: `/?ask=${encodeURIComponent(text)}` }],
      });
    }
    return out.filter((g) => g.items.length > 0);
  }, [query, overview.data, tests]);

  const runItem = (item: Item | undefined) => {
    if (!item) return;
    close();
    if (item.inspectId) inspect(item.inspectId);
    else if (item.href) router.push(item.href);
  };

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current = Math.min(active, Math.max(0, flat.length - 1));

  // Keep the selected row visible while moving with the keyboard.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (flat.length ? (Math.min(i, flat.length - 1) + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (flat.length ? (Math.min(i, flat.length - 1) - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runItem(flat[current]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  let index = -1;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPalette}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="group flex h-8 w-full min-w-0 max-w-[22rem] items-center gap-2 rounded-[4px] border border-line bg-canvas px-2.5 text-left text-[13px] text-faint transition-colors hover:border-line-strong hover:text-muted"
      >
        <SearchIcon />
        <span className="min-w-0 flex-1 truncate">Search runs, tests, releases…</span>
        <kbd className="hidden shrink-0 rounded-[3px] border border-line px-1.5 py-px font-mono text-[10.5px] text-faint sm:inline">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh]">
          <div aria-hidden className="absolute inset-0 bg-black/70" onClick={close} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative flex max-h-[70vh] w-full max-w-[38rem] flex-col overflow-hidden rounded-[6px] border border-line-strong bg-surface shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)]"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-3.5">
              <SearchIcon />
              <label htmlFor={`${uid}-input`} className="sr-only">
                Search runs, tests and releases
              </label>
              <input
                ref={inputRef}
                id={`${uid}-input`}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={flat.length ? optionId(current) : undefined}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKey}
                placeholder="Type a run, test, release or question…"
                autoComplete="off"
                spellCheck={false}
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
              />
              <kbd className="shrink-0 rounded-[3px] border border-line px-1.5 py-px font-mono text-[10.5px] text-faint">esc</kbd>
            </div>

            <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto py-1.5">
              {groups.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-faint">No matches</li>}
              {groups.map((g) => (
                <li key={g.title} role="presentation">
                  <div className="label-mono px-4 pb-1 pt-2.5 text-[10px] text-faint">{g.title}</div>
                  <ul role="group" aria-label={g.title}>
                    {g.items.map((item) => {
                      index += 1;
                      const i = index;
                      const selected = i === current;
                      return (
                        <li
                          key={item.key}
                          id={optionId(i)}
                          data-index={i}
                          role="option"
                          aria-selected={selected}
                          onMouseMove={() => active !== i && setActive(i)}
                          onClick={() => runItem(item)}
                          className={cx(
                            "mx-1.5 flex cursor-pointer items-center gap-3 rounded-[4px] px-2.5 py-2",
                            selected ? "bg-accent/10" : "hover:bg-sunken/60",
                          )}
                        >
                          <span className={cx("shrink-0 font-mono text-[12px]", selected ? "text-accent" : "text-ink")}>
                            {item.kind === "ask" ? "→" : item.id}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{item.label}</span>
                          {item.verdict && (
                            <span className="hidden shrink-0 sm:inline-flex">
                              <VerdictBadge verdict={item.verdict} size="sm" />
                            </span>
                          )}
                          <span className="label-mono shrink-0 text-[9.5px] text-faint">{item.kind === "ask" ? "agent" : item.kind}</span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3.5 py-2 font-mono text-[10.5px] text-faint">
              <span>↑↓ navigate</span>
              <span aria-hidden>·</span>
              <span>↵ open</span>
              <span aria-hidden>·</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" className="shrink-0 text-faint">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
