import {
  debateEvidenceExhibitTitle,
  type DebateEvidencePacketV1,
  type DebateEvidenceExhibitV1,
} from "@localai/shared";
import {
  DEBATE_EVIDENCE_EMOJI_CATALOG as RAW_DEBATE_EVIDENCE_EMOJI_CATALOG,
  type DebateEvidenceEmojiCatalogEntry,
} from "./debateEvidenceEmojiCatalog.ts";

const DEBATE_EXHIBIT_ADJECTIVES = [
  "Ancient",
  "Bent",
  "Blue",
  "Brass",
  "Broken",
  "Burnt",
  "Chubby",
  "Cold",
  "Cracked",
  "Crimson",
  "Dusty",
  "Electric",
  "Emerald",
  "Faded",
  "Frozen",
  "Golden",
  "Heavy",
  "Hollow",
  "Ivory",
  "Little",
  "Lost",
  "Lucky",
  "Muddy",
  "Old",
  "Orange",
  "Polished",
  "Purple",
  "Red",
  "Rusty",
  "Silver",
  "Soggy",
  "Striped",
  "Tiny",
  "Velvet",
  "Warm",
  "Weathered",
  "Wooden",
  "Worn",
  "Yellow",
] as const;

const DEBATE_EXHIBIT_OBJECTS = [
  "alarm clock",
  "apple",
  "briefcase",
  "button",
  "camera",
  "candle",
  "compass",
  "crowbar",
  "diary",
  "feather",
  "flashlight",
  "freight train",
  "glove",
  "hammer",
  "hat",
  "hourglass",
  "key",
  "lantern",
  "letter",
  "locket",
  "map",
  "marble",
  "mask",
  "matchbook",
  "medal",
  "mug",
  "notebook",
  "orangutan",
  "paintbrush",
  "paper crane",
  "pocket watch",
  "potato",
  "radio",
  "receipt",
  "record",
  "ring",
  "rope",
  "shoe",
  "spoon",
  "suitcase",
  "teacup",
  "ticket",
  "toy rocket",
  "umbrella",
  "wallet",
  "whistle",
] as const;

function dedupeDebateEvidenceEmojiCatalog(
  entries: readonly DebateEvidenceEmojiCatalogEntry[],
): DebateEvidenceEmojiCatalogEntry[] {
  const byEmoji = new Map<string, DebateEvidenceEmojiCatalogEntry>();
  for (const entry of entries) {
    const emoji = entry.emoji.trim();
    if (!emoji || !/\p{Extended_Pictographic}/u.test(emoji)) continue;
    const existing = byEmoji.get(emoji);
    if (!existing) {
      byEmoji.set(emoji, {
        emoji,
        label: entry.label.trim() || emoji,
        keywords: [...entry.keywords],
      });
      continue;
    }
    const keywords = new Set<string>([
      ...existing.keywords,
      ...entry.keywords,
      existing.label,
      entry.label,
    ]);
    byEmoji.set(emoji, {
      emoji,
      label: existing.label,
      keywords: [...keywords].filter(Boolean),
    });
  }
  return [...byEmoji.values()];
}

const DEBATE_EVIDENCE_EMOJI_CATALOG = dedupeDebateEvidenceEmojiCatalog(
  RAW_DEBATE_EVIDENCE_EMOJI_CATALOG,
);

export const DEBATE_EVIDENCE_EMOJI_CHOICES = DEBATE_EVIDENCE_EMOJI_CATALOG.map(
  (entry) => entry.emoji,
) as readonly string[];

export interface DebateEvidenceObjectDraft {
  adjective: string;
  object: string;
  observation: string;
  emoji: string;
  emojiCustomized: boolean;
  createdBy: DebateEvidenceExhibitV1["createdBy"];
  visualKind: DebateEvidenceExhibitV1["visualKind"];
  imageId: string | null;
}

type GraphemeSegment = { segment: string };
type GraphemeSegmenter = {
  segment(input: string): Iterable<GraphemeSegment>;
};
type GraphemeSegmenterConstructor = new (
  locale?: string | string[],
  options?: { granularity?: "grapheme" },
) => GraphemeSegmenter;

