import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_BLINK_COUNT,
  DEFAULT_BOT_FACE_BLINK_OFFSET_X,
  DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
  DEFAULT_BOT_FACE_BLINK_ROTATION_DEG,
  DEFAULT_BOT_FACE_BLINK_SCALE,
  DEFAULT_BOT_FACE_EYE_COUNT,
  DEFAULT_BOT_FACE_EYE_SPACING,
  DEFAULT_BOT_FACE_EYE_MOVEMENT,
  DEFAULT_BOT_FACE_EYE_OFFSET_X,
  DEFAULT_BOT_FACE_EYE_OFFSET_Y,
  DEFAULT_BOT_FACE_EYE_ROTATION_DEG,
  DEFAULT_BOT_FACE_EYE_SCALE,
  DEFAULT_BOT_FACE_FONT_ID,
  DEFAULT_BOT_FACE_FONT_WEIGHT,
  DEFAULT_BOT_FACE_GLYPH_ANIMATION,
  DEFAULT_BOT_FACE_MOUTH_COFFEE_PUCKER,
  DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
  DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
  DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG,
  DEFAULT_BOT_FACE_MOUTH_SCALE,
  DEFAULT_BOT_FACE_THINKING_FRAMES,
  DEFAULT_BOT_FACE_THINKING_OFFSET_X,
  DEFAULT_BOT_FACE_THINKING_OFFSET_Y,
  DEFAULT_BOT_FACE_THINKING_SCALE,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceBlinkOffsetX,
  normalizeBotFaceBlinkOffsetY,
  normalizeBotFaceBlinkRotationDeg,
  normalizeBotFaceBlinkScale,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeCount,
  normalizeBotFaceEyeSpacing,
  normalizeBotFaceEyeMovement,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeRotationDeg,
  normalizeBotFaceEyeScale,
  normalizeBotFaceFontId,
  normalizeBotFaceFontWeight,
  normalizeBotFaceGlyphAnimation,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceMouthScale,
  normalizeBotFaceMouthOffsetX,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthRotationDeg,
  normalizeBotFaceThinkingOffsetX,
  normalizeBotFaceThinkingOffsetY,
  normalizeBotFaceThinkingScale,
  serializeBotAudioVoiceProfileV1,
  serializeBotFaceThinkingFrames,
  serializeBotFaceCustomSpeechPosesForStorage,
  type PrismJsonObject,
  type PrismJsonValue,
} from "@localai/shared";

const DEFAULT_BOT_COLUMNS = [
  "prism_default_bot_name",
  "prism_default_bot_system_prompt",
  "prism_default_bot_color",
  "prism_default_bot_glyph",
  "prism_default_bot_face_eyes_font",
  "prism_default_bot_face_eye_character",
  "prism_default_bot_face_eye_animation",
  "prism_default_bot_face_mouth_font",
  "prism_default_bot_face_mouth_character",
  "prism_default_bot_face_mouth_animation",
  "prism_default_bot_face_mouth_speech_poses",
  "prism_default_bot_face_mouth_coffee_pucker",
  "prism_default_bot_face_font_weight",
  "prism_default_bot_face_eye_scale",
  "prism_default_bot_face_eye_offset_x",
  "prism_default_bot_face_eye_offset_y",
  "prism_default_bot_face_eye_rotation_deg",
  "prism_default_bot_face_eye_count",
  "prism_default_bot_face_eye_spacing",
  "prism_default_bot_face_mouth_scale",
  "prism_default_bot_face_mouth_offset_x",
  "prism_default_bot_face_mouth_offset_y",
  "prism_default_bot_face_mouth_rotation_deg",
  "prism_default_bot_face_blink_bar",
  "prism_default_bot_face_blink_count",
  "prism_default_bot_face_blink_scale",
  "prism_default_bot_face_blink_offset_x",
  "prism_default_bot_face_blink_offset_y",
  "prism_default_bot_face_blink_rotation_deg",
  "prism_default_bot_face_thinking_frames",
  "prism_default_bot_face_thinking_scale",
  "prism_default_bot_face_thinking_offset_x",
  "prism_default_bot_face_thinking_offset_y",
  "prism_default_bot_temperature",
  "prism_default_bot_max_tokens",
  "prism_default_bot_top_p",
  "prism_default_bot_top_k",
  "prism_default_bot_repetition_penalty",
  "prism_default_bot_audio_voice_profile",
] as const;

type DefaultBotColumn = (typeof DEFAULT_BOT_COLUMNS)[number];
type DefaultBotValues = Record<DefaultBotColumn, string | number | null>;

