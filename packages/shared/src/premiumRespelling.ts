import {
  normalizeLocalVoiceSpeechprintInfluence,
  normalizeLocalVoiceSpeechprintStrength,
  type LocalVoiceSpeechprintInfluence,
} from "./audioVoice.ts";
import {
  protectedSpeechRanges,
  type ProtectedSpeechRange,
} from "./protectedSpeech.ts";

export const PREMIUM_RESPELLING_RULESET_VERSION = "2026.08.19.1";

/** Fires at Balanced and above, or at Strong only. Light is always tag-only:
 * a faint accent is the direction's job, and respelling cannot be faint. */
export type PremiumRespellingTier = "balanced" | "strong";

export interface PremiumRespellingRuleV1 {
  /** The SPEECHPRINT_RULES id this descends from, so the word-side and the
   * phoneme-side of one accent stay traceable to each other. */
  id: string;
  tier: PremiumRespellingTier;
  /** Lowercase whole word → respelling. Never a pattern: orthographic "th"
   * is θ in "think" and ð in "this", so a rule expressed as a regex spells
   * "brofer" for an accent that only fronts θ. */
  words: Readonly<Record<string, string>>;
}

export interface PremiumRespellingSegmentV1 {
  providerText: string;
  sourceText: string;
}

export interface PremiumRespellingV1 {
  text: string;
  segments: readonly PremiumRespellingSegmentV1[];
  changed: boolean;
  appliedRuleIds: readonly string[];
}

/**
 * Word-side twin of the Speechprint ruleset, for engines with no phoneme
 * control. ElevenLabs reads IPA aloud as notation, so the only way to move a
 * Premium consonant is to spell the word the way the accent says it.
 *
 * Consonants only, and only where the respelling is an established way of
 * writing that accent. Vowels stay with the direction tag: orthographic vowel
 * respelling produces non-words the model has to guess at, which is where eye
 * dialect stops being phonology and starts being caricature.
 *
 * Every rule descends from a rule the accent already has on the Local side.
 * Nothing here invents phonology the Accent Map does not already claim.
 */
const PREMIUM_RESPELLING_RULES: Partial<
  Record<
    Exclude<LocalVoiceSpeechprintInfluence, "none">,
    readonly PremiumRespellingRuleV1[]
  >
