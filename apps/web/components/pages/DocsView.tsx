import Link from "next/link";
import type { ReactNode } from "react";
import { ShowOnboardingAgain } from "../OnboardingChecklist";
import { cx } from "../ui";

// User-level docs. Facts here mirror knowledge/testops_rules.yaml and the API; keep them in step when either changes.

const TOC: { id: string; label: string; sub?: { id: string; label: string }[] }[] = [
  { id: "getting-started", label: "Getting started" },
  {
    id: "quickstarts",
    label: "Quickstarts by role",
    sub: [
      { id: "release-manager", label: "Release manager" },
      { id: "qe", label: "Quality engineer" },
      { id: "developer", label: "Developer" },
      { id: "leader", label: "Engineering leader" },
      { id: "platform", label: "Platform / FDE" },
    ],
  },
  {
    id: "concepts",
    label: "Concepts",
    sub: [
      { id: "verdicts", label: "Gate verdicts" },
      { id: "rules", label: "Rules R1–R6" },
      { id: "flake-levels", label: "Flake levels" },
      { id: "defect-types", label: "Defect types" },
      { id: "modes", label: "Answer modes" },
      { id: "evidence", label: "Evidence and the inspector" },
      { id: "pass-k", label: "pass^k" },
      { id: "fleet", label: "Agent fleet" },
      { id: "audit", label: "Audit log" },
      { id: "integrations", label: "Settings and integrations" },
      { id: "workspaces", label: "Multi-workspace" },
    ],
  },
  { id: "shortcuts", label: "Keyboard shortcuts" },
  { id: "governance", label: "Governance guarantees" },
  { id: "trust", label: "Trust and safety" },
  { id: "faq", label: "FAQ" },
];

