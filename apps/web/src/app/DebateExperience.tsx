"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
  DEBATE_EVIDENCE_SOURCE_MAX_COUNT,
  DEBATE_FORMAT_CATALOG,
  DEBATE_FORMALITY_SPECTRUM,
  DEBATE_JUDGE_GAVEL_MESSAGE_MAX_LENGTH,
  DEBATE_PLAYER_JUDGE_BOT_ID,
  DEBATE_PLAYER_TURN_MAX_LENGTH,
  DEBATE_SCHEMA_VERSION,
  DEBATE_SETUP_PRESETS,
  botPowerObserverProjectionFromEffectsV1,
  debateEventIsTranscriptHousekeeping,
  debateFormalityDescriptor,
  debateSpokenText,
  type DebateAdvocacyConsent,
  type DebateCaseCardV1,
  type DebateEventV1,
  type DebateEvidencePacketV1,
  type DebateEvidenceSourceV1,
  type DebateFormalityId,
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
  type GraphicsQuality,
  type ResponseMode,
} from "@localai/shared";
import {
  PrismRefractTarget,
  type PrismRefractMagicTarget,
} from "./prismRefract";
import styles from "./DebateExperience.module.css";
import type { DebateForumRole } from "./DebateForumScene";
import {
  copyDebateMotionSlate,
  applyDebateSetupPreset,
  debateAlignmentPreviewCast,
  debateMotionRevealState,
  debatePlayerJudgePrefilledCast,
  derivedDebateSetupPresetId,
  mergeDebateEvidenceSources,
  randomDebateCast,
  randomDebatePlayerJudgeCast,
  type DebateCastSelection,
} from "./debateExperienceState";
import { randomDebateEvidenceQuery } from "./debateEvidenceRandomizer";
import {
  debateJudgeGuidedStepKind,
  debateJudgeQuickChoices,
  type DebateJudgeGuidedStepKind,
  type DebateJudgeQuickChoice,
} from "./debateJudgeQuickChoices";
import { randomDebateTerritory } from "./debateTerritoryRandomizer";
import {
  debateMarkdownSource,
  debateGalleryReactingIndices,
  debateGalleryReaction,
  debateRevealDurationMs,
  debateSourceFromMarkdownHref,
  debateTranscriptIsAtLive,
  debateTurnClockState,
  debateTurnOwnerBotId,
  debateVisibleContentAtProgress,
} from "./debatePresentation";
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
  DEBATE_STAGE_LIGHT_BLEND_MODES,
  DEBATE_STAGE_LIGHT_MASK_OPACITY_MAX,
  DEBATE_STAGE_LIGHT_MASK_OPACITY_MIN,
  DEBATE_STAGE_LIGHT_MASK_OPACITY_STEP,
  DEFAULT_DEBATE_STAGE_ALIGNMENT,
  copyDebateStageAlignment,
  debateStageAlignmentOffset,
  debateStageAlignmentStyle,
  debateStageAlignmentTarget,
  formatDebateStageAlignmentClipboard,
  formatDebateStageGavelClipboard,
  normalizeDebateStageAlignment,
  readDebateStageAlignment,
  updateDebateStageAlignmentOffset,
  updateDebateStageGavelPose,
  updateDebateStageLightBlendMode,
  updateDebateStageLightMaskOpacity,
  writeDebateStageAlignment,
  type DebateStageAlignmentItem,
  type DebateStageAlignmentRole,
  type DebateStageAlignmentTarget,
  type DebateStageAlignmentV6,
  type DebateStageLightBlendMode,
  type DebateStageOffsetV1,
} from "./debateStageAlignment";
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
  type SessionAmbientBotVocalizationCue,
  type SessionAmbientFoleyProfile,
  type SessionAtmosphereController,
  type SessionAtmosphereMix,
} from "./session-atmosphere-audio";
import {
  DEBATE_GAVEL_FOLEY_URLS,
  DEBATE_GAVEL_ORDER_CAMERA_CUT_MS,
  debateModeratorGavelCue,
  debateModeratorGavelSpeechLeadMs,
  debateVocalFoleyTargetId,
  type DebateModeratorGavelCue,
} from "./debateFoley";
import {
  DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS,
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
  format: DebateFormatId;
  sessionId: string;
  speaker: DebateBotSummary | null;
  player: boolean;
  playerVoice: boolean;
  spokenText: string;
  voiceSourceBotId: string | null;
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
  role: DebateForumRole;
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
  storageScopeId: string;
  preferredProvider: "local" | "openai" | "anthropic";
  responseMode: ResponseMode;
  modelOverride?: {
    provider: "local" | "openai" | "anthropic";
    model: string;
  } | null;
  graphicsQuality: GraphicsQuality;
  theme: "light" | "dark";
  audioEnabled: boolean;
  audioVolume: number;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  renderBotGlyph: BotPickerGlyphRenderer;
  renderBotAvatar?: (
    bot: DebateBotSnapshotV1,
    state: DebateBotAvatarState,
  ) => ReactNode;
  onExit: () => void;
  onResetTutorial?: () => void;
  onUtterance?: (utterance: DebateUtterance) => Promise<boolean>;
  onStopUtterance?: () => void;
  onLiveSessionActiveChange?: (active: boolean) => void;
  renderJudgeComposer?: (composer: DebateJudgeComposerRenderProps) => ReactNode;
  onJudgeComposerReveal?: () => void;
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

type DebateView = "dashboard" | "live";
type DebateStudioPanel = "motion" | "cast" | "evidence" | "archive";
type DebateSetupMode = "basic" | "advanced";
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
  name: "Prism",
  color: "#2fd3e3",
  glyph: "triangle",
  avatarDetails: null,
  voiceProfile: null,
  powers: [],
  systemPrompt: "Prism is the neutral procedural proxy for the human Judge.",
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
const DEBATE_LIVE_SPEECH_RENDER_INTERVAL_MS = 50;
const DEBATE_FOLEY_MIX = {
  background: 0,
  grain: 0,
  foley: 0.34,
} as const satisfies SessionAtmosphereMix;
const DEBATE_AMBIENT_FOLEY_PROFILE = {
  minDelayMs: 14_000,
  maxDelayMs: 32_000,
  trim: 0.44,
} as const satisfies SessionAmbientFoleyProfile;
const DEBATE_VOCAL_FOLEY_PROFILE = {
  minDelayMs: 22_000,
  maxDelayMs: 46_000,
  trim: 0.42,
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
  cameraMode: DebateCameraMode;
  cameraView: DebateCameraView;
}): React.JSX.Element {
  const cameraTransition = props.cameraMode === "auto" ? "cut" : "move";

  return (
    <>
      <div
        className={styles.debaterFocusDepthOverlay}
        data-blur-side="right"
        data-camera-transition={cameraTransition}
        data-visible={props.cameraView === "left" ? "true" : "false"}
        aria-hidden="true"
      />
      <div
        className={styles.debaterFocusDepthOverlay}
        data-blur-side="left"
        data-camera-transition={cameraTransition}
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
  const textRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    const caption = textRef.current;
    if (!caption) return;
    caption.scrollTop = caption.scrollHeight;
  }, [props.eventId, props.text]);

  return (
    <div
      className={styles.liveCaption}
      data-debate-live-caption="true"
      data-event-id={props.eventId}
      data-speaker-kind={props.speakerKind}
      aria-live="off"
    >
      <strong>{props.speakerName}</strong>
      <span ref={textRef} data-caption-rows="2">
        {props.text}
      </span>
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
          : `${displayedSeconds} seconds remaining`
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
          trim: cueKind === "order" ? 0.72 : 0.66,
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
  if (visibleThroughSequence === null) return session.caseBoard;
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
  if (step.startsWith("jury_initial_")) {
    return session.jury.jurors[session.jury.initialBallots.length]?.id ?? null;
  }
  if (step.startsWith("jury_final_")) {
    return session.jury.jurors[session.jury.finalBallots.length]?.id ?? null;
  }
  if (
    step === "intro" ||
    step === "turnabout_intro" ||
    step === "turnabout_spectator_press" ||
    step === "turnabout_ballot_moderator" ||
    step === "jury_closing_moderator" ||
    step === "moderator_to_rebuttal" ||
    step === "moderator_to_closing" ||
    step.endsWith("_prompt") ||
    step === "ballot_moderator"
  ) {
    return session.moderator.id;
  }
  if (
    step === "challenge_participant_partner" ||
    step === "rebuttal_against_partner" ||
    step === "rebuttal_for_partner"
  ) {
    return session.playerSideId === "against"
      ? session.againstAdvocate.id
      : session.forAdvocate.id;
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
  const previousSequence = previous?.events.at(-1)?.sequence ?? 0;
  return next.events.filter(
    (event) =>
      event.sequence > previousSequence &&
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
      (event.kind === "speech" ||
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

function debateJuryCameraIsActive(
  cameraMode: DebateCameraMode,
  session: DebateSessionV1,
): boolean {
  if (!session.jury.enabled || session.playerRole === "participant") {
    return false;
  }
  if (cameraMode === "jury") return true;
  return (
    cameraMode === "auto" &&
    session.jury.phase !== "waiting" &&
    session.jury.phase !== "disabled" &&
    (session.jury.phase !== "complete" ||
      session.stepKey === "jury_aftermath_for")
  );
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
  frozenAt: null,
};

function requestBody(value: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(value) };
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

function phaseLabel(session: DebateSessionV1): string {
  if (session.formatState.format === "turnabout") {
    const phase = session.formatState.phase;
    return `${phase.charAt(0).toUpperCase()}${phase.slice(1)}`;
  }
  return `${session.phase.charAt(0).toUpperCase()}${session.phase.slice(1)}`;
}

function debateAwaitsJuryDeliberationChoice(session: DebateSessionV1): boolean {
  return (
    session.jury.enabled &&
    session.stepKey === "jury_deliberation_0" &&
    session.jury.discussionTurnCount === 0 &&
    session.jury.calledVoteAt === null
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
      return formality === "parliamentary"
        ? "Examine the opposing testimony while your advocate keeps your side’s formal identity."
        : "Press the opposing claims while your advocate keeps your side’s position.";
    }
    return formality === "parliamentary"
      ? "Watch the moderator press every statement before the three-bot public-record resolution."
      : "Watch the moderator press every claim before the three-bot decision.";
  }
  if (role === "judge") {
    return "Ask one challenge and make the final ruling. Bot ballots become an agreement and dissent epilogue.";
  }
  if (role === "participant") {
    return "Take the Challenge and Rebuttal slots for one side. Your bot partner opens and closes.";
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
      return formality === "parliamentary"
        ? "Examine the opposing testimony for your side."
        : "Press the opposing claims for your side.";
    }
    return "Observe a neutral examination of every claim.";
  }
  if (role === "judge") return "Challenge once, then issue the final ruling.";
  if (role === "participant") {
    return "Share the floor with your advocate partner.";
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

function visibleEventName(
  session: DebateSessionV1,
  event: DebateEventV1,
): string {
  if (event.speakerKind === "player") return "You";
  if (event.speakerKind === "system") {
    if (session.format !== "turnabout") return "Forum";
    if (session.formality === "parliamentary") return "Public record";
    if (session.formality === "structured") return "Documented exchange";
    return "Debate floor";
  }
  if (event.speakerBotId === session.moderator.id)
    return session.moderator.name;
  if (event.speakerBotId === session.forAdvocate.id) {
    return session.forAdvocate.name;
  }
  if (event.speakerBotId === session.againstAdvocate.id) {
    return session.againstAdvocate.name;
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
): string {
  const cast = [
    ["Moderator", session.moderator],
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
    `- Frozen generation chain: ${session.generationChain.map((entry) => `${entry.provider}/${entry.model}`).join(" → ")}`,
    ...cast.map(
      ([role, bot]) =>
        `- ${role}: ${bot.name} (${bot.provider}/${bot.model}; bot ${bot.id}; revision ${bot.revision})`,
    ),
    "",
    "## Advocacy consent",
    "",
    ...session.advocacyConsent.map(
      (check) =>
        `- ${visibleEventName(session, {
          speakerKind: "advocate",
          speakerBotId: check.botId,
        } as DebateEventV1)} — ${debateSideLabel(session, check.sideId)}: ${check.status}${check.reason ? ` — ${check.reason}` : ""} (motion ${check.motionHash}; bot revision ${check.botRevision}${check.provider && check.model ? `; ${check.provider}/${check.model}` : ""}${check.autoRecovery ? `; recovered after ${check.autoRecovery.attempts.length} attempts` : ""})`,
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
    "## Event stream",
    "",
    ...session.events
      .filter((event) => !debateEventIsTranscriptHousekeeping(event))
      .flatMap((event) => [
        `### ${String(event.sequence).padStart(3, "0")} · ${event.phase} · ${event.kind}`,
        "",
        `- Speaker: ${visibleEventName(session, event)} (${event.speakerKind})`,
        `- Side: ${debateSideLabel(session, event.sideId)}`,
        `- Step: ${event.stepKey}`,
        `- Statement: ${event.statementId ?? "None"}`,
        `- Evidence item: ${event.evidenceSourceId ?? "None"}`,
        `- Ruling: ${event.ruling ?? "None"}`,
        `- At: ${event.createdAt}`,
        `- Sources: ${event.sourceIds.length > 0 ? event.sourceIds.join(", ") : "None"}`,
        `- Generation: ${event.provider && event.model ? `${event.provider}/${event.model}${event.autoRecovery ? ` after ${event.autoRecovery.attempts.length} attempts` : ""}` : "Not model-generated"}`,
        `- Delivery: ${
          event.interrupted
            ? `Interrupted by ${event.interruptedBy ?? "unknown"}`
            : "Complete"
        }`,
        "",
        event.content,
        "",
      ]),
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
            const source = debateSourceFromMarkdownHref(href, evidence);
            if (source) {
              return (
                <button
                  type="button"
                  className={styles.sourceChip}
                  onClick={() => onSource(source.id)}
                  aria-label={`Open source ${source.title}`}
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
  scale: "normal" | "larger" | "smaller";
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
    onLiveSessionActiveChange,
    onStopUtterance,
    onUtterance,
    preferredProvider,
    request,
  } = props;
  const [view, setView] = useState<DebateView>("dashboard");
  const [observerPerspective, setObserverPerspective] = useState<
    "live" | "replay"
  >("live");
  const [setupMode, setSetupMode] = useState<DebateSetupMode>("basic");
  const [studioPanel, setStudioPanel] = useState<DebateStudioPanel>("motion");
  const [sessions, setSessions] = useState<DebateSessionListItemV1[]>([]);
  const [activeSession, setActiveSession] = useState<DebateSessionV1 | null>(
    null,
  );
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<DebateFormatId>("forum");
  const [formality, setFormality] = useState<DebateFormalityId>("plainspoken");
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
  const [evidenceGenerating, setEvidenceGenerating] = useState(false);
  const evidenceSourceLimitReached =
    evidence.sources.length >= DEBATE_EVIDENCE_SOURCE_MAX_COUNT;
  const [playerDraft, setPlayerDraft] = useState("");
  const [turnaboutObjecting, setTurnaboutObjecting] = useState(false);
  const [turnaboutEvidenceSourceId, setTurnaboutEvidenceSourceId] =
    useState("");
  const [judgeTarget, setJudgeTarget] = useState<DebateSideId>("for");
  const [sourceDrawerId, setSourceDrawerId] = useState<string | null>(null);
  const [transcriptCopyState, setTranscriptCopyState] =
    useState<DebateClipboardState>("idle");
  const [pendingDeleteSession, setPendingDeleteSession] =
    useState<DebateSessionListItemV1 | null>(null);
  const [earlyEndOpen, setEarlyEndOpen] = useState(false);
  const [deleteUndo, setDeleteUndo] = useState<DebateDeleteUndo | null>(null);
  const [transcriptAtLive, setTranscriptAtLive] = useState(true);
  const [liveReveal, setLiveReveal] = useState<DebateLiveReveal | null>(null);
  const [
    transcriptVisibleThroughSequence,
    setTranscriptVisibleThroughSequence,
  ] = useState<number | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [liveGavelCue, setLiveGavelCue] =
    useState<DebateModeratorGavelCue | null>(null);
  const [judgeGavelSmashCue, setJudgeGavelSmashCue] =
    useState<DebateModeratorGavelCue | null>(null);
  const [interjectionDraft, setInterjectionDraft] = useState("");
  const [judgeGavelDraft, setJudgeGavelDraft] = useState("");
  const [judgeComposerOpen, setJudgeComposerOpen] = useState(false);
  const [judgeComposerGenerating, setJudgeComposerGenerating] = useState(false);
  const [judgeGavelNowMs, setJudgeGavelNowMs] = useState(() => Date.now());
  const [cameraMode, setCameraMode] = useState<DebateCameraMode>("auto");
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
    useState<"wide" | "moderator">("wide");
  const [stageAlignmentPreviewTheme, setStageAlignmentPreviewTheme] = useState<
    "light" | "dark"
  >(props.theme);
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const presentationRunRef = useRef(0);
  const pausedPresentationReplayRef = useRef<{
    sessionId: string;
    eventId: string;
  } | null>(null);
  const transcriptAutoFollowRef = useRef(true);
  const transcriptUserOwnsViewportRef = useRef(false);
  const transcriptTouchYRef = useRef<number | null>(null);
  const transcriptCopyResetTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const stageAlignmentCopyResetTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const judgeGavelSmashCounterRef = useRef(0);
  const judgeGavelSmashUntilRef = useRef(0);
  const judgeGavelSmashClearTimerRef = useRef<number | null>(null);
  const suppressNextJudgeGavelPresentationCueRef = useRef(false);
  const judgeGavelKeyboardContextRef = useRef({
    liveJudge: false,
    semanticEligible: false,
    cooldownUntilMs: Number.NaN,
  });
  const judgeGavelSmashRef = useRef<
    ((kind: DebateModeratorGavelCue["kind"]) => void) | null
  >(null);
  const swingJudgeGavelRef = useRef<(() => Promise<void>) | null>(null);
  const judgeGavelKeyboardBlocked =
    stageAlignmentOpen ||
    sourceDrawerId !== null ||
    earlyEndOpen ||
    pendingDeleteSession !== null;
  const judgeGavelKeyboardLive =
    view === "live" &&
    activeSession?.playerRole === "judge" &&
    activeSession.status !== "completed" &&
    activeSession.status !== "failed" &&
    activeSession.status !== "cancelled" &&
    activeSession.status !== "paused" &&
    !judgeGavelKeyboardBlocked;
  judgeGavelKeyboardContextRef.current = {
    liveJudge: judgeGavelKeyboardLive,
    semanticEligible:
      judgeGavelKeyboardLive &&
      !busy &&
      activeSession?.judgeGavel?.status !== "awaiting_message",
    cooldownUntilMs: Date.parse(activeSession?.judgeGavelCooldownUntil ?? ""),
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
    const kickoff = window.setTimeout(() => setJudgeGavelNowMs(Date.now()), 0);
    const interval = window.setInterval(() => {
      const now = Date.now();
      setJudgeGavelNowMs(now);
      if (now >= cooldownUntil) window.clearInterval(interval);
    }, 250);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
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
      const semanticAvailable =
        context.semanticEligible &&
        (!Number.isFinite(context.cooldownUntilMs) ||
          context.cooldownUntilMs <= nowMs);
      const action = debateJudgeGavelSpaceAction({
        code: event.code,
        hasModifier:
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
        editableTarget,
        liveJudge: context.liveJudge,
        semanticAvailable,
        nowMs,
        smashUntilMs: judgeGavelSmashUntilRef.current,
      });
      if (!action) return;
      event.preventDefault();
      gavelShortcutTarget?.blur();
      if (action === "smash") {
        judgeGavelSmashRef.current?.("attention");
        return;
      }
      void swingJudgeGavelRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    setJudgeComposerOpen(false);
    setJudgeComposerGenerating(false);
  }, [activeSession?.id, activeSession?.stepKey]);
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
  const mountedRef = useRef(true);

  useEffect(() => {
    if (
      view === "live" &&
      (activeSession?.status === "live" ||
        activeSession?.status === "waiting_for_player") &&
      props.audioEnabled &&
      props.audioVolume > 0
    ) {
      return;
    }
    stopDebateAmbientBotVocalization();
  }, [
    activeSession?.status,
    props.audioEnabled,
    props.audioVolume,
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
      onStopUtterance?.();
      if (transcriptCopyResetTimerRef.current) {
        clearTimeout(transcriptCopyResetTimerRef.current);
        transcriptCopyResetTimerRef.current = null;
      }
      if (stageAlignmentCopyResetTimerRef.current) {
        clearTimeout(stageAlignmentCopyResetTimerRef.current);
        stageAlignmentCopyResetTimerRef.current = null;
      }
      if (judgeGavelSmashClearTimerRef.current) {
        clearTimeout(judgeGavelSmashClearTimerRef.current);
        judgeGavelSmashClearTimerRef.current = null;
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
  }, [loadSessions, onStopUtterance]);
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
  const selectedSource = sourceDrawerId
    ? (activeSession?.evidence.sources.find(
        (source) => source.id === sourceDrawerId,
      ) ??
      evidence.sources.find((source) => source.id === sourceDrawerId) ??
      null)
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
      await writeDebateClipboardText(
        formatDebateVerboseTranscript(activeSession),
      );
      setTranscriptCopyState("copied");
    } catch {
      setTranscriptCopyState("failed");
    }
    transcriptCopyResetTimerRef.current = setTimeout(() => {
      setTranscriptCopyState("idle");
      transcriptCopyResetTimerRef.current = null;
    }, 1_800);
  }, [activeSession, transcriptCopyState]);

  const moderatorBot =
    playerRole === "judge"
      ? DEBATE_PLAYER_JUDGE_PRISM
      : (botById.get(cast.moderator) ?? null);
  const effectiveModeratorBotId = moderatorBot?.id ?? cast.moderator;
  const castIds = [
    effectiveModeratorBotId,
    cast.forAdvocate,
    cast.againstAdvocate,
  ];
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
  const mutedAdvocates = [cast.forAdvocate, cast.againstAdvocate]
    .map((id) => botById.get(id))
    .filter((bot): bot is DebateBotSummary => bot?.hardMuted === true);
  const declinedChecks = roleChecks.filter(
    (check) => check.status === "decline",
  );
  const roleChecksComplete =
    roleChecks.length === 2 && declinedChecks.length === 0;
  const debateCanStart = motionComplete && castComplete && roleChecksComplete;
  const selectedPreset = DEBATE_SETUP_PRESETS.find(
    (preset) => preset.id === selectedPresetId,
  )!;
  const formalityDescriptor = debateFormalityDescriptor(formality);
  const formalityIndex = DEBATE_FORMALITY_SPECTRUM.findIndex(
    (level) => level.id === formality,
  );
  const effectivePresetId = derivedDebateSetupPresetId({
    selectedPresetId,
    format,
    formality,
    playerRole,
    juryEnabled,
  });
  const readinessCount = [
    motionComplete,
    castComplete,
    roleChecksComplete,
    true,
  ].filter(Boolean).length;
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
    setActiveSession(null);
    setTopic("");
    setFormat("forum");
    setFormality(setupMode === "basic" ? "plainspoken" : "parliamentary");
    setSelectedPresetId(
      setupMode === "basic" ? "public-forum" : "classic-duel",
    );
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
    setPlayerDraft("");
    setTurnaboutObjecting(false);
    setTurnaboutEvidenceSourceId("");
    setError(null);
  };

  const chooseSetupMode = (nextMode: DebateSetupMode): void => {
    if (nextMode === setupMode) return;
    setSetupMode(nextMode);
    if (nextMode === "advanced") return;
    setFormat("forum");
    setFormality("plainspoken");
    setSelectedPresetId("public-forum");
    setPlayerRole("judge");
    setActiveCastSlot("forAdvocate");
    setJuryEnabled(false);
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
    setPlayerRole(next.playerRole);
    setActiveCastSlot(
      next.playerRole === "judge" ? "forAdvocate" : "moderator",
    );
    setJuryEnabled(next.juryEnabled);
    setRoleChecks(next.roleChecks);
  };

  const assignBotToCastSlot = (slot: DebateCastSlot, botId: string): void => {
    if (playerRole === "judge" && slot === "moderator") return;
    const bot = botById.get(botId);
    if (!bot) return;
    const castSlots =
      playerRole === "judge"
        ? (["forAdvocate", "againstAdvocate"] as const)
        : (["moderator", "forAdvocate", "againstAdvocate"] as const);
    const duplicateSlot = castSlots.find(
      (candidate) => candidate !== slot && cast[candidate] === botId,
    );
    if (duplicateSlot) return;
    const nextCast = { ...cast, [slot]: botId };
    setCast(nextCast);
    setRoleChecks([]);
    const slotOrder: DebateCastSlot[] =
      playerRole === "judge"
        ? ["forAdvocate", "againstAdvocate"]
        : ["moderator", "forAdvocate", "againstAdvocate"];
    const activeIndex = slotOrder.indexOf(slot);
    const nextIncomplete = [
      ...slotOrder.slice(activeIndex + 1),
      ...slotOrder.slice(0, activeIndex + 1),
    ].find((candidate) => !nextCast[candidate]);
    if (nextIncomplete) setActiveCastSlot(nextIncomplete);
  };

  const clearCastSlot = (slot: DebateCastSlot): void => {
    if (playerRole === "judge" && slot === "moderator") return;
    setCast((current) => ({ ...current, [slot]: "" }));
    setRoleChecks([]);
    setActiveCastSlot(slot);
  };

  const randomizeCast = (): void => {
    const nextCast =
      playerRole === "judge"
        ? randomDebatePlayerJudgeCast(bots.map((bot) => bot.id))
        : randomDebateCast(bots.map((bot) => bot.id));
    if (!nextCast) return;
    setCast((current) => ({
      ...nextCast,
      moderator:
        playerRole === "judge" ? current.moderator : nextCast.moderator,
    }));
    setRoleChecks([]);
    setActiveCastSlot(playerRole === "judge" ? "forAdvocate" : "moderator");
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
    debateStageAlignmentTarget(role, item, stageAlignmentPreviewCamera);

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

  const synthesize = useCallback(async (): Promise<void> => {
    if (!topic.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ slates: DebateMotionSlateV1[] }>(
        "/api/debates/synthesize",
        requestBody({
          topic,
          formality,
          preferredProvider: props.modelOverride?.provider ?? preferredProvider,
          modelOverride: props.modelOverride?.model,
          responseMode: props.responseMode,
        }),
      );
      setSlates(result.slates);
      setMotion(result.slates[0] ?? EMPTY_SLATE);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Synthesis was unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    preferredProvider,
    props.modelOverride?.model,
    props.modelOverride?.provider,
    props.responseMode,
    request,
    formality,
    topic,
  ]);

  const synthesisMagic = useMemo<PrismRefractMagicTarget>(
    () => ({
      id: "debate:synthesize-motion-options",
      label: "Synthesize debate options",
      kind: "magic",
      disabled: () => !topic.trim() || busy,
      run: () => synthesize(),
    }),
    [busy, synthesize, topic],
  );

  const selectSlate = (slate: DebateMotionSlateV1): void => {
    setMotion(copyDebateMotionSlate(slate));
    setRoleChecks([]);
  };

  const checkRoles = async (): Promise<boolean> => {
    if (!castComplete) return false;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ checks: DebateAdvocacyConsent[] }>(
        "/api/debates/role-checks",
        requestBody({
          format,
          formality,
          motion,
          forAdvocateBotId: cast.forAdvocate,
          againstAdvocateBotId: cast.againstAdvocate,
          preferredProvider:
            props.modelOverride?.provider ?? props.preferredProvider,
          modelOverride: props.modelOverride?.model,
          responseMode: props.responseMode,
        }),
      );
      setRoleChecks(result.checks);
      return result.checks.every((check) => check.status !== "decline");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The private role check was unavailable.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const swapAdvocates = (): void => {
    setCast((current) => ({
      ...current,
      forAdvocate: current.againstAdvocate,
      againstAdvocate: current.forAdvocate,
    }));
    setRoleChecks([]);
  };

  const research = async (
    queryOverride?: string,
    generated = false,
  ): Promise<void> => {
    const query = (queryOverride ?? researchQuery).trim();
    if (
      !query ||
      props.responseMode === "local" ||
      evidenceSourceLimitReached
    ) {
      return;
    }
    setBusy(true);
    setEvidenceGenerating(generated);
    setError(null);
    try {
      const result = await props.request<{
        sources: DebateEvidenceSourceV1[];
      }>(
        "/api/debates/research",
        requestBody({
          query,
          preferredProvider: props.preferredProvider,
          responseMode: props.responseMode,
        }),
      );
      setEvidence((current) => ({
        ...current,
        sources: mergeDebateEvidenceSources(current.sources, result.sources),
      }));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Research was unavailable.",
      );
    } finally {
      setEvidenceGenerating(false);
      setBusy(false);
    }
  };

  const generateEvidence = async (): Promise<void> => {
    const query = randomDebateEvidenceQuery(motion.motion, topic);
    if (!query) {
      setError("Shape the motion before generating evidence.");
      return;
    }
    setResearchQuery(query);
    await research(query, true);
  };

  const revealEventSilently = useCallback(
    (event: DebateEventV1, spokenText: string): Promise<void> =>
      new Promise((resolve) => {
        if (!event.content) {
          resolve();
          return;
        }
        const durationMs = debateRevealDurationMs(spokenText || event.content);
        const speechText = spokenText || event.content;
        if (durationMs <= 0) {
          setLiveReveal({
            eventId: event.id,
            visibleContent: event.content,
            speechTiming: null,
          });
          resolve();
          return;
        }
        const startedAt = performance.now();
        let settled = false;
        const settle = (complete: boolean): void => {
          if (settled) return;
          settled = true;
          if (complete) {
            setLiveReveal({
              eventId: event.id,
              visibleContent: event.content,
              speechTiming: {
                text: speechText,
                elapsedMs: durationMs,
                durationMs,
                alignment: null,
              },
            });
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
          setLiveReveal({
            eventId: event.id,
            visibleContent: debateVisibleContentAtProgress(
              event.content,
              progress,
            ),
            speechTiming: {
              text: speechText,
              elapsedMs: progress * durationMs,
              durationMs,
              alignment: null,
            },
          });
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
    [],
  );

  const consumeNewEvents = useCallback(
    async (
      previous: DebateSessionV1 | null,
      next: DebateSessionV1,
      runId: number,
    ): Promise<void> => {
      const fresh = debatePresentationEvents(
        previous,
        next,
        debateJuryCameraIsActive(cameraMode, next),
      );
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
      for (const event of fresh) {
        if (presentationRunRef.current !== runId) return;
        setTranscriptVisibleThroughSequence(event.sequence);
        const suppressGavelCue =
          event.kind === "judge_gavel" &&
          suppressNextJudgeGavelPresentationCueRef.current;
        if (suppressGavelCue) {
          suppressNextJudgeGavelPresentationCueRef.current = false;
        }
        const gavelCue = suppressGavelCue
          ? null
          : debateModeratorGavelCue({
              format: next.format,
              event,
              moderatorBotId: next.moderator.id,
            });
        setLiveGavelCue(gavelCue);
        const orderCameraCutMs =
          gavelCue?.kind === "order" ? DEBATE_GAVEL_ORDER_CAMERA_CUT_MS : 0;
        if (orderCameraCutMs > 0) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, orderCameraCutMs),
          );
          if (presentationRunRef.current !== runId) return;
        }
        setPresentationEventId(event.id);
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
        if (event.kind === "silence") {
          setLiveReveal({
            eventId: event.id,
            visibleContent: event.content,
          });
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          continue;
        }
        if (event.kind === "judge_gavel" && event.gavelReason !== "resume") {
          setLiveReveal({
            eventId: event.id,
            visibleContent: event.content,
            speechTiming: null,
          });
          await new Promise((resolve) => window.setTimeout(resolve, 260));
          continue;
        }
        if (event.speakerKind === "system") {
          setLiveReveal({ eventId: event.id, visibleContent: "" });
          await revealEventSilently(event, debateSpokenText(event.content));
          if (presentationRunRef.current !== runId) return;
          continue;
        }
        if (
          event.kind === "ballot" &&
          next.ballots.find(
            (ballot) => ballot.voterBotId === event.speakerBotId,
          )?.privateReason
        ) {
          setLiveReveal(null);
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          continue;
        }
        if (event.kind === "ballot" && event.speakerKind === "juror") {
          setLiveReveal(null);
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          continue;
        }
        const spokenText = debateSpokenText(event.content);
        const snapshot = debateBotSnapshot(next, event.speakerBotId);
        const presentation = snapshot
          ? debateBotPresentation(next, snapshot, event.sequence)
          : null;
        const voiceSnapshot = presentation
          ? (debateBotSnapshot(next, presentation.voiceSourceBotId) ?? snapshot)
          : snapshot;
        const speaker = snapshot
          ? {
              id: snapshot.id,
              name: snapshot.name,
              color: snapshot.color,
              glyph: snapshot.glyph,
              avatarDetails: snapshot.avatarDetails,
              voiceProfile: voiceSnapshot?.voiceProfile ?? null,
              powers: snapshot.powers,
              systemPrompt: snapshot.systemPrompt,
              hardMuted: next.powerPlan.bots[snapshot.id]?.hardMuted === true,
            }
          : event.speakerBotId
            ? (bots.find((bot) => bot.id === event.speakerBotId) ?? null)
            : null;
        setLiveReveal({ eventId: event.id, visibleContent: "" });
        let playbackProgressSeen = false;
        let playbackAlignment: VoicePlaybackCharacterAlignment | null = null;
        let playbackDurationMs = Math.max(
          1,
          debateRevealDurationMs(spokenText || event.content),
        );
        let lastSpeechRenderAt = 0;
        const played = await onUtterance?.({
          event,
          format: next.format,
          sessionId: next.id,
          speaker,
          player: event.speakerKind === "player",
          playerVoice:
            next.playerRole === "judge" &&
            next.moderator.id === DEBATE_PLAYER_JUDGE_BOT_ID &&
            (event.speakerKind === "player" ||
              event.speakerBotId === next.moderator.id),
          spokenText,
          voiceSourceBotId: presentation?.voiceSourceBotId ?? null,
          lifecycle: {
            onStart: (durationMs, alignment) => {
              if (presentationRunRef.current !== runId) return;
              playbackAlignment = alignment ?? null;
              playbackDurationMs = Math.max(
                1,
                durationMs ?? playbackDurationMs,
              );
              lastSpeechRenderAt = performance.now();
              setLiveReveal((current) =>
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
              setLiveReveal({
                eventId: event.id,
                visibleContent: debateVisibleContentAtProgress(
                  event.content,
                  elapsedMs / playbackDurationMs,
                ),
                speechTiming: {
                  text: spokenText,
                  elapsedMs: Math.min(playbackDurationMs, elapsedMs),
                  durationMs: playbackDurationMs,
                  alignment: playbackAlignment,
                },
              });
            },
            onEnd: () => {
              if (presentationRunRef.current !== runId) return;
              setLiveReveal({
                eventId: event.id,
                visibleContent: event.content,
                speechTiming: {
                  text: spokenText,
                  elapsedMs: playbackDurationMs,
                  durationMs: playbackDurationMs,
                  alignment: playbackAlignment,
                },
              });
            },
          },
        });
        if (presentationRunRef.current !== runId) return;
        if (!played || !playbackProgressSeen) {
          await revealEventSilently(event, spokenText);
          if (presentationRunRef.current !== runId) return;
        } else {
          setLiveReveal((current) =>
            current?.eventId === event.id
              ? { ...current, visibleContent: event.content }
              : {
                  eventId: event.id,
                  visibleContent: event.content,
                },
          );
        }
      }
      if (presentationRunRef.current !== runId) return;
      setLiveGavelCue(null);
      setLiveReveal(null);
      setTranscriptVisibleThroughSequence(null);
    },
    [bots, cameraMode, onUtterance, revealEventSilently],
  );

  const adoptSession = useCallback(
    async (
      previous: DebateSessionV1 | null,
      next: DebateSessionV1,
    ): Promise<void> => {
      const runId = presentationRunRef.current + 1;
      presentationRunRef.current = runId;
      const fresh = debatePresentationEvents(
        previous,
        next,
        debateJuryCameraIsActive(cameraMode, next),
      );
      const first = fresh[0] ?? null;
      const firstGavelCue = first
        ? debateModeratorGavelCue({
            format: next.format,
            event: first,
            moderatorBotId: next.moderator.id,
          })
        : null;
      if (first) {
        setTranscriptVisibleThroughSequence(first.sequence);
        if (firstGavelCue?.kind !== "order") {
          setPresentationEventId(first.id);
          setLiveReveal({ eventId: first.id, visibleContent: "" });
        }
      } else {
        setTranscriptVisibleThroughSequence(null);
        setPresentationEventId(null);
        setLiveGavelCue(null);
        setLiveReveal(null);
      }
      setPresenting(fresh.length > 0);
      setTurnaboutObjecting(false);
      setTurnaboutEvidenceSourceId("");
      setObserverPerspective("live");
      setActiveSession(next);
      try {
        await consumeNewEvents(previous, next, runId);
      } finally {
        if (presentationRunRef.current === runId) {
          setPresenting(false);
        }
      }
      void loadSessions();
    },
    [cameraMode, consumeNewEvents, loadSessions],
  );

  const openSession = async (
    archived: DebateSessionListItemV1,
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const perspective = archived.status === "completed" ? "replay" : "live";
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(archived.id)}?perspective=${perspective}`,
      );
      setCameraMode("auto");
      setTurnaboutObjecting(false);
      setTurnaboutEvidenceSourceId("");
      setObserverPerspective(perspective);
      setActiveSession(result.session);
      setView("live");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Debate not found.");
    } finally {
      setBusy(false);
    }
  };

  const startDebate = async (): Promise<void> => {
    if (!debateCanStart) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        "/api/debates",
        requestBody({
          presetId: effectivePresetId,
          format,
          formality,
          motion,
          evidence,
          moderatorBotId: effectiveModeratorBotId,
          playerJudgeUsesPrism: playerRole === "judge",
          forAdvocateBotId: cast.forAdvocate,
          againstAdvocateBotId: cast.againstAdvocate,
          playerRole,
          playerSideId: playerRole === "participant" ? playerSideId : null,
          jury: {
            enabled: juryEnabled,
            cadence: "natural-five",
          },
          advocacyConsent: roleChecks,
          preferredProvider:
            props.modelOverride?.provider ?? props.preferredProvider,
          modelOverride: props.modelOverride?.model,
          responseMode: props.responseMode,
          theme: props.theme,
          idempotencyKey: nextMutationKey("create"),
        }),
      );
      if (mountedRef.current) setBusy(false);
      setCameraMode("auto");
      setView("live");
      await adoptSession(null, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Debate could not start.",
      );
    } finally {
      setBusy(false);
    }
  };

  const advance = useCallback(
    async (skip = false): Promise<void> => {
      const previous = activeSession;
      if (!previous || busy || presenting) return;
      setBusy(true);
      setError(null);
      try {
        const result = await request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(previous.id)}/advance`,
          requestBody({
            expectedRevision: previous.revision,
            idempotencyKey: nextMutationKey(skip ? "skip" : "advance"),
            skip,
            preferredProvider,
          }),
        );
        if (mountedRef.current) setBusy(false);
        await adoptSession(previous, result.session);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "The turn was unavailable.",
        );
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [
      activeSession,
      adoptSession,
      busy,
      nextMutationKey,
      preferredProvider,
      presenting,
      request,
    ],
  );

  useEffect(() => {
    if (
      view !== "live" ||
      !activeSession ||
      activeSession.status !== "live" ||
      busy ||
      presenting ||
      earlyEndOpen ||
      debateAwaitsJuryDeliberationChoice(activeSession)
    ) {
      return;
    }
    const timer = window.setTimeout(() => void advance(false), 520);
    return () => window.clearTimeout(timer);
  }, [activeSession, advance, busy, earlyEndOpen, presenting, view]);

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
    if (choice.content === null) {
      revealJudgeComposer();
      return;
    }
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
    props.onStopUtterance?.();
    if (speechRevealRunRef.current) {
      if (speechRevealRunRef.current.frameId !== null) {
        window.cancelAnimationFrame(speechRevealRunRef.current.frameId);
      }
      speechRevealRunRef.current.cancel();
      speechRevealRunRef.current = null;
    }
    setLiveGavelCue(null);
    setPresenting(false);
  };

  const triggerJudgeGavelSmash = (
    kind: DebateModeratorGavelCue["kind"],
  ): void => {
    judgeGavelSmashCounterRef.current += 1;
    const cue: DebateModeratorGavelCue = {
      eventId: `player-smash:${judgeGavelSmashCounterRef.current}`,
      kind,
    };
    setCameraMode("moderator");
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

  const swingJudgeGavel = async (overtimeOverride?: boolean): Promise<void> => {
    const previous = activeSession;
    if (
      !previous ||
      previous.playerRole !== "judge" ||
      previous.judgeGavel?.status === "awaiting_message" ||
      busy
    ) {
      return;
    }
    const target =
      presenting && presentationEventId
        ? (previous.events.find((event) => event.id === presentationEventId) ??
          null)
        : null;
    const heardCharacterCount =
      target && liveReveal?.eventId === target.id
        ? liveReveal.visibleContent.length
        : (target?.content.length ?? 0);
    const targetClock =
      target && liveReveal?.eventId === target.id
        ? debateTurnClockState(target, liveReveal.speechTiming ?? null)
        : null;
    const overtime =
      overtimeOverride ??
      (target?.speakerKind === "advocate" &&
        targetClock?.status === "overtime");
    if (presenting) cancelCurrentPresentation();
    judgeGavelSmashUntilRef.current =
      Date.now() + DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS;
    suppressNextJudgeGavelPresentationCueRef.current = true;
    triggerJudgeGavelSmash(overtime ? "attention" : "order");
    setBusy(true);
    setError(null);
    try {
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
      await adoptSession(
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
    } catch (caught) {
      judgeGavelSmashUntilRef.current = 0;
      suppressNextJudgeGavelPresentationCueRef.current = false;
      setError(
        caught instanceof Error
          ? caught.message
          : "The Judge's gavel was unavailable.",
      );
      setTranscriptVisibleThroughSequence(null);
      setLiveReveal(null);
    } finally {
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
    if (!previous || busy) return;
    const resume = previous.status === "paused";
    const interruptedPresentationEvent =
      !resume && presentationEventId
        ? (previous.events.find((event) => event.id === presentationEventId) ??
          null)
        : null;
    if (!resume) {
      pausedPresentationReplayRef.current =
        interruptedPresentationEvent !== null &&
        liveReveal?.eventId === interruptedPresentationEvent.id &&
        liveReveal.visibleContent.length <
          interruptedPresentationEvent.content.length
          ? {
              sessionId: previous.id,
              eventId: interruptedPresentationEvent.id,
            }
          : null;
    }
    const pausedPresentationEvent =
      resume && pausedPresentationReplayRef.current?.sessionId === previous.id
        ? (previous.events.find(
            (event) =>
              event.id === pausedPresentationReplayRef.current?.eventId,
          ) ?? null)
        : null;
    const shouldReplayPausedPresentation =
      resume && pausedPresentationEvent !== null;
    if (!resume) cancelCurrentPresentation();
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/${
          resume ? "resume" : "pause"
        }`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey(resume ? "resume" : "pause"),
        }),
      );
      if (shouldReplayPausedPresentation && pausedPresentationEvent) {
        if (mountedRef.current) setBusy(false);
        const replaySession = {
          ...result.session,
          events: result.session.events.filter(
            (event) => event.sequence <= pausedPresentationEvent.sequence,
          ),
        };
        await adoptSession(
          {
            ...previous,
            events: previous.events.filter(
              (event) => event.sequence < pausedPresentationEvent.sequence,
            ),
          },
          replaySession,
        );
        setActiveSession(result.session);
        pausedPresentationReplayRef.current = null;
      } else if (!resume) {
        if (mountedRef.current) setBusy(false);
        await adoptSession(previous, {
          ...result.session,
          status: previous.status,
        });
        setActiveSession(result.session);
      } else {
        pausedPresentationReplayRef.current = null;
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
        pausedPresentationReplayRef.current = null;
        setTranscriptVisibleThroughSequence(null);
        setLiveReveal(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const endDebateEarly = async (): Promise<void> => {
    const previous = activeSession;
    if (!previous || busy || presenting) return;
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

  const skipJuryDeliberation = async (): Promise<void> => {
    const previous = activeSession;
    if (
      !previous ||
      busy ||
      presenting ||
      !previous.jury.enabled ||
      !previous.stepKey.startsWith("jury_deliberation_")
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/jury/skip-deliberation`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("jury-skip-deliberation"),
        }),
      );
      setEarlyEndOpen(false);
      if (mountedRef.current) setBusy(false);
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Skipping Jury deliberation was unavailable.",
      );
    } finally {
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
    if (
      !previous ||
      !target ||
      target.kind !== "speech" ||
      target.sideId === previous.playerSideId ||
      !liveReveal ||
      liveReveal.eventId !== target.id ||
      liveReveal.visibleContent.length < 24 ||
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
          heardCharacterCount: liveReveal.visibleContent.length,
          content: interjectionDraft,
        }),
      );
      if (mountedRef.current) setBusy(false);
      setInterjectionDraft("");
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The moderator could not hear the interjection.",
      );
      setTranscriptVisibleThroughSequence(null);
      setLiveReveal(null);
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

  const renderArchive = (): React.JSX.Element => (
    <section className={`${styles.historySection} ${styles.archivePanel}`}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Proceeding archive</p>
          <h2>Return to a proceeding</h2>
          <p>
            Resume a live proceeding or revisit the final record without
            disturbing the workbench.
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
        <ul className={styles.sessionList}>
          {sessions.map((session, index) => (
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
                <strong>{session.motion}</strong>
                <span>
                  {session.format === "turnabout" ? "Turnabout" : "Forum"} ·{" "}
                  {debateProductionName(session.format, session.formality)} ·{" "}
                  {debateFormalityDescriptor(session.formality).title} ·{" "}
                  {sessionStatusLabel(session)} · {session.playerRole}
                </span>
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const renderForumReadout = (): React.JSX.Element => {
    const seats = [
      {
        id: "for",
        label: motion.forSide.label || "For",
        bot: botById.get(cast.forAdvocate) ?? null,
        fallback: "#42d9ff",
      },
      {
        id: "moderator",
        label: playerRole === "judge" ? "Judge / Moderator" : "Moderator",
        bot: moderatorBot,
        fallback: "#a995ff",
      },
      {
        id: "against",
        label: motion.againstSide.label || "Against",
        bot: botById.get(cast.againstAdvocate) ?? null,
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
          <span>
            {setupMode === "basic"
              ? "Debate preview"
              : `${debateProductionName(format, formality)} schematic`}
          </span>
          <strong>{readinessCount}/4 locked</strong>
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
        {setupMode === "advanced" ? (
          <small className={styles.formatReadout}>
            {format === "turnabout"
              ? "Two pressable statements per side · frozen evidence only"
              : "Openings · challenges · rebuttals · closings"}
          </small>
        ) : (
          <small className={styles.formatReadout}>
            Plainspoken Forum · you make the final call
          </small>
        )}
      </section>
    );
  };

  const renderLobby = (): React.JSX.Element => (
    <main
      className={`${styles.lobby} ${styles.dashboard}`}
      data-debate-surface="dashboard"
      data-debate-format={format}
      data-debate-setup-mode={setupMode}
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
            {setupMode === "basic"
              ? "Basic setup · Prism fills the brief"
              : `${format === "turnabout" ? "Turnabout" : "Forum"} · ${debateProductionName(format, formality)}`}
          </span>
        </div>
        <div className={styles.lobbyActions}>
          <div
            className={styles.setupModeToggle}
            role="group"
            aria-label="Debate setup detail"
            data-tutorial-target="debate-setup-mode"
          >
            {(["basic", "advanced"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                data-selected={setupMode === mode ? "true" : undefined}
                aria-pressed={setupMode === mode}
                onClick={() => chooseSetupMode(mode)}
              >
                {mode === "basic" ? "Basic" : "Advanced"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={startNewDebate}
            disabled={props.bots.length < (setupMode === "basic" ? 2 : 3)}
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
      {props.bots.length < (setupMode === "basic" ? 2 : 3) ? (
        <p className={styles.notice} role="status">
          {setupMode === "basic"
            ? "Create at least two Library bots to start a Basic Debate."
            : "Create at least three Library bots to enter Advanced Debate."}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.dashboardLayout}>
        <nav className={styles.studioNav} aria-label="Debate Studio">
          <p>
            {setupMode === "basic" ? "Set up the Debate" : "Build the Duel"}
          </p>
          {(
            [
              {
                id: "motion",
                index: "01",
                label: setupMode === "basic" ? "Topic" : "Motion",
                detail: motionComplete
                  ? setupMode === "basic"
                    ? "Debate prepared"
                    : "Bound"
                  : setupMode === "basic"
                    ? "What should they debate?"
                    : "Shape the question",
                complete: motionComplete,
                tutorial: undefined,
              },
              {
                id: "cast",
                index: "02",
                label: setupMode === "basic" ? "Debaters" : "Cast",
                detail: roleChecksComplete
                  ? setupMode === "basic"
                    ? "Both are ready"
                    : "Consent secured"
                  : castComplete
                    ? setupMode === "basic"
                      ? "Check willingness"
                      : "Check consent"
                    : setupMode === "basic"
                      ? "Choose two bots"
                      : "Seat the proceeding",
                complete: castComplete && roleChecksComplete,
                tutorial: "debate-cast",
              },
              {
                id: "evidence",
                index: "03",
                label: setupMode === "basic" ? "Sources" : "Evidence",
                detail:
                  evidence.sources.length > 0 || evidence.notes.trim()
                    ? setupMode === "basic"
                      ? "Context added"
                      : "Packet prepared"
                    : setupMode === "basic"
                      ? "Optional"
                      : "Optional packet",
                complete: true,
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
                  ? "Advanced stage geometry for this account and device."
                  : "Create at least three Library bots to calibrate the Debate stage."
              }
            >
              <span aria-hidden="true">⌖</span>
              Stage geometry
            </button>
          ) : null}
          <div className={styles.studioNavStatus}>
            <span>Launch circuit</span>
            <strong>
              {debateCanStart
                ? format === "turnabout"
                  ? "Record ready"
                  : "Forum ready"
                : "Stand by"}
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
      {selectedSource ? (
        <aside
          className={styles.sourceDrawer}
          role="dialog"
          aria-modal="true"
          aria-labelledby="debate-source-title"
        >
          <button
            ref={sourceDrawerCloseButtonRef}
            type="button"
            onClick={() => setSourceDrawerId(null)}
          >
            Close
          </button>
          <span>{selectedSource.id}</span>
          <h2 id="debate-source-title">{selectedSource.title}</h2>
          <p>{selectedSource.snippet}</p>
          {selectedSource.publishedAt ? (
            <small>{selectedSource.publishedAt}</small>
          ) : null}
          <a href={selectedSource.url} target="_blank" rel="noreferrer">
            Open original source
          </a>
        </aside>
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
        <p className={styles.eyebrow}>
          01 / {setupMode === "basic" ? "Choose a topic" : "Motion chamber"}
        </p>
        <h2>
          {setupMode === "basic"
            ? "What should they debate?"
            : "Shape the fault line"}
        </h2>
        <p>
          {setupMode === "basic"
            ? "Give Prism the idea in your own words. It will turn that into one fair motion and write a private brief for each side."
            : "Choose the rules of the room, give Prism the territory, then tune both sides until the argument feels genuinely live."}
        </p>
      </div>
      {setupMode === "advanced" ? (
        <>
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
            className={styles.formalityControl}
            data-tutorial-target="debate-formality"
          >
            <div>
              <span>Formality</span>
              <strong>{formalityDescriptor.title}</strong>
              <small>{formalityDescriptor.summary}</small>
            </div>
            <input
              type="range"
              min="0"
              max={DEBATE_FORMALITY_SPECTRUM.length - 1}
              step="1"
              value={formalityIndex}
              aria-label="Debate formality"
              aria-valuetext={formalityDescriptor.title}
              aria-describedby="debate-formality-copy"
              onChange={(event) => {
                const next =
                  DEBATE_FORMALITY_SPECTRUM[Number(event.currentTarget.value)];
                if (next && next.id !== formality) {
                  setFormality(next.id);
                  setRoleChecks([]);
                }
              }}
            />
            <div className={styles.formalityStops} aria-hidden="true">
              {DEBATE_FORMALITY_SPECTRUM.map((level) => (
                <span
                  data-current={level.id === formality ? "true" : undefined}
                  key={level.id}
                >
                  {level.title}
                </span>
              ))}
            </div>
            <p id="debate-formality-copy">
              This register freezes with the proceeding; persona voice stays in
              charge.
            </p>
          </div>
          <fieldset
            className={styles.formatPicker}
            data-tutorial-target="debate-format"
          >
            <legend>Debate format</legend>
            {DEBATE_FORMAT_CATALOG.map((option) => (
              <label
                key={option.id}
                data-selected={
                  option.availability === "available" && format === option.id
                    ? "true"
                    : undefined
                }
                data-availability={option.availability}
                aria-disabled={
                  option.availability === "coming_soon" ? "true" : undefined
                }
                tabIndex={option.availability === "coming_soon" ? 0 : undefined}
              >
                <input
                  type="radio"
                  name="debate-format"
                  value={option.id}
                  checked={
                    option.availability === "available" && format === option.id
                  }
                  disabled={option.availability === "coming_soon"}
                  onChange={() => {
                    if (option.availability !== "available") return;
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
                {option.availability === "coming_soon" ? (
                  <b>Coming later</b>
                ) : null}
              </label>
            ))}
          </fieldset>
        </>
      ) : (
        <div className={styles.basicDefaults} role="note">
          <span aria-hidden="true">◇</span>
          <div>
            <strong>Prism handles the setup</strong>
            <small>
              Plainspoken Forum · you judge · Prism moderates · no Jury
            </small>
          </div>
          <button type="button" onClick={() => chooseSetupMode("advanced")}>
            Customize
          </button>
        </div>
      )}
      <div className={styles.motionSeed}>
        <div className={`${styles.field} ${styles.territoryField}`}>
          <label htmlFor="debate-territory">
            {setupMode === "basic" ? "Your idea" : "Territory"}
          </label>
          <div className={styles.territoryInput}>
            <textarea
              id="debate-territory"
              value={topic}
              onChange={(event) => setTopic(event.currentTarget.value)}
              placeholder={
                setupMode === "basic"
                  ? "Is Light really Kira? Should AI art count as art? Who would win in a fight…"
                  : "Housing near transit, whether art can be separated from its creator…"
              }
              rows={3}
            />
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
              {busy
                ? setupMode === "basic"
                  ? "Building…"
                  : "Refracting…"
                : setupMode === "basic"
                  ? "Build the debate"
                  : "Refract into motions"}
              <small>
                {setupMode === "basic"
                  ? "Prism fills the motion and both sides"
                  : "Create three balanced options"}
              </small>
            </button>
          )}
        </PrismRefractTarget>
      </div>
      {setupMode === "advanced" && slates.length > 0 ? (
        <div className={styles.slateGrid} aria-label="Balanced motion options">
          {slates.map((slate) => (
            <button
              type="button"
              key={slate.id}
              onClick={() => selectSlate(slate)}
              data-selected={motion.id === slate.id ? "true" : undefined}
            >
              <strong>{slate.motion}</strong>
              <span>
                {slate.forSide.label} ↔ {slate.againstSide.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {setupMode === "advanced" && motionReveal.motion ? (
        <div
          className={`${styles.motionEditor} ${styles.motionRevealGroup}`}
          data-debate-motion-stage="motion"
        >
          <label className={styles.fieldWide}>
            <span>Motion</span>
            <textarea
              value={motion.motion}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setMotion((current) => ({
                  ...current,
                  id: "custom-motion",
                  motion: value,
                }));
                setRoleChecks([]);
              }}
              rows={3}
            />
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
                      <input
                        value={side.label}
                        placeholder={sideId === "for" ? "For" : "Against"}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setMotion((current) => ({
                            ...current,
                            id: "custom-motion",
                            [sideId === "for" ? "forSide" : "againstSide"]: {
                              ...side,
                              label: value,
                            },
                          }));
                          setRoleChecks([]);
                        }}
                      />
                    </label>
                    {motionReveal.briefs ? (
                      <label
                        className={`${styles.field} ${styles.motionRevealGroup}`}
                        data-debate-motion-stage="briefs"
                      >
                        <span>
                          {sideId === "for" ? "For" : "Against"} brief
                        </span>
                        <textarea
                          value={side.brief}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setMotion((current) => ({
                              ...current,
                              id: "custom-motion",
                              [sideId === "for" ? "forSide" : "againstSide"]: {
                                ...side,
                                brief: value,
                              },
                            }));
                            setRoleChecks([]);
                          }}
                          rows={5}
                        />
                      </label>
                    ) : null}
                  </div>
                );
              })
            : null}
        </div>
      ) : setupMode === "basic" && motionComplete ? (
        <article className={styles.basicMotionCard} aria-live="polite">
          <span>Prism prepared</span>
          <h3>{motion.motion}</h3>
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
          <button
            type="button"
            onClick={() => void synthesize()}
            disabled={busy}
          >
            Try another version
          </button>
        </article>
      ) : null}
      <div className={styles.panelAdvance}>
        <span aria-live="polite">
          {setupMode === "basic"
            ? motionComplete
              ? "The question and both sides are ready."
              : "Describe the idea; Prism will handle the debate brief."
            : motionComplete
              ? "The motion and both positions are bound."
              : !motionReveal.motion
                ? "Add a territory to begin shaping the motion."
                : !motionReveal.positions
                  ? "Shape the motion to reveal its two positions."
                  : !motionReveal.briefs
                    ? "Name both positions to reveal their briefs."
                    : "Brief both positions to cast the proceeding."}
        </span>
        <button
          type="button"
          onClick={() => setStudioPanel("cast")}
          disabled={!motionComplete}
        >
          {setupMode === "basic"
            ? "Choose the debaters"
            : "Cast the proceeding"}{" "}
          <span aria-hidden="true">→</span>
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
            02 /{" "}
            {setupMode === "basic"
              ? "Choose the debaters"
              : format === "turnabout"
                ? "Turnabout cast"
                : "Forum cast"}
          </p>
          <h2>
            {setupMode === "basic" ? "Who should argue?" : "Seat every voice"}
          </h2>
          <p>
            {setupMode === "basic"
              ? "Pick one bot for each side. You make the final call, and Prism quietly handles the room."
              : "Select a seat, cast directly from your Library, then set your place in the room. Advocacy consent stays private and motion-specific."}
          </p>
        </div>
        <button
          type="button"
          className={styles.castRandomizeButton}
          onClick={randomizeCast}
          disabled={bots.length < (playerRole === "judge" ? 2 : 3)}
          aria-label={
            playerRole === "judge"
              ? "Randomly select both advocates"
              : "Randomly select all three actors"
          }
          title={
            bots.length < (playerRole === "judge" ? 2 : 3)
              ? playerRole === "judge"
                ? "At least two Library bots are required"
                : "At least three Library bots are required"
              : playerRole === "judge"
                ? "Randomly select both advocates"
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
          <strong>
            {setupMode === "basic" ? "Surprise me" : "Random actors"}
          </strong>
        </button>
      </div>
      <div className={styles.castSlotGrid}>
        {(
          [
            [
              "moderator",
              playerRole === "judge"
                ? "Judge / Moderator"
                : format === "turnabout"
                  ? "Moderator / Judge"
                  : "Moderator",
            ],
            ["forAdvocate", motion.forSide.label || "For advocate"],
            ["againstAdvocate", motion.againstSide.label || "Against advocate"],
          ] as const
        )
          .filter(([key]) => setupMode === "advanced" || key !== "moderator")
          .map(([key, label]) => {
            const fixedPlayerJudgeModerator =
              key === "moderator" && playerRole === "judge";
            const bot = fixedPlayerJudgeModerator
              ? DEBATE_PLAYER_JUDGE_PRISM
              : (botById.get(cast[key]) ?? null);
            const accent = bot?.color ?? "#8f7cff";
            return (
              <article
                className={styles.castSlot}
                key={key}
                data-active={activeCastSlot === key ? "true" : undefined}
                data-filled={bot ? "true" : undefined}
                data-fixed={
                  fixedPlayerJudgeModerator ? "player-judge" : undefined
                }
                style={{ "--debate-cast-color": accent } as CSSProperties}
              >
                <button
                  type="button"
                  className={styles.castSlotSelect}
                  aria-pressed={activeCastSlot === key}
                  disabled={fixedPlayerJudgeModerator}
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
                    {fixedPlayerJudgeModerator ? (
                      <em>Player voice · Fixed</em>
                    ) : null}
                    {bot?.hardMuted ? <em>Hard-muted</em> : null}
                  </span>
                </button>
                {bot && !fixedPlayerJudgeModerator ? (
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
              activeCastSlot === "moderator"
                ? "Moderator"
                : activeCastSlot === "forAdvocate"
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
              const selected = cast[activeCastSlot] === bot.id;
              const castSlots =
                playerRole === "judge"
                  ? (["forAdvocate", "againstAdvocate"] as const)
                  : (["moderator", "forAdvocate", "againstAdvocate"] as const);
              const otherSlot = castSlots.find(
                (slot) => slot !== activeCastSlot && cast[slot] === bot.id,
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
                    onClick: () => assignBotToCastSlot(activeCastSlot, bot.id),
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
      {setupMode === "advanced" ? (
        <>
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
                  onChange={() => {
                    setPlayerRole(role);
                    setActiveCastSlot(
                      role === "judge" ? "forAdvocate" : "moderator",
                    );
                  }}
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
                    onChange={() => setPlayerSideId(sideId)}
                  />
                  {sideId === "for"
                    ? motion.forSide.label || "For"
                    : motion.againstSide.label || "Against"}
                </label>
              ))}
            </fieldset>
          ) : null}
        </>
      ) : (
        <div className={styles.basicPlayerRole} role="note">
          <span aria-hidden="true">◇</span>
          <p>
            <strong>You are the judge</strong>
            <small>
              Prism moderates the exchange, then asks you which side won.
            </small>
          </p>
        </div>
      )}
      {roleChecks.length > 0 ? (
        <div className={styles.consentList}>
          {roleChecks.map((check) => {
            const bot = botById.get(check.botId);
            return (
              <article key={check.botId} data-status={check.status}>
                <div>
                  <strong>{bot?.name ?? check.botId}</strong>
                  <span>
                    {check.sideId === "for"
                      ? motion.forSide.label
                      : motion.againstSide.label}
                  </span>
                </div>
                <b>
                  {check.status === "accept"
                    ? "Accepted"
                    : check.status === "devils_advocate"
                      ? "Devil’s Advocate"
                      : "Declined"}
                </b>
                {check.reason ? <p>{check.reason}</p> : null}
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
            <button type="button" onClick={swapAdvocates}>
              Swap sides
            </button>
            <button type="button" onClick={() => setRoleChecks([])}>
              Change bot
            </button>
            <button type="button" onClick={() => setStudioPanel("motion")}>
              Revise motion
            </button>
          </div>
        </div>
      ) : null}
      <div className={styles.setupActions}>
        <button
          type="button"
          onClick={swapAdvocates}
          disabled={!cast.forAdvocate && !cast.againstAdvocate}
        >
          Swap advocates
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!castComplete || busy}
          onClick={() => {
            if (roleChecksComplete) {
              setStudioPanel("evidence");
              return;
            }
            if (setupMode === "basic") {
              void checkRoles().then((accepted) => {
                if (accepted) setStudioPanel("evidence");
              });
              return;
            }
            void checkRoles();
          }}
          data-tutorial-target="debate-consent"
        >
          {busy
            ? "Checking privately…"
            : roleChecksComplete
              ? setupMode === "basic"
                ? "Add optional sources →"
                : "Prepare evidence →"
              : setupMode === "basic"
                ? "Make sure they’re willing"
                : "Check advocacy consent"}
        </button>
      </div>
    </section>
  );

  const renderEvidenceStep = (): React.JSX.Element => (
    <section
      className={`${styles.setupPanel} ${styles.dashboardPanel}`}
      data-debate-dashboard-section="evidence"
    >
      <div className={styles.setupCopy}>
        <p className={styles.eyebrow}>
          03 / {setupMode === "basic" ? "Optional context" : "Evidence vault"}
        </p>
        <h2>
          {setupMode === "basic"
            ? "Want to give them anything else?"
            : "Choose what enters the room"}
        </h2>
        <p>
          {setupMode === "basic"
            ? "You can start with nothing else. Add a note or let Prism find public sources when you want the debate grounded in specific context."
            : format === "turnabout"
              ? formality === "parliamentary"
                ? "Every participant receives this same immutable packet. When the record opens, only these frozen sources may be presented."
                : "Every participant receives this same immutable packet. Once Turnabout starts, only these frozen sources may be presented."
              : "Every participant receives this same immutable packet. When the Forum opens, outside research stops."}
        </p>
      </div>
      <label className={styles.fieldWide}>
        <span>
          {setupMode === "basic"
            ? "Anything the debaters should know (optional)"
            : "Player notes"}
        </span>
        <textarea
          value={evidence.notes}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setEvidence((current) => ({
              ...current,
              notes: value,
            }));
          }}
          placeholder={
            setupMode === "basic"
              ? "A fact, rule, scenario, or bit of context you want both sides to use."
              : "Facts, definitions, constraints, or context you want all three bots to share."
          }
          rows={setupMode === "basic" ? 5 : 8}
        />
      </label>
      <div
        className={`${styles.researchBox} ${
          setupMode === "basic" ? styles.basicResearchBox : ""
        }`}
      >
        {setupMode === "advanced" ? (
          <>
            <label className={styles.field}>
              <span>Optional Brave Search</span>
              <input
                value={researchQuery}
                onChange={(event) =>
                  setResearchQuery(event.currentTarget.value)
                }
                placeholder="Search for frozen public evidence"
                disabled={props.responseMode === "local"}
              />
            </label>
            <div className={styles.researchActions}>
              <button
                type="button"
                onClick={() => void research()}
                disabled={
                  props.responseMode === "local" ||
                  !researchQuery.trim() ||
                  evidenceSourceLimitReached ||
                  busy
                }
                title={
                  evidenceSourceLimitReached
                    ? "Remove a source to search again"
                    : undefined
                }
              >
                Search &amp; add
              </button>
              <button
                type="button"
                className={styles.generateEvidenceButton}
                onClick={() => void generateEvidence()}
                disabled={
                  props.responseMode === "local" ||
                  !motion.motion.trim() ||
                  evidenceSourceLimitReached ||
                  busy
                }
                title={
                  evidenceSourceLimitReached
                    ? "Remove a source to search again"
                    : undefined
                }
                aria-label="Generate randomized evidence from the current motion"
              >
                <span aria-hidden="true">◇</span>
                {evidenceGenerating ? "Generating…" : "Add generated search"}
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className={styles.generateEvidenceButton}
            onClick={() => void generateEvidence()}
            disabled={
              props.responseMode === "local" ||
              !motion.motion.trim() ||
              evidenceSourceLimitReached ||
              busy
            }
            title={
              evidenceSourceLimitReached
                ? "Remove a source to search again"
                : undefined
            }
            aria-label="Generate randomized evidence from the current motion"
          >
            <span aria-hidden="true">◇</span>
            {evidenceGenerating
              ? "Finding sources…"
              : evidence.sources.length > 0
                ? "Find more sources"
                : "Find sources for me"}
          </button>
        )}
        {props.responseMode === "local" ? (
          <p>
            {setupMode === "basic"
              ? "LOCAL keeps this offline. Notes still work, and sources stay optional."
              : "LOCAL blocks Brave before network access. Manual and generated research stay unavailable; player notes remain local."}
          </p>
        ) : (
          <p>
            {setupMode === "basic"
              ? `Each search adds distinct real public sources without replacing the ${evidence.sources.length} already locked. ${DEBATE_EVIDENCE_SOURCE_MAX_COUNT} sources maximum; Prism never fabricates them.`
              : `Search again to add distinct real sources without replacing the current packet. Duplicate URLs are skipped; ${DEBATE_EVIDENCE_SOURCE_MAX_COUNT} sources maximum. Nothing is fabricated, and research ends permanently when the Duel starts.`}
          </p>
        )}
      </div>
      {evidence.sources.length > 0 ? (
        <ul className={styles.evidenceList}>
          {evidence.sources.map((source) => (
            <li key={source.id}>
              <button
                type="button"
                onClick={() => setSourceDrawerId(source.id)}
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
      ) : null}
      <div className={styles.packetSeal}>
        <span aria-hidden="true">◇</span>
        <div>
          <strong>
            {evidence.sources.length > 0 || evidence.notes.trim()
              ? "Packet staged"
              : "Empty packet staged"}
          </strong>
          <small>
            {evidence.sources.length} / {DEBATE_EVIDENCE_SOURCE_MAX_COUNT}{" "}
            source{evidence.sources.length === 1 ? "" : "s"} locked ·{" "}
            {evidence.notes.trim() ? "notes included" : "no player notes"}
          </small>
        </div>
        <b>Seals at Start</b>
      </div>
    </section>
  );

  const renderReviewStep = (): React.JSX.Element => (
    <section
      className={`${styles.setupPanel} ${styles.readinessPanel}`}
      data-tutorial-target="debate-readiness"
      data-ready={debateCanStart ? "true" : undefined}
      data-ready-count={readinessCount}
    >
      <div className={styles.setupCopy}>
        <p className={styles.eyebrow}>
          {setupMode === "basic" ? "Ready check" : "Launch circuit"}
        </p>
        <h2>
          {debateCanStart
            ? setupMode === "basic"
              ? "Ready when you are"
              : format === "turnabout"
                ? "The record is ready"
                : "The Forum is ready"
            : setupMode === "basic"
              ? "Almost ready"
              : "Complete the circuit"}
        </h2>
        <p>
          {setupMode === "basic"
            ? "Prism has handled the debate structure. Start keeps this question, these debaters, their consent, and any sources together."
            : "Start locks the format, motion, cast, Jury, consent, model, Powers, and evidence into one proceeding."}
        </p>
      </div>
      <ul className={styles.readinessList}>
        <li data-ready={motionComplete ? "true" : undefined}>
          <span aria-hidden="true">{motionComplete ? "✓" : "1"}</span>
          <div>
            <strong>
              {setupMode === "basic" ? "Question ready" : "Motion shaped"}
            </strong>
            <small>
              {motionComplete
                ? setupMode === "basic"
                  ? "Prism prepared both sides."
                  : "Both positions have a clear brief."
                : setupMode === "basic"
                  ? "Give Prism a topic to prepare."
                  : "Complete the motion, labels, and briefs."}
            </small>
          </div>
        </li>
        <li data-ready={castComplete ? "true" : undefined}>
          <span aria-hidden="true">{castComplete ? "✓" : "2"}</span>
          <div>
            <strong>
              {setupMode === "basic" ? "Debaters chosen" : "Proceeding cast"}
            </strong>
            <small>
              {castComplete
                ? setupMode === "basic"
                  ? "Both sides have a voice."
                  : moderatorHardMuted
                    ? "Three unique seats are filled. The moderator’s silence will shape the proceeding."
                    : "Three unique seats are filled."
                : setupMode === "basic"
                  ? "Choose one bot for each side."
                  : "Fill all three seats with unique bots."}
            </small>
          </div>
        </li>
        <li data-ready={roleChecksComplete ? "true" : undefined}>
          <span aria-hidden="true">{roleChecksComplete ? "✓" : "3"}</span>
          <div>
            <strong>
              {setupMode === "basic" ? "Both are willing" : "Advocacy consent"}
            </strong>
            <small>
              {roleChecksComplete
                ? setupMode === "basic"
                  ? "Both debaters accepted."
                  : "Both advocates accepted their roles."
                : declinedChecks.length > 0
                  ? "Resolve the declined assignment."
                  : setupMode === "basic"
                    ? "Ask privately before starting."
                    : "Run the private role check."}
            </small>
          </div>
        </li>
        <li data-ready="true">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>
              {setupMode === "basic" ? "Sources optional" : "Evidence packet"}
            </strong>
            <small>
              {evidence.sources.length > 0 || evidence.notes.trim()
                ? setupMode === "basic"
                  ? "Your added context is ready."
                  : `${evidence.sources.length} source${evidence.sources.length === 1 ? "" : "s"} and player notes will freeze at Start.`
                : setupMode === "basic"
                  ? "Nothing else is required."
                  : "Evidence is optional; the empty packet will freeze at Start."}
            </small>
          </div>
        </li>
      </ul>
      {setupMode === "advanced" ? (
        <div className={styles.reviewGrid}>
          <article>
            <span>Preset</span>
            <strong>
              {effectivePresetId === "custom" ? "Custom" : selectedPreset.name}
            </strong>
            <p>
              {effectivePresetId === "custom"
                ? "Format, formality, role, or Jury differs from the selected preset."
                : selectedPreset.summary}
            </p>
          </article>
          <article>
            <span>Format</span>
            <strong>
              {format === "turnabout" ? "Turnabout" : "Forum"} ·{" "}
              {debateProductionName(format, formality)}
            </strong>
            <p>
              {format === "turnabout"
                ? "Pressable testimony and frozen-evidence objections"
                : "Structured civic speech and rebuttal"}
            </p>
          </article>
          <article>
            <span>Formality</span>
            <strong>{formalityDescriptor.title}</strong>
            <p>{formalityDescriptor.summary}</p>
          </article>
          <article>
            <span>Motion</span>
            <strong>{motion.motion || "Not yet shaped"}</strong>
            <p>
              {motion.forSide.label || "For"} ↔{" "}
              {motion.againstSide.label || "Against"}
            </p>
          </article>
          <article>
            <span>Cast</span>
            <strong>{moderatorBot?.name} · Moderator</strong>
            <p>
              {botById.get(cast.forAdvocate)?.name} vs.{" "}
              {botById.get(cast.againstAdvocate)?.name}
            </p>
          </article>
          <article>
            <span>Your role</span>
            <strong>
              {playerRole.charAt(0).toUpperCase() + playerRole.slice(1)}
            </strong>
            <p>
              {playerRole === "participant"
                ? `Speaking for ${
                    playerSideId === "for"
                      ? motion.forSide.label
                      : motion.againstSide.label
                  }`
                : roleSummary(playerRole, format, formality)}
            </p>
          </article>
          <article>
            <span>Jury</span>
            <strong>
              {juryEnabled ? "Five seats · sampled at Start" : "Off"}
            </strong>
            <p>
              {juryEnabled
                ? juryRoleDescription(playerRole)
                : "The nonbinding Gallery and traditional three-cast ballot stay intact."}
            </p>
          </article>
          <article>
            <span>Evidence</span>
            <strong>
              {evidence.sources.length} source
              {evidence.sources.length === 1 ? "" : "s"}
            </strong>
            <p>
              {evidence.notes ? "Player notes included" : "No player notes"}
            </p>
          </article>
        </div>
      ) : null}
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
            ? setupMode === "basic"
              ? "The debaters will use the question and context shown here."
              : `Crossing this threshold freezes the ${debatePublicMaterialName(formality).toLowerCase()}.`
            : setupMode === "basic"
              ? `${4 - readinessCount} step${4 - readinessCount === 1 ? "" : "s"} left.`
              : `${4 - readinessCount} lock${4 - readinessCount === 1 ? "" : "s"} remain.`}
        </span>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={busy || !debateCanStart}
          onClick={() => void startDebate()}
          data-tutorial-target="debate-start"
        >
          {busy
            ? format === "turnabout"
              ? formality === "parliamentary"
                ? "Opening the record…"
                : "Opening Turnabout…"
              : "Opening the Forum…"
            : setupMode === "basic"
              ? "Start Debate"
              : format === "turnabout"
                ? "Start Turnabout"
                : "Start Forum"}
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

  const renderCaseBoard = (session: DebateSessionV1): React.JSX.Element => {
    const visibleBoard = debateCaseBoardAtSequence(
      session,
      transcriptVisibleThroughSequence,
    );
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
                {visibleBoard
                  .filter((card) => card.sideId === sideId)
                  .map((card) => (
                    <li key={card.id} data-status={card.status}>
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
              ? "How do you want to redirect the floor?"
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
                data-choice-kind={choice.content === null ? "custom" : "quick"}
                onClick={() => void submitJudgeQuickChoice(kind, choice)}
                disabled={busy}
                aria-label={`${index + 1}. ${choice.label}. ${choice.detail}`}
              >
                <span>{choice.label}</span>
                <small>{choice.detail}</small>
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
              {session.evidence.sources.length > 0 ? (
                session.evidence.sources.map((source) => (
                  <label
                    key={source.id}
                    data-selected={
                      turnaboutEvidenceSourceId === source.id
                        ? "true"
                        : undefined
                    }
                  >
                    <input
                      type="radio"
                      name="turnabout-evidence"
                      value={source.id}
                      checked={turnaboutEvidenceSourceId === source.id}
                      onChange={() => setTurnaboutEvidenceSourceId(source.id)}
                    />
                    <strong>{source.title}</strong>
                    <span>{source.snippet}</span>
                    <small>{source.id}</small>
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
              disabled={busy || session.evidence.sources.length === 0}
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
                : "Deliver your rebuttal"}
        </h2>
        {silentModeratorChallenge ? (
          <p>
            No challenge was spoken. React to the silence, make your own point,
            or pass the open floor to your partner.
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
              : session.playerRole === "participant"
                ? "Pass to partner"
                : "Pass"}
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

  const renderTranscript = (session: DebateSessionV1): React.JSX.Element => (
    <section className={styles.transcript} aria-label="Debate transcript">
      <header className={styles.transcriptHeader}>
        <div>
          <p className={styles.eyebrow}>Proceedings</p>
          <span>Public floor · source-linked</span>
        </div>
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
                (transcriptVisibleThroughSequence === null ||
                  event.sequence <= transcriptVisibleThroughSequence),
            )
            .map((event) => {
              const streaming = liveReveal?.eventId === event.id;
              const content = streaming
                ? liveReveal.visibleContent
                : event.content;
              return (
                <article
                  key={event.id}
                  data-kind={event.kind}
                  data-side={event.sideId ?? undefined}
                  data-streaming={streaming ? "true" : undefined}
                >
                  <header>
                    <strong>{visibleEventName(session, event)}</strong>
                    <span>
                      {event.interrupted
                        ? "interrupted"
                        : event.stepKey.startsWith("persona_reaction_")
                          ? "vocal reaction"
                          : event.kind.replace("_", " ")}{" "}
                      · {event.phase}
                    </span>
                  </header>
                  {content ? (
                    <DebateMarkdownBody
                      content={content}
                      evidence={session.evidence}
                      onSource={setSourceDrawerId}
                    />
                  ) : (
                    <span
                      className={styles.liveProseCursor}
                      aria-label="Speaker is beginning"
                    />
                  )}
                </article>
              );
            })}
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

  const renderGallery = (session: DebateSessionV1): React.JSX.Element => {
    if (session.jury.enabled) {
      const activeJurorId = presentationEventId
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
              <span>5 seats · binding majority</span>
            </div>
            <small>Frozen at Start</small>
          </header>
          <div className={styles.juryRosterSeats}>
            {session.jury.jurors.map((juror, index) => (
              <span
                key={juror.id}
                data-speaking={activeJurorId === juror.id ? "true" : undefined}
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
                <small>{juror.name}</small>
              </span>
            ))}
          </div>
          <p>
            {session.jury.phase === "waiting"
              ? "The frozen roster follows the floor and talks between turns."
              : session.playerRole === "participant"
                ? "The chamber is sealed until the aggregate verdict."
                : session.jury.phase === "complete"
                  ? `The Jury has returned ${session.jury.forVotes}–${session.jury.againstVotes}.`
                  : "The Jury chamber is now in session."}
          </p>
        </aside>
      );
    }
    const presentedPublicEvent = presentationEventId
      ? (session.events.find((event) => event.id === presentationEventId) ??
        null)
      : null;
    const latestPublicEvent =
      (presentedPublicEvent &&
      !debateEventIsTranscriptHousekeeping(presentedPublicEvent)
        ? presentedPublicEvent
        : null) ??
      [...session.events]
        .reverse()
        .find(
          (event) =>
            DEBATE_VISIBLE_TRANSCRIPT_EVENT_KINDS.has(event.kind) &&
            !debateEventIsTranscriptHousekeeping(event),
        ) ??
      null;
    const latestPublicContent =
      latestPublicEvent && liveReveal?.eventId === latestPublicEvent.id
        ? liveReveal.visibleContent
        : (latestPublicEvent?.content ?? "");
    const reaction = debateGalleryReaction(latestPublicContent);
    const reactingIndices = new Set(
      latestPublicEvent
        ? debateGalleryReactingIndices(
            latestPublicContent,
            latestPublicEvent.sequence,
          )
        : [],
    );
    const pulse =
      session.status === "completed"
        ? "The gallery settles as the verdict lands."
        : reaction === "evidence"
          ? "A frozen source catches the room’s attention."
          : reaction === "concession"
            ? "A few prisms soften at the concession."
            : reaction === "question"
              ? "The gallery sharpens around the question."
              : reaction === "divided"
                ? "The room divides along the claim."
                : "The gallery follows the floor.";
    return (
      <aside
        className={styles.audienceGallery}
        aria-label="Nonbinding gallery sample"
        data-phase={session.phase}
        data-reaction={reaction}
      >
        <header>
          <div>
            <p className={styles.eyebrow}>Gallery sample</p>
            <span>7 of many · nonbinding</span>
          </div>
          <small>Session-only reactions</small>
        </header>
        <div className={styles.audienceSeats} aria-hidden="true">
          {DEBATE_GALLERY_COLORS.map((color, index) => (
            <span
              className={styles.audiencePrism}
              data-reacting={reactingIndices.has(index) ? "true" : undefined}
              key={color}
              style={{ "--gallery-prism-color": color } as CSSProperties}
            >
              {props.renderBotGlyph("lucideTriangle", {
                size: 24,
                strokeWidth: 1.5,
              })}
            </span>
          ))}
        </div>
        <p>{pulse}</p>
      </aside>
    );
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
        (activeEvent.kind === "reaction" &&
          activeEvent.speakerKind === "juror"))
        ? liveReveal?.eventId === activeEvent.id
          ? liveReveal.visibleContent
          : activeEvent.content
        : "";
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
    const awaitingDeliberationChoice =
      debateAwaitsJuryDeliberationChoice(session);
    return (
      <div
        className={styles.juryChamber}
        data-phase={session.jury.phase}
        data-theme={props.theme}
        data-tutorial-target="debate-jury-chamber"
      >
        <div className={styles.juryChamberAura} aria-hidden="true" />
        <div className={styles.juryChamberBots}>
          {session.jury.jurors.map((juror, index) => {
            const presentation = debateBotPresentation(
              session,
              juror,
              Number.POSITIVE_INFINITY,
              observerPerspective,
            );
            const appearanceBot =
              debateBotSnapshot(session, presentation.voiceSourceBotId) ??
              juror;
            const talking =
              presenting &&
              activeJurorId === juror.id &&
              activeEvent?.kind !== "silence";
            const speechTiming =
              talking &&
              liveReveal !== null &&
              liveReveal.eventId === activeEvent?.id
                ? (liveReveal.speechTiming ?? null)
                : null;
            const listenerReaction =
              presenting &&
              activeJurorId !== juror.id &&
              reactingJurorIndices.has(index)
                ? chamberListenerReaction
                : null;
            const foleyMouthShape =
              !talking && debateAmbientBotVocalization?.targetId === juror.id
                ? debateAmbientBotVocalizationMouthShape(juror.id)
                : null;
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
                  ) : (
                    <span>
                      {props.renderBotGlyph(juror.glyph ?? "lucideTriangle", {
                        size: 38,
                        strokeWidth: 1.35,
                      })}
                    </span>
                  )}
                </div>
                <small>
                  {index === 0 ? "Foreperson · " : ""}
                  {presentation.displayName}
                </small>
              </div>
            );
          })}
        </div>
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
          aria-label={`${session.jury.finalBallots.length} anonymous Jury ${
            session.jury.finalBallots.length === 1 ? "ballot" : "ballots"
          } collected`}
        >
          {session.jury.finalBallots.map((ballot, ballotIndex) => (
            <span
              className={styles.juryBallotSlip}
              data-seat={session.jury.jurors.findIndex(
                (juror) => juror.id === ballot.jurorBotId,
              )}
              data-ballot={ballotIndex}
              key={ballot.jurorBotId}
              aria-hidden="true"
            >
              <i />
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
                ? "Ballots settling"
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
                : session.jury.phase === "final_ballots"
                  ? "The Jury is voting"
                  : "The chamber is settling"}
          </strong>
          <p>
            {chamberContent ||
              (session.jury.phase === "initial_ballots"
                ? "No leaning is displayed before deliberation."
                : session.jury.phase === "final_ballots"
                  ? activeEvent?.kind === "ballot"
                    ? "An anonymous ballot slides into the center."
                    : "All five ballots are collected before the split is read."
                  : awaitingDeliberationChoice
                    ? "Hear the chamber work through the debate, or send all five jurors directly to final ballots."
                    : session.jury.phase === "waiting"
                      ? "The Jury follows the public floor and talks between turns."
                      : `The ${debatePublicMaterialName(session.formality).toLowerCase()} remains at the center of the table.`)}
          </p>
        </div>
        {awaitingDeliberationChoice ? (
          <div
            className={styles.juryDeliberationChoice}
            data-context="chamber"
            aria-label="Choose whether the Jury deliberates"
          >
            <button
              type="button"
              onClick={() => void advance(false)}
              disabled={busy || presenting}
            >
              Begin deliberation
            </button>
            <button
              type="button"
              onClick={() => setEarlyEndOpen(true)}
              disabled={busy}
            >
              Skip deliberation
            </button>
          </div>
        ) : null}
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
        roleLabel:
          session?.format === "turnabout" ? "Moderator / Judge" : "Moderator",
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
    const previewTargets: readonly DebateStageAlignmentTarget[] =
      stageAlignmentPreviewCamera === "moderator"
        ? DEBATE_STAGE_ALIGNMENT_ITEMS.map((item) =>
            debateStageAlignmentTarget("moderator", item, "moderator"),
          )
        : DEBATE_STAGE_ALIGNMENT_ROLES.flatMap((role) =>
            DEBATE_STAGE_ALIGNMENT_ITEMS.map((item) =>
              debateStageAlignmentTarget(role, item, "wide"),
            ),
          );
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
    const activeGavelPose = stageAlignmentDraft.gavel[stageAlignmentGavelPose];
    const previewIsDefault =
      placementIsDefault &&
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
                    : "Align every bot, nameplate, and glyph plate in the wide Forum without changing the moderator close-up."}{" "}
                  Drag an item or use arrow keys to nudge by 0.5%; hold Shift
                  for 2%. Select the active item in the exact controls below.
                </p>
                <div>
                  <div
                    className={styles.alignmentViewToggle}
                    role="group"
                    aria-label="Debate alignment preview camera"
                  >
                    {(["wide", "moderator"] as const).map((previewCamera) => (
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
                        {previewCamera === "wide" ? "Wide" : "Moderator"}
                      </button>
                    ))}
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
                        stageAlignmentPreviewCamera === "moderator"
                          ? normalizeDebateStageAlignment({
                              ...current,
                              moderator:
                                DEFAULT_DEBATE_STAGE_ALIGNMENT.moderator,
                              gavel: DEFAULT_DEBATE_STAGE_ALIGNMENT.gavel,
                            })
                          : normalizeDebateStageAlignment({
                              ...current,
                              wide: DEFAULT_DEBATE_STAGE_ALIGNMENT.wide,
                            }),
                      )
                    }
                    disabled={previewIsDefault}
                  >
                    {stageAlignmentPreviewCamera === "moderator"
                      ? "Reset moderator"
                      : "Reset positions"}
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
                <section
                  className={styles.alignmentTuner}
                  aria-label="Debate stage position controls"
                  data-camera-view={stageAlignmentPreviewCamera}
                >
                  {interactiveAlignmentCast.map(({ role, bot, sourceBot }) => {
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
                            <span>{DEBATE_STAGE_ALIGNMENT_LABELS[role]}</span>
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
                                setStageAlignmentSelectedItems((current) => ({
                                  ...current,
                                  [role]: item,
                                }))
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
                  })}
                </section>
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
    const judgeGuidedStep = debateJudgeGuidedStepKind({
      playerRole: session.playerRole,
      status: session.status,
      stepKey: session.stepKey,
      judgeGavelStatus: session.judgeGavel?.status,
    });
    const juryCameraActive = debateJuryCameraIsActive(cameraMode, session);
    const activeEvent =
      (presentationEventId
        ? session.events.find((event) => event.id === presentationEventId)
        : null) ??
      [...session.events]
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
        ) ??
      null;
    const activeSpeakerId =
      activeEvent?.speakerBotId ??
      (activeEvent?.speakerKind === "player" &&
      session.playerRole === "judge" &&
      session.moderator.id === DEBATE_PLAYER_JUDGE_BOT_ID
        ? session.moderator.id
        : null);
    const activeColor =
      activeSpeakerId === session.moderator.id
        ? session.moderator.color
        : activeSpeakerId === session.forAdvocate.id
          ? session.forAdvocate.color
          : activeSpeakerId === session.againstAdvocate.id
            ? session.againstAdvocate.color
            : (session.jury.jurors.find((juror) => juror.id === activeSpeakerId)
                ?.color ?? null);
    const activeRole: DebateForumRole | null =
      activeSpeakerId === session.moderator.id
        ? "moderator"
        : activeSpeakerId === session.forAdvocate.id
          ? "for"
          : activeSpeakerId === session.againstAdvocate.id
            ? "against"
            : null;
    const activeGavelCue =
      judgeGavelSmashCue ?? (presenting ? liveGavelCue : null);
    const gavelCameraReady =
      judgeGavelSmashCue !== null ||
      activeGavelCue?.kind !== "order" ||
      presentationEventId === activeGavelCue.eventId;
    const forumPreparingNextTurn =
      busy && !presenting && judgeGavelSmashCue === null;
    const cameraView = juryCameraActive
      ? "jury"
      : cameraMode === "auto" || cameraMode === "jury"
        ? forumPreparingNextTurn
          ? "wide"
          : activeGavelCue && gavelCameraReady
            ? "moderator"
            : debateAutoCameraView(activeRole)
        : cameraMode;
    const canInterject =
      session.format === "forum" &&
      session.playerRole === "participant" &&
      session.status === "live" &&
      presenting &&
      activeEvent?.kind === "speech" &&
      activeEvent.sideId !== null &&
      activeEvent.sideId !== session.playerSideId &&
      liveReveal?.eventId === activeEvent.id &&
      liveReveal.visibleContent.length >= 24 &&
      liveReveal.visibleContent.length < activeEvent.content.length;
    const activePublicContent =
      activeEvent && liveReveal?.eventId === activeEvent.id
        ? liveReveal.visibleContent
        : (activeEvent?.content ?? "");
    const activeCaptionText =
      activeEvent?.kind === "silence"
        ? ""
        : debateSpokenText(activePublicContent).trim();
    const activeSpeechTiming =
      activeEvent && liveReveal?.eventId === activeEvent.id
        ? (liveReveal.speechTiming ?? null)
        : null;
    const activeTurnClock =
      presenting && activeEvent
        ? debateTurnClockState(activeEvent, activeSpeechTiming)
        : null;
    const judgeGavelCooldownRemainingMs = Math.max(
      0,
      Date.parse(session.judgeGavelCooldownUntil ?? "") - judgeGavelNowMs || 0,
    );
    const judgeGavelCooldownSeconds = Math.ceil(
      judgeGavelCooldownRemainingMs / 1_000,
    );
    const pauseOnGavelCooldown =
      session.playerRole === "judge" &&
      session.status !== "paused" &&
      judgeGavelCooldownRemainingMs > 0;
    const judgeCanCallTime =
      presenting &&
      activeEvent?.speakerKind === "advocate" &&
      activeTurnClock?.status === "overtime";
    const judgeGavelAvailable =
      session.playerRole === "judge" &&
      session.status !== "completed" &&
      session.status !== "failed" &&
      session.status !== "cancelled" &&
      session.status !== "paused" &&
      session.judgeGavel?.status !== "awaiting_message";
    const listenerReaction = debateGalleryReaction(activePublicContent);
    const floorLabel =
      activeTurnClock?.status === "overtime"
        ? "Overtime"
        : activeEvent?.kind === "judge_gavel"
          ? activeEvent.gavelReason === "overtime"
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
                  : activeEvent?.kind === "evidence"
                    ? "Frozen evidence"
                    : activeEvent?.kind === "revelation"
                      ? "Reversal"
                      : activeEvent?.kind === "interjection"
                        ? "Floor interrupted"
                        : activeEvent?.kind === "reaction"
                          ? activeEvent.stepKey.startsWith("persona_reaction_")
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
    const thinkingBotId =
      busy && !presenting && session.status === "live"
        ? debateExpectedBotId(session)
        : null;
    const juryChamberVisible = juryCameraActive;
    const juryDeliberating =
      session.jury.enabled && session.stepKey.startsWith("jury_deliberation_");
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
      presenting && activeSpeakerId
        ? activeSpeakerId
        : (turnaboutFloorOwnerBotId ??
          debateTurnOwnerBotId({
            thinkingBotId,
            presenting,
            presentationSpeakerBotId: activeSpeakerId,
          }));
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
        roleLabel: session.motion.forSide.label,
        listenerReaction:
          presenting &&
          activeSpeakerId !== null &&
          activeSpeakerId !== session.forAdvocate.id
            ? listenerReaction
            : null,
      },
      {
        role: "moderator" as const,
        bot: session.moderator,
        presentation: moderatorPresentation,
        roleLabel:
          session.playerRole === "judge" &&
          session.moderator.id === DEBATE_PLAYER_JUDGE_BOT_ID
            ? "Judge / Moderator"
            : session.format === "turnabout"
              ? "Moderator / Judge"
              : "Moderator",
        listenerReaction: null,
      },
      {
        role: "against" as const,
        bot: session.againstAdvocate,
        presentation: againstPresentation,
        roleLabel: session.motion.againstSide.label,
        listenerReaction:
          presenting &&
          activeSpeakerId !== null &&
          activeSpeakerId !== session.againstAdvocate.id
            ? listenerReaction
            : null,
      },
    ];
    const handleDebateAmbientBotVocalization = (
      cue: SessionAmbientBotVocalizationCue,
    ): boolean => {
      if (
        !props.audioEnabled ||
        props.audioVolume <= 0 ||
        (session.status !== "live" &&
          session.status !== "waiting_for_player") ||
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
        : stageCast.map(({ role, bot, presentation }) => ({
            id: bot.id,
            role,
            active: bot.id === activeSpeakerId,
            thinking: bot.id === thinkingBotId,
            hardMuted:
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
      return true;
    };
    return (
      <>
        <SessionAtmosphereLayer
          active={Boolean(
            props.audioEnabled &&
            props.audioVolume > 0 &&
            !participantJurySealed &&
            (presenting ||
              session.status === "live" ||
              session.status === "waiting_for_player"),
          )}
          sessionKey={`debate:${session.id}`}
          volume={props.audioVolume}
          mix={DEBATE_FOLEY_MIX}
          preloadFoleyUrls={DEBATE_GAVEL_FOLEY_PRELOAD_URLS}
          foleyRoomAcoustics={
            session.format === "turnabout"
              ? DEBATE_TURNABOUT_FOLEY_ROOM_SEND
              : DEBATE_FORUM_FOLEY_ROOM_SEND
          }
          ambientFoley
          ambientFoleyProfile={DEBATE_AMBIENT_FOLEY_PROFILE}
          deferFoley={busy && !presenting}
          deferBotVocalization={busy && !presenting}
          ambientBotVocalizations
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
          <header className={styles.liveHeader}>
            <button
              type="button"
              className={styles.exitButton}
              onClick={() => {
                props.onStopUtterance?.();
                setEarlyEndOpen(false);
                setView("dashboard");
                setActiveSession(null);
                void loadSessions();
              }}
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
                {session.motion.motion}
              </h1>
            </div>
            <div className={styles.liveControls}>
              {session.status !== "completed" &&
              session.status !== "failed" &&
              session.status !== "cancelled" ? (
                <>
                  {judgeGavelAvailable ? (
                    <button
                      type="button"
                      className={styles.judgeGavelButton}
                      data-cooling={
                        judgeGavelCooldownRemainingMs > 0 ? "true" : undefined
                      }
                      data-overtime={judgeCanCallTime ? "true" : undefined}
                      data-space-shortcut="true"
                      data-tutorial-target="debate-judge-gavel"
                      onClick={(event) => {
                        event.currentTarget.blur();
                        void swingJudgeGavel(judgeCanCallTime);
                      }}
                      disabled={busy || judgeGavelCooldownRemainingMs > 0}
                      aria-label={
                        judgeGavelCooldownRemainingMs > 0
                          ? `Judge gavel ready in ${judgeGavelCooldownSeconds} seconds`
                          : judgeCanCallTime
                            ? "Swing the Judge gavel to call time. Space also swings it."
                            : "Swing the Judge gavel and address the debaters. Space also swings it."
                      }
                      title={
                        judgeGavelCooldownRemainingMs > 0
                          ? `Gavel cooling down · ${judgeGavelCooldownSeconds}s`
                          : judgeCanCallTime
                            ? "Call time without opening an intervention · Space"
                            : "Call the room to order · Space"
                      }
                    >
                      {judgeGavelCooldownRemainingMs > 0
                        ? `${judgeGavelCooldownSeconds}s`
                        : judgeCanCallTime
                          ? "Call time"
                          : "Gavel"}
                      {judgeGavelCooldownRemainingMs <= 0 ? (
                        <kbd aria-hidden="true">Space</kbd>
                      ) : null}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void pauseOrResume()}
                    disabled={
                      busy ||
                      session.judgeGavel?.status === "awaiting_message" ||
                      pauseOnGavelCooldown
                    }
                    aria-label={
                      pauseOnGavelCooldown
                        ? `Pause available after the gavel cooldown in ${judgeGavelCooldownSeconds} seconds`
                        : session.status === "paused"
                          ? "Resume Debate"
                          : "Pause Debate"
                    }
                    title={
                      pauseOnGavelCooldown
                        ? `Call to order settling · ${judgeGavelCooldownSeconds}s`
                        : undefined
                    }
                  >
                    {session.status === "paused"
                      ? "Resume"
                      : pauseOnGavelCooldown
                        ? `Pause · ${judgeGavelCooldownSeconds}s`
                        : "Pause"}
                  </button>
                  {session.phase !== "verdict" || juryDeliberating ? (
                    <button
                      type="button"
                      className={styles.endEarlyButton}
                      onClick={() => setEarlyEndOpen(true)}
                      disabled={
                        busy ||
                        session.judgeGavel?.status === "awaiting_message" ||
                        (!juryDeliberating && presenting)
                      }
                      aria-label={
                        juryDeliberating
                          ? "Skip Jury deliberation"
                          : "End the Debate early"
                      }
                    >
                      {juryDeliberating ? "Skip deliberation" : "End early"}
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </header>
          <div className={styles.liveWorkspace}>
            <div className={styles.stageColumn}>
              <div className={styles.forum} data-debate-stage-viewport="live">
                {juryChamberVisible ? (
                  renderJuryChamber(session, activeEvent, thinkingBotId)
                ) : (
                  <div
                    className={styles.forumCamera}
                    data-camera-view={cameraView}
                    data-camera-mode={cameraMode}
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
                        listenerReaction: botListenerReaction,
                      }) => {
                        const appearanceBot =
                          debateBotSnapshot(
                            session,
                            presentation.voiceSourceBotId,
                          ) ?? bot;
                        const talking =
                          presenting &&
                          activeSpeakerId === bot.id &&
                          activeEvent?.kind !== "silence";
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
                                props.renderBotAvatar(appearanceBot, {
                                  role,
                                  lookAtRole:
                                    role === "moderator" ? turnOwnerRole : null,
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
                              ) : (
                                <span className={styles.botGlyphFallback}>
                                  {props.renderBotGlyph(presentation.glyph, {
                                    size: 42,
                                    strokeWidth: 1.35,
                                  })}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      },
                    )}
                    <div
                      className={styles.podiumForeground}
                      aria-hidden="true"
                    />
                    <DebateForumLightMasks depth="foreground" />
                    <DebateModeratorGavel
                      theme={props.theme}
                      color={session.moderator.color ?? "#d9d2ff"}
                      cue={activeGavelCue}
                      sessionId={session.id}
                      audioEnabled={
                        props.audioEnabled &&
                        props.audioVolume > 0 &&
                        (session.status !== "paused" ||
                          activeGavelCue !== null) &&
                        moderatorPresentation.visibility !== "hidden"
                      }
                      visible={moderatorPresentation.visibility !== "hidden"}
                      atmosphereControllerRef={debateAtmosphereControllerRef}
                    />
                    {stageCast.map(({ role, bot, presentation }) => (
                      <div
                        className={styles.podiumGlyphPosition}
                        data-role={role}
                        data-turn-active={
                          turnOwnerBotId === bot.id ? "true" : undefined
                        }
                        data-visibility={presentation.visibility}
                        key={`podium-glyph:${bot.id}`}
                        aria-hidden="true"
                      >
                        <span className={styles.podiumGlyphScreen}>
                          <span className={styles.podiumGlyphMark}>
                            {props.renderBotGlyph(presentation.glyph, {
                              size: 48,
                              strokeWidth: 1.5,
                            })}
                          </span>
                        </span>
                      </div>
                    ))}
                    {stageCast.map(({ role, bot, presentation, roleLabel }) => (
                      <div
                        className={styles.botIdentityPosition}
                        data-role={role}
                        data-speaking={
                          activeSpeakerId === bot.id ? "true" : undefined
                        }
                        data-visibility={presentation.visibility}
                        key={`identity:${bot.id}`}
                      >
                        <div className={styles.botIdentityPlate}>
                          <strong>{presentation.displayName}</strong>
                          <small>{roleLabel}</small>
                          {presentation.identityLabel ? (
                            <em>{presentation.identityLabel}</em>
                          ) : null}
                          {role !== "moderator" &&
                          session.advocacyConsent.some(
                            (check) =>
                              check.botId === bot.id &&
                              check.status === "devils_advocate",
                          ) ? (
                            <b>Devil’s Advocate</b>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {session.playerRole === "participant" ? (
                      <div
                        className={styles.playerPresence}
                        data-role="participant"
                        data-side={session.playerSideId ?? undefined}
                      >
                        <span>◇</span>
                        You
                      </div>
                    ) : null}
                  </div>
                )}
                <DebateFocusDepthOverlays
                  cameraMode={cameraMode}
                  cameraView={cameraView}
                />
                {presenting &&
                activeEvent &&
                activeCaptionText &&
                (!juryChamberVisible || activeEvent.speakerKind !== "juror") ? (
                  <DebateLiveCaption
                    eventId={activeEvent.id}
                    speakerKind={activeEvent.speakerKind}
                    speakerName={visibleEventName(session, activeEvent)}
                    text={activeCaptionText}
                  />
                ) : null}
                {session.jury.enabled &&
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
                    <strong>
                      {debateAwaitsJuryDeliberationChoice(session)
                        ? "Choose the Jury’s pace"
                        : "Deliberation sealed"}
                    </strong>
                    <small>
                      {debateAwaitsJuryDeliberationChoice(session)
                        ? "You can let the sealed chamber deliberate or send all five jurors directly to final ballots."
                        : "No juror speech, reaction, voice, or individual ballot enters your record."}
                    </small>
                    {debateAwaitsJuryDeliberationChoice(session) ? (
                      <div
                        className={styles.juryDeliberationChoice}
                        data-context="sealed"
                        aria-label="Choose whether the sealed Jury deliberates"
                      >
                        <button
                          type="button"
                          onClick={() => void advance(false)}
                          disabled={busy || presenting}
                        >
                          Begin deliberation
                        </button>
                        <button
                          type="button"
                          onClick={() => setEarlyEndOpen(true)}
                          disabled={busy}
                        >
                          Skip deliberation
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : session.status === "paused" && !presenting ? (
                  <div className={styles.stageStateOverlay} data-kind="paused">
                    <span aria-hidden="true">Ⅱ</span>
                    <strong>
                      {session.format === "turnabout"
                        ? "Record suspended"
                        : "Forum suspended"}
                    </strong>
                    <small>The exact next action is preserved.</small>
                  </div>
                ) : judgeGuidedStep && !presenting && !juryChamberVisible ? (
                  renderJudgeGuidedControls(session, judgeGuidedStep)
                ) : session.status === "waiting_for_player" &&
                  !presenting &&
                  !juryChamberVisible ? (
                  <div
                    className={styles.stageStateOverlay}
                    data-kind="player"
                    aria-hidden="true"
                  >
                    <span>◇</span>
                    <strong>
                      {session.judgeGavel?.status === "awaiting_message"
                        ? "The gavel has the room"
                        : "The floor turns to you"}
                    </strong>
                    {session.judgeGavel?.status === "awaiting_message" ? (
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
                      ? visibleEventName(session, activeEvent)
                      : session.format === "turnabout"
                        ? "The record"
                        : "The Forum"}
                  </strong>
                </div>
                {presenting && activeEvent ? (
                  <DebateTurnClock
                    event={activeEvent}
                    speechTiming={activeSpeechTiming}
                  />
                ) : null}
                <div
                  className={styles.cameraControls}
                  aria-label="Debate stage cameras"
                  data-tutorial-target="debate-camera"
                >
                  <span>Camera</span>
                  {DEBATE_CAMERA_VIEWS.filter(
                    (camera) =>
                      camera.id !== "jury" ||
                      (session.jury.enabled &&
                        session.playerRole !== "participant"),
                  ).map((camera) => (
                    <button
                      type="button"
                      data-selected={
                        cameraMode === camera.id ? "true" : undefined
                      }
                      aria-pressed={cameraMode === camera.id}
                      onClick={() => setCameraMode(camera.id)}
                      key={camera.id}
                    >
                      {camera.label}
                    </button>
                  ))}
                  {DEBATE_STAGE_ALIGNMENT_ENABLED ? (
                    <details className={styles.cameraAdvanced}>
                      <summary
                        aria-label="More stage controls"
                        title="More stage controls"
                      >
                        •••
                      </summary>
                      <div>
                        <button
                          type="button"
                          className={styles.alignmentLaunchButton}
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
              <div className={styles.stageSupport}>
                {session.format === "turnabout"
                  ? renderTurnaboutRecord(session)
                  : renderCaseBoard(session)}
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
                    {session.stepKey.startsWith("jury_deliberation_") ||
                    !session.stepKey.startsWith("jury_") ? (
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
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              {renderTranscript(session)}
              {session.status === "completed" && !presenting ? (
                <section className={styles.resultCard}>
                  <p className={styles.eyebrow}>Verdict</p>
                  <h2>{verdictLabel(session)}</h2>
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
                      ? Array.from({ length: 7 }, (_, index) => {
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
                  <button type="button" onClick={() => setView("dashboard")}>
                    Return to studio
                  </button>
                </section>
              ) : null}
            </aside>
          </div>
          {canInterject ? (
            <div className={styles.liveCommandDeck} data-kind="interjection">
              <form
                className={styles.interjectionBar}
                onSubmit={submitInterjection}
                data-tutorial-target="debate-interject"
              >
                <div>
                  <p className={styles.eyebrow}>Break the floor</p>
                  <span>The moderator will rule after you cut in.</span>
                </div>
                <textarea
                  value={interjectionDraft}
                  onChange={(event) =>
                    setInterjectionDraft(event.currentTarget.value)
                  }
                  maxLength={600}
                  rows={2}
                  placeholder="Point of order, correction, or direct challenge…"
                />
                <button
                  type="submit"
                  disabled={busy || !interjectionDraft.trim()}
                >
                  Interject now
                </button>
              </form>
            </div>
          ) : null}
          {session.status === "waiting_for_player" &&
          !presenting &&
          judgeGuidedStep === null ? (
            <div className={styles.liveCommandDeck} data-kind="player">
              {renderPlayerWindow(session)}
            </div>
          ) : null}
          {selectedSource ? (
            <aside
              className={styles.sourceDrawer}
              role="dialog"
              aria-modal="true"
              aria-labelledby="debate-source-title"
            >
              <button
                ref={sourceDrawerCloseButtonRef}
                type="button"
                onClick={() => setSourceDrawerId(null)}
              >
                Close
              </button>
              <span>{selectedSource.id}</span>
              <h2 id="debate-source-title">{selectedSource.title}</h2>
              <p>{selectedSource.snippet}</p>
              {selectedSource.publishedAt ? (
                <small>{selectedSource.publishedAt}</small>
              ) : null}
              <a href={selectedSource.url} target="_blank" rel="noreferrer">
                Open original source
              </a>
            </aside>
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
                  {juryDeliberating ? "Jury chamber" : "Accelerated verdict"}
                </p>
                <h2 id="debate-end-early-title">
                  {juryDeliberating
                    ? "Skip Jury deliberation?"
                    : "End this Debate early?"}
                </h2>
                <p id="debate-end-early-description">
                  {juryDeliberating
                    ? "The chamber will skip every remaining discussion turn. All five jurors will still cast final ballots, and the full five-ballot Jury result remains intact."
                    : session.jury.enabled
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
                    {juryDeliberating ? "Keep deliberating" : "Continue Debate"}
                  </button>
                  <button
                    ref={earlyEndConfirmButtonRef}
                    type="button"
                    className={styles.confirmEarlyEndButton}
                    onClick={() =>
                      void (juryDeliberating
                        ? skipJuryDeliberation()
                        : endDebateEarly())
                    }
                    disabled={busy || presenting}
                  >
                    {busy
                      ? juryDeliberating
                        ? "Skipping…"
                        : "Concluding…"
                      : juryDeliberating
                        ? "Skip to ballots"
                        : "Conclude now"}
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

  if (view === "live") return renderLive();
  return renderLobby();
}
