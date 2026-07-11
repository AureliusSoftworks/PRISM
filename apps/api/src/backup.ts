import type { DatabaseSync } from "node:sqlite";
import { decryptJson, decryptText, encryptJson, encryptText } from "./security.ts";
import { normalizeMemoryTier } from "./memory.ts";
import type { ProviderName } from "./providers.ts";
import {
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_GLYPH_ANIMATION,
  DEFAULT_BOT_FACE_THINKING_FRAMES,
  parseStoredBotAvatarDetailsV1,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeRotationDeg,
  normalizeBotFaceEyeScale,
  normalizeBotFaceFontId,
  normalizeBotFaceFontWeight,
  normalizeBotFaceGlyphAnimation,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceMouthOffsetX,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthRotationDeg,
  normalizeBotFaceMouthScale,
  parseStoredBotFaceThinkingFrames,
  serializeBotFaceThinkingFrames,
  serializeBotAvatarDetailsV1,
  type BotAvatarDetailsV1,
  type BotFaceBlinkBar,
  type BotFaceFontId,
  type BotFaceGlyphAnimation,
  type BotFaceThinkingFrames,
} from "@localai/shared";
import {
  normalizeZenAskQuestionPatienceEnabled,
  normalizeZenAskQuestionPatienceMs,
  normalizeZenAutonomyEnabled,
  normalizeZenMessageFontMaxPx,
  normalizeZenMessageFontMinPx,
  normalizeZenWallpaperBlurredEdgesEnabled,
  normalizeZenWallpaperGrayscaleEnabled,
  normalizeZenWallpaperOpacity,
  normalizeZenWallpaperStyleNotes,
  normalizeZenWallpaperTextMaskEnabled,
} from "./settings.ts";

export interface BackupUserSettings {
  theme: "light" | "dark" | "system";
  preferredProvider: ProviderName;
  providerLocked: boolean;
  autoMemory: boolean;
  composerWritingAssist: boolean;
  experimentalDualOllamaEnabled: boolean;
  experimentalAllModelEffortEnabled?: boolean;
  coffeeExperimentalTableAngleEnabled?: boolean;
  psychicModeEnabled?: boolean;
  fallbackModelMessageStripe: boolean;
  hiddenBotModelIds: string[];
  hiddenComfyUiWorkflowIds: string[];
  preferredLocalModel: string;
  preferredOnlineModel: string;
  lenientLocalFallbackModel: string;
  lenientLocalImageFallbackModel: string;
  secondaryOllamaHost: string;
  comfyUiHost: string;
  comfyUiWorkflows: unknown[];
  preferredLocalImageModel: string;
  preferredOpenAiImageModel: string;
  preferredZenWallpaperLocalImageModel: string;
  preferredZenWallpaperOpenAiImageModel: string;
  zenWallpaperOpacity: number;
  zenWallpaperTextMaskEnabled: boolean;
  zenWallpaperGrayscaleEnabled: boolean;
  zenWallpaperBlurredEdgesEnabled: boolean;
  zenWallpaperStyleNotes: string;
  zenMessageFontMinPx?: number;
  zenMessageFontMaxPx?: number;
  zenAskQuestionPatienceEnabled: boolean;
  zenAskQuestionPatienceMs: number;
  zenAutonomyEnabled: boolean;
  prismDefaultBotFaceThinkingFrames?: BotFaceThinkingFrames | null;
  prismDefaultLlmModel: string;
  prismImageToolLlmModel: string;
  devMemoriesEnabled: boolean;
  devMemoriesText: string;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  elevenLabsApiKey?: string;
}

export interface BackupBotSnapshot {
  id: string;
  name: string;
  systemPrompt: string;
  exportHash?: string | null;
  model?: string | null;
  localModel?: string | null;
  onlineModel?: string | null;
  localImageModel?: string | null;
  openaiImageModel?: string | null;
  onlineEnabled: boolean;
  deleteProtected: boolean;
  flirtEnabled: boolean;
  temperature: number;
  maxTokens: number;
  topP?: number;
  topK?: number;
  repetitionPenalty?: number;
  color?: string | null;
  glyph?: string | null;
  avatarDetails?: BotAvatarDetailsV1 | null;
  faceEyesFont?: BotFaceFontId | null;
  faceEyeCharacter?: string | null;
  faceMouthFont?: BotFaceFontId | null;
  faceMouthCharacter?: string | null;
  faceMouthAnimation?: BotFaceGlyphAnimation | null;
  faceFontWeight?: number | null;
  faceEyeScale?: number | null;
  faceEyeOffsetX?: number | null;
  faceEyeOffsetY?: number | null;
  faceEyeRotationDeg?: number | null;
  faceMouthScale?: number | null;
  faceMouthOffsetX?: number | null;
  faceMouthOffsetY?: number | null;
  faceMouthRotationDeg?: number | null;
  faceBlinkBar?: BotFaceBlinkBar | null;
  faceThinkingFrames?: BotFaceThinkingFrames | null;
  chatEnabled: boolean;
  visibility: "private" | "public";
  createdAt: string;
  updatedAt: string;
}

