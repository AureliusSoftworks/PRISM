import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../db.ts";
import {
  findModelReasoningEffortPreference,
  listModelReasoningEffortPreferences,
  resetModelReasoningEffortPreferences,
  setModelReasoningEffortPreference,
} from "../model-effort-preferences.ts";
import {
  allModelReasoningEffortCursorHash,
  resolveUserModelReasoningEffort,
} from "../model-effort-runtime.ts";

function createTestDatabase(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users (
      id, email, display_name, password_hash, password_salt,
      wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
      created_at, last_active_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "user-1",
    "one@example.com",
    "One",
    "hash",
    "salt",
    "key",
    "iv",
    "tag",
    "2026-08-01T00:00:00.000Z",
    "2026-08-01T00:00:00.000Z",
  );
  db.prepare(
    `INSERT INTO users (
      id, email, display_name, password_hash, password_salt,
      wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
      created_at, last_active_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "user-2",
    "two@example.com",
    "Two",
    "hash",
    "salt",
    "key",
    "iv",
    "tag",
    "2026-08-01T00:00:00.000Z",
    "2026-08-01T00:00:00.000Z",
  );
  return db;
}

describe("model effort preferences", () => {
  it("upserts exact provider/model preferences and deletes Default", () => {
    const db = createTestDatabase();
    setModelReasoningEffortPreference(db, {
      userId: "user-1",
      provider: "local",
      modelId: "ollama-secondary:qwen3:9b",
      effort: "medium",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    setModelReasoningEffortPreference(db, {
      userId: "user-1",
      provider: "openai",
      modelId: "gpt-5.6-sol",
      effort: "high",
      updatedAt: "2026-08-01T00:00:01.000Z",
    });
    assert.equal(
      findModelReasoningEffortPreference(
        db,
        "user-1",
        "local",
        "ollama-secondary:qwen3:9b",
      ),
      "medium",
    );
    assert.deepEqual(
      listModelReasoningEffortPreferences(db, "user-1").map(
        ({ provider, modelId, effort }) => ({ provider, modelId, effort }),
      ),
      [
        {
          provider: "local",
          modelId: "ollama-secondary:qwen3:9b",
          effort: "medium",
        },
        { provider: "openai", modelId: "gpt-5.6-sol", effort: "high" },
      ],
    );
    setModelReasoningEffortPreference(db, {
      userId: "user-1",
      provider: "openai",
      modelId: "gpt-5.6-sol",
      effort: null,
    });
    assert.equal(
      findModelReasoningEffortPreference(
        db,
        "user-1",
        "openai",
        "gpt-5.6-sol",
      ),
      null,
    );
  });

  it("isolates users and resets only the requested account", () => {
    const db = createTestDatabase();
    for (const userId of ["user-1", "user-2"]) {
      setModelReasoningEffortPreference(db, {
        userId,
        provider: "openai",
        modelId: "gpt-5.6-sol",
        effort: "high",
      });
    }
    assert.equal(resetModelReasoningEffortPreferences(db, "user-1"), 1);
    assert.deepEqual(listModelReasoningEffortPreferences(db, "user-1"), []);
    assert.equal(listModelReasoningEffortPreferences(db, "user-2").length, 1);
  });

  it("gates local simulation and changes the prepared-turn cursor", () => {
    const db = createTestDatabase();
    const before = allModelReasoningEffortCursorHash(db, "user-1");
    setModelReasoningEffortPreference(db, {
      userId: "user-1",
      provider: "local",
      modelId: "qwen3:9b",
      effort: "high",
    });
    assert.equal(
      resolveUserModelReasoningEffort(db, {
        userId: "user-1",
        provider: "local",
        modelId: "qwen3:9b",
      }),
      undefined,
    );
    db.prepare(
      "UPDATE users SET experimental_all_model_effort_enabled = 1 WHERE id = 'user-1'",
    ).run();
    assert.equal(
      resolveUserModelReasoningEffort(db, {
        userId: "user-1",
        provider: "local",
        modelId: "qwen3:9b",
      }),
      "high",
    );
    assert.notEqual(allModelReasoningEffortCursorHash(db, "user-1"), before);
  });
});
