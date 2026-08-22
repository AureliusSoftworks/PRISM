import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import {
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
} from "./security.ts";
import { normalizeMemoryTier } from "./memory.ts";
import type { ProviderName } from "./providers.ts";
import { normalizeVoicePreviewLine } from "./voice-preview-line.ts";
import {
  APPLET_SESSION_NOTE_ENTRY_MAX_CHARACTERS,
  APPLET_SESSION_NOTE_MAX_CHARACTERS,
  appletSessionBelongsToUser,
  readAppletSessionNoteSurface,
} from "./applet-session-notes.ts";
import {
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_BLINK_OFFSET_X,
  DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
  DEFAULT_BOT_FACE_BLINK_ROTATION_DEG,
  DEFAULT_BOT_FACE_BLINK_SCALE,
  DEFAULT_BOT_FACE_EYE_COUNT,
  DEFAULT_BOT_FACE_EYE_SPACING,
  DEFAULT_BOT_FACE_GLYPH_ANIMATION,
  DEFAULT_BOT_FACE_EYE_MOVEMENT,
  DEFAULT_BOT_FACE_MOUTH_COFFEE_PUCKER,
  DEFAULT_BOT_FACE_THINKING_FRAMES,
  parseStoredBotAvatarDetailsV1,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceBlinkOffsetX,
  normalizeBotFaceBlinkOffsetY,
  normalizeBotFaceBlinkRotationDeg,
  normalizeBotFaceBlinkScale,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeCount,
  normalizeBotFaceEyeSpacing,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeRotationDeg,
  normalizeBotFaceEyeScale,
  normalizeBotFaceFontId,
  normalizeBotFaceFontWeight,
  normalizeBotFaceGlyphAnimation,
  normalizeBotFaceEyeMovement,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceCustomSpeechPoses,
  parseStoredBotFaceCustomSpeechPoses,
  normalizeBotFaceMouthOffsetX,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthRotationDeg,
  normalizeBotFaceMouthScale,
  normalizeBotFaceThinkingOffsetX,
  normalizeBotFaceThinkingOffsetY,
  normalizeBotFaceThinkingScale,
  parseStoredBotFaceThinkingFrames,
  serializeBotFaceThinkingFrames,
  serializeBotFaceCustomSpeechPosesForStorage,
  serializeBotAvatarDetailsV1,
  type BotAvatarDetailsV1,
  type BotFaceBlinkBar,
  type BotFaceEyeCount,
  type BotFaceFontId,
  type BotFaceGlyphAnimation,
  type BotFaceCustomSpeechPoses,
  type BotFaceEyeMovement,
  type BotFaceThinkingFrames,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotNamePronunciation,
  normalizeBotIdentityColor,
  normalizeBotSelfReferral,
  normalizeBotVoiceVolume,
  normalizeEnglishVoiceEngine,
  normalizeGraphicsQuality,
  normalizeCrtFocus,
  normalizePrismTypographyScale,
  normalizeHubAtmosphereStyle,
  normalizeModelReasoningEffortPreference,
  normalizePrismStartupPreference,
  normalizePrismCapabilityRevelations,
  PRISM_CAPABILITY_IDS,
  normalizeOptionalBotAudioVoiceProfileV1,
  normalizeVoiceMode,
  parseStoredBotAudioVoiceProfileV1,
  serializeBotAudioVoiceProfileV1,
  parseStoredBotPowersV1,
  serializeBotPowersV1,
  BOT_POWER_CANONICAL_SILENCE_V1,
  botPowerMuteActionTextsV1,
  botPowerResponseIsSilentV1,
  botcastFallbackStudioAccentVariantForSeed,
  isBotcastFallbackStudioAccentVariant,
  type BotAudioVoiceProfileV1,
  type BotcastFallbackStudioAccentVariant,
  type BotPowerV1,
  type CoffeePowerPlanV1,
  type CoffeeSessionSettings,
  normalizeCoffeeSessionSettings,
  type EnglishVoiceEngine,
  type VoiceMode,
  type AutoFallbackChainV1,
  type EphemeralChatProviderPreferences,
  type ImageProviderName,
  type GraphicsQuality,
  type PrismTypographyScale,
  type HubAtmosphereStyle,
  type ModelReasoningEffortPreferenceV1,
  type ModelTurboPreferenceV1,
  type MemoryEcologySettings,
  type MemoryLifecycle,
  type PrismStartupPreference,
  type PrismCapabilityRevelations,
  parseStoredAutoFallbackChain,
  clampOnlineAutoProviderBias,
  normalizeEphemeralChatProviderPreferences,
  resolveImageProviderName,
  serializeAutoFallbackChain,
} from "@localai/shared";
import {
  DEFAULT_MEMORY_ECOLOGY_SETTINGS,
  normalizeMemoryEcologySettings,
  resolveMemoryEcologySettingsPatch,
} from "./memory-ecology.ts";
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
  type PreparedProjectOwnedAssetImport,
  type ProjectOwnedAssetArchiveBundleV1,
} from "./project-owned-assets.ts";
import {
  listActionSfxPackClipsForBackup,
  restoreActionSfxPackClipsFromBackup,
} from "./action-sfx-pack.ts";
import {
  listEnglishPacingProfilesForBackup,
  restoreEnglishPacingProfilesFromBackup,
} from "./english-pacing-profile.ts";
import {
  listPremiumVoiceLibrary,
  restorePremiumVoiceLibrary,
  type PremiumVoiceLibraryEntry,
} from "./premium-voice-library.ts";
import {
  listLibraryGroups,
  replaceLibraryGroups,
  type LibraryGroupV1,
} from "./library-groups.ts";
import {
  listModelReasoningEffortPreferences,
  normalizeModelEffortModelId,
  normalizeModelEffortProvider,
  setModelReasoningEffortPreference,
} from "./model-effort-preferences.ts";
import {
  listModelTurboPreferences,
  setModelTurboPreference,
} from "./model-turbo-preferences.ts";
import {
  GLOBAL_BOT_MOOD_KEYS,
  setGlobalBotMood,
  type GlobalBotMoodKey,
} from "./bot-global-mood.ts";

