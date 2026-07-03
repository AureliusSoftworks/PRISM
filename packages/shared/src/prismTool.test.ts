import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hydrateAssistantMessageParts,
  parseAssistantPrismTools,
  parseStoredAssistantToolPayload,
  parseStoredToolPayload,
  PRISM_TOOL_END,
  PRISM_TOOL_START,
  serializeAssistantToolPayload,
  serializeAskQuestionTool,
  type AskQuestionPayload,
  type CoffeeAmbientActionPayload,
  type CoffeeReplayEventPayload,
  type CoffeeUserActionPayload,
  type WebSearchPayload,
} from "./prismTool.ts";

function validAskJson(): AskQuestionPayload {
  return {
    v: 1,
    name: "AskQuestion",
    prompt: "Pick a mood.",
    options: [
      { id: "a", label: "🟢 Bright" },
      { id: "b", label: "🟡 Moody" },
      { id: "c", label: "🔴 Raw" },
    ],
  };
}

function validWebSearchPayload(): WebSearchPayload {
  return {
    v: 1,
    name: "WebSearch",
    provider: "brave",
    query: "latest local-first AI workspace news",
    fetchedAt: "2026-06-29T20:00:00.000Z",
    results: [
      {
        title: "Local-first AI workspaces gain traction",
        url: "https://example.com/local-first-ai",
        displayUrl: "example.com/local-first-ai",
        source: "Example News",
        snippet: "Teams are blending local models with optional online search.",
        thumbnailUrl: "https://example.com/thumb.jpg",
        faviconUrl: "https://example.com/favicon.ico",
        publishedAt: "2026-06-29",
      },
    ],
  };
}

