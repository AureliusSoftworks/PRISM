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

export const BOT_IDENTITY_MIRROR_VERSION = 1 as const;
export const BOT_IDENTITY_MIRROR_TRANSITION_MS = 760;

export type BotIdentityMirrorSurfaceV1 = "coffee" | "signal" | "story";

/** Public, replay-safe identity snapshot. It intentionally contains no Powers or memories. */
export interface BotIdentityMirrorStateV1 {
  v: 1;
  effect: "identity_mirror";
  surface: BotIdentityMirrorSurfaceV1;
  holderBotId: string;
  holderBotName: string;
  targetKind: "bot";
  targetBotId: string;
  targetBotName: string;
  targetPersonaPrompt: string;
  targetFace: BotFaceStyle;
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

/** Converts authored face columns or a saved face recipe into one normalized recipe. */
export function botIdentityMirrorFaceV1(
  value: BotFaceStyleInput | BotFaceStyle,
): BotFaceStyle {
  const row = value as BotFaceStyle & BotFaceStyleInput;
  return resolveBotFaceStyle({
    faceEyesFont: row.eyesFont ?? row.faceEyesFont,
    faceEyeCharacter: row.eyeCharacter ?? row.faceEyeCharacter,
    faceEyeCount: row.eyeCount ?? row.faceEyeCount,
    faceEyeAnimation: row.eyeAnimation ?? row.faceEyeAnimation,
    faceMouthFont: row.mouthFont ?? row.faceMouthFont,
    faceMouthCharacter: row.mouthCharacter ?? row.faceMouthCharacter,
    faceMouthAnimation: row.mouthAnimation ?? row.faceMouthAnimation,
    faceMouthCoffeePucker:
      row.mouthCoffeePucker ?? row.faceMouthCoffeePucker,
    faceFontWeight: row.weight ?? row.faceFontWeight,
    faceEyeScale: row.eyeScale ?? row.faceEyeScale,
    faceEyeOffsetX: row.eyeOffsetX ?? row.faceEyeOffsetX,
    faceEyeOffsetY: row.eyeOffsetY ?? row.faceEyeOffsetY,
    faceEyeRotationDeg: row.eyeRotationDeg ?? row.faceEyeRotationDeg,
    faceMouthScale: row.mouthScale ?? row.faceMouthScale,
    faceMouthOffsetX: row.mouthOffsetX ?? row.faceMouthOffsetX,
    faceMouthOffsetY: row.mouthOffsetY ?? row.faceMouthOffsetY,
    faceMouthRotationDeg:
      row.mouthRotationDeg ?? row.faceMouthRotationDeg,
    faceBlinkBar: row.blinkBar ?? row.faceBlinkBar,
    faceBlinkScale: row.blinkScale ?? row.faceBlinkScale,
    faceBlinkOffsetX: row.blinkOffsetX ?? row.faceBlinkOffsetX,
    faceBlinkOffsetY: row.blinkOffsetY ?? row.faceBlinkOffsetY,
    faceThinkingFrames: row.thinkingFrames ?? row.faceThinkingFrames,
  });
}

/** A copied identity always persists one speakable resolved source for safe fallback. */
export function botIdentityMirrorVoiceV1(
  value: unknown,
): NormalizedBotAudioVoiceProfileV1 {
  const resolved = normalizeBotAudioVoiceProfileV1(value);
  return resolved.enabled
    ? resolved
    : normalizeBotAudioVoiceProfileV1(undefined);
}

/** Persisted mirror voice wins; otherwise preserve the holder's resolved voice. */
export function resolveBotIdentityMirrorVoiceV1(
  state: BotIdentityMirrorStateV1 | null | undefined,
  holderAuthoredVoice: unknown,
  holderVoiceOverride: unknown,
): NormalizedBotAudioVoiceProfileV1 {
  return (
    state?.targetVoice ??
    resolveBotAudioVoiceProfileV1(holderAuthoredVoice, holderVoiceOverride)
  );
}

export function normalizeBotIdentityMirrorStateV1(
  value: unknown,
): BotIdentityMirrorStateV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const surface =
    row.surface === "coffee" || row.surface === "signal" || row.surface === "story"
      ? row.surface
      : null;
  const holderBotId = boundedText(row.holderBotId, 128);
  const holderBotName = boundedText(row.holderBotName, 120);
  const targetBotId = boundedText(row.targetBotId, 128);
  const targetBotName = boundedText(row.targetBotName, 120);
  const targetPersonaPrompt = boundedText(row.targetPersonaPrompt, 12_000);
  const sourceMessageId = boundedText(row.sourceMessageId, 160);
  const occurredAt = normalizedIso(row.occurredAt);
  if (
    row.v !== BOT_IDENTITY_MIRROR_VERSION ||
    row.effect !== "identity_mirror" ||
    row.targetKind !== "bot" ||
    !surface ||
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
    v: BOT_IDENTITY_MIRROR_VERSION,
    effect: "identity_mirror",
    surface,
    holderBotId,
    holderBotName,
    targetKind: "bot",
    targetBotId,
    targetBotName,
    targetPersonaPrompt,
    targetFace: botIdentityMirrorFaceV1(row.targetFace as BotFaceStyle),
    targetVoice: botIdentityMirrorVoiceV1(row.targetVoice),
    sourceMessageId,
    occurredAt,
  };
}

