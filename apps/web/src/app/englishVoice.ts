import {
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";

export interface EnglishVoicePostProcessing {
  detuneCents: number;
  lowpassHz: number;
  gain: number;
}

export function resolveEnglishVoicePostProcessing(
  rawProfile: BotAudioVoiceProfileV1
): EnglishVoicePostProcessing {
  const profile = normalizeBotAudioVoiceProfileV1(rawProfile);
  return {
    detuneCents: Math.round(profile.pitch * 650),
    lowpassHz: Math.round(7200 - (profile.warmth + 1) * 1700),
    gain: Number((0.92 + profile.warmth * 0.04).toFixed(3)),
  };
}

let audioContext: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let generation = 0;
let queue: Promise<void> = Promise.resolve();

function contextForPlayback(): AudioContext | null {
  if (typeof window === "undefined") return null;
  audioContext ??= new window.AudioContext();
  return audioContext;
}

export async function prepareEnglishVoice(): Promise<void> {
  const context = contextForPlayback();
  if (context?.state === "suspended") await context.resume();
}

export function stopEnglishVoice(): void {
  generation += 1;
  try {
    activeSource?.stop();
  } catch {
    // The source may already have completed.
  }
  activeSource = null;
  queue = Promise.resolve();
}

async function playAudio(
  bytes: ArrayBuffer,
  profile: BotAudioVoiceProfileV1,
  expectedGeneration: number
): Promise<void> {
  if (expectedGeneration !== generation) return;
  const context = contextForPlayback();
  if (!context) return;
  if (context.state === "suspended") await context.resume();
  const audioBuffer = await context.decodeAudioData(bytes.slice(0));
  if (expectedGeneration !== generation) return;

  const processing = resolveEnglishVoicePostProcessing(profile);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = audioBuffer;
  source.detune.value = processing.detuneCents;
  filter.type = "lowpass";
  filter.frequency.value = processing.lowpassHz;
  gain.gain.value = processing.gain;
  source.connect(filter).connect(gain).connect(context.destination);
  activeSource = source;
  await new Promise<void>((resolve) => {
    source.addEventListener("ended", () => {
      if (activeSource === source) activeSource = null;
      resolve();
    }, { once: true });
    source.start();
  });
}

export function enqueueEnglishVoice(
  bytes: ArrayBuffer,
  profile: BotAudioVoiceProfileV1
): Promise<void> {
  const expectedGeneration = generation;
  queue = queue
    .catch(() => undefined)
    .then(() => playAudio(bytes, profile, expectedGeneration));
  return queue;
}
