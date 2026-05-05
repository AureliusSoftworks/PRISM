import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  parseTitleResponse,
  processChatMessage,
  refreshConversationTitle,
  sanitizeConversationTitle,
} from "../chat.ts";
import { rewindConversation } from "../conversations.ts";
import { persistMemoryCandidates } from "../memory.ts";
import { fallbackEmbedding } from "../providers.ts";

const originalFetch = globalThis.fetch;

/** 32 bytes for AES-256-GCM used by memory encryption in tests. */
const CHAT_TEST_USER_KEY = Buffer.alloc(32, 7);

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
      tool_payload TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      glyph TEXT,
      delete_protected INTEGER NOT NULL DEFAULT 0
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
      source TEXT NOT NULL DEFAULT 'direct',
      certainty REAL,
      source_message_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE memory_summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
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
  `);
  return db;
}

async function flushBackgroundTitleJobs(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function installChatFetchStub(reply = "Memory-aware reply"): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      prompt?: string;
      messages?: Array<{ content: string }>;
    };
    if (url.includes("/api/embeddings")) {
      return new Response(
        JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (body.messages?.[0]?.content.includes("memory validation critic")) {
      const validationPayload = JSON.parse(body.messages[1]?.content ?? "{}") as {
        candidates?: Array<{ index: number; text: string; confidence: number }>;
      };
      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              results: (validationPayload.candidates ?? []).map((candidate) => ({
                index: candidate.index,
                decision: "approve",
                text: candidate.text,
                confidence: candidate.confidence,
                reasonCodes: [],
              })),
            }),
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ message: { content: reply } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
}

describe("conversation title inference helpers", () => {
  it("parses strict JSON title payloads", () => {
    assert.equal(
      parseTitleResponse('{"title":"Sourdough Care Plan"}'),
      "Sourdough Care Plan"
    );
  });

  it("parses fenced JSON title payloads", () => {
    assert.equal(
      parseTitleResponse('```json\n{"title":"Memory Map Cleanup"}\n```'),
      "Memory Map Cleanup"
    );
  });

  it("rejects malformed or empty title payloads", () => {
    assert.equal(parseTitleResponse(""), null);
    assert.equal(parseTitleResponse('{"title":""}'), null);
  });

  it("falls back to plain-text title responses from local models", () => {
    assert.equal(parseTitleResponse("Title: Garden Notes."), "Garden Notes");
    assert.equal(parseTitleResponse("Memory Map Cleanup\n\nExtra text"), "Memory Map Cleanup");
  });

  it("sanitizes title chrome and caps long strings", () => {
    assert.equal(sanitizeConversationTitle('" Lantern Ritual. "'), "Lantern Ritual");
    assert.equal(
      sanitizeConversationTitle("A".repeat(80)),
      `${"A".repeat(57)}...`
    );
  });
});

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
      CHAT_TEST_USER_KEY,
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
    assert.match(conversation.title, /^Surreal Weather/i);
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
    assert.match(
      inferBody?.messages?.[1]?.content ?? "",
      /direct answer to that exact question/
    );
    await flushBackgroundTitleJobs();
    assert.equal(fetchCount, 3);
  });

  it("injects recent memories into starter opener prompts for personalization", async () => {
    const db = createChatTestDb();
    const userKey = CHAT_TEST_USER_KEY;
    await persistMemoryCandidates(
      db,
      "user-1",
      "memory-conv-1",
      null,
      [{ text: "The user prefers reflective evening check-ins.", confidence: 0.96 }],
      userKey,
      { sourceMessageIds: ["memory-source-1"] }
    );

    type ProviderBodies = Array<{
      messages?: Array<{ role: string; content: string }>;
    }>;
    const bodies: ProviderBodies = [];
    let providerCallCount = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        prompt?: string;
        messages?: Array<{ role: string; content: string }>;
      };
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      bodies.push(body);
      providerCallCount += 1;
      if (providerCallCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content: "What would a gentle evening check-in look like for you tonight?",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (providerCallCount === 2) {
        return new Response(
          JSON.stringify({
            message: {
              content:
                '{"suggestions":["Keep it reflective","Give me one concrete action","Ask me something playful","Try a different angle"]}',
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content: '{"title":"Evening check-in"}',
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    await processChatMessage(
      db,
      "user-1",
      "",
      userKey,
      {
        preferredProvider: "local",
        autoMemory: true,
        starterPrompt: true,
        starterPromptLabel: "Ethan",
        incognito: false,
        mode: "chat",
      }
    );

    const starterBody = bodies[0];
    const starterUserInstruction = starterBody?.messages?.filter((m) => m.role === "user").pop();
    assert.match(starterUserInstruction?.content ?? "", /Ask exactly ONE direct question/i);
    const memoryBlock = starterBody?.messages?.find((msg) =>
      msg.content.startsWith("User memory hints:\n")
    );
    assert.ok(memoryBlock);
    assert.match(memoryBlock?.content ?? "", /reflective evening check-ins/i);
  });

  it("rewrites generic starter openers into memory-anchored questions", async () => {
    const db = createChatTestDb();
    const userKey = CHAT_TEST_USER_KEY;
    await persistMemoryCandidates(
      db,
      "user-1",
      "memory-conv-2",
      null,
      [{ text: "The user prefers reflective evening check-ins.", confidence: 0.96 }],
      userKey,
      { sourceMessageIds: ["memory-source-2"] }
    );

    let providerCallCount = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        prompt?: string;
      };
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      providerCallCount += 1;
      if (providerCallCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content: "What's on your mind today?",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (providerCallCount === 2) {
        return new Response(
          JSON.stringify({
            message: {
              content:
                '{"suggestions":["Keep going","Ask a playful one","Give me a concrete step","New angle please"]}',
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content: '{"title":"Starter"}',
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "",
      userKey,
      {
        preferredProvider: "local",
        autoMemory: true,
        starterPrompt: true,
        starterPromptLabel: "Ethan",
        incognito: false,
        mode: "chat",
      }
    );

    assert.match(
      result.conversation.messages[0]?.content ?? "",
      /Given that you prefer reflective evening check-ins, what feels most important to explore right now\?/i
    );
  });

  it("falls back to answer-shaped starter chips when inference returns non-json", async () => {
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
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: true,
        starterPromptLabel: "Henry",
        incognito: false,
        mode: "chat",
      }
    );

    assert.deepEqual(result.conversationStarters, [
      "I'm not sure yet.",
      "A small specific detail.",
      "I need another clue.",
      "Surprise me with your guess.",
    ]);
  });

  it("falls back to question-relevant starter chips for specific opener questions", async () => {
    const db = createChatTestDb();
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content:
                "I've been trying to recall that quaint little café on your last visit to Paris — can you tell me if I'm thinking of Chez Marie or Café des Deux Moulins?",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content: "These are not JSON suggestions.",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: true,
        starterPromptLabel: "Prism",
        incognito: false,
        mode: "chat",
      }
    );

    assert.deepEqual(result.conversationStarters, [
      "Chez Marie",
      "Café des Deux Moulins",
      "Neither sounds right.",
      "I'm not sure.",
    ]);
  });

  it("strips quote wrappers from starter opener replies", async () => {
    const db = createChatTestDb();
    let fetchCount = 0;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content:
                '> "Hello, I\'m glad you\'re here. Can you tell me about the last decision you made when you felt it might have been less than ideal?"',
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content:
              '{"suggestions":["What should I notice about hello?","Ask me a playful question, Ethan.","Give me one concrete next step.","Surprise me with another angle."]}',
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: true,
        starterPromptLabel: "Ethan",
        incognito: false,
        mode: "chat",
      }
    );

    assert.equal(
      result.conversation.messages[0]?.content,
      "Hello, I'm glad you're here. Can you tell me about the last decision you made when you felt it might have been less than ideal?"
    );
  });

  it("strips nested blockquote and escaped quote wrappers from starter opener replies", async () => {
    const db = createChatTestDb();
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content: '>> \\"“What feels surreal for you tonight?”\\"',
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content:
              '{"suggestions":["What should I notice about surreal?","Ask me a playful question, Ethan.","Give me one concrete next step.","Surprise me with another angle."]}',
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: true,
        starterPromptLabel: "Ethan",
        incognito: false,
        mode: "chat",
      }
    );

    assert.equal(
      result.conversation.messages[0]?.content,
      "What feels surreal for you tonight?"
    );
  });

  it("keeps memory-rewrite fallback unquoted when opener arrives wrapped", async () => {
    const db = createChatTestDb();
    const userKey = CHAT_TEST_USER_KEY;
    await persistMemoryCandidates(
      db,
      "user-1",
      "memory-conv-3",
      null,
      [{ text: "The user prefers reflective evening check-ins.", confidence: 0.96 }],
      userKey,
      { sourceMessageIds: ["memory-source-3"] }
    );

    let providerCallCount = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        prompt?: string;
      };
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      providerCallCount += 1;
      if (providerCallCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content: '> \\"What\'s on your mind today?\\"',
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (providerCallCount === 2) {
        return new Response(
          JSON.stringify({
            message: {
              content:
                '{"suggestions":["Keep going","Ask a playful one","Give me a concrete step","New angle please"]}',
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content: '{"title":"Starter"}',
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "",
      userKey,
      {
        preferredProvider: "local",
        autoMemory: true,
        starterPrompt: true,
        starterPromptLabel: "Ethan",
        incognito: false,
        mode: "chat",
      }
    );

    assert.equal(
      result.conversation.messages[0]?.content,
      "Given that you prefer reflective evening check-ins, what feels most important to explore right now?"
    );
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
      CHAT_TEST_USER_KEY,
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

describe("processChatMessage AskQuestion tool", () => {
  it("persists stripped prose and attaches askQuestion hydration", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, name, color, glyph, delete_protected) VALUES (?, ?, ?, ?, 0)"
    ).run("bot-1", "Guide Bot", "#5b8cff", "north");

    const askPayload = {
      v: 1 as const,
      name: "AskQuestion" as const,
      prompt: "Which path?",
      options: [
        { id: "a", label: "🟢 Left" },
        { id: "b", label: "🟡 Pause" },
        { id: "c", label: "🔴 Right" },
      ],
    };
    const prismTail =
      `\n<<<PRISM_TOOL>>>\n${JSON.stringify(askPayload)}\n<<<END_PRISM_TOOL>>>`;
    globalThis.fetch = (async (_input: string | URL | Request) =>
      new Response(
        JSON.stringify({
          message: { content: `Turn here softly.${prismTail}` },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Which way?",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        botId: "bot-1",
        incognito: false,
        botSystemPrompt: "You are Guide Bot. Offer gentle forks.",
        mode: "chat",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.content, "Turn here softly.");
    assert.deepEqual(lastAssistant?.askQuestion, askPayload);

    const row = db.prepare(
      "SELECT content, tool_payload FROM messages WHERE role = ?"
    ).get("assistant") as { content: string; tool_payload: string };

    assert.equal(row.content, "Turn here softly.");
    assert.deepEqual(JSON.parse(row.tool_payload), askPayload);
  });

  it("forces fallback AskQuestion payload when user explicitly requests multiple-choice", async () => {
    const db = createChatTestDb();
    globalThis.fetch = (async (_input: string | URL | Request) =>
      new Response(
        JSON.stringify({
          message: { content: "Sure — here's one. Do you want to keep going?" },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Please ask me a multiple-choice question.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "chat",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.askQuestion?.name, "AskQuestion");
    assert.equal(lastAssistant?.askQuestion?.options.length, 3);
    assert.deepEqual(
      lastAssistant?.askQuestion?.options.map((opt) => opt.id),
      ["a", "b", "c"]
    );
    assert.equal(lastAssistant?.askQuestion?.options[0]?.label, "Yes");

    const row = db.prepare(
      "SELECT tool_payload FROM messages WHERE role = ? ORDER BY created_at DESC LIMIT 1"
    ).get("assistant") as { tool_payload: string | null };
    assert.notEqual(row.tool_payload, null);
    assert.equal(JSON.parse(String(row.tool_payload)).name, "AskQuestion");
  });

  it("backfills AskQuestion when assistant prose signals a missing chip block", async () => {
    const db = createChatTestDb();
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          message: {
            content: [
              "If Squidward had to pick a musical instrument for a week, which one would he MOST likely choose?",
              "ONE block below!",
            ].join("\n"),
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Please give me a mini IQ quiz — bikini bottom style!",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "chat",
      }
    );

    const latestAssistant = result.conversation.messages
      .filter((m) => m.role === "assistant")
      .pop();
    assert.equal(latestAssistant?.askQuestion?.name, "AskQuestion");
    assert.equal(latestAssistant?.askQuestion?.options.length, 3);

    const row = db.prepare(
      "SELECT tool_payload FROM messages WHERE role = ? ORDER BY created_at DESC LIMIT 1"
    ).get("assistant") as { tool_payload: string | null };
    assert.notEqual(row.tool_payload, null);
  });

  it("strips duplicate prompt and bridge prose from assistant bubble", async () => {
    const db = createChatTestDb();
    const askPayload = {
      v: 1 as const,
      name: "AskQuestion" as const,
      prompt: "Which route feels right?",
      options: [
        { id: "a", label: "🟢 Sail north" },
        { id: "b", label: "🟡 Hold position" },
        { id: "c", label: "🔴 Turn back" },
      ],
    };
    const prismTail =
      `\n<<<PRISM_TOOL>>>\n${JSON.stringify(askPayload)}\n<<<END_PRISM_TOOL>>>`;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          message: {
            content:
              `Context that should stay.\n\nQuestion: Which route feels right?\nPlease choose one option below.\n${prismTail}`,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Give me options.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "chat",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.content, "Context that should stay.");
    assert.equal(lastAssistant?.askQuestion?.prompt, "Which route feels right?");
  });

  it("strips duplicate option lists in multiline and single-line formats", async () => {
    const db = createChatTestDb();
    const askPayload = {
      v: 1 as const,
      name: "AskQuestion" as const,
      prompt: "Choose your navigation mode.",
      options: [
        { id: "a", label: "🟢 Sail north" },
        { id: "b", label: "🟡 Hold position" },
        { id: "c", label: "🔴 Turn back" },
      ],
    };
    const prismTail =
      `\n<<<PRISM_TOOL>>>\n${JSON.stringify(askPayload)}\n<<<END_PRISM_TOOL>>>`;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          message: {
            content: [
              "Keep this context line.",
              "A) 🟢 Sail north",
              "B) 🟡 Hold position",
              "C) 🔴 Turn back",
              "A) 🟢 Sail north B) 🟡 Hold position C) 🔴 Turn back",
              "🟢 Sail north | 🟡 Hold position | 🔴 Turn back",
              "",
              prismTail,
            ].join("\n"),
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Give me choices.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "chat",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.content, "Keep this context line.");
  });

  it("refines AskQuestion chip heading from chooser prose when JSON prompt is substantive", async () => {
    const db = createChatTestDb();
    const askPayload = {
      v: 1 as const,
      name: "AskQuestion" as const,
      prompt: "What is the optimal ratio of strawberry jam to whipped cream on a classic shortcake?",
      options: [
        { id: "a", label: "🟢 3:1" },
        { id: "b", label: "🟡 2:1" },
        { id: "c", label: "🔴 1:1" },
      ],
    };
    const prismTail =
      `\n<<<PRISM_TOOL>>>\n${JSON.stringify(askPayload)}\n<<<END_PRISM_TOOL>>>`;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          message: {
            content: [
              "Here's your random question:",
              "What is the optimal ratio of strawberry jam to whipped cream on a classic shortcake?",
              "A) 3:1 ratio",
              "B) 2:1 ratio",
              "C) 1:1 ratio",
              "D) It's a matter of personal preference, and we can't decide without more data!",
              "Which option do you choose?",
              prismTail,
            ].join("\n"),
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Ask a multiple-choice question.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "chat",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.askQuestion?.prompt, "Which option do you choose?");
    assert.match(lastAssistant?.content ?? "", /optimal ratio/i);
    assert.match(lastAssistant?.content ?? "", /shortcake/i);
    const dLine = lastAssistant?.content.includes("D)") ?? false;
    assert.equal(dLine, false);
  });

  it("strips markdown and emoji variants of duplicate AskQuestion lines", async () => {
    const db = createChatTestDb();
    const askPayload = {
      v: 1 as const,
      name: "AskQuestion" as const,
      prompt: "Which route feels right?",
      options: [
        { id: "a", label: "🟢 Sail north" },
        { id: "b", label: "🟡 Hold position" },
        { id: "c", label: "🔴 Turn back" },
      ],
    };
    const prismTail =
      `\n<<<PRISM_TOOL>>>\n${JSON.stringify(askPayload)}\n<<<END_PRISM_TOOL>>>`;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          message: {
            content: [
              "Helpful context remains.",
              "## **Which route feels right?!**",
              "- **A)** 🟢 *Sail north*",
              "- **B)** 🟡 *Hold position*",
              "- **C)** 🔴 *Turn back*",
              "Tap an option below.",
              prismTail,
            ].join("\n"),
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Ask with chips.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "chat",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.content, "Helpful context remains.");
  });
});

describe("processChatMessage auto-generated titles", () => {
  it("updates a new conversation title in the background after the first reply", async () => {
    const db = createChatTestDb();
    let titleCalls = 0;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ content: string }>;
      };
      const prompt = body.messages?.at(-1)?.content ?? "";
      if (prompt.includes('"title"')) {
        titleCalls += 1;
        return new Response(
          JSON.stringify({ message: { content: '{"title":"Sourdough Care Plan"}' } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ message: { content: "Keep the starter warm and fed." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "How do I keep my sourdough starter alive?",
      Buffer.alloc(32, 7),
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "chat",
      }
    );

    assert.equal(result.conversation.title, "How do I keep my sourdough starter alive?");
    await flushBackgroundTitleJobs();

    const row = db
      .prepare("SELECT title FROM conversations WHERE id = ?")
      .get(result.conversation.id) as { title: string };
    assert.equal(row.title, "Sourdough Care Plan");
    assert.equal(titleCalls, 1);
  });

  it("does not re-title an existing conversation on later replies", async () => {
    const db = createChatTestDb();
    let titleCalls = 0;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ content: string }>;
      };
      const prompt = body.messages?.at(-1)?.content ?? "";
      if (prompt.includes('"title"')) {
        titleCalls += 1;
        return new Response(
          JSON.stringify({ message: { content: '{"title":"First Topic"}' } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ message: { content: "Assistant reply" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const first = await processChatMessage(
      db,
      "user-1",
      "Tell me about kelp forests.",
      Buffer.alloc(32, 7),
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "chat",
      }
    );
    await flushBackgroundTitleJobs();

    await processChatMessage(
      db,
      "user-1",
      "What animals live there?",
      Buffer.alloc(32, 7),
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "chat",
      },
      first.conversation.id
    );
    await flushBackgroundTitleJobs();

    const row = db
      .prepare("SELECT title FROM conversations WHERE id = ?")
      .get(first.conversation.id) as { title: string };
    assert.equal(row.title, "First Topic");
    assert.equal(titleCalls, 1);
  });

  it("re-titles after rewinding the first user message", async () => {
    const db = createChatTestDb();
    const inferredTitles = ["Original Topic", "Rewritten Topic"];
    let titleCalls = 0;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ content: string }>;
      };
      const prompt = body.messages?.at(-1)?.content ?? "";
      if (prompt.includes('"title"')) {
        const title = inferredTitles[titleCalls] ?? "Extra Topic";
        titleCalls += 1;
        return new Response(
          JSON.stringify({ message: { content: JSON.stringify({ title }) } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ message: { content: "Assistant reply" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const first = await processChatMessage(
      db,
      "user-1",
      "Plan a garden.",
      Buffer.alloc(32, 7),
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "chat",
      }
    );
    await flushBackgroundTitleJobs();

    const originalUserMessage = db
      .prepare("SELECT id FROM messages WHERE conversation_id = ? AND role = 'user'")
      .get(first.conversation.id) as { id: string };
    rewindConversation(db, "user-1", first.conversation.id, originalUserMessage.id);

    await processChatMessage(
      db,
      "user-1",
      "Plan a moon garden.",
      Buffer.alloc(32, 7),
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "chat",
      },
      first.conversation.id
    );
    await flushBackgroundTitleJobs();

    const row = db
      .prepare("SELECT title FROM conversations WHERE id = ?")
      .get(first.conversation.id) as { title: string };
    assert.equal(row.title, "Rewritten Topic");
    assert.equal(titleCalls, 2);
  });

  it("skips title generation for incognito chats", async () => {
    const db = createChatTestDb();
    let chatCalls = 0;
    globalThis.fetch = (async () => {
      chatCalls += 1;
      return new Response(
        JSON.stringify({ message: { content: "Private reply" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    await processChatMessage(
      db,
      "user-1",
      "Keep this private.",
      Buffer.alloc(32, 7),
      {
        preferredProvider: "local",
        autoMemory: true,
        incognito: true,
        mode: "chat",
      }
    );
    await flushBackgroundTitleJobs();

    const conversationCount = db
      .prepare("SELECT COUNT(*) AS n FROM conversations")
      .get() as { n: number };
    assert.equal(conversationCount.n, 0);
    assert.equal(chatCalls, 1);
  });
});

describe("refreshConversationTitle", () => {
  it("updates an existing conversation title from recent messages without changing activity time", async () => {
    const db = createChatTestDb();
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ content: string }>;
      };
      assert.match(body.messages?.at(-1)?.content ?? "", /Recent conversation transcript/);
      return new Response(
        JSON.stringify({ message: { content: '{"title":"Moon Garden Supplies"}' } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    db.prepare(
      "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "conversation-1",
      "user-1",
      "Garden Plan",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:10.000Z"
    );
    const insertMessage = db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    insertMessage.run(
      "message-1",
      "conversation-1",
      "user-1",
      "user",
      "Let's plan a garden.",
      "2026-01-01T00:00:01.000Z"
    );
    insertMessage.run(
      "message-2",
      "conversation-1",
      "user-1",
      "assistant",
      "Start with soil and light.",
      "2026-01-01T00:00:02.000Z"
    );
    insertMessage.run(
      "message-3",
      "conversation-1",
      "user-1",
      "user",
      "Actually this is for moon garden supplies.",
      "2026-01-01T00:00:09.000Z"
    );
    insertMessage.run(
      "message-4",
      "conversation-1",
      "user-1",
      "assistant",
      "Moon garden supplies means white blooms, night-fragrant herbs, and pale stones.",
      "2026-01-01T00:00:10.000Z"
    );

    const result = await refreshConversationTitle(db, "user-1", "conversation-1");

    assert.equal(result?.title, "Moon Garden Supplies");
    const row = db
      .prepare("SELECT title, updated_at FROM conversations WHERE id = ?")
      .get("conversation-1") as { title: string; updated_at: string };
    assert.equal(row.title, "Moon Garden Supplies");
    assert.equal(row.updated_at, "2026-01-01T00:00:10.000Z");
  });

  it("does not title conversations without an assistant reply", async () => {
    const db = createChatTestDb();
    let titleCalls = 0;
    globalThis.fetch = (async () => {
      titleCalls += 1;
      return new Response(
        JSON.stringify({ message: { content: '{"title":"Should Not Happen"}' } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    db.prepare(
      "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "conversation-1",
      "user-1",
      "Draft",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      "message-1",
      "conversation-1",
      "user-1",
      "user",
      "No answer yet.",
      "2026-01-01T00:00:01.000Z"
    );

    const result = await refreshConversationTitle(db, "user-1", "conversation-1");

    assert.equal(result, null);
    assert.equal(titleCalls, 0);
  });
});

describe("processChatMessage conversational memory cues", () => {
  it("saves explicit global memories even when auto-memory is off", async () => {
    const db = createChatTestDb();
    const userKey = Buffer.alloc(32, 7);
    installChatFetchStub();

    const result = await processChatMessage(
      db,
      "user-1",
      "I love pistachios. Make that a global memory.",
      userKey,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      }
    );

    const row = db
      .prepare("SELECT bot_id FROM memories")
      .get() as { bot_id: string | null } | undefined;
    assert.equal(row?.bot_id, null);
    assert.equal(result.memoryLearned?.created.length, 1);
    assert.equal(result.memoryLearned?.created[0]?.botId, null);
  });

  it("cleans assistant self-reference memory instructions before saving", async () => {
    const db = createChatTestDb();
    const userKey = Buffer.alloc(32, 7);
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        prompt?: string;
        messages?: Array<{ content: string }>;
      };
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (body.messages?.[0]?.content.includes("memory validation critic")) {
        return new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                results: [
                  {
                    index: 0,
                    decision: "auto_fix",
                    text: "You prefer Prism not to refer to itself as AI.",
                    confidence: 0.92,
                    reasonCodes: ["assistant_identity_instruction"],
                  },
                ],
              }),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ message: { content: "Got it." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Remember this: do not refer to yourself as AI.",
      userKey,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      }
    );

    assert.equal(result.memoryLearned?.created.length, 1);
    assert.equal(
      result.memoryLearned?.created[0]?.text,
      "You prefer Prism not to refer to itself as AI."
    );
    assert.equal(result.memoryLearned?.created[0]?.validationStatus, "auto_fixed");
    assert.equal(result.memoryLearned?.rejected.length, 0);
  });

  it("retracts a semantically matched memory by cue", async () => {
    const db = createChatTestDb();
    const userKey = Buffer.alloc(32, 7);
    installChatFetchStub();
    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "You love pistachios.", confidence: 0.92 }],
      userKey
    );
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run("conversation-1", "user-1", "Existing chat", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const result = await processChatMessage(
      db,
      "user-1",
      "Nevermind what I said about pistachios.",
      userKey,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      },
      "conversation-1"
    );

    const remaining = db
      .prepare("SELECT COUNT(*) AS n FROM memories")
      .get() as { n: number };
    assert.equal(remaining.n, 0);
    assert.equal(result.memoryLearned?.retracted[0]?.text, "You love pistachios.");
  });

  it("retracts before creating replacement memories for correction cues", async () => {
    const db = createChatTestDb();
    const userKey = Buffer.alloc(32, 7);
    installChatFetchStub();
    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "You prefer coffee.", confidence: 0.92 }],
      userKey
    );
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run("conversation-1", "user-1", "Existing chat", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const result = await processChatMessage(
      db,
      "user-1",
      "Forget what I said about coffee. Actually I prefer matcha.",
      userKey,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      },
      "conversation-1"
    );

    const rows = db
      .prepare("SELECT bot_id FROM memories")
      .all() as Array<{ bot_id: string | null }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.bot_id, "bot-1");
    assert.equal(result.memoryLearned?.retracted[0]?.text, "You prefer coffee.");
    assert.equal(result.memoryLearned?.created[0]?.text, "You prefer matcha.");
  });

  it("returns a session opinion payload and keeps it conversation-scoped", async () => {
    const db = createChatTestDb();
    const userKey = Buffer.alloc(32, 7);
    installChatFetchStub("Understood.");

    const first = await processChatMessage(
      db,
      "user-1",
      "Thanks for helping me think this through.",
      userKey,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      }
    );
    assert.ok(first.opinion);
    assert.equal(first.opinion?.trend, "up");
    assert.match(first.opinion?.lastReason ?? "", /considerate|positive/i);

    const second = await processChatMessage(
      db,
      "user-1",
      "do it now",
      userKey,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      },
      first.conversation.id
    );
    assert.ok(second.opinion);
    assert.equal(second.opinion?.trend, "down");
    assert.notEqual(second.opinion?.score, first.opinion?.score);

    const freshConversation = await processChatMessage(
      db,
      "user-1",
      "Thank you again.",
      userKey,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      }
    );
    assert.ok(freshConversation.opinion);
    assert.equal(freshConversation.opinion?.score, 53);
    assert.notEqual(freshConversation.conversation.id, first.conversation.id);
  });
});