describe("parseAssistantPrismTools", () => {
  it("returns display-only prose when no tool block is present", () => {
    const raw = "Just chatting.\nNo tools here.";
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, raw);
    assert.equal(out.askQuestion, undefined);
  });

  it("strips incomplete tool tails when the closing delimiter is missing", () => {
    const raw = `Hello.\n${PRISM_TOOL_START}\n{"v":1`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, "Hello.");
    assert.equal(out.askQuestion, undefined);
  });

  it("parses a valid envelope and trims display prose", () => {
    const inner = serializeAskQuestionTool(validAskJson());
    const raw = `Opening line.\n\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, "Opening line.");
    assert.deepEqual(out.askQuestion, validAskJson());
  });

  it("tolerates spaces inside delimiter tokens and inline JSON (common LM output)", () => {
    const inner = serializeAskQuestionTool(validAskJson());
    const raw = `One short paragraph reply. <<< PRISM_TOOL >>> ${inner} <<< END_PRISM_TOOL >>>`;
    const out = parseAssistantPrismTools(raw);
    assert.match(out.displayContent.trimEnd(), /One short paragraph reply\.\s*$/);
    assert.deepEqual(out.askQuestion, validAskJson());
  });

  it("parses AskQuestion JSON wrapped in markdown code fences inside the tool block", () => {
    const inner = `\`\`\`json\n${serializeAskQuestionTool(validAskJson())}\n\`\`\``;
    const raw = `Thoughts below.\n\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "Thoughts below.");
    assert.deepEqual(out.askQuestion, validAskJson());
  });

  it("drops invalid JSON but still strips markers (no chips)", () => {
    const raw = `Hi.\n${PRISM_TOOL_START}\nnot-json\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, "Hi.");
    assert.equal(out.askQuestion, undefined);
  });

  it("drops wrong option counts", () => {
    const inner = JSON.stringify({
      v: 1,
      name: "AskQuestion",
      prompt: "x",
      options: [{ id: "a", label: "one" }],
    });
    const raw = `P.\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, "P.");
    assert.equal(out.askQuestion, undefined);
  });

  it("accepts binary yes/no AskQuestion options", () => {
    const inner = JSON.stringify({
      v: 1,
      name: "AskQuestion",
      prompt: "Would you like a copy of that to download?",
      options: [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ],
    });
    const raw = `P.\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, "P.");
    assert.deepEqual(out.askQuestion, {
      v: 1,
      name: "AskQuestion",
      prompt: "Would you like a copy of that to download?",
      options: [
        { id: "a", label: "Yes" },
        { id: "b", label: "No" },
      ],
    });
  });

  it("accepts four options and normalizes to a/b/c/d chips", () => {
    const inner = JSON.stringify({
      v: 1,
      name: "AskQuestion",
      prompt: "Pick one",
      options: [
        { id: "x", label: "First" },
        { id: "y", label: "Second" },
        { id: "z", label: "Third" },
        { id: "w", label: "Fourth" },
      ],
    });
    const raw = `P.\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, "P.");
    assert.deepEqual(out.askQuestion, {
      v: 1,
      name: "AskQuestion",
      prompt: "Pick one",
      options: [
        { id: "a", label: "First" },
        { id: "b", label: "Second" },
        { id: "c", label: "Third" },
        { id: "d", label: "Fourth" },
      ],
    });
  });

  it("accepts loose AskQuestion payload variants from different models", () => {
    const inner = JSON.stringify({
      v: "1",
      name: "askquestion",
      question: "Choose one path",
      options: ["First", "Second", "Third"],
    });
    const raw = `P.\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, "P.");
    assert.deepEqual(out.askQuestion, {
      v: 1,
      name: "AskQuestion",
      prompt: "Choose one path",
      options: [
        { id: "a", label: "First" },
        { id: "b", label: "Second" },
        { id: "c", label: "Third" },
      ],
    });
  });

  it("accepts option text fields when labels are missing", () => {
    const inner = JSON.stringify({
      name: "AskQuestion",
      prompt: "Pick a mode",
      options: [{ text: "Fast" }, { text: "Balanced" }, { text: "Deep" }],
    });
    const raw = `P.\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, "P.");
    assert.deepEqual(out.askQuestion?.options, [
      { id: "a", label: "Fast" },
      { id: "b", label: "Balanced" },
      { id: "c", label: "Deep" },
    ]);
  });

  it("prefers the last complete block when several opens appear", () => {
    const first = serializeAskQuestionTool({
      ...validAskJson(),
      prompt: "first",
    });
    const second = serializeAskQuestionTool({
      ...validAskJson(),
      prompt: "second",
      options: [
        { id: "x", label: "A" },
        { id: "y", label: "B" },
        { id: "z", label: "C" },
      ],
    });
    const raw =
      `${PRISM_TOOL_START}\n${first}\n${PRISM_TOOL_END} noise ` +
      `${PRISM_TOOL_START}\n${second}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.match(out.displayContent, /noise$/);
    assert.equal(out.askQuestion?.prompt, "second");
  });

  it("parses sendGeneratedImage request without AskQuestion", () => {
    const inner = JSON.stringify({
      v: 1,
      sendGeneratedImage: { prompt: "A red balloon over calm water at sunset." },
    });
    const raw = `Here you go.\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "Here you go.");
    assert.equal(out.askQuestion, undefined);
    assert.deepEqual(out.sendGeneratedImage, {
      prompt: "A red balloon over calm water at sunset.",
    });
  });

  it("parses envelope with AskQuestion and sendGeneratedImage together", () => {
    const inner = JSON.stringify({
      v: 1,
      askQuestion: validAskJson(),
      sendGeneratedImage: { prompt: "Soft watercolor hillside." },
    });
    const raw = `Two things.\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.deepEqual(out.askQuestion, validAskJson());
    assert.deepEqual(out.sendGeneratedImage, { prompt: "Soft watercolor hillside." });
  });

  it("parses a WebSearch request from assistant tool JSON", () => {
    const inner = JSON.stringify({
      v: 1,
      webSearch: { query: "latest Brave Search API docs" },
    });
    const raw = `Let me check.\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "Let me check.");
    assert.deepEqual(out.webSearch, {
      v: 1,
      name: "WebSearch",
      query: "latest Brave Search API docs",
    });
  });

  it("parses flat WebSearch tool JSON for model compatibility", () => {
    const inner = JSON.stringify({
      v: 1,
      name: "WebSearch",
      query: "current OpenAI API models",
    });
    const raw = `Checking.\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.deepEqual(out.webSearch, {
      v: 1,
      name: "WebSearch",
      query: "current OpenAI API models",
    });
  });

  it("parses tellFictionalStory story action rail metadata", () => {
    const inner = JSON.stringify({
      v: 1,
      tellFictionalStory: {
        v: 1,
        name: "tellFictionalStory",
        continueLabel: "Please, do continue...",
        bookmarkLabel: "Mark this page",
        finishLabel: "Bring it home",
      },
    });
    const raw = `The lantern guttered at the stair.\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "The lantern guttered at the stair.");
    assert.deepEqual(out.tellFictionalStory, {
      v: 1,
      name: "tellFictionalStory",
      continueLabel: "Please, do continue...",
      bookmarkLabel: "Mark this page",
      finishLabel: "Bring it home",
    });
  });

  it("strips outer markdown fences that wrapped the Prism tool block", () => {
    const inner = JSON.stringify({
      v: 1,
      sendGeneratedImage: { prompt: "A blue door." },
    });
    const raw = `Thoughts pending.\n\n\`\`\`json\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}\n\`\`\`\n`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "Thoughts pending.");
    assert.deepEqual(out.sendGeneratedImage, { prompt: "A blue door." });
  });

  it("parses sendGeneratedImage inside a standalone markdown fence (no Prism delimiters)", () => {
    const inner = JSON.stringify({
      v: 1,
      sendGeneratedImage: { prompt: "Neon alley in rain." },
    });
    const raw = `Here you go.\n\n\`\`\`json\n${inner}\n\`\`\`\n`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "Here you go.");
    assert.deepEqual(out.sendGeneratedImage, { prompt: "Neon alley in rain." });
  });

  it("parses trailing bare JSON (no Prism delimiters, no markdown fence)", () => {
    const inner = JSON.stringify({
      v: 1,
      sendGeneratedImage: { prompt: "Cartoon plankton in a lab coat." },
    });
    const raw = `Portrait time.\n${inner}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "Portrait time.");
    assert.deepEqual(out.sendGeneratedImage, { prompt: "Cartoon plankton in a lab coat." });
  });

  it("parses LM-style <|sendGeneratedImage|> with flat {prompt} (same line as prose)", () => {
    const json = '{"prompt":"Sheldon J. Plankton in a lab coat."}';
    const raw = `Here is a treat. <|sendGeneratedImage|>${json}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "Here is a treat.");
    assert.deepEqual(out.sendGeneratedImage, { prompt: "Sheldon J. Plankton in a lab coat." });
  });

  it("parses spaced <| sendGeneratedImage |> with flat prompt and optional v", () => {
    const json = '{"v":"1","prompt":"Neon city."}';
    const raw = `Done.\n<| sendGeneratedImage |>\n${json}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "Done.");
    assert.deepEqual(out.sendGeneratedImage, { prompt: "Neon city." });
  });

  it("parses <|sendGeneratedImage|> with full Prism envelope JSON", () => {
    const inner = JSON.stringify({
      v: 1,
      sendGeneratedImage: { prompt: "Full envelope path." },
    });
    const raw = `Image follows.<|sendGeneratedImage|>${inner}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "Image follows.");
    assert.deepEqual(out.sendGeneratedImage, { prompt: "Full envelope path." });
  });

  it("does not coerce flat JSON with extra keys after <|sendGeneratedImage|>", () => {
    const json = '{"prompt":"x","extra":1}';
    const raw = `Hi.<|sendGeneratedImage|>${json}`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, raw);
    assert.equal(out.sendGeneratedImage, undefined);
  });

  it("does not strip <|sendGeneratedImage|> when following JSON is invalid", () => {
    const raw = "Hello.<|sendGeneratedImage|>{not valid json";
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, raw);
    assert.equal(out.sendGeneratedImage, undefined);
  });

  it("parses sendGeneratedImage inside XML-style <PRISM_TOOL>…</PRISM_TOOL> (common model mistake)", () => {
    const inner = JSON.stringify({
      v: 1,
      sendGeneratedImage: {
        prompt: "Sheldon J. Plankton, a small green copepod with a single large eye.",
      },
    });
    const raw = `Sure thing!\n<PRISM_TOOL> ${inner} </PRISM_TOOL>`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "Sure thing!");
    assert.deepEqual(out.sendGeneratedImage, {
      prompt: "Sheldon J. Plankton, a small green copepod with a single large eye.",
    });
  });

  it("parses XML-style Prism tags case-insensitively", () => {
    const inner = JSON.stringify({
      v: 1,
      sendGeneratedImage: { prompt: "A red door." },
    });
    const raw = `Hi.\n<Prism_Tool>\n${inner}\n</Prism_Tool>`;
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "Hi.");
    assert.deepEqual(out.sendGeneratedImage, { prompt: "A red door." });
  });

  it("strips incomplete XML-style tool tails when closing tag is missing", () => {
    const raw = "Hello.\n<PRISM_TOOL>\n{\"v\":1";
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent, "Hello.");
    assert.equal(out.sendGeneratedImage, undefined);
  });

  it("strips XML-style block with non-JSON inner (no brace) without treating as tool", () => {
    const raw = "Note.\n<PRISM_TOOL>not json at all</PRISM_TOOL>";
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "Note.");
    assert.equal(out.askQuestion, undefined);
    assert.equal(out.sendGeneratedImage, undefined);
  });

  it("strips and parses zenDisplay-only tool blocks", () => {
    const raw = [
      "...",
      PRISM_TOOL_START,
      JSON.stringify({
        v: 1,
        zenDisplay: {
          v: 1,
          lines: [
            { index: 0, x: 0.5, y: 0.24, align: "center" },
            { index: 2, x: 0.5, y: 0.5, align: "center" },
          ],
        },
      }),
      PRISM_TOOL_END,
    ].join("\n");
    const out = parseAssistantPrismTools(raw);
    assert.equal(out.displayContent.trim(), "...");
    assert.deepEqual(out.zenDisplay, {
      v: 1,
      lines: [
        { index: 0, x: 0.5, y: 0.24, align: "center" },
        { index: 2, x: 0.5, y: 0.5, align: "center" },
      ],
    });
  });
});

