"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Connector, ConnectorStatus, FleetSnapshot, VersionState } from "@/lib/types";
import { CopyButton } from "./DevView";
import { buttonClass, Card, CardHeader, cx, ErrorBlock, LoadingBlock, Pill, StatTile, type Tone } from "../ui";

// Control plane for outbound-only connectors. Polls every 15 s while the tab is visible and keeps the last
// snapshot on screen during a refresh, so the table never flashes back to a skeleton.

const POLL_MS = 15_000;
const API_HOST = "https://testops.dangtrinh.dev";
const CLI = "python services/agent-api/scripts/testops_connector.py";

const STATUS: Record<ConnectorStatus, { label: string; dot: string; text: string }> = {
  connected: { label: "Connected", dot: "bg-ship", text: "text-ship" },
  stale: { label: "Stale", dot: "bg-accent", text: "text-accent" },
  lost: { label: "Lost", dot: "bg-block", text: "text-block" },
};

const VERSION: Record<VersionState, { label: string; tone: Tone }> = {
  current: { label: "current", tone: "green" },
  behind: { label: "behind", tone: "amber" },
  unsupported: { label: "unsupported", tone: "red" },
};

function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

const fmt = (n: number) => n.toLocaleString("en-US");

function useFleet() {
  const [state, setState] = useState<{ data?: FleetSnapshot; error?: Error }>({});
  const inflight = useRef(false);
  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const data = await api.fleet();
      setState({ data });
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e : new Error(String(e)) }));
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  return { ...state, reload: load };
}

