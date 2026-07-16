import type { DatabaseSync } from "node:sqlite";
import { decryptJson, decryptText, encryptJson, encryptText } from "./security.ts";
import { normalizeMemoryTier } from "./memory.ts";
import type { ProviderName } from "./providers.ts";
import { normalizeVoicePreviewLine } from "./voice-preview-line.ts";
import {
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_BLINK_OFFSET_X,
  DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
  DEFAULT_BOT_FACE_BLINK_SCALE,
  DEFAULT_BOT_FACE_GLYPH_ANIMATION,
  DEFAULT_BOT_FACE_THINKING_FRAMES,
  parseStoredBotAvatarDetailsV1,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceBlinkOffsetX,
  normalizeBotFaceBlinkOffsetY,
  normalizeBotFaceBlinkScale,
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
  normalizeBotAudioVoiceProfileV1,
  normalizeBotNamePronunciation,
  normalizeBotVoiceVolume,
  normalizeEnglishVoiceEngine,
  normalizeOptionalBotAudioVoiceProfileV1,
  normalizeVoiceMode,
  parseStoredBotAudioVoiceProfileV1,
  serializeBotAudioVoiceProfileV1,
  parseStoredBotPowersV1,
  serializeBotPowersV1,
  botcastFallbackStudioAccentVariantForSeed,
  isBotcastFallbackStudioAccentVariant,
  type BotAudioVoiceProfileV1,
  type BotcastFallbackStudioAccentVariant,
  type BotPowerV1,
  type CoffeePowerPlanV1,
  type EnglishVoiceEngine,
  type VoiceMode,
  type AutoFallbackChainV1,
  type ImageProviderName,
  parseStoredAutoFallbackChain,
  resolveImageProviderName,
  serializeAutoFallbackChain,
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
  normalizeElevenLabsVoiceCollectionId,
  normalizeElevenLabsVoiceBank,
  parseStoredElevenLabsVoiceBank,
} from "./settings.ts";
import {
  applyPreparedProjectOwnedAssetsWithinTransaction,
  cleanupPreparedProjectOwnedAssetFiles,
  prepareProjectOwnedAssetImport,
  stagePreparedProjectOwnedAssetFiles,
  type ProjectOwnedAssetArchiveBundleV1,
} from "./project-owned-assets.ts";

export interface BackupUserSettings {
  theme: "light" | "dark" | "system";
  preferredProvider: ProviderName;
  preferredImageProvider?: ImageProviderName;
  providerLocked: boolean;
  autoMemory: boolean;
  composerWritingAssist: boolean;
  experimentalDualOllamaEnabled: boolean;
  experimentalAllModelEffortEnabled?: boolean;
  coffeeExperimentalTableAngleEnabled?: boolean;
  signalImmersiveVoiceEffectsEnabled?: boolean;
  psychicModeEnabled?: boolean;
  autoModeEnabled?: boolean;
  autoFallbackChain?: AutoFallbackChainV1 | null;
  /** Legacy import only. New backups no longer export this display preference. */
  fallbackModelMessageStripe?: boolean;
  hiddenBotModelIds: string[];
  hiddenComfyUiWorkflowIds: string[];
  preferredLocalModel: string;
  preferredOnlineModel: string;
  /** Legacy import only. Preserved as the first Auto setup suggestion. */
  lenientLocalFallbackModel?: string;
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
  voiceMode?: VoiceMode;
  voiceEffectsEnabled?: boolean;
  voiceVolume?: number;
  prismDefaultBotAudioVoiceProfile?: BotAudioVoiceProfileV1;
  englishVoiceEngine?: EnglishVoiceEngine;
  defaultSystemVoiceName?: string | null;
  defaultElevenLabsVoiceId?: string | null;
  elevenLabsVoiceBank?: Record<string, string | null>;
  elevenLabsVoiceModel?: string;
  elevenLabsVoiceCollectionId?: string;
}

export interface BackupBotSnapshot {
  id: string;
  name: string;
  namePronunciation?: string;
  systemPrompt: string;
  voicePreviewLine?: string | null;
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
  faceMouthCoffeePucker?: boolean;
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
  faceBlinkScale?: number | null;
  faceBlinkOffsetX?: number | null;
  faceBlinkOffsetY?: number | null;
  faceThinkingFrames?: BotFaceThinkingFrames | null;
  chatEnabled: boolean;
  visibility: "private" | "public";
  createdAt: string;
  updatedAt: string;
  authoredAudioVoiceProfile?: BotAudioVoiceProfileV1;
  audioVoiceProfileOverride?: BotAudioVoiceProfileV1 | null;
  powers?: BotPowerV1[];
}

/**
 * Slate rows stay as scalar database records inside the key-bearing account
 * backup. This is deliberately separate from the future portable, keyless
 * `.slate` archive contract.
 */
export type BackupSlateRow = Record<string, string | number | null>;

export interface BackupSlateSnapshot {
  series: BackupSlateRow[];
  projects: BackupSlateRow[];
  revisions: BackupSlateRow[];
  versions: BackupSlateRow[];
  sections: BackupSlateRow[];
  sectionVersions: BackupSlateRow[];
  manuscriptStates: BackupSlateRow[];
  continuitySources: BackupSlateRow[];
  continuityEntities: BackupSlateRow[];
  continuityAliases: BackupSlateRow[];
  continuityClaims: BackupSlateRow[];
  continuityEvents: BackupSlateRow[];
  continuityRelationships: BackupSlateRow[];
  continuityKnowledge: BackupSlateRow[];
  continuityThreads: BackupSlateRow[];
  continuityConcerns: BackupSlateRow[];
  continuityGenerations: BackupSlateRow[];
  continuityJobs: BackupSlateRow[];
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
    coffeePowerPlan?: CoffeePowerPlanV1;
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
      coffeeAudienceBotIds?: string[];
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
  /** Optional in older v1 snapshots. This remains an account backup, not a `.slate` archive. */
  slate?: BackupSlateSnapshot;
  /** Optional in older v1 snapshots. Signal is non-canonical but its show archive is user data. */
  botcast?: {
    shows: Array<{
      id: string;
      hostBotId: string;
      name: string;
      premise: string;
      hostingStyle: string;
      accentColor: string;
      fallbackStudioAccentVariant?: BotcastFallbackStudioAccentVariant;
      atmosphereJson: string;
      introAudio?: {
        provider: "elevenlabs";
        model: string;
        prompt: string;
        contentType: string;
        /** Legacy v1 snapshots store audio inline; new `.prism` archives use project blobs. */
        audioBase64?: string;
        durationMs: number;
        revision: number;
        createdAt: string;
        updatedAt: string;
      };
      createdAt: string;
      updatedAt: string;
    }>;
    episodes: Array<{
      id: string;
      showId: string;
      hostBotId: string;
      guestBotId: string;
      title: string;
      topic: string;
      producerBrief: string;
      provider?: ProviderName;
      model?: string | null;
      responseMode?: "local" | "auto" | "online";
      durationMinutes?: number | null;
      status: string;
      segment: string;
      outcome: string | null;
      tensionLevel: number;
      warningCount: number;
      startedAt: string;
      completedAt: string | null;
      runtimeMs: number | null;
      createdAt: string;
      updatedAt: string;
    }>;
    segments: Array<{
      id: string;
      episodeId: string;
      segment: string;
      ordinal: number;
      startedAt: string;
      endedAt: string | null;
    }>;
    messages: Array<{
      id: string;
      episodeId: string;
      speakerRole: string;
      botId: string;
      content: string;
      voicePerformanceText?: string | null;
      createdAt: string;
    }>;
    events: Array<{
      id: string;
      episodeId: string;
      sequence: number;
      kind: string;
      payloadJson: string;
      occurredAt: string;
    }>;
  };
}

