import type { NextRequest } from "next/server";

// Same-origin proxy to the agent API. A route handler (not a rewrite) so the upstream URL is read at
// runtime and live answers (15-60 s) are not cut by the rewrite proxy timeout.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const upstream = () => (process.env.AGENT_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
const FORWARD_HEADERS = ["content-type", "x-request-id", "x-forwarded-for"];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = `${upstream()}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const h of FORWARD_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const ip = req.headers.get("x-real-ip");
  if (ip && !headers.has("x-forwarded-for")) headers.set("x-forwarded-for", ip);
  try {
    const res = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
      signal: AbortSignal.timeout(115_000),
      cache: "no-store",
    });
    const out = new Headers({ "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" });
    const rid = res.headers.get("x-request-id");
    if (rid) out.set("x-request-id", rid);
    return new Response(await res.arrayBuffer(), { status: res.status, headers: out });
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return Response.json(
      { detail: { error: timeout ? "upstream_timeout" : "upstream_unreachable", message: timeout ? "The agent API did not answer in time." : "The agent API is unreachable." } },
      { status: timeout ? 504 : 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
