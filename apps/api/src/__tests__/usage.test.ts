import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../db.ts";
import {
  getUsageReport,
  patchUsageSession,
  recordEstimatedEmbeddingUsage,
  recordDeveloperTranscriptEvent,
  recordImageUsage,
  recordTextUsage,
  runWithUsageSession,
} from "../usage.ts";

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previous;
  }
}

function withUsageTestDb<T>(fn: (db: ReturnType<typeof createDatabase>) => T): T {
  const tempDir = mkdtempSync(join(tmpdir(), "prism-usage-"));
  const previousDbPath = process.env.DB_PATH;
  const previousDataDir = process.env.LOCALAI_DATA_DIR;
  process.env.DB_PATH = join(tempDir, "usage.db");
  delete process.env.LOCALAI_DATA_DIR;
  const db = createDatabase();
  try {
    seedUsageFixtures(db);
    return fn(db);
  } finally {
    db.close();
    restoreEnv("DB_PATH", previousDbPath);
    restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function seedUsageFixtures(db: ReturnType<typeof createDatabase>): void {
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
    "INSERT INTO users (id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "user-2",
    "user-2@example.com",
    "User 2",
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
    "Usage Bot",
    "You account for usage.",
    "usage-bot",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "conv-1",
    "user-1",
    "Usage fixture",
    "sandbox",
    "bot-1",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    "msg-1",
    "conv-1",
    "user-1",
    "assistant",
    "Tracked reply",
    "2026-01-01T00:00:01.000Z"
  );
}

describe("usage accounting", () => {
  it("records ordered provider and tool diagnostics only for persisted sessions", () => {
    withUsageTestDb((db) => {
      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "normal",
          mode: "sandbox",
          surface: "chat",
          conversationId: "conv-1",
          messageId: "msg-1",
          botId: "bot-1",
          requestId: "developer-request",
        },
        () => {
          recordTextUsage({
            provider: "openai",
            model: "gpt-5",
            purpose: "chat_reply",
            inputTokens: 10,
            outputTokens: 4,
            totalTokens: 14,
            tokenCountSource: "provider_reported",
            developer: {
              request: { messages: [{ role: "user", content: "Hello" }] },
              rawOutput: { choices: [{ message: { content: "Hi" } }] },
              parsedOutput: "Hi",
              stopReason: "stop",
              streaming: false,
            },
          });
          recordDeveloperTranscriptEvent({
            kind: "tool",
            purpose: "coffee_topic_selection",
            parsedOutput: { selectedTopic: "A useful disagreement" },
          });
        }
      );

      const rows = db
        .prepare(
          `SELECT request_sequence, event_kind, purpose, provider, model, payload_json
             FROM developer_transcript_events
            WHERE user_id = ? AND conversation_id = ?
            ORDER BY request_sequence ASC`
        )
        .all("user-1", "conv-1") as Array<{
        request_sequence: number;
        event_kind: string;
        purpose: string;
        provider: string | null;
        model: string | null;
        payload_json: string;
      }>;
      assert.equal(rows.length, 2);
      assert.deepEqual(rows.map((row) => row.request_sequence), [1, 2]);
      assert.deepEqual(rows.map((row) => row.event_kind), ["llm", "tool"]);
      assert.equal(rows[0]?.provider, "openai");
      assert.equal(rows[0]?.model, "gpt-5");
      assert.match(rows[0]?.payload_json ?? "", /"parsedOutput":"Hi"/u);
      assert.equal(rows[1]?.purpose, "coffee_topic_selection");

      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "private",
          mode: "sandbox",
          surface: "chat",
        },
        () => {
          recordDeveloperTranscriptEvent({
            kind: "llm",
            purpose: "chat_reply",
            parsedOutput: "private",
          });
        }
      );
      assert.equal(
        (
          db
            .prepare("SELECT COUNT(*) AS count FROM developer_transcript_events")
            .get() as { count: number }
        ).count,
        2
      );
    });
  });

  it("retroactively attaches calls recorded before a new conversation id exists", () => {
    withUsageTestDb((db) => {
      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "normal",
          mode: "coffee",
          surface: "coffee_topic",
          requestId: "late-conversation-request",
        },
        () => {
          recordTextUsage({
            provider: "local",
            model: "topic-model",
            purpose: "coffee_router",
            inputTokens: 2,
            outputTokens: 2,
            totalTokens: 4,
            tokenCountSource: "provider_reported",
            developer: { parsedOutput: '{"topics":[]}' },
          });
          patchUsageSession({ conversationId: "conv-1" });
        }
      );

      const usage = db
        .prepare("SELECT conversation_id FROM usage_events WHERE request_id = ?")
        .get("late-conversation-request") as { conversation_id: string | null };
      const diagnostic = db
        .prepare(
          "SELECT conversation_id FROM developer_transcript_events WHERE request_id = ?"
        )
        .get("late-conversation-request") as { conversation_id: string | null };
      assert.equal(usage.conversation_id, "conv-1");
      assert.equal(diagnostic.conversation_id, "conv-1");
    });
  });

  it("aggregates text, image, and embedding events with estimated online cost", () => {
    withUsageTestDb((db) => {
      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "normal",
          mode: "sandbox",
          surface: "chat",
          conversationId: "conv-1",
          messageId: "msg-1",
          botId: "bot-1",
          requestId: "usage-test-request",
        },
        () => {
          recordTextUsage({
            provider: "openai",
            model: "gpt-5",
            purpose: "chat_reply",
            inputTokens: 1000,
            outputTokens: 500,
            totalTokens: 1500,
            tokenCountSource: "provider_reported",
          });
          recordImageUsage({
            provider: "openai",
            model: "gpt-image-2",
            purpose: "image_generation",
            imageSize: "1024x1024",
            imageQuality: "low",
          });
          recordEstimatedEmbeddingUsage({
            provider: "ollama",
            model: "nomic-embed-text",
            text: "small local embedding sample",
          });
        }
      );

      const report = getUsageReport({ db, userId: "user-1", range: "all" });

      assert.equal(report.totals.eventCount, 3);
      assert.equal(report.totals.onlineTokens, 1772);
      assert.equal(report.totals.imageCount, 1);
      assert.equal(report.totals.providerReportedEvents, 1);
      assert.equal(report.totals.estimatedTokenEvents, 2);
      assert.equal(report.totals.unpricedOnlineEvents, 0);
      assert.equal(report.totals.estimatedCostMicroUsd, 14410);
      assert.equal(report.recentEvents.length, 3);
      assert.ok(report.byPurpose.some((item) => item.purpose === "chat_reply"));
      assert.ok(report.byModel.some((item) => item.model === "gpt-image-2"));

      const otherUserReport = getUsageReport({ db, userId: "user-2", range: "all" });
      assert.equal(otherUserReport.totals.eventCount, 0);
    });
  });

  it("keeps incognito usage aggregate-only and out of recent events", () => {
    withUsageTestDb((db) => {
      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "private",
          mode: "sandbox",
          surface: "chat",
          conversationId: "conv-1",
          messageId: "msg-1",
          botId: "bot-1",
        },
        () => {
          recordTextUsage({
            provider: "anthropic",
            model: "claude-sonnet-4-6",
            purpose: "chat_reply",
            inputTokens: 200,
            outputTokens: 100,
            totalTokens: 300,
            tokenCountSource: "provider_reported",
          });
        }
      );

      const row = db
        .prepare(
          "SELECT conversation_id, message_id, bot_id, privacy_scope FROM usage_events WHERE user_id = ?"
        )
        .get("user-1") as
        | {
            conversation_id: string | null;
            message_id: string | null;
            bot_id: string | null;
            privacy_scope: string;
          }
        | undefined;
      assert.equal(row?.privacy_scope, "private");
      assert.equal(row?.conversation_id, null);
      assert.equal(row?.message_id, null);
      assert.equal(row?.bot_id, null);

      const report = getUsageReport({ db, userId: "user-1", range: "all" });
      assert.equal(report.totals.eventCount, 1);
      assert.equal(report.totals.onlineTokens, 300);
      assert.equal(report.recentEvents.length, 0);
    });
  });

  it("clears conversation linkage on conversation deletion and cascades on account deletion", () => {
    withUsageTestDb((db) => {
      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "normal",
          mode: "sandbox",
          surface: "chat",
          conversationId: "conv-1",
          messageId: "msg-1",
          botId: "bot-1",
        },
        () => {
          recordTextUsage({
            provider: "openai",
            model: "unknown-online-model",
            purpose: "system_unlabeled",
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
            tokenCountSource: "provider_reported",
          });
        }
      );

      db.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").run("conv-1", "user-1");

      const unlinked = db
        .prepare("SELECT conversation_id, message_id, bot_id FROM usage_events WHERE user_id = ?")
        .get("user-1") as
        | { conversation_id: string | null; message_id: string | null; bot_id: string | null }
        | undefined;
      assert.equal(unlinked?.conversation_id, null);
      assert.equal(unlinked?.message_id, null);
      assert.equal(unlinked?.bot_id, "bot-1");
      assert.equal(getUsageReport({ db, userId: "user-1", range: "all" }).totals.eventCount, 1);

      db.prepare("DELETE FROM users WHERE id = ?").run("user-1");
      const remaining = db
        .prepare("SELECT COUNT(*) AS count FROM usage_events WHERE user_id = ?")
        .get("user-1") as { count: number };
      assert.equal(remaining.count, 0);
    });
  });
});
