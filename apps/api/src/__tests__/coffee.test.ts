import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  COFFEE_GROUP_MAX_SIZE,
  COFFEE_GROUP_MIN_SIZE,
  autoTagPeerMentionsInCoffeeReply,
  buildCoffeeTableTuningAppendix,
  buildRouterPrompt,
  buildSpeakerPrompt,
  clampCoffeeSocialValue,
  clampCoffeeTableReplyText,
  coffeeReplyBreaksCharacterImmersion,
  coffeeReplyLooksLikePromptLeak,
  coffeeReplyRepeatsRecentAssistant,
  coffeeReplyRepeatsRecentMotifs,
  computePlayerInterruptionConsequences,
  computeNextCoffeeSocialState,
  createCoffeeGroup,
  createCoffeeConversation,
  createCoffeeConversationFromGroup,
  createCoffeePreset,
  deleteCoffeeGroup,
  deleteCoffeePreset,
  updateCoffeeConversationSettings,
  listCoffeePresets,
  effectiveCoffeeSpeakerProvider,
  initializeCoffeeSocialState,
  maybeBuildBotInterruptionEvent,
  normalizeCoffeeGroupBotIds,
  normalizeCoffeeSeatBotIds,
  parseStoredBotGroupIds,
  parseStoredCoffeeSeatBotIds,
  parseStoredCoffeeSessionSettings,
  parseRouterResponse,
  pickDirectedSpeaker,
  pickFallbackSpeaker,
  repairBotMentionBrackets,
  sanitizeCoffeeTableReply,
  stripCoffeeSpeakerPrefix,
  updateCoffeeGroup,
  updateCoffeePreset,
  type CoffeeBotProfile,
} from "../coffee.ts";
import {
  coffeeReplyLengthCaps,
  coffeeRouterTemperature,
  DEFAULT_COFFEE_SESSION_SETTINGS,
  normalizeCoffeeSessionSettings,
} from "@localai/shared";

/**
 * Coffee mode is the multi-bot turn-taking primitive that downstream
 * modes (Arena, Polling, Feed) build on. These tests pin the small,
 * pure helpers that decide WHICH bot speaks each turn — the part the
 * design discussion locked as "reactive routing via an LLM moderator
 * with a graceful round-robin fallback when the moderator misfires."
 */

const ALICE: CoffeeBotProfile = {
  id: "bot-alice",
  name: "Alice",
  systemPrompt: "Curious philosopher who loves Socratic questions.",
  color: "#ff6699",
  glyph: "leaf",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const BORIS: CoffeeBotProfile = {
  id: "bot-boris",
  name: "Boris",
  systemPrompt: "Grumpy chef who makes everything about food.",
  color: "#33aa55",
  glyph: "spark",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const CARA: CoffeeBotProfile = {
  id: "bot-cara",
  name: "Cara",
  systemPrompt: "Pragmatic engineer who plans things in lists.",
  color: "#3377ff",
  glyph: "spark",
  localModel: null,
  onlineModel: null,
  defaultModel: null,
  temperature: 0.7,
  maxTokens: 512,
  onlineEnabled: true,
};

const TEST_SOCIAL = {
  disposition: 0.5,
  valuesFriction: 0.25,
  restraint: 0.72,
  engagement: 0.62,
  leavePressure: 0.18,
};

describe("normalizeCoffeeGroupBotIds", () => {
  it("accepts a 2-bot group and preserves caller order", () => {
    const result = normalizeCoffeeGroupBotIds(["bot-a", "bot-b"]);
    assert.deepEqual(result, ["bot-a", "bot-b"]);
  });

  it("dedupes repeated ids before length-checking", () => {
    const result = normalizeCoffeeGroupBotIds(["bot-a", "bot-a", "bot-b", "bot-c"]);
    assert.deepEqual(result, ["bot-a", "bot-b", "bot-c"]);
  });

  it("rejects groups smaller than the minimum size", () => {
    assert.throws(
      () => normalizeCoffeeGroupBotIds(["bot-a"]),
      /Pick at least .* bots/
    );
    assert.throws(
      () => normalizeCoffeeGroupBotIds([]),
      new RegExp(`at least ${COFFEE_GROUP_MIN_SIZE}`)
    );
  });

  it("rejects groups larger than the maximum size", () => {
    const tooMany = Array.from({ length: COFFEE_GROUP_MAX_SIZE + 1 }, (_, i) => `bot-${i}`);
    assert.throws(() => normalizeCoffeeGroupBotIds(tooMany), /max out at/);
  });

  it("ignores non-string entries instead of including them", () => {
    const result = normalizeCoffeeGroupBotIds(["bot-a", 42, null, "bot-b"]);
    assert.deepEqual(result, ["bot-a", "bot-b"]);
  });

  it("throws when the input is not an array", () => {
    assert.throws(() => normalizeCoffeeGroupBotIds("bot-a" as unknown), /Coffee groups need/);
    assert.throws(() => normalizeCoffeeGroupBotIds(undefined), /Coffee groups need/);
  });
});

describe("normalizeCoffeeSeatBotIds", () => {
  it("preserves fixed seat positions while validating occupied seats", () => {
    const result = normalizeCoffeeSeatBotIds([null, "bot-a", null, "bot-b", null]);
    assert.deepEqual(result, [null, "bot-a", null, "bot-b", null]);
  });
});

/**
 * Per-bot "Offline only" lock — the player marks a bot as protected in the
 * bot editor (toggle commits to a 🔒 state). Coffee Sessions must respect
 * that even when the rest of the table is willing to use the online
 * provider: a single protected bot forces its own turn back to local, and
 * the picker UI mirrors that with a "this session will run fully offline"
 * notice. These tests pin the API-side enforcement so the trust isn't UI-
 * deep only.
 */
describe("effectiveCoffeeSpeakerProvider", () => {
  it("forces local when the speaker is offline-only and the table prefers openai", () => {
    assert.equal(effectiveCoffeeSpeakerProvider(false, "openai"), "local");
  });

  it("keeps local when the table already prefers local, regardless of bot setting", () => {
    assert.equal(effectiveCoffeeSpeakerProvider(false, "local"), "local");
    assert.equal(effectiveCoffeeSpeakerProvider(true, "local"), "local");
  });

  it("allows openai when the speaker is online-enabled and the table prefers openai", () => {
    assert.equal(effectiveCoffeeSpeakerProvider(true, "openai"), "openai");
  });
});

function createCoffeeTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      conversation_mode TEXT NOT NULL DEFAULT 'sandbox',
      bot_id TEXT,
      bot_group_ids TEXT,
      coffee_settings TEXT,
      coffee_group_id TEXT,
      coffee_duration_minutes INTEGER,
      coffee_preset_id TEXT,
      coffee_topic TEXT,
      incognito INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      color TEXT,
      glyph TEXT,
      model TEXT,
      local_model TEXT,
      online_model TEXT,
      online_enabled INTEGER NOT NULL DEFAULT 1,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
      visibility TEXT NOT NULL DEFAULT 'private',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE coffee_bot_social_state (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      disposition REAL NOT NULL,
      values_friction REAL NOT NULL,
      restraint REAL NOT NULL,
      engagement REAL NOT NULL,
      leave_pressure REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, bot_id)
    );
    CREATE TABLE coffee_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      coffee_settings TEXT NOT NULL,
      preset_mode TEXT NOT NULL DEFAULT 'manual',
      coffee_topic_mode TEXT NOT NULL DEFAULT 'manual',
      model_choice TEXT NOT NULL DEFAULT '{}',
      mood_summary TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE coffee_group_seats (
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      seat_index INTEGER NOT NULL,
      bot_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, group_id, seat_index)
    );
    CREATE TABLE coffee_presets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      coffee_settings TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE coffee_group_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function seedCoffeeBot(db: DatabaseSync, userId: string, bot: CoffeeBotProfile): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO bots (
      id, user_id, name, system_prompt, color, glyph, model, local_model,
      online_model, online_enabled, temperature, max_tokens, visibility,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', ?, ?)`
  ).run(
    bot.id,
    userId,
    bot.name,
    bot.systemPrompt,
    bot.color,
    bot.glyph,
    bot.defaultModel,
    bot.localModel,
    bot.onlineModel,
    bot.onlineEnabled ? 1 : 0,
    bot.temperature,
    bot.maxTokens,
    now,
    now
  );
}

