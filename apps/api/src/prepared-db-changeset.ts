import {
  constants as sqliteConstants,
  DatabaseSync,
  type SQLInputValue,
  type Session,
} from "node:sqlite";

export interface PreparedDatabaseChangeset {
  changeset: Uint8Array;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/**
 * Builds a private, user-scoped copy of the tables a prepared turn may touch.
 * The SQLite session begins only after the baseline copy, so its changeset
 * contains no speculative reads or setup rows.
 */
export function createUserScopedPreparedDatabase(
  source: DatabaseSync,
  userId: string,
  tableNames: readonly string[],
): { db: DatabaseSync; session: Session } {
  const db = new DatabaseSync(":memory:");
  try {
    for (const tableName of tableNames) {
      const schema = source
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get(tableName) as { sql?: unknown } | undefined;
      if (typeof schema?.sql !== "string" || !schema.sql.trim()) {
        throw new Error(`Prepared-turn table ${tableName} is unavailable.`);
      }
      db.exec(schema.sql);

      const table = quoteIdentifier(tableName);
      const columns = source
        .prepare(`PRAGMA table_info(${table})`)
        .all() as Array<{ name?: unknown }>;
      const columnNames = columns
        .map((column) => column.name)
        .filter((name): name is string => typeof name === "string");
      if (!columnNames.includes("user_id")) {
        throw new Error(
          `Prepared-turn table ${tableName} must be scoped by user_id.`,
        );
      }
      if (columnNames.length === 0) continue;

      const quotedColumns = columnNames.map(quoteIdentifier).join(", ");
      const placeholders = columnNames.map(() => "?").join(", ");
      const rows = source
        .prepare(`SELECT ${quotedColumns} FROM ${table} WHERE user_id = ?`)
        .all(userId) as Array<Record<string, SQLInputValue>>;
      const insert = db.prepare(
        `INSERT INTO ${table} (${quotedColumns}) VALUES (${placeholders})`,
      );
      for (const row of rows) {
        insert.run(...columnNames.map((columnName) => row[columnName] ?? null));
      }
    }
    return { db, session: db.createSession() };
  } catch (error) {
    db.close();
    throw error;
  }
}

export function capturePreparedDatabaseChangeset(
  db: DatabaseSync,
  session: Session,
): PreparedDatabaseChangeset {
  try {
    return { changeset: new Uint8Array(session.changeset()) };
  } finally {
    session.close();
    db.close();
  }
}

/** Applies the complete prepared mutation or none of it. */
export function applyPreparedDatabaseChangeset(
  target: DatabaseSync,
  prepared: PreparedDatabaseChangeset,
): void {
  if (prepared.changeset.byteLength === 0) return;
  target.exec("BEGIN IMMEDIATE");
  try {
    const applied = target.applyChangeset(prepared.changeset, {
      onConflict: () => sqliteConstants.SQLITE_CHANGESET_ABORT,
    });
    if (!applied) throw new Error("The prepared turn conflicted with live state.");
    target.exec("COMMIT");
  } catch (error) {
    target.exec("ROLLBACK");
    throw error;
  }
}