describe("hydrateAssistantMessageParts", () => {
  it("re-parses tool framing from persisted content when tool_payload missing", () => {
    const payload = validAskJson();
    const inner = serializeAskQuestionTool(payload);
    const leaky = `Visible.\n<<< PRISM_TOOL >>>\n${inner}\n<<< END_PRISM_TOOL >>>`;
    const h = hydrateAssistantMessageParts({
      content: leaky,
      toolPayload: undefined,
    });
    assert.equal(h.content, "Visible.");
    assert.deepEqual(h.askQuestion, payload);
  });

  it("strips XML-style sendGeneratedImage stub from content when tool_payload is absent", () => {
    const inner = JSON.stringify({
      v: 1,
      sendGeneratedImage: { prompt: "A sleepy cat." },
    });
    const leaky = `Sure.\n<PRISM_TOOL>${inner}</PRISM_TOOL>`;
    const h = hydrateAssistantMessageParts({ content: leaky, toolPayload: undefined });
    assert.equal(h.content.trim(), "Sure.");
    assert.equal(h.sentGeneratedImage, undefined);
  });

  it("re-parses fenced JSON inside tool framing when tool_payload missing", () => {
    const payload = validAskJson();
    const inner = `\`\`\`json\n${serializeAskQuestionTool(payload)}\n\`\`\``;
    const leaky = `Hi.\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const h = hydrateAssistantMessageParts({ content: leaky, toolPayload: null });
    assert.equal(h.content.trim(), "Hi.");
    assert.deepEqual(h.askQuestion, payload);
  });

  it("surfaces persisted sentGeneratedImage from tool_payload without model stubs", () => {
    const stored = JSON.stringify({
      v: 1,
      sentGeneratedImage: {
        imageId: "img1",
        displayUrl: "/api/images/img1/file",
        prompt: "A sleepy cat.",
      },
    });
    const h = hydrateAssistantMessageParts({
      content: "Hello.",
      toolPayload: stored,
    });
    assert.deepEqual(h.sentGeneratedImage, {
      imageId: "img1",
      displayUrl: "/api/images/img1/file",
      prompt: "A sleepy cat.",
    });
  });

  it("preserves imageModel on persisted sentGeneratedImage payloads", () => {
    const stored = JSON.stringify({
      v: 1,
      sentGeneratedImage: {
        imageId: "img2",
        displayUrl: "/api/images/img2/file",
        prompt: "A red door.",
        imageModel: "comfyui-remote:user/workflows/x.json",
      },
    });
    const h = hydrateAssistantMessageParts({
      content: "Here.",
      toolPayload: stored,
    });
    assert.deepEqual(h.sentGeneratedImage, {
      imageId: "img2",
      displayUrl: "/api/images/img2/file",
      prompt: "A red door.",
      imageModel: "comfyui-remote:user/workflows/x.json",
    });
  });

  it("strips leaky fenced JSON from persisted content while keeping attachment metadata", () => {
    const leak = '{"v":1,"sendGeneratedImage":{"prompt":"A sleepy cat."}}';
    const content = `Sure thing.\n\n\`\`\`json\n${leak}\n\`\`\`\n`;
    const stored = JSON.stringify({
      v: 1,
      sentGeneratedImage: {
        imageId: "abc",
        displayUrl: "/api/images/abc/file",
        prompt: "A sleepy cat.",
      },
    });
    const h = hydrateAssistantMessageParts({ content, toolPayload: stored });
    assert.equal(h.content.trim(), "Sure thing.");
    assert.equal(h.sentGeneratedImage?.imageId, "abc");
  });

  it("strips trailing bare tool JSON from persisted content while keeping attachment metadata", () => {
    const leak = '{"v":1,"sendGeneratedImage":{"prompt":"A sleepy cat."}}';
    const content = `Sure thing.\n\n${leak}`;
    const stored = JSON.stringify({
      v: 1,
      sentGeneratedImage: {
        imageId: "abc2",
        displayUrl: "/api/images/abc2/file",
        prompt: "A sleepy cat.",
      },
    });
    const h = hydrateAssistantMessageParts({ content, toolPayload: stored });
    assert.equal(h.content.trim(), "Sure thing.");
    assert.equal(h.sentGeneratedImage?.imageId, "abc2");
  });

  it("strips legacy <|sendGeneratedImage|> stub from persisted content while keeping attachment metadata", () => {
    const leak = '<|sendGeneratedImage|>{"prompt":"A sleepy cat."}';
    const content = `Sure thing.\n${leak}`;
    const stored = JSON.stringify({
      v: 1,
      sentGeneratedImage: {
        imageId: "abc3",
        displayUrl: "/api/images/abc3/file",
        prompt: "A sleepy cat.",
      },
    });
    const h = hydrateAssistantMessageParts({ content, toolPayload: stored });
    assert.equal(h.content.trim(), "Sure thing.");
    assert.equal(h.sentGeneratedImage?.imageId, "abc3");
  });

  it("hydrates persisted zenDisplay metadata from tool_payload", () => {
    const stored = serializeAssistantToolPayload({
      moodKey: "neutral",
      moodConfidence: 0.7,
      zenDisplay: {
        v: 1,
        placement: { x: 0.3, y: 0.62, align: "end" },
      },
    });
    const h = hydrateAssistantMessageParts({
      content: "Yes.",
      toolPayload: stored,
    });
    assert.deepEqual(h.zenDisplay, {
      v: 1,
      placement: { x: 0.3, y: 0.62, align: "end" },
    });
  });

  it("hydrates persisted WebSearch result cards from tool_payload", () => {
    const webSearch = validWebSearchPayload();
    const stored = serializeAssistantToolPayload({ webSearch });
    const h = hydrateAssistantMessageParts({
      content: "Fresh context.",
      toolPayload: stored,
    });
    assert.equal(h.content, "Fresh context.");
    assert.deepEqual(h.webSearch, webSearch);
  });

  it("hydrates persisted Coffee ambient actions from tool_payload", () => {
    const coffeeAmbientAction: CoffeeAmbientActionPayload = {
      v: 1,
      name: "coffeeAmbientAction",
      source: "scripted",
      category: "sip",
      action: "takes a quiet sip",
    };
    const stored = serializeAssistantToolPayload({ coffeeAmbientAction });
    assert.deepEqual(parseStoredAssistantToolPayload(stored).coffeeAmbientAction, coffeeAmbientAction);
    const h = hydrateAssistantMessageParts({
      content: "That tracks.",
      toolPayload: stored,
    });
    assert.equal(h.content, "That tracks.");
    assert.deepEqual(h.coffeeAmbientAction, coffeeAmbientAction);
  });

  it("hydrates persisted Coffee user actions from tool_payload", () => {
    const coffeeUserAction: CoffeeUserActionPayload = {
      v: 1,
      name: "coffeeUserAction",
      source: "user",
      action: "leans back and folds arms",
      occurredAt: "2026-07-02T15:00:00.000Z",
    };
    const stored = serializeAssistantToolPayload({ coffeeUserAction });
    assert.deepEqual(parseStoredAssistantToolPayload(stored).coffeeUserAction, coffeeUserAction);
    const h = hydrateAssistantMessageParts({
      content: "*leans back and folds arms*",
      toolPayload: stored,
    });
    assert.equal(h.content, "*leans back and folds arms*");
    assert.deepEqual(h.coffeeUserAction, coffeeUserAction);
  });

  it("hydrates persisted Coffee replay events from tool_payload", () => {
    const coffeeReplayEvents: CoffeeReplayEventPayload[] = [
      {
        v: 1,
        name: "coffeeReplayEvent",
        kind: "arrival",
        botId: "bot-1",
        occurredAt: "2026-07-02T15:00:00.000Z",
        walkDurationMs: 3200,
        nameplateDelayMs: 3800,
      },
      {
        v: 1,
        name: "coffeeReplayEvent",
        kind: "topOff",
        botId: "bot-1",
        occurredAt: "2026-07-02T15:01:00.000Z",
        progressBefore: 0.7,
        progressAfter: 0.2,
        toppedOffAt: "2026-07-02T15:01:00.000Z",
      },
    ];
    const stored = serializeAssistantToolPayload({ coffeeReplayEvents });

    assert.deepEqual(
      parseStoredAssistantToolPayload(stored).coffeeReplayEvents,
      coffeeReplayEvents
    );
    assert.deepEqual(
      hydrateAssistantMessageParts({
        content: "",
        toolPayload: stored,
      }).coffeeReplayEvents,
      coffeeReplayEvents
    );
  });
});

