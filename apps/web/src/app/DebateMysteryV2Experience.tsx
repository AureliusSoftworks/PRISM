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
  type DebateMysteryActionRequestV2,
  type DebateMysteryCompilationStageV2,
  type DebateMysteryRecordReferenceV2,
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
import { routeAudioElementToPrismOutput } from "./replayAudioMasterCapture";
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
      blinkEnabled?: boolean;
      facing?: "left" | "right";
    },
  ) => ReactNode;
}

interface V2ExperienceProps extends V2SharedProps {
  session: DebateSessionV1;
  onSessionChange: (session: DebateSessionV1) => void;
  onExit: () => void;
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

function recordKey(reference: DebateMysteryRecordReferenceV2): string {
  return `${reference.kind}:${reference.id}`;
}

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

  const currentIndex = state.compilation.stage === "complete"
    ? FORGE_STAGES.length - 1
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
        <h1>Preparing a prosecution turnabout</h1>
        <p className={styles.forgeMessage}>{state.compilation.spoilerSafeMessage}</p>
        <div className={styles.progressTrack} aria-label={`Case preparation ${percent}% complete`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <ol className={styles.forgeStages}>
          {FORGE_STAGES.map((entry, index) => (
            <li key={entry.id} data-state={index < currentIndex ? "complete" : index === currentIndex ? "active" : "waiting"}>
              <span aria-hidden="true">{index < currentIndex ? "✓" : index + 1}</span>
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
        {state.compilation.stage === "needs_attention" ? (
          <div className={styles.forgeActions}>
            <button type="button" onClick={() => void retry()} disabled={busy || !state.compilation.retryable}>Retry preparation</button>
            {state.localAudioFailure ? <button type="button" onClick={() => void continueSilently()} disabled={busy}>Continue without voices</button> : null}
            <button type="button" onClick={props.onExit}>Return to setup</button>
          </div>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    </main>
  );
}

export function DebateMysteryV2Play(props: V2ExperienceProps): React.JSX.Element {
  const state = props.session.formatState as DebateWhodunnitFormatStateV2;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState<"move" | "examine" | "talk" | "present" | null>(null);
  const [caseFileOpen, setCaseFileOpen] = useState(false);
  const [theoryOpen, setTheoryOpen] = useState(false);
  const [theory, setTheory] = useState<DebateMysteryTheoryV1>(() => emptyTheory(state));
  const mutationIndexRef = useRef(0);
  const lastPlayedLineIdRef = useRef<string | null>(null);
  const lastCalloutIdRef = useRef<string | null>(null);
  const currentRoom = state.rooms.find((room) => room.id === state.currentRoomId) ?? null;
  const currentSuspect = state.suspects.find((suspect) => suspect.roomId === currentRoom?.id) ?? null;
  const currentBot = botForSeat(props, state, currentSuspect?.seatId);
  const lastDialogue = state.dialogueHistory.at(-1) ?? null;
  const dialogueBot = botForSeat(props, state, lastDialogue?.speakerSeatId);
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
  const botById = useMemo(() => new Map(props.bots.map((bot) => [bot.id, bot])), [props.bots]);

  const sendAction = useCallback(async (action: V2ClientAction): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
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
      props.onSessionChange(result.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }, [busy, props]);

  useEffect(() => {
    const lineId = lastDialogue?.lineId ?? (
      state.playPhase === "trial" ? activeStatement?.lineId ?? null : null
    );
    if (!lineId || !state.voicesEnabled || !props.audioEnabled || props.audioVolume <= 0) return;
    if (lastPlayedLineIdRef.current === lineId) return;
    lastPlayedLineIdRef.current = lineId;
    const audio = new Audio(
      `/api/debates/${encodeURIComponent(props.session.id)}/mystery-audio/${encodeURIComponent(lineId)}`,
    );
    audio.volume = Math.max(0, Math.min(1, props.audioVolume));
    const releaseOutput = routeAudioElementToPrismOutput(audio);
    void audio.play().catch(() => undefined);
    return () => {
      audio.pause();
      releaseOutput?.();
    };
  }, [activeStatement?.lineId, lastDialogue?.lineId, props.audioEnabled, props.audioVolume, props.session.id, state.playPhase, state.voicesEnabled]);

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
    setTheory(emptyTheory(state));
  }, [state.theory, state.suspects]);

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
        <button type="button" className={styles.primaryAction} disabled={busy} onClick={() => void sendAction({ action: "move" })}>Begin Case</button>
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
          {retryable ? <button type="button" className={styles.primaryAction} disabled={busy} onClick={() => void sendAction({ action: "retry_witness_checkpoint" })}>Retry current witness</button> : null}
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
          <div><p className={styles.eyebrow}>{state.caseTitle}</p><strong>Prosecution · Cross-Examination</strong></div>
          <button type="button" onClick={() => setCaseFileOpen(true)} data-tutorial-target="mystery-v2-case-file">Case File</button>
        </header>
        <div className={styles.credibility} aria-label={`${state.court.credibilityRemaining} of ${state.court.credibilityMaximum} credibility remaining`}>
          <span>Credibility</span><div>{Array.from({ length: state.court.credibilityMaximum }, (_, index) => <i key={index} data-full={index < state.court!.credibilityRemaining ? "true" : undefined} />)}</div>
        </div>
        <section className={styles.witnessStand} style={{ "--witness-color": witness?.color ?? "#a98cff" } as CSSProperties}>
          <div className={styles.witnessAvatar}>{witnessBot ? props.renderMysteryBotAvatar(witnessBot, "full", { demeanor: "suspect", talking: true, blinkEnabled: true, facing: "left" }) : <span>◇</span>}</div>
          <div className={styles.witnessIdentity}><small>Witness {state.court.completedChapterIds.length + 1} of {state.court.witnessOrder.length}</small><h1>{witness?.name ?? "Witness"}</h1></div>
        </section>
        <section className={styles.testimony}>
          <div className={styles.testimonyNav}>
            <button type="button" aria-label="Previous statement" onClick={() => focusStatement(-1)} disabled={busy}>‹</button>
            <span>{activeStatementIndex + 1} / {state.court.statements.length}</span>
            <button type="button" aria-label="Next statement" onClick={() => focusStatement(1)} disabled={busy}>›</button>
          </div>
          <p>{activeStatement.visibleText}</p>
          <small>{activeStatement.pressed ? "Pressed" : "Sworn statement"}{activeStatement.version > 1 ? ` · Revision ${activeStatement.version}` : ""}</small>
        </section>
        {lastDialogue && lastDialogue.lineId !== activeStatement.lineId ? (
          <aside className={styles.courtReaction}><strong>{dialogueBot?.name ?? "Court"}</strong><p>{lastDialogue.visibleText}</p></aside>
        ) : null}
        <nav className={styles.courtActions} aria-label="Prosecution actions">
          <button type="button" disabled={busy} onClick={() => void sendAction({ action: "press_statement", statementId: activeStatement.statementId })} data-tutorial-target="mystery-v2-press"><span>!</span>Press</button>
          <button type="button" disabled={busy} onClick={() => setCommand("present")} data-tutorial-target="mystery-v2-present-record"><span>◇</span>Present Evidence</button>
          <button type="button" disabled={busy} onClick={() => void sendAction({ action: "consult_partner", contextNodeId: state.activeDialogueNodeId })}><span>◈</span>Consult Partner</button>
        </nav>
        {command === "present" ? <div className={styles.choiceTray}><header><h2>Present against this statement</h2><button type="button" onClick={() => setCommand(null)}>Close</button></header>{renderRecordButtons((record) => { setCommand(null); void sendAction({ action: "present_record", statementId: activeStatement.statementId, record }); })}</div> : null}
        {state.pendingProsecutionChoice ? <div className={styles.prosecutionChoice} role="dialog" aria-modal="true" aria-labelledby="prosecution-choice-title"><p className={styles.eyebrow}>Your response</p><h2 id="prosecution-choice-title">{state.pendingProsecutionChoice.prompt}</h2>{state.pendingProsecutionChoice.options.map((option) => <button key={option.id} type="button" disabled={busy} onClick={() => void sendAction({ action: "choose_prosecution_response", choiceId: state.pendingProsecutionChoice!.id, optionId: option.id })}>{option.text}</button>)}</div> : null}
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
        <div><p className={styles.eyebrow}>{state.caseTitle}</p><strong>Investigation</strong></div>
        <button type="button" onClick={() => setCaseFileOpen(true)} data-tutorial-target="mystery-v2-case-file">Case File <span>{admittedRecord.length}</span></button>
      </header>
      {state.roomView === "mansion" ? (
        <section className={styles.mansionBoard} aria-label="Mansion Move menu">
          <div className={styles.mansionHeading}><p className={styles.eyebrow}>Move</p><h1>Choose a location</h1><p>Movement is free. Follow the record wherever it leads.</p></div>
          <div className={styles.floorStack}>
            {[...new Set(state.rooms.map((room) => room.floor))].sort((a, b) => b - a).map((floor) => (
              <section key={floor}><h2>Floor {floor}</h2><div>{state.rooms.filter((room) => room.floor === floor).map((room) => (
                <button key={room.id} type="button" disabled={busy || !room.unlocked} data-visited={room.visited ? "true" : undefined} onClick={() => void sendAction({ action: "move", roomId: room.id })}>
                  <span aria-hidden="true">{room.unlocked ? room.emoji : "◆"}</span><strong>{room.unlocked ? room.name : "Locked location"}</strong><small>{room.visited ? "Visited" : room.unlocked ? "Enter" : "Find a way in"}</small>
                </button>
              ))}</div></section>
            ))}
          </div>
        </section>
      ) : currentRoom ? (
        <section className={styles.roomScene} style={{ "--room-image": currentRoom.bundledAssetPath ? `url(${currentRoom.bundledAssetPath})` : "none" } as CSSProperties}>
          <div className={styles.roomShade} />
          <div className={styles.roomTitle}><small>Floor {currentRoom.floor}</small><h1>{currentRoom.name}</h1></div>
          {command === "examine" ? <div className={styles.hotspots} aria-label="Examination points">{currentRoom.hotspots.filter((hotspot) => hotspot.unlocked).map((hotspot) => <button key={hotspot.id} type="button" aria-label={`${hotspot.examined ? "Reviewed" : "Examine"} ${hotspot.label}`} disabled={busy || hotspot.examined} style={{ clipPath: `polygon(${hotspot.polygon.map((point) => `${point.x}% ${point.y}%`).join(",")})` }} onClick={() => void sendAction({ action: "examine", roomId: currentRoom.id, hotspotId: hotspot.id })}><span>{hotspot.examined ? "✓" : "＋"} {hotspot.label}</span></button>)}</div> : null}
          {currentBot ? <div className={styles.roomActor} style={{ "--actor-color": currentSuspect?.color ?? "#a98cff" } as CSSProperties}>{props.renderMysteryBotAvatar(currentBot, "full", { demeanor: "suspect", talking: lastDialogue?.speakerSeatId === currentSuspect?.seatId, blinkEnabled: true, facing: "left" })}<strong>{currentSuspect?.name}</strong></div> : null}
          {lastDialogue ? <div className={styles.dialogueBox}><small>{dialogueBot?.name ?? "Casekeeper"}</small><p>{lastDialogue.visibleText}</p></div> : null}
        </section>
      ) : null}
      <nav className={styles.investigationCommands} aria-label="Investigation commands">
        <button type="button" data-active={state.roomView === "mansion" ? "true" : undefined} disabled={busy} onClick={() => { setCommand("move"); void sendAction({ action: "move" }); }} data-tutorial-target="mystery-v2-move"><span>⌂</span>Move</button>
        <button type="button" data-active={command === "examine" ? "true" : undefined} disabled={busy || state.roomView !== "room"} onClick={() => setCommand("examine")} data-tutorial-target="mystery-v2-examine"><span>⌕</span>Examine</button>
        <button type="button" data-active={command === "talk" ? "true" : undefined} disabled={busy || !currentSuspect} onClick={() => setCommand("talk")} data-tutorial-target="mystery-v2-talk"><span>“”</span>Talk</button>
        <button type="button" data-active={command === "present" ? "true" : undefined} disabled={busy || !currentSuspect || admittedRecord.length === 0} onClick={() => setCommand("present")} data-tutorial-target="mystery-v2-present"><span>◇</span>Present</button>
      </nav>
      {command === "talk" && currentSuspect ? <div className={styles.choiceTray}><header><div><p className={styles.eyebrow}>Talk</p><h2>{currentSuspect.name}</h2></div><button type="button" onClick={() => setCommand(null)}>Close</button></header><div className={styles.topicList}>{state.topics.filter((topic) => topic.suspectSeatId === currentSuspect.seatId && topic.unlocked).map((topic) => <button key={topic.nodeId} type="button" disabled={busy} data-complete={topic.completed ? "true" : undefined} onClick={() => void sendAction({ action: "talk", suspectSeatId: currentSuspect.seatId, topicNodeId: topic.nodeId })}><span>{topic.completed ? "✓" : "?"}</span>{topic.label}</button>)}</div></div> : null}
      {command === "present" && currentSuspect ? <div className={styles.choiceTray}><header><div><p className={styles.eyebrow}>Present</p><h2>Show {currentSuspect.name}</h2></div><button type="button" onClick={() => setCommand(null)}>Close</button></header>{renderRecordButtons((record) => void sendAction({ action: "present_to_suspect", suspectSeatId: currentSuspect.seatId, record }))}</div> : null}
      {state.theoryAvailable ? <button type="button" className={styles.fileChargesButton} onClick={() => setTheoryOpen(true)} data-tutorial-target="mystery-v2-file-theory">File Charges</button> : <small className={styles.theoryHint}>The Theory Board opens after the briefing, one interview, and one admitted record item.</small>}
      {caseFileOpen ? <CaseFile state={state} onClose={() => setCaseFileOpen(false)} /> : null}
      {theoryOpen ? <div className={styles.theoryBoard} role="dialog" aria-modal="true" aria-labelledby="theory-v2-title"><header><div><p className={styles.eyebrow}>Theory Board</p><h2 id="theory-v2-title">File the prosecution&apos;s case</h2></div><button type="button" onClick={() => setTheoryOpen(false)}>Close</button></header><label>Accused<select value={theory.culpritSeatId ?? ""} onChange={(event) => setTheory((current) => ({ ...current, culpritSeatId: event.target.value || null }))}>{state.suspects.map((suspect) => <option key={suspect.seatId} value={suspect.seatId}>{suspect.name}</option>)}</select></label><label>Method<textarea value={theory.method} onChange={(event) => setTheory((current) => ({ ...current, method: event.target.value }))} placeholder="How was the crime committed?" /></label><label>Motive<textarea value={theory.motive} onChange={(event) => setTheory((current) => ({ ...current, motive: event.target.value }))} placeholder="Why would the accused do it?" /></label><label>Opportunity<textarea value={theory.opportunity} onChange={(event) => setTheory((current) => ({ ...current, opportunity: event.target.value }))} placeholder="When and where was the opportunity?" /></label><fieldset><legend>Evidence to admit</legend>{admittedRecord.filter((item) => item.reference.kind === "evidence").map((item) => <label key={item.reference.id}><input type="checkbox" checked={theory.evidenceIds.includes(item.reference.id)} onChange={(event) => setTheory((current) => ({ ...current, evidenceIds: event.target.checked ? [...current.evidenceIds, item.reference.id] : current.evidenceIds.filter((id) => id !== item.reference.id) }))} />{item.emoji} {item.title}</label>)}</fieldset><p>Incomplete method, motive, or opportunity will weaken the case, but will not block trial.</p><button type="button" className={styles.primaryAction} disabled={busy || !theory.culpritSeatId} onClick={() => { setTheoryOpen(false); void sendAction({ action: "file_theory", theory }); }}>File charges and open court</button></div> : null}
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
