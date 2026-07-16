import {
  BOTCAST_LOCAL_INTRO_DURATION_MS,
  type BotcastIntroAudioState,
  type SignalPersonaTemperament,
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
  temperament: SignalPersonaTemperament;
  register: "low" | "low-middle" | "middle" | "middle-high";
  contour: "descending" | "turning" | "bouncing" | "stepwise" | "asymmetric" | "arch" | "ascending" | "balanced";
  ending: "hard" | "resolve" | "lift" | "button";
  notes: SignalSynthNote[];
};

type SignalSynthTemperamentRecipe = Omit<
  SignalSynthIdentPlan,
  "durationMs" | "temperament" | "notes"
> & {
  rootMidi: number;
  motif: readonly [number, number, number, number];
  supportIntervals: readonly number[];
  pulseBeats: readonly number[];
  melodyWaveform: SignalSynthNote["waveform"];
  supportWaveform: SignalSynthNote["waveform"];
  supportAttackMs: number;
  supportReleaseMs: number;
  pulseGain: number;
  melodyGain: number;
  melodyLowpassHz: number;
  accentInterval: number | null;
};

const SIGNAL_SYNTH_TEMPERAMENT_RECIPES: Record<
  SignalPersonaTemperament,
  SignalSynthTemperamentRecipe
