import type { DatabaseSync } from "node:sqlite";
import {
  parseStoredComfyUiWorkflows,
  serializeBotAudioVoiceProfileV1,
  type PrismJsonObject,
  type PrismJsonValue,
} from "@localai/shared";
import {
  resolveNextSettings,
  type CurrentSettings,
  type NextSettings,
} from "./settings.ts";
import { MODEL_VISIBILITY_DEFAULTS_VERSION } from "./model-routing.ts";

const HUMAN_ONLY_SETTING_KEYS = new Set([
  "openAiApiKey",
  "anthropicApiKey",
  "elevenLabsApiKey",
  "braveSearchApiKey",
  "devMemoriesEnabled",
  "devMemoriesText",
]);

export const PRISM_JOURNALED_SETTING_KEYS = new Set([
  "displayName",
  "theme",
  "graphicsQuality",
  "crtFocus",
  "typographyScale",
  "atmosphereStyle",
  "hubAtmosphereEnabled",
  "startupPreference",
  "preferredProvider",
  "ephemeralChatProviderPreferences",
  "preferredImageProvider",
  "providerLocked",
  "autoMemory",
  "composerWritingAssist",
  "experimentalDualOllamaEnabled",
  "experimentalAllModelEffortEnabled",
  "coffeeExperimentalTableAngleEnabled",
  "psychicModeEnabled",
  "autoFallbackChain",
  "onlineAutoProviderBias",
  "preferredLocalModel",
  "preferredOnlineModel",
  "hiddenBotModelIds",
  "hiddenComfyUiWorkflowIds",
  "lenientLocalImageFallbackModel",
  "secondaryOllamaHost",
  "comfyUiHost",
  "preferredLocalImageModel",
  "preferredOpenAiImageModel",
  "preferredZenWallpaperLocalImageModel",
  "preferredZenWallpaperOpenAiImageModel",
  "preferredHomeAtmosphereImageModel",
  "preferredHomeAtmosphereImageProvider",
  "zenWallpaperOpacity",
  "zenWallpaperTextMaskEnabled",
  "zenWallpaperGrayscaleEnabled",
  "zenWallpaperBlurredEdgesEnabled",
  "zenWallpaperStyleNotes",
  "zenSessionIdleGapMs",
  "zenFreshStartGapMs",
  "zenRecentContextMessages",
  "zenWallpaperRegenMessageInterval",
  "zenMoodSensitivity",
  "zenCanvasTypingSpeed",
  "zenMessageFontMinPx",
  "zenMessageFontMaxPx",
  "zenAskQuestionPatienceEnabled",
  "zenAskQuestionPatienceMs",
  "zenAutonomyEnabled",
  "zenPersonaTransitionChoice",
  "comfyUiWorkflows",
  "prismDefaultLlmModel",
  "prismImageToolLlmModel",
  "textModelDisplayNames",
  "voiceMode",
  "voiceEffectsEnabled",
  "voiceVolume",
  "operatingSystemVoicesEnabled",
  "englishVoiceEngine",
  "defaultSystemVoiceName",
  "defaultElevenLabsVoiceId",
  "elevenLabsVoiceBank",
  "elevenLabsVoiceModel",
  "elevenLabsVoiceCollectionId",
  "zenPlayerVoiceEnabled",
  "playerAudioVoiceProfile",
  "playerNamePronunciation",
]);

