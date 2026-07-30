import {
  debateEvidenceExhibitTitle,
  type DebateEvidencePacketV1,
  type DebateEvidenceExhibitV1,
} from "@localai/shared";

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

export const DEBATE_EVIDENCE_EMOJI_CHOICES = [
  "📦",
  "🧾",
  "📜",
  "🔑",
  "🕰️",
  "🧭",
  "🔦",
  "📷",
  "🪞",
  "🧸",
  "🧤",
  "👞",
  "💍",
  "🥄",
  "🥔",
  "🚂",
  "🦧",
  "🍎",
  "☂️",
  "🪶",
  "🔨",
  "🕯️",
  "📻",
  "🎫",
] as const;

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

export function debateEvidenceEmojiForObject(
  object: string,
  adjective = "",
): string {
  const normalized = object.toLocaleLowerCase();
  const specific: readonly (readonly [RegExp, string])[] = [
    [/\bspoon\b/u, "🥄"],
    [/\bpotato\b/u, "🥔"],
    [/\btrain\b/u, "🚂"],
    [/\borangutan\b/u, "🦧"],
    [/\b(?:clock|watch|hourglass)\b/u, "🕰️"],
    [/\bkey\b/u, "🔑"],
    [/\b(?:receipt|ticket|letter|diary|notebook|map)\b/u, "🧾"],
    [/\bcamera\b/u, "📷"],
    [/\bflashlight\b/u, "🔦"],
    [/\bcompass\b/u, "🧭"],
    [/\bglove\b/u, "🧤"],
    [/\bshoe\b/u, "👞"],
    [/\bring\b/u, "💍"],
    [/\bapple\b/u, "🍎"],
    [/\bumbrella\b/u, "☂️"],
    [/\bfeather\b/u, "🪶"],
    [/\bhammer\b/u, "🔨"],
    [/\bcandle\b/u, "🕯️"],
    [/\bradio\b/u, "📻"],
  ];
  const matched = specific.find(([pattern]) => pattern.test(normalized));
  if (matched) return matched[1];
  const seed = `${adjective.trim().toLocaleLowerCase()}:${normalized}`;
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
      DEBATE_EXHIBIT_OBJECTS[
        objectOffset % DEBATE_EXHIBIT_OBJECTS.length
      ]!;
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
