"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api, errorMessage } from "@/lib/api";
import type { SuggestedAction, TriageCode, TriageItem } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { TriagePill } from "../Attempts";
import { EvidenceChip } from "../Evidence";
import { buttonClass, Card, cx, ErrorBlock, LoadingBlock } from "../ui";

// Triage inbox for QE. Decisions are a local draft (localStorage) and are also sent, fire-and-forget, to the
// audit log; nothing is written to CI or the dataset.

const DECISIONS_STORE = "testops.triage.decisions.v1";
const AUDIT_NOTE_CHARS = 200;
const CHANGE_EVENT = "testops:triage-decisions";

const ACTIONS: Record<SuggestedAction, string> = {
  fix_product: "Fix product",
  fix_test: "Fix test",
  platform_ticket: "Platform ticket",
  propose_quarantine: "Propose quarantine",
  investigate: "Investigate",
};
const DEFECTS: TriageCode[] = ["PB", "AB", "SI", "TI"];
const DEFECT_LABEL: Record<TriageCode, string> = { PB: "Product Bug", AB: "Automation Bug", SI: "System Issue", TI: "To Investigate" };

type Decision = { status: "accepted" | "overridden"; action: SuggestedAction; note?: string; decided_at: string };
type Decisions = Record<string, Decision>;
type AuditHint = "recorded" | "unavailable" | null;

// Latest attempt for the item (evidence is in run order); lets the audit entry point at a concrete record.
const latestAttempt = (item: TriageItem) => [...item.evidence].reverse().find((id) => id.startsWith("att-")) ?? null;

function sendToAudit(item: TriageItem, d: Decision, onResult: (h: AuditHint) => void) {
  api
    .recordTriageDecisions([
      {
        test_id: item.test_id,
        attempt_id: latestAttempt(item),
        suggested_action: item.suggested_action,
        chosen_action: d.action,
        status: d.status,
        note: d.note ? d.note.slice(0, AUDIT_NOTE_CHARS) : null,
      },
    ])
    .then(
      () => onResult("recorded"),
      () => onResult("unavailable"),
    );
}

// --- tiny external store over localStorage, so server and client render the same first frame ---
function readRaw(): string {
  try {
    return window.localStorage.getItem(DECISIONS_STORE) ?? "{}";
  } catch {
    return "{}";
  }
}
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}
function writeDecisions(next: Decisions) {
  try {
    window.localStorage.setItem(DECISIONS_STORE, JSON.stringify(next));
  } catch {
    /* storage unavailable: decisions last for this event only */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
function useDecisions(): Decisions {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "{}");
  return useMemo(() => {
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === "object" ? (v as Decisions) : {};
    } catch {
      return {};
    }
  }, [raw]);
}

export function TriageView() {
  const { data, error, loading, reload } = useApi("triage:30", () => api.triage(30));
  if (loading) return <Card><LoadingBlock rows={6} label="Building the triage inbox" /></Card>;
  if (error || !data) return <ErrorBlock message={errorMessage(error)} onRetry={reload} />;
  return <Inbox items={data.items} counts={data.counts_by_defect} lookback={data.lookback_days} />;
}