const PERSISTED_SETTING_COLUMNS = [
  "display_name",
  "theme",
  "graphics_quality",
  "crt_focus",
  "typography_scale",
  "atmosphere_style",
  "hub_atmosphere_enabled",
  "startup_preference",
  "preferred_provider",
  "ephemeral_chat_provider_preferences",
  "preferred_image_provider",
  "provider_locked",
  "auto_memory",
  "composer_writing_assist",
  "hidden_bot_model_ids",
  "hidden_comfyui_workflow_ids",
  "model_visibility_defaults_version",
  "experimental_dual_ollama_enabled",
  "experimental_all_model_effort_enabled",
  "coffee_experimental_table_angle_enabled",
  "psychic_mode_enabled",
  "auto_switch_model",
  "auto_fallback_chain",
  "online_auto_provider_bias",
  "preferred_local_model",
  "preferred_online_model",
  "lenient_local_image_fallback_model",
  "secondary_ollama_host",
  "comfyui_host",
  "preferred_local_image_model",
  "preferred_openai_image_model",
  "preferred_zen_wallpaper_local_image_model",
  "preferred_zen_wallpaper_openai_image_model",
  "preferred_home_atmosphere_image_model",
  "preferred_home_atmosphere_image_provider",
  "zen_wallpaper_opacity",
  "zen_wallpaper_text_mask_enabled",
  "zen_wallpaper_grayscale_enabled",
  "zen_wallpaper_blurred_edges_enabled",
  "zen_wallpaper_style_notes",
  "zen_session_idle_gap_ms",
  "zen_fresh_start_gap_ms",
  "zen_recent_context_messages",
  "zen_wallpaper_regen_message_interval",
  "zen_mood_sensitivity",
  "zen_canvas_typing_speed",
  "zen_message_font_min_px",
  "zen_message_font_max_px",
  "zen_ask_question_patience_enabled",
  "zen_ask_question_patience_ms",
  "zen_autonomy_enabled",
  "zen_persona_transition_choice",
  "comfyui_workflows",
  "prism_default_llm_model",
  "prism_image_tool_llm_model",
  "text_model_display_names",
  "voice_mode",
  "voice_effects_enabled",
  "voice_volume",
  "operating_system_voices_enabled",
  "english_voice_engine",
  "default_system_voice_name",
  "default_elevenlabs_voice_id",
  "elevenlabs_voice_bank",
  "elevenlabs_voice_model",
  "elevenlabs_voice_collection_id",
  "zen_player_voice_enabled",
  "player_audio_voice_profile",
  "player_name_pronunciation",
] as const;

type PersistedSettingColumn = (typeof PERSISTED_SETTING_COLUMNS)[number];
type SettingsRow = Record<PersistedSettingColumn, string | number | null> & {
  id: string;
};

