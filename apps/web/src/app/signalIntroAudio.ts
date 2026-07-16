import {
  BOTCAST_LOCAL_INTRO_DURATION_MS,
  type BotcastIntroAudioState,
} from "@localai/shared";

export const SIGNAL_SYNTH_IDENT_DURATION_MS = BOTCAST_LOCAL_INTRO_DURATION_MS;
export const SIGNAL_SYNTH_OUTRO_DURATION_MS = 1_800;
export const SIGNAL_EPISODE_INTRO_LEAD_IN_MS = 180;

export type SignalSynthNote = {
  startMs: number;
  durationMs: number;
  midi: number;
  gain: number;
  waveform: "sine" | "triangle" | "soft-square";
  attackMs: number;
  releaseMs: number;
  lowpassHz: number;
};

export type SignalSynthIdentPlan = {
  durationMs: number;
  tempoBpm: number;
  notes: SignalSynthNote[];
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function midiFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Builds a compact, deterministic broadcast ident from MIDI-like events. */
export function buildSignalSynthIdentPlan(seed: string): SignalSynthIdentPlan {
  const hash = stableHash(seed);
  const tempoBpm = 108 + (hash % 17);
  const beatMs = 60_000 / tempoBpm;
  const root = 47 + ((hash >>> 5) % 9);
  const scales = [
    [0, 2, 3, 7, 10],
    [0, 3, 5, 7, 10],
    [0, 2, 5, 7, 9],
  ] as const;
  const scale = scales[(hash >>> 9) % scales.length]!;
  const motif = [
    scale[(hash >>> 12) % scale.length]!,
    scale[(hash >>> 15) % scale.length]!,
    scale[(hash >>> 18) % scale.length]!,
    12,
  ];
  const notes: SignalSynthNote[] = [];

  for (const interval of [0, 7, 10]) {
    notes.push({
      startMs: 0,
      durationMs: SIGNAL_SYNTH_IDENT_DURATION_MS - 260,
      midi: root + interval,
      gain: interval === 0 ? 0.032 : 0.022,
      waveform: "sine",
      attackMs: 520,
      releaseMs: 900,
      lowpassHz: 1_150,
    });
  }

  for (const beat of [0, 2, 4, 6]) {
    notes.push({
      startMs: 180 + beat * beatMs,
      durationMs: beatMs * 0.82,
      midi: root - 12 + (beat === 6 ? 7 : 0),
      gain: 0.085,
      waveform: "soft-square",
      attackMs: 12,
      releaseMs: 190,
      lowpassHz: 420,
    });
  }

  const motifBeats = [0.5, 1.5, 2.75, 4.25];
  motif.forEach((interval, index) => {
    notes.push({
      startMs: 260 + motifBeats[index]! * beatMs,
      durationMs: index === motif.length - 1 ? beatMs * 2.1 : beatMs * 0.74,
      midi: root + 12 + interval,
      gain: index === motif.length - 1 ? 0.13 : 0.105,
      waveform: "triangle",
      attackMs: 8,
      releaseMs: index === motif.length - 1 ? 720 : 240,
      lowpassHz: 2_900,
    });
  });

  notes.push({
    startMs: 260 + 4.25 * beatMs,
    durationMs: beatMs * 2.1,
    midi: root + 19,
    gain: 0.047,
    waveform: "sine",
    attackMs: 16,
    releaseMs: 760,
    lowpassHz: 3_600,
  });

  return { durationMs: SIGNAL_SYNTH_IDENT_DURATION_MS, tempoBpm, notes };
}

/** Builds a shorter resolving cadence for the end of a Signal episode. */
export function buildSignalSynthOutroPlan(seed: string): SignalSynthIdentPlan {
  const hash = stableHash(`${seed}:outro`);
  const root = 45 + ((hash >>> 4) % 9);
  const notes: SignalSynthNote[] = [
    {
      startMs: 0,
      durationMs: 1_650,
      midi: root,
      gain: 0.042,
      waveform: "sine",
      attackMs: 80,
      releaseMs: 620,
      lowpassHz: 1_050,
    },
    {
      startMs: 0,
      durationMs: 1_650,
      midi: root + 7,
      gain: 0.026,
      waveform: "sine",
      attackMs: 100,
      releaseMs: 660,
      lowpassHz: 1_350,
    },
  ];
  [12, 7, hash % 2 === 0 ? 3 : 4, 0].forEach((interval, index) => {
    notes.push({
      startMs: 90 + index * 360,
      durationMs: index === 3 ? 760 : 420,
      midi: root + 12 + interval,
      gain: index === 3 ? 0.105 : 0.082,
      waveform: "triangle",
      attackMs: 10,
      releaseMs: index === 3 ? 520 : 180,
      lowpassHz: 2_450,
    });
  });
  return {
    durationMs: SIGNAL_SYNTH_OUTRO_DURATION_MS,
    tempoBpm: 100,
    notes,
  };
}

function waveSample(waveform: SignalSynthNote["waveform"], phase: number): number {
  const sine = Math.sin(phase);
  if (waveform === "triangle") return (2 / Math.PI) * Math.asin(sine);
  if (waveform === "soft-square") return Math.tanh(sine * 2.4);
  return sine;
}

function writeWaveText(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function encodeSignalSynthIdentWave(
  plan: SignalSynthIdentPlan,
  sampleRate = 22_050,
): ArrayBuffer {
  const sampleCount = Math.max(1, Math.ceil((plan.durationMs / 1000) * sampleRate));
  const samples = new Float32Array(sampleCount);

  for (const note of plan.notes) {
    const startSample = Math.max(0, Math.floor((note.startMs / 1000) * sampleRate));
    const noteSampleCount = Math.max(1, Math.floor((note.durationMs / 1000) * sampleRate));
    const attackSamples = Math.max(1, Math.floor((note.attackMs / 1000) * sampleRate));
    const releaseSamples = Math.max(1, Math.floor((note.releaseMs / 1000) * sampleRate));
    const filterAlpha = 1 - Math.exp((-2 * Math.PI * note.lowpassHz) / sampleRate);
    const frequency = midiFrequency(note.midi);
    let phase = 0;
    let filtered = 0;
    for (let offset = 0; offset < noteSampleCount; offset += 1) {
      const target = startSample + offset;
      if (target >= samples.length) break;
      phase += (2 * Math.PI * frequency) / sampleRate;
      filtered += filterAlpha * (waveSample(note.waveform, phase) - filtered);
      const attack = Math.min(1, offset / attackSamples);
      const release = Math.min(1, (noteSampleCount - offset) / releaseSamples);
      samples[target] += filtered * note.gain * Math.max(0, Math.min(attack, release));
    }
  }

  const output = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(output);
  writeWaveText(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeWaveText(view, 8, "WAVE");
  writeWaveText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeWaveText(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const mixed = Math.tanh((samples[index] ?? 0) * 1.35) * 0.78;
    view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, mixed)) * 0x7fff), true);
  }
  return output;
}

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let activeResolve: (() => void) | null = null;

