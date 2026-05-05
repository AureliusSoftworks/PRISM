---
title: "apps/api/src/utils.http.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/utils.http.ts"
status: "active"
---

# apps/api/src/utils.http.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/api/src/auth.ts]]
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/utils.http.ts`

## Import references
- `node:http`

## Source preview
```text
import type { IncomingMessage, ServerResponse } from "node:http";

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

export function json(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) {
      return acc;
    }
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

export function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  maxAgeSeconds: number
): void {
  res.setHeader(
    "set-cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`
  );
}

export function clearCookie(res: ServerResponse, name: string): void {
  res.setHeader(
    "set-cooki

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