export interface PrismSettingsMutation {
  before: PrismJsonObject;
  after: PrismJsonObject;
  changedKeys: string[];
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function rowForUser(db: DatabaseSync, userId: string): SettingsRow {
  const row = db
    .prepare(
      `SELECT id, ${PERSISTED_SETTING_COLUMNS.join(", ")}
         FROM users
        WHERE id = ?`,
    )
    .get(userId) as SettingsRow | undefined;
  if (!row) throw new Error("Account settings were not found.");
  return row;
}

function currentSettings(
  row: SettingsRow,
  primaryOllamaHost: string,
): CurrentSettings {
  return {
    displayName: String(row.display_name),
    theme:
      row.theme === "light" || row.theme === "dark" || row.theme === "system"
        ? row.theme
        : "system",
    graphicsQuality: nullableString(row.graphics_quality),
    crtFocus: Number(row.crt_focus),
    typographyScale: nullableString(row.typography_scale),
    atmosphereStyle: nullableString(row.atmosphere_style),
    hubAtmosphereEnabled: Number(row.hub_atmosphere_enabled),
    startupPreference: nullableString(row.startup_preference),
    preferredProvider:
      row.preferred_provider === "openai" ||
      row.preferred_provider === "anthropic"
        ? row.preferred_provider
        : "local",
    ephemeralChatProviderPreferences: nullableString(
      row.ephemeral_chat_provider_preferences,
    ),
    preferredImageProvider:
      row.preferred_image_provider === "openai" ? "openai" : "local",
    providerLocked: Number(row.provider_locked),
    autoMemory: Number(row.auto_memory),
    composerWritingAssist: Number(row.composer_writing_assist),
    experimentalDualOllamaEnabled: Number(
      row.experimental_dual_ollama_enabled,
    ),
    experimentalAllModelEffortEnabled: Number(
      row.experimental_all_model_effort_enabled,
    ),
    coffeeExperimentalTableAngleEnabled: Number(
      row.coffee_experimental_table_angle_enabled,
    ),
    psychicModeEnabled: Number(row.psychic_mode_enabled),
    autoSwitchModel: Number(row.auto_switch_model),
    autoFallbackChain: nullableString(row.auto_fallback_chain),
    onlineAutoProviderBias:
      typeof row.online_auto_provider_bias === "number"
        ? row.online_auto_provider_bias
        : 0,
    hiddenBotModelIds: String(row.hidden_bot_model_ids ?? "[]"),
    hiddenComfyUiWorkflowIds: String(
      row.hidden_comfyui_workflow_ids ?? "[]",
    ),
    preferredLocalModel: nullableString(row.preferred_local_model),
    preferredOnlineModel: nullableString(row.preferred_online_model),
    lenientLocalImageFallbackModel: nullableString(
      row.lenient_local_image_fallback_model,
    ),
    secondaryOllamaHost: nullableString(row.secondary_ollama_host),
    comfyUiHost: nullableString(row.comfyui_host),
    preferredLocalImageModel: nullableString(
      row.preferred_local_image_model,
    ),
    preferredOpenAiImageModel: nullableString(
      row.preferred_openai_image_model,
    ),
    preferredZenWallpaperLocalImageModel:
      nullableString(row.preferred_zen_wallpaper_local_image_model),
    preferredZenWallpaperOpenAiImageModel:
      nullableString(row.preferred_zen_wallpaper_openai_image_model),
    preferredHomeAtmosphereImageModel: nullableString(
      row.preferred_home_atmosphere_image_model,
    ),
    preferredHomeAtmosphereImageProvider: nullableString(
      row.preferred_home_atmosphere_image_provider,
    ),
    zenWallpaperOpacity:
      typeof row.zen_wallpaper_opacity === "number"
        ? row.zen_wallpaper_opacity
        : null,
    zenWallpaperTextMaskEnabled:
      typeof row.zen_wallpaper_text_mask_enabled === "number"
        ? row.zen_wallpaper_text_mask_enabled
        : null,
    zenWallpaperGrayscaleEnabled:
      typeof row.zen_wallpaper_grayscale_enabled === "number"
        ? row.zen_wallpaper_grayscale_enabled
        : null,
    zenWallpaperBlurredEdgesEnabled:
      typeof row.zen_wallpaper_blurred_edges_enabled === "number"
        ? row.zen_wallpaper_blurred_edges_enabled
        : null,
    zenWallpaperStyleNotes: nullableString(row.zen_wallpaper_style_notes),
    zenSessionIdleGapMs:
      typeof row.zen_session_idle_gap_ms === "number"
        ? row.zen_session_idle_gap_ms
        : null,
    zenFreshStartGapMs:
      typeof row.zen_fresh_start_gap_ms === "number"
        ? row.zen_fresh_start_gap_ms
        : null,
    zenRecentContextMessages:
      typeof row.zen_recent_context_messages === "number"
        ? row.zen_recent_context_messages
        : null,
    zenWallpaperRegenMessageInterval:
      typeof row.zen_wallpaper_regen_message_interval === "number"
        ? row.zen_wallpaper_regen_message_interval
        : null,
    zenMoodSensitivity:
      typeof row.zen_mood_sensitivity === "number"
        ? row.zen_mood_sensitivity
        : null,
    zenCanvasTypingSpeed:
      typeof row.zen_canvas_typing_speed === "number"
        ? row.zen_canvas_typing_speed
        : null,
    zenMessageFontMinPx:
      typeof row.zen_message_font_min_px === "number"
        ? row.zen_message_font_min_px
        : null,
    zenMessageFontMaxPx:
      typeof row.zen_message_font_max_px === "number"
        ? row.zen_message_font_max_px
        : null,
    zenAskQuestionPatienceEnabled:
      typeof row.zen_ask_question_patience_enabled === "number"
        ? row.zen_ask_question_patience_enabled
        : null,
    zenAskQuestionPatienceMs:
      typeof row.zen_ask_question_patience_ms === "number"
        ? row.zen_ask_question_patience_ms
        : null,
    zenAutonomyEnabled:
      typeof row.zen_autonomy_enabled === "number"
        ? row.zen_autonomy_enabled
        : null,
    zenPersonaTransitionChoice: nullableString(
      row.zen_persona_transition_choice,
    ),
    comfyUiWorkflows: parseStoredComfyUiWorkflows(
      nullableString(row.comfyui_workflows),
    ),
    prismDefaultLlmModel: nullableString(row.prism_default_llm_model),
    prismImageToolLlmModel: nullableString(row.prism_image_tool_llm_model),
    textModelDisplayNames: nullableString(row.text_model_display_names),
    primaryOllamaHost,
    voiceMode: nullableString(row.voice_mode),
    voiceEffectsEnabled: Number(row.voice_effects_enabled),
    voiceVolume:
      typeof row.voice_volume === "number" ? row.voice_volume : null,
    operatingSystemVoicesEnabled: Number(
      row.operating_system_voices_enabled,
    ),
    englishVoiceEngine: nullableString(row.english_voice_engine),
    defaultSystemVoiceName: nullableString(row.default_system_voice_name),
    defaultElevenLabsVoiceId: nullableString(
      row.default_elevenlabs_voice_id,
    ),
    elevenLabsVoiceBank: nullableString(row.elevenlabs_voice_bank),
    elevenLabsVoiceModel: nullableString(row.elevenlabs_voice_model),
    elevenLabsVoiceCollectionId: nullableString(
      row.elevenlabs_voice_collection_id,
    ),
    zenPlayerVoiceEnabled: Number(row.zen_player_voice_enabled),
    playerAudioVoiceProfile: nullableString(row.player_audio_voice_profile),
    playerNamePronunciation: nullableString(row.player_name_pronunciation),
  };
}

function persistedValues(
  next: NextSettings,
  modelVisibilityDefaultsVersion: number,
): Record<PersistedSettingColumn, string | number | null> {
  return {
    display_name: next.displayName,
    theme: next.theme,
    graphics_quality: next.graphicsQuality,
    crt_focus: next.crtFocus,
    typography_scale: next.typographyScale,
    atmosphere_style: next.atmosphereStyle,
    hub_atmosphere_enabled: next.hubAtmosphereEnabled,
    startup_preference: next.startupPreference,
    preferred_provider: next.preferredProvider,
    ephemeral_chat_provider_preferences: stringifyJson(
      next.ephemeralChatProviderPreferences,
    ),
    preferred_image_provider: next.preferredImageProvider,
    provider_locked: next.providerLocked,
    auto_memory: next.autoMemory,
    composer_writing_assist: next.composerWritingAssist,
    hidden_bot_model_ids: stringifyJson(next.hiddenBotModelIds),
    hidden_comfyui_workflow_ids: stringifyJson(
      next.hiddenComfyUiWorkflowIds,
    ),
    model_visibility_defaults_version: modelVisibilityDefaultsVersion,
    experimental_dual_ollama_enabled: next.experimentalDualOllamaEnabled,
    experimental_all_model_effort_enabled:
      next.experimentalAllModelEffortEnabled,
    coffee_experimental_table_angle_enabled:
      next.coffeeExperimentalTableAngleEnabled,
    psychic_mode_enabled: next.psychicModeEnabled,
    auto_switch_model: next.autoSwitchModel,
    auto_fallback_chain: next.autoFallbackChain,
    online_auto_provider_bias: next.onlineAutoProviderBias,
    preferred_local_model: next.preferredLocalModel,
    preferred_online_model: next.preferredOnlineModel,
    lenient_local_image_fallback_model:
      next.lenientLocalImageFallbackModel,
    secondary_ollama_host: next.secondaryOllamaHost,
    comfyui_host: next.comfyUiHost,
    preferred_local_image_model: next.preferredLocalImageModel,
    preferred_openai_image_model: next.preferredOpenAiImageModel,
    preferred_zen_wallpaper_local_image_model:
      next.preferredZenWallpaperLocalImageModel,
    preferred_zen_wallpaper_openai_image_model:
      next.preferredZenWallpaperOpenAiImageModel,
    preferred_home_atmosphere_image_model:
      next.preferredHomeAtmosphereImageModel,
    preferred_home_atmosphere_image_provider:
      next.preferredHomeAtmosphereImageProvider,
    zen_wallpaper_opacity: next.zenWallpaperOpacity,
    zen_wallpaper_text_mask_enabled:
      next.zenWallpaperTextMaskEnabled ? 1 : 0,
    zen_wallpaper_grayscale_enabled:
      next.zenWallpaperGrayscaleEnabled ? 1 : 0,
    zen_wallpaper_blurred_edges_enabled:
      next.zenWallpaperBlurredEdgesEnabled ? 1 : 0,
    zen_wallpaper_style_notes: next.zenWallpaperStyleNotes,
    zen_session_idle_gap_ms: next.zenSessionIdleGapMs,
    zen_fresh_start_gap_ms: next.zenFreshStartGapMs,
    zen_recent_context_messages: next.zenRecentContextMessages,
    zen_wallpaper_regen_message_interval:
      next.zenWallpaperRegenMessageInterval,
    zen_mood_sensitivity: next.zenMoodSensitivity,
    zen_canvas_typing_speed: next.zenCanvasTypingSpeed,
    zen_message_font_min_px: next.zenMessageFontMinPx,
    zen_message_font_max_px: next.zenMessageFontMaxPx,
    zen_ask_question_patience_enabled:
      next.zenAskQuestionPatienceEnabled ? 1 : 0,
    zen_ask_question_patience_ms: next.zenAskQuestionPatienceMs,
    zen_autonomy_enabled: next.zenAutonomyEnabled ? 1 : 0,
    zen_persona_transition_choice: next.zenPersonaTransitionChoice,
    comfyui_workflows: stringifyJson(next.comfyUiWorkflows),
    prism_default_llm_model: next.prismDefaultLlmModel,
    prism_image_tool_llm_model: next.prismImageToolLlmModel,
    text_model_display_names: stringifyJson(next.textModelDisplayNames),
    voice_mode: next.voiceMode,
    voice_effects_enabled: next.voiceEffectsEnabled ? 1 : 0,
    voice_volume: next.voiceVolume,
    operating_system_voices_enabled:
      next.operatingSystemVoicesEnabled ? 1 : 0,
    english_voice_engine: next.englishVoiceEngine,
    default_system_voice_name: next.defaultSystemVoiceName,
    default_elevenlabs_voice_id: next.defaultElevenLabsVoiceId,
    elevenlabs_voice_bank: stringifyJson(next.elevenLabsVoiceBank),
    elevenlabs_voice_model: next.elevenLabsVoiceModel,
    elevenlabs_voice_collection_id: next.elevenLabsVoiceCollectionId,
    zen_player_voice_enabled: next.zenPlayerVoiceEnabled ? 1 : 0,
    player_audio_voice_profile: serializeBotAudioVoiceProfileV1(
      next.playerAudioVoiceProfile,
    ),
    player_name_pronunciation: next.playerNamePronunciation,
  };
}

export function readPrismJournaledSettings(args: {
  db: DatabaseSync;
  userId: string;
  primaryOllamaHost: string;
}): PrismJsonObject {
  const next = resolveNextSettings(
    {},
    currentSettings(rowForUser(args.db, args.userId), args.primaryOllamaHost),
  );
  return JSON.parse(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(next).filter(
          ([key]) =>
            key !== "openAiKeyIntent" &&
            key !== "anthropicKeyIntent" &&
            key !== "elevenLabsKeyIntent" &&
            key !== "braveSearchKeyIntent",
        ),
      ),
    ),
  ) as PrismJsonObject;
}

