import type {
  TellFictionalStoryPayload,
  WebSearchPayload,
} from "./prismTool.js";
import type { PrismMoodIgnoredQuestionPenaltyLevel } from "./mood.js";
import type {
  AutoFallbackAttemptTraceV1,
  AutoRecoveryTraceV1,
} from "./autoFallback.js";
import type { AutoRouteDecisionV1 } from "./modelRouting.js";
import type {
  BotCrosstalkInterruptedSpeakerCue,
  CrosstalkFloorOutcome,
  CrosstalkReclaimPlanV1,
  ListenerReactionSpokenCue,
  SocialSilenceMarkerV1,
} from "./listenerReaction.js";
import type {
  BotPowerMutePerformanceV1,
  BotPowerObserverProjectionV1,
} from "./botPower.js";
import type { BotPowerTrollPresentationV1 } from "./trollPower.js";
import type { BotIdentityShapeshiftStateV1 } from "./botIdentityShapeshift.js";
import type { BotFalseNameStateV1 } from "./botFalseName.js";
import type {
  MaxReasoningEffort,
  ProviderReasoningEffort,
} from "./reasoningEffort.js";

export {
  PRISM_ACTION_UNDO_RETENTION_MS,
  PRISM_CONTEXT_TOKEN_TTL_MS,
  PRISM_ORCHESTRATION_VERSION,
  normalizePrismExecuteProposalRequestV1,
  normalizePrismIntentPlanV1,
  normalizePrismJsonObject,
  normalizePrismUndoRequestV1,
  type PrismActionPreviewV1,
  type PrismActionProposalV1,
  type PrismActionRunStatusV1,
  type PrismActionRunV1,
  type PrismCapabilityDescriptorV1,
  type PrismCapabilityExecutionV1,
  type PrismCapabilityProviderV1,
  type PrismCapabilityRiskV1,
  type PrismCapabilityUndoV1,
  type PrismCompanionCardV1,
  type PrismConfirmationPolicyV1,
  type PrismContextTokenV1,
  type PrismEntityReferenceV1,
  type PrismExecuteProposalRequestV1,
  type PrismIntentKindV1,
  type PrismIntentPlanStepV1,
  type PrismIntentPlanV1,
  type PrismJsonObject,
  type PrismJsonPrimitive,
  type PrismJsonValue,
  type PrismMonitorV1,
  type PrismUndoRequestV1,
} from "./prismOrchestration.js";

export {
  PRISM_REFRACT_DEBATE_EXHIBIT_REJECTED_CANDIDATE_LIMIT,
  PRISM_REFRACT_DIRECTION_MAX_LENGTH,
  PRISM_REFRACT_DEBATE_TEXT_TARGET_KINDS,
  PRISM_REFRACT_INPUT_CONTEXT_MAX_LENGTH,
  PRISM_REFRACT_INPUT_LABEL_MAX_LENGTH,
  PRISM_REFRACT_INPUT_TEXT_TARGET_KIND,
  PRISM_REFRACT_INPUT_VALUE_MAX_LENGTH,
  PRISM_REFRACT_REFERENCE_ID_MAX_LENGTH,
  PRISM_REFRACT_REJECTED_CANDIDATE_LIMIT,
  PRISM_REFRACT_SIGNAL_TEXT_TARGET_KINDS,
  isPrismRefractDebateTextTarget,
  isPrismRefractInputTextTarget,
  normalizePrismRefractDirection,
  normalizePrismRefractRequest,
  type PrismRefractDebateTextTarget,
  type PrismRefractDebateTextTargetKind,
  type PrismRefractInputTextTarget,
  type PrismRefractRequest,
  type PrismRefractResponse,
  type PrismRefractSignalTextTarget,
  type PrismRefractSignalTextTargetKind,
  type PrismRefractTextTarget,
} from "./prismRefract.js";

export {
  PRISM_COMPANION_HANDOFF_DIRECTIONS,
  PRISM_COMPANION_MESSAGE_MAX_LENGTH,
  PRISM_COMPANION_RECOVERY_LIMIT,
  PRISM_COMPANION_REFERENCE_ID_MAX_LENGTH,
  PRISM_COMPANION_SURFACE_IDS,
  PRISM_COMPANION_TOOL_IDS,
  isPrismCompanionSurfaceId,
  normalizePrismCompanionActionIntent,
  normalizePrismCompanionActionIntents,
  normalizePrismCompanionDebateDraft,
  normalizePrismCompanionMessages,
  normalizePrismCompanionRequest,
  normalizePrismCompanionSurfaceReference,
  type PrismCompanionActionIntent,
  type PrismCompanionDebateDraft,
  type PrismCompanionHandoffDirection,
  type PrismCompanionMessage,
  type PrismCompanionRequest,
  type PrismCompanionResponse,
  type PrismCompanionSurfaceId,
  type PrismCompanionSurfaceReference,
  type PrismCompanionToolId,
} from "./prismCompanion.js";

export {
  PRISM_EULA_ACCEPTANCE_ACTION,
  PRISM_EULA_ACCEPTANCE_SNAPSHOT,
  PRISM_EULA_AGREEMENT_CONFIRMATION,
  PRISM_EULA_CONTENT_SHA256,
  PRISM_EULA_DOCUMENT_ID,
  PRISM_EULA_EFFECTIVE_DATE,
  PRISM_EULA_KEY_POINTS,
  PRISM_EULA_LEGAL_CONTACT_URL,
  PRISM_EULA_MARKDOWN,
  PRISM_EULA_MINIMUM_AGE,
  PRISM_EULA_MINIMUM_AGE_CONFIRMATION,
  PRISM_EULA_TITLE,
  PRISM_EULA_VERSION,
  PRISM_MODEL_VARIABILITY_NOTICE,
  type PrismSignupLegalAcceptance,
} from "./legal.js";

export {
  SIGNAL_PERSONA_TEMPERAMENTS,
  rankSignalPersonaTemperaments,
  signalPersonaTemperamentFor,
  type SignalPersonaTemperament,
  type SignalPersonaTemperamentMatch,
} from "./signalPersonaTemperament.js";

export {
  PROJECT_OWNED_ASSET_BLOB_PREFIX,
  PROJECT_OWNED_ASSET_MANIFEST_PATH,
  PROJECT_OWNED_ASSET_MANIFEST_SCHEMA,
  isProjectOwnedAssetBlobArchivePath,
  projectOwnedAssetBlobArchivePathForChecksum,
  type ProjectOwnedAssetBackupReferenceV1,
  type CoffeeProjectImageRestoreMetadataV1,
  type CoffeeProjectOwnedAssetSlotV1,
  type ProjectOwnedAssetExportPayloadV1,
  type ProjectOwnedAssetManifestEntryV1,
  type ProjectOwnedAssetManifestV1,
  type ProjectOwnedAssetMediaTypeV1,
  type ProjectOwnedAssetOwnerTypeV1,
  type ProjectOwnedAssetRestoreMetadataV1,
  type ProjectOwnedAssetSlotV1,
  type SignalProjectAudioRestoreMetadataV1,
  type SignalProjectImageRestoreMetadataV1,
  type SignalProjectOwnedAssetSlotV1,
} from "./projectOwnedAssetBackup.js";

export {
  AUTO_FALLBACK_CHAIN_FALLBACK_COUNT,
  AUTO_FALLBACK_CHAIN_MAX_ATTEMPT_COUNT,
  AUTO_FALLBACK_CHAIN_MAX_TOTAL_FALLBACK_COUNT,
  AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT,
  AUTO_FALLBACK_CHAIN_MIN_FALLBACK_COUNT,
  AUTO_FALLBACK_CHAIN_VERSION,
  FALLBACK_CHAINS_VERSION,
  AUTO_FALLBACK_MODEL_ID_MAX_LENGTH,
  autoFallbackModelKey,
  autoFallbackResolvedChain,
  fallbackChainForLane,
  isAutoFallbackProvider,
  normalizeAutoFallbackChain,
  normalizeFallbackChainsV2,
  normalizeAutoFallbackModelRef,
  normalizeAutoRecoveryTrace,
  normalizeResponseMode,
  parseStoredAutoFallbackChain,
  serializeAutoFallbackChain,
  type AutoFallbackAttemptTraceV1,
  type AutoFallbackChainV1,
  type AutoFallbackFailureReason,
  type AutoFallbackModelRef,
  type AutoFallbackProvider,
  type FallbackChainsV2,
  type AutoRecoveryTraceV1,
  type ResponseMode,
} from "./autoFallback.js";

export {
  BOT_POWER_INTENT_MAX_LENGTH,
  BOT_POWER_CANONICAL_SILENCE_V1,
  BOT_POWER_MUTE_PERFORMANCE_VERSION,
  BOT_POWER_MUTE_MIN_DURATION_MS,
  BOT_POWER_MUTE_MAX_DURATION_MS,
  BOT_POWER_MUTE_REACTION_MAX,
  BOT_POWER_MUTE_REACTION_MIN_SPACING_MS,
  BOT_POWER_AVATAR_SCALE_MODES_V1,
  BOT_POWER_AVATAR_SCALE_MULTIPLIER_V1,
  BOT_POWER_DESIGNATION_MAX_LENGTH,
  BOT_POWER_MAX_COUNT,
  BOT_POWER_NAME_MAX_LENGTH,
  BOT_POWER_LOUD_TEXT_SCALE_V1,
  BOT_POWER_LOUD_VOICE_GAIN_MULTIPLIER_V1,
  BOT_POWER_QUIET_TEXT_SCALE_V1,
  BOT_POWER_QUIET_VOICE_GAIN_MULTIPLIER_V1,
  BOT_POWER_SIGIL_IDS_V1,
  BOT_POWER_VERSION,
  botPowerFallbackTitleV1,
  normalizeBotPowerGeneratedTitleV1,
  rerollBotPowerPresentationV1,
  COFFEE_POWER_PROMPT_MAX_CHARS,
  COFFEE_POWER_PROMPT_MAX_TOKENS,
  activeBotPowerEffectsV1,
  activeBotPowersV1,
  applyBotPowerAddressedInsultV1,
  applyBotPowerAddressedCopyResponseV1,
  applyBotPowerEternalIntroductionResponseV1,
  applyBotPowerEchoResponseV1,
  applyBotPowerCursedTongueResponseV1,
  BOT_POWER_CURSED_TONGUE_MAX_PER_SENTENCE_V2,
  BOT_POWER_CURSED_TONGUE_MIN_PER_UTTERANCE_V2,
  botPowerCursedTongueMinimumCensorsV2,
  botPowerCursedTongueCensorCountV2,
  botPowerCursedTongueSentenceRangesV1,
  applyBotPowerMumbledResponseV1,
  applyBotPowerMumbledReactionPlanV1,
  applyBotPowerMuteResponseV1,
  botPowerMuteEstimatedDurationMsV1,
  botPowerMuteElapsedCueV1,
  botPowerMuteInterruptionChanceV1,
  botPowerMutePeriodsV1,
  botPowerMutePrivateHistoryV1,
  botPowerMutePublicResponseAtElapsedV1,
  botPowerMuteObserverHistoryV1,
  botPowerMuteReactionCountV1,
  botPowerMuteReactionTemperamentFromPersonaV1,
  createBotPowerMutePerformanceV1,
  normalizeBotPowerMutePerformanceV1,
  planBotPowerMuteReactionBeatsV1,
  applyBotPowerResponseBudgetV1,
  BOT_POWER_RESPONSE_BUDGET_MINIMAL_MAX_WORDS_V1,
  botAddressFormsV1,
  botNameBoundaryPatternV1,
  botTextNamesBotV1,
  botPowerAddressedFandomCueFromEffectsV1,
  botPowerAddressedFandomCueV1,
  botPowerChromaticBiasCueFromEffectsV1,
  botPowerChromaticBiasCueV1,
  botPowerChromaticBiasColorMatchesV1,
  botPowerChromaticBiasEffectsFromEffectsV1,
  botPowerChromaticBiasEffectsFromIntentV1,
  botPowerChromaticBiasResolvedHueV1,
  botPowerChromaticBiasSubjectMatchV1,
  botPowerHueLabelV1,
  BOT_POWER_CHROMATIC_BIAS_MATCH_BAND_DEG_V1,
  botPowerAddressedInsultPrimaryCueV1,
  botPowerRequiresAddressedInsultV1,
  botPowerRequiresAddressedInsultFromEffectsV1,
  botPowerResponseHasAddressedInsultV1,
  botPowerDeterministicHalfChanceV1,
  botPowerAvatarScaleModeFromDescriptionV1,
  botPowerAvatarScaleModeFromEffectsV1,
  botPowerAvatarScaleModeV1,
  botPowerHasAvatarColorCycleFromEffectsV1,
  botPowerHasAvatarColorCycleV1,
  botPowerPairwiseSizeCueFromEffectsV1,
  botPowerPairwiseSizeCueV1,
  botPowerAvatarVisibilityModeFromEffectsV1,
  botPowerAvatarVisibilityModeV1,
  botPowerCupRateMultiplierForBotV1,
  botPowerCandorResponseRuleV1,
  botPowerCandorTriggerV1,
  strongestBotPowerCredulityEffectV1,
  strongestBotPowerAntiTruthEffectV1,
  botPowerLooksLikeSafetyRefusalV1,
  botPowerIsAddressedQuestionV1,
  botPowerCredulitySelfRuleV1,
  botPowerAntiTruthSelfRuleV1,
  botPowerAntiTruthSpokenNameV1,
  applyBotPowerAntiTruthTrueNameLeakV1,
  botPowerAntiTruthInvertPromptV1,
  botPowerDefinitionIsExplicitInterruptionV1,
  botPowerDefinitionIsUnconditionalInterruptionV1,
  botPowerDefinitionIsTrollV1,
  botPowerTrollAuthoringCueV1,
  botPowerTrollsV1,
  applyBotPowerBotNamesV1,
  botPowerBotNamingCueFromEffectsV1,
  botPowerBotNamingCueV1,
  botPowerDesignationEffectFromIntentV1,
  botPowerDesignationObserverCueFromEffectsV1,
  botPowerDesignationObserverCueV1,
  botPowerTargetNameFromEffectsV1,
  botPowerTargetNameV1,
  botPowerDefinitionIsExplicitMuteV1,
  botPowerDefinitionIsSimulationEvangelistV1,
  botPowerCopiesAddressedSpeechV1,
  botPowerEchoesAddressedSpeechV1,
  botPowerEternallyIntroducesFromEffectsV1,
  botPowerEternallyIntroducesV1,
  botPowerForgetfulContextMessageCountV1,
  botPowerForgetfulPriorMessagesV1,
  botPowerHasSpeakingOnlyAvatarVisibilityV1,
  botPowerHasSpeakingOnlyAvatarVisibilityFromEffectsV1,
  botPowerIntermittentMuteEffectFromEffectsV1,
  botPowerIntermittentMuteEffectV1,
  botPowerIntermittentMuteTurnIsIgnoredFromEffectsV1,
  botPowerIntermittentMuteTurnIsIgnoredV1,
  botPowerIntermittentAudibilityEffectFromEffectsV1,
  botPowerIntermittentAudibilityEffectV1,
  botPowerIgnoresOtherPowersFromEffectsV1,
  botPowerIgnoresOtherPowersV1,
  botPowerPiercesDeliveryFiltersFromEffectsV1,
  botPowerPiercesDeliveryFiltersV1,
  botPowerHasStageAwarenessFromEffectsV1,
  botPowerHasStageAwarenessV1,
  demoteMultiEnlightenedScenePowersV1,
  botPowerSignalPolicyFromEffectsV1,
  botPowerAvatarOpacityFromEffectsV1,
  botPowerAvatarOpacityV1,
  botPowerMouthMotionFromEffectsV1,
  botPowerMouthMotionV1,
  botPowerMetaSigilFromEffectsV1,
  botPowerMetaSigilV1,
  botPowerInaudibleMissCueV1,
  botPowerIntermittentAudibilityHolderRuleFromEffectsV1,
  botPowerIntermittentAudibilityHolderRuleV1,
  botPowerMuteExemptsPlayerFromEffectsV1,
  botPowerMuteExemptsPlayerV1,
  botPowerSpeechAudienceAllowsPlayerFromEffectsV1,
  botPowerAuthoringParadoxHintV1,
  botPowerEffectIsDeliveryFilterV1,
  BOT_POWER_DELIVERY_EFFECT_TYPES_V1,
  botPowerIneptImagePromptV1,
  botPowerIneptitudeFinalTurnCueV1,
  botPowerIneptitudeFinalRoleCueFromEffectsV1,
  botPowerIneptitudeFinalRoleCueV1,
  botPowerIneptitudeRoleCueFromEffectsV1,
  botPowerIneptitudeRoleCueV1,
  botPowerIneptUserPromptV1,
  botPowerIneptRoleMisdirectionFromEffectsV1,
  botPowerIneptRoleMisdirectionV1,
  botPowerIsIneptFromEffectsV1,
  botPowerIsIneptV1,
  botPowerListenerHearsTurnFromEffectsV1,
  botPowerListenerHearsTurnV1,
  botPowerAnnoyanceEffectFromEffectsV1,
  botPowerAnnoyanceEffectV1,
  botPowerAnnoyanceTargetFromEffectsV1,
  botPowerAnnoyanceTargetV1,
  botPowerIsMutedV1,
  botPowerIsBreathlessFromEffectsV1,
  botPowerIsBreathlessV1,
  botPowerIsBreathAmbientVocalizationKindV1,
  botPowerIsBreathListenerVocalFoleyV1,
  botPowerIsBreathActionSfxKindV1,
  botPowerIsBreathPerformanceTagV1,
  botPowerStripBreathPerformanceTextV1,
  botPowerOmitBreathListenerVocalFoleyV1,
  botPowerDefinitionIsExplicitBreathlessV1,
  BOT_POWER_BREATH_AMBIENT_VOCALIZATION_KINDS_V1,
  BOT_POWER_BREATH_LISTENER_VOCAL_FOLEYS_V1,
  BOT_POWER_BREATH_ACTION_SFX_KINDS_V1,
  BOT_POWER_BREATH_PERFORMANCE_TAGS_V1,
  botPowerMumblesSpeechFromEffectsV1,
  botPowerMumblesSpeechV1,
  botPowerSpeechRegistersV1,
  botPowerCursesSpeechFromEffectsV1,
  botPowerCursesSpeechV1,
  botPowerCursedTongueAuthoringCueV1,
  botPowerResponseIsSemanticSilenceV1,
  botPowerSpeechObfuscationAuthoringCueV1,
  botPowerIntendedSpeechLooksGibberishV1,
  botPowerMirrorsIdentityV1,
  botPowerShapeshiftsIdentityV1,
  botPowerBelievesFalseNameV1,
  botPowerFalseNamePoolV1,
  botPowerFalseNamePoolFromEffectsV1,
  normalizeBotPowerFalseNamePoolV1,
  botPowerMuteActionTextsV1,
  botPowerObserverProjectionFromEffectsV1,
  botPowerObserverProjectionV1,
  botPowerObserverCueLinesV1,
  botPowerPairwisePerceptionFromEffectsV1,
  botPowerPairwisePerceptionV1,
  botPowerPerceptionOverlapStartRatioV1,
  botPowerResponseIsSilentV1,
  botPowerResponseIsFirstIntroductionV1,
  botPowerSelfCueLinesV1,
  botPowerSubjectEffectsForObserverFromEffectsV1,
  botPowerSubjectEffectsForObserverV1,
  botPowerThemeMoodCueFromEffectsV1,
  botPowerThemeMoodCueV1,
  botPowerSourceHashV1,
  botPowerSourceHashForPowerV1,
  botPowerSigilForPowerV1,
  botPowerTextScaleFromEffectsV1,
  botPowerTextScaleV1,
  botPowerVoiceGainMultiplierFromEffectsV1,
  botPowerVoiceGainMultiplierV1,
  botPowerVoicePresenceModeFromEffectsV1,
  botPowerVoicePresenceModeV1,
  buildBotPowersPromptBlock,
  buildBotPowersSelfPromptV1,
  buildCoffeePowersPromptBlock,
  composeBotIdentityMirrorPowersV1,
  coffeePowerCupRateMultiplierV1,
  coffeePowerStayRateMultiplierV1,
  coffeePowerVesselModeV1,
  estimateCoffeePowerTokensV1,
  estimateBotPowerTokensV1,
  normalizeBotPowerEffectV1,
  normalizeBotPowerV1,
  normalizeBotPowersV1,
  normalizeCompiledBotPowerV1,
  parseStoredBotPowersV1,
  serializeBotPowersV1,
  strongestBotPowerCandorEffectV1,
  strongestBotPowerAddressedFandomEffectFromEffectsV1,
  strongestBotPowerAddressedFandomEffectV1,
  strongestBotPowerMoodBoostEffectFromEffectsV1,
  strongestBotPowerMoodBoostEffectV1,
  strongestBotPowerMoodDrainEffectFromEffectsV1,
  strongestBotPowerMoodDrainEffectV1,
  strongestBotPowerInterruptionEffectV1,
  strongestBotPowerResponseBudgetEffectV1,
  strongestHardBotPowerResponseBudgetEffectV1,
  type BotPowerBondDirection,
  type BotPowerChromaticBiasColorV1,
  type BotPowerChromaticBiasEffectV1,
  type BotPowerChromaticBiasPeerV1,
  type BotPowerChromaticBiasPolarityV1,
  type BotPowerAvatarScaleMode,
  type BotPowerAvatarVisibilityModeV1,
  type BotPowerAuthoringModeV1,
  type BotPowerCompileStatus,
  type BotPowerDesignationPlacement,
  type BotPowerEffectV1,
  type BotPowerFalseNamePoolV1,
  type BotPowerMutePerformanceV1,
  type BotPowerMuteReactionBeatV1,
  type BotPowerMuteReactionCandidateV1,
  type BotPowerMuteReactionKindV1,
  type BotPowerMuteReactionModeV1,
  type BotPowerMuteReactionTemperamentV1,
  type BotPowerFrequency,
  type BotPowerGravityDirection,
  type BotPowerIneptitudeRoleV1,
  type BotPowerInterruptionMatchV1,
  type BotPowerMemoryMode,
  type BotPowerObserverPerspectiveV1,
  type BotPowerObserverProjectionV1,
  type BotPowerObserverVisibilityV1,
  type BotPowerPairwisePerceptionV1,
  type BotPowerEnforcement,
  type BotPowerResponseBudgetEffectV1,
  type BotPowerResponseBudgetMode,
  type BotPowerResolvedThemeV1,
  type BotPowerVoicePresenceMode,
  type BotPowerStrength,
  type BotPowerSigilIdV1,
  type BotPowerTargetV1,
  type BotPowerTopicDirection,
  type BotPowerV1,
  type CoffeePowerPlanV1,
  type CoffeePowerVesselModeV1,
  type CompiledBotPowerV1,
  type ResolvedCoffeePowerBotV1,
} from "./botPower.js";