function Inbox({ items, counts, lookback }: { items: TriageItem[]; counts: Record<TriageCode, number>; lookback: number }) {
  const decisions = useDecisions();
  const [defect, setDefect] = useState<TriageCode | null>(null);
  const [action, setAction] = useState<SuggestedAction | null>(null);
  const [view, setView] = useState<"pending" | "decided">("pending");
  const [cursor, setCursor] = useState(0);
  const [overriding, setOverriding] = useState<string | null>(null);
  const [auditHint, setAuditHint] = useState<AuditHint>(null);

  const rows = useMemo(
    () =>
      items.filter(
        (i) =>
          (!defect || i.defect.code === defect) &&
          (!action || i.suggested_action === action) &&
          (view === "decided" ? !!decisions[i.test_id] : !decisions[i.test_id]),
      ),
    [items, defect, action, view, decisions],
  );
  const selected = Math.min(cursor, Math.max(rows.length - 1, 0));
  const decidedCount = items.filter((i) => decisions[i.test_id]).length;

  const accept = (item: TriageItem) => {
    const d: Decision = { status: "accepted", action: item.suggested_action, decided_at: new Date().toISOString() };
    writeDecisions({ ...decisions, [item.test_id]: d });
    sendToAudit(item, d, setAuditHint);
  };
  const override = (item: TriageItem, next: SuggestedAction, note: string) => {
    const d: Decision = { status: "overridden", action: next, note: note.trim() || undefined, decided_at: new Date().toISOString() };
    writeDecisions({ ...decisions, [item.test_id]: d });
    setOverriding(null);
    sendToAudit(item, d, setAuditHint);
  };
  const undo = (item: TriageItem) => {
    const next = { ...decisions };
    delete next[item.test_id];
    writeDecisions(next);
  };

  const exportJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      lookback_days: lookback,
      decisions: items
        .filter((i) => decisions[i.test_id])
        .map((i) => ({ test_id: i.test_id, suggested_action: i.suggested_action, ...decisions[i.test_id] })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `triage-decisions-${payload.exported_at.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // j/k move, a accepts, o opens override; ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const row = rows[selected];
      if (e.key === "j") setCursor(Math.min(selected + 1, rows.length - 1));
      else if (e.key === "k") setCursor(Math.max(selected - 1, 0));
      else if (e.key === "a" && row && view === "pending") accept(row);
      else if (e.key === "o" && row) setOverriding(row.test_id);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-4">
      <p className="rounded-[4px] border border-accent/40 bg-accent/[0.06] px-4 py-2.5 text-[13px] text-ink">
        Decisions stay in your browser and are copied to the <Link href="/audit" className="text-accent underline-offset-2 hover:underline">audit log</Link>.
        The agent never writes to CI; R4 quarantine is a human decision.
      </p>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by defect type">
        <FilterChip active={!defect} onClick={() => setDefect(null)}>
          All defects <span className="text-faint">{items.length}</span>
        </FilterChip>
        {DEFECTS.map((d) => (
          <FilterChip key={d} active={defect === d} onClick={() => setDefect(defect === d ? null : d)}>
            <TriagePill code={d} label={DEFECT_LABEL[d]} />
            <span className="text-faint">{counts[d] ?? 0}</span>
          </FilterChip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by suggested action">
        <FilterChip active={!action} onClick={() => setAction(null)}>
          Any action
        </FilterChip>
        {(Object.keys(ACTIONS) as SuggestedAction[]).map((a) => (
          <FilterChip key={a} active={action === a} onClick={() => setAction(action === a ? null : a)}>
            {ACTIONS[a]}
          </FilterChip>
        ))}
      </div>

      <Card aria-labelledby="inbox-title">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h2 id="inbox-title" className="font-serif text-[1.15rem] text-ink">
            Triage inbox · last {lookback} days
          </h2>
          <div role="radiogroup" aria-label="Decision status" className="inline-flex rounded-[3px] border border-line p-0.5">
            {(["pending", "decided"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => {
                  setView(v);
                  setCursor(0);
                }}
                className={cx("rounded-[2px] px-2.5 py-1 font-mono text-[11px] capitalize", view === v ? "bg-accent/15 text-accent" : "text-muted hover:text-ink")}
              >
                {v} {v === "pending" ? items.length - decidedCount : decidedCount}
              </button>
            ))}
          </div>
          <span className="hidden font-mono text-[10.5px] text-faint md:inline">j/k move · a accept · o override</span>
          {auditHint && (
            <span role="status" className={cx("font-mono text-[10.5px]", auditHint === "recorded" ? "text-ship" : "text-faint")}>
              {auditHint === "recorded" ? "recorded in audit log" : "audit unavailable · saved locally"}
            </span>
          )}
          <button type="button" onClick={exportJson} disabled={decidedCount === 0} className={cx(buttonClass("secondary", "sm"), "ml-auto")}>
            Export decisions (JSON)
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted">
            {view === "pending" ? "Nothing pending for these filters. Clear a filter or switch to Decided." : "No decisions yet. Accept or override items in Pending."}
          </p>
        ) : (
          <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Triage inbox, scrollable">
            <table className="w-full min-w-[980px] text-[13px]" aria-labelledby="inbox-title">
              <thead className="label-mono border-b border-line bg-sunken/50 text-left text-[10px] text-faint">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">Test</th>
                  <th scope="col" className="px-3 py-2 font-medium">Service</th>
                  <th scope="col" className="px-3 py-2 font-medium">Flake level</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Failures</th>
                  <th scope="col" className="px-3 py-2 font-medium">Last failure</th>
                  <th scope="col" className="px-3 py-2 font-medium">Defect</th>
                  <th scope="col" className="px-3 py-2 font-medium">Suggested</th>
                  <th scope="col" className="px-3 py-2 font-medium">Rationale</th>
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                {rows.map((item, i) => {
                  const d = decisions[item.test_id];
                  const isSel = i === selected;
                  return (
                    <Row
                      key={item.test_id}
                      item={item}
                      decision={d}
                      selected={isSel}
                      overriding={overriding === item.test_id}
                      onSelect={() => setCursor(i)}
                      onAccept={() => accept(item)}
                      onOverride={() => setOverriding(item.test_id)}
                      onCancelOverride={() => setOverriding(null)}
                      onSaveOverride={(a, note) => override(item, a, note)}
                      onUndo={() => undo(item)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 font-mono text-[11.5px] transition-colors",
        active ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Row({
  item,
  decision,
  selected,
  overriding,
  onSelect,
  onAccept,
  onOverride,
  onCancelOverride,
  onSaveOverride,
  onUndo,
}: {
  item: TriageItem;
  decision: Decision | undefined;
  selected: boolean;
  overriding: boolean;
  onSelect: () => void;
  onAccept: () => void;
  onOverride: () => void;
  onCancelOverride: () => void;
  onSaveOverride: (a: SuggestedAction, note: string) => void;
  onUndo: () => void;
}) {
  return (
    <>
      <tr onClick={onSelect} aria-current={selected || undefined} className={cx("transition-colors", selected ? "bg-accent/[0.06] shadow-[inset_2px_0_0_var(--accent)]" : "hover:bg-sunken/50")}>
        <td className="px-4 py-2.5 sm:px-5">
          <EvidenceChip id={item.test_id} />
          <div className="mt-1 max-w-[13rem] truncate text-[11.5px] text-muted" title={item.name}>
            {item.name}
          </div>
        </td>
        <td className="px-3 py-2.5 font-mono text-[11.5px] text-muted">{item.service_id}</td>
        <td className="px-3 py-2.5 font-mono text-[11.5px] text-ink">{item.flake_level ?? "—"}</td>
        <td className="tabular px-3 py-2.5 text-right">{item.failures}</td>
        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-muted">{item.last_failure_utc?.replace("T", " ").slice(0, 16) ?? "—"}</td>
        <td className="whitespace-nowrap px-3 py-2.5">
          <TriagePill code={item.defect.code} label={item.defect.label} />
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-ink">{ACTIONS[item.suggested_action]}</td>
        <td className="max-w-[18rem] px-3 py-2.5 text-[12px] text-muted">
          <span className="line-clamp-2" title={item.rationale}>
            {item.rationale}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 sm:px-5">
          {decision ? (
            <span className="flex items-center gap-2">
              <span className={cx("font-mono text-[11px]", decision.status === "accepted" ? "text-ship" : "text-accent")}>
                {decision.status === "accepted" ? "Accepted" : `Overridden → ${ACTIONS[decision.action]}`}
              </span>
              <button type="button" onClick={onUndo} className="font-mono text-[11px] text-faint underline-offset-2 hover:text-ink hover:underline">
                undo
              </button>
            </span>
          ) : (
            <span className="flex gap-1.5">
              <button type="button" onClick={onAccept} className={buttonClass("primary", "sm")} aria-label={`Accept ${ACTIONS[item.suggested_action]} for ${item.test_id}`}>
                Accept
              </button>
              <button type="button" onClick={onOverride} className={buttonClass("secondary", "sm")} aria-label={`Override suggestion for ${item.test_id}`}>
                Override…
              </button>
            </span>
          )}
        </td>
      </tr>
      {overriding && <OverrideRow item={item} onCancel={onCancelOverride} onSave={onSaveOverride} />}
    </>
  );
}

function OverrideRow({ item, onCancel, onSave }: { item: TriageItem; onCancel: () => void; onSave: (a: SuggestedAction, note: string) => void }) {
  const options = (Object.keys(ACTIONS) as SuggestedAction[]).filter((a) => a !== item.suggested_action);
  const [next, setNext] = useState<SuggestedAction>(options[0] ?? "investigate");
  const [note, setNote] = useState("");
  return (
    <tr className="bg-sunken/60">
      <td colSpan={9} className="px-4 py-3 sm:px-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(next, note);
          }}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
        >
          <label className="block">
            <span className="label-mono mb-1 block text-[10px] text-faint">Override {item.test_id} to</span>
            <select
              autoFocus
              value={next}
              onChange={(e) => setNext(e.target.value as SuggestedAction)}
              className="rounded-[3px] border border-line-strong bg-canvas px-2 py-1.5 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
            >
              {options.map((a) => (
                <option key={a} value={a}>
                  {ACTIONS[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[14rem] flex-1">
            <span className="label-mono mb-1 block text-[10px] text-faint">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Why the suggestion is wrong"
              className="block w-full rounded-[3px] border border-line-strong bg-canvas px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
          </label>
          <button type="submit" className={buttonClass("primary", "sm")}>
            Save override
          </button>
          <button type="button" onClick={onCancel} className={buttonClass("ghost", "sm")}>
            Cancel
          </button>
          {item.evidence.length > 0 && (
            <span className="flex w-full flex-wrap gap-1 pt-1">
              {item.evidence.slice(0, 6).map((id) => (
                <EvidenceChip key={id} id={id} />
              ))}
            </span>
          )}
        </form>
      </td>
    </tr>
  );
}