type SlateBackupCollectionKey = keyof BackupSlateSnapshot;

type SlateBackupTable =
  | "slate_series"
  | "slate_projects"
  | "slate_revisions"
  | "slate_versions"
  | "slate_sections"
  | "slate_section_versions"
  | "slate_manuscript_state"
  | "slate_continuity_sources"
  | "slate_continuity_entities"
  | "slate_continuity_aliases"
  | "slate_continuity_claims"
  | "slate_continuity_events"
  | "slate_continuity_relationships"
  | "slate_continuity_knowledge"
  | "slate_continuity_threads"
  | "slate_continuity_concerns"
  | "slate_continuity_generations"
  | "slate_continuity_jobs";

interface SlateBackupTableSpec {
  key: SlateBackupCollectionKey;
  table: SlateBackupTable;
  primaryKey: "id" | "project_id";
  columns: readonly string[];
  deferredFields?: readonly string[];
}

const SLATE_BACKUP_TABLES: readonly SlateBackupTableSpec[] = [
  {
    key: "series",
    table: "slate_series",
    primaryKey: "id",
    columns: ["id", "title", "description", "created_at", "updated_at"],
  },
  {
    key: "projects",
    table: "slate_projects",
    primaryKey: "id",
    columns: [
      "id", "series_id", "book_ordinal", "title", "spark", "spark_wildcards_json",
      "premise", "voice", "non_negotiables_json", "phase", "structure_json",
      "characters_json", "unresolved_threads_json", "manuscript", "direction",
      "locked_ranges_json", "last_provider", "last_model", "continuity_active_version",
      "continuity_target_version", "continuity_active_generation",
      "continuity_previous_generation", "continuity_upgrade_status",
      "continuity_last_success_at", "created_at", "updated_at",
    ],
  },
  {
    key: "revisions",
    table: "slate_revisions",
    primaryKey: "id",
    columns: [
      "id", "project_id", "action", "scope", "structure_item_id", "selection_start",
      "selection_end", "direction", "original_text", "proposed_text", "status",
      "provider", "model", "created_at", "resolved_at",
    ],
  },
  {
    key: "versions",
    table: "slate_versions",
    primaryKey: "id",
    columns: [
      "id", "project_id", "reason", "structure_json", "manuscript", "created_at",
    ],
  },
  {
    key: "sections",
    table: "slate_sections",
    primaryKey: "id",
    columns: [
      "id", "project_id", "series_id", "parent_section_id", "structure_item_id", "kind",
      "ordinal", "title", "summary", "direction", "prose", "locked_ranges_json",
      "locked", "status", "revision", "content_hash", "last_mutation_id", "created_at",
      "updated_at",
    ],
    deferredFields: ["parent_section_id"],
  },
  {
    key: "sectionVersions",
    table: "slate_section_versions",
    primaryKey: "id",
    columns: [
      "id", "project_id", "section_id", "revision", "reason", "title", "summary",
      "direction", "prose", "locked", "status", "content_hash", "created_at",
    ],
  },
  {
    key: "manuscriptStates",
    table: "slate_manuscript_state",
    primaryKey: "project_id",
    columns: [
      "project_id", "storage_version", "structure_revision", "original_manuscript_hash",
      "migrated_at", "updated_at",
    ],
  },
  {
    key: "continuitySources",
    table: "slate_continuity_sources",
    primaryKey: "id",
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "kind",
      "source_revision", "content", "content_hash", "authority", "provider", "model",
      "producer_versions_json", "supersedes_source_id", "created_at",
    ],
    deferredFields: ["supersedes_source_id"],
  },
  {
    key: "continuityEntities",
    table: "slate_continuity_entities",
    primaryKey: "id",
    columns: [
      "id", "series_id", "kind", "canonical_name", "description", "locked", "anchors_json", "source_id",
      "producer_versions_json", "created_at", "updated_at",
    ],
  },
  {
    key: "continuityAliases",
    table: "slate_continuity_aliases",
    primaryKey: "id",
    columns: [
      "id", "series_id", "entity_id", "alias", "normalized_alias", "source_id", "created_at",
    ],
  },
  {
    key: "continuityClaims",
    table: "slate_continuity_claims",
    primaryKey: "id",
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "subject_entity_id",
      "predicate", "object_entity_id", "value", "epistemic_status", "perspective_entity_id",
      "confidence", "anchors_json", "source_id", "supersedes_claim_id",
      "producer_versions_json", "created_at",
    ],
    deferredFields: ["supersedes_claim_id"],
  },
  {
    key: "continuityEvents",
    table: "slate_continuity_events",
    primaryKey: "id",
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "title", "description",
      "chronology_key", "participant_entity_ids_json", "location_entity_id", "anchors_json",
      "source_id", "producer_versions_json", "created_at",
    ],
  },
  {
    key: "continuityRelationships",
    table: "slate_continuity_relationships",
    primaryKey: "id",
    columns: [
      "id", "series_id", "from_entity_id", "to_entity_id", "kind", "state",
      "epistemic_status", "anchors_json", "source_id", "producer_versions_json", "created_at",
    ],
  },
  {
    key: "continuityKnowledge",
    table: "slate_continuity_knowledge",
    primaryKey: "id",
    columns: [
      "id", "series_id", "character_entity_id", "claim_id", "learned_event_id", "status",
      "anchors_json", "source_id", "producer_versions_json", "created_at",
    ],
  },
  {
    key: "continuityThreads",
    table: "slate_continuity_threads",
    primaryKey: "id",
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "label", "status",
      "due_section_id", "anchors_json", "source_id", "producer_versions_json", "created_at",
      "updated_at",
    ],
  },
  {
    key: "continuityConcerns",
    table: "slate_continuity_concerns",
    primaryKey: "id",
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "kind", "severity",
      "status", "summary", "explanation", "claim_ids_json", "anchors_json",
      "recommended_resolution", "resolution_json", "producer_versions_json", "created_at",
      "resolved_at",
    ],
  },
  {
    key: "continuityGenerations",
    table: "slate_continuity_generations",
    primaryKey: "id",
    columns: [
      "id", "project_id", "generation", "status", "target_version", "source_fingerprint",
      "comparison_summary", "producer_versions_json", "created_at", "completed_at",
    ],
  },
  {
    key: "continuityJobs",
    table: "slate_continuity_jobs",
    primaryKey: "id",
    columns: [
      "id", "series_id", "project_id", "section_id", "source_id", "source_revision", "kind",
      "status", "attempts", "input_fingerprint", "error", "available_at", "started_at",
      "completed_at", "created_at", "updated_at",
    ],
  },
];

