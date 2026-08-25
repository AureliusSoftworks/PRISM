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
  splitDebateMysteryStageActionTextV2,
  type DebateMysteryActionRequestV2,
  type DebateMysteryCompilationStageV2,
  type DebateMysteryPublicDialogueEntryV2,
  type DebateMysteryRecordReferenceV2,
  type DebateMysteryRoomV2,
  type DebateMysteryTheoryV1,
  type DebateSessionV1,
  type DebateWhodunnitFormatStateV2,
} from "@localai/shared";
import { SessionAtmosphereLayer } from "./SessionAtmosphereLayer";
import {
  WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS,
  WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS,
  WHODUNNIT_INVESTIGATION_MUSIC_URL,
  mysteryInvestigationMusicMix,
} from "./debateMysteryMusic";
import { playDebateMysterySfx } from "./debateMysterySfx";
import { mysteryMapOccupantPosition } from "./debateMysteryRoomWalk";
import { routeAudioElementToPrismOutput } from "./replayAudioMasterCapture";
import type { VoicePlaybackCharacterAlignment } from "./voiceEffects";
import type { MysteryBotSummary } from "./DebateMysteryExperience";
import type { BotPickerGlyphRenderer } from "./BotPicker";
import styles from "./debateMysteryV2.module.css";

interface V2SharedProps {
  bots: MysteryBotSummary[];
  theme: "light" | "dark";
  audioEnabled: boolean;
  audioVolume: number;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  renderBotGlyph: BotPickerGlyphRenderer;
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
    },
  ) => ReactNode;
}

interface V2SpeechTiming {
  text: string;
  elapsedMs: number;
  durationMs: number;
  alignment: VoicePlaybackCharacterAlignment | null;
}

interface V2ExperienceProps extends V2SharedProps {
  session: DebateSessionV1;
  onSessionChange: (session: DebateSessionV1) => void;
  onExit: () => void;
}

type V2ReviewCopyState = "idle" | "copying" | "copied" | "failed";

interface V2PlayProps extends V2ExperienceProps {
  transcriptCopyState: V2ReviewCopyState;
  reviewCopyState: V2ReviewCopyState;
  onCopyVerboseTranscript: () => Promise<void>;
  onCopyAllReviewData: () => Promise<void>;
}

type V2ClientAction<T = DebateMysteryActionRequestV2> = T extends unknown
  ? Omit<T, "version" | "expectedRevision" | "idempotencyKey">
  : never;

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

function recordKey(reference: DebateMysteryRecordReferenceV2): string {
  return `${reference.kind}:${reference.id}`;
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
  if (polygon.length === 0) return { left: "50%", top: "50%" };
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {
    left: `${Math.max(4, Math.min(96, centerX))}%`,
    top: `${Math.max(8, Math.min(90, centerY))}%`,
  };
}

function revealedSpeechText(text: string, timing: V2SpeechTiming | null): string {
  if (!timing || timing.text !== text) return text;
  const ratio = timing.durationMs > 0 ? Math.max(0, Math.min(1, timing.elapsedMs / timing.durationMs)) : 1;
  return text.slice(0, Math.ceil(text.length * ratio));
}

const AUDIO_OFF_REVEAL_MS_PER_CHARACTER = 34;

