import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hydrateAssistantMessageParts,
  parseAssistantPrismTools,
  parseStoredToolPayload,
  PRISM_TOOL_END,
  PRISM_TOOL_START,
  serializeAskQuestionTool,
  type AskQuestionPayload,
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

  it("accepts extra options and normalizes to a/b/c chips", () => {
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

  it("re-parses fenced JSON inside tool framing when tool_payload missing", () => {
    const payload = validAskJson();
    const inner = `\`\`\`json\n${serializeAskQuestionTool(payload)}\n\`\`\``;
    const leaky = `Hi.\n${PRISM_TOOL_START}\n${inner}\n${PRISM_TOOL_END}`;
    const h = hydrateAssistantMessageParts({ content: leaky, toolPayload: null });
    assert.equal(h.content.trim(), "Hi.");
    assert.deepEqual(h.askQuestion, payload);
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
});