> = {
  commanding: {
    tempoBpm: 92,
    register: "low",
    contour: "descending",
    ending: "hard",
    rootMidi: 43,
    motif: [7, 5, 3, 0],
    supportIntervals: [0, 7, 10],
    pulseBeats: [0, 2, 4, 6],
    melodyWaveform: "soft-square",
    supportWaveform: "sine",
    supportAttackMs: 120,
    supportReleaseMs: 420,
    pulseGain: 0.108,
    melodyGain: 0.112,
    melodyLowpassHz: 1_750,
    accentInterval: null,
  },
  contemplative: {
    tempoBpm: 94,
    register: "low-middle",
    contour: "turning",
    ending: "resolve",
    rootMidi: 46,
    motif: [0, 3, 7, 5],
    supportIntervals: [0, 7],
    pulseBeats: [0, 3, 6],
    melodyWaveform: "triangle",
    supportWaveform: "sine",
    supportAttackMs: 520,
    supportReleaseMs: 900,
    pulseGain: 0.052,
    melodyGain: 0.096,
    melodyLowpassHz: 2_250,
    accentInterval: null,
  },
  playful: {
    tempoBpm: 118,
    register: "middle-high",
    contour: "bouncing",
    ending: "lift",
    rootMidi: 51,
    motif: [0, 7, 4, 12],
    supportIntervals: [0, 4, 7],
    pulseBeats: [0, 1.5, 3, 4.5, 6],
    melodyWaveform: "triangle",
    supportWaveform: "triangle",
    supportAttackMs: 180,
    supportReleaseMs: 620,
    pulseGain: 0.088,
    melodyGain: 0.116,
    melodyLowpassHz: 3_650,
    accentInterval: 19,
  },
  analytical: {
    tempoBpm: 108,
    register: "middle",
    contour: "stepwise",
    ending: "button",
    rootMidi: 48,
    motif: [0, 2, 5, 7],
    supportIntervals: [0, 7],
    pulseBeats: [0, 2, 4, 6],
    melodyWaveform: "soft-square",
    supportWaveform: "sine",
    supportAttackMs: 160,
    supportReleaseMs: 540,
    pulseGain: 0.082,
    melodyGain: 0.105,
    melodyLowpassHz: 3_000,
    accentInterval: null,
  },
  inventive: {
    tempoBpm: 114,
    register: "middle",
    contour: "asymmetric",
    ending: "button",
    rootMidi: 48,
    motif: [0, 3, 7, 9],
    supportIntervals: [0, 4, 7],
    pulseBeats: [0, 1.5, 3, 4.5, 6],
    melodyWaveform: "soft-square",
    supportWaveform: "sine",
    supportAttackMs: 140,
    supportReleaseMs: 520,
    pulseGain: 0.09,
    melodyGain: 0.108,
    melodyLowpassHz: 3_300,
    accentInterval: 16,
  },
  warm: {
    tempoBpm: 100,
    register: "middle",
    contour: "arch",
    ending: "resolve",
    rootMidi: 48,
    motif: [0, 5, 7, 3],
    supportIntervals: [0, 3, 7],
    pulseBeats: [0, 2, 4, 6],
    melodyWaveform: "triangle",
    supportWaveform: "sine",
    supportAttackMs: 430,
    supportReleaseMs: 820,
    pulseGain: 0.068,
    melodyGain: 0.104,
    melodyLowpassHz: 2_700,
    accentInterval: 12,
  },
  creative: {
    tempoBpm: 110,
    register: "middle-high",
    contour: "asymmetric",
    ending: "resolve",
    rootMidi: 50,
    motif: [0, 5, 3, 10],
    supportIntervals: [0, 5, 10],
    pulseBeats: [0, 2, 3.5, 5, 6],
    melodyWaveform: "triangle",
    supportWaveform: "triangle",
    supportAttackMs: 250,
    supportReleaseMs: 700,
    pulseGain: 0.078,
    melodyGain: 0.11,
    melodyLowpassHz: 3_400,
    accentInterval: 17,
  },
  adventurous: {
    tempoBpm: 120,
    register: "middle",
    contour: "ascending",
    ending: "button",
    rootMidi: 49,
    motif: [0, 5, 7, 12],
    supportIntervals: [0, 5, 7],
    pulseBeats: [0, 1.5, 3, 4.5, 6],
    melodyWaveform: "soft-square",
    supportWaveform: "sine",
    supportAttackMs: 150,
    supportReleaseMs: 520,
    pulseGain: 0.104,
    melodyGain: 0.112,
    melodyLowpassHz: 3_200,
    accentInterval: 19,
  },
  neutral: {
    tempoBpm: 104,
    register: "middle",
    contour: "balanced",
    ending: "button",
    rootMidi: 48,
    motif: [0, 2, 7, 5],
    supportIntervals: [0, 7, 10],
    pulseBeats: [0, 2, 4, 6],
    melodyWaveform: "triangle",
    supportWaveform: "sine",
    supportAttackMs: 300,
    supportReleaseMs: 620,
    pulseGain: 0.078,
    melodyGain: 0.102,
    melodyLowpassHz: 2_800,
    accentInterval: null,
  },
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

/** Builds a compact broadcast ident from one host-persona temperament. */
export function buildSignalSynthIdentPlan(args: {
  temperament: SignalPersonaTemperament;
  seed: string;
}): SignalSynthIdentPlan {
  const recipe = SIGNAL_SYNTH_TEMPERAMENT_RECIPES[args.temperament];
  const hash = stableHash(args.seed);
  const tempoBpm = recipe.tempoBpm;
  const beatMs = 60_000 / tempoBpm;
  const root = recipe.rootMidi + (hash % 3);
  const notes: SignalSynthNote[] = [];

  for (const interval of recipe.supportIntervals) {
    notes.push({
      startMs: 0,
      durationMs: beatMs * (args.temperament === "commanding" ? 0.9 : 1.45),
      midi: root + interval,
      gain: interval === 0 ? 0.036 : 0.021,
      waveform: recipe.supportWaveform,
      attackMs: recipe.supportAttackMs,
      releaseMs: recipe.supportReleaseMs,
      lowpassHz: Math.max(950, recipe.melodyLowpassHz - 1_450),
    });
  }

  for (const beat of recipe.pulseBeats) {
    notes.push({
      startMs: 180 + beat * beatMs,
      durationMs: beatMs * 0.82,
      midi: root - 12 + (
        beat === recipe.pulseBeats[recipe.pulseBeats.length - 1] &&
        recipe.ending !== "hard"
          ? 7
          : 0
      ),
      gain: recipe.pulseGain,
      waveform: "soft-square",
      attackMs: recipe.ending === "hard" ? 5 : 12,
      releaseMs: 190,
      lowpassHz: recipe.ending === "hard" ? 620 : 470,
    });
  }

  const motifBeats = [0, 1, 2.25, 3.75];
  const melodyOffset = args.temperament === "commanding"
    ? 0
    : args.temperament === "contemplative"
      ? 7
      : 12;
  recipe.motif.forEach((interval, index) => {
    const finalNote = index === recipe.motif.length - 1;
    notes.push({
      startMs: 60 + motifBeats[index]! * beatMs,
      durationMs: finalNote
        ? beatMs * (recipe.ending === "hard" ? 0.72 : 1.8)
        : beatMs * 0.7,
      midi: root + melodyOffset + interval,
      gain: finalNote ? recipe.melodyGain + 0.012 : recipe.melodyGain,
      waveform: recipe.melodyWaveform,
      attackMs: recipe.ending === "hard" ? 4 : 10,
      releaseMs: finalNote
        ? recipe.ending === "hard" || recipe.ending === "button"
          ? 220
          : 620
        : 210,
      lowpassHz: recipe.melodyLowpassHz,
    });
  });

  if (recipe.accentInterval !== null) {
    notes.push({
      startMs: 60 + 3.75 * beatMs,
      durationMs: beatMs * 1.35,
      midi: root + recipe.accentInterval,
      gain: 0.042,
      waveform: recipe.supportWaveform,
      attackMs: 16,
      releaseMs: recipe.ending === "button" ? 360 : 620,
      lowpassHz: recipe.melodyLowpassHz + 450,
    });
  }

  return {
    durationMs: SIGNAL_SYNTH_IDENT_DURATION_MS,
    tempoBpm,
    temperament: args.temperament,
    register: recipe.register,
    contour: recipe.contour,
    ending: recipe.ending,
    notes,
  };
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
    temperament: "neutral",
    register: "middle",
    contour: "descending",
    ending: "resolve",
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
  temperament: SignalPersonaTemperament;
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
    const wave = encodeSignalSynthIdentWave(buildSignalSynthIdentPlan({
      temperament: args.temperament,
      seed: args.seed,
    }));
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
