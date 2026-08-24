import {
  LOCAL_VOICE_SPEECHPRINT_STRENGTHS,
  normalizeVoiceAccentDefinitionId,
  normalizeLocalVoicePronunciationBase,
  normalizeLocalVoiceSpeechprintInfluence,
  normalizeLocalVoiceSpeechprintStrength,
  normalizeLocalVoiceSpeechprintVariationSeed,
  type LocalVoiceSpeechprintInfluence,
  type LocalVoicePronunciationBase,
  type LocalVoiceSpeechprintStrength,
  type LocalVoiceSpeechprintV1,
  type VoiceAccentDefinitionId,
} from "./audioVoice.ts";

export const LOCAL_VOICE_SPEECHPRINT_RULESET_VERSION = "2026.08.17.3";
/** SHA-256 of the qualified Instant IPA matrix (see speechprint-runtime.test.ts). */
export const LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256 =
  "e20a85599130ba2888330759230591882a0e414a207730b3f870b76ad79f2241";

export interface LocalVoiceSpeechprintCapabilityV1 {
  id: Exclude<LocalVoiceSpeechprintInfluence, "none">;
  label: string;
  description: string;
  approximate: true;
  supportedBaseLocales: readonly ["en-US", "en-GB"];
  strengths: readonly LocalVoiceSpeechprintStrength[];
  supportedEngines: readonly ["instant"];
  rulesetVersion: string;
  rulesetSha256: string;
}

/** One Accent Map identity can drive a precise Premium cue while Local uses
 * the closest qualified Speechprint. */
export interface VoiceAccentDefinitionV1 {
  id: VoiceAccentDefinitionId;
  premiumAccentedEnglishLabel: string;
  premiumNativeAccentAliases: readonly string[];
  /** Provider-actionable name for the Premium direction, when the atlas label
   * is a region no speech model has a concept of. Display never uses it. */
  premiumDirectionLabel?: string;
  localSpeechprintFallback: LocalVoiceSpeechprintInfluence;
  localPronunciationBaseFallback?: "en-US" | "en-GB";
}

export interface VoiceAccentMapPointV1 {
  x: number;
  y: number;
}

export interface VoiceAccentMapAnchorV1 {
  id: string;
  point: VoiceAccentMapPointV1;
  accentDefinitionId: VoiceAccentDefinitionId;
  pronunciationBase?: "en-US" | "en-GB";
  influence?: Exclude<LocalVoiceSpeechprintInfluence, "none">;
  /** Co-located choices are explicit variants, never demographic inference. */
  variantGroup?: string;
  fieldDefault?: boolean;
  /** Radius of the source's exact 100% home core in atlas map space. */
  coreRadius: number;
  /** Radius that calibrates how gradually this source falls toward neighbors. */
  supportRadius: number;
  /** Geographic pronunciation family used to preserve home-range coverage. */
  sourceFamily?: string;
}

export interface VoiceAccentMapFamilyHomeRangeV1 {
  id: string;
  sourceFamily: string;
  /** Maximum foreign-family share well inside this home range. */
  interiorForeignBlendMax: number;
  /** Maximum foreign-family share right on this home range's boundary. */
  boundaryForeignBlendMax: number;
  /** Distance outside the boundary over which the home family fades away. */
  transitionWidth: number;
  /**
   * Deliberately coarse geographic coverage, not a claim about a resident's
   * identity or speech. Coordinates only keep a freely placed map pin inside
   * the local pronunciation family while nearby sources blend at boundaries.
   */
  polygon: readonly VoiceAccentMapPointV1[];
}

export interface VoiceAccentFieldLayerV1 {
  accentDefinitionId: VoiceAccentDefinitionId;
  pronunciationBase: LocalVoicePronunciationBase;
  influence: LocalVoiceSpeechprintInfluence;
  weight: number;
}

export interface VoiceAccentFieldResolutionV1 {
  legacy: boolean;
  layers: readonly VoiceAccentFieldLayerV1[];
}

export function voiceAccentMapPointForCoordinates(
  longitudeDegrees: number,
  latitudeDegrees: number,
): VoiceAccentMapPointV1 {
  return {
    x: (longitudeDegrees + 180) / 360,
    y: (90 - latitudeDegrees) / 180,
  };
}

const SUPPORTED_BASE_LOCALES = ["en-US", "en-GB"] as const;
const SUPPORTED_ENGINES = ["instant"] as const;

const LOCAL_VOICE_SPEECHPRINT_DESCRIPTORS = [
  {
    id: "spanish-influenced-english",
    label: "Spanish-influenced English",
    description:
      "A restrained Spanish-language pronunciation and early-stress rhythm influence.",
  },
  {
    id: "latin-american-spanish-influenced-english",
    label: "Latin American Spanish-influenced English",
    description:
      "A restrained Latin American Spanish pronunciation and early-stress rhythm influence.",
  },
  {
    id: "mexican-spanish-influenced-english",
    label: "Mexican Spanish-influenced English",
    description:
      "A restrained Mexican Spanish pronunciation and early-stress rhythm influence.",
  },
  {
    id: "brazilian-portuguese-influenced-english",
    label: "Brazilian Portuguese-influenced English",
    description:
      "A restrained Brazilian Portuguese pronunciation and penultimate-rhythm influence.",
  },
  {
    id: "european-portuguese-influenced-english",
    label: "European Portuguese-influenced English",
    description:
      "A restrained European Portuguese pronunciation and penultimate-rhythm influence.",
  },
  {
    id: "mandarin-influenced-english",
    label: "Mandarin-influenced English",
    description: "A restrained Mandarin pronunciation influence.",
  },
  {
    id: "cantonese-influenced-english",
    label: "Cantonese-influenced English",
    description: "A restrained Cantonese pronunciation influence.",
  },
  {
    id: "japanese-influenced-english",
    label: "Japanese-influenced English",
    description: "A restrained Japanese pronunciation influence.",
  },
  {
    id: "korean-influenced-english",
    label: "Korean-influenced English",
    description: "A restrained Korean pronunciation influence.",
  },
  {
    id: "indian-english",
    label: "Indian English",
    description: "A restrained Indian English pronunciation profile.",
  },
  {
    id: "pakistani-english",
    label: "Pakistani English",
    description: "A restrained Pakistani English pronunciation profile.",
  },
  {
    id: "bengali-influenced-english",
    label: "Bengali-influenced English",
    description: "A restrained Bengali pronunciation influence.",
  },
  {
    id: "sri-lankan-english",
    label: "Sri Lankan English",
    description: "A restrained Sri Lankan English pronunciation profile.",
  },
  {
    id: "french-influenced-english",
    label: "French-influenced English",
    description:
      "A restrained French-language pronunciation and final-stress rhythm influence.",
  },
  {
    id: "german-influenced-english",
    label: "German-influenced English",
    description: "A restrained German-language pronunciation influence.",
  },
  {
    id: "dutch-influenced-english",
    label: "Dutch-influenced English",
    description: "A restrained Dutch pronunciation influence.",
  },
  {
    id: "nordic-influenced-english",
    label: "Nordic-influenced English",
    description: "A restrained Nordic-language pronunciation influence.",
  },
  {
    id: "polish-influenced-english",
    label: "Polish-influenced English",
    description: "A restrained Polish pronunciation influence.",
  },
  {
    id: "greek-influenced-english",
    label: "Greek-influenced English",
    description: "A restrained Greek pronunciation influence.",
  },
  {
    id: "russian-influenced-english",
    label: "Russian-influenced English",
    description: "A restrained Russian-language pronunciation influence.",
  },
  {
    id: "italian-influenced-english",
    label: "Italian-influenced English",
    description:
      "A restrained Italian-language pronunciation and penultimate-rhythm influence.",
  },
  {
    id: "irish-english",
    label: "Irish English",
    description: "A restrained Irish English pronunciation profile.",
  },
  {
    id: "scottish-english",
    label: "Scottish English",
    description: "A restrained Scottish English pronunciation profile.",
  },
  {
    id: "australian-english",
    label: "Australian English",
    description: "A restrained Australian English pronunciation profile.",
  },
  {
    id: "new-zealand-english",
    label: "New Zealand English",
    description: "A restrained New Zealand English pronunciation profile.",
  },
  {
    id: "canadian-english",
    label: "Canadian English",
    description: "A restrained Canadian English pronunciation profile.",
  },
  {
    id: "new-york-english",
    label: "New York English",
    description: "A restrained New York English pronunciation profile.",
  },
  {
    id: "new-jersey-english",
    label: "New Jersey English",
    description: "A restrained New Jersey English pronunciation profile.",
  },
  {
    id: "southern-us-english",
    label: "Southern U.S. English",
    description: "A restrained Southern U.S. English pronunciation profile.",
  },
  {
    id: "southern-california-english",
    label: "Southern California English",
    description: "A restrained coastal Southern California English profile.",
  },
  {
    id: "bay-area-english",
    label: "Bay Area English",
    description: "A restrained San Francisco Bay Area English profile.",
  },
  {
    id: "inland-north-english",
    label: "Inland North English",
    description: "A restrained Great Lakes Inland North English profile.",
  },
  {
    id: "texas-english",
    label: "Texas English",
    description: "A restrained contemporary Texas English profile.",
  },
  {
    id: "appalachian-english",
    label: "Appalachian English",
    description: "A restrained central and southern Appalachian English profile.",
  },
  {
    id: "eastern-new-england-english",
    label: "Eastern New England English",
    description: "A restrained coastal Eastern New England English profile.",
  },
  {
    id: "north-florida-english",
    label: "North Florida English",
    description: "A restrained North Florida and lower coastal South English profile.",
  },
  {
    id: "miami-english",
    label: "Miami English",
    description: "A restrained Miami English regional profile without demographic inference.",
  },
  {
    id: "modern-rp-english",
    label: "Modern RP / Standard Southern British",
    description: "A restrained contemporary non-regional Southern British profile.",
  },
  {
    id: "cockney-english",
    label: "Cockney English",
    description: "A restrained traditional East London English profile.",
  },
  {
    id: "estuary-english",
    label: "Estuary English",
    description: "A restrained Thames Estuary and southeast English profile.",
  },
  {
    id: "multicultural-london-english",
    label: "Multicultural London English",
    description: "A restrained contemporary London multiethnolect profile selected only by name.",
  },
  {
    id: "essex-english",
    label: "Essex English",
    description: "A restrained Essex and eastward Thames English profile.",
  },
  {
    id: "parisian-french-influenced-english",
    label: "Paris-region French-influenced English",
    description: "A restrained Paris-region French pronunciation influence.",
  },
  {
    id: "southern-french-influenced-english",
    label: "Southern French-influenced English",
    description: "A restrained southern French pronunciation and rhythm influence.",
  },
  {
    id: "northern-german-influenced-english",
    label: "Northern German-influenced English",
    description: "A restrained northern German pronunciation influence.",
  },
  {
    id: "bavarian-german-influenced-english",
    label: "Bavarian German-influenced English",
    description: "A restrained southern German pronunciation influence.",
  },
  {
    id: "northern-italian-influenced-english",
    label: "Northern Italian-influenced English",
    description: "A restrained northern Italian pronunciation influence.",
  },
  {
    id: "southern-italian-influenced-english",
    label: "Southern Italian-influenced English",
    description: "A restrained southern Italian pronunciation and rhythm influence.",
  },
  {
    id: "andalusian-spanish-influenced-english",
    label: "Andalusian Spanish-influenced English",
    description: "A restrained Andalusian Spanish pronunciation influence.",
  },
  {
    id: "caribbean-english",
    label: "Caribbean English",
    description: "A restrained Caribbean English pronunciation profile.",
  },
  {
    id: "north-african-arabic-influenced-english",
    label: "North African Arabic-influenced English",
    description: "A restrained North African Arabic pronunciation influence.",
  },
  {
    id: "middle-eastern-arabic-influenced-english",
    label: "Middle Eastern Arabic-influenced English",
    description: "A restrained Middle Eastern Arabic pronunciation influence.",
  },
  {
    id: "persian-influenced-english",
    label: "Persian-influenced English",
    description: "A restrained Persian pronunciation influence.",
  },
  {
    id: "turkish-influenced-english",
    label: "Turkish-influenced English",
    description: "A restrained Turkish pronunciation influence.",
  },
  {
    id: "nigerian-english",
    label: "Nigerian English",
    description: "A restrained Nigerian English pronunciation profile.",
  },
  {
    id: "east-african-english",
    label: "East African English",
    description: "A restrained East African English pronunciation profile.",
  },
  {
    id: "south-african-english",
    label: "South African English",
    description: "A restrained South African English pronunciation profile.",
  },
  {
    id: "filipino-english",
    label: "Filipino English",
    description: "A restrained Filipino English pronunciation profile.",
  },
  {
    id: "vietnamese-influenced-english",
    label: "Vietnamese-influenced English",
    description: "A restrained Vietnamese pronunciation influence.",
  },
  {
    id: "thai-influenced-english",
    label: "Thai-influenced English",
    description: "A restrained Thai pronunciation influence.",
  },
  {
    id: "indonesian-influenced-english",
    label: "Indonesian-influenced English",
    description: "A restrained Indonesian pronunciation influence.",
  },
  {
    id: "singapore-english",
    label: "Singapore English",
    description: "A restrained Singapore English pronunciation profile.",
  },
  {
    id: "pacific-island-english",
    label: "Pacific Island English",
    description: "A restrained Pacific Island English pronunciation profile.",
  },
] as const satisfies ReadonlyArray<{
  id: Exclude<LocalVoiceSpeechprintInfluence, "none">;
  label: string;
  description: string;
}>;

