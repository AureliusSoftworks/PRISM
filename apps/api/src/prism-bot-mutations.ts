import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_BOT_FACE_BLINK_BAR,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceBlinkOffsetX,
  normalizeBotFaceBlinkOffsetY,
  normalizeBotFaceBlinkRotationDeg,
  normalizeBotFaceBlinkScale,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeCount,
  normalizeBotFaceEyeMovement,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeRotationDeg,
  normalizeBotFaceEyeScale,
  normalizeBotFaceThinkingOffsetX,
  normalizeBotFaceThinkingOffsetY,
  normalizeBotFaceThinkingScale,
  normalizeBotFaceFontId,
  normalizeBotFaceFontWeight,
  normalizeBotFaceGlyphAnimation,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceMouthOffsetX,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthRotationDeg,
  normalizeBotFaceMouthScale,
  normalizeBotNamePronunciation,
  normalizeBotSelfReferral,
  normalizeOptionalBotAudioVoiceProfileV1,
  serializeBotAudioVoiceProfileV1,
  serializeBotAvatarDetailsV1,
  serializeBotFaceThinkingFrames,
  serializeBotPowersV1,
  type PrismJsonObject,
  type PrismJsonValue,
} from "@localai/shared";
import { normalizeVoicePreviewLine } from "./voice-preview-line.ts";

const HUMAN_ONLY_BOT_PATCH_KEYS = new Set([
  "profilePictureImageId",
  "exportHash",
  "localImageModel",
  "openaiImageModel",
]);

export const PRISM_JOURNALED_BOT_PATCH_KEYS = new Set([
  "name",
  "systemPrompt",
  "onlineEnabled",
  "deleteProtected",
  "flirtEnabled",
  "chatEnabled",
  "powers",
  "temperature",
  "maxTokens",
  "topP",
  "topK",
  "repetitionPenalty",
  "faceEyesFont",
  "faceEyeCharacter",
  "faceEyeAnimation",
  "faceMouthFont",
  "faceMouthCharacter",
  "faceMouthAnimation",
  "faceMouthCoffeePucker",
  "faceFontWeight",
  "faceEyeScale",
  "faceEyeOffsetX",
  "faceEyeOffsetY",
  "faceEyeRotationDeg",
  "faceEyeCount",
  "faceMouthScale",
  "faceMouthOffsetX",
  "faceMouthOffsetY",
  "faceMouthRotationDeg",
  "faceBlinkBar",
  "faceBlinkScale",
  "faceBlinkOffsetX",
  "faceBlinkOffsetY",
  "faceBlinkRotationDeg",
  "faceThinkingFrames",
  "faceThinkingScale",
  "faceThinkingOffsetX",
  "faceThinkingOffsetY",
  "avatarDetails",
  "color",
  "glyph",
  "voicePreviewLine",
  "namePronunciation",
  "selfReferral",
  "authoredAudioVoiceProfile",
  "audioVoiceProfileOverride",
]);

const BOT_MUTATION_COLUMNS = [
  "name",
  "system_prompt",
  "online_enabled",
  "delete_protected",
  "flirt_enabled",
  "chat_enabled",
  "powers_json",
  "temperature",
  "max_tokens",
  "top_p",
  "top_k",
  "repetition_penalty",
  "face_eyes_font",
  "face_eye_character",
  "face_eye_animation",
  "face_mouth_font",
  "face_mouth_character",
  "face_mouth_animation",
  "face_mouth_coffee_pucker",
  "face_font_weight",
  "face_eye_scale",
  "face_eye_offset_x",
  "face_eye_offset_y",
  "face_eye_rotation_deg",
  "face_eye_count",
  "face_mouth_scale",
  "face_mouth_offset_x",
  "face_mouth_offset_y",
  "face_mouth_rotation_deg",
  "face_blink_bar",
  "face_blink_scale",
  "face_blink_offset_x",
  "face_blink_offset_y",
  "face_blink_rotation_deg",
  "face_thinking_frames",
  "face_thinking_scale",
  "face_thinking_offset_x",
  "face_thinking_offset_y",
  "avatar_details_json",
  "color",
  "glyph",
  "voice_preview_line",
  "name_pronunciation",
  "self_referral",
  "authored_audio_voice_profile",
  "audio_voice_profile_override",
] as const;

