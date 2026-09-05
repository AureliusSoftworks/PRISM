import type { DatabaseSync } from "node:sqlite";
import {
  normalizePrismRefractDirection,
  type CoffeeGroupSoundtrack,
} from "@localai/shared";
import { randomId } from "./security.ts";
import {
  COFFEE_ELEVENLABS_MUSIC_MODEL,
  COFFEE_SOUNDTRACK_DURATION_MS,
} from "./elevenlabs-music.ts";

export {
  COFFEE_ELEVENLABS_MUSIC_MODEL,
  COFFEE_SOUNDTRACK_DURATION_MS,
  COFFEE_SOUNDTRACK_MAX_BYTES,
  requestCoffeeGroupElevenLabsMusic,
} from "./elevenlabs-music.ts";

type SoundtrackRow = {
  generation_status: CoffeeGroupSoundtrack["status"];
  generation_token: string | null;
  provider: string | null;
  model: string | null;
  prompt: string | null;
  content_type: string | null;
  audio_bytes: Uint8Array | null;
  duration_ms: number | null;
  revision: number;
  previous_audio_bytes: Uint8Array | null;
  error: string | null;
  updated_at: string;
};

const COFFEE_SOUNDTRACK_GROUP_NAME_SOURCE_MAX = 120;
const COFFEE_SOUNDTRACK_GROUP_ETHOS_SOURCE_MAX = 280;
const COFFEE_SOUNDTRACK_BOT_NAME_SOURCE_MAX = 80;
const COFFEE_SOUNDTRACK_PERSONA_SOURCE_MAX = 360;
const COFFEE_SOUNDTRACK_BOT_SOURCE_MAX = 5;

export interface CoffeeGroupSoundtrackPromptInput {
  groupName: string;
  ethos?: string | null;
  bots: readonly { name?: string; personaSnippet?: string | null }[];
  direction?: unknown;
}

export interface CoffeeGroupSonicFingerprint {
  family:
    | "cosmic-mechanical"
    | "dark-folk-ritual"
    | "nocturnal-metropolitan"
    | "organic-handmade"
    | "playful-inventive"
    | "scholarly-precise"
    | "maritime-horizon"
    | "ceremonial-resolve"
    | "neutral-intimate";
  emotionalTemperature: string;
  sonicWorld: string;
  ensemble: string;
  rhythmicLanguage: string;
  harmonyAndRegister: string;
  materialTexture: string;
  dramaticArc: string;
}

type CoffeeGroupSonicFamily = CoffeeGroupSonicFingerprint["family"];

interface CoffeeGroupSonicPalette {
  family: Exclude<CoffeeGroupSonicFamily, "neutral-intimate">;
  signals: readonly RegExp[];
  sonicWorlds: readonly string[];
  ensembles: readonly string[];
  rhythmicLanguages: readonly string[];
  harmonyAndRegisters: readonly string[];
  materialTextures: readonly string[];
  dramaticArcs: readonly string[];
}

