import type { DatabaseSync } from "node:sqlite";
import {
  chooseStorySessionChoice,
  deleteStorySession,
  getStorySessionDetail,
  pickupStorySessionItem,
  travelStorySession,
} from "./story.ts";
import type { PrismJsonObject, PrismJsonValue } from "@localai/shared";

export type PrismStoryAdvanceKind = "choice" | "travel" | "item";

export interface PrismStoryMutation {
  before: PrismJsonObject;
  after: PrismJsonObject | null;
  sessionId: string;
  title: string;
  previousRevision: string;
  appliedRevision: string | null;
}

function storyRow(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): Record<string, unknown> {
  const row = db
    .prepare(
      "SELECT * FROM story_sessions WHERE id = ? AND user_id = ?",
    )
    .get(sessionId, userId) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Story session not found.");
  return row;
}

function jsonRow(row: Record<string, unknown>): PrismJsonObject {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number"
      ) {
        return [key, value];
      }
      throw new Error(`Story session ${key} cannot be journaled.`);
    }),
  ) as PrismJsonObject;
}

function stringField(row: PrismJsonObject, key: string): string {
  const value: PrismJsonValue | undefined = row[key];
  if (typeof value !== "string") {
    throw new Error(`Story session ${key} is invalid.`);
  }
  return value;
}

function sqlValues(row: PrismJsonObject): Array<string | number | null> {
  return Object.values(row).map((value) => {
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number"
    ) {
      return value ?? null;
    }
    throw new Error("Story session undo data is invalid.");
  });
}

function restoreStoryRow(
  db: DatabaseSync,
  userId: string,
  snapshot: PrismJsonObject,
  expectedRevision: string | null,
): void {
  const sessionId = stringField(snapshot, "id");
  if (stringField(snapshot, "user_id") !== userId) {
    throw new Error("Story session undo data belongs to another account.");
  }
  const current = db
    .prepare(
      "SELECT updated_at FROM story_sessions WHERE id = ? AND user_id = ?",
    )
    .get(sessionId, userId) as { updated_at: string } | undefined;
  if (expectedRevision === null) {
    if (current) {
      throw new Error("A Story session now occupies this restore target.");
    }
    const columns = Object.keys(snapshot);
    if (
      columns.length === 0 ||
      columns.some((column) => !/^[a-z][a-z0-9_]*$/u.test(column))
    ) {
      throw new Error("Story session undo data is invalid.");
    }
    db.prepare(
      `INSERT INTO story_sessions (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
    ).run(...sqlValues(snapshot));
    return;
  }
  if (!current || current.updated_at !== expectedRevision) {
    throw new Error(
      "The Story session changed after this action and cannot be undone.",
    );
  }
  const columns = Object.keys(snapshot).filter(
    (column) => column !== "id" && column !== "user_id",
  );
  db.prepare(
    `UPDATE story_sessions
        SET ${columns.map((column) => `${column} = ?`).join(", ")}
      WHERE id = ? AND user_id = ?`,
  ).run(
    ...columns.map((column) => sqlValues({ value: snapshot[column] })[0]),
    sessionId,
    userId,
  );
}

export function previewPrismStorySession(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  expectedRevision?: string | null;
}): {
  sessionId: string;
  title: string;
  revision: string;
  status: string;
} {
  const row = jsonRow(storyRow(args.db, args.userId, args.sessionId));
  const revision = stringField(row, "updated_at");
  if (args.expectedRevision && args.expectedRevision !== revision) {
    throw new Error("The Story session changed before this action.");
  }
  return {
    sessionId: stringField(row, "id"),
    title: stringField(row, "title"),
    revision,
    status: stringField(row, "status"),
  };
}

export function advancePrismStorySession(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  kind: PrismStoryAdvanceKind;
  targetId: string;
  expectedRevision?: string | null;
}): PrismStoryMutation {
  const preview = previewPrismStorySession(args);
  const before = jsonRow(storyRow(args.db, args.userId, args.sessionId));
  if (args.kind === "choice") {
    chooseStorySessionChoice(
      args.db,
      args.userId,
      args.sessionId,
      args.targetId,
    );
  } else if (args.kind === "travel") {
    travelStorySession(args.db, args.userId, args.sessionId, args.targetId);
  } else {
    pickupStorySessionItem(
      args.db,
      args.userId,
      args.sessionId,
      args.targetId,
    );
  }
  const after = jsonRow(storyRow(args.db, args.userId, args.sessionId));
  return {
    before,
    after,
    sessionId: args.sessionId,
    title: preview.title,
    previousRevision: preview.revision,
    appliedRevision: stringField(after, "updated_at"),
  };
}

export function deletePrismStorySession(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  expectedRevision?: string | null;
}): PrismStoryMutation {
  const preview = previewPrismStorySession(args);
  const before = jsonRow(storyRow(args.db, args.userId, args.sessionId));
  if (!deleteStorySession(args.db, args.userId, args.sessionId)) {
    throw new Error("Story session not found.");
  }
  return {
    before,
    after: null,
    sessionId: args.sessionId,
    title: preview.title,
    previousRevision: preview.revision,
    appliedRevision: null,
  };
}

export function undoPrismStorySession(args: {
  db: DatabaseSync;
  userId: string;
  before: PrismJsonObject;
  expectedRevision: string | null;
}): void {
  restoreStoryRow(
    args.db,
    args.userId,
    args.before,
    args.expectedRevision,
  );
}

export function readPrismStorySession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
) {
  return getStorySessionDetail(db, userId, sessionId);
}