function emptyTheory(state: DebateWhodunnitFormatStateV2): DebateMysteryTheoryV1 {
  return state.theory ?? {
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
  const sessionId = props.session.id;
  const request = props.request;
  const onSessionChange = props.onSessionChange;

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const refresh = async (): Promise<void> => {
      try {
        const result = await request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(sessionId)}?perspective=live`,
        );
        if (cancelled) return;
        onSessionChange(result.session);
        const next = result.session.formatState;
        if (
          next.format === "whodunnit" &&
          next.version === 2 &&
          next.compilation.stage !== "complete" &&
          next.compilation.stage !== "needs_attention" &&
          next.compilation.stage !== "cancelled"
        ) {
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
    if (
      state.compilation.stage !== "complete" &&
      state.compilation.stage !== "needs_attention" &&
      state.compilation.stage !== "cancelled"
    ) {
      void request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(sessionId)}/mystery-resume-compilation`,
        mutationBody({}),
      ).then((result) => {
        if (!cancelled) onSessionChange(result.session);
      }).catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Case Forge could not resume.");
      });
    }
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  // A nonce deliberately restarts the durable resume loop after a player retry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSessionChange, request, resumeNonce, sessionId]);

  const needsAttention = state.compilation.stage === "needs_attention";
  const currentIndex = state.compilation.stage === "complete"
    ? FORGE_STAGES.length - 1
    : needsAttention
      ? Math.min(state.compilation.completedPasses, FORGE_STAGES.length - 1)
      : Math.max(0, FORGE_STAGES.findIndex((entry) => entry.id === state.compilation.stage));
  const percent = Math.round(
    Math.max(
      currentIndex / (FORGE_STAGES.length - 1),
      state.compilation.totalPasses > 0
        ? state.compilation.completedPasses / state.compilation.totalPasses
        : 0,
    ) * 100,
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

  return (
    <main className={styles.forge} data-theme={props.theme} data-tutorial-target="mystery-v2-case-forge">
      <button type="button" className={styles.archiveButton} onClick={props.onExit}>← Archive</button>
      <section className={styles.forgeCard} aria-live="polite">
        <div className={styles.forgePrism} aria-hidden="true"><i /><i /><i /></div>
        <p className={styles.eyebrow}>PRISM / Case Forge</p>
        <h1>{needsAttention ? "Case preparation stopped" : "Preparing a prosecution turnabout"}</h1>
        <p className={styles.forgeMessage}>{state.compilation.spoilerSafeMessage}</p>
        {needsAttention ? (
          <p className={styles.forgeRecovery}>
            The Forge is not still running. Your setup and every completed draft section are safe. Retry will resume from the last durable checkpoint.
          </p>
        ) : null}
        <div className={styles.progressTrack} aria-label={`Case preparation ${percent}% complete`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <ol className={styles.forgeStages}>
          {FORGE_STAGES.map((entry, index) => (
            <li key={entry.id} data-state={index < currentIndex ? "complete" : index === currentIndex ? (needsAttention ? "error" : "active") : "waiting"}>
              <span aria-hidden="true">{index < currentIndex ? "✓" : index === currentIndex && needsAttention ? "!" : index + 1}</span>
              <strong>{entry.label}</strong>
            </li>
          ))}
        </ol>
        <div className={styles.localVoiceNotice}>
          <span aria-hidden="true">◈</span>
          <div><strong>Local English performance</strong><small>Premium voices are unavailable in Whodunnit V2. No ElevenLabs request will be made.</small></div>
        </div>
        {state.compilation.requiredAudioCount > 0 ? (
          <small>{state.compilation.preparedAudioCount} / {state.compilation.requiredAudioCount} unique recordings verified</small>
        ) : null}
        {needsAttention ? (
          <div className={styles.forgeActions}>
            <button type="button" onClick={() => void retry()} disabled={busy || !state.compilation.retryable}>Retry preparation</button>
            {state.localAudioFailure ? <button type="button" onClick={() => void continueSilently()} disabled={busy}>Continue without voices</button> : null}
            <button type="button" onClick={props.onExit}>Return to setup</button>
          </div>
        ) : null}
        {needsAttention ? <small>Preparation attempt {state.compilation.attempt} · stopped safely</small> : null}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState<"move" | "examine" | "talk" | "present" | null>(null);
  const [caseFileOpen, setCaseFileOpen] = useState(false);
  const [theoryOpen, setTheoryOpen] = useState(state.playPhase === "theory");
  const [theory, setTheory] = useState<DebateMysteryTheoryV1>(() => emptyTheory(state));
  const [dialoguePlaybackQueue, setDialoguePlaybackQueue] = useState<DebateMysteryPublicDialogueEntryV2[]>([]);
  const [dialoguePlaybackIndex, setDialoguePlaybackIndex] = useState(0);
  const [speechTiming, setSpeechTiming] = useState<V2SpeechTiming | null>(null);
  const [heldDialogue, setHeldDialogue] = useState<DebateMysteryPublicDialogueEntryV2 | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [roomParallax, setRoomParallax] = useState({ x: 0, y: 0 });
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const roomContextKey = state.roomView === "room" ? state.currentRoomId : null;
  const [roomDialogueBaseline, setRoomDialogueBaseline] = useState(() => ({
    contextKey: roomContextKey,
    historyCount: state.dialogueHistory.length,
  }));
  const [completedSpectatorBeat, setCompletedSpectatorBeat] = useState<string | null>(null);
  const mutationIndexRef = useRef(0);
  const lastPlayedPerformanceKeyRef = useRef<string | null>(null);
  const lastCalloutIdRef = useRef<string | null>(null);
  const currentRoom = state.rooms.find((room) => room.id === state.currentRoomId) ?? null;
  const mansionFloors = useMemo(
    () => [...new Set(state.rooms.map((room) => room.floor))].sort((left, right) => right - left),
    [state.rooms],
  );
  const [mansionFloor, setMansionFloor] = useState(() => currentRoom?.floor ?? mansionFloors.at(-1) ?? 1);
  const [selectedMansionRoomId, setSelectedMansionRoomId] = useState(() => currentRoom?.id ?? state.rooms[0]?.id ?? "");
  const currentSuspect = state.suspects.find((suspect) => suspect.roomId === currentRoom?.id) ?? null;
  const currentBot = botForSeat(props, state, currentSuspect?.seatId);
  const roomActorVisible = Boolean(currentBot && command !== "examine");
  const lastDialogue = state.dialogueHistory.at(-1) ?? null;
  const queuedDialogue = dialoguePlaybackQueue[dialoguePlaybackIndex] ?? null;
  const displayedDialogue = queuedDialogue ?? heldDialogue ?? lastDialogue;
  const dialogueBot = botForDialogue(props, state, displayedDialogue);
  const roomDisplayedDialogue = queuedDialogue ?? heldDialogue ?? (
    roomDialogueBaseline.contextKey === roomContextKey &&
    state.dialogueHistory.length > roomDialogueBaseline.historyCount
      ? lastDialogue
      : null
  );
  const roomDialogueBot = botForDialogue(props, state, roomDisplayedDialogue);
  const roomProsecutorActive = roomDisplayedDialogue?.speakerBotId === state.config.prosecutorBotId;
  const roomDialogueDelivery = roomDisplayedDialogue
    ? splitDebateMysteryStageActionTextV2(roomDisplayedDialogue.visibleText, roomDialogueBot?.name ?? null)
    : { stageActionText: null, spokenText: "" };
  const roomStageActionText = roomDisplayedDialogue?.stageActionText ?? roomDialogueDelivery.stageActionText;
  const roomSuspectStageActionText = roomDisplayedDialogue?.speakerSeatId === currentSuspect?.seatId
    ? roomStageActionText
    : null;
  const roomProsecutorStageActionText = roomProsecutorActive ? roomStageActionText : null;
  const dialoguePerformanceActive = queuedDialogue !== null;
  const admittedRecord = state.record.filter((item) => item.admitted);
  const activeStatement = state.court?.statements.find(
    (statement) => statement.statementId === state.court?.activeStatementId,
  ) ?? state.court?.statements[0] ?? null;
  const activeStatementIndex = activeStatement
    ? state.court?.statements.findIndex((entry) => entry.statementId === activeStatement.statementId) ?? -1
    : -1;
  const witnessSeatId = activeStatement?.witnessSeatId ?? null;
  const witness = state.suspects.find((entry) => entry.seatId === witnessSeatId) ?? null;
  const witnessBot = botForSeat(props, state, witnessSeatId);
  const displayedDialogueDelivery = displayedDialogue
    ? splitDebateMysteryStageActionTextV2(displayedDialogue.visibleText, dialogueBot?.name ?? null)
    : { stageActionText: null, spokenText: "" };
  const activeStatementDelivery = activeStatement
    ? splitDebateMysteryStageActionTextV2(activeStatement.visibleText, witness?.name ?? null)
    : { stageActionText: null, spokenText: "" };
  const activeStatementStageActionText = activeStatement?.stageActionText ?? activeStatementDelivery.stageActionText;
  const courtWitnessStageActionText = displayedDialogue?.speakerSeatId === witnessSeatId
    ? displayedDialogue.stageActionText ?? displayedDialogueDelivery.stageActionText
    : displayedDialogue && displayedDialogue.lineId !== activeStatement?.lineId
      ? null
      : activeStatementStageActionText;
  const botById = useMemo(() => new Map(props.bots.map((bot) => [bot.id, bot])), [props.bots]);
  const prosecutorBot = botById.get(state.config.prosecutorBotId) ?? null;
  const defenseBot = botById.get(state.config.rivalDefenseBotId) ?? null;
  const defendant = state.suspects.find((entry) => entry.seatId === state.court?.defendantSeatId) ?? null;
  const defendantBot = defendant ? botById.get(defendant.botId) ?? null : null;
  const defendantMiniVisible = Boolean(defendant && defendantBot && defendant.seatId !== witnessSeatId);
  const dialogueStageActionText = displayedDialogue?.stageActionText ?? displayedDialogueDelivery.stageActionText;
  const prosecutorDialogueActive = displayedDialogue?.speakerBotId === state.config.prosecutorBotId;
  const defenseDialogueActive = displayedDialogue?.speakerBotId === state.config.rivalDefenseBotId;
  const defendantDialogueActive = Boolean(
    defendant && displayedDialogue?.speakerSeatId === defendant.seatId,
  );
  const spectator = state.config.playerRole === "spectator";
  const spectatorTheory = spectator && state.playPhase === "theory";
  const playbackLineId = displayedDialogue?.lineId ?? (
    state.playPhase === "trial" ? activeStatement?.lineId ?? null : null
  );
  const playbackText = displayedDialogue
    ? displayedDialogueDelivery.spokenText
    : activeStatementDelivery.spokenText;
  const captionSpeechTiming = heldDialogue && displayedDialogue === heldDialogue
    ? { text: playbackText, elapsedMs: 1, durationMs: 1, alignment: null }
    : speechTiming;
  const playbackPerformanceKey = displayedDialogue
    ? `${displayedDialogue.nodeId}:${displayedDialogue.occurredAt}:${displayedDialogue.lineId ?? "text-only"}`
    : `${props.session.revision}:${playbackLineId ?? "text-only"}`;
  const spectatorBeat = spectator && state.playPhase === "trial"
    ? `${props.session.revision}:${playbackLineId ?? "text-only"}`
    : null;

  const mansionPlacements = useMemo(
    () => mansionRoomPlacements(state.rooms.filter((room) => room.floor === mansionFloor)),
    [mansionFloor, state.rooms],
  );
  const mansionSelectedRoom = state.rooms.find((room) => room.id === selectedMansionRoomId && room.floor === mansionFloor)
    ?? mansionPlacements[0]?.room
    ?? null;
  const mansionSelectedSuspect = state.suspects.find((suspect) => suspect.roomId === mansionSelectedRoom?.id) ?? null;
  const mansionMinX = mansionPlacements.length ? Math.min(...mansionPlacements.map((placement) => placement.x)) : 0;
  const mansionMinY = mansionPlacements.length ? Math.min(...mansionPlacements.map((placement) => placement.y)) : 0;
  const mansionMaxX = Math.max(1, ...mansionPlacements.map((placement) => placement.x + placement.width));
  const mansionMaxY = Math.max(1, ...mansionPlacements.map((placement) => placement.y + placement.height));
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
  const mansionGroundFloor = state.rooms.find((room) => room.name.toLowerCase().includes("foyer"))?.floor
    ?? Math.min(...mansionFloors);
  const mansionFloorDisplayName = mansionFloor === mansionGroundFloor
    ? "Ground floor"
    : mansionFloor < mansionGroundFloor
      ? "Lower floor"
      : "Upper floor";
  const mansionDoors: Array<{ key: string; orientation: "vertical" | "horizontal"; x: number; y: number }> = [];
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

  const advanceDialoguePlayback = useCallback((): void => {
    if (dialoguePlaybackIndex + 1 < dialoguePlaybackQueue.length) {
      setDialoguePlaybackIndex(dialoguePlaybackIndex + 1);
      return;
    }
    setDialoguePlaybackQueue([]);
    setDialoguePlaybackIndex(0);
  }, [dialoguePlaybackIndex, dialoguePlaybackQueue.length]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const finishCurrentDialogue = useCallback((): void => {
    if (!queuedDialogue) return;
    activeAudioRef.current?.pause();
    activeAudioRef.current = null;
    setSpeechTiming({
      text: splitDebateMysteryStageActionTextV2(queuedDialogue.visibleText, botForDialogue(props, state, queuedDialogue)?.name ?? null).spokenText,
      elapsedMs: 1,
      durationMs: 1,
      alignment: null,
    });
    setHeldDialogue(queuedDialogue);
    setDialoguePlaybackQueue([]);
    setDialoguePlaybackIndex(0);
  }, [props, queuedDialogue, state]);

  const sendAction = useCallback(async (action: V2ClientAction): Promise<void> => {
    if (busy || dialoguePerformanceActive) return;
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
      const nextState = result.session.formatState as DebateWhodunnitFormatStateV2;
      if (action.action === "talk" || action.action === "present_to_suspect") setCommand(null);
      const exchange = nextState.dialogueHistory.slice(previousDialogueCount);
      if (exchange.length) {
        setHeldDialogue(null);
        setSpeechTiming(null);
        setDialoguePlaybackQueue(exchange);
        setDialoguePlaybackIndex(0);
      }
      props.onSessionChange(result.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }, [busy, dialoguePerformanceActive, props, state.dialogueHistory.length]);

  useEffect(() => {
    const lineId = playbackLineId;
    if (!lineId || !state.voicesEnabled || !props.audioEnabled || props.audioVolume <= 0) return;
    if (lastPlayedPerformanceKeyRef.current === playbackPerformanceKey) {
      if (spectatorBeat) setCompletedSpectatorBeat(spectatorBeat);
      return;
    }
    lastPlayedPerformanceKeyRef.current = playbackPerformanceKey;
    const audio = new Audio(
      `/api/debates/${encodeURIComponent(props.session.id)}/mystery-audio/${encodeURIComponent(lineId)}`,
    );
    activeAudioRef.current = audio;
    audio.volume = Math.max(0, Math.min(1, props.audioVolume));
    const releaseOutput = routeAudioElementToPrismOutput(audio);
    let animationFrame: number | null = null;
    let completed = false;
    const updateSpeechTiming = (): void => {
      const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration * 1_000
        : 1;
      setSpeechTiming({
        text: playbackText,
        elapsedMs: Math.min(durationMs, Math.max(0, audio.currentTime * 1_000)),
        durationMs,
        alignment: null,
      });
      if (!audio.paused && !audio.ended) animationFrame = window.requestAnimationFrame(updateSpeechTiming);
    };
    const completeBeat = (): void => {
      if (completed) return;
      completed = true;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      setSpeechTiming(null);
      if (activeAudioRef.current === audio) activeAudioRef.current = null;
      if (queuedDialogue) advanceDialoguePlayback();
      if (spectatorBeat) setCompletedSpectatorBeat(spectatorBeat);
    };
    audio.addEventListener("play", updateSpeechTiming, { once: true });
    audio.addEventListener("ended", completeBeat, { once: true });
    void audio.play().catch(completeBeat);
    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      setSpeechTiming(null);
      audio.removeEventListener("play", updateSpeechTiming);
      audio.removeEventListener("ended", completeBeat);
      audio.pause();
      releaseOutput?.();
    };
  }, [
    advanceDialoguePlayback,
    playbackLineId,
    playbackPerformanceKey,
    playbackText,
    props.audioEnabled,
    props.audioVolume,
    props.session.id,
    queuedDialogue,
    spectatorBeat,
    state.voicesEnabled,
  ]);

  useEffect(() => {
    const audioWillPlay = playbackLineId && state.voicesEnabled && props.audioEnabled && props.audioVolume > 0;
    if (audioWillPlay || (!queuedDialogue && !spectatorBeat)) return;
    if (!queuedDialogue) {
      const timer = window.setTimeout(() => setCompletedSpectatorBeat(spectatorBeat), 900);
      return () => window.clearTimeout(timer);
    }
    const durationMs = Math.max(1_200, playbackText.length * AUDIO_OFF_REVEAL_MS_PER_CHARACTER);
    const startedAt = performance.now();
    let frame: number | null = null;
    const reveal = (): void => {
      const elapsedMs = Math.min(durationMs, performance.now() - startedAt);
      setSpeechTiming({ text: playbackText, elapsedMs, durationMs, alignment: null });
      if (elapsedMs >= durationMs) {
        advanceDialoguePlayback();
        return;
      }
      frame = window.requestAnimationFrame(reveal);
    };
    reveal();
    return () => { if (frame !== null) window.cancelAnimationFrame(frame); };
  }, [
    advanceDialoguePlayback,
    playbackLineId,
    playbackText,
    props.audioEnabled,
    props.audioVolume,
    queuedDialogue,
    spectatorBeat,
    state.voicesEnabled,
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
    const callout = state.pendingCallout;
    if (!callout || callout.id === lastCalloutIdRef.current) return;
    lastCalloutIdRef.current = callout.id;
    void playDebateMysterySfx({
      cue: callout.callout === "order" ? "paper-place" : "theory",
      enabled: props.audioEnabled,
      volume: props.audioVolume,
    });
  }, [props.audioEnabled, props.audioVolume, state.pendingCallout]);

  useEffect(() => {
    setTheory(state.theory ?? {
      culpritSeatId: state.suspects[0]?.seatId ?? null,
      method: "",
      motive: "",
      opportunity: "",
      accompliceSeatId: null,
      evidenceIds: [],
      testimonyIds: [],
    });
    if (state.playPhase === "theory") setTheoryOpen(true);
  }, [state.playPhase, state.theory, state.suspects]);

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
  }, [roomContextKey, roomDialogueBaseline.contextKey, state.dialogueHistory.length]);

  const focusStatement = (offset: number): void => {
    if (!state.court || activeStatementIndex < 0) return;
    const nextIndex = (activeStatementIndex + offset + state.court.statements.length) % state.court.statements.length;
    const next = state.court.statements[nextIndex];
    if (next) void sendAction({ action: "focus_statement", statementId: next.statementId });
  };

  const renderRecordButtons = (onChoose: (reference: DebateMysteryRecordReferenceV2) => void): React.JSX.Element => (
    <div className={styles.recordGrid}>
      {admittedRecord.map((item) => (
        <button key={recordKey(item.reference)} type="button" disabled={busy} onClick={() => onChoose(item.reference)}>
          <span aria-hidden="true">{item.emoji}</span><strong>{item.title}</strong><small>{item.description}</small>
        </button>
      ))}
      {admittedRecord.length === 0 ? <p>No admitted record items yet.</p> : null}
    </div>
  );

  const callout = state.pendingCallout;
  const calloutStyle = callout?.actorColor
    ? ({ "--mystery-callout-color": callout.actorColor } as CSSProperties)
    : undefined;
  const roomParallaxEnabled = Boolean(
    currentRoom &&
      command === "examine" &&
      !busy &&
      !dialoguePerformanceActive &&
      !heldDialogue &&
      !reducedMotion &&
      !caseFileOpen &&
      !theoryOpen,
  );
  const roomSceneStyle = {
    "--room-image": currentRoom?.bundledAssetPath ? `url(${currentRoom.bundledAssetPath})` : "none",
    "--room-parallax-x": `${roomParallax.x}px`,
    "--room-parallax-y": `${roomParallax.y}px`,
  } as CSSProperties;
  const handleRoomPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    if (!roomParallaxEnabled || event.target instanceof HTMLElement && event.target.closest("button")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 8;
    const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5) * 6;
    setRoomParallax({ x, y });
  };
  const handleRoomPointerLeave = (): void => setRoomParallax({ x: 0, y: 0 });

  useEffect(() => {
    if (!roomParallaxEnabled) setRoomParallax({ x: 0, y: 0 });
  }, [roomParallaxEnabled]);

  if (state.playPhase === "title_card") {
    return (
      <main className={styles.titleCard} data-theme={props.theme}>
        <button type="button" className={styles.archiveButton} onClick={props.onExit}>← Archive</button>
        <div className={styles.titlePrism} aria-hidden="true">◇</div>
        <p className={styles.eyebrow}>PRISM presents</p>
        <h1>{state.caseTitle}</h1>
        <p>{state.fictionLabel}</p>
        <div className={styles.titleMetadata}>
          <span>{state.suspects.length} witnesses</span><span>{state.config.trialType === "jury" ? "Jury Trial" : "Bench Trial"}</span><span>{state.voicesEnabled ? "Local performance ready" : "Text performance"}</span>
        </div>
        <button type="button" className={styles.primaryAction} disabled={busy} onClick={() => void sendAction({ action: "move" })}>{spectator ? "Review Prosecutor Findings" : "Begin Case"}</button>
        {error ? <p className={styles.error}>{error}</p> : null}
      </main>
    );
  }

  if (state.playPhase === "verdict" && state.verdict) {
    const retryable = state.court?.credibilityRemaining === 0 && Boolean(state.court.checkpoint);
    return (
      <main className={styles.verdict} data-theme={props.theme}>
        {callout ? <div key={callout.id} className={styles.callout} style={calloutStyle} role="status" aria-live="assertive"><span>{CALLOUT_COPY[callout.callout]}</span></div> : null}
        <button type="button" className={styles.archiveButton} onClick={props.onExit}>← Archive</button>
        <p className={styles.eyebrow}>The Court finds</p>
        <h1 data-result={state.verdict.legalResult}>{state.verdict.legalResult === "guilty" ? "GUILTY" : "NOT GUILTY"}</h1>
        <section className={styles.truthGrade}>
          <h2>{state.verdict.classification.replaceAll("_", " ")}</h2>
          <p>Truth and proof grade: <strong>{state.verdict.proofGrade}</strong></p>
          <p>The sealed truth remained fixed throughout the social verdict.</p>
        </section>
        {state.verdict.jurorBallots.length > 0 ? (
          <section className={styles.ballots}><h2>Juror breakdown</h2>{state.verdict.jurorBallots.map((ballot) => {
            const bot = botById.get(ballot.jurorBotId);
            return <article key={ballot.jurorBotId}><strong>{bot?.name ?? "Juror"}</strong><span>{ballot.vote.replace("_", " ")}</span><p>{ballot.reason}</p>{ballot.powerAffected ? <small>Power affected</small> : null}</article>;
          })}</section>
        ) : null}
        <div className={styles.verdictActions}>
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

  if (state.playPhase === "trial" && state.court && activeStatement) {
    return (
      <main className={styles.court} data-theme={props.theme} data-tutorial-target="mystery-v2-court">
        <SessionAtmosphereLayer
          sessionKey={`whodunnit-v2-court:${props.session.id}`}
          backgroundUrl="/audio/debate/courtroom-audience-murmur-loop.mp3"
          active={props.audioEnabled}
          volume={props.audioVolume}
          mix={{ background: 0.14, grain: 0, foley: 0 }}
          lifecycleTransitionMs={600}
          mixTransitionMs={400}
          backgroundRecordable={false}
          ambientFoley={false}
        />
        {callout ? <div key={callout.id} className={styles.callout} style={calloutStyle} role="status" aria-live="assertive"><span>{CALLOUT_COPY[callout.callout]}</span></div> : null}
        <header className={styles.courtHeader}>
          <button type="button" onClick={props.onExit}>← Archive</button>
          <div><p className={styles.eyebrow}>{state.caseTitle}</p><strong>{spectator ? `Gallery · ${prosecutorBot?.name ?? "Prosecutor"}` : `${prosecutorBot?.name ?? "Prosecutor"} · Cross-Examination`}</strong></div>
          <button type="button" onClick={() => setCaseFileOpen(true)} data-tutorial-target="mystery-v2-case-file">Case File</button>
        </header>
        <div className={styles.credibility} aria-label={`${state.court.credibilityRemaining} of ${state.court.credibilityMaximum} credibility remaining`}>
          <span>Credibility</span><div>{Array.from({ length: state.court.credibilityMaximum }, (_, index) => <i key={index} data-full={index < state.court!.credibilityRemaining ? "true" : undefined} />)}</div>
        </div>
        <section className={styles.counselComposition} aria-label="Court counsel">
          <article className={styles.counselSeat} data-side="prosecution" style={{ "--counsel-color": prosecutorBot?.color ?? "#72d7ff" } as CSSProperties}>
            {prosecutorDialogueActive && dialogueStageActionText ? <em className={styles.counselAction} role="status">*{dialogueStageActionText}*</em> : null}
            {prosecutorBot ? props.renderMysteryBotAvatar(prosecutorBot, "mini", {
              demeanor: "partner",
              talking: speechTiming !== null && prosecutorDialogueActive,
              speechTiming: prosecutorDialogueActive ? speechTiming : null,
              blinkEnabled: true,
              facing: "right",
            }) : <span>◇</span>}
            <div><small>Player Prosecutor</small><strong>{prosecutorBot?.name ?? "Prosecutor"}</strong></div>
          </article>
          <article className={styles.counselSeat} data-side="defense" style={{ "--counsel-color": defenseBot?.color ?? "#ff7eaa" } as CSSProperties}>
            {defenseDialogueActive && dialogueStageActionText ? <em className={styles.counselAction} role="status">*{dialogueStageActionText}*</em> : null}
            {defenseBot ? props.renderMysteryBotAvatar(defenseBot, "mini", {
              demeanor: "partner",
              talking: speechTiming !== null && defenseDialogueActive,
              speechTiming: defenseDialogueActive ? speechTiming : null,
              blinkEnabled: true,
              facing: "left",
            }) : <span>◇</span>}
            <div><small>Defense Counsel</small><strong>{defenseBot?.name ?? "Defense"}</strong></div>
            {defendantMiniVisible && defendant && defendantBot ? (
              <aside
                className={styles.defendantMini}
                data-defendant-seat-id={defendant.seatId}
                data-hidden-while-testifying="false"
                style={{ "--defendant-color": defendant.color ?? "#a98cff" } as CSSProperties}
              >
                {defendantDialogueActive && dialogueStageActionText ? <em className={styles.counselAction} role="status">*{dialogueStageActionText}*</em> : null}
                {props.renderMysteryBotAvatar(defendantBot, "mini", {
                  demeanor: "suspect",
                  talking: speechTiming !== null && defendantDialogueActive,
                  speechTiming: defendantDialogueActive ? speechTiming : null,
                  blinkEnabled: true,
                  facing: "left",
                })}
                <small>Defendant · {defendant.name}</small>
              </aside>
            ) : null}
          </article>
        </section>
        <section className={styles.witnessStand} style={{ "--witness-color": witness?.color ?? "#a98cff" } as CSSProperties}>
          <div className={styles.witnessAvatar}>{witnessBot ? props.renderMysteryBotAvatar(witnessBot, "full", { demeanor: "suspect", talking: speechTiming !== null && displayedDialogue?.speakerSeatId === witnessSeatId, speechTiming: displayedDialogue?.speakerSeatId === witnessSeatId ? speechTiming : null, blinkEnabled: true, facing: "left" }) : <span>◇</span>}</div>
          {courtWitnessStageActionText ? <em className={styles.witnessAction} role="status">*{courtWitnessStageActionText}*</em> : null}
          <div className={styles.witnessIdentity}><small>Witness {state.court.completedChapterIds.length + 1} of {state.court.witnessOrder.length}</small><h1>{witness?.name ?? "Witness"}</h1></div>
        </section>
        <section className={styles.testimony}>
          <div className={styles.testimonyNav}>
            {spectator ? null : <button type="button" aria-label="Previous statement" onClick={() => focusStatement(-1)} disabled={busy}>‹</button>}
            <span>{activeStatementIndex + 1} / {state.court.statements.length}</span>
            {spectator ? null : <button type="button" aria-label="Next statement" onClick={() => focusStatement(1)} disabled={busy}>›</button>}
          </div>
          <p onDoubleClick={finishCurrentDialogue}>{revealedSpeechText(activeStatementDelivery.spokenText, captionSpeechTiming)}</p>
          <small>{activeStatement.pressed ? "Pressed" : "Sworn statement"}{activeStatement.version > 1 ? ` · Revision ${activeStatement.version}` : ""}</small>
        </section>
        {displayedDialogue && displayedDialogue.lineId !== activeStatement.lineId ? (
          <aside className={styles.courtReaction} onDoubleClick={finishCurrentDialogue}><strong>{dialogueBot?.name ?? "Court"}</strong><p>{revealedSpeechText(displayedDialogueDelivery.spokenText, captionSpeechTiming)}</p></aside>
        ) : null}
        {spectator ? <aside className={styles.courtReaction} role="status"><strong>Watch-only court</strong><p>The selected Prosecutor is conducting the examination from the frozen admissible record.</p></aside> : <nav className={styles.courtActions} aria-label="Prosecution actions">
          <button type="button" disabled={busy} onClick={() => void sendAction({ action: "press_statement", statementId: activeStatement.statementId })} data-tutorial-target="mystery-v2-press"><span>!</span>Press</button>
          <button type="button" disabled={busy} onClick={() => setCommand("present")} data-tutorial-target="mystery-v2-present-record"><span>◇</span>Objection</button>
          <button type="button" disabled={busy} onClick={() => void sendAction({ action: "review_strategy", contextNodeId: state.activeDialogueNodeId })} data-tutorial-target="mystery-v2-think"><span>◈</span>Think</button>
        </nav>}
        {!spectator && command === "present" ? <div className={styles.choiceTray}><header><h2>Object with evidence</h2><button type="button" onClick={() => setCommand(null)}>Close</button></header>{renderRecordButtons((record) => { setCommand(null); void sendAction({ action: "object_statement", statementId: activeStatement.statementId, record }); })}</div> : null}
        {!spectator && state.pendingProsecutionChoice ? <div className={styles.prosecutionChoice} role="dialog" aria-modal="true" aria-labelledby="prosecution-choice-title"><p className={styles.eyebrow}>Your response</p><h2 id="prosecution-choice-title">{state.pendingProsecutionChoice.prompt}</h2>{state.pendingProsecutionChoice.options.map((option) => <button key={option.id} type="button" disabled={busy} onClick={() => void sendAction({ action: "choose_prosecution_response", choiceId: state.pendingProsecutionChoice!.id, optionId: option.id })}>{option.text}</button>)}</div> : null}
        {caseFileOpen ? <CaseFile state={state} onClose={() => setCaseFileOpen(false)} /> : null}
        {error ? <p className={styles.errorBanner}>{error}</p> : null}
      </main>
    );
  }

  return (
    <main className={styles.investigation} data-theme={props.theme} data-view={state.roomView} data-tutorial-target="mystery-v2-investigation">
      <SessionAtmosphereLayer
        sessionKey={`whodunnit-v2-investigation:${props.session.id}`}
        backgroundUrl={WHODUNNIT_INVESTIGATION_MUSIC_URL}
        active={props.audioEnabled}
        volume={props.audioVolume}
        mix={mysteryInvestigationMusicMix({ theoryBoardOpen: theoryOpen })}
        lifecycleTransitionMs={WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS}
        mixTransitionMs={WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS}
        backgroundRecordable={false}
        ambientFoley={false}
      />
      <header className={styles.investigationHeader}>
        <button type="button" onClick={props.onExit}>← Archive</button>
        <div><p className={styles.eyebrow}>{state.caseTitle}</p><strong>{spectatorTheory ? "Prosecutor Findings" : "Investigation"}</strong></div>
        <button type="button" onClick={() => setCaseFileOpen(true)} data-tutorial-target="mystery-v2-case-file">Case File <span>{admittedRecord.length}</span></button>
      </header>
      {spectatorTheory ? (
        <section className={styles.partnerFindings} aria-labelledby="prosecutor-findings-title">
          <p className={styles.eyebrow}>Selected Prosecutor · automated</p>
          <h1 id="prosecutor-findings-title">Review the proposed conclusion</h1>
          <p>The selected Prosecutor investigated offstage. Only the authorized physical findings in the Case File are public; revise the editable theory, then file it when it reflects the case you want carried into court.</p>
        </section>
      ) : state.roomView === "mansion" ? (
        <section className={styles.mansionBoard} aria-label="Mansion Move map" data-tutorial-target="mystery-v2-mansion">
          <header className={styles.mansionHeading}>
            <div><p className={styles.eyebrow}>The mansion</p><strong>{mansionFloorDisplayName}</strong></div>
            <nav className={styles.mansionFloorPicker} aria-label="Mansion floors">
              {mansionFloors.map((floor) => (
                <button
                  key={floor}
                  type="button"
                  aria-label={`Show ${floor === mansionGroundFloor ? "ground floor" : floor < mansionGroundFloor ? "lower floor" : "upper floor"}`}
                  aria-pressed={mansionFloor === floor}
                  data-selected={mansionFloor === floor ? "true" : undefined}
                  title={floor === mansionGroundFloor ? "Ground floor" : floor < mansionGroundFloor ? "Lower floor" : "Upper floor"}
                  onClick={() => {
                    const room = state.rooms.find((candidate) => candidate.floor === floor);
                    setMansionFloor(floor);
                    if (room) setSelectedMansionRoomId(room.id);
                  }}
                >{floor}</button>
              ))}
            </nav>
          </header>
          <div className={styles.mansionViewport}>
            <div className={styles.mansionCanvas}>
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
                const room = placement.room;
                const roomSuspects = state.suspects.filter((suspect) => suspect.roomId === room.id);
                const examinedHotspots = room.hotspots.filter((hotspot) => hotspot.examined).length;
                return (
                  <button
                    key={room.id}
                    type="button"
                    className={styles.mansionRoom}
                    disabled={busy}
                    data-discovered={room.unlocked ? "true" : undefined}
                    data-current={room.id === currentRoom?.id ? "true" : undefined}
                    data-selected={room.id === mansionSelectedRoom?.id ? "true" : undefined}
                    data-visited={room.visited ? "true" : undefined}
                    data-searched={room.hotspots.length > 0 && examinedHotspots === room.hotspots.length ? "true" : undefined}
                    data-locked={!room.unlocked ? "true" : undefined}
                    aria-pressed={room.id === mansionSelectedRoom?.id}
                    aria-label={`${room.unlocked ? room.name : "Locked location"}${room.visited ? ", visited" : ""}${roomSuspects.length ? `, ${roomSuspects.map((suspect) => suspect.name).join(" and ")} known to be here` : ""}`}
                    onClick={() => setSelectedMansionRoomId(room.id)}
                    style={{
                      left: `${mansionX(placement.x)}%`,
                      top: `${mansionY(placement.y)}%`,
                      width: `${mansionWidth(placement.width)}%`,
                      height: `${mansionHeight(placement.height)}%`,
                    }}
                  >
                    {room.unlocked ? <strong>{room.name}</strong> : null}
                    {roomSuspects.map((suspect) => {
                      const bot = botById.get(suspect.botId);
                      const position = mysteryMapOccupantPosition(props.session.id, room.id, suspect.seatId);
                      return (
                        <i
                          key={suspect.seatId}
                          className={styles.mansionOccupant}
                          role="img"
                          aria-label={`${suspect.name} is known to be here`}
                          data-tutorial-target="mystery-v2-micro-avatar"
                          style={{ left: `${position.xPct}%`, top: `${position.yPct}%`, color: suspect.color ?? "#a98cff" }}
                        >{props.renderBotGlyph(bot?.glyph ?? null, { size: 18, strokeWidth: 1.5, className: styles.mansionOccupantGlyph })}</i>
                      );
                    })}
                    {room.hotspots.length > 0 && examinedHotspots === room.hotspots.length ? <i className={styles.mansionRoomCompleteMark} aria-hidden="true">✓</i> : null}
                    {(room.neighborIds ?? []).some((id) => state.rooms.find((candidate) => candidate.id === id)?.floor !== room.floor) ? <small>Stairs</small> : null}
                  </button>
                );
              })}
            </div>
          </div>
          {mansionSelectedRoom ? (
            <section className={styles.mansionRoomDetails} aria-live="polite" data-locked={!mansionSelectedRoom.unlocked ? "true" : undefined}>
              <div>
                <small>Selected room</small>
                <strong>{mansionSelectedRoom.unlocked ? mansionSelectedRoom.name : "Locked location"}</strong>
                <span>{mansionFloorDisplayName} · {mansionSelectedRoom.unlocked ? (mansionSelectedRoom.visited ? "Visited" : "Not yet visited") : "Locked"}</span>
              </div>
              <dl>
                <div><dt>Known occupant</dt><dd>{mansionSelectedSuspect?.name ?? "Unknown"}</dd></div>
                <div><dt>Details reviewed</dt><dd>{mansionSelectedRoom.hotspots.filter((hotspot) => hotspot.examined).length} / {mansionSelectedRoom.hotspots.length}</dd></div>
              </dl>
              <button type="button" disabled={busy || !mansionSelectedRoom.unlocked} onClick={() => void sendAction({ action: "move", roomId: mansionSelectedRoom.id })}>
                {mansionSelectedRoom.unlocked ? `Enter ${mansionSelectedRoom.name}` : "Locked"}
              </button>
            </section>
          ) : null}
          <small className={styles.mansionHint}>Choose where to descend. Movement is free.</small>
        </section>
      ) : currentRoom ? (
        <section
          className={styles.roomScene}
          style={roomSceneStyle}
          data-parallax-enabled={roomParallaxEnabled ? "true" : undefined}
          onPointerMove={handleRoomPointerMove}
          onPointerLeave={handleRoomPointerLeave}
        >
          <div className={styles.roomParallaxLayer}>
            <div className={styles.roomBackdrop} data-blurred={roomActorVisible ? "true" : undefined} />
            {command === "examine" ? <div className={styles.hotspots} aria-label="Examination points">{currentRoom.hotspots.filter((hotspot) => hotspot.unlocked).map((hotspot) => <button key={hotspot.id} type="button" aria-label={`${hotspot.examined ? "Reviewed" : "Examine"} ${hotspot.label}`} disabled={busy || hotspot.examined} data-reviewed={hotspot.examined ? "true" : undefined} style={hotspotSpotStyle(hotspot.polygon)} onClick={() => void sendAction({ action: "examine", roomId: currentRoom.id, hotspotId: hotspot.id })}><span>{hotspot.examined ? "✓" : "＋"} {hotspot.label}</span></button>)}</div> : null}
          </div>
          <div className={styles.roomShade} />
          <div className={styles.roomTitle}><small>Floor {currentRoom.floor}</small><h1>{currentRoom.name}</h1></div>
          {roomActorVisible && currentBot ? <div className={styles.roomActor} data-prosecutor-speaking={roomProsecutorActive ? "true" : undefined} style={{ "--actor-color": currentSuspect?.color ?? "#a98cff" } as CSSProperties}>{props.renderMysteryBotAvatar(currentBot, "full", { demeanor: "suspect", talking: speechTiming !== null && roomDisplayedDialogue?.speakerSeatId === currentSuspect?.seatId, speechTiming: roomDisplayedDialogue?.speakerSeatId === currentSuspect?.seatId ? speechTiming : null, blinkEnabled: true, facing: "left" })}<strong>{currentSuspect?.name}</strong>{roomSuspectStageActionText ? <em className={styles.roomActorAction} role="status">*{roomSuspectStageActionText}*</em> : null}</div> : null}
          {roomProsecutorActive && prosecutorBot ? <aside className={styles.roomProsecutorCue} style={{ "--actor-color": prosecutorBot.color ?? "#72d7ff" } as CSSProperties}>
            {roomProsecutorStageActionText ? <em className={styles.roomActorAction} role="status">*{roomProsecutorStageActionText}*</em> : null}
            {props.renderMysteryBotAvatar(prosecutorBot, "full", { demeanor: "partner", talking: speechTiming !== null && !heldDialogue, speechTiming: heldDialogue ? null : speechTiming, blinkEnabled: true, facing: "right" })}
            <strong>{prosecutorBot.name} · Prosecutor</strong>
          </aside> : null}
          {roomDisplayedDialogue ? <div className={styles.dialogueBox} data-speaker={roomProsecutorActive ? "prosecutor" : "witness"} onDoubleClick={finishCurrentDialogue}><small>{roomDialogueBot ? `${roomDialogueBot.name}${roomProsecutorActive ? " · Prosecutor" : ""}` : "Casekeeper"}</small><p>{revealedSpeechText(roomDialogueDelivery.spokenText, captionSpeechTiming)}</p></div> : null}
        </section>
      ) : null}
      {!spectatorTheory ? <nav className={styles.investigationCommands} aria-label="Investigation commands">
        <button type="button" data-active={state.roomView === "mansion" ? "true" : undefined} disabled={busy || dialoguePerformanceActive} onClick={() => { setCommand("move"); void sendAction({ action: "move" }); }} data-tutorial-target="mystery-v2-move"><span>⌂</span>Move</button>
        <button type="button" data-active={command === "examine" ? "true" : undefined} disabled={busy || dialoguePerformanceActive || state.roomView !== "room"} onClick={() => setCommand("examine")} data-tutorial-target="mystery-v2-examine"><span>⌕</span>Examine</button>
        <button type="button" data-active={command === "talk" ? "true" : undefined} disabled={busy || dialoguePerformanceActive || !currentSuspect} onClick={() => setCommand("talk")} data-tutorial-target="mystery-v2-talk"><span>“”</span>Talk</button>
        <button type="button" data-active={command === "present" ? "true" : undefined} disabled={busy || dialoguePerformanceActive || !currentSuspect || admittedRecord.length === 0} onClick={() => setCommand("present")} data-tutorial-target="mystery-v2-present"><span>◇</span>Present</button>
      </nav> : null}
      {!spectatorTheory && command === "talk" && currentSuspect && !dialoguePerformanceActive ? <div className={styles.choiceTray}><header><div><p className={styles.eyebrow}>Talk</p><h2>{currentSuspect.name}</h2></div><button type="button" onClick={() => setCommand(null)}>Close</button></header><div className={styles.topicList}>{state.topics.filter((topic) => topic.suspectSeatId === currentSuspect.seatId && topic.unlocked).map((topic) => <button key={topic.nodeId} type="button" disabled={busy || dialoguePerformanceActive} data-complete={topic.completed ? "true" : undefined} onClick={() => void sendAction({ action: "talk", suspectSeatId: currentSuspect.seatId, topicNodeId: topic.nodeId })}><span>{topic.completed ? "✓" : "?"}</span>{topic.label}</button>)}</div></div> : null}
      {!spectatorTheory && command === "present" && currentSuspect ? <div className={styles.choiceTray}><header><div><p className={styles.eyebrow}>Present</p><h2>Show {currentSuspect.name}</h2></div><button type="button" onClick={() => setCommand(null)}>Close</button></header>{renderRecordButtons((record) => void sendAction({ action: "present_to_suspect", suspectSeatId: currentSuspect.seatId, record }))}</div> : null}
      {!spectatorTheory && state.theoryAvailable ? <button type="button" className={styles.fileChargesButton} onClick={() => setTheoryOpen(true)} data-tutorial-target="mystery-v2-file-theory">File Charges</button> : !spectatorTheory ? <small className={styles.theoryHint}>The Theory Board opens after the briefing, one interview, and one admitted record item.</small> : null}
      {caseFileOpen ? <CaseFile state={state} onClose={() => setCaseFileOpen(false)} /> : null}
      {theoryOpen || spectatorTheory ? <div className={styles.theoryBoard} role="dialog" aria-modal="true" aria-labelledby="theory-v2-title"><header><div><p className={styles.eyebrow}>{spectatorTheory ? "Prosecutor research · editable" : "Theory Board"}</p><h2 id="theory-v2-title">{spectatorTheory ? "Review the Prosecutor conclusion" : "File the prosecution's case"}</h2></div>{spectatorTheory ? null : <button type="button" onClick={() => setTheoryOpen(false)}>Close</button>}</header>{spectatorTheory ? <p>The selected Prosecutor&apos;s conclusion is a public hypothesis built from the admitted physical findings. You may revise every field before filing it.</p> : null}<label>Accused<select value={theory.culpritSeatId ?? ""} onChange={(event) => setTheory((current) => ({ ...current, culpritSeatId: event.target.value || null }))}>{state.suspects.map((suspect) => <option key={suspect.seatId} value={suspect.seatId}>{suspect.name}</option>)}</select></label><label>Method<textarea value={theory.method} onChange={(event) => setTheory((current) => ({ ...current, method: event.target.value }))} placeholder="How was the crime committed?" /></label><label>Motive<textarea value={theory.motive} onChange={(event) => setTheory((current) => ({ ...current, motive: event.target.value }))} placeholder="Why would the accused do it?" /></label><label>Opportunity<textarea value={theory.opportunity} onChange={(event) => setTheory((current) => ({ ...current, opportunity: event.target.value }))} placeholder="When and where was the opportunity?" /></label><fieldset><legend>Evidence to admit</legend>{admittedRecord.filter((item) => item.reference.kind === "evidence").map((item) => <label key={item.reference.id}><input type="checkbox" checked={theory.evidenceIds.includes(item.reference.id)} onChange={(event) => setTheory((current) => ({ ...current, evidenceIds: event.target.checked ? [...current.evidenceIds, item.reference.id] : current.evidenceIds.filter((id) => id !== item.reference.id) }))} />{item.emoji} {item.title}</label>)}</fieldset><p>Incomplete method, motive, or opportunity will weaken the case, but will not block trial.</p><button type="button" className={styles.primaryAction} disabled={busy || !theory.culpritSeatId} onClick={() => { if (!spectatorTheory) setTheoryOpen(false); void sendAction({ action: "file_theory", theory }); }}>{spectatorTheory ? "File conclusion and watch court" : "File charges and open court"}</button></div> : null}
      {callout ? <div key={callout.id} className={styles.callout} style={calloutStyle} role="status" aria-live="assertive"><span>{CALLOUT_COPY[callout.callout]}</span></div> : null}
      {error ? <p className={styles.errorBanner}>{error}</p> : null}
    </main>
  );
}

function CaseFile(props: {
  state: DebateWhodunnitFormatStateV2;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <aside className={styles.caseFile} role="dialog" aria-modal="true" aria-labelledby="mystery-v2-case-file-title">
      <header><div><p className={styles.eyebrow}>Prosecution record</p><h2 id="mystery-v2-case-file-title">Case File</h2></div><button type="button" onClick={props.onClose}>Close</button></header>
      <section><h3>Evidence &amp; sworn testimony</h3>{props.state.record.filter((item) => item.admitted).map((item) => <article key={recordKey(item.reference)}><span aria-hidden="true">{item.emoji}</span><div><strong>{item.title}</strong><small>{item.reference.kind}</small><p>{item.description}</p></div></article>)}</section>
      <section><h3>Witnesses</h3>{props.state.suspects.map((suspect) => <article key={suspect.seatId}><span aria-hidden="true" style={{ color: suspect.color ?? undefined }}>●</span><div><strong>{suspect.name}</strong><small>{props.state.metSuspectSeatIds.includes(suspect.seatId) ? "Interviewed" : "Not yet interviewed"}</small></div></article>)}</section>
      <small>{props.state.voicesEnabled ? "Complete local English audio pack ready" : "Playing as a validated text case"}</small>
    </aside>
  );
}