type BotMutationColumn = (typeof BOT_MUTATION_COLUMNS)[number];
type BotMutationRow = Record<
  BotMutationColumn,
  string | number | null
> & {
  id: string;
  name: string;
  updated_at: string;
};

export interface PrismBotMutation {
  botId: string;
  botName: string;
  before: PrismJsonObject;
  after: PrismJsonObject;
  previousRevision: string;
  appliedRevision: string;
  changedKeys: string[];
  profileChanged: boolean;
}

function own(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function normalizeNullable<T>(
  value: unknown,
  label: string,
  normalize: (candidate: unknown) => T | null,
): T | null {
  if (value === null) return null;
  const normalized = normalize(value);
  if (normalized === null) throw new Error(`Invalid ${label}.`);
  return normalized;
}

function normalizeTopP(value: unknown): number {
  return Number(Math.min(1, Math.max(0, finiteNumber(value, "topP"))).toFixed(2));
}

function normalizeTopK(value: unknown): number {
  return Math.max(0, Math.floor(finiteNumber(value, "topK")));
}

function normalizeRepetitionPenalty(value: unknown): number {
  return Number(
    Math.min(
      2,
      Math.max(0.5, finiteNumber(value, "repetitionPenalty")),
    ).toFixed(2),
  );
}

function rowForBot(
  db: DatabaseSync,
  userId: string,
  botId: string,
): BotMutationRow {
  const row = db
    .prepare(
      `SELECT id, updated_at, ${BOT_MUTATION_COLUMNS.join(", ")}
         FROM bots
        WHERE id = ? AND user_id = ?`,
    )
    .get(botId, userId) as BotMutationRow | undefined;
  if (!row) throw new Error("Bot not found.");
  return row;
}

function jsonColumns(
  values: Record<string, string | number | null>,
): PrismJsonObject {
  return Object.fromEntries(
    BOT_MUTATION_COLUMNS.map((column) => [column, values[column] ?? null]),
  ) as PrismJsonObject;
}

function normalizedColumns(
  row: BotMutationRow,
  patch: PrismJsonObject,
): Record<BotMutationColumn, string | number | null> {
  const next = Object.fromEntries(
    BOT_MUTATION_COLUMNS.map((column) => [column, row[column]]),
  ) as Record<BotMutationColumn, string | number | null>;

  if (own(patch, "name")) {
    if (typeof patch.name !== "string") throw new Error("name must be a string.");
    next.name = patch.name.slice(0, 160);
  }
  if (own(patch, "systemPrompt")) {
    if (typeof patch.systemPrompt !== "string") {
      throw new Error("systemPrompt must be a string.");
    }
    next.system_prompt = patch.systemPrompt;
  }
  for (const [key, column] of [
    ["onlineEnabled", "online_enabled"],
    ["deleteProtected", "delete_protected"],
    ["flirtEnabled", "flirt_enabled"],
    ["chatEnabled", "chat_enabled"],
  ] as const) {
    if (!own(patch, key)) continue;
    if (typeof patch[key] !== "boolean") {
      throw new Error(`${key} must be a boolean.`);
    }
    next[column] = patch[key] ? 1 : 0;
  }
  if (own(patch, "powers")) {
    next.powers_json = serializeBotPowersV1(patch.powers);
  }
  if (own(patch, "temperature")) {
    next.temperature = finiteNumber(patch.temperature, "temperature");
  }
  if (own(patch, "maxTokens")) {
    const value = finiteNumber(patch.maxTokens, "maxTokens");
    if (value <= 0) throw new Error("maxTokens must be positive.");
    next.max_tokens = Math.round(value);
  }
  if (own(patch, "topP")) next.top_p = normalizeTopP(patch.topP);
  if (own(patch, "topK")) next.top_k = normalizeTopK(patch.topK);
  if (own(patch, "repetitionPenalty")) {
    next.repetition_penalty = normalizeRepetitionPenalty(
      patch.repetitionPenalty,
    );
  }

  const nullableAvatarFields: Array<
    [
      string,
      BotMutationColumn,
      (value: unknown) => string | number | null,
      string,
    ]
  > = [
    ["faceEyesFont", "face_eyes_font", normalizeBotFaceFontId, "eye font"],
    [
      "faceEyeCharacter",
      "face_eye_character",
      normalizeBotFaceEyeCharacter,
      "eye character",
    ],
    ["faceMouthFont", "face_mouth_font", normalizeBotFaceFontId, "mouth font"],
    [
      "faceMouthCharacter",
      "face_mouth_character",
      normalizeBotFaceMouthCharacter,
      "mouth character",
    ],
    [
      "faceFontWeight",
      "face_font_weight",
      normalizeBotFaceFontWeight,
      "font weight",
    ],
    ["faceEyeScale", "face_eye_scale", normalizeBotFaceEyeScale, "eye scale"],
    [
      "faceEyeOffsetX",
      "face_eye_offset_x",
      normalizeBotFaceEyeOffsetX,
      "eye horizontal offset",
    ],
    [
      "faceEyeOffsetY",
      "face_eye_offset_y",
      normalizeBotFaceEyeOffsetY,
      "eye vertical offset",
    ],
    [
      "faceEyeRotationDeg",
      "face_eye_rotation_deg",
      normalizeBotFaceEyeRotationDeg,
      "eye rotation",
    ],
    [
      "faceMouthScale",
      "face_mouth_scale",
      normalizeBotFaceMouthScale,
      "mouth scale",
    ],
    [
      "faceMouthOffsetX",
      "face_mouth_offset_x",
      normalizeBotFaceMouthOffsetX,
      "mouth horizontal offset",
    ],
    [
      "faceMouthOffsetY",
      "face_mouth_offset_y",
      normalizeBotFaceMouthOffsetY,
      "mouth vertical offset",
    ],
    [
      "faceMouthRotationDeg",
      "face_mouth_rotation_deg",
      normalizeBotFaceMouthRotationDeg,
      "mouth rotation",
    ],
    [
      "faceBlinkScale",
      "face_blink_scale",
      normalizeBotFaceBlinkScale,
      "blink scale",
    ],
    [
      "faceBlinkOffsetX",
      "face_blink_offset_x",
      normalizeBotFaceBlinkOffsetX,
      "blink horizontal offset",
    ],
    [
      "faceBlinkOffsetY",
      "face_blink_offset_y",
      normalizeBotFaceBlinkOffsetY,
      "blink vertical offset",
    ],
    [
      "faceBlinkRotationDeg",
      "face_blink_rotation_deg",
      normalizeBotFaceBlinkRotationDeg,
      "blink rotation",
    ],
    [
      "faceThinkingScale",
      "face_thinking_scale",
      normalizeBotFaceThinkingScale,
      "thinking scale",
    ],
    [
      "faceThinkingOffsetX",
      "face_thinking_offset_x",
      normalizeBotFaceThinkingOffsetX,
      "thinking horizontal offset",
    ],
    [
      "faceThinkingOffsetY",
      "face_thinking_offset_y",
      normalizeBotFaceThinkingOffsetY,
      "thinking vertical offset",
    ],
  ];
  for (const [key, column, normalize, label] of nullableAvatarFields) {
    if (!own(patch, key)) continue;
    next[column] = normalizeNullable(patch[key], label, normalize);
  }
  if (own(patch, "faceEyeAnimation")) {
    const movement = normalizeBotFaceEyeMovement(patch.faceEyeAnimation);
    if (movement === null) throw new Error("Invalid face eye movement.");
    next.face_eye_animation = movement;
  }
  if (own(patch, "faceMouthAnimation")) {
    next.face_mouth_animation = normalizeNullable(
      patch.faceMouthAnimation,
      "mouth animation",
      normalizeBotFaceGlyphAnimation,
    );
  }
  if (own(patch, "faceMouthCoffeePucker")) {
    if (typeof patch.faceMouthCoffeePucker !== "boolean") {
      throw new Error("faceMouthCoffeePucker must be a boolean.");
    }
    next.face_mouth_coffee_pucker = patch.faceMouthCoffeePucker ? 1 : 0;
  }
  if (own(patch, "faceEyeCount")) {
    const count = normalizeBotFaceEyeCount(patch.faceEyeCount);
    if (count === null) throw new Error("Invalid custom eye count.");
    next.face_eye_count = count;
  }
  if (own(patch, "faceBlinkBar")) {
    const raw = patch.faceBlinkBar;
    const blink =
      typeof raw === "string" && raw.trim().length === 0
        ? DEFAULT_BOT_FACE_BLINK_BAR
        : normalizeNullable(raw, "blink bar", normalizeBotFaceBlinkBar);
    next.face_blink_bar = blink;
  }
  if (own(patch, "faceThinkingFrames")) {
    if (patch.faceThinkingFrames === null) {
      next.face_thinking_frames = null;
    } else {
      const frames = serializeBotFaceThinkingFrames(
        patch.faceThinkingFrames,
      );
      if (frames === null) throw new Error("Invalid face thinking frames.");
      next.face_thinking_frames = frames;
    }
  }
  if (own(patch, "avatarDetails")) {
    next.avatar_details_json =
      patch.avatarDetails === null
        ? null
        : serializeBotAvatarDetailsV1(patch.avatarDetails);
  }
  for (const [key, column] of [
    ["color", "color"],
    ["glyph", "glyph"],
  ] as const) {
    if (!own(patch, key)) continue;
    const raw = patch[key];
    if (raw === null) {
      next[column] = null;
    } else if (typeof raw === "string" && raw.trim()) {
      next[column] = raw.trim();
    } else if (typeof raw !== "string") {
      throw new Error(`${key} must be a string or null.`);
    }
  }
  if (own(patch, "voicePreviewLine")) {
    const line = normalizeVoicePreviewLine(patch.voicePreviewLine);
    if (patch.voicePreviewLine !== null && !line) {
      throw new Error("Invalid voice preview line.");
    }
    next.voice_preview_line = line || null;
  }
  if (own(patch, "namePronunciation")) {
    next.name_pronunciation = normalizeBotNamePronunciation(
      patch.namePronunciation,
    );
  }
  if (own(patch, "selfReferral")) {
    next.self_referral = normalizeBotSelfReferral(patch.selfReferral);
  }
  if (own(patch, "authoredAudioVoiceProfile")) {
    next.authored_audio_voice_profile = serializeBotAudioVoiceProfileV1(
      patch.authoredAudioVoiceProfile,
    );
  }
  if (own(patch, "audioVoiceProfileOverride")) {
    const override = normalizeOptionalBotAudioVoiceProfileV1(
      patch.audioVoiceProfileOverride,
    );
    if (patch.audioVoiceProfileOverride !== null && override === null) {
      throw new Error("Invalid audio voice profile override.");
    }
    next.audio_voice_profile_override = override
      ? serializeBotAudioVoiceProfileV1(override)
      : null;
  }
  return next;
}

export function prismBotPatchIsJournalable(
  body: Record<string, unknown>,
): boolean {
  if (
    Object.keys(body).some((key) => HUMAN_ONLY_BOT_PATCH_KEYS.has(key))
  ) {
    return false;
  }
  return Object.keys(body).some((key) =>
    PRISM_JOURNALED_BOT_PATCH_KEYS.has(key),
  );
}

export function validatePrismBotPatch(
  patch: PrismJsonObject,
): PrismJsonObject {
  if (
    Object.keys(patch).some((key) => HUMAN_ONLY_BOT_PATCH_KEYS.has(key))
  ) {
    throw new Error(
      "Profile-picture files and portable identity hashes require the Bot editor.",
    );
  }
  const filtered = Object.fromEntries(
    Object.entries(patch).filter(([key]) =>
      PRISM_JOURNALED_BOT_PATCH_KEYS.has(key),
    ),
  ) as PrismJsonObject;
  if (Object.keys(filtered).length === 0) {
    throw new Error("At least one supported bot field is required.");
  }
  return filtered;
}

export function previewPrismBotPatch(args: {
  db: DatabaseSync;
  userId: string;
  botId: string;
  patch: PrismJsonObject;
  expectedRevision?: string | null;
  now: Date;
}): PrismBotMutation {
  const patch = validatePrismBotPatch(args.patch);
  const row = rowForBot(args.db, args.userId, args.botId);
  if (args.expectedRevision && row.updated_at !== args.expectedRevision) {
    throw new Error(`${row.name} changed before this update.`);
  }
  const after = normalizedColumns(row, patch);
  const changedKeys = BOT_MUTATION_COLUMNS.filter(
    (column) => row[column] !== after[column],
  );
  return {
    botId: row.id,
    botName: row.name,
    before: jsonColumns(row),
    after: jsonColumns(after),
    previousRevision: row.updated_at,
    appliedRevision: args.now.toISOString(),
    changedKeys,
    profileChanged:
      changedKeys.includes("name") || changedKeys.includes("system_prompt"),
  };
}

function sqlValues(
  columns: readonly BotMutationColumn[],
  values: PrismJsonObject,
): Array<string | number | null> {
  return columns.map((column) => {
    const value: PrismJsonValue | undefined = values[column];
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number"
    ) {
      return value ?? null;
    }
    throw new Error(`Invalid persisted bot value for ${column}.`);
  });
}