> = {
  "cockney-english": [
    {
      id: "theta-front",
      tier: "balanced",
      words: {
        think: "fink",
        thinking: "finking",
        thing: "fing",
        things: "fings",
        three: "free",
        thanks: "fanks",
      },
    },
    {
      id: "theta-front",
      tier: "strong",
      words: {
        nothing: "nuffink",
        something: "somefink",
        anything: "anyfing",
        everything: "everyfing",
        birthday: "birfday",
        mouth: "mouf",
        teeth: "teef",
        both: "bofe",
        month: "monf",
        thousand: "fousand",
      },
    },
    {
      id: "eth-front",
      tier: "balanced",
      words: {
        brother: "bruvver",
        mother: "muvver",
        father: "farver",
        other: "uvver",
        another: "anuvver",
        with: "wiv",
      },
    },
    {
      id: "eth-front",
      tier: "strong",
      words: {
        together: "togevver",
        whether: "wevver",
        weather: "wevver",
        either: "eivver",
        rather: "ravver",
        bother: "bovver",
      },
    },
    {
      id: "h-drop",
      tier: "strong",
      words: {
        have: "'ave",
        house: "'ouse",
        home: "'ome",
        half: "'alf",
        head: "'ead",
        here: "'ere",
      },
    },
  ],
  // Essex and Estuary front θ only at Strong on the Local side, and carry no
  // ð rule at all. "this" stays "this"; only the "think" family moves.
  "essex-english": [
    {
      id: "theta-front",
      tier: "strong",
      words: {
        think: "fink",
        thinking: "finking",
        thing: "fing",
        things: "fings",
        three: "free",
        thanks: "fanks",
        nothing: "nuffing",
        something: "somefing",
        anything: "anyfing",
        everything: "everyfing",
        birthday: "birfday",
        mouth: "mouf",
        teeth: "teef",
      },
    },
  ],
  "estuary-english": [
    {
      id: "theta-front",
      tier: "strong",
      words: {
        think: "fink",
        thing: "fing",
        things: "fings",
        three: "free",
        thanks: "fanks",
        nothing: "nuffing",
        something: "somefing",
        anything: "anyfing",
      },
    },
  ],
  // MLE stops θ and ð rather than fronting them: "tink" and "dis", never
  // "fink" and "bruvver".
  "multicultural-london-english": [
    {
      id: "theta-stop",
      tier: "balanced",
      words: {
        think: "tink",
        thinking: "tinking",
        thing: "ting",
        things: "tings",
        three: "tree",
        thanks: "tanks",
      },
    },
    {
      id: "theta-stop",
      tier: "strong",
      words: {
        something: "someting",
        nothing: "nutting",
        anything: "anyting",
        everything: "everyting",
        thousand: "tousand",
      },
    },
    {
      id: "eth-stop",
      tier: "balanced",
      words: { this: "dis", that: "dat", these: "dese", those: "dose" },
    },
    {
      id: "eth-stop",
      tier: "strong",
      words: {
        they: "dey",
        them: "dem",
        there: "dere",
        then: "den",
        the: "de",
        other: "udder",
        brother: "brudder",
        mother: "mudder",
      },
    },
  ],
  "irish-english": [
    {
      id: "theta-t",
      tier: "balanced",
      words: {
        think: "tink",
        thinking: "tinking",
        thing: "ting",
        things: "tings",
        three: "tree",
        thanks: "tanks",
      },
    },
    {
      id: "theta-t",
      tier: "strong",
      words: {
        something: "someting",
        nothing: "noting",
        anything: "anyting",
        thousand: "tousand",
      },
    },
    {
      id: "eth-d",
      tier: "balanced",
      words: { this: "dis", that: "dat", these: "dese", those: "dose" },
    },
    {
      id: "eth-d",
      tier: "strong",
      words: {
        they: "dey",
        them: "dem",
        there: "dere",
        then: "den",
        other: "oder",
        brother: "broder",
        mother: "moder",
      },
    },
  ],
  "french-influenced-english": [
    {
      id: "theta-s",
      tier: "balanced",
      words: {
        think: "sink",
        thinking: "sinking",
        thing: "sing",
        things: "sings",
        three: "sree",
        thanks: "sanks",
      },
    },
    {
      id: "theta-s",
      tier: "strong",
      words: {
        something: "somesing",
        nothing: "nossing",
        anything: "anysing",
        everything: "everysing",
        thousand: "sousand",
      },
    },
    {
      id: "eth-z",
      tier: "balanced",
      words: { this: "zis", that: "zat", these: "zese", those: "zose" },
    },
    {
      id: "eth-z",
      tier: "strong",
      words: {
        the: "ze",
        they: "zey",
        them: "zem",
        there: "zere",
        then: "zen",
        other: "ozer",
        brother: "brozer",
        mother: "mozer",
        with: "wiz",
      },
    },
    {
      id: "h-drop",
      tier: "strong",
      words: {
        have: "'ave",
        house: "'ouse",
        home: "'ome",
        happy: "'appy",
        here: "'ere",
      },
    },
  ],
  "german-influenced-english": [
    {
      id: "w-labiodental",
      tier: "balanced",
      words: { we: "ve", was: "vas", well: "vell", what: "vat" },
    },
    {
      id: "w-labiodental",
      tier: "strong",
      words: {
        will: "vill",
        want: "vant",
        work: "vork",
        world: "vorld",
        would: "vould",
        when: "ven",
        where: "vere",
        why: "vy",
      },
    },
    {
      id: "theta-s",
      tier: "balanced",
      words: {
        think: "sink",
        thinking: "sinking",
        thing: "sing",
        things: "sings",
        three: "sree",
        thanks: "sanks",
      },
    },
    {
      id: "theta-s",
      tier: "strong",
      words: {
        something: "somesing",
        nothing: "nossing",
        thousand: "sousand",
      },
    },
    {
      id: "eth-z",
      tier: "balanced",
      words: { this: "zis", that: "zat", these: "zese", those: "zose" },
    },
    {
      id: "eth-z",
      tier: "strong",
      words: {
        the: "ze",
        they: "zey",
        them: "zem",
        there: "zere",
        then: "zen",
        other: "ozer",
        with: "viz",
      },
    },
  ],
  "russian-influenced-english": [
    {
      id: "w-labiodental",
      tier: "balanced",
      words: { we: "ve", was: "vas", well: "vell", what: "vat" },
    },
    {
      id: "w-labiodental",
      tier: "strong",
      words: {
        will: "vill",
        want: "vant",
        work: "vork",
        world: "vorld",
        would: "vould",
        when: "ven",
        where: "vere",
        why: "vy",
      },
    },
    {
      id: "theta-s",
      tier: "balanced",
      words: {
        think: "sink",
        thinking: "sinking",
        thing: "sing",
        things: "sings",
        three: "sree",
        thanks: "sanks",
      },
    },
    {
      id: "theta-s",
      tier: "strong",
      words: {
        something: "somesing",
        nothing: "nossing",
        thousand: "sousand",
      },
    },
    {
      id: "eth-z",
      tier: "balanced",
      words: { this: "zis", that: "zat", these: "zese", those: "zose" },
    },
    {
      id: "eth-z",
      tier: "strong",
      words: {
        the: "ze",
        they: "zey",
        them: "zem",
        there: "zere",
        then: "zen",
        other: "ozer",
        with: "viz",
      },
    },
  ],
  "spanish-influenced-english": [
    {
      id: "theta-t",
      tier: "balanced",
      words: {
        think: "tink",
        thinking: "tinking",
        thing: "ting",
        things: "tings",
        three: "tree",
        thanks: "tanks",
      },
    },
    {
      id: "theta-t",
      tier: "strong",
      words: {
        something: "someting",
        nothing: "noting",
        anything: "anyting",
        thousand: "tousand",
      },
    },
    {
      id: "eth-d",
      tier: "balanced",
      words: { this: "dis", that: "dat", these: "dese", those: "dose" },
    },
    {
      id: "eth-d",
      tier: "strong",
      words: {
        they: "dey",
        them: "dem",
        there: "dere",
        then: "den",
        other: "oder",
        brother: "broder",
        mother: "moder",
      },
    },
  ],
  "italian-influenced-english": [
    {
      id: "theta-t",
      tier: "balanced",
      words: {
        think: "tink",
        thinking: "tinking",
        thing: "ting",
        things: "tings",
        three: "tree",
        thanks: "tanks",
      },
    },
    {
      id: "theta-t",
      tier: "strong",
      words: {
        something: "someting",
        nothing: "noting",
        anything: "anyting",
      },
    },
    {
      id: "eth-d",
      tier: "balanced",
      words: { this: "dis", that: "dat", these: "dese", those: "dose" },
    },
    {
      id: "eth-d",
      tier: "strong",
      words: {
        they: "dey",
        them: "dem",
        there: "dere",
        then: "den",
        other: "oder",
        brother: "broder",
        mother: "moder",
      },
    },
  ],
  "indian-english": [
    {
      id: "theta-t",
      tier: "balanced",
      words: {
        think: "tink",
        thinking: "tinking",
        thing: "ting",
        things: "tings",
        three: "tree",
        thanks: "tanks",
      },
    },
    {
      id: "theta-t",
      tier: "strong",
      words: {
        something: "someting",
        nothing: "noting",
        anything: "anyting",
      },
    },
    {
      id: "eth-d",
      tier: "balanced",
      words: { this: "dis", that: "dat", these: "dese", those: "dose" },
    },
    {
      id: "eth-d",
      tier: "strong",
      words: {
        they: "dey",
        them: "dem",
        there: "dere",
        then: "den",
        other: "oder",
      },
    },
    {
      id: "w-labiodental",
      tier: "balanced",
      words: { we: "ve", what: "vat" },
    },
    {
      id: "w-labiodental",
      tier: "strong",
      words: {
        was: "vas",
        well: "vell",
        will: "vill",
        want: "vant",
        when: "ven",
        where: "vere",
        why: "vy",
      },
    },
  ],
};

