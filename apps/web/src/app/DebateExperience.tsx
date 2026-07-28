"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DEBATE_SCHEMA_VERSION,
  debateSpokenText,
  type DebateAdvocacyConsent,
  type DebateEventV1,
  type DebateEvidencePacketV1,
  type DebateEvidenceSourceV1,
  type DebateMotionSlateV1,
  type DebateBotSnapshotV1,
  type DebatePlayerRole,
  type DebateSessionListItemV1,
  type DebateSessionV1,
  type DebateSideId,
  type GraphicsQuality,
} from "@localai/shared";
import {
  PrismRefractTarget,
  type PrismRefractMagicTarget,
} from "./prismRefract";
import styles from "./DebateExperience.module.css";
import {
  DebateForumScene,
  type DebateForumRole,
} from "./DebateForumScene";
import {
  copyDebateMotionSlate,
  debatePrefilledCast,
} from "./debateExperienceState";

export interface DebateBotSummary {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  hardMuted: boolean;
}

export interface DebateUtterance {
  event: DebateEventV1;
  sessionId: string;
  speaker: DebateBotSummary | null;
  player: boolean;
  spokenText: string;
  voiceSourceBotId: string | null;
}

export interface DebateExperienceProps {
  bots: DebateBotSummary[];
  initialBotIds?: string[];
  preferredProvider: "local" | "openai" | "anthropic";
  graphicsQuality: GraphicsQuality;
  theme: "light" | "dark";
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  onExit: () => void;
  onResetTutorial?: () => void;
  onUtterance?: (utterance: DebateUtterance) => Promise<boolean>;
  onStopUtterance?: () => void;
}

type SetupStep = "motion" | "cast" | "evidence" | "review";
type DebateView = "lobby" | "setup" | "live";

const EMPTY_SLATE: DebateMotionSlateV1 = {
  version: DEBATE_SCHEMA_VERSION,
  id: "custom-motion",
  motion: "",
  forSide: { label: "For", brief: "" },
  againstSide: { label: "Against", brief: "" },
};

const EMPTY_EVIDENCE: DebateEvidencePacketV1 = {
  version: DEBATE_SCHEMA_VERSION,
  notes: "",
  sources: [],
  frozenAt: null,
};

const SETUP_STEPS: Array<{ id: SetupStep; label: string }> = [
  { id: "motion", label: "Motion" },
  { id: "cast", label: "Cast & Role" },
  { id: "evidence", label: "Evidence" },
  { id: "review", label: "Review" },
];

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
  return `${session.phase.charAt(0).toUpperCase()}${session.phase.slice(1)}`;
}

function roleDescription(role: DebatePlayerRole): string {
  if (role === "judge") {
    return "Ask one challenge and make the final ruling. Bot ballots become an agreement and dissent epilogue.";
  }
  if (role === "participant") {
    return "Take the Challenge and Rebuttal slots for one side. Your bot partner opens and closes.";
  }
  return "Watch the moderator challenge both advocates. The three-bot majority decides the verdict.";
}

function visibleEventName(
  session: DebateSessionV1,
  event: DebateEventV1,
): string {
  if (event.speakerKind === "player") return "You";
  if (event.speakerBotId === session.moderator.id) return session.moderator.name;
  if (event.speakerBotId === session.forAdvocate.id) {
    return session.forAdvocate.name;
  }
  if (event.speakerBotId === session.againstAdvocate.id) {
    return session.againstAdvocate.name;
  }
  return "Forum";
}

function sourceMap(
  evidence: DebateEvidencePacketV1,
): Map<string, DebateEvidenceSourceV1> {
  return new Map(evidence.sources.map((source) => [source.id, source]));
}

function statementParts(
  content: string,
  evidence: DebateEvidencePacketV1,
  onSource: (id: string) => void,
): ReactNode[] {
  const sources = sourceMap(evidence);
  const parts: ReactNode[] = [];
  let cursor = 0;
  const expression = /\[\[source:([a-z0-9][a-z0-9_-]{0,47})\]\]/giu;
  for (const match of content.matchAll(expression)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(content.slice(cursor, index));
    const id = match[1]?.toLowerCase() ?? "";
    const source = sources.get(id);
    if (source) {
      parts.push(
        <button
          type="button"
          className={styles.sourceChip}
          key={`${id}-${index}`}
          onClick={() => onSource(id)}
          aria-label={`Open source ${source.title}`}
        >
          {id}
        </button>,
      );
    }
    cursor = index + match[0].length;
  }
  if (cursor < content.length) parts.push(content.slice(cursor));
  return parts;
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
  return null;
}

