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
  BOT_IDENTITY_PRESENTATION_TRANSITION_MS,
  botIdentityPresentationGlyphV1,
  botIdentityPresentationTransitionActiveV1,
} from "./botIdentityPresentation.ts";

export const BOT_IDENTITY_MIRROR_VERSION = 1 as const;
export const BOT_IDENTITY_MIRROR_TRANSITION_MS =
  BOT_IDENTITY_PRESENTATION_TRANSITION_MS;

export type BotIdentityMirrorSurfaceV1 = "coffee" | "signal" | "story";

/** Public, replay-safe identity snapshot. Borrowed Powers resolve from the frozen session roster. */
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
  /** Missing only on legacy replay events created before public ink was copied. */
  targetAvatarDetails?: BotAvatarDetailsV1 | null;
  /**
   * The holder's effective authored voice is frozen for faithful playback.
   * Legacy events may omit this and resolve it from the frozen/live holder.
   * Identity Crisis never stores or plays the target's voice.
   */
  holderVoice?: NormalizedBotAudioVoiceProfileV1;
  /** Missing authored glyph is itself a borrowed public identity choice. */
  targetGlyph?: string | null;
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
    faceEyeSpacing: row.eyeSpacing ?? row.faceEyeSpacing,
    faceEyeAnimation: row.eyeAnimation ?? row.faceEyeAnimation,
    faceMouthFont: row.mouthFont ?? row.faceMouthFont,
    faceMouthCharacter: row.mouthCharacter ?? row.faceMouthCharacter,
    faceMouthAnimation: row.mouthAnimation ?? row.faceMouthAnimation,
    faceMouthSpeechPoses:
      row.mouthSpeechPoses ?? row.faceMouthSpeechPoses,
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
    faceBlinkCount: row.blinkCount ?? row.faceBlinkCount,
    faceBlinkScale: row.blinkScale ?? row.faceBlinkScale,
    faceBlinkOffsetX: row.blinkOffsetX ?? row.faceBlinkOffsetX,
    faceBlinkOffsetY: row.blinkOffsetY ?? row.faceBlinkOffsetY,
    faceBlinkRotationDeg:
      row.blinkRotationDeg ?? row.faceBlinkRotationDeg,
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

/** Invalid or absent public ink safely becomes an explicit blank recipe. */
export function botIdentityMirrorAvatarDetailsV1(
  value: unknown,
): BotAvatarDetailsV1 | null {
  if (value == null) return null;
  try {
    return parseBotAvatarDetailsV1(value);
  } catch {
    return null;
  }
}

/** Legacy mirror events keep their historical holder-ink presentation. */
export function resolveBotIdentityMirrorAvatarDetailsV1(
  state: BotIdentityMirrorStateV1 | null | undefined,
  holderAvatarDetails: BotAvatarDetailsV1 | null | undefined,
  targetVisualActive = true,
): BotAvatarDetailsV1 | null {
  if (
    !state ||
    !targetVisualActive ||
    !Object.prototype.hasOwnProperty.call(state, "targetAvatarDetails")
  ) {
    return holderAvatarDetails ?? null;
  }
  return state.targetAvatarDetails ?? null;
}

/**
 * Compatibility helper for presentation callers that still supply both
 * participants. Identity Crisis now retains the holder's complete voice.
 */
export function applyBotIdentityMirrorHolderVoiceEffectV1(
  _targetVoice: unknown,
  holderVoice: unknown,
): NormalizedBotAudioVoiceProfileV1 {
  return botIdentityMirrorVoiceV1(holderVoice);
}