function randomIndex(length: number, random: () => number): number {
  return Math.max(0, Math.min(length - 1, Math.floor(random() * length)));
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export interface DebateEvidenceEmojiSearchResult {
  emoji: string;
  label: string;
}

function normalizedEmojiSearchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function softStemToken(value: string): string {
  const token = normalizedEmojiSearchText(value);
  if (token.length <= 4) return token;
  if (token.endsWith("ation") && token.length > 7) {
    return token.slice(0, -5);
  }
  if (token.endsWith("tion") && token.length > 6) {
    return token.slice(0, -4);
  }
  if (token.endsWith("ies") && token.length > 5) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("ing") && token.length > 5) {
    return token.slice(0, -3);
  }
  if (token.endsWith("ers") && token.length > 5) {
    return token.slice(0, -1);
  }
  if (
    (token.endsWith("es") || token.endsWith("ed")) &&
    token.length > 5
  ) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && token.length > 4 && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function phraseMatchesTerm(phrase: string, term: string): boolean {
  if (!phrase || !term || term.length < 2) return false;
  if (phrase === term) return true;
  // Prefer word-ish prefix matches; avoid "glove" ↔ "love" character traps.
  if (phrase.startsWith(term) && term.length >= 3) return true;
  if (term.startsWith(phrase) && phrase.length >= 4) return true;
  if (phrase.includes(` ${term}`) || phrase.includes(`${term} `)) return true;
  const phraseStem = softStemToken(phrase);
  const termStem = softStemToken(term);
  if (!phraseStem || !termStem) return false;
  if (phraseStem === termStem) return true;
  if (phraseStem.startsWith(termStem) || termStem.startsWith(phraseStem)) {
    return Math.min(phraseStem.length, termStem.length) >= 4;
  }
  return false;
}

function queryContainsPhrase(query: string, phrase: string): boolean {
  if (!query || !phrase || phrase.length < 3) return false;
  if (query === phrase) return true;
  return ` ${query} `.includes(` ${phrase} `);
}

export function searchDebateEvidenceEmojis(
  query: string,
  limit = 3,
): DebateEvidenceEmojiSearchResult[] {
  const normalizedQuery = normalizedEmojiSearchText(query);
  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  const queryStem = softStemToken(normalizedQuery);
  const ranked = DEBATE_EVIDENCE_EMOJI_CATALOG.map((entry, index) => {
    const label = normalizedEmojiSearchText(entry.label);
    const keywords = entry.keywords.map(normalizedEmojiSearchText);
    const phrases = [label, ...keywords];
    const labelTokens = label.split(" ").filter(Boolean);
    let score = 0;
    if (normalizedQuery) {
      if (label === normalizedQuery) score += 1_000;
      if (keywords.includes(normalizedQuery)) score += 900;
      if (queryStem && softStemToken(label) === queryStem) score += 850;
      if (keywords.some((keyword) => softStemToken(keyword) === queryStem)) {
        score += 780;
      }
      if (phrases.some((phrase) => queryContainsPhrase(normalizedQuery, phrase))) {
        score += 420;
      }
      for (const term of queryTerms) {
        if (label === term) score += 180;
        if (keywords.includes(term)) score += 150;
        // Prefer the entry's primary meaning when the first keyword matches.
        if (keywords[0] === term) score += 220;
        if (keywords[0] && softStemToken(keywords[0]) === softStemToken(term)) {
          score += 140;
        }
        if (labelTokens[0] === term) score += 200;
        if (phrases.some((phrase) => phraseMatchesTerm(phrase, term))) {
          score += 95;
        }
        if (phrases.some((phrase) => phrase.startsWith(term) && term.length >= 3)) {
          score += 80;
        }
        if (
          phrases.some(
            (phrase) =>
              term.length >= 3 &&
              (phrase === term ||
                phrase.startsWith(`${term} `) ||
                phrase.endsWith(` ${term}`) ||
                phrase.includes(` ${term} `)),
          )
        ) {
          score += 35;
        }
      }
    }
    return { entry, index, score };
  }).sort(
    (left, right) => right.score - left.score || left.index - right.index,
  );

  const matchCount = Math.max(
    1,
    Math.min(limit, DEBATE_EVIDENCE_EMOJI_CATALOG.length),
  );
  const matches = ranked.filter(({ score }) => score > 0).slice(0, matchCount);
  if (matches.length < matchCount) {
    const used = new Set(matches.map(({ entry }) => entry.emoji));
    const fallbackOffset =
      stableHash(normalizedQuery || "debate evidence") %
      DEBATE_EVIDENCE_EMOJI_CATALOG.length;
    for (let step = 0; matches.length < matchCount; step += 1) {
      const candidate =
        ranked[(fallbackOffset + step) % ranked.length] ?? ranked[0];
      if (!candidate || used.has(candidate.entry.emoji)) continue;
      used.add(candidate.entry.emoji);
      matches.push(candidate);
    }
  }
  return matches.map(({ entry }) => ({
    emoji: entry.emoji,
    label: entry.label,
  }));
}

export function debateEvidenceEmojiForObject(
  object: string,
  adjective = "",
): string {
  const matched = searchDebateEvidenceEmojis(`${object} ${adjective}`, 1)[0];
  if (matched) return matched.emoji;
  const seed = `${adjective.trim().toLocaleLowerCase()}:${object
    .trim()
    .toLocaleLowerCase()}`;
  return DEBATE_EVIDENCE_EMOJI_CHOICES[
    stableHash(seed) % DEBATE_EVIDENCE_EMOJI_CHOICES.length
  ]!;
}

export function normalizeDebateEvidenceEmojiChoice(
  value: string,
  fallback = "📦",
): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const Segmenter = (
    Intl as unknown as { Segmenter?: GraphemeSegmenterConstructor }
  ).Segmenter;
  const graphemes = Segmenter
    ? Array.from(
        new Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed),
        (part) => part.segment,
      )
    : Array.from(trimmed);
  return graphemes.at(-1) ?? fallback;
}

