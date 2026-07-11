import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { coffeePlayerEnglishEngine } from "./coffee-player-voice.ts";

describe("Coffee player voice", () => {
  it("keeps every LOCAL or offline-protected table on System Classic", () => {
    assert.equal(coffeePlayerEnglishEngine({
      accountProvider: "openai",
      coffeeProvider: "local",
      offlineProtectedBotPresent: false,
      selectedEngine: "elevenlabs",
    }), "builtin");
    assert.equal(coffeePlayerEnglishEngine({
      accountProvider: "openai",
      coffeeProvider: "openai",
      offlineProtectedBotPresent: true,
      selectedEngine: "elevenlabs",
    }), "builtin");
  });

  it("allows the selected online engine only for an online table", () => {
    assert.equal(coffeePlayerEnglishEngine({
      accountProvider: "openai",
      coffeeProvider: "openai",
      offlineProtectedBotPresent: false,
      selectedEngine: "elevenlabs",
    }), "elevenlabs");
  });

  it("wires player settings and submitted Coffee speech into the page", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(source, /Your table voice/);
    assert.match(source, /Name pronunciation/);
    assert.match(source, /startCoffeePlayerVoiceForReveal\(trimmed\)/);
    assert.match(source, /settings\.voiceMode === "mute"/);
    assert.match(source, /enqueueBottishVoice\([\s\S]*?coffee-player:/);
    assert.match(
      source,
      /await startCoffeePlayerVoiceForReveal\(trimmed\)[\s\S]*?setCoffeeUserRevealText\(trimmed\)/
    );
    assert.match(source, /playerAudioVoiceProfile/);
  });
});