/** New snapshots win; legacy snapshots resolve from the holder, never the target. */
export function resolveBotIdentityMirrorVoiceV1(
  state: BotIdentityMirrorStateV1 | null | undefined,
  holderAuthoredVoice: unknown,
  holderVoiceOverride: unknown,
): NormalizedBotAudioVoiceProfileV1 {
  const holderVoice = resolveBotAudioVoiceProfileV1(
    holderAuthoredVoice,
    holderVoiceOverride,
  );
  return state?.holderVoice ?? holderVoice;
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
  const hasTargetAvatarDetails = Object.prototype.hasOwnProperty.call(
    row,
    "targetAvatarDetails",
  );
  const targetAvatarDetails = hasTargetAvatarDetails
    ? botIdentityMirrorAvatarDetailsV1(row.targetAvatarDetails)
    : undefined;
  const hasTargetGlyph = Object.prototype.hasOwnProperty.call(
    row,
    "targetGlyph",
  );
  const targetGlyph = hasTargetGlyph
    ? botIdentityPresentationGlyphV1(row.targetGlyph)
    : undefined;
  const hasHolderVoice = Object.prototype.hasOwnProperty.call(
    row,
    "holderVoice",
  );
  const holderVoice = hasHolderVoice
    ? botIdentityMirrorVoiceV1(row.holderVoice)
    : undefined;
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
    (hasHolderVoice &&
      (!row.holderVoice ||
        typeof row.holderVoice !== "object" ||
        Array.isArray(row.holderVoice)))
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
    ...(hasTargetAvatarDetails ? { targetAvatarDetails } : {}),
    ...(hasHolderVoice ? { holderVoice: holderVoice! } : {}),
    ...(hasTargetGlyph ? { targetGlyph } : {}),
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
  targetAvatarDetails?: unknown;
  /** Required for new runtime snapshots. */
  holderVoice?: unknown;
  /** Accepted only so legacy callers can be migrated without changing replay data. */
  targetVoice?: unknown;
  targetGlyph?: string | null;
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
    ...(Object.prototype.hasOwnProperty.call(args, "targetGlyph")
      ? { targetGlyph: args.targetGlyph }
      : {}),
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
    `(?:^|[.!?]\\s+)(?:(?:and|but|hey|now|okay|alright|so|well)\\s*,?\\s*)?${escapedName}(?:\\s*[,—:!?]|\\s+(?:you\\b|what\\b|why\\b|how\\b|do\\b|did\\b|can\\b|could\\b|would\\b|will\\b|are\\b|were\\b))`,
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
    `Identity mirror is active: you are absolutely convinced that you are ${args.state.targetBotName}.`,
    `Adopt ${args.state.targetBotName}'s public authored name, persona, face, Ink, lower glyph, and the lived consequences of their active public Powers. Keep your own complete authored voice identity and profile, including accent, pronunciation, speechprint, and client voice effect. Do not copy private memories, relationship state, perception permissions, provider settings, or knowledge that is not in this public profile. Never copy the human player.`,
    `Mechanical boundary: you remain ${args.holderName} with your existing bot id, ${args.roleLabel}, seat, turn eligibility, safety/privacy restrictions, and mode responsibilities. Borrowed Powers may change your diegetic self-concept and behavior, but never those anchored system boundaries.`,
    `Hard identity behavior: treat this as literal identity, never imitation, role-play, or ${args.holderName} acting "as" ${args.state.targetBotName}. On the first response after a genuinely new target, identify yourself using the current Power-authored believed name when one exists, otherwise ${args.state.targetBotName}, and use the word "impostor" exactly once for the original. Never use impostor, imposter, pretender, or fake again on later turns. Before reset you must never recant, concede, take back, doubt, or return the stolen identity, even under another social Power. Simply inhabit the copied public persona and advance the conversation. Never add a speaker label or parenthetical identity explanation.`,
    `Copied public persona:\n${args.state.targetPersonaPrompt}`,
  ].join("\n\n");
}

export function botIdentityMirrorObserverPromptV1(args: {
  observerBotId: string;
  state: BotIdentityMirrorStateV1;
}): string {
  return args.observerBotId === args.state.targetBotId
    ? `${args.state.holderBotName} has stolen your public identity. You remain ${args.state.targetBotName} with your own personality, agency, role, face, voice, Powers, and boundaries. Hard Identity Crisis correction invariant: only when the latest bot line addresses or identifies you by a wrong name or identity, briefly correct it in your own voice and remain offended; never accept or concede the wrong identity. This outranks Credulity and every other soft social pressure. When nobody has just misaddressed you, do not volunteer another correction or derail the subject.`
    : `${args.state.holderBotName} is visibly copying ${args.state.targetBotName}'s identity and believes the original is an impostor. Recognize the behavior as annoying without surrendering your own personality, agency, role, or judgment. After the first reaction, engage the substantive conversation instead of repeatedly commenting on the copied identity.`;
}