describe("createCoffeeConversation", () => {
  it("creates an empty Coffee session with frozen bot group ids", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    assert.equal(result.conversation.mode, "coffee");
    assert.equal(result.conversation.botId, null);
    assert.deepEqual(result.conversation.botGroupIds, [ALICE.id, BORIS.id]);
    assert.deepEqual(result.conversation.coffeeSeatBotIds, [
      ALICE.id,
      BORIS.id,
      null,
      null,
      null,
    ]);
    assert.deepEqual(result.conversation.coffeeBotSocialById, {
      [ALICE.id]: {
        disposition: 0.5,
        valuesFriction: 0.35,
        restraint: 0.65,
        engagement: 0.65,
        leavePressure: 0.1,
      },
      [BORIS.id]: {
        disposition: 0.5,
        valuesFriction: 0.35,
        restraint: 0.65,
        engagement: 0.65,
        leavePressure: 0.1,
      },
    });
    assert.equal(result.conversation.messages.length, 0);
    assert.match(result.conversation.title, /Coffee with Alice, Boris/);
    assert.match(result.arrivalScenario, /user-first|partial-table-in-progress|full-table-present/);
    const persistedRows = db
      .prepare(
        "SELECT bot_id, disposition, values_friction, restraint, engagement, leave_pressure FROM coffee_bot_social_state WHERE conversation_id = ? ORDER BY bot_id"
      )
      .all(result.conversation.id) as Array<{ bot_id: string; leave_pressure: number }>;
    assert.equal(persistedRows.length, 2);
    assert.deepEqual(
      persistedRows.map((row) => row.bot_id),
      [ALICE.id, BORIS.id].sort()
    );
    assert.ok(persistedRows.every((row) => row.leave_pressure >= 0 && row.leave_pressure <= 1));
    assert.equal(result.coffeeStarterTopics?.length, 3);
    assert.ok(!result.conversation.coffeeTopic);
  });

  it("persists normalized coffee settings and returns them on the conversation", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      coffeeSettings: {
        responseLength: "brief",
        crossTalk: "chatty",
        responseDelayBias: 999,
        breathingRoom: -5,
      },
    });

    assert.equal(result.conversation.coffeeSettings?.responseLength, "brief");
    assert.equal(result.conversation.coffeeSettings?.crossTalk, "chatty");
    assert.equal(result.conversation.coffeeSettings?.responseDelayBias, 100);

    const row = db
      .prepare("SELECT coffee_settings FROM conversations WHERE id = ?")
      .get(result.conversation.id) as { coffee_settings: string };
    const parsed = JSON.parse(row.coffee_settings) as { responseLength: string };
    assert.equal(parsed.responseLength, "brief");

    const merged = updateCoffeeConversationSettings(db, userId, result.conversation.id, {
      responseLength: "roomy",
    });
    assert.equal(merged.responseLength, "roomy");
    assert.equal(merged.crossTalk, "chatty");
  });
});

