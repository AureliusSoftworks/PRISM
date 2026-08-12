import {
  DEFAULT_BOT_IDENTITY_COLOR,
  normalizeBotIdentityColor,
} from "./color.ts";
import {
  BOT_VOICE_PRESET_LABELS,
  parseStoredBotPrompt,
  type BotVoicePreset,
} from "./botProfile.ts";

export const BOT_IDENTITY_PRESENTATION_TRANSITION_MS = 760;

export interface BotIdentityPresentationSnapshotV1 {
  targetColor?: string;
  targetGlyph?: string | null;
  targetVoicePreset?: BotVoicePreset;
  targetFrameMaterialSeed?: string;
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