export interface PrismDefaultBotMutation {
  before: PrismJsonObject;
  after: PrismJsonObject;
  changedKeys: string[];
  beforeFingerprint: string;
}

function rowForAccount(
  db: DatabaseSync,
  userId: string,
): DefaultBotValues {
  const row = db
    .prepare(
      `SELECT ${DEFAULT_BOT_COLUMNS.join(", ")}
         FROM users
        WHERE id = ?`,
    )
    .get(userId) as DefaultBotValues | undefined;
  if (!row) throw new Error("Default Prism settings were not found.");
  return row;
}

function jsonValues(values: DefaultBotValues): PrismJsonObject {
  return Object.fromEntries(
    DEFAULT_BOT_COLUMNS.map((column) => [column, values[column] ?? null]),
  ) as PrismJsonObject;
}

function fingerprint(values: PrismJsonObject): string {
  return createHash("sha256")
    .update(JSON.stringify(values))
    .digest("hex");
}

function requiredNormalized<T>(
  value: unknown,
  fallback: T,
  label: string,
  normalize: (candidate: unknown) => T | null,
): T {
  const normalized = normalize(value);
  if (value !== undefined && value !== null && normalized === null) {
    throw new Error(`Invalid ${label}.`);
  }
  return normalized ?? fallback;
}

