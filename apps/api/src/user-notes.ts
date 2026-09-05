import type { DatabaseSync } from "node:sqlite";
import {
  USER_NOTE_BODY_MAX,
  USER_NOTE_TITLE_MAX,
  type UserNotesPayload,
  type UserNotesReceiptItem,
  type UserNotesRequestPayload,
} from "@localai/shared";
import { decryptJson, encryptJson, randomId } from "./security.ts";

export class UserNoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserNoteValidationError";
  }
}

export class UserNoteNotFoundError extends Error {
  constructor(message = "Note not found.") {
    super(message);
    this.name = "UserNoteNotFoundError";
  }
}

export interface UserNoteRecord {
  id: string;
  userId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface UserNoteRow {
  id: string;
  user_id: string;
  title: string;
  ciphertext: string;
  iv: string;
  tag: string;
  created_at: string;
  updated_at: string;
}

/// Ensure the personal notes table exists (safe on every DB open).
export function ensureUserNotesSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS main.idx_user_notes_user_updated
      ON user_notes (user_id, updated_at DESC);
  `);
}

function normalizeTitle(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, USER_NOTE_TITLE_MAX);
}

function normalizeBody(value: string | undefined): string {
  return (value ?? "").trim().slice(0, USER_NOTE_BODY_MAX);
}

function decryptBody(row: UserNoteRow, userKey: Buffer): string {
  const payload = decryptJson(
    { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag },
    userKey
  );
  const body = typeof payload.body === "string" ? payload.body : "";
  return normalizeBody(body);
}

function mapRow(row: UserNoteRow, userKey: Buffer): UserNoteRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: decryptBody(row, userKey),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function selectNoteById(
  db: DatabaseSync,
  userId: string,
  noteId: string
): UserNoteRow | undefined {
  return db
    .prepare(
      `SELECT id, user_id, title, ciphertext, iv, tag, created_at, updated_at
       FROM user_notes WHERE user_id = ? AND id = ? LIMIT 1`
    )
    .get(userId, noteId) as unknown as UserNoteRow | undefined;
}

function selectNoteByTitle(
  db: DatabaseSync,
  userId: string,
  title: string
): UserNoteRow | undefined {
  const normalized = normalizeTitle(title);
  if (!normalized) return undefined;
  // Case-insensitive exact title match among the user's notes.
  return db
    .prepare(
      `SELECT id, user_id, title, ciphertext, iv, tag, created_at, updated_at
       FROM user_notes
       WHERE user_id = ? AND lower(title) = lower(?)
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get(userId, normalized) as unknown as UserNoteRow | undefined;
}

