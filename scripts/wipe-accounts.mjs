import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const dbPath = resolve(process.cwd(), "apps", "api", "data", "localai.db");
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

try {
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
  db.exec("VACUUM;");

  const after = Object.fromEntries(
    tables.map((table) => [
      table,
      db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
    ])
  );

  console.log("Wipe complete.");
  console.log(JSON.stringify({ before, after }, null, 2));
} catch (error) {
  console.error("Failed to wipe accounts.");
  console.error(
    error instanceof Error ? error.message : "Unknown database error."
  );
  process.exit(1);
}
