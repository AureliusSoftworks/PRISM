/**
 * Local Action SFX packs — per-bot / per-player *vocal* Foley that stays off
 * bot export. Generated through the owner's real ElevenLabs Premium voice.
 *
 * Bodily gags (fart / burp / cough) are corporality stock only — never packed.
 */

export const ACTION_SFX_PACK_VERSION = 2 as const;
export const ACTION_SFX_PACK_VARIANT_COUNT = 3 as const;
export const ACTION_SFX_PACK_PLAYER_OWNER_ID = "player" as const;

/** Vocal reaction kinds stored in an Action SFX pack. */
export const ACTION_SFX_PACK_KINDS = [
  "laugh",
  "sigh",
  "gasp",
  "throat_clear",
] as const;

export type ActionSfxPackKind = (typeof ACTION_SFX_PACK_KINDS)[number];

/** @deprecated Alias — packs are vocal-only; prefer ACTION_SFX_PACK_KINDS. */
export const ACTION_SFX_PACK_VOCAL_KINDS = ACTION_SFX_PACK_KINDS;

export const ACTION_SFX_PACK_KIND_LABELS: Record<ActionSfxPackKind, string> = {
  laugh: "Laugh",
  sigh: "Sigh",
  gasp: "Gasp",
  throat_clear: "Throat clear",
};

export type ActionSfxPackOwnerKind = "bot" | "player";

export const ACTION_SFX_PACK_CLIP_COUNT =
  ACTION_SFX_PACK_KINDS.length * ACTION_SFX_PACK_VARIANT_COUNT;

/** Bodily Foley kinds — corporality stock only; never Action SFX pack kinds. */
export const ACTION_SFX_BODILY_KINDS = ["fart", "burp", "cough"] as const;
export type ActionSfxBodilyKind = (typeof ACTION_SFX_BODILY_KINDS)[number];

export function isActionSfxPackKind(value: unknown): value is ActionSfxPackKind {
  return (
    typeof value === "string" &&
    (ACTION_SFX_PACK_KINDS as readonly string[]).includes(value)
  );
}

export function isActionSfxBodilyKind(
  value: unknown,
): value is ActionSfxBodilyKind {
  return (
    typeof value === "string" &&
    (ACTION_SFX_BODILY_KINDS as readonly string[]).includes(value)
  );
}

/** @deprecated Bodily kinds are not pack kinds; always false for pack kinds. */
export function isActionSfxPackBodilyKind(_kind: ActionSfxPackKind): boolean {
  return false;
}

export function actionSfxPackOwnerIdFor(
  ownerKind: ActionSfxPackOwnerKind,
  botId?: string | null,
): string {
  if (ownerKind === "player") return ACTION_SFX_PACK_PLAYER_OWNER_ID;
  const id = botId?.trim() ?? "";
  if (!id) throw new Error("A bot id is required for a bot action SFX pack.");
  return id;
}

const VOCAL_TTS_TAGS: Record<ActionSfxPackKind, readonly [string, string, string]> = {
  laugh: ["[laughs]", "[laughs softly]", "[chuckles]"],
  sigh: ["[sighs]", "[sighs softly]", "[exhales]"],
  gasp: ["[gasps]", "[gasps softly]", "[gasps briefly]"],
  throat_clear: [
    "[clears throat]",
    "[clears throat softly]",
    "[clears throat briefly]",
  ],
};

/** Speakable residue after ElevenLabs strips audio tags — required by the API. */
const VOCAL_TTS_CARRIERS: Record<ActionSfxPackKind, readonly [string, string, string]> = {
  laugh: ["ha", "heh", "hm"],
  sigh: ["ahh", "oh", "mm"],
  gasp: ["ah", "oh", "huh"],
  throat_clear: ["ahem", "hm", "uh"],
};

/**
 * Speakable ElevenLabs v3 audio-tag text for a vocal pack take.
 * The owner's Premium voice identity carries the persona; tags stay short.
 * A tiny carrier syllable is required — ElevenLabs rejects tag-only inputs
 * after stripping speaker/audio tags ("input_text_empty").
 */
export function buildActionSfxPackTtsText(args: {
  kind: ActionSfxPackKind;
  variantIndex: number;
}): string {
  const variant = Math.max(
    0,
    Math.min(ACTION_SFX_PACK_VARIANT_COUNT - 1, Math.floor(args.variantIndex)),
  );
  const tag = VOCAL_TTS_TAGS[args.kind][variant] ?? VOCAL_TTS_TAGS[args.kind][0]!;
  const carrier =
    VOCAL_TTS_CARRIERS[args.kind][variant] ?? VOCAL_TTS_CARRIERS[args.kind][0]!;
  return `${tag} ${carrier}`;
}

/**
 * Stable ElevenLabs seed so regenerating the same owner/kind/take stays close.
 */
export function actionSfxPackTtsSeed(args: {
  ownerId: string;
  kind: ActionSfxPackKind;
  variantIndex: number;
  packGenerationId: string;
}): number {
  const raw = `${args.ownerId}:${args.kind}:${args.variantIndex}:${args.packGenerationId}`;
  let hash = 2166136261;
  for (let offset = 0; offset < raw.length; offset += 1) {
    hash ^= raw.charCodeAt(offset);
    hash = Math.imul(hash, 16777619);
  }
  // ElevenLabs seeds are non-negative 32-bit integers.
  return hash >>> 0;
}

/**
 * @deprecated Sound-gen prompts are retired; use buildActionSfxPackTtsText.
 * Kept as a thin wrapper so older call sites compile during the migration.
 */
export function buildActionSfxPackPrompt(args: {
  kind: ActionSfxPackKind;
  variantIndex: number;
  ownerLabel?: string;
  personaSnippet?: string | null;
}): string {
  return buildActionSfxPackTtsText(args);
}

export interface ActionSfxPackVariantPickState {
  lastVariantByKind: Partial<Record<ActionSfxPackKind, number>>;
}

/**
 * Picks a variant index with anti-repeat bias against the last played take.
 */
export function pickActionSfxPackVariantIndex(args: {
  kind: ActionSfxPackKind;
  state: ActionSfxPackVariantPickState;
  random?: () => number;
}): { variantIndex: number; state: ActionSfxPackVariantPickState } {
  const random = args.random ?? Math.random;
  const last = args.state.lastVariantByKind[args.kind];
  const candidates = Array.from(
    { length: ACTION_SFX_PACK_VARIANT_COUNT },
    (_, index) => index,
  ).filter((index) => index !== last);
  const pool = candidates.length > 0 ? candidates : [0, 1, 2];
  const pick = pool[Math.floor(random() * pool.length)] ?? 0;
  return {
    variantIndex: pick,
    state: {
      lastVariantByKind: {
        ...args.state.lastVariantByKind,
        [args.kind]: pick,
      },
    },
  };
}

export interface ActionSfxPackSummaryV1 {
  v: typeof ACTION_SFX_PACK_VERSION;
  ownerKind: ActionSfxPackOwnerKind;
  ownerId: string;
  packGenerationId: string;
  createdAt: string;
  clipCount: number;
  kinds: ActionSfxPackKind[];
}

export function normalizeActionSfxPackOwnerKind(
  value: unknown,
): ActionSfxPackOwnerKind | null {
  return value === "bot" || value === "player" ? value : null;
}
