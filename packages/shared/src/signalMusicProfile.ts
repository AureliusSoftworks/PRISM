import type { SignalPersonaTemperament } from "./signalPersonaTemperament.js";

export const SIGNAL_MUSIC_PALETTES = [
  "cinematic",
  "magical",
  "nautical",
  "mechanical",
  "noir",
  "chamber",
  "folk",
  "theatrical",
  "cosmic",
  "broadcast",
] as const;

export type SignalMusicPalette = (typeof SIGNAL_MUSIC_PALETTES)[number];
export type SignalMusicRegister =
  | "low"
  | "low-middle"
  | "middle"
  | "middle-high";
export type SignalMusicContour =
  | "descending"
  | "turning"
  | "bouncing"
  | "stepwise"
  | "asymmetric"
  | "arch"
  | "ascending"
  | "balanced";
export type SignalMusicEnding = "hard" | "resolve" | "lift" | "button";

/**
 * Provider-safe musical fingerprint derived locally from one Signal show.
 * Raw show/persona prose never travels with this profile.
 */
export interface SignalMusicProfile {
  version: 1;
  temperament: SignalPersonaTemperament;
  palette: SignalMusicPalette;
  variant: 0 | 1 | 2;
  tempoBpm: number;
  register: SignalMusicRegister;
  contour: SignalMusicContour;
  ending: SignalMusicEnding;
  /** Relative pitch fingerprint shared by the opening ident and closing outdent. */
  motifIntervals: readonly [number, number, number, number];
  lead: string;
  support: string;
  pulse: string;
  motifDirection: string;
  endingDirection: string;
  openingForm: string;
  developmentForm: string;
  avoidStyles: readonly string[];
}

type SignalMusicTemperamentRecipe = Pick<
  SignalMusicProfile,
  | "tempoBpm"
  | "register"
  | "contour"
  | "ending"
  | "motifIntervals"
  | "pulse"
  | "motifDirection"
  | "endingDirection"
>;

const SIGNAL_MUSIC_TEMPERAMENT_RECIPES: Record<
  SignalPersonaTemperament,
  SignalMusicTemperamentRecipe
> = {
  commanding: {
    tempoBpm: 92,
    register: "low",
    contour: "descending",
    ending: "hard",
    motifIntervals: [7, 5, 3, 0],
    pulse: "deliberate severe low pulse with disciplined restraint",
    motifDirection: "descending minor-tonal melodic contour",
    endingDirection:
      "decisive resolved hard-button cadence with a brief natural release",
  },
  contemplative: {
    tempoBpm: 94,
    register: "low-middle",
    contour: "turning",
    ending: "resolve",
    motifIntervals: [0, 3, 7, 5],
    pulse: "sparse measured movement with deliberate silence",
    motifDirection: "gently turning melodic contour with a downward final step",
    endingDirection: "quiet dry resolve",
  },
  playful: {
    tempoBpm: 118,
    register: "middle-high",
    contour: "bouncing",
    ending: "lift",
    motifIntervals: [0, 7, 4, 12],
    pulse: "buoyant compact rhythmic pulse",
    motifDirection: "bouncing melodic contour with one light upward turn",
    endingDirection: "brief lifted button ending",
  },
  analytical: {
    tempoBpm: 108,
    register: "middle",
    contour: "stepwise",
    ending: "button",
    motifIntervals: [0, 2, 5, 7],
    pulse: "measured geometric pulse with clean spacing",
    motifDirection: "stepwise melodic contour with one revealing interval",
    endingDirection: "exact dry broadcast button ending",
  },
  inventive: {
    tempoBpm: 114,
    register: "middle",
    contour: "asymmetric",
    ending: "button",
    motifIntervals: [0, 3, 7, 9],
    pulse: "compact syncopated machine pulse",
    motifDirection: "asymmetric rising melodic contour",
    endingDirection: "crisp engineered button ending",
  },
  warm: {
    tempoBpm: 100,
    register: "middle",
    contour: "arch",
    ending: "resolve",
    motifIntervals: [0, 5, 7, 3],
    pulse: "gentle human-scale pulse with clean articulation",
    motifDirection: "rounded arch-shaped melodic contour",
    endingDirection: "soft compact resolved button ending",
  },
  creative: {
    tempoBpm: 110,
    register: "middle-high",
    contour: "asymmetric",
    ending: "resolve",
    motifIntervals: [0, 5, 3, 10],
    pulse: "confident asymmetric rhythmic support",
    motifDirection: "expressive asymmetric melodic contour",
    endingDirection: "confident dry resolve",
  },
  adventurous: {
    tempoBpm: 120,
    register: "middle",
    contour: "ascending",
    ending: "button",
    motifIntervals: [0, 5, 7, 12],
    pulse: "driving forward pulse",
    motifDirection: "ascending melodic contour with decisive momentum",
    endingDirection: "decisive compact button ending",
  },
  neutral: {
    tempoBpm: 104,
    register: "middle",
    contour: "balanced",
    ending: "button",
    motifIntervals: [0, 2, 7, 5],
    pulse: "restrained broadcast pulse",
    motifDirection: "balanced arch-shaped melodic contour",
    endingDirection: "dry neutral broadcast button ending",
  },
};