export function emptyDebateEvidenceObjectDraft(): DebateEvidenceObjectDraft {
  return {
    adjective: "",
    object: "",
    observation: "",
    emoji: "📦",
    emojiCustomized: false,
    createdBy: "player",
    visualKind: "emoji",
    imageId: null,
  };
}

export function nextDebateEvidenceExhibitId(
  evidence: DebateEvidencePacketV1,
): string {
  const used = new Set([
    ...evidence.sources.map((source) => source.id),
    ...(evidence.exhibits ?? []).map((exhibit) => exhibit.id),
  ]);
  for (let index = 1; index <= 99; index += 1) {
    const id = `exhibit-${index}`;
    if (!used.has(id)) return id;
  }
  return `exhibit-${Date.now().toString(36)}`;
}

export function randomDebateEvidenceObject(
  random: () => number = Math.random,
  rejectedTitles: readonly string[] = [],
): DebateEvidenceObjectDraft {
  const rejected = new Set(
    rejectedTitles.map((title) => title.trim().toLocaleLowerCase()),
  );
  const adjectiveStart = randomIndex(DEBATE_EXHIBIT_ADJECTIVES.length, random);
  const objectStart = randomIndex(DEBATE_EXHIBIT_OBJECTS.length, random);
  let adjective: string = DEBATE_EXHIBIT_ADJECTIVES[adjectiveStart]!;
  let object: string = DEBATE_EXHIBIT_OBJECTS[objectStart]!;
  const combinationCount =
    DEBATE_EXHIBIT_ADJECTIVES.length * DEBATE_EXHIBIT_OBJECTS.length;
  for (let attempt = 0; attempt < combinationCount; attempt += 1) {
    const objectOffset = objectStart + attempt;
    adjective =
      DEBATE_EXHIBIT_ADJECTIVES[
        (adjectiveStart +
          Math.floor(objectOffset / DEBATE_EXHIBIT_OBJECTS.length)) %
          DEBATE_EXHIBIT_ADJECTIVES.length
      ]!;
    object =
      DEBATE_EXHIBIT_OBJECTS[objectOffset % DEBATE_EXHIBIT_OBJECTS.length]!;
    const candidate = debateEvidenceExhibitTitle({ adjective, object });
    if (!rejected.has(candidate.toLocaleLowerCase())) break;
  }
  const title = debateEvidenceExhibitTitle({ adjective, object });
  return {
    adjective,
    object,
    observation: `${title}.`,
    emoji: debateEvidenceEmojiForObject(object, adjective),
    emojiCustomized: false,
    createdBy: "prism",
    visualKind: "emoji",
    imageId: null,
  };
}

export function debateEvidenceObjectFromPrismCandidate(
  candidate: string,
): DebateEvidenceObjectDraft | null {
  const normalized = candidate.replace(/\s+/gu, " ").trim();
  if (
    !/^[\p{L}\p{N}][\p{L}\p{N}'’-]*\s+[\p{L}\p{N}][\p{L}\p{N}'’\-\s]*$/u.test(
      normalized,
    )
  ) {
    return null;
  }
  const [adjectiveRaw = "", ...objectParts] = normalized.split(" ");
  const adjective = adjectiveRaw.trim().slice(0, 48);
  const object = objectParts.join(" ").trim().slice(0, 96).trim();
  if (!adjective || !object) return null;
  const title = debateEvidenceExhibitTitle({ adjective, object });
  return {
    adjective,
    object,
    observation: `${title}.`,
    emoji: debateEvidenceEmojiForObject(object, adjective),
    emojiCustomized: false,
    createdBy: "prism",
    visualKind: "emoji",
    imageId: null,
  };
}