export const LOCAL_VOICE_SPEECHPRINT_CAPABILITIES =
  LOCAL_VOICE_SPEECHPRINT_DESCRIPTORS.map((entry) => ({
    ...entry,
    approximate: true as const,
    supportedBaseLocales: SUPPORTED_BASE_LOCALES,
    strengths: LOCAL_VOICE_SPEECHPRINT_STRENGTHS,
    supportedEngines: SUPPORTED_ENGINES,
    rulesetVersion: LOCAL_VOICE_SPEECHPRINT_RULESET_VERSION,
    rulesetSha256: LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256,
  })) satisfies readonly LocalVoiceSpeechprintCapabilityV1[];

function premiumAccentLabel(label: string): string {
  return label
    .replace(/-influenced English$/u, "")
    .replace(/ English$/u, "")
    .trim();
}

function premiumNativeAccentAliases(
  id: LocalVoiceSpeechprintInfluence,
  label: string,
): readonly string[] {
  const accentLabel = premiumAccentLabel(label);
  const aliases = [accentLabel, label];
  if (id === "german-influenced-english") {
    aliases.push("Germany", "German (Germany)", "German English", "de-DE");
  }
  return aliases;
}

/**
 * Regional American accents keep the rhotic en-US pronunciation base even when
 * the underlying voice is British. Without this pin, a Texas or Bay Area
 * accent on a British base voice phonemized through en-GB and every hard R
 * silently disappeared. Deliberately non-rhotic American regions (New York,
 * Eastern New England) stay in this set: their rule lists drop exactly the
 * coda R's they intend to, which requires the rhotic base to exist first.
 */
const AMERICAN_PRONUNCIATION_BASE_INFLUENCES = new Set<
  Exclude<LocalVoiceSpeechprintInfluence, "none">
>([
  "canadian-english",
  "new-york-english",
  "new-jersey-english",
  "southern-us-english",
  "southern-california-english",
  "bay-area-english",
  "inland-north-english",
  "texas-english",
  "appalachian-english",
  "eastern-new-england-english",
  "north-florida-english",
  "miami-english",
]);

const BRITISH_PRONUNCIATION_BASE_INFLUENCES = new Set<
  Exclude<LocalVoiceSpeechprintInfluence, "none">
>([
  "modern-rp-english",
  "cockney-english",
  "estuary-english",
  "multicultural-london-english",
  "essex-english",
  "irish-english",
  "scottish-english",
]);

/**
 * The direction tag is the entire Premium accent mechanism: Premium sends the
 * written line through untouched. A tag naming a region the provider has no
 * concept of therefore produces no accent at all, which is strictly worse than
 * naming its nearest well-known neighbour — most of the same phonology reaches
 * the listener, and PRISM decides the substitution rather than leaving it to
 * whatever the provider makes of a place name. The Accent Map keeps showing
 * the precise place; only the private cue changes.
 *
 * These are the points whose atlas label is a dialectologist's name rather
 * than an accent anyone would ask a performer for. Every other definition
 * already names something a performer could act on directly.
 */
const PREMIUM_ACCENT_DIRECTION_LABELS: Partial<
  Record<Exclude<LocalVoiceSpeechprintInfluence, "none">, string>
> = {
  "southern-us-english": "Southern American",
  "north-florida-english": "Southern American",
  "southern-california-english": "Californian",
  "bay-area-english": "Northern Californian",
  "inland-north-english": "Midwestern American",
  "eastern-new-england-english": "Boston",
  "texas-english": "Texan",
  "appalachian-english": "Appalachian American",
  "modern-rp-english": "Received Pronunciation",
  "estuary-english": "Estuary English",
  "parisian-french-influenced-english": "Parisian French",
  "nordic-influenced-english": "Scandinavian",
  "singapore-english": "Singaporean",
};

export const VOICE_ACCENT_DEFINITIONS: readonly VoiceAccentDefinitionV1[] = [
  {
    id: "general-american-english",
    premiumAccentedEnglishLabel: "General American-accented English",
    premiumNativeAccentAliases: [
      "General American",
      "American",
      "American English",
      "US English",
      "English (United States)",
      "en-US",
    ],
    localSpeechprintFallback: "none",
    localPronunciationBaseFallback: "en-US",
  },
  ...LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.map((capability) => ({
    id: capability.id,
    premiumAccentedEnglishLabel:
      capability.id === "modern-rp-english"
        ? "Modern RP-accented English"
        : `${premiumAccentLabel(capability.label)}-accented English`,
    premiumNativeAccentAliases: premiumNativeAccentAliases(
      capability.id,
      capability.label,
    ),
    ...(PREMIUM_ACCENT_DIRECTION_LABELS[capability.id]
      ? { premiumDirectionLabel: PREMIUM_ACCENT_DIRECTION_LABELS[capability.id] }
      : {}),
    localSpeechprintFallback: capability.id,
    ...(AMERICAN_PRONUNCIATION_BASE_INFLUENCES.has(capability.id)
      ? { localPronunciationBaseFallback: "en-US" as const }
      : BRITISH_PRONUNCIATION_BASE_INFLUENCES.has(capability.id)
        ? { localPronunciationBaseFallback: "en-GB" as const }
      : {}),
  })),
];

const VOICE_ACCENT_MAP_COORDINATES = {
  "spanish-influenced-english": [-3.7, 40.4],
  "latin-american-spanish-influenced-english": [-74.07, 4.71],
  "mexican-spanish-influenced-english": [-99.13, 19.43],
  "brazilian-portuguese-influenced-english": [-47.9, -15.8],
  "european-portuguese-influenced-english": [-9.14, 38.72],
  "mandarin-influenced-english": [116.4, 39.9],
  "cantonese-influenced-english": [114.17, 22.32],
  "japanese-influenced-english": [139.7, 35.7],
  "korean-influenced-english": [127, 37.6],
  "indian-english": [77.2, 28.6],
  "pakistani-english": [73.05, 33.68],
  "bengali-influenced-english": [90.41, 23.81],
  "sri-lankan-english": [79.86, 6.93],
  "french-influenced-english": [2.35, 48.86],
  "german-influenced-english": [13.4, 52.52],
  "dutch-influenced-english": [4.9, 52.37],
  "nordic-influenced-english": [18.07, 59.33],
  "polish-influenced-english": [21.01, 52.23],
  "greek-influenced-english": [23.73, 37.98],
  "russian-influenced-english": [37.62, 55.75],
  "italian-influenced-english": [12.5, 41.9],
  "irish-english": [-6.26, 53.35],
  "scottish-english": [-3.19, 55.95],
  "australian-english": [149.13, -35.28],
  "new-zealand-english": [174.78, -41.29],
  "canadian-english": [-75.7, 45.42],
  "new-york-english": [-74.01, 40.71],
  "new-jersey-english": [-74.17, 40.73],
  "southern-us-english": [-84.39, 33.75],
  "southern-california-english": [-118.24, 34.05],
  "bay-area-english": [-122.27, 37.8],
  "inland-north-english": [-87.63, 41.88],
  "texas-english": [-97.74, 30.27],
  "appalachian-english": [-82.55, 35.6],
  "eastern-new-england-english": [-71.06, 42.36],
  "north-florida-english": [-84.28, 30.44],
  "miami-english": [-80.19, 25.76],
  "modern-rp-english": [-0.13, 51.51],
  "cockney-english": [-0.13, 51.51],
  "estuary-english": [-0.13, 51.51],
  "multicultural-london-english": [-0.13, 51.51],
  "essex-english": [0.47, 51.73],
  "parisian-french-influenced-english": [2.35, 48.86],
  "southern-french-influenced-english": [5.37, 43.3],
  "northern-german-influenced-english": [10, 53.55],
  "bavarian-german-influenced-english": [11.58, 48.14],
  "northern-italian-influenced-english": [9.19, 45.46],
  "southern-italian-influenced-english": [14.27, 40.85],
  "andalusian-spanish-influenced-english": [-5.98, 37.39],
  "caribbean-english": [-76.79, 17.97],
  "north-african-arabic-influenced-english": [10.18, 36.8],
  "middle-eastern-arabic-influenced-english": [46.68, 24.71],
  "persian-influenced-english": [51.39, 35.69],
  "turkish-influenced-english": [32.86, 39.93],
  "nigerian-english": [3.38, 6.52],
  "east-african-english": [36.82, -1.29],
  "south-african-english": [28.05, -26.2],
  "filipino-english": [120.98, 14.6],
  "vietnamese-influenced-english": [105.83, 21.03],
  "thai-influenced-english": [100.5, 13.76],
  "indonesian-influenced-english": [106.85, -6.2],
  "singapore-english": [103.82, 1.35],
  "pacific-island-english": [178.45, -18.14],
} as const satisfies Record<
  Exclude<LocalVoiceSpeechprintInfluence, "none">,
  readonly [number, number]
>;

const LONDON_VARIANTS = new Set<LocalVoiceSpeechprintInfluence>([
  "modern-rp-english",
  "cockney-english",
  "estuary-english",
  "multicultural-london-english",
]);

type VoiceAccentMapAnchorSeedV1 = Omit<
  VoiceAccentMapAnchorV1,
  "coreRadius" | "supportRadius"
>;

const GERMAN_ACCENT_SOURCE_FAMILY = new Set<VoiceAccentDefinitionId>([
  "german-influenced-english",
  "northern-german-influenced-english",
  "bavarian-german-influenced-english",
]);

const VOICE_ACCENT_MAP_FIELD_RANGE_OVERRIDES: Readonly<
  Partial<
    Record<
      VoiceAccentDefinitionId,
      Readonly<{ coreRadius?: number; supportRadius?: number }>
    >
  >
> = {
  // Bavaria gets a legible home core while France's broader language source
  // carries the westward transition before the nearer Alpine point can steal
  // that boundary. These are map-space casting approximations, not borders.
  "bavarian-german-influenced-english": {
    coreRadius: 0.005,
    supportRadius: 0.04,
  },
  "french-influenced-english": { supportRadius: 0.05 },
  "parisian-french-influenced-english": { supportRadius: 0.05 },
  "northern-italian-influenced-english": { supportRadius: 0.022 },
  "german-influenced-english": { supportRadius: 0.045 },
  "northern-german-influenced-english": { supportRadius: 0.04 },
};

const VOICE_ACCENT_MAP_ANCHOR_SEEDS: readonly VoiceAccentMapAnchorSeedV1[] = [
  {
    id: "base-en-US",
    point: voiceAccentMapPointForCoordinates(-98.5, 39.8),
    pronunciationBase: "en-US",
    accentDefinitionId: "general-american-english",
  },
  ...LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.map((capability) => {
    const [longitude, latitude] = VOICE_ACCENT_MAP_COORDINATES[capability.id];
    return {
      id: `influence-${capability.id}`,
      point: voiceAccentMapPointForCoordinates(longitude, latitude),
      influence: capability.id,
      accentDefinitionId: capability.id,
      ...(GERMAN_ACCENT_SOURCE_FAMILY.has(capability.id)
        ? { sourceFamily: "german" }
        : {}),
      ...(LONDON_VARIANTS.has(capability.id)
        ? {
            variantGroup: "london",
            ...(capability.id === "modern-rp-english"
              ? { fieldDefault: true }
              : {}),
          }
        : {}),
    } satisfies VoiceAccentMapAnchorSeedV1;
  }),
];

function voiceAccentMapAnchorsWithFieldRanges(
  seeds: readonly VoiceAccentMapAnchorSeedV1[],
): readonly VoiceAccentMapAnchorV1[] {
  const locations = new Map<string, VoiceAccentMapAnchorSeedV1[]>();
  for (const seed of seeds) {
    const key = voiceAccentMapLocationKey(seed);
    locations.set(key, [...(locations.get(key) ?? []), seed]);
  }
  return seeds.map((seed) => {
    const key = voiceAccentMapLocationKey(seed);
    const nearestDistance = Math.min(
      ...[...locations.entries()]
        .filter(([candidateKey]) => candidateKey !== key)
        .map(([, candidates]) =>
          voiceAccentMapDistance(seed.point, candidates[0]!.point),
        ),
    );
    const override = VOICE_ACCENT_MAP_FIELD_RANGE_OVERRIDES[
      seed.accentDefinitionId
    ];
    const coreRadius =
      override?.coreRadius ??
      Math.max(0.00004, Math.min(0.009, nearestDistance * 0.28));
    const supportRadius = Math.max(
      coreRadius + 0.00004,
      override?.supportRadius ??
        Math.max(coreRadius * 2.5, Math.min(0.09, nearestDistance * 2.4)),
    );
    return { ...seed, coreRadius, supportRadius };
  });
}

export const VOICE_ACCENT_MAP_ANCHORS: readonly VoiceAccentMapAnchorV1[] =
  voiceAccentMapAnchorsWithFieldRanges(VOICE_ACCENT_MAP_ANCHOR_SEEDS);

export const VOICE_ACCENT_MAP_FAMILY_HOME_RANGES: readonly VoiceAccentMapFamilyHomeRangeV1[] = [
  {
    id: "germany",
    sourceFamily: "german",
    interiorForeignBlendMax: 0.1,
    boundaryForeignBlendMax: 0.25,
    transitionWidth: 0.008,
    polygon: [
      voiceAccentMapPointForCoordinates(5.75, 47.2),
      voiceAccentMapPointForCoordinates(10.55, 47.15),
      voiceAccentMapPointForCoordinates(13.1, 47.55),
      voiceAccentMapPointForCoordinates(15.15, 50.75),
      voiceAccentMapPointForCoordinates(14.75, 53.2),
      voiceAccentMapPointForCoordinates(12.1, 54.95),
      voiceAccentMapPointForCoordinates(8.15, 55.05),
      voiceAccentMapPointForCoordinates(5.75, 53.55),
    ],
  },
];