const SIGNAL_MUSIC_PALETTE_TONE_OVERRIDES: Partial<
  Record<SignalMusicPalette, Partial<SignalMusicTemperamentRecipe>>
> = {
  cinematic: {
    tempoBpm: 92,
    register: "low",
    contour: "descending",
    ending: "hard",
    pulse: "deliberate severe low orchestral pulse with disciplined restraint",
    motifDirection: "descending minor-tonal melodic contour",
    endingDirection:
      "decisive resolved hard-button cadence with a brief natural release",
  },
  magical: {
    tempoBpm: 106,
    register: "middle-high",
    contour: "turning",
    ending: "resolve",
    pulse: "light irregular chamber pulse with curious negative space",
    motifDirection: "wandering modal contour with one wide upward leap",
    endingDirection: "quiet suspended resolve with one dry glass accent",
  },
  nautical: {
    tempoBpm: 122,
    register: "middle-high",
    contour: "bouncing",
    ending: "lift",
    pulse: "syncopated acoustic island pulse with playful stop-time gaps",
    motifDirection: "buoyant call-and-response contour with uneven phrase lengths",
    endingDirection: "brief lifted wooden button ending",
  },
  mechanical: {
    tempoBpm: 114,
    register: "middle",
    contour: "asymmetric",
    ending: "button",
    pulse: "compact syncopated machine pulse",
    motifDirection: "asymmetric rising mechanical contour",
    endingDirection: "crisp engineered button ending",
  },
  noir: {
    tempoBpm: 86,
    register: "low-middle",
    contour: "descending",
    ending: "resolve",
    pulse: "slow sparse after-hours pulse with generous silence",
    motifDirection: "questioning chromatic contour that falls at the end",
    endingDirection: "dry unresolved low-register release",
  },
  chamber: {
    tempoBpm: 94,
    register: "middle",
    contour: "turning",
    ending: "resolve",
    pulse: "restrained human chamber movement with deliberate silence",
    motifDirection: "lyrical turning contour with unequal note lengths",
    endingDirection: "quiet compact chamber resolve",
  },
  folk: {
    tempoBpm: 104,
    register: "middle",
    contour: "arch",
    ending: "resolve",
    pulse: "gentle human-scale acoustic pulse with clean articulation",
    motifDirection: "rounded call-and-response contour",
    endingDirection: "soft dry acoustic resolve",
  },
  theatrical: {
    tempoBpm: 124,
    register: "middle-high",
    contour: "bouncing",
    ending: "lift",
    pulse: "stop-start comic pulse with one deliberate fake-out",
    motifDirection: "bouncing contour with a surprising interval",
    endingDirection: "brief lifted punchline ending",
  },
  cosmic: {
    tempoBpm: 112,
    register: "middle-high",
    contour: "ascending",
    ending: "button",
    pulse: "measured orbital signal pulse with controlled low support",
    motifDirection: "widely spaced ascending signal contour",
    endingDirection: "clean futuristic button ending",
  },
};

type SignalMusicPaletteDefinition = {
  palette: Exclude<SignalMusicPalette, "broadcast">;
  cues: readonly RegExp[];
};

