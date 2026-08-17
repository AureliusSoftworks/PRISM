import type { VoiceAccentDefinitionId } from "./audioVoice.ts";

/**
 * Vernacular is the word-side twin of the Accent Map pin: the pin owns how a
 * bot sounds, a vernacular owns how it phrases things. It is authored bot
 * identity — chosen explicitly in the editor, never inferred from anything —
 * and it shapes only the words the bot writes. Pronunciation stays with the
 * accent stack, which is why every entry insists on standard spelling: the
 * phonemizer reads ordinary orthography and the pin supplies the sound.
 *
 * Entries are deliberately cultural or stylistic registers, not ethnolects.
 * There is no strength control on purpose: a character speaks their variety
 * or they do not.
 */
export const BOT_VERNACULAR_IDS = [
  "southern-us",
  "scots",
  "hiberno-english",
  "aussie",
  "cockney",
  "noir",
  "archaic",
] as const;

export type BotVernacularId = (typeof BOT_VERNACULAR_IDS)[number];

export interface BotVernacularDefinitionV1 {
  id: BotVernacularId;
  label: string;
  /** One line for the picker. */
  description: string;
  /** Sample line shown beside the label so the flavor reads before choosing. */
  example: string;
  /** Variety-specific authoring guidance injected at prompt time. */
  guidance: string;
  /** Suggested Accent Map pairing; registers without a geography omit it. */
  accentDefinitionId?: VoiceAccentDefinitionId;
}

export const BOT_VERNACULAR_DEFINITIONS: readonly BotVernacularDefinitionV1[] = [
  {
    id: "southern-us",
    label: "Southern US",
    description: "Warm, unhurried Southern turns of phrase.",
    example: "Y'all hang tight — I'm fixin' to sort this out.",
    guidance:
      "You phrase things with a warm Southern US voice. Reach for y'all, " +
      "fixin' to, reckon, mighty, over yonder, a ways off, and hush now where " +
      "they fall naturally, and allow doubled modals like might could or " +
      "used to could when they fit. Keep the pace unhurried and the courtesy " +
      "genuine; bless your heart appears rarely and only with real affection.",
    accentDefinitionId: "southern-us-english",
  },
  {
    id: "scots",
    label: "Scots",
    description: "Scots vocabulary and turns of phrase.",
    example: "Away wi' ye — that's a braw wee plan, so it is.",
    guidance:
      "You phrase things with a natural Scots voice. Weave in wee, aye, ken, " +
      "dinnae, cannae, bonnie, braw, bairn, crabbit, and scunnered where they " +
      "fall naturally, and constructions like I'm away to see to it or " +
      "that's me finished. Keep the warmth dry and matter-of-fact rather " +
      "than performed.",
    accentDefinitionId: "scottish-english",
  },
  {
    id: "hiberno-english",
    label: "Hiberno-English",
    description: "Irish English constructions and softeners.",
    example: "Sure look, I'm only after finishing it now.",
    guidance:
      "You phrase things with a natural Irish voice. Use grand, sure look, " +
      "the craic, giving out, and yer man where they fall naturally, and " +
      "Hiberno constructions like I'm after finishing it for something just " +
      "done, amn't I, and a soft trailing now or so to close a thought. The " +
      "habitual I do be appears rarely, and the charm stays easy, never " +
      "stage-Irish.",
    accentDefinitionId: "irish-english",
  },
  {
    id: "aussie",
    label: "Aussie",
    description: "Australian slang and cheerful understatement.",
    example: "Reckon we knock this over this arvo, no worries.",
    guidance:
      "You phrase things with a natural Australian voice. Use reckon, keen, " +
      "heaps, no worries, good on ya, and clippings like arvo or brekkie " +
      "where they fall naturally, with mate appearing only when it genuinely " +
      "fits. Favor cheerful directness and understatement — big things get " +
      "called not bad, hard things get knocked over.",
    accentDefinitionId: "australian-english",
  },
  {
    id: "cockney",
    label: "Cockney",
    description: "East London cheek, with rare rhyming slang.",
    example: "Leave it out, guv — that plan's telling porkies.",
    guidance:
      "You phrase things with an East London voice. Use guv, mate, blimey, " +
      "leave it out, and sorted where they fall naturally, with warmth and " +
      "cheek. Rhyming slang like porkies, a butcher's, or the dog and bone " +
      "appears at most once in a while and always where context makes the " +
      "meaning obvious.",
    accentDefinitionId: "cockney-english",
  },
  {
    id: "noir",
    label: "Noir narrator",
    description: "Hardboiled case-notes narration.",
    example: "The bug walked in at midnight, the way trouble always does.",
    guidance:
      "You phrase things like a hardboiled noir narrator. Keep sentences " +
      "clipped, observations world-weary, and metaphors drawn from rain, " +
      "smoke, neon, and old debts, with the occasional simile that lands " +
      "like a slow right hook. Stay atmospheric rather than parodic, and " +
      "let the dry wit surface between the shadows.",
  },
  {
    id: "archaic",
    label: "Archaic English",
    description: "Thee-and-thou stage English, kept clear.",
    example: "Thou hast asked well; attend, and I shall answer.",
    guidance:
      "You phrase things in clear archaic English. Use thee, thou, and thy " +
      "with correct forms — thou hast, thou art, thou wilt — plus 'tis, " +
      "prithee, and gentle inversions like Ask me what thou wilt. Verily and " +
      "forsooth appear rarely. Beneath the costume the meaning stays modern " +
      "and effortless to follow.",
  },
];

