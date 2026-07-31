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

interface DebateEvidenceEmojiCatalogEntry {
  emoji: string;
  label: string;
  keywords: readonly string[];
}

export interface DebateEvidenceEmojiSearchResult {
  emoji: string;
  label: string;
}

const DEBATE_EVIDENCE_EMOJI_CATALOG: readonly DebateEvidenceEmojiCatalogEntry[] =
  [
    { emoji: "📦", label: "box", keywords: ["package", "container", "object"] },
    {
      emoji: "🧾",
      label: "receipt",
      keywords: ["invoice", "proof", "evidence"],
    },
    { emoji: "📜", label: "scroll", keywords: ["history", "law", "decree"] },
    { emoji: "🔑", label: "key", keywords: ["access", "lock", "unlock"] },
    { emoji: "⏰", label: "alarm clock", keywords: ["alarm", "time", "clock"] },
    { emoji: "🕰️", label: "watch", keywords: ["clock", "time", "hourglass"] },
    { emoji: "🧭", label: "compass", keywords: ["direction", "navigation"] },
    { emoji: "🔦", label: "flashlight", keywords: ["torch", "light"] },
    {
      emoji: "📷",
      label: "camera",
      keywords: ["photo", "photograph", "picture"],
    },
    { emoji: "🪞", label: "mirror", keywords: ["reflection", "glass"] },
    { emoji: "🧸", label: "toy", keywords: ["teddy", "childhood", "plush"] },
    { emoji: "🧤", label: "glove", keywords: ["hand", "mitten"] },
    { emoji: "✋", label: "hand", keywords: ["glove", "palm", "stop"] },
    {
      emoji: "🥊",
      label: "boxing glove",
      keywords: ["glove", "punch", "sport"],
    },
    { emoji: "👞", label: "shoe", keywords: ["boot", "footwear"] },
    { emoji: "💍", label: "ring", keywords: ["jewelry", "locket", "wedding"] },
    { emoji: "🥄", label: "spoon", keywords: ["utensil", "silverware"] },
    { emoji: "🥔", label: "potato", keywords: ["vegetable", "food"] },
    {
      emoji: "🚂",
      label: "train",
      keywords: ["rail", "transit", "transportation"],
    },
    { emoji: "🦧", label: "orangutan", keywords: ["ape", "animal", "primate"] },
    { emoji: "🍎", label: "apple", keywords: ["fruit", "food"] },
    { emoji: "☂️", label: "umbrella", keywords: ["rain", "weather"] },
    { emoji: "🪶", label: "feather", keywords: ["bird", "quill"] },
    {
      emoji: "🔨",
      label: "hammer",
      keywords: ["tool", "build", "construction"],
    },
    { emoji: "🕯️", label: "candle", keywords: ["flame", "light", "wax"] },
    { emoji: "📻", label: "radio", keywords: ["broadcast", "audio", "news"] },
    {
      emoji: "🎫",
      label: "ticket",
      keywords: ["admission", "pass", "receipt"],
    },
    { emoji: "✉️", label: "letter", keywords: ["mail", "envelope", "message"] },
    { emoji: "📓", label: "notebook", keywords: ["diary", "journal", "notes"] },
    { emoji: "🗺️", label: "map", keywords: ["route", "geography", "transit"] },
    {
      emoji: "💼",
      label: "briefcase",
      keywords: ["suitcase", "luggage", "work"],
    },
    { emoji: "🔘", label: "button", keywords: ["switch", "control"] },
    { emoji: "🔧", label: "crowbar", keywords: ["wrench", "tool", "pry"] },
    { emoji: "🎩", label: "hat", keywords: ["cap", "clothing"] },
    { emoji: "🏮", label: "lantern", keywords: ["lamp", "light"] },
    { emoji: "🔵", label: "marble", keywords: ["ball", "blue", "round"] },
    {
      emoji: "🎭",
      label: "mask",
      keywords: ["theater", "disguise", "persona"],
    },
    { emoji: "🔥", label: "matchbook", keywords: ["fire", "burn", "flame"] },
    { emoji: "🏅", label: "medal", keywords: ["award", "prize", "honor"] },
    { emoji: "☕", label: "mug", keywords: ["teacup", "coffee", "drink"] },
    { emoji: "🖌️", label: "paintbrush", keywords: ["brush", "paint", "art"] },
    { emoji: "🐦", label: "paper crane", keywords: ["origami", "bird"] },
    { emoji: "💿", label: "record", keywords: ["album", "disc", "music"] },
    { emoji: "🪢", label: "rope", keywords: ["knot", "cord"] },
    { emoji: "🚀", label: "rocket", keywords: ["space", "toy", "launch"] },
    { emoji: "👛", label: "wallet", keywords: ["purse", "money"] },
    {
      emoji: "📣",
      label: "whistle",
      keywords: ["megaphone", "sound", "warning"],
    },
    { emoji: "⚖️", label: "scales", keywords: ["law", "justice", "balance"] },
    { emoji: "🏛️", label: "institution", keywords: ["government", "court"] },
    {
      emoji: "💡",
      label: "idea",
      keywords: ["insight", "innovation", "light"],
    },
    { emoji: "🔬", label: "microscope", keywords: ["science", "research"] },
    {
      emoji: "🧪",
      label: "experiment",
      keywords: ["chemistry", "science", "test"],
    },
    { emoji: "📊", label: "chart", keywords: ["data", "statistics", "graph"] },
    { emoji: "💰", label: "money", keywords: ["finance", "wealth", "economy"] },
    { emoji: "🏠", label: "house", keywords: ["home", "housing", "property"] },
    { emoji: "🚗", label: "car", keywords: ["vehicle", "transportation"] },
    { emoji: "🚌", label: "bus", keywords: ["transit", "transportation"] },
    { emoji: "✈️", label: "plane", keywords: ["travel", "flight", "airplane"] },
    { emoji: "🌎", label: "earth", keywords: ["world", "climate", "planet"] },
    {
      emoji: "🌱",
      label: "plant",
      keywords: ["environment", "growth", "nature"],
    },
    {
      emoji: "🧠",
      label: "brain",
      keywords: ["mind", "psychology", "thought"],
    },
    {
      emoji: "🩺",
      label: "medicine",
      keywords: ["health", "doctor", "medical"],
    },
    { emoji: "💻", label: "computer", keywords: ["technology", "software"] },
    { emoji: "🔒", label: "lock", keywords: ["security", "privacy", "safe"] },
    { emoji: "⚠️", label: "warning", keywords: ["risk", "danger", "caution"] },
  ];

function normalizedEmojiSearchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function searchDebateEvidenceEmojis(
  query: string,
  limit = 3,
): DebateEvidenceEmojiSearchResult[] {
  const normalizedQuery = normalizedEmojiSearchText(query);
  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  const ranked = DEBATE_EVIDENCE_EMOJI_CATALOG.map((entry, index) => {
    const label = normalizedEmojiSearchText(entry.label);
    const keywords = entry.keywords.map(normalizedEmojiSearchText);
    const phrases = [label, ...keywords];
    let score = 0;
    if (normalizedQuery) {
      if (label === normalizedQuery) score += 1_000;
      if (keywords.includes(normalizedQuery)) score += 900;
      if (phrases.some((phrase) => normalizedQuery.includes(phrase))) {
        score += 420;
      }
      for (const term of queryTerms) {
        if (label === term) score += 180;
        if (keywords.includes(term)) score += 150;
        if (phrases.some((phrase) => phrase.startsWith(term))) score += 80;
        if (phrases.some((phrase) => phrase.includes(term))) score += 35;
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
