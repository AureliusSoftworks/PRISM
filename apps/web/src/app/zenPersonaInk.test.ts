import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ZEN_PERSONA_DEFAULT_INK_COLOR,
  buildZenPersonaInkSegmentMap,
  buildZenPersonaInkSegments,
  countZenPrismUserMessages,
} from "./zenPersonaInk.ts";

describe("buildZenPersonaInkSegments", () => {
  it("maps Persona/default turns across user and assistant wash bands", () => {
    const segments = buildZenPersonaInkSegments([
      { id: "u1", role: "user" },
      {
        id: "a1",
        role: "assistant",
        botId: "mr-krabs",
        botColor: "#dd1b2f",
      },
      {
        id: "a2",
        role: "assistant",
        botId: null,
        botColor: null,
      },
      {
        id: "a3",
        role: "assistant",
        botId: "patrick",
        botColor: "#ff7ac8",
      },
    ]);

    assert.deepEqual(segments, [
      {
        messageId: "u1",
        role: "user",
        botId: "mr-krabs",
        color: "#dd1b2f",
        variant: "persona",
      },
      {
        messageId: "a1",
        role: "assistant",
        botId: "mr-krabs",
        color: "#dd1b2f",
        variant: "persona",
      },
      {
        messageId: "a2",
        role: "assistant",
        botId: null,
        color: ZEN_PERSONA_DEFAULT_INK_COLOR,
        variant: "default",
      },
      {
        messageId: "a3",
        role: "assistant",
        botId: "patrick",
        color: "#ff7ac8",
        variant: "persona",
      },
    ]);
  });

  it("handles restored message windows without needing previous hidden turns", () => {
    const segments = buildZenPersonaInkSegments([
      { id: "a9", role: "assistant", botId: null },
      { id: "u10", role: "user" },
      { id: "a10", role: "assistant", botId: "harry", botColor: "#b11f2b" },
    ]);

    assert.deepEqual(segments.map((segment) => segment.messageId), ["a9", "u10", "a10"]);
    assert.equal(segments[0]!.variant, "default");
    assert.equal(segments[1]!.botId, "harry");
    assert.equal(segments[2]!.botId, "harry");
  });

  it("uses the trailing target for an in-flight user turn", () => {
    const segments = buildZenPersonaInkSegments(
      [{ id: "u1", role: "user" }],
      { trailingUserTarget: { botId: "sandy", color: "#c28f2c" } }
    );

    assert.deepEqual(segments, [
      {
        messageId: "u1",
        role: "user",
        botId: "sandy",
        color: "#c28f2c",
        variant: "persona",
      },
    ]);
  });
});

describe("buildZenPersonaInkSegmentMap", () => {
  it("keys segments by assistant message id", () => {
    const map = buildZenPersonaInkSegmentMap([
      { id: "a1", role: "assistant", botId: "bot-a", botColor: "#123456" },
    ]);

    assert.equal(map.get("a1")?.color, "#123456");
    assert.equal(map.has("missing"), false);
  });
});

describe("countZenPrismUserMessages", () => {
  it("counts only user messages addressed to default Prism", () => {
    assert.equal(
      countZenPrismUserMessages([
        { id: "u1", role: "user", botId: "bot-a", botColor: "#123456" },
        { id: "a1", role: "assistant", botId: "bot-a", botColor: "#123456" },
        { id: "u2", role: "user", botId: null },
        { id: "a2", role: "assistant", botId: null },
      ]),
      1
    );
  });
});