const SLATE_REFERENCE_RULES: ReadonlyArray<{
  source: SlateBackupCollectionKey;
  field: string;
  target: SlateBackupCollectionKey;
  targetTable: SlateBackupTable;
}> = [
  { source: "projects", field: "series_id", target: "series", targetTable: "slate_series" },
  { source: "revisions", field: "project_id", target: "projects", targetTable: "slate_projects" },
  { source: "versions", field: "project_id", target: "projects", targetTable: "slate_projects" },
  { source: "sections", field: "project_id", target: "projects", targetTable: "slate_projects" },
  { source: "sections", field: "series_id", target: "series", targetTable: "slate_series" },
  { source: "sections", field: "parent_section_id", target: "sections", targetTable: "slate_sections" },
  { source: "sectionVersions", field: "project_id", target: "projects", targetTable: "slate_projects" },
  { source: "sectionVersions", field: "section_id", target: "sections", targetTable: "slate_sections" },
  { source: "manuscriptStates", field: "project_id", target: "projects", targetTable: "slate_projects" },
  { source: "continuitySources", field: "series_id", target: "series", targetTable: "slate_series" },
  { source: "continuitySources", field: "project_id", target: "projects", targetTable: "slate_projects" },
  { source: "continuitySources", field: "section_id", target: "sections", targetTable: "slate_sections" },
  { source: "continuitySources", field: "supersedes_source_id", target: "continuitySources", targetTable: "slate_continuity_sources" },
  { source: "continuityEntities", field: "series_id", target: "series", targetTable: "slate_series" },
  { source: "continuityEntities", field: "source_id", target: "continuitySources", targetTable: "slate_continuity_sources" },
  { source: "continuityAliases", field: "series_id", target: "series", targetTable: "slate_series" },
  { source: "continuityAliases", field: "entity_id", target: "continuityEntities", targetTable: "slate_continuity_entities" },
  { source: "continuityAliases", field: "source_id", target: "continuitySources", targetTable: "slate_continuity_sources" },
  { source: "continuityClaims", field: "series_id", target: "series", targetTable: "slate_series" },
  { source: "continuityClaims", field: "project_id", target: "projects", targetTable: "slate_projects" },
  { source: "continuityClaims", field: "section_id", target: "sections", targetTable: "slate_sections" },
  { source: "continuityClaims", field: "subject_entity_id", target: "continuityEntities", targetTable: "slate_continuity_entities" },
  { source: "continuityClaims", field: "object_entity_id", target: "continuityEntities", targetTable: "slate_continuity_entities" },
  { source: "continuityClaims", field: "perspective_entity_id", target: "continuityEntities", targetTable: "slate_continuity_entities" },
  { source: "continuityClaims", field: "source_id", target: "continuitySources", targetTable: "slate_continuity_sources" },
  { source: "continuityClaims", field: "supersedes_claim_id", target: "continuityClaims", targetTable: "slate_continuity_claims" },
  { source: "continuityEvents", field: "series_id", target: "series", targetTable: "slate_series" },
  { source: "continuityEvents", field: "project_id", target: "projects", targetTable: "slate_projects" },
  { source: "continuityEvents", field: "section_id", target: "sections", targetTable: "slate_sections" },
  { source: "continuityEvents", field: "location_entity_id", target: "continuityEntities", targetTable: "slate_continuity_entities" },
  { source: "continuityEvents", field: "source_id", target: "continuitySources", targetTable: "slate_continuity_sources" },
  { source: "continuityRelationships", field: "series_id", target: "series", targetTable: "slate_series" },
  { source: "continuityRelationships", field: "from_entity_id", target: "continuityEntities", targetTable: "slate_continuity_entities" },
  { source: "continuityRelationships", field: "to_entity_id", target: "continuityEntities", targetTable: "slate_continuity_entities" },
  { source: "continuityRelationships", field: "source_id", target: "continuitySources", targetTable: "slate_continuity_sources" },
  { source: "continuityKnowledge", field: "series_id", target: "series", targetTable: "slate_series" },
  { source: "continuityKnowledge", field: "character_entity_id", target: "continuityEntities", targetTable: "slate_continuity_entities" },
  { source: "continuityKnowledge", field: "claim_id", target: "continuityClaims", targetTable: "slate_continuity_claims" },
  { source: "continuityKnowledge", field: "learned_event_id", target: "continuityEvents", targetTable: "slate_continuity_events" },
  { source: "continuityKnowledge", field: "source_id", target: "continuitySources", targetTable: "slate_continuity_sources" },
  { source: "continuityThreads", field: "series_id", target: "series", targetTable: "slate_series" },
  { source: "continuityThreads", field: "project_id", target: "projects", targetTable: "slate_projects" },
  { source: "continuityThreads", field: "section_id", target: "sections", targetTable: "slate_sections" },
  { source: "continuityThreads", field: "due_section_id", target: "sections", targetTable: "slate_sections" },
  { source: "continuityThreads", field: "source_id", target: "continuitySources", targetTable: "slate_continuity_sources" },
  { source: "continuityConcerns", field: "series_id", target: "series", targetTable: "slate_series" },
  { source: "continuityConcerns", field: "project_id", target: "projects", targetTable: "slate_projects" },
  { source: "continuityConcerns", field: "section_id", target: "sections", targetTable: "slate_sections" },
  { source: "continuityGenerations", field: "project_id", target: "projects", targetTable: "slate_projects" },
  { source: "continuityJobs", field: "series_id", target: "series", targetTable: "slate_series" },
  { source: "continuityJobs", field: "project_id", target: "projects", targetTable: "slate_projects" },
  { source: "continuityJobs", field: "section_id", target: "sections", targetTable: "slate_sections" },
  { source: "continuityJobs", field: "source_id", target: "continuitySources", targetTable: "slate_continuity_sources" },
];

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

function getSlateBackupRows(
  slate: BackupSlateSnapshot,
  key: SlateBackupCollectionKey,
): BackupSlateRow[] {
  const value = (slate as unknown as Record<string, unknown>)[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Account backup Slate collection ${key} must be an array.`);
  }
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Account backup Slate collection ${key} contains an invalid row.`);
    }
    return row as BackupSlateRow;
  });
}

