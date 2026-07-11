import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("voice settings preview", () => {
  it("uses one generic Preview action for the selected voice mode", () => {
    assert.match(pageSource, /async function previewSelectedVoice\(/);
    assert.match(pageSource, /onClick=\{\(\) => void previewSelectedVoice\(\)\}/);
    assert.match(pageSource, />\s*Preview\s*<\/button>/);
    assert.doesNotMatch(pageSource, /Preview Bottish/);
  });

  it("previews a customized bot with the currently selected global mode", () => {
    assert.match(pageSource, /voiceMode=\{normalizeVoiceMode\(settings\?\.voiceMode\)\}/);
    assert.match(pageSource, /onVoicePreview=\{previewSelectedVoice\}/);
    assert.match(pageSource, /Bottish tone from organic to synthetic/);
  });

  it("previews Bottish and English with the same generic phrase", () => {
    assert.match(pageSource, /enqueueBottishVoice\(\s*VOICE_PREVIEW_TEXT/);
    assert.match(pageSource, /text: VOICE_PREVIEW_TEXT,\s*mode: "english"/);
    assert.match(pageSource, /await enqueueEnglishVoice\(/);
  });

  it("keeps Mute silent and LOCAL English previews offline", () => {
    assert.match(pageSource, /Mute is silent\. Choose Bottish or English to hear a preview\./);
    assert.match(
      pageSource,
      /settings\.preferredProvider === "local"\s*\? "builtin"\s*:\s*settings\.englishVoiceEngine/
    );
  });

  it("routes Story NPC dialogue through the shared per-bot voice path", () => {
    assert.match(pageSource, /beat\.actorRole !== "npc"/);
    assert.match(pageSource, /storyVoiceBeatKeyRef/);
    assert.match(pageSource, /storySession\.provider === "local"\s*\? "builtin"/);
    assert.match(pageSource, /enqueueBottishVoice\([\s\S]*settings\.voiceEffectsEnabled !== false/);
    assert.match(pageSource, /enqueueEnglishVoice\([\s\S]*settings\.voiceEffectsEnabled !== false/);
  });

  it("presents offline English as native system speech rather than a bundled neural voice", () => {
    assert.match(pageSource, /System Classic \(Offline\)/);
    assert.match(pageSource, /voices installed by macOS or Windows/);
    assert.doesNotMatch(pageSource, /Built-in English is packaged with Prism/);
  });

  it("does not wait forever for Web Audio before falling back to media playback", () => {
    const bottishSource = readFileSync(new URL("./bottishVoice.ts", import.meta.url), "utf8");
    const englishSource = readFileSync(new URL("./englishVoice.ts", import.meta.url), "utf8");
    const effectsSource = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    assert.match(bottishSource, /encodeBottishPlanWave/);
    assert.match(bottishSource, /playPlanWithMedia/);
    assert.match(effectsSource, /Promise\.race\(/);
    assert.match(englishSource, /beginMediaUnlock\(\);/);
    assert.match(englishSource, /playBytesWithMedia/);
  });
});
