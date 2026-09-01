"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  BOT_IDENTITY_PRESENTATION_TRANSITION_MS,
  DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1,
  DEBATE_SCHEMA_VERSION,
  MANSION_LAYOUT_V2_COLUMNS,
  MANSION_LAYOUT_V2_ROWS,
  botIdentityPresentationTransitionActiveV1,
  debateMysteryMansionBundleEligibleV2,
  debateMysteryTheoryAccusedSeatIdsV2,
  debateMysteryTheoryWithAccusedSeatIdsV2,
  normalizeAccentForTheme,
  normalizeBotIdentityColor,
  normalizeDebateMysteryV2ForgeProgressMessage,
  mansionLayoutV2DoorPoint,
  mansionLayoutV2EntityRect,
  mansionLayoutV2TraversalRoute,
  splitDebateMysteryStageActionTextV2,
  type DebateMysteryActionRequestV2,
  type DebateMysteryCompilationStageV2,
  type DebateMysteryCompilationStatusV2,
  type DebateMysteryProductionCategoryV1,
  type DebateMysteryPublicDialogueEntryV2,
  type DebateMysteryPublicTopicV2,
  type DebateMysteryRecordReferenceV2,
  type DebateMysteryRoomV2,
  type DebateMysterySealedAssetRefV1,
  type DebateMysteryTheoryV1,
  type DebateBotSnapshotV1,
  type DebateSessionV1,
  type DebateWhodunnitFormatStateV2,
  type BotAudioVoiceProfileV1,
  type BotFaceStyle,
  type MansionLayoutBlockV2,
  type MansionDynamicLightV2,
  type MansionTraversalRouteV1,
  type WhodunnitTextVoiceMode,
} from "@localai/shared";
import { SessionAtmosphereLayer } from "./SessionAtmosphereLayer";
import {
  PrismChromeNotice,
  PrismChromeNoticeViewport,
} from "./PrismChromeNotice";
import IdentityPresentationBlackout from "./IdentityPresentationBlackout";
import SceneMediaVignette from "./SceneMediaVignette";
import { debateIdentityAppearanceBotV1 } from "./debateIdentityPresentation";
import {
  debateMysteryIdentityMirrorFaceV1,
  debateMysteryIdentityMirrorPresentationsV1,
  debateMysteryIdentityMirrorTargetBotSnapshotV1,
  debateMysteryPublicIdentityNameV1,
} from "./debateMysteryIdentityMirror";
import {
  WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS,
  WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS,
  WHODUNNIT_INVESTIGATION_MUSIC_URL,
  mysteryInvestigationMusicMix,
} from "./debateMysteryMusic";
import {
  WHODUNNIT_MANSION_AMBIENCE_FADE_MS,
  WHODUNNIT_MANSION_AMBIENCE_TRANSITION_MS,
  mysteryMansionAmbienceAssetV1,
  mysteryMansionAmbienceMixV1,
} from "./debateMysteryMansionAmbience";
import {
  debateMysteryCaptionFallbackShouldStart,
  debateMysteryDialoguePresentationDismissed,
  debateMysteryPreparedAudioShouldStart,
  debateMysteryTextVoiceModeForPresentation,
  debateMysteryTextVoiceShouldStart,
  debateMysteryTextVoiceShouldStop,
  playDebateMysterySfx,
  playDebateMysteryTextVoice,
  type DebateMysterySfxCue,
} from "./debateMysterySfx";
import { teardownBottishVoiceImmediately } from "./bottishVoice";
import { cancelWhodunnitDialogueAudioImmediately } from "./debateMysteryDialogueAudio";
import { mysteryMapOccupantPosition } from "./debateMysteryRoomWalk";
import {
  DEBATE_MYSTERY_V2_MOSAIC_LENS_COLUMNS,
  DEBATE_MYSTERY_V2_MOSAIC_LENS_ROWS,
  debateMysteryV2ExaminationCompletesRoom,
  debateMysteryV2LensMosaicCellIndexes,
  debateMysteryV2HotspotFocusPoint,
  debateMysteryV2LensClickTarget,
  debateMysteryV2RoomComplete,
  resolveDebateMysteryV2Lens,
  type MysteryLensState,
} from "./debateMysteryV2Lens";
import {
  debateMysteryCaseFileObservationsV2,
  debateMysteryNewCaseFileUpdateV2,
  type DebateMysteryCaseFileUpdateV2,
} from "./debateMysteryCaseFile";
import {
  routeAudioElementToPrismOutput,
  type PrismAudioElementRouteCleanup,
} from "./replayAudioMasterCapture";
import { releaseAudibleAudioElement } from "./audibleAudioRelease";
import {
  nextWhodunnitInterrogationPhase,
  startWhodunnitInterrogation,
  whodunnitInterrogationEntrancePhaseForEntry,
  whodunnitActorDriftTiming,
  whodunnitCaptionRevealIsPending,
  whodunnitCaptionSpeechText,
  whodunnitCourtCalloutPresentationVisible,
  whodunnitCourtDialogueGestureCrossedPresentation,
  whodunnitCourtDialogueFinishDecision,
  whodunnitCourtPresentationVisible,
  whodunnitCourtPresentedWitnessSeatId,
  whodunnitDialogueGestureControlIsInteractive,
  whodunnitDialogueGestureDecision,
  whodunnitDialogueTypewriterDurationMs,
  whodunnitInvestigationDialogueGraceMs,
  whodunnitInvestigationDialogueShouldAutoAdvance,
  whodunnitInterrogationAudioOwnsMouth,
  whodunnitInterrogationBeatMs,
  whodunnitInterrogationCompletionIsCurrent,
  whodunnitInterrogationFinishDecision,
  whodunnitInterrogationMayStartAudio,
  type WhodunnitInterrogationPhase,
} from "./debateMysteryInterrogation";
import { SignalVoiceActionText } from "./SignalVoiceActionText";
import { signalVoicePerformanceActionPresentationAtProgress } from "./signalVoicePerformance";
import { debateVoiceCompletionFallbackDurationMs } from "./signalLiveCaptions";
import { createWhodunnitSpeechTimingLoop } from "./debateMysterySpeechTimingLoop";
import {
  resolveWhodunnitCourtCamera,
  whodunnitCourtCameraLabel,
} from "./debateMysteryCourtStage";
import {
  debateMysteryRoomCasekeeperNarrationTextV2,
  debateMysteryRoomIntroductionGestureV2,
  debateMysteryRoomIntroductionShouldAutoCompleteV2,
} from "./debateMysteryRoomIntroduction";
import type { VoicePlaybackCharacterAlignment } from "./voiceEffects";
import type { RoomAcousticsSend } from "./roomAcoustics";
import {
  mysteryMansionCorridorAcousticsV1,
  mysteryMansionRoomAcousticsV1,
  type MysteryMansionRoomAcousticsV1,
} from "./debateMysteryRoomAcoustics";
import {
  mysteryMansionTravelDurationMs,
  mysteryMansionTravelPointAtProgress,
  playMysteryMansionTravelFoleyV1,
  type MysteryMansionTravelFoleyHandleV1,
} from "./debateMysteryMansionTravel";
import type { MysteryBotSummary } from "./DebateMysteryExperience";
import type { BotPickerGlyphRenderer } from "./BotPicker";
import { formatDebateMysteryV2ForgeErrorDetails } from "./debateMysteryV2ForgeFailureDetails";
import {
  debateMysteryForgeAuthoritativePercent,
  debateMysteryForgeStageIsActive,
  formatDebateMysteryForgeElapsed,
  formatDebateMysteryForgeEta,
} from "./debateMysteryV2ForgeProgress";
import { debateMysteryForgeVisualState } from "./debateMysteryV2ForgeVisuals";
import {
  readWhodunnitRoomUpgradeEnabled,
  whodunnitBundledRoomArtPathForRoom,
  whodunnitDiscoveredMansionRoomArtV1,
  whodunnitIllustratedRoomSubjectId,
  whodunnitInvestigationAvatarPresentation,
  whodunnitMansionRoomArtUrl,
  whodunnitRoomArtStyleForUpgrade,
  whodunnitSealedRoomArtUrl,
  whodunnitSavedRoomArtUrl,
  writeWhodunnitRoomUpgradeEnabled,
  type WhodunnitInvestigationArtStyle,
} from "./debateMysteryInvestigationArt";
import { DebateMysteryRoomCinematographyLayer } from "./debateMysteryRoomCinematographyLayer";
import { mysteryRoomUsesTemplateLightGeometryV1 } from "./debateMysteryRoomCinematography";
import {
  debateMysteryMansionDoorTargetV1,
  debateMysteryMansionExteriorFallbackV1,
} from "./debateMysteryMansionExterior";
import styles from "./debateMysteryV2.module.css";

function WhodunnitChromeErrorNotice(props: {
  message: string;
  onDismiss: () => void;
}): React.JSX.Element {
  return (
    <PrismChromeNoticeViewport ariaLabel="Whodunnit notifications">
      <PrismChromeNotice
        label="Whodunnit"
        message={props.message}
        tone="error"
        title={props.message}
        onDismiss={props.onDismiss}
        dismissLabel="Dismiss Whodunnit error"
      />
    </PrismChromeNoticeViewport>
  );
}

interface V2SharedProps {
  bots: MysteryBotSummary[];
  playerName: string;
  playerColor?: string | null;
  playerGlyph?: string | null;
  theme: "light" | "dark";
  audioEnabled: boolean;
  audioVolume: number;
  /** Durable performance already heard before this Archive return. */
  restoredAudioPerformanceKey?: string | null;
  /** Exterior-only mansion cover used by the library, package, and title card. */
  mansionExteriorUrl?: string | null;
  whodunnitTextVoiceMode?: WhodunnitTextVoiceMode;
  playMysteryTextVoice?: (args: {
    instant?: boolean;
    mode: Exclude<WhodunnitTextVoiceMode, "off">;
    voiceProfile: BotAudioVoiceProfileV1 | null;
    seed: string;
    signal?: AbortSignal;
    text: string;
    volume: number;
    roomAcoustics?: RoomAcousticsSend;
  }) => Promise<boolean>;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  renderBotGlyph: BotPickerGlyphRenderer;
  stageAlignmentStyle?: CSSProperties;
  renderMysteryBotAvatar: (
    bot: MysteryBotSummary,
    presentation: "full" | "mini",
    performance?: {
      demeanor: "suspect" | "partner";
      talking?: boolean;
      thinking?: boolean;
      speechTiming?: V2SpeechTiming | null;
      blinkEnabled?: boolean;
      facing?: "left" | "right";
      speechInkVisible?: boolean;
    },
  ) => ReactNode;
}

interface V2SpeechTiming {
  text: string;
  elapsedMs: number;
  durationMs: number;
  alignment: VoicePlaybackCharacterAlignment | null;
  /** This becomes true only from the local audio element's play event. */
  audible: boolean;
}

interface DebateMysteryRoomArtUpgradeStatusV1 {
  version: 1;
  status: "unavailable" | "ready" | "available" | "preparing" | "failed";
  requiresUpgradeRoomIds: string[];
  readyRoomIds: string[];
  failedRoomIds: string[];
  canUpgrade: boolean;
  reason: string | null;
}

interface MysteryDialogueSfxPresentation {
  audible: boolean;
  delivery: NonNullable<DebateMysteryPublicDialogueEntryV2["delivery"]>;
  fullText: string;
  key: string;
  speakerBotId: string | null;
  speakerKind: DebateMysteryPublicDialogueEntryV2["speakerKind"];
  speakerSeatId: string | null;
  streaming: boolean;
  visibleText: string;
}

type MysteryActionDialogue = Pick<
  DebateMysteryPublicDialogueEntryV2,
  "visibleText" | "stageActionText"
>;

const MYSTERY_TALK_CATEGORY_ORDER = ["person", "motive", "alibi", "room", "general"] as const;

const WHODUNNIT_COURT_ATMOSPHERE_MIX = {
  background: 0.14,
  grain: 0,
  foley: 0,
} as const;

const MYSTERY_TALK_CATEGORY_LABELS: Record<
  DebateMysteryPublicTopicV2["subject"]["category"],
  string
> = {
  person: "People",
  motive: "Motives",
  alibi: "Alibis",
  room: "Rooms",
  general: "General",
};

export function debateMysteryTalkTopicDisplayLabelV2(
  topic: DebateMysteryPublicTopicV2,
  rooms: readonly Pick<DebateMysteryRoomV2, "id" | "name">[],
): string {
  const subject = topic.subject;
  if (subject.category !== "room") return topic.label;
  const roomName = rooms.find((room) => room.id === subject.roomId)?.name;
  if (!roomName || topic.label.toLocaleLowerCase().includes(roomName.toLocaleLowerCase())) {
    return topic.label;
  }
  return `${roomName} · ${topic.label}`;
}

export function groupDebateMysteryTalkTopicsV2(
  topics: readonly DebateMysteryPublicTopicV2[],
): Array<{
  category: DebateMysteryPublicTopicV2["subject"]["category"];
  label: string;
  topics: DebateMysteryPublicTopicV2[];
}> {
  return MYSTERY_TALK_CATEGORY_ORDER.flatMap((category) => {
    const categoryTopics = topics.filter((topic) => topic.subject.category === category);
    return categoryTopics.length > 0
      ? [{ category, label: MYSTERY_TALK_CATEGORY_LABELS[category], topics: categoryTopics }]
      : [];
  });
}

function mysterySignalActionPresentation(
  dialogue: MysteryActionDialogue | null,
  speakerName: string | null,
  speechTiming: V2SpeechTiming | null,
) {
  if (!dialogue || !speechTiming) return null;
  const delivery = splitDebateMysteryStageActionTextV2(dialogue.visibleText, speakerName);
  const stageActionText = dialogue.stageActionText ?? delivery.stageActionText;
  if (!stageActionText) return null;
  return signalVoicePerformanceActionPresentationAtProgress({
    content: delivery.spokenText,
    stageActionText,
    voicePerformanceText: null,
  }, speechTiming.elapsedMs / Math.max(1, speechTiming.durationMs));
}

function mysteryRoomActorDriftStyle(seed: string): CSSProperties {
  const timing = whodunnitActorDriftTiming(seed);
  return {
    "--room-actor-drift-duration": `${timing.durationMs}ms`,
    "--room-actor-drift-delay": `${timing.delayMs}ms`,
  } as CSSProperties;
}

interface V2ExperienceProps extends V2SharedProps {
  session: DebateSessionV1;
  onSessionChange: (session: DebateSessionV1) => void;
  onExit: () => void;
}

type V2ReviewCopyState = "idle" | "copying" | "copied" | "failed";

type V2ForgeErrorCopyState = "idle" | "copying" | "copied" | "failed";

interface V2PlayProps extends V2ExperienceProps {
  exteriorIntroStarted: boolean;
  transcriptCopyState: V2ReviewCopyState;
  reviewCopyState: V2ReviewCopyState;
  onExteriorIntroStart: () => void;
  onCopyVerboseTranscript: () => Promise<void>;
  onCopyAllReviewData: () => Promise<void>;
  onSaveMansion: () => Promise<void>;
  onExportCase: () => Promise<void>;
}

type V2ClientAction<T = DebateMysteryActionRequestV2> = T extends unknown
  ? Omit<T, "version" | "expectedRevision" | "idempotencyKey">
  : never;

interface DeferredMysteryActionResultV1 {
  action: V2ClientAction;
  session: DebateSessionV1;
  previousDialogueCount: number;
}

interface MysteryMansionTravelPresentationV1 {
  deferred: DeferredMysteryActionResultV1;
  route: MansionTraversalRouteV1;
  fromRoom: DebateMysteryRoomV2;
  toRoom: DebateMysteryRoomV2;
  durationMs: number;
  startedAtMs: number;
  returningFromExterior?: boolean;
  openingArrival?: boolean;
}

const MYSTERY_MANSION_OUTSIDE_SELECTION_ID = "mansion:outside";

const FORGE_STAGES: Array<{
  id: DebateMysteryCompilationStageV2 | "begin_case";
  label: string;
}> = [
  { id: "writing_case", label: "Writing the Case" },
  { id: "testing_contradictions", label: "Testing Contradictions" },
  { id: "directing_performances", label: "Directing Performances" },
  { id: "preparing_local_voices", label: "Preparing Local Voices" },
  { id: "verifying_case_audio", label: "Verifying Case Audio" },
  { id: "begin_case", label: "Begin Case" },
];

const SPECTATOR_FORGE_STAGES = [
  { id: "writing_trial", label: "Writing the trial" },
  { id: "checking_case", label: "Checking the case" },
  { id: "recording_cast", label: "Recording the cast" },
] as const;

const FORGE_TIPS = [
  "Every checkpoint saves safely, so you can return to Archive whenever you need to.",
  "The Forge is preparing a finite case pack; nothing during play will call a model.",
  "Local recordings are prepared on this device. Premium voices are never used here.",
  "A good case is fair before it is surprising: the Forge checks every proof route before opening court.",
  "Pressing a statement is free. Listen for the detail the witness is trying hardest to avoid.",
  "Present evidence against the exact statement it contradicts—not merely the witness who said it.",
  "Testimony revisions stay in the Case File, so an earlier sworn account can become evidence later.",
  "Every suspect takes the stand. A minor witness now may become the key contradiction later.",
] as const;

const CALLOUT_COPY = {
  hold_it: "HOLD IT!",
  objection: "OBJECTION!",
  order: "ORDER!",
  sustained: "SUSTAINED!",
  overruled: "OVERRULED!",
  testimony_revised: "TESTIMONY REVISED",
  guilty: "GUILTY",
  not_guilty: "NOT GUILTY",
} as const;

function mutationBody(value: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reducedMotion;
}

async function writeForgeErrorDetailsClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
  await navigator.clipboard.writeText(text);
}

function botForSeat(
  props: Pick<V2SharedProps, "bots">,
  state: DebateWhodunnitFormatStateV2,
  seatId: string | null | undefined,
): MysteryBotSummary | null {
  const suspect = state.suspects.find((entry) => entry.seatId === seatId);
  return props.bots.find((entry) => entry.id === suspect?.botId) ?? null;
}

function botForDialogue(
  props: Pick<V2SharedProps, "bots">,
  state: DebateWhodunnitFormatStateV2,
  entry: DebateMysteryPublicDialogueEntryV2 | null | undefined,
): MysteryBotSummary | null {
  if (entry?.speakerBotId) {
    const exact = props.bots.find((bot) => bot.id === entry.speakerBotId);
    if (exact) return exact;
  }
  return botForSeat(props, state, entry?.speakerSeatId);
}

function mysteryBotSnapshot(bot: MysteryBotSummary): DebateBotSnapshotV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: bot.id,
    name: bot.name,
    systemPrompt: bot.systemPrompt ?? `You are ${bot.name}.`,
    role: "advocate",
    sideId: null,
    color: bot.color,
    glyph: bot.glyph,
    avatarDetails: bot.avatarDetails ?? null,
    voiceProfile: bot.voiceProfile ?? null,
    replayVisualSnapshot: bot.replayVisualSnapshot ?? null,
    powers: bot.powers ?? [],
    provider: "local",
    model: "frozen-whodunnit",
    revision: "frozen-whodunnit",
  };
}

function mysteryIdentityMirrorAppearance(
  holder: MysteryBotSummary | null,
  target: DebateBotSnapshotV1 | null,
  copiedName: string,
  faceStyleOverride: BotFaceStyle | null,
): MysteryBotSummary | null {
  if (!holder || !target) return holder;
  const appearance = debateIdentityAppearanceBotV1({
    holder: mysteryBotSnapshot(holder),
    target,
    effect: "identity_mirror",
  });
  return {
    ...holder,
    name: debateMysteryPublicIdentityNameV1(copiedName),
    glyph: appearance.glyph,
    avatarDetails: appearance.avatarDetails,
    voiceProfile: appearance.voiceProfile,
    replayVisualSnapshot: appearance.replayVisualSnapshot,
    faceStyleOverride:
      faceStyleOverride ?? appearance.replayVisualSnapshot?.faceStyle ?? null,
    powers: appearance.powers,
    systemPrompt: appearance.systemPrompt,
  };
}

function recordKey(reference: DebateMysteryRecordReferenceV2): string {
  return `${reference.kind}:${reference.id}`;
}

function sealedMysteryAssetKey(
  kind: "evidence" | "room",
  subjectId: string,
): string {
  return `${kind}:${subjectId}`;
}

function sealedMysteryAssetApiUrl(
  sessionId: string,
  kind: "evidence" | "room",
  subjectId: string,
  style?: WhodunnitInvestigationArtStyle,
): string {
  if (kind === "room" && style) {
    return whodunnitSealedRoomArtUrl({ sessionId, subjectId, style });
  }
  return `/api/debates/${encodeURIComponent(sessionId)}/mystery-assets/${kind}/${encodeURIComponent(subjectId)}/file`;
}

function sealedMysteryAssetObjectUrl(
  objectUrls: Readonly<Record<string, string>>,
  kind: "evidence" | "room",
  subjectId: string,
  asset: DebateMysterySealedAssetRefV1 | null | undefined,
): string | null {
  if (!asset?.revealed || asset.status !== "ready") return null;
  return objectUrls[sealedMysteryAssetKey(kind, subjectId)] ?? null;
}

interface MansionRoomPlacement {
  room: DebateMysteryRoomV2;
  x: number;
  y: number;
  width: number;
  height: number;
  neighborIds: string[];
}

const LEGACY_MANSION_ROOM_SLOTS = [
  { x: 4, y: 4, width: 3, height: 2 },
  { x: 0, y: 4, width: 4, height: 2 },
  { x: 0, y: 2, width: 4, height: 2 },
  { x: 7, y: 3, width: 4, height: 3 },
  { x: 9, y: 1, width: 2, height: 2 },
  { x: 4, y: 1, width: 3, height: 3 },
  { x: 0, y: 6, width: 4, height: 3 },
  { x: 7, y: 6, width: 4, height: 3 },
] as const;

function mansionRoomPlacements(rooms: DebateMysteryRoomV2[]): MansionRoomPlacement[] {
  const hasFrozenGeometry = rooms.every((room) =>
    Number.isFinite(room.x) &&
    Number.isFinite(room.y) &&
    Number.isFinite(room.width) &&
    Number.isFinite(room.height) &&
    (room.width ?? 0) > 0 &&
    (room.height ?? 0) > 0,
  );
  if (hasFrozenGeometry) {
    return rooms.map((room) => ({
      room,
      x: room.x!,
      y: room.y!,
      width: room.width!,
      height: room.height!,
      neighborIds: room.neighborIds ?? [],
    }));
  }

  return rooms.map((room, index) => {
    const slot = LEGACY_MANSION_ROOM_SLOTS[index] ?? {
      x: (index % 4) * 4,
      y: 9 + Math.floor(index / 4) * 3,
      width: 4,
      height: 3,
    };
    return { room, ...slot, neighborIds: [] };
  });
}

function legacyMansionTraversalRoute(
  fromRoom: DebateMysteryRoomV2,
  toRoom: DebateMysteryRoomV2,
): MansionTraversalRouteV1 {
  const center = (room: DebateMysteryRoomV2): { x: number; y: number } => ({
    x: (room.x ?? 0) + (room.width ?? 3) / 2,
    y: (room.y ?? 0) + (room.height ?? 2) / 2,
  });
  const from = center(fromRoom);
  const to = center(toRoom);
  const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const floorDistance = fromRoom.floor === toRoom.floor
    ? 0
    : 4 + Math.abs(fromRoom.floor - toRoom.floor) * 2;
  return {
    version: 1,
    fromRoomId: fromRoom.id,
    toRoomId: toRoom.id,
    entityIds: [fromRoom.id, toRoom.id],
    doorIds: ["legacy-threshold"],
    connectorIds: [],
    waypoints: [
      { kind: "entity_center", floor: fromRoom.floor, ...from, entityId: fromRoom.id, edgeId: null, connectorKind: null },
      { kind: "door", floor: fromRoom.floor, ...midpoint, entityId: fromRoom.id, edgeId: "legacy-threshold", connectorKind: null },
      { kind: "entity_center", floor: toRoom.floor, ...to, entityId: toRoom.id, edgeId: "legacy-threshold", connectorKind: null },
    ],
    distanceUnits: Math.round((Math.hypot(to.x - from.x, to.y - from.y) + floorDistance) * 1_000) / 1_000,
  };
}

function MysteryPlayerOrb(props: {
  className?: string;
  color?: string | null;
  glyph?: string | null;
  label: string;
  renderBotGlyph: BotPickerGlyphRenderer;
  style?: CSSProperties;
}): React.JSX.Element {
  const color = props.color?.trim() || "#ae8cff";
  return (
    <i
      className={`${styles.mysteryPlayerOrb}${props.className ? ` ${props.className}` : ""}`}
      role="img"
      aria-label={props.label}
      style={{ ...props.style, "--player-orb-color": color } as CSSProperties}
    >
      {props.renderBotGlyph(props.glyph?.trim() || "lucideTriangle", {
        size: 22,
        strokeWidth: 1.55,
        className: styles.mysteryPlayerOrbGlyph,
      })}
    </i>
  );
}

function touchingMansionRooms(
  left: MansionRoomPlacement,
  right: MansionRoomPlacement,
): boolean {
  const horizontalOverlap = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
  const verticalOverlap = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  const sharesVerticalWall = (left.x + left.width === right.x || right.x + right.width === left.x) && verticalOverlap > 0;
  const sharesHorizontalWall = (left.y + left.height === right.y || right.y + right.height === left.y) && horizontalOverlap > 0;
  return sharesVerticalWall || sharesHorizontalWall;
}

function hotspotSpotStyle(
  polygon: DebateMysteryRoomV2["hotspots"][number]["polygon"],
): CSSProperties {
  return {
    clipPath: `polygon(${polygon.map((point) => `${point.x}% ${point.y}%`).join(", ")})`,
  };
}

function revealedSpeechText(text: string, timing: V2SpeechTiming | null): string {
  if (!timing) return text;
  const timingMatchesPresentation =
    timing.text === text || whodunnitCaptionSpeechText(timing.text) === text;
  if (!timingMatchesPresentation) return text;
  const ratio = timing.durationMs > 0 ? Math.max(0, Math.min(1, timing.elapsedMs / timing.durationMs)) : 1;
  return text.slice(0, Math.ceil(text.length * ratio));
}

function settledSpeechTiming(text: string): V2SpeechTiming {
  return {
    text,
    elapsedMs: 1,
    durationMs: 1,
    alignment: null,
    audible: false,
  };
}

function pendingSpeechTiming(text: string): V2SpeechTiming {
  return {
    text,
    elapsedMs: 0,
    durationMs: 1,
    alignment: null,
    audible: false,
  };
}

function mysteryProsecutorOpeningText(text: string): string {
  return text.replace(
    /\bYou are the lead investigator\b/giu,
    "I am the lead investigator",
  );
}

function mysteryDialogueSfxPresentation(args: {
  delivery: NonNullable<DebateMysteryPublicDialogueEntryV2["delivery"]>;
  key: string;
  speakerBotId: string | null;
  speakerKind: DebateMysteryPublicDialogueEntryV2["speakerKind"];
  speakerSeatId: string | null;
  text: string;
  timing: V2SpeechTiming | null;
}): MysteryDialogueSfxPresentation {
  const captionText = whodunnitCaptionSpeechText(args.text);
  const timingMatchesPresentation = Boolean(
    args.timing && (
      args.timing.text === captionText ||
      whodunnitCaptionSpeechText(args.timing.text) === captionText
    ),
  );
  return {
    audible: args.timing?.audible === true,
    delivery: args.delivery,
    fullText: captionText,
    key: args.key,
    speakerBotId: args.speakerBotId,
    speakerKind: args.speakerKind,
    speakerSeatId: args.speakerSeatId,
    streaming: Boolean(
      timingMatchesPresentation &&
      args.timing &&
      args.timing.elapsedMs < args.timing.durationMs
    ),
    visibleText: revealedSpeechText(captionText, args.timing),
  };
}

function mysteryDialogueGestureOriginIsInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const control = target.closest(
    'input, textarea, select, button, a, label, [contenteditable]:not([contenteditable="false"])',
  );
  if (!control) return false;
  return whodunnitDialogueGestureControlIsInteractive({
    contentEditable: control instanceof HTMLElement && control.isContentEditable,
    tagName: control.tagName,
  });
}

function emptyTheory(
  state: Pick<DebateWhodunnitFormatStateV2, "theory" | "suspects" | "caseCharge">,
): DebateMysteryTheoryV1 {
  return state.theory ?? {
    accusedSeatIds: state.suspects[0]?.seatId ? [state.suspects[0].seatId] : [],
    incidentId: state.caseCharge?.incidentId,
    claim: state.caseCharge?.accusationPrompt,
    culpritSeatId: state.suspects[0]?.seatId ?? null,
    method: "",
    motive: "",
    opportunity: "",
    accompliceSeatId: null,
    evidenceIds: [],
    testimonyIds: [],
  };
}

