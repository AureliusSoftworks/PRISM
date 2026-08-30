import {
  DEFAULT_BOT_IDENTITY_COLOR,
  normalizeBotIdentityColor,
} from "./color.ts";
import {
  BOT_VOICE_PRESET_LABELS,
  parseStoredBotPrompt,
  type BotVoicePreset,
} from "./botProfile.ts";
import type { BotFaceStyle } from "./botAvatar.ts";
import type { BotAvatarDetailsV1 } from "./botAvatarDetails.ts";

export const BOT_IDENTITY_PRESENTATION_TRANSITION_MS = 760;

export interface BotIdentityPresentationSnapshotV1 {
  targetColor?: string;
  targetGlyph?: string | null;
  targetVoicePreset?: BotVoicePreset;
  targetFrameMaterialSeed?: string;
}

export interface BotIdentityPublicPresentationV1 {
  name: string;
  personaPrompt: string;
  face: BotFaceStyle;
  avatarDetails: BotAvatarDetailsV1 | null;
  glyph: string | null;
  color: string;
  voicePreset: BotVoicePreset;
  frameMaterialSeed: string;
}

type BotIdentityMirrorPresentationInputV1 = {
  targetBotName: string;
  targetFace: BotFaceStyle;
  targetAvatarDetails?: BotAvatarDetailsV1 | null;
  targetGlyph?: string | null;
};

type BotIdentityShapeshiftPresentationInputV1 =
  BotIdentityMirrorPresentationInputV1 & {
    targetPersonaPrompt: string;
    targetColor?: string;
    targetVoicePreset?: BotVoicePreset;
    targetFrameMaterialSeed?: string;
  };

/**
 * Single public projection contract. Native Identity Mirror presentation wins
 * over native Shapeshifter state. Mirror changes only name/face/Ink/glyph;
 * shapeshift changes persona and complete visible form. Powers, mechanics, and
 * voice are intentionally absent and therefore can never transfer here.
 */
export function resolveBotIdentityPublicPresentationV1(args: {
  base: BotIdentityPublicPresentationV1;
  mirror?: BotIdentityMirrorPresentationInputV1 | null;
  shapeshift?: BotIdentityShapeshiftPresentationInputV1 | null;
}): BotIdentityPublicPresentationV1 {
  if (args.mirror) {
    return {
      ...args.base,
      name: args.mirror.targetBotName,
      face: args.mirror.targetFace,
      avatarDetails: Object.prototype.hasOwnProperty.call(
        args.mirror,
        "targetAvatarDetails",
      )
        ? (args.mirror.targetAvatarDetails ?? null)
        : args.base.avatarDetails,
      glyph: Object.prototype.hasOwnProperty.call(args.mirror, "targetGlyph")
        ? (args.mirror.targetGlyph ?? null)
        : args.base.glyph,
    };
  }
  const shaped = args.shapeshift
    ? {
        ...args.base,
        name: args.shapeshift.targetBotName,
        personaPrompt: args.shapeshift.targetPersonaPrompt,
        face: args.shapeshift.targetFace,
        avatarDetails: Object.prototype.hasOwnProperty.call(
          args.shapeshift,
          "targetAvatarDetails",
        )
          ? (args.shapeshift.targetAvatarDetails ?? null)
          : args.base.avatarDetails,
        glyph: Object.prototype.hasOwnProperty.call(
          args.shapeshift,
          "targetGlyph",
        )
          ? (args.shapeshift.targetGlyph ?? null)
          : args.base.glyph,
        color: args.shapeshift.targetColor ?? args.base.color,
        voicePreset:
          args.shapeshift.targetVoicePreset ?? args.base.voicePreset,
        frameMaterialSeed:
          args.shapeshift.targetFrameMaterialSeed ?? args.base.frameMaterialSeed,
      }
    : args.base;
  return shaped;
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** New identity snapshots always carry one canonical, fully saturated color. */
export function botIdentityPresentationColorV1(value: unknown): string {
  return (
    normalizeBotIdentityColor(value) ??
    normalizeBotIdentityColor(DEFAULT_BOT_IDENTITY_COLOR)!
  );
}

/** A missing authored glyph is a real public identity choice. */
export function botIdentityPresentationGlyphV1(value: unknown): string | null {
  return boundedText(value, 120) || null;
}

/** Communication style owns the public chassis alloy. */
export function botIdentityPresentationVoicePresetV1(
  systemPrompt: unknown,
): BotVoicePreset {
  return parseStoredBotPrompt(
    typeof systemPrompt === "string" ? systemPrompt : "",
  ).fields.core.communicationStyle;
}

/** Frame finish follows the same portable-export-first identity used by live avatars. */
export function botIdentityPresentationFrameMaterialSeedV1(args: {
  targetBotId: string;
  exportHash?: unknown;
}): string {
  const exportHash = boundedText(args.exportHash, 128).toLowerCase();
  if (/^[a-f0-9]{32}$/u.test(exportHash)) {
    return `bot-frame-material:export:${exportHash}`;
  }
  const targetBotId = boundedText(args.targetBotId, 128);
  return `bot-frame-material:id:${targetBotId || "borrowed-identity"}`;
}

/** Screen wear is portable like the chassis finish, but intentionally uses a
 * separate seed namespace so glass handling never tracks the metal recipe. */
export function botIdentityPresentationScreenMaterialSeedV1(args: {
  targetBotId: string;
  exportHash?: unknown;
}): string {
  const exportHash = boundedText(args.exportHash, 128).toLowerCase();
  if (/^[a-f0-9]{32}$/u.test(exportHash)) {
    return `bot-screen-material:export:${exportHash}`;
  }
  const targetBotId = boundedText(args.targetBotId, 128);
  return `bot-screen-material:id:${targetBotId || "borrowed-identity"}`;
}

export function normalizeBotIdentityPresentationSnapshotV1(
  row: Record<string, unknown>,
): BotIdentityPresentationSnapshotV1 {
  const targetColor = normalizeBotIdentityColor(row.targetColor) ?? undefined;
  const hasTargetGlyph = Object.prototype.hasOwnProperty.call(row, "targetGlyph");
  const targetGlyph = hasTargetGlyph
    ? botIdentityPresentationGlyphV1(row.targetGlyph)
    : undefined;
  const targetVoicePreset =
    typeof row.targetVoicePreset === "string" &&
    row.targetVoicePreset in BOT_VOICE_PRESET_LABELS
      ? (row.targetVoicePreset as BotVoicePreset)
      : undefined;
  const targetFrameMaterialSeed =
    boundedText(row.targetFrameMaterialSeed, 300) || undefined;
  return {
    ...(targetColor ? { targetColor } : {}),
    ...(hasTargetGlyph ? { targetGlyph } : {}),
    ...(targetVoicePreset ? { targetVoicePreset } : {}),
    ...(targetFrameMaterialSeed ? { targetFrameMaterialSeed } : {}),
  };
}

/** One persisted screen-off window shared by every borrowed-identity surface. */
export function botIdentityPresentationTransitionActiveV1(
  state: { occurredAt: string } | null | undefined,
  nowMs: number,
): boolean {
  if (!state || !Number.isFinite(nowMs)) return false;
  const atMs = Date.parse(state.occurredAt);
  return (
    Number.isFinite(atMs) &&
    nowMs >= atMs &&
    nowMs < atMs + BOT_IDENTITY_PRESENTATION_TRANSITION_MS
  );
}
