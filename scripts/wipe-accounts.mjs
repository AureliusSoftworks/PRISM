/**
 * Wipe every user + their owned state from all local Prism SQLite databases
 * under this repo, and best-effort clear the Qdrant memory collection.
 *
 * Database candidates (deduped) mirror apps/api/src/db.ts plus dev launchers:
 *   - process.env.DB_PATH
 *   - LOCALAI_DATA_DIR/localai.db
 *   - <repo>/apps/api/data/localai.db   (prod / default npm dev / Docker bind)
 *   - <repo>/apps/api/data/localai-dev.db (start.bat dev, start-dev.command)
 *
 * Repo root is derived from this file's location (not cwd). Root `.env` is
 * loaded without overriding variables already set in the shell.
 *
 * Preflight: refuses to run if Docker Compose `api` is up, or if a process
 * is listening on known Prism API ports (avoids wiping the wrong file or a
 * locked WAL while the API is live).
 */
import { DatabaseSync } from "node:sqlite";
import { resolve, join, dirname } from "node:path";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const dataDir = join(repoRoot, "apps", "api", "data");

const tables = [
  "sessions",
  "conversation_exports",
  "images",
  "bots",
  "memory_summaries",
  "memories",
  "messages",
  "conversations",
  "users",
];

const QDRANT_COLLECTION = "memories";

/** Ports used by repo launchers (prod + dev); see start.bat, start.command, start-dev.command */
const KNOWN_API_PORTS = [18787, 18789, 8787, 8788];

function loadRootEnv() {
  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function collectDbPaths() {
  const paths = new Set();
  const add = (p) => {
    if (!p || typeof p !== "string") return;
    paths.add(resolve(p));
  };

  if (process.env.DB_PATH) add(process.env.DB_PATH);
  if (process.env.LOCALAI_DATA_DIR) {
    add(join(process.env.LOCALAI_DATA_DIR, "localai.db"));
  }
  add(join(dataDir, "localai.db"));
  add(join(dataDir, "localai-dev.db"));

  return [...paths];
}

function portHasListener(port) {
  return new Promise((resolvePromise) => {
    const socket = net.connect({ port, host: "127.0.0.1" }, () => {
      socket.destroy();
      resolvePromise(true);
    });
    socket.setTimeout(600);
    socket.on("timeout", () => {
      socket.destroy();
      resolvePromise(false);
    });
    socket.on("error", () => resolvePromise(false));
  });
}

async function assertApiNotListening() {
  const ports = new Set(KNOWN_API_PORTS);
  const fromEnv = Number(process.env.API_PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0 && fromEnv < 65536) {
    ports.add(fromEnv);
  }

  const open = [];
  for (const port of ports) {
    if (await portHasListener(port)) open.push(port);
  }

  if (open.length === 0) return;

  console.error("ERROR: Something is still listening on Prism API port(s):");
  for (const p of open.sort((a, b) => a - b)) {
    console.error(`  - ${p} (http://127.0.0.1:${p})`);
  }
  console.error("");
  console.error(
    "Stop the Prism API (all modes: prod, dev, Docker desktop, etc.) and rerun."
  );
  process.exit(1);
}

function assertDockerApiDown() {
  try {
    const out = execSync("docker compose ps -q api", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (out.trim().length === 0) return;
  } catch {
    return;
  }

  console.error("ERROR: The Docker Compose API container is running.");
  console.error("");
  console.error(
    "A host-side wipe would not affect the container's database. To reset Docker data:"
  );
  console.error("    docker compose down -v");
  console.error("    docker compose up -d");
  console.error("");
  process.exit(1);
}

/**
 * @param {string} dbPath
 */
function wipeSqliteFile(dbPath) {
  if (!existsSync(dbPath)) {
    console.log(`Skip (not found): ${dbPath}`);
    return;
  }

  console.log(`Wiping SQLite: ${dbPath}`);

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");

  const before = Object.fromEntries(
    tables.map((table) => [
      table,
      db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
    ])
  );

  db.exec("BEGIN IMMEDIATE;");
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  db.exec("COMMIT;");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  db.exec("VACUUM;");

  const after = Object.fromEntries(
    tables.map((table) => [
      table,
      db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
    ])
  );

  db.close();

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

  console.log("  SQLite wipe complete.");
  console.log(`  ${JSON.stringify({ before, after })}`);
}

loadRootEnv();

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";

await assertApiNotListening();
assertDockerApiDown();

const dbPaths = collectDbPaths();
const existing = dbPaths.filter((p) => existsSync(p));

if (existing.length === 0) {
  console.log("No Prism database files found at any known path:");
  for (const p of dbPaths) console.log(`  - ${p}`);
  console.log("(Nothing to wipe — has the API ever created a DB here?)");
} else {
  console.log(`Wiping ${existing.length} database file(s).`);
  try {
    for (const dbPath of existing) {
      wipeSqliteFile(dbPath);
    }
  } catch (error) {
    console.error("Failed to wipe SQLite accounts.");
    console.error(
      error instanceof Error ? error.message : "Unknown database error."
    );
    process.exit(1);
  }
}

try {
  console.log(
    `Clearing Qdrant collection "${QDRANT_COLLECTION}" at ${QDRANT_URL}...`
  );
  const response = await fetch(
    `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/delete`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filter: { must: [] } }),
    }
  );
  if (!response.ok) {
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
