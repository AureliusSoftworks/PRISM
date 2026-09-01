import type { DatabaseSync, StatementSync } from "node:sqlite";

export const OWNER_SCOPED_NOT_FOUND_MESSAGE = "Account content not found.";

const SQLITE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

function quoteIdentifier(identifier: string): string {
  if (!SQLITE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new TypeError("Owner-first repository identifiers must be static SQL identifiers.");
  }
  return `"${identifier}"`;
}

function authenticatedOwnerId(userId: string): string {
  const normalized = typeof userId === "string" ? userId.trim() : "";
  if (!normalized) {
    throw new TypeError("An authenticated owner id is required.");
  }
  return normalized;
}

function stableRowId(rowId: string): string {
  const normalized = typeof rowId === "string" ? rowId.trim() : "";
  if (!normalized) throw new OwnerScopedNotFoundError();
  return normalized;
}

/**
 * Deliberately generic. Callers must not distinguish a missing id from an id
 * owned by another account, including in HTTP status text or logs.
 */
export class OwnerScopedNotFoundError extends Error {
  readonly code = "owner_scoped_not_found";

  constructor() {
    super(OWNER_SCOPED_NOT_FOUND_MESSAGE);
    this.name = "OwnerScopedNotFoundError";
  }
}

export interface OwnerFirstRepositorySpec {
  table: string;
  idColumn?: string;
  ownerColumn?: string;
  columns?: readonly string[];
}

export interface OwnerFirstRepository<Row extends Record<string, unknown>> {
  findById(userId: string, rowId: string): Row | undefined;
  requireById(userId: string, rowId: string): Row;
  findManyById(userId: string, rowIds: readonly string[]): Row[];
  deleteById(userId: string, rowId: string): boolean;
}

/**
 * Creates a repository whose first predicate and first bound value are always
 * the authenticated owner. No row is returned for parse/decrypt/use until the
 * owner and stable id match in the same SQLite statement.
 *
 * Table/column names are construction-time constants and are validated here;
 * request data can only enter through bound values.
 */
export function createOwnerFirstRepository<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(db: DatabaseSync, spec: OwnerFirstRepositorySpec): OwnerFirstRepository<Row> {
  const table = quoteIdentifier(spec.table);
  const idColumn = quoteIdentifier(spec.idColumn ?? "id");
  const ownerColumn = quoteIdentifier(spec.ownerColumn ?? "user_id");
  const selectedColumns =
    spec.columns && spec.columns.length > 0
      ? spec.columns.map(quoteIdentifier).join(", ")
      : "*";
  const selectOne = db.prepare(
    `SELECT ${selectedColumns} FROM ${table} WHERE ${ownerColumn} = ? AND ${idColumn} = ? LIMIT 1`,
  ) as StatementSync;
  const removeOne = db.prepare(
    `DELETE FROM ${table} WHERE ${ownerColumn} = ? AND ${idColumn} = ?`,
  ) as StatementSync;

  return Object.freeze({
    findById(userId: string, rowId: string): Row | undefined {
      return selectOne.get(
        authenticatedOwnerId(userId),
        stableRowId(rowId),
      ) as Row | undefined;
    },

    requireById(userId: string, rowId: string): Row {
      const row = this.findById(userId, rowId);
      if (!row) throw new OwnerScopedNotFoundError();
      return row;
    },

    findManyById(userId: string, rowIds: readonly string[]): Row[] {
      const ownerId = authenticatedOwnerId(userId);
      const ids = Array.from(
        new Set(
          rowIds
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      );
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => "?").join(", ");
      return db
        .prepare(
          `SELECT ${selectedColumns} FROM ${table} WHERE ${ownerColumn} = ? AND ${idColumn} IN (${placeholders})`,
        )
        .all(ownerId, ...ids) as Row[];
    },

    deleteById(userId: string, rowId: string): boolean {
      const result = removeOne.run(
        authenticatedOwnerId(userId),
        stableRowId(rowId),
      );
      return Number(result.changes) === 1;
    },
  });
}
