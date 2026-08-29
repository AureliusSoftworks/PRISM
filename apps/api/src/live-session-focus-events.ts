import type { DatabaseSync } from "node:sqlite";

export type LiveSessionFocusSurface =
  | "chat"
  | "zen"
  | "coffee"
  | "signal"
  | "debate"
  | "story";

export type LiveSessionFocusTransition = "away" | "returned";

export interface LiveSessionFocusEventV1 {
  v: 1;
  surface: LiveSessionFocusSurface;
  sessionId: string;
  transition: LiveSessionFocusTransition;
  occurredAt: string;
}

export function readLiveSessionFocusSurface(
  value: unknown,
): LiveSessionFocusSurface | null {
  return value === "chat" ||
    value === "zen" ||
    value === "coffee" ||
    value === "signal" ||
    value === "debate" ||
    value === "story"
    ? value
    : null;
}

export function readLiveSessionFocusTransition(
  value: unknown,
): LiveSessionFocusTransition | null {
  return value === "away" || value === "returned" ? value : null;
}

export function liveSessionFocusBelongsToUser(
  db: DatabaseSync,
  userId: string,
  surface: LiveSessionFocusSurface,
  sessionId: string,
): boolean {
  const id = sessionId.trim();
  if (!id) return false;
  if (surface === "chat" || surface === "zen" || surface === "coffee") {
    const row = db.prepare(
      "SELECT conversation_mode FROM conversations WHERE id = ? AND user_id = ?",
    ).get(id, userId) as { conversation_mode?: string } | undefined;
    return row?.conversation_mode === surface;
  }
  const table = surface === "signal"
    ? "botcast_episodes"
    : surface === "debate"
      ? "debate_sessions"
      : "story_sessions";
  return Boolean(
    db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ?`).get(id, userId),
  );
}

function normalizedOccurredAt(value: unknown): string {
  const ms = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
}

export function listLiveSessionFocusEvents(
  db: DatabaseSync,
  userId: string,
  surface: LiveSessionFocusSurface,
  sessionId: string,
): LiveSessionFocusEventV1[] {
  return (db.prepare(
    `SELECT surface, session_id, transition, occurred_at
       FROM live_session_focus_events
      WHERE user_id = ? AND surface = ? AND session_id = ?
      ORDER BY occurred_at, rowid`,
  ).all(userId, surface, sessionId.trim()) as Array<{
    surface: LiveSessionFocusSurface;
    session_id: string;
    transition: LiveSessionFocusTransition;
    occurred_at: string;
  }>).map((row) => ({
    v: 1,
    surface: row.surface,
    sessionId: row.session_id,
    transition: row.transition,
    occurredAt: row.occurred_at,
  }));
}

/** Records only PRISM foreground state. The caller must never provide app/window identity. */
export function recordLiveSessionFocusEvent(
  db: DatabaseSync,
  userId: string,
  surface: LiveSessionFocusSurface,
  sessionId: string,
  transition: LiveSessionFocusTransition,
  occurredAt?: unknown,
): { event: LiveSessionFocusEventV1 | null; recorded: boolean } {
  const id = sessionId.trim();
  const previous = db.prepare(
    `SELECT transition FROM live_session_focus_events
      WHERE user_id = ? AND surface = ? AND session_id = ?
      ORDER BY occurred_at DESC, rowid DESC LIMIT 1`,
  ).get(userId, surface, id) as { transition?: LiveSessionFocusTransition } | undefined;
  if (previous?.transition === transition) return { event: null, recorded: false };
  const event: LiveSessionFocusEventV1 = {
    v: 1,
    surface,
    sessionId: id,
    transition,
    occurredAt: normalizedOccurredAt(occurredAt),
  };
  db.prepare(
    `INSERT INTO live_session_focus_events
       (user_id, surface, session_id, transition, occurred_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, surface, id, transition, event.occurredAt);
  return { event, recorded: true };
}