describe("Coffee group foundation", () => {
  it("creates a durable Coffee group with fixed seats and settings", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const group = createCoffeeGroup(db, userId, {
      name: "Bikini Bottom Table",
      groupBotIds: [ALICE.id, null, BORIS.id, null, null],
      coffeeSettings: { responseLength: "brief", crossTalk: "chatty" },
    });

    assert.equal(group.name, "Bikini Bottom Table");
    assert.deepEqual(group.botGroupIds, [ALICE.id, BORIS.id]);
    assert.deepEqual(group.coffeeSeatBotIds, [ALICE.id, null, BORIS.id, null, null]);
    assert.equal(group.coffeeSettings.responseLength, "brief");
    assert.equal(group.coffeeSettings.crossTalk, "chatty");
    assert.equal(group.presetMode, "manual");
    assert.equal(group.topicSelectionMode, "manual");

    const events = db
      .prepare("SELECT event_type FROM coffee_group_events WHERE group_id = ?")
      .all(group.id) as Array<{ event_type: string }>;
    assert.deepEqual(events.map((row) => row.event_type), ["created"]);
  });

  it("persists per-group model picker memory across reads and updates", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      modelChoiceByProvider: { local: "llama3.2", openai: "gpt-5.1" },
    });
    assert.deepEqual(group.modelChoiceByProvider, {
      local: "llama3.2",
      openai: "gpt-5.1",
    });

    // Clearing one provider with empty string drops just that key.
    const cleared = updateCoffeeGroup(db, userId, group.id, {
      modelChoiceByProvider: { openai: "" },
    });
    assert.deepEqual(cleared.modelChoiceByProvider, { local: "llama3.2" });

    // "auto" is also treated as cleared.
    const all = updateCoffeeGroup(db, userId, group.id, {
      modelChoiceByProvider: { local: "auto" },
    });
    assert.deepEqual(all.modelChoiceByProvider, {});

    // Set a fresh online value without touching local.
    const next = updateCoffeeGroup(db, userId, group.id, {
      modelChoiceByProvider: { openai: "gpt-5.4-medium" },
    });
    assert.deepEqual(next.modelChoiceByProvider, { openai: "gpt-5.4-medium" });
  });

  it("isolates model picker memory between two groups for the same user", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const group1 = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      modelChoiceByProvider: { local: "llama3.2" },
    });
    const group2 = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      modelChoiceByProvider: { local: "qwen3" },
    });

    assert.deepEqual(group1.modelChoiceByProvider, { local: "llama3.2" });
    assert.deepEqual(group2.modelChoiceByProvider, { local: "qwen3" });

    updateCoffeeGroup(db, userId, group2.id, {
      modelChoiceByProvider: { local: "phi4-mini" },
    });

    const reread1 = updateCoffeeGroup(db, userId, group1.id, { name: group1.name });
    assert.deepEqual(reread1.modelChoiceByProvider, { local: "llama3.2" });
  });

  it("persists auto topic selection on the conversation when the group requests it", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    updateCoffeeGroup(db, userId, group.id, { topicSelectionMode: "auto" });
    const result = await createCoffeeConversationFromGroup(db, userId, group.id, {});
    const topic = result.conversation.coffeeTopic?.trim() ?? "";
    assert.ok(topic.length > 0, "expected server-picked topic on the conversation");
    assert.equal(result.coffeeStarterTopics, undefined);
    const row = db
      .prepare("SELECT coffee_topic FROM conversations WHERE id = ?")
      .get(result.conversation.id) as { coffee_topic: string | null };
    assert.equal(row.coffee_topic, topic);
  });

  it("starts a session from a Coffee group and freezes its snapshot", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const group = createCoffeeGroup(db, userId, {
      name: "Morning Table",
      groupBotIds: [null, ALICE.id, BORIS.id, null, null],
      coffeeSettings: { responseLength: "roomy" },
    });
    const result = await createCoffeeConversationFromGroup(db, userId, group.id, {
      durationMinutes: 10,
    });

    assert.equal(result.conversation.coffeeGroupId, group.id);
    assert.equal(result.conversation.coffeeSessionDurationMinutes, 10);
    assert.deepEqual(result.conversation.coffeeSeatBotIds, [
      null,
      ALICE.id,
      BORIS.id,
      null,
      null,
    ]);
    assert.equal(result.conversation.coffeeSettings?.responseLength, "roomy");

    const row = db
      .prepare("SELECT coffee_group_id, coffee_duration_minutes, bot_group_ids FROM conversations WHERE id = ?")
      .get(result.conversation.id) as {
      coffee_group_id: string | null;
      coffee_duration_minutes: number | null;
      bot_group_ids: string;
    };
    assert.equal(row.coffee_group_id, group.id);
    assert.equal(row.coffee_duration_minutes, 10);
    assert.deepEqual(JSON.parse(row.bot_group_ids), [null, ALICE.id, BORIS.id, null, null]);
  });

  it("rejects unsupported group session durations", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });

    await assert.rejects(
      async () => {
        await createCoffeeConversationFromGroup(db, userId, group.id, { durationMinutes: 15 });
      },
      /1, 5, or 10 minutes/
    );
  });

  it("deletes a Coffee group and permanently removes its sessions", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      name: "Temp Table",
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const session = await createCoffeeConversationFromGroup(db, userId, group.id, {
      durationMinutes: 5,
    });
    const convId = session.conversation.id;

    deleteCoffeeGroup(db, userId, group.id);

    const convRow = db.prepare("SELECT id FROM conversations WHERE id = ?").get(convId);
    assert.equal(convRow, undefined);

    const groupStill = db.prepare("SELECT id FROM coffee_groups WHERE id = ?").get(group.id);
    assert.equal(groupStill, undefined);

    assert.throws(() => deleteCoffeeGroup(db, userId, group.id), /not found/);
  });
});

describe("Coffee presets", () => {
  it("lists built-in presets before user presets", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";

    const created = createCoffeePreset(db, userId, {
      name: "My Table",
      coffeeSettings: { responseLength: "roomy" },
    });
    const presets = listCoffeePresets(db, userId);

    assert.ok(presets.length >= 4);
    assert.ok(presets.slice(0, 3).every((preset) => preset.builtIn));
    assert.equal(presets.at(-1)?.id, created.id);
  });

  it("updates and deletes user presets but protects built-ins", () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    const created = createCoffeePreset(db, userId, {
      name: "Draft",
      coffeeSettings: { responseLength: "brief" },
    });

    const updated = updateCoffeePreset(db, userId, created.id, {
      name: "Saved",
      coffeeSettings: { responseLength: "detailed" },
    });
    assert.equal(updated.name, "Saved");
    assert.equal(updated.settings.responseLength, "detailed");
    assert.throws(
      () => updateCoffeePreset(db, userId, "builtin:quiet-table", { name: "Nope" }),
      /Built-in/
    );
    assert.throws(
      () => deleteCoffeePreset(db, userId, "builtin:quiet-table"),
      /Built-in/
    );
    deleteCoffeePreset(db, userId, created.id);
    assert.equal(listCoffeePresets(db, userId).some((preset) => preset.id === created.id), false);
  });

  it("applies explicit and auto presets when starting group sessions", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const group = createCoffeeGroup(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      coffeeSettings: { responseLength: "brief" },
    });
    const preset = createCoffeePreset(db, userId, {
      name: "Roomy",
      coffeeSettings: { responseLength: "roomy" },
    });

    const explicit = await createCoffeeConversationFromGroup(db, userId, group.id, {
      durationMinutes: 1,
      presetId: preset.id,
    });
    assert.equal(explicit.conversation.coffeeSettings?.responseLength, "roomy");

    updateCoffeeGroup(db, userId, group.id, { presetMode: "auto" });
    const auto = await createCoffeeConversationFromGroup(db, userId, group.id, {
      durationMinutes: 5,
    });
    assert.ok(auto.conversation.coffeeSettings);
    const row = db
      .prepare("SELECT coffee_preset_id FROM conversations WHERE id = ?")
      .get(auto.conversation.id) as { coffee_preset_id: string | null };
    assert.ok(row.coffee_preset_id, "auto preset should snapshot the chosen preset id");
  });
});

describe("Coffee legacy compatibility helpers", () => {
  it("parses legacy plain bot id arrays and fixed seat arrays", () => {
    assert.deepEqual(parseStoredBotGroupIds(JSON.stringify([ALICE.id, BORIS.id])), [
      ALICE.id,
      BORIS.id,
    ]);
    assert.deepEqual(parseStoredBotGroupIds(JSON.stringify([null, ALICE.id, BORIS.id])), [
      ALICE.id,
      BORIS.id,
    ]);
    assert.deepEqual(parseStoredCoffeeSeatBotIds(JSON.stringify([null, ALICE.id, BORIS.id])), [
      null,
      ALICE.id,
      BORIS.id,
      null,
      null,
    ]);
    assert.deepEqual(parseStoredCoffeeSeatBotIds(JSON.stringify([ALICE.id, BORIS.id])), []);
  });

  it("keeps null or malformed Coffee settings on defaults", () => {
    assert.deepEqual(
      parseStoredCoffeeSessionSettings(null),
      normalizeCoffeeSessionSettings(undefined)
    );
    assert.deepEqual(
      parseStoredCoffeeSessionSettings("{ broken"),
      normalizeCoffeeSessionSettings(undefined)
    );
  });
});