const SIGNAL_MUSIC_PALETTE_DEFINITIONS: readonly SignalMusicPaletteDefinition[] = [
  {
    palette: "nautical",
    cues: [
      /\bunder(?:sea|water)\b/iu,
      /\b(?:ocean|sea|seaside|nautical|maritime|marine)\b/iu,
      /\b(?:island|tropical|beach|lagoon|harbou?r)\b/iu,
      /\b(?:coral|reef|pineapple|sponge|sailor|pirate)\b/iu,
    ],
  },
  {
    palette: "magical",
    cues: [
      /\b(?:magic|magical|wizard|wizarding|witch|sorcerer|sorcery)\b/iu,
      /\b(?:spell|wand|potion|alchemy|enchanted|enchantment)\b/iu,
      /\b(?:castle|owl|broomstick|cauldron|prophecy)\b/iu,
    ],
  },
  {
    palette: "cinematic",
    cues: [
      /\b(?:imperial|empire|warlord|military|armou?red)\b/iu,
      /\b(?:mythic|epic|monumental|operatic|cinematic)\b/iu,
      /\b(?:fortress|throne|battle|conquest|dominion)\b/iu,
      /\b(?:dark|ominous|menacing|intimidating)\b/iu,
    ],
  },
  {
    palette: "mechanical",
    cues: [
      /\b(?:machine|mechanical|engine|factory|workshop)\b/iu,
      /\b(?:inventor|engineer|robot|android|automaton)\b/iu,
      /\b(?:circuit|gear|metal|industrial|technical)\b/iu,
    ],
  },
  {
    palette: "noir",
    cues: [
      /\b(?:detective|noir|mystery|crime|forensic)\b/iu,
      /\b(?:evidence|interrogation|investigation|case file)\b/iu,
      /\b(?:rainy|shadowed|smoky|back alley)\b/iu,
    ],
  },
  {
    palette: "chamber",
    cues: [
      /\b(?:library|study|scholar|philosopher|academic)\b/iu,
      /\b(?:ancient|classical|manuscript|parchment|archive)\b/iu,
      /\b(?:intimate|reflective|meditative|contemplative)\b/iu,
    ],
  },
  {
    palette: "folk",
    cues: [
      /\b(?:rustic|folk|handmade|wooden|campfire)\b/iu,
      /\b(?:garden|forest|meadow|farm|cottage)\b/iu,
      /\b(?:acoustic|earthy|homespun|pastoral)\b/iu,
    ],
  },
  {
    palette: "theatrical",
    cues: [
      /\b(?:comedy|comic|cartoon|circus|cabaret)\b/iu,
      /\b(?:absurd|mischief|whimsical|playful|silly)\b/iu,
      /\b(?:stage|theatre|theater|vaudeville|showman)\b/iu,
    ],
  },
  {
    palette: "cosmic",
    cues: [
      /\b(?:cosmic|galactic|space|starship|spaceship)\b/iu,
      /\b(?:planet|nebula|orbit|astral|interstellar)\b/iu,
      /\b(?:future|futuristic|alien|science fiction)\b/iu,
    ],
  },
] as const;

const SIGNAL_MUSIC_DEFAULT_PALETTE: Record<
  SignalPersonaTemperament,
  SignalMusicPalette
> = {
  commanding: "cinematic",
  contemplative: "chamber",
  playful: "theatrical",
  analytical: "noir",
  inventive: "mechanical",
  warm: "folk",
  creative: "theatrical",
  adventurous: "cosmic",
  neutral: "broadcast",
};

const SIGNAL_MUSIC_PALETTE_VARIANTS: Record<
  SignalMusicPalette,
  readonly [
    Pick<SignalMusicProfile, "lead" | "support">,
    Pick<SignalMusicProfile, "lead" | "support">,
    Pick<SignalMusicProfile, "lead" | "support">,
  ]
