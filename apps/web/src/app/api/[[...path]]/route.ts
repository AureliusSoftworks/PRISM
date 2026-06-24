import type { NextRequest } from "next/server.js";
import { NextResponse } from "next/server.js";
import {
  BACKEND_UNAVAILABLE_CODE,
  type BackendUnavailablePayload,
} from "../../backendUnavailable.ts";

/**
 * Reverse-proxy all `/api/*` traffic to the Prism API process.
 *
 * `next.config` rewrites use a short default proxy timeout (~30s). Local image
 * generation (ComfyUI / Ollama GPU load) often exceeds that, which surfaces as
 * generic “Internal Server Error” from the dev server. This route forwards with
 * Node’s fetch (no artificial wall-clock cap for local backends).
 */
const API_ORIGIN = (process.env.LOCALAI_API_ORIGIN ?? "http://127.0.0.1:18787").replace(
  /\/$/,
  ""
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Upper bound for hosted deployments (e.g. Vercel); local `next dev` ignores this. */
export const maxDuration = 1200;

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

function backendUnavailableResponse(detail: string): Response {
  const payload: BackendUnavailablePayload = {
    ok: false,
    code: BACKEND_UNAVAILABLE_CODE,
    error: "Prism is waiting for its local API.",
    retryable: true,
    detail,
  };
  return NextResponse.json(payload, { status: 503 });
}

async function proxy(request: NextRequest, ctx: RouteContext): Promise<Response> {
  try {
    const { path: segments } = await ctx.params;
  const parts = segments ?? [];
  const apiPath = parts.length > 0 ? `/api/${parts.join("/")}` : "/api";
  const url = new URL(apiPath + request.nextUrl.search, `${API_ORIGIN}/`);

  const hopByHopRequest = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
  ]);

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!hopByHopRequest.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: request.signal,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "fetch failed";
    return backendUnavailableResponse(message);
  }

  const hopByHopResponse = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]);

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!hopByHopResponse.has(key.toLowerCase())) {
      outHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "proxy failed";
    return backendUnavailableResponse(message);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
