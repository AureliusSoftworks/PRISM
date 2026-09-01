import type { DatabaseSync } from "node:sqlite";

export const APPLET_SESSION_NOTE_ENTRY_MAX_CHARACTERS = 1_000;
export const APPLET_SESSION_NOTE_MAX_CHARACTERS = 20_000;

export type AppletSessionNoteSurface =
  | "coffee"
  | "signal"
  | "debate"
  | "story";

export interface AppletSessionNoteCaptureV1 {
  body: string;
  startedAt: string;
  fps?: number;
  committedAt: string;
}

export interface AppletSessionNoteV1 {
  v: 1;
  surface: AppletSessionNoteSurface;
  sessionId: string;
  body: string;
  captures: AppletSessionNoteCaptureV1[];
  createdAt: string;
  updatedAt: string;
}

interface AppletSessionNoteRow {
  surface: AppletSessionNoteSurface;
  session_id: string;
  body: string;
  captures_json: string;
  created_at: string;
  updated_at: string;
}

export function readAppletSessionNoteSurface(
  value: unknown,
): AppletSessionNoteSurface | null {
  return value === "coffee" ||
    value === "signal" ||
    value === "debate" ||
    value === "story"
    ? value
    : null;
}

function sourceTable(surface: AppletSessionNoteSurface): string {
  if (surface === "coffee") return "conversations";
  if (surface === "signal") return "botcast_episodes";
  if (surface === "debate") return "debate_sessions";
  return "story_sessions";
}

export function appletSessionBelongsToUser(
  db: DatabaseSync,
  userId: string,
  surface: AppletSessionNoteSurface,
  sessionId: string,
): boolean {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) return false;
  const table = sourceTable(surface);
  const row = db
    .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ? LIMIT 1`)
    .get(normalizedSessionId, userId);
  if (!row) return false;
  if (surface !== "coffee") return true;
  const coffee = db
    .prepare(
      "SELECT 1 FROM conversations WHERE id = ? AND user_id = ? AND conversation_mode = 'coffee' LIMIT 1",
    )
    .get(normalizedSessionId, userId);
  return Boolean(coffee);
}

function readCaptureTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString();
}

function readAppletSessionNoteCaptures(value: string): AppletSessionNoteCaptureV1[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        return [];
      }
      const record = candidate as Record<string, unknown>;
      const body =
        typeof record.body === "string"
          ? sentenceCaseAppletSessionNoteEntry(record.body)
          : "";
      const startedAt = readCaptureTimestamp(record.startedAt);
      const committedAt = readCaptureTimestamp(record.committedAt);
      const fps =
        typeof record.fps === "number" &&
        Number.isFinite(record.fps) &&
        record.fps >= 1 &&
        record.fps <= 240
          ? Math.round(record.fps)
          : undefined;
      return body && startedAt && committedAt
        ? [{ body, startedAt, ...(fps === undefined ? {} : { fps }), committedAt }]
        : [];
    }).slice(-400);
  } catch {
    return [];
  }
}

function mapRow(row: AppletSessionNoteRow): AppletSessionNoteV1 {
  return {
    v: 1,
    surface: row.surface,
    sessionId: row.session_id,
    body: row.body,
    captures: readAppletSessionNoteCaptures(row.captures_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stripAppletSessionNoteListMarker(value: string): string {
  return value.replace(/^(?:[-*+•]\s+|\d+[.)]\s+)/u, "").trim();
}

export function sentenceCaseAppletSessionNoteEntry(value: string): string {
  let normalized = stripAppletSessionNoteListMarker(
    value.trim().replace(/\s+/gu, " "),
  );
  if (!normalized) return "";
  normalized = normalized.replace(/\p{L}/u, (letter) =>
    letter.toLocaleUpperCase(),
  );
  normalized = normalized.replace(
    /([.!?…]\s+["'“‘(]*)(\p{L})/gu,
    (_match, boundary: string, letter: string) =>
      `${boundary}${letter.toLocaleUpperCase()}`,
  );
  if (
    normalized.length < APPLET_SESSION_NOTE_ENTRY_MAX_CHARACTERS &&
    !/[.!?…]["'”’)}\]]*$/u.test(normalized)
  ) {
    normalized = `${normalized}.`;
  }
  return normalized;
}

function appletSessionNoteEntries(body: string): string[] {
  const lines = body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const alreadyCollected = lines.every((line) =>
    /^(?:[-*+•]\s+|\d+[.)]\s+)/u.test(line),
  );
  return alreadyCollected ? lines : [body];
}

function comparableAppletSessionNoteTokens(value: string): string[] {
  return (
    value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function appletSessionNoteTokenSequenceStarts(
  haystack: string[],
  needle: string[],
): number[] {
  if (needle.length === 0 || needle.length > haystack.length) return [];
  const starts: number[] = [];
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) {
      starts.push(start);
    }
  }
  return starts;
}

function collapseRedundantAppletSessionNoteEntries(
  entries: string[],
): string[] {
  const tokenized = entries.map(comparableAppletSessionNoteTokens);
  const redundant = new Set<number>();

  tokenized.forEach((tokens, index) => {
    if (
      tokens.length > 0 &&
      tokenized.some(
        (candidate, candidateIndex) =>
          candidateIndex < index &&
          candidate.length === tokens.length &&
          candidate.every((token, offset) => token === tokens[offset]),
      )
    ) {
      redundant.add(index);
    }
  });

  tokenized.forEach((candidate, candidateIndex) => {
    if (candidate.length === 0) return;
    const coverage = candidate.map(() => false);
    const containedEntries: number[] = [];

    tokenized.forEach((tokens, index) => {
      if (
        index === candidateIndex ||
        redundant.has(index) ||
        tokens.length === 0 ||
        tokens.length >= candidate.length
      ) {
        return;
      }
      const starts = appletSessionNoteTokenSequenceStarts(candidate, tokens);
      if (starts.length === 0) return;
      containedEntries.push(index);
      starts.forEach((start) => {
        for (let offset = 0; offset < tokens.length; offset += 1) {
          coverage[start + offset] = true;
        }
      });
    });

    if (containedEntries.length >= 2 && coverage.every(Boolean)) {
      containedEntries.forEach((index) => redundant.add(index));
    }
  });

  return entries.filter((_entry, index) => !redundant.has(index));
}

export function formatAppletSessionNoteCollectionBody(body: string): string {
  return collapseRedundantAppletSessionNoteEntries(
    appletSessionNoteEntries(body)
      .map(sentenceCaseAppletSessionNoteEntry)
      .filter(Boolean),
  )
    .map((entry) => `- ${entry}`)
    .join("\n");
}

export function getAppletSessionNote(
  db: DatabaseSync,
  userId: string,
  surface: AppletSessionNoteSurface,
  sessionId: string,
): AppletSessionNoteV1 | null {
  const row = db
    .prepare(
      `SELECT surface, session_id, body, captures_json, created_at, updated_at
         FROM applet_session_notes
        WHERE user_id = ? AND surface = ? AND session_id = ?
        LIMIT 1`,
    )
    .get(userId, surface, sessionId.trim()) as
    | AppletSessionNoteRow
    | undefined;
  return row ? mapRow(row) : null;
}

export function saveAppletSessionNote(
  db: DatabaseSync,
  userId: string,
  surface: AppletSessionNoteSurface,
  sessionId: string,
  body: string,
): AppletSessionNoteV1 | null {
  const normalizedSessionId = sessionId.trim();
  const normalizedBody = body.trim();
  if (normalizedBody.length > APPLET_SESSION_NOTE_MAX_CHARACTERS) {
    throw new Error(
      `Session notes must be ${APPLET_SESSION_NOTE_MAX_CHARACTERS} characters or fewer.`,
    );
  }
  if (!normalizedBody) {
    db.prepare(
      `DELETE FROM applet_session_notes
        WHERE user_id = ? AND surface = ? AND session_id = ?`,
    ).run(userId, surface, normalizedSessionId);
    return null;
  }
  const now = new Date().toISOString();
  const updated = db.prepare(
    `UPDATE applet_session_notes
        SET body = ?, updated_at = ?
      WHERE user_id = ? AND surface = ? AND session_id = ?`,
  ).run(normalizedBody, now, userId, surface, normalizedSessionId);
  if (Number(updated.changes) === 0) {
    db.prepare(
      `INSERT INTO applet_session_notes
       (user_id, surface, session_id, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userId, surface, normalizedSessionId, normalizedBody, now, now);
  }
  return getAppletSessionNote(
    db,
    userId,
    surface,
    normalizedSessionId,
  );
}

