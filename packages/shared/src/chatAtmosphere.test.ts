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

  it("uses a primary-majority palette with explicit or Auto Atmosphere accent", () => {
    const explicit = composeChatAtmospherePrompt({
      botName: "Mira",
      botSystemPrompt: "A calm navigator.",
      primaryColor: "#ff0000",
      accentColor: "#00ff00",
      variationSeed: "explicit",
    });
    const auto = composeChatAtmospherePrompt({
      botName: "Mira",
      botSystemPrompt: "A calm navigator.",
      primaryColor: "#ff0000",
      accentColor: null,
      variationSeed: "auto",
    });
    assert.match(explicit, /primary #ff0000 as the majority palette/u);
    assert.match(explicit, /Atmosphere accent #00ff00/u);
    assert.match(auto, /Atmosphere accent #ffdd00/u);
    assert.match(explicit, /do not default to a literal two-color gradient/u);
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