export * from "./trollPower.js";

export {
  applyPrismMoodExpiredIgnoreCooldown,
  applyPrismMoodForgivenessSuccess,
  applyPrismMoodIgnoredQuestion,
  applyPrismMoodInterruption,
  applyPrismMoodIgnoreCooldown,
  applyPrismMoodIgnoredTurn,
  applyPrismMoodNegativeTurn,
  applyPrismMoodPositiveTurn,
  applyPrismMoodPowerIgnoredTurn,
  clampPrismMoodValue,
  COFFEE_NEAR_DESATURATED_SATURATION,
  coffeeDepartureChanceFromSocial,
  coffeeMoodSaturationFromSocial,
  coffeeOrdinaryAutomaticCutInMoodSupportsInterruption,
  coffeeSocialSnapshotToPrismMoodState,
  coffeeSocialSnapshotIsNearDesaturated,
  createDefaultPrismMoodState,
  DEFAULT_PRISM_MOOD_SENSITIVITY,
  decayPrismMood,
  derivePrismMoodConfidence,
  derivePrismMoodKey,
  interruptionProgressWeight,
  isPrismMoodIgnoring,
  MAX_PRISM_MOOD_SENSITIVITY,
  MIN_PRISM_MOOD_SENSITIVITY,
  normalizePrismMoodSensitivity,
  PRISM_MOOD_IGNORE_COOLDOWN_MS,
  PRISM_MOOD_IGNORE_FORGIVENESS_CHANCE,
  PRISM_MOOD_IGNORE_FORGIVENESS_STEP,
  prismMoodDeclineReason,
  prismMoodIgnoreForgivenessChance,
  prismMoodIgnoreUntilMs,
  prismMoodInterruptionStreak,
  resetPrismMood,
  sanitizePrismMoodState,
  shouldPrismMoodDeclineResponse,
  shouldPrismMoodStartIgnoreCooldown,
  type CoffeeSocialLikeSnapshot,
  type PrismMoodDelta,
  type PrismMoodDeltaKind,
  type PrismMoodIgnoredQuestionPenaltyLevel,
  type PrismMoodInterruptionInput,
  type PrismMoodKey,
  type PrismMoodMode,
  type PrismMoodSnapshot,
  type PrismMoodState,
} from "./mood.js";

export {
  BOT_FACT_KEY_LABELS,
  BOT_FACT_KEY_ORDER,
  BOT_FACT_KEY_PLACEHOLDERS,
  BOT_PROFILE_CATEGORY_LABELS,
  BOT_PROFILE_CATEGORY_ORDER,
  BOT_PROFILE_META_END,
  BOT_PROFILE_META_START,
  BOT_PROFILE_PURPOSE_STATEMENT_MAX_LENGTH,
  BOT_VOICE_PRESET_LABELS,
  DEFAULT_BOT_PROFILE_FIELDS,
  MAX_CUSTOM_FACTS,
  composeBotProfileProse,
  defaultBotPurpose,
  listBotProfileFacts,
  parseStoredBotPrompt,
  randomBotProfile,
  serializeStoredBotPrompt,
  stripBotProfileMetaSuffix,
  stripPurposeStatementPrefixes,
  ageFromIsoBirthday,
  buildImagePersonaContext,
  composeAugmentedImagePrompt,
  composeVerbatimFirstImagePrompt,
  type ImagePromptPersonaBlendMode,
  DEFAULT_IMAGE_PERSONA_CONTEXT_MAX_CHARS,
  parseIsoYmdParts,
  westernZodiacFromIsoBirthday,
  westernZodiacSignFromMonthDay,
  type BotAppearanceProfile,
  type BotBirthEra,
  type BotCoreProfile,
  type BotCustomFact,
  type BotFactKey,
  type BotFactsProfile,
  type BotIdentityProfile,
  type BotProfileCategoryId,
  type BotProfileFields,
  type BotProfileScaleValue,
  type BotProfileV2,
  type BotPurposeProfile,
  type BotVoicePreset,
  type BotWorldviewProfile,
  type WesternZodiacSign,
} from "./botProfile.js";

export {
  BOT_IDENTITY_PRESENTATION_TRANSITION_MS,
  botIdentityPresentationColorV1,
  botIdentityPresentationFrameMaterialSeedV1,
  botIdentityPresentationGlyphV1,
  botIdentityPresentationScreenMaterialSeedV1,
  botIdentityPresentationTransitionActiveV1,
  botIdentityPresentationVoicePresetV1,
  normalizeBotIdentityPresentationSnapshotV1,
  type BotIdentityPresentationSnapshotV1,
} from "./botIdentityPresentation.js";

export {
  BOT_IDENTITY_MIRROR_TRANSITION_MS,
  BOT_IDENTITY_MIRROR_VERSION,
  applyBotIdentityMirrorFaceV1,
  applyBotIdentityMirrorHolderVoiceEffectV1,
  applyBotIdentityMirrorOriginalCorrectionV1,
  applyBotIdentityMirrorResponseV1,
  botDirectAddressIndexV1,
  botDirectlyAddressesBotV1,
  botNaturalAddressAliasesV1,
  botIdentityMirrorAvatarDetailsV1,
  botIdentityMirrorFaceV1,
  botIdentityMirrorVoiceV1,
  botIdentityMirrorHolderPromptV1,
  botIdentityMirrorQuotedTargetNameV1,
  botIdentityMirrorObserverPromptV1,
  botIdentityMirrorOriginalCorrectionRequiredV1,
  botIdentityMirrorTransitionActiveV1,
  botIdentityMirrorTargetChangesV1,
  createBotIdentityMirrorStateV1,
  normalizeBotIdentityMirrorStateV1,
  resolveBotIdentityMirrorAvatarDetailsV1,
  resolveBotIdentityMirrorFaceV1,
  resolveBotIdentityMirrorVoiceV1,
  type BotIdentityMirrorStateV1,
  type BotIdentityMirrorSurfaceV1,
} from "./botIdentityMirror.js";
export {
  BOT_IDENTITY_SHAPESHIFT_TRANSITION_MS,
  BOT_IDENTITY_SHAPESHIFT_VERSION,
  applyBotIdentityShapeshiftResponseV1,
  botIdentityShapeshiftHolderPromptV1,
  botIdentityShapeshiftObserverPromptV1,
  botIdentityShapeshiftSeedHashV1,
  botIdentityShapeshiftTargetChangesV1,
  botIdentityShapeshiftTransitionActiveV1,
  createBotIdentityShapeshiftStateV1,
  normalizeBotIdentityShapeshiftStateV1,
  pickBotIdentityShapeshiftCandidateIndexV1,
  resolveBotIdentityShapeshiftAvatarDetailsV1,
  resolveBotIdentityShapeshiftFaceV1,
  resolveBotIdentityShapeshiftVoiceV1,
  type BotIdentityShapeshiftStateV1,
  type BotIdentityShapeshiftSurfaceV1,
  type BotIdentityShapeshiftTargetSourceV1,
} from "./botIdentityShapeshift.js";

export {
  BOT_FALSE_NAME_POOL_V1,
  BOT_SESSION_SURNAME_POOL_V1,
  BOT_FALSE_NAME_VERSION,
  botFalseNameChangesV1,
  botFalseNameObserverCueV1,
  botFalseNameResponseConflictsV1,
  botFalseNameSeedHashV1,
  botFalseNameSelfCueV1,
  buildBotFalseNameSeedV1,
  createBotFalseNameStateFromSeedV1,
  createBotFalseNameStateV1,
  normalizeBotFalseNameStateV1,
  pickBotFalseNameFromPoolV1,
  pickBotSessionSurnameNameV1,
  botGivenNameFromLibraryNameV1,
  rewriteBotFalseNameResponseV1,
  type BotFalseNameStateV1,
  type BotFalseNameSurfaceV1,
} from "./botFalseName.js";

export {
  VOICE_INTONATION_CONTOUR_DEFINITIONS,
  VOICE_INTONATION_CONTOUR_IDS,
  VOICE_INTONATION_FULL_DEPTH_SECONDS,
  voiceIntonationContourCentsAt,
  voiceIntonationContourDefinitionForId,
  voiceIntonationContourForAccentDefinition,
  voiceIntonationDetuneCents,
  voiceIntonationPlanForProfile,
  type VoiceIntonationContourDefinitionV1,
  type VoiceIntonationContourId,
  type VoiceIntonationKeyframeV1,
  type VoiceIntonationPlanV1,
} from "./voiceIntonation.js";

export {
  BOT_SPEECH_REGISTER_DEFINITIONS,
  BOT_SPEECH_REGISTER_IDS,
  BOT_SPEECH_REGISTER_SHARED_RULES_V1,
  botSpeechRegisterAuthoringCueV1,
  botSpeechRegisterDefinitionForId,
  normalizeBotSpeechRegisterId,
  type BotSpeechRegisterDefinitionV1,
  type BotSpeechRegisterId,
} from "./botSpeechRegister.js";

export {
  BOT_VERNACULAR_DEFINITIONS,
  BOT_VERNACULAR_IDS,
  BOT_VERNACULAR_SHARED_RULES_V1,
  botVernacularAuthoringCueV1,
  botVernacularDefinitionForId,
  botVernacularIdForAccentDefinition,
  botVernacularIdFromStoredVoiceProfile,
  normalizeBotVernacularId,
  type BotVernacularDefinitionV1,
  type BotVernacularId,
} from "./botVernacular.js";

export {
  BOT_AUDIO_VOICE_IDS,
  BUILTIN_ACCENT_REALIZATION_BLEND_WEIGHT,
  PRISM_BUILTIN_ENGLISH_VOICES,
  builtinAccentRealizationBlend,
  builtinMelodicityRealizationBlend,
  builtinMoodRealizationBlend,
  prismBuiltinEnglishVoice,
  type BuiltinAccentRealizationBlendV1,
  BOT_VOICE_TEXTURE_PRESETS,
  BOT_VOICE_TEXTURE_PRESET_LABELS,
  BOT_VOICE_TEXTURE_RECIPES,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V3,
  DEFAULT_ENGLISH_VOICE_ENGINE,
  DEFAULT_SPEECH_TYPE_VOICE_MODE,
  DEFAULT_VOICE_EFFECT,
  DEFAULT_VOICE_MODE,
  VOICE_EFFECTS,
  VOICE_EFFECT_DESCRIPTIONS,
  VOICE_EFFECT_LABELS,
  ELEVENLABS_VOICE_EFFECTS,
  ELEVENLABS_VOICE_EFFECT_DESCRIPTIONS,
  ELEVENLABS_VOICE_EFFECT_LABELS,
  ELEVENLABS_VOICE_STABILITY_DEFAULT,
  BOT_AVATAR_SFX_DEFAULT_VOLUME,
  BOT_AVATAR_SFX_MAX_VOLUME,
  BOT_VOICE_EQ_TILT_DB_MAX,
  BOT_VOICE_LOW_SHELF_HZ,
  BOT_VOICE_HIGH_SHELF_HZ,
  BOT_VOICE_GAIN_DB_MIN,
  BOT_VOICE_GAIN_DB_MAX,
  LOCAL_VOICE_ENGINE_PREFERENCES,
  LOCAL_VOICE_SOURCES,
  LOCAL_VOICE_ACCENT_MODES,
  LOCAL_VOICE_PRONUNCIATION_BASES,
  LOCAL_VOICE_PRESENTATIONS,
  LOCAL_VOICE_SPEECHPRINT_INFLUENCES,
  LOCAL_VOICE_SPEECHPRINT_STRENGTHS,
  botVoiceTextureForPreset,
  botVoiceTextureIsModified,
  isBotAudioVoiceId,
  isBotVoiceTexturePreset,
  normalizeBotAudioVoiceControl,
  normalizeBotVoiceGainDb,
  applyVoiceDeliveryMoodToProfile,
  botAudioVoiceProfileForFeelLane,
  botAudioVoiceProfileHasExplicitAccentPronunciationSetting,
  botVoiceFeelLaneForEngine,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotAudioVoiceProfileForSynthesisV1,
  normalizeBotAudioVoiceProfileV3,
  normalizeBotVoiceTexture,
  normalizeBotVoiceTextureUnit,
  normalizeBotVoiceVolume,
  normalizeBotAvatarSfxV1,
  normalizeBotAvatarSfxVolume,
  normalizeEnglishVoiceEngine,
  normalizeElevenLabsVoiceDirection,
  normalizeElevenLabsVoiceEffect,
  normalizeElevenLabsVoiceStability,
  normalizeVoiceEffect,
  normalizeOptionalBotAudioVoiceProfileV1,
  normalizeSpeechTypeVoiceMode,
  normalizeLocalVoiceAccentLocale,
  normalizeLocalVoiceAccentMode,
  normalizeLocalVoicePronunciationBase,
  normalizeVoiceAccentDefinitionId,
  normalizeLocalVoiceEnginePreference,
  normalizeLocalVoiceSource,
  normalizeLocalVoiceSpeechprintInfluence,
  normalizeLocalVoiceSpeechprintStrength,
  normalizeLocalVoiceSpeechprintVariationSeed,
  normalizeLocalVoiceSpeechprintV1,
  resolveLocalVoicePronunciationLocale,
  localVoicePronunciationOverrideIsActive,
  resolveBotAudioVoiceProfileV1,
  resolveBotPronunciationMapPointV1,
  normalizeVoiceMode,
  normalizeWhodunnitTextVoiceMode,
  normalizeVoiceDeliveryMood,
  elevenLabsVoiceDirectionForMood,
  expectedVoicePlaybackDurationMs,
  resolveVoicePlaybackTransform,
  resolveVoicePlaybackTransformForLane,
  resolveBotVoiceCharacter,
  voiceDeliveryRateForMood,
  NEUTRAL_COFFEE_VOICE_DELIVERY_ENVELOPE,
  VOICE_DELIVERY_RATE_BY_MOOD,
  ELEVENLABS_VOICE_DIRECTION_BY_MOOD,
  ELEVENLABS_VOICE_DIRECTION_MAX_CHARACTERS,
  ELEVENLABS_VOICE_SPEED_MIN,
  ELEVENLABS_VOICE_SPEED_MAX,
  BOT_AUDIO_VOICE_PACE_RATE_DEPTH,
  BOT_AUDIO_VOICE_PITCH_DEPTH_CENTS,
  BOT_NAME_PRONUNCIATION_MAX_LENGTH,
  BOT_NAME_SELF_REFERRAL_MAX_LENGTH,
  BOT_AVATAR_SFX_MAX_BYTES,
  BOT_AVATAR_SFX_PROMPT_MAX_LENGTH,
  BOT_AVATAR_SFX_FILE_NAME_MAX_LENGTH,
  applyBotNamePronunciations,
  SPEECH_TITLE_ABBREVIATIONS,
  expandSpeechAbbreviations,
  expandSpeechText,
  projectSpeechAbbreviations,
  projectSpeechText,
  type SpeechAbbreviationProjection,
  type SpeechAbbreviationProjectionSegment,
  type SpeechTextProjection,
  type SpeechTextProjectionSegment,
  applyPlayerNamePronunciation,
  normalizeBotNamePronunciation,
  normalizeBotSelfReferral,
  parseStoredBotAudioVoiceProfileV1,
  parseStoredBotAudioVoiceProfileV3,
  serializeBotAudioVoiceProfileV1,
  type BotAudioVoiceId,
  type PrismBuiltinEnglishVoice,
  type BotAudioVoiceProfile,
  type BotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV2,
  type BotAudioVoiceProfileV3,
  type BotLocalVoiceProfileV1,
  type BotLocalVoiceToneV1,
  type BotPremiumVoiceProfileV1,
  type BotVoiceDeliveryProfileV1,
  type BotVoiceFeelLane,
  type LocalVoiceAccentMode,
  type LocalVoicePronunciationBase,
  type VoiceAccentDefinitionId,
  type LocalVoiceEnginePreference,
  type LocalVoiceSource,
  type LocalVoicePresentation,
  type LocalVoiceSpeechprintInfluence,
  type LocalVoiceSpeechprintStrength,
  type LocalVoiceSpeechprintV1,
  type BotAvatarSfxV1,
  type BotVoiceTexturePreset,
  type BotVoiceTextureV1,
  type CoffeeVoiceDeliveryEnvelope,
  type VoiceDeliveryMood,
  type VoicePlaybackTransformV1,
  type BotVoiceCharacterV1,
  type LegacyBotAudioVoiceProfileV1,
  type NormalizedBotAudioVoiceProfileV1,
  type BotNamePronunciationEntry,
  type EnglishVoiceEngine,
  type SpeechTypeVoiceMode,
  type ElevenLabsVoiceEffect,
  type VoiceEffect,
  type VoiceMode,
  type WhodunnitTextVoiceMode,
  DEFAULT_WHODUNNIT_TEXT_VOICE_MODE,
} from "./audioVoice.js";