describe("buildRouterPrompt", () => {
  it("includes every bot id and persona snippet in the system message", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What should I make for dinner?",
      lastSpeakerBotId: null,
    });
    assert.ok(messages.length >= 2, "expected at least a system + user message");
    const system = messages[0];
    assert.equal(system?.role, "system");
    assert.match(system!.content, /id="bot-alice"/);
    assert.match(system!.content, /id="bot-boris"/);
    assert.match(system!.content, /id="bot-cara"/);
    assert.match(system!.content, /name="Alice"/);
    assert.match(system!.content, /Curious philosopher/);
  });

  it("threads the session topic into the router system prompt when provided", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Hello",
      lastSpeakerBotId: null,
      coffeeTopic: "Soft light through the café window",
    });
    assert.match(messages[0]!.content, /Soft light through the café window/);
    assert.match(messages[0]!.content, /Shared session topic/);
  });

  it("notes the previous speaker and asks for variety when one exists", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Pick a topic.",
      lastSpeakerBotId: "bot-alice",
    });
    const system = messages[0];
    assert.match(system!.content, /last bot to speak was id="bot-alice"/);
    assert.match(system!.content, /Prefer variety/);
  });

  it("indicates a fresh thread when no one has spoken yet", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Hello.",
      lastSpeakerBotId: null,
    });
    assert.match(messages[0]!.content, /No bot has spoken yet/);
    assert.match(messages[0]!.content, /still warming up/);
    assert.match(messages[0]!.content, /should not imply prior friendship/);
  });

  it("allows topic changes without forcing every bot to answer", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Alice just said: The rain feels soft today.",
      lastSpeakerBotId: ALICE.id,
      turnKind: "autonomous",
    });
    assert.match(messages[0]!.content, /gently change topics/);
    assert.match(messages[0]!.content, /Do not force every bot to answer everything/);
  });

  it("adds kickoff guidance when the first autonomous line starts a new session", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "A brand-new Coffee session is starting around the topic.",
      lastSpeakerBotId: null,
      turnKind: "autonomous",
      sessionKickoff: true,
    });
    assert.match(messages[0]!.content, /very first line of a brand-new session/);
    assert.match(messages[0]!.content, /open the table naturally/);
    assert.match(messages[0]!.content, /fresh and specific/);
  });

  it("formats prior bot messages as a clean transcript instead of bracketed assistant labels", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [
        {
          id: "msg-1",
          role: "assistant",
          content: "[Alice (assistant)] What a curious question.",
          botName: "Alice",
          createdAt: new Date().toISOString(),
        },
      ],
      userMessage: "Continue.",
      lastSpeakerBotId: ALICE.id,
    });

    const transcript = messages.find((message) =>
      message.content.includes("Recent table transcript")
    );
    assert.ok(transcript);
    assert.match(transcript!.content, /Alice: What a curious question\./);
    assert.doesNotMatch(transcript!.content, /\[Alice \(assistant\)\]/);
  });

  it("frames autonomous turns as table moments, not fresh user utterances", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Alice just said: What do you think, Boris?",
      lastSpeakerBotId: ALICE.id,
      turnKind: "autonomous",
    });

    const focus = messages.find((message) =>
      message.content.includes("Current autonomous table moment")
    );
    assert.equal(focus?.role, "system");
    assert.match(focus!.content, /Alice just said/);
  });

  it("welcomes bot-to-bot banter when cross-talk is chatty", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Hi.",
      lastSpeakerBotId: ALICE.id,
      sessionSettings: normalizeCoffeeSessionSettings({ crossTalk: "chatty" }),
    });
    assert.match(messages[0]!.content, /Bot-to-bot banter is welcome/i);
    assert.match(messages[0]!.content, /riffing is welcome/i);
  });

  it("adds natural wrap-up speaker-selection guidance near the session end", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "The table has been lively.",
      lastSpeakerBotId: BORIS.id,
      sessionRemainingMs: 19_500,
    });
    assert.match(messages[0]!.content, /Session wrap-up window/);
    assert.match(messages[0]!.content, /closing thought/);
    assert.match(messages[0]!.content, /starting a fresh tangent/);
  });

  it("omits wrap-up speaker-selection guidance outside the final window", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "The table has been lively.",
      lastSpeakerBotId: BORIS.id,
      sessionRemainingMs: 21_000,
    });
    assert.doesNotMatch(messages[0]!.content, /Session wrap-up window/);
  });
});

