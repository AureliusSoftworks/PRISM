import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase, resolveDbPath } from "../db.ts";

describe("resolveDbPath", () => {
  it("prefers DB_PATH for existing explicit deployments", () => {
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = "/tmp/prism-explicit.db";
    process.env.LOCALAI_DATA_DIR = "/tmp/prism-data";

    try {
      assert.equal(resolveDbPath(), "/tmp/prism-explicit.db");
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
    }
  });

  it("stores mac app data under LOCALAI_DATA_DIR when provided", () => {
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    delete process.env.DB_PATH;
    process.env.LOCALAI_DATA_DIR = "/tmp/prism-data";

    try {
      assert.equal(resolveDbPath(), join("/tmp/prism-data", "localai.db"));
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
    }
  });
});

describe("createDatabase bot export hash migration", () => {
  it("ensures bots.export_hash exists and backfills missing values", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "localai-db-test-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "migration.db");
    delete process.env.LOCALAI_DATA_DIR;
    try {
      const db = createDatabase();
      db.prepare(
        "INSERT INTO users (id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "user-1",
        "user-1@example.com",
        "User 1",
        "hash",
        "salt",
        "cipher",
        "iv",
        "tag",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );
      db.prepare(
        "INSERT INTO bots (id, user_id, name, system_prompt, export_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "bot-1",
        "user-1",
        "Legacy Bot",
        "",
        null,
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );
      db.close();

      const reopened = createDatabase();
      const columns = reopened
        .prepare("PRAGMA table_info(bots)")
        .all() as Array<{ name: string }>;
      assert.ok(columns.some((column) => column.name === "export_hash"));
      const opinionColumns = reopened
        .prepare("PRAGMA table_info(session_opinions)")
        .all() as Array<{ name: string }>;
      assert.ok(opinionColumns.some((column) => column.name === "user_id"));
      assert.ok(opinionColumns.some((column) => column.name === "conversation_id"));
      assert.ok(opinionColumns.some((column) => column.name === "bot_scope_key"));
      const botOpinionColumns = reopened
        .prepare("PRAGMA table_info(bot_opinions)")
        .all() as Array<{ name: string }>;
      assert.ok(botOpinionColumns.some((column) => column.name === "boundary_level"));
      assert.ok(botOpinionColumns.some((column) => column.name === "repair_count"));
      const row = reopened
        .prepare("SELECT export_hash FROM bots WHERE id = ?")
        .get("bot-1") as { export_hash: string | null } | undefined;
      assert.ok(row?.export_hash);
      assert.match(row!.export_hash!, /^[a-f0-9]{32}$/);
      reopened.close();
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
