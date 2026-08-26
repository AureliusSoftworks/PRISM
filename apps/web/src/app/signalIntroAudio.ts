import {
  BOTCAST_LOCAL_INTRO_DURATION_MS,
  type BotcastIntroAudioState,
  type SignalMusicPalette,
  type SignalMusicProfile,
  type SignalPersonaTemperament,
} from "@localai/shared";
import {
  replayAudioMasterCaptureActive,
  resumePrismAudioContext,
  routeAudioElementToPrismOutput,
} from "./replayAudioMasterCapture.ts";

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
  treatment?: SignalSynthInstrumentTreatment;
  articulation?: SignalSynthArticulation;
};

export type SignalSynthPhraseGrammar =
  | "declaration"
  | "call-and-answer"
  | "turning-figure"
  | "lifted-close";

export type SignalSynthInstrumentTreatment =
  | "brass-pulse"
  | "glass-harp"
  | "reed-pluck"
  | "organ-glow";

export type SignalSynthArticulation = "legato" | "marcato" | "plucked" | "bell";

export type SignalSynthProductionTexture =
  | "clean"
  | "tape-warmth"
  | "broadcast-air"
  | "shimmer";

export type SignalSynthIdentPlan = {
  durationMs: number;
  tempoBpm: number;
  temperament: SignalPersonaTemperament;
  palette: SignalMusicPalette;
  register: "low" | "low-middle" | "middle" | "middle-high";
  contour: "descending" | "turning" | "bouncing" | "stepwise" | "asymmetric" | "arch" | "ascending" | "balanced";
  ending: "hard" | "resolve" | "lift" | "button";
  phraseGrammar: SignalSynthPhraseGrammar;
  melodyInstrument: SignalSynthInstrumentTreatment;
  supportInstrument: SignalSynthInstrumentTreatment;
  productionTexture: SignalSynthProductionTexture;
  textureSeed: number;
  notes: SignalSynthNote[];
};

type SignalSynthTemperamentRecipe = Omit<
  SignalSynthIdentPlan,
  | "durationMs"
  | "temperament"
  | "palette"
  | "phraseGrammar"
  | "melodyInstrument"
  | "supportInstrument"
  | "productionTexture"
  | "textureSeed"
  | "notes"
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

type SignalSynthPhraseGrammarRecipe = {
  motifOrder: readonly [number, number, number, number];
  motifBeatScale: number;
  motifBeatOffsets: readonly [number, number, number, number];
  pulseBeatScale: number;
  pulseBeatOffsets: readonly [number, number, number, number];
  articulation: SignalSynthArticulation;
};

// These are short phrase grammars, not free-form composition. Each has a
// recognisable gesture and preserves the fourth motif tone as the cadence.
const SIGNAL_SYNTH_PHRASE_GRAMMARS: Record<
  SignalSynthPhraseGrammar,
  SignalSynthPhraseGrammarRecipe
> = {
  declaration: {
    motifOrder: [0, 1, 2, 3],
    motifBeatScale: 0.92,
    motifBeatOffsets: [0, 0.04, 0.08, 0.12],
    pulseBeatScale: 0.94,
    pulseBeatOffsets: [0, 0.03, 0, 0.04],
    articulation: "marcato",
  },
  "call-and-answer": {
    motifOrder: [0, 2, 1, 3],
    motifBeatScale: 0.84,
    motifBeatOffsets: [0, 0.1, 0.34, 0.46],
    pulseBeatScale: 0.88,
    pulseBeatOffsets: [0, 0.14, 0.04, 0.16],
    articulation: "plucked",
  },
  "turning-figure": {
    motifOrder: [0, 1, 0, 3],
    motifBeatScale: 0.9,
    motifBeatOffsets: [0, -0.08, 0.14, 0.28],
    pulseBeatScale: 0.9,
    pulseBeatOffsets: [0, -0.05, 0.08, 0.02],
    articulation: "bell",
  },
  "lifted-close": {
    motifOrder: [1, 2, 0, 3],
    motifBeatScale: 0.82,
    motifBeatOffsets: [0, 0.16, 0.3, 0.58],
    pulseBeatScale: 0.86,
    pulseBeatOffsets: [0, 0.08, 0.12, 0.2],
    articulation: "legato",
  },
};

const SIGNAL_SYNTH_PHRASE_GRAMMAR_NAMES: readonly SignalSynthPhraseGrammar[] = [
  "declaration",
  "call-and-answer",
  "turning-figure",
  "lifted-close",
];