const COFFEE_GROUP_SONIC_PALETTES: readonly CoffeeGroupSonicPalette[] = [
  {
    family: "cosmic-mechanical",
    signals: [
      /\b(?:star wars|galactic|galaxy|cosmic|stellar|orbital|space opera|starship|spaceship|jedi|sith)\b/u,
      /\b(?:droid|android|robot|cyborg|mechanical|machine|circuit|synthetic|laser)\b/u,
      /\b(?:rebel alliance|imperial|empire|resistance|space pilot)\b/u,
    ],
    sonicWorlds: [
      "a restrained cosmic-mechanical chamber miniature with human warmth inside precise motion",
      "an intimate orbital chamber world where polished mechanisms breathe at an unhurried scale",
    ],
    ensembles: [
      "bowed alloy, low cello, glassy analog pads, muted brass breaths, and tiny clockwork percussion",
      "prepared mallets, bass clarinet, soft modular tones, viola harmonics, and damped metal taps",
    ],
    rhythmicLanguages: [
      "a measured pulse in gently offset cycles, with small servo-like replies and ample conversational rests",
      "slow interlocking ostinatos that briefly misalign, then settle into a patient shared orbit",
    ],
    harmonyAndRegisters: [
      "cool open intervals in the low-mid register, warmed by suspended inner voices and isolated high glints",
      "spacious quartal harmony anchored low, with soft chromatic signals passing through a clear middle register",
    ],
    materialTextures: [
      "brushed metal, close-miked mechanisms, soft magnetic-tape haze, and a polished but tactile stereo field",
      "frosted glass, muted circuitry, felt-damped impacts, and a gently weathered analog surface",
    ],
    dramaticArcs: [
      "a quiet ignition gathers into coordinated motion, opens one luminous window, then returns to a resting orbit",
      "a small coded call wakes a chamber response, grows into calm solidarity, and folds back into its opening pulse",
    ],
  },
  {
    family: "dark-folk-ritual",
    signals: [
      /\b(?:witcher|monster[- ]hunter|medieval|folklor\w*|mythic|ancient|tavern|bard)\b/u,
      /\b(?:ritual|rune|alchemy|alchemist|herbal|potion|oracle|omen)\b/u,
      /\b(?:sword|wolf|sorcer\w*|mage|castle|hunt|woodland|beast)\b/u,
    ],
    sonicWorlds: [
      "an intimate dark-folk acoustic chamber ritual, weathered yet humane",
      "a low-lit folkloric chamber circle shaped by old wood, breath, and patient tension",
    ],
    ensembles: [
      "bowed lyre, bass viol, wooden flute, hammered dulcimer, and a skin frame drum",
      "gut-string drone, low wooden whistle, plucked psaltery, hand drum, and sparse horsehair bowing",
    ],
    rhythmicLanguages: [
      "a circular footfall pulse with uneven hand-drum accents and deliberate breaths between gestures",
      "a restrained processional sway in asymmetrical phrases, carried by quiet heel-and-frame-drum motion",
    ],
    harmonyAndRegisters: [
      "smoky modal harmony in a grounded low register, with narrow melodic turns and one pale upper overtone",
      "earth-dark drones under bittersweet modal intervals, keeping the melody close to the speaking register",
    ],
    materialTextures: [
      "raw wood, horsehair, worn leather, close room air, and an ember-soft acoustic patina",
      "dry strings, hand-worked skin, reed breath, stone-room reflections, and gently frayed edges",
    ],
    dramaticArcs: [
      "one plucked call gathers a wary circle, loosens into mutual trust, and closes on the original hand pulse",
      "a low drone admits a searching melody, the ensemble answers in quiet ritual, and the opening cadence returns",
    ],
  },
  {
    family: "nocturnal-metropolitan",
    signals: [
      /\b(?:noir|detective|sleuth|mystery|crime|private eye|investigat\w*)\b/u,
      /\b(?:midnight|after[- ]hours|rainy city|urban|neon|shadow|smoky)\b/u,
      /\b(?:wry|sardonic|deadpan|cynical|secretive)\b/u,
    ],
    sonicWorlds: [
      "a restrained after-hours metropolitan chamber miniature with dry wit and soft suspense",
      "an intimate rain-lit urban nocturne that leaves silence around every clue-like gesture",
    ],
    ensembles: [
      "bass clarinet, muted cornet, vibraphone, upright bass harmonics, and whisper-light brushed snare",
      "felt piano, low flute, damped guitar, soft double bass, and sparse metal-key percussion",
    ],
    rhythmicLanguages: [
      "a slow sidelong shuffle with clipped pauses, understated syncopation, and patient conversational timing",
      "quiet two-step motion interrupted by suspended beats and small answering figures",
    ],
    harmonyAndRegisters: [
      "dusky extended harmony in the low-middle register, with restrained chromatic turns and cool upper color",
      "minor-major ambiguity held close to the center register, relieved by occasional warm sixths",
    ],
    materialTextures: [
      "rain-softened room tone, velvet-damped transients, close ribbon-mic warmth, and faint tape grain",
      "smoked glass, worn felt, dry wood, narrow stereo reflections, and gently silvered edges",
    ],
    dramaticArcs: [
      "a spare question receives two oblique answers, briefly finds warmth, and returns to its unresolved-but-resting step",
      "a quiet entrance gathers one concealed thread, lets it surface, and loops back through the same measured doorway",
    ],
  },
  {
    family: "organic-handmade",
    signals: [
      /\b(?:garden|botanic|nature|earth|river|meadow|moss|flower|bird|ecolog\w*)\b/u,
      /\b(?:handmade|acoustic|wooden|earthy|pastoral|homegrown|gentle)\b/u,
      /\b(?:kind|caring|tender|healer|nurtur\w*|friendly)\b/u,
    ],
    sonicWorlds: [
      "a warm handmade electro-acoustic garden chamber with breathing space between small gestures",
      "an intimate organic chamber bed shaped like sunlight moving across a quiet indoor grove",
    ],
    ensembles: [
      "felt piano, marimba, nylon-string guitar, soft cello, seed-pod shakers, and airy flute",
      "kalimba, viola, wooden mallets, mellow clarinet, handpan touches, and rounded acoustic bass",
    ],
    rhythmicLanguages: [
      "a slow leaf-like sway with lightly interwoven hand patterns and generous rests",
      "an easy breathing pulse, small rippling subdivisions, and unforced phrase endings",
    ],
    harmonyAndRegisters: [
      "sun-warmed consonance in the middle register with suspended tones and a softly rooted bass",
      "open pastoral harmony, rounded low notes, and translucent upper voices floating lightly above the center",
    ],
    materialTextures: [
      "felt, unfinished wood, woven fiber, close natural room air, and softly rounded transients",
      "warm clay, dry leaves, smooth stone, breathy reeds, and a lightly sun-faded recording surface",
    ],
    dramaticArcs: [
      "a small sprouting figure opens into a shared canopy, then curls naturally back toward its first two notes",
      "one warm pulse invites gentle layers, reaches a quiet clearing, and settles into the opening sway",
    ],
  },
  {
    family: "playful-inventive",
    signals: [
      /\b(?:playful|whims\w*|mischiev\w*|comic|funny|surreal|eccentric|absurd)\b/u,
      /\b(?:invent\w*|tinker\w*|toy|maker\w*|contraption|puzzle|improv\w*)\b/u,
      /\b(?:curious|wonder|discover\w*|adventur\w*|bright)\b/u,
    ],
    sonicWorlds: [
      "a tactile miniature theater of clever acoustic objects and softly elastic motion",
      "an intimate cabinet-of-curiosities chamber piece with buoyant logic and gentle surprise",
    ],
    ensembles: [
      "toy piano, pizzicato viola, bassoon, muted wood blocks, rounded synth plucks, and soft tuba breaths",
      "prepared piano, plucked cello, clarinet, ceramic taps, pocket-sized bellows, and rubbery analog tones",
    ],
    rhythmicLanguages: [
      "a light tiptoe pulse with tidy false starts, playful answer phrases, and calm pockets of silence",
      "small clockwork skips that stretch and rebound at a relaxed conversational pace",
    ],
    harmonyAndRegisters: [
      "bright modal harmony centered in the middle register, colored by sly bass notes and soft upper sparks",
      "warm major-minor pivots with compact melodic leaps and a rounded, grounded low voice",
    ],
    materialTextures: [
      "painted wood, ceramic clicks, felted mechanisms, soft rubber resonance, and close handmade detail",
      "paper, cork, tiny bellows, padded keys, and gently wobbling analog color",
    ],
    dramaticArcs: [
      "a neat little mechanism starts, surprises itself once, finds a graceful solution, and resets with a wink",
      "a curious motif opens two miniature doors, gathers a friendly reply, and clicks softly back into place",
    ],
  },
  {
    family: "scholarly-precise",
    signals: [
      /\b(?:archiv\w*|librar\w*|scholar\w*|academic\w*|histor\w*|philosoph\w*|scient\w*|research\w*)\b/u,
      /\b(?:mathemat\w*|engineer\w*|analyt\w*|precise|logic|strateg\w*|methodical)\b/u,
      /\b(?:inquisit\w*|thought\w*|reflect\w*|patient|observ\w*)\b/u,
    ],
    sonicWorlds: [
      "an intimate precision-chamber study where measured thought gradually reveals quiet feeling",
      "a calm modern salon miniature built from orderly patterns and humane imperfections",
    ],
    ensembles: [
      "felt piano, clarinet, cello, paper-soft percussion, sine-tone harmonics, and muted marimba",
      "prepared keyboard, viola, bass clarinet, glass rods, soft brushwork, and a restrained analog undercurrent",
    ],
    rhythmicLanguages: [
      "measured interlocking cells with subtle metric turns and deliberate spaces for reflection",
      "a patient counting pulse whose small variations feel discovered rather than announced",
    ],
    harmonyAndRegisters: [
      "clear intervallic harmony in the middle register, deepened by one questioning low line and warm suspensions",
      "balanced contrapuntal harmony with a grounded bass, translucent center, and sparing high annotations",
    ],
    materialTextures: [
      "felt, paper fiber, polished glass, dry strings, and a close archival recording warmth",
      "graphite-soft attacks, linen-damped keys, clean wood resonance, and restrained analog grain",
    ],
    dramaticArcs: [
      "one orderly premise gains a compassionate counterline, reaches a modest insight, and returns with new emphasis",
      "a precise opening cell is examined from three angles, gently reconciled, and restored for a seamless return",
    ],
  },
  {
    family: "maritime-horizon",
    signals: [
      /\b(?:sea|ocean|maritime|nautical|sailor|captain|harbor|island)\b/u,
      /\b(?:voyage|explor\w*|expedition|horizon|navigation|ship|submarine)\b/u,
      /\b(?:storm|tide|coast|lighthouse|deep water)\b/u,
    ],
    sonicWorlds: [
      "a salt-air chamber folk miniature with patient horizon-wide breathing",
      "an intimate deep-water salon where timber, wind, and distant light move in slow balance",
    ],
    ensembles: [
      "concertina breaths, bowed cello, wooden flute, muted guitar, low hand drum, and glass buoy chimes",
      "pump organ, viola, bass clarinet, plucked rope-like strings, soft toms, and distant mallet tones",
    ],
    rhythmicLanguages: [
      "a gentle tide pulse with long swells, small deck-like creaks, and steady conversational footing",
      "slow rolling phrases in balanced triples, interrupted by calm suspended horizons",
    ],
    harmonyAndRegisters: [
      "open fifths and weathered modal color across a low-middle register with rare clear high beacons",
      "deeply rooted harmony, salt-bright suspended tones, and a broad but uncluttered center register",
    ],
    materialTextures: [
      "weathered timber, canvas, rope fiber, sea-glass resonance, and soft air around close acoustic detail",
      "dark wood, brass patina, misted glass, bellows breath, and gently rolling room reflections",
    ],
    dramaticArcs: [
      "a near-horizon call gathers one measured swell, finds calm water, and returns on the same tide",
      "a low departure figure opens into quiet distance, receives a warm answer, and docks at its first cadence",
    ],
  },
  {
    family: "ceremonial-resolve",
    signals: [
      /\b(?:royal|regal|queen|king|court|diplomat|statesman|commander)\b/u,
      /\b(?:ceremonial|formal|noble|political|leadership|authority|honor)\b/u,
      /\b(?:bold|resolute|disciplined|commanding|heroic)\b/u,
    ],
    sonicWorlds: [
      "a restrained ceremonial chamber miniature with dignity held close to the table",
      "an intimate civic salon sound built from measured resolve and private warmth",
    ],
    ensembles: [
      "low violas, mellow horn, harp harmonics, bass clarinet, soft timpani touches, and felt piano",
      "chamber strings, muted flugelhorn, low oboe, restrained hand drum, and rounded piano chords",
    ],
    rhythmicLanguages: [
      "a measured processional pulse softened by conversational rubato and quiet answering gestures",
      "steady dignified steps with restrained syncopation and generous rests between statements",
    ],
    harmonyAndRegisters: [
      "warm stately harmony in the low-middle register, carrying noble suspensions with intimate restraint",
      "grounded diatonic gravity with burnished inner voices and a sparing high register",
    ],
    materialTextures: [
      "burnished brass, wool, dark polished wood, felted impacts, and close chamber-room warmth",
      "aged paper, brushed bronze, soft velvet, dry strings, and a restrained cinematic depth",
    ],
    dramaticArcs: [
      "a composed opening statement admits one vulnerable inner voice, gathers resolve, and bows back to its first cadence",
      "a quiet ceremonial figure broadens into shared purpose, then releases gently into the opening measure",
    ],
  },
] as const;