/// List note titles (bodies decrypted) newest-first for the account.
export function listUserNotes(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  limit = 50
): UserNoteRecord[] {
  const capped = Math.max(1, Math.min(100, Math.round(limit)));
  const rows = db
    .prepare(
      `SELECT id, user_id, title, ciphertext, iv, tag, created_at, updated_at
       FROM user_notes
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(userId, capped) as unknown as UserNoteRow[];
  return rows.map((row) => mapRow(row, userKey));
}

/// Titles-only hint for Chat system prompt assembly (no bodies).
export function listUserNoteTitles(
  db: DatabaseSync,
  userId: string,
  limit = 24
): UserNotesReceiptItem[] {
  const capped = Math.max(1, Math.min(50, Math.round(limit)));
  const rows = db
    .prepare(
      `SELECT id, title FROM user_notes
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(userId, capped) as unknown as Array<{ id: string; title: string }>;
  return rows
    .map((row) => ({
      id: row.id,
      title: normalizeTitle(row.title) || "Untitled",
    }))
    .filter((row) => row.id.length > 0);
}

export function getUserNote(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  args: { id?: string; title?: string }
): UserNoteRecord {
  const row = args.id
    ? selectNoteById(db, userId, args.id.trim())
    : args.title
      ? selectNoteByTitle(db, userId, args.title)
      : undefined;
  if (!row) throw new UserNoteNotFoundError();
  return mapRow(row, userKey);
}

export function saveUserNote(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  args: { id?: string; title?: string; body?: string }
): { note: UserNoteRecord; created: boolean } {
  const now = new Date().toISOString();
  const id = args.id?.trim() ?? "";

  if (id) {
    const existing = selectNoteById(db, userId, id);
    if (!existing) throw new UserNoteNotFoundError();
    if (args.title !== undefined) {
      const rawTitle = args.title.replace(/\s+/g, " ").trim();
      if (rawTitle.length > USER_NOTE_TITLE_MAX) {
        throw new UserNoteValidationError(
          `Note title must be ${USER_NOTE_TITLE_MAX} characters or fewer.`
        );
      }
    }
    if (args.body !== undefined) {
      const rawBody = args.body.trim();
      if (rawBody.length > USER_NOTE_BODY_MAX) {
        throw new UserNoteValidationError(
          `Note body must be ${USER_NOTE_BODY_MAX} characters or fewer.`
        );
      }
    }
    const nextTitle = args.title !== undefined ? normalizeTitle(args.title) : existing.title;
    const nextBody =
      args.body !== undefined ? normalizeBody(args.body) : decryptBody(existing, userKey);
    if (!nextTitle) {
      throw new UserNoteValidationError("Note title is required.");
    }
    const encrypted = encryptJson({ body: nextBody }, userKey);
    db.prepare(
      `UPDATE user_notes
       SET title = ?, ciphertext = ?, iv = ?, tag = ?, updated_at = ?
       WHERE user_id = ? AND id = ?`
    ).run(
      nextTitle,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      now,
      userId,
      id
    );
    const updated = selectNoteById(db, userId, id);
    if (!updated) throw new UserNoteNotFoundError();
    return { note: mapRow(updated, userKey), created: false };
  }

  const rawTitle = (args.title ?? "").replace(/\s+/g, " ").trim();
  const rawBody = (args.body ?? "").trim();
  if (!rawTitle) throw new UserNoteValidationError("Note title is required.");
  if (!rawBody) throw new UserNoteValidationError("Note body is required.");
  if (rawTitle.length > USER_NOTE_TITLE_MAX) {
    throw new UserNoteValidationError(
      `Note title must be ${USER_NOTE_TITLE_MAX} characters or fewer.`
    );
  }
  if (rawBody.length > USER_NOTE_BODY_MAX) {
    throw new UserNoteValidationError(
      `Note body must be ${USER_NOTE_BODY_MAX} characters or fewer.`
    );
  }
  const title = normalizeTitle(rawTitle);
  const body = normalizeBody(rawBody);

  const noteId = randomId();
  const encrypted = encryptJson({ body }, userKey);
  db.prepare(
    `INSERT INTO user_notes
      (id, user_id, title, ciphertext, iv, tag, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    noteId,
    userId,
    title,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    now,
    now
  );
  const created = selectNoteById(db, userId, noteId);
  if (!created) {
    throw new Error("Failed to create user note.");
  }
  return { note: mapRow(created, userKey), created: true };
}

export function deleteUserNote(
  db: DatabaseSync,
  userId: string,
  args: { id?: string; title?: string }
): { id: string; title: string } {
  const row = args.id
    ? selectNoteById(db, userId, args.id.trim())
    : args.title
      ? selectNoteByTitle(db, userId, args.title)
      : undefined;
  if (!row) throw new UserNoteNotFoundError();
  db.prepare(`DELETE FROM user_notes WHERE user_id = ? AND id = ?`).run(
    userId,
    row.id
  );
  return { id: row.id, title: row.title || "Untitled" };
}

/// Execute a normalized Prism `userNotes` request and return a privacy-safe receipt.
export function executeUserNotesRequest(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  request: UserNotesRequestPayload
): {
  receipt: UserNotesPayload;
  /** Full notes for list/get second model pass (never persisted on tool_payload). */
  notesForModel?: UserNoteRecord[];
} {
  const at = new Date().toISOString();
  try {
    if (request.action === "save") {
      const { note, created } = saveUserNote(db, userId, userKey, {
        id: request.id,
        title: request.title,
        body: request.body,
      });
      return {
        receipt: {
          v: 1,
          name: "userNotes",
          action: "save",
          status: created ? "saved" : "updated",
          at,
          id: note.id,
          title: note.title,
        },
      };
    }
    if (request.action === "list") {
      const notes = listUserNotes(db, userId, userKey);
      return {
        receipt: {
          v: 1,
          name: "userNotes",
          action: "list",
          status: "listed",
          at,
          noteCount: notes.length,
          notes: notes.map((note) => ({ id: note.id, title: note.title })),
        },
        notesForModel: notes,
      };
    }
    if (request.action === "get") {
      const note = getUserNote(db, userId, userKey, {
        id: request.id,
        title: request.title,
      });
      return {
        receipt: {
          v: 1,
          name: "userNotes",
          action: "get",
          status: "retrieved",
          at,
          id: note.id,
          title: note.title,
          noteCount: 1,
          notes: [{ id: note.id, title: note.title }],
        },
        notesForModel: [note],
      };
    }
    // delete
    const deleted = deleteUserNote(db, userId, {
      id: request.id,
      title: request.title,
    });
    return {
      receipt: {
        v: 1,
        name: "userNotes",
        action: "delete",
        status: "deleted",
        at,
        id: deleted.id,
        title: deleted.title,
      },
    };
  } catch (error) {
    const message =
      error instanceof UserNoteValidationError || error instanceof UserNoteNotFoundError
        ? error.message
        : "Could not complete the note action.";
    return {
      receipt: {
        v: 1,
        name: "userNotes",
        action: request.action,
        status: "error",
        at,
        ...(request.id ? { id: request.id } : {}),
        ...(request.title ? { title: normalizeTitle(request.title) } : {}),
        error: message,
      },
    };
  }
}

/// Format note bodies for a private second-pass system message (list/get).
export function formatUserNotesForModel(notes: UserNoteRecord[]): string {
  if (notes.length === 0) {
    return "User notes result: no notes on file.";
  }
  const lines = notes.map((note, index) => {
    const body = note.body.trim() || "(empty)";
    return `${index + 1}. [${note.id}] ${note.title}\n${body}`;
  });
  return `User notes result (${notes.length}):\n\n${lines.join("\n\n")}`;
}

/// Compact titles-only prompt hint for Chat system assembly.
export function formatUserNoteTitlesHint(titles: UserNotesReceiptItem[]): string {
  if (titles.length === 0) return "";
  const joined = titles.map((item) => item.title).join("; ");
  return `User notes on file (${titles.length}): ${joined}. Use the userNotes tool to read or change them; never invent note ids.`;
}
