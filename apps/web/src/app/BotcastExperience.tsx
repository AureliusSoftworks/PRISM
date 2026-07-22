"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BOTCAST_DEFAULT_STUDIO_FILM_GRAIN,
  BOTCAST_DEFAULT_STUDIO_LAYOUT,
  BOTCAST_PRODUCER_GUEST_ID,
  BOTCAST_PRODUCER_GUEST_NAME,
  BOTCAST_PRODUCER_GUEST_THINKING_TIME_SCALE,
  BOTCAST_SESSION_DURATION_MINUTES_MAX,
  BOTCAST_SESSION_DURATION_MINUTES_MIN,
  BOTCAST_STUDIO_FILM_GRAIN_MAX,
  BOTCAST_VOICE_LEVEL_MAX,
  BOTCAST_VOICE_LEVEL_STEP,
  BOT_IDENTITY_MIRROR_TRANSITION_MS,
  REPLAY_VIDEO_HEIGHT,
  REPLAY_VIDEO_WIDTH,
  botPowerAvatarScaleModeV1,
  botPowerAvatarVisibilityModeV1,
  botPowerIsMutedV1,
  botPowerResponseIsSilentV1,
  botPowerVoiceGainMultiplierV1,
  botPowerVoicePresenceModeV1,
  DEFAULT_COFFEE_SESSION_DURATION_MINUTES,
  botcastCameraOffsetXPercent,
  botcastCameraOffsetYPercent,
  botcastCameraModeAt,
  botcastCameraShotAt,
  botcastDepartureSpeakerRole,
  botcastHostInterruptionLineAt,
  appendBotCrosstalkInterruptedSpeakerCue,
  botCrosstalkInterruptedSpeakerCueForSeed,
  botCrosstalkPrimarySpeakerContent,
  botcastIdentityMirrorStateBeforeMessageV1,
  botcastIdentityMirrorStatesAtV1,
  botcastInterruptionBridgeMessageId,
  botcastInterruptedGuestContent,
  botcastListenerReactionForMessage,
  botcastMessageIsAudibleToAudienceV1,
  botcastNextSpeakerRole,
  botcastProducerGuestThinkingDiscountMs,
  botcastPerceptionOverlapEventsV1,
  botcastReplayMessageIndexAt,
  botcastReplayTimeline,
  botcastSignalStandardCadenceDurationMs,
  botcastStrongestNegativeSocialInfluenceAt,
  botcastSnapshotPowersForRoleV1,
  botcastVoiceLevelForBot,
  botIdentityMirrorTransitionActiveV1,
  buildSignalMusicProfile,
  normalizeAccentForTheme,
  normalizeBotcastStudioAtmosphereMix,
  normalizeBotcastStudioLayout,
  normalizeBotcastVoiceLevel,
  normalizeBotcastVoiceLevelsByBotId,
  swapBotcastStudioLayoutSeats,
  listenerReactionActionLabel,
  listenerReactionHasCrosstalkAudio,
  resolveListenerReactionAtMs,
  type BotcastCameraShot,
  type BotcastEpisode,
  type BotcastEpisodeAdvanceResponse,
  type BotcastEpisodeResponseMode,
  type BotcastEpisodeSummary,
  type BotcastHostRedirectContext,
  type BotcastGuestInterruptionContext,
  type BotcastMessage,
  type BotcastProducerCue,
  type BotcastProducerCueDelivery,
  type BotcastSoundboardCueKind,
  type BotcastShow,
  type BotcastShowHostChatMessage,
  type BotcastShowHostChatResponse,
  type BotcastSessionDurationMinutes,
  type BotcastStudioAtmosphereMix,
  type BotcastStudioLayout,
  type BotcastStudioLayoutItem,
  type BotcastVoiceLevelsByBotId,
  type BotIdentityMirrorStateV1,
  type BotPowerAvatarScaleMode,
  type BotPowerAvatarVisibilityModeV1,
  type BotPowerV1,
  type BotPowerVoicePresenceMode,
  type ListenerReactionPlanV1,
  type ReplayRecordingV1,
  type ReplayTimelineV1,
  type SignalPersonaTemperament,
  type VoiceMode,
} from "@localai/shared";
import { PRISM_APP_VERSION } from "../prismAppVersion";
import { INTERRUPTED_SPEAKER_RETORT_PAUSE_MS } from "./listenerReactionVoice";
import { Dices, LoaderCircle } from "lucide-react";
import { Copy, Play, Radio, Trash2 } from "lucide-react";
import {
  buildCoffeeCupVisualState,
  coffeeCupSipAnimationTiming,
  type CoffeeCupVisualState,
} from "./coffee-cup-sprites";
import { nextBotcastShowIdAfterDeletion } from "./botcastDeletion";
import {
  botcastSpeechRevealIsVoicing,
  botcastSpeechRevealVisibleText,
  finishBotcastSpeechReveal,
  prepareBotcastSpeechReveal,
  startBotcastSpeechReveal,
  updateBotcastSpeechReveal,
  type BotcastSpeechRevealState,
} from "./botcastSpeechReveal";
import { PrismBlockingLoader } from "./PrismBlockingLoader";
import { usePrismMenu, type PrismMenuEntry } from "./PrismMenu";
import { SessionAtmosphereLayer } from "./SessionAtmosphereLayer";
import { useAmbientBotVocalization } from "./ambient-bot-vocalization";
import {
  SIGNAL_SOUNDBOARD_CUES,
  playSignalSoundboardCue,
  signalSoundboardEventsBetween,
  signalSoundboardNextVariantIndex,
  stopSignalSoundboardAudio,
} from "./signalSoundboard";
import { SIGNAL_STUDIO_FOLEY_ROOM_SEND } from "./roomAcoustics";
import {
  DEFAULT_SIGNAL_ATMOSPHERE_MIX,
  SIGNAL_SESSION_AMBIENT_BOT_VOCALIZATION_PROFILE,
  SIGNAL_ATMOSPHERE_RELATIVE_MIX_MAX,
  SIGNAL_ATMOSPHERE_RELATIVE_MIX_STEP,
  sessionAmbientBotVocalizationTargetId,
  sessionAtmosphereBusVolume,
  signalAtmosphereMixLevelFromRelative,
  signalAtmosphereRelativeMixLevel,
  signalSessionAtmosphereActive,
  type SessionAmbientBotVocalizationCue,
  type SessionAtmosphereController,
} from "./session-atmosphere-audio";
import {
  SIGNAL_ARTWORK_JOB_EVENT,
  announceSignalArtworkJob,
  signalArtworkJobCompletionNotice,
  signalArtworkJobIsActive,
  type SignalArtworkJobSnapshot,
} from "./signalArtworkJob";
import { signalShowMagicManifest } from "./signalShowIdentity";
import {
  SIGNAL_EPISODE_INTRO_LEAD_IN_MS,
  playSignalIntroAudio,
  playSignalOutdentAudio,
  stopSignalIntroAudio,
} from "./signalIntroAudio";
import { signalAvatarSfxShouldPlay } from "./signalAvatarSfx";
import { randomSignalEpisodeGuestId } from "./signalBookingRandomizer";
import {
  signalEpisodeArchiveActionLabel,
  signalReplayRecordingHasVideo,
} from "./signalReplayVideoGate";
import {
  SIGNAL_HOST_CUE_REDIRECT_LATEST_PROGRESS,
  signalHostCueShouldRedirect,
} from "./signalHostCueTiming";
import { signalLiveCaptionText } from "./signalLiveCaptions";
import {
  ReplayRecordingPanel,
  ReplayRecordingStatusBadge,
} from "./ReplayRecordingPanel";
import {
  buildSignalReplayManifestV1,
  type SignalReplayBotVisualSnapshotV1,
} from "./replayManifest";
import {
  queueReplayManifest,
  replayRecordingForSource,
  retryReplayRecording,
} from "./replayClient";
import {
  REPLAY_RECORDING_CHANGED_EVENT,
  ReplayRenderCoordinator,
  type ReplayFrameRenderer,
} from "./ReplayRenderCoordinator";
import {
  signalReplayVideoFrameState,
  type SignalReplayVideoFrameState,
} from "./signalReplayVideoFrame";
import {
  readSignalCameraTransitionMode,
  signalLiveAutoCameraShot,
  writeSignalCameraTransitionMode,
  type SignalCameraTransitionMode,
  type SignalDirectedCameraShot,
} from "./signalCameraTransition";
import { signalEpisodeRetryDraft } from "./signalEpisodeRetry";
import {
  ModelWarmupIntermission,
  type ModelWarmupIntermissionPhase,
} from "./ModelWarmupIntermission";
import { waitForModelPreparation } from "./modelPreparation";
import {
  formatSignalAudienceViews,
  signalAudienceReviews,
  signalNextAudienceReviewRefreshDelayMs,
  signalAudienceSnapshot,
} from "./signalAudiencePulse";
import {
  signalCupShadowProfileForTravel,
  signalCupSipFaceReleaseMs,
  signalCupSipTargetFromMouth,
  signalStageLocalPointFromViewport,
} from "./signalCupSipGeometry";
import { buildSignalReviewTranscript } from "./signalReviewTranscript";
import {
  signalVoicePerformanceActionPresentationAtProgress,
  signalVoicePerformanceTranscriptText,
} from "./signalVoicePerformance";
import { signalShowCardBlurbs } from "./signalShowCardQuips";
import { signalStageSoundcheckMessages } from "./signalStageSoundcheck";
import { shouldSubmitComposerOnEnter } from "./composerKeyPolicy";
import {
  signalStudioOverscanCoordinate,
  signalStudioPlacementStyle,
  signalStudioVoicePan,
} from "./signalStudioPlacement";
import {
  buildWebDiagnosticReport,
  writeDiagnosticClipboard,
} from "./webDiagnostics";
import type {
  VoicePlaybackCharacterAlignment,
  VoicePlaybackLifecycle,
} from "./voiceEffects";
import {
  BOTTISH_MOUTH_PHASE_MS,
  bottishMouthShapeAtAlignedElapsedMs,
  crtSpeechMouthShapeAtAlignedElapsedMs,
  crtSpeechMouthShapeAtElapsedMs,
  type ZenLiveBotMouthShape,
} from "./zenLiveMouth";
import {
  resolveCurrentZenActionCue,
  resolveZenActionPresentation,
} from "./zenActions";
import styles from "./botcast.module.css";

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
  personaTemperament: SignalPersonaTemperament;
  replayVisualSnapshot?: SignalReplayBotVisualSnapshotV1 | null;
  replayPowers?: BotPowerV1[] | null;
  producerGuest?: boolean;
  /** Persisted public face/voice source only; mechanical role and bot identity stay unchanged. */
  identityMirrorState?: BotIdentityMirrorStateV1 | null;
  identityMirrorTransitionActive?: boolean;
  identityMirrorTargetFaceActive?: boolean;
}

interface SignalReplayRenderCaptureState {
  recording: ReplayRecordingV1;
  timeline: ReplayTimelineV1;
  frame: SignalReplayVideoFrameState;
}

interface SignalReplayRenderTarget {
  episode: BotcastEpisode;
  show: BotcastShow;
}

function signalReplayParticipantBot(
  recording: ReplayRecordingV1,
  role: "host" | "guest",
  fallback: BotcastBotSummary | null,
): BotcastBotSummary | null {
  const participant = recording.manifest?.participants.find(
    (candidate) => candidate.role === role,
  );
  if (!participant) return fallback;
  const powers = Array.isArray(participant.metadata?.powers)
    ? (participant.metadata.powers as BotPowerV1[])
    : (fallback?.replayPowers ?? null);
  const rawVisual = participant.metadata?.visualSnapshot;
  const visualSnapshot =
    rawVisual &&
    typeof rawVisual === "object" &&
    "v" in rawVisual &&
    rawVisual.v === 1
      ? (rawVisual as SignalReplayBotVisualSnapshotV1)
      : (fallback?.replayVisualSnapshot ?? null);
  return {
    ...(fallback ?? {
      online_enabled: recording.manifest?.privacyMode === "local" ? 0 : 1,
      personaTemperament: "neutral" as const,
    }),
    id: participant.id,
    name: participant.name,
    color: participant.color,
    glyph: participant.glyph,
    muted: powers ? botPowerIsMutedV1(powers) : fallback?.muted,
    voiceGainMultiplier: powers
      ? botPowerVoiceGainMultiplierV1(powers)
      : fallback?.voiceGainMultiplier,
    voicePresence: powers
      ? botPowerVoicePresenceModeV1(powers)
      : fallback?.voicePresence,
    replayPowers: powers,
    replayVisualSnapshot: visualSnapshot,
    producerGuest: participant.kind === "player" || fallback?.producerGuest,
  };
}

