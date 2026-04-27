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
): ClientAccessToken {
  const token = randomId(24);
  const expiresAt = new Date(
    now.getTime() + ttlHours * 60 * 60 * 1000
  ).toISOString();
  db.prepare(
    "INSERT INTO client_access_tokens (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).run(token, userId, expiresAt, now.toISOString());
  return { token, expiresAt };
}

export function resolveClientAccessToken(
  headers: IncomingHttpHeaders
): string | null {
  const header = headers["x-prism-client-access"];
  const headerToken = Array.isArray(header) ? header[0] : header;
  if (headerToken?.trim()) {
    return headerToken.trim();
  }

  const cookies = parseCookies(headers.cookie);
  return cookies[CLIENT_ACCESS_COOKIE_NAME] ?? null;
}

export function requireValidClientAccess(
  db: DatabaseSync,
  clientAccessToken: string | null,
  now = new Date()
): ResolvedClientAccess {
  if (!clientAccessToken) {
    throw new Error("Native client access required.");
  }

  const token = db
    .prepare("SELECT user_id, expires_at FROM client_access_tokens WHERE token = ?")
    .get(clientAccessToken) as { user_id?: string; expires_at?: string } | undefined;
  if (!token?.user_id || !token.expires_at) {
    throw new Error("Invalid native client access.");
  }

  if (new Date(token.expires_at).getTime() < now.getTime()) {
    db.prepare("DELETE FROM client_access_tokens WHERE token = ?").run(clientAccessToken);
    throw new Error("Native client access expired.");
  }

  return {
    token: clientAccessToken,
    userId: token.user_id,
    expiresAt: token.expires_at,
  };
}

export function requireValidSession(
  db: DatabaseSync,
  sessionToken: string | null,
  now = new Date()
): ResolvedSession {
  if (!sessionToken) {
    throw new Error("Authentication required.");
  }

  const session = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?")
    .get(sessionToken) as { user_id?: string; expires_at?: string } | undefined;
  if (!session?.user_id || !session.expires_at) {
    throw new Error("Invalid session.");
  }

  if (new Date(session.expires_at).getTime() < now.getTime()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(sessionToken);
    throw new Error("Session expired.");
  }

  return {
    token: sessionToken,
    userId: session.user_id,
    expiresAt: session.expires_at,
  };
}