const NEUTRAL_SONIC_DIMENSIONS = {
  sonicWorlds: [
    "an intimate contemporary chamber bed with a calm, quietly distinctive inner life",
    "a handmade electro-acoustic salon miniature with soft edges and attentive space",
    "a luminous small-room instrumental world balanced between warmth and gentle curiosity",
    "a restrained modern folk-chamber miniature shaped for patient conversation",
  ],
  ensembles: [
    "felt piano, mellow clarinet, plucked cello, muted mallets, and a soft analog undertone",
    "nylon-string guitar, viola, rounded marimba, airy flute, and brushed hand percussion",
    "warm electric keys, bass clarinet, pizzicato strings, ceramic taps, and low tape-soft synth",
    "prepared piano, wooden flute, upright bass harmonics, handpan touches, and quiet bowed texture",
  ],
  rhythmicLanguages: [
    "an easy breathing pulse with small interlocking replies and generous rests",
    "a gentle asymmetrical sway that settles naturally after each conversational phrase",
    "unhurried two- and three-note cells that trade places around an open conversational center",
    "a soft walking pulse with restrained syncopation and patient phrase endings",
  ],
  harmonyAndRegisters: [
    "warm suspended harmony centered in the middle register with a softly anchored bass",
    "open modal consonance, rounded low notes, and sparing translucent upper color",
    "bittersweet major-minor balance held close to the speaking register",
    "clear chamber harmony with gentle inner motion and one calm low counterline",
  ],
  materialTextures: [
    "felt, warm wood, close room air, rounded transients, and light analog grain",
    "woven fiber, frosted glass, dry strings, and a softly weathered tape surface",
    "ceramic detail, brushed wood, breathy reeds, and a compact natural stereo field",
    "paper-soft attacks, smooth stone resonance, muted metal, and restrained room reflections",
  ],
  dramaticArcs: [
    "a modest opening gesture gathers two companion lines, finds a quiet clearing, and returns smoothly",
    "one warm call receives patient replies, deepens slightly, and settles into its first pulse",
    "a small motif opens, turns toward a contrasting color, and folds naturally back on itself",
    "a calm entrance gains subtle motion, reaches one gentle crest, and releases into the opening measure",
  ],
} as const;