function readSlateBackupScalar(
  row: BackupSlateRow,
  field: string,
  table: SlateBackupTable,
): string | number | null {
  if (!Object.prototype.hasOwnProperty.call(row, field)) {
    throw new Error(`Account backup ${table} row is missing ${field}.`);
  }
  const value = row[field];
  if (value === null || typeof value === "string" || typeof value === "number") {
    return value;
  }
  throw new Error(`Account backup ${table}.${field} must be a scalar value.`);
}

function exportSlateSnapshot(db: DatabaseSync, userId: string): BackupSlateSnapshot {
  const snapshot = {} as BackupSlateSnapshot;
  for (const spec of SLATE_BACKUP_TABLES) {
    const rows = db
      .prepare(
        `SELECT ${spec.columns.join(", ")} FROM ${spec.table} WHERE user_id = ? ORDER BY ${spec.primaryKey}`,
      )
      .all(userId) as Array<Record<string, unknown>>;
    snapshot[spec.key] = rows.map((row) => {
      const exported: BackupSlateRow = {};
      for (const column of spec.columns) {
        const value = row[column];
        if (value === null || typeof value === "string" || typeof value === "number") {
          exported[column] = value;
          continue;
        }
        throw new Error(`Unable to export non-scalar ${spec.table}.${column}.`);
      }
      return exported;
    });
  }
  return snapshot;
}

