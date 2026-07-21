import {
  applyVoiceDeliveryMoodToProfile,
  listenerReactionHasAudio,
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
  resolveEnglishVoicePlaybackDetuneCents,
  resolveEnglishVoicePostProcessing,
  voiceEffectForPlayback,
  type EnglishVoiceSynthesisClip,
} from "./englishVoice.ts";
import {
  playRealtimeVoiceBytes,
  stopReactionVoiceAudio,
  type VoicePlaybackChannel,
} from "./voiceEffects.ts";
import type { RoomAcousticsSend } from "./roomAcoustics.ts";

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
    args.plan.vocalFoley ?? "no-foley",
    args.mode,
    args.engine,
    args.profile,
  ]);
}

export function interruptedSpeakerReactionVoiceCacheKey(args: {
  plan: Pick<ListenerReactionPlanV1, "seed" | "interruptedSpeakerCue">;
  mode: ListenerReactionVoiceMode;
  engine: string;
  profile: BotAudioVoiceProfileV1;
}): string {
  return JSON.stringify([
    args.plan.seed,
    args.plan.interruptedSpeakerCue ?? "silent",
    "interrupted-speaker",
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
  roomAcoustics?: RoomAcousticsSend;
  stereoPan?: number;
  channel?: VoicePlaybackChannel;
}): Promise<boolean> {
  if (!listenerReactionHasAudio(args.plan)) return false;
  if (args.plan.vocalFoley && args.mode !== "english") return false;
  const cue = args.plan.spokenCue ?? "...";
  return playEphemeralReactionVoice({
    text: cue,
    seed: args.plan.seed,
    mode: args.mode,
    profile: args.profile,
    globalVolume: args.globalVolume,
    effectsEnabled: args.effectsEnabled,
    mood: args.mood,
    englishClip: args.englishClip,
    roomAcoustics: args.roomAcoustics,
    stereoPan: args.stereoPan,
    channel: args.channel,
    maxDurationMs: args.plan.interjectionAttempt ? 1_300 : 900,
  });
}

export async function playEphemeralReactionVoice(args: {
  text: string;
  seed: string;
  mode: ListenerReactionVoiceMode;
  profile: BotAudioVoiceProfileV1;
  globalVolume: number;
  effectsEnabled: boolean;
  mood?: VoiceDeliveryMood | null;
  englishClip?: EnglishVoiceSynthesisClip | null;
  roomAcoustics?: RoomAcousticsSend;
  stereoPan?: number;
  maxDurationMs?: number;
  channel?: VoicePlaybackChannel;
}): Promise<boolean> {
  const cue = args.text.replace(/\s+/gu, " ").trim();
  const normalizedInputProfile = normalizeBotAudioVoiceProfileV1(args.profile);
  if (!cue || args.globalVolume <= 0 || !normalizedInputProfile.enabled)
    return false;
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
      seed: args.seed,
      effectsEnabled: args.effectsEnabled,
      detuneCents: resolveEnglishVoicePlaybackDetuneCents(
        profile,
        args.englishClip.engineUsed,
      ),
      baseLowpassHz: processing.lowpassHz,
      voiceEffect: voiceEffectForPlayback(profile),
      alignment: args.englishClip.alignment,
      channel: args.channel ?? "reaction",
      maxDurationMs: args.maxDurationMs ?? 900,
      roomAcoustics: args.roomAcoustics,
      stereoPan: args.stereoPan,
    });
  }

  const normalized = normalizeBottishPlaybackProfile(profile);
  const plan = buildBottishPlan(cue, normalized, args.seed);
  if (plan.durationMs <= 0) return false;
  const playbackProfile = { ...normalized, pitch: 0, lilt: 0 };
  return playRealtimeVoiceBytes({
    bytes: encodeBottishPlanWave(plan),
    profile: playbackProfile,
    seed: args.seed,
    effectsEnabled: args.effectsEnabled,
    alignment: plan.alignment,
    ...(args.mode === "babble"
      ? {
          roboticPlan: buildBabbleRoboticPlan(cue, normalized, args.seed),
          cleanRoboticCarrier: true,
        }
      : {}),
    channel: args.channel ?? "reaction",
    maxDurationMs: args.maxDurationMs ?? 900,
    roomAcoustics: args.roomAcoustics,
    stereoPan: args.stereoPan,
  });
}

export { stopReactionVoiceAudio };