export function normalizeVoiceAccentMapPoint(
  value: unknown,
): VoiceAccentMapPointV1 | null {
  if (!value || typeof value !== "object") return null;
  const point = value as { x?: unknown; y?: unknown };
  if (typeof point.x !== "number" || typeof point.y !== "number") return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y)),
  };
}

export function voiceAccentMapDistance(
  left: VoiceAccentMapPointV1,
  right: VoiceAccentMapPointV1,
): number {
  const rawX = Math.abs(left.x - right.x);
  const dx = Math.min(rawX, 1 - rawX);
  const latitudeScale = Math.max(0.28, Math.cos((left.y - 0.5) * Math.PI));
  const dy = left.y - right.y;
  // Atlas x spans 360 longitude degrees while y spans 180 latitude degrees.
  // Doubling x restores equal angular units before the latitude correction.
  return Math.hypot(dx * 2 * latitudeScale, dy);
}

function voiceAccentMapLocationKey(
  anchor: Pick<VoiceAccentMapAnchorV1, "point" | "variantGroup">,
): string {
  return anchor.variantGroup ?? `${anchor.point.x.toFixed(6)}:${anchor.point.y.toFixed(6)}`;
}

function voiceAccentMapPointIsInsidePolygon(
  point: VoiceAccentMapPointV1,
  polygon: readonly VoiceAccentMapPointV1[],
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index]!;
    const previousPoint = polygon[previous]!;
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) *
          (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function voiceAccentMapDistanceToPolygonBoundary(
  point: VoiceAccentMapPointV1,
  polygon: readonly VoiceAccentMapPointV1[],
): number {
  const latitudeScale = Math.max(0.28, Math.cos((point.y - 0.5) * Math.PI));
  const projectedDelta = (candidate: VoiceAccentMapPointV1) => {
    let dx = candidate.x - point.x;
    if (dx > 0.5) dx -= 1;
    if (dx < -0.5) dx += 1;
    return { x: dx * 2 * latitudeScale, y: candidate.y - point.y };
  };
  let nearest = Number.POSITIVE_INFINITY;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const start = projectedDelta(polygon[previous]!);
    const end = projectedDelta(polygon[index]!);
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const denominator = segmentX * segmentX + segmentY * segmentY;
    const progress =
      denominator > 0
        ? Math.max(
            0,
            Math.min(1, -(start.x * segmentX + start.y * segmentY) / denominator),
          )
        : 0;
    nearest = Math.min(
      nearest,
      Math.hypot(start.x + segmentX * progress, start.y + segmentY * progress),
    );
  }
  return nearest;
}

interface VoiceAccentMapHomeRangeContextV1 {
  range: VoiceAccentMapFamilyHomeRangeV1;
  inside: boolean;
  boundaryDistance: number;
}

function voiceAccentMapHomeRangesAtPoint(
  point: VoiceAccentMapPointV1,
): readonly VoiceAccentMapHomeRangeContextV1[] {
  return VOICE_ACCENT_MAP_FAMILY_HOME_RANGES.map((range) => {
    const inside = voiceAccentMapPointIsInsidePolygon(point, range.polygon);
    return {
      range,
      inside,
      boundaryDistance: voiceAccentMapDistanceToPolygonBoundary(
        point,
        range.polygon,
      ),
    };
  }).filter(
    ({ range, inside, boundaryDistance }) =>
      inside || boundaryDistance <= range.transitionWidth,
  );
}

function fieldAnchorForLocation(
  anchors: readonly VoiceAccentMapAnchorV1[],
  explicitId: VoiceAccentDefinitionId | null,
): VoiceAccentMapAnchorV1 {
  return (
    anchors.find((anchor) => anchor.accentDefinitionId === explicitId) ??
    anchors.find((anchor) => anchor.fieldDefault) ??
    anchors[0]!
  );
}

export function resolveVoiceAccentField(args: {
  point?: unknown;
  accentDefinitionId?: unknown;
  pronunciationBase: unknown;
  speechprintInfluence: unknown;
}): VoiceAccentFieldResolutionV1 {
  const point = normalizeVoiceAccentMapPoint(args.point);
  const explicitId = normalizeVoiceAccentDefinitionId(args.accentDefinitionId);
  if (!point) {
    const fallback = resolveLocalAccentFallback(args);
    const definition =
      voiceAccentDefinitionForId(explicitId) ??
      voiceAccentDefinitionForLegacyProfile(args);
    return {
      legacy: true,
      layers: definition
        ? [
            {
              accentDefinitionId: definition.id,
              pronunciationBase: fallback.pronunciationBase,
              influence: fallback.speechprintInfluence,
              weight: 1,
            },
          ]
        : [],
    };
  }

  const locations = new Map<string, VoiceAccentMapAnchorV1[]>();
  for (const anchor of VOICE_ACCENT_MAP_ANCHORS) {
    const key = voiceAccentMapLocationKey(anchor);
    locations.set(key, [...(locations.get(key) ?? []), anchor]);
  }
  const explicitDefinition = voiceAccentDefinitionForId(explicitId);
  const explicitAnchor = explicitDefinition
    ? VOICE_ACCENT_MAP_ANCHORS.find(
        (anchor) => anchor.accentDefinitionId === explicitDefinition.id,
      )
    : null;
  // A persisted named choice always stays exact. Older atlas versions saved
  // the freely placed point beside their nearest named ID, so this also keeps
  // legacy American/British profiles on their concrete migration targets
  // instead of reinterpreting stale coordinates as a new geographic blend.
  // Current unnamed drops explicitly store a null accentDefinitionId.
  if (explicitDefinition) {
    const fallback = resolveLocalAccentFallback({
      ...args,
      accentDefinitionId: explicitDefinition.id,
    });
    return {
      legacy: false,
      layers: [
        {
          accentDefinitionId: explicitDefinition.id,
          pronunciationBase:
            explicitAnchor?.pronunciationBase ?? fallback.pronunciationBase,
          influence:
            explicitAnchor?.influence ?? fallback.speechprintInfluence,
          weight: 1,
        },
      ],
    };
  }
  const ranked = [...locations.values()]
    .map((anchors) => ({
      anchor: fieldAnchorForLocation(anchors, null),
      distance: voiceAccentMapDistance(point, anchors[0]!.point),
    }))
    .map((entry) => ({
      ...entry,
      outsideRatio:
        Math.max(0, entry.distance - entry.anchor.coreRadius) /
        (entry.anchor.supportRadius - entry.anchor.coreRadius),
    }));
  const coreSource = [...ranked]
    .filter((entry) => entry.distance <= entry.anchor.coreRadius + 1e-12)
    .sort(
      (left, right) =>
        left.distance / left.anchor.coreRadius -
          right.distance / right.anchor.coreRadius ||
        left.anchor.accentDefinitionId.localeCompare(
          right.anchor.accentDefinitionId,
        ),
    )[0];
  if (coreSource) {
    const definition = voiceAccentDefinitionForId(
      coreSource.anchor.accentDefinitionId,
    );
    return {
      legacy: false,
      layers: [
        {
          accentDefinitionId: coreSource.anchor.accentDefinitionId,
          pronunciationBase:
            coreSource.anchor.pronunciationBase ??
            definition?.localPronunciationBaseFallback ??
            normalizeLocalVoicePronunciationBase(args.pronunciationBase),
          influence:
            coreSource.anchor.influence ??
            definition?.localSpeechprintFallback ??
            "none",
          weight: 1,
        },
      ],
    };
  }

  // The pin's two sources are geographically nearest. Core/support radii
  // determine how much each contributes, but never let a broad support radius
  // leapfrog a physically closer region.
  const byDistance = [...ranked].sort(
    (left, right) =>
      left.distance - right.distance ||
      left.anchor.accentDefinitionId.localeCompare(
        right.anchor.accentDefinitionId,
      ),
  );
  let selected = byDistance.slice(0, 2);
  let homeRangeContext: VoiceAccentMapHomeRangeContextV1 | null = null;
  for (const context of voiceAccentMapHomeRangesAtPoint(point)) {
    const sourceFamily = context.range.sourceFamily;
    const familySource = byDistance.find(
      (entry) => entry.anchor.sourceFamily === sourceFamily,
    );
    if (!familySource) continue;
    const neighbor =
      selected.find((entry) => entry !== familySource) ?? selected[0];
    selected = neighbor ? [familySource, neighbor] : [familySource];
    homeRangeContext = context;
  }
  const primary = selected[0];
  const neighbor = selected[1];
  if (!primary) return { legacy: false, layers: [] };
  let neighborShare = neighbor
    ? (() => {
        const denominator = primary.outsideRatio + neighbor.outsideRatio;
        const linear = denominator > 0 ? primary.outsideRatio / denominator : 0;
        return linear * linear * (3 - 2 * linear);
      })()
    : 0;
  if (
    neighbor &&
    homeRangeContext &&
    primary.anchor.sourceFamily === homeRangeContext.range.sourceFamily &&
    neighbor.anchor.sourceFamily !== homeRangeContext.range.sourceFamily
  ) {
    const { range, inside, boundaryDistance } = homeRangeContext;
    const progress = Math.max(
      0,
      Math.min(1, boundaryDistance / range.transitionWidth),
    );
    const eased = progress * progress * (3 - 2 * progress);
    const maximumForeignShare = inside
      ? range.boundaryForeignBlendMax -
        (range.boundaryForeignBlendMax - range.interiorForeignBlendMax) * eased
      : range.boundaryForeignBlendMax +
        (1 - range.boundaryForeignBlendMax) * eased;
    neighborShare = Math.min(neighborShare, maximumForeignShare);
  }
  const layers = selected
    .map((entry, index) => {
      const definition = voiceAccentDefinitionForId(
        entry.anchor.accentDefinitionId,
      );
      return {
        accentDefinitionId: entry.anchor.accentDefinitionId,
        pronunciationBase:
          entry.anchor.pronunciationBase ??
          definition?.localPronunciationBaseFallback ??
          normalizeLocalVoicePronunciationBase(args.pronunciationBase),
        influence:
          entry.anchor.influence ??
          definition?.localSpeechprintFallback ??
          "none",
        weight: index === 0 ? 1 - neighborShare : neighborShare,
      };
    })
    .filter((layer) => layer.weight > 0)
    .sort(
      (left, right) =>
        right.weight - left.weight ||
        left.accentDefinitionId.localeCompare(right.accentDefinitionId),
    );
  return { legacy: false, layers };
}

export function voiceAccentDefinitionForId(
  value: unknown,
): VoiceAccentDefinitionV1 | null {
  const id = normalizeVoiceAccentDefinitionId(value);
  return id
    ? VOICE_ACCENT_DEFINITIONS.find((definition) => definition.id === id) ?? null
    : null;
}

export function voiceAccentDefinitionForLegacyProfile(args: {
  pronunciationBase: unknown;
  speechprintInfluence: unknown;
}): VoiceAccentDefinitionV1 | null {
  const influence = normalizeLocalVoiceSpeechprintInfluence(
    args.speechprintInfluence,
  );
  if (influence !== "none") return voiceAccentDefinitionForId(influence);
  if (args.pronunciationBase === "en-US") {
    return voiceAccentDefinitionForId("general-american-english");
  }
  if (args.pronunciationBase === "en-GB") {
    return voiceAccentDefinitionForId("modern-rp-english");
  }
  return null;
}

/** Resolves a precise Accent Map identity into the closest qualified Local
 * pronunciation behavior. This is deliberately independent from Premium so
 * future regional definitions can outnumber Local Speechprints. */
export function resolveLocalAccentFallback(args: {
  accentDefinitionId?: unknown;
  pronunciationBase: unknown;
  speechprintInfluence: unknown;
}): {
  pronunciationBase: LocalVoicePronunciationBase;
  speechprintInfluence: LocalVoiceSpeechprintInfluence;
} {
  const definition = voiceAccentDefinitionForId(args.accentDefinitionId);
  return {
    pronunciationBase:
      definition?.localPronunciationBaseFallback ??
      normalizeLocalVoicePronunciationBase(args.pronunciationBase),
    speechprintInfluence:
      definition?.localSpeechprintFallback ??
      normalizeLocalVoiceSpeechprintInfluence(args.speechprintInfluence),
  };
}

/** Provider labels are retained only as small, portable identity hints. */
export function normalizePremiumVoiceNativeAccentHint(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleLowerCase()
    .slice(0, 96);
  return normalized || null;
}

export function premiumVoiceNativeAccentHintFromLabels(
  labels: Record<string, string> | null | undefined,
): string | null {
  if (!labels) return null;
  const ranked = Object.entries(labels)
    .filter(([key]) => /accent|language|locale|nationality/iu.test(key))
    .sort(([left], [right]) => {
      const rank = (key: string): number =>
        /accent/iu.test(key)
          ? 0
          : /nationality/iu.test(key)
            ? 1
            : /locale/iu.test(key)
              ? 2
              : 3;
      return rank(left) - rank(right);
    });
  for (const [, value] of ranked) {
    const hint = normalizePremiumVoiceNativeAccentHint(value);
    if (hint) return hint;
  }
  return null;
}

function premiumAccentTarget(args: {
  accentDefinitionId?: unknown;
  pronunciationBase: unknown;
  speechprintInfluence: unknown;
}): VoiceAccentDefinitionV1 | null {
  return (
    voiceAccentDefinitionForId(args.accentDefinitionId) ??
    voiceAccentDefinitionForLegacyProfile(args)
  );
}