describe("buildSpeakerPrompt", () => {
  it("includes varied-rhythm and balanced-cap tabletop guidance", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const systemInstruction = messages.find(
      (message) =>
        message.role === "system" &&
        message.content.includes("Coffee Mode") &&
        message.content.includes("110 characters")
    );
    assert.ok(systemInstruction);
    assert.match(systemInstruction!.content, /no line breaks/);
    assert.match(systemInstruction!.content, /one or two short sentences max/i);
    assert.match(systemInstruction!.content, /vary your rhythm across turns/i);
    assert.match(systemInstruction!.content, /Questions are allowed when they naturally move the table/);
    assert.match(systemInstruction!.content, /cutting off another bot mid-sentence/);
    assert.match(systemInstruction!.content, /still warming up/);
    // Cap is now a soft target — the server no longer truncates, so the
    // prompt language reflects "aim for X chars" instead of "Hard cap".
    assert.match(systemInstruction!.content, /soft target around 110 characters/);
    assert.match(systemInstruction!.content, /server no longer truncates/);
    assert.match(systemInstruction!.content, /Never repeat a recent table line exactly/);
    assert.match(systemInstruction!.content, /Never claim to be an AI assistant/);
    assert.match(systemInstruction!.content, /stay in persona/i);
    // Stage-direction format moved from a blanket prohibition to a canonical
    // single-asterisk rule so the renderer can lift `*…*` blocks above the speaker's seat.
    assert.match(systemInstruction!.content, /single asterisks/);
    assert.doesNotMatch(systemInstruction!.content, /Yeah, I get that/);
    assert.doesNotMatch(systemInstruction!.content, /Wild shift/);

    const userTurnInstruction = messages.at(-1);
    assert.equal(userTurnInstruction?.role, "user");
    assert.doesNotMatch(userTurnInstruction!.content, /110 characters/);
    assert.doesNotMatch(userTurnInstruction!.content, /Do not end with a question unless/);
    assert.match(userTurnInstruction!.content, /Alice, answer with your next short table line now/);
  });

  it("threads the session topic into the speaker group context when provided", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      coffeeTopic: "Tiny rituals that keep the week gentle",
    });
    const joined = messages.map((m) => m.content).join("\n");
    assert.match(joined, /Tiny rituals that keep the week gentle/);
    assert.match(joined, /Table topic anchor/);
  });

  it("adds explicit kickoff guidance for a session-opening autonomous turn", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "Start the table.",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      turnKind: "autonomous",
      sessionKickoff: true,
    });
    const combined = messages.map((message) => message.content).join("\n");
    assert.match(combined, /Session opening turn/);
    assert.match(combined, /fresh first beat/);
    assert.match(combined, /Do not imply unseen prior context/);
    assert.match(combined, /again', 'as usual', 'still', or 'like last time'/);
  });

  it("uses roomy caps when session responseLength is roomy", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      sessionSettings: normalizeCoffeeSessionSettings({ responseLength: "roomy" }),
    });
    const combined = messages.map((m) => m.content).join("\n");
    assert.match(combined, /220 characters/);
    assert.doesNotMatch(combined, /48 characters/);
  });

  it("asks the speaker to organically wind down during the final 20 seconds", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "The table has been lively.",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      sessionRemainingMs: 20_000,
    });
    const combined = messages.map((m) => m.content).join("\n");
    assert.match(combined, /final moments/);
    assert.match(combined, /wind down organically/);
    assert.match(combined, /soft farewell/);
    assert.match(combined, /Do not start a new topic/);
  });

  it("does not ask the speaker to wind down before the final 20 seconds", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "The table has been lively.",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
      sessionRemainingMs: 20_001,
    });
    const combined = messages.map((m) => m.content).join("\n");
    assert.doesNotMatch(combined, /final moments/);
    assert.doesNotMatch(combined, /wind down organically/);
  });

  it("teaches the speaker to chip-format direct address with peer-only roster markdown", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const combined = messages.map((m) => m.content).join("\n");
    assert.match(combined, /Direct-address chip format \(use sparingly\)/);
    assert.match(combined, /\[Boris\]\(prism-bot:\/\/bot-boris\)/);
    assert.match(combined, /\[Cara\]\(prism-bot:\/\/bot-cara\)/);
    assert.doesNotMatch(combined, /\[Alice\]\(prism-bot:\/\/bot-alice\)/);
    assert.match(combined, /Most of your lines should NOT call anyone out by name/);
    assert.match(combined, /Third-person references/);
    assert.match(combined, /Never invent a botId/);
    assert.match(combined, /orphan brackets show up as a visible glitch/);
  });

  it("teaches the speaker to use single-asterisk format for stage directions", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: TEST_SOCIAL,
        [BORIS.id]: TEST_SOCIAL,
        [CARA.id]: TEST_SOCIAL,
      },
    });
    const combined = messages.map((m) => m.content).join("\n");
    assert.match(combined, /Stage-direction format/);
    assert.match(combined, /single asterisks/);
    assert.match(combined, /\*pours coffee\*/);
    assert.match(combined, /Coffee Mode is not Markdown-formatted chat/);
    assert.match(combined, /not `the \*thought\* that counts`/);
    assert.match(combined, /Do not put ordinary sentence words inside asterisks/);
    // The old anti-asterisk line must be gone now that we're enabling stage directions.
    assert.doesNotMatch(combined, /No asterisk stage directions/);
  });
});

describe("clampCoffeeTableReplyText", () => {
  it("returns short text untouched after whitespace trim", () => {
    assert.equal(clampCoffeeTableReplyText("  Hello there. "), "Hello there.");
  });

  it("collapses internal whitespace into single spaces", () => {
    assert.equal(clampCoffeeTableReplyText("A\n\nB\tC"), "A B C");
  });

  it("does NOT truncate replies that exceed the soft target — server scrolls instead", () => {
    // Hard truncation was removed (player feedback: scroll > clipped sentence
    // ending in `…`). The cap is now a prompt-side soft target only.
    const filler = `${"word ".repeat(120)}`.trim();
    const out = clampCoffeeTableReplyText(filler, 48);
    assert.equal(out, filler);
    assert.ok(!out.endsWith("…"));
  });

  it("preserves a full chip-mention reply verbatim regardless of length", () => {
    const reply =
      "[SpongeBob](prism-bot://spongebob-id) thinks he's so clever with his Karen paranoia, but what a buffoon.";
    const out = clampCoffeeTableReplyText(reply);
    assert.equal(out, reply);
    assert.ok(!out.endsWith("…"), out);
  });

  it("never drops a chip mention regardless of how short the legacy maxChars is", () => {
    // Even with a tiny `maxChars` arg, the function ignores it now.
    const reply = "abcdefghij [Plankton](prism-bot://plankton-id) more.";
    const out = clampCoffeeTableReplyText(reply, 16);
    assert.equal(out, reply);
    assert.ok(out.includes("[Plankton]"), out);
  });
});

describe("repairBotMentionBrackets", () => {
  const peers = [
    { id: "bot-spongebob", name: "SpongeBob" },
    { id: "bot-mr-krabs", name: "Mr. Krabs" },
    { id: "bot-patrick-star", name: "Patrick Star" },
  ];

  it("repairs an orphan [Name] bracket into a plain canonical peer name", () => {
    const out = repairBotMentionBrackets("[Mr. Krabs] sounds like he's got a nutty idea brewing!", peers);
    assert.equal(out, "Mr. Krabs sounds like he's got a nutty idea brewing!");
  });

  it("matches case-insensitively against the peer roster", () => {
    const out = repairBotMentionBrackets("[spongebob] thinks otherwise.", peers);
    assert.equal(out, "SpongeBob thinks otherwise.");
  });

  it("folds possessive suffixes into the repaired plain name", () => {
    const out = repairBotMentionBrackets("[SpongeBob]'s remark only confirms it.", peers);
    assert.equal(out, "SpongeBob's remark only confirms it.");
  });

  it("leaves a properly-formatted markdown link untouched", () => {
    const reply = "Hi [Mr. Krabs](prism-bot://bot-mr-krabs), how are you?";
    assert.equal(repairBotMentionBrackets(reply, peers), reply);
  });

  it("leaves markdown links with whitespace before the href untouched", () => {
    const reply = "Hi [Mr. Krabs] (prism-bot://bot-mr-krabs), how are you?";
    assert.equal(repairBotMentionBrackets(reply, peers), reply);
  });

  it("leaves brackets that don't match any peer name alone (could be persona prose)", () => {
    const reply = "I have [a feeling] about this.";
    assert.equal(repairBotMentionBrackets(reply, peers), reply);
  });

  it("does nothing when the peer roster is empty", () => {
    const reply = "[Mr. Krabs] is here.";
    assert.equal(repairBotMentionBrackets(reply, []), reply);
  });

  it("repairs multiple orphan brackets in the same reply", () => {
    const out = repairBotMentionBrackets(
      "[SpongeBob] giggled and [Patrick Star] yawned.",
      peers
    );
    assert.equal(
      out,
      "SpongeBob giggled and Patrick Star yawned."
    );
  });
});

