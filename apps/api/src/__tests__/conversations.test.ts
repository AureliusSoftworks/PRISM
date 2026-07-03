import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  buildZenWallpaperHistoryForGeneratedImage,
  clearConversationMessages,
  createDevSeedConversations,
  dedupeActiveZenWallpaperGeneration,
  deleteAllConversations,
  deleteConversation,
  deleteConversationMessage,
  deleteConversationsByBot,
  getConversationSweepState,
  getLatestRememberedZenWallpaperForBot,
  listConversationSummaries,
  mapZenWallpaperMetadata,
  rebaseZenWallpaperMetadataForVisibleWindow,
  recoverStaleZenWallpaperGenerationStatus,
  rewindConversation,
  setZenStarterConversationSuppression,
  sweepConversations,
  undoLatestConversationMessages,
  undoLatestConversationSweep,
} from "../conversations.ts";

/** Stand up an in-memory DB with just the tables deleteConversation touches. */
function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      conversation_mode TEXT NOT NULL DEFAULT 'sandbox',
      bot_id TEXT,
      bot_group_ids TEXT,
      coffee_group_id TEXT,
      coffee_duration_minutes INTEGER,
      coffee_preset_id TEXT,
      coffee_absent_bot_ids TEXT NOT NULL DEFAULT '[]',
      archived_at TEXT,
      archive_batch_id TEXT,
      incognito INTEGER NOT NULL DEFAULT 0,
      zen_wallpaper_enabled INTEGER NOT NULL DEFAULT 0,
      zen_wallpaper_image_id TEXT,
      zen_wallpaper_prompt_seed TEXT,
      zen_wallpaper_message_count INTEGER,
      zen_wallpaper_status TEXT NOT NULL DEFAULT 'idle',
      zen_wallpaper_history TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      zen_mood_sensitivity REAL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      glyph TEXT,
      delete_protected INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE conversation_exports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      markdown TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      prompt TEXT NOT NULL,
      url TEXT NOT NULL,
      local_rel_path TEXT,
      purpose TEXT NOT NULL DEFAULT 'gallery',
      created_at TEXT NOT NULL
    );
    CREATE TABLE memory_summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE zen_session_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE prism_mood_state (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      mood_key TEXT NOT NULL DEFAULT 'neutral',
      confidence REAL NOT NULL DEFAULT 0.5,
      annoyance REAL NOT NULL DEFAULT 0.12,
      warmth REAL NOT NULL DEFAULT 0.62,
      engagement REAL NOT NULL DEFAULT 0.62,
      restraint REAL NOT NULL DEFAULT 0.68,
      recent_deltas TEXT NOT NULL DEFAULT '[]',
      ignore_until TEXT,
      ignore_cooldown_ms INTEGER,
      ignore_forgiveness_chance REAL,
      ignore_penalty_level INTEGER,
      frozen INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, mode)
    );
    CREATE TABLE prism_mood_events (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (user_id, conversation_id, message_id, event_type)
    );
    CREATE TABLE session_opinions (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_scope_key TEXT NOT NULL,
      bot_id TEXT,
      score REAL NOT NULL DEFAULT 50,
      band TEXT NOT NULL DEFAULT 'warming',
      trend TEXT NOT NULL DEFAULT 'steady',
      last_reason TEXT NOT NULL DEFAULT '',
      recent_reasons TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, bot_scope_key)
    );
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      confidence REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'user',
      tier TEXT NOT NULL DEFAULT 'short_term',
      durability REAL NOT NULL DEFAULT 0.5,
      source TEXT NOT NULL DEFAULT 'direct',
      certainty REAL,
      source_message_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE conversation_sweep_batches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      archived_conversation_ids TEXT NOT NULL,
      summary_conversation_ids TEXT NOT NULL,
      created_at TEXT NOT NULL,
      undo_expires_at TEXT NOT NULL,
      undone_at TEXT
    );
    CREATE TABLE coffee_polls (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      closed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE coffee_poll_votes (
      user_id TEXT NOT NULL,
      poll_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      vote_kind TEXT NOT NULL,
      option_index INTEGER,
      explanation TEXT,
      suggested_option TEXT,
      confidence REAL,
      deliberation_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function seedChat(db: DatabaseSync, userId: string, conversationId: string): void {
  const now = new Date().toISOString();
  // Suffix child-row IDs with the conversation id so the same helper can
  // seed multiple chats in a single test without colliding on PRIMARY KEY.
  const suffix = conversationId;
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(conversationId, userId, "Test chat", now, now);
  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(`msg-${suffix}`, conversationId, userId, "user", "hello", now);
  db.prepare(
    "INSERT INTO conversation_exports (id, user_id, conversation_id, markdown, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(`exp-${suffix}`, userId, conversationId, "# export", now);
  db.prepare(
    "INSERT INTO images (id, user_id, conversation_id, prompt, url, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(`img-${suffix}`, userId, conversationId, "a cat", "http://img", now);
  db.prepare(
    "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(`sum-${suffix}`, userId, conversationId, "user likes cats", now);
}

function seedBotChat(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  botId: string | null
): void {
  seedChat(db, userId, conversationId);
  db.prepare(
    "UPDATE conversations SET bot_id = ? WHERE id = ? AND user_id = ?"
  ).run(botId, conversationId, userId);
}

describe("getLatestRememberedZenWallpaperForBot", () => {
  it("returns the newest wallpaper for one bot and ignores gallery/other bot images", () => {
    const db = createTestDb();
    db.prepare(
      "INSERT INTO images (id, user_id, conversation_id, bot_id, prompt, url, purpose, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "bot-old",
      "user-1",
      "conversation-1",
      "bot-1",
      "older shore",
      "/old",
      "wallpaper",
      "2026-01-01T00:00:00.000Z"
    );
    db.prepare(
      "INSERT INTO images (id, user_id, conversation_id, bot_id, prompt, url, purpose, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "bot-gallery",
      "user-1",
      "conversation-2",
      "bot-1",
      "gallery shore",
      "/gallery",
      "gallery",
      "2026-03-01T00:00:00.000Z"
    );
    db.prepare(
      "INSERT INTO images (id, user_id, conversation_id, bot_id, prompt, url, purpose, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "other-new",
      "user-1",
      "conversation-3",
      "bot-2",
      "other shore",
      "/other",
      "wallpaper",
      "2026-04-01T00:00:00.000Z"
    );
    db.prepare(
      "INSERT INTO images (id, user_id, conversation_id, bot_id, prompt, url, purpose, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "bot-new",
      "user-1",
      "conversation-4",
      "bot-1",
      "newer shore",
      "/new",
      "wallpaper",
      "2026-02-01T00:00:00.000Z"
    );

    assert.deepEqual(getLatestRememberedZenWallpaperForBot(db, "user-1", "bot-1"), {
      imageId: "bot-new",
      promptSeed: "newer shore",
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    assert.equal(getLatestRememberedZenWallpaperForBot(db, "user-1", "missing"), null);
    assert.equal(getLatestRememberedZenWallpaperForBot(db, "user-1", null), null);
  });
});

describe("rebaseZenWallpaperMetadataForVisibleWindow", () => {
  it("rebases absolute wallpaper reveal counts to the restored message window", () => {
    const metadata = rebaseZenWallpaperMetadataForVisibleWindow(
      {
        enabled: true,
        imageId: "wallpaper-new",
        promptSeed: "new prompt",
        generationMessageCount: 95,
        status: "ready",
        history: [
          {
            imageId: "wallpaper-old",
            promptSeed: "old prompt",
            generationMessageCount: 30,
            revealStartMessageCount: 34,
            revealFullMessageCount: 46,
          },
          {
            imageId: "wallpaper-new",
            promptSeed: "new prompt",
            generationMessageCount: 95,
            revealStartMessageCount: 99,
            revealFullMessageCount: 111,
          },
        ],
      },
      100,
      80
    );

    assert.equal(metadata.generationMessageCount, 75);
    assert.deepEqual(
      metadata.history.map((entry) => ({
        imageId: entry.imageId,
        generationMessageCount: entry.generationMessageCount,
        revealStartMessageCount: entry.revealStartMessageCount,
        revealFullMessageCount: entry.revealFullMessageCount,
      })),
      [
        {
          imageId: "wallpaper-old",
          generationMessageCount: 10,
          revealStartMessageCount: 14,
          revealFullMessageCount: 26,
        },
        {
          imageId: "wallpaper-new",
          generationMessageCount: 75,
          revealStartMessageCount: 79,
          revealFullMessageCount: 91,
        },
      ]
    );
  });

  it("keeps a legacy current image visible when its stored count is beyond the current thread", () => {
    const metadata = rebaseZenWallpaperMetadataForVisibleWindow(
      {
        enabled: true,
        imageId: "wallpaper-stale",
        promptSeed: "stale prompt",
        generationMessageCount: 8,
        status: "generating",
        history: [],
      },
      5,
      5
    );

    assert.equal(metadata.generationMessageCount, 5);
    assert.deepEqual(metadata.history, [
      {
        imageId: "wallpaper-stale",
        promptSeed: "stale prompt",
        generationMessageCount: 5,
        revealStartMessageCount: 5,
        revealFullMessageCount: 5,
      },
    ]);
  });
});

describe("buildZenWallpaperHistoryForGeneratedImage", () => {
  it("replaces the scroll timeline with an immediately visible wallpaper", () => {
    const history = buildZenWallpaperHistoryForGeneratedImage(
      JSON.stringify([
        {
          imageId: "wallpaper-old",
          promptSeed: "old prompt",
          generationMessageCount: 30,
          revealStartMessageCount: 34,
          revealFullMessageCount: 46,
        },
      ]),
      {
        imageId: "wallpaper-new",
        promptSeed: "new prompt",
        generationMessageCount: 120,
        revealStartMessageCount: 124,
        revealFullMessageCount: 136,
        createdAt: "2026-06-19T12:00:00.000Z",
      },
      {
        latestMessageCount: 120,
        restoreMessageLimit: 80,
        replaceImmediately: true,
      }
    );

    assert.deepEqual(history, [
      {
        imageId: "wallpaper-new",
        promptSeed: "new prompt",
        generationMessageCount: 120,
        revealStartMessageCount: 0,
        revealFullMessageCount: 0,
        createdAt: "2026-06-19T12:00:00.000Z",
      },
    ]);
  });

  it("keeps automatic wallpaper generations on the scroll reveal timeline", () => {
    const history = buildZenWallpaperHistoryForGeneratedImage(
      JSON.stringify([
        {
          imageId: "wallpaper-old",
          promptSeed: "old prompt",
          generationMessageCount: 30,
          revealStartMessageCount: 34,
          revealFullMessageCount: 46,
        },
      ]),
      {
        imageId: "wallpaper-new",
        promptSeed: "new prompt",
        generationMessageCount: 70,
        revealStartMessageCount: 74,
        revealFullMessageCount: 86,
      },
      {
        latestMessageCount: 70,
        restoreMessageLimit: 80,
      }
    );

    assert.deepEqual(
      history.map((entry) => ({
        imageId: entry.imageId,
        revealStartMessageCount: entry.revealStartMessageCount,
        revealFullMessageCount: entry.revealFullMessageCount,
      })),
      [
        {
          imageId: "wallpaper-old",
          revealStartMessageCount: 34,
          revealFullMessageCount: 46,
        },
        {
          imageId: "wallpaper-new",
          revealStartMessageCount: 74,
          revealFullMessageCount: 86,
        },
      ]
    );
  });

  it("keeps distinct forced variants generated at the same message count", () => {
    let rawHistory = "[]";
    for (let index = 0; index < 4; index += 1) {
      const history = buildZenWallpaperHistoryForGeneratedImage(
        rawHistory,
        {
          imageId: `wallpaper-${index + 1}`,
          promptSeed: `theme ${index + 1}`,
          generationMessageCount: 12,
          revealStartMessageCount: index === 0 ? 12 : 16,
          revealFullMessageCount: index === 0 ? 24 : 28,
          createdAt: `2026-06-24T12:00:0${index}.000Z`,
        },
        {
          latestMessageCount: 12,
          restoreMessageLimit: 80,
        }
      );
      rawHistory = JSON.stringify(history);
    }

    const history = JSON.parse(rawHistory) as Array<{
      imageId: string;
      promptSeed: string | null;
      generationMessageCount: number;
    }>;
    assert.deepEqual(
      history.map((entry) => ({
        imageId: entry.imageId,
        promptSeed: entry.promptSeed,
        generationMessageCount: entry.generationMessageCount,
      })),
      [
        {
          imageId: "wallpaper-1",
          promptSeed: "theme 1",
          generationMessageCount: 12,
        },
        {
          imageId: "wallpaper-2",
          promptSeed: "theme 2",
          generationMessageCount: 12,
        },
        {
          imageId: "wallpaper-3",
          promptSeed: "theme 3",
          generationMessageCount: 12,
        },
        {
          imageId: "wallpaper-4",
          promptSeed: "theme 4",
          generationMessageCount: 12,
        },
      ]
    );
  });
});

describe("recoverStaleZenWallpaperGenerationStatus", () => {
  function createWallpaperStatusDb(): DatabaseSync {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        zen_wallpaper_enabled INTEGER NOT NULL DEFAULT 0,
        zen_wallpaper_image_id TEXT,
        zen_wallpaper_prompt_seed TEXT,
        zen_wallpaper_message_count INTEGER,
        zen_wallpaper_history TEXT NOT NULL DEFAULT '[]',
        zen_wallpaper_status TEXT NOT NULL DEFAULT 'idle'
      );
    `);
    return db;
  }

  it("resets orphaned generating rows to ready when an image already exists", () => {
    const db = createWallpaperStatusDb();
    db.prepare(
      "INSERT INTO conversations (id, user_id, zen_wallpaper_image_id, zen_wallpaper_status) VALUES (?, ?, ?, 'generating')"
    ).run("conv-1", "user-1", "img-1");

    recoverStaleZenWallpaperGenerationStatus(db, "user-1", {
      conversationId: "conv-1",
      activeZenWallpaperConversationId: null,
    });

    const row = db
      .prepare("SELECT zen_wallpaper_status FROM conversations WHERE id = ?")
      .get("conv-1") as { zen_wallpaper_status: string };
    assert.equal(row.zen_wallpaper_status, "ready");
    db.close();
  });

  it("leaves the actively generating conversation alone", () => {
    const db = createWallpaperStatusDb();
    db.prepare(
      "INSERT INTO conversations (id, user_id, zen_wallpaper_image_id, zen_wallpaper_status) VALUES (?, ?, NULL, 'generating')"
    ).run("conv-1", "user-1");

    recoverStaleZenWallpaperGenerationStatus(db, "user-1", {
      conversationId: "conv-1",
      activeZenWallpaperConversationId: "conv-1",
    });

    const row = db
      .prepare("SELECT zen_wallpaper_status FROM conversations WHERE id = ?")
      .get("conv-1") as { zen_wallpaper_status: string };
    assert.equal(row.zen_wallpaper_status, "generating");
    db.close();
  });
});

describe("dedupeActiveZenWallpaperGeneration", () => {
  function createActiveWallpaperDb(): DatabaseSync {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        zen_wallpaper_enabled INTEGER NOT NULL DEFAULT 0,
        zen_wallpaper_image_id TEXT,
        zen_wallpaper_prompt_seed TEXT,
        zen_wallpaper_message_count INTEGER,
        zen_wallpaper_status TEXT NOT NULL DEFAULT 'idle',
        zen_wallpaper_history TEXT NOT NULL DEFAULT '[]'
      );
    `);
    return db;
  }

  it("keeps the previous wallpaper metadata while marking the active job generating", () => {
    const db = createActiveWallpaperDb();
    const history = JSON.stringify([
      {
        imageId: "wallpaper-old",
        promptSeed: "blue dusk",
        generationMessageCount: 7,
        revealStartMessageCount: 7,
        revealFullMessageCount: 9,
        createdAt: "2026-06-20T00:00:00.000Z",
      },
    ]);
    db.prepare(
      `INSERT INTO conversations
        (id, user_id, zen_wallpaper_enabled, zen_wallpaper_image_id,
         zen_wallpaper_prompt_seed, zen_wallpaper_message_count,
         zen_wallpaper_status, zen_wallpaper_history)
       VALUES (?, ?, 1, ?, ?, ?, 'ready', ?)`
    ).run("conv-1", "user-1", "wallpaper-old", "blue dusk", 7, history);

    const deduped = dedupeActiveZenWallpaperGeneration(db, "user-1", {
      conversationId: "conv-1",
      activeZenWallpaperConversationId: "conv-1",
      enabled: true,
    });

    assert.equal(deduped, true);
    const row = db
      .prepare(
        `SELECT zen_wallpaper_enabled, zen_wallpaper_image_id,
                zen_wallpaper_prompt_seed, zen_wallpaper_message_count,
                zen_wallpaper_status, zen_wallpaper_history
           FROM conversations WHERE id = ?`
      )
      .get("conv-1") as {
      zen_wallpaper_enabled: number;
      zen_wallpaper_image_id: string | null;
      zen_wallpaper_prompt_seed: string | null;
      zen_wallpaper_message_count: number | null;
      zen_wallpaper_status: string;
      zen_wallpaper_history: string;
    };
    assert.equal(row.zen_wallpaper_enabled, 1);
    assert.equal(row.zen_wallpaper_image_id, "wallpaper-old");
    assert.equal(row.zen_wallpaper_prompt_seed, "blue dusk");
    assert.equal(row.zen_wallpaper_message_count, 7);
    assert.equal(row.zen_wallpaper_status, "generating");
    assert.equal(row.zen_wallpaper_history, history);
    assert.deepEqual(mapZenWallpaperMetadata(row), {
      enabled: true,
      imageId: "wallpaper-old",
      promptSeed: "blue dusk",
      generationMessageCount: 7,
      status: "generating",
      history: [
        {
          imageId: "wallpaper-old",
          promptSeed: "blue dusk",
          generationMessageCount: 7,
          revealStartMessageCount: 7,
          revealFullMessageCount: 9,
          createdAt: "2026-06-20T00:00:00.000Z",
        },
      ],
    });
    db.close();
  });

  it("marks an active first wallpaper generation without inventing an image", () => {
    const db = createActiveWallpaperDb();
    db.prepare(
      `INSERT INTO conversations
        (id, user_id, zen_wallpaper_enabled, zen_wallpaper_status)
       VALUES (?, ?, 1, 'idle')`
    ).run("conv-1", "user-1");

    const deduped = dedupeActiveZenWallpaperGeneration(db, "user-1", {
      conversationId: "conv-1",
      activeZenWallpaperConversationId: "conv-1",
      enabled: true,
    });

    assert.equal(deduped, true);
    const row = db
      .prepare(
        `SELECT zen_wallpaper_image_id, zen_wallpaper_message_count,
                zen_wallpaper_status, zen_wallpaper_history
           FROM conversations WHERE id = ?`
      )
      .get("conv-1") as {
      zen_wallpaper_image_id: string | null;
      zen_wallpaper_message_count: number | null;
      zen_wallpaper_status: string;
      zen_wallpaper_history: string;
    };
    assert.equal(row.zen_wallpaper_image_id, null);
    assert.equal(row.zen_wallpaper_message_count, null);
    assert.equal(row.zen_wallpaper_status, "generating");
    assert.equal(row.zen_wallpaper_history, "[]");
    db.close();
  });

  it("dedupes enabled requests, including forced-style retries, but not disable requests", () => {
    const db = createActiveWallpaperDb();
    db.prepare(
      `INSERT INTO conversations
        (id, user_id, zen_wallpaper_enabled, zen_wallpaper_image_id,
         zen_wallpaper_status)
       VALUES (?, ?, 1, ?, 'ready')`
    ).run("conv-1", "user-1", "wallpaper-old");

    assert.equal(
      dedupeActiveZenWallpaperGeneration(db, "user-1", {
        conversationId: "conv-1",
        activeZenWallpaperConversationId: "conv-1",
        enabled: true,
      }),
      true
    );
    assert.equal(
      dedupeActiveZenWallpaperGeneration(db, "user-1", {
        conversationId: "conv-1",
        activeZenWallpaperConversationId: "conv-1",
        enabled: false,
      }),
      false
    );
    assert.equal(
      dedupeActiveZenWallpaperGeneration(db, "user-1", {
        conversationId: "conv-1",
        activeZenWallpaperConversationId: "other-conv",
        enabled: true,
      }),
      false
    );
    db.close();
  });
});

function seedListConversation(
  db: DatabaseSync,
  options: {
    id: string;
    userId: string;
    title: string;
    updatedAt: string;
    mode?: "zen" | "chat" | "sandbox" | "coffee";
    incognito?: boolean;
    archivedAt?: string | null;
    botId?: string | null;
    botGroupIds?: string[];
    coffeeGroupId?: string | null;
    coffeeAbsentBotIds?: string[];
    assistantBotId?: string | null;
  }
): void {
  db.prepare(
    `INSERT INTO conversations (
      id, user_id, title, conversation_mode, bot_id, bot_group_ids, coffee_group_id,
      coffee_absent_bot_ids, archived_at, incognito, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    options.id,
    options.userId,
    options.title,
    options.mode ?? "sandbox",
    options.botId ?? null,
    options.botGroupIds ? JSON.stringify(options.botGroupIds) : null,
    options.coffeeGroupId ?? null,
    JSON.stringify(options.coffeeAbsentBotIds ?? []),
    options.archivedAt ?? null,
    options.incognito ? 1 : 0,
    "2026-01-01T00:00:00.000Z",
    options.updatedAt
  );

  if (options.assistantBotId !== undefined) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      `assistant-${options.id}`,
      options.id,
      options.userId,
      "assistant",
      "hello",
      options.assistantBotId,
      options.updatedAt
    );
  }
}

function seedStarterOnlyZenConversation(
  db: DatabaseSync,
  options: {
    id: string;
    userId: string;
    archivedAt?: string | null;
    includeUserMessage?: boolean;
  }
): void {
  const now = "2026-01-01T00:00:00.000Z";
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, conversation_mode, archived_at, incognito, created_at, updated_at) VALUES (?, ?, ?, 'zen', ?, 0, ?, ?)"
  ).run(options.id, options.userId, "Zen", options.archivedAt ?? null, now, now);
  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, 'assistant', ?, ?)"
  ).run(`assistant-${options.id}`, options.id, options.userId, "hello", now);
  if (options.includeUserMessage) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, 'user', ?, ?)"
    ).run(`user-${options.id}`, options.id, options.userId, "follow up", now);
  }
}

describe("listConversationSummaries", () => {
  it("excludes persisted private conversations from the sidebar list", () => {
    const db = createTestDb();
    seedListConversation(db, {
      id: "saved-1",
      userId: "user-1",
      title: "Saved chat",
      updatedAt: "2026-01-01T00:00:03.000Z",
    });
    seedListConversation(db, {
      id: "private-1",
      userId: "user-1",
      title: "Private chat",
      updatedAt: "2026-01-01T00:00:04.000Z",
      incognito: true,
    });
    seedListConversation(db, {
      id: "other-user",
      userId: "user-2",
      title: "Other user chat",
      updatedAt: "2026-01-01T00:00:05.000Z",
    });

    const conversations = listConversationSummaries(db, "user-1");

    assert.deepEqual(
      conversations.map(c => c.id),
      ["saved-1"]
    );
    assert.ok(conversations.every(c => !c.incognito));
  });

  it("keeps public conversation row metadata for sidebar coloring", () => {
    const db = createTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "bot-1",
      "user-1",
      "Storm Bot",
      "#67e8f9",
      "triangle",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );
    seedListConversation(db, {
      id: "saved-1",
      userId: "user-1",
      title: "Saved chat",
      botId: "bot-1",
      assistantBotId: "bot-1",
      updatedAt: "2026-01-01T00:00:03.000Z",
    });

    const [conversation] = listConversationSummaries(db, "user-1");

    assert.equal(conversation?.botId, "bot-1");
    assert.equal(conversation?.lastBotId, "bot-1");
    assert.equal(conversation?.lastBotColor, "#67e8f9");
    assert.equal(conversation?.hasAssistantReply, true);
  });

  it("hides archived conversations from the sidebar list", () => {
    const db = createTestDb();
    seedListConversation(db, {
      id: "active-1",
      userId: "user-1",
      title: "Active chat",
      updatedAt: "2026-01-01T00:00:02.000Z",
    });
    seedListConversation(db, {
      id: "archived-1",
      userId: "user-1",
      title: "Archived chat",
      updatedAt: "2026-01-01T00:00:03.000Z",
      archivedAt: "2026-01-02T00:00:00.000Z",
    });

    const conversations = listConversationSummaries(db, "user-1");
    assert.deepEqual(conversations.map((conversation) => conversation.id), ["active-1"]);
  });

  it("includes Coffee invitees who were absent from a saved session", () => {
    const db = createTestDb();
    seedListConversation(db, {
      id: "coffee-1",
      userId: "user-1",
      title: "Moody table",
      mode: "coffee",
      botGroupIds: ["bot-alice", "bot-cara"],
      coffeeGroupId: "group-1",
      coffeeAbsentBotIds: ["bot-boris"],
      updatedAt: "2026-01-01T00:00:02.000Z",
    });

    const [conversation] = listConversationSummaries(db, "user-1");

    assert.equal(conversation?.mode, "coffee");
    assert.deepEqual(conversation?.botGroupIds, ["bot-alice", "bot-cara"]);
    assert.deepEqual(conversation?.coffeeAbsentBotIds, ["bot-boris"]);
  });
});

describe("setZenStarterConversationSuppression", () => {
  it("archives and promotes an uncontinued Zen starter conversation", () => {
    const db = createTestDb();
    seedStarterOnlyZenConversation(db, { id: "zen-1", userId: "user-1" });

    const suppressed = setZenStarterConversationSuppression(
      db,
      "user-1",
      "zen-1",
      true
    );

    assert.deepEqual(suppressed, { conversationId: "zen-1", suppressed: true });
    const archived = db
      .prepare("SELECT archived_at FROM conversations WHERE id = ?")
      .get("zen-1") as { archived_at: string | null };
    assert.ok(archived.archived_at, "starter should be hidden from Zen auto-open");

    const promoted = setZenStarterConversationSuppression(
      db,
      "user-1",
      "zen-1",
      false
    );

    assert.deepEqual(promoted, { conversationId: "zen-1", suppressed: false });
    const restored = db
      .prepare("SELECT archived_at FROM conversations WHERE id = ?")
      .get("zen-1") as { archived_at: string | null };
    assert.equal(restored.archived_at, null);
  });

  it("archives and promotes continued Zen conversations", () => {
    const db = createTestDb();
    seedStarterOnlyZenConversation(db, {
      id: "zen-1",
      userId: "user-1",
      includeUserMessage: true,
    });

    const suppressed = setZenStarterConversationSuppression(
      db,
      "user-1",
      "zen-1",
      true
    );

    assert.deepEqual(suppressed, { conversationId: "zen-1", suppressed: true });
    const archived = db
      .prepare("SELECT archived_at FROM conversations WHERE id = ?")
      .get("zen-1") as { archived_at: string | null };
    assert.ok(archived.archived_at, "continued Zen chat should be suppressible");

    const promoted = setZenStarterConversationSuppression(
      db,
      "user-1",
      "zen-1",
      false
    );

    assert.deepEqual(promoted, { conversationId: "zen-1", suppressed: false });
    const restored = db
      .prepare("SELECT archived_at FROM conversations WHERE id = ?")
      .get("zen-1") as { archived_at: string | null };
    assert.equal(restored.archived_at, null);
  });
});

describe("deleteConversation", () => {
  it("removes the chat, its messages, and its exports", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");

    deleteConversation(db, "user-1", "chat-1");

    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations").get() as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversation_exports").get() as { n: number }).n,
      0
    );
  });

  it("removes Coffee polls and votes with the deleted session", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "coffee-1");
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE conversations SET conversation_mode = 'coffee' WHERE id = ? AND user_id = ?"
    ).run("coffee-1", "user-1");
    db.prepare(
      "INSERT INTO coffee_polls (id, user_id, conversation_id, question, options_json, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "poll-1",
      "user-1",
      "coffee-1",
      "Where should we go?",
      JSON.stringify(["Beach", "Diner"]),
      "open",
      "user",
      now,
      now
    );
    db.prepare(
      "INSERT INTO coffee_poll_votes (user_id, poll_id, conversation_id, bot_id, vote_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("user-1", "poll-1", "coffee-1", "bot-1", "pending", now, now);

    deleteConversation(db, "user-1", "coffee-1");

    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM coffee_polls").get() as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM coffee_poll_votes").get() as { n: number }).n,
      0
    );
  });

  it("preserves images, summaries, and memories, untying them from the deleted chat", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    insertLinkedMemory(db, "user-1", "chat-1", "memory-chat-1", ["msg-chat-1"]);

    deleteConversation(db, "user-1", "chat-1");

    const image = db
      .prepare("SELECT id, conversation_id FROM images WHERE id = ?")
      .get("img-chat-1") as { id: string; conversation_id: string | null } | undefined;
    assert.ok(image, "image should still exist");
    assert.equal(image?.conversation_id, null);

    const summary = db
      .prepare("SELECT id, conversation_id FROM memory_summaries WHERE id = ?")
      .get("sum-chat-1") as { id: string; conversation_id: string | null } | undefined;
    assert.ok(summary, "memory summary should still exist");
    assert.equal(summary?.conversation_id, null);

    const memory = db
      .prepare("SELECT id, conversation_id FROM memories WHERE id = ?")
      .get("memory-chat-1") as { id: string; conversation_id: string | null } | undefined;
    assert.ok(memory, "memory should still exist");
    assert.equal(memory?.conversation_id, null);
  });

  it("rejects deletion attempts by a different user", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");

    assert.throws(
      () => deleteConversation(db, "user-2", "chat-1"),
      /Conversation not found/
    );

    // Verify the data is still intact after the failed attempt.
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations").get() as { n: number }).n,
      1
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n,
      1
    );
  });

  it("throws when the conversation does not exist", () => {
    const db = createTestDb();
    assert.throws(
      () => deleteConversation(db, "user-1", "does-not-exist"),
      /Conversation not found/
    );
  });

  it("leaves other users' chats untouched", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    seedChat(db, "user-2", "chat-2");

    deleteConversation(db, "user-1", "chat-1");

    const otherChat = db
      .prepare("SELECT id FROM conversations WHERE id = ?")
      .get("chat-2") as { id?: string } | undefined;
    assert.equal(otherChat?.id, "chat-2");
  });
});

describe("clearConversationMessages", () => {
  it("empties a zen chat without deleting the conversation row", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    insertLinkedMemory(db, "user-1", "chat-1", "memory-chat-1", ["msg-chat-1"]);
    db.prepare(
      "UPDATE conversations SET conversation_mode = 'zen' WHERE id = ? AND user_id = ?"
    ).run("chat-1", "user-1");
    db.prepare(
      "INSERT INTO session_opinions (user_id, conversation_id, bot_scope_key, score, band, trend, last_reason, recent_reasons, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "user-1",
      "chat-1",
      "__default__",
      64,
      "open",
      "warmer",
      "A prior turn existed.",
      JSON.stringify(["A prior turn existed."]),
      "2026-01-01T00:00:00.000Z"
    );

    const result = clearConversationMessages(db, "user-1", "chat-1");

    assert.deepEqual(result, {
      deletedMessages: 1,
      deletedSummaries: 1,
      deletedExports: 1,
    });
    const conversation = db
      .prepare("SELECT id, title, conversation_mode FROM conversations WHERE id = ?")
      .get("chat-1") as { id: string; title: string; conversation_mode: string } | undefined;
    assert.equal(conversation?.id, "chat-1");
    assert.equal(conversation?.title, "New chat");
    assert.equal(conversation?.conversation_mode, "zen");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?")
        .get("chat-1") as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM memory_summaries WHERE conversation_id = ?")
        .get("chat-1") as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversation_exports WHERE conversation_id = ?")
        .get("chat-1") as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM session_opinions WHERE conversation_id = ?")
        .get("chat-1") as { n: number }).n,
      0
    );
    const image = db
      .prepare("SELECT conversation_id FROM images WHERE id = ?")
      .get("img-chat-1") as { conversation_id: string | null } | undefined;
    assert.equal(image?.conversation_id, null);
    const memory = db
      .prepare("SELECT conversation_id FROM memories WHERE id = ?")
      .get("memory-chat-1") as { conversation_id: string | null } | undefined;
    assert.equal(memory?.conversation_id, null);
  });

  it("clears stale Zen wallpaper metadata while preserving Atmosphere enablement", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    db.prepare(
      `UPDATE conversations
          SET conversation_mode = 'zen',
              zen_wallpaper_enabled = 1,
              zen_wallpaper_image_id = ?,
              zen_wallpaper_prompt_seed = ?,
              zen_wallpaper_message_count = ?,
              zen_wallpaper_status = 'ready',
              zen_wallpaper_history = ?
        WHERE id = ? AND user_id = ?`
    ).run(
      "wallpaper-old",
      "old prompt",
      12,
      JSON.stringify([
        {
          imageId: "wallpaper-old",
          promptSeed: "old prompt",
          generationMessageCount: 12,
          revealStartMessageCount: 16,
          revealFullMessageCount: 28,
        },
      ]),
      "chat-1",
      "user-1"
    );

    clearConversationMessages(db, "user-1", "chat-1");

    const conversation = db
      .prepare(
        `SELECT zen_wallpaper_enabled, zen_wallpaper_image_id,
                zen_wallpaper_prompt_seed, zen_wallpaper_message_count,
                zen_wallpaper_status, zen_wallpaper_history
           FROM conversations
          WHERE id = ? AND user_id = ?`
      )
      .get("chat-1", "user-1") as
      | {
          zen_wallpaper_enabled: number;
          zen_wallpaper_image_id: string | null;
          zen_wallpaper_prompt_seed: string | null;
          zen_wallpaper_message_count: number | null;
          zen_wallpaper_status: string;
          zen_wallpaper_history: string;
        }
      | undefined;

    assert.equal(conversation?.zen_wallpaper_enabled, 1);
    assert.equal(conversation?.zen_wallpaper_image_id, null);
    assert.equal(conversation?.zen_wallpaper_prompt_seed, null);
    assert.equal(conversation?.zen_wallpaper_message_count, null);
    assert.equal(conversation?.zen_wallpaper_status, "idle");
    assert.equal(conversation?.zen_wallpaper_history, "[]");
  });

  it("leaves other users' chat context untouched", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    seedChat(db, "user-2", "chat-2");

    clearConversationMessages(db, "user-1", "chat-1");

    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?")
        .get("user-2") as { n: number }).n,
      1
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?")
        .get("user-2") as { n: number }).n,
      1
    );
    const otherSummary = db
      .prepare("SELECT conversation_id FROM memory_summaries WHERE user_id = ?")
      .get("user-2") as { conversation_id: string | null } | undefined;
    assert.equal(otherSummary?.conversation_id, "chat-2");
  });

  it("rejects Coffee conversations", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "coffee-1");
    db.prepare(
      "UPDATE conversations SET conversation_mode = 'coffee' WHERE id = ? AND user_id = ?"
    ).run("coffee-1", "user-1");

    assert.throws(
      () => clearConversationMessages(db, "user-1", "coffee-1"),
      /Coffee conversations cannot be cleared/
    );
  });
});

describe("deleteAllConversations", () => {
  it("removes every chat, its messages, and its exports for the given user", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    seedChat(db, "user-1", "chat-2");
    seedChat(db, "user-1", "chat-3");

    const deleted = deleteAllConversations(db, "user-1");

    assert.equal(deleted, 3);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?")
        .get("user-1") as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?")
        .get("user-1") as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversation_exports WHERE user_id = ?")
        .get("user-1") as { n: number }).n,
      0
    );
  });

  it("preserves images and memory summaries across every cleared chat", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    seedChat(db, "user-1", "chat-2");

    deleteAllConversations(db, "user-1");

    // Both images should survive, untied from their (now-deleted) chats.
    const images = db
      .prepare(
        "SELECT id, conversation_id FROM images WHERE user_id = ? ORDER BY id"
      )
      .all("user-1") as Array<{ id: string; conversation_id: string | null }>;
    assert.equal(images.length, 2);
    assert.ok(images.every(img => img.conversation_id === null));

    const summaries = db
      .prepare(
        "SELECT id, conversation_id FROM memory_summaries WHERE user_id = ? ORDER BY id"
      )
      .all("user-1") as Array<{ id: string; conversation_id: string | null }>;
    assert.equal(summaries.length, 2);
    assert.ok(summaries.every(sum => sum.conversation_id === null));
  });

  it("returns 0 and is a no-op when the user has no chats", () => {
    const db = createTestDb();
    seedChat(db, "user-2", "chat-2");

    const deleted = deleteAllConversations(db, "user-1");

    assert.equal(deleted, 0);
    // Other user's chat must be intact.
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?")
        .get("user-2") as { n: number }).n,
      1
    );
  });

  it("leaves other users' chats, messages, and exports untouched", () => {
    const db = createTestDb();
    seedChat(db, "user-1", "chat-1");
    seedChat(db, "user-1", "chat-2");
    seedChat(db, "user-2", "chat-3");

    const deleted = deleteAllConversations(db, "user-1");

    assert.equal(deleted, 2);

    // user-2's row counts should be unchanged.
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?")
        .get("user-2") as { n: number }).n,
      1
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?")
        .get("user-2") as { n: number }).n,
      1
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversation_exports WHERE user_id = ?")
        .get("user-2") as { n: number }).n,
      1
    );
    // And user-2's artifacts still tied to their chat.
    const otherImage = db
      .prepare("SELECT conversation_id FROM images WHERE user_id = ?")
      .get("user-2") as { conversation_id: string | null } | undefined;
    assert.equal(otherImage?.conversation_id, "chat-3");
  });
});

describe("deleteConversationsByBot", () => {
  it("removes only saved conversations for the requested bot", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "bot-chat-1", "bot-1");
    seedBotChat(db, "user-1", "bot-chat-2", "bot-1");
    seedBotChat(db, "user-1", "other-bot-chat", "bot-2");
    seedBotChat(db, "user-1", "default-chat", null);
    seedBotChat(db, "user-2", "other-user-bot-chat", "bot-1");

    const deleted = deleteConversationsByBot(db, "user-1", "bot-1");

    assert.equal(deleted, 2);
    const remaining = db
      .prepare("SELECT id FROM conversations ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["default-chat", "other-bot-chat", "other-user-bot-chat"]
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?")
        .get("user-1") as { n: number }).n,
      2
    );
  });

  it("removes Default Prism conversations while preserving linked artifacts", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "default-1", null);
    seedBotChat(db, "user-1", "default-2", null);
    seedBotChat(db, "user-1", "bot-chat", "bot-1");
    seedBotChat(db, "user-2", "other-user-default", null);
    insertLinkedMemory(db, "user-1", "default-1", "memory-default-1", ["msg-default-1"]);
    db.prepare("UPDATE conversations SET incognito = 1 WHERE id = ?").run("default-2");

    const deleted = deleteConversationsByBot(db, "user-1", null);

    assert.equal(deleted, 1);
    const remaining = db
      .prepare("SELECT id FROM conversations ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["bot-chat", "default-2", "other-user-default"]
    );
    const image = db
      .prepare("SELECT conversation_id FROM images WHERE id = ?")
      .get("img-default-1") as { conversation_id: string | null };
    const summary = db
      .prepare("SELECT conversation_id FROM memory_summaries WHERE id = ?")
      .get("sum-default-1") as { conversation_id: string | null };
    const memory = db
      .prepare("SELECT conversation_id FROM memories WHERE id = ?")
      .get("memory-default-1") as { conversation_id: string | null };
    assert.equal(image.conversation_id, null);
    assert.equal(summary.conversation_id, null);
    assert.equal(memory.conversation_id, null);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversation_exports WHERE conversation_id = ?")
        .get("default-1") as { n: number }).n,
      0
    );
  });

  it("returns 0 when no saved conversations match the bot group", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "bot-chat", "bot-1");

    const deleted = deleteConversationsByBot(db, "user-1", "bot-2");

    assert.equal(deleted, 0);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?")
        .get("user-1") as { n: number }).n,
      1
    );
  });
});

describe("sweepConversations + undoLatestConversationSweep", () => {
  it("archives visible conversations and creates one summary per bot/default group", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "bot-chat-1", "bot-1");
    seedBotChat(db, "user-1", "bot-chat-2", "bot-1");
    seedBotChat(db, "user-1", "default-chat-1", null);
    seedBotChat(db, "user-2", "other-user-chat", "bot-1");
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "bot-1",
      "user-1",
      "Plankton",
      "#00ff88",
      "bot",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );

    const result = sweepConversations(db, "user-1", "sandbox");

    assert.ok(result.batchId, "sweep should create a batch id");
    assert.equal(result.sweptGroups, 1);
    assert.equal(result.archivedConversationCount, 2);
    assert.equal(result.summaryConversationCount, 1);
    assert.ok(result.undoExpiresAt, "sweep should return undo window expiration");
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND archived_at IS NOT NULL"
      ).get("user-1") as { n: number }).n,
      2
    );
    const summaries = listConversationSummaries(db, "user-1");
    assert.equal(summaries.length, 2);
    assert.equal(
      summaries.filter((conversation) => conversation.title.startsWith("Sweep Summary - ")).length,
      1
    );
    const sweepState = getConversationSweepState(db, "user-1");
    assert.equal(sweepState.canUndo, true);
  });

  it("undoes the latest sweep by restoring archived chats and removing summaries", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "bot-chat-1", "bot-1");
    seedBotChat(db, "user-1", "bot-chat-2", "bot-1");
    seedBotChat(db, "user-1", "default-chat-1", null);
    const sweep = sweepConversations(db, "user-1", "sandbox");
    assert.ok(sweep.batchId, "expected sweep batch id");

    const undo = undoLatestConversationSweep(db, "user-1", sweep.batchId);

    assert.equal(undo.batchId, sweep.batchId);
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND archived_at IS NOT NULL"
      ).get("user-1") as { n: number }).n,
      0
    );
    const remaining = db
      .prepare(
        "SELECT id, title FROM conversations WHERE user_id = ? ORDER BY id"
      )
      .all("user-1") as Array<{ id: string; title: string }>;
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["bot-chat-1", "bot-chat-2", "default-chat-1"]
    );
    assert.ok(remaining.every((row) => !row.title.startsWith("Sweep Summary - ")));
    const state = getConversationSweepState(db, "user-1");
    assert.equal(state.canUndo, false);
  });

  it("keeps only one undoable sweep batch at a time", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "chat-1", "bot-1");
    seedBotChat(db, "user-1", "chat-1b", "bot-1");
    sweepConversations(db, "user-1", "sandbox");

    seedBotChat(db, "user-1", "chat-2", "bot-1");
    seedBotChat(db, "user-1", "chat-2b", "bot-1");
    sweepConversations(db, "user-1", "sandbox");

    const activeSweepCount = (
      db.prepare(
        "SELECT COUNT(*) AS n FROM conversation_sweep_batches WHERE user_id = ? AND undone_at IS NULL"
      ).get("user-1") as { n: number }
    ).n;
    assert.equal(activeSweepCount, 1);
  });

  it("returns a no-op when undo is requested without an active sweep batch", () => {
    const db = createTestDb();

    const result = undoLatestConversationSweep(db, "user-1", null);

    assert.equal(result.batchId, null);
    assert.equal(result.archivedConversationCount, 0);
    assert.equal(result.summaryConversationCount, 0);
  });

  it("returns a no-op when no bot group has more than one chat", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "solo-bot-chat", "bot-1");
    seedBotChat(db, "user-1", "solo-default-chat", null);

    const result = sweepConversations(db, "user-1", "sandbox");

    assert.equal(result.batchId, null);
    assert.equal(result.sweptGroups, 0);
    assert.equal(result.archivedConversationCount, 0);
    assert.equal(result.summaryConversationCount, 0);
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND archived_at IS NOT NULL"
      ).get("user-1") as { n: number }).n,
      0
    );
  });

  it("refuses undo when the sweep batch is expired", () => {
    const db = createTestDb();
    seedBotChat(db, "user-1", "chat-1", "bot-1");
    seedBotChat(db, "user-1", "chat-2", "bot-1");
    const sweep = sweepConversations(db, "user-1", "sandbox");
    assert.ok(sweep.batchId);
    db.prepare(
      "UPDATE conversation_sweep_batches SET undo_expires_at = ? WHERE id = ?"
    ).run("2000-01-01T00:00:00.000Z", sweep.batchId);

    const undo = undoLatestConversationSweep(db, "user-1", sweep.batchId);

    assert.equal(undo.batchId, null);
    const archived = db
      .prepare("SELECT archived_at FROM conversations WHERE id = ?")
      .get("chat-1") as { archived_at: string | null };
    assert.ok(archived.archived_at, "expired undo should not restore archived chats");
  });
});

describe("createDevSeedConversations", () => {
  it("creates saved sidebar chats with lorem assistant replies", () => {
    const db = createTestDb();
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("bot-1", "user-1", "Ada", "#67e8f9", "bot", now, now);

    const created = createDevSeedConversations(db, "user-1", 2);

    assert.equal(created, 2);
    const conversations = listConversationSummaries(db, "user-1");
    assert.equal(conversations.length, 2);
    assert.ok(conversations.every((conversation) => conversation.hasAssistantReply));
    assert.ok(conversations.every((conversation) => conversation.botId === "bot-1"));
    assert.ok(conversations.every((conversation) => conversation.lastBotId === "bot-1"));
    assert.ok(conversations.every((conversation) => conversation.lastBotColor === "#67e8f9"));

    const messages = db
      .prepare("SELECT role, content, bot_id FROM messages WHERE user_id = ? ORDER BY created_at ASC")
      .all("user-1") as Array<{ role: string; content: string; bot_id: string | null }>;
    assert.equal(messages.length, 4);
    assert.equal(messages.filter((message) => message.role === "assistant").length, 2);
    assert.ok(
      messages
        .filter((message) => message.role === "assistant")
        .every((message) => message.content.includes("Lorem ipsum") && message.bot_id === "bot-1")
    );
  });

  it("falls back to default assistant chats when the user has no bots", () => {
    const db = createTestDb();

    createDevSeedConversations(db, "user-1", 1);

    const [conversation] = listConversationSummaries(db, "user-1");
    assert.equal(conversation?.botId, null);
    assert.equal(conversation?.lastBotId, null);
    assert.equal(conversation?.hasAssistantReply, true);
  });

  it("rejects non-positive seed counts", () => {
    const db = createTestDb();

    assert.throws(
      () => createDevSeedConversations(db, "user-1", 0),
      /positive integer/
    );
  });
});

// Builds a conversation with explicit, orderable timestamps so tests can
// assert precisely which rows the cutoff keeps or drops. Timestamps are
// ISO strings `1970-01-01T00:00:0N.000Z` keyed off each row's index so
// string lex-order matches chronological order — crucial because the
// production query compares `created_at` as TEXT.
function seedConversationAt(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  rows: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    seconds: number;
  }>
): void {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const tsFor = (seconds: number): string => {
    const s = seconds.toString().padStart(2, "0");
    return `1970-01-01T00:00:${s}.000Z`;
  };
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    conversationId,
    userId,
    "Rewind fixture",
    tsFor(first?.seconds ?? 0),
    tsFor(last?.seconds ?? 0)
  );
  const insertMessage = db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const row of rows) {
    insertMessage.run(
      row.id,
      conversationId,
      userId,
      row.role,
      row.content,
      tsFor(row.seconds)
    );
  }
}

function insertSummary(
  db: DatabaseSync,
  userId: string,
  conversationId: string | null,
  id: string,
  summary: string,
  seconds: number
): void {
  const s = seconds.toString().padStart(2, "0");
  db.prepare(
    "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, userId, conversationId, summary, `1970-01-01T00:00:${s}.000Z`);
}

function insertLinkedMemory(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  id: string,
  sourceMessageIds: string[]
): void {
  db.prepare(`
    INSERT INTO memories (
      id, user_id, conversation_id, bot_id, ciphertext, iv, tag,
      confidence, source, certainty, source_message_ids, created_at
    )
    VALUES (?, ?, ?, NULL, 'ciphertext', 'iv', 'tag', 0.9, 'compiled', 0.9, ?, ?)
  `).run(
    id,
    userId,
    conversationId,
    JSON.stringify(sourceMessageIds),
    "1970-01-01T00:00:08.000Z"
  );
}

describe("rewindConversation", () => {
  it("truncates the target user message and everything newer, returning the original text", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "first question", seconds: 1 },
      { id: "m2", role: "assistant", content: "first reply", seconds: 2 },
      { id: "m3", role: "user", content: "second question", seconds: 3 },
      { id: "m4", role: "assistant", content: "second reply", seconds: 4 },
    ]);

    const result = rewindConversation(db, "user-1", "chat-1", "m3");

    assert.equal(result.content, "second question");
    const remaining = db
      .prepare(
        "SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all("chat-1") as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map(r => r.id),
      ["m1", "m2"]
    );
  });

  it("refuses to rewind on an assistant message", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "hi", seconds: 1 },
      { id: "m2", role: "assistant", content: "hello", seconds: 2 },
    ]);

    assert.throws(
      () => rewindConversation(db, "user-1", "chat-1", "m2"),
      /Only user messages can be rewound/
    );

    // And the thread is unchanged after the rejected call.
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number })
        .n,
      2
    );
  });

  it("refuses to rewind a conversation owned by a different user", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "hi", seconds: 1 },
    ]);

    assert.throws(
      () => rewindConversation(db, "user-2", "chat-1", "m1"),
      /Conversation not found/
    );
  });

  it("refuses to rewind when the message id doesn't belong to the conversation", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "hi", seconds: 1 },
    ]);
    seedConversationAt(db, "user-1", "chat-2", [
      { id: "x1", role: "user", content: "other", seconds: 1 },
    ]);

    assert.throws(
      () => rewindConversation(db, "user-1", "chat-1", "x1"),
      /Message not found in conversation/
    );
  });

  it("purges thread-scoped memory_summaries at or after the cutoff while keeping older ones", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "first", seconds: 1 },
      { id: "m2", role: "assistant", content: "reply", seconds: 2 },
      { id: "m3", role: "user", content: "second", seconds: 5 },
    ]);
    insertSummary(db, "user-1", "chat-1", "sum-old", "from turn 1", 2);
    insertSummary(db, "user-1", "chat-1", "sum-at-cutoff", "from turn 2", 5);
    insertSummary(db, "user-1", "chat-1", "sum-later", "from turn 3", 9);

    rewindConversation(db, "user-1", "chat-1", "m3");

    const remaining = db
      .prepare(
        "SELECT id FROM memory_summaries WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all("chat-1") as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map(r => r.id),
      ["sum-old"]
    );
  });

  it("preserves memories linked to truncated messages", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "first", seconds: 1 },
      { id: "m2", role: "assistant", content: "reply", seconds: 2 },
      { id: "m3", role: "user", content: "second", seconds: 5 },
      { id: "m4", role: "assistant", content: "second reply", seconds: 6 },
    ]);
    insertLinkedMemory(db, "user-1", "chat-1", "memory-old", ["m1"]);
    insertLinkedMemory(db, "user-1", "chat-1", "memory-truncated", ["m3"]);
    insertLinkedMemory(db, "user-1", "chat-1", "memory-compiled", ["m1", "m3"]);

    const result = rewindConversation(db, "user-1", "chat-1", "m3");
    const remaining = db
      .prepare("SELECT id FROM memories ORDER BY id")
      .all() as Array<{ id: string }>;

    assert.equal(result.deletedMessages, 2);
    assert.equal(result.deletedMemories, 0);
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["memory-compiled", "memory-old", "memory-truncated"]
    );
  });

  it("leaves summaries for other conversations untouched", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "first", seconds: 1 },
    ]);
    seedConversationAt(db, "user-1", "chat-2", [
      { id: "x1", role: "user", content: "unrelated", seconds: 1 },
    ]);
    insertSummary(db, "user-1", "chat-2", "sum-other", "unrelated fact", 9);

    rewindConversation(db, "user-1", "chat-1", "m1");

    const stillThere = db
      .prepare("SELECT id FROM memory_summaries WHERE id = ?")
      .get("sum-other") as { id?: string } | undefined;
    assert.equal(stillThere?.id, "sum-other");
  });

  it("leaves other users' messages and summaries intact", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "mine", seconds: 1 },
    ]);
    seedConversationAt(db, "user-2", "chat-2", [
      { id: "o1", role: "user", content: "theirs", seconds: 1 },
    ]);
    insertSummary(db, "user-2", "chat-2", "sum-theirs", "their fact", 9);

    rewindConversation(db, "user-1", "chat-1", "m1");

    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?")
        .get("user-2") as { n: number }).n,
      1
    );
    const sum = db
      .prepare("SELECT id FROM memory_summaries WHERE id = ?")
      .get("sum-theirs") as { id?: string } | undefined;
    assert.equal(sum?.id, "sum-theirs");
  });

  it("updates the conversation's updated_at", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "hi", seconds: 1 },
      { id: "m2", role: "assistant", content: "hello", seconds: 2 },
      { id: "m3", role: "user", content: "again", seconds: 3 },
    ]);
    const before = db
      .prepare("SELECT updated_at FROM conversations WHERE id = ?")
      .get("chat-1") as { updated_at: string };

    rewindConversation(db, "user-1", "chat-1", "m3");

    const after = db
      .prepare("SELECT updated_at FROM conversations WHERE id = ?")
      .get("chat-1") as { updated_at: string };
    // Can't assert exact value (it's new Date().toISOString() inside the
    // function), but it must have advanced past the seed timestamp.
    assert.ok(
      after.updated_at > before.updated_at,
      `expected updated_at to advance (${before.updated_at} → ${after.updated_at})`
    );
  });
});

describe("undoLatestConversationMessages", () => {
  function seedUndoBase(db: DatabaseSync, mode = "zen"): void {
    db.prepare("INSERT INTO users (id, zen_mood_sensitivity) VALUES (?, ?)")
      .run("user-1", 0.5);
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      "undo-chat",
      "user-1",
      "Undo chat",
      mode,
      "2026-06-23T10:00:00.000Z",
      "2026-06-23T10:00:00.000Z"
    );
  }

  function insertUndoMessage(
    db: DatabaseSync,
    id: string,
    role: "user" | "assistant",
    content: string,
    createdAt: string,
    toolPayload: string | null = null
  ): void {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, tool_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, "undo-chat", "user-1", role, content, toolPayload, createdAt);
  }

  function insertUndoMemory(
    db: DatabaseSync,
    id: string,
    sourceMessageIds: string[],
    tier = "short_term",
    source = "direct"
  ): void {
    db.prepare(
      `INSERT INTO memories (
        id, user_id, conversation_id, ciphertext, iv, tag, confidence,
        tier, source, certainty, source_message_ids, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      "user-1",
      "undo-chat",
      "cipher",
      "iv",
      "tag",
      0.8,
      tier,
      source,
      0.8,
      JSON.stringify(sourceMessageIds),
      "2026-06-23T10:00:05.000Z"
    );
  }

  it("undoes the latest assistant message and rolls back linked artifacts", () => {
    const db = createTestDb();
    seedUndoBase(db);
    insertUndoMessage(db, "m1", "user", "hello", "2026-06-23T10:00:01.000Z");
    insertUndoMessage(db, "m2", "assistant", "hi", "2026-06-23T10:00:02.000Z");
    insertUndoMessage(
      db,
      "m3",
      "assistant",
      "",
      "2026-06-23T10:00:03.000Z",
      JSON.stringify({ v: 1, sentGeneratedImage: { imageId: "img-undo" } })
    );
    db.prepare(
      "INSERT INTO images (id, user_id, conversation_id, prompt, url, local_rel_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("img-undo", "user-1", "undo-chat", "prompt", "/img", "generated-images/user-1/img.png", "2026-06-23T10:00:03.000Z");
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run("sum-old", "user-1", "undo-chat", "old", "2026-06-23T10:00:01.000Z");
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run("sum-new", "user-1", "undo-chat", "new", "2026-06-23T10:00:03.000Z");
    db.prepare(
      "INSERT INTO zen_session_memories (id, user_id, conversation_id, ciphertext, iv, tag, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("zen-new", "user-1", "undo-chat", "cipher", "iv", "tag", "2026-06-23T10:00:03.000Z", "2026-06-24T10:00:03.000Z");
    insertUndoMemory(db, "mem-only", ["m3"], "long_term", "about_you");
    insertUndoMemory(db, "mem-mixed", ["m1", "m3"]);
    db.prepare(
      "INSERT INTO prism_mood_events (user_id, conversation_id, message_id, event_type, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("user-1", "undo-chat", "m3", "ignored_question", "2026-06-23T10:00:04.000Z", "{}");

    const result = undoLatestConversationMessages(db, "user-1", "undo-chat");

    assert.deepEqual(result.messageIds, ["m3"]);
    assert.equal(result.deletedMessages, 1);
    assert.equal(result.deletedSummaries, 1);
    assert.deepEqual(result.deletedSummaryIds, ["sum-new"]);
    assert.equal(result.deletedZenSessionMemories, 1);
    assert.equal(result.deletedMemories, 1);
    assert.equal(result.updatedMemories, 1);
    assert.equal(result.deletedMoodEvents, 1);
    assert.equal(result.deletedImages, 1);
    assert.deepEqual(result.deletedImageRelPaths, ["generated-images/user-1/img.png"]);
    assert.deepEqual(
      db.prepare("SELECT id FROM messages ORDER BY created_at").all().map((row) => (row as { id: string }).id),
      ["m1", "m2"]
    );
    assert.equal(db.prepare("SELECT id FROM images WHERE id = ?").get("img-undo"), undefined);
    assert.equal(db.prepare("SELECT id FROM memories WHERE id = ?").get("mem-only"), undefined);
    const mixed = db.prepare("SELECT source_message_ids FROM memories WHERE id = ?").get("mem-mixed") as
      | { source_message_ids: string }
      | undefined;
    assert.deepEqual(JSON.parse(mixed?.source_message_ids ?? "[]"), ["m1"]);
    assert.equal(db.prepare("SELECT id FROM memory_summaries WHERE id = ?").get("sum-old") != null, true);
    assert.equal(db.prepare("SELECT id FROM memory_summaries WHERE id = ?").get("sum-new"), undefined);
  });

  it("undoes the latest two messages when requested", () => {
    const db = createTestDb();
    seedUndoBase(db);
    insertUndoMessage(db, "m1", "user", "hello", "2026-06-23T10:00:01.000Z");
    insertUndoMessage(db, "m2", "assistant", "hi", "2026-06-23T10:00:02.000Z");
    insertUndoMessage(db, "m3", "user", "followup", "2026-06-23T10:00:03.000Z");
    insertUndoMessage(db, "m4", "assistant", "answer", "2026-06-23T10:00:04.000Z");
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run("sum-tail", "user-1", "undo-chat", "tail", "2026-06-23T10:00:03.000Z");
    insertUndoMemory(db, "mem-tail", ["m3", "m4"]);

    const result = undoLatestConversationMessages(db, "user-1", "undo-chat", 2);

    assert.deepEqual(result.messageIds, ["m4", "m3"]);
    assert.equal(result.deletedMessages, 2);
    assert.equal(result.deletedMemories, 1);
    assert.deepEqual(
      db.prepare("SELECT id FROM messages ORDER BY created_at").all().map((row) => (row as { id: string }).id),
      ["m1", "m2"]
    );
    assert.equal(db.prepare("SELECT id FROM memory_summaries WHERE id = ?").get("sum-tail"), undefined);
  });

  it("rebuilds mood from remaining messages after undo", () => {
    const db = createTestDb();
    seedUndoBase(db);
    insertUndoMessage(db, "m1", "user", "thank you?", "2026-06-23T10:00:01.000Z");
    insertUndoMessage(db, "m2", "user", "stupid", "2026-06-23T10:00:02.000Z");
    db.prepare(
      `INSERT INTO prism_mood_state (
        user_id, conversation_id, mode, mood_key, confidence, annoyance,
        warmth, engagement, restraint, recent_deltas, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "user-1",
      "undo-chat",
      "zen",
      "strained",
      0.9,
      0.9,
      0.2,
      0.2,
      0.8,
      "[]",
      "2026-06-23T10:00:02.000Z"
    );

    const result = undoLatestConversationMessages(db, "user-1", "undo-chat");

    assert.deepEqual(result.messageIds, ["m2"]);
    assert.ok(result.prismMood.annoyance < 0.25);
    assert.ok(result.prismMood.warmth > 0.62);
    assert.deepEqual(
      db.prepare("SELECT id FROM messages ORDER BY created_at").all().map((row) => (row as { id: string }).id),
      ["m1"]
    );
  });

  it("rejects empty and cross-user undo requests", () => {
    const db = createTestDb();
    seedUndoBase(db);
    assert.throws(
      () => undoLatestConversationMessages(db, "user-1", "undo-chat"),
      /Nothing to undo/
    );
    insertUndoMessage(db, "m1", "user", "hello", "2026-06-23T10:00:01.000Z");
    assert.throws(
      () => undoLatestConversationMessages(db, "user-2", "undo-chat"),
      /Conversation not found/
    );
  });
});

describe("deleteConversationMessage", () => {
  it("deletes only the requested message row", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "first", seconds: 1 },
      { id: "m2", role: "assistant", content: "reply", seconds: 2 },
      { id: "m3", role: "user", content: "third", seconds: 3 },
    ]);

    deleteConversationMessage(db, "user-1", "m2");

    const remaining = db
      .prepare("SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
      .all("chat-1") as Array<{ id: string }>;
    assert.deepEqual(
      remaining.map((row) => row.id),
      ["m1", "m3"]
    );
  });

  it("clears conversation-scoped summaries so future context rebuilds from remaining messages", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "first", seconds: 1 },
      { id: "m2", role: "assistant", content: "reply", seconds: 2 },
    ]);
    insertSummary(db, "user-1", "chat-1", "sum-1", "summary 1", 4);
    insertSummary(db, "user-1", "chat-1", "sum-2", "summary 2", 5);
    insertSummary(db, "user-1", "chat-2", "sum-other", "other conversation", 6);

    const result = deleteConversationMessage(db, "user-1", "m2");

    assert.equal(result.deletedSummaries, 2);
    const remainingForChat1 = db
      .prepare("SELECT id FROM memory_summaries WHERE conversation_id = ? ORDER BY id")
      .all("chat-1") as Array<{ id: string }>;
    assert.deepEqual(remainingForChat1, []);
    const otherSummary = db
      .prepare("SELECT id FROM memory_summaries WHERE id = ?")
      .get("sum-other") as { id: string } | undefined;
    assert.equal(otherSummary?.id, "sum-other");
  });

  it("preserves memories even if they reference deleted message ids", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "first", seconds: 1 },
      { id: "m2", role: "assistant", content: "reply", seconds: 2 },
    ]);
    insertLinkedMemory(db, "user-1", "chat-1", "memory-1", ["m1", "m2"]);

    deleteConversationMessage(db, "user-1", "m2");

    const memory = db
      .prepare("SELECT id, conversation_id FROM memories WHERE id = ?")
      .get("memory-1") as { id: string; conversation_id: string | null } | undefined;
    assert.equal(memory?.id, "memory-1");
    assert.equal(memory?.conversation_id, "chat-1");
  });

  it("rejects deletion when the message belongs to another user", () => {
    const db = createTestDb();
    seedConversationAt(db, "user-1", "chat-1", [
      { id: "m1", role: "user", content: "mine", seconds: 1 },
    ]);

    assert.throws(
      () => deleteConversationMessage(db, "user-2", "m1"),
      /Message not found/
    );
  });
});
