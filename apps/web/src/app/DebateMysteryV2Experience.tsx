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
  DEBATE_SCHEMA_VERSION,
  botIdentityPresentationTransitionActiveV1,
  debateMysteryMansionBundleEligibleV2,
  splitDebateMysteryStageActionTextV2,
  type DebateMysteryActionRequestV2,
  type DebateMysteryCompilationStageV2,
  type DebateMysteryCompilationStatusV2,
  type DebateMysteryPublicDialogueEntryV2,
  type DebateMysteryPublicTopicV2,
  type DebateMysteryRecordReferenceV2,
  type DebateMysteryRoomV2,
  type DebateMysterySealedAssetRefV1,
  type DebateMysteryTheoryV1,
  type DebateBotSnapshotV1,
  type DebateSessionV1,
  type DebateWhodunnitFormatStateV2,
  type BotFaceStyle,
} from "@localai/shared";
import { SessionAtmosphereLayer } from "./SessionAtmosphereLayer";
import IdentityPresentationBlackout from "./IdentityPresentationBlackout";
import { debateIdentityAppearanceBotV1 } from "./debateIdentityPresentation";
import {
  debateMysteryIdentityMirrorFaceV1,
  debateMysteryIdentityMirrorPresentationsV1,
  debateMysteryIdentityMirrorTargetBotSnapshotV1,
  debateMysteryQuotedIdentityNameV1,
} from "./debateMysteryIdentityMirror";
import {
  WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS,
  WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS,
  WHODUNNIT_INVESTIGATION_MUSIC_URL,
  mysteryInvestigationMusicMix,
} from "./debateMysteryMusic";
import { playDebateMysterySfx } from "./debateMysterySfx";
import { mysteryMapOccupantPosition } from "./debateMysteryRoomWalk";
import {
  debateMysteryV2ExaminationCompletesRoom,
  debateMysteryV2HotspotCenter,
  debateMysteryV2LensClickTarget,
  debateMysteryV2RoomComplete,
  resolveDebateMysteryV2Lens,
  type MysteryLensState,
} from "./debateMysteryV2Lens";
import { routeAudioElementToPrismOutput } from "./replayAudioMasterCapture";
import { releaseAudibleAudioElement } from "./audibleAudioRelease";
import {
  nextWhodunnitInterrogationPhase,
  startWhodunnitInterrogation,
  whodunnitActorDriftTiming,
  whodunnitCaptionSpeechText,
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
import type { VoicePlaybackCharacterAlignment } from "./voiceEffects";
import type { MysteryBotSummary } from "./DebateMysteryExperience";
import type { BotPickerGlyphRenderer } from "./BotPicker";
import { formatDebateMysteryV2ForgeErrorDetails } from "./debateMysteryV2ForgeFailureDetails";
import {
  debateMysteryForgeAuthoritativePercent,
  debateMysteryForgeStageIsActive,
  formatDebateMysteryForgeElapsed,
  formatDebateMysteryForgeEta,
} from "./debateMysteryV2ForgeProgress";
import styles from "./debateMysteryV2.module.css";

interface V2SharedProps {
  bots: MysteryBotSummary[];
  playerName: string;
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

type MysteryActionDialogue = Pick<
  DebateMysteryPublicDialogueEntryV2,
  "visibleText" | "stageActionText"
>;

const MYSTERY_TALK_CATEGORY_ORDER = ["person", "motive", "alibi", "room", "general"] as const;

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
  transcriptCopyState: V2ReviewCopyState;
  reviewCopyState: V2ReviewCopyState;
  onCopyVerboseTranscript: () => Promise<void>;
  onCopyAllReviewData: () => Promise<void>;
  onSaveMansion: () => Promise<void>;
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
    name: debateMysteryQuotedIdentityNameV1(copiedName),
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
): string {
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
  const center = debateMysteryV2HotspotCenter(polygon);
  return {
    left: `${Math.max(4, Math.min(96, center.x))}%`,
    top: `${Math.max(8, Math.min(90, center.y))}%`,
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
  const [errorDetailsCopyState, setErrorDetailsCopyState] = useState<V2ForgeErrorCopyState>("idle");
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const [liveCompilation, setLiveCompilation] = useState(state.compilation);
  const liveCompilationRef = useRef(liveCompilation);
  const [forgeTipIndex, setForgeTipIndex] = useState(0);
  const sessionId = props.session.id;
  const request = props.request;
  const onSessionChange = props.onSessionChange;
  const onSessionChangeRef = useRef(onSessionChange);
  const reducedMotion = usePrefersReducedMotion();

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
  const elapsedMs = compilationActive && Number.isFinite(updatedAtMs)
    ? compilation.elapsedMs + Math.max(0, clockNowMs - updatedAtMs)
    : compilation.elapsedMs;
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
  const etaLabel =
    compilation.etaBasisPasses >= 2 &&
    compilation.approximateRemainingMs !== null &&
    compilation.approximateRemainingMs > 0 &&
    compilationActive
      ? formatDebateMysteryForgeEta(compilation.approximateRemainingMs)
      : null;

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
      <section className={styles.forgeCard}>
        <div className={styles.forgePrism} aria-hidden="true"><i /><i /><i /></div>
        <p className={styles.eyebrow}>PRISM / Case Forge</p>
        <h1>{needsAttention ? "Case preparation stopped" : spectatorForge ? "Preparing your mystery to watch." : "Preparing a prosecution turnabout"}</h1>
        {!spectatorForge ? <p className={styles.forgeMessage}>{compilation.spoilerSafeMessage}</p> : null}
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
          <span>Elapsed {formatDebateMysteryForgeElapsed(elapsedMs)}</span>
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
              <p className={styles.forgeMessage}>{compilation.spoilerSafeMessage}</p>
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
  const pendingRoomKey = state.rooms
    .filter((room) => room.sealedAsset?.status === "pending")
    .map((room) => room.id)
    .sort()
    .join("|");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState<"move" | "examine" | "talk" | "present" | null>(null);
  const [caseFileOpen, setCaseFileOpen] = useState(false);
  const [theoryOpen, setTheoryOpen] = useState(state.playPhase === "theory");
  const [theory, setTheory] = useState<DebateMysteryTheoryV1>(() => emptyTheory(state));
  const [dialoguePlaybackQueue, setDialoguePlaybackQueue] = useState<DebateMysteryPublicDialogueEntryV2[]>([]);
  const [dialoguePlaybackIndex, setDialoguePlaybackIndex] = useState(0);
  const [speechTiming, setSpeechTiming] = useState<V2SpeechTiming | null>(null);
  const [interrogationPhase, setInterrogationPhase] = useState<WhodunnitInterrogationPhase | null>(null);
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
  const [sealedAssetSaveState, setSealedAssetSaveState] = useState<
    Record<string, "saving" | "saved" | "failed">
  >({});
  const [sealedAssetObjectUrls, setSealedAssetObjectUrls] = useState<Record<string, string>>({});
  const sealedAssetObjectUrlRef = useRef(new Map<string, string>());
  const [openingMapReveal, setOpeningMapReveal] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [roomParallax, setRoomParallax] = useState({ x: 0, y: 0 });
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioGenerationRef = useRef(0);
  const roomContextKey = state.roomView === "room" ? state.currentRoomId : null;
  const [roomDialogueBaseline, setRoomDialogueBaseline] = useState(() => ({
    contextKey: roomContextKey,
    historyCount: state.dialogueHistory.length,
  }));
  const [completedSpectatorBeat, setCompletedSpectatorBeat] = useState<string | null>(null);
  const mutationIndexRef = useRef(0);
  const lastPlayedPerformanceKeyRef = useRef<string | null>(null);
  const lastCalloutIdRef = useRef<string | null>(null);
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
    const requests = new Map<string, { kind: "evidence" | "room"; subjectId: string }>();
    for (const room of state.rooms) {
      if (room.sealedAsset?.revealed && room.sealedAsset.status === "ready") {
        requests.set(sealedMysteryAssetKey("room", room.id), {
          kind: "room",
          subjectId: room.id,
        });
      }
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
  }, [state.record, state.rooms]);
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
        sealedMysteryAssetApiUrl(props.session.id, request.kind, request.subjectId),
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
  const mansionFloors = useMemo(
    () => [...new Set(state.rooms.map((room) => room.floor))].sort((left, right) => right - left),
    [state.rooms],
  );
  const [mansionFloor, setMansionFloor] = useState(() => currentRoom?.floor ?? mansionFloors.at(-1) ?? 1);
  const [selectedMansionRoomId, setSelectedMansionRoomId] = useState(() => currentRoom?.id ?? state.rooms[0]?.id ?? "");
  const currentSuspect = state.suspects.find((suspect) => suspect.roomId === currentRoom?.id) ?? null;
  const currentBot = presentMysteryBot(botForSeat(props, state, currentSuspect?.seatId));
  const roomIntroductionPhase = currentRoom
    ? state.roomIntroductions[currentRoom.id] ?? "complete"
    : "complete";
  const roomIntroductionActive = roomIntroductionPhase !== "complete";
  const roomIntroductionPersonaActive = roomIntroductionPhase === "persona";
  const roomIntroductionNodeId = currentRoom && roomIntroductionActive
    ? `room-introduction-${currentRoom.id}-${roomIntroductionPhase}`
    : null;
  const roomIntroductionDialogue = roomIntroductionNodeId
    ? state.dialogueHistory.findLast((entry) => entry.nodeId === roomIntroductionNodeId) ?? null
    : null;
  const lastDialogue = state.dialogueHistory.at(-1) ?? null;
  const queuedDialogue = dialoguePlaybackQueue[dialoguePlaybackIndex] ?? null;
  const displayedDialogue = queuedDialogue ?? heldDialogue ?? lastDialogue;
  const dialogueBot = presentMysteryBot(botForDialogue(props, state, displayedDialogue));
  const roomDisplayedDialogue = roomIntroductionDialogue ?? queuedDialogue ?? heldDialogue ?? (
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
  const roomObservationAwaitingContinue = Boolean(
    command === "examine" &&
      roomDisplayedDialogue &&
      roomDialogueIsTextOnly &&
      !queuedDialogue,
  );
  const roomIntroductionAwaitingContinue = roomIntroductionPhase === "casekeeper";
  const roomDialogueDelivery = roomDisplayedDialogue
    ? splitDebateMysteryStageActionTextV2(roomDisplayedDialogue.visibleText, roomDialogueBot?.name ?? null)
    : { stageActionText: null, spokenText: "" };
  const roomStageActionText = roomDisplayedDialogue?.stageActionText ?? roomDialogueDelivery.stageActionText;
  const roomSuspectStageActionText = roomDisplayedDialogue?.speakerSeatId === currentSuspect?.seatId
    ? roomStageActionText
    : null;
  const roomProsecutorStageActionText = roomProsecutorActive ? roomStageActionText : null;
  const dialoguePerformanceActive = queuedDialogue !== null;
  const interrogationAudioMayStart = whodunnitInterrogationMayStartAudio(interrogationPhase);
  const audioMouthActive = whodunnitInterrogationAudioOwnsMouth({
    phase: interrogationPhase,
    audible: speechTiming?.audible === true,
  });
  const roomSpeechInkVisible = !dialoguePerformanceActive || interrogationPhase === "handoff";
  const admittedRecord = state.record.filter((item) => item.admitted);
  const mansionCanBeSaved = debateMysteryMansionBundleEligibleV2(state);

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
          : "This mansion could not be saved.",
      );
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
  const displayedDialogueDelivery = displayedDialogue
    ? splitDebateMysteryStageActionTextV2(displayedDialogue.visibleText, dialogueBot?.name ?? null)
    : { stageActionText: null, spokenText: "" };
  const activeStatementDelivery = activeStatement
    ? splitDebateMysteryStageActionTextV2(activeStatement.visibleText, witness?.name ?? null)
    : { stageActionText: null, spokenText: "" };
  const activeStatementStageActionText = activeStatement?.stageActionText ?? activeStatementDelivery.stageActionText;
  const prosecutorBot = presentMysteryBot(botById.get(state.config.prosecutorBotId) ?? null);
  const defenseBot = presentMysteryBot(botById.get(state.config.rivalDefenseBotId) ?? null);
  const defendant = state.suspects.find((entry) => entry.seatId === state.court?.defendantSeatId) ?? null;
  const defendantBot = presentMysteryBot(defendant ? botById.get(defendant.botId) ?? null : null);
  const defendantMiniVisible = Boolean(defendant && defendantBot && defendant.seatId !== witnessSeatId);
  const prosecutorDialogueActive = displayedDialogue?.speakerBotId === state.config.prosecutorBotId;
  const defenseDialogueActive = displayedDialogue?.speakerBotId === state.config.rivalDefenseBotId;
  const defendantDialogueActive = Boolean(
    defendant && displayedDialogue?.speakerSeatId === defendant.seatId,
  );
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
  const courtWitnessActionPresentation = displayedDialogue?.speakerSeatId === witnessSeatId
    ? dialogueActionPresentation
    : displayedDialogue && displayedDialogue.lineId !== activeStatement?.lineId
      ? null
      : activeStatementActionPresentation;
  const spectator = state.config.playerRole === "spectator";
  const spectatorTheory = spectator && state.playPhase === "theory";
  const openingOrMapPlaybackSuppressed = state.playPhase === "title_card" || (
    state.playPhase === "investigation" &&
    state.roomView === "mansion" &&
    state.activeDialogueNodeId === null
  );
  const playbackLineId = openingOrMapPlaybackSuppressed || dialogueIsTextOnly ? null : displayedDialogue?.lineId ?? (
    state.playPhase === "trial" ? activeStatement?.lineId ?? null : null
  );
  const playbackText = displayedDialogue
    ? displayedDialogueDelivery.spokenText
    : activeStatementDelivery.spokenText;
  const captionSpeechTiming = heldDialogue && displayedDialogue === heldDialogue
    ? { text: playbackText, elapsedMs: 1, durationMs: 1, alignment: null, audible: false }
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
  const mansionSelectedRoomPending = mansionSelectedRoom?.sealedAsset?.status === "pending";
  const mansionSelectedRoomAdjacent = Boolean(
    mansionSelectedRoom &&
      (!currentRoom ||
        mansionSelectedRoom.id === currentRoom.id ||
        (currentRoom.neighborIds ?? []).includes(mansionSelectedRoom.id) ||
        (mansionSelectedRoom.neighborIds ?? []).includes(currentRoom.id)),
  );
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
    const beatMs = whodunnitInterrogationBeatMs(interrogationPhase);
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
        setDialoguePlaybackIndex((index) => index + 1);
        setInterrogationPhase((current) => current === interrogationPhase ? "suspect_entrance" : current);
        return;
      }
      setInterrogationPhase((current) => current === interrogationPhase ? (next === "complete" ? null : next) : current);
    }, beatMs);
    return () => window.clearTimeout(timer);
  }, [dialoguePlaybackIndex, dialoguePlaybackQueue.length, interrogationPhase, queuedDialogue]);

  const currentRoomUnexaminedHotspots = currentRoom?.hotspots.filter(
    (hotspot) => hotspot.unlocked && !hotspot.examined,
  ) ?? [];
  const currentRoomHotspotStateKey = currentRoom?.hotspots
    .map((hotspot) => `${hotspot.id}:${hotspot.unlocked ? 1 : 0}:${hotspot.examined ? 1 : 0}`)
    .join("|") ?? "";
  const roomComplete = debateMysteryV2RoomComplete(currentRoom?.hotspots ?? []);
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

  const finishCurrentDialogue = useCallback((): void => {
    if (!queuedDialogue) {
      if (roomObservationAwaitingContinue) {
        setHeldDialogue(null);
        setSpeechTiming(null);
        setRoomDialogueBaseline({
          contextKey: roomContextKey,
          historyCount: state.dialogueHistory.length,
        });
      }
      return;
    }
    const decision = whodunnitInterrogationFinishDecision({
      phase: interrogationPhase,
      hasQueuedResponse: dialoguePlaybackIndex + 1 < dialoguePlaybackQueue.length,
    });
    if (decision === "ignore") return;
    audioGenerationRef.current += 1;
    if (activeAudioRef.current) {
      void releaseAudibleAudioElement(activeAudioRef.current);
    }
    activeAudioRef.current = null;
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
      setDialoguePlaybackIndex((index) => index + 1);
      setInterrogationPhase("suspect_entrance");
      return;
    }
    setHeldDialogue(queuedDialogue);
    setInterrogationPhase(null);
    setDialoguePlaybackQueue([]);
    setDialoguePlaybackIndex(0);
  }, [dialoguePlaybackIndex, dialoguePlaybackQueue.length, interrogationPhase, props, queuedDialogue, roomContextKey, roomObservationAwaitingContinue, state]);

  const sendAction = useCallback(async (action: V2ClientAction): Promise<boolean> => {
    const introductionAction = action.action === "advance_room_introduction" || action.action === "complete_room_introduction";
    if (busy || (dialoguePerformanceActive && !introductionAction)) return false;
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
      props.onSessionChange(result.session);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That action could not be completed.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, dialoguePerformanceActive, props, state.config.prosecutorBotId, state.dialogueHistory.length]);

  useEffect(() => {
    if (
      roomIntroductionPhase !== "persona" ||
      !currentRoom ||
      queuedDialogue ||
      speechTiming ||
      activeAudioRef.current ||
      busy
    ) return;
    const timer = window.setTimeout(() => {
      void sendAction({ action: "complete_room_introduction", roomId: currentRoom.id });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [busy, currentRoom, queuedDialogue, roomIntroductionPhase, sendAction, speechTiming]);

  useEffect(() => {
    const lineId = playbackLineId;
    if (!lineId || !interrogationAudioMayStart || !state.voicesEnabled || !props.audioEnabled || props.audioVolume <= 0) return;
    if (lastPlayedPerformanceKeyRef.current === playbackPerformanceKey) {
      if (spectatorBeat) setCompletedSpectatorBeat(spectatorBeat);
      return;
    }
    lastPlayedPerformanceKeyRef.current = playbackPerformanceKey;
    const audioGeneration = audioGenerationRef.current + 1;
    audioGenerationRef.current = audioGeneration;
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
      if (!audio.paused && !audio.ended) animationFrame = window.requestAnimationFrame(updateSpeechTiming);
    };
    const completeBeat = (): void => {
      if (completed || !whodunnitInterrogationCompletionIsCurrent(audioGeneration, audioGenerationRef.current)) return;
      completed = true;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      setSpeechTiming(null);
      if (activeAudioRef.current === audio) activeAudioRef.current = null;
      if (queuedDialogue) {
        if (interrogationPhase === "prosecutor_speaking") setInterrogationPhase("handoff");
        else if (interrogationPhase === "suspect_speaking") advanceDialoguePlayback();
        else advanceDialoguePlayback();
      }
      if (spectatorBeat) setCompletedSpectatorBeat(spectatorBeat);
    };
    // `playing`, unlike `play`, means this local element has begun audible playback.
    audio.addEventListener("playing", updateSpeechTiming, { once: true });
    audio.addEventListener("loadedmetadata", updateSpeechTiming);
    audio.addEventListener("durationchange", updateSpeechTiming);
    audio.addEventListener("ended", completeBeat, { once: true });
    audio.addEventListener("error", completeBeat, { once: true });
    audio.addEventListener("pause", completeBeat, { once: true });
    void audio.play().catch(completeBeat);
    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      if (audioGenerationRef.current === audioGeneration) audioGenerationRef.current += 1;
      setSpeechTiming(null);
      audio.removeEventListener("playing", updateSpeechTiming);
      audio.removeEventListener("loadedmetadata", updateSpeechTiming);
      audio.removeEventListener("durationchange", updateSpeechTiming);
      audio.removeEventListener("ended", completeBeat);
      audio.removeEventListener("error", completeBeat);
      audio.removeEventListener("pause", completeBeat);
      if (activeAudioRef.current === audio) activeAudioRef.current = null;
      void releaseAudibleAudioElement(audio, { onReleased: releaseOutput ?? undefined });
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
    interrogationAudioMayStart,
    interrogationPhase,
    spectatorBeat,
    state.voicesEnabled,
  ]);

  useEffect(() => {
    const audioWillPlay = playbackLineId && interrogationAudioMayStart && state.voicesEnabled && props.audioEnabled && props.audioVolume > 0;
    if (roomIntroductionAwaitingContinue || !interrogationAudioMayStart || audioWillPlay || (!queuedDialogue && !spectatorBeat)) return;
    if (!queuedDialogue) {
      const timer = window.setTimeout(() => setCompletedSpectatorBeat(spectatorBeat), 900);
      return () => window.clearTimeout(timer);
    }
    const revealGeneration = audioGenerationRef.current + 1;
    audioGenerationRef.current = revealGeneration;
    const durationMs = Math.max(1_200, playbackText.length * AUDIO_OFF_REVEAL_MS_PER_CHARACTER);
    const startedAt = performance.now();
    let frame: number | null = null;
    const reveal = (): void => {
      if (!whodunnitInterrogationCompletionIsCurrent(revealGeneration, audioGenerationRef.current)) return;
      const elapsedMs = Math.min(durationMs, performance.now() - startedAt);
      setSpeechTiming({ text: playbackText, elapsedMs, durationMs, alignment: null, audible: false });
      if (elapsedMs >= durationMs) {
        setSpeechTiming(null);
        if (interrogationPhase === "prosecutor_speaking") setInterrogationPhase("handoff");
        else advanceDialoguePlayback();
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
    interrogationAudioMayStart,
    interrogationPhase,
    spectatorBeat,
    roomIntroductionAwaitingContinue,
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
    setInterrogationPhase(null);
    audioGenerationRef.current += 1;
    if (activeAudioRef.current) {
      void releaseAudibleAudioElement(activeAudioRef.current);
    }
    activeAudioRef.current = null;
  }, [roomContextKey, roomDialogueBaseline.contextKey, state.dialogueHistory.length]);

  useEffect(() => () => {
    audioGenerationRef.current += 1;
    if (activeAudioRef.current) {
      void releaseAudibleAudioElement(activeAudioRef.current);
    }
    activeAudioRef.current = null;
  }, []);

  const focusStatement = (offset: number): void => {
    if (!state.court || activeStatementIndex < 0) return;
    const nextIndex = (activeStatementIndex + offset + state.court.statements.length) % state.court.statements.length;
    const next = state.court.statements[nextIndex];
    if (next) void sendAction({ action: "focus_statement", statementId: next.statementId });
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
          <button key={recordKey(item.reference)} type="button" disabled={busy} onClick={() => onChoose(item.reference)}>
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

  const callout = state.pendingCallout;
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
  const currentRoomAssetUrl = currentRoom ? sealedMysteryAssetObjectUrl(
    sealedAssetObjectUrls,
    "room",
    currentRoom.id,
    currentRoom?.sealedAsset,
  ) : null;
  const currentRoomAssetKey = currentRoom
    ? sealedMysteryAssetKey("room", currentRoom.id)
    : null;
  const roomSceneStyle = {
    "--room-image": currentRoomAssetUrl
      ? `url(${currentRoomAssetUrl})`
      : currentRoom?.bundledAssetPath
        ? `url(${currentRoom.bundledAssetPath})`
        : "none",
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
  const handleRoomInvestigationClick = (event: React.MouseEvent<HTMLElement>): void => {
    if (!lensActive || !currentRoom) return;
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

  if (state.playPhase === "title_card") {
    return (
      <main className={styles.titleCard} data-theme={props.theme}>
        <button type="button" className={styles.archiveButton} onClick={props.onExit}>← Archive</button>
        <div className={styles.titlePrism} aria-hidden="true">◇</div>
        <p className={styles.eyebrow}>PRISM presents</p>
        <h1>{state.caseTitle}</h1>
        <p>{state.fictionLabel}</p>
        <div className={styles.titleMetadata}>
          <span>{state.suspects.length} witnesses</span><span>{state.config.trialType === "jury" ? "Jury Trial" : "Bench Trial"}</span>{state.config.investigationMode === "court_only" ? <span>Court act</span> : null}<span>{state.voicesEnabled ? "Local performance ready" : "Text performance"}</span>
        </div>
        <button type="button" className={styles.primaryAction} disabled={busy} onClick={() => void sendAction({ action: "move" })}>{state.config.investigationMode === "court_only" ? "Begin Trial" : spectator ? "Review Prosecutor Findings" : "Begin Case"}</button>
        {error ? <p className={styles.error}>{error}</p> : null}
      </main>
    );
  }

  if (state.playPhase === "case_opening") {
    const openingDialogue = state.dialogueHistory.findLast((entry) => entry.nodeId === "briefing-opening") ?? lastDialogue;
    const openingText = openingDialogue
      ? splitDebateMysteryStageActionTextV2(openingDialogue.visibleText, null).spokenText
      : `The known details of ${state.caseTitle ?? "this case"} are in the file.`;
    const dismissOpening = async (): Promise<void> => {
      if (busy) return;
      // Set the cover before committing the persistent phase transition so the
      // overhead map is never exposed for a frame between the two scenes.
      setOpeningMapReveal(true);
      const advanced = await sendAction({ action: "dismiss_case_opening" });
      if (!advanced) setOpeningMapReveal(false);
    };
    const handleOpeningKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void dismissOpening();
      }
    };
    const openingRoomImage = currentRoom ? sealedMysteryAssetObjectUrl(
      sealedAssetObjectUrls,
      "room",
      currentRoom.id,
      currentRoom?.sealedAsset,
    ) ?? currentRoom?.bundledAssetPath ?? null : null;
    return (
      <main className={styles.caseOpening} data-theme={props.theme}>
        <button type="button" className={styles.archiveButton} onClick={props.onExit}>← Archive</button>
        <section
          className={styles.caseOpeningStage}
          aria-label="Casekeeper briefing in the crime scene. Click anywhere to begin the visible sweep."
          aria-busy={busy || undefined}
          role="button"
          tabIndex={0}
          style={{
            "--opening-room-image": openingRoomImage
              ? `url(${openingRoomImage})`
              : "none",
          } as CSSProperties}
          onClick={() => void dismissOpening()}
          onKeyDown={handleOpeningKeyDown}
        >
          <div
            className={styles.caseOpeningPlayerAvatar}
            role="img"
            aria-label={`${props.playerName || "Investigator"}, player character`}
          >
            <i aria-hidden="true">
              {props.renderBotGlyph("lucideTriangle", { size: 54, strokeWidth: 1.35 })}
            </i>
            <strong>{props.playerName || "Investigator"}</strong>
          </div>
          <div
            className={styles.caseOpeningDialogue}
          >
            <small>Casekeeper</small>
            <p>{revealedSpeechText(whodunnitCaptionSpeechText(openingText), captionSpeechTiming)}</p>
            <span className={styles.dialogueContinueHint} role="status">{busy ? "Opening the crime scene…" : "Enter the crime scene"}</span>
          </div>
        </section>
        {error ? <p className={styles.errorBanner}>{error}</p> : null}
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
        {identityPresentationBlackout}
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
            {prosecutorDialogueActive && dialogueActionPresentation ? <SignalVoiceActionText key={`prosecution:${displayedDialogue?.nodeId ?? ""}:${displayedDialogue?.occurredAt ?? ""}`} {...dialogueActionPresentation} accent={prosecutorBot?.color} /> : null}
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
            {defenseDialogueActive && dialogueActionPresentation ? <SignalVoiceActionText key={`defense:${displayedDialogue?.nodeId ?? ""}:${displayedDialogue?.occurredAt ?? ""}`} {...dialogueActionPresentation} accent={defenseBot?.color} /> : null}
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
                {defendantDialogueActive && dialogueActionPresentation ? <SignalVoiceActionText key={`defendant:${displayedDialogue?.nodeId ?? ""}:${displayedDialogue?.occurredAt ?? ""}`} {...dialogueActionPresentation} accent={defendantBot.color} /> : null}
                {props.renderMysteryBotAvatar(defendantBot, "mini", {
                  demeanor: "suspect",
                  talking: speechTiming !== null && defendantDialogueActive,
                  speechTiming: defendantDialogueActive ? speechTiming : null,
                  blinkEnabled: true,
                  facing: "left",
                })}
                <small>Defendant · {defendantBot.name}</small>
              </aside>
            ) : null}
          </article>
        </section>
        <section className={styles.witnessStand} style={{ "--witness-color": witness?.color ?? "#a98cff" } as CSSProperties}>
          <div className={styles.witnessAvatar}>{witnessBot ? props.renderMysteryBotAvatar(witnessBot, "full", { demeanor: "suspect", talking: speechTiming !== null && displayedDialogue?.speakerSeatId === witnessSeatId, speechTiming: displayedDialogue?.speakerSeatId === witnessSeatId ? speechTiming : null, blinkEnabled: true, facing: "left" }) : <span>◇</span>}{courtWitnessActionPresentation ? <SignalVoiceActionText key={`witness:${displayedDialogue?.nodeId ?? activeStatement?.statementId ?? ""}:${displayedDialogue?.occurredAt ?? ""}`} {...courtWitnessActionPresentation} accent={witness?.color} /> : null}</div>
          <div className={styles.witnessIdentity}><small>Witness {state.court.completedChapterIds.length + 1} of {state.court.witnessOrder.length}</small><h1>{witnessBot?.name ?? witness?.name ?? "Witness"}</h1></div>
        </section>
        <section className={styles.testimony}>
          <div className={styles.testimonyNav}>
            {spectator ? null : <button type="button" aria-label="Previous statement" onClick={() => focusStatement(-1)} disabled={busy}>‹</button>}
            <span>{activeStatementIndex + 1} / {state.court.statements.length}</span>
            {spectator ? null : <button type="button" aria-label="Next statement" onClick={() => focusStatement(1)} disabled={busy}>›</button>}
          </div>
          <p onDoubleClick={finishCurrentDialogue}>{revealedSpeechText(whodunnitCaptionSpeechText(activeStatementDelivery.spokenText), captionSpeechTiming)}</p>
          <small>{activeStatement.pressed ? "Pressed" : "Sworn statement"}{activeStatement.version > 1 ? ` · Revision ${activeStatement.version}` : ""}</small>
        </section>
        {displayedDialogue && displayedDialogue.lineId !== activeStatement.lineId ? (
          <aside className={styles.courtReaction} onDoubleClick={finishCurrentDialogue}><strong>{dialogueBot?.name ?? "Court"}</strong><p>{revealedSpeechText(whodunnitCaptionSpeechText(displayedDialogueDelivery.spokenText), captionSpeechTiming)}</p></aside>
        ) : null}
        {spectator ? <aside className={styles.courtReaction} role="status"><strong>Watch-only court</strong><p>The selected Prosecutor is conducting the examination from the frozen admissible record.</p></aside> : <nav className={styles.courtActions} aria-label="Prosecution actions">
          <button type="button" disabled={busy} onClick={() => void sendAction({ action: "press_statement", statementId: activeStatement.statementId })} data-tutorial-target="mystery-v2-press"><span>!</span>Press</button>
          <button type="button" disabled={busy} onClick={() => setCommand("present")} data-tutorial-target="mystery-v2-present-record"><span>◇</span>Objection</button>
          <button type="button" disabled={busy} onClick={() => void sendAction({ action: "review_strategy", contextNodeId: state.activeDialogueNodeId })} data-tutorial-target="mystery-v2-think"><span>◈</span>Think</button>
        </nav>}
        {!spectator && command === "present" ? <div className={styles.choiceTray}><header><h2>Object with evidence</h2><button type="button" onClick={() => setCommand(null)}>Close</button></header>{renderRecordButtons((record) => { setCommand(null); void sendAction({ action: "object_statement", statementId: activeStatement.statementId, record }); })}</div> : null}
        {!spectator && state.pendingProsecutionChoice ? <div className={styles.prosecutionChoice} role="dialog" aria-modal="true" aria-labelledby="prosecution-choice-title"><p className={styles.eyebrow}>Your response</p><h2 id="prosecution-choice-title">{state.pendingProsecutionChoice.prompt}</h2>{state.pendingProsecutionChoice.options.map((option) => <button key={option.id} type="button" disabled={busy} onClick={() => void sendAction({ action: "choose_prosecution_response", choiceId: state.pendingProsecutionChoice!.id, optionId: option.id })}>{option.text}</button>)}</div> : null}
        {caseFileOpen ? <CaseFile state={state} objectUrls={sealedAssetObjectUrls} saveState={sealedAssetSaveState} onSaveAsset={saveSealedAsset} onClose={() => setCaseFileOpen(false)} /> : null}
        {error ? <p className={styles.errorBanner}>{error}</p> : null}
      </main>
    );
  }

  return (
    <main className={styles.investigation} data-theme={props.theme} data-view={state.roomView} data-opening-map-reveal={openingMapReveal ? "true" : undefined} data-tutorial-target="mystery-v2-investigation">
      <SessionAtmosphereLayer
        sessionKey={`whodunnit-v2-investigation:${props.session.id}`}
        backgroundUrl={WHODUNNIT_INVESTIGATION_MUSIC_URL}
        active={props.audioEnabled}
        volume={props.audioVolume}
        mix={mysteryInvestigationMusicMix({
          theoryBoardOpen: theoryOpen,
          roomIntroductionActive,
        })}
        lifecycleTransitionMs={WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS}
        mixTransitionMs={WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS}
        backgroundRecordable={false}
        ambientFoley={false}
      />
      {identityPresentationBlackout}
      {!roomIntroductionActive ? <header className={styles.investigationHeader}>
        <button type="button" onClick={props.onExit}>← Archive</button>
        <div><p className={styles.eyebrow}>{state.caseTitle}</p><strong>{spectatorTheory ? "Prosecutor Findings" : "Investigation"}</strong></div>
        <button type="button" onClick={() => setCaseFileOpen(true)} data-tutorial-target="mystery-v2-case-file">Case File <span>{admittedRecord.length}</span></button>
      </header> : null}
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
                  ? "Saving mansion…"
                  : mansionSaveState === "saved"
                    ? "Mansion saved"
                    : mansionSaveState === "failed"
                      ? "Retry save"
                      : "Save mansion level"}
              </button>
            ) : null}
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
                const roomSuspects = room.visited
                  ? state.suspects.filter((suspect) => suspect.roomId === room.id)
                  : [];
                const examinedHotspots = room.hotspots.filter((hotspot) => hotspot.examined).length;
                return (
                  <button
                    key={room.id}
                    type="button"
                    className={styles.mansionRoom}
                    disabled={busy}
                    data-discovered={room.visited ? "true" : undefined}
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
                    }}
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
                <strong>{mansionSelectedRoom.visited ? mansionSelectedRoom.name : "Unknown room"}</strong>
                <span>{mansionFloorDisplayName} · {mansionSelectedRoomPending ? "Being secured" : mansionSelectedRoom.unlocked ? (mansionSelectedRoom.visited ? "Visited" : "Not yet visited") : "Locked"}</span>
              </div>
              <dl>
                <div><dt>Known occupant</dt><dd>{mansionSelectedRoom.visited ? mansionSelectedSuspect?.name ?? "Unknown" : "Unknown"}</dd></div>
                <div><dt>Details reviewed</dt><dd>{mansionSelectedRoom.visited ? `${mansionSelectedRoom.hotspots.filter((hotspot) => hotspot.examined).length} / ${mansionSelectedRoom.hotspots.length}` : "Unknown"}</dd></div>
              </dl>
              {mansionSelectedRoomPending ? <p className={styles.securedRoomStatus} role="status" aria-live="polite">The Casekeeper is still securing this room. Try again shortly.</p> : null}
              <button type="button" disabled={busy || !mansionSelectedRoom.unlocked || mansionSelectedRoomPending || !mansionSelectedRoomAdjacent} onClick={() => void sendAction({ action: "move", roomId: mansionSelectedRoom.id })}>
                {mansionSelectedRoomPending
                  ? "Being secured"
                  : !mansionSelectedRoom.unlocked
                    ? "Locked"
                    : !mansionSelectedRoomAdjacent
                      ? "Not adjacent"
                      : mansionSelectedRoom.visited
                        ? `Enter ${mansionSelectedRoom.name}`
                        : "Enter room"}
              </button>
            </section>
          ) : null}
          <small className={styles.mansionHint}>Move through one connected doorway at a time.</small>
        </section>
      ) : currentRoom ? (
        <section
          className={styles.roomScene}
          style={roomSceneStyle}
          data-parallax-enabled={roomParallaxEnabled ? "true" : undefined}
          data-lens-active={lensActive ? "true" : undefined}
          data-room-introduction={roomIntroductionActive ? roomIntroductionPhase : undefined}
          onPointerMove={handleRoomPointerMove}
          onPointerLeave={handleRoomPointerLeave}
          onClick={handleRoomInvestigationClick}
        >
          {currentRoom.sealedAsset?.status === "pending" ? (
            <div className={styles.roomSecuring} role="status" aria-live="polite">
              <strong>The Casekeeper is still securing this room.</strong>
              <span>Try again shortly.</span>
            </div>
          ) : null}
          <div className={styles.roomParallaxLayer}>
            <div className={styles.roomBackdrop} data-blurred={roomActorVisible ? "true" : undefined} />
            {command === "examine" && !roomComplete ? <div className={styles.hotspots} aria-label="Examination points">{currentRoomUnexaminedHotspots.map((hotspot) => <button key={hotspot.id} type="button" aria-label={`Examine ${hotspot.label}`} disabled={!lensActive} data-examining={examiningHotspotId === hotspot.id ? "true" : undefined} style={hotspotSpotStyle(hotspot.polygon)} onFocus={() => { const center = debateMysteryV2HotspotCenter(hotspot.polygon); setInvestigationLens(resolveDebateMysteryV2Lens(center.x, center.y, currentRoom.hotspots)); }} onClick={(event) => { if (event.detail === 0) { event.stopPropagation(); void examineHotspot(hotspot.id); } }} />)}</div> : null}
          </div>
          {command === "examine" && !roomComplete ? <i className={styles.investigationLens} aria-hidden="true" data-visible={lensActive ? "true" : undefined} data-targeted={debateMysteryV2LensClickTarget(investigationLens) ? "true" : undefined} style={{ left: `${investigationLens.x}%`, top: `${investigationLens.y}%`, "--lens-proximity": investigationLens.proximity } as CSSProperties} /> : null}
          {roomIntroductionPhase !== "casekeeper" ? <div className={styles.roomShade} /> : null}
          {!roomIntroductionActive ? <div className={styles.roomTitle}><small>Floor {currentRoom.floor}</small><h1>{currentRoom.name}</h1>{currentRoomAssetUrl && currentRoom.sealedAsset && currentRoomAssetKey ? <button type="button" className={styles.saveSealedAssetButton} disabled={sealedAssetSaveState[currentRoomAssetKey] === "saving" || sealedAssetSaveState[currentRoomAssetKey] === "saved"} onClick={(event) => { event.stopPropagation(); void saveSealedAsset(currentRoom.sealedAsset!, currentRoom.id, `${currentRoom.name} · Whodunnit room`); }}>{sealedAssetSaveState[currentRoomAssetKey] === "saving" ? "Saving…" : sealedAssetSaveState[currentRoomAssetKey] === "saved" ? "Saved to Images" : sealedAssetSaveState[currentRoomAssetKey] === "failed" ? "Retry save" : "Save room image"}</button> : null}</div> : null}
          {roomActorVisible && currentBot ? <div className={styles.roomActor} data-interrogation-phase={interrogationPhase ?? undefined} style={{ "--actor-color": currentBot.color ?? "#a98cff" } as CSSProperties}><div className={styles.roomActorDrift} style={mysteryRoomActorDriftStyle(`${props.session.id}:${currentBot.id}:suspect`)}>{props.renderMysteryBotAvatar(currentBot, "full", { demeanor: "suspect", talking: audioMouthActive && roomDisplayedDialogue?.speakerSeatId === currentSuspect?.seatId, speechTiming: audioMouthActive && roomDisplayedDialogue?.speakerSeatId === currentSuspect?.seatId ? speechTiming : null, blinkEnabled: true, facing: "left", speechInkVisible: roomSpeechInkVisible })}<strong>{currentBot.name}</strong>{roomSuspectStageActionText && roomActionPresentation ? <SignalVoiceActionText key={`suspect:${roomDisplayedDialogue?.nodeId ?? ""}:${roomDisplayedDialogue?.occurredAt ?? ""}`} {...roomActionPresentation} accent={currentBot.color} /> : null}</div></div> : null}
          {roomProsecutorActive && prosecutorBot ? <aside className={`${styles.roomActor} ${styles.roomProsecutorActor}`} data-prosecutor-speaking="true" data-interrogation-phase={interrogationPhase ?? undefined} style={{ "--actor-color": prosecutorBot.color ?? "#72d7ff" } as CSSProperties}>
            <div className={styles.roomActorDrift} style={mysteryRoomActorDriftStyle(`${props.session.id}:${prosecutorBot.id}:prosecutor`)}>
              {roomProsecutorStageActionText && roomActionPresentation ? <SignalVoiceActionText key={`room-prosecutor:${roomDisplayedDialogue?.nodeId ?? ""}:${roomDisplayedDialogue?.occurredAt ?? ""}`} {...roomActionPresentation} accent={prosecutorBot.color} /> : null}
              {props.renderMysteryBotAvatar(prosecutorBot, "full", { demeanor: "partner", talking: audioMouthActive && !heldDialogue, speechTiming: audioMouthActive && !heldDialogue ? speechTiming : null, blinkEnabled: true, facing: "right", speechInkVisible: roomSpeechInkVisible })}
              <strong>{prosecutorBot.name} · Prosecutor</strong>
            </div>
          </aside> : null}
          {roomDisplayedDialogue ? <div className={styles.dialogueBox} data-speaker={roomProsecutorActive ? "prosecutor" : "witness"} data-examination={roomDialogueIsTextOnly ? "true" : undefined} data-awaiting-continue={roomObservationAwaitingContinue || roomIntroductionAwaitingContinue ? "true" : undefined} onClick={(event) => { event.stopPropagation(); if (roomIntroductionAwaitingContinue && currentRoom) void sendAction({ action: "advance_room_introduction", roomId: currentRoom.id }); else if (!roomIntroductionActive) finishCurrentDialogue(); }} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); if (roomIntroductionAwaitingContinue && currentRoom) void sendAction({ action: "advance_room_introduction", roomId: currentRoom.id }); else if (!roomIntroductionActive) finishCurrentDialogue(); } }}><small>{roomIntroductionAwaitingContinue ? "Casekeeper" : roomDialogueIsTextOnly ? "Observation" : roomDialogueBot ? `${roomDialogueBot.name}${roomProsecutorActive ? " · Prosecutor" : ""}` : "Casekeeper"}</small><p>{revealedSpeechText(whodunnitCaptionSpeechText(roomDialogueDelivery.spokenText), captionSpeechTiming)}</p>{roomObservationAwaitingContinue || roomIntroductionAwaitingContinue ? <span className={styles.dialogueContinueHint} role="status">Click to continue</span> : null}</div> : null}
          {completionCueVisible ? <div className={styles.roomComplete} role="status" aria-live="polite"><p>Every detail has entered the record.</p><strong>{currentRoom.name} complete</strong></div> : null}
        </section>
      ) : null}
      {!spectatorTheory && !roomIntroductionActive ? <nav className={styles.investigationCommands} aria-label="Investigation commands">
        <button type="button" data-active={state.roomView === "mansion" ? "true" : undefined} disabled={busy || dialoguePerformanceActive || !state.openingSweepComplete} title={!state.openingSweepComplete ? "Examine every visible point in the crime scene first." : undefined} onClick={() => { setCommand("move"); void sendAction({ action: "move" }); }} data-tutorial-target="mystery-v2-move"><span>⌂</span>Move</button>
        <button type="button" data-active={command === "examine" ? "true" : undefined} disabled={busy || dialoguePerformanceActive || state.roomView !== "room"} onClick={() => setCommand("examine")} data-tutorial-target="mystery-v2-examine"><span>⌕</span>Examine</button>
        <button type="button" data-active={command === "talk" ? "true" : undefined} disabled={busy || dialoguePerformanceActive || !currentSuspect} onClick={() => setCommand("talk")} data-tutorial-target="mystery-v2-talk"><span>“”</span>Talk</button>
        <button type="button" data-active={command === "present" ? "true" : undefined} disabled={busy || dialoguePerformanceActive || !currentSuspect || admittedRecord.length === 0} onClick={() => setCommand("present")} data-tutorial-target="mystery-v2-present"><span>◇</span>Present</button>
      </nav> : null}
      {!spectatorTheory && !roomIntroductionActive && !state.openingSweepComplete ? <small className={styles.sweepHint} role="status">Finish the finite visible sweep before leaving the crime scene.</small> : null}
      {!spectatorTheory && !roomIntroductionActive && command === "talk" && currentSuspect && !dialoguePerformanceActive ? <div className={styles.choiceTray}><header><div><p className={styles.eyebrow}>Talk</p><h2>{currentSuspect.name}</h2></div><button type="button" onClick={() => setCommand(null)}>Close</button></header><p className={styles.topicHelp}>Ask about people, motives, alibis, or rooms. Evidence and testimony stay in Present.</p><div className={styles.topicGroups}>{groupDebateMysteryTalkTopicsV2(state.topics.filter((topic) => topic.suspectSeatId === currentSuspect.seatId)).map((group) => <section key={group.category} className={styles.topicGroup} aria-labelledby={`talk-${currentSuspect.seatId}-${group.category}`}><h3 id={`talk-${currentSuspect.seatId}-${group.category}`}>{group.label}</h3><div className={styles.topicList}>{group.topics.map((topic) => <button key={topic.nodeId} type="button" disabled={busy || dialoguePerformanceActive || !topic.unlocked} data-complete={topic.completed ? "true" : undefined} data-blocked={!topic.unlocked ? "true" : undefined} onClick={() => void sendAction({ action: "talk", suspectSeatId: currentSuspect.seatId, topicNodeId: topic.nodeId })}><span className={styles.topicIcon} aria-hidden="true">{topic.completed ? "✓" : topic.unlocked ? "?" : "×"}</span><span className={styles.topicCopy}><strong>{debateMysteryTalkTopicDisplayLabelV2(topic, state.rooms)}</strong>{!topic.unlocked ? <small>Blocked</small> : null}</span></button>)}</div></section>)}</div></div> : null}
      {!spectatorTheory && !roomIntroductionActive && command === "present" && currentSuspect ? <div className={styles.choiceTray}><header><div><p className={styles.eyebrow}>Present</p><h2>Show {currentSuspect.name}</h2></div><button type="button" onClick={() => setCommand(null)}>Close</button></header>{renderRecordButtons((record) => void sendAction({ action: "present_to_suspect", suspectSeatId: currentSuspect.seatId, record }))}</div> : null}
      {!spectatorTheory && !roomIntroductionActive && state.theoryAvailable ? <button type="button" className={styles.fileChargesButton} onClick={() => setTheoryOpen(true)} data-tutorial-target="mystery-v2-file-theory">File Charges</button> : !spectatorTheory && !roomIntroductionActive ? <small className={styles.theoryHint}>The Theory Board opens after the briefing, one interview, and one admitted record item.</small> : null}
      {caseFileOpen ? <CaseFile state={state} objectUrls={sealedAssetObjectUrls} saveState={sealedAssetSaveState} onSaveAsset={saveSealedAsset} onClose={() => setCaseFileOpen(false)} /> : null}
      {theoryOpen || spectatorTheory ? <div className={styles.theoryBoard} role="dialog" aria-modal="true" aria-labelledby="theory-v2-title"><header><div><p className={styles.eyebrow}>{spectatorTheory ? "Prosecutor research · editable" : "Theory Board"}</p><h2 id="theory-v2-title">{spectatorTheory ? "Review the Prosecutor conclusion" : "File the prosecution's case"}</h2></div>{spectatorTheory ? null : <button type="button" onClick={() => setTheoryOpen(false)}>Close</button>}</header>{spectatorTheory ? <p>The selected Prosecutor&apos;s conclusion is a public hypothesis built from the admitted physical findings. You may revise every field before filing it.</p> : null}<label>Accused<select value={theory.culpritSeatId ?? ""} onChange={(event) => setTheory((current) => ({ ...current, culpritSeatId: event.target.value || null }))}>{state.suspects.map((suspect) => <option key={suspect.seatId} value={suspect.seatId}>{suspect.name}</option>)}</select></label><label>Method<textarea value={theory.method} onChange={(event) => setTheory((current) => ({ ...current, method: event.target.value }))} placeholder="How was the crime committed?" /></label><label>Motive<textarea value={theory.motive} onChange={(event) => setTheory((current) => ({ ...current, motive: event.target.value }))} placeholder="Why would the accused do it?" /></label><label>Opportunity<textarea value={theory.opportunity} onChange={(event) => setTheory((current) => ({ ...current, opportunity: event.target.value }))} placeholder="When and where was the opportunity?" /></label><fieldset><legend>Evidence to admit</legend>{admittedRecord.filter((item) => item.reference.kind === "evidence").map((item) => <label key={item.reference.id}><input type="checkbox" checked={theory.evidenceIds.includes(item.reference.id)} onChange={(event) => setTheory((current) => ({ ...current, evidenceIds: event.target.checked ? [...current.evidenceIds, item.reference.id] : current.evidenceIds.filter((id) => id !== item.reference.id) }))} />{item.emoji} {item.title}</label>)}</fieldset><p>Incomplete method, motive, or opportunity will weaken the case, but will not block trial.</p><button type="button" className={styles.primaryAction} disabled={busy || !theory.culpritSeatId} onClick={() => { if (!spectatorTheory) setTheoryOpen(false); void sendAction({ action: "file_theory", theory }); }}>{spectatorTheory ? "File conclusion and watch court" : "File charges and open court"}</button></div> : null}
      {callout ? <div key={callout.id} className={styles.callout} style={calloutStyle} role="status" aria-live="assertive"><span>{CALLOUT_COPY[callout.callout]}</span></div> : null}
      {error ? <p className={styles.errorBanner}>{error}</p> : null}
    </main>
  );
}

function CaseFile(props: {
  state: DebateWhodunnitFormatStateV2;
  objectUrls: Readonly<Record<string, string>>;
  saveState: Record<string, "saving" | "saved" | "failed">;
  onSaveAsset: (
    asset: DebateMysterySealedAssetRefV1,
    subjectId: string,
    title: string,
  ) => Promise<void>;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <aside className={styles.caseFile} role="dialog" aria-modal="true" aria-labelledby="mystery-v2-case-file-title">
      <header><div><p className={styles.eyebrow}>Prosecution record</p><h2 id="mystery-v2-case-file-title">Case File</h2></div><button type="button" onClick={props.onClose}>Close</button></header>
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
      <section><h3>Witnesses</h3>{props.state.suspects.map((suspect) => <article key={suspect.seatId}><span aria-hidden="true" style={{ color: suspect.color ?? undefined }}>●</span><div><strong>{suspect.name}</strong><small>{props.state.metSuspectSeatIds.includes(suspect.seatId) ? "Interviewed" : "Not yet interviewed"}</small></div></article>)}</section>
      <small>{props.state.voicesEnabled ? "Complete local English audio pack ready" : "Playing as a validated text case"}</small>
    </aside>
  );
}
