import type { VoiceAccentDefinitionId } from "./audioVoice.ts";

/**
 * Vernacular is the word-side twin of the Accent Map pin: the pin owns how a
 * bot sounds, a vernacular owns how it phrases things. The pin implies it —
 * placing a named regional pin grants that region's phrasing with no separate
 * control — and it shapes only the words the bot writes. Pronunciation stays with the
 * accent stack, which is why every entry insists on standard spelling: the
 * phonemizer reads ordinary orthography and the pin supplies the sound.
 *
 * Entries are deliberately cultural regional varieties, not ethnolects.
 * Placeless stylistic registers (noir narration, archaic English) live in the
 * Powers system instead — see botSpeechRegister.ts. There is no strength
 * control on purpose: a character speaks their variety or they do not.
 */
export const BOT_VERNACULAR_IDS = [
  "southern-us",
  "scots",
  "hiberno-english",
  "aussie",
  "cockney",
  "new-york",
  "new-england",
  "canadian",
  "kiwi",
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
  /** The Accent Map region that grants this vernacular. */
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
    example: "Away ye go — that's a braw wee plan, so it is.",
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
    id: "new-york",
    label: "New York",
    description: "Brisk, direct New York City phrasing.",
    example: "You want coffee? There's a bodega right there — nobody waits on line all day.",
    guidance:
      "You phrase things with a brisk New York City voice. Say waiting on " +
      "line rather than in line, reach for bodega, stoop, the train, and " +
      "schlep, and let the occasional Yiddish-flavored loan like schmear or " +
      "schmutz land where it's natural. Be direct and quick with warmth " +
      "underneath — impatience as affection, never rudeness.",
    accentDefinitionId: "new-york-english",
  },
  {
    id: "new-england",
    label: "New England",
    description: "Boston-area phrasing, wicked understated.",
    example: "That shortcut past the rotary is wicked quick, kid.",
    guidance:
      "You phrase things with a Boston-area New England voice. Use wicked as " +
      "the intensifier of choice, plus rotary, packie, frappe, grinder, the " +
      "T, and bang a U-ey where they fit naturally. Keep the delivery dry, " +
      "loyal, and unimpressed on the surface with real warmth underneath.",
    accentDefinitionId: "eastern-new-england-english",
  },
  {
    id: "canadian",
    label: "Canadian",
    description: "Gentle Canadian markers, eh kept rare.",
    example: "Grab your toque — we'll stop for a double-double on the way, eh?",
    guidance:
      "You phrase things with a gentle Canadian voice. Reach for toque, " +
      "double-double, loonie and toonie, keener, hydro for electricity, " +
      "washroom, and pop, with distances in klicks. A soft reflexive sorry " +
      "and a tag-question eh appear only now and then — restraint is the " +
      "charm; this is seasoning, never a moose joke.",
    accentDefinitionId: "canadian-english",
  },
  {
    id: "kiwi",
    label: "Kiwi",
    description: "New Zealand slang and easy understatement.",
    example: "Yeah-nah, sweet as — chuck your jandals on and we'll sort it.",
    guidance:
      "You phrase things with a natural New Zealand voice. Use sweet as, " +
      "yeah-nah and nah-yeah, keen, heaps, jandals, togs, bach for a holiday " +
      "house, and dairy for the corner shop, with chur appearing rarely. " +
      "Favor easy understatement — she'll be right carries most storms.",
    accentDefinitionId: "new-zealand-english",
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
 * The Accent Map pin implies its region's phrasing: pin a bot in Cockney and
 * it speaks Cockney, no separate choice. Many regions share one vernacular
 * (Texas, Appalachia, and North Florida all phrase Southern) and most regions
 * have none yet. Placeless registers are Powers, not vernaculars.
 */
const BOT_VERNACULAR_ACCENT_EXTENSIONS: Readonly<Record<string, BotVernacularId>> = {
  "texas-english": "southern-us",
  "appalachian-english": "southern-us",
  "north-florida-english": "southern-us",
};

const BOT_VERNACULAR_BY_ACCENT_DEFINITION: ReadonlyMap<string, BotVernacularId> =
  new Map([
    ...BOT_VERNACULAR_DEFINITIONS.flatMap((definition) =>
      definition.accentDefinitionId
        ? ([[definition.accentDefinitionId, definition.id]] as const)
        : [],
    ),
    ...Object.entries(BOT_VERNACULAR_ACCENT_EXTENSIONS),
  ]);

export function botVernacularIdForAccentDefinition(
  accentDefinitionId: unknown,
): BotVernacularId | null {
  if (typeof accentDefinitionId !== "string") return null;
  return (
    BOT_VERNACULAR_BY_ACCENT_DEFINITION.get(
      accentDefinitionId.trim().toLocaleLowerCase(),
    ) ?? null
  );
}

/**
 * Resolves the vernacular a stored audio voice profile speaks, in any of its
 * persisted shapes (raw JSON string, flattened V1/V2 record, or V3 nested
 * under local.pronunciation). An explicitly authored regional vernacularId
 * wins, otherwise the accent identity derives it, including legacy profiles
 * that stored only the Speechprint influence. Deliberately a tolerant duck-read so prompt
 * composition never needs the full profile normalizer.
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
    accentDefinitionId?: unknown;
    speechprintInfluence?: unknown;
    pronunciation?: {
      vernacularId?: unknown;
      accentDefinitionId?: unknown;
    } | null;
    local?: {
      pronunciation?: {
        vernacularId?: unknown;
        accentDefinitionId?: unknown;
      } | null;
      speechprint?: { influence?: unknown } | null;
    } | null;
  };
  return (
    normalizeBotVernacularId(profile.local?.pronunciation?.vernacularId) ??
    normalizeBotVernacularId(profile.pronunciation?.vernacularId) ??
    normalizeBotVernacularId(profile.vernacularId) ??
    botVernacularIdForAccentDefinition(
      profile.local?.pronunciation?.accentDefinitionId ??
        profile.pronunciation?.accentDefinitionId ??
        profile.accentDefinitionId ??
        profile.local?.speechprint?.influence ??
        profile.speechprintInfluence,
    )
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
  "Vernacular rules: write established vernacular words as themselves — " +
  "y'all, fixin' to, dinnae, cannae, wee, wicked and toque are lexicon, not " +
  "spellings — but keep standard English spelling for every ordinary word, " +
  "and never respell words phonetically to imitate pronunciation; your " +
  "voice's accent carries the sound. In particular never clip the g from " +
  "ordinary -ing words: write talking, something, going and waiting, never " +
  "talkin', somethin', goin' or waitin'. Let the flavor surface a few times " +
  "per reply rather than in every sentence, and never stack more than two " +
  "markers in one sentence. Your character, knowledge, and care for the " +
  "person you are speaking with always come before the dialect, and any " +
  "conflicting speech instruction from your Powers takes precedence over " +
  "this voice.";

/** Prompt-time authoring cue; empty when the bot has no vernacular. */
export function botVernacularAuthoringCueV1(value: unknown): string {
  const definition = botVernacularDefinitionForId(value);
  if (!definition) return "";
  return `Vernacular — ${definition.label}: ${definition.guidance}\n${BOT_VERNACULAR_SHARED_RULES_V1}`;
}
