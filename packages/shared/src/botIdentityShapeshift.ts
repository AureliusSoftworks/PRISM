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
import {
  BOT_IDENTITY_PRESENTATION_TRANSITION_MS,
  botIdentityPresentationTransitionActiveV1,
  normalizeBotIdentityPresentationSnapshotV1,
  type BotIdentityPresentationSnapshotV1,
} from "./botIdentityPresentation.ts";
import type { BotVoicePreset } from "./botProfile.ts";

export const BOT_IDENTITY_SHAPESHIFT_VERSION = 1 as const;
export const BOT_IDENTITY_SHAPESHIFT_TRANSITION_MS =
  BOT_IDENTITY_PRESENTATION_TRANSITION_MS;

export type BotIdentityShapeshiftSurfaceV1 =
  | "chat"
  | "zen"
  | "coffee"
  | "signal"
  | "story";

export type BotIdentityShapeshiftTargetSourceV1 = "library" | "marketplace";

/** Public, replay-safe shapeshift snapshot. Powers and private memories are never copied. */
export interface BotIdentityShapeshiftStateV1
  extends BotIdentityPresentationSnapshotV1 {
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
  /**
   * The holder's effective voice is frozen for faithful replay. Shapeshifting
   * never replaces this voice identity, provider voice, effect, or non-accent
   * shaping; targetVoice is retained only as the source of the target Accent
   * Map region and pronunciation enablement.
   */
  holderVoice?: NormalizedBotAudioVoiceProfileV1;
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
  const presentation = normalizeBotIdentityPresentationSnapshotV1(row);
  const hasHolderVoice = Object.prototype.hasOwnProperty.call(
    row,
    "holderVoice",
  );
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
    Array.isArray(row.targetVoice) ||
    (hasHolderVoice &&
      (!row.holderVoice ||
        typeof row.holderVoice !== "object" ||
        Array.isArray(row.holderVoice)))
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
    ...(hasHolderVoice
      ? { holderVoice: botIdentityMirrorVoiceV1(row.holderVoice) }
      : {}),
    targetVoice: botIdentityMirrorVoiceV1(row.targetVoice),
    ...presentation,
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
  holderVoice?: unknown;
  targetVoice: unknown;
  targetColor?: string;
  targetGlyph?: string | null;
  targetVoicePreset?: BotVoicePreset;
  targetFrameMaterialSeed?: string;
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
    ...(Object.prototype.hasOwnProperty.call(args, "holderVoice")
      ? { holderVoice: botIdentityMirrorVoiceV1(args.holderVoice) }
      : {}),
    targetVoice: botIdentityMirrorVoiceV1(args.targetVoice),
    ...(args.targetColor ? { targetColor: args.targetColor } : {}),
    ...(Object.prototype.hasOwnProperty.call(args, "targetGlyph")
      ? { targetGlyph: args.targetGlyph }
      : {}),
    ...(args.targetVoicePreset
      ? { targetVoicePreset: args.targetVoicePreset }
      : {}),
    ...(args.targetFrameMaterialSeed
      ? { targetFrameMaterialSeed: args.targetFrameMaterialSeed }
      : {}),
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
  const holderVoice =
    state?.holderVoice ??
    resolveBotAudioVoiceProfileV1(holderAuthoredVoice, holderVoiceOverride);
  return state
    ? applyBotIdentityShapeshiftAccentMapV1(holderVoice, state.targetVoice)
    : holderVoice;
}

/**
 * Shapeshifter keeps the holder's complete audible identity and overlays only
 * the target's Accent Map region plus its per-engine pronunciation choices.
 * A disabled engine therefore bypasses transformed accent pronunciation without replacing any
 * holder timbre, provider, effect, Feel, or other shaping.
 */
export function applyBotIdentityShapeshiftAccentMapV1(
  holderValue: unknown,
  targetValue: unknown,
): NormalizedBotAudioVoiceProfileV1 {
  const holder = normalizeBotAudioVoiceProfileV1(holderValue);
  const target = normalizeBotAudioVoiceProfileV1(targetValue);
  const ttsEnabled = target.ttsPronunciationEnabled === true;
  const premiumEnabled = target.premiumPronunciationEnabled === true;
  const enabled = ttsEnabled || premiumEnabled;
  return normalizeBotAudioVoiceProfileV1({
    ...holder,
    ttsPronunciationEnabled: ttsEnabled,
    premiumPronunciationEnabled: premiumEnabled,
    pronunciationBase: enabled ? target.pronunciationBase : "follow-voice",
    accentDefinitionId: enabled ? (target.accentDefinitionId ?? null) : null,
    pronunciationMapPoint: enabled
      ? (target.pronunciationMapPoint ?? null)
      : null,
    speechprintInfluence: enabled ? target.speechprintInfluence : "none",
    speechprintStrength: enabled
      ? target.speechprintStrength
      : holder.speechprintStrength,
    speechprintVariationSeed: enabled
      ? target.speechprintVariationSeed
      : "natural-v1",
  });
}

export function resolveBotIdentityShapeshiftFaceV1(
  state: BotIdentityShapeshiftStateV1 | null | undefined,
  holderFace: BotFaceStyleInput | BotFaceStyle,
  targetVisualActive = true,
): BotFaceStyle {
  if (state && targetVisualActive) return state.targetFace;
  return resolveBotFaceStyle(holderFace as BotFaceStyleInput);
}

