import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
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

  it("keeps released Signal visemes on the active message and provider alignment", () => {
    const avatar = signalSource.slice(
      signalSource.indexOf("const avatar = ("),
      signalSource.indexOf("const hostAvatar ="),
    );
    assert.match(
      avatar,
      /talking && args\.activeMessage[\s\S]{0,180}text: args\.activeMessage\.content/u,
    );
    assert.match(
      avatar,
      /text: args\.activeMessage\.content,[\s\S]{0,180}alignment: speechReveal\?\.alignment/u,
    );
    assert.match(avatar, /crtSpeechMouthShapeAtAlignedElapsedMs\(\{/u);
  });

  it("drives Debate visemes from the active utterance audio clock and provider alignment", () => {
    assert.match(
      debateSource,
      /onStart\?: \([\s\S]{0,180}alignment\?: VoicePlaybackCharacterAlignment \| null/u,
    );
    assert.match(
      debateSource,
      /onStart: \(durationMs, alignment\)[\s\S]{0,500}playbackAlignment = alignment \?\? null/u,
    );
    assert.match(
      debateSource,
      /onProgress: \(elapsedMs, durationMs\)[\s\S]{0,900}speechTiming: \{[\s\S]{0,220}elapsedMs: Math\.min\(playbackDurationMs, elapsedMs\)[\s\S]{0,220}alignment: playbackAlignment/u,
    );
    assert.match(
      debateSource,
      /DEBATE_LIVE_SPEECH_RENDER_INTERVAL_MS = 50/u,
    );

    const debateAvatar = pageSource.slice(
      pageSource.indexOf("const debateMouthShape ="),
      pageSource.indexOf(
        "moodHint=\"neutral\"",
        pageSource.indexOf("const debateMouthShape ="),
      ),
    );
    assert.match(debateAvatar, /avatarState\.speechTiming/u);
    assert.match(debateAvatar, /avatarState\.foleyMouthShape/u);
    assert.match(
      debateAvatar,
      /const debateMouthShape =\s+avatarState\.thinking\s+\? "closed"/u,
    );
    assert.match(
      debateAvatar,
      /const debateMouthActive =\s+!avatarState\.thinking &&\s+\(avatarState\.talking \|\| debateMouthShape !== "closed"\)/u,
    );
    assert.match(
      debateAvatar,
      /bottishMouthShapeAtAlignedElapsedMs\(\{/u,
    );
    assert.match(debateAvatar, /crtSpeechMouthShapeAtAlignedElapsedMs\(\{/u);
    assert.match(
      debateAvatar,
      /alignment: avatarState\.speechTiming\.alignment/u,
    );
    assert.match(debateAvatar, /mouthShape=\{debateMouthShape\}/u);
    assert.doesNotMatch(
      debateAvatar,
      /avatarState\.talking \? "open-small" : "closed"/u,
    );
  });

  it("keeps muted Debate reveal visemes on the deterministic reveal clock", () => {
    const silentReveal = debateSource.slice(
      debateSource.indexOf("const revealEventSilently ="),
      debateSource.indexOf("const consumeNewEvents ="),
    );
    assert.match(silentReveal, /elapsedMs: progress \* durationMs/u);
    assert.match(silentReveal, /durationMs,/u);
    assert.match(silentReveal, /alignment: null/u);
  });

  it("uses the exact primary crosstalk playback message for Signal audio", () => {
    assert.match(
      signalSource,
      /const playbackMessage = primarySpokenContent === message\.content[\s\S]{0,120}\{ \.\.\.message, content: primarySpokenContent \}/u,
    );
    assert.match(
      signalSource,
      /onUtterance\(\s*playbackMessage,/u,
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
    assert.match(
      playback,
      /coffeeLiveAvatarSpeechProgressShouldCommit\(\{/u,
      "Coffee mouth progress must not setState on every animation frame",
    );
    assert.match(playback, /speechActivityWindows: buildSpeechActivityWindows/u);
    assert.match(seatMouth, /crtSpeechMouthShapeAtAlignedElapsedMs\(\{/u);
    assert.match(seatMouth, /elapsedMs: liveSeatSpeech\.elapsedMs/u);
    assert.match(seatMouth, /alignment: liveSeatSpeech\.alignment/u);
    assert.match(seatMouth, /settings\?\.voiceMode === "bottish"/u);
    assert.match(seatMouth, /bottishMouthShapeAtAlignedElapsedMs\(\{/u);
  });

  it("caches Coffee history folds across mouth/typewriter frames", () => {
    assert.match(pageSource, /coffeeLiveBorrowedIdentityCacheRef/u);
    assert.match(pageSource, /coffeeSeatActionStateCacheRef/u);
    assert.match(
      pageSource,
      /coffeeLiveBorrowedIdentityCacheRef\.current\.messages === messages/u,
    );
    assert.match(
      pageSource,
      /cache\.timeline === seatActionTimelineMessages/u,
    );
  });

  it("animates Coffee's prerecorded ambient vocalizations without consulting bot voice style", () => {
    assert.match(pageSource, /useAmbientBotVocalization\(\)/u);
    assert.match(
      pageSource,
      /seatAmbientVocalizationActive[\s\S]{0,400}seatMouthActive/u,
    );
    assert.match(pageSource, /seatFoleyOhMouth/u);
    assert.match(
      pageSource,
      /coffeeAmbientBotVocalizationMouthShape\(bot\.id\)/u,
    );
  });
});
