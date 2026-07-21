import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const englishVoiceSource = readFileSync(
  new URL("./englishVoice.ts", import.meta.url),
  "utf8",
);

describe("live avatar mouth synchronization", () => {
  it("uses the media element clock for English playback progress", () => {
    assert.match(
      englishVoiceSource,
      /englishVoiceMediaElapsedMs\(audio\.currentTime, playbackTempo\)/u,
    );
    assert.doesNotMatch(
      englishVoiceSource,
      /\(\) => performance\.now\(\) - startedAtMs/u,
    );
  });

  it("keeps live Signal visemes on retained provider alignment", () => {
    const avatar = signalSource.slice(
      signalSource.indexOf("const avatar = ("),
      signalSource.indexOf("const hostAvatar ="),
    );
    assert.match(avatar, /crtSpeechMouthShapeAtAlignedElapsedMs\(\{/u);
    assert.match(avatar, /alignment: speechReveal\?\.alignment/u);
  });

  it("drives Zen visemes from its audio timeline instead of canvas reveal", () => {
    const zenMouth = pageSource.slice(
      pageSource.indexOf("const zenLiveBotRevealMouthShape ="),
      pageSource.indexOf("const zenLiveBotTalking ="),
    );
    assert.match(zenMouth, /speechTimeline\?\.phase === "playing"/u);
    assert.match(zenMouth, /elapsedMs: speechTimeline\.elapsedMs/u);
    assert.match(zenMouth, /alignment: speechTimeline\.alignment/u);
  });

  it("tracks Coffee audio progress separately from table typewriter pacing", () => {
    const playback = pageSource.slice(
      pageSource.indexOf("const startCoffeeVoiceForReveal = async"),
      pageSource.indexOf("const startCoffeePlayerVoiceForReveal = async"),
    );
    const seatMouth = pageSource.slice(
      pageSource.indexOf("const liveSeatSpeech ="),
      pageSource.indexOf("const seatVoicePreset =", pageSource.indexOf("const liveSeatSpeech =")),
    );
    assert.match(playback, /onProgress: \(elapsedMs: number, durationMs: number\)/u);
    assert.match(playback, /setCoffeeLiveAvatarSpeech/u);
    assert.match(playback, /speechActivityWindows: buildSpeechActivityWindows/u);
    assert.match(seatMouth, /crtSpeechMouthShapeAtAlignedElapsedMs\(\{/u);
    assert.match(seatMouth, /elapsedMs: liveSeatSpeech\.elapsedMs/u);
    assert.match(seatMouth, /alignment: liveSeatSpeech\.alignment/u);
  });
});