/** The borrowed public name is always visibly framed as a form, not the holder's true name. */
export function botIdentityShapeshiftQuotedTargetNameV1(value: unknown): string {
  let name = boundedText(value, 120).replace(/\s+/gu, " ");
  if (!name) return "";
  while (
    name.length >= 2 &&
    ((name.startsWith('"') && name.endsWith('"')) ||
      (name.startsWith("'") && name.endsWith("'")) ||
      (name.startsWith("“") && name.endsWith("”")))
  ) {
    name = name.slice(1, -1).trim();
  }
  return name ? `"${name}"` : "";
}

export function botIdentityShapeshiftHolderPromptV1(args: {
  holderName: string;
  roleLabel: string;
  state: BotIdentityShapeshiftStateV1;
  identityJustChanged: boolean;
}): string {
  const targetName = botIdentityShapeshiftQuotedTargetNameV1(
    args.state.targetBotName,
  );
  const reveal = args.identityJustChanged
    ? `Announce the lived identity once on this response only: you are ${targetName}. After that first reveal, do not restate the transformation.`
    : `Do not restate that you transformed or shapeshifted—simply inhabit ${targetName} and advance the conversation.`;
  return [
    `Hard shapeshift rule: you are absolutely convinced that you are ${targetName}.`,
    `Adopt only ${targetName}'s public authored persona and profile below. Do not copy or claim their Powers, private memories, relationship state, permissions, provider settings, or knowledge that is not in this public profile. Never copy the human player.`,
    `Mechanical boundary: you remain ${args.holderName} with your existing bot id, ${args.roleLabel}, seat, turn eligibility, Powers, safety/privacy restrictions, and mode responsibilities. Follow those constraints even while sincerely speaking as ${targetName}.`,
    `Identity behavior: treat this as literal identity, never imitation, role-play, or ${args.holderName} acting as ${targetName}. ${reveal} Never add a speaker label or parenthetical identity explanation.`,
    `Copied public persona:\n${args.state.targetPersonaPrompt}`,
  ].join("\n\n");
}

export function botIdentityShapeshiftObserverPromptV1(args: {
  observerBotId: string;
  state: BotIdentityShapeshiftStateV1;
}): string {
  const targetName = botIdentityShapeshiftQuotedTargetNameV1(
    args.state.targetBotName,
  );
  const voiceMismatchCue = `Sometimes, but never by obligation or on every turn, you may briefly notice that the voice still does not sound like ${targetName}. Treat that as an uncanny imperfect match, then follow your own judgment and the substantive conversation.`;
  return args.observerBotId === args.state.targetBotId
    ? `${args.state.holderBotName} has taken on your public form and sincerely believes they are you. Recognize the resemblance without surrendering your own personality, agency, role, face, voice, Powers, or boundaries. ${voiceMismatchCue} After at most one brief reaction, engage the substantive conversation instead of repeatedly disputing the borrowed form.`
    : `${args.state.holderBotName} has visibly taken on ${targetName}'s public form and sincerely believes they are that bot. Recognize the behavior as uncanny without surrendering your own personality, agency, role, or judgment. ${voiceMismatchCue} After at most one brief reaction, engage the substantive conversation instead of repeatedly commenting on the borrowed form.`;
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
      `(?:\\s*[,;]\\s*|\\s+)(?:and|but)\\s+${selfClaim}(?=\\s*[.!?;:]|$)`,
      "giu",
    ),
    "",
  );
  cleaned = cleaned.replace(
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

function quoteShapeshiftTargetDeclarationsV1(
  value: string,
  targetBotName: string,
): string {
  const target = shapeshiftEscapeRegExpV1(targetBotName);
  return value.replace(
    new RegExp(
      `\\b(i am|i['’]m|my name is|call me)(\\s+)${target}(?=$|[\\s,.;:!?—–-])`,
      "giu",
    ),
    (_match, claim: string, spacing: string) =>
      `${claim}${spacing}"${targetBotName}"`,
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
  const quotedTargetName = botIdentityShapeshiftQuotedTargetNameV1(
    state.targetBotName,
  );
  const holderName = shapeshiftEscapeRegExpV1(state.holderBotName);
  const targetName = shapeshiftEscapeRegExpV1(state.targetBotName);
  const rewritten = source.replace(
    new RegExp(
      `\\b(?:i am|i['’]m|my name is|call me)\\s+${holderName}(?=$|[\\s,.;:!?—])`,
      "giu",
    ),
    `I am ${quotedTargetName}`,
  );
  if (!identityJustChanged) {
    return quoteShapeshiftTargetDeclarationsV1(
      stripRepeatedShapeshiftDeclarationV1(rewritten, state.targetBotName) ||
        "Let us continue.",
      state.targetBotName,
    );
  }

  const claimsTarget = new RegExp(
    `\\b(?:i am|i['’]m|my name is|call me)\\s+${targetName}(?=$|[\\s,.;:!?—])`,
    "iu",
  );
  const firstClaim = claimsTarget.exec(rewritten);
  if (!firstClaim) {
    return [`I am ${quotedTargetName}.`, rewritten]
      .filter(Boolean)
      .join(" ");
  }

  const firstClaimEnd = firstClaim.index + firstClaim[0].length;
  const afterFirstClaim = stripRepeatedShapeshiftDeclarationV1(
    rewritten.slice(firstClaimEnd),
    state.targetBotName,
  );
  return quoteShapeshiftTargetDeclarationsV1(
    `${rewritten.slice(0, firstClaimEnd)}${afterFirstClaim}`.trim(),
    state.targetBotName,
  );
}

export function botIdentityShapeshiftTransitionActiveV1(
  state: BotIdentityShapeshiftStateV1 | null | undefined,
  nowMs: number,
): boolean {
  return botIdentityPresentationTransitionActiveV1(state, nowMs);
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