const SIGNAL_SYNTH_INSTRUMENTS: readonly SignalSynthInstrumentTreatment[] = [
  "brass-pulse",
  "glass-harp",
  "reed-pluck",
  "organ-glow",
];

const SIGNAL_SYNTH_SUPPORT_INSTRUMENT: Record<
  SignalSynthInstrumentTreatment,
  SignalSynthInstrumentTreatment
> = {
  "brass-pulse": "organ-glow",
  "glass-harp": "organ-glow",
  "reed-pluck": "brass-pulse",
  "organ-glow": "glass-harp",
};

const SIGNAL_SYNTH_TEXTURES: readonly SignalSynthProductionTexture[] = [
  "clean",
  "tape-warmth",
  "broadcast-air",
  "shimmer",
];

const SIGNAL_SYNTH_PRIMARY_INSTRUMENT: Record<
  SignalMusicPalette,
  SignalSynthInstrumentTreatment
> = {
  cinematic: "brass-pulse",
  magical: "glass-harp",
  nautical: "reed-pluck",
  mechanical: "brass-pulse",
  noir: "reed-pluck",
  chamber: "organ-glow",
  folk: "reed-pluck",
  theatrical: "brass-pulse",
  cosmic: "organ-glow",
  broadcast: "brass-pulse",
};

const SIGNAL_SYNTH_PRIMARY_TEXTURE: Record<
  SignalMusicPalette,
  SignalSynthProductionTexture
> = {
  cinematic: "tape-warmth",
  magical: "shimmer",
  nautical: "clean",
  mechanical: "broadcast-air",
  noir: "tape-warmth",
  chamber: "clean",
  folk: "tape-warmth",
  theatrical: "broadcast-air",
  cosmic: "shimmer",
  broadcast: "broadcast-air",
};

const SIGNAL_SYNTH_GRAMMAR_BY_ENDING: Record<
  SignalSynthIdentPlan["ending"],
  readonly [SignalSynthPhraseGrammar, SignalSynthPhraseGrammar]