describe("coffee repeated reply cleanup", () => {
  it("detects exact recent assistant repeats after punctuation normalization", () => {
    assert.equal(
      coffeeReplyRepeatsRecentAssistant("Yeah I get that", [
        {
          id: "m1",
          role: "assistant",
          content: "Yeah, I get that.",
          createdAt: new Date().toISOString(),
        },
      ]),
      true
    );
  });

  it("allows fresh lines that differ from recent assistant replies", () => {
    assert.equal(
      coffeeReplyRepeatsRecentAssistant("I'm ready, captain.", [
        {
          id: "m1",
          role: "assistant",
          content: "Yeah, I get that.",
          createdAt: new Date().toISOString(),
        },
      ]),
      false
    );
  });

  it("detects repeated conversation motifs even when the exact line changes", () => {
    const history = [
      {
        id: "m1",
        role: "assistant",
        content: "What if the bottom of the sea is just a place for bubbles to float up?",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m2",
        role: "assistant",
        content: "Bubbles don't drown, SpongeBob—they rise, and that's precisely what the sea hates.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m3",
        role: "assistant",
        content: "Aye, and that's why I keep my coins in airtight jars—no room for bubbles or nonsense!",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m4",
        role: "assistant",
        content: "Airtight jars? I keep my snacks in a rock—no room for bubbles or snacking!",
        createdAt: new Date().toISOString(),
      },
    ] as const;

    assert.equal(
      coffeeReplyRepeatsRecentMotifs(
        "Aye, and that's why I keep my coins in airtight jars—no room for bubbles or nonsense!",
        history
      ),
      true
    );
  });

  it("allows a concrete pivot away from the repeated motif cluster", () => {
    const history = [
      {
        id: "m1",
        role: "assistant",
        content: "What if the bottom of the sea is just a place for bubbles to float up?",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m2",
        role: "assistant",
        content: "Bubbles don't drown, SpongeBob—they rise, and that's precisely what the sea hates.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "m3",
        role: "assistant",
        content: "Aye, and that's why I keep my coins in airtight jars—no room for bubbles or nonsense!",
        createdAt: new Date().toISOString(),
      },
    ] as const;

    assert.equal(
      coffeeReplyRepeatsRecentMotifs("The register bell just blinked twice.", history),
      false
    );
  });
});

describe("parseRouterResponse", () => {
  const allowed = ["bot-alice", "bot-boris", "bot-cara"];

  it("parses a clean JSON object response", () => {
    const result = parseRouterResponse(
      `{"botId": "bot-boris", "reason": "talking about food"}`,
      allowed
    );
    assert.deepEqual(result, { botId: "bot-boris", reason: "talking about food" });
  });

  it("recovers JSON wrapped in code-fence-style chatter", () => {
    const result = parseRouterResponse(
      "```json\n{\"botId\": \"bot-cara\", \"reason\": \"engineering question\"}\n```",
      allowed
    );
    assert.equal(result?.botId, "bot-cara");
    assert.equal(result?.reason, "engineering question");
  });

  it("rejects bot ids that are not in the allowed group", () => {
    const result = parseRouterResponse(
      `{"botId": "bot-stranger", "reason": "irrelevant"}`,
      allowed
    );
    assert.equal(result, null);
  });

  it("returns null for malformed responses without throwing", () => {
    assert.equal(parseRouterResponse("not even close to json", allowed), null);
    assert.equal(parseRouterResponse("", allowed), null);
    assert.equal(parseRouterResponse("{ broken json", allowed), null);
  });

  it("supplies a default reason when the LLM omits one", () => {
    const result = parseRouterResponse(
      `{"botId": "bot-alice"}`,
      allowed
    );
    assert.equal(result?.botId, "bot-alice");
    assert.match(result?.reason ?? "", /no reason/i);
  });

  it("accepts a unique bot name when the router returns name-shaped JSON", () => {
    const result = parseRouterResponse(
      `{"botName": "Boris", "reason": "Boris was addressed directly"}`,
      [ALICE, BORIS, CARA]
    );
    assert.deepEqual(result, {
      botId: "bot-boris",
      reason: "Boris was addressed directly",
    });
  });
});

describe("stripCoffeeSpeakerPrefix", () => {
  it("removes copied bracket speaker labels from visible replies", () => {
    assert.equal(
      stripCoffeeSpeakerPrefix("[Mister Rogers (assistant)] I really appreciate that.", "Mister Rogers"),
      "I really appreciate that."
    );
  });

  it("removes copied colon speaker labels from visible replies", () => {
    assert.equal(
      stripCoffeeSpeakerPrefix("Bob Ross: Let's add a little color.", "Bob Ross"),
      "Let's add a little color."
    );
  });
});

describe("coffee prompt leak cleanup", () => {
  it("detects instruction-shaped prompt leakage", () => {
    assert.equal(
      coffeeReplyLooksLikePromptLeak("We need to respond as SpongeBob, one line, no speaker label."),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "We must respond as Patrick Star, short, one clause, 72 characters max."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        '**We must respond as Patrick Star**, short, one clause, 72 characters max.'
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "We need to respond as SpongeBob, one clause only, under 72 characters."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak("We need to respond as Patrick Star."),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "We need to produce a single clause, no line breaks, max 72 characters, no speaker label."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "The user wants a single clause of up to 72 characters, no speaker label."
      ),
      true
    );
  });

  it("does not flag normal visible banter", () => {
    assert.equal(coffeeReplyLooksLikePromptLeak("Yeah, that tracks."), false);
  });

  it("drops prompt-leak replies instead of showing them on the table", () => {
    assert.equal(
      sanitizeCoffeeTableReply(
        "We need to respond as SpongeBob, one line, no speaker label.",
        "SpongeBob"
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "SpongeBob We need to respond as SpongeBob, one clause only, under 72 characters.",
        "SpongeBob"
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "We need to produce a single clause, no line breaks, max 72 characters, no speaker label.",
        "SpongeBob"
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "The user wants a single clause of up to 72 characters, no speaker label.",
        "Plankton"
      ),
      ""
    );
  });

  it("keeps real bot lines and still strips copied speaker labels", () => {
    assert.equal(
      sanitizeCoffeeTableReply("SpongeBob: Yeah, I can do that.", "SpongeBob"),
      "Yeah, I can do that."
    );
  });

  it("downgrades weak noun-like stage tags to plain prose", () => {
    assert.equal(
      sanitizeCoffeeTableReply("*secrets* Snacks are fuel.", "Plankton"),
      "secrets Snacks are fuel."
    );
    assert.equal(
      sanitizeCoffeeTableReply("*enthusiasm* Keep going.", "Squidward"),
      "enthusiasm Keep going."
    );
  });

  it("keeps physical/social stage actions wrapped for seat badges", () => {
    assert.equal(
      sanitizeCoffeeTableReply("*adjusting goggles* Snacks are fuel.", "Plankton"),
      "*adjusting goggles* Snacks are fuel."
    );
    assert.equal(
      sanitizeCoffeeTableReply("*places a hand over his heart* Growth begins now.", "Jesus Christ"),
      "*places a hand over his heart* Growth begins now."
    );
    assert.equal(
      sanitizeCoffeeTableReply("*sips tea* We continue.", "Mr. Krabs"),
      "*sips tea* We continue."
    );
  });
});

