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

  it("uses Default Prism for submitted and replayed Coffee speech", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(source, /startCoffeePlayerVoiceForReveal\(trimmed\)/);
    assert.match(source, /settings\.voiceMode === "mute"/);
    assert.match(source, /const seed = `coffee-player:\$\{spokenText\}`/);
    assert.match(source, /requestBottishSynthesisClip\(\{[\s\S]*?source: \{ text: spokenText \}/);
    assert.match(source, /enqueueBottishClipOrFallback\(\{[\s\S]*?sourceText: spokenText/);
    assert.match(
      source,
      /await startCoffeePlayerVoiceForReveal\(trimmed\)[\s\S]*?setCoffeeUserRevealText\(trimmed\)/
    );
    assert.match(source, /coffeePlayerPlaybackProfile\(settings\.prismDefaultBotAudioVoiceProfile\)/);
    assert.match(source, /playerMessage[\s\S]*?coffeePlayerPlaybackProfile\(settings\.prismDefaultBotAudioVoiceProfile\)/);
  });

  it("explains the Coffee persona in Default Prism's voice customizer", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(source, /Prism represents you at the Coffee table/);
    assert.match(
      source,
      /live\s+messages and session[\s\S]*?replays use this voice/
    );
    assert.doesNotMatch(source, /Your table voice|Name pronunciation/);
    assert.doesNotMatch(source, /playerAudioVoiceProfile|playerNamePronunciation/);
  });

  it("houses replay-only Prism identity and state in the composer controls", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
    assert.match(
      source,
      /coffeeComposerVisible[\s\S]*?renderViewSwitchOverlay\("workspace"\)[\s\S]*?coffeeFinishedControlsVisible/
    );
    assert.match(source, /coffeeGlobalComposer[^\n]*coffeeReplayComposerControls/);
    assert.match(source, /className=\{styles\.coffeeReplayPersona\}/);
    assert.match(source, /zenDefaultPrismGlyph/);
    assert.match(
      source,
      /data-player-thinking=\{\s*coffeeReplayPlayerThinking/
    );
    assert.match(source, /data-table-speaking=\{\s*replayPlayerTalking/);
    assert.match(source, /className=\{styles\.coffeeReplayComposerPot\}/);
    assert.match(source, /className=\{styles\.coffeeReplayPersonaGlyph\}/);
    assert.doesNotMatch(source, /coffeeReplayPlayerSeat/);
    assert.doesNotMatch(styles, /\.coffeeReplayPlayerSeat\b/);
    assert.match(
      styles,
      /\.coffeeReplayComposerPot img\s*\{[\s\S]*?width:\s*68px;/
    );
    assert.match(
      styles,
      /\.coffeeReplayPlayerPotMotion\s*\{[\s\S]*?position:\s*fixed;/
    );
    assert.match(
      source,
      /message\.role === "user"[\s\S]*?\?\s*coffeeReplayActive\s*\?\s*coffeePlayerLabel\s*:\s*"You"/
    );
  });
});
