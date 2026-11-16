"use client";

import Link from "next/link";
import { type ReactNode, useEffect } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Integration, IntegrationStatus, Integrations } from "@/lib/types";
import { invalidate, useApi } from "@/lib/useApi";
import { Card, CardHeader, cx, ErrorBlock, Field, LoadingBlock, Pill, type Tone } from "../ui";

// Read-only view of runtime state from /api/integrations. No toggles: nothing here is configurable in the sandbox,
// and the API returns names, booleans and counts only, never credentials.

const STATUS: Record<IntegrationStatus, { label: string; tone: Tone }> = {
  connected: { label: "Connected", tone: "green" },
  available: { label: "Available", tone: "blue" },
  example: { label: "Example", tone: "violet" },
  documented: { label: "Documented", tone: "neutral" },
  not_connected: { label: "Not connected", tone: "neutral" },
  planned: { label: "Planned", tone: "amber" },
};

const fmt = (n: number) => n.toLocaleString("en-US");

export function SettingsView() {
  const { data, error, loading, reload } = useApi("integrations", () => api.integrations());
  // Counts change (audit entries, connectors); drop the cached copy so the next visit refetches.
  useEffect(() => () => invalidate("integrations"), []);
  if (loading) return <Card><LoadingBlock rows={6} label="Loading settings" /></Card>;
  if (error || !data) return <ErrorBlock message={errorMessage(error)} onRetry={reload} />;
  return <Settings data={data} />;
}

function Settings({ data }: { data: Integrations }) {
  return (
    <div className="space-y-5">
      <div role="note" className="flex flex-wrap items-start gap-3 rounded-[4px] border border-accent/40 bg-accent/[0.07] px-4 py-3 text-[13px] text-ink">
        <span className="label-mono shrink-0 text-[10.5px] text-accent">Sandbox</span>
        <p className="min-w-0 flex-1 text-muted">
          Not configurable here. Model keys, data source and limits are environment variables on the API server; changing them is a deploy, not a
          click. Statuses below come from the running API.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <WorkspaceCard data={data} />
        <DataCard data={data} />
      </div>

      <ModelCard data={data} />

      <Card aria-labelledby="integrations-title">
        <CardHeader id="integrations-title" title="Integrations" eyebrow={`${data.integrations.length} surfaces · status from runtime checks`}>
          Write-back targets stay disconnected on purpose: the agent is read-only and humans act on its findings.
        </CardHeader>
        <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
          {data.integrations.map((i) => (
            <IntegrationCard key={i.id} i={i} />
          ))}
        </ul>
      </Card>

      <GovernanceCard data={data} />
    </div>
  );
}

function WorkspaceCard({ data }: { data: Integrations }) {
  return (
    <Card aria-labelledby="workspace-title">
      <CardHeader id="workspace-title" title="Workspace" eyebrow="Tenant" />
      <dl className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-3 sm:p-5">
        <Field label="Name">{data.workspace.name}</Field>
        <Field label="Environment">
          {data.workspace.sandbox ? <Pill tone="amber" mono>sandbox · synthetic data</Pill> : <Pill tone="green" mono>production</Pill>}
        </Field>
        <Field label="Region">
          <span className="text-muted">{data.workspace.region ?? "n/a in the sandbox"}</span>
        </Field>
      </dl>
    </Card>
  );
}

function DataCard({ data }: { data: Integrations }) {
  const d = data.data_source;
  return (
    <Card aria-labelledby="data-title">
      <CardHeader id="data-title" title="Data source" eyebrow="Where the release dataset is read from" />
      {d.status === "ok" ? (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 p-4 sm:grid-cols-4 sm:p-5">
          <Field label="Source">
            <span className="font-mono text-[12.5px]">{d.source === "db" ? "PostgreSQL (read-only role)" : d.source}</span>
          </Field>
          <Field label="Raw events">{fmt(d.raw_events)}</Field>
          <Field label="Runs · attempts">
            {fmt(d.runs)} · {fmt(d.attempts)}
          </Field>
          <Field label="Tests">{fmt(d.tests)}</Field>
        </dl>
      ) : (
        <p className="p-4 text-[13px] text-block sm:p-5">Data source unavailable: the API cannot load the dataset right now.</p>
      )}
    </Card>
  );
}

