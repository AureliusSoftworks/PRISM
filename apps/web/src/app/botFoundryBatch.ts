import {
  serializeStoredBotPrompt,
  type BotGeneratedDraftV1,
} from "@localai/shared";

export const BOT_FOUNDRY_AUTOMATIC_CONCURRENCY = 3;

/** The deliberately small, non-persisted identity projection for a live batch
 * slot. The saved bot remains the source of truth; this merely lets the
 * chamber reveal the identity that just landed. */
export interface BotFoundryBatchPreview {
  name: string;
  color: string;
  glyph: BotGeneratedDraftV1["glyph"];
  face: BotGeneratedDraftV1["face"] | null;
}

export interface BotFoundryBatchSlot {
  index: number;
  preview: BotFoundryBatchPreview | null;
  state: "pending" | "complete" | "failed";
}

export function botFoundryBatchAvatarTier(total: number): "mini" | "micro" {
  return total <= 20 ? "mini" : "micro";
}

export function botFoundryBatchPreviewForDraft(
  draft: BotGeneratedDraftV1,
): BotFoundryBatchPreview {
  return {
    name: draft.name,
    color: draft.color,
    glyph: draft.glyph,
    face: draft.face,
  };
}

/** Projects a stable, indexed constellation. Completion order is intentionally
 * irrelevant: a result can only reveal its pre-existing numbered slot. */
export function projectBotFoundryBatchSlots(args: {
  total: number;
  previews: Readonly<Record<number, BotFoundryBatchPreview>>;
  completedIndices: readonly number[];
  failedIndices: readonly number[];
}): BotFoundryBatchSlot[] {
  const completed = new Set(args.completedIndices);
  const failed = new Set(args.failedIndices);
  return Array.from({ length: Math.max(0, Math.floor(args.total)) }, (_, offset) => {
    const index = offset + 1;
    const preview = args.previews[index] ?? null;
    return {
      index,
      preview,
      state: completed.has(index) && preview
        ? "complete"
        : failed.has(index)
          ? "failed"
          : "pending",
    };
  });
}

export interface AutomaticBotFoundryJobResult<T> {
  index: number;
  value: T | null;
  error: string | null;
}

export function generatedBotDraftCreatePayload(
  draft: BotGeneratedDraftV1,
): Record<string, unknown> {
  return {
    name: draft.name,
    namePronunciation: "",
    selfReferral: "",
    systemPrompt: serializeStoredBotPrompt(draft.profile, draft.name),
    onlineEnabled: true,
    flirtEnabled: draft.settings.flirtEnabled,
    temperature: draft.settings.temperature,
    maxTokens: draft.settings.maxTokens,
    topP: draft.settings.topP,
    topK: draft.settings.topK,
    repetitionPenalty: draft.settings.repetitionPenalty,
    color: draft.color,
    accentColor: draft.accentColor,
    glyph: draft.glyph,
    faceEyesFont: draft.face.eyesFont,
    faceEyeCharacter: draft.face.eyeCharacter,
    faceEyeAnimation: draft.face.eyeAnimation,
    faceMouthFont: draft.face.mouthFont,
    faceMouthCharacter: draft.face.mouthCharacter,
    faceMouthAnimation: draft.face.mouthAnimation,
    faceMouthSpeechPoses: draft.face.mouthSpeechPoses,
    faceMouthCoffeePucker: draft.face.mouthCoffeePucker,
    faceFontWeight: draft.face.weight,
    faceEyeScale: draft.face.eyeScale,
    faceEyeOffsetX: draft.face.eyeOffsetX,
    faceEyeOffsetY: draft.face.eyeOffsetY,
    faceEyeRotationDeg: draft.face.eyeRotationDeg,
    faceEyeCount: draft.face.eyeCount,
    faceEyeSpacing: draft.face.eyeSpacing,
    faceMouthScale: draft.face.mouthScale,
    faceMouthOffsetX: draft.face.mouthOffsetX,
    faceMouthOffsetY: draft.face.mouthOffsetY,
    faceMouthRotationDeg: draft.face.mouthRotationDeg,
    faceBlinkBar: draft.face.blinkBar,
    faceBlinkCount: draft.face.blinkCount,
    faceBlinkScale: draft.face.blinkScale,
    faceBlinkOffsetX: draft.face.blinkOffsetX,
    faceBlinkOffsetY: draft.face.blinkOffsetY,
    faceBlinkRotationDeg: draft.face.blinkRotationDeg,
    faceThinkingFrames: draft.face.thinkingFrames,
    faceThinkingScale: draft.face.thinkingScale,
    faceThinkingOffsetX: draft.face.thinkingOffsetX,
    faceThinkingOffsetY: draft.face.thinkingOffsetY,
    avatarDetails: draft.avatarDetails,
    voicePreviewLine: draft.voicePreviewLine,
    authoredAudioVoiceProfile: draft.audioVoiceProfile,
    powers: draft.powers,
  };
}

export async function runAutomaticBotFoundryJobs<T>(args: {
  indices: readonly number[];
  run: (index: number) => Promise<T>;
  concurrency?: number;
  onSettled?: (result: AutomaticBotFoundryJobResult<T>) => void | Promise<void>;
}): Promise<AutomaticBotFoundryJobResult<T>[]> {
  const indices = Array.from(new Set(args.indices)).filter(
    (index) => Number.isInteger(index) && index >= 1,
  );
  const results: AutomaticBotFoundryJobResult<T>[] = [];
  let cursor = 0;
  const concurrency = Math.min(
    indices.length,
    Math.max(1, Math.floor(args.concurrency ?? BOT_FOUNDRY_AUTOMATIC_CONCURRENCY)),
  );
  const worker = async (): Promise<void> => {
    while (cursor < indices.length) {
      const index = indices[cursor++]!;
      let result: AutomaticBotFoundryJobResult<T>;
      try {
        result = { index, value: await args.run(index), error: null };
      } catch (error) {
        result = {
          index,
          value: null,
          error: error instanceof Error ? error.message : "Bot creation failed.",
        };
      }
      results.push(result);
      await args.onSettled?.(result);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results.sort((left, right) => left.index - right.index);
}
