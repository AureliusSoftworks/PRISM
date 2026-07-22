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

/**
 * Whether this web front-end is itself exposed on the local network. Launch
 * scripts / Docker set `PRISM_WEB_LAN=1` when binding to all interfaces. The API
 * uses the `x-prism-web-origin` marker we stamp below (never a client-supplied
 * value) to keep the network toggle host-only.
 */
const WEB_IS_LAN_EXPOSED = process.env.PRISM_WEB_LAN === "1";

/**
 * Headers a remote browser must never be able to set: anything we use to reason
 * about request locality. We strip them before forwarding and stamp our own.
 */
const UNTRUSTED_LOCALITY_HEADERS = new Set([
  "x-prism-web-origin",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "forwarded",
]);

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

function clientClosedResponse(): Response {
  return new Response(null, {
    status: 499,
    statusText: "Client Closed Request",
  });
}

function requestWasAborted(request: NextRequest, error: unknown): boolean {
  return (
    request.signal.aborted ||
    (error instanceof Error && error.name === "AbortError")
  );
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
    const lower = key.toLowerCase();
    if (!hopByHopRequest.has(lower) && !UNTRUSTED_LOCALITY_HEADERS.has(lower)) {
      headers.set(key, value);
    }
  });
  // Stamp our own bind mode so the API can keep the network toggle host-only.
  headers.set("x-prism-web-origin", WEB_IS_LAN_EXPOSED ? "lan" : "loopback");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: request.signal,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    // Buffer the incoming body before opening the loopback request. Passing
    // NextRequest's live stream straight into Node fetch can fail after the
    // client upload closes, even though the API is healthy and later returns
    // a useful provider error. API request bodies are bounded upstream; this
    // keeps the proxy response attached to the API response instead of
    // misreporting the failure as a disconnected local backend.
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) init.body = body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (err) {
    if (requestWasAborted(request, err)) return clientClosedResponse();
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
    if (requestWasAborted(request, err)) return clientClosedResponse();
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