describe("coffee character immersion guard", () => {
  it("detects self-identifying AI/model disclaimers", () => {
    assert.equal(
      coffeeReplyBreaksCharacterImmersion(
        "As a digital AI assistant, I can't physically take photos."
      ),
      true
    );
    assert.equal(
      coffeeReplyBreaksCharacterImmersion("I am a language model, so I do not have a body."),
      true
    );
  });

  it("does not flag normal in-character lines", () => {
    assert.equal(
      coffeeReplyBreaksCharacterImmersion("I can sketch the scene right now if you want."),
      false
    );
  });

  it("detects capability denial lines about photos being impossible in chat", () => {
    assert.equal(
      coffeeReplyBreaksCharacterImmersion(
        "I wish I could send you a photo, but I'm afraid that's not possible in this chat."
      ),
      true
    );
    assert.equal(
      coffeeReplyBreaksCharacterImmersion("Sorry, photos aren't possible in this chat."),
      true
    );
  });

  it("drops immersion-breaking replies in sanitizeCoffeeTableReply", () => {
    assert.equal(
      sanitizeCoffeeTableReply(
        "As an AI assistant, I don't have the ability to take photos.",
        "Alan Watts"
      ),
      ""
    );
    assert.equal(
      sanitizeCoffeeTableReply(
        "I wish I could send you a photo, but I'm afraid that's not possible in this chat.",
        "Alan Watts"
      ),
      ""
    );
  });
});

describe("pickFallbackSpeaker", () => {
  it("returns the first bot when no one has spoken yet", () => {
    const result = pickFallbackSpeaker([ALICE, BORIS, CARA], null);
    assert.equal(result.id, "bot-alice");
  });

  it("rotates to the next bot in caller order after a known speaker", () => {
    const after = pickFallbackSpeaker([ALICE, BORIS, CARA], "bot-alice");
    assert.equal(after.id, "bot-boris");
    const wrap = pickFallbackSpeaker([ALICE, BORIS, CARA], "bot-cara");
    assert.equal(wrap.id, "bot-alice");
  });

  it("falls back to the first bot when the prior speaker is no longer in the group", () => {
    const result = pickFallbackSpeaker([ALICE, BORIS], "bot-removed");
    assert.equal(result.id, "bot-alice");
  });

  it("throws if the group is empty (programmer error guard)", () => {
    assert.throws(() => pickFallbackSpeaker([], null), /Coffee group is empty/);
  });
});

describe("pickDirectedSpeaker", () => {
  it("returns null when director mode has no requested bot", () => {
    assert.equal(pickDirectedSpeaker([ALICE, BORIS], undefined), null);
    assert.equal(pickDirectedSpeaker([ALICE, BORIS], null), null);
    assert.equal(pickDirectedSpeaker([ALICE, BORIS], "  "), null);
  });

  it("returns the requested seated bot", () => {
    const result = pickDirectedSpeaker([ALICE, BORIS], "bot-boris");
    assert.equal(result?.id, "bot-boris");
  });

  it("rejects a bot that is not seated at the table", () => {
    assert.throws(
      () => pickDirectedSpeaker([ALICE, BORIS], "bot-cara"),
      /not seated/
    );
  });
});

describe("coffee social state helpers", () => {
  it("clamps social values to the 0-1 range", () => {
    assert.equal(clampCoffeeSocialValue(-0.25), 0);
    assert.equal(clampCoffeeSocialValue(1.25), 1);
    assert.equal(clampCoffeeSocialValue(0.42), 0.42);
  });

  it("initializes missing bot snapshots from defaults", () => {
    const state = initializeCoffeeSocialState([ALICE, BORIS], {
      [ALICE.id]: {
        disposition: 0.75,
        valuesFriction: 0.1,
        restraint: 0.45,
        engagement: 0.8,
        leavePressure: 0.2,
      },
    });
    assert.deepEqual(state[ALICE.id], {
      disposition: 0.75,
      valuesFriction: 0.1,
      restraint: 0.45,
      engagement: 0.8,
      leavePressure: 0.2,
    });
    assert.deepEqual(state[BORIS.id], {
      disposition: 0.5,
      valuesFriction: 0.35,
      restraint: 0.65,
      engagement: 0.65,
      leavePressure: 0.1,
    });
  });

  it("updates speaker and non-speakers deterministically", () => {
    const previous = initializeCoffeeSocialState([ALICE, BORIS], {});
    const next = computeNextCoffeeSocialState({
      previousByBotId: previous,
      group: [ALICE, BORIS],
      speakerBotId: BORIS.id,
      turnKind: "user",
      replyText: "I would rather not go there. Let's move on.",
    });
    assert.ok(next[BORIS.id]!.valuesFriction > previous[BORIS.id]!.valuesFriction);
    assert.ok(next[BORIS.id]!.restraint > previous[BORIS.id]!.restraint);
    assert.ok(next[BORIS.id]!.engagement > previous[BORIS.id]!.engagement);
    assert.ok(next[ALICE.id]!.engagement < previous[ALICE.id]!.engagement);
  });

  it("injects social guardrail context into speaker prompts", () => {
    const prompts = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "What do you think?",
      socialByBotId: {
        [ALICE.id]: {
          disposition: 0.4,
          valuesFriction: 0.8,
          restraint: 0.85,
          engagement: 0.5,
          leavePressure: 0.4,
        },
        [BORIS.id]: {
          disposition: 0.6,
          valuesFriction: 0.2,
          restraint: 0.5,
          engagement: 0.7,
          leavePressure: 0.1,
        },
      },
    });
    const combined = prompts.map((prompt) => prompt.content).join("\n");
    assert.match(combined, /Hidden social metrics for this moment/i);
    assert.match(combined, /Avoid insults or hostile escalation/i);
  });
});

describe("computePlayerInterruptionConsequences", () => {
  it("applies stronger deltas to interrupted bot and light third-party friction", () => {
    const socialByBotId = {
      [ALICE.id]: {
        disposition: 0.58,
        valuesFriction: 0.3,
        restraint: 0.78,
        engagement: 0.7,
        leavePressure: 0.12,
      },
      [BORIS.id]: {
        disposition: 0.46,
        valuesFriction: 0.52,
        restraint: 0.4,
        engagement: 0.63,
        leavePressure: 0.2,
      },
      [CARA.id]: {
        disposition: 0.6,
        valuesFriction: 0.2,
        restraint: 0.8,
        engagement: 0.6,
        leavePressure: 0.15,
      },
    };

    const consequences = computePlayerInterruptionConsequences({
      interruptedBotId: BORIS.id,
      visibleTokenCount: 12,
      group: [ALICE, BORIS, CARA],
      socialByBotId,
    });

    assert.equal(consequences.length, 3);
    const interrupted = consequences.find((entry) => entry.botId === BORIS.id);
    assert.ok(interrupted);
    assert.ok((interrupted?.dispositionDelta ?? 0) < 0);
    assert.ok((interrupted?.valuesFrictionDelta ?? 0) > 0);
    const others = consequences.filter((entry) => entry.botId !== BORIS.id);
    assert.ok(others.every((entry) => entry.valuesFrictionDelta >= 0));
  });
});