export function stopSignalIntroAudio(): void {
  activeAudio?.pause();
  activeAudio = null;
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = null;
  const resolve = activeResolve;
  activeResolve = null;
  resolve?.();
}

export function playSignalIntroAudio(args: {
  seed: string;
  introAudio: BotcastIntroAudioState;
  enabled: boolean;
  volume: number;
  startDelayMs?: number;
}): { durationMs: number; finished: Promise<void> } {
  stopSignalIntroAudio();
  const durationMs = args.introAudio.source === "elevenlabs"
    ? Math.max(3_000, args.introAudio.durationMs)
    : SIGNAL_SYNTH_IDENT_DURATION_MS;
  if (
    !args.enabled ||
    typeof Audio === "undefined" ||
    typeof URL === "undefined"
  ) {
    return { durationMs, finished: Promise.resolve() };
  }

  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = Math.max(0, Math.min(1, args.volume));
  if (args.introAudio.source === "elevenlabs" && args.introAudio.audioUrl) {
    audio.src = args.introAudio.audioUrl;
  } else {
    const wave = encodeSignalSynthIdentWave(buildSignalSynthIdentPlan(args.seed));
    activeObjectUrl = URL.createObjectURL(new Blob([wave], { type: "audio/wav" }));
    audio.src = activeObjectUrl;
  }
  activeAudio = audio;

  const finished = new Promise<void>((resolve) => {
    activeResolve = resolve;
    const finish = () => {
      if (activeAudio !== audio) return;
      activeAudio = null;
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
      if (activeResolve === resolve) activeResolve = null;
      resolve();
    };
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    audio.load();
    const startDelayMs = Math.max(0, Math.min(1_000, args.startDelayMs ?? 0));
    const beginPlayback = () => {
      if (activeAudio !== audio) return;
      void audio.play().catch(finish);
    };
    if (startDelayMs > 0) {
      window.setTimeout(beginPlayback, startDelayMs);
    } else {
      beginPlayback();
    }
    window.setTimeout(finish, startDelayMs + durationMs + 1_500);
  });
  return { durationMs, finished };
}

export function playSignalOutroAudio(args: {
  seed: string;
  enabled: boolean;
  volume: number;
}): { durationMs: number; finished: Promise<void> } {
  stopSignalIntroAudio();
  const durationMs = SIGNAL_SYNTH_OUTRO_DURATION_MS;
  if (
    !args.enabled ||
    typeof Audio === "undefined" ||
    typeof URL === "undefined"
  ) {
    return { durationMs, finished: Promise.resolve() };
  }

  const wave = encodeSignalSynthIdentWave(buildSignalSynthOutroPlan(args.seed));
  activeObjectUrl = URL.createObjectURL(new Blob([wave], { type: "audio/wav" }));
  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = Math.max(0, Math.min(1, args.volume * 0.82));
  audio.src = activeObjectUrl;
  activeAudio = audio;

  const finished = new Promise<void>((resolve) => {
    activeResolve = resolve;
    const finish = () => {
      if (activeAudio !== audio) return;
      activeAudio = null;
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
      if (activeResolve === resolve) activeResolve = null;
      resolve();
    };
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    void audio.play().catch(finish);
    window.setTimeout(finish, durationMs + 1_000);
  });
  return { durationMs, finished };
}
