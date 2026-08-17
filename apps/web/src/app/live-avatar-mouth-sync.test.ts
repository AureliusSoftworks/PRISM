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
    const roleIsSpeaking = signalSource.slice(
      signalSource.indexOf("const roleIsSpeaking ="),
      signalSource.indexOf("const roleAvatarScaleMode ="),
    );
    const avatar = signalSource.slice(
      signalSource.indexOf("const avatar = ("),
      signalSource.indexOf("const hostAvatar ="),
    );
    assert.match(
      roleIsSpeaking,
      /signalLivePrimaryAvatarSpeech\(\{[\s\S]{0,140}liveSpeech:[\s\S]{0,100}role,[\s\S]{0,120}elapsedMs: projectedLiveSpeechElapsedMs[\s\S]{0,40}\}\)\.talking/u,
      "Signal must keep the active speaker talking for the full audible utterance",
    );
    assert.doesNotMatch(
      roleIsSpeaking,
      /botcastSpeechRevealIsVoicing/u,
      "Phrase-level silence must not switch off Signal's utterance-level talking state",
    );
    assert.match(
      roleIsSpeaking,
      /if \(args\.replay\) \{[\s\S]{0,400}speechIsPlaying[\s\S]{0,240}args\.activeMessage\?\.speakerRole === role/u,
      "Procedural Signal replay must retain its own speech clock",
    );
    assert.match(
      avatar,
      /signalLivePrimaryAvatarSpeech\(\{[\s\S]{0,140}liveSpeech:[\s\S]{0,100}role,[\s\S]{0,120}elapsedMs: projectedLiveSpeechElapsedMs[\s\S]{0,40}\}\)\.mouthShape/u,
    );
    assert.match(
      signalSource,
      /signalLiveSpeechProjectedElapsedMs\(\{[\s\S]{0,180}signalLiveSpeechPlaybackClockRef\.current[\s\S]{0,100}signalLiveMouthVisualNowMs/u,
      "Signal must keep producing visual mouth frames between sparse audio callbacks",
    );
    assert.match(
      signalSource,
      /setLiveSpeech\(\{[\s\S]{0,100}message,[\s\S]{0,80}audible: true,[\s\S]{0,120}startBotcastSpeechReveal/u,
    );
    assert.match(avatar, /crtSpeechMouthShapeAtAlignedElapsedMs\(\{/u);
    assert.match(
      avatar,
      /const mouthShape = rawMouthShape/u,
      "Signal must preserve literal closed pause shapes from the aligned viseme clock",
    );
    assert.doesNotMatch(
      avatar,
      /botcastSpeechRevealIsVoicing/u,
      "Signal must not freeze the aligned viseme clock while segment timing is still empty",
    );
  });

  it("keeps Signal's active avatar attached to the audible speech clock", () => {
    assert.match(
      signalSource,
      /const liveActiveMessage = signalLiveActiveMessage\(\{[\s\S]{0,180}liveSpeech,[\s\S]{0,180}episodeMessages:/u,
      "The exact audible message must not wait for the episode snapshot to commit",
    );
    assert.match(
      signalSource,
      /setLiveSpeech\(\{[\s\S]{0,100}messageId: message\.id,[\s\S]{0,80}message,[\s\S]{0,80}audible: true/u,
    );
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
      /onProgress: \(elapsedMs, durationMs\)[\s\S]{0,2500}speechTiming: \{[\s\S]{0,220}elapsedMs: Math\.min\(playbackDurationMs, elapsedMs\)[\s\S]{0,220}alignment: playbackAlignment/u,
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
      /const debateMouthActive =\s+!avatarState\.thinking &&\s+\(\(avatarState\.talking &&\s+debateMouthShape !== "closed"\) \|\|/u,
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
      /const playbackMessage =\s*primarySpokenContent === message\.content[\s\S]{0,120}\{\s*\.\.\.message,\s*content:\s*primarySpokenContent\s*\}/u,
    );
    assert.match(
      signalSource,
      /onUtterance\(\s*playbackMessage,/u,
    );
  });

  it("drives Zen visemes from its audio timeline instead of canvas reveal", () => {
    const zenMouth = pageSource.slice(
      pageSource.indexOf("const zenLiveBotRevealMouthShape ="),
      pageSource.indexOf("const zenLiveBotUtteranceActive"),
    );
    assert.match(zenMouth, /speechTimeline\?\.phase !== "playing"/u);
    assert.match(zenMouth, /elapsedMs: speechTimeline\.elapsedMs/u);
    assert.match(zenMouth, /alignment: speechTimeline\.alignment/u);
    assert.match(zenMouth, /activeChatVoiceMode === "bottish"/u);
    assert.match(zenMouth, /bottishMouthShapeAtAlignedElapsedMs\(\{/u);
    assert.match(
      zenMouth,
      /playingMouthShape === "closed" \? null : playingMouthShape/u,
      "Zen must idle the face on true closed pause shapes",
    );
    const zenTalking = pageSource.slice(
      pageSource.indexOf("const zenLiveBotUtteranceActive"),
      pageSource.indexOf("const zenLiveBotMouthOpen"),
    );
    assert.match(
      zenTalking,
      /speechTimeline\?\.phase !== "playing"/u,
      "Talking status must begin only when audible playback begins",
    );
    assert.doesNotMatch(
      zenTalking,
      /zenLiveBotRevealMouthShape !== null/u,
      "Utterance-active must not flicker off when lips idle through pauses",
    );
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
    assert.match(
      playback,
      /speechActivityWindows:\s*\n?\s*buildSpeechActivityWindows\(/u,
    );
    assert.match(
      playback,
      /buildSpeechActivityWindowsFromTextCadence/u,
      "Coffee must fall back to text-cadence silence when alignment is missing",
    );
    assert.match(seatMouth, /crtSpeechMouthShapeAtAlignedElapsedMs\(\{/u);
    assert.match(seatMouth, /elapsedMs: liveSeatSpeech\.elapsedMs/u);
    assert.match(seatMouth, /alignment: liveSeatSpeech\.alignment/u);
    assert.match(
      seatMouth,
      /voiceMode === "bottish"/u,
    );
    assert.match(seatMouth, /bottishMouthShapeAtAlignedElapsedMs\(\{/u);
    assert.match(
      seatMouth,
      /liveSeatSpeechIsVoicing/u,
      "Coffee live seats must idle lips through closed pause shapes",
    );
    assert.match(
      seatMouth,
      /liveSeatAlignedMouthShape !== "closed"/u,
    );
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