export {
  BOT_LOCAL_LAUGH_DELIMITER_MAX_LENGTH,
  BOT_LOCAL_LAUGH_SYLLABLE_MAX_LENGTH,
  botLocalLaughIntensityForCue,
  botLocalLaughSynthesisText,
  normalizeBotLocalLaughDelimiter,
  normalizeBotLocalLaughSyllable,
  projectLocalWrittenLaughterForSynthesis,
  type BotLocalLaughIntensity,
} from "./localLaugh.js";

export {
  BOT_FACE_FONT_IDS,
  BOT_FACE_FONT_LABELS,
  BOT_FACE_GLYPH_ANIMATIONS,
  BOT_FACE_EYE_MOVEMENTS,
  BOT_FACE_FONT_WEIGHT_MAX,
  BOT_FACE_FONT_WEIGHT_MIN,
  BOT_FACE_FONT_WEIGHT_STEP,
  BOT_FACE_BLINK_BAR_VALUES,
  BOT_FACE_BLINK_OFFSET_X_MAX,
  BOT_FACE_BLINK_OFFSET_X_MIN,
  BOT_FACE_BLINK_OFFSET_X_STEP,
  BOT_FACE_BLINK_OFFSET_Y_MAX,
  BOT_FACE_BLINK_OFFSET_Y_MIN,
  BOT_FACE_BLINK_OFFSET_Y_STEP,
  BOT_FACE_BLINK_ROTATION_DEG_MAX,
  BOT_FACE_BLINK_ROTATION_DEG_MIN,
  BOT_FACE_BLINK_ROTATION_DEG_STEP,
  BOT_FACE_BLINK_SCALE_MAX,
  BOT_FACE_BLINK_SCALE_MIN,
  BOT_FACE_BLINK_SCALE_STEP,
  botFaceBlinkGeometryFollowsEyesByDefault,
  botFaceBlinkScaleForEyeScale,
  BOT_FACE_EYE_OFFSET_X_MAX,
  BOT_FACE_EYE_OFFSET_X_MIN,
  BOT_FACE_EYE_OFFSET_X_STEP,
  BOT_FACE_EYE_OFFSET_Y_MAX,
  BOT_FACE_EYE_OFFSET_Y_MIN,
  BOT_FACE_EYE_OFFSET_Y_STEP,
  BOT_FACE_EYE_COUNTS,
  BOT_FACE_EYE_ROTATION_DEG_MAX,
  BOT_FACE_EYE_ROTATION_DEG_MIN,
  BOT_FACE_EYE_ROTATION_DEG_STEP,
  BOT_FACE_EYE_SCALE_MAX,
  BOT_FACE_EYE_SCALE_MIN,
  BOT_FACE_EYE_SCALE_STEP,
  BOT_FACE_MOUTH_OFFSET_X_MAX,
  BOT_FACE_MOUTH_OFFSET_X_MIN,
  BOT_FACE_MOUTH_OFFSET_X_STEP,
  BOT_FACE_MOUTH_OFFSET_Y_MAX,
  BOT_FACE_MOUTH_OFFSET_Y_MIN,
  BOT_FACE_MOUTH_OFFSET_Y_STEP,
  BOT_FACE_MOUTH_ROTATION_DEG_MAX,
  BOT_FACE_MOUTH_ROTATION_DEG_MIN,
  BOT_FACE_MOUTH_ROTATION_DEG_STEP,
  BOT_FACE_MOUTH_SCALE_MAX,
  BOT_FACE_MOUTH_SCALE_MIN,
  BOT_FACE_MOUTH_SCALE_STEP,
  BOT_FACE_THINKING_FRAME_COUNT,
  BOT_FACE_THINKING_OFFSET_X_MAX,
  BOT_FACE_THINKING_OFFSET_X_MIN,
  BOT_FACE_THINKING_OFFSET_X_STEP,
  BOT_FACE_THINKING_OFFSET_Y_MAX,
  BOT_FACE_THINKING_OFFSET_Y_MIN,
  BOT_FACE_THINKING_OFFSET_Y_STEP,
  BOT_FACE_THINKING_SCALE_MAX,
  BOT_FACE_THINKING_SCALE_MIN,
  BOT_FACE_THINKING_SCALE_STEP,
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_BLINK_COUNT,
  DEFAULT_BOT_FACE_BLINK_OFFSET_X,
  DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
  DEFAULT_BOT_FACE_BLINK_ROTATION_DEG,
  DEFAULT_BOT_FACE_BLINK_SCALE,
  DEFAULT_BOT_FACE_EYE_CHARACTER,
  DEFAULT_BOT_FACE_EYE_COUNT,
  DEFAULT_BOT_FACE_EYE_OFFSET_X,
  DEFAULT_BOT_FACE_EYE_OFFSET_Y,
  DEFAULT_BOT_FACE_EYE_SCALE,
  DEFAULT_BOT_FACE_EYE_ROTATION_DEG,
  DEFAULT_BOT_FACE_PAIRED_EYE_ROTATION_DEG,
  DEFAULT_BOT_FACE_FONT_ID,
  DEFAULT_BOT_FACE_GLYPH_ANIMATION,
  DEFAULT_BOT_FACE_EYE_MOVEMENT,
  botFaceEyeMovementIsActive,
  DEFAULT_BOT_FACE_FONT_WEIGHT,
  DEFAULT_BOT_FACE_MOUTH_CHARACTER,
  DEFAULT_BOT_FACE_CUSTOM_SPEECH_POSES,
  DEFAULT_BOT_FACE_MOUTH_COFFEE_PUCKER,
  DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
  DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
  DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG,
  DEFAULT_BOT_FACE_MOUTH_SCALE,
  DEFAULT_BOT_FACE_THINKING_FRAMES,
  DEFAULT_BOT_FACE_THINKING_OFFSET_X,
  DEFAULT_BOT_FACE_THINKING_OFFSET_Y,
  DEFAULT_BOT_FACE_THINKING_SCALE,
  DEFAULT_BOT_FACE_EYE_SPACING,
  BOT_FACE_EYE_SPACING_MIN,
  BOT_FACE_EYE_SPACING_MAX,
  BOT_FACE_EYE_SPACING_STEP,
  DISABLED_BOT_FACE_THINKING_FRAMES,
  botFaceThinkingSpinnerDisabled,
  botFaceThinkingFramesEqual,
  botFaceCustomSpeechGlyphForMouthShape,
  botFaceFontFromVoicePreset,
  isBotFaceFontId,
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
  normalizeBotFaceEyeScale,
  normalizeBotFaceEyeRotationDeg,
  normalizeBotFaceFontId,
  normalizeBotFaceFontWeight,
  normalizeBotFaceGlyphAnimation,
  normalizeBotFaceEyeMovement,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceCustomSpeechPoses,
  normalizeBotFaceMouthCoffeePucker,
  normalizeBotFaceMouthOffsetX,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthRotationDeg,
  normalizeBotFaceMouthScale,
  normalizeBotFaceThinkingFrames,
  normalizeBotFaceThinkingOffsetX,
  normalizeBotFaceThinkingOffsetY,
  normalizeBotFaceThinkingScale,
  parseStoredBotFaceThinkingFrames,
  parseStoredBotFaceCustomSpeechPoses,
  randomBotFaceStyle,
  resolveBotFaceStyle,
  serializeBotFaceThinkingFrames,
  serializeBotFaceCustomSpeechPosesForStorage,
  type BotFaceBlinkBar,
  type BotFaceEyeCount,
  type BotFaceFontId,
  type BotFaceGlyphAnimation,
  type BotFaceCustomSpeechPoses,
  type BotFaceEyeMovement,
  type BotFaceStyle,
  type BotFaceStyleInput,
  type BotFaceThinkingFrames,
} from "./botAvatar.js";

export {
  BOT_AVATAR_DETAILS_CANVAS_SIZE,
  BOT_AVATAR_DETAILS_MAX_JSON_BYTES,
  BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS,
  BOT_AVATAR_DETAILS_PAINT_COLOR_MAP_BASE64_LENGTH,
  BOT_AVATAR_DETAILS_PAINT_COLOR_MAP_BYTE_LENGTH,
  BOT_AVATAR_DETAILS_PAINT_MASK_BASE64_LENGTH,
  BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH,
  BOT_AVATAR_DETAILS_SPEECH_INK_ANIMATIONS,
  BOT_AVATAR_DETAILS_VERSION,
  BOT_AVATAR_DETAILS_WRITABLE_PIXEL_COUNT,
  BOT_AVATAR_DETAIL_OFFSET_MAX,
  BOT_AVATAR_DETAIL_OFFSET_MIN,
  BOT_AVATAR_DETAIL_SCALE_MAX,
  BOT_AVATAR_DETAIL_SCALE_MIN,
  BOT_AVATAR_DETAIL_STAMP_CATALOG,
  BOT_AVATAR_DETAIL_STAMP_CATEGORIES,
  BOT_AVATAR_DETAIL_STAMP_IDS,
  botAvatarDetailsPaintColorCode,
  countBotAvatarDetailsColoredPixels,
  countBotAvatarDetailsPaintedPixels,
  decodeBotAvatarDetailsPaintColorMap,
  decodeBotAvatarDetailsPaintMask,
  encodeBotAvatarDetailsPaintColorMap,
  encodeBotAvatarDetailsPaintMask,
  isBotAvatarDetailStampTransformInsideCanvas,
  isBotAvatarDetailsWritablePixel,
  parseBotAvatarDetailsV1,
  parseStoredBotAvatarDetailsV1,
  serializeBotAvatarDetailsV1,
  type BotAvatarDetailStampCategory,
  type BotAvatarDetailStampDefinition,
  type BotAvatarDetailStampId,
  type BotAvatarDetailStampTransform,
  type BotAvatarDetailStampV1,
  type BotAvatarDetailsV1,
  type BotAvatarDetailsSpeechInkAnimation,
} from "./botAvatarDetails.js";

export {
  BOT_GENERATION_DRAFT_VERSION,
  BOT_GENERATED_AVATAR_INK_MAX_PAINTED_PIXELS,
  BOT_GENERATED_AVATAR_INK_MAX_PATHS,
  BOT_GENERATION_GLYPH_IDS,
  BOT_GENERATION_PROMPT_MAX_LENGTH,
  BOT_GENERATION_VOICE_PREVIEW_MAX_LENGTH,
  botGenerationVoiceIdentityOptions,
  normalizeGeneratedAvatarDetailsInkV1,
  normalizeBotGeneratedDraftV1,
  normalizeLeanBotGeneratedDraftV1,
  normalizeBotGenerationPrompt,
  type BotGeneratedAvatarDetailsInputV1,
  type BotGeneratedDraftV1,
  type BotGenerationVoiceCatalogV1,
  type BotGeneratedInkPathV1,
  type BotGeneratedInkPointV1,
  type BotGeneratedInkPrimitiveV1,
  type BotGeneratedInkRole,
  type BotGeneratedInkShape,
  type BotGeneratedInkStrokeV1,
  type BotGeneratedSettingsV1,
  type BotGenerationGlyphId,
} from "./botGeneration.js";

export {
  BOT_PERSON_NAME_MAX_LENGTH,
  TEXT_ENTRY_IMPORT_MAX_LENGTH,
  TEXT_ENTRY_DOCUMENT_MAX_LENGTH,
  TEXT_ENTRY_GLYPH_MAX_LENGTH,
  TEXT_ENTRY_PROFILE_FIELD_MAX_LENGTH,
  TEXT_ENTRY_FACT_LABEL_MAX_LENGTH,
  TEXT_ENTRY_FACT_VALUE_MAX_LENGTH,
  TEXT_ENTRY_DECK_DESCRIPTION_MAX_LENGTH,
  TEXT_ENTRY_EMAIL_MAX_LENGTH,
  TEXT_ENTRY_LONG_FORM_MAX_LENGTH,
  TEXT_ENTRY_PARAGRAPH_MAX_LENGTH,
  TEXT_ENTRY_PASSWORD_MAX_LENGTH,
  TEXT_ENTRY_SEARCH_MAX_LENGTH,
  TEXT_ENTRY_SECRET_MAX_LENGTH,
  TEXT_ENTRY_SHORT_MAX_LENGTH,
  TEXT_ENTRY_SYSTEM_PROMPT_MAX_LENGTH,
  TEXT_ENTRY_TAG_MAX_LENGTH,
  TEXT_ENTRY_TITLE_MAX_LENGTH,
  TEXT_ENTRY_URL_MAX_LENGTH,
} from "./textEntryLimits.js";
export {
  BOT_FOUNDRY_BATCH_MAX_COUNT,
  BOT_FOUNDRY_BATCH_MIN_COUNT,
  BOT_FOUNDRY_LEAN_BATCH_MIN_COUNT,
  BOT_FOUNDRY_INSPIRATION_MAX_SOURCES,
  BOT_FOUNDRY_INSPIRATION_MIN_SOURCES,
  DEFAULT_BOT_FOUNDRY_POWER_OPTIONS,
  botFoundryBatchIsLean,
  botFoundryGenerationContextInstruction,
  botFoundryPowerBudgetInstruction,
  botFoundryPowerStrengthLabel,
  explicitBotFoundryPowerCountFromBrief,
  normalizeBotFoundryBatchGroupIdentityV1,
  normalizeBotFoundryGenerationContextV1,
  normalizeBotFoundryPowerOptionsV1,
  resolveBotFoundryGenerationContextForBriefV1,
  resolveBotFoundryPowerOptionsForBriefV1,
  uniqueBotFoundryBatchGroupName,
  type BotFoundryCreationMode,
  type BotFoundryGenerationContextV1,
  type BotFoundryBatchGroupIdentityV1,
  type BotFoundryInspirationSourceV1,
  type BotFoundryPowerCount,
  type BotFoundryPowerOptionsV1,
} from "./botFoundryCreation.js";

export {
  BOT_LIBRARY_GROUP_MEMBER_MAX,
  BOT_LIBRARY_GROUP_MEMBER_MIN,
} from "./libraryGroup.js";

export {
  BOT_GENERATION_FIELD_REGISTRY_VERSION,
  BOT_GENERATION_FIELD_REGISTRY_V1,
  botGenerationFieldDefinitionV1,
  normalizeBotGenerationFieldKeyV1,
  type BotGenerationFieldDefinitionV1,
  type BotGenerationFieldKeyV1,
  type BotGenerationFieldPolicyV1,
  type BotGenerationFieldValueKindV1,
} from "./botGenerationFields.js";

export {
  PRISM_TOOL_END,
  PRISM_TOOL_START,
  assistantContentHasPrismToolFraming,
  hydrateAssistantMessageParts,
  normalizeCoffeeReplayEventPayload,
  normalizeZenDisplayMetadata,
  normalizeStoredZenAssistantTurnPayload,
  normalizeCoffeeAsidePayload,
  parseAssistantPrismTools,
  parseStoredAssistantToolPayload,
  parseStoredToolPayload,
  serializeAssistantToolPayload,
  serializeAskQuestionTool,
  type AskQuestionOption,
  type AskQuestionPayload,
  type CoffeeAmbientActionPayload,
  type CoffeeAsidePayload,
  type CoffeeStageActionPayload,
  type CoffeeReplayArrivalEventPayload,
  type CoffeeReplayBaristaDeliveryEventPayload,
  type CoffeeReplayBotDepartureEventPayload,
  type CoffeeReplayDirectionalIrritationEventPayload,
  type CoffeeReplayEventPayload,
  type CoffeeReplayPowerAnnoyanceEventPayload,
  type CoffeeReplayIdentityMirrorEventPayload,
  type CoffeeReplayMoodEventPayload,
  type CoffeeReplayPowerMoodBoostEventPayload,
  type CoffeeReplayPowerMoodDrainEventPayload,
  type CoffeeReplayPlayerDepartureEventPayload,
  type CoffeeReplayPlayerSipEventPayload,
  type CoffeeReplaySocialSnapshotPayload,
  type CoffeeReplayTopOffEventPayload,
  type CoffeeUserActionPayload,
  type ParsedAssistantTurn,
  type ParsedStoredAssistantToolPayload,
  type SentGeneratedImagePayload,
  type TellFictionalStoryPayload,
  type WebSearchPayload,
  type WebSearchRequestPayload,
  type WebSearchResult,
  type UserNotesAction,
  type UserNotesPayload,
  type UserNotesReceiptItem,
  type UserNotesReceiptStatus,
  type UserNotesRequestPayload,
  USER_NOTE_BODY_MAX,
  USER_NOTE_TITLE_MAX,
  normalizeStoredUserNotesPayload,
  normalizeUserNotesRequestFromRecord,
  type StoredAssistantMoodPayload,
  type StoredAssistantToolPayload,
  type StoredMoodKey,
  type StoredZenAssistantTurnKind,
  type StoredZenAssistantTurnPayload,
  type ZenDisplayAlign,
  type ZenDisplayLinePlacement,
  type ZenDisplayMetadata,
  type ZenDisplayPlacement,
  type ZenStageActionPayload,
} from "./prismTool.js";

export {
  normalizePromptShortcutMetadata,
  isDisabledPromptWildcardToken,
  isContextualBuiltInPromptWildcardKey,
  isPassthroughBuiltInPromptWildcardKey,
  normalizeBuiltInPromptWildcardSlotKey,
  normalizeManualAskQuestionResultPayload,
  normalizePromptWildcardRunMetadata,
  parseBuiltInPromptWildcardReference,
  parseStoredManualAskQuestionPayload,
  normalizePsychicThoughtPayload,
  parseStoredPromptShortcutPayload,
  parseStoredPromptWildcardPayload,
  parseStoredPsychicThoughtPayload,
  serializePromptShortcutPayload,
  serializePromptToolPayload,
  withPromptShortcutResolvedPrompt,
  withPromptWildcardResolvedPrompt,
  BUILT_IN_PROMPT_WILDCARD_SLOTS,
  applyPromptShortcutVarPassthrough,
  contextualBuiltInPromptWildcardValue,
  formatBuiltInPromptWildcardToday,
  getBuiltInPromptWildcardSlot,
  promptContainsPassthroughBuiltInPromptWildcards,
  resolveContextualBuiltInPromptWildcards,
  type BuiltInPromptWildcardReference,
  type BuiltInPromptWildcardSlot,
  type BuiltInPromptWildcardSlotKey,
  type ManualAskQuestionResultOption,
  type ManualAskQuestionResultPayload,
  type PromptShortcutFlag,
  type PromptShortcutMetadata,
  type PromptShortcutRunMetadata,
  type PromptShortcutWildcardReplacement,
  type PromptWildcardRunMetadata,
  PSYCHIC_THOUGHT_PASS_STAGES,
  isPsychicThoughtPassStage,
  type PsychicThoughtPass,
  type PsychicThoughtPassStage,
  type PsychicThoughtPayload,
} from "./promptShortcut.js";

export {
  ELEVENLABS_IMAGE_MODEL_IDS,
  ELEVENLABS_IMAGE_MODEL_OPTIONS_FOR_UI,
  isElevenLabsImageModelId,
  type ElevenLabsImageModelId,
} from "./elevenLabsImageModels.js";