> = {
  cinematic: [
    {
      lead: "low brass and bowed bass-string lead",
      support: "tight cinematic orchestral punctuation with restrained timpani",
    },
    {
      lead: "muted horn and contrabass-string lead",
      support: "compact low-string ostinato with one dry orchestral impact",
    },
    {
      lead: "bass trombone and dark staccato-string lead",
      support: "disciplined orchestral pulse with sparse drum punctuation",
    },
  ],
  magical: [
    {
      lead: "glass celesta and breathy bassoon lead",
      support: "muted chamber strings with sparse harp harmonics",
    },
    {
      lead: "soft celesta and low clarinet lead",
      support: "small bowed-string ensemble with one dry bell accent",
    },
    {
      lead: "tuned-glass and alto-flute lead",
      support: "quiet viola movement with restrained tuned-glass punctuation",
    },
  ],
  nautical: [
    {
      lead: "dry ukulele and wooden-marimba lead",
      support: "light hand percussion and compact acoustic bass",
    },
    {
      lead: "muted ukulele-strum and bright marimba lead",
      support: "dry woodblock rhythm with a buoyant plucked bass",
    },
    {
      lead: "ukulele harmonics and pizzicato-string lead",
      support: "tiny shaker accents and warm wooden percussion",
    },
  ],
  mechanical: [
    {
      lead: "precise modular-pluck and metallic-key lead",
      support: "clockwork percussion with a compact sub pulse",
    },
    {
      lead: "clean sequencer-pluck and tuned-metal lead",
      support: "interlocking machine rhythm with dry tactile clicks",
    },
    {
      lead: "articulated synth-key and mechanical-mallet lead",
      support: "measured gear-like syncopation with restrained bass",
    },
  ],
  noir: [
    {
      lead: "muted trumpet and upright-bass lead",
      support: "dry brushed-snare punctuation with sparse piano shadows",
    },
    {
      lead: "low clarinet and felt-piano lead",
      support: "compact upright-bass steps with restrained brush accents",
    },
    {
      lead: "baritone saxophone and plucked-bass lead",
      support: "tense dry jazz punctuation without lounge looseness",
    },
  ],
  chamber: [
    {
      lead: "felt-piano and solo-cello lead",
      support: "restrained chamber-string movement with deliberate silence",
    },
    {
      lead: "soft piano and viola lead",
      support: "intimate pizzicato support with a quiet bass foundation",
    },
    {
      lead: "clarinet and muted-piano lead",
      support: "small chamber ensemble punctuation with dry close detail",
    },
  ],
  folk: [
    {
      lead: "nylon-string guitar and wooden-mallet lead",
      support: "warm hand percussion with a soft acoustic bass",
    },
    {
      lead: "mandolin and mellow acoustic-guitar lead",
      support: "gentle foot-stomp pulse with restrained wooden percussion",
    },
    {
      lead: "fingerpicked guitar and small dulcimer lead",
      support: "compact organic rhythm with a warm bowed-bass touch",
    },
  ],
  theatrical: [
    {
      lead: "bright xylophone and pizzicato-string lead",
      support: "nimble hand percussion with a comic bass turn",
    },
    {
      lead: "clarinet and articulated mallet lead",
      support: "compact vaudeville-like punctuation without parody",
    },
    {
      lead: "toy-piano and plucked-string lead",
      support: "bouncy dry percussion with one surprising rhythmic stop",
    },
  ],
  cosmic: [
    {
      lead: "glassy synth and bell-harmonic lead",
      support: "tight orbital arpeggio with a controlled low pulse",
    },
    {
      lead: "clean analog-synth and crystalline-pluck lead",
      support: "compact sequenced movement with restrained sub-bass",
    },
    {
      lead: "shimmering electric-key and tuned-glass lead",
      support: "measured futuristic pulse without atmospheric wash",
    },
  ],
  broadcast: [
    {
      lead: "clean bell-synth and restrained-pluck lead",
      support: "dry modern broadcast punctuation",
    },
    {
      lead: "rounded electric-key and modular-pluck lead",
      support: "compact analog pulse with clean spacing",
    },
    {
      lead: "soft mallet-synth and tuned-key lead",
      support: "restrained tactile percussion with a neutral bass pulse",
    },
  ],
};

const SIGNAL_MUSIC_PALETTE_FORMS: Record<
  SignalMusicPalette,
  Pick<
    SignalMusicProfile,
    "openingForm" | "developmentForm" | "avoidStyles"
  >
