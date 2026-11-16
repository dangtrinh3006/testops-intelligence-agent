import type {
  AskRequest,
  AskResponse,
  DataQualityResponse,
  EvalReport,
  TestHistory,
  FlakyResponse,
  Health,
  Knowledge,
  Overview,
  RecordResponse,
  RunResponse,
} from "./types";

export const ASK_TIMEOUT_MS = 90_000;
export const DEFAULT_TIMEOUT_MS = 15_000;

export type ApiErrorKind = "timeout" | "aborted" | "network" | "http" | "parse";

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNotFound(): boolean {
    return this.kind === "http" && this.status === 404;
  }
}

// FastAPI wraps errors as {detail: {error, message}} or {detail: [validation errors]}.
function describeHttpError(status: number, body: unknown): { code?: string; message: string } {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as { error?: string; message?: string };
    return { code: d.error, message: d.message ?? `Request failed (${status}).` };
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string; loc?: unknown[] };
    const field = Array.isArray(first.loc) ? first.loc.slice(1).join(".") : "";
    return { code: "invalid_request", message: `${field ? field + ": " : ""}${first.msg ?? "invalid request"}` };
  }
  if (typeof detail === "string") return { message: detail };
  const err = (body as { error?: string } | null)?.error;
  return { code: err, message: status >= 500 ? `Server error (${status}).` : `Request failed (${status}).` };
}

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: outer, ...rest } = init;
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onOuterAbort = () => ctrl.abort();
  outer?.addEventListener("abort", onOuterAbort);

  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      signal: ctrl.signal,
      headers: { accept: "application/json", ...(rest.headers ?? {}) },
      cache: "no-store",
    });
  } catch (e) {
    if (timedOut) throw new ApiError("timeout", `No response after ${Math.round(timeoutMs / 1000)}s.`);
    if (ctrl.signal.aborted) throw new ApiError("aborted", "Request cancelled.");
    throw new ApiError("network", e instanceof Error ? `Cannot reach the agent API (${e.message}).` : "Cannot reach the agent API.");
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }

  const requestId = res.headers.get("x-request-id") ?? undefined;
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) throw new ApiError("parse", "The agent API returned a non-JSON response.", res.status, undefined, requestId);
    }
  }
  if (!res.ok) {
    const { code, message } = describeHttpError(res.status, body);
    throw new ApiError("http", message, res.status, code, requestId);
  }
  return body as T;
}

export const api = {
  health: (signal?: AbortSignal) => request<Health>("/api/health", { signal }),
  overview: (signal?: AbortSignal) => request<Overview>("/api/overview", { signal }),
  flaky: (signal?: AbortSignal) => request<FlakyResponse>("/api/flaky", { signal }),
  dataQuality: (signal?: AbortSignal) => request<DataQualityResponse>("/api/data-quality", { signal }),
  knowledge: (signal?: AbortSignal) => request<Knowledge>("/api/knowledge", { signal }),
  evals: (signal?: AbortSignal) => request<EvalReport>("/api/evals", { signal }),
  testHistory: (serviceId: string, limit = 40, signal?: AbortSignal) =>
    request<TestHistory>(`/api/test-history?service_id=${encodeURIComponent(serviceId)}&limit=${limit}`, { signal }),
  run: (runId: string, signal?: AbortSignal) =>
    request<RunResponse>(`/api/runs/${encodeURIComponent(runId)}`, { signal }),
  record: async (id: string, signal?: AbortSignal): Promise<RecordResponse> => {
    const body = await request<Record<string, unknown>>(`/api/records/${encodeURIComponent(id)}`, { signal });
    // get_record returns run details without a `kind` field.
    if (!("kind" in body) && "run" in body) return { kind: "run", ...body } as RecordResponse;
    return body as unknown as RecordResponse;
  },
  ask: (req: AskRequest, signal?: AbortSignal) =>
    request<AskResponse>("/api/ask", {
      method: "POST",
      body: JSON.stringify(req),
      headers: { "content-type": "application/json" },
      timeoutMs: ASK_TIMEOUT_MS,
      signal,
    }),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Unexpected error.";
}