const EMOTIONAL_TEMPERATURES = [
  {
    pattern: /\b(?:wry|dry|sardonic|deadpan|ironic|myster\w*|secretive)\b/u,
    value: "wry and shadowed, with patient curiosity",
  },
  {
    pattern: /\b(?:warm|kind|gentle|caring|friendly|tender|compassion\w*)\b/u,
    value: "warm and open, carried with quiet affection",
  },
  {
    pattern: /\b(?:playful|funny|comic|mischiev\w*|whims\w*|surreal)\b/u,
    value: "lightly mischievous and buoyant while remaining composed",
  },
  {
    pattern: /\b(?:reflect\w*|thought\w*|philosoph\w*|quiet|patient|melanchol\w*)\b/u,
    value: "reflective and bittersweet, with an unhurried center",
  },
  {
    pattern: /\b(?:bold|lively|restless|adventur\w*|resolute|brave)\b/u,
    value: "quietly resolute, with contained forward motion",
  },
  {
    pattern: /\b(?:curious|inquisit\w*|wonder|discover\w*|invent\w*)\b/u,
    value: "curious and alert, softened by intimate warmth",
  },
] as const;

const NEUTRAL_EMOTIONAL_TEMPERATURES = [
  "warmly curious and quietly attentive",
  "composed and humane with a trace of wonder",
  "reflective, welcoming, and gently alert",
  "calmly distinctive with understated warmth",
] as const;