export interface BackupUserSettings {
  theme: "light" | "dark" | "system";
  graphicsQuality?: GraphicsQuality;
  crtFocus?: number;
  typographyScale?: PrismTypographyScale;
  atmosphereStyle?: HubAtmosphereStyle;
  hubAtmosphereEnabled?: boolean;
  startupPreference?: PrismStartupPreference;
  capabilityRevelations?: PrismCapabilityRevelations;
  preferredProvider: ProviderName;
  ephemeralChatProviderPreferences?: EphemeralChatProviderPreferences;
  preferredImageProvider?: ImageProviderName;
  providerLocked: boolean;
  autoMemory: boolean;
  /** Memory ecology controls. Older snapshots fall back to autoMemory. */
  memoryEcology?: MemoryEcologySettings;
  composerWritingAssist: boolean;
  experimentalDualOllamaEnabled: boolean;
  experimentalAllModelEffortEnabled?: boolean;
  coffeeExperimentalTableAngleEnabled?: boolean;
  psychicModeEnabled?: boolean;
  autoModeEnabled?: boolean;
  autoFallbackChain?: AutoFallbackChainV1 | null;
  /** Soft ONLINE Auto lean: -1 OpenAI … 0 balanced … +1 Anthropic. */
  onlineAutoProviderBias?: number;
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
  prismDefaultBotFaceMouthSpeechPoses?: BotFaceCustomSpeechPoses | null;
  prismDefaultLlmModel: string;
  prismImageToolLlmModel: string;
  /** Prism Refract keeps independent Auto/model choices for the LOCAL and ONLINE lanes. */
  prismRefractLocalModel?: string;
  prismRefractOnlineModel?: string;
  devMemoriesEnabled: boolean;
  devMemoriesText: string;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  elevenLabsApiKey?: string;
  voiceMode?: VoiceMode;
  voiceEffectsEnabled?: boolean;
  voiceVolume?: number;
  operatingSystemVoicesEnabled?: boolean;
  zenPlayerVoiceEnabled?: boolean;
  playerAudioVoiceProfile?: BotAudioVoiceProfileV1;
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
  selfReferral?: string;
  systemPrompt: string;
  /** Account-owned runtime state; portable .bot and .bots exports omit it. */
  globalMood?: GlobalBotMoodKey;
  /** Account backups preserve server-owned clone lineage as bot ids. */
  cloneFamilyId?: string | null;
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
  accentColor?: string | null;
  glyph?: string | null;
  avatarDetails?: BotAvatarDetailsV1 | null;
  faceEyesFont?: BotFaceFontId | null;
  faceEyeCharacter?: string | null;
  faceEyeAnimation?: BotFaceEyeMovement | BotFaceGlyphAnimation | null;
  faceMouthFont?: BotFaceFontId | null;
  faceMouthCharacter?: string | null;
  faceMouthAnimation?: BotFaceGlyphAnimation | null;
  faceMouthSpeechPoses?: BotFaceCustomSpeechPoses | null;
  faceMouthCoffeePucker?: boolean;
  faceFontWeight?: number | null;
  faceEyeScale?: number | null;
  faceEyeOffsetX?: number | null;
  faceEyeOffsetY?: number | null;
  faceEyeRotationDeg?: number | null;
  faceEyeCount?: BotFaceEyeCount | number | null;
  faceEyeSpacing?: number | null;
  faceMouthScale?: number | null;
  faceMouthOffsetX?: number | null;
  faceMouthOffsetY?: number | null;
  faceMouthRotationDeg?: number | null;
  faceBlinkBar?: BotFaceBlinkBar | null;
  faceBlinkCount?: BotFaceEyeCount | number | null;
  faceBlinkScale?: number | null;
  faceBlinkOffsetX?: number | null;
  faceBlinkOffsetY?: number | null;
  faceBlinkRotationDeg?: number | null;
  faceThinkingFrames?: BotFaceThinkingFrames | null;
  faceThinkingScale?: number | null;
  faceThinkingOffsetX?: number | null;
  faceThinkingOffsetY?: number | null;
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

const BACKUP_COFFEE_GROUP_SEAT_COUNT = 5;
const BACKUP_COFFEE_GROUP_ETHOS_MAX_LENGTH = 280;

export interface BackupCoffeeGroupAtmosphere {
  imageId: string;
  prompt?: string;
  revision: number;
  updatedAt: string;
}

export interface BackupCoffeeGroupSnapshot {
  id: string;
  name: string;
  seatBotIds: Array<string | null>;
  coffeeSettings: CoffeeSessionSettings;
  presetMode: "manual" | "auto";
  topicSelectionMode: "manual" | "auto";
  modelChoice: Record<string, unknown>;
  starterTopics: Record<string, unknown>;
  moodSummary: Record<string, unknown>;
  ethos: string;
  atmosphere: BackupCoffeeGroupAtmosphere | null;
  soundtrack?: {
    provider: "elevenlabs";
    model: string;
    prompt: string;
    contentType: string;
    audioBase64: string;
    durationMs: number;
    revision: number;
    createdAt: string;
    updatedAt: string;
  } | null;
  synthesis: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupSlateSnapshot {
  series: BackupSlateRow[];
  projects: BackupSlateRow[];
  revisions: BackupSlateRow[];
  versions: BackupSlateRow[];
  sections: BackupSlateRow[];
  handoffs: BackupSlateRow[];
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
  /** Optional in older v1 snapshots. Default effort is represented by no row. */
  modelEffortPreferences?: ModelReasoningEffortPreferenceV1[];
  /** Optional in older v1 snapshots. Disabled Turbo is represented by no row. */
  modelTurboPreferences?: ModelTurboPreferenceV1[];
  bots?: BackupBotSnapshot[];
  /** Server-backed Library groups. Older browser-authored archives omit this. */
  libraryGroups?: LibraryGroupV1[];
  /** Optional in older v1 snapshots. Only active Coffee Groups are exported. */
  coffeeGroups?: BackupCoffeeGroupSnapshot[];
  conversations: Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    coffeePowerPlan?: CoffeePowerPlanV1;
    coffee?: {
      settings: CoffeeSessionSettings;
      botGroupIds: Array<string | null>;
      groupId: string | null;
      durationMinutes: number | null;
      presetId: string | null;
      topic: string | null;
      absentBotIds: string[];
      teamsJson: string | null;
    };
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
    /** Optional; directed bot-to-bot memories target this bot. */
    targetBotId?: string;
    confidence: number;
    baseConfidence?: number;
    category?: "general" | "user" | "bot_relation";
    tier?: "short_term" | "long_term";
    lifecycle?: MemoryLifecycle;
    durability?: number;
    source?: "direct" | "inferred";
    certainty?: number;
    sourceMessageIds?: string[];
    evidenceMemoryIds?: string[];
    evidenceLineageKnown?: boolean;
    lastReinforcedAt?: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
  /** Persistent acquisition receipts. Older snapshots omit them. */
  memoryReceipts?: Array<{
    id: string;
    memoryId: string;
    learnerBotId?: string;
    targetBotId?: string;
    conversationId?: string;
    kind: "player_memory" | "bot_relation";
    createdAt: string;
    readAt?: string;
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
      hostChatIgnoringUntilGuestShow?: boolean;
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
        outdent?: {
          prompt: string;
          contentType: string;
          /** Legacy v1 snapshots store audio inline; new `.prism` archives use project blobs. */
          audioBase64?: string;
          durationMs: number;
        };
      };
      atmosphereAudio?: {
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
      guestKind?: "bot" | "producer";
      guestName?: string;
      guestContext?: string;
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
      modelWarmupHoldDurationMs?: number;
      modelWarmupHoldStartedAt?: string | null;
      personaReview?: {
        reviewerBotId: string;
        reviewerName: string;
        rating: number;
        comment: string;
        createdAt: string;
      } | null;
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
      /** Optional; older v1 snapshots omit saved Signal stage actions. */
      stageActionText?: string | null;
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
  /** Optional in older v1 snapshots. Debate preserves frozen sessions and public event history. */
  debates?: {
    sessions: Array<{
      id: string;
      revision: number;
      status: string;
      phase: string;
      stepKey: string;
      playerRole: string;
      playerSideId: string | null;
      createIdempotencyKey: string;
      motion: string;
      winnerSideId: string | null;
      sessionJson: string;
      error: string | null;
      createdAt: string;
      updatedAt: string;
      completedAt: string | null;
    }>;
    events: Array<{
      id: string;
      sessionId: string;
      sequence: number;
      phase: string;
      stepKey: string;
      kind: string;
      eventJson: string;
      createdAt: string;
    }>;
    /** Optional in earlier v1 snapshots. Preserves anti-force-quit floor authority. */
    recessCheckpoints?: Array<{
      sessionId: string;
      sourceRevision: number;
      snapshotJson: string;
      createdAt: string;
    }>;
    /** Server-private Whodunnit truth. Included only in the encrypted account backup. */
    mysteryCases?: Array<{
      sessionId: string;
      schemaVersion: number;
      generatorVersion: number;
      privateJson: string;
      contentHash: string;
      createdAt: string;
      updatedAt: string;
    }>;
    mysteryActions?: Array<{
      id: string;
      sessionId: string;
      sequence: number;
      actionKind: string;
      publicPayloadJson: string;
      occurredAt: string;
    }>;
    mysteryNotebooks?: Array<{
      sessionId: string;
      revision: number;
      documentJson: string;
      pendingProposalJson: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    mysteryNotebookRevisions?: Array<{
      id: string;
      sessionId: string;
      revision: number;
      documentJson: string;
      reason: string;
      idempotencyKey: string;
      createdAt: string;
    }>;
  };
  /** One player-authored note attached to an applet session transcript. */
  sessionNotes?: Array<{
    surface: "coffee" | "signal" | "debate" | "story";
    sessionId: string;
    body: string;
    captures?: Array<{
      body: string;
      startedAt: string;
      fps?: number;
      committedAt: string;
    }>;
    createdAt: string;
    updatedAt: string;
  }>;
  /** Browser-rendered FPS captured once when each applet transcript entry appeared. */
  transcriptFrameSamples?: Array<{
    surface: "coffee" | "signal" | "debate" | "story";
    sessionId: string;
    entryId: string;
    fps: number;
    capturedAt: string;
  }>;
  /** Presentation-only response cues, including only the playback state actually persisted. */
  presenceBeats?: Array<{
    id: string;
    surface: "chat" | "zen" | "sandbox" | "coffee" | "signal" | "debate";
    sessionId: string;
    responseId: string;
    speakerBotId: string;
    speakerName: string;
    trigger: "interruption" | "redirect" | "waiting";
    source: "default" | "custom";
    text: string;
    heardCharacterCount: number;
    completion: "playing" | "completed" | "interrupted" | "failed";
    playbackStartedAtMs: number;
    playbackEndedAtMs: number | null;
    createdAt: string;
    updatedAt: string;
  }>;
  /** Derived video bytes are excluded; these portable inputs can rebuild them. */
  replays?: {
    recordings: Array<{
      id: string;
      surface: "signal" | "coffee";
      sourceId: string;
      manifestVersion: number;
      manifestJson: string;
      manifestHash: string | null;
      timelineJson: string | null;
      transcriptVtt: string | null;
      transcriptMarkdown: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    voiceTakes: Array<{
      id: string;
      recordingId: string;
      sourceKey: string;
      sourceMessageId: string | null;
      sourceEventId: string | null;
      snapshotJson: string;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  /**
   * Local action Foley packs (bot + player). Not part of bot Marketplace export.
   * Optional in older v1 snapshots.
   */
  actionSfxPacks?: Array<{
    ownerKind: "bot" | "player";
    ownerId: string;
    kind: string;
    variantIndex: number;
    contentType: string;
    audioBase64: string;
    promptSeed: string;
    packGenerationId: string;
    createdAt: string;
  }>;
  /**
   * Local English pacing profiles (bot + player). Not part of bot Marketplace
   * export. Optional in older v1 snapshots.
   */
  englishPacingProfiles?: Array<{
    v: 1;
    ownerKind: "bot" | "player";
    ownerId: string;
    commaMs: number;
    clauseMs: number;
    strongMs: number;
    calibratedAt: string;
    source: "elevenlabs-timestamps";
  }>;
  /** PRISM-managed ElevenLabs shared-voice bookmarks. Older snapshots omit it. */
  premiumVoiceLibrary?: PremiumVoiceLibraryEntry[];
}

function backupJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function backupAppletSessionNoteCaptures(value: unknown): Array<{
  body: string;
  startedAt: string;
  fps?: number;
  committedAt: string;
}> {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((candidate) => {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return [];
    }
    const record = candidate as Record<string, unknown>;
    const body = typeof record.body === "string" ? record.body.trim() : "";
    const startedAt =
      typeof record.startedAt === "string" ? record.startedAt : "";
    const committedAt =
      typeof record.committedAt === "string" ? record.committedAt : "";
    const fps =
      typeof record.fps === "number" &&
      Number.isFinite(record.fps) &&
      record.fps >= 1 &&
      record.fps <= 240
        ? Math.round(record.fps)
        : undefined;
    return body &&
      body.length <= APPLET_SESSION_NOTE_ENTRY_MAX_CHARACTERS &&
      Number.isFinite(Date.parse(startedAt)) &&
      Number.isFinite(Date.parse(committedAt))
      ? [
          {
            body,
            startedAt: new Date(startedAt).toISOString(),
            ...(fps === undefined ? {} : { fps }),
            committedAt: new Date(committedAt).toISOString(),
          },
        ]
      : [];
  }).slice(-400);
}

function parseBackupJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    return backupJsonObject(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

function backupCoffeeGroupAtmosphere(
  value: unknown,
  fallbackUpdatedAt: string,
): BackupCoffeeGroupAtmosphere | null {
  const record = backupJsonObject(value);
  const imageId =
    typeof record.imageId === "string" ? record.imageId.trim() : "";
  if (!/^[a-zA-Z0-9_-]{1,256}$/u.test(imageId)) return null;
  const prompt =
    typeof record.prompt === "string"
      ? record.prompt.replace(/\s+/gu, " ").trim().slice(0, 100_000)
      : "";
  const revision =
    typeof record.revision === "number" && Number.isFinite(record.revision)
      ? Math.min(1_000_000, Math.max(1, Math.floor(record.revision)))
      : 1;
  const updatedAt =
    typeof record.updatedAt === "string" && record.updatedAt.trim()
      ? record.updatedAt.trim().slice(0, 100)
      : fallbackUpdatedAt;
  return {
    imageId,
    ...(prompt ? { prompt } : {}),
    revision,
    updatedAt,
  };
}

function parseBackupCoffeeGroupAtmosphere(
  raw: string | null | undefined,
  fallbackUpdatedAt: string,
): BackupCoffeeGroupAtmosphere | null {
  if (!raw?.trim()) return null;
  try {
    return backupCoffeeGroupAtmosphere(
      JSON.parse(raw) as unknown,
      fallbackUpdatedAt,
    );
  } catch {
    return null;
  }
}

function normalizedBackupCoffeeGroupSeats(
  value: unknown,
  ownedBotIds?: ReadonlySet<string>,
): Array<string | null> {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: BACKUP_COFFEE_GROUP_SEAT_COUNT }, (_, index) => {
    const botId =
      typeof source[index] === "string" ? source[index].trim() : "";
    return botId && (!ownedBotIds || ownedBotIds.has(botId)) ? botId : null;
  });
}

function coffeeGroupSynthesisForRestore(args: {
  value: unknown;
  atmosphereWasReferenced: boolean;
  atmosphereIsPortable: boolean;
  updatedAt: string;
}): Record<string, unknown> {
  const synthesis = backupJsonObject(args.value);
  const rawItems = synthesis.items;
  if (!rawItems || typeof rawItems !== "object" || Array.isArray(rawItems)) {
    return synthesis;
  }
  const items = { ...(rawItems as Record<string, unknown>) };
  const interruptedError =
    "Generation did not continue across the backup restore. Retry this item.";
  for (const item of ["name", "ethos"] as const) {
    const state = backupJsonObject(items[item]);
    if (state.status !== "pending" && state.status !== "running") continue;
    items[item] = {
      ...state,
      status: "failed",
      updatedAt: args.updatedAt,
      error: interruptedError,
    };
  }
  const atmosphereState = backupJsonObject(items.atmosphere);
  const atmosphereNeedsRetry =
    atmosphereState.status === "pending" ||
    atmosphereState.status === "running" ||
    (!args.atmosphereIsPortable &&
      (args.atmosphereWasReferenced || atmosphereState.status === "ready"));
  if (atmosphereNeedsRetry) {
    items.atmosphere = {
      ...atmosphereState,
      status: "failed",
      updatedAt: args.updatedAt,
      error: args.atmosphereWasReferenced && !args.atmosphereIsPortable
        ? "The atmosphere image was not included in this backup. Generate it again."
        : interruptedError,
    };
  }
  return {
    ...synthesis,
    items,
  };
}

type SlateBackupCollectionKey = keyof BackupSlateSnapshot;

type SlateBackupTable =
  | "slate_series"
  | "slate_projects"
  | "slate_revisions"
  | "slate_versions"
  | "slate_sections"
  | "slate_handoffs"
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
  optionalFields?: Readonly<Record<string, string | number | null>>;
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
      "id",
      "series_id",
      "book_ordinal",
      "title",
      "title_origin",
      "spark",
      "spark_wildcards_json",
      "premise",
      "voice",
      "non_negotiables_json",
      "phase",
      "structure_json",
      "characters_json",
      "unresolved_threads_json",
      "manuscript",
      "direction",
      "locked_ranges_json",
      "last_provider",
      "last_model",
      "prose_mode",
      "prose_model",
      "prose_provider",
      "deliberation_config_json",
      "continuity_active_version",
      "continuity_target_version",
      "continuity_active_generation",
      "continuity_previous_generation",
      "continuity_upgrade_status",
      "continuity_last_success_at",
      "created_at",
      "updated_at",
    ],
    optionalFields: {
      title_origin: "writer",
      prose_mode: "auto",
      prose_model: null,
      prose_provider: null,
      deliberation_config_json: "{}",
    },
  },
  {
    key: "revisions",
    table: "slate_revisions",
    primaryKey: "id",
    columns: [
      "id",
      "project_id",
      "action",
      "scope",
      "structure_item_id",
      "selection_start",
      "selection_end",
      "direction",
      "original_text",
      "proposed_text",
      "status",
      "provider",
      "model",
      "created_at",
      "resolved_at",
    ],
  },
  {
    key: "versions",
    table: "slate_versions",
    primaryKey: "id",
    columns: [
      "id",
      "project_id",
      "reason",
      "structure_json",
      "manuscript",
      "created_at",
    ],
  },
  {
    key: "sections",
    table: "slate_sections",
    primaryKey: "id",
    columns: [
      "id",
      "project_id",
      "series_id",
      "parent_section_id",
      "structure_item_id",
      "kind",
      "ordinal",
      "title",
      "summary",
      "direction",
      "prose",
      "locked_ranges_json",
      "locked",
      "status",
      "revision",
      "content_hash",
      "last_mutation_id",
      "created_at",
      "updated_at",
    ],
    deferredFields: ["parent_section_id"],
  },
  {
    key: "handoffs",
    table: "slate_handoffs",
    primaryKey: "id",
    columns: [
      "id",
      "direction",
      "status",
      "source_text",
      "source_label",
      "source_conversation_id",
      "source_message_id",
      "source_project_id",
      "source_section_id",
      "source_selection_start",
      "source_selection_end",
      "target_project_id",
      "created_at",
      "committed_at",
    ],
  },
  {
    key: "sectionVersions",
    table: "slate_section_versions",
    primaryKey: "id",
    columns: [
      "id",
      "project_id",
      "section_id",
      "revision",
      "reason",
      "title",
      "summary",
      "direction",
      "prose",
      "locked",
      "status",
      "content_hash",
      "created_at",
    ],
  },
  {
    key: "manuscriptStates",
    table: "slate_manuscript_state",
    primaryKey: "project_id",
    columns: [
      "project_id",
      "storage_version",
      "structure_revision",
      "original_manuscript_hash",
      "migrated_at",
      "updated_at",
    ],
  },
  {
    key: "continuitySources",
    table: "slate_continuity_sources",
    primaryKey: "id",
    columns: [
      "id",
      "series_id",
      "project_id",
      "section_id",
      "scope_kind",
      "kind",
      "source_revision",
      "content",
      "content_hash",
      "authority",
      "provider",
      "model",
      "producer_versions_json",
      "supersedes_source_id",
      "created_at",
    ],
    deferredFields: ["supersedes_source_id"],
  },
  {
    key: "continuityEntities",
    table: "slate_continuity_entities",
    primaryKey: "id",
    columns: [
      "id",
      "series_id",
      "kind",
      "canonical_name",
      "description",
      "locked",
      "anchors_json",
      "source_id",
      "producer_versions_json",
      "created_at",
      "updated_at",
    ],
  },
  {
    key: "continuityAliases",
    table: "slate_continuity_aliases",
    primaryKey: "id",
    columns: [
      "id",
      "series_id",
      "entity_id",
      "alias",
      "normalized_alias",
      "source_id",
      "created_at",
    ],
  },
  {
    key: "continuityClaims",
    table: "slate_continuity_claims",
    primaryKey: "id",
    columns: [
      "id",
      "series_id",
      "project_id",
      "section_id",
      "scope_kind",
      "subject_entity_id",
      "predicate",
      "object_entity_id",
      "value",
      "epistemic_status",
      "perspective_entity_id",
      "confidence",
      "anchors_json",
      "source_id",
      "supersedes_claim_id",
      "producer_versions_json",
      "created_at",
    ],
    deferredFields: ["supersedes_claim_id"],
  },
  {
    key: "continuityEvents",
    table: "slate_continuity_events",
    primaryKey: "id",
    columns: [
      "id",
      "series_id",
      "project_id",
      "section_id",
      "scope_kind",
      "title",
      "description",
      "chronology_key",
      "participant_entity_ids_json",
      "location_entity_id",
      "anchors_json",
      "source_id",
      "producer_versions_json",
      "created_at",
    ],
  },
  {
    key: "continuityRelationships",
    table: "slate_continuity_relationships",
    primaryKey: "id",
    columns: [
      "id",
      "series_id",
      "from_entity_id",
      "to_entity_id",
      "kind",
      "state",
      "epistemic_status",
      "anchors_json",
      "source_id",
      "producer_versions_json",
      "created_at",
    ],
  },
  {
    key: "continuityKnowledge",
    table: "slate_continuity_knowledge",
    primaryKey: "id",
    columns: [
      "id",
      "series_id",
      "character_entity_id",
      "claim_id",
      "learned_event_id",
      "status",
      "anchors_json",
      "source_id",
      "producer_versions_json",
      "created_at",
    ],
  },
  {
    key: "continuityThreads",
    table: "slate_continuity_threads",
    primaryKey: "id",
    columns: [
      "id",
      "series_id",
      "project_id",
      "section_id",
      "scope_kind",
      "label",
      "status",
      "due_section_id",
      "anchors_json",
      "source_id",
      "producer_versions_json",
      "created_at",
      "updated_at",
    ],
  },
  {
    key: "continuityConcerns",
    table: "slate_continuity_concerns",
    primaryKey: "id",
    columns: [
      "id",
      "series_id",
      "project_id",
      "section_id",
      "scope_kind",
      "kind",
      "severity",
      "status",
      "summary",
      "explanation",
      "claim_ids_json",
      "anchors_json",
      "recommended_resolution",
      "resolution_json",
      "producer_versions_json",
      "created_at",
      "resolved_at",
    ],
  },
  {
    key: "continuityGenerations",
    table: "slate_continuity_generations",
    primaryKey: "id",
    columns: [
      "id",
      "project_id",
      "generation",
      "status",
      "target_version",
      "source_fingerprint",
      "comparison_summary",
      "producer_versions_json",
      "created_at",
      "completed_at",
    ],
  },
  {
    key: "continuityJobs",
    table: "slate_continuity_jobs",
    primaryKey: "id",
    columns: [
      "id",
      "series_id",
      "project_id",
      "section_id",
      "source_id",
      "source_revision",
      "kind",
      "status",
      "attempts",
      "input_fingerprint",
      "error",
      "available_at",
      "started_at",
      "completed_at",
      "created_at",
      "updated_at",
    ],
  },
];

const SLATE_REFERENCE_RULES: ReadonlyArray<{
  source: SlateBackupCollectionKey;
  field: string;
  target: SlateBackupCollectionKey;
  targetTable: SlateBackupTable;
}> = [
  {
    source: "projects",
    field: "series_id",
    target: "series",
    targetTable: "slate_series",
  },
  {
    source: "revisions",
    field: "project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "versions",
    field: "project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "sections",
    field: "project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "sections",
    field: "series_id",
    target: "series",
    targetTable: "slate_series",
  },
  {
    source: "sections",
    field: "parent_section_id",
    target: "sections",
    targetTable: "slate_sections",
  },
  {
    source: "handoffs",
    field: "source_project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "handoffs",
    field: "source_section_id",
    target: "sections",
    targetTable: "slate_sections",
  },
  {
    source: "handoffs",
    field: "target_project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "sectionVersions",
    field: "project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "sectionVersions",
    field: "section_id",
    target: "sections",
    targetTable: "slate_sections",
  },
  {
    source: "manuscriptStates",
    field: "project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "continuitySources",
    field: "series_id",
    target: "series",
    targetTable: "slate_series",
  },
  {
    source: "continuitySources",
    field: "project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "continuitySources",
    field: "section_id",
    target: "sections",
    targetTable: "slate_sections",
  },
  {
    source: "continuitySources",
    field: "supersedes_source_id",
    target: "continuitySources",
    targetTable: "slate_continuity_sources",
  },
  {
    source: "continuityEntities",
    field: "series_id",
    target: "series",
    targetTable: "slate_series",
  },
  {
    source: "continuityEntities",
    field: "source_id",
    target: "continuitySources",
    targetTable: "slate_continuity_sources",
  },
  {
    source: "continuityAliases",
    field: "series_id",
    target: "series",
    targetTable: "slate_series",
  },
  {
    source: "continuityAliases",
    field: "entity_id",
    target: "continuityEntities",
    targetTable: "slate_continuity_entities",
  },
  {
    source: "continuityAliases",
    field: "source_id",
    target: "continuitySources",
    targetTable: "slate_continuity_sources",
  },
  {
    source: "continuityClaims",
    field: "series_id",
    target: "series",
    targetTable: "slate_series",
  },
  {
    source: "continuityClaims",
    field: "project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "continuityClaims",
    field: "section_id",
    target: "sections",
    targetTable: "slate_sections",
  },
  {
    source: "continuityClaims",
    field: "subject_entity_id",
    target: "continuityEntities",
    targetTable: "slate_continuity_entities",
  },
  {
    source: "continuityClaims",
    field: "object_entity_id",
    target: "continuityEntities",
    targetTable: "slate_continuity_entities",
  },
  {
    source: "continuityClaims",
    field: "perspective_entity_id",
    target: "continuityEntities",
    targetTable: "slate_continuity_entities",
  },
  {
    source: "continuityClaims",
    field: "source_id",
    target: "continuitySources",
    targetTable: "slate_continuity_sources",
  },
  {
    source: "continuityClaims",
    field: "supersedes_claim_id",
    target: "continuityClaims",
    targetTable: "slate_continuity_claims",
  },
  {
    source: "continuityEvents",
    field: "series_id",
    target: "series",
    targetTable: "slate_series",
  },
  {
    source: "continuityEvents",
    field: "project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "continuityEvents",
    field: "section_id",
    target: "sections",
    targetTable: "slate_sections",
  },
  {
    source: "continuityEvents",
    field: "location_entity_id",
    target: "continuityEntities",
    targetTable: "slate_continuity_entities",
  },
  {
    source: "continuityEvents",
    field: "source_id",
    target: "continuitySources",
    targetTable: "slate_continuity_sources",
  },
  {
    source: "continuityRelationships",
    field: "series_id",
    target: "series",
    targetTable: "slate_series",
  },
  {
    source: "continuityRelationships",
    field: "from_entity_id",
    target: "continuityEntities",
    targetTable: "slate_continuity_entities",
  },
  {
    source: "continuityRelationships",
    field: "to_entity_id",
    target: "continuityEntities",
    targetTable: "slate_continuity_entities",
  },
  {
    source: "continuityRelationships",
    field: "source_id",
    target: "continuitySources",
    targetTable: "slate_continuity_sources",
  },
  {
    source: "continuityKnowledge",
    field: "series_id",
    target: "series",
    targetTable: "slate_series",
  },
  {
    source: "continuityKnowledge",
    field: "character_entity_id",
    target: "continuityEntities",
    targetTable: "slate_continuity_entities",
  },
  {
    source: "continuityKnowledge",
    field: "claim_id",
    target: "continuityClaims",
    targetTable: "slate_continuity_claims",
  },
  {
    source: "continuityKnowledge",
    field: "learned_event_id",
    target: "continuityEvents",
    targetTable: "slate_continuity_events",
  },
  {
    source: "continuityKnowledge",
    field: "source_id",
    target: "continuitySources",
    targetTable: "slate_continuity_sources",
  },
  {
    source: "continuityThreads",
    field: "series_id",
    target: "series",
    targetTable: "slate_series",
  },
  {
    source: "continuityThreads",
    field: "project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "continuityThreads",
    field: "section_id",
    target: "sections",
    targetTable: "slate_sections",
  },
  {
    source: "continuityThreads",
    field: "due_section_id",
    target: "sections",
    targetTable: "slate_sections",
  },
  {
    source: "continuityThreads",
    field: "source_id",
    target: "continuitySources",
    targetTable: "slate_continuity_sources",
  },
  {
    source: "continuityConcerns",
    field: "series_id",
    target: "series",
    targetTable: "slate_series",
  },
  {
    source: "continuityConcerns",
    field: "project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "continuityConcerns",
    field: "section_id",
    target: "sections",
    targetTable: "slate_sections",
  },
  {
    source: "continuityGenerations",
    field: "project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "continuityJobs",
    field: "series_id",
    target: "series",
    targetTable: "slate_series",
  },
  {
    source: "continuityJobs",
    field: "project_id",
    target: "projects",
    targetTable: "slate_projects",
  },
  {
    source: "continuityJobs",
    field: "section_id",
    target: "sections",
    targetTable: "slate_sections",
  },
  {
    source: "continuityJobs",
    field: "source_id",
    target: "continuitySources",
    targetTable: "slate_continuity_sources",
  },
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
      throw new Error(
        `Account backup Slate collection ${key} contains an invalid row.`,
      );
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
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value;
  }
  throw new Error(`Account backup ${table}.${field} must be a scalar value.`);
}

function exportSlateSnapshot(
  db: DatabaseSync,
  userId: string,
): BackupSlateSnapshot {
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
        if (
          value === null ||
          typeof value === "string" ||
          typeof value === "number"
        ) {
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
    const optionalFields = spec.optionalFields ?? {};
    for (const row of rows) {
      statement.run(
        userId,
        ...spec.columns.map((column) =>
          deferredFields.has(column)
            ? null
            : Object.prototype.hasOwnProperty.call(row, column)
              ? readSlateBackupScalar(row, column, spec.table)
              : Object.prototype.hasOwnProperty.call(optionalFields, column)
                ? optionalFields[column]!
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
  userKey: Buffer,
): BackupSnapshot {
  const livingShellState = db
    .prepare(
      "SELECT capability_revelations FROM living_shell_account_state WHERE user_id = ?",
    )
    .get(userId) as { capability_revelations?: string } | undefined;
  const user = db
    .prepare(
      `SELECT
         theme,
         graphics_quality,
         crt_focus,
         typography_scale,
         startup_preference,
         preferred_provider,
         ephemeral_chat_provider_preferences,
         preferred_image_provider,
         provider_locked,
         auto_memory,
         memory_learn_about_player,
         memory_learn_about_bots,
         memory_acquisition_sensitivity,
         memory_short_term_days,
         memory_long_term_threshold,
         memory_inferred_min_evidence,
         memory_inferred_threshold,
         composer_writing_assist,
         experimental_dual_ollama_enabled,
         experimental_all_model_effort_enabled,
         coffee_experimental_table_angle_enabled,
         psychic_mode_enabled,
         auto_switch_model,
         auto_fallback_chain,
         online_auto_provider_bias,
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
         atmosphere_style,
         hub_atmosphere_enabled,
         zen_wallpaper_style_notes,
         zen_message_font_min_px,
         zen_message_font_max_px,
         zen_ask_question_patience_enabled,
         zen_ask_question_patience_ms,
         zen_autonomy_enabled,
         prism_default_bot_face_thinking_frames,
         prism_default_bot_face_mouth_speech_poses,
         prism_default_llm_model,
         prism_image_tool_llm_model,
         prism_refract_local_model,
         prism_refract_online_model,
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
         ,voice_mode, voice_effects_enabled, voice_volume, operating_system_voices_enabled, english_voice_engine,
         default_system_voice_name, default_elevenlabs_voice_id, elevenlabs_voice_bank,
         elevenlabs_voice_model, elevenlabs_voice_collection_id,
         zen_player_voice_enabled, player_audio_voice_profile,
         prism_default_bot_audio_voice_profile
       FROM users
       WHERE id = ?`,
    )
    .get(userId) as
    | {
        theme: "light" | "dark" | "system";
        graphics_quality: string | null;
        crt_focus: number | null;
        typography_scale: string | null;
        atmosphere_style: string | null;
        hub_atmosphere_enabled: number;
        startup_preference: string | null;
        preferred_provider: ProviderName;
        ephemeral_chat_provider_preferences: string | null;
        preferred_image_provider: ImageProviderName;
        provider_locked: number;
        auto_memory: number;
        memory_learn_about_player: number | null;
        memory_learn_about_bots: number | null;
        memory_acquisition_sensitivity: string | null;
        memory_short_term_days: number | null;
        memory_long_term_threshold: number | null;
        memory_inferred_min_evidence: number | null;
        memory_inferred_threshold: number | null;
        composer_writing_assist: number;
        experimental_dual_ollama_enabled: number;
        experimental_all_model_effort_enabled: number;
        coffee_experimental_table_angle_enabled: number;
        psychic_mode_enabled: number;
        auto_switch_model: number;
        auto_fallback_chain: string | null;
        online_auto_provider_bias: number;
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
        prism_default_bot_face_mouth_speech_poses: string | null;
        prism_default_llm_model: string | null;
        prism_image_tool_llm_model: string | null;
        prism_refract_local_model: string | null;
        prism_refract_online_model: string | null;
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
        operating_system_voices_enabled: number | null;
        english_voice_engine: string | null;
        default_system_voice_name: string | null;
        default_elevenlabs_voice_id: string | null;
        elevenlabs_voice_bank: string | null;
        elevenlabs_voice_model: string | null;
        elevenlabs_voice_collection_id: string | null;
        zen_player_voice_enabled: number | null;
        player_audio_voice_profile: string | null;
        prism_default_bot_audio_voice_profile: string | null;
      }
    | undefined;
  const settings: BackupUserSettings | undefined = user
    ? {
        theme: user.theme,
        graphicsQuality: normalizeGraphicsQuality(user.graphics_quality),
        crtFocus: normalizeCrtFocus(user.crt_focus),
        typographyScale: normalizePrismTypographyScale(user.typography_scale),
        atmosphereStyle: normalizeHubAtmosphereStyle(user.atmosphere_style),
        hubAtmosphereEnabled: user.hub_atmosphere_enabled !== 0,
        startupPreference: normalizePrismStartupPreference(
          user.startup_preference,
        ),
        capabilityRevelations: normalizePrismCapabilityRevelations(
          livingShellState?.capability_revelations,
          { completedFallback: true },
        ),
        preferredProvider: user.preferred_provider,
        ephemeralChatProviderPreferences:
          normalizeEphemeralChatProviderPreferences(
            user.ephemeral_chat_provider_preferences,
          ),
        preferredImageProvider: user.preferred_image_provider,
        providerLocked: user.provider_locked === 1,
        autoMemory: user.auto_memory === 1,
        memoryEcology: normalizeMemoryEcologySettings({
          auto_memory: user.auto_memory,
          memory_learn_about_player: user.memory_learn_about_player,
          memory_learn_about_bots: user.memory_learn_about_bots,
          memory_acquisition_sensitivity: user.memory_acquisition_sensitivity,
          memory_short_term_days: user.memory_short_term_days,
          memory_long_term_threshold: user.memory_long_term_threshold,
          memory_inferred_min_evidence: user.memory_inferred_min_evidence,
          memory_inferred_threshold: user.memory_inferred_threshold,
        }),
        composerWritingAssist: user.composer_writing_assist !== 0,
        experimentalDualOllamaEnabled:
          user.experimental_dual_ollama_enabled === 1,
        experimentalAllModelEffortEnabled:
          user.experimental_all_model_effort_enabled === 1,
        coffeeExperimentalTableAngleEnabled:
          user.coffee_experimental_table_angle_enabled === 1,
        psychicModeEnabled: user.psychic_mode_enabled === 1,
        autoModeEnabled: user.auto_switch_model === 1,
        autoFallbackChain: parseStoredAutoFallbackChain(
          user.auto_fallback_chain,
        ),
        onlineAutoProviderBias: clampOnlineAutoProviderBias(
          user.online_auto_provider_bias,
        ),
        hiddenBotModelIds: safeParseStringArray(user.hidden_bot_model_ids),
        hiddenComfyUiWorkflowIds: safeParseStringArray(
          user.hidden_comfyui_workflow_ids,
        ),
        preferredLocalModel: user.preferred_local_model ?? "",
        preferredOnlineModel: user.preferred_online_model ?? "",
        lenientLocalImageFallbackModel:
          user.lenient_local_image_fallback_model ?? "",
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
          user.zen_wallpaper_opacity,
        ),
        zenWallpaperTextMaskEnabled: normalizeZenWallpaperTextMaskEnabled(
          user.zen_wallpaper_text_mask_enabled,
        ),
        zenWallpaperGrayscaleEnabled: normalizeZenWallpaperGrayscaleEnabled(
          user.zen_wallpaper_grayscale_enabled,
        ),
        zenWallpaperBlurredEdgesEnabled:
          normalizeZenWallpaperBlurredEdgesEnabled(
            user.zen_wallpaper_blurred_edges_enabled,
        ),
        zenWallpaperStyleNotes: normalizeZenWallpaperStyleNotes(
          user.zen_wallpaper_style_notes,
        ),
        zenMessageFontMinPx: normalizeZenMessageFontMinPx(
          user.zen_message_font_min_px,
        ),
        zenMessageFontMaxPx: normalizeZenMessageFontMaxPx(
          user.zen_message_font_max_px,
          undefined,
          normalizeZenMessageFontMinPx(user.zen_message_font_min_px),
        ),
        zenAskQuestionPatienceEnabled: normalizeZenAskQuestionPatienceEnabled(
          user.zen_ask_question_patience_enabled,
        ),
        zenAskQuestionPatienceMs: normalizeZenAskQuestionPatienceMs(
          user.zen_ask_question_patience_ms,
        ),
        zenAutonomyEnabled: normalizeZenAutonomyEnabled(
          user.zen_autonomy_enabled,
        ),
        prismDefaultBotFaceThinkingFrames:
          parseStoredBotFaceThinkingFrames(
            user.prism_default_bot_face_thinking_frames,
          ) ?? DEFAULT_BOT_FACE_THINKING_FRAMES,
        prismDefaultBotFaceMouthSpeechPoses:
          parseStoredBotFaceCustomSpeechPoses(
            user.prism_default_bot_face_mouth_speech_poses,
          ),
        prismDefaultLlmModel: user.prism_default_llm_model ?? "",
        prismImageToolLlmModel: user.prism_image_tool_llm_model ?? "",
        prismRefractLocalModel: user.prism_refract_local_model ?? "",
        prismRefractOnlineModel: user.prism_refract_online_model ?? "",
        voiceMode: normalizeVoiceMode(user.voice_mode),
        voiceEffectsEnabled: user.voice_effects_enabled !== 0,
        voiceVolume: normalizeBotVoiceVolume(user.voice_volume),
        operatingSystemVoicesEnabled:
          user.operating_system_voices_enabled !== 0,
        zenPlayerVoiceEnabled: user.zen_player_voice_enabled === 1,
        playerAudioVoiceProfile:
          parseStoredBotAudioVoiceProfileV1(
            user.player_audio_voice_profile,
          ) ?? normalizeBotAudioVoiceProfileV1(undefined),
        prismDefaultBotAudioVoiceProfile:
          parseStoredBotAudioVoiceProfileV1(
            user.prism_default_bot_audio_voice_profile,
          ) ?? normalizeBotAudioVoiceProfileV1(undefined),
        englishVoiceEngine: normalizeEnglishVoiceEngine(
          user.english_voice_engine,
        ),
        defaultSystemVoiceName: user.default_system_voice_name,
        defaultElevenLabsVoiceId: user.default_elevenlabs_voice_id,
        elevenLabsVoiceBank: parseStoredElevenLabsVoiceBank(
          user.elevenlabs_voice_bank,
        ),
        elevenLabsVoiceModel: user.elevenlabs_voice_model ?? "",
        elevenLabsVoiceCollectionId: user.elevenlabs_voice_collection_id ?? "",
        devMemoriesEnabled: user.dev_memories_enabled === 1,
        devMemoriesText: user.dev_memories_text ?? "",
        ...(user.openai_key_ciphertext &&
        user.openai_key_iv &&
        user.openai_key_tag
          ? {
              openAiApiKey: decryptText(
                {
                  ciphertext: user.openai_key_ciphertext,
                  iv: user.openai_key_iv,
                  tag: user.openai_key_tag,
                },
                userKey,
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
                userKey,
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
                userKey,
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
         self_referral,
         system_prompt,
         clone_family_id,
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
         accent_color,
         glyph,
         powers_json,
         avatar_details_json,
         face_eyes_font,
         face_eye_character,
         face_eye_animation,
         face_mouth_font,
         face_mouth_character,
         face_mouth_animation,
         face_mouth_speech_poses,
         face_mouth_coffee_pucker,
         face_font_weight,
         face_eye_scale,
         face_eye_offset_x,
         face_eye_offset_y,
         face_eye_rotation_deg,
         face_eye_count,
         face_eye_spacing,
         face_mouth_scale,
         face_mouth_offset_x,
         face_mouth_offset_y,
         face_mouth_rotation_deg,
         face_blink_bar,
         face_blink_count,
         face_blink_scale,
         face_blink_offset_x,
         face_blink_offset_y,
         face_blink_rotation_deg,
         face_thinking_frames,
         face_thinking_scale,
         face_thinking_offset_x,
         face_thinking_offset_y,
         authored_audio_voice_profile,
         audio_voice_profile_override,
         chat_enabled,
         visibility,
         created_at,
         updated_at,
         (SELECT mood_key FROM bot_global_moods AS mood
           WHERE mood.user_id = bots.user_id AND mood.bot_id = bots.id) AS global_mood_key
       FROM bots
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    name_pronunciation: string | null;
    self_referral: string | null;
    system_prompt: string;
    global_mood_key: string | null;
    clone_family_id: string | null;
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
    accent_color: string | null;
    glyph: string | null;
    powers_json: string | null;
    avatar_details_json: string | null;
    face_eyes_font: string | null;
    face_eye_character: string | null;
    face_eye_animation: string | null;
    face_mouth_font: string | null;
    face_mouth_character: string | null;
    face_mouth_animation: string | null;
    face_mouth_speech_poses: string | null;
    face_mouth_coffee_pucker: number | null;
    face_font_weight: number | null;
    face_eye_scale: number | null;
    face_eye_offset_x: number | null;
    face_eye_offset_y: number | null;
    face_eye_rotation_deg: number | null;
    face_eye_count: number | null;
    face_eye_spacing: number | null;
    face_mouth_scale: number | null;
    face_mouth_offset_x: number | null;
    face_mouth_offset_y: number | null;
    face_mouth_rotation_deg: number | null;
    face_blink_bar: string | null;
    face_blink_count: number | null;
    face_blink_scale: number | null;
    face_blink_offset_x: number | null;
    face_blink_offset_y: number | null;
    face_blink_rotation_deg: number | null;
    face_thinking_frames: string | null;
    face_thinking_scale: number | null;
    face_thinking_offset_x: number | null;
    face_thinking_offset_y: number | null;
    authored_audio_voice_profile: string | null;
    audio_voice_profile_override: string | null;
    chat_enabled: number;
    visibility: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const coffeeGroups = db
    .prepare(
      `SELECT id, name, ethos, atmosphere_json, synthesis_json,
              coffee_settings, preset_mode, coffee_topic_mode, model_choice,
              starter_topics, mood_summary, archived_at, created_at, updated_at
         FROM coffee_groups
        WHERE user_id = ? AND archived_at IS NULL
        ORDER BY created_at, id`,
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    ethos: string;
    atmosphere_json: string;
    synthesis_json: string;
    coffee_settings: string;
    preset_mode: string;
    coffee_topic_mode: string;
    model_choice: string;
    starter_topics: string;
    mood_summary: string;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
  }>;
  const coffeeGroupSoundtracks = db
    .prepare(
      `SELECT group_id, model, prompt, content_type, audio_bytes, duration_ms,
              revision, created_at, updated_at
         FROM coffee_group_soundtracks
        WHERE user_id = ? AND audio_bytes IS NOT NULL`,
    )
    .all(userId) as Array<{
      group_id: string;
      model: string;
      prompt: string;
      content_type: string;
      audio_bytes: Uint8Array;
      duration_ms: number;
      revision: number;
      created_at: string;
      updated_at: string;
    }>;
  const coffeeGroupSoundtrackByGroupId = new Map(
    coffeeGroupSoundtracks.map((row) => [row.group_id, row] as const),
  );
  const coffeeGroupPayload = coffeeGroups.map(
    (group): BackupCoffeeGroupSnapshot => {
      const seatRows = db
        .prepare(
          `SELECT seat_index, bot_id
             FROM coffee_group_seats
            WHERE user_id = ? AND group_id = ?
            ORDER BY seat_index`,
        )
        .all(userId, group.id) as Array<{
        seat_index: number;
        bot_id: string | null;
      }>;
      const seats: Array<string | null> = Array.from(
        { length: BACKUP_COFFEE_GROUP_SEAT_COUNT },
        () => null,
      );
      for (const seat of seatRows) {
        if (
          Number.isInteger(seat.seat_index) &&
          seat.seat_index >= 0 &&
          seat.seat_index < BACKUP_COFFEE_GROUP_SEAT_COUNT
        ) {
          seats[seat.seat_index] = seat.bot_id?.trim() || null;
        }
      }
      let coffeeSettings: CoffeeSessionSettings;
      try {
        coffeeSettings = normalizeCoffeeSessionSettings(
          JSON.parse(group.coffee_settings) as unknown,
        );
      } catch {
        coffeeSettings = normalizeCoffeeSessionSettings(undefined);
      }
      const soundtrack = coffeeGroupSoundtrackByGroupId.get(group.id);
      return {
        id: group.id,
        name: group.name,
        seatBotIds: seats,
        coffeeSettings,
        presetMode: group.preset_mode === "auto" ? "auto" : "manual",
        topicSelectionMode:
          group.coffee_topic_mode === "auto" ? "auto" : "manual",
        modelChoice: parseBackupJsonObject(group.model_choice),
        starterTopics: parseBackupJsonObject(group.starter_topics),
        moodSummary: parseBackupJsonObject(group.mood_summary),
        ethos: typeof group.ethos === "string" ? group.ethos : "",
        atmosphere: parseBackupCoffeeGroupAtmosphere(
          group.atmosphere_json,
          group.updated_at,
        ),
        ...(soundtrack
          ? {
              soundtrack: {
              provider: "elevenlabs",
              model: soundtrack.model,
              prompt: soundtrack.prompt,
              contentType: soundtrack.content_type,
              audioBase64: Buffer.from(soundtrack.audio_bytes).toString("base64"),
              durationMs: soundtrack.duration_ms,
              revision: soundtrack.revision,
              createdAt: soundtrack.created_at,
              updatedAt: soundtrack.updated_at,
              },
            }
          : {}),
        synthesis: parseBackupJsonObject(group.synthesis_json),
        archivedAt: group.archived_at,
        createdAt: group.created_at,
        updatedAt: group.updated_at,
      };
    },
  );

  const conversations = db
    .prepare(
      `SELECT id, title, conversation_mode, bot_group_ids, coffee_settings,
              coffee_group_id, coffee_duration_minutes, coffee_preset_id,
              coffee_topic, coffee_absent_bot_ids, coffee_team_mode_json,
              coffee_power_plan_json, created_at, updated_at
         FROM conversations
        WHERE user_id = ?
        ORDER BY updated_at DESC`,
    )
    .all(userId) as Array<{
    id: string;
    title: string;
    conversation_mode: string;
    bot_group_ids: string | null;
    coffee_settings: string | null;
    coffee_group_id: string | null;
    coffee_duration_minutes: number | null;
    coffee_preset_id: string | null;
    coffee_topic: string | null;
    coffee_absent_bot_ids: string | null;
    coffee_team_mode_json: string | null;
    coffee_power_plan_json: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const conversationPayload = conversations.map((conversation) => {
    const messages = db
      .prepare(
        "SELECT id, role, content, provider, model, bot_id, tool_payload, coffee_audience_bot_ids, created_at FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC",
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
        const parsed = JSON.parse(
          conversation.coffee_power_plan_json,
        ) as CoffeePowerPlanV1;
        return parsed?.version === 1 &&
          parsed.bots &&
          typeof parsed.bots === "object"
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
      ...(conversation.conversation_mode === "coffee"
        ? {
            coffee: {
              settings: normalizeCoffeeSessionSettings(
                conversation.coffee_settings
                  ? JSON.parse(conversation.coffee_settings) as unknown
                  : undefined,
              ),
              botGroupIds: conversation.bot_group_ids
                ? (JSON.parse(conversation.bot_group_ids) as Array<string | null>)
                : [],
              groupId: conversation.coffee_group_id,
              durationMinutes: conversation.coffee_duration_minutes,
              presetId: conversation.coffee_preset_id,
              topic: conversation.coffee_topic,
              absentBotIds: conversation.coffee_absent_bot_ids
                ? (JSON.parse(conversation.coffee_absent_bot_ids) as string[])
                : [],
              teamsJson: conversation.coffee_team_mode_json,
            },
          }
        : {}),
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
          typeof message.tool_payload === "string" &&
          message.tool_payload.trim().length > 0
            ? message.tool_payload
            : undefined;
        const coffeeAudienceBotIds = (() => {
          if (!message.coffee_audience_bot_ids) return undefined;
          try {
            const parsed = JSON.parse(
              message.coffee_audience_bot_ids,
            ) as unknown;
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
      `SELECT id, conversation_id, bot_id, target_bot_id, confidence,
              base_confidence, category, tier, lifecycle, durability, source,
              certainty, source_message_ids, evidence_lineage_known,
              last_reinforced_at,
              ciphertext, iv, tag, created_at
         FROM memories
        WHERE user_id = ?
        ORDER BY created_at DESC`,
    )
    .all(userId) as Array<{
    id: string;
    conversation_id: string | null;
    bot_id: string | null;
    target_bot_id: string | null;
    confidence: number;
    base_confidence: number | null;
    category: "general" | "user" | "bot_relation";
    tier: "short_term" | "long_term";
    lifecycle: MemoryLifecycle | null;
    durability: number | null;
    source: "direct" | "inferred";
    certainty: number | null;
    source_message_ids: string | null;
    evidence_lineage_known: number;
    last_reinforced_at: string | null;
    ciphertext: string;
    iv: string;
    tag: string;
    created_at: string;
  }>;
  const memoryEvidenceIds = new Map<string, string[]>();
  for (const link of db
    .prepare(
      `SELECT inferred_memory_id, evidence_memory_id
         FROM memory_evidence_links
        WHERE user_id = ?
        ORDER BY created_at, evidence_memory_id`,
    )
    .all(userId) as Array<{
    inferred_memory_id: string;
    evidence_memory_id: string;
  }>) {
    const ids = memoryEvidenceIds.get(link.inferred_memory_id) ?? [];
    ids.push(link.evidence_memory_id);
    memoryEvidenceIds.set(link.inferred_memory_id, ids);
  }
  const memoryReceipts = db
    .prepare(
      `SELECT id, memory_id, learner_bot_id, target_bot_id, conversation_id,
              kind, created_at, read_at
         FROM memory_acquisition_receipts
        WHERE user_id = ?
        ORDER BY created_at`,
    )
    .all(userId) as Array<{
    id: string;
    memory_id: string;
    learner_bot_id: string | null;
    target_bot_id: string | null;
    conversation_id: string | null;
    kind: "player_memory" | "bot_relation";
    created_at: string;
    read_at: string | null;
  }>;

  const botcastShows = db
    .prepare(
    `SELECT id, host_bot_id, name, premise, hosting_style, accent_color,
            fallback_studio_accent_variant,
            host_chat_ignoring_until_guest_show,
            atmosphere_json, created_at, updated_at
       FROM botcast_shows WHERE user_id = ? ORDER BY created_at`,
    )
    .all(userId) as Array<{
    id: string;
    host_bot_id: string;
    name: string;
    premise: string;
    hosting_style: string;
    accent_color: string;
    fallback_studio_accent_variant: number;
    host_chat_ignoring_until_guest_show: number;
    atmosphere_json: string;
    created_at: string;
    updated_at: string;
  }>;
  const botcastEpisodes = db
    .prepare(
    "SELECT * FROM botcast_episodes WHERE user_id = ? ORDER BY created_at",
    )
    .all(userId) as Array<Record<string, unknown>>;
  const botcastSegments = db
    .prepare(
    "SELECT * FROM botcast_episode_segments WHERE user_id = ? ORDER BY episode_id, ordinal",
    )
    .all(userId) as Array<Record<string, unknown>>;
  const botcastMessages = db
    .prepare(
    "SELECT * FROM botcast_messages WHERE user_id = ? ORDER BY episode_id, created_at, rowid",
    )
    .all(userId) as Array<Record<string, unknown>>;
  const botcastEvents = db
    .prepare(
    "SELECT * FROM botcast_events WHERE user_id = ? ORDER BY episode_id, sequence",
    )
    .all(userId) as Array<Record<string, unknown>>;
  const presenceBeats = db
    .prepare(
      `SELECT id, surface, session_id, response_id, speaker_bot_id,
              speaker_name, trigger, source, text, heard_character_count,
              completion, playback_started_at_ms, playback_ended_at_ms,
              created_at, updated_at
         FROM bot_presence_beats
        WHERE user_id = ?
        ORDER BY created_at, rowid`,
    )
    .all(userId) as Array<Record<string, unknown>>;
  const sessionNotes = db
    .prepare(
      `SELECT surface, session_id, body, captures_json, created_at, updated_at
         FROM applet_session_notes
        WHERE user_id = ?
        ORDER BY updated_at, rowid`,
    )
    .all(userId) as Array<Record<string, unknown>>;
  const transcriptFrameSamples = db
    .prepare(
      `SELECT surface, session_id, entry_id, fps, captured_at
         FROM applet_transcript_frame_samples
        WHERE user_id = ?
        ORDER BY captured_at, rowid`,
    )
    .all(userId) as Array<Record<string, unknown>>;
  const botcastIntroAudio = db
    .prepare(
    `SELECT show_id, provider, model, prompt, content_type, audio_bytes,
            duration_ms, outdent_prompt, outdent_content_type,
            outdent_audio_bytes, outdent_duration_ms, revision,
            created_at, updated_at
       FROM botcast_show_intro_audio WHERE user_id = ?`,
    )
    .all(userId) as Array<{
    show_id: string;
    provider: "elevenlabs";
    model: string;
    prompt: string;
    content_type: string;
    audio_bytes: Uint8Array;
    duration_ms: number;
    outdent_prompt: string | null;
    outdent_content_type: string | null;
    outdent_audio_bytes: Uint8Array | null;
    outdent_duration_ms: number | null;
    revision: number;
    created_at: string;
    updated_at: string;
  }>;
  const botcastIntroAudioByShowId = new Map(
    botcastIntroAudio.map((row) => [row.show_id, row] as const),
  );
  const botcastAtmosphereAudio = db
    .prepare(
      `SELECT show_id, provider, model, prompt, content_type, audio_bytes,
            duration_ms, revision, created_at, updated_at
       FROM botcast_show_atmosphere_audio WHERE user_id = ?`,
    )
    .all(userId) as typeof botcastIntroAudio;
  const botcastAtmosphereAudioByShowId = new Map(
    botcastAtmosphereAudio.map((row) => [row.show_id, row] as const),
  );
  const replayRecordings = db
    .prepare(
      `SELECT id, surface, source_id, manifest_version, manifest_json,
              manifest_hash, timeline_json, transcript_vtt,
              transcript_markdown, created_at, updated_at
         FROM replay_recordings
        WHERE user_id = ? AND manifest_json IS NOT NULL
        ORDER BY created_at`,
    )
    .all(userId) as Array<Record<string, string | number | null>>;
  const replayVoiceTakes = db
    .prepare(
      `SELECT take.id, take.recording_id, take.source_key,
              take.source_message_id, take.source_event_id,
              take.snapshot_json, take.created_at, take.updated_at
         FROM replay_voice_takes AS take
         JOIN replay_recordings AS recording ON recording.id = take.recording_id
        WHERE take.user_id = ? AND recording.manifest_json IS NOT NULL
        ORDER BY take.created_at, take.rowid`,
    )
    .all(userId) as Array<Record<string, string | number | null>>;
  const debateSessions = db
    .prepare(
      `SELECT id, revision, status, phase, step_key, player_role,
              player_side_id, create_idempotency_key, motion, winner_side_id,
              session_json, error, created_at, updated_at, completed_at
         FROM debate_sessions
        WHERE user_id = ? AND status != 'cancelled'
        ORDER BY created_at`,
    )
    .all(userId) as Array<Record<string, string | number | null>>;
  const debateEvents = db
    .prepare(
      `SELECT event.id, event.session_id, event.sequence, event.phase,
              event.step_key, event.kind, event.event_json, event.created_at
         FROM debate_events AS event
         JOIN debate_sessions AS session ON session.id = event.session_id
        WHERE event.user_id = ? AND session.status != 'cancelled'
        ORDER BY event.session_id, event.sequence`,
    )
    .all(userId) as Array<Record<string, string | number | null>>;
  const debateRecessCheckpoints = db
    .prepare(
      `SELECT checkpoint.session_id, checkpoint.source_revision,
              checkpoint.snapshot_json, checkpoint.created_at
         FROM debate_recess_checkpoints AS checkpoint
         JOIN debate_sessions AS session ON session.id = checkpoint.session_id
        WHERE checkpoint.user_id = ? AND session.status != 'cancelled'
        ORDER BY checkpoint.created_at`,
    )
    .all(userId) as Array<Record<string, string | number | null>>;
  const debateMysteryCases = db
    .prepare(
      `SELECT mystery.session_id, mystery.schema_version,
              mystery.generator_version, mystery.private_json,
              mystery.content_hash, mystery.created_at, mystery.updated_at
         FROM debate_mystery_cases AS mystery
         JOIN debate_sessions AS session ON session.id = mystery.session_id
        WHERE mystery.user_id = ? AND session.status != 'cancelled'
        ORDER BY mystery.created_at`,
    )
    .all(userId) as Array<Record<string, string | number | null>>;
  const debateMysteryActions = db
    .prepare(
      `SELECT action.id, action.session_id, action.sequence,
              action.action_kind, action.public_payload_json, action.occurred_at
         FROM debate_mystery_actions AS action
         JOIN debate_sessions AS session ON session.id = action.session_id
        WHERE action.user_id = ? AND session.status != 'cancelled'
        ORDER BY action.session_id, action.sequence`,
    )
    .all(userId) as Array<Record<string, string | number | null>>;
  const debateMysteryNotebooks = db
    .prepare(
      `SELECT notebook.session_id, notebook.revision, notebook.document_json,
              notebook.pending_proposal_json, notebook.created_at,
              notebook.updated_at
         FROM debate_mystery_notebooks AS notebook
         JOIN debate_sessions AS session ON session.id = notebook.session_id
        WHERE notebook.user_id = ? AND session.status != 'cancelled'
        ORDER BY notebook.created_at`,
    )
    .all(userId) as Array<Record<string, string | number | null>>;
  const debateMysteryNotebookRevisions = db
    .prepare(
      `SELECT revision.id, revision.session_id, revision.revision,
              revision.document_json, revision.reason,
              revision.idempotency_key, revision.created_at
         FROM debate_mystery_notebook_revisions AS revision
         JOIN debate_sessions AS session ON session.id = revision.session_id
        WHERE revision.user_id = ? AND session.status != 'cancelled'
        ORDER BY revision.session_id, revision.revision`,
    )
    .all(userId) as Array<Record<string, string | number | null>>;

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    modelEffortPreferences: listModelReasoningEffortPreferences(db, userId),
    modelTurboPreferences: listModelTurboPreferences(db, userId),
    bots: bots.map((bot) => ({
        id: bot.id,
        name: bot.name,
        ...(normalizeBotNamePronunciation(bot.name_pronunciation)
        ? {
            namePronunciation: normalizeBotNamePronunciation(
              bot.name_pronunciation,
            ),
          }
          : {}),
        ...(normalizeBotSelfReferral(bot.self_referral)
          ? { selfReferral: normalizeBotSelfReferral(bot.self_referral) }
          : {}),
        systemPrompt: bot.system_prompt,
        ...(GLOBAL_BOT_MOOD_KEYS.includes(
          bot.global_mood_key as GlobalBotMoodKey,
        ) && bot.global_mood_key !== "neutral"
          ? { globalMood: bot.global_mood_key as GlobalBotMoodKey }
          : {}),
        ...(bot.clone_family_id ? { cloneFamilyId: bot.clone_family_id } : {}),
        ...(normalizeVoicePreviewLine(bot.voice_preview_line)
        ? {
            voicePreviewLine: normalizeVoicePreviewLine(bot.voice_preview_line),
          }
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
        typeof bot.repetition_penalty === "number"
          ? bot.repetition_penalty
          : 1.1,
        color: bot.color,
        accentColor: normalizeBotIdentityColor(bot.accent_color),
        glyph: bot.glyph,
        ...(parseStoredBotPowersV1(bot.powers_json).length > 0
          ? { powers: parseStoredBotPowersV1(bot.powers_json) }
          : {}),
        avatarDetails: parseStoredBotAvatarDetailsV1(bot.avatar_details_json),
        faceEyesFont: normalizeBotFaceFontId(bot.face_eyes_font),
        faceEyeCharacter: normalizeBotFaceEyeCharacter(bot.face_eye_character),
        faceEyeAnimation: normalizeBotFaceEyeMovement(bot.face_eye_animation),
        faceMouthFont: normalizeBotFaceFontId(bot.face_mouth_font),
      faceMouthCharacter: normalizeBotFaceMouthCharacter(
        bot.face_mouth_character,
      ),
      faceMouthAnimation: normalizeBotFaceGlyphAnimation(
        bot.face_mouth_animation,
      ),
      faceMouthSpeechPoses:
        parseStoredBotFaceCustomSpeechPoses(bot.face_mouth_speech_poses) ??
        (bot.face_mouth_animation === "custom"
          ? parseStoredBotFaceCustomSpeechPoses(bot.face_mouth_character)
          : null),
        faceMouthCoffeePucker: bot.face_mouth_coffee_pucker === 1,
        faceFontWeight: normalizeBotFaceFontWeight(bot.face_font_weight),
        faceEyeScale: normalizeBotFaceEyeScale(bot.face_eye_scale),
        faceEyeOffsetX: normalizeBotFaceEyeOffsetX(bot.face_eye_offset_x),
        faceEyeOffsetY: normalizeBotFaceEyeOffsetY(bot.face_eye_offset_y),
      faceEyeRotationDeg: normalizeBotFaceEyeRotationDeg(
        bot.face_eye_rotation_deg,
      ),
      faceEyeCount:
        normalizeBotFaceEyeCount(bot.face_eye_count) ??
        DEFAULT_BOT_FACE_EYE_COUNT,
      faceEyeSpacing:
        normalizeBotFaceEyeSpacing(bot.face_eye_spacing) ??
        DEFAULT_BOT_FACE_EYE_SPACING,
        faceMouthScale: normalizeBotFaceMouthScale(bot.face_mouth_scale),
        faceMouthOffsetX: normalizeBotFaceMouthOffsetX(bot.face_mouth_offset_x),
        faceMouthOffsetY: normalizeBotFaceMouthOffsetY(bot.face_mouth_offset_y),
        faceMouthRotationDeg: normalizeBotFaceMouthRotationDeg(
        bot.face_mouth_rotation_deg,
        ),
        faceBlinkBar:
          normalizeBotFaceBlinkBar(bot.face_blink_bar) ??
          DEFAULT_BOT_FACE_BLINK_BAR,
        faceBlinkCount:
          normalizeBotFaceEyeCount(bot.face_blink_count) ??
          (normalizeBotFaceEyeCharacter(bot.face_eye_character) !== null
            ? normalizeBotFaceEyeCount(bot.face_eye_count)
            : null) ??
          DEFAULT_BOT_FACE_EYE_COUNT,
        faceBlinkScale:
          normalizeBotFaceBlinkScale(bot.face_blink_scale) ??
          DEFAULT_BOT_FACE_BLINK_SCALE,
        faceBlinkOffsetX:
          normalizeBotFaceBlinkOffsetX(bot.face_blink_offset_x) ??
          DEFAULT_BOT_FACE_BLINK_OFFSET_X,
        faceBlinkOffsetY:
          normalizeBotFaceBlinkOffsetY(bot.face_blink_offset_y) ??
          DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
        faceBlinkRotationDeg:
          normalizeBotFaceBlinkRotationDeg(bot.face_blink_rotation_deg) ??
          DEFAULT_BOT_FACE_BLINK_ROTATION_DEG,
        faceThinkingScale: normalizeBotFaceThinkingScale(bot.face_thinking_scale),
        faceThinkingOffsetX: normalizeBotFaceThinkingOffsetX(bot.face_thinking_offset_x),
        faceThinkingOffsetY: normalizeBotFaceThinkingOffsetY(bot.face_thinking_offset_y),
        faceThinkingFrames:
          parseStoredBotFaceThinkingFrames(bot.face_thinking_frames) ??
          DEFAULT_BOT_FACE_THINKING_FRAMES,
        authoredAudioVoiceProfile:
          parseStoredBotAudioVoiceProfileV1(bot.authored_audio_voice_profile) ??
          normalizeBotAudioVoiceProfileV1(undefined),
        audioVoiceProfileOverride: parseStoredBotAudioVoiceProfileV1(
        bot.audio_voice_profile_override,
        ),
        chatEnabled: bot.chat_enabled !== 0,
        visibility: bot.visibility === "public" ? "public" : "private",
        createdAt: bot.created_at,
        updatedAt: bot.updated_at,
      })),
    libraryGroups: listLibraryGroups(db, userId),
    coffeeGroups: coffeeGroupPayload,
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
        hostChatIgnoringUntilGuestShow:
          row.host_chat_ignoring_until_guest_show === 1,
        atmosphereJson: row.atmosphere_json,
        ...(botcastIntroAudioByShowId.get(row.id)
          ? {
              introAudio: {
                provider: "elevenlabs" as const,
                model: botcastIntroAudioByShowId.get(row.id)!.model,
                prompt: botcastIntroAudioByShowId.get(row.id)!.prompt,
                contentType: botcastIntroAudioByShowId.get(row.id)!
                  .content_type,
                audioBase64: Buffer.from(
                  botcastIntroAudioByShowId.get(row.id)!.audio_bytes,
                ).toString("base64"),
                durationMs: botcastIntroAudioByShowId.get(row.id)!.duration_ms,
                revision: botcastIntroAudioByShowId.get(row.id)!.revision,
                createdAt: botcastIntroAudioByShowId.get(row.id)!.created_at,
                updatedAt: botcastIntroAudioByShowId.get(row.id)!.updated_at,
                ...(botcastIntroAudioByShowId.get(row.id)!
                  .outdent_audio_bytes
                  ? {
                      outdent: {
                        prompt:
                          botcastIntroAudioByShowId.get(row.id)!
                            .outdent_prompt ?? "Signal show outdent",
                        contentType:
                          botcastIntroAudioByShowId.get(row.id)!
                            .outdent_content_type ?? "audio/mpeg",
                        audioBase64: Buffer.from(
                          botcastIntroAudioByShowId.get(row.id)!
                            .outdent_audio_bytes!,
                        ).toString("base64"),
                        durationMs:
                          botcastIntroAudioByShowId.get(row.id)!
                            .outdent_duration_ms ?? 4_000,
                      },
                    }
                  : {}),
              },
            }
          : {}),
        ...(botcastAtmosphereAudioByShowId.get(row.id)
          ? {
              atmosphereAudio: {
                provider: "elevenlabs" as const,
                model: botcastAtmosphereAudioByShowId.get(row.id)!.model,
                prompt: botcastAtmosphereAudioByShowId.get(row.id)!.prompt,
                contentType: botcastAtmosphereAudioByShowId.get(row.id)!
                  .content_type,
                audioBase64: Buffer.from(
                  botcastAtmosphereAudioByShowId.get(row.id)!.audio_bytes,
                ).toString("base64"),
                durationMs: botcastAtmosphereAudioByShowId.get(row.id)!
                  .duration_ms,
                revision: botcastAtmosphereAudioByShowId.get(row.id)!.revision,
                createdAt: botcastAtmosphereAudioByShowId.get(row.id)!
                  .created_at,
                updatedAt: botcastAtmosphereAudioByShowId.get(row.id)!
                  .updated_at,
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
        guestKind: row.guest_kind === "producer" ? "producer" : "bot",
        guestName:
          typeof row.guest_name === "string" ? row.guest_name : "",
        guestContext:
          typeof row.guest_context === "string" ? row.guest_context : "",
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
          typeof row.duration_minutes === "number"
            ? row.duration_minutes
            : null,
        status: String(row.status),
        segment: String(row.segment),
        outcome: typeof row.outcome === "string" ? row.outcome : null,
        tensionLevel: Number(row.tension_level ?? 0),
        warningCount: Number(row.warning_count ?? 0),
        startedAt: String(row.started_at),
        completedAt:
          typeof row.completed_at === "string" ? row.completed_at : null,
        runtimeMs: typeof row.runtime_ms === "number" ? row.runtime_ms : null,
        modelWarmupHoldDurationMs: Math.max(
          0,
          Number(row.model_warmup_hold_duration_ms ?? 0),
        ),
        modelWarmupHoldStartedAt:
          typeof row.model_warmup_hold_started_at === "string"
            ? row.model_warmup_hold_started_at
            : null,
        personaReview:
          typeof row.persona_reviewer_bot_id === "string" &&
          typeof row.persona_reviewer_name === "string" &&
          typeof row.persona_rating === "number" &&
          typeof row.persona_comment === "string" &&
          typeof row.persona_reviewed_at === "string"
            ? {
                reviewerBotId: row.persona_reviewer_bot_id,
                reviewerName: row.persona_reviewer_name,
                rating: row.persona_rating,
                comment: row.persona_comment,
                createdAt: row.persona_reviewed_at,
              }
            : null,
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
      messages: botcastMessages.map((row) => {
        const content = String(row.content);
        const silentResponse = botPowerResponseIsSilentV1(content);
        const stageActionText =
          (typeof row.stage_action_text === "string" &&
          row.stage_action_text.trim()
            ? row.stage_action_text.trim()
            : null) ??
          (silentResponse
            ? (botPowerMuteActionTextsV1(content)[0] ?? null)
            : null);
        return {
          id: String(row.id),
          episodeId: String(row.episode_id),
          speakerRole: String(row.speaker_role),
          botId: String(row.bot_id),
          content: silentResponse ? BOT_POWER_CANONICAL_SILENCE_V1 : content,
          stageActionText,
          voicePerformanceText:
            typeof row.voice_performance_text === "string"
              ? row.voice_performance_text
              : null,
          createdAt: String(row.created_at),
        };
      }),
      events: botcastEvents.map((row) => ({
        id: String(row.id),
        episodeId: String(row.episode_id),
        sequence: Number(row.sequence ?? 0),
        kind: String(row.kind),
        payloadJson: String(row.payload_json ?? "{}"),
        occurredAt: String(row.occurred_at),
      })),
    },
    debates: {
      sessions: debateSessions.map((row) => ({
        id: String(row.id),
        revision: Number(row.revision ?? 1),
        status: String(row.status),
        phase: String(row.phase),
        stepKey: String(row.step_key),
        playerRole: String(row.player_role),
        playerSideId:
          typeof row.player_side_id === "string" ? row.player_side_id : null,
        createIdempotencyKey: String(row.create_idempotency_key),
        motion: String(row.motion),
        winnerSideId:
          typeof row.winner_side_id === "string" ? row.winner_side_id : null,
        sessionJson: String(row.session_json),
        error: typeof row.error === "string" ? row.error : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        completedAt:
          typeof row.completed_at === "string" ? row.completed_at : null,
      })),
      events: debateEvents.map((row) => ({
        id: String(row.id),
        sessionId: String(row.session_id),
        sequence: Number(row.sequence ?? 1),
        phase: String(row.phase),
        stepKey: String(row.step_key),
        kind: String(row.kind),
        eventJson: String(row.event_json),
        createdAt: String(row.created_at),
      })),
      recessCheckpoints: debateRecessCheckpoints.map((row) => ({
        sessionId: String(row.session_id),
        sourceRevision: Number(row.source_revision ?? 1),
        snapshotJson: String(row.snapshot_json),
        createdAt: String(row.created_at),
      })),
      mysteryCases: debateMysteryCases.map((row) => ({
        sessionId: String(row.session_id),
        schemaVersion: Number(row.schema_version ?? 1),
        generatorVersion: Number(row.generator_version ?? 1),
        privateJson: String(row.private_json),
        contentHash: String(row.content_hash),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      })),
      mysteryActions: debateMysteryActions.map((row) => ({
        id: String(row.id),
        sessionId: String(row.session_id),
        sequence: Number(row.sequence ?? 1),
        actionKind: String(row.action_kind),
        publicPayloadJson: String(row.public_payload_json ?? "{}"),
        occurredAt: String(row.occurred_at),
      })),
      mysteryNotebooks: debateMysteryNotebooks.map((row) => ({
        sessionId: String(row.session_id),
        revision: Number(row.revision ?? 1),
        documentJson: String(row.document_json),
        pendingProposalJson:
          typeof row.pending_proposal_json === "string"
            ? row.pending_proposal_json
            : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      })),
      mysteryNotebookRevisions: debateMysteryNotebookRevisions.map((row) => ({
        id: String(row.id),
        sessionId: String(row.session_id),
        revision: Number(row.revision ?? 1),
        documentJson: String(row.document_json),
        reason: String(row.reason),
        idempotencyKey: String(row.idempotency_key),
        createdAt: String(row.created_at),
      })),
    },
    sessionNotes: sessionNotes.map((row) => ({
      surface: String(row.surface) as NonNullable<
        BackupSnapshot["sessionNotes"]
      >[number]["surface"],
      sessionId: String(row.session_id),
      body: String(row.body),
      captures: backupAppletSessionNoteCaptures(row.captures_json),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
    transcriptFrameSamples: transcriptFrameSamples.map((row) => ({
      surface: String(row.surface) as NonNullable<
        BackupSnapshot["transcriptFrameSamples"]
      >[number]["surface"],
      sessionId: String(row.session_id),
      entryId: String(row.entry_id),
      fps: Number(row.fps),
      capturedAt: String(row.captured_at),
    })),
    presenceBeats: presenceBeats.map((row) => ({
      id: String(row.id),
      surface: String(row.surface) as NonNullable<
        BackupSnapshot["presenceBeats"]
      >[number]["surface"],
      sessionId: String(row.session_id),
      responseId: String(row.response_id),
      speakerBotId: String(row.speaker_bot_id),
      speakerName: String(row.speaker_name),
      trigger: String(row.trigger) as NonNullable<
        BackupSnapshot["presenceBeats"]
      >[number]["trigger"],
      source: String(row.source) as NonNullable<
        BackupSnapshot["presenceBeats"]
      >[number]["source"],
      text: String(row.text),
      heardCharacterCount: Number(row.heard_character_count ?? 0),
      completion: String(row.completion) as NonNullable<
        BackupSnapshot["presenceBeats"]
      >[number]["completion"],
      playbackStartedAtMs: Number(row.playback_started_at_ms ?? 0),
      playbackEndedAtMs:
        typeof row.playback_ended_at_ms === "number"
          ? row.playback_ended_at_ms
          : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
    replays: {
      recordings: replayRecordings.map((row) => ({
        id: String(row.id),
        surface: row.surface === "signal" ? "signal" : "coffee",
        sourceId: String(row.source_id),
        manifestVersion: Number(row.manifest_version ?? 1),
        manifestJson: String(row.manifest_json),
        manifestHash:
          typeof row.manifest_hash === "string" ? row.manifest_hash : null,
        timelineJson:
          typeof row.timeline_json === "string" ? row.timeline_json : null,
        transcriptVtt:
          typeof row.transcript_vtt === "string" ? row.transcript_vtt : null,
        transcriptMarkdown:
          typeof row.transcript_markdown === "string"
            ? row.transcript_markdown
            : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      })),
      voiceTakes: replayVoiceTakes.map((row) => ({
        id: String(row.id),
        recordingId: String(row.recording_id),
        sourceKey: String(row.source_key),
        sourceMessageId:
          typeof row.source_message_id === "string"
            ? row.source_message_id
            : null,
        sourceEventId:
          typeof row.source_event_id === "string" ? row.source_event_id : null,
        snapshotJson: String(row.snapshot_json),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      })),
    },
    actionSfxPacks: listActionSfxPackClipsForBackup(db, userId),
    englishPacingProfiles: listEnglishPacingProfilesForBackup(db, userId),
    premiumVoiceLibrary: listPremiumVoiceLibrary(db, userId),
    memories: memories.map((memory) => ({
      id: memory.id,
      conversationId: memory.conversation_id ?? undefined,
      botId: memory.bot_id ?? undefined,
      targetBotId: memory.target_bot_id ?? undefined,
      confidence: memory.confidence,
      baseConfidence: memory.base_confidence ?? memory.confidence,
      category: memory.category,
      tier: memory.tier,
      lifecycle:
        memory.lifecycle ??
        (memory.source === "inferred" ? "derived" : memory.tier),
      durability: memory.durability ?? undefined,
      source: memory.source,
      certainty: memory.certainty ?? undefined,
      sourceMessageIds: safeParseStringArray(memory.source_message_ids),
      evidenceMemoryIds: memoryEvidenceIds.get(memory.id) ?? [],
      evidenceLineageKnown:
        memory.evidence_lineage_known !== 0 ||
        (memoryEvidenceIds.get(memory.id)?.length ?? 0) > 0,
      lastReinforcedAt: memory.last_reinforced_at ?? memory.created_at,
      createdAt: memory.created_at,
      payload: decryptJson(
        {
          ciphertext: memory.ciphertext,
          iv: memory.iv,
          tag: memory.tag,
        },
        userKey,
      ),
    })),
    memoryReceipts: memoryReceipts.map((receipt) => ({
      id: receipt.id,
      memoryId: receipt.memory_id,
      learnerBotId: receipt.learner_bot_id ?? undefined,
      targetBotId: receipt.target_bot_id ?? undefined,
      conversationId: receipt.conversation_id ?? undefined,
      kind: receipt.kind,
      createdAt: receipt.created_at,
      readAt: receipt.read_at ?? undefined,
    })),
  };
}

function assertSnapshotIdsStayWithinTenant(
  db: DatabaseSync,
  userId: string,
  snapshot: BackupSnapshot,
): void {
  const assertIds = (
    table:
      | "bots"
      | "coffee_groups"
      | "conversations"
      | "messages"
      | "memories"
      | "memory_acquisition_receipts"
      | "botcast_shows"
      | "botcast_episodes"
      | "botcast_episode_segments"
      | "botcast_messages"
      | "botcast_events"
      | "bot_presence_beats"
      | "debate_sessions"
      | "debate_events"
      | "debate_recess_checkpoints"
      | "debate_mystery_cases"
      | "debate_mystery_actions"
      | "debate_mystery_notebooks"
      | "debate_mystery_notebook_revisions"
      | "replay_recordings"
      | "replay_voice_takes"
      | SlateBackupTable,
    ids: readonly string[],
    idColumn: "id" | "project_id" | "session_id" = "id",
  ): void => {
    const seen = new Set<string>();
    const findOwner = db.prepare(
      `SELECT user_id FROM ${table} WHERE ${idColumn} = ?`,
    );
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
          bot && typeof bot.id === "string" ? [bot.id] : [],
        )
      : [],
  );
  const coffeeGroups = Array.isArray(snapshot.coffeeGroups)
    ? snapshot.coffeeGroups
    : [];
  assertIds(
    "coffee_groups",
    coffeeGroups.flatMap((group) =>
      group && typeof group.id === "string" ? [group.id] : [],
    ),
  );
  const coffeeGroupIds = new Set(
    coffeeGroups.flatMap((group) =>
      group && typeof group.id === "string" && group.id.trim()
        ? [group.id.trim()]
        : [],
    ),
  );
  const findCoffeeGroupOwner = db.prepare(
    "SELECT user_id FROM coffee_groups WHERE id = ?",
  );
  for (const conversation of conversations) {
    const groupId = conversation?.coffee?.groupId?.trim();
    if (!groupId || coffeeGroupIds.has(groupId)) continue;
    const owner = findCoffeeGroupOwner.get(groupId) as
      | { user_id: string }
      | undefined;
    if (owner && owner.user_id !== userId) {
      throw new Error(
        "Account backup Coffee Group reference belongs to another user.",
      );
    }
  }
  assertIds(
    "conversations",
    conversations.flatMap((conversation) =>
      conversation && typeof conversation.id === "string"
        ? [conversation.id]
        : [],
    ),
  );
  assertIds(
    "messages",
    conversations.flatMap((conversation) =>
      Array.isArray(conversation?.messages)
        ? conversation.messages.flatMap((message) =>
            message && typeof message.id === "string" ? [message.id] : [],
    )
        : [],
    ),
  );
  assertIds(
    "memories",
    Array.isArray(snapshot.memories)
      ? snapshot.memories.flatMap((memory) =>
          memory && typeof memory.id === "string" ? [memory.id] : [],
        )
      : [],
  );
  assertIds(
    "memory_acquisition_receipts",
    Array.isArray(snapshot.memoryReceipts)
      ? snapshot.memoryReceipts.flatMap((receipt) =>
          receipt && typeof receipt.id === "string" ? [receipt.id] : [],
        )
      : [],
  );
  const botcast = snapshot.botcast;
  if (botcast) {
    assertIds(
      "botcast_shows",
      botcast.shows.map((item) => item.id),
    );
    assertIds(
      "botcast_episodes",
      botcast.episodes.map((item) => item.id),
    );
    assertIds(
      "botcast_episode_segments",
      botcast.segments.map((item) => item.id),
    );
    assertIds(
      "botcast_messages",
      botcast.messages.map((item) => item.id),
    );
    assertIds(
      "botcast_events",
      botcast.events.map((item) => item.id),
    );
  }
  if (snapshot.replays) {
    assertIds(
      "replay_recordings",
      snapshot.replays.recordings.map((item) => item.id),
    );
    assertIds(
      "replay_voice_takes",
      snapshot.replays.voiceTakes.map((item) => item.id),
    );
  }
  if (snapshot.debates) {
    assertIds(
      "debate_sessions",
      snapshot.debates.sessions.map((item) => item.id),
    );
    assertIds(
      "debate_events",
      snapshot.debates.events.map((item) => item.id),
    );
    assertIds(
      "debate_recess_checkpoints",
      (snapshot.debates.recessCheckpoints ?? []).map(
        (item) => item.sessionId,
      ),
      "session_id",
    );
    assertIds(
      "debate_mystery_cases",
      (snapshot.debates.mysteryCases ?? []).map((item) => item.sessionId),
      "session_id",
    );
    assertIds(
      "debate_mystery_actions",
      (snapshot.debates.mysteryActions ?? []).map((item) => item.id),
    );
    assertIds(
      "debate_mystery_notebooks",
      (snapshot.debates.mysteryNotebooks ?? []).map((item) => item.sessionId),
      "session_id",
    );
    assertIds(
      "debate_mystery_notebook_revisions",
      (snapshot.debates.mysteryNotebookRevisions ?? []).map((item) => item.id),
    );
  }
  if (snapshot.presenceBeats) {
    assertIds(
      "bot_presence_beats",
      snapshot.presenceBeats.map((item) => item.id),
    );
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

    const ownerStatements = new Map<
      SlateBackupTable,
      ReturnType<DatabaseSync["prepare"]>
    >();
    for (const rule of SLATE_REFERENCE_RULES) {
      const targetIds = idsByCollection.get(rule.target) ?? new Set<string>();
      let findOwner = ownerStatements.get(rule.targetTable);
      if (!findOwner) {
        findOwner = db.prepare(
          `SELECT user_id FROM ${rule.targetTable} WHERE id = ?`,
        );
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
          throw new Error(
            `Account backup Slate reference ${rule.source}.${rule.field} is invalid.`,
          );
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
      normalized,
    );
  });
  if (unsupportedSnapshotField) {
    throw new Error(
      `Account backup contains unsupported raster data field: ${unsupportedSnapshotField}.`,
    );
  }
  validateBackupBotAvatarDetails(snapshot.bots);
  const hasCoffeeDrinkSurface = snapshot.conversations.some(
    (conversation) =>
      Boolean(conversation.coffee?.settings.barRitual?.specialImageId?.trim()),
  );
  if (hasCoffeeDrinkSurface && !projectOwnedAssets) {
    throw new Error(
      "Account backup is missing the project-asset archive for a Coffee drink surface.",
    );
  }
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
    importUserSnapshotWithinTransaction(
      db,
      userId,
      snapshot,
      userKey,
      preparedAssets,
    );
    if (preparedAssets) {
      applyPreparedProjectOwnedAssetsWithinTransaction(
        db,
        userId,
        preparedAssets,
      );
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
  userKey: Buffer,
  preparedAssets: PreparedProjectOwnedAssetImport | null,
): void {
  if (snapshot.settings) {
    const settings = snapshot.settings;
    const memoryEcology = settings.memoryEcology
      ? resolveMemoryEcologySettingsPatch(
          settings.memoryEcology as unknown as Record<string, unknown>,
          DEFAULT_MEMORY_ECOLOGY_SETTINGS,
        )
      : {
          ...DEFAULT_MEMORY_ECOLOGY_SETTINGS,
          learnAboutPlayer: settings.autoMemory,
          learnAboutBots: settings.autoMemory,
        };
    const openAiApiKey =
      typeof settings.openAiApiKey === "string" &&
      settings.openAiApiKey.length > 0
        ? settings.openAiApiKey
        : null;
    const anthropicApiKey =
      typeof settings.anthropicApiKey === "string" &&
      settings.anthropicApiKey.length > 0
        ? settings.anthropicApiKey
        : null;
    const elevenLabsApiKey =
      typeof settings.elevenLabsApiKey === "string" &&
      settings.elevenLabsApiKey.length > 0
        ? settings.elevenLabsApiKey
        : null;
    const encryptedOpenAiKey = openAiApiKey
      ? encryptText(openAiApiKey, userKey)
      : null;
    const encryptedAnthropicKey = anthropicApiKey
      ? encryptText(anthropicApiKey, userKey)
      : null;
    const encryptedElevenLabsKey = elevenLabsApiKey
      ? encryptText(elevenLabsApiKey, userKey)
      : null;
    const zenMessageFontMinPx = normalizeZenMessageFontMinPx(
      settings.zenMessageFontMinPx,
    );
    const zenMessageFontMaxPx = normalizeZenMessageFontMaxPx(
      settings.zenMessageFontMaxPx,
      undefined,
      zenMessageFontMinPx,
    );
    const storedAutoFallbackChain = settings.autoFallbackChain
      ? serializeAutoFallbackChain(settings.autoFallbackChain)
      : null;
    const currentLivingShellRow = db
      .prepare(
        "SELECT capability_revelations FROM living_shell_account_state WHERE user_id = ?",
      )
      .get(userId) as { capability_revelations?: string } | undefined;
    const currentCapabilityRevelations = normalizePrismCapabilityRevelations(
      currentLivingShellRow?.capability_revelations,
    );
    const importedCapabilityRevelations = normalizePrismCapabilityRevelations(
      settings.capabilityRevelations,
      { completedFallback: settings.capabilityRevelations === undefined },
    );
    const mergedCapabilityRevelations = Object.fromEntries(
      PRISM_CAPABILITY_IDS.map((capability) => [
        capability,
        currentCapabilityRevelations[capability].revealed
          ? currentCapabilityRevelations[capability]
          : importedCapabilityRevelations[capability],
      ]),
    ) as PrismCapabilityRevelations;
    db.prepare(
      `UPDATE living_shell_account_state
          SET capability_revelations = ?, updated_at = ?
        WHERE user_id = ?`,
    ).run(
      JSON.stringify(
        mergedCapabilityRevelations,
      ),
      new Date().toISOString(),
      userId,
    );
    db.prepare(
      `
      UPDATE users
      SET
        theme = ?,
        graphics_quality = ?,
        crt_focus = ?,
        typography_scale = ?,
        atmosphere_style = ?,
        hub_atmosphere_enabled = ?,
        hub_atmosphere_image_id = NULL,
        hub_atmosphere_image_style = NULL,
        startup_preference = ?,
        preferred_provider = ?,
        ephemeral_chat_provider_preferences = ?,
        preferred_image_provider = ?,
        provider_locked = ?,
        auto_memory = ?,
        memory_learn_about_player = ?,
        memory_learn_about_bots = ?,
        memory_acquisition_sensitivity = ?,
        memory_short_term_days = ?,
        memory_long_term_threshold = ?,
        memory_inferred_min_evidence = ?,
        memory_inferred_threshold = ?,
        composer_writing_assist = ?,
        experimental_dual_ollama_enabled = ?,
        experimental_all_model_effort_enabled = ?,
        coffee_experimental_table_angle_enabled = ?,
        psychic_mode_enabled = ?,
        auto_switch_model = ?,
        auto_fallback_chain = ?,
        online_auto_provider_bias = ?,
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
        prism_default_bot_face_mouth_speech_poses = ?,
        prism_default_llm_model = ?,
        prism_image_tool_llm_model = ?,
        prism_refract_local_model = ?,
        prism_refract_online_model = ?,
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
        operating_system_voices_enabled = ?,
        english_voice_engine = ?,
        default_system_voice_name = ?,
        default_elevenlabs_voice_id = ?,
        elevenlabs_voice_bank = ?,
        elevenlabs_voice_model = ?,
        elevenlabs_voice_collection_id = ?,
        zen_player_voice_enabled = ?,
        player_audio_voice_profile = ?,
        prism_default_bot_audio_voice_profile = ?
      WHERE id = ?
    `,
    ).run(
      settings.theme === "light" || settings.theme === "dark"
        ? settings.theme
        : "system",
      normalizeGraphicsQuality(settings.graphicsQuality),
      normalizeCrtFocus(settings.crtFocus),
      normalizePrismTypographyScale(settings.typographyScale),
      normalizeHubAtmosphereStyle(settings.atmosphereStyle),
      settings.hubAtmosphereEnabled === false ? 0 : 1,
      normalizePrismStartupPreference(settings.startupPreference),
      settings.preferredProvider === "openai" ||
        settings.preferredProvider === "anthropic"
        ? settings.preferredProvider
        : "local",
      JSON.stringify(
        normalizeEphemeralChatProviderPreferences(
          settings.ephemeralChatProviderPreferences,
        ),
      ),
      resolveImageProviderName({
        savedProvider:
          settings.preferredImageProvider ??
          (settings.preferredProvider === "local" ? "local" : "openai"),
      }),
      settings.providerLocked ? 1 : 0,
      memoryEcology.learnAboutPlayer || memoryEcology.learnAboutBots ? 1 : 0,
      memoryEcology.learnAboutPlayer ? 1 : 0,
      memoryEcology.learnAboutBots ? 1 : 0,
      memoryEcology.acquisitionSensitivity,
      memoryEcology.shortTermRetentionDays,
      memoryEcology.longTermPromotionThreshold,
      memoryEcology.inferredMinEvidenceCount,
      memoryEcology.inferredConfidenceThreshold,
      settings.composerWritingAssist ? 1 : 0,
      settings.experimentalDualOllamaEnabled ? 1 : 0,
      settings.experimentalAllModelEffortEnabled === true ? 1 : 0,
      settings.coffeeExperimentalTableAngleEnabled === true ? 1 : 0,
      settings.psychicModeEnabled === true ? 1 : 0,
      settings.autoModeEnabled === true && storedAutoFallbackChain ? 1 : 0,
      storedAutoFallbackChain,
      clampOnlineAutoProviderBias(settings.onlineAutoProviderBias),
      settings.fallbackModelMessageStripe === false ? 0 : 1,
      JSON.stringify(
        Array.isArray(settings.hiddenBotModelIds)
          ? settings.hiddenBotModelIds.filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            )
          : [],
      ),
      JSON.stringify(
        Array.isArray(settings.hiddenComfyUiWorkflowIds)
          ? settings.hiddenComfyUiWorkflowIds.filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            )
          : [],
      ),
      settings.preferredLocalModel?.trim() ?? "",
      settings.preferredOnlineModel?.trim() ?? "",
      settings.lenientLocalFallbackModel?.trim() ?? "",
      settings.lenientLocalImageFallbackModel?.trim() ?? "",
      settings.secondaryOllamaHost?.trim() ?? "",
      settings.comfyUiHost?.trim() ?? "",
      JSON.stringify(
        Array.isArray(settings.comfyUiWorkflows)
          ? settings.comfyUiWorkflows
          : [],
      ),
      settings.preferredLocalImageModel?.trim() ?? "",
      settings.preferredOpenAiImageModel?.trim() ?? "",
      settings.preferredZenWallpaperLocalImageModel?.trim() ?? "",
      settings.preferredZenWallpaperOpenAiImageModel?.trim() ?? "",
      normalizeZenWallpaperOpacity(settings.zenWallpaperOpacity),
      normalizeZenWallpaperTextMaskEnabled(settings.zenWallpaperTextMaskEnabled)
        ? 1
        : 0,
      normalizeZenWallpaperGrayscaleEnabled(
        settings.zenWallpaperGrayscaleEnabled,
      )
        ? 1
        : 0,
      normalizeZenWallpaperBlurredEdgesEnabled(
        settings.zenWallpaperBlurredEdgesEnabled,
      )
        ? 1
        : 0,
      normalizeZenWallpaperStyleNotes(settings.zenWallpaperStyleNotes),
      zenMessageFontMinPx,
      zenMessageFontMaxPx,
      normalizeZenAskQuestionPatienceEnabled(
        settings.zenAskQuestionPatienceEnabled,
      )
        ? 1
        : 0,
      normalizeZenAskQuestionPatienceMs(settings.zenAskQuestionPatienceMs),
      normalizeZenAutonomyEnabled(settings.zenAutonomyEnabled) ? 1 : 0,
      serializeBotFaceThinkingFrames(
        settings.prismDefaultBotFaceThinkingFrames,
      ),
      serializeBotFaceCustomSpeechPosesForStorage(
        settings.prismDefaultBotFaceMouthSpeechPoses,
      ),
      settings.prismDefaultLlmModel?.trim() ?? "",
      settings.prismImageToolLlmModel?.trim() ?? "",
      settings.prismRefractLocalModel?.trim() ?? "",
      settings.prismRefractOnlineModel?.trim() ?? "",
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
      settings.operatingSystemVoicesEnabled === true ? 1 : 0,
      normalizeEnglishVoiceEngine(settings.englishVoiceEngine),
      typeof settings.defaultSystemVoiceName === "string"
        ? settings.defaultSystemVoiceName.trim().slice(0, 200) || null
        : null,
      typeof settings.defaultElevenLabsVoiceId === "string"
        ? settings.defaultElevenLabsVoiceId.trim().slice(0, 200) || null
        : null,
      JSON.stringify(
        normalizeElevenLabsVoiceBank(settings.elevenLabsVoiceBank),
      ),
      typeof settings.elevenLabsVoiceModel === "string"
        ? settings.elevenLabsVoiceModel.trim().slice(0, 160) || null
        : null,
      normalizeElevenLabsVoiceCollectionId(
        settings.elevenLabsVoiceCollectionId,
      ),
      settings.zenPlayerVoiceEnabled === true ? 1 : 0,
      serializeBotAudioVoiceProfileV1(settings.playerAudioVoiceProfile),
      serializeBotAudioVoiceProfileV1(
        settings.prismDefaultBotAudioVoiceProfile,
      ),
      userId,
    );
  }

  if (Array.isArray(snapshot.modelEffortPreferences)) {
    db.prepare(
      "DELETE FROM model_reasoning_effort_preferences WHERE user_id = ?",
    ).run(userId);
    for (const rawPreference of snapshot.modelEffortPreferences) {
      const provider = normalizeModelEffortProvider(rawPreference?.provider);
      const modelId = normalizeModelEffortModelId(rawPreference?.modelId);
      const effort = normalizeModelReasoningEffortPreference(
        rawPreference?.effort,
      );
      if (!provider || !modelId || !effort) continue;
      setModelReasoningEffortPreference(db, {
        userId,
        provider,
        modelId,
        effort,
        updatedAt:
          typeof rawPreference.updatedAt === "string"
            ? rawPreference.updatedAt
            : undefined,
      });
    }
  }

  if (Array.isArray(snapshot.modelTurboPreferences)) {
    db.prepare("DELETE FROM model_turbo_preferences WHERE user_id = ?").run(
      userId,
    );
    for (const rawPreference of snapshot.modelTurboPreferences) {
      const provider = normalizeModelEffortProvider(rawPreference?.provider);
      const modelId = normalizeModelEffortModelId(rawPreference?.modelId);
      if (!provider || !modelId || rawPreference?.turbo !== true) continue;
      try {
        setModelTurboPreference(db, {
          userId,
          provider,
          modelId,
          turbo: true,
          updatedAt:
            typeof rawPreference.updatedAt === "string"
              ? rawPreference.updatedAt
              : undefined,
        });
      } catch {
        // Ignore stale preferences for models that no longer support Turbo.
      }
    }
  }

  if (Array.isArray(snapshot.bots)) {
    const backupBotIds = new Set(
      snapshot.bots.flatMap((bot) =>
        bot && typeof bot.id === "string" && bot.id.trim()
          ? [bot.id.trim()]
          : [],
      ),
    );
    const insertBot = db.prepare(`
      INSERT OR REPLACE INTO bots (
        id,
        user_id,
        name,
        name_pronunciation,
        self_referral,
        system_prompt,
        clone_family_id,
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
        accent_color,
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
        face_eye_count,
        face_mouth_scale,
        face_mouth_offset_x,
        face_mouth_offset_y,
        face_mouth_rotation_deg,
        face_blink_bar,
        face_blink_count,
        face_blink_scale,
        face_blink_offset_x,
        face_blink_offset_y,
        face_blink_rotation_deg,
        face_thinking_frames,
        face_thinking_scale,
        face_thinking_offset_x,
        face_thinking_offset_y,
        authored_audio_voice_profile,
        audio_voice_profile_override,
        chat_enabled,
        visibility,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const bot of snapshot.bots) {
      if (!bot || typeof bot.id !== "string" || bot.id.trim().length === 0)
        continue;
      const now = new Date().toISOString();
      const legacySpeechPoses =
        String(bot.faceMouthAnimation) === "custom"
          ? normalizeBotFaceCustomSpeechPoses(bot.faceMouthCharacter)
          : null;
      insertBot.run(
        bot.id.trim(),
        userId,
        typeof bot.name === "string" && bot.name.trim().length > 0
          ? bot.name.trim()
          : "Imported Bot",
        normalizeBotNamePronunciation(bot.namePronunciation),
        normalizeBotSelfReferral(bot.selfReferral),
        typeof bot.systemPrompt === "string" ? bot.systemPrompt : "",
        typeof bot.cloneFamilyId === "string" &&
          backupBotIds.has(bot.cloneFamilyId.trim())
          ? bot.cloneFamilyId.trim()
          : null,
        normalizeVoicePreviewLine(bot.voicePreviewLine) || null,
        typeof bot.exportHash === "string" && bot.exportHash.trim().length > 0
          ? bot.exportHash.trim().toLowerCase()
          : null,
        typeof bot.model === "string" && bot.model.trim().length > 0
          ? bot.model.trim()
          : null,
        typeof bot.localModel === "string" && bot.localModel.trim().length > 0
          ? bot.localModel.trim()
          : null,
        typeof bot.onlineModel === "string" && bot.onlineModel.trim().length > 0
          ? bot.onlineModel.trim()
          : null,
        typeof bot.localImageModel === "string" &&
          bot.localImageModel.trim().length > 0
          ? bot.localImageModel.trim()
          : null,
        typeof bot.openaiImageModel === "string" &&
          bot.openaiImageModel.trim().length > 0
          ? bot.openaiImageModel.trim()
          : null,
        bot.onlineEnabled === false ? 0 : 1,
        bot.deleteProtected === true ? 1 : 0,
	        bot.flirtEnabled === true ? 1 : 0,
	        typeof bot.temperature === "number" ? bot.temperature : 0.7,
        typeof bot.maxTokens === "number"
          ? Math.max(1, Math.floor(bot.maxTokens))
          : 2048,
	        typeof bot.topP === "number" ? Math.min(1, Math.max(0, bot.topP)) : 1,
	        typeof bot.topK === "number" ? Math.max(0, Math.floor(bot.topK)) : 40,
	        typeof bot.repetitionPenalty === "number"
	          ? Math.min(2, Math.max(0.5, bot.repetitionPenalty))
	          : 1.1,
        typeof bot.color === "string" && bot.color.trim().length > 0
          ? bot.color.trim()
          : null,
        normalizeBotIdentityColor(bot.accentColor),
        typeof bot.glyph === "string" && bot.glyph.trim().length > 0
          ? bot.glyph.trim()
          : null,
        bot.avatarDetails === undefined || bot.avatarDetails === null
          ? null
          : serializeBotAvatarDetailsV1(bot.avatarDetails),
        normalizeBotFaceFontId(bot.faceEyesFont),
        normalizeBotFaceEyeCharacter(bot.faceEyeCharacter),
        normalizeBotFaceEyeMovement(bot.faceEyeAnimation) ??
          DEFAULT_BOT_FACE_EYE_MOVEMENT,
        normalizeBotFaceFontId(bot.faceMouthFont),
        legacySpeechPoses?.[0] ??
          normalizeBotFaceMouthCharacter(bot.faceMouthCharacter),
        normalizeBotFaceGlyphAnimation(bot.faceMouthAnimation),
        normalizeBotFaceFontWeight(bot.faceFontWeight),
        normalizeBotFaceEyeScale(bot.faceEyeScale),
        normalizeBotFaceEyeOffsetX(bot.faceEyeOffsetX),
        normalizeBotFaceEyeOffsetY(bot.faceEyeOffsetY),
        normalizeBotFaceEyeRotationDeg(bot.faceEyeRotationDeg),
        normalizeBotFaceEyeCount(bot.faceEyeCount) ??
          DEFAULT_BOT_FACE_EYE_COUNT,
        normalizeBotFaceMouthScale(bot.faceMouthScale),
        normalizeBotFaceMouthOffsetX(bot.faceMouthOffsetX),
        normalizeBotFaceMouthOffsetY(bot.faceMouthOffsetY),
        normalizeBotFaceMouthRotationDeg(bot.faceMouthRotationDeg),
        normalizeBotFaceBlinkBar(bot.faceBlinkBar) ??
          DEFAULT_BOT_FACE_BLINK_BAR,
        normalizeBotFaceEyeCount(bot.faceBlinkCount) ??
          (normalizeBotFaceEyeCharacter(bot.faceEyeCharacter) !== null
            ? normalizeBotFaceEyeCount(bot.faceEyeCount)
            : null) ??
          DEFAULT_BOT_FACE_EYE_COUNT,
        normalizeBotFaceBlinkScale(bot.faceBlinkScale) ??
          DEFAULT_BOT_FACE_BLINK_SCALE,
        normalizeBotFaceBlinkOffsetX(bot.faceBlinkOffsetX) ??
          DEFAULT_BOT_FACE_BLINK_OFFSET_X,
        normalizeBotFaceBlinkOffsetY(bot.faceBlinkOffsetY) ??
          DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
        normalizeBotFaceBlinkRotationDeg(bot.faceBlinkRotationDeg) ??
          DEFAULT_BOT_FACE_BLINK_ROTATION_DEG,
        serializeBotFaceThinkingFrames(bot.faceThinkingFrames),
        normalizeBotFaceThinkingScale(bot.faceThinkingScale),
        normalizeBotFaceThinkingOffsetX(bot.faceThinkingOffsetX),
        normalizeBotFaceThinkingOffsetY(bot.faceThinkingOffsetY),
        serializeBotAudioVoiceProfileV1(bot.authoredAudioVoiceProfile),
        bot.audioVoiceProfileOverride === null ||
          bot.audioVoiceProfileOverride === undefined
          ? null
          : serializeBotAudioVoiceProfileV1(bot.audioVoiceProfileOverride),
        bot.chatEnabled === false ? 0 : 1,
        bot.visibility === "public" ? "public" : "private",
        typeof bot.createdAt === "string" && bot.createdAt.trim().length > 0
          ? bot.createdAt
          : now,
        typeof bot.updatedAt === "string" && bot.updatedAt.trim().length > 0
          ? bot.updatedAt
          : now,
      );
      db.prepare(
        "UPDATE bots SET powers_json = ? WHERE id = ? AND user_id = ?",
      ).run(serializeBotPowersV1(bot.powers ?? []), bot.id.trim(), userId);
      db.prepare(
        "UPDATE bots SET face_mouth_coffee_pucker = ? WHERE id = ? AND user_id = ?",
      ).run(
        bot.faceMouthCoffeePucker === false
          ? 0
          : DEFAULT_BOT_FACE_MOUTH_COFFEE_PUCKER
            ? 1
            : 0,
        bot.id.trim(),
        userId,
      );
      db.prepare(
        "UPDATE bots SET face_mouth_speech_poses = ? WHERE id = ? AND user_id = ?",
      ).run(
        serializeBotFaceCustomSpeechPosesForStorage(bot.faceMouthSpeechPoses) ??
          serializeBotFaceCustomSpeechPosesForStorage(legacySpeechPoses),
        bot.id.trim(),
        userId,
      );
      db.prepare(
        "UPDATE bots SET face_eye_spacing = ? WHERE id = ? AND user_id = ?",
      ).run(
        normalizeBotFaceEyeSpacing(bot.faceEyeSpacing) ??
          DEFAULT_BOT_FACE_EYE_SPACING,
        bot.id.trim(),
        userId,
      );
      if (
        bot.globalMood &&
        GLOBAL_BOT_MOOD_KEYS.includes(bot.globalMood) &&
        bot.globalMood !== "neutral"
      ) {
        setGlobalBotMood(
          db,
          userId,
          bot.id.trim(),
          bot.globalMood,
          "backup_restore",
          typeof bot.updatedAt === "string" && bot.updatedAt.trim()
            ? bot.updatedAt
            : now,
        );
      }
    }
  }

  if (Array.isArray(snapshot.libraryGroups)) {
    replaceLibraryGroups({
      db,
      userId,
      groups: snapshot.libraryGroups,
      manageTransaction: false,
    });
  }

  const restorableCoffeeGroupImageIds = new Map(
    (preparedAssets?.coffeeGroupImageReferences ?? []).map((reference) => [
      reference.groupId,
      reference.sourceImageId,
    ] as const),
  );
  if (Array.isArray(snapshot.coffeeGroups)) {
    const ownedBotIds = new Set(
      (db
        .prepare("SELECT id FROM bots WHERE user_id = ?")
        .all(userId) as Array<{ id: string }>).map((row) => row.id),
    );
    const insertCoffeeGroup = db.prepare(
      `INSERT OR REPLACE INTO coffee_groups
         (id, user_id, name, ethos, atmosphere_json, synthesis_json,
          coffee_settings, preset_mode, coffee_topic_mode, model_choice,
          starter_topics, mood_summary, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertCoffeeGroupSeat = db.prepare(
      `INSERT INTO coffee_group_seats
         (user_id, group_id, seat_index, bot_id, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const group of snapshot.coffeeGroups) {
      const groupId =
        typeof group?.id === "string" ? group.id.trim() : "";
      if (!groupId) continue;
      const now = new Date().toISOString();
      const createdAt =
        typeof group.createdAt === "string" && group.createdAt.trim()
          ? group.createdAt.trim()
          : now;
      const updatedAt =
        typeof group.updatedAt === "string" && group.updatedAt.trim()
          ? group.updatedAt.trim()
          : createdAt;
      const atmosphere = backupCoffeeGroupAtmosphere(
        group.atmosphere,
        updatedAt,
      );
      const portableAtmosphere =
        atmosphere &&
        restorableCoffeeGroupImageIds.get(groupId) === atmosphere.imageId
          ? atmosphere
          : null;
      const synthesis = coffeeGroupSynthesisForRestore({
        value: group.synthesis,
        atmosphereWasReferenced: atmosphere !== null,
        atmosphereIsPortable: portableAtmosphere !== null,
        updatedAt,
      });
      const name =
        typeof group.name === "string"
          ? group.name.replace(/\s+/gu, " ").trim().slice(0, 80)
          : "";
      const ethos =
        typeof group.ethos === "string"
          ? group.ethos
              .replace(/\s+/gu, " ")
              .trim()
              .slice(0, BACKUP_COFFEE_GROUP_ETHOS_MAX_LENGTH)
          : "";
      const seats = normalizedBackupCoffeeGroupSeats(
        group.seatBotIds,
        ownedBotIds,
      );
      insertCoffeeGroup.run(
        groupId,
        userId,
        name || "Imported Coffee Group",
        ethos,
        JSON.stringify(portableAtmosphere ?? {}),
        JSON.stringify(synthesis),
        JSON.stringify(normalizeCoffeeSessionSettings(group.coffeeSettings)),
        group.presetMode === "auto" ? "auto" : "manual",
        group.topicSelectionMode === "auto" ? "auto" : "manual",
        JSON.stringify(backupJsonObject(group.modelChoice)),
        JSON.stringify(backupJsonObject(group.starterTopics)),
        JSON.stringify(backupJsonObject(group.moodSummary)),
        typeof group.archivedAt === "string" && group.archivedAt.trim()
          ? group.archivedAt.trim()
          : null,
        createdAt,
        updatedAt,
      );
      db.prepare(
        "DELETE FROM coffee_group_seats WHERE user_id = ? AND group_id = ?",
      ).run(userId, groupId);
      for (let seatIndex = 0; seatIndex < seats.length; seatIndex += 1) {
        insertCoffeeGroupSeat.run(
          userId,
          groupId,
          seatIndex,
          seats[seatIndex],
          updatedAt,
        );
      }
      if (
        group.soundtrack?.provider === "elevenlabs" &&
        typeof group.soundtrack.audioBase64 === "string" &&
        /^audio\/(?:mpeg|mp3)$/iu.test(group.soundtrack.contentType)
      ) {
        const soundtrackBytes = Buffer.from(group.soundtrack.audioBase64, "base64");
        if (soundtrackBytes.length > 0 && soundtrackBytes.length <= 12 * 1024 * 1024) {
          db.prepare(
            `INSERT OR REPLACE INTO coffee_group_soundtracks
               (group_id, user_id, generation_status, generation_token,
                provider, model, prompt, content_type, audio_bytes, duration_ms,
                revision, error, created_at, updated_at)
             VALUES (?, ?, 'ready', NULL, 'elevenlabs', ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          ).run(
            groupId,
            userId,
            group.soundtrack.model,
            group.soundtrack.prompt,
            group.soundtrack.contentType,
            soundtrackBytes,
            Math.max(3_000, Math.round(group.soundtrack.durationMs)),
            Math.max(1, Math.round(group.soundtrack.revision)),
            group.soundtrack.createdAt || createdAt,
            group.soundtrack.updatedAt || updatedAt,
          );
        }
      }
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
           fallback_studio_accent_variant,
           host_chat_ignoring_until_guest_show,
           atmosphere_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        show.id,
        userId,
        show.hostBotId,
        show.name,
        show.premise,
        show.hostingStyle,
        show.accentColor,
        isBotcastFallbackStudioAccentVariant(show.fallbackStudioAccentVariant)
          ? show.fallbackStudioAccentVariant
          : botcastFallbackStudioAccentVariantForSeed(show.id),
        show.hostChatIgnoringUntilGuestShow === true ? 1 : 0,
        show.atmosphereJson,
        show.createdAt,
        show.updatedAt,
      );
      if (
        show.introAudio?.provider === "elevenlabs" &&
        typeof show.introAudio.audioBase64 === "string"
      ) {
        const audioBytes = Buffer.from(show.introAudio.audioBase64, "base64");
        const outdentBytes =
          typeof show.introAudio.outdent?.audioBase64 === "string"
            ? Buffer.from(show.introAudio.outdent.audioBase64, "base64")
            : null;
        const validOutdent = Boolean(
          outdentBytes &&
            outdentBytes.length > 0 &&
            outdentBytes.length <= 4 * 1024 * 1024 &&
            /^audio\/(?:mpeg|mp3)$/iu.test(
              show.introAudio.outdent?.contentType ?? "",
            ),
        );
        if (
          audioBytes.length > 0 &&
          audioBytes.length <= 4 * 1024 * 1024 &&
          /^audio\/(?:mpeg|mp3)$/iu.test(show.introAudio.contentType)
        ) {
          db.prepare(
            `INSERT OR REPLACE INTO botcast_show_intro_audio
              (show_id, user_id, provider, model, prompt, content_type,
               audio_bytes, duration_ms, outdent_prompt,
               outdent_content_type, outdent_audio_bytes,
               outdent_duration_ms, revision, created_at, updated_at)
             VALUES (?, ?, 'elevenlabs', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            show.id,
            userId,
            show.introAudio.model,
            show.introAudio.prompt,
            show.introAudio.contentType,
            audioBytes,
            Math.max(3_000, Math.round(show.introAudio.durationMs)),
            validOutdent ? show.introAudio.outdent!.prompt : null,
            validOutdent ? show.introAudio.outdent!.contentType : null,
            validOutdent ? outdentBytes : null,
            validOutdent
              ? Math.max(
                  3_000,
                  Math.round(show.introAudio.outdent!.durationMs),
                )
              : null,
            Math.max(1, Math.round(show.introAudio.revision)),
            show.introAudio.createdAt || show.createdAt,
            show.introAudio.updatedAt || show.updatedAt,
          );
        }
      }
      if (
        show.atmosphereAudio?.provider === "elevenlabs" &&
        typeof show.atmosphereAudio.audioBase64 === "string"
      ) {
        const audioBytes = Buffer.from(
          show.atmosphereAudio.audioBase64,
          "base64",
        );
        if (
          audioBytes.length > 0 &&
          audioBytes.length <= 4 * 1024 * 1024 &&
          /^audio\/(?:mpeg|mp3)$/iu.test(show.atmosphereAudio.contentType)
        ) {
          db.prepare(
            `INSERT OR REPLACE INTO botcast_show_atmosphere_audio
              (show_id, user_id, provider, model, prompt, content_type,
               audio_bytes, duration_ms, revision, created_at, updated_at)
             VALUES (?, ?, 'elevenlabs', ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            show.id,
            userId,
            show.atmosphereAudio.model,
            show.atmosphereAudio.prompt,
            show.atmosphereAudio.contentType,
            audioBytes,
            Math.max(3_000, Math.round(show.atmosphereAudio.durationMs)),
            Math.max(1, Math.round(show.atmosphereAudio.revision)),
            show.atmosphereAudio.createdAt || show.createdAt,
            show.atmosphereAudio.updatedAt || show.updatedAt,
          );
        }
      }
    }
    for (const episode of botcast.episodes) {
      if (!showIds.has(episode.showId)) continue;
      db.prepare(
        `INSERT OR REPLACE INTO botcast_episodes
          (id, user_id, show_id, host_bot_id, guest_bot_id, guest_kind,
           guest_name, guest_context, title, topic,
           producer_brief, provider, model, response_mode, duration_minutes, status, segment, outcome,
           tension_level, warning_count, started_at, completed_at, runtime_ms,
           model_warmup_hold_duration_ms, model_warmup_hold_started_at,
           persona_reviewer_bot_id, persona_reviewer_name, persona_rating,
           persona_comment, persona_reviewed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        episode.id,
        userId,
        episode.showId,
        episode.hostBotId,
        episode.guestBotId,
        episode.guestKind === "producer" ? "producer" : "bot",
        episode.guestName ?? "",
        episode.guestContext ?? "",
        episode.title,
        episode.topic,
        episode.producerBrief,
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
        episode.status,
        episode.segment,
        episode.outcome,
        episode.tensionLevel,
        episode.warningCount,
        episode.startedAt,
        episode.completedAt,
        episode.runtimeMs,
        Math.max(0, Number(episode.modelWarmupHoldDurationMs ?? 0)),
        typeof episode.modelWarmupHoldStartedAt === "string"
          ? episode.modelWarmupHoldStartedAt
          : null,
        episode.personaReview?.reviewerBotId ?? null,
        episode.personaReview?.reviewerName ?? null,
        typeof episode.personaReview?.rating === "number" &&
          episode.personaReview.rating >= 1 &&
          episode.personaReview.rating <= 5
          ? episode.personaReview.rating
          : null,
        episode.personaReview?.comment ?? null,
        episode.personaReview?.createdAt ?? null,
        episode.createdAt,
        episode.updatedAt,
      );
    }
    for (const segment of botcast.segments) {
      if (!episodeIds.has(segment.episodeId)) continue;
      db.prepare(
        `INSERT OR REPLACE INTO botcast_episode_segments
          (id, user_id, episode_id, segment, ordinal, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        segment.id,
        userId,
        segment.episodeId,
        segment.segment,
        segment.ordinal,
        segment.startedAt,
        segment.endedAt,
      );
    }
    for (const message of botcast.messages) {
      if (!episodeIds.has(message.episodeId)) continue;
      db.prepare(
        `INSERT OR REPLACE INTO botcast_messages
          (id, user_id, episode_id, speaker_role, bot_id, content, stage_action_text, voice_performance_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        message.id,
        userId,
        message.episodeId,
        message.speakerRole,
        message.botId,
        message.content,
        message.stageActionText ?? null,
        message.voicePerformanceText ?? null,
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
        event.id,
        userId,
        event.episodeId,
        event.sequence,
        event.kind,
        event.payloadJson,
        event.occurredAt,
      );
    }
  }

  if (snapshot.slate) {
    importSlateSnapshot(db, userId, snapshot.slate);
  }

  const ownedCoffeeGroupIds = new Set(
    (db
      .prepare("SELECT id FROM coffee_groups WHERE user_id = ?")
      .all(userId) as Array<{ id: string }>).map((row) => row.id),
  );
  const insertConversation = db.prepare(`
    INSERT OR REPLACE INTO conversations
      (id, user_id, title, conversation_mode, bot_group_ids, coffee_settings,
       coffee_group_id, coffee_duration_minutes, coffee_preset_id, coffee_topic,
       coffee_absent_bot_ids, coffee_team_mode_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMessage = db.prepare(`
    INSERT OR REPLACE INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMemory = db.prepare(`
    INSERT OR REPLACE INTO memories
      (id, user_id, conversation_id, bot_id, target_bot_id,
       ciphertext, iv, tag, confidence, base_confidence, category, tier,
       lifecycle, durability, source, certainty, source_message_ids,
       evidence_lineage_known, last_reinforced_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const conversation of snapshot.conversations) {
    const coffee = conversation.coffee;
    insertConversation.run(
      conversation.id,
      userId,
      conversation.title,
      coffee ? "coffee" : "sandbox",
      coffee ? JSON.stringify(coffee.botGroupIds) : null,
      coffee
        ? JSON.stringify(normalizeCoffeeSessionSettings(coffee.settings))
        : null,
      coffee?.groupId && ownedCoffeeGroupIds.has(coffee.groupId)
        ? coffee.groupId
        : null,
      coffee?.durationMinutes ?? null,
      coffee?.presetId ?? null,
      coffee?.topic ?? null,
      JSON.stringify(coffee?.absentBotIds ?? []),
      coffee?.teamsJson ?? null,
      conversation.createdAt,
      conversation.updatedAt,
    );
    if (conversation.coffeePowerPlan?.version === 1) {
      db.prepare(
        "UPDATE conversations SET coffee_power_plan_json = ? WHERE id = ? AND user_id = ?",
      ).run(
        JSON.stringify(conversation.coffeePowerPlan),
        conversation.id,
        userId,
      );
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
        typeof message.toolPayload === "string" &&
        message.toolPayload.trim().length > 0
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
        message.createdAt,
      );
      if (Array.isArray(message.coffeeAudienceBotIds)) {
        db.prepare(
          "UPDATE messages SET coffee_audience_bot_ids = ? WHERE id = ? AND user_id = ?",
        ).run(JSON.stringify(message.coffeeAudienceBotIds), message.id, userId);
      }
    }
  }

  if (snapshot.debates) {
    const sessionIds = new Set<string>();
    const statuses = new Set([
      "live",
      "waiting_for_player",
      "paused",
      "completed",
      "cancelled",
      "failed",
    ]);
    const phases = new Set([
      "opening",
      "challenge",
      "rebuttal",
      "closing",
      "verdict",
    ]);
    const playerRoles = new Set(["judge", "participant", "spectator"]);
    const sides = new Set(["for", "against"]);
    const insertSession = db.prepare(
      `INSERT OR REPLACE INTO debate_sessions
         (id, user_id, revision, status, phase, step_key, player_role,
          player_side_id, create_idempotency_key, motion, winner_side_id,
          session_json, error, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const session of snapshot.debates.sessions) {
      if (
        !session?.id?.trim() ||
        !statuses.has(session.status) ||
        !phases.has(session.phase) ||
        !playerRoles.has(session.playerRole) ||
        !session.stepKey?.trim() ||
        !session.motion?.trim()
      ) {
        throw new Error("Account backup contains an invalid Debate session.");
      }
      if (
        session.playerSideId !== null &&
        !sides.has(session.playerSideId)
      ) {
        throw new Error("Account backup contains an invalid Debate player side.");
      }
      if (
        session.winnerSideId !== null &&
        !sides.has(session.winnerSideId)
      ) {
        throw new Error("Account backup contains an invalid Debate winner.");
      }
      try {
        JSON.parse(session.sessionJson);
      } catch {
        throw new Error("Account backup contains invalid Debate session JSON.");
      }
      insertSession.run(
        session.id,
        userId,
        Math.max(1, Math.floor(session.revision || 1)),
        session.status,
        session.phase,
        session.stepKey,
        session.playerRole,
        session.playerSideId,
        session.createIdempotencyKey?.trim() || `backup:${session.id}`,
        session.motion,
        session.winnerSideId,
        session.sessionJson,
        session.error,
        session.createdAt,
        session.updatedAt,
        session.completedAt,
      );
      sessionIds.add(session.id);
    }
    const insertEvent = db.prepare(
      `INSERT OR REPLACE INTO debate_events
         (id, user_id, session_id, sequence, phase, step_key, kind,
          event_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const event of snapshot.debates.events) {
      if (
        !event?.id?.trim() ||
        !sessionIds.has(event.sessionId) ||
        !phases.has(event.phase) ||
        !event.stepKey?.trim() ||
        !event.kind?.trim()
      ) {
        throw new Error("Account backup contains an invalid Debate event.");
      }
      try {
        JSON.parse(event.eventJson);
      } catch {
        throw new Error("Account backup contains invalid Debate event JSON.");
      }
      insertEvent.run(
        event.id,
        userId,
        event.sessionId,
        Math.max(1, Math.floor(event.sequence || 1)),
        event.phase,
        event.stepKey,
        event.kind,
        event.eventJson,
        event.createdAt,
      );
    }
    const insertRecessCheckpoint = db.prepare(
      `INSERT OR REPLACE INTO debate_recess_checkpoints
         (session_id, user_id, source_revision, snapshot_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const checkpoint of snapshot.debates.recessCheckpoints ?? []) {
      if (
        !checkpoint?.sessionId?.trim() ||
        !sessionIds.has(checkpoint.sessionId) ||
        !Number.isInteger(checkpoint.sourceRevision) ||
        checkpoint.sourceRevision < 1 ||
        !checkpoint.createdAt?.trim()
      ) {
        throw new Error(
          "Account backup contains an invalid Debate recess checkpoint.",
        );
      }
      try {
        JSON.parse(checkpoint.snapshotJson);
      } catch {
        throw new Error(
          "Account backup contains invalid Debate recess checkpoint JSON.",
        );
      }
      insertRecessCheckpoint.run(
        checkpoint.sessionId,
        userId,
        checkpoint.sourceRevision,
        checkpoint.snapshotJson,
        checkpoint.createdAt,
      );
    }
    const insertMysteryCase = db.prepare(
      `INSERT OR REPLACE INTO debate_mystery_cases
         (session_id, user_id, schema_version, generator_version, private_json,
          content_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const mystery of snapshot.debates.mysteryCases ?? []) {
      if (
        !sessionIds.has(mystery.sessionId) ||
        !Number.isInteger(mystery.schemaVersion) ||
        mystery.schemaVersion < 1 ||
        !Number.isInteger(mystery.generatorVersion) ||
        mystery.generatorVersion < 1
      ) {
        throw new Error("Account backup contains an invalid private Mystery case.");
      }
      try { JSON.parse(mystery.privateJson); }
      catch { throw new Error("Account backup contains invalid private Mystery JSON."); }
      if (createHash("sha256").update(mystery.privateJson).digest("hex") !== mystery.contentHash) {
        throw new Error("Account backup contains a corrupted private Mystery case.");
      }
      insertMysteryCase.run(
        mystery.sessionId,
        userId,
        mystery.schemaVersion,
        mystery.generatorVersion,
        mystery.privateJson,
        mystery.contentHash,
        mystery.createdAt,
        mystery.updatedAt,
      );
    }
    const insertMysteryAction = db.prepare(
      `INSERT OR REPLACE INTO debate_mystery_actions
         (id, user_id, session_id, sequence, action_kind,
          public_payload_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const action of snapshot.debates.mysteryActions ?? []) {
      if (!action.id?.trim() || !sessionIds.has(action.sessionId) || !Number.isInteger(action.sequence) || action.sequence < 1 || !action.actionKind?.trim()) {
        throw new Error("Account backup contains an invalid Mystery replay action.");
      }
      try { JSON.parse(action.publicPayloadJson); }
      catch { throw new Error("Account backup contains invalid Mystery replay JSON."); }
      insertMysteryAction.run(action.id, userId, action.sessionId, action.sequence, action.actionKind, action.publicPayloadJson, action.occurredAt);
    }
    const insertMysteryNotebook = db.prepare(
      `INSERT OR REPLACE INTO debate_mystery_notebooks
         (session_id, user_id, revision, document_json,
          pending_proposal_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const notebook of snapshot.debates.mysteryNotebooks ?? []) {
      if (!sessionIds.has(notebook.sessionId) || !Number.isInteger(notebook.revision) || notebook.revision < 1) {
        throw new Error("Account backup contains an invalid Mystery notebook.");
      }
      try {
        JSON.parse(notebook.documentJson);
        if (notebook.pendingProposalJson) JSON.parse(notebook.pendingProposalJson);
      } catch { throw new Error("Account backup contains invalid Mystery notebook JSON."); }
      insertMysteryNotebook.run(notebook.sessionId, userId, notebook.revision, notebook.documentJson, notebook.pendingProposalJson, notebook.createdAt, notebook.updatedAt);
    }
    const notebookReasons = new Set(["edit", "cleanup", "undo", "import"]);
    const insertMysteryNotebookRevision = db.prepare(
      `INSERT OR REPLACE INTO debate_mystery_notebook_revisions
         (id, user_id, session_id, revision, document_json, reason,
          idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const revision of snapshot.debates.mysteryNotebookRevisions ?? []) {
      if (!revision.id?.trim() || !sessionIds.has(revision.sessionId) || !Number.isInteger(revision.revision) || revision.revision < 1 || !notebookReasons.has(revision.reason) || !revision.idempotencyKey?.trim()) {
        throw new Error("Account backup contains an invalid Mystery notebook revision.");
      }
      try { JSON.parse(revision.documentJson); }
      catch { throw new Error("Account backup contains invalid Mystery notebook revision JSON."); }
      insertMysteryNotebookRevision.run(revision.id, userId, revision.sessionId, revision.revision, revision.documentJson, revision.reason, revision.idempotencyKey, revision.createdAt);
    }
  }

  if (snapshot.sessionNotes) {
    const insertSessionNote = db.prepare(
      `INSERT OR REPLACE INTO applet_session_notes
         (user_id, surface, session_id, body, captures_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const note of snapshot.sessionNotes) {
      const surface = readAppletSessionNoteSurface(note?.surface);
      const sessionId = note?.sessionId?.trim() ?? "";
      const body = typeof note?.body === "string" ? note.body.trim() : "";
      if (
        !surface ||
        !sessionId ||
        !body ||
        body.length > APPLET_SESSION_NOTE_MAX_CHARACTERS ||
        !appletSessionBelongsToUser(db, userId, surface, sessionId)
      ) {
        continue;
      }
      insertSessionNote.run(
        userId,
        surface,
        sessionId,
        body,
        JSON.stringify(backupAppletSessionNoteCaptures(note.captures)),
        note.createdAt,
        note.updatedAt,
      );
    }
  }

  if (snapshot.transcriptFrameSamples) {
    const insertFrameSample = db.prepare(
      `INSERT OR IGNORE INTO applet_transcript_frame_samples
         (user_id, surface, session_id, entry_id, fps, captured_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const sample of snapshot.transcriptFrameSamples) {
      const surface = readAppletSessionNoteSurface(sample?.surface);
      const sessionId = sample?.sessionId?.trim() ?? "";
      const entryId = sample?.entryId?.trim() ?? "";
      const fps = Number(sample?.fps);
      if (
        !surface ||
        !sessionId ||
        !entryId ||
        !Number.isInteger(fps) ||
        fps < 1 ||
        fps > 240 ||
        !Number.isFinite(Date.parse(sample?.capturedAt ?? "")) ||
        !appletSessionBelongsToUser(db, userId, surface, sessionId)
      ) {
        continue;
      }
      insertFrameSample.run(
        userId,
        surface,
        sessionId,
        entryId,
        fps,
        new Date(sample.capturedAt).toISOString(),
      );
    }
  }

  if (snapshot.presenceBeats) {
    const surfaces = new Set([
      "chat",
      "zen",
      "sandbox",
      "coffee",
      "signal",
      "debate",
    ]);
    const triggers = new Set(["interruption", "redirect", "waiting"]);
    const sources = new Set(["default", "custom"]);
    const completions = new Set([
      "playing",
      "completed",
      "interrupted",
      "failed",
    ]);
    const insertPresenceBeat = db.prepare(
      `INSERT OR REPLACE INTO bot_presence_beats
         (id, user_id, surface, session_id, response_id, speaker_bot_id,
          speaker_name, trigger, source, text, heard_character_count,
          completion, playback_started_at_ms, playback_ended_at_ms,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const beat of snapshot.presenceBeats) {
      const heardCharacterCount = Math.max(
        0,
        Math.min(
          Array.from(beat.text ?? "").length,
          Math.floor(Number(beat.heardCharacterCount) || 0),
        ),
      );
      if (
        !beat?.id?.trim() ||
        !beat.sessionId?.trim() ||
        !beat.responseId?.trim() ||
        !beat.speakerBotId?.trim() ||
        !beat.speakerName?.trim() ||
        !surfaces.has(beat.surface) ||
        !triggers.has(beat.trigger) ||
        !sources.has(beat.source) ||
        !completions.has(beat.completion) ||
        typeof beat.text !== "string" ||
        !Number.isFinite(beat.playbackStartedAtMs)
      ) {
        throw new Error("Account backup contains an invalid response cue.");
      }
      insertPresenceBeat.run(
        beat.id,
        userId,
        beat.surface,
        beat.sessionId,
        beat.responseId,
        beat.speakerBotId,
        beat.speakerName,
        beat.trigger,
        beat.source,
        beat.text,
        heardCharacterCount,
        beat.completion,
        beat.playbackStartedAtMs,
        Number.isFinite(beat.playbackEndedAtMs)
          ? beat.playbackEndedAtMs
          : null,
        beat.createdAt,
        beat.updatedAt,
      );
    }
  }

  if (snapshot.replays) {
    const recordingIds = new Set<string>();
    for (const recording of snapshot.replays.recordings) {
      const sourceExists = recording.surface === "signal"
        ? db
            .prepare("SELECT id FROM botcast_episodes WHERE id = ? AND user_id = ?")
            .get(recording.sourceId, userId)
        : db
            .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
            .get(recording.sourceId, userId);
      if (!sourceExists || !recording.manifestJson.trim()) continue;
      db.prepare(
        `INSERT OR REPLACE INTO replay_recordings
          (id, user_id, surface, source_id, status, progress,
           manifest_version, manifest_json, manifest_hash, timeline_json,
           transcript_vtt, transcript_markdown, width, height, fps,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?, ?, 1920, 1080, 30, ?, ?)`,
      ).run(
        recording.id,
        userId,
        recording.surface,
        recording.sourceId,
        Math.max(1, Math.round(recording.manifestVersion || 1)),
        recording.manifestJson,
        recording.manifestHash,
        recording.timelineJson,
        recording.transcriptVtt,
        recording.transcriptMarkdown,
        recording.createdAt,
        recording.updatedAt,
      );
      recordingIds.add(recording.id);
    }
    for (const take of snapshot.replays.voiceTakes) {
      if (!recordingIds.has(take.recordingId) || !take.snapshotJson.trim()) continue;
      db.prepare(
        `INSERT OR REPLACE INTO replay_voice_takes
          (id, user_id, recording_id, source_key, source_message_id,
           source_event_id, snapshot_json, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?)`,
      ).run(
        take.id,
        userId,
        take.recordingId,
        take.sourceKey,
        take.sourceMessageId,
        take.sourceEventId,
        take.snapshotJson,
        take.createdAt,
        take.updatedAt,
      );
    }
  }

  if (Array.isArray(snapshot.actionSfxPacks)) {
    db.prepare("DELETE FROM action_sfx_pack_clips WHERE user_id = ?").run(
      userId,
    );
    restoreActionSfxPackClipsFromBackup(db, userId, snapshot.actionSfxPacks);
  }

  if (Array.isArray(snapshot.englishPacingProfiles)) {
    db.prepare("DELETE FROM english_pacing_profiles WHERE user_id = ?").run(
      userId,
    );
    restoreEnglishPacingProfilesFromBackup(
      db,
      userId,
      snapshot.englishPacingProfiles,
    );
  }

  if (Array.isArray(snapshot.premiumVoiceLibrary)) {
    restorePremiumVoiceLibrary(db, userId, snapshot.premiumVoiceLibrary);
  }

  for (const memory of snapshot.memories) {
    const encrypted = encryptJson(memory.payload, userKey);
    const tier = memory.tier ??
      normalizeMemoryTier(
        undefined,
        memory.confidence,
        memory.confidence,
        memory.durability ?? 0.5,
      );
    const lifecycle: MemoryLifecycle =
      memory.lifecycle === "derived" || memory.source === "inferred"
        ? "derived"
        : memory.lifecycle === "long_term" || tier === "long_term"
          ? "long_term"
          : "short_term";
    insertMemory.run(
      memory.id,
      userId,
      memory.conversationId ?? null,
      memory.botId ?? null,
      memory.targetBotId ?? null,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      memory.confidence,
      memory.baseConfidence ?? memory.confidence,
      memory.category ?? "user",
      lifecycle === "derived" ? "short_term" : tier,
      lifecycle,
      memory.durability ?? 0.5,
      lifecycle === "derived" ? "inferred" : (memory.source ?? "direct"),
      memory.certainty ?? null,
      JSON.stringify(
        Array.isArray(memory.sourceMessageIds)
          ? memory.sourceMessageIds.filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            )
          : [],
      ),
      memory.evidenceLineageKnown ? 1 : 0,
      memory.lastReinforcedAt ?? memory.createdAt,
      memory.createdAt,
    );
  }

  const importedMemoryIds = new Set(snapshot.memories.map((memory) => memory.id));
  const insertEvidenceLink = db.prepare(
    `INSERT OR IGNORE INTO memory_evidence_links
      (user_id, inferred_memory_id, evidence_memory_id, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  for (const memory of snapshot.memories) {
    if (!importedMemoryIds.has(memory.id)) continue;
    let restoredEvidence = false;
    for (const evidenceId of memory.evidenceMemoryIds ?? []) {
      if (!importedMemoryIds.has(evidenceId) || evidenceId === memory.id) continue;
      insertEvidenceLink.run(
        userId,
        memory.id,
        evidenceId,
        memory.createdAt,
      );
      restoredEvidence = true;
    }
    if (restoredEvidence) {
      db.prepare(
        "UPDATE memories SET evidence_lineage_known = 1 WHERE id = ? AND user_id = ?",
      ).run(memory.id, userId);
    }
  }

  const insertMemoryReceipt = db.prepare(
    `INSERT OR REPLACE INTO memory_acquisition_receipts
      (id, user_id, memory_id, learner_bot_id, target_bot_id,
       conversation_id, kind, created_at, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const receipt of snapshot.memoryReceipts ?? []) {
    if (!importedMemoryIds.has(receipt.memoryId)) continue;
    insertMemoryReceipt.run(
      receipt.id,
      userId,
      receipt.memoryId,
      receipt.learnerBotId ?? null,
      receipt.targetBotId ?? null,
      receipt.conversationId ?? null,
      receipt.kind === "bot_relation" ? "bot_relation" : "player_memory",
      receipt.createdAt,
      receipt.readAt ?? null,
    );
  }
}

function validateBackupBotAvatarDetails(
  bots: BackupBotSnapshot[] | undefined,
): void {
  if (!Array.isArray(bots)) return;
  for (const bot of bots) {
    if (!bot || typeof bot !== "object") continue;
    const record = bot as unknown as Record<string, unknown>;
    const unsupported = Object.keys(record).find((key) => {
      if (key === "avatarDetails") return false;
      const normalized = key.toLowerCase().replace(/[^a-z]/gu, "");
      if (
        normalized === "localimagemodel" ||
        normalized === "openaiimagemodel"
      ) {
        return false;
      }
      const profileIndex = normalized.indexOf("profile");
      const profileSuffix =
        profileIndex >= 0
          ? normalized.slice(profileIndex + "profile".length)
          : "";
      return (
        normalized.includes("accessory") ||
        normalized.startsWith("avatar") ||
        normalized.includes("portrait") ||
        /(?:png|svg|imageurl|dataurl|imagebase64|imagepayload|raster)/u.test(
          normalized,
        ) ||
        (profileIndex >= 0 &&
          /(?:picture|image|png|svg|url|data|file)/u.test(profileSuffix))
      );
    });
    if (unsupported) {
      throw new Error(
        `Account backup contains unsupported legacy avatar field: ${unsupported}.`,
      );
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
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
}