export interface BackupSnapshot {
  version: 1;
  exportedAt: string;
  settings?: BackupUserSettings;
  bots?: BackupBotSnapshot[];
  conversations: Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
      /** Optional; older v1 snapshots omit this. */
      provider?: ProviderName;
      /** Optional; older v1 snapshots (pre-model tracking) omit this. */
      model?: string;
      /** Optional; older v1 snapshots (pre-per-message bot tracking) omit this. */
      botId?: string;
      /** Serialized AskQuestion envelope; optional snapshots omit this. */
      toolPayload?: string;
    }>;
  }>;
  memories: Array<{
    id: string;
    conversationId?: string;
    botId?: string;
    confidence: number;
    category?: "general" | "user" | "bot_relation";
    tier?: "short_term" | "long_term";
    durability?: number;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
}

export interface BackupAdapter {
  upload(userId: string, payload: BackupSnapshot): Promise<void>;
  download(userId: string): Promise<BackupSnapshot | null>;
  listVersions(userId: string): Promise<string[]>;
}

export class LocalOnlyBackupAdapter implements BackupAdapter {
  private readonly snapshots = new Map<string, BackupSnapshot>();

  public async upload(userId: string, payload: BackupSnapshot): Promise<void> {
    this.snapshots.set(userId, payload);
  }

  public async download(userId: string): Promise<BackupSnapshot | null> {
    return this.snapshots.get(userId) ?? null;
  }

  public async listVersions(userId: string): Promise<string[]> {
    const snapshot = this.snapshots.get(userId);
    return snapshot ? [snapshot.exportedAt] : [];
  }
}