function boundedSourceText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/gu, " ").trim().slice(0, maxLength).trim().toLowerCase();
}

function stableSonicHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function sonicChoice<T>(values: readonly T[], seed: string, dimension: string): T {
  return values[stableSonicHash(`${seed}\u241f${dimension}`) % values.length]!;
}

function sonicPaletteScore(palette: CoffeeGroupSonicPalette, source: string): number {
  return palette.signals.reduce(
    (score, pattern) => score + (pattern.test(source) ? 1 : 0),
    0,
  );
}

function sonicPaletteFor(castSource: string, directionSource: string, seed: string): CoffeeGroupSonicPalette | null {
  const scored = COFFEE_GROUP_SONIC_PALETTES.map((palette) => ({
    palette,
    score:
      sonicPaletteScore(palette, castSource) +
      sonicPaletteScore(palette, directionSource) * 4,
  }));
  const highest = Math.max(0, ...scored.map(({ score }) => score));
  if (highest === 0) return null;
  const leaders = scored
    .filter(({ score }) => score === highest)
    .map(({ palette }) => palette);
  return sonicChoice(leaders, seed, "family");
}

function boundedCoffeeSoundtrackSources(args: CoffeeGroupSoundtrackPromptInput): {
  castSource: string;
  directionSource: string;
  seed: string;
} {
  const castSource = [
    boundedSourceText(args.groupName, COFFEE_SOUNDTRACK_GROUP_NAME_SOURCE_MAX),
    boundedSourceText(args.ethos, COFFEE_SOUNDTRACK_GROUP_ETHOS_SOURCE_MAX),
    ...args.bots.slice(0, COFFEE_SOUNDTRACK_BOT_SOURCE_MAX).flatMap((bot) => [
      boundedSourceText(bot.name, COFFEE_SOUNDTRACK_BOT_NAME_SOURCE_MAX),
      boundedSourceText(
        bot.personaSnippet,
        COFFEE_SOUNDTRACK_PERSONA_SOURCE_MAX,
      ),
    ]),
  ]
    .filter(Boolean)
    .join(" | ");
  const directionSource = normalizePrismRefractDirection(args.direction).toLowerCase();
  const seed = `${castSource || "neutral table"}\u241f${directionSource}`;
  return { castSource, directionSource, seed };
}

