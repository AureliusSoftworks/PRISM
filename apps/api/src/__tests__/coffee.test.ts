import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { LlmProvider } from "../providers.ts";
import {
  COFFEE_GROUP_MAX_SIZE,
  COFFEE_GROUP_MIN_SIZE,
  autoTagPeerMentionsInCoffeeReply,
  applyCoffeeOrganicSeedToReply,
  buildCoffeeEmergencyFallbackReply,
  buildCoffeeTableTuningAppendix,
  buildRouterPrompt,
  buildSpeakerPrompt,
  clampCoffeeSocialValue,
  clampCoffeeTableReplyText,
  coffeeReplyBreaksCharacterImmersion,
  coffeeMeetingSummarySourceMessages,
  coffeeReplyLooksLikePromptLeak,
  coffeeReplyRepeatsRecentAssistant,
  coffeeReplyRepeatsRecentMotifs,
  coffeeReplyRepeatsPollFallbackShape,
  coffeeSpeakerUsesOrganicSeeds,
  collectCoffeePollVotes,
  computePlayerInterruptionConsequences,
  computeNextCoffeeSocialState,
  createCoffeeGroup,
  createCoffeeConversation,
  createCoffeeConversationFromGroup,
  createCoffeePoll,
  createCoffeePreset,
  deleteCoffeeGroup,
  deleteCoffeePreset,
  getCoffeeSessionPoll,
  updateCoffeeConversationSettings,
  listCoffeePresets,
  effectiveCoffeeSpeakerProvider,
  inferCoffeeGroupName,
  inferCoffeeStarterTopics,
  initializeCoffeeSocialState,
  interruptedSnippetFromTokenCount,
  maybeBuildBotInterruptionEvent,
  normalizeCoffeeGroupBotIds,
  normalizeCoffeeSeatBotIds,
  parseStoredBotGroupIds,
  parseStoredCoffeeSeatBotIds,
  parseStoredCoffeeSessionSettings,
  parseRouterResponse,
  persistCoffeeMeetingSummaryIfNewer,
  pickDirectedSpeaker,
  pickFallbackSpeaker,
  repairBotMentionBrackets,
  shouldRefreshCoffeeMeetingSummary,
  setCoffeeConversationTopic,
  sanitizeCoffeeTableReply,
  kickoffCoffeeMeetingSummaryRefresh,
  stripCoffeeSpeakerPrefix,
  updateCoffeeGroup,
  updateCoffeePreset,
  type CoffeeBotProfile,
} from "../coffee.ts";
import {
  DEFAULT_BOT_PROFILE_FIELDS,
  coffeeReplyLengthCaps,
  coffeeRouterTemperature,
  DEFAULT_COFFEE_SESSION_SETTINGS,
  serializeStoredBotPrompt,
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

const MR_KRABS: CoffeeBotProfile = {
  id: "bot-krabs",
  name: "Mr. Krabs",
  systemPrompt: "Protective restaurant owner who guards the Krabby Patty formula.",
  color: "#ff4444",
  glyph: "anchor",
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

function withStructuredPrompt(
  bot: CoffeeBotProfile,
  options: {
    role?: string;
    purpose?: string;
    interests?: string;
    values?: string;
    traits?: string;
    boundaries?: string;
  }
): CoffeeBotProfile {
  const profile = structuredClone(DEFAULT_BOT_PROFILE_FIELDS);
  if (options.role) profile.identity.role = options.role;
  if (options.purpose) profile.purpose.statement = options.purpose;
  if (options.interests) profile.core.interests = options.interests;
  if (options.values) profile.worldview.values = options.values;
  if (options.traits) profile.core.traits = options.traits;
  if (options.boundaries) profile.core.boundaries = options.boundaries;
  return {
    ...bot,
    systemPrompt: serializeStoredBotPrompt(profile, bot.name),
  };
}

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
      coffee_meeting_summary TEXT,
      coffee_meeting_summary_message_count INTEGER,
      coffee_meeting_summary_updated_at TEXT,
      incognito INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      bot_id TEXT,
      tool_payload TEXT,
      created_at TEXT NOT NULL
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
      flirt_enabled INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE coffee_polls (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_by TEXT NOT NULL DEFAULT 'user',
      closed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE coffee_poll_votes (
      user_id TEXT NOT NULL,
      poll_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      vote_kind TEXT NOT NULL DEFAULT 'pending',
      option_index INTEGER,
      explanation TEXT,
      suggested_option TEXT,
      confidence REAL,
      deliberation_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, poll_id, bot_id)
    );
  `);
  return db;
}

function seedCoffeeBot(db: DatabaseSync, userId: string, bot: CoffeeBotProfile): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO bots (
      id, user_id, name, system_prompt, color, glyph, model, local_model,
      online_model, online_enabled, flirt_enabled, temperature, max_tokens, visibility,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', ?, ?)`
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
    bot.flirtEnabled === true ? 1 : 0,
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

  it("creates and collects an opening Coffee poll for seated bots", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialPoll: {
        question: "Which virtue should guide the table?",
        options: ["Courage", "Temperance", "Wisdom"],
      },
    });

    assert.equal(result.poll?.status, "open");
    assert.equal(result.poll?.votes.length, 2);
    assert.ok(result.poll?.votes.every((vote) => vote.kind === "pending"));

    const activePoll = getCoffeeSessionPoll(db, userId, result.conversation.id);
    assert.equal(activePoll?.id, result.poll?.id);
    assert.equal(activePoll?.question, "Which virtue should guide the table?");

    const deliberating = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 120_000 }
    );

    assert.equal(deliberating.poll.status, "open");
    assert.ok(
      deliberating.poll.votes.every(
        (vote) =>
          vote.kind === "option" &&
          typeof vote.optionIndex === "number" &&
          typeof vote.deliberation?.leaningOptionIndex === "number"
      ),
      "expected bots to choose a poll option before the final window"
    );
    assert.equal(
      deliberating.poll.tallies.reduce((sum, tally) => sum + tally.voteCount, 0),
      2
    );

    const locking = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 15_000 }
    );

    assert.equal(locking.poll.status, "collecting");
    assert.equal(
      locking.poll.votes.every(
        (vote) => vote.kind === "option" && typeof vote.optionIndex === "number"
      ),
      true
    );
    assert.equal(
      locking.poll.tallies.reduce((sum, tally) => sum + tally.voteCount, 0),
      2
    );

    const closed = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 0 }
    );

    assert.equal(closed.poll.status, "closed");
    assert.equal(closed.poll.votes.length, 2);

    const followUpPoll = createCoffeePoll(db, userId, result.conversation.id, {
      question: "What should we discuss next?",
      options: ["Duty", "Rest"],
    });
    assert.equal(followUpPoll.status, "open");
    assert.equal(getCoffeeSessionPoll(db, userId, result.conversation.id)?.id, followUpPoll.id);
  });

  it("ignores prompt-leaked assistant lines when computing poll votes", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialPoll: {
        question: "Who is cooler, Mermaid Man or Barnacle Boy?",
        options: ["Mermaid Man", "Barnacle Boy"],
      },
    });
    const now = "2026-05-23T00:00:00.000Z";
    const insert = db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, NULL, ?)`
    );
    insert.run(
      "valid-mermaid-1",
      result.conversation.id,
      userId,
      "Mermaid Man has the cooler entrance. Mermaid Man owns the theme-song moment.",
      ALICE.id,
      now
    );
    insert.run(
      "valid-mermaid-2",
      result.conversation.id,
      userId,
      "Mermaid Man still wins for me: the belt, the pose, the whole heroic sparkle.",
      BORIS.id,
      now
    );
    insert.run(
      "leaked-barnacle",
      result.conversation.id,
      userId,
      "We need to reply as Patrick Star. The topic is still Mermaid Man versus Barnacle Boy. Patrick is leaning Barnacle Boy. Barnacle Boy, Barnacle Boy, Barnacle Boy.",
      BORIS.id,
      now
    );

    const collected = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 15_000 }
    );

    assert.equal(collected.poll.tallies[0]?.option, "Mermaid Man");
    assert.equal(collected.poll.tallies[0]?.voteCount, 2);
  });

  it("lets Mr. Krabs choose secrecy when his transcript counters crab meat", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, MR_KRABS);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [MR_KRABS.id, BORIS.id],
      initialPoll: {
        question: "Does the Krabby Patty secret formula contain crab meat?",
        options: ["crab meat", "ground up plankton", "sand", "a secret!"],
      },
    });
    const now = "2026-05-23T00:00:00.000Z";
    const insert = db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, NULL, ?)`
    );
    insert.run(
      "krabs-denies-crab",
      result.conversation.id,
      userId,
      "If it were crab meat, the supply chain would betray me; the flavor stays singular because the formula is secret.",
      MR_KRABS.id,
      now
    );
    insert.run(
      "boris-says-crab",
      result.conversation.id,
      userId,
      "The table keeps saying crab meat, crab meat, crab meat.",
      BORIS.id,
      now
    );

    const collected = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 120_000 }
    );
    const krabsVote = collected.poll.votes.find((vote) => vote.botId === MR_KRABS.id);

    assert.equal(krabsVote?.kind, "option");
    assert.equal(
      collected.poll.options[krabsVote?.optionIndex ?? -1],
      "a secret!"
    );
  });

  it("maps true/false poll votes from semantic stance instead of random fallback", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);

    const result = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
      initialPoll: {
        question: "Everyone has a right to free health care",
        options: ["true", "false"],
      },
    });
    const now = "2026-05-23T00:00:00.000Z";
    const insert = db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'assistant', ?, 'local', NULL, ?, NULL, ?)`
    );
    insert.run(
      "alice-supports-health-care",
      result.conversation.id,
      userId,
      "Absolutely. Health care is a human right, not a privilege. We must ensure that everyone can access it without financial burden.",
      ALICE.id,
      now
    );
    insert.run(
      "boris-questions-health-care",
      result.conversation.id,
      userId,
      "Free health care sounds good, but who's paying the bill? Let's focus on a system that works without breaking the bank.",
      BORIS.id,
      now
    );

    const collected = await collectCoffeePollVotes(
      db,
      userId,
      result.conversation.id,
      result.poll?.id ?? "",
      { preferredProvider: "local", sessionRemainingMs: 120_000 }
    );
    const aliceVote = collected.poll.votes.find((vote) => vote.botId === ALICE.id);
    const borisVote = collected.poll.votes.find((vote) => vote.botId === BORIS.id);

    assert.equal(collected.poll.options[aliceVote?.optionIndex ?? -1], "true");
    assert.equal(collected.poll.options[borisVote?.optionIndex ?? -1], "false");
  });

  it("renames the session title to the chosen coffee topic", async () => {
    const db = createCoffeeTestDb();
    const userId = "user-1";
    seedCoffeeBot(db, userId, ALICE);
    seedCoffeeBot(db, userId, BORIS);
    const session = await createCoffeeConversation(db, userId, {
      groupBotIds: [ALICE.id, BORIS.id],
    });
    const topic = "Mercy and power in one room";

    const updated = await setCoffeeConversationTopic(db, userId, session.conversation.id, topic);

    assert.equal(updated.coffeeTopic, topic);
    assert.equal(updated.title, topic);
    const row = db
      .prepare("SELECT title, coffee_topic FROM conversations WHERE id = ?")
      .get(session.conversation.id) as { title: string; coffee_topic: string | null };
    assert.equal(row.coffee_topic, topic);
    assert.equal(row.title, topic);
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
      .prepare("SELECT title, coffee_topic FROM conversations WHERE id = ?")
      .get(result.conversation.id) as { title: string; coffee_topic: string | null };
    assert.equal(row.coffee_topic, topic);
    assert.equal(result.conversation.title, row.title);
    assert.match(row.title, new RegExp(`^${topic.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
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
      durationMinutes: 3,
    });

    assert.equal(result.conversation.coffeeGroupId, group.id);
    assert.equal(result.conversation.coffeeSessionDurationMinutes, 3);
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
    assert.equal(row.coffee_duration_minutes, 3);
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
      /2, 3, or 5 minutes/
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
      durationMinutes: 2,
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
    assert.match(system!.content, /"directive": "<one short next-move cue>"/);
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

  it("threads opening poll results into the router prompt", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Start the table.",
      lastSpeakerBotId: null,
      pollSummary: 'Opening poll: "Virtue?" Top result: Courage (2 votes).',
    });
    assert.match(messages[0]!.content, /Opening poll result/);
    assert.match(messages[0]!.content, /Courage/);
  });

  it("threads meeting-summary context into the router prompt", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Keep it moving.",
      lastSpeakerBotId: ALICE.id,
      meetingSummary:
        "They disagree on who is cooler, but both care about heroic style over strict logic.",
    });
    assert.match(messages[0]!.content, /Meeting summary so far/);
    assert.match(messages[0]!.content, /disagree on who is cooler/);
    assert.match(messages[0]!.content, /prioritize the latest table line/i);
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

  it("adds speaker-balance pressure when recent turns ignore quiet seated bots", () => {
    const messages = buildRouterPrompt({
      group: [ALICE, BORIS, CARA],
      history: [
        { id: "m1", role: "assistant", botName: "Alice", content: "One.", createdAt: new Date().toISOString() },
        { id: "m2", role: "assistant", botName: "Boris", content: "Two.", createdAt: new Date().toISOString() },
        { id: "m3", role: "assistant", botName: "Alice", content: "Three.", createdAt: new Date().toISOString() },
        { id: "m4", role: "assistant", botName: "Boris", content: "Four.", createdAt: new Date().toISOString() },
        { id: "m5", role: "assistant", botName: "Alice", content: "Five.", createdAt: new Date().toISOString() },
        { id: "m6", role: "assistant", botName: "Boris", content: "Six.", createdAt: new Date().toISOString() },
      ],
      userMessage: "Keep going.",
      lastSpeakerBotId: BORIS.id,
    });

    assert.match(messages[0]!.content, /Speaker balance over the last 6 assistant turns/);
    assert.match(messages[0]!.content, /Quiet-but-seated bots: Cara/);
    assert.match(messages[0]!.content, /Balanced organic rule/);
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
    assert.match(messages[0]!.content, /generic echo replies/);
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

describe("inferCoffeeStarterTopics", () => {
  it("feeds structured bot context into the starter-topic inference prompt", async () => {
    const captured: { messages: unknown } = { messages: null };
    const provider = {
      async generateResponse(messages: unknown): Promise<string> {
        captured.messages = messages;
        return JSON.stringify({
          topics: [
            {
              label: "Power with mercy",
              kind: "reflective",
              rationale: "Vader and Jesus can reflect on authority and compassion.",
            },
            {
              label: "Duty versus freedom",
              kind: "tension",
              rationale: "Their values create a useful disagreement.",
            },
            {
              label: "Everyday acts of courage",
              kind: "scenario",
              rationale: "A concrete way into courage and service.",
            },
          ],
        });
      },
    };
    const vader = withStructuredPrompt(ALICE, {
      role: "Imperial commander",
      interests: "ultimate power, command discipline",
      values: "order through strength",
      traits: "cold, strategic",
    });
    const jesus = withStructuredPrompt(BORIS, {
      role: "Teacher",
      purpose: "guide people toward compassion",
      interests: "forgiveness and service",
      values: "love over domination",
      boundaries: "avoid cruelty",
    });

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [vader, jesus],
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
      presetLabel: "Balanced conflict",
    });

    assert.deepEqual(topics, [
      "Power with mercy",
      "Duty versus freedom",
      "Everyday acts of courage",
    ]);
    const userMessage = (captured.messages as Array<{ role: string; content: string }>).find(
      (message) => message.role === "user"
    );
    assert.ok(userMessage);
    assert.match(userMessage!.content, /interests=ultimate power command discipline/);
    assert.match(userMessage!.content, /values=love over domination/);
    assert.match(userMessage!.content, /boundaries=avoid cruelty/);
    assert.match(userMessage!.content, /"label"/);
    assert.match(userMessage!.content, /reflective\/shared curiosity/);
  });

  it("keeps legacy starter-topic string arrays compatible", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return `{"topics":["Power with mercy","Duty versus freedom","Everyday acts of courage"]}`;
      },
    };

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [ALICE, BORIS],
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
    });

    assert.deepEqual(topics, [
      "Power with mercy",
      "Duty versus freedom",
      "Everyday acts of courage",
    ]);
  });

  it("filters generic, duplicate, and dangling starter-topic labels", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return JSON.stringify({
          topics: [
            { label: "1. Worth unpacking", kind: "reflective" },
            { label: "Power with mercy", kind: "reflective" },
            { label: "Power with mercy.", kind: "tension" },
            { label: "bold angle on Stoic ethics as", kind: "scenario" },
            { label: "Duty versus freedom", kind: "tension" },
            { label: "Everyday courage under pressure", kind: "scenario" },
          ],
        });
      },
    };

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [ALICE, BORIS],
      sessionSettings: normalizeCoffeeSessionSettings(undefined),
    });

    assert.deepEqual(topics, [
      "Power with mercy",
      "Duty versus freedom",
      "Everyday courage under pressure",
    ]);
  });

  it("falls back to bot-aware deterministic topics when inference fails", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        throw new Error("offline");
      },
    };
    const vader = withStructuredPrompt(ALICE, {
      interests: "ultimate power",
      values: "order through strength",
    });
    const jesus = withStructuredPrompt(BORIS, {
      interests: "compassion and forgiveness",
      values: "love and mercy",
    });

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [vader, jesus],
      sessionSettings: normalizeCoffeeSessionSettings({ tableEnergy: "still" }),
    });

    assert.equal(topics.length, 3);
    assert.deepEqual(topics, [
      "Power without cruelty",
      "Duty versus forgiveness",
      "When mercy has limits",
    ]);
    assert.ok(topics.every((topic) => !/angle on|Alice and Boris/i.test(topic)));
  });

  it("falls back when starter-topic inference returns invalid JSON", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return "Here are some topics, not JSON.";
      },
    };

    const topics = await inferCoffeeStarterTopics({
      provider: provider as never,
      group: [ALICE, BORIS],
      sessionSettings: normalizeCoffeeSessionSettings({ tableEnergy: "theatre" }),
    });

    assert.equal(topics.length, 3);
    assert.ok(topics.every((topic) => !/angle on|Alice and Boris|worth unpacking/i.test(topic)));
  });
});

