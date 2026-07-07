import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  autoBackfillSendGeneratedImagePrompt,
  buildAssistantToolCallEvents,
  buildAskQuestionFallback,
  compactPreImageLeadMessage,
  decideZenAutonomyTurn,
  extractPrismBotMentionIdsFromMessage,
  inferChatToolRequestedImageSize,
  buildCoffeeContinuityPromptContext,
  loadRecentCoffeeContinuityContexts,
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
import {
  createZenSessionMemoryCheckpoint,
  listZenSessionMemories,
} from "../zen-session-memory.ts";
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
      bot_group_ids TEXT,
      parent_id TEXT,
      fork_message_id TEXT,
      coffee_topic TEXT,
      coffee_meeting_summary TEXT,
      coffee_meeting_summary_updated_at TEXT,
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
      system_prompt TEXT NOT NULL DEFAULT '',
      color TEXT,
      glyph TEXT,
      chat_enabled INTEGER NOT NULL DEFAULT 1,
      delete_protected INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'private'
    );
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      prompt TEXT NOT NULL,
      revised_prompt TEXT,
      url TEXT NOT NULL,
      size TEXT,
      quality TEXT,
      provider TEXT,
      model TEXT,
      local_rel_path TEXT,
      purpose TEXT NOT NULL DEFAULT 'gallery',
      created_at TEXT NOT NULL
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
  `);
  return db;
}

async function flushBackgroundTitleJobs(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function installChatFetchStub(reply = "Memory-aware reply"): Array<Array<{ content: string }>> {
  const chatCalls: Array<Array<{ content: string }>> = [];
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
    if (Array.isArray(body.messages)) {
      chatCalls.push(body.messages);
    }
    return new Response(
      JSON.stringify({ message: { content: reply } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
  return chatCalls;
}

function seedCoffeeContinuityConversation(
  db: DatabaseSync,
  options: {
    id: string;
    userId?: string;
    botIds: string[];
    title?: string;
    topic?: string | null;
    meetingSummary?: string | null;
    sessionSynopsis?: string | null;
    incognito?: boolean;
    updatedAt: string;
  }
): void {
  const userId = options.userId ?? "user-1";
  db.prepare(
    `INSERT INTO conversations (
       id, user_id, title, conversation_mode, bot_group_ids, coffee_topic,
       coffee_meeting_summary, coffee_meeting_summary_updated_at, incognito,
       created_at, updated_at
     ) VALUES (?, ?, ?, 'coffee', ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    options.id,
    userId,
    options.title ?? "Coffee Session",
    JSON.stringify(options.botIds),
    options.topic ?? null,
    options.meetingSummary ?? null,
    options.meetingSummary ? options.updatedAt : null,
    options.incognito ? 1 : 0,
    options.updatedAt,
    options.updatedAt
  );
  if (options.sessionSynopsis) {
    db.prepare(
      `INSERT INTO messages
         (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
       VALUES (?, ?, ?, 'system', ?, 'local', NULL, NULL, ?, ?)`
    ).run(
      `${options.id}-synopsis`,
      options.id,
      userId,
      options.sessionSynopsis,
      JSON.stringify({ coffeeSynopsis: true }),
      options.updatedAt
    );
  }
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

