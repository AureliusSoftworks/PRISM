import type { DatabaseSync } from "node:sqlite";
import type { PrismJsonObject, PrismJsonValue } from "@localai/shared";
import {
  createSlateProject,
  deleteSlateProject,
  getSlateProject,
  updateSlateProject,
} from "./slate.ts";

const SLATE_ROOT_PATCH_KEYS = new Set([
  "title",
  "spark",
  "sparkWildcards",
  "premise",
  "voice",
  "direction",
  "phase",
  "proseMode",
  "proseModel",
  "proseProvider",
  "deliberationConfig",
  "nonNegotiables",
  "characters",
  "unresolvedThreads",
  "manuscript",
  "lockedRanges",
]);

export interface PrismSlateProjectMutation {
  before: PrismJsonObject | null;
  projectId: string;
  title: string;
  previousRevision: string | null;
  appliedRevision: string;
}

function projectRow(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): Record<string, unknown> {
  const row = db
    .prepare(
      "SELECT * FROM slate_projects WHERE id = ? AND user_id = ?",
    )
    .get(projectId, userId) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Slate project not found.");
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
      throw new Error(`Slate project ${key} cannot be journaled.`);
    }),
  ) as PrismJsonObject;
}

function stringField(row: PrismJsonObject, key: string): string {
  const value: PrismJsonValue | undefined = row[key];
  if (typeof value !== "string") {
    throw new Error(`Slate project ${key} is invalid.`);
  }
  return value;
}

function sqlPrimitive(
  value: PrismJsonValue | undefined,
): string | number | null {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value ?? null;
  }
  throw new Error("Slate project undo data is invalid.");
}

export function validatePrismSlateRootPatch(
  raw: unknown,
): PrismJsonObject {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("A Slate project patch is required.");
  }
  const patch = raw as PrismJsonObject;
  const keys = Object.keys(patch);
  if (
    keys.length === 0 ||
    keys.some((key) => !SLATE_ROOT_PATCH_KEYS.has(key))
  ) {
    throw new Error(
      "That Slate project field is not available through this capability.",
    );
  }
  return patch;
}

export function prismSlatePatchIsRootOnly(
  raw: Record<string, unknown>,
): boolean {
  const keys = Object.keys(raw);
  return (
    keys.length > 0 &&
    keys.every((key) => SLATE_ROOT_PATCH_KEYS.has(key))
  );
}

export function previewPrismSlateProject(args: {
  db: DatabaseSync;
  userId: string;
  projectId: string;
  expectedRevision?: string | null;
}): {
  projectId: string;
  title: string;
  revision: string;
  before: PrismJsonObject;
} {
  const before = jsonRow(projectRow(args.db, args.userId, args.projectId));
  const revision = stringField(before, "updated_at");
  if (args.expectedRevision && revision !== args.expectedRevision) {
    throw new Error("The Slate project changed before this action.");
  }
  return {
    projectId: stringField(before, "id"),
    title: stringField(before, "title"),
    revision,
    before,
  };
}

export function applyPrismSlateProjectPatch(args: {
  db: DatabaseSync;
  userId: string;
  projectId: string;
  patch: PrismJsonObject;
  expectedRevision?: string | null;
}): PrismSlateProjectMutation {
  const preview = previewPrismSlateProject(args);
  const project = updateSlateProject(
    args.db,
    args.userId,
    args.projectId,
    validatePrismSlateRootPatch(args.patch),
  );
  return {
    before: preview.before,
    projectId: project.id,
    title: project.title,
    previousRevision: preview.revision,
    appliedRevision: project.updatedAt,
  };
}

export function createPrismSlateProject(args: {
  db: DatabaseSync;
  userId: string;
  input: PrismJsonObject;
}): PrismSlateProjectMutation {
  const project = createSlateProject(args.db, args.userId, {
    title: args.input.title,
    titleOrigin: args.input.titleOrigin,
    spark: args.input.spark,
    sparkWildcards: args.input.sparkWildcards,
    seriesId: args.input.seriesId,
  });
  return {
    before: null,
    projectId: project.id,
    title: project.title,
    previousRevision: null,
    appliedRevision: project.updatedAt,
  };
}

export function undoPrismSlateProjectPatch(args: {
  db: DatabaseSync;
  userId: string;
  before: PrismJsonObject;
  expectedRevision: string;
}): void {
  const projectId = stringField(args.before, "id");
  if (stringField(args.before, "user_id") !== args.userId) {
    throw new Error("Slate undo data belongs to another account.");
  }
  const current = projectRow(args.db, args.userId, projectId);
  if (String(current.updated_at) !== args.expectedRevision) {
    throw new Error(
      "The Slate project changed after this action and cannot be undone.",
    );
  }
  const columns = Object.keys(args.before).filter(
    (column) => column !== "id" && column !== "user_id",
  );
  args.db.prepare(
    `UPDATE slate_projects
        SET ${columns.map((column) => `${column} = ?`).join(", ")}
      WHERE id = ? AND user_id = ?`,
  ).run(
    ...columns.map((column) => sqlPrimitive(args.before[column])),
    projectId,
    args.userId,
  );
}

export function undoPrismSlateProjectCreate(args: {
  db: DatabaseSync;
  userId: string;
  projectId: string;
  expectedRevision: string;
}): void {
  const current = projectRow(args.db, args.userId, args.projectId);
  if (String(current.updated_at) !== args.expectedRevision) {
    throw new Error(
      "The new Slate project changed and cannot be removed by undo.",
    );
  }
  deleteSlateProject(args.db, args.userId, args.projectId);
}

export function readPrismSlateProject(
  db: DatabaseSync,
  userId: string,
  projectId: string,
) {
  return getSlateProject(db, userId, projectId);
}