function debateBotPresentation(
  session: DebateSessionV1,
  bot: DebateBotSnapshotV1,
  beforeSequence = Number.POSITIVE_INFINITY,
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
  const cast = [session.moderator, session.forAdvocate, session.againstAdvocate];
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
        stableIndex(`${session.id}:${bot.id}:false-name`, DEBATE_FALSE_NAMES.length)
      ]
    : null;
  const visibilityEffect = effects.find(
    (effect) => effect.type === "avatar_visibility",
  );
  const scaleEffect = effects.find((effect) => effect.type === "avatar_scale");
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
      visibilityEffect?.type === "avatar_visibility"
        ? visibilityEffect.mode
        : "visible",
    scale:
      scaleEffect?.type === "avatar_scale" ? scaleEffect.mode : "normal",
    colorCycle: effects.some(
      (effect) => effect.type === "avatar_color_cycle",
    ),
  };
}

export function DebateExperience(
  props: DebateExperienceProps,
): React.JSX.Element {
  const {
    bots,
    onStopUtterance,
    onUtterance,
    preferredProvider,
    request,
  } = props;
  const [view, setView] = useState<DebateView>("lobby");
  const [setupStep, setSetupStep] = useState<SetupStep>("motion");
  const [sessions, setSessions] = useState<DebateSessionListItemV1[]>([]);
  const [activeSession, setActiveSession] = useState<DebateSessionV1 | null>(
    null,
  );
  const [topic, setTopic] = useState("");
  const [slates, setSlates] = useState<DebateMotionSlateV1[]>([]);
  const [motion, setMotion] = useState<DebateMotionSlateV1>(EMPTY_SLATE);
  const [cast, setCast] = useState(() =>
    debatePrefilledCast(props.initialBotIds),
  );
  const [playerRole, setPlayerRole] = useState<DebatePlayerRole>("judge");
  const [playerSideId, setPlayerSideId] = useState<DebateSideId>("for");
  const [roleChecks, setRoleChecks] = useState<DebateAdvocacyConsent[]>([]);
  const [evidence, setEvidence] =
    useState<DebateEvidencePacketV1>(EMPTY_EVIDENCE);
  const [researchQuery, setResearchQuery] = useState("");
  const [playerDraft, setPlayerDraft] = useState("");
  const [judgeTarget, setJudgeTarget] = useState<DebateSideId>("for");
  const [sourceDrawerId, setSourceDrawerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutationCounterRef = useRef(0);
  const mountedRef = useRef(true);

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
    };
  }, [loadSessions, onStopUtterance]);

  const botById = useMemo(
    () => new Map(bots.map((bot) => [bot.id, bot])),
    [bots],
  );
  const selectedSource = sourceDrawerId
    ? activeSession?.evidence.sources.find(
        (source) => source.id === sourceDrawerId,
      ) ??
      evidence.sources.find((source) => source.id === sourceDrawerId) ??
      null
    : null;
  const castIds = [cast.moderator, cast.forAdvocate, cast.againstAdvocate];
  const castComplete =
    castIds.every(Boolean) && new Set(castIds).size === castIds.length;
  const motionComplete = Boolean(
    motion.motion.trim() &&
      motion.forSide.label.trim() &&
      motion.forSide.brief.trim() &&
      motion.againstSide.label.trim() &&
      motion.againstSide.brief.trim(),
  );
  const moderatorMuted = botById.get(cast.moderator)?.hardMuted === true;
  const mutedAdvocates = [cast.forAdvocate, cast.againstAdvocate]
    .map((id) => botById.get(id))
    .filter((bot): bot is DebateBotSummary => bot?.hardMuted === true);
  const declinedChecks = roleChecks.filter((check) => check.status === "decline");

  const startNewDebate = (): void => {
    setView("setup");
    setSetupStep("motion");
    setActiveSession(null);
    setTopic("");
    setSlates([]);
    setMotion(EMPTY_SLATE);
    setCast(debatePrefilledCast(props.initialBotIds));
    setPlayerRole("judge");
    setPlayerSideId("for");
    setRoleChecks([]);
    setEvidence(EMPTY_EVIDENCE);
    setResearchQuery("");
    setPlayerDraft("");
    setError(null);
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
          preferredProvider,
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
  }, [busy, preferredProvider, request, topic]);

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
    if (!castComplete || moderatorMuted) return false;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ checks: DebateAdvocacyConsent[] }>(
        "/api/debates/role-checks",
        requestBody({
          motion,
          forAdvocateBotId: cast.forAdvocate,
          againstAdvocateBotId: cast.againstAdvocate,
          preferredProvider: props.preferredProvider,
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

  const continueFromCast = async (): Promise<void> => {
    if (await checkRoles()) setSetupStep("evidence");
  };

  const swapAdvocates = (): void => {
    setCast((current) => ({
      ...current,
      forAdvocate: current.againstAdvocate,
      againstAdvocate: current.forAdvocate,
    }));
    setRoleChecks([]);
  };

  const research = async (): Promise<void> => {
    if (!researchQuery.trim() || props.preferredProvider === "local") return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{
        sources: DebateEvidenceSourceV1[];
      }>(
        "/api/debates/research",
        requestBody({
          query: researchQuery,
          preferredProvider: props.preferredProvider,
        }),
      );
      setEvidence((current) => ({
        ...current,
        sources: result.sources.slice(0, 12),
      }));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Research was unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };

  const consumeNewEvents = useCallback(
    async (
      previous: DebateSessionV1 | null,
      next: DebateSessionV1,
    ): Promise<void> => {
      const previousSequence = previous?.events.at(-1)?.sequence ?? 0;
      const fresh = next.events.filter(
        (event) =>
          event.sequence > previousSequence &&
          (event.kind === "speech" ||
            event.kind === "silence" ||
            event.kind === "player_turn" ||
            event.kind === "reaction" ||
            event.kind === "ballot" ||
            (event.kind === "verdict" && event.speakerKind === "player")),
      );
      for (const event of fresh) {
        if (event.kind === "silence") {
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          continue;
        }
        if (
          event.kind === "ballot" &&
          next.ballots.find(
            (ballot) => ballot.voterBotId === event.speakerBotId,
          )?.privateReason
        ) {
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          continue;
        }
        const speaker = event.speakerBotId
          ? (bots.find((bot) => bot.id === event.speakerBotId) ?? null)
          : null;
        const spokenText = debateSpokenText(event.content);
        const snapshot = debateBotSnapshot(next, event.speakerBotId);
        const played = await onUtterance?.({
          event,
          sessionId: next.id,
          speaker,
          player: event.speakerKind === "player",
          spokenText,
          voiceSourceBotId: snapshot
            ? debateBotPresentation(next, snapshot, event.sequence)
                .voiceSourceBotId
            : null,
        });
        if (!played) {
          const revealMs = Math.min(
            4_800,
            Math.max(900, Math.round(spokenText.length * 24)),
          );
          await new Promise((resolve) => window.setTimeout(resolve, revealMs));
        }
      }
    },
    [bots, onUtterance],
  );

  const adoptSession = useCallback(
    async (
      previous: DebateSessionV1 | null,
      next: DebateSessionV1,
    ): Promise<void> => {
      setActiveSession(next);
      await consumeNewEvents(previous, next);
      void loadSessions();
    },
    [consumeNewEvents, loadSessions],
  );

  const openSession = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(id)}`,
      );
      setActiveSession(result.session);
      setView("live");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Debate not found.");
    } finally {
      setBusy(false);
    }
  };

  const startDebate = async (): Promise<void> => {
    if (!motionComplete || !castComplete || roleChecks.length !== 2) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        "/api/debates",
        requestBody({
          motion,
          evidence,
          moderatorBotId: cast.moderator,
          forAdvocateBotId: cast.forAdvocate,
          againstAdvocateBotId: cast.againstAdvocate,
          playerRole,
          playerSideId: playerRole === "participant" ? playerSideId : null,
          advocacyConsent: roleChecks,
          preferredProvider: props.preferredProvider,
          theme: props.theme,
          idempotencyKey: nextMutationKey("create"),
        }),
      );
      setView("live");
      await adoptSession(null, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The Debate could not start.",
      );
    } finally {
      setBusy(false);
    }
  };

  const advance = useCallback(
    async (skip = false): Promise<void> => {
      const previous = activeSession;
      if (!previous || busy) return;
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
        await adoptSession(previous, result.session);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "The turn was unavailable.",
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
      request,
    ],
  );

  useEffect(() => {
    if (
      view !== "live" ||
      !activeSession ||
      activeSession.status !== "live" ||
      busy
    ) {
      return;
    }
    const timer = window.setTimeout(() => void advance(false), 520);
    return () => window.clearTimeout(timer);
  }, [activeSession, advance, busy, view]);

  const submitPlayerTurn = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const previous = activeSession;
    if (!previous || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/player-turn`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("player-turn"),
          content: playerDraft,
          targetSideId:
            previous.stepKey === "challenge_judge_question"
              ? judgeTarget
              : undefined,
        }),
      );
      setPlayerDraft("");
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Your turn could not be saved.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
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
      setPlayerDraft("");
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pass was unavailable.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const submitVerdict = async (sideId: DebateSideId): Promise<void> => {
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
          reason: playerDraft,
        }),
      );
      setPlayerDraft("");
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The verdict was unavailable.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const pauseOrResume = async (): Promise<void> => {
    const previous = activeSession;
    if (!previous || busy) return;
    const resume = previous.status === "paused";
    if (!resume) props.onStopUtterance?.();
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
      setActiveSession(result.session);
      void loadSessions();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `${resume ? "Resume" : "Pause"} was unavailable.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteSession = async (
    session: DebateSessionListItemV1,
  ): Promise<void> => {
    if (
      !window.confirm(
        `Delete “${session.motion}”? It will leave Debate history immediately and remain recoverable through Undo for 30 days.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await props.request(`/api/debates/${encodeURIComponent(session.id)}`, {
        method: "DELETE",
        body: JSON.stringify({
          expectedRevision: (
            await props.request<{ session: DebateSessionV1 }>(
              `/api/debates/${encodeURIComponent(session.id)}`,
            )
          ).session.revision,
          idempotencyKey: nextMutationKey("delete"),
        }),
      });
      if (activeSession?.id === session.id) {
        setActiveSession(null);
        setView("lobby");
      }
      await loadSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete was unavailable.");
    } finally {
      setBusy(false);
    }
  };

  const renderLobby = (): React.JSX.Element => (
    <main
      className={styles.lobby}
      data-debate-surface="lobby"
      data-theme={props.theme}
    >
      <header className={styles.lobbyHeader}>
        <button type="button" className={styles.exitButton} onClick={props.onExit}>
          ← Home
        </button>
        <div>
          <p className={styles.eyebrow}>Debate · v0.1 Preview</p>
          <h1>The Prismatic Forum</h1>
          <p>
            An 8–12 minute Duel: one moderator, two advocates, frozen evidence,
            and a verdict without scorekeeping.
          </p>
        </div>
        <div className={styles.lobbyActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={startNewDebate}
            disabled={props.bots.length < 3}
            data-tutorial-target="debate-new"
          >
            New Debate
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
      {props.bots.length < 3 ? (
        <p className={styles.notice} role="status">
          Create at least three Library bots to enter the Forum.
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <section className={styles.historySection}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Saved proceedings</p>
            <h2>Resume or reopen</h2>
          </div>
          <button type="button" onClick={() => void loadSessions()} disabled={busy}>
            Refresh
          </button>
        </div>
        {sessions.length === 0 ? (
          <div className={styles.emptyHistory}>
            <span aria-hidden="true">◇</span>
            <p>No Duels yet. The first motion is waiting.</p>
          </div>
        ) : (
          <ul className={styles.sessionList}>
            {sessions.map((session) => (
              <li key={session.id} data-status={session.status}>
                <button
                  type="button"
                  className={styles.sessionOpen}
                  onClick={() => void openSession(session.id)}
                  disabled={busy}
                >
                  <strong>{session.motion}</strong>
                  <span>
                    {sessionStatusLabel(session)} · {session.playerRole}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => void deleteSession(session)}
                  aria-label={`Delete ${session.motion}`}
                  disabled={busy}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );

  const renderMotionStep = (): React.JSX.Element => (
    <div className={styles.setupPanel}>
      <div className={styles.setupCopy}>
        <p className={styles.eyebrow}>Step 1</p>
        <h2>Shape the motion</h2>
        <p>
          Start from a topic, then choose one of three balanced slates or edit
          every field yourself.
        </p>
      </div>
      <label className={styles.field}>
        <span>Topic</span>
        <textarea
          value={topic}
          onChange={(event) => setTopic(event.currentTarget.value)}
          placeholder="Housing near transit, whether art can be separated from its creator…"
          rows={3}
        />
      </label>
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
            {busy ? "Synthesizing…" : "Synthesize options"}
            <small>Wield Prism or press the button</small>
          </button>
        )}
      </PrismRefractTarget>
      {slates.length > 0 ? (
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
      <div className={styles.motionEditor}>
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
        {(["for", "against"] as const).map((sideId) => {
          const side = sideId === "for" ? motion.forSide : motion.againstSide;
          return (
            <div className={styles.sideEditor} key={sideId} data-side={sideId}>
              <label className={styles.field}>
                <span>{sideId === "for" ? "For" : "Against"} label</span>
                <input
                  value={side.label}
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
              <label className={styles.field}>
                <span>{sideId === "for" ? "For" : "Against"} brief</span>
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
            </div>
          );
        })}
      </div>
      <div className={styles.setupActions}>
        <span />
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!motionComplete}
          onClick={() => setSetupStep("cast")}
        >
          Continue to cast
        </button>
      </div>
    </div>
  );

  const renderCastStep = (): React.JSX.Element => (
    <div className={styles.setupPanel}>
      <div className={styles.setupCopy}>
        <p className={styles.eyebrow}>Step 2</p>
        <h2>Cast the Duel</h2>
        <p>
          Exactly three owned bots. Advocacy checks are private and bound to
          this exact motion and bot revision.
        </p>
      </div>
      <div className={styles.castGrid}>
        {(
          [
            ["moderator", "Moderator"],
            ["forAdvocate", motion.forSide.label || "For advocate"],
            ["againstAdvocate", motion.againstSide.label || "Against advocate"],
          ] as const
        ).map(([key, label]) => (
          <label className={styles.field} key={key}>
            <span>{label}</span>
            <select
              value={cast[key]}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setCast((current) => ({
                  ...current,
                  [key]: value,
                }));
                setRoleChecks([]);
              }}
            >
              <option value="">Choose a bot</option>
              {props.bots.map((bot) => (
                <option
                  key={bot.id}
                  value={bot.id}
                  disabled={
                    castIds.includes(bot.id) && cast[key] !== bot.id
                  }
                >
                  {bot.name}
                  {bot.hardMuted ? " · hard-muted" : ""}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {moderatorMuted ? (
        <p className={styles.error} role="alert">
          A hard-muted bot cannot moderate. Its Power remains canonical; choose
          another moderator.
        </p>
      ) : null}
      <fieldset className={styles.rolePicker}>
        <legend>Your role</legend>
        {(["judge", "participant", "spectator"] as const).map((role) => (
          <label key={role} data-selected={playerRole === role ? "true" : undefined}>
            <input
              type="radio"
              name="debate-player-role"
              value={role}
              checked={playerRole === role}
              onChange={() => setPlayerRole(role)}
            />
            <strong>{role.charAt(0).toUpperCase() + role.slice(1)}</strong>
            <span>{roleDescription(role)}</span>
          </label>
        ))}
      </fieldset>
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
      {roleChecks.length > 0 ? (
        <div className={styles.consentList}>
          {roleChecks.map((check) => {
            const bot = botById.get(check.botId);
            return (
              <article key={check.botId} data-status={check.status}>
                <div>
                  <strong>{bot?.name ?? check.botId}</strong>
                  <span>{check.sideId === "for" ? motion.forSide.label : motion.againstSide.label}</span>
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
            <button type="button" onClick={() => setSetupStep("motion")}>
              Revise motion
            </button>
          </div>
        </div>
      ) : null}
      <div className={styles.setupActions}>
        <button type="button" onClick={() => setSetupStep("motion")}>
          Back
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!castComplete || moderatorMuted || busy}
          onClick={() => void continueFromCast()}
          data-tutorial-target="debate-consent"
        >
          {busy ? "Checking privately…" : "Check roles & continue"}
        </button>
      </div>
    </div>
  );

  const renderEvidenceStep = (): React.JSX.Element => (
    <div className={styles.setupPanel}>
      <div className={styles.setupCopy}>
        <p className={styles.eyebrow}>Step 3</p>
        <h2>Freeze the prep packet</h2>
        <p>
          Every participant receives the same immutable evidence. No one can
          search after Start.
        </p>
      </div>
      <label className={styles.fieldWide}>
        <span>Player notes</span>
        <textarea
          value={evidence.notes}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setEvidence((current) => ({
              ...current,
              notes: value,
            }));
          }}
          placeholder="Facts, definitions, constraints, or context you want all three bots to share."
          rows={8}
        />
      </label>
      <div className={styles.researchBox}>
        <label className={styles.field}>
          <span>Optional Brave Search</span>
          <input
            value={researchQuery}
            onChange={(event) => setResearchQuery(event.currentTarget.value)}
            placeholder="Search for frozen public evidence"
            disabled={props.preferredProvider === "local"}
          />
        </label>
        <button
          type="button"
          onClick={() => void research()}
          disabled={
            props.preferredProvider === "local" ||
            !researchQuery.trim() ||
            busy
          }
        >
          Search once
        </button>
        {props.preferredProvider === "local" ? (
          <p>
            LOCAL blocks Brave before network access. Player notes and local
            motion synthesis remain available.
          </p>
        ) : (
          <p>Search is explicit and ends permanently when the Duel starts.</p>
        )}
      </div>
      {evidence.sources.length > 0 ? (
        <ul className={styles.evidenceList}>
          {evidence.sources.map((source) => (
            <li key={source.id}>
              <button type="button" onClick={() => setSourceDrawerId(source.id)}>
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
      <div className={styles.setupActions}>
        <button type="button" onClick={() => setSetupStep("cast")}>
          Back
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => setSetupStep("review")}
          data-tutorial-target="debate-evidence"
        >
          Review frozen Duel
        </button>
      </div>
    </div>
  );

  const renderReviewStep = (): React.JSX.Element => (
    <div className={styles.setupPanel}>
      <div className={styles.setupCopy}>
        <p className={styles.eyebrow}>Step 4</p>
        <h2>Review the proceeding</h2>
        <p>
          Start freezes the cast, model choices, Power plan, consent results,
          motion, and evidence.
        </p>
      </div>
      <div className={styles.reviewGrid}>
        <article>
          <span>Motion</span>
          <strong>{motion.motion}</strong>
          <p>
            {motion.forSide.label} ↔ {motion.againstSide.label}
          </p>
        </article>
        <article>
          <span>Cast</span>
          <strong>{botById.get(cast.moderator)?.name} · Moderator</strong>
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
              : roleDescription(playerRole)}
          </p>
        </article>
        <article>
          <span>Evidence</span>
          <strong>
            {evidence.sources.length} source
            {evidence.sources.length === 1 ? "" : "s"}
          </strong>
          <p>{evidence.notes ? "Player notes included" : "No player notes"}</p>
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
        <button type="button" onClick={() => setSetupStep("evidence")}>
          Back
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={busy || declinedChecks.length > 0}
          onClick={() => void startDebate()}
          data-tutorial-target="debate-start"
        >
          {busy ? "Freezing the Forum…" : "Start Duel"}
        </button>
      </div>
    </div>
  );

  const renderSetup = (): React.JSX.Element => (
    <main
      className={styles.setup}
      data-debate-surface="setup"
      data-theme={props.theme}
    >
      <header className={styles.setupHeader}>
        <button
          type="button"
          className={styles.exitButton}
          onClick={() => setView("lobby")}
        >
          ← Lobby
        </button>
        <div>
          <p className={styles.eyebrow}>New Duel</p>
          <h1>The Prismatic Forum</h1>
        </div>
        <span className={styles.privacyBadge}>
          {props.preferredProvider === "local" ? "LOCAL · no egress" : "ONLINE"}
        </span>
      </header>
      <nav className={styles.stepNav} aria-label="Debate setup">
        {SETUP_STEPS.map((step, index) => (
          <button
            type="button"
            key={step.id}
            data-active={setupStep === step.id ? "true" : undefined}
            onClick={() => {
              const targetIndex = SETUP_STEPS.findIndex(
                (candidate) => candidate.id === setupStep,
              );
              if (index <= targetIndex) setSetupStep(step.id);
            }}
          >
            <span>{index + 1}</span>
            {step.label}
          </button>
        ))}
      </nav>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {setupStep === "motion"
        ? renderMotionStep()
        : setupStep === "cast"
          ? renderCastStep()
          : setupStep === "evidence"
            ? renderEvidenceStep()
            : renderReviewStep()}
      {selectedSource ? (
        <aside className={styles.sourceDrawer} aria-label="Evidence source">
          <button type="button" onClick={() => setSourceDrawerId(null)}>
            Close
          </button>
          <span>{selectedSource.id}</span>
          <h2>{selectedSource.title}</h2>
          <p>{selectedSource.snippet}</p>
          {selectedSource.publishedAt ? (
            <small>{selectedSource.publishedAt}</small>
          ) : null}
          <a href={selectedSource.url} target="_blank" rel="noreferrer">
            Open original source
          </a>
        </aside>
      ) : null}
    </main>
  );

  const renderCaseBoard = (
    session: DebateSessionV1,
  ): React.JSX.Element => (
    <aside
      className={styles.caseBoard}
      aria-label="Living case board"
      data-tutorial-target="debate-case-board"
    >
      <header>
        <p className={styles.eyebrow}>Living case board</p>
        <span>Scoreless · public speech only</span>
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
              {session.caseBoard
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

  const renderPlayerWindow = (
    session: DebateSessionV1,
  ): React.JSX.Element | null => {
    if (session.status !== "waiting_for_player") return null;
    if (session.stepKey === "verdict_player") {
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
    return (
      <form className={styles.playerWindow} onSubmit={submitPlayerTurn}>
        <p className={styles.eyebrow}>Your floor</p>
        <h2>
          {session.stepKey === "challenge_judge_question"
            ? "Ask one side a question"
            : session.phase === "challenge"
              ? "Answer the moderator’s challenge"
              : "Deliver your rebuttal"}
        </h2>
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
          placeholder="Speak plainly. You can cite frozen evidence with [[source:id]]."
          rows={4}
          autoFocus
        />
        <div>
          <button type="button" onClick={() => void passPlayerTurn()} disabled={busy}>
            Pass to partner
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

  const renderTranscript = (
    session: DebateSessionV1,
  ): React.JSX.Element => (
    <section className={styles.transcript} aria-label="Debate transcript">
      {session.events
        .filter((event) => event.kind !== "case_board")
        .map((event) => (
          <article
            key={event.id}
            data-kind={event.kind}
            data-side={event.sideId ?? undefined}
          >
            <header>
              <strong>{visibleEventName(session, event)}</strong>
              <span>
                {event.kind.replace("_", " ")} · {event.phase}
              </span>
            </header>
            <p>
              {statementParts(event.content, session.evidence, setSourceDrawerId)}
            </p>
          </article>
        ))}
      {busy ? (
        <div className={styles.turnPending} role="status">
          <span />
          <span />
          <span />
          The Forum is preparing the next turn
        </div>
      ) : null}
    </section>
  );

  const renderLive = (): React.JSX.Element => {
    if (!activeSession) return renderLobby();
    const session = activeSession;
    const activeEvent =
      [...session.events]
        .reverse()
        .find(
          (event) =>
            [
              "intro",
              "speech",
              "silence",
              "player_turn",
              "reaction",
              "ballot",
            ].includes(event.kind) ||
            (event.kind === "verdict" && event.speakerKind === "player"),
        ) ?? null;
    const activeSpeakerId = activeEvent?.speakerBotId ?? null;
    const activeColor =
      activeSpeakerId === session.moderator.id
        ? session.moderator.color
        : activeSpeakerId === session.forAdvocate.id
          ? session.forAdvocate.color
          : activeSpeakerId === session.againstAdvocate.id
            ? session.againstAdvocate.color
            : null;
    const activeRole: DebateForumRole | null =
      activeSpeakerId === session.moderator.id
        ? "moderator"
        : activeSpeakerId === session.forAdvocate.id
          ? "for"
          : activeSpeakerId === session.againstAdvocate.id
            ? "against"
            : null;
    const forPresentation = debateBotPresentation(
      session,
      session.forAdvocate,
    );
    const againstPresentation = debateBotPresentation(
      session,
      session.againstAdvocate,
    );
    const moderatorPresentation = debateBotPresentation(
      session,
      session.moderator,
    );
    return (
      <main
        className={styles.live}
        data-debate-surface="live"
        data-theme={props.theme}
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
              setView("lobby");
              setActiveSession(null);
              void loadSessions();
            }}
          >
            ← Lobby
          </button>
          <div>
            <p className={styles.eyebrow}>
              {phaseLabel(session)} · {session.playerRole}
            </p>
            <h1>{session.motion.motion}</h1>
          </div>
          <div className={styles.liveControls}>
            {session.status !== "completed" ? (
              <button
                type="button"
                onClick={() => void pauseOrResume()}
                disabled={busy}
              >
                {session.status === "paused" ? "Resume" : "Pause"}
              </button>
            ) : null}
            <span>
              {props.preferredProvider === "local"
                ? "LOCAL"
                : props.preferredProvider.toUpperCase()}
            </span>
          </div>
        </header>
        <div className={styles.forum}>
          <div className={styles.receiverMatte} aria-hidden="true" />
          <DebateForumScene
            activeRole={activeRole}
            forColor={session.forAdvocate.color}
            againstColor={session.againstAdvocate.color}
            moderatorColor={session.moderator.color}
            graphicsQuality={props.graphicsQuality}
            live={session.status === "live"}
            theme={props.theme}
          />
          <div className={styles.lightMaskFor} aria-hidden="true" />
          <div className={styles.lightMaskAgainst} aria-hidden="true" />
          <div className={styles.lightMaskModerator} aria-hidden="true" />
          <div className={styles.botPosition} data-role="for">
            <div
              className={styles.botPlate}
              data-speaking={
                activeSpeakerId === session.forAdvocate.id ? "true" : undefined
              }
              data-visibility={forPresentation.visibility}
              data-scale={forPresentation.scale}
              data-color-cycle={
                forPresentation.colorCycle ? "true" : undefined
              }
            >
              <span>{forPresentation.glyph || "◆"}</span>
              <strong>{forPresentation.displayName}</strong>
              <small>{session.motion.forSide.label}</small>
              {forPresentation.identityLabel ? (
                <em>{forPresentation.identityLabel}</em>
              ) : null}
              {session.advocacyConsent.find(
                (check) =>
                  check.botId === session.forAdvocate.id &&
                  check.status === "devils_advocate",
              ) ? (
                <b>Devil’s Advocate</b>
              ) : null}
            </div>
          </div>
          <div className={styles.botPosition} data-role="moderator">
            <div
              className={styles.botPlate}
              data-speaking={
                activeSpeakerId === session.moderator.id ? "true" : undefined
              }
              data-visibility={moderatorPresentation.visibility}
              data-scale={moderatorPresentation.scale}
              data-color-cycle={
                moderatorPresentation.colorCycle ? "true" : undefined
              }
            >
              <span>{moderatorPresentation.glyph || "◇"}</span>
              <strong>{moderatorPresentation.displayName}</strong>
              <small>Moderator</small>
              {moderatorPresentation.identityLabel ? (
                <em>{moderatorPresentation.identityLabel}</em>
              ) : null}
            </div>
          </div>
          <div className={styles.botPosition} data-role="against">
            <div
              className={styles.botPlate}
              data-speaking={
                activeSpeakerId === session.againstAdvocate.id
                  ? "true"
                  : undefined
              }
              data-visibility={againstPresentation.visibility}
              data-scale={againstPresentation.scale}
              data-color-cycle={
                againstPresentation.colorCycle ? "true" : undefined
              }
            >
              <span>{againstPresentation.glyph || "◆"}</span>
              <strong>{againstPresentation.displayName}</strong>
              <small>{session.motion.againstSide.label}</small>
              {againstPresentation.identityLabel ? (
                <em>{againstPresentation.identityLabel}</em>
              ) : null}
              {session.advocacyConsent.find(
                (check) =>
                  check.botId === session.againstAdvocate.id &&
                  check.status === "devils_advocate",
              ) ? (
                <b>Devil’s Advocate</b>
              ) : null}
            </div>
          </div>
          {session.playerRole === "judge" ? (
            <div className={styles.playerPresence} data-role="judge">
              <span>◇</span>
              Judge
            </div>
          ) : session.playerRole === "participant" ? (
            <div
              className={styles.playerPresence}
              data-role="participant"
              data-side={session.playerSideId ?? undefined}
            >
              <span>◇</span>
              You
            </div>
          ) : null}
          <div className={styles.motionPlinth}>
            <span>The motion</span>
            <strong>{session.motion.motion}</strong>
          </div>
        </div>
        <div className={styles.proceedings}>
          {renderCaseBoard(session)}
          <div className={styles.transcriptColumn}>
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
                  <button
                    type="button"
                    onClick={() => void advance(true)}
                    disabled={busy}
                  >
                    Skip without dialogue
                  </button>
                </div>
              </div>
            ) : null}
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            {renderTranscript(session)}
            {renderPlayerWindow(session)}
            {session.status === "completed" ? (
              <section className={styles.resultCard}>
                <p className={styles.eyebrow}>Verdict</p>
                <h2>
                  {session.winnerSideId === "for"
                    ? session.motion.forSide.label
                    : session.motion.againstSide.label}
                </h2>
                <p>
                  {session.playerRole === "judge"
                    ? "Your ruling is final. The bot ballots below show agreement and dissent."
                    : "The three-bot majority decided the Duel."}
                </p>
                <ul>
                  {session.ballots.map((ballot) => {
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
                <button type="button" onClick={() => setView("lobby")}>
                  Return to lobby
                </button>
              </section>
            ) : null}
          </div>
        </div>
        {selectedSource ? (
          <aside className={styles.sourceDrawer} aria-label="Evidence source">
            <button type="button" onClick={() => setSourceDrawerId(null)}>
              Close
            </button>
            <span>{selectedSource.id}</span>
            <h2>{selectedSource.title}</h2>
            <p>{selectedSource.snippet}</p>
            {selectedSource.publishedAt ? (
              <small>{selectedSource.publishedAt}</small>
            ) : null}
            <a href={selectedSource.url} target="_blank" rel="noreferrer">
              Open original source
            </a>
          </aside>
        ) : null}
      </main>
    );
  };

  if (view === "setup") return renderSetup();
  if (view === "live") return renderLive();
  return renderLobby();
}
