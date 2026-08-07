import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_ATMOSPHERE_IMAGE_PURPOSE,
  chatAtmosphereRetentionCutoffIso,
  chatAtmosphereUtcDate,
  composeChatAtmospherePrompt,
} from "./chatAtmosphere.ts";

describe("chatAtmosphere", () => {
  it("exports a dedicated image purpose", () => {
    assert.equal(CHAT_ATMOSPHERE_IMAGE_PURPOSE, "chat_atmosphere");
  });

  it("composes a prompt with bot identity and no transcript cues", () => {
    const prompt = composeChatAtmospherePrompt({
      botName: "Mira",
      botSystemPrompt: "A calm navigator who loves star charts.",
      variationSeed: "2026-08-06",
    });
    assert.match(prompt, /Mira/);
    assert.match(prompt, /star charts/);
    assert.match(prompt, /Variation seed: 2026-08-06/);
    assert.doesNotMatch(prompt, /transcript|message history|conversation so far/iu);
  });

  it("formats UTC date and retention cutoff", () => {
    const now = new Date("2026-08-06T15:00:00.000Z");
    assert.equal(chatAtmosphereUtcDate(now), "2026-08-06");
    assert.equal(
      chatAtmosphereRetentionCutoffIso(now, 3),
      "2026-08-03T15:00:00.000Z",
    );
  });
});
