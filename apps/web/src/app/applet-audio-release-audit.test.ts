import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

type ReleasePath = {
  owner: string;
  file: string;
  evidence: RegExp;
};

/** Auditable inventory of player-facing applet audio cancellation owners.
 * Silent preparation, natural-ended cleanup, recorders, animation handles,
 * and scheduled source ends are intentionally outside this matrix. */
const APPLET_AUDIO_RELEASE_PATHS: readonly ReleasePath[] = [
  { owner: "shared realtime voice", file: "voiceEffects.ts", evidence: /export function stopRealtimeVoiceAudio\([\s\S]{0,280}releaseRealtimeVoiceAudio/u },
  { owner: "English voice", file: "englishVoice.ts", evidence: /export function stopEnglishVoice\([\s\S]{0,180}releaseEnglishVoice\(options\)/u },
  { owner: "Bottish voice", file: "bottishVoice.ts", evidence: /export function stopBottishVoice\([\s\S]{0,180}releaseBottishVoice\(options\)/u },
  { owner: "Signal ident and outro", file: "signalIntroAudio.ts", evidence: /export function stopSignalIntroAudio\(\): void \{\s*releaseSignalIntroAudio\(\)/u },
  { owner: "Signal soundboard", file: "signalSoundboard.ts", evidence: /export function stopSignalSoundboardAudio\([\s\S]{0,800}releaseAudibleAudioElement/u },
  { owner: "Signal faithful replay", file: "BotcastExperience.tsx", evidence: /const stopReplayPlayback = \(\): void => \{[\s\S]{0,420}releaseAudibleAudioElement/u },
  { owner: "Coffee faithful replay", file: "page.tsx", evidence: /const stopCoffeeReplayAudioMaster = \([\s\S]{0,900}releaseAudibleAudioElement/u },
  { owner: "Coffee action SFX", file: "coffee-action-sfx.ts", evidence: /export function stopCoffeeActionSfx\([\s\S]{0,1300}audio\.volume = initialVolume \* \(1 - progress\)/u },
  { owner: "Coffee player shush", file: "coffee-player-voice.ts", evidence: /const abort = \(\) => \{[\s\S]{0,420}linearRampToValueAtTime\(0, releaseEndsAt\)/u },
  { owner: "Coffee soundtrack audition", file: "coffeeSoundtrackSampleAudio.ts", evidence: /export async function stopCoffeeSoundtrackSampleAudio\([\s\S]{0,650}Math\.cos\(progress \* Math\.PI \* 0\.5\)/u },
  { owner: "Debate ident", file: "debateIdentAudio.ts", evidence: /async function stopActiveDebateIdent\([\s\S]{0,1100}debateIdentFadeVolume/u },
  { owner: "Whodunnit dialogue", file: "DebateMysteryV2Experience.tsx", evidence: /finishCurrentDialogue[\s\S]{0,1100}releaseAudibleAudioElement/u },
  { owner: "Avatar performance SFX", file: "botAvatarSfx.ts", evidence: /export function stopBotAvatarSfxAudio\([\s\S]{0,520}releaseBotAvatarSfxSpatialPlayback/u },
  { owner: "Avatar SFX audition", file: "botAvatarSfx.ts", evidence: /export function stopBotAvatarSfxSampleAudio\([\s\S]{0,650}fadeBotAvatarSfxSampleVolume/u },
  { owner: "Sanctum player", file: "SanctumAudioPlayer.tsx", evidence: /const release = useCallback[\s\S]{0,900}audibleAudioTransitionVolumeAt/u },
  { owner: "PRISM intro", file: "prismIntroAudio.ts", evidence: /const fadeAndReleaseSlot = \([\s\S]{0,800}prismIntroAudioFadeVolumeAt/u },
  { owner: "PRISM companion tap", file: "prismCompanionSfx.ts", evidence: /export function stopPrismCompanionGlassTapAudio\([\s\S]{0,360}releaseAudibleAudioElement/u },
  { owner: "PRISM companion background suspension", file: "PrismCompanion.tsx", evidence: /const pauseBackgroundMedia = \(media: HTMLMediaElement\)[\s\S]{0,320}releaseAudibleAudioElement/u },
  { owner: "Action SFX audition", file: "ActionSfxPackMagicButton.tsx", evidence: /const stopSample = useCallback[\s\S]{0,500}releaseAudibleAudioElement/u },
  { owner: "Spatial UI cues", file: "spatialUiSfx.ts", evidence: /export function stopSpatialUiSfx\([\s\S]{0,360}fadeAndReleaseConnection/u },
  { owner: "Session atmosphere", file: "session-atmosphere-audio.ts", evidence: /(?=[\s\S]*stop\(fadeMs = 180\))(?=[\s\S]*linearRampToValueAtTime\(0, endTime\))/u },
] as const;

describe("applet audio release inventory", () => {
  it("keeps every player-facing cancellation owner on a fade/release contract", () => {
    for (const path of APPLET_AUDIO_RELEASE_PATHS) {
      const source = readFileSync(new URL(path.file, import.meta.url), "utf8");
      assert.match(source, path.evidence, `${path.owner} must retain its release wiring`);
    }
  });

  it("keeps immediate speech teardown explicitly named and out of public stop", () => {
    for (const file of ["englishVoice.ts", "bottishVoice.ts", "voiceEffects.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      assert.match(source, /teardown[A-Za-z]+Immediately/u);
    }
  });

  it("fades Sanctum mute state instead of snapping the media mute bit", () => {
    const source = readFileSync(
      new URL("SanctumAudioPlayer.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /audio\.muted\s*=/u);
    assert.match(source, /SANCTUM_AUDIO_PLAYER_MUTE_FADE_MS/u);
    assert.match(source, /audibleAudioTransitionVolumeAt/u);
  });
});
