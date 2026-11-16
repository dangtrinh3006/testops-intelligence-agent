import type { AskResponse, Mode, ToolCall, ValidationCheck } from "./types";

// Client for POST /api/ask/stream (server-sent events over fetch, since EventSource cannot POST).

export type StreamEvent =
  | { type: "start"; at: number; data: { request_id: string; mode: Mode; model: string | null; streaming: boolean } }
  | { type: "plan"; at: number; data: { tool_calls: { tool: string; args: string }[]; model_calls: number; ready: boolean } }
  | { type: "tool"; at: number; data: ToolCall }
  | { type: "compose"; at: number; data: { attempt: number; claims: number } }
  | { type: "validate"; at: number; data: { passed: boolean; checks: ValidationCheck[]; will_revise: boolean } }
  | { type: "notice"; at: number; data: { message: string; reset?: boolean } }
  | { type: "ping"; at: number; data: Record<string, never> }
  | { type: "final"; at: number; data: AskResponse }
  | { type: "error"; at: number; data: { error: string; message: string } };

export class StreamError extends Error {
  constructor(
    message: string,
    public status: number | null,
  ) {
    super(message);
  }
}

/** Streams one question; calls onEvent for every event and resolves with the final answer. */
export async function askStream(
  body: { question: string; mode: Mode; scenario?: string | null },
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<AskResponse> {
  const t0 = performance.now();
  const res = await fetch("/api/ask/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      message = j?.detail?.message ?? j?.detail?.[0]?.msg ?? message;
    } catch {
      /* keep the status text */
    }
    throw new StreamError(message, res.status);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let final: AskResponse | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      let type = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) type = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      let parsed: unknown = {};
      try {
        parsed = data ? JSON.parse(data) : {};
      } catch {
        continue;
      }
      const event = { type, at: performance.now() - t0, data: parsed } as StreamEvent;
      onEvent(event);
      if (event.type === "final") final = event.data;
      if (event.type === "error") throw new StreamError(event.data.message || event.data.error, null);
    }
  }
  if (!final) throw new StreamError("The stream ended before the answer arrived.", null);
  return final;
}
