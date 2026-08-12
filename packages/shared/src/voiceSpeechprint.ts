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
} from "./audioVoice.js";

export const LOCAL_VOICE_SPEECHPRINT_RULESET_VERSION = "2026.08.9";
/** SHA-256 of the qualified Instant IPA matrix (see speechprint-runtime.test.ts). */
export const LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256 =
  "827e0b63e76fec41e23a641c390628c54100b445c04175342a8e790dc2e72359";

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
  localSpeechprintFallback: LocalVoiceSpeechprintInfluence;
  localPronunciationBaseFallback?: "en-US" | "en-GB";
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
    id: "southern-us-english",
    label: "Southern U.S. English",
    description: "A restrained Southern U.S. English pronunciation profile.",
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

export const VOICE_ACCENT_DEFINITIONS: readonly VoiceAccentDefinitionV1[] = [
  {
    id: "american-english",
    premiumAccentedEnglishLabel: "American-accented English",
    premiumNativeAccentAliases: [
      "American",
      "American English",
      "US English",
      "English (United States)",
      "en-US",
    ],
    localSpeechprintFallback: "none",
    localPronunciationBaseFallback: "en-US",
  },
  {
    id: "british-english",
    premiumAccentedEnglishLabel: "British-accented English",
    premiumNativeAccentAliases: [
      "British",
      "British English",
      "UK English",
      "English (United Kingdom)",
      "en-GB",
    ],
    localSpeechprintFallback: "none",
    localPronunciationBaseFallback: "en-GB",
  },
  ...LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.map((capability) => ({
    id: capability.id,
    premiumAccentedEnglishLabel: `${premiumAccentLabel(
      capability.label,
    )}-accented English`,
    premiumNativeAccentAliases: premiumNativeAccentAliases(
      capability.id,
      capability.label,
    ),
    localSpeechprintFallback: capability.id,
  })),
];

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
    return voiceAccentDefinitionForId("american-english");
  }
  if (args.pronunciationBase === "en-GB") {
    return voiceAccentDefinitionForId("british-english");
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

/** Private ElevenLabs v3 cue for the saved Accent Map definition. */
export function resolvePremiumAccentDirection(args: {
  accentDefinitionId?: unknown;
  pronunciationBase: unknown;
  speechprintInfluence: unknown;
  speechprintStrength: unknown;
  nativeAccentHint?: unknown;
}): string | null {
  const target = premiumAccentTarget(args);
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
  const providerAccentLabel = target.premiumAccentedEnglishLabel.replace(
    /-accented English$/u,
    " accent",
  );
  return `${intensity}${providerAccentLabel}`;
}

type SpeechprintRuleTier = "light" | "balanced" | "strong";

interface SpeechprintRule {
  id: string;
  tier: SpeechprintRuleTier;
  pattern: RegExp;
  replacement: string;
  optional?: boolean;
}

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
      pattern:
        /(?<=[iɪeɛæaɑɒɔoʊuʌəɚɝɐɜɞœøyɨʉ])ɹ(?=[ptkbdgfvθðszʃʒhmnŋlwj,.;:!?)]|$)/gu,
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
      id: "cot-caught-merge",
      tier: "strong",
      pattern: /ɔ/gu,
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
      pattern:
        /(?<=[iɪeɛæaɑɒɔoʊuʌəɚɝɐɜɞœøyɨʉ])ɹ(?=[ptkbdgfvθðszʃʒhmnŋlwj,.;:!?)]|$)/gu,
      replacement: "",
    },
    {
      id: "thought-raised",
      tier: "balanced",
      pattern: /ɔ/gu,
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
      pattern:
        /(?<=[iɪeɛæaɑɒɔoʊuʌəɚɝɐɜɞœøyɨʉ])ɹ(?=[ptkbdgfvθðszʃʒhmnŋlwj,.;:!?)]|$)/gu,
      replacement: "",
    },
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
      pattern:
        /(?<=[iɪeɛæaɑɒɔoʊuʌəɚɝɐɜɞœøyɨʉ])ɹ(?=[ptkbdgfvθðszʃʒhmnŋlwj,.;:!?)]|$)/gu,
      replacement: "",
    },
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
 * Phase 1 Romance stress/rhythm profiles. Non-listed influences keep sound
 * swaps only until a later ruleset bump.
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
  const appliedRuleIds = new Set<string>();
  const afterSwaps = args.ipa
    .split(/(\s+)/gu)
    .map((word) => {
      if (!word || /^\s+$/u.test(word)) return word;
      let result = word;
      for (const rule of SPEECHPRINT_RULES[influence]) {
        if (TIER_WEIGHT[rule.tier] > maximumTier) continue;
        if (
          rule.optional &&
          stableUnitInterval(`${seed}:${rule.id}:${word}`) >=
            optionalRuleThreshold(strength)
        ) {
          continue;
        }
        const next = result.replace(rule.pattern, rule.replacement);
        if (next !== result) appliedRuleIds.add(rule.id);
        result = next;
      }
      return result;
    })
    .join("");

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
