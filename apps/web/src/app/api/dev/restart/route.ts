import { stat, utimes } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const API_ORIGIN = (process.env.LOCALAI_API_ORIGIN ?? "http://127.0.0.1:18787").replace(
  /\/$/,
  ""
);
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "localai_session";
const API_RESTART_TIMEOUT_MS = 1200;
const API_SERVER_ENTRY_PARTS = ["apps", "api", "src", "server.ts"] as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasRestartCredential(request: NextRequest): boolean {
  return (
    request.cookies.has(SESSION_COOKIE_NAME) ||
    Boolean(request.headers.get("authorization")?.trim()) ||
    Boolean(request.headers.get("x-prism-client-access")?.trim())
  );
}

async function findApiServerEntryPath(): Promise<string | null> {
  const candidates = [
    path.resolve(
      /* turbopackIgnore: true */ process.cwd(),
      "..",
      "..",
      ...API_SERVER_ENTRY_PARTS
    ),
    path.resolve(
      /* turbopackIgnore: true */ process.cwd(),
      ...API_SERVER_ENTRY_PARTS
    ),
  ];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // Packaged builds may not have source files nearby.
    }
  }
  return null;
}

async function triggerApiWatchRestart(): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return false;
  const serverEntryPath = await findApiServerEntryPath();
  if (!serverEntryPath) return false;
  const now = new Date();
  await utimes(serverEntryPath, now, now);
  return true;
}

async function requestApiSelfRestart(request: NextRequest): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_RESTART_TIMEOUT_MS);
  try {
    const headers = new Headers({
      "content-type": "application/json",
    });
    const cookie = request.headers.get("cookie");
    const authorization = request.headers.get("authorization");
    const clientAccess = request.headers.get("x-prism-client-access");
    if (cookie) headers.set("cookie", cookie);
    if (authorization) headers.set("authorization", authorization);
    if (clientAccess) headers.set("x-prism-client-access", clientAccess);
    return await fetch(`${API_ORIGIN}/api/dev/restart`, {
      method: "POST",
      headers,
      body: "{}",
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!hasRestartCredential(request)) {
    return NextResponse.json(
      { ok: false as const, error: "Authentication required." },
      { status: 401 }
    );
  }

  const upstream = await requestApiSelfRestart(request);
  if (upstream) {
    const payload = await upstream.text();
    if (!upstream.ok) {
      return new NextResponse(payload, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: {
          "content-type": upstream.headers.get("content-type") ?? "application/json",
        },
      });
    }
    return new NextResponse(payload, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  }

  const watchRestartTriggered = await triggerApiWatchRestart();
  if (watchRestartTriggered) {
    return NextResponse.json(
      {
        ok: true as const,
        restarting: true,
        mode: "watch-file",
      },
      { status: 202 }
    );
  }

  return NextResponse.json(
    {
      ok: false as const,
      error: "Prism API restart could not be requested.",
      hint: `Start the API server or set LOCALAI_API_ORIGIN (current: ${API_ORIGIN})`,
    },
    { status: 502 }
  );
}