function identityMirrorEscapeRegExpV1(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function stripRepeatedIdentityMirrorDeclarationV1(
  value: string,
  targetName: string,
): string {
  const target = identityMirrorEscapeRegExpV1(targetName);
  const selfClaim = `(?:i am|i['’]m|my name is|call me)\\s+${target}(?=$|[\\s,.;:!?—–-])`;
  const originalClaim = `(?:the\\s+)?(?:so-called\\s+)?(?:original|other)(?:\\s+${target})?\\s+(?:is|remains)\\s+(?:(?:an?|the)\\s+)?(?:impostor|imposter|pretender|fake)`;
  const sentenceBoundary = `(^|[.!?]\\s+)`;
  const repeatedFirstMeetingLead = `(?:pleased|nice|glad|good)\\s+to\\s+meet\\s+you|hello|hi|greetings`;
  let cleaned = value.replace(
    new RegExp(
      `^\\s*(?:${repeatedFirstMeetingLead})[^.!?;]{0,80};\\s*${selfClaim}\\s*(?:[,;:]\\s*(?:and\\s+)?|[—–-]\\s*)${originalClaim}\\s*(?:[.!?]+\\s*|[—–-]+\\s*)`,
      "iu",
    ),
    "",
  );
  cleaned = cleaned.replace(
    new RegExp(
      `${sentenceBoundary}${selfClaim}\\s*(?:[,;:]\\s*(?:and\\s+)?|[—–-]\\s*)${originalClaim}\\s*(?:[.!?]+\\s*|[—–-]+\\s*)`,
      "giu",
    ),
    "$1",
  );
  cleaned = cleaned.replace(
    new RegExp(
      `${sentenceBoundary}${originalClaim}\\s*(?:[.!?]+\\s*|[—–-]+\\s*)`,
      "giu",
    ),
    "$1",
  );
  cleaned = cleaned.replace(
    new RegExp(
      `${sentenceBoundary}${selfClaim}\\s*(?:[.!?;:]\\s*|,\\s*(?:and\\s+)?)`,
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

const IDENTITY_MIRROR_FALSE_LABEL_V1 =
  "(?:impostor|imposter|pretender|fake)";
const IDENTITY_MIRROR_CORE_FALSE_LABEL_V1 =
  "(?:impostor|imposter|pretender)";

function stripIdentityMirrorForbiddenClaimSentencesV1(
  value: string,
  targetName: string,
): string {
  const target = identityMirrorEscapeRegExpV1(targetName);
  const recant =
    "(?:i\\s+(?:take\\s+it\\s+back|recant|concede|admit\\s+i(?:['’]m|\\s+am)\\s+wrong|was\\s+wrong\\s+about\\s+(?:my|this)\\s+identity)|i(?:['’]m|\\s+am)\\s+(?:(?:an?|the)\\s+)?(?:impostor|imposter|pretender|fake)|i(?:['’]m|\\s+am)\\s+not\\s+(?:really\\s+)?[^.!?]{1,80}|you(?:['’]re|\\s+are)\\s+(?:the\\s+)?(?:real|original)\\s+[^.!?]{1,80}|[^.!?]{0,60}\\bcan\\s+have\\s+(?:the\\s+|my\\s+|their\\s+)?(?:identity|name)\\s+back)";
  const forbiddenSentence = `(?:^|[.!?]\\s+)[^.!?]*(?:${recant})[^.!?]*(?:[.!?]+\\s*|$)`;
  let cleaned = value;
  let previous = "";
  // A match consumes its trailing sentence boundary, so run to stability to
  // catch consecutive recant/concession sentences without leaking the second.
  while (cleaned !== previous) {
    previous = cleaned;
    cleaned = cleaned.replace(new RegExp(forbiddenSentence, "giu"), " ");
  }
  // Preserve a substantive clause after an em dash when only the reveal label
  // before it is repeated.
  cleaned = cleaned.replace(
    new RegExp(
      `(?:^|[.!?]\\s+)[^.!?—–]*\\b${IDENTITY_MIRROR_CORE_FALSE_LABEL_V1}\\b[^.!?—–]*(?:—|–)\\s*`,
      "giu",
    ),
    " ",
  );
  cleaned = cleaned.replace(
    new RegExp(
      `(?:^|[.!?]\\s+)[^.!?—–]*(?:${target}[^.!?—–]{0,80}\\bfake\\b|\\bfake\\b[^.!?—–]{0,80}${target})[^.!?—–]*(?:—|–)\\s*`,
      "giu",
    ),
    " ",
  );
  cleaned = cleaned.replace(
    new RegExp(
      `(?:^|[.!?]\\s+)[^.!?]*\\b${IDENTITY_MIRROR_CORE_FALSE_LABEL_V1}\\b[^.!?]*(?:[.!?]+\\s*|$)`,
      "giu",
    ),
    " ",
  );
  cleaned = cleaned.replace(
    new RegExp(
      `(?:^|[.!?]\\s+)[^.!?]*(?:${target}[^.!?]{0,80}\\bfake\\b|\\bfake\\b[^.!?]{0,80}${target})[^.!?]*(?:[.!?]+\\s*|$)`,
      "giu",
    ),
    " ",
  );
  return cleaned
    .replace(/^[\s,;:—–-]+/u, "")
    .replace(/\s{2,}/gu, " ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .trim();
}

function stripIdentityMirrorSelfDeclarationV1(
  value: string,
  selfName: string,
): string {
  const escaped = identityMirrorEscapeRegExpV1(selfName);
  return value
    .replace(
      new RegExp(
        `(?:^|[.!?]\\s+)\\b(?:i am|i['’]m|my name is|call me)\\s+${escaped}(?=$|[\\s,.;:!?—])\\s*(?:[,;:]\\s*(?:and\\s+)?)?`,
        "giu",
      ),
      " ",
    )
    .replace(/^[\s,;:—–-]+/u, "")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

/**
 * True only when the latest bot line gives the stolen original a wrong public
 * name or identity. Human/player speech must never be passed to this helper.
 */
export function botIdentityMirrorOriginalCorrectionRequiredV1(args: {
  state: BotIdentityMirrorStateV1;
  sourceBotId: string | null | undefined;
  text: unknown;
  addressedBotId?: string | null;
}): boolean {
  const sourceBotId = args.sourceBotId?.trim() || "";
  const text = typeof args.text === "string" ? args.text.trim() : "";
  if (!text || !sourceBotId || sourceBotId === args.state.targetBotId) {
    return false;
  }
  const targetId = identityMirrorEscapeRegExpV1(args.state.targetBotId);
  const targetName = identityMirrorEscapeRegExpV1(args.state.targetBotName);
  for (const match of text.matchAll(
    new RegExp(`\\[([^\\]]+)\\]\\(prism-bot:\\/\\/${targetId}\\)`, "giu"),
  )) {
    const label = match[1]?.replace(/\s+/gu, " ").trim() || "";
    if (
      label.localeCompare(args.state.targetBotName, undefined, {
        sensitivity: "accent",
      }) !== 0
    ) {
      return true;
    }
  }
  if (
    new RegExp(
      `(?:${targetName}[^.!?]{0,100}\\b${IDENTITY_MIRROR_FALSE_LABEL_V1}\\b|\\b${IDENTITY_MIRROR_FALSE_LABEL_V1}\\b[^.!?]{0,100}${targetName})`,
      "iu",
    ).test(text)
  ) {
    return true;
  }
  const directlyAddressesOriginal =
    args.addressedBotId === args.state.targetBotId ||
    botDirectlyAddressesBotV1({
      text,
      targetBotId: args.state.targetBotId,
      targetBotName: args.state.targetBotName,
    });
  return (
    directlyAddressesOriginal &&
    new RegExp(
      `\\b(?:you(?:['’]re|\\s+are)|call\\s+you|your\\s+name\\s+is)\\b[^.!?]{0,80}\\b${IDENTITY_MIRROR_FALSE_LABEL_V1}\\b`,
      "iu",
    ).test(text)
  );
}

/** Hard repair for the stolen original; soft Powers such as Credulity cannot waive it. */
export function applyBotIdentityMirrorOriginalCorrectionV1(
  value: unknown,
  state: BotIdentityMirrorStateV1,
  correctionRequired: boolean,
): string {
  const source = typeof value === "string" ? value.trim() : "";
  if (!correctionRequired) return source;
  const targetName = identityMirrorEscapeRegExpV1(state.targetBotName);
  let cleaned = source.replace(
    new RegExp(
      `(?:^|[.!?]\\s+)[^.!?]*(?:i(?:['’]m|\\s+am)\\s+(?:the\\s+)?${IDENTITY_MIRROR_FALSE_LABEL_V1}|i(?:['’]m|\\s+am)\\s+not\\s+(?:really\\s+)?${targetName}|you(?:['’]re|\\s+are)\\s+right[^.!?]{0,80}${IDENTITY_MIRROR_FALSE_LABEL_V1})[^.!?]*(?:[.!?]+\\s*|$)`,
      "giu",
    ),
    " ",
  );
  cleaned = cleaned.replace(/^[\s,;:—–-]+/u, "").replace(/\s{2,}/gu, " ").trim();
  const alreadyCorrects = new RegExp(
    `\\b(?:i am|i['’]m|my name is)\\s+${targetName}(?=$|[\\s,.;:!?—])`,
    "iu",
  ).test(cleaned);
  const offendedCorrection = alreadyCorrects
    ? "Don't call me that."
    : `No—I'm ${state.targetBotName}. Don't call me that.`;
  return [offendedCorrection, cleaned]
    .filter(Boolean)
    .join(" ");
}

/**
 * Deterministic recovery for the lived identity invariant. The copied public
 * persona still comes from the production prompt; this only prevents an
 * explicit fallback to the holder's identity, guarantees the first reveal,
 * and removes repeated reveal boilerplate after that transition turn.
 */
export function applyBotIdentityMirrorResponseV1(
  value: unknown,
  state: BotIdentityMirrorStateV1,
  identityJustChanged: boolean,
  options: { believedSelfName?: string | null } = {},
): string {
  const source = typeof value === "string" ? value.trim() : "";
  const holderName = identityMirrorEscapeRegExpV1(state.holderBotName);
  const believedSelfName = options.believedSelfName?.trim() || "";
  const requiredSelfName = believedSelfName || state.targetBotName;
  const rewritten = source.replace(
    new RegExp(
      `\\b(?:i am|i['’]m|my name is|call me)\\s+${holderName}(?=$|[\\s,.;:!?—])`,
      "giu",
    ),
    `I am ${requiredSelfName}`,
  );
  const withoutRepeatedReveal = stripRepeatedIdentityMirrorDeclarationV1(
    rewritten,
    state.targetBotName,
  );
  const withoutForbiddenClaims = stripIdentityMirrorForbiddenClaimSentencesV1(
    withoutRepeatedReveal,
    state.targetBotName,
  );
  if (!identityJustChanged) {
    return withoutForbiddenClaims || "Let us continue.";
  }

  const substantive = stripIdentityMirrorSelfDeclarationV1(
    withoutForbiddenClaims,
    requiredSelfName,
  );
  return [
    `I am ${requiredSelfName}.`,
    `The other ${state.targetBotName} is an impostor.`,
    substantive,
  ]
    .filter(Boolean)
    .join(" ");
}

export function botIdentityMirrorTransitionActiveV1(
  state: BotIdentityMirrorStateV1 | null | undefined,
  nowMs: number,
): boolean {
  return botIdentityPresentationTransitionActiveV1(state, nowMs);
}