export function normalizeBotVernacularId(
  value: unknown,
  fallback: BotVernacularId | null = null,
): BotVernacularId | null {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLocaleLowerCase();
  return (BOT_VERNACULAR_IDS as readonly string[]).includes(normalized)
    ? (normalized as BotVernacularId)
    : fallback;
}

export function botVernacularDefinitionForId(
  value: unknown,
): BotVernacularDefinitionV1 | null {
  const id = normalizeBotVernacularId(value);
  return id
    ? BOT_VERNACULAR_DEFINITIONS.find((definition) => definition.id === id) ??
        null
    : null;
}

/**
 * Reads a vernacular id out of a stored audio voice profile in any of its
 * persisted shapes (raw JSON string, flattened V1/V2 record, or V3 with the
 * id nested beside the Accent Map identity under local.pronunciation).
 * Deliberately a tolerant duck-read so prompt composition never needs the
 * full profile normalizer.
 */
export function botVernacularIdFromStoredVoiceProfile(
  value: unknown,
): BotVernacularId | null {
  let record = value;
  if (typeof record === "string") {
    const trimmed = record.trim();
    if (!trimmed) return null;
    try {
      record = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!record || typeof record !== "object") return null;
  const profile = record as {
    vernacularId?: unknown;
    pronunciation?: { vernacularId?: unknown } | null;
    local?: { pronunciation?: { vernacularId?: unknown } | null } | null;
  };
  return (
    normalizeBotVernacularId(profile.local?.pronunciation?.vernacularId) ??
    normalizeBotVernacularId(profile.pronunciation?.vernacularId) ??
    normalizeBotVernacularId(profile.vernacularId)
  );
}

/**
 * Universal authoring rules shared by every vernacular. They live here once —
 * not per entry — so the invariants cannot drift: standard spelling (the
 * accent stack owns pronunciation; phonetic respelling of ordinary words is
 * never acceptable), sparse natural density, persona precedence, and yielding
 * to harder speech effects from Powers.
 */
export const BOT_VERNACULAR_SHARED_RULES_V1 =
  "Vernacular rules: write established vernacular words as themselves, but " +
  "keep standard English spelling for ordinary words — never respell words " +
  "phonetically to imitate pronunciation; your voice's accent carries the " +
  "sound. Let the flavor surface a few times per reply rather than in every " +
  "sentence. Your character, knowledge, and care for the person you are " +
  "speaking with always come before the dialect, and any conflicting speech " +
  "instruction from your Powers takes precedence over this voice.";

/** Prompt-time authoring cue; empty when the bot has no vernacular. */
export function botVernacularAuthoringCueV1(value: unknown): string {
  const definition = botVernacularDefinitionForId(value);
  if (!definition) return "";
  return `Vernacular — ${definition.label}: ${definition.guidance}\n${BOT_VERNACULAR_SHARED_RULES_V1}`;
}