export function appendAppletSessionNote(
  db: DatabaseSync,
  userId: string,
  surface: AppletSessionNoteSurface,
  sessionId: string,
  entry: string,
  startedAt?: string | null,
  fps?: number | null,
): AppletSessionNoteV1 {
  const normalizedEntry = sentenceCaseAppletSessionNoteEntry(entry);
  if (!normalizedEntry) {
    throw new Error("Write a note before adding it.");
  }
  if (normalizedEntry.length > APPLET_SESSION_NOTE_ENTRY_MAX_CHARACTERS) {
    throw new Error(
      `Each session note must be ${APPLET_SESSION_NOTE_ENTRY_MAX_CHARACTERS} characters or fewer.`,
    );
  }
  const existing = getAppletSessionNote(db, userId, surface, sessionId);
  const collected = formatAppletSessionNoteCollectionBody(existing?.body ?? "");
  const nextBody = formatAppletSessionNoteCollectionBody(
    collected ? `${collected}\n- ${normalizedEntry}` : `- ${normalizedEntry}`,
  );
  if (nextBody.length > APPLET_SESSION_NOTE_MAX_CHARACTERS) {
    throw new Error(
      `Session notes must be ${APPLET_SESSION_NOTE_MAX_CHARACTERS} characters or fewer.`,
    );
  }
  const committedAt = new Date().toISOString();
  const normalizedStartedAt = readCaptureTimestamp(startedAt) ?? committedAt;
  const capture: AppletSessionNoteCaptureV1 = {
    body: normalizedEntry,
    startedAt:
      Date.parse(normalizedStartedAt) > Date.parse(committedAt) + 60_000
        ? committedAt
        : normalizedStartedAt,
    ...(typeof fps === "number" && Number.isFinite(fps) && fps >= 1 && fps <= 240
      ? { fps: Math.round(fps) }
      : {}),
    committedAt,
  };
  const captures = [...(existing?.captures ?? []), capture].slice(-400);
  const now = committedAt;
  const updated = db.prepare(
    `UPDATE applet_session_notes
        SET body = ?, captures_json = ?, updated_at = ?
      WHERE user_id = ? AND surface = ? AND session_id = ?`,
  ).run(
    nextBody,
    JSON.stringify(captures),
    now,
    userId,
    surface,
    sessionId.trim(),
  );
  if (Number(updated.changes) === 0) {
    db.prepare(
      `INSERT INTO applet_session_notes
       (user_id, surface, session_id, body, captures_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      surface,
      sessionId.trim(),
      nextBody,
      JSON.stringify(captures),
      now,
      now,
    );
  }
  const saved = getAppletSessionNote(db, userId, surface, sessionId);
  if (!saved) throw new Error("Session note could not be added.");
  return saved;
}