function ModelCard({ data }: { data: Integrations }) {
  const m = data.models;
  return (
    <Card aria-labelledby="models-title">
      <CardHeader
        id="models-title"
        title="Model chain"
        eyebrow={m.configured ? "Tried in order until one answers" : "No model credentials configured"}
      >
        A failed or rate-limited model falls through to the next one. The offline deterministic planner is always last, so a question is never left
        without an answer; the tools, rules and validator are the same in every mode.
      </CardHeader>
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ol className="space-y-2" aria-label="Fallback order">
          {m.chain.map((c) => (
            <li key={`${c.position}:${c.model}`} className="flex items-center gap-3 rounded-[3px] border border-line bg-canvas px-3 py-2">
              <span className="font-mono text-[11px] text-accent">{String(c.position).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[12.5px] text-ink">{c.model}</span>
                <span className="font-mono text-[10.5px] text-faint">
                  {c.provider} · {c.role}
                </span>
              </span>
              <Pill tone={c.configured ? "green" : "neutral"} mono>
                {c.configured ? "configured" : "not configured"}
              </Pill>
            </li>
          ))}
        </ol>
        <div>
          <div className="label-mono mb-1.5 text-[10.5px] text-faint">Providers</div>
          <ul className="space-y-1.5 text-[12.5px]">
            {m.providers.map((p) => (
              <li key={p.provider} className="flex items-center justify-between gap-2">
                <span className="font-mono text-ink">{p.provider}</span>
                <Pill tone={p.configured ? "green" : "neutral"} mono>
                  {p.configured ? "credential set" : "not set"}
                </Pill>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-muted">
            {m.primary_override ? "Groq is set as primary (LLM_PRIMARY=groq)." : "Default order: Gemini models first, then Groq if set."} Keys live in
            server environment variables and are never sent to the browser.
          </p>
        </div>
      </div>
    </Card>
  );
}

function IntegrationCard({ i }: { i: Integration }) {
  const s = STATUS[i.status];
  const body: ReactNode = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-[13.5px] font-medium text-ink">{i.name}</span>
          <span className="label-mono text-[10px] text-faint">{i.category}</span>
        </span>
        <Pill tone={s.tone} mono className="shrink-0">
          {s.label}
        </Pill>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{i.detail}</p>
    </>
  );
  return (
    <li className="min-w-0">
      {i.href ? (
        <Link
          href={i.href}
          className="block h-full rounded-[4px] border border-line bg-canvas p-3.5 transition-colors hover:border-line-strong hover:bg-sunken/50"
        >
          {body}
        </Link>
      ) : (
        <div className="h-full rounded-[4px] border border-line bg-canvas p-3.5">{body}</div>
      )}
    </li>
  );
}

function GovernanceCard({ data }: { data: Integrations }) {
  const g = data.governance;
  const rows: { label: string; value: ReactNode; href: string; link: string }[] = [
    {
      label: "Agent access",
      value: g.agent_read_only ? <Pill tone="green" mono>read-only</Pill> : <Pill tone="red" mono>read-write</Pill>,
      href: "/architecture",
      link: "How it is enforced",
    },
    { label: "Rules version", value: <span className="font-mono">v{data.rules.version}</span>, href: "/rules", link: "Rules & policy" },
    {
      label: "Audit log",
      value: (
        <span>
          {fmt(g.audit_entries)} entries <span className="text-faint">· {g.audit_storage === "in_memory" ? "in memory" : g.audit_storage}</span>
        </span>
      ),
      href: "/audit",
      link: "Open audit log",
    },
    {
      label: "Workspace kill switch",
      value: g.kill_switch ? <Pill tone="red" mono>on · pushes rejected</Pill> : <Pill tone="neutral" mono>off</Pill>,
      href: "/fleet",
      link: "Agent fleet",
    },
  ];
  return (
    <Card aria-labelledby="governance-title">
      <CardHeader id="governance-title" title="Governance" eyebrow="Controls that do not depend on the model" />
      <dl className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
            <dt className="label-mono w-44 shrink-0 text-[10.5px] text-faint">{r.label}</dt>
            <dd className="min-w-0 flex-1 text-[13px] text-ink">{r.value}</dd>
            <Link href={r.href} className={cx("font-mono text-[11px] text-accent underline-offset-2 hover:underline")}>
              {r.link} →
            </Link>
          </div>
        ))}
      </dl>
    </Card>
  );
}