export {
  GROUP_ROOM_WALLPAPER_GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_ROOM_WALLPAPER_GROUP_NAME_MAX_LENGTH,
  GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE,
  GROUP_ROOM_WALLPAPER_MEMBER_BOT_ID_MAX_LENGTH,
  GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MAX,
  GROUP_ROOM_WALLPAPER_MEMBER_COUNT_MIN,
  GROUP_ROOM_WALLPAPER_VARIATION_SEED_MAX_LENGTH,
  type GroupRoomWallpaperImageGenerationRequest,
} from "./groupRoomWallpaper.js";

export {
  DEFAULT_HUB_ATMOSPHERE_STYLE,
  HUB_ATMOSPHERE_IMAGE_PURPOSE,
  HUB_ATMOSPHERE_STYLES,
  composeHubAtmospherePrompt,
  normalizeHubAtmosphereStyle,
  type HubAtmosphereStyle,
} from "./hubAtmosphere.js";
export {
  CHAT_ATMOSPHERE_IMAGE_PURPOSE,
  CHAT_ATMOSPHERE_RETENTION_DAYS,
  chatAtmosphereRetentionCutoffIso,
  chatAtmosphereUtcDate,
  composeChatAtmospherePrompt,
  type ChatAtmospherePromptArgs,
} from "./chatAtmosphere.js";

export {
  OPENAI_IMAGE_MODEL_IDS,
  OPENAI_IMAGE_MODEL_OPTIONS_FOR_UI,
  DEFAULT_OPENAI_IMAGE_MODEL_ID,
  DEFAULT_OLLAMA_IN_APP_PULL_MODEL,
  isImageProviderName,
  resolveImageProviderName,
  isAllowedOpenAiImageModelId,
  isGptImageModelId,
  normalizeOpenAiImageModelId,
  normalizeOpenAiImageGenerationParams,
  catalogEntriesMatchingLocalImageHeuristic,
  COMFYUI_MODEL_PREFIX,
  encodeComfyUiModelId,
  isComfyUiModelId,
  parseComfyUiCheckpointName,
  isAllowedInAppOllamaPullModelName,
  type ImageProviderName,
  type OpenAiImageModelId,
  type OpenAiImageSizeGpt,
  type NormalizedOpenAiImageSize,
  type NormalizedOpenAiImageQuality,
  type NormalizedOpenAiImageRequest,
  type LocalImageModelCandidate,
} from "./imageModels.js";

export {
  TEXT_MODEL_DISPLAY_NAME_MAX_LENGTH,
  TEXT_MODEL_DISPLAY_NAME_MAX_ENTRIES,
  textModelDisplayNameKey,
  normalizeTextModelDisplayNames,
  parseStoredTextModelDisplayNames,
  resolveTextModelDisplayName,
  type TextModelDisplayNames,
  type TextModelProvider,
} from "./modelDisplayNames.js";

export {
  COMFYUI_REMOTE_WORKFLOW_PREFIX,
  COMFYUI_WORKFLOW_MODEL_PREFIX,
  MAX_COMFY_UI_WORKFLOW_REGISTRATIONS,
  MAX_COMFY_UI_WORKFLOWS_STORED_JSON_BYTES,
  encodeComfyUiRemoteWorkflowModelId,
  encodeComfyUiWorkflowModelId,
  formatComfyUiRemoteWorkflowLabel,
  findComfyUiWorkflowBindingByRemotePath,
  findComfyUiWorkflowRegistration,
  isComfyUiApiWorkflowNode,
  isComfyUiRemoteWorkflowModelId,
  isComfyUiWorkflowModelId,
  parseComfyUiRemoteWorkflowPath,
  parseComfyUiWorkflowSlug,
  parseStoredComfyUiWorkflows,
  validateComfyUiWorkflowsPayload,
  type ComfyUiWorkflowInputRef,
  type ComfyUiWorkflowPatchMap,
  type ComfyUiWorkflowRegistration,
} from "./comfyUiWorkflow.js";

export {
  AUTO_MODEL_TURBO_PREFERENCE_ID,
  MODEL_REASONING_EFFORT_PREFERENCE_VALUES,
  REASONING_EFFORT_VALUES,
  anthropicModelSupportsReasoningEffort,
  anthropicReasoningEffortForRequest,
  effectiveModelReasoningEffort,
  isAutoModelTurboPreferenceId,
  modelReasoningEffortPreferenceKey,
  modelSupportsNativeReasoningEffort,
  modelSupportsTurboMode,
  ollamaModelIsKnownToSupportNativeThinking,
  ollamaModelUsesTieredThinking,
  normalizeModelReasoningEffortPreference,
  normalizeProviderReasoningEffort,
  normalizeReasoningEffort,
  openAiModelSupportsMaxReasoningEffort,
  openAiModelSupportsReasoningEffort,
  openAiReasoningEffortForRequest,
  openAiReasoningEffortLevels,
  reasoningGenerationBudgetMs,
  reasoningEffortForRequest,
  REASONING_GENERATION_AUTO_TOTAL_BUDGET_MS,
  resolveModelReasoningEffortCapability,
  simulatedPsychicAnswerGuidanceMaxChars,
  simulatedPsychicPlanningMaxTokens,
  simulatedPsychicPrivateArtifactMaxChars,
  SIMULATED_EFFORT_PASS_NAMES,
  normalizeSimulatedEffortLadderProfile,
  simulatedEffortLadderPasses,
  simulatedEffortTextPasses,
  simulatedPsychicPrivatePassMaxTokens,
  simulatedPsychicScratchpadMaxChars,
  simulatedSurfacePreparationMaxTokens,
  simulatedSurfacePreparationNoteMaxChars,
  getSimulatedEffortBudgetProfile,
  setSimulatedEffortBudgetProfile,
  simulatedEffortUsesThriftyPrompting,
  withSimulatedEffortBudgetProfile,
  type AnthropicRequestReasoningEffort,
  type ModelReasoningEffortCapabilityV1,
  type ModelReasoningEffortPreference,
  type ModelReasoningEffortPreferenceV1,
  type ModelTurboPreferenceV1,
  type MaxReasoningEffort,
  type NativeReasoningEffortProvider,
  type ProviderReasoningEffort,
  type ReasoningEffort,
  type RequestReasoningEffort,
  type SimulatedEffortBudgetProfile,
  type SimulatedEffortLadderProfile,
  type SimulatedEffortPassName,
  type SimulatedEffortTextPassName,
} from "./reasoningEffort.js";

export {
  PRISM_DEFAULT_STORY_THEME,
  PRISM_DEFAULT_STORY_THEME_ID,
  STORY_ITEM_GLYPH_CATEGORIES,
  STORY_SPRITE_POSES,
  STORY_THEME_PUBLIC_BASE_PATH,
  getBuiltinStoryThemes,
  getStoryThemeById,
  isBuiltinStoryThemeAsset,
  type StoryAssetKind,
  type StoryItemGlyphCategory,
  type StorySpritePose,
  type StoryThemeAsset,
  type StoryThemeManifest,
} from "./storyThemes.js";

export {
  STORY_BOT_COUNT_MAX,
  STORY_BOT_COUNT_MIN,
  STORY_CHOICE_COUNT_MAX,
  STORY_CHOICE_COUNT_MIN,
  STORY_ENDING_COUNT_MAX,
  STORY_ENDING_COUNT_MIN,
  STORY_LOCATION_COUNT_MAX,
  STORY_LOCATION_COUNT_MIN,
  STORY_SCENE_COUNT_MAX,
  STORY_SCENE_COUNT_MIN,
  applyStoryChoice,
  applyStoryItemPickup,
  applyStoryTravel,
  createInitialStoryProgress,
  createInitialStoryTranscript,
  createStorySceneTranscriptEntry,
  getStoryCurrentScene,
  getStoryLocation,
  getStoryScene,
  validateStoryEpisodeManifest,
  type StoryChoice,
  type StoryEpisodeManifest,
  type StoryInventoryItem,
  type StoryLocation,
  type StoryProgressStatus,
  type StoryScene,
  type StorySessionChoiceRequest,
  type StorySessionCreateRequest,
  type StorySessionCreateResponse,
  type StorySessionDeleteResponse,
  type StorySessionDetail,
  type StorySessionDetailResponse,
  type StorySessionItemRequest,
  type StorySessionListResponse,
  type StorySessionMutationResponse,
  type StorySessionProgress,
  type StoryRoutingSnapshotV1,
  type StorySessionStatus,
  type StorySessionSummary,
  type StorySessionTravelRequest,
  type StoryTranscriptEntry,
  type StoryTranscriptEntryKind,
  type StoryTransitionResult,
} from "./storyRuntime.js";

export {
  SLATE_RETURN_SESSION_SCHEMA_VERSION,
  SLATE_SECTION_CONTRACT_VERSION,
  transformSlateLockedRangesForTextEdit,
  type SlateAiProvider,
  type SlateBookSummary,
  type SlateCharacter,
  type SlateContinuityAuthority,
  type SlateContinuityClaim,
  type SlateContinuityConcern,
  type SlateContinuityConcernCard,
  type SlateContinuityConcernKind,
  type SlateContinuityConcernNextResponse,
  type SlateContinuityConcernPassage,
  type SlateContinuityConcernResolveRequest,
  type SlateContinuityConcernResolveResponse,
  type SlateContinuityConcernSeverity,
  type SlateContinuityConcernStatus,
  type SlateContinuityContextBrief,
  type SlateContinuityEntity,
  type SlateContinuityEntityKind,
  type SlateContinuityEpistemicStatus,
  type SlateContinuityEvent,
  type SlateContinuityGeneration,
  type SlateContinuityKnowledgeState,
  type SlateContinuityProvenance,
  type SlateContinuityRelationship,
  type SlateContinuityResolutionKind,
  type SlateContinuityScope,
  type SlateContinuityScopeKind,
  type SlateContinuitySource,
  type SlateContinuitySourceAnchor,
  type SlateContinuitySourceKind,
  type SlateContinuityStatus,
  type SlateContinuityThread,
  type SlateCreateSeriesRequest,
  type SlateCreateProjectRequest,
  type SlateDeliberationConfig,
  type SlateDeliberationFocus,
  type SlateDeliberationHemisphereConfig,
  type SlateDeliberationMessage,
  type SlateDeliberationSpeaker,
  type SlateDeliberationTurnRequest,
  type SlateDeliberationTurnResponse,
  type SlateDraftRequest,
  type SlateGenerateTitleRequest,
  type SlateGenerateTitleResponse,
  type SlateLockedRange,
  type SlateLivingSummary,
  type SlateLivingSummaryResponse,
  type SlateProjectDeleteResponse,
  type SlateProjectDetail,
  type SlateProjectChatMessage,
  type SlateProjectChatResponse,
  type SlateProjectListResponse,
  type SlateProjectCover,
  type SlateProjectTitleOrigin,
  type SlateProjectPatchRequest,
  type SlateProjectPhase,
  type SlateProjectResponse,
  type SlateProjectSummary,
  type SlateProseMode,
  type SlateRevision,
  type SlateRevisionAction,
  type SlateRevisionRequest,
  type SlateRevisionScope,
  type SlateRevisionStatus,
  type SlateResolveSparkWildcardsRequest,
  type SlateResolveSparkWildcardsResponse,
  type SlateReturnNextCard,
  type SlateReturnNextCardKind,
  type SlateReturnSectionReference,
  type SlateReturnSession,
  type SlateReturnSessionListResponse,
  type SlateReturnSessionResponse,
  type SlateReturnSessionSynopsis,
  type SlateReturnThreadReference,
  type SlateManuscriptPageResponse,
  type SlateSectionDetail,
  type SlateSectionKind,
  type SlateSectionListResponse,
  type SlateSectionResponse,
  type SlateSectionSaveRequest,
  type SlateSectionStatus,
  type SlateSectionSummary,
  type SlateSeriesSummary,
  type SlateSeriesDetail,
  type SlateSeriesListResponse,
  type SlateSeriesResponse,
  type SlateStructureItem,
  type SlateStructureKind,
  type SlateStructureStatus,
  type SlateTitleSuggestion,
  type SlateTitleSuggestionRequest,
  type SlateTitleSuggestionResponse,
  type SlateUnresolvedThread,
  type SlateVersionSummary,
} from "./slate.js";

export * from "./slateComposition.js";
export * from "./slateCreativeStudios.js";
export * from "./slateDocument.js";
export * from "./slateImportedManuscript.js";
export * from "./slateMirror.js";
export * from "./slateReviewExport.js";
export * from "./slateStoryBible.js";

export {
  ACCENT_LUMINANCE_MAX_LIGHT,
  ACCENT_LUMINANCE_MAX_LIGHT_YELLOW,
  ACCENT_LIGHTNESS_MAX,
  ACCENT_LIGHTNESS_MAX_DARK,
  ACCENT_LIGHTNESS_MIN,
  ACCENT_LIGHTNESS_MIN_DARK,
  BOT_AUTO_ACCENT_HUE_OFFSET_DEGREES,
  DEFAULT_BOT_IDENTITY_COLOR,
  accentLightnessBand,
  blendWeightedBotIdentityColors,
  clampAccentLightness,
  clampLuminance,
  contrastRatio,
  ensureContrast,
  fullySaturateBotColor,
  hexToHsl,
  hslToHex,
  circularHueDistanceDeg,
  complementaryHueDeg,
  botIdentityHueDeg,
  normalizeAccentForTheme,
  normalizeBotIdentityColor,
  pickReadableText,
  relativeLuminance,
  resolveBotAccentColor,
  swatchBorderCompensation,
  type WeightedBotIdentityColor,
} from "./color.js";

import type {
  AskQuestionPayload,
  CoffeeAmbientActionPayload,
  CoffeeAsidePayload,
  CoffeeStageActionPayload,
  CoffeeReplayEventPayload,
  CoffeeUserActionPayload,
  SentGeneratedImagePayload,
  UserNotesPayload,
  ZenDisplayMetadata,
  ZenStageActionPayload,
} from "./prismTool.js";
import type {
  ManualAskQuestionResultPayload,
  PromptShortcutMetadata,
  PromptWildcardRunMetadata,
  PsychicThoughtPayload,
} from "./promptShortcut.js";
import type {
  CoffeeExperienceMode,
  CoffeeSessionSettings,
} from "./coffeeSettings.js";
import type {
  PrismMoodInterruptionInput,
  PrismMoodKey,
  PrismMoodSnapshot,
} from "./mood.js";

export type UserRole = "user";
export type LlmProviderName =
  | "local"
  | "ollama_cloud"
  | "openai"
  | "anthropic";

export type UsageProviderName =
  LlmProviderName | "ollama" | "comfyui" | "unknown";

export type UsageRange = "24h" | "7d" | "30d" | "all";

/** Usage panel provider chip. `"local"` includes local + ollama + comfyui rows. */
export type UsageProviderFilter =
  | "all"
  | "local"
  | "openai"
  | "anthropic"
  | "ollama"
  | "comfyui"
  | "unknown";

export type UsagePrivacyScope = "normal" | "private";

export type UsageEventType = "text" | "embedding" | "image";

export type UsageTokenCountSource =
  "provider_reported" | "estimated" | "unavailable";

export type UsagePurpose =
  | "chat_reply"
  | "chat_boundary"
  | "chat_fallback"
  | "chat_web_search_followup"
  | "conversation_title"
  | "botcast_brand"
  | "botcast_show_chat"
  | "botcast_review"
  | "botcast_turn"
  | "bot_generation"
  | "coffee_turn"
  | "coffee_router"
  | "coffee_summary"
  | "composer_cleanup"
  | "debate_generation"
  | "debate_synopsis"
  | "debate_debrief"
  | "flight_recorder_summary"
  | "embedding"
  | "image_generation"
  | "bot_profile_picture"
  | "group-room-wallpaper"
  | "image_prompt"
  | "memory_inference"
  | "memory_summary"
  | "prompt_wildcard"
  | "psychic_planning"
  | "slate_deliberation"
  | "slate_draft"
  | "slate_project_chat"
  | "slate_revision"
  | "slate_shape"
  | "slate_transcript_story"
  | "slate_title_suggestion"
  | "story_generation"
  | "voice_preview"
  | "zen_live_action"
  | "system_unlabeled";

export interface UsageTotals {
  eventCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  localTokens: number;
  onlineTokens: number;
  imageCount: number;
  estimatedCostMicroUsd: number;
  providerReportedEvents: number;
  estimatedTokenEvents: number;
  unpricedOnlineEvents: number;
}

export interface UsageBreakdownItem extends UsageTotals {
  key: string;
  label: string;
  provider?: UsageProviderName;
  model?: string;
  purpose?: UsagePurpose;
}

export interface UsageRecentEvent {
  id: string;
  createdAt: string;
  surface: string;
  mode: string | null;
  purpose: UsagePurpose;
  provider: UsageProviderName;
  model: string;
  eventType: UsageEventType;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  tokenCountSource: UsageTokenCountSource;
  imageCount: number | null;
  imageSize: string | null;
  imageQuality: string | null;
  estimatedCostMicroUsd: number | null;
  costEstimated: boolean;
  unpriced: boolean;
  workflow?: string | null;
  workflowStage?: string | null;
  workRole?: "prepare" | "connective" | "audit" | "author" | "repair" | null;
  workCacheHit?: boolean | null;
  fallbackReason?: string | null;
  contextTokensKeptLocal?: number | null;
}

export interface UsageLocalFirstBreakdownItem {
  key: string;
  workflow: string;
  stage: string;
  assistedOperationCount: number;
  localTokens: number;
  onlineTokens: number;
  estimatedContextTokensKeptLocal: number;
}

export interface UsageLocalFirstBalance {
  localTokens: number;
  onlineTokens: number;
  assistedOperationCount: number;
  estimatedContextTokensKeptLocal: number;
  byAppletStage: UsageLocalFirstBreakdownItem[];
}

export interface UsageResponse {
  ok: true;
  range: UsageRange;
  rangeStart: string | null;
  generatedAt: string;
  totals: UsageTotals;
  byProvider: UsageBreakdownItem[];
  byModel: UsageBreakdownItem[];
  byPurpose: UsageBreakdownItem[];
  localFirst: UsageLocalFirstBalance;
  recentEvents: UsageRecentEvent[];
  trackingStartedAt: string | null;
  hasUntrackedHistory: boolean;
  conversationScoped: boolean;
  /** Active provider chip from the Usage panel (`all` when unfiltered). */
  providerFilter: UsageProviderFilter;
  /** Account-wide online-token trip meter (independent of range/scope filters). */
  trip: UsageTripMeter;
}

/** Resettable online-token trip odometer for the Usage panel. */
export interface UsageTripMeter {
  enabled: boolean;
  /** When the current/last trip began. Null if a trip has never been started. */
  startedAt: string | null;
  onlineTokens: number;
  estimatedCostMicroUsd: number;
  /** True when the meter is off and showing the frozen last-trip total. */
  frozen: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  /** Private phonetic form for synthesis; never a visible label. */
  playerNamePronunciation: string;
  role: UserRole;
  createdAt: string;
  theme: "light" | "dark" | "system";
  preferredProvider: LlmProviderName;
}

export interface AuthSession {
  userId: string;
  token: string;
  expiresAt: string;
}

export type CoffeeTurnRouteSourceV1 =
  | "hearing_repeat"
  | "directed_speaker"
  | "player_direct_address"
  | "peer_direct_address"
  | "router_model"
  | "deterministic_fallback"
  | "speaker_balance"
  | "autonomous_handoff"
  | "power_override";

