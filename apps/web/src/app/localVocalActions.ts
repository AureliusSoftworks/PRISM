import {
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
  type VoicePerformanceVocalActionSegmentV1,
} from "@localai/shared";

const SAMPLE_RATE = 24_000;
const MAX_CACHE_ENTRIES = 160;
const waveCache = new Map<string, ArrayBuffer>();

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function randomSource(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  };
}

function actionDurationMs(
  action: VoicePerformanceVocalActionSegmentV1["action"],
  modifiers: readonly string[],
): number {
  const base = {
    laugh: 720,
    chuckle: 520,
    sigh: 860,
    exhale: 720,
    gasp: 430,
    cough: 480,
    "throat-clear": 620,
    snort: 430,
    groan: 820,
    sob: 900,
    yawn: 1_150,
  }[action];
  return Math.round(base * (modifiers.includes("brief") ? 0.7 : 1));
}

function writeWave(samples: Float32Array): ArrayBuffer {
  const output = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(output);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]!));
    view.setInt16(44 + index * 2, Math.round(sample * 0x7fff), true);
  }
  return output;
}

function envelope(time: number, duration: number, attack = 0.06): number {
  const attackGain = Math.min(1, time / Math.max(0.001, attack));
  const releaseGain = Math.min(1, (duration - time) / 0.1);
  return Math.max(0, Math.min(attackGain, releaseGain));
}

function renderedAction(args: {
  segment: VoicePerformanceVocalActionSegmentV1;
  profile: BotAudioVoiceProfileV1;
  seed: string;
}): ArrayBuffer {
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  const durationMs = actionDurationMs(args.segment.action, args.segment.modifiers);
  const duration = durationMs / 1_000;
  const samples = new Float32Array(Math.ceil(duration * SAMPLE_RATE));
  const identity = Number(profile.baseVoiceId.replace("voice-", "")) || 1;
  const variant = hash32(`${args.seed}:${args.segment.action}`) % 4;
  const random = randomSource(hash32(`${args.seed}:${identity}:${variant}`));
  const baseF0 =
    (112 + (identity % 7) * 9) *
    (1 + profile.pitch * 0.22 + (variant - 1.5) * 0.025);
  const loudness = args.segment.modifiers.includes("loud")
    ? 0.82
    : args.segment.modifiers.includes("soft")
      ? 0.38
      : 0.58;
  let filteredNoise = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    const progress = time / duration;
    const noise = random();
    filteredNoise += (noise - filteredNoise) * (0.06 + profile.warmth * 0.025);
    const voiced = Math.sin(2 * Math.PI * baseF0 * time);
    const second = Math.sin(2 * Math.PI * baseF0 * 2.03 * time) * 0.35;
    let value = 0;

    switch (args.segment.action) {
      case "laugh":
      case "chuckle": {
        const pulses = args.segment.action === "laugh" ? 4 + (variant % 2) : 3;
        const pulse = Math.max(0, Math.sin(Math.PI * pulses * progress));
        value = pulse ** 1.6 * (voiced + second + filteredNoise * 0.22);
        break;
      }
      case "sigh":
      case "exhale":
        value = filteredNoise * (1 - progress) ** 0.45 + voiced * 0.08 * (1 - progress);
        break;
      case "gasp":
        value = filteredNoise * Math.sin(Math.PI * progress) ** 0.55 + voiced * 0.05;
        break;
      case "cough": {
        const burst = Math.max(0, Math.sin(Math.PI * Math.min(1, progress * 2.4)));
        const secondBurst = progress > 0.48
          ? Math.max(0, Math.sin(Math.PI * (progress - 0.48) * 2.1)) * 0.5
          : 0;
        value = (filteredNoise * 1.3 + voiced * 0.2) * (burst + secondBurst);
        break;
      }
      case "throat-clear":
        value =
          (voiced * 0.7 + second * 0.25 + filteredNoise * 0.35) *
          (0.45 + 0.55 * Math.sin(Math.PI * 2 * progress) ** 2);
        break;
      case "snort":
        value = filteredNoise * (0.5 + 0.5 * Math.sin(Math.PI * 3 * progress) ** 2);
        break;
      case "groan":
        value =
          Math.sin(2 * Math.PI * baseF0 * (1 - progress * 0.14) * time) * 0.8 +
          second * 0.18;
        break;
      case "sob":
        value =
          (voiced + filteredNoise * 0.25) *
          Math.max(0.12, Math.sin(Math.PI * (3 + variant % 2) * progress) ** 2);
        break;
      case "yawn":
        value =
          Math.sin(2 * Math.PI * baseF0 * (0.8 + progress * 0.25) * time) * 0.55 +
          filteredNoise * 0.18;
        break;
    }
    samples[index] = value * envelope(time, duration) * loudness;
  }
  return writeWave(samples);
}

/** A bounded, deterministic, zero-network reaction bank shaped per archetype. */
export function localVocalActionWave(args: {
  segment: VoicePerformanceVocalActionSegmentV1;
  profile: BotAudioVoiceProfileV1;
  seed: string;
}): ArrayBuffer {
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  const cacheKey = JSON.stringify([
    profile.baseVoiceId,
    profile.pitch,
    profile.warmth,
    profile.openness,
    profile.weight,
    args.segment.action,
    args.segment.modifiers,
    hash32(args.seed) % 4,
  ]);
  const cached = waveCache.get(cacheKey);
  if (cached) {
    waveCache.delete(cacheKey);
    waveCache.set(cacheKey, cached);
    return cached.slice(0);
  }
  const wave = renderedAction(args);
  waveCache.set(cacheKey, wave);
  while (waveCache.size > MAX_CACHE_ENTRIES) {
    const oldest = waveCache.keys().next().value as string | undefined;
    if (!oldest) break;
    waveCache.delete(oldest);
  }
  return wave.slice(0);
}

export function clearLocalVocalActionCache(): void {
  waveCache.clear();
}
