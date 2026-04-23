/**
 * Wipe every user + their owned state from the local SQLite DB and, best
 * effort, the Qdrant memory collection.
 *
 * DB path resolution mirrors apps/api/src/db.ts so the wipe always lands on
 * the exact file the API reads:
 *   1. process.env.DB_PATH if set
 *   2. <repo>/apps/api/data/localai.db
 *
 * After deleting rows, the script checkpoints the WAL and removes any
 * leftover `-wal` / `-shm` sidecar files so the next API boot opens a clean
 * single-file database — this is what makes "I wiped but still logged in"
 * stop happening when the user ran the wipe with stale WAL pages around.
 */
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { existsSync, rmSync } from "node:fs";

const DEFAULT_DB_PATH = resolve(
  process.cwd(),
  "apps",
  "api",
  "data",
  "localai.db"
);
const dbPath = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : DEFAULT_DB_PATH;

const tables = [
  "sessions",
  "conversation_exports",
  "images",
  "bots",
  "memory_summaries",
  "memories",
  "messages",
  "conversations",
  "users"
];

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const QDRANT_COLLECTION = "memories";

console.log(`Wiping SQLite at: ${dbPath}`);

try {
  if (!existsSync(dbPath)) {
    console.log(
      "No database file at that path. Nothing to wipe (did the API ever run here?)."
    );
  } else {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON;");

    const before = Object.fromEntries(
      tables.map((table) => [
        table,
        db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
      ])
    );

    db.exec("BEGIN IMMEDIATE;");
    for (const table of tables) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    db.exec("COMMIT;");
    // TRUNCATE the WAL so the pages we just freed get returned to the main
    // file immediately. Without this, the next API connection can still see
    // ghosted pages via the WAL until the next automatic checkpoint.
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    db.exec("VACUUM;");

    const after = Object.fromEntries(
      tables.map((table) => [
        table,
        db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
      ])
    );

    db.close();

    // Remove sidecar files for good measure. If SQLite recreated them after
    // the checkpoint (shouldn't happen after .close()) this is a no-op.
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = `${dbPath}${suffix}`;
      if (existsSync(sidecar)) {
        try {
          rmSync(sidecar);
        } catch (err) {
          console.warn(
            `Could not remove ${sidecar}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }

    console.log("SQLite wipe complete.");
    console.log(JSON.stringify({ before, after }, null, 2));
  }
} catch (error) {
  console.error("Failed to wipe SQLite accounts.");
  console.error(
    error instanceof Error ? error.message : "Unknown database error."
  );
  process.exit(1);
}

// Best-effort Qdrant wipe. memory_summaries rows are already deleted above,
// but the vectors live in Qdrant and would otherwise be orphaned. If Qdrant
// is unreachable we log a soft warning — no reason to fail the whole script
// just because vectors are offline.
try {
  console.log(`Clearing Qdrant collection "${QDRANT_COLLECTION}" at ${QDRANT_URL}...`);
  const response = await fetch(
    `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/delete`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Empty must-clause deletes all points while leaving the collection
      // itself intact so the API can keep using it after the wipe.
      body: JSON.stringify({ filter: { must: [] } })
    }
  );
  if (!response.ok) {
    // 404 is expected if the collection was never created; everything else
    // deserves at least a warning.
    if (response.status === 404) {
      console.log("Qdrant collection not found (nothing to clear).");
    } else {
      console.warn(
        `Qdrant wipe returned HTTP ${response.status}. Continuing.`
      );
    }
  } else {
    console.log("Qdrant wipe complete.");
  }
} catch (error) {
  console.warn(
    `Qdrant not reachable (${
      error instanceof Error ? error.message : "unknown error"
    }). Skipping vector wipe.`
  );
}