/**
 * Reduces bounded public cast identity and optional Refract direction to a
 * fixed-vocabulary musical fingerprint. Raw names, profile prose, and player
 * direction can influence selection but can never cross the provider boundary.
 */
export function buildCoffeeGroupSonicFingerprint(
  args: CoffeeGroupSoundtrackPromptInput,
): CoffeeGroupSonicFingerprint {
  const { castSource, directionSource, seed } = boundedCoffeeSoundtrackSources(args);
  const combinedSource = `${castSource} | ${directionSource}`;
  const palette = sonicPaletteFor(castSource, directionSource, seed);
  const emotionalMatches = EMOTIONAL_TEMPERATURES.filter(({ pattern }) =>
    pattern.test(combinedSource),
  );
  const emotionalTemperature = emotionalMatches.length > 0
    ? sonicChoice(emotionalMatches, seed, "emotional-temperature").value
    : sonicChoice(
        NEUTRAL_EMOTIONAL_TEMPERATURES,
        seed,
        "emotional-temperature",
      );
  if (!palette) {
    return {
      family: "neutral-intimate",
      emotionalTemperature,
      sonicWorld: sonicChoice(NEUTRAL_SONIC_DIMENSIONS.sonicWorlds, seed, "sonic-world"),
      ensemble: sonicChoice(NEUTRAL_SONIC_DIMENSIONS.ensembles, seed, "ensemble"),
      rhythmicLanguage: sonicChoice(
        NEUTRAL_SONIC_DIMENSIONS.rhythmicLanguages,
        seed,
        "rhythm",
      ),
      harmonyAndRegister: sonicChoice(
        NEUTRAL_SONIC_DIMENSIONS.harmonyAndRegisters,
        seed,
        "harmony",
      ),
      materialTexture: sonicChoice(
        NEUTRAL_SONIC_DIMENSIONS.materialTextures,
        seed,
        "texture",
      ),
      dramaticArc: sonicChoice(
        NEUTRAL_SONIC_DIMENSIONS.dramaticArcs,
        seed,
        "arc",
      ),
    };
  }
  return {
    family: palette.family,
    emotionalTemperature,
    sonicWorld: sonicChoice(palette.sonicWorlds, seed, "sonic-world"),
    ensemble: sonicChoice(palette.ensembles, seed, "ensemble"),
    rhythmicLanguage: sonicChoice(
      palette.rhythmicLanguages,
      seed,
      "rhythm",
    ),
    harmonyAndRegister: sonicChoice(
      palette.harmonyAndRegisters,
      seed,
      "harmony",
    ),
    materialTexture: sonicChoice(
      palette.materialTextures,
      seed,
      "texture",
    ),
    dramaticArc: sonicChoice(palette.dramaticArcs, seed, "arc"),
  };
}