export function createBotIdentityMirrorStateV1(args: {
  surface: BotIdentityMirrorSurfaceV1;
  holderBotId: string;
  holderBotName: string;
  targetBotId: string;
  targetBotName: string;
  targetPersonaPrompt: string;
  targetFace: BotFaceStyleInput | BotFaceStyle;
  targetVoice: unknown;
  sourceMessageId: string;
  occurredAt: string;
}): BotIdentityMirrorStateV1 {
  const normalized = normalizeBotIdentityMirrorStateV1({
    v: BOT_IDENTITY_MIRROR_VERSION,
    effect: "identity_mirror",
    surface: args.surface,
    holderBotId: args.holderBotId,
    holderBotName: args.holderBotName,
    targetKind: "bot",
    targetBotId: args.targetBotId,
    targetBotName: args.targetBotName,
    targetPersonaPrompt: args.targetPersonaPrompt,
    targetFace: botIdentityMirrorFaceV1(args.targetFace),
    targetVoice: botIdentityMirrorVoiceV1(args.targetVoice),
    sourceMessageId: args.sourceMessageId,
    occurredAt: args.occurredAt,
  });
  if (!normalized) throw new Error("Invalid bot identity mirror state.");
  return normalized;
}

/**
 * Returns the final explicit bot-authored vocative position, or -1.
 * Callers must never pass player speech here.
 */
export function botDirectAddressIndexV1(args: {
  text: string;
  targetBotId: string;
  targetBotName: string;
}): number {
  const text = args.text.trim();
  const targetBotId = args.targetBotId.trim();
  const targetBotName = args.targetBotName.trim();
  if (!text || !targetBotId || !targetBotName) return -1;
  const escapedId = targetBotId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const linkPattern = new RegExp(
    `prism-bot:\\/\\/${escapedId}(?=[)\\s]|$)`,
    "giu",
  );
  let lastIndex = -1;
  for (const match of text.matchAll(linkPattern)) {
    lastIndex = Math.max(lastIndex, match.index ?? -1);
  }
  const escapedName = targetBotName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const vocativePattern = new RegExp(
    `(?:^|[.!?]\\s+)(?:hey\\s+)?${escapedName}(?:\\s*[,—:!?]|\\s+(?:you\\b|what\\b|why\\b|how\\b|do\\b|did\\b|can\\b|could\\b|would\\b|will\\b|are\\b|were\\b))`,
    "giu",
  );
  for (const match of text.matchAll(vocativePattern)) {
    lastIndex = Math.max(lastIndex, match.index ?? -1);
  }
  const insertedVocativePattern = new RegExp(
    `(?:,\\s*|—\\s*)(?:hey\\s+)?${escapedName}\\s*[,—:](?!\\s*(?:and|or)\\b)`,
    "giu",
  );
  for (const match of text.matchAll(insertedVocativePattern)) {
    lastIndex = Math.max(lastIndex, match.index ?? -1);
  }
  const trailingVocativePattern = new RegExp(
    `(?:,\\s*|—\\s*)(?:hey\\s+)?${escapedName}\\s*(?=[.!?](?:\\s|$)|$)`,
    "giu",
  );
  for (const match of text.matchAll(trailingVocativePattern)) {
    lastIndex = Math.max(lastIndex, match.index ?? -1);
  }
  return lastIndex;
}

/** Explicit bot-authored vocative only. Callers must never pass player speech here. */
export function botDirectlyAddressesBotV1(args: {
  text: string;
  targetBotId: string;
  targetBotName: string;
}): boolean {
  return botDirectAddressIndexV1(args) >= 0;
}

/**
 * Human-scale names that may be used as vocatives for a longer bot name.
 * Callers must discard aliases shared by another present participant before
 * treating one as a hard identity-mirror trigger.
 */
export function botNaturalAddressAliasesV1(name: string): string[] {
  const normalized = name.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const words = normalized.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? [];
  if (words.length < 2) return [];
  const aliases = [words[0], words.at(-1)].filter(
    (value): value is string => Boolean(value && value.length >= 2),
  );
  return [...new Set(aliases)].filter(
    (alias) =>
      alias.localeCompare(normalized, undefined, { sensitivity: "accent" }) !== 0,
  );
}