/** Accents whose Premium cue can also move consonants in the written line. */
export function premiumRespellingIsAvailable(influence: unknown): boolean {
  const normalized = normalizeLocalVoiceSpeechprintInfluence(influence);
  return normalized !== "none" && normalized in PREMIUM_RESPELLING_RULES;
}

export function premiumRespellingRules(
  influence: unknown,
): readonly PremiumRespellingRuleV1[] {
  const normalized = normalizeLocalVoiceSpeechprintInfluence(influence);
  if (normalized === "none") return [];
  return PREMIUM_RESPELLING_RULES[normalized] ?? [];
}

const RESPELLING_WORD_PATTERN = /\p{L}+(?:['’]\p{L}+)*/gu;

function resolveRespellingMap(
  influence: unknown,
  strength: unknown,
): Map<string, { word: string; ruleId: string }> {
  const normalizedStrength = normalizeLocalVoiceSpeechprintStrength(strength);
  const resolved = new Map<string, { word: string; ruleId: string }>();
  if (normalizedStrength === "light") return resolved;
  for (const rule of premiumRespellingRules(influence)) {
    if (rule.tier === "strong" && normalizedStrength !== "strong") continue;
    for (const [source, respelling] of Object.entries(rule.words)) {
      resolved.set(source, { word: respelling, ruleId: rule.id });
    }
  }
  return resolved;
}

function withSourceCapitalization(source: string, respelling: string): string {
  const first = source.slice(0, 1);
  if (first !== first.toLocaleUpperCase() || first === first.toLocaleLowerCase()) {
    return respelling;
  }
  // An apostrophe-initial respelling ("'ave") capitalizes its first letter.
  const letterIndex = respelling.search(/\p{L}/u);
  if (letterIndex < 0) return respelling;
  return (
    respelling.slice(0, letterIndex) +
    respelling.slice(letterIndex, letterIndex + 1).toLocaleUpperCase() +
    respelling.slice(letterIndex + 1)
  );
}

function overlapsProtectedRange(
  start: number,
  end: number,
  ranges: readonly ProtectedSpeechRange[],
): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

/**
 * Rewrite the words this accent spells differently, and nothing else.
 *
 * The returned segments pair every provider character with the source
 * character it stands for, so provider timing projects back onto the written
 * line. `sourceText` joined across the segments is always byte-identical to
 * the input: captions, transcripts, memories, and exports never see this.
 */
export function applyPremiumRespelling(args: {
  text: string;
  influence: unknown;
  strength: unknown;
  protectedPhrases?: readonly string[];
}): PremiumRespellingV1 {
  const respellings = resolveRespellingMap(args.influence, args.strength);
  if (respellings.size === 0 || !args.text) {
    return {
      text: args.text,
      segments: args.text ? [{ providerText: args.text, sourceText: args.text }] : [],
      changed: false,
      appliedRuleIds: [],
    };
  }
  const ranges = protectedSpeechRanges(args.text, args.protectedPhrases);
  const segments: PremiumRespellingSegmentV1[] = [];
  const appliedRuleIds = new Set<string>();
  let cursor = 0;
  let changed = false;
  for (const match of args.text.matchAll(RESPELLING_WORD_PATTERN)) {
    const start = match.index;
    if (start === undefined) continue;
    const word = match[0];
    const end = start + word.length;
    const respelling = respellings.get(word.toLocaleLowerCase());
    if (!respelling) continue;
    if (overlapsProtectedRange(start, end, ranges)) continue;
    if (start > cursor) {
      const gap = args.text.slice(cursor, start);
      segments.push({ providerText: gap, sourceText: gap });
    }
    segments.push({
      providerText: withSourceCapitalization(word, respelling.word),
      sourceText: word,
    });
    appliedRuleIds.add(respelling.ruleId);
    changed = true;
    cursor = end;
  }
  if (cursor < args.text.length) {
    const tail = args.text.slice(cursor);
    segments.push({ providerText: tail, sourceText: tail });
  }
  return {
    text: segments.map((segment) => segment.providerText).join(""),
    segments,
    changed,
    appliedRuleIds: [...appliedRuleIds].sort(),
  };
}