function TocList() {
  return (
    <ul className="space-y-1 text-[13px]">
      {TOC.map((t) => (
        <li key={t.id}>
          <a href={`#${t.id}`} className="block rounded-[3px] px-2 py-1 text-muted hover:bg-surface hover:text-ink">
            {t.label}
          </a>
          {t.sub && (
            <ul className="ml-2 border-l border-line pl-2">
              {t.sub.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block rounded-[3px] px-2 py-0.5 text-[12.5px] text-faint hover:text-ink">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 border-b border-line pb-2 font-serif text-[1.55rem] tracking-[-0.01em] text-ink">
      <a href={`#${id}`} className="hover:text-accent">
        {children}
      </a>
    </h2>
  );
}

function H3({ id, children, badge }: { id: string; children: ReactNode; badge?: string }) {
  return (
    <h3 id={id} className="mt-7 flex scroll-mt-20 items-center gap-2 text-[15.5px] font-medium text-ink">
      <a href={`#${id}`} className="hover:text-accent">
        {children}
      </a>
      {badge && <span className="rounded-[3px] border border-accent/50 bg-accent/10 px-1.5 py-px font-mono text-[10px] uppercase text-accent">{badge}</span>}
    </h3>
  );
}

const P = ({ children }: { children: ReactNode }) => <p className="mt-2 text-[14px] leading-relaxed text-muted">{children}</p>;
const C = ({ children }: { children: ReactNode }) => <code className="rounded-[3px] bg-sunken px-1 py-px font-mono text-[12.5px] text-ink">{children}</code>;
const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="text-accent underline-offset-4 hover:underline">
    {children}
  </Link>
);

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-3 space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-muted">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[10.5px] text-accent">{i + 1}</span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}

function Table({ head, rows, labelledBy, equal }: { head: string[]; rows: ReactNode[][]; labelledBy: string; equal?: boolean }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-[4px] border border-line" role="region" tabIndex={0} aria-labelledby={labelledBy}>
      <table className={`w-full min-w-[520px] text-[13px]${equal ? " table-fixed" : ""}`} aria-labelledby={labelledBy}>
        <thead className="label-mono bg-sunken/60 text-left text-[10px] text-faint">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className={cx("px-3 py-2", j === 0 ? cx("text-ink", !equal && "whitespace-nowrap") : "text-muted")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded-[3px] border border-line-strong bg-sunken px-1.5 py-px font-mono text-[11.5px] text-ink">{children}</kbd>
);

export function DocsView() {
  return (
    <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="On this page" className="lg:sticky lg:top-20 lg:self-start">
        <details className="rounded-[4px] border border-line bg-surface p-2 lg:hidden">
          <summary className="cursor-pointer px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">On this page</summary>
          <div className="mt-2">
            <TocList />
          </div>
        </details>
        <div className="hidden lg:block">
          <div className="label-mono mb-2 px-2 text-[10px] text-faint">On this page</div>
          <TocList />
        </div>
      </nav>

      <article className="min-w-0 max-w-3xl space-y-12">
        <section>
          <H2 id="getting-started">Getting started in two minutes</H2>
          <P>
            TestOps reads your CI evidence — the CI summary, every test attempt and the artifact logs — normalises it, and answers release questions with
            citations. A versioned rule file decides each release verdict; the agent fetches evidence through read-only tools and explains the verdict.
            Every answer is checked before you see it.
          </P>
          <Steps
            items={[
              <>
                Open the <A href="/">Overview</A>. Release candidates and the latest run per pipeline show the gate verdict the policy computed.
              </>,
              <>
                Ask the agent. Pick a demo scenario or type a question such as <C>Can we ship payments-api 2.14.0?</C> Watch the run stream, then switch the
                trace to <em>Waterfall</em> to see where time went.
              </>,
              <>
                Open evidence. Click any id in an answer — a run, an attempt, a log line, a finding — and the inspector shows the record it came from.
              </>,
            ]}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px] text-muted">
            The Overview shows a <em>Get started</em> checklist with these steps.
            <ShowOnboardingAgain />
          </div>
        </section>

        <section>
          <H2 id="quickstarts">Quickstarts by role</H2>

          <H3 id="release-manager">Release manager</H3>
          <Steps
            items={[
              <>
                <A href="/">Overview</A>: each release candidate shows its verdict and the rule that decided it. A <C>disagrees</C> flag in the runs table
                means the CI summary says PASS but the attempts do not support it.
              </>,
              <>Read the verdict before the explanation: the verdict comes from the policy function, the text from the model.</>,
              <>
                For <C>HOLD_MANUAL_REVIEW</C>, open the gate checks in the answer to see exactly which condition held the release, then decide.
              </>,
            ]}
          />

          <H3 id="qe">Quality engineer</H3>
          <Steps
            items={[
              <>
                <A href="/triage">Triage inbox</A> <span className="font-mono text-[11px] text-accent">new</span>: failed attempts grouped by defect type.
                Accept or override each suggestion with the keyboard; decisions are kept in your browser and copied to the{" "}
                <A href="/audit">audit log</A>.
              </>,
              <>
                <A href="/flaky">Flaky tests</A>: flake levels with flip rate and sample size. Infra-only retries are listed separately and never raise a level.
              </>,
              <>
                <A href="/history">Test history</A>: a test-by-run matrix per service. Click a cell to open that attempt.
              </>,
              <>
                <A href="/data-quality">Data quality</A>: duplicates, missing results, mixed timestamps and conflicting sources, each with the records it
                affects.
              </>,
            ]}
          />

          <H3 id="developer" badge="new">
            Developer
          </H3>
          <Steps
            items={[
              <>
                <A href="/dev">Developer workspace</A>: enter a commit and see whether its failures come from your change, a flaky test or the platform,
                with a preview of the PR check.
              </>,
              <>
                CLI gate in CI: <C>python scripts/testops_gate.py</C> returns exit code <C>0</C> success or neutral, <C>1</C> failure, <C>2</C> action
                required, <C>3</C> error. Use it as a pipeline step; the workspace shows a GitHub Actions snippet.
              </>,
              <>
                In your IDE: <C>app/mcp_server.py</C> exposes the same read-only tools over MCP (stdio), so an assistant in your editor can ask the
                release gate or look up a run without leaving the code.
              </>,
            ]}
          />

          <H3 id="leader">Engineering leader</H3>
          <Steps
            items={[
              <>
                <A href="/evals">Agent evals</A>: how the agent itself is tested — golden, adversarial and robustness cases, run repeatedly and reported as
                pass^k next to pass@1.
              </>,
              <>
                <A href="/pilot">Pilot plan</A>: a four-week, read-only pilot with success criteria, an ROI calculator using your own numbers, risks and an
                exit.
              </>,
            ]}
          />

          <H3 id="platform" badge="new">
            Platform / FDE
          </H3>
          <P>
            A connector runs inside the customer network and only calls out over HTTPS 443; it opens no ports. It is one file,{" "}
            <C>services/agent-api/scripts/testops_connector.py</C>, Python 3.9+, standard library only. <A href="/fleet">Agent fleet</A> shows the same
            commands with copy buttons.
          </P>
          <Steps
            items={[
              <>
                Enrol: <C>testops_connector.py enrol --api &lt;url&gt; --code enroll-demo-not-secret --name acme-ci-1 --adapter junit-xml</C>. The one-time
                code is exchanged for a connector credential, saved to <C>~/.testops-connector.json</C> with mode 0600. The sandbox code is public; any other
                code returns <C>403</C>. HTTPS is required except for localhost.
              </>,
              <>
                Push after each CI run: <C>push --junit build/test-results/junit.xml --run-id &quot;$CI_RUN_ID&quot; --service checkout-web</C>. Add{" "}
                <C>--dry-run</C> to print the events and send nothing. Batches hold at most 500 events; 429 and 5xx are retried with backoff.
              </>,
              <>
                Keep it alive: <C>run --interval 30</C> heartbeats and pulls the policy. A connector silent for 90 s turns stale, after 4 min lost.
              </>,
            ]}
          />
          <Table labelledBy="platform"
            head={["Exit code", "Meaning"]}
            rows={[
              [<C key="0">0</C>, "OK."],
              [<C key="3">3</C>, "Error: network, HTTP error, unreadable JUnit file, or events rejected by the ingest API."],
              [<C key="4">4</C>, "Paused by the control plane (HTTP 423): the connector or the workspace is paused, and the push stops."],
            ]}
          />
          <Table labelledBy="platform" equal
            head={["Leaves the network", "Stays in the network"]}
            rows={[
              [
                "Test outcomes: run id, service, test id, status, attempt, error class, timestamp, failure message.",
                "Credentials to the customer's CI, raw logs and artifacts.",
              ],
              [
                "Messages are capped at 500 characters; email addresses are replaced with [redacted-email] at ingest.",
                "Any field outside the event schema: the ingest API rejects it and never stores it.",
              ],
            ]}
          />
        </section>

        <section>
          <H2 id="concepts">Concepts</H2>

          <H3 id="verdicts">Gate verdicts</H3>
          <P>
            The release gate (<C>release-policy-v3</C>) evaluates conditions in order; the first match wins. Only the <C>critical</C> suite gates a
            release.
          </P>
          <Table labelledBy="verdicts"
            head={["Verdict", "When", "Rule"]}
            rows={[
              [<C key="b">BLOCK</C>, "A gating test failed on its final attempt.", "R2"],
              [<C key="h1">HOLD_MANUAL_REVIEW</C>, "A gating test never reported a result, or the CI summary contradicts the final attempts.", "R5"],
              [<C key="h2">HOLD_MANUAL_REVIEW</C>, "The run has no CI summary.", "R6"],
              [<C key="w">SHIP_WITH_WARNINGS</C>, "A gating test passed only after a retry.", "R2"],
              [<C key="s">SHIP</C>, "None of the above.", "R2"],
            ]}
          />

          <H3 id="rules">Rules R1–R6</H3>
          <Table labelledBy="rules"
            head={["Rule", "Title", "Effect"]}
            rows={[
              ["R1", "Infra failures are not test flakiness", "Retry-passes caused by INFRA or EXTERNAL_DEPENDENCY errors do not raise a test's flake level."],
              ["R2", "Final status is the last terminal attempt", "If the last attempt never reported, the outcome is INCOMPLETE, not an earlier attempt's status."],
              ["R3", "Three levels of flakiness evidence", "History can suggest nondeterminism; only identical-input reruns prove it."],
              ["R4", "Quarantine is a human decision with an expiry", "The agent recommends a quarantine; it never writes one."],
              ["R5", "Source-of-truth precedence", "Raw attempts outrank the CI summary; a contradicted summary makes the gate unverifiable."],
              ["R6", "Missing data is reported, never imputed", "A missing end time or summary is unknown — not zero and not PASS."],
            ]}
          />
          <P>
            The full rule file, including quarantine entries and effort assumptions, is on <A href="/rules">Rules &amp; policy</A>.
          </P>

          <H3 id="flake-levels">Flake levels</H3>
          <Table labelledBy="flake-levels"
            head={["Level", "Meaning"]}
            rows={[
              ["proven", "The same commit produced both a final PASS and a final FAIL."],
              ["suspected", "Two or more fail-then-pass series in the window, not caused by infrastructure."],
              ["possible", "One fail-then-pass series in the window."],
              ["consistent_failure", "Fails on its final attempt with no retry-pass: a regression candidate, not flakiness."],
              ["infra_only", "Only infrastructure retry-passes: a platform signal, not test flakiness (R1)."],
            ]}
          />
          <P>Below five completed runs a level is still shown but flagged as insufficient data. Each flaky test also shows its flip rate.</P>

          <H3 id="defect-types">Defect types</H3>
          <Table labelledBy="defect-types"
            head={["Type", "Meaning", "From categories"]}
            rows={[
              ["PB · Product Bug", "The product behaved wrongly; route to the owning team.", "PRODUCT_ASSERTION"],
              ["AB · Automation Bug", "The test or harness is wrong; route to the test owner.", "TEST_CODE"],
              ["SI · System Issue", "Platform or a dependency failed; never counted against the test.", "INFRA, EXTERNAL_DEPENDENCY"],
              ["TI · To Investigate", "Evidence does not settle the cause; a person decides.", "TIMING, MODEL_QUALITY, unknown classes"],
            ]}
          />

          <H3 id="modes">Answer modes</H3>
          <Table labelledBy="modes"
            head={["Mode", "What answers", "Label"]}
            rows={[
              ["Live", "The model chooses tools and writes the explanation. If it fails, a fallback model, then a second provider, then the offline planner answer.", "Model name; a notice when a fallback answered"],
              ["Replay", "A recorded live run for demo scenarios A, B and C, re-checked against today's data. No model call.", "Recorded model and request id"],
              ["Offline", "A keyword planner and templates over the same tools, policy and validator. No language model.", "A notice saying so"],
            ]}
          />

          <H3 id="evidence">Evidence and the inspector</H3>
          <P>
            Every tool returns the ids of the records it used, and every claim in an answer cites at least one. Ids look like <C>run-pay-main-0233</C>,{" "}
            <C>att-pay-main-0233-T-PAY-004-2</C>, <C>ci:run.summary:run-pay-main-0233</C> or <C>DQ-INC-005</C>. Click any of them to open the inspector, which
            shows the raw value next to the normalised one.
          </P>

          <H3 id="pass-k">pass^k</H3>
          <P>
            The share of eval cases that pass on <em>every</em> one of k repeated runs. It is stricter than pass@1, the share of individual runs that
            pass, and is the right measure for an agent that acts without a person picking the best answer. A run answered by the offline fallback does
            not count as a model pass.
          </P>

          <H3 id="fleet" badge="new">
            Agent fleet
          </H3>
          <P>
            <A href="/fleet">Agent fleet</A> is the control plane for connectors. Each connector heartbeats every 30 s and pulls its policy: read-only
            scopes <C>read:ci</C> and <C>read:artifacts</C>, enabled adapters, egress allowlist and redaction rules.
          </P>
          <Table labelledBy="fleet"
            head={["Field", "Values"]}
            rows={[
              ["Status", <span key="s"><C>connected</C> heartbeat &lt; 90 s · <C>stale</C> &lt; 4 min · <C>lost</C> ≥ 4 min</span>],
              ["Version", <span key="v"><C>current</C> at or above the target · <C>behind</C> older but supported · <C>unsupported</C> below the minimum</span>],
              ["Pause / resume", "Per connector. A paused connector's pushes are rejected with HTTP 423; it keeps heartbeating so it can be resumed."],
              ["Workspace kill switch", "Rejects pushes from every connector with HTTP 423 until it is turned off. Asks for confirmation."],
            ]}
          />
          <P>
            In the sandbox the four Kestrel connectors are simulated, and fleet state lives in process memory: it resets on a restart, and hosted instances
            do not share it.
          </P>

          <H3 id="audit" badge="new">
            Audit log
          </H3>
          <P>
            <A href="/audit">Audit log</A> is one feed, newest first, filterable by kind.
          </P>
          <Table labelledBy="audit"
            head={["Kind", "Recorded when", "Contents"]}
            rows={[
              [<C key="a">agent.answer</C>, "After every agent answer, in every mode.", "Request id, question (first 200 characters, emails redacted), mode, model, verdict, validation result, revisions, tool calls, latency."],
              [<C key="h">human.triage_decision</C>, "A reviewer accepts or overrides an item in the triage inbox.", "Decision, action, note (≤ 200 characters, emails redacted). Undo is local and not audited."],
              [<C key="c">control_plane</C>, "An operator enrols, pauses or resumes a connector, or flips the kill switch.", "Actor, action, target. Read from the fleet's own audit."],
            ]}
          />
          <P>
            The sandbox keeps the last 500 entries in process memory per instance; they reset on a restart. The agent has no tool that writes here.
          </P>

          <H3 id="integrations" badge="new">
            Settings and integrations
          </H3>
          <P>
            <A href="/settings">Settings</A> reports what the running API has: the model chain, data source and counts, rules version and each
            integration&apos;s status. Nothing on the page is editable, and no credential values or endpoint URLs are shown.
          </P>
          <Table labelledBy="integrations"
            head={["Status", "Meaning"]}
            rows={[
              ["Connected", "Live in this deployment."],
              ["Available", "A script or API exists in this deployment."],
              ["Example", "A sample file to copy."],
              ["Documented", "Exists in the repository but not in this deployment's bundle."],
              ["Not connected", "Off. ReportPortal, Jira, Slack and GitHub Checks write-back stay here because the agent is read-only."],
              ["Planned", "Not built yet."],
            ]}
          />

          <H3 id="workspaces">Multi-workspace</H3>
          <P>
            Design only, not implemented. The API serves one workspace, the Kestrel Commerce sandbox. The enterprise model (organization → workspace →
            connectors, versioned policy, partitioned data, roles with a read-only agent principal) is summarised at the end of{" "}
            <A href="/architecture">Architecture</A>.
          </P>
        </section>

        <section>
          <H2 id="shortcuts">Keyboard shortcuts</H2>
          <Table labelledBy="shortcuts"
            head={["Keys", "Action"]}
            rows={[
              [
                <span key="k">
                  <Kbd>Ctrl</Kbd> / <Kbd>⌘</Kbd> + <Kbd>K</Kbd>
                </span>,
                "Open the command palette: pages, runs, releases, tests, or ask the agent.",
              ],
              [<Kbd key="s">/</Kbd>, "Open the command palette when no text field is focused."],
              [
                <span key="e">
                  <Kbd>Ctrl</Kbd> / <Kbd>⌘</Kbd> + <Kbd>Enter</Kbd>
                </span>,
                "Ask the agent from the question box.",
              ],
              [<Kbd key="esc">Esc</Kbd>, "Close the palette, the inspector or a popover."],
              [
                <span key="t">
                  <Kbd>j</Kbd> <Kbd>k</Kbd> · <Kbd>a</Kbd> · <Kbd>o</Kbd>
                </span>,
                "Triage inbox: next / previous item, accept the suggestion, override it.",
              ],
            ]}
          />
        </section>

        <section>
          <H2 id="governance">Governance guarantees</H2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-muted">
            <li>Agent tools are read-only, in the web app and over MCP.</li>
            <li>Control actions (pause, resume, kill switch) are human-only and audited; the agent and the MCP server have no tool for them.</li>
            <li>The release verdict comes from the policy function, never from the model.</li>
            <li>The validator checks every answer before it is shown.</li>
          </ul>
        </section>

        <section>
          <H2 id="trust">Trust and safety</H2>
          <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-muted">
            <li>
              <span className="text-ink">Read-only.</span> Nothing here can change CI, releases or the dataset. Besides questions, POST routes only take
              connector traffic, operator actions and triage decisions for the audit log.
            </li>
            <li>
              <span className="text-ink">Rules decide.</span> Verdicts come from a tested policy function with its rule and version; the model cannot write
              one.
            </li>
            <li>
              <span className="text-ink">Checked answers.</span> Before you see an answer, five checks run: cited ids exist, they were retrieved in this
              request, every claim cites evidence, verdicts match the policy, and numbers appear in tool output. A failing draft is revised once, then shown
              with flags.
            </li>
            <li>
              <span className="text-ink">Untrusted logs.</span> Log text reaches the model as quoted data, and instruction-like lines are flagged.
            </li>
            <li>
              <span className="text-ink">Bounded tools.</span> At most eight tool calls per question, validated arguments, no model-written SQL.
            </li>
            <li>
              <span className="text-ink">Sandbox workspace.</span> Kestrel Commerce is fictional; every CI record here is synthetic.
            </li>
          </ul>
        </section>

        <section>
          <H2 id="faq">FAQ</H2>
          <dl className="mt-3 divide-y divide-line">
            {[
              ["Why does a release say HOLD when CI is green?", "The CI summary is advisory. If a gating test never reported a result, or its attempts contradict the summary, the gate cannot verify the release (R5)."],
              ["Can the agent approve or block a release by itself?", "No. The verdict is computed by the policy function. The agent explains it and cites evidence; people decide."],
              ["Why is my test not flaky when it retried?", "If the failed attempt was an infrastructure or dependency error, the retry is a platform signal, not test flakiness (R1)."],
              ["What happens when the model is down?", "A fallback model, then a second provider, then the offline planner answer. The badge and notice say which one did."],
              ["Where do the numbers in an answer come from?", "From tool output only. The validator rejects numbers that do not appear in what the tools returned."],
              ["Are my triage decisions shared?", "They are kept in your browser and copied to the audit log. Undo is local only."],
              ["Can I use this from CI or my editor?", "Yes: the CLI gate returns an exit code for a pipeline step, and the MCP server exposes the read-only tools to IDE assistants."],
              ["Is any of this real customer data?", "No. The workspace is a sandbox with synthetic data generated by a seeded script."],
            ].map(([q, a]) => (
              <div key={q} className="py-3">
                <dt className="text-[14px] font-medium text-ink">{q}</dt>
                <dd className="mt-1 text-[13.5px] leading-relaxed text-muted">{a}</dd>
              </div>
            ))}
          </dl>
          <P>
            Changes to the product are listed in <A href="/changelog">What&apos;s new</A>.
          </P>
        </section>
      </article>
    </div>
  );
}
