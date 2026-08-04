import {
  LOCAL_VOICE_SPEECHPRINT_STRENGTHS,
  normalizeLocalVoiceSpeechprintInfluence,
  normalizeLocalVoiceSpeechprintStrength,
  normalizeLocalVoiceSpeechprintVariationSeed,
  type LocalVoiceSpeechprintInfluence,
  type LocalVoiceSpeechprintStrength,
  type LocalVoiceSpeechprintV1,
} from "./audioVoice.js";

export const LOCAL_VOICE_SPEECHPRINT_RULESET_VERSION = "2026.08.3";
export const LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256 =
  "c96f1fa60a70303017ad7561ac428ca0b12191db82b795f736d35f5bf3f500bf";

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

const SUPPORTED_BASE_LOCALES = ["en-US", "en-GB"] as const;
const SUPPORTED_ENGINES = ["instant"] as const;

const LOCAL_VOICE_SPEECHPRINT_DESCRIPTORS = [
  {
    id: "spanish-influenced-english",
    label: "Spanish-influenced English",
    description: "A restrained Spanish-language pronunciation influence.",
  },
  {
    id: "brazilian-portuguese-influenced-english",
    label: "Brazilian Portuguese-influenced English",
    description: "A restrained Brazilian Portuguese pronunciation influence.",
  },
  {
    id: "mandarin-influenced-english",
    label: "Mandarin-influenced English",
    description: "A restrained Mandarin pronunciation influence.",
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
    id: "french-influenced-english",
    label: "French-influenced English",
    description: "A restrained French-language pronunciation influence.",
  },
  {
    id: "german-influenced-english",
    label: "German-influenced English",
    description: "A restrained German-language pronunciation influence.",
  },
  {
    id: "russian-influenced-english",
    label: "Russian-influenced English",
    description: "A restrained Russian-language pronunciation influence.",
  },
  {
    id: "italian-influenced-english",
    label: "Italian-influenced English",
    description: "A restrained Italian-language pronunciation influence.",
  },
  {
    id: "australian-english",
    label: "Australian English",
    description: "A restrained Australian English pronunciation profile.",
  },
  {
    id: "canadian-english",
    label: "Canadian English",
    description: "A restrained Canadian English pronunciation profile.",
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
};

const TIER_WEIGHT: Record<SpeechprintRuleTier, number> = {
  light: 0,
  balanced: 1,
  strong: 2,
};

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

export function localVoiceSpeechprintIsActive(
  value: LocalVoiceSpeechprintV1 | null | undefined,
): boolean {
  return normalizeLocalVoiceSpeechprintInfluence(value?.influence) !== "none";
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
  const transformed = args.ipa
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
  return { ipa: transformed, appliedRuleIds: [...appliedRuleIds].sort() };
}