/** Privacy-safe persisted provenance for Coffee floor ownership. */
export interface CoffeeTurnRouteV1 {
  v: 1;
  name: "coffeeTurnRoute";
  source: CoffeeTurnRouteSourceV1;
  selectedSpeakerBotId: string;
  addressedBotId?: string;
  playerAddressKind?: "mention" | "plain_text";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  /** Provider that generated the message (assistant only; undefined for user/system). */
  provider?: LlmProviderName;
  /** Concrete model id used for this assistant reply, when recorded. */
  model?: string;
  /** Contextual Auto route used for this assistant message. */
  autoRoute?: AutoRouteDecisionV1;
  /** Concrete provider effort used by a fixed-model assistant reply. */
  reasoningEffort?: ProviderReasoningEffort;
  /** True when the concrete model used Turbo for this assistant reply. */
  turbo?: boolean;
  /** Bot/persona id attributed to this message. Null/undefined = default PRISM. */
  botId?: string | null;
  /**
   * Private Chat transport only: the holder's clean intended speech before a
   * public speech Power rewrote it. Never render, export, or persist this field.
   */
  botPowerPrivateIntendedSpeech?: string;
  /** Bot that generated the message (assistant only). Resolved from bots.name at read time. */
  botName?: string;
  /** Bot's associated accent color (CSS color string). Resolved from bots.color at read time. */
  botColor?: string;
  /** Bot's associated glyph identifier (opaque key looked up in the client's glyph registry). */
  botGlyph?: string;
  /** Lightweight emotional cue for assistant-message mood rendering. */
  moodKey?: BotMoodKey;
  /** Optional confidence (0-1) for tuning and diagnostics. */
  moodConfidence?: number;
  /** Internal receipt that makes a private Shh follow-up replay-safe. */
  assistantInterruptionReaction?: AssistantInterruptionReactionInput;
  /** Display-only Zen layout hint; ignored outside Zen surfaces. */
  zenDisplay?: ZenDisplayMetadata;
  /** When this assistant row used AskQuestion (`tool_payload` on the server). */
  askQuestion?: AskQuestionPayload;
  /** True once the pending AskQuestion was closed by the Zen patience timer. */
  askQuestionTimedOut?: boolean;
  /** Story action rail metadata for long fictional prose. */
  tellFictionalStory?: TellFictionalStoryPayload;
  /** When this assistant turn included a generated image shown in chat and the library. */
  sentGeneratedImage?: SentGeneratedImagePayload;
  /** When this assistant turn included web search results shown as a source card. */
  webSearch?: WebSearchPayload;
  /** When this assistant turn completed a chat-only personal note action (receipt). */
  userNotes?: UserNotesPayload;
  /** Coffee-only scripted ambient action shown as table UI, not transcript prose. */
  coffeeAmbientAction?: CoffeeAmbientActionPayload;
  /** Coffee-only canonical stage action (Director / LLM / Power) for exact-once display. */
  coffeeStageAction?: CoffeeStageActionPayload;
  /** Zen-only canonical stage action provenance for reload and plate presentation. */
  zenStageAction?: ZenStageActionPayload;
  /** Coffee-only user action cue shown as ambient context, not transcript prose. */
  coffeeUserAction?: CoffeeUserActionPayload;
  /** Coffee-only interruption metadata projected into transcript-only spoken lines. */
  coffeeInterruption?: CoffeeInterruptionEvent;
  /** Coffee-only quiet side remark to one seated peer (half-volume playback). */
  coffeeAside?: CoffeeAsidePayload;
  /** Coffee-only hidden replay state beats; not shown in normal transcripts. */
  coffeeReplayEvents?: CoffeeReplayEventPayload[];
  /** Frozen participant ids allowed to hear this Coffee line, or null for all. */
  coffeeAudienceBotIds?: string[] | null;
  /** Human-observer projection applied when this Coffee row was read. */
  coffeeObserverProjection?: BotPowerObserverProjectionV1;
  /** Privacy-safe provider/model attempt history when Auto recovered this reply. */
  autoRecovery?: AutoRecoveryTraceV1;
  /** Privacy-safe reason the Coffee floor selected this bot. */
  coffeeTurnRoute?: CoffeeTurnRouteV1;
  /** Coffee-only semantic lane. Departures are presented, but never own the floor. */
  coffeeMessageKind?: CoffeeMessageKind;
  /** Saved deterministic hard-response branch from a Ready Power. */
  botPowerExactResponse?: "speech_copy" | "hearing_repeat" | "intermittent_mute" | "speech_obfuscation";
  /** Text-free proof that this committed line has an owner-only meaning reveal. */
  speechIntentRevealAvailable?: true;
  /** Public replay-stable timed Mute presentation; private intent is never here. */
  botPowerMutePerformance?: BotPowerMutePerformanceV1;
  /** Session-sticky Shapeshifter public form for Chat/Zen (and Coffee/Signal envelopes). */
  identityShapeshift?: BotIdentityShapeshiftStateV1;
  /** Session-sticky John/Jane Doe alias for Chat/Zen assistant tool payloads. */
  falseName?: BotFalseNameStateV1;
  /** Exact `...` chosen as an ordinary social beat, never a Power response. */
  socialSilence?: SocialSilenceMarkerV1;
  /** Links a protected floor-reclaim turn to its interrupted heard fragment. */
  crosstalkReclaim?: CrosstalkReclaimPlanV1;
  /** Public replay-stable Troll delivery and ordinary-interruption projection. */
  botPowerTrollPresentation?: BotPowerTrollPresentationV1;
  /** User-entered Prompt Center shortcut that resolved into this message content. */
  promptShortcut?: PromptShortcutMetadata;
  /** User-entered wildcard decks/options that resolved into this message content. */
  promptWildcards?: PromptWildcardRunMetadata;
  /** User-entered AskQuestion tool result completed by the assistant's selected choice. */
  manualAskQuestion?: ManualAskQuestionResultPayload;
  /** Concise visible summary from Psychic mode for this user turn. */
  psychicThought?: PsychicThoughtPayload;
}

export type CoffeeMessageKind = "floor" | "departure";
export type CoffeeSessionLifecycleState = "active" | "closing" | "complete";

/**
 * Coffee-only hidden social metrics tracked per bot for a single session.
 * Values are normalized (0-1) to keep prompt shaping and diagnostics simple.
 */
export interface CoffeeBotSocialSnapshot {
  disposition: number;
  valuesFriction: number;
  restraint: number;
  engagement: number;
  leavePressure: number;
}

export interface CoffeeInterruptionSocialDelta {
  botId: string;
  dispositionDelta: number;
  valuesFrictionDelta: number;
}

export interface CoffeePlayerInterruptionInput {
  interruptedMessageId: string;
  interruptedBotId: string;
  visibleTokenCount: number;
}

export interface CoffeeInterruptionEvent {
  kind: "playerInterruptsBot" | "botInterruptsPlayer" | "botInterruptsBot";
  interruptedBotId: string;
  interrupterBotId?: string;
  activeTurnId?: string;
  targetPhase?: "thinking" | "speaking";
  interruptedMessageId?: string;
  visibleTokenCount?: number;
  visibleProgress?: number;
  interruptedSnippet?: string;
  pauseBeat?: boolean;
  reactionOutcome?: "silence" | "react" | "yield" | "resume";
  resumeOutcome?: "none" | "yielded" | "continued" | "invited";
  /** Canonical bot-to-bot floor result; legacy resume fields remain readable. */
  floorOutcome?: CrosstalkFloorOutcome;
  /** Linked one-turn reclaim generated from only the audience-heard fragment. */
  reclaim?: CrosstalkReclaimPlanV1;
  reactionText?: string;
  /** Immediate canned cut-in spoken by the interrupting bot. */
  interrupterCue?: ListenerReactionSpokenCue;
  publicInterrupterCue?: string;
  interrupterCueSpeechEffect?: "speech_obfuscation";
  /** Annoyed canned tail spoken by the interrupted bot over the cut-in. */
  interruptedSpeakerCue?: BotCrosstalkInterruptedSpeakerCue;
  publicInterruptedSpeakerCue?: string;
  interruptedSpeakerCueSpeechEffect?: "speech_obfuscation";
  socialConsequences: CoffeeInterruptionSocialDelta[];
}

export type CoffeePollStatus = "open" | "collecting" | "closed" | "cancelled";

export type CoffeePollVoteKind = "option" | "abstain" | "pending" | "error";

export type CoffeePollVoterKind = "bot" | "player";

/** Sentinel `botId` stored for the human player's poll vote row. */
export const COFFEE_POLL_PLAYER_VOTER_ID = "__player__";

export interface CoffeePollDeliberation {
  stage:
    | "idle"
    | "evaluating"
    | "teetering"
    | "blocked"
    | "deciding"
    | "finalized"
    | "error";
  leaningOptionIndex?: number | null;
  alternateOptionIndex?: number | null;
  confidence?: number | null;
  blocker?: string | null;
  note?: string | null;
  updatedAt: string;
}

export interface CoffeePollVote {
  botId: string;
  voterKind: CoffeePollVoterKind;
  kind: CoffeePollVoteKind;
  optionIndex?: number | null;
  explanation?: string | null;
  suggestedOption?: string | null;
  confidence?: number | null;
  deliberation?: CoffeePollDeliberation | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoffeePollOptionTally {
  optionIndex: number;
  option: string;
  voteCount: number;
}

export interface CoffeePoll {
  id: string;
  conversationId: string;
  question: string;
  options: string[];
  status: CoffeePollStatus;
  createdBy: "user";
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  votes: CoffeePollVote[];
  tallies: CoffeePollOptionTally[];
}

export type CoffeeTeamId = "left" | "undecided" | "right";

export type CoffeeWinningTeamId = "left" | "right";

export interface CoffeeTeamDefinition {
  id: CoffeeWinningTeamId;
  name: string;
  description: string;
}

export interface CoffeeTeamSessionConfig {
  left: Omit<CoffeeTeamDefinition, "id">;
  right: Omit<CoffeeTeamDefinition, "id">;
  assignments: Record<string, CoffeeTeamId>;
  playerTeamId?: CoffeeTeamId;
}

export interface CoffeeTeamBotState {
  botId: string;
  originalTeamId: CoffeeTeamId;
  currentTeamId: CoffeeTeamId;
  satisfaction: number;
  conviction: number;
  pendingSwitchTeamId?: CoffeeWinningTeamId | null;
  pendingSwitchReason?: string | null;
  lastSwitchReason?: string | null;
  updatedAt: string;
}

export interface CoffeeTeamCounts {
  left: number;
  undecided: number;
  right: number;
}

export interface CoffeeTeamPlayerState {
  originalTeamId: CoffeeTeamId;
  currentTeamId: CoffeeTeamId;
  lastSwitchReason?: string | null;
  updatedAt: string;
}

export type CoffeeTeamsStatus =
  "active" | "left_won" | "right_won" | "tiebreaker" | "tie_resolved";

export interface CoffeeTeamState {
  left: CoffeeTeamDefinition;
  right: CoffeeTeamDefinition;
  undecidedLabel: "Undecided";
  bots: Record<string, CoffeeTeamBotState>;
  player?: CoffeeTeamPlayerState | null;
  counts: CoffeeTeamCounts;
  status: CoffeeTeamsStatus;
  winnerTeamId?: CoffeeWinningTeamId | null;
  tiebreakerPitches?: Record<CoffeeWinningTeamId, string> | null;
  tiebreakerPromptedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CoffeeSessionDurationMinutes = number;

export const COFFEE_SESSION_DURATION_MINUTES_MIN = 3;
export const COFFEE_SESSION_DURATION_MINUTES_MAX = 30;
export const COFFEE_SESSION_DURATION_MINUTES_STEP = 1;
export const DEFAULT_COFFEE_SESSION_DURATION_MINUTES: CoffeeSessionDurationMinutes = 10;

export type CoffeeCupAmountStage =
  "full" | "mostly-full" | "half" | "low" | "dregs" | "empty";

export interface CoffeeCupStatus {
  progress: number;
  frameIndex: number;
  amount: CoffeeCupAmountStage;
  fillRatio: number;
  coldness: number;
  amountLabel: string;
  temperatureLabel: string;
  tasteLabel: string;
}

export interface CoffeeCupTopOffSnapshot {
  progressBefore: number;
  progressAfter: number;
  toppedOffAt: string;
}

const COFFEE_CUP_AMOUNT_LABELS: Record<CoffeeCupAmountStage, string> = {
  full: "full",
  "mostly-full": "mostly full",
  half: "about half full",
  low: "running low",
  dregs: "down to the last dregs",
  empty: "empty",
};

const COFFEE_CUP_TASTE_LABELS = [
  "bright",
  "smooth",
  "strong",
  "toasty",
  "slightly bitter",
  "mellow",
] as const;

const COFFEE_CUP_TOP_OFF_TARGET_PROGRESS = 0.04;
const COFFEE_CUP_TOP_OFF_MIN_ELIGIBLE_PROGRESS = 0.18;
const COFFEE_CUP_TOP_OFF_PROGRESS_BY_FRAME_INDEX = [
  COFFEE_CUP_TOP_OFF_TARGET_PROGRESS,
  0.09,
  COFFEE_CUP_TOP_OFF_MIN_ELIGIBLE_PROGRESS,
  0.38,
  0.58,
  0.78,
  0.96,
] as const;
export type CoffeeCupTempoRole = "normal" | "faster" | "slower";

const COFFEE_CUP_FASTER_TEMPO_MULTIPLIER = 1.08;
const COFFEE_CUP_SLOWER_TEMPO_MULTIPLIER = 0.93;
const COFFEE_CUP_FASTER_TEMPO_SUFFIX = ":cup-tempo=faster";
const COFFEE_CUP_SLOWER_TEMPO_SUFFIX = ":cup-tempo=slower";

function clampCoffeeCupProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function coffeeCupStableIndex(seed: string, modulo: number): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, modulo);
}

function coffeeCupStableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function coffeeCupSeedWithoutTempoRole(seed: string): string {
  if (seed.endsWith(COFFEE_CUP_FASTER_TEMPO_SUFFIX)) {
    return seed.slice(0, -COFFEE_CUP_FASTER_TEMPO_SUFFIX.length);
  }
  if (seed.endsWith(COFFEE_CUP_SLOWER_TEMPO_SUFFIX)) {
    return seed.slice(0, -COFFEE_CUP_SLOWER_TEMPO_SUFFIX.length);
  }
  return seed;
}

function coffeeCupTempoMultiplierForSeed(seed: string): number {
  if (seed.endsWith(COFFEE_CUP_FASTER_TEMPO_SUFFIX)) {
    return COFFEE_CUP_FASTER_TEMPO_MULTIPLIER;
  }
  if (seed.endsWith(COFFEE_CUP_SLOWER_TEMPO_SUFFIX)) {
    return COFFEE_CUP_SLOWER_TEMPO_MULTIPLIER;
  }
  return 1;
}

export function coffeeCupSeedWithTempoRole(
  seed: string,
  role: CoffeeCupTempoRole,
): string {
  const baseSeed = coffeeCupSeedWithoutTempoRole(seed);
  switch (role) {
    case "faster":
      return `${baseSeed}${COFFEE_CUP_FASTER_TEMPO_SUFFIX}`;
    case "slower":
      return `${baseSeed}${COFFEE_CUP_SLOWER_TEMPO_SUFFIX}`;
    case "normal":
      return baseSeed;
  }
}

export function coffeeCupTempoRoleForBot(args: {
  sessionSeed: string;
  botId: string;
  seatBotIds: readonly (string | null)[];
}): CoffeeCupTempoRole {
  const seenBotIds = new Set<string>();
  const activeBotIds: string[] = [];
  for (const rawBotId of args.seatBotIds) {
    const botId = rawBotId?.trim();
    if (!botId || seenBotIds.has(botId)) continue;
    seenBotIds.add(botId);
    activeBotIds.push(botId);
  }
  const botId = args.botId.trim();
  if (activeBotIds.length < 2 || !activeBotIds.includes(botId)) return "normal";

  const sessionSeed = args.sessionSeed.trim() || "coffee";
  const fasterIndex = coffeeCupStableIndex(
    `${sessionSeed}:cup-tempo:faster`,
    activeBotIds.length,
  );
  const slowerCandidateIndex = coffeeCupStableIndex(
    `${sessionSeed}:cup-tempo:slower`,
    activeBotIds.length - 1,
  );
  const slowerIndex =
    slowerCandidateIndex >= fasterIndex
      ? slowerCandidateIndex + 1
      : slowerCandidateIndex;

  if (activeBotIds[fasterIndex] === botId) return "faster";
  if (activeBotIds[slowerIndex] === botId) return "slower";
  return "normal";
}

export function coffeeCupSipBias(seed: string): number {
  return coffeeCupStableUnitValue(
    `${coffeeCupSeedWithoutTempoRole(seed)}:sip-bias`,
  );
}

export function coffeeCupSessionDurationPaceMultiplier(
  durationMinutes?: CoffeeSessionDurationMinutes | null,
): number {
  const minutes =
    typeof durationMinutes === "number" &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0
      ? durationMinutes
      : DEFAULT_COFFEE_SESSION_DURATION_MINUTES;
  const extraMinutes = Math.max(
    0,
    minutes - COFFEE_SESSION_DURATION_MINUTES_MIN,
  );
  return 1 + extraMinutes * 0.02;
}

export function coffeeCupSipMessageGapForDuration(
  durationMinutes?: CoffeeSessionDurationMinutes | null,
  baseGap = 5,
): number {
  const safeBaseGap =
    typeof baseGap === "number" && Number.isFinite(baseGap)
      ? Math.max(1, Math.floor(baseGap))
      : 5;
  return Math.max(
    safeBaseGap,
    Math.ceil(
      safeBaseGap * coffeeCupSessionDurationPaceMultiplier(durationMinutes),
    ),
  );
}

export function coffeeCupSipCycleMs(
  seed: string,
  durationMinutes?: CoffeeSessionDurationMinutes | null,
): number {
  const baseCycleMs = 34_000 - Math.round(coffeeCupSipBias(seed) * 15_000);
  return Math.round(
    (baseCycleMs * coffeeCupSessionDurationPaceMultiplier(durationMinutes)) /
      coffeeCupTempoMultiplierForSeed(seed),
  );
}

export function coffeeCupConsumptionRate(
  seed: string,
  durationMinutes?: CoffeeSessionDurationMinutes | null,
): number {
  const baseRate = 1.12 + coffeeCupSipBias(seed) * 0.58;
  return (
    (baseRate * coffeeCupTempoMultiplierForSeed(seed)) /
    coffeeCupSessionDurationPaceMultiplier(durationMinutes)
  );
}

export function coffeeCupPacedProgress(
  progress: number,
  seed: string,
  durationMinutes?: CoffeeSessionDurationMinutes | null,
  powerRateMultiplier = 1,
): number {
  const multiplier =
    Number.isFinite(powerRateMultiplier) && powerRateMultiplier >= 0
      ? Math.max(0, Math.min(3, powerRateMultiplier))
      : 1;
  return clampCoffeeCupProgress(
    progress * coffeeCupConsumptionRate(seed, durationMinutes) * multiplier,
  );
}

export function coffeeCupFillRatioForProgress(progress: number): number {
  return Math.max(0, 1 - clampCoffeeCupProgress(progress));
}

export function coffeeCupColdnessForProgress(progress: number): number {
  return clampCoffeeCupProgress(progress);
}

export function coffeeCupSipLikelihoodForProgress(progress: number): number {
  const clamped = clampCoffeeCupProgress(progress);
  if (clamped >= 0.96) return 0;
  const fillRatio = coffeeCupFillRatioForProgress(clamped);
  if (fillRatio <= 0.04) return 0;
  const fillFactor =
    fillRatio >= 0.18 ? 1 : Math.max(0, Math.min(1, (fillRatio - 0.04) / 0.14));
  const coldness = coffeeCupColdnessForProgress(clamped);
  const temperatureFactor =
    coldness >= 0.9 ? 0.18 : Math.max(0.18, 1 - Math.pow(coldness, 1.6) * 0.72);
  return Math.max(0, Math.min(1, fillFactor * temperatureFactor));
}