/** Sends only fixed-vocabulary, generic musical features to ElevenLabs. */
export function buildCoffeeGroupSoundtrackPrompt(
  args: CoffeeGroupSoundtrackPromptInput,
): string {
  const fingerprint = buildCoffeeGroupSonicFingerprint(args);
  return [
    "Wholly original instrumental music for a calm, intimate cafe conversation.",
    "Consistent style: lo-fi focus music with warm, softly worn production and a jazzy or adjacent easy-listening sensibility.",
    "Percussion foundation: a steady, light, human-feeling groove with brushed, tapped, or muted percussion that supports concentration and spoken conversation.",
    `Emotional temperature: ${fingerprint.emotionalTemperature}.`,
    `Sonic world: ${fingerprint.sonicWorld}.`,
    `Ensemble and instrument families: ${fingerprint.ensemble}.`,
    `Rhythmic language: ${fingerprint.rhythmicLanguage}.`,
    `Harmonic temperature and register: ${fingerprint.harmonyAndRegister}.`,
    `Material and production texture: ${fingerprint.materialTexture}.`,
    `Dramatic arc: ${fingerprint.dramaticArc}.`,
    "Use the cast-derived instruments and textures as the track's distinctive color inside this consistent focus-music foundation.",
    "Keep the performance unhurried, low-intensity, speech-safe, spacious, and comfortable beneath spoken voices.",
    "Shape an approximately ninety-second (one-minute-thirty-second) bed with a clean opening, subtle development, and a smooth loop-friendly return.",
  ].join(" ");
}

function rowFor(db: DatabaseSync, userId: string, groupId: string): SoundtrackRow | undefined {
  return db.prepare(
    `SELECT generation_status, generation_token, provider, model, prompt,
            content_type, audio_bytes, duration_ms, revision,
            previous_audio_bytes, error, updated_at
       FROM coffee_group_soundtracks WHERE group_id = ? AND user_id = ?`,
  ).get(groupId, userId) as SoundtrackRow | undefined;
}

export function coffeeGroupSoundtrackMetadata(db: DatabaseSync, userId: string, groupId: string): CoffeeGroupSoundtrack | null {
  const row = rowFor(db, userId, groupId);
  if (!row) return null;
  const hasAudio = Boolean(row.audio_bytes?.byteLength);
  return {
    status: hasAudio ? "ready" : row.generation_status,
    generating: row.generation_status === "generating",
    provider: row.provider === "elevenlabs" ? "elevenlabs" : null,
    model: row.model,
    prompt: row.prompt,
    contentType: hasAudio ? row.content_type : null,
    durationMs: hasAudio ? row.duration_ms : null,
    revision: hasAudio ? Math.max(0, row.revision) : 0,
    undoAvailable: Boolean(row.previous_audio_bytes?.byteLength),
    updatedAt: row.updated_at,
    ...(row.error ? { error: row.error } : {}),
  };
}