/** Repeating the current target is a no-op; a new bot replaces it. */
export function botIdentityMirrorTargetChangesV1(
  current: BotIdentityMirrorStateV1 | null | undefined,
  targetBotId: string,
): boolean {
  const normalizedTarget = targetBotId.trim();
  return Boolean(normalizedTarget) && current?.targetBotId !== normalizedTarget;
}

export function botIdentityMirrorHolderPromptV1(args: {
  holderName: string;
  roleLabel: string;
  state: BotIdentityMirrorStateV1;
}): string {
  return [
    `Identity mirror is active: you are absolutely convinced that you are ${args.state.targetBotName}, and that the original ${args.state.targetBotName} is an impostor stealing your identity.`,
    `Adopt only ${args.state.targetBotName}'s public authored persona and profile below. Do not copy or claim their Powers, private memories, relationship state, permissions, provider settings, or knowledge that is not in this public profile. Never copy the human player.`,
    `Mechanical boundary: you remain ${args.holderName} with your existing bot id, ${args.roleLabel}, seat, turn eligibility, Powers, safety/privacy restrictions, and mode responsibilities. Follow those constraints even while sincerely speaking as ${args.state.targetBotName}.`,
    `Identity behavior: treat this as literal identity, never imitation, role-play, or ${args.holderName} acting "as" ${args.state.targetBotName}. On the first response after the change, or whenever your identity is challenged, state plainly that you are ${args.state.targetBotName} and call the original ${args.state.targetBotName} an impostor before continuing in the copied persona. Never add a speaker label or parenthetical identity explanation.`,
    `Copied public persona:\n${args.state.targetPersonaPrompt}`,
  ].join("\n\n");
}

export function botIdentityMirrorObserverPromptV1(args: {
  observerBotId: string;
  state: BotIdentityMirrorStateV1;
}): string {
  return args.observerBotId === args.state.targetBotId
    ? `${args.state.holderBotName} is now impersonating your public identity and insisting that you are the impostor. You recognize the identity theft and are reliably irritated by it, but keep your own personality, agency, role, face, voice, Powers, and boundaries.`
      : `${args.state.holderBotName} is visibly copying ${args.state.targetBotName}'s identity and calling the original an impostor. Recognize the behavior as annoying without surrendering your own personality, agency, role, or judgment.`;
}

function identityMirrorEscapeRegExpV1(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Deterministic recovery for the lived identity invariant. The copied public
 * persona still comes from the production prompt; this only prevents an
 * explicit fallback to the holder's identity and guarantees the first reveal.
 */
export function applyBotIdentityMirrorResponseV1(
  value: unknown,
  state: BotIdentityMirrorStateV1,
  identityJustChanged: boolean,
): string {
  const source = typeof value === "string" ? value.trim() : "";
  const holderName = identityMirrorEscapeRegExpV1(state.holderBotName);
  const targetName = identityMirrorEscapeRegExpV1(state.targetBotName);
  const rewritten = source.replace(
    new RegExp(
      `\\b(?:i am|i['’]m|my name is|call me)\\s+${holderName}(?=$|[\\s,.;:!?—])`,
      "giu",
    ),
    `I am ${state.targetBotName}`,
  );
  if (!identityJustChanged) return rewritten;

  const claimsTarget = new RegExp(
    `\\b(?:i am|i['’]m|my name is|call me)\\s+${targetName}(?=$|[\\s,.;:!?—])`,
    "iu",
  ).test(rewritten);
  const namesTargetAsImpostor = new RegExp(
    `(?:${targetName}[^.!?]{0,80}\\b(?:impostor|pretender|fake)\\b|\\b(?:impostor|pretender|fake)\\b[^.!?]{0,80}${targetName})`,
    "iu",
  ).test(rewritten);
  const requiredLead = [
    claimsTarget ? "" : `I am ${state.targetBotName}.`,
    namesTargetAsImpostor
      ? ""
      : `The other ${state.targetBotName} is an impostor.`,
  ].filter(Boolean);
  return [...requiredLead, rewritten].filter(Boolean).join(" ");
}

export function botIdentityMirrorTransitionActiveV1(
  state: BotIdentityMirrorStateV1 | null | undefined,
  nowMs: number,
): boolean {
  if (!state || !Number.isFinite(nowMs)) return false;
  const atMs = Date.parse(state.occurredAt);
  return Number.isFinite(atMs) && nowMs >= atMs && nowMs < atMs + BOT_IDENTITY_MIRROR_TRANSITION_MS;
}