function jsonObjectFromColumns(
  row: Record<string, string | number | null>,
): PrismJsonObject {
  return Object.fromEntries(
    PERSISTED_SETTING_COLUMNS.map((column) => [column, row[column] ?? null]),
  ) as PrismJsonObject;
}

function writeColumns(
  db: DatabaseSync,
  userId: string,
  values: Record<string, PrismJsonValue>,
): void {
  const columns = PERSISTED_SETTING_COLUMNS.filter((column) =>
    Object.prototype.hasOwnProperty.call(values, column),
  );
  if (columns.length !== PERSISTED_SETTING_COLUMNS.length) {
    throw new Error("Settings mutation data is incomplete.");
  }
  const sqlValues = columns.map((column) => {
    const value = values[column];
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number"
    ) {
      return value ?? null;
    }
    throw new Error(`Invalid persisted value for ${column}.`);
  });
  const result = db
    .prepare(
      `UPDATE users
          SET ${columns.map((column) => `${column} = ?`).join(", ")}
        WHERE id = ?`,
    )
    .run(...sqlValues, userId);
  if (result.changes !== 1) {
    throw new Error("Account settings could not be updated.");
  }
}

export function prismSettingsPatchIsJournalable(
  body: Record<string, unknown>,
): boolean {
  if (
    Array.from(HUMAN_ONLY_SETTING_KEYS).some((key) =>
      Object.prototype.hasOwnProperty.call(body, key),
    )
  ) {
    return false;
  }
  return Object.keys(body).some((key) =>
    PRISM_JOURNALED_SETTING_KEYS.has(key),
  );
}

