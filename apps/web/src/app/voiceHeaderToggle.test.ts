import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

describe("universal voice switch", () => {
  it("places an account-wide speaker switch in the desktop header", () => {
    assert.match(pageSource, /styles\.voiceHeaderButton/);
    assert.match(pageSource, /data-voice-mode=\{currentVoiceMode\}/);
    assert.match(pageSource, /aria-pressed=\{!voiceMuted\}/);
    assert.match(pageSource, /<VolumeX[\s\S]*?<Volume2/);
  });

  it("persists the switch immediately and exposes it in the mobile menu", () => {
    assert.match(pageSource, /async function toggleGlobalVoicePlayback\(\)/);
    assert.match(pageSource, /body: JSON\.stringify\(\{ voiceMode: nextMode \}\)/);
    assert.match(pageSource, /voiceModeAfterQuickToggle\(normalizeVoiceMode\(settings\.voiceMode\)\)/);
    assert.match(pageSource, /Switch to/);
  });

  it("visually distinguishes muted and audible states", () => {
    assert.match(styleSource, /\.voiceHeaderButton\[data-voice-mode="bottish"\]/);
    assert.match(styleSource, /\.voiceHeaderButton\[data-voice-mode="english"\]/);
    assert.match(styleSource, /\.voiceHeaderButton\[data-voice-mode="mute"\]/);
  });
});
