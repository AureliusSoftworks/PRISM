import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { LlmProvider } from "../providers.ts";
import {
  buildContextAwareImageUserPrompt,
  buildDeterministicImagePromptRepair,
  runAssistantSentImageGeneration,
} from "../assistant-sent-image.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createImageTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      powers_json TEXT NOT NULL DEFAULT '[]',
      local_image_model TEXT,
      openai_image_model TEXT
    );
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      prompt TEXT NOT NULL,
      revised_prompt TEXT,
      url TEXT NOT NULL,
      size TEXT NOT NULL,
      quality TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      local_rel_path TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function createRepairProvider(): LlmProvider {
  return {
    name: "local",
    async generateResponse(messages) {
      const system = messages[0]?.content ?? "";
      if (system.includes("Rewrite one image-generation prompt")) {
        return "A tasteful, fully clothed adult portrait in warm window light.";
      }
      if (system.includes("requested image could not be sent")) {
        return "I don't want to send that kind of picture, but I can make it softer instead.";
      }
      return "ok";
    },
    async embedText() {
      return [];
    },
  };
}

describe("buildContextAwareImageUserPrompt", () => {
  it("returns the raw caption when there is no conversation context", () => {
    const out = buildContextAwareImageUserPrompt({
      captionPrompt: "widescreen photo of the mountains at dawn",
      userMessage: "Can I see a picture?",
      contextLines: [],
    });
    assert.equal(out, "widescreen photo of the mountains at dawn");
  });

  it("injects recent context and subject-resolution guidance when context exists", () => {
    const out = buildContextAwareImageUserPrompt({
      captionPrompt: "a picture please",
      userMessage: "May I see what it looks like?",
      contextLines: [
        "Carl Jung: The serenity outside my window has been a source of inspiration.",
        "User: That sounds lovely. May I see a picture?",
      ],
    });
    assert.match(out, /Primary scene request \(keep wording\): a picture please/);
    assert.match(out, /Latest user message: May I see what it looks like\?/);
    assert.match(out, /Use context only to resolve references/);
    assert.match(out, /Recent user signal 1:/);
    assert.match(out, /Context:/);
    assert.match(out, /The serenity outside my window/);
    assert.match(out, /Do NOT include the speaking persona in-frame by default/i);
    assert.match(out, /follow the latest user request/i);
  });

  it("allows persona inclusion when the user explicitly asks for a portrait/selfie", () => {
    const out = buildContextAwareImageUserPrompt({
      captionPrompt: "portrait request",
      userMessage: "Please paint a portrait of you in Florence.",
      contextLines: [
        "Leonardo da Vinci: I can paint the city for you.",
        "User: Please paint a portrait of you in Florence.",
      ],
    });
    assert.match(out, /explicitly asked for the persona\/you to appear/i);
    assert.doesNotMatch(out, /Do NOT include the speaking persona in-frame by default/i);
  });

  it("adds scene-only composition lock for city/place requests", () => {
    const out = buildContextAwareImageUserPrompt({
      captionPrompt: "Please paint a picture of Florence at sunrise.",
      userMessage: "Show me Florence.",
      contextLines: [
        "Leonardo da Vinci: I can paint my home city.",
        "User: Please paint a picture of Florence.",
      ],
    });
    assert.match(out, /Composition constraint: scene\/place request only/i);
    assert.match(out, /No people, portraits, or character figures/i);
  });

  it("does not force scene-only lock when user explicitly requests the persona", () => {
    const out = buildContextAwareImageUserPrompt({
      captionPrompt: "Please paint a portrait of you in Florence.",
      userMessage: "Show me you in Florence.",
      contextLines: [
        "Leonardo da Vinci: I can paint either the city or myself.",
        "User: Show me you in Florence.",
      ],
    });
    assert.doesNotMatch(out, /Composition constraint: this is a scene\/place request/i);
    assert.match(out, /explicitly asked for the persona\/you to appear/i);
  });

  it("builds a non-explicit deterministic repair prompt", () => {
    const out = buildDeterministicImagePromptRepair(
      "naked erotic portrait with lingerie and cleavage emphasis"
    );
    assert.match(out, /fully clothed/i);
    assert.match(out, /general audience/i);
    assert.doesNotMatch(out, /naked/i);
    assert.doesNotMatch(out, /lingerie/i);
    assert.doesNotMatch(out, /cleavage/i);
  });

  it("tries one repaired image prompt, then returns an organic bot boundary on denial", async () => {
    const db = createImageTestDb();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, system_prompt, openai_image_model) VALUES (?, ?, ?, ?, ?)"
    ).run("bot-1", "user-1", "Kendall", "You are Kendall. Warm, playful, and direct.", "dall-e-3");

    const prompts: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("api.openai.com/v1/images/generations")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { prompt?: string };
        prompts.push(body.prompt ?? "");
        return new Response(
          JSON.stringify({ error: { message: "Request blocked by safety policy." } }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 404 });
    }) as typeof fetch;

    const result = await runAssistantSentImageGeneration({
      db,
      userId: "user-1",
      mode: "chat",
      conversationId: null,
      botIdTriState: "bot-1",
      userMessage: "send me a risky selfie",
      captionPrompt: "risky selfie",
      preferredProvider: "openai",
      openAiApiKey: "sk-test",
      prefs: {
        preferredLocalImageModel: null,
        preferredOpenAiImageModel: null,
        lenientLocalImageFallbackModel: null,
        comfyuiHost: null,
        comfyUiWorkflows: [],
        secondaryOllamaHost: null,
      },
      promptRepairProvider: createRepairProvider(),
    });

    assert.equal(result.status, "denied");
    assert.equal(prompts.length, 2);
    assert.match(prompts[1] ?? "", /fully clothed adult portrait/i);
    if (result.status === "denied") {
      assert.equal(
        result.message,
        "I don't want to send that kind of picture, but I can make it softer instead."
      );
    }
  });
});