function premiumNativeAccentMatches(
  nativeHint: string,
  aliases: readonly string[],
): boolean {
  const paddedHint = ` ${nativeHint} `;
  return aliases.some((alias) => {
    const normalizedAlias = normalizePremiumVoiceNativeAccentHint(alias);
    if (!normalizedAlias) return false;
    const paddedAlias = ` ${normalizedAlias} `;
    return (
      nativeHint === normalizedAlias ||
      paddedHint.includes(paddedAlias)
    );
  });
}

function premiumProviderAccentLabel(
  target: VoiceAccentDefinitionV1,
): string {
  return (
    target.premiumDirectionLabel ??
    target.premiumAccentedEnglishLabel
      .split(" / ")[0]!
      .replace(/-accented English$/u, "")
      .replace(/-accented$/u, "")
  );
}

function voiceAccentFieldRoundedPercentages(
  layers: readonly VoiceAccentFieldLayerV1[],
): number[] {
  const exact = layers.map((layer) => layer.weight * 100);
  const whole = exact.map(Math.floor);
  let remainder = 100 - whole.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - whole[index]! }))
    .sort(
      (left, right) =>
        right.fraction - left.fraction || left.index - right.index,
    );
  for (const entry of order) {
    if (remainder <= 0) break;
    whole[entry.index] = whole[entry.index]! + 1;
    remainder -= 1;
  }
  return whole;
}

/** Private ElevenLabs v3 cue for the saved Accent Map definition. */
export function resolvePremiumAccentDirection(args: {
  point?: unknown;
  accentDefinitionId?: unknown;
  pronunciationBase: unknown;
  speechprintInfluence: unknown;
  speechprintStrength: unknown;
  nativeAccentHint?: unknown;
}): string | null {
  const field = normalizeVoiceAccentMapPoint(args.point)
    ? resolveVoiceAccentField({
        point: args.point,
        accentDefinitionId: args.accentDefinitionId,
        pronunciationBase: args.pronunciationBase,
        speechprintInfluence: args.speechprintInfluence,
      })
    : null;
  if (field && field.layers.length > 1) {
    const strength = normalizeLocalVoiceSpeechprintStrength(
      args.speechprintStrength,
    );
    const intensity =
      strength === "light"
        ? "subtle "
        : strength === "strong"
          ? "strong "
          : "";
    const percentages = voiceAccentFieldRoundedPercentages(field.layers);
    return field.layers
      .map((layer, index) => {
        const definition = voiceAccentDefinitionForId(
          layer.accentDefinitionId,
        );
        return definition
          ? `${intensity}${percentages[index]}% ${premiumProviderAccentLabel(definition)} accent`
          : null;
      })
      .filter((cue): cue is string => Boolean(cue))
      .join(", ") || null;
  }
  const target = field?.layers[0]
    ? voiceAccentDefinitionForId(field.layers[0].accentDefinitionId)
    : premiumAccentTarget(args);
  if (!target) return null;
  const strength = normalizeLocalVoiceSpeechprintStrength(
    args.speechprintStrength,
  );
  const nativeHint = normalizePremiumVoiceNativeAccentHint(
    args.nativeAccentHint,
  );
  const matchesNative = nativeHint
    ? premiumNativeAccentMatches(
        nativeHint,
        target.premiumNativeAccentAliases,
      )
    : false;
  if (matchesNative && strength === "balanced") return null;
  const intensity =
    strength === "light"
      ? "subtle "
      : strength === "strong"
        ? "strong "
        : "";
  // A slash-joined label names one accent twice. Keep each private direction
  // inside the provider cap so it retains the actionable word "accent".
  const providerAccentLabel = premiumProviderAccentLabel(target);
  return `${intensity}${providerAccentLabel} accent`;
}

type SpeechprintRuleTier = "light" | "balanced" | "strong";

interface SpeechprintRule {
  id: string;
  tier: SpeechprintRuleTier;
  pattern: RegExp;
  replacement: string;
  optional?: boolean;
}

/**
 * Coda R: after a vowel nucleus, before a consonant or a word boundary.
 * Shared by every non-rhotic accent list so they all drop the same R's. The
 * classes are pinned to what espeak-style en-US IPA emits around a coda ɹ:
 * length-marked nuclei ("ɑːɹ" hard, "ɔːɹ" York — rhotic enforcement keeps
 * FORCE's ː), reduced vowels ᵻ/ᵿ, and a following flap ɾ ("party"), U+0261 ɡ
 * ("cargo"), glottal ʔ ("certain" once NURSE gains its hard R), or geminate ɹ
 * ("Icarus" ɑːɹɹ — the coda half drops, the onset half fails the vowel
 * lookbehind and survives). A vowel after ɹ never matches: that R is
 * linking/onset even in non-rhotic accents.
 */
const POSTVOCALIC_R_DROP_PATTERN =
  /(?<=[iɪeɛæaɑɒɔoʊuʌəɚɝɐɜɞœøyɨʉᵻᵿː])ɹ(?=[ptkbdgɡfvθðszʃʒʔhmnŋlɹɾwj,.;:!?)]|$)/gu;

const SPEECHPRINT_RULES: Record<
  Exclude<LocalVoiceSpeechprintInfluence, "none">,
  readonly SpeechprintRule[]
