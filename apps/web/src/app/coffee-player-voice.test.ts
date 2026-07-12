import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import {
  coffeePlayerEnglishEngine,
  coffeePlayerPlaybackProfile,
} from "./coffee-player-voice.ts";

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

  it("lets the global mode and volume remain authoritative", () => {
    const profile = coffeePlayerPlaybackProfile({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      v: 2,
      enabled: false,
      volume: 0,
      baseVoiceId: "voice-3",
    });
    assert.equal(profile.enabled, true);
    assert.equal(profile.volume, 1);
    assert.equal(profile.baseVoiceId, "voice-3");
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

  it("keeps player identity in Coffee settings and inherits the global mode", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const voiceSettings = source.slice(
      source.indexOf('activeSettingsScope === "voice"'),
      source.indexOf('activeSettingsScope === "coffee"')
    );
    const coffeeSettings = source.slice(
      source.indexOf('activeSettingsScope === "coffee"'),
      source.indexOf('activeSettingsScope === "zen"')
    );
    assert.doesNotMatch(voiceSettings, /Your table voice/);
    assert.doesNotMatch(voiceSettings, /playerNamePronunciation/);
    assert.match(coffeeSettings, /Your table voice/);
    assert.match(coffeeSettings, /Global voice · \{voiceModeDisplayName\(settings\.voiceMode\)\}/);
    assert.match(coffeeSettings, /settings\.voiceMode === "mute"/);
    assert.match(coffeeSettings, /settings\.voiceMode === "bottish"/);
    assert.match(coffeeSettings, /Your System Classic voice/);
    assert.match(coffeeSettings, /Your ElevenLabs voice/);
    assert.match(
      coffeeSettings,
      /previewSelectedVoice\(\s*coffeePlayerPlaybackProfile\(settings\.playerAudioVoiceProfile\)/
    );
    assert.match(
      source,
      /async function saveCoffeeModeSettings[\s\S]*?playerAudioVoiceProfile:[\s\S]*?playerNamePronunciation:/
    );
    const voiceSave = source.slice(
      source.indexOf("async function saveVoiceSettings"),
      source.indexOf("async function previewSelectedVoice")
    );
    assert.doesNotMatch(voiceSave, /playerAudioVoiceProfile|playerNamePronunciation/);
  });
});
