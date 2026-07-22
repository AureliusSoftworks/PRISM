import {
  rankSignalPersonaTemperaments,
  type SignalPersonaTemperament,
} from "./signalPersonaTemperament.js";

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
export type SignalMusicEnergyShape =
  | "volatile"
  | "monumental"
  | "buoyant"
  | "enigmatic"
  | "intimate"
  | "precise"
  | "restless"
  | "adventurous"
  | "balanced";
export type SignalMusicRhythmicCharacter =
  | "lurching-asymmetric"
  | "martial-deliberate"
  | "buoyant-syncopated"
  | "wandering-irregular"
  | "clockwork"
  | "sparse-measured"
  | "human-pulse"
  | "forward-driving"
  | "broadcast";
export type SignalMusicHarmonicLanguage =
  | "chromatic-unstable"
  | "minor-gravity"
  | "bright-modal"
  | "suspended-modal"
  | "warm-open"
  | "questioning-jazz"
  | "geometric"
  | "balanced";
export type SignalMusicProductionTexture =
  | "electrical-analog"
  | "monumental-orchestral"
  | "wooden-acoustic"
  | "tuned-glass"
  | "mechanical-metal"
  | "noir-close"
  | "human-chamber"
  | "clean-broadcast";
export type SignalMusicEndingBehavior =
  | "short-circuit"
  | "inevitable-hard"
  | "lifted-smile"
  | "suspended-resolve"
  | "engineered-button"
  | "quiet-resolve"
  | "dry-signoff";

/**
 * Provider-safe musical fingerprint derived locally from one Signal show.
 * Raw show/persona prose never travels with this profile.
 */