export function coffeeCupShouldFinishAfterSip(args: {
  seed: string;
  previousProgress: number;
  nextProgress?: number | null;
  sipCount?: number | null;
}): boolean {
  const previousProgress = clampCoffeeCupProgress(args.previousProgress);
  const nextProgress =
    typeof args.nextProgress === "number" && Number.isFinite(args.nextProgress)
      ? clampCoffeeCupProgress(args.nextProgress)
      : previousProgress;
  if (previousProgress >= 0.96 && nextProgress >= 0.96) return true;
  const nextColdness = coffeeCupColdnessForProgress(nextProgress);
  if (nextColdness < 0.9) return false;
  const wholeSipCount =
    typeof args.sipCount === "number" && Number.isFinite(args.sipCount)
      ? Math.max(1, Math.floor(args.sipCount))
      : 1;
  const coldFinishChance = Math.min(
    0.35,
    0.12 + Math.max(0, nextColdness - 0.9) * 2.3,
  );
  return (
    coffeeCupStableUnitValue(`${args.seed}:finish-after-sip:${wholeSipCount}`) <
    coldFinishChance
  );
}

export function coffeeCupFrameIndexForProgress(progress: number): number {
  const clamped = clampCoffeeCupProgress(progress);
  if (clamped >= 0.96) return 6;
  if (clamped >= 0.78) return 5;
  if (clamped >= 0.58) return 4;
  if (clamped >= 0.38) return 3;
  if (clamped >= 0.18) return 2;
  if (clamped >= 0.09) return 1;
  return 0;
}

export function coffeeCupTopOffProgressForFrameIndex(
  frameIndex: number,
): number {
  const frame = Math.max(0, Math.min(6, Math.round(frameIndex)));
  return COFFEE_CUP_TOP_OFF_PROGRESS_BY_FRAME_INDEX[frame]!;
}

export function coffeeCupStatusForProgress(
  progress: number,
  seed = "coffee",
): CoffeeCupStatus {
  const clamped = clampCoffeeCupProgress(progress);
  const frameIndex = coffeeCupFrameIndexForProgress(clamped);
  const fillRatio = coffeeCupFillRatioForProgress(clamped);
  const coldness = coffeeCupColdnessForProgress(clamped);
  const amount: CoffeeCupAmountStage =
    frameIndex === 0
      ? "full"
      : frameIndex <= 2
        ? "mostly-full"
        : frameIndex === 3
          ? "half"
          : frameIndex === 4
            ? "low"
            : frameIndex === 5
              ? "dregs"
              : "empty";
  const temperatureLabel =
    coldness < 0.18
      ? "hot"
      : coldness < 0.44
        ? "warm"
        : coldness < 0.7
          ? "cooling"
          : coldness < 0.9
            ? "lukewarm"
            : "cold";
  const tasteLabel =
    COFFEE_CUP_TASTE_LABELS[
    coffeeCupStableIndex(seed, COFFEE_CUP_TASTE_LABELS.length)
  ]!;
  return {
    progress: clamped,
    frameIndex,
    amount,
    fillRatio,
    coldness,
    amountLabel: COFFEE_CUP_AMOUNT_LABELS[amount],
    temperatureLabel,
    tasteLabel,
  };
}

export function coffeeCupStatusForFillAndTemperatureProgress(
  fillProgress: number,
  temperatureProgress: number,
  seed = "coffee",
): CoffeeCupStatus {
  const fillStatus = coffeeCupStatusForProgress(fillProgress, seed);
  const temperatureStatus = coffeeCupStatusForProgress(
    temperatureProgress,
    seed,
  );
  return {
    ...fillStatus,
    coldness: temperatureStatus.coldness,
    temperatureLabel: temperatureStatus.temperatureLabel,
  };
}

export function coffeeCupProgressFromSessionTiming(args: {
  sessionRemainingMs?: number | null;
  durationMinutes?: CoffeeSessionDurationMinutes | null;
}): number | null {
  const remainingMs = args.sessionRemainingMs;
  if (typeof remainingMs !== "number" || !Number.isFinite(remainingMs))
    return null;
  const durationMinutes =
    typeof args.durationMinutes === "number" &&
    Number.isFinite(args.durationMinutes) &&
    args.durationMinutes > 0
      ? args.durationMinutes
      : DEFAULT_COFFEE_SESSION_DURATION_MINUTES;
  const durationMs = durationMinutes * 60 * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return clampCoffeeCupProgress(1 - Math.max(0, remainingMs) / durationMs);
}

function coffeeCupTopOffConsumptionDurationMs(
  durationMinutes?: CoffeeSessionDurationMinutes | null,
): number {
  const minutes =
    typeof durationMinutes === "number" &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0
      ? durationMinutes
      : DEFAULT_COFFEE_SESSION_DURATION_MINUTES;
  const durationMs = minutes * 60 * 1000;
  return Number.isFinite(durationMs) && durationMs > 0
    ? durationMs
    : DEFAULT_COFFEE_SESSION_DURATION_MINUTES * 60 * 1000;
}

export function coffeeCupCanTopOff(progress: number): boolean {
  return (
    coffeeCupFrameIndexForProgress(progress) > 0 &&
    clampCoffeeCupProgress(progress) >= COFFEE_CUP_TOP_OFF_MIN_ELIGIBLE_PROGRESS
  );
}

export function coffeeCupTopOffSnapshotForProgress(
  progress: number,
  toppedOffAt: string,
  targetProgressAfter?: number | null,
): CoffeeCupTopOffSnapshot | null {
  const progressBefore = clampCoffeeCupProgress(progress);
  if (!coffeeCupCanTopOff(progressBefore)) return null;
  const requestedProgressAfter =
    typeof targetProgressAfter === "number" &&
    Number.isFinite(targetProgressAfter)
      ? clampCoffeeCupProgress(targetProgressAfter)
      : COFFEE_CUP_TOP_OFF_TARGET_PROGRESS;
  const progressAfter = Math.min(progressBefore, requestedProgressAfter);
  if (progressAfter >= progressBefore) return null;
  return {
    progressBefore,
    progressAfter,
    toppedOffAt,
  };
}

export function coffeeCupProgressAfterTopOff(args: {
  progress: number;
  topOff?: CoffeeCupTopOffSnapshot | null;
  nowMs: number;
  durationMinutes?: CoffeeSessionDurationMinutes | null;
  seed?: string | null;
  lowerProgressMeansConsumption?: boolean | null;
}): number {
  const progress = clampCoffeeCupProgress(args.progress);
  const topOff = args.topOff;
  if (!topOff) return progress;
  const toppedOffAtMs = Date.parse(topOff.toppedOffAt);
  if (!Number.isFinite(toppedOffAtMs)) return progress;
  if (!Number.isFinite(args.nowMs) || args.nowMs < toppedOffAtMs)
    return progress;
  const progressBefore = clampCoffeeCupProgress(topOff.progressBefore);
  const progressAfter = clampCoffeeCupProgress(topOff.progressAfter);
  if (progressBefore <= progressAfter || progress <= progressAfter)
    return progress;
  const elapsedMs = Math.max(0, args.nowMs - toppedOffAtMs);
  const consumptionDurationMs = coffeeCupTopOffConsumptionDurationMs(
    args.durationMinutes,
  );
  const tempoRate =
    typeof args.seed === "string" && args.seed.trim().length > 0
      ? coffeeCupConsumptionRate(args.seed, args.durationMinutes)
      : 1;
  const timedConsumedProgress = Math.max(
    0,
    Math.min(1, (elapsedMs / consumptionDurationMs) * tempoRate),
  );
  const explicitConsumedProgress =
    args.lowerProgressMeansConsumption === true
      ? Math.max(0, progress - progressAfter)
      : 0;
  const topOffProgress = clampCoffeeCupProgress(
    progressAfter + Math.max(timedConsumedProgress, explicitConsumedProgress),
  );
  return Math.min(progress, topOffProgress);
}

export const COFFEE_EMPTY_CUP_PROGRESS = 0.96;
export const COFFEE_EMPTY_CUP_ATTEMPT_ANIMATION_MS = 3_200;
export const COFFEE_EMPTY_CUP_ATTEMPT_WINDOW_MS = 5_200;

export interface CoffeeEmptyCupAttemptState {
  fillId: string;
  fillStartedAtMs: number;
  emptyAtMs: number;
  maxAttempts: 2 | 3;
  attemptStartedAtMs: number[];
  attemptRealizedAtMs: number[];
  startedAttemptCount: number;
  realizedAttemptCount: number;
  activeAttemptNumber: number | null;
  activeAttemptProgress: number;
  frowning: boolean;
  gaveUp: boolean;
}

function coffeeEmptyCupAttemptGapMs(
  durationMs: number,
  seed: string,
  attemptNumber: number,
): number {
  const firstAttempt = attemptNumber === 1;
  const minFraction = firstAttempt ? 0.025 : attemptNumber === 2 ? 0.04 : 0.05;
  const spreadFraction = firstAttempt ? 0.02 : 0.03;
  const minimumMs = firstAttempt ? 5_000 : 7_500;
  return Math.max(
    minimumMs,
    Math.round(
      durationMs *
        (minFraction +
          coffeeCupStableUnitValue(`${seed}:empty-attempt-gap:${attemptNumber}`) *
            spreadFraction),
    ),
  );
}

/**
 * Deterministic empty-mug behavior shared by Coffee's live renderer and server.
 * A refill starts a fresh 2-3-attempt arc; pauses remain aligned through the
 * caller's sessionRemainingMs snapshot.
 */
export function coffeeEmptyCupAttemptState(args: {
  seed: string;
  nowMs: number;
  sessionStartedAtMs?: number | null;
  sessionRemainingMs?: number | null;
  durationMinutes?: CoffeeSessionDurationMinutes | null;
  topOff?: CoffeeCupTopOffSnapshot | null;
  powerRateMultiplier?: number;
}): CoffeeEmptyCupAttemptState | null {
  if (!Number.isFinite(args.nowMs)) return null;
  const durationMinutes =
    typeof args.durationMinutes === "number" &&
    Number.isFinite(args.durationMinutes) &&
    args.durationMinutes > 0
      ? args.durationMinutes
      : DEFAULT_COFFEE_SESSION_DURATION_MINUTES;
  const durationMs = durationMinutes * 60 * 1_000;
  const rateMultiplier =
    typeof args.powerRateMultiplier === "number" &&
    Number.isFinite(args.powerRateMultiplier)
      ? Math.max(0, Math.min(3, args.powerRateMultiplier))
      : 1;
  const consumptionRate =
    coffeeCupConsumptionRate(args.seed, durationMinutes) * rateMultiplier;
  if (consumptionRate <= 0) return null;

  const remainingMs =
    typeof args.sessionRemainingMs === "number" &&
    Number.isFinite(args.sessionRemainingMs)
      ? Math.max(0, Math.min(durationMs, args.sessionRemainingMs))
      : null;
  const sessionStartedAtMs =
    remainingMs !== null
      ? args.nowMs - (durationMs - remainingMs)
      : typeof args.sessionStartedAtMs === "number" &&
          Number.isFinite(args.sessionStartedAtMs)
        ? args.sessionStartedAtMs
        : null;
  if (sessionStartedAtMs === null) return null;

  const toppedOffAtMs = args.topOff ? Date.parse(args.topOff.toppedOffAt) : Number.NaN;
  const usesTopOff =
    args.topOff != null &&
    Number.isFinite(toppedOffAtMs) &&
    toppedOffAtMs >= sessionStartedAtMs &&
    toppedOffAtMs <= args.nowMs;
  const fillStartedAtMs = usesTopOff ? toppedOffAtMs : sessionStartedAtMs;
  const fillStartProgress = usesTopOff
    ? clampCoffeeCupProgress(args.topOff?.progressAfter ?? 0)
    : 0;
  const fillId = usesTopOff ? `topoff:${args.topOff!.toppedOffAt}` : "session";
  const emptyAtMs =
    fillStartedAtMs +
    (Math.max(0, COFFEE_EMPTY_CUP_PROGRESS - fillStartProgress) /
      consumptionRate) *
      durationMs;
  const desiredMaxAttempts: 2 | 3 =
    coffeeCupStableUnitValue(`${args.seed}:${fillId}:empty-attempt-count`) < 0.5
      ? 2
      : 3;
  const attemptStartedAtMs: number[] = [];
  let nextAttemptAtMs = emptyAtMs;
  for (
    let attemptNumber = 1;
    attemptNumber <= desiredMaxAttempts;
    attemptNumber += 1
  ) {
    nextAttemptAtMs += coffeeEmptyCupAttemptGapMs(
      durationMs,
      `${args.seed}:${fillId}`,
      attemptNumber,
    );
    attemptStartedAtMs.push(nextAttemptAtMs);
  }
  const realizationOffsetMs = Math.round(
    COFFEE_EMPTY_CUP_ATTEMPT_ANIMATION_MS * 0.38,
  );
  const attemptRealizedAtMs = attemptStartedAtMs.map(
    (startedAtMs) => startedAtMs + realizationOffsetMs,
  );
  const sessionEndsAtMs = sessionStartedAtMs + durationMs;
  const maxAttempts: 2 | 3 =
    desiredMaxAttempts === 3 && attemptRealizedAtMs[2]! <= sessionEndsAtMs
      ? 3
      : 2;
  attemptStartedAtMs.splice(maxAttempts);
  attemptRealizedAtMs.splice(maxAttempts);
  const startedAttemptCount = attemptStartedAtMs.filter(
    (startedAtMs) => startedAtMs <= args.nowMs,
  ).length;
  const realizedAttemptCount = attemptRealizedAtMs.filter(
    (realizedAtMs) => realizedAtMs <= args.nowMs,
  ).length;
  let activeAttemptNumber: number | null = null;
  let activeAttemptProgress = 0;
  for (let index = attemptStartedAtMs.length - 1; index >= 0; index -= 1) {
    const startedAtMs = attemptStartedAtMs[index]!;
    const ageMs = args.nowMs - startedAtMs;
    if (ageMs < 0 || ageMs > COFFEE_EMPTY_CUP_ATTEMPT_WINDOW_MS) continue;
    activeAttemptNumber = index + 1;
    activeAttemptProgress = Math.max(
      0,
      Math.min(1, ageMs / COFFEE_EMPTY_CUP_ATTEMPT_ANIMATION_MS),
    );
    break;
  }

  return {
    fillId,
    fillStartedAtMs,
    emptyAtMs,
    maxAttempts,
    attemptStartedAtMs,
    attemptRealizedAtMs,
    startedAttemptCount,
    realizedAttemptCount,
    activeAttemptNumber,
    activeAttemptProgress,
    frowning:
      activeAttemptNumber !== null && activeAttemptProgress >= 0.38,
    gaveUp: realizedAttemptCount >= maxAttempts,
  };
}

export function coffeeCupPromptCueForStatus(status: CoffeeCupStatus): string {
  const base = `Your coffee is ${status.amountLabel}, ${status.temperatureLabel}, and tastes ${status.tasteLabel}.`;
  if (status.amount === "empty" || status.fillRatio <= 0.04) {
    return `${base} The mug is empty; do not describe sipping it, steam, heat, or fresh coffee.`;
  }
  if (status.temperatureLabel === "cold" || status.coldness >= 0.9) {
    return `${base} It is cold now; do not describe steam, heat, or a hot sip. You may ignore it, push it aside, or reluctantly take/finish a sip if that fits the moment, but do not force a coffee comment every turn.`;
  }
  if (status.fillRatio <= 0.12) {
    return `${base} Only a little remains, so do not describe visible steam. You may naturally reference the last dregs or a final sip when that fits the moment, but do not force a coffee comment every turn.`;
  }
  return `${base} You may naturally reference sipping it, the amount left, its temperature, or its taste when that fits the moment, but do not force a coffee comment every turn.`;
}
/** Bots may hold their Coffee poll vote until this close to session end. */
export const COFFEE_POLL_FINALIZE_REMAINING_MS = 30_000;
/** Minimum answer choices when the player starts a Coffee poll. */
export const COFFEE_POLL_OPTION_COUNT_MIN = 2;
/** Maximum answer choices when the player starts a Coffee poll. */
export const COFFEE_POLL_OPTION_COUNT_MAX = 4;

export type CoffeePresetMode = "manual" | "auto";

/** How new Coffee Sessions pick a table topic for a saved Coffee Group. */
export type CoffeeTopicSelectionMode = "manual" | "auto";

/** Maximum length for a persisted Coffee session topic. */
export const COFFEE_TOPIC_MAX_LENGTH = 500;

/** Legacy Coffee Group starter topics keyed by bot id. */
export type CoffeeGroupStarterTopicsByBotId = Record<string, string[]>;