export function FleetView() {
  const { data, error, reload } = useFleet();
  const [actionError, setActionError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(errorMessage(e));
    }
    await reload();
  };

  if (!data && error) return <ErrorBlock message={errorMessage(error)} onRetry={reload} />;
  if (!data) return <Card><LoadingBlock rows={6} label="Loading fleet" /></Card>;

  const by = (s: ConnectorStatus) => data.connectors.filter((c) => c.status === s).length;
  const drift = data.connectors.filter((c) => c.version_state !== "current").length;
  const unsupported = data.connectors.filter((c) => c.version_state === "unsupported").length;
  const events = data.connectors.reduce((n, c) => n + c.events_ingested_24h, 0);
  const kill = data.workspace.kill_switch;

  return (
    <div className="space-y-5">
      <div role="note" className="flex flex-wrap items-start gap-3 rounded-[4px] border border-accent/40 bg-accent/[0.07] px-4 py-3 text-[13px] text-ink">
        <span className="label-mono shrink-0 text-[10.5px] text-accent">Sandbox</span>
        <p className="min-w-0 flex-1 text-muted">
          Sandbox simulation — connectors below are simulated for the fictional Kestrel Commerce workspace; enrol a real one with the CLI to see it appear.
        </p>
      </div>

      {(actionError || error) && (
        <div role="alert" className="rounded-[4px] border border-block/40 bg-block/[0.07] px-4 py-2.5 text-[13px] text-muted">
          <span className="label-mono mr-2 text-[10.5px] text-block">{actionError ? "Action failed" : "Refresh failed"}</span>
          {actionError ?? errorMessage(error)} {!actionError && "Showing the last snapshot."}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Connected" value={by("connected")} sub={`heartbeat < ${data.policy.stale_after_s}s`} valueClass={by("connected") ? "text-ship" : undefined} />
        <StatTile label="Stale" value={by("stale")} sub={`< ${data.policy.lost_after_s / 60} min`} valueClass={by("stale") ? "text-accent" : undefined} />
        <StatTile label="Lost" value={by("lost")} sub={`≥ ${data.policy.lost_after_s / 60} min silent`} valueClass={by("lost") ? "text-block" : undefined} />
        <StatTile label="Version drift" value={drift} sub={`${unsupported} unsupported · target ${data.target_version}`} valueClass={drift ? "text-accent" : undefined} />
        <StatTile label="Events 24h" value={fmt(events)} sub="test outcomes ingested" />
        <StatTile
          label="Kill switch"
          value={kill ? "On" : "Off"}
          sub={kill ? "all pushes rejected (423)" : "pushes accepted"}
          valueClass={kill ? "text-block" : undefined}
        />
      </div>

      <Card aria-labelledby="connectors-title">
        <CardHeader
          id="connectors-title"
          title="Connectors"
          eyebrow={`${data.workspace.name} · ${data.connectors.length} enrolled · as of ${data.as_of_utc.slice(11, 19)} UTC`}
          actions={
            <>
              <ConfirmButton
                label={kill ? "Turn kill switch off" : "Workspace kill switch"}
                confirmLabel={kill ? "Confirm: accept pushes" : "Confirm: reject all pushes"}
                ariaLabel={kill ? "Turn the workspace kill switch off" : "Turn the workspace kill switch on"}
                danger={!kill}
                onConfirm={() => act(() => api.setKillSwitch(!kill))}
              />
              <button type="button" onClick={() => void reload()} className={buttonClass("ghost")} aria-label="Refresh fleet now">
                Refresh
              </button>
            </>
          }
        >
          Status from heartbeat age (every {data.policy.heartbeat_s}s). Pausing a connector rejects its pushes; it keeps heartbeating so it can be resumed.
        </CardHeader>
        <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Connectors, scrollable">
          <table className="w-full min-w-[840px] text-[13px]" aria-labelledby="connectors-title">
            <thead className="label-mono border-b border-line bg-sunken/50 text-left text-[10px] text-faint">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium sm:px-5">Connector</th>
                <th scope="col" className="px-3 py-2 font-medium">Adapters</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Version</th>
                <th scope="col" className="hidden px-3 py-2 font-medium 2xl:table-cell">Host</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Events 24h</th>
                <th scope="col" className="px-3 py-2 font-medium">Pushes</th>
                <th scope="col" className="px-4 py-2 font-medium sm:px-5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-middle">
              {data.connectors.map((c) => (
                <ConnectorRow key={c.id} c={c} onToggle={() => act(() => api.setConnectorPaused(c.id, !c.paused))} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <PolicyCard data={data} />
        <InstallCard />
      </div>

      <AuditCard data={data} />
    </div>
  );
}

function ConnectorRow({ c, onToggle }: { c: Connector; onToggle: () => Promise<void> }) {
  const s = STATUS[c.status];
  const v = VERSION[c.version_state];
  return (
    <tr>
      <td className="px-4 py-2.5 sm:px-5">
        <div className="whitespace-nowrap font-mono text-[12.5px] text-ink">{c.name}</div>
        <div className="mt-1 flex items-center gap-2 whitespace-nowrap font-mono text-[10.5px] text-faint" title={c.host}>
          {c.id}
          {c.sandbox ? <Pill tone="violet" mono>simulated</Pill> : <Pill tone="green" mono>enrolled</Pill>}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className="flex flex-wrap gap-1">
          {c.adapters.map((a) => (
            <Pill key={a} mono>{a}</Pill>
          ))}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className={cx("inline-flex items-center gap-1.5 font-medium", s.text)}>
          <span aria-hidden className={cx("size-1.5 rounded-full", s.dot)} />
          {s.label}
        </span>
        <div className="mt-0.5 font-mono text-[10.5px] text-faint" title={c.last_heartbeat_utc}>
          {ago(c.heartbeat_age_s)}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className="font-mono text-[12px] text-ink">{c.version}</span> <Pill tone={v.tone} mono>{v.label}</Pill>
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-muted 2xl:table-cell">{c.host}</td>
      <td className="tabular px-3 py-2.5 text-right font-mono text-[12px] text-ink">{fmt(c.events_ingested_24h)}</td>
      <td className="whitespace-nowrap px-3 py-2.5">
        {c.paused ? <Pill tone="red" mono>paused</Pill> : <span className="text-[12px] text-muted">active</span>}
      </td>
      <td className="px-4 py-2.5 text-right sm:px-5">
        <ConfirmButton
          label={c.paused ? "Resume" : "Pause"}
          confirmLabel="Confirm"
          ariaLabel={`${c.paused ? "Resume" : "Pause"} connector ${c.name}`}
          danger={!c.paused}
          onConfirm={onToggle}
        />
      </td>
    </tr>
  );
}

// Two-step inline confirm instead of window.confirm(): first click arms, second click acts, it disarms after 4 s or on blur.
function ConfirmButton({
  label,
  confirmLabel,
  ariaLabel,
  danger,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  ariaLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const click = async () => {
    window.clearTimeout(timer.current);
    if (!armed) {
      setArmed(true);
      timer.current = window.setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void click()}
      onBlur={() => setArmed(false)}
      disabled={busy}
      aria-label={armed ? `${ariaLabel}: press again to confirm` : ariaLabel}
      className={cx(
        buttonClass("secondary"),
        "min-w-[5.5rem] justify-center whitespace-nowrap",
        armed && (danger ? "border-block/60 bg-block/10 text-block hover:bg-block/15" : "border-accent/60 bg-accent/10 text-accent hover:bg-accent/15"),
      )}
    >
      {busy ? "Working…" : armed ? confirmLabel : label}
    </button>
  );
}

function PolicyCard({ data }: { data: FleetSnapshot }) {
  const p = data.policy;
  return (
    <Card aria-labelledby="policy-title">
      <CardHeader id="policy-title" title="Connector policy" eyebrow="Pulled by every connector on heartbeat">
        Connectors cannot change it; they apply it locally before anything leaves the network.
      </CardHeader>
      <dl className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2 sm:p-5">
        <PolicyField label="Scope">
          <span className="text-ink">{p.read_only ? "Read-only" : "Read-write"}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {p.scopes.map((s) => (
              <Pill key={s} tone="green" mono>{s}</Pill>
            ))}
          </span>
        </PolicyField>
        <PolicyField label="Enabled adapters">
          <span className="flex flex-wrap gap-1">
            {p.adapters.map((a) => (
              <Pill key={a} mono>{a}</Pill>
            ))}
          </span>
        </PolicyField>
        <PolicyField label="Egress allowlist (HTTPS 443)">
          <ul className="space-y-0.5 font-mono text-[12px] text-ink">
            {p.egress_allowlist.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </PolicyField>
        <PolicyField label="Heartbeat">
          <span className="font-mono text-[12px] text-ink">
            every {p.heartbeat_s}s · stale ≥ {p.stale_after_s}s · lost ≥ {p.lost_after_s}s
          </span>
          <span className="mt-1 block text-[12px] text-muted">
            Versions: target {data.target_version}, oldest supported {data.min_supported_version}. Max {p.max_batch} events per push.
          </span>
        </PolicyField>
        <div className="sm:col-span-2">
          <dt className="label-mono text-[10.5px] text-faint">Local redaction</dt>
          <dd className="mt-1.5">
            <ul className="space-y-1 text-[12.5px] text-muted">
              {p.redaction.map((r) => (
                <li key={r.rule} className="flex gap-2">
                  <span className="w-32 shrink-0 font-mono text-[11.5px] text-ink">{r.rule}</span>
                  <span className="min-w-0">{r.detail}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function PolicyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label-mono text-[10.5px] text-faint">{label}</dt>
      <dd className="mt-1.5 text-[13px]">{children}</dd>
    </div>
  );
}

function InstallCard() {
  const steps: [string, string][] = [
    ["1 · Enrol (one-time code → connector credential, saved with mode 0600)",
      `${CLI} enrol --api ${API_HOST} \\\n  --code enroll-demo-not-secret --name acme-ci-1 --adapter junit-xml`],
    ["2 · Push a JUnit report after each CI run (--dry-run prints the events instead)",
      `${CLI} push --junit build/test-results/junit.xml \\\n  --run-id "$CI_RUN_ID" --service checkout-web`],
    ["3 · Keep it alive (heartbeat and policy pull)", `${CLI} run --interval 30`],
  ];
  return (
    <Card aria-labelledby="install-title">
      <CardHeader id="install-title" title="Install a connector" eyebrow="Python 3.9+, standard library only">
        The sandbox code <code className="font-mono text-[12px] text-ink">enroll-demo-not-secret</code> is public; a real workspace issues a one-time code per install.
      </CardHeader>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[3px] border border-line bg-canvas px-3 py-2 font-mono text-[11.5px] text-muted">
          <span className="text-ink">customer VPC</span>
          <span aria-hidden className="text-accent">→</span>
          <span>outbound HTTPS 443</span>
          <span aria-hidden className="text-accent">→</span>
          <span className="text-ink">ingest API</span>
          <span className="w-full text-[11px] text-faint">No inbound ports. Credentials to the customer&apos;s CI never leave the network; only test outcomes do.</span>
        </div>
        {steps.map(([label, code]) => (
          <div key={label}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="label-mono text-[10px] text-faint">{label}</span>
              <CopyButton text={code.replace(/ \\\n {2}/g, " ")} label="Copy" />
            </div>
            <pre className="overflow-x-auto whitespace-pre rounded-[3px] border border-line bg-canvas px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink">{code}</pre>
          </div>
        ))}
        <p className="text-[12px] text-muted">
          Exit codes: 0 ok, 3 error, 4 paused by the control plane (HTTP 423, the connector stops pushing). Retries 429 and 5xx with backoff.
        </p>
      </div>
    </Card>
  );
}

function AuditCard({ data }: { data: FleetSnapshot }) {
  return (
    <Card aria-labelledby="audit-title">
      <CardHeader id="audit-title" title="Audit log" eyebrow="Every control-plane action · newest first">
        Operator actions are human only: the agent and the MCP server have no tool that pauses, resumes or flips the kill switch.
      </CardHeader>
      <ol className="max-h-[26rem] divide-y divide-line overflow-y-auto" aria-label="Audit entries">
        {data.audit.map((a, i) => (
          <li key={`${a.ts}:${a.action}:${a.target}:${i}`} className="grid gap-x-4 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[10.5rem_11rem_minmax(0,1fr)] sm:px-5">
            <span className="font-mono text-[11px] text-faint">{a.ts.replace("T", " ").replace("Z", " UTC")}</span>
            <span className="font-mono text-[11.5px] text-accent">{a.action}</span>
            <span className="min-w-0 text-[12.5px] text-muted">
              <span className="text-ink">{a.target}</span> · {a.detail} <span className="text-faint">— {a.actor}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