> = {
  "spanish-influenced-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    // English STRUT (sun) → Spanish /a/; the realist L1 substitution.
    { id: "strut-open-a", tier: "balanced", pattern: /ʌ/gu, replacement: "a" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    {
      id: "near-close-i",
      tier: "strong",
      pattern: /ɪ/gu,
      replacement: "i",
      optional: true,
    },
  ],
  "brazilian-portuguese-influenced-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    { id: "strut-open-a", tier: "balanced", pattern: /ʌ/gu, replacement: "a" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    {
      id: "final-l-glide",
      tier: "balanced",
      pattern: /l(?=[,.;:!?)]?$)/gu,
      replacement: "w",
      optional: true,
    },
    {
      id: "h-velar",
      tier: "strong",
      pattern: /h/gu,
      replacement: "x",
      optional: true,
    },
  ],
  "mandarin-influenced-english": [
    { id: "theta-s", tier: "light", pattern: /θ/gu, replacement: "s" },
    { id: "eth-z", tier: "balanced", pattern: /ð/gu, replacement: "z" },
    {
      id: "r-retroflex",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɻ",
      optional: true,
    },
    {
      id: "v-glide",
      tier: "balanced",
      pattern: /v/gu,
      replacement: "w",
      optional: true,
    },
    {
      id: "postalveolar",
      tier: "strong",
      pattern: /ʒ/gu,
      replacement: "ʂ",
      optional: true,
    },
  ],
  "japanese-influenced-english": [
    { id: "r-tap", tier: "light", pattern: /ɹ/gu, replacement: "ɾ" },
    {
      id: "l-tap",
      tier: "balanced",
      pattern: /l/gu,
      replacement: "ɾ",
      optional: true,
    },
    { id: "theta-s", tier: "balanced", pattern: /θ/gu, replacement: "s" },
    {
      id: "eth-z",
      tier: "strong",
      pattern: /ð/gu,
      replacement: "z",
      optional: true,
    },
    {
      id: "open-a",
      tier: "strong",
      pattern: /æ/gu,
      replacement: "a",
      optional: true,
    },
  ],
  "korean-influenced-english": [
    { id: "theta-s", tier: "light", pattern: /θ/gu, replacement: "s" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    {
      id: "l-tap",
      tier: "balanced",
      pattern: /l/gu,
      replacement: "ɾ",
      optional: true,
    },
    {
      id: "f-aspirated-p",
      tier: "strong",
      pattern: /f/gu,
      replacement: "pʰ",
      optional: true,
    },
    {
      id: "v-b",
      tier: "strong",
      pattern: /v/gu,
      replacement: "b",
      optional: true,
    },
  ],
  "indian-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "r-retroflex",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɽ",
      optional: true,
    },
    {
      id: "w-labiodental",
      tier: "balanced",
      pattern: /w/gu,
      replacement: "ʋ",
      optional: true,
    },
    {
      id: "initial-t-retroflex",
      tier: "strong",
      pattern: /^t/gu,
      replacement: "ʈ",
      optional: true,
    },
    {
      id: "initial-d-retroflex",
      tier: "strong",
      pattern: /^d/gu,
      replacement: "ɖ",
      optional: true,
    },
  ],
  "french-influenced-english": [
    { id: "theta-s", tier: "light", pattern: /θ/gu, replacement: "s" },
    { id: "eth-z", tier: "balanced", pattern: /ð/gu, replacement: "z" },
    { id: "strut-open-a", tier: "balanced", pattern: /ʌ/gu, replacement: "a" },
    {
      id: "r-uvular",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ʁ",
      optional: true,
    },
    {
      id: "near-close-i",
      tier: "strong",
      pattern: /ɪ/gu,
      replacement: "i",
      optional: true,
    },
    {
      id: "h-drop",
      tier: "strong",
      pattern: /h/gu,
      replacement: "",
      optional: true,
    },
  ],
  "german-influenced-english": [
    { id: "w-labiodental", tier: "light", pattern: /w/gu, replacement: "v" },
    { id: "theta-s", tier: "balanced", pattern: /θ/gu, replacement: "s" },
    {
      id: "eth-z",
      tier: "balanced",
      pattern: /ð/gu,
      replacement: "z",
      optional: true,
    },
    {
      id: "r-uvular",
      tier: "strong",
      pattern: /ɹ/gu,
      replacement: "ʁ",
      optional: true,
    },
    {
      id: "final-d-devoice",
      tier: "strong",
      pattern: /d(?=[,.;:!?)]?$)/gu,
      replacement: "t",
      optional: true,
    },
    {
      id: "final-z-devoice",
      tier: "strong",
      pattern: /z(?=[,.;:!?)]?$)/gu,
      replacement: "s",
      optional: true,
    },
  ],
  "russian-influenced-english": [
    { id: "w-labiodental", tier: "light", pattern: /w/gu, replacement: "v" },
    { id: "theta-s", tier: "balanced", pattern: /θ/gu, replacement: "s" },
    { id: "eth-z", tier: "balanced", pattern: /ð/gu, replacement: "z" },
    {
      id: "open-e",
      tier: "balanced",
      pattern: /ɛ/gu,
      replacement: "e",
      optional: true,
    },
    { id: "schwa-full", tier: "strong", pattern: /ə/gu, replacement: "ʌ" },
    {
      id: "r-trill",
      tier: "strong",
      pattern: /ɹ/gu,
      replacement: "r",
      optional: true,
    },
    {
      id: "final-b-devoice",
      tier: "strong",
      pattern: /b(?=[,.;:!?)]?$)/gu,
      replacement: "p",
      optional: true,
    },
    {
      id: "final-d-devoice",
      tier: "strong",
      pattern: /d(?=[,.;:!?)]?$)/gu,
      replacement: "t",
      optional: true,
    },
    {
      id: "final-g-devoice",
      tier: "strong",
      pattern: /g(?=[,.;:!?)]?$)/gu,
      replacement: "k",
      optional: true,
    },
    {
      id: "final-z-devoice",
      tier: "strong",
      pattern: /z(?=[,.;:!?)]?$)/gu,
      replacement: "s",
      optional: true,
    },
    {
      id: "final-v-devoice",
      tier: "strong",
      pattern: /v(?=[,.;:!?)]?$)/gu,
      replacement: "f",
      optional: true,
    },
  ],
  "italian-influenced-english": [
    { id: "r-tap", tier: "light", pattern: /ɹ/gu, replacement: "ɾ" },
    { id: "theta-t", tier: "balanced", pattern: /θ/gu, replacement: "t" },
    {
      id: "eth-d",
      tier: "balanced",
      pattern: /ð/gu,
      replacement: "d",
      optional: true,
    },
    // English STRUT (sun) → Italian /a/.
    { id: "strut-open-a", tier: "balanced", pattern: /ʌ/gu, replacement: "a" },
    {
      id: "open-a",
      tier: "strong",
      pattern: /æ/gu,
      replacement: "a",
      optional: true,
    },
    {
      id: "final-schwa",
      tier: "strong",
      pattern: /(?<=[ptkbdgfvszʃʒmnlrɾ])(?=[,.;:!?)]?$)/gu,
      replacement: "ə",
      optional: true,
    },
  ],
  "australian-english": [
    {
      id: "postvocalic-r-drop",
      tier: "light",
      pattern: POSTVOCALIC_R_DROP_PATTERN,
      replacement: "",
    },
    {
      id: "rhotacized-schwa",
      tier: "light",
      pattern: /ɚ/gu,
      replacement: "ə",
    },
    {
      id: "rhotacized-nurse",
      tier: "light",
      pattern: /ɝ/gu,
      replacement: "ɜ",
    },
    {
      id: "face-ae",
      tier: "balanced",
      pattern: /eɪ/gu,
      replacement: "æɪ",
      optional: true,
    },
    {
      id: "goat-central",
      tier: "balanced",
      pattern: /(?:oʊ|əʊ)/gu,
      replacement: "əʉ",
    },
    {
      id: "price-broad",
      tier: "strong",
      pattern: /(?:aɪ|ɑɪ)/gu,
      replacement: "ɑe",
      optional: true,
    },
    {
      id: "mouth-fronted",
      tier: "strong",
      pattern: /aʊ/gu,
      replacement: "æɔ",
      optional: true,
    },
  ],
  "canadian-english": [
    {
      id: "price-raise",
      tier: "light",
      pattern: /aɪ(?=[ptkfsθʃ])/gu,
      replacement: "ʌɪ",
    },
    {
      id: "mouth-raise",
      tier: "balanced",
      pattern: /aʊ(?=[ptkfsθʃ])/gu,
      replacement: "ʌʊ",
    },
    {
      // The merger never applies before R (NORTH/FORCE keep the rounded
      // vowel — "floor" is not "flar") or inside CHOICE ("ɔɪ").
      id: "cot-caught-merge",
      tier: "strong",
      pattern: /ɔ(?!ː?ɹ|ɪ)/gu,
      replacement: "ɑ",
      optional: true,
    },
    {
      id: "trap-retract",
      tier: "strong",
      pattern: /æ/gu,
      replacement: "a",
      optional: true,
    },
  ],
  "new-york-english": [
    {
      id: "postvocalic-r-drop",
      tier: "light",
      pattern: POSTVOCALIC_R_DROP_PATTERN,
      replacement: "",
    },
    { id: "rhotacized-schwa", tier: "light", pattern: /ɚ/gu, replacement: "ə" },
    { id: "rhotacized-nurse", tier: "light", pattern: /ɝ/gu, replacement: "ɜ" },
    {
      // CHOICE ("ɔɪ") keeps its diphthong; the raise targets THOUGHT only.
      // Coda-R contexts are already handled by the earlier r-drop tier.
      id: "thought-raised",
      tier: "balanced",
      pattern: /ɔ(?!ɪ)/gu,
      replacement: "oə",
    },
    {
      id: "trap-tensing",
      tier: "strong",
      pattern: /æ(?=[mnfθs])/gu,
      replacement: "eə",
      optional: true,
    },
  ],
  "new-jersey-english": [
    // "Wooder" — THOUGHT rounds up before a flap ("water" => "wooder").
    // Ordered before thought-raised so the raised form cannot eat the ɔ.
    {
      id: "water-wooder",
      tier: "strong",
      pattern: /ɔː?(?=ɾ)/gu,
      replacement: "ʊ",
      optional: true,
    },
    // The classic NURSE–CHOICE coalescence: a closed-syllable NURSE becomes
    // "oy", so "curtains" => "coy-tins", "bird" => "boid", "first" =>
    // "foist". Matches the raw espeak form (ɜː), the hard-R enforced form
    // (ɜɹ), and bare ɜ, but never before a real onset ɹ ("furry" stays
    // rhotic) and never word-finally ("her" falls to the r-drop instead).
    {
      id: "nurse-choice",
      tier: "light",
      pattern: /ɜː?ɹ?(?=[ptkbdfvθðszʃʒʧʤmnŋlgɡɾʔ])/gu,
      replacement: "ɔɪ",
    },
    // Raised THOUGHT ("coffee" => "cawfee") with a guard so it never bites
    // the CHOICE diphthong nurse-choice just wrote.
    {
      id: "thought-raised",
      tier: "balanced",
      pattern: /ɔː?(?!ɪ)/gu,
      replacement: "oə",
    },
    {
      id: "theta-stop",
      tier: "balanced",
      pattern: /θ/gu,
      replacement: "t",
      optional: true,
    },
    {
      id: "eth-stop",
      tier: "balanced",
      pattern: /ð/gu,
      replacement: "d",
      optional: true,
    },
    {
      id: "postvocalic-r-drop",
      tier: "light",
      pattern: POSTVOCALIC_R_DROP_PATTERN,
      replacement: "",
    },
    { id: "rhotacized-schwa", tier: "light", pattern: /ɚ/gu, replacement: "ə" },
    { id: "rhotacized-nurse", tier: "light", pattern: /ɝ/gu, replacement: "ɜ" },
    {
      id: "trap-tensing",
      tier: "strong",
      pattern: /æ(?=[mnfθs])/gu,
      replacement: "eə",
      optional: true,
    },
  ],
  "southern-us-english": [
    {
      id: "pin-pen-merge",
      tier: "light",
      pattern: /ɛ(?=[mnŋ])/gu,
      replacement: "ɪ",
    },
    {
      id: "price-monophthong",
      tier: "balanced",
      pattern: /aɪ/gu,
      replacement: "aː",
    },
    {
      id: "face-monophthong",
      tier: "strong",
      pattern: /eɪ/gu,
      replacement: "eː",
      optional: true,
    },
  ],
  "southern-california-english": [
    // Merged everywhere except before R (NORTH/FORCE stay rounded — "the
    // floor is yours" must not surface as "the flar is yars") and in CHOICE.
    {
      id: "cot-caught-merge",
      tier: "light",
      pattern: /ɔ(?!ː?ɹ|ɪ)/gu,
      replacement: "ɑ",
    },
    {
      id: "trap-nasal-raise",
      tier: "balanced",
      pattern: /æ(?=[mnŋ])/gu,
      replacement: "eə",
      optional: true,
    },
    {
      id: "goose-front",
      tier: "strong",
      pattern: /u/gu,
      replacement: "ʉ",
      optional: true,
    },
  ],
  "bay-area-english": [
    // Same pre-R and CHOICE carve-outs as Southern California.
    {
      id: "cot-caught-merge",
      tier: "light",
      pattern: /ɔ(?!ː?ɹ|ɪ)/gu,
      replacement: "ɑ",
    },
    {
      id: "goose-front",
      tier: "balanced",
      pattern: /u/gu,
      replacement: "ʉ",
      optional: true,
    },
    {
      id: "goat-front",
      tier: "strong",
      pattern: /oʊ/gu,
      replacement: "əʉ",
      optional: true,
    },
  ],
  "inland-north-english": [
    { id: "trap-raise", tier: "light", pattern: /æ/gu, replacement: "eə" },
    {
      id: "lot-front",
      tier: "balanced",
      pattern: /ɑ/gu,
      replacement: "a",
      optional: true,
    },
    {
      // Lowering skips pre-R NORTH/FORCE and the CHOICE diphthong.
      id: "thought-lower",
      tier: "strong",
      pattern: /ɔ(?!ː?ɹ|ɪ)/gu,
      replacement: "ɑ",
      optional: true,
    },
  ],
  "texas-english": [
    { id: "pin-pen-merge", tier: "light", pattern: /ɛ(?=[mnŋ])/gu, replacement: "ɪ" },
    {
      id: "price-monophthong-voiced",
      tier: "balanced",
      pattern: /aɪ(?=[bdgvmnlɹzʒ])/gu,
      replacement: "aː",
    },
    {
      id: "face-monophthong",
      tier: "strong",
      pattern: /eɪ/gu,
      replacement: "eː",
      optional: true,
    },
  ],
  "appalachian-english": [
    { id: "pin-pen-merge", tier: "light", pattern: /ɛ(?=[mnŋ])/gu, replacement: "ɪ" },
    { id: "price-monophthong", tier: "balanced", pattern: /aɪ/gu, replacement: "aː" },
    {
      id: "goat-monophthong",
      tier: "strong",
      pattern: /oʊ/gu,
      replacement: "oː",
      optional: true,
    },
  ],
  "eastern-new-england-english": [
    {
      id: "postvocalic-r-drop",
      tier: "light",
      pattern: POSTVOCALIC_R_DROP_PATTERN,
      replacement: "",
    },
    { id: "rhotacized-schwa", tier: "light", pattern: /ɚ/gu, replacement: "ə" },
    { id: "rhotacized-nurse", tier: "light", pattern: /ɝ/gu, replacement: "ɜ" },
    {
      id: "start-broad",
      tier: "balanced",
      pattern: /ɑɹ/gu,
      replacement: "aː",
      optional: true,
    },
  ],
  "north-florida-english": [
    { id: "pin-pen-merge", tier: "light", pattern: /ɛ(?=[mnŋ])/gu, replacement: "ɪ" },
    {
      id: "price-monophthong-voiced",
      tier: "balanced",
      pattern: /aɪ(?=[bdgvmnlɹzʒ])/gu,
      replacement: "aː",
      optional: true,
    },
    {
      id: "face-monophthong",
      tier: "strong",
      pattern: /eɪ/gu,
      replacement: "eː",
      optional: true,
    },
  ],
  "miami-english": [
    { id: "lot-front", tier: "light", pattern: /ɑ/gu, replacement: "a" },
    {
      id: "eth-d",
      tier: "balanced",
      pattern: /ð/gu,
      replacement: "d",
      optional: true,
    },
    {
      id: "r-tap",
      tier: "strong",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
  ],
  "modern-rp-english": [
    {
      id: "postvocalic-r-drop",
      tier: "light",
      pattern: POSTVOCALIC_R_DROP_PATTERN,
      replacement: "",
    },
    { id: "rhotacized-schwa", tier: "light", pattern: /ɚ/gu, replacement: "ə" },
    { id: "rhotacized-nurse", tier: "light", pattern: /ɝ/gu, replacement: "ɜː" },
    { id: "goat-british", tier: "balanced", pattern: /oʊ/gu, replacement: "əʊ" },
  ],
  "cockney-english": [
    { id: "h-drop", tier: "light", pattern: /h/gu, replacement: "", optional: true },
    {
      id: "postvocalic-r-drop",
      tier: "light",
      pattern: POSTVOCALIC_R_DROP_PATTERN,
      replacement: "",
    },
    { id: "rhotacized-schwa", tier: "light", pattern: /ɚ/gu, replacement: "ə" },
    { id: "rhotacized-nurse", tier: "light", pattern: /ɝ/gu, replacement: "ɜː" },
    {
      id: "theta-front",
      tier: "balanced",
      pattern: /θ/gu,
      replacement: "f",
    },
    { id: "eth-front", tier: "balanced", pattern: /ð/gu, replacement: "v" },
    {
      id: "dress-after-w-before-nt",
      tier: "balanced",
      pattern: /wɛ(?=nt)/gu,
      replacement: "weɪ",
    },
    {
      id: "stressed-kit-lengthen-before-n",
      tier: "balanced",
      pattern: /ˈɪ(?=n)/gu,
      replacement: "ˈiː",
    },
    {
      id: "weak-schwa-before-nt",
      tier: "balanced",
      pattern: /ə(?=nt)/gu,
      replacement: "ɪ",
    },
    { id: "t-glottal-final", tier: "balanced", pattern: /t(?=[,.;:!?)]|$)/gu, replacement: "ʔ" },
    {
      id: "t-glottal-before-schwa",
      tier: "balanced",
      pattern: /(?<=[iɪeɛæaɑɒɔoʊuʌəɚɝɐɜɞœøyɨʉː])t(?=ə)/gu,
      replacement: "ʔ",
    },
    {
      id: "article-centralize",
      tier: "balanced",
      pattern: /^(?:ɐ|ə)(?=[,.;:!?)]|$)/gu,
      replacement: "ə",
    },
    {
      id: "of-reduction",
      tier: "balanced",
      pattern: /^ɒv(?=[,.;:!?)]|$)/gu,
      replacement: "ə",
    },
    {
      id: "syllabic-l-vocalize",
      tier: "balanced",
      pattern: /əl(?=[,.;:!?)]|$)/gu,
      replacement: "o",
    },
    {
      id: "t-glottal-between-vowels",
      tier: "strong",
      pattern: /(?<=[iɪeɛæaɑɒɔoʊuʌəɚɝɐɜɞœøyɨʉː])t(?=[iɪeɛæaɑɒɔoʊuʌəɚɝɐɜɞœøyɨʉ])/gu,
      replacement: "ʔ",
    },
    { id: "price-broad", tier: "strong", pattern: /aɪ/gu, replacement: "ɑɪ", optional: true },
  ],
  "estuary-english": [
    {
      id: "postvocalic-r-drop",
      tier: "light",
      pattern: POSTVOCALIC_R_DROP_PATTERN,
      replacement: "",
    },
    { id: "rhotacized-schwa", tier: "light", pattern: /ɚ/gu, replacement: "ə" },
    { id: "rhotacized-nurse", tier: "light", pattern: /ɝ/gu, replacement: "ɜː" },
    { id: "l-vocalize", tier: "balanced", pattern: /l(?=[,.;:!?)]?$)/gu, replacement: "w", optional: true },
    { id: "theta-front", tier: "strong", pattern: /θ/gu, replacement: "f", optional: true },
  ],
  "multicultural-london-english": [
    {
      id: "postvocalic-r-drop",
      tier: "light",
      pattern: POSTVOCALIC_R_DROP_PATTERN,
      replacement: "",
    },
    { id: "rhotacized-schwa", tier: "light", pattern: /ɚ/gu, replacement: "ə" },
    { id: "rhotacized-nurse", tier: "light", pattern: /ɝ/gu, replacement: "ɜː" },
    { id: "theta-stop", tier: "light", pattern: /θ/gu, replacement: "t", optional: true },
    { id: "eth-stop", tier: "balanced", pattern: /ð/gu, replacement: "d", optional: true },
    { id: "price-front", tier: "balanced", pattern: /aɪ/gu, replacement: "ɑɪ" },
    { id: "goat-front", tier: "strong", pattern: /əʊ|oʊ/gu, replacement: "oʊ", optional: true },
  ],
  "essex-english": [
    {
      id: "postvocalic-r-drop",
      tier: "light",
      pattern: POSTVOCALIC_R_DROP_PATTERN,
      replacement: "",
    },
    { id: "rhotacized-schwa", tier: "light", pattern: /ɚ/gu, replacement: "ə" },
    { id: "rhotacized-nurse", tier: "light", pattern: /ɝ/gu, replacement: "ɜː" },
    { id: "l-vocalize", tier: "balanced", pattern: /l(?=[,.;:!?)]?$)/gu, replacement: "w" },
    { id: "theta-front", tier: "strong", pattern: /θ/gu, replacement: "f", optional: true },
  ],
  "parisian-french-influenced-english": [
    // Paris is a specific French-English profile, not a light-weight alias
    // for France on the map. Keep the shared French foundation so its Strong
    // setting remains audible in Instant and in Premium's target IPA path.
    { id: "theta-s", tier: "light", pattern: /θ/gu, replacement: "s" },
    { id: "eth-z", tier: "balanced", pattern: /ð/gu, replacement: "z" },
    { id: "strut-open-a", tier: "balanced", pattern: /ʌ/gu, replacement: "a" },
    { id: "r-uvular", tier: "balanced", pattern: /ɹ/gu, replacement: "ʁ" },
    // These monophthongs keep Strong recognizably Paris-region French rather
    // than making it indistinguishable from the broader French preset.
    { id: "face-monophthong", tier: "strong", pattern: /eɪ/gu, replacement: "e" },
    { id: "goat-monophthong", tier: "strong", pattern: /oʊ/gu, replacement: "o" },
    { id: "near-close-i", tier: "strong", pattern: /ɪ/gu, replacement: "i" },
    { id: "h-drop", tier: "strong", pattern: /h/gu, replacement: "" },
  ],
  "southern-french-influenced-english": [
    { id: "theta-s", tier: "light", pattern: /θ/gu, replacement: "s" },
    { id: "r-uvular", tier: "balanced", pattern: /ɹ/gu, replacement: "ʁ", optional: true },
    { id: "schwa-full", tier: "balanced", pattern: /ə/gu, replacement: "e", optional: true },
  ],
  "northern-german-influenced-english": [
    { id: "w-labiodental", tier: "light", pattern: /w/gu, replacement: "v" },
    { id: "r-uvular", tier: "balanced", pattern: /ɹ/gu, replacement: "ʁ", optional: true },
    { id: "final-d-devoice", tier: "strong", pattern: /d(?=[,.;:!?)]?$)/gu, replacement: "t", optional: true },
  ],
  "bavarian-german-influenced-english": [
    { id: "w-labiodental", tier: "light", pattern: /w/gu, replacement: "v" },
    { id: "r-tap", tier: "balanced", pattern: /ɹ/gu, replacement: "ɾ", optional: true },
    { id: "final-z-devoice", tier: "strong", pattern: /z(?=[,.;:!?)]?$)/gu, replacement: "s", optional: true },
  ],
  "northern-italian-influenced-english": [
    { id: "r-tap", tier: "light", pattern: /ɹ/gu, replacement: "ɾ" },
    { id: "theta-t", tier: "balanced", pattern: /θ/gu, replacement: "t", optional: true },
    { id: "near-close-i", tier: "strong", pattern: /ɪ/gu, replacement: "i", optional: true },
  ],
  "southern-italian-influenced-english": [
    { id: "r-tap", tier: "light", pattern: /ɹ/gu, replacement: "ɾ" },
    { id: "theta-t", tier: "balanced", pattern: /θ/gu, replacement: "t" },
    { id: "strut-open-a", tier: "balanced", pattern: /ʌ/gu, replacement: "a" },
    { id: "final-schwa", tier: "strong", pattern: /(?<=[ptkbdgfvszʃʒmnlrɾ])(?=[,.;:!?)]?$)/gu, replacement: "ə", optional: true },
  ],
  "andalusian-spanish-influenced-english": [
    { id: "theta-s", tier: "light", pattern: /θ/gu, replacement: "s" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    { id: "r-tap", tier: "balanced", pattern: /ɹ/gu, replacement: "ɾ", optional: true },
    { id: "final-s-soften", tier: "strong", pattern: /s(?=[,.;:!?)]?$)/gu, replacement: "h", optional: true },
  ],
  "latin-american-spanish-influenced-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    { id: "strut-open-a", tier: "balanced", pattern: /ʌ/gu, replacement: "a" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    {
      id: "v-b",
      tier: "strong",
      pattern: /v/gu,
      replacement: "b",
      optional: true,
    },
  ],
  "mexican-spanish-influenced-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    // Mexican Spanish L2 English: STRUT toward open /a/, like other Spanish.
    { id: "strut-open-a", tier: "balanced", pattern: /ʌ/gu, replacement: "a" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    {
      id: "near-close-i",
      tier: "balanced",
      pattern: /ɪ/gu,
      replacement: "i",
      optional: true,
    },
    {
      id: "v-b",
      tier: "strong",
      pattern: /v/gu,
      replacement: "b",
      optional: true,
    },
    {
      // Soft jota spillover on English /h/.
      id: "h-velar",
      tier: "strong",
      pattern: /h/gu,
      replacement: "x",
      optional: true,
    },
  ],
  "european-portuguese-influenced-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    // European Portuguese often centralizes STRUT toward /ɐ/.
    {
      id: "strut-central-a",
      tier: "balanced",
      pattern: /ʌ/gu,
      replacement: "ɐ",
    },
    {
      id: "near-close-i",
      tier: "strong",
      pattern: /ɪ/gu,
      replacement: "i",
      optional: true,
    },
  ],
  "cantonese-influenced-english": [
    { id: "theta-s", tier: "light", pattern: /θ/gu, replacement: "s" },
    { id: "eth-z", tier: "balanced", pattern: /ð/gu, replacement: "z" },
    {
      id: "v-glide",
      tier: "balanced",
      pattern: /v/gu,
      replacement: "w",
      optional: true,
    },
    {
      id: "r-glide",
      tier: "strong",
      pattern: /ɹ/gu,
      replacement: "w",
      optional: true,
    },
  ],
  "pakistani-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "r-retroflex",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɽ",
      optional: true,
    },
    {
      id: "w-labiodental",
      tier: "strong",
      pattern: /w/gu,
      replacement: "ʋ",
      optional: true,
    },
  ],
  "bengali-influenced-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    {
      id: "v-b",
      tier: "strong",
      pattern: /v/gu,
      replacement: "b",
      optional: true,
    },
  ],
  "sri-lankan-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "w-labiodental",
      tier: "strong",
      pattern: /w/gu,
      replacement: "ʋ",
      optional: true,
    },
  ],
  "dutch-influenced-english": [
    { id: "w-labiodental", tier: "light", pattern: /w/gu, replacement: "v" },
    { id: "theta-t", tier: "balanced", pattern: /θ/gu, replacement: "t" },
    {
      id: "eth-d",
      tier: "balanced",
      pattern: /ð/gu,
      replacement: "d",
      optional: true,
    },
    {
      id: "final-d-devoice",
      tier: "strong",
      pattern: /d(?=[,.;:!?)]?$)/gu,
      replacement: "t",
      optional: true,
    },
  ],
  "nordic-influenced-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    {
      id: "eth-d",
      tier: "balanced",
      pattern: /ð/gu,
      replacement: "d",
      optional: true,
    },
    {
      id: "w-labiodental",
      tier: "balanced",
      pattern: /w/gu,
      replacement: "v",
      optional: true,
    },
    {
      id: "r-tap",
      tier: "strong",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
  ],
  "polish-influenced-english": [
    { id: "w-labiodental", tier: "light", pattern: /w/gu, replacement: "v" },
    { id: "theta-s", tier: "balanced", pattern: /θ/gu, replacement: "s" },
    { id: "eth-z", tier: "balanced", pattern: /ð/gu, replacement: "z" },
    {
      id: "r-trill",
      tier: "strong",
      pattern: /ɹ/gu,
      replacement: "r",
      optional: true,
    },
  ],
  "greek-influenced-english": [
    { id: "w-labiodental", tier: "light", pattern: /w/gu, replacement: "v" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    {
      id: "schwa-full",
      tier: "strong",
      pattern: /ə/gu,
      replacement: "a",
      optional: true,
    },
  ],
  "irish-english": [
    {
      id: "theta-t",
      tier: "light",
      pattern: /θ/gu,
      replacement: "t",
      optional: true,
    },
    {
      id: "eth-d",
      tier: "balanced",
      pattern: /ð/gu,
      replacement: "d",
      optional: true,
    },
    {
      id: "face-monophthong",
      tier: "strong",
      pattern: /eɪ/gu,
      replacement: "eː",
      optional: true,
    },
  ],
  "scottish-english": [
    {
      id: "face-monophthong",
      tier: "light",
      pattern: /eɪ/gu,
      replacement: "e",
    },
    {
      id: "goat-monophthong",
      tier: "balanced",
      pattern: /(?:oʊ|əʊ)/gu,
      replacement: "o",
    },
    {
      id: "trap-open",
      tier: "strong",
      pattern: /æ/gu,
      replacement: "a",
      optional: true,
    },
  ],
  "new-zealand-english": [
    {
      id: "postvocalic-r-drop",
      tier: "light",
      pattern: POSTVOCALIC_R_DROP_PATTERN,
      replacement: "",
    },
    { id: "rhotacized-schwa", tier: "light", pattern: /ɚ/gu, replacement: "ə" },
    { id: "rhotacized-nurse", tier: "light", pattern: /ɝ/gu, replacement: "ɜ" },
    { id: "kit-central", tier: "balanced", pattern: /ɪ/gu, replacement: "ə" },
    {
      id: "dress-raised",
      tier: "strong",
      pattern: /ɛ/gu,
      replacement: "e",
      optional: true,
    },
    {
      id: "trap-raised",
      tier: "strong",
      pattern: /æ/gu,
      replacement: "ɛ",
      optional: true,
    },
  ],
  "caribbean-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "price-monophthong",
      tier: "strong",
      pattern: /aɪ/gu,
      replacement: "aː",
      optional: true,
    },
  ],
  "north-african-arabic-influenced-english": [
    { id: "r-tap", tier: "light", pattern: /ɹ/gu, replacement: "ɾ" },
    {
      id: "p-b",
      tier: "balanced",
      pattern: /p/gu,
      replacement: "b",
      optional: true,
    },
    {
      id: "v-f",
      tier: "strong",
      pattern: /v/gu,
      replacement: "f",
      optional: true,
    },
  ],
  "middle-eastern-arabic-influenced-english": [
    { id: "r-tap", tier: "light", pattern: /ɹ/gu, replacement: "ɾ" },
    {
      id: "p-b",
      tier: "balanced",
      pattern: /p/gu,
      replacement: "b",
      optional: true,
    },
    {
      id: "near-close-i",
      tier: "strong",
      pattern: /ɪ/gu,
      replacement: "i",
      optional: true,
    },
  ],
  "persian-influenced-english": [
    { id: "w-labiodental", tier: "light", pattern: /w/gu, replacement: "v" },
    { id: "theta-s", tier: "balanced", pattern: /θ/gu, replacement: "s" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    {
      id: "eth-z",
      tier: "strong",
      pattern: /ð/gu,
      replacement: "z",
      optional: true,
    },
  ],
  "turkish-influenced-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "w-labiodental",
      tier: "balanced",
      pattern: /w/gu,
      replacement: "v",
      optional: true,
    },
    {
      id: "r-tap",
      tier: "strong",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
  ],
  "nigerian-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "near-close-i",
      tier: "strong",
      pattern: /ɪ/gu,
      replacement: "i",
      optional: true,
    },
  ],
  "east-african-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "near-close-i",
      tier: "strong",
      pattern: /ɪ/gu,
      replacement: "i",
      optional: true,
    },
  ],
  "south-african-english": [
    {
      id: "postvocalic-r-drop",
      tier: "light",
      pattern: POSTVOCALIC_R_DROP_PATTERN,
      replacement: "",
    },
    { id: "rhotacized-schwa", tier: "light", pattern: /ɚ/gu, replacement: "ə" },
    { id: "rhotacized-nurse", tier: "light", pattern: /ɝ/gu, replacement: "ɜ" },
    {
      id: "trap-raised",
      tier: "balanced",
      pattern: /æ/gu,
      replacement: "ɛ",
      optional: true,
    },
    {
      id: "face-central",
      tier: "strong",
      pattern: /eɪ/gu,
      replacement: "əɪ",
      optional: true,
    },
  ],
  "filipino-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    {
      id: "v-b",
      tier: "strong",
      pattern: /v/gu,
      replacement: "b",
      optional: true,
    },
  ],
  "vietnamese-influenced-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "postalveolar-z",
      tier: "strong",
      pattern: /ʒ/gu,
      replacement: "z",
      optional: true,
    },
    {
      id: "final-z-devoice",
      tier: "strong",
      pattern: /z(?=[,.;:!?)]?$)/gu,
      replacement: "s",
      optional: true,
    },
  ],
  "thai-influenced-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "v-glide",
      tier: "balanced",
      pattern: /v/gu,
      replacement: "w",
      optional: true,
    },
    {
      id: "r-lateral",
      tier: "strong",
      pattern: /ɹ/gu,
      replacement: "l",
      optional: true,
    },
  ],
  "indonesian-influenced-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "r-trill",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "r",
      optional: true,
    },
    {
      id: "f-p",
      tier: "strong",
      pattern: /f/gu,
      replacement: "p",
      optional: true,
    },
  ],
  "singapore-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "schwa-full",
      tier: "strong",
      pattern: /ə/gu,
      replacement: "a",
      optional: true,
    },
  ],
  "pacific-island-english": [
    { id: "theta-t", tier: "light", pattern: /θ/gu, replacement: "t" },
    {
      id: "r-tap",
      tier: "balanced",
      pattern: /ɹ/gu,
      replacement: "ɾ",
      optional: true,
    },
    { id: "eth-d", tier: "balanced", pattern: /ð/gu, replacement: "d" },
    {
      id: "price-monophthong",
      tier: "strong",
      pattern: /aɪ/gu,
      replacement: "aː",
      optional: true,
    },
  ],
};

