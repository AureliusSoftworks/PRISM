import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  buildPrismCompanionAuthoritativeContext,
  chatWithPrismCompanion,
  parsePrismCompanionModelOutput,
  prismCompanionDirectActionIntents,
  prismCompanionRequestedCapabilities,
  prismCompanionSystemPrompt,
  resolvePrismCompanionProvider,
} from "../prism-companion.ts";
import { defaultEphemeralChatProviderPreferences } from "@localai/shared";

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE bots (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, visibility TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, conversation_mode TEXT, incognito INTEGER);
    CREATE TABLE botcast_shows (id TEXT PRIMARY KEY, user_id TEXT, name TEXT);
    CREATE TABLE botcast_episodes (id TEXT PRIMARY KEY, user_id TEXT, show_id TEXT, title TEXT, status TEXT);
    CREATE TABLE slate_projects (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, phase TEXT, manuscript TEXT);
    CREATE TABLE slate_sections (id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT, title TEXT, prose TEXT);
    INSERT INTO bots VALUES ('owned', 'u1', 'Lux', 'private');
    INSERT INTO bots VALUES ('public', 'u2', 'Umbra', 'public');
    INSERT INTO bots VALUES ('secret', 'u2', 'Secret', 'private');
    INSERT INTO conversations VALUES ('c1', 'u1', 'A quiet talk', 'zen', 1);
    INSERT INTO slate_projects VALUES ('p1', 'u1', 'The Glass Sea', 'draft', 'SECRET MANUSCRIPT');
    INSERT INTO slate_sections VALUES ('s1', 'u1', 'p1', 'Chapter One', 'SECRET PROSE');
  `);
  return db;
}

test("builds tenant-safe metadata context without source material", () => {
  const db = fixture();
  const context = buildPrismCompanionAuthoritativeContext(
    db,
    "u1",
    "Jared",
    {
      surfaceId: "slate",
      botIds: ["owned", "public", "secret"],
      conversationId: "c1",
      slateProjectId: "p1",
      slateSectionId: "s1",
    },
  );
  assert.deepEqual(context.bots.map((bot) => bot.id), ["owned", "public"]);
  assert.equal(context.conversation?.incognito, true);
  assert.equal(context.slate?.sectionTitle, "Chapter One");
  const serialized = JSON.stringify(context);
  assert.doesNotMatch(serialized, /SECRET MANUSCRIPT|SECRET PROSE/u);
  assert.doesNotMatch(prismCompanionSystemPrompt(context), /SECRET MANUSCRIPT|SECRET PROSE/u);
});

test("strips malformed and disallowed model actions", () => {
  assert.deepEqual(
    parsePrismCompanionModelOutput(
      'Let’s go.\n<PRISM_ACTIONS>[{"type":"navigate","destination":"slate"},{"type":"delete_bot","botId":"owned"}]</PRISM_ACTIONS>',
    ),
    {
      content: "Let’s go.",
      actions: [{ type: "navigate", destination: "slate" }],
    },
  );
});

test("recognizes explicit safe commands without executing them", () => {
  const db = fixture();
  const context = buildPrismCompanionAuthoritativeContext(
    db,
    "u1",
    "Jared",
    { surfaceId: "home", botIds: ["owned"] },
  );
  assert.deepEqual(
    prismCompanionDirectActionIntents("Please open Slate now.", context),
    [{ type: "navigate", destination: "slate" }],
  );
  assert.deepEqual(
    prismCompanionDirectActionIntents("Export this bot.", context),
    [{ type: "export_bot", botId: "owned" }],
  );
  assert.deepEqual(
    prismCompanionDirectActionIntents("Delete this bot.", context),
    [],
  );
});

test("mentions request early capability revelations", () => {
  assert.deepEqual(
    prismCompanionRequestedCapabilities(
      "What are Coffee and Signal, and can you show me the Marketplace?",
    ),
    ["marketplace", "signal", "coffee"],
  );
  assert.deepEqual(prismCompanionRequestedCapabilities("Open Settings"), []);
});

test("keeps every companion surface local when the account is in LOCAL mode", () => {
  const preferences = defaultEphemeralChatProviderPreferences();
  preferences.slate = "online";
  assert.equal(
    resolvePrismCompanionProvider({
      surfaceId: "slate",
      preferences,
      globalProvider: "local",
      onlineProvider: "openai",
    }),
    "local",
  );
});

test("authorizes export only for an owned bot and does not persist chat", async () => {
  const db = fixture();
  const prompts: unknown[] = [];
  const provider = {
    name: "local" as const,
    async generateResponse(messages: unknown): Promise<string> {
      prompts.push(messages);
      return 'Choose one. <PRISM_ACTIONS>[{"type":"export_bot","botId":"public"},{"type":"export_bot","botId":"owned"}]</PRISM_ACTIONS>';
    },
    async embedText(): Promise<number[]> {
      return [];
    },
  };
  const result = await chatWithPrismCompanion({
    db,
    userId: "u1",
    displayName: "Jared",
    surface: { surfaceId: "home", botIds: ["owned", "public"] },
    recoveryMessages: [],
    message: "Export one.",
    provider,
    providerName: "local",
    model: "local-model",
  });
  assert.deepEqual(result.actions, [{ type: "export_bot", botId: "owned" }]);
  assert.equal(prompts.length, 1);
  const persistenceTables = db
    .prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE '%companion%'",
    )
    .get() as { count: number };
  assert.equal(persistenceTables.count, 0);
});
