import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import {
  coffeePlayerEnglishEngine,
  coffeePlayerPlaybackProfile,
  coffeePlayerStaticShushDurationForPlayback,
} from "./coffee-player-voice.ts";

describe("Coffee player voice", () => {
  it("keeps every LOCAL or offline-protected table on built-in speech", () => {
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

  it("turns standalone non-Premium shushes into length-aware static", () => {
    const short = coffeePlayerStaticShushDurationForPlayback({
      text: "Shh.",
      voiceMode: "english",
      englishVoiceEngine: "builtin",
    });
    const extended = coffeePlayerStaticShushDurationForPlayback({
      text: `S${"h".repeat(10)}`,
      voiceMode: "bottish",
      englishVoiceEngine: "builtin",
    });
    const capped = coffeePlayerStaticShushDurationForPlayback({
      text: `S${"h".repeat(50)}!`,
      voiceMode: "babble",
      englishVoiceEngine: "builtin",
    });

    assert.equal(short, 440);
    assert.ok(extended !== null && extended > short);
    assert.equal(capped, 2_200);
    assert.equal(
      coffeePlayerStaticShushDurationForPlayback({
        text: "Shhhhhhhhhh",
        voiceMode: "english",
        englishVoiceEngine: "elevenlabs",
      }),
      null,
    );
    assert.equal(
      coffeePlayerStaticShushDurationForPlayback({
        text: "Shush, please.",
        voiceMode: "english",
        englishVoiceEngine: "builtin",
      }),
      null,
    );
    assert.equal(
      coffeePlayerStaticShushDurationForPlayback({
        text: "Shh.",
        voiceMode: "mute",
        englishVoiceEngine: "builtin",
      }),
      null,
    );
  });

  it("uses Default Prism for submitted and replayed Coffee speech", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const livePlayerVoice = source.slice(
      source.indexOf("const startCoffeePlayerVoiceForReveal = async"),
      source.indexOf(
        "const queueCoffeeReveal =",
        source.indexOf("const startCoffeePlayerVoiceForReveal = async"),
      ),
    );
    assert.match(source, /startCoffeePlayerVoiceForReveal\(trimmed\)/);
    assert.match(
      livePlayerVoice,
      /const voiceSelection = voicePlaybackSelectionRef\.current/,
    );
    assert.match(livePlayerVoice, /voiceSelection\.voiceMode === "mute"/);
    assert.match(livePlayerVoice, /const seed = `coffee-player:\$\{spokenText\}`/);
    assert.match(livePlayerVoice, /enqueueRobotVoiceMode\(\{[\s\S]*?source: \{ text: spokenText \}[\s\S]*?sourceText: spokenText/);
    assert.match(livePlayerVoice, /mode: voiceSelection\.voiceMode/);
    assert.doesNotMatch(livePlayerVoice, /settings\.voiceMode/);
    assert.match(
      source,
      /await startCoffeePlayerVoiceForReveal\(trimmed\)[\s\S]*?setCoffeeUserRevealText\(trimmed\)/
    );
    assert.match(source, /coffeePlayerPlaybackProfile\(settings\.prismDefaultBotAudioVoiceProfile\)/);
    assert.match(source, /playerMessage[\s\S]*?coffeePlayerPlaybackProfile\(settings\.prismDefaultBotAudioVoiceProfile\)/);
    assert.ok(
      (source.match(/coffeePlayerStaticShushDurationForPlayback\(\{/g) ?? [])
        .length >= 2,
      "live and replay should both classify standalone player shushes",
    );
    assert.ok(
      (source.match(/playCoffeePlayerStaticShush\(\{/g) ?? []).length >= 2,
      "live and replay should both bypass non-Premium speech with static",
    );
  });

  it("uses the same global player voice for Producer-guest Signal speech and replays", () => {
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const signalSource = readFileSync(
      new URL("./BotcastExperience.tsx", import.meta.url),
      "utf8",
    );
    const playback = pageSource.slice(
      pageSource.indexOf("const playBotcastUtterance = useCallback"),
      pageSource.indexOf("const storyDiscoveredLocationIds"),
    );
    const liveSignalPlayback = signalSource.slice(
      signalSource.indexOf("const playPreparedEpisodeMessage = useCallback"),
      signalSource.indexOf(
        "playPreparedEpisodeMessageRef.current = playPreparedEpisodeMessage",
      ),
    );
    assert.match(playback, /const playerVoice = botSummary\.producerGuest === true/);
    assert.match(
      playback,
      /playerVoice\s*\? coffeePlayerPlaybackProfile\(\s*settings\.prismDefaultBotAudioVoiceProfile/,
    );
    assert.match(playback, /voiceSelection\.voiceMode === "mute"/);
    assert.match(playback, /mode: voiceSelection\.voiceMode/);
    assert.match(playback, /botSummary\.online_enabled !== 0/);
    assert.match(
      signalSource,
      /episode\.responseMode === "local" \? 0 : 1[\s\S]*producerGuest: true/,
    );
    assert.match(
      signalSource,
      /replayEpisode\?\.guestKind === "producer"[\s\S]*replayActiveMessage\.botId === BOTCAST_PRODUCER_GUEST_ID[\s\S]*signalProducerGuestBotSummary/,
    );
    assert.match(
      liveSignalPlayback,
      /currentEpisode\.guestKind === "producer"[\s\S]*message\.botId === BOTCAST_PRODUCER_GUEST_ID[\s\S]*signalProducerGuestBotSummary/,
    );
  });

  it("releases failed or completed Coffee voice before autoplay schedules again", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const botVoice = source.slice(
      source.indexOf("const startCoffeeVoiceForReveal = async"),
      source.indexOf("const startCoffeePlayerVoiceForReveal = async")
    );
    assert.match(botVoice, /const releaseCoffeeVoicePlayback = \(\) =>/);
    assert.ok(
      (botVoice.match(/releaseCoffeeVoicePlayback\(\)/g) ?? []).length >= 4,
      "voice end and every failure lane should release Coffee's playback gate"
    );

    const reveal = source.slice(
      source.indexOf("const queueCoffeeReveal ="),
      source.indexOf("const handleCoffeeTableSpeedNudgePointerDown")
    );
    assert.match(
      reveal,
      /coffeeActiveVoiceMessageIdRef\.current === pendingMessage\?\.id[\s\S]*?voiceSynthesisAbortRef\.current\?\.abort\(\)[\s\S]*?coffeeVoicePlaybackBusyRef\.current = false/
    );

    const scheduler = source.slice(
      source.indexOf("const scheduleCoffeeAutonomousTurn ="),
      source.indexOf("scheduleCoffeeAutonomousTurnRef.current =")
    );
    assert.match(scheduler, /coffeeVoicePlaybackOwnsAutoplayGate\(\{/);
    assert.match(
      scheduler,
      /coffeeVoicePlaybackBusyRef\.current && !voicePlaybackOwnsAutoplay[\s\S]*?coffeeVoicePlaybackBusyRef\.current = false/
    );
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

  it("keeps replay player voice and pot actions off camera", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
    assert.match(
      source,
      /coffeeComposerVisible[\s\S]*?renderViewSwitchOverlay\("workspace"\)[\s\S]*?coffeeFinishedControlsVisible/
    );
    assert.match(source, /coffeeGlobalComposer[^\n]*coffeeReplayComposerControls/);
    assert.match(
      source,
      /ref=\{coffeeReplayPotDockRef\}[\s\S]*?className=\{styles\.coffeeReplayOffCameraPotDock\}/,
    );
    assert.doesNotMatch(source, /className=\{styles\.coffeeReplayPlayerSeat\}/);
    assert.doesNotMatch(source, /className=\{styles\.coffeeReplayPlayerAvatar\}/);
    assert.doesNotMatch(source, /className=\{styles\.coffeePlayerCup\}/);
    assert.doesNotMatch(source, /className=\{styles\.coffeeReplayPlayerName\}/);
    assert.doesNotMatch(source, /className=\{styles\.coffeeReplayPlayerGlyph\}/);
    assert.doesNotMatch(source, /className=\{styles\.coffeeReplayComposerPot\}/);
    assert.doesNotMatch(source, /className=\{styles\.coffeeReplayPersona\}/);
    assert.doesNotMatch(source, /className=\{styles\.coffeeReplayPersonaGlyph\}/);
    assert.match(
      source,
      /const compactCoffeeStage =\s*coffeeSessionPhase === "selecting" && coffeeConversation === null;/,
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
