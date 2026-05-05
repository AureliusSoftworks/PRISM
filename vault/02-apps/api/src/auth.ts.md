---
title: "apps/api/src/auth.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/auth.ts"
status: "active"
---

# apps/api/src/auth.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/security.ts]]
- [[02-apps/api/src/utils.http.ts]]

## Referenced by
- [[02-apps/api/src/__tests__/auth.test.ts]]
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/auth.ts`

## Import references
- `node:http`
- `node:sqlite`
- `./utils.http.ts`
- `./security.ts`

## Source preview
```text
import type { IncomingHttpHeaders } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { parseCookies } from "./utils.http.ts";
import { randomId } from "./security.ts";

export const CLIENT_ACCESS_COOKIE_NAME = "prism_client_access";

export interface ResolvedSession {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface ClientAccessToken {
  token: string;
  expiresAt: string;
}

export interface ResolvedClientAccess {
  token: string;
  userId: string;
  expiresAt: string;
}

export function parseBearerToken(
  authorizationHeader: string | string[] | undefined
): string | null {
  const header = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;
  if (!header) {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1]?.trim();
  return token ? token : null;
}

export function resolveSessionToken(
  headers: IncomingHttpHeaders,
  sessionCookieName: string
): string | null {
  const bearerToken = parseBearerToken(headers.authorization);
  if (bearerToken) {
    return bearerToken;
  }

  const cookies = parseCookies(headers.cookie);
  return cookies[sessionCookieName] ?? null;
}

export function createClientAccessToken(
  db: DatabaseSync,
  userId: string,
  ttlHours: number,
  now = new Date()
): ClientAccessTok

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
