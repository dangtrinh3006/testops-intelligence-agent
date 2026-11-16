"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { RUN_PRESET_EVENT } from "./console/Console";
import { useInspector } from "./inspector-context";
import { cx } from "./ui";

// "Get started" checklist for the Overview. Progress is per browser (localStorage), never sent anywhere.

const KEY = "testops.onboarding.v1";
const CHANGE = "testops:onboarding-change";

type State = { done: string[]; dismissed: boolean };
const EMPTY = JSON.stringify({ done: [], dismissed: false } satisfies State);

function readRaw(): string {
  try {
    return window.localStorage.getItem(KEY) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(next: State) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the checklist still works for this page view */
  }
  window.dispatchEvent(new Event(CHANGE));
}

function parse(raw: string): State {
  try {
    const v = JSON.parse(raw) as Partial<State>;
    return { done: Array.isArray(v.done) ? v.done : [], dismissed: !!v.dismissed };
  } catch {
    return { done: [], dismissed: false };
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE, cb);
    window.removeEventListener("storage", cb);
  };
}

function useOnboarding(): State {
  const raw = useSyncExternalStore(subscribe, readRaw, () => EMPTY);
  return parse(raw);
}

function markDone(id: string) {
  const s = parse(readRaw());
  if (!s.done.includes(id)) write({ ...s, done: [...s.done, id] });
}

/** Restores a dismissed checklist (used on /docs). */
export function ShowOnboardingAgain() {
  const s = useOnboarding();
  return (
    <button
      type="button"
      onClick={() => write({ done: s.done, dismissed: false })}
      className="rounded-[3px] border border-line-strong px-2.5 py-1 font-mono text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
    >
      {s.dismissed ? "Show the Get started checklist again" : "Checklist is visible on the Overview"}
    </button>
  );
}

type Step = { id: string; title: string; hint: string } & ({ href: string } | { action: "rc" | "ask" | "evidence" });

const STEPS: Step[] = [
  { id: "rc", title: "Review release candidates", hint: "Three releases, three different verdicts.", action: "rc" },
  { id: "ask", title: "Ask the agent about scenario C", hint: "The CI summary says PASS; the raw data disagrees.", action: "ask" },
  { id: "evidence", title: "Open a piece of evidence", hint: "Every id in an answer opens the record behind it.", action: "evidence" },
  { id: "history", title: "Explore test history", hint: "Forty runs per service, rebuilt from attempts.", href: "/history" },
  { id: "docs", title: "Read how the gate decides", hint: "Six rules, first match wins.", href: "/docs#concepts" },
];

export function OnboardingChecklist() {
  const s = useOnboarding();
  const { open } = useInspector();
  if (s.dismissed) return null;
  const done = STEPS.filter((x) => s.done.includes(x.id)).length;
  const pct = Math.round((done / STEPS.length) * 100);

  const run = (step: Step) => {
    markDone(step.id);
    if ("href" in step) return;
    if (step.action === "rc") document.getElementById("rc-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (step.action === "ask") {
      document.getElementById("ask")?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.dispatchEvent(new CustomEvent(RUN_PRESET_EVENT, { detail: "C" }));
    }
    if (step.action === "evidence") open("run-pay-main-0233");
  };

  return (
    <section aria-labelledby="onboarding-title" className="mb-6 rounded-[4px] border border-accent/30 bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 id="onboarding-title" className="text-[14px] font-medium text-ink">
          Get started
        </h2>
        <span className="font-mono text-[11px] text-faint">
          {done} of {STEPS.length} done
        </span>
        <div
          className="h-1 min-w-[6rem] flex-1 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Onboarding progress"
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <button
          type="button"
          onClick={() => write({ ...s, dismissed: true })}
          className="font-mono text-[11px] text-faint hover:text-ink"
          aria-label="Dismiss the Get started checklist"
        >
          Dismiss
        </button>
      </div>
      <ol className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-5">
        {STEPS.map((step, i) => {
          const isDone = s.done.includes(step.id);
          const inner = (
            <>
              <span
                aria-hidden
                className={cx(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[10px]",
                  isDone ? "border-ship bg-ship/20 text-ship" : "border-line-strong text-faint",
                )}
              >
                {isDone ? "✓" : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cx("block text-[13px] font-medium", isDone ? "text-muted line-through decoration-faint" : "text-ink")}>{step.title}</span>
                <span className="mt-0.5 block text-[12px] text-faint">{step.hint}</span>
              </span>
            </>
          );
          const cls = "flex h-full w-full items-start gap-2.5 bg-surface px-4 py-3 text-left transition-colors hover:bg-sunken/70 sm:px-5";
          return (
            <li key={step.id}>
              {"href" in step ? (
                <Link href={step.href} onClick={() => markDone(step.id)} className={cls} aria-label={`${step.title}${isDone ? " (done)" : ""}`}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={() => run(step)} className={cls} aria-label={`${step.title}${isDone ? " (done)" : ""}`}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
