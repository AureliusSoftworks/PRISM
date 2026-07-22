import {
  BOTCAST_LOCAL_INTRO_DURATION_MS,
  BOTCAST_LOCAL_OUTDENT_DURATION_MS,
  type BotcastIntroAudioState,
  type SignalMusicPalette,
  type SignalMusicProfile,
  type SignalPersonaTemperament,
} from "@localai/shared";
import { connectSignalLiveMediaElement } from "./signalLiveAudioRoute.ts";

export const SIGNAL_SYNTH_IDENT_DURATION_MS = BOTCAST_LOCAL_INTRO_DURATION_MS;
export const SIGNAL_SYNTH_OUTDENT_DURATION_MS =
  BOTCAST_LOCAL_OUTDENT_DURATION_MS;
export const SIGNAL_EPISODE_INTRO_LEAD_IN_MS = 180;
export const SIGNAL_AUDIO_STOP_FADE_MS = 320;

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
  palette: SignalMusicPalette;
  register: "low" | "low-middle" | "middle" | "middle-high";
  contour: "descending" | "turning" | "bouncing" | "stepwise" | "asymmetric" | "arch" | "ascending" | "balanced";
  ending: "hard" | "resolve" | "lift" | "button";
  notes: SignalSynthNote[];
};

type SignalSynthTemperamentRecipe = Omit<
  SignalSynthIdentPlan,
  "durationMs" | "temperament" | "palette" | "notes"
