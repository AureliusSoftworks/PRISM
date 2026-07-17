import {
  applyVoiceDeliveryMoodToProfile,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotVoiceVolume,
  type BotAudioVoiceProfileV1,
  type ListenerReactionPlanV1,
  type VoiceDeliveryMood,
} from "@localai/shared";
import {
  buildBabbleRoboticPlan,
  buildBottishPlan,
  encodeBottishPlanWave,
  normalizeBottishPlaybackProfile,
} from "./bottishVoice.ts";
import {
  elevenLabsEffectForEngine,
  resolveEnglishVoicePlaybackDetuneCents,
  resolveEnglishVoicePostProcessing,
  type EnglishVoiceSynthesisClip,
} from "./englishVoice.ts";
import {
  playRealtimeVoiceBytes,
  stopReactionVoiceAudio,
} from "./voiceEffects.ts";

export type ListenerReactionVoiceMode = "english" | "bottish" | "babble";

export function listenerReactionVoiceCacheKey(args: {
  plan: ListenerReactionPlanV1;
  mode: ListenerReactionVoiceMode;
  engine: string;
  profile: BotAudioVoiceProfileV1;
}): string {
  return JSON.stringify([
    args.plan.seed,
    args.plan.spokenCue ?? "silent",
    args.mode,
    args.engine,
    args.profile,
  ]);
}

export async function playListenerReactionVoice(args: {
  plan: ListenerReactionPlanV1;
  mode: ListenerReactionVoiceMode;
  profile: BotAudioVoiceProfileV1;
  globalVolume: number;
  effectsEnabled: boolean;
  mood?: VoiceDeliveryMood | null;
  englishClip?: EnglishVoiceSynthesisClip | null;
}): Promise<boolean> {
  const cue = args.plan.spokenCue;
  const normalizedInputProfile = normalizeBotAudioVoiceProfileV1(args.profile);
  if (!cue || args.globalVolume <= 0 || !normalizedInputProfile.enabled) return false;
  const profile = normalizeBotAudioVoiceProfileV1({
    ...applyVoiceDeliveryMoodToProfile(normalizedInputProfile, args.mood),
    volume: normalizeBotVoiceVolume(args.globalVolume),
  });
  if (args.mode === "english") {
    if (!args.englishClip) return false;
    const processing = resolveEnglishVoicePostProcessing(profile);
    return playRealtimeVoiceBytes({
      bytes: args.englishClip.bytes,
      profile,
      seed: args.plan.seed,
      effectsEnabled: args.effectsEnabled,
      detuneCents: resolveEnglishVoicePlaybackDetuneCents(
        profile,
        args.englishClip.engineUsed,
      ),
      baseLowpassHz: processing.lowpassHz,
      elevenLabsEffect: elevenLabsEffectForEngine(
        profile,
        args.englishClip.engineUsed,
      ),
      alignment: args.englishClip.alignment,
      channel: "reaction",
      maxDurationMs: 900,
    });
  }

  const normalized = normalizeBottishPlaybackProfile(profile);
  const plan = buildBottishPlan(cue, normalized, args.plan.seed);
  if (plan.durationMs <= 0) return false;
  return playRealtimeVoiceBytes({
    bytes: encodeBottishPlanWave(plan),
    profile: normalized,
    seed: args.plan.seed,
    effectsEnabled: args.effectsEnabled,
    alignment: plan.alignment,
    ...(args.mode === "babble"
      ? {
          roboticPlan: buildBabbleRoboticPlan(cue, normalized, args.plan.seed),
          cleanRoboticCarrier: true,
        }
      : {}),
    channel: "reaction",
    maxDurationMs: 900,
  });
}

export { stopReactionVoiceAudio };
