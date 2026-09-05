import {
  applyVoiceDeliveryMoodToProfile,
  BOT_VOICE_GAIN_DB_MAX,
  DIRECTIONAL_IRRITATION_GAIN_DB_MAX,
  listenerReactionHasAudio,
  listenerReactionInterruptedSpeakerTextV1,
  listenerReactionSpokenTextV1,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotVoiceVolume,
  type BotAudioVoiceProfileV1,
  type ListenerReactionPlanV1,
  type NormalizedBotAudioVoiceProfileV1,
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
  releaseReactionVoiceAudio,
  stopReactionVoiceAudio,
  type VoicePlaybackChannel,
  type VoicePlaybackLifecycle,
} from "./voiceEffects.ts";
import type { RoomAcousticsSend } from "./roomAcoustics.ts";

export type ListenerReactionVoiceMode = "english" | "bottish" | "babble";

/** Ordinary Signal backchannels sit beneath the line that owns the mic. */
export const SIGNAL_LISTENER_REACTION_VOICE_GAIN = 0.32;

/** Interrupting a turn is crosstalk, not a quiet listener acknowledgement. */
export function signalListenerReactionVoiceGain(
  plan: Pick<
    ListenerReactionPlanV1,
    "interjectionAttempt" | "spokenCue" | "publicSpokenCue"
  >,
): number {
  return !plan.interjectionAttempt && listenerReactionSpokenTextV1(plan)
    ? SIGNAL_LISTENER_REACTION_VOICE_GAIN
    : 1;
}

/** A perceptible beat after a cut-in before the interrupted bot answers back. */
export const INTERRUPTED_SPEAKER_RETORT_PAUSE_MS = 850;

/**
 * Temporarily raise profile gain for a single irritation playback.
 * Never mutates the authored profile; returns a shallow copy.
 */
export function applyDirectionalIrritationGainToProfile(
  profile: NormalizedBotAudioVoiceProfileV1,
  gainDbBoost?: number | null,
): NormalizedBotAudioVoiceProfileV1 {
  if (
    typeof gainDbBoost !== "number" ||
    !Number.isFinite(gainDbBoost) ||
    gainDbBoost <= 0
  ) {
    return profile;
  }
  const boost = Math.max(
    0,
    Math.min(DIRECTIONAL_IRRITATION_GAIN_DB_MAX, gainDbBoost),
  );
  if (boost <= 0) return profile;
  return {
    ...profile,
    gainDb: Math.min(BOT_VOICE_GAIN_DB_MAX, profile.gainDb + boost),
  };
}

async function waitForReactionVoiceStart(
  delayMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return false;
  const boundedDelayMs = Math.max(0, Math.round(delayMs));
  if (boundedDelayMs === 0) return true;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (ready: boolean): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(ready);
    };
    const onAbort = (): void => finish(false);
    timer = setTimeout(() => finish(true), boundedDelayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export function listenerReactionVoiceCacheKey(args: {
  plan: ListenerReactionPlanV1;
  mode: ListenerReactionVoiceMode;
  engine: string;
  profile: BotAudioVoiceProfileV1;
}): string {
  const spoken = listenerReactionSpokenTextV1(args.plan) ?? "silent";
  const foley = args.plan.vocalFoley ?? "no-foley";
  const identity = args.plan.interjectionAttempt
    ? args.plan.seed
    : `${args.plan.listenerBotId}:${spoken}:${foley}`;
  return JSON.stringify([
    identity,
    spoken,
    foley,
    args.mode,
    args.engine,
    args.profile,
  ]);
}

export function interruptedSpeakerReactionVoiceCacheKey(args: {
  plan: Pick<
    ListenerReactionPlanV1,
    "seed" | "interruptedSpeakerCue" | "publicInterruptedSpeakerCue"
  >;
  mode: ListenerReactionVoiceMode;
  engine: string;
  profile: BotAudioVoiceProfileV1;
}): string {
  return JSON.stringify([
    args.plan.seed,
    listenerReactionInterruptedSpeakerTextV1(args.plan) ?? "silent",
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
  gainDbBoost?: number;
  englishClip?: EnglishVoiceSynthesisClip | null;
  roomAcoustics?: RoomAcousticsSend;
  stereoPan?: number;
  channel?: VoicePlaybackChannel;
  lifecycle?: VoicePlaybackLifecycle;
  scheduledStartAtPerformanceMs?: number;
}): Promise<boolean> {
  if (!listenerReactionHasAudio(args.plan)) return false;
  if (args.plan.vocalFoley && args.mode !== "english") return false;
  const cue = listenerReactionSpokenTextV1(args.plan) ?? "...";
  return playEphemeralReactionVoice({
    text: cue,
    seed: args.plan.seed,
    mode: args.mode,
    profile: args.profile,
    globalVolume: args.globalVolume,
    effectsEnabled: args.effectsEnabled,
    mood: args.mood,
    gainDbBoost: args.gainDbBoost,
    englishClip: args.englishClip,
    roomAcoustics: args.roomAcoustics,
    stereoPan: args.stereoPan,
    channel: args.channel,
    lifecycle: args.lifecycle,
    scheduledStartAtPerformanceMs: args.scheduledStartAtPerformanceMs,
    maxDurationMs: args.plan.interjectionAttempt ? 2_400 : 2_000,
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
  gainDbBoost?: number;
  englishClip?: EnglishVoiceSynthesisClip | null;
  roomAcoustics?: RoomAcousticsSend;
  stereoPan?: number;
  maxDurationMs?: number;
  channel?: VoicePlaybackChannel;
  startDelayMs?: number;
  scheduledStartAtPerformanceMs?: number;
  signal?: AbortSignal;
  lifecycle?: VoicePlaybackLifecycle;
}): Promise<boolean> {
  const cue = args.text.replace(/\s+/gu, " ").trim();
  const normalizedInputProfile = normalizeBotAudioVoiceProfileV1(args.profile);
  if (!cue || args.globalVolume <= 0 || !normalizedInputProfile.enabled)
    return false;
  if (!(await waitForReactionVoiceStart(args.startDelayMs ?? 0, args.signal))) {
    return false;
  }
  const boostedProfile = applyDirectionalIrritationGainToProfile(
    normalizedInputProfile,
    args.gainDbBoost,
  );
  const profile = normalizeBotAudioVoiceProfileV1({
    ...applyVoiceDeliveryMoodToProfile(boostedProfile, args.mood),
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
      maxDurationMs: args.maxDurationMs ?? 2_000,
      roomAcoustics: args.roomAcoustics,
      stereoPan: args.stereoPan,
      lifecycle: args.lifecycle,
      scheduledStartAtPerformanceMs: args.scheduledStartAtPerformanceMs,
      compensateLifecycleForOutputLatency: true,
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
    maxDurationMs: args.maxDurationMs ?? 2_000,
    roomAcoustics: args.roomAcoustics,
    stereoPan: args.stereoPan,
    lifecycle: args.lifecycle,
    scheduledStartAtPerformanceMs: args.scheduledStartAtPerformanceMs,
    compensateLifecycleForOutputLatency: true,
  });
}

export { releaseReactionVoiceAudio, stopReactionVoiceAudio };