> = {
  cinematic: {
    openingForm:
      "through-composed miniature fanfare: a two-note low-brass call, a beat of silence, then a three-note descending string answer; never outline a chord",
    developmentForm:
      "continue with a new, shorter brass-and-string answer and one dry percussion hit; do not literally repeat or loop the opening phrase",
    avoidStyles: [
      "acoustic guitar",
      "electric guitar",
      "ukulele",
      "banjo",
      "mandolin",
      "folk strumming",
      "arpeggio",
      "arpeggiator",
      "repeating ostinato",
      "looped melody",
    ],
  },
  magical: {
    openingForm:
      "irregular five-note question led by celesta and woodwind, mixing short and held pitches around one wide leap; never outline a chord",
    developmentForm:
      "answer with a new wandering three-note woodwind phrase and one quiet glass accent; no literal repeat of the opening",
    avoidStyles: [
      "acoustic guitar",
      "electric guitar",
      "ukulele",
      "banjo",
      "mandolin",
      "rock rhythm section",
      "heroic brass fanfare",
      "arpeggio",
      "arpeggiator",
      "sequencer",
      "repeating ostinato",
      "music-box waltz",
    ],
  },
  nautical: {
    openingForm:
      "call-and-response: one syncopated ukulele strum gesture, a breath of silence, then three separated wooden-marimba taps; no continuous plucking",
    developmentForm:
      "answer with one fresh offbeat ukulele gesture and a two-note marimba turn, then stop cleanly instead of looping",
    avoidStyles: [
      "arpeggio",
      "arpeggiator",
      "sequencer",
      "repeated note loop",
      "continuous eighth-note pattern",
      "cinematic brass",
      "electric guitar",
      "synth pad",
    ],
  },
  mechanical: {
    openingForm:
      "interlocking machine phrase built as three clipped notes, a short gap, then two answering notes with one metallic accent",
    developmentForm:
      "reconfigure the rhythm into a new two-plus-three mechanical answer before the dry button ending",
    avoidStyles: [
      "acoustic guitar",
      "ukulele",
      "loose live jam",
      "orchestral fanfare",
      "ambient drift",
    ],
  },
  noir: {
    openingForm:
      "slow call-and-response: one held horn question followed by two low piano or bass answers with generous silence",
    developmentForm:
      "play a new, shorter questioning phrase that falls chromatically into the dry ending; never loop the opening",
    avoidStyles: [
      "acoustic guitar strumming",
      "ukulele",
      "bright marimba",
      "arpeggiator",
      "repeating ostinato",
      "upbeat swing",
    ],
  },
  chamber: {
    openingForm:
      "lyrical chamber question: two connected lead notes, silence, then a three-note bowed-string answer with unequal note lengths",
    developmentForm:
      "continue with a fresh compact chamber response that turns downward and resolves quietly without repeating",
    avoidStyles: [
      "acoustic guitar",
      "electric guitar",
      "ukulele",
      "drum kit",
      "arpeggiator",
      "repeating ostinato",
      "cinematic brass fanfare",
    ],
  },
  folk: {
    openingForm:
      "human acoustic call-and-response: one warm strummed gesture followed by a short two-note wooden answer and a foot-rest gap",
    developmentForm:
      "vary the strum rhythm once, add a new small melodic turn, and finish without cycling back to the opening",
    avoidStyles: [
      "synth arpeggiator",
      "repeating ostinato",
      "cinematic orchestra",
      "heavy brass",
      "continuous fingerpicking loop",
    ],
  },
  theatrical: {
    openingForm:
      "stop-start comic phrase: two quick mallet notes, an exaggerated rest, then one clarinet or string answer with a surprise leap",
    developmentForm:
      "deliver a different short punchline phrase with one rhythmic fake-out, then land the button without repeating",
    avoidStyles: [
      "arpeggio",
      "arpeggiator",
      "continuous ostinato",
      "cinematic trailer music",
      "acoustic guitar strumming",
      "synth pad",
    ],
  },
  cosmic: {
    openingForm:
      "three-note orbital signal followed by one long suspended tone in a different register, with clear empty space between gestures",
    developmentForm:
      "shift the signal into a new register and shorten it into a two-note answer before the final button",
    avoidStyles: [
      "acoustic guitar",
      "ukulele",
      "orchestral fanfare",
      "unchanging arpeggio loop",
      "continuous sequencer bed",
      "ambient pad wash",
    ],
  },
  broadcast: {
    openingForm:
      "concise broadcast hook with four separated pitches in an uneven short-short-long-short rhythm",
    developmentForm:
      "reshape the hook once with a different final interval and finish on a dry button; no third repetition",
    avoidStyles: [
      "acoustic guitar strumming",
      "cinematic fanfare",
      "continuous arpeggio",
      "looped melody",
      "ambient pad wash",
    ],
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

function signalMusicPaletteFor(
  source: string,
  temperament: SignalPersonaTemperament,
): SignalMusicPalette {
  const ranked = SIGNAL_MUSIC_PALETTE_DEFINITIONS
    .map((definition, index) => ({
      palette: definition.palette,
      score: definition.cues.reduce(
        (total, cue) => total + Number(cue.test(source)),
        0,
      ),
      index,
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0]?.palette ?? SIGNAL_MUSIC_DEFAULT_PALETTE[temperament];
}

export function buildSignalMusicProfile(args: {
  temperament: SignalPersonaTemperament;
  seed: string;
  premise?: string | null;
  hostingStyle?: string | null;
  studioIdentity?: string | null;
}): SignalMusicProfile {
  const source = [args.premise, args.hostingStyle, args.studioIdentity]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  const palette = signalMusicPaletteFor(source, args.temperament);
  const variant = (stableHash(`${args.seed}:${palette}`) % 3) as 0 | 1 | 2;
  const temperament = SIGNAL_MUSIC_TEMPERAMENT_RECIPES[args.temperament];
  const paletteTone = SIGNAL_MUSIC_PALETTE_TONE_OVERRIDES[palette] ?? {};
  const instrumentation = SIGNAL_MUSIC_PALETTE_VARIANTS[palette][variant];
  const form = SIGNAL_MUSIC_PALETTE_FORMS[palette];
  return {
    version: 1,
    temperament: args.temperament,
    palette,
    variant,
    ...temperament,
    ...paletteTone,
    ...instrumentation,
    ...form,
  };
}