function nextValues(patch: PrismJsonObject): DefaultBotValues {
  if (Object.prototype.hasOwnProperty.call(patch, "avatarDetails")) {
    throw new Error("Avatar Details are only available for custom bots.");
  }
  const faceEyeCount =
    patch.faceEyeCount === undefined
      ? DEFAULT_BOT_FACE_EYE_COUNT
      : normalizeBotFaceEyeCount(patch.faceEyeCount);
  if (faceEyeCount === null) throw new Error("Invalid custom eye count.");
  const faceEyeSpacing = requiredNormalized(
    patch.faceEyeSpacing,
    DEFAULT_BOT_FACE_EYE_SPACING,
    "eye spacing",
    normalizeBotFaceEyeSpacing,
  );
  const faceBlinkCount =
    patch.faceBlinkCount === undefined
      ? normalizeBotFaceEyeCharacter(patch.faceEyeCharacter) !== null
        ? faceEyeCount
        : DEFAULT_BOT_FACE_BLINK_COUNT
      : normalizeBotFaceEyeCount(patch.faceBlinkCount);
  if (faceBlinkCount === null) throw new Error("Invalid blink eye count.");
  let faceThinkingFrames: string | null = null;
  if (patch.faceThinkingFrames !== null) {
    faceThinkingFrames = serializeBotFaceThinkingFrames(
      patch.faceThinkingFrames ?? DEFAULT_BOT_FACE_THINKING_FRAMES,
    );
    if (faceThinkingFrames === null) {
      throw new Error("Invalid face thinking frames.");
    }
  }
  let faceMouthSpeechPoses: string | null = null;
  if (patch.faceMouthSpeechPoses !== null && patch.faceMouthSpeechPoses !== undefined) {
    faceMouthSpeechPoses = serializeBotFaceCustomSpeechPosesForStorage(
      patch.faceMouthSpeechPoses,
    );
    if (faceMouthSpeechPoses === null) {
      throw new Error("Invalid face mouth speech poses.");
    }
  }
  return {
    prism_default_bot_name: null,
    prism_default_bot_system_prompt: null,
    prism_default_bot_color: null,
    prism_default_bot_glyph: null,
    prism_default_bot_face_eyes_font: requiredNormalized(
      patch.faceEyesFont,
      DEFAULT_BOT_FACE_FONT_ID,
      "eye font",
      normalizeBotFaceFontId,
    ),
    prism_default_bot_face_eye_character:
      patch.faceEyeCharacter === null
        ? null
        : normalizeBotFaceEyeCharacter(patch.faceEyeCharacter),
    prism_default_bot_face_eye_animation: requiredNormalized(
      patch.faceEyeAnimation,
      DEFAULT_BOT_FACE_EYE_MOVEMENT,
      "eye movement",
      normalizeBotFaceEyeMovement,
    ),
    prism_default_bot_face_mouth_font: requiredNormalized(
      patch.faceMouthFont,
      DEFAULT_BOT_FACE_FONT_ID,
      "mouth font",
      normalizeBotFaceFontId,
    ),
    prism_default_bot_face_mouth_character:
      patch.faceMouthCharacter === null
        ? null
        : normalizeBotFaceMouthCharacter(
            patch.faceMouthCharacter,
          ),
    prism_default_bot_face_mouth_animation: requiredNormalized(
      patch.faceMouthAnimation,
      DEFAULT_BOT_FACE_GLYPH_ANIMATION,
      "mouth animation",
      normalizeBotFaceGlyphAnimation,
    ),
    prism_default_bot_face_mouth_speech_poses: faceMouthSpeechPoses,
    prism_default_bot_face_mouth_coffee_pucker:
      typeof patch.faceMouthCoffeePucker === "boolean"
        ? patch.faceMouthCoffeePucker
          ? 1
          : 0
        : DEFAULT_BOT_FACE_MOUTH_COFFEE_PUCKER
          ? 1
          : 0,
    prism_default_bot_face_font_weight: requiredNormalized(
      patch.faceFontWeight,
      DEFAULT_BOT_FACE_FONT_WEIGHT,
      "font weight",
      normalizeBotFaceFontWeight,
    ),
    prism_default_bot_face_eye_scale: requiredNormalized(
      patch.faceEyeScale,
      DEFAULT_BOT_FACE_EYE_SCALE,
      "eye scale",
      normalizeBotFaceEyeScale,
    ),
    prism_default_bot_face_eye_offset_x: requiredNormalized(
      patch.faceEyeOffsetX,
      DEFAULT_BOT_FACE_EYE_OFFSET_X,
      "eye horizontal offset",
      normalizeBotFaceEyeOffsetX,
    ),
    prism_default_bot_face_eye_offset_y: requiredNormalized(
      patch.faceEyeOffsetY,
      DEFAULT_BOT_FACE_EYE_OFFSET_Y,
      "eye vertical offset",
      normalizeBotFaceEyeOffsetY,
    ),
    prism_default_bot_face_eye_rotation_deg: requiredNormalized(
      patch.faceEyeRotationDeg,
      DEFAULT_BOT_FACE_EYE_ROTATION_DEG,
      "eye rotation",
      normalizeBotFaceEyeRotationDeg,
    ),
    prism_default_bot_face_eye_count: faceEyeCount,
    prism_default_bot_face_eye_spacing: faceEyeSpacing,
    prism_default_bot_face_mouth_scale: requiredNormalized(
      patch.faceMouthScale,
      DEFAULT_BOT_FACE_MOUTH_SCALE,
      "mouth scale",
      normalizeBotFaceMouthScale,
    ),
    prism_default_bot_face_mouth_offset_x: requiredNormalized(
      patch.faceMouthOffsetX,
      DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
      "mouth horizontal offset",
      normalizeBotFaceMouthOffsetX,
    ),
    prism_default_bot_face_mouth_offset_y: requiredNormalized(
      patch.faceMouthOffsetY,
      DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
      "mouth vertical offset",
      normalizeBotFaceMouthOffsetY,
    ),
    prism_default_bot_face_mouth_rotation_deg: requiredNormalized(
      patch.faceMouthRotationDeg,
      DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG,
      "mouth rotation",
      normalizeBotFaceMouthRotationDeg,
    ),
    prism_default_bot_face_blink_bar: requiredNormalized(
      patch.faceBlinkBar,
      DEFAULT_BOT_FACE_BLINK_BAR,
      "blink bar",
      normalizeBotFaceBlinkBar,
    ),
    prism_default_bot_face_blink_count:
      faceBlinkCount ?? DEFAULT_BOT_FACE_BLINK_COUNT,
    prism_default_bot_face_blink_scale: requiredNormalized(
      patch.faceBlinkScale,
      DEFAULT_BOT_FACE_BLINK_SCALE,
      "blink scale",
      normalizeBotFaceBlinkScale,
    ),
    prism_default_bot_face_blink_offset_x: requiredNormalized(
      patch.faceBlinkOffsetX,
      DEFAULT_BOT_FACE_BLINK_OFFSET_X,
      "blink horizontal offset",
      normalizeBotFaceBlinkOffsetX,
    ),
    prism_default_bot_face_blink_offset_y: requiredNormalized(
      patch.faceBlinkOffsetY,
      DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
      "blink vertical offset",
      normalizeBotFaceBlinkOffsetY,
    ),
    prism_default_bot_face_blink_rotation_deg: requiredNormalized(
      patch.faceBlinkRotationDeg,
      DEFAULT_BOT_FACE_BLINK_ROTATION_DEG,
      "blink rotation",
      normalizeBotFaceBlinkRotationDeg,
    ),
    prism_default_bot_face_thinking_frames: faceThinkingFrames,
    prism_default_bot_face_thinking_scale: requiredNormalized(
      patch.faceThinkingScale,
      DEFAULT_BOT_FACE_THINKING_SCALE,
      "thinking scale",
      normalizeBotFaceThinkingScale,
    ),
    prism_default_bot_face_thinking_offset_x: requiredNormalized(
      patch.faceThinkingOffsetX,
      DEFAULT_BOT_FACE_THINKING_OFFSET_X,
      "thinking horizontal offset",
      normalizeBotFaceThinkingOffsetX,
    ),
    prism_default_bot_face_thinking_offset_y: requiredNormalized(
      patch.faceThinkingOffsetY,
      DEFAULT_BOT_FACE_THINKING_OFFSET_Y,
      "thinking vertical offset",
      normalizeBotFaceThinkingOffsetY,
    ),
    prism_default_bot_temperature: null,
    prism_default_bot_max_tokens: null,
    prism_default_bot_top_p: null,
    prism_default_bot_top_k: null,
    prism_default_bot_repetition_penalty: null,
    prism_default_bot_audio_voice_profile:
      serializeBotAudioVoiceProfileV1(patch.audioVoiceProfile),
  };
}

