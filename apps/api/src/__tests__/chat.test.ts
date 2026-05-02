import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { processChatMessage } from "../chat.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createChatTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      bot_id TEXT,
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
      created_at TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      glyph TEXT
    );
  `);
  return db;
}

describe("processChatMessage starter prompts", () => {
  it("creates an assistant-only opener grounded in the active bot prompt", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, name, color, glyph) VALUES (?, ?, ?, ?)"
    ).run("bot-1", "Storm Bot", "#5b8cff", "weather");

    type ProviderBodies = Array<{
      messages?: Array<{ role: string; content: string }>;
    }>;
    const bodies: ProviderBodies = [];
    let fetchCount = 0;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content: "What kind of surreal weather should we explore first?",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content:
              '{"suggestions":["Warm rain at dusk","A storm as metaphor","Anything but blue sky","Tell me more about surreal"]}',
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "",
      Buffer.from("test-key"),
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: true,
        starterPromptLabel: "Storm Bot",
        botId: "bot-1",
        incognito: false,
        botSystemPrompt: "You are Storm Bot. Invite the user into strange skies.",
        mode: "chat",
      }
    );

    const { conversation, conversationStarters } = result;
    assert.equal(conversation.title, "Storm Bot starter");
    assert.equal(conversation.messages.length, 1);
    assert.equal(conversation.messages[0]?.role, "assistant");
    assert.equal(
      conversation.messages[0]?.content,
      "What kind of surreal weather should we explore first?"
    );
    assert.equal(conversation.messages[0]?.botName, "Storm Bot");
    assert.deepEqual(conversationStarters, [
      "Warm rain at dusk",
      "A storm as metaphor",
      "Anything but blue sky",
      "Tell me more about surreal",
    ]);

    const rowCounts = db
      .prepare("SELECT role, COUNT(*) AS n FROM messages GROUP BY role")
      .all() as Array<{ role: string; n: number }>;
    assert.deepEqual(
      rowCounts.map((row) => ({ role: row.role, n: row.n })),
      [{ role: "assistant", n: 1 }]
    );

    const starterBody = bodies[0];
    assert.equal(starterBody?.messages?.[0]?.role, "system");
    assert.match(starterBody?.messages?.[0]?.content ?? "", /Storm Bot/);
    assert.equal(starterBody?.messages?.[1]?.role, "user");
    assert.match(
      starterBody?.messages?.[1]?.content ?? "",
      /Functionally simple/
    );

    const inferBody = bodies[1];
    assert.equal(inferBody?.messages?.[0]?.role, "system");
    assert.match(inferBody?.messages?.[1]?.content ?? "", /Respond with compact JSON/);
    assert.equal(fetchCount, 2);
  });

  it("falls back to local starter chips when inference returns non-json", async () => {
    const db = createChatTestDb();
    let fetchCount = 0;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content: "The accordion case hums beside a locked velvet door.",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content: "Sure! Here are some ideas, but I forgot the JSON shape.",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "",
      Buffer.from("test-key"),
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: true,
        starterPromptLabel: "Henry",
        incognito: false,
        mode: "chat",
      }
    );

    assert.equal(result.conversationStarters?.length, 4);
    assert.match(result.conversationStarters?.[1] ?? "", /Henry/);
  });

  it("keeps private chats ephemeral while honoring the selected provider and bot", async () => {
    const db = createChatTestDb();

    let providerUrl = "";
    let providerBody: { messages?: Array<{ role: string; content: string }> } | null = null;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      providerUrl = String(input);
      providerBody = JSON.parse(String(init?.body ?? "{}")) as typeof providerBody;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Private online reply",
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const { conversation } = await processChatMessage(
      db,
      "user-1",
      "Keep this out of history.",
      Buffer.from("test-key"),
      {
        preferredProvider: "openai",
        autoMemory: true,
        openAiApiKey: "sk-test",
        botId: "bot-1",
        incognito: true,
        starterPromptLabel: "Storm Bot",
        botSystemPrompt: "You are Storm Bot. Keep the skies strange.",
        mode: "chat",
        ephemeralMessages: [
          {
            id: "private-user-1",
            role: "user",
            content: "Earlier private thought",
            createdAt: "2026-04-25T00:00:00.000Z",
          },
          {
            id: "private-assistant-1",
            role: "assistant",
            content: "Earlier private reply",
            createdAt: "2026-04-25T00:00:01.000Z",
            provider: "openai",
            model: "gpt-4o-mini",
          },
        ],
      },
      "private-session-1"
    );

    assert.equal(providerUrl, "https://api.openai.com/v1/chat/completions");
    assert.deepEqual(
      providerBody?.messages?.map((message) => message.role),
      ["system", "user", "assistant", "user"]
    );
    assert.match(providerBody?.messages?.[0]?.content ?? "", /Storm Bot/);
    assert.equal(providerBody?.messages?.[1]?.content, "Earlier private thought");
    assert.equal(providerBody?.messages?.[3]?.content, "Keep this out of history.");

    assert.equal(conversation.id, "private-session-1");
    assert.equal(conversation.incognito, true);
    assert.equal(conversation.botId, "bot-1");
    assert.equal(conversation.lastBotId, "bot-1");
    assert.equal(conversation.messages.length, 4);
    assert.equal(conversation.messages[3]?.botName, "Storm Bot");
    assert.equal(conversation.messages[3]?.provider, "openai");

    const conversationCount = db
      .prepare("SELECT COUNT(*) AS n FROM conversations")
      .get() as { n: number };
    const messageCount = db
      .prepare("SELECT COUNT(*) AS n FROM messages")
      .get() as { n: number };
    assert.equal(conversationCount.n, 0);
    assert.equal(messageCount.n, 0);
  });
});
