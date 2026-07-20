import {
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
  type EnglishVoiceEngine,
  type NormalizedBotAudioVoiceProfileV1,
  type VoiceMode,
} from "@localai/shared";

const COFFEE_PLAYER_SHUSH_BASE_DURATION_MS = 440;
const COFFEE_PLAYER_SHUSH_EXTRA_H_DURATION_MS = 110;
const COFFEE_PLAYER_SHUSH_MAX_DURATION_MS = 2_200;

let coffeePlayerShushAudioContext: AudioContext | null = null;

/** Player speech is governed by the account-wide mode and volume controls.
 * Hidden legacy per-profile silence must not override those global choices. */
export function coffeePlayerPlaybackProfile(
  profile: BotAudioVoiceProfileV1
): NormalizedBotAudioVoiceProfileV1 {
  return {
    ...normalizeBotAudioVoiceProfileV1(profile),
    enabled: true,
    volume: 1,
  };
}

export function coffeePlayerEnglishEngine(args: {
  accountProvider: "local" | "openai" | "anthropic";
  coffeeProvider: "local" | "openai" | "anthropic";
  offlineProtectedBotPresent: boolean;
  selectedEngine: EnglishVoiceEngine;
}): EnglishVoiceEngine {
  return args.accountProvider === "local" ||
    args.coffeeProvider === "local" ||
    args.offlineProtectedBotPresent
    ? "builtin"
    : args.selectedEngine;
}

function coffeePlayerShushHCount(text: string): number | null {
  const match = text.trim().match(/^s(h{2,})(?:[.!?…]+)?$/iu);
  return match?.[1]?.length ?? null;
}

/** Non-Premium player voices use a procedural hush instead of asking speech
 * engines to pronounce a run of individual letters. */
export function coffeePlayerStaticShushDurationForPlayback(args: {
  text: string;
  voiceMode: VoiceMode;
  englishVoiceEngine: EnglishVoiceEngine;
}): number | null {
  const hCount = coffeePlayerShushHCount(args.text);
  if (
    hCount === null ||
    args.voiceMode === "mute" ||
    (args.voiceMode === "english" && args.englishVoiceEngine === "elevenlabs")
  ) {
    return null;
  }
  return Math.min(
    COFFEE_PLAYER_SHUSH_MAX_DURATION_MS,
    COFFEE_PLAYER_SHUSH_BASE_DURATION_MS +
      Math.max(0, hCount - 2) * COFFEE_PLAYER_SHUSH_EXTRA_H_DURATION_MS,
  );
}

function coffeePlayerShushContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") {
    return null;
  }
  if (
    !coffeePlayerShushAudioContext ||
    coffeePlayerShushAudioContext.state === "closed"
  ) {
    coffeePlayerShushAudioContext = new window.AudioContext();
  }
  return coffeePlayerShushAudioContext;
}

/** Play a soft, speech-shaped static hush. The caller's AbortSignal keeps it
 * owned by the same playback lifecycle as ordinary Coffee player voice. */
export async function playCoffeePlayerStaticShush(args: {
  durationMs: number;
  volume: number;
  signal: AbortSignal;
  onStart?: (durationMs: number) => void;
  onEnd?: () => void;
}): Promise<boolean> {
  const context = coffeePlayerShushContext();
  const durationMs = Math.max(
    COFFEE_PLAYER_SHUSH_BASE_DURATION_MS,
    Math.min(COFFEE_PLAYER_SHUSH_MAX_DURATION_MS, Math.round(args.durationMs)),
  );
  const volume = Math.max(0, Math.min(1, args.volume));
  if (!context || volume <= 0 || args.signal.aborted) return false;
  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return false;
    }
  }
  if (args.signal.aborted) return false;

  const durationSeconds = durationMs / 1_000;
  const buffer = context.createBuffer(
    1,
    Math.max(1, Math.ceil(context.sampleRate * durationSeconds)),
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  let noiseState = (0x9e3779b9 ^ durationMs) >>> 0;
  for (let index = 0; index < samples.length; index += 1) {
    noiseState = (Math.imul(noiseState, 1_664_525) + 1_013_904_223) >>> 0;
    samples[index] = (noiseState / 0xffffffff) * 2 - 1;
  }

  const source = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const output = context.createGain();
  source.buffer = buffer;
  highpass.type = "highpass";
  highpass.frequency.value = 1_350;
  highpass.Q.value = 0.6;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7_200;
  lowpass.Q.value = 0.45;
  const startsAt = context.currentTime;
  const endsAt = startsAt + durationSeconds;
  const level = volume * 0.19;
  output.gain.setValueAtTime(0, startsAt);
  output.gain.linearRampToValueAtTime(level, startsAt + 0.035);
  output.gain.setValueAtTime(level, Math.max(startsAt + 0.035, endsAt - 0.07));
  output.gain.linearRampToValueAtTime(0, endsAt);
  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(output);
  output.connect(context.destination);

  return await new Promise<boolean>((resolve) => {
    let finished = false;
    const finish = (completed: boolean) => {
      if (finished) return;
      finished = true;
      args.signal.removeEventListener("abort", abort);
      source.onended = null;
      source.disconnect();
      highpass.disconnect();
      lowpass.disconnect();
      output.disconnect();
      if (completed) args.onEnd?.();
      resolve(completed);
    };
    const abort = () => {
      try {
        source.stop();
      } catch {
        // The source may already have reached its scheduled end.
      }
      finish(false);
    };
    args.signal.addEventListener("abort", abort, { once: true });
    source.onended = () => finish(true);
    source.start(startsAt);
    source.stop(endsAt);
    args.onStart?.(durationMs);
  });
}