export function validatePrismSettingsPatch(
  patch: PrismJsonObject,
): PrismJsonObject {
  if (
    Object.keys(patch).some((key) => HUMAN_ONLY_SETTING_KEYS.has(key))
  ) {
    throw new Error(
      "Credentials and Developer Memory settings require the Settings panel.",
    );
  }
  const filtered = Object.fromEntries(
    Object.entries(patch).filter(([key]) =>
      PRISM_JOURNALED_SETTING_KEYS.has(key),
    ),
  ) as PrismJsonObject;
  if (Object.keys(filtered).length === 0) {
    throw new Error("At least one supported setting is required.");
  }
  return filtered;
}

export function previewPrismSettingsPatch(args: {
  db: DatabaseSync;
  userId: string;
  patch: PrismJsonObject;
  primaryOllamaHost: string;
}): PrismSettingsMutation {
  const patch = validatePrismSettingsPatch(args.patch);
  const row = rowForUser(args.db, args.userId);
  const next = resolveNextSettings(
    patch,
    currentSettings(row, args.primaryOllamaHost),
  );
  const nextColumns = persistedValues(
    next,
    Object.prototype.hasOwnProperty.call(patch, "hiddenBotModelIds")
      ? MODEL_VISIBILITY_DEFAULTS_VERSION
      : Number(row.model_visibility_defaults_version),
  );
  const changedKeys = PERSISTED_SETTING_COLUMNS.filter(
    (column) => row[column] !== nextColumns[column],
  );
  return {
    before: jsonObjectFromColumns(row),
    after: jsonObjectFromColumns(nextColumns),
    changedKeys,
  };
}

export function applyPrismSettingsPatch(args: {
  db: DatabaseSync;
  userId: string;
  patch: PrismJsonObject;
  primaryOllamaHost: string;
}): PrismSettingsMutation {
  const mutation = previewPrismSettingsPatch(args);
  writeColumns(args.db, args.userId, mutation.after);
  return mutation;
}

export function undoPrismSettingsPatch(args: {
  db: DatabaseSync;
  userId: string;
  before: PrismJsonObject;
}): void {
  writeColumns(args.db, args.userId, args.before);
}