describe("Coffee continuity context for private chats", () => {
  it("loads the last two non-incognito Coffee summaries for a participating bot", () => {
    const db = createChatTestDb();
    seedCoffeeContinuityConversation(db, {
      id: "coffee-new",
      botIds: ["bot-1", "bot-2"],
      topic: "Krabby Patty evidence",
      meetingSummary: "Rolling summary should lose to final synopsis.",
      sessionSynopsis:
        "Session synopsis: SpongeBob argued that the crab meat poll needed better evidence before anyone changed their mind.",
      updatedAt: "2026-01-04T00:00:00.000Z",
    });
    seedCoffeeContinuityConversation(db, {
      id: "coffee-mid",
      botIds: ["bot-1", "bot-3"],
      topic: "Coffee cup lighting",
      meetingSummary:
        "Squidward and SpongeBob disagreed about whether the lighting made everyone suspicious.",
      updatedAt: "2026-01-03T00:00:00.000Z",
    });
    seedCoffeeContinuityConversation(db, {
      id: "coffee-old",
      botIds: ["bot-1", "bot-4"],
      meetingSummary: "This older participating session should fall outside the two-session limit.",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    seedCoffeeContinuityConversation(db, {
      id: "coffee-incognito",
      botIds: ["bot-1", "bot-5"],
      meetingSummary: "Incognito Coffee should never be reused.",
      incognito: true,
      updatedAt: "2026-01-05T00:00:00.000Z",
    });
    seedCoffeeContinuityConversation(db, {
      id: "coffee-other-bot",
      botIds: ["bot-10", "bot-2"],
      meetingSummary: "A substring match on bot-1 must not count bot-10.",
      updatedAt: "2026-01-06T00:00:00.000Z",
    });
    seedCoffeeContinuityConversation(db, {
      id: "coffee-leaked",
      botIds: ["bot-1", "bot-2"],
      sessionSynopsis:
        "Session synopsis: The table ended and the system noted your account display name is admin.",
      updatedAt: "2026-01-07T00:00:00.000Z",
    });

    const contexts = loadRecentCoffeeContinuityContexts({
      db,
      userId: "user-1",
      botId: "bot-1",
    });

    assert.deepEqual(
      contexts.map((context) => context.conversationId),
      ["coffee-new", "coffee-mid"]
    );
    assert.match(contexts[0]?.summary ?? "", /crab meat poll needed better evidence/);
    assert.doesNotMatch(contexts[0]?.summary ?? "", /^Session synopsis:/);
    assert.match(contexts[1]?.summary ?? "", /lighting made everyone suspicious/);
  });

  it("injects recent Coffee summaries into private bot chat prompts", async () => {
    const db = createChatTestDb();
    seedCoffeeContinuityConversation(db, {
      id: "coffee-followup",
      botIds: ["bot-1", "bot-2"],
      topic: "Crab meat poll",
      sessionSynopsis:
        "Session synopsis: SpongeBob said the poll had teeth only if someone named the cost of being wrong.",
      updatedAt: "2026-01-04T00:00:00.000Z",
    });
    const chatCalls = installChatFetchStub("I meant the risk had to be named.");

    await processChatMessage(
      db,
      "user-1",
      "What did you mean when you said the poll had teeth?",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
        botSystemPrompt: "You are SpongeBob.",
      }
    );

    assert.equal(
      chatCalls.some((messages) =>
        messages.some(
          (message) =>
            message.content.includes("Recent Coffee session context for this bot") &&
            message.content.includes("the poll had teeth only if someone named the cost")
        )
      ),
      true
    );
  });

  it("formats Coffee continuity as summary-level context, not transcript recall", () => {
    const prompt = buildCoffeeContinuityPromptContext([
      {
        conversationId: "coffee-1",
        title: "Coffee Session",
        topic: "Crab meat poll",
        summary: "SpongeBob treated the poll as evidence, not proof.",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    assert.match(prompt ?? "", /summary-level notes/);
    assert.match(prompt ?? "", /Do not invent exact quotes/);
    assert.match(prompt ?? "", /Crab meat poll/);
  });
});

describe("bot-locked Chat lane", () => {
  it("rejects Chat sends without a bot", async () => {
    const db = createChatTestDb();
    installChatFetchStub();

    await assert.rejects(
      processChatMessage(
        db,
        "user-1",
        "Hello?",
        CHAT_TEST_USER_KEY,
        {
          preferredProvider: "local",
          autoMemory: false,
          botId: null,
          incognito: false,
          mode: "chat",
        }
      ),
      /Choose a bot before chatting/
    );
  });

  it("persists Chat as a bot-locked conversation", async () => {
    const db = createChatTestDb();
    installChatFetchStub("Bot reply.");

    const result = await processChatMessage(
      db,
      "user-1",
      "Hello bot.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: true,
        botId: "bot-1",
        incognito: false,
        mode: "chat",
        botSystemPrompt: "You are the selected bot.",
      }
    );

    assert.equal(result.conversation.mode, "chat");
    assert.equal(result.conversation.botId, "bot-1");

    const row = db
      .prepare("SELECT conversation_mode, bot_id FROM conversations WHERE id = ?")
      .get(result.conversation.id) as { conversation_mode: string; bot_id: string | null };
    assert.equal(row.conversation_mode, "chat");
    assert.equal(row.bot_id, "bot-1");
  });
});

describe("processChatMessage Psychic planning", () => {
  it("attaches a concise Psychic summary to the triggering user message", async () => {
    const db = createChatTestDb();
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ role: string; content: string }>;
      };
      requests.push({ url, body: body as Record<string, unknown> });
      const isPlanningPass = body.messages?.some((message) =>
        message.content.includes("Prism's private planning pass")
      );
      return new Response(
        JSON.stringify({
          message: {
            content: isPlanningPass
              ? JSON.stringify({
                  summary: "I weighed the request and chose a practical sequence.",
                  scratchpad: "developer-only hidden sketch",
                  answerGuidance: "Answer in two short steps.",
                })
              : "Final answer.",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Help me plan this.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "sandbox",
        experimentalAllModelEffortEnabled: true,
        psychicModeEnabled: true,
        botOverrides: { model: "llama3.2", reasoningEffort: "minimal" },
      }
    );

    const userMessage = result.conversation.messages.find(
      (message) => message.role === "user"
    );
    assert.equal(
      userMessage?.psychicThought?.summary,
      "I weighed the request and chose a practical sequence."
    );
    assert.equal(userMessage?.psychicThought?.effort, "minimal");
    assert.match(result.psychicDebug?.scratchpad ?? "", /developer-only hidden sketch/);
    assert.equal(result.psychicDebug?.simulated, true);
    assert.equal(result.psychicDebug?.passCount, 1);
    assert.deepEqual(
      result.psychicDebug?.passes?.map((pass) => pass.name),
      ["plan"]
    );
    const planningRequest = requests.find(({ body }) => {
      const messages = body.messages as Array<{ content: string }> | undefined;
      return messages?.some((message) =>
        message.content.includes("Prism's private planning pass")
      );
    });
    assert.match(
      JSON.stringify(planningRequest?.body ?? {}),
      /first-person perspective/
    );
    assert.match(
      JSON.stringify(planningRequest?.body ?? {}),
      /I've decided it makes the most sense/
    );
    assert.doesNotMatch(JSON.stringify(userMessage), /developer-only hidden sketch/);

    const storedUserPayload = db
      .prepare("SELECT tool_payload FROM messages WHERE role = 'user'")
      .get() as { tool_payload: string | null } | undefined;
    assert.match(storedUserPayload?.tool_payload ?? "", /practical sequence/);
    assert.doesNotMatch(storedUserPayload?.tool_payload ?? "", /developer-only hidden sketch/);

    const finalRequest = requests.find(({ body }) => {
      const messages = body.messages as Array<{ content: string }> | undefined;
      return messages?.some((message) => message.content.includes("Answer guidance:"));
    });
    assert.ok(finalRequest);
    assert.doesNotMatch(JSON.stringify(finalRequest?.body), /developer-only hidden sketch/);
    assert.ok(
      requests.every(
        (request) =>
          !request.url.includes("api.openai.com") &&
          !request.url.includes("api.anthropic.com")
      )
    );
    await flushBackgroundTitleJobs();
  });

  it("scales simulated effort provider passes by effort", async () => {
    const cases: Array<{
      effort: ReasoningEffort;
      passes: Array<"plan" | "draft" | "audit" | "revision">;
    }> = [
      { effort: "none", passes: [] },
      { effort: "minimal", passes: ["plan"] },
      { effort: "low", passes: ["plan"] },
      { effort: "medium", passes: ["plan", "audit"] },
      { effort: "high", passes: ["plan", "draft", "audit"] },
      { effort: "xhigh", passes: ["plan", "draft", "audit", "revision"] },
    ];

    for (const testCase of cases) {
      const db = createChatTestDb();
      const requests: Array<{ url: string; messages?: Array<{ content: string }> }> = [];
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          messages?: Array<{ content: string }>;
        };
        requests.push({
          url: input instanceof Request ? input.url : String(input),
          ...body,
        });
        const content = body.messages?.map((message) => message.content).join("\n") ?? "";
        if (content.includes("Prism's private planning pass")) {
          return new Response(
            JSON.stringify({
              message: {
                content: JSON.stringify({
                  summary: "I mapped the constraints.",
                  scratchpad: "private plan secret",
                  answerGuidance: "Use the mapped constraints.",
                }),
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (content.includes("Prism's private draft pass")) {
          return new Response(
            JSON.stringify({ message: { content: "private draft secret" } }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (content.includes("Prism's private audit pass")) {
          return new Response(
            JSON.stringify({ message: { content: "private audit guidance" } }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (content.includes("Prism's private revision-guidance pass")) {
          return new Response(
            JSON.stringify({ message: { content: "private revision guidance" } }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ message: { content: "Final answer." } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch;

      const result = await processChatMessage(
        db,
        `user-${testCase.effort}`,
        "Help me plan this.",
        CHAT_TEST_USER_KEY,
        {
          preferredProvider: "local",
          autoMemory: false,
          incognito: true,
          mode: "sandbox",
          experimentalAllModelEffortEnabled: true,
          botOverrides: { model: "llama3.2", reasoningEffort: testCase.effort },
        }
      );

      const privatePassRequests = requests.filter((request) =>
        request.messages?.some((message) => message.content.includes("Prism's private"))
      );
      const turnGenerationRequests = requests.filter(
        (request) =>
          !request.messages?.some((message) =>
            message.content.includes("You title chats for a conversation sidebar")
          )
      );
      assert.equal(turnGenerationRequests.length, testCase.passes.length + 1);
      assert.equal(privatePassRequests.length, testCase.passes.length);
      if (testCase.passes.length === 0) {
        assert.equal(result.psychicDebug, undefined);
      } else {
        assert.deepEqual(
          result.psychicDebug?.passes?.map((pass) => pass.name),
          testCase.passes
        );
        assert.equal(result.psychicDebug?.passCount, testCase.passes.length);
      }
      assert.ok(
        requests.every(
          (request) =>
            !request.url.includes("api.openai.com") &&
            !request.url.includes("api.anthropic.com")
        )
      );
      await flushBackgroundTitleJobs();
    }
  });

  it("continues with prior guidance when a later simulated pass fails", async () => {
    const db = createChatTestDb();
    const requests: Array<{ messages?: Array<{ content: string }> }> = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ content: string }>;
      };
      requests.push(body);
      const content = body.messages?.map((message) => message.content).join("\n") ?? "";
      if (content.includes("Prism's private planning pass")) {
        return new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                summary: "I mapped the constraints.",
                scratchpad: "private plan secret",
                answerGuidance: "Use the mapped constraints.",
              }),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (content.includes("Prism's private draft pass")) {
        return new Response(
          JSON.stringify({ message: { content: "private draft secret" } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (content.includes("Prism's private audit pass")) {
        return new Response(JSON.stringify({ message: { content: "" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ message: { content: "Final answer." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Help me plan this.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "sandbox",
        experimentalAllModelEffortEnabled: true,
        botOverrides: { model: "llama3.2", reasoningEffort: "high" },
      }
    );

    assert.equal(
      result.conversation.messages.find((message) => message.role === "assistant")?.content,
      "Final answer."
    );
    assert.match(result.psychicDebug?.scratchpad ?? "", /private draft secret/);
    assert.ok(
      result.psychicDebug?.passes?.some(
        (pass) =>
          pass.name === "audit" &&
          (pass.warning?.includes("audit_empty") ||
            pass.warning?.includes("audit_failed"))
      )
    );
    assert.ok(
      result.backendEvents?.some(
        (event) =>
          event.message === "Psychic planning unavailable" &&
          (event.detail?.includes("audit_empty") ||
            event.detail?.includes("audit_failed"))
      )
    );
    const finalRequest = requests.find((request) =>
      request.messages?.some((message) =>
        message.content.includes("Private guidance from Prism's simulated planning pass")
      )
    );
    assert.ok(finalRequest);
    assert.doesNotMatch(JSON.stringify(finalRequest), /private draft secret/);
    assert.doesNotMatch(JSON.stringify(finalRequest), /private plan secret/);
    assert.match(JSON.stringify(finalRequest), /Use the mapped constraints/);
    await flushBackgroundTitleJobs();
  });

  it("falls back to a normal answer when the planning pass is invalid", async () => {
    const db = createChatTestDb();
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ content: string }>;
      };
      const isPlanningPass = body.messages?.some((message) =>
        message.content.includes("Prism's private planning pass")
      );
      return new Response(
        JSON.stringify({ message: { content: isPlanningPass ? "not json" : "Normal answer." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Help me anyway.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "sandbox",
        experimentalAllModelEffortEnabled: true,
        botOverrides: { model: "llama3.2", reasoningEffort: "medium" },
      }
    );

    assert.equal(
      result.conversation.messages.find((message) => message.role === "assistant")?.content,
      "Normal answer."
    );
    assert.equal(result.psychicDebug, undefined);
    assert.ok(
      result.backendEvents?.some(
        (event) =>
          event.message === "Psychic planning unavailable" &&
          event.detail?.includes("invalid_json")
      )
    );
    await flushBackgroundTitleJobs();
  });

  it("does not simulate effort for online non-reasoning OpenAI models", async () => {
    const db = createChatTestDb();
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      requests.push({ url, body });
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      assert.doesNotMatch(JSON.stringify(body), /Prism's private/);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Online answer." }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Help me online.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "openai",
        openAiApiKey: "sk-test",
        autoMemory: false,
        incognito: true,
        mode: "zen",
        experimentalAllModelEffortEnabled: true,
        botOverrides: { model: "gpt-4o", reasoningEffort: "high" },
      }
    );

    assert.equal(requests.length, 1);
    assert.equal(
      result.conversation.messages.find((message) => message.role === "assistant")?.content,
      "Online answer."
    );
    assert.equal(result.psychicDebug, undefined);
    assert.ok(
      result.backendEvents?.some(
        (event) =>
          event.message === "Simulated effort skipped" &&
          event.detail?.includes("online_simulated_effort_disabled") &&
          event.detail?.includes("provider=openai")
      )
    );
  });

  it("preserves native OpenAI reasoning without simulated private passes", async () => {
    const db = createChatTestDb();
    const requests: Array<{ body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      requests.push({ body });
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      assert.doesNotMatch(JSON.stringify(body), /Prism's private/);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Native reasoning answer." }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Use native reasoning.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "openai",
        openAiApiKey: "sk-test",
        autoMemory: false,
        incognito: true,
        mode: "zen",
        experimentalAllModelEffortEnabled: true,
        botOverrides: { model: "gpt-5.5", reasoningEffort: "high" },
      }
    );

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.body.reasoning_effort, "high");
    assert.equal(result.psychicDebug, undefined);
    assert.ok(
      result.backendEvents?.some(
        (event) =>
          event.message === "Simulated effort skipped" &&
          event.detail?.includes("native_reasoning_preserved") &&
          event.detail?.includes("provider=openai")
      )
    );
  });

  it("keeps online Psychic mode summary-only without extra online effort calls", async () => {
    const db = createChatTestDb();
    const requests: Array<{ body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      requests.push({ body });
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      assert.doesNotMatch(JSON.stringify(body), /Prism's private/);
      assert.doesNotMatch(JSON.stringify(body), /Private guidance from Prism/);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Online psychic answer." }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Help with Psychic on.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "openai",
        openAiApiKey: "sk-test",
        autoMemory: false,
        incognito: true,
        mode: "zen",
        experimentalAllModelEffortEnabled: true,
        psychicModeEnabled: true,
        botOverrides: { model: "gpt-4o", reasoningEffort: "high" },
      }
    );

    assert.equal(requests.length, 1);
    assert.equal(result.psychicDebug?.simulated, false);
    assert.equal(result.psychicDebug?.passCount, 0);
    assert.deepEqual(result.psychicDebug?.passes, []);
    assert.equal(result.psychicDebug?.scratchpad, "");
    const userMessage = result.conversation.messages.find(
      (message) => message.role === "user"
    );
    assert.match(
      userMessage?.psychicThought?.summary ?? "",
      /^I'm helping with this turn using the selected online model/
    );
  });

  it("does not run simulated effort passes for Anthropic models", async () => {
    const db = createChatTestDb();
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      requests.push({ url, body });
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      assert.doesNotMatch(JSON.stringify(body), /Prism's private/);
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "Anthropic answer." }],
          stop_reason: "end_turn",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Help with Opus.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "anthropic",
        anthropicApiKey: "sk-ant-test",
        autoMemory: false,
        incognito: true,
        mode: "zen",
        experimentalAllModelEffortEnabled: true,
        psychicModeEnabled: true,
        botOverrides: { model: "claude-opus-4-8", reasoningEffort: "xhigh" },
      }
    );

    assert.equal(requests.length, 1);
    assert.equal(
      result.conversation.messages.find((message) => message.role === "assistant")?.content,
      "Anthropic answer."
    );
    assert.equal(result.psychicDebug?.simulated, false);
    assert.equal(result.psychicDebug?.passCount, 0);
    assert.ok(
      result.backendEvents?.some(
        (event) =>
          event.message === "Simulated effort skipped" &&
          event.detail?.includes("online_simulated_effort_disabled") &&
          event.detail?.includes("provider=anthropic")
      )
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
        mode: "sandbox",
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
    const starterUserMessage = starterBody?.messages?.find(
      (message) => message.role === "user"
    );
    assert.ok(starterUserMessage);
    assert.match(
      starterUserMessage.content,
      /Functionally simple/
    );
    assert.match(starterUserMessage.content, /AskQuestion/);
    assert.match(starterUserMessage.content, /sendGeneratedImage/);

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
        mode: "zen",
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
        "Just sit with me for a minute",
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
        "Just sit with me for a minute",
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
        mode: "zen",
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
        "I'm not sure yet.",
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
      }
    );

    const starterBody = bodies[0];
    const starterIdentityBlock = starterBody?.messages?.[0]?.content ?? "";
    const starterUserInstruction = starterBody?.messages?.filter((m) => m.role === "user").pop();
    assert.doesNotMatch(starterIdentityBlock, /reflective evening check-ins/i);
    assert.match(starterUserInstruction?.content ?? "", /Ask exactly ONE direct question/i);
    const memoryBlock = starterBody?.messages?.find((msg) =>
      msg.content.startsWith(
        "User memory hints about the human user (conversation context only; do not rewrite persona identity):\n"
      )
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
      }
    );

    assert.equal(
      result.conversation.messages[0]?.content,
      "Given that you prefer reflective evening check-ins, what feels most important to explore right now?"
    );
  });

  it("keeps private chats ephemeral while honoring the selected provider", async () => {
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
        mode: "zen",
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

  it("blocks automatic WebSearch tool calls in LOCAL mode", async () => {
    const db = createChatTestDb();
    const seenUrls: string[] = [];
    const webSearchTool = {
      v: 1,
      webSearch: { query: "latest Prism release news" },
    };
    globalThis.fetch = (async (input: string | URL | Request) => {
      seenUrls.push(String(input));
      return new Response(
        JSON.stringify({
          message: {
            content:
              `I should check fresh sources.\n<<<PRISM_TOOL>>>\n${JSON.stringify(webSearchTool)}\n<<<END_PRISM_TOOL>>>`,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "What is the latest?",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "sandbox",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.webSearch, undefined);
    assert.ok(seenUrls.every((url) => !url.includes("api.search.brave.com")));
    const webSearchStatuses =
      result.toolCalls
        ?.filter((event) => event.name === "webSearch")
        .map((event) => event.status) ?? [];
    assert.ok(webSearchStatuses.includes("detected"));
    assert.ok(webSearchStatuses.includes("blocked"));
    assert.equal(webSearchStatuses.includes("completed"), false);
  });

  it("persists binary yes/no AskQuestion choices", async () => {
    const db = createChatTestDb();
    const askPayload = {
      v: 1 as const,
      name: "AskQuestion" as const,
      prompt: "Would you like a copy of that to download?",
      options: [
        { id: "a", label: "Yes" },
        { id: "b", label: "No" },
      ],
    };
    const prismTail =
      `\n<<<PRISM_TOOL>>>\n${JSON.stringify(askPayload)}\n<<<END_PRISM_TOOL>>>`;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          message: { content: `I can package that for you.${prismTail}` },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Can you make this downloadable?",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.content, "I can package that for you.");
    assert.deepEqual(lastAssistant?.askQuestion, askPayload);
  });

  it("uses manual AskQuestion choices as answer constraints and persists a completed result card", async () => {
    const db = createChatTestDb();
    const promptTexts: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ role: string; content: string }>;
      };
      if (url.includes("/api/chat")) {
        promptTexts.push((body.messages ?? [])
          .map((message) => `${message.role}: ${message.content}`)
          .join("\n"));
        if (promptTexts.length > 1) {
          return new Response(JSON.stringify({ message: { content: '{"title":"Lemon Pick"}' } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            message: {
              content: "lemons\n\nI'd pick lemons: sharp, bright, and at least memorable.",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Would you rather eat:",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
        manualTool: {
          name: "askQuestion",
          question: "Would you rather eat:",
          options: ["Potatoes", "lemons", "lemons", "chicken", "broccoli", "carrots"],
        },
      }
    );

    const promptText = promptTexts[0] ?? "";
    assert.match(promptText, /using Prism's AskQuestion tool/i);
    assert.match(promptText, /must choose exactly one/i);
    assert.match(promptText, /choose the closest available answer/i);
    assert.match(promptText, /1\. Potatoes/);
    assert.match(promptText, /2\. lemons/);
    assert.match(promptText, /3\. chicken/);
    assert.match(promptText, /4\. broccoli/);
    assert.doesNotMatch(promptText, /carrots/);
    const userMessage = result.conversation.messages.find((m) => m.role === "user");
    assert.deepEqual(userMessage?.manualAskQuestion, {
      v: 1,
      name: "AskQuestion",
      question: "Would you rather eat:",
      options: [
        { id: "a", label: "Potatoes" },
        { id: "b", label: "lemons" },
        { id: "c", label: "chicken" },
        { id: "d", label: "broccoli" },
      ],
      selectedOptionId: "b",
      selectedOptionIndex: 1,
      selectedOptionLabel: "lemons",
    });
    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(
      lastAssistant?.content,
      "lemons\n\nI'd pick lemons: sharp, bright, and at least memorable."
    );
    assert.equal(lastAssistant?.askQuestion, undefined);
  });

  it("uses open-ended manual AskQuestion as a direct-answer hint", async () => {
    const db = createChatTestDb();
    const promptTexts: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ role: string; content: string }>;
      };
      if (url.includes("/api/chat")) {
        promptTexts.push((body.messages ?? [])
          .map((message) => `${message.role}: ${message.content}`)
          .join("\n"));
        if (promptTexts.length > 1) {
          return new Response(JSON.stringify({ message: { content: '{"title":"Warmer Wording"}' } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            message: { content: "It reads warmer when the first option is shorter." },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Which wording feels warmer?",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
        manualTool: {
          name: "askQuestion",
          question: "Which wording feels warmer?",
        },
      }
    );

    const promptText = promptTexts[0] ?? "";
    assert.match(promptText, /ask you directly/i);
    assert.match(promptText, /Answer the question directly/i);
    assert.doesNotMatch(promptText, /must choose exactly one/i);
    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.content, "It reads warmer when the first option is shorter.");
    assert.equal(lastAssistant?.askQuestion, undefined);
  });

  it("drops story action rails from story setup questions", async () => {
    const db = createChatTestDb();
    const storyPayload = {
      v: 1 as const,
      name: "tellFictionalStory" as const,
    };
    const prismTail =
      `\n<<<PRISM_TOOL>>>\n${JSON.stringify({ v: 1, tellFictionalStory: storyPayload })}\n<<<END_PRISM_TOOL>>>`;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          message: {
            content: `What vibe are you feeling for our story?${prismTail}`,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "create a story",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.content, "What vibe are you feeling for our story?");
    assert.equal(lastAssistant?.tellFictionalStory, undefined);

    const row = db.prepare(
      "SELECT tool_payload FROM messages WHERE role = ? ORDER BY created_at DESC LIMIT 1"
    ).get("assistant") as { tool_payload: string | null };
    const storedToolPayload = JSON.parse(row.tool_payload ?? "{}") as {
      tellFictionalStory?: unknown;
      mood?: unknown;
    };
    assert.equal(storedToolPayload.tellFictionalStory, undefined);
    assert.ok(storedToolPayload.mood);
  });

  it("keeps story action rails after substantial story prose", async () => {
    const db = createChatTestDb();
    const storyPayload = {
      v: 1 as const,
      name: "tellFictionalStory" as const,
      continueLabel: "Follow the lantern",
      bookmarkLabel: "Mark the crossing",
      finishLabel: "Close the tale",
    };
    const storyProse = [
      "The lantern woke before the town did, breathing a small gold circle onto the fogged window.",
      "Mira followed it through alleys that should have ended in brick, but each wall opened like a curtain when the light touched it.",
      "By dawn she found a bridge made of rain, and beneath it the river was whispering her name in the voice of someone she had not met yet.",
    ].join(" ");
    const prismTail =
      `\n<<<PRISM_TOOL>>>\n${JSON.stringify({ v: 1, tellFictionalStory: storyPayload })}\n<<<END_PRISM_TOOL>>>`;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          message: {
            content: `${storyProse}${prismTail}`,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Tell me a tiny story.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.content, storyProse);
    assert.deepEqual(lastAssistant?.tellFictionalStory, storyPayload);

    const row = db.prepare(
      "SELECT tool_payload FROM messages WHERE role = ? ORDER BY created_at DESC LIMIT 1"
    ).get("assistant") as { tool_payload: string | null };
    const storedToolPayload = JSON.parse(row.tool_payload ?? "{}") as {
      tellFictionalStory?: typeof storyPayload;
    };
    assert.deepEqual(storedToolPayload.tellFictionalStory, storyPayload);
  });

  it("treats selected AskQuestion options as prose instead of forcing continuation", async () => {
    const db = createChatTestDb();
    const userId = "user-1";
    const conversationId = "conv-askquestion-prose-answer";
    const askPayload = {
      v: 1 as const,
      name: "AskQuestion" as const,
      prompt: "Which path?",
      options: [
        { id: "a", label: "Left" },
        { id: "b", label: "Pause" },
        { id: "c", label: "Right" },
      ],
    };
    db.prepare(
      `INSERT INTO conversations (
        id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at
      ) VALUES (?, ?, ?, 'chat', NULL, 0, ?, ?)`
    ).run(
      conversationId,
      userId,
      "AskQuestion Answer",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:02.000Z"
    );
    const insertMessage = db.prepare(
      `INSERT INTO messages (
        id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertMessage.run(
      "prior-user",
      conversationId,
      userId,
      "user",
      "Give me a fork.",
      null,
      null,
      null,
      null,
      "2026-01-01T00:00:01.000Z"
    );
    insertMessage.run(
      "prior-assistant",
      conversationId,
      userId,
      "assistant",
      "Pick a path.",
      "local",
      "test-model",
      null,
      JSON.stringify({ v: 1, askQuestion: askPayload }),
      "2026-01-01T00:00:02.000Z"
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
          JSON.stringify({ message: { content: "Plain prose after the choice." } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      userId,
      "Left",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
      },
      conversationId
    );

    assert.equal(chatPayloads.length, 1);
    const promptText = (chatPayloads[0]?.messages ?? [])
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    assert.match(promptText, /Left/);
    assert.doesNotMatch(promptText, /Continue the active AskQuestion flow/i);
    assert.doesNotMatch(promptText, /follow-up multiple-choice/i);
    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.content, "Plain prose after the choice.");
    assert.equal(lastAssistant?.askQuestion, undefined);
  });

  it("nudges the model to resume an interrupted Zen reply after an excuse", async () => {
    const db = createChatTestDb();
    const userId = "user-1";
    const conversationId = "conv-interrupted-resume";
    db.prepare(
      `INSERT INTO conversations (
        id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at
      ) VALUES (?, ?, ?, 'chat', NULL, 0, ?, ?)`
    ).run(
      conversationId,
      userId,
      "Interrupted Reply",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:02.000Z"
    );
    const insertMessage = db.prepare(
      `INSERT INTO messages (
        id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertMessage.run(
      "prior-user",
      conversationId,
      userId,
      "user",
      "Tell me why this architecture works.",
      null,
      null,
      null,
      null,
      "2026-01-01T00:00:01.000Z"
    );
    insertMessage.run(
      "prior-assistant",
      conversationId,
      userId,
      "assistant",
      "The reason this works is that each boundary keeps state local while the outer loop coord—",
      "local",
      "test-model",
      null,
      null,
      "2026-01-01T00:00:02.000Z"
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
          JSON.stringify({ message: { content: "No worries. As I was saying, the outer loop coordinates without owning every detail." } }),
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
      "sorry, had to take a call",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
      },
      conversationId
    );

    assert.equal(chatPayloads.length, 1);
    const promptText = (chatPayloads[0]?.messages ?? [])
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    assert.match(promptText, /previous assistant reply was intentionally interrupted/i);
    assert.match(promptText, /Visible interrupted fragment: "The reason this works/i);
    assert.match(promptText, /continue the unfinished thought only if that still fits/i);
    assert.match(promptText, /bridge phrase is optional/i);
    assert.doesNotMatch(promptText, /As I was saying/i);
  });

  it("keeps interruption context but prioritizes topic switches", async () => {
    const db = createChatTestDb();
    const userId = "user-1";
    const conversationId = "conv-interrupted-topic-switch";
    db.prepare(
      `INSERT INTO conversations (
        id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at
      ) VALUES (?, ?, ?, 'chat', NULL, 0, ?, ?)`
    ).run(
      conversationId,
      userId,
      "Interrupted Reply",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:02.000Z"
    );
    const insertMessage = db.prepare(
      `INSERT INTO messages (
        id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertMessage.run(
      "prior-user",
      conversationId,
      userId,
      "user",
      "Tell me why this architecture works.",
      null,
      null,
      null,
      null,
      "2026-01-01T00:00:01.000Z"
    );
    insertMessage.run(
      "prior-assistant",
      conversationId,
      userId,
      "assistant",
      "The reason this works is that each boundary keeps state local while the outer loop coord—",
      "local",
      "test-model",
      null,
      null,
      "2026-01-01T00:00:02.000Z"
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
          JSON.stringify({ message: { content: "Sure, let's switch topics." } }),
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
      "actually, can we switch topics and talk about CSS?",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
      },
      conversationId
    );

    assert.equal(chatPayloads.length, 1);
    const promptText = (chatPayloads[0]?.messages ?? [])
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    assert.match(promptText, /previous assistant reply was intentionally interrupted/i);
    assert.match(promptText, /Visible interrupted fragment: "The reason this works/i);
    assert.match(promptText, /switch topics or replace the interrupted request/i);
    assert.match(promptText, /Prioritize the new request/i);
    assert.doesNotMatch(promptText, /As I was saying/i);
  });

  it("uses the explicit frozen interrupted fragment when supplied", async () => {
    const db = createChatTestDb();
    const userId = "user-1";
    const conversationId = "conv-interrupted-explicit-fragment";
    db.prepare(
      `INSERT INTO conversations (
        id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at
      ) VALUES (?, ?, ?, 'chat', NULL, 0, ?, ?)`
    ).run(
      conversationId,
      userId,
      "Interrupted Reply",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:02.000Z"
    );
    const insertMessage = db.prepare(
      `INSERT INTO messages (
        id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertMessage.run(
      "prior-user",
      conversationId,
      userId,
      "user",
      "What were you about to say?",
      null,
      null,
      null,
      null,
      "2026-01-01T00:00:01.000Z"
    );
    insertMessage.run(
      "prior-assistant",
      conversationId,
      userId,
      "assistant",
      "I was s—",
      "local",
      "test-model",
      null,
      null,
      "2026-01-01T00:00:02.000Z"
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
          JSON.stringify({ message: { content: "Right, continuing from there." } }),
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
      "sorry, continue",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
        prismInterruption: {
          kind: "assistant_reveal",
          assistantMessageId: "prior-assistant",
          visibleTokenCount: 4,
          totalTokenCount: 20,
          interruptedContent: "I was sayi—",
        },
      },
      conversationId
    );

    assert.equal(chatPayloads.length, 1);
    const promptText = (chatPayloads[0]?.messages ?? [])
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    const fragmentMatch = promptText.match(/Visible interrupted fragment: "([^"]+)"/);
    assert.equal(fragmentMatch?.[1], "I was sayi");
  });

  it("tells the model not to repeat interrupted text the user completed", async () => {
    const db = createChatTestDb();
    const userId = "user-1";
    const conversationId = "conv-interrupted-user-completed";
    db.prepare(
      `INSERT INTO conversations (
        id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at
      ) VALUES (?, ?, ?, 'chat', NULL, 0, ?, ?)`
    ).run(
      conversationId,
      userId,
      "Interrupted Joke",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:02.000Z"
    );
    const insertMessage = db.prepare(
      `INSERT INTO messages (
        id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertMessage.run(
      "prior-user",
      conversationId,
      userId,
      "user",
      "Tell me a cliche joke.",
      null,
      null,
      null,
      null,
      "2026-01-01T00:00:01.000Z"
    );
    insertMessage.run(
      "prior-assistant",
      conversationId,
      userId,
      "assistant",
      "Why did the chicken cross the ro—",
      "local",
      "test-model",
      null,
      null,
      "2026-01-01T00:00:02.000Z"
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
          JSON.stringify({ message: { content: "Exactly. You spared us both the suspense." } }),
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
      "To get to the other side.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
      },
      conversationId
    );

    assert.equal(chatPayloads.length, 1);
    const promptText = (chatPayloads[0]?.messages ?? [])
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    assert.match(promptText, /previous assistant reply was intentionally interrupted/i);
    assert.match(promptText, /Visible interrupted fragment: "Why did the chicken/i);
    assert.match(promptText, /appears to complete, predict, or answer the unfinished thought/i);
    assert.match(promptText, /do not continue repeating the interrupted text/i);
    assert.doesNotMatch(promptText, /As I was saying/i);
  });

  it("persists Zen interruption mood and lets warm repair turns recover it", async () => {
    const db = createChatTestDb();
    installChatFetchStub("I can shift with you.");

    const interrupted = await processChatMessage(
      db,
      "user-1",
      "Wait, pause that thought. I need a different angle.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
        prismInterruption: {
          kind: "assistant_reveal",
          assistantMessageId: "assistant-visible-fragment",
          visibleTokenCount: 38,
          totalTokenCount: 72,
          interruptionCount: 2,
        },
      }
    );

    assert.ok(interrupted.prismMood);
    assert.equal(interrupted.prismMood?.mode, "zen");
    assert.ok((interrupted.prismMood?.annoyance ?? 0) > 0.12);
    assert.equal(interrupted.prismMood?.recentDeltas[0]?.kind, "interruption");
    const row = db
      .prepare(
        "SELECT mood_key, annoyance, recent_deltas FROM prism_mood_state WHERE user_id = ? AND conversation_id = ? AND mode = ?"
      )
      .get("user-1", interrupted.conversation.id, "zen") as
      | { mood_key: string; annoyance: number; recent_deltas: string }
      | undefined;
    assert.ok(row);
    assert.ok(row.annoyance > 0.12);

    const repaired = await processChatMessage(
      db,
      "user-1",
      "Sorry, that was abrupt. Thank you for staying with me.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
      },
      interrupted.conversation.id
    );

    assert.ok(repaired.prismMood);
    assert.ok(
      (repaired.prismMood?.annoyance ?? 1) <
        (interrupted.prismMood?.annoyance ?? 0)
    );
    assert.ok(
      (repaired.prismMood?.warmth ?? 0) >=
        (interrupted.prismMood?.warmth ?? 1)
    );
    assert.equal(repaired.prismMood?.recentDeltas[0]?.kind, "positive_turn");
  });

  it("uses a one-line Zen mood pause once interruption pressure is high", async () => {
    const db = createChatTestDb();
    const conversationId = "pause-conversation";
    const now = "2026-06-19T12:00:00.000Z";
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(conversationId, "user-1", "Pause test", "zen", now, now);
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      "assistant-1",
      conversationId,
      "user-1",
      "assistant",
      "Previous assistant message.",
      "2026-06-19T12:00:01.000Z"
    );
    const interruptionDelta = {
      kind: "interruption",
      at: now,
      reason: "Interrupted.",
      annoyanceDelta: 0.1,
      warmthDelta: -0.04,
      engagementDelta: -0.02,
      restraintDelta: -0.01,
      moodKeyBefore: "neutral",
      moodKeyAfter: "guarded",
    };
    db.prepare(
      `INSERT INTO prism_mood_state (
        user_id, conversation_id, mode, mood_key, confidence, annoyance,
        warmth, engagement, restraint, recent_deltas, frozen, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "user-1",
      conversationId,
      "zen",
      "guarded",
      0.7,
      0.62,
      0.48,
      0.5,
      0.5,
      JSON.stringify(Array.from({ length: 5 }, () => interruptionDelta)),
      0,
      now
    );

    const chatPayloads: Array<{ messages?: Array<{ role: string; content: string }> }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("/api/chat")) {
        chatPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      }
      return new Response(
        JSON.stringify({ message: { content: "This should not be used." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Are you still going to answer?",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
      },
      conversationId
    );

    const assistant = result.conversation.messages.at(-1);
    assert.equal(chatPayloads.length, 0, JSON.stringify(chatPayloads, null, 2));
    assert.equal(assistant?.role, "assistant");
    assert.equal(assistant?.content, "I’m going to pause here for a moment.");
    assert.equal(result.prismMood?.moodKey, "guarded");
  });

  it("can ignore multiple Zen messages during a severe mood cooldown", async () => {
    const db = createChatTestDb();
    const conversationId = "ignore-conversation";
    const now = "2026-06-19T12:00:00.000Z";
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(conversationId, "user-1", "Ignore test", "zen", now, now);
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      "assistant-1",
      conversationId,
      "user-1",
      "assistant",
      "Previous assistant message.",
      "2026-06-19T12:00:01.000Z"
    );
    const interruptionDelta = {
      kind: "interruption",
      at: now,
      reason: "Interrupted.",
      annoyanceDelta: 0.1,
      warmthDelta: -0.04,
      engagementDelta: -0.02,
      restraintDelta: -0.01,
      moodKeyBefore: "neutral",
      moodKeyAfter: "guarded",
    };
    db.prepare(
      `INSERT INTO prism_mood_state (
        user_id, conversation_id, mode, mood_key, confidence, annoyance,
        warmth, engagement, restraint, recent_deltas, ignore_until, frozen, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "user-1",
      conversationId,
      "zen",
      "guarded",
      0.8,
      0.74,
      0.42,
      0.47,
      0.5,
      JSON.stringify(Array.from({ length: 6 }, () => interruptionDelta)),
      null,
      0,
      now
    );

    const chatPayloads: Array<{ messages?: Array<{ role: string; content: string }> }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("/api/chat")) {
        chatPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      }
      return new Response(
        JSON.stringify({ message: { content: "Back online." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const ignoredStart = await processChatMessage(
      db,
      "user-1",
      "Answer now.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
      },
      conversationId
    );

    assert.equal(chatPayloads.length, 0, JSON.stringify(chatPayloads, null, 2));
    assert.equal(ignoredStart.conversation.messages.at(-1)?.role, "user");
    assert.equal(ignoredStart.prismMood?.recentDeltas[0]?.kind, "ignore_started");
    assert.ok(ignoredStart.prismMood?.ignoreUntil);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND role = 'assistant'").get(conversationId) as { n: number }).n,
      1
    );

    const ignoredAgain = await processChatMessage(
      db,
      "user-1",
      "I said answer.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
      },
      conversationId
    );

    assert.equal(chatPayloads.length, 0, JSON.stringify(chatPayloads, null, 2));
    assert.equal(ignoredAgain.conversation.messages.at(-1)?.role, "user");
    assert.equal(ignoredAgain.prismMood?.recentDeltas[0]?.kind, "ignored_turn");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND role = 'assistant'").get(conversationId) as { n: number }).n,
      1
    );

    db.prepare(
      "UPDATE prism_mood_state SET ignore_until = ? WHERE user_id = ? AND conversation_id = ? AND mode = ?"
    ).run("2026-06-19T11:59:00.000Z", "user-1", conversationId, "zen");

    const repaired = await processChatMessage(
      db,
      "user-1",
      "Sorry, I will slow down. Thank you for staying with me.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
      },
      conversationId
    );

    assert.equal(chatPayloads.length, 1, JSON.stringify(chatPayloads, null, 2));
    assert.equal(repaired.conversation.messages.at(-1)?.role, "assistant");
    assert.equal(repaired.conversation.messages.at(-1)?.content, "Back online.");
    assert.equal(repaired.prismMood?.recentDeltas[0]?.kind, "positive_turn");
  });

  it("keeps relationship and mood context out of the persona identity block", async () => {
    const db = createChatTestDb();
    const userKey = CHAT_TEST_USER_KEY;
    db.prepare(
      "INSERT INTO bots (id, user_id, name, system_prompt, color, glyph) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      "bot-1",
      "user-1",
      "Leaf Bot",
      "You are Leaf Bot. You are curious and warm.",
      "#7fbf7f",
      "leaf"
    );
    db.prepare(
      `INSERT INTO bot_opinions (
        user_id, bot_scope_key, bot_id, score, band, boundary_level, trend,
        last_reason, recent_reasons, repair_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "user-1",
      "bot-1",
      "bot-1",
      24,
      "strained",
      "gentle",
      "down",
      "The user was curt in a prior turn.",
      JSON.stringify(["The user was curt in a prior turn."]),
      0,
      "2026-01-01T00:00:00.000Z"
    );
    type ChatPayload = {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
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
      if (body.messages?.[0]?.content.includes("memory validation critic")) {
        return new Response(
          JSON.stringify({ message: { content: JSON.stringify({ results: [] }) } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/chat")) {
        chatPayloads.push(body);
        return new Response(
          JSON.stringify({ message: { content: "Let us make that quieter and more useful." } }),
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
      "user-1",
      "Can we make tonight's check-in gentler?",
      userKey,
      {
        preferredProvider: "local",
        autoMemory: true,
        botId: "bot-1",
        botSystemPrompt: "You are Leaf Bot. You are curious and warm.",
        devMemoriesEnabled: true,
        devMemoriesText: "The test user likes slower pacing.",
        incognito: false,
        mode: "sandbox",
      }
    );

    const generationBody = chatPayloads[0];
    assert.ok(generationBody);
    const messages = generationBody.messages ?? [];
    const identityBlock = messages[0]?.content ?? "";
    const promptText = messages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n\n");
    assert.match(identityBlock, /You are Leaf Bot/i);
    assert.doesNotMatch(identityBlock, /slower pacing/i);
    assert.doesNotMatch(identityBlock, /Conversation relationship context/i);
    assert.doesNotMatch(identityBlock, /Current Prism mood context/i);
    assert.match(promptText, /Developer conversation context \(not persona identity\)/);
    assert.match(
      promptText,
      /Conversation relationship context for this turn \(not persona identity\)/
    );
    assert.match(promptText, /Current Prism mood context for this turn \(not persona identity\)/);
    assert.doesNotMatch(promptText, /across every bot persona/i);
  });

  it("anchors extreme Prism mood values for direct self-report questions", async () => {
    const runMoodPrompt = async (args: {
      moodKey: string;
      annoyance: number;
      warmth: number;
      engagement: number;
      expectedAnchor: RegExp;
      expectedVoice: RegExp;
    }): Promise<string> => {
      const db = createChatTestDb();
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO conversations (id, user_id, title, conversation_mode, incognito, created_at, updated_at) VALUES (?, ?, ?, 'zen', 0, ?, ?)"
      ).run("mood-extreme", "user-1", "Mood check", now, now);
      db.prepare(
        `INSERT INTO prism_mood_state (
          user_id, conversation_id, mode, mood_key, confidence, annoyance,
          warmth, engagement, restraint, recent_deltas, frozen, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "user-1",
        "mood-extreme",
        "zen",
        args.moodKey,
        1,
        args.annoyance,
        args.warmth,
        args.engagement,
        0.38,
        "[]",
        1,
        now
      );

      const chatPayloads: Array<{ messages?: Array<{ role: string; content: string }> }> = [];
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          messages?: Array<{ role: string; content: string }>;
        };
        if (String(input).includes("/api/chat")) {
          chatPayloads.push(body);
          return new Response(JSON.stringify({ message: { content: "Mood noted." } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;

      await processChatMessage(
        db,
        "user-1",
        "On a scale of 1 to 10, what is your current mood?",
        CHAT_TEST_USER_KEY,
        {
          preferredProvider: "local",
          autoMemory: false,
          starterPrompt: false,
          incognito: false,
          mode: "zen",
        },
        "mood-extreme"
      );

      const promptText = (chatPayloads[0]?.messages ?? [])
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n");
      assert.match(promptText, args.expectedAnchor);
      assert.match(promptText, args.expectedVoice);
      assert.match(promptText, /Exact 1-10 self-report values:/);
      assert.match(promptText, /90-100% should read as 9-10\/10/);
      assert.match(promptText, /noticeably affect tone, pacing, and brevity/);
      return promptText;
    };

    await runMoodPrompt({
      moodKey: "strained",
      annoyance: 1,
      warmth: 0.12,
      engagement: 0.28,
      expectedAnchor: /Current self-report anchor: annoyance 10\/10/,
      expectedVoice: /Voice: visibly strained, terse, cool/i,
    });
    await runMoodPrompt({
      moodKey: "joyful",
      annoyance: 0,
      warmth: 1,
      engagement: 1,
      expectedAnchor: /Current self-report anchor: warmth 10\/10/,
      expectedVoice: /Voice: openly warm, bright, and emotionally available/i,
    });
  });

  it("skips AskQuestion payload for open-ended assistant questions", async () => {
    const cases = [
      "Sure — here's one. What do you think?",
      "How are you feeling about this?",
      "Tell me more?",
      "I wonder, what piqued your interest in him?",
    ];

    for (const content of cases) {
      const db = createChatTestDb();
      globalThis.fetch = (async (_input: string | URL | Request) =>
        new Response(
          JSON.stringify({
            message: { content },
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
          mode: "zen",
        }
      );

      const lastAssistant = result.conversation.messages
        .filter((m) => m.role === "assistant")
        .pop();
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
    }
  });

  it("backfills binary AskQuestion chips from clear yes/no assistant questions", async () => {
    const db = createChatTestDb();
    globalThis.fetch = (async (_input: string | URL | Request) =>
      new Response(
        JSON.stringify({
          message: {
            content: "I can tune the tone.\nDo you want me to make that calmer?",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "This reads too sharp.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.content, "I can tune the tone.");
    assert.equal(lastAssistant?.askQuestion?.prompt, "Do you want me to make that calmer?");
    assert.deepEqual(
      lastAssistant?.askQuestion?.options.map((option) => option.label),
      ["Yes", "No"]
    );
  });

  it("backfills AskQuestion chips from two-option assistant alternatives", async () => {
    const db = createChatTestDb();
    globalThis.fetch = (async (_input: string | URL | Request) =>
      new Response(
        JSON.stringify({
          message: {
            content: "We can tune the vibe.\nShould we make it playful or restrained?",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Help shape this interaction.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.content, "We can tune the vibe.");
    assert.equal(lastAssistant?.askQuestion?.prompt, "Should we make it playful or restrained?");
    assert.deepEqual(
      lastAssistant?.askQuestion?.options.map((option) => option.label),
      ["Playful", "Restrained"]
    );
  });

  it("backfills AskQuestion chips from three-option assistant alternatives", async () => {
    const db = createChatTestDb();
    globalThis.fetch = (async (_input: string | URL | Request) =>
      new Response(
        JSON.stringify({
          message: {
            content:
              "I can set an atmosphere direction.\nWhich direction feels better: glass, ink, or shadow?",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Let's pick an atmosphere.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
      }
    );

    const lastAssistant = result.conversation.messages.filter((m) => m.role === "assistant").pop();
    assert.equal(lastAssistant?.content, "I can set an atmosphere direction.");
    assert.equal(
      lastAssistant?.askQuestion?.prompt,
      "Which direction feels better: glass, ink, or shadow?"
    );
    assert.deepEqual(
      lastAssistant?.askQuestion?.options.map((option) => option.label),
      ["Glass", "Ink", "Shadow"]
    );
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
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
      { mode: "zen", reason: "manual", force: true }
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
        mode: "zen",
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
      { mode: "zen", reason: "milestone" }
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
        mode: "zen",
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
        mode: "sandbox",
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
        mode: "zen",
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
        mode: "sandbox",
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
        mode: "sandbox",
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
        mode: "sandbox",
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
        mode: "zen",
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
        mode: "sandbox",
      }
    );

    assert.equal(result.memoryLearned?.created.length, 1);
    assert.equal(result.memoryLearned?.created[0]?.text, "You live on land.");
    assert.equal(result.memoryLearned?.created[0]?.botId, "bot-1");
    assert.ok((result.memoryLearned?.created[0]?.confidence ?? 0) >= 0.82);
  });

  it("scopes Zen Facet turns and memories to the active bot without locking the Zen conversation", async () => {
    const db = createChatTestDb();
    const userKey = Buffer.alloc(32, 7);
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-1", "user-1", "Harry", "#b11f2b", "spark");
    installChatFetchStub("Good to know.");

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
        mode: "zen",
      }
    );

    assert.equal(result.conversation.botId, null);
    assert.equal(result.conversation.lastBotId, "bot-1");
    assert.equal(result.conversation.lastBotColor, "#b11f2b");
    assert.deepEqual(
      result.conversation.messages.map((message) => ({
        role: message.role,
        botId: message.botId,
      })),
      [
        { role: "user", botId: "bot-1" },
        { role: "assistant", botId: "bot-1" },
      ]
    );
    assert.equal(result.memoryLearned?.created[0]?.botId, "bot-1");

    const conversationRow = db
      .prepare("SELECT bot_id FROM conversations WHERE id = ?")
      .get(result.conversation.id) as { bot_id: string | null };
    assert.equal(conversationRow.bot_id, null);
    const messageRows = db
      .prepare(
        "SELECT role, bot_id FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all(result.conversation.id) as Array<{ role: string; bot_id: string | null }>;
    assert.deepEqual(messageRows.map((row) => ({ role: row.role, bot_id: row.bot_id })), [
      { role: "user", bot_id: "bot-1" },
      { role: "assistant", bot_id: "bot-1" },
    ]);
    const projectionRows = db
      .prepare(
        "SELECT role, bot_id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE parent_id = ?) ORDER BY created_at ASC"
      )
      .all(result.conversation.id) as Array<{ role: string; bot_id: string | null }>;
    assert.deepEqual(projectionRows.map((row) => ({ role: row.role, bot_id: row.bot_id })), [
      { role: "user", bot_id: "bot-1" },
      { role: "assistant", bot_id: "bot-1" },
    ]);
  });

  it("seeds fresh Zen Facet conversations with the latest remembered wallpaper", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-1", "user-1", "Harry", "#b11f2b", "spark");
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-2", "user-1", "Sally", "#2f9a6b", "leaf");
    db.prepare(
      `INSERT INTO images (
        id, user_id, conversation_id, bot_id, prompt, revised_prompt,
        url, size, quality, provider, model, local_rel_path, purpose, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "wallpaper-old",
      "user-1",
      "old-conv",
      "bot-1",
      "old pier",
      "old pier",
      "/api/images/wallpaper-old/file",
      "1536x1024",
      "standard",
      "local",
      "dream",
      null,
      "wallpaper",
      "2026-01-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO images (
        id, user_id, conversation_id, bot_id, prompt, revised_prompt,
        url, size, quality, provider, model, local_rel_path, purpose, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "wallpaper-new",
      "user-1",
      "newer-conv",
      "bot-1",
      "moonlit reef",
      "moonlit reef",
      "/api/images/wallpaper-new/file",
      "1536x1024",
      "standard",
      "local",
      "dream",
      null,
      "wallpaper",
      "2026-02-01T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO images (
        id, user_id, conversation_id, bot_id, prompt, revised_prompt,
        url, size, quality, provider, model, local_rel_path, purpose, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "wallpaper-other",
      "user-1",
      "other-conv",
      "bot-2",
      "forest cabin",
      "forest cabin",
      "/api/images/wallpaper-other/file",
      "1536x1024",
      "standard",
      "local",
      "dream",
      null,
      "wallpaper",
      "2026-03-01T00:00:00.000Z"
    );
    installChatFetchStub("Good to know.");

    const result = await processChatMessage(
      db,
      "user-1",
      "Let's go back.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "zen",
      }
    );

    assert.equal(result.conversation.botId, null);
    assert.equal(result.conversation.zenWallpaper?.enabled, true);
    assert.equal(result.conversation.zenWallpaper?.status, "ready");
    assert.equal(result.conversation.zenWallpaper?.imageId, "wallpaper-new");
    assert.equal(result.conversation.zenWallpaper?.promptSeed, "moonlit reef");
    assert.equal(result.conversation.zenWallpaper?.generationMessageCount, 0);
    assert.deepEqual(result.conversation.zenWallpaper?.history, [
      {
        imageId: "wallpaper-new",
        promptSeed: "moonlit reef",
        generationMessageCount: 0,
        createdAt: "2026-02-01T00:00:00.000Z",
      },
    ]);

    const conversationRow = db
      .prepare(
        `SELECT bot_id, zen_wallpaper_enabled, zen_wallpaper_image_id,
                zen_wallpaper_prompt_seed, zen_wallpaper_message_count,
                zen_wallpaper_status, zen_wallpaper_history
           FROM conversations
          WHERE id = ?`
      )
      .get(result.conversation.id) as {
        bot_id: string | null;
        zen_wallpaper_enabled: number;
        zen_wallpaper_image_id: string | null;
        zen_wallpaper_prompt_seed: string | null;
        zen_wallpaper_message_count: number | null;
        zen_wallpaper_status: string;
        zen_wallpaper_history: string;
      };
    assert.equal(conversationRow.bot_id, null);
    assert.equal(conversationRow.zen_wallpaper_enabled, 1);
    assert.equal(conversationRow.zen_wallpaper_image_id, "wallpaper-new");
    assert.equal(conversationRow.zen_wallpaper_prompt_seed, "moonlit reef");
    assert.equal(conversationRow.zen_wallpaper_message_count, 0);
    assert.equal(conversationRow.zen_wallpaper_status, "ready");
    assert.deepEqual(JSON.parse(conversationRow.zen_wallpaper_history), [
      {
        imageId: "wallpaper-new",
        promptSeed: "moonlit reef",
        generationMessageCount: 0,
        createdAt: "2026-02-01T00:00:00.000Z",
      },
    ]);
  });

  it("starts default Prism Zen conversations without remembered wallpaper metadata", async () => {
    const db = createChatTestDb();
    db.prepare(
      `INSERT INTO images (
        id, user_id, conversation_id, bot_id, prompt, revised_prompt,
        url, size, quality, provider, model, local_rel_path, purpose, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "wallpaper-default-skip",
      "user-1",
      "old-default-conv",
      null,
      "quiet prism light",
      "quiet prism light",
      "/api/images/wallpaper-default-skip/file",
      "1536x1024",
      "standard",
      "local",
      "dream",
      null,
      "wallpaper",
      "2026-02-01T00:00:00.000Z"
    );
    installChatFetchStub("Clean slate.");

    const result = await processChatMessage(
      db,
      "user-1",
      "Start fresh.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
      }
    );

    assert.equal(result.conversation.botId, null);
    assert.equal(result.conversation.zenWallpaper?.enabled, false);
    assert.equal(result.conversation.zenWallpaper?.status, "idle");
    assert.equal(result.conversation.zenWallpaper?.imageId, null);
    assert.equal(result.conversation.zenWallpaper?.promptSeed, null);
    assert.equal(result.conversation.zenWallpaper?.generationMessageCount, null);
    assert.deepEqual(result.conversation.zenWallpaper?.history, []);

    const conversationRow = db
      .prepare(
        `SELECT zen_wallpaper_enabled, zen_wallpaper_image_id,
                zen_wallpaper_prompt_seed, zen_wallpaper_message_count,
                zen_wallpaper_status, zen_wallpaper_history
           FROM conversations
          WHERE id = ?`
      )
      .get(result.conversation.id) as {
        zen_wallpaper_enabled: number;
        zen_wallpaper_image_id: string | null;
        zen_wallpaper_prompt_seed: string | null;
        zen_wallpaper_message_count: number | null;
        zen_wallpaper_status: string;
        zen_wallpaper_history: string;
      };
    assert.equal(conversationRow.zen_wallpaper_enabled, 0);
    assert.equal(conversationRow.zen_wallpaper_image_id, null);
    assert.equal(conversationRow.zen_wallpaper_prompt_seed, null);
    assert.equal(conversationRow.zen_wallpaper_message_count, null);
    assert.equal(conversationRow.zen_wallpaper_status, "idle");
    assert.equal(conversationRow.zen_wallpaper_history, "[]");
  });

  it("does not seed remembered Zen Facet wallpapers in private mode", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-1", "user-1", "Harry", "#b11f2b", "spark");
    db.prepare(
      `INSERT INTO images (
        id, user_id, conversation_id, bot_id, prompt, revised_prompt,
        url, size, quality, provider, model, local_rel_path, purpose, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "wallpaper-private-skip",
      "user-1",
      "old-conv",
      "bot-1",
      "secret grotto",
      "secret grotto",
      "/api/images/wallpaper-private-skip/file",
      "1536x1024",
      "standard",
      "local",
      "dream",
      null,
      "wallpaper",
      "2026-02-01T00:00:00.000Z"
    );
    installChatFetchStub("Private reply.");

    const result = await processChatMessage(
      db,
      "user-1",
      "Keep this off the books.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: true,
        mode: "zen",
      }
    );

    assert.equal(result.conversation.incognito, true);
    assert.equal(result.conversation.zenWallpaper, undefined);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM conversations").get() as { n: number }).n,
      0
    );
  });

  it("arms fresh Zen Facet conversations for immediate Atmosphere generation when no remembered wallpaper exists", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-1", "user-1", "Harry", "#b11f2b", "spark");
    installChatFetchStub("A new horizon.");

    const result = await processChatMessage(
      db,
      "user-1",
      "Start somewhere new.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "bot-1",
        incognito: false,
        mode: "zen",
      }
    );

    assert.equal(result.conversation.zenWallpaper?.enabled, true);
    assert.equal(result.conversation.zenWallpaper?.status, "idle");
    assert.equal(result.conversation.zenWallpaper?.imageId, null);
    assert.deepEqual(result.conversation.zenWallpaper?.history, []);
    const conversationRow = db
      .prepare(
        `SELECT zen_wallpaper_enabled, zen_wallpaper_image_id,
                zen_wallpaper_status, zen_wallpaper_history
           FROM conversations
          WHERE id = ?`
      )
      .get(result.conversation.id) as {
        zen_wallpaper_enabled: number;
        zen_wallpaper_image_id: string | null;
        zen_wallpaper_status: string;
        zen_wallpaper_history: string;
      };
    assert.equal(conversationRow.zen_wallpaper_enabled, 1);
    assert.equal(conversationRow.zen_wallpaper_image_id, null);
    assert.equal(conversationRow.zen_wallpaper_status, "idle");
    assert.equal(conversationRow.zen_wallpaper_history, "[]");
  });

  it("keeps Command Center prompt turns out of memories and mood state", async () => {
    const db = createChatTestDb();
    installChatFetchStub("Prompt result.");

    const result = await processChatMessage(
      db,
      "user-1",
      "Remember this: I prefer pistachios.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: true,
        incognito: false,
        mode: "zen",
        commandCenterPrompt: true,
        prismInterruption: {
          kind: "pending_reply",
        },
      }
    );

    assert.equal(result.memoryLearned, undefined);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM memories").get() as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM prism_mood_state").get() as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM session_opinions").get() as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM bot_opinions").get() as { n: number }).n,
      0
    );
    assert.equal(result.prismMood?.recentDeltas.length, 0);
  });

  it("uses resolved Command Center prompt text for the model while saving the visible shortcut sentence", async () => {
    const db = createChatTestDb();
    type ProviderBody = {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    const bodies: ProviderBody[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as ProviderBody;
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      bodies.push(body);
      return new Response(
        JSON.stringify({ message: { content: "Prompt result." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Please use /prompt here.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: true,
        incognito: false,
        mode: "zen",
        commandCenterPrompt: true,
        promptInputOverride: "Please use the expanded prompt body here.",
        promptShortcut: {
          v: 1,
          commandId: "prompt-1",
          name: "prompt",
          invocation: "/prompt",
          flags: [],
        },
      }
    );

    const chatBody = bodies.find((body) => Array.isArray(body.messages));
    assert.equal(chatBody?.messages?.at(-1)?.content, "Please use the expanded prompt body here.");
    const storedUser = db
      .prepare("SELECT content, tool_payload FROM messages WHERE role = 'user'")
      .get() as { content: string; tool_payload: string };
    assert.equal(storedUser.content, "Please use /prompt here.");
    const storedPayload = JSON.parse(storedUser.tool_payload) as {
      promptShortcut?: { resolvedPrompt?: string };
    };
    assert.equal(
      storedPayload.promptShortcut?.resolvedPrompt,
      "Please use the expanded prompt body here."
    );
    const userMessage = result.conversation.messages.find((message) => message.role === "user");
    assert.equal(userMessage?.content, "Please use /prompt here.");
    assert.equal(
      userMessage?.promptShortcut?.resolvedPrompt,
      "Please use the expanded prompt body here."
    );
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
        mode: "sandbox",
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
        mode: "zen",
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
        mode: "sandbox",
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
        mode: "zen",
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
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, 'sandbox', ?, ?)"
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
        mode: "sandbox",
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
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, 'sandbox', ?, ?)"
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
        mode: "sandbox",
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "zen",
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
        mode: "sandbox",
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
        mode: "sandbox",
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
        mode: "sandbox",
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
        mode: "sandbox",
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

  it("does not auto-create protected about-you memories from account display name", async () => {
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
        userDisplayName: "Jared",
        botId: "bot-1",
        incognito: false,
        mode: "sandbox",
      }
    );

    const firstCount = (
      db
        .prepare("SELECT COUNT(*) AS n FROM memories WHERE user_id = ? AND source = 'about_you'")
        .get("user-1") as { n: number }
    ).n;
    assert.equal(firstCount, 0);

    await processChatMessage(
      db,
      "user-1",
      "Let's keep going.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        userDisplayName: "Jared",
        botId: "bot-1",
        incognito: false,
        mode: "sandbox",
      },
      first.conversation.id
    );
    const secondCount = (
      db
        .prepare("SELECT COUNT(*) AS n FROM memories WHERE user_id = ? AND source = 'about_you'")
        .get("user-1") as { n: number }
    ).n;
    assert.equal(secondCount, 0);
  });
});

describe("extractPrismBotMentionIdsFromMessage", () => {
  it("collects unique decoded bot ids from prism-bot links", () => {
    const text =
      "Hey [SpongeBob](prism-bot://sb) and [Pat](prism-bot://pat%201) — also [SpongeBob](prism-bot://sb) again";
    assert.deepEqual(extractPrismBotMentionIdsFromMessage(text), ["sb", "pat 1"]);
  });
});

describe("processChatMessage Zen session memory prompt gating", () => {
  it("injects session memory only for explicit prior-context inquiries", async () => {
    const db = createChatTestDb();
    const nowMs = Date.now();
    const previousCreatedAt = new Date(nowMs - 120_000).toISOString();
    const previousUpdatedAt = new Date(nowMs - 90_000).toISOString();
    const summaryCreatedAt = new Date(nowMs - 80_000).toISOString();
    const checkpointNow = new Date(nowMs - 60_000);
    const checkpointAssistantAt = new Date(nowMs - 59_000).toISOString();
    const activeCreatedAt = new Date(nowMs - 30_000).toISOString();
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, incognito, created_at, updated_at) VALUES (?, ?, ?, 'zen', 0, ?, ?)"
    ).run("active", "user-1", "Active Zen", activeCreatedAt, activeCreatedAt);
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, incognito, created_at, updated_at) VALUES (?, ?, ?, 'zen', 0, ?, ?)"
    ).run(
      "previous",
      "user-1",
      "Bridge Story",
      previousCreatedAt,
      previousUpdatedAt
    );
    db.prepare(
      "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "summary-previous",
      "user-1",
      "previous",
      JSON.stringify({
        v: 1,
        kind: "thread_compact",
        mode: "zen",
        summary: "The user and Prism are midway through a bridge story.",
        displaySummary: "I'm holding the bridge story at the choice.",
        createdAt: summaryCreatedAt,
      }),
      summaryCreatedAt
    );
    await createZenSessionMemoryCheckpoint({
      db,
      provider: {
        name: "local",
        async generateResponse() {
          return JSON.stringify({
            title: "Bridge Choice",
            text: "Resume at the lantern-or-map choice before crossing the bridge.",
          });
        },
        async embedText() {
          return [];
        },
      },
      userId: "user-1",
      conversationId: "previous",
      userKey: CHAT_TEST_USER_KEY,
      history: [
        {
          id: "previous-assistant",
          role: "assistant",
          content: "The bridge waits between a lantern path and a map path.",
          createdAt: previousUpdatedAt,
        },
      ],
      userMessage: {
        id: "previous-user",
        role: "user",
        content: "Let's finish this later.",
        createdAt: checkpointNow.toISOString(),
      },
      assistantMessage: {
        id: "previous-reply",
        role: "assistant",
        content: "We can pause at the choice.",
        createdAt: checkpointAssistantAt,
      },
      now: checkpointNow,
    });

    type ProviderBody = {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    const bodies: ProviderBody[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as ProviderBody;
      bodies.push(body);
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ message: { content: "A steady Zen reply." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    await processChatMessage(
      db,
      "user-1",
      "Tell me about the weather.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
        botSystemPrompt: "You are Prism.",
      },
      "active"
    );
    const ordinaryBodies = bodies.filter((body) =>
      body.messages?.at(-1)?.role === "user" &&
      body.messages.at(-1)?.content === "Tell me about the weather."
    );
    assert.equal(ordinaryBodies.length, 1);
    assert.ok(
      !ordinaryBodies[0]?.messages
        ?.map((message) => message.content)
        .join("\n")
        .includes("Zen session memory context")
    );

    bodies.length = 0;
    await processChatMessage(
      db,
      "user-1",
      "Where were we last conversation?",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
        botSystemPrompt: "You are Prism.",
      },
      "active"
    );
    const inquiryBodies = bodies.filter((body) =>
      body.messages?.at(-1)?.role === "user" &&
      body.messages.at(-1)?.content === "Where were we last conversation?"
    );
    assert.equal(inquiryBodies.length, 1);
    const inquiryPrompt = inquiryBodies[0]?.messages
      ?.map((message) => message.content)
      .join("\n") ?? "";
    assert.match(inquiryPrompt, /Zen session memory context/);
    assert.match(inquiryPrompt, /midway through a bridge story/);
    assert.match(inquiryPrompt, /lantern-or-map choice/);
  });
});

describe("processChatMessage session resume context", () => {
  it("adds Zen resume context to the model prompt without storing it as a message", async () => {
    const db = createChatTestDb();
    type ProviderBody = {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    const bodies: ProviderBody[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as ProviderBody;
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      bodies.push(body);
      return new Response(
        JSON.stringify({ message: { content: "Resume-aware reply." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await processChatMessage(
      db,
      "user-1",
      "Where were we?",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
        sessionResumeContext: {
          summary: "We were shaping Prism into a living, continuous conversation.",
          previousActiveAt: "2026-06-18T20:00:00.000Z",
          resumedAt: "2026-06-19T09:00:00.000Z",
          gapMs: 13 * 60 * 60 * 1000,
          source: "dev",
        },
      }
    );

    const chatBody = bodies.find((body) => Array.isArray(body.messages));
    assert.ok(chatBody);
    const promptText = (chatBody.messages ?? [])
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    assert.match(promptText, /Zen session resume context:/);
    assert.match(promptText, /about 13 hours/);
    assert.match(promptText, /living, continuous conversation/);
    assert.equal(result.conversation.messages.length, 2);
    const storedResumeRows = db
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE content LIKE '%Zen session resume context%'")
      .get() as { n: number };
    assert.equal(storedResumeRows.n, 0);
  });

  it("does not add resume context to Sandbox prompts", async () => {
    const db = createChatTestDb();
    type ProviderBody = {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    const bodies: ProviderBody[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as ProviderBody;
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      bodies.push(body);
      return new Response(
        JSON.stringify({ message: { content: "Sandbox reply." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    await processChatMessage(
      db,
      "user-1",
      "Keep testing.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "sandbox",
        sessionResumeContext: {
          summary: "This should not be included outside Zen.",
          gapMs: 13 * 60 * 60 * 1000,
          source: "dev",
        },
      }
    );

    const chatBody = bodies.find((body) => Array.isArray(body.messages));
    assert.ok(chatBody);
    const promptText = (chatBody.messages ?? [])
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    assert.doesNotMatch(promptText, /Zen session resume context:/);
    assert.doesNotMatch(promptText, /outside Zen/);
  });
});

describe("processChatMessage topic reset context", () => {
  it("adds a one-turn topic pivot hint without storing or clearing it", async () => {
    const db = createChatTestDb();
    type ProviderBody = {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    const bodies: ProviderBody[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as ProviderBody;
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      bodies.push(body);
      return new Response(
        JSON.stringify({ message: { content: "Pivot-aware reply." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const first = await processChatMessage(
      db,
      "user-1",
      "Tell me about pottery glazes.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
      }
    );

    const second = await processChatMessage(
      db,
      "user-1",
      "Let's talk about telescopes.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
        topicReset: true,
      },
      first.conversation.id
    );

    assert.equal(second.conversation.messages.length, 4);
    const persistedUserMessages = second.conversation.messages
      .filter((message) => message.role === "user")
      .map((message) => message.content);
    assert.deepEqual(persistedUserMessages, [
      "Tell me about pottery glazes.",
      "Let's talk about telescopes.",
    ]);
    const chatBodies = bodies.filter((body) => Array.isArray(body.messages));
    const latestPromptText = (chatBodies.at(-1)?.messages ?? [])
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    assert.match(latestPromptText, /clean topic pivot/i);
    assert.match(latestPromptText, /Do not continue, answer, or revive the previous topic/i);
    assert.match(latestPromptText, /Tell me about pottery glazes/);
    const storedHintRows = db
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE content LIKE '%clean topic pivot%' OR content LIKE '%/nvm%'")
      .get() as { n: number };
    assert.equal(storedHintRows.n, 0);
  });
});

describe("processChatMessage Zen action prompt guidance", () => {
  it("adds action interpretation guidance to Zen prompts", async () => {
    const db = createChatTestDb();
    type ProviderBody = {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    const bodies: ProviderBody[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as ProviderBody;
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      bodies.push(body);
      return new Response(
        JSON.stringify({ message: { content: "Presence received." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    await processChatMessage(
      db,
      "user-1",
      "*looks at you inquisitively*",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
      }
    );

    const chatBody = bodies.find((body) => Array.isArray(body.messages));
    assert.ok(chatBody);
    const promptText = (chatBody.messages ?? [])
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    assert.match(promptText, /single-asterisk action beat/);
    assert.match(promptText, /performed non-verbal action/);
  });

  it("does not add Zen action guidance to Sandbox prompts", async () => {
    const db = createChatTestDb();
    type ProviderBody = {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    const bodies: ProviderBody[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as ProviderBody;
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      bodies.push(body);
      return new Response(
        JSON.stringify({ message: { content: "Sandbox received." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    await processChatMessage(
      db,
      "user-1",
      "*looks at you inquisitively*",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "sandbox",
      }
    );

    const chatBody = bodies.find((body) => Array.isArray(body.messages));
    assert.ok(chatBody);
    const promptText = (chatBody.messages ?? [])
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    assert.doesNotMatch(promptText, /single-asterisk action beat/);
    assert.doesNotMatch(promptText, /performed non-verbal action/);
  });
});

describe("processChatMessage bot mentions", () => {
  it("adds mentioned library bot profile context to the model prompt", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, name, system_prompt, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "bot-mentor",
      "Mentor Bot",
      "A patient mentor who asks crisp follow-up questions.",
      "#4f8cff",
      "spark"
    );

    type ProviderBody = {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    const bodies: ProviderBody[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as ProviderBody;
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      bodies.push(body);
      return new Response(
        JSON.stringify({
          message: {
            content: "Mentor Bot gives me a useful reference point here.",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    await processChatMessage(
      db,
      "user-1",
      "Can you compare this with [Mentor Bot](prism-bot://bot-mentor)?",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        incognito: false,
        mode: "zen",
      }
    );

    const mentionContext = bodies
      .flatMap((body) => body.messages ?? [])
      .find((message) =>
        message.content.startsWith("Prism bot mentions in the latest user message:")
      );
    assert.ok(mentionContext);
    assert.match(mentionContext.content, /Mentor Bot/);
    assert.match(mentionContext.content, /patient mentor/i);
    assert.match(mentionContext.content, /Stay in the current Prism\/persona voice/i);
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
    assert.equal(
      out,
      "Create the image the assistant just offered. Use the assistant's visual brief instead of the user's short affirmation: Would you care to see some of my latest drawings?"
    );
  });

  it("uses the assistant's atmosphere offer instead of a bare yes prompt", () => {
    const out = autoBackfillSendGeneratedImagePrompt({
      isStarterPrompt: false,
      userMessage: "Yes.",
      parsedToolPrompt: undefined,
      recentMessages: [
        {
          role: "assistant",
          content:
            "Would you like me to create a 16:9 abstract ambient wallpaper for this Zen chat canvas?",
        },
      ],
    });
    assert.match(out ?? "", /abstract ambient wallpaper/i);
    assert.notEqual(out, "Yes.");
  });
});

describe("inferChatToolRequestedImageSize", () => {
  it("treats chat atmosphere wallpaper prompts as landscape", () => {
    assert.equal(
      inferChatToolRequestedImageSize(
        "Create an abstract ambient wallpaper for a calm Zen chat canvas."
      ),
      "1536x1024"
    );
    assert.equal(
      inferChatToolRequestedImageSize("soft gradients for a desktop chat background"),
      "1536x1024"
    );
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

describe("buildAskQuestionFallback", () => {
  it("does not split prefaced open-ended questions into fake choices", () => {
    assert.equal(
      buildAskQuestionFallback("I wonder, what piqued your interest in him?"),
      undefined
    );
    assert.equal(
      buildAskQuestionFallback("I'm curious, why did that stand out to you?"),
      undefined
    );
    assert.equal(
      buildAskQuestionFallback("Squidward, would you like to join us?"),
      undefined
    );
    assert.equal(
      buildAskQuestionFallback(
        "...What is it, Jared, that you feel most strongly when you are alone with your thoughts?"
      ),
      undefined
    );
  });
});

describe("processChatMessage Zen Facet transitions", () => {
  it("keeps handoffs in one PRISM session and creates bot child projections", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-1", "user-1", "Harry", "#b11f2b", "spark");
    installChatFetchStub("Hello from the handoff.");

    const personaResult = await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: true,
        botId: "bot-1",
        incognito: false,
        mode: "zen",
        personaTransition: {
          fromBotId: null,
          toBotId: "bot-1",
          source: "picker",
        },
      }
    );

    assert.equal(personaResult.conversation.botId, null);
    assert.equal(personaResult.conversation.hubRole, "hub");
    assert.equal(personaResult.conversation.hubBotId, null);
    assert.equal(personaResult.conversation.lastBotId, "bot-1");
    assert.equal(personaResult.conversation.lastBotColor, "#b11f2b");
    assert.deepEqual(
      personaResult.conversation.messages.map((message) => ({
        role: message.role,
        botId: message.botId,
      })),
      [{ role: "assistant", botId: "bot-1" }]
    );

    const defaultResult = await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: true,
        botId: null,
        incognito: false,
        mode: "zen",
        personaTransition: {
          fromBotId: "bot-1",
          toBotId: null,
          source: "picker",
        },
      },
      personaResult.conversation.id
    );

    assert.equal(defaultResult.conversation.botId, null);
    assert.equal(defaultResult.conversation.hubRole, "hub");
    assert.equal(defaultResult.conversation.hubBotId, null);
    assert.equal(defaultResult.conversation.id, personaResult.conversation.id);
    assert.equal(defaultResult.conversation.lastBotId, null);
    assert.equal(defaultResult.conversation.lastBotColor, null);
    assert.deepEqual(
      defaultResult.conversation.messages.map((message) => ({
        role: message.role,
        botId: message.botId,
      })),
      [
        { role: "assistant", botId: "bot-1" },
        { role: "assistant", botId: null },
      ]
    );

    const rows = db
      .prepare(
        "SELECT role, bot_id FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all(defaultResult.conversation.id) as Array<{ role: string; bot_id: string | null }>;
    assert.deepEqual(rows.map((row) => ({ role: row.role, bot_id: row.bot_id })), [
      { role: "assistant", bot_id: "bot-1" },
      { role: "assistant", bot_id: null },
    ]);
    const projectionRows = db
      .prepare(
        "SELECT id, conversation_mode, bot_id, parent_id FROM conversations WHERE parent_id = ? ORDER BY created_at ASC"
      )
      .all(defaultResult.conversation.id) as Array<{
        id: string;
        conversation_mode: string;
        bot_id: string | null;
        parent_id: string | null;
      }>;
    assert.deepEqual(
      projectionRows.map((row) => ({
        conversation_mode: row.conversation_mode,
        bot_id: row.bot_id,
        parent_id: row.parent_id,
      })),
      [{ conversation_mode: "chat", bot_id: "bot-1", parent_id: defaultResult.conversation.id }]
    );
    const projectionMessages = db
      .prepare("SELECT role, bot_id FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
      .all(projectionRows[0]!.id) as Array<{ role: string; bot_id: string | null }>;
    assert.deepEqual(
      projectionMessages.map((row) => ({ role: row.role, bot_id: row.bot_id })),
      [{ role: "assistant", bot_id: "bot-1" }]
    );
    const allRows = db
      .prepare("SELECT role, bot_id FROM messages ORDER BY created_at ASC")
      .all() as Array<{ role: string; bot_id: string | null }>;
    assert.deepEqual(allRows.map((row) => ({ role: row.role, bot_id: row.bot_id })), [
      { role: "assistant", bot_id: "bot-1" },
      { role: "assistant", bot_id: "bot-1" },
      { role: "assistant", bot_id: null },
    ]);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE role = 'user'").get() as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT bot_id FROM conversations WHERE id = ?").get(
        defaultResult.conversation.id
      ) as { bot_id: string | null }).bot_id,
      null
    );
    const hubRows = db
      .prepare("SELECT bot_key, conversation_id FROM conversation_hubs ORDER BY bot_key ASC")
      .all() as Array<{ bot_key: string; conversation_id: string }>;
    assert.deepEqual(hubRows, []);
  });

  it("attributes previous-introduces handoffs to the outgoing Facet", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-1", "user-1", "Harry", "#b11f2b", "spark");
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-2", "user-1", "Sally", "#2f9eb8", "moon");
    installChatFetchStub("Harry makes a graceful introduction.");

    const result = await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: true,
        botId: "bot-2",
        incognito: false,
        mode: "zen",
        personaTransition: {
          fromBotId: "bot-1",
          toBotId: "bot-2",
          source: "picker",
          style: "previous-introduces",
        },
      }
    );

    assert.equal(result.conversation.botId, null);
    assert.equal(result.conversation.lastBotId, "bot-1");
    assert.equal(result.conversation.lastBotColor, "#b11f2b");
    assert.deepEqual(
      result.conversation.messages.map((message) => ({
        role: message.role,
        botId: message.botId,
      })),
      [{ role: "assistant", botId: "bot-1" }]
    );

    const rows = db
      .prepare(
        "SELECT role, bot_id FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all(result.conversation.id) as Array<{ role: string; bot_id: string | null }>;
    assert.deepEqual(rows.map((row) => ({ role: row.role, bot_id: row.bot_id })), [
      { role: "assistant", bot_id: "bot-1" },
    ]);
    const projectionRows = db
      .prepare(
        "SELECT role, bot_id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE parent_id = ?) ORDER BY created_at ASC"
      )
      .all(result.conversation.id) as Array<{ role: string; bot_id: string | null }>;
    assert.deepEqual(projectionRows.map((row) => ({ role: row.role, bot_id: row.bot_id })), [
      { role: "assistant", bot_id: "bot-1" },
    ]);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE role = 'user'").get() as { n: number }).n,
      0
    );
  });

  it("handles Default PRISM as a previous-introduces speaker", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-2", "user-1", "Sally", "#2f9eb8", "moon");
    installChatFetchStub("PRISM introduces Sally.");

    const result = await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: true,
        botId: "bot-2",
        incognito: false,
        mode: "zen",
        personaTransition: {
          fromBotId: null,
          toBotId: "bot-2",
          source: "picker",
          style: "previous-introduces",
        },
      }
    );

    assert.equal(result.conversation.lastBotId, null);
    assert.equal(result.conversation.lastBotColor, null);
    assert.deepEqual(
      result.conversation.messages.map((message) => ({
        role: message.role,
        botId: message.botId,
      })),
      [{ role: "assistant", botId: null }]
    );
  });

  it("checkpoints outgoing Facet spans and injects only that Facet when returning", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("mario", "user-1", "Mario", "#d22b2b", "star");
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("crash", "user-1", "Crash Bandicoot", "#f47a20", "bolt");

    type ProviderBody = {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    const bodies: ProviderBody[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as ProviderBody;
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      const promptText = body.messages?.map((message) => message.content).join("\n") ?? "";
      if (promptText.includes("Zen Facet checkpoints")) {
        return new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                title: "Mario Tax Code",
                text: "Mario should resume the Mushroom Kingdom tax-code story with Jared.",
              }),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      bodies.push(body);
      return new Response(
        JSON.stringify({ message: { content: "Facet reply." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const marioTurn = await processChatMessage(
      db,
      "user-1",
      "Mario, tell me about the Mushroom Kingdom tax code.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "mario",
        incognito: false,
        mode: "zen",
        botSystemPrompt: "You are Mario.",
        starterPromptLabel: "Mario",
      }
    );

    await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "crash",
        incognito: false,
        mode: "zen",
        botSystemPrompt: "You are Crash Bandicoot.",
        starterPromptLabel: "Crash Bandicoot",
        personaTransition: {
          fromBotId: "mario",
          toBotId: "crash",
          source: "picker",
          style: "new-speaks",
        },
      },
      marioTurn.conversation.id
    );

    const marioMemories = listZenSessionMemories(
      db,
      "user-1",
      CHAT_TEST_USER_KEY,
      new Date(),
      { botId: "mario" }
    );
    assert.equal(marioMemories.length, 1);
    assert.match(marioMemories[0]?.text ?? "", /tax-code story/);

    bodies.length = 0;
    await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "mario",
        incognito: false,
        mode: "zen",
        botSystemPrompt: "You are Mario.",
        starterPromptLabel: "Mario",
        personaTransition: {
          fromBotId: "crash",
          toBotId: "mario",
          source: "picker",
          style: "new-speaks",
        },
      },
      marioTurn.conversation.id
    );

    const returnPrompt = bodies
      .map((body) => body.messages?.map((message) => message.content).join("\n") ?? "")
      .find((text) => text.includes("Zen Facet continuity context")) ?? "";
    assert.match(returnPrompt, /Mario should resume the Mushroom Kingdom tax-code story/);
    assert.doesNotMatch(returnPrompt, /Crash should/);
    assert.equal(
      listZenSessionMemories(db, "user-1", CHAT_TEST_USER_KEY, new Date(), {
        botId: "crash",
      }).length,
      0
    );
  });

  it("checkpoints the outgoing Facet when Zen Autonomy switches speakers", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("mario", "user-1", "Mario", "#d22b2b", "star");
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("crash", "user-1", "Crash Bandicoot", "#f47a20", "bolt");

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
      const promptText = body.messages?.map((message) => message.content).join("\n") ?? "";
      if (promptText.includes("Zen Facet checkpoints")) {
        return new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                title: "Mario Story",
                text: "Mario was mid-story about old Mushroom Kingdom tax law with Jared.",
              }),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ message: { content: "Facet reply." } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const marioTurn = await processChatMessage(
      db,
      "user-1",
      "Mario, tell me a long story about Mushroom Kingdom tax law.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "mario",
        incognito: false,
        mode: "zen",
        botSystemPrompt: "You are Mario.",
        starterPromptLabel: "Mario",
      }
    );

    await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        botId: "crash",
        incognito: false,
        mode: "zen",
        botSystemPrompt: "You are Crash Bandicoot.",
        starterPromptLabel: "Crash Bandicoot",
        zenAutonomy: {
          source: "idle",
          activeBotId: "mario",
          idleMs: 10 * 60 * 1000,
          clientTurnId: "turn-switch",
        },
      },
      marioTurn.conversation.id
    );

    const marioMemories = listZenSessionMemories(
      db,
      "user-1",
      CHAT_TEST_USER_KEY,
      new Date(),
      { botId: "mario" }
    );
    assert.equal(marioMemories.length, 1);
    assert.match(marioMemories[0]?.text ?? "", /Mushroom Kingdom tax law/);
    assert.equal(
      listZenSessionMemories(db, "user-1", CHAT_TEST_USER_KEY, new Date(), {
        botId: "crash",
      }).length,
      0
    );
  });

  it("persists Zen Autonomy as one assistant row with Facet attribution", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, color, glyph) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-auto", "user-1", "Ruby", "#b11f2b", "spark");
    installChatFetchStub(
      [
        "Still here, if you want a thread to tug on.",
        "{\"askQuestion\":{\"prompt\":\"Pick?\",\"choices\":[\"A\",\"B\"]}}",
        "{\"sendGeneratedImage\":{\"prompt\":\"paint a secret room\"}}",
      ].join("\n")
    );

    const result = await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: true,
        botId: "bot-auto",
        incognito: false,
        mode: "zen",
        zenAutonomy: {
          source: "idle",
          activeBotId: "bot-auto",
          idleMs: 10 * 60 * 1000,
          clientTurnId: "turn-1",
        },
      }
    );

    assert.deepEqual(result.zenAutonomyDecision, {
      action: "speak",
      botId: "bot-auto",
    });
    assert.equal(result.conversation.botId, null);
    assert.equal(result.conversation.lastBotId, "bot-auto");
    assert.equal(result.conversation.lastBotColor, "#b11f2b");
    assert.equal(result.toolCalls, undefined);
    assert.equal(result.pendingImageJob, undefined);
    assert.deepEqual(
      result.conversation.messages.map((message) => ({
        role: message.role,
        botId: message.botId,
        askQuestion: message.askQuestion,
      })),
      [{ role: "assistant", botId: "bot-auto", askQuestion: undefined }]
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE role = 'user'").get() as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM memories").get() as { n: number }).n,
      0
    );
    assert.equal(
      (db.prepare("SELECT bot_id FROM conversations WHERE id = ?").get(
        result.conversation.id
      ) as { bot_id: string | null }).bot_id,
      null
    );
  });

  it("keeps PRISM/default Zen Autonomy attribution neutral", async () => {
    const db = createChatTestDb();
    installChatFetchStub("A quiet nudge from PRISM.");

    const result = await processChatMessage(
      db,
      "user-1",
      "",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: true,
        botId: null,
        incognito: false,
        mode: "zen",
        zenAutonomy: {
          source: "idle",
          activeBotId: null,
          idleMs: 12 * 60 * 1000,
          clientTurnId: "turn-2",
        },
      }
    );

    assert.deepEqual(result.zenAutonomyDecision, { action: "speak", botId: null });
    assert.equal(result.conversation.lastBotId, null);
    assert.equal(result.conversation.lastBotColor, null);
    assert.deepEqual(
      result.conversation.messages.map((message) => ({
        role: message.role,
        botId: message.botId,
      })),
      [{ role: "assistant", botId: null }]
    );
  });

  it("treats chat-disabled Facet autonomy decisions as silent", async () => {
    const db = createChatTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, chat_enabled, visibility) VALUES (?, ?, ?, ?, ?)"
    ).run("enabled-bot", "user-1", "Enabled", 1, "private");
    db.prepare(
      "INSERT INTO bots (id, user_id, name, chat_enabled, visibility) VALUES (?, ?, ?, ?, ?)"
    ).run("disabled-bot", "user-1", "Disabled", 0, "private");
    let routerPrompt = "";
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages) {
        routerPrompt = messages.map((message) => message.content).join("\n");
        return JSON.stringify({ action: "speak", botId: "disabled-bot" });
      },
    };

    const decision = await decideZenAutonomyTurn({
      db,
      userId: "user-1",
      conversationId: "conv-1",
      provider,
      activeBotId: null,
      idleMs: 10 * 60 * 1000,
    });

    assert.deepEqual(decision, { action: "silent" });
    assert.match(routerPrompt, /Enabled: enabled-bot/);
    assert.doesNotMatch(routerPrompt, /Disabled: disabled-bot/);
  });
});

describe("processChatMessage Zen cancellation cleanup", () => {
  it("removes a persisted first user message when the request is cancelled before a reply", async () => {
    const db = createChatTestDb();
    const controller = new AbortController();
    let markProviderFetchStarted: () => void = () => {};
    const providerFetchStarted = new Promise<void>((resolve) => {
      markProviderFetchStarted = resolve;
    });
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as { prompt?: string };
      if (url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      markProviderFetchStarted();
      const signal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        const rejectAbort = () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        };
        if (signal?.aborted) {
          rejectAbort();
          return;
        }
        signal?.addEventListener("abort", rejectAbort, { once: true });
      });
    }) as typeof fetch;

    const pending = processChatMessage(
      db,
      "user-1",
      "Please start then cancel.",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
        signal: controller.signal,
      }
    );

    await providerFetchStarted;
    controller.abort();
    await assert.rejects(pending, /abort|cancel/i);

    const messageCount = db
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?")
      .get("user-1") as { n: number };
    assert.equal(messageCount.n, 0);
    const conversationCount = db
      .prepare("SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?")
      .get("user-1") as { n: number };
    assert.equal(conversationCount.n, 0);
  });

  it("does not reuse a stale Zen conversation that has user text but no assistant reply", async () => {
    const db = createChatTestDb();
    installChatFetchStub("Fresh reply");
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, incognito, created_at, updated_at) VALUES (?, ?, ?, 'zen', 0, ?, ?)"
    ).run("stale-zen", "user-1", "Cancelled start", now, now);
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, 'user', ?, ?)"
    ).run("stale-user", "stale-zen", "user-1", "This was cancelled.", now);

    const result = await processChatMessage(
      db,
      "user-1",
      "Fresh start",
      CHAT_TEST_USER_KEY,
      {
        preferredProvider: "local",
        autoMemory: false,
        starterPrompt: false,
        incognito: false,
        mode: "zen",
      },
      "stale-zen"
    );

    assert.notEqual(result.conversation.id, "stale-zen");
    assert.deepEqual(
      result.conversation.messages
        .filter((message) => message.role === "user")
        .map((message) => message.content),
      ["Fresh start"]
    );
    const staleRows = db
      .prepare("SELECT content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
      .all("stale-zen") as Array<{ content: string }>;
    assert.deepEqual(
      staleRows.map((row) => row.content),
      ["This was cancelled."]
    );
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
        mode: "sandbox",
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
        mode: "sandbox",
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