export function exportUserSnapshot(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer
): BackupSnapshot {
  const user = db
    .prepare(
      `SELECT
         theme,
         preferred_provider,
         provider_locked,
         auto_memory,
         composer_writing_assist,
         experimental_dual_ollama_enabled,
         experimental_all_model_effort_enabled,
         coffee_experimental_table_angle_enabled,
         psychic_mode_enabled,
         fallback_model_message_stripe,
         hidden_bot_model_ids,
         hidden_comfyui_workflow_ids,
         preferred_local_model,
         preferred_online_model,
         lenient_local_fallback_model,
         lenient_local_image_fallback_model,
         secondary_ollama_host,
         comfyui_host,
         comfyui_workflows,
         preferred_local_image_model,
         preferred_openai_image_model,
         preferred_zen_wallpaper_local_image_model,
         preferred_zen_wallpaper_openai_image_model,
         zen_wallpaper_opacity,
         zen_wallpaper_text_mask_enabled,
         zen_wallpaper_grayscale_enabled,
         zen_wallpaper_blurred_edges_enabled,
         zen_wallpaper_style_notes,
         zen_message_font_min_px,
         zen_message_font_max_px,
         zen_ask_question_patience_enabled,
         zen_ask_question_patience_ms,
         zen_autonomy_enabled,
         prism_default_bot_face_thinking_frames,
         prism_default_llm_model,
         prism_image_tool_llm_model,
         dev_memories_enabled,
         dev_memories_text,
         openai_key_ciphertext,
         openai_key_iv,
         openai_key_tag,
         anthropic_key_ciphertext,
         anthropic_key_iv,
         anthropic_key_tag,
         elevenlabs_key_ciphertext,
         elevenlabs_key_iv,
         elevenlabs_key_tag
       FROM users
       WHERE id = ?`
    )
    .get(userId) as
    | {
        theme: "light" | "dark" | "system";
        preferred_provider: ProviderName;
        provider_locked: number;
        auto_memory: number;
        composer_writing_assist: number;
        experimental_dual_ollama_enabled: number;
        experimental_all_model_effort_enabled: number;
        coffee_experimental_table_angle_enabled: number;
        psychic_mode_enabled: number;
        fallback_model_message_stripe: number;
        hidden_bot_model_ids: string | null;
        hidden_comfyui_workflow_ids: string | null;
        preferred_local_model: string | null;
        preferred_online_model: string | null;
        lenient_local_fallback_model: string | null;
        lenient_local_image_fallback_model: string | null;
        secondary_ollama_host: string | null;
        comfyui_host: string | null;
        comfyui_workflows: string | null;
        preferred_local_image_model: string | null;
        preferred_openai_image_model: string | null;
        preferred_zen_wallpaper_local_image_model: string | null;
        preferred_zen_wallpaper_openai_image_model: string | null;
        zen_wallpaper_opacity: number | null;
        zen_wallpaper_text_mask_enabled: number | null;
        zen_wallpaper_grayscale_enabled: number | null;
        zen_wallpaper_blurred_edges_enabled: number | null;
        zen_wallpaper_style_notes: string | null;
        zen_message_font_min_px: number | null;
        zen_message_font_max_px: number | null;
        zen_ask_question_patience_enabled: number | null;
        zen_ask_question_patience_ms: number | null;
        zen_autonomy_enabled: number | null;
        prism_default_bot_face_thinking_frames: string | null;
        prism_default_llm_model: string | null;
        prism_image_tool_llm_model: string | null;
        dev_memories_enabled: number;
        dev_memories_text: string | null;
        openai_key_ciphertext: string | null;
        openai_key_iv: string | null;
        openai_key_tag: string | null;
        anthropic_key_ciphertext: string | null;
        anthropic_key_iv: string | null;
        anthropic_key_tag: string | null;
        elevenlabs_key_ciphertext: string | null;
        elevenlabs_key_iv: string | null;
        elevenlabs_key_tag: string | null;
      }
    | undefined;
  const settings: BackupUserSettings | undefined = user
    ? {
        theme: user.theme,
        preferredProvider: user.preferred_provider,
        providerLocked: user.provider_locked === 1,
        autoMemory: user.auto_memory === 1,
        composerWritingAssist: user.composer_writing_assist !== 0,
        experimentalDualOllamaEnabled: user.experimental_dual_ollama_enabled === 1,
        experimentalAllModelEffortEnabled:
          user.experimental_all_model_effort_enabled === 1,
        coffeeExperimentalTableAngleEnabled:
          user.coffee_experimental_table_angle_enabled === 1,
        psychicModeEnabled: user.psychic_mode_enabled === 1,
        fallbackModelMessageStripe: user.fallback_model_message_stripe !== 0,
        hiddenBotModelIds: safeParseStringArray(user.hidden_bot_model_ids),
        hiddenComfyUiWorkflowIds: safeParseStringArray(user.hidden_comfyui_workflow_ids),
        preferredLocalModel: user.preferred_local_model ?? "",
        preferredOnlineModel: user.preferred_online_model ?? "",
        lenientLocalFallbackModel: user.lenient_local_fallback_model ?? "",
        lenientLocalImageFallbackModel: user.lenient_local_image_fallback_model ?? "",
        secondaryOllamaHost: user.secondary_ollama_host ?? "",
        comfyUiHost: user.comfyui_host ?? "",
        comfyUiWorkflows: safeParseArray(user.comfyui_workflows),
        preferredLocalImageModel: user.preferred_local_image_model ?? "",
        preferredOpenAiImageModel: user.preferred_openai_image_model ?? "",
        preferredZenWallpaperLocalImageModel:
          user.preferred_zen_wallpaper_local_image_model ?? "",
        preferredZenWallpaperOpenAiImageModel:
          user.preferred_zen_wallpaper_openai_image_model ?? "",
        zenWallpaperOpacity: normalizeZenWallpaperOpacity(
          user.zen_wallpaper_opacity
        ),
        zenWallpaperTextMaskEnabled: normalizeZenWallpaperTextMaskEnabled(
          user.zen_wallpaper_text_mask_enabled
        ),
        zenWallpaperGrayscaleEnabled: normalizeZenWallpaperGrayscaleEnabled(
          user.zen_wallpaper_grayscale_enabled
        ),
        zenWallpaperBlurredEdgesEnabled: normalizeZenWallpaperBlurredEdgesEnabled(
          user.zen_wallpaper_blurred_edges_enabled
        ),
        zenWallpaperStyleNotes: normalizeZenWallpaperStyleNotes(
          user.zen_wallpaper_style_notes
        ),
        zenMessageFontMinPx: normalizeZenMessageFontMinPx(
          user.zen_message_font_min_px
        ),
        zenMessageFontMaxPx: normalizeZenMessageFontMaxPx(
          user.zen_message_font_max_px,
          undefined,
          normalizeZenMessageFontMinPx(user.zen_message_font_min_px)
        ),
        zenAskQuestionPatienceEnabled: normalizeZenAskQuestionPatienceEnabled(
          user.zen_ask_question_patience_enabled
        ),
        zenAskQuestionPatienceMs: normalizeZenAskQuestionPatienceMs(
          user.zen_ask_question_patience_ms
        ),
        zenAutonomyEnabled: normalizeZenAutonomyEnabled(
          user.zen_autonomy_enabled
        ),
        prismDefaultBotFaceThinkingFrames:
          parseStoredBotFaceThinkingFrames(
            user.prism_default_bot_face_thinking_frames
          ) ?? DEFAULT_BOT_FACE_THINKING_FRAMES,
        prismDefaultLlmModel: user.prism_default_llm_model ?? "",
        prismImageToolLlmModel: user.prism_image_tool_llm_model ?? "",
        devMemoriesEnabled: user.dev_memories_enabled === 1,
        devMemoriesText: user.dev_memories_text ?? "",
        ...(user.openai_key_ciphertext && user.openai_key_iv && user.openai_key_tag
          ? {
              openAiApiKey: decryptText(
                {
                  ciphertext: user.openai_key_ciphertext,
                  iv: user.openai_key_iv,
                  tag: user.openai_key_tag,
                },
                userKey
              ),
            }
          : {}),
        ...(user.anthropic_key_ciphertext &&
        user.anthropic_key_iv &&
        user.anthropic_key_tag
          ? {
              anthropicApiKey: decryptText(
                {
                  ciphertext: user.anthropic_key_ciphertext,
                  iv: user.anthropic_key_iv,
                  tag: user.anthropic_key_tag,
                },
                userKey
              ),
            }
          : {}),
        ...(user.elevenlabs_key_ciphertext &&
        user.elevenlabs_key_iv &&
        user.elevenlabs_key_tag
          ? {
              elevenLabsApiKey: decryptText(
                {
                  ciphertext: user.elevenlabs_key_ciphertext,
                  iv: user.elevenlabs_key_iv,
                  tag: user.elevenlabs_key_tag,
                },
                userKey
              ),
            }
          : {}),
      }
    : undefined;
  const bots = db
    .prepare(
      `SELECT
         id,
         name,
         system_prompt,
         export_hash,
         model,
         local_model,
         online_model,
         local_image_model,
         openai_image_model,
         online_enabled,
         delete_protected,
         flirt_enabled,
	         temperature,
	         max_tokens,
	         top_p,
	         top_k,
	         repetition_penalty,
         color,
         glyph,
         avatar_details_json,
         face_eyes_font,
         face_eye_character,
         face_eye_animation,
         face_mouth_font,
         face_mouth_character,
         face_mouth_animation,
         face_font_weight,
         face_eye_scale,
         face_eye_offset_x,
         face_eye_offset_y,
         face_eye_rotation_deg,
         face_mouth_scale,
         face_mouth_offset_x,
         face_mouth_offset_y,
         face_mouth_rotation_deg,
         face_blink_bar,
         face_thinking_frames,
         chat_enabled,
         visibility,
         created_at,
         updated_at
       FROM bots
       WHERE user_id = ?
       ORDER BY updated_at DESC`
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    system_prompt: string;
    export_hash: string | null;
    model: string | null;
    local_model: string | null;
    online_model: string | null;
    local_image_model: string | null;
    openai_image_model: string | null;
    online_enabled: number;
    delete_protected: number;
    flirt_enabled: number;
	    temperature: number | null;
	    max_tokens: number | null;
	    top_p: number | null;
	    top_k: number | null;
	    repetition_penalty: number | null;
	    color: string | null;
    glyph: string | null;
    avatar_details_json: string | null;
    face_eyes_font: string | null;
    face_eye_character: string | null;
    face_eye_animation: string | null;
    face_mouth_font: string | null;
    face_mouth_character: string | null;
    face_mouth_animation: string | null;
    face_font_weight: number | null;
    face_eye_scale: number | null;
    face_eye_offset_x: number | null;
    face_eye_offset_y: number | null;
    face_eye_rotation_deg: number | null;
    face_mouth_scale: number | null;
    face_mouth_offset_x: number | null;
    face_mouth_offset_y: number | null;
    face_mouth_rotation_deg: number | null;
    face_blink_bar: string | null;
    face_thinking_frames: string | null;
    chat_enabled: number;
    visibility: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const conversations = db
    .prepare(
      "SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC"
    )
    .all(userId) as Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
  }>;

  const conversationPayload = conversations.map((conversation) => {
    const messages = db
      .prepare(
        "SELECT id, role, content, provider, model, bot_id, tool_payload, created_at FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC"
      )
      .all(conversation.id, userId) as Array<{
      id: string;
      role: string;
      content: string;
      provider: string | null;
      model: string | null;
      bot_id: string | null;
      tool_payload: string | null;
      created_at: string;
    }>;
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      messages: messages.map((message) => {
        const provider: ProviderName | undefined =
          message.provider === "local" ||
          message.provider === "openai" ||
          message.provider === "anthropic"
            ? message.provider
            : undefined;
        const botId: string | undefined = message.bot_id ?? undefined;
        const model: string | undefined = message.model ?? undefined;
        const toolPayload =
          typeof message.tool_payload === "string" && message.tool_payload.trim().length > 0
            ? message.tool_payload
            : undefined;
        return {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.created_at,
          provider,
          model,
          botId,
          ...(toolPayload ? { toolPayload } : {}),
        };
      }),
    };
  });

  const memories = db
    .prepare(
      "SELECT id, conversation_id, bot_id, confidence, category, tier, durability, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(userId) as Array<{
    id: string;
    conversation_id: string | null;
    bot_id: string | null;
    confidence: number;
    category: "general" | "user" | "bot_relation";
    tier: "short_term" | "long_term";
    durability: number | null;
    ciphertext: string;
    iv: string;
    tag: string;
    created_at: string;
  }>;

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    bots: bots.map((bot) => ({
        id: bot.id,
        name: bot.name,
        systemPrompt: bot.system_prompt,
        exportHash: bot.export_hash,
        model: bot.model,
        localModel: bot.local_model,
        onlineModel: bot.online_model,
        localImageModel: bot.local_image_model,
        openaiImageModel: bot.openai_image_model,
        onlineEnabled: bot.online_enabled !== 0,
        deleteProtected: bot.delete_protected === 1,
        flirtEnabled: bot.flirt_enabled === 1,
        temperature: typeof bot.temperature === "number" ? bot.temperature : 0.7,
        maxTokens: typeof bot.max_tokens === "number" ? bot.max_tokens : 2048,
        topP: typeof bot.top_p === "number" ? bot.top_p : 1,
        topK: typeof bot.top_k === "number" ? bot.top_k : 40,
        repetitionPenalty:
          typeof bot.repetition_penalty === "number" ? bot.repetition_penalty : 1.1,
        color: bot.color,
        glyph: bot.glyph,
        avatarDetails: parseStoredBotAvatarDetailsV1(bot.avatar_details_json),
        faceEyesFont: normalizeBotFaceFontId(bot.face_eyes_font),
        faceEyeCharacter: normalizeBotFaceEyeCharacter(bot.face_eye_character),
        faceMouthFont: normalizeBotFaceFontId(bot.face_mouth_font),
        faceMouthCharacter: normalizeBotFaceMouthCharacter(bot.face_mouth_character),
        faceMouthAnimation: normalizeBotFaceGlyphAnimation(bot.face_mouth_animation),
        faceFontWeight: normalizeBotFaceFontWeight(bot.face_font_weight),
        faceEyeScale: normalizeBotFaceEyeScale(bot.face_eye_scale),
        faceEyeOffsetX: normalizeBotFaceEyeOffsetX(bot.face_eye_offset_x),
        faceEyeOffsetY: normalizeBotFaceEyeOffsetY(bot.face_eye_offset_y),
        faceEyeRotationDeg: normalizeBotFaceEyeRotationDeg(bot.face_eye_rotation_deg),
        faceMouthScale: normalizeBotFaceMouthScale(bot.face_mouth_scale),
        faceMouthOffsetX: normalizeBotFaceMouthOffsetX(bot.face_mouth_offset_x),
        faceMouthOffsetY: normalizeBotFaceMouthOffsetY(bot.face_mouth_offset_y),
        faceMouthRotationDeg: normalizeBotFaceMouthRotationDeg(
          bot.face_mouth_rotation_deg
        ),
        faceBlinkBar:
          normalizeBotFaceBlinkBar(bot.face_blink_bar) ??
          DEFAULT_BOT_FACE_BLINK_BAR,
        faceThinkingFrames:
          parseStoredBotFaceThinkingFrames(bot.face_thinking_frames) ??
          DEFAULT_BOT_FACE_THINKING_FRAMES,
        chatEnabled: bot.chat_enabled !== 0,
        visibility: bot.visibility === "public" ? "public" : "private",
        createdAt: bot.created_at,
        updatedAt: bot.updated_at,
      })),
    conversations: conversationPayload,
    memories: memories.map((memory) => ({
      id: memory.id,
      conversationId: memory.conversation_id ?? undefined,
      botId: memory.bot_id ?? undefined,
      confidence: memory.confidence,
      category: memory.category,
      tier: memory.tier,
      durability: memory.durability ?? undefined,
      createdAt: memory.created_at,
      payload: decryptJson(
        {
          ciphertext: memory.ciphertext,
          iv: memory.iv,
          tag: memory.tag
        },
        userKey
      )
    }))
  };
}

