"use client";

import {
  Fragment,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BOTCAST_DEFAULT_STUDIO_FILM_GRAIN,
  BOTCAST_DEFAULT_STUDIO_GLOW_TUNING,
  BOTCAST_DEFAULT_STUDIO_LAYOUT,
  BOTCAST_DEFAULT_CAMERA_FRAMING,
  BOTCAST_DEFAULT_LOGO_PLACEMENT,
  BOTCAST_DIRECTOR_MIN_SHOT_MS,
  BOTCAST_CAMERA_PAN_MAX,
  BOTCAST_CAMERA_PAN_MIN,
  BOTCAST_CAMERA_PAN_STEP,
  BOTCAST_EPISODE_IMAGE_POSITION_MAX,
  BOTCAST_EPISODE_IMAGE_POSITION_MIN,
  BOTCAST_EPISODE_IMAGE_POSITION_STEP,
  BOTCAST_EPISODE_IMAGE_SCALE_MAX,
  BOTCAST_EPISODE_IMAGE_SCALE_MIN,
  BOTCAST_EPISODE_IMAGE_SCALE_STEP,
  BOTCAST_EPISODE_IMAGE_NAME_MAX_LENGTH,
  BOTCAST_EPISODE_IMAGE_REASON_MAX_LENGTH,
  BOTCAST_GUEST_BRIEF_MAX_LENGTH,
  BOTCAST_CAMERA_ZOOM_MAX,
  BOTCAST_CAMERA_ZOOM_MIN,
  BOTCAST_CAMERA_ZOOM_STEP,
  BOTCAST_PRODUCER_CUE_DETAIL_MAX,
  BOTCAST_PRODUCER_DIRECT_QUOTE_MAX,
  BOTCAST_PRODUCER_GUEST_ID,
  BOTCAST_PRODUCER_GUEST_NAME,
  BOTCAST_PRODUCER_GUEST_THINKING_TIME_SCALE,
  classifySignalFancyActionV1,
  signalFancyActionCueText,
  BOTCAST_SESSION_DURATION_MINUTES_MAX,
  BOTCAST_SESSION_DURATION_MINUTES_MIN,
  BOTCAST_STUDIO_FILM_GRAIN_MAX,
  BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX,
  BOTCAST_STUDIO_FLOOR_GLOW_SCALE_STEP,
  BOTCAST_VOICE_LEVEL_MAX,
  BOTCAST_VOICE_LEVEL_STEP,
  BOT_POWER_CANONICAL_SILENCE_V1,
  botPowerAvatarScaleModeV1,
  botPowerHasAvatarColorCycleV1,
  botPowerAvatarVisibilityModeV1,
  applyBotPowerMumbledReactionPlanV1,
  applyBotPowerEchoResponseV1,
  botPowerCupRateMultiplierForBotV1,
  botPowerIsMutedV1,
  botPowerMirrorsIdentityV1,
  botPowerResponseIsSilentV1,
  botPowerVoiceGainMultiplierV1,
  botPowerVoicePresenceModeV1,
  DEFAULT_COFFEE_SESSION_DURATION_MINUTES,
  botcastCameraOffsetXPercent,
  botcastCameraOffsetYPercent,
  botcastCameraModeAt,
  botcastCameraShotAt,
  botcastAutoCoverageShotAt,
  botcastActiveProducerCueFromEvents,
  botcastProducerCueLifecyclesFromEvents,
  botcastDepartureSpeakerRole,
  botcastEchoHostInterruptPhrase,
  botcastEpisodeModelSelectionKind,
  botcastGuestHasDepartedAt,
  botcastHostHasDepartedAt,
  botcastHostInterruptionLineAt,
  botCrosstalkInterruptedSpeakerCueForSeed,
  botCrosstalkPrimarySpeakerContent,
  crosstalkInterruptionIsMeaningfulV1,
  botcastIdentityMirrorStateBeforeMessageV1,
  botcastIdentityMirrorStatesAtV1,
  botIdentityMirrorQuotedTargetNameV1,
  botcastIdentityShapeshiftStateBeforeMessageV1,
  botcastIdentityShapeshiftStatesAtV1,
  botcastFalseNameStatesAtV1,
  botcastInterruptionBridgeMessageId,
  botcastInterruptedGuestContent,
  botcastListenerReactionForMessage,
  botcastEpisodeImageDescriptorFromFileName,
  botcastImageContextForMessageV1,
  botcastLatestImageContextV1,
  botcastMessageIsAudibleToAudienceV1,
  botcastNextSpeakerRole,
  botcastPendingCrosstalkReclaimV1,
  botcastPublicReactionSpeechForMessage,
  botcastProducerGuestThinkingDiscountMs,
  botcastReplayMessageIndexAt,
  botcastReplayTimeline,
  botcastSignalStandardCadenceDurationMs,
  botcastStrongestNegativeSocialInfluenceAt,
  botcastSnapshotPowersForRoleV1,
  botcastVoiceLevelForBot,
  buildReplaySceneCheckpointsV2,
  signalEpisodeModelPickerValue,
  botIdentityMirrorTransitionActiveV1,
  botIdentityShapeshiftTransitionActiveV1,
  buildSignalMusicProfile,
  hexToHsl,
  normalizeAccentForTheme,
  normalizeBotcastStudioAtmosphereMix,
  normalizeBotcastCameraFraming,
  normalizeBotcastEpisodeImagePlacement,
  normalizeBotcastLogoPlacement,
  normalizeBotcastStudioGlowTuning,
  normalizeBotcastStudioLayout,
  normalizeBotcastVoiceLevel,
  normalizeBotcastVoiceLevelsByBotId,
  normalizeAutoRecoveryTrace,
  normalizeAutoRouteDecisionV1,
  swapBotcastStudioLayoutSeats,
  listenerReactionActionLabel,
  listenerReactionHasCrosstalkAudio,
  listenerReactionInterruptedSpeakerTextV1,
  listenerReactionSpokenTextV1,
  listenerReactionSequencePlansV1,
  botcastVoicePerformanceForMessageV2,
  botcastStudioIncidentForMessageV1,
  resolveListenerReactionAtMs,
  socialSilenceMessageIsMarkedV1,
  replayCameraTransitionModeV2,
  replayMouthShapeAtV2,
  replayVoiceLightLevelAtV2,
  replaySpeechActivityAtV2,
  replaySceneAtV2,
  type BotcastCameraShot,
  type BotcastEpisode,
  type BotcastEpisodeImageDescriptor,
  type BotcastImageContextV1,
  type BotcastEpisodeAdvanceResponse,
  type BotcastEpisodeResponseMode,
  type BotcastEpisodeSummary,
  type BotcastHostRedirectContext,
  type BotcastGuestInterruptionContext,
  type BotcastMessage,
  type BotcastProducerCue,
  type BotcastProducerCueLifecycleStatus,
  type BotcastProducerCueDelivery,
  type BotcastCameraFrame,
  type BotcastCameraFraming,
  type BotcastEpisodeImagePlacement,
  type BotcastLogoPlacement,
  type BotcastDirectedCameraShot,
  type BotcastShow,
  type BotcastHostRecoveryCandidate,
  type BotcastHostRecoveryResponse,
  type BotcastHostRecoveryScreenResponse,
  type BotcastHostRecoveryCastResponse,
  type BotcastShowHostChatMessage,
  type BotcastShowHostChatResponse,
  type BotcastSessionDurationMinutes,
  type BotcastStudioAtmosphereMix,
  type BotcastStudioGlowThemeTuning,
  type BotcastStudioGlowTuning,
  type BotcastStudioLayout,
  type BotcastStudioLayoutItem,
  type BotcastStagePreset,
  type BotcastVoiceLevelsByBotId,
  type LiveBakeArtifactV1,
  type BotIdentityMirrorStateV1,
  type BotIdentityShapeshiftStateV1,
  type BotPowerAvatarScaleMode,
  type BotPowerAvatarVisibilityModeV1,
  type BotPowerMuteReactionBeatV1,
  type BotPowerVoicePresenceMode,
  type DirectionalIrritationDeliveryPlanV1,
  type ListenerReactionPlanV1,
  type ReplayCameraDirectionPayloadV2,
  type ReplayVoiceSelectionSnapshotV2,
  type ReplayManifestV2,
  type ReplayPremiumAudioActionV1,
  type ReplayRecordingV1,
  type ReplayStudioCutEligibilityV1,
  type PrismRefractResponse,
  type PrismRefractSignalTextTarget,
  type ImageAssetSet,
  type PreparedTurnV1,
  type BotPresenceBeatV1,
  type SignalPersonaTemperament,
  type AutoRecoveryTraceV1,
  type AutoRouteDecisionV1,
  type ProviderReasoningEffort,
  type SignalStudioIncidentBeatV1,
} from "@localai/shared";
import { PRISM_APP_VERSION } from "../prismAppVersion";
import {
  INTERRUPTED_SPEAKER_RETORT_PAUSE_MS,
  signalListenerReactionVoiceGain,
} from "./listenerReactionVoice";
import {
  Download,
  FileText,
  ImagePlus,
  LoaderCircle,
  Pause,
  Play,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  buildCoffeeCupVisualState,
  coffeeCupSipAnimationTiming,
  type CoffeeCupVisualState,
} from "./coffee-cup-sprites";
import {
  buildBundledActionSfxPlan,
  bundledActionSfxCueAtMs,
} from "./coffee-action-sfx";
import {
  playSignalStudioIncidentAudio,
  signalStudioIncidentCaptionAtProgressV1,
} from "./signalStudioIncidentAudio";
import { signalOrganicCaptionPresentationV1 } from "./signalOrganicCaption";
import { nextBotcastShowIdAfterDeletion } from "./botcastDeletion";
import { waitForSignalTurnPreparation } from "./signalTurnPreparationWait";
import { signalVoiceProgressHeartbeatAdvanced } from "./signalVoiceProgressWatchdog";
import {
  signalHostRecoveryCandidateEnabled,
  signalHostRecoveryCandidateLabel,
  signalShouldScreenHostRecovery,
} from "./signalHostRecovery";
import {
  botcastSpeechRevealVisibleText,
  finishBotcastSpeechReveal,
  prepareBotcastSpeechReveal,
  applyBotcastSpeechRevealSegmentTiming,
  startBotcastSpeechReveal,
  updateBotcastSpeechReveal,
} from "./botcastSpeechReveal";
import { PrismBlockingLoader } from "./PrismBlockingLoader";
import {
  liveBakeStatusCopy,
  liveBakeSurfaceTitle,
} from "./liveBakeLoading";
import {
  LIVE_BAKE_POLL_INTERVAL_MS,
} from "./liveBakeClient";
import { AssetRail, type AssetGenerationSelection, type AssetRailGenerationControl } from "./AssetLibrary";
import {
  PrismCompanionPresenceBoundary,
  PrismCompanionSessionNoteBoundary,
} from "./prismCompanionPresence";
import {
  createBotDirectedSetupRefractTarget,
  PrismRefractTarget,
  type PrismRefractBotDirectedSetupTarget,
} from "./prismRefract";
import {
  appendAppletSessionNoteToTranscript,
  appletSessionNoteRequestPath,
  type AppletSessionNoteResponse,
} from "./appletSessionNotes";
import {
  annotateAppletTranscriptFrameRates,
  useAppletTranscriptFrameRate,
} from "./appletTranscriptFrameRate";
import {
  annotateTranscriptWithFocusEvents,
  loadLiveSessionFocusEvents,
  useLiveSessionFocusEvents,
} from "./sessionFocusEvents";
import { SessionAtmosphereLayer } from "./SessionAtmosphereLayer";
import { acquirePrismLivingSession } from "./prismPresentationSuspend";
import { SIGNAL_STUDIO_FOLEY_ROOM_SEND } from "./roomAcoustics";
import {
  DEFAULT_SIGNAL_ATMOSPHERE_MIX,
  SIGNAL_ATMOSPHERE_RELATIVE_MIX_MAX,
  SIGNAL_ATMOSPHERE_RELATIVE_MIX_STEP,
  sessionAtmosphereBusVolume,
  signalAtmosphereMixLevelFromRelative,
  signalAtmosphereRelativeMixLevel,
  signalSessionAtmosphereActive,
} from "./session-atmosphere-audio";
import { signalAvatarSfxShouldPlay } from "./signalAvatarSfx";
import {
  SIGNAL_ARTWORK_JOB_EVENT,
  announceSignalArtworkJob,
  signalArtworkAssetLabel,
  signalArtworkJobIsActive,
  type SignalArtworkJobSnapshot,
} from "./signalArtworkJob";
import { signalShowMagicManifest } from "./signalShowIdentity";
import {
  SIGNAL_EPISODE_INTRO_LEAD_IN_MS,
  playSignalIntroAudio,
  playSignalOutroAudio,
  releaseSignalIntroAudio,
} from "./signalIntroAudio";
import {
  cancelAudibleAudioRelease,
  releaseAudibleAudioElement,
} from "./audibleAudioRelease";
import {
  randomSignalEpisodeGuestId,
  resolvedSignalBookingGuestId,
} from "./signalBookingRandomizer";
import {
  createSignalLuckyLaunchRunner,
  signalLuckyEligibleShows,
  type SignalLuckyLaunchSetup,
} from "./signalLuckyLaunch";
import {
  SIGNAL_HOST_CUE_REDIRECT_LATEST_PROGRESS,
  signalHostCueShouldRedirect,
} from "./signalHostCueTiming";
import {
  signalLiveCaptionText,
  signalSilentCaptionRevealDurationMs,
  signalVoiceCompletionFallbackDurationMs,
} from "./signalLiveCaptions";
import { signalLiveCaptionPage } from "./debateLiveCaption";
import { debateEvidenceEmojiForObject } from "./debateEvidenceExhibits";
import { signalVoiceStartTimeoutMs } from "./signalVoiceFallback";
import {
  signalExtraResponsePauseMs,
  waitForSignalResponseCadence,
} from "./signalResponseCadence";
import {
  DEFAULT_SIGNAL_LIVE_CAPTIONS_ENABLED,
  readSignalLiveCaptionSize,
  readSignalLiveCaptionsEnabled,
  writeSignalLiveCaptionSize,
  writeSignalLiveCaptionsEnabled,
} from "./signalLiveCaptionsPreference";
import {
  DEFAULT_LIVE_CAPTION_SIZE,
  liveCaptionSizeDetails,
  stepLiveCaptionSize,
} from "./liveCaptionSize";
import {
  signalListenerReactionCameraShot,
  signalLiveAutoCameraShot,
  type SignalCameraTransitionMode,
  type SignalDirectedCameraShot,
} from "./signalCameraTransition";
import {
  signalEpisodeRetryDraft,
  type SignalEpisodeRetryMetadata,
} from "./signalEpisodeRetry";
import { signalDepartureRoleAfterPresentedMessage } from "./signalDeparturePresentation";
import {
  signalCompactThinkingNoticeAt,
  signalGenerationThinkingRole,
  signalPresentedThinkingRole,
  signalStageThinkingRole,
  signalThinkingFollowingMessageId,
  signalThinkingPresentationEndReason,
} from "./signalThinkingPresentation";
import {
  ModelWarmupIntermission,
  type ModelWarmupIntermissionPhase,
} from "./ModelWarmupIntermission";
import {
  LiveSessionModelChip,
  LiveSessionPrismWatermark,
  type LiveSessionRoutingChipLabels,
} from "./liveSessionChrome";
import {
  autoModelPreparationNotApplicable,
  waitForModelPreparation,
} from "./modelPreparation";
import {
  formatSignalAudienceViews,
  signalAudienceRatingColor,
  signalShowsByAudienceRating,
  signalAudienceReviews,
  signalAudienceSnapshot,
} from "./signalAudiencePulse";
import {
  signalCupSipFaceReleaseMs,
  signalCupSipTargetFromMouth,
  signalStageLocalPointFromViewport,
} from "./signalCupSipGeometry";
import {
  signalCupSipAllowedDuringSpeechV1,
  signalCupSipScheduleV1,
  signalCupVisualSipCountV1,
} from "./signalCupSipSchedule";
import { buildSignalReviewTranscript } from "./signalReviewTranscript";
import {
  signalVoicePerformanceActionPresentationAtProgress,
  signalVoicePerformanceTranscriptText,
} from "./signalVoicePerformance";
import { SignalVoiceActionText } from "./SignalVoiceActionText";
import { signalShowCardBlurbs } from "./signalShowCardQuips";
import { signalStageSoundcheckMessages } from "./signalStageSoundcheck";
import {
  signalEpisodeImageIsVisible,
  signalEpisodeImageScale,
  signalPendingEpisodeImageCueIsAwaitingHostTurn,
  signalQueuedProducerCueIsServerOwned,
} from "./signalEpisodeImagePresentation";
import { shouldSubmitComposerOnEnter } from "./composerKeyPolicy";
import { applyComposerSendAutoCorrect } from "./composerSendAutoCorrect";
import {
  signalStudioFloorGlowHandleStyle,
  signalStudioMaskedFloorGlowStyle,
  signalStudioOverscanCoordinate,
  signalStudioPlacementStyle,
  signalStudioSeatColorOrder,
  signalStudioVoicePan,
} from "./signalStudioPlacement";
import {
  buildWebDiagnosticReport,
  writeDiagnosticClipboard,
} from "./webDiagnostics";
import {
  scheduleRealtimeVoicePause,
  type VoicePlaybackCharacterAlignment,
  type VoicePlaybackLifecycle,
} from "./voiceEffects";
import {
  crtSpeechMouthShapeAtAlignedElapsedMs,
  type ZenLiveBotMouthShape,
} from "./zenLiveMouth";
import {
  signalLiveActiveMessage,
  signalLivePrimaryAvatarSpeech,
  signalLiveSpeechIsActiveAtElapsedMs,
  signalLiveSpeechPlaybackIsOwned,
  signalLiveSpeechProjectedElapsedMs,
  type SignalLiveSpeechPlaybackClock,
  type SignalLiveSpeechState,
} from "./signalLiveAvatarSpeech";
import { botVoiceLightTarget } from "./voiceLightEnvelope";
import {
  buildSpeechActivityWindowsFromTextCadence,
  speechActivityAtMs,
} from "./speechActivity";
import { buildSignalReplayManifestV2 } from "./replayManifest";
import {
  replayRecordingDetail,
  replayRecordingForSource,
  removeReplayStudioCut,
  retryReplayStudioCutMix,
  replayStudioCutEligibility,
  saveFaithfulReplaySession,
  startReplayStudioCut,
  startReplayRecordingDraft,
} from "./replayClient";
import { loadSessionReviewRecordingEvidence } from "./sessionReviewEvidence";
import {
  abortReplayAudioMasterCapture,
  adoptReplayAudioMasterCaptureSourceId,
  markReplayAudioMasterCapture,
  markReplayDirectionEvent,
  primeReplayAudioMasterCapture,
  replayAudioMasterCaptureDirection,
  replayAudioMasterCaptureMouthTracks,
  replayAudioMasterCaptureVoiceLightTracks,
  setReplayAudioMasterCompactHold,
  startReplayAudioMasterCapture,
  stopReplayAudioMasterCapture,
  syncReplayThinkingPresentations,
} from "./replayAudioMasterCapture";
import {
  signalFaithfulReplayCameraState,
  signalReplayCameraClockFrame,
  signalReplayClockCrossedBoundary,
  signalReplayBookendAt,
  signalReplayDefaultIntroDurationMs,
  SIGNAL_REPLAY_INTRO_LANDING_FADE_MS,
  signalReplayIntroBounds,
  signalReplayIntroDurationMs,
  signalReplayIntroIsLanding,
  signalReplayIntroLandingFadeMs,
  signalReplayCapturedPresentationElapsedMs,
  signalReplayIntroVisualOffsetMs,
} from "./signalReplayVideoFrame";
import { REPLAY_RECORDING_CHANGED_EVENT } from "./ReplayRenderCoordinator";
import { ReplayMouthPresentationCapture } from "./ReplayMouthPresentationCapture";
import { SpeechIntentReveal } from "./SpeechIntentReveal";
import { signalAvatarPresentation } from "./sessionAvatarPresentationPolicy";
import {
  boundedSignalReplayFinalization,
  signalMessageRequestsResponseCue,
  signalResponseCueBotIsMuted,
} from "./signalCompletionSafety";
import {
  BotPickerGrid,
  BotPickerTile,
  BotPickerToolbar,
  filterBotPickerItems,
  sortBotPickerItems,
  type BotPickerGroup,
  type BotPickerGlyphRenderer,
} from "./BotPicker";
import {
  debateCastHueFromLensSliderInput,
  debateCastLensSliderInputValue,
} from "./debateCastHueLens";
import styles from "./botcast.module.css";

const SIGNAL_MUTE_REACTION_HOLD_MS = 2_500;
const SIGNAL_AUDIBLE_HANDOFF_RELEASE_MS = 170;

function signalMuteReactionActionLabel(
  action: BotPowerMuteReactionBeatV1["action"],
): string {
  if (action === "lean_in") return "leans in";
  if (action === "head_tilt") return "tilts head";
  if (action === "shift") return "shifts in their seat";
  if (action === "look_away") return "looks away";
  if (action === "look_at_watch") return "looks at their watch";
  if (action === "tap_fingers") return "taps their fingers";
  return "glances over";
}

function signalMuteReactionVisualAction(
  action: BotPowerMuteReactionBeatV1["action"],
): ListenerReactionPlanV1["visualAction"] {
  if (action === "lean_in") return "lean_in";
  if (action === "head_tilt") return "head_tilt";
  if (action === "look_away" || action === "look_at_watch") {
    return "thoughtful_hmm";
  }
  return "nod";
}

export function signalMuteReactionPlan(
  message: Pick<BotcastMessage, "id" | "botId">,
  performanceDurationMs: number,
  beat: BotPowerMuteReactionBeatV1,
): ListenerReactionPlanV1 {
  const audibleQuip = beat.kind === "audible_quip" || beat.kind === "interrupt";
  return {
    v: 1,
    name: "listenerReaction",
    speakerBotId: message.botId,
    listenerBotId: beat.reactorBotId,
    messageId: message.id,
    targetSource: "direct",
    visualAction: signalMuteReactionVisualAction(beat.action),
    ...(audibleQuip && beat.quip
      ? { spokenCue: beat.quip as ListenerReactionPlanV1["spokenCue"] }
      : {}),
    ...(beat.kind === "lung_foley"
      ? {
          vocalFoley:
            beat.foley === "whistle"
              ? "whistles"
              : beat.foley === "gasp"
                ? "gasps"
                : "sighs",
        }
      : {}),
    ...(beat.kind === "interrupt"
      ? { interjectionAttempt: true, floorOutcome: "yield" }
      : {}),
    targetProgress: Math.max(
      0.3,
      Math.min(0.9, beat.atMs / Math.max(1, performanceDurationMs)),
    ),
    seed: `${message.id}:mute:${beat.reactorBotId}:${beat.atMs}`,
    cameraCutEligible: true,
  };
}

export interface BotcastBotSummary {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  online_enabled?: number | null;
  muted?: boolean;
  echoesAddressedSpeech?: boolean;
  voiceGainMultiplier?: number;
  voicePresence?: BotPowerVoicePresenceMode | null;
  mumbling?: boolean;
  pronunciationMapPoint?: { x: number; y: number } | null;
  personaTemperament: SignalPersonaTemperament;
  producerGuest?: boolean;
  /** Actual mirror state; holder materials remain authoritative. */
  identityMirrorState?: BotIdentityMirrorStateV1 | null;
  identityMirrorTransitionActive?: boolean;
  identityMirrorTargetFaceActive?: boolean;
  identityPresentationNowMs?: number;
  /** Sticky Library/Marketplace form; presentation yields to identityMirrorState when both exist. */
  identityShapeshiftState?: BotIdentityShapeshiftStateV1 | null;
}

function botWithIdentityBeforeMessage(
  bot: BotcastBotSummary,
  currentEpisode: BotcastEpisode,
  message: BotcastMessage,
): BotcastBotSummary {
  const identityMirrorState = botcastIdentityMirrorStateBeforeMessageV1(
    currentEpisode,
    bot.id,
    message.id,
  );
  const identityShapeshiftState = botcastIdentityShapeshiftStateBeforeMessageV1(
    currentEpisode,
    bot.id,
    message.id,
  );
  return {
    ...bot,
    identityMirrorState,
    identityMirrorTransitionActive: false,
    identityMirrorTargetFaceActive: Boolean(
      identityMirrorState ?? identityShapeshiftState,
    ),
    identityShapeshiftState,
  };
}

export interface BotcastProducerGuestComposerState {
  value: string;
  awaitingAnswer: boolean;
  inputDisabled: boolean;
  disabled: boolean;
  shhActive: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onSubmit: (value?: string) => void;
  onShh: () => void;
}

export function signalProducerGuestHostInterruptionContext(args: {
  episode: BotcastEpisode | null;
  speakingMessageId: string | null;
  liveSpeech: BotcastLiveSpeech | null;
}): BotcastHostRedirectContext | null {
  const activeHostMessage = args.episode?.messages.find(
    (message) =>
      message.id === args.speakingMessageId && message.speakerRole === "host",
  );
  if (
    !activeHostMessage ||
    args.liveSpeech?.messageId !== activeHostMessage.id ||
    args.liveSpeech.reveal.phase !== "playing"
  ) {
    return null;
  }
  const spokenContent = botcastSpeechRevealVisibleText(
    args.liveSpeech.reveal,
  ).trimEnd();
  if (
    !spokenContent.trim() ||
    spokenContent === activeHostMessage.content ||
    !activeHostMessage.content.startsWith(spokenContent)
  ) {
    return null;
  }
  return { messageId: activeHostMessage.id, spokenContent };
}

export interface BotcastModelOption {
  id: string;
  label: string;
  provider: "local" | "ollama_cloud" | "openai" | "anthropic";
  supportsImageInput?: boolean;
}

export function signalEpisodeModelChoiceSupportsImageInput(
  modelOptions: readonly BotcastModelOption[],
  modelChoice: string,
): boolean {
  if (!modelChoice) {
    return modelOptions.some((option) => option.supportsImageInput === true);
  }
  return (
    modelOptions.find((option) => option.id === modelChoice)
      ?.supportsImageInput === true
  );
}

export type SignalActiveAutoRoute = {
  provider: "local" | "ollama_cloud" | "openai" | "anthropic";
  model: string;
  effort?: ProviderReasoningEffort;
  turbo?: boolean;
  autoRoute?: AutoRouteDecisionV1;
  autoRecovery?: AutoRecoveryTraceV1;
};

/** Fixed Signal recordings persist their sealed effort in the routing event. */
export function signalFrozenReasoningEffort(
  episode: Pick<BotcastEpisode, "events">,
): ProviderReasoningEffort | null {
  const value = episode.events.find((event) => event.kind === "routing")
    ?.payload.frozenReasoningEffort;
  return value === "auto" ||
    value === "none" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "max"
    ? value
    : null;
}

/** Latest concrete route Auto actually used, including an active image pin. */
export function signalActiveAutoRoute(
  episode: Pick<BotcastEpisode, "provider" | "model" | "events">,
): SignalActiveAutoRoute | null {
  const imageContext = botcastLatestImageContextV1(episode.events);
  if (imageContext && imageContext.phase !== "dismissed") {
    return { provider: imageContext.provider, model: imageContext.model };
  }
  for (let index = episode.events.length - 1; index >= 0; index -= 1) {
    const event = episode.events[index];
    if (event?.kind !== "utterance") continue;
    const recovery = event.payload.autoRecovery;
    const autoRoute = normalizeAutoRouteDecisionV1(event.payload.autoRoute);
    const autoRecovery = normalizeAutoRecoveryTrace(recovery);
    const recoveryRecord =
      recovery && typeof recovery === "object" && !Array.isArray(recovery)
        ? (recovery as Record<string, unknown>)
        : null;
    const recoveredProvider =
      typeof recoveryRecord?.finalProvider === "string"
        ? recoveryRecord.finalProvider
        : undefined;
    const recoveredModel =
      typeof recoveryRecord?.finalModel === "string"
        ? recoveryRecord.finalModel
        : undefined;
    const provider = recoveredProvider ?? event.payload.provider;
    const rawModel = recoveredModel ?? event.payload.model;
    const model = typeof rawModel === "string" ? rawModel.trim() : "";
    if (
      (provider === "local" ||
        provider === "openai" ||
        provider === "anthropic") &&
      model
    ) {
      const effort = event.payload.reasoningEffort;
      return {
        provider,
        model,
        ...(autoRoute ? { autoRoute } : {}),
        ...(autoRecovery ? { autoRecovery } : {}),
        ...(effort === "auto" ||
        effort === "none" ||
        effort === "minimal" ||
        effort === "low" ||
        effort === "medium" ||
        effort === "high" ||
        effort === "xhigh" ||
        effort === "max"
          ? { effort }
          : {}),
        ...(event.payload.turbo === true ? { turbo: true } : {}),
      };
    }
  }
  // The configured episode model is a request preference, not proof that a
  // turn completed. Auto must remain Awaiting first turn until persisted event
  // provenance arrives from the server.
  return null;
}

export interface BotcastApiRequest {
  <T>(path: string, options?: RequestInit): Promise<T>;
}

interface SignalListenerReactionVoiceLifecycles {
  listener: VoicePlaybackLifecycle;
  interrupted: VoicePlaybackLifecycle;
  /** Exact browser-clock deadline for the interrupter's audible entrance. */
  listenerStartAtPerformanceMs?: number;
  /** Message-scoped identity state for the bot whose line was interrupted. */
  interruptedBot?: BotcastBotSummary;
  /** Verbal-forward irritation cues for the interrupted-speaker retort. */
  directionalIrritationDelivery?: DirectionalIrritationDeliveryPlanV1;
}

const SIGNAL_NATURAL_HANDOFF_MS = 40;
const SIGNAL_NOTICE_TOAST_MS = 7_000;
const SIGNAL_EPISODE_PRE_ROLL_MIN_MS = 3_000;
const SIGNAL_ATMOSPHERE_BUSES = [
  {
    key: "background",
    label: "Studio atmosphere",
  },
  { key: "foley", label: "Tactile Foley" },
] as const satisfies ReadonlyArray<{
  key: keyof BotcastStudioAtmosphereMix;
  label: string;
}>;
// Once playback starts, a missing provider completion signal must not strand
// the episode in a busy state and block the next on-air turn indefinitely.
const SIGNAL_VOICE_COMPLETION_GRACE_MS = 4_000;

/** Discrete mouths and captions stay fluid without rerendering Signal at 60 fps. */
const SIGNAL_LIVE_SPEECH_RENDER_INTERVAL_MS = 50;
/**
 * Reconcile the full archived Signal surface sparingly. Audio, camera, and the
 * small avatar sampler still follow the media element directly; this cadence
 * is only for continuous low-frequency stage state such as cups and labels.
 */
const SIGNAL_REPLAY_STAGE_RENDER_INTERVAL_MS = 250;
const SIGNAL_USER_INPUT_QUIET_WINDOW_MS = 160;
/** Decode crosstalk ahead of its cue, then enter on the exact audio-clock beat. */
const SIGNAL_LISTENER_REACTION_SCHEDULE_LEAD_MS = 500;

/**
 * Sample one small live visual value without reconciling the Signal stage (or
 * the complete experience) on every audio heartbeat. The caller supplies a
 * stable string key so identical viseme/caption frames are free, and changed
 * frames render below producer-input priority.
 */
function SignalLiveVisualSampler<Value>(props: {
  active: boolean;
  sample: (nowMs: number) => { key: string; value: Value };
  render: (value: Value) => ReactNode;
}): ReactNode {
  const sampleRef = useRef(props.sample);
  const [sample, setSample] = useState(() => props.sample(0));

  useLayoutEffect(() => {
    sampleRef.current = props.sample;
  }, [props.sample]);

  useEffect(() => {
    const publish = (): void => {
      const next = sampleRef.current(performance.now());
      startTransition(() =>
        setSample((current) => (current.key === next.key ? current : next)),
      );
    };
    publish();
    if (!props.active) return;
    const intervalId = window.setInterval(
      publish,
      SIGNAL_LIVE_SPEECH_RENDER_INTERVAL_MS,
    );
    return () => window.clearInterval(intervalId);
  }, [props.active]);

  return props.render(sample.value);
}

type SignalEphemeralSpeech = {
  sourceMessageId: string;
  channel: "reaction" | "crosstalk";
  text: string;
  elapsedMs: number;
  durationMs: number;
  alignment: VoicePlaybackCharacterAlignment | null;
};

function signalInterruptedSpeakerRetortDelayMs(
  plan: ListenerReactionPlanV1,
  elapsedMs: number,
  durationMs: number,
): number {
  if (
    !listenerReactionInterruptedSpeakerTextV1(plan) ||
    plan.interruptedSpeakerCuePlayback !== "crosstalk"
  ) {
    return INTERRUPTED_SPEAKER_RETORT_PAUSE_MS;
  }
  const organicPauseMs = plan.signalOrganicBeat?.kind === "cut_in_retreat"
    ? plan.signalOrganicBeat.timing.speakerDuckMs
    : 0;
  return (
    Math.max(0, durationMs - elapsedMs) +
    organicPauseMs +
    INTERRUPTED_SPEAKER_RETORT_PAUSE_MS
  );
}

/** Give a real, successfully-started cut-in room on the primary voice bus. */
function scheduleSignalOrganicPrimaryPause(
  plan: ListenerReactionPlanV1,
): boolean {
  const organicBeat = plan.signalOrganicBeat;
  if (!organicBeat || organicBeat.kind !== "cut_in_retreat") return false;
  return scheduleRealtimeVoicePause({
    channel: "primary",
    delayMs: organicBeat.timing.overlapMs,
    holdMs: organicBeat.timing.speakerDuckMs,
  });
}
const SIGNAL_OPENING_ADVANCE_ATTEMPTS = 2;
const SIGNAL_SHOW_CARD_QUIP_INITIAL_DELAY_MS = 4_800;
const SIGNAL_SHOW_CARD_QUIP_VISIBLE_MS = 5_600;
const SIGNAL_SHOW_CARD_QUIP_GAP_MS = 14_000;
const SIGNAL_HOST_CHAT_RECOVERY_LIMIT = 3;
const SIGNAL_HOST_CHAT_USER_BUBBLE_MS = 9_200;
const SIGNAL_HOST_CHAT_STREAM_CHUNK_MS = 34;

type SignalHostChatBubble = {
  key: string;
  message: BotcastShowHostChatMessage;
  lifetimeMs: number;
};

function signalHostChatAssistantBubbleMs(content: string): number {
  return Math.min(42_000, Math.max(14_000, 8_000 + content.length * 42));
}

function signalHostChatStreamChunks(content: string): string[] {
  return content.match(/\S+\s*/gu) ?? (content ? [content] : []);
}

type PreparedBotcastAdvanceResult =
  | {
      ok: true;
      preparation: PreparedTurnV1;
      preparationTimedOut: boolean;
    }
  | { ok: false; error: unknown };

type PreparedBotcastAdvance = {
  episodeId: string;
  afterMessageId: string;
  controller: AbortController;
  preparationId: string | null;
  prefetchedMessageId: string | null;
  result: Promise<PreparedBotcastAdvanceResult>;
  settled: boolean;
};

type SignalModelWarmup = {
  phase: ModelWarmupIntermissionPhase;
  model: string | null;
  startedAt: string | null;
  failure: import("@localai/shared").ModelPreparationFailure | null;
  initial: boolean;
  episodeId: string | null;
};

type SignalErrorCopyState = "copying" | "copied" | "failed";

type SignalErrorToast = {
  summary: string;
  diagnosticReport: string;
  copyState: SignalErrorCopyState | null;
};

export interface BotcastExperienceProps {
  bots: BotcastBotSummary[];
  botGroups?: readonly BotPickerGroup[];
  initialCastBotIds?: string[];
  request: BotcastApiRequest;
  preferredProvider: "local" | "ollama_cloud" | "openai" | "anthropic";
  hostChatProvider: "local" | "ollama_cloud" | "openai" | "anthropic";
  preferredImageProvider: "local" | "openai";
  assetRailGeneration?: (
    kind: "signal_studio" | "signal_logo",
  ) => AssetRailGenerationControl;
  modelOptions: BotcastModelOption[];
  /** Account-global draft selection; empty means Auto. */
  modelChoice?: string;
  onModelChoiceChange?: (value: string) => void;
  /** Request-scoped Max overdrive for a fixed Signal model. */
  reasoningEffort?: ProviderReasoningEffort;
  responseMode: BotcastEpisodeResponseMode;
  theme?: "light" | "dark";
  liveConversationPanelExpanded?: boolean;
  renderBotGlyph: BotPickerGlyphRenderer;
  /** Library bot chip menu — same surface as Zen/Chat bot chips. */
  onBotContextMenu?: (botId: string, x: number, y: number) => void;
  onBotContextLongPressStart?: (
    event: ReactPointerEvent<HTMLElement>,
    botId: string,
  ) => void;
  onBotContextLongPressMove?: (event: ReactPointerEvent<HTMLElement>) => void;
  onBotContextLongPressEnd?: (event: ReactPointerEvent<HTMLElement>) => void;
  renderAvatar?: (
    bot: BotcastBotSummary,
    state: {
      talking: boolean;
      thinking: boolean;
      sipping: boolean;
      avatarColorCycle?: boolean;
      replayAudioMaster?: boolean;
      role: "host" | "guest";
      surface: "archive" | "dashboard" | "stage" | "alignment";
      sfxEnabled: boolean;
      sfxVoiceBusGain?: number;
      facing?: "left" | "right";
      theme?: "light" | "dark";
      mouthShape: ZenLiveBotMouthShape;
      voiceLightTarget?: string;
      voiceLightLevel?: number;
      eyeTimelineMs?: number;
      eyeStateStartedAtMs?: number;
    },
  ) => ReactNode;
  renderMug?: (
    bot: BotcastBotSummary,
    state: {
      role: "host" | "guest";
      facing?: "left" | "right";
      theme?: "light" | "dark";
      visual: CoffeeCupVisualState;
    },
  ) => ReactNode;
  resolveCupRateMultiplier?: (bot: BotcastBotSummary) => number;
  resolveAvatarVisibilityMode?: (
    bot: BotcastBotSummary,
  ) => BotPowerAvatarVisibilityModeV1 | null;
  resolveAvatarScaleMode?: (
    bot: BotcastBotSummary,
  ) => BotPowerAvatarScaleMode | null;
  resolveAvatarColorCycle?: (bot: BotcastBotSummary) => boolean;
  resolveThinkingAudible?: (bot: BotcastBotSummary) => boolean;
  onUtterance?: (
    message: BotcastMessage,
    bot: BotcastBotSummary,
    lifecycle: VoicePlaybackLifecycle,
    voiceLevel: number,
    stereoPan: number,
    channel?: "primary" | "handoff",
  ) => boolean | Promise<boolean>;
  onPrefetchUtterance?: (
    message: BotcastMessage,
    bot: BotcastBotSummary,
    context?: { signalTurnPreparationId?: string },
  ) => boolean | Promise<boolean> | void;
  premiumVoicePrefetchEnabled?: boolean;
  onInvalidatePrefetchedUtterance?: (
    episodeId: string,
    messageId: string,
  ) => void;
  onInvalidatePrefetchedEpisode?: (episodeId: string) => void;
  onPrefetchListenerReaction?: (
    plan: ListenerReactionPlanV1,
    bot: BotcastBotSummary,
    interruptedBot?: BotcastBotSummary,
    context?: { signalTurnPreparationId?: string },
  ) => void;
  onListenerReaction?: (
    plan: ListenerReactionPlanV1,
    bot: BotcastBotSummary,
    stereoPan: number,
    retortDelayMs?: number,
    lifecycles?: SignalListenerReactionVoiceLifecycles,
  ) => boolean | Promise<boolean>;
  onStudioIncidentDialogue?: (
    dialogue: {
      incidentId: string;
      beatIndex: number;
      beat: Extract<SignalStudioIncidentBeatV1, { kind: "dialogue" }>;
    },
    bot: BotcastBotSummary,
    lifecycle: VoicePlaybackLifecycle,
    stereoPan: number,
  ) => boolean | Promise<boolean>;
  onPrepareUtterance?: () => void;
  onResponseCueGeneration?: (args: {
    botId: string;
    trigger: "interruption" | "redirect" | null;
    sessionId: string;
  }) => () => Promise<void>;
  onPrewarmResponseCue?: (botId: string) => void;
  presenceBeat?: BotPresenceBeatV1 | null;
  presenceBeats?: readonly BotPresenceBeatV1[];
  onStopUtterance?: () => void;
  onReleaseUtterance?: (fadeMs?: number) => void;
  onProducerGuestActionSfx?: (message: BotcastMessage) => void;
  introAudioEnabled?: boolean;
  introAudioVolume?: number;
  recordingVoiceSelection: ReplayVoiceSelectionSnapshotV2;
  onRecordingStateChange?: (active: boolean) => void;
  /** Notify the app shell when Signal locks live chrome (navbar collapse). */
  onLiveSessionActiveChange?: (
    active: boolean,
    sessionId: string | null,
  ) => void;
  /** Signal has reached a terminal episode state; transient session receipts can close. */
  onSessionEnded?: (sessionId: string) => void;
  /** Rendered below the live stage and producer controls, never as stage chrome. */
  signalMemoryReceiptDetail?: ReactNode;
  /** Quiet locked routing summary while the episode is live. */
  lockedRoutingChip?: LiveSessionRoutingChipLabels | null;
  /**
   * Resolve the live header chip from Signal's locked picker value.
   * Preferred over a static chip so Auto vs concrete labels stay in sync.
   */
  resolveLockedRoutingChip?: (args: {
    modelChoice: string;
    modelProvider: "local" | "ollama_cloud" | "openai" | "anthropic";
    activeAutoRoute: SignalActiveAutoRoute | null;
    lockedReasoningEffort: ProviderReasoningEffort | null;
  }) => LiveSessionRoutingChipLabels | null;
  navigationHeader:
    | ReactNode
    | ((state: {
        liveSessionActive: boolean;
        replayActive: boolean;
        showLiveExit: boolean;
        cuttingShow: boolean;
        onCutShow: () => void;
        episodeModelControl: {
          value: string;
          onChange: (value: string) => void;
          disabled: boolean;
          disabledReason?: string;
        };
        /** Latest server-persisted Auto completion for this exact episode. */
        activeAutoRoute: SignalActiveAutoRoute | null;
      }) => ReactNode);
  onCreateSlateStory?: (source: {
    episodeId: string;
    title: string;
    transcript: string;
  }) => Promise<void>;
  producerName?: string;
  renderProducerGuestComposer?: (
    state: BotcastProducerGuestComposerState,
  ) => ReactNode;
  /**
   * Compact composer for booking/setup fields.
   * Session shortcut language stays in immersive Zen; these fields are ordinary text.
   */
  renderPickAwareComposer?: (state: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    disabled?: boolean;
    multiline?: boolean;
    ariaLabel?: string;
    className?: string;
    onBlur?: (value: string) => void;
  }) => ReactNode;
  /** Identity helper kept for shared wiring; Signal no longer expands shortcut language. */
  expandComposerDraft?: (rawDraft: string) => string | Promise<string>;
  /**
   * When true, producer guest answers get the send-time autocorrect pass as
   * they enter the queue. The Signal composer itself never runs live assist.
   */
  autoCorrectGuestAnswerEnabled?: boolean;
  orchestrationLaunch?: {
    token: string;
    showId: string;
    guestBotId: string;
    topic: string;
    producerBrief: string;
  } | null;
  onOrchestrationLaunchConsumed?: (token: string) => void;
}

type BotcastLiveSpeech = SignalLiveSpeechState;

type SignalEpisodePreRoll = {
  showId: string;
  showName: string;
  guestName: string;
  topic: string;
  phase: "preparing" | "landing";
  source: "local" | "elevenlabs";
};

type SignalEpisodeOutro = {
  episodeId: string;
  episode: BotcastEpisode;
  showName: string;
  phase: "curtain" | "holding" | "complete";
  forced: boolean;
  discarded: boolean;
};

type SignalReplayOpenOptions = {
  preserveEpisodeOperation?: boolean;
  initialPosition?: "start" | "end";
};

const SIGNAL_EPISODE_OUTRO_DEAD_AIR_MS = 2_000;
const SIGNAL_LIVE_CAMERA_POST_SPEECH_HOLD_MS = 900;
/**
 * Replay audio starts on the saved master clock. Advance only the intro
 * animation so that clock does not begin under the opening black curtain.
 */
const SIGNAL_REPLAY_INTRO_VISUAL_HEAD_START_MS = 1_100;

type SignalReviewCopyState = {
  episodeId: string;
  phase: "copying" | "copied" | "failed";
};

type SignalBookingSuggestionOperation = "booking" | "lucky";

type SignalAssetSlot = "day-studio" | "night-studio" | "logo";
type SignalArtworkKind = SignalAssetSlot;

const SIGNAL_BOT_PICKER_TILE = {
  tileSize: 78,
  glyphSize: 27,
  glyphStroke: 1.7,
  namedFlatTile: true,
} as const;

function signalPickerGroupsForBots(
  bots: readonly BotcastBotSummary[],
  groups: readonly BotPickerGroup[],
): BotPickerGroup[] {
  const botIds = new Set(bots.map((bot) => bot.id));
  return [
    {
      id: "all",
      name: "All bots",
      botIds: bots.map((bot) => bot.id),
      count: bots.length,
    },
    ...groups
      .map((group) => {
        const groupBotIds = group.botIds.filter((botId) => botIds.has(botId));
        return {
          ...group,
          botIds: groupBotIds,
          count: groupBotIds.length,
        };
      })
      .filter((group) => group.botIds.length > 0),
  ];
}

function signalBotDropdownHue(bot: BotcastBotSummary): number | null {
  const color = bot.color?.trim();
  if (!color || !/^#[0-9a-f]{6}$/iu.test(color)) return null;
  const { h, s } = hexToHsl(color);
  return s > 0.06 ? h : null;
}

function signalCircularHueDistance(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}

function SignalBotDropdown({
  bots,
  selectedId,
  searchValue,
  onSearchChange,
  onSelect,
  ariaLabel,
  listboxId,
  theme,
  renderBotGlyph,
  disabled = false,
}: {
  bots: readonly BotcastBotSummary[];
  selectedId: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelect: (botId: string) => void;
  ariaLabel: string;
  listboxId: string;
  theme: "light" | "dark";
  renderBotGlyph: BotPickerGlyphRenderer;
  disabled?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [hueLensCenter, setHueLensCenter] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const normalizedSearch = searchValue.trim().toLocaleLowerCase();
  const visibleBots = useMemo(() => {
      const filteredBots = bots.filter(
        (bot) =>
          normalizedSearch.length === 0 ||
          bot.name.toLocaleLowerCase().includes(normalizedSearch),
      );
      return sortBotPickerItems(
        filteredBots,
        hueLensCenter !== null,
        (left, right) => {
          const leftHue = signalBotDropdownHue(left);
          const rightHue = signalBotDropdownHue(right);
          if (leftHue === null && rightHue !== null) return 1;
          if (leftHue !== null && rightHue === null) return -1;
          if (leftHue !== null && rightHue !== null && leftHue !== rightHue) {
            return leftHue - rightHue;
          }
          return left.name.localeCompare(right.name);
        },
      );
  }, [bots, hueLensCenter, normalizedSearch]);
  const hueFocusBotId = useMemo(() => {
    if (hueLensCenter === null) return null;
    let closestBotId: string | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const bot of visibleBots) {
      const hue = signalBotDropdownHue(bot);
      if (hue === null) continue;
      const distance = signalCircularHueDistance(hue, hueLensCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestBotId = bot.id;
      }
    }
    return closestBotId;
  }, [hueLensCenter, visibleBots]);
  const selectedBot = bots.find((bot) => bot.id === selectedId) ?? null;
  const selectedAccent = normalizeAccentForTheme(
    selectedBot?.color ?? "#8d7cff",
    theme,
  );
  const menuOpen = open && !disabled;
  const resultLabel =
    visibleBots.length === 0
      ? "No bots match this view."
      : `${visibleBots.length} bot${visibleBots.length === 1 ? "" : "s"}`;

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsidePointer = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleOutsidePointer);
    return () =>
      document.removeEventListener("mousedown", handleOutsidePointer);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [menuOpen]);

  useEffect(() => {
    if (!disabled || !open) return;
    const timeout = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [disabled, open]);

  useEffect(() => {
    if (!menuOpen || !hueFocusBotId) return;
    const timeout = window.setTimeout(() => {
      optionRefs.current.get(hueFocusBotId)?.scrollIntoView({
        block: "center",
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [hueFocusBotId, menuOpen]);

  const pickBot = (botId: string): void => {
    onSelect(botId);
    onSearchChange("");
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      className={styles.signalBotDropdown}
      data-open={menuOpen ? "true" : undefined}
      data-selected={selectedBot ? "true" : undefined}
      style={
        {
          ["--signal-picker-accent" as string]: selectedAccent,
        } as CSSProperties
      }
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.signalBotDropdownTrigger}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-controls={listboxId}
        aria-label={`${ariaLabel}${selectedBot ? `: ${selectedBot.name}` : ""}`}
        disabled={disabled || bots.length === 0}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className={styles.signalBotDropdownTriggerGlyph}
          aria-hidden="true"
        >
          {renderBotGlyph(selectedBot?.glyph ?? null, {
            size: 18,
            strokeWidth: 2,
          })}
        </span>
        <span className={styles.signalBotDropdownTriggerName}>
          {selectedBot?.name ?? "Choose a host"}
        </span>
        <span
          className={styles.signalBotDropdownTriggerChevron}
          aria-hidden="true"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 3.5 L5 6.5 L8 3.5" />
          </svg>
        </span>
      </button>
      {menuOpen ? (
        <div ref={menuRef} className={styles.signalBotDropdownMenu}>
          <BotPickerToolbar
            className={styles.signalBotDropdownToolbar}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            searchAriaLabel={`Search ${ariaLabel.toLocaleLowerCase()}`}
            searchPlaceholder="Search bots…"
            resultLabel={resultLabel}
            compact
          />
          <div
            className={styles.signalBotDropdownHueLens}
            data-active={hueLensCenter !== null ? "true" : undefined}
          >
            <span>Hue</span>
            <input
              type="range"
              min="0"
              max="359"
              step="1"
              value={hueLensCenter ?? 180}
              onChange={(event) =>
                setHueLensCenter(Number(event.currentTarget.value))
              }
              aria-label="Browse Signal hosts by hue"
            />
            <button
              type="button"
              onClick={() => setHueLensCenter(null)}
              disabled={hueLensCenter === null}
              aria-label="Clear Signal host hue lens"
            >
              ×
            </button>
          </div>
          <div
            id={listboxId}
            className={styles.signalBotDropdownListbox}
            role="listbox"
            aria-label={ariaLabel}
          >
            {visibleBots.map((bot) => {
              const selected = bot.id === selectedId;
              const accent = normalizeAccentForTheme(
                bot.color ?? "#8d7cff",
                theme,
              );
              return (
                <button
                  key={bot.id}
                  ref={(node) => {
                    if (node) {
                      optionRefs.current.set(bot.id, node);
                    } else {
                      optionRefs.current.delete(bot.id);
                    }
                  }}
                  type="button"
                  className={styles.signalBotDropdownOption}
                  role="option"
                  aria-selected={selected}
                  data-bot-id={bot.id}
                  style={
                    {
                      ["--signal-picker-accent" as string]: accent,
                    } as CSSProperties
                  }
                  onClick={() => pickBot(bot.id)}
                >
                  <span
                    className={styles.signalBotDropdownOptionGlyph}
                    aria-hidden="true"
                  >
                    {renderBotGlyph(bot.glyph, {
                      size: 20,
                      strokeWidth: 2,
                    })}
                  </span>
                  <span className={styles.signalBotDropdownOptionName}>
                    {bot.name}
                  </span>
                  {selected ? (
                    <span
                      className={styles.signalBotDropdownOptionSelected}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
            {visibleBots.length === 0 ? (
              <p className={styles.signalBotPickerEmpty}>No bots found.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const SIGNAL_ASSET_ACCEPT = "image/png,image/jpeg,image/webp";
const SIGNAL_ASSET_UPLOAD_MAX_BYTES = 16 * 1024 * 1024;
const SIGNAL_EPISODE_IMAGE_ACCEPT = ".png,.jpg";

type SignalEpisodeImageUpload = {
  episodeId: string;
  imageId: string;
  fileName: string;
  dataUrl: string;
  /** Completed/cancelled booking whose authenticated replay proxy is reused. */
  archivalProxyEpisodeId?: string;
  descriptor: BotcastEpisodeImageDescriptor;
  /** Automatically chosen, pixel-free visual used when replay cannot resolve the image. */
  replayEmoji: string;
  /** Private request-scoped direction; never persisted in Signal events. */
  reason: string;
};

type SignalSetupEpisodeImage = Omit<SignalEpisodeImageUpload, "episodeId">;

type SignalEpisodeStartOverride = SignalLuckyLaunchSetup<BotcastShow> & {
  setupEpisodeImage: SignalSetupEpisodeImage | null;
  watchAutoStart?: boolean;
};

function SignalEpisodeImageVisual({
  context,
  episodeId,
  replay = false,
  ephemeralDataUrl,
}: {
  context: BotcastImageContextV1;
  episodeId: string;
  replay?: boolean;
  ephemeralDataUrl?: string | null;
}): React.JSX.Element {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const replayProxySource =
    replay && context.replayProxyId
      ? `/api/botcast/episodes/${encodeURIComponent(episodeId)}/image-proxy`
      : null;
  const savedSource = context.savedAssetId
    ? `/api/images/${encodeURIComponent(context.savedAssetId)}/file`
    : null;
  const source =
    replayProxySource && failedSource !== replayProxySource
      ? replayProxySource
      : !replay && ephemeralDataUrl && failedSource !== ephemeralDataUrl
        ? ephemeralDataUrl
        : (!replay || !context.replayProxyId) &&
            savedSource &&
            failedSource !== savedSource
          ? savedSource
          : null;
  const label =
    context.kind === "item"
      ? context.name
      : `Picture of ${context.name}`;
  if (source) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- session-only data or authenticated local asset URL.
      <img src={source} alt={label} onError={() => setFailedSource(source)} />
    );
  }
  if (replay && context.replayProxyId) {
    return (
      <span
        className={styles.episodeImageReplayUnavailable}
        role="img"
        aria-label={`${label}; replay image unavailable`}
      >
        Image unavailable
      </span>
    );
  }
  return (
    <span className={styles.episodeImageReplayEmoji} role="img" aria-label={label}>
      {context.replayEmoji}
    </span>
  );
}

const SIGNAL_STUDIO_LAYOUT_LABELS: Record<BotcastStudioLayoutItem, string> = {
  hostBot: "host bot",
  guestBot: "guest bot",
  hostCup: "host cup",
  guestCup: "guest cup",
  hostFloorGlow: "host floor glow",
  guestFloorGlow: "guest floor glow",
};
const SIGNAL_STUDIO_FLOOR_GLOW_DRAG_SCALE_PER_STAGE = 2;

function signalStudioLayoutItemIsFloorGlow(
  item: BotcastStudioLayoutItem,
): item is "hostFloorGlow" | "guestFloorGlow" {
  return item === "hostFloorGlow" || item === "guestFloorGlow";
}

function signalStudioFloorGlowRole(
  item: BotcastStudioLayoutItem,
): "host" | "guest" | null {
  if (item === "hostFloorGlow") return "host";
  if (item === "guestFloorGlow") return "guest";
  return null;
}

function signalStudioFacingForRole(
  layout: BotcastStudioLayout,
  role: "host" | "guest",
): "left" | "right" {
  const ownX = layout[role === "host" ? "hostBot" : "guestBot"].x;
  const otherX = layout[role === "host" ? "guestBot" : "hostBot"].x;
  if (ownX === otherX) return role === "host" ? "right" : "left";
  return ownX < otherX ? "right" : "left";
}

function signalEpisodeImagePlacementStyle(
  placement: Readonly<BotcastEpisodeImagePlacement>,
  kind: BotcastImageContextV1["kind"],
): CSSProperties {
  return {
    ["--signal-episode-image-x" as string]: `${placement.x}%`,
    ["--signal-episode-image-y" as string]: `${placement.y}%`,
    ["--signal-episode-image-scale" as string]:
      signalEpisodeImageScale(placement, kind) / 100,
  };
}

function signalLogoPlacementStyle(
  placement: Readonly<BotcastLogoPlacement>,
): CSSProperties {
  return {
    ["--signal-logo-x" as string]: `${placement.x}%`,
    ["--signal-logo-y" as string]: `${placement.y}%`,
    ["--signal-logo-scale" as string]: placement.scale / 100,
  };
}

function signalProducerGuestBotSummary(
  episode: Pick<BotcastEpisode, "guestName" | "responseMode">,
  accentColor: string | null | undefined,
): BotcastBotSummary {
  return {
    id: BOTCAST_PRODUCER_GUEST_ID,
    name: episode.guestName ?? BOTCAST_PRODUCER_GUEST_NAME,
    color: accentColor ?? null,
    glyph: null,
    // The Producer is the player, so their voice follows the episode's privacy
    // boundary instead of inheriting a fictional bot's online eligibility.
    online_enabled: episode.responseMode === "local" ? 0 : 1,
    muted: false,
    personaTemperament: "neutral",
    producerGuest: true,
  };
}

type SignalBlockingOperation = {
  title: string;
  detail: string;
  stepLabel: string;
  progress: number | null;
  cancellable: boolean;
};

type SignalStudioCutConfirmation =
  | {
      kind: "generate";
      recordingId: string;
      intent: ReplayPremiumAudioActionV1;
      eligibility: ReplayStudioCutEligibilityV1;
    }
  | {
      kind: "remove";
      recordingId: string;
    };

type SignalStudioLayoutDrag = {
  pointerId: number;
  showId: string;
  item: BotcastStudioLayoutItem;
  startClientX: number;
  startClientY: number;
  stageWidth: number;
  stageHeight: number;
  startLayout: BotcastStudioLayout;
  latestLayout: BotcastStudioLayout;
};

type SignalEpisodeImagePlacementDrag = {
  pointerId: number;
  shot: BotcastDirectedCameraShot;
  startClientX: number;
  startClientY: number;
  stageWidth: number;
  stageHeight: number;
  startPlacement: BotcastEpisodeImagePlacement;
};

type SignalLogoPlacementDrag = {
  pointerId: number;
  show: BotcastShow;
  startClientX: number;
  startClientY: number;
  stageWidth: number;
  stageHeight: number;
  startPlacement: BotcastLogoPlacement;
};

type SignalCupTravelState = {
  mode: "idle" | "sipping" | "returning";
  returnDeltaX: number | null;
  returnDeltaY: number | null;
  sipFaceActive: boolean;
};

type SignalCupTravelByRole = Record<"host" | "guest", SignalCupTravelState>;

function initialSignalCupTravelByRole(): SignalCupTravelByRole {
  return {
    host: {
      mode: "idle",
      returnDeltaX: null,
      returnDeltaY: null,
      sipFaceActive: false,
    },
    guest: {
      mode: "idle",
      returnDeltaX: null,
      returnDeltaY: null,
      sipFaceActive: false,
    },
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function readSignalAssetFile(file: File): Promise<string> {
  if (!SIGNAL_ASSET_ACCEPT.split(",").includes(file.type)) {
    return Promise.reject(new Error("Choose a PNG, JPEG, or WebP image."));
  }
  if (file.size <= 0 || file.size > SIGNAL_ASSET_UPLOAD_MAX_BYTES) {
    return Promise.reject(new Error("Choose an image smaller than 16 MB."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("Signal could not read that image."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Signal could not read that image."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function readSignalEpisodeImageFile(
  file: File,
): Promise<Pick<SignalEpisodeImageUpload, "fileName" | "dataUrl" | "descriptor">> {
  const descriptor = botcastEpisodeImageDescriptorFromFileName(
    file.name,
    file.type,
  );
  if (!descriptor) {
    throw new Error(
      "Choose a .png or .jpg file. Signal does not accept .jpeg or other image formats here.",
    );
  }
  const dataUrl = await readSignalAssetFile(file);
  if (descriptor.kind === "item") {
    const image = new window.Image();
    image.decoding = "async";
    image.src = dataUrl;
    await image.decode();
    const scale = Math.min(1, 1536 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Signal could not inspect that PNG.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hasVisibleTransparency = false;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 255) {
        hasVisibleTransparency = true;
        break;
      }
    }
    if (!hasVisibleTransparency) descriptor.kind = "picture";
  }
  return { fileName: file.name, dataUrl, descriptor };
}

function acquireSignalEpisodeImageReplayMetadata(
  fileInput: Pick<
    SignalEpisodeImageUpload,
    "fileName" | "dataUrl" | "descriptor"
  >,
): Promise<{
  descriptor: BotcastEpisodeImageDescriptor;
  replayEmoji: string;
}> {
  const fallbackEmoji = debateEvidenceEmojiForObject(
    fileInput.descriptor.name,
  );
  // Replay proxies are generated server-side when the image joins an episode;
  // keep this legacy-shaped helper local so setup never performs a model call.
  return Promise.resolve({
    descriptor: fileInput.descriptor,
    replayEmoji: fallbackEmoji,
  });
}

type SignalDeleteTarget =
  | {
      kind: "show";
      id: string;
      name: string;
      episodeCount: number;
    }
  | {
      kind: "episode";
      id: string;
      showId: string;
      title: string;
      status: BotcastEpisodeSummary["status"];
    };

function deleteConfirmationCopy(target: SignalDeleteTarget): {
  title: string;
  body: string;
  action: string;
} {
  if (target.kind === "show") {
    const archiveCopy = target.episodeCount
      ? `, ${target.episodeCount} episode${target.episodeCount === 1 ? "" : "s"}, and every transcript and replay`
      : "";
    return {
      title: `Delete “${target.name}”?`,
      body: `This permanently removes the show${archiveCopy}. Saved studio and logo artwork stays in Images.`,
      action: "Delete show",
    };
  }
  if (target.status === "live") {
    return {
      title: `Discard “${target.title}”?`,
      body: "This stops the rundown and permanently removes the live episode, its transcript, and producer cues. The show stays.",
      action: "Discard episode",
    };
  }
  return {
    title: `Delete “${target.title}”?`,
    body: "This permanently removes the episode and replay. The show stays.",
    action: "Delete episode",
  };
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Signal request failed.";
  if (/database is locked|SQLITE_BUSY/iu.test(error.message)) {
    return "Signal is finishing another save. Try again in a moment.";
  }
  return error.message;
}

function signalErrorToast(
  operation: string,
  error: unknown,
  stage = "request",
): SignalErrorToast {
  const summary = typeof error === "string" ? error : errorMessage(error);
  return {
    summary,
    diagnosticReport: buildWebDiagnosticReport({
      app: "PRISM",
      appVersion: PRISM_APP_VERSION,
      surface: "Signal",
      operation,
      stage,
      summary,
      error,
    }),
    copyState: null,
  };
}

async function writeSignalReviewClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // LAN dev over plain HTTP may require the explicit legacy copy path.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy command failed.");
    }
  } finally {
    textarea.remove();
  }
}

function signalReviewCopyLabel(
  state: SignalReviewCopyState | null,
  episodeId: string,
): string {
  if (state?.episodeId !== episodeId) return "Copy for Signal Review";
  if (state.phase === "copying") return "Copying…";
  return state.phase === "copied"
    ? "Signal Review copied"
    : "Copy failed — try again";
}

function runtimeLabel(runtimeMs: number | null): string {
  if (runtimeMs == null) return "Live";
  const totalSeconds = Math.max(0, Math.round(runtimeMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function signalEpisodeRuntimeMs(
  episode: Pick<
    BotcastEpisode,
    | "status"
    | "startedAt"
    | "completedAt"
    | "runtimeMs"
    | "modelWarmupHoldDurationMs"
    | "modelWarmupHoldStartedAt"
    | "sessionClockHoldDurationMs"
    | "sessionClockHoldStartedAt"
    | "guestKind"
    | "events"
  >,
  nowMs: number,
  activeThinkingStartedAtMs: number | null = null,
  activeThinkingEndedAtMs: number | null = null,
  /**
   * Full ON AIR freeze while any thinking presentation is on screen (bot or
   * Producer guest).
   */
  presentedThinkingFreeze: {
    accumulatedMs: number;
    startedAtMs: number | null;
  } | null = null,
  clientRecordedForegroundHoldMs = 0,
): number {
  if (episode.runtimeMs !== null) return Math.max(0, episode.runtimeMs);
  const startedAtMs = Date.parse(episode.startedAt);
  if (!Number.isFinite(startedAtMs)) return 0;
  const completedAtMs = episode.completedAt
    ? Date.parse(episode.completedAt)
    : Number.NaN;
  const endMs = Number.isFinite(completedAtMs) ? completedAtMs : nowMs;
  const sessionClockHoldStartedAt =
    episode.sessionClockHoldStartedAt ?? episode.modelWarmupHoldStartedAt;
  const activeWarmupStartedAtMs = sessionClockHoldStartedAt
    ? Date.parse(sessionClockHoldStartedAt)
    : Number.NaN;
  const activeWarmupMs =
    episode.status === "live" && Number.isFinite(activeWarmupStartedAtMs)
      ? Math.max(0, nowMs - activeWarmupStartedAtMs)
      : 0;
  const presentedFreezeOpenMs =
    presentedThinkingFreeze?.startedAtMs !== null &&
    presentedThinkingFreeze?.startedAtMs !== undefined &&
    Number.isFinite(presentedThinkingFreeze.startedAtMs)
      ? Math.max(0, nowMs - presentedThinkingFreeze.startedAtMs)
      : 0;
  const presentedFreezeMs =
    Math.max(0, presentedThinkingFreeze?.accumulatedMs ?? 0) +
    presentedFreezeOpenMs;
  // Active Producer-guest half-speed only when a full presented-thinking freeze
  // is not already covering that wall interval.
  const activeThinkingWallMs =
    presentedFreezeMs === 0 &&
    episode.guestKind === "producer" &&
    activeThinkingStartedAtMs !== null &&
    Number.isFinite(activeThinkingStartedAtMs)
      ? Math.max(
          0,
          Math.min(nowMs, activeThinkingEndedAtMs ?? nowMs) -
            activeThinkingStartedAtMs,
        )
      : 0;
  const thinkingDiscountMs =
    botcastProducerGuestThinkingDiscountMs(episode.events) +
    activeThinkingWallMs * (1 - BOTCAST_PRODUCER_GUEST_THINKING_TIME_SCALE) +
    presentedFreezeMs;
  return Math.max(
    0,
    endMs -
      startedAtMs -
      Math.max(
        0,
        (episode.sessionClockHoldDurationMs ??
          episode.modelWarmupHoldDurationMs) -
          Math.max(0, clientRecordedForegroundHoldMs),
      ) -
      activeWarmupMs -
      thinkingDiscountMs,
  );
}

/**
 * Keep the on-air clock local to its two text nodes. A timer in the Signal
 * owner used to reconcile the complete studio every second, which produced a
 * matching one-per-second frame stall and made native producer input wait.
 */
function SignalEpisodeRuntimeClock(props: {
  status: BotcastEpisode["status"];
  runtimeMsAt: (nowMs: number) => number;
}): ReactNode {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (props.status !== "live") return;
    const update = (): void => setNowMs(Date.now());
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [props.status]);

  const label = runtimeLabel(props.runtimeMsAt(nowMs));
  return (
    <span
      className={styles.liveTimer}
      data-running={props.status === "live" ? "true" : undefined}
      aria-label={
        props.status === "live"
          ? `Episode live for ${label}`
          : `Final episode duration ${label}`
      }
    >
      {label}
    </span>
  );
}

function providerLabel(provider: BotcastEpisodeSummary["provider"]): string {
  if (provider === "local") return "LOCAL";
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function episodeModeLabel(
  episode: Pick<BotcastEpisodeSummary, "provider" | "responseMode">,
): string {
  return episode.responseMode === "auto"
    ? "AUTO"
    : providerLabel(episode.provider);
}

function activeShowAtmosphere(
  show: BotcastShow,
  theme: "light" | "dark",
): BotcastShow["atmosphere"] {
  return theme === "light" ? show.dayAtmosphere : show.nightAtmosphere;
}

function SignalStudioMicrophoneTint({
  atmosphere,
  layout,
  hostColor,
  guestColor,
  theme,
  surface = "stage",
}: {
  atmosphere: BotcastShow["atmosphere"];
  layout: BotcastStudioLayout;
  hostColor: string;
  guestColor: string;
  theme: "light" | "dark";
  surface?: "stage" | "dashboard";
}): React.JSX.Element | null {
  if (!atmosphere.microphoneTintMaskUrl) return null;
  const { leftColor, rightColor } = signalStudioSeatColorOrder(
    layout,
    hostColor,
    guestColor,
  );
  return (
    <div
      className={styles.signalMicrophoneTintLayer}
      data-surface={surface}
      style={
        {
          ["--signal-microphone-tint-mask" as string]: `url("${atmosphere.microphoneTintMaskUrl}")`,
          ["--signal-microphone-left-color" as string]: normalizeAccentForTheme(
            leftColor,
            theme,
          ),
          ["--signal-microphone-right-color" as string]:
            normalizeAccentForTheme(rightColor, theme),
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span data-side="left" />
      <span data-side="right" />
    </div>
  );
}

function signalStudioLightingStyle(args: {
  show: BotcastShow;
  layout: BotcastStudioLayout;
  hostColor: string;
  guestColor: string;
  theme: "light" | "dark";
}): CSSProperties | null {
  const lighting = args.show.studioLighting;
  if (lighting?.status !== "ready" || !lighting.imageUrl) return null;
  const tuning = normalizeBotcastStudioGlowTuning(args.show.studioGlowTuning)[
    args.theme
  ];
  return {
    ["--signal-studio-lighting-map" as string]: `url("${lighting.imageUrl}")`,
    ["--signal-studio-glow-opacity" as string]: tuning.opacity,
    ["--signal-studio-glow-blend-mode" as string]: tuning.blendMode,
    ["--signal-studio-host-x" as string]: `${args.layout.hostBot.x}%`,
    ["--signal-studio-host-y" as string]: `${args.layout.hostBot.y}%`,
    ["--signal-studio-guest-x" as string]: `${args.layout.guestBot.x}%`,
    ["--signal-studio-guest-y" as string]: `${args.layout.guestBot.y}%`,
    ["--signal-studio-stage-host-x" as string]: `${signalStudioOverscanCoordinate(args.layout.hostBot.x)}%`,
    ["--signal-studio-stage-host-y" as string]: `${signalStudioOverscanCoordinate(args.layout.hostBot.y)}%`,
    ["--signal-studio-stage-guest-x" as string]: `${signalStudioOverscanCoordinate(args.layout.guestBot.x)}%`,
    ["--signal-studio-stage-guest-y" as string]: `${signalStudioOverscanCoordinate(args.layout.guestBot.y)}%`,
    ["--signal-studio-host-light" as string]: normalizeAccentForTheme(
      args.hostColor,
      args.theme,
    ),
    ["--signal-studio-guest-light" as string]: normalizeAccentForTheme(
      args.guestColor,
      args.theme,
    ),
  };
}

function signalIntroIdentityForShow(
  show: BotcastShow,
  hostBot: BotcastBotSummary | null,
) {
  const seed = `${show.id}:${show.logo.seed}:music:${show.musicIdentity.revision}`;
  return {
    profile: buildSignalMusicProfile({
      temperament: hostBot?.personaTemperament ?? "neutral",
      seed,
      premise: show.premise,
      hostingStyle: show.hostingStyle,
      studioIdentity: show.studioIdentity,
    }),
    seed,
  } as const;
}

function episodeOutcomeLabel(
  episode: Pick<BotcastEpisodeSummary, "outcome">,
): string {
  switch (episode.outcome) {
    case "guest_departed":
      return "Guest walked out";
    case "host_departed":
      return "Host ended the show";
    default:
      return "Completed";
  }
}

function signalProducerCueLabel(cue: BotcastProducerCue): string {
  switch (cue.kind) {
    case "ask_about": {
      const quote = cue.directQuote?.trim();
      const detail = cue.detail?.trim();
      if (quote && detail) return `${detail}; say ${quote}`;
      if (quote) return `Say ${quote}`;
      return detail || "Host note";
    }
    case "refocus":
      return "Refocus";
    case "press_harder":
      return "Press harder";
    case "move_on":
      return "Move on";
    case "lighten_up":
      return "Lighten up";
    case "wrap_up":
      return "Wrap it up";
    case "present_image":
      return "Image discussion";
  }
}

function guestHasDeparted(episode: BotcastEpisode): boolean {
  return episode.events.some(
    (event) => botcastDepartureSpeakerRole(event) === "guest",
  );
}

function hostHasDeparted(episode: BotcastEpisode): boolean {
  return episode.events.some(
    (event) => botcastDepartureSpeakerRole(event) === "host",
  );
}

function avatarFallback(bot: BotcastBotSummary): ReactNode {
  return (
    <span className={styles.avatarFallback} aria-hidden="true">
      <span>{bot.glyph?.trim() || bot.name.slice(0, 1).toUpperCase()}</span>
    </span>
  );
}

export function SignalShowLogo({
  show,
  compact = false,
}: {
  show: BotcastShow;
  compact?: boolean;
}): React.JSX.Element {
  if (show.logo.imageUrl) {
    return (
      <span
        className={styles.showLogo}
        data-compact={compact ? "true" : undefined}
        data-generated="true"
      >
        {/* Authenticated generated artwork is already locally sized and cannot use Next's optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={show.logo.imageUrl} alt="" />
      </span>
    );
  }
  const glyph = show.logo.fallbackGlyph;
  return (
    <span
      className={styles.showLogo}
      data-compact={compact ? "true" : undefined}
      data-glyph={glyph}
      data-generated="false"
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        {glyph === "frequency" ? (
          <>
            <path
              className={styles.spectrumP}
              d="M10 26c5-7 9-7 14 0s9 7 14 0 9-7 16 0"
            />
            <path
              className={styles.spectrumS}
              d="M10 38c5-7 9-7 14 0s9 7 14 0 9-7 16 0"
            />
          </>
        ) : glyph === "orbit" ? (
          <>
            <ellipse
              className={styles.spectrumM}
              cx="32"
              cy="32"
              rx="23"
              ry="10"
            />
            <ellipse
              className={styles.spectrumS}
              cx="32"
              cy="32"
              rx="10"
              ry="23"
            />
            <circle className={styles.spectrumRFill} cx="48" cy="24" r="4" />
          </>
        ) : glyph === "aperture" ? (
          <>
            <path
              className={styles.spectrumPFill}
              d="M32 8 45 16 32 31 18 23Z"
            />
            <path className={styles.spectrumRFill} d="m45 16 9 13-20 8-2-6Z" />
            <path className={styles.spectrumIFill} d="m54 29-3 16-21-6 4-2Z" />
            <path className={styles.spectrumSFill} d="m51 45-15 11-10-17h4Z" />
            <path className={styles.spectrumMFill} d="m36 56-18-5 8-12Z" />
          </>
        ) : glyph === "spark" ? (
          <>
            <path
              className={styles.spectrumRFill}
              d="m32 6 5 19 19 7-19 7-5 19-5-19-19-7 19-7Z"
            />
            <circle className={styles.spectrumSFill} cx="50" cy="14" r="4" />
            <circle className={styles.spectrumMFill} cx="14" cy="49" r="3" />
          </>
        ) : (
          <>
            <circle className={styles.spectrumM} cx="32" cy="32" r="23" />
            <text className={styles.spectrumMonogram} x="32" y="42">
              {show.name.trim().slice(0, 1).toUpperCase() || "S"}
            </text>
          </>
        )}
      </svg>
    </span>
  );
}

function SignalReplayBookend({
  kind,
  show,
  episode,
  guestName,
  introSource,
  playing,
  revealed,
  phase,
  landingFadeMs,
  pictureStartMs,
}: {
  kind: "intro" | "outro";
  show: BotcastShow;
  episode: BotcastEpisode;
  guestName: string;
  introSource: "local" | "elevenlabs";
  playing: boolean;
  /** Intro stays black until the first Play; then lockup can fade in and freeze on pause. */
  revealed: boolean;
  /** Live-style landing fade as the intro dissolves into the studio. */
  phase?: "landing";
  /** Custom dissolve length into the wide studio shot. */
  landingFadeMs?: number;
  /**
   * Animation-only picture offset. Positive skips into the intro art; negative
   * delays it (holds the art back vs the audio clock). Never changes when the
   * card cuts away to wide.
   */
  pictureStartMs?: number;
}): React.JSX.Element {
  const isIntro = kind === "intro";
  const introReveal = isIntro ? (revealed ? "open" : "pending") : undefined;
  const dissolveMs =
    typeof landingFadeMs === "number" && Number.isFinite(landingFadeMs)
      ? Math.max(120, Math.round(landingFadeMs))
      : SIGNAL_REPLAY_INTRO_LANDING_FADE_MS;
  const animationHeadStartMs =
    typeof pictureStartMs === "number" && Number.isFinite(pictureStartMs)
      ? Math.round(pictureStartMs)
      : SIGNAL_REPLAY_INTRO_VISUAL_HEAD_START_MS;
  return (
    <section
      className={`${styles.episodePreRoll} ${styles.replayBookend}`}
      data-kind={kind}
      data-replay-bookend={kind}
      data-reveal={introReveal}
      data-phase={phase}
      data-playback={isIntro ? (playing ? "playing" : "paused") : undefined}
      style={
        {
          "--botcast-accent": show.accentColor,
          "--signal-replay-intro-head-start":
            isIntro && revealed ? `${animationHeadStartMs}ms` : "0ms",
          "--signal-replay-intro-landing-ms": `${dissolveMs}ms`,
        } as CSSProperties
      }
      aria-label={`${show.name} episode ${isIntro ? "introduction" : "outro"}`}
      aria-live="polite"
    >
      <div className={styles.preRollSignalField} aria-hidden="true">
        <i />
        <i />
        <i />
        {isIntro ? (
          <>
            <i />
            <i />
          </>
        ) : null}
      </div>
      <div
        className={styles.preRollLockup}
        key={isIntro ? (revealed ? "intro-open" : "intro-pending") : "outro"}
      >
        <span className={styles.preRollEyebrow}>
          {isIntro ? "Signal presents" : "Signal transmission complete"}
        </span>
        <div className={styles.preRollLogo}>
          <SignalShowLogo show={show} />
          {isIntro ? (
            <span className={styles.preRollOrbit} aria-hidden="true" />
          ) : null}
        </div>
        <h1>{show.name}</h1>
        <p>{isIntro ? `With ${guestName}` : "End of episode"}</p>
        {isIntro ? <strong>{episode.topic}</strong> : null}
        {isIntro ? (
          <div className={styles.preRollMeters} aria-hidden="true">
            {Array.from({ length: 11 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
        ) : null}
        <small>
          {isIntro
            ? introSource === "elevenlabs"
              ? "Original ElevenLabs show ident"
              : "Signal Synth · generated locally"
            : "Signal"}
        </small>
      </div>
    </section>
  );
}

function SignalFallbackStudio({
  surface,
  accentVariant,
}: {
  surface: "dashboard" | "stage";
  accentVariant: BotcastShow["fallbackStudioAccentVariant"];
}): React.JSX.Element {
  return (
    <div
      className={styles.signalFallbackStudio}
      data-surface={surface}
      data-accent-variant={accentVariant}
      aria-hidden="true"
    >
      <span className={styles.signalFallbackStudioAccent} />
    </div>
  );
}

function SignalStudioSpotlight(): React.JSX.Element {
  return (
    <span
      className={styles.studioSpotlight}
      data-prism-decorative-motion="true"
      aria-hidden="true"
    >
      <span className={styles.studioSpotlightBeam} />
      <span className={styles.studioSpotlightPool} />
    </span>
  );
}

export function BotcastExperience({
  bots,
  botGroups = [],
  initialCastBotIds = [],
  request,
  preferredProvider,
  hostChatProvider,
  preferredImageProvider,
  assetRailGeneration,
  modelOptions,
  modelChoice,
  onModelChoiceChange,
  reasoningEffort,
  responseMode,
  theme = "dark",
  liveConversationPanelExpanded = false,
  renderBotGlyph,
  onBotContextMenu,
  onBotContextLongPressStart,
  onBotContextLongPressMove,
  onBotContextLongPressEnd,
  renderAvatar,
  renderMug,
  resolveCupRateMultiplier,
  resolveAvatarVisibilityMode,
  resolveAvatarScaleMode,
  resolveAvatarColorCycle,
  resolveThinkingAudible,
  onUtterance,
  onPrefetchUtterance,
  premiumVoicePrefetchEnabled = false,
  onInvalidatePrefetchedUtterance,
  onInvalidatePrefetchedEpisode,
  onPrefetchListenerReaction,
  onListenerReaction,
  onStudioIncidentDialogue,
  onPrepareUtterance,
  onResponseCueGeneration,
  onPrewarmResponseCue,
  presenceBeat,
  presenceBeats = [],
  onStopUtterance,
  onReleaseUtterance,
  onProducerGuestActionSfx,
  introAudioEnabled = true,
  introAudioVolume = 1,
  recordingVoiceSelection,
  onRecordingStateChange,
  onLiveSessionActiveChange,
  onSessionEnded,
  signalMemoryReceiptDetail,
  lockedRoutingChip = null,
  resolveLockedRoutingChip,
  navigationHeader,
  onCreateSlateStory,
  producerName = "You",
  renderProducerGuestComposer,
  renderPickAwareComposer,
  expandComposerDraft,
  autoCorrectGuestAnswerEnabled = false,
  orchestrationLaunch = null,
  onOrchestrationLaunchConsumed,
}: BotcastExperienceProps): React.JSX.Element {
  const eligibleBots = useMemo(
    () => [...bots].sort((a, b) => a.name.localeCompare(b.name)),
    [bots],
  );
  const initialCast = useMemo(() => {
    const availableIds = new Set(bots.map((bot) => bot.id));
    return Array.from(new Set(initialCastBotIds)).filter((botId) =>
      availableIds.has(botId),
    );
  }, [bots, initialCastBotIds]);
  const initialHostBotId = initialCast[0] ?? "";
  const botsById = useMemo(
    () => new Map(eligibleBots.map((bot) => [bot.id, bot])),
    [eligibleBots],
  );
  const cupRateMultiplierForBot = (bot: BotcastBotSummary): number =>
    resolveCupRateMultiplier?.(bot) ?? 1;
  const botHasCoffeeCup = (bot: BotcastBotSummary): boolean =>
    cupRateMultiplierForBot(bot) > 0;
  const modelLabels = useMemo(
    () => new Map(modelOptions.map((option) => [option.id, option.label])),
    [modelOptions],
  );
  const [shows, setShows] = useState<BotcastShow[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<BotcastEpisodeSummary[]>([]);
  const [episode, setEpisode] = useState<BotcastEpisode | null>(null);
  useAppletTranscriptFrameRate("signal", episode?.id, episode?.messages ?? []);
  useLiveSessionFocusEvents("signal", episode?.id, episode?.status === "live");
  useEffect(() => {
    if (!episode || episode.status !== "live") return;
    // Keep Signal speech + rundown alive while visuals sleep on minimize.
    return acquirePrismLivingSession("signal", episode.id);
  }, [episode?.id, episode?.status]);
  const liveEpisodeRef = useRef<BotcastEpisode | null>(null);
  liveEpisodeRef.current = episode;
  const [replayEpisode, setReplayEpisode] = useState<BotcastEpisode | null>(
    null,
  );
  const [persistedPresenceBeats, setPersistedPresenceBeats] = useState<
    BotPresenceBeatV1[]
  >([]);
  const presenceBeatSessionId = replayEpisode?.id ?? episode?.id ?? null;
  useEffect(() => {
    if (!presenceBeatSessionId) {
      setPersistedPresenceBeats([]);
      return;
    }
    const controller = new AbortController();
    void request<{ beats: BotPresenceBeatV1[] }>(
      `/api/presence-beats?surface=signal&sessionId=${encodeURIComponent(presenceBeatSessionId)}`,
      { signal: controller.signal },
    )
      .then(({ beats }) => setPersistedPresenceBeats(beats))
      .catch(() => undefined);
    return () => controller.abort();
  }, [presenceBeatSessionId, request]);
  const visiblePresenceBeats = useMemo(() => {
    const byResponseId = new Map<string, BotPresenceBeatV1>();
    for (const beat of [...persistedPresenceBeats, ...presenceBeats]) {
      if (
        beat.surface === "signal" &&
        beat.sessionId === presenceBeatSessionId
      ) {
        byResponseId.set(beat.responseId, beat);
      }
    }
    return [...byResponseId.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }, [persistedPresenceBeats, presenceBeatSessionId, presenceBeats]);
  const [replayRecording, setReplayRecording] =
    useState<ReplayRecordingV1 | null>(null);
  const replayRecordingId = replayRecording?.id ?? null;
  const [replayManifestV2, setReplayManifestV2] =
    useState<ReplayManifestV2 | null>(null);
  const [replayPlaybackSource, setReplayPlaybackSource] = useState<
    "on-air" | "studio-cut"
  >("on-air");
  const [studioCutBusy, setStudioCutBusy] = useState(false);
  const [studioCutRequestPhase, setStudioCutRequestPhase] = useState<
    "checking" | "retrying" | "starting" | null
  >(null);
  const [studioCutConfirmation, setStudioCutConfirmation] =
    useState<SignalStudioCutConfirmation | null>(null);
  const [studioCutEligibilityState, setStudioCutEligibilityState] =
    useState<ReplayStudioCutEligibilityV1 | null>(null);
  const premiumAutoSelectionRef = useRef<string | null>(null);
  const replayAudioRef = useRef<HTMLAudioElement | null>(null);
  const replayPublishedElapsedMsRef = useRef(0);
  const replayTransportRef = useRef<HTMLDivElement | null>(null);
  const replayTimeRef = useRef<HTMLElement | null>(null);
  const replayRangeRef = useRef<HTMLInputElement | null>(null);
  const signalCaptureSourceIdRef = useRef<string | null>(null);
  const selectedShowRef = useRef<BotcastShow | null>(null);
  const finalizedSignalRecordingIdsRef = useRef(new Set<string>());
  const signalEpisodeCameraFramingSnapshotRef = useRef(
    new Map<string, BotcastCameraFraming>(),
  );
  const [hostDraftId, setHostDraftId] = useState(initialHostBotId);
  const [hostPickerSearch, setHostPickerSearch] = useState("");
  const [showPremiseInspirationDraft, setShowPremiseInspirationDraft] =
    useState("");
  const [guestDraftId, setGuestDraftId] = useState(initialCast[1] ?? "");
  const [guestPickerSearch, setGuestPickerSearch] = useState("");
  const [guestPickerGroupId, setGuestPickerGroupId] = useState("all");
  const [signalGridHueLensCenter, setSignalGridHueLensCenter] = useState<
    number | null
  >(null);
  const signalBotPickerViewportRef = useRef<HTMLDivElement>(null);
  const [topicDraft, setTopicDraft] = useState("");
  const [producerBriefDraft, setProducerBriefDraft] = useState("");
  const [guestBriefDraft, setGuestBriefDraft] = useState("");
  const [producerGuestContextDraft, setProducerGuestContextDraft] =
    useState("");
  const [producerGuestAnswerDraft, setProducerGuestAnswerDraft] = useState("");
  // The on-air answer editor owns keystrokes in its native DOM node. Keeping
  // the live draft in a ref prevents the full Signal stage from reconciling on
  // every character while still giving submission a synchronous source.
  const producerGuestAnswerDraftRef = useRef("");
  const [bookingSuggestionBusy, setBookingSuggestionBusy] =
    useState<SignalBookingSuggestionOperation | null>(null);
  const luckyLaunchRunnerRef = useRef(createSignalLuckyLaunchRunner());
  const luckyLaunchUiInFlightRef = useRef(false);
  const [internalEpisodeModelDraft, setInternalEpisodeModelDraft] =
    useState("");
  const episodeModelDraft = modelChoice ?? internalEpisodeModelDraft;
  const setEpisodeModelDraft = useCallback(
    (value: string): void => {
      if (modelChoice !== undefined) {
        onModelChoiceChange?.(value);
        return;
      }
      setInternalEpisodeModelDraft(value);
    },
    [modelChoice, onModelChoiceChange],
  );
  const [episodeDurationDraft, setEpisodeDurationDraft] =
    useState<BotcastSessionDurationMinutes | null>(null);
  /** live = Produce/Interview; watch = full-bake spectator show. */
  const [playbackModeDraft, setPlaybackModeDraft] = useState<"live" | "watch">(
    "live",
  );
  const [watchAutoStartDraft, setWatchAutoStartDraft] = useState(false);
  const [watchBakeLabel, setWatchBakeLabel] = useState<string | null>(null);
  const [watchBakeArtifact, setWatchBakeArtifact] =
    useState<LiveBakeArtifactV1 | null>(null);
  const [watchBakeStartedAt, setWatchBakeStartedAt] = useState<string | null>(
    null,
  );
  const [watchPlaybackReady, setWatchPlaybackReady] = useState(false);
  const [watchReplayPresentationEpisodeId, setWatchReplayPresentationEpisodeId] =
    useState<string | null>(null);
  const [watchReplayFinalizingEpisodeId, setWatchReplayFinalizingEpisodeId] =
    useState<string | null>(null);
  const watchPlaybackStartResolveRef = useRef<(() => void) | null>(null);
  const openReplayRef = useRef<
    (
      summary: BotcastEpisodeSummary,
      options?: SignalReplayOpenOptions,
    ) => Promise<void>
  >(async () => undefined);
  const [episodeSetupLoadingId, setEpisodeSetupLoadingId] = useState<
    string | null
  >(null);
  const orchestrationLaunchHandledTokenRef = useRef<string | null>(null);
  const orchestrationLaunchStagedTokenRef = useRef<string | null>(null);
  const startEpisodeRef = useRef<
    (override?: SignalEpisodeStartOverride) => Promise<void>
  >(async () => undefined);

  useLayoutEffect(() => {
    const grid = signalBotPickerViewportRef.current?.querySelector<HTMLElement>(
      '[role="radiogroup"]',
    );
    if (grid) grid.scrollTop = 0;
  }, [guestPickerGroupId, guestPickerSearch, signalGridHueLensCenter]);
  const [queuedProducerCue, setQueuedProducerCue] =
    useState<BotcastProducerCue | null>(null);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [signalEpisodeImage, setSignalEpisodeImage] =
    useState<SignalEpisodeImageUpload | null>(null);
  const [setupEpisodeImage, setSetupEpisodeImage] =
    useState<SignalSetupEpisodeImage | null>(null);
  const [keepSignalItem, setKeepSignalItem] = useState(false);
  const [keepSignalItemSaving, setKeepSignalItemSaving] = useState(false);
  const [signalImageCapability, setSignalImageCapability] = useState<{
    episodeId: string;
    provider: "local" | "ollama_cloud" | "openai" | "anthropic";
    model: string;
    modelSelectionKind: "auto" | "fixed";
    supportsImageInput: boolean;
    unavailable?: boolean;
  } | null>(null);
  const [showNameDraft, setShowNameDraft] = useState("");
  const [showPremiseDraft, setShowPremiseDraft] = useState("");
  const [showIdentityControlsShowId, setShowIdentityControlsShowId] = useState<
    string | null
  >(null);
  const [showCardQuipIndex, setShowCardQuipIndex] = useState<number | null>(
    null,
  );
  const [hostChatOpen, setHostChatOpen] = useState(false);
  const [hostChatMessages, setHostChatMessages] = useState<
    BotcastShowHostChatMessage[]
  >([]);
  const [hostChatBubbles, setHostChatBubbles] = useState<
    SignalHostChatBubble[]
  >([]);
  const [hostChatStreamingMessage, setHostChatStreamingMessage] =
    useState<BotcastShowHostChatMessage | null>(null);
  const [hostChatDraft, setHostChatDraft] = useState("");
  const [hostChatBusy, setHostChatBusy] = useState(false);
  const [audiencePulseShowId, setAudiencePulseShowId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [queuedCueStatus, setQueuedCueStatus] = useState<
    BotcastProducerCueLifecycleStatus | null
  >(null);
  const [signalGenerationThinking, setSignalGenerationThinking] = useState<{
    runId: number;
    role: "host" | "guest" | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRun, setAutoRun] = useState(false);
  const [error, setError] = useState<SignalErrorToast | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hostRecovery, setHostRecovery] = useState<BotcastHostRecoveryResponse | null>(null);
  const [hostRecoveryBusy, setHostRecoveryBusy] = useState(false);
  const hostRecoveryRunIdRef = useRef(0);
  const [reviewCopyState, setReviewCopyState] =
    useState<SignalReviewCopyState | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(
    null,
  );
  const [signalPresentedDepartures, setSignalPresentedDepartures] = useState<{
    episodeId: string | null;
    host: boolean;
    guest: boolean;
  }>({ episodeId: null, host: false, guest: false });
  const [liveSpeech, setLiveSpeech] = useState<BotcastLiveSpeech | null>(null);
  const [signalPerformanceCaption, setSignalPerformanceCaption] = useState<{
    messageId: string;
    botId: string;
    text: string;
  } | null>(null);
  const liveSpeechRef = useRef<BotcastLiveSpeech | null>(null);
  liveSpeechRef.current = liveSpeech;
  const audibleHandoffOutgoingMessageIdRef = useRef<string | null>(null);
  const producerGuestHandoffOutgoingMessageRef =
    useRef<BotcastMessage | null>(null);
  const [
    signalPreSpeechPresenceMessageId,
    setSignalPreSpeechPresenceMessageId,
  ] = useState<string | null>(null);
  const [signalEphemeralSpeakingBotIds, setSignalEphemeralSpeakingBotIds] =
    useState<ReadonlySet<string>>(() => new Set());
  const [signalEphemeralSpeechByBotId, setSignalEphemeralSpeechByBotId] =
    useState<ReadonlyMap<string, SignalEphemeralSpeech>>(() => new Map());
  const [hostInterruptionOrdinal, setHostInterruptionOrdinal] = useState(0);
  // The stage reads a coarse wall-clock snapshot whenever another semantic
  // state change already requires a render. Updating this ref never schedules
  // the giant Signal owner by itself; the isolated runtime clock below owns
  // the only unconditional one-second display tick.
  const signalStageNowMsRef = useRef(Date.now());
  const [episodePreRoll, setEpisodePreRoll] =
    useState<SignalEpisodePreRoll | null>(null);
  const [signalModelWarmup, setSignalModelWarmup] =
    useState<SignalModelWarmup | null>(null);
  const [episodeOutro, setEpisodeOutro] = useState<SignalEpisodeOutro | null>(
    null,
  );
  const signalRecordingActive =
    episodePreRoll !== null || episode !== null || episodeOutro !== null;
  const [episodeOutroSfxMutedId, setEpisodeOutroSfxMutedId] = useState<
    string | null
  >(null);
  const [introPreviewShowId, setIntroPreviewShowId] = useState<string | null>(
    null,
  );
  const [cuttingShow, setCuttingShow] = useState(false);
  const [cameraSaving, setCameraSaving] = useState(false);
  const [liveCameraOverride, setLiveCameraOverride] = useState<{
    episodeId: string;
    mode: BotcastCameraShot;
  } | null>(null);
  const [signalCameraPushMessageId, setSignalCameraPushMessageId] = useState<
    string | null
  >(null);
  const [liveCaptionsEnabled, setLiveCaptionsEnabled] = useState(
    DEFAULT_SIGNAL_LIVE_CAPTIONS_ENABLED,
  );
  const [liveCaptionSize, setLiveCaptionSize] = useState(
    DEFAULT_LIVE_CAPTION_SIZE,
  );
  const [liveCameraPostSpeechHoldShot, setLiveCameraPostSpeechHoldShot] =
    useState<SignalDirectedCameraShot | null>(null);
  const [replayElapsedMs, setReplayElapsedMs] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayIntroRevealed, setReplayIntroRevealed] = useState(false);
  const [replayVoicePending, setReplayVoicePending] = useState(false);
  const [replaySpeechActive, setReplaySpeechActive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SignalDeleteTarget | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [blockingOperation, setBlockingOperation] =
    useState<SignalBlockingOperation | null>(null);
  const [artworkJob, setArtworkJob] = useState<SignalArtworkJobSnapshot | null>(
    null,
  );
  const [studioLayoutEditorOpen, setStudioLayoutEditorOpen] = useState(false);
  const [studioStagePresets, setStudioStagePresets] = useState<
    BotcastStagePreset[]
  >([]);
  const [studioStagePresetsLoading, setStudioStagePresetsLoading] =
    useState(false);
  const [studioStagePresetSaving, setStudioStagePresetSaving] = useState(false);
  const [studioStagePresetNameDraft, setStudioStagePresetNameDraft] =
    useState("");
  const [studioSelectedStagePresetId, setStudioSelectedStagePresetId] =
    useState("");
  const [studioFineTuningOpen, setStudioFineTuningOpen] = useState(false);
  const [studioLayoutPreviewTheme, setStudioLayoutPreviewTheme] = useState<
    "light" | "dark"
  >(theme);
  const [studioCameraPreviewShot, setStudioCameraPreviewShot] =
    useState<BotcastDirectedCameraShot>("wide");
  const [studioEpisodeImageKindPreview, setStudioEpisodeImageKindPreview] =
    useState<BotcastImageContextV1["kind"]>("item");
  const [studioLayoutPreviewGuestId, setStudioLayoutPreviewGuestId] =
    useState("");
  const [studioLayoutSaving, setStudioLayoutSaving] = useState(false);
  const [studioCameraFramingSaving, setStudioCameraFramingSaving] =
    useState(false);
  const [studioLogoPlacementSaving, setStudioLogoPlacementSaving] =
    useState(false);
  const [studioGlowTuningSaving, setStudioGlowTuningSaving] = useState(false);
  const [studioVoiceLevelsSaving, setStudioVoiceLevelsSaving] = useState(false);
  const [studioAtmosphereMixSaving, setStudioAtmosphereMixSaving] =
    useState(false);
  const [studioLayoutDraggingItem, setStudioLayoutDraggingItem] =
    useState<BotcastStudioLayoutItem | null>(null);
  const [studioEpisodeImageDraggingShot, setStudioEpisodeImageDraggingShot] =
    useState<BotcastDirectedCameraShot | null>(null);
  const [studioLogoPlacementDragging, setStudioLogoPlacementDragging] =
    useState(false);
  const [studioSoundcheckRunning, setStudioSoundcheckRunning] = useState(false);
  const [studioSoundcheckSpeakerBotId, setStudioSoundcheckSpeakerBotId] =
    useState<string | null>(null);
  const [studioSoundcheckSpeech, setStudioSoundcheckSpeech] = useState<{
    botId: string;
    text: string;
    elapsedMs: number;
    durationMs: number;
    alignment: VoicePlaybackCharacterAlignment | null;
  } | null>(null);
  const [studioSoundcheckCaption, setStudioSoundcheckCaption] = useState<{
    speakerName: string;
    text: string;
  } | null>(null);
  const [signalCupTravelByRole, setSignalCupTravelByRole] =
    useState<SignalCupTravelByRole>(initialSignalCupTravelByRole);
  const [producerGuestSipActive, setProducerGuestSipActive] = useState(false);
  const blockingAbortRef = useRef<AbortController | null>(null);
  const handledArtworkJobIdsRef = useRef(new Set<string>());
  const artworkJobCompletedCountRef = useRef(new Map<string, number>());
  const advanceInFlightRef = useRef(false);
  const queuedProducerCueRef = useRef<BotcastProducerCue | null>(null);
  const signalEpisodeImageRef = useRef<SignalEpisodeImageUpload | null>(null);
  const producerImageInputRef = useRef<HTMLInputElement | null>(null);
  const setupProducerImageInputRef = useRef<HTMLInputElement | null>(null);
  const producerGuestThinkingStartedAtRef = useRef<number | null>(null);
  const producerGuestThinkingEndedAtRef = useRef<number | null>(null);
  const signalAirTimeFreezeAccumulatedMsRef = useRef(0);
  const signalAirTimeFreezeStartedAtRef = useRef<number | null>(null);
  const signalClientRecordedForegroundHoldRef = useRef<{
    episodeId: string | null;
    durationMs: number;
  }>({ episodeId: null, durationMs: 0 });
  /** Mirrors the one compact hold owned by the presented Signal thinking state. */
  const signalThinkingCompactHoldActiveRef = useRef(false);
  const signalEphemeralSpeakingDepthByBotIdRef = useRef(
    new Map<string, number>(),
  );
  const signalEphemeralSpeechPlaybackClockByBotIdRef = useRef(
    new Map<string, SignalLiveSpeechPlaybackClock>(),
  );
  const signalCapturedCameraRef = useRef<{
    sourceId: string;
    shot: SignalDirectedCameraShot;
    transitionMode: SignalCameraTransitionMode;
  } | null>(null);
  const signalCameraPushTimeoutRef = useRef<number | null>(null);
  const signalCameraWaitingForPresenceRef = useRef(false);
  const liveCameraModeRef = useRef<BotcastCameraShot>("auto");
  const signalCapturedDepartureKeysRef = useRef(new Set<string>());
  const producerGuestSipTimeoutRef = useRef<number | null>(null);
  const producerCueInputRef = useRef<HTMLInputElement | null>(null);
  const producerCueInputFocusedRef = useRef(false);
  const producerCueInputSelectionRef = useRef({ start: 0, end: 0 });
  const producerQuoteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const producerQuoteInputFocusedRef = useRef(false);
  const producerQuoteInputSelectionRef = useRef({ start: 0, end: 0 });
  const producerCueSendButtonRef = useRef<HTMLButtonElement | null>(null);
  const producerCueClearButtonRef = useRef<HTMLButtonElement | null>(null);
  const producerCueAskCountRef = useRef<HTMLSpanElement | null>(null);
  const producerCueQuoteCountRef = useRef<HTMLSpanElement | null>(null);
  const producerCueDraftLengthsRef = useRef({ ask: 0, quote: 0 });
  const signalUserInputLastSeenAtRef = useRef(Number.NEGATIVE_INFINITY);
  const preparedAdvanceRef = useRef<PreparedBotcastAdvance | null>(null);
  const activeSpeechMessageIdRef = useRef<string | null>(null);
  const signalLiveSpeechPlaybackClockRef =
    useRef<SignalLiveSpeechPlaybackClock | null>(null);
  const episodeOperationAbortRef = useRef<AbortController | null>(null);

  /**
   * Generated work may finish whenever it likes; presenting that work waits
   * for a real lull in keys, text input, or pointer interaction. The complete
   * Signal owner is intentionally large, so even a transition render can hold
   * the renderer until that component call returns. A short producer-first
   * gate keeps that work out of the only interval the person can feel.
   */
  const waitForSignalUserInputIdle = useCallback(
    async (signal: AbortSignal): Promise<void> => {
      const scheduling = navigator as Navigator & {
        scheduling?: {
          isInputPending?: (options?: {
            includeContinuous?: boolean;
          }) => boolean;
        };
      };
      const inputIsPending = (): boolean => {
        try {
          return (
            scheduling.scheduling?.isInputPending?.({
              includeContinuous: true,
            }) === true
          );
        } catch {
          // The quiet-window clock remains authoritative on older engines.
          return false;
        }
      };
      const wait = (delayMs: number): Promise<void> =>
        new Promise<void>((resolve, reject) => {
          const onAbort = (): void => {
            window.clearTimeout(timerId);
            reject(
              new DOMException(
                "Signal presentation was cancelled.",
                "AbortError",
              ),
            );
          };
          const timerId = window.setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
          }, delayMs);
          signal.addEventListener("abort", onAbort, { once: true });
        });

      while (!signal.aborted) {
        const quietForMs =
          performance.now() - signalUserInputLastSeenAtRef.current;
        const inputPending = inputIsPending();
        if (quietForMs < SIGNAL_USER_INPUT_QUIET_WINDOW_MS || inputPending) {
          await wait(
            Math.max(
              16,
              Math.ceil(SIGNAL_USER_INPUT_QUIET_WINDOW_MS - quietForMs),
            ),
          );
          continue;
        }
        await new Promise<void>((resolve) => {
          if (typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(() => resolve(), { timeout: 160 });
          } else {
            window.requestAnimationFrame(() => resolve());
          }
        });
        if (
          performance.now() - signalUserInputLastSeenAtRef.current >=
            SIGNAL_USER_INPUT_QUIET_WINDOW_MS &&
          !inputIsPending()
        ) {
          return;
        }
      }
      throw new DOMException(
        "Signal presentation was cancelled.",
        "AbortError",
      );
    },
    [],
  );
  const episodeRunIdRef = useRef(0);
  const preRollSkipRequestedRef = useRef(false);
  const preRollGateResolveRef = useRef<(() => void) | null>(null);
  const signalModelWarmupRef = useRef<SignalModelWarmup | null>(null);
  const signalModelWarmupVisibleRef = useRef(false);
  const introPreviewRunIdRef = useRef(0);
  const outroRunIdRef = useRef(0);
  const presentedEpisodeOutroIdsRef = useRef(new Set<string>());
  const resolvedSessionReceiptIdsRef = useRef(new Set<string>());
  const presentedSessionReceiptIdRef = useRef<string | null>(null);
  const onSessionEndedRef = useRef(onSessionEnded);
  const onLiveSessionActiveChangeRef = useRef(onLiveSessionActiveChange);
  onSessionEndedRef.current = onSessionEnded;
  onLiveSessionActiveChangeRef.current = onLiveSessionActiveChange;
  /** Watch bake can land `status: "completed"` before local presentation finishes. */
  const suppressCompletedOutroFallbackRef = useRef(false);
  const selectedShowIdRef = useRef<string | null>(selectedShowId);
  const hostChatOpenRef = useRef(false);
  const hostChatBubbleSequenceRef = useRef(0);
  const hostChatBubbleTimersRef = useRef(new Map<string, number>());
  const hostChatStreamTimerRef = useRef<number | null>(null);
  const hostChatCloudRef = useRef<HTMLDivElement | null>(null);
  const hostChatComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const hostChatRequestSequenceRef = useRef(0);
  const cuttingShowRef = useRef(false);
  const replayVoiceMessageIdRef = useRef<string | null>(null);
  const replayVoiceRunIdRef = useRef(0);
  const replayProducerGuestActionSfxClockRef = useRef<{
    messageId: string;
    lastElapsedMs: number;
    played: boolean;
  } | null>(null);
  const listenerReactionPlanByMessageIdRef = useRef(
    new Map<string, ListenerReactionPlanV1>(),
  );
  const listenerReactionAtMsByMessageIdRef = useRef(new Map<string, number>());
  const liveListenerReactionFiredRef = useRef(new Set<string>());
  const liveMuteReactionFiredRef = useRef(new Set<string>());
  const liveListenerReactionPlaybackByMessageIdRef = useRef(
    new Map<string, Promise<boolean>>(),
  );
  const liveCameraPostSpeechHoldTimerRef = useRef<number | null>(null);
  const replayListenerReactionFiredRef = useRef(new Set<string>());
  const replayMuteReactionFiredRef = useRef(new Set<string>());
  const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null);
  const audiencePulseCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const audiencePulseReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const studioLayoutDragRef = useRef<SignalStudioLayoutDrag | null>(null);
  const studioEpisodeImagePlacementDragRef =
    useRef<SignalEpisodeImagePlacementDrag | null>(null);
  const studioLogoPlacementDragRef = useRef<SignalLogoPlacementDrag | null>(
    null,
  );
  const studioLayoutDraftRef = useRef<{
    showId: string;
    layout: BotcastStudioLayout;
  } | null>(null);
  const studioLayoutSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const studioLayoutSavePendingRef = useRef(0);
  const studioCameraFramingDraftRef = useRef<{
    showId: string;
    framing: BotcastCameraFraming;
    revision: number;
  } | null>(null);
  const studioCameraFramingSaveInFlightRef = useRef(false);
  const studioLogoPlacementDraftRef = useRef<{
    showId: string;
    placement: BotcastLogoPlacement;
    revision: number;
  } | null>(null);
  const studioLogoPlacementSaveInFlightRef = useRef(false);
  const studioGlowTuningDraftRef = useRef<{
    showId: string;
    tuning: BotcastStudioGlowTuning;
    revision: number;
  } | null>(null);
  const studioGlowTuningSaveInFlightRef = useRef(false);
  const studioVoiceLevelsDraftRef = useRef<{
    showId: string;
    levels: BotcastVoiceLevelsByBotId;
    revision: number;
  } | null>(null);
  const studioVoiceLevelsSaveInFlightRef = useRef(false);
  const studioAtmosphereMixDraftRef = useRef<{
    showId: string;
    mix: BotcastStudioAtmosphereMix;
    revision: number;
  } | null>(null);
  const studioAtmosphereMixSaveInFlightRef = useRef(false);
  const studioSoundcheckRunIdRef = useRef(0);
  const signalStageRef = useRef<HTMLElement | null>(null);
  const onStopUtteranceRef = useRef(onStopUtterance);
  const prepareGuestResponseRef = useRef<
    (currentEpisode: BotcastEpisode, hostMessage: BotcastMessage) => void
  >(() => undefined);
  const prepareEpisodeMessageRef = useRef<
    (message: BotcastMessage, currentEpisode: BotcastEpisode) => void
  >(() => undefined);
  const playPreparedEpisodeMessageRef = useRef<
    (
      message: BotcastMessage,
      currentEpisode: BotcastEpisode,
      controller: AbortController,
      runId: number,
      prepareFollowingTurn?: boolean,
      onPlaybackStart?: () => void | Promise<void>,
      options?: {
        voiceChannel?: "primary" | "handoff";
        deferPresentationUntilPlaybackStart?: boolean;
        onPresenceStart?: () => void;
        onHandoffStart?: () => void;
      },
    ) => Promise<void>
  >(async () => undefined);

  useEffect(() => {
    onStopUtteranceRef.current = onStopUtterance;
  }, [onStopUtterance]);

  useEffect(() => {
    const noteUserInput = (): void => {
      signalUserInputLastSeenAtRef.current = performance.now();
    };
    window.addEventListener("pointerdown", noteUserInput, true);
    window.addEventListener("keydown", noteUserInput, true);
    window.addEventListener("beforeinput", noteUserInput, true);
    return () => {
      window.removeEventListener("pointerdown", noteUserInput, true);
      window.removeEventListener("keydown", noteUserInput, true);
      window.removeEventListener("beforeinput", noteUserInput, true);
    };
  }, []);

  useEffect(() => {
    onRecordingStateChange?.(signalRecordingActive);
    return () => {
      if (signalRecordingActive) onRecordingStateChange?.(false);
    };
  }, [onRecordingStateChange, signalRecordingActive]);

  useEffect(() => {
    selectedShowIdRef.current = selectedShowId;
  }, [selectedShowId]);

  useEffect(() => {
    hostChatOpenRef.current = hostChatOpen;
  }, [hostChatOpen]);

  useEffect(() => {
    setLiveCaptionsEnabled(readSignalLiveCaptionsEnabled(window.localStorage));
    setLiveCaptionSize(readSignalLiveCaptionSize(window.localStorage));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setNotice((current) => (current === notice ? null : current));
    }, SIGNAL_NOTICE_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const assignQueuedProducerCue = useCallback(
    (
      cue: BotcastProducerCue | null,
      status: BotcastProducerCueLifecycleStatus | null = cue
        ? "queued"
        : null,
    ): void => {
      queuedProducerCueRef.current = cue;
      setQueuedProducerCue(cue);
      setQueuedCueStatus(status);
    },
    [],
  );

  useEffect(() => {
    if (!episode) return;
    const activeCue = botcastActiveProducerCueFromEvents(episode.events);
    if (
      !activeCue &&
      signalPendingEpisodeImageCueIsAwaitingHostTurn({
        episodeId: episode.id,
        pendingCue: queuedProducerCueRef.current,
        pendingImage: signalEpisodeImageRef.current,
        imageContext: botcastLatestImageContextV1(episode.events),
      })
    ) {
      // A pre-show image is intentionally introduced on the next eligible
      // host turn. The ordinary guest response between the welcome and that
      // turn updates the episode without creating server cue state; do not let
      // that update erase the client-owned image and its required host beat.
      return;
    }
    assignQueuedProducerCue(activeCue?.cue ?? null, activeCue?.status ?? null);
  }, [assignQueuedProducerCue, episode]);

  const assignSignalModelWarmup = useCallback(
    (value: SignalModelWarmup | null): void => {
      signalModelWarmupRef.current = value;
      setSignalModelWarmup(value);
    },
    [],
  );

  useEffect(() => () => blockingAbortRef.current?.abort(), []);

  const activeEpisodeId = episode?.id ?? null;
  useEffect(() => {
    signalEpisodeImageRef.current = signalEpisodeImage;
  }, [signalEpisodeImage]);
  const clearLiveCameraPostSpeechHold = useCallback((): void => {
    if (liveCameraPostSpeechHoldTimerRef.current !== null) {
      window.clearTimeout(liveCameraPostSpeechHoldTimerRef.current);
      liveCameraPostSpeechHoldTimerRef.current = null;
    }
    setLiveCameraPostSpeechHoldShot(null);
  }, []);
  const holdLiveCameraAfterSpeech = useCallback(
    (speakerRole: "host" | "guest"): void => {
      clearLiveCameraPostSpeechHold();
      setLiveCameraPostSpeechHoldShot(
        speakerRole === "host" ? "left" : "right",
      );
      liveCameraPostSpeechHoldTimerRef.current = window.setTimeout(() => {
        liveCameraPostSpeechHoldTimerRef.current = null;
        setLiveCameraPostSpeechHoldShot(null);
      }, SIGNAL_LIVE_CAMERA_POST_SPEECH_HOLD_MS);
    },
    [clearLiveCameraPostSpeechHold],
  );
  useEffect(() => {
    if (!activeEpisodeId) return;
    if (signalModelWarmup) return;
    const updateStageClock = (): void => {
      signalStageNowMsRef.current = Date.now();
    };
    updateStageClock();
    const timer = window.setInterval(updateStageClock, 1_000);
    return () => window.clearInterval(timer);
  }, [activeEpisodeId, signalModelWarmup]);

  const syncSignalSipMouthTargets = useCallback((): void => {
    const stage = signalStageRef.current;
    const scene = stage?.querySelector<HTMLElement>(
      '[data-signal-stage-scene="true"]',
    );
    if (!scene || scene.offsetWidth <= 0 || scene.offsetHeight <= 0) return;

    const sceneBounds = scene.getBoundingClientRect();
    for (const role of ["host", "guest"] as const) {
      const presence = scene.querySelector<HTMLElement>(
        `[data-signal-presence="${role}"]`,
      );
      const mouth =
        presence?.querySelector<HTMLElement>(
          '[data-coffee-plate-emoji-part="mouth"][data-coffee-plate-emoji-glyph="⁎"]',
        ) ??
        presence?.querySelector<HTMLElement>(
          '[data-coffee-plate-emoji-part="mouth"]',
        );
      const mug = scene.querySelector<HTMLElement>(
        `[data-signal-mug-role="${role}"]`,
      );
      if (!mouth || !mug) continue;
      if (mug.dataset.sipping === "true" || mug.dataset.returning === "true") {
        continue;
      }

      const target = signalCupSipTargetFromMouth({
        role,
        sceneBounds,
        sceneLocalWidth: scene.offsetWidth,
        sceneLocalHeight: scene.offsetHeight,
        mouthBounds: mouth.getBoundingClientRect(),
        mugLocalHeight: mug.offsetHeight,
      });
      if (!target) continue;
      const mugBounds = mug.getBoundingClientRect();
      const restPoint = signalStageLocalPointFromViewport({
        sceneBounds,
        sceneLocalWidth: scene.offsetWidth,
        sceneLocalHeight: scene.offsetHeight,
        viewportX: mugBounds.left + mugBounds.width / 2,
        viewportY: mugBounds.top + mugBounds.height / 2,
      });
      if (!restPoint) continue;
      mug.style.setProperty("--signal-cup-mouth-x", `${target.x}px`);
      mug.style.setProperty("--signal-cup-mouth-y", `${target.y}px`);
      mug.style.setProperty(
        "--signal-cup-travel-x",
        `${target.x - restPoint.x}px`,
      );
      mug.style.setProperty(
        "--signal-cup-travel-y",
        `${target.y - restPoint.y}px`,
      );
      mug.style.setProperty("--signal-cup-rest-local-x", `${restPoint.x}px`);
      mug.style.setProperty("--signal-cup-rest-local-y", `${restPoint.y}px`);
    }
  }, []);

  const syncSignalCupTravel = useCallback((): void => {
    const stage = signalStageRef.current;
    const scene = stage?.querySelector<HTMLElement>(
      '[data-signal-stage-scene="true"]',
    );
    if (!scene) return;

    // The shared avatar renderer can finish mounting after the episode-level
    // layout seed. Re-measure at the semantic sip edge, before `data-sipping`
    // locks the wrapper, so a late mouth never leaves the mug animating against
    // the zero-distance CSS fallback.
    syncSignalSipMouthTargets();
    setSignalCupTravelByRole((current) => {
      let next = current;
      for (const role of ["host", "guest"] as const) {
        const mug = scene.querySelector<HTMLElement>(
          `[data-signal-mug-role="${role}"]`,
        );
        if (!mug) continue;
        const requested = mug.dataset.sipRequested === "true";
        const travel = current[role];
        let nextTravel = travel;

        if (travel.mode === "idle" && requested) {
          nextTravel = {
            mode: "sipping",
            returnDeltaX: null,
            returnDeltaY: null,
            sipFaceActive: true,
          };
        }

        if (nextTravel !== travel) {
          if (next === current) next = { ...current };
          next[role] = nextTravel;
        }
      }
      return next;
    });
  }, [syncSignalSipMouthTargets]);

  const finishSignalCupReturn = useCallback(
    (
      role: "host" | "guest",
      event: ReactAnimationEvent<HTMLDivElement>,
    ): void => {
      if (event.target !== event.currentTarget) return;
      setSignalCupTravelByRole((current) => {
        if (current[role].mode === "idle") return current;
        return {
          ...current,
          [role]: {
            mode: "idle",
            returnDeltaX: null,
            returnDeltaY: null,
            sipFaceActive: false,
          },
        };
      });
    },
    [],
  );

  // Animation events can be lost when a live stage is resized, hot-reloaded,
  // or swapped between shots. Never let a mug remain stranded and miss every
  // later sip. A normal sip gets its full authored trip; the short returning
  // fallback retains its tighter deadline.
  useEffect(() => {
    const timers: number[] = [];
    for (const role of ["host", "guest"] as const) {
      const mode = signalCupTravelByRole[role].mode;
      if (mode === "idle") continue;
      const mug = signalStageRef.current?.querySelector<HTMLElement>(
        `[data-signal-mug-role="${role}"]`,
      );
      const sipDurationMs = Number(mug?.dataset.sipDurationMs);
      const fallbackMs =
        mode === "returning"
          ? 500
          : Number.isFinite(sipDurationMs) && sipDurationMs > 0
            ? sipDurationMs + 250
            : 1_900;
      timers.push(
        window.setTimeout(() => {
          setSignalCupTravelByRole((current) => {
            if (current[role].mode !== mode) return current;
            return {
              ...current,
              [role]: {
                mode: "idle",
                returnDeltaX: null,
                returnDeltaY: null,
                sipFaceActive: false,
              },
            };
          });
        }, fallbackMs),
      );
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [signalCupTravelByRole.guest.mode, signalCupTravelByRole.host.mode]);

  const signalHostCupTravelMode = signalCupTravelByRole.host.mode;
  const signalGuestCupTravelMode = signalCupTravelByRole.guest.mode;
  useEffect(() => {
    const timers: number[] = [];
    for (const role of ["host", "guest"] as const) {
      const mode =
        role === "host" ? signalHostCupTravelMode : signalGuestCupTravelMode;
      if (mode !== "sipping") continue;
      const mug = signalStageRef.current?.querySelector<HTMLElement>(
        `[data-signal-mug-role="${role}"]`,
      );
      const releaseMs = Number(mug?.dataset.sipFaceReleaseMs);
      if (!Number.isFinite(releaseMs) || releaseMs <= 0) continue;
      timers.push(
        window.setTimeout(() => {
          setSignalCupTravelByRole((current) => {
            const travel = current[role];
            if (travel.mode !== "sipping" || !travel.sipFaceActive) {
              return current;
            }
            return {
              ...current,
              [role]: { ...travel, sipFaceActive: false },
            };
          });
        }, releaseMs),
      );
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [signalGuestCupTravelMode, signalHostCupTravelMode]);

  // Mouth and mug geometry is stable for the life of an episode and already
  // refreshed by ResizeObserver below. Measuring it after every Signal render
  // forced a synchronous layout during voice and model handoffs, which could
  // stall the live stage even though the mug animation itself is compositor-
  // only. Seed it once when the scene changes instead.
  useLayoutEffect(() => {
    syncSignalSipMouthTargets();
    syncSignalCupTravel();
  }, [
    activeEpisodeId,
    replayEpisode?.id,
    syncSignalCupTravel,
    syncSignalSipMouthTargets,
  ]);

  // Sip intent is rendered as a data attribute by the stage. Observe that
  // narrow semantic edge instead of polling it from every component commit.
  useEffect(() => {
    const scene = signalStageRef.current?.querySelector<HTMLElement>(
      '[data-signal-stage-scene="true"]',
    );
    if (!scene) return;
    const sipIntentObserver = new MutationObserver(syncSignalCupTravel);
    sipIntentObserver.observe(scene, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-sip-requested"],
    });
    return () => sipIntentObserver.disconnect();
  }, [activeEpisodeId, replayEpisode?.id, syncSignalCupTravel]);

  useEffect(() => {
    const stage = signalStageRef.current;
    if (!stage) return;
    const resizeObserver = new ResizeObserver(syncSignalSipMouthTargets);
    resizeObserver.observe(stage);
    window.addEventListener("resize", syncSignalSipMouthTargets);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncSignalSipMouthTargets);
    };
  }, [activeEpisodeId, replayEpisode?.id, syncSignalSipMouthTargets]);

  useEffect(() => {
    clearLiveCameraPostSpeechHold();
    signalCapturedDepartureKeysRef.current.clear();
    setSignalPresentedDepartures({
      episodeId: activeEpisodeId,
      host: false,
      guest: false,
    });
    if (producerGuestSipTimeoutRef.current !== null) {
      window.clearTimeout(producerGuestSipTimeoutRef.current);
      producerGuestSipTimeoutRef.current = null;
    }
    setProducerGuestSipActive(false);
    setSignalCupTravelByRole(initialSignalCupTravelByRole());
    setHostInterruptionOrdinal(0);
    liveListenerReactionFiredRef.current.clear();
    replayListenerReactionFiredRef.current.clear();
    liveMuteReactionFiredRef.current.clear();
    replayMuteReactionFiredRef.current.clear();
    assignQueuedProducerCue(null);
    setSignalEpisodeImage((current) =>
      current?.episodeId === activeEpisodeId ? current : null,
    );
    setKeepSignalItem(false);
    setKeepSignalItemSaving(false);
  }, [
    activeEpisodeId,
    assignQueuedProducerCue,
    clearLiveCameraPostSpeechHold,
    replayEpisode?.id,
  ]);

  useEffect(
    () => () => {
      if (producerGuestSipTimeoutRef.current !== null) {
        window.clearTimeout(producerGuestSipTimeoutRef.current);
      }
      if (liveCameraPostSpeechHoldTimerRef.current !== null) {
        window.clearTimeout(liveCameraPostSpeechHoldTimerRef.current);
      }
    },
    [],
  );

  // Signal cleanup depends on this callback, so voice-setting changes must not
  // make React tear down the active episode as though the studio unmounted.
  const stopUtterance = useCallback((): void => {
    if (liveCameraPostSpeechHoldTimerRef.current !== null) {
      window.clearTimeout(liveCameraPostSpeechHoldTimerRef.current);
      liveCameraPostSpeechHoldTimerRef.current = null;
    }
    setLiveCameraPostSpeechHoldShot(null);
    activeSpeechMessageIdRef.current = null;
    setSpeakingMessageId(null);
    setLiveSpeech(null);
    setSignalPerformanceCaption(null);
    onStopUtteranceRef.current?.();
  }, []);

  const audibleHandoffAudienceHeardContent = useCallback(
    (message: BotcastMessage): string => {
      const currentSpeech = liveSpeechRef.current;
      if (
        currentSpeech?.messageId !== message.id ||
        currentSpeech.reveal.phase !== "playing"
      ) {
        return message.content;
      }
      const elapsedMs = signalLiveSpeechProjectedElapsedMs({
        liveSpeech: currentSpeech,
        clock: signalLiveSpeechPlaybackClockRef.current,
        nowMs: performance.now(),
      });
      return botcastSpeechRevealVisibleText(
        updateBotcastSpeechReveal(currentSpeech.reveal, elapsedMs),
      ).trimEnd();
    },
    [],
  );

  const stopIntroPreview = useCallback((): void => {
    introPreviewRunIdRef.current += 1;
    setIntroPreviewShowId(null);
    releaseSignalIntroAudio();
  }, []);

  const stopStudioSoundcheck = useCallback((): void => {
    studioSoundcheckRunIdRef.current += 1;
    setStudioSoundcheckRunning(false);
    setStudioSoundcheckSpeakerBotId(null);
    setStudioSoundcheckSpeech(null);
    setStudioSoundcheckCaption(null);
    onStopUtteranceRef.current?.();
  }, []);

  useEffect(() => {
    if (!studioLayoutEditorOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      stopStudioSoundcheck();
      setStudioLayoutEditorOpen(false);
      setStudioLayoutPreviewGuestId("");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stopStudioSoundcheck, studioLayoutEditorOpen]);

  const stopEpisodeOutro = useCallback((): void => {
    outroRunIdRef.current += 1;
    setEpisodeOutro(null);
    setEpisodeOutroSfxMutedId(null);
    releaseSignalIntroAudio();
  }, []);

  const finalizeSignalRecording = useCallback(
    async (
      completedEpisode: BotcastEpisode,
      show: BotcastShow,
    ): Promise<ReplayRecordingV1 | null> => {
      if (finalizedSignalRecordingIdsRef.current.has(completedEpisode.id)) {
        try {
          const recording = await boundedSignalReplayFinalization(
            replayRecordingForSource("signal", completedEpisode.id),
          );
          if (!recording) {
            finalizedSignalRecordingIdsRef.current.delete(completedEpisode.id);
          }
          return recording;
        } catch {
          finalizedSignalRecordingIdsRef.current.delete(completedEpisode.id);
          return null;
        }
      }
      finalizedSignalRecordingIdsRef.current.add(completedEpisode.id);
      try {
        if (signalCaptureSourceIdRef.current === completedEpisode.id) {
          markReplayAudioMasterCapture({
            sourceId: completedEpisode.id,
            phase: "capture_end",
          });
        }
        const capturedDirection = replayAudioMasterCaptureDirection(
          completedEpisode.id,
        );
        const capturedMouthTracks = replayAudioMasterCaptureMouthTracks(
          completedEpisode.id,
        );
        const capturedVoiceLightTracks =
          replayAudioMasterCaptureVoiceLightTracks(completedEpisode.id);
        const capture = await boundedSignalReplayFinalization(
          stopReplayAudioMasterCapture(completedEpisode.id),
        );
        if (signalCaptureSourceIdRef.current === completedEpisode.id) {
          signalCaptureSourceIdRef.current = null;
        }
        const manifest = buildSignalReplayManifestV2({
          episode: completedEpisode,
          show,
          cameraFraming:
            signalEpisodeCameraFramingSnapshotRef.current.get(
              completedEpisode.id,
            ) ?? normalizeBotcastCameraFraming(show.cameraFraming),
          bots,
          producerName,
          theme,
          audioEnabled: introAudioEnabled,
          audioVolume: introAudioVolume,
          capturedDirection: capture?.direction ?? capturedDirection,
          capturedMouthTracks: capture?.mouthTracks ?? capturedMouthTracks,
          capturedVoiceLightTracks:
            capture?.voiceLightTracks ?? capturedVoiceLightTracks,
          capturedSpeechActivityTracks: capture?.speechActivityTracks ?? [],
          voiceSelection: capture?.voiceSelection ?? recordingVoiceSelection,
        });
        const recording = await boundedSignalReplayFinalization(
          saveFaithfulReplaySession({
            surface: "signal",
            sourceId: completedEpisode.id,
            manifest,
            capture,
          }),
        );
        window.dispatchEvent(new Event(REPLAY_RECORDING_CHANGED_EVENT));
        return recording;
      } catch {
        // The locally retained master retries on the next authenticated load.
        finalizedSignalRecordingIdsRef.current.delete(completedEpisode.id);
        return null;
      } finally {
        if (signalCaptureSourceIdRef.current === completedEpisode.id) {
          signalCaptureSourceIdRef.current = null;
        }
      }
    },
    [
      bots,
      introAudioEnabled,
      introAudioVolume,
      producerName,
      recordingVoiceSelection,
      theme,
    ],
  );
  const finalizeSignalRecordingRef = useRef(finalizeSignalRecording);
  finalizeSignalRecordingRef.current = finalizeSignalRecording;

  const playEpisodeOutro = useCallback(
    async (args: {
      episode: BotcastEpisode;
      show: BotcastShow;
      forced: boolean;
      discarded?: boolean;
    }): Promise<ReplayRecordingV1 | null> => {
      if (presentedEpisodeOutroIdsRef.current.has(args.episode.id)) return null;
      presentedEpisodeOutroIdsRef.current.add(args.episode.id);
      setEpisodeOutroSfxMutedId(args.episode.id);
      const runId = outroRunIdRef.current + 1;
      outroRunIdRef.current = runId;
      // Let the host's final words settle in the live studio before the
      // transmission curtain or outro audio begins.
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, SIGNAL_EPISODE_OUTRO_DEAD_AIR_MS),
      );
      if (outroRunIdRef.current !== runId) return null;
      setEpisodeOutro({
        episodeId: args.episode.id,
        episode: args.episode,
        showName: args.show.name,
        phase: "curtain",
        forced: args.forced,
        discarded: args.discarded === true,
      });
      if (args.discarded) {
        const captureSourceId = signalCaptureSourceIdRef.current;
        if (captureSourceId === args.episode.id) {
          signalCaptureSourceIdRef.current = null;
          await abortReplayAudioMasterCapture(captureSourceId);
        }
      } else {
        markReplayAudioMasterCapture({
          sourceId: args.episode.id,
          phase: "outro_start",
        });
      }
      const playback = playSignalOutroAudio({
        seed: `${args.show.id}:${args.episode.id}:${args.show.logo.seed}`,
        enabled: introAudioEnabled,
        volume: introAudioVolume,
      });
      const reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ===
        true;
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, reducedMotion ? 160 : 760),
      );
      if (outroRunIdRef.current !== runId) return null;
      setEpisodeOutro((current) =>
        current?.episodeId === args.episode.id
          ? { ...current, phase: "holding" }
          : current,
      );
      const visualMinimum = new Promise<void>((resolve) =>
        window.setTimeout(resolve, reducedMotion ? 620 : 1_800),
      );
      await Promise.all([playback.finished, visualMinimum]);
      if (outroRunIdRef.current !== runId) return null;
      setEpisodeOutro((current) =>
        current?.episodeId === args.episode.id
          ? { ...current, phase: "complete" }
          : current,
      );
      releaseSignalIntroAudio();
      let recording: ReplayRecordingV1 | null = null;
      if (!args.discarded) {
        setWatchReplayFinalizingEpisodeId(args.episode.id);
        try {
          recording = await finalizeSignalRecording(args.episode, args.show);
        } finally {
          setWatchReplayFinalizingEpisodeId((current) =>
            current === args.episode.id ? null : current,
          );
        }
      }
      return recording;
    },
    [finalizeSignalRecording, introAudioEnabled, introAudioVolume],
  );

  useEffect(() => {
    if (!introAudioEnabled) stopIntroPreview();
  }, [introAudioEnabled, stopIntroPreview]);

  useEffect(
    () => () => {
      studioSoundcheckRunIdRef.current += 1;
      onStopUtteranceRef.current?.();
      releaseSignalIntroAudio();
      const captureSourceId = signalCaptureSourceIdRef.current;
      const activeEpisode = liveEpisodeRef.current;
      const activeShow = selectedShowRef.current;
      if (
        captureSourceId &&
        activeEpisode &&
        activeShow &&
        captureSourceId === activeEpisode.id &&
        activeEpisode.status === "completed" &&
        activeEpisode.messages.length > 0
      ) {
        void finalizeSignalRecordingRef.current(activeEpisode, activeShow);
      } else if (captureSourceId) {
        signalCaptureSourceIdRef.current = null;
        void abortReplayAudioMasterCapture(captureSourceId);
      }
      if (activeEpisode) {
        onInvalidatePrefetchedEpisode?.(activeEpisode.id);
      }
    },
    [onInvalidatePrefetchedEpisode],
  );

  const discardPreparedAdvance = useCallback(
    (reason: string): void => {
      const prepared = preparedAdvanceRef.current;
      if (!prepared) return;
      preparedAdvanceRef.current = null;
      prepared.controller.abort();
      if (prepared.prefetchedMessageId) {
        onInvalidatePrefetchedUtterance?.(
          prepared.episodeId,
          prepared.prefetchedMessageId,
        );
      }
      const discard = (preparationId: string): void => {
        void request(
          `/api/turn-preparations/${encodeURIComponent(preparationId)}`,
          { method: "DELETE" },
        ).catch(() => undefined);
      };
      if (prepared.preparationId) {
        discard(prepared.preparationId);
      } else {
        void prepared.result.then((result) => {
          if (result.ok) discard(result.preparation.id);
        });
      }
      void reason;
    },
    [onInvalidatePrefetchedUtterance, request],
  );

  const invalidateEpisodeOperation = useCallback(
    (options: { preserveAudibleUtterance?: boolean } = {}): void => {
    episodeRunIdRef.current += 1;
    episodeOperationAbortRef.current?.abort();
    episodeOperationAbortRef.current = null;
    discardPreparedAdvance("Signal state changed before handoff.");
    advanceInFlightRef.current = false;
    setAutoRun(false);
    setBusy(false);
    setEpisodePreRoll(null);
    setWatchPlaybackReady(false);
    watchPlaybackStartResolveRef.current?.();
    watchPlaybackStartResolveRef.current = null;
    assignSignalModelWarmup(null);
    signalModelWarmupVisibleRef.current = false;
    stopEpisodeOutro();
    preRollSkipRequestedRef.current = false;
    preRollGateResolveRef.current?.();
    preRollGateResolveRef.current = null;
    stopIntroPreview();
      if (!options.preserveAudibleUtterance) {
        audibleHandoffOutgoingMessageIdRef.current = null;
        producerGuestHandoffOutgoingMessageRef.current = null;
        stopUtterance();
      }
    },
    [
      assignSignalModelWarmup,
      discardPreparedAdvance,
      stopEpisodeOutro,
      stopIntroPreview,
      stopUtterance,
    ],
  );

  const setPersistedSignalModelWarmupHold = useCallback(
    async (episodeId: string, active: boolean): Promise<BotcastEpisode> => {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/episodes/${encodeURIComponent(episodeId)}/model-warmup-hold`,
        {
          method: "POST",
          body: JSON.stringify({ active }),
        },
      );
      setEpisode((current) =>
        current?.id === response.episode.id ? response.episode : current,
      );
      return response.episode;
    },
    [request],
  );

  const releaseSignalModelWarmup = useCallback(
    async (
      episodeId: string | null,
      releasePersistedHold = true,
    ): Promise<void> => {
      if (episodeId && releasePersistedHold) {
        await setPersistedSignalModelWarmupHold(episodeId, false).catch(
          () => undefined,
        );
      }
      const current = signalModelWarmupRef.current;
      if (!current) return;
      if (!signalModelWarmupVisibleRef.current) {
        assignSignalModelWarmup(null);
        return;
      }
      assignSignalModelWarmup({ ...current, phase: "releasing" });
      const reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ===
        true;
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, reducedMotion ? 120 : 900),
      );
      signalModelWarmupVisibleRef.current = false;
      assignSignalModelWarmup(null);
    },
    [assignSignalModelWarmup, setPersistedSignalModelWarmupHold],
  );

  const recordSignalForegroundGenerationHold = useCallback(
    async (args: {
      episodeId: string;
      holdId: string;
      durationMs: number;
      recovery: "preparation_timeout" | null;
    }): Promise<void> => {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/episodes/${encodeURIComponent(args.episodeId)}/session-clock-hold`,
        {
          method: "POST",
          body: JSON.stringify({
            holdId: args.holdId,
            reason: "foreground_generation",
            durationMs: Math.max(0, Math.round(args.durationMs)),
            ...(args.recovery ? { recovery: args.recovery } : {}),
          }),
        },
      );
      const recorded = signalClientRecordedForegroundHoldRef.current;
      const durationMs = Math.max(0, Math.round(args.durationMs));
      if (recorded.episodeId !== args.episodeId) {
        signalClientRecordedForegroundHoldRef.current = {
          episodeId: args.episodeId,
          durationMs,
        };
      } else {
        recorded.durationMs += durationMs;
      }
      setEpisode((current) =>
        current?.id === response.episode.id
          ? {
              ...current,
              events: response.episode.events,
              modelWarmupHoldDurationMs:
                response.episode.modelWarmupHoldDurationMs,
              modelWarmupHoldStartedAt:
                response.episode.modelWarmupHoldStartedAt,
              sessionClockHoldDurationMs:
                response.episode.sessionClockHoldDurationMs,
              sessionClockHoldStartedAt:
                response.episode.sessionClockHoldStartedAt,
            }
          : current,
      );
    },
    [request],
  );

  const beginEpisodeOperation = useCallback((): {
    controller: AbortController;
    runId: number;
  } => {
    episodeOperationAbortRef.current?.abort();
    const controller = new AbortController();
    const runId = episodeRunIdRef.current + 1;
    episodeRunIdRef.current = runId;
    episodeOperationAbortRef.current = controller;
    return { controller, runId };
  }, []);

  const episodeOperationIsCurrent = useCallback(
    (controller: AbortController, runId: number): boolean =>
      !controller.signal.aborted &&
      episodeOperationAbortRef.current === controller &&
      episodeRunIdRef.current === runId,
    [],
  );

  useEffect(
    () => () => invalidateEpisodeOperation(),
    [invalidateEpisodeOperation],
  );

  const cancelBlockingOperation = (): void => {
    const controller = blockingAbortRef.current;
    if (!controller || controller.signal.aborted) return;
    controller.abort();
    setBlockingOperation(null);
    setBusy(false);
  };

  const cancelWatchBake = (): void => {
    const episodeId = episode?.id ?? watchBakeArtifact?.sourceId ?? null;
    invalidateEpisodeOperation();
    assignQueuedProducerCue(null);
    const captureSourceId = signalCaptureSourceIdRef.current;
    if (captureSourceId && (!episodeId || captureSourceId === episodeId)) {
      signalCaptureSourceIdRef.current = null;
      void abortReplayAudioMasterCapture(captureSourceId);
    }
    if (episodeId) {
      onInvalidatePrefetchedEpisode?.(episodeId);
      void request<{ episode: BotcastEpisode }>(
        `/api/botcast/episodes/${encodeURIComponent(episodeId)}/bake/cancel`,
        { method: "POST", body: JSON.stringify({}) },
      )
        .then(({ episode: stoppedEpisode }) => {
          if (selectedShowId) {
            void loadEpisodes(selectedShowId).catch(() => undefined);
          }
          setNotice(
            stoppedEpisode.status === "completed"
              ? "Closed the first presentation. The completed episode remains in Latest episodes."
              : "Stopped preparing. The booking is ready to reuse from Latest episodes.",
          );
        })
        .catch((cancelError) => {
          setError(signalErrorToast("Stop Signal Watch preparation", cancelError));
        });
    }
    setEpisode(null);
    setWatchBakeLabel(null);
    setWatchBakeArtifact(null);
    setWatchBakeStartedAt(null);
    setWatchPlaybackReady(false);
    setWatchReplayPresentationEpisodeId(null);
    setWatchReplayFinalizingEpisodeId(null);
    setBusy(false);
  };

  useEffect(() => {
    if (
      episodeModelDraft &&
      !modelOptions.some((option) => option.id === episodeModelDraft)
    ) {
      setEpisodeModelDraft("");
    }
  }, [episodeModelDraft, modelOptions]);

  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? null;
  selectedShowRef.current = selectedShow;
  useEffect(() => {
    setShowPremiseDraft(selectedShow?.premise ?? "");
  }, [selectedShow?.id, selectedShow?.premise]);
  useEffect(() => {
    setSetupEpisodeImage(null);
    if (setupProducerImageInputRef.current) {
      setupProducerImageInputRef.current.value = "";
    }
  }, [selectedShow?.id]);
  const audiencePulseOpen = Boolean(
    selectedShow && audiencePulseShowId === selectedShow.id,
  );

  // Natural completion normally starts the outro after the final spoken line.
  // This state-driven fallback makes the end card reliable if that one-shot
  // continuation is interrupted by rendering, playback, or a refresh boundary.
  // Watch bake must suppress this until lines have actually been presented —
  // otherwise a completed artifact opens the end card during intro (~2s dead
  // air) and truncates the faithful recording.
  useEffect(() => {
    if (
      !episode ||
      episode.status !== "completed" ||
      speakingMessageId !== null ||
      !selectedShow ||
      episodeOutro?.episodeId === episode.id ||
      presentedEpisodeOutroIdsRef.current.has(episode.id) ||
      suppressCompletedOutroFallbackRef.current
    )
      return;
    void playEpisodeOutro({
      episode,
      show: selectedShow,
      forced: false,
    });
  }, [
    episode,
    episodeOutro?.episodeId,
    playEpisodeOutro,
    selectedShow,
    speakingMessageId,
  ]);
  const showIdentityControlsExpanded = Boolean(
    selectedShow && showIdentityControlsShowId === selectedShow.id,
  );
  const selectedShowArtworkBusy = Boolean(
    selectedShow &&
      artworkJob?.showId === selectedShow.id &&
      signalArtworkJobIsActive(artworkJob),
  );
  const selectedShowMagicManifest = selectedShow
    ? signalShowMagicManifest(selectedShow)
    : null;
  const dashboardAtmosphere = selectedShow
    ? activeShowAtmosphere(selectedShow, theme)
    : null;
  const hostBot = useMemo(() => {
    if (!selectedShow) return null;
    const bot = botsById.get(selectedShow.hostBotId) ?? null;
    if (!bot || !episode || episode.hostBotId !== bot.id) return bot;
    const powers = botcastSnapshotPowersForRoleV1(episode, "host");
    return powers
      ? {
          ...bot,
          muted: botPowerIsMutedV1(powers),
          voiceGainMultiplier: botPowerVoiceGainMultiplierV1(powers),
          voicePresence: botPowerVoicePresenceModeV1(powers),
        }
      : bot;
  }, [botsById, episode, selectedShow]);
  const showHasVacantHost = Boolean(selectedShow && !selectedShow.hasActiveHost);
  const shouldScreenHostRecovery = Boolean(
    selectedShow &&
      signalShouldScreenHostRecovery({
        hasActiveHost: selectedShow.hasActiveHost,
        episodeStatus: episode?.status ?? null,
      }),
  );
  const hostRecoveryShowId = selectedShow?.id ?? null;
  const hostRecoveryShowName = selectedShow?.name ?? null;
  const hostRecoveryShowPremise = selectedShow?.premise ?? null;
  const hostRecoveryShowHostingStyle = selectedShow?.hostingStyle ?? null;
  useEffect(() => {
    const runId = ++hostRecoveryRunIdRef.current;
    if (!hostRecoveryShowId || !shouldScreenHostRecovery) {
      setHostRecovery(null);
      setHostRecoveryBusy(false);
      return;
    }
    const controller = new AbortController();
    setHostRecovery(null);
    setHostRecoveryBusy(true);
    void request<{ result: BotcastHostRecoveryScreenResponse }>(
      `/api/botcast/shows/${encodeURIComponent(hostRecoveryShowId)}/host-recovery/screen`,
      { method: "POST", signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted || hostRecoveryRunIdRef.current !== runId) return;
        if (response.result.status === "not_needed") {
          const activeShow = response.result.show;
          setShows((current) =>
            current.map((show) =>
              show.id === activeShow.id ? activeShow : show,
            ),
          );
          setHostRecovery(null);
          return;
        }
        setHostRecovery(response.result.recovery);
      })
      .catch((recoveryError) => {
        if (!controller.signal.aborted && hostRecoveryRunIdRef.current === runId) {
          setError(signalErrorToast("Screen replacement hosts", recoveryError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && hostRecoveryRunIdRef.current === runId) setHostRecoveryBusy(false);
      });
    return () => controller.abort();
  }, [
    hostRecoveryShowHostingStyle,
    hostRecoveryShowId,
    hostRecoveryShowName,
    hostRecoveryShowPremise,
    request,
    shouldScreenHostRecovery,
  ]);
  const askReplacementHost = useCallback(async (candidate: BotcastHostRecoveryCandidate): Promise<void> => {
    if (!selectedShow || candidate.status !== "compatible" || hostRecoveryBusy) return;
    const showId = selectedShow.id;
    const runId = ++hostRecoveryRunIdRef.current;
    setHostRecoveryBusy(true);
    setError(null);
    try {
      const response = await request<{ result: BotcastHostRecoveryCastResponse }>(
        `/api/botcast/shows/${encodeURIComponent(showId)}/host-recovery/cast`,
        { method: "POST", body: JSON.stringify({ botId: candidate.botId }) },
      );
      if (selectedShowIdRef.current !== showId || hostRecoveryRunIdRef.current !== runId) return;
      if (response.result.status === "accepted") {
        replaceShow(response.result.show);
        setHostRecovery(null);
        setNotice(response.result.reason);
      } else {
        setHostRecovery((current) => current && current.showId === showId
          ? { ...current, candidates: current.candidates.map((entry) => entry.botId === candidate.botId
            ? { ...entry, status: "refused", reason: response.result.reason }
            : entry) }
          : current);
        setNotice(response.result.reason);
      }
    } catch (recoveryError) {
      if (hostRecoveryRunIdRef.current === runId) {
        setError(signalErrorToast("Ask replacement host", recoveryError));
      }
    } finally {
      if (hostRecoveryRunIdRef.current === runId) setHostRecoveryBusy(false);
    }
  }, [hostRecoveryBusy, request, selectedShow]);
  const clearSignalHostChatBubbles = useCallback((): void => {
    for (const timer of hostChatBubbleTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    hostChatBubbleTimersRef.current.clear();
    setHostChatBubbles([]);
  }, []);
  const showSignalHostChatBubbles = useCallback(
    (
      messages: readonly BotcastShowHostChatMessage[],
      replace = false,
    ): void => {
      if (replace) clearSignalHostChatBubbles();
      const bubbles = messages.map((message) => {
        const key = `${message.id}:${hostChatBubbleSequenceRef.current++}`;
        const lifetimeMs =
          message.role === "user"
            ? SIGNAL_HOST_CHAT_USER_BUBBLE_MS
            : signalHostChatAssistantBubbleMs(message.content);
        const timer = window.setTimeout(() => {
          hostChatBubbleTimersRef.current.delete(key);
          setHostChatBubbles((current) =>
            current.filter((bubble) => bubble.key !== key),
          );
        }, lifetimeMs);
        hostChatBubbleTimersRef.current.set(key, timer);
        return { key, message, lifetimeMs };
      });
      setHostChatBubbles((current) =>
        [...(replace ? [] : current), ...bubbles].slice(
          -SIGNAL_HOST_CHAT_RECOVERY_LIMIT,
        ),
      );
    },
    [clearSignalHostChatBubbles],
  );
  const closeSignalHostChat = useCallback((): void => {
    hostChatOpenRef.current = false;
    setHostChatOpen(false);
    setHostChatStreamingMessage(null);
    clearSignalHostChatBubbles();
  }, [clearSignalHostChatBubbles]);

  useEffect(
    () => () => {
      for (const timer of hostChatBubbleTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      hostChatBubbleTimersRef.current.clear();
      if (hostChatStreamTimerRef.current !== null) {
        window.clearTimeout(hostChatStreamTimerRef.current);
        hostChatStreamTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    hostChatRequestSequenceRef.current += 1;
    hostChatOpenRef.current = false;
    setHostChatOpen(false);
    setHostChatMessages([]);
    setHostChatDraft("");
    setHostChatBusy(false);
    setHostChatStreamingMessage(null);
    clearSignalHostChatBubbles();
  }, [clearSignalHostChatBubbles, selectedShow?.id]);

  useEffect(() => {
    if (!showIdentityControlsExpanded || !hostChatOpen) return;
    closeSignalHostChat();
  }, [closeSignalHostChat, hostChatOpen, showIdentityControlsExpanded]);

  useEffect(() => {
    if (!hostChatOpen) return;
    const frame = window.requestAnimationFrame(() => {
      hostChatComposerRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hostChatOpen]);

  useEffect(() => {
    if (!hostChatOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const cloud = hostChatCloudRef.current;
      if (cloud) cloud.scrollTop = cloud.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hostChatBubbles, hostChatOpen, hostChatStreamingMessage?.content]);

  const toggleSignalHostChat = useCallback((): void => {
    if (!selectedShow || !hostBot || showIdentityControlsExpanded) {
      return;
    }
    if (hostChatOpenRef.current) {
      closeSignalHostChat();
      return;
    }
    hostChatOpenRef.current = true;
    setHostChatOpen(true);
    showSignalHostChatBubbles(
      hostChatMessages.slice(-SIGNAL_HOST_CHAT_RECOVERY_LIMIT),
      true,
    );
  }, [
    closeSignalHostChat,
    hostBot,
    hostChatMessages,
    selectedShow,
    showIdentityControlsExpanded,
    showSignalHostChatBubbles,
  ]);

  const streamSignalHostChatResponse = useCallback(
    (
      message: BotcastShowHostChatMessage,
      requestSequence: number,
      showId: string,
    ): Promise<boolean> =>
      new Promise((resolve) => {
        const chunks = signalHostChatStreamChunks(message.content);
        let chunkIndex = 0;
        let streamedContent = "";
        const step = (): void => {
          hostChatStreamTimerRef.current = null;
          if (
            requestSequence !== hostChatRequestSequenceRef.current ||
            selectedShowIdRef.current !== showId ||
            !hostChatOpenRef.current
          ) {
            setHostChatStreamingMessage(null);
            resolve(false);
            return;
          }
          const chunk = chunks[chunkIndex];
          if (chunk === undefined) {
            setHostChatStreamingMessage(null);
            resolve(true);
            return;
          }
          streamedContent += chunk;
          chunkIndex += 1;
          setHostChatStreamingMessage({
            ...message,
            content: streamedContent,
          });
          hostChatStreamTimerRef.current = window.setTimeout(
            step,
            SIGNAL_HOST_CHAT_STREAM_CHUNK_MS,
          );
        };
        step();
      }),
    [],
  );

  const sendSignalHostChat = useCallback(async (): Promise<void> => {
    const content = hostChatDraft.trim();
    if (!content || !selectedShow || !hostBot || hostChatBusy) {
      return;
    }
    const showId = selectedShow.id;
    const requestSequence = ++hostChatRequestSequenceRef.current;
    const priorMessages = hostChatMessages
      .slice(-SIGNAL_HOST_CHAT_RECOVERY_LIMIT)
      .map(({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      }));
    const userMessage: BotcastShowHostChatMessage = {
      id: `signal-host-chat-user:${showId}:${requestSequence}`,
      role: "user",
      content,
      provider: null,
      model: null,
      createdAt: new Date().toISOString(),
    };
    setHostChatDraft("");
    setHostChatBusy(true);
    setHostChatMessages((current) =>
      [...current, userMessage].slice(-SIGNAL_HOST_CHAT_RECOVERY_LIMIT),
    );
    showSignalHostChatBubbles([userMessage]);
    try {
      const response = await request<BotcastShowHostChatResponse>(
        `/api/botcast/shows/${encodeURIComponent(showId)}/host-chat`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content,
            messages: priorMessages,
            preferredProvider: hostChatProvider,
          }),
        },
      );
      if (
        requestSequence !== hostChatRequestSequenceRef.current ||
        selectedShowIdRef.current !== showId
      ) {
        return;
      }
      const streamed = hostChatOpenRef.current
        ? await streamSignalHostChatResponse(
            response.message,
            requestSequence,
            showId,
          )
        : false;
      setHostChatMessages((current) =>
        [...current, response.message].slice(-SIGNAL_HOST_CHAT_RECOVERY_LIMIT),
      );
      if (streamed && hostChatOpenRef.current) {
        showSignalHostChatBubbles([response.message]);
      }
    } catch (chatError) {
      if (
        requestSequence === hostChatRequestSequenceRef.current &&
        selectedShowIdRef.current === showId
      ) {
        setHostChatDraft((current) => current || content);
        setError(signalErrorToast("Talk with Signal host", chatError));
      }
    } finally {
      if (
        requestSequence === hostChatRequestSequenceRef.current &&
        selectedShowIdRef.current === showId
      ) {
        setHostChatBusy(false);
      }
    }
  }, [
    hostBot,
    hostChatBusy,
    hostChatDraft,
    hostChatMessages,
    hostChatProvider,
    request,
    selectedShow,
    showSignalHostChatBubbles,
    streamSignalHostChatResponse,
  ]);
  const nextHostInterruptionBridge = useMemo<BotcastMessage | null>(() => {
    if (
      !episode ||
      episode.guestKind === "producer" ||
      episode.status !== "live" ||
      !selectedShow ||
      !hostBot
    ) {
      return null;
    }
    let bridgeContent: string;
    if (hostBot.muted) {
      bridgeContent = BOT_POWER_CANONICAL_SILENCE_V1;
    } else if (hostBot.echoesAddressedSpeech) {
      const activeGuestMessage = episode.messages.find(
        (message) =>
          message.id === speakingMessageId && message.speakerRole === "guest",
      );
      const spokenContent =
        activeGuestMessage && liveSpeech?.messageId === activeGuestMessage.id
          ? botcastSpeechRevealVisibleText(liveSpeech.reveal).trimEnd()
          : "";
      const echoPhrase = botcastEchoHostInterruptPhrase({
        messages: episode.messages,
        interruption: activeGuestMessage
          ? {
              messageId: activeGuestMessage.id,
              spokenContent,
            }
          : undefined,
      });
      bridgeContent = applyBotPowerEchoResponseV1(echoPhrase);
      if (!echoPhrase.trim()) return null;
    } else {
      bridgeContent = botcastHostInterruptionLineAt(
        selectedShow.hostInterruptionLines,
        hostInterruptionOrdinal,
      );
    }
    return {
      id: botcastInterruptionBridgeMessageId(
        episode.id,
        hostInterruptionOrdinal,
      ),
      episodeId: episode.id,
      speakerRole: "host",
      botId: hostBot.id,
      content: bridgeContent,
      stageActionText: null,
      voicePerformanceText: null,
      moodKey: "neutral",
      createdAt: new Date().toISOString(),
    };
  }, [
    episode,
    hostBot,
    hostInterruptionOrdinal,
    liveSpeech,
    selectedShow,
    speakingMessageId,
  ]);
  useEffect(() => {
    if (!nextHostInterruptionBridge || !hostBot || hostBot.muted) return;
    onPrefetchUtterance?.(nextHostInterruptionBridge, hostBot);
  }, [hostBot, nextHostInterruptionBridge, onPrefetchUtterance]);
  const nextHostInterruptionCrosstalkPlan =
    useMemo<ListenerReactionPlanV1 | null>(() => {
    if (!episode || !hostBot || !nextHostInterruptionBridge) return null;
    const activeGuestMessage = episode.messages.find(
      (message) =>
        message.id === speakingMessageId && message.speakerRole === "guest",
    );
      if (
        !activeGuestMessage ||
        activeGuestMessage.botId === BOTCAST_PRODUCER_GUEST_ID
      ) {
      return null;
    }
    const seed = `signal-host-crosstalk-v1:${episode.id}:${activeGuestMessage.id}:${nextHostInterruptionBridge.content}`;
    const originalWordCount = activeGuestMessage.content
      .trim()
      .split(/\s+/u)
      .filter(Boolean).length;
    const heardWordCount =
      liveSpeech?.messageId === activeGuestMessage.id
        ? botcastSpeechRevealVisibleText(liveSpeech.reveal)
            .trim()
            .split(/\s+/u)
            .filter(Boolean).length
        : 0;
    const meaningfulCutoff = crosstalkInterruptionIsMeaningfulV1({
      originalWordCount,
      heardWordCount,
    });
    const targetProgress =
      originalWordCount > 0
        ? Math.max(0.3, Math.min(0.9, heardWordCount / originalWordCount))
        : 0.6;
    const rawPlan: ListenerReactionPlanV1 = {
      v: 1,
      name: "listenerReaction",
      speakerBotId: activeGuestMessage.botId,
      listenerBotId: hostBot.id,
      messageId: activeGuestMessage.id,
      targetSource: "role",
      visualAction: "lean_in",
      interjectionAttempt: true,
      ...(meaningfulCutoff
        ? {
            interruptedSpeakerCue:
              botCrosstalkInterruptedSpeakerCueForSeed(seed),
            interruptedSpeakerCuePlayback: "crosstalk" as const,
          }
        : {}),
      targetProgress,
      seed,
      cameraCutEligible: true,
    };
    const interruptedBot = botsById.get(activeGuestMessage.botId);
    return applyBotPowerMumbledReactionPlanV1(rawPlan, {
      interruptedSpeaker: interruptedBot && interruptedBot.mumbling
        ? {
            pronunciationMapPoint:
              interruptedBot.pronunciationMapPoint ?? null,
            variationSeed: `${seed}:interrupted-speaker`,
          }
        : null,
    });
  }, [
    botsById,
    episode,
    hostBot,
    liveSpeech,
    nextHostInterruptionBridge,
    speakingMessageId,
  ]);
  useEffect(() => {
    if (!nextHostInterruptionCrosstalkPlan || !hostBot) return;
    const interruptedMessage = episode?.messages.find(
      (message) => message.id === nextHostInterruptionCrosstalkPlan.messageId,
    );
    const interruptedBot =
      interruptedMessage && episode
        ? botsById.get(nextHostInterruptionCrosstalkPlan.speakerBotId)
        : null;
    onPrefetchListenerReaction?.(
      nextHostInterruptionCrosstalkPlan,
      hostBot,
      interruptedBot && interruptedMessage && episode
        ? botWithIdentityBeforeMessage(
            interruptedBot,
            episode,
            interruptedMessage,
          )
        : undefined,
    );
  }, [
    botsById,
    episode,
    hostBot,
    nextHostInterruptionCrosstalkPlan,
    onPrefetchListenerReaction,
  ]);
  const studioLayoutGuest = hostBot
    ? (botsById.get(studioLayoutPreviewGuestId) ??
      eligibleBots.find((bot) => bot.id !== hostBot.id) ??
      null)
    : null;
  const openStudioLayoutEditor = (): void => {
    if (!selectedShow || !hostBot) return;
    const previewGuestId = randomSignalEpisodeGuestId({
      candidateGuestIds: eligibleBots.map((bot) => bot.id),
      hostBotId: hostBot.id,
      currentGuestId: studioLayoutPreviewGuestId,
    });
    setStudioEpisodeImageKindPreview("item");
    setStudioLayoutPreviewGuestId(previewGuestId ?? "");
    setStudioLayoutPreviewTheme(theme);
    setStudioCameraPreviewShot("wide");
    setStudioFineTuningOpen(false);
    void refreshStudioStagePresets();
    setStudioLayoutEditorOpen(true);
  };
  const hostShowAccent = selectedShow
    ? normalizeAccentForTheme(hostBot?.color ?? selectedShow.accentColor, theme)
    : null;
  const dashboardStudioLightingStyle = selectedShow
    ? signalStudioLightingStyle({
        show: selectedShow,
        layout: normalizeBotcastStudioLayout(selectedShow.studioLayout),
        hostColor: hostShowAccent ?? selectedShow.accentColor,
        guestColor: hostShowAccent ?? selectedShow.accentColor,
        theme,
      })
    : null;
  const liveGuestBot = useMemo(() => {
    if (!episode) return null;
    if (episode.guestKind === "producer") {
      return signalProducerGuestBotSummary(episode, selectedShow?.accentColor);
    }
    const bot = botsById.get(episode.guestBotId) ?? null;
    if (!bot) return null;
    const powers = botcastSnapshotPowersForRoleV1(episode, "guest");
    return powers
      ? {
          ...bot,
          muted: botPowerIsMutedV1(powers),
          voiceGainMultiplier: botPowerVoiceGainMultiplierV1(powers),
          voicePresence: botPowerVoicePresenceModeV1(powers),
        }
      : bot;
  }, [botsById, episode, selectedShow?.accentColor]);
  useEffect(() => {
    if (hostBot) onPrewarmResponseCue?.(hostBot.id);
    if (liveGuestBot && !liveGuestBot.producerGuest) {
      onPrewarmResponseCue?.(liveGuestBot.id);
    }
  }, [hostBot, liveGuestBot, onPrewarmResponseCue]);
  const replayHostBot = replayEpisode
    ? (() => {
        const bot = botsById.get(replayEpisode.hostBotId) ?? null;
        if (!bot) return null;
        const powers = botcastSnapshotPowersForRoleV1(replayEpisode, "host");
        return powers
          ? {
              ...bot,
              muted: botPowerIsMutedV1(powers),
              voiceGainMultiplier: botPowerVoiceGainMultiplierV1(powers),
              voicePresence: botPowerVoicePresenceModeV1(powers),
            }
          : bot;
      })()
    : null;
  const replayGuestBot = replayEpisode
    ? replayEpisode.guestKind === "producer"
      ? signalProducerGuestBotSummary(replayEpisode, selectedShow?.accentColor)
      : (() => {
          const bot = botsById.get(replayEpisode.guestBotId) ?? null;
          if (!bot) return null;
          const powers = botcastSnapshotPowersForRoleV1(replayEpisode, "guest");
          return powers
            ? {
                ...bot,
                muted: botPowerIsMutedV1(powers),
                voiceGainMultiplier: botPowerVoiceGainMultiplierV1(powers),
                voicePresence: botPowerVoicePresenceModeV1(powers),
              }
            : bot;
        })()
    : null;
  const [slateStoryEpisodeId, setSlateStoryEpisodeId] = useState<string | null>(
    null,
  );
  const reviewTranscriptForEpisode = async (
    targetEpisode: BotcastEpisode,
  ): Promise<{ title: string; transcript: string } | null> => {
    const targetShow =
      shows.find((show) => show.id === targetEpisode.showId) ?? selectedShow;
    if (!targetShow) return null;
    const [recordingEvidence, presenceBeats, sessionMetadata, focusEvents] = await Promise.all([
      loadSessionReviewRecordingEvidence(
        "signal",
        targetEpisode.id,
      ),
      request<{ beats: BotPresenceBeatV1[] }>(
        `/api/presence-beats?surface=signal&sessionId=${encodeURIComponent(targetEpisode.id)}`,
      )
        .then((response) => response.beats)
        .catch(() => []),
      request<AppletSessionNoteResponse>(
        appletSessionNoteRequestPath({
          surface: "signal",
          sessionId: targetEpisode.id,
        }),
      )
        .catch(() => ({ ok: true as const, note: null, frameSamples: [] })),
      loadLiveSessionFocusEvents("signal", targetEpisode.id).catch(() => []),
    ]);
    return {
      title: `${targetShow.name} — ${targetEpisode.title}`,
      transcript: annotateAppletTranscriptFrameRates(
        annotateTranscriptWithFocusEvents(appendAppletSessionNoteToTranscript(
          buildSignalReviewTranscript({
          episode: targetEpisode,
          show: targetShow,
          host: {
            id: targetEpisode.hostBotId,
            name: botsById.get(targetEpisode.hostBotId)?.name ?? "Host",
          },
          guest: {
            id: targetEpisode.guestBotId,
            name:
              targetEpisode.guestKind === "producer"
                ? (targetEpisode.guestName ?? producerName)
                : (botsById.get(targetEpisode.guestBotId)?.name ?? "Guest"),
          },
          modelLabel: targetEpisode.model
            ? (modelLabels.get(targetEpisode.model) ?? targetEpisode.model)
            : null,
          recordingEvidence,
          presenceBeats,
          }),
          sessionMetadata.note,
        ), focusEvents),
        sessionMetadata.frameSamples,
      ),
    };
  };
  const copyEpisodeForReview = async (
    targetEpisode: BotcastEpisode,
  ): Promise<void> => {
    setReviewCopyState({ episodeId: targetEpisode.id, phase: "copying" });
    try {
      const review = await reviewTranscriptForEpisode(targetEpisode);
      if (!review) throw new Error("Signal show unavailable.");
      const transcript = review.transcript;
      await writeSignalReviewClipboard(transcript);
      setReviewCopyState({ episodeId: targetEpisode.id, phase: "copied" });
    } catch {
      setReviewCopyState({ episodeId: targetEpisode.id, phase: "failed" });
    }
    window.setTimeout(() => {
      setReviewCopyState((current) =>
        current?.episodeId === targetEpisode.id ? null : current,
      );
    }, 2_400);
  };
  const createEpisodeStoryInSlate = async (
    targetEpisode: BotcastEpisode,
  ): Promise<void> => {
    if (!onCreateSlateStory || slateStoryEpisodeId) return;
    setSlateStoryEpisodeId(targetEpisode.id);
    try {
      const review = await reviewTranscriptForEpisode(targetEpisode);
      if (!review) throw new Error("Signal show unavailable.");
      await onCreateSlateStory({
        episodeId: targetEpisode.id,
        title: review.title,
        transcript: review.transcript,
      });
    } finally {
      setSlateStoryEpisodeId(null);
    }
  };
  const showCardQuips = selectedShow
    ? signalShowCardBlurbs(
        selectedShow,
        Boolean(hostBot?.muted),
        Boolean(hostBot?.echoesAddressedSpeech),
      )
    : null;
  const showCardQuipCount = showCardQuips?.length ?? 0;
  const showAudience = selectedShow
    ? signalAudienceSnapshot({ showId: selectedShow.id, episodes })
    : null;
  const showAudienceReviews = signalAudienceReviews(episodes);

  useEffect(() => {
    if (!audiencePulseOpen) {
      const focusTarget = audiencePulseReturnFocusRef.current?.isConnected
        ? audiencePulseReturnFocusRef.current
        : null;
      audiencePulseReturnFocusRef.current = null;
      focusTarget?.focus();
      return;
    }

    audiencePulseCloseButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAudiencePulseShowId(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog =
        audiencePulseCloseButtonRef.current?.closest<HTMLElement>(
          "[role='dialog']",
        );
      const focusable = dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
          )
        : [];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [audiencePulseOpen]);

  useEffect(() => {
    setShowCardQuipIndex(null);
    if (!selectedShowId || episode || replayEpisode || showCardQuipCount === 0)
      return;

    let nextIndex = Math.floor(Math.random() * showCardQuipCount);
    let timer: number | null = null;
    const queueQuip = (delayMs: number): void => {
      timer = window.setTimeout(() => {
        setShowCardQuipIndex(nextIndex);
        nextIndex = (nextIndex + 1) % showCardQuipCount;
        timer = window.setTimeout(() => {
          setShowCardQuipIndex(null);
          queueQuip(SIGNAL_SHOW_CARD_QUIP_GAP_MS);
        }, SIGNAL_SHOW_CARD_QUIP_VISIBLE_MS);
      }, delayMs);
    };

    queueQuip(SIGNAL_SHOW_CARD_QUIP_INITIAL_DELAY_MS);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [episode, replayEpisode, selectedShowId, showCardQuipCount]);

  const loadShows = useCallback(async (): Promise<BotcastShow[]> => {
    const response = await request<{ shows: BotcastShow[] }>(
      "/api/botcast/shows",
    );
    const rankedShows = signalShowsByAudienceRating(response.shows);
    setShows(rankedShows);
    return rankedShows;
  }, [request]);

  const refreshStudioStagePresets = useCallback(async (): Promise<void> => {
    setStudioStagePresetsLoading(true);
    try {
      const response = await request<{ presets: BotcastStagePreset[] }>(
        "/api/botcast/stage-presets",
      );
      setStudioStagePresets(response.presets);
    } catch (presetError) {
      setError(signalErrorToast("Load stage presets", presetError));
    } finally {
      setStudioStagePresetsLoading(false);
    }
  }, [request]);

  const refreshArtworkJob = useCallback(async (): Promise<void> => {
    try {
      const response = await request<{ job: SignalArtworkJobSnapshot | null }>(
        "/api/botcast/artwork-jobs/active",
      );
      setArtworkJob(response.job);
    } catch {
      // Preserve the last state through temporary API disconnects.
    }
  }, [request]);

  useEffect(() => {
    void refreshArtworkJob();
    const onArtworkJob = (event: Event): void => {
      setArtworkJob((event as CustomEvent<SignalArtworkJobSnapshot>).detail);
    };
    window.addEventListener(SIGNAL_ARTWORK_JOB_EVENT, onArtworkJob);
    return () =>
      window.removeEventListener(SIGNAL_ARTWORK_JOB_EVENT, onArtworkJob);
  }, [refreshArtworkJob]);

  useEffect(() => {
    if (!artworkJob || !signalArtworkJobIsActive(artworkJob)) return;
    const interval = window.setInterval(() => {
      void request<{ job: SignalArtworkJobSnapshot }>(
        `/api/botcast/artwork-jobs/${encodeURIComponent(artworkJob.id)}`,
      )
        .then((response) => setArtworkJob(response.job))
        .catch(() => undefined);
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [artworkJob, request]);

  useEffect(() => {
    if (!artworkJob) return;
    const completedCount =
      artworkJobCompletedCountRef.current.get(artworkJob.id) ?? 0;
    const completedAssetLanded = artworkJob.completedCount > completedCount;
    if (completedAssetLanded) {
      artworkJobCompletedCountRef.current.set(
        artworkJob.id,
        artworkJob.completedCount,
      );
      void loadShows().then((nextShows) => {
        const refreshedShow = nextShows.find(
          (show) => show.id === selectedShowId,
        );
        if (refreshedShow) setShowNameDraft(refreshedShow.name);
      });
    }

    if (
      signalArtworkJobIsActive(artworkJob) ||
      handledArtworkJobIdsRef.current.has(artworkJob.id)
    ) {
      return;
    }
    handledArtworkJobIdsRef.current.add(artworkJob.id);
    if (!completedAssetLanded) {
      void loadShows().then((nextShows) => {
        const refreshedShow = nextShows.find(
          (show) => show.id === selectedShowId,
        );
        if (refreshedShow) setShowNameDraft(refreshedShow.name);
      });
    }
    if (artworkJob.status === "completed") {
      setNotice(
        artworkJob.totalCount === 1
          ? `The refreshed ${signalArtworkAssetLabel(artworkJob.assets[0]!.kind)} is live.`
          : "The custom logo and matching Light and Dark studios are live.",
      );
    } else if (artworkJob.status === "partial") {
      setNotice(
        "Finished custom artwork is live; the PRISM set covers anything still missing.",
      );
      setError(
        signalErrorToast(
          "Complete show artwork",
          artworkJob.errors.at(-1)?.message ??
            "Some Signal artwork could not be completed.",
          "background artwork job",
        ),
      );
    } else if (artworkJob.status === "failed") {
      setError(
        signalErrorToast(
          "Complete show artwork",
          artworkJob.errors.at(-1)?.message ??
            "Signal artwork could not be completed.",
          "background artwork job",
        ),
      );
    } else if (artworkJob.status === "cancelled") {
      setNotice("Artwork synthesis stopped. Finished visuals were kept.");
    }
  }, [artworkJob, loadShows, selectedShowId]);

  const loadEpisodes = useCallback(
    async (showId: string): Promise<BotcastEpisodeSummary[]> => {
      const response = await request<{ episodes: BotcastEpisodeSummary[] }>(
        `/api/botcast/shows/${encodeURIComponent(showId)}/episodes`,
      );
      setEpisodes(response.episodes);
      return response.episodes;
    },
    [request],
  );

  const loadEpisode = useCallback(
    async (episodeId: string): Promise<BotcastEpisode> => {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/episodes/${encodeURIComponent(episodeId)}`,
      );
      return response.episode;
    },
    [request],
  );

  const cutShow = useCallback(
    async (options: { waitForOutro?: boolean } = {}): Promise<boolean> => {
      if (!episode || episode.status !== "live" || !selectedShow) return false;
      const episodeId = episode.id;
      const deterministicClose = cuttingShowRef.current;
      cuttingShowRef.current = true;
      const outgoingMessage = episode.messages.find(
        (message) => message.id === activeSpeechMessageIdRef.current,
      );
      if (outgoingMessage) {
        audibleHandoffOutgoingMessageIdRef.current = outgoingMessage.id;
      }
      invalidateEpisodeOperation({
        preserveAudibleUtterance: Boolean(outgoingMessage),
      });
      const { controller, runId } = beginEpisodeOperation();
      setCuttingShow(true);
      setBusy(true);
      setError(null);
      try {
        const response = await request<BotcastEpisodeAdvanceResponse>(
          `/api/botcast/episodes/${encodeURIComponent(episodeId)}/end`,
          {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({
              onAirElapsedMs: signalEpisodeRuntimeMs(
                episode,
                Date.now(),
                producerGuestThinkingStartedAtRef.current,
                producerGuestThinkingEndedAtRef.current,
                {
                  accumulatedMs: signalAirTimeFreezeAccumulatedMsRef.current,
                  startedAtMs: signalAirTimeFreezeStartedAtRef.current,
                },
                signalClientRecordedForegroundHoldRef.current.episodeId ===
                  episode.id
                  ? signalClientRecordedForegroundHoldRef.current.durationMs
                  : 0,
              ),
              deterministicClose,
            }),
          },
        );
        if (!episodeOperationIsCurrent(controller, runId)) return false;
        setAutoRun(false);
        if (response.message) {
          let persistedHandoff: Promise<BotcastEpisode | null> | null = null;
          if (!outgoingMessage) {
            prepareEpisodeMessageRef.current(response.message, response.episode);
          }
          await playPreparedEpisodeMessageRef.current(
            response.message,
            response.episode,
            controller,
            runId,
            false,
            undefined,
            outgoingMessage
              ? {
                  voiceChannel: "handoff",
                  deferPresentationUntilPlaybackStart: true,
                  onHandoffStart: () => {
                    const audienceHeard =
                      audibleHandoffAudienceHeardContent(outgoingMessage);
                    const audienceCut = botcastInterruptedGuestContent(
                      outgoingMessage.content,
                      audienceHeard,
                    );
                    onReleaseUtterance?.(
                      SIGNAL_AUDIBLE_HANDOFF_RELEASE_MS,
                    );
                    audibleHandoffOutgoingMessageIdRef.current = null;
                    if (!audienceCut) return;
                    persistedHandoff = request<{ episode: BotcastEpisode }>(
                      `/api/botcast/episodes/${encodeURIComponent(episodeId)}/cut-handoff`,
                      {
                        method: "POST",
                        body: JSON.stringify({
                          interruption: {
                            messageId: outgoingMessage.id,
                            speakerRole: outgoingMessage.speakerRole,
                            spokenContent: audienceHeard,
                          },
                        }),
                      },
                    )
                      .then((result) => result.episode)
                      .catch(() => null);
                  },
                }
              : undefined,
          );
          if (!episodeOperationIsCurrent(controller, runId)) return false;
          const persistedEpisode = persistedHandoff
            ? await persistedHandoff
            : null;
          if (persistedEpisode) response.episode = persistedEpisode;
        }
        setEpisode(response.episode);
        const outro = playEpisodeOutro({
          episode: response.episode,
          show: selectedShow,
          forced: true,
          discarded: response.discarded === true,
        });
        if (selectedShowId) {
          void Promise.all([loadEpisodes(selectedShowId), loadShows()]).catch(
            () => undefined,
          );
        }
        if (options.waitForOutro) await outro;
        else void outro;
        return true;
      } catch (cutError) {
        if (
          isAbortError(cutError) ||
          !episodeOperationIsCurrent(controller, runId)
        ) {
          return false;
        }
        setError(signalErrorToast("Cut live show", cutError));
        return false;
      } finally {
        if (episodeOperationIsCurrent(controller, runId)) {
          cuttingShowRef.current = false;
          setCuttingShow(false);
          setBusy(false);
        }
      }
    },
    [
      beginEpisodeOperation,
      audibleHandoffAudienceHeardContent,
      episode,
      episodeOperationIsCurrent,
      invalidateEpisodeOperation,
      loadEpisodes,
      loadShows,
      onReleaseUtterance,
      playEpisodeOutro,
      request,
      selectedShow,
      selectedShowId,
    ],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const nextShows = await loadShows();
        if (!active) return;
        const first =
          nextShows.find((show) => show.id === orchestrationLaunch?.showId) ??
          nextShows.find((show) => show.hostBotId === initialHostBotId) ??
          nextShows[0] ??
          null;
        if (first) {
          setSelectedShowId(first.id);
          setShowNameDraft(first.name);
          await loadEpisodes(first.id);
        }
      } catch (loadError) {
        if (active) setError(signalErrorToast("Load Signal shows", loadError));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    initialHostBotId,
    loadEpisodes,
    loadShows,
    orchestrationLaunch?.showId,
  ]);

  const selectShow = useCallback(
    async (show: BotcastShow): Promise<void> => {
      if (episode?.status === "live") {
        const cutCompleted = await cutShow({ waitForOutro: true });
        if (!cutCompleted) return;
      }
      invalidateEpisodeOperation();
      replayVoiceRunIdRef.current += 1;
      replayVoiceMessageIdRef.current = null;
      setReplayPlaying(false);
      setReplayVoicePending(false);
      setReplaySpeechActive(false);
      stopStudioSoundcheck();
      setSelectedShowId(show.id);
      setShowIdentityControlsShowId(null);
      setShowNameDraft(show.name);
      setEpisode(null);
      setReplayEpisode(null);
      setStudioLayoutEditorOpen(false);
      setStudioLayoutDraggingItem(null);
      studioLayoutDragRef.current = null;
      setStudioEpisodeImageDraggingShot(null);
      studioEpisodeImagePlacementDragRef.current = null;
      setStudioLogoPlacementDragging(false);
      studioLogoPlacementDragRef.current = null;
      setError(null);
      setLoading(true);
      try {
        await loadEpisodes(show.id);
      } catch (loadError) {
        setError(signalErrorToast("Load show episodes", loadError));
      } finally {
        setLoading(false);
      }
    },
    [
      cutShow,
      episode?.status,
      invalidateEpisodeOperation,
      loadEpisodes,
      stopStudioSoundcheck,
    ],
  );

  const replaceShow = (nextShow: BotcastShow): void => {
    setShows((current) => {
      const exists = current.some((show) => show.id === nextShow.id);
      return exists
        ? current.map((show) => (show.id === nextShow.id ? nextShow : show))
        : [nextShow, ...current];
    });
    if (nextShow.id === selectedShowId) setShowNameDraft(nextShow.name);
  };

  const saveStudioStagePreset = async (show: BotcastShow): Promise<void> => {
    const name = studioStagePresetNameDraft.trim();
    if (!name || studioStagePresetSaving) return;
    setStudioStagePresetSaving(true);
    setError(null);
    try {
      const response = await request<{ preset: BotcastStagePreset }>(
        "/api/botcast/stage-presets",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            settings: {
              studioLayout: show.studioLayout,
              cameraFraming: show.cameraFraming,
              logoPlacement: show.logoPlacement,
              studioGlowTuning: show.studioGlowTuning,
              voiceLevelsByBotId: show.voiceLevelsByBotId,
              atmosphereMix: show.atmosphereMix,
            },
          }),
        },
      );
      setStudioStagePresets((current) => [
        response.preset,
        ...current.filter(
          (preset) =>
            preset.id !== response.preset.id &&
            preset.name.trim().toLocaleLowerCase() !==
              response.preset.name.trim().toLocaleLowerCase(),
        ),
      ]);
      setStudioSelectedStagePresetId(response.preset.id);
      setStudioStagePresetNameDraft("");
      setNotice(`Saved “${response.preset.name}” as a Stage preset.`);
    } catch (presetError) {
      setError(signalErrorToast("Save stage preset", presetError));
    } finally {
      setStudioStagePresetSaving(false);
    }
  };

  const applyStudioStagePreset = async (
    show: BotcastShow,
    presetId: string,
  ): Promise<void> => {
    if (!presetId || studioStagePresetSaving) return;
    const presetName =
      studioStagePresets.find((preset) => preset.id === presetId)?.name ??
      "Stage preset";
    setStudioStagePresetSaving(true);
    setError(null);
    try {
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/stage-presets/${encodeURIComponent(presetId)}/apply`,
        { method: "POST", body: JSON.stringify({ showId: show.id }) },
      );
      replaceShow(response.show);
      setStudioSelectedStagePresetId(presetId);
      setNotice(
        `Applied “${presetName}” to ${show.name}. The stage settings are saved for this show.`,
      );
    } catch (presetError) {
      setError(signalErrorToast("Apply stage preset", presetError));
    } finally {
      setStudioStagePresetSaving(false);
    }
  };

  const deleteStudioStagePreset = async (presetId: string): Promise<void> => {
    if (studioStagePresetSaving) return;
    const presetName =
      studioStagePresets.find((preset) => preset.id === presetId)?.name ??
      "Stage preset";
    setStudioStagePresetSaving(true);
    setError(null);
    try {
      await request(`/api/botcast/stage-presets/${encodeURIComponent(presetId)}`, {
        method: "DELETE",
      });
      setStudioStagePresets((current) =>
        current.filter((preset) => preset.id !== presetId),
      );
      setStudioSelectedStagePresetId((current) =>
        current === presetId ? "" : current,
      );
      setNotice(`Deleted “${presetName}”.`);
    } catch (presetError) {
      setError(signalErrorToast("Delete stage preset", presetError));
    } finally {
      setStudioStagePresetSaving(false);
    }
  };

  const updateStudioLayoutDraft = (
    showId: string,
    layout: BotcastStudioLayout,
  ): void => {
    studioLayoutDraftRef.current = { showId, layout };
    setShows((current) =>
      current.map((show) =>
        show.id === showId ? { ...show, studioLayout: layout } : show,
      ),
    );
  };

  const queueStudioLayoutSave = (
    showId: string,
    layout: BotcastStudioLayout,
  ): void => {
    studioLayoutDraftRef.current = { showId, layout };
    studioLayoutSavePendingRef.current += 1;
    setStudioLayoutSaving(true);
    const queuedSave = studioLayoutSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const response = await request<{ show: BotcastShow }>(
          `/api/botcast/shows/${encodeURIComponent(showId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ studioLayout: layout }),
          },
        );
        const latestDraft = studioLayoutDraftRef.current;
        setShows((current) =>
          current.map((show) => {
          if (show.id !== showId) return show;
          return latestDraft?.showId === showId
            ? { ...response.show, studioLayout: latestDraft.layout }
            : response.show;
          }),
        );
      })
      .catch((saveError) => {
        setError(signalErrorToast("Save stage layout", saveError));
      })
      .finally(() => {
        studioLayoutSavePendingRef.current = Math.max(
          0,
          studioLayoutSavePendingRef.current - 1,
        );
        if (studioLayoutSavePendingRef.current === 0) {
          setStudioLayoutSaving(false);
        }
      });
    studioLayoutSaveQueueRef.current = queuedSave;
  };

  const flushStudioCameraFramingSave = async (): Promise<void> => {
    if (studioCameraFramingSaveInFlightRef.current) return;
    studioCameraFramingSaveInFlightRef.current = true;
    setStudioCameraFramingSaving(true);
    try {
      while (studioCameraFramingDraftRef.current) {
        const draft = studioCameraFramingDraftRef.current;
        const response = await request<{ show: BotcastShow }>(
          `/api/botcast/shows/${encodeURIComponent(draft.showId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ cameraFraming: draft.framing }),
          },
        );
        const latestDraft = studioCameraFramingDraftRef.current;
        setShows((current) =>
          current.map((show) => {
            if (show.id !== draft.showId) return show;
            return latestDraft?.showId === draft.showId
              ? { ...response.show, cameraFraming: latestDraft.framing }
              : response.show;
          }),
        );
        if (
          !latestDraft ||
          latestDraft.showId !== draft.showId ||
          latestDraft.revision === draft.revision
        ) {
          studioCameraFramingDraftRef.current = null;
          break;
        }
      }
    } catch (saveError) {
      studioCameraFramingDraftRef.current = null;
      setError(signalErrorToast("Save studio cameras", saveError));
    } finally {
      studioCameraFramingSaveInFlightRef.current = false;
      setStudioCameraFramingSaving(false);
      if (studioCameraFramingDraftRef.current) {
        void flushStudioCameraFramingSave();
      }
    }
  };

  const updateStudioCameraFrame = (
    show: BotcastShow,
    shot: BotcastDirectedCameraShot,
    update: Partial<BotcastCameraFrame>,
  ): void => {
    const previousDraft = studioCameraFramingDraftRef.current;
    const previousFraming = normalizeBotcastCameraFraming(
      previousDraft?.showId === show.id
        ? previousDraft.framing
        : show.cameraFraming,
    );
    const framing = normalizeBotcastCameraFraming(
      {
        ...previousFraming,
        [shot]: {
          ...previousFraming[shot],
          ...update,
        },
      },
      previousFraming,
    );
    studioCameraFramingDraftRef.current = {
      showId: show.id,
      framing,
      revision:
        previousDraft?.showId === show.id ? previousDraft.revision + 1 : 1,
    };
    setShows((current) =>
      current.map((candidate) =>
        candidate.id === show.id
          ? { ...candidate, cameraFraming: framing }
          : candidate,
      ),
    );
    void flushStudioCameraFramingSave();
  };

  const updateStudioEpisodeImagePlacement = (
    show: BotcastShow,
    shot: BotcastDirectedCameraShot,
    placement: BotcastEpisodeImagePlacement,
  ): void => {
    updateStudioCameraFrame(show, shot, { episodeImage: placement });
  };

  const beginStudioEpisodeImagePlacementDrag = (
    event: ReactPointerEvent<HTMLElement>,
    shot: BotcastDirectedCameraShot,
  ): void => {
    if (event.button !== 0) return;
    const stage = event.currentTarget.closest<HTMLElement>(
      '[data-signal-layout-stage="true"]',
    );
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    studioEpisodeImagePlacementDragRef.current = {
      pointerId: event.pointerId,
      shot,
      startClientX: event.clientX,
      startClientY: event.clientY,
      stageWidth: bounds.width,
      stageHeight: bounds.height,
      startPlacement: normalizeBotcastCameraFraming(
        selectedShowRef.current?.cameraFraming,
      )[shot].episodeImage,
    };
    setStudioEpisodeImageDraggingShot(shot);
  };

  const moveStudioEpisodeImagePlacementDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const drag = studioEpisodeImagePlacementDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const placement = normalizeBotcastEpisodeImagePlacement(
      {
        ...drag.startPlacement,
        x:
          drag.startPlacement.x +
          ((event.clientX - drag.startClientX) / drag.stageWidth) * 100,
        y:
          drag.startPlacement.y +
          ((event.clientY - drag.startClientY) / drag.stageHeight) * 100,
      },
      drag.startPlacement,
    );
    const show = selectedShowRef.current;
    if (show) updateStudioEpisodeImagePlacement(show, drag.shot, placement);
  };

  const finishStudioEpisodeImagePlacementDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const drag = studioEpisodeImagePlacementDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    studioEpisodeImagePlacementDragRef.current = null;
    setStudioEpisodeImageDraggingShot(null);
  };

  const nudgeStudioEpisodeImagePlacement = (
    event: ReactKeyboardEvent<HTMLElement>,
    shot: BotcastDirectedCameraShot,
  ): void => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    if (event.repeat) return;
    const step = BOTCAST_EPISODE_IMAGE_POSITION_STEP * (event.shiftKey ? 4 : 1);
    const show = selectedShowRef.current;
    if (!show) return;
    const placement = normalizeBotcastCameraFraming(show.cameraFraming)[shot]
      .episodeImage;
    updateStudioEpisodeImagePlacement(
      show,
      shot,
      normalizeBotcastEpisodeImagePlacement(
        {
          ...placement,
          x: placement.x + direction[0]! * step,
          y: placement.y + direction[1]! * step,
        },
        placement,
      ),
    );
  };

  const flushStudioLogoPlacementSave = async (): Promise<void> => {
    if (studioLogoPlacementSaveInFlightRef.current) return;
    studioLogoPlacementSaveInFlightRef.current = true;
    setStudioLogoPlacementSaving(true);
    try {
      while (studioLogoPlacementDraftRef.current) {
        const draft = studioLogoPlacementDraftRef.current;
        const response = await request<{ show: BotcastShow }>(
          `/api/botcast/shows/${encodeURIComponent(draft.showId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ logoPlacement: draft.placement }),
          },
        );
        const latestDraft = studioLogoPlacementDraftRef.current;
        setShows((current) =>
          current.map((show) => {
            if (show.id !== draft.showId) return show;
            return latestDraft?.showId === draft.showId
              ? { ...response.show, logoPlacement: latestDraft.placement }
              : response.show;
          }),
        );
        if (
          !latestDraft ||
          latestDraft.showId !== draft.showId ||
          latestDraft.revision === draft.revision
        ) {
          studioLogoPlacementDraftRef.current = null;
          break;
        }
      }
    } catch (saveError) {
      studioLogoPlacementDraftRef.current = null;
      setError(signalErrorToast("Save show logo placement", saveError));
    } finally {
      studioLogoPlacementSaveInFlightRef.current = false;
      setStudioLogoPlacementSaving(false);
      if (studioLogoPlacementDraftRef.current) {
        void flushStudioLogoPlacementSave();
      }
    }
  };

  const updateStudioLogoPlacement = (
    show: BotcastShow,
    value: unknown,
  ): void => {
    const previousDraft = studioLogoPlacementDraftRef.current;
    const previousPlacement = normalizeBotcastLogoPlacement(
      previousDraft?.showId === show.id
        ? previousDraft.placement
        : show.logoPlacement,
    );
    const placement = normalizeBotcastLogoPlacement(value, previousPlacement);
    studioLogoPlacementDraftRef.current = {
      showId: show.id,
      placement,
      revision:
        previousDraft?.showId === show.id ? previousDraft.revision + 1 : 1,
    };
    setShows((current) =>
      current.map((candidate) =>
        candidate.id === show.id
          ? { ...candidate, logoPlacement: placement }
          : candidate,
      ),
    );
    void flushStudioLogoPlacementSave();
  };

  const beginStudioLogoPlacementDrag = (
    event: ReactPointerEvent<HTMLElement>,
    show: BotcastShow,
  ): void => {
    if (event.button !== 0) return;
    const stage = event.currentTarget.closest<HTMLElement>(
      '[data-signal-layout-stage="true"]',
    );
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    studioLogoPlacementDragRef.current = {
      pointerId: event.pointerId,
      show,
      startClientX: event.clientX,
      startClientY: event.clientY,
      stageWidth: bounds.width,
      stageHeight: bounds.height,
      startPlacement: normalizeBotcastLogoPlacement(show.logoPlacement),
    };
    setStudioLogoPlacementDragging(true);
  };

  const moveStudioLogoPlacementDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const drag = studioLogoPlacementDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    updateStudioLogoPlacement(drag.show, {
      ...drag.startPlacement,
      x:
        drag.startPlacement.x +
        ((event.clientX - drag.startClientX) / drag.stageWidth) * 100,
      y:
        drag.startPlacement.y +
        ((event.clientY - drag.startClientY) / drag.stageHeight) * 100,
    });
  };

  const finishStudioLogoPlacementDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const drag = studioLogoPlacementDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    studioLogoPlacementDragRef.current = null;
    setStudioLogoPlacementDragging(false);
  };

  const nudgeStudioLogoPlacement = (
    event: ReactKeyboardEvent<HTMLElement>,
    show: BotcastShow,
  ): void => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    if (event.repeat) return;
    const step = BOTCAST_EPISODE_IMAGE_POSITION_STEP * (event.shiftKey ? 4 : 1);
    const placement = normalizeBotcastLogoPlacement(show.logoPlacement);
    updateStudioLogoPlacement(show, {
      ...placement,
      x: placement.x + direction[0]! * step,
      y: placement.y + direction[1]! * step,
    });
  };

  const flushStudioGlowTuningSave = async (): Promise<void> => {
    if (studioGlowTuningSaveInFlightRef.current) return;
    studioGlowTuningSaveInFlightRef.current = true;
    setStudioGlowTuningSaving(true);
    try {
      while (studioGlowTuningDraftRef.current) {
        const draft = studioGlowTuningDraftRef.current;
        const response = await request<{ show: BotcastShow }>(
          `/api/botcast/shows/${encodeURIComponent(draft.showId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ studioGlowTuning: draft.tuning }),
          },
        );
        const latestDraft = studioGlowTuningDraftRef.current;
        setShows((current) =>
          current.map((show) => {
            if (show.id !== draft.showId) return show;
            return latestDraft?.showId === draft.showId
              ? { ...response.show, studioGlowTuning: latestDraft.tuning }
              : response.show;
          }),
        );
        if (
          !latestDraft ||
          latestDraft.showId !== draft.showId ||
          latestDraft.revision === draft.revision
        ) {
          studioGlowTuningDraftRef.current = null;
          break;
        }
      }
    } catch (saveError) {
      studioGlowTuningDraftRef.current = null;
      setError(signalErrorToast("Save studio underglow", saveError));
    } finally {
      studioGlowTuningSaveInFlightRef.current = false;
      setStudioGlowTuningSaving(false);
      if (studioGlowTuningDraftRef.current) {
        void flushStudioGlowTuningSave();
      }
    }
  };

  const updateStudioGlowTuning = (
    show: BotcastShow,
    nextTuning: BotcastStudioGlowTuning,
  ): void => {
    const previousDraft = studioGlowTuningDraftRef.current;
    const fallbackTuning =
      previousDraft?.showId === show.id
        ? previousDraft.tuning
        : show.studioGlowTuning;
    const tuning = normalizeBotcastStudioGlowTuning(
      nextTuning,
      normalizeBotcastStudioGlowTuning(fallbackTuning),
    );
    studioGlowTuningDraftRef.current = {
      showId: show.id,
      tuning,
      revision:
        previousDraft?.showId === show.id ? previousDraft.revision + 1 : 1,
    };
    setShows((current) =>
      current.map((candidate) =>
        candidate.id === show.id
          ? { ...candidate, studioGlowTuning: tuning }
          : candidate,
      ),
    );
    void flushStudioGlowTuningSave();
  };

  const flushStudioVoiceLevelsSave = async (): Promise<void> => {
    if (studioVoiceLevelsSaveInFlightRef.current) return;
    studioVoiceLevelsSaveInFlightRef.current = true;
    setStudioVoiceLevelsSaving(true);
    try {
      while (studioVoiceLevelsDraftRef.current) {
        const draft = studioVoiceLevelsDraftRef.current;
        const response = await request<{ show: BotcastShow }>(
          `/api/botcast/shows/${encodeURIComponent(draft.showId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              voiceLevelsByBotId: draft.levels,
            }),
          },
        );
        const latestDraft = studioVoiceLevelsDraftRef.current;
        setShows((current) =>
          current.map((show) => {
            if (show.id !== draft.showId) return show;
            return latestDraft?.showId === draft.showId
              ? {
                  ...response.show,
                  voiceLevelsByBotId: latestDraft.levels,
                }
              : response.show;
          }),
        );
        if (
          !latestDraft ||
          latestDraft.showId !== draft.showId ||
          latestDraft.revision === draft.revision
        ) {
          studioVoiceLevelsDraftRef.current = null;
          break;
        }
      }
    } catch (saveError) {
      studioVoiceLevelsDraftRef.current = null;
      setError(signalErrorToast("Save cast voice levels", saveError));
    } finally {
      studioVoiceLevelsSaveInFlightRef.current = false;
      setStudioVoiceLevelsSaving(false);
      if (studioVoiceLevelsDraftRef.current) {
        void flushStudioVoiceLevelsSave();
      }
    }
  };

  const updateStudioVoiceLevel = (
    show: BotcastShow,
    botId: string,
    rawLevel: unknown,
  ): void => {
    stopStudioSoundcheck();
    const previousDraft = studioVoiceLevelsDraftRef.current;
    const previousLevels =
      previousDraft?.showId === show.id
        ? previousDraft.levels
        : show.voiceLevelsByBotId;
    const levels = normalizeBotcastVoiceLevelsByBotId(
      {
        ...previousLevels,
        [botId]: normalizeBotcastVoiceLevel(rawLevel),
      },
      previousLevels,
    );
    studioVoiceLevelsDraftRef.current = {
      showId: show.id,
      levels,
      revision:
        previousDraft?.showId === show.id ? previousDraft.revision + 1 : 1,
    };
    setShows((current) =>
      current.map((candidate) =>
        candidate.id === show.id
          ? { ...candidate, voiceLevelsByBotId: levels }
          : candidate,
      ),
    );
    void flushStudioVoiceLevelsSave();
  };

  const flushStudioAtmosphereMixSave = async (): Promise<void> => {
    if (studioAtmosphereMixSaveInFlightRef.current) return;
    studioAtmosphereMixSaveInFlightRef.current = true;
    setStudioAtmosphereMixSaving(true);
    try {
      while (studioAtmosphereMixDraftRef.current) {
        const draft = studioAtmosphereMixDraftRef.current;
        const response = await request<{ show: BotcastShow }>(
          `/api/botcast/shows/${encodeURIComponent(draft.showId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ atmosphereMix: draft.mix }),
          },
        );
        const latestDraft = studioAtmosphereMixDraftRef.current;
        setShows((current) =>
          current.map((show) => {
            if (show.id !== draft.showId) return show;
            return latestDraft?.showId === draft.showId
              ? { ...response.show, atmosphereMix: latestDraft.mix }
              : response.show;
          }),
        );
        if (!latestDraft) break;
        if (
          latestDraft.showId === draft.showId &&
          latestDraft.revision === draft.revision
        ) {
          studioAtmosphereMixDraftRef.current = null;
          break;
        }
      }
    } catch (saveError) {
      studioAtmosphereMixDraftRef.current = null;
      setError(signalErrorToast("Save studio atmosphere mix", saveError));
    } finally {
      studioAtmosphereMixSaveInFlightRef.current = false;
      setStudioAtmosphereMixSaving(false);
      if (studioAtmosphereMixDraftRef.current) {
        void flushStudioAtmosphereMixSave();
      }
    }
  };

  const updateStudioAtmosphereMix = (
    show: BotcastShow,
    nextMix: BotcastStudioAtmosphereMix,
  ): void => {
    const previousDraft = studioAtmosphereMixDraftRef.current;
    const fallbackMix =
      previousDraft?.showId === show.id
        ? previousDraft.mix
        : show.atmosphereMix;
    const mix = normalizeBotcastStudioAtmosphereMix(nextMix, fallbackMix);
    studioAtmosphereMixDraftRef.current = {
      showId: show.id,
      mix,
      revision:
        previousDraft?.showId === show.id ? previousDraft.revision + 1 : 1,
    };
    setShows((current) =>
      current.map((candidate) =>
        candidate.id === show.id
          ? { ...candidate, atmosphereMix: mix }
          : candidate,
      ),
    );
    void flushStudioAtmosphereMixSave();
  };

  const beginStudioLayoutDrag = (
    event: ReactPointerEvent<HTMLElement>,
    show: BotcastShow,
    item: BotcastStudioLayoutItem,
  ): void => {
    if (event.button !== 0) return;
    const stage = event.currentTarget.closest<HTMLElement>(
      '[data-signal-layout-stage="true"]',
    );
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const layout = normalizeBotcastStudioLayout(show.studioLayout);
    studioLayoutDragRef.current = {
      pointerId: event.pointerId,
      showId: show.id,
      item,
      startClientX: event.clientX,
      startClientY: event.clientY,
      stageWidth: bounds.width,
      stageHeight: bounds.height,
      startLayout: layout,
      latestLayout: layout,
    };
    setStudioLayoutDraggingItem(item);
  };

  const moveStudioLayoutDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const drag = studioLayoutDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const startPoint = drag.startLayout[drag.item];
    const floorGlow = signalStudioLayoutItemIsFloorGlow(drag.item);
    const layout = normalizeBotcastStudioLayout(
      {
        ...drag.startLayout,
        [drag.item]: {
          ...startPoint,
          x: floorGlow
            ? startPoint.x
            : startPoint.x +
              ((event.clientX - drag.startClientX) / drag.stageWidth) * 100,
          y:
            startPoint.y +
            ((event.clientY - drag.startClientY) / drag.stageHeight) * 100,
          ...(floorGlow
            ? {
                scale:
                  (startPoint.scale ?? BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX) +
                  ((event.clientX - drag.startClientX) / drag.stageWidth) *
                    SIGNAL_STUDIO_FLOOR_GLOW_DRAG_SCALE_PER_STAGE,
              }
            : {}),
        },
      },
      drag.startLayout,
    );
    drag.latestLayout = layout;
    updateStudioLayoutDraft(drag.showId, layout);
  };

  const finishStudioLayoutDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const drag = studioLayoutDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    studioLayoutDragRef.current = null;
    setStudioLayoutDraggingItem(null);
    queueStudioLayoutSave(drag.showId, drag.latestLayout);
  };

  const nudgeStudioLayoutItem = (
    event: ReactKeyboardEvent<HTMLElement>,
    show: BotcastShow,
    item: BotcastStudioLayoutItem,
  ): void => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    if (event.repeat) return;
    const positionStep = event.shiftKey ? 2 : 0.5;
    const scaleStep =
      BOTCAST_STUDIO_FLOOR_GLOW_SCALE_STEP * (event.shiftKey ? 2 : 1);
    const layout = normalizeBotcastStudioLayout(show.studioLayout);
    const point = layout[item];
    const floorGlow = signalStudioLayoutItemIsFloorGlow(item);
    const nextLayout = normalizeBotcastStudioLayout(
      {
        ...layout,
        [item]: {
          ...point,
          x: floorGlow ? point.x : point.x + direction[0]! * positionStep,
          y: point.y + direction[1]! * positionStep,
          ...(floorGlow
            ? {
                scale:
                  (point.scale ?? BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX) +
                  direction[0]! * scaleStep,
              }
            : {}),
        },
      },
      layout,
    );
    updateStudioLayoutDraft(show.id, nextLayout);
    queueStudioLayoutSave(show.id, nextLayout);
  };

  const resetStudioLayout = (show: BotcastShow): void => {
    const layout = normalizeBotcastStudioLayout(BOTCAST_DEFAULT_STUDIO_LAYOUT);
    updateStudioLayoutDraft(show.id, layout);
    queueStudioLayoutSave(show.id, layout);
  };

  const swapStudioLayoutSeats = (show: BotcastShow): void => {
    const layout = swapBotcastStudioLayoutSeats(show.studioLayout);
    updateStudioLayoutDraft(show.id, layout);
    queueStudioLayoutSave(show.id, layout);
  };

  const resetEpisodePlayback = (): void => {
    invalidateEpisodeOperation();
    replayVoiceRunIdRef.current += 1;
    setReplayPlaying(false);
    setReplayIntroRevealed(false);
    setReplayVoicePending(false);
    setReplaySpeechActive(false);
    replayPublishedElapsedMsRef.current = 0;
    setReplayElapsedMs(0);
    replayVoiceMessageIdRef.current = null;
  };

  const openShowDeletion = (show: BotcastShow, opener: HTMLElement): void => {
    resetEpisodePlayback();
    deleteReturnFocusRef.current = opener;
    setDeleteError(null);
    setDeleteTarget({
      kind: "show",
      id: show.id,
      name: show.name,
      episodeCount: show.episodeCount,
    });
  };

  const openEpisodeDeletion = (
    item: Pick<BotcastEpisodeSummary, "id" | "showId" | "title" | "status">,
    opener: HTMLElement,
  ): void => {
    resetEpisodePlayback();
    deleteReturnFocusRef.current = opener;
    setDeleteError(null);
    setDeleteTarget({
      kind: "episode",
      id: item.id,
      showId: item.showId,
      title: item.title,
      status: item.status,
    });
  };

  const dismissDeletion = (): void => {
    if (busy) return;
    setDeleteError(null);
    setDeleteTarget(null);
  };

  useEffect(() => {
    if (!deleteTarget) {
      const focusTarget = deleteReturnFocusRef.current?.isConnected
        ? deleteReturnFocusRef.current
        : document.querySelector<HTMLElement>(
            "[data-botcast-delete-focus-fallback='true']",
          );
      deleteReturnFocusRef.current = null;
      focusTarget?.focus();
      return;
    }
    deleteCancelButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        setDeleteError(null);
        setDeleteTarget(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = deleteCancelButtonRef.current?.closest<HTMLElement>(
        "[role='alertdialog']",
      );
      const focusable = dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
          )
        : [];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, deleteTarget]);

  const deleteConfirmedTarget = async (): Promise<void> => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setBusy(true);
    setDeleteError(null);
    setError(null);
    try {
      if (target.kind === "show") {
        const nextShowId = nextBotcastShowIdAfterDeletion(shows, target.id);
        await request(`/api/botcast/shows/${encodeURIComponent(target.id)}`, {
          method: "DELETE",
        });
        resetEpisodePlayback();
        setEpisode(null);
        setReplayEpisode(null);
        setEpisodes([]);
        setGuestDraftId("");
        setTopicDraft("");
        setProducerBriefDraft("");
        setGuestBriefDraft("");
        clearProducerCueDraftInputs({ quote: false });
        const nextShows = await loadShows();
        const nextShow =
          nextShows.find((show) => show.id === nextShowId) ??
          nextShows[0] ??
          null;
        setSelectedShowId(nextShow?.id ?? null);
        setShowNameDraft(nextShow?.name ?? "");
        if (nextShow) await loadEpisodes(nextShow.id);
        setNotice(
          target.episodeCount
            ? `${target.name} and ${target.episodeCount} episode${target.episodeCount === 1 ? "" : "s"} deleted.`
            : `${target.name} deleted.`,
        );
      } else {
        await request(
          `/api/botcast/episodes/${encodeURIComponent(target.id)}`,
          {
          method: "DELETE",
          },
        );
        resetEpisodePlayback();
        setEpisode((current) => (current?.id === target.id ? null : current));
        setReplayEpisode((current) =>
          current?.id === target.id ? null : current,
        );
        await Promise.all([loadShows(), loadEpisodes(target.showId)]);
        setNotice(
          target.status === "live"
            ? `“${target.title}” discarded.`
            : `“${target.title}” deleted from the archive.`,
        );
      }
      setDeleteTarget(null);
    } catch (deleteRequestError) {
      setDeleteError(errorMessage(deleteRequestError));
    } finally {
      setBusy(false);
    }
  };

  const generateSignalRefractDraft = async (
    target: PrismRefractSignalTextTarget,
    currentValue: string,
    rejectedValues: readonly string[],
    signal: AbortSignal,
  ): Promise<string> => {
    const bookingTarget =
      target.kind === "signal.booking.topic" ||
      target.kind === "signal.booking.producerBrief";
    const selectedEpisodeModel = episodeModelDraft
      ? (modelOptions.find((option) => option.id === episodeModelDraft) ?? null)
      : null;
    const routedProvider = bookingTarget
      ? (selectedEpisodeModel?.provider ?? preferredProvider)
      : preferredProvider;
    const response = await request<PrismRefractResponse>("/api/prism/refract", {
        method: "POST",
        body: JSON.stringify({
          target,
          currentValue,
          rejectedValues,
          preferredProvider: routedProvider,
          responseMode,
          ...(bookingTarget
            ? {
              modelOverride: selectedEpisodeModel?.id ?? null,
              }
            : {}),
        }),
        signal,
    });
    return response.value;
  };

  const createShow = async (): Promise<void> => {
    if (!hostDraftId) return;
    setBusy(true);
    setError(null);
    setNotice("Finding the show hidden inside this host…");
    try {
      const premiseInspiration = (
        (await expandComposerDraft?.(showPremiseInspirationDraft)) ??
        showPremiseInspirationDraft
      ).trim();
      const response = await request<{ show: BotcastShow }>(
        "/api/botcast/shows",
        {
        method: "POST",
        body: JSON.stringify({
          hostBotId: hostDraftId,
          ...(premiseInspiration ? { premise: premiseInspiration } : {}),
        }),
        },
      );
      await selectShow(response.show);
      replaceShow(response.show);
      setShowNameDraft(response.show.name);
      setNotice(
        `${response.show.name} is ready with its built-in PRISM set. Create its custom look whenever you want one.`,
      );
      setHostDraftId("");
      setShowPremiseInspirationDraft("");
      await loadShows();
    } catch (createError) {
      setError(signalErrorToast("Create Signal show", createError));
    } finally {
      setBusy(false);
    }
  };

  const renameShow = async (nextName?: string): Promise<void> => {
    if (!selectedShow) return;
    const name = (nextName ?? showNameDraft).trim();
    if (!name || name === selectedShow.name) {
      setShowNameDraft(selectedShow.name);
      return;
    }
    setShowNameDraft(name);
    setShows((current) =>
      current.map((show) =>
        show.id === selectedShow.id ? { ...show, name } : show,
      ),
    );
    try {
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}`,
        { method: "PATCH", body: JSON.stringify({ name }) },
      );
      replaceShow(response.show);
    } catch (renameError) {
      setShowNameDraft(selectedShow.name);
      setError(signalErrorToast("Rename Signal show", renameError));
    }
  };

  const saveShowPremise = async (nextPremise?: string): Promise<void> => {
    if (!selectedShow) return;
    const premise = (
      (await expandComposerDraft?.(nextPremise ?? showPremiseDraft)) ??
      nextPremise ??
      showPremiseDraft
    ).trim();
    if (!premise || premise === selectedShow.premise) {
      setShowPremiseDraft(selectedShow.premise);
      return;
    }
    setShowPremiseDraft(premise);
    try {
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}`,
        { method: "PATCH", body: JSON.stringify({ premise }) },
      );
      replaceShow(response.show);
      setNotice(
        "The show premise is saved as creative direction for future episodes and identity passes.",
      );
    } catch (premiseError) {
      setShowPremiseDraft(selectedShow.premise);
      setError(signalErrorToast("Save show premise", premiseError));
    }
  };

  const regenerateShowBlurbs = async (direction = ""): Promise<void> => {
    if (!selectedShow) return;
    setBusy(true);
    setError(null);
    setBlockingOperation({
      title: "Refreshing the host’s dashboard voice",
      detail: `Signal is writing a new batch of short, show-specific lines for ${selectedShow.name}.`,
      stepLabel: "Writing and rejecting the generic lines",
      progress: null,
      cancellable: false,
    });
    try {
      const response = await request<{
        show: BotcastShow;
        generated: boolean;
        attempts: number;
        recovered: boolean;
        failureReason: "provider_error" | "invalid_output" | null;
      }>(`/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/blurbs`, {
          method: "POST",
          body: JSON.stringify({
            preferredProvider,
            ...(direction ? { direction } : {}),
          }),
      });
      if (!response.generated) {
        setNotice(
          response.failureReason === "provider_error"
            ? "Signal couldn’t reach the selected model for a new set of blurbs. The current lines are unchanged; try again when the model is ready."
            : "The model answered, but not with enough distinct usable blurbs. The current lines are unchanged; try again for a fresh recovery pass.",
        );
        return;
      }
      replaceShow(response.show);
      setNotice(
        response.recovered
          ? hostBot?.echoesAddressedSpeech
            ? `Signal recovered one repeating dashboard blurb across ${response.attempts} passes.`
            : `Signal recovered ${response.show.dashboardBlurbs.length} fresh host blurbs across ${response.attempts} passes.`
          : hostBot?.echoesAddressedSpeech
            ? "One repeating dashboard blurb is now in rotation."
            : `${response.show.dashboardBlurbs.length} fresh host blurbs are now in rotation.`,
      );
    } catch (blurbError) {
      setError(signalErrorToast("Refresh show blurbs", blurbError));
    } finally {
      setBlockingOperation(null);
      setBusy(false);
    }
  };

  const startSignalArtworkJob = async (
    sourceShow: BotcastShow,
    kinds: readonly SignalArtworkKind[],
    identityMs: number | null = null,
    signal?: AbortSignal,
    direction = "",
    selection?: AssetGenerationSelection,
  ): Promise<SignalArtworkJobSnapshot> => {
    const response = await request<{ job: SignalArtworkJobSnapshot }>(
      `/api/botcast/shows/${encodeURIComponent(sourceShow.id)}/artwork-job`,
      {
        method: "POST",
        body: JSON.stringify({
          preferredProvider: selection?.provider ?? preferredImageProvider,
          ...(selection ? { model: selection.model } : {}),
          kinds,
          ...(identityMs === null ? {} : { identityMs }),
          ...(direction.trim() ? { direction: direction.trim() } : {}),
        }),
        signal,
      },
    );
    setArtworkJob(response.job);
    announceSignalArtworkJob(response.job);
    return response.job;
  };

  const synthesizeShowLook = async (direction = ""): Promise<void> => {
    if (!selectedShow) return;
    const controller = new AbortController();
    const identityStartedAt = performance.now();
    let showForPass = selectedShow;
    let artworkStarted = false;
    let artworkHandoffStarted = false;
    let directionAppliedToAudioIdentity = false;
    const recoverableFailures: string[] = [];
    setBusy(true);
    setError(null);
    setNotice("Checking what this show still needs…");
    blockingAbortRef.current = controller;
    setBlockingOperation({
      title: `Completing ${selectedShow.name}`,
      detail:
        "Signal adds only the missing pieces. Existing artwork and audio stay exactly where they are.",
      stepLabel: "Checking the identity package",
      progress: null,
      cancellable: true,
    });
    try {
      let manifest = signalShowMagicManifest(showForPass);
      if (manifest.complete) {
        setNotice("This show’s generated identity is already complete.");
        return;
      }

      if (manifest.needsTextIdentity) {
        setBlockingOperation((current) =>
          current
            ? { ...current, stepLabel: "Writing the missing text identity" }
            : current,
        );
        try {
          const identity = await request<{
            show: BotcastShow;
            generated: boolean;
          }>(
            `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/brand`,
            {
            method: "POST",
            body: JSON.stringify({
              preferredProvider,
              preserveArtwork: true,
              ...(direction ? { direction } : {}),
            }),
            signal: controller.signal,
            },
          );
          showForPass = identity.show;
          if (identity.generated) {
            directionAppliedToAudioIdentity = Boolean(direction);
            replaceShow(identity.show);
            setShowNameDraft(identity.show.name);
          } else {
            recoverableFailures.push("the text identity");
          }
        } catch (identityError) {
          if (isAbortError(identityError)) throw identityError;
          recoverableFailures.push("the text identity");
        }
      }

      const identityMs = Math.max(
        0,
        Math.round(performance.now() - identityStartedAt),
      );
      manifest = signalShowMagicManifest(showForPass);
      if (manifest.missingArtwork.length > 0) {
        setBlockingOperation((current) =>
          current
            ? {
                ...current,
                stepLabel: "Handing missing artwork to the background renderer",
              }
            : current,
        );
        try {
          artworkHandoffStarted = true;
          const job = await startSignalArtworkJob(
            showForPass,
            manifest.missingArtwork,
            identityMs,
            controller.signal,
          );
          artworkStarted = true;
          // The job is deliberately background work. Continue with the audio
          // package instead of waiting for every visual to finish.
          setArtworkJob(job);
        } catch (artworkError) {
          if (isAbortError(artworkError)) throw artworkError;
          recoverableFailures.push("the visual identity");
        }
      }

      manifest = signalShowMagicManifest(showForPass);
      if (manifest.needsAudioPackage) {
        if (preferredProvider === "local") {
          setNotice(
            artworkStarted
              ? "Artwork is continuing in the background. The ElevenLabs audio package is waiting for Online."
              : "The remaining ElevenLabs audio package is waiting for Online.",
          );
        } else {
          setBlockingOperation((current) =>
            current
              ? { ...current, stepLabel: "Creating the missing audio package" }
              : current,
          );
          let audioIdentityReady = true;
          if (direction && !directionAppliedToAudioIdentity) {
            try {
              const identity = await request<{
                show: BotcastShow;
                generated: boolean;
              }>(
                `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/music-identity`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    preferredProvider,
                    direction,
                  }),
                  signal: controller.signal,
                },
              );
              if (!identity.generated) {
                audioIdentityReady = false;
                recoverableFailures.push("the directed audio identity");
              } else {
                showForPass = identity.show;
                replaceShow(identity.show);
              }
            } catch (identityError) {
              if (isAbortError(identityError)) throw identityError;
              audioIdentityReady = false;
              recoverableFailures.push("the directed audio identity");
            }
          }
          if (audioIdentityReady) {
            try {
              const response = await request<{ show: BotcastShow }>(
                `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/intro-audio/generate`,
                {
                  method: "POST",
                  body: JSON.stringify({}),
                  signal: controller.signal,
                },
              );
              showForPass = response.show;
              replaceShow(response.show);
            } catch (audioError) {
              if (isAbortError(audioError)) throw audioError;
              recoverableFailures.push("the ElevenLabs audio package");
            }
          }
        }
      }

      if (recoverableFailures.length > 0) {
        setError(
          signalErrorToast(
            "Complete Signal show",
            `Signal could not complete ${recoverableFailures.join(" or ")}. Rerun Complete this show to retry only what is still missing.`,
            "identity handoff",
          ),
        );
      }
      if (preferredProvider !== "local" && recoverableFailures.length === 0) {
        setNotice(
          artworkStarted
            ? "Artwork is landing in the background; every other missing identity piece is ready."
            : "This show’s missing identity pieces are ready.",
        );
      }
    } catch (completionError) {
      if (isAbortError(completionError)) {
        setNotice(
          artworkStarted
            ? "Identity handoff cancelled. Artwork already started and will continue in the background; the foreground text/audio handoff stopped."
            : artworkHandoffStarted
              ? "Identity handoff cancelled while artwork was being handed to the background renderer. If it started, that artwork continues; the foreground text/audio handoff stopped."
              : "Show completion cancelled before background artwork started.",
        );
      } else {
        setError(signalErrorToast("Complete Signal show", completionError));
      }
    } finally {
      if (blockingAbortRef.current === controller)
        blockingAbortRef.current = null;
      setBlockingOperation(null);
      setBusy(false);
    }
  };

  const regenerateStudio = async (
    direction = "",
    selection?: AssetGenerationSelection,
  ): Promise<void> => {
    if (!selectedShow) return;
    setBusy(true);
    setError(null);
    setNotice("Refreshing the show’s linked studio pair…");
    try {
      await startSignalArtworkJob(
        selectedShow,
        ["night-studio", "day-studio"],
        null,
        undefined,
        direction,
        selection,
      );
      if (preferredProvider === "local") {
        setNotice(
          "The refreshed Dark studio and source-linked Light studio are rendering in the background. Signal will keep the built-in room atmosphere while you are Local. You can keep using PRISM.",
        );
      } else {
        try {
          const response = await request<{ show: BotcastShow }>(
            `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/atmosphere-audio/generate`,
            {
              method: "POST",
              body: JSON.stringify({}),
            },
          );
          replaceShow(response.show);
          setNotice(
            "The refreshed studio pair is rendering in the background, and its studio-specific room-and-Foley atmosphere is ready. You can keep using PRISM.",
          );
        } catch (atmosphereError) {
          setError(
            signalErrorToast("Refresh studio atmosphere", atmosphereError),
          );
          setNotice(
            "The refreshed studio pair is still rendering in the background. Its previous atmosphere remains active. You can keep using PRISM.",
          );
        }
      }
    } catch (studioError) {
      setError(signalErrorToast("Refresh Dark studio", studioError));
      setNotice("The previous linked studio pair remains in place.");
    } finally {
      setBusy(false);
    }
  };

  const regenerateLogo = async (
    direction = "",
    selection?: AssetGenerationSelection,
  ): Promise<void> => {
    if (!selectedShow) return;
    setBusy(true);
    setError(null);
    setNotice("Refreshing the show’s logo…");
    try {
      await startSignalArtworkJob(
        selectedShow,
        ["logo"],
        null,
        undefined,
        direction,
        selection,
      );
      setNotice(
        "The refreshed logo is rendering in the background. You can keep using PRISM.",
      );
    } catch (logoError) {
      setError(signalErrorToast("Refresh Signal logo", logoError));
      setNotice("The previous logo remains in place.");
    } finally {
      setBusy(false);
    }
  };

  const undoShowLogo = async (): Promise<void> => {
    if (
      !selectedShow ||
      busy ||
      selectedShowArtworkBusy ||
      (!selectedShow.logo.previousImageUrl &&
        !selectedShow.logo.previousImageId)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/logo/undo`,
        { method: "POST" },
      );
      replaceShow(response.show);
      setNotice("The previous Signal logo is active again.");
    } catch (undoError) {
      setError(signalErrorToast("Undo Signal logo", undoError));
    } finally {
      setBusy(false);
    }
  };

  const generateShowIntroAudio = async (direction = ""): Promise<void> => {
    if (!selectedShow) return;
    if (preferredProvider === "local") {
      setError(
        signalErrorToast(
          "Generate studio audio",
          "Switch to Online before creating an ElevenLabs Signal atmosphere.",
          "provider requirement",
        ),
      );
      return;
    }
    stopIntroPreview();
    const controller = new AbortController();
    blockingAbortRef.current = controller;
    setBusy(true);
    setError(null);
    setNotice("Creating this show’s atmosphere audio…");
    setBlockingOperation({
      title: `Creating ${selectedShow.name}’s atmosphere`,
      detail:
        "ElevenLabs is creating one short instrumental ident and one quiet studio-specific room-and-Foley loop. Signal will cache both for future episodes.",
      stepLabel: "Creating the audio package",
      progress: null,
      cancellable: true,
    });
    try {
      if (direction) {
        setBlockingOperation((current) =>
          current
            ? {
                ...current,
                stepLabel: "Shaping the instrumental identity",
              }
            : current,
        );
        const identity = await request<{
          show: BotcastShow;
          generated: boolean;
        }>(
          `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/music-identity`,
          {
            method: "POST",
            body: JSON.stringify({
              preferredProvider,
              direction,
            }),
            signal: controller.signal,
          },
        );
        if (!identity.generated) {
          throw new Error(
            "Signal could not shape a usable audio identity for this pass.",
          );
        }
        replaceShow(identity.show);
        setBlockingOperation((current) =>
          current
            ? { ...current, stepLabel: "Creating the audio package" }
            : current,
        );
      }
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/intro-audio/generate`,
        {
          method: "POST",
          body: JSON.stringify({}),
          signal: controller.signal,
        },
      );
      replaceShow(response.show);
      setNotice(
        "The ElevenLabs ident and studio-specific room-and-Foley atmosphere are ready for future episodes.",
      );
    } catch (introError) {
      if (isAbortError(introError)) {
        setNotice(
          "Atmosphere creation cancelled. The current audio package remains active.",
        );
      } else {
        setError(signalErrorToast("Generate studio audio", introError));
      }
    } finally {
      if (blockingAbortRef.current === controller)
        blockingAbortRef.current = null;
      setBlockingOperation(null);
      setBusy(false);
    }
  };

  const selectLocalShowIntro = async (): Promise<void> => {
    if (
      !selectedShow ||
      (selectedShow.introAudio.source === "local" &&
        selectedShow.atmosphereAudio.source === "bundled")
    ) {
      return;
    }
    stopIntroPreview();
    setBusy(true);
    setError(null);
    try {
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/intro-audio`,
        { method: "DELETE" },
      );
      replaceShow(response.show);
      setNotice(
        "Signal Synth and the built-in studio atmosphere are now active.",
      );
    } catch (introError) {
      setError(signalErrorToast("Use local studio audio", introError));
    } finally {
      setBusy(false);
    }
  };

  const synthesizeShowIdent = async (): Promise<void> => {
    if (!selectedShow) return;
    const isLocal = preferredProvider === "local";
    stopIntroPreview();
    const controller = new AbortController();
    blockingAbortRef.current = controller;
    setBusy(true);
    setError(null);
    setNotice(
      isLocal
        ? "Synthesizing a fresh local Signal ident…"
        : "Synthesizing a Premium Signal ident…",
    );
    setBlockingOperation(
      isLocal
        ? null
        : {
            title: `Synthesizing ${selectedShow.name}’s ident`,
            detail:
              "ElevenLabs is creating one short instrumental ident. The current studio atmosphere will stay active.",
            stepLabel: "Creating the ident",
            progress: null,
            cancellable: true,
          },
    );
    try {
      const response = await request<{ show: BotcastShow }>(
        isLocal
          ? `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/ident-audio`
          : `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/ident-audio/generate`,
        {
          method: isLocal ? "DELETE" : "POST",
          body: isLocal ? undefined : JSON.stringify({}),
          signal: controller.signal,
        },
      );
      replaceShow(response.show);
      setNotice(
        isLocal
          ? "A fresh local Signal Synth ident is ready."
          : "The Premium ElevenLabs ident is ready for future episodes.",
      );
    } catch (identError) {
      if (isAbortError(identError)) {
        setNotice(
          "Ident synthesis cancelled. The current ident and atmosphere remain active.",
        );
      } else {
        setError(signalErrorToast("Synthesize ident", identError));
      }
    } finally {
      if (blockingAbortRef.current === controller)
        blockingAbortRef.current = null;
      setBlockingOperation(null);
      setBusy(false);
    }
  };

  const undoShowAudioPackage = async (): Promise<void> => {
    if (
      !selectedShow ||
      busy ||
      (!selectedShow.introAudio.undoAvailable &&
        !selectedShow.atmosphereAudio.undoAvailable)
    ) {
      return;
    }
    stopIntroPreview();
    setBusy(true);
    setError(null);
    try {
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/audio/undo`,
        { method: "POST" },
      );
      replaceShow(response.show);
      setNotice("The previous Signal audio package is active again.");
    } catch (undoError) {
      setError(signalErrorToast("Undo Signal audio", undoError));
    } finally {
      setBusy(false);
    }
  };

  const toggleShowIntroPreview = (): void => {
    if (!selectedShow) return;
    if (introPreviewShowId === selectedShow.id) {
      stopIntroPreview();
      return;
    }
    if (!introAudioEnabled) {
      setNotice("Turn voice audio on to preview the Signal intro.");
      return;
    }
    const runId = introPreviewRunIdRef.current + 1;
    introPreviewRunIdRef.current = runId;
    setError(null);
    const playback = playSignalIntroAudio({
      ...signalIntroIdentityForShow(selectedShow, hostBot),
      introAudio: selectedShow.introAudio,
      enabled: true,
      volume: introAudioVolume,
    });
    setIntroPreviewShowId(selectedShow.id);
    void playback.finished.then(() => {
      if (introPreviewRunIdRef.current === runId) {
        setIntroPreviewShowId(null);
      }
    });
  };

  const reuseShowAssetSet = async (
    asset: ImageAssetSet,
    label: string,
  ): Promise<void> => {
    if (!selectedShow || busy || selectedShowArtworkBusy) return;
    setBusy(true);
    setError(null);
    setNotice(`Installing the saved ${label}…`);
    try {
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/asset-sets/${encodeURIComponent(asset.id)}/reuse`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      replaceShow(response.show);
      setNotice(
        `The saved ${label} is live. No image-generation tokens were used.`,
      );
    } catch (reuseError) {
      setError(signalErrorToast(`Reuse ${label}`, reuseError));
      setNotice(`The current ${label} remains in place.`);
    } finally {
      setBusy(false);
    }
  };

  const startEpisode = async (
    override?: SignalEpisodeStartOverride,
  ): Promise<void> => {
    const launchShow = override?.show ?? selectedShow;
    const launchGuestId = override?.guestBotId ?? guestDraftId;
    const launchTopic = override?.topic ?? topicDraft;
    const launchProducerBrief = override?.producerBrief ?? producerBriefDraft;
    const launchSetupEpisodeImage =
      override?.setupEpisodeImage ?? setupEpisodeImage;
    const launchWatchAutoStart =
      override?.watchAutoStart ?? watchAutoStartDraft;
    const launchHostBot = launchShow
      ? (botsById.get(launchShow.hostBotId) ?? null)
      : null;
    const producerGuest = launchGuestId === BOTCAST_PRODUCER_GUEST_ID;
    const launchGuestBrief = producerGuest
      ? ""
      : (override?.guestBrief ?? guestBriefDraft).trim();
    const watchMode = playbackModeDraft === "watch" && !producerGuest;
    const producerGuestWantsSurprise =
      producerGuest && !producerGuestContextDraft.trim();
    if (
      !launchShow ||
      !launchHostBot ||
      !launchGuestId ||
      (!producerGuest && !launchTopic.trim())
    )
      return;
    const guest = eligibleBots.find((bot) => bot.id === launchGuestId);
    const selectedModelOption = episodeModelDraft
      ? (modelOptions.find((option) => option.id === episodeModelDraft) ?? null)
      : null;
    const setupImageModelCapable =
      signalEpisodeModelChoiceSupportsImageInput(
        modelOptions,
        episodeModelDraft,
      );
    if (!producerGuest && !guest) {
      setError(
        signalErrorToast(
          "Start Signal episode",
          "That guest is no longer available. Choose another bot before going live.",
          "guest validation",
        ),
      );
      return;
    }
    if (
      launchSetupEpisodeImage &&
      (producerGuest || !setupImageModelCapable)
    ) {
      setError(
        signalErrorToast(
          "Start Signal episode",
          "Choose Auto or a fixed model whose current pool supports image input.",
          "setup image capability",
        ),
      );
      return;
    }
    if (
      launchSetupEpisodeImage &&
      !launchSetupEpisodeImage.descriptor.name.trim()
    ) {
      setError(
        signalErrorToast(
          "Start Signal episode",
          "Add a Name for the attached episode image.",
          "setup image name",
        ),
      );
      return;
    }
    stopStudioSoundcheck();
    setStudioLayoutEditorOpen(false);
    stopIntroPreview();
    onPrepareUtterance?.();
    setWatchBakeLabel(null);
    setWatchPlaybackReady(false);
    watchPlaybackStartResolveRef.current = null;
    const { controller, runId } = beginEpisodeOperation();
    const episodeProvider = selectedModelOption?.provider ?? preferredProvider;
    let warmupWasNeeded = false;
    let preparationPending = true;
    const preparation = selectedModelOption
      ? waitForModelPreparation({
          request,
          provider: episodeProvider,
          model: selectedModelOption.id,
          experience: "signal",
          signal: controller.signal,
          onStatus: (status) => {
            if (status.state === "warming") {
              warmupWasNeeded = true;
              const current = signalModelWarmupRef.current;
              assignSignalModelWarmup({
                phase: current?.phase === "held" ? "held" : "entering",
                model: status.model,
                startedAt: status.startedAt,
                failure: null,
                initial: true,
                episodeId: current?.episodeId ?? null,
              });
            } else if (status.state === "unavailable") {
              assignSignalModelWarmup({
                phase: "failed",
                model: status.model,
                startedAt: status.startedAt,
                failure: status.failure,
                initial: true,
                episodeId: signalModelWarmupRef.current?.episodeId ?? null,
              });
            }
          },
        })
      : Promise.resolve(autoModelPreparationNotApplicable());
    const preRoll: SignalEpisodePreRoll = {
      showId: launchShow.id,
      showName: launchShow.name,
      guestName: producerGuest ? producerName : guest!.name,
      topic: producerGuest
        ? producerGuestWantsSurprise
          ? "Host’s choice"
          : "Synthesizing your interview"
        : launchTopic.trim(),
      phase: "preparing",
      source: launchShow.introAudio.source,
    };
    let provisionalCaptureId: string | null = null;
    let introPlayback: { durationMs: number; finished: Promise<void> } = {
      durationMs: 0,
      finished: Promise.resolve(),
    };
    let visualMinimum = Promise.resolve();
    let reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const beginEpisodeIntroBookend = async (
      bookend: SignalEpisodePreRoll,
      captureSourceId: string,
    ): Promise<void> => {
      preRollSkipRequestedRef.current = false;
      setEpisodePreRoll(bookend);
      provisionalCaptureId = captureSourceId;
      primeReplayAudioMasterCapture();
      if (
        await startReplayAudioMasterCapture(captureSourceId, {
          markIntro: true,
          compactThinkingGaps: true,
          voiceSelection: recordingVoiceSelection,
        })
      ) {
        signalCaptureSourceIdRef.current = captureSourceId;
      }
      introPlayback = playSignalIntroAudio({
        ...signalIntroIdentityForShow(launchShow, launchHostBot),
        introAudio: launchShow.introAudio,
        enabled: introAudioEnabled,
        volume: introAudioVolume,
        startDelayMs: SIGNAL_EPISODE_INTRO_LEAD_IN_MS,
      });
      reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ===
        true;
      // Gate the opening card and first speech on the full extended ident, not a
      // shorter visual minimum that can release dialogue early.
      const introPresentationMs = Math.max(
        SIGNAL_EPISODE_PRE_ROLL_MIN_MS,
        SIGNAL_EPISODE_INTRO_LEAD_IN_MS + introPlayback.durationMs,
      );
      visualMinimum = new Promise<void>((resolve) => {
        let settled = false;
        const timer = window.setTimeout(
          finish,
          reducedMotion
            ? Math.min(1_100, introPresentationMs)
            : introPresentationMs,
        );
        function finish(): void {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          if (preRollGateResolveRef.current === finish) {
            preRollGateResolveRef.current = null;
          }
          resolve();
        }
        preRollGateResolveRef.current = finish;
      });
      void visualMinimum.then(() => {
        if (!episodeOperationIsCurrent(controller, runId)) return;
        if (!preparationPending) return;
        const current = signalModelWarmupRef.current;
        if (!current || current.phase === "releasing") return;
        signalModelWarmupVisibleRef.current = true;
        assignSignalModelWarmup({
          ...current,
          phase: current.phase === "failed" ? "failed" : "held",
        });
        // The card is also the startup buffer curtain. Keep it up until the
        // shared opening-advance path has a real first line, including when
        // the guest is the Producer and they never answer the host. Otherwise
        // a slow preparation can expose the guest shot before the intended
        // wide → opening-speaker sequence is ready.
        // Do not stop the ident here: cutting it short resolves
        // introPlayback.finished early and lets the opening line air before the
        // extended intro has completed.
      });
    };

    // Watch bakes behind a fullscreen loader first. The branded intro card
    // only opens once the synthesized episode is ready to present.
    if (watchMode) {
      assignQueuedProducerCue(null);
      setWatchBakeLabel(liveBakeSurfaceTitle("signal"));
    } else {
      await beginEpisodeIntroBookend(
        preRoll,
        `signal-pending:${launchShow.id}:${Date.now()}`,
      );
    }
    setBusy(true);
    setError(null);
    let unstartedEpisodeId: string | null = null;
    let setupImageUpload: SignalEpisodeImageUpload | null = null;
    let openingMessageReceived = false;
    let latestCaptureEpisode: BotcastEpisode | null = null;
    try {
      const resolvedProducerBrief = producerGuest
        ? ""
        : (
            (await expandComposerDraft?.(launchProducerBrief)) ??
            launchProducerBrief
          ).trim();
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/shows/${encodeURIComponent(launchShow.id)}/episodes`,
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            ...(producerGuest
              ? {
                  guestKind: "producer",
                  guestContext: producerGuestContextDraft,
                }
              : {
                  guestKind: "bot",
                  guestBotId: launchGuestId,
                  topic: launchTopic.trim(),
                  producerBrief: resolvedProducerBrief,
                  guestBrief: launchGuestBrief,
                }),
            ...(watchMode ? { playbackMode: "watch" } : {}),
            preferredProvider: episodeProvider,
            responseMode,
            modelOverride: selectedModelOption?.id ?? null,
            ...(reasoningEffort === "max" ? { reasoningEffort: "max" } : {}),
            durationMinutes: episodeDurationDraft,
          }),
        },
      );
      if (!episodeOperationIsCurrent(controller, runId)) return;
      unstartedEpisodeId = response.episode.id;
      latestCaptureEpisode = response.episode;
      signalEpisodeCameraFramingSnapshotRef.current.set(
        response.episode.id,
        normalizeBotcastCameraFraming(launchShow.cameraFraming),
      );
      if (launchSetupEpisodeImage) {
        setupImageUpload = {
          episodeId: response.episode.id,
          ...launchSetupEpisodeImage,
          descriptor: {
            ...launchSetupEpisodeImage.descriptor,
            name: launchSetupEpisodeImage.descriptor.name.trim(),
          },
          reason: launchSetupEpisodeImage.reason.trim(),
        };
        signalEpisodeImageRef.current = setupImageUpload;
        setSignalEpisodeImage(setupImageUpload);
        setKeepSignalItem(false);
      }
      if (
        provisionalCaptureId &&
        signalCaptureSourceIdRef.current === provisionalCaptureId &&
        adoptReplayAudioMasterCaptureSourceId(
          provisionalCaptureId,
          response.episode.id,
        )
      ) {
        signalCaptureSourceIdRef.current = response.episode.id;
      }
      void startReplayRecordingDraft({
        surface: "signal",
        sourceId: response.episode.id,
      }).catch(() => undefined);
      if (producerGuest) {
        setEpisodePreRoll((current) =>
          current
            ? {
                ...current,
                guestName:
                  response.episode.guestName ?? BOTCAST_PRODUCER_GUEST_NAME,
                topic: producerGuestWantsSurprise
                  ? current.topic
                  : response.episode.topic,
              }
            : current,
        );
      }
      setEpisode(response.episode);
      producerGuestAnswerDraftRef.current = "";
      setProducerGuestAnswerDraft("");
      setReplayEpisode(null);
      if (warmupWasNeeded || signalModelWarmupRef.current) {
        const current = signalModelWarmupRef.current;
        assignSignalModelWarmup(
          current ? { ...current, episodeId: response.episode.id } : current,
        );
        await setPersistedSignalModelWarmupHold(response.episode.id, true);
      }
      const preparationStatus = await preparation;
      preparationPending = false;
      if (!episodeOperationIsCurrent(controller, runId)) return;
      if (preparationStatus.state === "unavailable") {
        signalModelWarmupVisibleRef.current = true;
        assignSignalModelWarmup({
          phase: "failed",
          model: preparationStatus.model,
          startedAt: preparationStatus.startedAt,
          failure: preparationStatus.failure,
          initial: true,
          episodeId: response.episode.id,
        });
        setWatchBakeLabel(null);
        setEpisodePreRoll(null);
        releaseSignalIntroAudio();
        return;
      }
      if (!signalModelWarmupVisibleRef.current) {
        assignSignalModelWarmup(null);
      }
      if (watchMode) {
        setWatchBakeLabel(liveBakeSurfaceTitle("signal"));
        setWatchBakeStartedAt(new Date().toISOString());
        let bakedEpisode = response.episode;
        let artifact: LiveBakeArtifactV1 | null = null;
        const watchBakeRequestBody = {
          theme,
          ...(setupImageUpload
            ? {
              episodeImage: {
                imageId: setupImageUpload.imageId,
                fileName: setupImageUpload.fileName,
                dataUrl: setupImageUpload.dataUrl,
                ...(setupImageUpload.archivalProxyEpisodeId
                  ? {
                      archivalProxyEpisodeId:
                        setupImageUpload.archivalProxyEpisodeId,
                    }
                  : {}),
                name: setupImageUpload.descriptor.name,
                  reason: setupImageUpload.reason,
                  replayEmoji: setupImageUpload.replayEmoji,
                },
              }
            : {}),
        };
        const startBake = await request<{
          episode: BotcastEpisode;
          liveBake: LiveBakeArtifactV1;
          baking?: boolean;
        }>(
          `/api/botcast/episodes/${encodeURIComponent(response.episode.id)}/bake`,
          {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify(watchBakeRequestBody),
          },
        );
        if (!episodeOperationIsCurrent(controller, runId)) return;
        bakedEpisode = startBake.episode;
        artifact = startBake.liveBake;
        setWatchBakeArtifact(artifact);
        setWatchBakeLabel(liveBakeStatusCopy(artifact));
        void prefetchKnownWatchEpisodeVoices(bakedEpisode);
        while (
          episodeOperationIsCurrent(controller, runId) &&
          artifact &&
          artifact.status !== "ready" &&
          artifact.status !== "failed" &&
          artifact.status !== "cancelled"
        ) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, LIVE_BAKE_POLL_INTERVAL_MS),
          );
          if (!episodeOperationIsCurrent(controller, runId)) return;
          const polled = await request<{
            episode: BotcastEpisode;
            liveBake: LiveBakeArtifactV1;
            baking?: boolean;
          }>(
            `/api/botcast/episodes/${encodeURIComponent(response.episode.id)}/bake`,
            {
              method: "POST",
              signal: controller.signal,
              body: JSON.stringify(watchBakeRequestBody),
            },
          );
          bakedEpisode = polled.episode;
          artifact = polled.liveBake;
          setWatchBakeArtifact(artifact);
          setWatchBakeLabel(liveBakeStatusCopy(artifact));
          void prefetchKnownWatchEpisodeVoices(bakedEpisode);
          if (artifact.status === "cancelled") {
            throw new DOMException("Bake cancelled", "AbortError");
          }
          if (artifact.status === "failed") {
            throw new Error(artifact.error || "Signal bake failed.");
          }
        }
        if (!episodeOperationIsCurrent(controller, runId) || !artifact) return;
        if (artifact.status === "cancelled") {
          throw new DOMException("Bake cancelled", "AbortError");
        }
        if (artifact.status === "failed") {
          throw new Error(artifact.error || "Signal bake failed.");
        }
        if (artifact.status !== "ready" || bakedEpisode.status !== "completed") {
          throw new Error("Signal preparation ended before the episode was ready.");
        }
        await prefetchKnownWatchEpisodeVoices(bakedEpisode);
        if (!episodeOperationIsCurrent(controller, runId)) return;
        latestCaptureEpisode = bakedEpisode;
        openingMessageReceived = bakedEpisode.messages.length > 0;
        setTopicDraft("");
        setProducerBriefDraft("");
        setGuestBriefDraft("");
        setProducerGuestContextDraft("");
        setInternalEpisodeModelDraft("");
        clearProducerCueDraftInputs({ quote: false });
        void loadEpisodes(launchShow.id).catch(() => undefined);
        // Hold the completed-status outro fallback until Watch presents lines.
        // Bake artifacts arrive already `completed`, which used to open the end
        // card during intro and truncate faithful capture to a few seconds.
        suppressCompletedOutroFallbackRef.current = true;
        try {
          const presentationEpisode = bakedEpisode;
          setEpisode(presentationEpisode);
          setWatchReplayPresentationEpisodeId(presentationEpisode.id);
          setAutoRun(false);
          await releaseSignalModelWarmup(presentationEpisode.id);
          if (!episodeOperationIsCurrent(controller, runId)) return;
          setWatchBakeLabel(null);
          const watchBookend: SignalEpisodePreRoll = {
            ...preRoll,
            guestName:
              presentationEpisode.guestName ?? guest?.name ?? preRoll.guestName,
            topic: presentationEpisode.topic.trim() || preRoll.topic,
            phase: "preparing",
          };
          if (!launchWatchAutoStart) {
            const watchPlaybackStart = new Promise<void>((resolve) => {
              watchPlaybackStartResolveRef.current = resolve;
            });
            // The title card is a true ready hold. Do not start its audio or
            // faithful-master clock until the spectator chooses Start show.
            setEpisodePreRoll(watchBookend);
            setWatchPlaybackReady(true);
            await watchPlaybackStart;
            watchPlaybackStartResolveRef.current = null;
            setWatchPlaybackReady(false);
            if (!episodeOperationIsCurrent(controller, runId)) return;
          }
          // Watch enters Replay only after the complete episode and requested
          // voice package are ready. This first presentation still captures the
          // faithful master; the durable transport replaces it after the outro.
          await beginEpisodeIntroBookend(watchBookend, presentationEpisode.id);
          await Promise.all([introPlayback.finished, visualMinimum]);
          if (!episodeOperationIsCurrent(controller, runId)) return;
          setEpisodePreRoll(null);
          for (const message of presentationEpisode.messages) {
            if (!episodeOperationIsCurrent(controller, runId)) return;
            prepareEpisodeMessage(message, presentationEpisode);
            await playPreparedEpisodeMessage(
              message,
              presentationEpisode,
              controller,
              runId,
              true,
            );
          }
          setEpisode(presentationEpisode);
          setWatchBakeLabel(null);
          setWatchBakeArtifact(null);
          setWatchBakeStartedAt(null);
          const recording = await playEpisodeOutro({
            episode: presentationEpisode,
            show: launchShow,
            forced: false,
          });
          if (!episodeOperationIsCurrent(controller, runId)) return;
          const keepItemDecisionRequired =
            setupImageUpload?.descriptor.kind === "item";
          if (recording && !keepItemDecisionRequired) {
            stopEpisodeOutro();
            await openReplayRef.current(presentationEpisode, {
              preserveEpisodeOperation: true,
              initialPosition: "end",
            });
          }
        } finally {
          suppressCompletedOutroFallbackRef.current = false;
        }
        return;
      }
      let opening: BotcastEpisodeAdvanceResponse | null = null;
      for (
        let attempt = 0;
        attempt < SIGNAL_OPENING_ADVANCE_ATTEMPTS;
        attempt += 1
      ) {
        opening = await request<BotcastEpisodeAdvanceResponse>(
          `/api/botcast/episodes/${encodeURIComponent(response.episode.id)}/advance`,
          {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({ theme }),
          },
        );
        if (opening.message || opening.episode.status === "completed") break;
      }
      if (!episodeOperationIsCurrent(controller, runId)) return;
      if (!opening?.message) {
        throw new Error(
          "Signal could not get the opening line on mic. Try starting the episode again.",
        );
      }
      openingMessageReceived = true;
      latestCaptureEpisode = opening.episode;
      setTopicDraft("");
      setProducerBriefDraft("");
      setGuestBriefDraft("");
      setProducerGuestContextDraft("");
      setInternalEpisodeModelDraft("");
      clearProducerCueDraftInputs({ quote: false });
      void loadEpisodes(launchShow.id).catch(() => undefined);
      setEpisode(opening.episode);
      prepareEpisodeMessage(opening.message, opening.episode);
      await releaseSignalModelWarmup(opening.episode.id);
      await Promise.all([introPlayback.finished, visualMinimum]);
      if (!episodeOperationIsCurrent(controller, runId)) return;
      let openingCardReleaseStarted = false;
      const releaseOpeningCard = (): void => {
        if (openingCardReleaseStarted) return;
        openingCardReleaseStarted = true;
        const landingMs =
          preRollSkipRequestedRef.current || reducedMotion ? 90 : 460;
        setEpisodePreRoll((current) =>
          current?.showId === launchShow.id
            ? { ...current, phase: "landing" }
            : current,
        );
        window.setTimeout(() => {
          if (!episodeOperationIsCurrent(controller, runId)) return;
          setEpisodePreRoll((current) =>
            current?.showId === launchShow.id ? null : current,
          );
        }, landingMs);
        releaseSignalIntroAudio();
      };
      await playPreparedEpisodeMessage(
        opening.message,
        opening.episode,
        controller,
        runId,
        true,
        releaseOpeningCard,
        { onPresenceStart: releaseOpeningCard },
      );
      if (!episodeOperationIsCurrent(controller, runId)) return;
      if (setupImageUpload) {
        assignQueuedProducerCue({
          kind: "present_image",
          imageId: setupImageUpload.imageId,
        });
        setSetupEpisodeImage(null);
      }
      setAutoRun(true);
    } catch (startError) {
      if (episodeOperationIsCurrent(controller, runId)) {
        preRollGateResolveRef.current?.();
        preRollGateResolveRef.current = null;
        releaseSignalIntroAudio();
        setWatchBakeLabel(null);
        setEpisodePreRoll(null);
        setWatchPlaybackReady(false);
        setWatchReplayPresentationEpisodeId(null);
        setWatchReplayFinalizingEpisodeId(null);
        watchPlaybackStartResolveRef.current = null;
        setAutoRun(false);
        if (unstartedEpisodeId && signalModelWarmupRef.current) {
          await releaseSignalModelWarmup(unstartedEpisodeId);
        }
        if (unstartedEpisodeId && !openingMessageReceived) {
          onInvalidatePrefetchedEpisode?.(unstartedEpisodeId);
          try {
            await request(
              `/api/botcast/episodes/${encodeURIComponent(unstartedEpisodeId)}`,
              { method: "DELETE" },
            );
            setEpisode(null);
            void loadEpisodes(launchShow.id).catch(() => undefined);
          } catch {
            // Keep the original startup error; the archive can still be discarded manually.
          }
        }
        const captureSourceId = signalCaptureSourceIdRef.current;
        if (!openingMessageReceived && captureSourceId) {
          signalCaptureSourceIdRef.current = null;
          await abortReplayAudioMasterCapture(captureSourceId);
        } else if (openingMessageReceived && latestCaptureEpisode) {
          await finalizeSignalRecording(latestCaptureEpisode, launchShow);
        }
        setError(signalErrorToast("Start Signal episode", startError));
      }
    } finally {
      if (episodeOperationIsCurrent(controller, runId)) {
        preRollGateResolveRef.current = null;
        episodeOperationAbortRef.current = null;
        setWatchBakeLabel(null);
        setWatchPlaybackReady(false);
        watchPlaybackStartResolveRef.current = null;
        setBusy(false);
      }
    }
  };
  startEpisodeRef.current = startEpisode;

  useEffect(() => {
    const launch = orchestrationLaunch;
    if (
      !launch ||
      orchestrationLaunchHandledTokenRef.current === launch.token ||
      orchestrationLaunchStagedTokenRef.current === launch.token ||
      episode
    ) {
      return;
    }
    const show = shows.find((candidate) => candidate.id === launch.showId);
    if (!show) return;
    if (selectedShowId !== show.id) {
      void selectShow(show);
      return;
    }
    if (!botsById.has(launch.guestBotId)) {
      setError(
        signalErrorToast(
          "Start Prism episode",
          "The selected guest is no longer installed.",
          "Prism orchestration",
        ),
      );
      orchestrationLaunchHandledTokenRef.current = launch.token;
      onOrchestrationLaunchConsumed?.(launch.token);
      return;
    }
    setGuestDraftId(launch.guestBotId);
    setTopicDraft(launch.topic);
    setProducerBriefDraft(launch.producerBrief);
    setGuestBriefDraft("");
    orchestrationLaunchStagedTokenRef.current = launch.token;
  }, [
    botsById,
    episode,
    onOrchestrationLaunchConsumed,
    orchestrationLaunch,
    selectedShowId,
    selectShow,
    shows,
  ]);

  useEffect(() => {
    const launch = orchestrationLaunch;
    if (
      !launch ||
      orchestrationLaunchHandledTokenRef.current === launch.token ||
      orchestrationLaunchStagedTokenRef.current !== launch.token ||
      selectedShowId !== launch.showId ||
      guestDraftId !== launch.guestBotId ||
      topicDraft !== launch.topic ||
      producerBriefDraft !== launch.producerBrief ||
      guestBriefDraft !== "" ||
      episode
    ) {
      return;
    }
    orchestrationLaunchHandledTokenRef.current = launch.token;
    orchestrationLaunchStagedTokenRef.current = null;
    onOrchestrationLaunchConsumed?.(launch.token);
    void startEpisodeRef.current();
  }, [
    episode,
    guestDraftId,
    guestBriefDraft,
    onOrchestrationLaunchConsumed,
    orchestrationLaunch,
    producerBriefDraft,
    selectedShowId,
    topicDraft,
  ]);

  const skipEpisodePreRoll = (): void => {
    preRollSkipRequestedRef.current = true;
    preRollGateResolveRef.current?.();
    preRollGateResolveRef.current = null;
    releaseSignalIntroAudio();
  };

  const startBufferedWatch = (): void => {
    const resolve = watchPlaybackStartResolveRef.current;
    if (!watchPlaybackReady || !resolve) return;
    watchPlaybackStartResolveRef.current = null;
    resolve();
  };

  const cacheListenerReactionPlan = useCallback(
    (currentEpisode: BotcastEpisode, message: BotcastMessage): void => {
      const plan = botcastListenerReactionForMessage(
        currentEpisode.events,
        message.id,
      );
      if (plan) {
        listenerReactionPlanByMessageIdRef.current.set(message.id, plan);
        const listener = botsById.get(plan.listenerBotId);
        const interruptedBot = botsById.get(plan.speakerBotId);
        if (listener) {
          for (const sequencePlan of listenerReactionSequencePlansV1(plan)) {
            onPrefetchListenerReaction?.(
              sequencePlan,
              listener,
              interruptedBot
                ? botWithIdentityBeforeMessage(
                    interruptedBot,
                    currentEpisode,
                    message,
                  )
                : undefined,
            );
          }
        }
      }
      for (const beat of message.mutePerformance?.reactionBeats ?? []) {
        if (beat.kind === "visual") continue;
        const muteListener = botsById.get(beat.reactorBotId);
        if (!muteListener) continue;
        const mutePlan = signalMuteReactionPlan(
          message,
          message.mutePerformance!.durationMs,
          beat,
        );
        onPrefetchListenerReaction?.(
          mutePlan,
          muteListener,
          botsById.get(message.botId),
        );
      }
    },
    [botsById, onPrefetchListenerReaction],
  );

  const prefetchKnownWatchEpisodeVoices = useCallback(
    async (currentEpisode: BotcastEpisode): Promise<void> => {
      if (!premiumVoicePrefetchEnabled || !onPrefetchUtterance) return;
      const pending: Array<Promise<unknown>> = [];
      for (const message of currentEpisode.messages) {
        cacheListenerReactionPlan(currentEpisode, message);
        let bot = botsById.get(message.botId);
        if (bot) {
          bot = botWithIdentityBeforeMessage(bot, currentEpisode, message);
        }
        if (
          !bot ||
          bot.muted ||
          !botcastMessageIsAudibleToAudienceV1(message) ||
          botPowerResponseIsSilentV1(message.content)
        ) {
          continue;
        }
        pending.push(
          Promise.resolve(onPrefetchUtterance(message, bot)).catch(
            () => false,
          ),
        );
      }
      await Promise.all(pending);
    },
    [
      botsById,
      cacheListenerReactionPlan,
      onPrefetchUtterance,
      premiumVoicePrefetchEnabled,
    ],
  );

  const armListenerReactionTiming = useCallback(
    (
      message: BotcastMessage,
      durationMs: number,
      alignment?: Parameters<
        typeof resolveListenerReactionAtMs
      >[0]["alignment"],
    ): number | null => {
      const plan = listenerReactionPlanByMessageIdRef.current.get(message.id);
      if (!plan) return null;
      const atMs = resolveListenerReactionAtMs({
        text: message.content,
        durationMs,
        targetProgress: plan.targetProgress,
        alignment,
      });
      listenerReactionAtMsByMessageIdRef.current.set(message.id, atMs);
      return atMs;
    },
    [],
  );

  const setSignalEphemeralBotSpeaking = useCallback(
    (botId: string, speaking: boolean): void => {
      const depths = signalEphemeralSpeakingDepthByBotIdRef.current;
      const nextDepth = speaking
        ? (depths.get(botId) ?? 0) + 1
        : Math.max(0, (depths.get(botId) ?? 0) - 1);
      if (nextDepth > 0) depths.set(botId, nextDepth);
      else depths.delete(botId);
      setSignalEphemeralSpeakingBotIds(new Set(depths.keys()));
    },
    [],
  );

  const createSignalReactionVoiceLifecycle = useCallback(
    (
      botId: string,
      sourceMessageId: string,
      channel: "reaction" | "crosstalk",
      text: string,
      gain = 1,
      onAudibleStart?: () => void,
    ): VoicePlaybackLifecycle => {
      let started = false;
      const clearSpeech = (): void => {
        if (!started) return;
        started = false;
        signalEphemeralSpeechPlaybackClockByBotIdRef.current.delete(botId);
        setSignalEphemeralBotSpeaking(botId, false);
        setSignalEphemeralSpeechByBotId((current) => {
          const active = current.get(botId);
          if (
            active?.sourceMessageId !== sourceMessageId ||
            active.channel !== channel
          ) {
            return current;
          }
          const next = new Map(current);
          next.delete(botId);
          return next;
        });
        const sourceId = signalCaptureSourceIdRef.current;
        if (sourceId) {
          markReplayDirectionEvent({
            sourceId,
            kind: "speech",
            sourceMessageId,
            payload: {
              speakerId: botId,
              audible: true,
              active: false,
              channel,
              gain,
            },
          });
        }
      };
      return {
        onStart: (durationMs, alignment) => {
          if (started) return;
          started = true;
          onAudibleStart?.();
          setSignalEphemeralBotSpeaking(botId, true);
          signalEphemeralSpeechPlaybackClockByBotIdRef.current.set(botId, {
            messageId: sourceMessageId,
            elapsedMs: 0,
            observedAtMs: performance.now(),
          });
          setSignalEphemeralSpeechByBotId((current) => {
            const next = new Map(current);
            next.set(botId, {
              sourceMessageId,
              channel,
              text,
              elapsedMs: 0,
              durationMs: Math.max(1, durationMs ?? 1),
              alignment: alignment ?? null,
            });
            return next;
          });
          const sourceId = signalCaptureSourceIdRef.current;
          if (sourceId) {
            markReplayDirectionEvent({
              sourceId,
              kind: "speech",
              sourceMessageId,
              payload: {
                speakerId: botId,
                audible: true,
                active: true,
                channel,
                gain,
              },
            });
          }
        },
        onProgress: (elapsedMs, durationMs) => {
          if (!started) return;
          signalEphemeralSpeechPlaybackClockByBotIdRef.current.set(botId, {
            messageId: sourceMessageId,
            elapsedMs: Math.min(elapsedMs, Math.max(1, durationMs)),
            observedAtMs: performance.now(),
          });
        },
        onEnd: clearSpeech,
        onCancel: clearSpeech,
      };
    },
    [setSignalEphemeralBotSpeaking],
  );

  const fireLiveListenerReaction = useCallback(
    (message: BotcastMessage, elapsedMs: number, durationMs: number): void => {
      const plan = listenerReactionPlanByMessageIdRef.current.get(message.id);
      if (!plan) return;
      const atMs =
        listenerReactionAtMsByMessageIdRef.current.get(message.id) ??
        armListenerReactionTiming(message, durationMs);
      if (atMs === null) return;
      for (const [index, sequencePlan] of
        listenerReactionSequencePlansV1(plan).entries()) {
        const sequenceAtMs = index === 0
          ? atMs
          : Math.round(durationMs * sequencePlan.targetProgress);
        const triggerAtMs = Math.max(
          0,
          sequenceAtMs - SIGNAL_LISTENER_REACTION_SCHEDULE_LEAD_MS,
        );
        if (elapsedMs < triggerAtMs) continue;
        const fireKey = `${message.id}:${index}`;
        if (liveListenerReactionFiredRef.current.has(fireKey)) continue;
        liveListenerReactionFiredRef.current.add(fireKey);
        if (!listenerReactionHasCrosstalkAudio(sequencePlan)) continue;
        const listener = botsById.get(sequencePlan.listenerBotId);
        if (!listener) continue;
        const interruptedBot = botsById.get(plan.speakerBotId);
        const listenerRole =
          selectedShow?.hostBotId === listener.id ? "host" : "guest";
        const retortDelayMs = signalInterruptedSpeakerRetortDelayMs(
          sequencePlan,
          elapsedMs,
          durationMs,
        );
        const playback = Promise.resolve(
          onListenerReaction?.(
            sequencePlan,
            listener,
            signalStudioVoicePan(selectedShow?.studioLayout, listenerRole),
            retortDelayMs,
            {
              listener: createSignalReactionVoiceLifecycle(
                sequencePlan.listenerBotId,
                `${sequencePlan.messageId}:sequence:${index}`,
                "reaction",
                listenerReactionSpokenTextV1(sequencePlan) ?? "",
                signalListenerReactionVoiceGain(sequencePlan),
                () => scheduleSignalOrganicPrimaryPause(sequencePlan),
              ),
              interrupted: createSignalReactionVoiceLifecycle(
                sequencePlan.speakerBotId,
                `${sequencePlan.messageId}:sequence:${index}`,
                "crosstalk",
                listenerReactionInterruptedSpeakerTextV1(sequencePlan) ?? "",
              ),
              listenerStartAtPerformanceMs:
                performance.now() + Math.max(0, sequenceAtMs - elapsedMs),
              ...(interruptedBot && episode
                ? {
                    interruptedBot: botWithIdentityBeforeMessage(
                      interruptedBot,
                      episode,
                      message,
                    ),
                  }
                : {}),
              ...(message.directionalIrritationDelivery
                ? {
                    directionalIrritationDelivery:
                      message.directionalIrritationDelivery,
                  }
                : {}),
            },
          ),
        )
          .then((played) => played ?? false)
          .catch(() => false)
          .finally(() => {
            if (
              liveListenerReactionPlaybackByMessageIdRef.current.get(
                message.id,
              ) === playback
            ) {
              liveListenerReactionPlaybackByMessageIdRef.current.delete(
                message.id,
              );
            }
          });
        liveListenerReactionPlaybackByMessageIdRef.current.set(
          message.id,
          playback,
        );
      }
    },
    [
      armListenerReactionTiming,
      botsById,
      createSignalReactionVoiceLifecycle,
      episode,
      onListenerReaction,
      selectedShow,
    ],
  );

  const fireLiveMuteReactions = useCallback(
    (message: BotcastMessage, elapsedMs: number): void => {
      const performanceEnvelope = message.mutePerformance;
      if (!performanceEnvelope) return;
      for (const [index, beat] of performanceEnvelope.reactionBeats.entries()) {
        const triggerAtMs = Math.max(
          0,
          beat.atMs - SIGNAL_LISTENER_REACTION_SCHEDULE_LEAD_MS,
        );
        if (elapsedMs < triggerAtMs) continue;
        const key = `${message.id}:${index}`;
        if (liveMuteReactionFiredRef.current.has(key)) continue;
        liveMuteReactionFiredRef.current.add(key);
        const plan = signalMuteReactionPlan(
          message,
          performanceEnvelope.durationMs,
          beat,
        );
        if (!listenerReactionHasCrosstalkAudio(plan)) continue;
        const listener = botsById.get(plan.listenerBotId);
        if (!listener) continue;
        const listenerRole =
          selectedShow?.hostBotId === listener.id ? "host" : "guest";
        void Promise.resolve(
          onListenerReaction?.(
            plan,
            listener,
            signalStudioVoicePan(selectedShow?.studioLayout, listenerRole),
            0,
            {
              listener: createSignalReactionVoiceLifecycle(
                plan.listenerBotId,
                `${plan.messageId}:mute:${index}`,
                beat.kind === "interrupt" ? "crosstalk" : "reaction",
                listenerReactionSpokenTextV1(plan) ?? "",
                signalListenerReactionVoiceGain(plan),
              ),
              interrupted: createSignalReactionVoiceLifecycle(
                plan.speakerBotId,
                `${plan.messageId}:mute:${index}`,
                "crosstalk",
                "",
              ),
              listenerStartAtPerformanceMs:
                performance.now() + Math.max(0, beat.atMs - elapsedMs),
              ...(botsById.get(plan.speakerBotId) && episode
                ? {
                    interruptedBot: botWithIdentityBeforeMessage(
                      botsById.get(plan.speakerBotId)!,
                      episode,
                      message,
                    ),
                  }
                : {}),
            },
          ),
        ).catch(() => false);
      }
    },
    [
      botsById,
      createSignalReactionVoiceLifecycle,
      episode,
      onListenerReaction,
      selectedShow,
    ],
  );

  const fireReplayListenerReaction = useCallback(
    (message: BotcastMessage, elapsedMs: number, durationMs: number): void => {
      const plan = listenerReactionPlanByMessageIdRef.current.get(message.id);
      if (!plan) return;
      const atMs =
        listenerReactionAtMsByMessageIdRef.current.get(message.id) ??
        armListenerReactionTiming(message, durationMs);
      if (atMs === null) return;
      for (const [index, sequencePlan] of
        listenerReactionSequencePlansV1(plan).entries()) {
        const sequenceAtMs = index === 0
          ? atMs
          : Math.round(durationMs * sequencePlan.targetProgress);
        const fireKey = `${message.id}:${index}`;
        if (elapsedMs < sequenceAtMs) {
          replayListenerReactionFiredRef.current.delete(fireKey);
          continue;
        }
        if (replayListenerReactionFiredRef.current.has(fireKey)) continue;
        replayListenerReactionFiredRef.current.add(fireKey);
        if (!listenerReactionHasCrosstalkAudio(sequencePlan)) continue;
        const listener = botsById.get(sequencePlan.listenerBotId);
        if (!listener) continue;
        const listenerRole =
          selectedShow?.hostBotId === listener.id ? "host" : "guest";
        void Promise.resolve(
          onListenerReaction?.(
            sequencePlan,
            listener,
            signalStudioVoicePan(selectedShow?.studioLayout, listenerRole),
            signalInterruptedSpeakerRetortDelayMs(
              sequencePlan,
              elapsedMs,
              durationMs,
            ),
            {
              listener: createSignalReactionVoiceLifecycle(
                sequencePlan.listenerBotId,
                `${sequencePlan.messageId}:sequence:${index}`,
                "reaction",
                listenerReactionSpokenTextV1(sequencePlan) ?? "",
                signalListenerReactionVoiceGain(sequencePlan),
                () => scheduleSignalOrganicPrimaryPause(sequencePlan),
              ),
              interrupted: createSignalReactionVoiceLifecycle(
                sequencePlan.speakerBotId,
                `${sequencePlan.messageId}:sequence:${index}`,
                "crosstalk",
                listenerReactionInterruptedSpeakerTextV1(sequencePlan) ?? "",
              ),
              ...(botsById.get(plan.speakerBotId) && episode
                ? {
                    interruptedBot: botWithIdentityBeforeMessage(
                      botsById.get(plan.speakerBotId)!,
                      episode,
                      message,
                    ),
                  }
                : {}),
              ...(message.directionalIrritationDelivery
                ? {
                    directionalIrritationDelivery:
                      message.directionalIrritationDelivery,
                  }
                : {}),
            },
          ),
        );
      }
    },
    [
      armListenerReactionTiming,
      botsById,
      createSignalReactionVoiceLifecycle,
      episode,
      onListenerReaction,
      selectedShow,
    ],
  );

  const fireReplayMuteReactions = useCallback(
    (message: BotcastMessage, elapsedMs: number): void => {
      const performanceEnvelope = message.mutePerformance;
      if (!performanceEnvelope) return;
      for (const [index, beat] of performanceEnvelope.reactionBeats.entries()) {
        const key = `${message.id}:${index}`;
        if (elapsedMs < beat.atMs) {
          replayMuteReactionFiredRef.current.delete(key);
          continue;
        }
        if (replayMuteReactionFiredRef.current.has(key)) continue;
        replayMuteReactionFiredRef.current.add(key);
        const plan = signalMuteReactionPlan(
          message,
          performanceEnvelope.durationMs,
          beat,
        );
        if (!listenerReactionHasCrosstalkAudio(plan)) continue;
        const listener = botsById.get(plan.listenerBotId);
        if (!listener) continue;
        const listenerRole =
          selectedShow?.hostBotId === listener.id ? "host" : "guest";
        void Promise.resolve(
          onListenerReaction?.(
            plan,
            listener,
            signalStudioVoicePan(selectedShow?.studioLayout, listenerRole),
            0,
            {
              listener: createSignalReactionVoiceLifecycle(
                plan.listenerBotId,
                `${plan.messageId}:mute:${index}`,
                beat.kind === "interrupt" ? "crosstalk" : "reaction",
                listenerReactionSpokenTextV1(plan) ?? "",
                signalListenerReactionVoiceGain(plan),
              ),
              interrupted: createSignalReactionVoiceLifecycle(
                plan.speakerBotId,
                `${plan.messageId}:mute:${index}`,
                "crosstalk",
                "",
              ),
            },
          ),
        ).catch(() => false);
      }
    },
    [
      botsById,
      createSignalReactionVoiceLifecycle,
      onListenerReaction,
      selectedShow,
    ],
  );

  const revealUtteranceWithoutAudio = useCallback(
    async (
      message: BotcastMessage,
      onProgress?: (elapsedMs: number, durationMs: number) => void,
    ): Promise<void> => {
      const messageId = message.id;
      const presentationContent = botCrosstalkPrimarySpeakerContent(
        message.content,
        listenerReactionPlanByMessageIdRef.current.get(message.id),
      );
      const presentationMessage = presentationContent === message.content
        ? message
        : { ...message, content: presentationContent };
      const socialSilence = socialSilenceMessageIsMarkedV1({
        content: message.content,
        marker: message.socialSilence,
        mode: "signal",
      });
      const durationMs = socialSilence
        ? message.socialSilence!.holdMs
        : message.mutePerformance
          ? Math.max(
              BOTCAST_DIRECTOR_MIN_SHOT_MS,
              botcastSignalStandardCadenceDurationMs(
                message.content,
                message.socialSilence,
                message.mutePerformance,
              ),
            )
          : signalSilentCaptionRevealDurationMs(
              message.stageActionText ?? presentationContent,
              { stageAction: Boolean(message.stageActionText) },
            );
      armListenerReactionTiming(message, durationMs);
      startTransition(() => {
        setLiveSpeech({
          messageId,
          message: presentationMessage,
          audible: false,
          reveal: startBotcastSpeechReveal({
            text: presentationContent,
            durationMs,
          }),
        });
      });
      const startedAt = performance.now();
      signalLiveSpeechPlaybackClockRef.current = {
        messageId,
        elapsedMs: 0,
        observedAtMs: startedAt,
      };
      while (activeSpeechMessageIdRef.current === messageId) {
        const elapsedMs = Math.min(durationMs, performance.now() - startedAt);
        signalLiveSpeechPlaybackClockRef.current = {
          messageId,
          elapsedMs,
          observedAtMs: performance.now(),
        };
        onProgress?.(elapsedMs, durationMs);
        fireLiveListenerReaction(message, elapsedMs, durationMs);
        fireLiveMuteReactions(message, elapsedMs);
        if (elapsedMs >= durationMs) break;
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, SIGNAL_LIVE_SPEECH_RENDER_INTERVAL_MS),
        );
      }
      if (activeSpeechMessageIdRef.current !== messageId) {
        if (signalLiveSpeechPlaybackClockRef.current?.messageId === messageId) {
          signalLiveSpeechPlaybackClockRef.current = null;
        }
        return;
      }
      signalLiveSpeechPlaybackClockRef.current = null;
      startTransition(() => {
        setLiveSpeech((current) =>
          current?.messageId === messageId
            ? { ...current, reveal: finishBotcastSpeechReveal(current.reveal) }
            : current,
        );
      });
    },
    [
      armListenerReactionTiming,
      fireLiveListenerReaction,
      fireLiveMuteReactions,
    ],
  );

  const prepareEpisodeMessage = useCallback(
    (message: BotcastMessage, currentEpisode: BotcastEpisode): void => {
      activeSpeechMessageIdRef.current = message.id;
      cacheListenerReactionPlan(currentEpisode, message);
      let bot = botsById.get(message.botId);
      if (bot) {
        bot = botWithIdentityBeforeMessage(bot, currentEpisode, message);
      }
      if (
        bot &&
        !bot.muted &&
        botcastMessageIsAudibleToAudienceV1(message) &&
        !botPowerResponseIsSilentV1(message.content)
      ) {
        const organicVoicePerformance = botcastVoicePerformanceForMessageV2(
          currentEpisode.events,
          message.id,
        );
        onPrefetchUtterance?.(
          organicVoicePerformance
            ? { ...message, organicVoicePerformance }
            : message,
          bot,
        );
      }
      startTransition(() => {
        setLiveSpeech({
          messageId: message.id,
          message,
          audible: false,
          reveal: prepareBotcastSpeechReveal(message.content),
        });
        setSpeakingMessageId(message.id);
      });
    },
    [botsById, cacheListenerReactionPlan, onPrefetchUtterance],
  );

  const playPreparedEpisodeMessage = useCallback(
    async (
      message: BotcastMessage,
      currentEpisode: BotcastEpisode,
      controller: AbortController,
      runId: number,
      prepareFollowingTurn = true,
      onPlaybackStart?: () => void | Promise<void>,
      options?: {
        voiceChannel?: "primary" | "handoff";
        deferPresentationUntilPlaybackStart?: boolean;
        onPresenceStart?: () => void;
        onHandoffStart?: () => void;
      },
    ): Promise<void> => {
      const bot =
        currentEpisode.guestKind === "producer" &&
        message.speakerRole === "guest" &&
        message.botId === BOTCAST_PRODUCER_GUEST_ID
          ? signalProducerGuestBotSummary(
              currentEpisode,
              selectedShow?.accentColor,
            )
          : botsById.get(message.botId);
      const primarySpokenContent = botCrosstalkPrimarySpeakerContent(
        message.content,
        listenerReactionPlanByMessageIdRef.current.get(message.id),
      );
      const organicVoicePerformance = botcastVoicePerformanceForMessageV2(
        currentEpisode.events,
        message.id,
      );
      const playbackMessage = {
        ...message,
        ...(primarySpokenContent === message.content
          ? {}
          : { content: primarySpokenContent }),
        ...(organicVoicePerformance ? { organicVoicePerformance } : {}),
      };
      let playbackStarted = false;
      let playbackStartNotified = false;
      let voicePreparationTimer: number | null = null;
      let voiceCompletionTimer: number | null = null;
      let settleVoicePlayback: ((value: boolean) => void) | null = null;
      let voiceAttemptActive = true;
      let lastVoiceProgressElapsedMs = 0;
      let followingTurnPrepared = false;
      const presentationDeferred =
        options?.deferPresentationUntilPlaybackStart === true;
      const playbackStillOwned = (): boolean =>
        signalLiveSpeechPlaybackIsOwned({
          messageId: message.id,
          activeSpeechMessageId: activeSpeechMessageIdRef.current,
          operationCurrent: episodeOperationIsCurrent(controller, runId),
          audibleHandoffMessageId:
            audibleHandoffOutgoingMessageIdRef.current,
          voiceChannel: options?.voiceChannel ?? "primary",
        });
      const voicePlaybackEligible = Boolean(
        bot &&
          !bot.muted &&
          botcastMessageIsAudibleToAudienceV1(message) &&
          !botPowerResponseIsSilentV1(message.content) &&
          onUtterance,
      );
      const configuredVoicePlaybackAttempted =
        voicePlaybackEligible && recordingVoiceSelection.voiceMode !== "mute";
      const producerGuestActionCueText =
        signalFancyActionCueText(message.stageActionText) ?? message.content;
      const producerGuestActionSfxPlan =
        currentEpisode.guestKind === "producer" &&
        message.speakerRole === "guest" &&
        message.botId === BOTCAST_PRODUCER_GUEST_ID
          ? buildBundledActionSfxPlan(producerGuestActionCueText)
          : null;
      let producerGuestActionSfxPlayed = false;
      const studioIncident = botcastStudioIncidentForMessageV1(
        currentEpisode.events,
        message.id,
      );
      let studioIncidentPlayed = false;
      const studioIncidentDialogueFired = new Set<number>();
      const studioIncidentDialoguePlaybacks: Promise<boolean>[] = [];
      const playStudioIncidentAt = (
        elapsedMs: number,
        durationMs: number,
      ): void => {
        if (!studioIncident) return;
        const progress = elapsedMs / Math.max(1, durationMs);
        if (!studioIncidentPlayed && progress >= studioIncident.startProgress) {
          studioIncidentPlayed = true;
          playSignalStudioIncidentAudio(studioIncident, { durationMs, elapsedMs });
        }
        if (!onStudioIncidentDialogue) return;
        for (const [beatIndex, beat] of studioIncident.beats.entries()) {
          if (
            beat.kind !== "dialogue" ||
            progress < beat.atProgress ||
            studioIncidentDialogueFired.has(beatIndex)
          ) continue;
          studioIncidentDialogueFired.add(beatIndex);
          const dialogueBot = botsById.get(beat.actorBotId);
          if (!dialogueBot) continue;
          const playback = Promise.resolve(
            onStudioIncidentDialogue(
              { incidentId: studioIncident.incidentId, beatIndex, beat },
              botWithIdentityBeforeMessage(
                dialogueBot,
                currentEpisode,
                message,
              ),
              createSignalReactionVoiceLifecycle(
                beat.actorBotId,
                `${message.id}:studio:${beatIndex}`,
                "reaction",
                beat.text,
              ),
              signalStudioVoicePan(
                selectedShow?.studioLayout,
                beat.speakerRole,
              ),
            ),
          ).then((played) => played ?? false).catch(() => false);
          studioIncidentDialoguePlaybacks.push(playback);
        }
      };
      let producerGuestActionSfxResolvedCueAtMs: number | null = null;
      const playProducerGuestActionSfxAt = (
        elapsedMs: number,
        durationMs: number,
        alignment?: VoicePlaybackCharacterAlignment | null,
      ): void => {
        if (producerGuestActionSfxPlayed || !producerGuestActionSfxPlan) return;
        const cueAtMs =
          alignment || producerGuestActionSfxResolvedCueAtMs === null
            ? bundledActionSfxCueAtMs(
                producerGuestActionCueText,
                durationMs,
                alignment,
              )
            : producerGuestActionSfxResolvedCueAtMs;
        producerGuestActionSfxResolvedCueAtMs = cueAtMs;
        if (cueAtMs === null || elapsedMs < cueAtMs) return;
        producerGuestActionSfxPlayed = true;
        onProducerGuestActionSfx?.(message);
      };
      const prepareNextTurn = (): void => {
        if (!prepareFollowingTurn || followingTurnPrepared) return;
        if (!episodeOperationIsCurrent(controller, runId)) return;
        followingTurnPrepared = true;
        prepareGuestResponseRef.current(currentEpisode, message);
      };
      const notifyPlaybackStart = (): void => {
        if (playbackStartNotified) return;
        playbackStartNotified = true;
        if (presentationDeferred) {
          options?.onHandoffStart?.();
          prepareEpisodeMessage(message, currentEpisode);
        }
        if (producerGuestActionSfxPlan?.revealAtDisplayLength === 0) {
          playProducerGuestActionSfxAt(0, 1);
        }
        // Close the books on the wait this turn cost before preparing the next
        // one. The hold is written into the episode's event stream, so a
        // preparation snapshot taken first would claim the same sequence and
        // lose the whole head start when it tried to commit.
        void Promise.resolve(onPlaybackStart?.()).then(
          prepareNextTurn,
          prepareNextTurn,
        );
      };
      let armedVoiceCompletionDurationMs = 0;
      const armVoiceCompletionWatchdog = (
        durationMs: number,
        elapsedMs = 0,
        options?: { heartbeat?: boolean },
      ): void => {
        // Heartbeat mode: progress keeps pushing a stall deadline so long
        // monologues (clause pauses, slow TTS) are never cut on the initial
        // text estimate. Estimate mode is only used at onStart.
        if (voiceCompletionTimer !== null) {
          window.clearTimeout(voiceCompletionTimer);
        }
        const delayMs = options?.heartbeat
          ? SIGNAL_VOICE_COMPLETION_GRACE_MS
          : Math.max(0, Math.round(durationMs) - Math.round(elapsedMs)) +
            SIGNAL_VOICE_COMPLETION_GRACE_MS;
        if (!options?.heartbeat) {
          armedVoiceCompletionDurationMs = Math.max(
            armedVoiceCompletionDurationMs,
            Math.max(1, Math.round(durationMs)),
          );
        }
        voiceCompletionTimer = window.setTimeout(
          () => {
            voiceAttemptActive = false;
            if (playbackStarted) {
              void request(
                `/api/botcast/episodes/${encodeURIComponent(currentEpisode.id)}/voice-playback-recovery`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    messageId: message.id,
                    reason: "progress_stalled",
                    elapsedMs: lastVoiceProgressElapsedMs,
                    durationMs: armedVoiceCompletionDurationMs,
                  }),
                },
              ).catch(() => undefined);
            }
            onStopUtterance?.();
            settleVoicePlayback?.(false);
          },
          delayMs,
        );
      };
      const lifecycle: VoicePlaybackLifecycle = {
        performancePlan: organicVoicePerformance,
        onPerformanceCaption: (caption, active) => {
          startTransition(() => {
            setSignalPerformanceCaption(
              active && caption
                ? {
                    messageId: message.id,
                    botId: message.botId,
                    text: caption,
                  }
                : null,
            );
          });
        },
        onPresenceStart: () => {
          if (
            !voiceAttemptActive ||
            (!presentationDeferred &&
              activeSpeechMessageIdRef.current !== message.id) ||
            !playbackStillOwned()
          ) {
            return;
          }
          options?.onPresenceStart?.();
          const animateCameraPush =
            liveCameraModeRef.current === "auto" &&
            signalCameraWaitingForPresenceRef.current;
          signalCameraWaitingForPresenceRef.current = false;
          if (signalCameraPushTimeoutRef.current !== null) {
            window.clearTimeout(signalCameraPushTimeoutRef.current);
            signalCameraPushTimeoutRef.current = null;
          }
          if (animateCameraPush) {
            // Keep the semantic push alive through its full CSS duration. The
            // speech callback may follow the breath before a 900ms move ends.
            startTransition(() => setSignalCameraPushMessageId(message.id));
            signalCameraPushTimeoutRef.current = window.setTimeout(() => {
              signalCameraPushTimeoutRef.current = null;
              startTransition(() => {
                setSignalCameraPushMessageId((current) =>
                  current === message.id ? null : current,
                );
              });
            }, 900);
          }
          // End thinking as a visual transition so native producer input can
          // preempt it. The authoritative speech refs are already current.
          startTransition(() =>
            setSignalPreSpeechPresenceMessageId(message.id),
          );
          if (signalAirTimeFreezeStartedAtRef.current !== null) {
            signalAirTimeFreezeAccumulatedMsRef.current += Math.max(
              0,
              Date.now() - signalAirTimeFreezeStartedAtRef.current,
            );
            signalAirTimeFreezeStartedAtRef.current = null;
          }
          if (signalThinkingCompactHoldActiveRef.current) {
            signalThinkingCompactHoldActiveRef.current = false;
            const sourceId = signalCaptureSourceIdRef.current;
            if (sourceId) setReplayAudioMasterCompactHold(sourceId, false);
          }
        },
        onStart: (durationMs, alignment) => {
          if (
            !voiceAttemptActive ||
            (!presentationDeferred &&
              activeSpeechMessageIdRef.current !== message.id) ||
            !playbackStillOwned()
          )
            return;
          if (voicePreparationTimer !== null) {
            window.clearTimeout(voicePreparationTimer);
            voicePreparationTimer = null;
          }
          playbackStarted = true;
          if (presentationDeferred) {
            // Resolve the outgoing audience-heard prefix before the incoming
            // handoff takes ownership of the one live playback clock.
            notifyPlaybackStart();
          }
          const playbackObservedAtMs = performance.now();
          signalLiveSpeechPlaybackClockRef.current = {
            messageId: message.id,
            elapsedMs: 0,
            observedAtMs: playbackObservedAtMs,
          };
          startTransition(() => {
            setSignalPreSpeechPresenceMessageId((current) =>
              current === message.id ? null : current,
            );
          });
          if (!presentationDeferred) notifyPlaybackStart();
          clearLiveCameraPostSpeechHold();
          const resolvedDurationMs =
            durationMs ??
            signalVoiceCompletionFallbackDurationMs(
              primarySpokenContent || message.content,
            );
          playProducerGuestActionSfxAt(0, resolvedDurationMs, alignment);
          armVoiceCompletionWatchdog(resolvedDurationMs);
          armListenerReactionTiming(message, resolvedDurationMs, alignment);
          startTransition(() => {
            setLiveSpeech({
              messageId: message.id,
              message: playbackMessage,
              audible: true,
              reveal: startBotcastSpeechReveal({
                text: primarySpokenContent,
                durationMs: resolvedDurationMs,
                alignment,
                // Chunked speech has no full-clip alignment. Start its segment
                // clock immediately; the avatar uses deterministic line cadence
                // until the first source-linked segment timing arrives.
                segmentClock: !alignment,
                segmentTimings: alignment ? null : [],
              }),
            });
          });
        },
        onSegmentTiming: (timing) => {
          if (
            !voiceAttemptActive ||
            activeSpeechMessageIdRef.current !== message.id ||
            !playbackStillOwned()
          ) {
            return;
          }
          startTransition(() => {
            setLiveSpeech((current) => {
              if (!current || current.messageId !== message.id) return current;
              return {
                ...current,
                reveal: applyBotcastSpeechRevealSegmentTiming(
                  current.reveal,
                  timing,
                  Math.max(current.reveal.durationMs, timing.endMs),
                ),
              };
            });
          });
        },
        onProgress: (elapsedMs, durationMs) => {
          if (
            !voiceAttemptActive ||
            activeSpeechMessageIdRef.current !== message.id ||
            !playbackStillOwned()
          )
            return;
          if (
            signalVoiceProgressHeartbeatAdvanced({
              previousElapsedMs: lastVoiceProgressElapsedMs,
              elapsedMs,
            })
          ) {
            lastVoiceProgressElapsedMs = Math.max(0, elapsedMs);
            armVoiceCompletionWatchdog(durationMs, elapsedMs, {
              heartbeat: true,
            });
          }
          if (
            elapsedMs / Math.max(1, durationMs) >=
            SIGNAL_HOST_CUE_REDIRECT_LATEST_PROGRESS
          ) {
            prepareNextTurn();
          }
          fireLiveListenerReaction(message, elapsedMs, durationMs);
          playStudioIncidentAt(elapsedMs, durationMs);
          playProducerGuestActionSfxAt(elapsedMs, durationMs);
          const renderNow = performance.now();
          signalLiveSpeechPlaybackClockRef.current = {
            messageId: message.id,
            elapsedMs,
            observedAtMs: renderNow,
          };
          // The stage-local visual clock projects captions and mouth shapes
          // from this ref. Do not reconcile the full Signal experience for
          // every playback heartbeat.
        },
        onEnd: () => {
          if (
            !voiceAttemptActive ||
            activeSpeechMessageIdRef.current !== message.id ||
            !playbackStillOwned()
          )
            return;
          if (
            signalLiveSpeechPlaybackClockRef.current?.messageId === message.id
          ) {
            signalLiveSpeechPlaybackClockRef.current = null;
          }
          prepareNextTurn();
          startTransition(() => {
            setSignalPreSpeechPresenceMessageId((current) =>
              current === message.id ? null : current,
            );
            setLiveSpeech((current) =>
              current?.messageId === message.id
                ? {
                    ...current,
                    reveal: finishBotcastSpeechReveal(current.reveal),
                  }
                : current,
            );
          });
          playProducerGuestActionSfxAt(Number.POSITIVE_INFINITY, 1);
          settleVoicePlayback?.(true);
        },
        onCancel: () => {
          if (
            signalLiveSpeechPlaybackClockRef.current?.messageId === message.id
          ) {
            signalLiveSpeechPlaybackClockRef.current = null;
          }
          settleVoicePlayback?.(false);
        },
      };
      const played =
        voicePlaybackEligible && bot && onUtterance
        ? await new Promise<boolean>((resolve) => {
            let settled = false;
            const settle = (value: boolean): void => {
              if (settled) return;
              settled = true;
              voiceAttemptActive = false;
              if (voicePreparationTimer !== null) {
                window.clearTimeout(voicePreparationTimer);
                voicePreparationTimer = null;
              }
              if (voiceCompletionTimer !== null) {
                window.clearTimeout(voiceCompletionTimer);
                voiceCompletionTimer = null;
              }
              settleVoicePlayback = null;
              resolve(value);
            };
            settleVoicePlayback = settle;
              voicePreparationTimer = window.setTimeout(
                () => {
                  voiceAttemptActive = false;
                  // A failed incoming handoff must not tear down the outgoing
                  // speaker before the readable fallback actually takes the
                  // floor. `notifyPlaybackStart` performs that release below.
                  if (!presentationDeferred) onStopUtterance?.();
                  settle(false);
                },
                signalVoiceStartTimeoutMs({
                  textLength: Math.max(
                    primarySpokenContent.length,
                    message.voicePerformanceText?.length ?? 0,
                  ),
                  voiceMode: recordingVoiceSelection.voiceMode,
                  englishVoiceEngine:
                    recordingVoiceSelection.englishVoiceEngine,
                }),
              );
            void Promise.resolve(
              onUtterance(
                playbackMessage,
                botWithIdentityBeforeMessage(bot, currentEpisode, message),
                lifecycle,
                botcastVoiceLevelForBot(
                  selectedShow?.voiceLevelsByBotId,
                  bot.id,
                ),
                signalStudioVoicePan(
                  selectedShow?.studioLayout,
                  message.speakerRole,
                ),
                options?.voiceChannel ?? "primary",
              ),
            ).then(settle, () => settle(false));
          })
        : false;
      // Crosstalk is part of this turn's audible performance. Keep the source
      // message and its camera direction active until the reaction/retort ends.
      const pendingListenerReaction =
        liveListenerReactionPlaybackByMessageIdRef.current.get(message.id);
      if (pendingListenerReaction) await pendingListenerReaction;
      if (studioIncidentDialoguePlaybacks.length > 0) {
        await Promise.all(studioIncidentDialoguePlaybacks);
      }
      if (
        activeSpeechMessageIdRef.current !== message.id ||
        !playbackStillOwned()
      )
        return;
      startTransition(() => {
        setSignalPreSpeechPresenceMessageId((current) =>
          current === message.id ? null : current,
        );
      });
      if (!played && !playbackStarted) {
        if (configuredVoicePlaybackAttempted) {
          setNotice(
            `${bot?.name ?? "The speaker"}’s voice didn’t start. Continuing with readable captions.`,
          );
        }
        notifyPlaybackStart();
        await revealUtteranceWithoutAudio(message, (elapsedMs, durationMs) => {
          playStudioIncidentAt(elapsedMs, durationMs);
          playProducerGuestActionSfxAt(elapsedMs, durationMs);
          if (
            elapsedMs / Math.max(1, durationMs) >=
            SIGNAL_HOST_CUE_REDIRECT_LATEST_PROGRESS
          ) {
            prepareNextTurn();
          }
        });
      } else {
        startTransition(() => {
          setLiveSpeech((current) =>
            current?.messageId === message.id
              ? { ...current, reveal: finishBotcastSpeechReveal(current.reveal) }
              : current,
          );
        });
      }
      if (activeSpeechMessageIdRef.current === message.id) {
        prepareNextTurn();
        const departureRole = signalDepartureRoleAfterPresentedMessage({
          episode: currentEpisode,
          message,
        });
        if (departureRole) {
          const captureKey = `${currentEpisode.id}:${departureRole}:${message.id}`;
          const sourceId = signalCaptureSourceIdRef.current;
          if (
            sourceId === currentEpisode.id &&
            !signalCapturedDepartureKeysRef.current.has(captureKey)
          ) {
            signalCapturedDepartureKeysRef.current.add(captureKey);
            const departureEvent = currentEpisode.events.find(
              (event) =>
                event.kind === "departure" &&
                botcastDepartureSpeakerRole(event) === departureRole,
            );
            markReplayDirectionEvent({
              sourceId,
              kind: "departure",
              sourceMessageId: message.id,
              payload: {
                ...(departureEvent?.payload ?? {}),
                botId: message.botId,
                speakerRole: departureRole,
              },
            });
          }
          setSignalPresentedDepartures((current) => ({
            episodeId: currentEpisode.id,
            host:
              departureRole === "host" ||
              (current.episodeId === currentEpisode.id && current.host),
            guest:
              departureRole === "guest" ||
              (current.episodeId === currentEpisode.id && current.guest),
          }));
        }
        if (
          !socialSilenceMessageIsMarkedV1({
            content: message.content,
            marker: message.socialSilence,
            mode: "signal",
          })
        ) {
          holdLiveCameraAfterSpeech(message.speakerRole);
        }
        activeSpeechMessageIdRef.current = null;
        startTransition(() => {
          setSpeakingMessageId(null);
          setLiveSpeech(null);
        });
      }
    },
    [
      botsById,
      armListenerReactionTiming,
      clearLiveCameraPostSpeechHold,
      createSignalReactionVoiceLifecycle,
      episodeOperationIsCurrent,
      fireLiveListenerReaction,
      holdLiveCameraAfterSpeech,
      onStopUtterance,
      onProducerGuestActionSfx,
      onStudioIncidentDialogue,
      onUtterance,
      prepareEpisodeMessage,
      recordingVoiceSelection.englishVoiceEngine,
      recordingVoiceSelection.voiceMode,
      revealUtteranceWithoutAudio,
      selectedShow,
    ],
  );
  prepareEpisodeMessageRef.current = prepareEpisodeMessage;
  playPreparedEpisodeMessageRef.current = playPreparedEpisodeMessage;

  const prepareGuestResponse = useCallback(
    (currentEpisode: BotcastEpisode, currentMessage: BotcastMessage): void => {
      discardPreparedAdvance("A newer Signal preparation superseded this one.");
      // A speculative local turn can make Ollama compete with voice playback,
      // mouth animation, and native producer input for the same machine. Local
      // episodes advance after playback instead; deterministic listener beats
      // and foley keep that handoff alive without risking a dropped frame.
      if (
        currentEpisode.status === "completed" ||
        currentEpisode.guestKind === "producer" ||
        currentEpisode.provider === "local" ||
        (() => {
          const imageContext = botcastLatestImageContextV1(
            currentEpisode.events,
          );
          return Boolean(imageContext && imageContext.phase !== "dismissed");
        })()
      )
        return;
      const controller = new AbortController();
      const prepared: PreparedBotcastAdvance = {
        episodeId: currentEpisode.id,
        afterMessageId: currentMessage.id,
        controller,
        preparationId: null,
        prefetchedMessageId: null,
        settled: false,
        result: Promise.resolve({
          ok: false as const,
          error: new Error("Not started"),
        }),
      };
      prepared.result = request<{ preparation: PreparedTurnV1 }>(
          `/api/botcast/episodes/${encodeURIComponent(currentEpisode.id)}/turn-preparations`,
          {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({ theme }),
          },
        )
        .then(async ({ preparation }) => {
          prepared.preparationId = preparation.id;
          return waitForSignalTurnPreparation({
            request,
            initial: preparation,
            signal: controller.signal,
          });
        })
        .then(
          ({ preparation, timedOut }) => {
            const utterance = preparation.provisionalUtterances[0];
            if (preparation.phase === "ready" && utterance) {
              const preparedMessage: BotcastMessage = {
                id: utterance.id,
                episodeId: currentEpisode.id,
                speakerRole:
                  utterance.speakerBotId === currentEpisode.hostBotId
                    ? "host"
                    : "guest",
                botId: utterance.speakerBotId,
                content: utterance.text,
                stageActionText: null,
                voicePerformanceText: null,
                moodKey: "neutral",
                createdAt: preparation.updatedAt,
              };
              let bot = botsById.get(utterance.speakerBotId);
              if (bot) {
                bot = botWithIdentityBeforeMessage(
                  bot,
                  currentEpisode,
                  preparedMessage,
                );
              }
              const reactionPlan = utterance.signalListenerReactionPlan;
              const listener = reactionPlan
                ? botsById.get(reactionPlan.listenerBotId)
                : undefined;
              const interruptedBot = reactionPlan
                ? botsById.get(reactionPlan.speakerBotId)
                : undefined;
              if (reactionPlan && listener) {
                onPrefetchListenerReaction?.(
                  reactionPlan,
                  listener,
                  interruptedBot
                    ? botWithIdentityBeforeMessage(
                        interruptedBot,
                        currentEpisode,
                        preparedMessage,
                      )
                    : undefined,
                  { signalTurnPreparationId: preparation.id },
                );
              }
              if (
                bot &&
                !bot.muted &&
                !botPowerResponseIsSilentV1(utterance.text)
              ) {
                prepared.prefetchedMessageId = preparedMessage.id;
                onPrefetchUtterance?.(
                  preparedMessage,
                  bot,
                  { signalTurnPreparationId: preparation.id },
                );
              }
            }
            return {
              ok: true as const,
              preparation,
              preparationTimedOut: timedOut,
            };
          },
          (error: unknown) => ({ ok: false as const, error }),
        )
        .finally(() => {
          prepared.settled = true;
        });
      preparedAdvanceRef.current = prepared;
    },
    [
      botsById,
      discardPreparedAdvance,
      onPrefetchListenerReaction,
      onPrefetchUtterance,
      request,
      theme,
    ],
  );
  prepareGuestResponseRef.current = prepareGuestResponse;

  const advanceEpisode = useCallback(
    async (
      cue?: BotcastProducerCue,
      cueDelivery: BotcastProducerCueDelivery = "next_host_turn",
      hostRedirect?: BotcastHostRedirectContext,
      guestInterruption?: BotcastGuestInterruptionContext,
      interruptionBridgeMessage?: BotcastMessage,
      producerGuestMessage?: string,
      producerGuestThinkingMs?: number,
      producerGuestHostInterruption?: BotcastHostRedirectContext,
      interruptionCrosstalkPlan?: ListenerReactionPlanV1,
    ): Promise<boolean> => {
      if (
        !episode ||
        episode.status !== "live" ||
        episode.playbackMode === "watch" ||
        (advanceInFlightRef.current && cueDelivery !== "interrupt_guest")
      )
        return false;
      const queuedCue =
        !producerGuestMessage &&
        episode.guestKind !== "producer" &&
        !cue &&
        !botcastPendingCrosstalkReclaimV1(episode.messages) &&
        botcastNextSpeakerRole({
          messages: episode.messages,
          segment: episode.segment,
          guestDeparted: guestHasDeparted(episode),
        }) === "host"
          ? queuedProducerCueRef.current
          : null;
      const requestedCue = cue ?? queuedCue ?? undefined;
      let finishResponseCue: (() => Promise<void>) | null = null;
      advanceInFlightRef.current = true;
      const { controller, runId } = beginEpisodeOperation();
      startTransition(() => {
        setSignalGenerationThinking({
          runId,
          role: signalGenerationThinkingRole({
            scheduledSpeakerRole: botcastNextSpeakerRole({
              messages: episode.messages,
              segment: episode.segment,
              guestDeparted: guestHasDeparted(episode),
            }),
            cueDelivery,
            hasProducerCue: Boolean(requestedCue),
          }),
        });
        setBusy(true);
      });
      setError(null);
      let interruptionCrosstalkPlayback: Promise<boolean> | null = null;
      let interruptionBridgePlayback: Promise<void> | null = null;
      const playAcceptedInterruptionBridge = (): Promise<void> => {
        if (!interruptionBridgeMessage) return Promise.resolve();
        if (interruptionBridgePlayback) return interruptionBridgePlayback;
        interruptionBridgePlayback = (async () => {
            const interrupter = interruptionCrosstalkPlan
              ? botsById.get(interruptionCrosstalkPlan.listenerBotId)
              : null;
            const interruptedMessage = interruptionCrosstalkPlan
              ? episode.messages.find(
                  (message) =>
                    message.id === interruptionCrosstalkPlan.messageId,
                )
              : null;
            const interruptedBot =
              interruptionCrosstalkPlan && interruptedMessage
                ? botsById.get(interruptionCrosstalkPlan.speakerBotId)
                : null;
            await playPreparedEpisodeMessage(
              interruptionBridgeMessage,
              episode,
              controller,
              runId,
              false,
              interruptionCrosstalkPlan && interrupter
                ? () => {
                    interruptionCrosstalkPlayback = Promise.resolve(
                      onListenerReaction?.(
                        interruptionCrosstalkPlan,
                        interrupter,
                        signalStudioVoicePan(
                          selectedShow?.studioLayout,
                          "host",
                        ),
                        INTERRUPTED_SPEAKER_RETORT_PAUSE_MS,
                        {
                          listener: createSignalReactionVoiceLifecycle(
                            interruptionCrosstalkPlan.listenerBotId,
                            interruptionCrosstalkPlan.messageId,
                            "reaction",
                            listenerReactionSpokenTextV1(
                              interruptionCrosstalkPlan,
                            ) ?? "",
                            signalListenerReactionVoiceGain(
                              interruptionCrosstalkPlan,
                            ),
                          ),
                          interrupted: createSignalReactionVoiceLifecycle(
                            interruptionCrosstalkPlan.speakerBotId,
                            interruptionCrosstalkPlan.messageId,
                            "crosstalk",
                            listenerReactionInterruptedSpeakerTextV1(
                              interruptionCrosstalkPlan,
                            ) ?? "",
                          ),
                          ...(interruptedBot && interruptedMessage
                            ? {
                                interruptedBot: botWithIdentityBeforeMessage(
                                  interruptedBot,
                                  episode,
                                  interruptedMessage,
                                ),
                              }
                            : {}),
                          ...(interruptedMessage?.directionalIrritationDelivery
                            ? {
                                directionalIrritationDelivery:
                                  interruptedMessage.directionalIrritationDelivery,
                              }
                            : {}),
                        },
                      ),
                    )
                      .then((played) => played ?? false)
                      .catch(() => false);
                  }
                : undefined,
              {
                voiceChannel: "handoff",
                deferPresentationUntilPlaybackStart: true,
              },
            );
            if (interruptionCrosstalkPlayback) {
              await interruptionCrosstalkPlayback;
            }
          })();
        return interruptionBridgePlayback;
      };
      const foregroundFloorAvailableAtMs = (async (): Promise<number> => {
        if (interruptionBridgePlayback) await interruptionBridgePlayback;
        if (interruptionCrosstalkPlayback) {
          await interruptionCrosstalkPlayback;
        }
        return Date.now();
      })();
      const foregroundHoldId = `${episode.id}:${runId}:${Date.now()}`;
      let preparationRecovery: "preparation_timeout" | null = null;
      let completedForegroundHold: Promise<void> | null = null;
      const completeForegroundGenerationHold = (): Promise<void> => {
        if (completedForegroundHold) return completedForegroundHold;
        completedForegroundHold = (async () => {
          const floorAvailableAtMs = await foregroundFloorAvailableAtMs;
          await recordSignalForegroundGenerationHold({
            episodeId: episode.id,
            holdId: foregroundHoldId,
            durationMs: Math.max(0, Date.now() - floorAvailableAtMs),
            recovery: preparationRecovery,
          });
        })().catch(() => undefined);
        return completedForegroundHold;
      };
      try {
        const lastVisibleMessageId = episode.messages.at(-1)?.id ?? null;
        const imageContextForTurn = botcastLatestImageContextV1(episode.events);
        const episodeImageForTurn =
          signalEpisodeImageRef.current?.episodeId === episode.id &&
          (requestedCue?.kind === "present_image" ||
            (imageContextForTurn && imageContextForTurn.phase !== "dismissed"))
            ? signalEpisodeImageRef.current
            : null;
        const prepared =
          !episodeImageForTurn &&
          !requestedCue &&
          !producerGuestMessage &&
          !producerGuestHostInterruption &&
          preparedAdvanceRef.current?.episodeId === episode.id &&
            preparedAdvanceRef.current.afterMessageId === lastVisibleMessageId
          ? preparedAdvanceRef.current
          : null;
        let warmupHoldActive = false;
        const preparedResult = prepared ? await prepared.result : null;
        if (preparedResult?.ok && preparedResult.preparationTimedOut) {
          preparationRecovery = "preparation_timeout";
          if (preparedAdvanceRef.current === prepared) {
            discardPreparedAdvance(
              "Signal speculative preparation exceeded its bounded runway.",
            );
          }
        }
        if (preparedAdvanceRef.current === prepared) {
          preparedAdvanceRef.current = null;
        }
        const readyPreparation =
          preparedResult?.ok && preparedResult.preparation.phase === "ready"
            ? preparedResult.preparation
            : null;
        if (
          !readyPreparation &&
          !interruptionBridgeMessage &&
          !producerGuestHostInterruption
        ) {
          const nextRole = botcastNextSpeakerRole({
            messages: episode.messages,
            segment: episode.segment,
            guestDeparted: guestHasDeparted(episode),
          });
          const responder = nextRole === "host" ? hostBot : liveGuestBot;
          const responderMayBorrowMute = Boolean(
            nextRole &&
              botPowerMirrorsIdentityV1(
                botcastSnapshotPowersForRoleV1(episode, nextRole),
              ) &&
              (nextRole === "host" ? liveGuestBot?.muted : hostBot?.muted),
          );
          if (
            responder &&
            !responder.producerGuest &&
            !signalResponseCueBotIsMuted(
              responder,
              botcastIdentityMirrorStatesAtV1(episode.events),
              botsById,
              responderMayBorrowMute,
            )
          ) {
            finishResponseCue =
              onResponseCueGeneration?.({
                botId: responder.id,
                trigger: requestedCue ? "redirect" : null,
                sessionId: episode.id,
              }) ?? null;
          }
        }
        if (
          !readyPreparation &&
          !(producerGuestHostInterruption && !producerGuestMessage)
        ) {
          const preparationStatus = await waitForModelPreparation({
            request,
            provider: episode.provider,
            model: episode.model,
            experience: "signal",
            signal: controller.signal,
            onStatus: (status) => {
              if (status.state === "warming") {
                warmupHoldActive = true;
                signalModelWarmupVisibleRef.current = true;
                assignSignalModelWarmup({
                  phase: "held",
                  model: status.model,
                  startedAt: status.startedAt,
                  failure: null,
                  initial: false,
                  episodeId: episode.id,
                });
              } else if (status.state === "unavailable") {
                assignSignalModelWarmup({
                  phase: "failed",
                  model: status.model,
                  startedAt: status.startedAt,
                  failure: status.failure,
                  initial: false,
                  episodeId: episode.id,
                });
              }
            },
          });
          if (preparationStatus.state === "unavailable") {
            signalModelWarmupVisibleRef.current = true;
            setAutoRun(false);
            return false;
          }
        }
        const queuedCueIsServerOwned =
          signalQueuedProducerCueIsServerOwned({
            requestedCue,
            queuedCue: queuedProducerCueRef.current,
          });
        const requestForegroundAdvance = async (): Promise<BotcastEpisodeAdvanceResponse> => {
          return request<BotcastEpisodeAdvanceResponse>(
            `/api/botcast/episodes/${encodeURIComponent(episode.id)}/advance`,
            {
              method: "POST",
              signal: controller.signal,
              body: JSON.stringify({
                theme,
                ...(requestedCue && !queuedCueIsServerOwned
                  ? { cue: requestedCue }
                  : {}),
                ...(requestedCue ? { cueDelivery } : {}),
                ...(hostRedirect ? { hostRedirect } : {}),
                ...(guestInterruption
                  ? { guestInterruption }
                  : {}),
                ...(producerGuestMessage
                  ? { guestMessage: producerGuestMessage }
                  : {}),
                ...(producerGuestThinkingMs !== undefined
                  ? { guestThinkingMs: producerGuestThinkingMs }
                  : {}),
                ...(producerGuestHostInterruption
                  ? { producerGuestHostInterruption }
                  : {}),
                ...(episodeImageForTurn
                  ? {
                      episodeImage: {
                        imageId: episodeImageForTurn.imageId,
                        fileName: episodeImageForTurn.fileName,
                        dataUrl: episodeImageForTurn.dataUrl,
                        ...(episodeImageForTurn.archivalProxyEpisodeId
                          ? {
                              archivalProxyEpisodeId:
                                episodeImageForTurn.archivalProxyEpisodeId,
                            }
                          : {}),
                        name: episodeImageForTurn.descriptor.name,
                        replayEmoji: episodeImageForTurn.replayEmoji,
                        ...(episodeImageForTurn.reason
                          ? { reason: episodeImageForTurn.reason }
                          : {}),
                      },
                    }
                  : {}),
              }),
            },
            );
        };
        const response = readyPreparation
            ? await request<BotcastEpisodeAdvanceResponse>(
                `/api/turn-preparations/${encodeURIComponent(readyPreparation.id)}/commit`,
                { method: "POST", signal: controller.signal },
              ).catch((commitError: unknown) => {
                // A prepared turn the live episode has moved past is a missed
                // head start, not a broken episode: generate on air instead.
                if (controller.signal.aborted) throw commitError;
                const provisionalMessageId =
                  readyPreparation.provisionalUtterances[0]?.id ?? null;
                if (provisionalMessageId) {
                  onInvalidatePrefetchedUtterance?.(
                    episode.id,
                    provisionalMessageId,
                  );
                }
                return requestForegroundAdvance();
              })
          : await requestForegroundAdvance();
        if (!episodeOperationIsCurrent(controller, runId)) return false;
        // The saved bridge is an acknowledgement of a real server transition,
        // not optimistic UI. Keep it silent until the interrupting advance has
        // durably accepted and resolved the queued cue.
        if (interruptionBridgeMessage) {
          await playAcceptedInterruptionBridge();
        }
        const committedProvisional =
          readyPreparation?.provisionalUtterances[0] ?? null;
        if (
          committedProvisional &&
          (!response.message ||
            response.message.id !== committedProvisional.id ||
            response.message.content !== committedProvisional.text)
        ) {
          onInvalidatePrefetchedUtterance?.(
            episode.id,
            committedProvisional.id,
          );
        }
        const resolvedImageContext = episodeImageForTurn
          ? botcastLatestImageContextV1(response.episode.events)
          : null;
        if (
          episodeImageForTurn &&
          resolvedImageContext?.imageId === episodeImageForTurn.imageId
        ) {
          const resolvedUpload: SignalEpisodeImageUpload = {
            ...episodeImageForTurn,
            replayEmoji: resolvedImageContext.replayEmoji,
            descriptor: {
              kind: resolvedImageContext.kind,
              name: resolvedImageContext.name,
              mimeType: resolvedImageContext.mimeType,
            },
          };
          signalEpisodeImageRef.current = resolvedUpload;
          setSignalEpisodeImage(resolvedUpload);
        }
        if (requestedCue) {
          await finishResponseCue?.();
          finishResponseCue = null;
        }
        if (!episodeOperationIsCurrent(controller, runId)) return false;
        // The returned event log owns the cue outcome. Do not optimistically
        // clear it here: a repair can requeue it, and a privacy failure must
        // remain visible instead of looking delivered.
        if (warmupHoldActive || signalModelWarmupRef.current) {
          await releaseSignalModelWarmup(response.episode.id, false);
        }
        const priorMessageIds = new Set(
          episode.messages.map((message) => message.id),
        );
        const submittedProducerTurn = producerGuestMessage
          ? (response.episode.messages.find(
              (message) =>
                !priorMessageIds.has(message.id) &&
                message.speakerRole === "guest" &&
                message.botId === BOTCAST_PRODUCER_GUEST_ID,
            ) ?? null)
          : null;
        if (submittedProducerTurn) {
          producerGuestThinkingStartedAtRef.current = null;
          producerGuestThinkingEndedAtRef.current = null;
          const stagedEpisode = response.message
            ? {
                ...response.episode,
                messages: response.episode.messages.filter(
                  (message) => message.id !== response.message?.id,
                ),
              }
            : response.episode;
          await waitForSignalUserInputIdle(controller.signal);
          if (!episodeOperationIsCurrent(controller, runId)) return false;
          startTransition(() => setEpisode(stagedEpisode));
          const outgoingProducerHandoffMessage = producerGuestHostInterruption
            ? producerGuestHandoffOutgoingMessageRef.current
            : null;
          let persistedProducerHandoff: Promise<BotcastEpisode | null> | null =
            null;
          if (!outgoingProducerHandoffMessage) {
            prepareEpisodeMessage(submittedProducerTurn, stagedEpisode);
          }
          await playPreparedEpisodeMessage(
            submittedProducerTurn,
            stagedEpisode,
            controller,
            runId,
            false,
            () => completeForegroundGenerationHold(),
            outgoingProducerHandoffMessage
              ? {
                  voiceChannel: "handoff",
                  deferPresentationUntilPlaybackStart: true,
                  onHandoffStart: () => {
                    const audienceHeard = audibleHandoffAudienceHeardContent(
                      outgoingProducerHandoffMessage,
                    );
                    onReleaseUtterance?.(
                      SIGNAL_AUDIBLE_HANDOFF_RELEASE_MS,
                    );
                    audibleHandoffOutgoingMessageIdRef.current = null;
                    producerGuestHandoffOutgoingMessageRef.current = null;
                    if (!audienceHeard) return;
                    persistedProducerHandoff = request<{
                      episode: BotcastEpisode;
                    }>(
                      `/api/botcast/episodes/${encodeURIComponent(response.episode.id)}/producer-guest-handoff`,
                      {
                        method: "POST",
                        body: JSON.stringify({
                          interruption: {
                            messageId: outgoingProducerHandoffMessage.id,
                            spokenContent: audienceHeard,
                          },
                        }),
                      },
                    )
                      .then((result) => result.episode)
                      .catch(() => null);
                  },
                }
              : undefined,
          );
          if (!episodeOperationIsCurrent(controller, runId)) return false;
          const persistedEpisode = persistedProducerHandoff
            ? await persistedProducerHandoff
            : null;
          if (persistedEpisode) response.episode = persistedEpisode;
        }
        await waitForSignalUserInputIdle(controller.signal);
        if (!episodeOperationIsCurrent(controller, runId)) return false;
        startTransition(() => setEpisode(response.episode));
        if (response.message) {
          const message = response.message;
          prepareEpisodeMessage(message, response.episode);
          if (
            !finishResponseCue &&
            !interruptionBridgeMessage &&
            !producerGuestHostInterruption
          ) {
            const responder = botsById.get(message.botId);
            if (
              responder &&
              !responder.producerGuest &&
              signalMessageRequestsResponseCue(message)
            ) {
              finishResponseCue =
                onResponseCueGeneration?.({
                  botId: responder.id,
                  trigger: null,
                  sessionId: response.episode.id,
                }) ?? null;
            }
          }
          // Generation is complete and the canonical response is prepared, so
          // this is an on-air cadence beat rather than model-thinking time.
          if (
            !(await waitForSignalResponseCadence(
              signalExtraResponsePauseMs(),
              controller.signal,
            ))
          ) {
            return false;
          }
          await finishResponseCue?.();
          finishResponseCue = null;
          const echoBridgeAlreadyVoiced =
            Boolean(interruptionBridgeMessage) &&
            Boolean(hostBot?.echoesAddressedSpeech) &&
            message.content.replace(/\s+/gu, " ").trim() ===
              interruptionBridgeMessage!.content.replace(/\s+/gu, " ").trim();
          if (!echoBridgeAlreadyVoiced) {
            await playPreparedEpisodeMessage(
              message,
              response.episode,
              controller,
              runId,
              true,
              () => completeForegroundGenerationHold(),
            );
          } else {
            void completeForegroundGenerationHold();
          }
        } else {
          void completeForegroundGenerationHold();
        }
        if (response.episode.status === "completed") {
          assignQueuedProducerCue(null);
          setAutoRun(false);
          if (selectedShow) {
            void playEpisodeOutro({
              episode: response.episode,
              show: selectedShow,
              forced: false,
            });
          }
          if (selectedShowId)
            void loadEpisodes(selectedShowId).catch(() => undefined);
        }
        return true;
      } catch (advanceError) {
        await finishResponseCue?.();
        if (episodeOperationIsCurrent(controller, runId)) {
          if (signalModelWarmupRef.current) {
            await releaseSignalModelWarmup(episode.id, false);
          }
          if (activeSpeechMessageIdRef.current !== null) stopUtterance();
          setAutoRun(false);
          setError(signalErrorToast("Advance Signal episode", advanceError));
        }
        return false;
      } finally {
        await finishResponseCue?.();
        void completeForegroundGenerationHold();
        const operationWasCurrent = episodeOperationIsCurrent(
          controller,
          runId,
        );
        if (operationWasCurrent) {
          episodeOperationAbortRef.current = null;
          advanceInFlightRef.current = false;
        }
        startTransition(() => {
          setSignalGenerationThinking((current) =>
            current?.runId === runId ? null : current,
          );
          if (operationWasCurrent) {
            setBusy(false);
          }
        });
      }
    },
    [
      audibleHandoffAudienceHeardContent,
      beginEpisodeOperation,
      botsById,
      episode,
      hostBot,
      assignQueuedProducerCue,
      assignSignalModelWarmup,
      createSignalReactionVoiceLifecycle,
      episodeOperationIsCurrent,
      loadEpisodes,
      onListenerReaction,
      onInvalidatePrefetchedUtterance,
      onReleaseUtterance,
      onResponseCueGeneration,
      playEpisodeOutro,
      playPreparedEpisodeMessage,
      prepareEpisodeMessage,
      recordSignalForegroundGenerationHold,
      releaseSignalModelWarmup,
      request,
      selectedShow,
      selectedShowId,
      liveGuestBot,
      stopUtterance,
      theme,
      waitForSignalUserInputIdle,
    ],
  );

  const producerGuestHostInterruption =
    signalProducerGuestHostInterruptionContext({
      episode,
      speakingMessageId,
      liveSpeech,
    });
  const producerGuestHostTrollImmune = Boolean(
    producerGuestHostInterruption &&
      episode?.messages.find(
        (message) => message.id === producerGuestHostInterruption.messageId,
      )?.botPowerTrollPresentation?.ordinaryInterruptionImmune,
  );

  const interruptProducerGuestHostLocally = (
    interruption: BotcastHostRedirectContext,
    options: { preserveAudibleUtterance?: boolean } = {},
  ): void => {
    const currentEpisode = liveEpisodeRef.current;
    if (!currentEpisode) return;
    const outgoingMessage = currentEpisode.messages.find(
      (message) => message.id === interruption.messageId,
    );
    if (options.preserveAudibleUtterance && outgoingMessage) {
      producerGuestHandoffOutgoingMessageRef.current = outgoingMessage;
      audibleHandoffOutgoingMessageIdRef.current = outgoingMessage.id;
    } else {
      producerGuestHandoffOutgoingMessageRef.current = null;
    }
    invalidateEpisodeOperation({
      preserveAudibleUtterance:
        options.preserveAudibleUtterance && Boolean(outgoingMessage),
    });
    setEpisode((current) =>
      current?.id === currentEpisode.id
        ? {
            ...current,
            messages: current.messages.map((message) =>
              message.id === interruption.messageId
                ? {
                    ...message,
                    content: interruption.spokenContent,
                    voicePerformanceText: null,
                  }
                : message,
            ),
          }
        : current,
    );
  };

  const shushProducerGuestHost = async (): Promise<void> => {
    if (!producerGuestHostInterruption) return;
    if (producerGuestHostTrollImmune) {
      setError(
        signalErrorToast(
          "Troll keeps the Signal mic",
          new Error(
            "Ordinary Shh cannot cut off this bounded in-fiction delivery. Stop or leave the show to end playback.",
          ),
        ),
      );
      return;
    }
    interruptProducerGuestHostLocally(producerGuestHostInterruption);
    setAutoRun(false);
    await advanceEpisode(
      undefined,
      "next_host_turn",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      producerGuestHostInterruption,
    );
  };

  const submitProducerGuestAnswer = async (
    overrideAnswer?: string,
  ): Promise<void> => {
    if (producerGuestHostTrollImmune) {
      setError(
        signalErrorToast(
          "Troll keeps talking",
          new Error("Your answer remains drafted until the host yields."),
        ),
      );
      return;
    }
    if (
      !episode ||
      episode.guestKind !== "producer" ||
      episode.status !== "live" ||
      (speakingMessageId !== null && !producerGuestHostInterruption)
    )
      return;
    const rawDraft = overrideAnswer ?? producerGuestAnswerDraftRef.current;
    const rawAnswer = rawDraft.trim();
    if (!rawAnswer) return;
    const nextRole = botcastNextSpeakerRole({
      messages: episode.messages,
      segment: episode.segment,
      guestDeparted: false,
    });
    if (nextRole !== "guest" || (busy && !producerGuestHostInterruption))
      return;
    const restoreSubmittedDraft = (): void => {
      if (producerGuestAnswerDraftRef.current) return;
      producerGuestAnswerDraftRef.current = rawDraft;
      setProducerGuestAnswerDraft(rawDraft);
    };
    // Clear before the first await so the native editor can immediately accept
    // the Producer's next thought without a later async continuation erasing it.
    producerGuestAnswerDraftRef.current = "";
    setProducerGuestAnswerDraft("");
    // Correction happens on the way into the queue, never while typing.
    const assistedAnswer = autoCorrectGuestAnswerEnabled
      ? applyComposerSendAutoCorrect(rawAnswer)
      : rawAnswer;
    let answer: string;
    try {
      answer = (
        (await expandComposerDraft?.(assistedAnswer)) ?? assistedAnswer
      ).trim();
    } catch (error) {
      restoreSubmittedDraft();
      throw error;
    }
    if (!answer) {
      restoreSubmittedDraft();
      return;
    }
    const thinkingEndedAtMs = Date.now();
    const thinkingStartedAtMs =
      producerGuestThinkingStartedAtRef.current ?? thinkingEndedAtMs;
    const guestThinkingMs = Math.max(
      0,
      thinkingEndedAtMs - thinkingStartedAtMs,
    );
    producerGuestThinkingEndedAtRef.current = thinkingEndedAtMs;
    const hostInterruptionForTurn = signalProducerGuestHostInterruptionContext({
      episode: liveEpisodeRef.current,
      speakingMessageId: activeSpeechMessageIdRef.current,
      liveSpeech: liveSpeechRef.current,
    });
    if (hostInterruptionForTurn) {
      interruptProducerGuestHostLocally(hostInterruptionForTurn, {
        preserveAudibleUtterance: true,
      });
    }
    setAutoRun(true);
    const sent = await advanceEpisode(
      undefined,
      "next_host_turn",
      undefined,
      undefined,
      undefined,
      answer,
      guestThinkingMs,
      hostInterruptionForTurn ?? undefined,
    );
    if (sent) {
      producerGuestThinkingStartedAtRef.current = null;
      producerGuestThinkingEndedAtRef.current = null;
    } else {
      // Restore only if the Producer has not already begun the next answer.
      restoreSubmittedDraft();
      producerGuestThinkingEndedAtRef.current = null;
    }
  };

  useEffect(() => {
    const awaitingProducerAnswer = Boolean(
      episode &&
        episode.guestKind === "producer" &&
        episode.status === "live" &&
        !busy &&
        speakingMessageId === null &&
        botcastNextSpeakerRole({
          messages: episode.messages,
          segment: episode.segment,
          guestDeparted: false,
        }) === "guest",
    );
    if (awaitingProducerAnswer) {
      producerGuestThinkingStartedAtRef.current ??= Date.now();
      producerGuestThinkingEndedAtRef.current = null;
      return;
    }
    if (!busy) {
      producerGuestThinkingStartedAtRef.current = null;
      producerGuestThinkingEndedAtRef.current = null;
    }
  }, [busy, episode, speakingMessageId]);

  const leaveInitialSignalWarmup = async (): Promise<void> => {
    const episodeId =
      signalModelWarmupRef.current?.episodeId ?? episode?.id ?? null;
    invalidateEpisodeOperation();
    if (episodeId) {
      await request(`/api/botcast/episodes/${encodeURIComponent(episodeId)}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    setEpisode(null);
    setAutoRun(false);
    setBusy(false);
    if (selectedShowId)
      void loadEpisodes(selectedShowId).catch(() => undefined);
  };

  const retrySignalModelWarmup = async (): Promise<void> => {
    const current = signalModelWarmupRef.current;
    if (!current) return;
    if (current.initial) {
      await leaveInitialSignalWarmup();
      await startEpisode();
      return;
    }
    const episodeId = current.episodeId ?? episode?.id ?? null;
    if (!episodeId || !episode) return;
    const controller = new AbortController();
    assignSignalModelWarmup({ ...current, phase: "held", failure: null });
    try {
      const status = await waitForModelPreparation({
        request,
        provider: episode.provider,
        model: episode.model,
        experience: "signal",
        retry: true,
        signal: controller.signal,
        onStatus: (next) => {
          if (next.state !== "warming") return;
          assignSignalModelWarmup({
            ...current,
            phase: "held",
            model: next.model,
            startedAt: next.startedAt,
            failure: null,
          });
        },
      });
      if (status.state === "unavailable") {
        assignSignalModelWarmup({
          ...current,
          phase: "failed",
          model: status.model,
          startedAt: status.startedAt,
          failure: status.failure,
        });
        return;
      }
      setAutoRun(true);
      window.setTimeout(() => void advanceEpisode(), 0);
    } catch (retryError) {
      if (
        retryError instanceof DOMException &&
        retryError.name === "AbortError"
      )
        return;
      assignSignalModelWarmup({
        ...current,
        phase: "failed",
        failure: "request_failed",
      });
    }
  };

  useEffect(() => {
    if (
      !episode ||
      episode.status !== "live" ||
      episode.playbackMode === "watch" ||
      !autoRun ||
      busy ||
      speakingMessageId !== null
    )
      return;
    if (
      episode.guestKind === "producer" &&
      botcastNextSpeakerRole({
        messages: episode.messages,
        segment: episode.segment,
        guestDeparted: false,
      }) === "guest"
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => void advanceEpisode(),
      episode.messages.length ? SIGNAL_NATURAL_HANDOFF_MS : 0,
    );
    return () => window.clearTimeout(timer);
  }, [advanceEpisode, autoRun, busy, episode, speakingMessageId]);

  const queueProducerCue = async (cue: BotcastProducerCue): Promise<boolean> => {
    if (!episode) return false;
    try {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/episodes/${encodeURIComponent(episode.id)}/producer-cue`,
        { method: "POST", body: JSON.stringify({ cue }) },
      );
      const activeCue = botcastActiveProducerCueFromEvents(response.episode.events);
      assignQueuedProducerCue(activeCue?.cue ?? null, activeCue?.status ?? null);
      setEpisode(response.episode);
      return Boolean(activeCue);
    } catch (queueError) {
      setError(signalErrorToast("Queue Signal cue", queueError));
      return false;
    }
  };

  const sendCue = async (cue: BotcastProducerCue): Promise<void> => {
    if (
      !episode ||
      episode.status !== "live" ||
      episode.playbackMode === "watch"
    )
      return;
    if (cue.kind !== "present_image" && !(await queueProducerCue(cue))) {
      return;
    }
    const activeHostMessage = episode.messages.find(
      (message) =>
        message.id === speakingMessageId && message.speakerRole === "host",
    );
    const activeHostReveal =
      activeHostMessage &&
      liveSpeech?.messageId === activeHostMessage.id &&
      liveSpeech.reveal.phase === "playing"
        ? liveSpeech.reveal
        : null;
    const spokenContent = activeHostReveal
      ? botcastSpeechRevealVisibleText(activeHostReveal).trimEnd()
      : "";
    if (
      activeHostMessage &&
      activeHostReveal &&
      signalHostCueShouldRedirect({
        progress: activeHostReveal.progress,
        spokenContent,
        randomValue: Math.random(),
      })
    ) {
      invalidateEpisodeOperation();
      setEpisode({
        ...episode,
        messages: episode.messages.map((message) =>
          message.id === activeHostMessage.id
            ? { ...message, content: spokenContent, voicePerformanceText: null }
            : message,
        ),
      });
      if (cue.kind === "present_image") assignQueuedProducerCue(cue);
      setAutoRun(true);
      onPrepareUtterance?.();
      void advanceEpisode(undefined, "redirect_host", {
        messageId: activeHostMessage.id,
        spokenContent,
      });
      return;
    }
    if (cue.kind === "present_image") assignQueuedProducerCue(cue);
    setAutoRun(true);
    const nextRole = botcastNextSpeakerRole({
      messages: episode.messages,
      segment: episode.segment,
      guestDeparted: guestHasDeparted(episode),
    });
    if (nextRole === "host") {
      // The host's next turn now carries the cue, so a turn prepared without
      // it can never air. Release it now instead of leaving it to finish and
      // hold the model while the cued turn waits behind it.
      discardPreparedAdvance("A Producer cue redirects the host's next turn.");
    }
    if (!busy && speakingMessageId === null && nextRole === "host") {
      onPrepareUtterance?.();
      void advanceEpisode();
    }
  };

  const interruptGuestWithQueuedCue = async (): Promise<void> => {
    const cue = queuedProducerCueRef.current;
    const activeGuestMessage = episode?.messages.find(
      (message) =>
        message.id === speakingMessageId && message.speakerRole === "guest",
    );
    const activeGuestReveal =
      activeGuestMessage && liveSpeech?.messageId === activeGuestMessage.id
        ? liveSpeech.reveal
        : null;
    const spokenContent =
      activeGuestReveal?.phase === "playing"
        ? botcastSpeechRevealVisibleText(activeGuestReveal).trimEnd()
        : "";
    const interruptedContent = activeGuestMessage
      ? botcastInterruptedGuestContent(
          activeGuestMessage.content,
          spokenContent,
        )
      : null;
    const activeGuestOnMic = Boolean(activeGuestMessage);
    const guestIsNext =
      episode !== null &&
      botcastNextSpeakerRole({
        messages: episode.messages,
        segment: episode.segment,
        guestDeparted: guestHasDeparted(episode),
      }) === "guest";
    if (
      !cue ||
      !episode ||
      !nextHostInterruptionBridge ||
      (Boolean(spokenContent) && !interruptedContent) ||
      (!activeGuestOnMic &&
        (speakingMessageId !== null || !guestIsNext))
    )
      return;
    let resolvedGuestInterruption: BotcastGuestInterruptionContext = {
      bridgeLine: nextHostInterruptionBridge.content,
    };
    if (activeGuestOnMic) {
      const audienceHeard = audibleHandoffAudienceHeardContent(
        activeGuestMessage!,
      );
      const audienceCut = botcastInterruptedGuestContent(
        activeGuestMessage!.content,
        audienceHeard,
      );
      resolvedGuestInterruption = {
        bridgeLine: nextHostInterruptionBridge.content,
        messageId: activeGuestMessage!.id,
        spokenContent: audienceHeard,
        ...(audienceCut &&
        nextHostInterruptionCrosstalkPlan?.publicInterruptedSpeakerCue
          ? {
              publicInterruptedSpeakerCue:
                nextHostInterruptionCrosstalkPlan.publicInterruptedSpeakerCue,
              interruptedSpeakerCueSpeechEffect:
                "speech_obfuscation" as const,
            }
          : audienceCut && nextHostInterruptionCrosstalkPlan?.interruptedSpeakerCue
            ? {
                interruptedSpeakerCue:
                  nextHostInterruptionCrosstalkPlan.interruptedSpeakerCue,
              }
            : {}),
      };
      audibleHandoffOutgoingMessageIdRef.current = activeGuestMessage!.id;
      invalidateEpisodeOperation({ preserveAudibleUtterance: true });
      onReleaseUtterance?.(SIGNAL_AUDIBLE_HANDOFF_RELEASE_MS);
      audibleHandoffOutgoingMessageIdRef.current = null;
    } else if (busy) {
      // A queued guest generation may ignore AbortSignal. Replace its client
      // run now; the server's run-scoped boundary independently preempts the
      // provider promise before accepting this interrupting advance.
      invalidateEpisodeOperation();
    }
    // Cancelling an active guest deliberately disables auto-run. The queued
    // interruption is still a live handoff, so resume the normal turn loop
    // after the host bridge and cue response finish.
    setAutoRun(true);
    onPrepareUtterance?.();
    setNotice("Requesting the host interruption…");
    const interrupted = await advanceEpisode(
      undefined,
      "interrupt_guest",
      undefined,
      resolvedGuestInterruption,
      nextHostInterruptionBridge,
      undefined,
      undefined,
      undefined,
      nextHostInterruptionCrosstalkPlan ?? undefined,
    );
    if (interrupted) {
      setHostInterruptionOrdinal((current) => current + 1);
      setNotice("The host took the floor.");
    } else if (queuedProducerCueRef.current === cue) {
      setNotice(
        "The interruption was not accepted. The cue is still queued; try again.",
      );
    }
  };

  const openReplay = async (
    summary: BotcastEpisodeSummary,
    options: SignalReplayOpenOptions = {},
  ): Promise<void> => {
    if (!options.preserveEpisodeOperation) invalidateEpisodeOperation();
    const replayRunId = replayVoiceRunIdRef.current + 1;
    replayVoiceRunIdRef.current = replayRunId;
    replayVoiceMessageIdRef.current = null;
    setReplayVoicePending(false);
    setReplaySpeechActive(false);
    setLoading(true);
    setError(null);
    try {
      const detail = await loadEpisode(summary.id);
      if (replayVoiceRunIdRef.current !== replayRunId) return;
      if (detail.status === "live") {
        setEpisode(detail);
        setReplayEpisode(null);
        setReplayRecording(null);
        setReplayManifestV2(null);
        if (detail.modelWarmupHoldStartedAt) {
          signalModelWarmupVisibleRef.current = true;
          assignSignalModelWarmup({
            phase: "held",
            model: detail.model,
            startedAt: detail.modelWarmupHoldStartedAt,
            failure: null,
            initial: detail.messages.length === 0,
            episodeId: detail.id,
          });
          void waitForModelPreparation({
            request,
            provider: detail.provider,
            model: detail.model,
            experience: "signal",
          })
            .then(async (status) => {
            if (status.state === "unavailable") {
              assignSignalModelWarmup({
                phase: "failed",
                model: status.model,
                  startedAt:
                    status.startedAt ?? detail.modelWarmupHoldStartedAt,
                failure: status.failure,
                initial: detail.messages.length === 0,
                episodeId: detail.id,
              });
              return;
            }
            await releaseSignalModelWarmup(detail.id);
            setAutoRun(true);
            })
            .catch(() => undefined);
        } else {
          setAutoRun(false);
        }
        return;
      }
      const recording = await replayRecordingForSource("signal", detail.id);
      const recordingDetail = recording
        ? await replayRecordingDetail(recording.id)
        : null;
      setReplayEpisode(detail);
      setReplayRecording(recordingDetail?.recording ?? recording);
      const savedManifest =
        recordingDetail?.recording.manifest ?? recording?.manifest ?? null;
      setReplayManifestV2(savedManifest?.v === 2 ? savedManifest : null);
      setEpisode(null);
      setReplayPlaying(false);
      setStudioCutEligibilityState(null);
      const loadedRecording = recordingDetail?.recording ?? recording;
      const loadedPremiumReady = Boolean(
        loadedRecording?.studioCutProduction?.audioUrl &&
          loadedRecording.studioCutProduction.timeline &&
          loadedRecording.studioCutProduction.manifest,
      );
      const loadedQuality = loadedRecording?.voiceQuality?.status;
      const selectPremium =
        loadedPremiumReady &&
        (loadedQuality === "repairable" || loadedQuality === "upgradeable");
      const initialElapsedMs =
        options.initialPosition === "end"
          ? Math.max(
              0,
              Math.round(
                (selectPremium
                  ? loadedRecording?.studioCutProduction?.timeline?.durationMs
                  : loadedRecording?.audioDurationMs) ??
                  loadedRecording?.timeline?.durationMs ??
                  botcastReplayTimeline(detail.messages, detail.events).durationMs,
              ),
            )
          : 0;
      replayPublishedElapsedMsRef.current = initialElapsedMs;
      setReplayElapsedMs(initialElapsedMs);
      setReplayIntroRevealed(initialElapsedMs > 0);
      setReplayPlaybackSource(selectPremium ? "studio-cut" : "on-air");
      premiumAutoSelectionRef.current = selectPremium
        ? (loadedRecording?.id ?? null)
        : null;
      setWatchReplayPresentationEpisodeId(null);
      setWatchReplayFinalizingEpisodeId(null);
    } catch (replayError) {
      if (replayVoiceRunIdRef.current === replayRunId) {
        setError(signalErrorToast("Load Signal replay", replayError));
      }
    } finally {
      if (replayVoiceRunIdRef.current === replayRunId) setLoading(false);
    }
  };
  openReplayRef.current = openReplay;

  const replayTimeline = useMemo(
    () =>
      replayEpisode
        ? botcastReplayTimeline(replayEpisode.messages, replayEpisode.events)
        : {
            durationMs: 8_000,
            messageStartMs: [],
            messageEndMs: [],
            thinkingRanges: [],
          },
    [replayEpisode],
  );
  const studioCut = replayRecording?.studioCutProduction ?? null;
  const replayVoiceQuality = replayRecording?.voiceQuality ?? null;
  const premiumAction = replayVoiceQuality?.recommendedAction ?? null;
  const studioCutReady = Boolean(
    studioCut?.audioUrl && studioCut.timeline && studioCut.manifest,
  );
  const studioCutPending =
    studioCut?.phase === "mastering_voices" ||
    studioCut?.phase === "mixing_episode" ||
    studioCut?.phase === "rendering_studio" ||
    studioCut?.phase === "finalizing";
  useEffect(() => {
    if (
      !replayRecordingId ||
      !studioCutReady ||
      !premiumAction ||
      premiumAutoSelectionRef.current === replayRecordingId
    ) {
      return;
    }
    if (replayAudioRef.current) {
      void releaseAudibleAudioElement(replayAudioRef.current, {
        durationMs: 0,
      });
    }
    setReplayPlaying(false);
    replayPublishedElapsedMsRef.current = 0;
    setReplayElapsedMs(0);
    setReplayPlaybackSource("studio-cut");
    premiumAutoSelectionRef.current = replayRecordingId;
  }, [premiumAction, replayRecordingId, studioCutReady]);
  const replayActiveAudioUrl =
    replayPlaybackSource === "studio-cut" && studioCutReady
      ? (studioCut?.audioUrl ?? null)
      : (replayRecording?.audioUrl ?? null);
  const replayPlaybackLabel =
    replayPlaybackSource === "studio-cut" && studioCutReady
      ? premiumAction === "repair"
        ? "Premium repair"
        : "Premium audio"
      : "Original broadcast";
  const replayPlaybackDescription =
    replayPlaybackSource === "studio-cut" && studioCutReady
      ? "Polished voices with saved production layers"
      : "The exact audio heard on air";
  const premiumActionLabel =
    premiumAction === "repair" ? "Repair voice" : "Upgrade voices";
  const replayVoiceQualityLabel =
    replayVoiceQuality?.status === "premium"
      ? "Premium audio"
      : replayVoiceQuality?.status === "repairable"
        ? `Premium audio · ${replayVoiceQuality.fallbackLineCount} fallback ${
            replayVoiceQuality.fallbackLineCount === 1 ? "line" : "lines"
          }`
        : replayVoiceQuality?.status === "upgradeable"
          ? "Original voice mix"
          : "Original audio";
  const premiumProgressLabel =
    studioCutRequestPhase === "checking"
      ? "Checking availability…"
      : studioCutRequestPhase === "retrying"
        ? "Finishing Premium mix…"
        : studioCutRequestPhase === "starting"
          ? `Sending ${replayVoiceQuality?.targetLineCount ?? 0} ${
              replayVoiceQuality?.targetLineCount === 1 ? "line" : "lines"
            }…`
          : studioCut?.phase === "mastering_voices"
            ? `Generating replacement ${
                replayVoiceQuality?.targetLineCount === 1 ? "voice" : "voices"
              } · ${Math.round(studioCut.progress * 100)}%`
            : studioCut?.phase === "mixing_episode" ||
                studioCut?.phase === "rendering_studio" ||
                studioCut?.phase === "finalizing"
              ? `Mixing Premium audio · ${Math.round(studioCut.progress * 100)}%`
              : null;
  const replayActiveDownloadUrl = replayActiveAudioUrl
    ? `${replayActiveAudioUrl}?download=1`
    : null;
  const replayActiveTimeline =
    replayPlaybackSource === "studio-cut" && studioCutReady
      ? (studioCut?.timeline ?? null)
      : (replayRecording?.timeline ?? null);
  const replayPresentationManifestV2 =
    replayPlaybackSource === "studio-cut" && studioCutReady
      ? (studioCut?.manifest ?? null)
      : replayManifestV2;
  const replayFaithful = Boolean(replayActiveAudioUrl);
  const replayIntroDurationMs = replayFaithful
    ? signalReplayIntroDurationMs(replayActiveTimeline)
    : 0;
  const replayProceduralAudioEnabled = false;
  const replayDurationMs = replayFaithful
    ? Math.max(
        1,
        (replayPlaybackSource === "studio-cut"
          ? studioCut?.timeline?.durationMs
          : replayRecording?.audioDurationMs) ??
          replayActiveTimeline?.durationMs ??
          replayTimeline.durationMs,
      )
    : replayTimeline.durationMs;
  const replayIntroAutomaticOffsetMs =
    replayFaithful && replayActiveTimeline
      ? signalReplayIntroVisualOffsetMs({
          timeline: replayActiveTimeline,
          manifest: replayPresentationManifestV2,
        })
      : 0;
  const replayDefaultIntroBounds =
    replayFaithful && replayActiveTimeline
      ? signalReplayIntroBounds(
          replayActiveTimeline,
          replayPresentationManifestV2,
        )
      : null;
  const replayIntroAutomaticFadeMs = replayDefaultIntroBounds
    ? signalReplayIntroLandingFadeMs(replayDefaultIntroBounds)
    : SIGNAL_REPLAY_INTRO_LANDING_FADE_MS;
  const replayIntroCardEndMs =
    signalReplayDefaultIntroDurationMs(replayActiveTimeline);
  const replayCapturedPresentationElapsedMs =
    replayFaithful && replayActiveTimeline
      ? signalReplayCapturedPresentationElapsedMs({
          timeline: replayActiveTimeline,
          replayElapsedMs,
        })
      : replayElapsedMs;
  const replayIntroBookend =
    replayFaithful && replayActiveTimeline
      ? signalReplayBookendAt(
          replayActiveTimeline,
          replayElapsedMs,
          replayPresentationManifestV2,
          { introEndMs: replayIntroCardEndMs },
        )
      : null;
  const replayOutroBookend =
    replayFaithful && replayActiveTimeline
      ? signalReplayBookendAt(
          replayActiveTimeline,
          replayCapturedPresentationElapsedMs,
          replayPresentationManifestV2,
          { introEndMs: replayIntroCardEndMs },
        )
      : null;
  const replayBookend =
    replayIntroBookend?.kind === "intro"
      ? replayIntroBookend
      : replayOutroBookend?.kind === "outro"
        ? replayOutroBookend
        : null;
  const replayIntroLandingActive =
    replayBookend?.kind === "intro" &&
    signalReplayIntroIsLanding({
      bookend: replayBookend,
      elapsedMs: replayElapsedMs,
      fadeMs: replayIntroAutomaticFadeMs,
    });
  const replayStageBoundaryTimesMs = useMemo(() => {
    const boundaries = new Set<number>();
    for (const beat of replayActiveTimeline?.beats ?? []) {
      boundaries.add(Math.max(0, Math.round(beat.startMs)));
      boundaries.add(Math.max(0, Math.round(beat.endMs)));
    }
    for (const event of replayPresentationManifestV2?.direction ?? []) {
      boundaries.add(Math.max(0, Math.round(event.atMs)));
      if (event.endMs !== undefined) {
        boundaries.add(Math.max(0, Math.round(event.endMs)));
      }
    }
    for (const track of
      replayPresentationManifestV2?.presentation?.speechActivityTracks ?? []) {
      for (const cue of track.cues) {
        boundaries.add(Math.max(0, Math.round(cue.atMs)));
      }
    }
    return [...boundaries].sort((left, right) => left - right);
  }, [replayActiveTimeline, replayPresentationManifestV2]);
  useEffect(() => {
    if (
      !replayEpisode ||
      !replayPlaying ||
      replayVoicePending ||
      replayFaithful
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setReplayElapsedMs((current) => {
        const next = Math.min(replayDurationMs, current + 100);
        if (next >= replayDurationMs) setReplayPlaying(false);
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [
    replayDurationMs,
    replayEpisode,
    replayFaithful,
    replayPlaying,
    replayVoicePending,
  ]);
  useEffect(() => {
    const audio = replayAudioRef.current;
    if (!replayFaithful || !audio || !replayPlaying) return;
    let animationFrame = 0;
    let cancelled = false;
    const sync = (): void => {
      if (cancelled) return;
      animationFrame = 0;
      const elapsedMs = Math.max(
        0,
        Math.min(replayDurationMs, Math.round(audio.currentTime * 1_000)),
      );
      const progress = `${
        replayDurationMs > 0
          ? Math.min(100, Math.max(0, (elapsedMs / replayDurationMs) * 100))
          : 0
      }%`;
      replayTransportRef.current?.style.setProperty(
        "--replay-progress",
        progress,
      );
      if (replayTimeRef.current) {
        const label = runtimeLabel(elapsedMs);
        if (replayTimeRef.current.textContent !== label) {
          replayTimeRef.current.textContent = label;
        }
      }
      if (replayRangeRef.current) {
        replayRangeRef.current.value = String(elapsedMs);
      }
      const previousPublishedMs = replayPublishedElapsedMsRef.current;
      const cadenceElapsed =
        elapsedMs - previousPublishedMs >=
        SIGNAL_REPLAY_STAGE_RENDER_INTERVAL_MS;
      if (
        audio.ended ||
        cadenceElapsed ||
        signalReplayClockCrossedBoundary({
          previousElapsedMs: previousPublishedMs,
          elapsedMs,
          boundaryTimesMs: replayStageBoundaryTimesMs,
        })
      ) {
        replayPublishedElapsedMsRef.current = elapsedMs;
        setReplayElapsedMs(elapsedMs);
      }
      if (audio.ended) {
        setReplayPlaying(false);
        return;
      }
      animationFrame = window.requestAnimationFrame(sync);
    };
    const ensurePlaying = (): void => {
      if (cancelled) return;
      audio.playbackRate = 1;
      if (!audio.paused) {
        if (animationFrame === 0) sync();
        return;
      }
      // Click already tried play(); retry once the master can decode.
      void audio.play().then(
        () => {
          if (!cancelled && animationFrame === 0) sync();
        },
        () => undefined,
      );
    };
    audio.addEventListener("canplay", ensurePlaying);
    ensurePlaying();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      audio.removeEventListener("canplay", ensurePlaying);
      void releaseAudibleAudioElement(audio, { durationMs: 0 });
    };
  }, [
    replayActiveAudioUrl,
    replayDurationMs,
    replayFaithful,
    replayPlaying,
    replayStageBoundaryTimesMs,
  ]);

  const replaySceneCheckpoints = useMemo(
    () =>
      replayPresentationManifestV2
        ? buildReplaySceneCheckpointsV2(replayPresentationManifestV2)
        : [],
    [replayPresentationManifestV2],
  );
  const replayDirectedScene = useMemo(
    () =>
      replayPresentationManifestV2
        ? replaySceneAtV2(
            replayPresentationManifestV2,
            replayCapturedPresentationElapsedMs,
            replaySceneCheckpoints,
          )
        : null,
    [
      replayPresentationManifestV2,
      replayCapturedPresentationElapsedMs,
      replaySceneCheckpoints,
    ],
  );
  const replayCameraDirectedScene = useMemo(
    () =>
      replayPresentationManifestV2
        ? replaySceneAtV2(
            replayPresentationManifestV2,
            replayElapsedMs,
            replaySceneCheckpoints,
          )
        : null,
    [replayPresentationManifestV2, replayElapsedMs, replaySceneCheckpoints],
  );
  const replayHasCapturedCameraDirection = useMemo(
    () =>
      replayPresentationManifestV2?.direction.some(
        (event) => event.kind === "camera",
      ) === true,
    [replayPresentationManifestV2],
  );
  const replayCompactThinkingNotice = useMemo(
    () =>
      replayFaithful
        ? signalCompactThinkingNoticeAt({
            direction: replayPresentationManifestV2?.direction,
            atMs: replayElapsedMs,
          })
        : null,
    [replayElapsedMs, replayFaithful, replayPresentationManifestV2],
  );
  const replayFaithfulBeat = replayFaithful
    ? (replayActiveTimeline?.beats.find(
        (beat) =>
          beat.kind === "utterance" &&
          replayCapturedPresentationElapsedMs >= beat.startMs &&
          replayCapturedPresentationElapsedMs < beat.endMs,
      ) ?? null)
    : null;
  const replayFaithfulMessageIndex =
    replayFaithfulBeat?.sourceMessageId && replayEpisode
      ? replayEpisode.messages.findIndex(
          (message) => message.id === replayFaithfulBeat.sourceMessageId,
        )
      : -1;
  const replayMessageIndex = replayFaithful
      ? replayFaithfulMessageIndex
      : botcastReplayMessageIndexAt(
          replayTimeline.messageStartMs,
          replayElapsedMs,
          replayTimeline.messageEndMs,
        );
  const replayActiveMessage =
    replayEpisode?.messages[replayMessageIndex] ?? null;
  // Cup level is anchored to turns, so it needs the last turn that has aired,
  // not just the one on mic: between turns `replayMessageIndex` is -1, and a
  // level that read that as "nothing yet" would snap full in every gap.
  const replayPresentedMessageIndex =
    replayMessageIndex >= 0
      ? replayMessageIndex
      : replayFaithful
        ? (replayActiveTimeline?.beats.reduce((latest, beat) => {
            if (
              beat.kind !== "utterance" ||
              !beat.sourceMessageId ||
              beat.startMs > replayCapturedPresentationElapsedMs
            ) {
              return latest;
            }
            const index =
              replayEpisode?.messages.findIndex(
                (message) => message.id === beat.sourceMessageId,
              ) ?? -1;
            return index > latest ? index : latest;
          }, -1) ?? -1)
        : botcastReplayMessageIndexAt(
            replayTimeline.messageStartMs,
            replayElapsedMs,
          );
  const replayFaithfulCamera = useMemo(
    () =>
      replayEpisode && replayFaithful && replayActiveTimeline
        ? signalFaithfulReplayCameraState({
            episode: replayEpisode,
            timeline: replayActiveTimeline,
            replayElapsedMs,
            scene: replayCameraDirectedScene,
            activeMessage: replayActiveMessage,
            preferDirectedCamera: replayHasCapturedCameraDirection,
          })
        : null,
    [
      replayCameraDirectedScene,
      replayEpisode,
      replayFaithful,
      replayActiveMessage,
      replayHasCapturedCameraDirection,
      replayElapsedMs,
      replayActiveTimeline,
    ],
  );
  const replayEventElapsedMs =
    replayFaithfulCamera?.eventElapsedMs ?? replayElapsedMs;
  const replayBaseShot = replayEpisode
    ? replayFaithful
      ? (replayFaithfulCamera?.shot ??
        botcastCameraShotAt({
          events: replayEpisode.events,
          elapsedMs: replayEventElapsedMs,
        }))
      : ((replayDirectedScene?.camera as BotcastCameraShot | null) ??
        botcastCameraShotAt({
          events: replayEpisode.events,
          elapsedMs: replayEventElapsedMs,
        }))
    : "wide";
  const replayGuestParticipantId = replayEpisode
    ? replayEpisode.guestKind === "producer"
      ? "prism-player"
      : replayEpisode.guestBotId
    : null;
  const replayGuestDeparted = replayEpisode
    ? replayFaithful
      ? botcastGuestHasDepartedAt(replayEpisode.events, replayEventElapsedMs)
      : (replayGuestParticipantId !== null &&
          replayDirectedScene?.participants[replayGuestParticipantId]
            ?.present === false) ||
        botcastGuestHasDepartedAt(replayEpisode.events, replayEventElapsedMs)
    : false;
  const replayHostDeparted = replayEpisode
    ? replayFaithful
      ? botcastHostHasDepartedAt(replayEpisode.events, replayEventElapsedMs)
      : replayDirectedScene?.participants[replayEpisode.hostBotId]?.present ===
          false ||
        botcastHostHasDepartedAt(replayEpisode.events, replayEventElapsedMs)
    : false;
  const replayListenerReactionPlan =
    replayEpisode && replayActiveMessage
      ? botcastListenerReactionForMessage(
          replayEpisode.events,
          replayActiveMessage.id,
        )
      : null;
  const replayMessageStartMs =
    replayFaithfulBeat?.startMs ??
    replayTimeline.messageStartMs[replayMessageIndex] ??
    0;
  const replayMessageEndMs =
    replayFaithfulBeat?.endMs ??
    replayTimeline.messageEndMs[replayMessageIndex] ??
    replayDurationMs;
  const replayMessageDurationMs = Math.max(
    1,
    replayMessageEndMs - replayMessageStartMs,
  );
  useEffect(() => {
    if (
      !replayProceduralAudioEnabled ||
      !replayPlaying ||
      replayEpisode?.guestKind !== "producer" ||
      replayActiveMessage?.speakerRole !== "guest" ||
      replayActiveMessage.botId !== BOTCAST_PRODUCER_GUEST_ID
    ) {
      return;
    }
    const elapsedMs = Math.max(
      0,
      Math.min(replayMessageDurationMs, replayElapsedMs - replayMessageStartMs),
    );
    const previous = replayProducerGuestActionSfxClockRef.current;
    const rewoundWithinMessage =
      previous?.messageId === replayActiveMessage.id &&
      elapsedMs + 80 < previous.lastElapsedMs;
    const clock =
      previous?.messageId === replayActiveMessage.id && !rewoundWithinMessage
        ? previous
        : {
            messageId: replayActiveMessage.id,
            lastElapsedMs: 0,
            played: false,
          };
    clock.lastElapsedMs = elapsedMs;
    const cueAtMs = bundledActionSfxCueAtMs(
      signalFancyActionCueText(replayActiveMessage.stageActionText) ??
        replayActiveMessage.content,
      replayMessageDurationMs,
    );
    if (!clock.played && cueAtMs !== null && elapsedMs >= cueAtMs) {
      clock.played = true;
      onProducerGuestActionSfx?.(replayActiveMessage);
    }
    replayProducerGuestActionSfxClockRef.current = clock;
  }, [
    onProducerGuestActionSfx,
    replayActiveMessage,
    replayElapsedMs,
    replayEpisode?.guestKind,
    replayMessageDurationMs,
    replayMessageStartMs,
    replayPlaying,
    replayProceduralAudioEnabled,
  ]);
  const replayEphemeralCameraBotId =
    replayEpisode && replayListenerReactionPlan
      ? signalEphemeralSpeechByBotId.has(
          replayListenerReactionPlan.listenerBotId,
        )
        ? replayListenerReactionPlan.listenerBotId
        : signalEphemeralSpeechByBotId.has(
              replayListenerReactionPlan.speakerBotId,
            )
          ? replayListenerReactionPlan.speakerBotId
          : null
      : null;
  const replayReactionShot =
    replayEpisode &&
    !replayFaithful &&
    replayPlaying &&
    botcastCameraModeAt({
      events: replayEpisode.events,
      elapsedMs: replayEventElapsedMs,
    }) === "auto" &&
    replayListenerReactionPlan &&
    replayEphemeralCameraBotId
      ? signalListenerReactionCameraShot({
          cameraCutEligible: replayListenerReactionPlan.cameraCutEligible,
          ephemeralSpeakingShot:
            replayEphemeralCameraBotId === replayEpisode.hostBotId
              ? "left"
              : "right",
          ephemeralSpeechDurationMs:
            signalEphemeralSpeechByBotId.get(replayEphemeralCameraBotId)
              ?.durationMs ?? null,
        })
      : null;
  // Hold wide under the branded card and its dissolve so the establish is what
  // the intro fades into, not a leftover close-up from later speech direction.
  const replayShot =
    replayBookend?.kind === "intro" || replayIntroLandingActive
      ? "wide"
      : replayReactionShot
        ? replayReactionShot
        : replayBaseShot === "auto"
          ? "wide"
          : replayBaseShot;
  useEffect(() => {
    const stage = signalStageRef.current;
    const audio = replayAudioRef.current;
    if (
      !stage ||
      !audio ||
      !replayPlaying ||
      !replayFaithful ||
      !replayPresentationManifestV2 ||
      !selectedShow
    ) {
      return;
    }
    const visualMetadata = replayPresentationManifestV2.visual.metadata;
    const studioLayout = normalizeBotcastStudioLayout(
      visualMetadata?.studioLayout ?? selectedShow.studioLayout,
    );
    const cameraFraming = normalizeBotcastCameraFraming(
      visualMetadata?.cameraFraming ?? selectedShow.cameraFraming,
    );
    const cameraFrame = (shot: SignalDirectedCameraShot) => {
      const frame = cameraFraming[shot];
      return {
        offsetX:
          botcastCameraOffsetXPercent(shot, studioLayout, frame.zoom) +
          frame.panX,
        offsetY:
          botcastCameraOffsetYPercent(shot, studioLayout, frame.zoom) +
          frame.panY,
        zoom: frame.zoom,
      };
    };
    let animationFrame = 0;
    const syncCamera = (): void => {
      const elapsedMs = Math.max(0, audio.currentTime * 1_000);
      const projected = signalReplayCameraClockFrame({
        manifest: replayPresentationManifestV2,
        replayElapsedMs: elapsedMs,
      });
      const holdWide =
        replayBookend?.kind === "intro" || replayIntroLandingActive;
      const from = cameraFrame(
        holdWide ? "wide" : (projected?.fromShot ?? replayShot),
      );
      const to = cameraFrame(
        holdWide ? "wide" : (projected?.toShot ?? replayShot),
      );
      const progress = holdWide ? 1 : (projected?.progress ?? 1);
      stage.style.setProperty(
        "--botcast-camera-offset-x",
        `${from.offsetX + (to.offsetX - from.offsetX) * progress}%`,
      );
      stage.style.setProperty(
        "--botcast-camera-offset-y",
        `${from.offsetY + (to.offsetY - from.offsetY) * progress}%`,
      );
      stage.style.setProperty(
        "--botcast-camera-zoom",
        String(from.zoom + (to.zoom - from.zoom) * progress),
      );
      animationFrame = window.requestAnimationFrame(syncCamera);
    };
    syncCamera();
    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    replayBookend?.kind,
    replayFaithful,
    replayIntroLandingActive,
    replayPlaying,
    replayPresentationManifestV2,
    replayShot,
    selectedShow,
  ]);
  useEffect(() => {
    if (!replayProceduralAudioEnabled) return;
    if (!replayEpisode || !replayActiveMessage) return;
    cacheListenerReactionPlan(replayEpisode, replayActiveMessage);
    const messageStartMs =
      replayTimeline.messageStartMs[replayMessageIndex] ?? 0;
    const messageEndMs =
      replayTimeline.messageEndMs[replayMessageIndex] ?? replayDurationMs;
    const durationMs = Math.max(1, messageEndMs - messageStartMs);
    const elapsedMs = Math.max(0, replayElapsedMs - messageStartMs);
    if (
      !listenerReactionAtMsByMessageIdRef.current.has(replayActiveMessage.id)
    ) {
      armListenerReactionTiming(replayActiveMessage, durationMs);
    }
    if (replayPlaying) {
      fireReplayListenerReaction(replayActiveMessage, elapsedMs, durationMs);
      fireReplayMuteReactions(replayActiveMessage, elapsedMs);
    }
  }, [
    armListenerReactionTiming,
    cacheListenerReactionPlan,
    fireReplayListenerReaction,
    fireReplayMuteReactions,
    replayActiveMessage,
    replayDurationMs,
    replayElapsedMs,
    replayEpisode,
    replayMessageIndex,
    replayPlaying,
    replayProceduralAudioEnabled,
    replayTimeline.messageStartMs,
    replayTimeline.messageEndMs,
  ]);
  useEffect(() => {
    if (!replayProceduralAudioEnabled) return;
    if (!replayPlaying || !replayActiveMessage) return;
    if (replayVoiceMessageIdRef.current === replayActiveMessage.id) return;
    replayVoiceMessageIdRef.current = replayActiveMessage.id;
    let bot =
      replayEpisode?.guestKind === "producer" &&
      replayActiveMessage.speakerRole === "guest" &&
      replayActiveMessage.botId === BOTCAST_PRODUCER_GUEST_ID
        ? signalProducerGuestBotSummary(
            replayEpisode,
            selectedShow?.accentColor,
          )
        : botsById.get(replayActiveMessage.botId);
    if (bot) {
      bot = botWithIdentityBeforeMessage(
        bot,
        replayEpisode!,
        replayActiveMessage,
      );
    }
    if (
      !bot ||
      bot.muted ||
      !botcastMessageIsAudibleToAudienceV1(replayActiveMessage) ||
      botPowerResponseIsSilentV1(replayActiveMessage.content) ||
      !onUtterance
    )
      return;
    const runId = replayVoiceRunIdRef.current + 1;
    replayVoiceRunIdRef.current = runId;
    const messageStartMs =
      replayTimeline.messageStartMs[replayMessageIndex] ?? 0;
    const messageEndMs =
      replayTimeline.messageEndMs[replayMessageIndex] ?? replayDurationMs;
    const replayListenerReactionPlan =
      listenerReactionPlanByMessageIdRef.current.get(replayActiveMessage.id) ??
      botcastListenerReactionForMessage(
        replayEpisode?.events ?? [],
        replayActiveMessage.id,
      );
    const replayPrimarySpokenContent = botCrosstalkPrimarySpeakerContent(
      replayActiveMessage.content,
      replayListenerReactionPlan,
    );
    const replayPlaybackMessage =
      replayPrimarySpokenContent === replayActiveMessage.content
        ? replayActiveMessage
        : { ...replayActiveMessage, content: replayPrimarySpokenContent };
    setReplayVoicePending(true);
    setReplaySpeechActive(false);
    void (async () => {
      try {
        const played = await onUtterance(
          replayPlaybackMessage,
          bot,
          {
            onStart: (durationMs, alignment) => {
              if (replayVoiceRunIdRef.current !== runId) return;
              const plan = replayListenerReactionPlan;
              if (plan) {
                const timelineDurationMs = Math.max(
                  1,
                  messageEndMs - messageStartMs,
                );
                const audioDurationMs = durationMs ?? timelineDurationMs;
                const audioAtMs = resolveListenerReactionAtMs({
                  text: replayActiveMessage.content,
                  durationMs: audioDurationMs,
                  targetProgress: plan.targetProgress,
                  alignment,
                });
                listenerReactionAtMsByMessageIdRef.current.set(
                  replayActiveMessage.id,
                  timelineDurationMs *
                    (audioAtMs / Math.max(1, audioDurationMs)),
                );
              }
              setReplaySpeechActive(true);
            },
            onProgress: (elapsedMs, durationMs) => {
              if (replayVoiceRunIdRef.current !== runId) return;
              const progress = Math.max(
                0,
                Math.min(1, elapsedMs / Math.max(1, durationMs)),
              );
              setReplayElapsedMs(
                messageStartMs + (messageEndMs - messageStartMs) * progress,
              );
            },
            onEnd: () => {
              if (replayVoiceRunIdRef.current !== runId) return;
              setReplaySpeechActive(false);
            },
          },
          botcastVoiceLevelForBot(selectedShow?.voiceLevelsByBotId, bot.id),
          signalStudioVoicePan(
            selectedShow?.studioLayout,
            replayActiveMessage.speakerRole,
          ),
        );
        if (replayVoiceRunIdRef.current !== runId) return;
        if (played) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 280));
          if (replayVoiceRunIdRef.current !== runId) return;
          setReplayElapsedMs(messageEndMs);
          if (messageEndMs >= replayDurationMs) setReplayPlaying(false);
        }
      } catch {
        // Replay falls back to its saved director clock when speech is unavailable.
      } finally {
        if (replayVoiceRunIdRef.current === runId) {
          setReplaySpeechActive(false);
          setReplayVoicePending(false);
        }
      }
    })();
  }, [
    botsById,
    armListenerReactionTiming,
    onUtterance,
    replayActiveMessage,
    replayDurationMs,
    replayMessageIndex,
    replayPlaying,
    replayProceduralAudioEnabled,
    replayEpisode,
    replayTimeline.messageStartMs,
    replayTimeline.messageEndMs,
    selectedShow,
  ]);
  useEffect(() => {
    if (replayEpisode) return;
    replayVoiceMessageIdRef.current = null;
  }, [replayEpisode]);

  const refreshReplayRecording = useCallback(async (): Promise<void> => {
    if (!replayEpisode) return;
    const recording = await replayRecordingForSource(
      "signal",
      replayEpisode.id,
    );
    if (!recording) return;
    const detail = await replayRecordingDetail(recording.id);
    setReplayRecording(detail.recording);
  }, [replayEpisode]);

  useEffect(() => {
    if (!replayRecordingId) return;
    let cancelled = false;
    const refreshEligibility = (): void => {
      void replayStudioCutEligibility(replayRecordingId)
        .then((eligibility) => {
          if (!cancelled) setStudioCutEligibilityState(eligibility);
        })
        .catch(() => {
          if (!cancelled) setStudioCutEligibilityState(null);
        });
    };
    refreshEligibility();
    const timer = window.setInterval(refreshEligibility, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [replayRecordingId]);

  useEffect(() => {
    if (!replayEpisode) return;
    const refresh = (): void => {
      void refreshReplayRecording();
    };
    window.addEventListener(REPLAY_RECORDING_CHANGED_EVENT, refresh);
    const timer = window.setInterval(
      () => void refreshReplayRecording(),
      3_000,
    );
    return () => {
      window.removeEventListener(REPLAY_RECORDING_CHANGED_EVENT, refresh);
      window.clearInterval(timer);
    };
  }, [refreshReplayRecording, replayEpisode]);

  const requestStudioCut = async (
    intent: ReplayPremiumAudioActionV1,
  ): Promise<void> => {
    if (!replayRecording || studioCutBusy) return;
    setStudioCutBusy(true);
    setStudioCutRequestPhase("checking");
    try {
      const eligibility = await replayStudioCutEligibility(replayRecording.id);
      setStudioCutEligibilityState(eligibility);
      if (!eligibility.eligible || eligibility.recommendedAction !== intent) {
        setError(
          signalErrorToast(
            intent === "repair" ? "Repair voice" : "Upgrade voices",
            new Error(
              eligibility.blockedReason ?? "Premium audio is unavailable.",
            ),
          ),
        );
        return;
      }
      setStudioCutConfirmation({
        kind: "generate",
        recordingId: replayRecording.id,
        intent,
        eligibility,
      });
    } catch (studioCutError) {
      setError(
        signalErrorToast(
          intent === "repair" ? "Repair voice" : "Upgrade voices",
          studioCutError,
        ),
      );
    } finally {
      setStudioCutRequestPhase(null);
      setStudioCutBusy(false);
    }
  };

  const confirmStudioCut = async (): Promise<void> => {
    if (
      !studioCutConfirmation ||
      studioCutConfirmation.kind !== "generate" ||
      studioCutBusy
    ) {
      return;
    }
    const { recordingId, intent } = studioCutConfirmation;
    setStudioCutConfirmation(null);
    setStudioCutBusy(true);
    setStudioCutRequestPhase("starting");
    try {
      const recording = await startReplayStudioCut(recordingId, intent);
      setReplayRecording(recording);
    } catch (studioCutError) {
      setError(
        signalErrorToast(
          intent === "repair" ? "Repair voice" : "Upgrade voices",
          studioCutError,
        ),
      );
    } finally {
      setStudioCutRequestPhase(null);
      setStudioCutBusy(false);
    }
  };

  const remixStudioCut = async (): Promise<void> => {
    if (!replayRecording || studioCutBusy || !studioCut?.masterReady) {
      return;
    }
    setStudioCutBusy(true);
    setStudioCutRequestPhase("retrying");
    try {
      setReplayRecording(await retryReplayStudioCutMix(replayRecording.id));
    } catch (studioCutError) {
      setError(signalErrorToast("Finish Premium audio", studioCutError));
    } finally {
      setStudioCutRequestPhase(null);
      setStudioCutBusy(false);
    }
  };

  const removeStudioCut = async (): Promise<void> => {
    if (!replayRecording || studioCutBusy) return;
    setStudioCutConfirmation({
      kind: "remove",
      recordingId: replayRecording.id,
    });
  };

  const confirmRemoveStudioCut = async (): Promise<void> => {
    if (
      !studioCutConfirmation ||
      studioCutConfirmation.kind !== "remove" ||
      studioCutBusy
    ) {
      return;
    }
    const { recordingId } = studioCutConfirmation;
    setStudioCutConfirmation(null);
    setStudioCutBusy(true);
    try {
      stopReplayPlayback();
      setReplayPlaybackSource("on-air");
      premiumAutoSelectionRef.current = null;
      setReplayRecording(await removeReplayStudioCut(recordingId));
    } catch (studioCutError) {
      setError(signalErrorToast("Remove Premium version", studioCutError));
    } finally {
      setStudioCutBusy(false);
    }
  };

  const stopReplayPlayback = (): void => {
    replayVoiceRunIdRef.current += 1;
    replayVoiceMessageIdRef.current = null;
    const replayAudio = replayAudioRef.current;
    if (replayAudio) {
      void releaseAudibleAudioElement(replayAudio, { durationMs: 0 });
      const stoppedAtMs = Math.max(
        0,
        Math.min(replayDurationMs, Math.round(replayAudio.currentTime * 1_000)),
      );
      replayPublishedElapsedMsRef.current = stoppedAtMs;
      setReplayElapsedMs(stoppedAtMs);
      // Pause is a transport boundary, not a state-exit tail. Halting the
      // media synchronously prevents a busy archive frame from letting audio
      // run ahead while the last CRT speaking/glow state remains frozen.
    }
    setReplayPlaying(false);
    setReplayVoicePending(false);
    setReplaySpeechActive(false);
    onStopUtterance?.();
  };

  const seekFaithfulReplay = (nextMs: number): void => {
    if (!replayFaithful) return;
    stopReplayPlayback();
    const boundedMs = Math.max(0, Math.min(replayDurationMs, nextMs));
    replayPublishedElapsedMsRef.current = boundedMs;
    setReplayElapsedMs(boundedMs);
    const audio = replayAudioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = boundedMs / 1_000;
    } catch {
      // The state seek remains authoritative until audio metadata is ready.
    }
  };

  const startReplayPlayback = (startAtMs?: number): void => {
    replayVoiceRunIdRef.current += 1;
    onPrepareUtterance?.();
    replayVoiceMessageIdRef.current = null;
    setReplaySpeechActive(false);
    const restartFromBeginning =
      startAtMs !== undefined || replayElapsedMs >= replayDurationMs;
    const nextMs =
      startAtMs === undefined
        ? restartFromBeginning
          ? 0
          : replayElapsedMs
        : Math.max(0, Math.min(replayDurationMs, startAtMs));
    if (restartFromBeginning) {
      replayPublishedElapsedMsRef.current = nextMs;
      setReplayElapsedMs(nextMs);
    }
    const audio = replayAudioRef.current;
    if (audio) {
      cancelAudibleAudioRelease(audio, 1);
      try {
        audio.currentTime = nextMs / 1_000;
      } catch {
        // Seeking before metadata is ready can throw; canplay retries below.
      }
      audio.playbackRate = 1;
      // Start inside the user gesture so the first Play is not blocked.
      void audio.play().catch(() => undefined);
    }
    setReplayIntroRevealed(true);
    setReplayPlaying(true);
  };

  const renderAtmosphereMixer = (show: BotcastShow): React.JSX.Element => {
    const defaultMix = DEFAULT_SIGNAL_ATMOSPHERE_MIX;
    const mix = normalizeBotcastStudioAtmosphereMix(show.atmosphereMix);
    const isDefaultMix = SIGNAL_ATMOSPHERE_BUSES.every(
      ({ key }) => mix[key] === defaultMix[key],
    );
    return (
      <aside
        className={styles.atmosphereMixer}
        data-signal-atmosphere-mixer="true"
        aria-label={`Signal atmosphere mixer for ${show.name}`}
      >
        <div className={styles.atmosphereMixerHeader}>
          <div>
            <span className={styles.eyebrow}>Show mix</span>
            <strong>Studio atmosphere layers</strong>
          </div>
          <small>
            Master {Math.round(introAudioVolume * 100)}% ·{" "}
            {studioAtmosphereMixSaving ? "saving…" : "saved for this show"}
          </small>
          <button
            type="button"
            onClick={() =>
              updateStudioAtmosphereMix(show, {
                ...DEFAULT_SIGNAL_ATMOSPHERE_MIX,
              })
            }
            disabled={isDefaultMix}
          >
            Reset
          </button>
        </div>
        <div className={styles.atmosphereMixerSliders}>
          {SIGNAL_ATMOSPHERE_BUSES.map(({ key, label }) => {
            const relativeLevel = signalAtmosphereRelativeMixLevel(key, mix);
            return (
              <label key={key}>
                <span>
                  {label}
                  <output>{Math.round(relativeLevel * 100)}%</output>
                </span>
                <input
                  type="range"
                  min={0}
                  max={SIGNAL_ATMOSPHERE_RELATIVE_MIX_MAX}
                  step={SIGNAL_ATMOSPHERE_RELATIVE_MIX_STEP}
                  value={relativeLevel}
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    if (!Number.isFinite(value)) return;
                    updateStudioAtmosphereMix(show, {
                      ...mix,
                      [key]: signalAtmosphereMixLevelFromRelative(key, value),
                    });
                  }}
                  aria-label={`${label} level`}
                />
              </label>
            );
          })}
        </div>
        {!introAudioEnabled ? (
          <small>Turn voice audio on to audition this mix.</small>
        ) : null}
      </aside>
    );
  };

  const runStudioSoundcheck = async (
    show: BotcastShow,
    host: BotcastBotSummary,
    guest: BotcastBotSummary,
  ): Promise<void> => {
    if (!onUtterance || !introAudioEnabled) return;
    stopStudioSoundcheck();
    const runId = studioSoundcheckRunIdRef.current + 1;
    studioSoundcheckRunIdRef.current = runId;
    const messages = signalStageSoundcheckMessages({
      showId: show.id,
      hostBotId: host.id,
      hostName: host.name,
      guestBotId: guest.id,
      guestName: guest.name,
      runId,
    });
    const botsByRole = { host, guest } as const;
    setError(null);
    setStudioSoundcheckRunning(true);
    onPrepareUtterance?.();
    try {
      for (const message of messages) {
        if (studioSoundcheckRunIdRef.current !== runId) return;
        const bot = botsByRole[message.speakerRole];
        if (bot.muted) continue;
        setStudioSoundcheckCaption({
          speakerName: bot.name,
          text: message.content,
        });
        const played = await onUtterance(
          message,
          bot,
          {
            onStart: (durationMs, alignment) => {
              if (studioSoundcheckRunIdRef.current !== runId) return;
              const resolvedDurationMs =
                durationMs ?? Math.max(720, message.content.length * 34);
              setStudioSoundcheckSpeakerBotId(bot.id);
              setStudioSoundcheckSpeech({
                botId: bot.id,
                text: message.content,
                elapsedMs: 0,
                durationMs: resolvedDurationMs,
                alignment: alignment ?? null,
              });
            },
            onProgress: (elapsedMs, durationMs) => {
              if (studioSoundcheckRunIdRef.current !== runId) return;
              setStudioSoundcheckSpeech((current) =>
                current?.botId === bot.id
                  ? { ...current, elapsedMs, durationMs }
                  : current,
              );
            },
            onEnd: () => {
              if (studioSoundcheckRunIdRef.current !== runId) return;
              setStudioSoundcheckSpeakerBotId(null);
              setStudioSoundcheckSpeech(null);
            },
          },
          botcastVoiceLevelForBot(show.voiceLevelsByBotId, bot.id),
          signalStudioVoicePan(show.studioLayout, message.speakerRole),
        );
        if (studioSoundcheckRunIdRef.current !== runId) return;
        setStudioSoundcheckSpeakerBotId(null);
        setStudioSoundcheckSpeech(null);
        if (!played) {
          setError(
            signalErrorToast(
              "Run stage voice check",
              "Signal could not play the stage voice check.",
              "audio playback",
            ),
          );
          return;
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
      }
    } finally {
      if (studioSoundcheckRunIdRef.current === runId) {
        setStudioSoundcheckRunning(false);
        setStudioSoundcheckSpeakerBotId(null);
        setStudioSoundcheckSpeech(null);
      }
    }
  };

  const renderStage = (args: {
    show: BotcastShow;
    currentEpisode: BotcastEpisode;
    host: BotcastBotSummary | null;
    guest: BotcastBotSummary | null;
    shot: "left" | "right" | "wide";
    activeMessage: BotcastMessage | null;
    replay: boolean;
    guestDeparted?: boolean;
    hostDeparted?: boolean;
  }): React.JSX.Element => {
    const latestStageImageContext = botcastLatestImageContextV1(
      args.currentEpisode.events,
    );
    const stageImageContext = args.activeMessage
      ? botcastImageContextForMessageV1(
          args.currentEpisode.events,
          args.activeMessage.id,
        )
      : latestStageImageContext?.phase === "presented" ||
          latestStageImageContext?.phase === "discussing"
        ? latestStageImageContext
        : null;
    const stageEpisodeImage =
      signalEpisodeImage?.episodeId === args.currentEpisode.id &&
      signalEpisodeImage.imageId === stageImageContext?.imageId
        ? signalEpisodeImage
        : null;
    const stageImageVisible = signalEpisodeImageIsVisible({
      hasImageContext: stageImageContext !== null,
      replay: args.replay,
      activeMessageId: args.activeMessage?.id ?? null,
      speakingMessageId,
    });
    const stageCameraTransitionMode =
      args.replay && replayFaithful && replayPresentationManifestV2
        ? "instant"
        : args.replay && replayFaithful
          ? replayCameraTransitionModeV2(replayCameraDirectedScene)
        : liveCameraTransitionMode;
    const recordedGuestDeparture =
      args.guestDeparted ?? guestHasDeparted(args.currentEpisode);
    const recordedHostDeparture =
      args.hostDeparted ?? hostHasDeparted(args.currentEpisode);
    const guestDepartureMonologueOnMic =
      !args.replay &&
      recordedGuestDeparture &&
      args.activeMessage?.speakerRole === "guest" &&
      speakingMessageId === args.activeMessage.id;
    const hostDepartureMonologueOnMic =
      !args.replay &&
      recordedHostDeparture &&
      args.activeMessage?.speakerRole === "host" &&
      speakingMessageId === args.activeMessage.id;
    const guestDeparted =
      recordedGuestDeparture && !guestDepartureMonologueOnMic;
    const hostDeparted = recordedHostDeparture && !hostDepartureMonologueOnMic;
    const audienceParticipants =
      args.currentEpisode.audienceExperience?.participants;
    const socialPressure = botcastStrongestNegativeSocialInfluenceAt({
      events: args.currentEpisode.events,
      elapsedMs: args.replay ? replayEventElapsedMs : Number.POSITIVE_INFINITY,
    });
    const socialPressureSource = socialPressure
      ? socialPressure.sourceRole === "host"
        ? args.host
        : args.guest
      : null;
    const hostVisibleToAudience =
      !hostDeparted && audienceParticipants?.host.visible !== false;
    const guestVisibleToAudience =
      !guestDeparted && audienceParticipants?.guest.visible !== false;
    const guestHiddenFromAudience = !guestDeparted && !guestVisibleToAudience;
    const guestPresentOnStage = guestVisibleToAudience;
    const signalStageVisibleBotCount =
      Number(Boolean(args.host && hostVisibleToAudience)) +
      Number(Boolean(args.guest && guestPresentOnStage));
    const signalStageBotVisualQuality = signalAvatarPresentation({
      live: !args.replay,
    });
    const pendingCrosstalkReclaim = botcastPendingCrosstalkReclaimV1(
      args.currentEpisode.messages,
    );
    const thinkingRole = pendingCrosstalkReclaim
      ? pendingCrosstalkReclaim.speakerBotId === args.currentEpisode.hostBotId
        ? "host"
        : "guest"
      : botcastNextSpeakerRole({
          messages: args.currentEpisode.messages,
          segment: args.currentEpisode.segment,
          guestDeparted,
        });
    const replayProducerGuestThinking = Boolean(
      args.replay &&
        args.currentEpisode.guestKind === "producer" &&
        (replayFaithful
          ? replayDirectedScene?.participants["prism-player"]?.thinking === true
          : replayTimeline.thinkingRanges.some(
              (range) =>
              replayElapsedMs >= range.startMs && replayElapsedMs < range.endMs,
            )),
    );
    const liveProducerGuestThinking = Boolean(
      !args.replay &&
        args.currentEpisode.guestKind === "producer" &&
        args.currentEpisode.status === "live" &&
        !busy &&
        speakingMessageId === null &&
        thinkingRole === "guest",
    );
    const stageTheme =
      args.replay && replayPresentationManifestV2?.visual.theme
        ? replayPresentationManifestV2.visual.theme
        : theme;
    const replayVisualMetadata = args.replay
      ? replayPresentationManifestV2?.visual.metadata
      : undefined;
    const currentStageAtmosphere = activeShowAtmosphere(args.show, stageTheme);
    const stageAtmosphere =
      args.replay && replayPresentationManifestV2
        ? {
            ...currentStageAtmosphere,
            imageUrl: replayPresentationManifestV2.visual.atmosphereImageUrl,
            microphoneTintMaskUrl:
              typeof replayVisualMetadata?.microphoneTintMaskUrl === "string"
                ? replayVisualMetadata.microphoneTintMaskUrl
                : null,
          }
        : currentStageAtmosphere;
    const studioMix = normalizeBotcastStudioAtmosphereMix(
      replayVisualMetadata?.atmosphereMix ?? args.show.atmosphereMix,
    );
    const studioLayout = normalizeBotcastStudioLayout(
      replayVisualMetadata?.studioLayout ?? args.show.studioLayout,
    );
    const cameraFraming = normalizeBotcastCameraFraming(
      args.replay
        ? replayVisualMetadata?.cameraFraming ?? args.show.cameraFraming
        : signalEpisodeCameraFramingSnapshotRef.current.get(
              args.currentEpisode.id,
            ) ?? args.show.cameraFraming,
    );
    const activeCameraFrame = cameraFraming[args.shot];
    const replayCameraClockFrame =
      args.replay && replayFaithful && replayPresentationManifestV2
        ? signalReplayCameraClockFrame({
            manifest: replayPresentationManifestV2,
            replayElapsedMs,
          })
        : null;
    const replayCameraProjection =
      replayCameraClockFrame?.toShot === args.shot &&
      replayBookend?.kind !== "intro" &&
      !replayIntroLandingActive
        ? replayCameraClockFrame
        : null;
    const cameraFrameForShot = (
      shot: SignalDirectedCameraShot,
    ): { offsetX: number; offsetY: number; zoom: number } => {
      const frame = cameraFraming[shot];
      return {
        offsetX:
          botcastCameraOffsetXPercent(shot, studioLayout, frame.zoom) +
          frame.panX,
        offsetY:
          botcastCameraOffsetYPercent(shot, studioLayout, frame.zoom) +
          frame.panY,
        zoom: frame.zoom,
      };
    };
    const targetCameraFrame = {
      offsetX:
        botcastCameraOffsetXPercent(
          args.shot,
          studioLayout,
          activeCameraFrame.zoom,
        ) + activeCameraFrame.panX,
      offsetY:
        botcastCameraOffsetYPercent(
          args.shot,
          studioLayout,
          activeCameraFrame.zoom,
        ) + activeCameraFrame.panY,
      zoom: activeCameraFrame.zoom,
    };
    const projectedCameraFrame = replayCameraProjection
      ? (() => {
          const from = cameraFrameForShot(replayCameraProjection.fromShot);
          const progress = replayCameraProjection.progress;
          return {
            offsetX:
              from.offsetX +
              (targetCameraFrame.offsetX - from.offsetX) * progress,
            offsetY:
              from.offsetY +
              (targetCameraFrame.offsetY - from.offsetY) * progress,
            zoom:
              from.zoom +
              (targetCameraFrame.zoom - from.zoom) * progress,
          };
        })()
      : targetCameraFrame;
    const stageVisualShow: BotcastShow =
      args.replay && replayPresentationManifestV2
        ? {
            ...args.show,
            studioGlowTuning: normalizeBotcastStudioGlowTuning(
              replayVisualMetadata?.studioGlowTuning,
              args.show.studioGlowTuning,
            ),
            studioLighting:
              replayVisualMetadata?.studioLighting &&
              typeof replayVisualMetadata.studioLighting === "object" &&
              !Array.isArray(replayVisualMetadata.studioLighting)
                ? (replayVisualMetadata.studioLighting as BotcastShow["studioLighting"])
                : args.show.studioLighting,
            logoPlacement: normalizeBotcastLogoPlacement(
              replayVisualMetadata?.logoPlacement,
              args.show.logoPlacement,
            ),
            logo:
              typeof replayVisualMetadata?.logoImageUrl === "string"
                ? {
                    ...args.show.logo,
                    imageUrl: replayVisualMetadata.logoImageUrl,
                  }
                : args.show.logo,
          }
        : args.show;
    const stageAccentColor =
      args.replay && replayPresentationManifestV2?.visual.accentColor
        ? replayPresentationManifestV2.visual.accentColor
        : args.show.accentColor;
    /**
     * Captions were tinted with `--botcast-studio-accent`, which is the host's
     * colour for every speaker — so a guest's line wore the host's phosphor all
     * episode. Give each caption the colour of whoever is actually talking.
     */
    const captionAccentForRole = (
      role: "host" | "guest" | null,
    ): string =>
      normalizeAccentForTheme(
        (role === "guest" ? args.guest?.color : args.host?.color) ??
          stageAccentColor,
        stageTheme,
      );
    const captionAccentForBotId = (botId: string | null): string =>
      captionAccentForRole(
        botId && botId === args.currentEpisode.guestBotId ? "guest" : "host",
      );
    const replayMessageStartMs =
      replayFaithfulBeat?.startMs ??
      replayTimeline.messageStartMs[replayMessageIndex] ??
      0;
    const replayMessageEndMs =
      replayFaithfulBeat?.endMs ??
      replayTimeline.messageEndMs[replayMessageIndex] ??
      replayDurationMs;
    const speechReveal =
      !args.replay &&
      args.activeMessage &&
      liveSpeech?.messageId === args.activeMessage.id
        ? liveSpeech.reveal
        : null;
    const projectedLiveSpeechElapsedMs =
      !args.replay && speechReveal
        ? signalLiveSpeechProjectedElapsedMs({
            liveSpeech,
            clock: signalLiveSpeechPlaybackClockRef.current,
            nowMs: 0,
          })
        : 0;
    const projectedSpeechReveal =
      !args.replay && speechReveal?.phase === "playing"
        ? updateBotcastSpeechReveal(
            speechReveal,
            projectedLiveSpeechElapsedMs,
          )
        : speechReveal;
    const activeMessageIsSocialSilence = Boolean(
      args.activeMessage &&
        socialSilenceMessageIsMarkedV1({
          content: args.activeMessage.content,
          marker: args.activeMessage.socialSilence,
          mode: "signal",
        }),
    );
    const delayedLiveCaption =
      args.replay && activeMessageIsSocialSilence
        ? replayPlaying &&
          replayCapturedPresentationElapsedMs >= replayMessageStartMs &&
          replayCapturedPresentationElapsedMs < replayMessageEndMs
          ? "..."
          : ""
        : !args.replay &&
            args.activeMessage &&
            projectedSpeechReveal?.phase === "playing" &&
            (botcastMessageIsAudibleToAudienceV1(args.activeMessage) ||
              Boolean(args.activeMessage.mutePerformance))
          ? signalLiveCaptionText(projectedSpeechReveal, args.activeMessage)
          : "";
    const delayedLiveCaptionSpeaker =
      args.activeMessage?.speakerRole === "host"
        ? (args.host?.name ?? "Host")
        : args.activeMessage?.speakerRole === "guest"
          ? (args.guest?.name ?? "Guest")
          : null;
    const producerGuestHostPromptMessage =
      !args.replay &&
      !liveConversationPanelExpanded &&
      args.currentEpisode.guestKind === "producer" &&
      args.currentEpisode.status === "live" &&
      args.activeMessage === null &&
      thinkingRole === "guest"
        ? args.currentEpisode.messages.findLast(
            (message) =>
              message.speakerRole === "host" &&
              botcastMessageIsAudibleToAudienceV1(message) &&
              !socialSilenceMessageIsMarkedV1({
                content: message.content,
                marker: message.socialSilence,
                mode: "signal",
              }) &&
              signalVoicePerformanceTranscriptText(message).trim() !== "" &&
              !botPowerResponseIsSilentV1(
                signalVoicePerformanceTranscriptText(message),
              ),
          )
        : undefined;
    const producerGuestHostPromptText = producerGuestHostPromptMessage
      ? signalVoicePerformanceTranscriptText(
          producerGuestHostPromptMessage,
        ).trim()
      : "";
    // Debate's caption paging is the source of truth for how much subtitle
    // text stays on screen at once; Signal shows the same current page
    // instead of stacking the whole revealed prefix.
    const delayedLiveCaptionPage = signalLiveCaptionPage(delayedLiveCaption);
    const producerGuestHostPromptPage = signalLiveCaptionPage(
      producerGuestHostPromptText,
    );
    const presenceBeatCaptionPage = signalLiveCaptionPage(
      presenceBeat?.surface === "signal" &&
        presenceBeat.completion === "playing"
        ? presenceBeat.text.slice(0, presenceBeat.heardCharacterCount)
        : "",
    );
    // Saved reaction and interruption speech is ordinary dialogue, not an
    // action card. The lifecycle only becomes active when its voice begins,
    // so this cannot create a caption or a thinking state while preloading.
    const liveReactionCaption = [...signalEphemeralSpeechByBotId.entries()]
      .map(([botId, speech]) => ({ botId, speech }))
      .find(({ speech }) => speech.channel === "crosstalk") ??
      [...signalEphemeralSpeechByBotId.entries()]
        .map(([botId, speech]) => ({ botId, speech }))
        .at(0) ??
      null;
    const speechElapsedMs = args.replay
      ? Math.max(0, replayCapturedPresentationElapsedMs - replayMessageStartMs)
      : projectedLiveSpeechElapsedMs;
    const speechDurationMs = args.replay
      ? Math.max(1, replayMessageEndMs - replayMessageStartMs)
      : (speechReveal?.durationMs ?? 0);
    const speechProgress = Math.max(
      0,
      Math.min(1, speechElapsedMs / Math.max(1, speechDurationMs)),
    );
    const speechIsPlaying = args.replay
      ? replayPlaying &&
        (replayFaithful
          ? Boolean(
              replayFaithfulBeat &&
              replayFaithfulBeat.sourceMessageId === args.activeMessage?.id,
            )
          : replaySpeechActive)
      : speechReveal?.phase === "playing";
    const activeOrganicVoicePerformance = args.activeMessage
      ? botcastVoicePerformanceForMessageV2(
          args.currentEpisode.events,
          args.activeMessage.id,
        )
      : null;
    const replayHesitationCaption = args.replay &&
        activeOrganicVoicePerformance?.hesitation &&
        speechIsPlaying &&
        speechProgress >=
          activeOrganicVoicePerformance.hesitation.sourceProgress &&
        speechProgress <=
          activeOrganicVoicePerformance.hesitation.sourceProgress + 0.08
      ? activeOrganicVoicePerformance.hesitation.caption ?? "…"
      : null;
    const performanceCaptionText =
      (!args.replay &&
        args.activeMessage &&
        signalPerformanceCaption?.messageId === args.activeMessage.id
        ? signalPerformanceCaption.text
        : null) ?? replayHesitationCaption;
    const activeStudioIncident = args.activeMessage
      ? botcastStudioIncidentForMessageV1(
          args.currentEpisode.events,
          args.activeMessage.id,
        )
      : null;
    const studioIncidentCaption = activeStudioIncident && speechIsPlaying
      ? signalStudioIncidentCaptionAtProgressV1({
          incident: activeStudioIncident,
          progress: speechProgress,
        })
      : null;
    const studioIncidentCaptionText = studioIncidentCaption?.text ?? null;
    const organicCaptionText =
      performanceCaptionText ?? studioIncidentCaptionText;
    const studioDialogueCaptionOwnsFloor = Boolean(
      !performanceCaptionText && studioIncidentCaption?.kind === "dialogue",
    );
    const organicCaptionPresentation = signalOrganicCaptionPresentationV1(
      organicCaptionText,
    );
    const muteElapsedStageCueVisible = Boolean(
      args.activeMessage?.mutePerformance &&
        speechIsPlaying &&
        speechElapsedMs >= args.activeMessage.mutePerformance.durationMs,
    );
    const activeVoiceAction =
      args.activeMessage && (args.replay || speechReveal)
        ? signalVoicePerformanceActionPresentationAtProgress(
            args.activeMessage,
            speechProgress,
          )
        : null;
    const producerStageGesture =
      args.currentEpisode.guestKind === "producer" &&
      args.activeMessage?.speakerRole === "guest" &&
      args.activeMessage.botId === BOTCAST_PRODUCER_GUEST_ID &&
      args.activeMessage.stageActionText &&
      (args.replay || speechReveal)
        ? classifySignalFancyActionV1(args.activeMessage.stageActionText)
            ?.avatarReaction ?? null
        : null;
    const listenerReactionPlan = args.activeMessage
      ? (listenerReactionPlanByMessageIdRef.current.get(
          args.activeMessage.id,
        ) ??
        botcastListenerReactionForMessage(
          args.currentEpisode.events,
          args.activeMessage.id,
        ))
      : null;
    const listenerReactionAtMs =
      args.activeMessage && listenerReactionPlan
        ? (listenerReactionAtMsByMessageIdRef.current.get(
            args.activeMessage.id,
          ) ??
          resolveListenerReactionAtMs({
            text: args.activeMessage.content,
            durationMs: Math.max(1, speechDurationMs),
            targetProgress: listenerReactionPlan.targetProgress,
          }))
        : null;
    const listenerReactionActive = Boolean(
      listenerReactionPlan &&
      listenerReactionAtMs !== null &&
      speechIsPlaying &&
      speechElapsedMs >= listenerReactionAtMs &&
      speechElapsedMs <=
        Math.min(
          speechDurationMs,
          listenerReactionAtMs +
            (listenerReactionPlan.interjectionAttempt ? 1_600 : 1_200),
        ),
    );
    const studioActionBeat = activeStudioIncident && speechIsPlaying
      ? (activeStudioIncident.beats.findLast(
          (beat) =>
            beat.kind === "action" &&
            speechProgress >= beat.atProgress &&
            speechProgress <= Math.min(1, beat.atProgress + 0.14),
        ) as Extract<SignalStudioIncidentBeatV1, { kind: "action" }> | undefined) ??
        null
      : null;
    const muteReactionBeat =
      args.activeMessage?.mutePerformance &&
      (args.replay ? replayPlaying : speechIsPlaying)
        ? (args.activeMessage.mutePerformance.reactionBeats.findLast(
            (beat) =>
              speechElapsedMs >= beat.atMs &&
              speechElapsedMs <=
                Math.min(
                  args.activeMessage!.mutePerformance!.durationMs,
                  beat.atMs + SIGNAL_MUTE_REACTION_HOLD_MS,
                ),
          ) ?? null)
        : null;
    const roleIsListenerReacting = (role: "host" | "guest"): boolean =>
      Boolean(
        (studioActionBeat?.actorBotId ??
          muteReactionBeat?.reactorBotId ??
          (listenerReactionActive
            ? listenerReactionPlan?.listenerBotId
            : null)) ===
          (role === "host" ? args.host?.id : args.guest?.id),
      );
    const listenerReactionActionForRole = (): string | null =>
      studioActionBeat
        ? studioActionBeat.action === "lean_in"
          ? "lean_in"
          : studioActionBeat.action === "adjust_headphones"
            ? "head_tilt"
            : "nod"
        : muteReactionBeat
        ? signalMuteReactionActionLabel(muteReactionBeat.action)
        : listenerReactionPlan
          ? listenerReactionActionLabel(listenerReactionPlan.visualAction)
          : null;
    const listenerReactionTextForRole = (voiceMuted: boolean): string | null => {
      if (muteReactionBeat) {
        if (
          (muteReactionBeat.kind === "audible_quip" ||
            muteReactionBeat.kind === "interrupt") &&
          muteReactionBeat.quip
        ) {
          return muteReactionBeat.quip;
        }
        if (muteReactionBeat.kind === "lung_foley") {
          return muteReactionBeat.foley === "whistle"
            ? "*whistles*"
            : muteReactionBeat.foley === "gasp"
              ? "*gasps*"
              : "*sighs*";
        }
        return signalMuteReactionActionLabel(muteReactionBeat.action);
      }
      return (
        (voiceMuted && listenerReactionPlan
          ? null
          : listenerReactionPlan
            ? listenerReactionSpokenTextV1(listenerReactionPlan)
            : null) ??
        (listenerReactionPlan
          ? listenerReactionActionLabel(listenerReactionPlan.visualAction)
          : null)
      );
    };
    const replayParticipantIdForRole = (role: "host" | "guest"): string =>
      role === "host"
        ? args.currentEpisode.hostBotId
        : args.currentEpisode.guestKind === "producer"
          ? "prism-player"
          : args.currentEpisode.guestBotId;
    const roleIsSpeaking = (role: "host" | "guest"): boolean => {
      const roleBotId =
        role === "host"
          ? args.currentEpisode.hostBotId
          : args.currentEpisode.guestBotId;
      if (
        presenceBeat?.surface === "signal" &&
        presenceBeat.sessionId === args.currentEpisode.id &&
        presenceBeat.completion === "playing" &&
        presenceBeat.speaker.botId === roleBotId
      ) {
        return true;
      }
      if (signalEphemeralSpeakingBotIds.has(roleBotId)) return true;
      const directedParticipant =
        replayDirectedScene?.participants[replayParticipantIdForRole(role)];
      if (args.replay && replayFaithful && directedParticipant) {
        const activeMessageAllowsSpeech =
          args.activeMessage?.speakerRole !== role ||
          (botcastMessageIsAudibleToAudienceV1(args.activeMessage) &&
            !botPowerResponseIsSilentV1(args.activeMessage.content));
        return Boolean(
          replayPlaying &&
            directedParticipant.speaking === true &&
            directedParticipant.audible !== false &&
            activeMessageAllowsSpeech,
        );
      }
      if (args.replay) {
        return Boolean(
          speechIsPlaying &&
            botcastMessageIsAudibleToAudienceV1(args.activeMessage ?? {}) &&
            !botPowerResponseIsSilentV1(args.activeMessage?.content) &&
            args.activeMessage?.speakerRole === role,
        );
      }
      return signalLivePrimaryAvatarSpeech({
        liveSpeech: speechReveal ? liveSpeech : null,
        role,
        elapsedMs: projectedLiveSpeechElapsedMs,
      }).talking;
    };
    const roleSpeechActive = (role: "host" | "guest"): boolean => {
      const roleBotId =
        role === "host"
          ? args.currentEpisode.hostBotId
          : args.currentEpisode.guestBotId;
      if (
        presenceBeat?.surface === "signal" &&
        presenceBeat.sessionId === args.currentEpisode.id &&
        presenceBeat.completion === "playing" &&
        presenceBeat.speaker.botId === roleBotId
      ) return true;
      if (signalEphemeralSpeakingBotIds.has(roleBotId)) return true;
      if (args.replay && replayFaithful && replayPresentationManifestV2) {
        const captured = replaySpeechActivityAtV2(
          replayPresentationManifestV2,
          replayParticipantIdForRole(role),
          replayCapturedPresentationElapsedMs,
        );
        if (captured !== null) return replayPlaying && captured;
      }
      if (args.replay) {
        const isAudibleSpeaker = Boolean(
          speechIsPlaying &&
            args.activeMessage?.speakerRole === role &&
            botcastMessageIsAudibleToAudienceV1(args.activeMessage ?? {}) &&
            !botPowerResponseIsSilentV1(args.activeMessage?.content),
        );
        if (!isAudibleSpeaker) return false;
        // Older faithful recordings predate the captured semantic track.
        // Preserve their fallback while deriving phrase rests from the same
        // bounded cadence envelope rather than from closed visemes.
        return (
          speechActivityAtMs(
            buildSpeechActivityWindowsFromTextCadence(
              args.activeMessage?.content ?? "",
              speechDurationMs,
            ),
            speechElapsedMs,
          ) ?? true
        );
      }
      return signalLiveSpeechIsActiveAtElapsedMs({
        liveSpeech: speechReveal ? liveSpeech : null,
        role,
        elapsedMs: projectedLiveSpeechElapsedMs,
      });
    };
    const roleAvatarScaleMode = (
      role: "host" | "guest",
      bot: BotcastBotSummary,
    ): BotPowerAvatarScaleMode | null => {
      const snapshot = botcastSnapshotPowersForRoleV1(
        args.currentEpisode,
        role,
      );
      return snapshot !== null
        ? botPowerAvatarScaleModeV1(snapshot)
        : (resolveAvatarScaleMode?.(bot) ?? null);
    };
    const roleAvatarVisibilityMode = (
      role: "host" | "guest",
      bot: BotcastBotSummary,
    ): BotPowerAvatarVisibilityModeV1 | null => {
      const snapshot = botcastSnapshotPowersForRoleV1(
        args.currentEpisode,
        role,
      );
      return snapshot !== null
        ? botPowerAvatarVisibilityModeV1(snapshot)
        : (resolveAvatarVisibilityMode?.(bot) ?? null);
    };
    const roleAvatarColorCycle = (
      role: "host" | "guest",
      bot: BotcastBotSummary,
    ): boolean => {
      const snapshot = botcastSnapshotPowersForRoleV1(
        args.currentEpisode,
        role,
      );
      return snapshot !== null
        ? botPowerHasAvatarColorCycleV1(snapshot)
        : (resolveAvatarColorCycle?.(bot) ?? false);
    };
    const manualProducerGuestSip = Boolean(
      !args.replay &&
        args.currentEpisode.guestKind === "producer" &&
        producerGuestSipActive,
    );
    const roleIsThinking = (role: "host" | "guest"): boolean =>
      !(role === "guest" && manualProducerGuestSip) &&
      !(
        presenceBeat?.surface === "signal" &&
        presenceBeat.sessionId === args.currentEpisode.id &&
        presenceBeat.completion === "playing" &&
        presenceBeat.speaker.botId ===
          (role === "host"
            ? args.currentEpisode.hostBotId
            : args.currentEpisode.guestBotId)
      ) &&
      ((args.replay &&
        replayFaithful &&
        replayDirectedScene?.participants[replayParticipantIdForRole(role)]
          ?.thinking === true) ||
        (role === "guest" &&
        (replayProducerGuestThinking || liveProducerGuestThinking)) ||
        // `liveStageThinkingRole` is tied to the active generation run and
        // synchronously excludes a prepared line. Do not infer thinking from
        // the broader busy flag and the next schedule: a producer cut can
        // retain that flag while its graceful closing line is already on air.
        (!args.replay && liveStageThinkingRole === role));
    const episodeStartedAtCandidate = Date.parse(args.currentEpisode.startedAt);
    const episodeStartedAtMs = Number.isFinite(episodeStartedAtCandidate)
      ? episodeStartedAtCandidate
      : null;
    const signalStageNowMs = signalStageNowMsRef.current;
    const activeWarmupStartedAtMs = args.currentEpisode.modelWarmupHoldStartedAt
      ? Date.parse(args.currentEpisode.modelWarmupHoldStartedAt)
      : Number.NaN;
    const liveWarmupElapsedMs = Number.isFinite(activeWarmupStartedAtMs)
      ? Math.max(0, signalStageNowMs - activeWarmupStartedAtMs)
      : 0;
    const liveEffectiveNowMs = Math.max(
      episodeStartedAtMs ?? 0,
      signalStageNowMs -
        (args.currentEpisode.modelWarmupHoldDurationMs ?? 0) -
        liveWarmupElapsedMs,
    );
    const cupNowMs =
      args.replay && episodeStartedAtMs !== null
      ? episodeStartedAtMs + replayCapturedPresentationElapsedMs
      : liveEffectiveNowMs;
    const identityNowMs =
      args.replay && episodeStartedAtMs !== null
        ? episodeStartedAtMs +
          replayCapturedPresentationElapsedMs +
          (args.currentEpisode.modelWarmupHoldDurationMs ?? 0)
        : signalStageNowMs;
    const identityMirrorStates = botcastIdentityMirrorStatesAtV1(
      args.currentEpisode.events,
      identityNowMs,
    );
    const identityShapeshiftStates = botcastIdentityShapeshiftStatesAtV1(
      args.currentEpisode.events,
      identityNowMs,
    );
    const falseNameStates = botcastFalseNameStatesAtV1(
      args.currentEpisode.events,
      identityNowMs,
    );
    const stagePublicName = (
      bot: BotcastBotSummary | null | undefined,
      fallback: string,
    ): string => {
      const mirroredIdentity = bot
        ? botIdentityMirrorQuotedTargetNameV1(
            identityMirrorStates.get(bot.id)?.targetBotName,
          )
        : "";
      const believed = bot
        ? falseNameStates.get(bot.id)?.believedName?.trim()
        : "";
      const borrowedIdentity = bot
        ? identityShapeshiftStates.get(bot.id)?.targetBotName.trim()
        : "";
      return (
        mirroredIdentity ||
        believed ||
        borrowedIdentity ||
        bot?.name?.trim() ||
        fallback
      );
    };
    const organicCaptionSpeakerBotId = studioDialogueCaptionOwnsFloor
      ? studioIncidentCaption?.actorBotId ?? args.activeMessage?.botId
      : args.activeMessage?.botId;
    const organicCaptionSpeaker =
      organicCaptionSpeakerBotId === args.host?.id
        ? stagePublicName(args.host, "Host")
        : organicCaptionSpeakerBotId === args.guest?.id
          ? stagePublicName(args.guest, "Guest")
          : delayedLiveCaptionSpeaker;
    const liveReactionCaptionSpeaker = liveReactionCaption
      ? liveReactionCaption.botId === args.host?.id
        ? stagePublicName(args.host, "Host")
        : liveReactionCaption.botId === args.guest?.id
          ? stagePublicName(args.guest, "Guest")
          : null
      : null;
    const liveReactionCaptionPage = signalLiveCaptionPage(
      liveReactionCaption?.speech.text ?? "",
    );
    const botWithIdentityAtStageTime = (
      bot: BotcastBotSummary,
    ): BotcastBotSummary => {
      const identityMirrorState = identityMirrorStates.get(bot.id) ?? null;
      const identityShapeshiftState =
        identityShapeshiftStates.get(bot.id) ?? null;
      const transitionActive = identityMirrorState
        ? botIdentityMirrorTransitionActiveV1(
            identityMirrorState,
            identityNowMs,
          )
        : identityShapeshiftState
          ? botIdentityShapeshiftTransitionActiveV1(
              identityShapeshiftState,
              identityNowMs,
            )
          : false;
      return {
        ...bot,
        identityMirrorState,
        identityMirrorTransitionActive: transitionActive,
        identityMirrorTargetFaceActive: Boolean(
          identityMirrorState ?? identityShapeshiftState,
        ),
        identityPresentationNowMs: identityNowMs,
        identityShapeshiftState,
      };
    };
    // The turn the viewer is watching. Live, everything saved has already
    // aired; on replay the playhead decides, and both hold the last aired turn
    // through the gaps between them so the cup level never jumps backwards.
    const presentedTurnIndex = (() => {
      const turns = args.currentEpisode.messages;
      if (turns.length === 0) return null;
      if (args.activeMessage) {
        const index = turns.findIndex(
          (message) => message.id === args.activeMessage?.id,
        );
        if (index >= 0) return index;
      }
      if (!args.replay) return turns.length - 1;
      return replayPresentedMessageIndex >= 0
        ? replayPresentedMessageIndex
        : null;
    })();
    const cupVisual = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
    ): CoffeeCupVisualState | null => {
      const snapshot = botcastSnapshotPowersForRoleV1(
        args.currentEpisode,
        role,
      );
      const powerRateMultiplier =
        snapshot !== null
        ? botPowerCupRateMultiplierForBotV1(snapshot)
        : cupRateMultiplierForBot(bot);
      if (powerRateMultiplier <= 0) return null;
      const producerGuestRole =
        role === "guest" && args.currentEpisode.guestKind === "producer";
      const otherRole = role === "host" ? "guest" : "host";
      const sipAllowed = signalCupSipAllowedDuringSpeechV1({
        roleSpeaking: roleIsSpeaking(role),
        otherRoleSpeaking: roleIsSpeaking(otherRole),
        producerGuestRole,
      });
      // Signal prepares the listener's next turn while the current speaker is
      // still on mic. Internal preparation does not block a sip, but active
      // speech from the other chair is required so the cup rises during the
      // line rather than in the silent handoff before playback begins.
      // Level and sprite both come off this one counter, so the cup cannot
      // lose coffee through a beat the viewer never saw anyone drink in —
      // which is what review 12d3d47e reported. The count is a function of
      // the saved turn list, so it is identical live and on replay and it
      // survives a seek.
      const sipSchedule = signalCupSipScheduleV1({
        episodeId: args.currentEpisode.id,
        role,
        turns: args.currentEpisode.messages,
        presentedIndex: presentedTurnIndex,
        powerRateMultiplier,
        sipAllowed,
      });
      return buildCoffeeCupVisualState({
        seed: `signal:${args.currentEpisode.id}:${bot.id}:${role}`,
        botColor: bot.color,
        theme: stageTheme,
        nowMs: cupNowMs,
        // Session timing still drives how the coffee cools; only the fill is
        // sip-anchored now.
        sessionStartedAtMs: episodeStartedAtMs,
        durationMinutes:
          args.currentEpisode.durationMinutes ??
          DEFAULT_COFFEE_SESSION_DURATION_MINUTES,
        powerRateMultiplier,
        sipCount: signalCupVisualSipCountV1(sipSchedule),
        speaking: roleIsSpeaking(role),
        thinking: roleIsThinking(role),
        sippingOverride:
          role === "guest" && manualProducerGuestSip
            ? true
            : sipSchedule.sippingNow,
      });
    };
    const hostCupVisual = args.host ? cupVisual(args.host, "host") : null;
    const guestCupVisual =
      args.guest && guestPresentOnStage ? cupVisual(args.guest, "guest") : null;
    const hostSipping =
      hostCupVisual?.sipping === true && !roleIsSpeaking("host");
    const guestSipping =
      guestCupVisual?.sipping === true && !roleIsSpeaking("guest");
    const hostCupTravel = signalCupTravelByRole.host;
    const guestCupTravel = signalCupTravelByRole.guest;
    const studioLightingStyle = signalStudioLightingStyle({
      show: stageVisualShow,
      layout: studioLayout,
      hostColor: args.host?.color ?? stageAccentColor,
      guestColor: args.guest?.color ?? stageAccentColor,
      theme: stageTheme,
    });
    const atmosphereStyle = {
      ["--botcast-accent" as string]: stageAccentColor,
      ["--signal-film-grain-level" as string]: studioMix.filmGrain,
      ["--botcast-studio-accent" as string]: normalizeAccentForTheme(
        args.host?.color ?? stageAccentColor,
        stageTheme,
      ),
      ...(socialPressureSource
        ? {
            ["--signal-power-accent" as string]: normalizeAccentForTheme(
              socialPressureSource.color ?? stageAccentColor,
              stageTheme,
            ),
          }
        : {}),
      ["--botcast-camera-offset-x" as string]: `${projectedCameraFrame.offsetX}%`,
      ["--botcast-camera-offset-y" as string]: `${projectedCameraFrame.offsetY}%`,
      ["--botcast-camera-zoom" as string]: projectedCameraFrame.zoom,
      ...(studioLightingStyle ?? {}),
    } as CSSProperties;
    const floorGlow = (
      role: "host" | "guest",
      color: string | null | undefined,
    ): ReactNode => (
      <div
        className={styles.signalFloorGlow}
        data-role={role}
        data-talking={roleSpeechActive(role) ? "true" : undefined}
        style={{
          ...signalStudioMaskedFloorGlowStyle(
            studioLayout,
            role === "host" ? "hostFloorGlow" : "guestFloorGlow",
          ),
          ["--signal-floor-glow-color" as string]: normalizeAccentForTheme(
            color ?? stageAccentColor,
            stageTheme,
          ),
        }}
      />
    );
    const avatar = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
      talking: boolean,
      thinking: boolean,
      sipping: boolean,
    ): ReactNode => {
      const ephemeralSpeech = signalEphemeralSpeechByBotId.get(bot.id);
      const participantId = replayParticipantIdForRole(role);
      const bakedReplayMouthShape =
        args.replay && replayFaithful && replayPresentationManifestV2
          ? replayMouthShapeAtV2(
              replayPresentationManifestV2,
              participantId,
              replayCapturedPresentationElapsedMs,
            )
          : null;
      const liveMouthShapeAt = (nowMs: number): ZenLiveBotMouthShape => {
        if (ephemeralSpeech) {
          const ephemeralClock =
            signalEphemeralSpeechPlaybackClockByBotIdRef.current.get(bot.id);
          const elapsedMs =
            ephemeralClock?.messageId === ephemeralSpeech.sourceMessageId
              ? Math.min(
                  ephemeralSpeech.durationMs,
                  ephemeralClock.elapsedMs +
                    Math.max(0, nowMs - ephemeralClock.observedAtMs),
                )
              : ephemeralSpeech.elapsedMs;
          return crtSpeechMouthShapeAtAlignedElapsedMs({
            text: ephemeralSpeech.text,
            elapsedMs,
            durationMs: ephemeralSpeech.durationMs,
            alignment: ephemeralSpeech.alignment,
          });
        }
        return signalLivePrimaryAvatarSpeech({
          liveSpeech: speechReveal ? liveSpeech : null,
          role,
          elapsedMs: signalLiveSpeechProjectedElapsedMs({
            liveSpeech,
            clock: signalLiveSpeechPlaybackClockRef.current,
            nowMs,
          }),
        }).mouthShape;
      };
      const replayMouthShape =
        bakedReplayMouthShape ??
        (talking && args.activeMessage && speechDurationMs > 0
          ? crtSpeechMouthShapeAtAlignedElapsedMs({
              text: args.activeMessage.content,
              elapsedMs: speechElapsedMs,
              durationMs: speechDurationMs,
              alignment: speechReveal?.alignment,
            })
          : "closed");
      const capturedVoiceLightLevel =
        args.replay && replayFaithful && replayPresentationManifestV2
          ? replayVoiceLightLevelAtV2(
              replayPresentationManifestV2,
              participantId,
              replayCapturedPresentationElapsedMs,
            )
          : null;
      const replayVoiceLightLevel = args.replay && replayFaithful
        ? (capturedVoiceLightLevel ??
          (roleSpeechActive(role) ? 0.22 : 0))
        : undefined;
      const stageBot = botWithIdentityAtStageTime(bot);
      const avatarSfxVoiceBusGain =
        introAudioEnabled &&
        recordingVoiceSelection.voiceMode !== "mute" &&
        !stageBot.muted
          ? introAudioVolume *
            botcastVoiceLevelForBot(
              args.show.voiceLevelsByBotId,
              stageBot.id,
            ) *
            (stageBot.voiceGainMultiplier ?? 1)
          : 0;
      const renderMouthFrame = (
        mouthShape: ZenLiveBotMouthShape,
        sampledReplayElapsedMs = replayCapturedPresentationElapsedMs,
        sampledReplayVoiceLightLevel = replayVoiceLightLevel,
      ): ReactNode => {
        const mouthCapture = (
          <ReplayMouthPresentationCapture
            sourceId={args.replay ? null : signalCaptureSourceIdRef.current}
            participantId={participantId}
            shape={mouthShape}
            speechActive={roleSpeechActive(role)}
          />
        );
        const renderedAvatar = renderAvatar?.(stageBot, {
          talking,
          thinking,
          sipping,
          avatarColorCycle: roleAvatarColorCycle(role, stageBot),
          replayAudioMaster: args.replay && replayFaithful,
          role,
          surface: "stage",
          sfxEnabled:
            !(args.replay && replayFaithful) &&
            avatarSfxVoiceBusGain > 0 &&
            signalAvatarSfxShouldPlay({
              surface: "stage",
              introActive: episodePreRoll !== null,
              outroActive:
                !args.replay &&
                (episodeOutroSfxMutedId === args.currentEpisode.id ||
                  episodeOutro !== null),
            }),
          sfxVoiceBusGain: avatarSfxVoiceBusGain,
          facing: signalStudioFacingForRole(studioLayout, role),
          theme: stageTheme,
          mouthShape,
          voiceLightTarget:
            args.replay && replayFaithful
              ? undefined
              : botVoiceLightTarget(
                  "signal",
                  args.currentEpisode.id,
                  participantId,
                ),
          voiceLightLevel: sampledReplayVoiceLightLevel,
          eyeTimelineMs: args.replay
            ? sampledReplayElapsedMs
            : undefined,
          eyeStateStartedAtMs:
            args.replay && talking ? replayMessageStartMs : undefined,
        });
        if (renderedAvatar !== null && renderedAvatar !== undefined) {
          return (
            <>
              {mouthCapture}
              {renderedAvatar}
            </>
          );
        }
        if (stageBot.producerGuest) {
          return (
            <>
              {mouthCapture}
              <div
                className={styles.producerGuestPresence}
                data-talking={talking ? "true" : undefined}
                data-thinking={thinking ? "true" : undefined}
                aria-label={`${stageBot.name}, Producer guest`}
              >
                <span aria-hidden="true">
                  {thinking ? "THINKING" : "YOU"}
                </span>
                <strong>{stageBot.name}</strong>
              </div>
            </>
          );
        }
        return (
          <>
            {mouthCapture}
            {avatarFallback(stageBot)}
          </>
        );
      };
      if (
        args.replay &&
        replayFaithful &&
        replayActiveTimeline &&
        replayPresentationManifestV2
      ) {
        return (
          <SignalLiveVisualSampler
            active={replayPlaying}
            sample={() => {
              const mediaElapsedMs = signalReplayCapturedPresentationElapsedMs({
                timeline: replayActiveTimeline,
                replayElapsedMs:
                  replayAudioRef.current?.currentTime !== undefined
                    ? replayAudioRef.current.currentTime * 1_000
                    : replayCapturedPresentationElapsedMs,
              });
              const sampledMouthShape =
                replayMouthShapeAtV2(
                  replayPresentationManifestV2,
                  participantId,
                  mediaElapsedMs,
                ) ??
                (talking && args.activeMessage && speechDurationMs > 0
                  ? crtSpeechMouthShapeAtAlignedElapsedMs({
                      text: args.activeMessage.content,
                      elapsedMs: Math.max(
                        0,
                        mediaElapsedMs - replayMessageStartMs,
                      ),
                      durationMs: speechDurationMs,
                      alignment: speechReveal?.alignment,
                    })
                  : "closed");
              const sampledVoiceLightLevel =
                replayVoiceLightLevelAtV2(
                  replayPresentationManifestV2,
                  participantId,
                  mediaElapsedMs,
                ) ?? (roleSpeechActive(role) ? 0.22 : 0);
              return {
                key: `${Math.floor(
                  mediaElapsedMs / SIGNAL_LIVE_SPEECH_RENDER_INTERVAL_MS,
                )}:${sampledMouthShape}:${sampledVoiceLightLevel}`,
                value: {
                  elapsedMs: mediaElapsedMs,
                  mouthShape: sampledMouthShape,
                  voiceLightLevel: sampledVoiceLightLevel,
                },
              };
            }}
            render={(sample) =>
              renderMouthFrame(
                sample.mouthShape,
                sample.elapsedMs,
                sample.voiceLightLevel,
              )
            }
          />
        );
      }
      if (args.replay) return renderMouthFrame(replayMouthShape);
      return (
        <SignalLiveVisualSampler
          active={
            speechReveal?.phase === "playing" || ephemeralSpeech !== undefined
          }
          sample={(nowMs) => {
            const mouthShape = liveMouthShapeAt(nowMs);
            return { key: mouthShape, value: mouthShape };
          }}
          render={renderMouthFrame}
        />
      );
    };
    return (
      <section
        ref={signalStageRef}
        className={styles.stageViewport}
        data-shot={args.shot}
        data-camera-transitions={stageCameraTransitionMode}
        data-replay={args.replay ? "true" : undefined}
        data-session-bot-visual-quality={signalStageBotVisualQuality}
        data-session-visible-bot-count={signalStageVisibleBotCount}
        data-guest-presence={args.currentEpisode.guestPresenceMode}
        data-audience-guest-visible={guestVisibleToAudience ? "true" : "false"}
        data-signal-power-pressure={socialPressure?.strength}
        data-signal-power-source={socialPressure?.sourceRole}
        data-signal-image-context={stageImageVisible ? "visible" : undefined}
        data-signal-image-speaker={
          stageImageVisible ? args.activeMessage?.speakerRole : undefined
        }
        data-model-warmup={
          !args.replay && signalModelWarmup
            ? signalModelWarmup.phase
            : undefined
        }
        data-studio-source={stageAtmosphere.imageUrl ? "image" : "fallback"}
        style={atmosphereStyle}
        aria-label={`Signal studio, ${args.shot} camera`}
      >
        <div
          className={styles.captionControls}
          aria-label="Signal stage captions"
        >
          <button
            type="button"
            data-signal-captions-toggle="true"
            data-selected={liveCaptionsEnabled ? "true" : undefined}
            aria-pressed={liveCaptionsEnabled}
            aria-label={liveCaptionsEnabled ? "Hide captions" : "Show captions"}
            title={liveCaptionsEnabled ? "Hide captions" : "Show captions"}
            onClick={toggleLiveCaptions}
          >
            CC
          </button>
          <button
            type="button"
            data-signal-caption-size="decrease"
            aria-label={`Decrease Signal caption size, currently ${liveCaptionSizeDetails(liveCaptionSize).label}`}
            title="Decrease caption size"
            disabled={!liveCaptionsEnabled || liveCaptionSize === "small"}
            onClick={() => adjustLiveCaptionSize(-1)}
          >
            A−
          </button>
          <output
            className={styles.captionSizeReadout}
            aria-label={`Signal caption size ${liveCaptionSizeDetails(liveCaptionSize).label}`}
            aria-live="polite"
            data-signal-caption-size-readout="true"
          >
            {liveCaptionSizeDetails(liveCaptionSize).percent}%
          </output>
          <button
            type="button"
            data-signal-caption-size="increase"
            aria-label={`Increase Signal caption size, currently ${liveCaptionSizeDetails(liveCaptionSize).label}`}
            title="Increase caption size"
            disabled={
              !liveCaptionsEnabled || liveCaptionSize === "extra-large"
            }
            onClick={() => adjustLiveCaptionSize(1)}
          >
            A+
          </button>
        </div>
        {args.replay && replayFaithful && replayCompactThinkingNotice ? (
          <div
            className={styles.replayCompactThinkingNotice}
            data-participant-id={replayCompactThinkingNotice.participantId}
            data-source-message-id={
              replayCompactThinkingNotice.sourceMessageId ?? undefined
            }
            role="status"
          >
            {replayCompactThinkingNotice.label}
          </div>
        ) : null}
        <div className={styles.stageScene} data-signal-stage-scene="true">
          {!stageAtmosphere.imageUrl ? (
            <div className={styles.atmosphere} aria-hidden="true">
              <SignalFallbackStudio
                surface="stage"
                accentVariant={args.show.fallbackStudioAccentVariant}
              />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- user-generated studio URLs require direct, stable source identity.
            <img
              className={styles.atmosphere}
              src={stageAtmosphere.imageUrl}
              alt=""
              aria-hidden="true"
            />
          )}
          <SignalStudioMicrophoneTint
            atmosphere={stageAtmosphere}
            layout={studioLayout}
            hostColor={args.host?.color ?? stageAccentColor}
            guestColor={args.guest?.color ?? stageAccentColor}
            theme={stageTheme}
          />
          <div
            className={styles.wordmark}
            style={signalLogoPlacementStyle(
              normalizeBotcastLogoPlacement(stageVisualShow.logoPlacement),
            )}
          >
            <SignalShowLogo show={stageVisualShow} />
            <strong>{args.show.name}</strong>
          </div>
          <div
            className={styles.studioGlow}
            data-generated-lighting={studioLightingStyle ? "true" : undefined}
            data-talk-reactive={studioLightingStyle ? "true" : undefined}
            data-host-talking={
              studioLightingStyle && roleSpeechActive("host") ? "true" : undefined
            }
            data-guest-talking={
              studioLightingStyle && roleSpeechActive("guest")
                ? "true"
                : undefined
            }
            aria-hidden="true"
          />
          <div className={styles.signalFloorGlowLayer} aria-hidden="true">
            {floorGlow("host", args.host?.color)}
            {floorGlow("guest", args.guest?.color)}
          </div>
          {socialPressure ? (
            <div
              className={styles.powerPressure}
              data-strength={socialPressure.strength}
              data-source={socialPressure.sourceRole}
              aria-hidden="true"
            />
          ) : null}
          {!studioLightingStyle ? <SignalStudioSpotlight /> : null}
          {hostVisibleToAudience && args.host ? (
            <div
              className={styles.stagePlacement}
              style={signalStudioPlacementStyle(studioLayout, "hostBot")}
              aria-label={`Host ${args.host.name}`}
              aria-hidden={hostDeparted ? "true" : undefined}
            >
              <div
                className={styles.avatarRig}
                data-signal-presence="host"
                data-departed={hostDeparted ? "true" : undefined}
                data-talking={roleIsSpeaking("host") ? "true" : undefined}
                data-thinking={roleIsThinking("host") ? "true" : undefined}
                data-sipping={hostSipping ? "true" : undefined}
                data-ghostly-presence={
                  roleAvatarVisibilityMode("host", args.host) ===
                  "speaking_only"
                    ? "true"
                    : undefined
                }
                data-power-avatar-visibility={
                  roleAvatarVisibilityMode("host", args.host) ?? undefined
                }
                data-power-avatar-scale={
                  roleAvatarScaleMode("host", args.host) ?? undefined
                }
                data-power-avatar-color-cycle={
                  roleAvatarColorCycle("host", args.host)
                    ? "spectrum"
                    : undefined
                }
                data-listener-reaction={
                  roleIsListenerReacting("host")
                    ? listenerReactionActionForRole()
                    : undefined
                }
              >
                <span className={styles.avatarEmbodiment}>
                  {avatar(
                    args.host,
                    "host",
                    roleIsSpeaking("host"),
                    roleIsThinking("host"),
                    hostSipping && hostCupTravel.sipFaceActive,
                  )}
                </span>
                {activeVoiceAction &&
                args.activeMessage?.speakerRole === "host" ? (
                  <SignalVoiceActionText {...activeVoiceAction} />
                ) : null}
                {roleIsListenerReacting("host") &&
                (listenerReactionPlan || muteReactionBeat) ? (
                  !(
                    muteReactionBeat?.kind === "interrupt" ||
                    listenerReactionPlan?.interjectionAttempt
                  ) ? (
                  <span
                    className={styles.listenerReactionText}
                    data-listener-reaction-text="true"
                    role="status"
                    aria-label={`${args.host.name} ${listenerReactionActionForRole() ?? "reacts"}`}
                  >
                    {listenerReactionTextForRole(Boolean(args.host.muted)) ??
                      "reacts"}
                  </span>
                  ) : null
                ) : null}
              </div>
            </div>
          ) : null}
          {hostVisibleToAudience && args.host && renderMug && hostCupVisual ? (
            <div
              className={styles.stageMug}
              style={{
                ...signalStudioPlacementStyle(studioLayout, "hostCup"),
                ["--signal-cup-rest-x" as string]: `${studioLayout.hostCup.x}%`,
                ["--signal-cup-rest-y" as string]: `${studioLayout.hostCup.y}%`,
                ["--signal-cup-sip-duration-ms" as string]: `${hostCupVisual.sipAnimationMs}ms`,
                ...(hostCupTravel.returnDeltaX !== null &&
                hostCupTravel.returnDeltaY !== null
                  ? {
                      ["--signal-cup-return-delta-x" as string]: `${hostCupTravel.returnDeltaX}px`,
                      ["--signal-cup-return-delta-y" as string]: `${hostCupTravel.returnDeltaY}px`,
                    }
                  : {}),
              }}
              data-signal-mug-role="host"
              data-cup-placement-foley="animation-end"
              data-prism-semantic-motion="cup-consumption"
              data-sip-face-release-ms={signalCupSipFaceReleaseMs(
                hostCupVisual.sipAnimationMs,
              )}
              data-sip-duration-ms={hostCupVisual.sipAnimationMs}
              data-sip-requested={hostSipping ? "true" : undefined}
              data-sipping={
                hostCupTravel.mode === "sipping" ? "true" : undefined
              }
              data-returning={
                hostCupTravel.mode === "returning" ? "true" : undefined
              }
              onAnimationEnd={(event) => finishSignalCupReturn("host", event)}
              aria-label="Host coffee mug"
            >
              {renderMug(args.host, {
                role: "host",
                facing: signalStudioFacingForRole(studioLayout, "host"),
                visual: hostCupVisual,
              })}
            </div>
          ) : null}
          {guestVisibleToAudience && args.guest ? (
            <div
              className={styles.stagePlacement}
              style={signalStudioPlacementStyle(studioLayout, "guestBot")}
              aria-label={`Guest ${args.guest.name}`}
              aria-hidden={guestDeparted ? "true" : undefined}
            >
              <div
                className={styles.avatarRig}
                data-signal-presence="guest"
                data-departed={guestDeparted ? "true" : undefined}
                data-talking={roleIsSpeaking("guest") ? "true" : undefined}
                data-thinking={roleIsThinking("guest") ? "true" : undefined}
                data-sipping={guestSipping ? "true" : undefined}
                data-ghostly-presence={
                  roleAvatarVisibilityMode("guest", args.guest) ===
                  "speaking_only"
                    ? "true"
                    : undefined
                }
                data-power-avatar-visibility={
                  roleAvatarVisibilityMode("guest", args.guest) ?? undefined
                }
                data-power-avatar-scale={
                  roleAvatarScaleMode("guest", args.guest) ?? undefined
                }
                data-power-avatar-color-cycle={
                  roleAvatarColorCycle("guest", args.guest)
                    ? "spectrum"
                    : undefined
                }
                data-listener-reaction={
                  roleIsListenerReacting("guest")
                    ? listenerReactionActionForRole()
                    : (producerStageGesture ?? undefined)
                }
              >
                <span className={styles.avatarEmbodiment}>
                  {avatar(
                    args.guest,
                    "guest",
                    roleIsSpeaking("guest"),
                    roleIsThinking("guest"),
                    guestSipping && guestCupTravel.sipFaceActive,
                  )}
                </span>
                {activeVoiceAction &&
                args.activeMessage?.speakerRole === "guest" ? (
                  <SignalVoiceActionText {...activeVoiceAction} />
                ) : null}
                {roleIsListenerReacting("guest") &&
                (listenerReactionPlan || muteReactionBeat) ? (
                  !(
                    muteReactionBeat?.kind === "interrupt" ||
                    listenerReactionPlan?.interjectionAttempt
                  ) ? (
                  <span
                    className={styles.listenerReactionText}
                    data-listener-reaction-text="true"
                    role="status"
                    aria-label={`${args.guest.name} ${listenerReactionActionForRole() ?? "reacts"}`}
                  >
                    {listenerReactionTextForRole(Boolean(args.guest.muted)) ??
                      "reacts"}
                  </span>
                  ) : null
                ) : null}
              </div>
            </div>
          ) : null}
          {guestPresentOnStage && args.guest && renderMug && guestCupVisual ? (
            <div
              className={styles.stageMug}
              style={{
                ...signalStudioPlacementStyle(studioLayout, "guestCup"),
                ["--signal-cup-rest-x" as string]: `${studioLayout.guestCup.x}%`,
                ["--signal-cup-rest-y" as string]: `${studioLayout.guestCup.y}%`,
                ["--signal-cup-sip-duration-ms" as string]: `${guestCupVisual.sipAnimationMs}ms`,
                ...(guestCupTravel.returnDeltaX !== null &&
                guestCupTravel.returnDeltaY !== null
                  ? {
                      ["--signal-cup-return-delta-x" as string]: `${guestCupTravel.returnDeltaX}px`,
                      ["--signal-cup-return-delta-y" as string]: `${guestCupTravel.returnDeltaY}px`,
                    }
                  : {}),
              }}
              data-signal-mug-role="guest"
              data-cup-placement-foley="animation-end"
              data-prism-semantic-motion="cup-consumption"
              data-sip-face-release-ms={signalCupSipFaceReleaseMs(
                guestCupVisual.sipAnimationMs,
              )}
              data-sip-duration-ms={guestCupVisual.sipAnimationMs}
              data-sip-requested={guestSipping ? "true" : undefined}
              data-sipping={
                guestCupTravel.mode === "sipping" ? "true" : undefined
              }
              data-returning={
                guestCupTravel.mode === "returning" ? "true" : undefined
              }
              onAnimationEnd={(event) => finishSignalCupReturn("guest", event)}
              aria-label="Guest coffee mug"
            >
              {renderMug(args.guest, {
                role: "guest",
                facing: signalStudioFacingForRole(studioLayout, "guest"),
                visual: guestCupVisual,
              })}
            </div>
          ) : null}
          <div
            className={`${styles.seat} ${styles.hostSeat}`}
            style={{
              ["--signal-seat-x" as string]: `${studioLayout.hostBot.x}%`,
            }}
            data-role="host"
            data-departed={hostDeparted ? "true" : undefined}
          >
            {hostDeparted ? (
              <span className={styles.emptyChairLabel}>
                Host has left the studio
              </span>
            ) : null}
            <strong className={styles.nameplate}>
              <span>Host</span>
              {stagePublicName(args.host, "Host")}
            </strong>
          </div>
          <div
            className={`${styles.seat} ${styles.guestSeat}`}
            style={{
              ["--signal-seat-x" as string]: `${studioLayout.guestBot.x}%`,
            }}
            data-role="guest"
            data-departed={guestDeparted ? "true" : undefined}
            data-audience-hidden={guestHiddenFromAudience ? "true" : undefined}
          >
            {guestDeparted ? (
              <span className={styles.emptyChairLabel}>
                Guest has left the studio
              </span>
            ) : null}
            <strong className={styles.nameplate}>
              <span>{guestHiddenFromAudience ? "Booked guest" : "Guest"}</span>
              {stagePublicName(args.guest, "Guest")}
            </strong>
          </div>
        </div>
        {stageImageVisible && stageImageContext ? (
          <figure
            className={styles.episodeImageContext}
            data-speaker-role={args.activeMessage?.speakerRole}
            data-image-kind={stageImageContext.kind}
            data-message-id={args.activeMessage?.id}
            data-camera-shot={args.shot}
            style={signalEpisodeImagePlacementStyle(
              activeCameraFrame.episodeImage,
              stageImageContext.kind,
            )}
          >
            <SignalEpisodeImageVisual
              context={stageImageContext}
              episodeId={args.currentEpisode.id}
              replay={args.replay}
              ephemeralDataUrl={stageEpisodeImage?.dataUrl}
            />
          </figure>
        ) : null}
        {liveCaptionsEnabled && organicCaptionPresentation && args.activeMessage ? (
          <div
            className={styles.liveCaption}
            style={{
              ["--botcast-caption-accent" as string]: captionAccentForBotId(
                organicCaptionSpeakerBotId ?? args.activeMessage.botId,
              ),
            }}
            data-signal-live-caption="true"
            data-signal-organic-caption="true"
            data-message-id={args.activeMessage.id}
            aria-live="polite"
          >
            <i aria-hidden="true" />
            <div>
              <strong>{organicCaptionSpeaker}</strong>
              <span data-caption-rows="adaptive">
                {organicCaptionPresentation.kind === "animated_ellipsis" ? (
                  <span
                    className={styles.signalAnimatedEllipsis}
                    data-signal-animated-ellipsis="true"
                    aria-label={organicCaptionPresentation.accessibleText}
                  >
                    <span aria-hidden="true">•</span>
                    <span aria-hidden="true">•</span>
                    <span aria-hidden="true">•</span>
                  </span>
                ) : organicCaptionPresentation.text}
              </span>
            </div>
          </div>
        ) : liveCaptionsEnabled && liveReactionCaption && liveReactionCaptionSpeaker && liveReactionCaptionPage.text ? (
          <div
            className={styles.liveCaption}
            style={{
              ["--botcast-caption-accent" as string]: captionAccentForBotId(
                liveReactionCaption.botId,
              ),
            }}
            data-signal-live-caption="true"
            data-signal-reaction-caption="true"
            data-speaker-id={liveReactionCaption.botId}
            data-caption-page={liveReactionCaptionPage.pageIndex + 1}
            data-caption-pages={liveReactionCaptionPage.pageCount}
            aria-live="polite"
          >
            <i aria-hidden="true" />
            <div>
              <strong>{liveReactionCaptionSpeaker}</strong>
              <span data-caption-rows="adaptive">
                {liveReactionCaptionPage.text}
              </span>
            </div>
          </div>
        ) : presenceBeat?.surface === "signal" &&
        presenceBeat.sessionId === args.currentEpisode.id &&
        presenceBeat.completion === "playing" ? (
          <div
            className={styles.liveCaption}
            style={{
              ["--botcast-caption-accent" as string]: captionAccentForBotId(
                presenceBeat.speaker.botId ?? null,
              ),
            }}
            data-signal-live-caption="true"
            data-caption-page={presenceBeatCaptionPage.pageIndex + 1}
            data-caption-pages={presenceBeatCaptionPage.pageCount}
            aria-live="polite"
          >
            <i aria-hidden="true" />
            <div>
              <strong>{presenceBeat.speaker.name}</strong>
              <span
                key={`presence:${presenceBeatCaptionPage.pageIndex}`}
                data-caption-rows="adaptive"
              >
                {presenceBeatCaptionPage.text || "…"}
              </span>
            </div>
          </div>
        ) : !args.replay &&
          args.activeMessage &&
          speechReveal?.phase === "playing" ? (
          <SignalLiveVisualSampler
            key={`signal-live-caption:${args.activeMessage.id}`}
            active
            sample={(nowMs) => {
              const elapsedMs = signalLiveSpeechProjectedElapsedMs({
                liveSpeech,
                clock: signalLiveSpeechPlaybackClockRef.current,
                nowMs,
              });
              const reveal = updateBotcastSpeechReveal(
                speechReveal,
                elapsedMs,
              );
              const text = signalLiveCaptionText(
                reveal,
                args.activeMessage,
              );
              const page = signalLiveCaptionPage(text);
              const mutePerformance = args.activeMessage?.mutePerformance;
              const muteElapsed = Boolean(
                mutePerformance &&
                  elapsedMs >= mutePerformance.durationMs,
              );
              return {
                key: `${muteElapsed ? "mute" : "caption"}:${page.pageIndex}:${page.text}`,
                value: { muteElapsed, page },
              };
            }}
            render={({ muteElapsed, page }) =>
              muteElapsed && args.activeMessage?.mutePerformance ? (
                <span
                  className={styles.muteElapsedStageCue}
                  data-signal-mute-elapsed-cue="true"
                  data-message-id={args.activeMessage.id}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {args.activeMessage.mutePerformance.elapsedCue.replace(
                    /^\*|\*$/gu,
                    "",
                  )}
                </span>
              ) : liveCaptionsEnabled &&
                page.text &&
                delayedLiveCaptionSpeaker ? (
                <div
                  className={styles.liveCaption}
                  style={{
                    ["--botcast-caption-accent" as string]:
                      captionAccentForRole(args.activeMessage!.speakerRole),
                  }}
                  data-signal-live-caption="true"
                  data-message-id={args.activeMessage!.id}
                  data-speaker-role={args.activeMessage!.speakerRole}
                  data-caption-page={page.pageIndex + 1}
                  data-caption-pages={page.pageCount}
                  aria-live="off"
                >
                  <i aria-hidden="true" />
                  <div>
                    <strong>
                      {args.activeMessage!.speakerRole === "host"
                        ? stagePublicName(args.host, "Host")
                        : args.activeMessage!.speakerRole === "guest"
                          ? stagePublicName(args.guest, "Guest")
                          : delayedLiveCaptionSpeaker}
                    </strong>
                    <span
                      key={`${args.activeMessage!.id}:${page.pageIndex}`}
                      data-caption-rows="adaptive"
                    >
                      {page.text}
                    </span>
                  </div>
                </div>
              ) : null
            }
          />
        ) : liveCaptionsEnabled &&
        args.replay &&
        delayedLiveCaption &&
        !muteElapsedStageCueVisible &&
        delayedLiveCaptionSpeaker &&
        args.activeMessage ? (
          <div
            className={styles.liveCaption}
            style={{
              ["--botcast-caption-accent" as string]: captionAccentForRole(
                args.activeMessage.speakerRole,
              ),
            }}
            data-signal-live-caption="true"
            data-message-id={args.activeMessage.id}
            data-speaker-role={args.activeMessage.speakerRole}
            data-caption-page={delayedLiveCaptionPage.pageIndex + 1}
            data-caption-pages={delayedLiveCaptionPage.pageCount}
            aria-live="off"
          >
            <i aria-hidden="true" />
            <div>
              <strong>
                {args.activeMessage.speakerRole === "host"
                  ? stagePublicName(args.host, "Host")
                  : args.activeMessage.speakerRole === "guest"
                    ? stagePublicName(args.guest, "Guest")
                    : delayedLiveCaptionSpeaker}
              </strong>
              <span
                key={`${args.activeMessage.id}:${delayedLiveCaptionPage.pageIndex}`}
                data-caption-rows="adaptive"
              >
                {delayedLiveCaptionPage.text}
              </span>
            </div>
          </div>
        ) : liveCaptionsEnabled &&
          producerGuestHostPromptMessage &&
          producerGuestHostPromptText ? (
          <div
            className={styles.liveCaption}
            style={{
              ["--botcast-caption-accent" as string]:
                captionAccentForRole("host"),
            }}
            data-signal-producer-host-prompt="true"
            data-signal-transcript-panel-state="collapsed"
            data-message-id={producerGuestHostPromptMessage.id}
            data-speaker-role="host"
            data-caption-page={producerGuestHostPromptPage.pageIndex + 1}
            data-caption-pages={producerGuestHostPromptPage.pageCount}
            aria-live="off"
          >
            <i aria-hidden="true" />
            <div>
              <strong>{stagePublicName(args.host, "Host")}</strong>
              <span
                key={`${producerGuestHostPromptMessage.id}:${producerGuestHostPromptPage.pageIndex}`}
                data-caption-rows="adaptive"
              >
                {producerGuestHostPromptPage.text}
              </span>
            </div>
          </div>
        ) : null}
        {!args.replay &&
        args.activeMessage?.speechIntentRevealAvailable === true &&
        speechReveal?.phase === "ended" ? (
          <SpeechIntentReveal
            available
            mode="signal"
            scopeId={args.currentEpisode.id}
            recordId={args.activeMessage.id}
            request={request}
          />
        ) : null}
        {args.replay &&
        muteElapsedStageCueVisible &&
        args.activeMessage?.mutePerformance ? (
          <span
            key={`mute-elapsed-cue:${args.activeMessage.id}`}
            className={styles.muteElapsedStageCue}
            data-signal-mute-elapsed-cue="true"
            data-message-id={args.activeMessage.id}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {args.activeMessage.mutePerformance.elapsedCue.replace(
              /^\*|\*$/gu,
              "",
            )}
          </span>
        ) : null}
        {!args.replay && signalModelWarmup ? (
          <ModelWarmupIntermission
            phase={signalModelWarmup.phase}
            experience="signal"
            model={signalModelWarmup.model}
            startedAt={signalModelWarmup.startedAt}
            failure={signalModelWarmup.failure}
            initial={signalModelWarmup.initial}
            onRetry={
              signalModelWarmup.phase === "failed"
                ? () => void retrySignalModelWarmup()
                : undefined
            }
            onExit={
              signalModelWarmup.initial
                ? () => void leaveInitialSignalWarmup()
                : () => void cutShow()
            }
            exitLabel={signalModelWarmup.initial ? "Back to setup" : "Cut show"}
          />
        ) : null}
      </section>
    );
  };

  const renderSignalBotPicker = ({
    bots: pickerBots,
    selectedId,
    searchValue,
    onSearchChange,
    groupId,
    onGroupChange,
    onSelect,
    ariaLabel,
    compact = false,
    disabled = false,
    directedSetupTarget,
  }: {
    bots: readonly BotcastBotSummary[];
    selectedId: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
    groupId: string;
    onGroupChange: (value: string) => void;
    onSelect: (botId: string) => void;
    ariaLabel: string;
    compact?: boolean;
    disabled?: boolean;
    directedSetupTarget?: (
      bot: BotcastBotSummary,
    ) => PrismRefractBotDirectedSetupTarget;
  }): React.JSX.Element => {
    const groups = signalPickerGroupsForBots(pickerBots, botGroups);
    const effectiveGroupId = groups.some((group) => group.id === groupId)
      ? groupId
      : "all";
    const hueLensAvailable =
      pickerBots.filter((bot) => signalBotDropdownHue(bot) !== null).length >= 2;
    const visibleBots = sortBotPickerItems(
      filterBotPickerItems(
      pickerBots,
      searchValue,
      effectiveGroupId,
      groups,
      ),
      signalGridHueLensCenter !== null,
      (left, right) => {
        const leftHue = signalBotDropdownHue(left);
        const rightHue = signalBotDropdownHue(right);
        if (leftHue === null && rightHue !== null) return 1;
        if (leftHue !== null && rightHue === null) return -1;
        if (
          leftHue !== null &&
          rightHue !== null &&
          signalGridHueLensCenter !== null
        ) {
          const leftDistance = signalCircularHueDistance(
            leftHue,
            signalGridHueLensCenter,
          );
          const rightDistance = signalCircularHueDistance(
            rightHue,
            signalGridHueLensCenter,
          );
          if (leftDistance !== rightDistance) return leftDistance - rightDistance;
          if (leftHue !== rightHue) return leftHue - rightHue;
        }
        return left.name.localeCompare(right.name);
      },
    );
    const resultLabel =
      visibleBots.length === 0
        ? "No bots match this view."
        : `${visibleBots.length} bot${visibleBots.length === 1 ? "" : "s"}`;
    return (
      <div
        className={styles.signalBotPicker}
        data-compact={compact ? "true" : undefined}
      >
        <BotPickerToolbar
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          searchAriaLabel={`Search ${ariaLabel.toLocaleLowerCase()}`}
          searchPlaceholder="Search bots…"
          groups={groups}
          groupItems={bots}
          groupValue={effectiveGroupId}
          onGroupChange={onGroupChange}
          groupTheme={theme}
          groupSelectionMode="modal"
          resultLabel={resultLabel}
          compact={compact}
        />
        {visibleBots.length > 0 ? (
          <div
            ref={signalBotPickerViewportRef}
            className={styles.signalBotPickerGridWithHueLens}
            data-signal-grid-hue-lens="true"
          >
            <BotPickerGrid
              className={styles.signalBotPickerGrid}
              role="radiogroup"
              ariaLabel={ariaLabel}
              style={
                {
                  "--tile-size": `${SIGNAL_BOT_PICKER_TILE.tileSize}px`,
                  "--tile-gap": "8px",
                  "--tile-hover-scale": "1.055",
                } as CSSProperties
              }
            >
            {visibleBots.map((bot) => {
              const selected = bot.id === selectedId;
              const accent = normalizeAccentForTheme(
                bot.color ?? "#8d7cff",
                theme,
              );
              return (
                <BotPickerTile
                  key={bot.id}
                  item={{
                    id: bot.id,
                    name: bot.name,
                    color: bot.color,
                    glyph: bot.glyph,
                  }}
                  selected={selected}
                  forceName
                  accentColor={accent}
                  geometry={SIGNAL_BOT_PICKER_TILE}
                  renderGlyph={renderBotGlyph}
                  className={styles.signalBotPickerTile}
                  directedSetupTarget={directedSetupTarget?.(bot)}
                  buttonProps={{
                    role: "radio",
                    "aria-checked": selected,
                    "aria-label": `${bot.name}${selected ? ", selected" : ""}`,
                    "data-bot-hue":
                      signalBotDropdownHue(bot) === null
                        ? undefined
                        : String(signalBotDropdownHue(bot)),
                    disabled,
                    onPointerDown: (event) =>
                      onBotContextLongPressStart?.(event, bot.id),
                    onPointerUp: onBotContextLongPressEnd,
                    onPointerCancel: onBotContextLongPressEnd,
                    onPointerMove: onBotContextLongPressMove,
                    onContextMenu: (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onBotContextMenu?.(bot.id, event.clientX, event.clientY);
                    },
                    onClick: () => onSelect(bot.id),
                  }}
                />
              );
            })}
            </BotPickerGrid>
            {hueLensAvailable ? (
              <div
                className={styles.signalBotPickerHueLens}
                data-active={
                  signalGridHueLensCenter !== null ? "true" : undefined
                }
                data-tutorial-target="signal-guest-hue-lens"
              >
                <span aria-hidden="true">Hue</span>
                <input
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  value={debateCastLensSliderInputValue(
                    signalGridHueLensCenter,
                  )}
                  onChange={(event) =>
                    setSignalGridHueLensCenter(
                      debateCastHueFromLensSliderInput(
                        Number(event.currentTarget.value),
                      ),
                    )
                  }
                  aria-label="Browse Signal guests by hue"
                />
                <button
                  type="button"
                  onClick={() => setSignalGridHueLensCenter(null)}
                  disabled={signalGridHueLensCenter === null}
                  aria-label="Clear Signal guest hue lens"
                >
                  ×
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className={styles.signalBotPickerEmpty}>No bots found.</p>
        )}
      </div>
    );
  };

  const feelLucky = async (): Promise<void> => {
    if (busy || bookingSuggestionBusy || luckyLaunchUiInFlightRef.current)
      return;
    const selectedEpisodeModelOption = episodeModelDraft
      ? (modelOptions.find((option) => option.id === episodeModelDraft) ?? null)
      : null;
    const episodeModelProvider =
      selectedEpisodeModelOption?.provider ?? preferredProvider;
    luckyLaunchUiInFlightRef.current = true;
    setBookingSuggestionBusy("lucky");
    setError(null);
    setNotice(null);
    try {
      await luckyLaunchRunnerRef.current.run({
        shows,
        bots: eligibleBots,
        suggestBooking: async ({ showId, guestBotId }) =>
          request<{
            topic: string;
            producerBrief: string;
            guestBrief: string;
            guestBotId?: string;
            generated: boolean;
          }>(
            `/api/botcast/shows/${encodeURIComponent(showId)}/booking-suggestion`,
            {
              method: "POST",
              body: JSON.stringify({
                guestBotId,
                field: "booking",
                currentTopic: "",
                currentProducerBrief: "",
                preferredProvider: episodeModelProvider,
                responseMode,
                modelOverride: selectedEpisodeModelOption?.id ?? null,
              }),
            },
          ),
        launch: async (setup) => {
          await selectShow(setup.show);
          setGuestDraftId(setup.guestBotId);
          setTopicDraft(setup.topic);
          setProducerBriefDraft(setup.producerBrief);
          setGuestBriefDraft(setup.guestBrief);
          setNotice("Lucky signal found. Taking it live…");
          await startEpisode({
            ...setup,
            setupEpisodeImage,
            watchAutoStart: true,
          });
        },
      });
    } catch (luckyError) {
      setError(
        signalErrorToast(
          "I Feel Lucky",
          luckyError instanceof Error
            ? luckyError
            : "Signal could not produce this lucky booking.",
        ),
      );
    } finally {
      luckyLaunchUiInFlightRef.current = false;
      setBookingSuggestionBusy(null);
    }
  };
  const luckyLaunchAvailable =
    shows.length > 0 &&
    signalLuckyEligibleShows(shows, eligibleBots).length > 0;
  const luckyLaunchDisabled =
    busy ||
    Boolean(bookingSuggestionBusy) ||
    !luckyLaunchAvailable ||
    Boolean(
      setupEpisodeImage &&
        (!signalEpisodeModelChoiceSupportsImageInput(
          modelOptions,
          episodeModelDraft,
        ) ||
          !setupEpisodeImage.descriptor.name.trim()),
    );

  const renderLibrary = (): React.JSX.Element => (
    <aside className={styles.library} aria-label="Signal shows">
      <div className={styles.libraryHeader}>
        <span>Your shows</span>
        <small>{shows.length}</small>
      </div>
      <div className={styles.showList} data-tutorial-target="botcast-shows">
        {shows.map((show) => {
          const host = botsById.get(show.hostBotId);
          const rating =
            typeof show.audienceRating === "number" &&
            Number.isFinite(show.audienceRating)
              ? Math.max(0, Math.min(5, show.audienceRating))
              : 0;
          const reviewCount = Math.max(
            0,
            Math.round(show.audienceReviewCount ?? 0),
          );
          const hasAudienceReviews = reviewCount > 0;
          const audienceRating = hasAudienceReviews ? rating : 0;
          const audienceLabel =
            `${audienceRating.toFixed(1)} out of 5 from ${reviewCount} review${reviewCount === 1 ? "" : "s"}`;
          return (
            <button
              key={show.id}
              type="button"
              className={styles.showRow}
              data-selected={show.id === selectedShowId ? "true" : undefined}
              onClick={() => void selectShow(show)}
              aria-label={
                episode?.status === "live"
                  ? `Cut the live show and open ${show.name}, ${audienceLabel}`
                  : `Open ${show.name}, ${audienceLabel}`
              }
              style={
                {
                  ["--show-accent" as string]: normalizeAccentForTheme(
                    host?.color ?? show.accentColor,
                    theme,
                  ),
                  ["--show-rating-color" as string]:
                    signalAudienceRatingColor(audienceRating) ?? undefined,
                } as CSSProperties
              }
              data-botcast-show-id={show.id}
            >
              <SignalShowLogo show={show} compact />
              <span className={styles.showRowContent}>
                <strong>{show.name}</strong>
                <small>
                  {host?.name ?? "Vacant host · production paused"} · {show.episodeCount} episodes
                </small>
              </span>
              <span
                className={styles.showRowRating}
                data-unrated={hasAudienceReviews ? undefined : "true"}
                title={audienceLabel}
                aria-hidden="true"
              >
                {`${audienceRating.toFixed(1)} ★`}
              </span>
            </button>
          );
        })}
        {!loading && shows.length === 0 ? (
          <p className={styles.emptyCopy}>
            Every great show starts with a host.
          </p>
        ) : null}
      </div>
      <div
        className={styles.createShowCard}
        data-tutorial-target="botcast-create-show"
      >
        <label>Create a show</label>
        <PrismRefractTarget
          target={{
            id: "signal-create-host",
            kind: "choice",
            label: "show host",
            read: () => hostDraftId,
            preview: setHostDraftId,
            accept: setHostDraftId,
            choices: () =>
              eligibleBots
                .filter(
                  (bot) => !shows.some((show) => show.hostBotId === bot.id),
                )
                .map((bot) => ({ value: bot.id, label: bot.name })),
            disabled: () =>
              busy ||
              eligibleBots.every((bot) =>
                shows.some((show) => show.hostBotId === bot.id),
              ),
          }}
        >
          {(binding) => (
            <div
              {...binding}
              className={styles.signalBotPickerBinding}
              tabIndex={-1}
              data-botcast-delete-focus-fallback="true"
            >
              <SignalBotDropdown
                bots={eligibleBots.filter(
                  (bot) => !shows.some((show) => show.hostBotId === bot.id),
                )}
                selectedId={hostDraftId}
                searchValue={hostPickerSearch}
                onSearchChange={setHostPickerSearch}
                onSelect={setHostDraftId}
                ariaLabel="Choose a Signal host"
                listboxId="signal-create-host-options"
                theme={theme}
                renderBotGlyph={renderBotGlyph}
                disabled={busy}
              />
            </div>
          )}
        </PrismRefractTarget>
        <label htmlFor="botcast-premise-inspiration">
          Premise inspiration <span>optional</span>
        </label>
        <PrismRefractTarget
          target={{
            id: "signal-create-premise",
            kind: "field",
            label: "premise inspiration",
            read: () => showPremiseInspirationDraft,
            preview: setShowPremiseInspirationDraft,
            accept: setShowPremiseInspirationDraft,
            disabled: () => busy || !hostDraftId,
            generate: ({ currentValue, rejectedValues, signal }) =>
              generateSignalRefractDraft(
                { kind: "signal.create.premise", hostBotId: hostDraftId },
                currentValue,
                rejectedValues,
                signal,
              ),
          }}
        >
          {(binding) =>
            renderPickAwareComposer ? (
              <div {...binding} tabIndex={-1}>
                {renderPickAwareComposer({
                  id: "botcast-premise-inspiration",
                  value: showPremiseInspirationDraft,
                  onChange: setShowPremiseInspirationDraft,
                  placeholder:
                    "A spark, tension, or reason this show should exist",
                  multiline: true,
                  ariaLabel: "Premise inspiration",
                  className: styles.pickAwareSetupField,
                  disabled: busy,
                })}
              </div>
            ) : (
              <textarea
                {...binding}
                id="botcast-premise-inspiration"
                value={showPremiseInspirationDraft}
                maxLength={360}
                rows={3}
                placeholder="A spark, tension, or reason this show should exist"
                onChange={(event) =>
                  setShowPremiseInspirationDraft(event.target.value)
                }
              />
            )
          }
        </PrismRefractTarget>
        <button
          type="button"
          className={styles.createShowButton}
          onClick={() => void createShow()}
          disabled={!hostDraftId || busy}
        >
          Create show
        </button>
        <div className={styles.feelLuckyControl}>
          <button
            type="button"
            className={styles.feelLuckyButton}
            data-tutorial-target="botcast-feel-lucky"
            onClick={() => void feelLucky()}
            disabled={luckyLaunchDisabled}
            aria-busy={bookingSuggestionBusy === "lucky"}
            aria-label={
              shows.length === 0
                ? "I Feel Lucky! Create a show first."
                : "I Feel Lucky! Skip the search. Let Signal surprise you."
            }
            title={
              shows.length === 0
                ? "Create a show first."
                : "Skip the search. Let Signal surprise you."
            }
          >
            {bookingSuggestionBusy === "lucky" ? (
              <LoaderCircle data-loading="true" aria-hidden="true" />
            ) : (
              <span className={styles.feelLuckyPrism} aria-hidden="true" />
            )}
            I Feel Lucky!
          </button>
          <small>
            {shows.length === 0
              ? "Create a show to unlock the shortcut."
              : "Skip the search. Let Signal surprise you."}
          </small>
        </div>
      </div>
    </aside>
  );

  const renderStudioLayoutEditor = (
    show: BotcastShow,
    host: BotcastBotSummary,
    guest: BotcastBotSummary | null,
  ): React.JSX.Element => {
    const previewTheme = studioLayoutPreviewTheme;
    const stageAtmosphere = activeShowAtmosphere(show, previewTheme);
    const studioMix = normalizeBotcastStudioAtmosphereMix(show.atmosphereMix);
    const layout = normalizeBotcastStudioLayout(show.studioLayout);
    const cameraFraming = normalizeBotcastCameraFraming(show.cameraFraming);
    const previewCameraFrame = cameraFraming[studioCameraPreviewShot];
    const previewEpisodeImagePlacement = previewCameraFrame.episodeImage;
    const previewLogoPlacement = normalizeBotcastLogoPlacement(
      show.logoPlacement,
    );
    const studioGlowTuning = normalizeBotcastStudioGlowTuning(
      show.studioGlowTuning,
    );
    const hostHasCoffeeCup = botHasCoffeeCup(host);
    const guestHasCoffeeCup = guest ? botHasCoffeeCup(guest) : false;
    const studioHasCoffeeCup = hostHasCoffeeCup || guestHasCoffeeCup;
    const studioGlowTuningIsDefault = (["dark", "light"] as const).every(
      (glowTheme) =>
        studioGlowTuning[glowTheme].opacity ===
          BOTCAST_DEFAULT_STUDIO_GLOW_TUNING[glowTheme].opacity &&
        studioGlowTuning[glowTheme].blendMode ===
          BOTCAST_DEFAULT_STUDIO_GLOW_TUNING[glowTheme].blendMode,
    );
    const stagePresetBusy =
      studioStagePresetSaving ||
      studioLayoutSaving ||
      studioCameraFramingSaving ||
      studioLogoPlacementSaving ||
      studioGlowTuningSaving ||
      studioVoiceLevelsSaving ||
      studioAtmosphereMixSaving;
    const previewStudioGlowTuning = (
      glowTheme: "light" | "dark",
      update: Partial<BotcastStudioGlowThemeTuning>,
    ): void => {
      setStudioLayoutPreviewTheme(glowTheme);
      updateStudioGlowTuning(show, {
        ...studioGlowTuning,
        [glowTheme]: {
          ...studioGlowTuning[glowTheme],
          ...update,
        },
      });
    };
    const voiceLevelControl = (
      bot: BotcastBotSummary,
      role: "Host" | "Guest",
    ): React.JSX.Element => {
      const level = botcastVoiceLevelForBot(show.voiceLevelsByBotId, bot.id);
      return (
        <label key={bot.id}>
          <span>
            <span>
              <strong>{role}</strong>
              <small>{bot.name}</small>
            </span>
            <output>{Math.round(level * 100)}%</output>
          </span>
          <input
            type="range"
            min={0}
            max={BOTCAST_VOICE_LEVEL_MAX}
            step={BOTCAST_VOICE_LEVEL_STEP}
            value={level}
            aria-label={`${role} ${bot.name} voice level`}
            onChange={(event) =>
              updateStudioVoiceLevel(show, bot.id, event.currentTarget.value)
            }
          />
        </label>
      );
    };
    const stageStyle = {
      ["--botcast-accent" as string]: show.accentColor,
      ["--signal-film-grain-level" as string]: studioMix.filmGrain,
      ["--botcast-studio-accent" as string]: normalizeAccentForTheme(
        host.color ?? show.accentColor,
        previewTheme,
      ),
      ["--botcast-camera-offset-x" as string]: `${
        botcastCameraOffsetXPercent(
        studioCameraPreviewShot,
        layout,
        previewCameraFrame.zoom,
        ) + previewCameraFrame.panX
      }%`,
      ["--botcast-camera-offset-y" as string]: `${
        botcastCameraOffsetYPercent(
        studioCameraPreviewShot,
        layout,
        previewCameraFrame.zoom,
        ) + previewCameraFrame.panY
      }%`,
      ["--botcast-camera-zoom" as string]: previewCameraFrame.zoom,
      ...(signalStudioLightingStyle({
        show,
        layout,
        hostColor: host.color ?? show.accentColor,
        guestColor: guest?.color ?? show.accentColor,
        theme: previewTheme,
      }) ?? {}),
    } as CSSProperties;
    const floorGlowPreview = (
      role: "host" | "guest",
      color: string | null | undefined,
    ): ReactNode => (
      <div
        className={styles.signalFloorGlow}
        data-role={role}
        style={{
          ...signalStudioMaskedFloorGlowStyle(
            layout,
            role === "host" ? "hostFloorGlow" : "guestFloorGlow",
          ),
          ["--signal-floor-glow-color" as string]: normalizeAccentForTheme(
            color ?? show.accentColor,
            previewTheme,
          ),
        }}
      />
    );
    const layoutHandle = (
      item: BotcastStudioLayoutItem,
      child: ReactNode,
    ): React.JSX.Element => {
      const label = SIGNAL_STUDIO_LAYOUT_LABELS[item];
      const floorGlowRole = signalStudioFloorGlowRole(item);
      const floorGlowScalePercent = floorGlowRole
        ? Math.round(
            (layout[item].scale ?? BOTCAST_STUDIO_FLOOR_GLOW_SCALE_MAX) * 100,
          )
        : null;
      return (
        <div
          key={item}
          className={styles.stageLayoutHandle}
          data-kind={
            floorGlowRole ? "floor-glow" : item.endsWith("Bot") ? "bot" : "cup"
          }
          data-role={floorGlowRole ?? undefined}
          data-dragging={studioLayoutDraggingItem === item ? "true" : undefined}
          style={
            signalStudioLayoutItemIsFloorGlow(item)
              ? signalStudioFloorGlowHandleStyle(layout, item)
              : signalStudioPlacementStyle(layout, item)
          }
          role="button"
          tabIndex={0}
          aria-label={
            floorGlowRole
              ? `Move ${label} vertically and resize it horizontally. Current size ${floorGlowScalePercent}%. Use up and down arrow keys to move; left and right resize.`
              : `Move ${label}. Use arrow keys to nudge.`
          }
          onPointerDown={(event) => beginStudioLayoutDrag(event, show, item)}
          onPointerMove={moveStudioLayoutDrag}
          onPointerUp={finishStudioLayoutDrag}
          onPointerCancel={finishStudioLayoutDrag}
          onKeyDown={(event) => nudgeStudioLayoutItem(event, show, item)}
        >
          {child}
          <span className={styles.stageLayoutHandleLabel}>
            {label}
            {floorGlowScalePercent === null ? "" : ` ${floorGlowScalePercent}%`}
          </span>
        </div>
      );
    };
    const avatarPreview = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
    ): ReactNode => {
      const sfxVoiceBusGain =
        introAudioEnabled &&
        recordingVoiceSelection.voiceMode !== "mute" &&
        !bot.muted
          ? introAudioVolume *
            botcastVoiceLevelForBot(show.voiceLevelsByBotId, bot.id) *
            (bot.voiceGainMultiplier ?? 1)
          : 0;
      const speech =
        studioSoundcheckSpeech?.botId === bot.id
          ? studioSoundcheckSpeech
          : null;
      const talking = speech !== null;
      const mouthShape = speech
        ? crtSpeechMouthShapeAtAlignedElapsedMs({
            text: speech.text,
            elapsedMs: speech.elapsedMs,
            durationMs: speech.durationMs,
            alignment: speech.alignment,
          })
        : "closed";
      return (
        <div
          className={styles.avatarRig}
          data-signal-presence={role}
          data-soundcheck-talking={talking ? "true" : undefined}
        >
          {renderAvatar?.(bot, {
            talking,
            thinking: false,
            sipping: false,
            role,
            surface: "alignment",
            sfxEnabled: sfxVoiceBusGain > 0,
            sfxVoiceBusGain,
            facing: signalStudioFacingForRole(layout, role),
            theme: previewTheme,
            mouthShape,
          }) ?? avatarFallback(bot)}
        </div>
      );
    };
    const cupPreview = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
    ): ReactNode =>
      renderMug?.(bot, {
        role,
        facing: signalStudioFacingForRole(layout, role),
        theme: previewTheme,
        visual: buildCoffeeCupVisualState({
          seed: `signal:${bot.id}:${role}`,
          botColor: bot.color,
          theme: previewTheme,
          nowMs: 0,
          progressOverride: 0,
          sippingOverride: false,
        }),
      }) ?? (
        <span className={styles.mugFallback} aria-hidden="true">
          ☕
        </span>
      );
    return (
      <div
        className={styles.stageLayoutModalBackdrop}
        data-preview-theme={previewTheme}
      >
        <section
          className={styles.stageLayoutModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="signal-stage-layout-title"
          data-signal-stage-layout-modal="true"
        >
          <header className={styles.stageLayoutModalHeader}>
            <div>
              <span className={styles.eyebrow}>Rehearsal mode</span>
              <h2 id="signal-stage-layout-title">
                Rehearse {show.name}
              </h2>
              <p>Directly place the cast and props. Everything autosaves.</p>
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => {
                stopStudioSoundcheck();
                setStudioLayoutEditorOpen(false);
              }}
            >
              Done
            </button>
          </header>
          <div className={styles.stageLayoutModalBody}>
            <div
              className={styles.stageLayoutEditor}
              data-fine-tuning={studioFineTuningOpen ? "true" : "false"}
              data-tutorial-target="signal-studio-rehearsal"
            >
              <div className={styles.stageLayoutEditorHeader}>
                <p>
                  Drag each bot{studioHasCoffeeCup ? ", cup," : ""} and floor
                  glow into place. Arrow keys make fine adjustments.
                </p>
                <section
                  className={styles.stagePresetControls}
                  aria-label="Signal Rehearse Stage presets"
                >
                  <label>
                    <span>Stage preset</span>
                    <select
                      value={studioSelectedStagePresetId}
                      onChange={(event) =>
                        setStudioSelectedStagePresetId(event.target.value)
                      }
                      disabled={studioStagePresetsLoading || stagePresetBusy}
                    >
                      <option value="">
                        {studioStagePresetsLoading
                          ? "Loading presets…"
                          : "Choose a saved setup"}
                      </option>
                      {studioStagePresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      void applyStudioStagePreset(
                        show,
                        studioSelectedStagePresetId,
                      )
                    }
                    disabled={
                      !studioSelectedStagePresetId || stagePresetBusy
                    }
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    aria-label="Delete selected Signal stage preset"
                    onClick={() =>
                      void deleteStudioStagePreset(studioSelectedStagePresetId)
                    }
                    disabled={
                      !studioSelectedStagePresetId || stagePresetBusy
                    }
                  >
                    Delete
                  </button>
                  <div className={styles.stagePresetSaveRow}>
                    <input
                      value={studioStagePresetNameDraft}
                      maxLength={80}
                      placeholder="Name this setup"
                      aria-label="Signal stage preset name"
                      onChange={(event) =>
                        setStudioStagePresetNameDraft(event.target.value)
                      }
                      disabled={stagePresetBusy}
                    />
                    <button
                      type="button"
                      onClick={() => void saveStudioStagePreset(show)}
                      disabled={
                        !studioStagePresetNameDraft.trim() ||
                        stagePresetBusy
                      }
                    >
                      Save preset
                    </button>
                  </div>
                  <small>
                    Applies placement, cameras, screen treatment, room mix, and
                    saved voice levels—never the show, cast, or artwork.
                  </small>
                </section>
                <div>
                  <div
                    className={styles.stageLayoutThemeToggle}
                    role="group"
                    aria-label="Studio preview theme"
                  >
                    <button
                      type="button"
                      aria-pressed={previewTheme === "light"}
                      onClick={() => setStudioLayoutPreviewTheme("light")}
                    >
                      Light
                    </button>
                    <button
                      type="button"
                      aria-pressed={previewTheme === "dark"}
                      onClick={() => setStudioLayoutPreviewTheme("dark")}
                    >
                      Dark
                    </button>
                  </div>
                  <span aria-live="polite">
                    {studioLayoutSaving ||
                    studioCameraFramingSaving ||
                    studioLogoPlacementSaving ||
                    studioGlowTuningSaving ||
                    studioVoiceLevelsSaving ||
                    studioAtmosphereMixSaving
                      ? "Saving studio…"
                      : "Studio settings saved"}
                  </span>
                  <button
                    type="button"
                    className={styles.stageFineTuningToggle}
                    aria-expanded={studioFineTuningOpen}
                    aria-controls="signal-rehearsal-soundcheck signal-rehearsal-voices signal-rehearsal-camera signal-rehearsal-screen signal-rehearsal-atmosphere"
                    onClick={() =>
                      setStudioFineTuningOpen((current) => !current)
                    }
                  >
                    {studioFineTuningOpen ? "Hide fine tuning" : "Fine tuning"}
                  </button>
                  {studioFineTuningOpen ? (
                    <>
                      <button
                        type="button"
                        onClick={() => swapStudioLayoutSeats(show)}
                      >
                        Swap seats
                      </button>
                      <button
                        type="button"
                        onClick={() => resetStudioLayout(show)}
                      >
                        Reset positions
                      </button>
                      <button
                        type="button"
                        className={styles.stageSoundcheckButton}
                        data-active={
                          studioSoundcheckRunning ? "true" : undefined
                        }
                        onClick={() => {
                          if (studioSoundcheckRunning) {
                            stopStudioSoundcheck();
                          } else if (guest) {
                            void runStudioSoundcheck(show, host, guest);
                          }
                        }}
                        disabled={!guest || !introAudioEnabled || !onUtterance}
                        aria-pressed={studioSoundcheckRunning}
                      >
                        {studioSoundcheckRunning
                          ? "■ Stop check"
                          : "▶ Test voices"}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div
                className={styles.stageSoundcheckStatus}
                id="signal-rehearsal-soundcheck"
                hidden={!studioFineTuningOpen}
                data-active={studioSoundcheckCaption ? "true" : undefined}
                aria-live="polite"
              >
                {studioSoundcheckCaption ? (
                  <>
                    <strong>{studioSoundcheckCaption.speakerName}</strong>
                    <span>{studioSoundcheckCaption.text}</span>
                  </>
                ) : (
                  <span>
                    {introAudioEnabled
                      ? "Ambience is live. Test both voices against the room mix."
                      : "Turn voice audio on to test the bots and room mix."}
                  </span>
                )}
              </div>
              <section
                id="signal-rehearsal-voices"
                className={styles.stageVoiceMixer}
                hidden={!studioFineTuningOpen}
                aria-label="Signal voice level mixer"
              >
                <header>
                  <div>
                    <span className={styles.eyebrow}>Voice levels</span>
                    <strong>Balance the cast</strong>
                  </div>
                  <small>Saved for each bot on this show</small>
                </header>
                <div className={styles.stageVoiceMixerSliders}>
                  {voiceLevelControl(host, "Host")}
                  {guest ? voiceLevelControl(guest, "Guest") : null}
                </div>
              </section>
              <div className={styles.stageViewportColumn}>
                <section
                  className={styles.stageViewport}
                  data-shot={studioCameraPreviewShot}
                  data-layout-editor="true"
                  data-signal-layout-stage="true"
                  data-studio-source={
                    stageAtmosphere.imageUrl ? "image" : "fallback"
                  }
                  style={stageStyle}
                  aria-label={`Rehearse the ${show.name} studio stage`}
                >
                  <div className={styles.stageScene}>
                    {!stageAtmosphere.imageUrl ? (
                      <div className={styles.atmosphere} aria-hidden="true">
                        <SignalFallbackStudio
                          surface="stage"
                          accentVariant={show.fallbackStudioAccentVariant}
                        />
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- user-generated studio URLs require direct, stable source identity.
                      <img
                        className={styles.atmosphere}
                        src={stageAtmosphere.imageUrl}
                        alt=""
                        aria-hidden="true"
                      />
                    )}
                    <SignalStudioMicrophoneTint
                      atmosphere={stageAtmosphere}
                      layout={layout}
                      hostColor={host.color ?? show.accentColor}
                      guestColor={guest?.color ?? show.accentColor}
                      theme={previewTheme}
                    />
                    <div
                      className={styles.wordmark}
                      data-rehearsal-logo="true"
                      data-dragging={
                        studioLogoPlacementDragging ? "true" : undefined
                      }
                      style={signalLogoPlacementStyle(previewLogoPlacement)}
                      role="button"
                      tabIndex={0}
                      aria-label="Show logo placement. Drag to move; use arrow keys to nudge."
                      onPointerDown={(event) =>
                        beginStudioLogoPlacementDrag(event, show)
                      }
                      onPointerMove={moveStudioLogoPlacementDrag}
                      onPointerUp={finishStudioLogoPlacementDrag}
                      onPointerCancel={finishStudioLogoPlacementDrag}
                      onKeyDown={(event) =>
                        nudgeStudioLogoPlacement(event, show)
                      }
                    >
                      <SignalShowLogo show={show} />
                      <strong>{show.name}</strong>
                    </div>
                    <div
                      className={styles.studioGlow}
                      data-generated-lighting={
                        show.studioLighting?.status === "ready"
                          ? "true"
                          : undefined
                      }
                      data-talk-reactive="true"
                      data-host-talking={
                        studioSoundcheckSpeech?.botId === host.id
                          ? "true"
                          : undefined
                      }
                      data-guest-talking={
                        guest && studioSoundcheckSpeech?.botId === guest.id
                          ? "true"
                          : undefined
                      }
                      aria-hidden="true"
                    />
                    <div
                      className={styles.signalFloorGlowLayer}
                      aria-hidden="true"
                    >
                      {floorGlowPreview("host", host.color)}
                      {floorGlowPreview("guest", guest?.color)}
                    </div>
                    {show.studioLighting?.status !== "ready" ? (
                      <SignalStudioSpotlight />
                    ) : null}
                    {layoutHandle("hostFloorGlow", null)}
                    {layoutHandle("guestFloorGlow", null)}
                    {layoutHandle("hostBot", avatarPreview(host, "host"))}
                    {hostHasCoffeeCup
                      ? layoutHandle("hostCup", cupPreview(host, "host"))
                      : null}
                    {guest
                      ? layoutHandle("guestBot", avatarPreview(guest, "guest"))
                      : null}
                    {guest && guestHasCoffeeCup
                      ? layoutHandle("guestCup", cupPreview(guest, "guest"))
                      : null}
                  </div>
                  <div
                    className={styles.episodeImageContext}
                    data-image-kind={studioEpisodeImageKindPreview}
                    data-rehearsal-prop="true"
                    data-camera-shot={studioCameraPreviewShot}
                    data-dragging={
                      studioEpisodeImageDraggingShot === studioCameraPreviewShot
                        ? "true"
                        : undefined
                    }
                    style={signalEpisodeImagePlacementStyle(
                      previewEpisodeImagePlacement,
                      studioEpisodeImageKindPreview,
                    )}
                    role="button"
                    tabIndex={0}
                    aria-label={`${studioCameraPreviewShot} ${
                      studioEpisodeImageKindPreview === "item"
                        ? "item"
                        : "photo"
                    } placement preview. Drag to move; use arrow keys to nudge.`}
                    onPointerDown={(event) =>
                      beginStudioEpisodeImagePlacementDrag(
                        event,
                        studioCameraPreviewShot,
                      )
                    }
                    onPointerMove={moveStudioEpisodeImagePlacementDrag}
                    onPointerUp={finishStudioEpisodeImagePlacementDrag}
                    onPointerCancel={finishStudioEpisodeImagePlacementDrag}
                    onKeyDown={(event) =>
                      nudgeStudioEpisodeImagePlacement(
                        event,
                        studioCameraPreviewShot,
                      )
                    }
                  >
                    <span
                      className={styles.episodeImageRehearsalArt}
                      data-image-kind={studioEpisodeImageKindPreview}
                      aria-hidden="true"
                    >
                      <span />
                    </span>
                    <span className={styles.stageLayoutHandleLabel}>
                      {studioEpisodeImageKindPreview === "item"
                        ? "Item preview"
                        : "Photo preview"}
                    </span>
                  </div>
                </section>
                <section
                  id="signal-rehearsal-camera"
                  className={styles.stageCameraTuner}
                  aria-label="Show camera alignment"
                >
                  <header>
                    <div
                      className={styles.stageCameraShotToggle}
                      role="group"
                      aria-label="Camera to align"
                    >
                      {(["left", "right", "wide"] as const).map((shot) => (
                        <button
                          key={shot}
                          type="button"
                          aria-pressed={studioCameraPreviewShot === shot}
                          onClick={() => setStudioCameraPreviewShot(shot)}
                        >
                          {shot[0]!.toUpperCase() + shot.slice(1)}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateStudioCameraFrame(
                          show,
                          studioCameraPreviewShot,
                          {
                            zoom:
                              BOTCAST_DEFAULT_CAMERA_FRAMING[
                                studioCameraPreviewShot
                              ].zoom,
                            panX: 0,
                            panY: 0,
                          },
                        )
                      }
                      disabled={
                        previewCameraFrame.zoom ===
                          BOTCAST_DEFAULT_CAMERA_FRAMING[
                            studioCameraPreviewShot
                          ].zoom &&
                        previewCameraFrame.panX === 0 &&
                        previewCameraFrame.panY === 0
                      }
                    >
                      Reset camera
                    </button>
                  </header>
                  <div className={styles.stageCameraSliders}>
                    <label>
                      <span>
                        Zoom
                        <output>{previewCameraFrame.zoom.toFixed(2)}×</output>
                      </span>
                      <input
                        type="range"
                        min={BOTCAST_CAMERA_ZOOM_MIN}
                        max={BOTCAST_CAMERA_ZOOM_MAX}
                        step={BOTCAST_CAMERA_ZOOM_STEP}
                        value={previewCameraFrame.zoom}
                        aria-label={`${studioCameraPreviewShot} camera zoom`}
                        onChange={(event) =>
                          updateStudioCameraFrame(
                            show,
                            studioCameraPreviewShot,
                            { zoom: Number(event.currentTarget.value) },
                          )
                        }
                      />
                    </label>
                    {(["panX", "panY"] as const).map((axis) => (
                      <label key={axis}>
                        <span>
                          {axis === "panX" ? "Pan X" : "Pan Y"}
                          <output>
                            {previewCameraFrame[axis] > 0 ? "+" : ""}
                            {previewCameraFrame[axis].toFixed(2)}%
                          </output>
                        </span>
                        <input
                          type="range"
                          min={BOTCAST_CAMERA_PAN_MIN}
                          max={BOTCAST_CAMERA_PAN_MAX}
                          step={BOTCAST_CAMERA_PAN_STEP}
                          value={previewCameraFrame[axis]}
                          aria-label={`${studioCameraPreviewShot} camera ${
                            axis === "panX" ? "horizontal" : "vertical"
                          } pan`}
                          onChange={(event) =>
                            updateStudioCameraFrame(
                              show,
                              studioCameraPreviewShot,
                              { [axis]: Number(event.currentTarget.value) },
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div
                    className={styles.stageEpisodeImageTuner}
                    data-signal-episode-image-placement="true"
                  >
                    <header>
                      <div>
                        <span className={styles.eyebrow}>Episode image</span>
                        <strong>
                          {studioCameraPreviewShot[0]!.toUpperCase() +
                            studioCameraPreviewShot.slice(1)}{" "}
                          placement
                        </strong>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateStudioEpisodeImagePlacement(
                            show,
                            studioCameraPreviewShot,
                            BOTCAST_DEFAULT_CAMERA_FRAMING[
                              studioCameraPreviewShot
                            ].episodeImage,
                          )
                        }
                        disabled={
                          previewEpisodeImagePlacement.x ===
                            BOTCAST_DEFAULT_CAMERA_FRAMING[
                              studioCameraPreviewShot
                            ].episodeImage.x &&
                          previewEpisodeImagePlacement.y ===
                            BOTCAST_DEFAULT_CAMERA_FRAMING[
                              studioCameraPreviewShot
                            ].episodeImage.y &&
                          previewEpisodeImagePlacement.itemScale ===
                            BOTCAST_DEFAULT_CAMERA_FRAMING[
                              studioCameraPreviewShot
                            ].episodeImage.itemScale &&
                          previewEpisodeImagePlacement.photoScale ===
                            BOTCAST_DEFAULT_CAMERA_FRAMING[
                              studioCameraPreviewShot
                            ].episodeImage.photoScale
                        }
                      >
                        Reset image
                      </button>
                    </header>
                    <div
                      className={styles.stageEpisodeImageKindToggle}
                      role="group"
                      aria-label="Episode image preview"
                    >
                      <button
                        type="button"
                        aria-pressed={studioEpisodeImageKindPreview === "item"}
                        onClick={() =>
                          setStudioEpisodeImageKindPreview("item")
                        }
                      >
                        Item
                      </button>
                      <button
                        type="button"
                        aria-pressed={
                          studioEpisodeImageKindPreview === "picture"
                        }
                        onClick={() =>
                          setStudioEpisodeImageKindPreview("picture")
                        }
                      >
                        Photo
                      </button>
                    </div>
                    <div className={styles.stageCameraSliders}>
                      {(
                        ["itemScale", "photoScale", "x", "y"] as const
                      ).map((control) => {
                        const sizeControl =
                          control === "itemScale" || control === "photoScale";
                        const label =
                          control === "itemScale"
                            ? "Item size"
                            : control === "photoScale"
                              ? "Photo size"
                              : control.toUpperCase();
                        return (
                          <label key={control}>
                            <span>
                              {label}
                              <output>
                                {previewEpisodeImagePlacement[control]}
                                %
                              </output>
                            </span>
                            <input
                              type="range"
                              min={
                                sizeControl
                                  ? BOTCAST_EPISODE_IMAGE_SCALE_MIN
                                  : BOTCAST_EPISODE_IMAGE_POSITION_MIN
                              }
                              max={
                                sizeControl
                                  ? BOTCAST_EPISODE_IMAGE_SCALE_MAX
                                  : BOTCAST_EPISODE_IMAGE_POSITION_MAX
                              }
                              step={
                                sizeControl
                                  ? BOTCAST_EPISODE_IMAGE_SCALE_STEP
                                  : BOTCAST_EPISODE_IMAGE_POSITION_STEP
                              }
                              value={previewEpisodeImagePlacement[control]}
                              aria-label={`${studioCameraPreviewShot} episode image ${label.toLowerCase()}`}
                              onChange={(event) =>
                                updateStudioEpisodeImagePlacement(
                                  show,
                                  studioCameraPreviewShot,
                                  {
                                    ...previewEpisodeImagePlacement,
                                    [control]: Number(
                                      event.currentTarget.value,
                                    ),
                                  },
                                )
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                    <small>
                      Select Item or Photo to see its real stage treatment, then
                      drag the visible prop into place. Auto follows the active
                      Left, Right, or Wide camera. Item and Photo share each
                      camera&apos;s X/Y, but keep separate sizes for this show. The
                      preview switch itself is not saved.
                    </small>
                  </div>
                  <div
                    className={styles.stageEpisodeImageTuner}
                    data-signal-logo-placement="true"
                  >
                    <header>
                      <div>
                        <span className={styles.eyebrow}>Center screen</span>
                        <strong>Show logo placement</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateStudioLogoPlacement(
                            show,
                            BOTCAST_DEFAULT_LOGO_PLACEMENT,
                          )
                        }
                        disabled={
                          previewLogoPlacement.x ===
                            BOTCAST_DEFAULT_LOGO_PLACEMENT.x &&
                          previewLogoPlacement.y ===
                            BOTCAST_DEFAULT_LOGO_PLACEMENT.y &&
                          previewLogoPlacement.scale ===
                            BOTCAST_DEFAULT_LOGO_PLACEMENT.scale
                        }
                      >
                        Reset logo
                      </button>
                    </header>
                    <div className={styles.stageCameraSliders}>
                      {(["scale", "x", "y"] as const).map((control) => {
                        const scaleControl = control === "scale";
                        const label = scaleControl
                          ? "Scale"
                          : control.toUpperCase();
                        return (
                          <label key={control}>
                            <span>
                              {label}
                              <output>{previewLogoPlacement[control]}%</output>
                            </span>
                            <input
                              type="range"
                              min={
                                scaleControl
                                  ? BOTCAST_EPISODE_IMAGE_SCALE_MIN
                                  : BOTCAST_EPISODE_IMAGE_POSITION_MIN
                              }
                              max={
                                scaleControl
                                  ? BOTCAST_EPISODE_IMAGE_SCALE_MAX
                                  : BOTCAST_EPISODE_IMAGE_POSITION_MAX
                              }
                              step={
                                scaleControl
                                  ? BOTCAST_EPISODE_IMAGE_SCALE_STEP
                                  : BOTCAST_EPISODE_IMAGE_POSITION_STEP
                              }
                              value={previewLogoPlacement[control]}
                              aria-label={`show logo ${label.toLowerCase()}`}
                              onChange={(event) =>
                                updateStudioLogoPlacement(show, {
                                  ...previewLogoPlacement,
                                  [control]: Number(
                                    event.currentTarget.value,
                                  ),
                                })
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                    <small>
                      Saved only for this show. Drag the logo and title together
                      on stage or tune X, Y, and Scale here.
                    </small>
                  </div>
                </section>
              </div>
              <section
                id="signal-rehearsal-screen"
                className={styles.stageScreenTreatment}
                hidden={!studioFineTuningOpen}
                aria-label="Signal screen treatment"
              >
                <header>
                  <div>
                    <span className={styles.eyebrow}>Screen</span>
                    <strong>Film treatment</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateStudioAtmosphereMix(show, {
                        ...studioMix,
                        filmGrain: BOTCAST_DEFAULT_STUDIO_FILM_GRAIN,
                      })
                    }
                    disabled={
                      studioMix.filmGrain === BOTCAST_DEFAULT_STUDIO_FILM_GRAIN
                    }
                  >
                    Reset
                  </button>
                </header>
                <label>
                  <span>
                    Film grain
                    <output>{Math.round(studioMix.filmGrain * 100)}%</output>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={BOTCAST_STUDIO_FILM_GRAIN_MAX}
                    step={0.05}
                    value={studioMix.filmGrain}
                    aria-label="Film grain strength"
                    onChange={(event) =>
                      updateStudioAtmosphereMix(show, {
                        ...studioMix,
                        filmGrain: Number(event.currentTarget.value),
                      })
                    }
                  />
                </label>
                <small>Applies to the full live and replay screen.</small>
                <div
                  className={styles.stageStudioGlowTuner}
                  data-signal-studio-glow-tuner="true"
                >
                  <header>
                    <div>
                      <span className={styles.eyebrow}>Underglow</span>
                      <strong>Lighting lab</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateStudioGlowTuning(show, {
                          dark: { ...BOTCAST_DEFAULT_STUDIO_GLOW_TUNING.dark },
                          light: {
                            ...BOTCAST_DEFAULT_STUDIO_GLOW_TUNING.light,
                          },
                        })
                      }
                      disabled={studioGlowTuningIsDefault}
                    >
                      Reset
                    </button>
                  </header>
                  <div className={styles.stageStudioGlowTunerRows}>
                    {(["dark", "light"] as const).map((glowTheme) => {
                      const setting = studioGlowTuning[glowTheme];
                      const label = glowTheme === "dark" ? "Dark" : "Light";
                      return (
                        <div
                          key={glowTheme}
                          className={styles.stageStudioGlowTunerRow}
                          data-active={
                            previewTheme === glowTheme ? "true" : undefined
                          }
                        >
                          <label>
                            <span>
                              <strong>{label}</strong>
                              <output>
                                {Math.round(setting.opacity * 100)}%
                              </output>
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.02}
                              value={setting.opacity}
                              aria-label={`${label} underglow opacity`}
                              onFocus={() =>
                                setStudioLayoutPreviewTheme(glowTheme)
                              }
                              onChange={(event) =>
                                previewStudioGlowTuning(glowTheme, {
                                  opacity: Number(event.currentTarget.value),
                                })
                              }
                            />
                          </label>
                          <div
                            className={styles.stageStudioGlowBlendToggle}
                            role="group"
                            aria-label={`${label} underglow blend mode`}
                          >
                            {(["hard-light", "screen", "overlay"] as const).map(
                              (blendMode) => (
                                <button
                                  key={blendMode}
                                  type="button"
                                  aria-pressed={setting.blendMode === blendMode}
                                  onClick={() =>
                                    previewStudioGlowTuning(glowTheme, {
                                      blendMode,
                                    })
                                  }
                                >
                                  {blendMode === "hard-light"
                                    ? "Hard Light"
                                    : blendMode === "screen"
                                      ? "Screen"
                                      : "Overlay"}
                                </button>
                              ),
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <small>
                    Saved for this show. New shows start at 100% Hard Light.
                  </small>
                </div>
              </section>
              <div
                id="signal-rehearsal-atmosphere"
                className={styles.stageFineTuningAtmosphere}
                hidden={!studioFineTuningOpen}
              >
                {renderAtmosphereMixer(show)}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  };

  const renderEpisodeSetup = (): React.JSX.Element | null => {
    if (!selectedShow || !hostBot) return null;
    const guestOptions = eligibleBots.filter((bot) => bot.id !== hostBot.id);
    const producerGuestSelected = guestDraftId === BOTCAST_PRODUCER_GUEST_ID;
    const selectedEpisodeModelOption = episodeModelDraft
      ? (modelOptions.find((option) => option.id === episodeModelDraft) ?? null)
      : null;
    const episodeModelProvider =
      selectedEpisodeModelOption?.provider ?? preferredProvider;
    // A bot guest can discuss the same private, session-only image in either
    // live Produce or spectator Watch. A Producer guest remains in the
    // human-answer contract and cannot attach one.
    const setupImageModeEligible = !producerGuestSelected;
    const setupImageModelCapable =
      signalEpisodeModelChoiceSupportsImageInput(
        modelOptions,
        episodeModelDraft,
      );
    const setupImageAttachDisabled =
      !setupImageModeEligible ||
      !setupImageModelCapable ||
      busy ||
      Boolean(bookingSuggestionBusy) ||
      imageUploadBusy;
    const selectSetupProducerImage = async (file: File): Promise<void> => {
      if (setupImageAttachDisabled) return;
      setImageUploadBusy(true);
      setError(null);
      try {
        const fileInput = await readSignalEpisodeImageFile(file);
        const imageId = crypto.randomUUID();
        const replayMetadata = await acquireSignalEpisodeImageReplayMetadata(
          fileInput,
        );
        setSetupEpisodeImage({
          imageId,
          ...fileInput,
          descriptor: replayMetadata.descriptor,
          replayEmoji: replayMetadata.replayEmoji,
          reason: "",
        });
        setNotice(
          `${replayMetadata.descriptor.name} is attached to tonight's setup. Signal will place it automatically during the interview.`,
        );
      } catch (caught) {
        setError(signalErrorToast("Attach setup image", caught));
      } finally {
        setImageUploadBusy(false);
        if (setupProducerImageInputRef.current) {
          setupProducerImageInputRef.current.value = "";
        }
      }
    };
    const latestEpisodes = Array.from(
      episodes
        .filter(
          (item) => item.status === "completed" || item.status === "cancelled",
        )
        .reduce((latestByGuest, item) => {
          const guestKey =
            item.guestKind === "producer"
              ? BOTCAST_PRODUCER_GUEST_ID
              : item.guestBotId;
          // Episodes arrive newest-first, so the first setup replaces history.
          if (!latestByGuest.has(guestKey)) {
            latestByGuest.set(guestKey, item);
          }
          return latestByGuest;
        }, new Map<string, BotcastEpisodeSummary>())
        .values(),
    ).slice(0, 5);
    const reuseEpisodeSetup = async (
      summary: BotcastEpisodeSummary,
    ): Promise<void> => {
      if (episodeSetupLoadingId !== null) return;
      const expectedShowId = selectedShow.id;
      setEpisodeSetupLoadingId(summary.id);
      setError(null);
      try {
        const [detail, retryMetadata] = await Promise.all([
          loadEpisode(summary.id),
          request<SignalEpisodeRetryMetadata>(
            `/api/botcast/episodes/${encodeURIComponent(summary.id)}/retry-metadata`,
          ),
        ]);
        if (selectedShowIdRef.current !== expectedShowId) return;
        if (detail.guestKind === "producer") {
          setGuestDraftId(BOTCAST_PRODUCER_GUEST_ID);
          setProducerGuestContextDraft(detail.guestContext ?? "");
          setTopicDraft("");
          setProducerBriefDraft("");
          setGuestBriefDraft("");
          if (modelChoice === undefined) {
            setEpisodeModelDraft(
              botcastEpisodeModelSelectionKind(detail) === "auto"
                ? ""
                : detail.model &&
                    modelOptions.some((option) => option.id === detail.model)
                  ? detail.model
                  : "",
            );
          }
          setEpisodeDurationDraft(detail.durationMinutes);
          setNotice(
            `Loaded “${detail.title}” as a fresh Producer-guest setup. Signal will resynthesize the interview from the saved context before you go live.`,
          );
          return;
        }
        const retry = signalEpisodeRetryDraft({
          episode: detail,
          availableGuestIds: guestOptions.map((bot) => bot.id),
          availableModelIds: modelOptions.map((option) => option.id),
          currentResponseMode: responseMode,
          retryMetadata,
        });
        setGuestDraftId(retry.guestId);
        setTopicDraft(retry.topic);
        setProducerBriefDraft(retry.producerBrief);
        setGuestBriefDraft(retry.guestBrief);
        setSetupEpisodeImage(
          retry.image
            ? {
                imageId: retry.image.imageId,
                // The server resolves this exact booking's authenticated WebP
                // archive proxy. No original upload is retained or reread.
                fileName: `archived-signal-image.${
                  retry.image.descriptor.mimeType === "image/png" ? "png" : "jpg"
                }`,
                dataUrl: "",
                archivalProxyEpisodeId: retry.image.sourceEpisodeId,
                descriptor: retry.image.descriptor,
                replayEmoji: retry.image.replayEmoji,
                reason: retry.image.reason,
              }
            : null,
        );
        if (modelChoice === undefined) {
          setEpisodeModelDraft(retry.modelId);
        }
        setEpisodeDurationDraft(retry.durationMinutes);

        const caveats: string[] = [];
        if (!retry.guestAvailable) {
          caveats.push(
            "The original guest is no longer available, so choose another.",
          );
        }
        if (retry.modelUnavailable) {
          caveats.push(
            "The original model is no longer available, so Auto is selected.",
          );
        }
        if (retry.modeChanged) {
          caveats.push(`Episode mode stays ${responseMode.toUpperCase()}.`);
        }
        setNotice(
          `Loaded “${detail.title}” into tonight’s setup.${
            caveats.length
              ? ` ${caveats.join(" ")}`
              : " Everything remains editable."
          }`,
        );
      } catch (reuseError) {
        if (selectedShowIdRef.current === expectedShowId) {
          setError(signalErrorToast("Reuse episode setup", reuseError));
        }
      } finally {
        setEpisodeSetupLoadingId((current) =>
          current === summary.id ? null : current,
        );
      }
    };
    const randomizeBooking = async (
      direction = "",
      anchoredGuestId?: string,
    ): Promise<void> => {
      if (bookingSuggestionBusy) return;
      const guestId =
        anchoredGuestId ??
        (direction
          ? guestDraftId
          : randomSignalEpisodeGuestId({
              candidateGuestIds: guestOptions.map((bot) => bot.id),
              hostBotId: hostBot.id,
              currentGuestId: guestDraftId,
            }));
      if (!guestId) return;
      if (anchoredGuestId) setGuestDraftId(anchoredGuestId);
      setBookingSuggestionBusy("booking");
      setError(null);
      setNotice(null);
      try {
        const response = await request<{
          topic: string;
          producerBrief: string;
          guestBrief: string;
          guestBotId?: string;
          generated: boolean;
        }>(
          `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/booking-suggestion`,
          {
            method: "POST",
            body: JSON.stringify({
              guestBotId: guestId,
              field: "booking",
              currentTopic: topicDraft,
              currentProducerBrief: producerBriefDraft,
              preferredProvider: episodeModelProvider,
              responseMode,
              modelOverride: selectedEpisodeModelOption?.id ?? null,
              ...(direction ? { direction } : {}),
            }),
          },
        );
        const topic = response.topic.trim();
        const producerBrief = response.producerBrief.trim();
        const guestBrief = response.guestBrief.trim();
        const resolvedGuestId = resolvedSignalBookingGuestId({
          anchoredGuestId,
          suggestedGuestId: response.guestBotId,
          requestedGuestId: guestId,
        });
        const bookingGuest = resolvedGuestId
          ? botsById.get(resolvedGuestId)
          : undefined;
        if (
          !response.generated ||
          !topic ||
          !producerBrief ||
          !guestBrief ||
          !resolvedGuestId ||
          !bookingGuest
        ) {
          throw new Error("Signal could not produce this booking.");
        }
        setGuestDraftId(resolvedGuestId);
        setTopicDraft(topic);
        setProducerBriefDraft(producerBrief);
        setGuestBriefDraft(guestBrief);
        setNotice(
          `${bookingGuest.name} is booked with a short public title and separate private host and guest briefings. Everything remains editable.`,
        );
      } catch (bookingError) {
        setError(
          signalErrorToast(
            "Book Signal guest",
            bookingError instanceof Error
              ? bookingError
              : "Signal could not produce this booking.",
          ),
        );
      } finally {
        setBookingSuggestionBusy(null);
      }
    };
    return (
      <div
        className={styles.productionDesk}
        data-tutorial-target="botcast-setup"
      >
        <div className={styles.productionHeading}>
          <div>
            <span className={styles.eyebrow}>Tonight’s production</span>
            <h2>
              {producerGuestSelected
                ? "Take the guest chair. Give a direction—or be surprised."
                : "Book the guest. Set the angle."}
            </h2>
          </div>
          <div className={styles.productionHeadingActions}>
            <PrismRefractTarget
              target={{
                id: `signal-book-for-me-${selectedShow.id}`,
                kind: "magic",
                label: "Book for me",
                run: randomizeBooking,
                disabled: () =>
                  busy ||
                  Boolean(bookingSuggestionBusy) ||
                  producerGuestSelected ||
                  guestOptions.length === 0,
              }}
            >
              {(binding) => (
                <button
                  {...binding}
                  type="button"
                  className={styles.randomizeBookingButton}
                  onClick={() => void randomizeBooking()}
                  disabled={
                    busy ||
                    Boolean(bookingSuggestionBusy) ||
                    producerGuestSelected ||
                    guestOptions.length === 0
                  }
                  aria-busy={bookingSuggestionBusy === "booking"}
                >
                  {bookingSuggestionBusy === "booking" ? (
                    <>
                      <LoaderCircle data-loading="true" aria-hidden="true" />
                      Booking…
                    </>
                  ) : (
                    "Book for me"
                  )}
                </button>
              )}
            </PrismRefractTarget>
            <button
              type="button"
              data-tutorial-target="botcast-stage-layout"
              onClick={openStudioLayoutEditor}
            >
              Rehearse stage
            </button>
          </div>
        </div>
        <section
          className={styles.latestEpisodes}
          data-tutorial-target="botcast-latest-episodes"
          aria-label="Latest Signal episodes available to reuse"
        >
          <div className={styles.latestEpisodesHeading}>
            <div>
              <span className={styles.eyebrow}>Retry a booking</span>
              <h3>Latest episodes</h3>
            </div>
            <p>
              Choose one to restore the setup below. Nothing starts until you
              say so.
            </p>
          </div>
          {latestEpisodes.length > 0 ? (
            <ul className={styles.latestEpisodeList}>
              {latestEpisodes.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void reuseEpisodeSetup(item)}
                    disabled={busy || episodeSetupLoadingId !== null}
                    data-loading={
                      episodeSetupLoadingId === item.id ? "true" : undefined
                    }
                    aria-label={`Use setup from ${item.title}`}
                  >
                    <span className={styles.latestEpisodeDate}>
                      {new Date(item.startedAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.guestKind === "producer"
                        ? (item.guestName ?? producerName)
                        : (botsById.get(item.guestBotId)?.name ?? "Guest")}{" "}
                      ·{" "}
                      {item.status === "cancelled"
                        ? "Early cut · setup only"
                        : runtimeLabel(item.runtimeMs)}
                    </small>
                    <span className={styles.latestEpisodeUse}>
                      {episodeSetupLoadingId === item.id
                        ? "Loading…"
                        : "Use setup"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.latestEpisodesEmpty}>
              Complete or cancel an episode and its booking will be ready to
              reuse here.
            </p>
          )}
        </section>
        <div className={styles.setupGrid}>
          <div className={styles.signalGuestPickerField}>
            <span className={styles.signalGuestPickerLabel}>Guest</span>
            <PrismRefractTarget
              target={{
                id: `signal-episode-guest-${selectedShow.id}`,
                kind: "choice",
                label: "episode guest",
                read: () => guestDraftId,
                preview: setGuestDraftId,
                accept: setGuestDraftId,
                choices: () =>
                  guestOptions.map((bot) => ({
                    value: bot.id,
                    label: bot.name,
                  })),
                disabled: () =>
                  busy ||
                  Boolean(bookingSuggestionBusy) ||
                  guestOptions.length === 0,
              }}
            >
              {(binding) => (
                <div
                  {...binding}
                  className={styles.signalBotPickerBinding}
                  tabIndex={-1}
                  aria-disabled={
                    busy || Boolean(bookingSuggestionBusy) ? true : undefined
                  }
                >
                  <div
                    className={styles.producerGuestModeList}
                    role="group"
                    aria-label="Episode mode"
                  >
                    <button
                      type="button"
                      className={styles.producerGuestPickerOption}
                      data-selected={producerGuestSelected ? "true" : undefined}
                      aria-pressed={producerGuestSelected}
                      disabled={busy || Boolean(bookingSuggestionBusy)}
                      onClick={() => {
                        setPlaybackModeDraft("live");
                        setGuestDraftId(BOTCAST_PRODUCER_GUEST_ID);
                      }}
                    >
                      <strong>Me</strong>
                      <span>Get interviewed</span>
                    </button>
                    <button
                      type="button"
                      className={styles.producerGuestPickerOption}
                      data-selected={
                        !producerGuestSelected && playbackModeDraft === "live"
                          ? "true"
                          : undefined
                      }
                      aria-pressed={
                        !producerGuestSelected && playbackModeDraft === "live"
                      }
                      disabled={busy || Boolean(bookingSuggestionBusy)}
                      onClick={() => {
                        setPlaybackModeDraft("live");
                        if (guestDraftId === BOTCAST_PRODUCER_GUEST_ID) {
                          setGuestDraftId(initialCast[1] ?? "");
                        }
                      }}
                    >
                      <strong>Produce</strong>
                      <span>Direct the show live</span>
                    </button>
                    <button
                      type="button"
                      className={styles.producerGuestPickerOption}
                      data-selected={
                        !producerGuestSelected && playbackModeDraft === "watch"
                          ? "true"
                          : undefined
                      }
                      aria-pressed={
                        !producerGuestSelected && playbackModeDraft === "watch"
                      }
                      disabled={busy || Boolean(bookingSuggestionBusy)}
                      data-tutorial-target="botcast-watch-show"
                      onClick={() => {
                        setPlaybackModeDraft("watch");
                        if (guestDraftId === BOTCAST_PRODUCER_GUEST_ID) {
                          setGuestDraftId(initialCast[1] ?? "");
                        }
                      }}
                    >
                      <strong>Watch</strong>
                      <span>Bake ahead, then sit back</span>
                    </button>
                  </div>
                  {renderSignalBotPicker({
                    bots: guestOptions,
                    selectedId: guestDraftId,
                    searchValue: guestPickerSearch,
                    onSearchChange: setGuestPickerSearch,
                    groupId: guestPickerGroupId,
                    onGroupChange: setGuestPickerGroupId,
                    onSelect: (id) => {
                      setGuestDraftId(id);
                      if (id === BOTCAST_PRODUCER_GUEST_ID) {
                        setPlaybackModeDraft("live");
                      }
                    },
                    ariaLabel: "Choose a Signal guest",
                    disabled: busy || Boolean(bookingSuggestionBusy),
                    directedSetupTarget: (bot) =>
                      createBotDirectedSetupRefractTarget({
                        id: `signal-episode-anchor-${selectedShow.id}-${bot.id}`,
                        label: `Build a Signal booking around ${bot.name}`,
                        botId: bot.id,
                        botName: bot.name,
                        disabled: () =>
                          busy || Boolean(bookingSuggestionBusy),
                        run: ({ botId, direction }) =>
                          randomizeBooking(direction, botId),
                      }),
                  })}
                </div>
              )}
            </PrismRefractTarget>
          </div>
          {producerGuestSelected ? (
            <div
              className={`${styles.setupField} ${styles.producerGuestContext}`}
            >
              <label htmlFor="signal-producer-guest-context">
                Interview direction{" "}
                <span>optional · leave blank for host’s choice</span>
              </label>
              <PrismRefractTarget
                target={{
                  id: `signal-producer-guest-direction-${selectedShow.id}`,
                  kind: "field",
                  label: "Producer guest direction",
                  read: () => producerGuestContextDraft,
                  preview: setProducerGuestContextDraft,
                  accept: setProducerGuestContextDraft,
                  disabled: () => busy,
                  generate: ({ currentValue, rejectedValues, signal }) =>
                    generateSignalRefractDraft(
                      {
                        kind: "signal.booking.producerGuestDirection",
                        showId: selectedShow.id,
                      },
                      currentValue,
                      rejectedValues,
                      signal,
                    ),
                }}
              >
                {(binding) => (
                  <textarea
                    {...binding}
                    id="signal-producer-guest-context"
                    value={producerGuestContextDraft}
                    onChange={(event) =>
                      setProducerGuestContextDraft(event.currentTarget.value)
                    }
                    placeholder="Share anything you want covered—or leave this blank and let the host surprise you."
                    maxLength={2000}
                  />
                )}
              </PrismRefractTarget>
              <small>
                With no direction, the host chooses a fresh show-shaped topic
                without inventing facts about you. You’ll be introduced as the
                Producer, then answer through the composer with no queue cards
                or live direction. After each question, the clock runs at half
                speed. Begin with a leading *action* to show it above your
                on-stage presence.
              </small>
            </div>
          ) : (
          <>
          <div className={`${styles.setupField} ${styles.episodeTopic}`}>
            <label htmlFor="signal-episode-topic">
              Episode topic <span>public title</span>
            </label>
            <PrismRefractTarget
              target={{
                id: `signal-episode-topic-${selectedShow.id}`,
                kind: "field",
                label: "episode topic",
                read: () => topicDraft,
                preview: setTopicDraft,
                accept: setTopicDraft,
                disabled: () =>
                  busy ||
                  Boolean(bookingSuggestionBusy) ||
                  !guestDraftId ||
                  guestDraftId === BOTCAST_PRODUCER_GUEST_ID,
                generate: ({ currentValue, rejectedValues, signal }) =>
                  generateSignalRefractDraft(
                    {
                      kind: "signal.booking.topic",
                      showId: selectedShow.id,
                      guestBotId: guestDraftId,
                    },
                    currentValue,
                    rejectedValues,
                    signal,
                  ),
              }}
            >
              {(binding) => (
                <input
                  {...binding}
                  id="signal-episode-topic"
                  value={topicDraft}
                  onChange={(event) => setTopicDraft(event.target.value)}
                  placeholder="A short public title, not the full question"
                />
              )}
            </PrismRefractTarget>
          </div>
          <div className={`${styles.setupField} ${styles.producerBrief}`}>
            <label htmlFor="signal-producer-brief">
            Host briefing <span>private to host · optional</span>
            </label>
            <PrismRefractTarget
              target={{
                id: `signal-producer-brief-${selectedShow.id}`,
                kind: "field",
                label: "host briefing",
                read: () => producerBriefDraft,
                preview: setProducerBriefDraft,
                accept: setProducerBriefDraft,
                disabled: () =>
                  busy ||
                  Boolean(bookingSuggestionBusy) ||
                  !guestDraftId ||
                  guestDraftId === BOTCAST_PRODUCER_GUEST_ID,
                generate: ({ currentValue, rejectedValues, signal }) =>
                  generateSignalRefractDraft(
                    {
                      kind: "signal.booking.producerBrief",
                      showId: selectedShow.id,
                      guestBotId: guestDraftId,
                    },
                    currentValue,
                    rejectedValues,
                    signal,
                  ),
              }}
            >
              {(binding) =>
                renderPickAwareComposer ? (
                  <div
                    {...binding}
                    className={styles.contextualTextField}
                    data-multiline="true"
                    tabIndex={-1}
                  >
                    {renderPickAwareComposer({
                      id: "signal-producer-brief",
                      value: producerBriefDraft,
                      onChange: setProducerBriefDraft,
                      placeholder:
                        "What the host should pursue, challenge, or keep in bounds.",
                      multiline: true,
                      ariaLabel: "Host briefing",
                      className: styles.pickAwareSetupField,
                      disabled: busy,
                    })}
                  </div>
                ) : (
                  <textarea
                    {...binding}
                    id="signal-producer-brief"
                    value={producerBriefDraft}
                    onChange={(event) =>
                      setProducerBriefDraft(event.target.value)
                    }
                    placeholder="What the host should pursue, challenge, or keep in bounds."
                  />
                )
              }
            </PrismRefractTarget>
          </div>
          <div className={`${styles.setupField} ${styles.guestBrief}`}>
            <label htmlFor="signal-guest-brief">
              Guest briefing <span>private to guest · optional</span>
            </label>
            {renderPickAwareComposer ? (
              <div
                className={styles.contextualTextField}
                data-multiline="true"
                tabIndex={-1}
              >
                {renderPickAwareComposer({
                  id: "signal-guest-brief",
                  value: guestBriefDraft,
                  onChange: setGuestBriefDraft,
                  placeholder:
                    "What the guest knows, wants, fears, or is hiding.",
                  multiline: true,
                  ariaLabel: "Guest briefing",
                  className: styles.pickAwareSetupField,
                  disabled: busy,
                })}
              </div>
            ) : (
              <textarea
                id="signal-guest-brief"
                value={guestBriefDraft}
                maxLength={BOTCAST_GUEST_BRIEF_MAX_LENGTH}
                onChange={(event) =>
                  setGuestBriefDraft(event.currentTarget.value)
                }
                placeholder="What the guest knows, wants, fears, or is hiding."
              />
            )}
            <small>
              The host is not told this. They can learn it only from what the
              guest naturally reveals on air.
            </small>
          </div>
          {setupImageModeEligible ? (
            <div
              className={`${styles.setupField} ${styles.setupEpisodeImage}`}
              data-signal-setup-image="true"
              data-tutorial-target="botcast-episode-image"
            >
              <div className={styles.setupEpisodeImageHeading}>
                <div>
                  <strong>Episode image</strong>
                  <span>optional · one per episode</span>
                </div>
                <button
                  type="button"
                  disabled={setupImageAttachDisabled}
                  onClick={() => setupProducerImageInputRef.current?.click()}
                >
                  <ImagePlus aria-hidden="true" />
                  {imageUploadBusy
                    ? "Inspecting…"
                    : setupEpisodeImage
                      ? "Replace file"
                      : "Choose file"}
                </button>
                <input
                  ref={setupProducerImageInputRef}
                  type="file"
                  accept={SIGNAL_EPISODE_IMAGE_ACCEPT}
                  hidden
                  disabled={setupImageAttachDisabled}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void selectSetupProducerImage(file);
                  }}
                />
              </div>
              {setupEpisodeImage ? (
                <div className={styles.setupEpisodeImageDraft}>
                  <small data-image-kind={setupEpisodeImage.descriptor.kind}>
                    {setupEpisodeImage.descriptor.kind === "item"
                      ? "Transparent PNG item · presented as the physical item; you can optionally keep it in Items after the episode."
                      : setupEpisodeImage.descriptor.mimeType === "image/png"
                        ? "Opaque PNG photo · presented as a framed picture and never saved automatically."
                        : "JPG photo · presented as a framed picture and never saved automatically."}
                  </small>
                  <label htmlFor="signal-setup-image-name">
                    Name <span>spoken title</span>
                    <input
                      id="signal-setup-image-name"
                      value={setupEpisodeImage.descriptor.name}
                      maxLength={BOTCAST_EPISODE_IMAGE_NAME_MAX_LENGTH}
                      onChange={(event) => {
                        const name = event.currentTarget.value;
                        setSetupEpisodeImage((current) =>
                          current
                            ? {
                                ...current,
                                descriptor: { ...current.descriptor, name },
                              }
                            : current,
                        );
                      }}
                    />
                  </label>
                  <label htmlFor="signal-setup-image-reason">
                    Reason <span>optional · private to the host</span>
                    <textarea
                      id="signal-setup-image-reason"
                      value={setupEpisodeImage.reason}
                      maxLength={BOTCAST_EPISODE_IMAGE_REASON_MAX_LENGTH}
                      placeholder="For example: This is my new car—invite an honest reaction."
                      onChange={(event) => {
                        const reason = event.currentTarget.value;
                        setSetupEpisodeImage((current) =>
                          current ? { ...current, reason } : current,
                        );
                      }}
                    />
                  </label>
                  <div className={styles.setupEpisodeImageFooter}>
                    <small>
                      Signal uses Reason as off-mic presentation context, then
                      places the image automatically at a natural interview
                      beat. The file stays in this session unless you explicitly
                      keep a transparent item at the end.
                    </small>
                    <button
                      type="button"
                      onClick={() => setSetupEpisodeImage(null)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <small>
                  {setupImageModelCapable
                    ? "Attach a transparent PNG item, opaque PNG photo, or JPG photo. Its filename becomes an editable Name."
                    : episodeModelDraft
                      ? "Choose a vision-capable model in the Signal navbar to attach an image before the episode."
                      : "Auto can attach an image when its current model pool includes a vision-capable model."}
                </small>
              )}
            </div>
          ) : null}
          </>
          )}
        </div>
        <div className={styles.episodeLaunchRow}>
          <label className={styles.episodeLengthControl}>
            <span>Episode length</span>
            <PrismRefractTarget
              target={{
                id: `signal-episode-length-${selectedShow.id}`,
                kind: "choice",
                label: "episode length",
                read: () => String(episodeDurationDraft ?? "auto"),
                preview: (value) =>
                  setEpisodeDurationDraft(
                    value === "auto" ? null : Number(value),
                  ),
                accept: (value) =>
                  setEpisodeDurationDraft(
                    value === "auto" ? null : Number(value),
                  ),
                choices: () => [
                  { value: "auto", label: "Auto · natural ending" },
                  ...Array.from(
                    {
                      length:
                        BOTCAST_SESSION_DURATION_MINUTES_MAX -
                        BOTCAST_SESSION_DURATION_MINUTES_MIN +
                        1,
                    },
                    (_, index) => {
                      const minutes =
                        BOTCAST_SESSION_DURATION_MINUTES_MIN + index;
                      return {
                        value: String(minutes),
                        label: `${minutes} minutes`,
                      };
                    },
                  ),
                ],
                disabled: () => busy,
              }}
            >
              {(binding) => (
                <select
                  {...binding}
                  value={episodeDurationDraft ?? "auto"}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setEpisodeDurationDraft(
                      value === "auto" ? null : Number(value),
                    );
                  }}
                  aria-label="Signal episode length"
                >
                  <option value="auto">Auto · natural ending</option>
                  {Array.from(
                    {
                      length:
                        BOTCAST_SESSION_DURATION_MINUTES_MAX -
                        BOTCAST_SESSION_DURATION_MINUTES_MIN +
                        1,
                    },
                    (_, index) => BOTCAST_SESSION_DURATION_MINUTES_MIN + index,
                  ).map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minutes
                    </option>
                  ))}
                </select>
              )}
            </PrismRefractTarget>
            <small>
              {episodeDurationDraft === null
                ? "No countdown · closes at a natural resting point"
                : `Target · about ${episodeDurationDraft} minutes`}
            </small>
          </label>
          {playbackModeDraft === "watch" && !producerGuestSelected ? (
            <label className={styles.watchAutoStartControl}>
              <input
                type="checkbox"
                checked={watchAutoStartDraft}
                onChange={(event) =>
                  setWatchAutoStartDraft(event.currentTarget.checked)
                }
                disabled={busy}
              />
              <span>
                <strong>Start automatically</strong>
                <small>
                  {watchAutoStartDraft
                    ? "Open Replay as soon as the episode and voices are ready"
                    : "Wait on the title card after preparation finishes"}
                </small>
              </span>
            </label>
          ) : null}
          <div className={styles.episodeLaunchActions}>
            <button
              type="button"
              className={styles.goLiveButton}
              onClick={() => void startEpisode()}
              disabled={
                busy ||
                Boolean(bookingSuggestionBusy) ||
                !guestDraftId ||
                (!producerGuestSelected && !topicDraft.trim()) ||
                Boolean(
                  setupEpisodeImage &&
                    (!setupImageModelCapable ||
                      !setupEpisodeImage.descriptor.name.trim()),
                )
              }
              aria-label={
                !guestDraftId
                  ? "Book a guest before beginning the episode"
                  : !producerGuestSelected && !topicDraft.trim()
                    ? "Add an episode topic before beginning"
                    : setupEpisodeImage && !setupImageModelCapable
                      ? "Choose a vision-capable model for the attached episode image"
                      : setupEpisodeImage &&
                          !setupEpisodeImage.descriptor.name.trim()
                        ? "Add a Name for the attached episode image"
                    : playbackModeDraft === "watch" && !producerGuestSelected
                      ? watchAutoStartDraft
                        ? "Watch show"
                        : "Prepare show"
                      : "Begin episode"
              }
            >
              {playbackModeDraft === "watch" && !producerGuestSelected
                ? watchAutoStartDraft
                  ? "Watch show"
                  : "Prepare show"
                : "Begin episode"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const archiveEpisodes = episodes.filter(
    (item) => item.status === "completed",
  );
  const renderArchiveGuest = (
    item: BotcastEpisodeSummary,
  ): React.JSX.Element => {
    const producerGuest = item.guestKind === "producer";
    const botId = item.guestBotId;
    const libraryBot = producerGuest ? null : botsById.get(botId);
    const participant = producerGuest
      ? signalProducerGuestBotSummary(item, selectedShow?.accentColor)
      : libraryBot ?? {
          id: botId,
          name: item.guestName?.trim() || "Former guest",
          color: null,
          glyph: null,
          personaTemperament: "neutral" as const,
        };
    const portrait = (
      <span className={styles.episodeParticipantAvatar} aria-hidden="true">
        {renderAvatar?.(participant, {
          talking: false,
          thinking: false,
          sipping: false,
          role: "guest",
          surface: "archive",
          sfxEnabled: false,
          facing: "left",
          theme,
          mouthShape: "closed",
        }) ?? avatarFallback(participant)}
      </span>
    );
    if (!libraryBot) {
      return (
        <span
          className={styles.episodeParticipantChip}
          data-interactive="false"
          title={
            producerGuest
              ? `${participant.name} appeared as the Producer guest`
              : `${participant.name} is no longer in your bot library`
          }
        >
          {portrait}
        </span>
      );
    }

    return (
      <button
        type="button"
        className={styles.episodeParticipantChip}
        data-bot-id={libraryBot.id}
        aria-label={`Adjust ${libraryBot.name}, episode guest`}
        title={`Adjust ${libraryBot.name}`}
        onPointerDown={(event) =>
          onBotContextLongPressStart?.(event, libraryBot.id)
        }
        onPointerUp={onBotContextLongPressEnd}
        onPointerCancel={onBotContextLongPressEnd}
        onPointerMove={onBotContextLongPressMove}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onBotContextMenu?.(libraryBot.id, event.clientX, event.clientY);
        }}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          onBotContextMenu?.(
            libraryBot.id,
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          );
        }}
      >
        {portrait}
      </button>
    );
  };
  const renderArchive = (): React.JSX.Element => (
    <section className={styles.archive} data-tutorial-target="botcast-replay">
      <div className={styles.archiveHeading}>
        <span className={styles.eyebrow}>Episode archive</span>
        <h2>
          {archiveEpisodes.length
            ? `${archiveEpisodes.length} recorded`
            : "The tape shelf is empty"}
        </h2>
      </div>
      <div className={styles.episodeGrid}>
        {archiveEpisodes.map((item, index) => (
          <article key={item.id} className={styles.episodeCard}>
            <button
              type="button"
              className={styles.episodeOpenButton}
              onClick={() => void openReplay(item)}
            >
              <span className={styles.episodeNumber}>
                EP {String(archiveEpisodes.length - index).padStart(2, "0")}
              </span>
              <strong>{item.title}</strong>
              <span>
                {item.guestKind === "producer"
                  ? (item.guestName ?? producerName)
                  : (botsById.get(item.guestBotId)?.name ?? "Guest")}
              </span>
              <small>
                {new Date(item.startedAt).toLocaleDateString()} ·{" "}
                {runtimeLabel(item.runtimeMs)} · {episodeModeLabel(item)} ·{" "}
                {item.model
                  ? (modelLabels.get(item.model) ?? item.model)
                  : "Auto"}{" "}
                · {episodeOutcomeLabel(item)}
              </small>
            </button>
            <div
              className={styles.episodeGuest}
              aria-label={`Guest in ${item.title}`}
            >
              {renderArchiveGuest(item)}
            </div>
            <button
              type="button"
              className={styles.episodeDeleteButton}
              onClick={(event) =>
                openEpisodeDeletion(item, event.currentTarget)
              }
              disabled={busy}
              aria-label={`Delete episode ${item.title}`}
            >
              Delete
            </button>
          </article>
        ))}
      </div>
    </section>
  );

  // The audible lifecycle owns both the presentation clock and the exact
  // message. Looking its ID back up in the episode snapshot can still miss a
  // just-staged line while React commits the episode and voice state separately.
  const liveActiveMessage = signalLiveActiveMessage({
    liveSpeech,
    speakingMessageId,
    episodeMessages: episode?.messages ?? [],
  });
  const liveCameraElapsedMs = (() => {
    if (!episode || episode.messages.length === 0) return 0;
    const timeline = botcastReplayTimeline(episode.messages, episode.events);
    const activeIndex = liveSpeech
      ? episode.messages.findIndex(
          (message) => message.id === liveSpeech.messageId,
        )
      : -1;
    if (activeIndex >= 0 && liveSpeech?.reveal.phase === "playing") {
      return Math.max(
        0,
        Math.round(
          (timeline.messageStartMs[activeIndex] ?? 0) +
            liveSpeech.reveal.elapsedMs,
        ),
      );
    }
    // Keep persisted legacy camera events on the same deterministic timeline
    // between lines. Faithful V2 capture uses the audio-master clock below.
    return timeline.durationMs;
  })();
  const liveCameraMode = episode
    ? liveCameraOverride?.episodeId === episode.id
      ? liveCameraOverride.mode
      : botcastCameraModeAt({
          events: episode.events,
          elapsedMs: Number.POSITIVE_INFINITY,
        })
    : "auto";
  const liveBaseShot = episode
    ? liveCameraMode === "auto"
      ? botcastCameraShotAt({
          events: episode.events,
          elapsedMs: liveCameraElapsedMs,
        })
      : liveCameraMode
    : "wide";
  const liveListenerReactionPlan =
    episode && liveActiveMessage
      ? (listenerReactionPlanByMessageIdRef.current.get(liveActiveMessage.id) ??
        botcastListenerReactionForMessage(episode.events, liveActiveMessage.id))
      : null;
  const liveActiveMessageIsSocialSilence = Boolean(
    liveActiveMessage &&
      socialSilenceMessageIsMarkedV1({
        content: liveActiveMessage.content,
        marker: liveActiveMessage.socialSilence,
        mode: "signal",
      }),
  );
  const liveProducerGuestThinking = Boolean(
    episode &&
      episode.guestKind === "producer" &&
      episode.status === "live" &&
      !busy &&
      speakingMessageId === null &&
      botcastNextSpeakerRole({
        messages: episode.messages,
        segment: episode.segment,
        guestDeparted: false,
      }) === "guest",
  );
  const livePendingCrosstalkReclaim = episode
    ? botcastPendingCrosstalkReclaimV1(episode.messages)
    : null;
  const liveNextSpeakerRole = episode
    ? livePendingCrosstalkReclaim
      ? livePendingCrosstalkReclaim.speakerBotId === episode.hostBotId
        ? "host"
        : "guest"
      : botcastNextSpeakerRole({
          messages: episode.messages,
          segment: episode.segment,
          guestDeparted: guestHasDeparted(episode),
        })
    : null;
  const liveNextSpeakerIsBot = Boolean(
    episode &&
      liveNextSpeakerRole &&
    !(episode.guestKind === "producer" && liveNextSpeakerRole === "guest"),
  );
  const liveBotThinking = Boolean(
    episode &&
      episode.status === "live" &&
      liveCameraMode === "auto" &&
      busy &&
      speakingMessageId === null &&
    (producerGuestThinkingEndedAtRef.current !== null || liveNextSpeakerIsBot),
  );
  const signalVoicePreparationPending =
    liveSpeech?.reveal.phase === "preparing" &&
    liveSpeech.messageId !== signalPreSpeechPresenceMessageId;
  const liveBotVoicePreparationPending = Boolean(
    signalVoicePreparationPending &&
      liveActiveMessage &&
      !(
        episode?.guestKind === "producer" &&
        liveActiveMessage.speakerRole === "guest"
      ),
  );
  const liveAutoWaitingForPresence = Boolean(
    liveCameraMode === "auto" &&
      (liveBotThinking ||
        liveBotVoicePreparationPending ||
        liveProducerGuestThinking) &&
      !liveActiveMessageIsSocialSilence,
  );
  signalCameraWaitingForPresenceRef.current = liveAutoWaitingForPresence;
  const liveEphemeralCameraBotId = episode
    ? liveListenerReactionPlan &&
      signalEphemeralSpeakingBotIds.has(liveListenerReactionPlan.listenerBotId)
      ? liveListenerReactionPlan.listenerBotId
      : liveListenerReactionPlan &&
          signalEphemeralSpeakingBotIds.has(
            liveListenerReactionPlan.speakerBotId,
          )
        ? liveListenerReactionPlan.speakerBotId
        : signalEphemeralSpeakingBotIds.has(episode.hostBotId)
          ? episode.hostBotId
          : signalEphemeralSpeakingBotIds.has(episode.guestBotId)
            ? episode.guestBotId
            : null
    : null;
  const liveEphemeralSpeakingShot =
    episode && liveEphemeralCameraBotId
      ? liveEphemeralCameraBotId === episode.hostBotId
        ? "left"
        : "right"
      : null;
  // Only playback that has actually started belongs in crosstalk direction.
  // Preparation and pre-speech presence deliberately do not widen the camera.
  const liveAudiblySpeakingBotIds = new Set(signalEphemeralSpeakingBotIds);
  if (
    episode &&
    liveActiveMessage &&
    liveSpeech?.messageId === liveActiveMessage.id &&
    liveSpeech.audible === true &&
    liveSpeech.reveal.phase === "playing" &&
    botcastMessageIsAudibleToAudienceV1(liveActiveMessage) &&
    !botPowerResponseIsSilentV1(liveActiveMessage.content)
  ) {
    liveAudiblySpeakingBotIds.add(
      liveActiveMessage.speakerRole === "host"
        ? episode.hostBotId
        : episode.guestBotId,
    );
  }
  const liveAudibleVoiceOverlap = liveAudiblySpeakingBotIds.size >= 2;
  const liveSpeakingShot =
    liveCameraMode === "auto" &&
    liveActiveMessage &&
    liveSpeech?.messageId === liveActiveMessage.id &&
    (liveSpeech.reveal.phase === "playing" ||
      signalPreSpeechPresenceMessageId === liveActiveMessage.id) &&
    botcastMessageIsAudibleToAudienceV1(liveActiveMessage) &&
    !botPowerResponseIsSilentV1(liveActiveMessage.content)
      ? liveActiveMessage.speakerRole === "host"
        ? "left"
        : "right"
      : null;
  const liveShot =
    // Intro curtain and first reveal always establish the full room.
    episodePreRoll !== null && liveCameraMode === "auto"
      ? "wide"
      : signalLiveAutoCameraShot({
          baseShot: liveBaseShot,
          audibleVoiceOverlap:
            liveCameraMode === "auto" && liveAudibleVoiceOverlap,
          audibleHandoffPreparing:
            liveCameraMode === "auto" &&
            audibleHandoffOutgoingMessageIdRef.current !== null,
          // Sustained reaction/crosstalk audio can own an editorial cut.
          // Brief interjections stay audible without creating a 1→2→1 camera
          // twitch. Fixed manual cameras never yield, and prepared text never
          // creates a camera beat.
          listenerReactionShot:
            liveCameraMode === "auto" && liveListenerReactionPlan
              ? signalListenerReactionCameraShot({
                  cameraCutEligible: liveListenerReactionPlan.cameraCutEligible,
                  ephemeralSpeakingShot: liveEphemeralSpeakingShot,
                  ephemeralSpeechDurationMs: liveEphemeralCameraBotId
                    ? (signalEphemeralSpeechByBotId.get(
                        liveEphemeralCameraBotId,
                      )?.durationMs ?? null)
                    : null,
                })
              : null,
          coverageShot:
            liveCameraMode === "auto" && liveSpeakingShot
              ? botcastAutoCoverageShotAt({
                  events: episode?.events ?? [],
                  elapsedMs: liveCameraElapsedMs,
                })
              : null,
          speakingShot: liveSpeakingShot,
          postSpeechHoldShot:
            liveCameraMode === "auto" && !liveActiveMessageIsSocialSilence
              ? liveCameraPostSpeechHoldShot
              : null,
          botThinking:
            (liveBotThinking || liveBotVoicePreparationPending) &&
            !liveActiveMessageIsSocialSilence,
          producerGuestThinking:
            liveProducerGuestThinking && liveCameraMode === "auto",
        });
  const liveCameraTransitionMode: SignalCameraTransitionMode =
    signalCameraPushMessageId !== null ? "animated" : "instant";
  liveCameraModeRef.current = liveCameraMode;
  const livePresentedThinkingRole = signalPresentedThinkingRole({
    episodeLive: episode?.status === "live",
    producerGuestThinking: liveProducerGuestThinking,
    producerGuestSipActive,
    generationBusy: busy,
    voicePreparationPending: liveBotVoicePreparationPending,
    hasPreparedMessage: activeSpeechMessageIdRef.current !== null,
    hasSpeakingMessage: speakingMessageId !== null,
    nextSpeakerRole: liveNextSpeakerRole,
    generationThinkingRole: signalGenerationThinking?.role ?? null,
    generationThinkingRunMatches:
      signalGenerationThinking?.runId === episodeRunIdRef.current,
  });
  const livePresentedThinkingBot =
    livePresentedThinkingRole === "host"
      ? hostBot
      : livePresentedThinkingRole === "guest"
        ? liveGuestBot
        : null;
  // Visual only. `livePresentedThinkingBot` above stays the recorded state, so
  // widening what the audience sees cannot add an interval to the replay log.
  const liveStageThinkingRole = signalStageThinkingRole({
    presentedThinkingRole: livePresentedThinkingRole,
    nextSpeakerRole: liveNextSpeakerRole,
    producerGuestThinking: liveProducerGuestThinking,
    voicePreparationPending: liveBotVoicePreparationPending,
    voicePreparationRole: liveActiveMessage?.speakerRole ?? null,
  });
  useLayoutEffect(() => {
    if (!producerCueInputFocusedRef.current) return;
    const input = producerCueInputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    const { start, end } = producerCueInputSelectionRef.current;
    input.setSelectionRange(start, end);
  }, [liveShot, liveSpeech?.messageId, speakingMessageId]);
  useLayoutEffect(() => {
    if (!producerQuoteInputFocusedRef.current) return;
    const input = producerQuoteInputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    const { start, end } = producerQuoteInputSelectionRef.current;
    input.setSelectionRange(start, end);
  }, [liveShot, liveSpeech?.messageId, speakingMessageId]);
  useLayoutEffect(() => {
    const sourceId = signalCaptureSourceIdRef.current;
    if (!episode || episode.status !== "live" || !sourceId) {
      signalCapturedCameraRef.current = null;
      return;
    }
    const transitionMode = liveCameraTransitionMode;
    const previous = signalCapturedCameraRef.current;
    if (
      previous?.sourceId === sourceId &&
      previous.shot === liveShot
    ) {
      return;
    }
    signalCapturedCameraRef.current = {
      sourceId,
      shot: liveShot,
      transitionMode,
    };
    markReplayDirectionEvent({
      sourceId,
      kind: "camera",
      payload: {
        shot: liveShot,
        transitionMode,
        transitionPreset: "signal-camera-v1",
      } satisfies ReplayCameraDirectionPayloadV2,
    });
  }, [episode, liveCameraTransitionMode, liveShot]);
  useEffect(
    () => () => {
      if (signalCameraPushTimeoutRef.current !== null) {
        window.clearTimeout(signalCameraPushTimeoutRef.current);
      }
    },
    [],
  );
  useLayoutEffect(() => {
    if (!episode || episode.status !== "live") {
      signalCameraWaitingForPresenceRef.current = false;
      if (signalCameraPushTimeoutRef.current !== null) {
        window.clearTimeout(signalCameraPushTimeoutRef.current);
        signalCameraPushTimeoutRef.current = null;
      }
      if (signalCameraPushMessageId !== null) {
        setSignalCameraPushMessageId(null);
      }
      signalAirTimeFreezeAccumulatedMsRef.current = 0;
      signalAirTimeFreezeStartedAtRef.current = null;
      if (signalPreSpeechPresenceMessageId !== null) {
        setSignalPreSpeechPresenceMessageId(null);
      }
      if (signalEphemeralSpeakingDepthByBotIdRef.current.size > 0) {
        signalEphemeralSpeakingDepthByBotIdRef.current.clear();
        setSignalEphemeralSpeakingBotIds(new Set());
      }
      if (signalEphemeralSpeechByBotId.size > 0) {
        signalEphemeralSpeechPlaybackClockByBotIdRef.current.clear();
        setSignalEphemeralSpeechByBotId(new Map());
      }
      if (signalThinkingCompactHoldActiveRef.current) {
        const sourceId = signalCaptureSourceIdRef.current;
        signalThinkingCompactHoldActiveRef.current = false;
        if (sourceId) setReplayAudioMasterCompactHold(sourceId, false);
      }
      return;
    }
    const now = Date.now();
    if (
      watchPlaybackReady ||
      livePresentedThinkingBot ||
      signalVoicePreparationPending
    ) {
      if (signalAirTimeFreezeStartedAtRef.current === null) {
        signalAirTimeFreezeStartedAtRef.current = now;
      }
    } else if (signalAirTimeFreezeStartedAtRef.current !== null) {
      signalAirTimeFreezeAccumulatedMsRef.current += Math.max(
        0,
        now - signalAirTimeFreezeStartedAtRef.current,
      );
      signalAirTimeFreezeStartedAtRef.current = null;
    }
  }, [
    episode,
    signalCameraPushMessageId,
    watchPlaybackReady,
    livePresentedThinkingBot,
    signalVoicePreparationPending,
    signalEphemeralSpeechByBotId,
    signalPreSpeechPresenceMessageId,
  ]);
  useLayoutEffect(() => {
    const captureSourceId = signalCaptureSourceIdRef.current;
    const shouldHold = Boolean(
      episode?.status === "live" &&
        episodePreRoll === null &&
        (livePresentedThinkingBot || signalVoicePreparationPending) &&
        captureSourceId,
    );
    if (shouldHold !== signalThinkingCompactHoldActiveRef.current) {
      signalThinkingCompactHoldActiveRef.current = shouldHold;
      if (captureSourceId) {
        setReplayAudioMasterCompactHold(captureSourceId, shouldHold);
      }
    }
  }, [
    episode,
    episodePreRoll,
    livePresentedThinkingBot,
    signalVoicePreparationPending,
  ]);
  useLayoutEffect(() => {
    const captureSourceId = signalCaptureSourceIdRef.current;
    if (!episode || !captureSourceId) return;
    // `prepareEpisodeMessage` claims this ref synchronously, before its React
    // speech state can commit. Keep the completed thinking interval attached
    // to that real line through the handoff instead of briefly assigning the
    // next scheduled speaker.
    const followingMessageId = signalThinkingFollowingMessageId({
      liveSpeechMessageId: liveSpeech?.messageId ?? null,
      speakingMessageId,
      preparedMessageId: activeSpeechMessageIdRef.current,
    });
    const hasFollowingMessage = Boolean(
      followingMessageId &&
        episode.messages.some((message) => message.id === followingMessageId),
    );
    syncReplayThinkingPresentations({
      sourceId: captureSourceId,
      presentations: livePresentedThinkingBot
        ? [
            {
              participantId: livePresentedThinkingBot.producerGuest
                ? "prism-player"
                : livePresentedThinkingBot.id,
              botId: livePresentedThinkingBot.id,
              audible:
                resolveThinkingAudible?.(livePresentedThinkingBot) ?? false,
              camera: liveShot,
              segment: episode.segment,
            },
          ]
        : [],
      followingMessageId,
      endingSegment: episode.segment,
      endReason: signalThinkingPresentationEndReason({
        cuttingShow,
        hasError: Boolean(error),
        hasFollowingMessage,
        episodeLive: episode.status === "live",
      }),
    });
  }, [
    busy,
    cuttingShow,
    episode,
    error,
    livePresentedThinkingBot,
    liveShot,
    liveSpeech?.messageId,
    resolveThinkingAudible,
    speakingMessageId,
  ]);
  const selectLiveCameraMode = async (
    mode: BotcastCameraShot,
  ): Promise<void> => {
    if (
      !episode ||
      episode.status !== "live" ||
      cameraSaving ||
      mode === liveCameraMode
    )
      return;
    const priorMode = liveCameraMode;
    setLiveCameraOverride({ episodeId: episode.id, mode });
    setCameraSaving(true);
    setError(null);
    try {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/episodes/${encodeURIComponent(episode.id)}/camera`,
        {
          method: "POST",
          body: JSON.stringify({ mode, atMs: liveCameraElapsedMs }),
        },
      );
      setEpisode((current) =>
        current?.id === response.episode.id && current.status === "live"
          ? response.episode
          : current,
      );
      setLiveCameraOverride((current) =>
        current?.episodeId === response.episode.id && current.mode === mode
          ? null
          : current,
      );
    } catch (cameraError) {
      setLiveCameraOverride((current) =>
        current?.episodeId === episode.id && current.mode === mode
          ? { episodeId: episode.id, mode: priorMode }
          : current,
      );
      setError(signalErrorToast("Change live camera", cameraError));
    } finally {
      setCameraSaving(false);
    }
  };
  const toggleLiveCaptions = (): void => {
    setLiveCaptionsEnabled((current) => {
      const next = !current;
      writeSignalLiveCaptionsEnabled(window.localStorage, next);
      return next;
    });
  };
  const adjustLiveCaptionSize = (direction: -1 | 1): void => {
    setLiveCaptionSize((current) => {
      const next = stepLiveCaptionSize(current, direction);
      writeSignalLiveCaptionSize(window.localStorage, next);
      return next;
    });
  };
  useEffect(() => {
    if (episode?.status !== "live") {
      return;
    }
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']",
        ),
      );
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (studioLayoutEditorOpen || isEditableTarget(event.target)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
        return;
      }
      if (cameraSaving) return;
      const modeByArrow: Partial<Record<string, BotcastCameraShot>> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowDown: "wide",
        ArrowUp: "auto",
      };
      const mode = modeByArrow[event.key];
      if (!mode) return;
      event.preventDefault();
      void selectLiveCameraMode(mode);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    cameraSaving,
    episode?.id,
    episode?.status,
    liveCameraElapsedMs,
    liveCameraMode,
    studioLayoutEditorOpen,
  ]);
  const producerGuestSipAvailable = Boolean(
    episode?.guestKind === "producer" &&
      episode.status === "live" &&
      liveGuestBot &&
      botHasCoffeeCup(liveGuestBot),
  );
  const producerGuestIsSpeaking = Boolean(
    speakingMessageId !== null &&
      liveActiveMessage?.id === speakingMessageId &&
      liveActiveMessage.speakerRole === "guest",
  );
  const producerGuestSipDisabled =
    !producerGuestSipAvailable ||
    producerGuestIsSpeaking ||
    producerGuestSipActive ||
    signalGuestCupTravelMode !== "idle";
  const signalCapabilityEpisodeId = episode?.id ?? null;
  const signalCapabilityEpisodeStatus = episode?.status ?? null;
  const signalCapabilityPlaybackMode = episode?.playbackMode ?? null;
  const signalCapabilityGuestKind = episode?.guestKind ?? null;
  const signalCapabilityProvider = episode?.provider ?? null;
  const signalCapabilityModel = episode?.model ?? null;
  const signalCapabilityModelSelectionKind = episode
    ? (botcastEpisodeModelSelectionKind(episode) ?? "fixed")
    : "fixed";
  useEffect(() => {
    if (
      !signalCapabilityEpisodeId ||
      signalCapabilityEpisodeStatus !== "live" ||
      signalCapabilityPlaybackMode === "watch" ||
      signalCapabilityGuestKind !== "bot"
    ) {
      setSignalImageCapability(null);
      return;
    }
    let cancelled = false;
    setSignalImageCapability(null);
    void request<{
      provider: "local" | "ollama_cloud" | "openai" | "anthropic";
      model: string;
      modelSelectionKind: "auto" | "fixed";
      supportsImageInput: boolean;
    }>(`/api/botcast/episodes/${signalCapabilityEpisodeId}/image-capability`)
      .then((capability) => {
        if (cancelled) return;
        setSignalImageCapability({
          episodeId: signalCapabilityEpisodeId,
          ...capability,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSignalImageCapability({
          episodeId: signalCapabilityEpisodeId,
          provider: signalCapabilityProvider ?? "local",
          model: signalCapabilityModel ?? "Auto",
          modelSelectionKind: signalCapabilityModelSelectionKind,
          supportsImageInput: false,
          unavailable: true,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    request,
    signalCapabilityEpisodeId,
    signalCapabilityEpisodeStatus,
    signalCapabilityGuestKind,
    signalCapabilityModel,
    signalCapabilityModelSelectionKind,
    signalCapabilityPlaybackMode,
    signalCapabilityProvider,
  ]);
  const sipCoffeeAsProducerGuest = (): void => {
    if (!episode || !producerGuestSipAvailable || producerGuestSipDisabled) {
      return;
    }
    const seed = `signal:${episode.id}:${BOTCAST_PRODUCER_GUEST_ID}:guest`;
    const durationMs = coffeeCupSipAnimationTiming({ seed }).durationMs;
    setProducerGuestSipActive(true);
    producerGuestSipTimeoutRef.current = window.setTimeout(() => {
      producerGuestSipTimeoutRef.current = null;
      setProducerGuestSipActive(false);
    }, durationMs);
  };
  // The closing segment stays open to the producer: a cue sent during the
  // wrap reopens the interview for one more exchange instead of being
  // dropped, so the control room keeps the floor for as long as the episode
  // is live. A completed episode is finished — its recording is already
  // sealed — and the composer closes with it.
  const producerCueAvailable = episode?.status === "live";
  const producerCueLifecycleFeedback = useMemo(
    () =>
      episode
        ? botcastProducerCueLifecyclesFromEvents(episode.events).at(-1) ?? null
        : null,
    [episode],
  );
  // The desk only visualizes the authoritative client/server cue lifecycle; it
  // never promotes a cue or infers delivery from the presentation alone.
  const producerCueDeskPhase = queuedProducerCue
    ? queuedCueStatus === "dispatching"
      ? "dispatching"
      : queuedCueStatus === "requeued"
        ? "requeued"
        : "queued"
    : producerCueLifecycleFeedback?.status === "delivered"
      ? "delivered"
      : producerCueLifecycleFeedback?.status === "failed"
        ? "failed"
        : "idle";
  const producerCueDeskReadout = queuedProducerCue
    ? signalProducerCueLabel(queuedProducerCue)
    : producerCueDeskPhase === "delivered"
      ? "Last cue delivered"
      : producerCueDeskPhase === "failed"
        ? "Last cue needs revision"
        : "Line clear";
  const activeEpisodeImageCapability =
    episode && signalImageCapability?.episodeId === episode.id
      ? signalImageCapability
      : null;
  const activeSignalImageContext = episode
    ? botcastLatestImageContextV1(episode.events)
    : null;
  const signalImageDiscussionActive = Boolean(
    activeSignalImageContext && activeSignalImageContext.phase !== "dismissed",
  );
  const signalImageAlreadyUsed = Boolean(
    activeSignalImageContext ||
      (signalEpisodeImage && signalEpisodeImage.episodeId === episode?.id),
  );
  const producerImageDisabled =
    !producerCueAvailable ||
    episode?.playbackMode === "watch" ||
    episode?.guestKind !== "bot" ||
    activeEpisodeImageCapability?.supportsImageInput !== true ||
    signalImageAlreadyUsed ||
    imageUploadBusy ||
    Boolean(queuedProducerCue);
  const producerImageTooltip =
    activeEpisodeImageCapability === null
      ? "Checking whether the active Signal model supports image input…"
      : activeEpisodeImageCapability.unavailable
        ? "Signal could not verify image input for the active model, so image upload stays disabled."
        : activeEpisodeImageCapability.supportsImageInput !== true
          ? "This episode's locked model pool has no vision-capable model. Start a new episode with a capable Auto pool or fixed model."
      : signalImageDiscussionActive
        ? "This episode's one image is already on the table."
        : signalImageAlreadyUsed
          ? "Signal allows one image upload per episode."
        : queuedProducerCue
          ? "Let the queued Producer cue air before adding an image."
          : imageUploadBusy
            ? "Adding image to the Signal table…"
            : `Add an image for the host and guest to discuss with ${
                activeEpisodeImageCapability.modelSelectionKind === "auto"
                  ? `Auto → ${activeEpisodeImageCapability.model}`
                  : activeEpisodeImageCapability.model
              }.`;
  const queuedCueCanInterruptGuest =
    Boolean(queuedProducerCue) &&
    Boolean(nextHostInterruptionBridge) &&
    episode !== null &&
    (episode.messages.find((message) => message.id === speakingMessageId)
      ?.speakerRole === "guest" ||
      (speakingMessageId === null &&
        botcastNextSpeakerRole({
          messages: episode.messages,
          segment: episode.segment,
          guestDeparted: guestHasDeparted(episode),
        }) === "guest"));
  const queuedCueInterruptUnavailableReason = queuedCueCanInterruptGuest
    ? null
    : !nextHostInterruptionBridge
      ? "The host is not available to take the mic in this episode state."
      : "Interrupt is available while the guest is on mic or is the next scheduled speaker.";
  function producerCueDraftSnapshot(): {
    detail: string;
    directQuote: string;
  } {
    return {
      detail: producerCueInputRef.current?.value.trim() ?? "",
      directQuote: producerQuoteInputRef.current?.value.trim() ?? "",
    };
  }
  function syncProducerCueDraftControls(): void {
    const askLength = producerCueInputRef.current?.value.length ?? 0;
    const quoteLength = producerQuoteInputRef.current?.value.length ?? 0;
    producerCueDraftLengthsRef.current = {
      ask: askLength,
      quote: quoteLength,
    };
    const hasDraft = askLength > 0 || quoteLength > 0;
    if (producerCueAskCountRef.current) {
      producerCueAskCountRef.current.hidden = askLength === 0;
      producerCueAskCountRef.current.textContent =
        `${askLength} / ${BOTCAST_PRODUCER_CUE_DETAIL_MAX}`;
    }
    if (producerCueQuoteCountRef.current) {
      producerCueQuoteCountRef.current.hidden = quoteLength === 0;
      producerCueQuoteCountRef.current.textContent =
        `${quoteLength} / ${BOTCAST_PRODUCER_DIRECT_QUOTE_MAX}`;
    }
    if (producerCueSendButtonRef.current) {
      producerCueSendButtonRef.current.disabled =
        !producerCueAvailable || !hasDraft;
    }
    if (producerCueClearButtonRef.current) {
      producerCueClearButtonRef.current.disabled =
        !hasDraft && queuedProducerCueRef.current === null;
    }
  }
  function clearProducerCueDraftInputs(
    options: { ask?: boolean; quote?: boolean } = {},
  ): void {
    const clearAsk = options.ask !== false;
    const clearQuote = options.quote !== false;
    if (clearAsk && producerCueInputRef.current) {
      producerCueInputRef.current.value = "";
    }
    if (clearQuote && producerQuoteInputRef.current) {
      producerQuoteInputRef.current.value = "";
    }
    if (clearAsk) producerCueDraftLengthsRef.current.ask = 0;
    if (clearQuote) producerCueDraftLengthsRef.current.quote = 0;
    syncProducerCueDraftControls();
  }
  const submitAskAboutCue = (): void => {
    const { detail, directQuote } = producerCueDraftSnapshot();
    if (!producerCueAvailable || (!detail && !directQuote)) return;
    sendCue({
      kind: "ask_about",
      ...(detail ? { detail } : {}),
      ...(directQuote ? { directQuote } : {}),
    });
    clearProducerCueDraftInputs();
  };
  /**
   * Withdraw everything the producer has staged but not yet aired: both typed
   * drafts and any queued cue. A queued cue lives on the client until the host
   * turn that carries it is generated, so clearing it before then keeps it off
   * the air entirely — there is nothing to unsay.
   */
  const producerCuesAreClearable =
    Boolean(queuedProducerCue && queuedProducerCue.kind !== "present_image") ||
    producerCueDraftLengthsRef.current.ask > 0 ||
    producerCueDraftLengthsRef.current.quote > 0;
  const clearProducerCues = (): void => {
    if (!producerCuesAreClearable) return;
    clearProducerCueDraftInputs();
    if (
      queuedProducerCueRef.current &&
      queuedProducerCueRef.current.kind !== "present_image"
    ) {
      const episodeId = episode?.id;
      if (!episodeId) return;
      void request<{ episode: BotcastEpisode }>(
        `/api/botcast/episodes/${encodeURIComponent(episodeId)}/producer-cue/clear`,
        { method: "POST", body: JSON.stringify({}) },
      )
        .then((response) => {
          setEpisode(response.episode);
          assignQueuedProducerCue(null);
          setNotice("Cue withdrawn. The host never hears it.");
        })
        .catch((clearError) =>
          setError(signalErrorToast("Clear Signal cue", clearError)),
        );
    }
  };
  const uploadProducerImage = async (file: File): Promise<void> => {
    if (!episode || producerImageDisabled) return;
    setImageUploadBusy(true);
    setError(null);
    try {
      const fileInput = await readSignalEpisodeImageFile(file);
      const imageId = crypto.randomUUID();
      const replayMetadata = await acquireSignalEpisodeImageReplayMetadata(
        fileInput,
      );
      const upload: SignalEpisodeImageUpload = {
        episodeId: episode.id,
        imageId,
        ...fileInput,
        descriptor: replayMetadata.descriptor,
        replayEmoji: replayMetadata.replayEmoji,
        reason: "",
      };
      signalEpisodeImageRef.current = upload;
      setSignalEpisodeImage(upload);
      setKeepSignalItem(false);
      discardPreparedAdvance(
        "An ephemeral Producer image replaced the prepared Signal turn.",
      );
      setNotice(
        `${upload.descriptor.name} is ready for the host to place on the table.`,
      );
      sendCue({ kind: "present_image", imageId: upload.imageId });
    } catch (caught) {
      setError(signalErrorToast("Add image to Signal", caught));
    } finally {
      setImageUploadBusy(false);
      if (producerImageInputRef.current) {
        producerImageInputRef.current.value = "";
      }
    }
  };
  useEffect(() => {
    if (
      episode?.status !== "live" ||
      episode.guestKind === "producer" ||
      studioLayoutEditorOpen ||
      audiencePulseOpen ||
      deleteTarget
    ) {
      return;
    }
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']",
        ),
      );
    };
    const isCueInputTarget = (target: EventTarget | null): boolean => {
      const askInput = producerCueInputRef.current;
      const quoteInput = producerQuoteInputRef.current;
      return Boolean(
        target instanceof Node &&
          ((askInput && (target === askInput || askInput.contains(target))) ||
            (quoteInput &&
              (target === quoteInput || quoteInput.contains(target)))),
      );
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat)
        return;

      if (event.key === "Tab" && !event.shiftKey) {
        const input = producerCueInputRef.current;
        const quoteInput = producerQuoteInputRef.current;
        if (!input || !producerCueAvailable) return;
        event.preventDefault();
        if (document.activeElement === input && quoteInput) {
          quoteInput.focus({ preventScroll: true });
          producerCueInputFocusedRef.current = false;
          producerQuoteInputFocusedRef.current = true;
        } else if (quoteInput && document.activeElement === quoteInput) {
          quoteInput.blur();
          producerQuoteInputFocusedRef.current = false;
        } else {
          input.focus({ preventScroll: true });
          producerCueInputFocusedRef.current = true;
        }
        return;
      }

      if (
        !shouldSubmitComposerOnEnter({
          key: event.key,
          shiftKey: event.shiftKey,
          isComposing: event.isComposing,
        })
      ) {
        return;
      }

      // Keep Enter inside other fields (dialogs, navbar search, etc.).
      if (isEditableTarget(event.target) && !isCueInputTarget(event.target)) {
        return;
      }

      if (isCueInputTarget(event.target)) {
        const { detail, directQuote } = producerCueDraftSnapshot();
        if ((detail || directQuote) && producerCueAvailable) {
          event.preventDefault();
          sendCue({
            kind: "ask_about",
            ...(detail ? { detail } : {}),
            ...(directQuote ? { directQuote } : {}),
          });
          clearProducerCueDraftInputs();
          return;
        }
      }

      if (queuedCueCanInterruptGuest) {
        event.preventDefault();
        interruptGuestWithQueuedCue();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    audiencePulseOpen,
    deleteTarget,
    episode?.guestKind,
    episode?.status,
    producerCueAvailable,
    queuedCueCanInterruptGuest,
    studioLayoutEditorOpen,
  ]);
  // Keep the shows rail and live chrome locked through intro, bake, on-air, and
  // the closing card. Restore them only after Return to show clears the episode.
  // Model/effort stay locked while paused or baking so routing cannot change mid-sit.
  const showLiveExit = episode?.status === "live" || episodePreRoll !== null;
  const watchBakeActive = watchBakeLabel !== null;
  const liveSessionActive =
    showLiveExit ||
    watchBakeActive ||
    episodeOutro !== null ||
    episode?.status === "completed" ||
    episode?.status === "cancelled";
  const returnFromEpisodeOutro = async (): Promise<void> => {
    if (
      !episodeOutro ||
      keepSignalItemSaving ||
      watchReplayFinalizingEpisodeId === episodeOutro.episodeId
    ) {
      return;
    }
    const preparedWatchReplay =
      episodeOutro.episode.playbackMode === "watch" &&
      watchReplayPresentationEpisodeId === episodeOutro.episodeId;
    const uploadedItem =
      signalEpisodeImage?.episodeId === episodeOutro.episodeId &&
      signalEpisodeImage.descriptor.kind === "item"
        ? signalEpisodeImage
        : null;
    if (keepSignalItem && uploadedItem && !episodeOutro.discarded) {
      setKeepSignalItemSaving(true);
      setError(null);
      try {
        await request(`/api/assets/upload`, {
          method: "POST",
          body: JSON.stringify({
            kind: "item",
            title: uploadedItem.descriptor.name,
            dataUrl: uploadedItem.dataUrl,
            signalEpisodeId: uploadedItem.episodeId,
          }),
        });
        setNotice(
          `${uploadedItem.descriptor.name} was saved to Items and linked to ${episodeOutro.episode.guestName ?? "the guest"}.`,
        );
      } catch (saveError) {
        setError(signalErrorToast("Save Signal item", saveError));
        setKeepSignalItemSaving(false);
        return;
      }
    }
    stopEpisodeOutro();
    if (preparedWatchReplay) {
      await openReplayRef.current(episodeOutro.episode, {
        initialPosition: "end",
      });
      return;
    }
    setEpisode(null);
    if (selectedShowId) {
      void loadEpisodes(selectedShowId).catch(() => undefined);
    }
  };
  const returnFromCompletedEpisode = async (): Promise<void> => {
    if (!episode || episode.status !== "completed") return;
    const completedEpisode = episode;
    setWatchReplayFinalizingEpisodeId(completedEpisode.id);
    try {
      if (selectedShow) {
        await finalizeSignalRecording(completedEpisode, selectedShow);
      }
    } finally {
      setWatchReplayFinalizingEpisodeId((current) =>
        current === completedEpisode.id ? null : current,
      );
      setEpisode(null);
      if (selectedShowId) {
        void loadEpisodes(selectedShowId).catch(() => undefined);
      }
    }
  };
  useEffect(() => {
    onLiveSessionActiveChange?.(
      liveSessionActive,
      episode?.id ?? (watchBakeActive ? "baking" : null),
    );
  }, [episode?.id, liveSessionActive, onLiveSessionActiveChange, watchBakeActive]);
  useEffect(() => {
    if (liveSessionActive) {
      if (episode?.id) presentedSessionReceiptIdRef.current = episode.id;
      return;
    }
    const endedSessionId = presentedSessionReceiptIdRef.current;
    presentedSessionReceiptIdRef.current = null;
    if (
      !endedSessionId ||
      resolvedSessionReceiptIdsRef.current.has(endedSessionId)
    ) {
      return;
    }
    resolvedSessionReceiptIdsRef.current.add(endedSessionId);
    onSessionEndedRef.current?.(endedSessionId);
  }, [episode?.id, liveSessionActive]);
  useEffect(() => {
    return () => {
      onLiveSessionActiveChangeRef.current?.(false, null);
      const endedSessionId = presentedSessionReceiptIdRef.current;
      presentedSessionReceiptIdRef.current = null;
      if (
        !endedSessionId ||
        resolvedSessionReceiptIdsRef.current.has(endedSessionId)
      ) {
        return;
      }
      resolvedSessionReceiptIdsRef.current.add(endedSessionId);
      onSessionEndedRef.current?.(endedSessionId);
    };
  }, []);
  const episodeModelControlDisabled = liveSessionActive;
  const episodeModelControlDisabledReason = watchBakeActive
    ? "Wait for Watch prepare to finish or cancel before changing the model picker. Auto still chooses model and Effort for each bake step when selected."
    : showLiveExit
    ? "End the live Signal episode before changing the model picker. Auto still chooses model and Effort for each turn when selected."
    : liveSessionActive
      ? "Return to the show before changing the model picker. Auto still chooses model and Effort for each turn when selected."
      : undefined;
  const episodeModelControlValue = signalEpisodeModelPickerValue({
    liveSessionActive,
    episode,
    draft: episodeModelDraft,
    availableModelIds: modelOptions.map((option) => option.id),
  });
  const episodeSelectedModelProvider =
    modelOptions.find((option) => option.id === episodeModelControlValue)
      ?.provider ?? preferredProvider;
  const watchReplayPresentation = Boolean(
    episode?.playbackMode === "watch" &&
      watchReplayPresentationEpisodeId === episode.id,
  );
  const activeAutoRoute =
    episode && botcastEpisodeModelSelectionKind(episode) === "auto"
      ? signalActiveAutoRoute(episode)
      : null;
  const lockedReasoningEffort = episode
    ? signalFrozenReasoningEffort(episode)
    : null;
  const resolvedLockedRoutingChip =
    liveSessionActive
      ? (resolveLockedRoutingChip?.({
          modelChoice: episodeModelControlValue || "auto",
          modelProvider: episodeSelectedModelProvider,
          activeAutoRoute,
          lockedReasoningEffort,
        }) ?? lockedRoutingChip)
      : null;
  const resolvedNavigationHeader =
    typeof navigationHeader === "function"
      ? navigationHeader({
          liveSessionActive,
          replayActive: replayEpisode !== null || watchReplayPresentation,
          showLiveExit,
          cuttingShow,
          onCutShow: () => {
            void cutShow();
          },
          episodeModelControl: {
            value: episodeModelControlValue,
            onChange: setEpisodeModelDraft,
            disabled: episodeModelControlDisabled,
            disabledReason: episodeModelControlDisabledReason,
          },
          activeAutoRoute,
        })
      : navigationHeader;
  const copySignalErrorToast = async (): Promise<void> => {
    if (!error || error.copyState === "copying") return;
    const report = error.diagnosticReport;
    setError((current) =>
      current?.diagnosticReport === report
        ? { ...current, copyState: "copying" }
        : current,
    );
    try {
      await writeDiagnosticClipboard(report);
      setError((current) =>
        current?.diagnosticReport === report
          ? { ...current, copyState: "copied" }
          : current,
      );
    } catch {
      setError((current) =>
        current?.diagnosticReport === report
          ? { ...current, copyState: "failed" }
          : current,
      );
    }
  };

  const showAudienceRating =
    showAudience !== null && showAudience.reviewCount > 0
      ? Math.max(0, Math.min(5, showAudience.rating ?? 0))
      : 0;

  return (
    <>
      {liveSessionActive ? (
        episode?.id ? (
          <PrismCompanionSessionNoteBoundary
            reason="signal-live-session"
            surface="signal"
            sessionId={episode.id}
          />
        ) : (
          <PrismCompanionPresenceBoundary reason="signal-live-session" />
        )
      ) : null}
      <SessionAtmosphereLayer
        active={signalSessionAtmosphereActive({
          audioEnabled: introAudioEnabled,
          hasSelectedShow: Boolean(selectedShow),
          preRollActive: Boolean(episodePreRoll),
          episodePresent: Boolean(episode),
          replayPlaying: replayPlaying && !replayFaithful,
          studioLayoutEditorOpen,
        })}
        sessionKey={
          episode?.id ?? replayEpisode?.id ?? selectedShow?.id ?? "signal"
        }
        volume={introAudioVolume}
        backgroundUrl={selectedShow?.atmosphereAudio.audioUrl}
        mix={selectedShow?.atmosphereMix ?? DEFAULT_SIGNAL_ATMOSPHERE_MIX}
        backgroundTone="warm-low"
        foleyRoomAcoustics={SIGNAL_STUDIO_FOLEY_ROOM_SEND}
        allowMixBoost
        latencyCritical={liveSessionActive}
        ambientFoley={false}
        coffeeCupRootRef={signalStageRef}
        deferFoley={
          speakingMessageId !== null ||
          (replayFaithful ? Boolean(replayFaithfulBeat) : replaySpeechActive) ||
          studioSoundcheckSpeakerBotId !== null
        }
      />
    <main
      className={styles.shell}
      data-botcast-mode="true"
      data-theme={theme}
      data-live-episode={liveSessionActive ? "true" : undefined}
      data-producer-guest={
        episode?.guestKind === "producer" ? "true" : undefined
      }
      data-episode-outro={episodeOutro ? "true" : undefined}
      data-caption-size={liveCaptionSize}
    >
      {liveSessionActive ? (
        <LiveSessionPrismWatermark
          theme={theme === "light" ? "light" : "dark"}
        />
      ) : null}
      <div className={styles.mainNavigation}>{resolvedNavigationHeader}</div>
      {error || notice ? (
        <aside
          className={styles.signalToastRegion}
          aria-label="Signal notifications"
        >
          {error ? (
            <div
              className={styles.signalToast}
              data-signal-toast-kind="error"
              role="alert"
              data-copy-state={error.copyState ?? undefined}
            >
              <button
                type="button"
                className={styles.signalToastBody}
                onClick={() => void copySignalErrorToast()}
                aria-busy={error.copyState === "copying"}
                aria-label={
                  error.copyState === "copied"
                    ? `Signal error. ${error.summary} Diagnostic report copied to clipboard.`
                    : error.copyState === "failed"
                      ? `Signal error. ${error.summary} Couldn’t copy diagnostics. Try again.`
                      : `Signal error. ${error.summary} Copy Signal diagnostic report to clipboard.`
                }
              >
                <span className={styles.signalToastIcon} aria-hidden="true">
                  !
                </span>
                <span className={styles.signalToastCopy}>
                  <strong>Signal error</strong>
                  <small>{error.summary}</small>
                  <small className={styles.signalToastDiagnosticHint}>
                    {error.copyState === "copying"
                      ? "Copying diagnostic report…"
                      : error.copyState === "copied"
                        ? "Diagnostic report copied to clipboard."
                        : error.copyState === "failed"
                          ? "Couldn’t copy diagnostics. Try again."
                          : "Click to copy a privacy-safe diagnostic report."}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className={styles.signalToastDismiss}
                onClick={(event) => {
                  event.stopPropagation();
                  setError(null);
                }}
                aria-label="Dismiss Signal error"
              >
                ×
              </button>
            </div>
          ) : null}
          {notice ? (
            <div
              className={styles.signalToast}
              data-signal-toast-kind="notice"
              role="status"
            >
              <span className={styles.signalToastIcon} aria-hidden="true">
                i
              </span>
              <span className={styles.signalToastCopy}>
                <strong>Signal update</strong>
                <small>{notice}</small>
              </span>
              <button
                type="button"
                className={styles.signalToastDismiss}
                onClick={() => setNotice(null)}
                aria-label="Dismiss Signal update"
              >
                ×
              </button>
            </div>
          ) : null}
        </aside>
      ) : null}
      {hostChatOpen && selectedShow && hostBot ? (
        <div
          className={styles.showHostChatFocus}
          role="dialog"
          aria-modal="true"
          aria-label={`Ephemeral off-air chat with ${hostBot.name}`}
        >
          <button
            type="button"
            className={styles.showHostChatFocusBackdrop}
            tabIndex={-1}
            aria-label={`Close off-air chat with ${hostBot.name}`}
            onClick={closeSignalHostChat}
          />
          <div className={styles.showHostChatFocusStage}>
            <section
              id={`signal-show-host-chat-${selectedShow.id}`}
              className={styles.showHostChatConversation}
            >
              <div
                ref={hostChatCloudRef}
                className={styles.showHostChatCloud}
                aria-live="polite"
                aria-relevant="additions text"
              >
                {hostChatBubbles.map((bubble) => (
                  <article
                    key={bubble.key}
                    className={styles.showHostChatBubble}
                    data-role={bubble.message.role}
                    data-power-voice-presence={
                      bubble.message.role === "assistant"
                        ? (hostBot.voicePresence ?? undefined)
                        : undefined
                    }
                    data-botcast-host-chat-message="true"
                    style={
                      {
                        "--signal-host-bubble-life": `${bubble.lifetimeMs}ms`,
                      } as CSSProperties
                    }
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {bubble.message.content}
                    </ReactMarkdown>
                  </article>
                ))}
                {hostChatStreamingMessage ? (
                  <article
                    className={styles.showHostChatBubble}
                    data-role="assistant"
                    data-power-voice-presence={
                      hostBot.voicePresence ?? undefined
                    }
                    data-streaming="true"
                    data-botcast-host-chat-message="true"
                    aria-busy="true"
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {hostChatStreamingMessage.content}
                    </ReactMarkdown>
                  </article>
                ) : null}
                {hostChatBusy && !hostChatStreamingMessage ? (
                  <div className={styles.showHostChatThinking} role="status">
                    <span aria-hidden="true">•••</span>
                    {hostBot.name} is thinking through the archive
                  </div>
                ) : null}
              </div>
              <form
                className={styles.showHostChatComposer}
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendSignalHostChat();
                }}
              >
                <textarea
                  ref={hostChatComposerRef}
                  value={hostChatDraft}
                  rows={2}
                  maxLength={6_000}
                  placeholder={`Ask ${hostBot.name} about the show…`}
                  aria-label={`Message ${hostBot.name} off-air`}
                  onChange={(event) =>
                    setHostChatDraft(event.currentTarget.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeSignalHostChat();
                    } else if (
                      shouldSubmitComposerOnEnter({
                        key: event.key,
                        shiftKey: event.shiftKey,
                        isComposing: event.nativeEvent.isComposing,
                      })
                    ) {
                      event.preventDefault();
                      if (!hostChatBusy && hostChatDraft.trim()) {
                        event.currentTarget.form?.requestSubmit();
                      }
                    }
                  }}
                  enterKeyHint="send"
                />
                <button
                  type="submit"
                  disabled={hostChatBusy || !hostChatDraft.trim()}
                >
                  Send
                </button>
                <small>Off-air · ephemeral · grounded in this show</small>
              </form>
            </section>
            <button
              type="button"
              className={styles.showHostChatFocusAvatar}
              aria-label={`Close off-air chat with ${hostBot.name}`}
              onClick={closeSignalHostChat}
            >
              <div className={styles.showCardHostFloat} aria-hidden="true">
                {renderAvatar?.(hostBot, {
                  talking: Boolean(hostChatStreamingMessage?.content),
                  thinking: hostChatBusy && !hostChatStreamingMessage,
                  sipping: false,
                  role: "host",
                  surface: "dashboard",
                  sfxEnabled: false,
                  facing: signalStudioFacingForRole(
                    normalizeBotcastStudioLayout(selectedShow.studioLayout),
                    "host",
                  ),
                  theme,
                  mouthShape: "closed",
                }) ?? avatarFallback(hostBot)}
              </div>
            </button>
          </div>
        </div>
      ) : null}
      {episodePreRoll && selectedShow ? (
        <section
          className={styles.episodePreRoll}
          data-phase={episodePreRoll.phase}
          data-kind="intro"
          data-source={episodePreRoll.source}
          data-watch-ready={watchPlaybackReady ? "true" : undefined}
            style={
              { "--botcast-accent": selectedShow.accentColor } as CSSProperties
            }
          aria-label={`${episodePreRoll.showName} episode introduction`}
          aria-live="polite"
        >
          <div className={styles.preRollSignalField} aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
          </div>
          <div className={styles.preRollLockup}>
            <span className={styles.preRollEyebrow}>Signal presents</span>
            <div className={styles.preRollLogo}>
              <SignalShowLogo show={selectedShow} />
              <span className={styles.preRollOrbit} aria-hidden="true" />
            </div>
            <h1>{episodePreRoll.showName}</h1>
            <p>With {episodePreRoll.guestName}</p>
            <strong>{episodePreRoll.topic}</strong>
            <div className={styles.preRollMeters} aria-hidden="true">
                {Array.from({ length: 11 }, (_, index) => (
                  <i key={index} />
                ))}
            </div>
            <small>
              {watchPlaybackReady
                ? "Episode and voices ready · Replay is standing by"
                : episodePreRoll.source === "elevenlabs"
                  ? "Original ElevenLabs show ident"
                  : "Signal Synth · generated locally"}
            </small>
            {watchPlaybackReady ? (
              <button
                type="button"
                className={styles.watchStartButton}
                data-action="start-watch"
                onClick={startBufferedWatch}
              >
                Start show
              </button>
            ) : null}
          </div>
            {!watchPlaybackReady ? (
              <button type="button" onClick={skipEpisodePreRoll}>
                Skip intro
              </button>
            ) : null}
        </section>
      ) : null}
      {episodeOutro && selectedShow ? (
        <section
          className={`${styles.episodePreRoll} ${styles.episodeOutro}`}
          data-phase={episodeOutro.phase}
          data-kind="outro"
            style={
              { "--botcast-accent": selectedShow.accentColor } as CSSProperties
            }
          aria-label={`${episodeOutro.showName} episode outro`}
          aria-live="polite"
        >
          <div className={styles.preRollSignalField} aria-hidden="true">
              <i />
              <i />
              <i />
          </div>
          <div className={styles.preRollLockup}>
            <span className={styles.preRollEyebrow}>
              {episodeOutro.discarded
                ? "Signal transmission discarded"
                : episodeOutro.forced
                ? "Signal transmission cut"
                : "Signal transmission complete"}
            </span>
            <div className={styles.preRollLogo}>
              <SignalShowLogo show={selectedShow} />
            </div>
            <h1>{episodeOutro.showName}</h1>
            <p>
              {episodeOutro.discarded
                ? "Early cut · not saved"
                : episodeOutro.forced
                  ? "Cut by producer"
                  : "End of episode"}
            </p>
            <small>Signal</small>
          </div>
          <div className={styles.episodeOutroActions}>
            {!episodeOutro.discarded &&
            signalEpisodeImage?.episodeId === episodeOutro.episodeId &&
            signalEpisodeImage.descriptor.kind === "item" ? (
              <label className={styles.episodeOutroKeepItem}>
                <input
                  type="checkbox"
                  checked={keepSignalItem}
                  disabled={keepSignalItemSaving}
                  onChange={(event) => setKeepSignalItem(event.target.checked)}
                />
                <span>
                  <strong>
                    Keep {signalEpisodeImage.descriptor.name} in Items
                  </strong>
                  <small>
                    Optional. It stays session-only unless kept; saving links
                    it to {episodeOutro.episode.guestName ?? "this guest"}.
                  </small>
                </span>
              </label>
            ) : null}
            {!episodeOutro.discarded &&
              episodeOutro.episode.status === "completed" &&
              onCreateSlateStory ? (
                <button
                  type="button"
                  onClick={() =>
                    void createEpisodeStoryInSlate(episodeOutro.episode)
                  }
                  disabled={slateStoryEpisodeId !== null}
                  data-tutorial-target="botcast-create-slate-story"
                >
                  {slateStoryEpisodeId === episodeOutro.episodeId
                    ? "Creating in Slate…"
                    : "Create in Slate"}
                </button>
              ) : null}
            <button
              type="button"
              onClick={() => void copyEpisodeForReview(episodeOutro.episode)}
              disabled={
                reviewCopyState?.episodeId === episodeOutro.episodeId &&
                reviewCopyState.phase === "copying"
              }
              aria-live="polite"
            >
              {signalReviewCopyLabel(reviewCopyState, episodeOutro.episodeId)}
            </button>
            <button
              type="button"
              onClick={() => void returnFromEpisodeOutro()}
              disabled={
                keepSignalItemSaving ||
                watchReplayFinalizingEpisodeId === episodeOutro.episodeId
              }
            >
              {keepSignalItemSaving
                ? "Saving item…"
                : watchReplayFinalizingEpisodeId === episodeOutro.episodeId
                  ? "Finalizing replay…"
                  : episodeOutro.episode.playbackMode === "watch"
                    ? "Open replay"
                : episodeOutro.phase === "holding"
                  ? "Skip outro"
                  : "Return to show"}
            </button>
          </div>
        </section>
      ) : null}
      {!liveSessionActive ? renderLibrary() : null}
      <section
        className={styles.main}
          style={
            hostShowAccent
              ? ({
              "--botcast-accent": hostShowAccent,
              "--botcast-host-accent": hostShowAccent,
                } as CSSProperties)
              : undefined
          }
      >
        {!episode ? (
          <header className={styles.header}>
            <div>
                <span className={styles.eyebrow}>
                  {replayEpisode ? "Episode replay" : "Host-owned shows"}
                </span>
              {selectedShow ? (
                <div className={styles.showTitleRow}>
                  <PrismRefractTarget
                    target={{
                      id: `signal-show-header-name-${selectedShow.id}`,
                      kind: "field",
                      label: "show name",
                      read: () => showNameDraft,
                      preview: setShowNameDraft,
                      accept: renameShow,
                      disabled: () => busy || Boolean(replayEpisode),
                        generate: ({ currentValue, rejectedValues, signal }) =>
                        generateSignalRefractDraft(
                          {
                            kind: "signal.show.name",
                            showId: selectedShow.id,
                          },
                          currentValue,
                          rejectedValues,
                          signal,
                        ),
                    }}
                  >
                    {(binding) => (
                    <input
                      {...binding}
                      className={styles.showNameInput}
                      value={showNameDraft}
                          onChange={(event) =>
                            setShowNameDraft(event.target.value)
                          }
                      onBlur={(event) =>
                        void renameShow(event.currentTarget.value)
                      }
                      maxLength={80}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void renameShow(event.currentTarget.value);
                        event.currentTarget.blur();
                      }
                    }}
                    aria-label="Show name"
                    data-botcast-delete-focus-fallback="true"
                  />
                    )}
                  </PrismRefractTarget>
                  <div className={styles.showNameActions}>
                    <button
                      type="button"
                      className={styles.showDeleteButton}
                        onClick={(event) =>
                          openShowDeletion(selectedShow, event.currentTarget)
                        }
                      disabled={busy || selectedShowArtworkBusy}
                      aria-label={`Delete show ${selectedShow.name}`}
                    >
                      Delete show
                    </button>
                  </div>
                </div>
                ) : (
                  <h1>Signal</h1>
                )}
                <p>
                  {selectedShow?.premise ??
                    "A bot owns the show. You produce the episode."}
                </p>
            </div>
          </header>
        ) : null}
        {episode && selectedShow ? (
          <div
            className={
              watchReplayPresentation
                ? styles.replayLayout
                : styles.liveLayout
            }
            data-signal-watch-replay={
              watchReplayPresentation ? "true" : undefined
            }
          >
            {watchReplayPresentation ? (
              <div className={styles.replayHeader}>
                <div>
                  <span className={styles.eyebrow}>From the archive</span>
                  <h2>{episode.title}</h2>
                  <p>
                    {new Date(episode.startedAt).toLocaleString()} ·{" "}
                    {episodeModeLabel(episode)} ·{" "}
                    {episode.model
                      ? (modelLabels.get(episode.model) ?? episode.model)
                      : "Auto"}{" "}
                    · {episodeOutcomeLabel(episode)}
                  </p>
                </div>
                <div className={styles.replayHeaderActions}>
                  <button type="button" onClick={cancelWatchBake}>
                    Close replay
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.liveTopline}>
                <span
                  data-live={episode.status === "live" ? "true" : undefined}
                >
                  {episode.status === "live"
                    ? "● ON AIR"
                    : episodeOutcomeLabel(episode)}
              </span>
              <SignalEpisodeRuntimeClock
                status={episode.status}
                runtimeMsAt={(nowMs) =>
                  signalEpisodeRuntimeMs(
                    episode,
                    nowMs,
                    producerGuestThinkingStartedAtRef.current,
                    producerGuestThinkingEndedAtRef.current,
                    {
                      accumulatedMs:
                        signalAirTimeFreezeAccumulatedMsRef.current,
                      startedAtMs: signalAirTimeFreezeStartedAtRef.current,
                    },
                    signalClientRecordedForegroundHoldRef.current.episodeId ===
                      episode.id
                      ? signalClientRecordedForegroundHoldRef.current.durationMs
                      : 0,
                  )
                }
              />
                <strong>
                  {episode.segment === "interview"
                    ? "MAIN INTERVIEW"
                    : episode.segment.toUpperCase()}
                </strong>
              {resolvedLockedRoutingChip ? (
                <LiveSessionModelChip
                  {...resolvedLockedRoutingChip}
                  className={styles.liveRoutingChip}
                />
              ) : (
                <LiveSessionModelChip
                  modelLabel={`${episode.model ? (modelLabels.get(episode.model) ?? episode.model) : "Model"}${botcastEpisodeModelSelectionKind(episode) === "auto" || episode.responseMode === "auto" ? " [auto]" : ""}`}
                  effortLabel="Default"
                  effortKey="auto"
                  automatic={
                    botcastEpisodeModelSelectionKind(episode) === "auto" ||
                    episode.responseMode === "auto"
                  }
                  turbo={false}
                  className={styles.liveRoutingChip}
                />
              )}
                <span>
                  {episode.guestKind === "producer"
                    ? "Producer on mic"
                    : episode.tensionStage === "calm"
                    ? "Guest settled"
                    : `Guest: ${episode.tensionStage}`}
              </span>
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (!autoRun) onPrepareUtterance?.();
                      setAutoRun((value) => !value);
                    }}
                    disabled={episode.status === "completed"}
                  >
                    {autoRun ? "Pause rundown" : "Resume rundown"}
                  </button>
                  <button
                    type="button"
                    className={styles.cutShowButton}
                    onClick={() => void cutShow()}
                    disabled={episode.status !== "live"}
                    aria-label="Cut the live show"
                  >
                    {cuttingShow ? "■ Cut now" : "■ Cut show"}
                  </button>
                </>
              <button
                type="button"
                className={styles.dangerButton}
                  onClick={(event) =>
                    openEpisodeDeletion(episode, event.currentTarget)
                  }
                disabled={busy}
              >
                  {episode.status === "live"
                    ? "Discard episode"
                    : "Delete episode"}
              </button>
              </div>
            )}
            {renderStage({
              show: selectedShow,
              currentEpisode: episode,
              host: hostBot,
              guest: liveGuestBot,
              shot: liveShot,
              activeMessage: liveActiveMessage,
              replay: false,
              ...(episode.playbackMode === "watch"
                ? {
                    guestDeparted:
                      signalPresentedDepartures.episodeId === episode.id &&
                      signalPresentedDepartures.guest,
                    hostDeparted:
                      signalPresentedDepartures.episodeId === episode.id &&
                      signalPresentedDepartures.host,
                  }
                : {}),
            })}
            {watchReplayPresentation ? (
              <section
                className={styles.replayPlayer}
                aria-label="Signal replay playback"
                data-playing="true"
                data-source="on-air"
                data-signal-watch-first-play="true"
              >
                <header className={styles.replayPlayerHeader}>
                  <div className={styles.replayPlayerIdentity}>
                    <span>Now playing</span>
                    <div>
                      <strong>Original broadcast</strong>
                      <small>
                        Prepared episode · faithful replay is recording
                      </small>
                    </div>
                  </div>
                  <span className={styles.replaySourceBadge}>Replay</span>
                </header>
                <footer className={styles.replayPlayerFooter}>
                  <span className={styles.replayStatus} role="status">
                    Full playback controls unlock when this first presentation
                    finishes.
                  </span>
                </footer>
              </section>
            ) : null}
            {episode.status === "live" &&
            episode.playbackMode !== "watch" ? (
              <div
                className={styles.liveCameraControls}
                aria-label="Signal live cameras"
                data-tutorial-target="botcast-live-camera"
              >
                <span>Camera</span>
                {(["left", "right", "wide", "auto"] as const).map(
                    (camera) => (
                  <button
                    key={camera}
                    type="button"
                        data-selected={
                          liveCameraMode === camera ? "true" : undefined
                        }
                    onClick={() => void selectLiveCameraMode(camera)}
                    disabled={cameraSaving}
                    aria-pressed={liveCameraMode === camera}
                  >
                    {camera[0]!.toUpperCase() + camera.slice(1)}
                  </button>
                    ),
                )}
              </div>
            ) : null}
            {episode.playbackMode !== "watch" &&
            episode.guestKind !== "producer" ? (
              <div className={styles.controlRoom}>
              <aside
                className={styles.producerControls}
                aria-label="Private producer controls"
                data-tutorial-target="botcast-cues"
                data-signal-producer-desk="true"
                data-producer-cue-phase={producerCueDeskPhase}
              >
                <header className={styles.producerDeskHeader}>
                  <div className={styles.producerDeskPrivateLine}>
                    <div
                      className={styles.producerCueReadout}
                      role="status"
                      aria-live="polite"
                    >
                      <i aria-hidden="true" />
                      <span>
                        <small>Private line · {hostBot?.name ?? "Host"}</small>
                        <strong>{producerCueDeskReadout}</strong>
                      </span>
                    </div>
                    <ol
                      className={styles.producerCueLifecycle}
                      aria-label="Producer cue delivery status"
                    >
                      <li
                        data-active={
                          producerCueDeskPhase !== "idle" ? "true" : undefined
                        }
                      >
                        Queued
                      </li>
                      <li
                        data-active={
                          producerCueDeskPhase === "dispatching" ||
                          producerCueDeskPhase === "delivered"
                            ? "true"
                            : undefined
                        }
                      >
                        Dispatching
                      </li>
                      <li
                        data-active={
                          producerCueDeskPhase === "delivered"
                            ? "true"
                            : undefined
                        }
                      >
                        Delivered
                      </li>
                    </ol>
                    <div className={styles.producerDeskLineActions}>
                      <button
                        type="button"
                        className={styles.producerInterruptButton}
                        disabled={!queuedCueCanInterruptGuest}
                        onClick={() => void interruptGuestWithQueuedCue()}
                        title={
                          queuedCueInterruptUnavailableReason ??
                          (hostBot?.muted
                            ? "Let the muted host attempt the cut in canonical silence."
                            : hostBot?.echoesAddressedSpeech
                              ? "Have the echo-bound host cut in by repeating the last audience-heard phrase."
                              : queuedProducerCue
                                ? "Have the host take the mic now with this queued cue."
                                : "Queue a cue before interrupting the guest.")
                        }
                      >
                        Interrupt guest now
                      </button>
                      <button
                        ref={producerCueClearButtonRef}
                        type="button"
                        className={styles.producerCueClear}
                        disabled={!producerCuesAreClearable}
                        onClick={clearProducerCues}
                        title="Clear both fields and withdraw any queued cue."
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </header>
                <div className={styles.producerCueComposer}>
                  <header className={styles.producerCueComposerHeader}>
                    <div>
                      <span>Private channel</span>
                      <strong>Shape a cue</strong>
                    </div>
                    <small className={styles.producerChannelLight}>Host only</small>
                  </header>
                  {queuedProducerCue ? (
                    <div className={styles.queuedCueStatus} role="status">
                      <p>
                        {queuedCueStatus === "dispatching"
                          ? "Dispatching"
                          : queuedCueStatus === "requeued"
                            ? "Requeued for host"
                            : "Queued for host"}
                        : {signalProducerCueLabel(queuedProducerCue)}.
                      </p>
                      {queuedCueInterruptUnavailableReason ? (
                        <small>{queuedCueInterruptUnavailableReason}</small>
                      ) : null}
                    </div>
                  ) : producerCueLifecycleFeedback?.status === "failed" ? (
                    <div className={styles.queuedCueStatus} role="status">
                      <p>
                        Cue not delivered safely. Revise and send a new host note.
                      </p>
                    </div>
                  ) : producerCueLifecycleFeedback?.status === "delivered" ? (
                    <div className={styles.queuedCueStatus} role="status">
                      <p>Cue delivered to the host.</p>
                    </div>
                  ) : null}
                  <label>
                    Host note…
                    <div>
                      <input
                        ref={producerCueInputRef}
                        defaultValue=""
                        onInput={(event) => {
                          producerCueInputSelectionRef.current = {
                            start: event.currentTarget.selectionStart ?? 0,
                            end: event.currentTarget.selectionEnd ?? 0,
                          };
                          syncProducerCueDraftControls();
                        }}
                        onFocus={(event) => {
                          producerCueInputFocusedRef.current = true;
                          producerQuoteInputFocusedRef.current = false;
                          producerCueInputSelectionRef.current = {
                            start: event.currentTarget.selectionStart ?? 0,
                            end: event.currentTarget.selectionEnd ?? 0,
                          };
                        }}
                        onBlur={() => {
                          producerCueInputFocusedRef.current = false;
                        }}
                        onSelect={(event) => {
                          producerCueInputSelectionRef.current = {
                            start: event.currentTarget.selectionStart ?? 0,
                            end: event.currentTarget.selectionEnd ?? 0,
                          };
                        }}
                        placeholder="context, direction, or a question"
                        maxLength={BOTCAST_PRODUCER_CUE_DETAIL_MAX}
                      />
                    </div>
                    <span
                      ref={producerCueAskCountRef}
                      className={styles.producerQuoteCount}
                      hidden={producerCueDraftLengthsRef.current.ask === 0}
                    >
                      {producerCueDraftLengthsRef.current.ask} / {BOTCAST_PRODUCER_CUE_DETAIL_MAX}
                    </span>
                  </label>
                  <label>
                    Say this…
                    <div>
                      <textarea
                        ref={producerQuoteInputRef}
                        defaultValue=""
                        rows={3}
                        onInput={(event) => {
                          producerQuoteInputSelectionRef.current = {
                            start: event.currentTarget.selectionStart ?? 0,
                            end: event.currentTarget.selectionEnd ?? 0,
                          };
                          syncProducerCueDraftControls();
                        }}
                        onFocus={(event) => {
                          producerQuoteInputFocusedRef.current = true;
                          producerCueInputFocusedRef.current = false;
                          producerQuoteInputSelectionRef.current = {
                            start: event.currentTarget.selectionStart ?? 0,
                            end: event.currentTarget.selectionEnd ?? 0,
                          };
                        }}
                        onBlur={() => {
                          producerQuoteInputFocusedRef.current = false;
                        }}
                        onSelect={(event) => {
                          producerQuoteInputSelectionRef.current = {
                            start: event.currentTarget.selectionStart ?? 0,
                            end: event.currentTarget.selectionEnd ?? 0,
                          };
                        }}
                        placeholder="authorized on-air quote — one line"
                        maxLength={BOTCAST_PRODUCER_DIRECT_QUOTE_MAX}
                      />
                    </div>
                    <span
                      ref={producerCueQuoteCountRef}
                      className={styles.producerQuoteCount}
                      hidden={producerCueDraftLengthsRef.current.quote === 0}
                    >
                      {producerCueDraftLengthsRef.current.quote} / {BOTCAST_PRODUCER_DIRECT_QUOTE_MAX}
                    </span>
                  </label>
                  <div className={styles.producerCueActions}>
                    <button
                      ref={producerCueSendButtonRef}
                      type="button"
                      className={styles.producerCueSend}
                      data-queued={
                        queuedProducerCue?.kind === "ask_about"
                          ? "true"
                          : undefined
                      }
                      disabled={
                        !producerCueAvailable ||
                        (producerCueDraftLengthsRef.current.ask === 0 &&
                          producerCueDraftLengthsRef.current.quote === 0)
                      }
                      onClick={submitAskAboutCue}
                    >
                      Send
                    </button>
                    <span
                      className={styles.producerImageAttachWrap}
                      title={producerImageTooltip}
                    >
                      <button
                        type="button"
                        className={styles.producerImageAttach}
                        disabled={producerImageDisabled}
                        aria-label={`Attach image for context. ${producerImageTooltip}`}
                        onClick={() => producerImageInputRef.current?.click()}
                      >
                        <ImagePlus aria-hidden="true" />
                        {imageUploadBusy ? "Adding…" : "Image"}
                      </button>
                    </span>
                    <input
                      ref={producerImageInputRef}
                      type="file"
                      accept={SIGNAL_EPISODE_IMAGE_ACCEPT}
                      hidden
                      disabled={producerImageDisabled}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) void uploadProducerImage(file);
                      }}
                    />
                  </div>
                  {queuedProducerCue ? null : (
                    <small>
                      Host note is private context, direction, or a question.
                      Say this is authorized on-air wording: a compatible host
                      delivers it exactly, while genuine persona resistance is
                      stated on air as a bend or refusal without revealing the
                      private Host note. Keep each to one clear intent. A
                      vision-capable active model can also discuss an image on
                      the center table.
                    </small>
                  )}
                </div>
                <section
                  className={styles.producerCueBank}
                  aria-label="Director cues"
                >
                  <header className={styles.producerCueBankHeader}>
                    <div>
                      <span>Director cues</span>
                      <strong>Press to send</strong>
                    </div>
                    <small>Physical cue bank</small>
                  </header>
                  <div className={styles.cueGrid}>
                  <button
                    type="button"
                    className={`${styles.cueKey} ${styles.refocusCue}`}
                    data-queued={
                          queuedProducerCue?.kind === "refocus"
                            ? "true"
                            : undefined
                    }
                    aria-pressed={queuedProducerCue?.kind === "refocus"}
                    disabled={!producerCueAvailable}
                    onClick={() => sendCue({ kind: "refocus" })}
                  >
                    <span className={styles.cueKeyCap}>
                      <span className={styles.cueKeySymbol} aria-hidden="true">◎</span>
                      <span className={styles.cueKeyLabel}>
                        <strong>Refocus</strong>
                        <small>Center</small>
                      </span>
                    </span>
                    <span className={styles.cueKeyLamp} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.cueKey}
                    data-cue-kind="press"
                    data-queued={
                      queuedProducerCue?.kind === "press_harder"
                        ? "true"
                        : undefined
                    }
                    aria-pressed={queuedProducerCue?.kind === "press_harder"}
                    disabled={!producerCueAvailable}
                    onClick={() => sendCue({ kind: "press_harder" })}
                  >
                    <span className={styles.cueKeyCap}>
                      <span className={styles.cueKeySymbol} aria-hidden="true">▲</span>
                      <span className={styles.cueKeyLabel}>
                        <strong>Press harder</strong>
                        <small>Pressure</small>
                      </span>
                    </span>
                    <span className={styles.cueKeyLamp} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.cueKey}
                    data-cue-kind="move"
                    data-queued={
                          queuedProducerCue?.kind === "move_on"
                            ? "true"
                            : undefined
                    }
                    aria-pressed={queuedProducerCue?.kind === "move_on"}
                    disabled={!producerCueAvailable}
                    onClick={() => sendCue({ kind: "move_on" })}
                  >
                    <span className={styles.cueKeyCap}>
                      <span className={styles.cueKeySymbol} aria-hidden="true">→</span>
                      <span className={styles.cueKeyLabel}>
                        <strong>Move on</strong>
                        <small>Advance</small>
                      </span>
                    </span>
                    <span className={styles.cueKeyLamp} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.cueKey}
                    data-cue-kind="lighten"
                    data-queued={
                      queuedProducerCue?.kind === "lighten_up"
                        ? "true"
                        : undefined
                    }
                    aria-pressed={queuedProducerCue?.kind === "lighten_up"}
                    disabled={!producerCueAvailable}
                    onClick={() => sendCue({ kind: "lighten_up" })}
                  >
                    <span className={styles.cueKeyCap}>
                      <span className={styles.cueKeySymbol} aria-hidden="true">✦</span>
                      <span className={styles.cueKeyLabel}>
                        <strong>Lighten up</strong>
                        <small>Lift</small>
                      </span>
                    </span>
                    <span className={styles.cueKeyLamp} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.cueKey}
                    data-cue-kind="wrap"
                    data-queued={
                          queuedProducerCue?.kind === "wrap_up"
                            ? "true"
                            : undefined
                    }
                    aria-pressed={queuedProducerCue?.kind === "wrap_up"}
                    disabled={!producerCueAvailable}
                    onClick={() => sendCue({ kind: "wrap_up" })}
                  >
                    <span className={styles.cueKeyCap}>
                      <span className={styles.cueKeySymbol} aria-hidden="true">◉</span>
                      <span className={styles.cueKeyLabel}>
                        <strong>Wrap it up</strong>
                        <small>Close</small>
                      </span>
                    </span>
                    <span className={styles.cueKeyLamp} aria-hidden="true" />
                  </button>
                  </div>
                </section>
              </aside>
              </div>
            ) : null}
            {episode.playbackMode !== "watch" &&
              episode.guestKind === "producer" &&
              episode.status === "live" ? (
              <div
                className={styles.producerGuestComposerDock}
                data-tutorial-target="botcast-cues"
                data-signal-producer-guest-composer="true"
              >
                <div className={styles.producerGuestActionRail}>
                  <button
                    type="button"
                    className={styles.producerGuestSipButton}
                    onClick={sipCoffeeAsProducerGuest}
                    disabled={producerGuestSipDisabled}
                    data-sipping={producerGuestSipActive ? "true" : undefined}
                    aria-label="Sip coffee on air"
                  >
                    <span aria-hidden="true">☕</span>
                    {producerGuestSipActive ? "Sipping…" : "Sip coffee"}
                  </button>
                </div>
                {!busy &&
                speakingMessageId === null &&
                botcastNextSpeakerRole({
                  messages: episode.messages,
                  segment: episode.segment,
                  guestDeparted: false,
                }) === "guest" ? (
                  <small className={styles.producerGuestThinkingStatus}>
                    Thinking · episode clock at half speed
                  </small>
                ) : null}
                {renderProducerGuestComposer?.({
                  value: producerGuestAnswerDraft,
                  awaitingAnswer:
                    botcastNextSpeakerRole({
                      messages: episode.messages,
                      segment: episode.segment,
                      guestDeparted: false,
                    }) === "guest",
                  inputDisabled: false,
                  disabled:
                    !producerGuestHostInterruption &&
                      (busy ||
                        speakingMessageId !== null ||
                        botcastNextSpeakerRole({
                          messages: episode.messages,
                          segment: episode.segment,
                          guestDeparted: false,
                        }) !== "guest"),
                  shhActive: producerGuestHostInterruption !== null,
                    placeholder: producerGuestHostInterruption
                      ? "Type your answer — Send cuts in now…"
                      : busy || speakingMessageId !== null
                        ? "Type your answer while the host has the mic…"
                        : "Answer as the Producer…",
                  onChange: (value) => {
                    producerGuestAnswerDraftRef.current = value;
                  },
                  onSubmit: (value) => void submitProducerGuestAnswer(value),
                  onShh: () => void shushProducerGuestHost(),
                }) ?? (
                  <form
                    className={styles.producerGuestFallbackComposer}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitProducerGuestAnswer();
                    }}
                  >
                    <textarea
                      value={producerGuestAnswerDraft}
                      disabled={false}
                      onChange={(event) =>
                        {
                          producerGuestAnswerDraftRef.current =
                            event.currentTarget.value;
                          setProducerGuestAnswerDraft(
                            event.currentTarget.value,
                          );
                        }
                      }
                      onKeyDown={(event) => {
                        if (
                          !shouldSubmitComposerOnEnter({
                            key: event.key,
                            shiftKey: event.shiftKey,
                            isComposing: event.nativeEvent.isComposing,
                          })
                        ) {
                          return;
                        }
                        event.preventDefault();
                        if (
                          !producerGuestAnswerDraft.trim() ||
                          (!producerGuestHostInterruption &&
                            (busy || speakingMessageId !== null))
                        ) {
                          return;
                        }
                        event.currentTarget.form?.requestSubmit();
                      }}
                      placeholder="Answer as the Producer…"
                      enterKeyHint="send"
                    />
                    <button
                      type="submit"
                      disabled={
                        !producerGuestAnswerDraft.trim() ||
                        (!producerGuestHostInterruption &&
                          (busy || speakingMessageId !== null))
                      }
                    >
                      Send
                    </button>
                    {producerGuestHostInterruption ? (
                      <button
                        type="button"
                        onClick={() => void shushProducerGuestHost()}
                        aria-label="Shh. Interrupt the Signal host"
                      >
                        Shh
                      </button>
                    ) : null}
                  </form>
                )}
              </div>
            ) : null}
            {signalMemoryReceiptDetail ? (
              <section
                className={styles.signalMemoryReceiptDetail}
                aria-label="New Signal memory details"
                data-signal-memory-receipt-detail="true"
              >
                {signalMemoryReceiptDetail}
              </section>
            ) : null}
            {episode.status === "completed" && !watchReplayPresentation ? (
              <button
                type="button"
                className={styles.returnButton}
                onClick={() => void returnFromCompletedEpisode()}
                disabled={watchReplayFinalizingEpisodeId === episode.id}
              >
                {watchReplayFinalizingEpisodeId === episode.id
                  ? "Finalizing replay…"
                  : "Return to show"}
              </button>
            ) : null}
          </div>
        ) : replayEpisode && selectedShow ? (
          <div className={styles.replayLayout}>
            <div className={styles.replayHeader}>
              <div>
                <span className={styles.eyebrow}>From the archive</span>
                <h2>{replayEpisode.title}</h2>
                  <p>
                    {new Date(replayEpisode.startedAt).toLocaleString()} ·{" "}
                    {episodeModeLabel(replayEpisode)} ·{" "}
                    {replayEpisode.model
                      ? (modelLabels.get(replayEpisode.model) ??
                        replayEpisode.model)
                      : "Auto"}{" "}
                    · {episodeOutcomeLabel(replayEpisode)}
                  </p>
              </div>
              <div className={styles.replayHeaderActions}>
                {onCreateSlateStory ? (
                  <button
                    type="button"
                    onClick={() => void createEpisodeStoryInSlate(replayEpisode)}
                    disabled={slateStoryEpisodeId !== null}
                    data-tutorial-target="botcast-create-slate-story"
                  >
                    {slateStoryEpisodeId === replayEpisode.id
                      ? "Creating in Slate…"
                      : "Create in Slate"}
                  </button>
                ) : null}
                  <button
                    type="button"
                    onClick={() => void copyEpisodeForReview(replayEpisode)}
                    disabled={
                      reviewCopyState?.episodeId === replayEpisode.id &&
                      reviewCopyState.phase === "copying"
                    }
                    aria-live="polite"
                  >
                    {signalReviewCopyLabel(reviewCopyState, replayEpisode.id)}
                  </button>
                <button
                  type="button"
                  onClick={() => {
                    stopReplayPlayback();
                    setReplayEpisode(null);
                    setReplayRecording(null);
                    setReplayManifestV2(null);
                    setReplayIntroRevealed(false);
                  }}
                >
                  Close replay
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                    onClick={(event) =>
                      openEpisodeDeletion(replayEpisode, event.currentTarget)
                    }
                  disabled={busy}
                >
                  Delete episode
                </button>
              </div>
            </div>
            <div
              className={styles.replayStage}
              data-playback={replayPlaying ? "playing" : "paused"}
              data-intro-pending={
                replayBookend?.kind === "intro" && !replayIntroRevealed
                  ? "true"
                  : undefined
              }
            >
              {renderStage({
                show: selectedShow,
                currentEpisode: replayEpisode,
                host: replayHostBot,
                guest: replayGuestBot,
                shot: replayShot,
                activeMessage: replayActiveMessage,
                replay: true,
                guestDeparted: replayGuestDeparted,
                hostDeparted: replayHostDeparted,
              })}
              {replayBookend ? (
                <SignalReplayBookend
                  kind={replayBookend.kind}
                  show={selectedShow}
                  episode={replayEpisode}
                  guestName={
                      replayGuestBot?.name ?? replayEpisode.guestName ?? "Guest"
                  }
                  introSource={
                      replayPresentationManifestV2?.visual.metadata
                        ?.introAudioSource === "elevenlabs"
                      ? "elevenlabs"
                      : selectedShow.introAudio.source
                  }
                  playing={replayPlaying}
                  revealed={replayIntroRevealed}
                  phase={replayIntroLandingActive ? "landing" : undefined}
                  landingFadeMs={
                    replayBookend.kind === "intro"
                      ? replayIntroAutomaticFadeMs
                      : undefined
                  }
                  pictureStartMs={
                    replayBookend.kind === "intro"
                      ? replayIntroAutomaticOffsetMs
                      : undefined
                  }
                />
              ) : null}
              {!replayPlaying ? (
                <button
                  type="button"
                  className={styles.replayPauseChrome}
                  onClick={() => {
                    startReplayPlayback();
                  }}
                  aria-label={
                    replayBookend?.kind === "intro" && !replayIntroRevealed
                      ? "Play episode"
                      : "Resume playback"
                  }
                >
                  {replayBookend?.kind === "intro" && !replayIntroRevealed ? (
                      <span
                        className={styles.replayPauseGlyph}
                        data-kind="play"
                        aria-hidden="true"
                      >
                      <svg viewBox="0 0 24 24" width="36" height="36">
                        <path fill="currentColor" d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  ) : (
                    <>
                      <span className={styles.replayPausedLabel}>Paused</span>
                      <span
                        className={styles.replayPauseGlyph}
                        data-kind="pause"
                        aria-hidden="true"
                      >
                        <svg viewBox="0 0 24 24" width="34" height="34">
                            <path
                              fill="currentColor"
                              d="M6 5h4v14H6zm8 0h4v14h-4z"
                            />
                        </svg>
                      </span>
                      <small>Click to resume</small>
                    </>
                  )}
                </button>
              ) : null}
            </div>
              {replayFaithful && replayActiveAudioUrl ? (
                <audio
                  ref={replayAudioRef}
                  src={replayActiveAudioUrl}
                  preload="auto"
                  onEnded={(event) => {
                    const elapsedMs = Math.max(
                      0,
                      Math.min(
                        replayDurationMs,
                        Math.round(event.currentTarget.currentTime * 1_000),
                      ),
                    );
                    replayPublishedElapsedMsRef.current = elapsedMs;
                    setReplayElapsedMs(elapsedMs);
                    setReplayPlaying(false);
                  }}
                  onError={() => setReplayPlaying(false)}
                />
              ) : null}
              <section
                className={styles.replayPlayer}
                aria-label="Signal replay playback"
                data-playing={replayPlaying ? "true" : undefined}
                data-source={replayPlaybackSource}
              >
                <header className={styles.replayPlayerHeader}>
                  <div className={styles.replayPlayerIdentity}>
                    <span>Now playing</span>
                    <div>
                      <strong>{replayPlaybackLabel}</strong>
                      <small>{replayPlaybackDescription}</small>
                    </div>
                  </div>
                  {studioCutReady ? (
                    <details className={styles.replayVersionMenu}>
                      <summary>
                        <span>Version</span>
                        <strong>{replayPlaybackLabel}</strong>
                      </summary>
                      <div role="menu" aria-label="Choose replay version">
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={replayPlaybackSource === "studio-cut"}
                          onClick={(event) => {
                            stopReplayPlayback();
                            replayPublishedElapsedMsRef.current = 0;
                            setReplayElapsedMs(0);
                            setReplayPlaybackSource("studio-cut");
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                          }}
                        >
                          <Sparkles aria-hidden="true" />
                          <span>
                            <strong>
                              {premiumAction === "repair"
                                ? "Premium repair"
                                : "Premium audio"}
                            </strong>
                            <small>Polished voice mix</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={replayPlaybackSource === "on-air"}
                          onClick={(event) => {
                            stopReplayPlayback();
                            replayPublishedElapsedMsRef.current = 0;
                            setReplayElapsedMs(0);
                            setReplayPlaybackSource("on-air");
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                          }}
                        >
                          <span>
                            <strong>Original broadcast</strong>
                            <small>Exactly as aired</small>
                          </span>
                        </button>
                        <span className={styles.replayVersionDivider} />
                        <button
                          type="button"
                          role="menuitem"
                          className={styles.replayVersionRemove}
                          disabled={studioCutBusy}
                          onClick={(event) => {
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                            void removeStudioCut();
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                          Remove Premium version
                        </button>
                      </div>
                    </details>
                  ) : (
                    <span className={styles.replaySourceBadge}>
                      Original broadcast
                    </span>
                  )}
                </header>

                <div
                  ref={replayTransportRef}
                  className={styles.replayTransport}
                  style={
                    {
                      "--replay-progress": `${
                        replayDurationMs > 0
                          ? Math.min(
                              100,
                              Math.max(
                                0,
                                (replayElapsedMs / replayDurationMs) * 100,
                              ),
                            )
                          : 0
                      }%`,
                    } as CSSProperties
                  }
                >
                  <button
                    className={styles.replayPlayButton}
                    type="button"
                    title={
                      replayFaithful
                        ? replayPlaying
                          ? "Pause replay"
                          : "Play replay"
                        : "This episode has no faithful audio"
                    }
                    aria-label={
                      replayFaithful
                        ? replayPlaying
                          ? "Pause replay"
                          : "Play replay"
                        : "Transcript only"
                    }
                    onClick={() => {
                      if (!replayFaithful) return;
                      if (replayPlaying) {
                        stopReplayPlayback();
                      } else {
                        startReplayPlayback();
                      }
                    }}
                    disabled={!replayFaithful}
                  >
                    {replayPlaying ? (
                      <Pause aria-hidden="true" />
                    ) : (
                      <Play aria-hidden="true" />
                    )}
                  </button>
                  <span className={styles.replayTime}>
                    <strong ref={replayTimeRef}>
                      {runtimeLabel(replayElapsedMs)}
                    </strong>
                    <span aria-hidden="true">/</span>
                    <span>{runtimeLabel(replayDurationMs)}</span>
                  </span>
                  <label className={styles.replayProgress}>
                    <span className={styles.replayProgressTrack}>
                      <span className={styles.replayProgressFill} />
                    </span>
                    <input
                      ref={replayRangeRef}
                      type="range"
                      min={0}
                      max={replayDurationMs}
                      step={100}
                      value={replayElapsedMs}
                      onChange={(event) => {
                        stopReplayPlayback();
                        const nextMs = Number(event.target.value);
                        replayPublishedElapsedMsRef.current = nextMs;
                        setReplayElapsedMs(nextMs);
                        if (replayAudioRef.current) {
                          replayAudioRef.current.currentTime = nextMs / 1_000;
                        }
                      }}
                      aria-label="Replay position"
                      disabled={!replayFaithful}
                    />
                  </label>
                </div>

                <footer className={styles.replayPlayerFooter}>
                  <div className={styles.replayFileActions}>
                    {replayActiveDownloadUrl ? (
                      <a
                        className={styles.replayAction}
                        href={replayActiveDownloadUrl}
                        download
                      >
                        <Download aria-hidden="true" />
                        Download audio
                      </a>
                    ) : null}
                    {replayRecording?.transcriptMarkdownUrl ? (
                      <a
                        className={styles.replayAction}
                        href={replayRecording.transcriptMarkdownUrl}
                        download
                      >
                        <FileText aria-hidden="true" />
                        Transcript
                      </a>
                    ) : null}
                  </div>
                  <div className={styles.replayQuality}>
                    <span>
                      <span
                        className={styles.replayQualityDot}
                        data-quality={
                          replayVoiceQuality?.status ?? "original_only"
                        }
                      />
                      {replayVoiceQualityLabel}
                    </span>
                    {premiumProgressLabel ? (
                      <span
                        className={styles.replayQualityProgress}
                        role="status"
                      >
                        <LoaderCircle aria-hidden="true" />
                        {premiumProgressLabel}
                      </span>
                    ) : !studioCutReady &&
                      premiumAction &&
                      studioCut?.phase === "failed" &&
                      (studioCut.masterReady ||
                        studioCutEligibilityState?.eligible === true) ? (
                      <button
                        className={`${styles.replayAction} ${styles.replayStudioCutAction}`}
                        type="button"
                        aria-busy={studioCutBusy}
                        disabled={studioCutBusy}
                        title={
                          studioCutEligibilityState?.blockedReason ?? undefined
                        }
                        onClick={() =>
                          void (studioCut.masterReady
                            ? remixStudioCut()
                            : requestStudioCut(premiumAction))
                        }
                      >
                        <Sparkles aria-hidden="true" />
                        {premiumAction === "repair"
                          ? "Retry repair"
                          : "Retry upgrade"}
                      </button>
                    ) : !studioCutReady &&
                      premiumAction &&
                      studioCutEligibilityState?.eligible === true ? (
                      <button
                        className={`${styles.replayAction} ${styles.replayStudioCutAction}`}
                        type="button"
                        disabled={studioCutBusy || studioCutPending}
                        onClick={() => void requestStudioCut(premiumAction)}
                      >
                        <Sparkles aria-hidden="true" />
                        {premiumActionLabel}
                      </button>
                    ) : null}
                  </div>
                </footer>

                {!studioCutReady &&
                premiumAction &&
                studioCut?.phase === "failed" &&
                studioCut.error ? (
                  <span className={styles.replayStatus} role="status">
                    {studioCut.error}
                  </span>
                ) : null}
              </section>
            <div className={styles.replayTranscript}>
              {replayIntroDurationMs > 0 ? (
                <button
                  type="button"
                  data-botcast-replay-intro-row="true"
                  data-active={
                    replayElapsedMs < replayIntroCardEndMs
                      ? "true"
                      : undefined
                  }
                  onClick={() => seekFaithfulReplay(0)}
                  disabled={!replayFaithful}
                  aria-label={`Play Signal intro, ${runtimeLabel(replayIntroCardEndMs)}`}
                >
                  <strong>Signal intro</strong>
                  <span>
                    Opening video · {runtimeLabel(replayIntroCardEndMs)}
                  </span>
                </button>
              ) : null}
              {replayEpisode.messages.map((message, index) => {
                const messageBot =
                  message.speakerRole === "host"
                    ? replayHostBot
                    : replayGuestBot;
                const publicReactionSpeech = botcastPublicReactionSpeechForMessage(
                  replayEpisode.events,
                  message.id,
                );
                return botcastMessageIsAudibleToAudienceV1(message) ? (
                  <Fragment key={message.id}>
                    <button
                      type="button"
                      data-botcast-replay-row="true"
                      data-active={
                        index === replayMessageIndex ? "true" : undefined
                      }
                      data-power-voice-presence={
                        messageBot?.voicePresence ?? undefined
                      }
                      onClick={() => {
                        const nextMs =
                          replayActiveTimeline?.beats.find(
                            (beat) => beat.sourceMessageId === message.id,
                          )?.startMs ??
                            replayTimeline.messageStartMs[index] ??
                            0;
                        seekFaithfulReplay(nextMs);
                      }}
                      disabled={!replayFaithful}
                    >
                      <strong>
                        {botsById.get(message.botId)?.name ??
                          message.speakerRole}
                      </strong>
                      <span>
                        {signalVoicePerformanceTranscriptText(message)}
                      </span>
                    </button>
                    <SpeechIntentReveal
                      available={
                        message.speechIntentRevealAvailable === true
                      }
                      mode="signal"
                      scopeId={replayEpisode.id}
                      recordId={message.id}
                      request={request}
                    />
                    {publicReactionSpeech.map((speech, reactionIndex) => (
                      <div
                        key={`${message.id}:reaction:${reactionIndex}`}
                        data-botcast-replay-reaction-row="true"
                        data-signal-transcript-speech="true"
                      >
                        <strong>
                          {botsById.get(speech.botId)?.name ?? "Speaker"}
                        </strong>
                        <span>{speech.text}</span>
                      </div>
                    ))}
                  </Fragment>
                ) : null;
              })}
              {visiblePresenceBeats.flatMap((beat) => {
                const heard = beat.text.slice(0, beat.heardCharacterCount);
                return heard
                  ? [
                      <div key={beat.id}>
                        <strong>{beat.speaker.name}</strong>
                        <span>{heard}</span>
                      </div>,
                    ]
                  : [];
              })}
            </div>
          </div>
        ) : selectedShow && showHasVacantHost ? (
          <div className={styles.showDashboard} data-signal-vacant-host-recovery="true">
            <section className={styles.signalVacantHostRecovery} aria-live="polite">
              <span className={styles.eyebrow}>Host seat vacant</span>
              <h2>{selectedShow.name} is preserved.</h2>
              <p>Its archive remains intact. Future production is paused until a new host personally agrees to take the chair.</p>
              {hostRecoveryBusy && !hostRecovery ? <p className={styles.signalVacantHostStatus}>Screening your local bot library…</p> : null}
              <div className={styles.signalVacantHostCandidates}>
                {(hostRecovery?.candidates ?? []).map((candidate) => {
                  const bot = botsById.get(candidate.botId);
                  const available = signalHostRecoveryCandidateEnabled(candidate);
                  return <div key={candidate.botId} className={styles.signalVacantHostCandidate} data-status={candidate.status}>
                    <div><strong>{bot?.name ?? "Unavailable bot"}</strong><small>{candidate.reason}</small></div>
                    <button type="button" disabled={!available || hostRecoveryBusy} title={available ? "Ask this bot for private consent to host future episodes" : candidate.reason} onClick={() => void askReplacementHost(candidate)}>
                      {signalHostRecoveryCandidateLabel(candidate, hostRecoveryBusy)}
                    </button>
                  </div>;
                })}
              </div>
              {!hostRecoveryBusy && (hostRecovery?.candidates.length ?? 0) === 0 ? <p className={styles.signalVacantHostStatus}>No eligible owned bots are available to host this show.</p> : null}
            </section>
          </div>
        ) : selectedShow && dashboardAtmosphere ? (
          <div className={styles.showDashboard}>
            <section
              className={styles.showBrandPreview}
                data-studio-source={
                  dashboardAtmosphere.imageUrl ? "image" : "fallback"
                }
                data-identity-settings-open={
                  showIdentityControlsExpanded ? "true" : undefined
                }
              data-tutorial-target="botcast-brand-controls"
              style={
                {
                    "--botcast-accent":
                      hostShowAccent ?? selectedShow.accentColor,
                    "--botcast-host-accent":
                      hostShowAccent ?? selectedShow.accentColor,
                  "--botcast-show-accent": selectedShow.accentColor,
                    "--botcast-studio-accent":
                      hostShowAccent ?? selectedShow.accentColor,
                  ...(dashboardAtmosphere.imageUrl
                    ? {
                        "--botcast-dashboard-atmosphere": `url("${dashboardAtmosphere.imageUrl}")`,
                      }
                    : {}),
                  ...(dashboardStudioLightingStyle ?? {}),
                } as CSSProperties
              }
              aria-label={`${selectedShow.name} show identity`}
            >
              {dashboardAtmosphere.imageUrl ? (
                  <div
                    className={styles.showBrandAtmosphere}
                    aria-hidden="true"
                  />
              ) : (
                <SignalFallbackStudio
                  surface="dashboard"
                  accentVariant={selectedShow.fallbackStudioAccentVariant}
                />
              )}
              <SignalStudioMicrophoneTint
                atmosphere={dashboardAtmosphere}
                layout={selectedShow.studioLayout}
                hostColor={hostShowAccent ?? selectedShow.accentColor}
                guestColor={hostShowAccent ?? selectedShow.accentColor}
                theme={theme}
                surface="dashboard"
              />
              {dashboardStudioLightingStyle ? (
                <div
                  className={styles.studioGlow}
                  data-generated-lighting="true"
                  aria-hidden="true"
                />
              ) : null}
              <div className={styles.showBrandContent}>
                <SignalShowLogo show={selectedShow} />
                <div className={styles.showBrandIdentity}>
                  <span className={styles.eyebrow}>Show identity</span>
                  <h2>{selectedShow.name}</h2>
                  <p>{hostBot?.name ?? "Host"}</p>
                  {showAudience ? (
                      <button
                        type="button"
                      className={styles.showAudiencePulse}
                      data-tutorial-target="botcast-audience-pulse"
                        aria-label="Open Signal audience pulse details"
                        aria-haspopup="dialog"
                        aria-expanded={audiencePulseOpen}
                        onClick={(event) => {
                          audiencePulseReturnFocusRef.current =
                            event.currentTarget;
                          setAudiencePulseShowId(selectedShow.id);
                        }}
                    >
                        <span className={styles.showAudienceTitle}>
                          <span>Audience pulse</span>
                          <span
                            className={styles.showAudienceOpenHint}
                            aria-hidden="true"
                          >
                            See all
                          </span>
                        </span>
                        <span
                          className={styles.showAudienceMetrics}
                          role="list"
                        >
                            <span
                            className={styles.showAudienceMetric}
                            role="listitem"
                          >
                          <small>Views</small>
                            <strong>
                              {formatSignalAudienceViews(
                                showAudience.totalViews,
                              )}
                            </strong>
                        </span>
                          <span
                            className={styles.showAudienceMetric}
                            role="listitem"
                          >
                            <small>
                              {showAudience.ratingConfidence === "early"
                                ? "Early rating"
                                : "Rating"}
                            </small>
                          <strong
                            className={styles.showAudienceRatingValue}
                              style={
                                {
                                  ["--signal-rating-color" as string]:
                                    signalAudienceRatingColor(
                                      showAudienceRating,
                                    ) ?? undefined,
                                } as CSSProperties
                              }
                              aria-label={
                                showAudienceRating === 0
                                  ? "No audience rating yet"
                                  : `${showAudienceRating.toFixed(1)} out of 5${
                                      showAudience.ratingConfidence === "early"
                                        ? ", early rating"
                                        : ""
                                    }`
                              }
                          >
                            <>
                              {showAudienceRating.toFixed(1)}
                              <span
                                className={styles.showAudienceRatingStar}
                                aria-hidden="true"
                              >
                                ★
                              </span>
                            </>
                          </strong>
                        </span>
                          <span
                            className={styles.showAudienceMetric}
                            role="listitem"
                          >
                          <small>Reviews</small>
                            <strong>
                              {showAudience.reviewCount.toLocaleString("en-US")}
                            </strong>
                        </span>
                        </span>
                      {showAudience.featuredReview ? (
                          <span className={styles.showAudienceQuote}>
                            <span>“{showAudience.featuredReview.quote}”</span>
                            <cite>
                              — {showAudience.featuredReview.listener}
                            </cite>
                          </span>
                      ) : (
                          <span className={styles.showAudienceEmpty}>
                            {showAudience.totalViews > 0
                              ? "Waiting for the first listener review."
                              : "Release an episode to start building an audience."}
                          </span>
                      )}
                      </button>
                  ) : null}
                </div>
                {selectedShowMagicManifest &&
                !selectedShowMagicManifest.complete &&
                !showIdentityControlsExpanded ? (
                  <div
                    className={styles.showLookInvitation}
                    aria-label="Complete this show’s identity"
                  >
                    <strong>Complete the show.</strong>
                      <small>
                        Signal adds only what is missing, keeps any artwork you
                        have installed, and can be rerun whenever a piece needs
                        another pass.
                      </small>
                    <PrismRefractTarget
                      target={{
                        id: `signal-complete-show-${selectedShow.id}`,
                        kind: "magic",
                        label: "Complete this show",
                        run: synthesizeShowLook,
                        disabled: () => busy || selectedShowArtworkBusy,
                      }}
                    >
                      {(binding) => (
                        <button
                          {...binding}
                          type="button"
                          data-signal-first-look-action="create"
                          onClick={() => void synthesizeShowLook()}
                          disabled={busy || selectedShowArtworkBusy}
                        >
                          Complete this show
                        </button>
                      )}
                    </PrismRefractTarget>
                  </div>
                ) : null}
                  <div
                    id={`signal-show-identity-controls-${selectedShow.id}`}
                    className={styles.showLookControls}
                    aria-label="Show identity controls"
                    hidden={!showIdentityControlsExpanded}
                  >
                    <strong>Tune the identity.</strong>
                      <small>
                        Refresh the linked studio pair, tune the premise, name,
                        dashboard blurbs, and logo, or shape the opening ident.
                      </small>
                    <div data-signal-asset-rails="true">
                      <AssetRail
                        kind="signal_studio"
                        generation={assetRailGeneration?.("signal_studio")}
                        label="Studio pairs"
                        context={selectedShow.hostBotId}
                        currentImageIds={[
                          selectedShow.dayAtmosphere.imageId,
                          selectedShow.nightAtmosphere.imageId,
                        ]}
                        refreshKey={`${selectedShow.dayAtmosphere.imageId ?? ""}:${selectedShow.nightAtmosphere.imageId ?? ""}`}
                        disabled={busy || selectedShowArtworkBusy}
                        sourceFilter="generated"
                        onSynthesize={regenerateStudio}
                        onSelect={(asset) =>
                          reuseShowAssetSet(asset, "studio pair")
                        }
                      />
                      <AssetRail
                        kind="signal_logo"
                        generation={assetRailGeneration?.("signal_logo")}
                        label="Logos"
                        context={selectedShow.hostBotId}
                        currentImageIds={[selectedShow.logo.imageId]}
                        refreshKey={selectedShow.logo.imageId}
                        disabled={busy || selectedShowArtworkBusy}
                        sourceFilter="generated"
                        onUndo={
                          selectedShow.logo.previousImageUrl ||
                          selectedShow.logo.previousImageId
                            ? undoShowLogo
                            : undefined
                        }
                        undoLabel="Previous logo"
                        onSynthesize={regenerateLogo}
                        onSelect={(asset) => reuseShowAssetSet(asset, "logo")}
                      />
                    </div>
                    <div className={styles.showLookControlGrid}>
                      <div className={styles.showLookControlGroup}>
                        <label htmlFor={`signal-show-name-${selectedShow.id}`}>
                            Name
                          </label>
                        <PrismRefractTarget
                          target={{
                            id: `signal-show-identity-name-${selectedShow.id}`,
                            kind: "field",
                            label: "show name",
                            read: () => showNameDraft,
                            preview: setShowNameDraft,
                            accept: renameShow,
                            disabled: () => busy,
                            generate: ({
                              currentValue,
                              rejectedValues,
                              signal,
                            }) =>
                              generateSignalRefractDraft(
                                {
                                  kind: "signal.show.name",
                                  showId: selectedShow.id,
                                },
                                currentValue,
                                rejectedValues,
                                signal,
                              ),
                          }}
                        >
                          {(binding) => (
                            <input
                              {...binding}
                              id={`signal-show-name-${selectedShow.id}`}
                              className={styles.showLookNameInput}
                              value={showNameDraft}
                              maxLength={80}
                              disabled={busy}
                              aria-label="Edit show name"
                              onChange={(event) =>
                                setShowNameDraft(event.target.value)
                              }
                              onBlur={(event) =>
                                void renameShow(event.currentTarget.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  void renameShow(event.currentTarget.value);
                                  event.currentTarget.blur();
                                } else if (event.key === "Escape") {
                                  setShowNameDraft(selectedShow.name);
                                  event.currentTarget.blur();
                                }
                              }}
                            />
                          )}
                        </PrismRefractTarget>
                      </div>
                      <div className={styles.showLookControlGroup}>
                        <label
                          htmlFor={`signal-show-premise-${selectedShow.id}`}
                        >
                          Premise
                        </label>
                        <PrismRefractTarget
                          target={{
                            id: `signal-show-identity-premise-${selectedShow.id}`,
                            kind: "field",
                            label: "show premise",
                            read: () => showPremiseDraft,
                            preview: setShowPremiseDraft,
                            accept: saveShowPremise,
                            disabled: () => busy,
                            generate: ({
                              currentValue,
                              rejectedValues,
                              signal,
                            }) =>
                              generateSignalRefractDraft(
                                {
                                  kind: "signal.show.premise",
                                  showId: selectedShow.id,
                                },
                                currentValue,
                                rejectedValues,
                                signal,
                              ),
                          }}
                        >
                          {(binding) => (
                            <textarea
                              {...binding}
                              id={`signal-show-premise-${selectedShow.id}`}
                              className={styles.showLookPremiseInput}
                              value={showPremiseDraft}
                              maxLength={360}
                              rows={3}
                              disabled={busy}
                              aria-label="Edit show premise"
                              onChange={(event) =>
                                setShowPremiseDraft(event.target.value)
                              }
                              onBlur={(event) =>
                                void saveShowPremise(event.currentTarget.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  setShowPremiseDraft(selectedShow.premise);
                                  event.currentTarget.blur();
                                }
                              }}
                            />
                          )}
                        </PrismRefractTarget>
                      </div>
                        <div className={styles.showLookControlGroup}>
                          <span>Dashboard blurbs</span>
                          <PrismRefractTarget
                            target={{
                              id: `signal-refresh-blurbs-${selectedShow.id}`,
                              kind: "magic",
                              label: "Regenerate blurbs",
                              run: regenerateShowBlurbs,
                              disabled: () => busy,
                            }}
                          >
                            {(binding) => (
                              <button
                                {...binding}
                                type="button"
                                data-signal-identity-action="blurbs"
                                onClick={() => void regenerateShowBlurbs()}
                                disabled={busy}
                              >
                                Regenerate{" "}
                                {hostBot?.echoesAddressedSpeech
                                  ? "blurb"
                                  : "blurbs"}
                              </button>
                            )}
                          </PrismRefractTarget>
                        </div>
                      <div className={styles.showLookControlGroup}>
                          <span>Atmosphere audio</span>
                        <PrismRefractTarget
                            target={{
                              id: `signal-generate-atmosphere-${selectedShow.id}`,
                              kind: "magic",
                              label:
                                selectedShow.introAudio.source ===
                                  "elevenlabs" ||
                                selectedShow.atmosphereAudio.source ===
                                  "elevenlabs"
                                  ? "Refresh atmosphere"
                                  : "Create atmosphere",
                              run: generateShowIntroAudio,
                              disabled: () =>
                                busy || preferredProvider === "local",
                            }}
                          >
                            {(binding) => (
                              <button
                                {...binding}
                                type="button"
                                onClick={() => void generateShowIntroAudio()}
                                disabled={
                                  busy || preferredProvider === "local"
                                }
                                title={
                                  preferredProvider === "local"
                                    ? "Switch to Online to create an ElevenLabs atmosphere"
                                    : undefined
                                }
                              >
                                {selectedShow.introAudio.source ===
                                  "elevenlabs" ||
                                selectedShow.atmosphereAudio.source ===
                                  "elevenlabs"
                                  ? "Refresh atmosphere"
                                  : "Create atmosphere"}
                              </button>
                            )}
                        </PrismRefractTarget>
                        <PrismRefractTarget
                            target={{
                              id: `signal-synthesize-ident-${selectedShow.id}`,
                              kind: "magic",
                              label:
                                preferredProvider === "local"
                                  ? "Synthesize ident · Local"
                                  : "Synthesize ident · Premium",
                              run: synthesizeShowIdent,
                              disabled: () => busy,
                            }}
                          >
                            {(binding) => (
                              <button
                                {...binding}
                                type="button"
                                onClick={() => void synthesizeShowIdent()}
                                disabled={busy}
                                title={
                                  preferredProvider === "local"
                                    ? "Create a fresh ident with the built-in Signal Synth"
                                    : "Create a fresh ident with ElevenLabs"
                                }
                              >
                                {preferredProvider === "local"
                                  ? "Synthesize ident · Local"
                                  : "Synthesize ident · Premium"}
                              </button>
                            )}
                        </PrismRefractTarget>
                        {selectedShow.introAudio.source === "elevenlabs" ||
                        selectedShow.atmosphereAudio.source === "elevenlabs" ? (
                          <button
                            type="button"
                            className={styles.showIntroLocalButton}
                            onClick={() => void selectLocalShowIntro()}
                            disabled={busy}
                          >
                              Use built-in atmosphere
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
              </div>
              {hostBot && !showIdentityControlsExpanded && !hostChatOpen ? (
                <div
                  className={styles.showCardHostPresence}
                  data-host-chat-open={hostChatOpen ? "true" : undefined}
                >
                  <button
                    type="button"
                    className={styles.showCardHostTrigger}
                    data-tutorial-target="botcast-host-chat"
                    aria-label={
                      hostChatOpen
                        ? `Close off-air chat with ${hostBot.name}`
                        : `Talk off-air with ${hostBot.name} about ${selectedShow.name}`
                    }
                    aria-expanded={hostChatOpen}
                    aria-controls={`signal-show-host-chat-${selectedShow.id}`}
                    disabled={showIdentityControlsExpanded}
                    title={`Talk with ${hostBot.name} about this show and its episodes`}
                    onClick={toggleSignalHostChat}
                  >
                    <div
                      className={styles.showCardHostFloat}
                      aria-hidden="true"
                    >
                    {renderAvatar?.(hostBot, {
                      talking: false,
                      thinking: hostChatBusy,
                      sipping: false,
                      role: "host",
                      surface: "dashboard",
                      sfxEnabled: false,
                      facing: signalStudioFacingForRole(
                            normalizeBotcastStudioLayout(
                              selectedShow.studioLayout,
                            ),
                        "host",
                      ),
                      theme,
                      mouthShape: "closed",
                    }) ?? avatarFallback(hostBot)}
                  </div>
                  </button>
                </div>
              ) : null}
              {showCardQuipIndex !== null &&
              showCardQuips &&
              !hostChatOpen &&
              !showIdentityControlsExpanded ? (
                <p
                  key={`${selectedShow.id}:${showCardQuipIndex}`}
                  className={styles.showCardQuipBubble}
                  aria-live="polite"
                >
                  “{showCardQuips[showCardQuipIndex]}”
                </p>
              ) : null}
              <button
                  type="button"
                  className={styles.showIdentityGearButton}
                    data-expanded={
                      showIdentityControlsExpanded ? "true" : undefined
                    }
                    aria-label={
                      showIdentityControlsExpanded
                    ? "Hide show identity settings"
                        : "Open show identity settings"
                    }
                  aria-expanded={showIdentityControlsExpanded}
                  aria-controls={`signal-show-identity-controls-${selectedShow.id}`}
                    title={
                      showIdentityControlsExpanded
                    ? "Hide show identity settings"
                        : "Tune this show’s identity"
                    }
                    onClick={() =>
                      setShowIdentityControlsShowId((current) =>
                        current === selectedShow.id ? null : selectedShow.id,
                      )
                    }
                >
                  <span aria-hidden="true">⚙</span>
                </button>
            </section>
            <section
              className={styles.showIntroControl}
              data-tutorial-target="botcast-intro-audio"
                aria-label="Signal episode atmosphere audio"
            >
              <div className={styles.showIntroPulse} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
              </div>
              <div>
                  <span className={styles.eyebrow}>Atmosphere audio</span>
                <h3>
                  {selectedShow.atmosphereAudio.source === "elevenlabs"
                      ? "Custom show atmosphere"
                      : "Built-in studio atmosphere"}
                </h3>
                <p>
                  {selectedShow.atmosphereAudio.source === "elevenlabs"
                      ? selectedShow.introAudio.source === "elevenlabs"
                        ? "A cached six-second ident plus a quiet, studio-specific room-and-Foley loop. Nothing is generated when an episode begins."
                        : "Signal Synth opens the show, backed by this studio’s cached room-and-Foley loop. Nothing is generated when an episode begins."
                      : "Signal Synth opens the show while a bundled, non-musical room atmosphere sits quietly behind the conversation. Tactile cup and vocal Foley remain synchronized to the studio action."}
                </p>
              </div>
              <div className={styles.showIntroActions}>
                <button
                  type="button"
                  className={styles.showIntroPreviewButton}
                    data-active={
                      introPreviewShowId === selectedShow.id ? "true" : "false"
                    }
                  aria-pressed={introPreviewShowId === selectedShow.id}
                  onClick={toggleShowIntroPreview}
                  disabled={
                    !introAudioEnabled ||
                    (busy && introPreviewShowId !== selectedShow.id)
                  }
                    title={
                      !introAudioEnabled
                    ? "Turn voice audio on to preview the intro"
                        : undefined
                    }
                >
                  {introPreviewShowId === selectedShow.id
                    ? "■ Stop preview"
                      : "▶ Play ident"}
                </button>
                {selectedShow.introAudio.undoAvailable ||
                selectedShow.atmosphereAudio.undoAvailable ? (
                  <button
                    type="button"
                    className={styles.showIntroUndoButton}
                    onClick={() => void undoShowAudioPackage()}
                    disabled={busy}
                  >
                    ↶ Undo audio
                  </button>
                ) : null}
                {!introAudioEnabled ? (
                    <small>
                      Turn voice audio on to hear the intro preview.
                    </small>
                ) : preferredProvider === "local" ? (
                    <small>
                      Switch to Online only when you want to compose or refresh.
                    </small>
                ) : null}
              </div>
            </section>
            {renderEpisodeSetup()}
            {renderArchive()}
          </div>
        ) : (
          <div className={styles.emptyStudio}>
              <span className={styles.logoMark} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            <h1>Give a bot the keys to a studio.</h1>
            <p>Create a show from the producer desk on the left.</p>
          </div>
        )}
      </section>
      {studioLayoutEditorOpen && selectedShow && hostBot
        ? renderStudioLayoutEditor(selectedShow, hostBot, studioLayoutGuest)
        : null}
        {audiencePulseOpen && selectedShow && showAudience ? (
          <div
            className={styles.audiencePulseBackdrop}
            style={
              {
                "--botcast-host-accent":
                  hostShowAccent ?? selectedShow.accentColor,
              } as CSSProperties
            }
          >
            <button
              type="button"
              className={styles.audiencePulseBackdropDismiss}
              onClick={() => setAudiencePulseShowId(null)}
              tabIndex={-1}
              aria-label="Close audience pulse details"
            />
            <section
              className={styles.audiencePulseDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="signal-audience-pulse-title"
              aria-describedby="signal-audience-pulse-description"
            >
              <header className={styles.audiencePulseDialogHeader}>
                <div>
                  <span className={styles.eyebrow}>Audience pulse</span>
                  <h2 id="signal-audience-pulse-title">Listener reviews</h2>
                  <p id="signal-audience-pulse-description">
                    Every completed episode invites one Library persona to
                    listen back. The show rating is the average of these saved
                    reviews.
                  </p>
                </div>
                <button
                  ref={audiencePulseCloseButtonRef}
                  type="button"
                  className={styles.audiencePulseCloseButton}
                  onClick={() => setAudiencePulseShowId(null)}
                  aria-label="Close audience pulse details"
                >
                  ×
                </button>
              </header>
              <div className={styles.audiencePulseSummary} role="list">
                <span role="listitem">
                  <small>Views</small>
                  <strong>
                    {formatSignalAudienceViews(showAudience.totalViews)}
                  </strong>
                </span>
                <span role="listitem">
                  <small>
                    {showAudience.ratingConfidence === "early"
                      ? "Early average"
                      : "Average rating"}
                  </small>
                  <strong
                    style={
                          {
                            ["--signal-rating-color" as string]:
                          signalAudienceRatingColor(showAudienceRating) ??
                          undefined,
                          } as CSSProperties
                        }
                      >
                    {`${showAudienceRating.toFixed(1)} ★`}
                  </strong>
                </span>
                <span role="listitem">
                  <small>Reviews</small>
                  <strong>
                    {showAudience.reviewCount.toLocaleString("en-US")}
                  </strong>
                </span>
              </div>
              {showAudienceReviews.length > 0 ? (
                <div
                  className={styles.audiencePulseReviewList}
                  aria-label="Listener reviews, newest first"
                >
                  {showAudienceReviews.map((review) => (
                    <article
                      key={review.episodeId}
                      className={styles.audiencePulseReview}
                    >
                      <header>
                        <div>
                          <span>Episode {review.episodeNumber}</span>
                          <h3>{review.topic}</h3>
                        </div>
                        <strong
                          style={
                            {
                              ["--signal-rating-color" as string]:
                                signalAudienceRatingColor(review.rating) ??
                                undefined,
                            } as CSSProperties
                          }
                          aria-label={`${review.rating.toFixed(1)} out of 5`}
                        >
                          {review.rating.toFixed(1)}
                          <span aria-hidden="true"> ★</span>
                        </strong>
                      </header>
                      <blockquote>“{review.comment}”</blockquote>
                      <footer>— {review.reviewerName}</footer>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.audiencePulseDialogEmpty}>
                  <strong>No listener reviews yet.</strong>
                  <p>
                    Finish an episode and Signal will invite a persona from your
                    Library to rate it.
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : null}
      {deleteTarget ? (
        <div className={styles.deleteBackdrop}>
          <button
            type="button"
            className={styles.deleteBackdropDismiss}
            onClick={dismissDeletion}
            disabled={busy}
            tabIndex={-1}
            aria-label="Cancel deletion"
          />
          <section
            className={styles.deleteDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="signal-delete-title"
            aria-describedby="signal-delete-description"
          >
            <span className={styles.eyebrow}>Permanent edit</span>
              <h2 id="signal-delete-title">
                {deleteConfirmationCopy(deleteTarget).title}
              </h2>
              <p id="signal-delete-description">
                {deleteConfirmationCopy(deleteTarget).body}
              </p>
              {deleteError ? (
                <p className={styles.deleteError} role="alert">
                  {deleteError}
                </p>
              ) : null}
            <div className={styles.deleteDialogActions}>
              <button
                ref={deleteCancelButtonRef}
                type="button"
                onClick={dismissDeletion}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.deleteConfirmButton}
                onClick={() => void deleteConfirmedTarget()}
                disabled={busy}
              >
                  {busy
                    ? "Removing…"
                    : deleteConfirmationCopy(deleteTarget).action}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {studioCutConfirmation ? (
        <div className={styles.deleteBackdrop}>
          <button
            type="button"
            className={styles.deleteBackdropDismiss}
            onClick={() => setStudioCutConfirmation(null)}
            tabIndex={-1}
            aria-label="Cancel Premium audio action"
          />
          <section
            className={styles.deleteDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="signal-studio-cut-title"
            aria-describedby="signal-studio-cut-description"
          >
            <span className={styles.eyebrow}>
              {studioCutConfirmation.kind === "generate"
                ? "Paid generation"
                : "Saved version"}
            </span>
            <h2 id="signal-studio-cut-title">
              {studioCutConfirmation.kind === "remove"
                ? "Remove this Premium version?"
                : studioCutConfirmation.intent === "repair"
                  ? "Repair the fallback voice?"
                  : "Upgrade these voices?"}
            </h2>
            <p id="signal-studio-cut-description">
              {studioCutConfirmation.kind === "remove" ? (
                "Your exact original broadcast will remain."
              ) : (
                <>
                  Estimated ElevenLabs use:{" "}
                  {studioCutConfirmation.eligibility.characterEstimate.toLocaleString()}{" "}
                  characters from{" "}
                  {studioCutConfirmation.eligibility.targetLineCount}{" "}
                  {studioCutConfirmation.eligibility.targetLineCount === 1
                    ? "line"
                    : "lines"}
                    , across {studioCutConfirmation.eligibility.requestEstimate}{" "}
                    request
                  {studioCutConfirmation.eligibility.requestEstimate === 1
                    ? ""
                    : "s"}
                  . PRISM sends only the lines being{" "}
                  {studioCutConfirmation.intent === "repair"
                    ? "repaired"
                    : "upgraded"}{" "}
                  and their saved ElevenLabs voice IDs.
                </>
              )}
            </p>
            {studioCutConfirmation.kind === "generate" ? (
              <p>
                Existing Premium performances are reused without regeneration.
                Your exact original broadcast remains unchanged.
              </p>
            ) : null}
            <div className={styles.deleteDialogActions}>
              <button
                type="button"
                autoFocus
                onClick={() => setStudioCutConfirmation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  void (studioCutConfirmation.kind === "remove"
                    ? confirmRemoveStudioCut()
                    : confirmStudioCut())
                }
              >
                {studioCutConfirmation.kind === "remove"
                  ? "Remove Premium version"
                  : studioCutConfirmation.intent === "repair"
                    ? "Repair voice"
                    : "Upgrade voices"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
    <PrismBlockingLoader
      open={blockingOperation !== null || watchBakeLabel !== null}
      title={
        blockingOperation?.title ?? liveBakeSurfaceTitle("signal")
      }
      detail={
        blockingOperation?.detail ??
        "Prism is finishing the complete episode and its voice package before opening Replay. You can stop anytime — the booking stays available to reuse."
      }
      stepLabel={
        blockingOperation?.stepLabel ??
        liveBakeStatusCopy(watchBakeArtifact) ??
        watchBakeLabel ??
        "Working"
      }
      progress={
        blockingOperation?.progress ??
        (watchBakeArtifact?.status === "ready" ? 1 : null)
      }
      startedAt={
        blockingOperation ? null : watchBakeStartedAt
      }
      theme={theme}
      footer={
        blockingOperation
          ? "Keep this window open while the light takes shape."
          : "Replay opens only when the full episode is ready. Model thinking and Premium synthesis can stretch the wait."
      }
      onCancel={
        blockingOperation?.cancellable
          ? cancelBlockingOperation
          : watchBakeLabel !== null
            ? cancelWatchBake
            : undefined
      }
      cancelLabel={
        watchBakeLabel !== null ? "Stop preparing" : "Cancel synthesis"
      }
      cancelConfirmTitle={
        watchBakeLabel !== null
          ? "Stop preparing this broadcast?"
          : "Stop synthesizing?"
      }
      cancelConfirmDetail={
        watchBakeLabel !== null
          ? "This Watch attempt will stop and return to the show. Its booking stays available in Latest episodes."
          : "This request will stop. You can try again whenever you are ready."
      }
    />
    </>
  );
}