export function applyPrismBotPatch(args: {
  db: DatabaseSync;
  userId: string;
  botId: string;
  patch: PrismJsonObject;
  expectedRevision?: string | null;
  now: Date;
}): PrismBotMutation {
  const mutation = previewPrismBotPatch(args);
  if (mutation.changedKeys.length === 0) return mutation;
  const changedColumns = mutation.changedKeys as BotMutationColumn[];
  const assignments = changedColumns.map((column) => `${column} = ?`);
  if (mutation.profileChanged) {
    assignments.push(
      "semantic_facets = NULL",
      "semantic_facets_source_hash = NULL",
      "semantic_facets_updated_at = NULL",
    );
  }
  assignments.push("updated_at = ?");
  const result = args.db
    .prepare(
      `UPDATE bots
          SET ${assignments.join(", ")}
        WHERE id = ? AND user_id = ? AND updated_at = ?`,
    )
    .run(
      ...sqlValues(changedColumns, mutation.after),
      mutation.appliedRevision,
      mutation.botId,
      args.userId,
      mutation.previousRevision,
    );
  if (result.changes !== 1) {
    throw new Error(`${mutation.botName} changed before apply.`);
  }
  return mutation;
}

export function undoPrismBotPatch(args: {
  db: DatabaseSync;
  userId: string;
  botId: string;
  before: PrismJsonObject;
  appliedRevision: string;
  restoredRevision: string;
}): void {
  const result = args.db
    .prepare(
      `UPDATE bots
          SET ${BOT_MUTATION_COLUMNS.map((column) => `${column} = ?`).join(", ")},
              semantic_facets = NULL,
              semantic_facets_source_hash = NULL,
              semantic_facets_updated_at = NULL,
              updated_at = ?
        WHERE id = ? AND user_id = ? AND updated_at = ?`,
    )
    .run(
      ...sqlValues(BOT_MUTATION_COLUMNS, args.before),
      args.restoredRevision,
      args.botId,
      args.userId,
      args.appliedRevision,
    );
  if (result.changes !== 1) {
    throw new Error("The bot changed after this action and cannot be undone.");
  }
}
