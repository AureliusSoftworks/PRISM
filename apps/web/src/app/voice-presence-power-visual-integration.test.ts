import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
describe("Loud and Quiet Power presentation", () => {
  it("scales Chat and Zen text and playback from the active bot Power", () => {
    assert.match(pageSource, /data-power-voice-presence=\{[\s\S]{0,120}assistantVoicePresence/u);
    assert.match(pageSource, /settings\.voiceVolume\s*\*\s*botPowerVoiceGainMultiplierV1\(messageBot\?\.powers\)/u);
    assert.match(pageCss, /\.messageAssistant\[data-power-voice-presence="loud"\][^{]*\{[^}]*--power-message-font-scale:\s*1\.12/u);
    assert.match(pageCss, /\.messageAssistant\[data-power-voice-presence="quiet"\][^{]*\{[^}]*--power-message-font-scale:\s*0\.88/u);
  });

  it("uses Coffee's frozen plan for voice gain and text", () => {
    assert.match(pageSource, /botPowerVoiceGainMultiplierFromEffectsV1\([\s\S]{0,100}coffeePowerPlan\.bots\[bot\.id\]\?\.effects/u);
    assert.match(pageSource, /data-power-voice-presence=\{line\.voicePresence\}/u);
    assert.match(pageCss, /\.coffeeCenterFeedLine\[data-power-voice-presence="loud"\][\s\S]{0,140}--power-message-font-scale:\s*1\.12/u);
    assert.match(pageCss, /\.coffeeCenterFeedLine\[data-power-voice-presence="quiet"\][\s\S]{0,140}--power-message-font-scale:\s*0\.88/u);
  });

  it("carries Signal's frozen voice gain into captured replay audio", () => {
    assert.match(signalSource, /botcastSnapshotPowersForRoleV1\(episode, "host"\)[\s\S]{0,260}voiceGainMultiplier:\s*botPowerVoiceGainMultiplierV1\(powers\)/u);
    assert.match(pageSource, /botSummary\.voiceGainMultiplier\s*\?\?/u);
    assert.doesNotMatch(signalSource, /className=\{styles\.replayTranscript\}/u);
  });

  it("adapts the same text and playback treatment to Story dialogue", () => {
    assert.match(pageSource, /const storySpeakerVoicePresence[\s\S]{0,120}botPowerVoicePresenceModeV1\(speakerBot\?\.powers\)/u);
    assert.match(pageSource, /const powerVoiceVolume\s*=\s*settings\.voiceVolume\s*\*\s*botPowerVoiceGainMultiplierV1\(bot\.powers\)/u);
    assert.match(pageCss, /\.storyDialogueTextPanel\[data-power-voice-presence="loud"\][\s\S]{0,180}--power-message-font-scale:\s*1\.12/u);
    assert.match(pageCss, /\.storyDialogueTextPanel\[data-power-voice-presence="quiet"\][\s\S]{0,180}--power-message-font-scale:\s*0\.88/u);
  });
});
