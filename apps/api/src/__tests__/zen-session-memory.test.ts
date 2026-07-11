import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { LlmProvider, ProviderMessage } from "../providers.ts";
import { initializeDatabase } from "../db.ts";
import {
  buildZenSessionMemoryPromptContext,
  createZenPersonaSessionMemoryCheckpoint,
  createZenSessionMemoryCheckpoint,
  deleteZenSessionMemoryById,
  getZenPreviousContextSummary,
  listZenSessionMemories,
  loadZenSessionMemoryOverview,
  pruneExpiredZenSessionMemories,
  userMessageRequestsZenSessionMemory,
  userMessageSuggestsZenSessionDeferral,
} from "../zen-session-memory.ts";

const USER_KEY = Buffer.alloc(32, 11);

function createTestDb(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
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
  return db;
}

function fakeProvider(title = "Bridge Story", text = "Resume at the bridge choice."): LlmProvider {
  return {
    name: "local",
    async generateResponse(_messages: ProviderMessage[]) {
      return JSON.stringify({ title, text });
    },
    async embedText() {
      return [];
    },
  };
}

function insertConversation(
  db: DatabaseSync,
  id: string,
  updatedAt: string,
  options?: { userId?: string; title?: string; incognito?: boolean }
): void {
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at) VALUES (?, ?, ?, 'zen', NULL, ?, ?, ?)"
  ).run(
    id,
    options?.userId ?? "user-1",
    options?.title ?? id,
    options?.incognito ? 1 : 0,
    updatedAt,
    updatedAt
  );
}

function insertThreadSummary(
  db: DatabaseSync,
  conversationId: string,
  summary: string,
  createdAt: string,
  displaySummary?: string
): void {
  db.prepare(
    "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    `sum-${conversationId}`,
    "user-1",
    conversationId,
    JSON.stringify({
      v: 1,
      kind: "thread_compact",
      mode: "zen",
      summary,
      ...(displaySummary ? { displaySummary } : {}),
      createdAt,
    }),
    createdAt
  );
}

async function createCheckpoint(
  db: DatabaseSync,
  index: number,
  now: Date,
  userId = "user-1"
) {
  insertConversation(db, `conversation-${index}`, now.toISOString(), { userId });
  return await createZenSessionMemoryCheckpoint({
    db,
    provider: fakeProvider(`Checkpoint ${index}`, `Resume checkpoint ${index}.`),
    userId,
    conversationId: `conversation-${index}`,
    userKey: USER_KEY,
    history: [
      {
        id: `history-${index}`,
        role: "assistant",
        content: `The story is at beat ${index}.`,
        createdAt: now.toISOString(),
      },
    ],
    userMessage: {
      id: `user-${index}`,
      role: "user",
      content: "Let's finish this later.",
      createdAt: now.toISOString(),
    },
    assistantMessage: {
      id: `assistant-${index}`,
      role: "assistant",
      content: "Absolutely, we can pause here.",
      createdAt: now.toISOString(),
    },
    now,
  });
}