> = {
  hard: ["declaration", "turning-figure"],
  resolve: ["turning-figure", "lifted-close"],
  lift: ["call-and-answer", "lifted-close"],
  button: ["declaration", "call-and-answer"],
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableSeedVariant(value: string): number {
  let hash = stableHash(value);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function seededProfileVariant<T extends string>(args: {
  seed: string;
  primary: T;
  secondary: T;
  variants: readonly T[];
}): T {
  const remaining = args.variants.filter(
    (variant) => variant !== args.primary && variant !== args.secondary,
  );
  const weighted = [
    args.primary,
    args.primary,
    args.primary,
    args.secondary,
    args.secondary,
    ...remaining,
  ];
  return weighted[stableSeedVariant(args.seed) % weighted.length]!;
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
  const grammarPreference = SIGNAL_SYNTH_GRAMMAR_BY_ENDING[args.profile.ending];
  const phraseGrammar = seededProfileVariant({
    seed: `${args.seed}:phrase`,
    primary: grammarPreference[0],
    secondary: grammarPreference[1],
    variants: SIGNAL_SYNTH_PHRASE_GRAMMAR_NAMES,
  });
  const grammar = SIGNAL_SYNTH_PHRASE_GRAMMARS[phraseGrammar];
  const primaryInstrument = SIGNAL_SYNTH_PRIMARY_INSTRUMENT[args.profile.palette];
  const melodyInstrument = seededProfileVariant({
    seed: `${args.seed}:instrument`,
    primary: primaryInstrument,
    secondary: SIGNAL_SYNTH_SUPPORT_INSTRUMENT[primaryInstrument],
    variants: SIGNAL_SYNTH_INSTRUMENTS,
  });
  const supportInstrument = SIGNAL_SYNTH_SUPPORT_INSTRUMENT[melodyInstrument];
  const primaryTexture = SIGNAL_SYNTH_PRIMARY_TEXTURE[args.profile.palette];
  const productionTexture = seededProfileVariant({
    seed: `${args.seed}:texture`,
    primary: primaryTexture,
    secondary: primaryTexture === "clean" ? "tape-warmth" : "clean",
    variants: SIGNAL_SYNTH_TEXTURES,
  });
  // Keep the ident recognizable for its profile while giving each show/identity
  // seed a bounded harmonic fingerprint. The final motif note remains fixed so
  // seed variation adds authorship without changing the profile's cadence.
  const rootVariation = (hash % 7) - 3;
  const root = recipe.rootMidi + palette.rootShift + rootVariation;
  const notes: SignalSynthNote[] = [];

  for (const interval of recipe.supportIntervals) {
    notes.push({
      startMs: 0,
      durationMs: beatMs * (
        args.profile.temperament === "commanding" ? 0.9 : 1.45
      ),
      midi: root + interval,
      gain: interval === 0 ? 0.036 : 0.021,
      waveform: palette.supportWaveform ?? recipe.supportWaveform,
      attackMs: recipe.supportAttackMs * palette.supportAttackScale,
      releaseMs: recipe.supportReleaseMs * palette.supportReleaseScale,
      lowpassHz: Math.max(
        950,
        recipe.melodyLowpassHz * palette.lowpassScale - 1_450,
      ),
      treatment: supportInstrument,
      articulation: "legato",
    });
  }

  for (const [index, recipeBeat] of recipe.pulseBeats.entries()) {
    const beat = Math.max(
      0,
      recipeBeat * grammar.pulseBeatScale +
        grammar.pulseBeatOffsets[index % grammar.pulseBeatOffsets.length]!,
    );
    notes.push({
      startMs: 180 + beat * beatMs,
      durationMs: beatMs * 0.82,
      midi: root - 12 + (
        beat === recipe.pulseBeats[recipe.pulseBeats.length - 1] &&
        args.profile.ending !== "hard"
          ? 7
          : 0
      ),
      gain: recipe.pulseGain * palette.pulseGainScale,
      waveform: "soft-square",
      attackMs: args.profile.ending === "hard" ? 5 : 12,
      releaseMs: 190,
      lowpassHz: args.profile.ending === "hard" ? 620 : 470,
      treatment: melodyInstrument,
      articulation: "marcato",
    });
  }

  const paletteMotifBeats = SIGNAL_SYNTH_PALETTE_MOTIF_BEATS[args.profile.palette];
  const motifBeats = paletteMotifBeats.map((beat, index) => Math.max(
    0,
    beat * grammar.motifBeatScale + grammar.motifBeatOffsets[index]!,
  ));
  const melodyOffset = args.profile.temperament === "commanding"
    ? 0
    : args.profile.temperament === "contemplative"
      ? 7
      : 12;
  const motifIntervals = [
    recipe.motif[grammar.motifOrder[0]]!,
    recipe.motif[grammar.motifOrder[1]]!,
    recipe.motif[grammar.motifOrder[2]]!,
    recipe.motif[grammar.motifOrder[3]]!,
  ] as const;
  motifIntervals.forEach((interval, index) => {
    const finalNote = index === recipe.motif.length - 1;
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
      treatment: melodyInstrument,
      articulation: grammar.articulation,
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
      treatment: melodyInstrument,
      articulation: grammar.articulation,
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
    phraseGrammar,
    melodyInstrument,
    supportInstrument,
    productionTexture,
    textureSeed: hash,
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
    palette: "broadcast",
    register: "middle",
    contour: "descending",
    ending: "resolve",
    phraseGrammar: "declaration",
    melodyInstrument: "organ-glow",
    supportInstrument: "organ-glow",
    productionTexture: "clean",
    textureSeed: hash,
    notes,
  };
}

function waveSample(waveform: SignalSynthNote["waveform"], phase: number): number {
  const sine = Math.sin(phase);
  if (waveform === "triangle") return (2 / Math.PI) * Math.asin(sine);
  if (waveform === "soft-square") return Math.tanh(sine * 2.4);
  return sine;
}

function instrumentSample(args: {
  treatment: SignalSynthInstrumentTreatment;
  waveform: SignalSynthNote["waveform"];
  phase: number;
  offset: number;
  sampleRate: number;
}): number {
  const base = waveSample(args.waveform, args.phase);
  if (args.treatment === "brass-pulse") {
    return Math.tanh(base + Math.sin(args.phase * 2) * 0.38 + Math.sin(args.phase * 3) * 0.14);
  }
  if (args.treatment === "glass-harp") {
    const ring = Math.exp(-args.offset / (args.sampleRate * 0.72));
    return (base + Math.sin(args.phase * 2.01) * 0.32 + Math.sin(args.phase * 4.02) * 0.12) * ring;
  }
  if (args.treatment === "reed-pluck") {
    const pluck = Math.exp(-args.offset / (args.sampleRate * 0.38));
    return (base * 0.68 + Math.sin(args.phase * 2) * 0.24 + Math.sin(args.phase * 5) * 0.08) *
      (0.64 + pluck * 0.36);
  }
  return base * 0.74 + Math.sin(args.phase * 2) * 0.2 + Math.sin(args.phase * 0.5) * 0.06;
}

function textureSample(args: {
  texture: SignalSynthProductionTexture;
  sample: number;
  phase: number;
  sampleIndex: number;
  textureSeed: number;
}): number {
  if (args.texture === "tape-warmth") {
    return Math.tanh(args.sample * 1.12) + Math.sin((args.sampleIndex + args.textureSeed) * 0.017) * 0.006;
  }
  if (args.texture === "broadcast-air") {
    return args.sample * 0.96 + Math.sin((args.sampleIndex + args.textureSeed) * 0.071) * 0.009;
  }
  if (args.texture === "shimmer") {
    return args.sample + Math.sin(args.phase * 2.003) * 0.1 + Math.sin(args.phase * 3.997) * 0.035;
  }
  return args.sample;
}

function articulationGain(
  articulation: SignalSynthArticulation | undefined,
  offset: number,
  sampleRate: number,
): number {
  if (articulation === "plucked") return 0.68 + Math.exp(-offset / (sampleRate * 0.24)) * 0.32;
  if (articulation === "bell") return 0.48 + Math.exp(-offset / (sampleRate * 0.56)) * 0.52;
  if (articulation === "marcato") return 0.8 + Math.exp(-offset / (sampleRate * 0.1)) * 0.2;
  return 1;
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
      const raw = instrumentSample({
        treatment: note.treatment ?? "organ-glow",
        waveform: note.waveform,
        phase,
        offset,
        sampleRate,
      });
      filtered += filterAlpha * (raw - filtered);
      const attack = Math.min(1, offset / attackSamples);
      const release = Math.min(1, (noteSampleCount - offset) / releaseSamples);
      const shaped = textureSample({
        texture: plan.productionTexture,
        sample: filtered,
        phase,
        sampleIndex: target,
        textureSeed: plan.textureSeed,
      });
      samples[target] += shaped * note.gain * articulationGain(
        note.articulation,
        offset,
        sampleRate,
      ) * Math.max(0, Math.min(attack, release));
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
let activeOutputCleanup: (() => void) | null = null;

export function stopSignalIntroAudio(): void {
  activeOutputCleanup?.();
  activeOutputCleanup = null;
  activeAudio?.pause();
  activeAudio = null;
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = null;
  const resolve = activeResolve;
  activeResolve = null;
  resolve?.();
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
  if (args.introAudio.source === "elevenlabs" && args.introAudio.audioUrl) {
    audio.src = args.introAudio.audioUrl;
  } else {
    const wave = encodeSignalSynthIdentWave(buildSignalSynthIdentPlan({
      profile: args.profile,
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
      activeOutputCleanup?.();
      activeOutputCleanup = null;
      activeAudio = null;
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
      if (activeResolve === resolve) activeResolve = null;
      resolve();
    };
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    audio.load();
    const beginPlayback = async () => {
      if (activeAudio !== audio) return;
      // A MediaElementSource disconnects an element from its native device
      // output. Do not attach it until the shared mix is running; otherwise a
      // successfully generated Premium ident plays on a suspended, silent bus.
      const mixerReady = await resumePrismAudioContext();
      if (activeAudio !== audio) return;
      activeOutputCleanup = mixerReady
        ? routeAudioElementToPrismOutput(audio)
        : null;
      if (!activeOutputCleanup && replayAudioMasterCaptureActive()) {
        finish();
        return;
      }
      void audio.play().catch(finish);
    };
    const startDelayMs = Math.max(0, Math.min(1_000, args.startDelayMs ?? 0));
    if (startDelayMs > 0) {
      window.setTimeout(() => void beginPlayback(), startDelayMs);
    } else {
      void beginPlayback();
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
      activeOutputCleanup?.();
      activeOutputCleanup = null;
      activeAudio = null;
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
      if (activeResolve === resolve) activeResolve = null;
      resolve();
    };
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    void (async () => {
      const mixerReady = await resumePrismAudioContext();
      if (activeAudio !== audio) return;
      activeOutputCleanup = mixerReady
        ? routeAudioElementToPrismOutput(audio)
        : null;
      if (!activeOutputCleanup && replayAudioMasterCaptureActive()) {
        finish();
        return;
      }
      void audio.play().catch(finish);
    })();
    window.setTimeout(finish, durationMs + 1_000);
  });
  return { durationMs, finished };
}
