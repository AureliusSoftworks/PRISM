"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DEBATE_EVIDENCE_ITEM_MAX_COUNT,
  DEBATE_FORMAT_CATALOG,
  DEBATE_FORMALITY_SPECTRUM,
  DEBATE_JURY_SIZE,
  DEBATE_JUDGE_GAVEL_MESSAGE_MAX_LENGTH,
  DEBATE_MODERATOR_TITLE_MAX_LENGTH,
  DEBATE_OBJECTION_RULING_TIMEOUT_MS,
  DEBATE_PAUSE_COOLDOWN_MS,
  DEBATE_PLAYER_JUDGE_BOT_ID,
  DEBATE_PLAYER_PARTICIPANT_BOT_ID,
  DEBATE_PLAYER_TURN_MAX_LENGTH,
  DEBATE_SCHEMA_VERSION,
  DEBATE_SETUP_PRESETS,
  botPowerObserverProjectionFromEffectsV1,
  debateEventIsAtmosphericVocalFoley,
  debateEventIsTranscriptHousekeeping,
  debateEvidenceExhibitTitle,
  debateEvidenceItemById,
  debateEvidenceItemCount,
  debateEvidenceItems,
  debateFormalityDescriptor,
  debateTitleForMotion,
  debateSpokenText,
  heardBotPresenceBeatTextV1,
  normalizeDebateVoicePerformanceCue,
  normalizeDebateModeratorTitle,
  resolveDebateForumRoundPlan,
  voicePerformanceTextFromActionCues,
  voiceSpokenText,
  debateDebriefEligibleBots,
  debateRecessResumeFiller,
  debateRecessResumePresentationContent,
  debateSessionAwaitsPresentationSeal,
  debateSpectatorAwaitingFirstWatch,
  normalizeBotAudioVoiceControl,
  normalizeBotAudioVoiceProfileV1,
  type DebateAdvocacyConsent,
  type DebateCaseCardV1,
  type DebateDebriefChatMessageV1,
  type DebateEventV1,
  type DebateEvidencePacketV1,
  type DebateEvidenceExhibitV1,
  type DebateEvidenceItemV1,
  type DebateEvidenceSourceV1,
  type DebateFormalityId,
  type DebateForumRoundMode,
  type DebateFormatId,
  type DebateMotionSlateV1,
  type DebateBotSnapshotV1,
  type DebatePlayerRole,
  type DebateSetupPresetId,
  type DebateSessionListItemV1,
  type DebateSessionV1,
  type DebateSideId,
  type DebateTurnaboutFormatStateV1,
  type DebateTurnaboutStatementV1,
  type BotPowerAvatarScaleMode,
  type GraphicsQuality,
  type PrismCompanionDebateDraft,
  type PrismRefractDebateTextTargetKind,
  type PrismRefractResponse,
  type PreparedTurnV1,
  type PreparedTurnUtteranceV1,
  type BotPresenceBeatV1,
  type ResponseMode,
  type LiveBakeArtifactV1,
} from "@localai/shared";
import {
  liveBakeStatusCopy,
  liveBakeSurfaceTitle,
} from "./liveBakeLoading";
import {
  PrismRefractTarget,
  type PrismRefractMagicTarget,
} from "./prismRefract";
import { PrismBlockingLoader } from "./PrismBlockingLoader";
import { AssetRail } from "./AssetLibrary";
import styles from "./DebateExperience.module.css";
import { debateLiveCaptionPage } from "./debateLiveCaption";
import type { DebateForumRole } from "./DebateForumScene";
import {
  copyDebateMotionSlate,
  applyDebateSetupPreset,
  debateAlignmentPreviewCast,
  debateEvidenceSourcePropKind,
  debateMotionRevealState,
  debatePlayerJudgePrefilledCast,
  debateRoomPresence,
  debateSessionRetryDraft,
  derivedDebateSetupPresetId,
  mergeDebateEvidenceSources,
  randomDebateCast,
  randomDebatePlayerJudgeCast,
  type DebateCastSelection,
} from "./debateExperienceState";
import {
  debateAudienceBotCount,
  debateAudienceBotIsGenerated,
  debateAudienceBotIsPlayerSpectator,
  debateAudienceBotsForSession,
  debateAudienceConversationFacing,
  debateAudienceDepartureXPercent,
  debateAudienceSeatLayout,
  debateAudienceSeatIsTalker,
  debateSpectatorPrismAudienceSeat,
} from "./debateAudience";
import {
  debateAudiencePressureBand,
  debateAudiencePressureMix,
  debateAudiencePressureScore,
  debateAudienceTalkerIndices,
  debateAudienceVisualPressureBand,
  type DebateAudiencePressureBand,
} from "./debateAudiencePressure";
import {
  debateArchivedJuryRecordIsCopyable,
  debateEventIsJuryComment,
  debateEventIsJurySidebarComment,
  debateJuryCommentClockLabel,
  debateJuryCommentEvents,
  debateJuryCommentKindLabel,
  debateJuryCommentSpeakerName,
  debateLatestPendingJuryComment,
  formatDebateJuryRecord,
} from "./debateJuryRecord";
import {
  debateJuryPresentationKeepsForumCamera,
  type DebateJuryCameraPresentationV1,
} from "./debateJuryCamera";
import {
  debateUrlEvidenceSourceFromDraft,
  emptyDebateUrlEvidenceDraft,
  type DebateUrlEvidenceDraft,
} from "./debateUrlEvidence";
import {
  DEBATE_EVIDENCE_EMOJI_CHOICES,
  applyDebateEvidenceObjectNameEdit,
  debateEvidenceObjectDraftFromPrismCandidate,
  nextDebateEvidenceExhibitId,
  searchDebateEvidenceEmojis,
  type DebateEvidenceObjectDraft,
} from "./debateEvidenceExhibits";
import {
  debateJudgeGuidedStepKind,
  debateJudgeObjectionRulingShortcut,
  debateJudgeQuickChoices,
  type DebateJudgeGuidedStepKind,
  type DebateJudgeQuickChoice,
} from "./debateJudgeQuickChoices";
import { randomDebateTerritory } from "./debateTerritoryRandomizer";
import {
  DEBATE_PROCEEDINGS_STENOGRAPHER_DELAY_MS,
  debateActiveDurationLabel,
  debateEventSpokenLineDurationMs,
  debateGavelAudioEnabled,
  debateInitialProceedingsCursor,
  debateAdoptProceedingsCursor,
  debateInterruptedSpeechCaption,
  debateWatchElapsedMs,
  debateMarkdownSource,
  debateEvidenceFromMarkdownHref,
  debateGalleryReactingIndices,
  debateGalleryReaction,
  debateRevealDurationMs,
  debateTranscriptIsAtLive,
  debateTurnClockState,
  debateTurnOwnerBotId,
  debateUtterancePaceBoost,
  debateVisibleContentAtProgress,
  debateVisibleContentAtSpeechTime,
  formatDebateElapsedDuration,
  formatDebateSpokenDuration,
  readDebateWatchElapsedMs,
  writeDebateProceedingsCursor,
  writeDebateWatchElapsedMs,
} from "./debatePresentation";
import {
  DEBATE_INTRO_WIDE_HOLD_MS,
  DEBATE_MODERATOR_BREATH_WIDE_MS,
  debateEventIsModeratorMonologue,
  resolveDebateModeratorCameraView,
  type DebateModeratorCameraFocus,
  type DebateModeratorCameraView,
} from "./debateIntroCamera";
import { debateVoiceCompletionFallbackDurationMs } from "./signalLiveCaptions";
import {
  debateEventPrimaryTableEvidenceId,
  resolveDebateTableEvidenceStickyId,
  debateTableEvidenceItem,
} from "./debateTableEvidence";
import {
  DEBATE_SPEAKER_HANDOFF_TIMING,
  debatePreviousStageSpeakerEvent,
  debateSpeakerHandoffPlan,
  type DebateSpeakerHandoffPhase,
} from "./debateSpeakerHandoff";
import {
  DEBATE_INTERRUPT_CAMERA_HOLD_MS,
  DEBATE_INTERRUPT_OVERLAP_PROGRESS,
  DEBATE_INTERRUPT_PRIMARY_RELEASE_MS,
  DEBATE_INTERRUPT_TRAIL_OFF_LEAD_MS,
  debateInterruptCutCaption,
  debateInterruptOverlapPair,
  debateInterruptShouldFire,
  debateInterruptTrailOffLine,
} from "./debateInterruptOverlap";
import {
  DEBATE_STAGE_ALIGNMENT_MAX,
  DEBATE_STAGE_ALIGNMENT_MIN,
  DEBATE_STAGE_ALIGNMENT_ITEMS,
  DEBATE_STAGE_ALIGNMENT_ROLES,
  DEBATE_STAGE_ALIGNMENT_STEP,
  DEBATE_STAGE_GAVEL_POSITION_MAX,
  DEBATE_STAGE_GAVEL_POSITION_MIN,
  DEBATE_STAGE_GAVEL_POSITION_STEP,
  DEBATE_STAGE_GAVEL_ROTATION_MAX,
  DEBATE_STAGE_GAVEL_ROTATION_MIN,
  DEBATE_STAGE_GAVEL_ROTATION_STEP,
  DEBATE_STAGE_GAVEL_SIZE_MAX,
  DEBATE_STAGE_GAVEL_SIZE_MIN,
  DEBATE_STAGE_GAVEL_SIZE_STEP,
  DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
  DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
  DEBATE_STAGE_EVIDENCE_TABLE_POSITION_STEP,
  DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MAX,
  DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
  DEBATE_STAGE_EVIDENCE_TABLE_SIZE_STEP,
  DEBATE_STAGE_LIGHT_BLEND_MODES,
  DEBATE_STAGE_LIGHT_MASK_OPACITY_MAX,
  DEBATE_STAGE_LIGHT_MASK_OPACITY_MIN,
  DEBATE_STAGE_LIGHT_MASK_OPACITY_STEP,
  DEFAULT_DEBATE_STAGE_ALIGNMENT,
  copyDebateStageAlignment,
  debateStageEvidenceViewForCamera,
  debateStageAlignmentOffset,
  debateStageAlignmentStyle,
  debateStageAlignmentTarget,
  formatDebateStageAlignmentClipboard,
  formatDebateStageEvidenceTableClipboard,
  formatDebateStageGavelClipboard,
  normalizeDebateStageAlignment,
  readDebateStageAlignment,
  updateDebateStageAlignmentOffset,
  updateDebateStageEvidenceTable,
  updateDebateStageGavelPose,
  updateDebateStageLightBlendMode,
  updateDebateStageLightMaskOpacity,
  writeDebateStageAlignment,
  type DebateStageAlignmentItem,
  type DebateStageAlignmentRole,
  type DebateStageAlignmentTarget,
  type DebateStageAlignmentV6,
  type DebateStageEvidenceKind,
  type DebateStageEvidenceView,
  type DebateStageLightBlendMode,
  type DebateStageOffsetV1,
} from "./debateStageAlignment";
import {
  DEFAULT_DEBATE_LIVE_CAPTIONS_ENABLED,
  readDebateLiveCaptionsEnabled,
  writeDebateLiveCaptionsEnabled,
} from "./debateLiveCaptionsPreference";
import { prismBranchIsDev } from "./prismDevGating";
import {
  BotPickerGrid,
  BotPickerTile,
  BotPickerToolbar,
  filterBotPickerItems,
  type BotPickerGroup,
  type BotPickerGlyphRenderer,
} from "./BotPicker";
import { useAmbientBotVocalization } from "./ambient-bot-vocalization";
import { SessionAtmosphereLayer } from "./SessionAtmosphereLayer";
import {
  sessionAmbientBotVocalizationCueForKind,
  type SessionAmbientBotVocalizationCue,
  type SessionAmbientFoleyProfile,
  type SessionAtmosphereController,
  type SessionAtmosphereMix,
} from "./session-atmosphere-audio";
import {
  DEBATE_AUDIENCE_AGITATION_URL,
  DEBATE_AUDIENCE_CROSSTALK_URL,
  DEBATE_AUDIENCE_FOLEY_URLS,
  DEBATE_AUDIENCE_MURMUR_URL,
  DEBATE_AUDIENCE_REACTIONS,
  DEBATE_GAVEL_FOLEY_TRIM,
  DEBATE_GAVEL_FOLEY_URLS,
  DEBATE_GAVEL_ORDER_CAMERA_CUT_MS,
  debateAudienceBeatForEvent,
  debateDirectedAudiencePlayback,
  debateModeratorGavelCue,
  debateModeratorGavelSpeechLeadMs,
  debateVocalFoleyTargetId,
  debateAmbientVocalFoleyVoicePerformance,
  debateVocalFoleyVoicePerformance,
  resolveDebateVocalFoleyTagText,
  type DebateAudienceBeat,
  type DebateAudienceBeatKind,
  type DebateModeratorGavelCue,
} from "./debateFoley";
import { sentenceCaseActionText } from "./zenActions";
import {
  debateExhibitImpactForExhibit,
  playDebateExhibitImpactSfx,
  resolveDebateExhibitImpactMaterial,
} from "./debateExhibitImpactSfx";
import { debateModeratorLookAtRole } from "./debateModeratorGaze";
import { debateEvidencePropRotationDeg } from "./debateEvidenceProp";
import {
  DEBATE_IDENT_AUDIO,
  DEBATE_IDENT_OUTRO_LEAD_MS,
  playDebateIdentAudio,
  setDebateIdentAudioVolume,
  stopDebateIdentAudio,
  type DebateIdentKind,
} from "./debateIdentAudio";
import {
  DEBATE_JUDGE_GAVEL_CUE_WINDOW_MS,
  DEBATE_JUDGE_GAVEL_MISSED_BEAT_MS,
  DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS,
  debateJudgeGavelCooldownBlocks,
  debateJudgeGavelSpaceAction,
} from "./debateJudgeGavel";
import {
  DEBATE_FORUM_FOLEY_ROOM_SEND,
  DEBATE_TURNABOUT_FOLEY_ROOM_SEND,
} from "./roomAcoustics";
import { magentaTintedRasterUrl } from "./magentaKeyRaster";
import type { VoicePlaybackCharacterAlignment } from "./voiceEffects";
import type { ZenLiveBotMouthShape } from "./zenLiveMouth";
import { DEBATE_STAGE_SOUNDCHECK_MESSAGE_PREFIX } from "./signalStageSoundcheck";
import { useDebateDomPerformance } from "./useDebateDomPerformance";
import {
  createDebatePresentationStore,
  type DebatePresentationSnapshot,
  type DebatePresentationStore,
} from "./debatePresentationStore";
import { DebateDeadlineCountdown } from "./DebateDeadlineCountdown";
import {
  DEBATE_AUTO_ADVANCE_DELAY_MS,
  debateAudienceAllowsAttentiveFoley,
  debateAudienceAllowsFaceOpen,
  debateAudienceAllowsTransformBounce,
  debateAudienceMaxReactingSeats,
  debateClientPerfNowMs,
  logDebateAudiencePerfSnapshot,
  logDebateClientPerf,
} from "./debatePerfTiming";
import { reuseDebateSessionEventPrefix } from "./debateSessionAdopt";
import { usePrismPresentationSuspended } from "./prismPresentationSuspend";
import type { PrismSceneQuality } from "./prismSceneRuntime";

export interface DebateBotSummary {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  avatarDetails?: DebateBotSnapshotV1["avatarDetails"];
  voiceProfile?: DebateBotSnapshotV1["voiceProfile"];
  powers?: DebateBotSnapshotV1["powers"];
  systemPrompt?: string;
  hardMuted: boolean;
}

export interface DebateUtterance {
  event: DebateEventV1;
  /** Stable presentation-only key used to reuse a prepared voice clip. */
  voiceCacheKey?: string;
  format: DebateFormatId;
  sessionId: string;
  speaker: DebateBotSummary | null;
  player: boolean;
  playerVoice: boolean;
  spokenText: string;
  voicePerformanceText?: string | null;
  voiceSourceBotId: string | null;
  /** Independent channel so an Objection can overlap a cut-off advocate. */
  voiceChannel?: "primary" | "crosstalk";
  lifecycle?: {
    onStart?: (
      durationMs: number | null,
      alignment?: VoicePlaybackCharacterAlignment | null,
    ) => void;
    onProgress?: (elapsedMs: number, durationMs: number) => void;
    onEnd?: () => void;
    onCancel?: () => void;
  };
}

export interface DebateSpeechTiming {
  text: string;
  elapsedMs: number;
  durationMs: number;
  alignment: VoicePlaybackCharacterAlignment | null;
}

export interface DebateBotAvatarState {
  role: DebateForumRole | "audience";
  lookAtRole: DebateForumRole | null;
  compact: boolean;
  talking: boolean;
  thinking: boolean;
  colorCycle: boolean;
  speechTiming: DebateSpeechTiming | null;
  foleyMouthShape: ZenLiveBotMouthShape | null;
  listenerReaction:
    "attentive" | "divided" | "evidence" | "question" | "concession" | null;
}

export interface DebateExperienceProps {
  bots: DebateBotSummary[];
  botGroups?: readonly BotPickerGroup[];
  initialBotIds?: string[];
  playerName: string;
  storageScopeId: string;
  preferredProvider: "local" | "openai" | "anthropic";
  preferredImageProvider: "local" | "openai";
  responseMode: ResponseMode;
  modelOverride?: {
    provider: "local" | "openai" | "anthropic";
    model: string;
  } | null;
  graphicsQuality: GraphicsQuality;
  theme: "light" | "dark";
  audioEnabled: boolean;
  audioVolume: number;
  objectionRulingTimeoutMs?: number;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  renderBotGlyph: BotPickerGlyphRenderer;
  renderBotAvatar?: (
    bot: DebateBotSnapshotV1,
    state: DebateBotAvatarState,
  ) => ReactNode;
  onExit: () => void;
  onResetTutorial?: () => void;
  onPrepareUtterance?: (utterance: DebateUtterance) => Promise<void>;
  onResponseCueGeneration?: (args: {
    botId: string;
    trigger: "interruption" | "redirect" | null;
    sessionId: string;
  }) => () => Promise<void>;
  onPrewarmResponseCue?: (botId: string) => void;
  onPrefetchPreparedUtterance?: (args: {
    utterance: PreparedTurnUtteranceV1;
    session: DebateSessionV1;
  }) => void;
  presenceBeat?: BotPresenceBeatV1 | null;
  presenceBeats?: readonly BotPresenceBeatV1[];
  onUtterance?: (utterance: DebateUtterance) => Promise<boolean>;
  onStopUtterance?: () => void;
  /** Soft-cut the primary Debate voice without killing an overlapping shout. */
  onReleaseUtterance?: (fadeMs?: number) => void;
  onLiveSessionActiveChange?: (active: boolean) => void;
  onCompanionContextChange?: (context: DebateCompanionContext | null) => void;
  renderJudgeComposer?: (composer: DebateJudgeComposerRenderProps) => ReactNode;
  onJudgeComposerReveal?: () => void;
  /**
   * Compact pick-aware composer for Motion Chamber seed fields
   * (Prompt Center prompts + wildcard decks).
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
  /** Finalize /prompts, !decks, and {slots}/{a|b} before consumption. */
  expandComposerDraft?: (rawDraft: string) => string | Promise<string>;
}

export interface DebateCompanionContext {
  draft: PrismCompanionDebateDraft;
  botIds: string[];
}

export interface DebateJudgeComposerRenderProps {
  kind: "gavel" | "question";
  value: string;
  placeholder: string;
  maxLength: number;
  disabled: boolean;
  generating: boolean;
  onValueChange: (value: string) => void;
  onGenerate: () => void;
  onSubmit: (value?: string) => void;
  onBack: () => void;
}

type DebateView = "dashboard" | "live" | "baking";
type DebateStudioPanel = "motion" | "cast" | "evidence" | "archive";
const DEBATE_ROWDINESS_SPECTRUM = [...DEBATE_FORMALITY_SPECTRUM].reverse();
type DebateCastSlot = "moderator" | "forAdvocate" | "againstAdvocate";
type DebateCameraView = "wide" | "left" | "moderator" | "right" | "jury";
type DebateCameraMode = "auto" | DebateCameraView;
type DebateClipboardState = "idle" | "copying" | "copied" | "failed";
type DebateStageGavelPose = "lowered" | "raised";
type DebateStageSoundCheckState = {
  role: DebateStageAlignmentRole;
  status: "playing" | "unavailable";
  speechTiming: DebateSpeechTiming | null;
} | null;
type DebateLiveReveal = {
  eventId: string;
  visibleContent: string;
  speechTiming?: DebateSpeechTiming | null;
};
type DebateJudgeGavelCeremony = {
  eventId: string;
  kind: DebateModeratorGavelCue["kind"];
  status: "ready" | "missed";
};
type DebateJudgeGavelCeremonyGate = {
  cue: DebateModeratorGavelCue;
  ready: boolean;
  cueTimer: number | null;
  cameraTimer: number | null;
  settleTimer: number | null;
  resolve: (struck: boolean) => void;
};
type DebateAudienceOrderResponse = {
  id: number;
  kind: "awkward" | "hush";
  resetAfterSequence: number;
  returningRoomTone: boolean;
  sessionId: string;
};

function debateJuryBallotVoiceCacheKey(
  sessionId: string,
  jurorBotId: string,
): string {
  return `debate-jury-ballot:${sessionId}:${jurorBotId}`;
}
type DebateObjectionRulingDecision = {
  key: string;
  deadlineMs: number;
};
type DebateDeleteUndo = {
  runId: string;
  sessionId: string;
  motion: string;
};
type DebateStageAlignmentDrag = {
  pointerId: number;
  role: DebateStageAlignmentRole;
  item: DebateStageAlignmentItem;
  target: DebateStageAlignmentTarget;
  startClientX: number;
  startClientY: number;
  stageWidth: number;
  stageHeight: number;
  startAlignment: DebateStageAlignmentV6;
};

const DEBATE_PLAYER_JUDGE_PRISM: DebateBotSummary = {
  id: DEBATE_PLAYER_JUDGE_BOT_ID,
  name: "You",
  color: "#2fd3e3",
  glyph: "triangle",
  avatarDetails: null,
  voiceProfile: null,
  powers: [],
  systemPrompt:
    "Prism is the player-controlled Judge proxy and remains publicly silent until the human Judge acts.",
  hardMuted: false,
};

const DEBATE_PLAYER_PARTICIPANT_PRISM: DebateBotSummary = {
  id: DEBATE_PLAYER_PARTICIPANT_BOT_ID,
  name: "You",
  color: "#2fd3e3",
  glyph: "triangle",
  avatarDetails: null,
  voiceProfile: null,
  powers: [],
  systemPrompt:
    "PRISM is the human-controlled Participant and replaces the selected-side advocate.",
  hardMuted: false,
};

const DEBATE_STAGE_ALIGNMENT_ENABLED = prismBranchIsDev(
  process.env.NEXT_PUBLIC_PRISM_BRANCH,
);

const DEBATE_GALLERY_COLORS = [
  "#ff5f8f",
  "#ff9f5f",
  "#f1d65b",
  "#76df89",
  "#42d9ff",
  "#7e8cff",
  "#c277ff",
] as const;
const DEBATE_AUDIENCE_MOUTH_SHAPES = [
  "narrow",
  "open-small",
  "open-round",
  "speech-closed",
] as const satisfies readonly ZenLiveBotMouthShape[];

interface DebateAudiencePortraitProps {
  bot: DebateBotSnapshotV1;
  index: number;
  rowIndex: number;
  rowCount: number;
  ambientTalking: boolean;
  listenerReaction: DebateBotAvatarState["listenerReaction"];
  beatKind: DebateAudienceBeatKind | null;
  allowFaceOpen: boolean;
  allowTransformBounce: boolean;
  departureXPercent: number;
  renderBotGlyph: BotPickerGlyphRenderer;
  renderBotAvatar?: DebateExperienceProps["renderBotAvatar"];
}

const DebateAudiencePortrait = memo(function DebateAudiencePortrait({
  bot,
  index,
  rowIndex,
  rowCount,
  ambientTalking,
  listenerReaction,
  beatKind,
  allowFaceOpen,
  allowTransformBounce,
  departureXPercent,
  renderBotGlyph,
  renderBotAvatar,
}: DebateAudiencePortraitProps): React.JSX.Element {
  const conversationFacing = debateAudienceConversationFacing(
    rowIndex,
    rowCount,
  );
  const liveVocalReaction =
    allowFaceOpen &&
    listenerReaction !== null &&
    (beatKind === "objection" ||
      beatKind === "concession" ||
      beatKind === "ruling");
  const foleyMouthShape = liveVocalReaction
    ? DEBATE_AUDIENCE_MOUTH_SHAPES[index % DEBATE_AUDIENCE_MOUTH_SHAPES.length]!
    : null;
  return (
    <span
      className={styles.debateAudienceBotPortrait}
      data-talking={ambientTalking || liveVocalReaction ? "true" : undefined}
      data-vocal-reaction={liveVocalReaction ? "true" : undefined}
      data-live-reacting={listenerReaction ? "true" : undefined}
      data-audience-bounce={
        listenerReaction && allowTransformBounce ? "true" : undefined
      }
      data-audience-beat={
        listenerReaction ? (beatKind ?? undefined) : undefined
      }
      data-listening-reaction={listenerReaction ?? undefined}
      data-conversation-facing={conversationFacing}
      data-audience-source={
        debateAudienceBotIsPlayerSpectator(bot)
          ? "player"
          : debateAudienceBotIsGenerated(bot)
            ? "generated"
            : "library"
      }
      style={
        {
          "--debate-audience-index": index,
          "--debate-gallery-exit-x": `${departureXPercent}%`,
        } as CSSProperties
      }
      title={
        debateAudienceBotIsPlayerSpectator(bot)
          ? `${bot.name} · Gallery`
          : debateAudienceBotIsGenerated(bot)
            ? "Session spectator"
            : `${bot.name} · Library spectator`
      }
    >
      {renderBotAvatar ? (
        renderBotAvatar(bot, {
          role: "audience",
          lookAtRole: null,
          compact: true,
          // Keep the authored audience portrait static during ambient chatter.
          // Only the short semantic reaction opens the face when quality allows.
          talking: liveVocalReaction,
          thinking: false,
          colorCycle: false,
          speechTiming: null,
          foleyMouthShape,
          listenerReaction,
        })
      ) : (
        <span className={styles.botGlyphFallback}>
          {renderBotGlyph(bot.glyph ?? "lucideTriangle", {
            size: 34,
            strokeWidth: 1.25,
          })}
        </span>
      )}
      {ambientTalking ? (
        <span className={styles.debateAudienceChatterChip} aria-hidden="true">
          ...
        </span>
      ) : null}
    </span>
  );
});

function debateAudienceBeatMatches(
  left: DebateAudienceBeat | null,
  right: DebateAudienceBeat | null,
): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.kind === right.kind &&
      left.listenerReaction === right.listenerReaction &&
      left.foleyCue === right.foleyCue &&
      left.seatIndices.length === right.seatIndices.length &&
      left.seatIndices.every(
        (seatIndex, index) => seatIndex === right.seatIndices[index],
      ))
  );
}

/**
 * React's built-in external-store hook wakes every subscriber for every store
 * write. Debate speech writes at mouth-sync cadence, while the gallery only
 * changes at semantic reaction boundaries. Keep the selected snapshot stable
 * so 15 completed spectator portraits are not repainted for every character.
 */
function useDebatePresentationSelection<T>(
  store: DebatePresentationStore,
  select: (snapshot: DebatePresentationSnapshot) => T,
  matches: (left: T, right: T) => boolean,
): T {
  const selectedRef = useRef<T>(select(store.getSnapshot()));
  const getSelectedSnapshot = useCallback((): T => {
    const next = select(store.getSnapshot());
    if (!matches(selectedRef.current, next)) {
      selectedRef.current = next;
    }
    return selectedRef.current;
  }, [matches, select, store]);
  const subscribeSelected = useCallback(
    (notify: () => void): (() => void) =>
      store.subscribe(() => {
        const previous = selectedRef.current;
        const next = select(store.getSnapshot());
        if (!matches(previous, next)) {
          selectedRef.current = next;
          notify();
        }
      }),
    [matches, select, store],
  );
  return useSyncExternalStore(
    subscribeSelected,
    getSelectedSnapshot,
    getSelectedSnapshot,
  );
}

/** Gallery seats that follow the presentation store — not parent speech ticks. */
const DebateLiveAudienceGallery = memo(
  function DebateLiveAudienceGallery(props: {
    store: DebatePresentationStore;
    sessionId: string;
    activeEvent: DebateEventV1 | null;
    presenting: boolean;
    audienceSeats: ReadonlyArray<{
      bot: DebateBotSnapshotV1;
      index: number;
      layout: ReturnType<typeof debateAudienceSeatLayout>;
    }>;
    materialQuality: PrismSceneQuality;
    audienceChattering: boolean;
    audiencePressureBand: DebateAudiencePressureBand | null;
    audiencePressureTalkerIndices: ReadonlySet<number>;
    audiencePressureAttr: DebateAudiencePressureBand | null;
    audiencePressureScore: number;
    activeAudienceOrderKind: "awkward" | "hush" | undefined;
    judgeControl: {
      action: "call-time" | "cue" | "intervene" | "order";
      available: boolean;
      ariaLabel: string;
      busy: boolean;
      label: string;
      onActivate: () => void;
      title: string;
    } | null;
    renderBotAvatar?: DebateExperienceProps["renderBotAvatar"];
    renderBotGlyph: BotPickerGlyphRenderer;
  }): React.JSX.Element {
    const selectAudienceBeat = useCallback(
      (snapshot: DebatePresentationSnapshot): DebateAudienceBeat | null => {
        const publicContent =
          props.presenting &&
          props.activeEvent &&
          snapshot.sessionId === props.sessionId &&
          snapshot.eventId === props.activeEvent.id
            ? snapshot.visibleContent
            : props.presenting
              ? (props.activeEvent?.content ?? "")
              : "";
        return props.presenting && props.activeEvent
          ? debateAudienceBeatForEvent({
              event: props.activeEvent,
              publicContent,
              seatCount: props.audienceSeats.length,
              maxReactingSeats: debateAudienceMaxReactingSeats(
                props.materialQuality,
                "contention",
              ),
            })
          : null;
      },
      [
        props.activeEvent,
        props.audienceSeats.length,
        props.materialQuality,
        props.presenting,
        props.sessionId,
      ],
    );
    const audienceBeat = useDebatePresentationSelection(
      props.store,
      selectAudienceBeat,
      debateAudienceBeatMatches,
    );
    const reacting = new Set(audienceBeat?.seatIndices ?? []);
    const allowFaceOpen = debateAudienceAllowsFaceOpen(props.materialQuality);
    const allowTransformBounce = debateAudienceAllowsTransformBounce(
      props.materialQuality,
    );
    const pressureBand = props.audiencePressureAttr;
    const pressureRank = pressureBand
      ? (["settled", "murmuring", "restless", "disruptive"] as const).indexOf(
          pressureBand,
        )
      : -1;
    const pressureLabel = pressureBand
      ? pressureBand[0]!.toUpperCase() + pressureBand.slice(1)
      : "Observing";
    const orderResponseLabel =
      props.activeAudienceOrderKind === "hush"
        ? "Gallery settling"
        : props.activeAudienceOrderKind === "awkward"
          ? "Gallery caught off guard"
          : null;
    const gavelEnergized =
      pressureBand === "restless" || pressureBand === "disruptive";

    return (
      <div
        className={styles.debateAudienceRow}
        data-debate-audience="true"
        data-audience-placement="below-screen"
        data-audience-chattering={props.audienceChattering ? "true" : "false"}
        data-audience-pressure={props.audiencePressureAttr ?? undefined}
        data-audience-order-response={props.activeAudienceOrderKind}
        data-audience-count={props.audienceSeats.length}
        aria-label={`${props.audienceSeats.length} spectators in the Debate audience`}
      >
        <div className={styles.debateAudienceStatus}>
          <div
            className={styles.debateAudienceIdentity}
            aria-live="polite"
            aria-atomic="true"
          >
            <span>Public gallery</span>
            <strong>{orderResponseLabel ?? pressureLabel}</strong>
          </div>
          <span
            className={styles.debateAudienceMeter}
            role="meter"
            aria-label="Audience rowdiness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(props.audiencePressureScore)}
            aria-valuetext={pressureLabel}
          >
            {[0, 1, 2, 3].map((level) => (
              <i
                key={level}
                data-active={level <= pressureRank ? "true" : undefined}
                aria-hidden="true"
              />
            ))}
          </span>
          {props.judgeControl?.available ? (
            <button
              type="button"
              className={styles.debateAudienceGavelButton}
              data-action={props.judgeControl.action}
              data-cue={
                props.judgeControl.action === "cue" ? "true" : undefined
              }
              data-energized={
                gavelEnergized ||
                props.judgeControl.action === "intervene" ||
                props.judgeControl.action === "call-time"
                  ? "true"
                  : undefined
              }
              data-overtime={
                props.judgeControl.action === "call-time" ? "true" : undefined
              }
              data-tutorial-target="debate-judge-gavel"
              disabled={props.judgeControl.busy}
              aria-label={props.judgeControl.ariaLabel}
              onClick={(event) => {
                event.currentTarget.blur();
                props.judgeControl?.onActivate();
              }}
              title={props.judgeControl.title}
            >
              {props.judgeControl.label}
              <kbd aria-hidden="true">Space</kbd>
            </button>
          ) : null}
        </div>
        {(["rear", "front"] as const).map((depthRow) => (
          <span
            className={styles.debateAudienceLayer}
            data-depth-row={depthRow}
            key={depthRow}
            aria-hidden="true"
          >
            {props.audienceSeats
              .filter((seat) => seat.layout.depthRow === depthRow)
              .map(({ bot: audienceBot, index, layout }) => {
                const audienceListenerReaction =
                  audienceBeat && reacting.has(index)
                    ? audienceBeat.listenerReaction
                    : null;
                const ambientTalking =
                  !debateAudienceBotIsPlayerSpectator(audienceBot) &&
                  props.audienceChattering &&
                  (props.audiencePressureBand
                    ? props.audiencePressureTalkerIndices.has(index)
                    : debateAudienceSeatIsTalker(
                        layout.rowIndex,
                        layout.rowCount,
                      ));
                return (
                  <DebateAudiencePortrait
                    key={audienceBot.id}
                    bot={audienceBot}
                    index={index}
                    rowIndex={layout.rowIndex}
                    rowCount={layout.rowCount}
                    ambientTalking={ambientTalking}
                    listenerReaction={audienceListenerReaction}
                    beatKind={audienceBeat?.kind ?? null}
                    allowFaceOpen={allowFaceOpen}
                    allowTransformBounce={allowTransformBounce}
                    departureXPercent={debateAudienceDepartureXPercent(
                      `${props.sessionId}:${audienceBot.id}:gallery-departure`,
                    )}
                    renderBotAvatar={props.renderBotAvatar}
                    renderBotGlyph={props.renderBotGlyph}
                  />
                );
              })}
          </span>
        ))}
      </div>
    );
  },
);

const DEBATE_LIVE_SPEECH_RENDER_INTERVAL_MS = 50;
const DEBATE_FOLEY_MIX = {
  background: 0,
  grain: 0,
  foley: 0.34,
} as const satisfies SessionAtmosphereMix;
const DEBATE_AUDIENCE_IDLE_MIX = {
  ...DEBATE_FOLEY_MIX,
  background: 0.42,
} as const satisfies SessionAtmosphereMix;
const DEBATE_AUDIENCE_DUCKED_MIX = {
  ...DEBATE_FOLEY_MIX,
  background: 0.1,
} as const satisfies SessionAtmosphereMix;
const DEBATE_JURY_CHAMBER_MIX = {
  background: 0.12,
  grain: 0,
  foley: 0.09,
} as const satisfies SessionAtmosphereMix;
const DEBATE_AMBIENT_FOLEY_PROFILE = {
  minDelayMs: 14_000,
  maxDelayMs: 32_000,
  trim: 0.72,
} as const satisfies SessionAmbientFoleyProfile;
const DEBATE_JURY_AMBIENT_FOLEY_PROFILE = {
  minDelayMs: 22_000,
  maxDelayMs: 48_000,
  trim: 0.24,
} as const satisfies SessionAmbientFoleyProfile;
const DEBATE_VOCAL_FOLEY_PROFILE = {
  minDelayMs: 22_000,
  maxDelayMs: 46_000,
  trim: 0.68,
} as const satisfies SessionAmbientFoleyProfile;

const DEBATE_CAMERA_VIEWS: ReadonlyArray<{
  id: DebateCameraMode;
  label: string;
}> = [
  { id: "auto", label: "Auto" },
  { id: "left", label: "Left" },
  { id: "moderator", label: "Moderator" },
  { id: "right", label: "Right" },
  { id: "wide", label: "Wide" },
  { id: "jury", label: "Jury" },
];

function debateAutoCameraView(
  activeRole: DebateForumRole | null,
): DebateCameraView {
  if (activeRole === "for") return "left";
  if (activeRole === "moderator") return "moderator";
  if (activeRole === "against") return "right";
  return "wide";
}

function debateParticipantFloorRole(
  session: DebateSessionV1,
  event: DebateEventV1 | null,
): DebateForumRole | null {
  if (session.playerRole !== "participant" || event?.speakerKind !== "player") {
    return null;
  }
  const sideId = event.sideId ?? session.playerSideId;
  return sideId === "for" || sideId === "against" ? sideId : null;
}

function debateParticipantPrismAvatar(
  session: DebateSessionV1,
  playerName: string,
): DebateBotSnapshotV1 {
  const sideId = session.playerSideId === "against" ? "against" : "for";
  return {
    version: DEBATE_SCHEMA_VERSION,
    // The page renderer recognizes the Judge proxy as PRISM's canonical
    // appearance. The stage identity remains the Participant proxy snapshot.
    id: DEBATE_PLAYER_JUDGE_BOT_ID,
    name: playerName,
    systemPrompt:
      "PRISM is the player-controlled visual proxy for the human Participant in this Debate.",
    role: "advocate",
    sideId,
    color: "#2fd3e3",
    glyph: "triangle",
    avatarDetails: null,
    voiceProfile: null,
    powers: [],
    provider: session.provider,
    model: session.model,
    revision: `${session.id}:participant-prism-v1`,
  };
}

function debateParticipantModeratorTitle(title: string): string {
  const normalized = normalizeDebateModeratorTitle(title);
  return /\bjudge\b/iu.test(normalized) ? normalized : `${normalized} · Judge`;
}

type DebateCameraTransition = "cut" | "move" | "objection-pan" | "handoff";

type DebateSpeakerHandoffState = {
  eventId: string;
  phase: DebateSpeakerHandoffPhase;
};

function debateCameraTransition(
  cameraMode: DebateCameraMode,
  event: DebateEventV1 | null,
): DebateCameraTransition {
  // Interruptions always animate the pan — never an instant Auto cut.
  if (event?.kind === "objection" || event?.kind === "interjection") {
    return "objection-pan";
  }
  if (cameraMode !== "auto") return "move";
  return "cut";
}

const DEBATE_STAGE_ALIGNMENT_LABELS: Record<DebateStageAlignmentRole, string> =
  {
    for: "For advocate",
    moderator: "Moderator",
    against: "Against advocate",
  };
const DEBATE_STAGE_ALIGNMENT_ITEM_LABELS: Record<
  DebateStageAlignmentItem,
  string
> = {
  bot: "Bot",
  nameplate: "Nameplate",
  glyph: "Glyph plate",
};
const DEBATE_GAVEL_FOLEY_PRELOAD_URLS = Object.values(DEBATE_GAVEL_FOLEY_URLS);
const DEBATE_LIVE_FOLEY_PRELOAD_URLS = [
  ...DEBATE_GAVEL_FOLEY_PRELOAD_URLS,
  ...DEBATE_AUDIENCE_FOLEY_URLS,
  DEBATE_AUDIENCE_AGITATION_URL,
  ...Object.values(DEBATE_AUDIENCE_REACTIONS).map((reaction) => reaction.url),
  "/audio/session-atmosphere/throat-clear.mp3",
  "/audio/voice-presence/breath-deliberate-02-v2.mp3",
];

function DebateForumLightMasks(props: {
  depth: "backdrop" | "foreground";
}): React.JSX.Element {
  const foregroundClass =
    props.depth === "foreground" ? ` ${styles.lightMaskForeground}` : "";
  return (
    <>
      <div
        className={`${styles.lightMaskFor}${foregroundClass}`}
        data-light-depth={props.depth}
        aria-hidden="true"
      />
      <div
        className={`${styles.lightMaskAgainst}${foregroundClass}`}
        data-light-depth={props.depth}
        aria-hidden="true"
      />
      <div
        className={`${styles.lightMaskModerator}${foregroundClass}`}
        data-light-depth={props.depth}
        aria-hidden="true"
      />
    </>
  );
}

function DebateFocusDepthOverlays(props: {
  cameraTransition: DebateCameraTransition;
  cameraView: DebateCameraView;
}): React.JSX.Element {
  return (
    <>
      <div
        className={styles.debaterFocusDepthOverlay}
        data-blur-side="right"
        data-camera-transition={props.cameraTransition}
        data-visible={props.cameraView === "left" ? "true" : "false"}
        aria-hidden="true"
      />
      <div
        className={styles.debaterFocusDepthOverlay}
        data-blur-side="left"
        data-camera-transition={props.cameraTransition}
        data-visible={props.cameraView === "right" ? "true" : "false"}
        aria-hidden="true"
      />
    </>
  );
}

function DebateLiveCaption(props: {
  eventId: string;
  speakerKind: DebateEventV1["speakerKind"];
  speakerName: string;
  text: string;
}): React.JSX.Element {
  const caption = useMemo(
    () => debateLiveCaptionPage(props.text),
    [props.text],
  );

  return (
    <div
      className={styles.liveCaption}
      data-debate-live-caption="true"
      data-event-id={props.eventId}
      data-speaker-kind={props.speakerKind}
      data-caption-page={caption.pageIndex + 1}
      data-caption-pages={caption.pageCount}
      aria-live="off"
      aria-label={`Live caption from ${props.speakerName}`}
    >
      <i aria-hidden="true" />
      <div>
        <strong>{props.speakerName}</strong>
        <span
          key={`${props.eventId}:${caption.pageIndex}`}
          data-caption-rows="adaptive"
        >
          {caption.text}
        </span>
      </div>
    </div>
  );
}

function DebateTurnClock(props: {
  event: DebateEventV1;
  speechTiming: DebateSpeechTiming | null;
}): React.JSX.Element | null {
  const clock = debateTurnClockState(props.event, props.speechTiming);
  if (!clock) return null;
  const displayedSeconds =
    clock.status === "overtime"
      ? Math.max(1, Math.ceil(Math.abs(clock.remainingMs) / 1_000))
      : Math.max(0, Math.ceil(clock.remainingMs / 1_000));

  return (
    <div
      className={styles.turnClock}
      data-status={clock.status}
      role="timer"
      aria-live="off"
      aria-label={
        clock.status === "overtime"
          ? `${displayedSeconds} seconds overtime`
          : `${displayedSeconds} seconds floor time remaining`
      }
    >
      <span>{clock.status === "overtime" ? "Overtime" : "Floor time"}</span>
      <strong>
        {clock.status === "overtime" ? "+" : "0:"}
        {String(displayedSeconds).padStart(2, "0")}
      </strong>
      <i aria-hidden="true">
        <b
          style={
            {
              "--debate-turn-clock-progress": `${clock.progress}`,
            } as CSSProperties
          }
        />
      </i>
    </div>
  );
}

function DebateElapsedTimer(props: {
  accumulatedMs: number;
  runningSinceMs: number | null;
  status: DebateSessionV1["status"];
}): React.JSX.Element {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const running = props.runningSinceMs !== null;

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [running, props.runningSinceMs]);

  const elapsedLabel = formatDebateElapsedDuration(
    debateWatchElapsedMs({
      accumulatedMs: props.accumulatedMs,
      runningSinceMs: props.runningSinceMs,
      nowMs,
    }),
  );
  return (
    <div
      className={styles.debateElapsedTimer}
      data-status={props.status}
      data-running={running ? "true" : "false"}
      role="timer"
      aria-live="off"
      aria-label={`Debate elapsed time ${elapsedLabel}`}
    >
      <span>Debate time</span>
      <strong>{elapsedLabel}</strong>
    </div>
  );
}

const DebateLiveCaptionConsumer = memo(
  function DebateLiveCaptionConsumer(props: {
    store: DebatePresentationStore;
    sessionId: string;
    event: DebateEventV1;
    speakerName: string;
  }): React.JSX.Element | null {
    const snapshot = useSyncExternalStore(
      props.store.subscribe,
      props.store.getSnapshot,
      props.store.getSnapshot,
    );
    if (
      snapshot.sessionId !== props.sessionId ||
      snapshot.eventId !== props.event.id
    ) {
      return null;
    }
    const text = debateSpokenText(snapshot.visibleContent).trim();
    if (!text) return null;
    return (
      <DebateLiveCaption
        eventId={props.event.id}
        speakerKind={props.event.speakerKind}
        speakerName={props.speakerName}
        text={text}
      />
    );
  },
);

const DebateTurnClockConsumer = memo(function DebateTurnClockConsumer(props: {
  store: DebatePresentationStore;
  sessionId: string;
  event: DebateEventV1;
}): React.JSX.Element | null {
  const snapshot = useSyncExternalStore(
    props.store.subscribe,
    props.store.getSnapshot,
    props.store.getSnapshot,
  );
  return (
    <DebateTurnClock
      event={props.event}
      speechTiming={
        snapshot.sessionId === props.sessionId &&
        snapshot.eventId === props.event.id
          ? snapshot.speechTiming
          : null
      }
    />
  );
});

const DebateActiveAvatarConsumer = memo(
  function DebateActiveAvatarConsumer(props: {
    store: DebatePresentationStore;
    sessionId: string;
    eventId: string;
    bot: DebateBotSnapshotV1;
    state: Omit<DebateBotAvatarState, "speechTiming">;
    renderBotAvatar: NonNullable<DebateExperienceProps["renderBotAvatar"]>;
  }): ReactNode {
    const snapshot = useSyncExternalStore(
      props.store.subscribe,
      props.store.getSnapshot,
      props.store.getSnapshot,
    );
    return props.renderBotAvatar(props.bot, {
      ...props.state,
      speechTiming:
        snapshot.sessionId === props.sessionId &&
        snapshot.eventId === props.eventId
          ? snapshot.speechTiming
          : null,
    });
  },
);

function DebateModeratorGavel(props: {
  theme: "light" | "dark";
  color?: string | null;
  cue: DebateModeratorGavelCue | null;
  sessionId?: string;
  audioEnabled?: boolean;
  visible?: boolean;
  previewPose?: DebateStageGavelPose;
  atmosphereControllerRef?: RefObject<SessionAtmosphereController | null>;
}): React.JSX.Element {
  const lastPlayedCueRef = useRef<string | null>(null);
  const downSource = `/debate/moderator-gavel-${props.theme}-down.png`;
  const upSource = `/debate/moderator-gavel-${props.theme}-up.png`;
  const spriteRequestKey = `${downSource}|${props.color ?? ""}`;
  const [spriteSet, setSpriteSet] = useState<{
    requestKey: string;
    down: string;
    up: string;
  } | null>(null);
  const downSprite =
    spriteSet?.requestKey === spriteRequestKey ? spriteSet.down : null;
  const upSprite =
    spriteSet?.requestKey === spriteRequestKey ? spriteSet.up : null;
  const cueKey =
    props.cue && props.sessionId
      ? `${props.sessionId}:${props.cue.eventId}:${props.cue.kind}`
      : null;
  const cueKind = props.cue?.kind ?? null;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      magentaTintedRasterUrl(downSource, props.color),
      magentaTintedRasterUrl(upSource, props.color),
    ]).then(([downUrl, upUrl]) => {
      if (cancelled) return;
      setSpriteSet({
        requestKey: spriteRequestKey,
        down: downUrl,
        up: upUrl,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [downSource, props.color, spriteRequestKey, upSource]);

  useLayoutEffect(() => {
    if (
      !cueKind ||
      !cueKey ||
      !props.audioEnabled ||
      !props.atmosphereControllerRef
    ) {
      return;
    }
    if (lastPlayedCueRef.current === cueKey) return;
    lastPlayedCueRef.current = cueKey;
    const timer = window.setTimeout(() => {
      props.atmosphereControllerRef?.current?.playFoley(
        DEBATE_GAVEL_FOLEY_URLS[cueKind],
        {
          trim: DEBATE_GAVEL_FOLEY_TRIM[cueKind],
          lowCutHz: 65,
          highCutHz: 12_000,
          stereoPan: 0.14,
          tag: `debate-gavel:${cueKey}`,
        },
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cueKey, cueKind, props.atmosphereControllerRef, props.audioEnabled]);

  return (
    <div
      className={styles.moderatorGavel}
      data-debate-moderator-gavel="true"
      data-gavel-theme={props.theme}
      data-visible={props.visible === false ? "false" : "true"}
      data-preview-pose={props.cue ? undefined : props.previewPose}
      aria-hidden="true"
    >
      <div
        className={styles.moderatorGavelMotion}
        data-strike={props.cue?.kind}
        key={cueKey ?? "gavel-rest"}
      >
        {/* Runtime-tinted blob URLs cannot use the Next image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.moderatorGavelFrame} ${styles.moderatorGavelFrameDown}`}
          data-tint-ready={downSprite ? "true" : "false"}
          src={downSprite ?? downSource}
          alt=""
          draggable={false}
        />
        {/* Runtime-tinted blob URLs cannot use the Next image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.moderatorGavelFrame} ${styles.moderatorGavelFrameUp}`}
          data-tint-ready={upSprite ? "true" : "false"}
          src={upSprite ?? upSource}
          alt=""
          draggable={false}
        />
      </div>
    </div>
  );
}

function debateAlignmentPreviewSnapshot(
  bot: DebateBotSummary,
  role: DebateBotSnapshotV1["role"],
  sideId: DebateSideId | null,
): DebateBotSnapshotV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: bot.id,
    name: bot.name,
    systemPrompt: bot.systemPrompt ?? "",
    role,
    sideId,
    color: bot.color,
    glyph: bot.glyph,
    avatarDetails: bot.avatarDetails ?? null,
    voiceProfile: bot.voiceProfile ?? null,
    powers: bot.powers ?? [],
    provider: "local",
    model: "alignment-preview",
    revision: `alignment-preview:${bot.id}`,
  };
}

const DEBATE_VISIBLE_TRANSCRIPT_EVENT_KINDS = new Set([
  "intro",
  "phase",
  "speech",
  "silence",
  "testimony",
  "press",
  "objection",
  "evidence",
  "revelation",
  "player_turn",
  "reaction",
  "interjection",
  "judge_gavel",
  "moderator_ruling",
  "jury_deliberation",
  "jury_verdict",
  "error",
]);

function debateCaseBoardAtSequence(
  session: DebateSessionV1,
  visibleThroughSequence: number | null,
): DebateCaseCardV1[] {
  // null = Proceedings still closed; do not spoil the frozen board.
  if (visibleThroughSequence === null) return [];
  const latestBoardEvent = [...session.events]
    .reverse()
    .find(
      (event) =>
        event.kind === "case_board" && event.sequence <= visibleThroughSequence,
    );
  if (!latestBoardEvent) return [];
  try {
    const board = JSON.parse(latestBoardEvent.content) as unknown;
    return Array.isArray(board)
      ? board.filter(
          (card): card is DebateCaseCardV1 =>
            typeof card === "object" &&
            card !== null &&
            typeof (card as DebateCaseCardV1).id === "string" &&
            ((card as DebateCaseCardV1).sideId === "for" ||
              (card as DebateCaseCardV1).sideId === "against"),
        )
      : [];
  } catch {
    return [];
  }
}

function debateExpectedBotId(session: DebateSessionV1): string | null {
  const step = session.stepKey;
  if (
    step === "intro" ||
    step === "turnabout_intro" ||
    step === "turnabout_spectator_press" ||
    step === "turnabout_ballot_moderator" ||
    step === "jury_closing_moderator" ||
    step === "judge_closing_moderator" ||
    step === "moderator_to_jury" ||
    step === "moderator_to_rebuttal" ||
    step === "moderator_to_closing" ||
    step.endsWith("_prompt") ||
    step === "ballot_moderator"
  ) {
    return session.moderator.id;
  }
  if (step === "challenge_opponent_answer") {
    return session.playerSideId === "against"
      ? session.forAdvocate.id
      : session.againstAdvocate.id;
  }
  if (step.includes("against") || step === "ballot_against") {
    return session.againstAdvocate.id;
  }
  if (step.includes("for") || step === "ballot_for") {
    return session.forAdvocate.id;
  }
  return null;
}

function debatePresentationEvents(
  previous: DebateSessionV1 | null,
  next: DebateSessionV1,
  juryCameraActive: boolean,
): DebateEventV1[] {
  const previousEventIds = new Set(
    previous?.events.map((event) => event.id) ?? [],
  );
  return next.events.filter(
    (event) =>
      !previousEventIds.has(event.id) &&
      !(
        !juryCameraActive &&
        (event.kind === "jury_deliberation" ||
          (event.kind === "ballot" && event.speakerKind === "juror"))
      ) &&
      !(
        next.jury.enabled &&
        next.playerRole === "participant" &&
        event.kind === "jury_verdict"
      ) &&
      (event.kind === "intro" ||
        event.kind === "speech" ||
        event.kind === "phase" ||
        event.kind === "silence" ||
        event.kind === "testimony" ||
        event.kind === "press" ||
        event.kind === "objection" ||
        event.kind === "evidence" ||
        event.kind === "revelation" ||
        event.kind === "player_turn" ||
        event.kind === "reaction" ||
        event.kind === "interjection" ||
        event.kind === "judge_gavel" ||
        event.kind === "moderator_ruling" ||
        event.kind === "ballot" ||
        event.kind === "jury_deliberation" ||
        event.kind === "jury_verdict" ||
        (event.kind === "verdict" && event.speakerKind === "player")),
  );
}

function debateJuryAutoChamberActive(session: DebateSessionV1): boolean {
  const step = session.stepKey;
  if (
    step.startsWith("jury_initial_") ||
    step.startsWith("jury_deliberation_") ||
    step.startsWith("jury_final_")
  ) {
    return true;
  }
  // The final-ballot advance already moves stepKey to aftermath before the
  // chamber ballot/verdict present. Keep Auto on Jury until an aftermath or
  // closing event exists, then return to the forum for advocate reactions.
  if (step.startsWith("jury_aftermath_") || step === "jury_closing_moderator") {
    return !session.events.some(
      (event) =>
        event.stepKey.startsWith("jury_aftermath_") ||
        event.stepKey === "jury_closing_moderator",
    );
  }
  return false;
}

function debateJuryCameraIsActive(
  _cameraMode: DebateCameraMode,
  session: DebateSessionV1,
  presentation?: DebateJuryCameraPresentationV1,
): boolean {
  if (
    !session.jury.enabled ||
    (session.playerRole !== "spectator" && session.playerRole !== "judge")
  ) {
    return false;
  }
  return (
    !debateJuryPresentationKeepsForumCamera(session, presentation) &&
    debateJuryAutoChamberActive(session)
  );
}

function debateCameraModeForSession(
  cameraMode: DebateCameraMode,
  session: DebateSessionV1,
): DebateCameraMode {
  if (session.playerRole === "judge") return "auto";
  return session.jury.enabled && cameraMode === "jury" ? "auto" : cameraMode;
}

const EMPTY_SLATE: DebateMotionSlateV1 = {
  version: DEBATE_SCHEMA_VERSION,
  id: "custom-motion",
  motion: "",
  forSide: { label: "", brief: "" },
  againstSide: { label: "", brief: "" },
};

const EMPTY_EVIDENCE: DebateEvidencePacketV1 = {
  version: DEBATE_SCHEMA_VERSION,
  notes: "",
  sources: [],
  exhibits: [],
  frozenAt: null,
};

function requestBody(value: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(value) };
}

function debateRequestIsRevisionConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Debate changed from revision \d+ to \d+\. Refresh and retry\./u.test(
      error.message,
    )
  );
}

function readDebateEvidenceImageFile(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return Promise.reject(
      new Error("Choose a PNG, JPEG, or WebP image for this exhibit."),
    );
  }
  if (file.size > 16 * 1024 * 1024) {
    return Promise.reject(
      new Error("Evidence exhibit images must be 16 MB or smaller."),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("Prism could not read that exhibit image."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Prism could not read that exhibit image."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function mutationKey(label: string, counter: number): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `debate:${label}:${counter}:${random}`;
}

function sessionStatusLabel(session: DebateSessionListItemV1): string {
  if (session.status === "completed") {
    return session.winnerSideId
      ? `${session.winnerSideId === "for" ? "For" : "Against"} prevailed`
      : "Completed";
  }
  if (session.status === "waiting_for_player") return "Your turn";
  if (session.status === "paused") return "Paused";
  if (session.status === "failed") return "Needs attention";
  return `${session.phase.charAt(0).toUpperCase()}${session.phase.slice(1)}`;
}

function debateSessionNeedsReturnPause(session: DebateSessionV1): boolean {
  return session.status === "live" || session.status === "waiting_for_player";
}

/**
 * Presentation-only copy of a held line with a recess lead-in. Saved Proceedings
 * keep the original event text.
 */
function debateSessionWithRecessResumeFiller(
  session: DebateSessionV1,
  eventId: string,
): DebateSessionV1 {
  const filler = debateRecessResumeFiller({
    formality: session.formality,
    sessionId: session.id,
    eventId,
    revision: session.revision,
  });
  return {
    ...session,
    events: session.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            content: debateRecessResumePresentationContent(
              event.content,
              filler,
            ),
          }
        : event,
    ),
  };
}

/**
 * Prefer the recess bookmark when leaving during a pause/resume ceremony beat so
 * the held speech survives, not the moderator announcement.
 */
function debateExitPresentationEventId(
  session: DebateSessionV1,
  interruptedEventId: string | null,
): string | null {
  if (!interruptedEventId) {
    return session.pausedPresentationEventId ?? null;
  }
  const interrupted = session.events.find(
    (event) => event.id === interruptedEventId,
  );
  if (
    interrupted &&
    (interrupted.stepKey === "pause" || interrupted.stepKey === "resume") &&
    session.pausedPresentationEventId
  ) {
    return session.pausedPresentationEventId;
  }
  return interruptedEventId;
}

function phaseLabel(session: DebateSessionV1): string {
  if (session.formatState.format === "turnabout") {
    const phase = session.formatState.phase;
    return `${phase.charAt(0).toUpperCase()}${phase.slice(1)}`;
  }
  if (session.phase === "rebuttal") {
    return `Rebuttal ${session.formatState.rebuttalRound} of ${session.formatState.rebuttalRoundTarget}`;
  }
  return `${session.phase.charAt(0).toUpperCase()}${session.phase.slice(1)}`;
}

function debateJudgeGavelLockedForJury(
  session: DebateSessionV1 | null,
): boolean {
  return Boolean(
    session?.playerRole === "judge" &&
    session.jury.enabled &&
    (session.stepKey.startsWith("jury_initial_") ||
      session.stepKey.startsWith("jury_deliberation_") ||
      session.stepKey.startsWith("jury_final_")),
  );
}

function roleDescription(
  role: DebatePlayerRole,
  format: DebateFormatId,
  formality: DebateFormalityId,
): string {
  if (format === "turnabout") {
    if (role === "judge") {
      return formality === "parliamentary"
        ? "Press or test any statement against frozen evidence, then issue the final record ruling."
        : "Press or test any claim against frozen evidence, then make the final call.";
    }
    if (role === "participant") {
      return "Participant is available in Forum only.";
    }
    return formality === "parliamentary"
      ? "Watch the moderator press every statement before the three-bot public-record resolution."
      : "Watch the moderator press every claim before the three-bot decision.";
  }
  if (role === "judge") {
    return "Stay silent or ask one challenge, then make the final ruling. The Judge acts only when you do.";
  }
  if (role === "participant") {
    return "Replace one advocate with your account avatar. You own every turn on that side; cast only the Judge and opponent.";
  }
  return "Watch the moderator challenge both advocates. The three-bot majority decides the verdict.";
}

function debateProductionName(
  format: DebateFormatId,
  formality: DebateFormalityId,
): string {
  if (formality === "parliamentary") {
    return format === "turnabout" ? "Court of Record" : "Assembly Chamber";
  }
  return format === "turnabout" ? "Turnabout Floor" : "Debate Floor";
}

function debatePublicMaterialName(formality: DebateFormalityId): string {
  if (formality === "parliamentary") return "Public record";
  if (formality === "structured") return "Documented exchange";
  return "Public exchange";
}

function roleSummary(
  role: DebatePlayerRole,
  format: DebateFormatId = "forum",
  formality: DebateFormalityId = "parliamentary",
): string {
  if (format === "turnabout") {
    if (role === "judge") {
      return formality === "parliamentary"
        ? "Examine the record, then issue the ruling."
        : "Test the claims, then make the final call.";
    }
    if (role === "participant") {
      return "Participant is available in Forum only.";
    }
    return "Observe a neutral examination of every claim.";
  }
  if (role === "judge") return "Challenge once, then issue the final ruling.";
  if (role === "participant") {
    return "Your account avatar replaces your side’s advocate; every turn is yours.";
  }
  return "Observe the Duel without taking the floor.";
}

function juryRoleDescription(role: DebatePlayerRole): string {
  if (role === "judge") {
    return "Five sampled jurors follow the floor, discuss the case, and advise your final ruling.";
  }
  if (role === "participant") {
    return "The chamber remains completely sealed. You receive only the winning side and anonymous 5-vote split.";
  }
  return "Watch five sampled jurors follow and discuss the case. Their majority becomes the final verdict.";
}

function verdictLabel(session: DebateSessionV1): string {
  if (session.winnerSideId === "for") return session.motion.forSide.label;
  if (session.winnerSideId === "against") {
    return session.motion.againstSide.label;
  }
  return "No prevailing side";
}

function DebateIdentOverlay({
  kind,
  session,
}: {
  kind: DebateIdentKind;
  session: DebateSessionV1;
}): React.JSX.Element {
  const intro = kind === "intro";
  const outcome = verdictLabel(session);
  return (
    <section
      className={styles.identOverlay}
      data-kind={kind}
      data-debate-ident-overlay="true"
      style={
        {
          "--debate-ident-duration": `${DEBATE_IDENT_AUDIO[kind].durationMs}ms`,
          "--debate-ident-for-color": session.forAdvocate.color ?? "#42d9ff",
          "--debate-ident-against-color":
            session.againstAdvocate.color ?? "#ff5f8f",
        } as CSSProperties
      }
      role="status"
      aria-live="polite"
      aria-label={
        intro
          ? `The Prismatic Forum. ${session.motion.motion}`
          : `The Forum is adjourned. ${outcome}.`
      }
    >
      <div className={styles.identSpectralField} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className={styles.identComposition}>
        <p className={styles.identKicker}>
          {intro ? "PRISM presents" : "The Forum is adjourned"}
        </p>
        <div className={styles.identPrismMark} aria-hidden="true">
          <span />
          <i />
        </div>
        <p className={styles.identProduction}>
          {debateProductionName(session.format, session.formality)}
        </p>
        <h2>{intro ? "The Prismatic Forum" : outcome}</h2>
        <blockquote>{session.motion.motion}</blockquote>
        <div className={styles.identSides} aria-hidden="true">
          <span data-side="for">{session.motion.forSide.label}</span>
          <i>versus</i>
          <span data-side="against">{session.motion.againstSide.label}</span>
        </div>
        <small>
          {intro
            ? `${session.format === "turnabout" ? "Turnabout" : "Forum"} · ${debateFormalityDescriptor(session.formality).title}`
            : session.winnerSideId
              ? "Prevailing side"
              : "No side prevailed"}
        </small>
      </div>
    </section>
  );
}

function visibleEventName(
  session: DebateSessionV1,
  event: DebateEventV1,
  playerName = "You",
): string {
  if (event.speakerKind === "player") {
    return playerName;
  }
  if (event.speakerKind === "system") {
    if (session.format !== "turnabout") return "Forum";
    if (session.formality === "parliamentary") return "Public record";
    if (session.formality === "structured") return "Documented exchange";
    return "Debate floor";
  }
  if (event.speakerBotId === session.moderator.id) {
    return session.moderator.id === DEBATE_PLAYER_JUDGE_BOT_ID
      ? playerName
      : session.moderator.name;
  }
  if (event.speakerBotId === session.forAdvocate.id) {
    return session.forAdvocate.id === DEBATE_PLAYER_PARTICIPANT_BOT_ID
      ? playerName
      : session.forAdvocate.name;
  }
  if (event.speakerBotId === session.againstAdvocate.id) {
    return session.againstAdvocate.id === DEBATE_PLAYER_PARTICIPANT_BOT_ID
      ? playerName
      : session.againstAdvocate.name;
  }
  const juror = session.jury.jurors.find(
    (candidate) => candidate.id === event.speakerBotId,
  );
  if (juror) return juror.name;
  if (session.format !== "turnabout") return "Forum";
  if (session.formality === "parliamentary") return "Public record";
  if (session.formality === "structured") return "Documented exchange";
  return "Debate floor";
}

function debateSideLabel(
  session: DebateSessionV1,
  sideId: DebateSideId | null,
): string {
  if (sideId === "for") return session.motion.forSide.label;
  if (sideId === "against") return session.motion.againstSide.label;
  return "Neutral";
}

export function formatDebateVerboseTranscript(
  session: DebateSessionV1,
  playerName = "You",
  presenceBeats: readonly BotPresenceBeatV1[] = [],
): string {
  const cast = [
    [normalizeDebateModeratorTitle(session.moderatorTitle), session.moderator],
    [`For — ${session.motion.forSide.label}`, session.forAdvocate],
    [`Against — ${session.motion.againstSide.label}`, session.againstAdvocate],
  ] as const;
  const lines = [
    "# PRISM Debate Review — Verbose Transcript",
    "",
    `- Session: ${session.id}`,
    `- Status: ${session.status}`,
    `- Revision: ${session.revision}`,
    `- Format: ${session.format} v${session.formatVersion}`,
    `- Formality: ${debateFormalityDescriptor(session.formality).title}`,
    `- Title: ${debateTitleForMotion(session.motion, session.formality)}`,
    `- Preset: ${session.setupPresetId}`,
    `- Jury: ${session.jury.enabled ? "enabled" : "disabled"}`,
    `- Player role: ${session.playerRole}${session.playerSideId ? ` — ${debateSideLabel(session, session.playerSideId)}` : ""}`,
    `- Created: ${session.createdAt}`,
    `- Updated: ${session.updatedAt}`,
    `- Ended early: ${session.endedEarlyAt ?? "No"}`,
    `- Completed: ${session.completedAt ?? "No"}`,
    "",
    "## Motion",
    "",
    session.motion.motion,
    "",
    `- For (${session.motion.forSide.label}): ${session.motion.forSide.brief}`,
    `- Against (${session.motion.againstSide.label}): ${session.motion.againstSide.brief}`,
    "",
    "## Cast and frozen runtime",
    "",
    `- Response mode: ${session.responseMode.toUpperCase()}`,
    "- Spoken timing: setting-independent estimates from each final heard line",
    `- Frozen generation chain: ${session.generationChain.map((entry) => `${entry.provider}/${entry.model}`).join(" → ")}`,
    ...cast.map(
      ([role, bot]) =>
        `- ${role}: ${
          bot.id === DEBATE_PLAYER_JUDGE_BOT_ID ||
          bot.id === DEBATE_PLAYER_PARTICIPANT_BOT_ID
            ? playerName
            : bot.name
        } (${bot.provider}/${bot.model}; bot ${bot.id}; revision ${bot.revision})`,
    ),
    "",
    "## Advocacy consent",
    "",
    ...session.advocacyConsent.map(
      (check) =>
        `- ${visibleEventName(
          session,
          {
            speakerKind: "advocate",
            speakerBotId: check.botId,
          } as DebateEventV1,
          playerName,
        )} — ${debateSideLabel(session, check.sideId)}: ${check.status}${check.reason ? ` — ${check.reason}` : ""} (motion ${check.motionHash}; bot revision ${check.botRevision}${check.provider && check.model ? `; ${check.provider}/${check.model}` : ""}${check.autoRecovery ? `; recovered after ${check.autoRecovery.attempts.length} attempts` : ""})`,
    ),
    "",
    "## Frozen evidence",
    "",
    session.evidence.notes
      ? `Player notes:\n\n${session.evidence.notes}`
      : "Player notes: None",
    "",
    ...(session.evidence.sources.length > 0
      ? session.evidence.sources.flatMap((source) => [
          `- [${source.id}] ${source.title}`,
          `  - URL: ${source.url}`,
          `  - Published: ${source.publishedAt ?? "Unknown"}`,
          `  - Snippet: ${source.snippet}`,
        ])
      : ["No frozen sources."]),
    ...((session.evidence.exhibits?.length ?? 0) > 0
      ? (session.evidence.exhibits ?? []).flatMap((exhibit) => [
          `- [${exhibit.id}] ${exhibit.title}`,
          `  - Observation: ${exhibit.observation}`,
          `  - Visual: ${exhibit.visualKind}${exhibit.imageId ? ` (${exhibit.imageId})` : ` (${exhibit.emoji})`}`,
          `  - Authorship: ${exhibit.createdBy}`,
        ])
      : ["No frozen object exhibits."]),
    "",
    "## Resolved Powers",
    "",
    ...cast.map(([role, bot]) => {
      const plan = session.powerPlan.bots[bot.id];
      const effects =
        plan?.effects.map(
          ({ powerName, policy }) => `${powerName} (${policy})`,
        ) ?? [];
      return `- ${role}: ${effects.length > 0 ? effects.join(", ") : "None"}${plan?.hardMuted ? "; hard muted" : ""}`;
    }),
    "",
    "## Response cues (heard only)",
    "",
    ...(presenceBeats.length > 0
      ? presenceBeats.flatMap((beat) => {
          const heard = heardBotPresenceBeatTextV1(beat).trim();
          const actualDurationMs =
            beat.playbackEndedAtMs === null
              ? null
              : Math.max(0, beat.playbackEndedAtMs - beat.playbackStartedAtMs);
          const durationMs = actualDurationMs ?? debateRevealDurationMs(heard);
          return heard
            ? [
                `- ${beat.speaker.name} (${beat.trigger}; ${actualDurationMs === null ? "estimated " : "heard "}${formatDebateSpokenDuration(durationMs)}): ${heard}`,
              ]
            : [];
        })
      : ["No audible response cues."]),
    "",
    "## Event stream",
    "",
    ...session.events
      .filter(
        (event) =>
          !debateEventIsTranscriptHousekeeping(event) &&
          !debateEventIsAtmosphericVocalFoley(event) &&
          !debateEventIsJuryComment(event),
      )
      .flatMap((event) => {
        const privateBallot =
          event.kind === "ballot" &&
          event.speakerKind !== "juror" &&
          session.ballots.find(
            (ballot) => ballot.voterBotId === event.speakerBotId,
          )?.privateReason;
        const spokenDurationMs = privateBallot
          ? null
          : debateEventSpokenLineDurationMs(event);
        const voicePerformanceCue = normalizeDebateVoicePerformanceCue(
          event.voicePerformanceCue,
        );
        return [
          `### ${String(event.sequence).padStart(3, "0")} · ${event.phase} · ${event.kind}`,
          "",
          `- Speaker: ${visibleEventName(session, event, playerName)} (${event.speakerKind})`,
          `- Side: ${debateSideLabel(session, event.sideId)}`,
          `- Step: ${event.stepKey}`,
          `- Statement: ${event.statementId ?? "None"}`,
          `- Evidence item: ${event.evidenceSourceId ?? "None"}`,
          `- Ruling: ${event.ruling ?? "None"}`,
          `- At: ${event.createdAt}`,
          `- Evidence IDs: ${event.sourceIds.length > 0 ? event.sourceIds.join(", ") : "None"}`,
          `- Generation: ${event.provider && event.model ? `${event.provider}/${event.model}${event.autoRecovery ? ` after ${event.autoRecovery.attempts.length} attempts` : ""}` : "Not model-generated"}`,
          `- Voice performance: ${voicePerformanceCue ? `[${voicePerformanceCue}]` : "None"}`,
          `- Delivery: ${
            event.interrupted
              ? `Interrupted by ${event.interruptedBy ?? "unknown"}`
              : "Complete"
          }`,
          ...(spokenDurationMs === null
            ? []
            : [
                `- Spoken duration: ~${formatDebateSpokenDuration(spokenDurationMs)} (setting-independent estimate)`,
              ]),
          "",
          event.content,
          "",
        ];
      }),
    ...(session.formatState.format === "forum"
      ? [
          "## Forum round plan",
          "",
          `- Selection: ${session.formatState.rebuttalRoundMode}`,
          `- Rebuttal exchanges: ${session.formatState.rebuttalRoundTarget}`,
          `- Rationale: ${session.formatState.rebuttalRoundRationale}`,
          "",
        ]
      : []),
    ...(session.formatState.format === "turnabout"
      ? [
          `## Turnabout ${debatePublicMaterialName(session.formality).toLowerCase()}`,
          "",
          `- Format phase: ${session.formatState.phase}`,
          `- Reversal count: ${Math.max(0, session.formatState.round - 1)}`,
          ...session.formatState.statements.map(
            (statement, index) =>
              `- Statement ${index + 1} · ${debateSideLabel(session, statement.sideId)} · ${statement.status} · bot ${statement.speakerBotId}: ${debateSpokenText(statement.content)}`,
          ),
          ...session.formatState.contradictions.map(
            (contradiction) =>
              `- ${contradiction.ruling} · statement ${contradiction.statementId} · evidence ${contradiction.evidenceSourceId} · grounded ${contradiction.grounded ? "yes" : "no"}`,
          ),
          "",
        ]
      : []),
    "## Final case board",
    "",
    ...(session.caseBoard.length > 0
      ? session.caseBoard.map(
          (card) =>
            `- ${debateSideLabel(session, card.sideId)} · ${card.status}: ${card.summary}${card.sourceIds.length > 0 ? ` [${card.sourceIds.join(", ")}]` : ""}`,
        )
      : ["No public case-board cards."]),
    "",
    "## Ballots and verdict",
    "",
    ...(session.jury.enabled
      ? [
          `- Jury split: ${session.jury.forVotes}–${session.jury.againstVotes}`,
          `- Jury majority: ${session.jury.majoritySideId ? debateSideLabel(session, session.jury.majoritySideId) : "Not decided"}`,
          ...session.jury.finalBallots.map((ballot) => {
            const juror = session.jury.jurors.find(
              (candidate) => candidate.id === ballot.jurorBotId,
            );
            return `- ${juror?.name ?? "Juror"}: ${debateSideLabel(session, ballot.sideId)} — ${ballot.reason}`;
          }),
        ]
      : []),
    ...session.ballots.map((ballot) => {
      const voter =
        ballot.voterBotId === session.moderator.id
          ? session.moderator
          : ballot.voterBotId === session.forAdvocate.id
            ? session.forAdvocate
            : session.againstAdvocate;
      return `- ${voter.name}: ${debateSideLabel(session, ballot.sideId)} — ${ballot.reason ?? "Private ballot; no public reason."}${ballot.provider && ballot.model ? ` (${ballot.provider}/${ballot.model}${ballot.autoRecovery ? ` after ${ballot.autoRecovery.attempts.length} attempts` : ""})` : ""}`;
    }),
    `- Player verdict: ${session.playerVerdict ? debateSideLabel(session, session.playerVerdict) : "None"}`,
    `- Winner: ${session.winnerSideId ? debateSideLabel(session, session.winnerSideId) : "Not decided"}`,
  ];
  return lines
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

async function writeDebateClipboardText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Plain-HTTP LAN development may still permit the explicit copy path.
    }
  }

  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
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
    previouslyFocused?.focus();
  }
}

function DebateErrorToast(props: { message: string }): React.JSX.Element {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  return (
    <button
      type="button"
      className={`${styles.error} ${styles.errorToast}`}
      role="alert"
      data-copy-state={copyState}
      onClick={() => {
        void writeDebateClipboardText(props.message)
          .then(() => setCopyState("copied"))
          .catch(() => setCopyState("failed"));
      }}
      aria-label={`${props.message} ${
        copyState === "copied"
          ? "Copied to clipboard."
          : copyState === "failed"
            ? "Copy failed."
            : "Click to copy this error."
      }`}
    >
      <span>{props.message}</span>
      <small>
        {copyState === "copied"
          ? "Copied to clipboard."
          : copyState === "failed"
            ? "Couldn’t copy. Try again."
            : "Click to copy error."}
      </small>
    </button>
  );
}

const DebateMarkdownBody = memo(
  function DebateMarkdownBody({
    content,
    evidence,
    onSource,
  }: {
    content: string;
    evidence: DebateEvidencePacketV1;
    onSource: (id: string) => void;
  }): React.JSX.Element {
    return (
      <div className={styles.transcriptMarkdown}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            a: ({ href, children }) => {
              const item = debateEvidenceFromMarkdownHref(href, evidence);
              if (item) {
                return (
                  <button
                    type="button"
                    className={styles.sourceChip}
                    data-kind={item.kind}
                    onClick={() => onSource(item.value.id)}
                    aria-label={`Open ${item.kind === "source" ? "source" : "exhibit"} ${item.value.title}`}
                  >
                    {children}
                  </button>
                );
              }
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            },
            img: () => null,
          }}
        >
          {debateMarkdownSource(content, evidence)}
        </ReactMarkdown>
      </div>
    );
  },
  (previous, next) =>
    previous.content === next.content &&
    previous.evidence.frozenAt === next.evidence.frozenAt &&
    previous.onSource === next.onSource,
);

const DebateTranscriptBodyConsumer = memo(
  function DebateTranscriptBodyConsumer(props: {
    store: DebatePresentationStore;
    sessionId: string;
    event: DebateEventV1;
    evidence: DebateEvidencePacketV1;
    onSource: (id: string) => void;
  }): React.JSX.Element {
    const snapshot = useSyncExternalStore(
      props.store.subscribe,
      props.store.getSnapshot,
      props.store.getSnapshot,
    );
    // Streaming articles must never fall back to the completed speech while the
    // presentation store is still catching up (voice prep / empty reveal arming).
    const content =
      snapshot.sessionId === props.sessionId &&
      snapshot.eventId === props.event.id
        ? snapshot.visibleContent
        : "";
    return content ? (
      <div className={styles.transcriptMarkdown}>
        <p>{debateSpokenText(content)}</p>
      </div>
    ) : (
      <span
        className={styles.liveProseCursor}
        aria-label="Speaker is beginning"
      />
    );
  },
);

const DebateVisibleTextConsumer = memo(
  function DebateVisibleTextConsumer(props: {
    store: DebatePresentationStore;
    sessionId: string;
    event: DebateEventV1;
  }): ReactNode {
    const snapshot = useSyncExternalStore(
      props.store.subscribe,
      props.store.getSnapshot,
      props.store.getSnapshot,
    );
    const content =
      snapshot.sessionId === props.sessionId &&
      snapshot.eventId === props.event.id
        ? snapshot.visibleContent
        : props.event.content;
    return debateSpokenText(content);
  },
);

const DebateCompletedTranscriptArticle = memo(
  function DebateCompletedTranscriptArticle(props: {
    session: DebateSessionV1;
    event: DebateEventV1;
    playerName: string;
    onSource: (id: string) => void;
  }): React.JSX.Element {
    return (
      <article
        data-kind={props.event.kind}
        data-side={props.event.sideId ?? undefined}
        data-completed="true"
      >
        <header>
          <strong>
            {visibleEventName(props.session, props.event, props.playerName)}
          </strong>
          <span>
            {props.event.interrupted
              ? "interrupted"
              : props.event.stepKey.startsWith("persona_reaction_")
                ? "vocal reaction"
                : props.event.kind.replace("_", " ")}{" "}
            · {props.event.phase}
          </span>
        </header>
        {props.event.content ? (
          <DebateMarkdownBody
            content={props.event.content}
            evidence={props.session.evidence}
            onSource={props.onSource}
          />
        ) : null}
      </article>
    );
  },
  (previous, next) =>
    previous.session.id === next.session.id &&
    previous.session.evidence.frozenAt === next.session.evidence.frozenAt &&
    previous.event.id === next.event.id &&
    previous.event.content === next.event.content &&
    previous.event.interrupted === next.event.interrupted &&
    previous.playerName === next.playerName &&
    previous.onSource === next.onSource,
);

const DebateStreamingTranscriptArticle = memo(
  function DebateStreamingTranscriptArticle(props: {
    store: DebatePresentationStore;
    session: DebateSessionV1;
    event: DebateEventV1;
    playerName: string;
    onSource: (id: string) => void;
  }): React.JSX.Element {
    return (
      <article
        data-kind={props.event.kind}
        data-side={props.event.sideId ?? undefined}
        data-streaming="true"
      >
        <header>
          <strong>
            {visibleEventName(props.session, props.event, props.playerName)}
          </strong>
          <span>
            {props.event.interrupted
              ? "interrupted"
              : props.event.stepKey.startsWith("persona_reaction_")
                ? "vocal reaction"
                : props.event.kind.replace("_", " ")}{" "}
            · {props.event.phase}
          </span>
        </header>
        <DebateTranscriptBodyConsumer
          store={props.store}
          sessionId={props.session.id}
          event={props.event}
          evidence={props.session.evidence}
          onSource={props.onSource}
        />
      </article>
    );
  },
);

function debateEvidenceExhibitImageUrl(
  exhibit: DebateEvidenceExhibitV1,
): string | null {
  return exhibit.imageId
    ? `/api/images/${encodeURIComponent(exhibit.imageId)}/file`
    : null;
}

function debateEvidenceSourceHost(source: DebateEvidenceSourceV1): string {
  try {
    return new URL(source.url).hostname.replace(/^www\./u, "");
  } catch {
    return "Source";
  }
}

function DebateEvidenceExhibitVisual({
  exhibit,
  className,
}: {
  exhibit: DebateEvidenceExhibitV1;
  className?: string;
}): React.JSX.Element {
  const imageUrl =
    exhibit.visualKind === "emoji"
      ? null
      : debateEvidenceExhibitImageUrl(exhibit);
  return (
    <span
      className={`${styles.evidenceExhibitVisual} ${className ?? ""}`}
      data-visual-kind={exhibit.visualKind}
      aria-label={`${exhibit.title} evidence exhibit`}
    >
      <span aria-hidden="true">{exhibit.emoji}</span>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={exhibit.title}
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
    </span>
  );
}

function pickDebateStageAlignmentEvidenceEmoji(
  random: () => number = Math.random,
): string {
  const index = Math.max(
    0,
    Math.min(
      DEBATE_EVIDENCE_EMOJI_CHOICES.length - 1,
      Math.floor(random() * DEBATE_EVIDENCE_EMOJI_CHOICES.length),
    ),
  );
  return DEBATE_EVIDENCE_EMOJI_CHOICES[index] ?? "📦";
}

function debateStageAlignmentEvidencePreviewItem(
  kind: DebateStageEvidenceKind,
  emoji: string,
): DebateEvidenceItemV1 {
  if (kind === "source") {
    return {
      kind: "source",
      value: {
        id: "alignment-source-preview",
        title: "The Public Record",
        url: "https://example.org/research/briefing",
        snippet:
          "A sample finding demonstrates how a cited source wraps and reads from the lecterns.",
        publishedAt: null,
      },
    };
  }
  return {
    kind: "exhibit",
    value: {
      id: "alignment-exhibit-preview",
      adjective: "sample",
      object: "exhibit",
      title: "Sample exhibit",
      observation: "A sample object used only to align the stage.",
      emoji,
      visualKind: "emoji",
      imageId: null,
      createdBy: "prism",
    },
  };
}

function DebateEvidencePedestal({
  item,
  view,
  onOpen,
  audioEnabled = false,
  atmosphereControllerRef,
  alignmentPreview = false,
}: {
  item: DebateEvidenceItemV1;
  view: DebateStageEvidenceView;
  onOpen: () => void;
  audioEnabled?: boolean;
  atmosphereControllerRef?: RefObject<SessionAtmosphereController | null>;
  alignmentPreview?: boolean;
}): React.JSX.Element {
  const lastPlacedEvidenceIdRef = useRef<string | null>(null);
  const exhibit = item.kind === "exhibit" ? item.value : null;
  const evidenceSource = item.kind === "source" ? item.value : null;
  const evidenceSourcePropKind = evidenceSource
    ? debateEvidenceSourcePropKind(evidenceSource)
    : null;
  const title = item.value.title;
  const propRotationDeg = debateEvidencePropRotationDeg(item.value.id);

  useLayoutEffect(() => {
    if (alignmentPreview) return;
    if (!audioEnabled || !atmosphereControllerRef) return;
    if (!exhibit) return;
    if (lastPlacedEvidenceIdRef.current === exhibit.id) return;
    lastPlacedEvidenceIdRef.current = exhibit.id;
    const impact = debateExhibitImpactForExhibit(exhibit, "table_place");
    const timer = window.setTimeout(() => {
      atmosphereControllerRef.current?.playFoley(impact.url, {
        trim: impact.trim,
        lowCutHz: 70,
        highCutHz: 11_000,
        stereoPan: 0.02,
        tag: `debate-exhibit-place:${exhibit.id}:${impact.material}`,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [alignmentPreview, atmosphereControllerRef, audioEnabled, exhibit]);

  return (
    <section
      className={styles.evidencePedestal}
      data-visual-kind={exhibit?.visualKind ?? "document"}
      data-evidence-kind={item.kind}
      data-evidence-view={view}
      data-impact-material={
        exhibit ? resolveDebateExhibitImpactMaterial(exhibit) : "paper"
      }
      data-alignment-preview={alignmentPreview ? "true" : undefined}
      data-debate-evidence-alignment-preview={
        alignmentPreview ? "true" : undefined
      }
      aria-hidden={alignmentPreview ? "true" : undefined}
      aria-label={`Presented evidence: ${title}`}
      style={
        {
          "--debate-evidence-prop-rotate": `${propRotationDeg}deg`,
        } as CSSProperties
      }
    >
      <button
        type="button"
        onClick={onOpen}
        tabIndex={alignmentPreview ? -1 : undefined}
        title={title}
        aria-label={`Open evidence: ${title}`}
      >
        <span className={styles.evidencePedestalGlow} aria-hidden="true" />
        {exhibit ? (
          <DebateEvidenceExhibitVisual
            exhibit={exhibit}
            className={styles.evidencePedestalSprite}
          />
        ) : (
          <span
            className={styles.evidencePedestalDocument}
            aria-hidden="true"
            data-debate-evidence-document="true"
            data-source-kind={evidenceSourcePropKind ?? undefined}
            data-prop={
              evidenceSourcePropKind === "url"
                ? "envelope"
                : evidenceSourcePropKind === "scholar"
                  ? "folio"
                  : "clipping"
            }
          >
            <span
              className={styles.evidencePedestalDocumentHardware}
              aria-hidden="true"
            />
            {evidenceSource ? (
              <span className={styles.evidencePedestalDocumentDetails}>
                <span className={styles.evidencePedestalDocumentOrigin}>
                  {debateEvidenceSourceHost(evidenceSource)}
                </span>
                <strong className={styles.evidencePedestalDocumentTitle}>
                  {evidenceSource.title}
                </strong>
                <span className={styles.evidencePedestalDocumentSnippet}>
                  {evidenceSource.snippet}
                </span>
              </span>
            ) : null}
          </span>
        )}
      </button>
    </section>
  );
}

function DebateEvidenceDrawer({
  item,
  closeButtonRef,
  onClose,
}: {
  item: DebateEvidenceItemV1;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}): React.JSX.Element {
  const source = item.kind === "source" ? item.value : null;
  const exhibit = item.kind === "exhibit" ? item.value : null;
  return (
    <div
      className={styles.sourceDrawerBackdrop}
      data-debate-evidence-drawer-backdrop="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className={styles.sourceDrawer}
        data-kind={item.kind}
        data-debate-evidence-drawer="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="debate-evidence-title"
      >
        <header className={styles.sourceDrawerHeader}>
          <span>
            {item.kind === "source" ? "Public source" : "Object exhibit"} ·{" "}
            {item.value.id}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.sourceDrawerClose}
            onClick={onClose}
            aria-label={
              item.kind === "source" ? "Close source" : "Close exhibit"
            }
          >
            Close
          </button>
        </header>
        {exhibit ? (
          <DebateEvidenceExhibitVisual
            exhibit={exhibit}
            className={styles.evidenceDrawerVisual}
          />
        ) : null}
        <h2 id="debate-evidence-title">{item.value.title}</h2>
        <p>{source ? source.snippet : exhibit?.observation}</p>
        {source?.publishedAt ? <small>{source.publishedAt}</small> : null}
        {exhibit ? (
          <small>
            {exhibit.createdBy === "prism"
              ? "PRISM suggested the object; you approved its record."
              : "Player-authored exhibit record."}{" "}
            The visual is presentation only.
          </small>
        ) : null}
        {source ? (
          <a href={source.url} target="_blank" rel="noreferrer">
            Open original source
          </a>
        ) : null}
      </aside>
    </div>
  );
}

const DEBATE_FALSE_NAMES = [
  "Arden",
  "Clio",
  "Dorian",
  "Ione",
  "Mara",
  "Noor",
  "Orion",
  "Selene",
] as const;

function stableIndex(seed: string, length: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return length > 0 ? hash % length : 0;
}

function debateBotSnapshot(
  session: DebateSessionV1,
  botId: string | null | undefined,
): DebateBotSnapshotV1 | null {
  if (botId === session.moderator.id) return session.moderator;
  if (botId === session.forAdvocate.id) return session.forAdvocate;
  if (botId === session.againstAdvocate.id) return session.againstAdvocate;
  const juror = session.jury.jurors.find((candidate) => candidate.id === botId);
  if (juror) return juror;
  return null;
}

function debateBotPresentation(
  session: DebateSessionV1,
  bot: DebateBotSnapshotV1,
  beforeSequence = Number.POSITIVE_INFINITY,
  observerPerspective: "live" | "replay" = "live",
): {
  displayName: string;
  identityLabel: string | null;
  glyph: string | null;
  voiceSourceBotId: string;
  visibility: "visible" | "hidden" | "translucent" | "speaking_only";
  scale: "normal" | BotPowerAvatarScaleMode;
  colorCycle: boolean;
} {
  const effects =
    session.powerPlan.bots[bot.id]?.effects.map(({ effect }) => effect) ?? [];
  const designation = effects.find((effect) => effect.type === "designation");
  const displayName =
    designation?.type === "designation"
      ? designation.placement === "prefix"
        ? `${designation.text} ${bot.name}`
        : `${bot.name} ${designation.text}`
      : bot.name;
  const cast = [
    session.moderator,
    session.forAdvocate,
    session.againstAdvocate,
    ...session.jury.jurors,
  ];
  let identitySource: DebateBotSnapshotV1 | null = null;
  if (effects.some((effect) => effect.type === "identity_mirror")) {
    const priorSpeakerId = [...session.events]
      .reverse()
      .find(
        (event) =>
          event.sequence < beforeSequence &&
          event.speakerBotId &&
          event.speakerBotId !== bot.id,
      )?.speakerBotId;
    identitySource = debateBotSnapshot(session, priorSpeakerId);
  }
  if (
    !identitySource &&
    effects.some((effect) => effect.type === "identity_shapeshift")
  ) {
    const candidates = cast.filter((candidate) => candidate.id !== bot.id);
    identitySource =
      candidates[stableIndex(`${session.id}:${bot.id}`, candidates.length)] ??
      null;
  }
  const falseName = effects.some((effect) => effect.type === "false_name")
    ? DEBATE_FALSE_NAMES[
        stableIndex(
          `${session.id}:${bot.id}:false-name`,
          DEBATE_FALSE_NAMES.length,
        )
      ]
    : null;
  const visibilityEffect = effects.find(
    (effect) => effect.type === "avatar_visibility",
  );
  const scaleEffect = effects.find((effect) => effect.type === "avatar_scale");
  const observerProjection = botPowerObserverProjectionFromEffectsV1(
    effects,
    observerPerspective,
    (target) =>
      target.kind === "bot" &&
      cast.some((participant) => participant.id === target.botId),
    { holderSpeaking: true },
  );
  return {
    displayName,
    identityLabel: identitySource
      ? `Appearing as ${identitySource.name}`
      : falseName
        ? `Believes: ${falseName}`
        : null,
    glyph: identitySource?.glyph ?? bot.glyph,
    voiceSourceBotId: identitySource?.id ?? bot.id,
    visibility:
      observerProjection.visibility === "hidden"
        ? "hidden"
        : visibilityEffect?.type === "avatar_visibility"
          ? visibilityEffect.mode
          : "visible",
    scale: scaleEffect?.type === "avatar_scale" ? scaleEffect.mode : "normal",
    colorCycle: effects.some((effect) => effect.type === "avatar_color_cycle"),
  };
}

export function DebateExperience(
  props: DebateExperienceProps,
): React.JSX.Element {
  const {
    bots,
    botGroups = [],
    expandComposerDraft,
    onCompanionContextChange,
    onLiveSessionActiveChange,
    onPrepareUtterance,
    onPrewarmResponseCue,
    onPrefetchPreparedUtterance,
    onResponseCueGeneration,
    onStopUtterance,
    onReleaseUtterance,
    onUtterance,
    preferredProvider,
    renderPickAwareComposer,
    request,
  } = props;
  const playerName = props.playerName.trim() || "You";
  const [view, setView] = useState<DebateView>("dashboard");
  const [spectatorBake, setSpectatorBake] = useState<LiveBakeArtifactV1 | null>(
    null,
  );
  const [observerPerspective, setObserverPerspective] = useState<
    "live" | "replay"
  >("live");
  const [studioPanel, setStudioPanel] = useState<DebateStudioPanel>("motion");
  const [roomTuningOpen, setRoomTuningOpen] = useState(false);
  const [motionTuningOpen, setMotionTuningOpen] = useState(false);
  const [castTuningOpen, setCastTuningOpen] = useState(false);
  const [evidenceDecisionMade, setEvidenceDecisionMade] = useState(false);
  const [sessions, setSessions] = useState<DebateSessionListItemV1[]>([]);
  const [activeSession, setActiveSession] = useState<DebateSessionV1 | null>(
    null,
  );
  const [persistedPresenceBeats, setPersistedPresenceBeats] = useState<
    BotPresenceBeatV1[]
  >([]);
  useEffect(() => {
    if (!activeSession?.id) {
      setPersistedPresenceBeats([]);
      return;
    }
    const controller = new AbortController();
    void request<{ beats: BotPresenceBeatV1[] }>(
      `/api/presence-beats?surface=debate&sessionId=${encodeURIComponent(activeSession.id)}`,
      { signal: controller.signal },
    )
      .then(({ beats }) => setPersistedPresenceBeats(beats))
      .catch(() => undefined);
    return () => controller.abort();
  }, [activeSession?.id, request]);
  const visiblePresenceBeats = useMemo(() => {
    const byResponseId = new Map<string, BotPresenceBeatV1>();
    for (const beat of [
      ...persistedPresenceBeats,
      ...(props.presenceBeats ?? []),
    ]) {
      if (beat.surface === "debate" && beat.sessionId === activeSession?.id) {
        byResponseId.set(beat.responseId, beat);
      }
    }
    return [...byResponseId.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }, [activeSession?.id, persistedPresenceBeats, props.presenceBeats]);
  const liveAudienceSessionId = activeSession?.id ?? null;
  const liveAudienceCastKey = activeSession
    ? [
        activeSession.moderator.id,
        activeSession.forAdvocate.id,
        activeSession.againstAdvocate.id,
        ...activeSession.jury.jurors.map((juror) => juror.id),
      ].join("\0")
    : "";
  const liveAudienceBots = useMemo(
    () =>
      liveAudienceSessionId && activeSession
        ? debateAudienceBotsForSession({
            sessionId: liveAudienceSessionId,
            count: debateAudienceBotCount(props.graphicsQuality),
            bots,
            excludedBotIds: liveAudienceCastKey.split("\0"),
            spectatorPrism: debateSpectatorPrismAudienceSeat({
              session: activeSession,
              playerName,
            }),
          })
        : [],
    [
      activeSession,
      bots,
      liveAudienceCastKey,
      liveAudienceSessionId,
      playerName,
      props.graphicsQuality,
    ],
  );
  useEffect(() => {
    if (!activeSession) return;
    for (const botId of [
      activeSession.moderator.id,
      activeSession.forAdvocate.id,
      activeSession.againstAdvocate.id,
      ...activeSession.jury.jurors.map((juror) => juror.id),
    ]) {
      onPrewarmResponseCue?.(botId);
    }
  }, [activeSession, onPrewarmResponseCue]);
  const debateMaterialQuality = useDebateDomPerformance({
    active:
      view === "live" &&
      activeSession !== null &&
      activeSession.status !== "paused",
    graphicsQuality: props.graphicsQuality,
    objectCount:
      liveAudienceBots.length +
      (activeSession?.jury.enabled ? activeSession.jury.jurors.length : 0) +
      3,
  });
  const presentationSuspended = usePrismPresentationSuspended();
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<DebateFormatId>("forum");
  const [formality, setFormality] = useState<DebateFormalityId>("plainspoken");
  const [forumRoundMode, setForumRoundMode] =
    useState<DebateForumRoundMode>("auto");
  const [forumRoundCount, setForumRoundCount] = useState(1);
  const [moderatorTitle, setModeratorTitle] = useState("Moderator");
  const [selectedPresetId, setSelectedPresetId] =
    useState<DebateSetupPresetId>("public-forum");
  const [slates, setSlates] = useState<DebateMotionSlateV1[]>([]);
  const [motion, setMotion] = useState<DebateMotionSlateV1>(EMPTY_SLATE);
  const [cast, setCast] = useState(() =>
    debatePlayerJudgePrefilledCast(props.initialBotIds),
  );
  const [activeCastSlot, setActiveCastSlot] =
    useState<DebateCastSlot>("forAdvocate");
  const [castPickerSearch, setCastPickerSearch] = useState("");
  const [castPickerGroupId, setCastPickerGroupId] = useState("all");
  const [playerRole, setPlayerRole] = useState<DebatePlayerRole>("judge");
  const [juryEnabled, setJuryEnabled] = useState(false);
  const [playerSideId, setPlayerSideId] = useState<DebateSideId>("for");
  const [roleChecks, setRoleChecks] = useState<DebateAdvocacyConsent[]>([]);
  const [evidence, setEvidence] =
    useState<DebateEvidencePacketV1>(EMPTY_EVIDENCE);
  const [researchQuery, setResearchQuery] = useState("");
  const [scholarQuery, setScholarQuery] = useState("");
  const [urlEvidenceDraft, setUrlEvidenceDraft] =
    useState<DebateUrlEvidenceDraft | null>(null);
  const [urlEvidenceInspecting, setUrlEvidenceInspecting] = useState(false);
  const [urlEvidenceError, setUrlEvidenceError] = useState<string | null>(null);
  const [evidenceObjectSeed, setEvidenceObjectSeed] = useState("");
  const [evidenceObjectDraft, setEvidenceObjectDraft] =
    useState<DebateEvidenceObjectDraft | null>(null);
  const [evidenceEmojiSearchOpen, setEvidenceEmojiSearchOpen] = useState(false);
  const [evidenceEmojiSearchQuery, setEvidenceEmojiSearchQuery] = useState("");
  const evidenceEmojiTriggerRef = useRef<HTMLButtonElement | null>(null);
  const evidenceEmojiSearchResults = useMemo(
    () => searchDebateEvidenceEmojis(evidenceEmojiSearchQuery),
    [evidenceEmojiSearchQuery],
  );
  const [evidenceObjectSuggestionBusy, setEvidenceObjectSuggestionBusy] =
    useState(false);
  const [evidenceObjectVisualBusy, setEvidenceObjectVisualBusy] = useState<
    "upload" | "synthesize" | null
  >(null);
  const evidenceExhibitUploadRef = useRef<HTMLInputElement | null>(null);
  const evidenceItemTotal = debateEvidenceItemCount(evidence);
  const evidenceItemLimitReached =
    evidenceItemTotal >= DEBATE_EVIDENCE_ITEM_MAX_COUNT;
  const [playerDraft, setPlayerDraft] = useState("");
  const [turnaboutObjecting, setTurnaboutObjecting] = useState(false);
  const [turnaboutEvidenceSourceId, setTurnaboutEvidenceSourceId] =
    useState("");
  const [judgeTarget, setJudgeTarget] = useState<DebateSideId>("for");
  const [sourceDrawerId, setSourceDrawerId] = useState<string | null>(null);
  const [transcriptCopyState, setTranscriptCopyState] =
    useState<DebateClipboardState>("idle");
  const [juryRecordCopyState, setJuryRecordCopyState] =
    useState<DebateClipboardState>("idle");
  const [juryRecordCopySessionId, setJuryRecordCopySessionId] = useState<
    string | null
  >(null);
  const [debriefTargetBotId, setDebriefTargetBotId] = useState<string | null>(
    null,
  );
  const [debriefMessages, setDebriefMessages] = useState<
    DebateDebriefChatMessageV1[]
  >([]);
  const [debriefDraft, setDebriefDraft] = useState("");
  const [debriefBusy, setDebriefBusy] = useState(false);
  const [debriefError, setDebriefError] = useState<string | null>(null);
  const [synopsisPreparingSessionId, setSynopsisPreparingSessionId] = useState<
    string | null
  >(null);
  const debateSynopsisRequestIdsRef = useRef(new Set<string>());
  const [playedJuryCommentIds, setPlayedJuryCommentIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [pendingDeleteSession, setPendingDeleteSession] =
    useState<DebateSessionListItemV1 | null>(null);
  const [earlyEndOpen, setEarlyEndOpen] = useState(false);
  const [deleteUndo, setDeleteUndo] = useState<DebateDeleteUndo | null>(null);
  const [transcriptAtLive, setTranscriptAtLive] = useState(true);
  const [liveCaptionsEnabled, setLiveCaptionsEnabled] = useState(
    DEFAULT_DEBATE_LIVE_CAPTIONS_ENABLED,
  );
  const presentationStore = useMemo(createDebatePresentationStore, []);
  const activeSessionIdRef = useRef<string | null>(activeSession?.id ?? null);
  useEffect(() => {
    activeSessionIdRef.current = activeSession?.id ?? null;
  }, [activeSession?.id]);
  // Consent is lane-bound: LOCAL↔ONLINE must re-check so a weaker lane cannot
  // rubber-stamp a stronger floor.
  const advocacyConsentPrivacyLaneRef = useRef(props.responseMode);
  useEffect(() => {
    if (advocacyConsentPrivacyLaneRef.current === props.responseMode) return;
    advocacyConsentPrivacyLaneRef.current = props.responseMode;
    setRoleChecks([]);
  }, [props.responseMode]);
  const [liveReveal, setLiveRevealState] = useState<DebateLiveReveal | null>(
    null,
  );
  const replaceLiveReveal = useCallback(
    (next: DebateLiveReveal | null, renderBoundary = true): void => {
      if (next) {
        presentationStore.replace({
          sessionId: activeSessionIdRef.current,
          eventId: next.eventId,
          visibleContent: next.visibleContent,
          speechTiming: next.speechTiming ?? null,
        });
      } else {
        presentationStore.clear(activeSessionIdRef.current);
      }
      if (renderBoundary) setLiveRevealState(next);
    },
    [presentationStore],
  );
  const updateLiveReveal = useCallback(
    (
      update: (current: DebateLiveReveal | null) => DebateLiveReveal | null,
      renderBoundary = true,
    ): void => {
      const snapshot = presentationStore.getSnapshot();
      const current =
        snapshot.eventId === null
          ? null
          : {
              eventId: snapshot.eventId,
              visibleContent: snapshot.visibleContent,
              speechTiming: snapshot.speechTiming,
            };
      replaceLiveReveal(update(current), renderBoundary);
    },
    [presentationStore, replaceLiveReveal],
  );
  const [
    transcriptVisibleThroughSequence,
    setTranscriptVisibleThroughSequence,
  ] = useState<number | null>(null);
  const proceedingsRevealTimersRef = useRef<number[]>([]);
  const clearProceedingsRevealTimers = useCallback((): void => {
    for (const timer of proceedingsRevealTimersRef.current) {
      window.clearTimeout(timer);
    }
    proceedingsRevealTimersRef.current = [];
  }, []);
  const scheduleProceedingsReveal = useCallback(
    (sessionId: string, sequence: number): void => {
      const timer = window.setTimeout(() => {
        proceedingsRevealTimersRef.current =
          proceedingsRevealTimersRef.current.filter((id) => id !== timer);
        setTranscriptVisibleThroughSequence((current) => {
          const next =
            current === null || sequence > current ? sequence : current;
          writeDebateProceedingsCursor(sessionId, next);
          return next;
        });
      }, DEBATE_PROCEEDINGS_STENOGRAPHER_DELAY_MS);
      proceedingsRevealTimersRef.current.push(timer);
    },
    [],
  );
  const [watchElapsedAccumulatedMs, setWatchElapsedAccumulatedMs] = useState(0);
  const [watchElapsedRunningSinceMs, setWatchElapsedRunningSinceMs] = useState<
    number | null
  >(null);
  const watchElapsedSessionIdRef = useRef<string | null>(null);
  const visibleCaseBoard = useMemo(
    () =>
      activeSession
        ? debateCaseBoardAtSequence(
            activeSession,
            transcriptVisibleThroughSequence,
          )
        : [],
    [activeSession, transcriptVisibleThroughSequence],
  );
  useEffect(() => {
    if (!activeSession || view !== "live") {
      setWatchElapsedRunningSinceMs(null);
      return;
    }
    if (watchElapsedSessionIdRef.current !== activeSession.id) {
      watchElapsedSessionIdRef.current = activeSession.id;
      setWatchElapsedAccumulatedMs(readDebateWatchElapsedMs(activeSession.id));
      setWatchElapsedRunningSinceMs(null);
    }
    const awaitingFirstWatch = debateSpectatorAwaitingFirstWatch(activeSession);
    const shouldRun =
      !awaitingFirstWatch &&
      (activeSession.status === "live" ||
        activeSession.status === "waiting_for_player");
    if (shouldRun) {
      setWatchElapsedRunningSinceMs((current) => current ?? Date.now());
      return;
    }
    setWatchElapsedRunningSinceMs((current) => {
      if (current === null) return null;
      setWatchElapsedAccumulatedMs((accumulated) => {
        const next = debateWatchElapsedMs({
          accumulatedMs: accumulated,
          runningSinceMs: current,
          nowMs: Date.now(),
        });
        writeDebateWatchElapsedMs(activeSession.id, next);
        return next;
      });
      return null;
    });
  }, [
    activeSession,
    activeSession?.completedAt,
    activeSession?.events.length,
    activeSession?.id,
    activeSession?.pausedPresentationEventId,
    activeSession?.playerRole,
    activeSession?.status,
    activeSession?.stepKey,
    view,
  ]);
  const [presenting, setPresenting] = useState(false);
  const [interruptCameraView, setInterruptCameraView] =
    useState<DebateCameraView | null>(null);
  const [overlapSpeakingBotIds, setOverlapSpeakingBotIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  /** Evidence left on the chamber table until replaced or discussion moves on. */
  const [tableEvidenceStickyId, setTableEvidenceStickyId] = useState<
    string | null
  >(null);
  const [voicePreparationSpeakerBotId, setVoicePreparationSpeakerBotId] =
    useState<string | null>(null);
  const [liveGavelCue, setLiveGavelCue] =
    useState<DebateModeratorGavelCue | null>(null);
  const [debateIdentPlaying, setDebateIdentPlaying] =
    useState<DebateIdentKind | null>(null);
  const [judgeGavelSmashCue, setJudgeGavelSmashCue] =
    useState<DebateModeratorGavelCue | null>(null);
  const [audienceOrderResponse, setAudienceOrderResponse] =
    useState<DebateAudienceOrderResponse | null>(null);
  const [audiencePressureReset, setAudiencePressureReset] = useState<{
    resetAfterSequence: number;
    sessionId: string;
  } | null>(null);
  const [audienceOrderSaving, setAudienceOrderSaving] = useState(false);
  const [pauseCooldownUntilMs, setPauseCooldownUntilMs] = useState(0);
  const [pauseCooldownTick, setPauseCooldownTick] = useState(0);
  const pauseOrResumeRef = useRef<(() => Promise<void>) | null>(null);
  const pauseInFlightRef = useRef(false);
  const spectatorPresentationSealInFlightRef = useRef<string | null>(null);
  const [judgeGavelCeremony, setJudgeGavelCeremony] =
    useState<DebateJudgeGavelCeremony | null>(null);
  const [judgeGavelMissedCameraView, setJudgeGavelMissedCameraView] = useState<
    "left" | "moderator" | "right" | null
  >(null);
  const [interjectionDraft, setInterjectionDraft] = useState("");
  const [participantInterjectionOpen, setParticipantInterjectionOpen] =
    useState(false);
  const [participantObjectionDraft, setParticipantObjectionDraft] =
    useState("");
  const [judgeGavelDraft, setJudgeGavelDraft] = useState("");
  const [judgeComposerOpen, setJudgeComposerOpen] = useState(false);
  const [judgeComposerGenerating, setJudgeComposerGenerating] = useState(false);
  const [judgeGavelNowMs, setJudgeGavelNowMs] = useState(() => Date.now());
  const [cameraMode, setCameraMode] = useState<DebateCameraMode>("auto");
  const [
    juryDeliberationInFlightSessionId,
    setJuryDeliberationInFlightSessionId,
  ] = useState<string | null>(null);
  const [objectionRulingDecision, setObjectionRulingDecision] =
    useState<DebateObjectionRulingDecision | null>(null);
  const [stageAlignment, setStageAlignment] = useState<DebateStageAlignmentV6>(
    () => copyDebateStageAlignment(DEFAULT_DEBATE_STAGE_ALIGNMENT),
  );
  const [stageAlignmentDraft, setStageAlignmentDraft] =
    useState<DebateStageAlignmentV6>(() =>
      copyDebateStageAlignment(DEFAULT_DEBATE_STAGE_ALIGNMENT),
    );
  const [stageAlignmentOpen, setStageAlignmentOpen] = useState(false);
  const [stageAlignmentPreviewCastIds, setStageAlignmentPreviewCastIds] =
    useState<DebateCastSelection | null>(null);
  const [stageAlignmentSoundCheck, setStageAlignmentSoundCheck] =
    useState<DebateStageSoundCheckState>(null);
  const [stageAlignmentCopyState, setStageAlignmentCopyState] =
    useState<DebateClipboardState>("idle");
  const [stageAlignmentPreviewCamera, setStageAlignmentPreviewCamera] =
    useState<DebateStageEvidenceView>("wide");
  const [stageAlignmentPreviewTheme, setStageAlignmentPreviewTheme] = useState<
    "light" | "dark"
  >(props.theme);
  const [
    stageAlignmentPreviewEvidenceKind,
    setStageAlignmentPreviewEvidenceKind,
  ] = useState<DebateStageEvidenceKind>("exhibit");
  const [
    stageAlignmentPreviewEvidenceEmoji,
    setStageAlignmentPreviewEvidenceEmoji,
  ] = useState(() => pickDebateStageAlignmentEvidenceEmoji());
  const [stageAlignmentGavelCue, setStageAlignmentGavelCue] =
    useState<DebateModeratorGavelCue | null>(null);
  const [stageAlignmentGavelPose, setStageAlignmentGavelPose] =
    useState<DebateStageGavelPose>("lowered");
  const [stageAlignmentGavelPosesLinked, setStageAlignmentGavelPosesLinked] =
    useState(false);
  const [stageAlignmentSelectedItems, setStageAlignmentSelectedItems] =
    useState<Record<DebateStageAlignmentRole, DebateStageAlignmentItem>>({
      for: "bot",
      moderator: "bot",
      against: "bot",
    });
  const [stageAlignmentDraggingTarget, setStageAlignmentDraggingTarget] =
    useState<DebateStageAlignmentTarget | null>(null);
  const [presentationEventId, setPresentationEventId] = useState<string | null>(
    null,
  );
  const [speakerHandoff, setSpeakerHandoff] =
    useState<DebateSpeakerHandoffState | null>(null);
  const [
    audiencePressurePresentationEventId,
    setAudiencePressurePresentationEventId,
  ] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupRestoreLoadingId, setSetupRestoreLoadingId] = useState<
    string | null
  >(null);
  const [setupRestoreNotice, setSetupRestoreNotice] = useState<string | null>(
    null,
  );
  const [autoRecoveryNotice, setAutoRecoveryNotice] = useState<string | null>(
    null,
  );
  const {
    active: debateAmbientBotVocalization,
    start: startDebateAmbientBotVocalization,
    stop: stopDebateAmbientBotVocalization,
    mouthShapeForTarget: debateAmbientBotVocalizationMouthShape,
  } = useAmbientBotVocalization();
  const mutationCounterRef = useRef(0);
  const cameraModeRef = useRef<DebateCameraMode>(cameraMode);
  cameraModeRef.current = cameraMode;
  const selectDebateCameraMode = useCallback(
    (nextCameraMode: DebateCameraMode): void => {
      cameraModeRef.current = nextCameraMode;
      setCameraMode(nextCameraMode);
    },
    [],
  );
  const toggleLiveCaptions = useCallback((): void => {
    setLiveCaptionsEnabled((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        writeDebateLiveCaptionsEnabled(window.localStorage, next);
      }
      return next;
    });
  }, []);
  const debateFloorMutationInFlightRef = useRef(false);
  const preparedTurnRef = useRef<{
    id: string;
    sessionId: string;
    revision: number;
  } | null>(null);
  const presentationRunRef = useRef(0);
  const presentationPlaybackEventIdRef = useRef<string | null>(null);
  const transcriptAutoFollowRef = useRef(true);
  const transcriptUserOwnsViewportRef = useRef(false);
  const transcriptTouchYRef = useRef<number | null>(null);
  const transcriptCopyResetTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const juryRecordCopyResetTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const playedJuryCommentIdsRef = useRef<ReadonlySet<string>>(new Set());
  const stageAlignmentCopyResetTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const judgeGavelSmashCounterRef = useRef(0);
  const judgeGavelSmashUntilRef = useRef(0);
  const judgeGavelSmashShowmanshipKindRef =
    useRef<DebateModeratorGavelCue["kind"]>("order");
  const judgeGavelSmashClearTimerRef = useRef<number | null>(null);
  const audienceOrderResponseCounterRef = useRef(0);
  const audienceOrderResponseClearTimerRef = useRef<number | null>(null);
  const audienceRoomToneReturnTimerRef = useRef<number | null>(null);
  const audienceOrderSavingRef = useRef(false);
  const playedAudienceOrderCueIdsRef = useRef<ReadonlySet<string>>(new Set());
  const previousAudiencePressureBandRef = useRef<{
    band: DebateAudiencePressureBand;
    sessionId: string;
  } | null>(null);
  const judgeGavelCeremonyGateRef = useRef<DebateJudgeGavelCeremonyGate | null>(
    null,
  );
  const requestJudgeGavelCeremonyRef = useRef<
    ((cue: DebateModeratorGavelCue) => Promise<boolean>) | null
  >(null);
  const strikeJudgeGavelCeremonyRef = useRef<(() => void) | null>(null);
  const cancelJudgeGavelCeremonyRef = useRef<(() => void) | null>(null);
  const judgeGavelOvertimeBurstActiveRef = useRef(false);
  const judgeGavelOvertimeStrikeCountRef = useRef(0);
  const suppressNextJudgeGavelPresentationCueRef = useRef(false);
  const judgeGavelKeyboardContextRef = useRef({
    ceremonialAvailable: false,
    interventionAvailable: false,
    liveJudge: false,
    orderAvailable: false,
    blockedNotice: null as string | null,
  });
  const judgeGavelSmashRef = useRef<
    ((kind: DebateModeratorGavelCue["kind"]) => void) | null
  >(null);
  const triggerAudienceOrderResponseRef = useRef<
    | ((args: {
        eventId: string;
        kind: "awkward" | "hush";
        performGavel?: boolean;
        resetAfterSequence: number;
        sessionId: string;
      }) => void)
    | null
  >(null);
  const orderDebateAudienceRef = useRef<(() => Promise<void>) | null>(null);
  const swingJudgeGavelRef = useRef<(() => Promise<void>) | null>(null);
  const objectionRulingDockRef = useRef<HTMLElement | null>(null);
  const participantInterjectionDraftRef = useRef<HTMLTextAreaElement | null>(
    null,
  );
  const participantObjectionReasonRef = useRef<HTMLTextAreaElement | null>(
    null,
  );
  const participantObjectionShortcutEnabledRef = useRef(false);
  const raiseParticipantObjectionRef = useRef<(() => Promise<void>) | null>(
    null,
  );
  const judgeGavelKeyboardBlocked =
    stageAlignmentOpen ||
    sourceDrawerId !== null ||
    earlyEndOpen ||
    pendingDeleteSession !== null;
  const judgeGavelActiveTarget =
    presenting && presentationEventId && activeSession
      ? (activeSession.events.find(
          (event) => event.id === presentationEventId,
        ) ?? null)
      : null;
  const judgeGavelActiveTargetClock =
    judgeGavelActiveTarget && liveReveal?.eventId === judgeGavelActiveTarget.id
      ? debateTurnClockState(
          judgeGavelActiveTarget,
          liveReveal.speechTiming ?? null,
        )
      : null;
  const judgeCanCallTimeNow =
    judgeGavelActiveTarget?.speakerKind === "advocate" &&
    judgeGavelActiveTargetClock?.status === "overtime";
  const currentJudgeGavelCooldownUntilMs = Date.parse(
    activeSession?.judgeGavelCooldownUntil ?? "",
  );
  const currentJudgeGavelCooldownRemainingMs = Math.max(
    0,
    (Number.isFinite(currentJudgeGavelCooldownUntilMs)
      ? currentJudgeGavelCooldownUntilMs
      : 0) - judgeGavelNowMs || 0,
  );
  const judgeGavelInterventionOnCooldownNow = debateJudgeGavelCooldownBlocks({
    overtime: judgeCanCallTimeNow,
    cooldownRemainingMs: currentJudgeGavelCooldownRemainingMs,
  });
  const currentAudiencePressureScore = activeSession
    ? debateAudiencePressureScore({
        events: activeSession.events,
        formality: activeSession.formality,
        playerRole: activeSession.playerRole,
        visibleThroughSequence: presenting
          ? (judgeGavelActiveTarget?.sequence ??
            transcriptVisibleThroughSequence)
          : transcriptVisibleThroughSequence,
        activeEventId:
          audiencePressurePresentationEventId ?? liveReveal?.eventId ?? null,
        visibleCharacterCount:
          audiencePressurePresentationEventId &&
          liveReveal?.eventId !== audiencePressurePresentationEventId
            ? 0
            : (liveReveal?.visibleContent.length ?? 0),
        resetAfterSequence:
          audiencePressureReset?.sessionId === activeSession.id
            ? audiencePressureReset.resetAfterSequence
            : null,
        reactionForEvent: (event) =>
          debateAudienceBeatForEvent({
            event,
            publicContent: event.content,
            seatCount: debateAudienceBotCount(props.graphicsQuality),
            maxReactingSeats: debateAudienceMaxReactingSeats(
              debateMaterialQuality,
              "contention",
            ),
          })?.listenerReaction ?? null,
      })
    : 0;
  const currentAudiencePressureBand = debateAudiencePressureBand(
    currentAudiencePressureScore,
  );
  const participantOpponentSpeechActive =
    view === "live" &&
    activeSession?.format === "forum" &&
    activeSession.playerRole === "participant" &&
    activeSession.status === "live" &&
    !activeSession.participantObjection &&
    presenting &&
    speakerHandoff === null &&
    judgeGavelActiveTarget?.kind === "speech" &&
    judgeGavelActiveTarget.speakerKind === "advocate" &&
    judgeGavelActiveTarget.sideId !== null &&
    judgeGavelActiveTarget.sideId !== activeSession.playerSideId &&
    judgeGavelActiveTarget.interrupted !== true &&
    liveReveal?.eventId === judgeGavelActiveTarget.id;
  const participantFloorBreakReady =
    participantOpponentSpeechActive &&
    liveReveal.visibleContent.length >= 24 &&
    liveReveal.visibleContent.length < judgeGavelActiveTarget.content.length;
  const participantObjectionShortcutEnabled =
    participantFloorBreakReady &&
    !busy &&
    !debateFloorMutationInFlightRef.current &&
    !judgeGavelKeyboardBlocked;
  participantObjectionShortcutEnabledRef.current =
    participantObjectionShortcutEnabled;
  const judgeGavelJuryLocked =
    debateJudgeGavelLockedForJury(activeSession) ||
    judgeGavelActiveTarget?.speakerKind === "juror";
  const judgeGavelKeyboardLive =
    view === "live" &&
    activeSession?.playerRole === "judge" &&
    activeSession.status !== "completed" &&
    activeSession.status !== "failed" &&
    activeSession.status !== "cancelled" &&
    activeSession.status !== "paused" &&
    !judgeGavelJuryLocked &&
    activeSession.objectionRuling?.status !== "awaiting_ruling" &&
    !judgeGavelKeyboardBlocked;
  const judgeGavelInterventionEligibleNow =
    judgeGavelKeyboardLive &&
    presenting &&
    speakerHandoff === null &&
    judgeGavelActiveTarget?.speakerKind === "advocate" &&
    !judgeGavelInterventionOnCooldownNow;
  const judgeGavelInterventionAvailableNow =
    judgeGavelInterventionEligibleNow &&
    !busy &&
    !debateFloorMutationInFlightRef.current;
  const judgeGavelShortcutBlockedNotice =
    view !== "live" ||
    activeSession?.playerRole !== "judge" ||
    judgeGavelKeyboardBlocked
      ? null
      : judgeGavelJuryLocked
        ? "The gavel is unavailable while the Jury has the floor."
        : activeSession.status === "paused"
          ? "Resume the Debate before striking the gavel."
          : activeSession.objectionRuling?.status === "awaiting_ruling"
            ? "Rule Sustained or Overruled before striking the gavel again."
            : activeSession.judgeGavel?.status === "awaiting_message"
              ? "Finish or pass on the current Judge intervention first."
              : busy ||
                  audienceOrderSavingRef.current ||
                  debateFloorMutationInFlightRef.current
                ? "The gavel is resetting—try again in a moment."
                : null;
  judgeGavelKeyboardContextRef.current = {
    ceremonialAvailable:
      !judgeGavelJuryLocked &&
      activeSession?.objectionRuling?.status !== "awaiting_ruling" &&
      judgeGavelCeremony?.status === "ready",
    interventionAvailable: judgeGavelInterventionAvailableNow,
    liveJudge: judgeGavelKeyboardLive,
    orderAvailable:
      judgeGavelKeyboardLive &&
      !busy &&
      !audienceOrderSavingRef.current &&
      activeSession?.judgeGavel?.status !== "awaiting_message",
    blockedNotice: judgeGavelShortcutBlockedNotice,
  };

  useEffect(() => {
    if (!autoRecoveryNotice) return;
    const timeout = window.setTimeout(() => setAutoRecoveryNotice(null), 5_200);
    return () => window.clearTimeout(timeout);
  }, [autoRecoveryNotice]);

  useEffect(() => {
    const cooldownUntil = Date.parse(
      activeSession?.judgeGavelCooldownUntil ?? "",
    );
    if (!Number.isFinite(cooldownUntil) || cooldownUntil <= Date.now()) {
      return;
    }
    // One-shot unlock when cooling ends — countdown UI ticks in a leaf.
    const timeout = window.setTimeout(
      () => setJudgeGavelNowMs(Date.now()),
      Math.max(0, cooldownUntil - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [activeSession?.judgeGavelCooldownUntil]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const nowMs = Date.now();
      const context = judgeGavelKeyboardContextRef.current;
      const target = event.target instanceof Element ? event.target : null;
      const gavelShortcutTarget = target?.closest<HTMLElement>(
        '[data-space-shortcut="true"]',
      );
      const editableTarget = Boolean(
        !gavelShortcutTarget &&
        target?.closest(
          'input, textarea, select, button, a[href], [contenteditable="true"], [role="button"], [role="textbox"]',
        ),
      );
      const action = debateJudgeGavelSpaceAction({
        code: event.code,
        hasModifier:
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
        editableTarget,
        ceremonialAvailable: context.ceremonialAvailable,
        interventionAvailable: context.interventionAvailable,
        liveJudge: context.liveJudge,
        orderAvailable: context.orderAvailable,
        nowMs,
        smashUntilMs: judgeGavelSmashUntilRef.current,
      });
      if (!action) {
        if (
          event.code === "Space" &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !editableTarget &&
          context.blockedNotice
        ) {
          event.preventDefault();
          setAutoRecoveryNotice(context.blockedNotice);
        }
        return;
      }
      event.preventDefault();
      gavelShortcutTarget?.blur();
      if (action === "cue") {
        strikeJudgeGavelCeremonyRef.current?.();
        return;
      }
      if (action === "smash") {
        judgeGavelSmashRef.current?.(judgeGavelSmashShowmanshipKindRef.current);
        return;
      }
      if (action === "intervene") {
        void swingJudgeGavelRef.current?.();
        return;
      }
      void orderDebateAudienceRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.key.toLocaleLowerCase() !== "o" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !participantObjectionShortcutEnabledRef.current
      ) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          'input, textarea, select, button, a[href], [contenteditable="true"], [role="button"], [role="textbox"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      void raiseParticipantObjectionRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    setJudgeComposerOpen(false);
    setJudgeComposerGenerating(false);
  }, [activeSession?.id, activeSession?.stepKey]);
  useEffect(() => {
    playedAudienceOrderCueIdsRef.current = new Set();
    previousAudiencePressureBandRef.current = null;
    setAudienceOrderResponse(null);
    setAudiencePressureReset(null);
    setTableEvidenceStickyId(null);
    if (audienceOrderResponseClearTimerRef.current !== null) {
      window.clearTimeout(audienceOrderResponseClearTimerRef.current);
      audienceOrderResponseClearTimerRef.current = null;
    }
    if (audienceRoomToneReturnTimerRef.current !== null) {
      window.clearTimeout(audienceRoomToneReturnTimerRef.current);
      audienceRoomToneReturnTimerRef.current = null;
    }
  }, [activeSession?.id]);
  useEffect(() => {
    if (!activeSession) {
      setTableEvidenceStickyId(null);
      return;
    }
    const presentedEvent =
      presenting && presentationEventId
        ? (activeSession.events.find(
            (event) => event.id === presentationEventId,
          ) ?? null)
        : null;
    setTableEvidenceStickyId((previous) =>
      resolveDebateTableEvidenceStickyId({
        previousStickyId: previous,
        activeEvent: presentedEvent,
        presenting,
        evidence: activeSession.evidence,
        visibleContent:
          presentedEvent && liveReveal?.eventId === presentedEvent.id
            ? liveReveal.visibleContent
            : undefined,
      }),
    );
  }, [activeSession, liveReveal, presenting, presentationEventId]);
  useEffect(() => {
    const session = activeSession;
    if (
      !session ||
      session.status === "completed" ||
      session.status === "cancelled" ||
      session.status === "failed" ||
      session.status === "paused" ||
      debateJudgeGavelLockedForJury(session)
    ) {
      previousAudiencePressureBandRef.current = null;
      return;
    }
    const previous = previousAudiencePressureBandRef.current;
    previousAudiencePressureBandRef.current = {
      band: currentAudiencePressureBand,
      sessionId: session.id,
    };
    if (
      previous?.sessionId !== session.id ||
      previous.band === "disruptive" ||
      currentAudiencePressureBand !== "disruptive" ||
      !props.audioEnabled ||
      props.audioVolume <= 0
    ) {
      return;
    }
    debateAtmosphereControllerRef.current?.playFoley(
      DEBATE_AUDIENCE_AGITATION_URL,
      {
        trim: 0.78,
        lowCutHz: 90,
        highCutHz: 8_200,
        stereoPan: 0.04,
        tag: `debate-audience-agitation:${session.id}:${session.revision}`,
      },
    );
  }, [
    activeSession,
    currentAudiencePressureBand,
    props.audioEnabled,
    props.audioVolume,
  ]);
  useEffect(() => {
    setParticipantInterjectionOpen(false);
  }, [activeSession?.id, presentationEventId]);
  useEffect(() => {
    if (!participantInterjectionOpen || !participantFloorBreakReady || busy) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      participantInterjectionDraftRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [busy, participantFloorBreakReady, participantInterjectionOpen]);
  const deleteUndoResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const transcriptFollowFrameRef = useRef<number | null>(null);
  const speechRevealRunRef = useRef<{
    frameId: number | null;
    cancel: () => void;
  } | null>(null);
  const transcriptFeedRef = useRef<HTMLDivElement | null>(null);
  const transcriptContentRef = useRef<HTMLDivElement | null>(null);
  const deleteConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const earlyEndConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const sourceDrawerCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const sourceDrawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const stageAlignmentSaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const stageAlignmentDragRef = useRef<DebateStageAlignmentDrag | null>(null);
  const stageAlignmentGavelPreviewCounterRef = useRef(0);
  const stageAlignmentSoundCheckRunRef = useRef(0);
  const stageAlignmentAtmosphereControllerRef =
    useRef<SessionAtmosphereController | null>(null);
  const debateAtmosphereControllerRef =
    useRef<SessionAtmosphereController | null>(null);
  const audienceReactionFoleyUntilRef = useRef(0);
  const audienceReactionFoleyStartsRef = useRef(0);
  const lastAudiencePerfKeyRef = useRef("");

  useEffect(() => {
    if (!presenting || !activeSession) return;
    const pressure = currentAudiencePressureBand;
    const visual = pressure
      ? debateAudienceVisualPressureBand(pressure, debateMaterialQuality)
      : null;
    const talkers = visual
      ? debateAudienceTalkerIndices({
          band: visual,
          count: debateAudienceBotCount(props.graphicsQuality),
          seed: `${activeSession.id}:${visual}`,
        }).length
      : 0;
    const key = `${activeSession.id}:${debateMaterialQuality}:${visual}:${talkers}:${audienceReactionFoleyStartsRef.current}`;
    if (key === lastAudiencePerfKeyRef.current) return;
    lastAudiencePerfKeyRef.current = key;
    logDebateAudiencePerfSnapshot({
      materialQuality: debateMaterialQuality,
      pressureBand: visual,
      reactingSeatCount: debateAudienceMaxReactingSeats(
        debateMaterialQuality,
        "contention",
      ),
      ambientTalkerCount: talkers,
      reactionFoleyStarts: audienceReactionFoleyStartsRef.current,
    });
  }, [
    activeSession,
    currentAudiencePressureBand,
    debateMaterialQuality,
    presenting,
    props.graphicsQuality,
  ]);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Allow speech only on the live floor, or during a paused pause/resume
    // ceremony. Settled recess and the Debate menu must be fully silent.
    const allowSpeechAudio =
      view === "live" &&
      (activeSession?.status === "live" ||
        activeSession?.status === "waiting_for_player" ||
        (activeSession?.status === "paused" && presenting));
    if (allowSpeechAudio && props.audioEnabled && props.audioVolume > 0) {
      debateAtmosphereControllerRef.current?.setPresentationSuspended(
        false,
        80,
      );
      return;
    }
    stopDebateAmbientBotVocalization();
    if (!allowSpeechAudio) {
      props.onStopUtterance?.();
      void stopDebateIdentAudio();
      debateAtmosphereControllerRef.current?.setPresentationSuspended(true, 60);
    }
  }, [
    activeSession?.status,
    presenting,
    props.audioEnabled,
    props.audioVolume,
    props.onStopUtterance,
    stopDebateAmbientBotVocalization,
    view,
  ]);

  const nextMutationKey = useCallback((label: string): string => {
    mutationCounterRef.current += 1;
    return mutationKey(label, mutationCounterRef.current);
  }, []);

  const loadSessions = useCallback(async (): Promise<void> => {
    try {
      const result = await request<{
        sessions: DebateSessionListItemV1[];
      }>("/api/debates");
      if (mountedRef.current) setSessions(result.sessions);
    } catch (caught) {
      if (mountedRef.current) {
        setError(
          caught instanceof Error ? caught.message : "Could not load Debates.",
        );
      }
    }
  }, [request]);

  useEffect(() => {
    mountedRef.current = true;
    void loadSessions();
    return () => {
      mountedRef.current = false;
      presentationRunRef.current += 1;
      presentationStore.clear();
      void stopDebateIdentAudio();
      onStopUtterance?.();
      if (transcriptCopyResetTimerRef.current) {
        clearTimeout(transcriptCopyResetTimerRef.current);
        transcriptCopyResetTimerRef.current = null;
      }
      if (juryRecordCopyResetTimerRef.current) {
        clearTimeout(juryRecordCopyResetTimerRef.current);
        juryRecordCopyResetTimerRef.current = null;
      }
      if (stageAlignmentCopyResetTimerRef.current) {
        clearTimeout(stageAlignmentCopyResetTimerRef.current);
        stageAlignmentCopyResetTimerRef.current = null;
      }
      if (judgeGavelSmashClearTimerRef.current) {
        clearTimeout(judgeGavelSmashClearTimerRef.current);
        judgeGavelSmashClearTimerRef.current = null;
      }
      if (audienceOrderResponseClearTimerRef.current !== null) {
        clearTimeout(audienceOrderResponseClearTimerRef.current);
        audienceOrderResponseClearTimerRef.current = null;
      }
      if (audienceRoomToneReturnTimerRef.current !== null) {
        clearTimeout(audienceRoomToneReturnTimerRef.current);
        audienceRoomToneReturnTimerRef.current = null;
      }
      const ceremonyGate = judgeGavelCeremonyGateRef.current;
      if (ceremonyGate) {
        if (ceremonyGate.cueTimer !== null) {
          clearTimeout(ceremonyGate.cueTimer);
        }
        if (ceremonyGate.cameraTimer !== null) {
          clearTimeout(ceremonyGate.cameraTimer);
        }
        if (ceremonyGate.settleTimer !== null) {
          clearTimeout(ceremonyGate.settleTimer);
        }
        judgeGavelCeremonyGateRef.current = null;
        ceremonyGate.resolve(false);
      }
      if (deleteUndoResetTimerRef.current) {
        clearTimeout(deleteUndoResetTimerRef.current);
        deleteUndoResetTimerRef.current = null;
      }
      if (transcriptFollowFrameRef.current !== null) {
        window.cancelAnimationFrame(transcriptFollowFrameRef.current);
        transcriptFollowFrameRef.current = null;
      }
      if (speechRevealRunRef.current) {
        if (speechRevealRunRef.current.frameId !== null) {
          window.cancelAnimationFrame(speechRevealRunRef.current.frameId);
        }
        speechRevealRunRef.current.cancel();
        speechRevealRunRef.current = null;
      }
    };
  }, [loadSessions, onStopUtterance, presentationStore]);
  useEffect(() => {
    if (view === "live" && props.audioEnabled && props.audioVolume > 0) {
      setDebateIdentAudioVolume(props.audioVolume);
      return;
    }
    setDebateIdentPlaying(null);
    void stopDebateIdentAudio();
  }, [props.audioEnabled, props.audioVolume, view]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readDebateStageAlignment(
      window.localStorage,
      props.storageScopeId,
    );
    setStageAlignment(stored);
    setStageAlignmentDraft(copyDebateStageAlignment(stored));
  }, [props.storageScopeId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setLiveCaptionsEnabled(readDebateLiveCaptionsEnabled(window.localStorage));
  }, []);
  useEffect(() => {
    if (!stageAlignmentOpen) return;
    const frameId = window.requestAnimationFrame(() => {
      stageAlignmentSaveButtonRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      stageAlignmentDragRef.current = null;
      setStageAlignmentDraggingTarget(null);
      setStageAlignmentDraft(copyDebateStageAlignment(stageAlignment));
      setStageAlignmentGavelCue(null);
      stageAlignmentSoundCheckRunRef.current += 1;
      if (stageAlignmentSoundCheck?.status === "playing") {
        onStopUtterance?.();
      }
      setStageAlignmentSoundCheck(null);
      setStageAlignmentOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    onStopUtterance,
    stageAlignment,
    stageAlignmentOpen,
    stageAlignmentSoundCheck?.status,
  ]);

  const liveSessionActive =
    view === "live" &&
    activeSession !== null &&
    activeSession.status !== "paused";
  useEffect(() => {
    onLiveSessionActiveChange?.(liveSessionActive);
  }, [liveSessionActive, onLiveSessionActiveChange]);
  useEffect(
    () => () => onLiveSessionActiveChange?.(false),
    [onLiveSessionActiveChange],
  );

  const botById = useMemo(
    () => new Map(bots.map((bot) => [bot.id, bot])),
    [bots],
  );
  const stageAlignmentCastCandidates = useMemo(() => {
    const audible = bots.filter((bot) => !bot.hardMuted);
    return audible.length >= 3 ? audible : bots;
  }, [bots]);
  const stageAlignmentCanOpen =
    new Set(stageAlignmentCastCandidates.map((bot) => bot.id)).size >= 3;
  const stageAlignmentPreviewCast = useMemo(() => {
    if (!stageAlignmentPreviewCastIds) return null;
    const moderator = botById.get(stageAlignmentPreviewCastIds.moderator);
    const forAdvocate = botById.get(stageAlignmentPreviewCastIds.forAdvocate);
    const againstAdvocate = botById.get(
      stageAlignmentPreviewCastIds.againstAdvocate,
    );
    if (!moderator || !forAdvocate || !againstAdvocate) return null;
    return { moderator, forAdvocate, againstAdvocate };
  }, [botById, stageAlignmentPreviewCastIds]);
  const selectedEvidence = sourceDrawerId
    ? ((activeSession
        ? debateEvidenceItemById(activeSession.evidence, sourceDrawerId)
        : null) ?? debateEvidenceItemById(evidence, sourceDrawerId))
    : null;
  useEffect(() => {
    if (!sourceDrawerId) return;
    sourceDrawerReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frameId = window.requestAnimationFrame(() => {
      sourceDrawerCloseButtonRef.current?.focus();
    });
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSourceDrawerId(null);
        return;
      }
      if (event.key !== "Tab") return;
      const drawer =
        sourceDrawerCloseButtonRef.current?.closest<HTMLElement>(
          '[role="dialog"]',
        ) ?? null;
      if (!drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
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
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", handleKeyDown);
      sourceDrawerReturnFocusRef.current?.focus();
      sourceDrawerReturnFocusRef.current = null;
    };
  }, [sourceDrawerId]);
  const activeSessionId = activeSession?.id ?? null;
  const activeSessionEventCount = activeSession?.events.length ?? 0;
  const pendingJuryComment = activeSession
    ? debateLatestPendingJuryComment(activeSession, playedJuryCommentIds)
    : null;
  const pendingJuryThoughtBotId = pendingJuryComment?.speakerBotId ?? null;
  const effectiveCameraMode = activeSession
    ? debateCameraModeForSession(cameraMode, activeSession)
    : cameraMode;
  const cameraPresentationEvent =
    activeSession && presentationEventId
      ? (activeSession.events.find(
          (event) => event.id === presentationEventId,
        ) ?? null)
      : null;
  const juryCameraActive = activeSession
    ? debateJuryCameraIsActive(effectiveCameraMode, activeSession, {
        presenting,
        event: cameraPresentationEvent,
        preparingSpeakerBotId: voicePreparationSpeakerBotId,
      })
    : false;
  const introCameraStateRef = useRef<{
    eventId: string | null;
    wideHoldStartedAtMs: number | null;
    focusedSide: DebateModeratorCameraFocus;
  }>({
    eventId: null,
    wideHoldStartedAtMs: null,
    focusedSide: null,
  });
  const [introCameraView, setIntroCameraView] =
    useState<DebateModeratorCameraView | null>(null);
  const [introCameraTick, setIntroCameraTick] = useState(0);
  useEffect(() => {
    const session = activeSession;
    const event = cameraPresentationEvent;
    if (
      !session ||
      view !== "live" ||
      !presenting ||
      !event ||
      !debateEventIsModeratorMonologue(event) ||
      (effectiveCameraMode !== "auto" && effectiveCameraMode !== "jury")
    ) {
      introCameraStateRef.current = {
        eventId: null,
        wideHoldStartedAtMs: null,
        focusedSide: null,
      };
      setIntroCameraView(null);
      return;
    }
    if (introCameraStateRef.current.eventId !== event.id) {
      introCameraStateRef.current = {
        eventId: event.id,
        wideHoldStartedAtMs: null,
        focusedSide: null,
      };
    }
    const visibleLength =
      liveReveal?.eventId === event.id ? liveReveal.visibleContent.length : 0;
    const resolved = resolveDebateModeratorCameraView({
      content: event.content,
      visibleLength,
      forName: session.forAdvocate.name,
      againstName: session.againstAdvocate.name,
      nowMs: Date.now(),
      wideHoldStartedAtMs: introCameraStateRef.current.wideHoldStartedAtMs,
      focusedSide: introCameraStateRef.current.focusedSide,
    });
    introCameraStateRef.current = {
      eventId: event.id,
      wideHoldStartedAtMs: resolved.wideHoldStartedAtMs,
      focusedSide: resolved.focusedSide,
    };
    setIntroCameraView(resolved.view);
    if (
      resolved.view === "wide" &&
      resolved.wideHoldStartedAtMs !== null
    ) {
      const holdMs =
        typeof resolved.focusedSide === "string" &&
        resolved.focusedSide.startsWith("breath:")
          ? DEBATE_MODERATOR_BREATH_WIDE_MS
          : DEBATE_INTRO_WIDE_HOLD_MS;
      const remainingMs = holdMs - (Date.now() - resolved.wideHoldStartedAtMs);
      const timer = window.setTimeout(
        () => setIntroCameraTick((tick) => tick + 1),
        Math.max(16, remainingMs),
      );
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [
    activeSession,
    cameraPresentationEvent,
    effectiveCameraMode,
    introCameraTick,
    liveReveal,
    presenting,
    view,
  ]);
  useEffect(() => {
    const empty = new Set<string>();
    playedJuryCommentIdsRef.current = empty;
    setPlayedJuryCommentIds(empty);
    setJuryRecordCopyState("idle");
    setJuryRecordCopySessionId(null);
  }, [activeSessionId]);
  const clampTranscriptToLive = useCallback((): void => {
    const feed = transcriptFeedRef.current;
    if (!feed) return;
    feed.scrollTop = Math.max(0, feed.scrollHeight - feed.clientHeight);
    transcriptAutoFollowRef.current = true;
    transcriptUserOwnsViewportRef.current = false;
    setTranscriptAtLive(true);
  }, []);
  useLayoutEffect(() => {
    transcriptAutoFollowRef.current = true;
    transcriptUserOwnsViewportRef.current = false;
    setTranscriptAtLive(true);
  }, [activeSessionId]);
  useLayoutEffect(() => {
    if (!transcriptAutoFollowRef.current) return;
    const frameId = window.requestAnimationFrame(() => {
      clampTranscriptToLive();
      transcriptFollowFrameRef.current = window.requestAnimationFrame(() => {
        clampTranscriptToLive();
        transcriptFollowFrameRef.current = null;
      });
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      if (transcriptFollowFrameRef.current !== null) {
        window.cancelAnimationFrame(transcriptFollowFrameRef.current);
        transcriptFollowFrameRef.current = null;
      }
    };
  }, [
    activeSessionEventCount,
    activeSessionId,
    busy,
    clampTranscriptToLive,
    liveReveal?.visibleContent.length,
  ]);
  useEffect(() => {
    const feed = transcriptFeedRef.current;
    const content = transcriptContentRef.current;
    if (!feed || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (transcriptAutoFollowRef.current) clampTranscriptToLive();
    });
    observer.observe(feed);
    observer.observe(content);
    return () => observer.disconnect();
  }, [activeSessionId, clampTranscriptToLive]);
  useEffect(() => {
    if (!pendingDeleteSession) return;
    const frameId = window.requestAnimationFrame(() => {
      deleteConfirmButtonRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPendingDeleteSession(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pendingDeleteSession]);
  useEffect(() => {
    if (!earlyEndOpen) return;
    const frameId = window.requestAnimationFrame(() => {
      earlyEndConfirmButtonRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setEarlyEndOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [earlyEndOpen]);

  const copyVerboseTranscript = useCallback(async (): Promise<void> => {
    if (!activeSession || transcriptCopyState === "copying") return;
    if (transcriptCopyResetTimerRef.current) {
      clearTimeout(transcriptCopyResetTimerRef.current);
      transcriptCopyResetTimerRef.current = null;
    }
    setTranscriptCopyState("copying");
    try {
      const presenceBeats = await request<{ beats: BotPresenceBeatV1[] }>(
        `/api/presence-beats?surface=debate&sessionId=${encodeURIComponent(activeSession.id)}`,
      )
        .then((response) => response.beats)
        .catch(() => []);
      await writeDebateClipboardText(
        formatDebateVerboseTranscript(activeSession, playerName, presenceBeats),
      );
      setTranscriptCopyState("copied");
    } catch {
      setTranscriptCopyState("failed");
    }
    transcriptCopyResetTimerRef.current = setTimeout(() => {
      setTranscriptCopyState("idle");
      transcriptCopyResetTimerRef.current = null;
    }, 1_800);
  }, [activeSession, playerName, request, transcriptCopyState]);

  const copyJuryRecordForTarget = useCallback(
    async (
      sessionId: string,
      loadSession: () => Promise<DebateSessionV1>,
    ): Promise<void> => {
      if (juryRecordCopyState === "copying") return;
      if (juryRecordCopyResetTimerRef.current) {
        clearTimeout(juryRecordCopyResetTimerRef.current);
        juryRecordCopyResetTimerRef.current = null;
      }
      setJuryRecordCopySessionId(sessionId);
      setJuryRecordCopyState("copying");
      try {
        const session = await loadSession();
        if (session.playerRole === "participant" || !session.jury.enabled) {
          throw new Error("Jury record unavailable.");
        }
        await writeDebateClipboardText(formatDebateJuryRecord(session));
        setJuryRecordCopyState("copied");
      } catch {
        setJuryRecordCopyState("failed");
      }
      juryRecordCopyResetTimerRef.current = setTimeout(() => {
        setJuryRecordCopyState("idle");
        setJuryRecordCopySessionId(null);
        juryRecordCopyResetTimerRef.current = null;
      }, 1_800);
    },
    [juryRecordCopyState],
  );

  const copyJuryRecord = useCallback(async (): Promise<void> => {
    if (!activeSession || activeSession.playerRole === "participant") return;
    await copyJuryRecordForTarget(activeSession.id, async () => activeSession);
  }, [activeSession, copyJuryRecordForTarget]);

  const clearDebateDebrief = useCallback((): void => {
    setDebriefTargetBotId(null);
    setDebriefMessages([]);
    setDebriefDraft("");
    setDebriefError(null);
    setDebriefBusy(false);
  }, []);

  useEffect(() => {
    if (
      !activeSession ||
      activeSession.status !== "completed" ||
      activeSession.synopsis?.text
    ) {
      if (
        synopsisPreparingSessionId &&
        activeSession?.synopsis?.text &&
        synopsisPreparingSessionId === activeSession.id
      ) {
        setSynopsisPreparingSessionId(null);
      }
      return;
    }
    const sessionId = activeSession.id;
    if (debateSynopsisRequestIdsRef.current.has(sessionId)) return;
    debateSynopsisRequestIdsRef.current.add(sessionId);
    setSynopsisPreparingSessionId(sessionId);
    let cancelled = false;
    void (async () => {
      try {
        const result = await request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(sessionId)}/synopsis`,
          {
            method: "POST",
            body: JSON.stringify({
              preferredProvider,
              ...(props.modelOverride
                ? {
                    modelOverride: props.modelOverride.model,
                    responseMode: props.responseMode,
                  }
                : { responseMode: props.responseMode }),
            }),
          },
        );
        if (cancelled) return;
        setActiveSession((current) =>
          current?.id === sessionId ? result.session : current,
        );
        setSessions((current) =>
          current.map((entry) =>
            entry.id === sessionId
              ? {
                  ...entry,
                  synopsisText: result.session.synopsis?.text ?? null,
                }
              : entry,
          ),
        );
        setSynopsisPreparingSessionId((current) =>
          current === sessionId ? null : current,
        );
      } catch (caught) {
        debateSynopsisRequestIdsRef.current.delete(sessionId);
        if (!cancelled) {
          setSynopsisPreparingSessionId((current) =>
            current === sessionId ? null : current,
          );
          console.warn("[debate] session synopsis failed", caught);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeSession,
    preferredProvider,
    props.modelOverride,
    props.responseMode,
    request,
    synopsisPreparingSessionId,
  ]);

  const sendDebateDebrief = useCallback(async (): Promise<void> => {
    if (!activeSession || !debriefTargetBotId || debriefBusy) return;
    const content = debriefDraft.trim();
    if (!content) return;
    const sessionId = activeSession.id;
    const userMessage: DebateDebriefChatMessageV1 = {
      id: `debrief-user:${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const history = debriefMessages;
    setDebriefMessages((current) => [...current, userMessage]);
    setDebriefDraft("");
    setDebriefBusy(true);
    setDebriefError(null);
    try {
      const result = await request<{ message: DebateDebriefChatMessageV1 }>(
        `/api/debates/${encodeURIComponent(sessionId)}/debrief-chat`,
        {
          method: "POST",
          body: JSON.stringify({
            targetBotId: debriefTargetBotId,
            content,
            messages: history.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            preferredProvider,
          }),
        },
      );
      setDebriefMessages((current) => [...current, result.message]);
    } catch (caught) {
      setDebriefError(
        caught instanceof Error
          ? caught.message
          : "That cast member could not answer.",
      );
    } finally {
      setDebriefBusy(false);
    }
  }, [
    activeSession,
    debriefBusy,
    debriefDraft,
    debriefMessages,
    debriefTargetBotId,
    preferredProvider,
    request,
  ]);

  const juryRecordCopyLabel = (sessionId: string): string => {
    const state =
      juryRecordCopySessionId === sessionId ? juryRecordCopyState : "idle";
    if (state === "copying") return "Copying…";
    if (state === "copied") return "Copied";
    if (state === "failed") return "Copy failed";
    return "Copy Jury transcript";
  };

  const playerJudgeBot: DebateBotSummary = {
    ...DEBATE_PLAYER_JUDGE_PRISM,
    name: playerName,
  };
  const playerParticipantBot: DebateBotSummary = {
    ...DEBATE_PLAYER_PARTICIPANT_PRISM,
    name: playerName,
  };
  const moderatorBot =
    playerRole === "judge"
      ? playerJudgeBot
      : (botById.get(cast.moderator) ?? null);
  const effectiveModeratorTitle = normalizeDebateModeratorTitle(moderatorTitle);
  const visibleModeratorTitle =
    playerRole === "participant"
      ? debateParticipantModeratorTitle(effectiveModeratorTitle)
      : effectiveModeratorTitle;
  const effectiveModeratorBotId = moderatorBot?.id ?? cast.moderator;
  const participantPlayerCastSlot: DebateCastSlot =
    playerSideId === "against" ? "againstAdvocate" : "forAdvocate";
  const participantOpponentCastSlot: DebateCastSlot =
    playerSideId === "against" ? "forAdvocate" : "againstAdvocate";
  const selectableCastSlots: readonly DebateCastSlot[] =
    playerRole === "judge"
      ? ["forAdvocate", "againstAdvocate"]
      : playerRole === "participant"
        ? ["moderator", participantOpponentCastSlot]
        : ["moderator", "forAdvocate", "againstAdvocate"];
  const effectiveActiveCastSlot = selectableCastSlots.includes(activeCastSlot)
    ? activeCastSlot
    : selectableCastSlots[0];
  const castIds =
    playerRole === "participant"
      ? [effectiveModeratorBotId, cast[participantOpponentCastSlot]]
      : [effectiveModeratorBotId, cast.forAdvocate, cast.againstAdvocate];
  const castComplete =
    castIds.every(Boolean) && new Set(castIds).size === castIds.length;
  const motionComplete = Boolean(
    motion.motion.trim() &&
    motion.forSide.label.trim() &&
    motion.forSide.brief.trim() &&
    motion.againstSide.label.trim() &&
    motion.againstSide.brief.trim(),
  );
  const motionReveal = debateMotionRevealState(topic, motion);
  const moderatorHardMuted = moderatorBot?.hardMuted === true;
  const mutedAdvocateIds =
    playerRole === "participant"
      ? [cast[participantOpponentCastSlot]]
      : [cast.forAdvocate, cast.againstAdvocate];
  const mutedAdvocates = mutedAdvocateIds
    .map((id) => botById.get(id))
    .filter((bot): bot is DebateBotSummary => bot?.hardMuted === true);
  const declinedChecks = roleChecks.filter(
    (check) => check.status === "decline",
  );
  const expectedRoleCheckCount = playerRole === "participant" ? 1 : 2;
  const roleChecksComplete =
    roleChecks.length === expectedRoleCheckCount && declinedChecks.length === 0;
  const debateCanStart =
    motionComplete &&
    castComplete &&
    roleChecksComplete &&
    evidenceDecisionMade &&
    !(playerRole === "participant" && format !== "forum");
  const selectedPreset = DEBATE_SETUP_PRESETS.find(
    (preset) => preset.id === selectedPresetId,
  )!;
  const formalityDescriptor = debateFormalityDescriptor(formality);
  const rowdinessIndex = DEBATE_ROWDINESS_SPECTRUM.findIndex(
    (level) => level.id === formality,
  );
  const rowdinessProgress =
    (Math.max(0, rowdinessIndex) /
      Math.max(1, DEBATE_ROWDINESS_SPECTRUM.length - 1)) *
    100;
  const effectivePresetId = derivedDebateSetupPresetId({
    selectedPresetId,
    format,
    formality,
    playerRole,
    juryEnabled,
  });
  const forumRoundPlan = resolveDebateForumRoundPlan({
    mode: forumRoundMode,
    count: forumRoundCount,
    motion,
    evidence,
  });
  const readinessCount = [
    motionComplete,
    castComplete,
    roleChecksComplete,
    evidenceDecisionMade,
  ].filter(Boolean).length;
  const debateCompanionBotIds = useMemo(
    () =>
      (playerRole === "participant"
        ? [effectiveModeratorBotId, cast[participantOpponentCastSlot]]
        : [effectiveModeratorBotId, cast.forAdvocate, cast.againstAdvocate]
      ).filter((botId): botId is string =>
        Boolean(
          botId &&
          botId !== DEBATE_PLAYER_JUDGE_BOT_ID &&
          botId !== DEBATE_PLAYER_PARTICIPANT_BOT_ID,
        ),
      ),
    [cast, effectiveModeratorBotId, participantOpponentCastSlot, playerRole],
  );
  const debateCompanionDraft = useMemo<PrismCompanionDebateDraft>(
    () => ({
      studioPanel,
      format,
      formality,
      playerRole,
      playerSideId,
      juryEnabled,
      moderatorTitle: effectiveModeratorTitle,
      topic,
      motion: motion.motion,
      forLabel: motion.forSide.label,
      forBrief: motion.forSide.brief,
      againstLabel: motion.againstSide.label,
      againstBrief: motion.againstSide.brief,
      exhibitAdjective: evidenceObjectDraft?.adjective ?? "",
      exhibitObject: evidenceObjectDraft?.object ?? "",
      exhibitObservation: evidenceObjectDraft?.observation ?? "",
      evidenceItemCount: debateEvidenceItemCount(evidence),
    }),
    [
      effectiveModeratorTitle,
      evidence,
      evidenceObjectDraft?.adjective,
      evidenceObjectDraft?.object,
      evidenceObjectDraft?.observation,
      formality,
      format,
      juryEnabled,
      motion.againstSide.brief,
      motion.againstSide.label,
      motion.forSide.brief,
      motion.forSide.label,
      motion.motion,
      playerRole,
      playerSideId,
      studioPanel,
      topic,
    ],
  );
  useEffect(() => {
    if (view !== "dashboard") {
      onCompanionContextChange?.(null);
      return;
    }
    onCompanionContextChange?.({
      draft: debateCompanionDraft,
      botIds: debateCompanionBotIds,
    });
  }, [
    debateCompanionBotIds,
    debateCompanionDraft,
    onCompanionContextChange,
    view,
  ]);
  useEffect(
    () => () => onCompanionContextChange?.(null),
    [onCompanionContextChange],
  );
  const debatePickerGroups = useMemo<BotPickerGroup[]>(() => {
    const availableIds = new Set(bots.map((bot) => bot.id));
    return [
      {
        id: "all",
        name: "All bots",
        botIds: bots.map((bot) => bot.id),
        count: bots.length,
      },
      ...botGroups
        .map((group) => {
          const groupBotIds = group.botIds.filter((botId) =>
            availableIds.has(botId),
          );
          return {
            ...group,
            botIds: groupBotIds,
            count: groupBotIds.length,
          };
        })
        .filter((group) => group.botIds.length > 0),
    ];
  }, [botGroups, bots]);
  const effectiveCastPickerGroupId = debatePickerGroups.some(
    (group) => group.id === castPickerGroupId,
  )
    ? castPickerGroupId
    : "all";
  const visibleCastBots = useMemo(
    () =>
      filterBotPickerItems(
        bots,
        castPickerSearch,
        effectiveCastPickerGroupId,
        debatePickerGroups,
      ),
    [bots, castPickerSearch, debatePickerGroups, effectiveCastPickerGroupId],
  );

  const startNewDebate = (): void => {
    setView("dashboard");
    setStudioPanel("motion");
    setRoomTuningOpen(false);
    setMotionTuningOpen(false);
    setCastTuningOpen(false);
    setEvidenceDecisionMade(false);
    setActiveSession(null);
    setDebriefTargetBotId(null);
    setDebriefMessages([]);
    setDebriefDraft("");
    setDebriefError(null);
    setDebriefBusy(false);
    setSynopsisPreparingSessionId(null);
    setTopic("");
    setFormat("forum");
    setForumRoundMode("auto");
    setForumRoundCount(1);
    setFormality("plainspoken");
    setModeratorTitle("Moderator");
    setSelectedPresetId("public-forum");
    setSlates([]);
    setMotion(EMPTY_SLATE);
    setCast(debatePlayerJudgePrefilledCast(props.initialBotIds));
    setActiveCastSlot("forAdvocate");
    setCastPickerSearch("");
    setCastPickerGroupId("all");
    setPlayerRole("judge");
    setJuryEnabled(false);
    setPlayerSideId("for");
    setRoleChecks([]);
    setEvidence(EMPTY_EVIDENCE);
    setResearchQuery("");
    setScholarQuery("");
    setEvidenceObjectSeed("");
    setEvidenceObjectDraft(null);
    setPlayerDraft("");
    setTurnaboutObjecting(false);
    setTurnaboutEvidenceSourceId("");
    setSetupRestoreLoadingId(null);
    setSetupRestoreNotice(null);
    setError(null);
  };

  const chooseFormality = (nextFormality: DebateFormalityId): void => {
    if (nextFormality === formality) return;
    setFormality(nextFormality);
    setMotion((current) => ({ ...current, title: undefined }));
    setRoleChecks([]);
  };

  const applyPreset = (presetId: DebateSetupPresetId): void => {
    const next = applyDebateSetupPreset(
      { format, formality, playerRole, juryEnabled, roleChecks },
      presetId,
    );
    setSelectedPresetId(presetId);
    setFormat(next.format);
    setFormality(next.formality);
    if (next.formality !== formality) {
      setMotion((current) => ({ ...current, title: undefined }));
    }
    setPlayerRole(next.playerRole);
    if (next.playerRole === "participant") {
      const playerSlot =
        playerSideId === "against" ? "againstAdvocate" : "forAdvocate";
      setCast((current) => ({ ...current, [playerSlot]: "" }));
    }
    setActiveCastSlot(
      next.playerRole === "judge"
        ? "forAdvocate"
        : next.playerRole === "participant" && cast.moderator
          ? participantOpponentCastSlot
          : "moderator",
    );
    setJuryEnabled(next.juryEnabled);
    setRoleChecks(next.roleChecks);
  };

  const assignBotToCastSlot = (slot: DebateCastSlot, botId: string): void => {
    if (!selectableCastSlots.includes(slot)) return;
    const bot = botById.get(botId);
    if (!bot) return;
    const duplicateSlot = selectableCastSlots.find(
      (candidate) => candidate !== slot && cast[candidate] === botId,
    );
    if (duplicateSlot) return;
    const nextCast = { ...cast, [slot]: botId };
    setCast(nextCast);
    setRoleChecks([]);
    const slotOrder = [...selectableCastSlots];
    const activeIndex = slotOrder.indexOf(slot);
    const nextIncomplete = [
      ...slotOrder.slice(activeIndex + 1),
      ...slotOrder.slice(0, activeIndex + 1),
    ].find((candidate) => !nextCast[candidate]);
    if (nextIncomplete) setActiveCastSlot(nextIncomplete);
  };

  const clearCastSlot = (slot: DebateCastSlot): void => {
    if (!selectableCastSlots.includes(slot)) return;
    setCast((current) => ({ ...current, [slot]: "" }));
    setRoleChecks([]);
    setActiveCastSlot(slot);
  };

  const randomizeCast = (): void => {
    const nextCast =
      playerRole === "spectator"
        ? randomDebateCast(bots.map((bot) => bot.id))
        : randomDebatePlayerJudgeCast(bots.map((bot) => bot.id));
    if (!nextCast) return;
    setCast((current) => {
      if (playerRole === "judge") {
        return { ...nextCast, moderator: current.moderator };
      }
      if (playerRole === "participant") {
        return {
          ...current,
          moderator: nextCast.forAdvocate,
          [participantPlayerCastSlot]: "",
          [participantOpponentCastSlot]: nextCast.againstAdvocate,
        };
      }
      return nextCast;
    });
    setRoleChecks([]);
    setActiveCastSlot(
      playerRole === "judge"
        ? "forAdvocate"
        : playerRole === "participant"
          ? participantOpponentCastSlot
          : "moderator",
    );
  };

  const stopStageAlignmentSoundCheck = (): void => {
    stageAlignmentSoundCheckRunRef.current += 1;
    if (stageAlignmentSoundCheck?.status === "playing") {
      onStopUtterance?.();
    }
    setStageAlignmentSoundCheck(null);
  };

  const randomizeStageAlignmentPreviewCast = (): boolean => {
    const randomized = debateAlignmentPreviewCast(
      stageAlignmentCastCandidates.map((bot) => bot.id),
    );
    if (!randomized) {
      setError(
        "Create at least three Library bots to calibrate the Debate stage.",
      );
      return false;
    }
    const previewIds =
      stageAlignmentPreviewCastIds &&
      randomized.moderator === stageAlignmentPreviewCastIds.moderator &&
      randomized.forAdvocate === stageAlignmentPreviewCastIds.forAdvocate &&
      randomized.againstAdvocate ===
        stageAlignmentPreviewCastIds.againstAdvocate
        ? {
            moderator: randomized.forAdvocate,
            forAdvocate: randomized.againstAdvocate,
            againstAdvocate: randomized.moderator,
          }
        : randomized;
    setStageAlignmentPreviewCastIds(previewIds);
    return true;
  };

  const openStageAlignment = (): void => {
    if (!DEBATE_STAGE_ALIGNMENT_ENABLED) return;
    if (!randomizeStageAlignmentPreviewCast()) return;
    setStageAlignmentDraft(copyDebateStageAlignment(stageAlignment));
    setStageAlignmentPreviewCamera("wide");
    setStageAlignmentPreviewTheme(props.theme);
    setStageAlignmentPreviewEvidenceEmoji(
      pickDebateStageAlignmentEvidenceEmoji(),
    );
    setStageAlignmentGavelCue(null);
    setStageAlignmentGavelPose("lowered");
    setStageAlignmentGavelPosesLinked(false);
    setStageAlignmentSoundCheck(null);
    setStageAlignmentCopyState("idle");
    setStageAlignmentSelectedItems({
      for: "bot",
      moderator: "bot",
      against: "bot",
    });
    setStageAlignmentDraggingTarget(null);
    stageAlignmentDragRef.current = null;
    setStageAlignmentOpen(true);
  };

  const cancelStageAlignment = (): void => {
    stopStageAlignmentSoundCheck();
    setStageAlignmentDraft(copyDebateStageAlignment(stageAlignment));
    setStageAlignmentGavelCue(null);
    setStageAlignmentGavelPose("lowered");
    setStageAlignmentGavelPosesLinked(false);
    setStageAlignmentCopyState("idle");
    setStageAlignmentDraggingTarget(null);
    stageAlignmentDragRef.current = null;
    setStageAlignmentOpen(false);
  };

  const saveStageAlignment = (): void => {
    const normalized = normalizeDebateStageAlignment(stageAlignmentDraft);
    try {
      stopStageAlignmentSoundCheck();
      writeDebateStageAlignment(
        window.localStorage,
        props.storageScopeId,
        normalized,
      );
      setStageAlignment(normalized);
      setStageAlignmentDraft(copyDebateStageAlignment(normalized));
      setStageAlignmentGavelCue(null);
      setStageAlignmentGavelPose("lowered");
      setStageAlignmentGavelPosesLinked(false);
      setStageAlignmentOpen(false);
    } catch {
      setError("Debate stage alignment could not be saved on this device.");
    }
  };

  const copyStageAlignmentData = async (): Promise<void> => {
    if (stageAlignmentCopyState === "copying") return;
    if (stageAlignmentCopyResetTimerRef.current) {
      clearTimeout(stageAlignmentCopyResetTimerRef.current);
      stageAlignmentCopyResetTimerRef.current = null;
    }
    setStageAlignmentCopyState("copying");
    try {
      await writeDebateClipboardText(
        formatDebateStageAlignmentClipboard(stageAlignmentDraft),
      );
      setStageAlignmentCopyState("copied");
    } catch {
      setStageAlignmentCopyState("failed");
    }
    stageAlignmentCopyResetTimerRef.current = setTimeout(() => {
      setStageAlignmentCopyState("idle");
      stageAlignmentCopyResetTimerRef.current = null;
    }, 1_800);
  };

  const copyStageGavelData = async (): Promise<void> => {
    if (stageAlignmentCopyState === "copying") return;
    if (stageAlignmentCopyResetTimerRef.current) {
      clearTimeout(stageAlignmentCopyResetTimerRef.current);
      stageAlignmentCopyResetTimerRef.current = null;
    }
    setStageAlignmentCopyState("copying");
    try {
      await writeDebateClipboardText(
        formatDebateStageGavelClipboard(stageAlignmentDraft.gavel),
      );
      setStageAlignmentCopyState("copied");
    } catch {
      setStageAlignmentCopyState("failed");
    }
    stageAlignmentCopyResetTimerRef.current = setTimeout(() => {
      setStageAlignmentCopyState("idle");
      stageAlignmentCopyResetTimerRef.current = null;
    }, 1_800);
  };

  const copyStageEvidenceTableData = async (): Promise<void> => {
    if (stageAlignmentCopyState === "copying") return;
    if (stageAlignmentCopyResetTimerRef.current) {
      clearTimeout(stageAlignmentCopyResetTimerRef.current);
      stageAlignmentCopyResetTimerRef.current = null;
    }
    setStageAlignmentCopyState("copying");
    try {
      await writeDebateClipboardText(
        formatDebateStageEvidenceTableClipboard(
          stageAlignmentDraft.evidenceTable,
        ),
      );
      setStageAlignmentCopyState("copied");
    } catch {
      setStageAlignmentCopyState("failed");
    }
    stageAlignmentCopyResetTimerRef.current = setTimeout(() => {
      setStageAlignmentCopyState("idle");
      stageAlignmentCopyResetTimerRef.current = null;
    }, 1_800);
  };

  const previewStageAlignmentGavel = (
    kind: DebateModeratorGavelCue["kind"],
  ): void => {
    stageAlignmentGavelPreviewCounterRef.current += 1;
    setStageAlignmentGavelCue({
      eventId: `alignment-preview:${stageAlignmentGavelPreviewCounterRef.current}`,
      kind,
    });
  };

  const previewStageAlignmentVoice = async (
    role: DebateStageAlignmentRole,
    bot: DebateBotSummary,
    soundCheckFormat: DebateFormatId,
  ): Promise<void> => {
    if (
      !onUtterance ||
      !props.audioEnabled ||
      props.audioVolume <= 0 ||
      bot.hardMuted
    ) {
      return;
    }
    if (
      stageAlignmentSoundCheck?.role === role &&
      stageAlignmentSoundCheck.status === "playing"
    ) {
      stopStageAlignmentSoundCheck();
      return;
    }

    stageAlignmentSoundCheckRunRef.current += 1;
    const runId = stageAlignmentSoundCheckRunRef.current;
    onStopUtterance?.();
    setStageAlignmentSoundCheck({
      role,
      status: "playing",
      speechTiming: null,
    });
    const sideId =
      role === "for" ? "for" : role === "against" ? "against" : null;
    const soundCheckSessionId = `${DEBATE_STAGE_SOUNDCHECK_MESSAGE_PREFIX}${props.storageScopeId}:${runId}`;
    const spokenText = `Sound check. ${bot.name}, ${DEBATE_STAGE_ALIGNMENT_LABELS[role]}, standing by.`;
    const createdAt = new Date().toISOString();
    let playbackAlignment: VoicePlaybackCharacterAlignment | null = null;
    let playbackDurationMs = Math.max(1, debateRevealDurationMs(spokenText));
    let lastSpeechRenderAt = 0;
    const updateSpeechTiming = (
      elapsedMs: number,
      durationMs: number,
    ): void => {
      if (stageAlignmentSoundCheckRunRef.current !== runId) return;
      setStageAlignmentSoundCheck((current) =>
        current?.role === role && current.status === "playing"
          ? {
              ...current,
              speechTiming: {
                text: spokenText,
                elapsedMs: Math.min(durationMs, Math.max(0, elapsedMs)),
                durationMs,
                alignment: playbackAlignment,
              },
            }
          : current,
      );
    };
    const played = await onUtterance({
      event: {
        version: DEBATE_SCHEMA_VERSION,
        id: `${soundCheckSessionId}:${role}`,
        sequence: 0,
        phase: "opening",
        stepKey: "alignment_sound_check",
        kind: "speech",
        speakerKind: role === "moderator" ? "moderator" : "advocate",
        speakerBotId: bot.id,
        sideId,
        content: spokenText,
        sourceIds: [],
        createdAt,
      },
      format: soundCheckFormat,
      sessionId: soundCheckSessionId,
      speaker: bot,
      player: false,
      playerVoice: false,
      spokenText,
      voiceSourceBotId: bot.id,
      lifecycle: {
        onStart: (durationMs, alignment) => {
          if (stageAlignmentSoundCheckRunRef.current !== runId) return;
          playbackAlignment = alignment ?? null;
          playbackDurationMs = Math.max(1, durationMs ?? playbackDurationMs);
          lastSpeechRenderAt = performance.now();
          updateSpeechTiming(0, playbackDurationMs);
        },
        onProgress: (elapsedMs, durationMs) => {
          if (stageAlignmentSoundCheckRunRef.current !== runId) return;
          playbackDurationMs = Math.max(1, durationMs);
          const now = performance.now();
          if (
            elapsedMs < playbackDurationMs &&
            now - lastSpeechRenderAt < DEBATE_LIVE_SPEECH_RENDER_INTERVAL_MS
          ) {
            return;
          }
          lastSpeechRenderAt = now;
          updateSpeechTiming(elapsedMs, playbackDurationMs);
        },
        onEnd: () => {
          updateSpeechTiming(playbackDurationMs, playbackDurationMs);
        },
        onCancel: () => {
          if (stageAlignmentSoundCheckRunRef.current !== runId) return;
          setStageAlignmentSoundCheck(null);
        },
      },
    });
    if (stageAlignmentSoundCheckRunRef.current !== runId) return;
    setStageAlignmentSoundCheck(
      played ? null : { role, status: "unavailable", speechTiming: null },
    );
  };

  const stageAlignmentTargetForRole = (
    role: DebateStageAlignmentRole,
    item: DebateStageAlignmentItem = stageAlignmentSelectedItems[role],
  ): DebateStageAlignmentTarget =>
    debateStageAlignmentTarget(
      role,
      item,
      stageAlignmentPreviewCamera === "moderator" ? "moderator" : "wide",
    );

  const updateStageAlignmentTarget = (
    target: DebateStageAlignmentTarget,
    update: Partial<DebateStageOffsetV1>,
  ): void => {
    setStageAlignmentDraft((current) =>
      updateDebateStageAlignmentOffset(current, target, update),
    );
  };

  const beginStageAlignmentDrag = (
    event: ReactPointerEvent<HTMLElement>,
    role: DebateStageAlignmentRole,
    item: DebateStageAlignmentItem,
  ): void => {
    if (event.button !== 0) return;
    const stage = event.currentTarget.closest<HTMLElement>(
      '[data-debate-alignment-stage="true"]',
    );
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = stageAlignmentTargetForRole(role, item);
    stageAlignmentDragRef.current = {
      pointerId: event.pointerId,
      role,
      item,
      target,
      startClientX: event.clientX,
      startClientY: event.clientY,
      stageWidth: bounds.width,
      stageHeight: bounds.height,
      startAlignment: copyDebateStageAlignment(stageAlignmentDraft),
    };
    setStageAlignmentSelectedItems((current) => ({
      ...current,
      [role]: item,
    }));
    setStageAlignmentDraggingTarget(target);
  };

  const moveStageAlignmentDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const drag = stageAlignmentDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const start = debateStageAlignmentOffset(drag.startAlignment, drag.target);
    setStageAlignmentDraft(
      updateDebateStageAlignmentOffset(drag.startAlignment, drag.target, {
        x:
          start.x +
          ((event.clientX - drag.startClientX) / drag.stageWidth) * 100,
        y:
          start.y +
          ((event.clientY - drag.startClientY) / drag.stageHeight) * 100,
      }),
    );
  };

  const finishStageAlignmentDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const drag = stageAlignmentDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stageAlignmentDragRef.current = null;
    setStageAlignmentDraggingTarget(null);
  };

  const nudgeStageAlignmentItem = (
    event: ReactKeyboardEvent<HTMLElement>,
    role: DebateStageAlignmentRole,
    item: DebateStageAlignmentItem,
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
    const step = DEBATE_STAGE_ALIGNMENT_STEP * (event.shiftKey ? 4 : 1);
    const target = stageAlignmentTargetForRole(role, item);
    setStageAlignmentSelectedItems((current) => ({
      ...current,
      [role]: item,
    }));
    const offset = debateStageAlignmentOffset(stageAlignmentDraft, target);
    updateStageAlignmentTarget(target, {
      x: offset.x + direction[0]! * step,
      y: offset.y + direction[1]! * step,
    });
  };

  const expandDebateSeedDraft = useCallback(
    async (rawDraft: string): Promise<string> =>
      (await expandComposerDraft?.(rawDraft)) ?? rawDraft,
    [expandComposerDraft],
  );

  const generateDebateRefractField = useCallback(
    async (
      kind: PrismRefractDebateTextTargetKind,
      currentValue: string,
      rejectedValues: readonly string[],
      signal: AbortSignal,
    ): Promise<string> => {
      const resolvedTopic = await expandDebateSeedDraft(
        debateCompanionDraft.topic,
      );
      const resolvedCurrentValue =
        kind === "debate.setup.topic"
          ? await expandDebateSeedDraft(currentValue)
          : currentValue;
      const response = await request<PrismRefractResponse>(
        "/api/prism/refract",
        {
          method: "POST",
          body: JSON.stringify({
            target: {
              kind,
              context: {
                ...debateCompanionDraft,
                topic: resolvedTopic,
              },
              botIds: debateCompanionBotIds,
            },
            currentValue: resolvedCurrentValue,
            rejectedValues,
            preferredProvider:
              props.modelOverride?.provider ?? preferredProvider,
            modelOverride: props.modelOverride?.model,
            responseMode: props.responseMode,
          }),
          signal,
        },
      );
      return response.value;
    },
    [
      debateCompanionBotIds,
      debateCompanionDraft,
      expandDebateSeedDraft,
      preferredProvider,
      props.modelOverride?.model,
      props.modelOverride?.provider,
      props.responseMode,
      request,
    ],
  );

  const synthesize = useCallback(
    async (direction = ""): Promise<void> => {
      const resolvedTopic = (await expandDebateSeedDraft(topic)).trim();
      if (!resolvedTopic || busy) return;
      setBusy(true);
      setError(null);
      try {
        const result = await request<{ slates: DebateMotionSlateV1[] }>(
          "/api/debates/synthesize",
          requestBody({
            topic: resolvedTopic,
            formality,
            preferredProvider:
              props.modelOverride?.provider ?? preferredProvider,
            modelOverride: props.modelOverride?.model,
            responseMode: props.responseMode,
            direction,
          }),
        );
        setSlates(result.slates);
        setMotion(result.slates[0] ?? EMPTY_SLATE);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Synthesis was unavailable.",
        );
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      expandDebateSeedDraft,
      preferredProvider,
      props.modelOverride?.model,
      props.modelOverride?.provider,
      props.responseMode,
      request,
      formality,
      topic,
    ],
  );

  const synthesisMagic = useMemo<PrismRefractMagicTarget>(
    () => ({
      id: "debate:synthesize-motion-options",
      label: "Synthesize debate options",
      kind: "magic",
      disabled: () => !topic.trim() || busy,
      run: (direction) => synthesize(direction),
    }),
    [busy, synthesize, topic],
  );

  const selectSlate = (slate: DebateMotionSlateV1): void => {
    setMotion(copyDebateMotionSlate(slate));
    setRoleChecks([]);
  };

  const checkRoles = async (): Promise<void> => {
    if (!castComplete) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ checks: DebateAdvocacyConsent[] }>(
        "/api/debates/role-checks",
        requestBody({
          format,
          formality,
          motion,
          playerRole,
          playerSideId: playerRole === "participant" ? playerSideId : null,
          forAdvocateBotId:
            playerRole === "participant" && playerSideId === "for"
              ? undefined
              : cast.forAdvocate,
          againstAdvocateBotId:
            playerRole === "participant" && playerSideId === "against"
              ? undefined
              : cast.againstAdvocate,
          preferredProvider:
            props.modelOverride?.provider ?? props.preferredProvider,
          modelOverride: props.modelOverride?.model,
          responseMode: props.responseMode,
        }),
      );
      setRoleChecks(result.checks);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The private role check was unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };

  const swapAdvocates = (): void => {
    if (playerRole === "participant") return;
    setCast((current) => ({
      ...current,
      forAdvocate: current.againstAdvocate,
      againstAdvocate: current.forAdvocate,
    }));
    setRoleChecks([]);
  };

  const selectPlayerRole = (role: DebatePlayerRole): void => {
    if (role === "participant" && format !== "forum") return;
    setPlayerRole(role);
    setRoleChecks([]);
    if (role === "participant") {
      setCast((current) => ({
        ...current,
        [participantPlayerCastSlot]: "",
      }));
      setActiveCastSlot(
        cast.moderator ? participantOpponentCastSlot : "moderator",
      );
      return;
    }
    const nextSlots: readonly DebateCastSlot[] =
      role === "judge"
        ? ["forAdvocate", "againstAdvocate"]
        : ["moderator", "forAdvocate", "againstAdvocate"];
    setActiveCastSlot(nextSlots.find((slot) => !cast[slot]) ?? nextSlots[0]);
  };

  const selectParticipantSide = (sideId: DebateSideId): void => {
    if (sideId === playerSideId) return;
    const currentOpponentSlot: DebateCastSlot =
      playerSideId === "against" ? "forAdvocate" : "againstAdvocate";
    const nextPlayerSlot: DebateCastSlot =
      sideId === "against" ? "againstAdvocate" : "forAdvocate";
    const nextOpponentSlot: DebateCastSlot =
      sideId === "against" ? "forAdvocate" : "againstAdvocate";
    setCast((current) => ({
      ...current,
      [nextPlayerSlot]: "",
      [nextOpponentSlot]: current[currentOpponentSlot],
    }));
    setPlayerSideId(sideId);
    setRoleChecks([]);
    setActiveCastSlot(cast.moderator ? nextOpponentSlot : "moderator");
  };

  const research = async (sourceType: "web" | "scholar"): Promise<void> => {
    const query = (
      sourceType === "scholar" ? scholarQuery : researchQuery
    ).trim();
    if (!query || props.responseMode === "local" || evidenceItemLimitReached) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{
        sources: DebateEvidenceSourceV1[];
      }>(
        "/api/debates/research",
        requestBody({
          query,
          sourceType,
          preferredProvider: props.preferredProvider,
          responseMode: props.responseMode,
        }),
      );
      setEvidence((current) => ({
        ...current,
        sources: mergeDebateEvidenceSources(
          current.sources,
          result.sources,
        ).slice(
          0,
          Math.max(
            0,
            DEBATE_EVIDENCE_ITEM_MAX_COUNT - (current.exhibits?.length ?? 0),
          ),
        ),
      }));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Research was unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };

  const inspectUrlEvidence = async (): Promise<void> => {
    const draft = urlEvidenceDraft;
    if (!draft?.url.trim() || urlEvidenceInspecting) return;
    setUrlEvidenceInspecting(true);
    setUrlEvidenceError(null);
    try {
      const result = await props.request<{
        source: Omit<DebateEvidenceSourceV1, "id">;
        fetched: boolean;
      }>(
        "/api/debates/sources/inspect",
        requestBody({
          url: draft.url,
          preferredProvider: props.preferredProvider,
          responseMode: props.responseMode,
        }),
      );
      setUrlEvidenceDraft((current) =>
        current
          ? {
              url: result.source.url,
              title: result.source.title,
              snippet: result.source.snippet,
              publishedAt: result.source.publishedAt,
              fetched: result.fetched,
            }
          : null,
      );
      if (!result.fetched) {
        setUrlEvidenceError(
          "LOCAL did not access this page. Add a title and summarize what the debaters should use.",
        );
      }
    } catch (caught) {
      setUrlEvidenceError(
        caught instanceof Error
          ? caught.message
          : "PRISM could not read this source. You can enter its details manually.",
      );
    } finally {
      setUrlEvidenceInspecting(false);
    }
  };

  const commitUrlEvidence = (): void => {
    if (!urlEvidenceDraft) return;
    const result = debateUrlEvidenceSourceFromDraft({
      draft: urlEvidenceDraft,
      current: evidence.sources,
      itemLimitReached: evidenceItemLimitReached,
    });
    if (!result.source) {
      setUrlEvidenceError(result.error);
      return;
    }
    setEvidence((current) => ({
      ...current,
      sources: mergeDebateEvidenceSources(current.sources, [result.source]),
    }));
    setUrlEvidenceDraft(null);
    setUrlEvidenceError(null);
  };

  const openUrlEvidenceEditor = (): void => {
    setUrlEvidenceDraft((current) => current ?? emptyDebateUrlEvidenceDraft());
    setUrlEvidenceError(null);
  };

  const closeUrlEvidenceEditor = (): void => {
    if (urlEvidenceInspecting) return;
    setUrlEvidenceDraft(null);
    setUrlEvidenceError(null);
  };

  const draftEvidenceObject = useCallback(
    async (): Promise<void> => {
      const seed = evidenceObjectSeed.trim();
      if (
        !seed ||
        evidenceItemLimitReached ||
        evidenceObjectSuggestionBusy ||
        evidenceObjectVisualBusy
      ) {
        return;
      }
      const rejectedTitles = (evidence.exhibits ?? []).map(
        (exhibit) => exhibit.title,
      );
      setEvidenceEmojiSearchOpen(false);
      setEvidenceObjectSuggestionBusy(true);
      setError(null);
      try {
        const candidate = await generateDebateRefractField(
          "debate.setup.exhibitDraft",
          seed,
          rejectedTitles,
          new AbortController().signal,
        );
        const contextualDraft =
          debateEvidenceObjectDraftFromPrismCandidate(candidate);
        if (!contextualDraft) {
          throw new Error("Prism returned an incomplete exhibit.");
        }
        setEvidenceObjectDraft(contextualDraft);
        setEvidenceObjectSeed("");
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Prism could not draft that exhibit.",
        );
      } finally {
        setEvidenceObjectSuggestionBusy(false);
      }
    },
    [
      evidence.exhibits,
      evidenceItemLimitReached,
      evidenceObjectSeed,
      evidenceObjectSuggestionBusy,
      evidenceObjectVisualBusy,
      generateDebateRefractField,
    ],
  );

  const updateEvidenceObjectName = (
    field: "adjective" | "object",
    value: string,
  ): void => {
    setEvidenceObjectDraft((current) =>
      current
        ? applyDebateEvidenceObjectNameEdit(current, field, value)
        : current,
    );
  };

  const closeEvidenceEmojiSearch = (restoreFocus = true): void => {
    setEvidenceEmojiSearchOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() =>
        evidenceEmojiTriggerRef.current?.focus(),
      );
    }
  };

  const openEvidenceEmojiSearch = (): void => {
    if (!evidenceObjectDraft || evidenceObjectVisualBusy) return;
    setEvidenceEmojiSearchQuery(
      `${evidenceObjectDraft.adjective} ${evidenceObjectDraft.object}`.trim(),
    );
    setEvidenceEmojiSearchOpen(true);
  };

  const chooseEvidenceObjectEmoji = (emoji: string): void => {
    setEvidenceObjectDraft((current) =>
      current
        ? {
            ...current,
            emoji,
            emojiCustomized: true,
            visualKind: "emoji",
            imageId: null,
          }
        : current,
    );
    closeEvidenceEmojiSearch();
  };

  const uploadEvidenceObjectImage = async (file: File): Promise<void> => {
    const draft = evidenceObjectDraft;
    const title = draft ? debateEvidenceExhibitTitle(draft) : "";
    if (!draft || !title || evidenceObjectVisualBusy) {
      setError("Name the evidence object before uploading its image.");
      return;
    }
    setEvidenceObjectVisualBusy("upload");
    setError(null);
    try {
      const dataUrl = await readDebateEvidenceImageFile(file);
      const result = await props.request<{
        image: { id: string; displayUrl: string };
      }>(
        "/api/debates/exhibits/upload",
        requestBody({
          adjective: draft.adjective,
          object: draft.object,
          dataUrl,
        }),
      );
      setEvidenceObjectDraft((current) =>
        current
          ? {
              ...current,
              visualKind: "upload",
              imageId: result.image.id,
            }
          : current,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The exhibit image could not be uploaded.",
      );
    } finally {
      setEvidenceObjectVisualBusy(null);
      if (evidenceExhibitUploadRef.current) {
        evidenceExhibitUploadRef.current.value = "";
      }
    }
  };

  const synthesizeEvidenceObjectImage = async (direction = ""): Promise<void> => {
    const draft = evidenceObjectDraft;
    const title = draft ? debateEvidenceExhibitTitle(draft) : "";
    if (!draft || !title || evidenceObjectVisualBusy) {
      if (!title) setError("Name the evidence object before synthesizing it.");
      return;
    }
    setEvidenceObjectVisualBusy("synthesize");
    setError(null);
    try {
      const result = await props.request<{
        image: { id: string; displayUrl: string };
      }>(
        "/api/debates/exhibits/synthesize",
        requestBody({
          adjective: draft.adjective,
          object: draft.object,
          preferredProvider: props.preferredImageProvider,
          responseMode: props.responseMode,
          direction,
        }),
      );
      setEvidenceObjectDraft((current) =>
        current
          ? {
              ...current,
              visualKind: "synthesized",
              imageId: result.image.id,
            }
          : current,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The evidence object could not be synthesized.",
      );
    } finally {
      setEvidenceObjectVisualBusy(null);
    }
  };

  const addEvidenceObject = (): void => {
    if (!evidenceObjectDraft || evidenceItemLimitReached) return;
    const title = debateEvidenceExhibitTitle(evidenceObjectDraft);
    if (!title) {
      setError("Use one adjective and one object, such as Rusty spoon.");
      return;
    }
    const draft = evidenceObjectDraft;
    setEvidence((current) => ({
      ...current,
      exhibits: [
        ...(current.exhibits ?? []),
        {
          id: nextDebateEvidenceExhibitId(current),
          adjective: draft.adjective,
          object: draft.object,
          title,
          observation: draft.observation.trim() || `${title}.`,
          emoji: draft.emoji,
          visualKind: draft.imageId ? draft.visualKind : "emoji",
          imageId: draft.imageId,
          createdBy: draft.createdBy,
        },
      ],
    }));
    void playDebateExhibitImpactSfx({
      exhibit: {
        adjective: draft.adjective,
        object: draft.object,
        title,
      },
      moment: "packet_add",
      enabled: props.audioEnabled,
      volume: props.audioVolume,
    });
    setEvidenceEmojiSearchOpen(false);
    setEvidenceObjectSeed("");
    setEvidenceObjectDraft(null);
    setError(null);
  };

  const revealEventSilently = useCallback(
    (
      event: DebateEventV1,
      spokenText: string,
      onVisibleCharacterCount?: (visibleCharacterCount: number) => void,
    ): Promise<void> =>
      new Promise((resolve) => {
        if (!event.content) {
          onVisibleCharacterCount?.(0);
          resolve();
          return;
        }
        const durationMs = debateRevealDurationMs(spokenText || event.content);
        const speechText = spokenText || event.content;
        if (durationMs <= 0) {
          replaceLiveReveal({
            eventId: event.id,
            visibleContent: event.content,
            speechTiming: null,
          });
          onVisibleCharacterCount?.(event.content.length);
          resolve();
          return;
        }
        const startedAt = performance.now();
        let lastSemanticKey = "";
        let lastPresentationPublishAt = 0;
        let settled = false;
        const settle = (complete: boolean): void => {
          if (settled) return;
          settled = true;
          if (complete) {
            replaceLiveReveal({
              eventId: event.id,
              visibleContent: event.content,
              speechTiming: {
                text: speechText,
                elapsedMs: durationMs,
                durationMs,
                alignment: null,
              },
            });
            onVisibleCharacterCount?.(event.content.length);
          }
          if (speechRevealRunRef.current?.cancel === cancel) {
            speechRevealRunRef.current = null;
          }
          resolve();
        };
        const finish = (): void => settle(true);
        const cancel = (): void => settle(false);
        const tick = (now: number): void => {
          if (!mountedRef.current) {
            finish();
            return;
          }
          const progress = Math.min(1, (now - startedAt) / durationMs);
          if (
            progress < 1 &&
            now - lastPresentationPublishAt <
              DEBATE_LIVE_SPEECH_RENDER_INTERVAL_MS
          ) {
            const frameId = window.requestAnimationFrame(tick);
            if (speechRevealRunRef.current?.cancel === cancel) {
              speechRevealRunRef.current.frameId = frameId;
            }
            return;
          }
          lastPresentationPublishAt = now;
          const visibleContent = debateVisibleContentAtProgress(
            event.content,
            progress,
          );
          // Parent commits only when floor-break readiness flips — speech ticks
          // stay in the presentation store so the gallery can subscribe locally.
          const floorReady = visibleContent.length >= 24;
          const semanticKey = floorReady ? "floor-ready" : "floor-warming";
          replaceLiveReveal(
            {
              eventId: event.id,
              visibleContent,
              speechTiming: {
                text: speechText,
                elapsedMs: progress * durationMs,
                durationMs,
                alignment: null,
              },
            },
            semanticKey !== lastSemanticKey,
          );
          lastSemanticKey = semanticKey;
          onVisibleCharacterCount?.(visibleContent.length);
          if (progress >= 1) {
            finish();
            return;
          }
          const frameId = window.requestAnimationFrame(tick);
          if (speechRevealRunRef.current?.cancel === cancel) {
            speechRevealRunRef.current.frameId = frameId;
          }
        };
        const frameId = window.requestAnimationFrame(tick);
        speechRevealRunRef.current = { frameId, cancel };
      }),
    [replaceLiveReveal],
  );

  const markJuryCommentPlayed = useCallback((eventId: string): void => {
    if (playedJuryCommentIdsRef.current.has(eventId)) return;
    const next = new Set(playedJuryCommentIdsRef.current);
    next.add(eventId);
    playedJuryCommentIdsRef.current = next;
    setPlayedJuryCommentIds(next);
  }, []);

  const playDebateAudienceReaction = useCallback(
    (
      reactionKind: keyof typeof DEBATE_AUDIENCE_REACTIONS,
      eventId: string,
      intensity?: 1 | 2 | 3,
    ): void => {
      if (!props.audioEnabled || props.audioVolume <= 0) return;
      if (juryCameraActive) return;
      if (
        (reactionKind === "question" || reactionKind === "session") &&
        !debateAudienceAllowsAttentiveFoley(debateMaterialQuality)
      ) {
        return;
      }
      const now = debateClientPerfNowMs();
      if (now < audienceReactionFoleyUntilRef.current) {
        return;
      }
      const reaction = DEBATE_AUDIENCE_REACTIONS[reactionKind];
      const intensityScale =
        intensity === 1 ? 0.5 : intensity === 2 ? 0.76 : 1;
      audienceReactionFoleyUntilRef.current = now + reaction.durationMs * 0.9;
      audienceReactionFoleyStartsRef.current += 1;
      debateAtmosphereControllerRef.current?.playFoley(reaction.url, {
        trim: reaction.trim * intensityScale,
        lowCutHz: 110,
        highCutHz: 7_000,
        stereoPan: -0.08,
        tag: `debate-audience-reaction:${eventId}`,
      });
    },
    [
      debateMaterialQuality,
      juryCameraActive,
      props.audioEnabled,
      props.audioVolume,
    ],
  );

  const debateUtteranceForEvent = useCallback(
    (
      session: DebateSessionV1,
      event: DebateEventV1,
    ): DebateUtterance | null => {
      if (
        event.speakerKind === "system" ||
        event.kind === "silence" ||
        (event.kind === "judge_gavel" &&
          event.gavelReason === "intervention") ||
        (event.kind === "ballot" &&
          event.speakerKind !== "juror" &&
          session.ballots.find(
            (ballot) => ballot.voterBotId === event.speakerBotId,
          )?.privateReason)
      ) {
        return null;
      }
      const authoredVoiceText = debateSpokenText(event.content);
      const spokenText = debateEventIsAtmosphericVocalFoley(event)
        ? debateVocalFoleyVoicePerformance(event.content).spokenText
        : voiceSpokenText(authoredVoiceText, { leadingMarkedAction: true });
      const snapshot = debateBotSnapshot(session, event.speakerBotId);
      const presentation = snapshot
        ? debateBotPresentation(session, snapshot, event.sequence)
        : null;
      const voiceSnapshot = presentation
        ? (debateBotSnapshot(session, presentation.voiceSourceBotId) ??
          snapshot)
        : snapshot;
      const atmosphericPerformance = debateEventIsAtmosphericVocalFoley(event)
        ? debateVocalFoleyVoicePerformance(event.content)
        : null;
      const authoredPerformanceText = voicePerformanceTextFromActionCues(
        authoredVoiceText,
        { leadingMarkedAction: true, omitLocalFoleyTags: true },
      );
      const hiddenPerformanceCue =
        event.kind === "objection"
          ? "shouts"
          : normalizeDebateVoicePerformanceCue(event.voicePerformanceCue);
      const baseVoiceProfile = voiceSnapshot?.voiceProfile ?? null;
      const normalizedBaseVoiceProfile = baseVoiceProfile
        ? normalizeBotAudioVoiceProfileV1(baseVoiceProfile)
        : null;
      const paceBoost =
        event.speakerKind === "advocate" && event.timing
          ? debateUtterancePaceBoost(event.timing)
          : 0;
      const pacedVoiceProfile =
        normalizedBaseVoiceProfile && paceBoost !== 0
          ? {
              ...normalizedBaseVoiceProfile,
              pace: normalizeBotAudioVoiceControl(
                normalizedBaseVoiceProfile.pace + paceBoost,
              ),
            }
          : baseVoiceProfile;
      return {
        event,
        ...(event.kind === "ballot" && event.speakerKind === "juror"
          ? {
              voiceCacheKey: debateJuryBallotVoiceCacheKey(
                session.id,
                event.speakerBotId ?? "juror",
              ),
            }
          : {}),
        format: session.format,
        sessionId: session.id,
        speaker: snapshot
          ? {
              id: snapshot.id,
              name: snapshot.name,
              color: snapshot.color,
              glyph: snapshot.glyph,
              avatarDetails: snapshot.avatarDetails,
              voiceProfile: pacedVoiceProfile,
              powers: snapshot.powers,
              systemPrompt: snapshot.systemPrompt,
              hardMuted:
                session.powerPlan.bots[snapshot.id]?.hardMuted === true,
            }
          : event.speakerBotId
            ? (() => {
                const bot = bots.find(
                  (candidate) => candidate.id === event.speakerBotId,
                );
                if (!bot || paceBoost === 0 || !bot.voiceProfile)
                  return bot ?? null;
                const normalizedBotVoiceProfile =
                  normalizeBotAudioVoiceProfileV1(bot.voiceProfile);
                return {
                  ...bot,
                  voiceProfile: {
                    ...normalizedBotVoiceProfile,
                    pace: normalizeBotAudioVoiceControl(
                      normalizedBotVoiceProfile.pace + paceBoost,
                    ),
                  },
                };
              })()
            : null,
        player: event.speakerKind === "player",
        playerVoice:
          session.playerRole === "judge" &&
          session.moderator.id === DEBATE_PLAYER_JUDGE_BOT_ID &&
          (event.speakerKind === "player" ||
            event.speakerBotId === session.moderator.id),
        spokenText,
        voicePerformanceText: atmosphericPerformance
          ? atmosphericPerformance.voicePerformanceText
          : hiddenPerformanceCue
            ? `[${hiddenPerformanceCue}] ${authoredPerformanceText ?? spokenText}`
            : authoredPerformanceText,
        voiceSourceBotId: presentation?.voiceSourceBotId ?? null,
      };
    },
    [bots],
  );

  const consumeNewEvents = useCallback(
    async (
      previous: DebateSessionV1 | null,
      next: DebateSessionV1,
      runId: number,
      options: {
        automaticJudgeGavel?: boolean;
        resumedJudgeGavelPresentationEventId?: string | null;
      } = {},
    ): Promise<void> => {
      const freshWithAudienceOrder = debatePresentationEvents(
        previous,
        next,
        debateJuryCameraIsActive(
          debateCameraModeForSession(cameraModeRef.current, next),
          next,
        ),
      );
      const linkedAudienceOrderCues = new Map<string, DebateEventV1[]>();
      for (const event of freshWithAudienceOrder) {
        if (
          event.kind !== "judge_gavel" ||
          event.gavelReason !== "audience_order" ||
          !event.parentEventId ||
          event.gavelHeardCharacterCount === undefined
        ) {
          continue;
        }
        const cues = linkedAudienceOrderCues.get(event.parentEventId) ?? [];
        cues.push(event);
        linkedAudienceOrderCues.set(event.parentEventId, cues);
      }
      const fresh = freshWithAudienceOrder.filter(
        (event) =>
          !(
            event.kind === "judge_gavel" &&
            event.gavelReason === "audience_order" &&
            event.parentEventId &&
            event.gavelHeardCharacterCount !== undefined
          ),
      );
      const consumedOverlapEventIds = new Set<string>();
      const recovery = [...fresh]
        .reverse()
        .find((event) => event.autoRecovery)?.autoRecovery;
      if (recovery) {
        setAutoRecoveryNotice(
          recovery.crossedOnline
            ? `Local stalled — recovered online with ${recovery.finalModel}.`
            : `Recovered with ${recovery.finalModel}.`,
        );
      }
      for (const [eventIndex, event] of fresh.entries()) {
        if (presentationRunRef.current !== runId) return;
        if (consumedOverlapEventIds.has(event.id)) {
          scheduleProceedingsReveal(next.id, event.sequence);
          continue;
        }
        let includeInProceedings = false;
        try {
          const replayableEvent =
            event.speakerKind !== "system" && event.kind !== "error"
              ? event
              : fresh
                  .slice(eventIndex + 1)
                  .find(
                    (candidate) =>
                      candidate.speakerKind !== "system" &&
                      candidate.kind !== "error",
                  );
          presentationPlaybackEventIdRef.current = replayableEvent?.id ?? null;
        setAudiencePressurePresentationEventId(event.id);
        if (debateEventIsJurySidebarComment(event)) {
          markJuryCommentPlayed(event.id);
        }
        const suppressGavelCue =
          event.kind === "judge_gavel" &&
          suppressNextJudgeGavelPresentationCueRef.current;
        if (suppressGavelCue) {
          suppressNextJudgeGavelPresentationCueRef.current = false;
        }
        let gavelCue = suppressGavelCue
          ? null
          : debateModeratorGavelCue({
              format: next.format,
              event,
              moderatorBotId: next.moderator.id,
            });
        const resumedJudgeGavelAlreadyStruck =
          next.playerRole === "judge" &&
          options.resumedJudgeGavelPresentationEventId === event.id;
        if (resumedJudgeGavelAlreadyStruck) {
          // Resume is the Judge's return-to-order strike. Preserve the resumed
          // event's gavel-led camera and timing without presenting a second cue.
          gavelCue = {
            eventId: event.id,
            kind: "order",
          };
        }
        const audienceBeat = debateAudienceBeatForEvent({
          event,
          publicContent: event.content,
          seatCount: debateAudienceBotCount(props.graphicsQuality),
          maxReactingSeats: debateAudienceMaxReactingSeats(
            debateMaterialQuality,
            "contention",
          ),
        });
        const semanticAudienceReaction = audienceBeat?.foleyCue ?? null;
        const directedAudienceReaction = debateDirectedAudiencePlayback(
          event.audienceReaction,
        );
        const audienceReaction =
          semanticAudienceReaction === null
            ? (gavelCue?.audienceReaction ?? null)
            : null;
        const utterance = debateUtteranceForEvent(next, event);
        const voiceReady = utterance
          ? onPrepareUtterance?.(utterance).catch(() => undefined)
          : null;
        if (voiceReady) {
          setVoicePreparationSpeakerBotId(
            utterance?.speaker?.id ?? event.speakerBotId,
          );
        }
        const effectivePresentationCameraMode = debateCameraModeForSession(
          cameraModeRef.current,
          next,
        );
        const handoffSpeakerSnapshot = debateBotSnapshot(
          next,
          event.speakerBotId,
        );
        const handoffSpeakerPresentation = handoffSpeakerSnapshot
          ? debateBotPresentation(next, handoffSpeakerSnapshot, event.sequence)
          : null;
        const handoffPlan = debateSpeakerHandoffPlan({
          sessionId: next.id,
          previousEvent: debatePreviousStageSpeakerEvent(next.events, event),
          nextEvent: event,
          automaticCamera: effectivePresentationCameraMode === "auto",
          juryCameraActive: debateJuryCameraIsActive(
            effectivePresentationCameraMode,
            next,
          ),
          gavelLed: gavelCue !== null,
          hasEvidence:
            debateEventPrimaryTableEvidenceId(event, next.evidence) !== null,
          speakerCanFoley:
            event.speakerKind === "advocate" &&
            Boolean(event.speakerBotId) &&
            next.powerPlan.bots[event.speakerBotId ?? ""]?.hardMuted !== true &&
            handoffSpeakerPresentation?.visibility !== "hidden",
        });
        const lifecycleControlGavel =
          next.playerRole === "judge" &&
          (event.stepKey === "pause" ||
            event.stepKey === "resume" ||
            event.gavelReason === "audience_order");
        const audienceOrderCuesForEvent = (
          linkedAudienceOrderCues.get(event.id) ?? []
        ).sort(
          (left, right) =>
            (left.gavelHeardCharacterCount ?? 0) -
            (right.gavelHeardCharacterCount ?? 0),
        );
        const performLinkedAudienceOrderCues = (
          visibleCharacterCount: number,
        ): void => {
          for (const cue of audienceOrderCuesForEvent) {
            if (
              playedAudienceOrderCueIdsRef.current.has(cue.id) ||
              visibleCharacterCount < (cue.gavelHeardCharacterCount ?? 0)
            ) {
              continue;
            }
            const played = new Set(playedAudienceOrderCueIdsRef.current);
            played.add(cue.id);
            playedAudienceOrderCueIdsRef.current = played;
            const pressureAtCue = debateAudiencePressureScore({
              events: next.events,
              formality: next.formality,
              playerRole: next.playerRole,
              visibleThroughSequence: event.sequence,
              activeEventId: event.id,
              visibleCharacterCount: cue.gavelHeardCharacterCount ?? 0,
              reactionForEvent: (candidate) =>
                debateAudienceBeatForEvent({
                  event: candidate,
                  publicContent: candidate.content,
                  seatCount: debateAudienceBotCount(props.graphicsQuality),
                  maxReactingSeats: debateAudienceMaxReactingSeats(
                    debateMaterialQuality,
                    "contention",
                  ),
                })?.listenerReaction ?? null,
            });
            triggerAudienceOrderResponseRef.current?.({
              eventId: cue.id,
              kind: pressureAtCue >= 45 ? "hush" : "awkward",
              resetAfterSequence: event.sequence,
              sessionId: next.id,
            });
          }
        };
        if (
          gavelCue &&
          next.playerRole === "judge" &&
          options.automaticJudgeGavel !== true &&
          !resumedJudgeGavelAlreadyStruck &&
          !lifecycleControlGavel
        ) {
          setLiveGavelCue(null);
          await requestJudgeGavelCeremonyRef.current?.(gavelCue);
          if (presentationRunRef.current !== runId) return;
          gavelCue = null;
        }
        setLiveGavelCue(resumedJudgeGavelAlreadyStruck ? null : gavelCue);
        const orderCameraCutMs =
          gavelCue?.kind === "order" ? DEBATE_GAVEL_ORDER_CAMERA_CUT_MS : 0;
        if (orderCameraCutMs > 0) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, orderCameraCutMs),
          );
          if (presentationRunRef.current !== runId) return;
        }
        let presentationArmedForHandoff = false;
        if (handoffPlan) {
          setSpeakerHandoff({ eventId: event.id, phase: "wide" });
          await new Promise((resolve) =>
            window.setTimeout(
              resolve,
              DEBATE_SPEAKER_HANDOFF_TIMING.wideAudienceMs,
            ),
          );
          if (presentationRunRef.current !== runId) return;

          // Arm the next event while the camera remains wide. This lets the
          // table place cited evidence without exposing any Proceedings prose.
          setSpeakerHandoff({ eventId: event.id, phase: "evidence" });
          setPresentationEventId(event.id);
          replaceLiveReveal({
            eventId: event.id,
            visibleContent: "",
            speechTiming: null,
          });
          presentationArmedForHandoff = true;
          await new Promise((resolve) =>
            window.setTimeout(
              resolve,
              handoffPlan.hasEvidence
                ? DEBATE_SPEAKER_HANDOFF_TIMING.evidenceMs
                : DEBATE_SPEAKER_HANDOFF_TIMING.eventArmMs,
            ),
          );
          if (presentationRunRef.current !== runId) return;

          setSpeakerHandoff({ eventId: event.id, phase: "speaker" });
          await new Promise((resolve) =>
            window.setTimeout(
              resolve,
              DEBATE_SPEAKER_HANDOFF_TIMING.cameraSettleMs,
            ),
          );
          if (presentationRunRef.current !== runId) return;

          setSpeakerHandoff({ eventId: event.id, phase: "foley" });
          if (handoffPlan.foleyKind && event.speakerBotId) {
            const cue = sessionAmbientBotVocalizationCueForKind(
              `${next.id}:speaker-handoff:${event.id}`,
              event.sequence,
              handoffPlan.foleyKind,
            );
            startDebateAmbientBotVocalization(event.speakerBotId, cue);
            if (props.audioEnabled && props.audioVolume > 0) {
              debateAtmosphereControllerRef.current?.playFoley(cue.url, {
                trim: 0.9,
                lowCutHz: 90,
                highCutHz: 8_200,
                stereoPan:
                  event.sideId === "for"
                    ? -0.24
                    : event.sideId === "against"
                      ? 0.24
                      : 0,
                tag: `debate-speaker-handoff:${next.id}:${event.id}`,
              });
            }
            await new Promise((resolve) =>
              window.setTimeout(resolve, cue.durationMs),
            );
            stopDebateAmbientBotVocalization();
          } else {
            await new Promise((resolve) =>
              window.setTimeout(
                resolve,
                DEBATE_SPEAKER_HANDOFF_TIMING.quietReadyMs,
              ),
            );
          }
          if (presentationRunRef.current !== runId) return;
        }
        await voiceReady;
        if (presentationRunRef.current !== runId) return;
        setVoicePreparationSpeakerBotId(null);
        setSpeakerHandoff(null);
        // Open the stage shell only once the floor/streaming path can arm —
        // Proceedings wait for a stenographer delay after the line finishes.
        if (!presentationArmedForHandoff) {
          setPresentationEventId(event.id);
          replaceLiveReveal({
            eventId: event.id,
            visibleContent: "",
            speechTiming: null,
          });
        }
        if (gavelCue) {
          const remainingSpeechLeadMs = Math.max(
            0,
            debateModeratorGavelSpeechLeadMs(gavelCue.kind) - orderCameraCutMs,
          );
          await new Promise((resolve) =>
            window.setTimeout(resolve, remainingSpeechLeadMs),
          );
          if (presentationRunRef.current !== runId) return;
        }
        if (semanticAudienceReaction) {
          playDebateAudienceReaction(semanticAudienceReaction, event.id);
        }
        if (event.kind === "silence") {
          replaceLiveReveal({
            eventId: event.id,
            visibleContent: event.content,
          });
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          includeInProceedings = true;
          continue;
        }
        if (
          event.kind === "judge_gavel" &&
          event.gavelReason === "audience_order"
        ) {
          const played = new Set(playedAudienceOrderCueIdsRef.current);
          played.add(event.id);
          playedAudienceOrderCueIdsRef.current = played;
          const pressureBeforeOrder = debateAudiencePressureScore({
            events: next.events,
            formality: next.formality,
            playerRole: next.playerRole,
            visibleThroughSequence: event.sequence - 1,
            reactionForEvent: (candidate) =>
              debateAudienceBeatForEvent({
                event: candidate,
                publicContent: candidate.content,
                seatCount: debateAudienceBotCount(props.graphicsQuality),
                maxReactingSeats: debateAudienceMaxReactingSeats(
                  debateMaterialQuality,
                  "contention",
                ),
              })?.listenerReaction ?? null,
          });
          triggerAudienceOrderResponseRef.current?.({
            eventId: event.id,
            kind: pressureBeforeOrder >= 45 ? "hush" : "awkward",
            performGavel: false,
            resetAfterSequence: event.sequence,
            sessionId: next.id,
          });
          replaceLiveReveal({
            eventId: event.id,
            visibleContent: "",
            speechTiming: null,
          });
          await new Promise((resolve) => window.setTimeout(resolve, 260));
          includeInProceedings = true;
          continue;
        }
        if (
          event.kind === "judge_gavel" &&
          event.gavelReason === "intervention"
        ) {
          replaceLiveReveal({
            eventId: event.id,
            visibleContent: event.content,
            speechTiming: null,
          });
          await new Promise((resolve) => window.setTimeout(resolve, 260));
          if (audienceReaction) {
            playDebateAudienceReaction(audienceReaction, event.id);
          }
          includeInProceedings = true;
          continue;
        }
        if (event.speakerKind === "system") {
          replaceLiveReveal({ eventId: event.id, visibleContent: "" });
          await revealEventSilently(event, debateSpokenText(event.content));
          if (presentationRunRef.current !== runId) return;
          if (audienceReaction) {
            playDebateAudienceReaction(audienceReaction, event.id);
          }
          includeInProceedings = true;
          continue;
        }
        if (
          event.kind === "ballot" &&
          event.speakerKind !== "juror" &&
          next.ballots.find(
            (ballot) => ballot.voterBotId === event.speakerBotId,
          )?.privateReason
        ) {
          replaceLiveReveal(null);
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          includeInProceedings = true;
          continue;
        }
        // Judge and Spectator projections expose final Jury reasons, so they
        // follow the same caption, mouth, and voice path as deliberation.
        // Participant projections omit these events, and hard-muted jurors
        // still resolve through canonical silence.
        if (!utterance) {
          includeInProceedings = true;
          continue;
        }
        if (debateEventIsAtmosphericVocalFoley(event)) {
          const { spokenText, voicePerformanceText } =
            debateVocalFoleyVoicePerformance(event.content);
          replaceLiveReveal({
            eventId: event.id,
            visibleContent: "",
            speechTiming: null,
          });
          let playbackProgressSeen = false;
          let playbackDurationMs = Math.max(
            1,
            debateRevealDurationMs(spokenText || event.content),
          );
          const played = await onUtterance?.({
            ...utterance,
            spokenText,
            voicePerformanceText,
            lifecycle: {
              onStart: (durationMs, alignment) => {
                if (presentationRunRef.current !== runId) return;
                playbackDurationMs = Math.max(
                  1,
                  durationMs ??
                    Math.max(
                      playbackDurationMs,
                      debateVoiceCompletionFallbackDurationMs(
                        spokenText || event.content,
                      ),
                    ),
                );
                updateLiveReveal((current) =>
                  current?.eventId === event.id
                    ? {
                        ...current,
                        visibleContent: "",
                        speechTiming: {
                          text: spokenText,
                          elapsedMs: 0,
                          durationMs: playbackDurationMs,
                          alignment: alignment ?? null,
                        },
                      }
                    : current,
                );
              },
              onProgress: (elapsedMs, durationMs) => {
                if (presentationRunRef.current !== runId) return;
                playbackProgressSeen = true;
                playbackDurationMs = Math.max(1, durationMs);
                updateLiveReveal((current) =>
                  current?.eventId === event.id
                    ? {
                        ...current,
                        visibleContent: "",
                        speechTiming: {
                          text: spokenText,
                          elapsedMs: Math.min(playbackDurationMs, elapsedMs),
                          durationMs: playbackDurationMs,
                          alignment: current.speechTiming?.alignment ?? null,
                        },
                      }
                    : current,
                );
              },
              onEnd: () => {
                if (presentationRunRef.current !== runId) return;
                replaceLiveReveal({
                  eventId: event.id,
                  visibleContent: "",
                  speechTiming: {
                    text: spokenText,
                    elapsedMs: playbackDurationMs,
                    durationMs: playbackDurationMs,
                    alignment: null,
                  },
                });
              },
            },
          });
          if (presentationRunRef.current !== runId) return;
          if (!played || !playbackProgressSeen) {
            await new Promise((resolve) => window.setTimeout(resolve, 720));
            if (presentationRunRef.current !== runId) return;
            replaceLiveReveal({
              eventId: event.id,
              visibleContent: "",
              speechTiming: null,
            });
          }
          if (audienceReaction) {
            playDebateAudienceReaction(audienceReaction, event.id);
          }
          includeInProceedings = true;
          continue;
        }
        const { spokenText } = utterance;
        const interruptPair = debateInterruptOverlapPair(next.events, event.id);
        const interrupterUtterance = interruptPair
          ? debateUtteranceForEvent(next, interruptPair.interrupter)
          : null;
        if (interruptPair && interrupterUtterance && onUtterance) {
          consumedOverlapEventIds.add(interruptPair.interrupter.id);
          replaceLiveReveal({ eventId: event.id, visibleContent: "" });
          let playbackProgressSeen = false;
          let playbackCancelled = false;
          let overlapFired = false;
          let overlapPromise: Promise<void> | null = null;
          let lastOverlapElapsedMs = 0;
          let playbackAlignment: VoicePlaybackCharacterAlignment | null = null;
          let playbackDurationMs = Math.max(
            1,
            debateRevealDurationMs(spokenText || event.content),
          );
          let lastSpeechRenderAt = 0;
          let lastSemanticKey = "";
          const trailOffText = debateInterruptTrailOffLine(event.id);
          const interrupterRole: DebateForumRole | null =
            interruptPair.interrupter.sideId === "for"
              ? "for"
              : interruptPair.interrupter.sideId === "against"
                ? "against"
                : interruptPair.interrupter.speakerBotId === next.moderator.id
                  ? "moderator"
                  : null;
          const fireOverlap = (): Promise<void> => {
            if (overlapPromise) return overlapPromise;
            overlapFired = true;
            overlapPromise = (async () => {
            const cutCaption = debateInterruptCutCaption(
              debateVisibleContentAtSpeechTime({
                content: event.content,
                spokenText,
                elapsedMs: lastOverlapElapsedMs ||
                  playbackDurationMs * DEBATE_INTERRUPT_OVERLAP_PROGRESS,
                durationMs: playbackDurationMs,
                alignment: playbackAlignment,
              }),
            );
            replaceLiveReveal({
              eventId: event.id,
              visibleContent: cutCaption,
              speechTiming: null,
            });
            onReleaseUtterance?.(DEBATE_INTERRUPT_PRIMARY_RELEASE_MS);
            if (interrupterRole) {
              setInterruptCameraView(debateAutoCameraView(interrupterRole));
            }
            const interrupterIds = new Set<string>();
            if (interruptPair.interrupter.speakerBotId) {
              interrupterIds.add(interruptPair.interrupter.speakerBotId);
            }
            setOverlapSpeakingBotIds(interrupterIds);
            setPresentationEventId(interruptPair.interrupter.id);
            replaceLiveReveal({
              eventId: interruptPair.interrupter.id,
              visibleContent: "",
              speechTiming: null,
            });
            const objectionPlay = onUtterance({
              ...interrupterUtterance,
              voiceChannel: "crosstalk",
              lifecycle: {
                onStart: (durationMs, alignment) => {
                  if (presentationRunRef.current !== runId) return;
                  updateLiveReveal((current) =>
                    current?.eventId === interruptPair.interrupter.id
                      ? {
                          ...current,
                          speechTiming: {
                            text: interrupterUtterance.spokenText,
                            elapsedMs: 0,
                            durationMs: Math.max(1, durationMs ?? 1),
                            alignment: alignment ?? null,
                          },
                        }
                      : current,
                  );
                },
                onProgress: (elapsedMs, durationMs) => {
                  if (presentationRunRef.current !== runId) return;
                  updateLiveReveal((current) =>
                    current?.eventId === interruptPair.interrupter.id
                      ? {
                          ...current,
                          visibleContent: debateVisibleContentAtSpeechTime({
                            content: interruptPair.interrupter.content,
                            spokenText: interrupterUtterance.spokenText,
                            elapsedMs,
                            durationMs: Math.max(1, durationMs),
                            alignment: current.speechTiming?.alignment ?? null,
                          }),
                          speechTiming: {
                            text: interrupterUtterance.spokenText,
                            elapsedMs,
                            durationMs: Math.max(1, durationMs),
                            alignment: current.speechTiming?.alignment ?? null,
                          },
                        }
                      : current,
                  );
                },
                onEnd: () => {
                  if (presentationRunRef.current !== runId) return;
                  updateLiveReveal((current) =>
                    current?.eventId === interruptPair.interrupter.id
                      ? {
                          ...current,
                          visibleContent: interruptPair.interrupter.content,
                          speechTiming: null,
                        }
                      : current,
                  );
                },
              },
            });
            await new Promise((resolve) =>
              window.setTimeout(resolve, DEBATE_INTERRUPT_TRAIL_OFF_LEAD_MS),
            );
            if (presentationRunRef.current !== runId) {
              await objectionPlay;
              return;
            }
            const trailBotId = event.speakerBotId;
            if (trailBotId) {
              setOverlapSpeakingBotIds(
                new Set([...interrupterIds, trailBotId]),
              );
            }
            const trailPlay = onUtterance({
              ...utterance,
              spokenText: trailOffText,
              voicePerformanceText: trailOffText,
              voiceCacheKey: `${event.id}:trail-off`,
              voiceChannel: "primary",
              lifecycle: {
                onEnd: () => {
                  if (presentationRunRef.current !== runId) return;
                  if (trailBotId) {
                    setOverlapSpeakingBotIds(new Set(interrupterIds));
                  }
                },
                onCancel: () => {
                  if (trailBotId) {
                    setOverlapSpeakingBotIds(new Set(interrupterIds));
                  }
                },
              },
            });
            await Promise.all([objectionPlay, trailPlay]);
            if (presentationRunRef.current !== runId) return;
            await new Promise((resolve) =>
              window.setTimeout(resolve, DEBATE_INTERRUPT_CAMERA_HOLD_MS),
            );
            setOverlapSpeakingBotIds(new Set());
            setInterruptCameraView(null);
            })();
            return overlapPromise;
          };

          const played = await onUtterance({
            ...utterance,
            lifecycle: {
              onStart: (durationMs, alignment) => {
                if (presentationRunRef.current !== runId) return;
                playbackAlignment = alignment ?? null;
                playbackDurationMs = Math.max(
                  1,
                  durationMs ??
                    Math.max(
                      playbackDurationMs,
                      debateVoiceCompletionFallbackDurationMs(
                        spokenText || event.content,
                      ),
                    ),
                );
                lastSpeechRenderAt = performance.now();
                updateLiveReveal((current) =>
                  current?.eventId === event.id
                    ? {
                        ...current,
                        speechTiming: {
                          text: spokenText,
                          elapsedMs: 0,
                          durationMs: playbackDurationMs,
                          alignment: playbackAlignment,
                        },
                      }
                    : current,
                );
              },
              onProgress: (elapsedMs, durationMs) => {
                if (presentationRunRef.current !== runId) return;
                playbackProgressSeen = true;
                playbackDurationMs = Math.max(1, durationMs);
                lastOverlapElapsedMs = elapsedMs;
                if (
                  !overlapFired &&
                  debateInterruptShouldFire(elapsedMs, playbackDurationMs)
                ) {
                  void fireOverlap();
                }
                const now = performance.now();
                if (
                  elapsedMs < playbackDurationMs &&
                  now - lastSpeechRenderAt <
                    DEBATE_LIVE_SPEECH_RENDER_INTERVAL_MS
                ) {
                  return;
                }
                lastSpeechRenderAt = now;
                if (overlapFired) return;
                const visibleContent = debateVisibleContentAtSpeechTime({
                  content: event.content,
                  spokenText,
                  elapsedMs,
                  durationMs: playbackDurationMs,
                  alignment: playbackAlignment,
                });
                const floorReady = visibleContent.length >= 24;
                const semanticKey = floorReady
                  ? "floor-ready"
                  : "floor-warming";
                replaceLiveReveal(
                  {
                    eventId: event.id,
                    visibleContent,
                    speechTiming: {
                      text: spokenText,
                      elapsedMs: Math.min(playbackDurationMs, elapsedMs),
                      durationMs: playbackDurationMs,
                      alignment: playbackAlignment,
                    },
                  },
                  semanticKey !== lastSemanticKey,
                );
                lastSemanticKey = semanticKey;
              },
              onEnd: () => {
                if (presentationRunRef.current !== runId) return;
                if (!overlapFired) {
                  void fireOverlap();
                }
              },
              onCancel: () => {
                if (presentationRunRef.current !== runId) return;
                playbackCancelled = true;
                if (!overlapFired) {
                  void fireOverlap();
                }
              },
            },
          });
          if (presentationRunRef.current !== runId) return;
          await fireOverlap();
          if (presentationRunRef.current !== runId) return;
          if (!played && !playbackProgressSeen && !overlapFired) {
            await revealEventSilently(event, spokenText, () => undefined);
          }
          includeInProceedings = true;
        } else {
        replaceLiveReveal({ eventId: event.id, visibleContent: "" });
        let playbackProgressSeen = false;
        let playbackCancelled = false;
        let playbackAlignment: VoicePlaybackCharacterAlignment | null = null;
        let playbackCompletionContent = "";
        let playbackDurationMs = Math.max(
          1,
          debateRevealDurationMs(spokenText || event.content),
        );
        let lastSpeechRenderAt = 0;
        let lastSemanticKey = "";
        const played = await onUtterance?.({
          ...utterance,
          lifecycle: {
            onStart: (durationMs, alignment) => {
              if (presentationRunRef.current !== runId) return;
              playbackAlignment = alignment ?? null;
              playbackDurationMs = Math.max(
                1,
                durationMs ??
                  Math.max(
                    playbackDurationMs,
                    debateVoiceCompletionFallbackDurationMs(
                      spokenText || event.content,
                    ),
                  ),
              );
              lastSpeechRenderAt = performance.now();
              performLinkedAudienceOrderCues(0);
              updateLiveReveal((current) =>
                current?.eventId === event.id
                  ? {
                      ...current,
                      speechTiming: {
                        text: spokenText,
                        elapsedMs: 0,
                        durationMs: playbackDurationMs,
                        alignment: playbackAlignment,
                      },
                    }
                  : current,
              );
            },
            onProgress: (elapsedMs, durationMs) => {
              if (presentationRunRef.current !== runId) return;
              playbackProgressSeen = true;
              playbackDurationMs = Math.max(1, durationMs);
              const now = performance.now();
              if (
                elapsedMs < playbackDurationMs &&
                now - lastSpeechRenderAt < DEBATE_LIVE_SPEECH_RENDER_INTERVAL_MS
              ) {
                return;
              }
              lastSpeechRenderAt = now;
              const visibleContent = debateVisibleContentAtSpeechTime({
                content: event.content,
                spokenText,
                elapsedMs,
                durationMs: playbackDurationMs,
                alignment: playbackAlignment,
              });
              const floorReady = visibleContent.length >= 24;
              const semanticKey = floorReady ? "floor-ready" : "floor-warming";
              replaceLiveReveal(
                {
                  eventId: event.id,
                  visibleContent,
                  speechTiming: {
                    text: spokenText,
                    elapsedMs: Math.min(playbackDurationMs, elapsedMs),
                    durationMs: playbackDurationMs,
                    alignment: playbackAlignment,
                  },
                },
                semanticKey !== lastSemanticKey,
              );
              lastSemanticKey = semanticKey;
              performLinkedAudienceOrderCues(visibleContent.length);
            },
            onEnd: () => {
              if (presentationRunRef.current !== runId) return;
              playbackCompletionContent = debateVisibleContentAtSpeechTime({
                content: event.content,
                spokenText,
                elapsedMs: playbackDurationMs,
                durationMs: playbackDurationMs,
                alignment: playbackAlignment,
              });
              performLinkedAudienceOrderCues(playbackCompletionContent.length);
              replaceLiveReveal({
                eventId: event.id,
                visibleContent: playbackCompletionContent,
                speechTiming: {
                  text: spokenText,
                  elapsedMs: playbackDurationMs,
                  durationMs: playbackDurationMs,
                  alignment: playbackAlignment,
                },
              });
            },
            onCancel: () => {
              if (presentationRunRef.current !== runId) return;
              playbackCancelled = true;
              updateLiveReveal((current) =>
                current?.eventId === event.id
                  ? { ...current, speechTiming: null }
                  : current,
              );
            },
          },
        });
        if (presentationRunRef.current !== runId) return;
        if (playbackCancelled) return;
        if (!played && playbackProgressSeen) {
          updateLiveReveal((current) =>
            current?.eventId === event.id
              ? { ...current, speechTiming: null }
              : current,
          );
          return;
        }
        if (!played || !playbackProgressSeen) {
          await revealEventSilently(
            event,
            spokenText,
            performLinkedAudienceOrderCues,
          );
          if (presentationRunRef.current !== runId) return;
        } else {
          updateLiveReveal((current) =>
            current?.eventId === event.id
              ? {
                  ...current,
                  visibleContent:
                    playbackCompletionContent || current.visibleContent,
                }
              : {
                  eventId: event.id,
                  visibleContent: playbackCompletionContent,
                },
          );
        }
        if (directedAudienceReaction) {
          playDebateAudienceReaction(
            directedAudienceReaction.kind,
            event.id,
            directedAudienceReaction.intensity,
          );
        } else if (audienceReaction) {
          playDebateAudienceReaction(audienceReaction, event.id);
        }
          includeInProceedings = true;
        }
        } finally {
          if (
            includeInProceedings &&
            presentationRunRef.current === runId
          ) {
            scheduleProceedingsReveal(next.id, event.sequence);
          }
        }
      }
      if (presentationRunRef.current !== runId) return;
      presentationPlaybackEventIdRef.current = null;
      setLiveGavelCue(null);
      setSpeakerHandoff(null);
      setInterruptCameraView(null);
      setOverlapSpeakingBotIds(new Set());
      replaceLiveReveal(null);
      setVoicePreparationSpeakerBotId(null);
    },
    [
      debateMaterialQuality,
      debateUtteranceForEvent,
      markJuryCommentPlayed,
      onPrepareUtterance,
      onReleaseUtterance,
      onUtterance,
      playDebateAudienceReaction,
      props.audioEnabled,
      props.audioVolume,
      props.graphicsQuality,
      replaceLiveReveal,
      revealEventSilently,
      scheduleProceedingsReveal,
      startDebateAmbientBotVocalization,
      stopDebateAmbientBotVocalization,
      updateLiveReveal,
    ],
  );

  useEffect(() => {
    if (
      !juryCameraActive ||
      !activeSession ||
      !pendingJuryComment ||
      busy ||
      presenting
    ) {
      return;
    }

    markJuryCommentPlayed(pendingJuryComment.id);
    const runId = presentationRunRef.current + 1;
    presentationRunRef.current = runId;
    const beforeComment = {
      ...activeSession,
      events: activeSession.events.filter(
        (event) => event.sequence < pendingJuryComment.sequence,
      ),
    };
    const throughComment = {
      ...activeSession,
      events: activeSession.events.filter(
        (event) => event.sequence <= pendingJuryComment.sequence,
      ),
    };
    setPresenting(true);
    void consumeNewEvents(beforeComment, throughComment, runId).finally(() => {
      if (presentationRunRef.current !== runId) return;
      setSpeakerHandoff(null);
      setPresenting(false);
    });
  }, [
    activeSession,
    busy,
    consumeNewEvents,
    juryCameraActive,
    markJuryCommentPlayed,
    pendingJuryComment,
    presenting,
  ]);

  const playDebateIdent = useCallback(
    async (kind: DebateIdentKind): Promise<void> => {
      setDebateIdentPlaying(kind);
      try {
        await playDebateIdentAudio({
          kind,
          enabled: props.audioEnabled,
          volume: props.audioVolume,
        });
      } finally {
        if (mountedRef.current) {
          setDebateIdentPlaying((current) =>
            current === kind ? null : current,
          );
        }
      }
    },
    [props.audioEnabled, props.audioVolume],
  );

  const discardPreparedTurn = useCallback(
    (reason: string): void => {
      const prepared = preparedTurnRef.current;
      preparedTurnRef.current = null;
      if (!prepared) return;
      void props
        .request(`/api/turn-preparations/${encodeURIComponent(prepared.id)}`, {
          method: "DELETE",
          body: JSON.stringify({ reason }),
        })
        .catch(() => undefined);
    },
    [props],
  );

  const prepareNextAutomaticTurn = useCallback(
    (session: DebateSessionV1): void => {
      if (
        session.status !== "live" ||
        session.stepKey === "completed" ||
        session.judgeGavel?.status === "awaiting_message" ||
        session.objectionRuling?.status === "awaiting_ruling" ||
        session.participantObjection?.status === "awaiting_reason"
      ) {
        return;
      }
      discardPreparedTurn("Superseded by the next automatic Debate turn.");
      const expectedSessionId = session.id;
      const expectedRevision = session.revision;
      void props
        .request<{ preparation: PreparedTurnV1 }>(
          `/api/debates/${encodeURIComponent(session.id)}/turn-preparations`,
          requestBody({ expectedRevision: session.revision }),
        )
        .then(async ({ preparation }) => {
          let current = preparation;
          while (
            current.phase === "preparing" &&
            activeSessionIdRef.current === expectedSessionId
          ) {
            await new Promise<void>((resolve) =>
              window.setTimeout(resolve, 150),
            );
            current = (
              await props.request<{ preparation: PreparedTurnV1 }>(
                `/api/turn-preparations/${encodeURIComponent(current.id)}`,
              )
            ).preparation;
          }
          if (
            activeSessionIdRef.current !== expectedSessionId ||
            current.sessionId !== expectedSessionId ||
            current.stateCursor.revision !== expectedRevision ||
            current.phase !== "ready"
          ) {
            void props
              .request(
                `/api/turn-preparations/${encodeURIComponent(current.id)}`,
                { method: "DELETE" },
              )
              .catch(() => undefined);
            return;
          }
          for (const utterance of current.provisionalUtterances) {
            onPrefetchPreparedUtterance?.({ utterance, session });
          }
          preparedTurnRef.current = {
            id: current.id,
            sessionId: expectedSessionId,
            revision: expectedRevision,
          };
        })
        .catch(() => undefined);
    },
    [discardPreparedTurn, onPrefetchPreparedUtterance, props],
  );

  const adoptSession = useCallback(
    async (
      previous: DebateSessionV1 | null,
      next: DebateSessionV1,
      options: {
        playIntro?: boolean;
        automaticJudgeGavel?: boolean;
        resumedJudgeGavelPresentationEventId?: string | null;
      } = {},
    ): Promise<void> => {
      const runId = presentationRunRef.current + 1;
      presentationRunRef.current = runId;
      presentationPlaybackEventIdRef.current = null;
      activeSessionIdRef.current = next.id;
      presentationStore.clear();
      setVoicePreparationSpeakerBotId(null);
      setSpeakerHandoff(null);
      const fresh = debatePresentationEvents(
        previous,
        next,
        debateJuryCameraIsActive(
          debateCameraModeForSession(cameraModeRef.current, next),
          next,
        ),
      );
      const first = fresh[0] ?? null;
      presentationPlaybackEventIdRef.current =
        fresh.find(
          (event) => event.speakerKind !== "system" && event.kind !== "error",
        )?.id ?? null;
      const firstResumesWithJudgeGavel =
        next.playerRole === "judge" &&
        first?.id === options.resumedJudgeGavelPresentationEventId;
      const firstGavelCue = first
        ? firstResumesWithJudgeGavel
          ? ({ eventId: first.id, kind: "order" } as const)
          : debateModeratorGavelCue({
              format: next.format,
              event: first,
              moderatorBotId: next.moderator.id,
            })
        : null;
      const firstWaitsForJudgeGavel =
        next.playerRole === "judge" &&
        firstGavelCue !== null &&
        !firstResumesWithJudgeGavel &&
        options.automaticJudgeGavel !== true;
      if (first) {
        const presentsImmediately =
          !onPrepareUtterance &&
          !firstWaitsForJudgeGavel &&
          firstGavelCue?.kind !== "order";
        // Keep Proceedings closed through voice prep / gavel waits, and never
        // open the next line until stenographer delay after it finishes.
        // Resume/lifecycle adopts must not inherit a full baked Spectator tail.
        setTranscriptVisibleThroughSequence(
          debateAdoptProceedingsCursor(previous, next),
        );
        if (presentsImmediately) {
          setPresentationEventId(first.id);
          replaceLiveReveal({ eventId: first.id, visibleContent: "" });
        } else {
          setPresentationEventId(null);
          replaceLiveReveal(null);
        }
      } else {
        setTranscriptVisibleThroughSequence(
          debateInitialProceedingsCursor(
            next,
            debateSpectatorAwaitingFirstWatch(next),
          ),
        );
        setPresentationEventId(null);
        setLiveGavelCue(null);
        replaceLiveReveal(null);
      }
      setPresenting(fresh.length > 0 || options.playIntro === true);
      setTurnaboutObjecting(false);
      setTurnaboutEvidenceSourceId("");
      setObserverPerspective("live");
      setActiveSession(reuseDebateSessionEventPrefix(previous, next));
      if (fresh.length > 0) prepareNextAutomaticTurn(next);
      const presentingStartedAt = debateClientPerfNowMs();
      audienceReactionFoleyStartsRef.current = 0;
      try {
        if (options.playIntro) {
          await playDebateIdent("intro");
          if (presentationRunRef.current !== runId) return;
        }
        await consumeNewEvents(previous, next, runId, {
          automaticJudgeGavel: options.automaticJudgeGavel,
          resumedJudgeGavelPresentationEventId:
            options.resumedJudgeGavelPresentationEventId,
        });
        if (presentationRunRef.current !== runId) return;
        if (
          previous &&
          previous.status !== "completed" &&
          next.status === "completed"
        ) {
          await new Promise<void>((resolve) =>
            window.setTimeout(resolve, DEBATE_IDENT_OUTRO_LEAD_MS),
          );
          if (presentationRunRef.current !== runId) return;
          await playDebateIdent("outro");
        }
      } finally {
        if (presentationRunRef.current === runId) {
          setVoicePreparationSpeakerBotId(null);
          setSpeakerHandoff(null);
          setAudiencePressurePresentationEventId(null);
          setPresenting(false);
          logDebateClientPerf(
            "advance.presenting",
            debateClientPerfNowMs() - presentingStartedAt,
            {
              sessionId: next.id,
              revision: next.revision,
              eventCount: next.events.length,
              foleyStarts: audienceReactionFoleyStartsRef.current,
            },
          );
        }
      }
      void loadSessions();
    },
    [
      consumeNewEvents,
      loadSessions,
      onPrepareUtterance,
      playDebateIdent,
      prepareNextAutomaticTurn,
      presentationStore,
      replaceLiveReveal,
      clearProceedingsRevealTimers,
    ],
  );

  const openSession = async (
    archived: DebateSessionListItemV1,
  ): Promise<void> => {
    setBusy(true);
    setSetupRestoreNotice(null);
    setError(null);
    try {
      const perspective = archived.status === "completed" ? "replay" : "live";
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(archived.id)}?perspective=${perspective}`,
      );
      const session = debateSessionNeedsReturnPause(result.session)
        ? (
            await props.request<{ session: DebateSessionV1 }>(
              `/api/debates/${encodeURIComponent(result.session.id)}/pause`,
              requestBody({
                expectedRevision: result.session.revision,
                idempotencyKey: nextMutationKey("return-recess"),
                exitRecovery: true,
                presentationEventId:
                  [...result.session.events]
                    .reverse()
                    .find(
                      (event) =>
                        event.speakerKind !== "system" &&
                        event.kind !== "error",
                    )?.id ?? null,
              }),
            )
          ).session
        : result.session;
      clearDebateDebrief();
      selectDebateCameraMode("auto");
      setTurnaboutObjecting(false);
      setTurnaboutEvidenceSourceId("");
      setObserverPerspective(perspective);
      presentationStore.clear();
      clearProceedingsRevealTimers();
      activeSessionIdRef.current = session.id;
      setTranscriptVisibleThroughSequence(
        debateInitialProceedingsCursor(
          session,
          debateSpectatorAwaitingFirstWatch(session),
        ),
      );
      setActiveSession(session);
      setView("live");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Debate not found.");
    } finally {
      setBusy(false);
    }
  };

  const reuseSessionSetup = async (
    archived: DebateSessionListItemV1,
  ): Promise<void> => {
    setBusy(true);
    setSetupRestoreLoadingId(archived.id);
    setSetupRestoreNotice(null);
    setError(null);
    try {
      const perspective = archived.status === "completed" ? "replay" : "live";
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(archived.id)}?perspective=${perspective}`,
      );
      const draft = debateSessionRetryDraft(
        result.session,
        bots.map((bot) => bot.id),
        selectedPresetId,
      );
      cancelCurrentPresentation();
      presentationStore.clear();
      activeSessionIdRef.current = null;
      clearDebateDebrief();
      setActiveSession(null);
      setObserverPerspective("live");
      setView("dashboard");
      setStudioPanel("motion");
      setRoomTuningOpen(false);
      setMotionTuningOpen(false);
      setCastTuningOpen(draft.playerRole !== "judge" || draft.juryEnabled);
      setEvidenceDecisionMade(false);
      setTopic(draft.topic);
      setFormat(draft.format);
      setForumRoundMode(draft.forumRoundMode);
      setForumRoundCount(draft.forumRoundCount);
      setFormality(draft.formality);
      setModeratorTitle(draft.moderatorTitle);
      setSelectedPresetId(draft.selectedPresetId);
      setSlates([]);
      setMotion(draft.motion);
      setCast(draft.cast);
      setPlayerRole(draft.playerRole);
      setPlayerSideId(draft.playerSideId);
      setJuryEnabled(draft.juryEnabled);
      setRoleChecks([]);
      setEvidence(draft.evidence);
      setActiveCastSlot(
        draft.playerRole === "judge"
          ? "forAdvocate"
          : draft.playerRole === "participant"
            ? draft.playerSideId === "for"
              ? "againstAdvocate"
              : "forAdvocate"
            : "moderator",
      );
      setCastPickerSearch("");
      setCastPickerGroupId("all");
      setResearchQuery("");
      setScholarQuery("");
      setEvidenceObjectSeed("");
      setUrlEvidenceDraft(null);
      setUrlEvidenceError(null);
      setEvidenceObjectDraft(null);
      setEvidenceEmojiSearchOpen(false);
      setEvidenceEmojiSearchQuery("");
      setSourceDrawerId(null);
      setPlayerDraft("");
      setTurnaboutObjecting(false);
      setTurnaboutEvidenceSourceId("");
      setSetupRestoreNotice(
        draft.missingBotNames.length > 0
          ? `Setup restored. The original proceeding is unchanged. Reassign unavailable Library bots: ${draft.missingBotNames.join(", ")}. Review the motion, cast, and evidence choice, then run a fresh willingness check; your current model and routing stay selected.`
          : "Setup restored. The original proceeding is unchanged. Review the motion, cast, and evidence choice, then run a fresh willingness check; your current model and routing stay selected.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That Debate setup could not be restored.",
      );
    } finally {
      setSetupRestoreLoadingId(null);
      setBusy(false);
    }
  };

  const startDebate = async (): Promise<void> => {
    if (!debateCanStart) return;
    setBusy(true);
    setSetupRestoreNotice(null);
    setError(null);
    try {
      let titledMotion = motion;
      if (!motion.title?.trim()) {
        try {
          const titleResult = await props.request<{ title: string }>(
            "/api/debates/title",
            requestBody({
              motion,
              formality,
              preferredProvider:
                props.modelOverride?.provider ?? props.preferredProvider,
              modelOverride: props.modelOverride?.model,
              responseMode: props.responseMode,
            }),
          );
          titledMotion = { ...motion, title: titleResult.title };
        } catch {
          titledMotion = {
            ...motion,
            title: debateTitleForMotion(motion, formality),
          };
        }
        setMotion(titledMotion);
      }
      const result = await props.request<{ session: DebateSessionV1 }>(
        "/api/debates",
        requestBody({
          presetId: effectivePresetId,
          format,
          formality,
          motion: titledMotion,
          evidence,
          moderatorTitle: normalizeDebateModeratorTitle(moderatorTitle),
          moderatorBotId: effectiveModeratorBotId,
          playerJudgeUsesPrism: playerRole === "judge",
          forAdvocateBotId:
            playerRole === "participant" && playerSideId === "for"
              ? undefined
              : cast.forAdvocate,
          againstAdvocateBotId:
            playerRole === "participant" && playerSideId === "against"
              ? undefined
              : cast.againstAdvocate,
          playerRole,
          playerSideId: playerRole === "participant" ? playerSideId : null,
          jury: {
            enabled: juryEnabled,
            cadence: "natural-five",
          },
          forumRounds:
            format === "forum"
              ? {
                  mode: forumRoundMode,
                  count:
                    forumRoundMode === "fixed" ? forumRoundCount : undefined,
                }
              : undefined,
          advocacyConsent: roleChecks,
          preferredProvider:
            props.modelOverride?.provider ?? props.preferredProvider,
          modelOverride: props.modelOverride?.model,
          responseMode: props.responseMode,
          theme: props.theme,
          idempotencyKey: nextMutationKey("create"),
        }),
      );
      if (playerRole === "spectator") {
        setSpectatorBake(result.session.liveBake ?? null);
        setView("baking");
        setBusy(true);
        const baked = await props.request<{
          session: DebateSessionV1;
          liveBake: LiveBakeArtifactV1;
        }>(
          `/api/debates/${encodeURIComponent(result.session.id)}/bake`,
          requestBody({}),
        );
        if (!mountedRef.current) return;
        setSpectatorBake(baked.liveBake);
        // Hold the finished gallery paused until the player presses Start, so a
        // long synthesize cannot begin while they are away from the keyboard.
        const held = await props.request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(baked.session.id)}/pause`,
          requestBody({
            expectedRevision: baked.session.revision,
            idempotencyKey: nextMutationKey("spectator-ready-hold"),
            exitRecovery: true,
            presentationEventId: null,
          }),
        );
        if (!mountedRef.current) return;
        clearDebateDebrief();
        selectDebateCameraMode("auto");
        setTurnaboutObjecting(false);
        setTurnaboutEvidenceSourceId("");
        setObserverPerspective("live");
        presentationStore.clear();
        activeSessionIdRef.current = held.session.id;
        setActiveSession(held.session);
        setSpectatorBake(null);
        setView("live");
        setBusy(false);
        return;
      }
      if (mountedRef.current) setBusy(false);
      selectDebateCameraMode("auto");
      setView("live");
      await adoptSession(null, result.session, { playIntro: true });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Debate could not start.",
      );
      if (playerRole === "spectator") {
        setView("dashboard");
        setSpectatorBake(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const advance = useCallback(
    async (skip = false): Promise<void> => {
      const previous = activeSession;
      if (
        !previous ||
        busy ||
        presenting ||
        debateFloorMutationInFlightRef.current
      ) {
        return;
      }
      debateFloorMutationInFlightRef.current = true;
      const preparingJuryDeliberation =
        previous.jury.enabled &&
        previous.stepKey.startsWith("jury_deliberation_");
      if (preparingJuryDeliberation) {
        setJuryDeliberationInFlightSessionId(previous.id);
      }
      setBusy(true);
      setError(null);
      const advanceStartedAt = debateClientPerfNowMs();
      let finishResponseCue: (() => Promise<void>) | null = null;
      try {
        const prepared = preparedTurnRef.current;
        let result: { session: DebateSessionV1 } | null = null;
        if (
          !skip &&
          prepared?.sessionId === previous.id &&
          prepared.revision === previous.revision
        ) {
          preparedTurnRef.current = null;
          try {
            result = await request<{ session: DebateSessionV1 }>(
              `/api/turn-preparations/${encodeURIComponent(prepared.id)}/commit`,
              requestBody({}),
            );
          } catch {
            // Missing, expired, failed, and stale preparation all fall back to
            // the canonical just-in-time path from the current heard state.
            result = null;
          }
        } else if (prepared) {
          discardPreparedTurn(
            skip
              ? "A skip replaced the prepared turn."
              : "The Debate revision changed.",
          );
        }
        if (!result) {
          const expectedBotId = skip ? null : debateExpectedBotId(previous);
          if (expectedBotId) {
            finishResponseCue =
              onResponseCueGeneration?.({
                botId: expectedBotId,
                trigger: null,
                sessionId: previous.id,
              }) ?? null;
          }
          result = await request<{ session: DebateSessionV1 }>(
            `/api/debates/${encodeURIComponent(previous.id)}/advance`,
            requestBody({
              expectedRevision: previous.revision,
              idempotencyKey: nextMutationKey(skip ? "skip" : "advance"),
              skip,
              preferredProvider,
            }),
          );
          await finishResponseCue?.();
        }
        logDebateClientPerf(
          "advance.round_trip",
          debateClientPerfNowMs() - advanceStartedAt,
          {
            sessionId: previous.id,
            revision: result.session.revision,
            skip,
            provider: preferredProvider ?? "default",
          },
        );
        if (
          preparingJuryDeliberation &&
          onPrepareUtterance &&
          result.session.jury.preparedFinalBallots.length > 0
        ) {
          const nextSequence =
            (result.session.events.at(-1)?.sequence ?? -1) + 1;
          await Promise.all(
            result.session.jury.preparedFinalBallots.map(
              async (ballot, index) => {
                const event: DebateEventV1 = {
                  version: DEBATE_SCHEMA_VERSION,
                  id: debateJuryBallotVoiceCacheKey(
                    result.session.id,
                    ballot.jurorBotId,
                  ),
                  sequence: nextSequence + index,
                  phase: "verdict",
                  stepKey: `jury_final_${index}`,
                  kind: "ballot",
                  speakerKind: "juror",
                  speakerBotId: ballot.jurorBotId,
                  sideId: ballot.sideId,
                  content: ballot.reason,
                  sourceIds: [],
                  provider: ballot.provider,
                  model: ballot.model,
                  autoRecovery: ballot.autoRecovery,
                  voicePerformanceCue: ballot.voicePerformanceCue,
                  createdAt: ballot.createdAt,
                };
                const utterance = debateUtteranceForEvent(
                  result.session,
                  event,
                );
                if (utterance) {
                  await onPrepareUtterance(utterance).catch(() => undefined);
                }
              },
            ),
          );
        }
        if (mountedRef.current) setBusy(false);
        if (pauseInFlightRef.current) {
          // Graceful Pause owns the floor; discard this advance presentation.
          debateFloorMutationInFlightRef.current = false;
          return;
        }
        const adoption = adoptSession(previous, result.session);
        debateFloorMutationInFlightRef.current = false;
        await adoption;
        if (preparingJuryDeliberation && mountedRef.current) {
          setJuryDeliberationInFlightSessionId(null);
        }
      } catch (caught) {
        await finishResponseCue?.();
        setError(
          caught instanceof Error
            ? caught.message
            : "The turn was unavailable.",
        );
      } finally {
        await finishResponseCue?.();
        debateFloorMutationInFlightRef.current = false;
        if (preparingJuryDeliberation && mountedRef.current) {
          setJuryDeliberationInFlightSessionId(null);
        }
        if (mountedRef.current) setBusy(false);
      }
    },
    [
      activeSession,
      adoptSession,
      busy,
      discardPreparedTurn,
      debateUtteranceForEvent,
      nextMutationKey,
      onPrepareUtterance,
      onResponseCueGeneration,
      preferredProvider,
      presenting,
      request,
    ],
  );

  const submitObjectionRuling = useCallback(
    async (ruling: "sustained" | "overruled"): Promise<void> => {
      const previous = activeSession;
      if (
        !previous ||
        previous.objectionRuling?.status !== "awaiting_ruling" ||
        busy ||
        presenting
      ) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(previous.id)}/objection-ruling`,
          requestBody({
            expectedRevision: previous.revision,
            idempotencyKey: nextMutationKey(`objection-${ruling}`),
            ruling,
          }),
        );
        if (mountedRef.current) setBusy(false);
        setObjectionRulingDecision(null);
        await adoptSession(previous, result.session);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "The objection ruling was unavailable.",
        );
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [activeSession, adoptSession, busy, nextMutationKey, presenting, request],
  );

  useEffect(() => {
    if (
      view !== "live" ||
      !activeSession ||
      activeSession.status !== "live" ||
      activeSession.stepKey === "completed" ||
      busy ||
      audienceOrderSaving ||
      presenting ||
      earlyEndOpen ||
      presentationSuspended
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => void advance(false),
      DEBATE_AUTO_ADVANCE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [
    activeSession,
    advance,
    audienceOrderSaving,
    busy,
    earlyEndOpen,
    presentationSuspended,
    presenting,
    view,
  ]);

  useEffect(() => {
    const session = activeSession;
    if (
      view !== "live" ||
      !session ||
      !debateSessionAwaitsPresentationSeal(session) ||
      session.status !== "live" ||
      busy ||
      presenting ||
      earlyEndOpen ||
      presentationSuspended ||
      debateFloorMutationInFlightRef.current ||
      pauseInFlightRef.current
    ) {
      return;
    }
    if (spectatorPresentationSealInFlightRef.current === session.id) {
      return;
    }
    let cancelled = false;
    spectatorPresentationSealInFlightRef.current = session.id;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, DEBATE_IDENT_OUTRO_LEAD_MS),
        );
        if (cancelled || !mountedRef.current) return;
        await playDebateIdent("outro");
        if (cancelled || !mountedRef.current) return;
        const result = await props.request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(session.id)}/seal-presentation`,
          requestBody({
            expectedRevision: session.revision,
            idempotencyKey: nextMutationKey("seal-presentation"),
          }),
        );
        if (cancelled || !mountedRef.current) return;
        setActiveSession(result.session);
        void loadSessions();
      } catch (caught) {
        if (!cancelled && mountedRef.current) {
          setError(
            caught instanceof Error
              ? caught.message
              : "The Debate could not be sealed after the closing.",
          );
        }
      } finally {
        if (spectatorPresentationSealInFlightRef.current === session.id) {
          spectatorPresentationSealInFlightRef.current = null;
        }
        if (mountedRef.current) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // busy is intentionally omitted: this effect sets busy itself and must not
    // cancel the seal when that local busy flag flips.
  }, [
    activeSession,
    earlyEndOpen,
    loadSessions,
    nextMutationKey,
    playDebateIdent,
    presentationSuspended,
    presenting,
    view,
  ]);

  useEffect(() => {
    const pendingRuling = activeSession?.objectionRuling;
    const awaitingRuling =
      view === "live" &&
      activeSession?.playerRole === "judge" &&
      activeSession.status === "waiting_for_player" &&
      activeSession.stepKey === "judge_objection_ruling" &&
      pendingRuling?.status === "awaiting_ruling" &&
      !busy &&
      !presenting;
    if (!awaitingRuling || !activeSession || !pendingRuling) {
      setObjectionRulingDecision(null);
      return;
    }
    const key = `${activeSession.id}:${activeSession.revision}:${pendingRuling.objectionEventId}`;
    setObjectionRulingDecision((current) =>
      current?.key === key
        ? current
        : {
            key,
            deadlineMs:
              Date.now() +
              (props.objectionRulingTimeoutMs ??
                DEBATE_OBJECTION_RULING_TIMEOUT_MS),
          },
    );
  }, [activeSession, busy, presenting, props.objectionRulingTimeoutMs, view]);

  useEffect(() => {
    if (!objectionRulingDecision) return;
    const frameId = window.requestAnimationFrame(() => {
      objectionRulingDockRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [objectionRulingDecision]);

  useEffect(() => {
    if (!objectionRulingDecision) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      const target = event.target instanceof Element ? event.target : null;
      const ruling = debateJudgeObjectionRulingShortcut({
        active: !busy && !presenting,
        editableTarget: Boolean(
          target?.closest(
            'input, textarea, select, [contenteditable="true"], [role="textbox"]',
          ),
        ),
        hasModifier: event.altKey || event.ctrlKey || event.metaKey,
        key: event.key,
      });
      if (!ruling) return;
      event.preventDefault();
      void submitObjectionRuling(ruling);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, objectionRulingDecision, presenting, submitObjectionRuling]);

  useEffect(() => {
    if (!objectionRulingDecision) return;
    const timeout = window.setTimeout(
      () => {
        void submitObjectionRuling("overruled");
      },
      Math.max(0, objectionRulingDecision.deadlineMs - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [objectionRulingDecision, submitObjectionRuling]);

  useEffect(() => {
    const pending =
      view === "live" &&
      activeSession?.playerRole === "participant" &&
      activeSession.status === "waiting_for_player" &&
      activeSession.stepKey === "participant_objection_reason" &&
      activeSession.participantObjection?.status === "awaiting_reason";
    if (!pending) {
      setParticipantObjectionDraft("");
      return;
    }
    if (busy || presenting) return;
    const frameId = window.requestAnimationFrame(() => {
      participantObjectionReasonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    activeSession?.id,
    activeSession?.participantObjection?.objectionEventId,
    activeSession?.participantObjection?.status,
    activeSession?.playerRole,
    activeSession?.status,
    activeSession?.stepKey,
    busy,
    presenting,
    view,
  ]);

  const submitPlayerTurnContent = async (content: string): Promise<void> => {
    const previous = activeSession;
    if (!previous || busy || !content.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/player-turn`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("player-turn"),
          content,
          targetSideId:
            previous.stepKey === "challenge_judge_question"
              ? judgeTarget
              : undefined,
        }),
      );
      if (mountedRef.current) setBusy(false);
      setPlayerDraft("");
      setJudgeComposerOpen(false);
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your turn could not be saved.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const submitPlayerTurn = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    await submitPlayerTurnContent(playerDraft);
  };

  const passPlayerTurn = async (): Promise<void> => {
    const previous = activeSession;
    if (!previous || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/player-turn`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("pass"),
          pass: true,
          targetSideId:
            previous.stepKey === "challenge_judge_question"
              ? judgeTarget
              : undefined,
        }),
      );
      if (mountedRef.current) setBusy(false);
      setPlayerDraft("");
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Pass was unavailable.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const revealJudgeComposer = (): void => {
    setJudgeComposerOpen(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => props.onJudgeComposerReveal?.());
    });
  };

  const submitJudgeQuickChoice = async (
    kind: "gavel" | "question",
    choice: DebateJudgeQuickChoice,
  ): Promise<void> => {
    if (choice.action === "dismiss") {
      if (kind === "gavel") {
        await submitJudgeGavelMessage(undefined, true);
      } else {
        await passPlayerTurn();
      }
      return;
    }
    if (choice.action === "compose") {
      revealJudgeComposer();
      return;
    }
    if (choice.content === null) return;
    if (kind === "gavel") {
      await submitJudgeGavelMessage(undefined, false, choice.content);
      return;
    }
    await submitPlayerTurnContent(choice.content);
  };

  const generateJudgeComposerDraft = async (): Promise<void> => {
    const previous = activeSession;
    const guidedKind = previous
      ? debateJudgeGuidedStepKind({
          playerRole: previous.playerRole,
          status: previous.status,
          stepKey: previous.stepKey,
          judgeGavelStatus: previous.judgeGavel?.status,
          objectionRulingStatus: previous.objectionRuling?.status,
        })
      : null;
    if (
      !previous ||
      (guidedKind !== "gavel" && guidedKind !== "question") ||
      busy ||
      judgeComposerGenerating
    ) {
      return;
    }
    const targetLabel =
      judgeTarget === "for"
        ? previous.motion.forSide.label
        : previous.motion.againstSide.label;
    const heardContext = previous.events
      .filter((event) =>
        [
          "speech",
          "testimony",
          "press",
          "evidence",
          "player_turn",
          "interjection",
          "moderator_ruling",
        ].includes(event.kind),
      )
      .slice(-4)
      .map((event) => debateSpokenText(event.content).trim())
      .filter(Boolean)
      .join("\n");
    const task =
      guidedKind === "gavel"
        ? "Write one short, neutral Judge direction to both advocates. It may demand clarification, redirect them to the motion, or ask them to answer the strongest objection. Do not choose a winner."
        : `Write one crisp, neutral Judge question for the ${targetLabel} side. Test its reasoning or evidence without arguing for either side.`;
    setJudgeComposerGenerating(true);
    setError(null);
    try {
      const result = await props.request<{ prompt?: string }>(
        "/api/composer/random-prompt",
        requestBody({
          mode: "sandbox",
          preferredProvider: previous.provider,
          modelOverride: previous.model,
          recentMessages: [
            {
              role: "assistant",
              botName: "Debate floor",
              content: [
                `Motion: ${previous.motion.motion}`,
                `For: ${previous.motion.forSide.label}`,
                `Against: ${previous.motion.againstSide.label}`,
                heardContext ? `Recent public floor:\n${heardContext}` : "",
                task,
                "Return only the Judge's words.",
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ],
        }),
      );
      const prompt = result.prompt?.trim() ?? "";
      if (!prompt) return;
      if (guidedKind === "gavel") {
        setJudgeGavelDraft(
          prompt.slice(0, DEBATE_JUDGE_GAVEL_MESSAGE_MAX_LENGTH),
        );
      } else {
        setPlayerDraft(prompt.slice(0, DEBATE_PLAYER_TURN_MAX_LENGTH));
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Prism could not draft a Judge response.",
      );
    } finally {
      if (mountedRef.current) setJudgeComposerGenerating(false);
    }
  };

  const submitJudgeComposerDraft = async (
    kind: "gavel" | "question",
    contentOverride?: string,
  ): Promise<void> => {
    if (kind === "gavel") {
      await submitJudgeGavelMessage(undefined, false, contentOverride);
      return;
    }
    await submitPlayerTurnContent(contentOverride ?? playerDraft);
  };

  const submitTurnaboutAction = async (
    action: "press" | "present_evidence" | "pass",
    statementId: string,
  ): Promise<void> => {
    const previous = activeSession;
    if (!previous || previous.format !== "turnabout" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/turnabout-action`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey(`turnabout-${action}`),
          action,
          statementId,
          evidenceSourceId:
            action === "present_evidence"
              ? turnaboutEvidenceSourceId
              : undefined,
        }),
      );
      if (mountedRef.current) setBusy(false);
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The record action was unavailable.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const submitVerdict = async (
    sideId: DebateSideId,
    reasonOverride?: string,
  ): Promise<void> => {
    const previous = activeSession;
    if (!previous || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/verdict`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("verdict"),
          sideId,
          reason: reasonOverride ?? playerDraft,
        }),
      );
      if (mountedRef.current) setBusy(false);
      setPlayerDraft("");
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The verdict was unavailable.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const cancelCurrentPresentation = (): void => {
    presentationRunRef.current += 1;
    cancelJudgeGavelCeremonyRef.current?.();
    props.onStopUtterance?.();
    void stopDebateIdentAudio();
    stopDebateAmbientBotVocalization();
    debateAtmosphereControllerRef.current?.setPresentationSuspended(true, 60);
    if (speechRevealRunRef.current) {
      if (speechRevealRunRef.current.frameId !== null) {
        window.cancelAnimationFrame(speechRevealRunRef.current.frameId);
      }
      speechRevealRunRef.current.cancel();
      speechRevealRunRef.current = null;
    }
    setLiveGavelCue(null);
    setSpeakerHandoff(null);
    setAudiencePressurePresentationEventId(null);
    setInterruptCameraView(null);
    setOverlapSpeakingBotIds(new Set());
    replaceLiveReveal(null);
    setPresenting(false);
  };

  /**
   * Cut a live line for graceful Pause: freeze the heard caption with an em
   * dash, stop voice, and abort the presentation run without clearing the cut.
   */
  const interruptPresentationForRecess = (
    eventId: string | null,
  ): void => {
    presentationRunRef.current += 1;
    cancelJudgeGavelCeremonyRef.current?.();
    props.onStopUtterance?.();
    void stopDebateIdentAudio();
    stopDebateAmbientBotVocalization();
    debateAtmosphereControllerRef.current?.setPresentationSuspended(true, 60);
    if (speechRevealRunRef.current) {
      if (speechRevealRunRef.current.frameId !== null) {
        window.cancelAnimationFrame(speechRevealRunRef.current.frameId);
      }
      speechRevealRunRef.current.cancel();
      speechRevealRunRef.current = null;
    }
    setLiveGavelCue(null);
    setSpeakerHandoff(null);
    setAudiencePressurePresentationEventId(null);
    setInterruptCameraView(null);
    setOverlapSpeakingBotIds(new Set());
    const snapshot = presentationStore.getSnapshot();
    if (
      eventId &&
      snapshot.eventId === eventId &&
      snapshot.visibleContent.length > 0
    ) {
      replaceLiveReveal({
        eventId,
        visibleContent: debateInterruptedSpeechCaption(snapshot.visibleContent),
        speechTiming: null,
      });
    } else {
      replaceLiveReveal(null);
    }
    setPresenting(false);
  };

  const interruptedPresentationEventId = (
    session: DebateSessionV1,
  ): string | null => {
    const eventId =
      presentationPlaybackEventIdRef.current ?? presentationEventId;
    if (!eventId) return null;
    const event = session.events.find((candidate) => candidate.id === eventId);
    if (!event || event.speakerKind === "system" || event.kind === "error") {
      return null;
    }
    const snapshot = presentationStore.getSnapshot();
    if (
      snapshot.eventId === event.id &&
      snapshot.visibleContent.length >= event.content.length
    ) {
      return null;
    }
    return event.id;
  };

  const triggerJudgeGavelSmash = (
    kind: DebateModeratorGavelCue["kind"],
    eventId?: string,
  ): void => {
    judgeGavelSmashShowmanshipKindRef.current = kind;
    if (judgeGavelOvertimeBurstActiveRef.current) {
      judgeGavelOvertimeStrikeCountRef.current += 1;
    }
    judgeGavelSmashCounterRef.current += 1;
    const cue: DebateModeratorGavelCue = {
      eventId: eventId ?? `player-smash:${judgeGavelSmashCounterRef.current}`,
      kind,
    };
    setJudgeGavelSmashCue(cue);
    if (judgeGavelSmashClearTimerRef.current) {
      window.clearTimeout(judgeGavelSmashClearTimerRef.current);
    }
    judgeGavelSmashClearTimerRef.current = window.setTimeout(
      () => {
        setJudgeGavelSmashCue((current) =>
          current?.eventId === cue.eventId ? null : current,
        );
        judgeGavelSmashClearTimerRef.current = null;
      },
      debateModeratorGavelSpeechLeadMs(kind) + 220,
    );
  };

  const triggerAudienceOrderResponse = (args: {
    eventId: string;
    kind: "awkward" | "hush";
    performGavel?: boolean;
    resetAfterSequence: number;
    sessionId: string;
  }): void => {
    audienceOrderResponseCounterRef.current += 1;
    const response: DebateAudienceOrderResponse = {
      id: audienceOrderResponseCounterRef.current,
      kind: args.kind,
      resetAfterSequence: args.resetAfterSequence,
      returningRoomTone: false,
      sessionId: args.sessionId,
    };
    if (args.performGavel !== false) {
      triggerJudgeGavelSmash("order");
    }
    setAudiencePressureReset({
      resetAfterSequence: args.resetAfterSequence,
      sessionId: args.sessionId,
    });
    setAudienceOrderResponse(response);
    playDebateAudienceReaction("order", args.eventId);
    if (audienceOrderResponseClearTimerRef.current !== null) {
      window.clearTimeout(audienceOrderResponseClearTimerRef.current);
    }
    if (audienceRoomToneReturnTimerRef.current !== null) {
      window.clearTimeout(audienceRoomToneReturnTimerRef.current);
    }
    audienceRoomToneReturnTimerRef.current = window.setTimeout(() => {
      setAudienceOrderResponse((current) =>
        current?.id === response.id
          ? { ...current, returningRoomTone: true }
          : current,
      );
      audienceRoomToneReturnTimerRef.current = null;
    }, 100);
    audienceOrderResponseClearTimerRef.current = window.setTimeout(() => {
      setAudienceOrderResponse((current) =>
        current?.id === response.id ? null : current,
      );
      audienceOrderResponseClearTimerRef.current = null;
    }, 4_100);
  };
  triggerAudienceOrderResponseRef.current = triggerAudienceOrderResponse;

  const finishJudgeGavelCeremony = (
    gate: DebateJudgeGavelCeremonyGate,
    struck: boolean,
  ): void => {
    if (judgeGavelCeremonyGateRef.current !== gate) return;
    if (gate.cueTimer !== null) window.clearTimeout(gate.cueTimer);
    if (gate.cameraTimer !== null) window.clearTimeout(gate.cameraTimer);
    if (gate.settleTimer !== null) window.clearTimeout(gate.settleTimer);
    judgeGavelCeremonyGateRef.current = null;
    setJudgeGavelCeremony(null);
    setJudgeGavelMissedCameraView(null);
    gate.resolve(struck);
  };

  const cancelJudgeGavelCeremony = (): void => {
    const gate = judgeGavelCeremonyGateRef.current;
    if (!gate) return;
    gate.ready = false;
    finishJudgeGavelCeremony(gate, false);
  };

  const requestJudgeGavelCeremony = (
    cue: DebateModeratorGavelCue,
  ): Promise<boolean> => {
    cancelJudgeGavelCeremony();
    return new Promise((resolve) => {
      const gate: DebateJudgeGavelCeremonyGate = {
        cue,
        ready: true,
        cueTimer: null,
        cameraTimer: null,
        settleTimer: null,
        resolve,
      };
      judgeGavelCeremonyGateRef.current = gate;
      setJudgeGavelMissedCameraView(null);
      setJudgeGavelCeremony({
        eventId: cue.eventId,
        kind: cue.kind,
        status: "ready",
      });
      gate.cueTimer = window.setTimeout(() => {
        if (judgeGavelCeremonyGateRef.current !== gate || !gate.ready) return;
        gate.ready = false;
        setJudgeGavelCeremony({
          eventId: cue.eventId,
          kind: cue.kind,
          status: "missed",
        });
        setJudgeGavelMissedCameraView(
          stableIndex(`${cue.eventId}:missed-gavel-camera`, 2) === 0
            ? "left"
            : "right",
        );
        gate.cameraTimer = window.setTimeout(
          () => {
            if (judgeGavelCeremonyGateRef.current !== gate) return;
            setJudgeGavelMissedCameraView("moderator");
            gate.cameraTimer = null;
          },
          Math.floor(DEBATE_JUDGE_GAVEL_MISSED_BEAT_MS / 2),
        );
        gate.settleTimer = window.setTimeout(
          () => finishJudgeGavelCeremony(gate, false),
          DEBATE_JUDGE_GAVEL_MISSED_BEAT_MS,
        );
      }, DEBATE_JUDGE_GAVEL_CUE_WINDOW_MS);
    });
  };

  const strikeJudgeGavelCeremony = (): void => {
    const gate = judgeGavelCeremonyGateRef.current;
    if (!gate?.ready) return;
    gate.ready = false;
    if (gate.cueTimer !== null) {
      window.clearTimeout(gate.cueTimer);
      gate.cueTimer = null;
    }
    setJudgeGavelCeremony(null);
    triggerJudgeGavelSmash(gate.cue.kind);
    gate.settleTimer = window.setTimeout(
      () => finishJudgeGavelCeremony(gate, true),
      debateModeratorGavelSpeechLeadMs(gate.cue.kind),
    );
  };
  requestJudgeGavelCeremonyRef.current = requestJudgeGavelCeremony;
  strikeJudgeGavelCeremonyRef.current = strikeJudgeGavelCeremony;
  cancelJudgeGavelCeremonyRef.current = cancelJudgeGavelCeremony;

  const orderDebateAudience = async (): Promise<void> => {
    const previous = activeSession;
    if (
      !previous ||
      previous.playerRole !== "judge" ||
      debateJudgeGavelLockedForJury(previous) ||
      previous.objectionRuling?.status === "awaiting_ruling" ||
      previous.judgeGavel?.status === "awaiting_message" ||
      previous.playerVerdict !== null ||
      previous.status === "completed" ||
      previous.status === "cancelled" ||
      previous.status === "failed" ||
      previous.status === "paused"
    ) {
      return;
    }
    if (Date.now() < judgeGavelSmashUntilRef.current) {
      triggerJudgeGavelSmash("order");
      return;
    }
    if (
      busy ||
      audienceOrderSavingRef.current ||
      debateFloorMutationInFlightRef.current
    ) {
      return;
    }

    const target = judgeGavelActiveTarget;
    const presentationSnapshot = presentationStore.getSnapshot();
    const heardCharacterCount =
      target && presentationSnapshot.eventId === target.id
        ? presentationSnapshot.visibleContent.length
        : (target?.content.length ?? 0);
    const resetAfterSequence =
      target?.sequence ?? previous.events.at(-1)?.sequence ?? 0;
    const responseEventId = `audience-order:${previous.id}:${previous.revision}`;
    judgeGavelSmashUntilRef.current =
      Date.now() + DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS;
    triggerAudienceOrderResponse({
      eventId: responseEventId,
      kind: currentAudiencePressureScore >= 45 ? "hush" : "awkward",
      resetAfterSequence,
      sessionId: previous.id,
    });

    audienceOrderSavingRef.current = true;
    debateFloorMutationInFlightRef.current = true;
    setAudienceOrderSaving(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/judge-gavel/order`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("judge-gavel-order"),
          eventId: target?.id ?? null,
          heardCharacterCount,
        }),
      );
      if (mountedRef.current) {
        setActiveSession((current) =>
          current?.id === previous.id ? result.session : current,
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The order strike could not be saved.",
      );
    } finally {
      audienceOrderSavingRef.current = false;
      debateFloorMutationInFlightRef.current = false;
      if (mountedRef.current) setAudienceOrderSaving(false);
    }
  };
  orderDebateAudienceRef.current = orderDebateAudience;

  const swingJudgeGavel = async (overtimeOverride?: boolean): Promise<void> => {
    const previous = activeSession;
    if (
      !previous ||
      previous.playerRole !== "judge" ||
      debateJudgeGavelLockedForJury(previous) ||
      previous.objectionRuling?.status === "awaiting_ruling" ||
      previous.judgeGavel?.status === "awaiting_message" ||
      busy ||
      debateFloorMutationInFlightRef.current
    ) {
      return;
    }
    debateFloorMutationInFlightRef.current = true;
    const target = judgeGavelActiveTarget;
    const presentationSnapshot = presentationStore.getSnapshot();
    const heardCharacterCount =
      target && presentationSnapshot.eventId === target.id
        ? presentationSnapshot.visibleContent.length
        : (target?.content.length ?? 0);
    const targetClock =
      target && presentationSnapshot.eventId === target.id
        ? debateTurnClockState(target, presentationSnapshot.speechTiming)
        : judgeGavelActiveTargetClock;
    const overtime =
      overtimeOverride ??
      (target?.speakerKind === "advocate" &&
        targetClock?.status === "overtime");
    if (presenting) cancelCurrentPresentation();
    judgeGavelSmashUntilRef.current =
      Date.now() + DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS;
    suppressNextJudgeGavelPresentationCueRef.current = true;
    judgeGavelOvertimeBurstActiveRef.current = overtime;
    judgeGavelOvertimeStrikeCountRef.current = 0;
    triggerJudgeGavelSmash(overtime ? "attention" : "order");
    triggerAudienceOrderResponse({
      eventId: `semantic-gavel:${previous.id}:${previous.revision}`,
      kind: "hush",
      performGavel: false,
      resetAfterSequence:
        target?.sequence ?? previous.events.at(-1)?.sequence ?? 0,
      sessionId: previous.id,
    });
    setBusy(true);
    setError(null);
    try {
      if (overtime) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS),
        );
        if (!mountedRef.current) return;
      }
      const strikeCount = overtime
        ? Math.max(1, judgeGavelOvertimeStrikeCountRef.current)
        : undefined;
      judgeGavelOvertimeBurstActiveRef.current = false;
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/judge-gavel`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey(
            overtime ? "judge-gavel-overtime" : "judge-gavel",
          ),
          eventId: target?.id ?? null,
          heardCharacterCount,
          overtime,
          strikeCount,
        }),
      );
      const gavelEvent = [...result.session.events]
        .reverse()
        .find((event) => event.kind === "judge_gavel");
      if (!gavelEvent) {
        suppressNextJudgeGavelPresentationCueRef.current = false;
      }
      setJudgeGavelNowMs(Date.now());
      if (mountedRef.current) setBusy(false);
      const adoption = adoptSession(
        {
          ...previous,
          events: gavelEvent
            ? result.session.events.filter(
                (event) => event.id !== gavelEvent.id,
              )
            : result.session.events,
        },
        result.session,
      );
      debateFloorMutationInFlightRef.current = false;
      await adoption;
    } catch (caught) {
      judgeGavelOvertimeBurstActiveRef.current = false;
      judgeGavelOvertimeStrikeCountRef.current = 0;
      judgeGavelSmashUntilRef.current = 0;
      suppressNextJudgeGavelPresentationCueRef.current = false;
      setError(
        caught instanceof Error
          ? caught.message
          : "The Judge's gavel was unavailable.",
      );
      setTranscriptVisibleThroughSequence(null);
      replaceLiveReveal(null);
    } finally {
      debateFloorMutationInFlightRef.current = false;
      judgeGavelOvertimeBurstActiveRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };
  judgeGavelSmashRef.current = triggerJudgeGavelSmash;
  swingJudgeGavelRef.current = () => swingJudgeGavel();

  const submitJudgeGavelMessage = async (
    event?: FormEvent<HTMLFormElement>,
    pass = false,
    contentOverride?: string,
  ): Promise<void> => {
    event?.preventDefault();
    const previous = activeSession;
    const content = contentOverride ?? judgeGavelDraft;
    if (
      !previous ||
      previous.judgeGavel?.status !== "awaiting_message" ||
      busy ||
      (!pass && !content.trim())
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/judge-gavel/message`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey(
            pass ? "judge-gavel-resume" : "judge-gavel-message",
          ),
          content: pass ? undefined : content,
          pass,
        }),
      );
      setJudgeGavelDraft("");
      setJudgeComposerOpen(false);
      if (mountedRef.current) setBusy(false);
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The debaters could not answer the Judge.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const pauseOrResume = async (): Promise<void> => {
    const previous = activeSession;
    if (
      !previous ||
      (previous.status !== "paused" &&
        previous.participantObjection?.status === "awaiting_reason") ||
      (previous.status !== "paused" &&
        previous.judgeGavel?.status === "awaiting_message") ||
      (previous.status === "paused" && busy) ||
      pauseInFlightRef.current
    ) {
      return;
    }
    const resume = previous.status === "paused";
    if (
      !resume &&
      pauseCooldownUntilMs > Date.now()
    ) {
      return;
    }
    spectatorPresentationSealInFlightRef.current = null;
    pauseInFlightRef.current = true;
    debateFloorMutationInFlightRef.current = true;
    const startSpectatorWatch =
      resume && debateSpectatorAwaitingFirstWatch(previous);
    const lifecycleCutscene = !juryCameraActive;
    const silentLifecycle = !lifecycleCutscene || startSpectatorWatch;
    const previousEventIds = new Set(previous.events.map((event) => event.id));
    let replayEventId = resume
      ? (previous.pausedPresentationEventId ?? null)
      : interruptedPresentationEventId(previous);
    if (!resume) {
      // Always cut immediately — same floor-hold contract as leaving mid-speech.
      interruptPresentationForRecess(replayEventId);
    }
    setBusy(true);
    setError(null);
    try {
      const lifecyclePath = `/api/debates/${encodeURIComponent(previous.id)}/${
        resume ? "resume" : "pause"
      }`;
      const lifecycleIdempotencyKey = nextMutationKey(
        startSpectatorWatch ? "spectator-start" : resume ? "resume" : "pause",
      );
      const requestQuietLifecycle = (session: DebateSessionV1) =>
        props.request<{ session: DebateSessionV1 }>(
          lifecyclePath,
          requestBody({
            expectedRevision: session.revision,
            idempotencyKey: `${lifecycleIdempotencyKey}:quiet`,
            juryVisible: !lifecycleCutscene,
            quietSave: true,
            ...(startSpectatorWatch ? { exitRecovery: true } : {}),
            ...(!resume ? { presentationEventId: replayEventId } : {}),
          }),
        );
      const requestAnnounceLifecycle = (session: DebateSessionV1) =>
        props.request<{ session: DebateSessionV1 }>(
          `${lifecyclePath}/announce`,
          requestBody({
            expectedRevision: session.revision,
            idempotencyKey: `${lifecycleIdempotencyKey}:announce`,
          }),
        );
      let quiet: { session: DebateSessionV1 };
      try {
        quiet = await requestQuietLifecycle(previous);
      } catch (caught) {
        if (!debateRequestIsRevisionConflict(caught)) throw caught;
        const refreshed = await props.request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(previous.id)}?perspective=live`,
        );
        if (!resume && refreshed.session.status === "paused") {
          quiet = refreshed;
        } else if (resume && refreshed.session.status !== "paused") {
          quiet = refreshed;
        } else {
          if (!resume && !replayEventId) {
            replayEventId =
              debatePresentationEvents(
                previous,
                refreshed.session,
                debateJuryCameraIsActive(
                  debateCameraModeForSession(
                    cameraModeRef.current,
                    refreshed.session,
                  ),
                  refreshed.session,
                ),
              ).find(
                (event) =>
                  event.speakerKind !== "system" && event.kind !== "error",
              )?.id ?? null;
          }
          quiet = await requestQuietLifecycle(refreshed.session);
        }
      }
      // Quiet bookmark is authoritative before any ceremony speech starts.
      if (mountedRef.current) {
        setActiveSession(quiet.session);
        if (resume || silentLifecycle) setBusy(false);
      }
      let result = quiet;
      if (!silentLifecycle) {
        try {
          result = await requestAnnounceLifecycle(quiet.session);
        } catch (caught) {
          if (!debateRequestIsRevisionConflict(caught)) throw caught;
          const refreshed = await props.request<{ session: DebateSessionV1 }>(
            `/api/debates/${encodeURIComponent(previous.id)}?perspective=live`,
          );
          if (
            (!resume && refreshed.session.status !== "paused") ||
            (resume && refreshed.session.status === "paused")
          ) {
            throw caught;
          }
          result = await requestAnnounceLifecycle(refreshed.session);
        }
        if (mountedRef.current) setActiveSession(result.session);
      }
      const lifecycleEvent = result.session.events.find(
        (event) =>
          !previousEventIds.has(event.id) &&
          event.stepKey === (resume ? "resume" : "pause"),
      );
      if (resume) {
        if (mountedRef.current) setBusy(false);
        if (startSpectatorWatch) {
          await adoptSession(null, result.session, { playIntro: true });
          void loadSessions();
          return;
        }
        const heldEventId =
          result.session.pausedPresentationEventId ?? replayEventId;
        const pausedPresentationEvent = heldEventId
          ? result.session.events.find((event) => event.id === heldEventId)
          : undefined;
        const judgeResumedWithGavel =
          lifecycleEvent !== undefined &&
          lifecycleCutscene &&
          result.session.playerRole === "judge";
        if (judgeResumedWithGavel && lifecycleEvent) {
          triggerJudgeGavelSmash("order", lifecycleEvent.id);
          triggerAudienceOrderResponse({
            eventId: lifecycleEvent.id,
            kind: "hush",
            performGavel: false,
            resetAfterSequence: lifecycleEvent.sequence,
            sessionId: result.session.id,
          });
        }
        if (lifecycleEvent) {
          await adoptSession(previous, result.session, {
            resumedJudgeGavelPresentationEventId: judgeResumedWithGavel
              ? lifecycleEvent.id
              : null,
          });
        }
        if (pausedPresentationEvent) {
          const filledSession = debateSessionWithRecessResumeFiller(
            result.session,
            pausedPresentationEvent.id,
          );
          await adoptSession(
            {
              ...filledSession,
              events: filledSession.events.filter(
                (event) => event.sequence < pausedPresentationEvent.sequence,
              ),
            },
            {
              ...filledSession,
              events: filledSession.events.filter(
                (event) => event.sequence <= pausedPresentationEvent.sequence,
              ),
            },
            { automaticJudgeGavel: true },
          );
          const hasRemainingEvents = result.session.events.some(
            (event) => event.sequence > pausedPresentationEvent.sequence,
          );
          if (hasRemainingEvents) {
            await adoptSession(
              {
                ...result.session,
                events: result.session.events.filter(
                  (event) =>
                    event.sequence <= pausedPresentationEvent.sequence,
                ),
              },
              result.session,
            );
            setPauseCooldownUntilMs(Date.now() + DEBATE_PAUSE_COOLDOWN_MS);
            void loadSessions();
            return;
          }
        }
        setActiveSession(result.session);
        setPauseCooldownUntilMs(Date.now() + DEBATE_PAUSE_COOLDOWN_MS);
      } else {
        if (lifecycleEvent) {
          if (mountedRef.current) setBusy(false);
          // Stay recessed while the moderator calls recess; overlay hides while presenting.
          await adoptSession(previous, result.session, {
            automaticJudgeGavel: true,
          });
        }
        setActiveSession(result.session);
      }
      void loadSessions();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `${resume ? "Resume" : "Pause"} was unavailable.`,
      );
      if (!resume) {
        setTranscriptVisibleThroughSequence(null);
        replaceLiveReveal(null);
      }
    } finally {
      pauseInFlightRef.current = false;
      debateFloorMutationInFlightRef.current = false;
      setBusy(false);
    }
  };
  pauseOrResumeRef.current = pauseOrResume;

  useEffect(() => {
    if (pauseCooldownUntilMs <= Date.now()) return;
    const timer = window.setInterval(() => {
      setPauseCooldownTick((tick) => tick + 1);
      if (pauseCooldownUntilMs <= Date.now()) {
        window.clearInterval(timer);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [pauseCooldownUntilMs]);

  const exitLiveSessionToStudio = async (): Promise<void> => {
    const previous = activeSession;
    let replayEventId = previous
      ? interruptedPresentationEventId(previous)
      : null;
    cancelCurrentPresentation();
    // Hard silence before the menu remounts — no lingering advocate voice.
    props.onStopUtterance?.();
    void stopDebateIdentAudio();
    stopDebateAmbientBotVocalization();
    debateAtmosphereControllerRef.current?.setPresentationSuspended(true, 40);
    presentationStore.clear();
    activeSessionIdRef.current = null;
    spectatorPresentationSealInFlightRef.current = null;
    setEarlyEndOpen(false);
    setView("dashboard");
    setActiveSession(null);
    if (previous && debateSessionNeedsReturnPause(previous)) {
      try {
        const pauseForExit = (
          session: DebateSessionV1,
          presentationEventId: string | null,
        ) =>
          props.request<{ session: DebateSessionV1 }>(
            `/api/debates/${encodeURIComponent(previous.id)}/pause`,
            requestBody({
              expectedRevision: session.revision,
              idempotencyKey: nextMutationKey("exit-recess"),
              exitRecovery: true,
              presentationEventId,
            }),
          );
        try {
          await pauseForExit(
            previous,
            debateExitPresentationEventId(previous, replayEventId),
          );
        } catch (caught) {
          if (!debateRequestIsRevisionConflict(caught)) throw caught;
          const refreshed = await props.request<{
            session: DebateSessionV1;
          }>(
            `/api/debates/${encodeURIComponent(previous.id)}?perspective=live`,
          );
          if (debateSessionNeedsReturnPause(refreshed.session)) {
            if (!replayEventId) {
              replayEventId =
                debatePresentationEvents(
                  previous,
                  refreshed.session,
                  debateJuryCameraIsActive(
                    debateCameraModeForSession(
                      cameraModeRef.current,
                      refreshed.session,
                    ),
                    refreshed.session,
                  ),
                ).find(
                  (event) =>
                    event.speakerKind !== "system" && event.kind !== "error",
                )?.id ?? null;
            }
            await pauseForExit(
              refreshed.session,
              debateExitPresentationEventId(refreshed.session, replayEventId),
            );
          }
        }
      } catch {
        // Opening the unfinished session applies a final recovery pause if the
        // process disappeared before this best-effort lifecycle write landed.
      }
    }
    void loadSessions();
  };

  const endDebateEarly = async (): Promise<void> => {
    const previous = activeSession;
    if (
      !previous ||
      previous.participantObjection?.status === "awaiting_reason" ||
      busy ||
      presenting
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/end-early`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("end-early"),
        }),
      );
      setEarlyEndOpen(false);
      setPlayerDraft("");
      if (mountedRef.current) setBusy(false);
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The early conclusion was unavailable.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const raiseParticipantObjection = async (): Promise<void> => {
    const previous = activeSession;
    const target = previous?.events.find(
      (candidate) => candidate.id === presentationEventId,
    );
    const presentationSnapshot = presentationStore.getSnapshot();
    const heardCharacterCount =
      target && presentationSnapshot.eventId === target.id
        ? presentationSnapshot.visibleContent.length
        : 0;
    if (
      !previous ||
      previous.format !== "forum" ||
      previous.playerRole !== "participant" ||
      previous.status !== "live" ||
      previous.participantObjection ||
      !target ||
      target.kind !== "speech" ||
      target.speakerKind !== "advocate" ||
      target.sideId === null ||
      target.sideId === previous.playerSideId ||
      target.interrupted === true ||
      heardCharacterCount < 24 ||
      heardCharacterCount >= target.content.length ||
      !presenting ||
      busy ||
      debateFloorMutationInFlightRef.current ||
      judgeGavelKeyboardBlocked
    ) {
      return;
    }
    debateFloorMutationInFlightRef.current = true;
    cancelCurrentPresentation();
    setParticipantInterjectionOpen(false);
    setParticipantObjectionDraft("");
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/participant-objection`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("participant-objection"),
          eventId: target.id,
          heardCharacterCount,
        }),
      );
      if (mountedRef.current) setBusy(false);
      debateFloorMutationInFlightRef.current = false;
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The objection could not be raised.",
      );
      setTranscriptVisibleThroughSequence(null);
      replaceLiveReveal(null);
    } finally {
      debateFloorMutationInFlightRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };
  raiseParticipantObjectionRef.current = raiseParticipantObjection;

  const resolveParticipantObjection = async (
    event?: FormEvent<HTMLFormElement>,
    withdraw = false,
  ): Promise<void> => {
    event?.preventDefault();
    const previous = activeSession;
    if (
      !previous ||
      previous.playerRole !== "participant" ||
      previous.status !== "waiting_for_player" ||
      previous.stepKey !== "participant_objection_reason" ||
      previous.participantObjection?.status !== "awaiting_reason" ||
      (!withdraw && !participantObjectionDraft.trim()) ||
      presenting ||
      busy ||
      debateFloorMutationInFlightRef.current
    ) {
      return;
    }
    debateFloorMutationInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/participant-objection/resolve`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey(
            withdraw
              ? "participant-objection-withdraw"
              : "participant-objection-reason",
          ),
          content: withdraw ? undefined : participantObjectionDraft,
          withdraw,
        }),
      );
      setParticipantObjectionDraft("");
      if (mountedRef.current) setBusy(false);
      debateFloorMutationInFlightRef.current = false;
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The moderator could not rule on the objection.",
      );
    } finally {
      debateFloorMutationInFlightRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const submitInterjection = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const previous = activeSession;
    const target = previous?.events.find(
      (candidate) => candidate.id === presentationEventId,
    );
    const presentationSnapshot = presentationStore.getSnapshot();
    if (
      !previous ||
      !target ||
      target.kind !== "speech" ||
      target.sideId === previous.playerSideId ||
      presentationSnapshot.eventId !== target.id ||
      presentationSnapshot.visibleContent.length < 24 ||
      !interjectionDraft.trim() ||
      busy
    ) {
      return;
    }
    cancelCurrentPresentation();
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/interject`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("interject"),
          eventId: target.id,
          heardCharacterCount: presentationSnapshot.visibleContent.length,
          content: interjectionDraft,
        }),
      );
      if (mountedRef.current) setBusy(false);
      setInterjectionDraft("");
      setParticipantInterjectionOpen(false);
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The moderator could not hear the interjection.",
      );
      setTranscriptVisibleThroughSequence(null);
      replaceLiveReveal(null);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const deleteSession = async (): Promise<void> => {
    const session = pendingDeleteSession;
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(session.id)}`,
      );
      const result = await props.request<{
        actionRun: { id: string };
      }>(`/api/debates/${encodeURIComponent(session.id)}`, {
        method: "DELETE",
        body: JSON.stringify({
          expectedRevision: detail.session.revision,
          idempotencyKey: nextMutationKey("delete"),
        }),
      });
      setPendingDeleteSession(null);
      setSessions((current) =>
        current.filter((candidate) => candidate.id !== session.id),
      );
      if (deleteUndoResetTimerRef.current) {
        clearTimeout(deleteUndoResetTimerRef.current);
      }
      setDeleteUndo({
        runId: result.actionRun.id,
        sessionId: session.id,
        motion: session.motion,
      });
      deleteUndoResetTimerRef.current = setTimeout(() => {
        setDeleteUndo(null);
        deleteUndoResetTimerRef.current = null;
      }, 8_000);
      if (activeSession?.id === session.id) {
        setActiveSession(null);
        setView("dashboard");
      }
    } catch (caught) {
      setPendingDeleteSession(null);
      setError(
        caught instanceof Error ? caught.message : "Delete was unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };

  const undoDeleteSession = async (): Promise<void> => {
    const undo = deleteUndo;
    if (!undo || busy) return;
    setBusy(true);
    setError(null);
    try {
      await props.request(
        "/api/prism/actions/undo",
        requestBody({
          runId: undo.runId,
          surface: {
            surfaceId: "debate",
            debateSessionId: undo.sessionId,
          },
        }),
      );
      if (deleteUndoResetTimerRef.current) {
        clearTimeout(deleteUndoResetTimerRef.current);
        deleteUndoResetTimerRef.current = null;
      }
      setDeleteUndo(null);
      await loadSessions();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Undo was unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };

  const renderArchiveSessionRow = (
    session: DebateSessionListItemV1,
    index: number,
  ): React.JSX.Element => (
    <li key={session.id} data-status={session.status}>
      <span className={styles.archiveIndex} aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <button
        type="button"
        className={styles.sessionOpen}
        onClick={() => void openSession(session)}
        disabled={busy}
      >
        <strong>{session.title}</strong>
        <span>
          {session.motion} ·{" "}
          {session.format === "turnabout" ? "Turnabout" : "Forum"} ·{" "}
          {debateProductionName(session.format, session.formality)} ·{" "}
          {debateFormalityDescriptor(session.formality).title} ·{" "}
          {session.moderatorTitle} · {sessionStatusLabel(session)} ·{" "}
          {session.playerRole}
          {session.activeDurationMs === null
            ? ""
            : ` · ${debateActiveDurationLabel(session.activeDurationMs)}`}
        </span>
        {session.synopsisText ? (
          <em className={styles.archiveSynopsis}>
            {session.synopsisText}
          </em>
        ) : null}
      </button>
      <div className={styles.archiveActions}>
        <button
          type="button"
          className={styles.archiveReuseButton}
          onClick={() => void reuseSessionSetup(session)}
          disabled={busy}
          aria-label={`Use setup from ${session.title}`}
        >
          {setupRestoreLoadingId === session.id
            ? "Loading…"
            : "Use setup"}
        </button>
        <button
          type="button"
          className={styles.deleteButton}
          onClick={() => setPendingDeleteSession(session)}
          aria-label={`Delete ${session.motion}`}
          disabled={busy}
        >
          Remove
        </button>
      </div>
    </li>
  );

  const renderArchive = (): React.JSX.Element => {
    const openSessions = sessions.filter(
      (session) => session.status !== "completed",
    );
    const completedSessions = sessions.filter(
      (session) => session.status === "completed",
    );
    return (
    <section className={`${styles.historySection} ${styles.archivePanel}`}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Proceeding archive</p>
          <h2>Return to a proceeding</h2>
          <p>
            Open the proceeding itself, or restore its setup into a fresh
            editable workbench. Open and paused Duels stay above the completed
            record.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSessions()}
          disabled={busy}
        >
          Refresh archive
        </button>
      </div>
      {sessions.length === 0 ? (
        <div className={styles.emptyHistory}>
          <span aria-hidden="true">◇</span>
          <strong>The archive is quiet.</strong>
          <p>Your first completed or paused Duel will wait here.</p>
        </div>
      ) : (
        <div className={styles.archiveGroups}>
          {openSessions.length > 0 ? (
            <section
              className={styles.archiveGroup}
              data-archive-group="open"
              aria-labelledby="debate-archive-open-heading"
            >
              <header className={styles.archiveGroupHeading}>
                <h3 id="debate-archive-open-heading">Open</h3>
                <span>
                  {openSessions.length} proceeding
                  {openSessions.length === 1 ? "" : "s"}
                </span>
              </header>
              <ul className={styles.sessionList}>
                {openSessions.map((session, index) =>
                  renderArchiveSessionRow(session, index),
                )}
              </ul>
            </section>
          ) : null}
          {completedSessions.length > 0 ? (
            <section
              className={styles.archiveGroup}
              data-archive-group="completed"
              aria-labelledby="debate-archive-completed-heading"
            >
              <header className={styles.archiveGroupHeading}>
                <h3 id="debate-archive-completed-heading">Completed</h3>
                <span>
                  {completedSessions.length} proceeding
                  {completedSessions.length === 1 ? "" : "s"}
                </span>
              </header>
              <ul className={styles.sessionList}>
                {completedSessions.map((session, index) =>
                  renderArchiveSessionRow(session, index),
                )}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </section>
    );
  };

  const renderForumReadout = (): React.JSX.Element => {
    const seats = [
      {
        id: "for",
        label: motion.forSide.label || "For",
        bot:
          playerRole === "participant" && playerSideId === "for"
            ? playerParticipantBot
            : (botById.get(cast.forAdvocate) ?? null),
        fallback: "#42d9ff",
      },
      {
        id: "moderator",
        label: visibleModeratorTitle,
        bot: moderatorBot,
        fallback: "#a995ff",
      },
      {
        id: "against",
        label: motion.againstSide.label || "Against",
        bot:
          playerRole === "participant" && playerSideId === "against"
            ? playerParticipantBot
            : (botById.get(cast.againstAdvocate) ?? null),
        fallback: "#ff5f8f",
      },
    ] as const;
    return (
      <section
        className={styles.forumReadout}
        aria-label={`${debateProductionName(format, formality)} schematic`}
        data-format={format}
        data-ready={debateCanStart ? "true" : undefined}
      >
        <header>
          <span>{debateProductionName(format, formality)} chamber</span>
          <strong>{format === "turnabout" ? "Turnabout" : "Forum"}</strong>
        </header>
        <div className={styles.forumCircuit}>
          <span className={styles.forumBeam} aria-hidden="true" />
          {seats.map((seat) => {
            const accent = seat.bot?.color ?? seat.fallback;
            return (
              <div
                className={styles.forumCircuitSeat}
                data-role={seat.id}
                key={seat.id}
                style={{ "--debate-seat-color": accent } as CSSProperties}
              >
                <span aria-hidden="true">
                  {seat.bot
                    ? props.renderBotGlyph(seat.bot.glyph, {
                        size: 22,
                        strokeWidth: 1.45,
                      })
                    : "◇"}
                </span>
                <small>{seat.label}</small>
                <strong>{seat.bot?.name ?? "Uncast"}</strong>
              </div>
            );
          })}
          <span className={styles.forumCircuitPrism} aria-hidden="true">
            ◇
          </span>
        </div>
        <p>{motion.motion || "The motion is not ready yet."}</p>
        <small className={styles.formatReadout}>
          {formalityDescriptor.title} ·{" "}
          {roleSummary(playerRole, format, formality)}
          {format === "turnabout"
            ? " · action-driven"
            : ` · ${forumRoundMode === "auto" ? "Auto" : forumRoundPlan.count} ${forumRoundPlan.count === 1 ? "round" : "rounds"}`}
          {juryEnabled ? " · Jury on" : " · Jury off"}
        </small>
      </section>
    );
  };

  const renderLobby = (): React.JSX.Element => (
    <main
      className={`${styles.lobby} ${styles.dashboard}`}
      data-debate-surface="dashboard"
      data-debate-format={format}
      data-theme={props.theme}
    >
      <header className={styles.lobbyHeader}>
        <button
          type="button"
          className={styles.exitButton}
          onClick={props.onExit}
        >
          ← Exit
        </button>
        <div className={styles.studioIdentity}>
          <p className={styles.eyebrow}>PRISM / Debate</p>
          <h1>Debate Studio</h1>
          <span>
            {format === "turnabout" ? "Turnabout" : "Forum"} ·{" "}
            {formalityDescriptor.title} · Prism fills the brief
          </span>
        </div>
        <div className={styles.lobbyActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={startNewDebate}
            disabled={props.bots.length < 2}
            data-tutorial-target="debate-new"
          >
            <span aria-hidden="true">＋</span>
            New Duel
          </button>
          {props.onResetTutorial ? (
            <button
              type="button"
              className={styles.tutorialButton}
              onClick={props.onResetTutorial}
            >
              Replay walkthrough
            </button>
          ) : null}
        </div>
      </header>
      {props.bots.length < 2 ? (
        <p className={styles.notice} role="status">
          Create at least two Library bots to start a Debate.
        </p>
      ) : null}
      {error ? <DebateErrorToast key={error} message={error} /> : null}
      {setupRestoreNotice ? (
        <p className={styles.notice} role="status">
          {setupRestoreNotice}
        </p>
      ) : null}
      <div className={styles.dashboardLayout}>
        <nav className={styles.studioNav} aria-label="Debate Studio">
          <p>Shape the Debate</p>
          {(
            [
              {
                id: "motion",
                index: "01",
                label: "Motion",
                detail: motionComplete
                  ? "Debate prepared"
                  : "Shape the question",
                complete: motionComplete,
                tutorial: undefined,
              },
              {
                id: "cast",
                index: "02",
                label: "Cast",
                detail: roleChecksComplete
                  ? "Consent secured"
                  : castComplete
                    ? "Check willingness"
                    : "Seat the proceeding",
                complete: castComplete && roleChecksComplete,
                tutorial: "debate-cast",
              },
              {
                id: "evidence",
                index: "03",
                label: "Evidence",
                detail:
                  debateEvidenceItemCount(evidence) > 0 || evidence.notes.trim()
                    ? "Packet prepared"
                    : evidenceDecisionMade
                      ? "No evidence"
                      : "Optional",
                complete: evidenceDecisionMade,
                tutorial: "debate-evidence",
              },
            ] as const
          ).map((panel) => (
            <button
              type="button"
              className={styles.studioNavButton}
              data-active={studioPanel === panel.id ? "true" : undefined}
              data-complete={panel.complete ? "true" : undefined}
              data-tutorial-target={panel.tutorial}
              aria-pressed={studioPanel === panel.id}
              onClick={() => setStudioPanel(panel.id)}
              key={panel.id}
            >
              <span>{panel.index}</span>
              <strong>{panel.label}</strong>
              <small>{panel.detail}</small>
              <i aria-hidden="true">{panel.complete ? "✓" : "·"}</i>
            </button>
          ))}
          <span className={styles.studioNavRule} />
          <button
            type="button"
            className={styles.studioNavButton}
            data-active={studioPanel === "archive" ? "true" : undefined}
            aria-pressed={studioPanel === "archive"}
            aria-label="Open proceeding archive"
            onClick={() => setStudioPanel("archive")}
          >
            <span>↳</span>
            <strong>Archive</strong>
            <small>
              {sessions.length} proceeding{sessions.length === 1 ? "" : "s"}
            </small>
            <i aria-hidden="true">›</i>
          </button>
          {DEBATE_STAGE_ALIGNMENT_ENABLED ? (
            <button
              type="button"
              className={styles.studioUtilityButton}
              onClick={openStageAlignment}
              disabled={!stageAlignmentCanOpen}
              aria-label="Align stage"
              title={
                stageAlignmentCanOpen
                  ? "Stage geometry for this account and device."
                  : "Create at least three Library bots to calibrate the Debate stage."
              }
            >
              <span aria-hidden="true">⌖</span>
              Stage geometry
            </button>
          ) : null}
          <div
            className={styles.studioNavStatus}
            data-ready={debateCanStart ? "true" : undefined}
          >
            <span>Proceeding</span>
            <strong>
              {debateCanStart ? "Ready" : `${readinessCount} of 4 ready`}
            </strong>
            <div aria-hidden="true">
              <i
                style={
                  {
                    "--debate-readiness": `${readinessCount / 4}`,
                  } as CSSProperties
                }
              />
            </div>
          </div>
        </nav>
        <div className={styles.dashboardDesk} data-studio-panel={studioPanel}>
          {studioPanel === "motion" ? renderMotionStep() : null}
          {studioPanel === "cast" ? renderCastStep() : null}
          {studioPanel === "evidence" ? renderEvidenceStep() : null}
          {studioPanel === "archive" ? renderArchive() : null}
        </div>
        <aside className={styles.dashboardRail}>
          {renderForumReadout()}
          {renderReviewStep()}
        </aside>
      </div>
      {selectedEvidence ? (
        <DebateEvidenceDrawer
          item={selectedEvidence}
          closeButtonRef={sourceDrawerCloseButtonRef}
          onClose={() => setSourceDrawerId(null)}
        />
      ) : null}
      {pendingDeleteSession ? (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setPendingDeleteSession(null);
            }
          }}
        >
          <section
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="debate-delete-title"
            aria-describedby="debate-delete-description"
          >
            <p className={styles.eyebrow}>Remove proceeding</p>
            <h2 id="debate-delete-title">Delete this Debate?</h2>
            <p id="debate-delete-description">
              “{pendingDeleteSession.motion}” will leave Debate history
              immediately. PRISM can restore it through Undo for 30 days.
            </p>
            <div>
              <button
                type="button"
                className={styles.confirmKeepButton}
                onClick={() => setPendingDeleteSession(null)}
                disabled={busy}
              >
                Keep Debate
              </button>
              <button
                ref={deleteConfirmButtonRef}
                type="button"
                className={styles.confirmDeleteButton}
                onClick={() => void deleteSession()}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Delete Debate"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {deleteUndo ? (
        <div className={styles.undoToast} role="status">
          <span>“{deleteUndo.motion}” was removed.</span>
          <button
            type="button"
            onClick={() => void undoDeleteSession()}
            disabled={busy}
          >
            Undo
          </button>
        </div>
      ) : null}
      {renderStageAlignmentModal(null)}
    </main>
  );

  const renderMotionStep = (): React.JSX.Element => (
    <section
      className={`${styles.setupPanel} ${styles.dashboardPanel}`}
      data-debate-dashboard-section="motion"
    >
      <div className={styles.setupCopy}>
        <p className={styles.eyebrow}>01 / Motion chamber</p>
        <h2>Shape the fault line</h2>
        <p>
          Give Prism the idea in your own words. It will shape one fair motion
          and write a private brief for each side.
        </p>
      </div>
      <details
        className={styles.roomTuning}
        open={roomTuningOpen}
        onToggle={(event) => setRoomTuningOpen(event.currentTarget.open)}
        data-tutorial-target="debate-room"
      >
        <summary>
          <span aria-hidden="true">◇</span>
          <span>
            <strong>Tune the room</strong>
            <small>
              {format === "turnabout" ? "Turnabout" : "Forum"} ·{" "}
              {formalityDescriptor.title} ·{" "}
              {format === "forum"
                ? forumRoundMode === "auto"
                  ? `Auto · ${forumRoundPlan.count} ${forumRoundPlan.count === 1 ? "round" : "rounds"}`
                  : `${forumRoundPlan.count} fixed ${forumRoundPlan.count === 1 ? "round" : "rounds"}`
                : "Action-driven"}
            </small>
          </span>
          <em>{roomTuningOpen ? "Done" : "Tune"}</em>
        </summary>
        <div className={styles.roomTuningBody}>
          <div
            className={styles.proceedingPresets}
            data-tutorial-target="debate-presets"
          >
            <div>
              <span>Proceeding preset</span>
              <strong>
                {effectivePresetId === "custom"
                  ? "Custom"
                  : selectedPreset.name}
              </strong>
            </div>
            <div role="group" aria-label="Debate proceeding presets">
              {DEBATE_SETUP_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  data-selected={
                    effectivePresetId === preset.id ? "true" : undefined
                  }
                  aria-pressed={effectivePresetId === preset.id}
                  title={preset.summary}
                  onClick={() => applyPreset(preset.id)}
                >
                  {preset.name}
                </button>
              ))}
              {effectivePresetId === "custom" ? (
                <span className={styles.customPresetChip}>Custom</span>
              ) : null}
            </div>
          </div>
          <div
            className={styles.rowdinessControl}
            data-rowdiness={formality}
            data-tutorial-target="debate-rowdiness"
            style={
              {
                "--debate-rowdiness-progress": `${rowdinessProgress}%`,
              } as CSSProperties
            }
          >
            <div className={styles.rowdinessReadout}>
              <span>Atmosphere</span>
              <strong>{formalityDescriptor.title}</strong>
              <small>{formalityDescriptor.summary}</small>
            </div>
            <div className={styles.rowdinessInstrument}>
              <div className={styles.rowdinessEndpoints} aria-hidden="true">
                <span>University Union</span>
                <span>Daytime Showdown</span>
              </div>
              <div className={styles.rowdinessRange}>
                <div className={styles.rowdinessTrack} aria-hidden="true">
                  <span>
                    {DEBATE_ROWDINESS_SPECTRUM.map((level, index) => (
                      <i
                        key={level.id}
                        data-reached={
                          index <= rowdinessIndex ? "true" : undefined
                        }
                        data-current={
                          level.id === formality ? "true" : undefined
                        }
                      />
                    ))}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={DEBATE_ROWDINESS_SPECTRUM.length - 1}
                  step="1"
                  value={rowdinessIndex}
                  aria-label="Debate atmosphere"
                  aria-valuetext={`${formalityDescriptor.title}: ${formalityDescriptor.summary}`}
                  aria-describedby="debate-rowdiness-copy"
                  onChange={(event) => {
                    const next =
                      DEBATE_ROWDINESS_SPECTRUM[
                        Number(event.currentTarget.value)
                      ];
                    if (next) chooseFormality(next.id);
                  }}
                />
              </div>
              <p id="debate-rowdiness-copy">
                Changes the room’s heat, pacing, cut-ins, and moderator
                pressure—never the facts or Personas.
              </p>
            </div>
          </div>
          <fieldset
            className={styles.formatPicker}
            data-tutorial-target="debate-format"
          >
            <legend>Debate format</legend>
            {DEBATE_FORMAT_CATALOG.filter(
              (option) => option.availability === "available",
            ).map((option) => {
              const participantForumOnly =
                playerRole === "participant" && option.id === "turnabout";
              const disabled = participantForumOnly;
              return (
                <label
                  key={option.id}
                  data-selected={format === option.id ? "true" : undefined}
                  data-availability={
                    participantForumOnly
                      ? "participant-forum-only"
                      : option.availability
                  }
                  aria-disabled={disabled ? "true" : undefined}
                  tabIndex={disabled ? 0 : undefined}
                >
                  <input
                    type="radio"
                    name="debate-format"
                    value={option.id}
                    checked={format === option.id}
                    disabled={disabled}
                    onChange={() => {
                      if (disabled) return;
                      setFormat(option.id);
                      setRoleChecks([]);
                    }}
                  />
                  <strong>
                    {option.name}
                    <em>{option.productionName}</em>
                  </strong>
                  <span>{option.summary}</span>
                  <small>{option.cadence}</small>
                  {participantForumOnly ? <b>Participant uses Forum</b> : null}
                </label>
              );
            })}
          </fieldset>
          <div
            className={styles.proceedingPresets}
            data-tutorial-target="debate-rounds"
          >
            <div>
              <span>Rebuttal rounds</span>
              <strong title={forumRoundPlan.rationale}>
                {format === "turnabout"
                  ? "Action-driven"
                  : forumRoundMode === "auto"
                    ? `Auto · ${forumRoundPlan.count}`
                    : `${forumRoundPlan.count} fixed`}
              </strong>
            </div>
            {format === "forum" ? (
              <div role="group" aria-label="Forum rebuttal rounds">
                <button
                  type="button"
                  data-selected={forumRoundMode === "auto" ? "true" : undefined}
                  aria-pressed={forumRoundMode === "auto"}
                  title={forumRoundPlan.rationale}
                  onClick={() => setForumRoundMode("auto")}
                >
                  Auto
                </button>
                {[1, 2, 3].map((count) => (
                  <button
                    type="button"
                    key={count}
                    data-selected={
                      forumRoundMode === "fixed" && forumRoundCount === count
                        ? "true"
                        : undefined
                    }
                    aria-pressed={
                      forumRoundMode === "fixed" && forumRoundCount === count
                    }
                    onClick={() => {
                      setForumRoundMode("fixed");
                      setForumRoundCount(count);
                    }}
                  >
                    {count}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <span>Press, object, and ruling choices shape its length.</span>
              </div>
            )}
          </div>
        </div>
      </details>
      <div className={styles.motionSeed}>
        <div className={`${styles.field} ${styles.territoryField}`}>
          <label htmlFor="debate-territory">Your idea</label>
          <div className={styles.territoryInput}>
            <PrismRefractTarget
              target={{
                id: "debate-setup-topic",
                kind: "field",
                label: "debate idea",
                read: () => topic,
                preview: setTopic,
                accept: setTopic,
                disabled: () => busy,
                generate: ({ currentValue, rejectedValues, signal }) =>
                  generateDebateRefractField(
                    "debate.setup.topic",
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
                      id: "debate-territory",
                      value: topic,
                      onChange: setTopic,
                      placeholder:
                        "Is Light really Kira? Should AI art count as art? Who would win in a fight…",
                      multiline: true,
                      ariaLabel: "Your idea",
                      className: styles.pickAwareSetupField,
                      disabled: busy,
                    })}
                  </div>
                ) : (
                  <textarea
                    {...binding}
                    id="debate-territory"
                    value={topic}
                    onChange={(event) => setTopic(event.currentTarget.value)}
                    placeholder="Is Light really Kira? Should AI art count as art? Who would win in a fight…"
                    rows={3}
                  />
                )
              }
            </PrismRefractTarget>
            <button
              type="button"
              className={styles.territoryRandomizeButton}
              aria-label="Generate a random Debate territory"
              title="Generate a random territory"
              data-debate-territory-randomize="true"
              onClick={() =>
                setTopic((current) => randomDebateTerritory(current))
              }
            >
              {props.renderBotGlyph("dice", {
                size: 18,
                strokeWidth: 1.8,
              })}
            </button>
          </div>
        </div>
        <PrismRefractTarget target={synthesisMagic}>
          {(binding) => (
            <button
              {...binding}
              type="button"
              className={styles.synthesizeButton}
              onClick={() => void synthesize()}
              disabled={!topic.trim() || busy}
              data-tutorial-target="debate-synthesize"
            >
              <span aria-hidden="true">◇</span>
              {busy ? "Building…" : "Build the debate"}
              <small>Prism fills the motion and both sides</small>
            </button>
          )}
        </PrismRefractTarget>
      </div>
      {motionTuningOpen && slates.length > 1 ? (
        <div className={styles.slateGrid} aria-label="Balanced motion options">
          {slates.map((slate) => (
            <button
              type="button"
              key={slate.id}
              onClick={() => selectSlate(slate)}
              data-selected={motion.id === slate.id ? "true" : undefined}
            >
              <strong>{debateTitleForMotion(slate, formality)}</strong>
              <span>{slate.motion}</span>
              <span>
                {slate.forSide.label} ↔ {slate.againstSide.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {motionTuningOpen && motionReveal.motion ? (
        <div
          className={`${styles.motionEditor} ${styles.motionRevealGroup}`}
          data-debate-motion-stage="motion"
        >
          <div className={styles.motionEditorHeader}>
            <span>
              <strong>Refine the motion</strong>
              <small>Every field remains editable before Start.</small>
            </span>
            <button type="button" onClick={() => setMotionTuningOpen(false)}>
              Done
            </button>
          </div>
          <label className={styles.fieldWide}>
            <span>Motion</span>
            <PrismRefractTarget
              target={{
                id: "debate-setup-motion",
                kind: "field",
                label: "debate motion",
                read: () => motion.motion,
                preview: (value) =>
                  setMotion((current) => ({
                    ...current,
                    id: "custom-motion",
                    motion: value,
                  })),
                accept: (value) => {
                  setMotion((current) => ({
                    ...current,
                    id: "custom-motion",
                    title: undefined,
                    motion: value,
                  }));
                  setRoleChecks([]);
                },
                disabled: () => busy,
                generate: ({ currentValue, rejectedValues, signal }) =>
                  generateDebateRefractField(
                    "debate.setup.motion",
                    currentValue,
                    rejectedValues,
                    signal,
                  ),
              }}
            >
              {(binding) => (
                <textarea
                  {...binding}
                  value={motion.motion}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setMotion((current) => ({
                      ...current,
                      id: "custom-motion",
                      title: undefined,
                      motion: value,
                    }));
                    setRoleChecks([]);
                  }}
                  rows={3}
                />
              )}
            </PrismRefractTarget>
          </label>
          {motionReveal.positions
            ? (["for", "against"] as const).map((sideId) => {
                const side =
                  sideId === "for" ? motion.forSide : motion.againstSide;
                return (
                  <div
                    className={`${styles.sideEditor} ${styles.motionRevealGroup}`}
                    key={sideId}
                    data-side={sideId}
                    data-debate-motion-stage="positions"
                  >
                    <label className={styles.field}>
                      <span>{sideId === "for" ? "For" : "Against"} label</span>
                      <PrismRefractTarget
                        target={{
                          id: `debate-setup-${sideId}-label`,
                          kind: "field",
                          label: `${sideId} label`,
                          read: () => side.label,
                          preview: (value) =>
                            setMotion((current) => ({
                              ...current,
                              id: "custom-motion",
                              [sideId === "for" ? "forSide" : "againstSide"]: {
                                ...current[
                                  sideId === "for" ? "forSide" : "againstSide"
                                ],
                                label: value,
                              },
                            })),
                          accept: (value) => {
                            setMotion((current) => ({
                              ...current,
                              id: "custom-motion",
                              title: undefined,
                              [sideId === "for" ? "forSide" : "againstSide"]: {
                                ...current[
                                  sideId === "for" ? "forSide" : "againstSide"
                                ],
                                label: value,
                              },
                            }));
                            setRoleChecks([]);
                          },
                          disabled: () => busy,
                          generate: ({
                            currentValue,
                            rejectedValues,
                            signal,
                          }) =>
                            generateDebateRefractField(
                              sideId === "for"
                                ? "debate.setup.forLabel"
                                : "debate.setup.againstLabel",
                              currentValue,
                              rejectedValues,
                              signal,
                            ),
                        }}
                      >
                        {(binding) => (
                          <input
                            {...binding}
                            value={side.label}
                            placeholder={sideId === "for" ? "For" : "Against"}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setMotion((current) => ({
                                ...current,
                                id: "custom-motion",
                                title: undefined,
                                [sideId === "for" ? "forSide" : "againstSide"]:
                                  {
                                    ...side,
                                    label: value,
                                  },
                              }));
                              setRoleChecks([]);
                            }}
                          />
                        )}
                      </PrismRefractTarget>
                    </label>
                    {motionReveal.briefs ? (
                      <label
                        className={`${styles.field} ${styles.motionRevealGroup}`}
                        data-debate-motion-stage="briefs"
                      >
                        <span>
                          {sideId === "for" ? "For" : "Against"} brief
                        </span>
                        <PrismRefractTarget
                          target={{
                            id: `debate-setup-${sideId}-brief`,
                            kind: "field",
                            label: `${sideId} brief`,
                            read: () => side.brief,
                            preview: (value) =>
                              setMotion((current) => ({
                                ...current,
                                id: "custom-motion",
                                [sideId === "for" ? "forSide" : "againstSide"]:
                                  {
                                    ...current[
                                      sideId === "for"
                                        ? "forSide"
                                        : "againstSide"
                                    ],
                                    brief: value,
                                  },
                              })),
                            accept: (value) => {
                              setMotion((current) => ({
                                ...current,
                                id: "custom-motion",
                                [sideId === "for" ? "forSide" : "againstSide"]:
                                  {
                                    ...current[
                                      sideId === "for"
                                        ? "forSide"
                                        : "againstSide"
                                    ],
                                    brief: value,
                                  },
                              }));
                              setRoleChecks([]);
                            },
                            disabled: () => busy,
                            generate: ({
                              currentValue,
                              rejectedValues,
                              signal,
                            }) =>
                              generateDebateRefractField(
                                sideId === "for"
                                  ? "debate.setup.forBrief"
                                  : "debate.setup.againstBrief",
                                currentValue,
                                rejectedValues,
                                signal,
                              ),
                          }}
                        >
                          {(binding) => (
                            <textarea
                              {...binding}
                              value={side.brief}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setMotion((current) => ({
                                  ...current,
                                  id: "custom-motion",
                                  [sideId === "for"
                                    ? "forSide"
                                    : "againstSide"]: {
                                    ...side,
                                    brief: value,
                                  },
                                }));
                                setRoleChecks([]);
                              }}
                              rows={5}
                            />
                          )}
                        </PrismRefractTarget>
                      </label>
                    ) : null}
                  </div>
                );
              })
            : null}
        </div>
      ) : motionComplete ? (
        <article className={styles.motionSummaryCard} aria-live="polite">
          <span>Prism prepared</span>
          <h3>{debateTitleForMotion(motion, formality)}</h3>
          <p>{motion.motion}</p>
          <div>
            <p>
              <strong>{motion.forSide.label}</strong>
              <small>{motion.forSide.brief}</small>
            </p>
            <i aria-hidden="true">↔</i>
            <p>
              <strong>{motion.againstSide.label}</strong>
              <small>{motion.againstSide.brief}</small>
            </p>
          </div>
          <div className={styles.motionCardActions}>
            <button
              type="button"
              onClick={() => void synthesize()}
              disabled={busy}
            >
              Try another version
            </button>
            <button type="button" onClick={() => setMotionTuningOpen(true)}>
              Refine motion
            </button>
          </div>
        </article>
      ) : null}
      <div className={styles.panelAdvance}>
        <span aria-live="polite">
          {motionComplete
            ? "The question and both sides are ready."
            : "Describe the idea; Prism will handle the debate brief."}
        </span>
        <button
          type="button"
          onClick={() => setStudioPanel("cast")}
          disabled={!motionComplete}
        >
          Cast the proceeding <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );

  const renderCastStep = (): React.JSX.Element => (
    <section
      className={`${styles.setupPanel} ${styles.dashboardPanel}`}
      data-debate-dashboard-section="cast"
    >
      <div className={styles.castStepHeader}>
        <div className={styles.setupCopy}>
          <p className={styles.eyebrow}>
            02 / {format === "turnabout" ? "Turnabout cast" : "Forum cast"}
          </p>
          <h2>Seat every voice</h2>
          <p>
            {playerRole === "participant"
              ? "PRISM holds your side. Cast one opposing bot and one Moderator/Judge; every turn on your side belongs to you."
              : playerRole === "spectator"
                ? "Cast every seat, then watch the proceeding from the Gallery."
                : "Pick one advocate for each side. You preside, and Prism quietly handles the room."}
          </p>
        </div>
        <button
          type="button"
          className={styles.castRandomizeButton}
          onClick={randomizeCast}
          disabled={bots.length < (playerRole === "spectator" ? 3 : 2)}
          aria-label={
            playerRole === "judge"
              ? "Randomly select both advocates"
              : playerRole === "participant"
                ? "Randomly select a Judge and opposing bot"
                : "Randomly select all three actors"
          }
          title={
            bots.length < (playerRole === "spectator" ? 3 : 2)
              ? playerRole === "spectator"
                ? "At least three Library bots are required"
                : "At least two Library bots are required"
              : playerRole === "judge"
                ? "Randomly select both advocates"
                : playerRole === "participant"
                  ? "Randomly select a Judge and opposing bot"
                  : "Randomly select all three actors"
          }
          data-glyph-tooltip="Random actors"
          data-tutorial-target="debate-random-cast"
        >
          <span aria-hidden="true">
            {props.renderBotGlyph("dice", {
              size: 18,
              strokeWidth: 1.8,
            })}
          </span>
          <strong>Surprise me</strong>
        </button>
      </div>
      <div
        className={styles.castSlotGrid}
        data-seat-count={selectableCastSlots.length}
      >
        {(
          [
            ["moderator", visibleModeratorTitle],
            ["forAdvocate", motion.forSide.label || "For advocate"],
            ["againstAdvocate", motion.againstSide.label || "Against advocate"],
          ] as const
        )
          .filter(([key]) => selectableCastSlots.includes(key))
          .map(([key, label]) => {
            const fixedPlayerJudgeModerator =
              key === "moderator" && playerRole === "judge";
            const fixedParticipantAdvocate =
              playerRole === "participant" && key === participantPlayerCastSlot;
            const fixedSeat =
              fixedPlayerJudgeModerator || fixedParticipantAdvocate;
            const bot = fixedPlayerJudgeModerator
              ? playerJudgeBot
              : fixedParticipantAdvocate
                ? playerParticipantBot
                : (botById.get(cast[key]) ?? null);
            const accent = bot?.color ?? "#8f7cff";
            return (
              <article
                className={styles.castSlot}
                key={key}
                data-active={
                  !fixedSeat && effectiveActiveCastSlot === key
                    ? "true"
                    : undefined
                }
                data-filled={bot ? "true" : undefined}
                data-fixed={
                  fixedPlayerJudgeModerator
                    ? "player-judge"
                    : fixedParticipantAdvocate
                      ? "player-participant"
                      : undefined
                }
                style={{ "--debate-cast-color": accent } as CSSProperties}
              >
                <button
                  type="button"
                  className={styles.castSlotSelect}
                  aria-pressed={effectiveActiveCastSlot === key}
                  disabled={fixedSeat}
                  onClick={() => setActiveCastSlot(key)}
                >
                  <span className={styles.castSlotGlyph} aria-hidden="true">
                    {bot
                      ? props.renderBotGlyph(bot.glyph, {
                          size: 30,
                          strokeWidth: 1.65,
                        })
                      : "◇"}
                  </span>
                  <span>
                    <small>{label}</small>
                    <strong>{bot?.name ?? "Choose a bot"}</strong>
                    {fixedSeat ? <em>Player voice · Fixed</em> : null}
                    {bot?.hardMuted ? <em>Hard-muted</em> : null}
                  </span>
                </button>
                {bot && !fixedSeat ? (
                  <button
                    type="button"
                    className={styles.castSlotClear}
                    aria-label={`Clear ${label}`}
                    onClick={() => clearCastSlot(key)}
                  >
                    ×
                  </button>
                ) : null}
              </article>
            );
          })}
      </div>
      <div className={styles.castPicker}>
        <BotPickerToolbar
          searchValue={castPickerSearch}
          onSearchChange={setCastPickerSearch}
          searchAriaLabel="Search bots for Debate"
          searchPlaceholder="Search the Library…"
          groups={debatePickerGroups}
          groupValue={effectiveCastPickerGroupId}
          onGroupChange={setCastPickerGroupId}
          resultLabel={`${visibleCastBots.length} bot${visibleCastBots.length === 1 ? "" : "s"}`}
        />
        {visibleCastBots.length > 0 ? (
          <BotPickerGrid
            className={styles.castPickerGrid}
            role="radiogroup"
            ariaLabel={`Bot for ${
              effectiveActiveCastSlot === "moderator"
                ? visibleModeratorTitle
                : effectiveActiveCastSlot === "forAdvocate"
                  ? motion.forSide.label || "For advocate"
                  : motion.againstSide.label || "Against advocate"
            }`}
            style={
              {
                "--tile-size": "82px",
                "--tile-gap": "9px",
                "--tile-hover-scale": "1.055",
              } as CSSProperties
            }
          >
            {visibleCastBots.map((bot) => {
              const selected = cast[effectiveActiveCastSlot] === bot.id;
              const otherSlot = selectableCastSlots.find(
                (slot) =>
                  slot !== effectiveActiveCastSlot && cast[slot] === bot.id,
              );
              const disabledReason = otherSlot ? "Already cast" : null;
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
                  accentColor={bot.color ?? "#8f7cff"}
                  geometry={{
                    tileSize: 82,
                    glyphSize: 29,
                    glyphStroke: 1.65,
                    namedFlatTile: true,
                  }}
                  renderGlyph={props.renderBotGlyph}
                  className={styles.castPickerTile}
                  buttonProps={{
                    role: "radio",
                    "aria-checked": selected,
                    "aria-label": disabledReason
                      ? `${bot.name}, ${disabledReason}`
                      : `${bot.name}${selected ? ", selected" : ""}`,
                    disabled: Boolean(disabledReason),
                    title: disabledReason ?? undefined,
                    onClick: () =>
                      assignBotToCastSlot(effectiveActiveCastSlot, bot.id),
                  }}
                />
              );
            })}
          </BotPickerGrid>
        ) : (
          <p className={styles.castPickerEmpty}>No bots match this view.</p>
        )}
      </div>
      {moderatorHardMuted ? (
        <p className={styles.notice} role="status">
          This moderator will remain canonically silent. The proceeding still
          starts, and the other bots will encounter that silence in character.
        </p>
      ) : null}
      <details
        className={styles.castTuning}
        open={castTuningOpen}
        onToggle={(event) => setCastTuningOpen(event.currentTarget.open)}
        data-tutorial-target="debate-seat"
      >
        <summary>
          <span aria-hidden="true">◇</span>
          <span>
            <strong>Your seat &amp; the Jury</strong>
            <small>
              {playerRole.charAt(0).toUpperCase() + playerRole.slice(1)} ·{" "}
              {visibleModeratorTitle} · Jury {juryEnabled ? "on" : "off"}
            </small>
          </span>
          <em>{castTuningOpen ? "Done" : "Change"}</em>
        </summary>
        <div className={styles.castTuningBody}>
          <label
            className={`${styles.field} ${styles.moderatorTitleField}`}
            data-tutorial-target="debate-moderator-title"
          >
            <span>Presiding title</span>
            <PrismRefractTarget
              target={{
                id: "debate-setup-moderator-title",
                kind: "field",
                label: "moderator title",
                read: () => moderatorTitle,
                preview: setModeratorTitle,
                accept: setModeratorTitle,
                disabled: () => busy,
                generate: ({ currentValue, rejectedValues, signal }) =>
                  generateDebateRefractField(
                    "debate.setup.moderatorTitle",
                    currentValue,
                    rejectedValues,
                    signal,
                  ),
              }}
            >
              {(binding) => (
                <input
                  {...binding}
                  value={moderatorTitle}
                  maxLength={DEBATE_MODERATOR_TITLE_MAX_LENGTH}
                  onChange={(event) =>
                    setModeratorTitle(event.currentTarget.value)
                  }
                  onBlur={() => setModeratorTitle(effectiveModeratorTitle)}
                  placeholder="Moderator, The House, The Court…"
                />
              )}
            </PrismRefractTarget>
            <small>The exact public title shown on the center seat.</small>
          </label>
          <fieldset className={styles.rolePicker}>
            <legend>Your role</legend>
            {(["judge", "participant", "spectator"] as const).map((role) => (
              <label
                key={role}
                data-selected={playerRole === role ? "true" : undefined}
              >
                <input
                  type="radio"
                  name="debate-player-role"
                  value={role}
                  checked={playerRole === role}
                  disabled={role === "participant" && format !== "forum"}
                  onChange={() => selectPlayerRole(role)}
                />
                <strong>{role.charAt(0).toUpperCase() + role.slice(1)}</strong>
                <span>{roleDescription(role, format, formality)}</span>
              </label>
            ))}
          </fieldset>
          <label
            className={styles.juryToggle}
            data-enabled={juryEnabled ? "true" : undefined}
            data-tutorial-target="debate-jury"
          >
            <input
              type="checkbox"
              checked={juryEnabled}
              onChange={(event) => setJuryEnabled(event.currentTarget.checked)}
            />
            <span className={styles.juryToggleControl} aria-hidden="true">
              <i />
            </span>
            <span>
              <strong>Five-seat Jury</strong>
              <small>{juryRoleDescription(playerRole)}</small>
            </span>
            <b>{juryEnabled ? "Enabled" : "Off"}</b>
          </label>
          {playerRole === "participant" ? (
            <fieldset className={styles.sidePicker}>
              <legend>Your side</legend>
              {(["for", "against"] as const).map((sideId) => (
                <label key={sideId}>
                  <input
                    type="radio"
                    name="participant-side"
                    checked={playerSideId === sideId}
                    onChange={() => selectParticipantSide(sideId)}
                  />
                  {sideId === "for"
                    ? motion.forSide.label || "For"
                    : motion.againstSide.label || "Against"}
                </label>
              ))}
            </fieldset>
          ) : null}
        </div>
      </details>
      {roleChecks.length > 0 ? (
        <div className={styles.consentList}>
          {roleChecks.map((check) => {
            const bot = botById.get(check.botId);
            const sideLabel =
              check.sideId === "for"
                ? motion.forSide.label
                : motion.againstSide.label;
            const comment =
              check.reason?.trim() ||
              (check.status === "devils_advocate"
                ? `I’ll argue ${sideLabel} as Devil’s Advocate.`
                : check.status === "decline"
                  ? `I’m not willing to argue ${sideLabel}.`
                  : `I’m willing to argue ${sideLabel}.`);
            return (
              <article key={check.botId} data-status={check.status}>
                <div>
                  <strong>{bot?.name ?? check.botId}</strong>
                  <span>{sideLabel}</span>
                </div>
                <b>
                  {check.status === "accept"
                    ? "Accepted"
                    : check.status === "devils_advocate"
                      ? "Devil’s Advocate"
                      : "Declined"}
                </b>
                <p>{comment}</p>
              </article>
            );
          })}
        </div>
      ) : null}
      {declinedChecks.length > 0 ? (
        <div className={styles.refusalRecovery}>
          <p>
            A declined assignment cannot be overridden. Preserve the bot’s
            authored boundary.
          </p>
          <div>
            {playerRole !== "participant" ? (
              <button type="button" onClick={swapAdvocates}>
                Swap sides
              </button>
            ) : null}
            <button type="button" onClick={() => setRoleChecks([])}>
              {playerRole === "participant" ? "Change opponent" : "Change bot"}
            </button>
            <button type="button" onClick={() => setStudioPanel("motion")}>
              Revise motion
            </button>
          </div>
        </div>
      ) : null}
      <div className={styles.setupActions}>
        {playerRole !== "participant" ? (
          <button
            type="button"
            onClick={swapAdvocates}
            disabled={!cast.forAdvocate && !cast.againstAdvocate}
          >
            Swap advocates
          </button>
        ) : (
          <span>
            PRISM holds your side. Only the opposing bot gives advocacy consent.
          </span>
        )}
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!castComplete || busy}
          onClick={() => {
            if (roleChecksComplete) {
              setStudioPanel("evidence");
              return;
            }
            void checkRoles();
          }}
          data-tutorial-target="debate-consent"
        >
          {busy
            ? "Checking privately…"
            : roleChecksComplete
              ? "Choose evidence →"
              : "Make sure they’re willing"}
        </button>
      </div>
    </section>
  );

  const renderEvidenceStep = (): React.JSX.Element => {
    const exhibits = evidence.exhibits ?? [];
    const objectTitle = evidenceObjectDraft
      ? debateEvidenceExhibitTitle(evidenceObjectDraft)
      : "";
    const objectPreview: DebateEvidenceExhibitV1 | null = evidenceObjectDraft
      ? {
          id: "draft-exhibit",
          adjective: evidenceObjectDraft.adjective,
          object: evidenceObjectDraft.object,
          title: objectTitle || "Evidence object",
          observation: evidenceObjectDraft.observation,
          emoji: evidenceObjectDraft.emoji,
          visualKind: evidenceObjectDraft.imageId
            ? evidenceObjectDraft.visualKind
            : "emoji",
          imageId: evidenceObjectDraft.imageId,
          createdBy: evidenceObjectDraft.createdBy,
        }
      : null;
    return (
      <section
        className={`${styles.setupPanel} ${styles.dashboardPanel}`}
        data-debate-dashboard-section="evidence"
      >
        <div className={styles.setupCopy}>
          <p className={styles.eyebrow}>03 / Optional evidence</p>
          <h2>Choose what enters the room</h2>
          <p>
            Add a note, public source, or physical exhibit—or continue with an
            empty packet. Whatever you choose freezes at Start.
          </p>
        </div>
        <label className={styles.fieldWide}>
          <span>Anything the debaters should know (optional)</span>
          <PrismRefractTarget
            target={{
              id: "debate-setup-player-notes",
              kind: "field",
              label: "player notes",
              read: () => evidence.notes,
              preview: (value) =>
                setEvidence((current) => ({ ...current, notes: value })),
              accept: (value) =>
                setEvidence((current) => ({ ...current, notes: value })),
              disabled: () => busy,
              generate: ({ currentValue, rejectedValues, signal }) =>
                generateDebateRefractField(
                  "debate.setup.playerNotes",
                  currentValue,
                  rejectedValues,
                  signal,
                ),
            }}
          >
            {(binding) => (
              <textarea
                {...binding}
                value={evidence.notes}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setEvidence((current) => ({
                    ...current,
                    notes: value,
                  }));
                }}
                placeholder="A fact, rule, scenario, or bit of context you want both sides to use."
                rows={5}
              />
            )}
          </PrismRefractTarget>
        </label>
        <div className={styles.researchBox}>
          <div className={styles.evidenceToolHeader}>
            <div>
              <span>Build the record</span>
              <strong>
                Add a physical exhibit or bring in public sources.
              </strong>
            </div>
            <span className={styles.evidenceCapacity}>
              {evidenceItemTotal}/{DEBATE_EVIDENCE_ITEM_MAX_COUNT} items
            </span>
          </div>
          <label className={styles.field}>
            <span>Optional Brave Search</span>
            <PrismRefractTarget
              target={{
                id: "debate-setup-research-query",
                kind: "field",
                label: "Brave Search query",
                read: () => researchQuery,
                preview: setResearchQuery,
                accept: setResearchQuery,
                disabled: () => props.responseMode === "local" || busy,
                generate: ({ currentValue, rejectedValues, signal }) =>
                  generateDebateRefractField(
                    "debate.setup.researchQuery",
                    currentValue,
                    rejectedValues,
                    signal,
                  ),
              }}
            >
              {(binding) => (
                <input
                  {...binding}
                  value={researchQuery}
                  onChange={(event) =>
                    setResearchQuery(event.currentTarget.value)
                  }
                  placeholder="Search for frozen public evidence"
                  disabled={props.responseMode === "local"}
                />
              )}
            </PrismRefractTarget>
          </label>
          <div className={styles.researchActions}>
            <button
              type="button"
              onClick={() => void research("web")}
              disabled={
                props.responseMode === "local" ||
                !researchQuery.trim() ||
                evidenceItemLimitReached ||
                busy
              }
              title={
                evidenceItemLimitReached
                  ? "Remove an evidence item to search again"
                  : undefined
              }
            >
              Search &amp; add
            </button>
            <button
              type="button"
              onClick={openUrlEvidenceEditor}
              disabled={evidenceItemLimitReached}
              title={
                evidenceItemLimitReached
                  ? "Remove an evidence item before adding a URL"
                  : undefined
              }
            >
              Add URL
            </button>
          </div>
          <label className={styles.field}>
            <span>Optional Scholar Search</span>
            <PrismRefractTarget
              target={{
                id: "debate-setup-scholar-query",
                kind: "field",
                label: "Scholar Search query",
                read: () => scholarQuery,
                preview: setScholarQuery,
                accept: setScholarQuery,
                disabled: () => props.responseMode === "local" || busy,
                generate: ({ currentValue, rejectedValues, signal }) =>
                  generateDebateRefractField(
                    "debate.setup.scholarQuery",
                    currentValue,
                    rejectedValues,
                    signal,
                  ),
              }}
            >
              {(binding) => (
                <input
                  {...binding}
                  value={scholarQuery}
                  onChange={(event) =>
                    setScholarQuery(event.currentTarget.value)
                  }
                  placeholder="Search scholarly works via Crossref"
                  disabled={props.responseMode === "local"}
                />
              )}
            </PrismRefractTarget>
          </label>
          <div className={styles.researchActions}>
            <button
              type="button"
              onClick={() => void research("scholar")}
              disabled={
                props.responseMode === "local" ||
                !scholarQuery.trim() ||
                evidenceItemLimitReached ||
                busy
              }
              title={
                evidenceItemLimitReached
                  ? "Remove an evidence item to search again"
                  : "Scholarly metadata and DOI links from Crossref"
              }
            >
              Search papers &amp; add
            </button>
          </div>
          <div
            className={styles.evidenceObjectComposer}
            data-tutorial-target="debate-exhibit"
          >
            <label className={styles.field}>
              <span>Describe a physical exhibit</span>
              <PrismRefractTarget
                target={{
                  id: "debate-setup-exhibit-seed",
                  kind: "field",
                  label: "physical exhibit description",
                  read: () => evidenceObjectSeed,
                  preview: setEvidenceObjectSeed,
                  accept: setEvidenceObjectSeed,
                  disabled: () =>
                    evidenceItemLimitReached ||
                    evidenceObjectSuggestionBusy ||
                    evidenceObjectVisualBusy !== null ||
                    busy,
                  generate: ({ currentValue, rejectedValues, signal }) =>
                    generateDebateRefractField(
                      "debate.setup.exhibitPair",
                      currentValue,
                      rejectedValues.length > 0
                        ? rejectedValues
                        : (evidence.exhibits ?? []).map(
                            (exhibit) => exhibit.title,
                          ),
                      signal,
                    ),
                }}
              >
                {(binding) => (
                  <input
                    {...binding}
                    value={evidenceObjectSeed}
                    onChange={(event) =>
                      setEvidenceObjectSeed(event.currentTarget.value)
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key !== "Enter" ||
                        event.nativeEvent.isComposing ||
                        !evidenceObjectSeed.trim()
                      ) {
                        return;
                      }
                      event.preventDefault();
                      void draftEvidenceObject();
                    }}
                    maxLength={600}
                    placeholder="A torn glove with one finger stained blue"
                    disabled={
                      evidenceItemLimitReached || evidenceObjectSuggestionBusy
                    }
                  />
                )}
              </PrismRefractTarget>
            </label>
            <div className={styles.evidenceObjectActions}>
              <button
                type="button"
                className={styles.addEvidenceButton}
                data-generating={
                  evidenceObjectSuggestionBusy ? "true" : undefined
                }
                aria-busy={evidenceObjectSuggestionBusy}
                onClick={() => void draftEvidenceObject()}
                disabled={
                  !evidenceObjectSeed.trim() ||
                  evidenceItemLimitReached ||
                  evidenceObjectSuggestionBusy ||
                  evidenceObjectVisualBusy !== null
                }
              >
                <span aria-hidden="true">
                  {evidenceObjectSuggestionBusy ? "◇" : "＋"}
                </span>
                <span>
                  <strong>
                    {evidenceObjectSuggestionBusy
                      ? "Prism is refracting…"
                      : "Draft exhibit"}
                  </strong>
                  <small>
                    {evidenceObjectSuggestionBusy
                      ? "Deriving its editable details"
                      : "Create adjective, name, description, and emoji"}
                  </small>
                </span>
              </button>
            </div>
          </div>
          <p className={styles.evidenceToolNote}>
            {props.responseMode === "local"
              ? "LOCAL keeps public search and page reading off. You can still add a URL with your own title and summary; PRISM will not access it."
              : "Brave and Scholar each add up to three results per search. Everything added here is shared with both sides and frozen when the Debate begins."}
          </p>
        </div>
        {urlEvidenceDraft ? (
          <section
            className={styles.urlEvidenceEditor}
            aria-label="Add a source URL"
            data-tutorial-target="debate-add-url"
            onKeyDown={(event) => {
              if (event.key !== "Escape" || urlEvidenceInspecting) return;
              event.stopPropagation();
              closeUrlEvidenceEditor();
            }}
          >
            <header>
              <div>
                <span>Public source</span>
                <strong>Add your own URL</strong>
              </div>
              <button
                type="button"
                onClick={closeUrlEvidenceEditor}
                disabled={urlEvidenceInspecting}
                aria-label="Cancel adding source URL"
              >
                ×
              </button>
            </header>
            <label className={styles.fieldWide}>
              <span>URL</span>
              <input
                type="url"
                inputMode="url"
                autoComplete="url"
                autoFocus
                value={urlEvidenceDraft.url}
                placeholder="https://example.com/report"
                onChange={(event) => {
                  const url = event.currentTarget.value;
                  setUrlEvidenceDraft((current) =>
                    current ? { ...current, url, fetched: false } : current,
                  );
                  setUrlEvidenceError(null);
                }}
                disabled={urlEvidenceInspecting}
              />
            </label>
            <div className={styles.urlEvidenceInspectRow}>
              <button
                type="button"
                onClick={() => void inspectUrlEvidence()}
                disabled={!urlEvidenceDraft.url.trim() || urlEvidenceInspecting}
              >
                {urlEvidenceInspecting
                  ? "Reading…"
                  : props.responseMode === "local"
                    ? "Prepare URL"
                    : "Read URL"}
              </button>
              <small>
                {props.responseMode === "local"
                  ? "No network access. You provide the evidence summary."
                  : "PRISM reads a bounded title and excerpt. Review both before adding."}
              </small>
            </div>
            <label className={styles.fieldWide}>
              <span>Source title</span>
              <input
                value={urlEvidenceDraft.title}
                maxLength={240}
                placeholder="Name this source"
                onChange={(event) => {
                  const title = event.currentTarget.value;
                  setUrlEvidenceDraft((current) =>
                    current ? { ...current, title } : current,
                  );
                  setUrlEvidenceError(null);
                }}
                disabled={urlEvidenceInspecting}
              />
            </label>
            <label className={styles.fieldWide}>
              <span>What should debaters take from this source?</span>
              <textarea
                value={urlEvidenceDraft.snippet}
                maxLength={800}
                rows={4}
                placeholder="Summarize the specific fact, finding, or context that belongs in the shared record."
                onChange={(event) => {
                  const snippet = event.currentTarget.value;
                  setUrlEvidenceDraft((current) =>
                    current ? { ...current, snippet } : current,
                  );
                  setUrlEvidenceError(null);
                }}
                disabled={urlEvidenceInspecting}
              />
            </label>
            {urlEvidenceDraft.fetched ? (
              <p className={styles.urlEvidenceStatus} role="status">
                Page details loaded. Review the title and summary before
                freezing them into the Debate.
              </p>
            ) : null}
            {urlEvidenceError ? (
              <p className={styles.urlEvidenceError} role="alert">
                {urlEvidenceError}
              </p>
            ) : null}
            <div className={styles.urlEvidenceCommitActions}>
              <button
                type="button"
                onClick={closeUrlEvidenceEditor}
                disabled={urlEvidenceInspecting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={commitUrlEvidence}
                disabled={urlEvidenceInspecting || evidenceItemLimitReached}
              >
                Add to evidence
              </button>
            </div>
          </section>
        ) : null}
        {evidenceObjectDraft && objectPreview ? (
          <section
            className={styles.evidenceObjectEditor}
            aria-label="Create an object exhibit"
          >
            <div className={styles.evidenceObjectPreview}>
              <DebateEvidenceExhibitVisual exhibit={objectPreview} />
              <div>
                <span>Object exhibit</span>
                <strong>{objectTitle || "{ADJECTIVE} {OBJECT}"}</strong>
                <small>
                  The text record is evidence. Its visual is presentation only.
                </small>
              </div>
            </div>
            <div className={styles.evidenceObjectNameFields}>
              <label>
                <span>Adjective</span>
                <PrismRefractTarget
                  target={{
                    id: "debate-setup-exhibit-adjective",
                    kind: "field",
                    label: "object exhibit adjective",
                    read: () => evidenceObjectDraft.adjective,
                    preview: (value) =>
                      setEvidenceObjectDraft((current) =>
                        current ? { ...current, adjective: value } : current,
                      ),
                    accept: (value) =>
                      updateEvidenceObjectName("adjective", value),
                    disabled: () => evidenceObjectVisualBusy !== null || busy,
                    generate: ({ currentValue, rejectedValues, signal }) =>
                      generateDebateRefractField(
                        "debate.setup.exhibitAdjective",
                        currentValue,
                        rejectedValues,
                        signal,
                      ),
                  }}
                >
                  {(binding) => (
                    <input
                      {...binding}
                      value={evidenceObjectDraft.adjective}
                      onChange={(event) =>
                        updateEvidenceObjectName(
                          "adjective",
                          event.currentTarget.value,
                        )
                      }
                      placeholder="Rusty"
                      disabled={evidenceObjectVisualBusy !== null}
                    />
                  )}
                </PrismRefractTarget>
              </label>
              <label>
                <span>Object</span>
                <PrismRefractTarget
                  target={{
                    id: "debate-setup-exhibit-object",
                    kind: "field",
                    label: "object exhibit noun",
                    read: () => evidenceObjectDraft.object,
                    preview: (value) =>
                      setEvidenceObjectDraft((current) =>
                        current ? { ...current, object: value } : current,
                      ),
                    accept: (value) =>
                      updateEvidenceObjectName("object", value),
                    disabled: () => evidenceObjectVisualBusy !== null || busy,
                    generate: ({ currentValue, rejectedValues, signal }) =>
                      generateDebateRefractField(
                        "debate.setup.exhibitObject",
                        currentValue,
                        rejectedValues,
                        signal,
                      ),
                  }}
                >
                  {(binding) => (
                    <input
                      {...binding}
                      value={evidenceObjectDraft.object}
                      onChange={(event) =>
                        updateEvidenceObjectName(
                          "object",
                          event.currentTarget.value,
                        )
                      }
                      placeholder="spoon"
                      disabled={evidenceObjectVisualBusy !== null}
                    />
                  )}
                </PrismRefractTarget>
              </label>
            </div>
            <label className={styles.fieldWide}>
              <span>Observable fact</span>
              <PrismRefractTarget
                target={{
                  id: "debate-setup-exhibit-observation",
                  kind: "field",
                  label: "object exhibit observable fact",
                  read: () => evidenceObjectDraft.observation,
                  preview: (value) =>
                    setEvidenceObjectDraft((current) =>
                      current ? { ...current, observation: value } : current,
                    ),
                  accept: (value) =>
                    setEvidenceObjectDraft((current) =>
                      current ? { ...current, observation: value } : current,
                    ),
                  disabled: () => evidenceObjectVisualBusy !== null || busy,
                  generate: ({ currentValue, rejectedValues, signal }) =>
                    generateDebateRefractField(
                      "debate.setup.exhibitObservation",
                      currentValue,
                      rejectedValues,
                      signal,
                    ),
                }}
              >
                {(binding) => (
                  <textarea
                    {...binding}
                    value={evidenceObjectDraft.observation}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEvidenceObjectDraft((current) =>
                        current ? { ...current, observation: value } : current,
                      );
                    }}
                    placeholder="Describe only what everyone may treat as true about this object."
                    rows={3}
                  />
                )}
              </PrismRefractTarget>
            </label>
            <fieldset className={styles.evidenceEmojiPicker}>
              <legend>Exhibit emoji</legend>
              <div>
                <button
                  ref={evidenceEmojiTriggerRef}
                  type="button"
                  className={styles.evidenceEmojiTrigger}
                  aria-label={`Choose exhibit emoji. Current emoji: ${evidenceObjectDraft.emoji}`}
                  aria-haspopup="dialog"
                  aria-expanded={evidenceEmojiSearchOpen}
                  onClick={openEvidenceEmojiSearch}
                  disabled={evidenceObjectVisualBusy !== null}
                >
                  <span aria-hidden="true">{evidenceObjectDraft.emoji}</span>
                </button>
                <div className={styles.evidenceEmojiPickerHelp}>
                  <strong>Search for an emoji</strong>
                  <small id="debate-evidence-emoji-help">
                    Click the emoji, then describe the object or idea you want
                    to represent.
                  </small>
                </div>
              </div>
            </fieldset>
            {evidenceEmojiSearchOpen ? (
              <div
                className={styles.evidenceEmojiSearchBackdrop}
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    closeEvidenceEmojiSearch();
                  }
                }}
              >
                <section
                  className={styles.evidenceEmojiSearchModal}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="debate-evidence-emoji-search-title"
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.stopPropagation();
                    closeEvidenceEmojiSearch();
                  }}
                >
                  <header>
                    <div>
                      <span>Exhibit emoji</span>
                      <h2 id="debate-evidence-emoji-search-title">
                        Find the right symbol
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => closeEvidenceEmojiSearch()}
                      aria-label="Close emoji search"
                    >
                      ×
                    </button>
                  </header>
                  <label>
                    <span>Search</span>
                    <input
                      autoFocus
                      type="search"
                      value={evidenceEmojiSearchQuery}
                      placeholder="glove, evidence, transit, justice…"
                      onChange={(event) =>
                        setEvidenceEmojiSearchQuery(event.currentTarget.value)
                      }
                    />
                  </label>
                  <div
                    className={styles.evidenceEmojiSearchResults}
                    aria-label="Three most relevant emojis"
                    aria-live="polite"
                  >
                    {evidenceEmojiSearchResults.map((result) => (
                      <button
                        key={result.emoji}
                        type="button"
                        onClick={() => chooseEvidenceObjectEmoji(result.emoji)}
                        aria-label={`Use ${result.label} emoji ${result.emoji}`}
                      >
                        <span aria-hidden="true">{result.emoji}</span>
                        <small>{result.label}</small>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}
            <input
              ref={evidenceExhibitUploadRef}
              className={styles.visuallyHidden}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadEvidenceObjectImage(file);
              }}
            />
            <AssetRail
              kind="debate_exhibit"
              label="Exhibit sprites"
              context={objectTitle}
              currentImageIds={[evidenceObjectDraft.imageId]}
              refreshKey={evidenceObjectDraft.imageId}
              disabled={!objectTitle || evidenceObjectVisualBusy !== null}
              onUpload={() => evidenceExhibitUploadRef.current?.click()}
              onSynthesize={synthesizeEvidenceObjectImage}
              onSelect={(asset) => {
                const member =
                  asset.members.find((candidate) => candidate.role === "primary") ??
                  asset.members[0];
                if (!member) return;
                setEvidenceObjectDraft((current) =>
                  current
                    ? {
                        ...current,
                        visualKind:
                          asset.source === "uploaded" ? "upload" : "synthesized",
                        imageId: member.imageId,
                      }
                    : current,
                );
                setError(null);
              }}
            />
            <div className={styles.evidenceObjectAssetActions}>
              <button
                type="button"
                onClick={() => void synthesizeEvidenceObjectImage()}
                disabled={!objectTitle || evidenceObjectVisualBusy !== null}
              >
                {evidenceObjectVisualBusy === "synthesize"
                  ? "Synthesizing…"
                  : evidenceObjectDraft.imageId
                    ? "Synthesize another asset"
                    : "Synthesize asset"}
              </button>
              <small>
                Optional. Upload, reuse, or synthesize only changes the stage
                sprite; the editable text and emoji remain the evidence.
              </small>
            </div>
            <div className={styles.evidenceObjectCommitActions}>
              <button
                type="button"
                onClick={() => {
                  setEvidenceEmojiSearchOpen(false);
                  setEvidenceObjectDraft(null);
                }}
                disabled={evidenceObjectVisualBusy !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={addEvidenceObject}
                disabled={
                  !objectTitle ||
                  evidenceItemLimitReached ||
                  evidenceObjectVisualBusy !== null
                }
              >
                Add to evidence
              </button>
            </div>
          </section>
        ) : null}
        {evidence.sources.length > 0 ? (
          <section className={styles.evidenceCollection}>
            <header>
              <span>Public sources</span>
              <small>{evidence.sources.length}</small>
            </header>
            <ul className={styles.evidenceList}>
              {evidence.sources.map((source) => (
                <li key={source.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setSourceDrawerId((current) =>
                        current === source.id ? null : source.id,
                      )
                    }
                  >
                    <span>{source.id}</span>
                    <strong>{source.title}</strong>
                    <small>{source.snippet}</small>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${source.title}`}
                    onClick={() =>
                      setEvidence((current) => ({
                        ...current,
                        sources: current.sources.filter(
                          (candidate) => candidate.id !== source.id,
                        ),
                      }))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {exhibits.length > 0 ? (
          <section className={styles.evidenceCollection}>
            <header>
              <span>Object exhibits</span>
              <small>{exhibits.length}</small>
            </header>
            <ul
              className={`${styles.evidenceList} ${styles.evidenceExhibitList}`}
            >
              {exhibits.map((exhibit) => (
                <li key={exhibit.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setSourceDrawerId((current) =>
                        current === exhibit.id ? null : exhibit.id,
                      )
                    }
                  >
                    <DebateEvidenceExhibitVisual exhibit={exhibit} />
                    <span>{exhibit.id}</span>
                    <strong>{exhibit.title}</strong>
                    <small>{exhibit.observation}</small>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${exhibit.title}`}
                    onClick={() =>
                      setEvidence((current) => ({
                        ...current,
                        exhibits: (current.exhibits ?? []).filter(
                          (candidate) => candidate.id !== exhibit.id,
                        ),
                      }))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className={styles.packetSeal}>
          <span aria-hidden="true">◇</span>
          <div>
            <strong>
              {debateEvidenceItemCount(evidence) > 0 || evidence.notes.trim()
                ? "Packet staged"
                : "Empty packet staged"}
            </strong>
            <small>
              {debateEvidenceItemCount(evidence)} /{" "}
              {DEBATE_EVIDENCE_ITEM_MAX_COUNT} items · {evidence.sources.length}{" "}
              source
              {evidence.sources.length === 1 ? "" : "s"} · {exhibits.length}{" "}
              exhibit{exhibits.length === 1 ? "" : "s"} ·{" "}
              {evidence.notes.trim() ? "notes included" : "no player notes"}
            </small>
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setEvidenceDecisionMade(true)}
            data-tutorial-target="debate-evidence-continue"
          >
            {evidenceDecisionMade
              ? "Evidence choice saved"
              : debateEvidenceItemCount(evidence) > 0 || evidence.notes.trim()
                ? "Use this evidence"
                : "Continue without evidence"}
          </button>
        </div>
      </section>
    );
  };

  const renderReviewStep = (): React.JSX.Element => (
    <section
      className={`${styles.setupPanel} ${styles.readinessPanel}`}
      data-tutorial-target="debate-readiness"
      data-ready={debateCanStart ? "true" : undefined}
      data-ready-count={readinessCount}
    >
      <div className={styles.setupCopy}>
        <p className={styles.eyebrow}>Proceeding card</p>
        <h2>{debateCanStart ? "Ready when you are" : "Shape the room"}</h2>
        <p>
          One view of what will enter the chamber. Start freezes the room,
          motion, cast, consent, model, Powers, and evidence.
        </p>
      </div>
      <div className={styles.reviewGrid}>
        <article data-ready={motionComplete ? "true" : undefined}>
          <span>Motion</span>
          <strong>{motion.motion || "Not yet shaped"}</strong>
          <p>
            {motionComplete
              ? `${motion.forSide.label} ↔ ${motion.againstSide.label}`
              : "Give Prism an idea to prepare."}
          </p>
        </article>
        <article
          data-ready={castComplete && roleChecksComplete ? "true" : undefined}
        >
          <span>Cast</span>
          <strong>
            {castComplete
              ? `${playerRole.charAt(0).toUpperCase() + playerRole.slice(1)} · ${visibleModeratorTitle}`
              : "Seats still open"}
          </strong>
          <p>
            {roleChecksComplete
              ? "Advocacy consent secured"
              : castComplete
                ? "Willingness check remains"
                : "Choose every active voice"}
          </p>
        </article>
        <article data-ready="true">
          <span>Room</span>
          <strong>
            {format === "turnabout" ? "Turnabout" : "Forum"} ·{" "}
            {formalityDescriptor.title}
          </strong>
          <p>
            {format === "turnabout"
              ? "Action-driven"
              : forumRoundMode === "auto"
                ? `Auto · ${forumRoundPlan.count} ${forumRoundPlan.count === 1 ? "round" : "rounds"}`
                : `${forumRoundPlan.count} fixed ${forumRoundPlan.count === 1 ? "round" : "rounds"}`}
            {juryEnabled ? " · Jury on" : " · Jury off"}
          </p>
        </article>
        <article data-ready={evidenceDecisionMade ? "true" : undefined}>
          <span>Evidence</span>
          <strong>
            {evidenceDecisionMade
              ? debateEvidenceItemCount(evidence) > 0 || evidence.notes.trim()
                ? `${debateEvidenceItemCount(evidence)} item${debateEvidenceItemCount(evidence) === 1 ? "" : "s"}`
                : "Empty packet"
              : "Choose or skip"}
          </strong>
          <p>
            {evidenceDecisionMade
              ? evidence.notes.trim()
                ? "Player notes included"
                : "No player notes"
              : "Evidence is optional"}
          </p>
        </article>
      </div>
      {roleChecks.some((check) => check.status === "devils_advocate") ? (
        <p className={styles.devilsNotice}>
          Devil’s Advocate framing will appear as one brief moderator
          disclosure. It never changes the bot’s saved identity.
        </p>
      ) : null}
      {mutedAdvocates.length > 0 ? (
        <p className={styles.warning} role="alert">
          {mutedAdvocates.map((bot) => bot.name).join(" and ")}{" "}
          {mutedAdvocates.length === 1 ? "is" : "are"} hard-muted. Their
          scheduled floor remains canonical silence, and private ballots expose
          no spoken reason.
        </p>
      ) : null}
      <div className={styles.setupActions}>
        <span className={styles.launchThreshold}>
          {debateCanStart
            ? `Start freezes the ${debatePublicMaterialName(formality).toLowerCase()}.`
            : !motionComplete
              ? "Shape the motion to continue."
              : !castComplete
                ? "Seat every active voice."
                : !roleChecksComplete
                  ? "Secure advocacy consent."
                  : "Choose evidence or continue without it."}
        </span>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={busy || !debateCanStart}
          onClick={() => void startDebate()}
          data-tutorial-target="debate-start"
        >
          {busy ? "Opening…" : "Start Debate"}
        </button>
      </div>
    </section>
  );

  const renderTurnaboutRecord = (
    session: DebateSessionV1,
  ): React.JSX.Element => {
    const state =
      session.formatState.format === "turnabout" ? session.formatState : null;
    return (
      <aside
        className={`${styles.caseBoard} ${styles.turnaboutRecord}`}
        aria-label={`Turnabout ${debatePublicMaterialName(session.formality).toLowerCase()}`}
        data-tutorial-target="debate-case-board"
      >
        <header>
          <div>
            <p className={styles.eyebrow}>
              {debatePublicMaterialName(session.formality)}
            </p>
            <span>
              {session.formality === "parliamentary"
                ? "Statement-bound · frozen evidence only"
                : "Claim-bound · frozen evidence only"}
            </span>
          </div>
          <strong>Reversal {state ? Math.max(0, state.round - 1) : 0}</strong>
        </header>
        <div className={styles.caseColumns}>
          {(["for", "against"] as const).map((sideId) => (
            <section key={sideId} data-side={sideId}>
              <h2>
                {sideId === "for"
                  ? session.motion.forSide.label
                  : session.motion.againstSide.label}
              </h2>
              <ol>
                {(state?.statements ?? [])
                  .filter((statement) => statement.sideId === sideId)
                  .map((statement, index) => (
                    <li
                      key={statement.id}
                      data-status={statement.status}
                      data-active={
                        state?.activeStatementId === statement.id
                          ? "true"
                          : undefined
                      }
                    >
                      <span>Statement {index + 1}</span>
                      <p>{debateSpokenText(statement.content)}</p>
                      <div>
                        <small>{statement.status}</small>
                        {statement.sourceIds.map((id) => (
                          <button
                            type="button"
                            key={id}
                            className={styles.sourceChip}
                            onClick={() => setSourceDrawerId(id)}
                          >
                            {id}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
              </ol>
            </section>
          ))}
        </div>
        {state && state.contradictions.length > 0 ? (
          <footer>
            {state.contradictions.map((contradiction) => (
              <span key={contradiction.id} data-ruling={contradiction.ruling}>
                {contradiction.ruling} · {contradiction.evidenceSourceId}
              </span>
            ))}
          </footer>
        ) : null}
      </aside>
    );
  };

  const renderCaseBoard = (
    session: DebateSessionV1,
    activeEvent: DebateEventV1 | null,
  ): React.JSX.Element => {
    return (
      <aside
        className={styles.caseBoard}
        aria-label="Living case board"
        data-tutorial-target="debate-case-board"
      >
        <header>
          <p className={styles.eyebrow}>Living case board</p>
          <span>Scoreless · heard speech only</span>
        </header>
        <div className={styles.caseColumns}>
          {(["for", "against"] as const).map((sideId) => (
            <section key={sideId} data-side={sideId}>
              <h2>
                {sideId === "for"
                  ? session.motion.forSide.label
                  : session.motion.againstSide.label}
              </h2>
              <ul>
                {visibleCaseBoard
                  .filter((card) => card.sideId === sideId)
                  .map((card) => (
                    <li
                      key={card.id}
                      data-status={card.status}
                      data-active={
                        card.createdEventId === activeEvent?.id
                          ? "true"
                          : undefined
                      }
                    >
                      <span>{card.status}</span>
                      <p>{card.summary}</p>
                      <div>
                        {card.sourceIds.map((id) => (
                          <button
                            type="button"
                            key={id}
                            className={styles.sourceChip}
                            onClick={() => setSourceDrawerId(id)}
                          >
                            {id}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </aside>
    );
  };

  const renderJudgeGuidedControls = (
    session: DebateSessionV1,
    kind: DebateJudgeGuidedStepKind,
  ): React.JSX.Element => {
    if (kind === "objection") {
      const pending = session.objectionRuling;
      const objectingBot =
        pending?.objectingBotId === session.forAdvocate.id
          ? session.forAdvocate
          : session.againstAdvocate;
      return (
        <section
          ref={objectionRulingDockRef}
          className={styles.judgeChoiceDock}
          data-kind="objection"
          data-tutorial-target="debate-judge-objection-ruling"
          role="alertdialog"
          tabIndex={-1}
          aria-labelledby="debate-judge-objection-title"
          aria-describedby="debate-judge-objection-challenge debate-judge-objection-timeout"
          aria-busy={busy}
        >
          <header>
            <p id="debate-judge-objection-title">Objection — rule now</p>
            <strong id="debate-judge-objection-challenge">
              {objectingBot.name} has challenged the cutoff ·{" "}
              {objectionRulingDecision ? (
                <DebateDeadlineCountdown
                  deadlineMs={objectionRulingDecision.deadlineMs}
                  intervalMs={250}
                  aria-label="Objection ruling seconds remaining"
                />
              ) : (
                <span role="timer">0s</span>
              )}
            </strong>
          </header>
          <div className={styles.judgeObjectionChoices}>
            <button
              type="button"
              data-ruling="sustained"
              aria-keyshortcuts="S"
              onClick={() => void submitObjectionRuling("sustained")}
              disabled={busy}
            >
              <span>
                Sustained <kbd>S</kbd>
              </span>
              <small>The cutoff stands; the Debate moves on</small>
            </button>
            <button
              type="button"
              data-ruling="overruled"
              aria-keyshortcuts="O"
              onClick={() => void submitObjectionRuling("overruled")}
              disabled={busy}
            >
              <span>
                Overruled <kbd>O</kbd>
              </span>
              <small>The interrupted speaker answers and finishes</small>
            </button>
          </div>
          <small
            id="debate-judge-objection-timeout"
            className={styles.judgeObjectionTimeout}
          >
            No ruling defaults to Overruled.
          </small>
        </section>
      );
    }

    if (kind === "verdict") {
      return (
        <section
          className={styles.judgeChoiceDock}
          data-kind="verdict"
          data-tutorial-target="debate-judge-guided-controls"
          role="group"
          aria-label="Choose the final Debate ruling"
        >
          <header>
            <p>Final ruling</p>
            <strong>Which side carried the motion?</strong>
          </header>
          <div className={styles.judgeVerdictChoices}>
            <button
              type="button"
              data-side="for"
              onClick={() => void submitVerdict("for", "")}
              disabled={busy}
            >
              <span>{session.motion.forSide.label}</span>
              <small>Rule for this side</small>
            </button>
            <button
              type="button"
              data-side="against"
              onClick={() => void submitVerdict("against", "")}
              disabled={busy}
            >
              <span>{session.motion.againstSide.label}</span>
              <small>Rule for this side</small>
            </button>
          </div>
        </section>
      );
    }

    const choices = debateJudgeQuickChoices(kind);
    const targetLabel =
      judgeTarget === "for"
        ? session.motion.forSide.label
        : session.motion.againstSide.label;
    return (
      <section
        className={styles.judgeChoiceDock}
        data-kind={kind}
        data-composer-open={judgeComposerOpen ? "true" : undefined}
        data-tutorial-target="debate-judge-guided-controls"
        role="group"
        aria-label={
          kind === "gavel"
            ? "Choose a Judge intervention"
            : `Choose a Judge question for ${targetLabel}`
        }
      >
        <header>
          <p>{kind === "gavel" ? "The gavel has the room" : "Your question"}</p>
          <strong>
            {kind === "gavel"
              ? "What does the Court do next?"
              : `What do you want to ask ${targetLabel}?`}
          </strong>
          {kind === "question" ? (
            <div
              className={styles.judgeTargetChoices}
              role="group"
              aria-label="Choose which side to question"
            >
              {(["for", "against"] as const).map((sideId) => (
                <button
                  type="button"
                  key={sideId}
                  aria-pressed={judgeTarget === sideId}
                  data-selected={judgeTarget === sideId ? "true" : undefined}
                  onClick={() => setJudgeTarget(sideId)}
                  disabled={busy}
                >
                  {sideId === "for"
                    ? session.motion.forSide.label
                    : session.motion.againstSide.label}
                </button>
              ))}
            </div>
          ) : null}
        </header>
        {judgeComposerOpen ? (
          <div className={styles.judgeCustomChoiceNotice}>
            <span>Write below, or roll the dice for an editable draft.</span>
            <button
              type="button"
              onClick={() => setJudgeComposerOpen(false)}
              disabled={busy || judgeComposerGenerating}
            >
              Back to quick choices
            </button>
          </div>
        ) : (
          <div className={styles.judgeQuickChoices}>
            {choices.map((choice, index) => (
              <button
                type="button"
                key={choice.id}
                data-choice-kind={choice.action}
                onClick={() => void submitJudgeQuickChoice(kind, choice)}
                disabled={busy}
                aria-label={`${index + 1}. ${choice.label}. ${choice.detail}`}
              >
                <span>{choice.label}</span>
                {choice.action !== "dismiss" ? (
                  <small>{choice.detail}</small>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </section>
    );
  };

  const renderPlayerWindow = (
    session: DebateSessionV1,
  ): React.JSX.Element | null => {
    if (session.status !== "waiting_for_player") return null;
    if (
      session.stepKey === "participant_objection_reason" &&
      session.participantObjection?.status === "awaiting_reason"
    ) {
      const pending = session.participantObjection;
      const interruptedEvent =
        session.events.find(
          (event) => event.id === pending.interruptedEventId,
        ) ?? null;
      const interruptedBot =
        pending.interruptedBotId === session.forAdvocate.id
          ? session.forAdvocate
          : pending.interruptedBotId === session.againstAdvocate.id
            ? session.againstAdvocate
            : null;
      const heardFragment = debateSpokenText(
        interruptedEvent?.content ?? "",
      ).trim();
      return (
        <form
          className={styles.participantObjectionDock}
          data-kind="participant-objection"
          data-tutorial-target="debate-participant-objection-reason"
          role="dialog"
          aria-labelledby="debate-participant-objection-title"
          aria-describedby="debate-participant-objection-support"
          aria-busy={busy}
          onSubmit={resolveParticipantObjection}
        >
          <div>
            <p className={styles.eyebrow}>Objection raised</p>
            <h2 id="debate-participant-objection-title">State the point</h2>
            <p
              id="debate-participant-objection-support"
              className={styles.participantFloorRailHint}
              aria-live="polite"
            >
              The floor is held. The moderator will rule when you submit.
            </p>
          </div>
          <blockquote className={styles.participantObjectionContext}>
            <strong>
              You interrupted {interruptedBot?.name ?? "the opposing advocate"}
            </strong>
            <span>
              “{heardFragment || "The interrupted statement is on the record."}”
            </span>
          </blockquote>
          <textarea
            ref={participantObjectionReasonRef}
            value={participantObjectionDraft}
            onChange={(event) =>
              setParticipantObjectionDraft(event.currentTarget.value)
            }
            maxLength={600}
            rows={3}
            aria-label="State the point of your objection"
            placeholder="What specifically is wrong with the claim, procedure, or cited evidence?"
            disabled={busy}
          />
          <div className={styles.participantObjectionActions}>
            <button
              type="button"
              onClick={() => void resolveParticipantObjection(undefined, true)}
              disabled={busy}
            >
              Withdraw
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={busy || !participantObjectionDraft.trim()}
            >
              Submit objection
            </button>
          </div>
        </form>
      );
    }
    if (
      session.stepKey === "judge_gavel_message" &&
      session.judgeGavel?.status === "awaiting_message"
    ) {
      return (
        <form
          className={styles.playerWindow}
          data-kind="judge-gavel"
          onSubmit={submitJudgeGavelMessage}
          data-tutorial-target="debate-judge-gavel-message"
        >
          <p className={styles.eyebrow}>The gavel has the room</p>
          <h2>Address the debaters</h2>
          <textarea
            value={judgeGavelDraft}
            onChange={(event) => setJudgeGavelDraft(event.currentTarget.value)}
            maxLength={DEBATE_JUDGE_GAVEL_MESSAGE_MAX_LENGTH}
            rows={3}
            autoFocus
            placeholder="Ask a question, demand clarification, or redirect the exchange…"
          />
          <div>
            <button
              type="button"
              onClick={() => void submitJudgeGavelMessage(undefined, true)}
              disabled={busy}
            >
              Resume without message
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={busy || !judgeGavelDraft.trim()}
            >
              Send to the floor
            </button>
          </div>
        </form>
      );
    }
    if (
      session.stepKey === "verdict_player" ||
      session.stepKey === "turnabout_verdict_player"
    ) {
      return (
        <div className={styles.playerWindow} data-kind="verdict">
          <p className={styles.eyebrow}>Your ruling is final</p>
          <h2>Which side carried the motion?</h2>
          <textarea
            value={playerDraft}
            onChange={(event) => setPlayerDraft(event.currentTarget.value)}
            placeholder="Optional reason for your ruling"
            rows={3}
          />
          <div>
            <button
              type="button"
              data-side="for"
              onClick={() => void submitVerdict("for")}
              disabled={busy}
            >
              {session.motion.forSide.label}
            </button>
            <button
              type="button"
              data-side="against"
              onClick={() => void submitVerdict("against")}
              disabled={busy}
            >
              {session.motion.againstSide.label}
            </button>
          </div>
        </div>
      );
    }
    if (
      session.stepKey === "turnabout_action" &&
      session.formatState.format === "turnabout"
    ) {
      const state: DebateTurnaboutFormatStateV1 = session.formatState;
      const statement: DebateTurnaboutStatementV1 | null =
        state.statements.find(
          (candidate) => candidate.id === state.activeStatementId,
        ) ?? null;
      if (!statement) return null;
      const speaker =
        statement.speakerBotId === session.forAdvocate.id
          ? session.forAdvocate
          : session.againstAdvocate;
      return (
        <section
          className={`${styles.playerWindow} ${styles.turnaboutActions}`}
          data-kind="turnabout"
          data-tutorial-target="debate-turnabout-actions"
        >
          <div>
            <p className={styles.eyebrow}>
              {session.formality === "parliamentary"
                ? "Statement on the record"
                : "Active claim"}
            </p>
            <h2>Examine {speaker.name}</h2>
            <blockquote>{debateSpokenText(statement.content)}</blockquote>
          </div>
          {turnaboutObjecting ? (
            <fieldset className={styles.turnaboutEvidencePicker}>
              <legend>Object with frozen evidence</legend>
              {debateEvidenceItemCount(session.evidence) > 0 ? (
                debateEvidenceItems(session.evidence).map((item) => (
                  <label
                    key={item.value.id}
                    data-kind={item.kind}
                    data-selected={
                      turnaboutEvidenceSourceId === item.value.id
                        ? "true"
                        : undefined
                    }
                  >
                    <input
                      type="radio"
                      name="turnabout-evidence"
                      value={item.value.id}
                      checked={turnaboutEvidenceSourceId === item.value.id}
                      onChange={() =>
                        setTurnaboutEvidenceSourceId(item.value.id)
                      }
                    />
                    {item.kind === "exhibit" ? (
                      <DebateEvidenceExhibitVisual exhibit={item.value} />
                    ) : null}
                    <strong>{item.value.title}</strong>
                    <span>
                      {item.kind === "source"
                        ? item.value.snippet
                        : item.value.observation}
                    </span>
                    <small>
                      {item.kind === "source"
                        ? "Public source"
                        : "Object exhibit"}{" "}
                      · {item.value.id}
                    </small>
                  </label>
                ))
              ) : (
                <p>
                  No evidence item was frozen before Start. You can still Press
                  or Pass.
                </p>
              )}
            </fieldset>
          ) : null}
          <div className={styles.turnaboutActionRow}>
            <button
              type="button"
              onClick={() => void submitTurnaboutAction("press", statement.id)}
              disabled={busy || statement.status !== "ready"}
            >
              Press
            </button>
            <button
              type="button"
              aria-pressed={turnaboutObjecting}
              onClick={() => setTurnaboutObjecting((current) => !current)}
              disabled={busy || debateEvidenceItemCount(session.evidence) === 0}
            >
              Object
            </button>
            {turnaboutObjecting ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() =>
                  void submitTurnaboutAction("present_evidence", statement.id)
                }
                disabled={busy || !turnaboutEvidenceSourceId}
              >
                Present Evidence
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void submitTurnaboutAction("pass", statement.id)}
              disabled={busy}
            >
              Pass
            </button>
          </div>
        </section>
      );
    }
    const latestModeratorEvent = [...session.events]
      .reverse()
      .find((event) => event.speakerBotId === session.moderator.id);
    const silentModeratorChallenge =
      session.phase === "challenge" &&
      session.stepKey !== "challenge_judge_question" &&
      (latestModeratorEvent?.kind === "silence" ||
        latestModeratorEvent?.speakerKind === "system");
    return (
      <form className={styles.playerWindow} onSubmit={submitPlayerTurn}>
        <p className={styles.eyebrow}>Your floor</p>
        <h2>
          {session.stepKey === "challenge_judge_question"
            ? "Ask one side a question"
            : silentModeratorChallenge
              ? "The moderator left the floor open"
              : session.phase === "challenge"
                ? "Answer the moderator’s challenge"
                : session.phase === "opening"
                  ? "Deliver your opening"
                  : session.phase === "closing"
                    ? "Deliver your closing"
                    : "Deliver your rebuttal"}
        </h2>
        {silentModeratorChallenge ? (
          <p>
            No challenge was spoken. React to the silence, make your own point,
            or pass this speaking opportunity.
          </p>
        ) : null}
        {session.stepKey === "challenge_judge_question" ? (
          <div className={styles.targetToggle}>
            {(["for", "against"] as const).map((sideId) => (
              <label key={sideId}>
                <input
                  type="radio"
                  checked={judgeTarget === sideId}
                  onChange={() => setJudgeTarget(sideId)}
                />
                {sideId === "for"
                  ? session.motion.forSide.label
                  : session.motion.againstSide.label}
              </label>
            ))}
          </div>
        ) : null}
        <textarea
          value={playerDraft}
          onChange={(event) => setPlayerDraft(event.currentTarget.value)}
          placeholder={
            silentModeratorChallenge
              ? "Use the open floor however your side would."
              : "Speak plainly. You can cite frozen evidence with [[source:id]]."
          }
          rows={4}
          autoFocus
        />
        <div>
          <button
            type="button"
            onClick={() => void passPlayerTurn()}
            disabled={busy}
          >
            {session.stepKey === "challenge_judge_question"
              ? "Pass question"
              : "Pass turn"}
          </button>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={busy || !playerDraft.trim()}
          >
            Commit turn
          </button>
        </div>
      </form>
    );
  };

  const renderTranscript = (session: DebateSessionV1): React.JSX.Element => {
    const juryTranscriptCopyable = debateArchivedJuryRecordIsCopyable({
      status: session.status,
      juryEnabled: session.jury.enabled,
      playerRole: session.playerRole,
    });
    return (
      <section className={styles.transcript} aria-label="Debate transcript">
        <header className={styles.transcriptHeader}>
          <div>
            <p className={styles.eyebrow}>Proceedings</p>
            <span>Public floor · source-linked</span>
          </div>
          <div className={styles.transcriptHeaderActions}>
            {juryTranscriptCopyable ? (
              <button
                type="button"
                data-tutorial-target="debate-copy-jury-transcript"
                onClick={() => void copyJuryRecord()}
                disabled={juryRecordCopyState === "copying"}
              >
                {juryRecordCopyLabel(session.id)}
              </button>
            ) : null}
            <button
              type="button"
              data-tutorial-target="debate-copy-transcript"
              onClick={() => void copyVerboseTranscript()}
              disabled={transcriptCopyState === "copying"}
            >
              {transcriptCopyState === "copying"
                ? "Copying…"
                : transcriptCopyState === "copied"
                  ? "Copied"
                  : transcriptCopyState === "failed"
                    ? "Copy failed"
                    : "Copy verbose transcript"}
            </button>
          </div>
        </header>
        <div
          ref={transcriptFeedRef}
          className={styles.transcriptFeed}
          role="log"
          aria-label="Live Debate proceedings"
          aria-relevant="additions"
          tabIndex={0}
          onWheelCapture={(event) => {
            if (event.deltaY >= 0) return;
            transcriptUserOwnsViewportRef.current = true;
            transcriptAutoFollowRef.current = false;
            setTranscriptAtLive(false);
          }}
          onTouchStart={(event) => {
            transcriptTouchYRef.current = event.touches[0]?.clientY ?? null;
          }}
          onTouchMove={(event) => {
            const previousY = transcriptTouchYRef.current;
            const nextY = event.touches[0]?.clientY ?? null;
            transcriptTouchYRef.current = nextY;
            if (previousY === null || nextY === null || nextY <= previousY) {
              return;
            }
            transcriptUserOwnsViewportRef.current = true;
            transcriptAutoFollowRef.current = false;
            setTranscriptAtLive(false);
          }}
          onKeyDown={(event) => {
            if (!["ArrowUp", "PageUp", "Home"].includes(event.key)) return;
            transcriptUserOwnsViewportRef.current = true;
            transcriptAutoFollowRef.current = false;
            setTranscriptAtLive(false);
          }}
          onScroll={(event) => {
            const feed = event.currentTarget;
            const atLive = debateTranscriptIsAtLive(feed);
            if (atLive) {
              transcriptAutoFollowRef.current = true;
              transcriptUserOwnsViewportRef.current = false;
              setTranscriptAtLive(true);
            } else if (transcriptUserOwnsViewportRef.current) {
              transcriptAutoFollowRef.current = false;
              setTranscriptAtLive(false);
            }
          }}
        >
          <div ref={transcriptContentRef} className={styles.transcriptContent}>
            {session.events
              .filter(
                (event) =>
                  (DEBATE_VISIBLE_TRANSCRIPT_EVENT_KINDS.has(event.kind) ||
                    (session.jury.enabled &&
                      event.kind === "ballot" &&
                      event.speakerKind === "juror")) &&
                  !debateEventIsTranscriptHousekeeping(event) &&
                  !debateEventIsAtmosphericVocalFoley(event) &&
                  !debateEventIsJuryComment(event) &&
                  transcriptVisibleThroughSequence !== null &&
                  event.sequence <= transcriptVisibleThroughSequence,
              )
              .map((event) => {
                const streaming =
                  presentationEventId === event.id &&
                  (presenting ||
                    (liveReveal?.eventId === event.id &&
                      liveReveal.visibleContent.length < event.content.length));
                return streaming ? (
                  <DebateStreamingTranscriptArticle
                    key={event.id}
                    store={presentationStore}
                    session={session}
                    event={event}
                    playerName={playerName}
                    onSource={setSourceDrawerId}
                  />
                ) : (
                  <DebateCompletedTranscriptArticle
                    key={event.id}
                    session={session}
                    event={event}
                    playerName={playerName}
                    onSource={setSourceDrawerId}
                  />
                );
              })}
            {visiblePresenceBeats.flatMap((beat) => {
              const heard = heardBotPresenceBeatTextV1(beat);
              return beat.completion !== "playing" && heard
                ? [
                    <article
                      key={beat.id}
                    >
                      <header>
                        <strong>{beat.speaker.name}</strong>
                      </header>
                      <p>{heard}</p>
                    </article>,
                  ]
                : [];
            })}
            {props.presenceBeat?.surface === "debate" &&
            props.presenceBeat.sessionId === session.id &&
            props.presenceBeat.completion === "playing" ? (
              <article>
                <header>
                  <strong>{props.presenceBeat.speaker.name}</strong>
                </header>
                <p>
                  {props.presenceBeat.text.slice(
                    0,
                    props.presenceBeat.heardCharacterCount,
                  ) || "…"}
                </p>
              </article>
            ) : null}
            {busy ? (
              <div className={styles.turnPending} role="status">
                <span />
                <span />
                <span />
                {session.format === "turnabout"
                  ? "The record is preparing the next action"
                  : "The Forum is preparing the next turn"}
              </div>
            ) : null}
          </div>
        </div>
        {!transcriptAtLive ? (
          <button
            type="button"
            className={styles.returnToLiveButton}
            onClick={clampTranscriptToLive}
          >
            ↓ Live
          </button>
        ) : null}
      </section>
    );
  };

  const renderJuryRecord = (
    session: DebateSessionV1,
  ): React.JSX.Element | null => {
    if (
      !session.jury.enabled ||
      session.playerRole === "participant" ||
      session.status !== "completed"
    ) {
      return null;
    }
    const comments = debateJuryCommentEvents(session);
    return (
      <section
        className={styles.juryRecord}
        aria-label="Timestamped Jury comments"
        data-tutorial-target="debate-jury-record"
      >
        <header>
          <div>
            <p className={styles.eyebrow}>Jury record</p>
            <span>Timestamped · separate from proceedings</span>
          </div>
        </header>
        {comments.length > 0 ? (
          <ol>
            {comments.map((event) => (
              <li key={event.id}>
                <header>
                  <strong>
                    {debateJuryCommentSpeakerName(session, event)}
                  </strong>
                  <time dateTime={event.createdAt}>
                    {debateJuryCommentClockLabel(event.createdAt)}
                  </time>
                </header>
                <small>{debateJuryCommentKindLabel(event)}</small>
                <p>{event.content}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p>The Jury reached its result without public commentary.</p>
        )}
      </section>
    );
  };

  const renderGallery = (
    session: DebateSessionV1,
  ): React.JSX.Element | null => {
    if (session.jury.enabled) {
      const participantView = session.playerRole === "participant";
      const activeJurorId =
        presentationEventId &&
        liveReveal?.eventId === presentationEventId &&
        (liveReveal.speechTiming ?? null) !== null
        ? session.events.find((event) => event.id === presentationEventId)
            ?.speakerBotId
        : null;
      return (
        <aside
          className={`${styles.audienceGallery} ${styles.juryRoster}`}
          aria-label="Frozen five-seat Jury"
          data-phase={session.jury.phase}
          data-tutorial-target="debate-jury-roster"
        >
          <header>
            <div>
              <p className={styles.eyebrow}>Jury</p>
              <span>{DEBATE_JURY_SIZE} seats · binding majority</span>
            </div>
            <small>
              {participantView ? "Identity sealed" : "Frozen at Start"}
            </small>
          </header>
          <div className={styles.juryRosterSeats}>
            {participantView
              ? Array.from({ length: DEBATE_JURY_SIZE }, (_, index) => (
                  <span
                    key={`sealed-juror:${index}`}
                    data-anonymous="true"
                    aria-label={`Anonymous Jury seat ${index + 1}`}
                    style={
                      {
                        "--gallery-prism-color": DEBATE_GALLERY_COLORS[index],
                      } as CSSProperties
                    }
                  >
                    {props.renderBotGlyph("lucideTriangle", {
                      size: 20,
                      strokeWidth: 1.45,
                    })}
                    <small>Sealed</small>
                  </span>
                ))
              : session.jury.jurors.map((juror, index) => (
                  <span
                    key={juror.id}
                    data-speaking={
                      activeJurorId === juror.id ? "true" : undefined
                    }
                    style={
                      {
                        "--gallery-prism-color":
                          juror.color ?? DEBATE_GALLERY_COLORS[index],
                      } as CSSProperties
                    }
                    title={`${juror.name} · ${
                      juror.source === "library" ? "Library" : "PRISM"
                    }`}
                  >
                    {props.renderBotGlyph(juror.glyph ?? "lucideTriangle", {
                      size: 20,
                      strokeWidth: 1.45,
                    })}
                    {pendingJuryThoughtBotId === juror.id &&
                    pendingJuryComment?.content ? (
                      <button
                        type="button"
                        className={styles.juryThoughtChip}
                        aria-label={`${juror.name}'s between-turn thought`}
                        aria-describedby={`debate-jury-thought-${juror.id}`}
                      >
                        …
                        <span
                          id={`debate-jury-thought-${juror.id}`}
                          className={styles.juryThoughtPreview}
                          role="tooltip"
                        >
                          <strong>{juror.name}</strong>
                          <span>{pendingJuryComment.content}</span>
                        </span>
                      </button>
                    ) : null}
                    <small>{juror.name}</small>
                  </span>
                ))}
          </div>
          <p>
            {participantView
              ? "Five anonymous seats follow the public floor. Their chamber remains sealed until the aggregate verdict."
              : session.jury.phase === "waiting"
                ? "The frozen roster follows the public floor; hover an ellipsis to read a thought. PRISM enters the chamber automatically when deliberation begins."
                : session.jury.phase === "complete"
                  ? `The Jury has returned ${session.jury.forVotes}–${session.jury.againstVotes}.`
                  : "The Jury chamber is now in session."}
          </p>
        </aside>
      );
    }
    return null;
  };

  const renderJuryChamber = (
    session: DebateSessionV1,
    activeEvent: DebateEventV1 | null,
    thinkingBotId: string | null,
  ): React.JSX.Element => {
    const activeJurorId =
      activeEvent?.speakerKind === "juror" ? activeEvent.speakerBotId : null;
    const chamberContent =
      activeEvent &&
      (activeEvent.kind === "jury_deliberation" ||
        activeEvent.kind === "jury_verdict" ||
        (activeEvent.kind === "ballot" &&
          activeEvent.speakerKind === "juror") ||
        (activeEvent.kind === "reaction" &&
          activeEvent.speakerKind === "juror"))
        ? liveReveal?.eventId === activeEvent.id
          ? liveReveal.visibleContent
          : activeEvent.content
        : "";
    const chamberEventVisible =
      activeEvent !== null &&
      (activeEvent.kind === "jury_deliberation" ||
        activeEvent.kind === "jury_verdict" ||
        (activeEvent.kind === "ballot" &&
          activeEvent.speakerKind === "juror") ||
        (activeEvent.kind === "reaction" &&
          activeEvent.speakerKind === "juror"));
    const publicContent =
      activeEvent && liveReveal?.eventId === activeEvent.id
        ? liveReveal.visibleContent
        : (activeEvent?.content ?? "");
    const chamberListenerReaction = debateGalleryReaction(publicContent);
    const reactingJurorIndices = new Set(
      activeEvent && activeEvent.kind !== "silence"
        ? debateGalleryReactingIndices(
            publicContent,
            activeEvent.sequence,
            session.jury.jurors.length,
          )
        : [],
    );
    const silentDeliberationPreparing =
      juryDeliberationInFlightSessionId === session.id ||
      session.jury.phase === "initial_ballots" ||
      session.jury.phase === "deliberating";
    const finalBallotsByJurorId = new Map(
      session.jury.finalBallots.map((ballot) => [ballot.jurorBotId, ballot]),
    );
    const liveForVotes = session.jury.finalBallots.filter(
      (ballot) => ballot.sideId === "for",
    ).length;
    const liveAgainstVotes = session.jury.finalBallots.filter(
      (ballot) => ballot.sideId === "against",
    ).length;
    const finalBallotRoundVisible =
      session.jury.phase === "final_ballots" ||
      session.jury.phase === "complete" ||
      session.jury.finalBallots.length > 0;
    return (
      <div
        className={styles.juryChamber}
        data-phase={session.jury.phase}
        data-silent-deliberation={
          silentDeliberationPreparing ? "true" : undefined
        }
        aria-busy={silentDeliberationPreparing}
        data-theme={props.theme}
        data-tutorial-target="debate-jury-chamber"
      >
        <div className={styles.juryChamberAura} aria-hidden="true" />
        <div className={styles.juryChamberBots}>
          {session.jury.jurors.map((juror, index) => {
            const finalBallot = finalBallotsByJurorId.get(juror.id) ?? null;
            const presentation = debateBotPresentation(
              session,
              juror,
              Number.POSITIVE_INFINITY,
              observerPerspective,
            );
            const appearanceBot =
              debateBotSnapshot(session, presentation.voiceSourceBotId) ??
              juror;
            const speechTiming =
              liveReveal !== null && liveReveal.eventId === activeEvent?.id
                ? (liveReveal.speechTiming ?? null)
                : null;
            const talking =
              silentDeliberationPreparing ||
              (presenting &&
                activeJurorId === juror.id &&
                activeEvent?.kind !== "silence" &&
                speechTiming !== null);
            const listenerReaction =
              presenting &&
              activeJurorId !== juror.id &&
              reactingJurorIndices.has(index)
                ? chamberListenerReaction
                : null;
            const foleyMouthShape = silentDeliberationPreparing
              ? (["open-small", "narrow", "open-round"] as const)[index % 3]
              : !talking && debateAmbientBotVocalization?.targetId === juror.id
                ? debateAmbientBotVocalizationMouthShape(juror.id)
                : null;
            const vocalFoleyTagText = resolveDebateVocalFoleyTagText({
              ambientKind:
                debateAmbientBotVocalization?.targetId === juror.id
                  ? debateAmbientBotVocalization.cue.kind
                  : null,
              personaReactionContent:
                presenting &&
                activeEvent?.kind === "reaction" &&
                activeEvent.stepKey.startsWith("persona_reaction_") &&
                activeEvent.speakerBotId === juror.id
                  ? activeEvent.content
                  : null,
            });
            return (
              <div
                className={styles.juryChamberSeat}
                data-seat={index}
                data-speaking={talking ? "true" : undefined}
                data-thinking={thinkingBotId === juror.id ? "true" : undefined}
                data-visibility={presentation.visibility}
                data-scale={presentation.scale}
                data-color-cycle={presentation.colorCycle ? "true" : undefined}
                data-listening-reaction={listenerReaction ?? undefined}
                data-vocal-foley={foleyMouthShape ? "true" : undefined}
                key={juror.id}
                style={
                  {
                    "--jury-seat-color":
                      juror.color ?? DEBATE_GALLERY_COLORS[index],
                  } as CSSProperties
                }
              >
                <div className={styles.juryChamberAvatar}>
                  {props.renderBotAvatar ? (
                    talking && activeEvent ? (
                      <DebateActiveAvatarConsumer
                        store={presentationStore}
                        sessionId={session.id}
                        eventId={activeEvent.id}
                        bot={appearanceBot}
                        renderBotAvatar={props.renderBotAvatar}
                        state={{
                          role:
                            index === 0
                              ? "moderator"
                              : index % 2
                                ? "for"
                                : "against",
                          lookAtRole: null,
                          compact: true,
                          talking,
                          thinking: thinkingBotId === juror.id,
                          colorCycle: presentation.colorCycle,
                          foleyMouthShape,
                          listenerReaction,
                        }}
                      />
                    ) : (
                      props.renderBotAvatar(appearanceBot, {
                        role:
                          index === 0
                            ? "moderator"
                            : index % 2
                              ? "for"
                              : "against",
                        lookAtRole: null,
                        compact: true,
                        talking,
                        thinking: thinkingBotId === juror.id,
                        colorCycle: presentation.colorCycle,
                        speechTiming,
                        foleyMouthShape,
                        listenerReaction,
                      })
                    )
                  ) : (
                    <span>
                      {props.renderBotGlyph(juror.glyph ?? "lucideTriangle", {
                        size: 38,
                        strokeWidth: 1.35,
                      })}
                    </span>
                  )}
                </div>
                {vocalFoleyTagText ? (
                  <span
                    className={styles.botVocalFoleyTag}
                    data-debate-vocal-foley-tag="true"
                    aria-hidden="true"
                  >
                    *{sentenceCaseActionText(vocalFoleyTagText)}*
                  </span>
                ) : null}
                {silentDeliberationPreparing ? (
                  <i
                    className={`${styles.juryThoughtChip} ${styles.juryDeliberationBubble}`}
                    aria-hidden="true"
                  >
                    ...
                  </i>
                ) : pendingJuryThoughtBotId === juror.id ? (
                  <i
                    className={styles.juryThoughtChip}
                    aria-label={`${juror.name} has a thought`}
                  >
                    …
                  </i>
                ) : null}
                <div className={styles.juryChamberIdentity}>
                  <small>
                    {index === 0 ? "Foreperson · " : ""}
                    {presentation.displayName}
                  </small>
                  {finalBallot ? (
                    <span
                      data-side={finalBallot.sideId}
                      title={`Voted ${debateSideLabel(session, finalBallot.sideId)}`}
                    >
                      Voted {debateSideLabel(session, finalBallot.sideId)}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {finalBallotRoundVisible && session.playerRole !== "participant" ? (
          <div
            className={styles.juryVoteBoard}
            role="status"
            aria-live="polite"
            aria-label={`${session.jury.finalBallots.length} of ${DEBATE_JURY_SIZE} final ballots cast. ${session.motion.forSide.label}: ${liveForVotes}. ${session.motion.againstSide.label}: ${liveAgainstVotes}.`}
          >
            <div className={styles.juryVoteSide} data-side="for">
              <span title={session.motion.forSide.label}>
                {session.motion.forSide.label}
              </span>
              <strong>{liveForVotes}</strong>
            </div>
            <div className={styles.juryVoteProgress} aria-hidden="true">
              {session.jury.jurors.map((juror, index) => {
                const ballot = finalBallotsByJurorId.get(juror.id) ?? null;
                return (
                  <span
                    data-cast={ballot ? "true" : undefined}
                    data-side={ballot?.sideId}
                    key={`jury-vote-progress:${juror.id}`}
                  >
                    {ballot ? (ballot.sideId === "for" ? "F" : "A") : index + 1}
                  </span>
                );
              })}
              <small>
                {session.jury.finalBallots.length} of {DEBATE_JURY_SIZE} cast
              </small>
            </div>
            <div className={styles.juryVoteSide} data-side="against">
              <span title={session.motion.againstSide.label}>
                {session.motion.againstSide.label}
              </span>
              <strong>{liveAgainstVotes}</strong>
            </div>
          </div>
        ) : null}
        {/* The transparent raster is intentionally above the bots so its
            tabletop occludes their lower frames. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.juryTableRaster}
          src={`/coffee-table/table_${props.theme}.png`}
          alt=""
          aria-hidden="true"
        />
        <div
          className={styles.juryBallotPile}
          role="img"
          aria-label={`${session.jury.finalBallots.length} final Jury ${
            session.jury.finalBallots.length === 1 ? "ballot" : "ballots"
          } collected`}
        >
          {session.jury.finalBallots.map((ballot, ballotIndex) => (
            <span
              className={styles.juryBallotSlip}
              data-side={ballot.sideId}
              data-seat={session.jury.jurors.findIndex(
                (juror) => juror.id === ballot.jurorBotId,
              )}
              data-ballot={ballotIndex}
              key={ballot.jurorBotId}
              aria-hidden="true"
            >
              <i>{ballot.sideId === "for" ? "F" : "A"}</i>
            </span>
          ))}
        </div>
        <div className={styles.jurySeal} aria-hidden="true">
          <span>◇</span>
          <strong>Jury Chamber</strong>
          <small>
            {session.jury.phase === "initial_ballots"
              ? "Private leanings"
              : session.jury.phase === "final_ballots"
                ? `${session.jury.finalBallots.length} / ${DEBATE_JURY_SIZE} ballots cast`
                : session.jury.phase === "complete"
                  ? `${session.jury.forVotes}–${session.jury.againstVotes}`
                  : session.jury.phase === "waiting"
                    ? "Following the floor"
                    : `${session.jury.discussionTurnCount} / ${session.jury.discussionTurnTarget}`}
          </small>
        </div>
        <div
          className={styles.juryCenterTranscript}
          data-empty={chamberContent ? undefined : "true"}
          aria-live="polite"
        >
          <strong>
            {activeJurorId
              ? session.jury.jurors.find((juror) => juror.id === activeJurorId)
                  ?.name
              : session.jury.phase === "initial_ballots"
                ? "Private leanings are forming"
                : silentDeliberationPreparing
                  ? "The Jury is deliberating"
                  : session.jury.phase === "final_ballots"
                    ? "The Jury is voting"
                    : "The chamber is settling"}
          </strong>
          <p>
            {chamberEventVisible && activeEvent ? (
              <DebateVisibleTextConsumer
                store={presentationStore}
                sessionId={session.id}
                event={activeEvent}
              />
            ) : session.jury.phase === "initial_ballots" ? (
              "No leaning is displayed before deliberation."
            ) : silentDeliberationPreparing ? (
              "Their conversation remains unheard and uncaptioned while the Jury’s reasoning and final ballot recordings are prepared."
            ) : session.jury.phase === "final_ballots" ? (
              activeEvent?.kind === "ballot" ? (
                "The juror’s final reason and vote are now on the record."
              ) : (
                "Each final vote appears as it is cast."
              )
            ) : session.jury.phase === "waiting" ? (
              "The Jury follows the public floor and talks between turns."
            ) : (
              `The ${debatePublicMaterialName(session.formality).toLowerCase()} remains at the center of the table.`
            )}
          </p>
        </div>
      </div>
    );
  };

  const renderStageAlignmentModal = (
    session: DebateSessionV1 | null,
  ): React.JSX.Element | null => {
    if (!DEBATE_STAGE_ALIGNMENT_ENABLED || !stageAlignmentOpen) return null;
    if (!stageAlignmentPreviewCast) return null;
    const alignmentMotion = session?.motion ?? motion;
    const forSourceBot = stageAlignmentPreviewCast.forAdvocate;
    const moderatorSourceBot = stageAlignmentPreviewCast.moderator;
    const againstSourceBot = stageAlignmentPreviewCast.againstAdvocate;
    const forBot = debateAlignmentPreviewSnapshot(
      forSourceBot,
      "advocate",
      "for",
    );
    const moderatorBot = debateAlignmentPreviewSnapshot(
      moderatorSourceBot,
      "moderator",
      null,
    );
    const againstBot = debateAlignmentPreviewSnapshot(
      againstSourceBot,
      "advocate",
      "against",
    );
    const alignmentCast = [
      {
        role: "for" as const,
        bot: forBot,
        sourceBot: forSourceBot,
        roleLabel: alignmentMotion.forSide.label.trim() || "For",
      },
      {
        role: "moderator" as const,
        bot: moderatorBot,
        sourceBot: moderatorSourceBot,
        roleLabel: session
          ? normalizeDebateModeratorTitle(session.moderatorTitle)
          : effectiveModeratorTitle,
      },
      {
        role: "against" as const,
        bot: againstBot,
        sourceBot: againstSourceBot,
        roleLabel: alignmentMotion.againstSide.label.trim() || "Against",
      },
    ].map((entry) => {
      const presentation = {
        displayName: entry.bot.name,
        identityLabel: null,
        glyph: entry.bot.glyph,
        voiceSourceBotId: entry.bot.id,
        visibility: "visible" as const,
        scale: "normal" as const,
        colorCycle: false,
      };
      return { ...entry, presentation };
    });
    const interactiveAlignmentCast =
      stageAlignmentPreviewCamera === "moderator"
        ? alignmentCast.filter((entry) => entry.role === "moderator")
        : alignmentCast;
    const stageAlignmentEvidenceOnlyCamera =
      stageAlignmentPreviewCamera === "left" ||
      stageAlignmentPreviewCamera === "right";
    const stageAlignmentPreviewCameraLabel =
      stageAlignmentPreviewCamera === "wide"
        ? "Wide"
        : stageAlignmentPreviewCamera === "left"
          ? "Left"
          : stageAlignmentPreviewCamera === "moderator"
            ? "Moderator"
            : "Right";
    const previewTargets: readonly DebateStageAlignmentTarget[] =
      stageAlignmentPreviewCamera === "moderator"
        ? DEBATE_STAGE_ALIGNMENT_ITEMS.map((item) =>
            debateStageAlignmentTarget("moderator", item, "moderator"),
          )
        : stageAlignmentPreviewCamera === "wide"
          ? DEBATE_STAGE_ALIGNMENT_ROLES.flatMap((role) =>
              DEBATE_STAGE_ALIGNMENT_ITEMS.map((item) =>
                debateStageAlignmentTarget(role, item, "wide"),
              ),
            )
          : [];
    const placementIsDefault = previewTargets.every((target) => {
      const offset = debateStageAlignmentOffset(stageAlignmentDraft, target);
      const defaultOffset = debateStageAlignmentOffset(
        DEFAULT_DEBATE_STAGE_ALIGNMENT,
        target,
      );
      return offset.x === defaultOffset.x && offset.y === defaultOffset.y;
    });
    const gavelIsDefault = (["lowered", "raised"] as const).every(
      (pose) =>
        stageAlignmentDraft.gavel[pose].x ===
          DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel[pose].x &&
        stageAlignmentDraft.gavel[pose].y ===
          DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel[pose].y &&
        stageAlignmentDraft.gavel[pose].rotation ===
          DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel[pose].rotation &&
        stageAlignmentDraft.gavel[pose].size ===
          DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel[pose].size,
    );
    const evidenceAlignmentView = debateStageEvidenceViewForCamera(
      stageAlignmentPreviewCamera,
    );
    const evidenceTableIsDefault =
      stageAlignmentDraft.evidenceTable[stageAlignmentPreviewEvidenceKind][
        evidenceAlignmentView
      ].x ===
        DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable[
          stageAlignmentPreviewEvidenceKind
        ][evidenceAlignmentView].x &&
      stageAlignmentDraft.evidenceTable[stageAlignmentPreviewEvidenceKind][
        evidenceAlignmentView
      ].y ===
        DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable[
          stageAlignmentPreviewEvidenceKind
        ][evidenceAlignmentView].y &&
      stageAlignmentDraft.evidenceTable[stageAlignmentPreviewEvidenceKind][
        evidenceAlignmentView
      ].size ===
        DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable[
          stageAlignmentPreviewEvidenceKind
        ][evidenceAlignmentView].size;
    const activeGavelPose = stageAlignmentDraft.gavel[stageAlignmentGavelPose];
    const activeEvidenceTable =
      stageAlignmentDraft.evidenceTable[stageAlignmentPreviewEvidenceKind][
        evidenceAlignmentView
      ];
    const alignmentEvidencePreviewItem =
      debateStageAlignmentEvidencePreviewItem(
        stageAlignmentPreviewEvidenceKind,
        stageAlignmentPreviewEvidenceEmoji,
      );
    const previewIsDefault =
      placementIsDefault &&
      evidenceTableIsDefault &&
      (stageAlignmentPreviewCamera !== "moderator" || gavelIsDefault);
    const lightBlendModesAreDefault = (["dark", "light"] as const).every(
      (theme) =>
        stageAlignmentDraft.lightBlendModes[theme] ===
        DEFAULT_DEBATE_STAGE_ALIGNMENT.lightBlendModes[theme],
    );
    const lightMaskOpacitiesAreDefault = (["dark", "light"] as const).every(
      (theme) =>
        stageAlignmentDraft.lightMaskOpacities[theme] ===
        DEFAULT_DEBATE_STAGE_ALIGNMENT.lightMaskOpacities[theme],
    );
    const lightingIsDefault =
      lightBlendModesAreDefault && lightMaskOpacitiesAreDefault;
    return (
      <>
        <SessionAtmosphereLayer
          active={Boolean(
            props.audioEnabled && props.audioVolume > 0 && stageAlignmentOpen,
          )}
          sessionKey={`debate-alignment:${session?.id ?? props.storageScopeId}`}
          volume={props.audioVolume}
          mix={DEBATE_FOLEY_MIX}
          preloadFoleyUrls={DEBATE_GAVEL_FOLEY_PRELOAD_URLS}
          foleyRoomAcoustics={
            session?.format === "turnabout"
              ? DEBATE_TURNABOUT_FOLEY_ROOM_SEND
              : DEBATE_FORUM_FOLEY_ROOM_SEND
          }
          ambientFoley={false}
          deferFoley
          controllerHandleRef={stageAlignmentAtmosphereControllerRef}
        />
        <div
          className={styles.alignmentModalBackdrop}
          data-preview-theme={stageAlignmentPreviewTheme}
          data-alignment-source={session ? "session" : "dashboard"}
        >
          <section
            className={styles.alignmentModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="debate-stage-alignment-title"
            data-debate-stage-alignment-modal="true"
          >
            <header className={styles.alignmentModalHeader}>
              <div>
                <span className={styles.eyebrow}>Stage placement</span>
                <h2 id="debate-stage-alignment-title">
                  Align the Prismatic Forum
                </h2>
                <p>
                  Calibrate the Forum with a fresh random Library cast. Shuffle
                  the cast to check varied silhouettes and voices.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  data-debate-stage-alignment-shuffle="true"
                  onClick={() => {
                    stopStageAlignmentSoundCheck();
                    void randomizeStageAlignmentPreviewCast();
                  }}
                >
                  Shuffle cast
                </button>
                <button
                  type="button"
                  data-debate-stage-alignment-copy="true"
                  data-copy-state={stageAlignmentCopyState}
                  onClick={() => void copyStageAlignmentData()}
                  disabled={stageAlignmentCopyState === "copying"}
                >
                  {stageAlignmentCopyState === "copying"
                    ? "Copying…"
                    : stageAlignmentCopyState === "copied"
                      ? "Copied"
                      : stageAlignmentCopyState === "failed"
                        ? "Copy failed"
                        : "Copy alignment data"}
                </button>
                <button type="button" onClick={cancelStageAlignment}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.alignmentSaveButton}
                  ref={stageAlignmentSaveButtonRef}
                  onClick={saveStageAlignment}
                >
                  Save alignment
                </button>
              </div>
            </header>
            <div className={styles.alignmentModalBody}>
              <div className={styles.alignmentEditorHeader}>
                <p>
                  {stageAlignmentPreviewCamera === "moderator"
                    ? "Align the moderator bot, nameplate, and glyph plate independently from Wide."
                    : stageAlignmentPreviewCamera === "wide"
                      ? "Align every bot, nameplate, and glyph plate in the wide Forum without changing the close-ups."
                      : `Align the source pamphlet and exhibit independently in the ${stageAlignmentPreviewCameraLabel} debater close-up.`}{" "}
                  {stageAlignmentEvidenceOnlyCamera
                    ? "Use the evidence controls below to position and scale the active asset."
                    : "Drag an item or use arrow keys to nudge by 0.5%; hold Shift for 2%. Select the active item in the exact controls below."}
                </p>
                <div>
                  <div
                    className={styles.alignmentViewToggle}
                    role="group"
                    aria-label="Debate alignment preview camera"
                  >
                    {(["wide", "left", "moderator", "right"] as const).map(
                      (previewCamera) => (
                        <button
                          type="button"
                          aria-pressed={
                            stageAlignmentPreviewCamera === previewCamera
                          }
                          onClick={() =>
                            setStageAlignmentPreviewCamera(previewCamera)
                          }
                          key={previewCamera}
                        >
                          {previewCamera === "wide"
                            ? "Wide"
                            : previewCamera === "left"
                              ? "Left"
                              : previewCamera === "moderator"
                                ? "Moderator"
                                : "Right"}
                        </button>
                      ),
                    )}
                  </div>
                  <div
                    className={styles.alignmentThemeToggle}
                    role="group"
                    aria-label="Debate alignment preview theme"
                  >
                    {(["light", "dark"] as const).map((previewTheme) => (
                      <button
                        type="button"
                        aria-pressed={
                          stageAlignmentPreviewTheme === previewTheme
                        }
                        onClick={() =>
                          setStageAlignmentPreviewTheme(previewTheme)
                        }
                        key={previewTheme}
                      >
                        {previewTheme === "light" ? "Light" : "Dark"}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setStageAlignmentDraft((current) =>
                        stageAlignmentEvidenceOnlyCamera
                          ? normalizeDebateStageAlignment({
                              ...current,
                              evidenceTable: {
                                exhibit: {
                                  ...current.evidenceTable.exhibit,
                                  [stageAlignmentPreviewCamera]:
                                    DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable
                                      .exhibit[stageAlignmentPreviewCamera],
                                },
                                source: {
                                  ...current.evidenceTable.source,
                                  [stageAlignmentPreviewCamera]:
                                    DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable
                                      .source[stageAlignmentPreviewCamera],
                                },
                              },
                            })
                          : stageAlignmentPreviewCamera === "moderator"
                            ? normalizeDebateStageAlignment({
                                ...current,
                                moderator:
                                  DEFAULT_DEBATE_STAGE_ALIGNMENT.moderator,
                                gavel: DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel,
                                evidenceTable: {
                                  exhibit: {
                                    ...current.evidenceTable.exhibit,
                                    moderator:
                                      DEFAULT_DEBATE_STAGE_ALIGNMENT
                                        .evidenceTable.exhibit.moderator,
                                  },
                                  source: {
                                    ...current.evidenceTable.source,
                                    moderator:
                                      DEFAULT_DEBATE_STAGE_ALIGNMENT
                                        .evidenceTable.source.moderator,
                                  },
                                },
                              })
                            : normalizeDebateStageAlignment({
                                ...current,
                                wide: DEFAULT_DEBATE_STAGE_ALIGNMENT.wide,
                                evidenceTable: {
                                  exhibit: {
                                    ...current.evidenceTable.exhibit,
                                    wide: DEFAULT_DEBATE_STAGE_ALIGNMENT
                                      .evidenceTable.exhibit.wide,
                                  },
                                  source: {
                                    ...current.evidenceTable.source,
                                    wide: DEFAULT_DEBATE_STAGE_ALIGNMENT
                                      .evidenceTable.source.wide,
                                  },
                                },
                              }),
                      )
                    }
                    disabled={previewIsDefault}
                  >
                    {stageAlignmentPreviewCamera === "moderator"
                      ? "Reset moderator"
                      : stageAlignmentPreviewCamera === "wide"
                        ? "Reset positions"
                        : "Reset evidence"}
                  </button>
                </div>
              </div>
              <div className={styles.alignmentViewportColumn}>
                <div
                  className={`${styles.live} ${styles.alignmentPreviewThemeScope}`}
                  data-theme={stageAlignmentPreviewTheme}
                  style={
                    {
                      "--debate-active-color": "#9c8cff",
                      "--debate-for-color": forBot.color ?? "#42d9ff",
                      "--debate-against-color": againstBot.color ?? "#ff5f8f",
                      "--debate-moderator-color":
                        moderatorBot.color ?? "#d9d2ff",
                    } as CSSProperties
                  }
                >
                  <div
                    className={`${styles.forum} ${styles.alignmentForum}`}
                    data-debate-alignment-stage="true"
                    data-debate-stage-viewport="alignment"
                  >
                    <div
                      className={styles.forumCamera}
                      data-camera-view={stageAlignmentPreviewCamera}
                      data-alignment-evidence-only={
                        stageAlignmentEvidenceOnlyCamera ? "true" : undefined
                      }
                      inert={stageAlignmentEvidenceOnlyCamera || undefined}
                      style={debateStageAlignmentStyle(stageAlignmentDraft)}
                    >
                      <div
                        className={styles.receiverMatte}
                        aria-hidden="true"
                      />
                      <DebateForumLightMasks depth="backdrop" />
                      {interactiveAlignmentCast.map(
                        ({ role, bot, presentation }) => {
                          const soundCheckPlaying =
                            stageAlignmentSoundCheck?.role === role &&
                            stageAlignmentSoundCheck.status === "playing";
                          const soundCheckSpeechTiming = soundCheckPlaying
                            ? stageAlignmentSoundCheck.speechTiming
                            : null;
                          const target = stageAlignmentTargetForRole(
                            role,
                            "bot",
                          );
                          return (
                            <div
                              className={`${styles.botPosition} ${styles.alignmentHandle}`}
                              data-role={role}
                              data-dragging={
                                stageAlignmentDraggingTarget === target
                                  ? "true"
                                  : undefined
                              }
                              data-selected={
                                stageAlignmentSelectedItems[role] === "bot"
                                  ? "true"
                                  : undefined
                              }
                              data-alignment-item="bot"
                              role="button"
                              tabIndex={0}
                              aria-label={`Move ${DEBATE_STAGE_ALIGNMENT_LABELS[role]} bot. Use arrow keys to nudge.`}
                              onPointerDown={(event) =>
                                beginStageAlignmentDrag(event, role, "bot")
                              }
                              onPointerMove={moveStageAlignmentDrag}
                              onPointerUp={finishStageAlignmentDrag}
                              onPointerCancel={finishStageAlignmentDrag}
                              onKeyDown={(event) =>
                                nudgeStageAlignmentItem(event, role, "bot")
                              }
                              key={`alignment-avatar:${bot.id}`}
                            >
                              <div
                                className={styles.botStagePresence}
                                data-speaking={
                                  soundCheckPlaying ? "true" : undefined
                                }
                                data-scale={presentation.scale}
                                data-debate-stage-compact={
                                  role === "moderator" &&
                                  stageAlignmentPreviewCamera !== "moderator"
                                    ? "true"
                                    : undefined
                                }
                              >
                                {props.renderBotAvatar ? (
                                  props.renderBotAvatar(bot, {
                                    role,
                                    lookAtRole: null,
                                    compact:
                                      role === "moderator" &&
                                      stageAlignmentPreviewCamera !==
                                        "moderator",
                                    talking: soundCheckPlaying,
                                    thinking: false,
                                    colorCycle: presentation.colorCycle,
                                    speechTiming: soundCheckSpeechTiming,
                                    foleyMouthShape: null,
                                    listenerReaction: null,
                                  })
                                ) : (
                                  <span className={styles.botGlyphFallback}>
                                    {props.renderBotGlyph(presentation.glyph, {
                                      size: 42,
                                      strokeWidth: 1.35,
                                    })}
                                  </span>
                                )}
                              </div>
                              <span className={styles.alignmentHandleLabel}>
                                {DEBATE_STAGE_ALIGNMENT_LABELS[role]} · Bot
                              </span>
                            </div>
                          );
                        },
                      )}
                      <div
                        className={styles.podiumForeground}
                        aria-hidden="true"
                      />
                      <DebateForumLightMasks depth="foreground" />
                      <DebateEvidencePedestal
                        item={alignmentEvidencePreviewItem}
                        view={evidenceAlignmentView}
                        alignmentPreview
                        onOpen={() => {}}
                      />
                      <DebateModeratorGavel
                        theme={stageAlignmentPreviewTheme}
                        color={moderatorBot.color ?? "#d9d2ff"}
                        cue={stageAlignmentGavelCue}
                        previewPose={stageAlignmentGavelPose}
                        sessionId="alignment-preview"
                        audioEnabled={
                          props.audioEnabled && props.audioVolume > 0
                        }
                        atmosphereControllerRef={
                          stageAlignmentAtmosphereControllerRef
                        }
                      />
                      {interactiveAlignmentCast.map(
                        ({ role, bot, presentation }) => {
                          const soundCheckPlaying =
                            stageAlignmentSoundCheck?.role === role &&
                            stageAlignmentSoundCheck.status === "playing";
                          const target = stageAlignmentTargetForRole(
                            role,
                            "glyph",
                          );
                          return (
                            <div
                              className={`${styles.podiumGlyphPosition} ${styles.alignmentHandle}`}
                              data-role={role}
                              data-turn-active={
                                soundCheckPlaying ? "true" : undefined
                              }
                              data-visibility={presentation.visibility}
                              data-dragging={
                                stageAlignmentDraggingTarget === target
                                  ? "true"
                                  : undefined
                              }
                              data-selected={
                                stageAlignmentSelectedItems[role] === "glyph"
                                  ? "true"
                                  : undefined
                              }
                              data-alignment-item="glyph"
                              role="button"
                              tabIndex={0}
                              aria-label={`Move ${DEBATE_STAGE_ALIGNMENT_LABELS[role]} glyph plate. Use arrow keys to nudge.`}
                              onPointerDown={(event) =>
                                beginStageAlignmentDrag(event, role, "glyph")
                              }
                              onPointerMove={moveStageAlignmentDrag}
                              onPointerUp={finishStageAlignmentDrag}
                              onPointerCancel={finishStageAlignmentDrag}
                              onKeyDown={(event) =>
                                nudgeStageAlignmentItem(event, role, "glyph")
                              }
                              key={`alignment-podium-glyph:${bot.id}`}
                            >
                              <span className={styles.podiumGlyphScreen}>
                                <span className={styles.podiumGlyphMark}>
                                  {props.renderBotGlyph(presentation.glyph, {
                                    size: 48,
                                    strokeWidth: 1.5,
                                  })}
                                </span>
                              </span>
                              <span className={styles.alignmentHandleLabel}>
                                {DEBATE_STAGE_ALIGNMENT_LABELS[role]} · Glyph
                              </span>
                            </div>
                          );
                        },
                      )}
                      {interactiveAlignmentCast.map(
                        ({ role, bot, presentation, roleLabel }) => {
                          const soundCheckPlaying =
                            stageAlignmentSoundCheck?.role === role &&
                            stageAlignmentSoundCheck.status === "playing";
                          const target = stageAlignmentTargetForRole(
                            role,
                            "nameplate",
                          );
                          return (
                            <div
                              className={`${styles.botIdentityPosition} ${styles.alignmentHandle}`}
                              data-role={role}
                              data-speaking={
                                soundCheckPlaying ? "true" : undefined
                              }
                              data-dragging={
                                stageAlignmentDraggingTarget === target
                                  ? "true"
                                  : undefined
                              }
                              data-selected={
                                stageAlignmentSelectedItems[role] ===
                                "nameplate"
                                  ? "true"
                                  : undefined
                              }
                              data-alignment-item="nameplate"
                              role="button"
                              tabIndex={0}
                              aria-label={`Move ${DEBATE_STAGE_ALIGNMENT_LABELS[role]} nameplate. Use arrow keys to nudge.`}
                              onPointerDown={(event) =>
                                beginStageAlignmentDrag(
                                  event,
                                  role,
                                  "nameplate",
                                )
                              }
                              onPointerMove={moveStageAlignmentDrag}
                              onPointerUp={finishStageAlignmentDrag}
                              onPointerCancel={finishStageAlignmentDrag}
                              onKeyDown={(event) =>
                                nudgeStageAlignmentItem(
                                  event,
                                  role,
                                  "nameplate",
                                )
                              }
                              key={`alignment-identity:${bot.id}`}
                            >
                              <div className={styles.botIdentityPlate}>
                                <strong>{presentation.displayName}</strong>
                                <small>{roleLabel}</small>
                              </div>
                              <span className={styles.alignmentHandleLabel}>
                                {DEBATE_STAGE_ALIGNMENT_LABELS[role]} ·
                                Nameplate
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                </div>
                {stageAlignmentPreviewCamera === "moderator" ? (
                  <section
                    className={styles.alignmentGavelTuner}
                    aria-label="Debate moderator gavel controls"
                  >
                    <header>
                      <div>
                        <span className={styles.eyebrow}>Moderator view</span>
                        <strong>Gavel</strong>
                      </div>
                      <button
                        type="button"
                        disabled={gavelIsDefault}
                        onClick={() =>
                          setStageAlignmentDraft((current) =>
                            normalizeDebateStageAlignment({
                              ...current,
                              gavel: DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel,
                            }),
                          )
                        }
                      >
                        Reset
                      </button>
                    </header>
                    <div className={styles.alignmentGavelPoseEditor}>
                      <div className={styles.alignmentGavelPoseControls}>
                        <div
                          className={styles.alignmentGavelPoseToggle}
                          role="group"
                          aria-label="Gavel pose to align"
                        >
                          {(["lowered", "raised"] as const).map((pose) => (
                            <button
                              type="button"
                              aria-pressed={stageAlignmentGavelPose === pose}
                              data-debate-gavel-pose={pose}
                              onClick={() => {
                                setStageAlignmentGavelCue(null);
                                setStageAlignmentGavelPose(pose);
                              }}
                              key={pose}
                            >
                              {pose === "lowered" ? "Lowered" : "Raised"}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className={styles.alignmentGavelLinkToggle}
                          data-linked={
                            stageAlignmentGavelPosesLinked ? "true" : "false"
                          }
                          data-debate-gavel-link="true"
                          aria-pressed={stageAlignmentGavelPosesLinked}
                          aria-label={
                            stageAlignmentGavelPosesLinked
                              ? "Unlock gavel poses"
                              : "Lock gavel poses"
                          }
                          title={
                            stageAlignmentGavelPosesLinked
                              ? "Linked: adjustments move both poses"
                              : "Independent: adjustments move one pose"
                          }
                          onClick={() => {
                            setStageAlignmentGavelCue(null);
                            setStageAlignmentGavelPosesLinked(
                              (current) => !current,
                            );
                          }}
                        >
                          <svg
                            viewBox="0 0 20 20"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <rect
                              x="4.5"
                              y="8.5"
                              width="11"
                              height="8"
                              rx="2"
                            />
                            <path
                              d={
                                stageAlignmentGavelPosesLinked
                                  ? "M6.75 8.5V6.25a3.25 3.25 0 0 1 6.5 0V8.5"
                                  : "M13.25 8.5V6.25a3.25 3.25 0 0 0-6.5 0"
                              }
                            />
                          </svg>
                          <span>
                            {stageAlignmentGavelPosesLinked
                              ? "Linked"
                              : "Independent"}
                          </span>
                        </button>
                      </div>
                      <div className={styles.alignmentGavelTunerRows}>
                        {(
                          [
                            {
                              key: "x",
                              label: "Horizontal",
                              min: DEBATE_STAGE_GAVEL_POSITION_MIN,
                              max: DEBATE_STAGE_GAVEL_POSITION_MAX,
                              step: DEBATE_STAGE_GAVEL_POSITION_STEP,
                              suffix: "%",
                            },
                            {
                              key: "y",
                              label: "Vertical",
                              min: DEBATE_STAGE_GAVEL_POSITION_MIN,
                              max: DEBATE_STAGE_GAVEL_POSITION_MAX,
                              step: DEBATE_STAGE_GAVEL_POSITION_STEP,
                              suffix: "%",
                            },
                            {
                              key: "rotation",
                              label: "Rotation",
                              min: DEBATE_STAGE_GAVEL_ROTATION_MIN,
                              max: DEBATE_STAGE_GAVEL_ROTATION_MAX,
                              step: DEBATE_STAGE_GAVEL_ROTATION_STEP,
                              suffix: "°",
                            },
                            {
                              key: "size",
                              label: "Size",
                              min: DEBATE_STAGE_GAVEL_SIZE_MIN,
                              max: DEBATE_STAGE_GAVEL_SIZE_MAX,
                              step: DEBATE_STAGE_GAVEL_SIZE_STEP,
                              suffix: "%",
                            },
                          ] as const
                        ).map((control) => {
                          const value = activeGavelPose[control.key];
                          return (
                            <label key={control.key}>
                              <span>
                                {control.label}
                                <output>
                                  {control.key !== "size" && value > 0
                                    ? "+"
                                    : ""}
                                  {value.toFixed(
                                    control.key === "rotation" ||
                                      control.key === "size"
                                      ? 0
                                      : 1,
                                  )}
                                  {control.suffix}
                                </output>
                              </span>
                              <input
                                type="range"
                                min={control.min}
                                max={control.max}
                                step={control.step}
                                value={value}
                                aria-label={`${stageAlignmentGavelPose} gavel ${control.label.toLowerCase()}`}
                                onChange={(event) => {
                                  const nextValue = Number(
                                    event.currentTarget.value,
                                  );
                                  setStageAlignmentGavelCue(null);
                                  setStageAlignmentDraft((current) =>
                                    updateDebateStageGavelPose(
                                      current,
                                      stageAlignmentGavelPose,
                                      {
                                        [control.key]: nextValue,
                                      },
                                      stageAlignmentGavelPosesLinked,
                                    ),
                                  );
                                }}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div
                      className={styles.alignmentGavelPreviewActions}
                      role="group"
                      aria-label="Preview and export moderator gavel"
                    >
                      <strong>Preview &amp; export</strong>
                      <div>
                        <button
                          type="button"
                          data-debate-gavel-copy="true"
                          data-copy-state={stageAlignmentCopyState}
                          onClick={() => void copyStageGavelData()}
                          disabled={stageAlignmentCopyState === "copying"}
                        >
                          {stageAlignmentCopyState === "copying"
                            ? "Copying…"
                            : stageAlignmentCopyState === "copied"
                              ? "Copied"
                              : stageAlignmentCopyState === "failed"
                                ? "Copy failed"
                                : "Copy gavel JSON"}
                        </button>
                        <button
                          type="button"
                          data-debate-gavel-test="attention"
                          onClick={() =>
                            previewStageAlignmentGavel("attention")
                          }
                        >
                          One strike
                        </button>
                        <button
                          type="button"
                          data-debate-gavel-test="order"
                          onClick={() => previewStageAlignmentGavel("order")}
                        >
                          Two strikes
                        </button>
                      </div>
                      <small>
                        {props.audioEnabled && props.audioVolume > 0
                          ? "Live animation and sound."
                          : "Animation only. Enable audio for sound."}
                      </small>
                    </div>
                  </section>
                ) : null}
                <section
                  className={styles.alignmentEvidenceTuner}
                  aria-label="Debate evidence placement controls"
                  data-debate-evidence-tuner="true"
                  data-evidence-view={evidenceAlignmentView}
                  data-evidence-kind={stageAlignmentPreviewEvidenceKind}
                >
                  <header>
                    <div>
                      <span className={styles.eyebrow}>
                        {stageAlignmentPreviewCameraLabel} view
                      </span>
                      <strong>
                        {stageAlignmentPreviewEvidenceKind === "source"
                          ? "Source pamphlet"
                          : "Exhibit"}
                      </strong>
                    </div>
                    <button
                      type="button"
                      disabled={evidenceTableIsDefault}
                      onClick={() =>
                        setStageAlignmentDraft((current) =>
                          normalizeDebateStageAlignment({
                            ...current,
                            evidenceTable: {
                              ...current.evidenceTable,
                              [stageAlignmentPreviewEvidenceKind]: {
                                ...current.evidenceTable[
                                  stageAlignmentPreviewEvidenceKind
                                ],
                                [evidenceAlignmentView]:
                                  DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable[
                                    stageAlignmentPreviewEvidenceKind
                                  ][evidenceAlignmentView],
                              },
                            },
                          }),
                        )
                      }
                    >
                      Reset
                    </button>
                  </header>
                  <div className={styles.alignmentEvidenceEditor}>
                    <div
                      className={styles.alignmentEvidenceKindToggle}
                      role="group"
                      aria-label="Evidence asset to align"
                    >
                      {(["exhibit", "source"] as const).map((evidenceKind) => (
                        <button
                          type="button"
                          key={evidenceKind}
                          aria-pressed={
                            stageAlignmentPreviewEvidenceKind === evidenceKind
                          }
                          data-debate-evidence-kind-toggle={evidenceKind}
                          onClick={() =>
                            setStageAlignmentPreviewEvidenceKind(evidenceKind)
                          }
                        >
                          {evidenceKind === "source" ? "Source" : "Exhibit"}
                        </button>
                      ))}
                    </div>
                    <div className={styles.alignmentGavelTunerRows}>
                      {(
                        [
                          {
                            key: "x",
                            label: "Horizontal",
                            min: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
                            max: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
                            step: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_STEP,
                            suffix: "%",
                          },
                          {
                            key: "y",
                            label: "Vertical",
                            min: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MIN,
                            max: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_MAX,
                            step: DEBATE_STAGE_EVIDENCE_TABLE_POSITION_STEP,
                            suffix: "%",
                          },
                          {
                            key: "size",
                            label: "Size",
                            min: DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MIN,
                            max: DEBATE_STAGE_EVIDENCE_TABLE_SIZE_MAX,
                            step: DEBATE_STAGE_EVIDENCE_TABLE_SIZE_STEP,
                            suffix: "%",
                          },
                        ] as const
                      ).map((control) => {
                        const value = activeEvidenceTable[control.key];
                        return (
                          <label key={control.key}>
                            <span>
                              {control.label}
                              <output>
                                {control.key !== "size" && value > 0 ? "+" : ""}
                                {value.toFixed(control.key === "size" ? 0 : 1)}
                                {control.suffix}
                              </output>
                            </span>
                            <input
                              type="range"
                              min={control.min}
                              max={control.max}
                              step={control.step}
                              value={value}
                              aria-label={`${stageAlignmentPreviewEvidenceKind === "source" ? "Source" : "Exhibit"} ${control.label.toLowerCase()}`}
                              onChange={(event) => {
                                const nextValue = Number(
                                  event.currentTarget.value,
                                );
                                setStageAlignmentDraft((current) =>
                                  updateDebateStageEvidenceTable(
                                    current,
                                    stageAlignmentPreviewEvidenceKind,
                                    evidenceAlignmentView,
                                    {
                                      [control.key]: nextValue,
                                    },
                                  ),
                                );
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div
                    className={styles.alignmentGavelPreviewActions}
                    role="group"
                    aria-label="Export evidence placement"
                  >
                    <strong>Export</strong>
                    <div>
                      <button
                        type="button"
                        data-debate-evidence-copy="true"
                        data-copy-state={stageAlignmentCopyState}
                        onClick={() => void copyStageEvidenceTableData()}
                        disabled={stageAlignmentCopyState === "copying"}
                      >
                        {stageAlignmentCopyState === "copying"
                          ? "Copying…"
                          : stageAlignmentCopyState === "copied"
                            ? "Copied"
                            : stageAlignmentCopyState === "failed"
                              ? "Copy failed"
                              : "Copy evidence JSON"}
                      </button>
                      {stageAlignmentPreviewEvidenceKind === "exhibit" ? (
                        <button
                          type="button"
                          data-debate-evidence-reshuffle="true"
                          onClick={() =>
                            setStageAlignmentPreviewEvidenceEmoji(
                              pickDebateStageAlignmentEvidenceEmoji(),
                            )
                          }
                        >
                          New emoji
                        </button>
                      ) : null}
                    </div>
                    <small>
                      Exhibit and Source placement are saved independently for
                      Wide, Left, Moderator, and Right cameras.
                    </small>
                  </div>
                </section>
                <section
                  className={styles.alignmentLightingTuner}
                  aria-label="Debate light color mask controls"
                >
                  <header>
                    <div>
                      <span className={styles.eyebrow}>Color blend</span>
                      <strong>Architectural bounce</strong>
                    </div>
                    <button
                      type="button"
                      disabled={lightingIsDefault}
                      onClick={() =>
                        setStageAlignmentDraft((current) =>
                          normalizeDebateStageAlignment({
                            ...current,
                            lightBlendModes:
                              DEFAULT_DEBATE_STAGE_ALIGNMENT.lightBlendModes,
                            lightMaskOpacities:
                              DEFAULT_DEBATE_STAGE_ALIGNMENT.lightMaskOpacities,
                          }),
                        )
                      }
                    >
                      Reset
                    </button>
                  </header>
                  <div className={styles.alignmentLightingTunerRows}>
                    {(["dark", "light"] as const).map((theme) => {
                      const label = theme === "dark" ? "Dark" : "Light";
                      return (
                        <div
                          className={styles.alignmentLightingTunerRow}
                          data-active={
                            stageAlignmentPreviewTheme === theme
                              ? "true"
                              : undefined
                          }
                          key={theme}
                        >
                          <strong>{label}</strong>
                          <select
                            className={styles.alignmentLightingBlendSelect}
                            aria-label={`${label} Debate light blend mode`}
                            value={stageAlignmentDraft.lightBlendModes[theme]}
                            onChange={(event) => {
                              setStageAlignmentPreviewTheme(theme);
                              setStageAlignmentDraft((current) =>
                                updateDebateStageLightBlendMode(
                                  current,
                                  theme,
                                  event.currentTarget
                                    .value as DebateStageLightBlendMode,
                                ),
                              );
                            }}
                          >
                            {DEBATE_STAGE_LIGHT_BLEND_MODES.map((blendMode) => (
                              <option value={blendMode} key={blendMode}>
                                {blendMode
                                  .split("-")
                                  .map(
                                    (word) =>
                                      word.charAt(0).toUpperCase() +
                                      word.slice(1),
                                  )
                                  .join(" ")}
                              </option>
                            ))}
                          </select>
                          <label className={styles.alignmentLightingOpacity}>
                            <span>
                              Opacity
                              <output>
                                {stageAlignmentDraft.lightMaskOpacities[theme]}%
                              </output>
                            </span>
                            <input
                              type="range"
                              min={DEBATE_STAGE_LIGHT_MASK_OPACITY_MIN}
                              max={DEBATE_STAGE_LIGHT_MASK_OPACITY_MAX}
                              step={DEBATE_STAGE_LIGHT_MASK_OPACITY_STEP}
                              value={
                                stageAlignmentDraft.lightMaskOpacities[theme]
                              }
                              aria-label={`${label} Debate color mask opacity`}
                              onChange={(event) => {
                                setStageAlignmentPreviewTheme(theme);
                                setStageAlignmentDraft((current) =>
                                  updateDebateStageLightMaskOpacity(
                                    current,
                                    theme,
                                    Number(event.currentTarget.value),
                                  ),
                                );
                              }}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <small>
                    Saved separately for Light and Dark on this account and
                    device.
                  </small>
                </section>
                {!stageAlignmentEvidenceOnlyCamera ? (
                  <section
                    className={styles.alignmentTuner}
                    aria-label="Debate stage position controls"
                    data-camera-view={stageAlignmentPreviewCamera}
                  >
                    {interactiveAlignmentCast.map(
                      ({ role, bot, sourceBot }) => {
                        const selectedItem = stageAlignmentSelectedItems[role];
                        const soundCheckState =
                          stageAlignmentSoundCheck?.role === role
                            ? stageAlignmentSoundCheck.status
                            : null;
                        const anotherSoundCheckIsPlaying =
                          stageAlignmentSoundCheck?.status === "playing" &&
                          stageAlignmentSoundCheck.role !== role;
                        const target = stageAlignmentTargetForRole(
                          role,
                          selectedItem,
                        );
                        const offset = debateStageAlignmentOffset(
                          stageAlignmentDraft,
                          target,
                        );
                        const defaultOffset = debateStageAlignmentOffset(
                          DEFAULT_DEBATE_STAGE_ALIGNMENT,
                          target,
                        );
                        return (
                          <div className={styles.alignmentTunerRole} key={role}>
                            <header>
                              <div>
                                <span>
                                  {DEBATE_STAGE_ALIGNMENT_LABELS[role]}
                                </span>
                                <strong>{bot.name}</strong>
                              </div>
                              <div className={styles.alignmentTunerRoleActions}>
                                <button
                                  type="button"
                                  data-debate-stage-sound-check={role}
                                  data-sound-check-state={
                                    soundCheckState ?? undefined
                                  }
                                  disabled={
                                    !onUtterance ||
                                    !props.audioEnabled ||
                                    props.audioVolume <= 0 ||
                                    sourceBot.hardMuted ||
                                    anotherSoundCheckIsPlaying
                                  }
                                  aria-label={`Sound check ${sourceBot.name} as ${DEBATE_STAGE_ALIGNMENT_LABELS[role]}`}
                                  aria-pressed={soundCheckState === "playing"}
                                  title={
                                    sourceBot.hardMuted
                                      ? `${sourceBot.name} is fully muted.`
                                      : !onUtterance ||
                                          !props.audioEnabled ||
                                          props.audioVolume <= 0
                                        ? "Enable voice and volume to run this sound check."
                                        : `Test ${sourceBot.name}'s configured voice.`
                                  }
                                  onClick={() =>
                                    void previewStageAlignmentVoice(
                                      role,
                                      sourceBot,
                                      session?.format ?? format,
                                    )
                                  }
                                >
                                  {sourceBot.hardMuted
                                    ? "Muted"
                                    : soundCheckState === "playing"
                                      ? "Stop check"
                                      : soundCheckState === "unavailable"
                                        ? "Unavailable"
                                        : "Sound check"}
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    offset.x === defaultOffset.x &&
                                    offset.y === defaultOffset.y
                                  }
                                  aria-label={`Reset ${DEBATE_STAGE_ALIGNMENT_LABELS[role]} ${DEBATE_STAGE_ALIGNMENT_ITEM_LABELS[selectedItem].toLowerCase()} position`}
                                  onClick={() =>
                                    updateStageAlignmentTarget(
                                      target,
                                      defaultOffset,
                                    )
                                  }
                                >
                                  Reset
                                </button>
                              </div>
                            </header>
                            <div
                              className={styles.alignmentItemToggle}
                              role="group"
                              aria-label={`${DEBATE_STAGE_ALIGNMENT_LABELS[role]} item`}
                            >
                              {DEBATE_STAGE_ALIGNMENT_ITEMS.map((item) => (
                                <button
                                  type="button"
                                  aria-pressed={selectedItem === item}
                                  onClick={() =>
                                    setStageAlignmentSelectedItems(
                                      (current) => ({
                                        ...current,
                                        [role]: item,
                                      }),
                                    )
                                  }
                                  key={item}
                                >
                                  {DEBATE_STAGE_ALIGNMENT_ITEM_LABELS[item]}
                                </button>
                              ))}
                            </div>
                            {(["x", "y"] as const).map((axis) => (
                              <label key={axis}>
                                <span>
                                  {axis === "x" ? "Horizontal" : "Vertical"}
                                  <output>
                                    {offset[axis] > 0 ? "+" : ""}
                                    {offset[axis].toFixed(1)}%
                                  </output>
                                </span>
                                <input
                                  type="range"
                                  min={DEBATE_STAGE_ALIGNMENT_MIN}
                                  max={DEBATE_STAGE_ALIGNMENT_MAX}
                                  step={DEBATE_STAGE_ALIGNMENT_STEP}
                                  value={offset[axis]}
                                  aria-label={`${DEBATE_STAGE_ALIGNMENT_LABELS[role]} ${DEBATE_STAGE_ALIGNMENT_ITEM_LABELS[selectedItem]} ${
                                    axis === "x" ? "horizontal" : "vertical"
                                  } position`}
                                  onChange={(event) =>
                                    updateStageAlignmentTarget(target, {
                                      [axis]: Number(event.currentTarget.value),
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        );
                      },
                    )}
                  </section>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </>
    );
  };

  const renderLive = (): React.JSX.Element => {
    if (!activeSession) return renderLobby();
    const session = activeSession;
    const spectatorAwaitingFirstWatch =
      debateSpectatorAwaitingFirstWatch(session);
    const roomPresence = debateRoomPresence({
      status: session.status,
      presenting,
      observerPerspective,
    });
    const judgeGuidedStep = debateJudgeGuidedStepKind({
      playerRole: session.playerRole,
      status: session.status,
      stepKey: session.stepKey,
      judgeGavelStatus: session.judgeGavel?.status,
      objectionRulingStatus: session.objectionRuling?.status,
    });
    const presentedEvent = presentationEventId
      ? (session.events.find((event) => event.id === presentationEventId) ??
        null)
      : null;
    const activeEvent =
      (presentedEvent &&
      (!debateEventIsJuryComment(presentedEvent) || juryCameraActive)
        ? presentedEvent
        : null) ??
      (!presenting
        ? ([...session.events]
            .reverse()
            .find(
              (event) =>
                (!(
                  !juryCameraActive &&
                  (event.kind === "jury_deliberation" ||
                    (event.kind === "ballot" && event.speakerKind === "juror"))
                ) &&
                  [
                    "intro",
                    "phase",
                    "speech",
                    "silence",
                    "testimony",
                    "press",
                    "objection",
                    "evidence",
                    "revelation",
                    "player_turn",
                    "reaction",
                    "interjection",
                    "judge_gavel",
                    "moderator_ruling",
                    "ballot",
                    "jury_deliberation",
                    "jury_verdict",
                  ].includes(event.kind)) ||
                (event.kind === "verdict" && event.speakerKind === "player"),
            ) ?? null)
        : null) ??
      null;
    const participantPlayerBotId =
      session.playerRole === "participant"
        ? session.playerSideId === "against"
          ? session.againstAdvocate.id
          : session.forAdvocate.id
        : null;
    const activeSpeakerId =
      activeEvent?.speakerKind === "player" && participantPlayerBotId
        ? participantPlayerBotId
        : (activeEvent?.speakerBotId ??
          (activeEvent?.speakerKind === "player" &&
          session.playerRole === "judge" &&
          session.moderator.id === DEBATE_PLAYER_JUDGE_BOT_ID
            ? session.moderator.id
            : null));
    const participantFloorRole = debateParticipantFloorRole(
      session,
      activeEvent,
    );
    const participantInputRole: DebateForumRole | null =
      !presenting &&
      session.playerRole === "participant" &&
      session.status === "waiting_for_player"
        ? session.playerSideId === "against"
          ? "against"
          : "for"
        : null;
    const activeRole: DebateForumRole | null =
      participantInputRole ??
      (activeSpeakerId === session.moderator.id
        ? "moderator"
        : activeSpeakerId === session.forAdvocate.id
          ? "for"
          : activeSpeakerId === session.againstAdvocate.id
            ? "against"
            : participantFloorRole);
    const activeColor =
      activeRole === "moderator"
        ? session.moderator.color
        : activeRole === "for"
          ? session.forAdvocate.color
          : activeRole === "against"
            ? session.againstAdvocate.color
            : (session.jury.jurors.find((juror) => juror.id === activeSpeakerId)
                ?.color ?? null);
    const activeGavelCue =
      judgeGavelSmashCue ?? (presenting ? liveGavelCue : null);
    const gavelCameraReady =
      judgeGavelSmashCue !== null ||
      activeGavelCue?.kind !== "order" ||
      presentationEventId === activeGavelCue.eventId;
    const forumPreparingNextTurn =
      busy && !presenting && judgeGavelSmashCue === null;
    const judgeGavelCameraForced = judgeGavelSmashCue !== null;
    // Settled recess overlay holds Wide. Resume/pause ceremony (busy or
    // presenting while paused) cuts to Moderator for the gavel beat.
    const recessSettledWide =
      session.status === "paused" && !presenting && !busy;
    const recessLifecycleModerator =
      session.status === "paused" && (busy || presenting);
    const lifecycleModeratorShot =
      presenting &&
      activeEvent != null &&
      (activeEvent.stepKey === "pause" ||
        activeEvent.stepKey === "resume" ||
        activeEvent.gavelReason === "pause" ||
        activeEvent.gavelReason === "resume");
    const activeEvidenceItem = debateTableEvidenceItem(
      session.evidence,
      tableEvidenceStickyId,
    );
    const cameraTransition = interruptCameraView
      ? "objection-pan"
      : speakerHandoff
        ? "handoff"
        : debateCameraTransition(effectiveCameraMode, activeEvent);
    const speakerHandoffKeepsWide =
      speakerHandoff?.phase === "wide" || speakerHandoff?.phase === "evidence";
    const cameraView = judgeGavelCameraForced
      ? "moderator"
      : interruptCameraView
        ? interruptCameraView
        : recessSettledWide
        ? "wide"
        : recessLifecycleModerator
          ? "moderator"
          : judgeGavelCeremony?.status === "missed" &&
              judgeGavelMissedCameraView
            ? judgeGavelMissedCameraView
            : juryCameraActive
              ? "jury"
              : speakerHandoffKeepsWide && effectiveCameraMode === "auto"
                ? "wide"
                : introCameraView &&
                    (effectiveCameraMode === "auto" ||
                      effectiveCameraMode === "jury") &&
                    !speakerHandoff
                  ? introCameraView
                  : effectiveCameraMode === "auto" ||
                      effectiveCameraMode === "jury"
                    ? forumPreparingNextTurn
                      ? "wide"
                      : (activeGavelCue && gavelCameraReady) ||
                          lifecycleModeratorShot
                        ? "moderator"
                        : debateAutoCameraView(activeRole)
                    : effectiveCameraMode;
    const evidenceView = debateStageEvidenceViewForCamera(cameraView);
    const participantFloorRailVisible =
      participantOpponentSpeechActive && !judgeGavelKeyboardBlocked;
    const canInterject =
      participantFloorBreakReady &&
      !busy &&
      !debateFloorMutationInFlightRef.current &&
      !judgeGavelKeyboardBlocked;
    const canRaiseParticipantObjection = participantObjectionShortcutEnabled;
    const activePublicContent =
      activeEvent && debateEventIsAtmosphericVocalFoley(activeEvent)
        ? liveReveal?.eventId === activeEvent.id
          ? liveReveal.visibleContent
          : ""
        : activeEvent && liveReveal?.eventId === activeEvent.id
          ? liveReveal.visibleContent
          : (activeEvent?.content ?? "");
    const activeSpeechTiming =
      activeEvent && liveReveal?.eventId === activeEvent.id
        ? (liveReveal.speechTiming ?? null)
        : null;
    const activeTurnClock =
      presenting && activeEvent && speakerHandoff === null
        ? debateTurnClockState(activeEvent, activeSpeechTiming)
        : null;
    const judgeGavelCooldownUntilMs = currentJudgeGavelCooldownUntilMs;
    const judgeGavelCooldownRemainingMs = currentJudgeGavelCooldownRemainingMs;
    const judgeGavelCooldownSeconds = Math.ceil(
      judgeGavelCooldownRemainingMs / 1_000,
    );
    const judgeCanCallTime = judgeCanCallTimeNow;
    const judgeGavelOnCooldown = judgeGavelInterventionOnCooldownNow;
    void pauseCooldownTick;
    const pauseOnCooldown =
      session.status !== "paused" && pauseCooldownUntilMs > Date.now();
    const judgeGavelCooldownLabel =
      judgeGavelOnCooldown && Number.isFinite(judgeGavelCooldownUntilMs) ? (
        <DebateDeadlineCountdown
          deadlineMs={judgeGavelCooldownUntilMs}
          intervalMs={250}
          aria-label="Intervention cooldown seconds remaining"
        />
      ) : null;
    const judgeJuryGavelLocked =
      debateJudgeGavelLockedForJury(session) ||
      activeEvent?.speakerKind === "juror";
    const judgeObjectionAwaitingRuling =
      session.objectionRuling?.status === "awaiting_ruling";
    const judgeGavelCeremonyReady =
      !judgeJuryGavelLocked &&
      !judgeObjectionAwaitingRuling &&
      judgeGavelCeremony?.status === "ready";
    const judgeGavelAvailable =
      session.playerRole === "judge" &&
      session.playerVerdict === null &&
      session.status !== "completed" &&
      session.status !== "failed" &&
      session.status !== "cancelled" &&
      session.status !== "paused" &&
      !judgeJuryGavelLocked &&
      !judgeObjectionAwaitingRuling &&
      session.judgeGavel?.status !== "awaiting_message";
    const judgeUnifiedGavelAction = judgeGavelCeremonyReady
      ? ("cue" as const)
      : judgeGavelInterventionEligibleNow
        ? judgeCanCallTime
          ? ("call-time" as const)
          : ("intervene" as const)
        : ("order" as const);
    const audienceNeedsOrder =
      currentAudiencePressureBand === "restless" ||
      currentAudiencePressureBand === "disruptive";
    const judgeUnifiedGavelLabel =
      judgeUnifiedGavelAction === "cue"
        ? "Slam now"
        : judgeUnifiedGavelAction === "call-time"
          ? "Call time"
          : judgeUnifiedGavelAction === "intervene"
            ? "Intervene"
            : audienceNeedsOrder
              ? "Settle gallery"
              : "Gavel";
    const judgeUnifiedGavelAriaLabel =
      judgeUnifiedGavelAction === "cue"
        ? "Slam the Judge gavel for this ceremonial cue. Space also swings it."
        : judgeUnifiedGavelAction === "call-time"
          ? "Call time on the active speaker and settle the gallery. Space performs the same action."
          : judgeUnifiedGavelAction === "intervene"
            ? "Interrupt the active speaker, settle the gallery, and address the debaters. Space performs the same action."
            : audienceNeedsOrder
              ? "Settle the public gallery without interrupting the speaker. Space performs the same action."
              : "Swing the gavel to settle the room. Space performs the same action.";
    const judgeUnifiedGavelTitle = `${judgeUnifiedGavelLabel} · Space`;
    const activateJudgeUnifiedGavel = (): void => {
      if (judgeUnifiedGavelAction === "cue") {
        strikeJudgeGavelCeremonyRef.current?.();
        return;
      }
      if (
        judgeUnifiedGavelAction === "intervene" ||
        judgeUnifiedGavelAction === "call-time"
      ) {
        void swingJudgeGavel(judgeUnifiedGavelAction === "call-time");
        return;
      }
      void orderDebateAudience();
    };
    const listenerReaction = debateGalleryReaction(activePublicContent);
    const participantOpponentReaction =
      listenerReaction === "attentive" ? "divided" : listenerReaction;
    const participantPlayerSpeaking =
      presenting &&
      activeEvent?.speakerKind === "player" &&
      participantFloorRole !== null;
    const participantCuttingIn =
      participantPlayerSpeaking && activeEvent?.kind === "interjection";
    const participantObjectionAwaitingReason =
      session.playerRole === "participant" &&
      session.status === "waiting_for_player" &&
      session.stepKey === "participant_objection_reason" &&
      session.participantObjection?.status === "awaiting_reason";
    const participantObjecting =
      participantObjectionAwaitingReason ||
      (participantPlayerSpeaking &&
        (activeEvent?.kind === "objection" ||
          activeEvent?.stepKey === "participant_objection_reason"));
    const participantPrismBot = debateParticipantPrismAvatar(
      session,
      playerName,
    );
    const floorLabel =
      activeTurnClock?.status === "overtime"
        ? "Overtime"
        : activeEvent?.kind === "judge_gavel"
          ? activeEvent.gavelReason === "audience_order"
            ? "Order restored"
            : activeEvent.gavelReason === "overtime"
              ? "Time called"
              : activeEvent.gavelReason === "resume"
                ? "Proceeding resumed"
                : "Judge intervention"
          : activeEvent?.kind === "moderator_ruling"
            ? "Moderator ruling"
            : activeEvent?.kind === "testimony"
              ? "Statement entered"
              : activeEvent?.kind === "press"
                ? "Statement pressed"
                : activeEvent?.kind === "objection"
                  ? "Objection"
                  : activeEvent?.stepKey === "participant_objection_reason"
                    ? "Objection stated"
                    : activeEvent?.kind === "evidence"
                      ? "Frozen evidence"
                      : activeEvent?.kind === "revelation"
                        ? "Reversal"
                        : activeEvent?.kind === "interjection"
                          ? "Floor interrupted"
                          : activeEvent?.kind === "reaction"
                            ? activeEvent.stepKey.startsWith(
                                "persona_reaction_",
                              )
                              ? "In-character reaction"
                              : "After the verdict"
                            : activeEvent?.kind === "phase"
                              ? "Moderator transition"
                              : activeEvent?.kind === "ballot"
                                ? "Ballot"
                                : activeEvent?.kind === "jury_deliberation"
                                  ? "Jury chamber"
                                  : activeEvent?.kind === "jury_verdict"
                                    ? "Jury verdict"
                                    : activeEvent
                                      ? "On the floor"
                                      : "Awaiting the floor";
    const forPresentation = debateBotPresentation(
      session,
      session.forAdvocate,
      Number.POSITIVE_INFINITY,
      observerPerspective,
    );
    const againstPresentation = debateBotPresentation(
      session,
      session.againstAdvocate,
      Number.POSITIVE_INFINITY,
      observerPerspective,
    );
    const moderatorPresentation = debateBotPresentation(
      session,
      session.moderator,
      Number.POSITIVE_INFINITY,
      observerPerspective,
    );
    const responseCueSpeakerBotId =
      props.presenceBeat?.surface === "debate" &&
      props.presenceBeat.sessionId === session.id &&
      props.presenceBeat.completion === "playing"
        ? props.presenceBeat.speaker.botId
        : null;
    const thinkingBotId = responseCueSpeakerBotId
      ? null
      : (voicePreparationSpeakerBotId ??
        (participantInputRole && participantPlayerBotId
          ? participantPlayerBotId
          : busy && !presenting && session.status === "live"
            ? debateExpectedBotId(session)
            : null));
    const juryThinkingBotId = pendingJuryThoughtBotId ?? thinkingBotId;
    const juryChamberVisible = cameraView === "jury";
    const participantJurySealed =
      session.jury.enabled &&
      session.playerRole === "participant" &&
      session.jury.phase !== "waiting" &&
      session.jury.phase !== "disabled";
    const turnaboutFloorOwnerBotId =
      session.formatState.format === "turnabout"
        ? session.formatState.floorOwnerBotId
        : null;
    const turnOwnerBotId =
      responseCueSpeakerBotId ??
      (participantInputRole && participantPlayerBotId
        ? participantPlayerBotId
        : presenting && activeSpeakerId
          ? activeSpeakerId
          : (turnaboutFloorOwnerBotId ??
            debateTurnOwnerBotId({
              thinkingBotId,
              presenting,
              presentationSpeakerBotId: activeSpeakerId,
            })));
    const turnOwnerRole: DebateForumRole | null =
      turnOwnerBotId === session.moderator.id
        ? "moderator"
        : turnOwnerBotId === session.forAdvocate.id
          ? "for"
          : turnOwnerBotId === session.againstAdvocate.id
            ? "against"
            : null;
    const stageCast = [
      {
        role: "for" as const,
        bot: session.forAdvocate,
        presentation: forPresentation,
        playerControlled:
          session.playerRole === "participant" &&
          session.playerSideId !== "against",
        roleLabel:
          session.playerRole === "participant" &&
          session.playerSideId !== "against"
            ? `${session.motion.forSide.label} · You`
            : session.motion.forSide.label,
        listenerReaction:
          session.playerRole === "participant" &&
          session.playerSideId !== "against"
            ? null
            : !presenting
              ? null
              : participantFloorRole
                ? participantOpponentReaction
                : activeSpeakerId !== null &&
                    activeSpeakerId !== session.forAdvocate.id
                  ? listenerReaction
                  : null,
      },
      {
        role: "moderator" as const,
        bot: session.moderator,
        presentation: moderatorPresentation,
        playerControlled: false,
        roleLabel:
          session.playerRole === "participant"
            ? debateParticipantModeratorTitle(session.moderatorTitle)
            : normalizeDebateModeratorTitle(session.moderatorTitle),
        listenerReaction: null,
      },
      {
        role: "against" as const,
        bot: session.againstAdvocate,
        presentation: againstPresentation,
        playerControlled:
          session.playerRole === "participant" &&
          session.playerSideId === "against",
        roleLabel:
          session.playerRole === "participant" &&
          session.playerSideId === "against"
            ? `${session.motion.againstSide.label} · You`
            : session.motion.againstSide.label,
        listenerReaction:
          session.playerRole === "participant" &&
          session.playerSideId === "against"
            ? null
            : !presenting
              ? null
              : participantFloorRole
                ? participantOpponentReaction
                : activeSpeakerId !== null &&
                    activeSpeakerId !== session.againstAdvocate.id
                  ? listenerReaction
                  : null,
      },
    ];
    const audienceBots = liveAudienceBots;
    const audienceSeats = audienceBots.map((bot, index) => ({
      bot,
      index,
      layout: debateAudienceSeatLayout(index, audienceBots.length),
    }));
    const audienceBeat = presenting
      ? debateAudienceBeatForEvent({
          event: activeEvent,
          publicContent: activePublicContent,
          seatCount: audienceBots.length,
          maxReactingSeats: debateAudienceMaxReactingSeats(
            debateMaterialQuality,
            "contention",
          ),
        })
      : null;
    const audienceReactingSeatIndices = new Set(
      audienceBeat?.seatIndices ?? [],
    );
    const audiencePressureActive =
      !judgeJuryGavelLocked &&
      !participantJurySealed &&
      debateIdentPlaying === null &&
      (session.status === "live" || session.status === "waiting_for_player");
    const audiencePressureBandTrue: DebateAudiencePressureBand | null =
      audiencePressureActive ? currentAudiencePressureBand : null;
    const audiencePressureBand: DebateAudiencePressureBand | null =
      audiencePressureBandTrue
        ? debateAudienceVisualPressureBand(
            audiencePressureBandTrue,
            debateMaterialQuality,
          )
        : null;
    const audiencePressureTalkerIndices = new Set(
      audiencePressureBand
        ? debateAudienceTalkerIndices({
            band: audiencePressureBand,
            count: audienceBots.length,
            seed: `${session.id}:${audiencePressureBand}`,
          })
        : [],
    );
    const legacyAudienceChattering =
      debateIdentPlaying === null &&
      !presenting &&
      !participantJurySealed &&
      (session.status === "live" || session.status === "waiting_for_player");
    const audienceChattering =
      audiencePressureBand !== null
        ? audiencePressureBand !== "settled"
        : legacyAudienceChattering;
    const activeAudienceOrderResponse =
      audienceOrderResponse?.sessionId === session.id
        ? audienceOrderResponse
        : null;
    const handleDebateAmbientBotVocalization = (
      cue: SessionAmbientBotVocalizationCue,
    ): boolean | "owned" => {
      if (
        !props.audioEnabled ||
        props.audioVolume <= 0 ||
        (session.status !== "live" &&
          session.status !== "waiting_for_player") ||
        presenting ||
        audienceReactingSeatIndices.size > 0 ||
        (busy && !presenting) ||
        participantJurySealed ||
        cue.kind === "mouth-sound" ||
        cue.kind === "lip-smack"
      ) {
        return false;
      }
      const visibleFoleyParticipants = juryChamberVisible
        ? session.jury.jurors.map((juror, index) => {
            const presentation = debateBotPresentation(
              session,
              juror,
              Number.POSITIVE_INFINITY,
              observerPerspective,
            );
            return {
              id: juror.id,
              role:
                index === 0
                  ? ("moderator" as const)
                  : index % 2
                    ? ("for" as const)
                    : ("against" as const),
              active: juror.id === activeSpeakerId,
              thinking: juror.id === thinkingBotId,
              hardMuted:
                bots.find((candidate) => candidate.id === juror.id)
                  ?.hardMuted === true,
              hidden: presentation.visibility === "hidden",
            };
          })
        : stageCast.map(({ role, bot, presentation, playerControlled }) => ({
            id: bot.id,
            role,
            active: bot.id === activeSpeakerId,
            thinking: bot.id === thinkingBotId,
            hardMuted:
              playerControlled ||
              bots.find((candidate) => candidate.id === bot.id)?.hardMuted ===
                true,
            hidden: presentation.visibility === "hidden",
          }));
      const targetId = debateVocalFoleyTargetId({
        sessionId: session.id,
        cueIndex: cue.index,
        kind: cue.kind,
        participants: visibleFoleyParticipants,
      });
      if (!targetId) return false;
      startDebateAmbientBotVocalization(targetId, cue);
      const performance = debateAmbientVocalFoleyVoicePerformance(cue.kind);
      if (!performance || !onUtterance) {
        return true;
      }
      const snapshot = debateBotSnapshot(session, targetId);
      const speaker = snapshot
        ? {
            id: snapshot.id,
            name: snapshot.name,
            color: snapshot.color,
            glyph: snapshot.glyph,
            avatarDetails: snapshot.avatarDetails,
            voiceProfile: snapshot.voiceProfile ?? null,
            powers: snapshot.powers,
            systemPrompt: snapshot.systemPrompt,
            hardMuted: session.powerPlan.bots[snapshot.id]?.hardMuted === true,
          }
        : (bots.find((bot) => bot.id === targetId) ?? null);
      if (!speaker || speaker.hardMuted) {
        return true;
      }
      const sideId =
        targetId === session.forAdvocate.id
          ? ("for" as const)
          : targetId === session.againstAdvocate.id
            ? ("against" as const)
            : null;
      const speakerKind =
        targetId === session.moderator.id
          ? ("moderator" as const)
          : session.jury.jurors.some((juror) => juror.id === targetId)
            ? ("juror" as const)
            : ("advocate" as const);
      const ambientEventId = `debate-ambient-vocal:${session.id}:${cue.index}:${targetId}`;
      void (async () => {
        const played = await onUtterance({
          event: {
            version: DEBATE_SCHEMA_VERSION,
            id: ambientEventId,
            sequence: -1,
            phase: session.phase,
            stepKey: "ambient_vocal_foley",
            kind: "reaction",
            speakerKind,
            speakerBotId: targetId,
            sideId,
            content: performance.spokenText,
            sourceIds: [],
            createdAt: new Date().toISOString(),
          },
          format: session.format,
          sessionId: session.id,
          speaker,
          player: false,
          playerVoice: false,
          spokenText: performance.spokenText,
          voicePerformanceText: performance.voicePerformanceText,
          voiceSourceBotId: null,
        });
        if (!played) {
          debateAtmosphereControllerRef.current?.playFoley(cue.url, {
            trim: Math.max(0, DEBATE_VOCAL_FOLEY_PROFILE.trim),
            tag: `debate-ambient-vocal-fallback:${ambientEventId}`,
          });
        }
      })();
      return "owned";
    };
    const ambientAudioActive = Boolean(
      props.audioEnabled &&
      props.audioVolume > 0 &&
      (presenting ||
        session.status === "live" ||
        session.status === "waiting_for_player"),
    );
    // Keep the gavel bus alive only while a cue is armed — settled recess must
    // not keep the atmosphere layer (and ambient vocalizations) running.
    const gavelAudioActive = Boolean(
      debateGavelAudioEnabled(props.audioVolume) &&
      moderatorPresentation.visibility !== "hidden" &&
      activeGavelCue !== null,
    );
    return (
      <>
        <SessionAtmosphereLayer
          active={Boolean(
            !participantJurySealed && (ambientAudioActive || gavelAudioActive),
          )}
          sessionKey={`debate:${session.id}`}
          volume={props.audioVolume}
          backgroundUrl={ambientAudioActive ? DEBATE_AUDIENCE_MURMUR_URL : null}
          backgroundTone={juryChamberVisible ? "warm-low" : "neutral"}
          grainUrl={
            ambientAudioActive &&
            !juryChamberVisible &&
            audiencePressureBandTrue
              ? DEBATE_AUDIENCE_CROSSTALK_URL
              : null
          }
          mix={
            juryChamberVisible
              ? DEBATE_JURY_CHAMBER_MIX
              : debateIdentPlaying !== null
                ? DEBATE_FOLEY_MIX
                : activeAudienceOrderResponse &&
                    !activeAudienceOrderResponse.returningRoomTone
                  ? DEBATE_FOLEY_MIX
                  : audiencePressureBandTrue
                    ? debateAudiencePressureMix(audiencePressureBandTrue)
                    : presenting
                      ? DEBATE_AUDIENCE_DUCKED_MIX
                      : DEBATE_AUDIENCE_IDLE_MIX
          }
          mixTransitionMs={
            audiencePressureBandTrue === null
              ? 320
              : activeAudienceOrderResponse
                ? activeAudienceOrderResponse.returningRoomTone
                  ? 4_000
                  : 90
                : 900
          }
          preloadFoleyUrls={DEBATE_LIVE_FOLEY_PRELOAD_URLS}
          foleyRoomAcoustics={
            session.format === "turnabout"
              ? DEBATE_TURNABOUT_FOLEY_ROOM_SEND
              : DEBATE_FORUM_FOLEY_ROOM_SEND
          }
          ambientFoley={ambientAudioActive}
          ambientFoleyProfile={
            juryChamberVisible
              ? DEBATE_JURY_AMBIENT_FOLEY_PROFILE
              : DEBATE_AMBIENT_FOLEY_PROFILE
          }
          ambientFoleyUrls={DEBATE_AUDIENCE_FOLEY_URLS}
          deferFoley={debateIdentPlaying !== null || (busy && !presenting)}
          deferBotVocalization={
            debateIdentPlaying !== null ||
            presenting ||
            audienceReactingSeatIndices.size > 0 ||
            (busy && !presenting)
          }
          ambientBotVocalizations={ambientAudioActive}
          ambientBotVocalizationProfile={DEBATE_VOCAL_FOLEY_PROFILE}
          onAmbientBotVocalization={handleDebateAmbientBotVocalization}
          controllerHandleRef={debateAtmosphereControllerRef}
        />
        <main
          className={styles.live}
          data-debate-surface="live"
          data-debate-format={session.format}
          data-theme={props.theme}
          data-session-status={session.status}
          data-session-phase={session.phase}
          data-debate-room-presence={roomPresence}
          data-debate-material-quality={debateMaterialQuality}
          data-jury-chamber={juryChamberVisible ? "true" : undefined}
          style={
            {
              "--debate-active-color": activeColor ?? "#9c8cff",
              "--debate-for-color": session.forAdvocate.color ?? "#42d9ff",
              "--debate-against-color":
                session.againstAdvocate.color ?? "#ff5f8f",
              "--debate-moderator-color": session.moderator.color ?? "#d9d2ff",
            } as CSSProperties
          }
        >
          {debateIdentPlaying ? (
            <DebateIdentOverlay kind={debateIdentPlaying} session={session} />
          ) : null}
          <header className={styles.liveHeader}>
            <button
              type="button"
              className={styles.exitButton}
              onClick={() => void exitLiveSessionToStudio()}
            >
              ← Studio
            </button>
            <div className={styles.liveIdentity}>
              <p className={styles.eyebrow}>
                <span className={styles.liveStateBeacon} aria-hidden="true" />
                {session.format === "turnabout" ? "Turnabout" : "Forum"} ·{" "}
                {phaseLabel(session)} · {session.playerRole}
              </p>
              <h1 data-debate-motion-title="true" title={session.motion.motion}>
                {debateTitleForMotion(session.motion, session.formality)}
              </h1>
              <p
                className={styles.liveMotion}
                data-debate-exact-motion="true"
                title={session.motion.motion}
              >
                {session.motion.motion}
              </p>
            </div>
            <DebateElapsedTimer
              key={session.id}
              accumulatedMs={watchElapsedAccumulatedMs}
              runningSinceMs={watchElapsedRunningSinceMs}
              status={session.status}
            />
          </header>
          <div className={styles.liveWorkspace}>
            <div className={styles.stageColumn}>
              <div className={styles.forum} data-debate-stage-viewport="live">
                {juryChamberVisible ? (
                  renderJuryChamber(session, activeEvent, juryThinkingBotId)
                ) : (
                  <div
                    className={styles.forumCamera}
                    data-camera-view={cameraView}
                    data-camera-mode={effectiveCameraMode}
                    data-camera-transition={cameraTransition}
                    data-active-role={activeRole ?? undefined}
                    style={debateStageAlignmentStyle(stageAlignment)}
                  >
                    <div className={styles.receiverMatte} aria-hidden="true" />
                    <DebateForumLightMasks depth="backdrop" />
                    {stageCast.map(
                      ({
                        role,
                        bot,
                        presentation,
                        playerControlled,
                        listenerReaction: botListenerReaction,
                      }) => {
                        const appearanceBot = playerControlled
                          ? participantPrismBot
                          : (debateBotSnapshot(
                              session,
                              presentation.voiceSourceBotId,
                            ) ?? bot);
                        const talking =
                          responseCueSpeakerBotId === bot.id ||
                          overlapSpeakingBotIds.has(bot.id) ||
                          (presenting &&
                            speakerHandoff === null &&
                            activeSpeakerId === bot.id &&
                            activeEvent?.kind !== "silence" &&
                            activeSpeechTiming !== null);
                        const speechTiming =
                          talking &&
                          liveReveal &&
                          liveReveal.eventId === activeEvent?.id
                            ? (liveReveal.speechTiming ?? null)
                            : null;
                        const foleyMouthShape =
                          !talking &&
                          debateAmbientBotVocalization?.targetId === bot.id
                            ? debateAmbientBotVocalizationMouthShape(bot.id)
                            : null;
                        const vocalFoleyTagText =
                          resolveDebateVocalFoleyTagText({
                            ambientKind:
                              debateAmbientBotVocalization?.targetId === bot.id
                                ? debateAmbientBotVocalization.cue.kind
                                : null,
                            personaReactionContent:
                              presenting &&
                              activeEvent?.kind === "reaction" &&
                              activeEvent.stepKey.startsWith(
                                "persona_reaction_",
                              ) &&
                              activeEvent.speakerBotId === bot.id
                                ? activeEvent.content
                                : null,
                          });
                        return (
                          <div
                            className={styles.botPosition}
                            data-role={role}
                            key={`avatar:${bot.id}`}
                          >
                            <div
                              className={styles.botStagePresence}
                              data-speaking={talking ? "true" : undefined}
                              data-thinking={
                                thinkingBotId === bot.id ? "true" : undefined
                              }
                              data-participant-proxy={
                                playerControlled ? "true" : undefined
                              }
                              data-cut-in={
                                playerControlled && participantCuttingIn
                                  ? "true"
                                  : undefined
                              }
                              data-objecting={
                                playerControlled && participantObjecting
                                  ? "true"
                                  : undefined
                              }
                              data-visibility={presentation.visibility}
                              data-scale={presentation.scale}
                              data-color-cycle={
                                presentation.colorCycle ? "true" : undefined
                              }
                              data-listening-reaction={
                                botListenerReaction ?? undefined
                              }
                              data-vocal-foley={
                                foleyMouthShape ? "true" : undefined
                              }
                              data-debate-stage-compact={
                                role === "moderator" &&
                                cameraView !== "moderator"
                                  ? "true"
                                  : undefined
                              }
                            >
                              {props.renderBotAvatar ? (
                                talking && activeEvent ? (
                                  <DebateActiveAvatarConsumer
                                    store={presentationStore}
                                    sessionId={session.id}
                                    eventId={activeEvent.id}
                                    bot={appearanceBot}
                                    renderBotAvatar={props.renderBotAvatar}
                                    state={{
                                      role,
                                      lookAtRole:
                                        role === "moderator"
                                          ? debateModeratorLookAtRole({
                                              turnOwnerRole,
                                              moderatorTalking: talking,
                                              speechElapsedMs:
                                                speechTiming?.elapsedMs ?? null,
                                            })
                                          : null,
                                      compact:
                                        role === "moderator" &&
                                        cameraView !== "moderator",
                                      talking,
                                      thinking: thinkingBotId === bot.id,
                                      colorCycle: presentation.colorCycle,
                                      foleyMouthShape,
                                      listenerReaction: botListenerReaction,
                                    }}
                                  />
                                ) : (
                                  props.renderBotAvatar(appearanceBot, {
                                    role,
                                    lookAtRole:
                                      role === "moderator"
                                        ? debateModeratorLookAtRole({
                                            turnOwnerRole,
                                            moderatorTalking: talking,
                                            speechElapsedMs:
                                              speechTiming?.elapsedMs ?? null,
                                          })
                                        : null,
                                    compact:
                                      role === "moderator" &&
                                      cameraView !== "moderator",
                                    talking,
                                    thinking: thinkingBotId === bot.id,
                                    colorCycle: presentation.colorCycle,
                                    speechTiming,
                                    foleyMouthShape,
                                    listenerReaction: botListenerReaction,
                                  })
                                )
                              ) : (
                                <span className={styles.botGlyphFallback}>
                                  {props.renderBotGlyph(
                                    playerControlled
                                      ? participantPrismBot.glyph
                                      : presentation.glyph,
                                    {
                                      size: 42,
                                      strokeWidth: 1.35,
                                    },
                                  )}
                                </span>
                              )}
                              {vocalFoleyTagText ? (
                                <span
                                  className={styles.botVocalFoleyTag}
                                  data-debate-vocal-foley-tag="true"
                                  aria-hidden="true"
                                >
                                  *{sentenceCaseActionText(vocalFoleyTagText)}*
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      },
                    )}
                    <div
                      className={styles.podiumForeground}
                      aria-hidden="true"
                    />
                    {activeEvidenceItem ? (
                      <DebateEvidencePedestal
                        key={activeEvidenceItem.value.id}
                        item={activeEvidenceItem}
                        view={evidenceView}
                        audioEnabled={
                          props.audioEnabled &&
                          props.audioVolume > 0 &&
                          session.status !== "paused"
                        }
                        atmosphereControllerRef={debateAtmosphereControllerRef}
                        onOpen={() =>
                          setSourceDrawerId(activeEvidenceItem.value.id)
                        }
                      />
                    ) : null}
                    <DebateForumLightMasks depth="foreground" />
                    <DebateModeratorGavel
                      theme={props.theme}
                      color={session.moderator.color ?? "#d9d2ff"}
                      cue={activeGavelCue}
                      sessionId={session.id}
                      audioEnabled={
                        debateGavelAudioEnabled(props.audioVolume) &&
                        (session.status !== "paused" ||
                          activeGavelCue !== null) &&
                        moderatorPresentation.visibility !== "hidden"
                      }
                      visible={moderatorPresentation.visibility !== "hidden"}
                      atmosphereControllerRef={debateAtmosphereControllerRef}
                    />
                    {stageCast.map(
                      ({ role, bot, presentation, playerControlled }) => (
                        <div
                          className={styles.podiumGlyphPosition}
                          data-role={role}
                          data-participant-proxy={
                            playerControlled ? "true" : undefined
                          }
                          data-turn-active={
                            turnOwnerBotId === bot.id ? "true" : undefined
                          }
                          data-visibility={presentation.visibility}
                          key={`podium-glyph:${bot.id}`}
                          aria-hidden="true"
                        >
                          <span className={styles.podiumGlyphScreen}>
                            <span className={styles.podiumGlyphMark}>
                              {props.renderBotGlyph(
                                playerControlled
                                  ? participantPrismBot.glyph
                                  : presentation.glyph,
                                {
                                  size: 48,
                                  strokeWidth: 1.5,
                                },
                              )}
                            </span>
                          </span>
                        </div>
                      ),
                    )}
                    {stageCast.map(
                      ({
                        role,
                        bot,
                        presentation,
                        playerControlled,
                        roleLabel,
                      }) => (
                        <div
                          className={styles.botIdentityPosition}
                          data-role={role}
                          data-participant-proxy={
                            playerControlled ? "true" : undefined
                          }
                          data-cut-in={
                            playerControlled && participantCuttingIn
                              ? "true"
                              : undefined
                          }
                          data-objecting={
                            playerControlled && participantObjecting
                              ? "true"
                              : undefined
                          }
                          data-speaking={
                            activeSpeakerId === bot.id ? "true" : undefined
                          }
                          data-visibility={presentation.visibility}
                          key={`identity:${bot.id}`}
                        >
                          <div className={styles.botIdentityPlate}>
                            <strong>
                              {playerControlled
                                ? participantPrismBot.name
                                : bot.id === DEBATE_PLAYER_JUDGE_BOT_ID
                                  ? playerName
                                  : presentation.displayName}
                            </strong>
                            <small>{roleLabel}</small>
                            {!playerControlled && presentation.identityLabel ? (
                              <em>{presentation.identityLabel}</em>
                            ) : null}
                            {!playerControlled &&
                            role !== "moderator" &&
                            session.advocacyConsent.some(
                              (check) =>
                                check.botId === bot.id &&
                                check.status === "devils_advocate",
                            ) ? (
                              <b>Devil’s Advocate</b>
                            ) : null}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
                <DebateFocusDepthOverlays
                  cameraTransition={cameraTransition}
                  cameraView={cameraView}
                />
                {liveCaptionsEnabled &&
                presenting &&
                activeEvent &&
                activeEvent.kind !== "silence" &&
                (!juryChamberVisible || activeEvent.speakerKind !== "juror") ? (
                  <DebateLiveCaptionConsumer
                    key={activeEvent.id}
                    store={presentationStore}
                    sessionId={session.id}
                    event={activeEvent}
                    speakerName={visibleEventName(
                      session,
                      activeEvent,
                      playerName,
                    )}
                  />
                ) : null}
                {judgeGavelCeremony && !judgeJuryGavelLocked ? (
                  judgeGavelCeremony.status === "ready" ? (
                    <div
                      className={styles.stageStateOverlay}
                      data-kind="gavel-cue"
                      data-status={judgeGavelCeremony.status}
                      data-debate-judge-gavel-cue="true"
                      role="status"
                      aria-live="polite"
                      style={
                        {
                          "--debate-gavel-cue-window": `${DEBATE_JUDGE_GAVEL_CUE_WINDOW_MS}ms`,
                        } as CSSProperties
                      }
                    >
                      <span aria-hidden="true">Gavel cue</span>
                      <strong>The room is waiting on you.</strong>
                      <small>
                        Slam now. The strike is ceremonial; the proceeding is
                        already set.
                      </small>
                      <button
                        type="button"
                        data-space-shortcut="true"
                        onClick={() => strikeJudgeGavelCeremonyRef.current?.()}
                      >
                        Slam gavel <kbd>Space</kbd>
                      </button>
                    </div>
                  ) : null
                ) : session.jury.enabled &&
                  session.playerRole === "participant" &&
                  session.jury.phase !== "waiting" &&
                  session.jury.phase !== "disabled" &&
                  session.jury.phase !== "complete" ? (
                  <div
                    className={styles.stageStateOverlay}
                    data-kind="jury-sealed"
                    aria-live="polite"
                  >
                    <span aria-hidden="true">◇ ◇ ◇ ◇ ◇</span>
                    <strong>Deliberation sealed</strong>
                    <small>
                      No juror speech, reaction, voice, or individual ballot
                      enters your record.
                    </small>
                  </div>
                ) : session.status === "paused" && !presenting ? (
                  <div
                    className={styles.stageStateOverlay}
                    data-kind={spectatorAwaitingFirstWatch ? "ready" : "paused"}
                  >
                    <span aria-hidden="true">
                      {spectatorAwaitingFirstWatch ? "▶" : "Ⅱ"}
                    </span>
                    <strong>
                      {spectatorAwaitingFirstWatch
                        ? "Gallery ready"
                        : "Debate paused"}
                    </strong>
                    <small>
                      {spectatorAwaitingFirstWatch
                        ? "The proceeding is held until you start, so a long prepare cannot begin while you are away."
                        : "The interrupted line is preserved and will replay from its beginning."}
                    </small>
                    <button
                      type="button"
                      data-action={
                        spectatorAwaitingFirstWatch ? "start" : "resume"
                      }
                      onClick={() => void pauseOrResume()}
                      disabled={busy || debateFloorMutationInFlightRef.current}
                    >
                      {spectatorAwaitingFirstWatch
                        ? "Start Debate"
                        : "Resume Debate"}
                    </button>
                  </div>
                ) : judgeGuidedStep && !presenting && !juryChamberVisible ? (
                  renderJudgeGuidedControls(session, judgeGuidedStep)
                ) : session.status === "waiting_for_player" &&
                  !presenting &&
                  !juryChamberVisible &&
                  session.playerRole !== "participant" ? (
                  <div
                    className={styles.stageStateOverlay}
                    data-kind="player"
                    aria-hidden="true"
                  >
                    <span>◇</span>
                    <strong>
                      {participantObjectionAwaitingReason
                        ? "Your objection holds the floor"
                        : session.judgeGavel?.status === "awaiting_message"
                          ? "The gavel has the room"
                          : "The floor turns to you"}
                    </strong>
                    {participantObjectionAwaitingReason ? (
                      <small>State the point, or withdraw the objection.</small>
                    ) : session.judgeGavel?.status === "awaiting_message" ? (
                      <small>
                        Address the debaters, then the scheduled order resumes.
                      </small>
                    ) : null}
                  </div>
                ) : session.status === "completed" &&
                  !presenting &&
                  !juryChamberVisible ? (
                  <div
                    className={styles.stageStateOverlay}
                    data-kind="verdict"
                    aria-hidden="true"
                  >
                    <span>Verdict</span>
                    <strong>{verdictLabel(session)}</strong>
                    <small>
                      {session.endedEarlyAt
                        ? "The abbreviated proceeding is sealed."
                        : "The proceeding is sealed."}
                    </small>
                  </div>
                ) : session.status === "failed" ||
                  session.status === "cancelled" ? (
                  <div className={styles.stageStateOverlay} data-kind="failed">
                    <span aria-hidden="true">!</span>
                    <strong>Proceeding interrupted</strong>
                    <small>The preserved record remains available.</small>
                  </div>
                ) : null}
                <div
                  className={styles.floorStatus}
                  data-kind={activeEvent?.kind ?? "waiting"}
                  aria-live="polite"
                >
                  <span>{floorLabel}</span>
                  <strong>
                    {activeEvent
                      ? visibleEventName(session, activeEvent, playerName)
                      : session.format === "turnabout"
                        ? "The record"
                        : "The Forum"}
                  </strong>
                </div>
                {presenting && activeEvent ? (
                  <DebateTurnClockConsumer
                    store={presentationStore}
                    sessionId={session.id}
                    event={activeEvent}
                  />
                ) : null}
                <div
                  className={styles.captionControls}
                  aria-label="Debate stage captions"
                >
                  <button
                    type="button"
                    data-debate-captions-toggle="true"
                    data-selected={liveCaptionsEnabled ? "true" : undefined}
                    aria-pressed={liveCaptionsEnabled}
                    aria-label={
                      liveCaptionsEnabled ? "Hide captions" : "Show captions"
                    }
                    title={
                      liveCaptionsEnabled ? "Hide captions" : "Show captions"
                    }
                    onClick={toggleLiveCaptions}
                  >
                    CC
                  </button>
                </div>
                <div
                  className={styles.cameraControls}
                  aria-label={
                    session.playerRole === "judge"
                      ? "Automatic Debate stage camera"
                      : "Debate stage cameras"
                  }
                  aria-disabled={judgeGavelCameraForced}
                  data-locked={judgeGavelCameraForced ? "true" : undefined}
                  data-judge-camera={
                    session.playerRole === "judge" ? "true" : undefined
                  }
                  data-tutorial-target="debate-camera"
                >
                  <span>Camera</span>
                  {DEBATE_CAMERA_VIEWS.filter((camera) =>
                    session.playerRole === "judge"
                      ? camera.id === "auto"
                      : camera.id !== "jury",
                  ).map((camera) => (
                    <button
                      type="button"
                      data-selected={
                        effectiveCameraMode === camera.id ? "true" : undefined
                      }
                      aria-pressed={effectiveCameraMode === camera.id}
                      disabled={judgeGavelCameraForced}
                      title={
                        session.playerRole === "judge"
                          ? "PRISM directs the public floor and Jury automatically"
                          : undefined
                      }
                      onClick={() => selectDebateCameraMode(camera.id)}
                      key={camera.id}
                    >
                      {camera.label}
                    </button>
                  ))}
                  {DEBATE_STAGE_ALIGNMENT_ENABLED ? (
                    <details
                      className={styles.cameraAdvanced}
                      data-locked={judgeGavelCameraForced ? "true" : undefined}
                    >
                      <summary
                        aria-label="More stage controls"
                        title="More stage controls"
                        aria-disabled={judgeGavelCameraForced}
                        onClick={(event) => {
                          if (judgeGavelCameraForced) event.preventDefault();
                        }}
                      >
                        •••
                      </summary>
                      <div>
                        <button
                          type="button"
                          className={styles.alignmentLaunchButton}
                          disabled={judgeGavelCameraForced}
                          onClick={(event) => {
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                            openStageAlignment();
                          }}
                          aria-label="Align stage"
                        >
                          Stage geometry
                        </button>
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>
              <DebateLiveAudienceGallery
                store={presentationStore}
                sessionId={session.id}
                activeEvent={activeEvent}
                presenting={presenting}
                audienceSeats={audienceSeats}
                materialQuality={debateMaterialQuality}
                audienceChattering={audienceChattering}
                audiencePressureBand={audiencePressureBand}
                audiencePressureTalkerIndices={audiencePressureTalkerIndices}
                audiencePressureAttr={audiencePressureBandTrue}
                audiencePressureScore={currentAudiencePressureScore}
                activeAudienceOrderKind={activeAudienceOrderResponse?.kind}
                judgeControl={
                  session.playerRole === "judge" &&
                  (judgeGavelAvailable || judgeGavelCeremonyReady)
                    ? {
                        action: judgeUnifiedGavelAction,
                        available: true,
                        ariaLabel: judgeUnifiedGavelAriaLabel,
                        busy:
                          busy ||
                          audienceOrderSaving ||
                          debateFloorMutationInFlightRef.current,
                        label: judgeUnifiedGavelLabel,
                        onActivate: activateJudgeUnifiedGavel,
                        title: judgeUnifiedGavelTitle,
                      }
                    : null
                }
                renderBotAvatar={props.renderBotAvatar}
                renderBotGlyph={props.renderBotGlyph}
              />
              <div className={styles.stageSupport}>
                {session.format === "turnabout"
                  ? renderTurnaboutRecord(session)
                  : renderCaseBoard(session, activeEvent)}
                {renderGallery(session)}
              </div>
            </div>
            <aside
              className={styles.debateRail}
              data-completed={
                session.status === "completed" && !presenting
                  ? "true"
                  : undefined
              }
              data-player-window-active={
                session.status === "waiting_for_player" && !presenting
                  ? "true"
                  : undefined
              }
            >
              {session.status !== "completed" &&
              session.status !== "failed" &&
              session.status !== "cancelled" ? (
                <section
                  className={styles.proceedingControls}
                  data-role={session.playerRole}
                  data-status={session.status}
                  data-tutorial-target="debate-proceeding-controls"
                  role="group"
                  aria-label={
                    session.playerRole === "judge"
                      ? "Judge proceeding controls"
                      : "Debate proceeding controls"
                  }
                >
                  <header>
                    <div>
                      <p className={styles.eyebrow}>
                        {session.playerRole === "judge"
                          ? "Judge console"
                          : "Proceeding console"}
                      </p>
                      <strong>
                        {spectatorAwaitingFirstWatch
                          ? "Ready when you are"
                          : session.status === "paused"
                            ? "The exact floor is held"
                            : "Room control"}
                      </strong>
                    </div>
                    <span>
                      {spectatorAwaitingFirstWatch
                        ? "Ready"
                        : session.status === "paused"
                          ? "Paused"
                          : phaseLabel(session)}
                    </span>
                  </header>
                  <div className={styles.proceedingControlActions}>
                    {judgeGavelAvailable || judgeGavelCeremonyReady ? (
                      <button
                        type="button"
                        className={styles.judgeGavelButton}
                        data-action={judgeUnifiedGavelAction}
                        data-cue={judgeGavelCeremonyReady ? "true" : undefined}
                        data-overtime={
                          judgeUnifiedGavelAction === "call-time"
                            ? "true"
                            : undefined
                        }
                        data-cooling={judgeGavelOnCooldown ? "true" : undefined}
                        data-pressure={
                          !judgeGavelCeremonyReady
                            ? currentAudiencePressureBand
                            : undefined
                        }
                        data-energized={
                          !judgeGavelCeremonyReady &&
                          (audienceNeedsOrder ||
                            judgeUnifiedGavelAction === "intervene" ||
                            judgeUnifiedGavelAction === "call-time")
                            ? "true"
                            : undefined
                        }
                        data-space-shortcut="true"
                        onClick={(event) => {
                          event.currentTarget.blur();
                          activateJudgeUnifiedGavel();
                        }}
                        disabled={
                          busy ||
                          audienceOrderSaving ||
                          debateFloorMutationInFlightRef.current
                        }
                        aria-label={judgeUnifiedGavelAriaLabel}
                        title={judgeUnifiedGavelTitle}
                      >
                        {judgeUnifiedGavelLabel}
                        <kbd aria-hidden="true">Space</kbd>
                      </button>
                    ) : null}
                    {judgeGavelOnCooldown ? (
                      <span
                        className={styles.judgeGavelCooldownStatus}
                        role="status"
                        aria-label={`Judge intervention cooling down. Ready in ${judgeGavelCooldownSeconds} seconds. The gavel and Space still settle the gallery.`}
                      >
                        <strong>Intervention cooling</strong>
                        {judgeGavelCooldownLabel}
                        <small>Gavel still settles gallery</small>
                      </span>
                    ) : null}
                    <button
                      type="button"
                      data-action={
                        spectatorAwaitingFirstWatch
                          ? "start"
                          : session.status === "paused"
                            ? "resume"
                            : "pause"
                      }
                      data-primary={
                        session.status === "paused" ? "true" : undefined
                      }
                      onClick={() => void pauseOrResume()}
                      disabled={
                        (busy && session.status === "paused") ||
                        pauseInFlightRef.current ||
                        pauseOnCooldown ||
                        participantObjectionAwaitingReason ||
                        (session.status !== "paused" &&
                          session.judgeGavel?.status === "awaiting_message")
                      }
                      aria-label={
                        participantObjectionAwaitingReason
                          ? "State or withdraw your objection before pausing"
                          : pauseOnCooldown
                            ? "Pause cooling down"
                          : spectatorAwaitingFirstWatch
                            ? "Start Debate"
                            : session.status === "paused"
                              ? "Resume Debate"
                              : "Pause Debate"
                      }
                      title={
                        participantObjectionAwaitingReason
                          ? "Resolve your objection first"
                          : pauseOnCooldown
                            ? "Pause is cooling down for a moment"
                          : undefined
                      }
                    >
                      {spectatorAwaitingFirstWatch
                        ? "Start"
                        : session.status === "paused"
                          ? "Resume"
                          : pauseOnCooldown
                            ? "Pause…"
                            : "Pause"}
                    </button>
                    {session.phase !== "verdict" ? (
                      <button
                        type="button"
                        className={styles.endEarlyButton}
                        data-action="end"
                        onClick={() => setEarlyEndOpen(true)}
                        disabled={
                          busy ||
                          participantObjectionAwaitingReason ||
                          session.judgeGavel?.status === "awaiting_message" ||
                          presenting
                        }
                        aria-label={
                          participantObjectionAwaitingReason
                            ? "State or withdraw your objection before ending the Debate"
                            : "End the Debate early"
                        }
                        title={
                          participantObjectionAwaitingReason
                            ? "Resolve your objection first"
                            : undefined
                        }
                      >
                        End debate
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}
              {autoRecoveryNotice ? (
                <p className={styles.autoRecoveryNotice} role="status">
                  {autoRecoveryNotice}
                </p>
              ) : null}
              {session.error ? (
                <div className={styles.turnUnavailable} role="alert">
                  <strong>Turn unavailable</strong>
                  <p>{session.error}</p>
                  <div>
                    <button
                      type="button"
                      onClick={() => void advance(false)}
                      disabled={busy}
                    >
                      Retry
                    </button>
                    {!session.stepKey.startsWith("jury_") &&
                    session.stepKey !== "moderator_to_jury" ? (
                      <button
                        type="button"
                        onClick={() => void advance(true)}
                        disabled={busy}
                      >
                        Skip without dialogue
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {error ? <DebateErrorToast key={error} message={error} /> : null}
              {renderTranscript(session)}
              {renderJuryRecord(session)}
              {session.status === "completed" && !presenting ? (
                <section className={styles.resultCard}>
                  <p className={styles.eyebrow}>Verdict</p>
                  <h2>{verdictLabel(session)}</h2>
                  <p
                    className={styles.debateSynopsis}
                    data-tutorial-target="debate-session-synopsis"
                    data-preparing={
                      synopsisPreparingSessionId === session.id &&
                      !session.synopsis?.text
                        ? "true"
                        : undefined
                    }
                  >
                    {session.synopsis?.text
                      ? session.synopsis.text
                      : synopsisPreparingSessionId === session.id
                        ? "Preparing summary…"
                        : "Summary will appear here when ready."}
                  </p>
                  <p>
                    {session.jury.enabled
                      ? session.playerRole === "participant"
                        ? "The sealed Jury majority is final. Juror identities, individual juror speech, reactions, votes, and reasons are not part of your record; the advocates’ public responses remain visible."
                        : session.playerRole === "judge"
                          ? "Your ruling is final. The named Jury ballots below preserve the chamber’s advice."
                          : "The five-seat Jury majority is final."
                      : session.endedEarlyAt
                        ? session.playerRole === "judge"
                          ? `Your decision from the limited ${debatePublicMaterialName(session.formality).toLowerCase()} is final. The bot ballots below show agreement and dissent.`
                          : `The three-bot majority reached a brief verdict from the limited ${debatePublicMaterialName(session.formality).toLowerCase()}.`
                        : session.playerRole === "judge"
                          ? session.format === "turnabout" &&
                            session.formality === "parliamentary"
                            ? "Your public-record ruling is final. The bot ballots below show agreement and dissent."
                            : "Your decision is final. The bot ballots below show agreement and dissent."
                          : session.format === "turnabout"
                            ? `The three-bot majority resolved the ${debatePublicMaterialName(session.formality).toLowerCase()}.`
                            : "The three-bot majority decided the Duel."}
                  </p>
                  <ul>
                    {session.jury.enabled &&
                    session.playerRole === "participant"
                      ? Array.from({ length: DEBATE_JURY_SIZE }, (_, index) => {
                          const sideId: DebateSideId =
                            index < session.jury.forVotes ? "for" : "against";
                          return (
                            <li
                              className={styles.anonymousJuryBallot}
                              data-side={sideId}
                              key={`anonymous-jury:${index}`}
                            >
                              <strong>Anonymous ballot {index + 1}</strong>
                              <span>
                                {sideId === "for"
                                  ? session.motion.forSide.label
                                  : session.motion.againstSide.label}
                              </span>
                            </li>
                          );
                        })
                      : session.jury.enabled
                        ? session.jury.finalBallots.map((ballot) => {
                            const juror = session.jury.jurors.find(
                              (candidate) => candidate.id === ballot.jurorBotId,
                            );
                            return (
                              <li key={ballot.jurorBotId}>
                                <strong>{juror?.name ?? "Juror"}</strong>
                                <span>
                                  {ballot.sideId === "for"
                                    ? session.motion.forSide.label
                                    : session.motion.againstSide.label}
                                </span>
                                <p>{ballot.reason}</p>
                              </li>
                            );
                          })
                        : session.ballots.map((ballot) => {
                            const voter =
                              ballot.voterBotId === session.moderator.id
                                ? session.moderator
                                : ballot.voterBotId === session.forAdvocate.id
                                  ? session.forAdvocate
                                  : session.againstAdvocate;
                            return (
                              <li key={ballot.voterBotId}>
                                <strong>{voter.name}</strong>
                                <span>
                                  {ballot.sideId === "for"
                                    ? session.motion.forSide.label
                                    : session.motion.againstSide.label}
                                </span>
                                <p>
                                  {ballot.reason ??
                                    "Private ballot — no spoken reason exposed."}
                                </p>
                              </li>
                            );
                          })}
                  </ul>
                  {(() => {
                    const debriefCast = debateDebriefEligibleBots(session);
                    if (debriefCast.length === 0) return null;
                    return (
                      <section
                        className={styles.debriefChat}
                        data-tutorial-target="debate-debrief-chat"
                        aria-label="Ask about their reasoning in this Debate"
                      >
                        <header>
                          <p className={styles.eyebrow}>Inquiry</p>
                          <span>
                            Ask about their reasoning in this Debate —
                            temporary, not saved, positions stay as they were.
                          </span>
                        </header>
                        <div className={styles.debriefCastChips} role="list">
                          {debriefCast.map((bot) => (
                            <button
                              key={bot.id}
                              type="button"
                              role="listitem"
                              className={styles.debriefCastChip}
                              data-selected={
                                debriefTargetBotId === bot.id
                                  ? "true"
                                  : undefined
                              }
                              onClick={() => {
                                setDebriefTargetBotId(bot.id);
                                setDebriefMessages([]);
                                setDebriefDraft("");
                                setDebriefError(null);
                              }}
                            >
                              {bot.name}
                            </button>
                          ))}
                        </div>
                        {debriefTargetBotId ? (
                          <>
                            <ol className={styles.debriefThread}>
                              {debriefMessages.map((message) => (
                                <li key={message.id} data-role={message.role}>
                                  <strong>
                                    {message.role === "user"
                                      ? "You"
                                      : (debriefCast.find(
                                          (bot) =>
                                            bot.id === debriefTargetBotId,
                                        )?.name ?? "Cast")}
                                  </strong>
                                  <p>{message.content}</p>
                                </li>
                              ))}
                            </ol>
                            <form
                              className={styles.debriefComposer}
                              onSubmit={(event) => {
                                event.preventDefault();
                                void sendDebateDebrief();
                              }}
                            >
                              <textarea
                                value={debriefDraft}
                                onChange={(event) =>
                                  setDebriefDraft(event.currentTarget.value)
                                }
                                rows={3}
                                placeholder="Ask how they thought during this Debate…"
                                disabled={debriefBusy}
                                maxLength={2000}
                              />
                              <button
                                type="submit"
                                disabled={
                                  debriefBusy ||
                                  debriefDraft.trim().length === 0
                                }
                              >
                                {debriefBusy ? "Asking…" : "Ask"}
                              </button>
                            </form>
                            {debriefError ? (
                              <p className={styles.error} role="alert">
                                {debriefError}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <p className={styles.debriefHint}>
                            Pick a cast member to inquire into their frozen
                            thought process.
                          </p>
                        )}
                      </section>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => {
                      clearDebateDebrief();
                      setView("dashboard");
                    }}
                  >
                    Return to studio
                  </button>
                </section>
              ) : null}
            </aside>
          </div>
          {participantFloorRailVisible ? (
            <div
              className={styles.liveCommandDeck}
              data-kind="participant-floor"
            >
              <section
                className={styles.participantFloorRail}
                data-ready={
                  canInterject || canRaiseParticipantObjection
                    ? "true"
                    : undefined
                }
                data-tutorial-target="debate-participant-cut-in"
                role="group"
                aria-label="Participant live floor actions"
              >
                <div>
                  <p className={styles.eyebrow}>Opponent has the floor</p>
                  <span className={styles.participantFloorRailHint}>
                    {participantFloorBreakReady
                      ? "Interject conversationally, or raise a formal objection."
                      : "Listen for a complete phrase…"}
                  </span>
                </div>
                <div className={styles.participantFloorActions}>
                  <button
                    type="button"
                    className={styles.participantInterjectButton}
                    aria-expanded={participantInterjectionOpen}
                    onClick={() =>
                      setParticipantInterjectionOpen((current) => !current)
                    }
                    disabled={!canInterject}
                  >
                    Interject…
                  </button>
                  <button
                    type="button"
                    className={styles.participantObjectionButton}
                    aria-keyshortcuts="O"
                    aria-label="Raise an objection. Keyboard shortcut O."
                    title="Immediately stop the opposing floor · O"
                    onClick={() => void raiseParticipantObjection()}
                    disabled={!canRaiseParticipantObjection}
                  >
                    Objection! <kbd aria-hidden="true">O</kbd>
                  </button>
                </div>
              </section>
              {participantInterjectionOpen && canInterject ? (
                <form
                  className={styles.interjectionBar}
                  onSubmit={submitInterjection}
                  data-tutorial-target="debate-interject"
                >
                  <div>
                    <p className={styles.eyebrow}>Conversational cut-in</p>
                    <span>The moderator will restore the scheduled floor.</span>
                  </div>
                  <textarea
                    ref={participantInterjectionDraftRef}
                    value={interjectionDraft}
                    onChange={(event) =>
                      setInterjectionDraft(event.currentTarget.value)
                    }
                    maxLength={600}
                    rows={2}
                    aria-label="Write a live interjection"
                    placeholder="Add a direct challenge or response…"
                  />
                  <button
                    type="submit"
                    disabled={
                      busy || !canInterject || !interjectionDraft.trim()
                    }
                  >
                    Interject now
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
          {session.status === "waiting_for_player" &&
          !presenting &&
          judgeGuidedStep === null ? (
            <div className={styles.liveCommandDeck} data-kind="player">
              {renderPlayerWindow(session)}
            </div>
          ) : null}
          {selectedEvidence ? (
            <DebateEvidenceDrawer
              item={selectedEvidence}
              closeButtonRef={sourceDrawerCloseButtonRef}
              onClose={() => setSourceDrawerId(null)}
            />
          ) : null}
          {earlyEndOpen ? (
            <div
              className={styles.confirmBackdrop}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !busy) {
                  setEarlyEndOpen(false);
                }
              }}
            >
              <section
                className={styles.confirmDialog}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="debate-end-early-title"
                aria-describedby="debate-end-early-description"
              >
                <p className={styles.eyebrow}>
                  {session.judgeGavel?.status === "awaiting_message"
                    ? "Final authority"
                    : "Accelerated verdict"}
                </p>
                <h2 id="debate-end-early-title">
                  {session.judgeGavel?.status === "awaiting_message"
                    ? "End this Debate?"
                    : "End this Debate early?"}
                </h2>
                <p id="debate-end-early-description">
                  {session.jury.enabled
                    ? `The remaining rounds will be skipped. The Jury will hold a shorter three-turn deliberation from only the limited ${debatePublicMaterialName(session.formality).toLowerCase()} and will not penalize unheard rounds.`
                    : session.playerRole === "judge"
                      ? `The remaining rounds will be skipped. You will decide immediately from only the limited ${debatePublicMaterialName(session.formality).toLowerCase()} so far.`
                      : `The remaining rounds will be skipped. The three-bot panel will cast brief ballots from only the limited ${debatePublicMaterialName(session.formality).toLowerCase()} so far.`}
                </p>
                <div>
                  <button
                    type="button"
                    onClick={() => setEarlyEndOpen(false)}
                    disabled={busy}
                  >
                    Continue Debate
                  </button>
                  <button
                    ref={earlyEndConfirmButtonRef}
                    type="button"
                    className={styles.confirmEarlyEndButton}
                    onClick={() => void endDebateEarly()}
                    disabled={busy || presenting}
                  >
                    {busy ? "Concluding…" : "Conclude now"}
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </main>
        {judgeComposerOpen &&
        (judgeGuidedStep === "gavel" || judgeGuidedStep === "question") ? (
          props.renderJudgeComposer ? (
            props.renderJudgeComposer({
              kind: judgeGuidedStep,
              value:
                judgeGuidedStep === "gavel" ? judgeGavelDraft : playerDraft,
              placeholder:
                judgeGuidedStep === "gavel"
                  ? "Address both advocates…"
                  : `Ask the ${
                      judgeTarget === "for"
                        ? session.motion.forSide.label
                        : session.motion.againstSide.label
                    } side…`,
              maxLength:
                judgeGuidedStep === "gavel"
                  ? DEBATE_JUDGE_GAVEL_MESSAGE_MAX_LENGTH
                  : DEBATE_PLAYER_TURN_MAX_LENGTH,
              disabled: busy,
              generating: judgeComposerGenerating,
              onValueChange:
                judgeGuidedStep === "gavel"
                  ? setJudgeGavelDraft
                  : setPlayerDraft,
              onGenerate: () => void generateJudgeComposerDraft(),
              onSubmit: (value) =>
                void submitJudgeComposerDraft(judgeGuidedStep, value),
              onBack: () => setJudgeComposerOpen(false),
            })
          ) : (
            <form
              className={styles.judgeComposerFallback}
              data-tutorial-target="debate-judge-composer"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  (judgeGuidedStep === "gavel"
                    ? judgeGavelDraft
                    : playerDraft
                  ).trim()
                ) {
                  void submitJudgeComposerDraft(judgeGuidedStep);
                } else {
                  void generateJudgeComposerDraft();
                }
              }}
            >
              <button
                type="button"
                onClick={() => setJudgeComposerOpen(false)}
                disabled={busy || judgeComposerGenerating}
              >
                Back
              </button>
              <textarea
                value={
                  judgeGuidedStep === "gavel" ? judgeGavelDraft : playerDraft
                }
                onChange={(event) =>
                  (judgeGuidedStep === "gavel"
                    ? setJudgeGavelDraft
                    : setPlayerDraft)(event.currentTarget.value)
                }
                maxLength={
                  judgeGuidedStep === "gavel"
                    ? DEBATE_JUDGE_GAVEL_MESSAGE_MAX_LENGTH
                    : DEBATE_PLAYER_TURN_MAX_LENGTH
                }
                placeholder="Write a custom Judge response…"
                autoFocus
                disabled={busy || judgeComposerGenerating}
              />
              <button type="submit" disabled={busy || judgeComposerGenerating}>
                {(judgeGuidedStep === "gavel"
                  ? judgeGavelDraft
                  : playerDraft
                ).trim()
                  ? "Send"
                  : "Draft for me"}
              </button>
            </form>
          )
        ) : null}
        {renderStageAlignmentModal(session)}
      </>
    );
  };

  const experience =
    view === "live"
      ? renderLive()
      : view === "baking"
        ? (
            <>
              {renderLobby()}
              <PrismBlockingLoader
                open
                title={liveBakeSurfaceTitle("debate")}
                detail="The gallery is being prepared ahead of time so watching stays seamless."
                stepLabel={liveBakeStatusCopy(spectatorBake)}
                progress={null}
              />
            </>
          )
        : renderLobby();
  const synthesizingExhibitTitle = evidenceObjectDraft
    ? debateEvidenceExhibitTitle(evidenceObjectDraft)
    : "";
  return (
    <>
      {experience}
      <PrismBlockingLoader
        open={evidenceObjectVisualBusy === "synthesize"}
        title={
          synthesizingExhibitTitle
            ? `Synthesizing ${synthesizingExhibitTitle}`
            : "Synthesizing exhibit artwork"
        }
        detail="Prism is generating a Debate-only transparent stage sprite from your object description."
        stepLabel="Generating and cutting out the exhibit"
        progress={null}
        theme={props.theme}
        footer="The exhibit text and emoji fallback remain unchanged while the sprite takes shape."
      />
    </>
  );
}