export function DebateMysteryV2CompilationResume(
  props: V2ExperienceProps,
): React.JSX.Element {
  const state = props.session.formatState as DebateWhodunnitFormatStateV2;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resumeNonce, setResumeNonce] = useState(0);
  const [errorDetailsCopyState, setErrorDetailsCopyState] = useState<V2ForgeErrorCopyState>("idle");
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const [liveCompilation, setLiveCompilation] = useState(state.compilation);
  const liveCompilationRef = useRef(liveCompilation);
  const [forgeTipIndex, setForgeTipIndex] = useState(0);
  const [preparedMansionExteriorUrl, setPreparedMansionExteriorUrl] = useState<string | null>(null);
  const sessionId = props.session.id;
  const request = props.request;
  const onSessionChange = props.onSessionChange;
  const onSessionChangeRef = useRef(onSessionChange);
  const reducedMotion = usePrefersReducedMotion();
  const mansionExteriorRevealed = state.mansionExterior?.revealed === true;
  const mansionExteriorStatus = state.mansionExterior?.status ?? null;

  useEffect(() => {
    // Archive and setup are both long pages. Entering the fullscreen Forge at
    // their retained scroll offset can crop the case title and current stage.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [sessionId]);

  useEffect(() => {
    onSessionChangeRef.current = onSessionChange;
  }, [onSessionChange]);

  useEffect(() => {
    setLiveCompilation(state.compilation);
  }, [state.compilation]);

  useEffect(() => {
    liveCompilationRef.current = liveCompilation;
  }, [liveCompilation]);

  useEffect(() => {
    if (!mansionExteriorRevealed || mansionExteriorStatus !== "ready") {
      setPreparedMansionExteriorUrl(null);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void fetch(
      sealedMysteryAssetApiUrl(
        sessionId,
        "room",
        DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1,
      ),
      {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      },
    ).then(async (response) => {
      if (!response.ok) return;
      objectUrl = URL.createObjectURL(await response.blob());
      setPreparedMansionExteriorUrl(objectUrl);
    }).catch(() => {
      // The size-matched bundled exterior remains visible if retrieval races.
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mansionExteriorRevealed, mansionExteriorStatus, sessionId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let lastResumeAttemptMs = 0;
    const resumeCompilation = async (): Promise<void> => {
      const now = Date.now();
      if (now - lastResumeAttemptMs < 5_000) return;
      lastResumeAttemptMs = now;
      try {
        const result = await request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(sessionId)}/mystery-resume-compilation`,
          mutationBody({}),
        );
        const resumedState = result.session.formatState;
        const shouldApplyResumeResponse =
          resumedState.format !== "whodunnit" ||
          resumedState.version !== 2 ||
          !debateMysteryForgeStageIsActive(resumedState.compilation.stage);
        // An active resume returns the session's last durable public snapshot.
        // The status poll owns live recording counts, so accepting that stale
        // snapshot would erase the counter that just arrived from the job.
        if (!cancelled && shouldApplyResumeResponse) {
          onSessionChangeRef.current(result.session);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Case Forge could not resume.");
        }
      }
    };
    const refresh = async (): Promise<void> => {
      try {
        const compilationResult = await request<{ compilation: DebateMysteryCompilationStatusV2 }>(
          `/api/debates/${encodeURIComponent(sessionId)}/mystery-compilation`,
        );
        if (cancelled) return;
        const result = await request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(sessionId)}?perspective=live`,
        );
        if (cancelled) return;
        const next = result.session.formatState;
        const nextCompilation = next.format === "whodunnit" && next.version === 2
          ? compilationResult.compilation
          : null;
        if (nextCompilation && next.format === "whodunnit" && next.version === 2) {
          setLiveCompilation(nextCompilation);
          onSessionChangeRef.current({
            ...result.session,
            formatState: { ...next, compilation: nextCompilation },
          });
        } else {
          onSessionChangeRef.current(result.session);
        }
        if (
          next.format === "whodunnit" &&
          next.version === 2 &&
          nextCompilation !== null &&
          debateMysteryForgeStageIsActive(nextCompilation.stage)
        ) {
          void resumeCompilation();
          timer = window.setTimeout(() => void refresh(), 900);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Case Forge status is unavailable.");
          timer = window.setTimeout(() => void refresh(), 1800);
        }
      }
    };
    void refresh();
    if (debateMysteryForgeStageIsActive(liveCompilationRef.current.stage)) {
      void resumeCompilation();
    }
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  // A nonce deliberately restarts the durable resume loop after a player retry.
  }, [request, resumeNonce, sessionId]);

  const compilation = liveCompilation;
  const spoilerSafeProgressMessage = normalizeDebateMysteryV2ForgeProgressMessage(
    compilation.spoilerSafeMessage,
  );
  const needsAttention = compilation.stage === "needs_attention";
  const compilationActive = debateMysteryForgeStageIsActive(compilation.stage);
  const spectatorForge = state.config.playerRole === "spectator";
  useEffect(() => {
    if (!compilationActive) return;
    setClockNowMs(Date.now());
    const timer = window.setInterval(() => setClockNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [compilationActive]);
  useEffect(() => {
    if (!compilationActive || reducedMotion) return;
    const timer = window.setInterval(() => {
      setForgeTipIndex((current) => (current + 1) % FORGE_TIPS.length);
    }, 9_000);
    return () => window.clearInterval(timer);
  }, [compilationActive, reducedMotion]);
  const updatedAtMs = Date.parse(compilation.updatedAt);
  const liveClockDeltaMs = compilationActive && Number.isFinite(updatedAtMs)
    ? Math.max(0, clockNowMs - updatedAtMs)
    : 0;
  const elapsedMs = compilation.elapsedMs + liveClockDeltaMs;
  const attemptElapsedMs = (compilation.attemptElapsedMs ?? compilation.elapsedMs) + liveClockDeltaMs;
  const cumulativeElapsedMs = (compilation.cumulativeElapsedMs ?? compilation.elapsedMs) + liveClockDeltaMs;
  const completedPasses = Math.min(
    compilation.totalPasses,
    Math.max(0, compilation.completedPasses),
  );
  const forgeStages = spectatorForge ? SPECTATOR_FORGE_STAGES : FORGE_STAGES;
  const currentIndex = spectatorForge
    ? compilation.stage === "complete"
      ? SPECTATOR_FORGE_STAGES.length
      : completedPasses <= 0
        ? 0
        : completedPasses <= 2
          ? 1
          : 2
    : compilation.stage === "complete"
      ? FORGE_STAGES.length - 1
      : Math.min(completedPasses, FORGE_STAGES.length - 1);
  const percent = debateMysteryForgeAuthoritativePercent(
    completedPasses,
    compilation.totalPasses,
  );
  const forgeVisual = debateMysteryForgeVisualState(
    completedPasses,
    compilation.totalPasses,
    compilation.stage,
  );
  const etaLabel =
    compilation.etaBasisPasses >= 2 &&
    compilation.approximateRemainingMs !== null &&
    compilation.approximateRemainingMs > 0 &&
    compilationActive
      ? formatDebateMysteryForgeEta(compilation.approximateRemainingMs)
      : null;
  const forgeVenueProfile = state.config.mansionSnapshot?.layoutV2?.venueProfile ?? null;
  const forgeVenueLabel = forgeVenueProfile?.kindLabel ?? forgeVenueProfile?.placeNoun ?? "Mystery Venue";
  const forgeExteriorUrl = props.mansionExteriorUrl ?? preparedMansionExteriorUrl ??
    debateMysteryMansionExteriorFallbackV1(
      state.config.houseStyle,
      state.config.scaleClass,
      forgeVenueProfile,
    );

  const retry = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(sessionId)}/mystery-compilation/retry`,
        mutationBody({}),
      );
      onSessionChange(result.session);
      if (result.session.formatState.format === "whodunnit" && result.session.formatState.version === 2) {
        setLiveCompilation(result.session.formatState.compilation);
      }
      setResumeNonce((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Case Forge could not retry.");
    } finally {
      setBusy(false);
    }
  };

  const continueSilently = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(sessionId)}/mystery-compilation/continue-without-voices`,
        mutationBody({}),
      );
      onSessionChange(result.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The text case is not ready for silent play.");
    } finally {
      setBusy(false);
    }
  };

  const copyErrorDetails = async (): Promise<void> => {
    setErrorDetailsCopyState("copying");
    try {
      await writeForgeErrorDetailsClipboard(
        formatDebateMysteryV2ForgeErrorDetails(sessionId, compilation),
      );
      setErrorDetailsCopyState("copied");
    } catch {
      setErrorDetailsCopyState("failed");
    }
  };

  return (
    <main className={styles.forge} data-theme={props.theme} data-tutorial-target="mystery-v2-case-forge">
      <button type="button" className={styles.archiveButton} onClick={props.onExit}>← Continue in background</button>
      <section
        className={styles.forgeCard}
        data-exterior-hero="true"
        data-forge-complete={compilation.stage === "complete" ? "true" : undefined}
        style={{
          "--forge-exterior-image": `url("${forgeExteriorUrl}")`,
          "--forge-exterior-brightness": String(forgeVisual.brightness),
          "--forge-exterior-contrast": String(forgeVisual.contrast),
          "--forge-exterior-grayscale": String(forgeVisual.grayscale),
          "--forge-exterior-saturation": String(forgeVisual.saturation),
          "--forge-exterior-opacity": String(forgeVisual.opacity),
          "--forge-exterior-blur": `${forgeVisual.blurPx}px`,
        } as CSSProperties}
      >
        <SceneMediaVignette
          theme={props.theme}
          className={styles.forgeSceneVignette}
          style={{ "--scene-vignette-z": 0 } as CSSProperties}
        />
        <div className={styles.forgePrism} aria-hidden="true"><i /><i /><i /></div>
        <header
          className={styles.forgeCaseIdentity}
          data-title-ready={state.caseTitle ? "true" : "false"}
        >
          <p className={styles.eyebrow}>{state.caseTitle ? "PRISM presents" : "PRISM / Case Forge"}</p>
          <h1 key={state.caseTitle ?? "pending-case-title"}>
            {state.caseTitle ?? "A mystery is taking shape"}
          </h1>
        </header>
        <div className={styles.forgePanel}>
        <p className={styles.forgeExteriorStatus}>
          <span aria-hidden="true">◇</span>
          {forgeVenueLabel} exterior · {forgeVenueProfile?.physicalScaleClass ?? state.config.scaleClass}
        </p>
        <p className={styles.eyebrow}>Case Forge</p>
        <h2 className={styles.forgeStatusHeading}>{needsAttention ? "Case preparation stopped" : spectatorForge ? "Preparing your mystery to watch." : "Preparing a prosecution turnabout"}</h2>
        {!spectatorForge ? <p className={styles.forgeMessage}>{spoilerSafeProgressMessage}</p> : null}
        {compilationActive ? (
          <p className={styles.forgeBackgroundNote}>
            Safe to leave. Case Forge keeps working while you use other parts of PRISM. Only one Whodunnit can cook at a time.
          </p>
        ) : null}
        {needsAttention ? (
          <p className={styles.forgeRecovery}>
            The Forge is not still running. Your setup and every completed draft section are safe. Retry will resume from the last durable checkpoint.
          </p>
        ) : null}
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label="Case preparation"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${completedPasses} of ${compilation.totalPasses} durable passes complete`}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className={styles.forgeTiming} aria-label="Case Forge timing">
          <span>This attempt {formatDebateMysteryForgeElapsed(attemptElapsedMs)}</span>
          <span>Total {formatDebateMysteryForgeElapsed(cumulativeElapsedMs || elapsedMs)}</span>
          {etaLabel ? <span>{etaLabel}</span> : <span>ETA appears after two durable passes</span>}
        </div>
        <ol className={styles.forgeStages}>
          {forgeStages.map((entry, index) => (
            <li key={entry.id} data-state={index < currentIndex ? "complete" : index === currentIndex ? (needsAttention ? "error" : "active") : "waiting"}>
              <span aria-hidden="true">{index < currentIndex ? "✓" : index === currentIndex && needsAttention ? "!" : index + 1}</span>
              <strong>{entry.label}</strong>
            </li>
          ))}
        </ol>
        {spectatorForge ? (
          <details className={styles.forgeDetails} open={needsAttention || undefined}>
            <summary>Preparation details</summary>
            <div>
              <p className={styles.forgeMessage}>{spoilerSafeProgressMessage}</p>
              <section className={styles.forgeSubsteps} aria-label="Current Case Forge work">
                <p>Current work</p>
                <ol>
                  {(compilation.substeps ?? []).map((substep) => (
                    <li key={substep.id} data-state={substep.state}>
                      <span aria-hidden="true">
                        {substep.state === "complete" ? "✓" : substep.state === "attention" ? "!" : "·"}
                      </span>
                      {substep.label}
                    </li>
                  ))}
                </ol>
              </section>
              <div className={styles.localVoiceNotice}>
                <span aria-hidden="true">◈</span>
                <div><strong>Local English performance</strong><small>Premium voices are unavailable in Whodunnit V2. No ElevenLabs request will be made.</small></div>
              </div>
              <small>{compilation.preparedAudioCount} / {compilation.requiredAudioCount} unique recordings verified</small>
              <small>Preparation attempt {compilation.attempt}{needsAttention ? " · stopped safely" : ""}</small>
            </div>
          </details>
        ) : (
          <section className={styles.forgeSubsteps} aria-label="Current Case Forge work">
            <p>Current work</p>
            <ol>
              {(compilation.substeps ?? []).map((substep) => (
                <li key={substep.id} data-state={substep.state}>
                  <span aria-hidden="true">
                    {substep.state === "complete" ? "✓" : substep.state === "attention" ? "!" : "·"}
                  </span>
                  {substep.label}
                </li>
              ))}
            </ol>
          </section>
        )}
        {!spectatorForge && compilationActive ? (
          <aside className={styles.forgeTip} aria-label="Case Forge tip">
            <span aria-hidden="true">Forge note</span>
            <p key={forgeTipIndex}>{FORGE_TIPS[forgeTipIndex]}</p>
          </aside>
        ) : null}
        {!spectatorForge ? <div className={styles.localVoiceNotice}>
          <span aria-hidden="true">◈</span>
          <div><strong>Local English performance</strong><small>Premium voices are unavailable in Whodunnit V2. No ElevenLabs request will be made.</small></div>
        </div> : null}
        {!spectatorForge && compilation.requiredAudioCount > 0 ? (
          <small>{compilation.preparedAudioCount} / {compilation.requiredAudioCount} unique recordings verified</small>
        ) : null}
        {needsAttention ? (
          <div className={styles.forgeActions}>
            <button type="button" onClick={() => void retry()} disabled={busy || !compilation.retryable}>Retry preparation</button>
            {state.localAudioFailure ? <button type="button" onClick={() => void continueSilently()} disabled={busy}>Continue without voices</button> : null}
            <button type="button" onClick={() => void copyErrorDetails()} disabled={errorDetailsCopyState === "copying"}>
              {errorDetailsCopyState === "copying"
                ? "Copying error details…"
                : errorDetailsCopyState === "copied"
                  ? "Error details copied"
                  : errorDetailsCopyState === "failed"
                    ? "Copy failed — try again"
                    : "Copy error details"}
            </button>
            <button type="button" onClick={props.onExit}>Return to setup</button>
          </div>
        ) : null}
        {needsAttention && errorDetailsCopyState !== "idle" ? (
          <p role="status">{errorDetailsCopyState === "copied" ? "Error details copied to clipboard." : errorDetailsCopyState === "failed" ? "Could not copy error details. Try again." : "Copying error details…"}</p>
        ) : null}
        {!spectatorForge && needsAttention ? <small>Preparation attempt {compilation.attempt} · stopped safely</small> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        </div>
      </section>
    </main>
  );
}

const PRODUCTION_CATEGORY_LABELS: Record<DebateMysteryProductionCategoryV1, string> = {
  exterior: "Exterior",
  clue_props: "Clue props",
  mosaic_rooms: "Mosaic rooms",
  realistic_rooms: "Upgraded rooms",
  music: "Music",
  ambience: "Ambience",
  voices: "Performance voices",
};

export function DebateMysteryV2ProductionReadiness(
  props: V2ExperienceProps,
): React.JSX.Element {
  const state = props.session.formatState as DebateWhodunnitFormatStateV2;
  const readiness = state.productionReadiness;
  const [busyCategory, setBusyCategory] =
    useState<DebateMysteryProductionCategoryV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryPollsRef = useRef(0);
  const request = props.request;
  const sessionId = props.session.id;
  const onSessionChange = props.onSessionChange;

  const refresh = useCallback(async (): Promise<DebateSessionV1> => {
    const result = await request<{ session: DebateSessionV1 }>(
      `/api/debates/${encodeURIComponent(sessionId)}/mystery-production/refresh`,
      mutationBody({}),
    );
    onSessionChange(result.session);
    return result.session;
  }, [onSessionChange, request, sessionId]);

  useEffect(() => {
    if (!busyCategory) return;
    const timer = window.setTimeout(() => {
      void refresh().then((session) => {
        const next = session.formatState;
        if (
          next.format !== "whodunnit" ||
          next.version !== 2 ||
          next.playPhase !== "production_review"
        ) {
          setBusyCategory(null);
          return;
        }
        const category = next.productionReadiness?.categories[busyCategory];
        retryPollsRef.current += 1;
        if (
          !category ||
          category.unavailableCount === 0 ||
          retryPollsRef.current >= 40
        ) {
          setBusyCategory(null);
          if (retryPollsRef.current >= 40 && category?.unavailableCount) {
            setError("That category did not settle before the bounded readiness check ended. Its durable state is safe; retry or return to Production.");
          }
        }
      }).catch((caught) => {
        setBusyCategory(null);
        setError(caught instanceof Error ? caught.message : "Production readiness could not refresh.");
      });
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [busyCategory, refresh, state.productionReadiness]);

  const retryCategory = async (
    category: DebateMysteryProductionCategoryV1,
  ): Promise<void> => {
    setError(null);
    retryPollsRef.current = 0;
    if (category === "music" || category === "ambience" || category === "voices") {
      setError(`${PRODUCTION_CATEGORY_LABELS[category]} cannot be regenerated after sealed case compilation yet. Return to Production to change this request, or continue with the disclosed fallback.`);
      return;
    }
    setBusyCategory(category);
    try {
      if (category === "realistic_rooms") {
        await request(
          `/api/debates/${encodeURIComponent(sessionId)}/mystery-room-art/upgrade`,
          mutationBody({}),
        );
        return;
      }
      const result = await request<{ requeued: number; session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(sessionId)}/mystery-assets/retry`,
        mutationBody({ category }),
      );
      onSessionChange(result.session);
      if (result.requeued === 0) {
        setBusyCategory(null);
        setError("That category has already used its bounded presentation retry.");
      }
    } catch (caught) {
      setBusyCategory(null);
      setError(caught instanceof Error ? caught.message : "That production category could not be retried.");
    }
  };

  const continueWithFallbacks = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(sessionId)}/mystery-production/continue-with-fallbacks`,
        mutationBody({}),
      );
      onSessionChange(result.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The fallback acknowledgment could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const categories = readiness
    ? (Object.keys(PRODUCTION_CATEGORY_LABELS) as DebateMysteryProductionCategoryV1[])
        .map((category) => ({ category, readiness: readiness.categories[category] }))
        .filter((entry) => entry.readiness.requestedCount > 0)
    : [];

  return (
    <main className={styles.forge} data-theme={props.theme} data-tutorial-target="mystery-v2-production-readiness">
      <button type="button" className={styles.archiveButton} onClick={props.onExit}>← Return to Production</button>
      <section className={`${styles.forgeCard} ${styles.productionReadinessCard}`} aria-live="polite">
        <div className={styles.forgePrism} aria-hidden="true"><i /><i /><i /></div>
        <p className={styles.eyebrow}>Production Readiness</p>
        <h1>Review the presentation pack</h1>
        <p className={styles.forgeMessage}>The case logic and sealed truth are complete. One or more requested presentation categories used a compatible source, fallback, or unavailable result.</p>
        <div className={styles.productionReadinessList}>
          {categories.map(({ category, readiness: categoryState }) => {
            const retryable = category === "exterior" || category === "clue_props" || category === "mosaic_rooms" || category === "realistic_rooms";
            return (
              <article key={category} data-complete={categoryState.generatedCount === categoryState.requestedCount ? "true" : undefined}>
                <div><strong>{PRODUCTION_CATEGORY_LABELS[category]}</strong><small>{categoryState.publicReason}</small></div>
                <dl>
                  <div><dt>Requested</dt><dd>{categoryState.requestedCount}</dd></div>
                  <div><dt>Generated</dt><dd>{categoryState.generatedCount}</dd></div>
                  <div><dt>Reused</dt><dd>{categoryState.reusedCount}</dd></div>
                  <div><dt>Fallback</dt><dd>{categoryState.fallbackCount}</dd></div>
                  <div><dt>Unavailable</dt><dd>{categoryState.unavailableCount}</dd></div>
                </dl>
                {categoryState.generatedCount < categoryState.requestedCount ? (
                  <button type="button" disabled={!retryable || busy || busyCategory !== null} onClick={() => void retryCategory(category)}>
                    {busyCategory === category ? `Retrying ${PRODUCTION_CATEGORY_LABELS[category]}…` : retryable ? `Retry ${PRODUCTION_CATEGORY_LABELS[category]}` : "Retry unavailable after compilation"}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
        <div className={styles.forgeActions}>
          <button type="button" disabled={busy || busyCategory !== null} onClick={() => void refresh()}>Refresh counts</button>
          <button type="button" disabled={busy || busyCategory !== null} onClick={() => void continueWithFallbacks()}>Continue with fallbacks</button>
          <button type="button" disabled={busy} onClick={props.onExit}>Return to Production</button>
        </div>
        <small>Your acknowledgment is saved with the case and appears in Archive. Retrying here changes presentation only.</small>
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    </main>
  );
}

export function DebateMysteryV2Readiness(
  props: V2ExperienceProps,
): React.JSX.Element {
  const state = props.session.formatState as DebateWhodunnitFormatStateV2;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const attemptedKeyRef = useRef<string | null>(null);
  const sessionId = props.session.id;
  const request = props.request;
  const onSessionChange = props.onSessionChange;

  useEffect(() => {
    if (state.playPhase === "verdict" || state.readiness.status === "ready") return;
    if (state.readiness.status === "failed" && retryNonce === 0) return;
    const key = `${sessionId}:${state.readiness.status}:${retryNonce}`;
    if (attemptedKeyRef.current === key) return;
    attemptedKeyRef.current = key;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void request<{ session: DebateSessionV1 }>(
      `/api/debates/${encodeURIComponent(sessionId)}/mystery-readiness`,
      mutationBody({}),
    ).then((result) => {
      if (!cancelled) onSessionChange(result.session);
    }).catch((caught) => {
      if (!cancelled) {
        setError(caught instanceof Error ? caught.message : "The local case check could not finish.");
      }
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [onSessionChange, request, retryNonce, sessionId, state.playPhase, state.readiness.status]);

  return (
    <main className={styles.forge} data-theme={props.theme} data-tutorial-target="mystery-v2-readiness">
      <button type="button" className={styles.archiveButton} onClick={props.onExit}>← Archive</button>
      <section className={styles.forgeCard} aria-live="polite">
        <div className={styles.forgePrism} aria-hidden="true"><i /><i /><i /></div>
        <p className={styles.eyebrow}>Local case check</p>
        <h1>{state.readiness.status === "failed" ? "Case pack needs attention" : "Preparing this case to resume"}</h1>
        <p className={styles.forgeMessage}>{state.readiness.spoilerSafeMessage}</p>
        <div className={styles.localVoiceNotice}>
          <span aria-hidden="true">◇</span>
          <div><strong>Finite and local</strong><small>This check preserves case progress and never calls an LLM, ElevenLabs, or another network voice provider.</small></div>
        </div>
        {state.readiness.status === "failed" || error ? (
          <div className={styles.forgeActions}>
            <button type="button" disabled={busy} onClick={() => setRetryNonce((value) => value + 1)}>Retry local check</button>
            <button type="button" onClick={props.onExit}>Return to Archive</button>
          </div>
        ) : <small>{busy ? "Checking authored dialogue and local clips…" : "Starting local check…"}</small>}
        {state.localAudioFailure ? <p className={styles.error}>{state.localAudioFailure}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    </main>
  );
}

export function DebateMysteryV2Play(props: V2PlayProps): React.JSX.Element {
  const state = props.session.formatState as DebateWhodunnitFormatStateV2;
  const pendingRoomKey = [
    ...state.rooms
      .filter((room) => room.sealedAsset?.status === "pending")
      .map((room) => `room:${room.id}`),
    ...state.record
      .filter((item) => item.sealedAsset?.status === "pending")
      .map((item) => `evidence:${item.reference.id}`),
  ]
    .sort()
    .join("|");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState<"move" | "examine" | "talk" | "present" | null>(null);
  const [caseFileOpen, setCaseFileOpen] = useState(false);
  const [caseFileUpdate, setCaseFileUpdate] = useState<DebateMysteryCaseFileUpdateV2 | null>(null);
  const [theoryOpen, setTheoryOpen] = useState(state.playPhase === "theory");
  const [theory, setTheory] = useState<DebateMysteryTheoryV1>(() => emptyTheory(state));
  const [dialoguePlaybackQueue, setDialoguePlaybackQueue] = useState<DebateMysteryPublicDialogueEntryV2[]>([]);
  const [dialoguePlaybackIndex, setDialoguePlaybackIndex] = useState(0);
  const [speechTiming, setSpeechTiming] = useState<V2SpeechTiming | null>(null);
  const [preparedAudioStatus, setPreparedAudioStatus] = useState<{
    key: string | null;
    status: "idle" | "pending" | "started" | "unavailable";
  }>({ key: null, status: "idle" });
  const [interrogationPhase, setInterrogationPhase] = useState<WhodunnitInterrogationPhase | null>(null);
  const [courtEstablishedWitnessSeatId, setCourtEstablishedWitnessSeatId] = useState<string | null>(null);
  const [presentedCourtRecord, setPresentedCourtRecord] = useState<DebateMysteryRecordReferenceV2 | null>(null);
  const [heldDialogue, setHeldDialogue] = useState<DebateMysteryPublicDialogueEntryV2 | null>(null);
  const [examiningHotspotId, setExaminingHotspotId] = useState<string | null>(null);
  const [investigationLens, setInvestigationLens] = useState<MysteryLensState>({
    x: 50,
    y: 50,
    proximity: 0,
    hotspotId: null,
  });
  const [completionCueRoomId, setCompletionCueRoomId] = useState<string | null>(null);
  const [mansionSaveState, setMansionSaveState] = useState<
    "idle" | "saving" | "saved" | "failed"
  >("idle");
  const [caseExportState, setCaseExportState] = useState<
    "idle" | "exporting" | "exported" | "failed"
  >("idle");
  const [visualRetryState, setVisualRetryState] = useState<
    "idle" | "retrying" | "queued" | "failed"
  >("idle");
  const [sealedAssetSaveState, setSealedAssetSaveState] = useState<
    Record<string, "saving" | "saved" | "failed">
  >({});
  const [sealedAssetObjectUrls, setSealedAssetObjectUrls] = useState<Record<string, string>>({});
  const sealedAssetObjectUrlRef = useRef(new Map<string, string>());
  const [roomUpgradeEnabled, setRoomUpgradeEnabled] = useState(
    state.config.assetSynthesis.illustratedRooms,
  );
  const [failedUpgradeRoomIds, setFailedUpgradeRoomIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [loadedUpgradeRoomIds, setLoadedUpgradeRoomIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [roomArtUpgradeStatus, setRoomArtUpgradeStatus] =
    useState<DebateMysteryRoomArtUpgradeStatusV1 | null>(null);
  const [openingMapReveal, setOpeningMapReveal] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [roomParallax, setRoomParallax] = useState({ x: 0, y: 0 });
  const [travelPresentation, setTravelPresentation] =
    useState<MysteryMansionTravelPresentationV1 | null>(null);
  const [exteriorEntryPresentation, setExteriorEntryPresentation] =
    useState<MysteryMansionTravelPresentationV1 | null>(null);
  const [visitingExterior, setVisitingExterior] = useState(false);
  const [exteriorRoomReveal, setExteriorRoomReveal] = useState(false);
  const [travelProgress, setTravelProgress] = useState(0);
  const travelFoleyRef = useRef<MysteryMansionTravelFoleyHandleV1 | null>(null);
  const travelFrameRef = useRef<number | null>(null);
  const exteriorEntryTimerRef = useRef<number | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioOutputCleanupRef = useRef<PrismAudioElementRouteCleanup | null>(null);
  const audioGenerationRef = useRef(0);
  const captionRevealGenerationRef = useRef(0);
  const roomContextKey = state.roomView === "room" ? state.currentRoomId : null;
  const [roomDialogueBaseline, setRoomDialogueBaseline] = useState(() => ({
    contextKey: roomContextKey,
    historyCount: state.dialogueHistory.length,
  }));
  const [completedSpectatorBeat, setCompletedSpectatorBeat] = useState<string | null>(null);
  const mutationIndexRef = useRef(0);
  const lastPlayedPerformanceKeyRef = useRef<string | null>(null);
  const lastCalloutIdRef = useRef<string | null>(null);
  const dialogueSfxPresentationRef = useRef<{
    key: string | null;
    visibleText: string;
  }>({ key: null, visibleText: "" });
  const dialogueTextVoiceRef = useRef<{
    controller: AbortController;
    key: string;
    mode: Exclude<WhodunnitTextVoiceMode, "off">;
  } | null>(null);
  const dialogueGestureFillRef = useRef<{
    bot: boolean;
    key: string | null;
  }>({ bot: false, key: null });
  const dialogueGestureAdvanceRef = useRef<string | null>(null);
  useEffect(() => {
    setRoomUpgradeEnabled(readWhodunnitRoomUpgradeEnabled(
      window.localStorage,
      props.session.id,
      state.config.assetSynthesis.illustratedRooms,
    ));
    setFailedUpgradeRoomIds(new Set());
    setLoadedUpgradeRoomIds(new Set());
  }, [props.session.id, state.config.assetSynthesis.illustratedRooms]);
  const selectRoomUpgradeEnabled = useCallback((enabled: boolean): void => {
    setRoomUpgradeEnabled(enabled);
    writeWhodunnitRoomUpgradeEnabled(window.localStorage, enabled, props.session.id);
  }, [props.session.id]);
  const playControlSfx = useCallback((cue: DebateMysterySfxCue): void => {
    void playDebateMysterySfx({
      cue,
      enabled: props.audioEnabled,
      volume: props.audioVolume,
    });
  }, [props.audioEnabled, props.audioVolume]);
  useEffect(() => {
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      try {
        const status = await props.request<DebateMysteryRoomArtUpgradeStatusV1>(
          `/api/debates/${encodeURIComponent(props.session.id)}/mystery-room-art/upgrade`,
        );
        if (cancelled) return;
        setRoomArtUpgradeStatus(status);
      } catch {
        if (!cancelled) setRoomArtUpgradeStatus(null);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [props.request, props.session.id]);
  useEffect(() => {
    if (roomArtUpgradeStatus?.status !== "preparing") return;
    let cancelled = false;
    const refresh = (): void => {
      void props.request<DebateMysteryRoomArtUpgradeStatusV1>(
        `/api/debates/${encodeURIComponent(props.session.id)}/mystery-room-art/upgrade`,
      ).then((status) => {
        if (!cancelled) setRoomArtUpgradeStatus(status);
      }).catch(() => {
        // Keep the last known state; the bounded status interval retries.
      });
    };
    const timer = window.setInterval(refresh, 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [props.request, props.session.id, roomArtUpgradeStatus?.status, roomArtUpgradeStatus?.readyRoomIds.length]);
  const releaseActiveDialogueAudio = useCallback((): void => {
    const audio = activeAudioRef.current;
    const outputCleanup = activeAudioOutputCleanupRef.current;
    activeAudioRef.current = null;
    activeAudioOutputCleanupRef.current = null;
    if (!audio) {
      outputCleanup?.();
      return;
    }
    void releaseAudibleAudioElement(audio, {
      onReleased: outputCleanup ?? undefined,
    });
  }, []);
  const cancelActiveDialogueAudio = useCallback((): void => {
    const audio = activeAudioRef.current;
    const outputCleanup = activeAudioOutputCleanupRef.current;
    const ownsSyntheticVoice = dialogueTextVoiceRef.current !== null;
    dialogueTextVoiceRef.current?.controller.abort();
    activeAudioRef.current = null;
    activeAudioOutputCleanupRef.current = null;
    dialogueTextVoiceRef.current = null;
    audioGenerationRef.current += 1;
    captionRevealGenerationRef.current += 1;
    cancelWhodunnitDialogueAudioImmediately({
      media: audio,
      outputCleanup,
      cancelSyntheticVoice: ownsSyntheticVoice
        ? () => teardownBottishVoiceImmediately({ preservePreparedMedia: true })
        : null,
    });
  }, []);
  useEffect(() => {
    if (!pendingRoomKey) return;
    let cancelled = false;
    let timer: number | null = null;
    let inFlight = false;
    const refreshSecuredRooms = async (): Promise<void> => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const result = await props.request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(props.session.id)}?perspective=live`,
        );
        if (!cancelled && result.session.revision > props.session.revision) {
          props.onSessionChange(result.session);
        }
      } catch {
        // This is a soft doorway poll; the next interval retries.
      } finally {
        inFlight = false;
        if (!cancelled) timer = window.setTimeout(() => void refreshSecuredRooms(), 1_500);
      }
    };
    void refreshSecuredRooms();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [pendingRoomKey, props.onSessionChange, props.request, props.session.id, props.session.revision]);
  const botById = useMemo(() => new Map(props.bots.map((bot) => [bot.id, bot])), [props.bots]);
  const revealedAssetRequests = useMemo(() => {
    const requests = new Map<string, {
      kind: "evidence" | "room";
      subjectId: string;
      style?: WhodunnitInvestigationArtStyle;
    }>();
    if (state.mansionExterior?.revealed && state.mansionExterior.status === "ready") {
      requests.set(
        sealedMysteryAssetKey("room", DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1),
        {
          kind: "room",
          subjectId: DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1,
        },
      );
    }
    for (const item of state.record) {
      if (
        item.reference.kind === "evidence" &&
        item.sealedAsset?.revealed &&
        item.sealedAsset.status === "ready"
      ) {
        requests.set(sealedMysteryAssetKey("evidence", item.reference.id), {
          kind: "evidence",
          subjectId: item.reference.id,
        });
      }
    }
    return Array.from(requests.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [state.mansionExterior, state.record]);
  const revealedAssetRequestKey = revealedAssetRequests.map(([key]) => key).join("|");

  useEffect(() => {
    const desired = new Map(revealedAssetRequests);
    const controller = new AbortController();
    let cancelled = false;
    for (const [key, objectUrl] of sealedAssetObjectUrlRef.current) {
      if (desired.has(key)) continue;
      URL.revokeObjectURL(objectUrl);
      sealedAssetObjectUrlRef.current.delete(key);
    }
    setSealedAssetObjectUrls(Object.fromEntries(sealedAssetObjectUrlRef.current));
    for (const [key, request] of desired) {
      if (sealedAssetObjectUrlRef.current.has(key)) continue;
      void fetch(
        sealedMysteryAssetApiUrl(
          props.session.id,
          request.kind,
          request.subjectId,
          request.style,
        ),
        {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        },
      ).then(async (response) => {
        if (!response.ok) return;
        const objectUrl = URL.createObjectURL(await response.blob());
        if (cancelled || !desired.has(key)) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        sealedAssetObjectUrlRef.current.set(key, objectUrl);
        setSealedAssetObjectUrls(Object.fromEntries(sealedAssetObjectUrlRef.current));
      }).catch(() => {
        // A reveal may race a session refresh; the next public-state change retries it.
      });
    }
    return () => {
      cancelled = true;
      controller.abort();
    };
    // The compact key prevents re-fetches for unrelated session revisions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.session.id, revealedAssetRequestKey]);

  useEffect(() => () => {
    for (const objectUrl of sealedAssetObjectUrlRef.current.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    sealedAssetObjectUrlRef.current.clear();
  }, []);
  const botNamesById = useMemo(() => new Map([
    ...props.bots.map((bot) => [bot.id, bot.name] as const),
    ...state.suspects.map((suspect) => [suspect.botId, suspect.name] as const),
  ]), [props.bots, state.suspects]);
  const identityMirrors = useMemo(
    () => debateMysteryIdentityMirrorPresentationsV1({
      session: props.session,
      state,
      botNamesById,
    }),
    [botNamesById, props.session, state],
  );
  const activeIdentityPresentation = useMemo(
    () => [...identityMirrors.values()].reduce<ReturnType<typeof identityMirrors.get> | null>(
      (latest, presentation) => !latest || presentation.occurredAt > latest.occurredAt
        ? presentation
        : latest,
      null,
    ),
    [identityMirrors],
  );
  const [identityPresentationNowMs, setIdentityPresentationNowMs] = useState(() => Date.now());
  useEffect(() => {
    const now = Date.now();
    setIdentityPresentationNowMs(now);
    const occurredAtMs = activeIdentityPresentation
      ? Date.parse(activeIdentityPresentation.occurredAt)
      : Number.NaN;
    if (!Number.isFinite(occurredAtMs)) return;
    const remainingMs = Math.max(0, occurredAtMs + BOT_IDENTITY_PRESENTATION_TRANSITION_MS - now);
    if (!remainingMs) return;
    const timer = window.setTimeout(() => setIdentityPresentationNowMs(Date.now()), remainingMs);
    return () => window.clearTimeout(timer);
  }, [activeIdentityPresentation]);
  const presentMysteryBot = useCallback((bot: MysteryBotSummary | null): MysteryBotSummary | null => {
    if (!bot) return null;
    const mirror = identityMirrors.get(bot.id);
    if (!mirror) return bot;
    const frozenTarget = state.identityMirrorTargetSnapshots[mirror.targetBotId];
    const frozenHolder = state.identityMirrorTargetSnapshots[bot.id];
    const target = frozenTarget
      ? debateMysteryIdentityMirrorTargetBotSnapshotV1(frozenTarget)
      : (() => {
          const liveTarget = botById.get(mirror.targetBotId) ?? null;
          return liveTarget ? mysteryBotSnapshot(liveTarget) : null;
        })();
    const faceStyleOverride = frozenHolder && frozenTarget
      ? debateMysteryIdentityMirrorFaceV1(frozenHolder, frozenTarget)
      : null;
    return mysteryIdentityMirrorAppearance(
      bot,
      target,
      mirror.targetName,
      faceStyleOverride,
    );
  }, [botById, identityMirrors, state.identityMirrorTargetSnapshots]);
  const identityPresentationBlackout = (
    <IdentityPresentationBlackout
      active={botIdentityPresentationTransitionActiveV1(
        activeIdentityPresentation,
        identityPresentationNowMs,
      )}
      occurredAt={activeIdentityPresentation?.occurredAt}
      nowMs={identityPresentationNowMs}
    />
  );
  const currentRoom = state.rooms.find((room) => room.id === state.currentRoomId) ?? null;
  const mansionLayout = state.config.mansionSnapshot?.layoutV2 ?? null;
  const venueProfile = mansionLayout?.venueProfile ?? null;
  const venuePlaceNoun = venueProfile?.placeNoun?.trim() || "venue";
  const venueEntryAction = venueProfile?.presentation?.entryAction?.trim() ||
    `Enter the ${venuePlaceNoun}`;
  const venueEntryRoom = venueProfile
    ? state.rooms.find((room) => room.id === venueProfile.entryRoomId) ?? null
    : state.rooms.find((room) => room.templateId?.toLocaleLowerCase() === "foyer") ??
      state.rooms.find((room) => /foyer/u.test(room.name.toLocaleLowerCase())) ??
      null;
  const currentRoomAcoustics = useMemo(
    () => currentRoom
      ? mysteryMansionRoomAcousticsV1({
        room: currentRoom,
        houseStyle: state.config.houseStyle,
        venueProfile,
      })
      : null,
    [currentRoom, state.config.houseStyle, venueProfile],
  );
  const mansionFloors = useMemo(
    () => [...new Set(state.rooms.map((room) => room.floor))].sort((left, right) => right - left),
    [state.rooms],
  );
  const [mansionFloor, setMansionFloor] = useState(() => currentRoom?.floor ?? mansionFloors.at(-1) ?? 1);
  const [selectedMansionRoomId, setSelectedMansionRoomId] = useState(() => currentRoom?.id ?? state.rooms[0]?.id ?? "");
  const [revealedCasekeeperNarrationKey, setRevealedCasekeeperNarrationKey] = useState<string | null>(null);
  const prosecutorBot = presentMysteryBot(botById.get(state.config.prosecutorBotId) ?? null);
  const playerCharacterName = prosecutorBot?.name ?? props.playerName ?? "Investigator";
  const playerCharacterColor = normalizeAccentForTheme(
    normalizeBotIdentityColor(prosecutorBot?.color) ??
      normalizeBotIdentityColor(props.playerColor) ??
      "#ae8cff",
    props.theme,
  );
  const playerCharacterGlyph = prosecutorBot?.glyph ?? props.playerGlyph;
  const currentSuspect = state.suspects.find((suspect) => suspect.roomId === currentRoom?.id) ?? null;
  const currentBot = presentMysteryBot(botForSeat(props, state, currentSuspect?.seatId));
  const roomIntroductionPhase = currentRoom
    ? state.roomIntroductions[currentRoom.id] ?? "complete"
    : "complete";
  const roomIntroductionActive = roomIntroductionPhase !== "complete";
  const roomIntroductionPersonaActive = roomIntroductionPhase === "persona";
  const roomIntroductionDialogueNodeId = currentRoom
    ? `room-introduction-${currentRoom.id}-${roomIntroductionPhase}`
    : null;
  const roomIntroductionDialogue = roomIntroductionDialogueNodeId
    ? state.dialogueHistory.findLast((entry) => entry.nodeId === roomIntroductionDialogueNodeId) ?? null
    : null;
  const roomCasekeeperNarrationKey = currentRoom
    ? `${props.session.id}:${currentRoom.id}`
    : null;
  const roomCasekeeperNarrationVisible = Boolean(
    roomIntroductionPhase === "casekeeper" &&
      (
        roomIntroductionDialogue?.delivery === "persona_babble" ||
        (
          roomCasekeeperNarrationKey &&
          revealedCasekeeperNarrationKey === roomCasekeeperNarrationKey
        )
      ),
  );
  useEffect(() => {
    if (
      roomIntroductionPhase !== "casekeeper" &&
      roomCasekeeperNarrationKey &&
      revealedCasekeeperNarrationKey === roomCasekeeperNarrationKey
    ) {
      setRevealedCasekeeperNarrationKey(null);
    }
  }, [revealedCasekeeperNarrationKey, roomCasekeeperNarrationKey, roomIntroductionPhase]);
  const lastDialogue = state.dialogueHistory.at(-1) ?? null;
  const queuedDialogue = dialoguePlaybackQueue[dialoguePlaybackIndex] ?? null;
  const displayedDialogue = queuedDialogue ?? heldDialogue ?? (
    state.playPhase === "trial" ? null : lastDialogue
  );
  const dialogueBot = presentMysteryBot(botForDialogue(props, state, displayedDialogue));
  const roomDisplayedDialogue = queuedDialogue ?? heldDialogue ?? roomIntroductionDialogue ?? (
    roomDialogueBaseline.contextKey === roomContextKey &&
    state.dialogueHistory.length > roomDialogueBaseline.historyCount
      ? lastDialogue
      : null
  );
  const roomDialogueBot = presentMysteryBot(botForDialogue(props, state, roomDisplayedDialogue));
  const roomProsecutorActive = roomDisplayedDialogue?.speakerBotId === state.config.prosecutorBotId;
  const roomActorVisible = Boolean(
    currentBot &&
      command !== "examine" &&
      !roomProsecutorActive &&
      (!roomIntroductionActive || roomIntroductionPersonaActive),
  );
  const dialogueIsTextOnly = displayedDialogue?.delivery === "text_only"
    // Frozen cases recorded before the explicit delivery contract used these
    // stable node IDs. Keep their old local clips unreachable.
    || displayedDialogue?.nodeId.startsWith("examine-") === true;
  const roomDialogueIsTextOnly = roomDisplayedDialogue?.delivery === "text_only"
    || roomDisplayedDialogue?.nodeId.startsWith("examine-") === true;
  const roomPlayerObservationActive = Boolean(
    roomDisplayedDialogue &&
      roomDialogueIsTextOnly &&
      roomDisplayedDialogue.nodeId.startsWith("examine-"),
  );
  const roomIntroductionAwaitingContinue = roomIntroductionPhase === "casekeeper";
  const roomCasekeeperNarrationText = currentRoom
    ? debateMysteryRoomCasekeeperNarrationTextV2({
        appearance: currentBot?.roomNarrationAppearance,
        fixtureLabels: currentRoom.hotspots.map((hotspot) => hotspot.label),
        personaName: currentBot?.name ?? currentSuspect?.name ?? null,
        persistedNarration: roomIntroductionDialogue?.visibleText,
      })
    : "";
  const roomDialoguePresentationText = roomIntroductionAwaitingContinue
    ? roomCasekeeperNarrationVisible
      ? roomCasekeeperNarrationText
      : "..."
    : roomDisplayedDialogue?.visibleText ?? "";
  const roomDialogueDelivery = roomDisplayedDialogue
    ? splitDebateMysteryStageActionTextV2(
        roomDialoguePresentationText,
        roomDialogueBot?.name ?? currentSuspect?.name ?? null,
      )
    : { stageActionText: null, spokenText: "" };
  const roomObservationAwaitingContinue = Boolean(
    roomPlayerObservationActive &&
      speechTiming &&
      whodunnitCaptionSpeechText(speechTiming.text) ===
        whodunnitCaptionSpeechText(roomDialogueDelivery.spokenText) &&
      speechTiming.elapsedMs >= speechTiming.durationMs,
  );
  const roomStageActionText = roomDisplayedDialogue?.stageActionText ?? roomDialogueDelivery.stageActionText;
  const roomSuspectStageActionText = roomDisplayedDialogue?.speakerSeatId === currentSuspect?.seatId
    ? roomStageActionText
    : null;
  const roomProsecutorStageActionText = roomProsecutorActive ? roomStageActionText : null;
  const roomPersonaDialogueActive = Boolean(
    roomDisplayedDialogue &&
      !roomIntroductionAwaitingContinue &&
      !roomDialogueIsTextOnly &&
      !roomProsecutorActive &&
      roomDisplayedDialogue.speakerSeatId === currentSuspect?.seatId,
  );
  const roomDialoguePersonaName = roomDialogueBot?.name ?? currentSuspect?.name ?? null;
  const roomDialoguePersonaGlyph = roomDialogueBot?.glyph ?? currentSuspect?.glyph ?? null;
  const roomDialoguePersonaColor = normalizeAccentForTheme(
    normalizeBotIdentityColor(roomDialogueBot?.color ?? currentSuspect?.color) ?? "#a98cff",
    props.theme,
  );
  const roomDialogueSpeakerKind = roomIntroductionAwaitingContinue
    ? "player-thought"
    : roomPlayerObservationActive
      ? "player-observation"
      : roomProsecutorActive
        ? "prosecutor"
        : roomPersonaDialogueActive
          ? "persona"
          : "observation";
  const roomDialoguePresentationKey = roomDisplayedDialogue
    ? `${roomDisplayedDialogue.nodeId}:${roomDisplayedDialogue.occurredAt}:${
        roomIntroductionAwaitingContinue
          ? roomCasekeeperNarrationVisible ? "casekeeper-narration" : "casekeeper-beat"
          : roomDisplayedDialogue.lineId ?? "text-only"
      }`
    : null;
  const roomDialogueAccentStyle = roomPlayerObservationActive
    ? { "--dialogue-accent": playerCharacterColor } as CSSProperties
    : roomDialogueBot
      ? { "--dialogue-accent": roomDialoguePersonaColor } as CSSProperties
      : undefined;
  const dialoguePerformanceActive = queuedDialogue !== null;
  const interrogationAudioMayStart = whodunnitInterrogationMayStartAudio(interrogationPhase);
  const audioMouthActive = whodunnitInterrogationAudioOwnsMouth({
    phase: interrogationPhase,
    audible: speechTiming?.audible === true,
  });
  const roomSpeechInkVisible = !dialoguePerformanceActive || interrogationPhase === "handoff";
  const admittedRecord = state.record.filter((item) => item.admitted);
  const caseFileEntryCount = admittedRecord.length +
    (state.caseKit?.length ?? 0) +
    debateMysteryCaseFileObservationsV2({
      dialogueHistory: state.dialogueHistory,
      rooms: state.rooms,
    }).length;
  const theoryAccusedSeatIds = debateMysteryTheoryAccusedSeatIdsV2(theory);
  const mansionCanBeSaved = debateMysteryMansionBundleEligibleV2(state);
  const failedVisualCount = state.rooms.filter(
    (room) => room.sealedAsset?.status === "fallback",
  ).length + state.record.filter(
    (item) => item.sealedAsset?.status === "fallback",
  ).length;
  useEffect(() => {
    if (visualRetryState !== "queued" || pendingRoomKey) return;
    setVisualRetryState(failedVisualCount > 0 ? "failed" : "idle");
  }, [failedVisualCount, pendingRoomKey, visualRetryState]);
  const visualRetryAvailable =
    props.session.responseMode !== "local" && failedVisualCount > 0;

  const saveSealedAsset = async (
    asset: DebateMysterySealedAssetRefV1,
    subjectId: string,
    title: string,
  ): Promise<void> => {
    const assetKey = sealedMysteryAssetKey(asset.kind, subjectId);
    if (
      !asset.revealed ||
      asset.status !== "ready" ||
      sealedAssetSaveState[assetKey] === "saving" ||
      sealedAssetSaveState[assetKey] === "saved"
    ) return;
    setSealedAssetSaveState((current) => ({ ...current, [assetKey]: "saving" }));
    setError(null);
    try {
      await props.request(
        `/api/debates/${encodeURIComponent(props.session.id)}/mystery-assets/${asset.kind}/${encodeURIComponent(subjectId)}/save`,
        mutationBody({ title }),
      );
      setSealedAssetSaveState((current) => ({ ...current, [assetKey]: "saved" }));
    } catch (caught) {
      setSealedAssetSaveState((current) => ({ ...current, [assetKey]: "failed" }));
      setError(caught instanceof Error ? caught.message : "The revealed visual could not be saved.");
    }
  };

  const saveMansion = async (): Promise<void> => {
    if (!mansionCanBeSaved || mansionSaveState === "saving") return;
    setMansionSaveState("saving");
    setError(null);
    try {
      await props.onSaveMansion();
      setMansionSaveState("saved");
    } catch (caught) {
      setMansionSaveState("failed");
      setError(
        caught instanceof Error
          ? caught.message
          : "This Mystery Venue could not be saved.",
      );
    }
  };
  const retryFailedVisuals = async (): Promise<void> => {
    if (!visualRetryAvailable || visualRetryState === "retrying") return;
    setVisualRetryState("retrying");
    setError(null);
    try {
      const result = await props.request<{
        requeued: number;
        session: DebateSessionV1;
      }>(
        `/api/debates/${encodeURIComponent(props.session.id)}/mystery-assets/retry`,
        mutationBody({}),
      );
      props.onSessionChange(result.session);
      if (result.requeued > 0) {
        setVisualRetryState("queued");
      } else {
        setVisualRetryState("failed");
        setError("Those visuals have already used their bounded retry.");
      }
    } catch (caught) {
      setVisualRetryState("failed");
      setError(caught instanceof Error ? caught.message : "The failed visuals could not be retried.");
    }
  };
  const activeStatement = state.court?.statements.find(
    (statement) => statement.statementId === state.court?.activeStatementId,
  ) ?? state.court?.statements[0] ?? null;
  const activeStatementIndex = activeStatement
    ? state.court?.statements.findIndex((entry) => entry.statementId === activeStatement.statementId) ?? -1
    : -1;
  const witnessSeatId = activeStatement?.witnessSeatId ?? null;
  const witness = state.suspects.find((entry) => entry.seatId === witnessSeatId) ?? null;
  const witnessBot = presentMysteryBot(botForSeat(props, state, witnessSeatId));
  const courtPresentationActive = whodunnitCourtPresentationVisible({
    hasQueuedDialogue: queuedDialogue !== null,
    playPhase: state.playPhase,
  });
  const callout = whodunnitCourtCalloutPresentationVisible({
    courtPresentationActive,
    playPhase: state.playPhase,
  })
    ? state.pendingCallout
    : null;
  const courtPresentedWitnessSeatId = whodunnitCourtPresentedWitnessSeatId({
    activeWitnessSeatId: witnessSeatId,
    dialogueIndex: dialoguePlaybackIndex,
    dialogueQueue: dialoguePlaybackQueue,
    suspectSeatIds: new Set(state.suspects.map((suspect) => suspect.seatId)),
  });
  const courtPresentedWitness = state.suspects.find(
    (entry) => entry.seatId === courtPresentedWitnessSeatId,
  ) ?? witness;
  const courtPresentedWitnessBot = presentMysteryBot(
    botForSeat(props, state, courtPresentedWitnessSeatId),
  ) ?? witnessBot;
  const displayedDialogueDelivery = displayedDialogue
    ? splitDebateMysteryStageActionTextV2(displayedDialogue.visibleText, dialogueBot?.name ?? null)
    : { stageActionText: null, spokenText: "" };
  const activeStatementDelivery = activeStatement
    ? splitDebateMysteryStageActionTextV2(activeStatement.visibleText, witness?.name ?? null)
    : { stageActionText: null, spokenText: "" };
  const activeStatementStageActionText = activeStatement?.stageActionText ?? activeStatementDelivery.stageActionText;
  const defenseBot = presentMysteryBot(botById.get(state.config.rivalDefenseBotId) ?? null);
  const judgeBot = presentMysteryBot(botById.get(state.config.judgeBotId) ?? null);
  const defendant = state.suspects.find((entry) => entry.seatId === state.court?.defendantSeatId) ?? null;
  const defendantBot = presentMysteryBot(defendant ? botById.get(defendant.botId) ?? null : null);
  const prosecutorDialogueActive = displayedDialogue?.speakerBotId === state.config.prosecutorBotId;
  const defenseDialogueActive = displayedDialogue?.speakerBotId === state.config.rivalDefenseBotId;
  const judgeDialogueActive = displayedDialogue?.speakerKind === "judge" ||
    displayedDialogue?.speakerBotId === state.config.judgeBotId;
  const defendantDialogueActive = Boolean(
    defendant && displayedDialogue?.speakerSeatId === defendant.seatId,
  );
  const courtCamera = resolveWhodunnitCourtCamera({
    defenseDialogueActive,
    defendantDialogueActive,
    establishingWitness: Boolean(
      courtPresentationActive &&
      courtPresentedWitnessSeatId &&
      courtPresentedWitnessSeatId !== courtEstablishedWitnessSeatId
    ),
    interrogationPhase,
    judgeDialogueActive,
    prosecutionDialogueActive: prosecutorDialogueActive,
  });
  useEffect(() => {
    if (!courtPresentationActive || !courtPresentedWitnessSeatId) {
      setCourtEstablishedWitnessSeatId(null);
      return;
    }
    if (courtPresentedWitnessSeatId === courtEstablishedWitnessSeatId) return;
    const timer = window.setTimeout(
      () => setCourtEstablishedWitnessSeatId(courtPresentedWitnessSeatId),
      reducedMotion ? 450 : 1_050,
    );
    return () => window.clearTimeout(timer);
  }, [courtEstablishedWitnessSeatId, courtPresentationActive, courtPresentedWitnessSeatId, reducedMotion]);
  const defenseFocusBot = defendantDialogueActive && defendantBot ? defendantBot : defenseBot;
  const defenseFocusRole = defendantDialogueActive ? "Defendant" : "Defense Counsel";
  const presentedCourtRecordItem = presentedCourtRecord
    ? state.record.find((item) => recordKey(item.reference) === recordKey(presentedCourtRecord)) ?? null
    : null;
  const presentedCourtRecordKindLabel = presentedCourtRecordItem?.reference.kind === "testimony"
    ? "Sworn testimony"
    : "Physical evidence";
  const presentedCourtRecordAssetUrl = presentedCourtRecordItem?.reference.kind === "evidence"
    ? sealedMysteryAssetObjectUrl(
        sealedAssetObjectUrls,
        "evidence",
        presentedCourtRecordItem.reference.id,
        presentedCourtRecordItem.sealedAsset,
      )
    : null;
  // Derive directly from the active entry so an action from a prior line
  // unmounts in the same render when the dialogue changes.
  const roomActionPresentation = mysterySignalActionPresentation(
    roomDisplayedDialogue,
    roomDialogueBot?.name ?? null,
    speechTiming,
  );
  const dialogueActionPresentation = mysterySignalActionPresentation(
    displayedDialogue,
    dialogueBot?.name ?? null,
    speechTiming,
  );
  const activeStatementActionPresentation = mysterySignalActionPresentation(
    activeStatement
      ? { ...activeStatement, stageActionText: activeStatementStageActionText }
      : null,
    witness?.name ?? null,
    speechTiming,
  );
  const courtPresentedWitnessDialogueActive = displayedDialogue
    ? displayedDialogue.speakerSeatId === courtPresentedWitnessSeatId
    : courtPresentedWitnessSeatId === witnessSeatId;
  const courtWitnessActionPresentation = displayedDialogue?.speakerSeatId === courtPresentedWitnessSeatId
    ? dialogueActionPresentation
    : courtPresentedWitnessSeatId !== witnessSeatId || (
        displayedDialogue && displayedDialogue.lineId !== activeStatement?.lineId
      )
      ? null
      : activeStatementActionPresentation;
  const spectator = state.config.playerRole === "spectator";
  const spectatorTheory = spectator && state.playPhase === "theory";
  const openingOrMapPlaybackSuppressed = state.playPhase === "title_card" ||
    (state.playPhase === "verdict" && !courtPresentationActive) || (
      state.playPhase === "investigation" &&
      state.roomView === "mansion" &&
      state.activeDialogueNodeId === null
    );
  const playbackLineId = openingOrMapPlaybackSuppressed || dialogueIsTextOnly ? null : displayedDialogue?.lineId ?? (
    state.playPhase === "trial" ? activeStatement?.lineId ?? null : null
  );
  const rawPlaybackText = displayedDialogue
    ? displayedDialogueDelivery.spokenText
    : activeStatementDelivery.spokenText;
  const playbackText = displayedDialogue?.nodeId === "briefing-opening"
    ? mysteryProsecutorOpeningText(rawPlaybackText)
    : rawPlaybackText;
  const captionSpeechTiming = heldDialogue && displayedDialogue === heldDialogue
    ? settledSpeechTiming(playbackText)
    : whodunnitCaptionRevealIsPending({
        queued: Boolean(playbackText),
        revealExpected: !roomIntroductionAwaitingContinue || roomCasekeeperNarrationVisible,
        presentationText: whodunnitCaptionSpeechText(playbackText),
        timingText: speechTiming?.text,
      })
      ? pendingSpeechTiming(playbackText)
      : speechTiming;
  const caseOpeningDialogue = state.playPhase === "case_opening"
    ? state.dialogueHistory.findLast((entry) => entry.nodeId === "briefing-opening") ?? lastDialogue
    : null;
  const dialogueSfxPresentation = (() => {
    if (caseOpeningDialogue) {
      return mysteryDialogueSfxPresentation({
        delivery: caseOpeningDialogue.delivery ?? "spoken",
        key: `${caseOpeningDialogue.nodeId}:${caseOpeningDialogue.occurredAt}:${caseOpeningDialogue.lineId ?? "text-only"}`,
        speakerBotId: caseOpeningDialogue.speakerBotId,
        speakerKind: caseOpeningDialogue.speakerKind,
        speakerSeatId: caseOpeningDialogue.speakerSeatId,
        text: mysteryProsecutorOpeningText(
          splitDebateMysteryStageActionTextV2(caseOpeningDialogue.visibleText, null).spokenText,
        ),
        timing: captionSpeechTiming,
      });
    }
    if (state.playPhase === "investigation" && state.roomView === "room" && roomDisplayedDialogue) {
      return mysteryDialogueSfxPresentation({
        delivery: roomDialogueIsTextOnly ? "text_only" : roomDisplayedDialogue.delivery ?? "spoken",
        key: roomDialoguePresentationKey ?? `${roomDisplayedDialogue.nodeId}:${roomDisplayedDialogue.occurredAt}`,
        speakerBotId: roomDisplayedDialogue.speakerBotId,
        speakerKind: roomDisplayedDialogue.speakerKind,
        speakerSeatId: roomDisplayedDialogue.speakerSeatId,
        text: roomDialogueDelivery.spokenText,
        timing: captionSpeechTiming,
      });
    }
    if (!courtPresentationActive || !activeStatement) return null;
    if (displayedDialogue && displayedDialogue.lineId !== activeStatement.lineId) {
      return mysteryDialogueSfxPresentation({
        delivery: dialogueIsTextOnly ? "text_only" : displayedDialogue.delivery ?? "spoken",
        key: `${displayedDialogue.nodeId}:${displayedDialogue.occurredAt}:${displayedDialogue.lineId ?? "text-only"}`,
        speakerBotId: displayedDialogue.speakerBotId,
        speakerKind: displayedDialogue.speakerKind,
        speakerSeatId: displayedDialogue.speakerSeatId,
        text: displayedDialogueDelivery.spokenText,
        timing: captionSpeechTiming,
      });
    }
    return mysteryDialogueSfxPresentation({
      delivery: "spoken",
      key: `statement:${activeStatement.statementId}:${activeStatement.version}:${activeStatement.lineId}`,
      speakerBotId: witnessBot?.id ?? null,
      speakerKind: "bot",
      speakerSeatId: activeStatement.witnessSeatId,
      text: activeStatementDelivery.spokenText,
      timing: captionSpeechTiming,
    });
  })();
  const operateVisibleDialogueGesture = (
    clickCount: number,
    onAdvance: () => void,
  ): boolean => {
    const presentation = dialogueSfxPresentation;
    if (!presentation) return false;
    const filledByGesture = dialogueGestureFillRef.current.key === presentation.key;
    const automatedBotPlayback = presentation.speakerKind === "bot" && (
      presentation.streaming || activeAudioRef.current !== null
    );
    const decision = whodunnitDialogueGestureDecision({
      advanceArmed: dialogueGestureAdvanceRef.current === presentation.key,
      automatedBotPlayback,
      botFillArmed: filledByGesture && dialogueGestureFillRef.current.bot,
      clickCount,
      filledByGesture,
      streaming: presentation.streaming,
    });
    if (decision === "ignore") return true;
    if (decision === "advance") {
      dialogueGestureAdvanceRef.current = presentation.key;
      dialogueGestureFillRef.current = { bot: false, key: null };
      onAdvance();
      return true;
    }
    dialogueGestureFillRef.current = {
      bot: automatedBotPlayback,
      key: presentation.key,
    };
    dialogueGestureAdvanceRef.current = null;
    cancelActiveDialogueAudio();
    setSpeechTiming(settledSpeechTiming(presentation.fullText));
    return true;
  };
  const activeStatementOwnsPlayback = Boolean(
    courtPresentationActive &&
    activeStatement &&
    (!displayedDialogue || displayedDialogue.lineId === activeStatement.lineId),
  );
  const playbackPerformanceKey = activeStatementOwnsPlayback && activeStatement
    ? `statement:${activeStatement.statementId}:${activeStatement.version}:${activeStatement.lineId}`
    : displayedDialogue
      ? `${displayedDialogue.nodeId}:${displayedDialogue.occurredAt}:${displayedDialogue.lineId ?? "text-only"}`
      : `${props.session.revision}:${playbackLineId ?? "text-only"}`;
  const preparedAudioExpected = Boolean(
    playbackLineId &&
    interrogationAudioMayStart &&
    state.voicesEnabled &&
    props.audioEnabled &&
    props.audioVolume > 0 &&
    props.restoredAudioPerformanceKey !== playbackPerformanceKey
  );
  const preparedAudioStatusForPlayback = preparedAudioStatus.key === playbackPerformanceKey
    ? preparedAudioStatus.status
    : "idle";
  const spectatorBeat = spectator && state.playPhase === "trial"
    ? `${props.session.revision}:${playbackLineId ?? "text-only"}`
    : null;

  const mansionPlacements = useMemo(() => {
    const rooms = state.rooms.filter((room) => room.floor === mansionFloor);
    if (!mansionLayout) return mansionRoomPlacements(rooms);
    const layoutRooms = new Map(
      mansionLayout.entities
        .filter((entity) => entity.kind === "room" && entity.floor === mansionFloor)
        .map((entity) => [entity.id, entity]),
    );
    return mansionRoomPlacements(rooms).map((placement) => {
      const entity = layoutRooms.get(placement.room.id);
      if (!entity) return placement;
      const rect = mansionLayoutV2EntityRect(entity);
      return { ...placement, ...rect };
    });
  }, [mansionFloor, mansionLayout, state.rooms]);
  const mansionCorridors = useMemo(
    () => mansionLayout?.entities
      .filter((entity): entity is MansionLayoutBlockV2 =>
        entity.kind === "corridor" && entity.floor === mansionFloor)
      .map((corridor) => ({ corridor, ...mansionLayoutV2EntityRect(corridor) })) ?? [],
    [mansionFloor, mansionLayout],
  );
  const mansionAmbientSpaces = useMemo(
    () => state.spatialProjection?.ambientSpaces.filter(
      (space) => space.floor === mansionFloor,
    ) ?? [],
    [mansionFloor, state.spatialProjection],
  );
  const mansionOutsideSelected = selectedMansionRoomId === MYSTERY_MANSION_OUTSIDE_SELECTION_ID;
  const mansionSelectedRoom = mansionOutsideSelected
    ? null
    : state.rooms.find((room) => room.id === selectedMansionRoomId && room.floor === mansionFloor)
      ?? mansionPlacements[0]?.room
      ?? null;
  const mansionSelectedSuspect = state.suspects.find((suspect) => suspect.roomId === mansionSelectedRoom?.id) ?? null;
  const mansionSelectedRoomPending = mansionSelectedRoom?.sealedAsset?.status === "pending";
  const mansionSelectedRoomAdjacent = Boolean(
    mansionSelectedRoom &&
      (!currentRoom ||
        mansionSelectedRoom.id === currentRoom.id ||
        (currentRoom.neighborIds ?? []).includes(mansionSelectedRoom.id) ||
        (mansionSelectedRoom.neighborIds ?? []).includes(currentRoom.id)),
  );
  const mansionSelectedRoomReachable = Boolean(
    mansionSelectedRoom && (mansionSelectedRoom.visited || mansionSelectedRoomAdjacent),
  );
  const venueTierOutline = mansionLayout?.venuePresentation?.tierOutlines.find(
    (outline) => outline.floor === mansionFloor,
  ) ?? null;
  const maritimeDeckMap = venueProfile?.presentation?.mapStyle === "hull-deck-v1";
  const mansionGeometry = [
    ...mansionPlacements.map(({ x, y, width, height }) => ({ x, y, width, height })),
    ...mansionCorridors.map(({ x, y, width, height }) => ({ x, y, width, height })),
    ...mansionAmbientSpaces.map(({ x, y, width, height }) => ({ x, y, width, height })),
    ...(venueTierOutline?.points.map((point) => ({
      x: point.x * MANSION_LAYOUT_V2_COLUMNS,
      y: point.y * MANSION_LAYOUT_V2_ROWS,
      width: 0,
      height: 0,
    })) ?? []),
  ];
  const mansionMinX = mansionGeometry.length ? Math.min(...mansionGeometry.map((placement) => placement.x)) : 0;
  const mansionMinY = mansionGeometry.length ? Math.min(...mansionGeometry.map((placement) => placement.y)) : 0;
  const mansionMaxX = Math.max(1, ...mansionGeometry.map((placement) => placement.x + placement.width));
  const mansionMaxY = Math.max(1, ...mansionGeometry.map((placement) => placement.y + placement.height));
  const mansionContentWidth = Math.max(1, mansionMaxX - mansionMinX);
  const mansionContentHeight = Math.max(1, mansionMaxY - mansionMinY);
  const mansionDrawingWidth = 100;
  const mansionDrawingHeight = 75;
  const mansionPadding = 4;
  const mansionScale = Math.min(
    (mansionDrawingWidth - mansionPadding * 2) / mansionContentWidth,
    (mansionDrawingHeight - mansionPadding * 2) / mansionContentHeight,
  );
  const mansionOffsetX = (mansionDrawingWidth - mansionContentWidth * mansionScale) / 2;
  const mansionOffsetY = (mansionDrawingHeight - mansionContentHeight * mansionScale) / 2;
  const mansionX = (value: number): number => mansionOffsetX + (value - mansionMinX) * mansionScale;
  const mansionY = (value: number): number => ((mansionOffsetY + (value - mansionMinY) * mansionScale) / mansionDrawingHeight) * 100;
  const mansionWidth = (value: number): number => value * mansionScale;
  const mansionHeight = (value: number): number => ((value * mansionScale) / mansionDrawingHeight) * 100;
  const mansionGroundFloor = venueEntryRoom?.floor
    ?? Math.min(...mansionFloors);
  const venueTierLabel = (floor: number): string =>
    venueProfile?.tierLabels[floor - 1] ?? (
      floor === mansionGroundFloor
        ? "Ground floor"
        : floor < mansionGroundFloor
          ? "Lower floor"
          : "Upper floor"
    );
  const mansionFloorDisplayName = venueTierLabel(mansionFloor);
  const deckOrdinal = [...mansionFloors]
    .sort((left, right) => left - right)
    .findIndex((floor) => floor === mansionFloor) + 1;
  const deckOrdinalForFloor = (floor: number): number =>
    [...mansionFloors]
      .sort((left, right) => left - right)
      .findIndex((candidate) => candidate === floor) + 1;
  const connectorLandings = mansionLayout?.verticalConnectors.flatMap((connector) => {
    const lowerEntity = mansionLayout.entities.find(
      (entity) => entity.id === connector.lowerEntityId,
    );
    const upperEntity = mansionLayout.entities.find(
      (entity) => entity.id === connector.upperEntityId,
    );
    const point = lowerEntity?.floor === mansionFloor
      ? connector.lowerPoint
      : upperEntity?.floor === mansionFloor
        ? connector.upperPoint
        : null;
    return point ? [{ connector, point }] : [];
  }) ?? [];
  const venueTierOutlinePoints = venueTierOutline?.points
    .map((point) => `${mansionX(point.x * MANSION_LAYOUT_V2_COLUMNS)},${mansionY(point.y * MANSION_LAYOUT_V2_ROWS)}`)
    .join(" ") ?? "";
  const mansionDoors: Array<{ key: string; orientation: "vertical" | "horizontal"; x: number; y: number }> = [];
  if (mansionLayout) {
    for (const door of mansionLayout.doors.filter((entry) => entry.floor === mansionFloor)) {
      const point = mansionLayoutV2DoorPoint(mansionLayout, door);
      if (!point) continue;
      mansionDoors.push({
        key: door.id,
        orientation: door.aWall === "east" || door.aWall === "west" ? "vertical" : "horizontal",
        ...point,
      });
    }
  } else {
    for (let leftIndex = 0; leftIndex < mansionPlacements.length; leftIndex += 1) {
      const left = mansionPlacements[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < mansionPlacements.length; rightIndex += 1) {
        const right = mansionPlacements[rightIndex]!;
        const explicitlyConnected = left.neighborIds.includes(right.room.id) || right.neighborIds.includes(left.room.id);
        if (!explicitlyConnected && !touchingMansionRooms(left, right)) continue;
        const verticalOverlap = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
        const horizontalOverlap = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
        const sharesVerticalWall = (left.x + left.width === right.x || right.x + right.width === left.x) && verticalOverlap > 0;
        if (sharesVerticalWall) {
          mansionDoors.push({
            key: `${left.room.id}-${right.room.id}`,
            orientation: "vertical",
            x: left.x + left.width === right.x ? right.x : left.x,
            y: Math.max(left.y, right.y) + verticalOverlap / 2,
          });
        } else if (horizontalOverlap > 0) {
          mansionDoors.push({
            key: `${left.room.id}-${right.room.id}`,
            orientation: "horizontal",
            x: Math.max(left.x, right.x) + horizontalOverlap / 2,
            y: left.y + left.height === right.y ? right.y : left.y,
          });
        }
      }
    }
  }
  const travelPoint = travelPresentation
    ? mysteryMansionTravelPointAtProgress(travelPresentation.route, travelProgress)
    : null;
  const stationaryPlayerPlacement = currentRoom?.floor === mansionFloor
    ? mansionPlacements.find((placement) => placement.room.id === currentRoom.id) ?? null
    : null;
  const mansionPlayerPoint = travelPoint?.floor === mansionFloor
    ? travelPoint
    : stationaryPlayerPlacement
      ? {
        floor: mansionFloor,
        x: stationaryPlayerPlacement.x + stationaryPlayerPlacement.width / 2,
        y: stationaryPlayerPlacement.y + stationaryPlayerPlacement.height / 2,
        waypointIndex: 0,
      }
      : null;

  const advanceDialoguePlayback = useCallback((): void => {
    if (dialoguePlaybackIndex + 1 < dialoguePlaybackQueue.length) {
      setDialoguePlaybackIndex(dialoguePlaybackIndex + 1);
      return;
    }
    setDialoguePlaybackQueue([]);
    setDialoguePlaybackIndex(0);
  }, [dialoguePlaybackIndex, dialoguePlaybackQueue.length]);

  const dialogueSfxAudible = dialogueSfxPresentation?.audible;
  const dialogueSfxDelivery = dialogueSfxPresentation?.delivery;
  const dialogueSfxFullText = dialogueSfxPresentation?.fullText ?? "";
  const dialogueSfxKey = dialogueSfxPresentation?.key ?? null;
  const dialogueSfxStreaming = dialogueSfxPresentation?.streaming;
  const dialogueSfxVisibleText = dialogueSfxPresentation?.visibleText ?? "";
  // Player observations are deliberately Babble rather than readable spoken
  // dialogue, so acquire their full line on the first typewriter frame.
  const textVoiceVisibleText = roomPlayerObservationActive
    ? dialogueSfxFullText
    : dialogueSfxVisibleText;
  const mansionAmbienceAsset = mysteryMansionAmbienceAssetV1(
    state.config.houseStyle,
    state.config.mansionBundleId,
  );
  const mansionAmbienceMix = mysteryMansionAmbienceMixV1({
    houseStyle: state.config.houseStyle,
    room: currentRoom,
    maxFloor: mansionFloors.at(-1) ?? 1,
    roomView: state.roomView,
    speechActive: dialogueSfxPresentation?.audible === true && speechTiming !== null,
    theoryBoardOpen: theoryOpen,
  });
  useEffect(() => {
    const previous = dialogueSfxPresentationRef.current;
    const nextKey = dialogueSfxKey;
    if (debateMysteryDialoguePresentationDismissed(previous.key, nextKey)) {
      void playDebateMysterySfx({
        cue: "dialogue-dismiss",
        enabled: props.audioEnabled,
        volume: props.audioVolume,
      });
    }
    dialogueSfxPresentationRef.current = {
      key: nextKey,
      visibleText: dialogueSfxVisibleText,
    };
  }, [
    dialogueSfxKey,
    dialogueSfxVisibleText,
    props.audioEnabled,
    props.audioVolume,
  ]);

  useEffect(() => {
    const textVoiceMode = debateMysteryTextVoiceModeForPresentation({
      configuredMode: props.whodunnitTextVoiceMode ?? "bottish",
      playerObservation: roomPlayerObservationActive,
    });
    const started = dialogueTextVoiceRef.current;
    if (debateMysteryTextVoiceShouldStop({
      audible: dialogueSfxAudible === true,
      delivery: dialogueSfxDelivery,
      key: dialogueSfxKey,
      mode: textVoiceMode,
      playerObservation: roomPlayerObservationActive,
      startedKey: started?.key ?? null,
      startedMode: started?.mode ?? null,
      streaming: dialogueSfxStreaming === true,
    })) {
      dialogueTextVoiceRef.current?.controller.abort();
      teardownBottishVoiceImmediately({ preservePreparedMedia: true });
      dialogueTextVoiceRef.current = null;
    }
    if (!props.audioEnabled || props.audioVolume <= 0) {
      if (dialogueTextVoiceRef.current) {
        dialogueTextVoiceRef.current.controller.abort();
        teardownBottishVoiceImmediately({ preservePreparedMedia: true });
        dialogueTextVoiceRef.current = null;
      }
      return;
    }
    const active = dialogueTextVoiceRef.current;
    if (!debateMysteryTextVoiceShouldStart({
      audible: dialogueSfxAudible === true,
      delivery: dialogueSfxDelivery,
      key: dialogueSfxKey,
      mode: textVoiceMode,
      playerObservation: roomPlayerObservationActive,
      startedKey: active?.key ?? null,
      startedMode: active?.mode ?? null,
      streaming: dialogueSfxStreaming === true,
      visibleText: textVoiceVisibleText,
    }) || !dialogueSfxKey || textVoiceMode === "off") return;
    const controller = new AbortController();
    dialogueTextVoiceRef.current = {
      controller,
      key: dialogueSfxKey,
      mode: textVoiceMode,
    };
    void playDebateMysteryTextVoice({
      enabled: true,
      instant: roomPlayerObservationActive,
      mode: textVoiceMode,
      voiceProfile: roomPlayerObservationActive
        ? prosecutorBot?.voiceProfile ?? null
        : null,
      seed: `${props.session.id}:${dialogueSfxKey}`,
      signal: controller.signal,
      text: dialogueSfxFullText,
      volume: props.audioVolume,
      roomAcoustics: state.playPhase === "investigation" && state.roomView === "room"
        ? currentRoomAcoustics?.voice
        : undefined,
      play: props.playMysteryTextVoice,
    });
  }, [
    dialogueSfxAudible,
    dialogueSfxDelivery,
    dialogueSfxFullText,
    dialogueSfxKey,
    dialogueSfxStreaming,
    dialogueSfxVisibleText,
    textVoiceVisibleText,
    props.audioEnabled,
    props.audioVolume,
    props.playMysteryTextVoice,
    props.session.id,
    props.whodunnitTextVoiceMode,
    prosecutorBot?.voiceProfile,
    currentRoomAcoustics?.voice,
    roomPlayerObservationActive,
    state.playPhase,
    state.roomView,
  ]);

  useEffect(() => () => {
    if (!dialogueTextVoiceRef.current) return;
    dialogueTextVoiceRef.current.controller.abort();
    dialogueTextVoiceRef.current = null;
    teardownBottishVoiceImmediately();
  }, []);

  useEffect(() => {
    const beatMs = reducedMotion ? 0 : whodunnitInterrogationBeatMs(interrogationPhase);
    if (interrogationPhase === null || beatMs === null || !queuedDialogue) return;
    const timer = window.setTimeout(() => {
      const next = nextWhodunnitInterrogationPhase(interrogationPhase);
      if (next === "advance_queue") {
        if (dialoguePlaybackIndex + 1 >= dialoguePlaybackQueue.length) {
          setDialoguePlaybackQueue([]);
          setDialoguePlaybackIndex(0);
          setInterrogationPhase((current) => current === interrogationPhase ? null : current);
          return;
        }
        const nextEntry = dialoguePlaybackQueue[dialoguePlaybackIndex + 1] ?? null;
        setDialoguePlaybackIndex((index) => index + 1);
        setInterrogationPhase((current) => current === interrogationPhase
          ? whodunnitInterrogationEntrancePhaseForEntry(
              nextEntry,
              state.config.prosecutorBotId,
              currentSuspect?.seatId ?? "",
            )
          : current);
        return;
      }
      setInterrogationPhase((current) => current === interrogationPhase ? (next === "complete" ? null : next) : current);
    }, beatMs);
    return () => window.clearTimeout(timer);
  }, [currentSuspect?.seatId, dialoguePlaybackIndex, dialoguePlaybackQueue, interrogationPhase, queuedDialogue, reducedMotion, state.config.prosecutorBotId]);

  const currentRoomUnexaminedHotspots = currentRoom?.hotspots.filter(
    (hotspot) => hotspot.unlocked && !hotspot.examined,
  ) ?? [];
  const currentRoomHotspotStateKey = currentRoom?.hotspots
    .map((hotspot) => `${hotspot.id}:${hotspot.unlocked ? 1 : 0}:${hotspot.examined ? 1 : 0}`)
    .join("|") ?? "";
  const roomComplete = debateMysteryV2RoomComplete(currentRoom?.hotspots ?? []);
  const targetedHotspotId = debateMysteryV2LensClickTarget(investigationLens);
  const examinationStreaming = Boolean(
    dialoguePerformanceActive && roomDialogueIsTextOnly && roomDisplayedDialogue,
  );

  useEffect(() => {
    if (examiningHotspotId && !busy && !examinationStreaming) setExaminingHotspotId(null);
  }, [busy, examinationStreaming, examiningHotspotId]);

  useEffect(() => {
    if (!currentRoom) return;
    setInvestigationLens((lens) => resolveDebateMysteryV2Lens(
      lens.x,
      lens.y,
      currentRoom.hotspots,
    ));
  }, [currentRoom, currentRoomHotspotStateKey]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const finishCurrentDialogue = useCallback((automatic = false): void => {
    if (!queuedDialogue) {
      if (dialogueSfxPresentation) {
        cancelActiveDialogueAudio();
        setSpeechTiming(settledSpeechTiming(dialogueSfxPresentation.fullText));
      }
      if (roomDisplayedDialogue) {
        setHeldDialogue(null);
        setSpeechTiming(null);
        setRoomDialogueBaseline({
          contextKey: roomContextKey,
          historyCount: state.dialogueHistory.length,
        });
      }
      return;
    }
    const hasQueuedResponse = dialoguePlaybackIndex + 1 < dialoguePlaybackQueue.length;
    const courtDialogue = courtPresentationActive;
    const decision = courtDialogue
      ? whodunnitCourtDialogueFinishDecision({ hasQueuedResponse })
      : whodunnitInterrogationFinishDecision({
          phase: interrogationPhase,
          hasQueuedResponse,
    });
    if (decision === "ignore") return;
    cancelActiveDialogueAudio();
    if (decision === "clear") {
      setHeldDialogue(null);
      setSpeechTiming(null);
      setInterrogationPhase(null);
      setDialoguePlaybackQueue([]);
      setDialoguePlaybackIndex(0);
      return;
    }
    setSpeechTiming({
      text: splitDebateMysteryStageActionTextV2(queuedDialogue.visibleText, botForDialogue(props, state, queuedDialogue)?.name ?? null).spokenText,
      elapsedMs: 1,
      durationMs: 1,
      alignment: null,
      audible: false,
    });
    if (decision === "handoff") {
      setInterrogationPhase("handoff");
      return;
    }
    if (decision === "advance_queue") {
      const nextEntry = dialoguePlaybackQueue[dialoguePlaybackIndex + 1] ?? null;
      setDialoguePlaybackIndex((index) => index + 1);
      setInterrogationPhase(courtDialogue ? null : whodunnitInterrogationEntrancePhaseForEntry(
        nextEntry,
        state.config.prosecutorBotId,
        currentSuspect?.seatId ?? "",
      ));
      return;
    }
    if (automatic || roomIntroductionPhase === "persona") {
      setHeldDialogue(null);
      setSpeechTiming(null);
      setRoomDialogueBaseline({
        contextKey: roomContextKey,
        historyCount: state.dialogueHistory.length,
      });
      setInterrogationPhase(null);
      setDialoguePlaybackQueue([]);
      setDialoguePlaybackIndex(0);
      return;
    }
    setHeldDialogue(queuedDialogue);
    setInterrogationPhase(null);
    setDialoguePlaybackQueue([]);
    setDialoguePlaybackIndex(0);
  }, [cancelActiveDialogueAudio, courtPresentationActive, currentSuspect?.seatId, dialoguePlaybackIndex, dialoguePlaybackQueue, dialogueSfxPresentation, interrogationPhase, props, queuedDialogue, roomContextKey, roomDisplayedDialogue, roomIntroductionPhase, state]);

  const adoptDeferredActionResult = useCallback((
    deferred: DeferredMysteryActionResultV1,
  ): void => {
    const { action, session, previousDialogueCount } = deferred;
    const nextState = session.formatState as DebateWhodunnitFormatStateV2;
    if (action.action === "talk" || action.action === "present_to_suspect") setCommand(null);
    if (action.action === "retry_witness_checkpoint") {
      setCommand(null);
      setHeldDialogue(null);
      setSpeechTiming(null);
      setDialoguePlaybackQueue([]);
      setDialoguePlaybackIndex(0);
      setInterrogationPhase(null);
      setPresentedCourtRecord(null);
    }
    const exchange = nextState.dialogueHistory.slice(previousDialogueCount);
    if (exchange.length) {
      setHeldDialogue(null);
      setSpeechTiming(null);
      setDialoguePlaybackQueue(exchange);
      setDialoguePlaybackIndex(0);
      const suspectSeatId = action.action === "talk" || action.action === "present_to_suspect"
        ? action.suspectSeatId
        : action.action === "advance_room_introduction"
          ? nextState.suspects.find((suspect) => suspect.roomId === action.roomId)?.seatId ?? null
          : null;
      setInterrogationPhase(
        suspectSeatId
          ? startWhodunnitInterrogation(exchange, nextState.config.prosecutorBotId, suspectSeatId)
          : null,
      );
    } else if (action.action === "complete_room_introduction") {
      setInterrogationPhase(null);
    }
    const nextCaseFileUpdate = debateMysteryNewCaseFileUpdateV2({
      previousDialogueHistory: state.dialogueHistory,
      previousCaseKit: state.caseKit,
      previousRecord: state.record,
      nextDialogueHistory: nextState.dialogueHistory,
      nextCaseKit: nextState.caseKit,
      nextRecord: nextState.record,
      rooms: nextState.rooms,
    });
    if (nextCaseFileUpdate) {
      setCaseFileUpdate(nextCaseFileUpdate);
      playControlSfx("evidence");
    }
    props.onSessionChange(session);
  }, [playControlSfx, props.onSessionChange, state.caseKit, state.dialogueHistory, state.record]);

  const requestDeferredAction = useCallback(async (
    action: V2ClientAction,
  ): Promise<DeferredMysteryActionResultV1 | null> => {
    const introductionAction = action.action === "advance_room_introduction" || action.action === "complete_room_introduction";
    const dialogueInterruptingAction = introductionAction || action.action === "retry_witness_checkpoint";
    if (busy || (dialoguePerformanceActive && !dialogueInterruptingAction)) return null;
    cancelActiveDialogueAudio();
    setBusy(true);
    setError(null);
    try {
      const previousDialogueCount = state.dialogueHistory.length;
      mutationIndexRef.current += 1;
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(props.session.id)}/mystery-action`,
        mutationBody({
          ...action,
          version: 2,
          expectedRevision: props.session.revision,
          idempotencyKey: `mystery-v2:${props.session.id}:${props.session.revision}:${mutationIndexRef.current}:${action.action}`,
        }),
      );
      return { action, session: result.session, previousDialogueCount };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That action could not be completed.");
      setBusy(false);
      return null;
    }
  }, [busy, cancelActiveDialogueAudio, dialoguePerformanceActive, props.request, props.session.id, props.session.revision, state.dialogueHistory.length]);

  const finishDeferredAction = useCallback((
    deferred: DeferredMysteryActionResultV1,
  ): void => {
    adoptDeferredActionResult(deferred);
    setBusy(false);
  }, [adoptDeferredActionResult]);

  const sendAction = useCallback(async (action: V2ClientAction): Promise<boolean> => {
    const deferred = await requestDeferredAction(action);
    if (!deferred) return false;
    finishDeferredAction(deferred);
    return true;
  }, [finishDeferredAction, requestDeferredAction]);

  const travelAcousticsForRoute = useCallback((
    route: MansionTraversalRouteV1,
    fromRoom: DebateMysteryRoomV2,
    toRoom: DebateMysteryRoomV2,
  ): {
    outgoing: MysteryMansionRoomAcousticsV1;
    corridor: MysteryMansionRoomAcousticsV1;
    destination: MysteryMansionRoomAcousticsV1;
    mechanicalDoors: boolean;
  } => {
    const outgoing = mysteryMansionRoomAcousticsV1({
      room: fromRoom,
      houseStyle: state.config.houseStyle,
      venueProfile,
    });
    const destination = mysteryMansionRoomAcousticsV1({
      room: toRoom,
      houseStyle: state.config.houseStyle,
      venueProfile,
    });
    const authoredCorridor = mansionLayout?.entities.find(
      (entity): entity is MansionLayoutBlockV2 =>
        entity.kind === "corridor" && route.entityIds.includes(entity.id),
    );
    const corridor = mysteryMansionCorridorAcousticsV1({
      corridor: authoredCorridor ?? {
        kind: "corridor",
        id: `route:${fromRoom.id}:${toRoom.id}`,
        floor: fromRoom.floor,
        x: 0,
        y: 0,
        width: Math.max(1, Math.min(8, Math.round(route.distanceUnits))),
        height: 1,
      },
      houseStyle: state.config.houseStyle,
      venueProfile,
    });
    const mechanicalDoors =
      venueProfile?.presentation?.compatibleAcousticFamilies.includes("maritime-passenger-v1") === true ||
      state.config.houseStyle.acousticThemePaletteId === "spacecraft-industrial-v1" ||
      route.waypoints.some((point) => point.connectorKind === "lift" || point.connectorKind === "portal");
    return { outgoing, corridor, destination, mechanicalDoors };
  }, [mansionLayout, state.config.houseStyle, venueProfile]);

  const playCompactTravelBridge = useCallback((
    route: MansionTraversalRouteV1,
    fromRoom: DebateMysteryRoomV2,
    toRoom: DebateMysteryRoomV2,
    seed: string,
    includeFootsteps = true,
  ): void => {
    const acoustics = travelAcousticsForRoute(route, fromRoom, toRoom);
    playMysteryMansionTravelFoleyV1({
      route,
      seed,
      volume: props.audioVolume,
      enabled: props.audioEnabled,
      compact: true,
      includeFootsteps,
      ...acoustics,
    });
  }, [props.audioEnabled, props.audioVolume, travelAcousticsForRoute]);

  const finishExteriorEntry = useCallback((collapseToCompact: boolean): void => {
    if (!exteriorEntryPresentation) return;
    if (exteriorEntryTimerRef.current !== null) {
      window.clearTimeout(exteriorEntryTimerRef.current);
      exteriorEntryTimerRef.current = null;
    }
    if (collapseToCompact) {
      travelFoleyRef.current?.cancel();
      playCompactTravelBridge(
        exteriorEntryPresentation.route,
        exteriorEntryPresentation.fromRoom,
        exteriorEntryPresentation.toRoom,
        `${props.session.id}:${props.session.revision}:exterior:skip`,
        exteriorEntryPresentation.returningFromExterior,
      );
    }
    travelFoleyRef.current = null;
    if (exteriorEntryPresentation.returningFromExterior) {
      setVisitingExterior(false);
      setExteriorRoomReveal(true);
    }
    setExteriorEntryPresentation(null);
    finishDeferredAction(exteriorEntryPresentation.deferred);
  }, [exteriorEntryPresentation, finishDeferredAction, playCompactTravelBridge, props.session.id, props.session.revision]);

  const beginExteriorEntry = useCallback(async (
    returningFromExterior = false,
  ): Promise<void> => {
    if (exteriorEntryPresentation) {
      finishExteriorEntry(true);
      return;
    }
    const entryRoom = venueEntryRoom ?? currentRoom ?? state.rooms[0];
    if (!entryRoom) {
      if (returningFromExterior) {
        setError("The venue entry is unavailable.");
      } else {
        void sendAction({ action: "enter_mansion" });
      }
      return;
    }
    const grounds: DebateMysteryRoomV2 = {
      id: "mansion-grounds",
      name: "Venue Exterior",
      floor: entryRoom.floor,
      x: entryRoom.x,
      y: (entryRoom.y ?? 0) + (entryRoom.height ?? 2) + 3,
      width: 3,
      height: 2,
      emoji: "◇",
      imageId: null,
      bundledAssetPath: null,
      unlocked: true,
      visited: true,
      hotspots: [],
    };
    const route = legacyMansionTraversalRoute(grounds, entryRoom);
    const deferred = await requestDeferredAction(returningFromExterior
      ? { action: "move", roomId: entryRoom.id }
      : { action: "enter_mansion" });
    if (!deferred) return;
    if (reducedMotion) {
      playCompactTravelBridge(
        route,
        grounds,
        entryRoom,
        `${props.session.id}:${props.session.revision}:exterior:reduced-motion`,
        returningFromExterior,
      );
      if (returningFromExterior) {
        setVisitingExterior(false);
        setExteriorRoomReveal(true);
      }
      finishDeferredAction(deferred);
      return;
    }
    const durationMs = 1_200;
    travelFoleyRef.current?.cancel();
    travelFoleyRef.current = playMysteryMansionTravelFoleyV1({
      route,
      seed: `${props.session.id}:${props.session.revision}:exterior`,
      volume: props.audioVolume,
      enabled: props.audioEnabled,
      durationMs,
      outgoing: mysteryMansionRoomAcousticsV1({ room: grounds, houseStyle: state.config.houseStyle, venueProfile }),
      corridor: mysteryMansionCorridorAcousticsV1({
        corridor: { kind: "corridor", id: "front-walk", floor: entryRoom.floor, x: 0, y: 0, width: 3, height: 1 },
        houseStyle: state.config.houseStyle,
        venueProfile,
      }),
      destination: mysteryMansionRoomAcousticsV1({ room: entryRoom, houseStyle: state.config.houseStyle, venueProfile }),
      mechanicalDoors:
        venueProfile?.presentation?.compatibleAcousticFamilies.includes("maritime-passenger-v1") === true ||
        state.config.houseStyle.acousticThemePaletteId === "spacecraft-industrial-v1",
      includeFootsteps: returningFromExterior,
    });
    setExteriorEntryPresentation({
      deferred,
      route,
      fromRoom: grounds,
      toRoom: entryRoom,
      durationMs,
      startedAtMs: performance.now(),
      returningFromExterior,
    });
  }, [currentRoom, exteriorEntryPresentation, finishDeferredAction, finishExteriorEntry, playCompactTravelBridge, props.audioEnabled, props.audioVolume, props.session.id, props.session.revision, reducedMotion, requestDeferredAction, sendAction, state.config.houseStyle, state.rooms, venueEntryRoom, venueProfile]);

  useEffect(() => {
    if (!exteriorEntryPresentation) return;
    exteriorEntryTimerRef.current = window.setTimeout(
      () => finishExteriorEntry(false),
      exteriorEntryPresentation.durationMs,
    );
    return () => {
      if (exteriorEntryTimerRef.current !== null) {
        window.clearTimeout(exteriorEntryTimerRef.current);
        exteriorEntryTimerRef.current = null;
      }
    };
  }, [exteriorEntryPresentation, finishExteriorEntry]);

  useEffect(() => {
    if (!exteriorRoomReveal) return;
    const timer = window.setTimeout(() => setExteriorRoomReveal(false), 1_900);
    return () => window.clearTimeout(timer);
  }, [exteriorRoomReveal]);

  const finishMansionTravel = useCallback((collapseToCompact: boolean): void => {
    if (!travelPresentation) return;
    if (travelFrameRef.current !== null) {
      window.cancelAnimationFrame(travelFrameRef.current);
      travelFrameRef.current = null;
    }
    if (collapseToCompact) {
      travelFoleyRef.current?.cancel();
      playCompactTravelBridge(
        travelPresentation.route,
        travelPresentation.fromRoom,
        travelPresentation.toRoom,
        `${props.session.id}:${props.session.revision}:${travelPresentation.fromRoom.id}:${travelPresentation.toRoom.id}:skip`,
      );
    }
    travelFoleyRef.current = null;
    setTravelProgress(1);
    setMansionFloor(travelPresentation.toRoom.floor);
    if (travelPresentation.openingArrival) setOpeningMapReveal(true);
    setTravelPresentation(null);
    finishDeferredAction(travelPresentation.deferred);
  }, [finishDeferredAction, playCompactTravelBridge, props.session.id, props.session.revision, travelPresentation]);

  const beginMansionTravel = useCallback(async (
    toRoom: DebateMysteryRoomV2,
  ): Promise<void> => {
    if (!currentRoom) {
      void sendAction({ action: "move", roomId: toRoom.id });
      return;
    }
    if (currentRoom.id === toRoom.id) {
      void sendAction({ action: "move", roomId: toRoom.id });
      return;
    }
    const route = mansionLayout
      ? mansionLayoutV2TraversalRoute(mansionLayout, currentRoom.id, toRoom.id) ??
        legacyMansionTraversalRoute(currentRoom, toRoom)
      : legacyMansionTraversalRoute(currentRoom, toRoom);
    const deferred = await requestDeferredAction({ action: "move", roomId: toRoom.id });
    if (!deferred) return;
    const seed = `${props.session.id}:${props.session.revision}:${currentRoom.id}:${toRoom.id}`;
    if (toRoom.visited || reducedMotion) {
      playCompactTravelBridge(route, currentRoom, toRoom, seed);
      setMansionFloor(toRoom.floor);
      finishDeferredAction(deferred);
      return;
    }
    const durationMs = mysteryMansionTravelDurationMs(route);
    travelFoleyRef.current?.cancel();
    travelFoleyRef.current = playMysteryMansionTravelFoleyV1({
      route,
      seed,
      volume: props.audioVolume,
      enabled: props.audioEnabled,
      durationMs,
      ...travelAcousticsForRoute(route, currentRoom, toRoom),
    });
    setTravelProgress(0);
    setTravelPresentation({
      deferred,
      route,
      fromRoom: currentRoom,
      toRoom,
      durationMs,
      startedAtMs: performance.now(),
    });
  }, [currentRoom, finishDeferredAction, mansionLayout, playCompactTravelBridge, props.audioEnabled, props.audioVolume, props.session.id, props.session.revision, reducedMotion, requestDeferredAction, sendAction, travelAcousticsForRoute]);

  const beginCaseOpeningJourney = useCallback(async (): Promise<void> => {
    if (travelPresentation?.openingArrival) {
      finishMansionTravel(true);
      return;
    }
    const incidentScene = currentRoom;
    const entryRoom = venueEntryRoom;
    if (!incidentScene || !entryRoom) {
      setOpeningMapReveal(true);
      void sendAction({ action: "dismiss_case_opening" });
      return;
    }
    const route = mansionLayout
      ? mansionLayoutV2TraversalRoute(mansionLayout, entryRoom.id, incidentScene.id) ??
        legacyMansionTraversalRoute(entryRoom, incidentScene)
      : legacyMansionTraversalRoute(entryRoom, incidentScene);
    const deferred = await requestDeferredAction({ action: "dismiss_case_opening" });
    if (!deferred) return;
    const seed = `${props.session.id}:${props.session.revision}:opening:${entryRoom.id}:${incidentScene.id}`;
    if (reducedMotion || entryRoom.id === incidentScene.id) {
      playCompactTravelBridge(route, entryRoom, incidentScene, seed);
      setOpeningMapReveal(true);
      finishDeferredAction(deferred);
      return;
    }
    const durationMs = mysteryMansionTravelDurationMs(route);
    travelFoleyRef.current?.cancel();
    travelFoleyRef.current = playMysteryMansionTravelFoleyV1({
      route,
      seed,
      volume: props.audioVolume,
      enabled: props.audioEnabled,
      durationMs,
      ...travelAcousticsForRoute(route, entryRoom, incidentScene),
    });
    setMansionFloor(entryRoom.floor);
    setTravelProgress(0);
    setTravelPresentation({
      deferred,
      route,
      fromRoom: entryRoom,
      toRoom: incidentScene,
      durationMs,
      startedAtMs: performance.now(),
      openingArrival: true,
    });
  }, [currentRoom, finishDeferredAction, finishMansionTravel, mansionLayout, playCompactTravelBridge, props.audioEnabled, props.audioVolume, props.session.id, props.session.revision, reducedMotion, requestDeferredAction, sendAction, travelAcousticsForRoute, travelPresentation, venueEntryRoom]);

  useEffect(() => {
    if (!travelPresentation) return;
    const animate = (now: number): void => {
      const progress = Math.max(0, Math.min(
        1,
        (now - travelPresentation.startedAtMs) / travelPresentation.durationMs,
      ));
      setTravelProgress(progress);
      const point = mysteryMansionTravelPointAtProgress(travelPresentation.route, progress);
      setMansionFloor((floor) => floor === point.floor ? floor : point.floor);
      if (progress >= 1) {
        travelFrameRef.current = null;
        finishMansionTravel(false);
        return;
      }
      travelFrameRef.current = window.requestAnimationFrame(animate);
    };
    travelFrameRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (travelFrameRef.current !== null) {
        window.cancelAnimationFrame(travelFrameRef.current);
        travelFrameRef.current = null;
      }
    };
  }, [finishMansionTravel, travelPresentation]);

  useEffect(() => () => {
    if (travelFrameRef.current !== null) window.cancelAnimationFrame(travelFrameRef.current);
    if (exteriorEntryTimerRef.current !== null) window.clearTimeout(exteriorEntryTimerRef.current);
    travelFoleyRef.current?.cancel();
  }, []);

  useEffect(() => {
    if (!currentRoom || !debateMysteryRoomIntroductionShouldAutoCompleteV2({
      busy,
      hasActiveAudio: activeAudioRef.current !== null,
      hasHeldDialogue: heldDialogue !== null,
      hasQueuedDialogue: queuedDialogue !== null,
      phase: roomIntroductionPhase,
    })) return;
    const timer = window.setTimeout(() => {
      setSpeechTiming(null);
      void sendAction({ action: "complete_room_introduction", roomId: currentRoom.id });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [busy, currentRoom, heldDialogue, queuedDialogue, roomIntroductionPhase, sendAction, speechTiming]);

  useEffect(() => {
    const lineId = playbackLineId;
    const restoredPlayback =
      props.restoredAudioPerformanceKey === playbackPerformanceKey;
    if (!debateMysteryPreparedAudioShouldStart({
      audioEnabled: props.audioEnabled,
      audioVolume: props.audioVolume,
      interrogationAudioMayStart,
      lastPlayedPerformanceKey: lastPlayedPerformanceKeyRef.current,
      lineId,
      playbackPerformanceKey,
      restoredPerformanceKey: props.restoredAudioPerformanceKey ?? null,
      voicesEnabled: state.voicesEnabled,
    })) {
      if (restoredPlayback) {
        lastPlayedPerformanceKeyRef.current = playbackPerformanceKey;
        return;
      }
      if (lastPlayedPerformanceKeyRef.current !== playbackPerformanceKey) return;
      if (spectatorBeat) setCompletedSpectatorBeat(spectatorBeat);
      return;
    }
    if (lineId === null) return;
    lastPlayedPerformanceKeyRef.current = playbackPerformanceKey;
    setPreparedAudioStatus({ key: playbackPerformanceKey, status: "pending" });
    const audioGeneration = audioGenerationRef.current + 1;
    audioGenerationRef.current = audioGeneration;
    const audio = new Audio(
      `/api/debates/${encodeURIComponent(props.session.id)}/mystery-audio/${encodeURIComponent(lineId)}`,
    );
    activeAudioRef.current = audio;
    audio.volume = Math.max(0, Math.min(1, props.audioVolume));
    const releaseOutput = routeAudioElementToPrismOutput(audio, {
      roomAcoustics: state.playPhase === "investigation" && state.roomView === "room"
        ? currentRoomAcoustics?.voice
        : null,
    });
    activeAudioOutputCleanupRef.current = releaseOutput;
    let completed = false;
    let audioStarted = false;
    const speechTimingLoop = createWhodunnitSpeechTimingLoop({
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
      onFrame: (_now, publish) => {
        if (
          completed ||
          !whodunnitInterrogationCompletionIsCurrent(audioGeneration, audioGenerationRef.current)
        ) return false;
        if (publish) {
          const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration * 1_000
            // `playing` can precede WebKit's duration metadata for cached local
            // case WAVs. A one-millisecond placeholder immediately turns every
            // viseme into its resting mouth, so retain a natural spoken estimate
            // until the decoded duration arrives.
            : debateVoiceCompletionFallbackDurationMs(playbackText);
          setSpeechTiming({
            text: playbackText,
            elapsedMs: Math.min(durationMs, Math.max(0, audio.currentTime * 1_000)),
            durationMs,
            alignment: null,
            audible: true,
          });
        }
        return !audio.paused && !audio.ended;
      },
    });
    const startSpeechTimingLoop = (): void => {
      audioStarted = true;
      setPreparedAudioStatus({ key: playbackPerformanceKey, status: "started" });
      captionRevealGenerationRef.current += 1;
      speechTimingLoop.start();
    };
    const refreshSpeechTimingLoop = (): void => {
      if (!audio.paused) speechTimingLoop.start();
    };
    const completeBeat = (): void => {
      if (completed || !whodunnitInterrogationCompletionIsCurrent(audioGeneration, audioGenerationRef.current)) return;
      completed = true;
      if (!audioStarted) {
        setPreparedAudioStatus({ key: playbackPerformanceKey, status: "unavailable" });
      }
      speechTimingLoop.stop();
      setSpeechTiming(settledSpeechTiming(playbackText));
      if (activeAudioRef.current === audio) activeAudioRef.current = null;
      if (queuedDialogue) {
        if (state.playPhase === "investigation") return;
        if (interrogationPhase === "prosecutor_speaking") setInterrogationPhase("handoff");
        else if (interrogationPhase === "suspect_speaking") advanceDialoguePlayback();
        else advanceDialoguePlayback();
      }
      if (spectatorBeat) setCompletedSpectatorBeat(spectatorBeat);
    };
    const completeBeatNaturally = (): void => {
      releaseOutput?.release();
      completeBeat();
    };
    // `playing`, unlike `play`, means this local element has begun audible playback.
    audio.addEventListener("playing", startSpeechTimingLoop, { once: true });
    audio.addEventListener("loadedmetadata", refreshSpeechTimingLoop);
    audio.addEventListener("durationchange", refreshSpeechTimingLoop);
    audio.addEventListener("ended", completeBeatNaturally, { once: true });
    audio.addEventListener("error", completeBeat, { once: true });
    audio.addEventListener("pause", completeBeat, { once: true });
    void audio.play().catch(completeBeat);
    return () => {
      completed = true;
      speechTimingLoop.stop();
      if (audioGenerationRef.current === audioGeneration) audioGenerationRef.current += 1;
      setSpeechTiming((current) => {
        if (!current) return null;
        const belongsToReleasedLine = current.text === playbackText ||
          whodunnitCaptionSpeechText(current.text) === whodunnitCaptionSpeechText(playbackText);
        if (!belongsToReleasedLine) return current;
        return current.elapsedMs >= current.durationMs ? current : null;
      });
      audio.removeEventListener("playing", startSpeechTimingLoop);
      audio.removeEventListener("loadedmetadata", refreshSpeechTimingLoop);
      audio.removeEventListener("durationchange", refreshSpeechTimingLoop);
      audio.removeEventListener("ended", completeBeatNaturally);
      audio.removeEventListener("error", completeBeat);
      audio.removeEventListener("pause", completeBeat);
      if (activeAudioRef.current === audio) activeAudioRef.current = null;
      if (activeAudioOutputCleanupRef.current === releaseOutput) {
        activeAudioOutputCleanupRef.current = null;
      }
      void releaseAudibleAudioElement(audio, { onReleased: releaseOutput ?? undefined });
    };
  }, [
    advanceDialoguePlayback,
    playbackLineId,
    playbackPerformanceKey,
    playbackText,
    props.audioEnabled,
    props.audioVolume,
    props.restoredAudioPerformanceKey,
    props.session.id,
    queuedDialogue,
    interrogationAudioMayStart,
    interrogationPhase,
    spectatorBeat,
    state.playPhase,
    state.roomView,
    state.voicesEnabled,
    currentRoomAcoustics?.voice,
  ]);

  useEffect(() => {
    if (!dialogueSfxKey || !dialogueSfxFullText || !interrogationAudioMayStart) return;
    if (!debateMysteryCaptionFallbackShouldStart({
      preparedAudioExpected,
      preparedAudioStatus: preparedAudioStatusForPlayback,
    })) return;
    const revealGeneration = captionRevealGenerationRef.current + 1;
    captionRevealGenerationRef.current = revealGeneration;
    const durationMs = whodunnitDialogueTypewriterDurationMs(dialogueSfxFullText);
    let startedAt: number | null = null;
    let startTimer: number | null = null;
    let frame: number | null = null;
    const reveal = (): void => {
      if (!whodunnitInterrogationCompletionIsCurrent(
        revealGeneration,
        captionRevealGenerationRef.current,
      )) return;
      if (startedAt === null) startedAt = performance.now();
      const elapsedMs = Math.min(durationMs, performance.now() - startedAt);
      setSpeechTiming({
        text: dialogueSfxFullText,
        elapsedMs,
        durationMs,
        alignment: null,
        audible: false,
      });
      if (elapsedMs >= durationMs) {
        setSpeechTiming(settledSpeechTiming(dialogueSfxFullText));
        if (queuedDialogue && state.playPhase !== "investigation") {
          if (interrogationPhase === "prosecutor_speaking") setInterrogationPhase("handoff");
          else advanceDialoguePlayback();
        }
        if (spectatorBeat) setCompletedSpectatorBeat(spectatorBeat);
        return;
      }
      frame = window.requestAnimationFrame(reveal);
    };
    // Give prepared local speech one brief chance to establish its real clock.
    // If playback is suppressed, unavailable, or stalled, the caption still
    // begins on its own instead of flashing complete or remaining blank.
    startTimer = window.setTimeout(reveal, roomPlayerObservationActive ? 0 : 180);
    return () => {
      if (startTimer !== null) window.clearTimeout(startTimer);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [
    advanceDialoguePlayback,
    dialogueSfxFullText,
    dialogueSfxKey,
    preparedAudioExpected,
    preparedAudioStatusForPlayback,
    queuedDialogue,
    interrogationAudioMayStart,
    interrogationPhase,
    spectatorBeat,
    state.playPhase,
    roomPlayerObservationActive,
  ]);

  useEffect(() => {
    if (!spectatorBeat || completedSpectatorBeat !== spectatorBeat || busy) return;
    const timer = window.setTimeout(
      () => void sendAction({ action: "advance_spectator_trial" }),
      500,
    );
    return () => window.clearTimeout(timer);
  }, [busy, completedSpectatorBeat, sendAction, spectatorBeat]);

  useEffect(() => {
    if (!callout || callout.id === lastCalloutIdRef.current) return;
    lastCalloutIdRef.current = callout.id;
    void playDebateMysterySfx({
      cue: callout.callout === "order" ? "paper-place" : "theory",
      enabled: props.audioEnabled,
      volume: props.audioVolume,
    });
  }, [callout, props.audioEnabled, props.audioVolume]);

  useEffect(() => {
    setTheory(emptyTheory({
      theory: state.theory,
      suspects: state.suspects,
      caseCharge: state.caseCharge,
    }));
    if (state.playPhase === "theory") setTheoryOpen(true);
  }, [state.caseCharge, state.playPhase, state.theory, state.suspects]);

  useEffect(() => {
    if (state.roomView !== "mansion") return;
    const room = currentRoom ?? state.rooms[0] ?? null;
    if (!room) return;
    setMansionFloor(room.floor);
    setSelectedMansionRoomId(room.id);
  }, [currentRoom, state.roomView, state.rooms]);

  useEffect(() => {
    if (roomDialogueBaseline.contextKey === roomContextKey) return;
    setRoomDialogueBaseline({
      contextKey: roomContextKey,
      historyCount: state.dialogueHistory.length,
    });
    setDialoguePlaybackQueue([]);
    setDialoguePlaybackIndex(0);
    setHeldDialogue(null);
    setSpeechTiming(null);
    setPresentedCourtRecord(null);
    setInterrogationPhase(null);
    audioGenerationRef.current += 1;
    releaseActiveDialogueAudio();
  }, [releaseActiveDialogueAudio, roomContextKey, roomDialogueBaseline.contextKey, state.dialogueHistory.length]);

  useEffect(() => () => {
    audioGenerationRef.current += 1;
    releaseActiveDialogueAudio();
  }, [releaseActiveDialogueAudio]);

  const focusStatement = (offset: number): void => {
    if (!state.court || !activeStatement || activeStatementIndex < 0) return;
    const nextIndex = (activeStatementIndex + offset + state.court.statements.length) % state.court.statements.length;
    const next = state.court.statements[nextIndex];
    if (!next || next.statementId === activeStatement.statementId) return;
    cancelActiveDialogueAudio();
    setHeldDialogue(null);
    setSpeechTiming(null);
    setPresentedCourtRecord(null);
    dialogueGestureFillRef.current = { bot: false, key: null };
    dialogueGestureAdvanceRef.current = null;
    void sendAction({ action: "focus_statement", statementId: next.statementId });
  };

  const handleCourtDialogueClick = (event: React.MouseEvent<HTMLElement>): void => {
    if (whodunnitCourtDialogueGestureCrossedPresentation({
      armedPresentationKey: dialogueGestureAdvanceRef.current,
      clickCount: event.detail,
      presentationKey: dialogueSfxPresentation?.key ?? null,
    })) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!operateVisibleDialogueGesture(event.detail, finishCurrentDialogue)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleCourtDialogueKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!operateVisibleDialogueGesture(1, finishCurrentDialogue)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const renderRecordButtons = (onChoose: (reference: DebateMysteryRecordReferenceV2) => void): React.JSX.Element => (
    <div className={styles.recordGrid}>
      {admittedRecord.map((item) => {
        const assetUrl = item.reference.kind === "evidence"
          ? sealedMysteryAssetObjectUrl(
              sealedAssetObjectUrls,
              "evidence",
              item.reference.id,
              item.sealedAsset,
            )
          : null;
        return (
          <button key={recordKey(item.reference)} type="button" disabled={busy || dialoguePerformanceActive} onClick={() => onChoose(item.reference)}>
            {assetUrl
              ? <>
                  {/* Direct delivery preserves the sealed route's no-store boundary. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.recordAssetImage} src={assetUrl} alt="" />
                </>
              : <span aria-hidden="true">{item.emoji}</span>}
            <strong>{item.title}</strong><small>{item.description}</small>
          </button>
        );
      })}
      {admittedRecord.length === 0 ? <p>No admitted record items yet.</p> : null}
    </div>
  );

  const calloutStyle = callout?.actorColor
    ? ({ "--mystery-callout-color": callout.actorColor } as CSSProperties)
    : undefined;
  const roomParallaxEnabled = Boolean(
    currentRoom &&
      command === "examine" &&
      currentRoomUnexaminedHotspots.length > 0 &&
      !busy &&
      !dialoguePerformanceActive &&
      !heldDialogue &&
      !roomObservationAwaitingContinue &&
      !reducedMotion &&
      !caseFileOpen &&
      !theoryOpen,
  );
  const currentRoomHasIllustratedUpgrade = Boolean(
    currentRoom &&
      roomArtUpgradeStatus?.readyRoomIds.includes(currentRoom.id) &&
      !failedUpgradeRoomIds.has(currentRoom.id),
  );
  const currentRoomIllustratedUpgradeLoaded = Boolean(
    currentRoom && loadedUpgradeRoomIds.has(currentRoom.id),
  );
  const currentRoomArtStyle = whodunnitRoomArtStyleForUpgrade(
    roomUpgradeEnabled,
    currentRoomHasIllustratedUpgrade && currentRoomIllustratedUpgradeLoaded,
  );
  const currentRoomMosaicAssetUrl = currentRoom?.sealedAsset?.revealed &&
      currentRoom.sealedAsset.status === "ready"
    ? whodunnitSealedRoomArtUrl({
        sessionId: props.session.id,
        subjectId: currentRoom.id,
        style: "mosaic",
      })
    : null;
  const currentRoomUpgradeAssetUrl = currentRoom && currentRoomHasIllustratedUpgrade
    ? whodunnitSealedRoomArtUrl({
        sessionId: props.session.id,
        subjectId: whodunnitIllustratedRoomSubjectId(currentRoom.id),
        style: "illustrated",
      })
    : null;
  const currentRoomAssetKey = currentRoom
    ? sealedMysteryAssetKey("room", currentRoom.id)
    : null;
  const currentRoomBundledMosaicUrl = currentRoom
    ? whodunnitBundledRoomArtPathForRoom(
        currentRoom,
        "mosaic",
      )
    : null;
  const currentRoomLayoutEntity = currentRoom && mansionLayout
    ? mansionLayout.entities.find((entity) => entity.kind === "room" && entity.id === currentRoom.id) ?? null
    : null;
  const currentRoomIllustratedAssetId = currentRoom
    ? state.config.mansionSnapshot?.presentation.assets.find(
        (asset) =>
          asset.role === "room" &&
          asset.logicalId === whodunnitIllustratedRoomSubjectId(currentRoom.id),
      )?.id ?? null
    : null;
  const currentRoomMosaicMansionAssetId = currentRoomLayoutEntity?.kind === "room"
    ? currentRoomLayoutEntity.acceptedRoomAssetId
    : null;
  const currentRoomAcceptedMosaicUrl = currentRoomMosaicMansionAssetId &&
      state.config.mansionSnapshot?.sourceBundleId
    ? whodunnitMansionRoomArtUrl(
        state.config.mansionSnapshot.sourceBundleId,
        currentRoomMosaicMansionAssetId,
        "mosaic",
      )
    : null;
  const currentRoomAcceptedUpgradeUrl = currentRoomIllustratedAssetId &&
      state.config.mansionSnapshot?.sourceBundleId &&
      currentRoomHasIllustratedUpgrade
    ? whodunnitMansionRoomArtUrl(
        state.config.mansionSnapshot.sourceBundleId,
        currentRoomIllustratedAssetId,
        "illustrated",
      )
    : null;
  const currentRoomMosaicUrl = currentRoomMosaicAssetUrl
    ?? currentRoomAcceptedMosaicUrl
    ?? (currentRoom?.imageId
      ? whodunnitSavedRoomArtUrl(currentRoom.imageId, "mosaic")
      : null)
    ?? currentRoomBundledMosaicUrl;
  const currentRoomImageUrl = currentRoomArtStyle === "illustrated"
    ? currentRoomUpgradeAssetUrl ?? currentRoomAcceptedUpgradeUrl ?? currentRoomMosaicUrl
    : currentRoomMosaicUrl;
  const currentRoomLights = useMemo<readonly MansionDynamicLightV2[]>(
    () => currentRoom && mansionLayout
      ? mansionLayout.lights.filter((light) => light.roomId === currentRoom.id)
      : [],
    [currentRoom, mansionLayout],
  );
  const currentRoomUsesTemplateLightGeometry = currentRoom
    ? mysteryRoomUsesTemplateLightGeometryV1({
        imageId: currentRoom.imageId,
        acceptedRoomAssetId: currentRoomLayoutEntity?.kind === "room"
          ? currentRoomLayoutEntity.acceptedRoomAssetId
          : null,
        sealedAsset: currentRoom.sealedAsset,
      })
    : false;
  const investigationAvatarPresentation = whodunnitInvestigationAvatarPresentation(
    currentRoomArtStyle,
  );
  const roomSceneStyle = {
    "--room-image": currentRoomImageUrl ? `url(${currentRoomImageUrl})` : "none",
    "--room-parallax-x": `${roomParallax.x}px`,
    "--room-parallax-y": `${roomParallax.y}px`,
  } as CSSProperties;
  const lensActive = Boolean(
    command === "examine" &&
      currentRoomUnexaminedHotspots.length > 0 &&
      !busy &&
      !examinationStreaming &&
      !examiningHotspotId &&
      !roomObservationAwaitingContinue &&
      !caseFileOpen &&
      !theoryOpen,
  );
  const mosaicIlluminatedCells = lensActive &&
      currentRoomArtStyle === "mosaic" && currentRoom
    ? new Set(debateMysteryV2LensMosaicCellIndexes(investigationLens, currentRoom.hotspots))
    : new Set<number>();
  const mosaicLensGridStyle = {
    "--mosaic-lens-cell-width": `${100 / DEBATE_MYSTERY_V2_MOSAIC_LENS_COLUMNS}%`,
    "--mosaic-lens-cell-height": `${100 / DEBATE_MYSTERY_V2_MOSAIC_LENS_ROWS}%`,
  } as CSSProperties;
  const handleCurrentRoomArtLoadError = (): void => {
    if (!currentRoom || !currentRoomHasIllustratedUpgrade) return;
    setFailedUpgradeRoomIds((current) => {
      if (current.has(currentRoom.id)) return current;
      return new Set([...current, currentRoom.id]);
    });
  };
  const handleCurrentRoomUpgradeArtLoad = (): void => {
    if (!currentRoom || !currentRoomHasIllustratedUpgrade) return;
    setLoadedUpgradeRoomIds((current) => {
      if (current.has(currentRoom.id)) return current;
      return new Set([...current, currentRoom.id]);
    });
  };
  const completionCueVisible = Boolean(
    completionCueRoomId &&
      completionCueRoomId === currentRoom?.id &&
      command === "examine" &&
      roomComplete &&
      !busy &&
      !examinationStreaming &&
      !roomObservationAwaitingContinue,
  );
  const examineHotspot = async (hotspotId: string): Promise<void> => {
    if (!currentRoom || !lensActive) return;
    const completesRoom = debateMysteryV2ExaminationCompletesRoom(
      currentRoom.hotspots,
      hotspotId,
    );
    setExaminingHotspotId(hotspotId);
    const completed = await sendAction({ action: "examine", roomId: currentRoom.id, hotspotId });
    if (completed && completesRoom) setCompletionCueRoomId(currentRoom.id);
  };
  const advanceVisibleRoomDialogue = (): void => {
    const roomIntroductionGesture = debateMysteryRoomIntroductionGestureV2({
      casekeeperNarrationVisible: roomCasekeeperNarrationVisible,
      phase: roomIntroductionPhase,
    });
    if (
      roomIntroductionGesture === "reveal_casekeeper_narration" &&
      roomCasekeeperNarrationKey
    ) {
      setRevealedCasekeeperNarrationKey(roomCasekeeperNarrationKey);
      return;
    }
    if (roomIntroductionGesture === "advance_to_persona" && currentRoom) {
      void sendAction({ action: "advance_room_introduction", roomId: currentRoom.id });
      return;
    }
    finishCurrentDialogue();
  };
  useEffect(() => {
    if (roomIntroductionActive || !dialogueSfxPresentation) return;
    const requiresPlayerInput = caseFileOpen || theoryOpen;
    if (!whodunnitInvestigationDialogueShouldAutoAdvance({
      busy,
      hasActiveAudio: activeAudioRef.current !== null,
      hasDialogue: roomDisplayedDialogue !== null,
      isPlayerObservation: roomPlayerObservationActive,
      playPhase: state.playPhase,
      requiresPlayerInput,
      roomView: state.roomView,
      streaming: dialogueSfxPresentation.streaming,
    })) return;
    const presentationKey = dialogueSfxPresentation.key;
    const timer = window.setTimeout(() => {
      if (dialogueSfxPresentationRef.current.key !== presentationKey) return;
      finishCurrentDialogue(true);
    }, whodunnitInvestigationDialogueGraceMs({
      delivery: dialogueSfxPresentation.delivery,
      reducedMotion,
      text: dialogueSfxPresentation.fullText,
    }));
    return () => window.clearTimeout(timer);
  }, [
    busy,
    caseFileOpen,
    dialogueSfxPresentation,
    finishCurrentDialogue,
    reducedMotion,
    roomDisplayedDialogue,
    roomIntroductionActive,
    roomIntroductionAwaitingContinue,
    roomPlayerObservationActive,
    state.playPhase,
    state.roomView,
    theoryOpen,
  ]);
  const handleInvestigationDialogueClickCapture = (event: React.MouseEvent<HTMLElement>): void => {
    if (mysteryDialogueGestureOriginIsInteractive(event.target)) return;
    if (!operateVisibleDialogueGesture(event.detail, advanceVisibleRoomDialogue)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const handleRoomInvestigationClick = (event: React.MouseEvent<HTMLElement>): void => {
    if (!currentRoom) return;
    if (roomObservationAwaitingContinue) {
      finishCurrentDialogue();
      return;
    }
    if (roomIntroductionAwaitingContinue) {
      advanceVisibleRoomDialogue();
      return;
    }
    if (!lensActive) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const lens = resolveDebateMysteryV2Lens(
      ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100,
      ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100,
      currentRoom.hotspots,
    );
    setInvestigationLens(lens);
    const hotspotId = debateMysteryV2LensClickTarget(lens);
    if (hotspotId) void examineHotspot(hotspotId);
  };
  const handleRoomPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const normalizedX = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100;
    const normalizedY = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100;
    if (lensActive && currentRoom) {
      setInvestigationLens(resolveDebateMysteryV2Lens(
        normalizedX,
        normalizedY,
        currentRoom.hotspots,
      ));
    }
    if (roomParallaxEnabled && !(event.target instanceof Element && event.target.closest("button"))) {
      setRoomParallax({
        x: (normalizedX / 100 - 0.5) * 8,
        y: (normalizedY / 100 - 0.5) * 6,
      });
    }
  };
  const handleRoomPointerLeave = (): void => setRoomParallax({ x: 0, y: 0 });

  useEffect(() => {
    if (!completionCueRoomId) return;
    if (completionCueRoomId !== currentRoom?.id || command !== "examine") {
      setCompletionCueRoomId(null);
      return;
    }
    if (!completionCueVisible) return;
    const timer = window.setTimeout(() => setCompletionCueRoomId(null), 3_400);
    return () => window.clearTimeout(timer);
  }, [command, completionCueRoomId, completionCueVisible, currentRoom?.id]);

  useEffect(() => {
    if (!roomParallaxEnabled) setRoomParallax({ x: 0, y: 0 });
  }, [roomParallaxEnabled]);

  const defendantVerdicts = state.verdict?.defendantVerdicts ?? [];
  const verdictIsMixed = new Set(defendantVerdicts.map((entry) => entry.legalResult)).size > 1;
  const exportReusableCase = async (): Promise<void> => {
    if (caseExportState === "exporting") return;
    setCaseExportState("exporting");
    try {
      await props.onExportCase();
      setCaseExportState("exported");
    } catch (caught) {
      setCaseExportState("failed");
      setError(caught instanceof Error ? caught.message : "The reusable case could not be exported.");
    }
  };

  if (state.playPhase === "title_card" || visitingExterior) {
    const preparedMansionExteriorUrl = sealedMysteryAssetObjectUrl(
      sealedAssetObjectUrls,
      "room",
      DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1,
      state.mansionExterior,
    );
    const mansionExteriorUrl = props.mansionExteriorUrl ?? preparedMansionExteriorUrl ??
      debateMysteryMansionExteriorFallbackV1(
        state.config.houseStyle,
        state.config.scaleClass,
        venueProfile,
      );
    const mansionDoorTarget = debateMysteryMansionDoorTargetV1(
      state.config.houseStyle,
      state.config.scaleClass,
      venueProfile,
    );
    const mansionDoorEntry = state.config.investigationMode === "full" && !spectator;
    const firstPersonExterior = visitingExterior || props.exteriorIntroStarted;
    const startWhodunnit = (): void => {
      if (!mansionDoorEntry) {
        void sendAction({ action: "move" });
        return;
      }
      props.onExteriorIntroStart();
    };
    const enterFromExterior = (): void => {
      void beginExteriorEntry(visitingExterior);
    };
    return (
      <main
        className={styles.titleCard}
        data-theme={props.theme}
        data-first-person-exterior={firstPersonExterior ? "true" : undefined}
        data-exterior-entering={exteriorEntryPresentation ? "true" : undefined}
        style={{
          "--mansion-exterior-image": `url("${mansionExteriorUrl}")`,
          "--mansion-door-x": `${mansionDoorTarget.xPercent}%`,
          "--mansion-door-y": `${mansionDoorTarget.yPercent}%`,
        } as CSSProperties}
      >
        <span className={styles.titleCoverMedia} aria-hidden="true" />
        <SceneMediaVignette
          theme={props.theme}
          style={{ "--scene-vignette-z": 1 } as CSSProperties}
        />
        {!firstPersonExterior ? (
          <>
            <button type="button" className={styles.archiveButton} disabled={busy} onClick={props.onExit}>← Archive</button>
            <div
              className={styles.titleCardContent}
              data-door-threshold={mansionDoorEntry ? "true" : undefined}
            >
              <div className={styles.titlePrism} aria-hidden="true">◇</div>
              <p className={styles.eyebrow}>PRISM presents</p>
              <h1>{state.caseTitle}</h1>
              <p>{state.fictionLabel}</p>
              <div className={styles.titleMetadata}>
                {state.caseCharge ? <span>{state.caseCharge.title}</span> : null}<span>{state.suspects.length} witnesses</span><span>{state.config.trialType === "jury" ? "Jury Trial" : "Bench Trial"}</span>{state.config.investigationMode === "court_only" ? <span>Court act</span> : null}<span>{state.voicesEnabled ? "Local performance ready" : "Text performance"}</span>
              </div>
              <button
                type="button"
                className={styles.primaryAction}
                disabled={busy}
                onClick={startWhodunnit}
                data-tutorial-target="whodunnit-start"
              >Start</button>
              {error ? <p className={styles.error}>{error}</p> : null}
            </div>
          </>
        ) : mansionDoorEntry ? (
            <button
              type="button"
              className={styles.titleDoor}
              data-tutorial-target="whodunnit-enter-mansion"
              disabled={busy && !exteriorEntryPresentation}
              aria-label={exteriorEntryPresentation
                ? visitingExterior
                  ? `Enter ${venueEntryRoom?.name ?? "the venue entry"} now`
                  : `${venueEntryAction} now`
                : venueEntryAction}
              onClick={enterFromExterior}
            >
              <span className={styles.titleDoorFocus} aria-hidden="true">
                <span className={styles.titleDoorMark} />
              </span>
              <span className={styles.titleEntryAction}>{venueEntryAction}</span>
            </button>
        ) : null}
      </main>
    );
  }

  if (state.playPhase === "case_opening") {
    const openingDialogue = state.dialogueHistory.findLast((entry) => entry.nodeId === "briefing-opening") ?? lastDialogue;
    const openingText = openingDialogue
      ? mysteryProsecutorOpeningText(
          splitDebateMysteryStageActionTextV2(openingDialogue.visibleText, null).spokenText,
        )
      : `The known details of ${state.caseTitle ?? "this case"} are in the file.`;
    const openingJourney = travelPresentation?.openingArrival ? travelPresentation : null;
    const continueOpening = (): void => {
      if (busy) return;
      if (openingJourney) {
        finishMansionTravel(true);
        return;
      }
      void beginCaseOpeningJourney();
    };
    const handleOpeningKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        if (openingJourney) finishMansionTravel(true);
        else operateVisibleDialogueGesture(1, continueOpening);
      }
    };
    return (
      <main className={styles.caseOpening} data-theme={props.theme}>
        <section
          className={styles.caseOpeningStage}
          data-stage={openingJourney ? "journey" : "thought"}
          aria-label={openingJourney
            ? `${playerCharacterName} is moving through the ${venuePlaceNoun} to ${currentRoom?.name ?? "the incident scene"}. Activate to arrive now.`
            : `Internal thought from ${playerCharacterName}. Click anywhere to continue to the incident scene.`}
          aria-busy={busy || undefined}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            if (mysteryDialogueGestureOriginIsInteractive(event.target)) return;
            if (openingJourney) finishMansionTravel(true);
            else if (!operateVisibleDialogueGesture(event.detail, continueOpening)) return;
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={handleOpeningKeyDown}
        >
          {openingJourney ? (
            <div
              className={styles.caseOpeningJourney}
              style={{ "--player-orb-color": playerCharacterColor } as CSSProperties}
            >
              <header>
                <small>Inside the {venuePlaceNoun}</small>
                <strong>{mansionFloorDisplayName}</strong>
              </header>
              <div className={`${styles.mansionCanvas} ${styles.caseOpeningMansionCanvas}`}>
                {mansionCorridors.map((placement) => (
                  <i
                    key={placement.corridor.id}
                    className={styles.mansionCorridor}
                    data-route={openingJourney.route.entityIds.includes(placement.corridor.id) ? "true" : undefined}
                    aria-hidden="true"
                    style={{
                      left: `${mansionX(placement.x)}%`,
                      top: `${mansionY(placement.y)}%`,
                      width: `${mansionWidth(placement.width)}%`,
                      height: `${mansionHeight(placement.height)}%`,
                    }}
                  />
                ))}
                {mansionDoors.map((door) => (
                  <i
                    key={door.key}
                    className={styles.mansionDoor}
                    data-orientation={door.orientation}
                    aria-hidden="true"
                    style={{ left: `${mansionX(door.x)}%`, top: `${mansionY(door.y)}%` }}
                  />
                ))}
                {mansionPlacements.map((placement) => {
                  const isDestination = placement.room.id === currentRoom?.id;
                  return (
                    <i
                      key={placement.room.id}
                      className={styles.caseOpeningJourneyRoom}
                      data-destination={isDestination ? "true" : undefined}
                      data-route={openingJourney.route.entityIds.includes(placement.room.id) ? "true" : undefined}
                      aria-hidden="true"
                      style={{
                        left: `${mansionX(placement.x)}%`,
                        top: `${mansionY(placement.y)}%`,
                        width: `${mansionWidth(placement.width)}%`,
                        height: `${mansionHeight(placement.height)}%`,
                      }}
                    >
                      {isDestination ? <strong>{placement.room.name}</strong> : null}
                    </i>
                  );
                })}
                {mansionPlayerPoint ? (
                  <MysteryPlayerOrb
                    className={styles.mansionPlayerOrb}
                    color={playerCharacterColor}
                    glyph={playerCharacterGlyph}
                    label={`${playerCharacterName} walking to ${currentRoom?.name ?? "the incident scene"}`}
                    renderBotGlyph={props.renderBotGlyph}
                    style={{
                      left: `${mansionX(mansionPlayerPoint.x)}%`,
                      top: `${mansionY(mansionPlayerPoint.y)}%`,
                    }}
                  />
                ) : null}
              </div>
              <span className={styles.caseOpeningJourneyStatus} role="status">
                Walking to {currentRoom?.name ?? "the incident scene"} · click, Enter, or Space to arrive now
              </span>
            </div>
          ) : (
            <div
              className={styles.caseOpeningDialogue}
              style={{ "--dialogue-accent": playerCharacterColor } as CSSProperties}
            >
              <small className={styles.dialogueSpeakerSignature}>
                <i aria-hidden="true">
                  {props.renderBotGlyph(playerCharacterGlyph ?? null, { size: 14, strokeWidth: 1.65 })}
                </i>
                <span>{playerCharacterName}</span>
              </small>
              <p>{revealedSpeechText(whodunnitCaptionSpeechText(openingText), captionSpeechTiming)}</p>
              <span className={styles.dialogueContinueHint} role="status">{busy ? "Preparing the route…" : "Continue"}</span>
            </div>
          )}
        </section>
        {error ? (
          <WhodunnitChromeErrorNotice
            message={error}
            onDismiss={() => setError(null)}
          />
        ) : null}
      </main>
    );
  }

  if (state.playPhase === "verdict" && state.verdict && !courtPresentationActive) {
    const retryable = state.court?.credibilityRemaining === 0 && Boolean(state.court.checkpoint);
    return (
      <main className={styles.verdict} data-theme={props.theme}>
        {callout ? <div key={callout.id} className={styles.callout} style={calloutStyle} role="status" aria-live="assertive"><span>{CALLOUT_COPY[callout.callout]}</span></div> : null}
        <button type="button" className={styles.archiveButton} onClick={props.onExit}>← Archive</button>
        <p className={styles.eyebrow}>The Court finds · {state.caseCharge?.title ?? "Filed charge"}</p>
        <h1 data-result={verdictIsMixed ? "mixed" : state.verdict.legalResult}>{verdictIsMixed ? "MIXED VERDICT" : state.verdict.legalResult === "guilty" ? "GUILTY" : "NOT GUILTY"}</h1>
        {defendantVerdicts.length ? (
          <section className={styles.defendantVerdicts} aria-label="Verdicts by defendant">
            {defendantVerdicts.map((entry) => {
              const defendant = state.suspects.find((suspect) => suspect.seatId === entry.seatId);
              return <article key={entry.seatId} data-result={entry.legalResult}><strong>{defendant?.name ?? "Defendant"}</strong><span>{entry.legalResult === "guilty" ? "GUILTY" : "NOT GUILTY"}</span></article>;
            })}
          </section>
        ) : null}
        <section className={styles.truthGrade}>
          <h2>{state.verdict.classification.replaceAll("_", " ")}</h2>
          <p>Truth and proof grade: <strong>{state.verdict.proofGrade}</strong></p>
          <p>The sealed truth remained fixed throughout the social verdict.</p>
        </section>
        {state.verdict.jurorBallots.length > 0 ? (
          <section className={styles.ballots}><h2>Juror breakdown</h2>{state.verdict.jurorBallots.map((ballot) => {
            const bot = botById.get(ballot.jurorBotId);
            const defendant = state.suspects.find((suspect) => suspect.seatId === ballot.defendantSeatId);
            return <article key={`${ballot.jurorBotId}:${ballot.defendantSeatId ?? "legacy"}`}><strong>{bot?.name ?? "Juror"}</strong><span>{ballot.vote.replace("_", " ")}</span>{defendant ? <small>Re: {defendant.name}</small> : null}<p>{ballot.reason}</p>{ballot.powerAffected ? <small>Power affected</small> : null}</article>;
          })}</section>
        ) : null}
        <div className={styles.verdictActions}>
          <button type="button" disabled={caseExportState === "exporting"} onClick={() => void exportReusableCase()} data-tutorial-target="whodunnit-case-export">
            {caseExportState === "exporting" ? "Exporting .case…" : caseExportState === "exported" ? ".case exported" : caseExportState === "failed" ? "Export .case again" : "Export reusable .case"}
          </button>
          {retryable && !spectator ? <button type="button" className={styles.primaryAction} disabled={busy} onClick={() => void sendAction({ action: "retry_witness_checkpoint" })}>Retry current witness</button> : null}
          <button
            type="button"
            className={styles.primaryAction}
            data-tutorial-target="debate-copy-all-review-data"
            disabled={props.reviewCopyState === "copying"}
            onClick={() => void props.onCopyAllReviewData()}
          >
            {props.reviewCopyState === "copying"
              ? "Copying review…"
              : props.reviewCopyState === "copied"
                ? "Review data copied"
                : props.reviewCopyState === "failed"
                  ? "Copy failed — try again"
                  : "Copy all review data"}
          </button>
          <button
            type="button"
            data-tutorial-target="debate-copy-transcript"
            disabled={props.transcriptCopyState === "copying"}
            onClick={() => void props.onCopyVerboseTranscript()}
          >
            {props.transcriptCopyState === "copying"
              ? "Copying transcript…"
              : props.transcriptCopyState === "copied"
                ? "Transcript copied"
                : props.transcriptCopyState === "failed"
                  ? "Copy failed — try again"
                  : "Copy verbose transcript"}
          </button>
          <button type="button" onClick={props.onExit}>Return to Archive</button>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
      </main>
    );
  }

  if (courtPresentationActive && state.court && activeStatement) {
    return (
      <main className={styles.court} style={props.stageAlignmentStyle} data-theme={props.theme} data-dialogue-playback={dialoguePerformanceActive ? "active" : undefined} data-tutorial-target="mystery-v2-court">
        <SessionAtmosphereLayer
          sessionKey={`whodunnit-v2-court:${props.session.id}`}
          backgroundUrl="/audio/debate/courtroom-audience-murmur-loop.mp3"
          active={props.audioEnabled}
          volume={props.audioVolume}
          mix={WHODUNNIT_COURT_ATMOSPHERE_MIX}
          lifecycleTransitionMs={600}
          mixTransitionMs={400}
          backgroundRecordable={false}
          ambientFoley={false}
        />
        {identityPresentationBlackout}
        {callout ? <div key={callout.id} className={styles.callout} style={calloutStyle} role="status" aria-live="assertive"><span>{CALLOUT_COPY[callout.callout]}</span></div> : null}
        <header className={styles.courtHeader}>
          <button type="button" onClick={props.onExit}>← Archive</button>
          <div><p className={styles.eyebrow}>{state.caseTitle}</p><strong>{spectator ? `Gallery · ${prosecutorBot?.name ?? "Prosecutor"}` : `${prosecutorBot?.name ?? "Prosecutor"} · Cross-Examination`}</strong></div>
          <button type="button" onClick={() => { setCaseFileOpen(true); setCaseFileUpdate(null); }} data-tutorial-target="mystery-v2-case-file">Case File <span>{caseFileEntryCount}</span></button>
        </header>
        <div className={styles.credibility} aria-label={`${state.court.credibilityRemaining} of ${state.court.credibilityMaximum} credibility remaining`}>
          <span>Credibility</span><div>{Array.from({ length: state.court.credibilityMaximum }, (_, index) => <i key={index} data-full={index < state.court!.credibilityRemaining ? "true" : undefined} />)}</div>
        </div>
        <section
          className={styles.courtStage}
          data-camera={courtCamera}
          aria-label={whodunnitCourtCameraLabel(courtCamera)}
        >
          <div className={styles.courtBackdrop} aria-hidden="true" />
          {courtCamera === "wide" ? (
            <div className={styles.wideCourtComposition} aria-label="Courtroom establishing view">
              <article className={styles.wideCourtPresence} data-role="prosecution" data-speaking={prosecutorDialogueActive ? "true" : undefined} style={{ "--court-presence-color": prosecutorBot?.color ?? "#72d7ff" } as CSSProperties}>
                {prosecutorBot ? props.renderMysteryBotAvatar(prosecutorBot, "mini", { demeanor: "partner", talking: speechTiming !== null && prosecutorDialogueActive, speechTiming: prosecutorDialogueActive ? speechTiming : null, blinkEnabled: true, facing: "left" }) : <span>◇</span>}
                <small>Prosecution</small>
              </article>
              <article className={styles.wideCourtPresence} data-role="judge" data-speaking={judgeDialogueActive ? "true" : undefined} style={{ "--court-presence-color": judgeBot?.color ?? "#d5c8ff" } as CSSProperties}>
                {judgeBot ? props.renderMysteryBotAvatar(judgeBot, "mini", { demeanor: "partner", talking: speechTiming !== null && judgeDialogueActive, speechTiming: judgeDialogueActive ? speechTiming : null, blinkEnabled: true }) : <span>◇</span>}
                <small>Judge</small>
              </article>
              <article className={styles.wideCourtPresence} data-role="defense" data-speaking={defenseDialogueActive ? "true" : undefined} style={{ "--court-presence-color": defenseBot?.color ?? "#ff7eaa" } as CSSProperties}>
                {defenseBot ? props.renderMysteryBotAvatar(defenseBot, "mini", { demeanor: "partner", talking: speechTiming !== null && defenseDialogueActive, speechTiming: defenseDialogueActive ? speechTiming : null, blinkEnabled: true, facing: "right" }) : <span>◇</span>}
                <small>Defense</small>
              </article>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.wideEvidenceTable} src={`/coffee-table/table_${props.theme}.png`} alt="Evidence table" />
            </div>
          ) : null}
          {courtCamera === "witness" ? (
            <>
              <div className={styles.galleryRail} aria-hidden="true" />
              <section className={styles.counselComposition} aria-label="Court counsel">
                <article className={styles.counselSeat} data-side="prosecution" data-speaking={prosecutorDialogueActive ? "true" : undefined} style={{ "--counsel-color": prosecutorBot?.color ?? "#72d7ff" } as CSSProperties}>
                  {prosecutorDialogueActive && dialogueActionPresentation ? <SignalVoiceActionText key={`prosecution:${displayedDialogue?.nodeId ?? ""}:${displayedDialogue?.occurredAt ?? ""}`} {...dialogueActionPresentation} accent={prosecutorBot?.color} /> : null}
                  <div className={styles.counselAvatar}>{prosecutorBot ? props.renderMysteryBotAvatar(prosecutorBot, "mini", { demeanor: "partner", talking: speechTiming !== null && prosecutorDialogueActive, speechTiming: prosecutorDialogueActive ? speechTiming : null, blinkEnabled: true, facing: "left" }) : <span>◇</span>}</div>
                  <i className={styles.counselGlyph} aria-hidden="true">{props.renderBotGlyph(prosecutorBot?.glyph ?? null, { size: 26, strokeWidth: 1.5 })}</i>
                  <div className={styles.counselIdentity}><small>Player Prosecutor</small><strong>{prosecutorBot?.name ?? "Prosecutor"}</strong></div>
                </article>
                <article className={styles.counselSeat} data-side="defense" data-speaking={defenseDialogueActive ? "true" : undefined} style={{ "--counsel-color": defenseBot?.color ?? "#ff7eaa" } as CSSProperties}>
                  {defenseDialogueActive && dialogueActionPresentation ? <SignalVoiceActionText key={`defense:${displayedDialogue?.nodeId ?? ""}:${displayedDialogue?.occurredAt ?? ""}`} {...dialogueActionPresentation} accent={defenseBot?.color} /> : null}
                  <div className={styles.counselAvatar}>{defenseBot ? props.renderMysteryBotAvatar(defenseBot, "mini", { demeanor: "partner", talking: speechTiming !== null && defenseDialogueActive, speechTiming: defenseDialogueActive ? speechTiming : null, blinkEnabled: true, facing: "right" }) : <span>◇</span>}</div>
                  <i className={styles.counselGlyph} aria-hidden="true">{props.renderBotGlyph(defenseBot?.glyph ?? null, { size: 26, strokeWidth: 1.5 })}</i>
                  <div className={styles.counselIdentity}><small>Defense Counsel</small><strong>{defenseBot?.name ?? "Defense"}</strong></div>
                </article>
              </section>
              <section className={styles.witnessStand} style={{ "--witness-color": courtPresentedWitness?.color ?? "#a98cff" } as CSSProperties}>
                <div className={styles.witnessAvatar}>{courtPresentedWitnessBot ? props.renderMysteryBotAvatar(courtPresentedWitnessBot, "full", { demeanor: "suspect", talking: speechTiming !== null && courtPresentedWitnessDialogueActive, speechTiming: courtPresentedWitnessDialogueActive ? speechTiming : null, blinkEnabled: true, facing: "left" }) : <span>◇</span>}{courtWitnessActionPresentation ? <SignalVoiceActionText key={`witness:${displayedDialogue?.nodeId ?? activeStatement?.statementId ?? ""}:${displayedDialogue?.occurredAt ?? ""}`} {...courtWitnessActionPresentation} accent={courtPresentedWitness?.color} /> : null}</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.witnessStandAsset} src={`/debate/whodunnit-witness-foreground-${props.theme}.png`} alt="" aria-hidden="true" />
              </section>
            </>
          ) : null}
          {courtCamera === "prosecution" && prosecutorBot ? (
            <section className={styles.courtPodiumFocus} data-side="prosecution" style={{ "--court-presence-color": prosecutorBot.color ?? "#72d7ff" } as CSSProperties}>
              <div className={styles.courtPodiumAvatar}>{props.renderMysteryBotAvatar(prosecutorBot, "full", { demeanor: "partner", talking: speechTiming !== null && prosecutorDialogueActive, speechTiming: prosecutorDialogueActive ? speechTiming : null, blinkEnabled: true, facing: "left" })}{dialogueActionPresentation ? <SignalVoiceActionText key={`prosecution-focus:${displayedDialogue?.nodeId ?? ""}:${displayedDialogue?.occurredAt ?? ""}`} {...dialogueActionPresentation} accent={prosecutorBot.color} /> : null}</div>
              <div className={styles.courtPodiumForeground} aria-hidden="true" />
              <div className={styles.courtPodiumIdentity}><small>Player Prosecutor</small><strong>{prosecutorBot.name}</strong></div>
            </section>
          ) : null}
          {courtCamera === "defense" && defenseFocusBot ? (
            <section className={styles.courtPodiumFocus} data-side="defense" style={{ "--court-presence-color": defenseFocusBot.color ?? "#ff7eaa" } as CSSProperties}>
              <div className={styles.courtPodiumAvatar}>{props.renderMysteryBotAvatar(defenseFocusBot, "full", { demeanor: defendantDialogueActive ? "suspect" : "partner", talking: speechTiming !== null && (defenseDialogueActive || defendantDialogueActive), speechTiming: defenseDialogueActive || defendantDialogueActive ? speechTiming : null, blinkEnabled: true, facing: "right" })}{dialogueActionPresentation ? <SignalVoiceActionText key={`defense-focus:${displayedDialogue?.nodeId ?? ""}:${displayedDialogue?.occurredAt ?? ""}`} {...dialogueActionPresentation} accent={defenseFocusBot.color} /> : null}</div>
              <div className={styles.courtPodiumForeground} aria-hidden="true" />
              <div className={styles.courtPodiumIdentity}><small>{defenseFocusRole}</small><strong>{defenseFocusBot.name}</strong></div>
            </section>
          ) : null}
          {courtCamera === "judge" ? (
            <section className={styles.courtJudgeFocus} style={{ "--court-presence-color": judgeBot?.color ?? "#d5c8ff" } as CSSProperties}>
              <div className={styles.courtJudgeAvatar}>{judgeBot ? props.renderMysteryBotAvatar(judgeBot, "full", { demeanor: "partner", talking: speechTiming !== null && judgeDialogueActive, speechTiming: judgeDialogueActive ? speechTiming : null, blinkEnabled: true }) : <span>◇</span>}{dialogueActionPresentation ? <SignalVoiceActionText key={`judge-focus:${displayedDialogue?.nodeId ?? ""}:${displayedDialogue?.occurredAt ?? ""}`} {...dialogueActionPresentation} accent={judgeBot?.color} /> : null}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.courtJudgeGavel} src={`/debate/moderator-gavel-${props.theme}-down.png`} alt="" aria-hidden="true" />
              <div className={styles.courtPodiumIdentity}><small>Presiding Judge</small><strong>{judgeBot?.name ?? "The Court"}</strong></div>
            </section>
          ) : null}
          {presentedCourtRecordItem && courtCamera === "witness" ? (
            <aside
              className={styles.courtEvidenceProjectors}
              aria-label={`Presented evidence: ${presentedCourtRecordItem.title}`}
              data-court-evidence-projectors="true"
            >
              <article className={styles.courtEvidenceProjector} data-projector-side="image" aria-label="Evidence image">
                <div className={styles.courtEvidenceProjection} data-court-evidence-plane="image">
                  <small>Exhibit visual</small>
                  <div className={styles.courtEvidenceVisual}>
                    {presentedCourtRecordAssetUrl ? (
                      // Direct delivery preserves the sealed route's no-store boundary.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={presentedCourtRecordAssetUrl} alt="" />
                    ) : <span aria-hidden="true">{presentedCourtRecordItem.emoji}</span>}
                  </div>
                </div>
                <i className={styles.courtEvidenceBeam} aria-hidden="true" />
                <div className={styles.courtEvidenceProjectorMount} aria-hidden="true">
                  <i className={styles.courtEvidencePrism} />
                  <i className={styles.courtEvidenceSocket} />
                </div>
              </article>
              <article className={styles.courtEvidenceProjector} data-projector-side="record" aria-label="Court record description">
                <div className={styles.courtEvidenceProjection} data-court-evidence-plane="record">
                  <small>Presented to the Court</small>
                  <strong>{presentedCourtRecordItem.title}</strong>
                  <p>{presentedCourtRecordItem.description}</p>
                  <span>{presentedCourtRecordKindLabel} · Admitted record</span>
                </div>
                <i className={styles.courtEvidenceBeam} aria-hidden="true" />
                <div className={styles.courtEvidenceProjectorMount} aria-hidden="true">
                  <i className={styles.courtEvidencePrism} />
                  <i className={styles.courtEvidenceSocket} />
                </div>
              </article>
            </aside>
          ) : null}
        </section>
        <section className={styles.testimony}>
          <div className={styles.testimonyNav}>
            {spectator ? null : <button type="button" aria-label="Previous statement" onClick={() => focusStatement(-1)} disabled={busy || dialoguePerformanceActive}>‹</button>}
            <span>{activeStatementIndex + 1} / {state.court.statements.length}</span>
            {spectator ? null : <button type="button" aria-label="Next statement" onClick={() => focusStatement(1)} disabled={busy || dialoguePerformanceActive}>›</button>}
          </div>
          <p role="button" tabIndex={0} onClick={handleCourtDialogueClick} onKeyDown={handleCourtDialogueKeyDown}>{revealedSpeechText(whodunnitCaptionSpeechText(activeStatementDelivery.spokenText), captionSpeechTiming)}</p>
          <small>{activeStatement.pressed ? "Pressed" : "Sworn statement"}{activeStatement.version > 1 ? ` · Revision ${activeStatement.version}` : ""}</small>
        </section>
        {displayedDialogue && displayedDialogue.lineId !== activeStatement.lineId ? (
          <aside className={styles.courtReaction} role="button" tabIndex={0} onClick={handleCourtDialogueClick} onKeyDown={handleCourtDialogueKeyDown}><strong>{dialogueBot?.name ?? "Court"}</strong><p>{revealedSpeechText(whodunnitCaptionSpeechText(displayedDialogueDelivery.spokenText), captionSpeechTiming)}</p></aside>
        ) : null}
        {spectator ? <aside className={styles.courtReaction} role="status"><strong>Watch-only court</strong><p>The selected Prosecutor is conducting the examination from the frozen admissible record.</p></aside> : <nav className={styles.courtActions} aria-label="Prosecution actions" data-console-label="Prosecution console">
          <button type="button" data-command="press" disabled={busy || dialoguePerformanceActive} onClick={() => { playControlSfx("clip"); setPresentedCourtRecord(null); void sendAction({ action: "press_statement", statementId: activeStatement.statementId }); }} data-tutorial-target="mystery-v2-press"><span>!</span>Press</button>
          <button type="button" data-command="objection" data-active={command === "present" ? "true" : undefined} aria-pressed={command === "present"} disabled={busy || dialoguePerformanceActive} onClick={() => { playControlSfx("paper"); setCommand("present"); }} data-tutorial-target="mystery-v2-present-record"><span>◇</span>Objection</button>
          <button type="button" data-command="think" disabled={busy || dialoguePerformanceActive} onClick={() => { playControlSfx("pencil"); void sendAction({ action: "review_strategy", contextNodeId: state.activeDialogueNodeId }); }} data-tutorial-target="mystery-v2-think"><span>◈</span>Think</button>
        </nav>}
        {!spectator && command === "present" ? <div className={styles.choiceTray}><header><h2>Object with evidence or sworn testimony</h2><button type="button" onClick={() => setCommand(null)}>Close</button></header>{renderRecordButtons((record) => { setCommand(null); setPresentedCourtRecord(record); void sendAction({ action: "object_statement", statementId: activeStatement.statementId, record }); })}</div> : null}
        {!spectator && state.pendingProsecutionChoice ? <div className={styles.prosecutionChoice} role="dialog" aria-modal="true" aria-labelledby="prosecution-choice-title"><p className={styles.eyebrow}>Your response</p><h2 id="prosecution-choice-title">{state.pendingProsecutionChoice.prompt}</h2>{state.pendingProsecutionChoice.options.map((option) => <button key={option.id} type="button" disabled={busy || dialoguePerformanceActive} onClick={() => void sendAction({ action: "choose_prosecution_response", choiceId: state.pendingProsecutionChoice!.id, optionId: option.id })}>{option.text}</button>)}</div> : null}
        {caseFileUpdate ? <CaseFileUpdateNotice update={caseFileUpdate} onView={() => { setCaseFileOpen(true); setCaseFileUpdate(null); }} onDismiss={() => setCaseFileUpdate(null)} /> : null}
        {caseFileOpen ? <CaseFile state={state} playerName={playerCharacterName} playerBot={prosecutorBot} playerColor={playerCharacterColor} playerGlyph={playerCharacterGlyph ?? null} renderBotGlyph={props.renderBotGlyph} renderMysteryBotAvatar={props.renderMysteryBotAvatar} objectUrls={sealedAssetObjectUrls} saveState={sealedAssetSaveState} onSaveAsset={saveSealedAsset} onClose={() => setCaseFileOpen(false)} /> : null}
        {error ? (
          <WhodunnitChromeErrorNotice
            message={error}
            onDismiss={() => setError(null)}
          />
        ) : null}
      </main>
    );
  }

  return (
    <main className={styles.investigation} data-theme={props.theme} data-view={state.roomView} data-opening-map-reveal={openingMapReveal ? "true" : undefined} data-exterior-room-reveal={exteriorRoomReveal ? "true" : undefined} data-tutorial-target="mystery-v2-investigation" onClickCapture={handleInvestigationDialogueClickCapture}>
      <SessionAtmosphereLayer
        sessionKey={`whodunnit-v2-mansion-ambience:${props.session.id}:${state.config.houseStyle.id}`}
        backgroundUrl={`/api/debates/${encodeURIComponent(props.session.id)}/mystery-mansion/atmosphere`}
        backgroundFallbackUrl={mansionAmbienceAsset?.url ?? null}
        active={props.audioEnabled && mansionAmbienceAsset !== null}
        volume={props.audioVolume}
        mix={mansionAmbienceMix}
        lifecycleTransitionMs={WHODUNNIT_MANSION_AMBIENCE_FADE_MS}
        mixTransitionMs={WHODUNNIT_MANSION_AMBIENCE_TRANSITION_MS}
        backgroundRecordable={false}
        ambientFoley={false}
      />
      <SessionAtmosphereLayer
        sessionKey={`whodunnit-v2-investigation:${props.session.id}`}
        backgroundUrl={`/api/debates/${encodeURIComponent(props.session.id)}/mystery-mansion/theme`}
        backgroundFallbackUrl={WHODUNNIT_INVESTIGATION_MUSIC_URL}
        active={props.audioEnabled}
        volume={props.audioVolume}
        mix={mysteryInvestigationMusicMix({
          caseFileOpen,
          outside: visitingExterior,
          roomIntroductionActive,
          roomComplete,
          roomView: state.roomView,
        })}
        lifecycleTransitionMs={WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS}
        mixTransitionMs={WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS}
        backgroundRecordable={false}
        ambientFoley={false}
      />
      {identityPresentationBlackout}
      {!roomIntroductionActive ? <header className={styles.investigationHeader}>
        <button type="button" disabled={busy} onClick={props.onExit}>← Archive</button>
        <div><p className={styles.eyebrow}>{state.caseTitle}</p><strong>{spectatorTheory ? "Prosecutor Findings" : "Investigation"}</strong></div>
        <div className={styles.investigationHeaderActions}>
          <div className={styles.roomArtStyleToggle} role="group" aria-label="Upgraded room art" data-tutorial-target="mystery-v2-room-art-upgrade">
            <button
              type="button"
              aria-pressed={roomUpgradeEnabled}
              title={roomUpgradeEnabled
                ? `${roomArtUpgradeStatus?.readyRoomIds.length ?? 0} of ${state.rooms.length} room upgrades are ready. Rooms without one show their original Mosaic automatically.`
                : "Show each room's original Mosaic. Upgraded derivatives remain saved and instantly available."}
              onClick={() => selectRoomUpgradeEnabled(!roomUpgradeEnabled)}
            >Upgraded</button>
          </div>
          <button type="button" onClick={() => { setCaseFileOpen(true); setCaseFileUpdate(null); }} data-tutorial-target="mystery-v2-case-file">Case File <span>{caseFileEntryCount}</span></button>
        </div>
      </header> : null}
      {spectatorTheory ? (
        <section className={styles.partnerFindings} aria-labelledby="prosecutor-findings-title">
          <p className={styles.eyebrow}>Selected Prosecutor · automated</p>
          <h1 id="prosecutor-findings-title">Review the proposed conclusion</h1>
          <p>The selected Prosecutor investigated offstage. Only the authorized physical findings in the Case File are public; revise the editable theory, then file it when it reflects the case you want carried into court.</p>
        </section>
      ) : state.roomView === "mansion" ? (
        <section className={styles.mansionBoard} aria-label="Mystery Venue Move map" aria-busy={travelPresentation ? "true" : undefined} data-tutorial-target="mystery-v2-mansion">
          <header className={styles.mansionHeading}>
            <div><p className={styles.eyebrow}>Mystery Venue</p><strong>{mansionFloorDisplayName}</strong></div>
            {visualRetryAvailable || mansionCanBeSaved ? (
              <div className={styles.mansionAssetActions}>
                {visualRetryAvailable ? (
                  <button
                    type="button"
                    className={styles.retryMansionAssetsButton}
                    disabled={visualRetryState === "retrying" || visualRetryState === "queued"}
                    onClick={() => void retryFailedVisuals()}
                    data-state={visualRetryState}
                  >
                    {visualRetryState === "retrying"
                      ? "Retrying visuals…"
                      : visualRetryState === "queued"
                        ? "Visuals queued"
                        : visualRetryState === "failed"
                          ? "Retry visuals again"
                          : `Retry failed visual${failedVisualCount === 1 ? "" : "s"}`}
                  </button>
                ) : null}
                {mansionCanBeSaved ? (
                  <button
                    type="button"
                    className={styles.saveMansionButton}
                    disabled={mansionSaveState === "saving"}
                    onClick={() => void saveMansion()}
                    data-state={mansionSaveState}
                    data-tutorial-target="mystery-v2-save-mansion"
                  >
                    {mansionSaveState === "saving"
                      ? "Saving venue…"
                      : mansionSaveState === "saved"
                        ? "Venue saved"
                        : mansionSaveState === "failed"
                          ? "Retry save"
                          : "Save venue level"}
                  </button>
                ) : null}
              </div>
            ) : null}
            <nav className={styles.mansionFloorPicker} aria-label="Venue tiers">
              {mansionFloors.map((floor) => (
                <button
                  key={floor}
                  type="button"
                  aria-label={`Show ${venueTierLabel(floor)}`}
                  aria-pressed={mansionFloor === floor}
                  disabled={travelPresentation !== null}
                  data-deck-control={maritimeDeckMap ? "true" : undefined}
                  data-selected={mansionFloor === floor ? "true" : undefined}
                  title={venueTierLabel(floor)}
                  onClick={() => {
                    const room = state.rooms.find((candidate) => candidate.floor === floor);
                    setMansionFloor(floor);
                    if (room) setSelectedMansionRoomId(room.id);
                  }}
                >{maritimeDeckMap ? <><span>D{deckOrdinalForFloor(floor)}</span><small>{venueTierLabel(floor)}</small></> : floor}</button>
              ))}
            </nav>
          </header>
          <div className={styles.mansionViewport}>
            <button
              type="button"
              className={styles.mansionOutsideTravelTarget}
              data-selected={mansionOutsideSelected ? "true" : undefined}
              aria-label={`Select the exterior of the ${venuePlaceNoun}`}
              aria-pressed={mansionOutsideSelected}
              disabled={busy || travelPresentation !== null}
              onClick={() => setSelectedMansionRoomId(MYSTERY_MANSION_OUTSIDE_SELECTION_ID)}
            />
            <div className={styles.mansionCanvas} data-map-style={venueProfile?.presentation?.mapStyle}>
              {maritimeDeckMap && venueTierOutlinePoints ? (
                <>
                  <svg className={styles.venueHullOutline} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <polygon points={venueTierOutlinePoints} />
                  </svg>
                  <div className={styles.venueMapOrientation} aria-hidden="true">
                    <span data-edge="top">PORT</span>
                    <span data-edge="right">FORE / BOW</span>
                    <span data-edge="bottom">STARBOARD</span>
                    <span data-edge="left">AFT / STERN</span>
                    <strong>D{deckOrdinal} · {mansionFloorDisplayName}</strong>
                  </div>
                </>
              ) : null}
              {mansionAmbientSpaces.map((space) => (
                <i
                  key={space.id}
                  aria-hidden="true"
                  className={styles.mansionAmbientSpace}
                  data-pattern={space.pattern}
                  style={{
                    left: `${mansionX(space.x)}%`,
                    top: `${mansionY(space.y)}%`,
                    width: `${mansionWidth(space.width)}%`,
                    height: `${mansionHeight(space.height)}%`,
                  }}
                />
              ))}
              {mansionCorridors.map((placement) => (
                <i
                  key={placement.corridor.id}
                  className={styles.mansionCorridor}
                  aria-hidden="true"
                  style={{
                    left: `${mansionX(placement.x)}%`,
                    top: `${mansionY(placement.y)}%`,
                    width: `${mansionWidth(placement.width)}%`,
                    height: `${mansionHeight(placement.height)}%`,
                  }}
                />
              ))}
              {mansionDoors.map((door) => (
                <i
                  key={door.key}
                  className={styles.mansionDoor}
                  data-orientation={door.orientation}
                  aria-hidden="true"
                  style={{ left: `${mansionX(door.x)}%`, top: `${mansionY(door.y)}%` }}
                />
              ))}
              {connectorLandings.map(({ connector, point }) => (
                <i
                  key={`${connector.id}:${mansionFloor}`}
                  className={styles.venueConnectorLanding}
                  data-kind={connector.kind}
                  title={connector.label ?? connector.kind}
                  aria-label={`${connector.label ?? connector.kind} landing`}
                  style={{ left: `${mansionX(point.x)}%`, top: `${mansionY(point.y)}%` }}
                >{connector.kind === "lift" ? "⇅" : connector.kind === "stairs" ? "≋" : connector.kind === "ladder" ? "↕" : "◇"}</i>
              ))}
              {mansionPlacements.map((placement) => {
                const room = placement.room;
                const sealedRoomArtReady = room.sealedAsset?.revealed === true &&
                  room.sealedAsset.status === "ready";
                const roomMapArt = whodunnitDiscoveredMansionRoomArtV1({
                  discovered: room.visited,
                  upgradeEnabled: roomUpgradeEnabled,
                  illustratedReady: Boolean(
                    roomArtUpgradeStatus?.readyRoomIds.includes(room.id) &&
                      loadedUpgradeRoomIds.has(room.id) &&
                      !failedUpgradeRoomIds.has(room.id),
                  ),
                  sealedIllustratedUrl: sealedRoomArtReady
                    ? whodunnitSealedRoomArtUrl({
                        sessionId: props.session.id,
                        subjectId: whodunnitIllustratedRoomSubjectId(room.id),
                        style: "illustrated",
                      })
                    : null,
                  sealedMosaicUrl: sealedRoomArtReady
                    ? whodunnitSealedRoomArtUrl({
                        sessionId: props.session.id,
                        subjectId: room.id,
                        style: "mosaic",
                      })
                    : null,
                  imageId: room.imageId,
                  templateId: room.templateId,
                  bundledAssetPath: room.bundledAssetPath,
                });
                const roomSuspects = room.visited
                  ? state.suspects.filter((suspect) => suspect.roomId === room.id)
                  : [];
                const examinedHotspots = room.hotspots.filter((hotspot) => hotspot.examined).length;
                const verticalConnector = mansionLayout?.verticalConnectors.find((connector) =>
                  connector.lowerEntityId === room.id || connector.upperEntityId === room.id);
                const hasVerticalNeighbor = (room.neighborIds ?? []).some((id) =>
                  state.rooms.find((candidate) => candidate.id === id)?.floor !== room.floor);
                return (
                  <button
                    key={room.id}
                    type="button"
                    className={styles.mansionRoom}
                    disabled={busy}
                    data-discovered={room.visited ? "true" : undefined}
                    data-room-art={roomMapArt?.style}
                    data-current={room.id === currentRoom?.id ? "true" : undefined}
                    data-selected={room.id === mansionSelectedRoom?.id ? "true" : undefined}
                    data-visited={room.visited ? "true" : undefined}
                    data-searched={room.hotspots.length > 0 && examinedHotspots === room.hotspots.length ? "true" : undefined}
                    data-locked={!room.visited ? "true" : undefined}
                    aria-pressed={room.id === mansionSelectedRoom?.id}
                    aria-label={`${room.visited ? room.name : "Unknown room"}${room.sealedAsset?.status === "pending" ? ", being secured" : ""}${room.visited ? ", visited" : ""}${roomSuspects.length ? `, ${roomSuspects.map((suspect) => suspect.name).join(" and ")} known to be here` : ""}`}
                    onClick={() => setSelectedMansionRoomId(room.id)}
                    style={{
                      left: `${mansionX(placement.x)}%`,
                      top: `${mansionY(placement.y)}%`,
                      width: `${mansionWidth(placement.width)}%`,
                      height: `${mansionHeight(placement.height)}%`,
                      "--mansion-room-image": roomMapArt
                        ? `url("${roomMapArt.url}")`
                        : "none",
                    } as CSSProperties}
                  >
                    {room.visited ? <strong>{room.name}</strong> : null}
                    {roomSuspects.map((suspect) => {
                      const bot = presentMysteryBot(botById.get(suspect.botId) ?? null);
                      const position = mysteryMapOccupantPosition(props.session.id, room.id, suspect.seatId);
                      return (
                        <i
                          key={suspect.seatId}
                          className={styles.mansionOccupant}
                          role="img"
                          aria-label={`${bot?.name ?? suspect.name} is known to be here`}
                          data-tutorial-target="mystery-v2-micro-avatar"
                          style={{ left: `${position.xPct}%`, top: `${position.yPct}%`, color: suspect.color ?? "#a98cff" }}
                        >{props.renderBotGlyph(bot?.glyph ?? null, { size: 18, strokeWidth: 1.5, className: styles.mansionOccupantGlyph })}</i>
                      );
                    })}
                    {room.hotspots.length > 0 && examinedHotspots === room.hotspots.length ? <i className={styles.mansionRoomCompleteMark} aria-hidden="true">✓</i> : null}
                    {hasVerticalNeighbor ? <small>{verticalConnector?.label ?? (venueProfile ? "Connector" : "Stairs")}</small> : null}
                  </button>
                );
              })}
              {mansionPlayerPoint ? (
                <MysteryPlayerOrb
                  className={styles.mansionPlayerOrb}
                  color={playerCharacterColor}
                  glyph={playerCharacterGlyph}
                  label={`${playerCharacterName} in the ${venuePlaceNoun}`}
                  renderBotGlyph={props.renderBotGlyph}
                  style={{
                    left: `${mansionX(mansionPlayerPoint.x)}%`,
                    top: `${mansionY(mansionPlayerPoint.y)}%`,
                  }}
                />
              ) : null}
              {travelPresentation ? (
                <button
                  type="button"
                  className={styles.mansionTravelSkip}
                  onClick={() => finishMansionTravel(true)}
                  aria-label={`Traveling from ${travelPresentation.fromRoom.name} to ${travelPresentation.toRoom.name}. Activate to arrive now.`}
                >
                  <span role="status">Traveling to {travelPresentation.toRoom.name} · click, Enter, or Space to arrive now</span>
                </button>
              ) : null}
            </div>
          </div>
          {mansionOutsideSelected ? (
            <section className={styles.mansionRoomDetails} aria-live="polite" data-outside="true">
              <div>
                <small>Selected area</small>
                <strong>Exterior</strong>
                <span>Outside the {venuePlaceNoun}</span>
              </div>
              <button type="button" disabled={busy || travelPresentation !== null} onClick={() => setVisitingExterior(true)}>Go outside</button>
            </section>
          ) : mansionSelectedRoom ? (
            <section className={styles.mansionRoomDetails} aria-live="polite" data-locked={!mansionSelectedRoom.unlocked ? "true" : undefined}>
              <div>
                <small>Selected room</small>
                <strong>{mansionSelectedRoom.visited ? mansionSelectedRoom.name : "Unknown room"}</strong>
                <span>{mansionFloorDisplayName} · {mansionSelectedRoomPending ? "Being secured" : mansionSelectedRoom.unlocked ? (mansionSelectedRoom.visited ? "Visited" : "Not yet visited") : "Locked"}</span>
              </div>
              <dl>
                <div><dt>Known occupant</dt><dd>{mansionSelectedRoom.visited ? mansionSelectedSuspect?.name ?? "Unknown" : "Unknown"}</dd></div>
                <div><dt>Details reviewed</dt><dd>{mansionSelectedRoom.visited ? `${mansionSelectedRoom.hotspots.filter((hotspot) => hotspot.examined).length} / ${mansionSelectedRoom.hotspots.length}` : "Unknown"}</dd></div>
              </dl>
              {mansionSelectedRoomPending ? <p className={styles.securedRoomStatus} role="status" aria-live="polite">This room is still being prepared. Try again shortly.</p> : null}
              <button type="button" disabled={busy || !mansionSelectedRoom.unlocked || mansionSelectedRoomPending || !mansionSelectedRoomReachable} onClick={() => void beginMansionTravel(mansionSelectedRoom)}>
                {mansionSelectedRoomPending
                  ? "Being secured"
                  : !mansionSelectedRoom.unlocked
                    ? "Locked"
                    : !mansionSelectedRoomReachable
                      ? "Not adjacent"
                      : mansionSelectedRoom.visited && !mansionSelectedRoomAdjacent
                        ? `Teleport to ${mansionSelectedRoom.name}`
                        : mansionSelectedRoom.visited
                          ? `Enter ${mansionSelectedRoom.name}`
                          : "Enter room"}
              </button>
            </section>
          ) : null}
          <small className={styles.mansionHint}>Discover through connected doors. Teleport to any visited room.</small>
        </section>
      ) : currentRoom ? (
        <section
          className={styles.roomScene}
          style={roomSceneStyle}
          data-mystery-room-stage="true"
          data-art-style={currentRoomArtStyle}
          data-parallax-enabled={roomParallaxEnabled ? "true" : undefined}
          data-lens-active={lensActive ? "true" : undefined}
          data-room-introduction={roomIntroductionActive ? roomIntroductionPhase : undefined}
          onPointerMove={handleRoomPointerMove}
          onPointerLeave={handleRoomPointerLeave}
          onClick={handleRoomInvestigationClick}
        >
          {currentRoom.sealedAsset?.status === "pending" ? (
            <div className={styles.roomSecuring} role="status" aria-live="polite">
              <strong>This room is still being prepared.</strong>
              <span>Try again shortly.</span>
            </div>
          ) : null}
          {currentRoomMosaicUrl ? (
            <img
              className={styles.roomBackdropImage}
              data-art-style="mosaic"
              key={`${currentRoom.id}:mosaic`}
              src={currentRoomMosaicUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          ) : null}
          {roomUpgradeEnabled && currentRoomUpgradeAssetUrl ? (
            <img
              className={styles.roomBackdropImage}
              data-art-style="illustrated"
              data-upgrade-layer="true"
              data-loaded={currentRoomIllustratedUpgradeLoaded ? "true" : undefined}
              key={`${currentRoom.id}:upgrade`}
              src={currentRoomUpgradeAssetUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              onLoad={handleCurrentRoomUpgradeArtLoad}
              onError={handleCurrentRoomArtLoadError}
            />
          ) : null}
          <div className={styles.roomParallaxLayer}>
            <div
              className={styles.roomBackdrop}
              data-art-style={currentRoomArtStyle}
              data-blurred={roomActorVisible ? "true" : undefined}
            />
            <DebateMysteryRoomCinematographyLayer
              room={currentRoom}
              lights={currentRoomLights}
              templateLightingAligned={currentRoomUsesTemplateLightGeometry}
              blurred={roomActorVisible}
              reducedMotion={reducedMotion}
            />
            {command === "examine" && !roomComplete ? <div className={styles.hotspots} aria-label="Examination points">{currentRoomUnexaminedHotspots.map((hotspot) => <button key={hotspot.id} type="button" aria-label={`Examine ${hotspot.label}`} disabled={!lensActive} data-examining={examiningHotspotId === hotspot.id ? "true" : undefined} style={hotspotSpotStyle(hotspot.polygon)} onFocus={() => { const point = debateMysteryV2HotspotFocusPoint(hotspot.polygon); setInvestigationLens(resolveDebateMysteryV2Lens(point.x, point.y, currentRoom.hotspots)); }} onClick={(event) => { if (event.detail === 0) { event.stopPropagation(); const hotspotId = debateMysteryV2LensClickTarget(investigationLens); if (hotspotId) void examineHotspot(hotspotId); } }} />)}</div> : null}
          </div>
          <SceneMediaVignette theme={props.theme} style={{ "--scene-vignette-z": 2 } as CSSProperties} />
          {command === "examine" && !roomComplete && lensActive && currentRoomArtStyle === "mosaic" ? <div className={styles.mosaicLensGrid} style={mosaicLensGridStyle} aria-hidden="true">{[...mosaicIlluminatedCells].map((index) => {
            const column = index % DEBATE_MYSTERY_V2_MOSAIC_LENS_COLUMNS;
            const row = Math.floor(index / DEBATE_MYSTERY_V2_MOSAIC_LENS_COLUMNS);
            return <i key={index} style={{
              left: `${(column / DEBATE_MYSTERY_V2_MOSAIC_LENS_COLUMNS) * 100}%`,
              top: `${(row / DEBATE_MYSTERY_V2_MOSAIC_LENS_ROWS) * 100}%`,
              width: `${100 / DEBATE_MYSTERY_V2_MOSAIC_LENS_COLUMNS}%`,
              height: `${100 / DEBATE_MYSTERY_V2_MOSAIC_LENS_ROWS}%`,
            }} />;
          })}</div> : null}
          {command === "examine" && !roomComplete ? <i className={styles.investigationLens} aria-hidden="true" data-visible={lensActive ? "true" : undefined} data-targeted={targetedHotspotId ? "true" : undefined} data-art-style={currentRoomArtStyle} style={{ left: `${investigationLens.x}%`, top: `${investigationLens.y}%`, "--lens-proximity": investigationLens.proximity } as CSSProperties} /> : null}
          {roomIntroductionPhase !== "casekeeper" ? <div className={styles.roomShade} /> : null}
          {!roomIntroductionActive ? <div className={styles.roomTitle}><small>{venueTierLabel(currentRoom.floor)}</small><h1>{currentRoom.name}</h1>{currentRoomMosaicAssetUrl && currentRoom.sealedAsset && currentRoomAssetKey ? <button type="button" className={styles.saveSealedAssetButton} disabled={sealedAssetSaveState[currentRoomAssetKey] === "saving" || sealedAssetSaveState[currentRoomAssetKey] === "saved"} onClick={(event) => { event.stopPropagation(); void saveSealedAsset(currentRoom.sealedAsset!, currentRoom.id, `${currentRoom.name} · Whodunnit room`); }}>{sealedAssetSaveState[currentRoomAssetKey] === "saving" ? "Saving…" : sealedAssetSaveState[currentRoomAssetKey] === "saved" ? "Saved to Images" : sealedAssetSaveState[currentRoomAssetKey] === "failed" ? "Retry save" : "Save room image"}</button> : null}</div> : null}
          {roomActorVisible && currentBot ? <div className={styles.roomActor} data-art-style={currentRoomArtStyle} data-interrogation-phase={interrogationPhase ?? undefined} style={{ "--actor-color": currentBot.color ?? "#a98cff" } as CSSProperties}><div className={styles.roomActorDrift} style={mysteryRoomActorDriftStyle(`${props.session.id}:${currentBot.id}:suspect`)}>{props.renderMysteryBotAvatar(currentBot, investigationAvatarPresentation, { demeanor: "suspect", talking: audioMouthActive && roomDisplayedDialogue?.speakerSeatId === currentSuspect?.seatId, speechTiming: audioMouthActive && roomDisplayedDialogue?.speakerSeatId === currentSuspect?.seatId ? speechTiming : null, blinkEnabled: true, facing: "left", speechInkVisible: roomSpeechInkVisible })}<strong>{currentBot.name}</strong>{roomSuspectStageActionText && roomActionPresentation ? <SignalVoiceActionText key={`suspect:${roomDisplayedDialogue?.nodeId ?? ""}:${roomDisplayedDialogue?.occurredAt ?? ""}`} {...roomActionPresentation} accent={currentBot.color} /> : null}</div></div> : null}
          {roomProsecutorActive && prosecutorBot ? <aside className={`${styles.roomActor} ${styles.roomProsecutorActor}`} data-art-style={currentRoomArtStyle} data-prosecutor-speaking="true" data-interrogation-phase={interrogationPhase ?? undefined} style={{ "--actor-color": prosecutorBot.color ?? "#72d7ff" } as CSSProperties}>
            <div className={styles.roomActorDrift} style={mysteryRoomActorDriftStyle(`${props.session.id}:${prosecutorBot.id}:prosecutor`)}>
              {roomProsecutorStageActionText && roomActionPresentation ? <SignalVoiceActionText key={`room-prosecutor:${roomDisplayedDialogue?.nodeId ?? ""}:${roomDisplayedDialogue?.occurredAt ?? ""}`} {...roomActionPresentation} accent={prosecutorBot.color} /> : null}
              {props.renderMysteryBotAvatar(prosecutorBot, investigationAvatarPresentation, { demeanor: "partner", talking: audioMouthActive && !heldDialogue, speechTiming: audioMouthActive && !heldDialogue ? speechTiming : null, blinkEnabled: true, facing: "right", speechInkVisible: roomSpeechInkVisible })}
              <strong>{prosecutorBot.name} · Prosecutor</strong>
            </div>
          </aside> : null}
          {roomDisplayedDialogue ? (
            <div
              key={roomDialoguePresentationKey ?? roomDisplayedDialogue.nodeId}
              className={styles.dialogueBox}
              data-speaker={roomDialogueSpeakerKind}
              data-casekeeper-stage={roomIntroductionAwaitingContinue
                ? roomCasekeeperNarrationVisible ? "narration" : "beat"
                : undefined}
              data-examination={roomDialogueIsTextOnly ? "true" : undefined}
              data-awaiting-continue={roomObservationAwaitingContinue || roomIntroductionActive ? "true" : undefined}
              style={roomDialogueAccentStyle}
              role="button"
              tabIndex={0}
              aria-live="polite"
              aria-busy={roomIntroductionAwaitingContinue && roomCasekeeperNarrationVisible && busy}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  operateVisibleDialogueGesture(1, advanceVisibleRoomDialogue);
                }
              }}
            >
              {roomIntroductionAwaitingContinue ? null : (
                <small>
                  {roomPlayerObservationActive
                    ? (
                        <span className={styles.dialogueSpeakerSignature}>
                          <i aria-hidden="true">
                            {props.renderBotGlyph(playerCharacterGlyph ?? null, {
                              size: 14,
                              strokeWidth: 1.65,
                            })}
                          </i>
                          <span>{playerCharacterName}</span>
                        </span>
                      )
                    : roomPersonaDialogueActive && roomDialoguePersonaName
                      ? (
                          <span className={styles.dialogueSpeakerSignature}>
                            <i aria-hidden="true">
                              {props.renderBotGlyph(roomDialoguePersonaGlyph, {
                                size: 14,
                                strokeWidth: 1.65,
                              })}
                            </i>
                            <span>{roomDialoguePersonaName}</span>
                          </span>
                        )
                      : roomDialogueBot
                        ? `${roomDialogueBot.name}${roomProsecutorActive ? " · Prosecutor" : ""}`
                        : "Observation"}
                </small>
              )}
              <p>
                {roomIntroductionAwaitingContinue && !roomCasekeeperNarrationVisible
                  ? (
                      <span className={styles.casekeeperThinkingDots} aria-label="Taking in the room">
                        <span aria-hidden="true">...</span>
                      </span>
                    )
                  : revealedSpeechText(
                      whodunnitCaptionSpeechText(roomDialogueDelivery.spokenText),
                      captionSpeechTiming,
                    )}
              </p>
              {roomObservationAwaitingContinue || roomIntroductionActive
                ? (
                    <span className={styles.dialogueContinueHint} role="status">
                      {busy && roomIntroductionAwaitingContinue && roomCasekeeperNarrationVisible
                        ? "Bringing the occupant forward…"
                        : "Click to continue"}
                    </span>
                  )
                : null}
            </div>
          ) : null}
          {completionCueVisible ? <div className={styles.roomComplete} role="status" aria-live="polite"><p>Every detail has entered the record.</p><strong>{currentRoom.name} complete</strong></div> : null}
        </section>
      ) : null}
      {!spectatorTheory && !roomIntroductionActive ? <nav className={styles.investigationCommands} aria-label="Investigation commands" data-console-label="Case desk · field commands">
        <button type="button" data-command="move" data-active={state.roomView === "mansion" ? "true" : undefined} aria-pressed={state.roomView === "mansion"} disabled={busy || dialoguePerformanceActive} onClick={() => { playControlSfx("navigate"); setCommand("move"); void sendAction({ action: "move" }); }} data-tutorial-target="mystery-v2-move"><span>⌂</span>Move</button>
        <button type="button" data-command="examine" data-active={command === "examine" ? "true" : undefined} aria-pressed={command === "examine"} disabled={busy || dialoguePerformanceActive || state.roomView !== "room"} onClick={() => { playControlSfx("clip"); setCommand("examine"); }} data-tutorial-target="mystery-v2-examine"><span>⌕</span>Examine</button>
        <button type="button" data-command="talk" data-active={command === "talk" ? "true" : undefined} aria-pressed={command === "talk"} disabled={busy || dialoguePerformanceActive || !currentSuspect} onClick={() => { playControlSfx("enter"); setCommand("talk"); }} data-tutorial-target="mystery-v2-talk"><span>“”</span>Talk</button>
        <button type="button" data-command="present" data-active={command === "present" ? "true" : undefined} aria-pressed={command === "present"} disabled={busy || dialoguePerformanceActive || !currentSuspect || admittedRecord.length === 0} onClick={() => { playControlSfx("paper"); setCommand("present"); }} data-tutorial-target="mystery-v2-present"><span>◇</span>Present</button>
      </nav> : null}
      {!spectatorTheory && !roomIntroductionActive && command === "talk" && currentSuspect && !dialoguePerformanceActive ? <div className={styles.choiceTray}><header><div><p className={styles.eyebrow}>Talk</p><h2>{currentSuspect.name}</h2></div><button type="button" onClick={() => setCommand(null)}>Close</button></header><p className={styles.topicHelp}>Ask about people, motives, alibis, or rooms. Evidence and testimony stay in Present.</p><div className={styles.topicGroups}>{groupDebateMysteryTalkTopicsV2(state.topics.filter((topic) => topic.suspectSeatId === currentSuspect.seatId)).map((group) => <section key={group.category} className={styles.topicGroup} aria-labelledby={`talk-${currentSuspect.seatId}-${group.category}`}><h3 id={`talk-${currentSuspect.seatId}-${group.category}`}>{group.label}</h3><div className={styles.topicList}>{group.topics.map((topic) => <button key={topic.nodeId} type="button" disabled={busy || dialoguePerformanceActive || !topic.unlocked} data-complete={topic.completed ? "true" : undefined} data-blocked={!topic.unlocked ? "true" : undefined} onClick={() => void sendAction({ action: "talk", suspectSeatId: currentSuspect.seatId, topicNodeId: topic.nodeId })}><span className={styles.topicIcon} aria-hidden="true">{topic.completed ? "✓" : topic.unlocked ? "?" : "×"}</span><span className={styles.topicCopy}><strong>{debateMysteryTalkTopicDisplayLabelV2(topic, state.rooms)}</strong>{!topic.unlocked ? <small>Blocked</small> : null}</span></button>)}</div></section>)}</div></div> : null}
      {!spectatorTheory && !roomIntroductionActive && command === "present" && currentSuspect ? <div className={styles.choiceTray}><header><div><p className={styles.eyebrow}>Present</p><h2>Show {currentSuspect.name}</h2></div><button type="button" onClick={() => setCommand(null)}>Close</button></header>{renderRecordButtons((record) => void sendAction({ action: "present_to_suspect", suspectSeatId: currentSuspect.seatId, record }))}</div> : null}
      {!spectatorTheory && !roomIntroductionActive && state.theoryAvailable ? <button type="button" className={styles.fileChargesButton} onClick={() => { playControlSfx("theory"); setTheoryOpen(true); }} data-tutorial-target="mystery-v2-file-theory">File Charges</button> : !spectatorTheory && !roomIntroductionActive ? <small className={styles.theoryHint}>The Theory Board opens after the briefing, one interview, and one admitted record item.</small> : null}
      {caseFileUpdate ? <CaseFileUpdateNotice update={caseFileUpdate} onView={() => { setCaseFileOpen(true); setCaseFileUpdate(null); }} onDismiss={() => setCaseFileUpdate(null)} /> : null}
      {caseFileOpen ? <CaseFile state={state} playerName={playerCharacterName} playerBot={prosecutorBot} playerColor={playerCharacterColor} playerGlyph={playerCharacterGlyph ?? null} renderBotGlyph={props.renderBotGlyph} renderMysteryBotAvatar={props.renderMysteryBotAvatar} objectUrls={sealedAssetObjectUrls} saveState={sealedAssetSaveState} onSaveAsset={saveSealedAsset} onClose={() => setCaseFileOpen(false)} /> : null}
      {theoryOpen || spectatorTheory ? (
        <div className={styles.theoryBoard} role="dialog" aria-modal="true" aria-labelledby="theory-v2-title">
          <header>
            <div>
              <p className={styles.eyebrow}>{spectatorTheory ? "Prosecutor research · editable" : "Theory Board"}</p>
              <h2 id="theory-v2-title">{spectatorTheory ? "Review the Prosecutor conclusion" : "File the prosecution's case"}</h2>
            </div>
            {spectatorTheory ? null : <button type="button" onClick={() => setTheoryOpen(false)}>Close</button>}
          </header>
          {state.caseCharge ? (
            <section className={styles.caseCharge} aria-label="Charge">
              <small>Charge · {state.caseCharge.title}</small>
              <strong>{state.caseCharge.accusationPrompt}</strong>
            </section>
          ) : null}
          {spectatorTheory ? <p>The selected Prosecutor&apos;s conclusion is a public hypothesis built from the admitted physical findings. You may revise every field before filing it.</p> : null}
          <fieldset>
            <legend>Accused · choose one or two</legend>
            {state.suspects.map((suspect) => {
              const selected = theoryAccusedSeatIds.includes(suspect.seatId);
              return (
                <label key={suspect.seatId}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!selected && theoryAccusedSeatIds.length >= 2}
                    onChange={(event) => setTheory((current) => {
                      const currentAccused = debateMysteryTheoryAccusedSeatIdsV2(current);
                      const nextAccused = event.target.checked
                        ? [...currentAccused, suspect.seatId].slice(0, 2)
                        : currentAccused.filter((seatId) => seatId !== suspect.seatId);
                      return debateMysteryTheoryWithAccusedSeatIdsV2(current, nextAccused);
                    })}
                  />
                  {suspect.name}
                </label>
              );
            })}
          </fieldset>
          <label>Method<textarea value={theory.method} onChange={(event) => setTheory((current) => ({ ...current, method: event.target.value }))} placeholder="How was the incident carried out?" /></label>
          <label>Motive<textarea value={theory.motive} onChange={(event) => setTheory((current) => ({ ...current, motive: event.target.value }))} placeholder="Why was each accused responsible?" /></label>
          <label>Opportunity<textarea value={theory.opportunity} onChange={(event) => setTheory((current) => ({ ...current, opportunity: event.target.value }))} placeholder="When and where did each accused have the opportunity?" /></label>
          <fieldset>
            <legend>Evidence to admit</legend>
            {admittedRecord.filter((item) => item.reference.kind === "evidence").map((item) => (
              <label key={item.reference.id}>
                <input type="checkbox" checked={theory.evidenceIds.includes(item.reference.id)} onChange={(event) => setTheory((current) => ({ ...current, evidenceIds: event.target.checked ? [...current.evidenceIds, item.reference.id] : current.evidenceIds.filter((id) => id !== item.reference.id) }))} />
                {item.emoji} {item.title}
              </label>
            ))}
          </fieldset>
          <p>Incomplete method, motive, or opportunity will weaken the case, but will not block trial.</p>
          <button type="button" className={styles.primaryAction} disabled={busy || theoryAccusedSeatIds.length === 0} onClick={() => { if (!spectatorTheory) setTheoryOpen(false); void sendAction({ action: "file_theory", theory }); }}>{spectatorTheory ? "File conclusion and watch court" : "File charges and open court"}</button>
        </div>
      ) : null}
      {callout ? <div key={callout.id} className={styles.callout} style={calloutStyle} role="status" aria-live="assertive"><span>{CALLOUT_COPY[callout.callout]}</span></div> : null}
      {error ? (
        <WhodunnitChromeErrorNotice
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}
    </main>
  );
}

function CaseFileUpdateNotice(props: {
  update: DebateMysteryCaseFileUpdateV2;
  onView: () => void;
  onDismiss: () => void;
}): React.JSX.Element {
  const label = props.update.kind === "case_kit"
    ? "Item acquired"
    : props.update.kind === "record"
      ? "Added to Case File"
      : "Observation logged";
  const title = props.update.kind === "observation"
    ? props.update.observation.roomName
    : props.update.item.title;
  const description = props.update.kind === "observation"
    ? props.update.observation.text
    : props.update.item.description;
  return (
    <aside className={styles.acquisitionNotice} role="status" aria-live="assertive">
      <span aria-hidden="true">{props.update.kind === "case_kit" ? props.update.item.emoji : "✦"}</span>
      <div><small>{label}</small><strong>{title}</strong><p>{description}</p></div>
      <button type="button" onClick={props.onView}>View Case File</button>
      <button type="button" aria-label="Dismiss Case File update" onClick={props.onDismiss}>×</button>
    </aside>
  );
}

function CaseFile(props: {
  state: DebateWhodunnitFormatStateV2;
  playerName: string;
  playerBot: MysteryBotSummary | null;
  playerColor: string;
  playerGlyph: string | null;
  renderBotGlyph: BotPickerGlyphRenderer;
  renderMysteryBotAvatar: V2SharedProps["renderMysteryBotAvatar"];
  objectUrls: Readonly<Record<string, string>>;
  saveState: Record<string, "saving" | "saved" | "failed">;
  onSaveAsset: (
    asset: DebateMysterySealedAssetRefV1,
    subjectId: string,
    title: string,
  ) => Promise<void>;
  onClose: () => void;
}): React.JSX.Element {
  const observations = debateMysteryCaseFileObservationsV2({
    dialogueHistory: props.state.dialogueHistory,
    rooms: props.state.rooms,
  });
  const metWitnesses = props.state.suspects.filter((suspect) =>
    props.state.metSuspectSeatIds.includes(suspect.seatId));
  return (
    <>
      <div className={styles.caseFileBackdrop} aria-hidden="true" />
      <aside className={styles.caseFile} role="dialog" aria-modal="true" aria-labelledby="mystery-v2-case-file-title">
        <header><div><p className={styles.eyebrow}>Prosecution record</p><h2 id="mystery-v2-case-file-title">Case File</h2></div><button type="button" onClick={props.onClose}>Close</button></header>
        <div className={styles.caseFileLayout}>
          <section className={styles.caseFileInvestigator} aria-label={`${props.playerName}, Investigator`} style={{ "--case-file-investigator-color": props.playerColor } as CSSProperties}>
            <div className={styles.caseFileInvestigatorAvatar} aria-hidden="true">
              {props.playerBot
                ? props.renderMysteryBotAvatar(props.playerBot, "full", { demeanor: "partner", blinkEnabled: true, facing: "right" })
                : props.renderBotGlyph(props.playerGlyph, { size: 48, strokeWidth: 1.5 })}
            </div>
            <div><small>Investigator</small><strong>{props.playerName}</strong></div>
          </section>
          <div className={styles.caseFileContents}>
            <section>
              <h3>Case Kit</h3>
              {(props.state.caseKit ?? []).map((item) => (
                <article key={item.id}>
                  <span aria-hidden="true">{item.emoji}</span>
                  <div><strong>{item.title}</strong><small>{item.kind} · acquired by {props.playerName}</small><p>{item.description}</p></div>
                </article>
              ))}
              {(props.state.caseKit ?? []).length === 0 ? <p className={styles.caseFileEmpty}>No access items recovered yet.</p> : null}
            </section>
            <section className={styles.caseFileObservationSection}>
              <h3>Observation Log</h3>
              <div className={styles.caseFileObservationEntries} tabIndex={0} aria-label="Case-relevant observations">
                {observations.map((observation) => (
                  <article key={observation.id}>
                    <span aria-hidden="true">✦</span>
                    <div><strong>{observation.roomName}</strong><small>{props.playerName} · personal observation</small><p>{observation.text}</p></div>
                  </article>
                ))}
                {observations.length === 0 ? <p className={styles.caseFileEmpty}>No case-relevant room observations recorded yet.</p> : null}
              </div>
            </section>
            <section>
              <h3>Evidence &amp; sworn testimony</h3>
              {props.state.record.filter((item) => item.admitted).map((item) => {
          const assetKey = item.reference.kind === "evidence"
            ? sealedMysteryAssetKey("evidence", item.reference.id)
            : null;
          const assetUrl = item.reference.kind === "evidence"
            ? sealedMysteryAssetObjectUrl(
                props.objectUrls,
                "evidence",
                item.reference.id,
                item.sealedAsset,
              )
            : null;
          const assetSaveState = assetKey
            ? props.saveState[assetKey]
            : undefined;
                return (
                  <article key={recordKey(item.reference)}>
                    {assetUrl
                      ? <>
                          {/* A short-lived object URL keeps authenticated bytes out of durable browser storage. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img className={styles.caseFileAssetImage} src={assetUrl} alt={`${item.title} evidence`} />
                        </>
                      : <span aria-hidden="true">{item.emoji}</span>}
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.reference.kind}</small>
                      <p>{item.description}</p>
                      {assetUrl && item.sealedAsset ? (
                        <button
                          type="button"
                          className={styles.saveSealedAssetButton}
                          disabled={assetSaveState === "saving" || assetSaveState === "saved"}
                          onClick={() => void props.onSaveAsset(item.sealedAsset!, item.reference.id, `${item.title} · Whodunnit evidence`)}
                        >
                          {assetSaveState === "saving"
                            ? "Saving…"
                            : assetSaveState === "saved"
                              ? "Saved to Images"
                              : assetSaveState === "failed"
                                ? "Retry save"
                                : "Save evidence image"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </section>
            <section>
              <h3>Witnesses</h3>
              {metWitnesses.map((suspect) => (
                <article key={suspect.seatId}>
                  <span aria-hidden="true" style={{ color: suspect.color ?? undefined }}>●</span>
                  <div><strong>{suspect.name}</strong><small>Met</small></div>
                </article>
              ))}
              {metWitnesses.length === 0
                ? <p className={styles.caseFileEmpty}>No witnesses met yet.</p>
                : null}
            </section>
            <small>{props.state.voicesEnabled ? "Local English performance ready · spoken lines cache on demand" : "Playing as a validated text case"}</small>
          </div>
        </div>
      </aside>
    </>
  );
}