describe("Zen session memory checkpoints", () => {
  it("creates encrypted checkpoints and reads them back", async () => {
    const db = createTestDb();
    const now = new Date("2026-06-20T12:00:00.000Z");
    const checkpoint = await createCheckpoint(db, 1, now);

    assert.ok(checkpoint);
    assert.equal(checkpoint.title, "Checkpoint 1");
    assert.equal(checkpoint.text, "Resume checkpoint 1.");

    const raw = db
      .prepare("SELECT ciphertext FROM zen_session_memories WHERE id = ?")
      .get(checkpoint.id) as { ciphertext: string };
    assert.ok(!raw.ciphertext.includes("Resume checkpoint"));

    const memories = listZenSessionMemories(db, "user-1", USER_KEY, now);
    assert.equal(memories.length, 1);
    assert.equal(memories[0]?.text, "Resume checkpoint 1.");
    assert.equal(memories[0]?.sourceMessageIds?.length, 2);
  });

  it("keeps only the newest three checkpoints per user", async () => {
    const db = createTestDb();
    for (let index = 1; index <= 4; index += 1) {
      await createCheckpoint(
        db,
        index,
        new Date(`2026-06-20T12:0${index}:00.000Z`)
      );
    }

    const memories = listZenSessionMemories(
      db,
      "user-1",
      USER_KEY,
      new Date("2026-06-20T12:05:00.000Z")
    );
    assert.deepEqual(
      memories.map((memory) => memory.title),
      ["Checkpoint 4", "Checkpoint 3", "Checkpoint 2"]
    );
  });

  it("prunes checkpoints after 96 hours", async () => {
    const db = createTestDb();
    await createCheckpoint(db, 1, new Date("2026-06-20T12:00:00.000Z"));

    const deleted = pruneExpiredZenSessionMemories(
      db,
      "user-1",
      new Date("2026-06-24T12:00:00.001Z")
    );
    assert.equal(deleted, 1);
    assert.equal(
      listZenSessionMemories(
        db,
        "user-1",
        USER_KEY,
        new Date("2026-06-24T12:00:00.001Z")
      ).length,
      0
    );
  });

  it("keeps checkpoint reads and deletes isolated by user", async () => {
    const db = createTestDb();
    const userOne = await createCheckpoint(
      db,
      1,
      new Date("2026-06-20T12:00:00.000Z"),
      "user-1"
    );
    const userTwo = await createCheckpoint(
      db,
      2,
      new Date("2026-06-20T12:01:00.000Z"),
      "user-2"
    );
    assert.ok(userOne);
    assert.ok(userTwo);

    assert.equal(deleteZenSessionMemoryById(db, "user-1", userTwo.id), false);
    assert.equal(deleteZenSessionMemoryById(db, "user-2", userTwo.id), true);
    assert.deepEqual(
      listZenSessionMemories(
        db,
        "user-1",
        USER_KEY,
        new Date("2026-06-20T12:05:00.000Z")
      ).map((memory) => memory.id),
      [userOne.id]
    );
  });

  it("extracts only clear deferral requests", async () => {
    const db = createTestDb();
    insertConversation(db, "conversation-1", "2026-06-20T12:00:00.000Z");

    const ordinary = await createZenSessionMemoryCheckpoint({
      db,
      provider: fakeProvider(),
      userId: "user-1",
      conversationId: "conversation-1",
      userKey: USER_KEY,
      history: [],
      userMessage: {
        id: "user-ordinary",
        role: "user",
        content: "Tell me more about the tower.",
        createdAt: "2026-06-20T12:00:00.000Z",
      },
      assistantMessage: {
        id: "assistant-ordinary",
        role: "assistant",
        content: "The tower leans over the sea.",
        createdAt: "2026-06-20T12:00:01.000Z",
      },
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    assert.equal(ordinary, null);
    assert.equal(userMessageSuggestsZenSessionDeferral("Let's finish this later."), true);
    assert.equal(userMessageSuggestsZenSessionDeferral("Tell me more."), false);
  });

  it("creates automatic Persona checkpoints only for substantial player-facing spans", async () => {
    const db = createTestDb();
    insertConversation(db, "conversation-1", "2026-06-20T12:00:00.000Z");
    db.prepare(
      "INSERT INTO bots (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "mario",
      "user-1",
      "Mario",
      "2026-06-20T12:00:00.000Z",
      "2026-06-20T12:00:00.000Z"
    );
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, tool_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "mario-assistant-only",
      "conversation-1",
      "user-1",
      "assistant",
      "It's-a me, Mario!",
      "mario",
      null,
      "2026-06-20T12:00:01.000Z"
    );

    const tooShort = await createZenPersonaSessionMemoryCheckpoint({
      db,
      provider: fakeProvider("Mario", "Should not save."),
      userId: "user-1",
      conversationId: "conversation-1",
      botId: "mario",
      userKey: USER_KEY,
      now: new Date("2026-06-20T12:00:02.000Z"),
    });
    assert.equal(tooShort, null);

    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, tool_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "mario-user",
      "conversation-1",
      "user-1",
      "user",
      "Tell me about Mushroom Kingdom tax code.",
      "mario",
      null,
      "2026-06-20T12:00:03.000Z"
    );
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, tool_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "mario-reply",
      "conversation-1",
      "user-1",
      "assistant",
      "The Mushroom Kingdom had a strict coin levy.",
      "mario",
      null,
      "2026-06-20T12:00:04.000Z"
    );

    const checkpoint = await createZenPersonaSessionMemoryCheckpoint({
      db,
      provider: fakeProvider("Mario Taxes", "Mario should resume the tax-code story."),
      userId: "user-1",
      conversationId: "conversation-1",
      botId: "mario",
      userKey: USER_KEY,
      now: new Date("2026-06-20T12:00:05.000Z"),
    });
    assert.ok(checkpoint);
    assert.equal(checkpoint.botId, "mario");
    assert.equal(checkpoint.text, "Mario should resume the tax-code story.");
  });

  it("excludes previous-persona handoff and bridge user replies from Persona checkpoints", async () => {
    const db = createTestDb();
    insertConversation(db, "conversation-1", "2026-06-20T12:00:00.000Z");
    db.prepare(
      "INSERT INTO bots (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "spongebob",
      "user-1",
      "Spongebob",
      "2026-06-20T12:00:00.000Z",
      "2026-06-20T12:00:00.000Z"
    );
    db.prepare(
      "INSERT INTO bots (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "mario",
      "user-1",
      "Mario",
      "2026-06-20T12:00:00.000Z",
      "2026-06-20T12:00:00.000Z"
    );
    const insertMessage = db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, tool_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    insertMessage.run(
      "handoff",
      "conversation-1",
      "user-1",
      "assistant",
      "But what about that guy with the mustache?",
      "spongebob",
      JSON.stringify({
        v: 1,
        zenTurn: {
          kind: "persona-transition",
          fromBotId: "spongebob",
          toBotId: "mario",
          style: "previous-introduces",
        },
      }),
      "2026-06-20T12:00:01.000Z"
    );
    insertMessage.run(
      "bridge-user",
      "conversation-1",
      "user-1",
      "user",
      "Oh, Mario?",
      "mario",
      null,
      "2026-06-20T12:00:02.000Z"
    );
    insertMessage.run(
      "mario-intro",
      "conversation-1",
      "user-1",
      "assistant",
      "It's-a me, Mario!",
      "mario",
      null,
      "2026-06-20T12:00:03.000Z"
    );
    insertMessage.run(
      "mario-user",
      "conversation-1",
      "user-1",
      "user",
      "Tell me a long story about Mushroom Kingdom tax code.",
      "mario",
      null,
      "2026-06-20T12:00:04.000Z"
    );
    insertMessage.run(
      "mario-reply",
      "conversation-1",
      "user-1",
      "assistant",
      "The tax code begins with a coin stamp and a royal audit.",
      "mario",
      null,
      "2026-06-20T12:00:05.000Z"
    );

    let transcript = "";
    const checkpoint = await createZenPersonaSessionMemoryCheckpoint({
      db,
      provider: {
        name: "local",
        async generateResponse(messages) {
          transcript = messages.map((message) => message.content).join("\n");
          return JSON.stringify({
            title: "Mario Tax Code",
            text: "Mario should resume the Mushroom Kingdom tax-code story.",
          });
        },
        async embedText() {
          return [];
        },
      },
      userId: "user-1",
      conversationId: "conversation-1",
      botId: "mario",
      userKey: USER_KEY,
      now: new Date("2026-06-20T12:00:06.000Z"),
    });

    assert.ok(checkpoint);
    assert.doesNotMatch(transcript, /Oh, Mario/);
    assert.doesNotMatch(transcript, /guy with the mustache/);
    assert.match(transcript, /Mushroom Kingdom tax code/);
    assert.match(transcript, /royal audit/);
  });
});

