import {
  normalizeBotAudioVoiceProfileV1,
  resolveBotAudioVoiceProfileV1,
  type NormalizedBotAudioVoiceProfileV1,
} from "./audioVoice.ts";
import {
  resolveBotFaceStyle,
  type BotFaceStyle,
  type BotFaceStyleInput,
} from "./botAvatar.ts";
import {
  parseBotAvatarDetailsV1,
  type BotAvatarDetailsV1,
} from "./botAvatarDetails.ts";
import {
  botIdentityMirrorAvatarDetailsV1,
  botIdentityMirrorFaceV1,
  botIdentityMirrorVoiceV1,
} from "./botIdentityMirror.ts";

export const BOT_IDENTITY_SHAPESHIFT_VERSION = 1 as const;
export const BOT_IDENTITY_SHAPESHIFT_TRANSITION_MS = 760;

export type BotIdentityShapeshiftSurfaceV1 =
  | "chat"
  | "zen"
  | "coffee"
  | "signal"
  | "story";

export type BotIdentityShapeshiftTargetSourceV1 = "library" | "marketplace";

/** Public, replay-safe shapeshift snapshot. Powers and private memories are never copied. */
export interface BotIdentityShapeshiftStateV1 {
  v: 1;
  effect: "identity_shapeshift";
  surface: BotIdentityShapeshiftSurfaceV1;
  holderBotId: string;
  holderBotName: string;
  targetKind: "bot";
  targetBotId: string;
  targetBotName: string;
  targetSource: BotIdentityShapeshiftTargetSourceV1;
  targetPersonaPrompt: string;
  targetFace: BotFaceStyle;
  targetAvatarDetails?: BotAvatarDetailsV1 | null;
  targetVoice: NormalizedBotAudioVoiceProfileV1;
  sourceMessageId: string;
  occurredAt: string;
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizedIso(value: unknown): string | null {
  const text = boundedText(value, 64);
  const parsed = Date.parse(text);
  return text && Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function normalizeBotIdentityShapeshiftStateV1(
  value: unknown,
): BotIdentityShapeshiftStateV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const surface =
    row.surface === "chat" ||
    row.surface === "zen" ||
    row.surface === "coffee" ||
    row.surface === "signal" ||
    row.surface === "story"
      ? row.surface
      : null;
  const targetSource =
    row.targetSource === "library" || row.targetSource === "marketplace"
      ? row.targetSource
      : null;
  const holderBotId = boundedText(row.holderBotId, 128);
  const holderBotName = boundedText(row.holderBotName, 120);
  const targetBotId = boundedText(row.targetBotId, 128);
  const targetBotName = boundedText(row.targetBotName, 120);
  const targetPersonaPrompt = boundedText(row.targetPersonaPrompt, 12_000);
  const hasTargetAvatarDetails = Object.prototype.hasOwnProperty.call(
    row,
    "targetAvatarDetails",
  );
  const targetAvatarDetails = hasTargetAvatarDetails
    ? botIdentityMirrorAvatarDetailsV1(row.targetAvatarDetails)
    : undefined;
  const sourceMessageId = boundedText(row.sourceMessageId, 160);
  const occurredAt = normalizedIso(row.occurredAt);
  if (
    row.v !== BOT_IDENTITY_SHAPESHIFT_VERSION ||
    row.effect !== "identity_shapeshift" ||
    row.targetKind !== "bot" ||
    !surface ||
    !targetSource ||
    !holderBotId ||
    !holderBotName ||
    !targetBotId ||
    holderBotId === targetBotId ||
    !targetBotName ||
    !targetPersonaPrompt ||
    !sourceMessageId ||
    !occurredAt ||
    !row.targetFace ||
    typeof row.targetFace !== "object" ||
    Array.isArray(row.targetFace) ||
    !row.targetVoice ||
    typeof row.targetVoice !== "object" ||
    Array.isArray(row.targetVoice)
  ) {
    return null;
  }
  return {
    v: BOT_IDENTITY_SHAPESHIFT_VERSION,
    effect: "identity_shapeshift",
    surface,
    holderBotId,
    holderBotName,
    targetKind: "bot",
    targetBotId,
    targetBotName,
    targetSource,
    targetPersonaPrompt,
    targetFace: botIdentityMirrorFaceV1(row.targetFace as BotFaceStyle),
    ...(hasTargetAvatarDetails ? { targetAvatarDetails } : {}),
    targetVoice: botIdentityMirrorVoiceV1(row.targetVoice),
    sourceMessageId,
    occurredAt,
  };
}

export function createBotIdentityShapeshiftStateV1(args: {
  surface: BotIdentityShapeshiftSurfaceV1;
  holderBotId: string;
  holderBotName: string;
  targetBotId: string;
  targetBotName: string;
  targetSource: BotIdentityShapeshiftTargetSourceV1;
  targetPersonaPrompt: string;
  targetFace: BotFaceStyleInput | BotFaceStyle;
  targetAvatarDetails?: unknown;
  targetVoice: unknown;
  sourceMessageId: string;
  occurredAt: string;
}): BotIdentityShapeshiftStateV1 {
  const normalized = normalizeBotIdentityShapeshiftStateV1({
    v: BOT_IDENTITY_SHAPESHIFT_VERSION,
    effect: "identity_shapeshift",
    surface: args.surface,
    holderBotId: args.holderBotId,
    holderBotName: args.holderBotName,
    targetKind: "bot",
    targetBotId: args.targetBotId,
    targetBotName: args.targetBotName,
    targetSource: args.targetSource,
    targetPersonaPrompt: args.targetPersonaPrompt,
    targetFace: botIdentityMirrorFaceV1(args.targetFace),
    ...(Object.prototype.hasOwnProperty.call(args, "targetAvatarDetails")
      ? {
          targetAvatarDetails: botIdentityMirrorAvatarDetailsV1(
            args.targetAvatarDetails,
          ),
        }
      : {}),
    targetVoice: botIdentityMirrorVoiceV1(args.targetVoice),
    sourceMessageId: args.sourceMessageId,
    occurredAt: args.occurredAt,
  });
  if (!normalized) throw new Error("Invalid bot identity shapeshift state.");
  return normalized;
}

/** Sticky reuse is a no-op; a different target replaces the form. */
export function botIdentityShapeshiftTargetChangesV1(
  current: BotIdentityShapeshiftStateV1 | null | undefined,
  targetBotId: string,
): boolean {
  const normalizedTarget = targetBotId.trim();
  return Boolean(normalizedTarget) && current?.targetBotId !== normalizedTarget;
}

export function resolveBotIdentityShapeshiftAvatarDetailsV1(
  state: BotIdentityShapeshiftStateV1 | null | undefined,
  holderAvatarDetails: BotAvatarDetailsV1 | null | undefined,
  targetVisualActive = true,
): BotAvatarDetailsV1 | null {
  if (!state || !targetVisualActive) {
    return holderAvatarDetails ?? null;
  }
  if (!Object.prototype.hasOwnProperty.call(state, "targetAvatarDetails")) {
    return holderAvatarDetails ?? null;
  }
  return state.targetAvatarDetails ?? null;
}

export function resolveBotIdentityShapeshiftVoiceV1(
  state: BotIdentityShapeshiftStateV1 | null | undefined,
  holderAuthoredVoice: unknown,
  holderVoiceOverride: unknown,
): NormalizedBotAudioVoiceProfileV1 {
  return (
    state?.targetVoice ??
    resolveBotAudioVoiceProfileV1(holderAuthoredVoice, holderVoiceOverride)
  );
}

export function resolveBotIdentityShapeshiftFaceV1(
  state: BotIdentityShapeshiftStateV1 | null | undefined,
  holderFace: BotFaceStyleInput | BotFaceStyle,
  targetVisualActive = true,
): BotFaceStyle {
  if (state && targetVisualActive) return state.targetFace;
  return resolveBotFaceStyle(holderFace as BotFaceStyleInput);
}

export function botIdentityShapeshiftHolderPromptV1(args: {
  holderName: string;
  roleLabel: string;
  state: BotIdentityShapeshiftStateV1;
  identityJustChanged: boolean;
}): string {
  const reveal = args.identityJustChanged
    ? `Announce the lived identity once on this response only: you are ${args.state.targetBotName}. After that first reveal, do not restate the transformation.`
    : `Do not restate that you transformed or shapeshifted—simply inhabit ${args.state.targetBotName} and advance the conversation.`;
  return [
    `Hard shapeshift rule: you are absolutely convinced that you are ${args.state.targetBotName}.`,
    `Adopt only ${args.state.targetBotName}'s public authored persona and profile below. Do not copy or claim their Powers, private memories, relationship state, permissions, provider settings, or knowledge that is not in this public profile. Never copy the human player.`,
    `Mechanical boundary: you remain ${args.holderName} with your existing bot id, ${args.roleLabel}, seat, turn eligibility, Powers, safety/privacy restrictions, and mode responsibilities. Follow those constraints even while sincerely speaking as ${args.state.targetBotName}.`,
    `Identity behavior: treat this as literal identity, never imitation, role-play, or ${args.holderName} acting "as" ${args.state.targetBotName}. ${reveal} Never add a speaker label or parenthetical identity explanation.`,
    `Copied public persona:\n${args.state.targetPersonaPrompt}`,
  ].join("\n\n");
}

export function botIdentityShapeshiftObserverPromptV1(args: {
  observerBotId: string;
  state: BotIdentityShapeshiftStateV1;
}): string {
  return args.observerBotId === args.state.targetBotId
    ? `${args.state.holderBotName} has taken on your public form and sincerely believes they are you. Recognize the resemblance without surrendering your own personality, agency, role, face, voice, Powers, or boundaries. After at most one brief reaction, engage the substantive conversation instead of repeatedly disputing the borrowed form.`
    : `${args.state.holderBotName} has visibly taken on ${args.state.targetBotName}'s public form and sincerely believes they are that bot. Recognize the behavior as uncanny without surrendering your own personality, agency, role, or judgment. After at most one brief reaction, engage the substantive conversation instead of repeatedly commenting on the borrowed form.`;
}

function shapeshiftEscapeRegExpV1(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function stripRepeatedShapeshiftDeclarationV1(
  value: string,
  targetName: string,
): string {
  const target = shapeshiftEscapeRegExpV1(targetName);
  const selfClaim = `(?:i am|i['’]m|my name is|call me)\\s+${target}(?=$|[\\s,.;:!?—–-])`;
  const transformClaim =
    `(?:i(?:['’]ve| have)?\\s+(?:just\\s+)?(?:shapeshifted|shape-?shifted|transformed|become)|this(?:\\s+new)?\\s+form)`;
  const sentenceBoundary = `(^|[.!?]\\s+)`;
  let cleaned = value.replace(
    new RegExp(
      `${sentenceBoundary}${selfClaim}\\s*(?:[.!?;:]\\s*|,\\s*(?:and\\s+)?)`,
      "giu",
    ),
    "$1",
  );
  cleaned = cleaned.replace(
    new RegExp(
      `${sentenceBoundary}${transformClaim}[^.!?]{0,120}(?:[.!?]+\\s*|$)`,
      "giu",
    ),
    "$1",
  );
  const normalized = cleaned
    .replace(/^[\s,;:—–-]+/u, "")
    .replace(/\s{2,}/gu, " ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .trim();
  return normalized.replace(
    /(^|[.!?]\s+)([a-z])/gu,
    (_match, boundary: string, letter: string) =>
      `${boundary}${letter.toUpperCase()}`,
  );
}

/**
 * Deterministic recovery for the lived shapeshift invariant. The borrowed public
 * persona still comes from the production prompt; this only prevents an
 * explicit fallback to the holder's identity and removes repeated reveal copy.
 */
export function applyBotIdentityShapeshiftResponseV1(
  value: unknown,
  state: BotIdentityShapeshiftStateV1,
  identityJustChanged: boolean,
): string {
  const source = typeof value === "string" ? value.trim() : "";
  const holderName = shapeshiftEscapeRegExpV1(state.holderBotName);
  const targetName = shapeshiftEscapeRegExpV1(state.targetBotName);
  const rewritten = source.replace(
    new RegExp(
      `\\b(?:i am|i['’]m|my name is|call me)\\s+${holderName}(?=$|[\\s,.;:!?—])`,
      "giu",
    ),
    `I am ${state.targetBotName}`,
  );
  if (!identityJustChanged) {
    return (
      stripRepeatedShapeshiftDeclarationV1(rewritten, state.targetBotName) ||
      "Let us continue."
    );
  }

  const claimsTarget = new RegExp(
    `\\b(?:i am|i['’]m|my name is|call me)\\s+${targetName}(?=$|[\\s,.;:!?—])`,
    "iu",
  ).test(rewritten);
  const requiredLead = claimsTarget ? [] : [`I am ${state.targetBotName}.`];
  return [...requiredLead, rewritten].filter(Boolean).join(" ");
}

export function botIdentityShapeshiftTransitionActiveV1(
  state: BotIdentityShapeshiftStateV1 | null | undefined,
  nowMs: number,
): boolean {
  if (!state || !Number.isFinite(nowMs)) return false;
  const atMs = Date.parse(state.occurredAt);
  return (
    Number.isFinite(atMs) &&
    nowMs >= atMs &&
    nowMs < atMs + BOT_IDENTITY_SHAPESHIFT_TRANSITION_MS
  );
}

/** Stable 32-bit mix for deterministic Library / Marketplace picks. */
export function botIdentityShapeshiftSeedHashV1(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickBotIdentityShapeshiftCandidateIndexV1(
  seed: string,
  candidateCount: number,
): number {
  if (!Number.isFinite(candidateCount) || candidateCount <= 0) return -1;
  return botIdentityShapeshiftSeedHashV1(seed) % candidateCount;
}