const TIER_WEIGHT: Record<SpeechprintRuleTier, number> = {
  light: 0,
  balanced: 1,
  strong: 2,
};

/** Diphthongs first so stress/rhythm nuclei stay syllable-shaped. */
const IPA_VOWEL_NUCLEUS_PATTERN =
  /(?:aɪ|aʊ|eɪ|oʊ|əʊ|ɔɪ|ɑɪ|æɪ|əʉ|ʌɪ|ɑe|ɔʊ|[iɪeɛæaɑɒɔouʊʌəɚɝɐɜɞœøyɨʉᵻᵿei])ː?/gu;

type StressRhythmBias =
  | "penultimate"
  | "early"
  | "final"
  | "penultimate-open";

interface StressRhythmProfile {
  bias: StressRhythmBias;
  /** Unstressed schwa-family restoration target. */
  schwaRestore: string;
  /** Trailing rhotic schwa restoration (ɚ/ɝ). */
  rhoticRestore: string;
}

/**
 * Phase 1 Romance stress/rhythm profiles; phase 3 adds the syllable-timed
 * South Asian English family. Non-listed influences keep sound swaps only
 * until a later ruleset bump.
 */
const STRESS_RHYTHM_PROFILES: Partial<
  Record<Exclude<LocalVoiceSpeechprintInfluence, "none">, StressRhythmProfile>
