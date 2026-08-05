/**
 * Local Action SFX packs — per-bot / per-player Foley that stays off bot export.
 * 7 kinds × 3 variants, generated via ElevenLabs text-to-sound.
 */

export const ACTION_SFX_PACK_VERSION = 1 as const;
export const ACTION_SFX_PACK_VARIANT_COUNT = 3 as const;
export const ACTION_SFX_PACK_PLAYER_OWNER_ID = "player" as const;

export const ACTION_SFX_PACK_KINDS = [
  "fart",
  "burp",
  "cough",
  "laugh",
  "sigh",
  "gasp",
  "throat_clear",
] as const;

export type ActionSfxPackKind = (typeof ACTION_SFX_PACK_KINDS)[number];

export const ACTION_SFX_PACK_KIND_LABELS: Record<ActionSfxPackKind, string> = {
  fart: "Fart",
  burp: "Burp",
  cough: "Cough",
  laugh: "Laugh",
  sigh: "Sigh",
  gasp: "Gasp",
  throat_clear: "Throat clear",
};

export type ActionSfxPackOwnerKind = "bot" | "player";

export const ACTION_SFX_PACK_CLIP_COUNT =
  ACTION_SFX_PACK_KINDS.length * ACTION_SFX_PACK_VARIANT_COUNT;

const BODILY_KINDS = new Set<ActionSfxPackKind>(["fart", "burp", "cough"]);

export function isActionSfxPackKind(value: unknown): value is ActionSfxPackKind {
  return (
    typeof value === "string" &&
    (ACTION_SFX_PACK_KINDS as readonly string[]).includes(value)
  );
}

export function isActionSfxPackBodilyKind(kind: ActionSfxPackKind): boolean {
  return BODILY_KINDS.has(kind);
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

/** Soft audio length targets for ElevenLabs sound-generation. */
export function actionSfxPackDurationSeconds(kind: ActionSfxPackKind): number {
  switch (kind) {
    case "fart":
      return 0.9;
    case "burp":
      return 0.85;
    case "cough":
      return 0.8;
    case "laugh":
      return 1.2;
    case "sigh":
      return 1.1;
    case "gasp":
      return 0.7;
    case "throat_clear":
      return 0.75;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

const KIND_BASE_PROMPTS: Record<ActionSfxPackKind, string> = {
  fart: "A short comic bodily fart, dry close mic, brief natural decay, no words, no music.",
  burp: "A short comic burp, dry close mic, brief natural decay, no words, no music.",
  cough: "A short single cough, dry close mic, brief natural decay, no words, no music.",
  laugh: "A short human laugh, dry close mic, brief natural decay, no words, no music.",
  sigh: "A short human sigh, dry close mic, brief natural decay, no words, no music.",
  gasp: "A short startled human gasp, dry close mic, brief natural decay, no words, no music.",
  throat_clear:
    "A short polite throat clear, dry close mic, brief natural decay, no words, no music.",
};

/**
 * Builds an ElevenLabs sound prompt flavored by owner identity and variant salt.
 */
export function buildActionSfxPackPrompt(args: {
  kind: ActionSfxPackKind;
  variantIndex: number;
  ownerLabel: string;
  personaSnippet?: string | null;
}): string {
  const variant = Math.max(
    0,
    Math.min(ACTION_SFX_PACK_VARIANT_COUNT - 1, Math.floor(args.variantIndex)),
  );
  const owner = args.ownerLabel.replace(/\s+/gu, " ").trim() || "this character";
  const persona = args.personaSnippet?.replace(/\s+/gu, " ").trim() ?? "";
  const base = KIND_BASE_PROMPTS[args.kind];
  const vocalFlavor = isActionSfxPackBodilyKind(args.kind)
    ? `Unique take ${variant + 1} for ${owner}; keep it recognizable as the same gag with a slightly different timing and pitch.`
    : `Sound as if performed by ${owner}${persona ? ` (${persona.slice(0, 120)})` : ""}; unique take ${variant + 1} with matching age, energy, and timbre; never speak words.`;
  return `${base} ${vocalFlavor}`.slice(0, 450);
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