describe("parseStoredToolPayload / serializeAskQuestionTool", () => {
  it("round-trips SQLite JSON", () => {
    const payload = validAskJson();
    const serialized = serializeAskQuestionTool(payload);
    assert.deepEqual(parseStoredToolPayload(serialized), payload);
    assert.equal(parseStoredToolPayload(null), undefined);
    assert.equal(parseStoredToolPayload(""), undefined);
  });

  it("sanitizes zenDisplay coordinates and align aliases", () => {
    const stored = JSON.stringify({
      v: 1,
      zenDisplay: {
        v: 1,
        placement: { x: -1, y: 2, align: "middle" },
        lines: [
          { index: 1, x: 0.3333, y: 0.6666, align: "right" },
          { index: -1, x: 0.5, y: 0.5, align: "center" },
        ],
      },
    });
    assert.deepEqual(parseStoredAssistantToolPayload(stored).zenDisplay, {
      v: 1,
      placement: { x: 0, y: 1, align: "center" },
      lines: [{ index: 1, x: 0.333, y: 0.667, align: "end" }],
    });
  });

  it("hydrates stored tellFictionalStory metadata", () => {
    const stored = JSON.stringify({
      v: 1,
      tellFictionalStory: {
        v: 1,
        name: "tellFictionalStory",
        continueLabel: "Yes, then what?",
      },
    });
    assert.deepEqual(parseStoredAssistantToolPayload(stored).tellFictionalStory, {
      v: 1,
      name: "tellFictionalStory",
      continueLabel: "Yes, then what?",
    });
  });

  it("rejects malformed stored WebSearch payloads", () => {
    const stored = JSON.stringify({
      v: 1,
      webSearch: {
        v: 1,
        name: "WebSearch",
        provider: "brave",
        query: "news",
        fetchedAt: "2026-06-29T20:00:00.000Z",
        results: [{ title: "No URL" }],
      },
    });
    assert.equal(parseStoredAssistantToolPayload(stored).webSearch, undefined);
  });
});
