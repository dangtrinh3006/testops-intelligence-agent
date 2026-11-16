// "What's new" entries, newest first. Append new releases at the top; `refs` are short git shas.

export type ChangeTag = "New" | "Improved" | "Fixed";

export interface ChangeItem {
  tag: ChangeTag;
  title: string;
  body: string;
  href?: string;
  refs?: string[];
}

export interface Release {
  date: string; // ISO date, UTC
  title: string;
  items: ChangeItem[];
}

export const CHANGELOG: Release[] = [
  {
    date: "2026-11-17",
    title: "Shift-left for every role",
    items: [
      {
        tag: "New",
        title: "Developer workspace",
        body: "See whether a failing run is caused by your commit, a flaky test or the platform, preview the PR check, and copy the CLI or GitHub Action snippet.",
        href: "/dev",
      },
      {
        tag: "New",
        title: "Triage inbox",
        body: "Work through failed attempts grouped by defect type. Accept or override each suggestion with the keyboard; decisions stay in your browser.",
        href: "/triage",
      },
      {
        tag: "New",
        title: "CLI gate and MCP server",
        body: "Fail a pipeline on the release gate with scripts/testops_gate.py, or ask the same read-only tools from your IDE through the MCP server.",
        href: "/docs#developer",
      },
      {
        tag: "New",
        title: "User docs and onboarding",
        body: "Role quickstarts, a glossary of verdicts and defect types, keyboard shortcuts, and a Get started checklist on the Overview.",
        href: "/docs",
      },
      {
        tag: "Improved",
        title: "Product shell and command palette",
        body: "Grouped sidebar, sandbox workspace indicator, Release overview with live KPIs, and Ctrl/⌘+K search across runs, tests and releases.",
        href: "/",
        refs: ["c2fe5aa", "03704af"],
      },
      {
        tag: "New",
        title: "Container and GitOps deployment path",
        body: "Dockerfiles for the API and the web app, docker-compose, an image build-scan-push workflow, and kustomize overlays with an ArgoCD application.",
        refs: ["c2fe5aa"],
      },
    ],
  },
  {
    date: "2026-11-16",
    title: "See the agent work",
    items: [
      {
        tag: "New",
        title: "Trace waterfall",
        body: "Every agent run can be viewed as timed spans — model calls, tools, compose and validate — measured from the live stream.",
        href: "/",
        refs: ["fcc529f"],
      },
      {
        tag: "New",
        title: "Test history",
        body: "A test-by-run matrix per service, rebuilt from raw attempts, with the gate verdict above each run. Click any cell to open its evidence.",
        href: "/history",
        refs: ["fcc529f"],
      },
      {
        tag: "New",
        title: "Request lifecycle",
        body: "An interactive walkthrough of one request through the system, including how each step degrades when a model or tool fails.",
        href: "/architecture",
        refs: ["fcc529f"],
      },
      {
        tag: "New",
        title: "Model fallback chain",
        body: "Live answers try the primary model, a fallback model and a second provider before the offline planner. Each answer says which one replied.",
        refs: ["1705f14"],
      },
      {
        tag: "Improved",
        title: "Honest agent reliability numbers",
        body: "Eval runs answered by the offline fallback no longer count as model passes; reports show who answered each run.",
        href: "/evals",
        refs: ["1705f14"],
      },
      {
        tag: "New",
        title: "Defect types and flake transparency",
        body: "Every failed attempt carries a defect type (Product Bug, Automation Bug, System Issue, To Investigate). Flaky tests show flip rate and a low-sample flag.",
        href: "/rules",
        refs: ["dc8e9ba"],
      },
      {
        tag: "Improved",
        title: "Agent reliability as pass^k",
        body: "The evals page reports the share of cases that pass on every repeated run, next to the per-run pass rate.",
        href: "/evals",
        refs: ["dc8e9ba"],
      },
      {
        tag: "New",
        title: "Live agent run",
        body: "Answers stream in node by node, so you can watch the agent plan, call tools, draft and validate.",
        refs: ["47eff19", "dea43e6"],
      },
      {
        tag: "New",
        title: "Architecture and pilot pages",
        body: "How the system is built and what changes for production, plus a four-week pilot plan with an ROI calculator.",
        href: "/architecture",
        refs: ["dea43e6"],
      },
      {
        tag: "Improved",
        title: "Evals measure stability",
        body: "Each eval case can run several times and is reported as stable, flaky or failing, the same way tests are.",
        href: "/evals",
        refs: ["094b9cf"],
      },
      {
        tag: "Fixed",
        title: "Fewer false validator flags",
        body: "The answer validator now ignores quoted text and reported speech when it checks that verdicts match the policy.",
        refs: ["094b9cf"],
      },
      {
        tag: "New",
        title: "Release console",
        body: "Ask questions about runs and releases, inspect every cited record, and see the policy verdict separately from the model's explanation.",
        href: "/",
        refs: ["29729c4"],
      },
      {
        tag: "New",
        title: "Agent eval harness",
        body: "Golden, adversarial and robustness cases check verdicts, cited evidence, tool use and forbidden claims on every change.",
        href: "/evals",
        refs: ["ad608d8"],
      },
      {
        tag: "New",
        title: "Evidence-first core",
        body: "CI events from three sources are normalised with provenance; a versioned rule file decides gate verdicts and flake levels.",
        href: "/rules",
        refs: ["01586a7", "41dc905"],
      },
    ],
  },
];

export const LATEST_RELEASE_DATE = CHANGELOG[0]?.date ?? "";
