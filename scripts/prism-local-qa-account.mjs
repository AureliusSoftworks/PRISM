#!/usr/bin/env node

/**
 * Maintain the one persistent, LOCAL-only PRISM account reserved for Codex QA.
 * Credentials live in /Users/jared/secrets.env and are never printed.
 */
import { DatabaseSync } from "node:sqlite";
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decryptText,
  deriveMasterKey,
  encryptText,
  hashPassword,
  randomId,
  verifyPassword,
} from "../apps/api/src/security.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "..");
const defaultDatabasePath =
  "/Users/jared/Library/Application Support/com.localai.prism-desktop/localai.db";
const defaultSecretsPath = "/Users/jared/secrets.env";
const qaUsernameDefault = "codex_qa_admin";
const qaDisplayName = "Codex QA";
const preservedPlayerUsername = "jared";

function parseEnvFile(path) {
  if (!existsSync(path)) return new Map();
  const values = new Map();
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function loadRepoEnvironment() {
  for (const [key, value] of parseEnvFile(resolve(repoRoot, ".env"))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function persistQaCredentials(path, username, password) {
  const replacements = new Map([
    ["PRISM_QA_USERNAME", username],
    ["PRISM_QA_PASSWORD", password],
  ]);
  const original = existsSync(path) ? readFileSync(path, "utf8") : "";
  const seen = new Set();
  const lines = original.split(/\r?\n/u).filter((line, index, all) =>
    !(index === all.length - 1 && line === ""),
  );
  const nextLines = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/u.exec(line);
    if (!match || !replacements.has(match[1])) return line;
    if (seen.has(match[1])) return null;
    seen.add(match[1]);
    return `${match[1]}=${replacements.get(match[1])}`;
  }).filter((line) => line !== null);
  for (const [key, value] of replacements) {
    if (!seen.has(key)) nextLines.push(`${key}=${value}`);
  }
  const temporaryPath = `${path}.codex-qa-${process.pid}`;
  writeFileSync(temporaryPath, `${nextLines.join("\n")}\n`, { mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
}

function requiredMasterKey(database) {
  const masterSecret =
    process.env.ENCRYPTION_MASTER_KEY ?? "local-dev-master-key-change-me";
  const masterKey = deriveMasterKey(masterSecret);
  const player = database.prepare(
    `SELECT wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag
       FROM users
      WHERE email = ?`,
  ).get(preservedPlayerUsername);
  if (!player) {
    throw new Error("Refusing QA maintenance because the Jared account is missing.");
  }
  try {
    decryptText(
      {
        ciphertext: player.wrapped_user_key,
        iv: player.wrapped_user_key_iv,
        tag: player.wrapped_user_key_tag,
      },
      masterKey,
    );
  } catch {
    throw new Error(
      "Refusing QA maintenance because the configured master key does not open the Jared account.",
    );
  }
  return masterKey;
}

function ensureQaAccount(database, secretsPath) {
  const secretValues = parseEnvFile(secretsPath);
  const username = (
    process.env.PRISM_QA_USERNAME ??
    secretValues.get("PRISM_QA_USERNAME") ??
    qaUsernameDefault
  ).trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,64}$/u.test(username) || username === preservedPlayerUsername) {
    throw new Error("PRISM_QA_USERNAME is invalid or collides with the Jared account.");
  }

  let password =
    process.env.PRISM_QA_PASSWORD ?? secretValues.get("PRISM_QA_PASSWORD") ?? "";
  const existing = database.prepare(
    "SELECT id, password_hash, password_salt FROM users WHERE email = ?",
  ).get(username);
  if (existing) {
    if (!password || !verifyPassword(password, existing.password_salt, existing.password_hash)) {
      throw new Error(
        "The persistent QA username already exists, but its saved credential does not match. Refusing to create a replacement.",
      );
    }
    persistQaCredentials(secretsPath, username, password);
    return { id: existing.id, username, created: false };
  }

  if (!password) password = randomId(24);
  persistQaCredentials(secretsPath, username, password);
  const masterKey = requiredMasterKey(database);
  const userId = randomId(12);
  const salt = randomId(8);
  const userKey = Buffer.from(randomId(32), "hex");
  const wrappedUserKey = encryptText(userKey.toString("base64"), masterKey);
  const now = new Date().toISOString();
  database.prepare(
    `INSERT INTO users (
       id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       theme, preferred_provider, created_at, last_active_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'system', 'local', ?, ?)`,
  ).run(
    userId,
    username,
    qaDisplayName,
    hashPassword(password, salt),
    salt,
    wrappedUserKey.ciphertext,
    wrappedUserKey.iv,
    wrappedUserKey.tag,
    now,
    now,
  );
  return { id: userId, username, created: true };
}

function tableExists(database, table) {
  return Boolean(
    database.prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table)?.present,
  );
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function tenantOwnedTables(database) {
  return database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all().map((row) => row.name).filter((table) =>
    database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all()
      .some((column) => column.name === "user_id"),
  );
}

function deleteTenantRows(database, userId) {
  const explicitTables = [
    "sessions",
    "client_access_tokens",
    "conversation_exports",
    "debate_mystery_mansion_bundles",
    "images",
    "bots",
    "memory_summaries",
    "memories",
    "messages",
    "conversations",
  ];
  for (const table of explicitTables) {
    if (tableExists(database, table)) {
      database.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    }
  }
  for (const table of tenantOwnedTables(database)) {
    if (explicitTables.includes(table)) continue;
    database.prepare(
      `DELETE FROM ${quoteIdentifier(table)} WHERE user_id = ?`,
    ).run(userId);
  }
  database.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

function deleteOrphanedTenantRows(database) {
  for (const table of tenantOwnedTables(database)) {
    database.prepare(
      `DELETE FROM ${quoteIdentifier(table)} WHERE user_id NOT IN (SELECT id FROM users)`,
    ).run();
  }
}

async function cleanupTenantArtifacts(userIds) {
  process.env.LOCALAI_DATA_DIR ??=
    "/Users/jared/Library/Application Support/com.localai.prism-desktop";
  const [imageStorage, replayStorage, qdrant] = await Promise.all([
    import("../apps/api/src/image-storage.ts"),
    import("../apps/api/src/replay-storage.ts"),
    import("../apps/api/src/qdrant.ts"),
  ]);
  for (const userId of userIds) {
    imageStorage.removeGeneratedImagesDirectoryForUser(userId);
    imageStorage.removeAssetCleanupTrashDirectoryForUser(userId);
    replayStorage.removeReplayMediaForUser(userId);
    try {
      await qdrant.deleteVectorsForUser(userId);
    } catch {
      // SQLite remains authoritative when the optional local vector service is down.
    }
  }
}

async function main() {
  loadRepoEnvironment();
  const command = process.argv[2] ?? "ensure";
  if (!new Set(["audit", "ensure", "ensure-and-prune"]).has(command)) {
    throw new Error("Usage: prism-local-qa-account.mjs [audit|ensure|ensure-and-prune]");
  }
  const databasePath = resolve(process.env.PRISM_QA_DB_PATH ?? defaultDatabasePath);
  const secretsPath = resolve(process.env.CODEX_SECRETS_ENV ?? defaultSecretsPath);
  if (!existsSync(databasePath)) throw new Error(`PRISM database not found: ${databasePath}`);
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  try {
    const accounts = database.prepare(
      "SELECT id, email FROM users ORDER BY created_at ASC",
    ).all();
    if (command === "audit") {
      console.log(`PRISM account audit: ${accounts.length} account(s).`);
      for (const account of accounts) console.log(`- ${account.email}`);
      return;
    }

    database.exec("BEGIN IMMEDIATE;");
    let qaAccount;
    try {
      qaAccount = ensureQaAccount(database, secretsPath);
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
    console.log(
      qaAccount.created
        ? "Created the persistent LOCAL Codex QA account."
        : "Reused the persistent LOCAL Codex QA account.",
    );

    if (command !== "ensure-and-prune") return;
    const removable = database.prepare(
      "SELECT id, email FROM users WHERE email NOT IN (?, ?) ORDER BY created_at ASC",
    ).all(preservedPlayerUsername, qaAccount.username);
    database.exec("BEGIN IMMEDIATE;");
    try {
      database.exec("PRAGMA defer_foreign_keys = ON;");
      for (const account of removable) deleteTenantRows(database, account.id);
      deleteOrphanedTenantRows(database);
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
    await cleanupTenantArtifacts(removable.map((account) => account.id));
    const remaining = database.prepare(
      "SELECT email FROM users ORDER BY created_at ASC",
    ).all().map((account) => account.email);
    if (
      remaining.length !== 2 ||
      !remaining.includes(preservedPlayerUsername) ||
      !remaining.includes(qaAccount.username)
    ) {
      throw new Error("Post-cleanup account verification failed.");
    }
    console.log(`Removed ${removable.length} obsolete tenant account(s) and owned data.`);
    console.log("Verified remaining accounts: jared and the persistent Codex QA account.");
  } finally {
    database.close();
  }
}

await main();
