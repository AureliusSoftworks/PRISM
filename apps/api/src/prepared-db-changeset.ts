import {
  constants as sqliteConstants,
  DatabaseSync,
  type SQLInputValue,
  type Session,
} from "node:sqlite";

export interface PreparedDatabaseChangeset {
  changeset: Uint8Array;
}

/**
 * A table a prepared turn may touch. Naming the table alone copies the user's
 * rows; `copyRows: false` recreates the empty table so read queries resolve
 * without paying to clone contents the turn never reads (large audio blobs).
 */
export type PreparedDatabaseTable =
  | string
  | { name: string; copyRows: false };

function preparedTableName(table: PreparedDatabaseTable): string {
  return typeof table === "string" ? table : table.name;
}

function preparedTableCopiesRows(table: PreparedDatabaseTable): boolean {
  return typeof table === "string" || table.copyRows !== false;
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
  tables: readonly PreparedDatabaseTable[],
): { db: DatabaseSync; session: Session } {
  // The copy holds a slice of the schema, so foreign keys have no targets to
  // resolve against: leaving them on fails every insert into a user-scoped
  // table, which reads downstream as a preparation that silently never runs.
  const db = new DatabaseSync(":memory:", {
    enableForeignKeyConstraints: false,
  });
  try {
    for (const spec of tables) {
      const tableName = preparedTableName(spec);
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
      if (columnNames.length === 0 || !preparedTableCopiesRows(spec)) continue;

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