describe("maybeBuildBotInterruptionEvent", () => {
  const socialByBotId = {
    [ALICE.id]: {
      disposition: 0.5,
      valuesFriction: 0.25,
      restraint: 0.72,
      engagement: 0.66,
      leavePressure: 0.2,
    },
    [BORIS.id]: {
      disposition: 0.39,
      valuesFriction: 0.9,
      restraint: 0.08,
      engagement: 0.98,
      leavePressure: 0.22,
    },
  };

  it("returns undefined when autonomous-compose gate is not satisfied", () => {
    const noCompose = maybeBuildBotInterruptionEvent({
      turnKind: "autonomous",
      userIsComposing: false,
      speaker: BORIS,
      socialByBotId,
      group: [ALICE, BORIS],
      conversationId: "coffee-gate",
      historyLength: 4,
    });
    assert.equal(noCompose, undefined);

    const wrongTurnKind = maybeBuildBotInterruptionEvent({
      turnKind: "user",
      userIsComposing: true,
      speaker: BORIS,
      socialByBotId,
      group: [ALICE, BORIS],
      conversationId: "coffee-gate",
      historyLength: 4,
    });
    assert.equal(wrongTurnKind, undefined);
  });

  it("emits bounded interruption metadata for at least one deterministic seed", () => {
    let event: ReturnType<typeof maybeBuildBotInterruptionEvent> | undefined;
    for (let attempt = 0; attempt < 180 && !event; attempt += 1) {
      event = maybeBuildBotInterruptionEvent({
        turnKind: "autonomous",
        userIsComposing: true,
        speaker: BORIS,
        socialByBotId,
        group: [ALICE, BORIS],
        conversationId: `coffee-interrupt-${attempt}`,
        historyLength: 12,
      });
    }
    assert.ok(event, "expected at least one seed to produce a rare interruption");
    assert.equal(event?.kind, "botInterruptsPlayer");
    assert.equal(event?.interrupterBotId, BORIS.id);
    assert.ok((event?.socialConsequences.length ?? 0) >= 1);
  });
});

describe("normalizeCoffeeSessionSettings", () => {
  it("returns defaults for non-objects and ignores invalid enums", () => {
    assert.deepEqual(
      normalizeCoffeeSessionSettings(undefined),
      { ...DEFAULT_COFFEE_SESSION_SETTINGS }
    );
    assert.deepEqual(
      normalizeCoffeeSessionSettings({ responseLength: "huge", crossTalk: "loud" }),
      { ...DEFAULT_COFFEE_SESSION_SETTINGS }
    );
  });

  it("clamps numeric sliders and preserves known enum values", () => {
    const s = normalizeCoffeeSessionSettings({
      responseLength: "detailed",
      responseDelayBias: -20,
      breathingRoom: 200,
      stayOnThread: false,
    });
    assert.equal(s.responseLength, "detailed");
    assert.equal(s.responseDelayBias, 0);
    assert.equal(s.breathingRoom, 100);
    assert.equal(s.stayOnThread, false);
  });
});

describe("coffeeReplyLengthCaps", () => {
  it("maps presets to bounded caps", () => {
    const brief = coffeeReplyLengthCaps(normalizeCoffeeSessionSettings({ responseLength: "brief" }));
    assert.deepEqual(brief, { tableReplyMaxChars: 60, speakerMaxOutputTokens: 32 });
    const roomy = coffeeReplyLengthCaps(normalizeCoffeeSessionSettings({ responseLength: "roomy" }));
    assert.deepEqual(roomy, { tableReplyMaxChars: 220, speakerMaxOutputTokens: 140 });
  });
});

describe("coffeeRouterTemperature", () => {
  it("stays within a modest band for extreme delay bias", () => {
    const cold = coffeeRouterTemperature(normalizeCoffeeSessionSettings({ responseDelayBias: 0 }));
    const hot = coffeeRouterTemperature(normalizeCoffeeSessionSettings({ responseDelayBias: 100 }));
    assert.ok(cold >= 0.05 && cold <= 0.45);
    assert.ok(hot >= 0.05 && hot <= 0.45);
    assert.ok(hot > cold);
  });
});

describe("buildCoffeeTableTuningAppendix", () => {
  it("reflects cross-talk and stay-on-thread modes", () => {
    const rare = buildCoffeeTableTuningAppendix(
      normalizeCoffeeSessionSettings({ crossTalk: "rare", stayOnThread: false })
    );
    assert.match(rare, /one clear voice at a time/i);
    assert.match(rare, /Topic shifts are allowed/i);

    const chatty = buildCoffeeTableTuningAppendix(
      normalizeCoffeeSessionSettings({ crossTalk: "chatty", stayOnThread: true })
    );
    assert.match(chatty, /riffing is welcome/i);
    assert.match(chatty, /Discourage hard topic jumps/i);
  });
});

describe("autoTagPeerMentionsInCoffeeReply", () => {
  it("leaves a bare peer name as prose for client-side soft coloring", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "I think Boris is overreacting.",
      ALICE,
      [ALICE, BORIS, CARA]
    );
    assert.equal(out, "I think Boris is overreacting.");
  });

  it("upgrades an @-prefixed peer name", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "@Cara, what do you think?",
      ALICE,
      [ALICE, BORIS, CARA]
    );
    assert.equal(out, "[Cara](prism-bot://bot-cara), what do you think?");
  });

  it("never tags the speaker themselves", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "Alice here. @Boris, your move.",
      ALICE,
      [ALICE, BORIS, CARA]
    );
    assert.match(out, /^Alice here\./);
    assert.match(out, /\[Boris\]\(prism-bot:\/\/bot-boris\)/);
  });

  it("leaves text inside an existing prism-bot link untouched", () => {
    const original = "[Boris](prism-bot://bot-boris) said it best — Boris is right.";
    const out = autoTagPeerMentionsInCoffeeReply(original, ALICE, [ALICE, BORIS, CARA]);
    // The existing link stays a link; the second bare "Boris" stays prose for
    // client-side soft coloring.
    assert.equal(out, original);
  });

  it("does not split a peer name that is part of a longer word", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "Borisland is not a place.",
      ALICE,
      [ALICE, BORIS, CARA]
    );
    assert.equal(out, "Borisland is not a place.");
  });

  it("returns the input unchanged when no peers match", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "Just talking to myself here.",
      ALICE,
      [ALICE, BORIS, CARA]
    );
    assert.equal(out, "Just talking to myself here.");
  });
});