export function ensureCoffeeGroupSoundtrack(db: DatabaseSync, userId: string, groupId: string, status: "preparing" | "unavailable" = "preparing", error?: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO coffee_group_soundtracks
       (group_id, user_id, generation_status, revision, error, created_at, updated_at)
     SELECT id, user_id, ?, 0, ?, ?, ? FROM coffee_groups WHERE id = ? AND user_id = ?`,
  ).run(status, error ?? null, now, now, groupId, userId);
  if (status === "unavailable") {
    db.prepare(
      `UPDATE coffee_group_soundtracks
          SET generation_status = 'unavailable', generation_token = NULL,
              error = ?, updated_at = ?
        WHERE group_id = ? AND user_id = ? AND audio_bytes IS NULL`,
    ).run(error ?? null, now, groupId, userId);
  }
}

export function beginCoffeeGroupSoundtrackGeneration(db: DatabaseSync, userId: string, groupId: string): string | null {
  ensureCoffeeGroupSoundtrack(db, userId, groupId);
  const token = randomId(16);
  const result = db.prepare(
    `UPDATE coffee_group_soundtracks
        SET generation_status = 'generating', generation_token = ?, error = NULL, updated_at = ?
      WHERE group_id = ? AND user_id = ? AND generation_status <> 'generating'`,
  ).run(token, new Date().toISOString(), groupId, userId);
  return Number(result.changes ?? 0) === 1 ? token : null;
}

export function completeCoffeeGroupSoundtrackGeneration(db: DatabaseSync, userId: string, groupId: string, token: string, input: { prompt: string; contentType: string; audioBytes: Buffer }): boolean {
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE coffee_group_soundtracks
      SET generation_status = 'ready', generation_token = NULL,
            previous_provider = CASE WHEN audio_bytes IS NULL THEN previous_provider ELSE provider END,
            previous_model = CASE WHEN audio_bytes IS NULL THEN previous_model ELSE model END,
            previous_prompt = CASE WHEN audio_bytes IS NULL THEN previous_prompt ELSE prompt END,
            previous_content_type = CASE WHEN audio_bytes IS NULL THEN previous_content_type ELSE content_type END,
            previous_audio_bytes = CASE WHEN audio_bytes IS NULL THEN previous_audio_bytes ELSE audio_bytes END,
            previous_duration_ms = CASE WHEN audio_bytes IS NULL THEN previous_duration_ms ELSE duration_ms END,
            previous_revision = CASE WHEN audio_bytes IS NULL THEN previous_revision ELSE revision END,
            previous_updated_at = CASE WHEN audio_bytes IS NULL THEN previous_updated_at ELSE updated_at END,
            provider = 'elevenlabs', model = ?, prompt = ?, content_type = ?,
            audio_bytes = ?, duration_ms = ?,
            revision = MAX(revision, COALESCE(previous_revision, 0)) + 1,
            error = NULL, updated_at = ?
      WHERE group_id = ? AND user_id = ? AND generation_token = ?`,
  ).run(COFFEE_ELEVENLABS_MUSIC_MODEL, input.prompt, input.contentType, input.audioBytes,
    COFFEE_SOUNDTRACK_DURATION_MS, now, groupId, userId, token);
  return Number(result.changes ?? 0) === 1;
}

/** Swaps the active bed with the one retained predecessor; no third revision is kept. */
export function undoCoffeeGroupSoundtrack(
  db: DatabaseSync,
  userId: string,
  groupId: string,
): boolean {
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE coffee_group_soundtracks
        SET provider = previous_provider,
            model = previous_model,
            prompt = previous_prompt,
            content_type = previous_content_type,
            audio_bytes = previous_audio_bytes,
            duration_ms = previous_duration_ms,
            revision = previous_revision,
            previous_provider = provider,
            previous_model = model,
            previous_prompt = prompt,
            previous_content_type = content_type,
            previous_audio_bytes = audio_bytes,
            previous_duration_ms = duration_ms,
            previous_revision = revision,
            previous_updated_at = updated_at,
            generation_status = 'ready', generation_token = NULL,
            error = NULL, updated_at = ?
      WHERE group_id = ? AND user_id = ?
        AND previous_audio_bytes IS NOT NULL`,
  ).run(now, groupId, userId);
  return Number(result.changes ?? 0) === 1;
}

export function failCoffeeGroupSoundtrackGeneration(db: DatabaseSync, userId: string, groupId: string, token: string | null, error: string, unavailable = false): void {
  db.prepare(
    `UPDATE coffee_group_soundtracks
        SET generation_status = ?, generation_token = NULL, error = ?, updated_at = ?
      WHERE group_id = ? AND user_id = ? AND (? IS NULL OR generation_token = ?)`,
  ).run(unavailable ? "unavailable" : "failed", error.slice(0, 500), new Date().toISOString(), groupId, userId, token, token);
}

export function readCoffeeGroupSoundtrackAudio(db: DatabaseSync, userId: string, groupId: string): { audioBytes: Buffer; contentType: string; revision: number } | null {
  const row = rowFor(db, userId, groupId);
  if (!row?.audio_bytes?.byteLength || !row.content_type) return null;
  return { audioBytes: Buffer.from(row.audio_bytes), contentType: row.content_type, revision: row.revision };
}