describe("inferCoffeeGroupName", () => {
  it("uses bot context and returns a short generated group name", async () => {
    const captured: { messages: unknown } = { messages: null };
    const provider = {
      async generateResponse(messages: unknown): Promise<string> {
        captured.messages = messages;
        return `{"name":"Mercy Meets Empire"}`;
      },
    };
    const vader = withStructuredPrompt(ALICE, {
      role: "Commander",
      interests: "ultimate power and order",
      values: "strength and control",
    });
    const jesus = withStructuredPrompt(BORIS, {
      role: "Teacher",
      interests: "compassion and forgiveness",
      values: "love and mercy",
    });

    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [vader, jesus],
      fallbackName: "Alice & Boris Brew",
    });

    assert.equal(name, "Mercy Meets Empire");
    const userMessage = (captured.messages as Array<{ role: string; content: string }>).find(
      (message) => message.role === "user"
    );
    assert.ok(userMessage);
    assert.match(userMessage!.content, /ultimate power and order/);
    assert.match(userMessage!.content, /love and mercy/);
    assert.match(userMessage!.content, /Do NOT list participant names/);
  });

  it("falls back to a deterministic short name when generation fails", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        throw new Error("offline");
      },
    };
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [ALICE, BORIS],
      fallbackName: "Alice & Boris Brew",
    });
    assert.match(name, /Smart Beans|Roast Council|Brewed Banter Club|Caffeine and Characters/);
  });

  it("rejects roster-style generated names and uses creative fallback instead", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return `{"name":"Coffee with Alice, Boris"}`;
      },
    };
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [ALICE, BORIS],
      fallbackName: "Alice & Boris Brew",
    });
    assert.match(name, /Smart Beans|Roast Council|Brewed Banter Club|Caffeine and Characters/);
  });

  it("prefers the best candidate from a generated list", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        return `{"names":["Coffee Group","Smart Beans","Coffee with Alice, Boris","Brew Circle","Table Club","Cafe Team"]}`;
      },
    };
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [ALICE, BORIS],
      fallbackName: "Alice & Boris Brew",
    });
    assert.equal(name, "Smart Beans");
  });

  it("uses SpongeBob-themed fallback names for SpongeBob rosters", async () => {
    const provider = {
      async generateResponse(): Promise<string> {
        throw new Error("offline");
      },
    };
    const sponge: CoffeeBotProfile = { ...ALICE, id: "bot-sponge", name: "SpongeBob" };
    const patrick: CoffeeBotProfile = { ...BORIS, id: "bot-patrick", name: "Patrick Star" };
    const name = await inferCoffeeGroupName({
      provider: provider as never,
      group: [sponge, patrick],
      fallbackName: "Coffee with SpongeBob, Patrick",
    });
    assert.match(name, /Bikini Bean Bottom|Krusty Koffee Klub|Pineapple Pour-liament|Jellyfish Java Council/);
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
    assert.match(systemInstruction!.content, /Avoid empty acknowledgements like 'I get that'/);
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

  it("threads opening poll results into the speaker group context", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS, CARA],
      history: [],
      userMessage: "Start the table.",
      socialByBotId: {},
      pollSummary: 'Opening poll: "Virtue?" Top result: Courage (2 votes).',
    });
    const joined = messages.map((message) => message.content).join("\n");
    assert.match(joined, /Opening poll result/);
    assert.match(joined, /react to the result/);
  });

  it("threads meeting-summary context into the speaker prompt", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Your turn.",
      socialByBotId: {},
      meetingSummary:
        "Patrick keeps calling Barnacle Boy underrated while SpongeBob keeps defending Mermaid Man's flair.",
    });
    const joined = messages.map((message) => message.content).join("\n");
    assert.match(joined, /Meeting summary so far/);
    assert.match(joined, /Barnacle Boy underrated/);
    assert.match(joined, /React to the latest line first/i);
  });

  it("threads a silent moderator cue into the speaker prompt when provided", () => {
    const messages = buildSpeakerPrompt({
      speaker: ALICE,
      group: [ALICE, BORIS],
      history: [],
      userMessage: "Keep this moving.",
      socialByBotId: {},
      directorCue: "Challenge the strongest claim with one concrete example.",
    });
    const joined = messages.map((message) => message.content).join("\n");
    assert.match(joined, /Silent moderator cue for this turn/);
    assert.match(joined, /Challenge the strongest claim with one concrete example/);
    assert.match(joined, /Do not mention any moderator/i);
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

  it("detects repeated stock poll fallback sentence shapes", () => {
    const history = [
      {
        id: "m1",
        role: "assistant",
        content:
          "freshly ground plankton fits the evidence better for me, unless someone has a sharper counterpoint.",
        createdAt: new Date().toISOString(),
      },
    ] as const;

    assert.equal(
      coffeeReplyRepeatsPollFallbackShape(
        "crab meat fits the evidence better for me, unless someone has a sharper counterpoint.",
        history
      ),
      true
    );
    assert.equal(
      coffeeReplyRepeatsPollFallbackShape("Krabs is sweating like the register just blinked.", history),
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
    assert.deepEqual(result, {
      botId: "bot-boris",
      reason: "talking about food",
      directive: null,
    });
  });

  it("recovers JSON wrapped in code-fence-style chatter", () => {
    const result = parseRouterResponse(
      "```json\n{\"botId\": \"bot-cara\", \"reason\": \"engineering question\"}\n```",
      allowed
    );
    assert.equal(result?.botId, "bot-cara");
    assert.equal(result?.reason, "engineering question");
    assert.equal(result?.directive, null);
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
      directive: null,
    });
  });

  it("accepts router directives and normalizes them", () => {
    const result = parseRouterResponse(
      `{"botId":"bot-alice","reason":"fresh angle","directive":"  Challenge the claim with one concrete counterexample.  "}`,
      allowed
    );
    assert.equal(result?.botId, "bot-alice");
    assert.equal(result?.reason, "fresh angle");
    assert.equal(
      result?.directive,
      "Challenge the claim with one concrete counterexample."
    );
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
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "We need to reply as SpongeBob, following all the constraints. The user wants me to say my next short table line now."
      ),
      true
    );
    assert.equal(
      coffeeReplyLooksLikePromptLeak(
        "The user requests a short line from Patrick Star, presumably about the poll."
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
    assert.equal(
      sanitizeCoffeeTableReply(
        "We need to reply as SpongeBob, following all the constraints. The user wants me to say my next short table line now.",
        "SpongeBob"
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
    assert.equal(
      sanitizeCoffeeTableReply("*dryly sets his cup down* Fine.", "Squidward"),
      "*dryly sets his cup down* Fine."
    );
  });

  it("uses poll-aware emergency fallback lines during active polls", () => {
    const line = buildCoffeeEmergencyFallbackReply({
      tableFocus: "Continue the table.",
      speaker: { id: "bot-sponge", name: "SpongeBob" },
      conversationId: "poll-conv",
      historyLength: 4,
      maxChars: 110,
      activePoll: { options: ["Mermaid Man", "Barnacle Boy"] },
    });

    assert.match(line, /Mermaid Man|Barnacle Boy/);
    assert.doesNotMatch(line, /Let's ground it|Hold that thought|I hear the point/);
  });

  it("keeps poll emergency fallback aligned with the bot's current leaning", () => {
    const line = buildCoffeeEmergencyFallbackReply({
      tableFocus: "Continue the table.",
      speaker: { id: "bot-sponge", name: "SpongeBob" },
      conversationId: "poll-conv",
      historyLength: 7,
      maxChars: 110,
      activePoll: {
        options: ["True", "False"],
        votes: [
          {
            botId: "bot-sponge",
            voterKind: "bot",
            kind: "pending",
            optionIndex: null,
            explanation: null,
            confidence: 0.7,
            deliberation: {
              stage: "evaluating",
              leaningOptionIndex: 0,
              alternateOptionIndex: null,
              confidence: 0.7,
              blocker: null,
              note: null,
              updatedAt: "2026-05-24T00:00:00.000Z",
            },
            createdAt: "2026-05-24T00:00:00.000Z",
            updatedAt: "2026-05-24T00:00:00.000Z",
          },
        ],
      },
    });

    assert.match(line, /True/);
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

describe("coffee meeting summary helpers", () => {
  it("filters prompt-leaked assistant lines out of summary source messages", () => {
    const source = coffeeMeetingSummarySourceMessages([
      { id: "u1", role: "user", content: "Who is cooler?", createdAt: "2026-01-01T00:00:00.000Z" },
      {
        id: "a1",
        role: "assistant",
        content: "Mermaid Man still has the better hero vibe.",
        botName: "SpongeBob",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
      {
        id: "a2",
        role: "assistant",
        content:
          "We need to reply as SpongeBob, following all constraints. The user wants my next short table line now.",
        botName: "SpongeBob",
        createdAt: "2026-01-01T00:00:02.000Z",
      },
    ]);
    assert.equal(source.length, 2);
    assert.equal(source.some((message) => message.id === "a2"), false);
  });

  it("refreshes summaries only after enough new assistant turns", () => {
    assert.equal(
      shouldRefreshCoffeeMeetingSummary({
        assistantMessageCount: 3,
        lastSummarizedAssistantCount: null,
      }),
      false
    );
    assert.equal(
      shouldRefreshCoffeeMeetingSummary({
        assistantMessageCount: 4,
        lastSummarizedAssistantCount: null,
      }),
      true
    );
    assert.equal(
      shouldRefreshCoffeeMeetingSummary({
        assistantMessageCount: 6,
        lastSummarizedAssistantCount: 4,
      }),
      false
    );
    assert.equal(
      shouldRefreshCoffeeMeetingSummary({
        assistantMessageCount: 8,
        lastSummarizedAssistantCount: 4,
      }),
      true
    );
  });

  it("keeps stale summary writes from overwriting newer summary state", () => {
    const db = createCoffeeTestDb();
    const userId = "summary-user";
    db.prepare(
      `INSERT INTO conversations
         (id, user_id, title, conversation_mode, bot_id, bot_group_ids, coffee_settings, coffee_group_id,
          coffee_duration_minutes, coffee_preset_id, coffee_topic, coffee_meeting_summary,
          coffee_meeting_summary_message_count, coffee_meeting_summary_updated_at, incognito, created_at, updated_at)
       VALUES (?, ?, 'Coffee Session', 'coffee', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, ?, ?)`
    ).run("conv-summary", userId, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const firstWrite = persistCoffeeMeetingSummaryIfNewer({
      db,
      userId,
      conversationId: "conv-summary",
      summary: "First pass summary.",
      assistantMessageCount: 8,
      nowIso: "2026-01-01T00:00:08.000Z",
    });
    assert.equal(firstWrite, true);

    const staleWrite = persistCoffeeMeetingSummaryIfNewer({
      db,
      userId,
      conversationId: "conv-summary",
      summary: "Stale summary should not win.",
      assistantMessageCount: 6,
      nowIso: "2026-01-01T00:00:09.000Z",
    });
    assert.equal(staleWrite, false);

    const row = db
      .prepare(
        "SELECT coffee_meeting_summary, coffee_meeting_summary_message_count FROM conversations WHERE id = ?"
      )
      .get("conv-summary") as {
      coffee_meeting_summary: string | null;
      coffee_meeting_summary_message_count: number | null;
    };
    assert.equal(row.coffee_meeting_summary, "First pass summary.");
    assert.equal(row.coffee_meeting_summary_message_count, 8);
  });

  it("swallows summarizer provider failures", async () => {
    const db = createCoffeeTestDb();
    const userId = "summary-user";
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO conversations
         (id, user_id, title, conversation_mode, bot_id, bot_group_ids, coffee_settings, coffee_group_id,
          coffee_duration_minutes, coffee_preset_id, coffee_topic, coffee_meeting_summary,
          coffee_meeting_summary_message_count, coffee_meeting_summary_updated_at, incognito, created_at, updated_at)
       VALUES (?, ?, 'Coffee Session', 'coffee', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, ?, ?)`
    ).run("conv-summary-fail", userId, now, now);

    const history = [
      {
        id: "a1",
        role: "assistant" as const,
        content: "Mermaid Man has stronger flair.",
        botName: "SpongeBob",
        createdAt: now,
      },
      {
        id: "a2",
        role: "assistant" as const,
        content: "Barnacle Boy still has grit.",
        botName: "Patrick Star",
        createdAt: now,
      },
      {
        id: "a3",
        role: "assistant" as const,
        content: "Mermaid Man feels more iconic to me.",
        botName: "SpongeBob",
        createdAt: now,
      },
      {
        id: "a4",
        role: "assistant" as const,
        content: "Barnacle Boy gets my sympathy vote.",
        botName: "Patrick Star",
        createdAt: now,
      },
    ];

    await assert.doesNotReject(() =>
      kickoffCoffeeMeetingSummaryRefresh({
        db,
        userId,
        conversationId: "conv-summary-fail",
        group: [
          { ...ALICE, name: "SpongeBob" },
          { ...BORIS, name: "Patrick Star" },
        ],
        history,
        previousSummary: null,
        previousSummaryAssistantCount: null,
        activePollContext: null,
        summaryProvider: {
          generateResponse: async () => {
            throw new Error("provider offline");
          },
        } as unknown as LlmProvider,
      })
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
  it("builds interrupted snippets from display prose, not markdown or stage actions", () => {
    const snippet = interruptedSnippetFromTokenCount(
      "[Plankton](prism-bot://bot-plankton), *glances around the table* The interesting part is what everyone is dodging.",
      3
    );

    assert.equal(snippet, "Plankton, The intere—");
  });

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

  it("follows a mild-peak-mild bell curve across interruption progress", () => {
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
    const group = [ALICE, BORIS, CARA];
    const early = computePlayerInterruptionConsequences({
      interruptedBotId: BORIS.id,
      visibleTokenCount: 2,
      totalTokenCount: 20,
      group,
      socialByBotId,
    });
    const middle = computePlayerInterruptionConsequences({
      interruptedBotId: BORIS.id,
      visibleTokenCount: 10,
      totalTokenCount: 20,
      group,
      socialByBotId,
    });
    const late = computePlayerInterruptionConsequences({
      interruptedBotId: BORIS.id,
      visibleTokenCount: 18,
      totalTokenCount: 20,
      group,
      socialByBotId,
    });
    const interruptedEarly = early.find((entry) => entry.botId === BORIS.id);
    const interruptedMiddle = middle.find((entry) => entry.botId === BORIS.id);
    const interruptedLate = late.find((entry) => entry.botId === BORIS.id);
    assert.ok(interruptedEarly && interruptedMiddle && interruptedLate);
    assert.ok(Math.abs(interruptedMiddle.dispositionDelta) > Math.abs(interruptedEarly.dispositionDelta));
    assert.ok(Math.abs(interruptedMiddle.dispositionDelta) > Math.abs(interruptedLate.dispositionDelta));
    assert.ok(interruptedMiddle.valuesFrictionDelta > interruptedEarly.valuesFrictionDelta);
    assert.ok(interruptedMiddle.valuesFrictionDelta > interruptedLate.valuesFrictionDelta);
    const thirdPartyEarly = early.find((entry) => entry.botId === ALICE.id);
    const thirdPartyMiddle = middle.find((entry) => entry.botId === ALICE.id);
    const thirdPartyLate = late.find((entry) => entry.botId === ALICE.id);
    assert.ok(thirdPartyEarly && thirdPartyMiddle && thirdPartyLate);
    assert.ok(thirdPartyMiddle.valuesFrictionDelta > thirdPartyEarly.valuesFrictionDelta);
    assert.ok(thirdPartyMiddle.valuesFrictionDelta > thirdPartyLate.valuesFrictionDelta);
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

  it("scales bot interruption social deltas with bounded bell weighting", () => {
    const eventForPrefix = (prefix: string) => {
      for (let attempt = 0; attempt < 220; attempt += 1) {
        const event = maybeBuildBotInterruptionEvent({
          turnKind: "autonomous",
          userIsComposing: true,
          speaker: BORIS,
          socialByBotId,
          group: [ALICE, BORIS],
          conversationId: `${prefix}-${attempt}`,
          historyLength: 12,
        });
        if (event) return event;
      }
      return undefined;
    };
    const eventA = eventForPrefix("coffee-bell-a");
    assert.ok(eventA);
    const speakerA = eventA.socialConsequences.find((entry) => entry.botId === BORIS.id);
    assert.ok(speakerA);
    assert.ok(Math.abs(speakerA.dispositionDelta) <= 0.01);
    assert.ok(Math.abs(speakerA.dispositionDelta) >= 0.004);
    const softenedFound = (() => {
      for (let attempt = 0; attempt < 420; attempt += 1) {
        const event = maybeBuildBotInterruptionEvent({
          turnKind: "autonomous",
          userIsComposing: true,
          speaker: BORIS,
          socialByBotId,
          group: [ALICE, BORIS],
          conversationId: `coffee-bell-soft-${attempt}`,
          historyLength: 12,
        });
        if (!event) continue;
        const speaker = event.socialConsequences.find((entry) => entry.botId === BORIS.id);
        if (!speaker) continue;
        if (Math.abs(speaker.dispositionDelta) < 0.01) return true;
      }
      return false;
    })();
    assert.equal(softenedFound, true);
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

  it("tags @mentions that use learned preferred labels", () => {
    const out = autoTagPeerMentionsInCoffeeReply(
      "@Dr. Freud, what do you think?",
      ALICE,
      [ALICE, BORIS, CARA],
      new Map([[BORIS.id, "Dr. Freud"]])
    );
    assert.equal(out, "[Dr. Freud](prism-bot://bot-boris), what do you think?");
  });
});

function coffeeTestPromptWithProfile(
  overrides: Partial<{
    communicationStyle: "neutral" | "warm" | "concise" | "playful" | "formal";
    birthEra: "ad" | "bc";
    deceased: boolean;
    basedOnRealPersonOrCharacter: boolean;
  }>
): string {
  const fields = structuredClone(DEFAULT_BOT_PROFILE_FIELDS);
  if (overrides.communicationStyle) {
    fields.core.communicationStyle = overrides.communicationStyle;
  }
  if (overrides.birthEra) fields.facts.birthEra = overrides.birthEra;
  if (typeof overrides.deceased === "boolean") fields.facts.deceased = overrides.deceased;
  if (typeof overrides.basedOnRealPersonOrCharacter === "boolean") {
    fields.facts.basedOnRealPersonOrCharacter = overrides.basedOnRealPersonOrCharacter;
  }
  return serializeStoredBotPrompt(fields);
}

describe("coffee organic seed persona gating", () => {
  it("skips transitional beats for formal historical personas", () => {
    const speaker = {
      id: "marcus",
      name: "Marcus Aurelius",
      systemPrompt: coffeeTestPromptWithProfile({
        communicationStyle: "formal",
        birthEra: "bc",
        deceased: true,
        basedOnRealPersonOrCharacter: true,
      }),
    };
    assert.equal(coffeeSpeakerUsesOrganicSeeds(speaker), false);
    const out = applyCoffeeOrganicSeedToReply({
      replyText: "Duty binds us all.",
      conversationId: "conv-1",
      speaker,
      historyLength: 3,
      turnKind: "autonomous",
      avoidTexts: [],
    });
    assert.equal(out, "Duty binds us all.");
  });

  it("allows playful beats for modern playful personas", () => {
    const speaker = {
      id: "sponge",
      name: "SpongeBob",
      systemPrompt: coffeeTestPromptWithProfile({ communicationStyle: "playful" }),
    };
    assert.equal(coffeeSpeakerUsesOrganicSeeds(speaker), true);
    let seeded: string | null = null;
    for (let index = 0; index < 200; index += 1) {
      const out = applyCoffeeOrganicSeedToReply({
        replyText: "Jellyfishing sounds fun.",
        conversationId: `conv-playful-${index}`,
        speaker,
        historyLength: 0,
        turnKind: "autonomous",
        avoidTexts: [],
      });
      if (out !== "Jellyfishing sounds fun.") {
        seeded = out;
        break;
      }
    }
    assert.ok(seeded, "expected at least one deterministic playful seed to apply");
    assert.match(
      seeded!,
      /Jellyfishing sounds fun\.|I know, right\?|kind of wild|that tracks|over my head|this is boring|Didn't see that coming/
    );
  });

  it("threads persona-aware transitional guidance into the speaker prompt", () => {
    const formalSpeaker: CoffeeBotProfile = {
      ...ALICE,
      systemPrompt: coffeeTestPromptWithProfile({
        communicationStyle: "formal",
        birthEra: "bc",
        deceased: true,
        basedOnRealPersonOrCharacter: true,
      }),
    };
    const formalMessages = buildSpeakerPrompt({
      speaker: formalSpeaker,
      group: [formalSpeaker, BORIS],
      history: [],
      userMessage: "What is virtue?",
      socialByBotId: {},
    });
    assert.match(formalMessages[1]!.content, /Do not slip into modern internet slang/);
    assert.doesNotMatch(formalMessages[1]!.content, /kind of wild/);

    const playfulSpeaker: CoffeeBotProfile = {
      ...BORIS,
      systemPrompt: coffeeTestPromptWithProfile({ communicationStyle: "playful" }),
    };
    const playfulMessages = buildSpeakerPrompt({
      speaker: playfulSpeaker,
      group: [playfulSpeaker, ALICE],
      history: [],
      userMessage: "Who wants snacks?",
      socialByBotId: {},
    });
    assert.match(playfulMessages[1]!.content, /playful beat/);
  });
});
