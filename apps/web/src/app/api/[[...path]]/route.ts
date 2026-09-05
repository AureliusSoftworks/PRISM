import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
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
 * generation and Spectator Debate/Signal bake often exceed that — and Node’s
 * built-in `fetch` (undici) still applies a ~300s headersTimeout while waiting
 * for the first response byte. This route forwards with `node:http` /
 * `node:https` and `timeout: 0` so long local backends are not misreported as
 * offline.
 */
function resolveApiOrigin(): string {
  return (process.env.LOCALAI_API_ORIGIN ?? "http://127.0.0.1:18787").replace(
    /\/$/,
    ""
  );
}

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

function describeUpstreamError(err: unknown): string {
  if (!(err instanceof Error)) {
    return typeof err === "string" ? err : "upstream failed";
  }
  const parts: string[] = [err.message];
  const code =
    "code" in err && typeof (err as NodeJS.ErrnoException).code === "string"
      ? (err as NodeJS.ErrnoException).code
      : undefined;
  if (code) parts.push(code);
  let cause: unknown = err.cause;
  let depth = 0;
  while (cause instanceof Error && depth < 4) {
    parts.push(cause.message);
    const causeCode =
      "code" in cause && typeof (cause as NodeJS.ErrnoException).code === "string"
        ? (cause as NodeJS.ErrnoException).code
        : undefined;
    if (causeCode) parts.push(causeCode);
    cause = cause.cause;
    depth += 1;
  }
  return [...new Set(parts.filter((part) => part.trim().length > 0))].join(": ");
}

function headersToNodeRecord(headers: Headers): http.OutgoingHttpHeaders {
  const record: http.OutgoingHttpHeaders = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/**
 * Forward to the local API without undici’s default headersTimeout (~300s).
 * Spectator Debate bake and similar hold the response until many model turns
 * finish; a mid-wait timeout was mislabeled as “API offline”.
 */
function forwardUpstream(
  url: URL,
  init: {
    method: string;
    headers: Headers;
    body?: ArrayBuffer | null;
    signal?: AbortSignal;
  }
): Promise<Response> {
  const abortError = (): Error =>
    Object.assign(new Error("Aborted"), { name: "AbortError" });

  if (init.signal?.aborted) {
    return Promise.reject(abortError());
  }

  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const settleResolve = (response: Response): void => {
      if (settled) return;
      settled = true;
      resolve(response);
    };
    const settleReject = (err: Error): void => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const req = lib.request(
      url,
      {
        method: init.method,
        headers: headersToNodeRecord(init.headers),
        // Disable socket inactivity timeout so long local operations can wait
        // for the first response byte (Spectator bake, image gen, etc.).
        timeout: 0,
      },
      (res) => {
        const outHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value === undefined) continue;
          if (Array.isArray(value)) {
            for (const item of value) outHeaders.append(key, item);
          } else {
            outHeaders.set(key, value);
          }
        }
        const status = res.statusCode ?? 502;
        const body =
          init.method === "HEAD" || status === 204 || status === 304
            ? null
            : (Readable.toWeb(res) as unknown as BodyInit);
        settleResolve(
          new Response(body, {
            status,
            statusText: res.statusMessage,
            headers: outHeaders,
          })
        );
      }
    );

    const onAbort = (): void => {
      req.destroy();
      settleReject(abortError());
    };
    init.signal?.addEventListener("abort", onAbort, { once: true });

    req.on("error", (err) => {
      init.signal?.removeEventListener("abort", onAbort);
      if (init.signal?.aborted || settled) {
        settleReject(abortError());
        return;
      }
      settleReject(err);
    });
    req.on("timeout", () => {
      req.destroy();
      settleReject(new Error("Upstream request timed out"));
    });

    if (init.body && init.body.byteLength > 0) {
      req.write(Buffer.from(init.body));
    }
    req.end();
  });
}

async function proxy(request: NextRequest, ctx: RouteContext): Promise<Response> {
  const apiOrigin = resolveApiOrigin();
  if (request.signal.aborted) return clientClosedResponse();
  try {
    const { path: segments } = await ctx.params;
  const parts = segments ?? [];
  const apiPath = parts.length > 0 ? `/api/${parts.join("/")}` : "/api";
  const url = new URL(apiPath + request.nextUrl.search, `${apiOrigin}/`);

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

  let body: ArrayBuffer | null = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    // Buffer the incoming body before opening the loopback request. Passing
    // NextRequest's live stream straight into Node fetch can fail after the
    // client upload closes, even though the API is healthy and later returns
    // a useful provider error. API request bodies are bounded upstream; this
    // keeps the proxy response attached to the API response instead of
    // misreporting the failure as a disconnected local backend.
    const buffered = await request.arrayBuffer();
    if (buffered.byteLength > 0) body = buffered;
  }

  let upstream: Response;
  try {
    upstream = await forwardUpstream(url, {
      method: request.method,
      headers,
      body,
      signal: request.signal,
    });
  } catch (err) {
    if (requestWasAborted(request, err)) return clientClosedResponse();
    const message = describeUpstreamError(err);
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
    const message = describeUpstreamError(err);
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
