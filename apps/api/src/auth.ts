import type { IncomingHttpHeaders } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { parseCookies } from "./utils.http.ts";

export interface ResolvedSession {
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