export interface CoffeePreset {
  id: string;
  name: string;
  settings: CoffeeSessionSettings;
  builtIn: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CoffeeGroupEvent {
  id: string;
  groupId: string;
  type:
    | "created"
    | "renamed"
    | "settings_updated"
    | "roster_updated"
    | "session_created"
    | "model_choice_updated"
    | "synthesis_updated";
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * Per-Coffee-Group model picker memory. Keys are provider ids; values are
 * Auto picker model ids (e.g. `"llama3.2"`, `"gpt-5.1"`). Missing or empty
 * keys mean "Auto" / fall back to per-bot defaults.
 */
export interface CoffeeGroupModelChoice {
  local?: string;
  openai?: string;
  anthropic?: string;
}

/** Maximum length of the editable one-sentence Coffee Group ethos. */
export const COFFEE_GROUP_ETHOS_MAX_LENGTH = 280;

/** Independently retryable identity items synthesized for a Coffee Group. */
export type CoffeeGroupSynthesisItem = "name" | "ethos" | "atmosphere";

/** Durable lifecycle state for one Coffee Group synthesis item. */
export type CoffeeGroupSynthesisStatus =
  | "pending"
  | "running"
  | "ready"
  | "failed";

/** How the currently persisted value for a synthesis item was produced. */
export type CoffeeGroupSynthesisSource =
  | "generated"
  | "manual"
  | "fallback";

/** Durable state for one independently retryable Coffee Group identity item. */
export interface CoffeeGroupSynthesisItemState {
  status: CoffeeGroupSynthesisStatus;
  revision: number;
  updatedAt: string;
  source?: CoffeeGroupSynthesisSource;
  error?: string;
}

/** Extensible manifest for Coffee Group identity synthesis. */
export interface CoffeeGroupSynthesisState {
  version: 1;
  items: Record<CoffeeGroupSynthesisItem, CoffeeGroupSynthesisItemState>;
}

/** Generated, character-free café background attached to a Coffee Group. */
export interface CoffeeGroupAtmosphere {
  imageId: string;
  prompt?: string;
  revision: number;
  updatedAt: string;
}

export type CoffeeGroupSoundtrackStatus =
  | "preparing"
  | "generating"
  | "ready"
  | "failed"
  | "unavailable";

/** Public metadata for the cached, group-owned Coffee music bed. Audio is served separately. */
export interface CoffeeGroupSoundtrack {
  status: CoffeeGroupSoundtrackStatus;
  generating: boolean;
  provider: "elevenlabs" | null;
  model: string | null;
  prompt: string | null;
  contentType: string | null;
  durationMs: number | null;
  revision: number;
  /** True when the immediately previous generated bed can replace the current one. */
  undoAvailable: boolean;
  updatedAt: string;
  error?: string;
}

export interface CoffeeGroup {
  id: string;
  userId: string;
  name: string;
  /** Soft table premise: why these bots choose to gather. */
  ethos: string;
  /** Character-free café artwork composited behind the Coffee table. */
  atmosphere: CoffeeGroupAtmosphere | null;
  /** Original instrumental group bed; bundled Coffee Jazz remains its fallback. */
  soundtrack: CoffeeGroupSoundtrack | null;
  /** Independent completion and retry state for generated identity items. */
  synthesis: CoffeeGroupSynthesisState;
  /** Library group that owns this table's live invite pool; null for legacy tables. */
  libraryGroupId: string | null;
  /** The selected source was later removed from Library; saved legacy seats remain readable. */
  libraryGroupUnavailable?: boolean;
  botGroupIds: string[];
  coffeeSeatBotIds: Array<string | null>;
  coffeeSettings: CoffeeSessionSettings;
  presetMode: CoffeePresetMode;
  /** When `auto`, new group sessions pick a random generated topic server-side. */
  topicSelectionMode?: CoffeeTopicSelectionMode;
  /** Server-persisted Coffee model picker per provider. Empty = Auto. */
  modelChoiceByProvider?: CoffeeGroupModelChoice;
  /** Canonical Coffee-only prompts generated once for this group composition. */
  starterTopics?: string[];
  /** Legacy import/backup shape. New writes use `starterTopics`. */
  starterTopicsByBotId?: CoffeeGroupStarterTopicsByBotId;
  moodSummary?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export {
  COFFEE_HISTORY_WINDOW_HARD_CAP,
  COFFEE_BAR_ORDER_MAX_LENGTH,
  COFFEE_SPEAKER_REPLY_MAX_OUTPUT_TOKENS_HARD,
  COFFEE_TABLE_MOOD_PRESETS,
  COFFEE_TABLE_REPLY_MAX_CHARS_HARD,
  DEFAULT_COFFEE_SESSION_SETTINGS,
  applyCoffeeTableMood,
  coffeeTableMoodForSettings,
  coffeeEffectiveHistoryLimit,
  coffeeEffectiveMemoryCallbacks,
  coffeeFarewellReplyDelay,
  coffeeReusableSessionSettings,
  coffeeReplyLengthCaps,
  coffeeRouterTailMessageCount,
  coffeeRouterTemperature,
  isCoffeeExperienceMode,
  normalizeCoffeeSessionSettings,
  type CoffeeCrossTalkLevel,
  type CoffeeBarDeliveryStatus,
  type CoffeeBarDrink,
  type CoffeeBarDrinkReactionStatus,
  type CoffeeBarGeneratedDrink,
  type CoffeeBarOrderChoice,
  type CoffeeBarOrderStatus,
  type CoffeeBarRole,
  type CoffeeBarRitualState,
  type CoffeeBarServiceBotSnapshot,
  type CoffeeBarSpecialImageStatus,
  type CoffeeFarewellFuseKind,
  type CoffeeFarewellFuseState,
  type CoffeeExperienceMode,
  type CoffeeMemoryCallbacks,
  type CoffeeResponseLengthPreset,
  type CoffeeSessionSettings,
  type CoffeeServeThanks,
  type CoffeePlayerCupState,
  type CoffeeWaiterOfferState,
  type CoffeeBotWaiterVisitState,
  type CoffeeTableEnergy,
} from "./coffeeSettings.js";

export {
  coffeeInterruptionFloorOutcome,
  coffeeInterruptionReactionCandidates,
  coffeeInterruptionTranscriptSegments,
  pickCoffeeInterruptionReaction,
  type CoffeeInterruptionTranscriptSegment,
  type CoffeeInterruptionTranscriptSegmentKind,
  type CoffeeReactionOutcome,
  type CoffeeReactionStyle,
  type CoffeeReactionTone,
} from "./coffeeInterruptionReactions.js";

export type ConversationHistoryContextKind =
  | "prism_home"
  | "persona_home"
  | "side_chat"
  | "coffee_session"
  | "coffee_group"
  | "sandbox"
  | "legacy";

export type ConversationHistoryOriginKind =
  "relationship" | "fork" | "saved_group" | "coffee" | "sandbox" | "legacy";

/**
 * Stable navigation metadata for one saved conversation episode.
 *
 * `contextKey` and `ownerBotId` describe where the episode belongs; neither
 * changes when another persona is invited or speaks. `episodeId` is the saved
 * conversation row, while `continuationConversationId` identifies the episode
 * that should resume when the relationship Home is visited.
 */
export interface ConversationHistoryEntry {
  contextKey: string;
  contextKind: ConversationHistoryContextKind;
  conversationId: string;
  rootConversationId: string;
  episodeId: string;
  ownerBotId: string | null;
  origin: {
    kind: ConversationHistoryOriginKind;
    id: string | null;
  };
  participantBotIds: string[];
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  continuationConversationId: string | null;
  nativeRoute: {
    view: "chat" | "coffee" | "sandbox";
    conversationId: string;
    botId?: string | null;
    coffeeGroupId?: string | null;
  };
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  /** Owning surface for this conversation row. */
  mode?: ChatMode;
  /**
   * Bot the conversation is locked to. Chosen at chat start (Chat mode
   * empty-state picker or Sandbox bot picker) and frozen for the whole
   * conversation — the same bot drives every assistant reply and
   * supplies the shell accent color when the chat is open. `null` means
   * the default grayscale persona (no color wheel, brand mark only).
   *
   * Coffee mode leaves this null and uses {@link botGroupIds} instead.
   */
  botId: string | null;
  /** Hub metadata for unified Chat. Hub rows are canonical timelines; side rows fork from a Hub. */
  hubRole?: "hub" | "side";
  /** Bot that owns this Hub group. Null means the PRISM Hub. */
  hubBotId?: string | null;
  /** Parent Hub conversation for side chats. Null/omitted for Hub roots. */
  parentHubId?: string | null;
  /** Stable History ownership/navigation metadata. Older clients may ignore it. */
  history?: ConversationHistoryEntry;
  /**
   * Coffee-only — ordered list of bot ids that participate in this live
   * session. New sessions seat at most 4; legacy snapshots may contain 2-5.
   * Captured once when the Coffee thread is created and
   * frozen for the conversation. The router LLM picks which one of these
   * speaks next on each turn.
   * Always undefined for `chat` and `sandbox` mode rows.
   */
  botGroupIds?: string[];
  /** Coffee-only durable lifecycle. Closing and complete sessions reject new work. */
  coffeeSessionState?: CoffeeSessionLifecycleState;
  /** Coffee-only — durable parent group for recurring table sessions. */
  coffeeGroupId?: string | null;
  /**
   * Coffee-only — fixed five-seat table layout. Entries are bot ids or null
   * for an empty chair. This preserves visual seat placement separately from
   * the compact participant list above.
   */
  coffeeSeatBotIds?: Array<string | null>;
  /**
   * Coffee-only — bot ids from the parent Coffee Group that were invited but
   * marked away for this specific session.
   */
  coffeeAbsentBotIds?: string[];
  /** Live observer projection for each frozen Coffee participant. */
  coffeeObserverProjectionByBotId?: Record<string, BotPowerObserverProjectionV1>;
  /**
   * Coffee-only hidden social values keyed by bot id for this conversation.
   * This is primarily consumed by dev diagnostics and prompt shaping.
   */
  coffeeBotSocialById?: Record<string, CoffeeBotSocialSnapshot>;
  /**
   * Coffee-only physical cup top-offs keyed by bot id for this conversation.
   * A top-off refills/reheats the visible cup and can shape later prompt cues.
   */
  coffeeCupTopOffsByBotId?: Record<string, CoffeeCupTopOffSnapshot>;
  /**
   * Normalized Prism mood/relationship state for this conversation surface.
   * Coffee adapts its per-seat social state into this shape; Zen persists it
   * directly so developer diagnostics and prompt shaping share one vocabulary.
   */
  prismMood?: PrismMoodSnapshot;
  /**
   * Coffee-only — table feel / reply length / focus knobs for this session.
   * Omitted for non-coffee rows.
   */
  coffeeSettings?: CoffeeSessionSettings;
  /** Coffee-only — selected timed session duration, once group sessions own starts. */
  /** Null means Auto/open-ended with no countdown. */
  coffeeSessionDurationMinutes?: CoffeeSessionDurationMinutes | null;
  /** Coffee-only — shared anchor topic for this session (null until chosen). */
  coffeeTopic?: string | null;
  /** Coffee-only — optional team-mode social state for this timed session. */
  coffeeTeams?: CoffeeTeamState | null;
  /**
   * Private chat marker — once `true`, accent styling is suppressed to
   * grayscale, the thread stays client-held, and nothing is written to
   * conversation history, the cross-thread `memories` table, or the Qdrant
   * summary index. Provider selection remains a separate user choice.
   */
  incognito: boolean;
  /**
   * Bot id of the MOST RECENT assistant message (regardless of whether
   * that message carries a bot_id). In Chat mode this always matches
   * `botId` once the first reply lands. In Sandbox mode the user can
   * switch bots per-send, so this can drift from `botId` across the
   * thread. Null in two distinct cases:
   *   - The last assistant message was sent under "Default" (no bot).
   *   - No assistant message exists yet.
   * `hasAssistantReply` disambiguates those two — use it alongside
   * `lastBotId` to tell "Default was last" from "no reply yet".
   */
  lastBotId: string | null;
  /**
   * Denormalized color of `lastBotId`'s bot row at the time the server
   * responded. Lets the sidebar tint each conversation row by "whoever
   * last spoke" without the client needing the full bots list —
   * important for Chat mode where bots may have been deleted but still
   * spoke in past conversations. Null when lastBotId is null (Default
   * spoke OR no reply yet).
   */
  lastBotColor: string | null;
  /**
   * Whether the conversation has at least one assistant message.
   * Present so the client can distinguish "Default bot spoke last"
   * (hasAssistantReply=true, lastBotId=null) from "no reply yet"
   * (hasAssistantReply=false, lastBotId=null). The two cases want
   * different visual treatment on the sidebar: Default-last renders the
   * row WHITE, no-reply-yet falls back to the locked bot's color.
   */
  hasAssistantReply: boolean;
  /** Zen-only generated ambient wallpaper metadata. */
  zenWallpaper?: {
    enabled: boolean;
    imageId: string | null;
    promptSeed: string | null;
    generationMessageCount: number | null;
    status: "idle" | "generating" | "ready" | "error";
    history: Array<{
      imageId: string;
      promptSeed: string | null;
      generationMessageCount: number;
      revealStartMessageCount?: number;
      revealFullMessageCount?: number;
      createdAt?: string;
    }>;
  };
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface UserMemory {
  id: string;
  userId: string;
  conversationId?: string;
  botId?: string;
  /** Directed peer scope for bot-to-bot observations and opinions. */
  targetBotId?: string;
  createdAt: string;
  /** Effective confidence after short-term decay. */
  confidence: number;
  /** Confidence at acquisition or the most recent reinforcement. */
  baseConfidence?: number;
  /** Explicit lifecycle; inferred opinions always use `derived`. */
  lifecycle?: MemoryLifecycle;
  /** Last acquisition/reinforcement point used by daily decay. */
  lastReinforcedAt?: string;
  /** Current projected expiry for short-term memories. */
  expiresAt?: string;
  /** Direct memory records supporting a derived opinion. */
  evidenceMemoryIds?: string[];
  /** What this memory is about, used for memory-panel organization. */
  category?: MemoryCategory;
  /** Short-term memories can be rewritten/removed; long-term memories must be demoted first. */
  tier?: MemoryTier;
  /** Origin of this memory item. */
  source?: "direct" | "inferred" | "compiled" | "about_you";
  /** Separate certainty channel for inferred/compiled assumptions. */
  certainty?: number;
  /** How likely this memory is to remain useful across future chats. */
  durability?: number;
  /** Message ids this memory was derived from, used for edit/revert cleanup. */
  sourceMessageIds?: string[];
  text: string;
}

export type MemoryCategory = "general" | "user" | "bot_relation";
export type MemoryTier = "short_term" | "long_term";
export type MemoryLifecycle = MemoryTier | "derived";
export type MemoryAcquisitionSensitivity = "cautious" | "balanced" | "curious";

export interface MemoryEcologySettings {
  learnAboutPlayer: boolean;
  learnAboutBots: boolean;
  acquisitionSensitivity: MemoryAcquisitionSensitivity;
  shortTermRetentionDays: number;
  longTermPromotionThreshold: number;
  inferredMinEvidenceCount: number;
  inferredConfidenceThreshold: number;
}

export type MemoryAcquisitionReceiptKind = "player_memory" | "bot_relation";

export interface MemoryAcquisitionReceipt {
  id: string;
  memoryId: string;
  learnerBotId: string | null;
  targetBotId: string | null;
  conversationId: string | null;
  kind: MemoryAcquisitionReceiptKind;
  createdAt: string;
  readAt: string | null;
  memory?: UserMemory;
}

export interface ZenSessionMemoryItem {
  id: string;
  conversationId?: string;
  botId?: string | null;
  title: string;
  text: string;
  trigger?: string;
  sourceMessageIds?: string[];
  createdAt: string;
  expiresAt: string;
}

export interface ZenPreviousContextSummary {
  conversationId: string;
  title: string;
  summary: string;
  internalSummary?: string;
  updatedAt: string;
}

export interface ZenSessionMemoryOverview {
  previousContext: ZenPreviousContextSummary | null;
  sessionMemories: ZenSessionMemoryItem[];
}

export {
  REQUIRED_LOCAL_MODELS,
  REQUIRED_PRIMARY_LOCAL_MODEL_ID,
  AUTO_MODEL_ROUTING_POLICY_VERSION,
  DISABLED_MODEL_CHOICE,
  MODEL_VISIBILITY_DEFAULTS_VERSION,
  ONLINE_AUTO_PROVIDER_BIAS_DEFAULT,
  ONLINE_AUTO_PROVIDER_BIAS_MAX,
  ONLINE_AUTO_PROVIDER_BIAS_MIN,
  ONLINE_AUTO_PROVIDER_BIAS_WEIGHT,
  ONLINE_AUTO_PROVIDER_WEIGHTS_VERSION,
  BALANCED_ONLINE_AUTO_PROVIDER_WEIGHTS,
  DEFAULT_ONLINE_AUTO_QUALITY_POSTURE,
  clampOnlineAutoProviderBias,
  formatOnlineAutoProviderBiasLabel,
  formatOnlineAutoQualityPostureLabel,
  normalizeOnlineAutoProviderWeights,
  normalizeOnlineAutoQualityPosture,
  parseStoredOnlineAutoProviderWeights,
  serializeOnlineAutoProviderWeights,
  formatOnlineAutoProviderWeightsLabel,
  defaultHiddenModelIdsForCatalog,
  isCommonOnlineChatModel,
  isDisabledModelChoice,
  normalizeAutoRouteDecisionV1,
  reconcileHiddenModelIdsForCatalog,
  sanitizeHiddenModelIds,
  resolveAutoModel,
  type AutoModelProvider,
  type OnlineAutoProviderId,
  type OnlineAutoQualityPosture,
  type OnlineAutoProviderWeightsV1,
  type AutoModelPriceV1,
  type AutoRouteDecisionV1,
  type AutoRouteReasonCode,
  type AutoRoutingContextV1,
  type CatalogShapeForAuto,
  type ModelForDefaultVisibility,
  type ResolveAutoModelInput,
  type ResolvedAutoModel,
  type ModelSelectionV1,
  type ResponseLane,
} from "./modelRouting.js";

export {
  LONG_TERM_HIGH_TRUTH_SCORE,
  LONG_TERM_MEMORY_SCORE,
  LONG_TERM_MIN_DURABILITY_FOR_HIGH_TRUTH,
  classifyMemoryCategoryFromText,
  memoryLongTermScore,
  memoryQualifiesLongTerm,
  memoryTruthScore,
  type MemorySource,
} from "./memoryClassification.js";

export type MemoryValidationStatus = "approved" | "auto_fixed";

export type MemoryValidationReasonCode =
  | "subject_role_confusion"
  | "assistant_identity_instruction"
  | "task_request_not_memory"
  | "question_fragment"
  | "trailing_conversation_tag"
  | "lost_preference_payload"
  | "figurative_preference"
  | "implausible_literal"
  | "joke_without_stable_signal"
  | "contradiction"
  | "unsafe_judgment"
  | "low_confidence"
  | "malformed_text"
  | "validator_error";

export interface MemoryValidationEvent {
  validationStatus?: MemoryValidationStatus;
  originalText?: string;
  reasonCodes?: MemoryValidationReasonCode[];
}

/**
 * Post-auth surface the user is chatting from.
 *
 * - `"zen"`: PRISM's own lane. It may use an optional Facet bot for a turn,
 *   but the conversation remains PRISM-owned rather than bot-locked.
 * - `"chat"`: bot-locked persona conversation. Requires a concrete `botId`
 *   and keeps memory scoped to that bot.
 * - `"sandbox"`: the full command-center. Cross-session memory is disabled
 *   entirely here — the rolling message window IS the thread's memory. The
 *   `incognito` flag is ignored for Sandbox requests.
 * - `"coffee"`: timed live conversation for up to 3 reactive bots drawn from
 *   a saved group. User turns and
 *   autonomous timed turns trigger a router LLM pick (which bot speaks next
 *   based on personality + context), then that bot replies through the Coffee
 *   pipeline. Memory is thread-scoped only in the first pass.
 *
 * Defaults to `"sandbox"` on the server when omitted, so pre-`mode` clients
 * keep the previous cross-session memory behavior.
 */
export type ChatMode = "zen" | "chat" | "sandbox" | "coffee";

/**
 * Companion-only preferences. These are intentionally "feel" controls, while
 * an explicit model picker choice may still override the bot/account default.
 */
export interface ChatCompanionPreferences {
  /** Optional tone cue for the single companion persona. */
  tone?: "grounded" | "warm" | "reflective";
  /** Optional ritual cue used by lightweight Chat check-in UI. */
  ritual?: "none" | "daily-check-in" | "weekly-reflection";
}

/**
 * Advanced runtime controls. Sandbox uses the full set; Chat may honor the
 * explicit model choice while keeping the rest of the companion contract stable.
 */
export interface SandboxRuntimeControls {
  preferredProvider?: LlmProviderName;
  modelOverride?: string;
  botId?: string | null;
}

export type ChatManualToolRequest =
  | { name: "webSearch"; query?: string }
  | { name: "imageGen"; prompt?: string }
  | { name: "askQuestion"; question?: string; options?: string[] };

export interface ChatRequestPayload {
  conversationId?: string;
  /** When true, bypass "reuse latest chat" and start a fresh conversation row. */
  forceNewConversation?: boolean;
  message: string;
  /** Resolved rendered app theme for theme-conditional Powers this turn. */
  theme?: "light" | "dark";
  starterPrompt?: boolean;
  mode?: ChatMode;
  /** Companion-only optional preferences (used only when mode === "zen"). */
  companionPreferences?: ChatCompanionPreferences;
  /** Advanced controls for runtime routing. */
  sandboxControls?: SandboxRuntimeControls;
  /** Back-compat top-level routing knobs. Chat honors explicit modelOverride only. */
  preferredProvider?: LlmProviderName;
  modelOverride?: string;
  /** Request-only native Max overdrive for an explicitly selected compatible model. */
  reasoningEffort?: MaxReasoningEffort;
  /**
   * Chat/Sandbox bot selector. In Zen this is a backwards-compatible fallback
   * for `facetBotId`.
   */
  botId?: string | null;
  /** Preferred Zen Facet selector. Keeps the conversation row bot_id NULL. */
  facetBotId?: string | null;
  /** When true in Zen/Chat, keep this turn client-held and skip memory/persistence. */
  incognito?: boolean;
  /** Zen-only automatic Facet handoff turn. */
  facetTransition?: ZenPersonaTransitionInput;
  /** Backwards-compatible name for Zen Facet handoff. */
  personaTransition?: ZenPersonaTransitionInput;
  /** Zen-only idle autonomy check/turn. */
  zenAutonomy?: ZenAutonomyInput;
  /** Zen-only assistant follow-up when an AskQuestion patience timer expires. */
  zenAskQuestionPatience?: ZenAskQuestionPatienceInput;
  /** Chat/Zen assistant-only reaction after the player presses Shh. */
  assistantInterruptionReaction?: AssistantInterruptionReactionInput;
  /**
   * Client-held prior messages for an incognito chat. The server uses this as
   * prompt context only; private turns are never read from or written to
   * persisted conversation/message storage.
   */
  ephemeralMessages?: ChatMessage[];
  /** Optional signal to trigger end-of-session rolling compaction. */
  sessionEnding?: boolean;
  /** Zen-only one-turn cue that the next user message should pivot away from the prior topic. */
  topicReset?: boolean;
  /** Optional metadata when the latest Zen send interrupted Prism. */
  prismInterruption?: PrismMoodInterruptionInput;
  /** Explicit user-selected composer tool. */
  manualTool?: ChatManualToolRequest;
}

export type ZenPersonaTransitionStyle = "new-speaks" | "previous-introduces";

export interface ZenPersonaTransitionInput {
  fromBotId: string | null;
  toBotId: string | null;
  source: "picker";
  /** Missing style is treated as "new-speaks" for older clients. */
  style?: ZenPersonaTransitionStyle;
}

export interface ZenAutonomyInput {
  source: "idle";
  activeBotId: string | null;
  idleMs: number;
  clientTurnId: string;
}

export interface ZenAskQuestionPatienceInput {
  source: "ask_question_patience";
  activeBotId: string | null;
  assistantMessageId?: string;
  prompt?: string;
  options?: Array<{ id: string; label: string }>;
  timeoutMs?: number;
  activeElapsedMs?: number;
  penaltyLevel?: PrismMoodIgnoredQuestionPenaltyLevel;
  clientTurnId: string;
}

/**
 * A canonical assistant-only turn created after Shh truncates the latest
 * audible assistant message. It never represents user-authored transcript
 * text; the interrupted fragment is repeated here only as a stale-run guard.
 */
export interface AssistantInterruptionReactionInput {
  source: "shh";
  activeBotId: string | null;
  assistantMessageId: string;
  interruptedContent: string;
  clientTurnId: string;
}

export type ZenLiveActionSource =
  | "submitted_action"
  | "idle";

export type ZenLiveActionReactionKind =
  "silent" | "show_action" | "interrupt_candidate";

export type ZenLiveActionMoodHint =
  | "neutral"
  | "attentive"
  | "amused"
  | "confused"
  | "stern"
  | "strained"
  | "waiting"
  | "warm";

export interface ZenLiveActionReactionRequest {
  source: ZenLiveActionSource;
  activeBotId: string | null;
  personaName?: string;
  userAction?: string;
  previousBotAction?: string;
  conversationId?: string;
  idleMs?: number;
  clientSequenceId: string;
}

export interface ZenLiveActionReactionResponse {
  kind: ZenLiveActionReactionKind;
  botAction?: string;
  moodHint: ZenLiveActionMoodHint;
  confidence: number;
  botId: string | null;
  clientSequenceId: string;
  interruptReason?: string;
}

export interface ZenLiveActionContextInput {
  source: "live_action";
  activeBotId: string | null;
  userAction?: string;
  botAction?: string;
  moodHint?: ZenLiveActionMoodHint;
  clientSequenceId?: string;
}

export interface ZenLiveActionInterruptInput {
  source: "live_action_interrupt";
  activeBotId: string | null;
  userAction: string;
  botAction: string;
  moodHint?: ZenLiveActionMoodHint;
  reason?: string;
  clientTurnId: string;
}

export type ZenAutonomyDecision =
  { action: "silent" } | { action: "speak"; botId: string | null };

/**
 * Optional quick-reply labels inferred from the assistant's opening turn when
 * the user starts via "Talk to me!" ({@link ChatRequestPayload.starterPrompt}).
 */
export interface StarterChatExtras {
  conversationStarters?: string[];
}

export type OpinionBand = "guarded" | "warming" | "trusting";
export type OpinionTrend = "up" | "down" | "steady";
export type BotMoodKey = PrismMoodKey;

export interface SessionOpinion {
  score: number;
  band: OpinionBand;
  trend: OpinionTrend;
  lastReason: string;
  recentReasons: string[];
  updatedAt: string;
}

export type BotOpinionBand = "wounded" | "careful" | "open" | "bonded";
export type BotOpinionBoundaryLevel = "none" | "gentle" | "firm";

export interface BotOpinion {
  score: number;
  band: BotOpinionBand;
  boundaryLevel: BotOpinionBoundaryLevel;
  trend: OpinionTrend;
  lastReason: string;
  recentReasons: string[];
  repairCount: number;
  updatedAt: string;
}

export interface ChatResponsePayload extends StarterChatExtras {
  conversation: Conversation;
  assistantMessage: ChatMessage;
  prismMood?: PrismMoodSnapshot;
  opinion?: SessionOpinion;
  botOpinion?: BotOpinion;
  summaryCompaction?: {
    mode: ChatMode;
    triggered: boolean;
    inProgress: boolean;
    reason: "milestone" | "mode_exit" | "manual";
    latestSummary?: string;
    latestSummaryAt?: string;
  };
  memoryLearned?: {
    created: Array<{
      id: string;
      text: string;
      botId: string | null;
      conversationId?: string;
      confidence: number;
      category?: MemoryCategory;
      tier?: MemoryTier;
      source?: "direct" | "inferred" | "compiled" | "about_you";
      certainty?: number;
      durability?: number;
      sourceMessageIds?: string[];
      validationStatus?: MemoryValidationStatus;
      originalText?: string;
      reasonCodes?: MemoryValidationReasonCode[];
    }>;
    retracted: Array<{
      id: string;
      text: string;
      botId: string | null;
      conversationId?: string;
      confidence: number;
      category?: MemoryCategory;
      tier?: MemoryTier;
      source?: "direct" | "inferred" | "compiled" | "about_you";
      certainty?: number;
      durability?: number;
      sourceMessageIds?: string[];
    }>;
    rejected?: Array<{
      originalText: string;
      reasonCodes: MemoryValidationReasonCode[];
      notes?: string;
    }>;
    maxConfidence: number;
  };
}

export interface ConversationSummaryDebug {
  mode: ChatMode;
  conversationId: string;
  inProgress: boolean;
  latestSummary: string | null;
  latestSummaryAt: string | null;
  summaryCount: number;
  totalMessages: number;
  messagesSinceLastCompaction: number;
}

export type CoffeeArrivalScenario =
  "user-first" | "partial-table-in-progress" | "full-table-present";

/** Request body for `POST /api/coffee/sessions`. */
export interface CoffeeSessionCreateRequest {
  /** Fixed five-seat layout with two to four occupied seats for a new table. */
  groupBotIds: Array<string | null>;
  /** Optional session tuning; omitted rows use server defaults. */
  coffeeSettings?: unknown;
  /** Null selects Auto/open-ended; otherwise whole minutes from 3 to 30. */
  durationMinutes?: CoffeeSessionDurationMinutes | null;
  /** Optional opening topic, trimmed and limited to {@link COFFEE_TOPIC_MAX_LENGTH} characters. */
  initialTopic?: string;
  /** Optional opening poll that seeds the initial table topic. */
  initialPoll?: CoffeePollCreateRequest;
  /** Optional opening teams mode that seeds left/right social dynamics. */
  initialTeams?: CoffeeTeamSessionConfig;
  /** Join (chat+sip) or Serve (pour-only). Omitted = legacy full interactive. */
  experienceMode?: CoffeeExperienceMode;
}

/** Request body for `POST /api/coffee/groups/:id/sessions`. */
export interface CoffeeGroupSessionCreateRequest {
  /** Optional session tuning; omitted rows use Coffee Group defaults. */
  coffeeSettings?: unknown;
  /** Null selects Auto/open-ended; otherwise whole minutes from 3 to 30. */
  durationMinutes?: CoffeeSessionDurationMinutes | null;
  /** Optional opening topic, trimmed and limited to {@link COFFEE_TOPIC_MAX_LENGTH} characters. */
  initialTopic?: string;
  /** Optional preset id, or `__auto__` for auto preset selection. */
  presetId?: string;
  /** Bot ids from this Coffee Group that should sit out this one session. */
  excludedBotIds?: string[];
  /** Require every non-excluded group member to attend this session. */
  forceAttendance?: boolean;
  /** Optional opening poll that seeds the initial table topic. */
  initialPoll?: CoffeePollCreateRequest;
  /** Optional opening teams mode that seeds left/right social dynamics. */
  initialTeams?: CoffeeTeamSessionConfig;
  /** Join (chat+sip) or Serve (pour-only). Omitted = legacy full interactive. */
  experienceMode?: CoffeeExperienceMode;
}

/** Response body for `POST /api/coffee/sessions`. */
export interface CoffeeSessionCreateResponse {
  conversation: Conversation;
  /** Opening setup used by the client arrival animation. */
  arrivalScenario: CoffeeArrivalScenario;
  /**
   * Suggested topic chips for manual selection (omitted when the server
   * already persisted {@link Conversation.coffeeTopic}, e.g. auto-topic groups).
   */
  coffeeStarterTopics?: string[];
  /** Present when the session started with an opening poll. */
  poll?: CoffeePoll;
  /** Present when the session started with Coffee Teams. */
  teams?: CoffeeTeamState;
}

export type CoffeeContextSparkSourceApplet = "signal" | "debate" | "coffee";

export type CoffeeContextSparkState =
  | "available"
  | "armed"
  | "used"
  | "dismissed"
  | "stale";

/** A grounded invitation to revisit something an attending bot experienced. */
export interface CoffeeContextSpark {
  id: string;
  conversationId: string;
  sourceApplet: CoffeeContextSparkSourceApplet;
  sourceSessionId: string;
  sourceTitle: string;
  sourceDate: string;
  inspiredBotId: string;
  inspiredBotName: string;
  inspiredBotColor: string | null;
  inspiredBotGlyph: string | null;
  prompt: string;
  state: CoffeeContextSparkState;
  createdAt: string;
}

export interface CoffeeContextSparksResponse {
  sparks: CoffeeContextSpark[];
}

export interface CoffeeContextSparkPatchRequest {
  state: Extract<CoffeeContextSparkState, "available" | "armed" | "dismissed">;
}

/** Request body for `POST /api/coffee/sessions/:id/user-action`. */
export interface CoffeeUserActionRequest {
  /** Action-only composer input, e.g. `*leans back and folds arms*`. */
  action: string;
}

/** Response body for `POST /api/coffee/sessions/:id/user-action`. */
export interface CoffeeUserActionResponse {
  conversation: Conversation;
  coffeeUserAction: CoffeeUserActionPayload;
}

/** Request body for `POST /api/coffee/sessions/:id/continue`. */
export interface CoffeeContinueRequest {
  /** Resolved rendered app theme for theme-conditional Powers this turn. */
  theme?: "light" | "dark";
  /**
   * Per-request provider override for the next bot reply. Per-bot online
   * gating still wins — a bot with `online_enabled=0` falls back to local.
   */
  preferredProvider?: LlmProviderName;
  /**
   * Optional director-mode pick. When present, the server asks this seated bot
   * to speak instead of running the automatic speaker router.
   */
  directedSpeakerBotId?: string;
  /**
   * Optional original user line for chained multi-mention replies. Used only
   * with `directedSpeakerBotId` so follow-up bots answer the same prompt.
   */
  directedUserMessage?: string;
  /** Client hint used for rare bot-interrupt presentation while composing. */
  userIsComposing?: boolean;
  /**
   * Client-visible bots currently seated at the live table. During Coffee's
   * opening arrivals, the server routes turns only among these bots.
   */
  presentBotIds?: string[];
}

/** Request body for `PATCH /api/coffee/sessions/:id/settings`. */
export interface CoffeeSessionSettingsPatchRequest {
  coffeeSettings: unknown;
}

/** Request body for `POST /api/coffee/turn`. */
export interface CoffeeTurnRequest {
  /** Resolved rendered app theme for theme-conditional Powers this turn. */
  theme?: "light" | "dark";
  /** Existing Coffee conversation id, or omitted for legacy first-turn creation. */
  conversationId?: string;
  /**
   * Ordered list of 2-4 bot ids, or a fixed five-seat layout with null empty
   * seats. Required only for legacy first-turn creation; ignored on subsequent
   * turns (server uses the group stored on the conversation row). New clients
   * should create a Coffee session first via `POST /api/coffee/sessions`.
   */
  groupBotIds?: Array<string | null>;
  /**
   * Per-request provider override (matches the Sandbox `/api/chat`
   * `preferredProvider` semantics). When present, replaces the user's
   * saved preference for this turn only. Per-bot online gating still
   * wins — a bot with `online_enabled=0` always falls back to local.
   */
  preferredProvider?: LlmProviderName;
  /** The user's outgoing message. */
  message: string;
  /** Optional player-interruption metadata from the live table reveal state. */
  playerInterruption?: CoffeePlayerInterruptionInput;
  /** Optional director-mode pick for this user turn. */
  directedSpeakerBotId?: string;
  /** Armed historical source whose participating bot should answer first. */
  contextSparkId?: string;
  /**
   * Client-visible bots currently seated at the live table. During Coffee's
   * opening arrivals, the server routes turns only among these bots.
   */
  presentBotIds?: string[];
}

/** Response body for `POST /api/coffee/turn`. */
export interface CoffeeTurnResponse {
  conversation: Conversation;
  /** The bot id chosen by the router for this turn (matches the assistant message's bot_id). Null only for stale no-op turns. */
  speakerBotId: string | null;
  /** Refreshed active Coffee poll state after this turn, when a poll is running. */
  poll?: CoffeePoll | null;
  /** Optional human-readable router rationale for debugging/inspection. Never shown to the user verbatim. */
  routerReason?: string;
  /** True when an obsolete autonomous turn was safely discarded without inserting a reply. */
  stale?: boolean;
  /** True when the revealed reply intentionally closes a table whose bots have disengaged. */
  shouldEndSession?: boolean;
  /** Optional interruption event payload for live Coffee table presentation. */
  interruption?: CoffeeInterruptionEvent;
  /** Privacy-safe details when Auto recovered through another model. */
  autoRecovery?: AutoRecoveryTraceV1;
  /** Present when a Coffee user turn started an async image generation job. */
  pendingImageJob?: {
    jobId: string;
    conversationId: string | null;
  };
}

export type CoffeeTurnJobPhase =
  | "routing"
  | "thinking"
  | "voicing"
  | "speaking"
  | "reaction"
  | "completed"
  | "interrupted"
  | "stale"
  | "failed";

export type CoffeeTurnModelSelectionKind = "auto" | "fixed";

export type CoffeeTurnJobFailureCode =
  | "auto_fallback_exhausted"
  | "provider_unavailable"
  | "invalid_output"
  | "stale_retry"
  | "cancelled"
  | "unknown";

export interface CoffeeTurnJobRetryMetadataV1 {
  v: 1;
  retryOfJobId: string;
  expectedLatestMessageCursor: string | null;
  ordinal: number;
  excludedSpeakerBotId?: string;
}

/** Privacy-safe, machine-readable failure details for bounded Coffee recovery. */
export interface CoffeeTurnJobFailureV1 {
  v: 1;
  code: CoffeeTurnJobFailureCode;
  selectionKind: CoffeeTurnModelSelectionKind;
  attempts: AutoFallbackAttemptTraceV1[];
  speakerBotId: string | null;
  latestMessageCursor: string | null;
  retry: CoffeeTurnJobRetryMetadataV1 | null;
  retryable: boolean;
}

export interface CoffeeTurnJobStatus {
  id: string;
  conversationId: string | null;
  phase: CoffeeTurnJobPhase;
  speakerBotId: string | null;
  startedAt: string;
  updatedAt: string;
  interruptEligibleAt: string | null;
  response?: CoffeeTurnResponse;
  /** Structured recovery contract. `error` remains during compatibility rollout. */
  failure?: CoffeeTurnJobFailureV1;
  retry?: CoffeeTurnJobRetryMetadataV1;
  error?: string;
}

/** Request body for `POST /api/coffee/sessions/:id/polls`. */
export interface CoffeePollCreateRequest {
  question: string;
  options: string[];
}

/** Response body for `POST /api/coffee/sessions/:id/polls`. */
export interface CoffeePollCreateResponse {
  poll: CoffeePoll;
}

/** Request body for `POST /api/coffee/sessions/:id/polls/:pollId/collect`. */
export interface CoffeePollCollectVotesRequest {
  preferredProvider?: LlmProviderName;
  sessionRemainingMs?: number | null;
  /** Optional player vote to record before bot deliberation is advanced. */
  optionIndex?: number;
}

/** Response body for `POST /api/coffee/sessions/:id/polls/:pollId/collect`. */
export interface CoffeePollCollectVotesResponse {
  poll: CoffeePoll;
}

/** Request body for `POST /api/coffee/sessions/:id/polls/:pollId/vote`. */
export interface CoffeePollPlayerVoteRequest {
  optionIndex: number;
  sessionRemainingMs?: number | null;
}

/** Response body for `POST /api/coffee/sessions/:id/polls/:pollId/vote`. */
export interface CoffeePollPlayerVoteResponse {
  poll: CoffeePoll;
}
export * from "./autoCameraDirector.js";
export * from "./botcast.js";
export * from "./signalVisualRecognition.js";
export * from "./producerQuoteReception.js";
export * from "./actionSfxPack.js";
export * from "./englishPacingProfile.js";
export * from "./corporalityFoley.js";
export * from "./signalFancyAction.js";
export * from "./signalOrganicPerformance.js";
export * from "./signalPickles.js";
export * from "./signalMusicProfile.js";
export * from "./voiceSpokenText.js";
export * from "./voiceAlignmentTrace.js";
export * from "./voicePerformance.js";
export * from "./localVoice.js";
export * from "./voiceSpeechprint.js";
export * from "./protectedSpeech.js";
export * from "./premiumRespelling.js";
export * from "./listenerReaction.js";
export * from "./responseCue.js";
export * from "./turnPreparation.js";
export * from "./directionalIrritation.js";
export * from "./stageActionDirector.js";
export * from "./continuityVersion.js";
export * from "./modelReadiness.js";
export * from "./graphicsQuality.js";
export * from "./crtFocus.js";
export * from "./typographyScale.js";
export * from "./review.js";
export * from "./ephemeralChat.js";
export * from "./replay.js";
export * from "./liveBake.js";
export * from "./livingShell.js";
export * from "./livingShellProgress.js";
export * from "./imageAssets.js";
export * from "./softAssetJobs.js";
export * from "./slateHandoff.js";
export * from "./debate.js";
export * from "./debateMystery.js";
export * from "./debateMysteryV2.js";
export * from "./mysteryIncidentPlan.js";
export * from "./portableMysteryPackage.js";
export * from "./mansionLayoutV2.js";
export * from "./mansionMusic.js";
export * from "./audioAssets.js";
export * from "./mansionAcoustics.js";
export * from "./debateParticipation.js";
export * from "./debateChairFavorability.js";
export * from "./coffeeGroupSetup.js";
export * from "./coffeeTopicTitle.js";
export * from "./debateAudiencePressure.js";
