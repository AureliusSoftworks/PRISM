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
    assert.match(
      avatar,
      /primarySpeaking[\s\S]{0,160}args\.replay[\s\S]{0,180}speechReveal\?\.text/u,
    );
    assert.match(
      avatar,
      /signalVoicePerformanceTranscriptText\(args\.activeMessage\)/u,
    );
    assert.match(
      avatar,
      /const mouthSpeechAlignment = primarySpeaking[\s\S]{0,80}speechReveal\?\.alignment/u,
    );
    assert.match(avatar, /crtSpeechMouthShapeAtAlignedElapsedMs\(\{/u);
    assert.match(avatar, /alignment: mouthSpeechAlignment/u);
    assert.match(avatar, /voiceMode === "bottish"/u);
    assert.match(avatar, /bottishMouthShapeAtAlignedElapsedMs\(\{/u);
  });

  it("uses the exact primary playback text for Signal reveal and mouth timing", () => {
    assert.match(
      signalSource,
      /const transcriptText =\s*signalVoicePerformanceTranscriptText\(playbackMessage\)/u,
    );
  });

  it("drives Zen visemes from its audio timeline instead of canvas reveal", () => {
    const zenMouth = pageSource.slice(
      pageSource.indexOf("const zenLiveBotRevealMouthShape ="),
      pageSource.indexOf("const zenLiveBotTalking ="),
    );
    assert.match(zenMouth, /speechTimeline\?\.phase === "playing"/u);
    assert.match(zenMouth, /elapsedMs: speechTimeline\.elapsedMs/u);
    assert.match(zenMouth, /alignment: speechTimeline\.alignment/u);
    assert.match(zenMouth, /settings\?\.voiceMode === "bottish"/u);
    assert.match(zenMouth, /bottishMouthShapeAtAlignedElapsedMs\(\{/u);
  });

  it("throttles Bottish in Avatar Studio while retaining its phrase gaps", () => {
    const avatarPreview = pageSource.slice(
      pageSource.indexOf("const playAvatarVoicePreview = async"),
      pageSource.indexOf("const previewAvatarGlobalVoice = async"),
    );
    assert.match(avatarPreview, /forcedMode === "bottish"/u);
    assert.match(avatarPreview, /bottishMouthShapeAtAlignedElapsedMs\(\{/u);
    assert.match(avatarPreview, /mouthShape === "closed"/u);
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
    assert.match(seatMouth, /settings\?\.voiceMode === "bottish"/u);
    assert.match(seatMouth, /bottishMouthShapeAtAlignedElapsedMs\(\{/u);
  });

  it("animates prerecorded ambient vocalizations without consulting bot voice style", () => {
    assert.match(pageSource, /useAmbientBotVocalization\(\)/u);
    assert.match(
      pageSource,
      /seatAmbientVocalizationActive[\s\S]{0,180}seatMouthActive/u,
    );
    assert.match(
      pageSource,
      /coffeeAmbientBotVocalizationMouthShape\(bot\.id\)/u,
    );
    assert.match(signalSource, /roleIsAmbientVocalizing/u);
    assert.match(signalSource, /roleMouthIsActive/u);
    assert.match(
      signalSource,
      /signalAmbientBotVocalizationMouthShape\(role\)/u,
    );
    assert.doesNotMatch(
      signalSource,
      /handleSignalAmbientBotVocalization[\s\S]{0,1600}(?:voicePreset|voiceProfile|speakingStyle)/u,
    );
  });
});