export interface SignalMusicProfile {
  version: 2;
  temperament: SignalPersonaTemperament;
  secondaryTemperament: SignalPersonaTemperament | null;
  palette: SignalMusicPalette;
  variant: 0 | 1 | 2;
  energyShape: SignalMusicEnergyShape;
  rhythmicCharacter: SignalMusicRhythmicCharacter;
  harmonicLanguage: SignalMusicHarmonicLanguage;
  productionTexture: SignalMusicProductionTexture;
  endingBehavior: SignalMusicEndingBehavior;
  emotionalCore: string;
  signatureContradiction: string;
  sonicWorld: string;
  motifGesture: string;
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
      /\b(?:future|futuristic|alien|science fiction|sci[- ]?fi)\b/iu,
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

type SignalMusicAxisDefinition<T extends string> = {
  value: T;
  cues: readonly RegExp[];
};

const SIGNAL_MUSIC_ENERGY_DEFINITIONS: readonly SignalMusicAxisDefinition<SignalMusicEnergyShape>[] = [
  {
    value: "volatile",
    cues: [
      /\b(?:volatile|unstable|chaotic|reckless|erratic|unhinged)\b/iu,
      /\b(?:short[- ]?circuit|electri(?:c|cal|city)|theremin|mad scientist)\b/iu,
      /\b(?:sardonic|caustic|cynical|dangerous genius)\b/iu,
    ],
  },
  {
    value: "monumental",
    cues: [
      /\b(?:monumental|symphon(?:y|ic)|operatic|imperial|authoritarian)\b/iu,
      /\b(?:low brass|contrabass|timpani|orchestral|warlord)\b/iu,
      /\b(?:severe|powerful|inevitable|dominion)\b/iu,
    ],
  },
  {
    value: "buoyant",
    cues: [
      /\b(?:buoyant|carefree|sunny|optimistic|cheerful|effervescent)\b/iu,
      /\b(?:ukulele|island|undersea|sponge|wooden marimba)\b/iu,
      /\b(?:bouncy|smiling|lighthearted)\b/iu,
    ],
  },
  {
    value: "enigmatic",
    cues: [
      /\b(?:enigmatic|mysterious|magical|noir|shadowed|occult)\b/iu,
      /\b(?:paradox|prophecy|detective|secret)\b/iu,
    ],
  },
  {
    value: "intimate",
    cues: [
      /\b(?:intimate|gentle|tender|warm|homespun|reflective)\b/iu,
      /\b(?:chamber|acoustic|handmade|close[- ]?mic)\b/iu,
    ],
  },
  {
    value: "precise",
    cues: [
      /\b(?:precise|methodical|forensic|exact|disciplined)\b/iu,
      /\b(?:geometric|measured|analytical)\b/iu,
    ],
  },
  {
    value: "restless",
    cues: [
      /\b(?:restless|inventive|improvised|asymmetric|mischievous)\b/iu,
      /\b(?:mechanical|engineer|inventor|workshop)\b/iu,
    ],
  },
  {
    value: "adventurous",
    cues: [
      /\b(?:adventurous|exploratory|cosmic|galactic|interstellar)\b/iu,
      /\b(?:forward motion|expedition|discovery)\b/iu,
    ],
  },
] as const;

const SIGNAL_MUSIC_RHYTHM_DEFINITIONS: readonly SignalMusicAxisDefinition<SignalMusicRhythmicCharacter>[] = [
  {
    value: "lurching-asymmetric",
    cues: [
      /\b(?:lurching|unstable|chaotic|erratic|short[- ]?circuit)\b/iu,
      /\b(?:asymmetric|odd meter|stop[- ]?start|sputter)\b/iu,
    ],
  },
  {
    value: "martial-deliberate",
    cues: [
      /\b(?:martial|military|march|deliberate|authoritarian)\b/iu,
      /\b(?:disciplined pulse|timpani|processional)\b/iu,
    ],
  },
  {
    value: "buoyant-syncopated",
    cues: [
      /\b(?:buoyant|syncopated|offbeat|carefree|island|ukulele)\b/iu,
      /\b(?:bouncy|playful|stop[- ]?time)\b/iu,
    ],
  },
  {
    value: "wandering-irregular",
    cues: [
      /\b(?:wandering|irregular|magical|enigmatic|curious negative space)\b/iu,
    ],
  },
  {
    value: "clockwork",
    cues: [
      /\b(?:clockwork|mechanical|machine|gear|sequencer|engineered)\b/iu,
    ],
  },
  {
    value: "sparse-measured",
    cues: [
      /\b(?:sparse|measured|contemplative|slow|deliberate silence)\b/iu,
    ],
  },
  {
    value: "human-pulse",
    cues: [
      /\b(?:human[- ]?scale|warm|folk|handmade|gentle pulse)\b/iu,
    ],
  },
  {
    value: "forward-driving",
    cues: [
      /\b(?:driving|momentum|adventurous|expedition|forward)\b/iu,
    ],
  },
] as const;

const SIGNAL_MUSIC_HARMONY_DEFINITIONS: readonly SignalMusicAxisDefinition<SignalMusicHarmonicLanguage>[] = [
  {
    value: "chromatic-unstable",
    cues: [
      /\b(?:chromatic|unstable|volatile|alien|theremin|short[- ]?circuit)\b/iu,
      /\b(?:dissonant|tritone|detuned)\b/iu,
    ],
  },
  {
    value: "minor-gravity",
    cues: [
      /\b(?:minor|dark|severe|tragic|imperial|monumental)\b/iu,
      /\b(?:inevitable|authoritarian|low brass)\b/iu,
    ],
  },
  {
    value: "bright-modal",
    cues: [
      /\b(?:bright|sunny|buoyant|carefree|island|ukulele)\b/iu,
      /\b(?:optimistic|lifted|major[- ]?leaning)\b/iu,
    ],
  },
  {
    value: "suspended-modal",
    cues: [
      /\b(?:suspended|modal|magical|cosmic|mysterious|wandering)\b/iu,
    ],
  },
  {
    value: "warm-open",
    cues: [
      /\b(?:warm|open harmony|folk|gentle|tender|acoustic)\b/iu,
    ],
  },
  {
    value: "questioning-jazz",
    cues: [
      /\b(?:noir|jazz|detective|questioning|after[- ]?hours)\b/iu,
    ],
  },
  {
    value: "geometric",
    cues: [
      /\b(?:geometric|analytical|precise|stepwise|mechanical)\b/iu,
    ],
  },
] as const;

const SIGNAL_MUSIC_TEXTURE_DEFINITIONS: readonly SignalMusicAxisDefinition<SignalMusicProductionTexture>[] = [
  {
    value: "electrical-analog",
    cues: [
      /\b(?:theremin|electri(?:c|cal|city)|analog synth|synth sputter)\b/iu,
      /\b(?:alien science|mad scientist|short[- ]?circuit|crackling)\b/iu,
    ],
  },
  {
    value: "monumental-orchestral",
    cues: [
      /\b(?:symphon(?:y|ic)|orchestral|low brass|contrabass|timpani)\b/iu,
      /\b(?:monumental|operatic|imperial fanfare)\b/iu,
    ],
  },
  {
    value: "wooden-acoustic",
    cues: [
      /\b(?:ukulele|wooden marimba|woodblock|acoustic|island)\b/iu,
      /\b(?:hand percussion|plucked bass|sunny)\b/iu,
    ],
  },
  {
    value: "tuned-glass",
    cues: [
      /\b(?:celesta|tuned glass|glass bell|magical|crystalline)\b/iu,
    ],
  },
  {
    value: "mechanical-metal",
    cues: [
      /\b(?:mechanical|metallic|clockwork|gear|machine|industrial)\b/iu,
    ],
  },
  {
    value: "noir-close",
    cues: [
      /\b(?:muted trumpet|upright bass|brushed snare|noir|felt piano)\b/iu,
    ],
  },
  {
    value: "human-chamber",
    cues: [
      /\b(?:chamber|solo cello|viola|clarinet|folk|human[- ]?scale)\b/iu,
    ],
  },
] as const;

const SIGNAL_MUSIC_ENDING_DEFINITIONS: readonly SignalMusicAxisDefinition<SignalMusicEndingBehavior>[] = [
  {
    value: "short-circuit",
    cues: [
      /\b(?:short[- ]?circuit|snap off|abrupt|sputter|electrical)\b/iu,
    ],
  },
  {
    value: "inevitable-hard",
    cues: [
      /\b(?:inevitable|hard cadence|authoritarian|monumental|severe)\b/iu,
    ],
  },
  {
    value: "lifted-smile",
    cues: [
      /\b(?:smiling|lifted|sunny|carefree|buoyant|playful button)\b/iu,
    ],
  },
  {
    value: "suspended-resolve",
    cues: [
      /\b(?:suspended|magical|cosmic|enigmatic)\b/iu,
    ],
  },
  {
    value: "engineered-button",
    cues: [
      /\b(?:engineered|mechanical|precise|exact|clockwork)\b/iu,
    ],
  },
  {
    value: "quiet-resolve",
    cues: [
      /\b(?:quiet resolve|gentle|warm|intimate|contemplative)\b/iu,
    ],
  },
] as const;

const SIGNAL_MUSIC_DEFAULT_ENERGY: Record<SignalPersonaTemperament, SignalMusicEnergyShape> = {
  commanding: "monumental",
  contemplative: "enigmatic",
  playful: "buoyant",
  analytical: "precise",
  inventive: "restless",
  warm: "intimate",
  creative: "restless",
  adventurous: "adventurous",
  neutral: "balanced",
};

const SIGNAL_MUSIC_DEFAULT_RHYTHM: Record<SignalMusicEnergyShape, SignalMusicRhythmicCharacter> = {
  volatile: "lurching-asymmetric",
  monumental: "martial-deliberate",
  buoyant: "buoyant-syncopated",
  enigmatic: "wandering-irregular",
  intimate: "human-pulse",
  precise: "sparse-measured",
  restless: "clockwork",
  adventurous: "forward-driving",
  balanced: "broadcast",
};

const SIGNAL_MUSIC_DEFAULT_HARMONY: Record<SignalMusicEnergyShape, SignalMusicHarmonicLanguage> = {
  volatile: "chromatic-unstable",
  monumental: "minor-gravity",
  buoyant: "bright-modal",
  enigmatic: "suspended-modal",
  intimate: "warm-open",
  precise: "geometric",
  restless: "geometric",
  adventurous: "suspended-modal",
  balanced: "balanced",
};

const SIGNAL_MUSIC_DEFAULT_TEXTURE: Record<SignalMusicPalette, SignalMusicProductionTexture> = {
  cinematic: "monumental-orchestral",
  magical: "tuned-glass",
  nautical: "wooden-acoustic",
  mechanical: "mechanical-metal",
  noir: "noir-close",
  chamber: "human-chamber",
  folk: "wooden-acoustic",
  theatrical: "wooden-acoustic",
  cosmic: "electrical-analog",
  broadcast: "clean-broadcast",
};

const SIGNAL_MUSIC_DEFAULT_ENDING: Record<SignalMusicEnergyShape, SignalMusicEndingBehavior> = {
  volatile: "short-circuit",
  monumental: "inevitable-hard",
  buoyant: "lifted-smile",
  enigmatic: "suspended-resolve",
  intimate: "quiet-resolve",
  precise: "engineered-button",
  restless: "engineered-button",
  adventurous: "suspended-resolve",
  balanced: "dry-signoff",
};

const SIGNAL_MUSIC_ENERGY_DESCRIPTIONS: Record<SignalMusicEnergyShape, string> = {
  volatile: "brilliant volatility, dangerous curiosity, and sardonic momentum",
  monumental: "disciplined authority, immense weight, and restrained private tension",
  buoyant: "unbreakable optimism, elastic curiosity, and generous comic lift",
  enigmatic: "mystery, paradox, and a watchful center",
  intimate: "human warmth, closeness, and protected vulnerability",
  precise: "analytical control, discovery, and exact interruption",
  restless: "inventive fluency, restless mechanics, and confident asymmetry",
  adventurous: "wonder, exploration, and decisive forward motion",
  balanced: "clear presence, restrained confidence, and neutral broadcast poise",
};

const SIGNAL_MUSIC_ENERGY_CONTRADICTIONS: Record<SignalMusicEnergyShape, string> = {
  volatile: "clever control repeatedly threatened by its own instability",
  monumental: "public command carrying a tightly buried tragic undertow",
  buoyant: "innocent delight moving with unstoppable, almost excessive confidence",
  enigmatic: "inviting curiosity protected by deliberate ambiguity",
  intimate: "open warmth surrounding a private, carefully guarded center",
  precise: "methodical order interrupted by one revealing irregularity",
  restless: "elegant invention refusing to sit completely still",
  adventurous: "forward confidence held against the scale of the unknown",
  balanced: "professional clarity warmed by one unmistakably personal turn",
};

const SIGNAL_MUSIC_TEMPERAMENT_COUNTERPOINT: Record<SignalPersonaTemperament, string> = {
  commanding: "controlled authority",
  contemplative: "quiet inward gravity",
  playful: "buoyant mischief",
  analytical: "forensic precision",
  inventive: "restless intelligence",
  warm: "protected tenderness",
  creative: "expressive asymmetry",
  adventurous: "forward-looking wonder",
  neutral: "restrained poise",
};

const SIGNAL_MUSIC_SONIC_WORLDS: Record<SignalMusicProductionTexture, string> = {
  "electrical-analog": "a volatile alien-science signal made from warped analog electronics and dry electrical transients",
  "monumental-orchestral": "a monumental low orchestral chamber with disciplined brass, bass strings, and restrained percussion",
  "wooden-acoustic": "a sunlit close-miked acoustic world of dry wood, plucked strings, and tactile hand percussion",
  "tuned-glass": "an intimate chamber of tuned glass, breathy woodwind, and sparse bowed resonance",
  "mechanical-metal": "a precise workshop of tuned metal, interlocking mechanisms, and compact low machinery",
  "noir-close": "a shadowed close-miked room of muted horn, felt keys, upright bass, and brushed punctuation",
  "human-chamber": "a human-scale chamber ensemble with warm wood, breath, bow, and deliberate silence",
  "clean-broadcast": "a clean modern broadcast instrument with restrained tactile synthesis and dry spacing",
};

const SIGNAL_MUSIC_MOTIF_GESTURES: Record<SignalMusicEnergyShape, string> = {
  volatile: "a clever upward feint that destabilizes, doubles back, and snaps off",
  monumental: "a low descending proclamation answered by one restrained tragic turn",
  buoyant: "a bouncing call-and-response with one sunny upward surprise",
  enigmatic: "a questioning turn that crosses one wide interval and withholds certainty",
  intimate: "a rounded human phrase that opens, pauses, and settles close to home",
  precise: "a measured stepwise figure interrupted by one revealing interval",
  restless: "an asymmetric rising mechanism that reconfigures itself before landing",
  adventurous: "a widely spaced ascent that points beyond the frame",
  balanced: "an uneven four-note broadcast hook with one personal final turn",
};

const SIGNAL_MUSIC_AXIS_TONE: Record<
  SignalMusicEnergyShape,
  Pick<SignalMusicProfile, "tempoBpm" | "register" | "contour">
> = {
  volatile: { tempoBpm: 126, register: "middle-high", contour: "asymmetric" },
  monumental: { tempoBpm: 92, register: "low", contour: "descending" },
  buoyant: { tempoBpm: 124, register: "middle-high", contour: "bouncing" },
  enigmatic: { tempoBpm: 98, register: "low-middle", contour: "turning" },
  intimate: { tempoBpm: 100, register: "middle", contour: "arch" },
  precise: { tempoBpm: 108, register: "middle", contour: "stepwise" },
  restless: { tempoBpm: 114, register: "middle", contour: "asymmetric" },
  adventurous: { tempoBpm: 120, register: "middle-high", contour: "ascending" },
  balanced: { tempoBpm: 104, register: "middle", contour: "balanced" },
};

const SIGNAL_MUSIC_HARMONY_INTERVALS: Record<
  SignalMusicHarmonicLanguage,
  readonly [number, number, number, number]
> = {
  "chromatic-unstable": [0, 6, 3, 10],
  "minor-gravity": [7, 5, 3, 0],
  "bright-modal": [0, 7, 4, 12],
  "suspended-modal": [0, 5, 10, 7],
  "warm-open": [0, 5, 7, 3],
  "questioning-jazz": [0, 3, 6, 2],
  geometric: [0, 2, 5, 7],
  balanced: [0, 2, 7, 5],
};

const SIGNAL_MUSIC_TEXTURE_INSTRUMENTS: Record<
  SignalMusicProductionTexture,
  Pick<SignalMusicProfile, "lead" | "support">
> = {
  "electrical-analog": {
    lead: "warped theremin and unstable analog-synth lead",
    support: "dry crackling electrical transients with a detuned compact bass pulse",
  },
  "monumental-orchestral": {
    lead: "contrabass strings and severe low-brass lead",
    support: "disciplined orchestral weight with restrained martial timpani",
  },
  "wooden-acoustic": {
    lead: "dry ukulele and wooden-marimba lead",
    support: "light hand percussion with a buoyant close-miked plucked bass",
  },
  "tuned-glass": {
    lead: "tuned-glass and breathy woodwind lead",
    support: "muted chamber strings with one dry glass accent",
  },
  "mechanical-metal": {
    lead: "precise modular-pluck and tuned-metal lead",
    support: "interlocking machine rhythm with dry tactile clicks and restrained bass",
  },
  "noir-close": {
    lead: "muted trumpet and felt-piano lead",
    support: "upright-bass steps with sparse dry brush punctuation",
  },
  "human-chamber": {
    lead: "felt-piano and solo-cello lead",
    support: "restrained chamber movement with deliberate human silence",
  },
  "clean-broadcast": {
    lead: "clean bell-synth and restrained-pluck lead",
    support: "dry modern broadcast punctuation with a neutral bass pulse",
  },
};

const SIGNAL_MUSIC_RHYTHM_DIRECTIONS: Record<SignalMusicRhythmicCharacter, string> = {
  "lurching-asymmetric": "lurching asymmetric pulse with abrupt stop-start gaps",
  "martial-deliberate": "deliberate martial pulse with disciplined negative space",
  "buoyant-syncopated": "buoyant syncopation with playful offbeat gaps",
  "wandering-irregular": "light irregular movement with curious negative space",
  clockwork: "compact interlocking clockwork pulse",
  "sparse-measured": "sparse measured movement with exact silence",
  "human-pulse": "gentle human-scale pulse with clean articulation",
  "forward-driving": "driving forward pulse with decisive momentum",
  broadcast: "restrained broadcast pulse with dry spacing",
};

const SIGNAL_MUSIC_ENDING_DIRECTIONS: Record<SignalMusicEndingBehavior, string> = {
  "short-circuit": "abrupt resolved short-circuit button with one dry electrical release",
  "inevitable-hard": "inevitable low hard-button cadence with a brief natural orchestral release",
  "lifted-smile": "brief lifted smile-button ending in dry wood and plucked string",
  "suspended-resolve": "quiet suspended resolve with one controlled final accent",
  "engineered-button": "crisp engineered button ending with no decorative tail",
  "quiet-resolve": "soft compact human resolve with a brief natural release",
  "dry-signoff": "exact dry broadcast sign-off button",
};

function signalMusicAxisMatchFor<T extends string>(
  source: string,
  definitions: readonly SignalMusicAxisDefinition<T>[],
): T | null {
  const ranked = definitions
    .map((definition, index) => ({
      value: definition.value,
      score: definition.cues.reduce(
        (total, cue) => total + Number(cue.test(source)),
        0,
      ),
      index,
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0]?.value ?? null;
}

function signalMusicAxisFor<T extends string>(
  source: string,
  definitions: readonly SignalMusicAxisDefinition<T>[],
  fallback: T,
): T {
  return signalMusicAxisMatchFor(source, definitions) ?? fallback;
}

function signalMusicEndingFor(
  endingBehavior: SignalMusicEndingBehavior,
): SignalMusicEnding {
  if (endingBehavior === "short-circuit" || endingBehavior === "inevitable-hard") {
    return "hard";
  }
  if (endingBehavior === "lifted-smile") return "lift";
  if (
    endingBehavior === "suspended-resolve" ||
    endingBehavior === "quiet-resolve"
  ) {
    return "resolve";
  }
  return "button";
}

function signalMusicProfileIsV2(value: unknown): value is SignalMusicProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Partial<SignalMusicProfile>;
  return (
    profile.version === 2 &&
    typeof profile.palette === "string" &&
    SIGNAL_MUSIC_PALETTES.includes(profile.palette as SignalMusicPalette) &&
    typeof profile.temperament === "string" &&
    typeof profile.energyShape === "string" &&
    typeof profile.rhythmicCharacter === "string" &&
    typeof profile.harmonicLanguage === "string" &&
    typeof profile.productionTexture === "string" &&
    typeof profile.endingBehavior === "string" &&
    Array.isArray(profile.motifIntervals) &&
    profile.motifIntervals.length === 4
  );
}

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
  persona?: string | null;
  musicDirection?: string | null;
  premise?: string | null;
  hostingStyle?: string | null;
  studioIdentity?: string | null;
  identity?: unknown;
}): SignalMusicProfile {
  if (signalMusicProfileIsV2(args.identity)) return args.identity;

  const showSource = [
    args.musicDirection,
    args.premise,
    args.hostingStyle,
    args.studioIdentity,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  const source = `${args.persona ?? ""} ${showSource}`
    .replace(/\s+/gu, " ")
    .trim();
  const rankedTemperaments = new Map<SignalPersonaTemperament, number>();
  for (const match of [
    ...rankSignalPersonaTemperaments(args.persona),
    ...rankSignalPersonaTemperaments(showSource),
  ]) {
    rankedTemperaments.set(
      match.temperament,
      (rankedTemperaments.get(match.temperament) ?? 0) + match.score,
    );
  }
  const ranked = [...rankedTemperaments.entries()].sort(
    (left, right) => right[1] - left[1],
  );
  const temperament =
    args.temperament === "neutral"
      ? ranked[0]?.[0] ?? "neutral"
      : args.temperament;
  const secondaryTemperament =
    ranked.find(([candidate]) => candidate !== temperament)?.[0] ?? null;
  const palette = signalMusicPaletteFor(source, temperament);
  const variant = (stableHash(
    `${args.seed}:${palette}:${secondaryTemperament ?? "none"}:${showSource}`,
  ) % 3) as 0 | 1 | 2;
  const temperamentRecipe = SIGNAL_MUSIC_TEMPERAMENT_RECIPES[temperament];
  const paletteTone = SIGNAL_MUSIC_PALETTE_TONE_OVERRIDES[palette] ?? {};
  const energyShape = signalMusicAxisFor(
    source,
    SIGNAL_MUSIC_ENERGY_DEFINITIONS,
    SIGNAL_MUSIC_DEFAULT_ENERGY[temperament],
  );
  const rhythmicCharacter = signalMusicAxisFor(
    source,
    SIGNAL_MUSIC_RHYTHM_DEFINITIONS,
    SIGNAL_MUSIC_DEFAULT_RHYTHM[energyShape],
  );
  const harmonicLanguage = signalMusicAxisFor(
    source,
    SIGNAL_MUSIC_HARMONY_DEFINITIONS,
    SIGNAL_MUSIC_DEFAULT_HARMONY[energyShape],
  );
  const explicitProductionTexture = signalMusicAxisMatchFor(
    source,
    SIGNAL_MUSIC_TEXTURE_DEFINITIONS,
  );
  const productionTexture =
    explicitProductionTexture ?? SIGNAL_MUSIC_DEFAULT_TEXTURE[palette];
  const endingBehavior = signalMusicAxisFor(
    source,
    SIGNAL_MUSIC_ENDING_DEFINITIONS,
    SIGNAL_MUSIC_DEFAULT_ENDING[energyShape],
  );
  const instrumentation = explicitProductionTexture
    ? SIGNAL_MUSIC_TEXTURE_INSTRUMENTS[productionTexture]
    : SIGNAL_MUSIC_PALETTE_VARIANTS[palette][variant];
  const form = SIGNAL_MUSIC_PALETTE_FORMS[palette];
  const axisTone = SIGNAL_MUSIC_AXIS_TONE[energyShape];
  const textureAvoidStyles =
    productionTexture === "electrical-analog"
      ? ["acoustic strumming", "folk ensemble", "orchestral fanfare"]
      : productionTexture === "monumental-orchestral"
        ? ["ukulele", "toy instruments", "cheerful synth arpeggio"]
        : productionTexture === "wooden-acoustic"
          ? ["cinematic brass", "ambient synth wash", "electrical drone"]
          : [];
  const electricalForm = productionTexture === "electrical-analog"
    ? {
        openingForm:
          "volatile two-part science-signal phrase: a warped upward electronic gesture, an abrupt gap, then a crackling three-note answer that destabilizes instead of looping",
        developmentForm:
          "answer with a shorter detuned electronic turn that doubles back and snaps into a dry short-circuit button",
      }
    : null;
  return {
    version: 2,
    temperament,
    secondaryTemperament,
    palette,
    variant,
    energyShape,
    rhythmicCharacter,
    harmonicLanguage,
    productionTexture,
    endingBehavior,
    emotionalCore: SIGNAL_MUSIC_ENERGY_DESCRIPTIONS[energyShape],
    signatureContradiction: secondaryTemperament
      ? `${SIGNAL_MUSIC_ENERGY_CONTRADICTIONS[energyShape]}, counterweighted by ${SIGNAL_MUSIC_TEMPERAMENT_COUNTERPOINT[secondaryTemperament]}`
      : SIGNAL_MUSIC_ENERGY_CONTRADICTIONS[energyShape],
    sonicWorld: SIGNAL_MUSIC_SONIC_WORLDS[productionTexture],
    motifGesture: SIGNAL_MUSIC_MOTIF_GESTURES[energyShape],
    ...temperamentRecipe,
    ...paletteTone,
    ...axisTone,
    ending: signalMusicEndingFor(endingBehavior),
    motifIntervals: SIGNAL_MUSIC_HARMONY_INTERVALS[harmonicLanguage],
    pulse: SIGNAL_MUSIC_RHYTHM_DIRECTIONS[rhythmicCharacter],
    motifDirection: SIGNAL_MUSIC_MOTIF_GESTURES[energyShape],
    endingDirection: SIGNAL_MUSIC_ENDING_DIRECTIONS[endingBehavior],
    ...instrumentation,
    ...form,
    ...(electricalForm ?? {}),
    avoidStyles: [...new Set([...form.avoidStyles, ...textureAvoidStyles])],
  };
}