> = {
  "italian-influenced-english": {
    bias: "penultimate",
    schwaRestore: "a",
    rhoticRestore: "a",
  },
  "spanish-influenced-english": {
    bias: "early",
    schwaRestore: "e",
    rhoticRestore: "e",
  },
  "latin-american-spanish-influenced-english": {
    bias: "early",
    schwaRestore: "e",
    rhoticRestore: "e",
  },
  "mexican-spanish-influenced-english": {
    bias: "early",
    schwaRestore: "e",
    rhoticRestore: "e",
  },
  "brazilian-portuguese-influenced-english": {
    bias: "penultimate-open",
    schwaRestore: "u",
    rhoticRestore: "u",
  },
  "european-portuguese-influenced-english": {
    bias: "penultimate-open",
    schwaRestore: "ɨ",
    rhoticRestore: "ɨ",
  },
  "french-influenced-english": {
    bias: "final",
    schwaRestore: "ə",
    rhoticRestore: "œ",
  },
  "parisian-french-influenced-english": {
    bias: "final",
    schwaRestore: "ə",
    rhoticRestore: "œ",
  },
  // South Asian English is syllable-timed: unstressed vowels keep their
  // fullness instead of reducing, and lexical prominence drifts early.
  "indian-english": {
    bias: "early",
    schwaRestore: "a",
    rhoticRestore: "a",
  },
  "pakistani-english": {
    bias: "early",
    schwaRestore: "a",
    rhoticRestore: "a",
  },
  "sri-lankan-english": {
    bias: "early",
    schwaRestore: "a",
    rhoticRestore: "a",
  },
  "bengali-influenced-english": {
    bias: "early",
    schwaRestore: "a",
    rhoticRestore: "a",
  },
};

/**
 * Phase 2 approximate phrase-melody contours. IPA stress scheduling only —
 * never inserts client clause-breath pauses or Feel-stage pitch envelopes.
 */
type MelodyContour =
  | "wave-final"
  | "peak-edges"
  | "final-group"
  | "penult-nuclear";

interface MelodyProfile {
  contour: MelodyContour;
}

const MELODY_PROFILES: Partial<
  Record<Exclude<LocalVoiceSpeechprintInfluence, "none">, MelodyProfile>
> = {
  "italian-influenced-english": { contour: "wave-final" },
  "spanish-influenced-english": { contour: "peak-edges" },
  "latin-american-spanish-influenced-english": { contour: "peak-edges" },
  "mexican-spanish-influenced-english": { contour: "peak-edges" },
  "brazilian-portuguese-influenced-english": { contour: "penult-nuclear" },
  "european-portuguese-influenced-english": { contour: "penult-nuclear" },
  "french-influenced-english": { contour: "final-group" },
  "parisian-french-influenced-english": { contour: "final-group" },
  // Hiberno-English keeps alternating internal peaks with a blooming final;
  // Scottish English levels the run-up into one decisive nuclear group; the
  // South Asian family often places the nuclear accent before the final word.
  "irish-english": { contour: "wave-final" },
  "scottish-english": { contour: "final-group" },
  "indian-english": { contour: "penult-nuclear" },
  "pakistani-english": { contour: "penult-nuclear" },
  "sri-lankan-english": { contour: "penult-nuclear" },
  "bengali-influenced-english": { contour: "penult-nuclear" },
};

interface IpaNucleus {
  start: number;
  end: number;
  text: string;
}

function stableUnitInterval(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function optionalRuleThreshold(
  strength: LocalVoiceSpeechprintStrength,
): number {
  return strength === "light" ? 0.34 : strength === "balanced" ? 0.67 : 0.92;
}

function listIpaNuclei(word: string): IpaNucleus[] {
  const nuclei: IpaNucleus[] = [];
  IPA_VOWEL_NUCLEUS_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IPA_VOWEL_NUCLEUS_PATTERN.exec(word)) !== null) {
    nuclei.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }
  return nuclei;
}

function stripStressMarks(word: string): string {
  return word.replace(/[ˈˌ]/gu, "");
}

function primaryStressNucleusIndex(word: string, nuclei: IpaNucleus[]): number {
  for (let index = 0; index < nuclei.length; index += 1) {
    const nucleus = nuclei[index]!;
    if (nucleus.start > 0 && word[nucleus.start - 1] === "ˈ") return index;
  }
  return -1;
}

function targetStressIndex(
  bias: StressRhythmBias,
  nucleusCount: number,
): number {
  if (nucleusCount <= 0) return -1;
  if (nucleusCount === 1) return 0;
  switch (bias) {
    case "early":
      return 0;
    case "final":
      return nucleusCount - 1;
    case "penultimate":
    case "penultimate-open":
      return Math.max(0, nucleusCount - 2);
    default: {
      const _exhaustive: never = bias;
      return _exhaustive;
    }
  }
}

function placePrimaryStress(word: string, nucleusIndex: number): string {
  const stripped = stripStressMarks(word);
  const nuclei = listIpaNuclei(stripped);
  if (nucleusIndex < 0 || nucleusIndex >= nuclei.length) return stripped;
  const target = nuclei[nucleusIndex]!;
  return `${stripped.slice(0, target.start)}ˈ${stripped.slice(target.start)}`;
}

function demoteSecondaryStress(
  word: string,
  profile: StressRhythmProfile,
): {
  word: string;
  changed: boolean;
} {
  if (!/ˌ/u.test(word)) return { word, changed: false };
  let next = word.replace(/ˌ/gu, "");
  const nuclei = listIpaNuclei(next);
  // If the word only had secondary stress, promote a clear primary so Instant
  // still has a stress anchor after demotion.
  if (nuclei.length > 0 && primaryStressNucleusIndex(next, nuclei) < 0) {
    const target = targetStressIndex(profile.bias, nuclei.length);
    next = placePrimaryStress(next, target < 0 ? 0 : target);
  }
  return { word: next, changed: next !== word };
}

function restoreUnstressedSchwas(
  word: string,
  profile: StressRhythmProfile,
): { word: string; changed: boolean } {
  const nuclei = listIpaNuclei(word);
  if (nuclei.length === 0) return { word, changed: false };
  const stressed = primaryStressNucleusIndex(word, nuclei);
  let changed = false;
  let result = word;
  // Walk right-to-left so index math stays valid after replacements.
  for (let index = nuclei.length - 1; index >= 0; index -= 1) {
    if (index === stressed) continue;
    const nucleus = listIpaNuclei(result)[index];
    if (!nucleus) continue;
    const base = nucleus.text.replace(/ː$/u, "");
    let replacement: string | null = null;
    if (base === "ə" || base === "ᵻ" || base === "ɨ") {
      replacement = profile.schwaRestore;
    } else if (base === "ɚ" || base === "ɝ") {
      replacement = profile.rhoticRestore;
    }
    if (!replacement || replacement === base) continue;
    result = `${result.slice(0, nucleus.start)}${replacement}${result.slice(nucleus.end)}`;
    changed = true;
  }
  return { word: result, changed };
}

function applyStressRhythmBias(
  word: string,
  profile: StressRhythmProfile,
): { word: string; changed: boolean } {
  const nuclei = listIpaNuclei(word);
  if (nuclei.length < 2) return { word, changed: false };
  const current = primaryStressNucleusIndex(word, nuclei);
  const target = targetStressIndex(profile.bias, nuclei.length);
  if (target < 0 || target === current) return { word, changed: false };
  // Spanish/early: only pull stress forward when English parked it later.
  if (profile.bias === "early" && current >= 0 && current <= target) {
    return { word, changed: false };
  }
  // Italian/penultimate: only retarget 3+ syllable content words.
  if (
    (profile.bias === "penultimate" || profile.bias === "penultimate-open") &&
    nuclei.length < 3
  ) {
    return { word, changed: false };
  }
  // French/final: only push stress later when it is not already final.
  if (profile.bias === "final" && current === nuclei.length - 1) {
    return { word, changed: false };
  }
  const next = placePrimaryStress(word, target);
  return { word: next, changed: next !== word };
}

function openPenultimateNucleus(word: string): {
  word: string;
  changed: boolean;
} {
  const strippedPreview = stripStressMarks(word);
  const nuclei = listIpaNuclei(word);
  // Only reshape true multi-syllable content; two-nucleus words stay untouched.
  if (nuclei.length < 3) return { word, changed: false };
  const targetIndex = nuclei.length - 2;
  const stressed = primaryStressNucleusIndex(word, nuclei);
  if (stressed !== targetIndex) return { word, changed: false };
  const nucleus = nuclei[targetIndex]!;
  if (nucleus.text.endsWith("ː")) return { word, changed: false };
  // Prefer a slightly more open/held stressed vowel for PT-influenced rhythm.
  const next = `${word.slice(0, nucleus.end)}ː${word.slice(nucleus.end)}`;
  // Guard: only lengthen if the stripped form still parses cleanly.
  if (
    listIpaNuclei(stripStressMarks(next)).length !==
    listIpaNuclei(strippedPreview).length
  ) {
    return { word, changed: false };
  }
  return { word: next, changed: next !== word };
}