function assertSnapshotIdsStayWithinTenant(
  db: DatabaseSync,
  userId: string,
  snapshot: BackupSnapshot
): void {
  const assertIds = (
    table: "bots" | "conversations" | "messages" | "memories",
    ids: readonly string[]
  ): void => {
    const seen = new Set<string>();
    const findOwner = db.prepare(`SELECT user_id FROM ${table} WHERE id = ?`);
    for (const rawId of ids) {
      const id = rawId.trim();
      if (!id) continue;
      if (seen.has(id)) {
        throw new Error(`Account backup contains a duplicate ${table} id.`);
      }
      seen.add(id);
      const row = findOwner.get(id) as { user_id?: string } | undefined;
      if (row?.user_id && row.user_id !== userId) {
        throw new Error(`Account backup ${table} id belongs to another user.`);
      }
    }
  };

  const conversations = Array.isArray(snapshot.conversations)
    ? snapshot.conversations
    : [];
  assertIds(
    "bots",
    Array.isArray(snapshot.bots)
      ? snapshot.bots.flatMap((bot) =>
          bot && typeof bot.id === "string" ? [bot.id] : []
        )
      : []
  );
  assertIds(
    "conversations",
    conversations.flatMap((conversation) =>
      conversation && typeof conversation.id === "string"
        ? [conversation.id]
        : []
    )
  );
  assertIds(
    "messages",
    conversations.flatMap((conversation) =>
      Array.isArray(conversation?.messages)
        ? conversation.messages.flatMap((message) =>
            message && typeof message.id === "string" ? [message.id] : []
          )
        : []
    )
  );
  assertIds(
    "memories",
    Array.isArray(snapshot.memories)
      ? snapshot.memories.flatMap((memory) =>
          memory && typeof memory.id === "string" ? [memory.id] : []
        )
      : []
  );
}

