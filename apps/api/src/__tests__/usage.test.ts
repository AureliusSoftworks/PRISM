import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../db.ts";
import {
  developerTranscriptPayloadIsSealedV1,
  openDeveloperTranscriptPayloadV1,
} from "../developer-transcript-vault.ts";
import {
  normalizePrismGenerationWorkContext,
  runWithPrismGenerationWorkContext,
} from "../generation-work.ts";
import {
  getUsageReport,
  patchUsageSession,
  recordEstimatedEmbeddingUsage,
  recordDeveloperTranscriptEvent,
  recordImageUsage,
  recordTextUsage,
  registerUsageDiagnosticRedaction,
  repairMisnormalizedUsagePurposes,
  routingTextPriceForModel,
  runWithUsageSession,
  setUsageTripEnabled,
} from "../usage.ts";

describe("routing text prices", () => {
  it("prices optional Mythos 5 at its explicit Anthropic rate", () => {
    assert.deepEqual(routingTextPriceForModel("anthropic", "claude-mythos-5"), {
      inputUsdPerMillion: 10,
      outputUsdPerMillion: 50,
    });
  });
});

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
      const userKey = Buffer.alloc(32, 0x31);
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
          userKey,
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
      assert.equal(
        developerTranscriptPayloadIsSealedV1(rows[0]?.payload_json ?? ""),
        true,
      );
      const firstPayload = openDeveloperTranscriptPayloadV1({
        userId: "user-1",
        eventId: String(
          (
            db.prepare(
              `SELECT id FROM developer_transcript_events
                WHERE user_id = ? AND conversation_id = ?
                ORDER BY request_sequence ASC LIMIT 1`,
            ).get("user-1", "conv-1") as { id: string }
          ).id,
        ),
        payloadJson: rows[0]?.payload_json ?? "",
        userKey,
      });
      assert.match(firstPayload, /"parsedOutput":"Hi"/u);
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

  it("omits request-scoped surface context from durable developer transcripts", () => {
    withUsageTestDb((db) => {
      const userKey = Buffer.alloc(32, 0x32);
      const surfaceContext = [
        "Request-scoped Prism companion surface context (not chat history or memory):",
        "Slate project: Never Persist This Surface Title (draft)",
      ].join("\n");
      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "normal",
          mode: "zen",
          surface: "zen",
          conversationId: "conv-1",
          requestId: "surface-context-request",
          userKey,
        },
        () => {
          registerUsageDiagnosticRedaction(surfaceContext);
          recordDeveloperTranscriptEvent({
            kind: "llm",
            purpose: "chat_reply",
            request: {
              messages: [
                {
                  role: "system",
                  content: `Before\n${surfaceContext}\nAfter`,
                },
              ],
            },
            parsedOutput: "Visible reply",
          });
        },
      );

      const row = db
        .prepare(
          "SELECT id, payload_json FROM developer_transcript_events WHERE request_id = ?",
        )
        .get("surface-context-request") as { id: string; payload_json: string };
      assert.doesNotMatch(row.payload_json, /Never Persist This Surface Title/u);
      const payloadJson = openDeveloperTranscriptPayloadV1({
        userId: "user-1",
        eventId: row.id,
        payloadJson: row.payload_json,
        userKey,
      });
      assert.match(payloadJson, /Request-scoped Prism surface context omitted/u);
      assert.match(payloadJson, /Before.*After/u);
      assert.match(payloadJson, /Visible reply/u);
      assert.doesNotMatch(payloadJson, /Never Persist This Surface Title/u);
      assert.doesNotMatch(
        payloadJson,
        /Request-scoped Prism companion surface context/u,
      );
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
      assert.ok(report.byProvider.some((item) => item.provider === "openai"));
      assert.equal(report.providerFilter, "all");

      const openaiOnly = getUsageReport({
        db,
        userId: "user-1",
        range: "all",
        provider: "openai",
      });
      assert.equal(openaiOnly.providerFilter, "openai");
      assert.equal(openaiOnly.totals.eventCount, 2);
      assert.ok(openaiOnly.byProvider.every((item) => item.provider === "openai"));
      assert.equal(openaiOnly.byProvider.length, 1);

      const localFamily = getUsageReport({
        db,
        userId: "user-1",
        range: "all",
        provider: "local",
      });
      assert.equal(localFamily.providerFilter, "local");
      assert.equal(localFamily.totals.eventCount, 1);
      assert.ok(
        localFamily.byProvider.every(
          (item) =>
            item.provider === "local" ||
            item.provider === "ollama" ||
            item.provider === "comfyui",
        ),
      );

      const otherUserReport = getUsageReport({ db, userId: "user-2", range: "all" });
      assert.equal(otherUserReport.totals.eventCount, 0);
    });
  });

  it("prices the current GPT-5.6 API family", () => {
    withUsageTestDb((db) => {
      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "normal",
          mode: "sandbox",
          surface: "chat",
        },
        () => {
          for (const model of [
            "gpt-5.6-sol",
            "gpt-5.6-terra",
            "gpt-5.6-luna",
          ]) {
            recordTextUsage({
              provider: "openai",
              model,
              purpose: "chat_reply",
              inputTokens: 1_000,
              outputTokens: 500,
              totalTokens: 1_500,
              tokenCountSource: "provider_reported",
            });
          }
        },
      );

      const report = getUsageReport({ db, userId: "user-1", range: "all" });
      assert.equal(report.totals.unpricedOnlineEvents, 0);
      assert.equal(report.totals.estimatedCostMicroUsd, 34_000);
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

  it("reports additive local-first metadata without exposing private detail", () => {
    withUsageTestDb((db) => {
      const recordBrokeredUsage = (privacyScope: "normal" | "private") =>
        runWithUsageSession(
          {
            db,
            userId: "user-1",
            privacyScope,
            mode: "system",
            surface: "debate",
          },
          () =>
            runWithPrismGenerationWorkContext(
              normalizePrismGenerationWorkContext({
                workflow: "case_forge",
                operation: "author_case_section",
                stage: "suspect_chapter",
                executionLane: "selected",
                role: "author",
                outputClass: "critical",
                priority: "compilation",
                privacyMode: privacyScope === "private" ? "local" : "auto",
                sourceTokenEstimate: 900,
                exportedTokenEstimate: 300,
                fallbackReason: "sealed validation detail must not persist",
              }),
              () =>
                recordTextUsage({
                  provider: privacyScope === "private" ? "local" : "openai",
                  model: privacyScope === "private" ? "llama3.2" : "gpt-5.6-sol",
                  purpose: "debate_generation",
                  inputTokens: 300,
                  outputTokens: 100,
                  totalTokens: 400,
                  tokenCountSource: "provider_reported",
                }),
            ),
        );

      recordBrokeredUsage("normal");
      recordBrokeredUsage("private");

      const report = getUsageReport({ db, userId: "user-1", range: "all" });
      assert.equal(report.localFirst.assistedOperationCount, 2);
      assert.equal(report.localFirst.localTokens, 400);
      assert.equal(report.localFirst.onlineTokens, 400);
      assert.equal(report.localFirst.estimatedContextTokensKeptLocal, 1_200);
      assert.deepEqual(
        report.localFirst.byAppletStage.map((item) => [
          item.workflow,
          item.stage,
          item.assistedOperationCount,
        ]),
        [["case_forge", "suspect_chapter", 2]],
      );
      assert.equal(report.recentEvents.length, 1);
      assert.equal(report.recentEvents[0]?.workflow, "case_forge");
      assert.equal(report.recentEvents[0]?.workRole, "author");
      assert.equal(report.recentEvents[0]?.fallbackReason, "recovery");
      assert.equal(
        JSON.stringify(report).includes("sealed validation detail"),
        false,
      );
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

  it("keeps Signal / Botcast purposes instead of collapsing them to System Unlabeled", () => {
    withUsageTestDb((db) => {
      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "normal",
          mode: "botcast",
          surface: "signal",
          conversationId: "conv-1",
          requestId: "signal-purpose-request",
        },
        () => {
          recordTextUsage({
            provider: "openai",
            model: "gpt-5",
            purpose: "botcast_turn",
            inputTokens: 120,
            outputTokens: 80,
            totalTokens: 200,
            tokenCountSource: "provider_reported",
          });
        },
      );

      const stored = db
        .prepare("SELECT purpose FROM usage_events WHERE request_id = ?")
        .get("signal-purpose-request") as { purpose: string };
      assert.equal(stored.purpose, "botcast_turn");

      const report = getUsageReport({ db, userId: "user-1", range: "all" });
      const signal = report.byPurpose.find((item) => item.purpose === "botcast_turn");
      assert.ok(signal);
      assert.equal(signal.label, "Signal Turn");
      assert.equal(signal.totalTokens, 200);
      assert.equal(
        report.byPurpose.some((item) => item.purpose === "system_unlabeled"),
        false,
      );
    });
  });

  it("repairs historical System Unlabeled rows using the request surface", () => {
    withUsageTestDb((db) => {
      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "normal",
          mode: "botcast",
          surface: "signal",
          requestId: "legacy-signal",
        },
        () => {
          recordTextUsage({
            provider: "openai",
            model: "gpt-5",
            purpose: "system_unlabeled",
            inputTokens: 50,
            outputTokens: 25,
            totalTokens: 75,
            tokenCountSource: "provider_reported",
          });
        },
      );
      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "normal",
          mode: "system",
          surface: "bots",
          requestId: "legacy-bots",
        },
        () => {
          recordTextUsage({
            provider: "local",
            model: "llama3.2",
            purpose: "system_unlabeled",
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
            tokenCountSource: "provider_reported",
          });
        },
      );
      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "normal",
          mode: "debate",
          surface: "debate",
          requestId: "legacy-debate",
        },
        () => {
          recordTextUsage({
            provider: "local",
            model: "llama3.2",
            purpose: "system_unlabeled",
            inputTokens: 20,
            outputTokens: 10,
            totalTokens: 30,
            tokenCountSource: "provider_reported",
          });
        },
      );

      assert.equal(repairMisnormalizedUsagePurposes(db), 3);

      const purposes = (
        db
          .prepare(
            "SELECT request_id, purpose FROM usage_events WHERE user_id = ? ORDER BY request_id",
          )
          .all("user-1") as Array<{ request_id: string; purpose: string }>
      ).map((row) => ({ request_id: row.request_id, purpose: row.purpose }));
      assert.deepEqual(purposes, [
        { request_id: "legacy-bots", purpose: "bot_generation" },
        { request_id: "legacy-debate", purpose: "debate_generation" },
        { request_id: "legacy-signal", purpose: "botcast_turn" },
      ]);

      const report = getUsageReport({ db, userId: "user-1", range: "all" });
      assert.ok(report.byPurpose.some((item) => item.label === "Signal Turn"));
      assert.ok(report.byPurpose.some((item) => item.label === "Bot Generation"));
      assert.ok(report.byPurpose.some((item) => item.label === "Debate Generation"));
    });
  });

  it("tracks a resettable online-token trip meter without erasing history", () => {
    withUsageTestDb((db) => {
      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "normal",
          mode: "sandbox",
          surface: "chat",
          conversationId: "conv-1",
          requestId: "pre-trip",
        },
        () => {
          recordTextUsage({
            provider: "openai",
            model: "gpt-5",
            purpose: "chat_reply",
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            tokenCountSource: "provider_reported",
          });
          recordTextUsage({
            provider: "local",
            model: "llama3.2",
            purpose: "chat_reply",
            inputTokens: 80,
            outputTokens: 40,
            totalTokens: 120,
            tokenCountSource: "provider_reported",
          });
        },
      );

      db.prepare(
        "UPDATE usage_events SET created_at = ? WHERE request_id = ?",
      ).run("2026-08-04T21:00:00.000Z", "pre-trip");

      const before = getUsageReport({ db, userId: "user-1", range: "all" });
      assert.equal(before.trip.enabled, false);
      assert.equal(before.trip.onlineTokens, 0);
      assert.equal(before.totals.onlineTokens > 0, true);

      const started = setUsageTripEnabled({
        db,
        userId: "user-1",
        enabled: true,
        now: new Date("2026-08-04T22:00:00.000Z"),
      });
      assert.equal(started.enabled, true);
      assert.equal(started.onlineTokens, 0);
      assert.equal(started.startedAt, "2026-08-04T22:00:00.000Z");

      runWithUsageSession(
        {
          db,
          userId: "user-1",
          privacyScope: "normal",
          mode: "sandbox",
          surface: "chat",
          conversationId: "conv-1",
          requestId: "during-trip",
        },
        () => {
          recordTextUsage({
            provider: "openai",
            model: "gpt-5",
            purpose: "chat_reply",
            inputTokens: 200,
            outputTokens: 100,
            totalTokens: 300,
            tokenCountSource: "provider_reported",
          });
          recordTextUsage({
            provider: "local",
            model: "llama3.2",
            purpose: "chat_reply",
            inputTokens: 10,
            outputTokens: 10,
            totalTokens: 20,
            tokenCountSource: "provider_reported",
          });
        },
      );

      // Keep the trip event after the trip start marker.
      db.prepare(
        "UPDATE usage_events SET created_at = ? WHERE request_id = ?",
      ).run("2026-08-04T22:05:00.000Z", "during-trip");

      const live = getUsageReport({ db, userId: "user-1", range: "all" });
      assert.equal(live.trip.enabled, true);
      assert.equal(live.trip.onlineTokens, 300);
      assert.equal(live.trip.frozen, false);
      assert.ok(live.totals.onlineTokens >= 450);

      const paused = setUsageTripEnabled({
        db,
        userId: "user-1",
        enabled: false,
      });
      assert.equal(paused.enabled, false);
      assert.equal(paused.frozen, true);
      assert.equal(paused.onlineTokens, 300);

      const restarted = setUsageTripEnabled({
        db,
        userId: "user-1",
        enabled: true,
        now: new Date("2026-08-04T23:00:00.000Z"),
      });
      assert.equal(restarted.enabled, true);
      assert.equal(restarted.onlineTokens, 0);
      assert.equal(restarted.frozen, false);
      assert.equal(restarted.startedAt, "2026-08-04T23:00:00.000Z");
    });
  });
});
