import {
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";

export interface BottishNote {
  startMs: number;
  durationMs: number;
  frequencyHz: number;
  endFrequencyHz: number;
  gain: number;
  waveform: OscillatorType;
  lowpassHz: number;
}

export interface BottishPlan {
  notes: BottishNote[];
  durationMs: number;
}

const VOICE_BASES = {
  "voice-1": { frequency: 310, waveform: "sine" as OscillatorType },
  "voice-2": { frequency: 235, waveform: "triangle" as OscillatorType },
  "voice-3": { frequency: 390, waveform: "sine" as OscillatorType },
  "voice-4": { frequency: 180, waveform: "square" as OscillatorType },
  "voice-5": { frequency: 475, waveform: "triangle" as OscillatorType },
} as const;

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function isSpeakableCharacter(character: string): boolean {
  return /[\p{L}\p{N}]/u.test(character);
}

export function buildBottishPlan(
  text: string,
  rawProfile: BotAudioVoiceProfileV1,
  seed = text
): BottishPlan {
  const profile = normalizeBotAudioVoiceProfileV1(rawProfile);
  const voice = VOICE_BASES[profile.baseVoiceId];
  const pitchMultiplier = 2 ** (profile.pitch * 0.7);
  const noteMs = Math.round(55 * (1 - profile.pace * 0.38));
  const gapMs = Math.round(18 * (1 - profile.pace * 0.42));
  const warmthLowpass = Math.round(2400 - profile.warmth * 900);
  const waveform = profile.warmth > 0.55 ? "sine" : voice.waveform;
  const notes: BottishNote[] = [];
  let cursorMs = 0;
  let spokenIndex = 0;

  for (const character of Array.from(text).slice(0, 1200)) {
    if (!isSpeakableCharacter(character)) {
      if (/[.!?]/.test(character)) cursorMs += noteMs * 2.2;
      else if (/[,;:]/.test(character)) cursorMs += noteMs * 1.15;
      else if (/\s/.test(character)) cursorMs += gapMs * 1.4;
      continue;
    }
    if (notes.length >= 420) break;

    const random = stableUnit(`${seed}:${spokenIndex}:${character}`);
    const syllableStep = [-5, -2, 0, 2, 4, 7][Math.floor(random * 6)] ?? 0;
    const liltWave = Math.sin(spokenIndex * 0.82) * profile.lilt * 4.5;
    const frequencyHz = Math.max(
      80,
      Math.min(1400, voice.frequency * pitchMultiplier * 2 ** ((syllableStep + liltWave) / 12))
    );
    const glide = (random - 0.5) * (0.08 + Math.abs(profile.lilt) * 0.22);
    notes.push({
      startMs: Math.round(cursorMs),
      durationMs: noteMs,
      frequencyHz: Math.round(frequencyHz * 10) / 10,
      endFrequencyHz: Math.round(frequencyHz * (1 + glide) * 10) / 10,
      gain: Math.max(0.025, Math.min(0.085, 0.052 - profile.warmth * 0.012)),
      waveform,
      lowpassHz: Math.max(900, Math.min(4800, warmthLowpass)),
    });
    cursorMs += noteMs + gapMs;
    spokenIndex += 1;
  }

  return {
    notes,
    durationMs: notes.length > 0 ? Math.round(cursorMs + 50) : 0,
  };
}

let audioContext: AudioContext | null = null;
let activeNodes: AudioScheduledSourceNode[] = [];
let activeTimer: number | null = null;
let activeResolve: (() => void) | null = null;
let generation = 0;
let queue: Promise<void> = Promise.resolve();

function contextForPlayback(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return null;
  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

export async function prepareBottishVoice(): Promise<void> {
  const context = contextForPlayback();
  if (context?.state === "suspended") await context.resume();
}

function stopScheduledNodes(): void {
  for (const node of activeNodes) {
    try {
      node.stop();
    } catch {
      // A node may already have completed naturally.
    }
  }
  activeNodes = [];
  if (activeTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(activeTimer);
    activeTimer = null;
  }
  activeResolve?.();
  activeResolve = null;
}

export function stopBottishVoice(): void {
  generation += 1;
  stopScheduledNodes();
  queue = Promise.resolve();
}

async function playPlan(plan: BottishPlan, expectedGeneration: number): Promise<void> {
  if (plan.durationMs <= 0 || expectedGeneration !== generation) return;
  const context = contextForPlayback();
  if (!context) return;
  if (context.state === "suspended") await context.resume();
  if (expectedGeneration !== generation) return;

  const startAt = context.currentTime + 0.025;
  for (const note of plan.notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const noteStart = startAt + note.startMs / 1000;
    const noteEnd = noteStart + note.durationMs / 1000;
    oscillator.type = note.waveform;
    oscillator.frequency.setValueAtTime(note.frequencyHz, noteStart);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, note.endFrequencyHz),
      noteEnd
    );
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(note.lowpassHz, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(filter).connect(gain).connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.01);
    activeNodes.push(oscillator);
  }

  await new Promise<void>((resolve) => {
    activeResolve = resolve;
    activeTimer = window.setTimeout(() => {
      activeNodes = [];
      activeTimer = null;
      activeResolve = null;
      resolve();
    }, plan.durationMs + 80);
  });
}

export function enqueueBottishVoice(
  text: string,
  profile: BotAudioVoiceProfileV1,
  seed: string
): Promise<void> {
  const expectedGeneration = generation;
  const plan = buildBottishPlan(text, profile, seed);
  queue = queue
    .catch(() => undefined)
    .then(() => playPlan(plan, expectedGeneration));
  return queue;
}