function botWithIdentityBeforeMessage(
  bot: BotcastBotSummary,
  currentEpisode: BotcastEpisode,
  message: BotcastMessage,
): BotcastBotSummary {
  return {
    ...bot,
    identityMirrorState: botcastIdentityMirrorStateBeforeMessageV1(
      currentEpisode,
      bot.id,
      message.id,
    ),
    identityMirrorTransitionActive: false,
    identityMirrorTargetFaceActive: true,
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
  onSubmit: () => void;
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
  provider: "local" | "openai" | "anthropic";
}

export interface BotcastApiRequest {
  <T>(path: string, options?: RequestInit): Promise<T>;
}

const SIGNAL_NATURAL_HANDOFF_MS = 40;
const SIGNAL_NOTICE_TOAST_MS = 7_000;
const SIGNAL_EPISODE_PRE_ROLL_MIN_MS = 4_200;
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
// ElevenLabs alignment responses are buffered before playback begins and can
// legitimately take several seconds for a full Signal line. Keep a bounded
// escape hatch for a genuinely stuck voice request without aborting healthy
// provider speech before it reaches the studio.
const SIGNAL_VOICE_START_TIMEOUT_MS = 30_000;
// Once playback starts, a missing provider completion signal must not strand
// the episode in a busy state and block the next on-air turn indefinitely.
const SIGNAL_VOICE_COMPLETION_GRACE_MS = 4_000;

function signalInterruptedSpeakerRetortDelayMs(
  plan: ListenerReactionPlanV1,
  elapsedMs: number,
  durationMs: number,
): number {
  if (
    !plan.interruptedSpeakerCue ||
    plan.interruptedSpeakerCuePlayback !== "crosstalk"
  ) {
    return INTERRUPTED_SPEAKER_RETORT_PAUSE_MS;
  }
  return (
    Math.max(0, durationMs - elapsedMs) +
    INTERRUPTED_SPEAKER_RETORT_PAUSE_MS
  );
}
const SIGNAL_OPENING_ADVANCE_ATTEMPTS = 2;
const SIGNAL_SHOW_CARD_QUIP_INITIAL_DELAY_MS = 4_800;
const SIGNAL_SHOW_CARD_QUIP_VISIBLE_MS = 5_600;
const SIGNAL_SHOW_CARD_QUIP_GAP_MS = 14_000;
const SIGNAL_HOST_CHAT_CONTEXT_LIMIT = 3;
const SIGNAL_HOST_CHAT_STREAM_CHUNK_MS = 34;

function signalHostChatStreamChunks(content: string): string[] {
  return content.match(/\S+\s*/gu) ?? (content ? [content] : []);
}

function signalHostChatDisplayMarkdown(content: string): string {
  const presentation = resolveZenActionPresentation(content);
  if (!presentation.hasActions) return content;
  let markdown = content;
  for (const cue of presentation.cues) {
    const escapedAction = cue.action.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const markedAction = new RegExp(
      `(?:\\*{1,3}\\s*${escapedAction}\\s*\\*{1,3}|\\(\\s*${escapedAction}\\s*\\))`,
      "u",
    );
    if (!markedAction.test(markdown)) return presentation.mainText;
    markdown = markdown.replace(markedAction, " ");
  }
  return markdown
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export interface BotcastUtterancePlaybackOptions {
  channel: "primary" | "crosstalk";
  mixGain: number;
  /** Ephemeral speech is never captured as a replay take or resolved as a saved Signal row. */
  ephemeral?: boolean;
  /** Allows an ephemeral voice to leave the local network only when its chat lane is ONLINE. */
  explicitOnlineContext?: boolean;
}

type PreparedBotcastAdvanceResult =
  | { ok: true; response: BotcastEpisodeAdvanceResponse }
  | { ok: false; error: unknown };

type PreparedBotcastAdvance = {
  episodeId: string;
  afterMessageId: string;
  controller: AbortController;
  result: Promise<PreparedBotcastAdvanceResult>;
  settled: boolean;
  warming: boolean;
  warmupModel: string | null;
  warmupStartedAt: string | null;
  warmupFailure: import("@localai/shared").ModelPreparationFailure | null;
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
  request: BotcastApiRequest;
  preferredProvider: "local" | "openai" | "anthropic";
  hostChatProvider: "local" | "openai" | "anthropic";
  preferredImageProvider: "local" | "openai";
  modelOptions: BotcastModelOption[];
  accountDefaultModel: string | null;
  responseMode: BotcastEpisodeResponseMode;
  voiceMode: VoiceMode;
  theme?: "light" | "dark";
  renderAvatar?: (
    bot: BotcastBotSummary,
    state: {
      talking: boolean;
      thinking: boolean;
      sipping: boolean;
      role: "host" | "guest";
      surface: "dashboard" | "stage" | "alignment";
      sfxEnabled: boolean;
      sfxMixGain?: number;
      facing?: "left" | "right";
      theme?: "light" | "dark";
      mouthShape: ZenLiveBotMouthShape;
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
  onUtterance?: (
    message: BotcastMessage,
    bot: BotcastBotSummary,
    lifecycle: VoicePlaybackLifecycle,
    voiceLevel: number,
    stereoPan: number,
    playback?: BotcastUtterancePlaybackOptions,
  ) => boolean | Promise<boolean>;
  onPrefetchUtterance?: (
    message: BotcastMessage,
    bot: BotcastBotSummary,
  ) => void;
  onPrefetchListenerReaction?: (
    plan: ListenerReactionPlanV1,
    bot: BotcastBotSummary,
  ) => void;
  onListenerReaction?: (
    plan: ListenerReactionPlanV1,
    bot: BotcastBotSummary,
    stereoPan: number,
    retortDelayMs?: number,
    replaySourceId?: string,
  ) => boolean | Promise<boolean>;
  onPrepareUtterance?: () => void;
  onStopUtterance?: () => void;
  onProducerGuestActionSfx?: (message: BotcastMessage) => void;
  introAudioEnabled?: boolean;
  introAudioVolume?: number;
  sidebarHeader: ReactNode;
  navigationHeader:
    | ReactNode
    | ((state: {
        liveSessionActive: boolean;
        episodeModelControl: {
          value: string;
          onChange: (value: string) => void;
          disabled: boolean;
          disabledReason?: string;
        };
      }) => ReactNode);
  producerName?: string;
  renderProducerGuestComposer?: (
    state: BotcastProducerGuestComposerState,
  ) => ReactNode;
}

type BotcastLiveSpeech = {
  messageId: string;
  reveal: BotcastSpeechRevealState;
};

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
  showName: string;
  phase: "curtain" | "holding" | "complete";
  forced: boolean;
};

type SignalPendingCutRequest = {
  episodeId: string;
  waitForOutro: boolean;
  promise: Promise<boolean>;
  resolve: (completed: boolean) => void;
};

const SIGNAL_EPISODE_OUTRO_DEAD_AIR_MS = 2_000;
const SIGNAL_LIVE_CAMERA_POST_SPEECH_HOLD_MS = 900;

type SignalReviewCopyState = {
  episodeId: string;
  phase: "copying" | "copied" | "failed";
};

type SignalBookingSuggestionField = "topic" | "producerBrief";
type SignalBookingSuggestionOperation =
  | SignalBookingSuggestionField
  | "booking"
  | "launch";

type SignalBotEpisodeStartDraft = {
  guestId: string;
  topic: string;
  producerBrief: string;
};

type SignalAssetSlot =
  | "day-studio"
  | "night-studio"
  | "logo";
type SignalArtworkKind = SignalAssetSlot;
type SignalStudioGlowBlendMode = "screen" | "overlay";
type SignalStudioGlowThemeTuning = {
  opacity: number;
  blendMode: SignalStudioGlowBlendMode;
};
type SignalStudioGlowTuning = Record<
  "light" | "dark",
  SignalStudioGlowThemeTuning
>;

const SIGNAL_ASSET_ACCEPT = "image/png,image/jpeg,image/webp";
const SIGNAL_ASSET_UPLOAD_MAX_BYTES = 16 * 1024 * 1024;
const SIGNAL_STUDIO_GLOW_TUNING_DEFAULTS: SignalStudioGlowTuning = {
  dark: { opacity: 0.62, blendMode: "screen" },
  light: { opacity: 0.44, blendMode: "overlay" },
};

function defaultSignalStudioGlowTuning(): SignalStudioGlowTuning {
  return {
    dark: { ...SIGNAL_STUDIO_GLOW_TUNING_DEFAULTS.dark },
    light: { ...SIGNAL_STUDIO_GLOW_TUNING_DEFAULTS.light },
  };
}

const SIGNAL_STUDIO_LAYOUT_LABELS: Record<BotcastStudioLayoutItem, string> = {
  hostBot: "host bot",
  guestBot: "guest bot",
  hostCup: "host cup",
  guestCup: "guest cup",
};

function signalStudioFacingForRole(
  layout: BotcastStudioLayout,
  role: "host" | "guest",
): "left" | "right" {
  const ownX = layout[role === "host" ? "hostBot" : "guestBot"].x;
  const otherX = layout[role === "host" ? "guestBot" : "hostBot"].x;
  if (ownX === otherX) return role === "host" ? "right" : "left";
  return ownX < otherX ? "right" : "left";
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

const SIGNAL_ASSET_LABELS: Record<SignalAssetSlot, string> = {
  "day-studio": "Light studio",
  "night-studio": "Dark studio",
  logo: "logo",
};

type SignalBlockingOperation = {
  title: string;
  detail: string;
  stepLabel: string;
  progress: number | null;
  cancellable: boolean;
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

type SignalCupTravelState = {
  mode: "idle" | "sipping" | "returning";
  returnX: number | null;
  returnY: number | null;
  sipFaceActive: boolean;
};

type SignalCupTravelByRole = Record<"host" | "guest", SignalCupTravelState>;

function initialSignalCupTravelByRole(): SignalCupTravelByRole {
  return {
    host: {
      mode: "idle",
      returnX: null,
      returnY: null,
      sipFaceActive: false,
    },
    guest: {
      mode: "idle",
      returnX: null,
      returnY: null,
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
    | "guestKind"
    | "events"
  >,
  nowMs: number,
  activeThinkingStartedAtMs: number | null = null,
  activeThinkingEndedAtMs: number | null = null,
): number {
  if (episode.runtimeMs !== null) return Math.max(0, episode.runtimeMs);
  const startedAtMs = Date.parse(episode.startedAt);
  if (!Number.isFinite(startedAtMs)) return 0;
  const completedAtMs = episode.completedAt
    ? Date.parse(episode.completedAt)
    : Number.NaN;
  const endMs = Number.isFinite(completedAtMs) ? completedAtMs : nowMs;
  const activeWarmupStartedAtMs = episode.modelWarmupHoldStartedAt
    ? Date.parse(episode.modelWarmupHoldStartedAt)
    : Number.NaN;
  const activeWarmupMs =
    episode.status === "live" && Number.isFinite(activeWarmupStartedAtMs)
      ? Math.max(0, nowMs - activeWarmupStartedAtMs)
      : 0;
  const activeThinkingWallMs =
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
    activeThinkingWallMs *
      (1 - BOTCAST_PRODUCER_GUEST_THINKING_TIME_SCALE);
  return Math.max(
    0,
    endMs -
      startedAtMs -
      Math.max(0, episode.modelWarmupHoldDurationMs) -
      activeWarmupMs -
      thinkingDiscountMs,
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

function signalStudioLightingStyle(args: {
  show: BotcastShow;
  layout: BotcastStudioLayout;
  hostColor: string;
  guestColor: string;
  theme: "light" | "dark";
  tuning: SignalStudioGlowTuning;
}): CSSProperties | null {
  const lighting = args.show.studioLighting;
  if (lighting?.status !== "ready" || !lighting.imageUrl) return null;
  const tuning = args.tuning[args.theme];
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
  } as CSSProperties;
}

function signalIntroIdentityForShow(
  show: BotcastShow,
  hostBot: BotcastBotSummary | null,
) {
  const seed = `${show.hostBotId}:${show.id}:${show.logo.seed}`;
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
    case "ask_about":
      return `Ask about ${cue.detail ?? "that detail"}`;
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

function signalNextSpeakerRole(
  episode: BotcastEpisode,
): "host" | "guest" | null {
  const scheduled = botcastNextSpeakerRole({
    messages: episode.messages,
    segment: episode.segment,
    guestDeparted: guestHasDeparted(episode),
  });
  if (
    scheduled !== "host" ||
    episode.segment !== "interview" ||
    episode.guestKind !== "bot" ||
    episode.guestPresenceMode !== "present"
  ) {
    return scheduled;
  }
  const hostPowers = botcastSnapshotPowersForRoleV1(episode, "host");
  const guestPowers = botcastSnapshotPowersForRoleV1(episode, "guest");
  const guestOpened = episode.events.some(
    (event) =>
      event.kind === "utterance" &&
      event.payload.speakerRole === "guest" &&
      event.payload.segment === "opening",
  );
  return hostPowers &&
    guestPowers &&
    botPowerIsMutedV1(hostPowers) &&
    !botPowerIsMutedV1(guestPowers) &&
    guestOpened
    ? "guest"
    : scheduled;
}

function avatarFallback(bot: BotcastBotSummary): ReactNode {
  return (
    <span className={styles.avatarFallback} aria-hidden="true">
      <span>{bot.glyph?.trim() || bot.name.slice(0, 1).toUpperCase()}</span>
    </span>
  );
}

function SignalShowLogo({
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

export function BotcastExperience({
  bots,
  request,
  preferredProvider,
  hostChatProvider,
  preferredImageProvider,
  modelOptions,
  accountDefaultModel,
  responseMode,
  voiceMode,
  theme = "dark",
  renderAvatar,
  renderMug,
  resolveCupRateMultiplier,
  resolveAvatarVisibilityMode,
  resolveAvatarScaleMode,
  onUtterance,
  onPrefetchUtterance,
  onPrefetchListenerReaction,
  onListenerReaction,
  onPrepareUtterance,
  onStopUtterance,
  onProducerGuestActionSfx,
  introAudioEnabled = true,
  introAudioVolume = 1,
  sidebarHeader,
  navigationHeader,
  producerName = "You",
  renderProducerGuestComposer,
}: BotcastExperienceProps): React.JSX.Element {
  const { closeMenu, openMenu } = usePrismMenu();
  const eligibleBots = useMemo(
    () => [...bots].sort((a, b) => a.name.localeCompare(b.name)),
    [bots],
  );
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
  const accountDefaultModelOption = useMemo(
    () =>
      accountDefaultModel
        ? (modelOptions.find((option) => option.id === accountDefaultModel) ??
          null)
        : null,
    [accountDefaultModel, modelOptions],
  );
  const accountDefaultProvider =
    accountDefaultModelOption?.provider ?? preferredProvider;
  const [shows, setShows] = useState<BotcastShow[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<BotcastEpisodeSummary[]>([]);
  const [episode, setEpisode] = useState<BotcastEpisode | null>(null);
  const [replayEpisode, setReplayEpisode] = useState<BotcastEpisode | null>(
    null,
  );
  const [replayRenderTarget, setReplayRenderTarget] =
    useState<SignalReplayRenderTarget | null>(null);
  const [replayRecordingsByEpisodeId, setReplayRecordingsByEpisodeId] =
    useState<Record<string, ReplayRecordingV1 | null>>({});
  const [hostDraftId, setHostDraftId] = useState("");
  const [showPremiseInspirationDraft, setShowPremiseInspirationDraft] =
    useState("");
  const [guestDraftId, setGuestDraftId] = useState("");
  const [topicDraft, setTopicDraft] = useState("");
  const [producerBriefDraft, setProducerBriefDraft] = useState("");
  const [producerGuestContextDraft, setProducerGuestContextDraft] =
    useState("");
  const [producerGuestAnswerDraft, setProducerGuestAnswerDraft] = useState("");
  const [bookingSuggestionBusy, setBookingSuggestionBusy] =
    useState<SignalBookingSuggestionOperation | null>(null);
  const [episodeModelDraft, setEpisodeModelDraft] = useState("");
  const [episodeDurationDraft, setEpisodeDurationDraft] =
    useState<BotcastSessionDurationMinutes | null>(null);
  const [episodeSetupLoadingId, setEpisodeSetupLoadingId] = useState<
    string | null
  >(null);
  const [askAboutDraft, setAskAboutDraft] = useState("");
  const [queuedProducerCue, setQueuedProducerCue] =
    useState<BotcastProducerCue | null>(null);
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
  const [hostChatStreamingMessage, setHostChatStreamingMessage] =
    useState<BotcastShowHostChatMessage | null>(null);
  const [hostChatActionText, setHostChatActionText] = useState<string | null>(
    null,
  );
  const [hostChatDraft, setHostChatDraft] = useState("");
  const [hostChatBusy, setHostChatBusy] = useState(false);
  const [audiencePulseShowId, setAudiencePulseShowId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [studioLightingBusy, setStudioLightingBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoRun, setAutoRun] = useState(false);
  const [error, setError] = useState<SignalErrorToast | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewCopyState, setReviewCopyState] =
    useState<SignalReviewCopyState | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(
    null,
  );
  const [liveSpeech, setLiveSpeech] = useState<BotcastLiveSpeech | null>(null);
  // The next bot begins preparing while the current answer is still on mic.
  // This is real orchestration work, surfaced as a restrained listen/thinking
  // cue rather than filler dialogue during the handoff.
  const [anticipatingSpeakerRole, setAnticipatingSpeakerRole] = useState<
    "host" | "guest" | null
  >(null);
  const [hostInterruptionOrdinal, setHostInterruptionOrdinal] = useState(0);
  const [signalStageNowMs, setSignalStageNowMs] = useState(() => Date.now());
  const {
    active: signalAmbientBotVocalization,
    start: startSignalAmbientBotVocalization,
    mouthShapeForTarget: signalAmbientBotVocalizationMouthShape,
  } = useAmbientBotVocalization();
  const [episodePreRoll, setEpisodePreRoll] =
    useState<SignalEpisodePreRoll | null>(null);
  const [signalModelWarmup, setSignalModelWarmup] =
    useState<SignalModelWarmup | null>(null);
  const [episodeOutro, setEpisodeOutro] = useState<SignalEpisodeOutro | null>(
    null,
  );
  const [episodeOutroSfxMutedId, setEpisodeOutroSfxMutedId] = useState<
    string | null
  >(null);
  const [introPreviewShowId, setIntroPreviewShowId] = useState<string | null>(
    null,
  );
  const [cuttingShow, setCuttingShow] = useState(false);
  const [cameraSaving, setCameraSaving] = useState(false);
  const [cameraTransitionMode, setCameraTransitionMode] =
    useState<SignalCameraTransitionMode>("animated");
  const [liveCameraPostSpeechHoldShot, setLiveCameraPostSpeechHoldShot] =
    useState<SignalDirectedCameraShot | null>(null);
  const [replayElapsedMs, setReplayElapsedMs] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayVoicePending, setReplayVoicePending] = useState(false);
  const [replaySpeechActive, setReplaySpeechActive] = useState(false);
  const [replayRenderCapture, setReplayRenderCapture] =
    useState<SignalReplayRenderCaptureState | null>(null);
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
  const [studioLayoutPreviewTheme, setStudioLayoutPreviewTheme] =
    useState<"light" | "dark">(theme);
  const [studioGlowTuning, setStudioGlowTuning] =
    useState<SignalStudioGlowTuning>(defaultSignalStudioGlowTuning);
  const [studioLayoutPreviewGuestId, setStudioLayoutPreviewGuestId] =
    useState("");
  const [studioLayoutSaving, setStudioLayoutSaving] = useState(false);
  const [studioVoiceLevelsSaving, setStudioVoiceLevelsSaving] =
    useState(false);
  const [studioAtmosphereMixSaving, setStudioAtmosphereMixSaving] =
    useState(false);
  const [studioLayoutDraggingItem, setStudioLayoutDraggingItem] =
    useState<BotcastStudioLayoutItem | null>(null);
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
  const [signalSoundboardHit, setSignalSoundboardHit] = useState<{
    kind: BotcastSoundboardCueKind;
    nonce: number;
  } | null>(null);
  const blockingAbortRef = useRef<AbortController | null>(null);
  const handledArtworkJobIdsRef = useRef(new Set<string>());
  const artworkJobCompletedCountRef = useRef(new Map<string, number>());
  const advanceInFlightRef = useRef(false);
  const queuedProducerCueRef = useRef<BotcastProducerCue | null>(null);
  const producerGuestThinkingStartedAtRef = useRef<number | null>(null);
  const producerGuestThinkingEndedAtRef = useRef<number | null>(null);
  const producerGuestSipTimeoutRef = useRef<number | null>(null);
  const signalSoundboardHitTimeoutRef = useRef<number | null>(null);
  const signalSoundboardNextVariantByKindRef = useRef(
    new Map<BotcastSoundboardCueKind, number>(),
  );
  const producerCueInputRef = useRef<HTMLInputElement | null>(null);
  const producerCueInputFocusedRef = useRef(false);
  const producerCueInputSelectionRef = useRef({ start: 0, end: 0 });
  const preparedAdvanceRef = useRef<PreparedBotcastAdvance | null>(null);
  const activeSpeechMessageIdRef = useRef<string | null>(null);
  const episodeOperationAbortRef = useRef<AbortController | null>(null);
  const episodeRunIdRef = useRef(0);
  const preRollSkipRequestedRef = useRef(false);
  const preRollGateResolveRef = useRef<(() => void) | null>(null);
  const signalModelWarmupRef = useRef<SignalModelWarmup | null>(null);
  const signalModelWarmupVisibleRef = useRef(false);
  const introPreviewRunIdRef = useRef(0);
  const outroRunIdRef = useRef(0);
  const presentedEpisodeOutroIdsRef = useRef(new Set<string>());
  const selectedShowIdRef = useRef<string | null>(selectedShowId);
  const hostChatOpenRef = useRef(false);
  const hostChatStreamTimerRef = useRef<number | null>(null);
  const hostChatCloudRef = useRef<HTMLDivElement | null>(null);
  const hostChatAutoFollowRef = useRef(true);
  const hostChatComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const hostChatRequestSequenceRef = useRef(0);
  const pendingCutRef = useRef<SignalPendingCutRequest | null>(null);
  const cutExecutionRef = useRef(false);
  const replayVoiceMessageIdRef = useRef<string | null>(null);
  const replayVoiceRunIdRef = useRef(0);
  const replaySoundboardPreviousElapsedMsRef = useRef(-1);
  const replaySoundboardFiredEventIdsRef = useRef(new Set<string>());
  const listenerReactionPlanByMessageIdRef = useRef(
    new Map<string, ListenerReactionPlanV1>(),
  );
  const listenerReactionAtMsByMessageIdRef = useRef(new Map<string, number>());
  const liveListenerReactionFiredRef = useRef(new Set<string>());
  const liveCameraPostSpeechHoldTimerRef = useRef<number | null>(null);
  const replayListenerReactionFiredRef = useRef(new Set<string>());
  const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null);
  const audiencePulseCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const audiencePulseReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const lightStudioUploadRef = useRef<HTMLInputElement | null>(null);
  const darkStudioUploadRef = useRef<HTMLInputElement | null>(null);
  const logoUploadRef = useRef<HTMLInputElement | null>(null);
  const studioLayoutDragRef = useRef<SignalStudioLayoutDrag | null>(null);
  const studioLayoutDraftRef = useRef<{
    showId: string;
    layout: BotcastStudioLayout;
  } | null>(null);
  const studioLayoutSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const studioLayoutSavePendingRef = useRef(0);
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
  const signalAtmosphereControllerRef =
    useRef<SessionAtmosphereController | null>(null);
  const signalReplayRenderStageRef = useRef<HTMLElement | null>(null);
  const signalReplayRenderFontCssRef = useRef<string | null>(null);
  const onStopUtteranceRef = useRef(onStopUtterance);
  const prepareFollowingBotResponseRef = useRef<
    (currentEpisode: BotcastEpisode, message: BotcastMessage) => void
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
      onPlaybackStart?: () => void,
    ) => Promise<void>
  >(async () => undefined);

  useEffect(() => {
    onStopUtteranceRef.current = onStopUtterance;
  }, [onStopUtterance]);

  useEffect(() => {
    selectedShowIdRef.current = selectedShowId;
  }, [selectedShowId]);

  useEffect(() => {
    hostChatOpenRef.current = hostChatOpen;
  }, [hostChatOpen]);

  useEffect(() => {
    setCameraTransitionMode(readSignalCameraTransitionMode(window.localStorage));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setNotice((current) => (current === notice ? null : current));
    }, SIGNAL_NOTICE_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const assignQueuedProducerCue = useCallback(
    (cue: BotcastProducerCue | null): void => {
      queuedProducerCueRef.current = cue;
      setQueuedProducerCue(cue);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!producerCueInputFocusedRef.current) return;
    const input = producerCueInputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    const { start, end } = producerCueInputSelectionRef.current;
    input.setSelectionRange(start, end);
  }, [liveSpeech?.messageId, speakingMessageId]);

  const assignSignalModelWarmup = useCallback(
    (value: SignalModelWarmup | null): void => {
      signalModelWarmupRef.current = value;
      setSignalModelWarmup(value);
    },
    [],
  );

  useEffect(() => () => blockingAbortRef.current?.abort(), []);

  const activeEpisodeId = episode?.id ?? null;
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
    const updateStageClock = (): void => setSignalStageNowMs(Date.now());
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
      const shadow = scene.querySelector<HTMLElement>(
        `[data-signal-mug-shadow-role="${role}"]`,
      );
      if (!mouth || !mug) continue;

      const target = signalCupSipTargetFromMouth({
        role,
        sceneBounds,
        sceneLocalWidth: scene.offsetWidth,
        sceneLocalHeight: scene.offsetHeight,
        mouthBounds: mouth.getBoundingClientRect(),
        mugLocalHeight: mug.offsetHeight,
        viewportWidth: window.innerWidth,
      });
      if (!target) continue;
      mug.style.setProperty("--signal-cup-mouth-x", `${target.x}px`);
      mug.style.setProperty("--signal-cup-mouth-y", `${target.y}px`);
      if (!shadow) continue;
      const shadowProfile = signalCupShadowProfileForTravel({
        spawnX: shadow.offsetLeft,
        spawnY: shadow.offsetTop,
        cupX: target.x,
        cupY: target.y,
        sceneWidth: scene.offsetWidth,
        sceneHeight: scene.offsetHeight,
      });
      shadow.style.setProperty(
        "--signal-cup-shadow-active-scale-x",
        `${shadowProfile.scaleX}`,
      );
      shadow.style.setProperty(
        "--signal-cup-shadow-active-scale-y",
        `${shadowProfile.scaleY}`,
      );
      shadow.style.setProperty(
        "--signal-cup-shadow-active-blur",
        `${shadowProfile.blurPx}px`,
      );
      shadow.style.setProperty(
        "--signal-cup-shadow-active-opacity",
        `${shadowProfile.opacity}`,
      );
    }
  }, []);

  const syncSignalCupTravel = useCallback((): void => {
    const stage = signalStageRef.current;
    const scene = stage?.querySelector<HTMLElement>(
      '[data-signal-stage-scene="true"]',
    );
    if (!scene || scene.offsetWidth <= 0 || scene.offsetHeight <= 0) return;
    const sceneBounds = scene.getBoundingClientRect();

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
            returnX: null,
            returnY: null,
            sipFaceActive: true,
          };
        } else if (travel.mode === "sipping" && !requested) {
          const mugBounds = mug.getBoundingClientRect();
          const returnPoint = signalStageLocalPointFromViewport({
            sceneBounds,
            sceneLocalWidth: scene.offsetWidth,
            sceneLocalHeight: scene.offsetHeight,
            viewportX: mugBounds.left + mugBounds.width / 2,
            viewportY: mugBounds.top + mugBounds.height / 2,
          });
          const shadow = scene.querySelector<HTMLElement>(
            `[data-signal-mug-shadow-role="${role}"]`,
          );
          if (returnPoint && shadow) {
            const shadowProfile = signalCupShadowProfileForTravel({
              spawnX: shadow.offsetLeft,
              spawnY: shadow.offsetTop,
              cupX: returnPoint.x,
              cupY: returnPoint.y,
              sceneWidth: scene.offsetWidth,
              sceneHeight: scene.offsetHeight,
            });
            shadow.style.setProperty(
              "--signal-cup-shadow-return-scale-x",
              `${shadowProfile.scaleX}`,
            );
            shadow.style.setProperty(
              "--signal-cup-shadow-return-scale-y",
              `${shadowProfile.scaleY}`,
            );
            shadow.style.setProperty(
              "--signal-cup-shadow-return-blur",
              `${shadowProfile.blurPx}px`,
            );
            shadow.style.setProperty(
              "--signal-cup-shadow-return-opacity",
              `${shadowProfile.opacity}`,
            );
          }
          nextTravel = returnPoint
            ? {
                mode: "returning",
                returnX: returnPoint.x,
                returnY: returnPoint.y,
                sipFaceActive: false,
              }
            : {
                mode: "idle",
                returnX: null,
                returnY: null,
                sipFaceActive: false,
              };
        }

        if (nextTravel !== travel) {
          if (next === current) next = { ...current };
          next[role] = nextTravel;
        }
      }
      return next;
    });
  }, []);

  const finishSignalCupReturn = useCallback(
    (
      role: "host" | "guest",
      event: ReactAnimationEvent<HTMLDivElement>,
    ): void => {
      if (event.target !== event.currentTarget) return;
      setSignalCupTravelByRole((current) => {
        if (current[role].mode !== "returning") return current;
        return {
          ...current,
          [role]: {
            mode: "idle",
            returnX: null,
            returnY: null,
            sipFaceActive: false,
          },
        };
      });
    },
    [],
  );

  // Animation events can be lost when a live stage is resized, hot-reloaded,
  // or swapped between shots. Never let a mug remain stranded in its return
  // state and miss every later sip.
  useEffect(() => {
    if (
      signalCupTravelByRole.host.mode !== "returning" &&
      signalCupTravelByRole.guest.mode !== "returning"
    )
      return;
    const timer = window.setTimeout(() => {
      setSignalCupTravelByRole((current) => {
        let next = current;
        for (const role of ["host", "guest"] as const) {
          if (current[role].mode !== "returning") continue;
          if (next === current) next = { ...current };
          next[role] = {
            mode: "idle",
            returnX: null,
            returnY: null,
            sipFaceActive: false,
          };
        }
        return next;
      });
    }, 500);
    return () => window.clearTimeout(timer);
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

  useLayoutEffect(() => {
    syncSignalSipMouthTargets();
    syncSignalCupTravel();
  });

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
    if (producerGuestSipTimeoutRef.current !== null) {
      window.clearTimeout(producerGuestSipTimeoutRef.current);
      producerGuestSipTimeoutRef.current = null;
    }
    if (signalSoundboardHitTimeoutRef.current !== null) {
      window.clearTimeout(signalSoundboardHitTimeoutRef.current);
      signalSoundboardHitTimeoutRef.current = null;
    }
    stopSignalSoundboardAudio(180, signalAtmosphereControllerRef.current);
    signalSoundboardNextVariantByKindRef.current.clear();
    setSignalSoundboardHit(null);
    replaySoundboardPreviousElapsedMsRef.current = -1;
    replaySoundboardFiredEventIdsRef.current.clear();
    setProducerGuestSipActive(false);
    setSignalCupTravelByRole(initialSignalCupTravelByRole());
    setHostInterruptionOrdinal(0);
    liveListenerReactionFiredRef.current.clear();
    replayListenerReactionFiredRef.current.clear();
    assignQueuedProducerCue(null);
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
      if (signalSoundboardHitTimeoutRef.current !== null) {
        window.clearTimeout(signalSoundboardHitTimeoutRef.current);
      }
      stopSignalSoundboardAudio(180, signalAtmosphereControllerRef.current);
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
    onStopUtteranceRef.current?.();
  }, []);

  const stopIntroPreview = useCallback((): void => {
    introPreviewRunIdRef.current += 1;
    setIntroPreviewShowId(null);
    stopSignalIntroAudio();
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
    stopSignalIntroAudio();
  }, []);

  const playEpisodeOutro = useCallback(
    async (args: {
      episode: BotcastEpisode;
      show: BotcastShow;
      forced: boolean;
    }): Promise<void> => {
      if (presentedEpisodeOutroIdsRef.current.has(args.episode.id)) return;
      presentedEpisodeOutroIdsRef.current.add(args.episode.id);
      setEpisodeOutroSfxMutedId(args.episode.id);
      const runId = outroRunIdRef.current + 1;
      outroRunIdRef.current = runId;
      // Let the host's final words settle in the live studio before the
      // transmission curtain or outro audio begins.
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, SIGNAL_EPISODE_OUTRO_DEAD_AIR_MS),
      );
      if (outroRunIdRef.current !== runId) return;
      setEpisodeOutro({
        episodeId: args.episode.id,
        showName: args.show.name,
        phase: "curtain",
        forced: args.forced,
      });
      const audioIdentity = signalIntroIdentityForShow(
        args.show,
        bots.find((bot) => bot.id === args.show.hostBotId) ?? null,
      );
      const playback = playSignalOutdentAudio({
        ...audioIdentity,
        introAudio: args.show.introAudio,
        enabled: introAudioEnabled,
        volume: introAudioVolume,
      });
      const reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ===
        true;
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, reducedMotion ? 160 : 760),
      );
      if (outroRunIdRef.current !== runId) return;
      setEpisodeOutro((current) =>
        current?.episodeId === args.episode.id
          ? { ...current, phase: "holding" }
          : current,
      );
      const visualMinimum = new Promise<void>((resolve) =>
        window.setTimeout(resolve, reducedMotion ? 620 : 1_800),
      );
      await Promise.all([playback.finished, visualMinimum]);
      if (outroRunIdRef.current !== runId) return;
      setEpisodeOutro((current) =>
        current?.episodeId === args.episode.id
          ? { ...current, phase: "complete" }
          : current,
      );
      stopSignalIntroAudio();
    },
    [bots, introAudioEnabled, introAudioVolume],
  );

  useEffect(() => {
    if (!introAudioEnabled) stopIntroPreview();
  }, [introAudioEnabled, stopIntroPreview]);

  useEffect(
    () => () => {
      studioSoundcheckRunIdRef.current += 1;
      onStopUtteranceRef.current?.();
    },
    [],
  );

  const invalidateEpisodeOperation = useCallback((): void => {
    episodeRunIdRef.current += 1;
    episodeOperationAbortRef.current?.abort();
    episodeOperationAbortRef.current = null;
    preparedAdvanceRef.current?.controller.abort();
    preparedAdvanceRef.current = null;
    setAnticipatingSpeakerRole(null);
    advanceInFlightRef.current = false;
    setAutoRun(false);
    setBusy(false);
    setEpisodePreRoll(null);
    assignSignalModelWarmup(null);
    signalModelWarmupVisibleRef.current = false;
    stopEpisodeOutro();
    preRollSkipRequestedRef.current = false;
    preRollGateResolveRef.current?.();
    preRollGateResolveRef.current = null;
    stopIntroPreview();
    stopUtterance();
  }, [
    assignSignalModelWarmup,
    stopEpisodeOutro,
    stopIntroPreview,
    stopUtterance,
  ]);

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
    async (episodeId: string | null): Promise<void> => {
      if (episodeId) {
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

  useEffect(() => {
    if (responseMode === "auto" && episodeModelDraft) {
      setEpisodeModelDraft("");
    }
  }, [episodeModelDraft, responseMode]);

  useEffect(() => {
    if (
      episodeModelDraft &&
      !modelOptions.some((option) => option.id === episodeModelDraft)
    ) {
      setEpisodeModelDraft("");
    }
  }, [episodeModelDraft, modelOptions]);

  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? null;
  const handleReplayRecordingChange = useCallback(
    (sourceId: string, recording: ReplayRecordingV1 | null): void => {
      setReplayRecordingsByEpisodeId((current) => {
        const previous = current[sourceId] ?? null;
        if (
          previous?.id === recording?.id &&
          previous?.status === recording?.status &&
          previous?.progress === recording?.progress &&
          previous?.videoUrl === recording?.videoUrl
        ) {
          return current;
        }
        return { ...current, [sourceId]: recording };
      });
    },
    [],
  );
  const replayQueuedEpisodeIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!episode || episode.status !== "completed" || !selectedShow) return;
    if (replayQueuedEpisodeIdsRef.current.has(episode.id)) return;
    replayQueuedEpisodeIdsRef.current.add(episode.id);
    const manifest = buildSignalReplayManifestV1({
      episode,
      show: selectedShow,
      bots: eligibleBots,
      producerName,
      theme,
    });
    void queueReplayManifest(manifest)
      .then(() =>
        window.dispatchEvent(new Event(REPLAY_RECORDING_CHANGED_EVENT)),
      )
      .catch(() => replayQueuedEpisodeIdsRef.current.delete(episode.id));
  }, [eligibleBots, episode, producerName, selectedShow, theme]);
  useEffect(() => {
    if (!replayRenderTarget) return;
    let disposed = false;
    const refresh = async (): Promise<void> => {
      const recording = await replayRecordingForSource(
        "signal",
        replayRenderTarget.episode.id,
      ).catch(() => null);
      if (disposed || !recording) return;
      handleReplayRecordingChange(replayRenderTarget.episode.id, recording);
      if (signalReplayRecordingHasVideo(recording)) {
        setReplayRenderTarget(null);
        setNotice(
          `“${replayRenderTarget.episode.title}” is ready. Select it to watch.`,
        );
      } else if (recording.status === "failed") {
        setReplayRenderTarget(null);
        setNotice(
          `“${replayRenderTarget.episode.title}” needs another render attempt. Select it to retry.`,
        );
      }
    };
    const onChange = () => void refresh();
    void refresh();
    window.addEventListener(REPLAY_RECORDING_CHANGED_EVENT, onChange);
    const timer = window.setInterval(onChange, 2_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener(REPLAY_RECORDING_CHANGED_EVENT, onChange);
    };
  }, [handleReplayRecordingChange, replayRenderTarget]);
  useEffect(() => {
    setShowPremiseDraft(selectedShow?.premise ?? "");
  }, [selectedShow?.id, selectedShow?.premise]);
  const audiencePulseOpen = Boolean(
    selectedShow && audiencePulseShowId === selectedShow.id,
  );

  // Natural completion normally starts the outro after the final spoken line.
  // This state-driven fallback makes the end card reliable if that one-shot
  // continuation is interrupted by rendering, playback, or a refresh boundary.
  useEffect(() => {
    if (
      !episode ||
      episode.status !== "completed" ||
      speakingMessageId !== null ||
      !selectedShow ||
      episodeOutro?.episodeId === episode.id ||
      presentedEpisodeOutroIdsRef.current.has(episode.id)
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
  const closeSignalHostChat = useCallback((): void => {
    hostChatRequestSequenceRef.current += 1;
    hostChatOpenRef.current = false;
    hostChatAutoFollowRef.current = true;
    if (hostChatStreamTimerRef.current !== null) {
      window.clearTimeout(hostChatStreamTimerRef.current);
      hostChatStreamTimerRef.current = null;
    }
    onStopUtterance?.();
    setHostChatOpen(false);
    setHostChatMessages([]);
    setHostChatDraft("");
    setHostChatBusy(false);
    setHostChatStreamingMessage(null);
    setHostChatActionText(null);
  }, [onStopUtterance]);

  useEffect(
    () => () => {
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
    setHostChatActionText(null);
    hostChatAutoFollowRef.current = true;
    if (hostChatStreamTimerRef.current !== null) {
      window.clearTimeout(hostChatStreamTimerRef.current);
      hostChatStreamTimerRef.current = null;
    }
    onStopUtterance?.();
  }, [onStopUtterance, selectedShow?.id]);

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
    if (!hostChatOpen || !hostChatAutoFollowRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const cloud = hostChatCloudRef.current;
      if (cloud) cloud.scrollTop = cloud.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hostChatMessages, hostChatOpen, hostChatStreamingMessage?.content]);

  const toggleSignalHostChat = useCallback((): void => {
    if (!selectedShow || !hostBot || hostBot.muted || showIdentityControlsExpanded) {
      return;
    }
    if (hostChatOpenRef.current) {
      closeSignalHostChat();
      return;
    }
    hostChatOpenRef.current = true;
    hostChatAutoFollowRef.current = true;
    setHostChatOpen(true);
  }, [
    closeSignalHostChat,
    hostBot,
    selectedShow,
    showIdentityControlsExpanded,
  ]);

  const streamSignalHostChatResponse = useCallback(
    async (
      message: BotcastShowHostChatMessage,
      requestSequence: number,
      showId: string,
    ): Promise<boolean> => {
      const presentation = resolveZenActionPresentation(message.content);
      const spokenContent = presentation.mainText.trim();
      const stillCurrent = (): boolean =>
        requestSequence === hostChatRequestSequenceRef.current &&
        selectedShowIdRef.current === showId &&
        hostChatOpenRef.current;
      const updateVisiblePresentation = (visibleContent: string): void => {
        if (!stillCurrent()) return;
        setHostChatStreamingMessage({
          ...message,
          content: visibleContent,
        });
        const action = resolveCurrentZenActionCue(
          presentation.cues,
          Array.from(visibleContent).length,
        );
        setHostChatActionText(action?.action ?? null);
      };
      let reveal = prepareBotcastSpeechReveal(spokenContent);
      let playbackStarted = false;
      let played = false;
      if (spokenContent && onUtterance && hostBot && selectedShow) {
        const voiceMessage: BotcastMessage = {
          id: `signal-host-chat-voice:${message.id}`,
          episodeId: `signal-host-chat:${showId}`,
          speakerRole: "host",
          botId: hostBot.id,
          content: spokenContent,
          stageActionText:
            presentation.cues.map((cue) => cue.action).join("; ") || null,
          voicePerformanceText: null,
          moodKey: "neutral",
          createdAt: message.createdAt,
        };
        try {
          played = await Promise.resolve(
            onUtterance(
              voiceMessage,
              hostBot,
              {
                onStart: (durationMs, alignment) => {
                  if (!stillCurrent()) return;
                  playbackStarted = true;
                  reveal = startBotcastSpeechReveal({
                    text: spokenContent,
                    durationMs:
                      durationMs ??
                      Math.max(720, botcastSignalStandardCadenceDurationMs(spokenContent)),
                    alignment,
                  });
                  updateVisiblePresentation("");
                },
                onProgress: (elapsedMs) => {
                  if (!stillCurrent() || !playbackStarted) return;
                  reveal = updateBotcastSpeechReveal(reveal, elapsedMs);
                  updateVisiblePresentation(
                    botcastSpeechRevealVisibleText(reveal),
                  );
                },
                onEnd: () => {
                  if (!stillCurrent()) return;
                  reveal = finishBotcastSpeechReveal(reveal);
                  updateVisiblePresentation(spokenContent);
                },
              },
              botcastVoiceLevelForBot(
                selectedShow.voiceLevelsByBotId,
                hostBot.id,
              ),
              signalStudioVoicePan(selectedShow.studioLayout, "host"),
              {
                channel: "primary",
                mixGain: 1,
                ephemeral: true,
                explicitOnlineContext: hostChatProvider !== "local",
              },
            ),
          );
        } catch {
          played = false;
        }
      }
      if (!stillCurrent()) {
        setHostChatStreamingMessage(null);
        return false;
      }
      if (!played || !playbackStarted) {
        const chunks = signalHostChatStreamChunks(spokenContent);
        await new Promise<void>((resolve) => {
          let chunkIndex = 0;
          let streamedContent = "";
          const step = (): void => {
            hostChatStreamTimerRef.current = null;
            if (!stillCurrent()) {
              resolve();
              return;
            }
            const chunk = chunks[chunkIndex];
            if (chunk === undefined) {
              updateVisiblePresentation(spokenContent);
              resolve();
              return;
            }
            streamedContent += chunk;
            chunkIndex += 1;
            updateVisiblePresentation(streamedContent);
            hostChatStreamTimerRef.current = window.setTimeout(
              step,
              SIGNAL_HOST_CHAT_STREAM_CHUNK_MS,
            );
          };
          step();
        });
      }
      if (!stillCurrent()) {
        setHostChatStreamingMessage(null);
        return false;
      }
      updateVisiblePresentation(spokenContent);
      return true;
    },
    [hostBot, hostChatProvider, onUtterance, selectedShow],
  );

  const sendSignalHostChat = useCallback(async (): Promise<void> => {
    const content = hostChatDraft.trim();
    if (!content || !selectedShow || !hostBot || hostChatBusy || hostBot.muted) {
      return;
    }
    const showId = selectedShow.id;
    const requestSequence = ++hostChatRequestSequenceRef.current;
    const priorMessages = hostChatMessages
      .slice(-SIGNAL_HOST_CHAT_CONTEXT_LIMIT)
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
    hostChatAutoFollowRef.current = true;
    setHostChatActionText(null);
    setHostChatDraft("");
    setHostChatBusy(true);
    setHostChatMessages((current) => [...current, userMessage]);
    onPrepareUtterance?.();
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
      if (
        streamed &&
        requestSequence === hostChatRequestSequenceRef.current &&
        selectedShowIdRef.current === showId &&
        hostChatOpenRef.current
      ) {
        setHostChatMessages((current) => [...current, response.message]);
        setHostChatStreamingMessage(null);
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
    onPrepareUtterance,
    request,
    selectedShow,
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
    return {
      id: botcastInterruptionBridgeMessageId(
        episode.id,
        hostInterruptionOrdinal,
      ),
      episodeId: episode.id,
      speakerRole: "host",
      botId: hostBot.id,
      content: botcastHostInterruptionLineAt(
        selectedShow.hostInterruptionLines,
        hostInterruptionOrdinal,
      ),
      stageActionText: null,
      voicePerformanceText: null,
      moodKey: "neutral",
      createdAt: new Date().toISOString(),
    };
  }, [
    episode,
    hostBot,
    hostInterruptionOrdinal,
    selectedShow,
  ]);
  useEffect(() => {
    if (!nextHostInterruptionBridge || !hostBot || hostBot.muted) return;
    onPrefetchUtterance?.(nextHostInterruptionBridge, hostBot);
  }, [hostBot, nextHostInterruptionBridge, onPrefetchUtterance]);
  const nextHostInterruptionCrosstalkPlan = useMemo<
    ListenerReactionPlanV1 | null
  >(() => {
    if (!episode || !hostBot || !nextHostInterruptionBridge) return null;
    const activeGuestMessage = episode.messages.find(
      (message) =>
        message.id === speakingMessageId && message.speakerRole === "guest",
    );
    if (!activeGuestMessage || activeGuestMessage.botId === BOTCAST_PRODUCER_GUEST_ID) {
      return null;
    }
    const seed = `signal-host-crosstalk-v1:${episode.id}:${activeGuestMessage.id}:${nextHostInterruptionBridge.content}`;
    return {
      v: 1,
      name: "listenerReaction",
      speakerBotId: activeGuestMessage.botId,
      listenerBotId: hostBot.id,
      messageId: activeGuestMessage.id,
      targetSource: "role",
      visualAction: "lean_in",
      interjectionAttempt: true,
      interruptedSpeakerCue:
        botCrosstalkInterruptedSpeakerCueForSeed(seed),
      interruptedSpeakerCuePlayback: "crosstalk",
      targetProgress: 0.6,
      seed,
      cameraCutEligible: true,
    };
  }, [
    episode,
    hostBot,
    nextHostInterruptionBridge,
    speakingMessageId,
  ]);
  useEffect(() => {
    if (!nextHostInterruptionCrosstalkPlan || !hostBot) return;
    onPrefetchListenerReaction?.(
      nextHostInterruptionCrosstalkPlan,
      hostBot,
    );
  }, [
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
    const bookedGuest = eligibleBots.find((bot) => bot.id === guestDraftId);
    const previewGuestId = bookedGuest?.id ?? randomSignalEpisodeGuestId({
      candidateGuestIds: eligibleBots.map((bot) => bot.id),
      hostBotId: hostBot.id,
      currentGuestId: studioLayoutPreviewGuestId,
    });
    setStudioLayoutPreviewGuestId(previewGuestId ?? "");
    setStudioLayoutPreviewTheme(theme);
    setStudioLayoutEditorOpen(true);
  };
  const hostShowAccent = selectedShow
    ? normalizeAccentForTheme(hostBot?.color ?? selectedShow.accentColor, theme)
    : null;
  const liveGuestBot = useMemo(() => {
    if (!episode) return null;
    if (episode.guestKind === "producer") {
      return signalProducerGuestBotSummary(
        episode,
        selectedShow?.accentColor,
      );
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
  const replaySceneEpisode = replayRenderTarget?.episode ?? replayEpisode;
  const replayHostBot = replaySceneEpisode
    ? (() => {
        const bot = botsById.get(replaySceneEpisode.hostBotId) ?? null;
        if (!bot) return null;
        const powers = botcastSnapshotPowersForRoleV1(
          replaySceneEpisode,
          "host",
        );
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
  const replayGuestBot = replaySceneEpisode
    ? replaySceneEpisode.guestKind === "producer"
      ? signalProducerGuestBotSummary(
          replaySceneEpisode,
          replayRenderTarget?.show.accentColor ?? selectedShow?.accentColor,
        )
      : (() => {
          const bot = botsById.get(replaySceneEpisode.guestBotId) ?? null;
          if (!bot) return null;
          const powers = botcastSnapshotPowersForRoleV1(
            replaySceneEpisode,
            "guest",
          );
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
  const signalReplayFrameRenderer = useMemo<ReplayFrameRenderer | undefined>(() => {
    if (!replayRenderTarget) return undefined;
    const episodeForRender = replayRenderTarget.episode;
    let activeRecording: ReplayRecordingV1 | null = null;
    let activeTimeline: ReplayTimelineV1 | null = null;
    const settleStage = async (): Promise<void> => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    };
    return {
      captureFps: 10,
      prepare: async (recording, timeline) => {
        if (recording.sourceId !== episodeForRender.id) {
          throw new Error("The open Signal episode does not match this render.");
        }
        activeRecording = recording;
        activeTimeline = timeline;
        signalReplayRenderFontCssRef.current = null;
        flushSync(() => {
          setReplayRenderCapture({
            recording,
            timeline,
            frame: signalReplayVideoFrameState({
              episode: episodeForRender,
              timeline,
              videoElapsedMs: 0,
            }),
          });
        });
        await document.fonts?.ready;
        await settleStage();
        const stage = signalReplayRenderStageRef.current;
        if (!stage) throw new Error("Signal studio capture did not mount.");
        const { getFontEmbedCSS } = await import("html-to-image");
        signalReplayRenderFontCssRef.current = await getFontEmbedCSS(stage).catch(
          () => null,
        );
      },
      renderAt: async (timeMs) => {
        if (!activeRecording || !activeTimeline) {
          throw new Error("Signal studio capture is not prepared.");
        }
        flushSync(() => {
          setReplayRenderCapture({
            recording: activeRecording!,
            timeline: activeTimeline!,
            frame: signalReplayVideoFrameState({
              episode: episodeForRender,
              timeline: activeTimeline!,
              videoElapsedMs: timeMs,
            }),
          });
        });
        await settleStage();
        const stage = signalReplayRenderStageRef.current;
        if (!stage) throw new Error("Signal studio capture was interrupted.");
        const { toCanvas } = await import("html-to-image");
        return toCanvas(stage, {
          width: REPLAY_VIDEO_WIDTH,
          height: REPLAY_VIDEO_HEIGHT,
          canvasWidth: REPLAY_VIDEO_WIDTH,
          canvasHeight: REPLAY_VIDEO_HEIGHT,
          pixelRatio: 1,
          skipAutoScale: true,
          cacheBust: false,
          fontEmbedCSS: signalReplayRenderFontCssRef.current ?? undefined,
        });
      },
      finish: () => {
        activeRecording = null;
        activeTimeline = null;
        signalReplayRenderFontCssRef.current = null;
        setReplayRenderCapture(null);
      },
    };
  }, [replayRenderTarget]);
  const signalReplayCaptureShow = useMemo<BotcastShow | null>(() => {
    const manifest = replayRenderCapture?.recording.manifest;
    const renderShow = replayRenderTarget?.show;
    if (!manifest || !renderShow) return null;
    const metadata = manifest.visual.metadata ?? {};
    const atmosphereImageUrl = manifest.visual.atmosphereImageUrl;
    const capturedAtmosphere = {
      ...activeShowAtmosphere(renderShow, manifest.visual.theme),
      imageUrl: atmosphereImageUrl,
    };
    return {
      ...renderShow,
      name:
        typeof metadata.showName === "string"
          ? metadata.showName
          : renderShow.name,
      accentColor: manifest.visual.accentColor ?? renderShow.accentColor,
      fallbackStudioAccentVariant:
        metadata.fallbackStudioAccentVariant === 0 ||
        metadata.fallbackStudioAccentVariant === 1 ||
        metadata.fallbackStudioAccentVariant === 2
          ? metadata.fallbackStudioAccentVariant
          : renderShow.fallbackStudioAccentVariant,
      studioLayout:
        metadata.studioLayout && typeof metadata.studioLayout === "object"
          ? (metadata.studioLayout as BotcastStudioLayout)
          : renderShow.studioLayout,
      studioLighting:
        metadata.studioLighting && typeof metadata.studioLighting === "object"
          ? (metadata.studioLighting as BotcastShow["studioLighting"])
          : renderShow.studioLighting,
      atmosphere: capturedAtmosphere,
      dayAtmosphere: capturedAtmosphere,
      nightAtmosphere: capturedAtmosphere,
      atmosphereMix:
        metadata.atmosphereMix && typeof metadata.atmosphereMix === "object"
          ? (metadata.atmosphereMix as BotcastStudioAtmosphereMix)
          : renderShow.atmosphereMix,
      logo: {
        ...renderShow.logo,
        imageUrl:
          typeof metadata.logoImageUrl === "string"
            ? metadata.logoImageUrl
            : null,
      },
    };
  }, [replayRenderCapture, replayRenderTarget]);
  const signalReplayCaptureHost = replayRenderCapture
    ? signalReplayParticipantBot(
        replayRenderCapture.recording,
        "host",
        replayHostBot,
      )
    : null;
  const signalReplayCaptureGuest = replayRenderCapture
    ? signalReplayParticipantBot(
        replayRenderCapture.recording,
        "guest",
        replayGuestBot,
      )
    : null;
  const copyEpisodeForReview = async (
    targetEpisode: BotcastEpisode,
  ): Promise<void> => {
    const targetShow =
      shows.find((show) => show.id === targetEpisode.showId) ?? selectedShow;
    if (!targetShow) return;
    setReviewCopyState({ episodeId: targetEpisode.id, phase: "copying" });
    try {
      const transcript = buildSignalReviewTranscript({
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
      });
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
    setShows(response.shows);
    return response.shows;
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
      setNotice(signalArtworkJobCompletionNotice(artworkJob));
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
    async (
      episodeId: string,
      perspective: "live" | "replay" = "live",
    ): Promise<BotcastEpisode> => {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/episodes/${encodeURIComponent(episodeId)}${
          perspective === "replay" ? "?perspective=replay" : ""
        }`,
      );
      return response.episode;
    },
    [request],
  );

  useEffect(() => {
    if (!selectedShowId) return;
    const refreshDelayMs = signalNextAudienceReviewRefreshDelayMs(episodes);
    if (refreshDelayMs === null) return;
    const timer = window.setTimeout(() => {
      void loadEpisodes(selectedShowId).catch(() => undefined);
    }, refreshDelayMs + 1_000);
    return () => window.clearTimeout(timer);
  }, [episodes, loadEpisodes, selectedShowId]);

  const settlePendingCut = useCallback(
    (pending: SignalPendingCutRequest, completed: boolean): void => {
      if (pendingCutRef.current !== pending) return;
      pendingCutRef.current = null;
      cutExecutionRef.current = false;
      setCuttingShow(false);
      pending.resolve(completed);
    },
    [],
  );

  const performCutShow = useCallback(async (): Promise<void> => {
    const pending = pendingCutRef.current;
    if (
      !pending ||
      cutExecutionRef.current ||
      !episode ||
      episode.id !== pending.episodeId ||
      episode.status === "completed" ||
      !selectedShow
    )
      return;
    cutExecutionRef.current = true;
    invalidateEpisodeOperation();
    const { controller, runId } = beginEpisodeOperation();
    setBusy(true);
    setError(null);
    try {
      const response = await request<BotcastEpisodeAdvanceResponse>(
        `/api/botcast/episodes/${encodeURIComponent(episode.id)}/end`,
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            lastAudienceMessageId: episode.messages.at(-1)?.id ?? null,
            lastAudienceEventSequence: episode.events.at(-1)?.sequence ?? 0,
            audienceSegmentCount: episode.segments.length,
          }),
        },
      );
      if (!episodeOperationIsCurrent(controller, runId)) {
        settlePendingCut(pending, false);
        return;
      }
      setEpisode(response.episode);
      setAutoRun(false);
      if (response.message) {
        prepareEpisodeMessageRef.current(response.message, response.episode);
        await playPreparedEpisodeMessageRef.current(
          response.message,
          response.episode,
          controller,
          runId,
          false,
        );
        if (!episodeOperationIsCurrent(controller, runId)) {
          settlePendingCut(pending, false);
          return;
        }
      }
      const outro = playEpisodeOutro({
        episode: response.episode,
        show: selectedShow,
        forced: true,
      });
      if (selectedShowId) {
        void loadEpisodes(selectedShowId).catch(() => undefined);
      }
      if (pending.waitForOutro) await outro;
      else void outro;
      settlePendingCut(pending, true);
    } catch (cutError) {
      if (episodeOperationIsCurrent(controller, runId)) {
        setError(signalErrorToast("Close live show", cutError));
      }
      settlePendingCut(pending, false);
    } finally {
      if (episodeOperationIsCurrent(controller, runId)) {
        episodeOperationAbortRef.current = null;
      }
      setBusy(false);
    }
  }, [
    beginEpisodeOperation,
    episode,
    episodeOperationIsCurrent,
    invalidateEpisodeOperation,
    loadEpisodes,
    playEpisodeOutro,
    request,
    selectedShow,
    selectedShowId,
    settlePendingCut,
  ]);

  const cutShow = useCallback(
    (options: { waitForOutro?: boolean } = {}): Promise<boolean> => {
      if (!episode || episode.status === "completed" || !selectedShow) {
        return Promise.resolve(false);
      }
      const existing = pendingCutRef.current;
      if (existing) {
        if (options.waitForOutro) existing.waitForOutro = true;
        return existing.promise;
      }
      let resolve!: (completed: boolean) => void;
      const promise = new Promise<boolean>((complete) => {
        resolve = complete;
      });
      const pending: SignalPendingCutRequest = {
        episodeId: episode.id,
        waitForOutro: options.waitForOutro === true,
        promise,
        resolve,
      };
      pendingCutRef.current = pending;
      setCuttingShow(true);
      setAutoRun(false);
      assignQueuedProducerCue(null);
      preparedAdvanceRef.current?.controller.abort();
      preparedAdvanceRef.current = null;
      if (
        activeSpeechMessageIdRef.current === null &&
        speakingMessageId === null
      ) {
        invalidateEpisodeOperation();
      }
      return promise;
    },
    [
      assignQueuedProducerCue,
      episode,
      invalidateEpisodeOperation,
      selectedShow,
      speakingMessageId,
    ],
  );

  useEffect(() => {
    const pending = pendingCutRef.current;
    if (!pending || cutExecutionRef.current) return;
    if (!episode || episode.id !== pending.episodeId || !selectedShow) {
      settlePendingCut(pending, false);
      return;
    }
    if (
      speakingMessageId !== null ||
      activeSpeechMessageIdRef.current !== null ||
      busy
    )
      return;
    if (episode.status === "completed") {
      if (
        !pending.waitForOutro ||
        (episodeOutro?.episodeId === episode.id &&
          episodeOutro.phase === "complete")
      ) {
        settlePendingCut(pending, true);
      }
      return;
    }
    void performCutShow();
  }, [
    busy,
    episode,
    episodeOutro,
    performCutShow,
    selectedShow,
    settlePendingCut,
    speakingMessageId,
  ]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const nextShows = await loadShows();
        if (!active) return;
        const first = nextShows[0] ?? null;
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
  }, [loadEpisodes, loadShows]);

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
        candidate.id === show.id ? { ...candidate, atmosphereMix: mix } : candidate,
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
    const layout = normalizeBotcastStudioLayout(
      {
      ...drag.startLayout,
      [drag.item]: {
          ...startPoint,
          x:
            startPoint.x +
            ((event.clientX - drag.startClientX) / drag.stageWidth) * 100,
          y:
            startPoint.y +
            ((event.clientY - drag.startClientY) / drag.stageHeight) * 100,
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
    const step = event.shiftKey ? 2 : 0.5;
    const layout = normalizeBotcastStudioLayout(show.studioLayout);
    const point = layout[item];
    const nextLayout = normalizeBotcastStudioLayout(
      {
      ...layout,
      [item]: {
        ...point,
        x: point.x + direction[0]! * step,
        y: point.y + direction[1]! * step,
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
    setReplayVoicePending(false);
    setReplaySpeechActive(false);
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
    if (item.status !== "completed") return;
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
        setAskAboutDraft("");
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
        if (episodeOutro?.episodeId === target.id) stopEpisodeOutro();
        setEpisode((current) => (current?.id === target.id ? null : current));
        setReplayEpisode((current) =>
          current?.id === target.id ? null : current,
        );
        await Promise.all([loadShows(), loadEpisodes(target.showId)]);
        setNotice(`“${target.title}” deleted from the archive.`);
      }
      setDeleteTarget(null);
    } catch (deleteRequestError) {
      setDeleteError(errorMessage(deleteRequestError));
    } finally {
      setBusy(false);
    }
  };

  const createShow = async (): Promise<void> => {
    if (!hostDraftId) return;
    setBusy(true);
    setError(null);
    setNotice("Finding the show hidden inside this host…");
    try {
      const response = await request<{ show: BotcastShow }>(
        "/api/botcast/shows",
        {
        method: "POST",
        body: JSON.stringify({
          hostBotId: hostDraftId,
          ...(showPremiseInspirationDraft.trim()
            ? { premise: showPremiseInspirationDraft.trim() }
            : {}),
        }),
        },
      );
      setHostDraftId("");
      setShowPremiseInspirationDraft("");
      await selectShow(response.show);
      replaceShow(response.show);
      setShowNameDraft(response.show.name);
      await synthesizeShowLook(response.show);
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
    const premise = (nextPremise ?? showPremiseDraft).trim();
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
      setNotice("The show premise is saved as creative direction for future episodes and identity passes.");
    } catch (premiseError) {
      setShowPremiseDraft(selectedShow.premise);
      setError(signalErrorToast("Save show premise", premiseError));
    }
  };

  const regenerateShowPremise = async (): Promise<void> => {
    const inspiration = showPremiseDraft.trim();
    if (!selectedShow || !inspiration) return;
    setBusy(true);
    setError(null);
    setBlockingOperation({
      title: "Refreshing the premise",
      detail: `Signal is finding a new conversational promise inside the current prose for ${selectedShow.name}.`,
      stepLabel: "Turning the inspiration into a new premise",
      progress: null,
      cancellable: false,
    });
    try {
      const response = await request<{ show: BotcastShow; generated: boolean }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/premise`,
        {
          method: "POST",
          body: JSON.stringify({
            inspiration,
            preferredProvider: accountDefaultProvider,
          }),
        },
      );
      if (!response.generated) {
        setNotice(
          "Signal couldn’t find a different premise. Refine the inspiration or try another pass.",
        );
        return;
      }
      replaceShow(response.show);
      setShowPremiseDraft(response.show.premise);
      setNotice("The refreshed premise is saved as this show’s creative direction.");
    } catch (premiseError) {
      setError(signalErrorToast("Refresh show premise", premiseError));
    } finally {
      setBlockingOperation(null);
      setBusy(false);
    }
  };

  const regenerateShowName = async (): Promise<void> => {
    if (!selectedShow) return;
    setBusy(true);
    setError(null);
    setBlockingOperation({
      title: "Finding another name",
      detail: `PRISM is listening for the idea at the heart of ${selectedShow.name}.`,
      stepLabel: "Drafting and rejecting the obvious titles",
      progress: null,
      cancellable: false,
    });
    try {
      const response = await request<{ show: BotcastShow; generated: boolean }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/name`,
        {
          method: "POST",
          body: JSON.stringify({
            preferredProvider: accountDefaultProvider,
          }),
        },
      );
      if (!response.generated) {
        setNotice(
          "Signal couldn’t find a different name. Try again whenever you want another pass.",
        );
        return;
      }
      replaceShow(response.show);
      setShowNameDraft(response.show.name);
      setNotice(
        `“${response.show.name}” is now on the marquee. You can still edit it.`,
      );
    } catch (nameError) {
      setError(signalErrorToast("Generate show name", nameError));
    } finally {
      setBlockingOperation(null);
      setBusy(false);
    }
  };

  const regenerateShowBlurbs = async (): Promise<void> => {
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
      }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/blurbs`,
        {
          method: "POST",
          body: JSON.stringify({
            preferredProvider: accountDefaultProvider,
          }),
        },
      );
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
  ): Promise<SignalArtworkJobSnapshot> => {
    const response = await request<{ job: SignalArtworkJobSnapshot }>(
      `/api/botcast/shows/${encodeURIComponent(sourceShow.id)}/artwork-job`,
      {
        method: "POST",
        body: JSON.stringify({
          preferredProvider: preferredImageProvider,
          kinds,
          ...(identityMs === null ? {} : { identityMs }),
        }),
        signal,
      },
    );
    setArtworkJob(response.job);
    announceSignalArtworkJob(response.job);
    return response.job;
  };

  const synthesizeShowLook = async (
    sourceShow: BotcastShow | null = selectedShow,
  ): Promise<void> => {
    if (!sourceShow) return;
    const controller = new AbortController();
    const identityStartedAt = performance.now();
    let showForPass = sourceShow;
    let artworkStarted = false;
    let artworkHandoffStarted = false;
    const recoverableFailures: string[] = [];
    setBusy(true);
    setError(null);
    setNotice("Checking what this show still needs…");
    blockingAbortRef.current = controller;
    setBlockingOperation({
      title: `Completing ${sourceShow.name}`,
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
          }>(`/api/botcast/shows/${encodeURIComponent(sourceShow.id)}/brand`, {
            method: "POST",
            body: JSON.stringify({
              preferredProvider: accountDefaultProvider,
              preserveArtwork: true,
            }),
            signal: controller.signal,
          });
          showForPass = identity.show;
          if (identity.generated) {
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
          try {
            const response = await request<{ show: BotcastShow }>(
              `/api/botcast/shows/${encodeURIComponent(sourceShow.id)}/intro-audio/generate`,
              { method: "POST", body: JSON.stringify({}), signal: controller.signal },
            );
            showForPass = response.show;
            replaceShow(response.show);
          } catch (audioError) {
            if (isAbortError(audioError)) throw audioError;
            recoverableFailures.push("the ElevenLabs audio package");
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

  const regenerateStudio = async (): Promise<void> => {
    if (!selectedShow) return;
    setBusy(true);
    setError(null);
    setNotice("Refreshing the show’s linked studio pair…");
    try {
      const reset = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ regenerateAtmosphere: true }),
        },
      );
      replaceShow(reset.show);
      await startSignalArtworkJob(reset.show, ["night-studio", "day-studio"]);
      if (preferredProvider === "local") {
        setNotice(
          "The refreshed Dark studio and source-linked Light studio are rendering in the background. Signal will keep the built-in room atmosphere while you are Local. You can keep using PRISM.",
        );
      } else {
        try {
          const response = await request<{ show: BotcastShow }>(
            `/api/botcast/shows/${encodeURIComponent(reset.show.id)}/atmosphere-audio/generate`,
            { method: "POST", body: JSON.stringify({}) },
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

  const regenerateLightStudio = async (): Promise<void> => {
    if (!selectedShow) return;
    if (!selectedShow.nightAtmosphere.imageId) {
      setError(
        signalErrorToast(
          "Refresh Light studio",
          "Create or upload the Dark studio before refreshing the Light studio.",
        ),
      );
      return;
    }
    setBusy(true);
    setError(null);
    setNotice("Refreshing the Light studio from the current Dark studio…");
    try {
      await startSignalArtworkJob(selectedShow, ["day-studio"]);
      setNotice(
        "The new Light studio is rendering from the current Dark studio in the background. The Dark studio stays unchanged, and you can keep using PRISM.",
      );
    } catch (studioError) {
      setError(signalErrorToast("Refresh Light studio", studioError));
      setNotice("The current Light and Dark studios remain in place.");
    } finally {
      setBusy(false);
    }
  };

  const refreshStudioLighting = async (): Promise<void> => {
    if (!selectedShow) return;
    if (
      !selectedShow.dayAtmosphere.imageId ||
      !selectedShow.nightAtmosphere.imageId
    ) {
      setError(
        signalErrorToast(
          "Refresh Studio Lighting",
          "Install both the Light and Dark studios first.",
        ),
      );
      return;
    }
    setBusy(true);
    setStudioLightingBusy(true);
    setError(null);
    setNotice("Queuing realistic Studio lighting…");
    try {
      const response = await request<{ job: SignalArtworkJobSnapshot }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/studio-lighting/refresh`,
        {
          method: "POST",
          body: JSON.stringify({ preferredProvider: preferredImageProvider }),
        },
      );
      setArtworkJob(response.job);
      announceSignalArtworkJob(response.job);
      setNotice(
        "Studio lighting is queued in the background. If another image is rendering, Signal will start this automatically when its turn arrives.",
      );
    } catch (lightingError) {
      setError(signalErrorToast("Refresh Studio Lighting", lightingError));
      setNotice("The Studio remains unchanged, with no stale lighting applied.");
    } finally {
      setStudioLightingBusy(false);
      setBusy(false);
    }
  };

  const regenerateLogo = async (): Promise<void> => {
    if (!selectedShow) return;
    setBusy(true);
    setError(null);
    setNotice("Refreshing the show’s logo…");
    try {
      const reset = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ regenerateLogo: true }),
        },
      );
      replaceShow(reset.show);
      await startSignalArtworkJob(reset.show, ["logo"]);
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

  const generateShowIntroAudio = async (): Promise<void> => {
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
    setNotice("Creating this show’s ident, outdent, and atmosphere…");
    setBlockingOperation({
      title: `Creating ${selectedShow.name}’s atmosphere`,
      detail:
        "ElevenLabs is creating an eight-second host-specific ident, its paired four-second closing outdent, and one quiet studio-specific room-and-Foley loop. Signal will cache all three for future episodes.",
      stepLabel: "Creating the audio package",
      progress: null,
      cancellable: true,
    });
    try {
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
        "The ElevenLabs ident, paired outdent, and studio-specific room-and-Foley atmosphere are ready for future episodes.",
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

  const uploadShowAsset = async (
    slot: SignalAssetSlot,
    file: File,
  ): Promise<void> => {
    if (!selectedShow) return;
    const label = SIGNAL_ASSET_LABELS[slot];
    setBusy(true);
    setError(null);
    setBlockingOperation({
      title: `Replacing ${label}`,
      detail: `Saving ${file.name} to ${selectedShow.name}.`,
      stepLabel: "Reading image",
      progress: null,
      cancellable: false,
    });
    try {
      const dataUrl = await readSignalAssetFile(file);
      setBlockingOperation((current) =>
        current ? { ...current, stepLabel: "Saving to Signal" } : null,
      );
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/assets/${slot}/upload`,
        {
          method: "POST",
          body: JSON.stringify({ dataUrl }),
        },
      );
      replaceShow(response.show);
      setNotice(
        `The ${label} has been replaced. Its previous artwork remains in Images.`,
      );
    } catch (uploadError) {
      setError(signalErrorToast("Upload Signal artwork", uploadError));
    } finally {
      setBlockingOperation(null);
      setBusy(false);
    }
  };

  const startEpisode = async (
    botBooking?: SignalBotEpisodeStartDraft,
  ): Promise<void> => {
    const startGuestId = botBooking?.guestId ?? guestDraftId;
    const startTopic = botBooking?.topic ?? topicDraft;
    const startProducerBrief =
      botBooking?.producerBrief ?? producerBriefDraft;
    const producerGuest = startGuestId === BOTCAST_PRODUCER_GUEST_ID;
    const producerGuestWantsSurprise =
      producerGuest && !producerGuestContextDraft.trim();
    if (producerGuest && hostBot?.muted) {
      setError(
        signalErrorToast(
          "Start Signal episode",
          "This host's hard speech Power cannot originate the questions required to interview the Producer. Choose a bot guest or a different show host.",
          "host Power compatibility",
        ),
      );
      return;
    }
    if (
      !selectedShow ||
      !startGuestId ||
      (!producerGuest && !startTopic.trim())
    )
      return;
    const guest = eligibleBots.find((bot) => bot.id === startGuestId);
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
    stopStudioSoundcheck();
    setStudioLayoutEditorOpen(false);
    stopIntroPreview();
    onPrepareUtterance?.();
    const { controller, runId } = beginEpisodeOperation();
    const selectedModelOption =
      responseMode !== "auto" && episodeModelDraft
        ? (modelOptions.find((option) => option.id === episodeModelDraft) ??
          null)
      : null;
    const episodeProvider =
      selectedModelOption?.provider ??
      accountDefaultModelOption?.provider ??
      preferredProvider;
    let warmupWasNeeded = false;
    let preparationPending = true;
    const preparation = waitForModelPreparation({
      request,
      provider: episodeProvider,
      model: selectedModelOption?.id ?? accountDefaultModel,
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
    });
    const preRoll: SignalEpisodePreRoll = {
      showId: selectedShow.id,
      showName: selectedShow.name,
      guestName: producerGuest ? producerName : guest!.name,
      topic: producerGuest
        ? producerGuestWantsSurprise
          ? "Host’s choice"
          : "Synthesizing your interview"
        : startTopic.trim(),
      phase: "preparing",
      source: selectedShow.introAudio.source,
    };
    preRollSkipRequestedRef.current = false;
    setEpisodePreRoll(preRoll);
    const introPlayback = playSignalIntroAudio({
      ...signalIntroIdentityForShow(selectedShow, hostBot),
      introAudio: selectedShow.introAudio,
      enabled: introAudioEnabled,
      volume: introAudioVolume,
      startDelayMs: SIGNAL_EPISODE_INTRO_LEAD_IN_MS,
    });
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const visualMinimum = new Promise<void>((resolve) => {
      let settled = false;
      const timer = window.setTimeout(
        finish,
        reducedMotion ? 1_100 : SIGNAL_EPISODE_PRE_ROLL_MIN_MS,
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
      setEpisodePreRoll(null);
      stopSignalIntroAudio();
    });
    setBusy(true);
    setError(null);
    let unstartedEpisodeId: string | null = null;
    let openingMessageReceived = false;
    try {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/episodes`,
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
                  guestBotId: startGuestId,
                  topic: startTopic,
                  producerBrief: startProducerBrief,
                }),
            preferredProvider: episodeProvider,
            responseMode,
            modelOverride: selectedModelOption?.id ?? accountDefaultModel,
            durationMinutes: episodeDurationDraft,
          }),
        },
      );
      if (!episodeOperationIsCurrent(controller, runId)) return;
      unstartedEpisodeId = response.episode.id;
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
        setEpisodePreRoll(null);
        stopSignalIntroAudio();
        return;
      }
      if (!signalModelWarmupVisibleRef.current) {
        assignSignalModelWarmup(null);
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
      setTopicDraft("");
      setProducerBriefDraft("");
      setProducerGuestContextDraft("");
      setEpisodeModelDraft("");
      setAskAboutDraft("");
      void loadEpisodes(selectedShow.id).catch(() => undefined);
      setEpisode(opening.episode);
      setAutoRun(true);
      prepareEpisodeMessage(opening.message, opening.episode);
      await releaseSignalModelWarmup(opening.episode.id);
      await Promise.all([introPlayback.finished, visualMinimum]);
      if (!episodeOperationIsCurrent(controller, runId)) return;
      setEpisodePreRoll((current) =>
        current?.showId === selectedShow.id
        ? { ...current, phase: "landing" }
          : current,
      );
      await new Promise<void>((resolve) =>
        window.setTimeout(
        resolve,
        preRollSkipRequestedRef.current || reducedMotion ? 90 : 460,
        ),
      );
      if (!episodeOperationIsCurrent(controller, runId)) return;
      setEpisodePreRoll(null);
      stopSignalIntroAudio();
      await playPreparedEpisodeMessage(
        opening.message,
        opening.episode,
        controller,
        runId,
      );
    } catch (startError) {
      if (episodeOperationIsCurrent(controller, runId)) {
        preRollGateResolveRef.current?.();
        preRollGateResolveRef.current = null;
        stopSignalIntroAudio();
        setEpisodePreRoll(null);
        setAutoRun(false);
        if (unstartedEpisodeId && signalModelWarmupRef.current) {
          await releaseSignalModelWarmup(unstartedEpisodeId);
        }
        if (unstartedEpisodeId && !openingMessageReceived) {
          // Keep the failed start available in Signal so the Producer can
          // retry it or finish it through the same graceful Cut show path.
          void loadEpisodes(selectedShow.id).catch(() => undefined);
        }
        setError(signalErrorToast("Start Signal episode", startError));
      }
    } finally {
      if (episodeOperationIsCurrent(controller, runId)) {
        preRollGateResolveRef.current = null;
        episodeOperationAbortRef.current = null;
        setBusy(false);
      }
    }
  };

  const skipEpisodePreRoll = (): void => {
    preRollSkipRequestedRef.current = true;
    preRollGateResolveRef.current?.();
    preRollGateResolveRef.current = null;
    stopSignalIntroAudio();
  };

  const cacheListenerReactionPlan = useCallback(
    (currentEpisode: BotcastEpisode, message: BotcastMessage): void => {
      const plan = botcastListenerReactionForMessage(
        currentEpisode.events,
        message.id,
      );
      if (!plan) return;
      listenerReactionPlanByMessageIdRef.current.set(message.id, plan);
      const listener = botsById.get(plan.listenerBotId);
      if (listener) onPrefetchListenerReaction?.(plan, listener);
    },
    [botsById, onPrefetchListenerReaction],
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

  const fireLiveListenerReaction = useCallback(
    (message: BotcastMessage, elapsedMs: number, durationMs: number): void => {
      const plan = listenerReactionPlanByMessageIdRef.current.get(message.id);
      if (!plan) return;
      if (botPowerResponseIsSilentV1(message.content)) return;
      const atMs =
        listenerReactionAtMsByMessageIdRef.current.get(message.id) ??
        armListenerReactionTiming(message, durationMs);
      if (atMs === null || elapsedMs < atMs) return;
      if (liveListenerReactionFiredRef.current.has(message.id)) return;
      liveListenerReactionFiredRef.current.add(message.id);
      if (!listenerReactionHasCrosstalkAudio(plan)) return;
      const listener = botsById.get(plan.listenerBotId);
      if (listener) {
        const listenerRole =
          selectedShow?.hostBotId === listener.id ? "host" : "guest";
        void Promise.resolve(
          onListenerReaction?.(
            plan,
            listener,
            signalStudioVoicePan(selectedShow?.studioLayout, listenerRole),
            signalInterruptedSpeakerRetortDelayMs(
              plan,
              elapsedMs,
              durationMs,
            ),
            message.episodeId,
          ),
        );
      }
    },
    [armListenerReactionTiming, botsById, onListenerReaction, selectedShow],
  );

  const fireReplayListenerReaction = useCallback(
    (message: BotcastMessage, elapsedMs: number, durationMs: number): void => {
      const plan = listenerReactionPlanByMessageIdRef.current.get(message.id);
      if (!plan) return;
      if (botPowerResponseIsSilentV1(message.content)) return;
      const atMs =
        listenerReactionAtMsByMessageIdRef.current.get(message.id) ??
        armListenerReactionTiming(message, durationMs);
      if (atMs === null) return;
      if (elapsedMs < atMs) {
        replayListenerReactionFiredRef.current.delete(message.id);
        return;
      }
      if (replayListenerReactionFiredRef.current.has(message.id)) return;
      replayListenerReactionFiredRef.current.add(message.id);
      if (!listenerReactionHasCrosstalkAudio(plan)) return;
      const listener = botsById.get(plan.listenerBotId);
      if (listener) {
        const listenerRole =
          selectedShow?.hostBotId === listener.id ? "host" : "guest";
        void Promise.resolve(
          onListenerReaction?.(
            plan,
            listener,
            signalStudioVoicePan(selectedShow?.studioLayout, listenerRole),
            signalInterruptedSpeakerRetortDelayMs(
              plan,
              elapsedMs,
              durationMs,
            ),
          ),
        );
      }
    },
    [armListenerReactionTiming, botsById, onListenerReaction, selectedShow],
  );

  const revealUtteranceWithoutAudio = useCallback(
    async (
      message: BotcastMessage,
      onProgress?: (elapsedMs: number, durationMs: number) => void,
    ): Promise<void> => {
      const messageId = message.id;
      const pacingText = botPowerResponseIsSilentV1(message.content)
        ? message.content
        : (message.stageActionText ?? message.content);
      const durationMs = Math.max(
        message.stageActionText ? 1_800 : 0,
        botcastSignalStandardCadenceDurationMs(pacingText),
      );
      armListenerReactionTiming(message, durationMs);
      setLiveSpeech({
        messageId,
        reveal: startBotcastSpeechReveal({
          text: message.content,
          durationMs,
        }),
      });
      const startedAt = performance.now();
      while (activeSpeechMessageIdRef.current === messageId) {
        const elapsedMs = Math.min(durationMs, performance.now() - startedAt);
        onProgress?.(elapsedMs, durationMs);
        fireLiveListenerReaction(message, elapsedMs, durationMs);
        setLiveSpeech((current) =>
          current?.messageId === messageId
          ? {
              ...current,
              reveal: updateBotcastSpeechReveal(current.reveal, elapsedMs),
            }
            : current,
        );
        if (elapsedMs >= durationMs) break;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
      }
      if (activeSpeechMessageIdRef.current !== messageId) return;
      setLiveSpeech((current) =>
        current?.messageId === messageId
        ? { ...current, reveal: finishBotcastSpeechReveal(current.reveal) }
          : current,
      );
    },
    [armListenerReactionTiming, fireLiveListenerReaction],
  );

  const prepareEpisodeMessage = useCallback(
    (message: BotcastMessage, currentEpisode: BotcastEpisode): void => {
      activeSpeechMessageIdRef.current = message.id;
      setAnticipatingSpeakerRole(null);
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
        onPrefetchUtterance?.(message, bot);
      }
      setLiveSpeech({
        messageId: message.id,
        reveal: prepareBotcastSpeechReveal(message.content),
      });
      setSpeakingMessageId(message.id);
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
      onPlaybackStart?: () => void,
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
      const playbackMessage = primarySpokenContent === message.content
        ? message
        : { ...message, content: primarySpokenContent };
      let playbackStarted = false;
      let playbackStartNotified = false;
      let voicePreparationTimer: number | null = null;
      let voiceCompletionTimer: number | null = null;
      let settleVoicePlayback: ((value: boolean) => void) | null = null;
      let followingTurnPrepared = false;
      const notifyPlaybackStart = (): void => {
        if (playbackStartNotified) return;
        playbackStartNotified = true;
        if (
          currentEpisode.guestKind === "producer" &&
          message.speakerRole === "guest" &&
          message.botId === BOTCAST_PRODUCER_GUEST_ID
        ) {
          onProducerGuestActionSfx?.(message);
        }
        onPlaybackStart?.();
        prepareFollowingBotTurn();
      };
      const prepareFollowingBotTurn = (): void => {
        if (
          !prepareFollowingTurn ||
          followingTurnPrepared ||
          pendingCutRef.current !== null
        )
          return;
        followingTurnPrepared = true;
        prepareFollowingBotResponseRef.current(currentEpisode, message);
      };
      const lifecycle: VoicePlaybackLifecycle = {
        onStart: (durationMs, alignment) => {
          if (
            activeSpeechMessageIdRef.current !== message.id ||
            !episodeOperationIsCurrent(controller, runId)
          )
            return;
          if (voicePreparationTimer !== null) {
            window.clearTimeout(voicePreparationTimer);
            voicePreparationTimer = null;
          }
          playbackStarted = true;
          notifyPlaybackStart();
          clearLiveCameraPostSpeechHold();
          const resolvedDurationMs =
            durationMs ?? Math.max(720, message.content.length * 34);
          if (voiceCompletionTimer !== null) {
            window.clearTimeout(voiceCompletionTimer);
          }
          voiceCompletionTimer = window.setTimeout(() => {
            onStopUtterance?.();
            settleVoicePlayback?.(false);
          }, resolvedDurationMs + SIGNAL_VOICE_COMPLETION_GRACE_MS);
          armListenerReactionTiming(message, resolvedDurationMs, alignment);
          setLiveSpeech({
            messageId: message.id,
            reveal: startBotcastSpeechReveal({
              text: message.content,
              durationMs: resolvedDurationMs,
              alignment,
            }),
          });
        },
        onProgress: (elapsedMs, durationMs) => {
          if (
            activeSpeechMessageIdRef.current !== message.id ||
            !episodeOperationIsCurrent(controller, runId)
          )
            return;
          if (
            elapsedMs / Math.max(1, durationMs) >=
            SIGNAL_HOST_CUE_REDIRECT_LATEST_PROGRESS
          ) {
            prepareFollowingBotTurn();
          }
          fireLiveListenerReaction(message, elapsedMs, durationMs);
          setLiveSpeech((current) => {
            if (!current || current.messageId !== message.id) return current;
            // A progress callback may arrive ahead of a browser audio start
            // event. It is timing data, not proof that speech is audible.
            if (current.reveal.phase === "preparing") return current;
            return {
              ...current,
              reveal: updateBotcastSpeechReveal(current.reveal, elapsedMs),
            };
          });
        },
        onEnd: () => {
          if (
            activeSpeechMessageIdRef.current !== message.id ||
            !episodeOperationIsCurrent(controller, runId)
          )
            return;
          prepareFollowingBotTurn();
          setLiveSpeech((current) =>
            current?.messageId === message.id
              ? {
                  ...current,
                  reveal: finishBotcastSpeechReveal(current.reveal),
                }
              : current,
          );
          settleVoicePlayback?.(true);
        },
      };
      const played =
        bot &&
        !bot.muted &&
        botcastMessageIsAudibleToAudienceV1(message) &&
        !botPowerResponseIsSilentV1(message.content) &&
        onUtterance
        ? await new Promise<boolean>((resolve) => {
            let settled = false;
            const settle = (value: boolean): void => {
              if (settled) return;
              settled = true;
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
            voicePreparationTimer = window.setTimeout(() => {
              onStopUtterance?.();
              settle(false);
            }, SIGNAL_VOICE_START_TIMEOUT_MS);
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
              ),
            ).then(settle, () => settle(false));
          })
        : false;
      if (
        activeSpeechMessageIdRef.current !== message.id ||
        !episodeOperationIsCurrent(controller, runId)
      )
        return;
      if (!played && !playbackStarted) {
        notifyPlaybackStart();
        await revealUtteranceWithoutAudio(message, (elapsedMs, durationMs) => {
          if (
            elapsedMs / Math.max(1, durationMs) >=
            SIGNAL_HOST_CUE_REDIRECT_LATEST_PROGRESS
          ) {
            prepareFollowingBotTurn();
          }
        });
      } else {
        setLiveSpeech((current) =>
          current?.messageId === message.id
          ? { ...current, reveal: finishBotcastSpeechReveal(current.reveal) }
            : current,
        );
      }
      if (activeSpeechMessageIdRef.current === message.id) {
        prepareFollowingBotTurn();
        holdLiveCameraAfterSpeech(message.speakerRole);
        activeSpeechMessageIdRef.current = null;
        setSpeakingMessageId(null);
        setLiveSpeech(null);
      }
    },
    [
      botsById,
      armListenerReactionTiming,
      clearLiveCameraPostSpeechHold,
      episodeOperationIsCurrent,
      fireLiveListenerReaction,
      holdLiveCameraAfterSpeech,
      onStopUtterance,
      onProducerGuestActionSfx,
      onUtterance,
      revealUtteranceWithoutAudio,
      selectedShow,
    ],
  );
  prepareEpisodeMessageRef.current = prepareEpisodeMessage;
  playPreparedEpisodeMessageRef.current = playPreparedEpisodeMessage;

  const prepareFollowingBotResponse = useCallback(
    (currentEpisode: BotcastEpisode, message: BotcastMessage): void => {
      preparedAdvanceRef.current?.controller.abort();
      preparedAdvanceRef.current = null;
      setAnticipatingSpeakerRole(null);
      const nextSpeakerRole = signalNextSpeakerRole(currentEpisode);
      if (
        currentEpisode.status === "completed" ||
        currentEpisode.guestKind === "producer" ||
        nextSpeakerRole === null
      )
        return;
      setAnticipatingSpeakerRole(nextSpeakerRole);
      const controller = new AbortController();
      const prepared: PreparedBotcastAdvance = {
        episodeId: currentEpisode.id,
        afterMessageId: message.id,
        controller,
        settled: false,
        warming: false,
        warmupModel: currentEpisode.model,
        warmupStartedAt: null,
        warmupFailure: null,
        result: Promise.resolve({
          ok: false as const,
          error: new Error("Not started"),
        }),
      };
      prepared.result = waitForModelPreparation({
        request,
        provider: currentEpisode.provider,
        model: currentEpisode.model,
        experience: "signal",
        signal: controller.signal,
        onStatus: (status) => {
          prepared.warming ||= status.state === "warming";
          prepared.warmupModel = status.model;
          prepared.warmupStartedAt = status.startedAt;
          prepared.warmupFailure = status.failure;
        },
      })
        .then((status) => {
          if (status.state === "unavailable") {
            throw new Error("The local model could not get ready.");
          }
          return request<BotcastEpisodeAdvanceResponse>(
            `/api/botcast/episodes/${encodeURIComponent(currentEpisode.id)}/advance`,
            {
              method: "POST",
              signal: controller.signal,
              body: JSON.stringify({ theme }),
            },
          );
        })
        .then(
          (response) => {
            if (response.message) {
              let bot = botsById.get(response.message.botId);
              if (bot) {
                bot = botWithIdentityBeforeMessage(
                  bot,
                  response.episode,
                  response.message,
                );
              }
              if (
                bot &&
                !bot.muted &&
                botcastMessageIsAudibleToAudienceV1(response.message) &&
                !botPowerResponseIsSilentV1(response.message.content)
              ) {
                onPrefetchUtterance?.(response.message, bot);
              }
            }
            return { ok: true as const, response };
          },
          (error: unknown) => ({ ok: false as const, error }),
        )
        .finally(() => {
          prepared.settled = true;
        });
      preparedAdvanceRef.current = prepared;
    },
    [botsById, onPrefetchUtterance, request, theme],
  );
  prepareFollowingBotResponseRef.current = prepareFollowingBotResponse;

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
        episode.status === "completed" ||
        advanceInFlightRef.current
      )
        return false;
      const queuedCue =
        !producerGuestMessage &&
        episode.guestKind !== "producer" &&
        !cue &&
        botcastNextSpeakerRole({
          messages: episode.messages,
          segment: episode.segment,
          guestDeparted: guestHasDeparted(episode),
        }) === "host"
          ? queuedProducerCueRef.current
          : null;
      const requestedCue = cue ?? queuedCue ?? undefined;
      advanceInFlightRef.current = true;
      const { controller, runId } = beginEpisodeOperation();
      setBusy(true);
      setError(null);
      const interruptionBridgePlayback = interruptionBridgeMessage
        ? (() => {
            prepareEpisodeMessage(interruptionBridgeMessage, episode);
            const interrupter = interruptionCrosstalkPlan
              ? botsById.get(interruptionCrosstalkPlan.listenerBotId)
              : null;
            return playPreparedEpisodeMessage(
              interruptionBridgeMessage,
              episode,
              controller,
              runId,
              false,
              interruptionCrosstalkPlan && interrupter
                ? () => {
                    void Promise.resolve(
                      onListenerReaction?.(
                        interruptionCrosstalkPlan,
                        interrupter,
                        signalStudioVoicePan(
                          selectedShow?.studioLayout,
                          "host",
                        ),
                        undefined,
                        episode.id,
                      ),
                    );
                  }
                : undefined,
            );
          })()
        : null;
      try {
        const lastVisibleMessageId = episode.messages.at(-1)?.id ?? null;
        const prepared =
          !requestedCue &&
          !producerGuestMessage &&
          !producerGuestHostInterruption &&
          preparedAdvanceRef.current?.episodeId === episode.id &&
            preparedAdvanceRef.current.afterMessageId === lastVisibleMessageId
          ? preparedAdvanceRef.current
          : null;
        let warmupHoldActive = false;
        if (prepared?.warming && !prepared.settled) {
          warmupHoldActive = true;
          signalModelWarmupVisibleRef.current = true;
          assignSignalModelWarmup({
            phase: "held",
            model: prepared.warmupModel,
            startedAt: prepared.warmupStartedAt,
            failure: prepared.warmupFailure,
            initial: false,
            episodeId: episode.id,
          });
          await setPersistedSignalModelWarmupHold(episode.id, true);
        }
        const preparedResult = prepared ? await prepared.result : null;
        if (preparedAdvanceRef.current === prepared) {
          preparedAdvanceRef.current = null;
        }
        if (preparedResult && !preparedResult.ok && prepared?.warmupFailure) {
          signalModelWarmupVisibleRef.current = true;
          assignSignalModelWarmup({
            phase: "failed",
            model: prepared.warmupModel,
            startedAt: prepared.warmupStartedAt,
            failure: prepared.warmupFailure,
            initial: false,
            episodeId: episode.id,
          });
          setAnticipatingSpeakerRole(null);
          setAutoRun(false);
          return false;
        }
        if (preparedResult && !preparedResult.ok) throw preparedResult.error;
        let directHoldStart: Promise<BotcastEpisode> | null = null;
        if (
          !preparedResult &&
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
                directHoldStart ??= setPersistedSignalModelWarmupHold(
                  episode.id,
                  true,
                );
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
          if (directHoldStart) await directHoldStart;
          if (preparationStatus.state === "unavailable") {
            signalModelWarmupVisibleRef.current = true;
            setAnticipatingSpeakerRole(null);
            setAutoRun(false);
            return false;
          }
        }
        const response =
          preparedResult?.response ??
          (await request<BotcastEpisodeAdvanceResponse>(
            `/api/botcast/episodes/${encodeURIComponent(episode.id)}/advance`,
            {
              method: "POST",
              signal: controller.signal,
              body: JSON.stringify({
                theme,
                ...(requestedCue ? { cue: requestedCue } : {}),
                ...(requestedCue ? { cueDelivery } : {}),
                ...(hostRedirect ? { hostRedirect } : {}),
                ...(guestInterruption ? { guestInterruption } : {}),
                ...(producerGuestMessage
                  ? { guestMessage: producerGuestMessage }
                  : {}),
                ...(producerGuestThinkingMs !== undefined
                  ? { guestThinkingMs: producerGuestThinkingMs }
                  : {}),
                ...(producerGuestHostInterruption
                  ? { producerGuestHostInterruption }
                  : {}),
              }),
            },
          ));
        if (interruptionBridgePlayback) {
          await interruptionBridgePlayback;
          if (pendingCutRef.current) return true;
        }
        if (!episodeOperationIsCurrent(controller, runId)) return false;
        if (requestedCue && queuedProducerCueRef.current === requestedCue) {
          assignQueuedProducerCue(null);
        }
        if (warmupHoldActive || signalModelWarmupRef.current) {
          await releaseSignalModelWarmup(response.episode.id);
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
          setEpisode(stagedEpisode);
          prepareEpisodeMessage(submittedProducerTurn, stagedEpisode);
          await playPreparedEpisodeMessage(
            submittedProducerTurn,
            stagedEpisode,
            controller,
            runId,
            false,
          );
          if (!episodeOperationIsCurrent(controller, runId)) return false;
          if (pendingCutRef.current) return true;
        }
        setEpisode(response.episode);
        if (response.message) {
          const message = response.message;
          prepareEpisodeMessage(message, response.episode);
          await playPreparedEpisodeMessage(
            message,
            response.episode,
            controller,
            runId,
          );
        }
        if (response.episode.status === "completed") {
          setAnticipatingSpeakerRole(null);
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
        if (episodeOperationIsCurrent(controller, runId)) {
          if (signalModelWarmupRef.current) {
            await releaseSignalModelWarmup(episode.id);
          }
          if (activeSpeechMessageIdRef.current !== null) stopUtterance();
          setAnticipatingSpeakerRole(null);
          setAutoRun(false);
          setError(signalErrorToast("Advance Signal episode", advanceError));
        }
        return false;
      } finally {
        if (episodeOperationIsCurrent(controller, runId)) {
          episodeOperationAbortRef.current = null;
          setBusy(false);
          advanceInFlightRef.current = false;
        }
      }
    },
    [
      beginEpisodeOperation,
      botsById,
      episode,
      assignQueuedProducerCue,
      assignSignalModelWarmup,
      episodeOperationIsCurrent,
      loadEpisodes,
      onListenerReaction,
      playEpisodeOutro,
      playPreparedEpisodeMessage,
      prepareEpisodeMessage,
      releaseSignalModelWarmup,
      request,
      selectedShow,
      selectedShowId,
      stopUtterance,
      setPersistedSignalModelWarmupHold,
      theme,
    ],
  );

  const producerGuestHostInterruption =
    signalProducerGuestHostInterruptionContext({
      episode,
      speakingMessageId,
      liveSpeech,
    });

  const interruptProducerGuestHostLocally = (
    interruption: BotcastHostRedirectContext,
  ): void => {
    if (!episode) return;
    invalidateEpisodeOperation();
    setEpisode({
      ...episode,
      messages: episode.messages.map((message) =>
        message.id === interruption.messageId
          ? {
              ...message,
              content: interruption.spokenContent,
              voicePerformanceText: null,
            }
          : message,
      ),
    });
  };

  const shushProducerGuestHost = async (): Promise<void> => {
    if (!producerGuestHostInterruption) return;
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

  const submitProducerGuestAnswer = async (): Promise<void> => {
    if (
      !episode ||
      episode.guestKind !== "producer" ||
      episode.status !== "live" ||
      (speakingMessageId !== null && !producerGuestHostInterruption)
    )
      return;
    const answer = producerGuestAnswerDraft.trim();
    if (!answer) return;
    const nextRole = botcastNextSpeakerRole({
      messages: episode.messages,
      segment: episode.segment,
      guestDeparted: false,
    });
    if (nextRole !== "guest" || (busy && !producerGuestHostInterruption)) return;
    const thinkingEndedAtMs = Date.now();
    const thinkingStartedAtMs =
      producerGuestThinkingStartedAtRef.current ?? thinkingEndedAtMs;
    const guestThinkingMs = Math.max(
      0,
      thinkingEndedAtMs - thinkingStartedAtMs,
    );
    producerGuestThinkingEndedAtRef.current = thinkingEndedAtMs;
    if (producerGuestHostInterruption) {
      interruptProducerGuestHostLocally(producerGuestHostInterruption);
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
      producerGuestHostInterruption ?? undefined,
    );
    if (sent) {
      setProducerGuestAnswerDraft("");
      producerGuestThinkingStartedAtRef.current = null;
      producerGuestThinkingEndedAtRef.current = null;
    } else {
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
      episode.status === "completed" ||
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

  const sendCue = (cue: BotcastProducerCue): void => {
    if (!episode || episode.status !== "live" || episode.segment === "closing")
      return;
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
      assignQueuedProducerCue(cue);
      setAutoRun(true);
      onPrepareUtterance?.();
      void advanceEpisode(cue, "redirect_host", {
        messageId: activeHostMessage.id,
        spokenContent,
      });
      return;
    }
    assignQueuedProducerCue(cue);
    setAutoRun(true);
    const nextRole = botcastNextSpeakerRole({
      messages: episode.messages,
      segment: episode.segment,
      guestDeparted: guestHasDeparted(episode),
    });
    if (!busy && speakingMessageId === null && nextRole === "host") {
      onPrepareUtterance?.();
      void advanceEpisode(cue);
    }
  };

  const interruptGuestWithQueuedCue = (): void => {
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
      (!activeGuestOnMic && (busy || speakingMessageId !== null || !guestIsNext))
    )
      return;
    if (activeGuestOnMic) {
      invalidateEpisodeOperation();
    }
    const optimisticMessages = activeGuestMessage
      ? episode.messages
          .filter(
            (message) =>
              message.id !== activeGuestMessage.id || interruptedContent,
          )
          .map((message) =>
            message.id === activeGuestMessage.id && interruptedContent
              ? {
                  ...message,
                  content: nextHostInterruptionCrosstalkPlan?.interruptedSpeakerCue
                    ? appendBotCrosstalkInterruptedSpeakerCue(
                        interruptedContent,
                        nextHostInterruptionCrosstalkPlan.interruptedSpeakerCue,
                      )
                    : interruptedContent,
                  voicePerformanceText: null,
                }
              : message,
          )
      : episode.messages;
    const optimisticEpisode = {
      ...episode,
      messages: [...optimisticMessages, nextHostInterruptionBridge],
    };
    setEpisode(optimisticEpisode);
    // Cancelling an active guest deliberately disables auto-run. The queued
    // interruption is still a live handoff, so resume the normal turn loop
    // after the host bridge and cue response finish.
    setAutoRun(true);
    setHostInterruptionOrdinal((current) => current + 1);
    onPrepareUtterance?.();
    void advanceEpisode(
      cue,
      "interrupt_guest",
      undefined,
      {
        bridgeLine: nextHostInterruptionBridge.content,
        ...(activeGuestMessage
          ? {
              messageId: activeGuestMessage.id,
              spokenContent,
              ...(nextHostInterruptionCrosstalkPlan?.interruptedSpeakerCue
                ? {
                    interruptedSpeakerCue:
                      nextHostInterruptionCrosstalkPlan.interruptedSpeakerCue,
                  }
                : {}),
            }
          : {}),
      },
      nextHostInterruptionBridge,
      undefined,
      undefined,
      undefined,
      nextHostInterruptionCrosstalkPlan ?? undefined,
    );
  };

  const prepareSignalEpisodeVideo = async (
    detail: BotcastEpisode,
    show: BotcastShow,
    existing: ReplayRecordingV1 | null,
  ): Promise<void> => {
    let recording = existing;
    const currentRenderContract =
      recording?.manifest?.visual.metadata?.renderContract ===
      "signal-studio-dom-v2";
    if (!recording || !currentRenderContract) {
      recording = await queueReplayManifest(
        buildSignalReplayManifestV1({
          episode: detail,
          show,
          bots: eligibleBots,
          producerName,
          theme,
        }),
      );
    } else if (
      recording.status === "failed" ||
      recording.status === "collecting" ||
      ((recording.status === "ready" ||
        recording.status === "ready_with_warnings") &&
        !recording.videoUrl)
    ) {
      recording = await retryReplayRecording(recording.id);
    }
    handleReplayRecordingChange(detail.id, recording);
    setEpisode(null);
    setReplayEpisode(null);
    setReplayRenderTarget({ episode: detail, show });
    setNotice(
      recording.status === "rendering" ||
        recording.status === "preparing_audio"
        ? `“${detail.title}” is rendering. Select it when the video is ready.`
        : `Rendering “${detail.title}”. Select it again when the video is ready.`,
    );
    window.dispatchEvent(new Event(REPLAY_RECORDING_CHANGED_EVENT));
  };

  const openReplay = async (summary: BotcastEpisodeSummary): Promise<void> => {
    invalidateEpisodeOperation();
    const archiveShow = selectedShow;
    const replayRunId = replayVoiceRunIdRef.current + 1;
    replayVoiceRunIdRef.current = replayRunId;
    replayVoiceMessageIdRef.current = null;
    setReplayVoicePending(false);
    setReplaySpeechActive(false);
    setLoading(true);
    setError(null);
    try {
      const existingRecording =
        summary.status === "completed"
          ? await replayRecordingForSource("signal", summary.id)
          : null;
      handleReplayRecordingChange(summary.id, existingRecording);
      const detail = await loadEpisode(
        summary.id,
        summary.status === "completed" ? "replay" : "live",
      );
      if (replayVoiceRunIdRef.current !== replayRunId) return;
      if (detail.status === "live") {
        setEpisode(detail);
        setReplayEpisode(null);
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
      if (
        !archiveShow ||
        !signalReplayRecordingHasVideo(existingRecording)
      ) {
        if (!archiveShow) {
          throw new Error("The episode's Signal show is not available.");
        }
        await prepareSignalEpisodeVideo(detail, archiveShow, existingRecording);
        return;
      }
      setReplayEpisode(detail);
      setReplayRenderTarget(null);
      setEpisode(null);
      setReplayElapsedMs(0);
      setReplayPlaying(false);
    } catch (replayError) {
      if (replayVoiceRunIdRef.current === replayRunId) {
        setError(signalErrorToast("Load Signal replay", replayError));
      }
    } finally {
      if (replayVoiceRunIdRef.current === replayRunId) setLoading(false);
    }
  };

  const openEpisodeContextMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    item: BotcastEpisodeSummary,
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    const opener = event.currentTarget;
    const recording = replayRecordingsByEpisodeId[item.id] ?? null;
    const entries: PrismMenuEntry[] = [
      {
        id: "open",
        icon: item.status === "live" ? <Radio /> : <Play />,
        label: signalEpisodeArchiveActionLabel(item, recording),
        onSelect: () => {
          closeMenu({ restoreFocus: false });
          void openReplay(item);
        },
      },
    ];
    if (item.status === "completed") {
      entries.push(
        {
          id: "copy-review",
          icon: <Copy />,
          label: "Copy for Signal Review",
          onSelect: async () => {
            try {
              const detail = await loadEpisode(item.id, "replay");
              await copyEpisodeForReview(detail);
            } catch (copyError) {
              setError(signalErrorToast("Copy Signal episode", copyError));
            }
          },
        },
        { id: "delete-separator", kind: "separator" },
        {
          id: "delete",
          icon: <Trash2 />,
          label: "Delete episode",
          tone: "danger",
          onSelect: () => {
            closeMenu({ restoreFocus: false });
            openEpisodeDeletion(item, opener);
          },
        },
      );
    }
    openMenu({
      id: `signal-episode-actions-${item.id}`,
      label: `${item.title} episode actions`,
      anchor:
        event.clientX === 0 && event.clientY === 0
          ? {
              kind: "element",
              element: opener,
              preferredPlacement: "bottom-start",
            }
          : {
              kind: "pointer",
              x: event.clientX,
              y: event.clientY,
            },
      accent: selectedShow?.accentColor ?? "#8fb7ff",
      theme,
      minWidth: 224,
      focusRestoreTarget: opener,
      entries,
    });
  };

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
  const replayDurationMs = replayTimeline.durationMs;
  const replayPerceptionOverlaps = useMemo(
    () => botcastPerceptionOverlapEventsV1(replayEpisode?.events ?? []),
    [replayEpisode?.events],
  );
  useEffect(() => {
    if (!replayEpisode || !replayPlaying || replayVoicePending) return;
    const timer = window.setInterval(() => {
      setReplayElapsedMs((current) => {
        const next = Math.min(replayDurationMs, current + 100);
        if (next >= replayDurationMs) setReplayPlaying(false);
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [replayDurationMs, replayEpisode, replayPlaying, replayVoicePending]);
  useEffect(() => {
    if (!replayEpisode) return;
    if (!replayPlaying) {
      if (replayElapsedMs < replaySoundboardPreviousElapsedMsRef.current) {
        replaySoundboardFiredEventIdsRef.current.clear();
      }
      replaySoundboardPreviousElapsedMsRef.current = replayElapsedMs - 1;
      return;
    }
    const previousElapsedMs = replaySoundboardPreviousElapsedMsRef.current;
    if (replayElapsedMs < previousElapsedMs) {
      replaySoundboardFiredEventIdsRef.current.clear();
    }
    for (const cue of signalSoundboardEventsBetween({
      events: replayEpisode.events,
      previousElapsedMs:
        replayElapsedMs < previousElapsedMs ? -1 : previousElapsedMs,
      elapsedMs: replayElapsedMs,
    })) {
      if (replaySoundboardFiredEventIdsRef.current.has(cue.eventId)) continue;
      replaySoundboardFiredEventIdsRef.current.add(cue.eventId);
      playSignalSoundboardCue(cue.kind, {
        variantIndex: cue.variantIndex,
        studioController: signalAtmosphereControllerRef.current,
      });
    }
    replaySoundboardPreviousElapsedMsRef.current = replayElapsedMs;
  }, [replayElapsedMs, replayEpisode, replayPlaying]);

  const replayMessageIndex = botcastReplayMessageIndexAt(
    replayTimeline.messageStartMs,
    replayElapsedMs,
    replayTimeline.messageEndMs,
  );
  const replayActiveMessage =
    replayEpisode?.messages[replayMessageIndex] ?? null;
  const replayActiveMessageIndexes = replayEpisode
    ? replayEpisode.messages.flatMap((_, index) =>
        replayElapsedMs >= (replayTimeline.messageStartMs[index] ?? 0) &&
        replayElapsedMs < (replayTimeline.messageEndMs[index] ?? 0)
          ? [index]
          : [],
      )
    : [];
  const replayOverlapForActiveMessage = replayActiveMessage
    ? replayPerceptionOverlaps.find(
        (overlap) =>
          overlap.overlappingMessageId === replayActiveMessage.id,
      ) ?? null
    : null;
  const replayActiveMessageIsOverlap = Boolean(
    replayOverlapForActiveMessage &&
    replayEpisode?.messages.some(
      (message, index) =>
        message.id === replayOverlapForActiveMessage.precedingMessageId &&
        replayActiveMessageIndexes.includes(index),
    ),
  );
  const replayActiveMessageWillBeOverlapped = Boolean(
    replayActiveMessage &&
    replayPerceptionOverlaps.some(
      (overlap) => overlap.precedingMessageId === replayActiveMessage.id,
    ),
  );
  useEffect(() => {
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
    }
  }, [
    armListenerReactionTiming,
    cacheListenerReactionPlan,
    fireReplayListenerReaction,
    replayActiveMessage,
    replayDurationMs,
    replayElapsedMs,
    replayEpisode,
    replayMessageIndex,
    replayPlaying,
    replayTimeline.messageStartMs,
    replayTimeline.messageEndMs,
  ]);
  useEffect(() => {
    if (!replayPlaying || !replayActiveMessage) return;
    if (replayVoiceMessageIdRef.current === replayActiveMessage.id) return;
    replayVoiceMessageIdRef.current = replayActiveMessage.id;
    if (
      replayEpisode?.guestKind === "producer" &&
      replayActiveMessage.speakerRole === "guest" &&
      replayActiveMessage.botId === BOTCAST_PRODUCER_GUEST_ID
    ) {
      onProducerGuestActionSfx?.(replayActiveMessage);
    }
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
    ) return;
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
          botcastVoiceLevelForBot(
            selectedShow?.voiceLevelsByBotId,
            bot.id,
          ),
          signalStudioVoicePan(
            selectedShow?.studioLayout,
            replayActiveMessage.speakerRole,
          ),
          {
            channel: replayActiveMessageIsOverlap ? "crosstalk" : "primary",
            mixGain:
              replayActiveMessageIsOverlap || replayActiveMessageWillBeOverlapped
                ? Math.SQRT1_2
                : 1,
          },
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
    onProducerGuestActionSfx,
    onUtterance,
    replayActiveMessage,
    replayDurationMs,
    replayMessageIndex,
    replayPlaying,
    replayEpisode,
    replayActiveMessageIsOverlap,
    replayActiveMessageWillBeOverlapped,
    replayTimeline.messageStartMs,
    replayTimeline.messageEndMs,
    selectedShow,
  ]);
  useEffect(() => {
    if (replayEpisode) return;
    replayVoiceMessageIdRef.current = null;
  }, [replayEpisode]);

  const stopReplayPlayback = (): void => {
    replayVoiceRunIdRef.current += 1;
    replayVoiceMessageIdRef.current = null;
    stopSignalSoundboardAudio(180, signalAtmosphereControllerRef.current);
    setReplayPlaying(false);
    setReplayVoicePending(false);
    setReplaySpeechActive(false);
    onStopUtterance?.();
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
                ...mix,
                background: DEFAULT_SIGNAL_ATMOSPHERE_MIX.background,
                foley: DEFAULT_SIGNAL_ATMOSPHERE_MIX.foley,
              })
            }
            disabled={isDefaultMix}
          >
            Reset
          </button>
        </div>
        <div className={styles.atmosphereMixerSliders}>
          {SIGNAL_ATMOSPHERE_BUSES.map(({ key, label }) => {
            const relativeLevel = signalAtmosphereRelativeMixLevel(
              key,
              mix,
            );
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
        const played = await onUtterance(
          message,
          bot,
          {
            onStart: (durationMs, alignment) => {
              if (studioSoundcheckRunIdRef.current !== runId) return;
              const resolvedDurationMs =
                durationMs ?? Math.max(720, message.content.length * 34);
              setStudioSoundcheckCaption({
                speakerName: bot.name,
                text: message.content,
              });
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
    replayFrame?: SignalReplayVideoFrameState;
    renderTheme?: "light" | "dark";
    stageRef?: Ref<HTMLElement>;
    cameraTransitions?: SignalCameraTransitionMode;
  }): React.JSX.Element => {
    const stageTheme = args.renderTheme ?? theme;
    const stageReplayEventElapsedMs =
      args.replayFrame?.eventElapsedMs ?? replayElapsedMs;
    const stageReplayVideoElapsedMs =
      args.replayFrame?.videoElapsedMs ?? replayElapsedMs;
    const stageReplayMessageIndex =
      args.replayFrame?.messageIndex ?? replayMessageIndex;
    const stageReplayActiveMessageIndexes =
      args.replayFrame?.activeMessageIndexes ?? replayActiveMessageIndexes;
    const stageReplayPlaying = args.replayFrame ? true : replayPlaying;
    const stageReplaySpeechActive = args.replayFrame
      ? stageReplayActiveMessageIndexes.length > 0
      : replaySpeechActive;
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
    const hostDeparted =
      recordedHostDeparture && !hostDepartureMonologueOnMic;
    const audienceParticipants =
      args.currentEpisode.audienceExperience?.participants;
    const observerParticipants =
      args.currentEpisode.observerProjection?.participants;
    const socialPressure = botcastStrongestNegativeSocialInfluenceAt({
      events: args.currentEpisode.events,
      elapsedMs: args.replay
        ? stageReplayEventElapsedMs
        : Number.POSITIVE_INFINITY,
    });
    const socialPressureSource = socialPressure
      ? socialPressure.sourceRole === "host"
        ? args.host
        : args.guest
      : null;
    const hostVisibleToAudience =
      !hostDeparted &&
      (observerParticipants
        ? observerParticipants.host.visibility !== "hidden"
        : audienceParticipants?.host.visible !== false);
    const guestVisibleToAudience =
      !guestDeparted &&
      (observerParticipants
        ? observerParticipants.guest.visibility !== "hidden"
        : audienceParticipants?.guest.visible !== false);
    const guestHiddenFromAudience =
      !guestDeparted && !guestVisibleToAudience;
    const guestPresentOnStage = guestVisibleToAudience;
    const thinkingRole = signalNextSpeakerRole(args.currentEpisode);
    const replayProducerGuestThinking = Boolean(
      args.replay &&
        args.currentEpisode.guestKind === "producer" &&
        replayTimeline.thinkingRanges.some(
          (range) =>
            stageReplayVideoElapsedMs >= range.startMs &&
            stageReplayVideoElapsedMs < range.endMs,
        ),
    );
    const liveProducerGuestThinking = Boolean(
      !args.replay &&
        args.currentEpisode.guestKind === "producer" &&
        args.currentEpisode.status === "live" &&
        !busy &&
        speakingMessageId === null &&
        thinkingRole === "guest",
    );
    const stageAtmosphere = activeShowAtmosphere(args.show, stageTheme);
    const studioMix = normalizeBotcastStudioAtmosphereMix(
      args.show.atmosphereMix,
    );
    const avatarSfxMixGain = sessionAtmosphereBusVolume({
      volume: introAudioVolume,
      mix: args.show.atmosphereMix,
      bus: "foley",
    });
    const studioLayout = normalizeBotcastStudioLayout(args.show.studioLayout);
    const replayMessageStartMs =
      args.replayFrame?.messageStartMs ??
      replayTimeline.messageStartMs[stageReplayMessageIndex] ??
      0;
    const replayMessageEndMs =
      args.replayFrame?.messageEndMs ??
      replayTimeline.messageEndMs[stageReplayMessageIndex] ??
      replayDurationMs;
    const speechReveal =
      !args.replay &&
      args.activeMessage &&
      liveSpeech?.messageId === args.activeMessage.id
        ? liveSpeech.reveal
        : null;
    const delayedLiveCaption =
      !args.replay &&
      args.activeMessage &&
      speechReveal?.phase === "playing" &&
      botcastMessageIsAudibleToAudienceV1(args.activeMessage) &&
      !botPowerResponseIsSilentV1(args.activeMessage.content)
        ? signalLiveCaptionText(speechReveal)
        : "";
    const delayedLiveCaptionSpeaker =
      args.activeMessage?.speakerRole === "host"
        ? (args.host?.name ?? "Host")
        : args.activeMessage?.speakerRole === "guest"
          ? (args.guest?.name ?? "Guest")
          : null;
    const speechElapsedMs = args.replay
      ? Math.max(0, stageReplayVideoElapsedMs - replayMessageStartMs)
      : (speechReveal?.elapsedMs ?? 0);
    const speechDurationMs = args.replay
      ? Math.max(1, replayMessageEndMs - replayMessageStartMs)
      : (speechReveal?.durationMs ?? 0);
    const speechProgress = Math.max(
      0,
      Math.min(1, speechElapsedMs / Math.max(1, speechDurationMs)),
    );
    const speechIsPlaying = args.replay
      ? stageReplayPlaying && stageReplaySpeechActive
      : speechReveal?.phase === "playing";
    const activeVoiceAction =
      args.activeMessage && (args.replay || speechReveal)
        ? signalVoicePerformanceActionPresentationAtProgress(
            args.activeMessage,
            speechProgress,
          )
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
    const listenerReactionSpokenCue = botPowerResponseIsSilentV1(
      args.activeMessage?.content,
    )
      ? null
      : listenerReactionPlan?.spokenCue;
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
    const roleIsListenerReacting = (role: "host" | "guest"): boolean =>
      Boolean(
        listenerReactionActive &&
        listenerReactionPlan?.listenerBotId ===
          (role === "host" ? args.host?.id : args.guest?.id),
      );
    const roleIsSpeaking = (role: "host" | "guest"): boolean =>
      args.replay
        ? Boolean(
            stageReplayPlaying &&
            stageReplayActiveMessageIndexes.some((index) => {
              const message = args.currentEpisode.messages[index];
              return Boolean(
                message &&
                message.speakerRole === role &&
                botcastMessageIsAudibleToAudienceV1(message) &&
                !botPowerResponseIsSilentV1(message.content),
              );
            }),
          )
        : Boolean(
            speechIsPlaying &&
              botcastMessageIsAudibleToAudienceV1(args.activeMessage ?? {}) &&
              !botPowerResponseIsSilentV1(args.activeMessage?.content) &&
              botcastSpeechRevealIsVoicing(speechReveal) !== false &&
              args.activeMessage?.speakerRole === role,
          );
    const roleIsAmbientVocalizing = (role: "host" | "guest"): boolean =>
      signalAmbientBotVocalization?.targetId === role;
    const roleMouthIsActive = (role: "host" | "guest"): boolean =>
      roleIsSpeaking(role) || roleIsAmbientVocalizing(role);
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
      const projected = observerParticipants?.[role].visibility;
      if (projected === "hidden" || projected === "translucent") {
        return projected;
      }
      if (projected === "visible") return null;
      const snapshot = botcastSnapshotPowersForRoleV1(
        args.currentEpisode,
        role,
      );
      return snapshot !== null
        ? botPowerAvatarVisibilityModeV1(snapshot)
        : (resolveAvatarVisibilityMode?.(bot) ?? null);
    };
    const manualProducerGuestSip = Boolean(
      !args.replay &&
        args.currentEpisode.guestKind === "producer" &&
        producerGuestSipActive,
    );
    const roleIsThinking = (role: "host" | "guest"): boolean =>
      !(role === "guest" && manualProducerGuestSip) &&
      ((role === "guest" &&
        (replayProducerGuestThinking || liveProducerGuestThinking)) ||
        (!args.replay &&
          ((speechReveal?.phase === "preparing" &&
            args.activeMessage?.speakerRole === role) ||
            (anticipatingSpeakerRole === role &&
              args.activeMessage?.speakerRole !== role) ||
            (busy && speakingMessageId === null && thinkingRole === role))));
    const episodeStartedAtCandidate = Date.parse(args.currentEpisode.startedAt);
    const episodeStartedAtMs = Number.isFinite(episodeStartedAtCandidate)
      ? episodeStartedAtCandidate
      : null;
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
      ? episodeStartedAtMs + stageReplayEventElapsedMs
      : liveEffectiveNowMs;
    const identityMirrorNowMs =
      args.replay && episodeStartedAtMs !== null
        ? episodeStartedAtMs +
          stageReplayEventElapsedMs +
          (args.currentEpisode.modelWarmupHoldDurationMs ?? 0)
        : signalStageNowMs;
    const identityMirrorStates = botcastIdentityMirrorStatesAtV1(
      args.currentEpisode.events,
      identityMirrorNowMs,
    );
    const botWithIdentityAtStageTime = (
      bot: BotcastBotSummary,
    ): BotcastBotSummary => {
      const identityMirrorState = identityMirrorStates.get(bot.id) ?? null;
      return {
        ...bot,
        identityMirrorState,
        identityMirrorTransitionActive: identityMirrorState
          ? botIdentityMirrorTransitionActiveV1(
              identityMirrorState,
              identityMirrorNowMs,
            )
          : false,
        identityMirrorTargetFaceActive: identityMirrorState
          ? identityMirrorNowMs >=
            Date.parse(identityMirrorState.occurredAt) +
              BOT_IDENTITY_MIRROR_TRANSITION_MS / 2
          : false,
      };
    };
    const cupVisual = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
    ): CoffeeCupVisualState | null => {
      const powerRateMultiplier = cupRateMultiplierForBot(bot);
      if (powerRateMultiplier <= 0) return null;
      const producerGuestRole =
        role === "guest" && args.currentEpisode.guestKind === "producer";
      return buildCoffeeCupVisualState({
        seed: `signal:${args.currentEpisode.id}:${bot.id}:${role}`,
        botColor: bot.color,
        theme: stageTheme,
        nowMs: cupNowMs,
        sessionStartedAtMs: episodeStartedAtMs,
        durationMinutes:
          args.currentEpisode.durationMinutes ??
          DEFAULT_COFFEE_SESSION_DURATION_MINUTES,
        powerRateMultiplier,
        ambientSipAllowed:
          !producerGuestRole &&
          roleIsSpeaking(role === "host" ? "guest" : "host"),
        speaking: roleIsSpeaking(role),
        thinking: roleIsThinking(role),
        ...(role === "guest" && manualProducerGuestSip
          ? { sippingOverride: true }
          : {}),
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
    const atmosphereStyle = {
      ["--botcast-accent" as string]: args.show.accentColor,
      ["--signal-film-grain-level" as string]: studioMix.filmGrain,
      ["--botcast-studio-accent" as string]: normalizeAccentForTheme(
        args.host?.color ?? args.show.accentColor,
        stageTheme,
      ),
      ...(socialPressureSource
        ? {
            ["--signal-power-accent" as string]: normalizeAccentForTheme(
              socialPressureSource.color ?? args.show.accentColor,
              stageTheme,
            ),
          }
        : {}),
      ["--botcast-camera-offset-x" as string]: `${botcastCameraOffsetXPercent(
        args.shot,
        studioLayout,
      )}%`,
      ["--botcast-camera-offset-y" as string]: `${botcastCameraOffsetYPercent(
        args.shot,
        studioLayout,
      )}%`,
      ...(stageAtmosphere.imageUrl
        ? {
            ["--botcast-atmosphere" as string]: `url("${stageAtmosphere.imageUrl}")`,
          }
        : {}),
      ...(signalStudioLightingStyle({
        show: args.show,
        layout: studioLayout,
        hostColor: args.host?.color ?? args.show.accentColor,
        guestColor: args.guest?.color ?? args.show.accentColor,
        theme: stageTheme,
        tuning: studioGlowTuning,
      }) ?? {}),
    } as CSSProperties;
    const avatar = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
      talking: boolean,
      thinking: boolean,
      sipping: boolean,
    ): ReactNode => {
      const ambientVocalizing = roleIsAmbientVocalizing(role);
      const primarySpeaking = roleIsSpeaking(role);
      const mouthShape = primarySpeaking && args.activeMessage
        ? voiceMode === "bottish"
          ? speechDurationMs > 0
            ? bottishMouthShapeAtAlignedElapsedMs({
                text: args.activeMessage.content,
                elapsedMs: speechElapsedMs,
                durationMs: speechDurationMs,
                alignment: speechReveal?.alignment,
              })
            : crtSpeechMouthShapeAtElapsedMs({
                text: args.activeMessage.content,
                elapsedMs: signalStageNowMs,
                phaseMs: BOTTISH_MOUTH_PHASE_MS,
              })
          : speechDurationMs > 0
            ? crtSpeechMouthShapeAtAlignedElapsedMs({
                text: args.activeMessage.content,
                elapsedMs: speechElapsedMs,
                durationMs: speechDurationMs,
                alignment: speechReveal?.alignment,
              })
            : crtSpeechMouthShapeAtElapsedMs({
                text: args.activeMessage.content,
                elapsedMs: signalStageNowMs,
              })
        : ambientVocalizing
          ? signalAmbientBotVocalizationMouthShape(role)
        : "closed";
      bot = botWithIdentityAtStageTime(bot);
      const renderedAvatar = renderAvatar?.(bot, {
        talking,
        thinking,
        sipping,
        role,
        surface: "stage",
        sfxEnabled: signalAvatarSfxShouldPlay({
          surface: "stage",
          introActive: episodePreRoll !== null,
          outroActive:
            !args.replay &&
            (episodeOutroSfxMutedId === args.currentEpisode.id ||
              episodeOutro !== null),
        }),
        sfxMixGain: avatarSfxMixGain,
        facing: signalStudioFacingForRole(studioLayout, role),
        theme: stageTheme,
        mouthShape,
      });
      if (renderedAvatar !== null && renderedAvatar !== undefined) {
        return renderedAvatar;
      }
      if (bot.producerGuest) {
        return (
          <div
            className={styles.producerGuestPresence}
            data-talking={talking ? "true" : undefined}
            data-thinking={thinking ? "true" : undefined}
            aria-label={`${bot.name}, Producer guest`}
          >
            <span aria-hidden="true">{thinking ? "THINKING" : "YOU"}</span>
            <strong>{bot.name}</strong>
          </div>
        );
      }
      return avatarFallback(bot);
    };
    return (
      <section
        ref={args.stageRef ?? signalStageRef}
        className={styles.stageViewport}
        data-shot={args.shot}
        data-camera-transitions={
          args.cameraTransitions ?? cameraTransitionMode
        }
        data-replay={args.replay ? "true" : undefined}
        data-guest-presence={args.currentEpisode.guestPresenceMode}
        data-audience-guest-visible={guestVisibleToAudience ? "true" : "false"}
        data-signal-power-pressure={socialPressure?.strength}
        data-signal-power-source={socialPressure?.sourceRole}
        data-model-warmup={
          !args.replay && signalModelWarmup
            ? signalModelWarmup.phase
            : undefined
        }
        data-studio-source={stageAtmosphere.imageUrl ? "image" : "fallback"}
        style={atmosphereStyle}
        aria-label={`Signal studio, ${args.shot} camera`}
      >
        <div className={styles.stageScene} data-signal-stage-scene="true">
          <div className={styles.atmosphere} aria-hidden="true">
            {!stageAtmosphere.imageUrl ? (
              <SignalFallbackStudio
                surface="stage"
                accentVariant={args.show.fallbackStudioAccentVariant}
              />
            ) : null}
          </div>
          <div
            className={styles.wordmark}
            data-signal-cast-credit="true"
          >
            <SignalShowLogo show={args.show} />
            <div
              className={styles.stageCastCredit}
              aria-label={`With ${args.host?.name ?? "Host"}, featuring ${args.guest?.name ?? "Guest"}`}
            >
              <span>
                <small>with</small>
                <strong>{args.host?.name ?? "Host"}</strong>
              </span>
              <span>
                <small>featuring</small>
                <strong>{args.guest?.name ?? "Guest"}</strong>
              </span>
            </div>
          </div>
          {signalStudioLightingStyle({
            show: args.show,
            layout: studioLayout,
            hostColor: args.host?.color ?? args.show.accentColor,
            guestColor: args.guest?.color ?? args.show.accentColor,
            theme: stageTheme,
            tuning: studioGlowTuning,
          }) ? (
            <div
              className={styles.studioGlow}
              data-talk-reactive="true"
              data-host-talking={
                hostVisibleToAudience && roleMouthIsActive("host")
                  ? "true"
                  : undefined
              }
              data-guest-talking={
                guestVisibleToAudience && roleMouthIsActive("guest")
                  ? "true"
                  : undefined
              }
              aria-hidden="true"
            />
          ) : null}
          {socialPressure ? (
            <div
              className={styles.powerPressure}
              data-strength={socialPressure.strength}
              data-source={socialPressure.sourceRole}
              aria-hidden="true"
            />
          ) : null}
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
                data-talking={
                  roleMouthIsActive("host")
                    ? "true"
                    : undefined
                }
                data-ambient-bot-vocalization={
                  roleIsAmbientVocalizing("host")
                    ? signalAmbientBotVocalization?.cue.kind
                    : undefined
                }
                data-thinking={roleIsThinking("host") ? "true" : undefined}
                data-sipping={hostSipping ? "true" : undefined}
                data-power-muted={args.host.muted ? "true" : undefined}
                data-ghostly-presence={
                  roleAvatarVisibilityMode("host", args.host) === "speaking_only"
                    ? "true"
                    : undefined
                }
                data-power-avatar-visibility={
                  roleAvatarVisibilityMode("host", args.host) ?? undefined
                }
                data-power-avatar-scale={
                  roleAvatarScaleMode("host", args.host) ?? undefined
                }
                data-listener-reaction={
                  roleIsListenerReacting("host")
                    ? listenerReactionPlan?.visualAction
                    : undefined
                }
              >
                {avatar(
                  args.host,
                  "host",
                  roleMouthIsActive("host"),
                  roleIsThinking("host"),
                  hostSipping && hostCupTravel.sipFaceActive,
                )}
                {activeVoiceAction &&
                args.activeMessage?.speakerRole === "host" ? (
                  <span
                    className={styles.voiceActionText}
                    data-signal-voice-action="true"
                    data-phase={activeVoiceAction.phase}
                    style={{
                      ["--signal-voice-action-opacity" as string]:
                        activeVoiceAction.opacity,
                    }}
                    aria-hidden="true"
                  >
                    *{activeVoiceAction.action}*
                  </span>
                ) : null}
                {roleIsListenerReacting("host") && listenerReactionPlan ? (
                  <span
                    className={styles.listenerReactionText}
                    data-interjection-attempt={
                      listenerReactionPlan.interjectionAttempt
                        ? "true"
                        : undefined
                    }
                    role="status"
                    aria-label={`${args.host.name} ${listenerReactionActionLabel(listenerReactionPlan.visualAction)}`}
                  >
                    {(args.host.muted ? null : listenerReactionSpokenCue) ??
                      listenerReactionActionLabel(
                        listenerReactionPlan.visualAction,
                      )}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {hostVisibleToAudience && args.host && renderMug && hostCupVisual ? (
            <>
              <span
                className={styles.stageMugShadow}
                style={{
                  ...signalStudioPlacementStyle(studioLayout, "hostCup"),
                  ["--signal-cup-shadow-duration-ms" as string]: `${hostCupVisual.sipAnimationMs}ms`,
                }}
                data-signal-mug-shadow-role="host"
                data-sipping={
                  hostCupTravel.mode === "sipping" ? "true" : undefined
                }
                data-returning={
                  hostCupTravel.mode === "returning" ? "true" : undefined
                }
                aria-hidden="true"
              />
              <div
                className={styles.stageMug}
                style={{
                  ...signalStudioPlacementStyle(studioLayout, "hostCup"),
                  ["--signal-cup-rest-x" as string]: `${studioLayout.hostCup.x}%`,
                  ["--signal-cup-rest-y" as string]: `${studioLayout.hostCup.y}%`,
                  ["--signal-cup-sip-duration-ms" as string]: `${hostCupVisual.sipAnimationMs}ms`,
                  ...(hostCupTravel.returnX !== null &&
                  hostCupTravel.returnY !== null
                    ? {
                        ["--signal-cup-return-x" as string]: `${hostCupTravel.returnX}px`,
                        ["--signal-cup-return-y" as string]: `${hostCupTravel.returnY}px`,
                      }
                    : {}),
                }}
                data-signal-mug-role="host"
                data-sip-face-release-ms={signalCupSipFaceReleaseMs(
                  hostCupVisual.sipAnimationMs,
                )}
                data-sip-requested={hostSipping ? "true" : undefined}
                data-sipping={
                  hostCupTravel.mode === "sipping" ? "true" : undefined
                }
                data-returning={
                  hostCupTravel.mode === "returning" ? "true" : undefined
                }
                onAnimationEnd={(event) =>
                  finishSignalCupReturn("host", event)
                }
                aria-label="Host coffee mug"
              >
                {renderMug(args.host, {
                  role: "host",
                  facing: signalStudioFacingForRole(studioLayout, "host"),
                  visual: hostCupVisual,
                })}
              </div>
            </>
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
                data-talking={
                  roleMouthIsActive("guest")
                    ? "true"
                    : undefined
                }
                data-ambient-bot-vocalization={
                  roleIsAmbientVocalizing("guest")
                    ? signalAmbientBotVocalization?.cue.kind
                    : undefined
                }
                data-producer-guest={
                  args.guest.producerGuest ? "true" : undefined
                }
                data-thinking={roleIsThinking("guest") ? "true" : undefined}
                data-sipping={guestSipping ? "true" : undefined}
                data-power-muted={args.guest.muted ? "true" : undefined}
                data-ghostly-presence={
                  roleAvatarVisibilityMode("guest", args.guest) === "speaking_only"
                    ? "true"
                    : undefined
                }
                data-power-avatar-visibility={
                  roleAvatarVisibilityMode("guest", args.guest) ?? undefined
                }
                data-power-avatar-scale={
                  roleAvatarScaleMode("guest", args.guest) ?? undefined
                }
                data-listener-reaction={
                  roleIsListenerReacting("guest")
                    ? listenerReactionPlan?.visualAction
                    : undefined
                }
              >
                {avatar(
                  args.guest,
                  "guest",
                  roleMouthIsActive("guest"),
                  roleIsThinking("guest"),
                  guestSipping && guestCupTravel.sipFaceActive,
                )}
                {activeVoiceAction &&
                args.activeMessage?.speakerRole === "guest" ? (
                  <span
                    className={styles.voiceActionText}
                    data-signal-voice-action="true"
                    data-phase={activeVoiceAction.phase}
                    style={{
                      ["--signal-voice-action-opacity" as string]:
                        activeVoiceAction.opacity,
                    }}
                    aria-hidden="true"
                  >
                    *{activeVoiceAction.action}*
                  </span>
                ) : null}
                {roleIsListenerReacting("guest") && listenerReactionPlan ? (
                  <span
                    className={styles.listenerReactionText}
                    data-interjection-attempt={
                      listenerReactionPlan.interjectionAttempt
                        ? "true"
                        : undefined
                    }
                    role="status"
                    aria-label={`${args.guest.name} ${listenerReactionActionLabel(listenerReactionPlan.visualAction)}`}
                  >
                    {(args.guest.muted ? null : listenerReactionSpokenCue) ??
                      listenerReactionActionLabel(
                        listenerReactionPlan.visualAction,
                      )}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {guestPresentOnStage && args.guest && renderMug && guestCupVisual ? (
            <>
              <span
                className={styles.stageMugShadow}
                style={{
                  ...signalStudioPlacementStyle(studioLayout, "guestCup"),
                  ["--signal-cup-shadow-duration-ms" as string]: `${guestCupVisual.sipAnimationMs}ms`,
                }}
                data-signal-mug-shadow-role="guest"
                data-sipping={
                  guestCupTravel.mode === "sipping" ? "true" : undefined
                }
                data-returning={
                  guestCupTravel.mode === "returning" ? "true" : undefined
                }
                aria-hidden="true"
              />
              <div
                className={styles.stageMug}
                style={{
                  ...signalStudioPlacementStyle(studioLayout, "guestCup"),
                  ["--signal-cup-rest-x" as string]: `${studioLayout.guestCup.x}%`,
                  ["--signal-cup-rest-y" as string]: `${studioLayout.guestCup.y}%`,
                  ["--signal-cup-sip-duration-ms" as string]: `${guestCupVisual.sipAnimationMs}ms`,
                  ...(guestCupTravel.returnX !== null &&
                  guestCupTravel.returnY !== null
                    ? {
                        ["--signal-cup-return-x" as string]: `${guestCupTravel.returnX}px`,
                        ["--signal-cup-return-y" as string]: `${guestCupTravel.returnY}px`,
                      }
                    : {}),
                }}
                data-signal-mug-role="guest"
                data-sip-face-release-ms={signalCupSipFaceReleaseMs(
                  guestCupVisual.sipAnimationMs,
                )}
                data-sip-requested={guestSipping ? "true" : undefined}
                data-sipping={
                  guestCupTravel.mode === "sipping" ? "true" : undefined
                }
                data-returning={
                  guestCupTravel.mode === "returning" ? "true" : undefined
                }
                onAnimationEnd={(event) =>
                  finishSignalCupReturn("guest", event)
                }
                aria-label="Guest coffee mug"
              >
                {renderMug(args.guest, {
                  role: "guest",
                  facing: signalStudioFacingForRole(studioLayout, "guest"),
                  visual: guestCupVisual,
                })}
              </div>
            </>
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
          </div>
        </div>
        {args.replay &&
        stageReplayPlaying &&
        stageReplayActiveMessageIndexes.length > 0 ? (
          <div
            className={styles.replayCaptionLanes}
            data-signal-replay-caption-lanes="true"
            aria-live="off"
          >
            {stageReplayActiveMessageIndexes.slice(-2).map((index) => {
              const message = args.currentEpisode.messages[index];
              if (!message || !botcastMessageIsAudibleToAudienceV1(message)) {
                return null;
              }
              const speakerName = message.speakerRole === "host"
                ? args.host?.name ?? "Host"
                : args.guest?.name ?? "Guest";
              return (
                <div
                  key={message.id}
                  className={styles.replayCaptionLane}
                  data-speaker-role={message.speakerRole}
                  data-message-id={message.id}
                >
                  <strong>{speakerName}</strong>
                  <span>{signalVoicePerformanceTranscriptText(message)}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        {delayedLiveCaption && delayedLiveCaptionSpeaker && args.activeMessage ? (
          <div
            className={styles.liveCaption}
            data-signal-live-caption="true"
            data-message-id={args.activeMessage.id}
            data-speaker-role={args.activeMessage.speakerRole}
            aria-live="off"
          >
            <strong>{delayedLiveCaptionSpeaker}</strong>
            <span>{delayedLiveCaption}</span>
          </div>
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

  const renderLibrary = (): React.JSX.Element => (
    <aside className={styles.library} aria-label="Signal shows">
      <div className={styles.libraryHeader}>
        <span>Your shows</span>
        <small>{shows.length}</small>
      </div>
      <div className={styles.showList} data-tutorial-target="botcast-shows">
        {shows.map((show) => {
          const host = botsById.get(show.hostBotId);
          return (
            <button
              key={show.id}
              type="button"
              className={styles.showRow}
              data-selected={show.id === selectedShowId ? "true" : undefined}
              onClick={() => void selectShow(show)}
              aria-label={
                episode?.status === "live"
                  ? `Cut the live show and open ${show.name}`
                  : `Open ${show.name}`
              }
              style={
                {
                  ["--show-accent" as string]: normalizeAccentForTheme(
                    host?.color ?? show.accentColor,
                    theme,
                  ),
                } as CSSProperties
              }
              data-botcast-show-id={show.id}
            >
              <SignalShowLogo show={show} compact />
              <span>
                <strong>{show.name}</strong>
                <small>
                  {host?.name ?? "Unknown host"} · {show.episodeCount} episodes
                </small>
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
      <div className={styles.createShowCard}>
        <label htmlFor="botcast-host-picker">Create a show</label>
        <select
          id="botcast-host-picker"
          value={hostDraftId}
          onChange={(event) => setHostDraftId(event.target.value)}
          data-botcast-delete-focus-fallback="true"
        >
          <option value="">Choose a host…</option>
          {eligibleBots
            .filter((bot) => !shows.some((show) => show.hostBotId === bot.id))
            .map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.name}
              </option>
            ))}
          </select>
        <label htmlFor="botcast-premise-inspiration">
          Premise inspiration <span>optional</span>
        </label>
        <textarea
          id="botcast-premise-inspiration"
          value={showPremiseInspirationDraft}
          maxLength={360}
          rows={3}
          placeholder="A spark, tension, or reason this show should exist"
          onChange={(event) =>
            setShowPremiseInspirationDraft(event.target.value)
          }
        />
        <button
          type="button"
          onClick={() => void createShow()}
          disabled={!hostDraftId || busy}
        >
          Create show
        </button>
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
    const hostHasCoffeeCup = botHasCoffeeCup(host);
    const guestHasCoffeeCup = guest ? botHasCoffeeCup(guest) : false;
    const studioHasCoffeeCup = hostHasCoffeeCup || guestHasCoffeeCup;
    const studioGlowTuningIsDefault = (["dark", "light"] as const).every(
      (glowTheme) =>
        studioGlowTuning[glowTheme].opacity ===
          SIGNAL_STUDIO_GLOW_TUNING_DEFAULTS[glowTheme].opacity &&
        studioGlowTuning[glowTheme].blendMode ===
          SIGNAL_STUDIO_GLOW_TUNING_DEFAULTS[glowTheme].blendMode,
    );
    const previewStudioGlowTuning = (
      glowTheme: "light" | "dark",
      update: Partial<SignalStudioGlowThemeTuning>,
    ) => {
      setStudioLayoutPreviewTheme(glowTheme);
      setStudioGlowTuning((current) => ({
        ...current,
        [glowTheme]: {
          ...current[glowTheme],
          ...update,
        },
      }));
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
      ...(stageAtmosphere.imageUrl
        ? {
            ["--botcast-atmosphere" as string]: `url("${stageAtmosphere.imageUrl}")`,
          }
        : {}),
      ...(signalStudioLightingStyle({
        show,
        layout,
        hostColor: host.color ?? show.accentColor,
        guestColor: guest?.color ?? show.accentColor,
        theme: previewTheme,
        tuning: studioGlowTuning,
      }) ?? {}),
    } as CSSProperties;
    const layoutHandle = (
      item: BotcastStudioLayoutItem,
      child: ReactNode,
    ): React.JSX.Element => {
      const label = SIGNAL_STUDIO_LAYOUT_LABELS[item];
      return (
        <div
          key={item}
          className={styles.stageLayoutHandle}
          data-kind={
            item.endsWith("Bot")
              ? "bot"
              : "cup"
          }
          data-dragging={studioLayoutDraggingItem === item ? "true" : undefined}
          style={signalStudioPlacementStyle(layout, item)}
          role="button"
          tabIndex={0}
          aria-label={`Move ${label}. Use arrow keys to nudge.`}
          onPointerDown={(event) => beginStudioLayoutDrag(event, show, item)}
          onPointerMove={moveStudioLayoutDrag}
          onPointerUp={finishStudioLayoutDrag}
          onPointerCancel={finishStudioLayoutDrag}
          onKeyDown={(event) => nudgeStudioLayoutItem(event, show, item)}
        >
          {child}
          <span className={styles.stageLayoutHandleLabel}>{label}</span>
        </div>
      );
    };
    const avatarPreview = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
    ): ReactNode => {
      const sfxMixGain = sessionAtmosphereBusVolume({
        volume: introAudioVolume,
        mix: show.atmosphereMix,
        bus: "foley",
      });
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
          data-talking={talking ? "true" : undefined}
          data-soundcheck-talking={talking ? "true" : undefined}
        >
          {renderAvatar?.(bot, {
            talking,
            thinking: false,
            sipping: false,
            role,
            surface: "alignment",
            sfxEnabled: sfxMixGain > 0,
            sfxMixGain,
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
              <span className={styles.eyebrow}>Stage placement</span>
              <h2 id="signal-stage-layout-title">
                Place the {show.name} studio
              </h2>
              <p>
                Set the cast, cups, voices, and room mix before air.
              </p>
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
            <div className={styles.stageLayoutEditor}>
              <div className={styles.stageLayoutEditorHeader}>
                <p>
                  Drag each bot{studioHasCoffeeCup ? " and cup" : ""} onto this
                  show’s furniture. Arrow keys make fine adjustments.
                </p>
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
                    studioVoiceLevelsSaving ||
                    studioAtmosphereMixSaving
                      ? "Saving studio…"
                      : "Studio settings saved"}
                  </span>
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
                </div>
              </div>
              <div
                className={styles.stageSoundcheckStatus}
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
                className={styles.stageVoiceMixer}
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
              <section
                className={styles.stageViewport}
                data-shot="wide"
                data-layout-editor="true"
                data-signal-layout-stage="true"
                data-studio-source={
                  stageAtmosphere.imageUrl ? "image" : "fallback"
                }
                style={stageStyle}
                aria-label={`Align the ${show.name} studio stage`}
              >
                <div className={styles.stageScene}>
                  <div className={styles.atmosphere} aria-hidden="true">
                    {!stageAtmosphere.imageUrl ? (
                      <SignalFallbackStudio
                        surface="stage"
                        accentVariant={show.fallbackStudioAccentVariant}
                      />
                    ) : null}
                  </div>
                  <div className={styles.wordmark}>
                    <SignalShowLogo show={show} />
                    <strong>{show.name}</strong>
                  </div>
                  {signalStudioLightingStyle({
                    show,
                    layout,
                    hostColor: host.color ?? show.accentColor,
                    guestColor: guest?.color ?? show.accentColor,
                    theme: previewTheme,
                    tuning: studioGlowTuning,
                  }) ? (
                    <div
                      className={styles.studioGlow}
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
                  ) : null}
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
              </section>
              <section
                className={styles.stageScreenTreatment}
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
                        setStudioGlowTuning(defaultSignalStudioGlowTuning())
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
                              <output>{Math.round(setting.opacity * 100)}%</output>
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
                            {(["screen", "overlay"] as const).map(
                              (blendMode) => (
                                <button
                                  key={blendMode}
                                  type="button"
                                  aria-pressed={
                                    setting.blendMode === blendMode
                                  }
                                  onClick={() =>
                                    previewStudioGlowTuning(glowTheme, {
                                      blendMode,
                                    })
                                  }
                                >
                                  {blendMode === "screen"
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
                    Session preview only. Tell Codex which pair to lock in.
                  </small>
                </div>
              </section>
              {renderAtmosphereMixer(show)}
            </div>
          </div>
        </section>
      </div>
    );
  };

  const renderEpisodeSetup = (): React.JSX.Element | null => {
    if (!selectedShow || !hostBot) return null;
    const guestOptions = eligibleBots.filter((bot) => bot.id !== hostBot.id);
    const producerGuestSelected =
      guestDraftId === BOTCAST_PRODUCER_GUEST_ID;
    const producerGuestUnavailable = Boolean(
      hostBot?.muted || hostBot?.echoesAddressedSpeech,
    );
    const selectedEpisodeModelOption = episodeModelDraft
      ? (modelOptions.find((option) => option.id === episodeModelDraft) ?? null)
      : null;
    const episodeModelProvider =
      selectedEpisodeModelOption?.provider ??
      accountDefaultModelOption?.provider ??
      preferredProvider;
    const suggestionGuest = botsById.get(guestDraftId) ?? null;
    const synthesizeBookingForGuest = async (
      guestId: string,
    ): Promise<SignalBotEpisodeStartDraft> => {
      const response = await request<{
        topic: string;
        producerBrief: string;
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
            modelOverride:
              selectedEpisodeModelOption?.id ?? accountDefaultModel,
          }),
        },
      );
      const topic = response.topic.trim();
      const producerBrief = response.producerBrief.trim();
      if (!response.generated || !topic || !producerBrief) {
        throw new Error("Signal could not produce this booking.");
      }
      return { guestId, topic, producerBrief };
    };
    const synthesizeBookingField = async (
      field: SignalBookingSuggestionField,
    ): Promise<void> => {
      if (!suggestionGuest || bookingSuggestionBusy) return;
      setBookingSuggestionBusy(field);
      setError(null);
      setNotice(null);
      try {
        const response = await request<{ value: string; generated: boolean }>(
          `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/booking-suggestion`,
          {
            method: "POST",
            body: JSON.stringify({
              guestBotId: suggestionGuest.id,
              field,
              currentTopic: topicDraft,
              currentProducerBrief: producerBriefDraft,
              preferredProvider: episodeModelProvider,
              responseMode,
              modelOverride:
                selectedEpisodeModelOption?.id ?? accountDefaultModel,
            }),
          },
        );
        const value = response.value.trim();
        if (!response.generated || !value) {
          throw new Error(
            "Signal could not synthesize a suggestion this time.",
          );
        }
        if (field === "topic") setTopicDraft(value);
        else setProducerBriefDraft(value);
        setNotice(
          field === "topic"
            ? "A short guest-aware episode title is ready to edit."
            : "A private producer angle is ready to edit.",
        );
      } catch (suggestionError) {
        setError(
          signalErrorToast(
            "Generate booking suggestion",
            suggestionError instanceof Error
              ? suggestionError
              : "Signal could not synthesize a suggestion this time.",
          ),
        );
      } finally {
        setBookingSuggestionBusy(null);
      }
    };
    const latestEpisodes = episodes
      .filter((item) => item.status === "completed")
      .slice(0, 5);
    const reuseEpisodeSetup = async (
      summary: BotcastEpisodeSummary,
    ): Promise<void> => {
      if (episodeSetupLoadingId !== null) return;
      const expectedShowId = selectedShow.id;
      setEpisodeSetupLoadingId(summary.id);
      setError(null);
      try {
        const detail = await loadEpisode(summary.id);
        if (selectedShowIdRef.current !== expectedShowId) return;
        if (detail.guestKind === "producer") {
          setGuestDraftId(BOTCAST_PRODUCER_GUEST_ID);
          setProducerGuestContextDraft(detail.guestContext ?? "");
          setTopicDraft("");
          setProducerBriefDraft("");
          setEpisodeModelDraft(
            detail.model && modelOptions.some((option) => option.id === detail.model)
              ? detail.model
              : "",
          );
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
        });
        setGuestDraftId(retry.guestId);
        setTopicDraft(retry.topic);
        setProducerBriefDraft(retry.producerBrief);
        setEpisodeModelDraft(retry.modelId);
        setEpisodeDurationDraft(retry.durationMinutes);

        const caveats: string[] = [];
        if (!retry.guestAvailable) {
          caveats.push(
            "The original guest is no longer available, so choose another.",
          );
        }
        if (retry.modelUnavailable) {
          caveats.push(
            "The original model is no longer available, so the account default is selected.",
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
    const randomizeBooking = async (): Promise<void> => {
      if (bookingSuggestionBusy) return;
      const guestId = randomSignalEpisodeGuestId({
        candidateGuestIds: guestOptions.map((bot) => bot.id),
        hostBotId: hostBot.id,
        currentGuestId: guestDraftId,
      });
      if (!guestId) return;
      const bookingGuest = botsById.get(guestId);
      if (!bookingGuest) return;
      setBookingSuggestionBusy("booking");
      setError(null);
      setNotice(null);
      try {
        const { topic, producerBrief } =
          await synthesizeBookingForGuest(guestId);
        setGuestDraftId(guestId);
        setTopicDraft(topic);
        setProducerBriefDraft(producerBrief);
        setNotice(
          `${bookingGuest.name} is booked with a short public title and a richer private angle. Everything remains editable.`,
        );
      } catch (bookingError) {
        setError(
          signalErrorToast(
            "Randomize Signal booking",
            bookingError instanceof Error
              ? bookingError
              : "Signal could not produce this booking.",
          ),
        );
      } finally {
        setBookingSuggestionBusy(null);
      }
    };
    const startEpisodeFromSetup = async (): Promise<void> => {
      if (busy || bookingSuggestionBusy) return;
      if (
        producerGuestSelected ||
        (guestDraftId && topicDraft.trim()) ||
        (guestDraftId && !botsById.has(guestDraftId))
      ) {
        await startEpisode();
        return;
      }

      const guestId = guestDraftId;
      if (!guestId) return;

      setBookingSuggestionBusy("launch");
      setError(null);
      setNotice(null);
      try {
        const booking = await synthesizeBookingForGuest(guestId);
        setGuestDraftId(booking.guestId);
        setTopicDraft(booking.topic);
        setProducerBriefDraft(booking.producerBrief);
        await startEpisode(booking);
      } catch (bookingError) {
        setError(
          signalErrorToast(
            "Start Signal episode",
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
            <button
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
                "↻ Randomize booking"
              )}
            </button>
            <button
              type="button"
              data-tutorial-target="botcast-stage-layout"
              onClick={openStudioLayoutEditor}
            >
              Align stage
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
                        : (botsById.get(item.guestBotId)?.name ?? "Guest")} ·{" "}
                      {runtimeLabel(item.runtimeMs)}
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
              Complete an episode and its booking will be ready to reuse here.
            </p>
          )}
        </section>
        <div className={styles.setupGrid}>
          <label>
            Guest
            <select
              value={guestDraftId}
              onChange={(event) => setGuestDraftId(event.target.value)}
              disabled={busy || Boolean(bookingSuggestionBusy)}
            >
              <option value="">Choose one guest…</option>
              <option
                value={BOTCAST_PRODUCER_GUEST_ID}
                disabled={producerGuestUnavailable}
              >
                {producerGuestUnavailable
                  ? "Me — unavailable for this host"
                  : "Me — go on as the guest"}
              </option>
              {guestOptions.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name}
                </option>
              ))}
            </select>
          </label>
          {producerGuestSelected ? (
            <div
              className={`${styles.setupField} ${styles.producerGuestContext}`}
            >
              <label htmlFor="signal-producer-guest-context">
                Interview direction{" "}
                <span>optional · leave blank for host’s choice</span>
              </label>
              <textarea
                id="signal-producer-guest-context"
                value={producerGuestContextDraft}
                onChange={(event) =>
                  setProducerGuestContextDraft(event.currentTarget.value)
                }
                placeholder="Share anything you want covered—or leave this blank and let the host surprise you."
                maxLength={2000}
              />
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
          <div className={styles.setupField}>
            <label htmlFor="signal-episode-topic">
              Episode topic <span>public title</span>
            </label>
            <div className={styles.contextualTextField}>
            <input
                id="signal-episode-topic"
              value={topicDraft}
              onChange={(event) => setTopicDraft(event.target.value)}
              placeholder="A short public title, not the full question"
            />
              <button
                type="button"
                className={styles.contextualDiceButton}
                onClick={() => void synthesizeBookingField("topic")}
                disabled={
                  busy || Boolean(bookingSuggestionBusy) || !suggestionGuest
                }
                aria-label="Synthesize a relevant episode topic"
                title={
                  suggestionGuest
                    ? "Synthesize a relevant episode topic"
                    : "Choose a guest first"
                }
                aria-busy={bookingSuggestionBusy === "topic"}
              >
                {bookingSuggestionBusy === "topic" ? (
                  <LoaderCircle data-loading="true" aria-hidden="true" />
                ) : (
                  <Dices aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          <div className={`${styles.setupField} ${styles.producerBrief}`}>
            <label htmlFor="signal-producer-brief">
            Private producer comments <span>optional</span>
            </label>
            <div className={styles.contextualTextField} data-multiline="true">
            <textarea
                id="signal-producer-brief"
              value={producerBriefDraft}
              onChange={(event) => setProducerBriefDraft(event.target.value)}
              placeholder="The provocative question, angle, boundaries, and follow-ups. This stays off-mic."
            />
              <button
                type="button"
                className={styles.contextualDiceButton}
                onClick={() => void synthesizeBookingField("producerBrief")}
                disabled={
                  busy || Boolean(bookingSuggestionBusy) || !suggestionGuest
                }
                aria-label="Synthesize a relevant private producer brief"
                title={
                  suggestionGuest
                    ? "Synthesize a relevant private producer brief"
                    : "Choose a guest first"
                }
                aria-busy={bookingSuggestionBusy === "producerBrief"}
              >
                {bookingSuggestionBusy === "producerBrief" ? (
                  <LoaderCircle data-loading="true" aria-hidden="true" />
                ) : (
                  <Dices aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          </>
          )}
        </div>
        <div className={styles.episodeLaunchRow}>
          <label className={styles.episodeLengthControl}>
            <span>Episode length</span>
            <select
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
            <small>
              {episodeDurationDraft === null
                ? "No countdown · closes at a natural resting point"
                : `Target · about ${episodeDurationDraft} minutes`}
            </small>
          </label>
          <button
            type="button"
            className={styles.goLiveButton}
            onClick={() => void startEpisodeFromSetup()}
            disabled={
              busy || Boolean(bookingSuggestionBusy) || !guestDraftId
            }
            aria-busy={bookingSuggestionBusy === "launch"}
          >
            {bookingSuggestionBusy === "launch" ? (
              <>
                <LoaderCircle data-loading="true" aria-hidden="true" />
                Booking…
              </>
            ) : (
              "Begin episode"
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderArchive = (): React.JSX.Element => (
    <section className={styles.archive} data-tutorial-target="botcast-replay">
      <div className={styles.archiveHeading}>
        <span className={styles.eyebrow}>Episode archive</span>
        <h2>
          {episodes.length
            ? `${episodes.length} recorded`
            : "The tape shelf is empty"}
        </h2>
      </div>
      <div className={styles.episodeGrid}>
        {episodes.map((item, index) => (
          <article key={item.id} className={styles.episodeCard}>
            <button
              type="button"
              className={styles.episodeOpenButton}
              aria-haspopup="menu"
              onClick={() => void openReplay(item)}
              onContextMenu={(event) => openEpisodeContextMenu(event, item)}
            >
              <span className={styles.episodeNumber}>
                EP {String(episodes.length - index).padStart(2, "0")}
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
                  : "Provider default"}{" "}
                ·{" "}
                {item.status === "live"
                  ? "Resume episode"
                  : episodeOutcomeLabel(item)}
              </small>
              <ReplayRecordingStatusBadge
                surface="signal"
                sourceId={item.id}
                onRecordingChange={handleReplayRecordingChange}
              />
            </button>
          </article>
        ))}
      </div>
    </section>
  );

  const liveActiveMessage =
    episode?.messages.find((message) => message.id === speakingMessageId) ??
    null;
  const liveEpisodeElapsedMs = episode
    ? signalEpisodeRuntimeMs(
        episode,
        signalStageNowMs,
        producerGuestThinkingStartedAtRef.current,
        producerGuestThinkingEndedAtRef.current,
      )
    : 0;
  const liveCameraElapsedMs = (() => {
    if (!episode || episode.messages.length === 0) return 0;
    const timeline = botcastReplayTimeline(episode.messages, episode.events);
    const activeIndex = liveSpeech
      ? episode.messages.findIndex(
          (message) => message.id === liveSpeech.messageId,
        )
      : -1;
    if (activeIndex >= 0 && liveSpeech) {
      return Math.max(
        0,
        Math.round(
          (timeline.messageStartMs[activeIndex] ?? 0) +
            liveSpeech.reveal.elapsedMs,
        ),
      );
    }
    const lastIndex = episode.messages.length - 1;
    return Math.max(
      0,
      Math.round(timeline.messageEndMs[lastIndex] ?? 0),
    );
  })();
  const liveCameraMode = episode
    ? botcastCameraModeAt({
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
  const liveReactionAtMs =
    liveActiveMessage && liveListenerReactionPlan && liveSpeech
      ? (listenerReactionAtMsByMessageIdRef.current.get(liveActiveMessage.id) ??
        resolveListenerReactionAtMs({
          text: liveActiveMessage.content,
          durationMs: Math.max(1, liveSpeech.reveal.durationMs),
          targetProgress: liveListenerReactionPlan.targetProgress,
        }))
      : null;
  const liveReactionCameraActive = Boolean(
    liveListenerReactionPlan?.cameraCutEligible &&
    liveCameraMode === "auto" &&
    liveSpeech?.reveal.phase === "playing" &&
    liveReactionAtMs !== null &&
    liveSpeech.reveal.elapsedMs >= liveReactionAtMs &&
    liveSpeech.reveal.elapsedMs <=
      liveReactionAtMs +
        (liveListenerReactionPlan.interjectionAttempt ? 1_600 : 1_200),
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
  const liveNextSpeakerRole = episode
    ? signalNextSpeakerRole(episode)
    : null;
  const liveNextSpeakerIsBot = Boolean(
    episode &&
      liveNextSpeakerRole &&
      !(
        episode.guestKind === "producer" && liveNextSpeakerRole === "guest"
      ),
  );
  const livePreparedMessageIsBot = Boolean(
    liveActiveMessage && liveActiveMessage.botId !== BOTCAST_PRODUCER_GUEST_ID,
  );
  const liveBotThinking = Boolean(
    episode &&
      episode.status === "live" &&
      liveCameraMode === "auto" &&
      ((liveSpeech?.reveal.phase === "preparing" &&
        livePreparedMessageIsBot) ||
        (busy &&
          speakingMessageId === null &&
          (producerGuestThinkingEndedAtRef.current !== null ||
            liveNextSpeakerIsBot))),
  );
  const liveReactionShot =
    liveReactionCameraActive && episode
      ? liveListenerReactionPlan?.listenerBotId === episode.hostBotId
        ? "left"
        : "right"
      : null;
  const liveSpeakingShot =
    liveCameraMode === "auto" &&
    liveActiveMessage &&
    liveSpeech?.messageId === liveActiveMessage.id &&
    liveSpeech.reveal.phase === "playing" &&
    botcastMessageIsAudibleToAudienceV1(liveActiveMessage) &&
    !botPowerResponseIsSilentV1(liveActiveMessage.content)
      ? liveActiveMessage.speakerRole === "host"
        ? "left"
        : "right"
      : null;
  const liveShot = signalLiveAutoCameraShot({
    baseShot: liveBaseShot,
    listenerReactionShot: liveReactionShot,
    speakingShot: liveSpeakingShot,
    postSpeechHoldShot:
      liveCameraMode === "auto" ? liveCameraPostSpeechHoldShot : null,
    botThinking: liveBotThinking,
    producerGuestThinking:
      liveProducerGuestThinking && liveCameraMode === "auto",
  });
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
        current?.id === response.episode.id ? response.episode : current,
      );
    } catch (cameraError) {
      setError(signalErrorToast("Change live camera", cameraError));
    } finally {
      setCameraSaving(false);
    }
  };
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
  const sipCoffeeAsProducerGuest = (): void => {
    if (
      !episode ||
      !producerGuestSipAvailable ||
      producerGuestSipDisabled
    ) {
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
  const producerCueAvailable =
    episode?.status === "live" && episode.segment !== "closing";
  const signalSoundboardAvailable = Boolean(
    producerCueAvailable && episode?.guestKind !== "producer",
  );
  const triggerSignalSoundboardCue = (
    kind: BotcastSoundboardCueKind,
  ): void => {
    if (!episode || !signalSoundboardAvailable) return;
    const variantIndex =
      signalSoundboardNextVariantByKindRef.current.get(kind) ??
      signalSoundboardNextVariantIndex(episode.events, kind);
    signalSoundboardNextVariantByKindRef.current.set(kind, variantIndex + 1);
    playSignalSoundboardCue(kind, {
      variantIndex,
      studioController: signalAtmosphereControllerRef.current,
    });
    setSignalSoundboardHit({ kind, nonce: Date.now() });
    if (signalSoundboardHitTimeoutRef.current !== null) {
      window.clearTimeout(signalSoundboardHitTimeoutRef.current);
    }
    signalSoundboardHitTimeoutRef.current = window.setTimeout(() => {
      signalSoundboardHitTimeoutRef.current = null;
      setSignalSoundboardHit(null);
    }, 620);
    const episodeId = episode.id;
    const atMs = liveCameraElapsedMs;
    void request<{ episode: BotcastEpisode }>(
      `/api/botcast/episodes/${encodeURIComponent(episodeId)}/soundboard`,
      {
        method: "POST",
        body: JSON.stringify({ kind, atMs }),
      },
    )
      .then((response) => {
        setEpisode((current) => {
          if (!current || current.id !== response.episode.id) return current;
          const eventsById = new Map(
            [...current.events, ...response.episode.events].map((event) => [
              event.id,
              event,
            ]),
          );
          return {
            ...current,
            events: [...eventsById.values()].sort(
              (left, right) => left.sequence - right.sequence,
            ),
            updatedAt: response.episode.updatedAt,
          };
        });
      })
      .catch((soundboardError) => {
        setError(signalErrorToast("Record Signal soundboard cue", soundboardError));
      });
  };
  const queuedCueCanInterruptGuest =
    Boolean(queuedProducerCue) &&
    episode !== null &&
    (episode.messages.find((message) => message.id === speakingMessageId)
      ?.speakerRole === "guest" ||
      (!busy &&
        speakingMessageId === null &&
        botcastNextSpeakerRole({
          messages: episode.messages,
          segment: episode.segment,
          guestDeparted: guestHasDeparted(episode),
        }) === "guest"));
  const liveSessionActive = episode?.status === "live";
  const episodeStageActive = episode !== null;
  const episodeModelControlDisabled =
    liveSessionActive || responseMode === "auto";
  const episodeModelControlDisabledReason = liveSessionActive
    ? "End the live Signal episode before changing its model."
    : responseMode === "auto"
      ? "AUTO uses the account primary and configured fallback chain."
      : undefined;
  const resolvedNavigationHeader =
    typeof navigationHeader === "function"
      ? navigationHeader({
          liveSessionActive,
          episodeModelControl: {
            value: episodeModelDraft,
            onChange: setEpisodeModelDraft,
            disabled: episodeModelControlDisabled,
            disabledReason: episodeModelControlDisabledReason,
          },
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
  const handleSignalAmbientBotVocalization = (
    cue: SessionAmbientBotVocalizationCue,
  ): boolean => {
    if (
      episode?.status !== "live" ||
      speakingMessageId === null ||
      replayPlaying ||
      studioLayoutEditorOpen
    ) {
      return false;
    }
    const eligibleRoles = Array.from(
      document.querySelectorAll<HTMLElement>("[data-signal-presence]"),
    )
      .filter(
        (presence) =>
          presence.dataset.departed !== "true" &&
          presence.dataset.talking !== "true" &&
          presence.dataset.thinking !== "true" &&
          presence.dataset.sipping !== "true" &&
          presence.dataset.powerMuted !== "true" &&
          presence.dataset.producerGuest !== "true" &&
          !presence.dataset.ghostlyPresence &&
          !presence.dataset.listenerReaction,
      )
      .map((presence) => presence.dataset.signalPresence ?? "")
      .filter((role): role is "host" | "guest" =>
        role === "host" || role === "guest"
      );
    const targetRole = sessionAmbientBotVocalizationTargetId(
      episode.id,
      cue.index,
      eligibleRoles,
    );
    if (targetRole !== "host" && targetRole !== "guest") return false;
    startSignalAmbientBotVocalization(targetRole, cue);
    return true;
  };

  return (
    <>
      <SessionAtmosphereLayer
        controllerHandleRef={signalAtmosphereControllerRef}
        active={signalSessionAtmosphereActive({
          audioEnabled: introAudioEnabled,
          hasSelectedShow: Boolean(selectedShow),
          preRollActive: Boolean(episodePreRoll),
          episodePresent: Boolean(episode),
          replayPlaying,
          studioLayoutEditorOpen,
        })}
        sessionKey={
          episode?.id ?? replayEpisode?.id ?? selectedShow?.id ?? "signal"
        }
        volume={introAudioVolume}
        backgroundUrl={selectedShow?.atmosphereAudio.audioUrl}
        mix={
          selectedShow?.atmosphereMix ?? DEFAULT_SIGNAL_ATMOSPHERE_MIX
        }
        backgroundTone="warm-low"
        foleyRoomAcoustics={SIGNAL_STUDIO_FOLEY_ROOM_SEND}
        allowMixBoost
        ambientFoley={false}
        ambientBotVocalizations
        ambientBotVocalizationProfile={
          SIGNAL_SESSION_AMBIENT_BOT_VOCALIZATION_PROFILE
        }
        onAmbientBotVocalization={handleSignalAmbientBotVocalization}
        coffeeCupRootRef={signalStageRef}
        deferFoley={
          speakingMessageId !== null ||
          replaySpeechActive ||
          studioSoundcheckSpeakerBotId !== null
        }
        deferBotVocalization={
          replaySpeechActive || studioSoundcheckSpeakerBotId !== null
        }
      />
      {replayRenderTarget && signalReplayFrameRenderer ? (
        <ReplayRenderCoordinator
          surface="signal"
          sourceId={replayRenderTarget.episode.id}
          frameRenderer={signalReplayFrameRenderer}
        />
      ) : null}
      {replayRenderTarget &&
      replayRenderCapture &&
      signalReplayCaptureShow ? (
        <div
          className={`${styles.shell} ${styles.replayRenderCaptureShell}`}
          data-theme={replayRenderCapture.recording.manifest?.visual.theme}
          aria-hidden="true"
        >
          {renderStage({
            show: signalReplayCaptureShow,
            currentEpisode: replayRenderTarget.episode,
            host: signalReplayCaptureHost,
            guest: signalReplayCaptureGuest,
            shot: replayRenderCapture.frame.shot,
            activeMessage:
              replayRenderTarget.episode.messages[
                replayRenderCapture.frame.messageIndex
              ] ?? null,
            replay: true,
            replayFrame: replayRenderCapture.frame,
            guestDeparted: replayRenderCapture.frame.guestDeparted,
            hostDeparted: replayRenderCapture.frame.hostDeparted,
            renderTheme:
              replayRenderCapture.recording.manifest?.visual.theme ?? theme,
            stageRef: signalReplayRenderStageRef,
            cameraTransitions: "instant",
          })}
        </div>
      ) : null}
    <main
      className={styles.shell}
      data-botcast-mode="true"
      data-theme={theme}
      data-live-episode={episodeStageActive ? "true" : undefined}
      data-producer-guest={
        episode?.guestKind === "producer" ? "true" : undefined
      }
      data-episode-outro={episodeOutro ? "true" : undefined}
    >
      <div className={styles.sidebarNavigation}>{sidebarHeader}</div>
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
                onScroll={(event) => {
                  const cloud = event.currentTarget;
                  hostChatAutoFollowRef.current =
                    cloud.scrollHeight - cloud.scrollTop - cloud.clientHeight <=
                    32;
                }}
              >
                {hostChatMessages.map((message) => {
                  const displayContent =
                    message.role === "assistant"
                      ? signalHostChatDisplayMarkdown(message.content) || "…"
                      : message.content;
                  return (
                    <article
                      key={message.id}
                      className={styles.showHostChatBubble}
                      data-role={message.role}
                      data-power-voice-presence={
                        message.role === "assistant"
                          ? (hostBot.voicePresence ?? undefined)
                          : undefined
                      }
                      data-botcast-host-chat-message="true"
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {displayContent}
                      </ReactMarkdown>
                    </article>
                  );
                })}
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
            <div className={styles.showHostChatAvatarColumn}>
              {hostChatActionText ? (
                <div
                  className={styles.showHostChatAction}
                  role="status"
                  aria-live="polite"
                >
                  {hostChatActionText}
                </div>
              ) : null}
              <button
                type="button"
                className={styles.showHostChatFocusAvatar}
                aria-label={`Close off-air chat with ${hostBot.name}`}
                onClick={closeSignalHostChat}
              >
                <div className={styles.showCardHostFloat} aria-hidden="true">
                  {renderAvatar?.(hostBot, {
                    talking: hostChatStreamingMessage !== null,
                    thinking: hostChatBusy && !hostChatStreamingMessage,
                    sipping: false,
                    role: "host",
                    surface: "dashboard",
                    sfxEnabled: false,
                    facing: "left",
                    theme,
                    mouthShape: "closed",
                  }) ?? avatarFallback(hostBot)}
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {episodePreRoll && selectedShow ? (
        <section
          className={styles.episodePreRoll}
          data-phase={episodePreRoll.phase}
          data-kind="intro"
          data-source={episodePreRoll.source}
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
              {episodePreRoll.source === "elevenlabs"
                ? "Original ElevenLabs show ident"
                : "Signal Synth · generated locally"}
            </small>
          </div>
            <button type="button" onClick={skipEpisodePreRoll}>
              Skip intro
            </button>
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
              {episodeOutro.forced
                ? "Signal transmission cut"
                : "Signal transmission complete"}
            </span>
            <div className={styles.preRollLogo}>
              <SignalShowLogo show={selectedShow} />
            </div>
            <h1>{episodeOutro.showName}</h1>
              <p>
                {episodeOutro.forced
                    ? "Cut by producer"
                    : "End of episode"}
              </p>
            <small>Signal</small>
          </div>
            <div className={styles.episodeOutroActions}>
              {episode?.id === episodeOutro.episodeId &&
              episode.status === "completed" ? (
                <>
                  <button
                    type="button"
                    className={styles.episodeReviewCopyButton}
                    onClick={() => void copyEpisodeForReview(episode)}
                    disabled={
                      reviewCopyState?.episodeId === episode.id &&
                      reviewCopyState.phase === "copying"
                    }
                    aria-live="polite"
                  >
                    {signalReviewCopyLabel(reviewCopyState, episode.id)}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={(event) =>
                      openEpisodeDeletion(episode, event.currentTarget)
                    }
                    disabled={busy}
                  >
                    Delete episode
                  </button>
                </>
              ) : null}
            <button
              type="button"
              onClick={() => {
                stopEpisodeOutro();
                setEpisode(null);
                if (selectedShowId)
                  void loadEpisodes(selectedShowId).catch(() => undefined);
              }}
            >
              {episodeOutro.phase === "holding"
                ? "Skip outro"
                : "Return to show"}
            </button>
            </div>
        </section>
      ) : null}
      {renderLibrary()}
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
                    <input
                      className={styles.showNameInput}
                      value={showNameDraft}
                      onChange={(event) => setShowNameDraft(event.target.value)}
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
          <div className={styles.liveLayout}>
            <div className={styles.liveTopline}>
                <span
                  data-live={episode.status === "live" ? "true" : undefined}
                >
                  {episode.status === "live"
                    ? "● ON AIR"
                    : episodeOutcomeLabel(episode)}
              </span>
              <span
                className={styles.liveTimer}
                data-running={episode.status === "live" ? "true" : undefined}
                aria-label={
                  episode.status === "live"
                    ? `Episode live for ${runtimeLabel(liveEpisodeElapsedMs)}`
                    : `Final episode duration ${runtimeLabel(liveEpisodeElapsedMs)}`
                }
              >
                {runtimeLabel(liveEpisodeElapsedMs)}
              </span>
                <strong>
                  {episode.segment === "interview"
                    ? "MAIN INTERVIEW"
                    : episode.segment.toUpperCase()}
                </strong>
              <span className={styles.modelProvenance}>
                  {episodeModeLabel(episode)} ·{" "}
                  {episode.model
                    ? (modelLabels.get(episode.model) ?? episode.model)
                    : "Provider default"}
                </span>
                <span>
                  {episode.guestKind === "producer"
                    ? "Producer on mic"
                    : episode.tensionStage === "calm"
                    ? "Guest settled"
                    : `Guest: ${episode.tensionStage}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!autoRun) onPrepareUtterance?.();
                  setAutoRun((value) => !value);
                }}
                disabled={episode.status === "completed" || cuttingShow}
              >
                {autoRun ? "Pause rundown" : "Resume rundown"}
              </button>
              <button
                type="button"
                className={styles.cutShowButton}
                onClick={() => void cutShow()}
                disabled={episode.status === "completed" || cuttingShow}
                aria-label="Finish the current line and close the live show"
              >
                {cuttingShow ? "Finishing…" : "■ Cut show"}
              </button>
            </div>
            {renderStage({
              show: selectedShow,
              currentEpisode: episode,
              host: hostBot,
              guest: liveGuestBot,
              shot: liveShot,
              activeMessage: liveActiveMessage,
              replay: false,
            })}
            {episode.status === "live" ? (
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
                <button
                  type="button"
                  data-camera-motion-toggle="true"
                  data-selected={
                    cameraTransitionMode === "animated" ? "true" : undefined
                  }
                  aria-label="Use animated camera transitions"
                  aria-pressed={cameraTransitionMode === "animated"}
                  onClick={() => {
                    const nextMode =
                      cameraTransitionMode === "animated"
                        ? "instant"
                        : "animated";
                    setCameraTransitionMode(nextMode);
                    writeSignalCameraTransitionMode(window.localStorage, nextMode);
                  }}
                >
                  {cameraTransitionMode === "animated"
                    ? "Animated"
                    : "Instant"}
                </button>
              </div>
            ) : null}
            {episode.guestKind !== "producer" ? (
              <div className={styles.controlRoom}>
              <aside
                className={styles.producerControls}
                aria-label="Private producer controls"
                data-tutorial-target="botcast-cues"
              >
                <div className={styles.producerCueComposer}>
                  <span className={styles.eyebrow}>Private host cues</span>
                  <label>
                    Ask about…
                    <div>
                      <input
                        ref={producerCueInputRef}
                        value={askAboutDraft}
                        onChange={(event) => {
                          setAskAboutDraft(event.target.value);
                          producerCueInputSelectionRef.current = {
                            start: event.currentTarget.selectionStart ?? 0,
                            end: event.currentTarget.selectionEnd ?? 0,
                          };
                        }}
                        onFocus={(event) => {
                          producerCueInputFocusedRef.current = true;
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
                        placeholder="a specific detail"
                      />
                      <button
                        type="button"
                        disabled={
                          !producerCueAvailable || !askAboutDraft.trim()
                        }
                        onClick={() => {
                          sendCue({
                            kind: "ask_about",
                            detail: askAboutDraft.trim(),
                          });
                          setAskAboutDraft("");
                        }}
                      >
                        Send
                      </button>
                    </div>
                  </label>
                  <small>
                    Private to the host. Cues land on their next turn.
                  </small>
                </div>
                <div
                  className={styles.signalSoundboard}
                  aria-label="On-air soundboard"
                  data-signal-soundboard="true"
                >
                  <div className={styles.signalSoundboardHeading}>
                    <span className={styles.eyebrow}>On-air soundboard</span>
                    <small aria-live="polite">
                      {signalSoundboardHit
                        ? `${
                            SIGNAL_SOUNDBOARD_CUES.find(
                              (cue) => cue.kind === signalSoundboardHit.kind,
                            )?.label ?? "Sound"
                          } on air`
                        : "Audience-heard · saved to replay"}
                    </small>
                  </div>
                  <div className={styles.signalSoundboardGrid}>
                    {SIGNAL_SOUNDBOARD_CUES.map((cue) => (
                      <button
                        key={`${cue.kind}-${
                          signalSoundboardHit?.kind === cue.kind
                            ? signalSoundboardHit.nonce
                            : "idle"
                        }`}
                        type="button"
                        disabled={!signalSoundboardAvailable}
                        data-hit={
                          signalSoundboardHit?.kind === cue.kind
                            ? "true"
                            : undefined
                        }
                        onClick={() => triggerSignalSoundboardCue(cue.kind)}
                        aria-label={`Play ${cue.label} on air`}
                      >
                        <span aria-hidden="true">{cue.glyph}</span>
                        {cue.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.cueGrid}>
                  <button
                    type="button"
                    className={styles.refocusCue}
                    data-queued={
                      queuedProducerCue?.kind === "refocus" ? "true" : undefined
                    }
                    disabled={!producerCueAvailable}
                    onClick={() => sendCue({ kind: "refocus" })}
                  >
                    Refocus
                  </button>
                  <button
                    type="button"
                    data-queued={
                      queuedProducerCue?.kind === "press_harder"
                        ? "true"
                        : undefined
                    }
                    disabled={!producerCueAvailable}
                    onClick={() => sendCue({ kind: "press_harder" })}
                  >
                    Press harder
                  </button>
                  <button
                    type="button"
                    data-queued={
                      queuedProducerCue?.kind === "move_on" ? "true" : undefined
                    }
                    disabled={!producerCueAvailable}
                    onClick={() => sendCue({ kind: "move_on" })}
                  >
                    Move on
                  </button>
                  <button
                    type="button"
                    data-queued={
                      queuedProducerCue?.kind === "lighten_up"
                        ? "true"
                        : undefined
                    }
                    disabled={!producerCueAvailable}
                    onClick={() => sendCue({ kind: "lighten_up" })}
                  >
                    Lighten up
                  </button>
                  <button
                    type="button"
                    data-queued={
                      queuedProducerCue?.kind === "wrap_up" ? "true" : undefined
                    }
                    disabled={!producerCueAvailable}
                    onClick={() => sendCue({ kind: "wrap_up" })}
                  >
                    Wrap it up
                  </button>
                </div>
                {queuedProducerCue ? (
                  <div className={styles.queuedCueStatus} role="status">
                    <p>
                      Queued for host: {signalProducerCueLabel(queuedProducerCue)}.
                    </p>
                    <button
                      type="button"
                      disabled={!queuedCueCanInterruptGuest}
                      onClick={interruptGuestWithQueuedCue}
                      title="Have the host take the mic now with this queued cue."
                    >
                      Interrupt guest now
                    </button>
                  </div>
                ) : null}
              </aside>
              </div>
            ) : null}
            {episode.guestKind === "producer" &&
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
                    !producerGuestAnswerDraft.trim() ||
                    (!producerGuestHostInterruption &&
                      (busy ||
                        speakingMessageId !== null ||
                        botcastNextSpeakerRole({
                          messages: episode.messages,
                          segment: episode.segment,
                          guestDeparted: false,
                        }) !== "guest")),
                  shhActive: producerGuestHostInterruption !== null,
                  placeholder:
                    producerGuestHostInterruption
                      ? "Type your answer — Send cuts in now…"
                      : busy || speakingMessageId !== null
                        ? "Type your answer while the host has the mic…"
                        : "Answer as the Producer…",
                  onChange: setProducerGuestAnswerDraft,
                  onSubmit: () => void submitProducerGuestAnswer(),
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
                        setProducerGuestAnswerDraft(event.currentTarget.value)
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
            {episode.status === "completed" ? (
              <button
                type="button"
                className={styles.returnButton}
                onClick={() => {
                  setEpisode(null);
                  if (selectedShowId) void loadEpisodes(selectedShowId);
                }}
                >
                  Return to show
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
                      : "Provider default"}{" "}
                    · {episodeOutcomeLabel(replayEpisode)}
                  </p>
              </div>
              <div className={styles.replayHeaderActions}>
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
                  className={styles.dangerButton}
                    onClick={(event) =>
                      openEpisodeDeletion(replayEpisode, event.currentTarget)
                    }
                  disabled={busy}
                >
                  Delete episode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopReplayPlayback();
                    setReplayEpisode(null);
                  }}
                >
                  Close replay
                </button>
              </div>
            </div>
            <ReplayRecordingPanel
              surface="signal"
              sourceId={replayEpisode.id}
            />
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
                  ...(signalStudioLightingStyle({
                    show: selectedShow,
                    layout: selectedShow.studioLayout,
                    hostColor: hostShowAccent ?? selectedShow.accentColor,
                    guestColor: hostShowAccent ?? selectedShow.accentColor,
                    theme,
                    tuning: studioGlowTuning,
                  }) ?? {}),
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
              {signalStudioLightingStyle({
                show: selectedShow,
                layout: selectedShow.studioLayout,
                hostColor: hostShowAccent ?? selectedShow.accentColor,
                guestColor: hostShowAccent ?? selectedShow.accentColor,
                theme,
                tuning: studioGlowTuning,
              }) ? (
                <div className={styles.studioGlow} aria-hidden="true" />
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
                              aria-label={
                                showAudience.rating === null
                              ? "No audience rating yet"
                                  : `${showAudience.rating.toFixed(1)} out of 5${
                                      showAudience.ratingConfidence === "early"
                                        ? ", early rating"
                                        : ""
                                    }`
                              }
                          >
                            {showAudience.rating === null ? (
                              "—"
                            ) : (
                              <>
                                {showAudience.rating.toFixed(1)}
                                  <span
                                    className={styles.showAudienceRatingStar}
                                    aria-hidden="true"
                                  >
                                    ★
                                  </span>
                              </>
                            )}
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
                              ? "Listener reviews take at least four hours to arrive."
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
                    <button
                      type="button"
                      data-signal-first-look-action="create"
                      onClick={() => void synthesizeShowLook()}
                      disabled={busy || selectedShowArtworkBusy}
                    >
                      Complete this show
                    </button>
                  </div>
                ) : null}
                  <div
                    id={`signal-show-identity-controls-${selectedShow.id}`}
                    className={styles.showLookControls}
                    aria-label="Show identity controls"
                    hidden={!showIdentityControlsExpanded}
                  >
                    <input
                      ref={lightStudioUploadRef}
                      className={styles.assetUploadInput}
                      type="file"
                      accept={SIGNAL_ASSET_ACCEPT}
                      disabled={busy || selectedShowArtworkBusy}
                      aria-label="Upload replacement Light studio"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void uploadShowAsset("day-studio", file);
                      }}
                    />
                    <input
                      ref={darkStudioUploadRef}
                      className={styles.assetUploadInput}
                      type="file"
                      accept={SIGNAL_ASSET_ACCEPT}
                      disabled={busy || selectedShowArtworkBusy}
                      aria-label="Upload replacement Dark studio"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void uploadShowAsset("night-studio", file);
                      }}
                    />
                    <input
                      ref={logoUploadRef}
                      className={styles.assetUploadInput}
                      type="file"
                      accept={SIGNAL_ASSET_ACCEPT}
                      disabled={busy || selectedShowArtworkBusy}
                      aria-label="Upload replacement show logo"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void uploadShowAsset("logo", file);
                      }}
                    />
                    <strong>Tune the identity.</strong>
                      <small>
                        Refresh the linked studio pair, tune the premise, name,
                        dashboard blurbs, and logo, or shape the opening ident.
                      </small>
                    <div className={styles.showLookControlGrid}>
                      <div className={styles.showLookControlGroup}>
                          <label
                            htmlFor={`signal-show-name-${selectedShow.id}`}
                          >
                            Name
                          </label>
                        <input
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
                        <button
                          type="button"
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => void renameShow()}
                          disabled={
                            busy ||
                            !showNameDraft.trim() ||
                            showNameDraft.trim() === selectedShow.name
                          }
                        >
                          Save name
                        </button>
                        <button
                          type="button"
                          data-signal-artwork-action="name"
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => void regenerateShowName()}
                          disabled={busy}
                        >
                          Regenerate name
                        </button>
                      </div>
                      <div className={styles.showLookControlGroup}>
                        <label
                          htmlFor={`signal-show-premise-${selectedShow.id}`}
                        >
                          Premise
                        </label>
                        <textarea
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
                          onBlur={(event) => {
                            if (!busy) {
                              void saveShowPremise(event.currentTarget.value);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setShowPremiseDraft(selectedShow.premise);
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => void saveShowPremise()}
                          disabled={
                            busy ||
                            !showPremiseDraft.trim() ||
                            showPremiseDraft.trim() === selectedShow.premise
                          }
                        >
                          Save premise
                        </button>
                        <button
                          type="button"
                          data-signal-identity-action="premise"
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => void regenerateShowPremise()}
                          disabled={busy || !showPremiseDraft.trim()}
                        >
                          Refresh premise
                        </button>
                      </div>
                        <div className={styles.showLookControlGroup}>
                          <span>Dashboard blurbs</span>
                          <button
                            type="button"
                            data-signal-identity-action="blurbs"
                            onClick={() => void regenerateShowBlurbs()}
                            disabled={busy || hostBot?.muted}
                            title={
                              hostBot?.muted
                                ? "This host’s Power allows only ..."
                                : undefined
                            }
                          >
                            Regenerate{" "}
                            {hostBot?.echoesAddressedSpeech ? "blurb" : "blurbs"}
                          </button>
                        </div>
                      <div className={styles.showLookControlGroup}>
                        <span>Studio pair</span>
                        <button
                          type="button"
                          data-signal-artwork-action="studio"
                          title="Regenerate the Dark studio and its source-linked Light variant"
                          onClick={() => void regenerateStudio()}
                          disabled={busy || selectedShowArtworkBusy}
                        >
                          Refresh studio
                        </button>
                        <button
                          type="button"
                          data-signal-artwork-action="day-studio"
                          title={
                            selectedShow.nightAtmosphere.imageId
                              ? "Generate a new Light studio from the current Dark studio"
                              : "Create or replace the Dark studio first"
                          }
                          onClick={() => void regenerateLightStudio()}
                          disabled={
                            busy ||
                            selectedShowArtworkBusy ||
                            !selectedShow.nightAtmosphere.imageId
                          }
                        >
                          Refresh Light
                        </button>
                        <button
                          type="button"
                          data-signal-artwork-action="studio-lighting"
                          title={
                            selectedShow.studioLighting.status === "stale"
                              ? "The Studio pair changed. Rebuild its surface-aware ambient receiver map."
                              : selectedShow.studioLighting.status === "ready"
                                ? "Regenerate realistic ambient lighting from the current Studio pair"
                                : "Generate realistic ambient lighting from the current Studio pair"
                          }
                          onClick={() => void refreshStudioLighting()}
                          disabled={
                            busy ||
                            selectedShowArtworkBusy ||
                            !selectedShow.dayAtmosphere.imageId ||
                            !selectedShow.nightAtmosphere.imageId
                          }
                        >
                          {studioLightingBusy
                            ? "Refreshing lighting…"
                            : "Refresh Studio Lighting"}
                        </button>
                        <button
                          type="button"
                          className={styles.assetUploadButton}
                          title="Upload a replacement for the Light Mode studio"
                            onClick={() =>
                              lightStudioUploadRef.current?.click()
                            }
                          disabled={busy || selectedShowArtworkBusy}
                        >
                          Replace Light
                        </button>
                        <button
                          type="button"
                          className={styles.assetUploadButton}
                          title="Upload a replacement for the Dark Mode studio"
                          onClick={() => darkStudioUploadRef.current?.click()}
                          disabled={busy || selectedShowArtworkBusy}
                        >
                          Replace Dark
                        </button>
                      </div>
                      <div className={styles.showLookControlGroup}>
                        <span>Logo</span>
                        <button
                          type="button"
                          data-signal-artwork-action="logo"
                          onClick={() => void regenerateLogo()}
                          disabled={busy || selectedShowArtworkBusy}
                        >
                          Refresh logo
                        </button>
                        <button
                          type="button"
                          className={styles.assetUploadButton}
                          title="Upload a replacement show logo"
                          onClick={() => logoUploadRef.current?.click()}
                          disabled={busy || selectedShowArtworkBusy}
                        >
                          Replace logo
                        </button>
                      </div>
                      <div className={styles.showLookControlGroup}>
                          <span>Atmosphere audio</span>
                        <button
                          type="button"
                          onClick={() => void generateShowIntroAudio()}
                          disabled={busy || preferredProvider === "local"}
                            title={
                              preferredProvider === "local"
                                ? "Switch to Online to create an ElevenLabs atmosphere"
                                : undefined
                            }
                        >
                          {selectedShow.introAudio.source === "elevenlabs" ||
                          selectedShow.atmosphereAudio.source === "elevenlabs"
                              ? "Refresh atmosphere"
                              : "Create atmosphere"}
                        </button>
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
                      hostBot.muted
                        ? `${hostBot.name} cannot speak while muted`
                        : hostChatOpen
                          ? `Close off-air chat with ${hostBot.name}`
                          : `Talk off-air with ${hostBot.name} about ${selectedShow.name}`
                    }
                    aria-expanded={hostChatOpen}
                    aria-controls={`signal-show-host-chat-${selectedShow.id}`}
                    disabled={hostBot.muted || showIdentityControlsExpanded}
                    title={
                      hostBot.muted
                        ? "This host’s mute Power prevents off-air speech."
                        : `Talk with ${hostBot.name} about this show and its episodes`
                    }
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
                      facing: "left",
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
                        ? "A cached eight-second host ident, its paired four-second closing outdent, and a quiet studio-specific room-and-Foley loop. Nothing is generated when an episode begins or ends."
                        : "Signal Synth opens and closes the show with one host-specific musical identity, backed by this studio’s cached room-and-Foley loop. Nothing is generated when an episode begins."
                      : "Signal Synth opens and closes the show with one host-specific musical identity while a bundled, non-musical room atmosphere sits quietly behind the conversation. Tactile cup and vocal Foley remain synchronized to the studio action."}
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
                    listen back. Reviews appear at least four hours after the
                    broadcast, and the show rating averages the saved results.
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
                  <strong>
                    {showAudience.rating === null
                      ? "—"
                      : `${showAudience.rating.toFixed(1)} ★`}
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
                    Library to rate it. Their review appears at least four hours
                    after the broadcast.
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
    </main>
    <PrismBlockingLoader
      open={blockingOperation !== null}
      title={blockingOperation?.title ?? "PRISM is working"}
      detail={blockingOperation?.detail ?? "Preparing your workspace."}
      stepLabel={blockingOperation?.stepLabel ?? "Working"}
      progress={blockingOperation?.progress}
      theme={theme}
        onCancel={
          blockingOperation?.cancellable ? cancelBlockingOperation : undefined
        }
      cancelLabel="Cancel synthesis"
    />
    </>
  );
}