function shouldSkipStressRhythmWord(word: string): boolean {
  // Belt-and-suspenders for digits / code-like tokens that slip past segment guards.
  if (/\d/u.test(word)) return true;
  if (/[A-Z]{2,}/u.test(word)) return true;
  if (/[_/\\@#]/u.test(word)) return true;
  return false;
}

function shouldSkipPhonemeRules(word: string): boolean {
  const { body } = splitTrailingPunctuation(word);
  if (!body) return true;
  if (/\d/u.test(body)) return true;
  if (/[A-Z]{2,}/u.test(body)) return true;
  if (/[_/\\@#]/u.test(body)) return true;
  return false;
}

function applyStressRhythmToWord(args: {
  word: string;
  profile: StressRhythmProfile;
  strength: LocalVoiceSpeechprintStrength;
  seed: string;
}): { word: string; appliedRuleIds: string[] } {
  if (shouldSkipStressRhythmWord(args.word)) {
    return { word: args.word, appliedRuleIds: [] };
  }
  const maximumTier = TIER_WEIGHT[args.strength];
  const appliedRuleIds: string[] = [];
  let result = args.word;

  if (maximumTier >= TIER_WEIGHT.light) {
    const demoted = demoteSecondaryStress(result, args.profile);
    if (demoted.changed) {
      result = demoted.word;
      appliedRuleIds.push("rhythm-demote-secondary");
    }
  }

  if (maximumTier >= TIER_WEIGHT.balanced) {
    const optionalSkip =
      stableUnitInterval(
        `${args.seed}:rhythm-stress-bias:${args.word}`,
      ) >= optionalRuleThreshold(args.strength);
    if (!optionalSkip) {
      const biased = applyStressRhythmBias(result, args.profile);
      if (biased.changed) {
        result = biased.word;
        appliedRuleIds.push(`rhythm-stress-${args.profile.bias}`);
      }
    }
  }

  if (maximumTier >= TIER_WEIGHT.strong) {
    const optionalSkip =
      stableUnitInterval(
        `${args.seed}:rhythm-schwa-restore:${args.word}`,
      ) >= optionalRuleThreshold(args.strength);
    if (!optionalSkip) {
      const restored = restoreUnstressedSchwas(result, args.profile);
      if (restored.changed) {
        result = restored.word;
        appliedRuleIds.push("rhythm-schwa-restore");
      }
    }
    if (args.profile.bias === "penultimate-open") {
      const opened = openPenultimateNucleus(result);
      if (opened.changed) {
        result = opened.word;
        appliedRuleIds.push("rhythm-open-penultimate");
      }
    }
  }

  return { word: result, appliedRuleIds };
}

function splitTrailingPunctuation(word: string): {
  body: string;
  punct: string;
} {
  const match = /^(.*?)([,.;:!?)]*)$/u.exec(word);
  if (!match) return { body: word, punct: "" };
  return { body: match[1] ?? word, punct: match[2] ?? "" };
}

function isPhraseContentWord(word: string): boolean {
  const { body } = splitTrailingPunctuation(word);
  if (!body || shouldSkipStressRhythmWord(body)) return false;
  if (body.includes("ˈ")) return true;
  return listIpaNuclei(body).length >= 2;
}

function demotePrimaryToSecondary(word: string): {
  word: string;
  changed: boolean;
} {
  if (!word.includes("ˈ")) return { word, changed: false };
  return { word: word.replace(/ˈ/gu, "ˌ"), changed: true };
}

function ensureWordPrimaryStress(word: string): {
  word: string;
  changed: boolean;
} {
  const { body, punct } = splitTrailingPunctuation(word);
  if (!body) return { word, changed: false };
  if (body.includes("ˈ")) return { word, changed: false };
  const nuclei = listIpaNuclei(body);
  if (nuclei.length === 0) return { word, changed: false };
  const stressed = placePrimaryStress(body, 0);
  const next = `${stressed}${punct}`;
  return { word: next, changed: next !== word };
}

function lengthenPrimaryNucleus(word: string): {
  word: string;
  changed: boolean;
} {
  const { body, punct } = splitTrailingPunctuation(word);
  const nuclei = listIpaNuclei(body);
  const stressedIndex = primaryStressNucleusIndex(body, nuclei);
  if (stressedIndex < 0) return { word, changed: false };
  const nucleus = nuclei[stressedIndex]!;
  if (nucleus.text.endsWith("ː")) return { word, changed: false };
  const nextBody = `${body.slice(0, nucleus.end)}ː${body.slice(nucleus.end)}`;
  const next = `${nextBody}${punct}`;
  return { word: next, changed: next !== word };
}

function nuclearContentOffset(
  contour: MelodyContour,
  contentCount: number,
): number {
  if (contentCount <= 0) return -1;
  switch (contour) {
    case "wave-final":
    case "peak-edges":
    case "final-group":
      return contentCount - 1;
    case "penult-nuclear":
      return contentCount >= 3 ? contentCount - 2 : contentCount - 1;
    default: {
      const _exhaustive: never = contour;
      return _exhaustive;
    }
  }
}

function shouldDemoteContentAt(args: {
  contour: MelodyContour;
  contentOffset: number;
  nuclearOffset: number;
  contentCount: number;
}): boolean {
  if (args.contentOffset === args.nuclearOffset) return false;
  switch (args.contour) {
    case "wave-final":
      // Italian-like wave: soften the opening peak so the final can bloom.
      return args.contentOffset === 0 && args.contentCount >= 3;
    case "peak-edges":
      // Spanish-like: keep the first peak, soften the middle, keep the last.
      return (
        args.contentOffset > 0 &&
        args.contentOffset < args.nuclearOffset &&
        args.contentCount >= 3
      );
    case "final-group":
      // French-like: one clear final accent group.
      return true;
    case "penult-nuclear":
      // Portuguese-like: soften non-nuclear peaks when the phrase is long enough.
      return args.contentCount >= 3;
    default: {
      const _exhaustive: never = args.contour;
      return _exhaustive;
    }
  }
}

/**
 * Approximate phrase melody via IPA stress scheduling across the utterance.
 * Does not insert punctuation or breath marks — client clause breaths and
 * Feel-stage Pitch/Lilt remain separate surfaces.
 */
export function localVoiceSpeechprintIsActive(
  value: LocalVoiceSpeechprintV1 | null | undefined,
): boolean {
  return normalizeLocalVoiceSpeechprintInfluence(value?.influence) !== "none";
}

export function applyLocalVoiceSpeechprintMelodyToIpa(args: {
  ipa: string;
  speechprint: LocalVoiceSpeechprintV1;
}): { ipa: string; appliedRuleIds: string[] } {
  const influence = normalizeLocalVoiceSpeechprintInfluence(
    args.speechprint.influence,
  );
  if (influence === "none") return { ipa: args.ipa, appliedRuleIds: [] };
  const profile = MELODY_PROFILES[influence];
  if (!profile) return { ipa: args.ipa, appliedRuleIds: [] };

  const strength = normalizeLocalVoiceSpeechprintStrength(
    args.speechprint.strength,
  );
  const seed = normalizeLocalVoiceSpeechprintVariationSeed(
    args.speechprint.variationSeed,
    `speechprint-melody-${influence}`.slice(0, 64),
  );
  const maximumTier = TIER_WEIGHT[strength];
  const appliedRuleIds = new Set<string>();

  const parts = args.ipa.split(/(\s+)/gu);
  const contentOffsets: number[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!;
    if (!part || /^\s+$/u.test(part)) continue;
    if (isPhraseContentWord(part)) contentOffsets.push(index);
  }
  if (maximumTier < TIER_WEIGHT.balanced) {
    return { ipa: args.ipa, appliedRuleIds: [] };
  }

  if (contentOffsets.length === 0) {
    return { ipa: args.ipa, appliedRuleIds: [] };
  }

  const nuclearLocal = nuclearContentOffset(
    profile.contour,
    contentOffsets.length,
  );
  if (nuclearLocal < 0) return { ipa: args.ipa, appliedRuleIds: [] };
  const nuclearPartIndex = contentOffsets[nuclearLocal]!;

  if (contentOffsets.length >= 2) {
    for (let local = 0; local < contentOffsets.length; local += 1) {
      if (
        !shouldDemoteContentAt({
          contour: profile.contour,
          contentOffset: local,
          nuclearOffset: nuclearLocal,
          contentCount: contentOffsets.length,
        })
      ) {
        continue;
      }
      const partIndex = contentOffsets[local]!;
      const demoted = demotePrimaryToSecondary(parts[partIndex]!);
      if (demoted.changed) {
        parts[partIndex] = demoted.word;
        appliedRuleIds.add(`melody-contour-${profile.contour}`);
      }
    }
  }

  const nuclearAgain = ensureWordPrimaryStress(parts[nuclearPartIndex]!);
  if (nuclearAgain.changed) {
    parts[nuclearPartIndex] = nuclearAgain.word;
    appliedRuleIds.add("melody-nuclear-ensure");
  }

  if (maximumTier >= TIER_WEIGHT.strong) {
    const optionalSkip =
      stableUnitInterval(`${seed}:melody-nuclear-lengthen`) >=
      optionalRuleThreshold(strength);
    if (!optionalSkip) {
      const lengthened = lengthenPrimaryNucleus(parts[nuclearPartIndex]!);
      if (lengthened.changed) {
        parts[nuclearPartIndex] = lengthened.word;
        appliedRuleIds.add("melody-nuclear-lengthen");
      }
    }
  }

  return {
    ipa: parts.join(""),
    appliedRuleIds: [...appliedRuleIds].sort(),
  };
}

export function applyLocalVoiceSpeechprintToIpa(args: {
  ipa: string;
  speechprint: LocalVoiceSpeechprintV1;
  /** Continuous-map activation. Omitted preserves the exact legacy path. */
  activationWeight?: number;
  includeProsody?: boolean;
}): { ipa: string; appliedRuleIds: string[] } {
  const influence = normalizeLocalVoiceSpeechprintInfluence(
    args.speechprint.influence,
  );
  if (influence === "none") return { ipa: args.ipa, appliedRuleIds: [] };
  const strength = normalizeLocalVoiceSpeechprintStrength(
    args.speechprint.strength,
  );
  const seed = normalizeLocalVoiceSpeechprintVariationSeed(
    args.speechprint.variationSeed,
    `speechprint-${influence}`.slice(0, 64),
  );
  const maximumTier = TIER_WEIGHT[strength];
  const activationWeight = Math.max(
    0,
    Math.min(1, args.activationWeight ?? 1),
  );
  if (activationWeight <= 0) return { ipa: args.ipa, appliedRuleIds: [] };
  const appliedRuleIds = new Set<string>();
  const afterSwaps = args.ipa
    .split(/(\s+)/gu)
    .map((word) => {
      if (!word || /^\s+$/u.test(word)) return word;
      if (shouldSkipPhonemeRules(word)) return word;
      let result = word;
      for (const rule of SPEECHPRINT_RULES[influence]) {
        if (TIER_WEIGHT[rule.tier] > maximumTier) continue;
        if (activationWeight < 1) {
          const probability =
            activationWeight *
            (rule.optional ? optionalRuleThreshold(strength) : 1);
          if (
            stableUnitInterval(`${seed}:field:${rule.id}:${word}`) >= probability
          ) continue;
        } else if (
          rule.optional &&
          stableUnitInterval(`${seed}:${rule.id}:${word}`) >=
            optionalRuleThreshold(strength)
        ) continue;
        const next = result.replace(rule.pattern, rule.replacement);
        if (next !== result) appliedRuleIds.add(rule.id);
        result = next;
      }
      return result;
    })
    .join("");

  if (args.includeProsody === false) {
    return { ipa: afterSwaps, appliedRuleIds: [...appliedRuleIds].sort() };
  }

  const rhythmProfile = STRESS_RHYTHM_PROFILES[influence];
  const afterRhythm = rhythmProfile
    ? afterSwaps
        .split(/(\s+)/gu)
        .map((word) => {
          if (!word || /^\s+$/u.test(word)) return word;
          const rhythm = applyStressRhythmToWord({
            word,
            profile: rhythmProfile,
            strength,
            seed,
          });
          for (const ruleId of rhythm.appliedRuleIds) {
            appliedRuleIds.add(ruleId);
          }
          return rhythm.word;
        })
        .join("")
    : afterSwaps;

  const melody = applyLocalVoiceSpeechprintMelodyToIpa({
    ipa: afterRhythm,
    speechprint: args.speechprint,
  });
  for (const ruleId of melody.appliedRuleIds) appliedRuleIds.add(ruleId);
  return { ipa: melody.ipa, appliedRuleIds: [...appliedRuleIds].sort() };
}

/**
 * Applies a continuous Accent Map field as one restrained primary layer plus
 * sparse deterministic neighboring features. The source transcript and voice
 * identity never enter this provider-neutral IPA projection.
 */
export function applyVoiceAccentFieldToIpa(args: {
  ipa: string;
  resolution: VoiceAccentFieldResolutionV1;
  strength: LocalVoiceSpeechprintStrength;
  variationSeed: string;
}): { ipa: string; appliedRuleIds: string[] } {
  if (args.resolution.legacy) {
    const layer = args.resolution.layers[0];
    if (!layer || layer.influence === "none") {
      return { ipa: args.ipa, appliedRuleIds: [] };
    }
    return applyLocalVoiceSpeechprintToIpa({
      ipa: args.ipa,
      speechprint: {
        influence: layer.influence,
        strength: args.strength,
        variationSeed: args.variationSeed,
      },
    });
  }

  let ipa = args.ipa;
  const appliedRuleIds = new Set<string>();
  for (const [index, layer] of args.resolution.layers.entries()) {
    if (layer.influence === "none") continue;
    const activationWeight =
      index === 0
        ? Math.min(1, 0.35 + layer.weight * 0.8)
        : Math.min(0.32, layer.weight * 0.45);
    const applied = applyLocalVoiceSpeechprintToIpa({
      ipa,
      speechprint: {
        influence: layer.influence,
        strength: args.strength,
        variationSeed: `${args.variationSeed}:${layer.accentDefinitionId}`.slice(
          0,
          64,
        ),
      },
      activationWeight,
      includeProsody: false,
    });
    ipa = applied.ipa;
    for (const ruleId of applied.appliedRuleIds) {
      appliedRuleIds.add(`${layer.accentDefinitionId}:${ruleId}`);
    }
  }
  return { ipa, appliedRuleIds: [...appliedRuleIds].sort() };
}

interface AmericanRhoticEnforcementRule {
  id: string;
  pattern: RegExp;
  replacement: string;
}

/**
 * espeak's en-US output keeps British-shaped tokens: NURSE surfaces as plain
 * "ɜː" with no rhotic at all (bird => bˈɜːd), lettER as the r-colored "ɚ",
 * and long vowels keep their length mark before a coda "ɹ" (hard => hˈɑːɹd).
 * American base voices render those rhotically out of habit, but British base
 * voices read the same tokens with their native non-rhotic prior and swallow
 * the R. The engine's training G2P (misaki) writes American English as plain
 * short vowel plus explicit "ɹ" — her => hɜɹ, or => ɔɹ, ɚ => əɹ, no "ː" —
 * so these rewrites restate every hard R as a token no voice can skip.
 */
const AMERICAN_RHOTIC_ENFORCEMENT_RULES: readonly AmericanRhoticEnforcementRule[] = [
  // NURSE gains its missing rhotic; "ɜːɹ" (furry) is handled by length strip.
  { id: "nurse-hard-r", pattern: /ɜː(?!ɹ)/gu, replacement: "ɜɹ" },
  // R-colored schwa becomes an explicit schwa + R; "ɚɹ" (martyr) collapses.
  { id: "rhotic-schwa-hard-r", pattern: /ɚɹ?/gu, replacement: "əɹ" },
  // FORCE joins NORTH before R (horse–hoarse merger): "oːɹ" (four) => "ɔːɹ".
  { id: "rhotic-force-merge", pattern: /oː(?=ɹ)/gu, replacement: "ɔː" },
  // Length marks before R invite the non-rhotic long-vowel reading; drop them
  // — except for "ɔː": bare "ɔ" is essentially unseen in British training
  // data, so a translated British style falls back open and unrounded
  // (floor => "flar"). The long form keeps the rounding while the style
  // translation and the explicit "ɹ" carry the American R.
  { id: "rhotic-coda-length", pattern: /(?<!ɔ)ː(?=ɹ)/gu, replacement: "" },
];

/**
 * Rewrites en-US base IPA so every hard R is an explicit token. Runs on the
 * pronunciation base BEFORE accent-field rules, so deliberately non-rhotic
 * accents (New York, RP on an American base) still see — and can delete —
 * the coda R their postvocalic-r-drop rules target. Idempotent.
 */
export function enforceAmericanRhoticIpa(ipa: string): {
  ipa: string;
  appliedRuleIds: string[];
} {
  let result = ipa;
  const appliedRuleIds: string[] = [];
  for (const rule of AMERICAN_RHOTIC_ENFORCEMENT_RULES) {
    const next = result.replace(rule.pattern, rule.replacement);
    if (next !== result) appliedRuleIds.push(rule.id);
    result = next;
  }
  return { ipa: result, appliedRuleIds };
}
