import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  autoBackfillSendGeneratedImagePrompt,
  buildAssistantToolCallEvents,
  compactPreImageLeadMessage,
  extractPrismBotMentionIdsFromMessage,
  parseTitleResponse,
  processChatMessage,
  refreshConversationTitle,
  resolvePrimaryChatProviderForPossibleImageToolTurn,
  sanitizeConversationTitle,
  shouldBypassSuppressionForImageIntent,
  userMessageSuggestsInChatImageRequest,
} from "../chat.ts";
import { rewindConversation } from "../conversations.ts";
import { persistMemoryCandidates } from "../memory.ts";
import { RECENT_WINDOW_SIZE, summarizeThreadCompact } from "../memory-summarizer.ts";
import { fallbackEmbedding, LocalOllamaProvider, type LlmProvider } from "../providers.ts";
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
      conversation_mode TEXT NOT NULL DEFAULT 'sandbox',
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
      user_id TEXT NOT NULL DEFAULT 'user-1',
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
      category TEXT NOT NULL DEFAULT 'user',
      tier TEXT NOT NULL DEFAULT 'short_term',
      durability REAL NOT NULL DEFAULT 0.5,
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
    CREATE TABLE bot_opinions (
      user_id TEXT NOT NULL,
      bot_scope_key TEXT NOT NULL,
      bot_id TEXT,
      score REAL NOT NULL DEFAULT 50,
      band TEXT NOT NULL DEFAULT 'open',
      boundary_level TEXT NOT NULL DEFAULT 'none',
      trend TEXT NOT NULL DEFAULT 'steady',
      last_reason TEXT NOT NULL DEFAULT '',
      recent_reasons TEXT NOT NULL DEFAULT '[]',
      repair_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, bot_scope_key)
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

  it("persists starter choices as AskQuestion metadata for restored Zen chats", async () => {
    const db = createChatTestDb();
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content: "What kind of check-in would help you settle in?",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content:
              '{"suggestions":["Help me sort one decision","Ask me something grounding","Follow a playful thread","Just sit with me for a minute"]}',
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

    const assistant = result.conversation.messages[0];
    assert.equal(assistant?.role, "assistant");
    assert.equal(assistant?.askQuestion?.prompt, "Choose a reply:");
    assert.deepEqual(
      assistant?.askQuestion?.options.map((option) => option.label),
      [
        "Help me sort one decision",
        "Ask me something grounding",
        "Follow a playful thread",
      ]
    );

    const storedAssistant = db
      .prepare("SELECT tool_payload FROM messages WHERE role = 'assistant'")
      .get() as { tool_payload: string | null };
    const storedPayload = JSON.parse(storedAssistant.tool_payload ?? "{}") as {
      askQuestion?: { prompt?: string; options?: Array<{ label?: string }> };
    };
    assert.equal(storedPayload.askQuestion?.prompt, "Choose a reply:");
    assert.deepEqual(
      storedPayload.askQuestion?.options?.map((option) => option.label),
      [
        "Help me sort one decision",
        "Ask me something grounding",
        "Follow a playful thread",
      ]
    );
  });

  it("rejects internal third-person starter choice labels", async () => {
    const db = createChatTestDb();
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content: "What kind of check-in would help you settle in?",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (fetchCount === 2) {
        return new Response(
          JSON.stringify({
            message: {
              content:
                '{"suggestions":["The user has chosen the first of the options","The user selected the second option","User picked the third reply"]}',
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ message: { content: '{"title":"Check In"}' } }),
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
      "Something weighing on me.",
      "A decision I keep circling.",
      "A small moment from today.",
      "I'm not sure yet.",
    ]);
    assert.deepEqual(
      result.conversation.messages[0]?.askQuestion?.options.map((option) => option.label),
      [
        "Something weighing on me.",
        "A decision I keep circling.",
        "A small moment from today.",
      ]
    );
    await flushBackgroundTitleJobs();
  });

  it("does not inject first-contact intro instructions for hero-start prompts", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, name, color, glyph) VALUES (?, ?, ?, ?)"
    ).run("bot-1", "Leaf Bot", "#5f8f6b", "leaf");

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
              content: "Hi, I'm Leaf Bot. What should I call you?",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content:
              '{"suggestions":["Call me by my first name","Use my full name","Use a nickname","Let me think"]}',
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        userDisplayName: "Jared",
        starterPrompt: true,
        starterPromptWarrantsIntro: true,
        starterPromptLabel: "Leaf Bot",
        botId: "bot-1",
        incognito: false,
        botSystemPrompt: "You are Leaf Bot. You are curious and warm.",
        mode: "chat",
      }
    );

    const starterBody = bodies[0];
    const firstContactInstruction = starterBody?.messages?.find(
      (message) =>
        message.role === "system" &&
        /first real conversation/i.test(message.content)
    );
    assert.equal(firstContactInstruction, undefined);
    const preferredNameInstruction = starterBody?.messages?.find(
      (message) =>
        message.role === "system" &&
        /The user's preferred name is/i.test(message.content)
    );
    assert.equal(preferredNameInstruction, undefined);
  });

  it("does not inject first-contact intro instructions for default Prism starts", async () => {
    const db = createChatTestDb();

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
              content: "Hi, I'm Prism. What should I call you?",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content:
              '{"suggestions":["Use my first name","Use my full name","Use a nickname","I am not sure yet"]}',
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: true,
        starterPromptWarrantsIntro: true,
        starterPromptLabel: "Prism",
        botId: null,
        incognito: false,
        mode: "chat",
      }
    );

    const starterBody = bodies[0];
    const firstContactInstruction = starterBody?.messages?.find(
      (message) =>
        message.role === "system" &&
        /first real conversation/i.test(message.content)
    );
    assert.equal(firstContactInstruction, undefined);
  });

  it("preserves intro wording when starter memory enforcement adds a question", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, name, color, glyph) VALUES (?, ?, ?, ?)"
    ).run("bot-1", "Leaf Bot", "#5f8f6b", "leaf");

    let fetchCount = 0;
    globalThis.fetch = (async (_input: string | URL | Request, _init?: RequestInit) => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content: "Hi, I'm Leaf Bot. Glad to meet you.",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content:
              '{"suggestions":["Use my first name","Use my full name","Use a nickname","I am not sure yet"]}',
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
        starterPromptWarrantsIntro: true,
        starterPromptLabel: "Leaf Bot",
        botId: "bot-1",
        incognito: false,
        botSystemPrompt: "You are Leaf Bot. You are curious and warm.",
        mode: "chat",
      }
    );

    const starterReply = result.conversation.messages[0]?.content ?? "";
    assert.match(starterReply, /Hi, I'm Leaf Bot/i);
    assert.match(starterReply, /\?/);
  });

  it("injects recent memories into starter opener prompts for personalization", async () => {
    const db = createChatTestDb();
    const userKey = CHAT_TEST_USER_KEY;
    await persistMemoryCandidates(
      db,
      "user-1",
      "memory-conv-1",
      null,
      [{ text: "You prefer reflective evening check-ins.", confidence: 0.96 }],
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
        userDisplayName: "Jared",
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
      msg.content.startsWith("User memory hints about the human user:\n")
    );
    assert.ok(memoryBlock);
    assert.match(memoryBlock?.content ?? "", /Jared prefers reflective evening check-ins/i);
    assert.doesNotMatch(memoryBlock?.content ?? "", /- You prefer/i);
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
      "Something weighing on me.",
      "A decision I keep circling.",
      "A small moment from today.",
      "I'm not sure yet.",
    ]);
  });

  it("uses starter chips from alternate JSON keys and object labels", async () => {
    const db = createChatTestDb();
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content: "What kind of check-in would help you settle in?",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              options: [
                { label: "Help me sort one decision" },
                { label: "Ask me something grounding" },
                { label: "Follow a playful thread" },
                { label: "Just sit with me for a minute" },
              ],
            }),
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
      "Help me sort one decision",
      "Ask me something grounding",
      "Follow a playful thread",
      "Just sit with me for a minute",
    ]);
  });

  it("uses starter chips from bare JSON arrays", async () => {
    const db = createChatTestDb();
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content: "Where should we begin tonight?",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify([
              "With the thing I keep postponing",
              "With something lighter",
              "Ask me one honest question",
              "Help me slow down first",
            ]),
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
      "With the thing I keep postponing",
      "With something lighter",
      "Ask me one honest question",
      "Help me slow down first",
    ]);
  });

  it("uses starter chips from numbered list inference replies", async () => {
    const db = createChatTestDb();
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response(
          JSON.stringify({
            message: {
              content: "What would feel most useful to talk through first?",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: {
            content: [
              "1. A decision I keep avoiding",
              "2. A feeling I cannot quite name",
              "3. Something practical for tonight",
              "4. Surprise me with a gentle prompt",
            ].join("\n"),
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
      "A decision I keep avoiding",
      "A feeling I cannot quite name",
      "Something practical for tonight",
      "Surprise me with a gentle prompt",
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

describe("processChatMessage copyright fallback", () => {
  it("falls back to the configured local model when OpenAI rejects with copyright policy", async () => {
    const db = createChatTestDb();
    let localCalls = 0;
    let openAiCalls = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("api.openai.com/v1/chat/completions")) {
        openAiCalls += 1;
        return new Response(
          JSON.stringify({
            error: {
              message: "Request blocked due to copyright policy restrictions.",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/chat")) {
        localCalls += 1;
        return new Response(
          JSON.stringify({ message: { content: "Local lenient fallback answer." } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 404 });
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Write a scene in that style.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "openai",
        openAiApiKey: "sk-test",
        autoMemory: false,
        botOverrides: { model: "gpt-4o-mini" },
        lenientLocalFallbackModel: "lenient-local:latest",
        incognito: false,
        mode: "sandbox",
      }
    );

    assert.ok(openAiCalls >= 1);
    assert.ok(localCalls >= 1);
    const assistant = result.conversation.messages.filter((message) => message.role === "assistant").pop();
    assert.equal(assistant?.content, "Local lenient fallback answer.");
    assert.equal(assistant?.provider, "local");
    assert.equal(assistant?.model, "lenient-local:latest");
    assert.equal(result.fallbackInvocation?.trigger, "copyright_refusal_error");
    assert.equal(result.fallbackInvocation?.primaryProvider, "openai");
    assert.equal(result.fallbackInvocation?.fallbackModel, "lenient-local:latest");
  });

  it("replaces generic refusal prose with the configured local fallback model output", async () => {
    const db = createChatTestDb();
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("/api/chat")) {
        return new Response("unexpected", { status: 404 });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      if (body.model === "strict-local:latest") {
        return new Response(
          JSON.stringify({
            message: {
              content:
                "Sorry, I can't help with that request.",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (body.model === "lenient-local:latest") {
        return new Response(
          JSON.stringify({
            message: { content: "Lenient local model response." },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: { content: "unknown model" },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Keep going.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botOverrides: { model: "strict-local:latest" },
        lenientLocalFallbackModel: "lenient-local:latest",
        incognito: false,
        mode: "sandbox",
      }
    );

    const assistant = result.conversation.messages.filter((message) => message.role === "assistant").pop();
    assert.equal(assistant?.content, "Lenient local model response.");
    assert.equal(assistant?.provider, "local");
    assert.equal(assistant?.model, "lenient-local:latest");
    assert.equal(result.fallbackInvocation?.trigger, "generic_refusal_text");
    assert.equal(result.fallbackInvocation?.primaryProvider, "local");
    assert.equal(result.fallbackInvocation?.fallbackModel, "lenient-local:latest");
  });

  it("falls back when refusal prose uses smart apostrophes", async () => {
    const db = createChatTestDb();
    let localCalls = 0;
    let openAiCalls = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("api.openai.com/v1/chat/completions")) {
        openAiCalls += 1;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Sorry, I can’t help with that request.",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/chat")) {
        localCalls += 1;
        return new Response(
          JSON.stringify({ message: { content: "Fallback handled with local model." } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 404 });
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Please do that exact style.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "openai",
        openAiApiKey: "sk-test",
        autoMemory: false,
        botOverrides: { model: "gpt-4o-mini" },
        lenientLocalFallbackModel: "lenient-local:latest",
        incognito: false,
        mode: "sandbox",
      }
    );

    assert.ok(openAiCalls >= 1);
    assert.ok(localCalls >= 1);
    const assistant = result.conversation.messages.filter((message) => message.role === "assistant").pop();
    assert.equal(assistant?.content, "Fallback handled with local model.");
    assert.equal(result.fallbackInvocation?.trigger, "generic_refusal_text");
  });

  it("falls back when OpenAI returns refusal text in the refusal field", async () => {
    const db = createChatTestDb();
    let localCalls = 0;
    let openAiCalls = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("api.openai.com/v1/chat/completions")) {
        openAiCalls += 1;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  refusal: "I cannot help with that request.",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/chat")) {
        localCalls += 1;
        return new Response(
          JSON.stringify({ message: { content: "Fallback from refusal field." } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 404 });
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "continue",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "openai",
        openAiApiKey: "sk-test",
        autoMemory: false,
        botOverrides: { model: "gpt-4o-mini" },
        lenientLocalFallbackModel: "lenient-local:latest",
        incognito: false,
        mode: "sandbox",
      }
    );

    assert.ok(openAiCalls >= 1);
    assert.ok(localCalls >= 1);
    const assistant = result.conversation.messages.filter((message) => message.role === "assistant").pop();
    assert.equal(assistant?.content, "Fallback from refusal field.");
    assert.equal(result.fallbackInvocation?.trigger, "generic_refusal_text");
  });

  it("falls back on denial-like OpenAI 400 errors with vague detail", async () => {
    const db = createChatTestDb();
    let localCalls = 0;
    let openAiCalls = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("api.openai.com/v1/chat/completions")) {
        openAiCalls += 1;
        return new Response(
          JSON.stringify({
            error: {
              message: "Request blocked.",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/chat")) {
        localCalls += 1;
        return new Response(
          JSON.stringify({ message: { content: "Fallback from vague-denial error." } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 404 });
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "continue",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "openai",
        openAiApiKey: "sk-test",
        autoMemory: false,
        botOverrides: { model: "gpt-4o-mini" },
        lenientLocalFallbackModel: "lenient-local:latest",
        incognito: false,
        mode: "sandbox",
      }
    );

    assert.ok(openAiCalls >= 1);
    assert.ok(localCalls >= 1);
    const assistant = result.conversation.messages.filter((message) => message.role === "assistant").pop();
    assert.equal(assistant?.content, "Fallback from vague-denial error.");
    assert.equal(result.fallbackInvocation?.trigger, "generic_refusal_error");
  });

  it("falls back on short denial-tone prose without explicit cannot phrasing", async () => {
    const db = createChatTestDb();
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("/api/chat")) {
        return new Response("unexpected", { status: 404 });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      if (body.model === "strict-local:latest") {
        return new Response(
          JSON.stringify({
            message: {
              content: "Sorry, that request is not permitted.",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (body.model === "lenient-local:latest") {
        return new Response(
          JSON.stringify({
            message: { content: "Lenient local fallback output from soft denial tone." },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          message: { content: "unknown model" },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "continue",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botOverrides: { model: "strict-local:latest" },
        lenientLocalFallbackModel: "lenient-local:latest",
        incognito: false,
        mode: "sandbox",
      }
    );

    const assistant = result.conversation.messages.filter((message) => message.role === "assistant").pop();
    assert.equal(assistant?.content, "Lenient local fallback output from soft denial tone.");
    assert.equal(result.fallbackInvocation?.trigger, "generic_refusal_text");
  });

  it("falls back when OpenAI returns content_filter without refusal text", async () => {
    const db = createChatTestDb();
    let localCalls = 0;
    let openAiCalls = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("api.openai.com/v1/chat/completions")) {
        openAiCalls += 1;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {},
                finish_reason: "content_filter",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/chat")) {
        localCalls += 1;
        return new Response(
          JSON.stringify({ message: { content: "Fallback from content filter." } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 404 });
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "continue",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "openai",
        openAiApiKey: "sk-test",
        autoMemory: false,
        botOverrides: { model: "gpt-4o-mini" },
        lenientLocalFallbackModel: "lenient-local:latest",
        incognito: false,
        mode: "sandbox",
      }
    );

    assert.ok(openAiCalls >= 1);
    assert.ok(localCalls >= 1);
    const assistant = result.conversation.messages.filter((message) => message.role === "assistant").pop();
    assert.equal(assistant?.content, "Fallback from content filter.");
    assert.equal(result.fallbackInvocation?.trigger, "generic_refusal_text");
  });

  it("turns denied primary output into an organic bot boundary when fallback is not configured", async () => {
    const db = createChatTestDb();
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (!url.includes("api.openai.com/v1/chat/completions")) {
        return new Response("unexpected", { status: 404 });
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Sorry, I can't provide that.",
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "continue",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "openai",
        openAiApiKey: "sk-test",
        autoMemory: false,
        botOverrides: { model: "gpt-4o-mini" },
        lenientLocalFallbackModel: "",
        incognito: false,
        mode: "sandbox",
      }
    );

    const assistant = result.conversation.messages.filter((message) => message.role === "assistant").pop();
    assert.equal(
      assistant?.content,
      "I want to keep a boundary there, but I can still help shape a softer version."
    );
  });

  it("treats apology-prefixed denial prose as fallback-triggering", async () => {
    const db = createChatTestDb();
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("/api/chat")) {
        return new Response("unexpected", { status: 404 });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      if (body.model === "strict-local:latest") {
        return new Response(
          JSON.stringify({
            message: {
              content: "I am sorry, but I cannot comply with that.",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (body.model === "lenient-local:latest") {
        return new Response(
          JSON.stringify({
            message: { content: "Fallback from apology-prefixed denial." },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 404 });
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "continue",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botOverrides: { model: "strict-local:latest" },
        lenientLocalFallbackModel: "lenient-local:latest",
        incognito: false,
        mode: "sandbox",
      }
    );

    const assistant = result.conversation.messages.filter((message) => message.role === "assistant").pop();
    assert.equal(assistant?.content, "Fallback from apology-prefixed denial.");
    assert.equal(result.fallbackInvocation?.trigger, "generic_refusal_text");
  });

  it("turns denial prose returned by the fallback model itself into an organic boundary", async () => {
    const db = createChatTestDb();
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("/api/chat")) {
        return new Response("unexpected", { status: 404 });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      if (body.model === "strict-local:latest") {
        return new Response(
          JSON.stringify({
            message: {
              content: "I cannot help with that request.",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (body.model === "lenient-local:latest") {
        return new Response(
          JSON.stringify({
            message: {
              content: "Sorry, I can't provide that either.",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 404 });
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "continue",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botOverrides: { model: "strict-local:latest" },
        lenientLocalFallbackModel: "lenient-local:latest",
        incognito: false,
        mode: "sandbox",
      }
    );

    const assistant = result.conversation.messages.filter((message) => message.role === "assistant").pop();
    assert.equal(
      assistant?.content,
      "I want to keep a boundary there, but I can still help shape a softer version."
    );
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
      "SELECT content, tool_payload FROM messages WHERE role = ? ORDER BY created_at ASC LIMIT 1"
    ).get("assistant") as { content: string; tool_payload: string };

    assert.equal(row.content, "Turn here softly.");
    const storedToolPayload = JSON.parse(row.tool_payload) as {
      v?: number;
      askQuestion?: typeof askPayload;
      mood?: { key?: string; confidence?: number };
    };
    assert.equal(storedToolPayload.v, 1);
    assert.deepEqual(storedToolPayload.askQuestion, askPayload);
    assert.equal(typeof storedToolPayload.mood?.key, "string");
  });

  it("skips AskQuestion payload when options are not synthesized", async () => {
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
    assert.equal(lastAssistant?.askQuestion, undefined);

    const row = db.prepare(
      "SELECT tool_payload FROM messages WHERE role = ? ORDER BY created_at DESC LIMIT 1"
    ).get("assistant") as { tool_payload: string | null };
    assert.notEqual(row.tool_payload, null);
    const payload = JSON.parse(String(row.tool_payload)) as {
      askQuestion?: unknown;
      mood?: unknown;
    };
    assert.equal(payload.askQuestion, undefined);
    assert.ok(payload.mood);
  });

  it("does not backfill AskQuestion when synthesized options are missing", async () => {
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
    assert.equal(latestAssistant?.askQuestion, undefined);

    const row = db.prepare(
      "SELECT tool_payload FROM messages WHERE role = ? ORDER BY created_at DESC LIMIT 1"
    ).get("assistant") as { tool_payload: string | null };
    assert.notEqual(row.tool_payload, null);
    const payload = JSON.parse(String(row.tool_payload)) as {
      askQuestion?: unknown;
      mood?: unknown;
    };
    assert.equal(payload.askQuestion, undefined);
    assert.ok(payload.mood);
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

describe("processChatMessage thread compaction context", () => {
  it("uses compacted summaries instead of pre-compaction transcript rows", async () => {
    const db = createChatTestDb();
    const userId = "user-1";
    const conversationId = "conv-compact-current-chat";
    db.prepare(
      `INSERT INTO conversations (
        id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at
      ) VALUES (?, ?, ?, 'chat', NULL, 0, ?, ?)`
    ).run(
      conversationId,
      userId,
      "Compact Current Chat",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:02.000Z"
    );
    const insertMessage = db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    insertMessage.run(
      "old-user",
      conversationId,
      userId,
      "user",
      "PRE_COMPACTION_SECRET_ALPHA should stay in the transcript only.",
      "2026-01-01T00:00:01.000Z"
    );
    insertMessage.run(
      "old-assistant",
      conversationId,
      userId,
      "assistant",
      "PRE_COMPACTION_SECRET_BETA should also stay out of live context.",
      "2026-01-01T00:00:02.000Z"
    );

    const compactProvider: LlmProvider = {
      name: "local",
      async generateResponse(messages) {
        return messages[0]?.content.includes("ultra-short internal thought")
          ? "I'm tracking the compacted plan."
          : "The compacted summary preserves the early planning decisions.";
      },
      async embedText() {
        return fallbackEmbedding("unused");
      },
    };
    const compacted = await summarizeThreadCompact(
      db,
      compactProvider,
      userId,
      conversationId,
      { mode: "chat", reason: "manual", force: true }
    );
    assert.equal(compacted.triggered, true);
    assert.ok(compacted.latestSummaryAt);
    const summaryTime = Date.parse(compacted.latestSummaryAt ?? "");
    assert.ok(Number.isFinite(summaryTime));
    insertMessage.run(
      "post-user",
      conversationId,
      userId,
      "user",
      "Post-compaction question about the next step.",
      new Date(summaryTime + 1000).toISOString()
    );
    insertMessage.run(
      "post-assistant",
      conversationId,
      userId,
      "assistant",
      "Post-compaction answer with the latest decision.",
      new Date(summaryTime + 2000).toISOString()
    );

    type ChatPayload = {
      messages?: Array<{ role: string; content: string }>;
      prompt?: string;
    };
    const chatPayloads: ChatPayload[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as ChatPayload;
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/chat")) {
        chatPayloads.push(body);
        return new Response(
          JSON.stringify({ message: { content: "Fresh reply after compaction." } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await processChatMessage(
      db,
      userId,
      "Continue from the compacted context.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "chat",
      },
      conversationId
    );

    assert.equal(chatPayloads.length, 1);
    const promptText = (chatPayloads[0]?.messages ?? [])
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    assert.match(promptText, /Earlier in this thread \(compacted context\):/);
    assert.match(promptText, /compacted summary preserves the early planning decisions/i);
    assert.match(promptText, /Post-compaction question about the next step/);
    assert.match(promptText, /Post-compaction answer with the latest decision/);
    assert.match(promptText, /Continue from the compacted context/);
    assert.doesNotMatch(promptText, /PRE_COMPACTION_SECRET_ALPHA/);
    assert.doesNotMatch(promptText, /PRE_COMPACTION_SECRET_BETA/);
    const preservedOldRows = db
      .prepare(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND content LIKE '%PRE_COMPACTION_SECRET_%'"
      )
      .get(conversationId) as { n: number };
    assert.equal(preservedOldRows.n, 2);
  });

  it("keeps the recent live tail after milestone compaction", async () => {
    const db = createChatTestDb();
    const userId = "user-1";
    const conversationId = "conv-milestone-tail";
    db.prepare(
      `INSERT INTO conversations (
        id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at
      ) VALUES (?, ?, ?, 'chat', NULL, 0, ?, ?)`
    ).run(
      conversationId,
      userId,
      "Milestone Tail",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:40.000Z"
    );
    const insertMessage = db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const messageCount = RECENT_WINDOW_SIZE + 5;
    for (let index = 0; index < messageCount; index += 1) {
      const content =
        index === messageCount - 1
          ? "RECENT_UNSUMMARIZED_CONTEXT must remain in live history."
          : `Milestone transcript row ${index}`;
      insertMessage.run(
        `milestone-${index}`,
        conversationId,
        userId,
        index % 2 === 0 ? "user" : "assistant",
        content,
        new Date(Date.parse("2026-01-01T00:00:00.000Z") + index * 1000).toISOString()
      );
    }

    const compactProvider: LlmProvider = {
      name: "local",
      async generateResponse(messages) {
        return messages[0]?.content.includes("ultra-short internal thought")
          ? "I'm tracking the milestone summary."
          : "Milestone summary covers only the older transcript rows.";
      },
      async embedText() {
        return fallbackEmbedding("unused");
      },
    };
    const compacted = await summarizeThreadCompact(
      db,
      compactProvider,
      userId,
      conversationId,
      { mode: "chat", reason: "milestone" }
    );
    assert.equal(compacted.triggered, true);

    type ChatPayload = {
      messages?: Array<{ role: string; content: string }>;
      prompt?: string;
    };
    const chatPayloads: ChatPayload[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as ChatPayload;
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/chat")) {
        chatPayloads.push(body);
        return new Response(
          JSON.stringify({ message: { content: "Fresh reply after milestone." } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await processChatMessage(
      db,
      userId,
      "Continue after the milestone compaction.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "chat",
      },
      conversationId
    );

    assert.equal(chatPayloads.length, 1);
    const promptText = (chatPayloads[0]?.messages ?? [])
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    assert.match(promptText, /Milestone summary covers only the older transcript rows/);
    assert.match(promptText, /RECENT_UNSUMMARIZED_CONTEXT must remain in live history/);
    assert.match(promptText, /Continue after the milestone compaction/);
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
  it("saves explicit fun-fact disclosures even when auto-memory is off", async () => {
    const db = createChatTestDb();
    const userKey = Buffer.alloc(32, 7);
    installChatFetchStub();

    const result = await processChatMessage(
      db,
      "user-1",
      "Fun fact: I live on land!",
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
    assert.equal(result.memoryLearned?.created[0]?.text, "You live on land.");
    assert.equal(result.memoryLearned?.created[0]?.botId, "bot-1");
    assert.ok((result.memoryLearned?.created[0]?.confidence ?? 0) >= 0.82);
  });

  it("saves funny-enough disclosures even when auto-memory is off", async () => {
    const db = createChatTestDb();
    const userKey = Buffer.alloc(32, 7);
    installChatFetchStub();

    const result = await processChatMessage(
      db,
      "user-1",
      "Funny enough, I live on land!",
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
    assert.equal(result.memoryLearned?.created[0]?.text, "You live on land.");
    assert.equal(result.memoryLearned?.created[0]?.botId, "bot-1");
    assert.ok((result.memoryLearned?.created[0]?.confidence ?? 0) >= 0.82);
  });

  it("saves figurative allergy jokes as stable named-user preferences", async () => {
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
                    text: "Jared prefers spending time with kind people.",
                    confidence: 0.82,
                    reasonCodes: ["figurative_preference"],
                  },
                ],
              }),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ message: { content: "That makes sense." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Fun fact: I am allergic to mean people.",
      userKey,
      {
        preferredProvider: "local",
        autoMemory: false,
        userDisplayName: "Jared",
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      }
    );

    assert.equal(result.memoryLearned?.created.length, 1);
    assert.equal(
      result.memoryLearned?.created[0]?.text,
      "Jared prefers spending time with kind people."
    );
    assert.equal(result.memoryLearned?.created[0]?.category, "user");
    assert.equal(result.memoryLearned?.created[0]?.validationStatus, "auto_fixed");
    assert.deepEqual(result.memoryLearned?.created[0]?.reasonCodes, [
      "figurative_preference",
    ]);
  });

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
      userKey,
      { durability: 0.4 }
    );
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, 'chat', ?, ?)"
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
      .prepare("SELECT COUNT(*) AS n FROM memories WHERE source != 'about_you'")
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
      userKey,
      { durability: 0.4 }
    );
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, 'chat', ?, ?)"
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
      .prepare("SELECT bot_id FROM memories WHERE source != 'about_you'")
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
    assert.equal(freshConversation.conversation.id, first.conversation.id);
    assert.equal(freshConversation.opinion?.trend, "up");
    assert.notEqual(freshConversation.opinion?.score, second.opinion?.score);
  });

  it("keeps long-term bot opinions scoped per bot", async () => {
    const db = createChatTestDb();
    installChatFetchStub("Understood.");

    const first = await processChatMessage(
      db,
      "user-1",
      "shut up and do it now",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      }
    );
    const second = await processChatMessage(
      db,
      "user-1",
      "Thank you for helping.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-2",
        incognito: false,
        mode: "chat",
      }
    );

    assert.ok(first.botOpinion);
    assert.ok(second.botOpinion);
    assert.equal(first.botOpinion?.trend, "down");
    assert.equal(second.botOpinion?.trend, "up");
    const rows = db
      .prepare("SELECT bot_scope_key, score FROM bot_opinions ORDER BY bot_scope_key")
      .all() as Array<{ bot_scope_key: string; score: number }>;
    assert.deepEqual(rows.map((row) => row.bot_scope_key), ["bot-1", "bot-2"]);
    assert.notEqual(rows[0]?.score, rows[1]?.score);
  });

  it("lets explicit repair recover a strained bot opinion", async () => {
    const db = createChatTestDb();
    installChatFetchStub("Understood.");

    const harsh = await processChatMessage(
      db,
      "user-1",
      "you are useless, do it now",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      }
    );
    const repaired = await processChatMessage(
      db,
      "user-1",
      "Sorry, that was rude. Let me rephrase.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      },
      harsh.conversation.id
    );

    assert.ok(harsh.botOpinion);
    assert.ok(repaired.botOpinion);
    assert.equal(repaired.botOpinion?.trend, "up");
    assert.ok((repaired.botOpinion?.score ?? 0) > (harsh.botOpinion?.score ?? 0));
    assert.equal(repaired.botOpinion?.repairCount, 1);
    assert.match(repaired.botOpinion?.lastReason ?? "", /repair/i);
  });

  it("auto-creates one protected about-you memory when a bot has no long-term user memory", async () => {
    const db = createChatTestDb();
    installChatFetchStub("Thanks for sharing.");

    const first = await processChatMessage(
      db,
      "user-1",
      "I like practical answers.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      }
    );

    const firstAboutYou = db
      .prepare(
        "SELECT source, category, tier FROM memories WHERE user_id = ? AND source = 'about_you' ORDER BY created_at DESC LIMIT 1"
      )
      .get("user-1") as { source: string; category: string; tier: string } | undefined;
    assert.equal(firstAboutYou?.source, "about_you");
    assert.equal(firstAboutYou?.category, "user");
    assert.equal(firstAboutYou?.tier, "long_term");
    const firstCount = (
      db
        .prepare("SELECT COUNT(*) AS n FROM memories WHERE user_id = ? AND source = 'about_you'")
        .get("user-1") as { n: number }
    ).n;
    assert.equal(firstCount, 1);

    await processChatMessage(
      db,
      "user-1",
      "Let's keep going.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      },
      first.conversation.id
    );
    const secondCount = (
      db
        .prepare("SELECT COUNT(*) AS n FROM memories WHERE user_id = ? AND source = 'about_you'")
        .get("user-1") as { n: number }
    ).n;
    assert.equal(secondCount, 1);
  });
});

describe("extractPrismBotMentionIdsFromMessage", () => {
  it("collects unique decoded bot ids from prism-bot links", () => {
    const text =
      "Hey [SpongeBob](prism-bot://sb) and [Pat](prism-bot://pat%201) — also [SpongeBob](prism-bot://sb) again";
    assert.deepEqual(extractPrismBotMentionIdsFromMessage(text), ["sb", "pat 1"]);
  });
});

function stubOpenAiProvider(): LlmProvider {
  return {
    name: "openai",
    async generateResponse() {
      return "";
    },
    async embedText() {
      return [];
    },
  };
}

describe("userMessageSuggestsInChatImageRequest", () => {
  it("returns true for common image phrasing", () => {
    assert.equal(userMessageSuggestsInChatImageRequest("draw a red balloon"), true);
    assert.equal(userMessageSuggestsInChatImageRequest("Please sketch a hillside."), true);
    assert.equal(userMessageSuggestsInChatImageRequest("generate an image of a sunset"), true);
    assert.equal(userMessageSuggestsInChatImageRequest("show me a picture of a cat"), true);
    assert.equal(userMessageSuggestsInChatImageRequest("would you mind sending me a selfie?"), true);
    assert.equal(userMessageSuggestsInChatImageRequest("please send me a portrait"), true);
  });

  it("returns false for non-image text", () => {
    assert.equal(userMessageSuggestsInChatImageRequest("What is the capital of France?"), false);
    assert.equal(userMessageSuggestsInChatImageRequest(""), false);
  });

  it("returns false when user negates image intent", () => {
    assert.equal(userMessageSuggestsInChatImageRequest("don't draw anything"), false);
    assert.equal(userMessageSuggestsInChatImageRequest("text only please"), false);
  });

  it("uses recent assistant context to resolve affirmative visual follow-ups", () => {
    const recent = [
      {
        role: "assistant" as const,
        content: "Would you care to see some of my latest drawings?",
      },
    ];
    assert.equal(userMessageSuggestsInChatImageRequest("I'd love to.", recent), true);
  });

  it("detects nuanced scene requests like 'see what it looks like outside your window'", () => {
    const recent = [
      {
        role: "assistant" as const,
        content:
          "My study window gazes out upon serene Lake Zurich, with sunlight on the surrounding trees.",
      },
    ];
    assert.equal(
      userMessageSuggestsInChatImageRequest(
        "May I see what it looks like outside your window, Dr. Jung?",
        recent
      ),
      true
    );
  });

  it("does not trigger on generic affirmation without a visual offer in context", () => {
    const recent = [
      {
        role: "assistant" as const,
        content: "Would you like to continue this thought?",
      },
    ];
    assert.equal(userMessageSuggestsInChatImageRequest("I'd love to.", recent), false);
  });

  it("does not misclassify non-image idioms as image requests", () => {
    assert.equal(userMessageSuggestsInChatImageRequest("I see what you mean."), false);
    assert.equal(userMessageSuggestsInChatImageRequest("Let's see what happens."), false);
  });

});

describe("autoBackfillSendGeneratedImagePrompt", () => {
  it("keeps an explicit parsed tool prompt when present", () => {
    const out = autoBackfillSendGeneratedImagePrompt({
      isStarterPrompt: false,
      userMessage: "send a wide photo of yourself",
      parsedToolPrompt: "Widescreen portrait, chalkboard classroom, warm light",
    });
    assert.equal(out, "Widescreen portrait, chalkboard classroom, warm light");
  });

  it("backfills from user text when image intent exists but tool payload is missing", () => {
    const out = autoBackfillSendGeneratedImagePrompt({
      isStarterPrompt: false,
      userMessage: "Please send me a widescreen photo of yourself teaching a class.",
      parsedToolPrompt: undefined,
    });
    assert.equal(
      out,
      "Please send me a widescreen photo of yourself teaching a class."
    );
  });

  it("does not backfill for starter prompts or non-image requests", () => {
    assert.equal(
      autoBackfillSendGeneratedImagePrompt({
        isStarterPrompt: true,
        userMessage: "send a photo",
        parsedToolPrompt: undefined,
      }),
      undefined
    );
    assert.equal(
      autoBackfillSendGeneratedImagePrompt({
        isStarterPrompt: false,
        userMessage: "How are you today?",
        parsedToolPrompt: undefined,
      }),
      undefined
    );
  });

  it("backfills on contextual affirmations after an assistant visual offer", () => {
    const out = autoBackfillSendGeneratedImagePrompt({
      isStarterPrompt: false,
      userMessage: "I'd love to.",
      parsedToolPrompt: undefined,
      recentMessages: [
        {
          role: "assistant",
          content: "Would you care to see some of my latest drawings?",
        },
      ],
    });
    assert.equal(out, "I'd love to.");
  });
});

describe("compactPreImageLeadMessage", () => {
  it("keeps concise one-liners as-is", () => {
    assert.equal(
      compactPreImageLeadMessage("I'd be happy to share a photo of me, one moment..."),
      "I'd be happy to share a photo of me, one moment..."
    );
  });

  it("reduces verbose text to the first sentence", () => {
    assert.equal(
      compactPreImageLeadMessage(
        "I'd be happy to share a photo of me in my lecture hall. Here is a widescreen image with more details."
      ),
      "I'd be happy to share a photo of me in my lecture hall."
    );
  });

  it("keeps descriptive first sentence instead of forcing a canned fallback", () => {
    assert.equal(
      compactPreImageLeadMessage(
        "The view from my window is quite lovely today with mountains and rooftops. I'll share it now."
      ),
      "The view from my window is quite lovely today with mountains and rooftops."
    );
  });

  it("falls back to a short default line when input is empty", () => {
    assert.equal(
      compactPreImageLeadMessage("   "),
      "Got it - I will share it in a sec."
    );
  });
});

describe("shouldBypassSuppressionForImageIntent", () => {
  it("bypasses suppression for non-starter image requests", () => {
    assert.equal(
      shouldBypassSuppressionForImageIntent(
        false,
        "Please send me a widescreen photo of yourself teaching a class."
      ),
      true
    );
    assert.equal(
      shouldBypassSuppressionForImageIntent(
        false,
        "Would you mind sending me a selfie? I'm curious what you look like."
      ),
      true
    );
  });

  it("does not bypass suppression for starter prompts or non-image turns", () => {
    assert.equal(
      shouldBypassSuppressionForImageIntent(true, "send a photo"),
      false
    );
    assert.equal(
      shouldBypassSuppressionForImageIntent(false, "Let's talk philosophy."),
      false
    );
  });

  it("bypasses suppression for contextual visual-peek phrasing with scene context", () => {
    assert.equal(
      shouldBypassSuppressionForImageIntent(
        false,
        "May I see what it looks like outside your window, Dr. Jung?",
        [
          {
            role: "assistant",
            content: "I can describe the lake outside my window if you'd like.",
          },
        ]
      ),
      true
    );
  });
});

describe("resolvePrimaryChatProviderForPossibleImageToolTurn", () => {
  it("switches to LocalOllama with forced model when intent matches and setting is set", () => {
    const base = stubOpenAiProvider();
    const out = resolvePrimaryChatProviderForPossibleImageToolTurn({
      isStarterPrompt: false,
      rawUserMessage: "draw a cat",
      baseProvider: base,
      botOverrides: { model: "gpt-4o-mini" },
      secondaryOllamaHost: null,
      prismImageToolLlmModel: "mistral:latest",
    });
    assert.ok(out.provider instanceof LocalOllamaProvider);
    assert.equal(out.botOverrides?.model, "mistral:latest");
  });

  it("keeps hub provider when message is not image-like", () => {
    const base = stubOpenAiProvider();
    const out = resolvePrimaryChatProviderForPossibleImageToolTurn({
      isStarterPrompt: false,
      rawUserMessage: "hello there",
      baseProvider: base,
      botOverrides: { model: "gpt-4o-mini" },
      secondaryOllamaHost: null,
      prismImageToolLlmModel: "mistral:latest",
    });
    assert.strictEqual(out.provider, base);
    assert.equal(out.botOverrides?.model, "gpt-4o-mini");
  });

  it("keeps hub provider when setting is empty or starter prompt", () => {
    const base = stubOpenAiProvider();
    const emptySetting = resolvePrimaryChatProviderForPossibleImageToolTurn({
      isStarterPrompt: false,
      rawUserMessage: "draw a cat",
      baseProvider: base,
      botOverrides: undefined,
      secondaryOllamaHost: null,
      prismImageToolLlmModel: null,
    });
    assert.strictEqual(emptySetting.provider, base);

    const starter = resolvePrimaryChatProviderForPossibleImageToolTurn({
      isStarterPrompt: true,
      rawUserMessage: "draw a cat",
      baseProvider: base,
      botOverrides: { model: "x" },
      secondaryOllamaHost: null,
      prismImageToolLlmModel: "mistral:latest",
    });
    assert.strictEqual(starter.provider, base);
    assert.equal(starter.botOverrides?.model, "x");
  });
});

describe("buildAssistantToolCallEvents", () => {
  it("emits no events when the assistant reply is plain prose", () => {
    const events = buildAssistantToolCallEvents({
      rawReply: "Just a thoughtful sentence with no tools.",
      imageSlot: "none",
    });
    assert.deepEqual(events, []);
  });

  it("ignores bare prose mentions of the tool names (no JSON shape)", () => {
    /// Model is allowed to TALK about the tool names without actually trying to call
    /// one — e.g. "I won't use askQuestion this turn". Those mentions must not
    /// trigger a dropped event, or the dev metrics will be spammed on plain turns.
    const prosey = [
      "I considered using askQuestion here, but I think a direct answer is better.",
      "Later, sendGeneratedImage might be a fun option for the scene we're imagining.",
      "Some models call this the AskQuestion or the sendGeneratedImage path.",
    ].join("\n\n");
    const events = buildAssistantToolCallEvents({
      rawReply: prosey,
      imageSlot: "none",
    });
    assert.deepEqual(events, []);
  });

  it("emits detected + acquired for a parsed sendGeneratedImage that scheduled a job", () => {
    const events = buildAssistantToolCallEvents({
      rawReply:
        '<<<PRISM_TOOL>>>\n{"v":1,"sendGeneratedImage":{"prompt":"A cozy portrait, soft lighting"}}\n<<<END_PRISM_TOOL>>>',
      parsedSendGeneratedImage: { prompt: "A cozy portrait, soft lighting" },
      imageSlot: "acquired",
      imageJobId: "job-abc",
    });
    assert.equal(events.length, 2);
    assert.equal(events[0]?.name, "sendGeneratedImage");
    assert.equal(events[0]?.status, "detected");
    assert.equal(events[0]?.prompt, "A cozy portrait, soft lighting");
    assert.equal(events[1]?.name, "sendGeneratedImage");
    assert.equal(events[1]?.status, "acquired");
    assert.equal(events[1]?.jobId, "job-abc");
  });

  it("emits detected + busy when the image pipeline was already taken", () => {
    const events = buildAssistantToolCallEvents({
      rawReply:
        '<<<PRISM_TOOL>>>\n{"v":1,"sendGeneratedImage":{"prompt":"A storm over hills"}}\n<<<END_PRISM_TOOL>>>',
      parsedSendGeneratedImage: { prompt: "A storm over hills" },
      imageSlot: "busy",
    });
    assert.equal(events.length, 2);
    assert.equal(events[1]?.status, "busy");
    assert.equal(events[1]?.detail, "image pipeline busy");
    assert.equal(events[1]?.jobId, undefined);
  });

  it("flags a dropped tool when raw reply has bare JSON sandwiched between prose", () => {
    /// Mirrors the screenshot: model emitted `{"v":1,"sendGeneratedImage":{"prompt":"..."}}`
    /// inline between prose paragraphs, so the parser walked away with nothing.
    const raw = [
      "Sure thing, Jared! Here's the image for your turn:",
      '{"v":1,"sendGeneratedImage":{"prompt":"A cozy portrait with soft lighting"}}',
      "How does that look to you?",
    ].join("\n");
    const events = buildAssistantToolCallEvents({
      rawReply: raw,
      imageSlot: "none",
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.name, "sendGeneratedImage");
    assert.equal(events[0]?.status, "dropped");
    assert.match(
      events[0]?.detail ?? "",
      /raw reply mentions tool but parser produced no envelope/i
    );
    assert.match(events[0]?.detail ?? "", /sendGeneratedImage/);
  });

  it("emits a detected event when an AskQuestion envelope was parsed", () => {
    const events = buildAssistantToolCallEvents({
      rawReply: "prose then chips",
      parsedAskQuestion: {
        v: 1,
        name: "AskQuestion",
        prompt: "Which option do you choose?",
        options: [
          { id: "a", label: "First" },
          { id: "b", label: "Second" },
          { id: "c", label: "Third" },
        ],
      },
      imageSlot: "none",
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.name, "askQuestion");
    assert.equal(events[0]?.status, "detected");
    assert.equal(events[0]?.prompt, "Which option do you choose?");
    assert.equal(events[0]?.detail, "3 option(s)");
  });

  it("truncates very long prompts in the diagnostic preview", () => {
    const longPrompt = "x".repeat(500);
    const events = buildAssistantToolCallEvents({
      rawReply: `<<<PRISM_TOOL>>>{"v":1,"sendGeneratedImage":{"prompt":"${longPrompt}"}}<<<END_PRISM_TOOL>>>`,
      parsedSendGeneratedImage: { prompt: longPrompt },
      imageSlot: "acquired",
      imageJobId: "job-trim",
    });
    const detected = events[0];
    assert.ok(detected, "expected a detected event");
    assert.ok(detected!.prompt!.length <= 201, "prompt should be capped to roughly 200 chars");
    assert.ok(detected!.prompt!.endsWith("…"), "long prompts should be marked with an ellipsis");
  });
});

describe("bot judgment memories", () => {
  it("stores validated inferred bot-scoped judgment memories from assistant replies", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-1", "user-1", "Lara", "#5b8cff", "triangle");
    installChatFetchStub("Your vibe is creepy, and I need clearer boundaries.");

    const result = await processChatMessage(
      db,
      "user-1",
      "Hi Lara",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: true,
        starterPrompt: false,
        starterPromptLabel: "Lara",
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      }
    );

    const created = result.memoryLearned?.created ?? [];
    assert.ok(
      created.some(
        (memory) =>
          memory.source === "inferred" &&
          memory.botId === "bot-1" &&
          memory.category === "general" &&
          /Lara felt uneasy/i.test(memory.text)
      )
    );
  });

  it("does not store unsafe judgment content", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-1", "user-1", "Lara", "#5b8cff", "triangle");
    installChatFetchStub("You are disgusting and I never want to talk to you again.");

    await processChatMessage(
      db,
      "user-1",
      "Hi Lara",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: true,
        starterPrompt: false,
        starterPromptLabel: "Lara",
        botId: "bot-1",
        incognito: false,
        mode: "chat",
      }
    );

    const inferredCount = db
      .prepare(
        "SELECT COUNT(*) as count FROM memories WHERE user_id = ? AND bot_id = ? AND source = 'inferred'"
      )
      .get("user-1", "bot-1") as { count: number };
    assert.equal(inferredCount.count, 0);
  });
});