describe("Zen previous context summaries", () => {
  it("uses the newest non-incognito Zen summary outside the active conversation", () => {
    const db = createTestDb();
    insertConversation(db, "active", "2026-06-20T12:00:00.000Z", { title: "Active" });
    insertConversation(db, "older", "2026-06-20T11:00:00.000Z", { title: "Older" });
    insertConversation(db, "newer", "2026-06-20T13:00:00.000Z", { title: "Newer" });
    insertConversation(db, "secret", "2026-06-20T14:00:00.000Z", {
      title: "Secret",
      incognito: true,
    });
    insertThreadSummary(db, "older", "Older internal summary.", "2026-06-20T11:01:00.000Z");
    insertThreadSummary(
      db,
      "newer",
      "Newer internal summary.",
      "2026-06-20T13:01:00.000Z",
      "Newer display summary."
    );
    insertThreadSummary(db, "secret", "Secret summary.", "2026-06-20T14:01:00.000Z");

    const context = getZenPreviousContextSummary({
      db,
      userId: "user-1",
      activeConversationId: "active",
    });
    assert.equal(context?.conversationId, "newer");
    assert.equal(context?.summary, "Newer display summary.");
    assert.equal(context?.internalSummary, "Newer internal summary.");
  });

  it("falls back to the active summary when no previous Zen summary exists", () => {
    const db = createTestDb();
    insertConversation(db, "active", "2026-06-20T12:00:00.000Z", { title: "Active" });
    insertThreadSummary(db, "active", "Active summary.", "2026-06-20T12:01:00.000Z");

    const overview = loadZenSessionMemoryOverview({
      db,
      userId: "user-1",
      userKey: USER_KEY,
      activeConversationId: "active",
    });
    assert.equal(overview.previousContext?.conversationId, "active");
    assert.equal(overview.previousContext?.summary, "Active summary.");
  });

  it("builds prompt context only for available prior/session context", () => {
    assert.equal(userMessageRequestsZenSessionMemory("Where were we last time?"), true);
    assert.equal(userMessageRequestsZenSessionMemory("What should we cook?"), false);
    assert.equal(buildZenSessionMemoryPromptContext(null), null);
    assert.match(
      buildZenSessionMemoryPromptContext({
        previousContext: {
          conversationId: "conversation-1",
          title: "Story",
          summary: "The hero reached the bridge.",
          updatedAt: "2026-06-20T12:00:00.000Z",
        },
        sessionMemories: [],
      }) ?? "",
      /Zen session memory context/
    );
  });
});
