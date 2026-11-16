// Mirrors services/agent-api/app/schemas.py and the tool outputs in app/tools.py.

export type Verdict = "SHIP" | "SHIP_WITH_WARNINGS" | "HOLD_MANUAL_REVIEW" | "BLOCK";
export type Mode = "live" | "replay" | "offline";

export interface AskRequest {
  question: string;
  mode: Mode;
  scenario?: string | null;
}

export interface EvidenceRef {
  id: string;
  kind: string;
  label: string;
  exists: boolean;
}

export interface Claim {
  text: string;
  evidence: string[];
  supported: boolean;
  note?: string | null;
}

export interface GateCheck {
  condition: string;
  triggered: boolean;
  rule: string;
  detail: string;
  evidence: string[];
}

export interface GateView {
  run_id: string;
  verdict: Verdict;
  deciding_rule: string;
  policy_id: string;
  rules_version: string;
  checks: GateCheck[];
}

export interface ToolCall {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
  summary: string;
  evidence: string[];
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface Validation {
  passed: boolean;
  checks: ValidationCheck[];
  revisions: number;
}

export interface AskResponse {
  request_id: string;
  mode: Mode;
  model: string | null;
  question: string;
  answer: string;
  recommendation: string | null;
  gate: GateView | null;
  claims: Claim[];
  evidence: EvidenceRef[];
  data_quality_warnings: string[];
  assumptions: string[];
  uncertainty: string;
  tool_trace: ToolCall[];
  validation: Validation;
  latency_ms: number;
  notice?: string | null;
}

// ---------- /api/health ----------
export interface Health {
  status: "ok" | "degraded";
  data:
    | { status: "ok"; source: string; raw_events: number; runs: number }
    | { status: "unavailable"; message: string };
  model: { configured: boolean; model: string | null; fallback: string | null };
  rules_version: string;
  replays: string[];
}

// ---------- /api/overview ----------
export interface Service {
  id: string;
  name: string;
  team: string;
  tier: string;
}

export interface Pipeline {
  id: string;
  service_id: string;
  name: string;
  branch: string;
  kind: string;
}

export interface ReleaseCandidate {
  id: string;
  service_id: string;
  version: string;
  run_id: string;
  verdict: Verdict;
  deciding_rule: string;
}

export interface RunRow {
  run_id: string;
  pipeline_id: string;
  service_id: string;
  run_number: number;
  commit: string;
  queued_utc: string;
  ci_summary: string | null;
  gate_verdict: Verdict;
  release_candidate: string | null;
}

export interface Preset {
  id: string;
  question: string;
}

export interface Overview {
  company: { name: string; profile: string };
  as_of: string;
  source: string;
  services: Service[];
  pipelines: Pipeline[];
  totals: {
    runs: number;
    attempts: number;
    tests: number;
    raw_events: number;
    unique_events: number;
    findings: number;
  };
  release_candidates: ReleaseCandidate[];
  latest_runs: RunRow[];
  finding_counts: Record<string, number>;
  presets: Preset[];
}

// ---------- shared record shapes ----------
export interface Timestamp {
  raw: string | number | null;
  utc: string | null;
  format: string;
}

export type TriageCode = "PB" | "AB" | "SI" | "TI";

export interface AttemptView {
  attempt_id: string;
  attempt: number;
  status: string;
  error_class: string | null;
  category: string | null;
  triage?: { code: TriageCode; label: string } | null;
  message: string | null;
  started_utc: string | null;
  finished_utc: string | null;
  duration_s: number | null;
}

export interface OutcomeView {
  test_id: string;
  name: string;
  suite: string;
  final_status: string;
  resolution: string;
  failure_categories: string[];
  final_attempt_id: string | null;
  attempts: AttemptView[];
}

export interface LogRow {
  event_id: string;
  attempt_id: string | null;
  ts_raw: string | number | null;
  ts_utc: string | null;
  ts_format?: string;
  level: string;
  untrusted_text: string;
  possible_prompt_injection: boolean;
}

export interface CiSummaryBrief {
  event_id: string;
  status: string | null;
  status_raw: string | null;
  finished: Timestamp;
}

export interface RunDetails {
  run: {
    run_id: string;
    pipeline_id: string;
    service_id: string;
    run_number: number;
    commit: string;
    queued: Timestamp;
  };
  ci_summary: CiSummaryBrief | null;
  tests_total: number;
  tests_needing_attention: OutcomeView[];
  tests_passed_first_attempt: number;
  logs: LogRow[];
  logs_note: string;
  data_quality_findings: { id: string; kind: string; detail: string }[];
  evidence: string[];
  summary: string;
}

export interface GateResult extends GateView {
  summary_status: string | null;
  summary_event_id: string | null;
  quarantine: unknown[];
  evidence: string[];
  note: string;
  summary: string;
}

export interface RunResponse {
  details: RunDetails;
  gate: GateResult;
}

// ---------- /api/records/{id} ----------
export interface AttemptRecord {
  attempt_id: string;
  run_id: string;
  test_id: string;
  attempt_no: number;
  status: string | null;
  started: Timestamp;
  finished: Timestamp;
  environment: string | null;
  worker: string | null;
  error_class: string | null;
  message: string | null;
  started_event_id: string | null;
  result_event_id: string | null;
  result_ingest_ids: number[];
  duration_s: number | null;
}

export interface CiSummaryRecord {
  event_id: string;
  run_id: string;
  status: string | null;
  status_raw: string | null;
  started: Timestamp;
  finished: Timestamp;
  ingest_id: number | null;
  received_at: string | null;
}

export interface LogRecord {
  event_id: string;
  run_id: string;
  attempt_id: string | null;
  ts_raw: string | number | null;
  ts_utc: string | null;
  level: string;
  untrusted_text: string;
  possible_prompt_injection: boolean;
}

export interface Finding {
  id: string;
  kind: string;
  severity: "critical" | "warning" | "info" | string;
  detail: string;
  record_ids: string[];
  count: number;
}

export interface TestRecord {
  id: string;
  service_id: string;
  suite: string;
  kind: string;
  name: string;
}

export interface PolicyRecord {
  id: string;
  name: string;
  rules: Record<string, unknown>;
  source_of_truth: string[];
  gate: KnowledgeGate;
}

export type RecordResponse =
  | { kind: "attempt"; record: AttemptRecord; summary: string }
  | { kind: "ci_summary"; record: CiSummaryRecord; summary: string }
  | { kind: "log"; record: LogRecord; summary: string }
  | { kind: "finding"; record: Finding; summary: string }
  | { kind: "test"; record: TestRecord; summary: string }
  | { kind: "policy"; record: PolicyRecord; summary: string }
  | { kind: "release_candidate"; record: { id: string; service_id: string; version: string; run_id: string }; summary: string }
  | ({ kind: "run" } & RunDetails);

// ---------- /api/flaky ----------
export type FlakyLevel = "proven" | "suspected" | "possible" | "consistent_failure" | "infra_only" | string;

export interface FlakyTest {
  test_id: string;
  name: string;
  service_id: string;
  suite: string;
  runs_observed: number;
  first_attempt_failures: number;
  retry_passes_test: number;
  retry_passes_infra: number;
  final_failures: number;
  incomplete_runs_excluded: number;
  mixed_outcome_commits: string[];
  level: FlakyLevel;
  error_classes: string[];
  retry_minutes_measured: number;
  retry_attempts_without_duration: number;
  evidence: string[];
  first_attempt_failure_rate: number;
  flips?: number;
  flip_rate?: number;
  min_runs?: number;
  confidence?: "ok" | "insufficient_data";
}

export interface CostScenario {
  minutes_per_investigation: number;
  usd_per_hour: number;
  engineer_hours: number;
  usd: number;
}

export type Band = "low" | "base" | "high";

export interface FlakyResponse {
  flaky: {
    scope: { service_id: string; lookback_days: number; as_of: string; runs_analyzed: number };
    tests: FlakyTest[];
    totals: {
      retry_pass_series_test: number;
      retry_pass_series_infra: number;
      retry_minutes_measured: number;
      incomplete_runs_excluded: number;
    };
    data_handling: string[];
    levels: Record<string, string>;
    summary: string;
  };
  cost: {
    formula: string;
    measured: {
      investigations: number;
      window_days: number;
      source: string;
      retry_ci_minutes?: number;
      breakdown?: Record<string, number>;
      split?: { test_retry_passes: number; infra_retry_passes: number; final_failures: number };
      what_counts?: string;
    };
    assumed: {
      minutes_per_investigation: Record<Band, number>;
      loaded_cost_per_engineer_hour_usd: Record<Band, number>;
    };
    scenarios: Record<Band, CostScenario>;
    caveat: string;
    summary: string;
  };
}

// ---------- /api/data-quality ----------
export interface DataQualityResponse {
  raw_events: number;
  unique_events: number;
  findings: Finding[];
  source_of_truth: string[];
  summary: string;
}

// ---------- /api/knowledge ----------
export interface KnowledgeRule {
  id: string;
  title: string;
  rationale?: string;
  effect?: string;
  levels?: Record<string, string>;
}

export interface KnowledgeGate {
  policy_id: string;
  gating_suites: string[];
  precedence: { when: string; verdict: Verdict; rule: string }[];
}

export interface Knowledge {
  version: string;
  owner?: string;
  taxonomy: Record<string, { classes: string[]; meaning: string; triage?: TriageCode }>;
  triage_buckets?: Record<TriageCode, { label: string; meaning: string }>;
  rules: KnowledgeRule[];
  release_gate: KnowledgeGate;
  quarantine?: { test_id: string; owner: string; reason: string; expires: string }[];
  effort_assumptions?: {
    triage_minutes_per_investigation?: Record<Band, number>;
    loaded_cost_per_engineer_hour_usd?: Record<Band, number>;
  };
}

// ---------- /api/evals (shape may evolve; every field optional) ----------
export interface EvalCheck {
  name?: string;
  passed?: boolean;
  detail?: string;
  [key: string]: unknown;
}

export interface EvalCase {
  id?: string;
  suite?: string;
  intent?: string;
  question?: string;
  expected?: unknown;
  actual?: unknown;
  passed?: boolean;
  checks?: EvalCheck[];
  elapsed_ms?: number;
  runs?: number;
  runs_passed?: number;
  stability?: "stable" | "flaky" | "failing";
  [key: string]: unknown;
}

export interface EvalSuite {
  name?: string;
  passed?: number;
  total?: number;
  cases?: EvalCase[];
  [key: string]: unknown;
}

export interface EvalRun {
  generated_at?: string;
  mode?: string;
  data_source?: string;
  models?: string[];
  method?: string;
  suites?: EvalSuite[];
  repeat?: number;
  summary?: { passed?: number; total?: number; median_latency_ms?: number; run_pass_rate?: number; stable?: number; flaky?: number; failing?: number };
  [key: string]: unknown;
}

// Top level is the primary run; `reports` holds every recorded run keyed by mode.
export interface EvalReport extends EvalRun {
  reports?: Record<string, EvalRun>;
}