function importSlateSnapshot(
  db: DatabaseSync,
  userId: string,
  slate: BackupSlateSnapshot,
): void {
  for (const spec of SLATE_BACKUP_TABLES) {
    const rows = getSlateBackupRows(slate, spec.key);
    if (rows.length === 0) continue;
    const columns = ["user_id", ...spec.columns];
    const updates = [
      "user_id = excluded.user_id",
      ...spec.columns
        .filter((column) => column !== spec.primaryKey)
        .map((column) => `${column} = excluded.${column}`),
    ];
    const statement = db.prepare(
      `INSERT INTO ${spec.table} (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})
       ON CONFLICT(${spec.primaryKey}) DO UPDATE SET ${updates.join(", ")}`,
    );
    const deferredFields = new Set(spec.deferredFields ?? []);
    for (const row of rows) {
      statement.run(
        userId,
        ...spec.columns.map((column) =>
          deferredFields.has(column)
            ? null
            : readSlateBackupScalar(row, column, spec.table),
        ),
      );
    }
  }

  for (const spec of SLATE_BACKUP_TABLES) {
    if (!spec.deferredFields || spec.deferredFields.length === 0) continue;
    const rows = getSlateBackupRows(slate, spec.key);
    for (const field of spec.deferredFields) {
      const statement = db.prepare(
        `UPDATE ${spec.table} SET ${field} = ? WHERE ${spec.primaryKey} = ? AND user_id = ?`,
      );
      for (const row of rows) {
        statement.run(
          readSlateBackupScalar(row, field, spec.table),
          readSlateBackupScalar(row, spec.primaryKey, spec.table),
          userId,
        );
      }
    }
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
         preferred_image_provider,
         provider_locked,
         auto_memory,
         composer_writing_assist,
         experimental_dual_ollama_enabled,
         experimental_all_model_effort_enabled,
         coffee_experimental_table_angle_enabled,
         signal_immersive_voice_effects_enabled,
         psychic_mode_enabled,
         auto_switch_model,
         auto_fallback_chain,
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
         ,voice_mode, voice_effects_enabled, voice_volume, english_voice_engine,
         default_system_voice_name, default_elevenlabs_voice_id, elevenlabs_voice_bank,
         elevenlabs_voice_model, elevenlabs_voice_collection_id,
         prism_default_bot_audio_voice_profile
       FROM users
       WHERE id = ?`
    )
    .get(userId) as
    | {
        theme: "light" | "dark" | "system";
        preferred_provider: ProviderName;
        preferred_image_provider: ImageProviderName;
        provider_locked: number;
        auto_memory: number;
        composer_writing_assist: number;
        experimental_dual_ollama_enabled: number;
        experimental_all_model_effort_enabled: number;
        coffee_experimental_table_angle_enabled: number;
        signal_immersive_voice_effects_enabled: number;
        psychic_mode_enabled: number;
        auto_switch_model: number;
        auto_fallback_chain: string | null;
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
        voice_mode: string | null;
        voice_effects_enabled: number | null;
        voice_volume: number | null;
        english_voice_engine: string | null;
        default_system_voice_name: string | null;
        default_elevenlabs_voice_id: string | null;
        elevenlabs_voice_bank: string | null;
        elevenlabs_voice_model: string | null;
        elevenlabs_voice_collection_id: string | null;
        prism_default_bot_audio_voice_profile: string | null;
      }
    | undefined;
  const settings: BackupUserSettings | undefined = user
    ? {
        theme: user.theme,
        preferredProvider: user.preferred_provider,
        preferredImageProvider: user.preferred_image_provider,
        providerLocked: user.provider_locked === 1,
        autoMemory: user.auto_memory === 1,
        composerWritingAssist: user.composer_writing_assist !== 0,
        experimentalDualOllamaEnabled: user.experimental_dual_ollama_enabled === 1,
        experimentalAllModelEffortEnabled:
          user.experimental_all_model_effort_enabled === 1,
        coffeeExperimentalTableAngleEnabled:
          user.coffee_experimental_table_angle_enabled === 1,
        signalImmersiveVoiceEffectsEnabled:
          user.signal_immersive_voice_effects_enabled === 1,
        psychicModeEnabled: user.psychic_mode_enabled === 1,
        autoModeEnabled: user.auto_switch_model === 1,
        autoFallbackChain: parseStoredAutoFallbackChain(user.auto_fallback_chain),
        hiddenBotModelIds: safeParseStringArray(user.hidden_bot_model_ids),
        hiddenComfyUiWorkflowIds: safeParseStringArray(user.hidden_comfyui_workflow_ids),
        preferredLocalModel: user.preferred_local_model ?? "",
        preferredOnlineModel: user.preferred_online_model ?? "",
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
        voiceMode: normalizeVoiceMode(user.voice_mode),
        voiceEffectsEnabled: user.voice_effects_enabled !== 0,
        voiceVolume: normalizeBotVoiceVolume(user.voice_volume),
        prismDefaultBotAudioVoiceProfile:
          parseStoredBotAudioVoiceProfileV1(user.prism_default_bot_audio_voice_profile) ??
          normalizeBotAudioVoiceProfileV1(undefined),
        englishVoiceEngine: normalizeEnglishVoiceEngine(user.english_voice_engine),
        defaultSystemVoiceName: user.default_system_voice_name,
        defaultElevenLabsVoiceId: user.default_elevenlabs_voice_id,
        elevenLabsVoiceBank: parseStoredElevenLabsVoiceBank(user.elevenlabs_voice_bank),
        elevenLabsVoiceModel: user.elevenlabs_voice_model ?? "",
        elevenLabsVoiceCollectionId:
          user.elevenlabs_voice_collection_id ?? "",
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
         name_pronunciation,
         system_prompt,
         voice_preview_line,
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
         powers_json,
         avatar_details_json,
         face_eyes_font,
         face_eye_character,
         face_eye_animation,
         face_mouth_font,
         face_mouth_character,
         face_mouth_animation,
         face_mouth_coffee_pucker,
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
         face_blink_scale,
         face_blink_offset_x,
         face_blink_offset_y,
         face_thinking_frames,
         authored_audio_voice_profile,
         audio_voice_profile_override,
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
    name_pronunciation: string | null;
    system_prompt: string;
    voice_preview_line: string | null;
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
    powers_json: string | null;
    avatar_details_json: string | null;
    face_eyes_font: string | null;
    face_eye_character: string | null;
    face_eye_animation: string | null;
    face_mouth_font: string | null;
    face_mouth_character: string | null;
    face_mouth_animation: string | null;
    face_mouth_coffee_pucker: number | null;
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
    face_blink_scale: number | null;
    face_blink_offset_x: number | null;
    face_blink_offset_y: number | null;
    face_thinking_frames: string | null;
    authored_audio_voice_profile: string | null;
    audio_voice_profile_override: string | null;
    chat_enabled: number;
    visibility: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const conversations = db
    .prepare(
      "SELECT id, title, coffee_power_plan_json, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC"
    )
    .all(userId) as Array<{
    id: string;
    title: string;
    coffee_power_plan_json: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const conversationPayload = conversations.map((conversation) => {
    const messages = db
      .prepare(
        "SELECT id, role, content, provider, model, bot_id, tool_payload, coffee_audience_bot_ids, created_at FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC"
      )
      .all(conversation.id, userId) as Array<{
      id: string;
      role: string;
      content: string;
      provider: string | null;
      model: string | null;
      bot_id: string | null;
      tool_payload: string | null;
      coffee_audience_bot_ids: string | null;
      created_at: string;
    }>;
    const coffeePowerPlan = (() => {
      if (!conversation.coffee_power_plan_json) return undefined;
      try {
        const parsed = JSON.parse(conversation.coffee_power_plan_json) as CoffeePowerPlanV1;
        return parsed?.version === 1 && parsed.bots && typeof parsed.bots === "object"
          ? parsed
          : undefined;
      } catch {
        return undefined;
      }
    })();
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      ...(coffeePowerPlan ? { coffeePowerPlan } : {}),
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
        const coffeeAudienceBotIds = (() => {
          if (!message.coffee_audience_bot_ids) return undefined;
          try {
            const parsed = JSON.parse(message.coffee_audience_bot_ids) as unknown;
            return Array.isArray(parsed)
              ? parsed.filter((id): id is string => typeof id === "string")
              : undefined;
          } catch {
            return undefined;
          }
        })();
        return {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.created_at,
          provider,
          model,
          botId,
          ...(toolPayload ? { toolPayload } : {}),
          ...(coffeeAudienceBotIds ? { coffeeAudienceBotIds } : {}),
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

  const botcastShows = db.prepare(
    `SELECT id, host_bot_id, name, premise, hosting_style, accent_color,
            fallback_studio_accent_variant, atmosphere_json, created_at, updated_at
       FROM botcast_shows WHERE user_id = ? ORDER BY created_at`,
  ).all(userId) as Array<{
    id: string; host_bot_id: string; name: string; premise: string;
    hosting_style: string; accent_color: string;
    fallback_studio_accent_variant: number; atmosphere_json: string;
    created_at: string; updated_at: string;
  }>;
  const botcastEpisodes = db.prepare(
    "SELECT * FROM botcast_episodes WHERE user_id = ? ORDER BY created_at",
  ).all(userId) as Array<Record<string, unknown>>;
  const botcastSegments = db.prepare(
    "SELECT * FROM botcast_episode_segments WHERE user_id = ? ORDER BY episode_id, ordinal",
  ).all(userId) as Array<Record<string, unknown>>;
  const botcastMessages = db.prepare(
    "SELECT * FROM botcast_messages WHERE user_id = ? ORDER BY episode_id, created_at, rowid",
  ).all(userId) as Array<Record<string, unknown>>;
  const botcastEvents = db.prepare(
    "SELECT * FROM botcast_events WHERE user_id = ? ORDER BY episode_id, sequence",
  ).all(userId) as Array<Record<string, unknown>>;
  const botcastIntroAudio = db.prepare(
    `SELECT show_id, provider, model, prompt, content_type, audio_bytes,
            duration_ms, revision, created_at, updated_at
       FROM botcast_show_intro_audio WHERE user_id = ?`,
  ).all(userId) as Array<{
    show_id: string;
    provider: "elevenlabs";
    model: string;
    prompt: string;
    content_type: string;
    audio_bytes: Uint8Array;
    duration_ms: number;
    revision: number;
    created_at: string;
    updated_at: string;
  }>;
  const botcastIntroAudioByShowId = new Map(
    botcastIntroAudio.map((row) => [row.show_id, row] as const),
  );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    bots: bots.map((bot) => ({
        id: bot.id,
        name: bot.name,
        ...(normalizeBotNamePronunciation(bot.name_pronunciation)
          ? { namePronunciation: normalizeBotNamePronunciation(bot.name_pronunciation) }
          : {}),
        systemPrompt: bot.system_prompt,
        ...(normalizeVoicePreviewLine(bot.voice_preview_line)
          ? { voicePreviewLine: normalizeVoicePreviewLine(bot.voice_preview_line) }
          : {}),
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
        ...(parseStoredBotPowersV1(bot.powers_json).length > 0
          ? { powers: parseStoredBotPowersV1(bot.powers_json) }
          : {}),
        avatarDetails: parseStoredBotAvatarDetailsV1(bot.avatar_details_json),
        faceEyesFont: normalizeBotFaceFontId(bot.face_eyes_font),
        faceEyeCharacter: normalizeBotFaceEyeCharacter(bot.face_eye_character),
        faceMouthFont: normalizeBotFaceFontId(bot.face_mouth_font),
        faceMouthCharacter: normalizeBotFaceMouthCharacter(bot.face_mouth_character),
        faceMouthAnimation: normalizeBotFaceGlyphAnimation(bot.face_mouth_animation),
        faceMouthCoffeePucker: bot.face_mouth_coffee_pucker === 1,
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
        faceBlinkScale:
          normalizeBotFaceBlinkScale(bot.face_blink_scale) ??
          DEFAULT_BOT_FACE_BLINK_SCALE,
        faceBlinkOffsetX:
          normalizeBotFaceBlinkOffsetX(bot.face_blink_offset_x) ??
          DEFAULT_BOT_FACE_BLINK_OFFSET_X,
        faceBlinkOffsetY:
          normalizeBotFaceBlinkOffsetY(bot.face_blink_offset_y) ??
          DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
        faceThinkingFrames:
          parseStoredBotFaceThinkingFrames(bot.face_thinking_frames) ??
          DEFAULT_BOT_FACE_THINKING_FRAMES,
        authoredAudioVoiceProfile:
          parseStoredBotAudioVoiceProfileV1(bot.authored_audio_voice_profile) ??
          normalizeBotAudioVoiceProfileV1(undefined),
        audioVoiceProfileOverride: parseStoredBotAudioVoiceProfileV1(
          bot.audio_voice_profile_override
        ),
        chatEnabled: bot.chat_enabled !== 0,
        visibility: bot.visibility === "public" ? "public" : "private",
        createdAt: bot.created_at,
        updatedAt: bot.updated_at,
      })),
    conversations: conversationPayload,
    slate: exportSlateSnapshot(db, userId),
    botcast: {
      shows: botcastShows.map((row) => ({
        id: row.id,
        hostBotId: row.host_bot_id,
        name: row.name,
        premise: row.premise,
        hostingStyle: row.hosting_style,
        accentColor: row.accent_color,
        fallbackStudioAccentVariant: isBotcastFallbackStudioAccentVariant(
          row.fallback_studio_accent_variant,
        )
          ? row.fallback_studio_accent_variant
          : botcastFallbackStudioAccentVariantForSeed(row.id),
        atmosphereJson: row.atmosphere_json,
        ...(botcastIntroAudioByShowId.get(row.id)
          ? {
              introAudio: {
                provider: "elevenlabs" as const,
                model: botcastIntroAudioByShowId.get(row.id)!.model,
                prompt: botcastIntroAudioByShowId.get(row.id)!.prompt,
                contentType: botcastIntroAudioByShowId.get(row.id)!.content_type,
                audioBase64: Buffer.from(
                  botcastIntroAudioByShowId.get(row.id)!.audio_bytes,
                ).toString("base64"),
                durationMs: botcastIntroAudioByShowId.get(row.id)!.duration_ms,
                revision: botcastIntroAudioByShowId.get(row.id)!.revision,
                createdAt: botcastIntroAudioByShowId.get(row.id)!.created_at,
                updatedAt: botcastIntroAudioByShowId.get(row.id)!.updated_at,
              },
            }
          : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      episodes: botcastEpisodes.map((row) => ({
        id: String(row.id),
        showId: String(row.show_id),
        hostBotId: String(row.host_bot_id),
        guestBotId: String(row.guest_bot_id),
        title: String(row.title),
        topic: String(row.topic),
        producerBrief: String(row.producer_brief ?? ""),
        provider:
          row.provider === "openai" || row.provider === "anthropic"
            ? row.provider
            : "local",
        model: typeof row.model === "string" ? row.model : null,
        responseMode:
          row.response_mode === "auto" || row.response_mode === "online"
            ? row.response_mode
            : "local",
        durationMinutes:
          typeof row.duration_minutes === "number" ? row.duration_minutes : null,
        status: String(row.status),
        segment: String(row.segment),
        outcome: typeof row.outcome === "string" ? row.outcome : null,
        tensionLevel: Number(row.tension_level ?? 0),
        warningCount: Number(row.warning_count ?? 0),
        startedAt: String(row.started_at),
        completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
        runtimeMs: typeof row.runtime_ms === "number" ? row.runtime_ms : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      })),
      segments: botcastSegments.map((row) => ({
        id: String(row.id),
        episodeId: String(row.episode_id),
        segment: String(row.segment),
        ordinal: Number(row.ordinal ?? 0),
        startedAt: String(row.started_at),
        endedAt: typeof row.ended_at === "string" ? row.ended_at : null,
      })),
      messages: botcastMessages.map((row) => ({
        id: String(row.id),
        episodeId: String(row.episode_id),
        speakerRole: String(row.speaker_role),
        botId: String(row.bot_id),
        content: String(row.content),
        voicePerformanceText:
          typeof row.voice_performance_text === "string"
            ? row.voice_performance_text
            : null,
        createdAt: String(row.created_at),
      })),
      events: botcastEvents.map((row) => ({
        id: String(row.id),
        episodeId: String(row.episode_id),
        sequence: Number(row.sequence ?? 0),
        kind: String(row.kind),
        payloadJson: String(row.payload_json ?? "{}"),
        occurredAt: String(row.occurred_at),
      })),
    },
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
    table:
      | "bots"
      | "conversations"
      | "messages"
      | "memories"
      | "botcast_shows"
      | "botcast_episodes"
      | "botcast_episode_segments"
      | "botcast_messages"
      | "botcast_events"
      | SlateBackupTable,
    ids: readonly string[],
    idColumn: "id" | "project_id" = "id",
  ): void => {
    const seen = new Set<string>();
    const findOwner = db.prepare(`SELECT user_id FROM ${table} WHERE ${idColumn} = ?`);
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
  const botcast = snapshot.botcast;
  if (botcast) {
    assertIds("botcast_shows", botcast.shows.map((item) => item.id));
    assertIds("botcast_episodes", botcast.episodes.map((item) => item.id));
    assertIds("botcast_episode_segments", botcast.segments.map((item) => item.id));
    assertIds("botcast_messages", botcast.messages.map((item) => item.id));
    assertIds("botcast_events", botcast.events.map((item) => item.id));
  }
  const slate = snapshot.slate;
  if (slate) {
    const idsByCollection = new Map<SlateBackupCollectionKey, Set<string>>();
    for (const spec of SLATE_BACKUP_TABLES) {
      const ids = getSlateBackupRows(slate, spec.key).map((row) => {
        const value = readSlateBackupScalar(row, spec.primaryKey, spec.table);
        if (
          typeof value !== "string" ||
          value.trim().length === 0 ||
          value !== value.trim()
        ) {
          throw new Error(
            `Account backup ${spec.table}.${spec.primaryKey} must be a non-empty string.`,
          );
        }
        return value;
      });
      assertIds(spec.table, ids, spec.primaryKey);
      idsByCollection.set(spec.key, new Set(ids));
    }

    const ownerStatements = new Map<SlateBackupTable, ReturnType<DatabaseSync["prepare"]>>();
    for (const rule of SLATE_REFERENCE_RULES) {
      const targetIds = idsByCollection.get(rule.target) ?? new Set<string>();
      let findOwner = ownerStatements.get(rule.targetTable);
      if (!findOwner) {
        findOwner = db.prepare(`SELECT user_id FROM ${rule.targetTable} WHERE id = ?`);
        ownerStatements.set(rule.targetTable, findOwner);
      }
      for (const row of getSlateBackupRows(slate, rule.source)) {
        const value = readSlateBackupScalar(
          row,
          rule.field,
          SLATE_BACKUP_TABLES.find((spec) => spec.key === rule.source)!.table,
        );
        if (value === null || value === "") continue;
        if (typeof value !== "string") {
          throw new Error(`Account backup Slate reference ${rule.source}.${rule.field} is invalid.`);
        }
        if (targetIds.has(value)) continue;
        const owner = findOwner.get(value) as { user_id?: string } | undefined;
        if (owner?.user_id && owner.user_id !== userId) {
          throw new Error(
            `Account backup ${rule.targetTable} reference belongs to another user.`,
          );
        }
        if (!owner?.user_id) {
          throw new Error(
            `Account backup ${rule.source}.${rule.field} references missing ${rule.targetTable} data.`,
          );
        }
      }
    }
  }
}

export function importUserSnapshot(
  db: DatabaseSync,
  userId: string,
  snapshot: BackupSnapshot,
  userKey: Buffer,
  projectOwnedAssets?: ProjectOwnedAssetArchiveBundleV1,
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
  const preparedAssets = projectOwnedAssets
    ? prepareProjectOwnedAssetImport(userId, snapshot, projectOwnedAssets, {
        imageIdExists: (imageId) =>
          Boolean(db.prepare("SELECT 1 FROM images WHERE id = ?").get(imageId)),
      })
    : null;
  let transactionStarted = false;
  try {
    if (preparedAssets) stagePreparedProjectOwnedAssetFiles(preparedAssets);
    db.exec("BEGIN IMMEDIATE;");
    transactionStarted = true;
    assertSnapshotIdsStayWithinTenant(db, userId, snapshot);
    importUserSnapshotWithinTransaction(db, userId, snapshot, userKey);
    if (preparedAssets) {
      applyPreparedProjectOwnedAssetsWithinTransaction(db, userId, preparedAssets);
    }
    db.exec("COMMIT;");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) db.exec("ROLLBACK;");
    if (preparedAssets) cleanupPreparedProjectOwnedAssetFiles(preparedAssets);
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
    const storedAutoFallbackChain = settings.autoFallbackChain
      ? serializeAutoFallbackChain(settings.autoFallbackChain)
      : null;
    db.prepare(`
      UPDATE users
      SET
        theme = ?,
        preferred_provider = ?,
        preferred_image_provider = ?,
        provider_locked = ?,
        auto_memory = ?,
        composer_writing_assist = ?,
        experimental_dual_ollama_enabled = ?,
        experimental_all_model_effort_enabled = ?,
        coffee_experimental_table_angle_enabled = ?,
        psychic_mode_enabled = ?,
        auto_switch_model = ?,
        auto_fallback_chain = ?,
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
        elevenlabs_key_tag = ?,
        voice_mode = ?,
        voice_effects_enabled = ?,
        voice_volume = ?,
        english_voice_engine = ?,
        default_system_voice_name = ?,
        default_elevenlabs_voice_id = ?,
        elevenlabs_voice_bank = ?,
        elevenlabs_voice_model = ?,
        elevenlabs_voice_collection_id = ?,
        prism_default_bot_audio_voice_profile = ?
      WHERE id = ?
    `).run(
      settings.theme === "light" || settings.theme === "dark" ? settings.theme : "system",
      settings.preferredProvider === "openai" || settings.preferredProvider === "anthropic"
        ? settings.preferredProvider
        : "local",
      resolveImageProviderName({
        savedProvider:
          settings.preferredImageProvider ??
          (settings.preferredProvider === "local" ? "local" : "openai"),
      }),
      settings.providerLocked ? 1 : 0,
      settings.autoMemory ? 1 : 0,
      settings.composerWritingAssist ? 1 : 0,
      settings.experimentalDualOllamaEnabled ? 1 : 0,
      settings.experimentalAllModelEffortEnabled === true ? 1 : 0,
      settings.coffeeExperimentalTableAngleEnabled === true ? 1 : 0,
      settings.psychicModeEnabled === true ? 1 : 0,
      settings.autoModeEnabled === true && storedAutoFallbackChain ? 1 : 0,
      storedAutoFallbackChain,
      settings.fallbackModelMessageStripe === false ? 0 : 1,
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
      normalizeVoiceMode(settings.voiceMode),
      settings.voiceEffectsEnabled === false ? 0 : 1,
      normalizeBotVoiceVolume(settings.voiceVolume),
      normalizeEnglishVoiceEngine(settings.englishVoiceEngine),
      typeof settings.defaultSystemVoiceName === "string"
        ? settings.defaultSystemVoiceName.trim().slice(0, 200) || null
        : null,
      typeof settings.defaultElevenLabsVoiceId === "string"
        ? settings.defaultElevenLabsVoiceId.trim().slice(0, 200) || null
        : null,
      JSON.stringify(normalizeElevenLabsVoiceBank(settings.elevenLabsVoiceBank)),
      typeof settings.elevenLabsVoiceModel === "string"
        ? settings.elevenLabsVoiceModel.trim().slice(0, 160) || null
        : null,
      normalizeElevenLabsVoiceCollectionId(
        settings.elevenLabsVoiceCollectionId,
      ),
      serializeBotAudioVoiceProfileV1(settings.prismDefaultBotAudioVoiceProfile),
      userId
    );
    db.prepare(
      "UPDATE users SET signal_immersive_voice_effects_enabled = ? WHERE id = ?"
    ).run(settings.signalImmersiveVoiceEffectsEnabled === true ? 1 : 0, userId);
  }

  if (Array.isArray(snapshot.bots)) {
    const insertBot = db.prepare(`
      INSERT OR REPLACE INTO bots (
        id,
        user_id,
        name,
        name_pronunciation,
        system_prompt,
        voice_preview_line,
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
        face_blink_scale,
        face_blink_offset_x,
        face_blink_offset_y,
        face_thinking_frames,
        authored_audio_voice_profile,
        audio_voice_profile_override,
        chat_enabled,
        visibility,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const bot of snapshot.bots) {
      if (!bot || typeof bot.id !== "string" || bot.id.trim().length === 0) continue;
      const now = new Date().toISOString();
      insertBot.run(
        bot.id.trim(),
        userId,
        typeof bot.name === "string" && bot.name.trim().length > 0 ? bot.name.trim() : "Imported Bot",
        normalizeBotNamePronunciation(bot.namePronunciation),
        typeof bot.systemPrompt === "string" ? bot.systemPrompt : "",
        normalizeVoicePreviewLine(bot.voicePreviewLine) || null,
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
        normalizeBotFaceBlinkScale(bot.faceBlinkScale) ?? DEFAULT_BOT_FACE_BLINK_SCALE,
        normalizeBotFaceBlinkOffsetX(bot.faceBlinkOffsetX) ??
          DEFAULT_BOT_FACE_BLINK_OFFSET_X,
        normalizeBotFaceBlinkOffsetY(bot.faceBlinkOffsetY) ??
          DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
        serializeBotFaceThinkingFrames(bot.faceThinkingFrames),
        serializeBotAudioVoiceProfileV1(bot.authoredAudioVoiceProfile),
        bot.audioVoiceProfileOverride === null || bot.audioVoiceProfileOverride === undefined
          ? null
          : serializeBotAudioVoiceProfileV1(bot.audioVoiceProfileOverride),
        bot.chatEnabled === false ? 0 : 1,
        bot.visibility === "public" ? "public" : "private",
        typeof bot.createdAt === "string" && bot.createdAt.trim().length > 0 ? bot.createdAt : now,
        typeof bot.updatedAt === "string" && bot.updatedAt.trim().length > 0 ? bot.updatedAt : now
      );
      db.prepare("UPDATE bots SET powers_json = ? WHERE id = ? AND user_id = ?")
        .run(serializeBotPowersV1(bot.powers ?? []), bot.id.trim(), userId);
      db.prepare(
        "UPDATE bots SET face_mouth_coffee_pucker = ? WHERE id = ? AND user_id = ?"
      ).run(
        bot.faceMouthCoffeePucker === true ? 1 : 0,
        bot.id.trim(),
        userId
      );
    }
  }

  if (snapshot.botcast) {
    const botcast = snapshot.botcast;
    const showIds = new Set(botcast.shows.map((show) => show.id));
    const episodeIds = new Set(botcast.episodes.map((episode) => episode.id));
    for (const show of botcast.shows) {
      db.prepare(
        `INSERT OR REPLACE INTO botcast_shows
          (id, user_id, host_bot_id, name, premise, hosting_style, accent_color,
           fallback_studio_accent_variant, atmosphere_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        show.id, userId, show.hostBotId, show.name, show.premise,
        show.hostingStyle, show.accentColor,
        isBotcastFallbackStudioAccentVariant(show.fallbackStudioAccentVariant)
          ? show.fallbackStudioAccentVariant
          : botcastFallbackStudioAccentVariantForSeed(show.id),
        show.atmosphereJson,
        show.createdAt, show.updatedAt,
      );
      if (
        show.introAudio?.provider === "elevenlabs" &&
        typeof show.introAudio.audioBase64 === "string"
      ) {
        const audioBytes = Buffer.from(show.introAudio.audioBase64, "base64");
        if (
          audioBytes.length > 0 &&
          audioBytes.length <= 4 * 1024 * 1024 &&
          /^audio\/(?:mpeg|mp3)$/iu.test(show.introAudio.contentType)
        ) {
          db.prepare(
            `INSERT OR REPLACE INTO botcast_show_intro_audio
              (show_id, user_id, provider, model, prompt, content_type,
               audio_bytes, duration_ms, revision, created_at, updated_at)
             VALUES (?, ?, 'elevenlabs', ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            show.id,
            userId,
            show.introAudio.model,
            show.introAudio.prompt,
            show.introAudio.contentType,
            audioBytes,
            Math.max(3_000, Math.round(show.introAudio.durationMs)),
            Math.max(1, Math.round(show.introAudio.revision)),
            show.introAudio.createdAt || show.createdAt,
            show.introAudio.updatedAt || show.updatedAt,
          );
        }
      }
    }
    for (const episode of botcast.episodes) {
      if (!showIds.has(episode.showId)) continue;
      db.prepare(
        `INSERT OR REPLACE INTO botcast_episodes
          (id, user_id, show_id, host_bot_id, guest_bot_id, title, topic,
           producer_brief, provider, model, response_mode, duration_minutes, status, segment, outcome,
           tension_level, warning_count, started_at, completed_at, runtime_ms,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        episode.id, userId, episode.showId, episode.hostBotId, episode.guestBotId,
        episode.title, episode.topic, episode.producerBrief,
        episode.provider === "openai" || episode.provider === "anthropic"
          ? episode.provider
          : "local",
        typeof episode.model === "string" ? episode.model : null,
        episode.responseMode === "auto" || episode.responseMode === "online"
          ? episode.responseMode
          : episode.provider === "openai" || episode.provider === "anthropic"
            ? "online"
            : "local",
        typeof episode.durationMinutes === "number" &&
        Number.isInteger(episode.durationMinutes) &&
        episode.durationMinutes >= 3 &&
        episode.durationMinutes <= 30
          ? episode.durationMinutes
          : null,
        episode.status, episode.segment, episode.outcome, episode.tensionLevel,
        episode.warningCount, episode.startedAt, episode.completedAt,
        episode.runtimeMs, episode.createdAt, episode.updatedAt,
      );
    }
    for (const segment of botcast.segments) {
      if (!episodeIds.has(segment.episodeId)) continue;
      db.prepare(
        `INSERT OR REPLACE INTO botcast_episode_segments
          (id, user_id, episode_id, segment, ordinal, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        segment.id, userId, segment.episodeId, segment.segment, segment.ordinal,
        segment.startedAt, segment.endedAt,
      );
    }
    for (const message of botcast.messages) {
      if (!episodeIds.has(message.episodeId)) continue;
      db.prepare(
        `INSERT OR REPLACE INTO botcast_messages
          (id, user_id, episode_id, speaker_role, bot_id, content, voice_performance_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        message.id, userId, message.episodeId, message.speakerRole,
        message.botId, message.content, message.voicePerformanceText ?? null,
        message.createdAt,
      );
    }
    for (const event of botcast.events) {
      if (!episodeIds.has(event.episodeId)) continue;
      db.prepare(
        `INSERT OR REPLACE INTO botcast_events
          (id, user_id, episode_id, sequence, kind, payload_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        event.id, userId, event.episodeId, event.sequence, event.kind,
        event.payloadJson, event.occurredAt,
      );
    }
  }

  if (snapshot.slate) {
    importSlateSnapshot(db, userId, snapshot.slate);
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
    if (conversation.coffeePowerPlan?.version === 1) {
      db.prepare(
        "UPDATE conversations SET coffee_power_plan_json = ? WHERE id = ? AND user_id = ?"
      ).run(JSON.stringify(conversation.coffeePowerPlan), conversation.id, userId);
    }
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
      if (Array.isArray(message.coffeeAudienceBotIds)) {
        db.prepare("UPDATE messages SET coffee_audience_bot_ids = ? WHERE id = ? AND user_id = ?")
          .run(JSON.stringify(message.coffeeAudienceBotIds), message.id, userId);
      }
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