export function importUserSnapshot(
  db: DatabaseSync,
  userId: string,
  snapshot: BackupSnapshot,
  userKey: Buffer
): void {
  const snapshotRecord = snapshot as unknown as Record<string, unknown>;
  const unsupportedSnapshotField = Object.keys(snapshotRecord).find((key) => {
    const normalized = key.toLowerCase().replace(/[^a-z]/gu, "");
    return /(?:accessor|avatar|portrait|png|svg|imageasset|imagepayload|raster)/u.test(
      normalized
    );
  });
  if (unsupportedSnapshotField) {
    throw new Error(
      `Account backup contains unsupported raster data field: ${unsupportedSnapshotField}.`
    );
  }
  validateBackupBotAvatarDetails(snapshot.bots);
  db.exec("BEGIN IMMEDIATE;");
  try {
    assertSnapshotIdsStayWithinTenant(db, userId, snapshot);
    importUserSnapshotWithinTransaction(db, userId, snapshot, userKey);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

function importUserSnapshotWithinTransaction(
  db: DatabaseSync,
  userId: string,
  snapshot: BackupSnapshot,
  userKey: Buffer
): void {
  if (snapshot.settings) {
    const settings = snapshot.settings;
    const openAiApiKey =
      typeof settings.openAiApiKey === "string" && settings.openAiApiKey.length > 0
        ? settings.openAiApiKey
        : null;
    const anthropicApiKey =
      typeof settings.anthropicApiKey === "string" && settings.anthropicApiKey.length > 0
        ? settings.anthropicApiKey
        : null;
    const elevenLabsApiKey =
      typeof settings.elevenLabsApiKey === "string" && settings.elevenLabsApiKey.length > 0
        ? settings.elevenLabsApiKey
        : null;
    const encryptedOpenAiKey = openAiApiKey ? encryptText(openAiApiKey, userKey) : null;
    const encryptedAnthropicKey = anthropicApiKey
      ? encryptText(anthropicApiKey, userKey)
      : null;
    const encryptedElevenLabsKey = elevenLabsApiKey
      ? encryptText(elevenLabsApiKey, userKey)
      : null;
    const zenMessageFontMinPx = normalizeZenMessageFontMinPx(
      settings.zenMessageFontMinPx
    );
    const zenMessageFontMaxPx = normalizeZenMessageFontMaxPx(
      settings.zenMessageFontMaxPx,
      undefined,
      zenMessageFontMinPx
    );
    db.prepare(`
      UPDATE users
      SET
        theme = ?,
        preferred_provider = ?,
        provider_locked = ?,
        auto_memory = ?,
        composer_writing_assist = ?,
        experimental_dual_ollama_enabled = ?,
        experimental_all_model_effort_enabled = ?,
        coffee_experimental_table_angle_enabled = ?,
        psychic_mode_enabled = ?,
        fallback_model_message_stripe = ?,
        hidden_bot_model_ids = ?,
        hidden_comfyui_workflow_ids = ?,
        preferred_local_model = ?,
        preferred_online_model = ?,
        lenient_local_fallback_model = ?,
        lenient_local_image_fallback_model = ?,
        secondary_ollama_host = ?,
        comfyui_host = ?,
        comfyui_workflows = ?,
        preferred_local_image_model = ?,
        preferred_openai_image_model = ?,
        preferred_zen_wallpaper_local_image_model = ?,
        preferred_zen_wallpaper_openai_image_model = ?,
        zen_wallpaper_opacity = ?,
        zen_wallpaper_text_mask_enabled = ?,
        zen_wallpaper_grayscale_enabled = ?,
        zen_wallpaper_blurred_edges_enabled = ?,
        zen_wallpaper_style_notes = ?,
        zen_message_font_min_px = ?,
        zen_message_font_max_px = ?,
        zen_ask_question_patience_enabled = ?,
        zen_ask_question_patience_ms = ?,
        zen_autonomy_enabled = ?,
        prism_default_bot_face_thinking_frames = ?,
        prism_default_llm_model = ?,
        prism_image_tool_llm_model = ?,
        dev_memories_enabled = ?,
        dev_memories_text = ?,
        openai_key_ciphertext = ?,
        openai_key_iv = ?,
        openai_key_tag = ?,
        anthropic_key_ciphertext = ?,
        anthropic_key_iv = ?,
        anthropic_key_tag = ?,
        elevenlabs_key_ciphertext = ?,
        elevenlabs_key_iv = ?,
        elevenlabs_key_tag = ?
      WHERE id = ?
    `).run(
      settings.theme === "light" || settings.theme === "dark" ? settings.theme : "system",
      settings.preferredProvider === "openai" || settings.preferredProvider === "anthropic"
        ? settings.preferredProvider
        : "local",
      settings.providerLocked ? 1 : 0,
      settings.autoMemory ? 1 : 0,
      settings.composerWritingAssist ? 1 : 0,
      settings.experimentalDualOllamaEnabled ? 1 : 0,
      settings.experimentalAllModelEffortEnabled === true ? 1 : 0,
      settings.coffeeExperimentalTableAngleEnabled === true ? 1 : 0,
      settings.psychicModeEnabled === true ? 1 : 0,
      settings.fallbackModelMessageStripe ? 1 : 0,
      JSON.stringify(
        Array.isArray(settings.hiddenBotModelIds)
          ? settings.hiddenBotModelIds.filter(
              (value): value is string => typeof value === "string" && value.trim().length > 0
            )
          : []
      ),
      JSON.stringify(
        Array.isArray(settings.hiddenComfyUiWorkflowIds)
          ? settings.hiddenComfyUiWorkflowIds.filter(
              (value): value is string => typeof value === "string" && value.trim().length > 0
            )
          : []
      ),
      settings.preferredLocalModel?.trim() ?? "",
      settings.preferredOnlineModel?.trim() ?? "",
      settings.lenientLocalFallbackModel?.trim() ?? "",
      settings.lenientLocalImageFallbackModel?.trim() ?? "",
      settings.secondaryOllamaHost?.trim() ?? "",
      settings.comfyUiHost?.trim() ?? "",
      JSON.stringify(Array.isArray(settings.comfyUiWorkflows) ? settings.comfyUiWorkflows : []),
      settings.preferredLocalImageModel?.trim() ?? "",
      settings.preferredOpenAiImageModel?.trim() ?? "",
      settings.preferredZenWallpaperLocalImageModel?.trim() ?? "",
      settings.preferredZenWallpaperOpenAiImageModel?.trim() ?? "",
      normalizeZenWallpaperOpacity(settings.zenWallpaperOpacity),
      normalizeZenWallpaperTextMaskEnabled(settings.zenWallpaperTextMaskEnabled) ? 1 : 0,
      normalizeZenWallpaperGrayscaleEnabled(settings.zenWallpaperGrayscaleEnabled) ? 1 : 0,
      normalizeZenWallpaperBlurredEdgesEnabled(settings.zenWallpaperBlurredEdgesEnabled)
        ? 1
        : 0,
      normalizeZenWallpaperStyleNotes(settings.zenWallpaperStyleNotes),
      zenMessageFontMinPx,
      zenMessageFontMaxPx,
      normalizeZenAskQuestionPatienceEnabled(settings.zenAskQuestionPatienceEnabled) ? 1 : 0,
      normalizeZenAskQuestionPatienceMs(settings.zenAskQuestionPatienceMs),
      normalizeZenAutonomyEnabled(settings.zenAutonomyEnabled) ? 1 : 0,
      serializeBotFaceThinkingFrames(settings.prismDefaultBotFaceThinkingFrames),
      settings.prismDefaultLlmModel?.trim() ?? "",
      settings.prismImageToolLlmModel?.trim() ?? "",
      settings.devMemoriesEnabled ? 1 : 0,
      settings.devMemoriesText ?? "",
      encryptedOpenAiKey?.ciphertext ?? null,
      encryptedOpenAiKey?.iv ?? null,
      encryptedOpenAiKey?.tag ?? null,
      encryptedAnthropicKey?.ciphertext ?? null,
      encryptedAnthropicKey?.iv ?? null,
      encryptedAnthropicKey?.tag ?? null,
      encryptedElevenLabsKey?.ciphertext ?? null,
      encryptedElevenLabsKey?.iv ?? null,
      encryptedElevenLabsKey?.tag ?? null,
      userId
    );
  }

  if (Array.isArray(snapshot.bots)) {
    const insertBot = db.prepare(`
      INSERT OR REPLACE INTO bots (
        id,
        user_id,
        name,
        system_prompt,
        export_hash,
        model,
        local_model,
        online_model,
        local_image_model,
        openai_image_model,
        online_enabled,
        delete_protected,
	        flirt_enabled,
	        temperature,
	        max_tokens,
	        top_p,
	        top_k,
	        repetition_penalty,
        color,
        glyph,
        avatar_details_json,
        face_eyes_font,
        face_eye_character,
        face_eye_animation,
        face_mouth_font,
        face_mouth_character,
        face_mouth_animation,
        face_font_weight,
        face_eye_scale,
        face_eye_offset_x,
        face_eye_offset_y,
        face_eye_rotation_deg,
        face_mouth_scale,
        face_mouth_offset_x,
        face_mouth_offset_y,
        face_mouth_rotation_deg,
        face_blink_bar,
        face_thinking_frames,
        chat_enabled,
        visibility,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const bot of snapshot.bots) {
      if (!bot || typeof bot.id !== "string" || bot.id.trim().length === 0) continue;
      const now = new Date().toISOString();
      insertBot.run(
        bot.id.trim(),
        userId,
        typeof bot.name === "string" && bot.name.trim().length > 0 ? bot.name.trim() : "Imported Bot",
        typeof bot.systemPrompt === "string" ? bot.systemPrompt : "",
        typeof bot.exportHash === "string" && bot.exportHash.trim().length > 0
          ? bot.exportHash.trim().toLowerCase()
          : null,
        typeof bot.model === "string" && bot.model.trim().length > 0 ? bot.model.trim() : null,
        typeof bot.localModel === "string" && bot.localModel.trim().length > 0
          ? bot.localModel.trim()
          : null,
        typeof bot.onlineModel === "string" && bot.onlineModel.trim().length > 0
          ? bot.onlineModel.trim()
          : null,
        typeof bot.localImageModel === "string" && bot.localImageModel.trim().length > 0
          ? bot.localImageModel.trim()
          : null,
        typeof bot.openaiImageModel === "string" && bot.openaiImageModel.trim().length > 0
          ? bot.openaiImageModel.trim()
          : null,
        bot.onlineEnabled === false ? 0 : 1,
        bot.deleteProtected === true ? 1 : 0,
	        bot.flirtEnabled === true ? 1 : 0,
	        typeof bot.temperature === "number" ? bot.temperature : 0.7,
	        typeof bot.maxTokens === "number" ? Math.max(1, Math.floor(bot.maxTokens)) : 2048,
	        typeof bot.topP === "number" ? Math.min(1, Math.max(0, bot.topP)) : 1,
	        typeof bot.topK === "number" ? Math.max(0, Math.floor(bot.topK)) : 40,
	        typeof bot.repetitionPenalty === "number"
	          ? Math.min(2, Math.max(0.5, bot.repetitionPenalty))
	          : 1.1,
	        typeof bot.color === "string" && bot.color.trim().length > 0 ? bot.color.trim() : null,
        typeof bot.glyph === "string" && bot.glyph.trim().length > 0 ? bot.glyph.trim() : null,
        bot.avatarDetails === undefined || bot.avatarDetails === null
          ? null
          : serializeBotAvatarDetailsV1(bot.avatarDetails),
        normalizeBotFaceFontId(bot.faceEyesFont),
        normalizeBotFaceEyeCharacter(bot.faceEyeCharacter),
        DEFAULT_BOT_FACE_GLYPH_ANIMATION,
        normalizeBotFaceFontId(bot.faceMouthFont),
        normalizeBotFaceMouthCharacter(bot.faceMouthCharacter),
        normalizeBotFaceGlyphAnimation(bot.faceMouthAnimation),
        normalizeBotFaceFontWeight(bot.faceFontWeight),
        normalizeBotFaceEyeScale(bot.faceEyeScale),
        normalizeBotFaceEyeOffsetX(bot.faceEyeOffsetX),
        normalizeBotFaceEyeOffsetY(bot.faceEyeOffsetY),
        normalizeBotFaceEyeRotationDeg(bot.faceEyeRotationDeg),
        normalizeBotFaceMouthScale(bot.faceMouthScale),
        normalizeBotFaceMouthOffsetX(bot.faceMouthOffsetX),
        normalizeBotFaceMouthOffsetY(bot.faceMouthOffsetY),
        normalizeBotFaceMouthRotationDeg(bot.faceMouthRotationDeg),
        normalizeBotFaceBlinkBar(bot.faceBlinkBar) ?? DEFAULT_BOT_FACE_BLINK_BAR,
        serializeBotFaceThinkingFrames(bot.faceThinkingFrames),
        bot.chatEnabled === false ? 0 : 1,
        bot.visibility === "public" ? "public" : "private",
        typeof bot.createdAt === "string" && bot.createdAt.trim().length > 0 ? bot.createdAt : now,
        typeof bot.updatedAt === "string" && bot.updatedAt.trim().length > 0 ? bot.updatedAt : now
      );
    }
  }

  const insertConversation = db.prepare(`
    INSERT OR REPLACE INTO conversations (id, user_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMessage = db.prepare(`
    INSERT OR REPLACE INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMemory = db.prepare(`
    INSERT OR REPLACE INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const conversation of snapshot.conversations) {
    insertConversation.run(
      conversation.id,
      userId,
      conversation.title,
      conversation.createdAt,
      conversation.updatedAt
    );
    for (const message of conversation.messages) {
      const providerValue =
        message.provider === "local" ||
        message.provider === "openai" ||
        message.provider === "anthropic"
          ? message.provider
          : null;
      const botIdValue =
        typeof message.botId === "string" && message.botId.length > 0
          ? message.botId
          : null;
      const modelValue =
        typeof message.model === "string" && message.model.trim().length > 0
          ? message.model.trim()
          : null;
      const toolPayloadValue =
        typeof message.toolPayload === "string" && message.toolPayload.trim().length > 0
          ? message.toolPayload.trim()
          : null;
      insertMessage.run(
        message.id,
        conversation.id,
        userId,
        message.role,
        message.content,
        providerValue,
        modelValue,
        botIdValue,
        toolPayloadValue,
        message.createdAt
      );
    }
  }

  for (const memory of snapshot.memories) {
    const encrypted = encryptJson(memory.payload, userKey);
    insertMemory.run(
      memory.id,
      userId,
      memory.conversationId ?? null,
      memory.botId ?? null,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      memory.confidence,
      memory.category ?? "user",
      memory.tier ?? normalizeMemoryTier(undefined, memory.confidence, memory.confidence, memory.durability ?? 0.5),
      memory.durability ?? 0.5,
      memory.createdAt
    );
  }
}

function validateBackupBotAvatarDetails(bots: BackupBotSnapshot[] | undefined): void {
  if (!Array.isArray(bots)) return;
  for (const bot of bots) {
    if (!bot || typeof bot !== "object") continue;
    const record = bot as unknown as Record<string, unknown>;
    const unsupported = Object.keys(record).find((key) => {
      if (key === "avatarDetails") return false;
      const normalized = key.toLowerCase().replace(/[^a-z]/gu, "");
      if (normalized === "localimagemodel" || normalized === "openaiimagemodel") {
        return false;
      }
      const profileIndex = normalized.indexOf("profile");
      const profileSuffix =
        profileIndex >= 0 ? normalized.slice(profileIndex + "profile".length) : "";
      return (
        normalized.includes("accessory") ||
        normalized.startsWith("avatar") ||
        normalized.includes("portrait") ||
        /(?:png|svg|imageurl|dataurl|imagebase64|imagepayload|raster)/u.test(
          normalized
        ) ||
        (profileIndex >= 0 &&
          /(?:picture|image|png|svg|url|data|file)/u.test(profileSuffix))
      );
    });
    if (unsupported) {
      throw new Error(`Account backup contains unsupported legacy avatar field: ${unsupported}.`);
    }
    if (record.avatarDetails !== undefined && record.avatarDetails !== null) {
      serializeBotAvatarDetailsV1(record.avatarDetails);
    }
  }
}

function safeParseArray(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseStringArray(raw: string | null): string[] {
  return safeParseArray(raw).filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
}