function sqlValues(
  values: PrismJsonObject,
): Array<string | number | null> {
  return DEFAULT_BOT_COLUMNS.map((column) => {
    const value: PrismJsonValue | undefined = values[column];
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number"
    ) {
      return value ?? null;
    }
    throw new Error(`Invalid persisted Default Prism value for ${column}.`);
  });
}

function writeValues(
  db: DatabaseSync,
  userId: string,
  values: PrismJsonObject,
): void {
  const result = db
    .prepare(
      `UPDATE users
          SET ${DEFAULT_BOT_COLUMNS.map((column) => `${column} = ?`).join(", ")}
        WHERE id = ?`,
    )
    .run(...sqlValues(values), userId);
  if (result.changes !== 1) {
    throw new Error("Default Prism settings could not be updated.");
  }
}

export function previewPrismDefaultBotPatch(args: {
  db: DatabaseSync;
  userId: string;
  patch: PrismJsonObject;
  expectedFingerprint?: string | null;
}): PrismDefaultBotMutation {
  const before = jsonValues(rowForAccount(args.db, args.userId));
  const beforeFingerprint = fingerprint(before);
  if (
    args.expectedFingerprint &&
    args.expectedFingerprint !== beforeFingerprint
  ) {
    throw new Error("Default Prism changed before this update.");
  }
  const after = jsonValues(nextValues(args.patch));
  return {
    before,
    after,
    changedKeys: DEFAULT_BOT_COLUMNS.filter(
      (column) => before[column] !== after[column],
    ),
    beforeFingerprint,
  };
}

export function applyPrismDefaultBotPatch(args: {
  db: DatabaseSync;
  userId: string;
  patch: PrismJsonObject;
  expectedFingerprint?: string | null;
}): PrismDefaultBotMutation {
  const mutation = previewPrismDefaultBotPatch(args);
  // #region agent log
  fetch("http://127.0.0.1:7914/ingest/796e4cfe-51fc-4e0c-8265-ef32bc063af2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "2836be",
    },
    body: JSON.stringify({
      sessionId: "2836be",
      hypothesisId: "B",
      location: "prism-default-bot-mutations.ts:applyPrismDefaultBotPatch",
      message: "Default Prism patch applied",
      data: {
        userId: args.userId,
        changedKeys: mutation.changedKeys,
        voiceChanged: mutation.changedKeys.includes(
          "prism_default_bot_audio_voice_profile",
        ),
        beforeVoicePreview:
          typeof mutation.before.prism_default_bot_audio_voice_profile ===
          "string"
            ? mutation.before.prism_default_bot_audio_voice_profile.slice(0, 220)
            : mutation.before.prism_default_bot_audio_voice_profile,
        afterVoicePreview:
          typeof mutation.after.prism_default_bot_audio_voice_profile === "string"
            ? mutation.after.prism_default_bot_audio_voice_profile.slice(0, 220)
            : mutation.after.prism_default_bot_audio_voice_profile,
        patchHasAudioVoiceProfile: Object.prototype.hasOwnProperty.call(
          args.patch,
          "audioVoiceProfile",
        ),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (mutation.changedKeys.length > 0) {
    writeValues(args.db, args.userId, mutation.after);
  }
  return mutation;
}

export function undoPrismDefaultBotPatch(args: {
  db: DatabaseSync;
  userId: string;
  before: PrismJsonObject;
  expectedCurrent: PrismJsonObject;
}): void {
  const current = jsonValues(rowForAccount(args.db, args.userId));
  if (fingerprint(current) !== fingerprint(args.expectedCurrent)) {
    throw new Error(
      "Default Prism changed after this action and cannot be undone.",
    );
  }
  writeValues(args.db, args.userId, args.before);
}
