import type { DatabaseSync } from "node:sqlite";

export const APPLET_SESSION_NOTE_ENTRY_MAX_CHARACTERS = 1_000;
export const APPLET_SESSION_NOTE_MAX_CHARACTERS = 20_000;

export type AppletSessionNoteSurface =
  | "coffee"
  | "signal"
  | "debate"
  | "story";

export interface AppletSessionNoteV1 {
  v: 1;
  surface: AppletSessionNoteSurface;
  sessionId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface AppletSessionNoteRow {
  surface: AppletSessionNoteSurface;
  session_id: string;
  body: string;
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

function mapRow(row: AppletSessionNoteRow): AppletSessionNoteV1 {
  return {
    v: 1,
    surface: row.surface,
    sessionId: row.session_id,
    body: row.body,
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
      `SELECT surface, session_id, body, created_at, updated_at
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
  db.prepare(
    `INSERT INTO applet_session_notes
       (user_id, surface, session_id, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, surface, session_id) DO UPDATE SET
       body = excluded.body,
       updated_at = excluded.updated_at`,
  ).run(userId, surface, normalizedSessionId, normalizedBody, now, now);
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
  const saved = saveAppletSessionNote(
    db,
    userId,
    surface,
    sessionId,
    nextBody,
  );
  if (!saved) throw new Error("Session note could not be added.");
  return saved;
}