> & {
  rootMidi: number;
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

type SignalSynthPaletteRecipe = {
  rootShift: number;
  melodyWaveform: SignalSynthNote["waveform"] | null;
  supportWaveform: SignalSynthNote["waveform"] | null;
  supportAttackScale: number;
  supportReleaseScale: number;
  melodyAttackMs: number | null;
  melodyDurationScale: number;
  melodyReleaseScale: number;
  lowpassScale: number;
  pulseGainScale: number;
};

const SIGNAL_SYNTH_PALETTE_RECIPES: Record<
  SignalMusicPalette,
  SignalSynthPaletteRecipe
> = {
  cinematic: {
    rootShift: -3,
    melodyWaveform: "soft-square",
    supportWaveform: "sine",
    supportAttackScale: 0.72,
    supportReleaseScale: 1.2,
    melodyAttackMs: 7,
    melodyDurationScale: 1.12,
    melodyReleaseScale: 1.15,
    lowpassScale: 0.78,
    pulseGainScale: 1.16,
  },
  magical: {
    rootShift: 6,
    melodyWaveform: "sine",
    supportWaveform: "triangle",
    supportAttackScale: 0.64,
    supportReleaseScale: 0.92,
    melodyAttackMs: 4,
    melodyDurationScale: 0.88,
    melodyReleaseScale: 0.9,
    lowpassScale: 1.24,
    pulseGainScale: 0.68,
  },
  nautical: {
    rootShift: 4,
    melodyWaveform: "triangle",
    supportWaveform: "triangle",
    supportAttackScale: 0.34,
    supportReleaseScale: 0.58,
    melodyAttackMs: 3,
    melodyDurationScale: 0.58,
    melodyReleaseScale: 0.55,
    lowpassScale: 1.18,
    pulseGainScale: 0.88,
  },
  mechanical: {
    rootShift: 0,
    melodyWaveform: "soft-square",
    supportWaveform: "soft-square",
    supportAttackScale: 0.52,
    supportReleaseScale: 0.72,
    melodyAttackMs: 4,
    melodyDurationScale: 0.78,
    melodyReleaseScale: 0.7,
    lowpassScale: 0.94,
    pulseGainScale: 1.05,
  },
  noir: {
    rootShift: -2,
    melodyWaveform: "triangle",
    supportWaveform: "sine",
    supportAttackScale: 0.78,
    supportReleaseScale: 1.12,
    melodyAttackMs: 12,
    melodyDurationScale: 1.05,
    melodyReleaseScale: 1.12,
    lowpassScale: 0.76,
    pulseGainScale: 0.84,
  },
  chamber: {
    rootShift: 0,
    melodyWaveform: "triangle",
    supportWaveform: "sine",
    supportAttackScale: 1.08,
    supportReleaseScale: 1.2,
    melodyAttackMs: 14,
    melodyDurationScale: 1.08,
    melodyReleaseScale: 1.18,
    lowpassScale: 0.9,
    pulseGainScale: 0.72,
  },
  folk: {
    rootShift: 2,
    melodyWaveform: "triangle",
    supportWaveform: "triangle",
    supportAttackScale: 0.48,
    supportReleaseScale: 0.7,
    melodyAttackMs: 4,
    melodyDurationScale: 0.68,
    melodyReleaseScale: 0.66,
    lowpassScale: 1.08,
    pulseGainScale: 0.86,
  },
  theatrical: {
    rootShift: 3,
    melodyWaveform: "triangle",
    supportWaveform: "triangle",
    supportAttackScale: 0.44,
    supportReleaseScale: 0.72,
    melodyAttackMs: 3,
    melodyDurationScale: 0.7,
    melodyReleaseScale: 0.68,
    lowpassScale: 1.16,
    pulseGainScale: 0.96,
  },
  cosmic: {
    rootShift: 5,
    melodyWaveform: "sine",
    supportWaveform: "sine",
    supportAttackScale: 1.16,
    supportReleaseScale: 1.32,
    melodyAttackMs: 18,
    melodyDurationScale: 1.16,
    melodyReleaseScale: 1.26,
    lowpassScale: 1.08,
    pulseGainScale: 0.82,
  },
  broadcast: {
    rootShift: 0,
    melodyWaveform: null,
    supportWaveform: null,
    supportAttackScale: 1,
    supportReleaseScale: 1,
    melodyAttackMs: null,
    melodyDurationScale: 1,
    melodyReleaseScale: 1,
    lowpassScale: 1,
    pulseGainScale: 1,
  },
};

const SIGNAL_SYNTH_PALETTE_MOTIF_BEATS: Record<
  SignalMusicPalette,
  readonly [number, number, number, number]
> = {
  cinematic: [0, 0.8, 2.4, 3.1],
  magical: [0, 0.65, 1.9, 3.5],
  nautical: [0, 0.35, 2.25, 3],
  mechanical: [0, 0.75, 1.5, 2.6],
  noir: [0, 1.7, 3, 4.1],
  chamber: [0, 1.2, 2.8, 3.7],
  folk: [0, 0.75, 2.5, 3.25],
  theatrical: [0, 0.35, 2.1, 3.5],
  cosmic: [0, 0.8, 1.6, 3.7],
  broadcast: [0, 1, 2.25, 3.75],
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

/** Builds a compact ident from the same provider-safe profile used online. */
export function buildSignalSynthIdentPlan(args: {
  profile: SignalMusicProfile;
  seed: string;
}): SignalSynthIdentPlan {
  const recipe = SIGNAL_SYNTH_TEMPERAMENT_RECIPES[args.profile.temperament];
  const palette = SIGNAL_SYNTH_PALETTE_RECIPES[args.profile.palette];
  const hash = stableHash(args.seed);
  const tempoBpm = args.profile.tempoBpm;
  const beatMs = 60_000 / tempoBpm;
  const root = recipe.rootMidi + palette.rootShift + (hash % 5) - 2;
  const notes: SignalSynthNote[] = [];
  const answerStartMs = Math.max(3_900, beatMs * 6.2);

  for (const phraseStartMs of [0, answerStartMs]) {
    for (const interval of recipe.supportIntervals) {
      notes.push({
        startMs: phraseStartMs,
        durationMs:
          beatMs * (phraseStartMs === 0 ? 1.45 : 2.7),
        midi: root + interval,
        gain: interval === 0 ? 0.036 : 0.021,
        waveform: palette.supportWaveform ?? recipe.supportWaveform,
        attackMs: recipe.supportAttackMs * palette.supportAttackScale,
        releaseMs: recipe.supportReleaseMs * palette.supportReleaseScale,
        lowpassHz: Math.max(
          950,
          recipe.melodyLowpassHz * palette.lowpassScale - 1_450,
        ),
      });
    }
  }

  for (const [phraseStartMs, pulseBeats] of [
    [0, recipe.pulseBeats],
    [answerStartMs, [0, 1.5, 3]],
  ] as const) {
    for (const beat of pulseBeats) {
      notes.push({
        startMs: phraseStartMs + 180 + beat * beatMs,
        durationMs: beatMs * 0.82,
        midi: root - 12 + (
          beat === pulseBeats[pulseBeats.length - 1] &&
          args.profile.ending !== "hard"
            ? 7
            : 0
        ),
        gain: recipe.pulseGain * palette.pulseGainScale,
        waveform: "soft-square",
        attackMs: args.profile.ending === "hard" ? 5 : 12,
        releaseMs: 190,
        lowpassHz: args.profile.ending === "hard" ? 620 : 470,
      });
    }
  }

  const motifBeats = SIGNAL_SYNTH_PALETTE_MOTIF_BEATS[args.profile.palette];
  const melodyOffset = args.profile.temperament === "commanding"
    ? 0
    : args.profile.temperament === "contemplative"
      ? 7
      : 12;
  args.profile.motifIntervals.forEach((interval, index) => {
    const finalNote = index === args.profile.motifIntervals.length - 1;
    notes.push({
      startMs: 60 + motifBeats[index]! * beatMs,
      durationMs: finalNote
        ? beatMs * (args.profile.ending === "hard" ? 0.72 : 1.8) *
          palette.melodyDurationScale
        : beatMs * 0.7 * palette.melodyDurationScale,
      midi: root + melodyOffset + interval,
      gain: finalNote ? recipe.melodyGain + 0.012 : recipe.melodyGain,
      waveform: palette.melodyWaveform ?? recipe.melodyWaveform,
      attackMs:
        palette.melodyAttackMs ?? (args.profile.ending === "hard" ? 4 : 10),
      releaseMs: finalNote
        ? (args.profile.ending === "hard" || args.profile.ending === "button"
            ? 220
            : 620) * palette.melodyReleaseScale
        : 210 * palette.melodyReleaseScale,
      lowpassHz: recipe.melodyLowpassHz * palette.lowpassScale,
    });
  });

  const answerIntervals = [
    args.profile.motifIntervals[1],
    args.profile.motifIntervals[2],
    args.profile.motifIntervals[3],
    args.profile.ending === "lift"
      ? args.profile.motifIntervals[3] + 7
      : 0,
  ] as const;
  const answerBeats = [0, 0.85, 2.05, 3.25] as const;
  answerIntervals.forEach((interval, index) => {
    const finalNote = index === answerIntervals.length - 1;
    notes.push({
      startMs:
        answerStartMs +
        (answerBeats[index]! + args.profile.variant * 0.08) * beatMs,
      durationMs: finalNote
        ? beatMs * (args.profile.ending === "hard" ? 0.8 : 1.75)
        : beatMs * 0.74,
      midi: root + melodyOffset + interval,
      gain: finalNote ? recipe.melodyGain + 0.018 : recipe.melodyGain * 0.96,
      waveform: palette.melodyWaveform ?? recipe.melodyWaveform,
      attackMs:
        palette.melodyAttackMs ?? (args.profile.ending === "hard" ? 4 : 10),
      releaseMs: finalNote
        ? (args.profile.ending === "hard" || args.profile.ending === "button"
            ? 260
            : 680) * palette.melodyReleaseScale
        : 220 * palette.melodyReleaseScale,
      lowpassHz: recipe.melodyLowpassHz * palette.lowpassScale,
    });
  });

  if (recipe.accentInterval !== null) {
    notes.push({
      startMs: 60 + 3.75 * beatMs,
      durationMs: beatMs * 1.35,
      midi: root + recipe.accentInterval,
      gain: 0.042,
      waveform: palette.supportWaveform ?? recipe.supportWaveform,
      attackMs: 16,
      releaseMs: (args.profile.ending === "button" ? 360 : 620) *
        palette.melodyReleaseScale,
      lowpassHz: recipe.melodyLowpassHz * palette.lowpassScale + 450,
    });
  }

  return {
    durationMs: SIGNAL_SYNTH_IDENT_DURATION_MS,
    tempoBpm,
    temperament: args.profile.temperament,
    palette: args.profile.palette,
    register: args.profile.register,
    contour: args.profile.contour,
    ending: args.profile.ending,
    notes,
  };
}

/** Builds the shorter closing half of one host's stable audio signature. */
export function buildSignalSynthOutdentPlan(args: {
  profile: SignalMusicProfile;
  seed: string;
}): SignalSynthIdentPlan {
  const recipe = SIGNAL_SYNTH_TEMPERAMENT_RECIPES[args.profile.temperament];
  const palette = SIGNAL_SYNTH_PALETTE_RECIPES[args.profile.palette];
  const hash = stableHash(args.seed);
  const beatMs = 60_000 / args.profile.tempoBpm;
  const root = recipe.rootMidi + palette.rootShift + (hash % 5) - 2;
  const melodyOffset = args.profile.temperament === "commanding"
    ? 0
    : args.profile.temperament === "contemplative"
      ? 7
      : 12;
  const notes: SignalSynthNote[] = recipe.supportIntervals.map(
    (interval) => ({
      startMs: 0,
      durationMs: SIGNAL_SYNTH_OUTDENT_DURATION_MS - 180,
      midi: root + interval,
      gain: interval === 0 ? 0.034 : 0.019,
      waveform: palette.supportWaveform ?? recipe.supportWaveform,
      attackMs: recipe.supportAttackMs * palette.supportAttackScale,
      releaseMs: Math.max(
        540,
        recipe.supportReleaseMs * palette.supportReleaseScale,
      ),
      lowpassHz: Math.max(
        900,
        recipe.melodyLowpassHz * palette.lowpassScale - 1_500,
      ),
    }),
  );
  const recallIntervals = [
    args.profile.motifIntervals[2],
    args.profile.motifIntervals[1],
    args.profile.motifIntervals[3],
    0,
  ] as const;
  const recallBeats = [0, 0.72, 1.55, 2.65] as const;
  recallIntervals.forEach((interval, index) => {
    const finalNote = index === recallIntervals.length - 1;
    notes.push({
      startMs: 50 + recallBeats[index]! * beatMs,
      durationMs: finalNote ? beatMs * 1.2 : beatMs * 0.58,
      midi: root + melodyOffset + interval,
      gain: finalNote ? recipe.melodyGain + 0.014 : recipe.melodyGain * 0.9,
      waveform: palette.melodyWaveform ?? recipe.melodyWaveform,
      attackMs: palette.melodyAttackMs ?? 8,
      releaseMs: finalNote
        ? Math.max(460, 620 * palette.melodyReleaseScale)
        : 170 * palette.melodyReleaseScale,
      lowpassHz: recipe.melodyLowpassHz * palette.lowpassScale,
    });
  });
  return {
    durationMs: SIGNAL_SYNTH_OUTDENT_DURATION_MS,
    tempoBpm: args.profile.tempoBpm,
    temperament: args.profile.temperament,
    palette: args.profile.palette,
    register: args.profile.register,
    contour: args.profile.contour,
    ending: args.profile.ending,
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

type ActiveSignalAudio = {
  audio: HTMLAudioElement;
  objectUrl: string | null;
  resolve: () => void;
  startTimer: number | null;
  watchdogTimer: number | null;
  fadeTimer: number | null;
  disconnectRecordingRoute: (() => void) | null;
  stopping: boolean;
  settled: boolean;
};

let activeSignalAudio: ActiveSignalAudio | null = null;

export function signalAudioFadeVolumeAt(
  startVolume: number,
  progress: number,
): number {
  const normalizedVolume = Math.max(0, Math.min(1, startVolume));
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  return normalizedVolume * Math.cos((normalizedProgress * Math.PI) / 2);
}

function releaseSignalAudio(state: ActiveSignalAudio): void {
  if (state.settled) return;
  state.settled = true;
  state.stopping = false;
  if (state.startTimer !== null) window.clearTimeout(state.startTimer);
  if (state.watchdogTimer !== null) window.clearTimeout(state.watchdogTimer);
  if (state.fadeTimer !== null) window.clearTimeout(state.fadeTimer);
  state.startTimer = null;
  state.watchdogTimer = null;
  state.fadeTimer = null;
  state.disconnectRecordingRoute?.();
  state.disconnectRecordingRoute = null;
  if (activeSignalAudio === state) activeSignalAudio = null;
  try {
    state.audio.pause();
    state.audio.removeAttribute("src");
    state.audio.load();
  } catch {
    // The promise still settles if a browser has already released the element.
  }
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.resolve();
}

function fadeAndReleaseSignalAudio(
  state: ActiveSignalAudio,
  fadeOutMs: number,
): void {
  if (state.settled || state.stopping) return;
  state.stopping = true;
  if (activeSignalAudio === state) activeSignalAudio = null;
  if (state.startTimer !== null) {
    window.clearTimeout(state.startTimer);
    state.startTimer = null;
  }
  if (state.watchdogTimer !== null) {
    window.clearTimeout(state.watchdogTimer);
    state.watchdogTimer = null;
  }
  const durationMs = Math.max(0, Math.round(fadeOutMs));
  const startVolume = state.audio.volume;
  if (durationMs === 0 || state.audio.paused || startVolume <= 0) {
    releaseSignalAudio(state);
    return;
  }
  const startedAt = Date.now();
  const step = (): void => {
    if (state.settled) return;
    const progress = (Date.now() - startedAt) / durationMs;
    state.audio.volume = signalAudioFadeVolumeAt(startVolume, progress);
    if (progress >= 1) {
      releaseSignalAudio(state);
      return;
    }
    state.fadeTimer = window.setTimeout(step, 16);
  };
  step();
}

export function stopSignalIntroAudio(): void {
  const state = activeSignalAudio;
  if (!state) return;
  fadeAndReleaseSignalAudio(state, SIGNAL_AUDIO_STOP_FADE_MS);
}

function playSignalAudio(args: {
  audio: HTMLAudioElement;
  objectUrl: string | null;
  durationMs: number;
  startDelayMs?: number;
}): Promise<void> {
  let settle!: () => void;
  const finished = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const state: ActiveSignalAudio = {
    audio: args.audio,
    objectUrl: args.objectUrl,
    resolve: settle,
    startTimer: null,
    watchdogTimer: null,
    fadeTimer: null,
    disconnectRecordingRoute: connectSignalLiveMediaElement(args.audio),
    stopping: false,
    settled: false,
  };
  activeSignalAudio = state;
  const finish = (): void => {
    if (state.stopping) return;
    releaseSignalAudio(state);
  };
  args.audio.addEventListener("ended", finish, { once: true });
  args.audio.addEventListener("error", finish, { once: true });
  args.audio.load();
  const startDelayMs = Math.max(0, Math.min(1_000, args.startDelayMs ?? 0));
  const beginPlayback = (): void => {
    state.startTimer = null;
    if (state.settled || state.stopping || activeSignalAudio !== state) return;
    void args.audio.play().catch(finish);
  };
  if (startDelayMs > 0) {
    state.startTimer = window.setTimeout(beginPlayback, startDelayMs);
  } else {
    beginPlayback();
  }
  state.watchdogTimer = window.setTimeout(
    () => fadeAndReleaseSignalAudio(state, SIGNAL_AUDIO_STOP_FADE_MS),
    startDelayMs + args.durationMs + 1_500,
  );
  return finished;
}

export function playSignalIntroAudio(args: {
  profile: SignalMusicProfile;
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
  let objectUrl: string | null = null;
  if (args.introAudio.source === "elevenlabs" && args.introAudio.audioUrl) {
    audio.src = args.introAudio.audioUrl;
  } else {
    const wave = encodeSignalSynthIdentWave(buildSignalSynthIdentPlan({
      profile: args.profile,
      seed: args.seed,
    }));
    objectUrl = URL.createObjectURL(new Blob([wave], { type: "audio/wav" }));
    audio.src = objectUrl;
  }
  const finished = playSignalAudio({
    audio,
    objectUrl,
    durationMs,
    startDelayMs: args.startDelayMs,
  });
  return { durationMs, finished };
}

export function playSignalOutdentAudio(args: {
  profile: SignalMusicProfile;
  seed: string;
  introAudio: BotcastIntroAudioState;
  enabled: boolean;
  volume: number;
}): { durationMs: number; finished: Promise<void> } {
  stopSignalIntroAudio();
  const useCachedOutdent =
    args.introAudio.source === "elevenlabs" &&
    Boolean(args.introAudio.outdentAudioUrl);
  const durationMs = useCachedOutdent
    ? Math.max(3_000, args.introAudio.outdentDurationMs)
    : SIGNAL_SYNTH_OUTDENT_DURATION_MS;
  if (
    !args.enabled ||
    typeof Audio === "undefined" ||
    typeof URL === "undefined"
  ) {
    return { durationMs, finished: Promise.resolve() };
  }

  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = Math.max(0, Math.min(1, args.volume * 0.9));
  let objectUrl: string | null = null;
  if (useCachedOutdent) {
    audio.src = args.introAudio.outdentAudioUrl!;
  } else {
    const wave = encodeSignalSynthIdentWave(
      buildSignalSynthOutdentPlan({
        profile: args.profile,
        seed: args.seed,
      }),
    );
    objectUrl = URL.createObjectURL(
      new Blob([wave], { type: "audio/wav" }),
    );
    audio.src = objectUrl;
  }
  const finished = playSignalAudio({
    audio,
    objectUrl,
    durationMs,
  });
  return { durationMs, finished };
}
