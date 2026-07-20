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
    assert.match(source, /startCoffeePlayerVoiceForReveal\(trimmed\)/);
    assert.match(source, /settings\.voiceMode === "mute"/);
    assert.match(source, /const seed = `coffee-player:\$\{spokenText\}`/);
    assert.match(source, /enqueueRobotVoiceMode\(\{[\s\S]*?source: \{ text: spokenText \}[\s\S]*?sourceText: spokenText/);
    assert.match(source, /mode: settings\.voiceMode/);
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

  it("houses replay Prism identity and pot together at the table", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
    assert.match(
      source,
      /coffeeComposerVisible[\s\S]*?renderViewSwitchOverlay\("workspace"\)[\s\S]*?coffeeFinishedControlsVisible/
    );
    assert.match(source, /coffeeGlobalComposer[^\n]*coffeeReplayComposerControls/);
    assert.match(source, /className=\{styles\.coffeeReplayPlayerSeat\}/);
    assert.match(source, /data-review-active=\{shellPolicy\.reviewActive \? "true" : undefined\}/);
    assert.match(source, /zenDefaultPrismGlyph/);
    assert.match(
      source,
      /data-player-thinking=\{\s*coffeeReplayPlayerThinking/
    );
    assert.match(source, /data-table-speaking=\{\s*replayPlayerTalking/);
    assert.match(source, /className=\{styles\.coffeeReplayPlayerPot\}/);
    assert.match(source, /className=\{styles\.coffeeReplayPlayerName\}/);
    assert.match(source, /className=\{styles\.coffeeReplayPlayerGlyph\}/);
    assert.match(
      source,
      /ref=\{coffeeReplayPotDockRef\}[\s\S]*?className=\{styles\.coffeeReplayPlayerPot\}/,
    );
    assert.doesNotMatch(source, /className=\{styles\.coffeeReplayComposerPot\}/);
    assert.doesNotMatch(source, /className=\{styles\.coffeeReplayPersona\}/);
    assert.doesNotMatch(source, /className=\{styles\.coffeeReplayPersonaGlyph\}/);
    assert.match(styles, /\.coffeeReplayPlayerSeat\b/);
    assert.match(source, /<ZenLiveBotMannequin[\s\S]*?showThinkingSpinner=\{coffeeReplayPlayerThinking\}/);
    assert.match(
      styles,
      /\.coffeeReplayPlayerPot img\s*\{[\s\S]*?width:\s*62px;/
    );
    assert.match(
      styles,
      /\.coffeeReplayPlayerSeat\s*\{[\s\S]*?bottom:\s*clamp\(-54px,\s*-4\.8vh,\s*-32px\);/,
    );
    assert.match(
      styles,
      /\.coffeeReplayPlayerAvatar\s*\{[\s\S]*?--zen-live-bot-avatar-size:\s*var\(\s*--coffee-seat-responsive-avatar-size,\s*clamp\(148px,\s*12\.6vw,\s*196px\)\s*\);[\s\S]*?--zen-live-bot-avatar-body-size:\s*var\(--zen-live-bot-avatar-size\);/,
    );
    assert.doesNotMatch(
      styles,
      /\.coffeeReplayPlayerAvatar\s*\{[\s\S]*?clamp\(126px,\s*12cqw,\s*168px\)/,
    );
    assert.match(
      styles,
      /\.zenLiveBotPresenceHitTarget\s*\{[\s\S]*?width:\s*77\.4%;[\s\S]*?height:\s*78\.6%;/,
    );
    assert.match(
      styles,
      /\.coffeeReplayPlayerSeat\s*\{[\s\S]*?width:\s*min\(268px,\s*calc\(100%\s*-\s*32px\)\);[\s\S]*?pointer-events:\s*none;/,
    );
    assert.match(
      styles,
      /\.coffeeReplayPlayerNameplate\s*\{[\s\S]*?width:\s*clamp\(232px,\s*21cqw,\s*268px\);[\s\S]*?margin-top:\s*clamp\(-41px,\s*-3\.2cqw,\s*-30px\);/,
    );
    assert.match(
      source,
      /className=\{styles\.coffeeReplayPlayerGlyph\}[\s\S]{0,180}<BotGlyph\s+name=\{zenDefaultPrismGlyph\}\s+size=\{16\}\s+strokeWidth=\{2\}/,
    );
    assert.match(
      styles,
      /\.coffeeReplayPlayerSeat\[data-player-thinking="true"\],[\s\S]*?\.coffeeReplayPlayerSeat\[data-table-speaking="true"\]\s*\{[\s\S]*?drop-shadow\(/,
    );
    assert.match(
      styles,
      /\.themeLight\.coffeeShell \.coffeeReplayPlayerNameplate\s*\{/,
    );
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