export function debateEvidenceObjectDraftFromPrismCandidate(
  candidate: string,
): DebateEvidenceObjectDraft | null {
  const parts = candidate
    .replace(/\r\n?/gu, "\n")
    .trim()
    .split(/\s*\|\|\s*/u)
    .map((part) => part.replace(/\s+/gu, " ").trim());
  if (parts.length !== 4) return null;
  const [adjectiveRaw = "", objectRaw = "", observationRaw = "", emojiRaw = ""] =
    parts;
  const adjective = adjectiveRaw.slice(0, 48).trim();
  const object = objectRaw.slice(0, 96).trim();
  const observation = observationRaw.slice(0, 800).trim();
  const emoji = normalizeDebateEvidenceEmojiChoice(emojiRaw, "");
  if (
    !/^[\p{L}\p{N}][\p{L}\p{N}'’-]*$/u.test(adjective) ||
    !object ||
    !observation ||
    !/\p{Extended_Pictographic}/u.test(emoji)
  ) {
    return null;
  }
  return {
    adjective,
    object,
    observation,
    emoji,
    emojiCustomized: false,
    createdBy: "prism",
    visualKind: "emoji",
    imageId: null,
  };
}

/** Attach a saved sprite without changing the evidence authored around it. */
export function applyDebateEvidenceExhibitAssetReuse(
  current: DebateEvidenceObjectDraft,
  asset: { id: string },
): DebateEvidenceObjectDraft {
  return {
    ...current,
    visualKind: "synthesized",
    imageId: asset.id,
  };
}

function debateEvidenceObjectDraftHasLockedVisual(
  draft: DebateEvidenceObjectDraft,
): boolean {
  if (!draft.imageId) return false;
  return draft.visualKind === "synthesized" || draft.visualKind === "upload";
}

/**
 * Update adjective/object naming while preserving an attached exhibit sprite
 * (or customized emoji). Auto emoji lookup only runs when there is no locked
 * visual yet.
 */
export function applyDebateEvidenceObjectNameEdit(
  current: DebateEvidenceObjectDraft,
  field: "adjective" | "object",
  value: string,
): DebateEvidenceObjectDraft {
  const previousTitle = debateEvidenceExhibitTitle(current);
  const next = { ...current, [field]: value };
  const nextTitle = debateEvidenceExhibitTitle(next);
  const hasLockedVisual = debateEvidenceObjectDraftHasLockedVisual(current);
  return {
    ...next,
    observation:
      !current.observation.trim() ||
      current.observation.trim() === `${previousTitle}.`
        ? nextTitle
          ? `${nextTitle}.`
          : ""
        : current.observation,
    emoji:
      current.emojiCustomized || hasLockedVisual
        ? current.emoji
        : debateEvidenceEmojiForObject(next.object, next.adjective),
    visualKind: hasLockedVisual ? current.visualKind : "emoji",
    imageId: hasLockedVisual ? current.imageId : null,
  };
}

/** Reopen a saved exhibit into the Evidence composer for in-place edits. */
export function debateEvidenceObjectDraftFromExhibit(
  exhibit: DebateEvidenceExhibitV1,
): DebateEvidenceObjectDraft {
  return {
    adjective: exhibit.adjective,
    object: exhibit.object,
    observation: exhibit.observation,
    emoji: exhibit.emoji,
    emojiCustomized: true,
    createdBy: exhibit.createdBy,
    visualKind: exhibit.visualKind,
    imageId: exhibit.imageId,
  };
}

/** Replace one exhibit by id while preserving packet order and other items. */
export function replaceDebateEvidenceExhibit(
  evidence: DebateEvidencePacketV1,
  exhibitId: string,
  next: DebateEvidenceExhibitV1,
): DebateEvidencePacketV1 {
  const exhibits = (evidence.exhibits ?? []).map((exhibit) =>
    exhibit.id === exhibitId ? { ...next, id: exhibitId } : exhibit,
  );
  return { ...evidence, exhibits };
}
