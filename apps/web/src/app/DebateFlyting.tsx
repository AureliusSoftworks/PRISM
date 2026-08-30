"use client";

import {
  DEBATE_FLYTING_LINE_MAX_LENGTH,
  DEBATE_JURY_SIZE,
  DEBATE_SCHEMA_VERSION,
  type DebateAdvocacyConsent,
  type DebateEventV1,
  type DebateFlytingAuthoredModeV1,
  type DebateFlytingBoutV1,
  type DebateFlytingChargeKindV1,
  type DebateFlytingFormatStateV1,
  type DebateFlytingManeuverV1,
  type DebateSessionV1,
  type DebateSideId,
  type ProviderReasoningEffort,
  type ResponseMode,
} from "@localai/shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import styles from "./DebateFlyting.module.css";
import {
  debateFlytingRitualCueForEvent,
  playDebateFlytingRitualCue,
} from "./debateFlytingAudio";

export interface FlytingBotSummary {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  hardMuted: boolean;
}

interface FlytingRuntimeProps {
  bots: FlytingBotSummary[];
  theme: "light" | "dark";
  preferredProvider: "local" | "ollama_cloud" | "openai" | "anthropic";
  responseMode: ResponseMode;
  reasoningEffort?: ProviderReasoningEffort;
  turbo?: boolean;
  modelOverride?: {
    provider: "local" | "ollama_cloud" | "openai" | "anthropic";
    model: string;
  } | null;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  renderBotGlyph: (
    glyph: string | null,
    options: { size: number; strokeWidth: number },
  ) => ReactNode;
}

export interface DebateFlytingSetupProps extends FlytingRuntimeProps {
  onBackToFormats: () => void;
  onExit: () => void;
  onStart: (session: DebateSessionV1) => void;
  onSaved: (session: DebateSessionV1) => void;
}

export interface DebateFlytingLiveProps extends FlytingRuntimeProps {
  session: DebateSessionV1;
  audioEnabled: boolean;
  audioVolume: number;
  playEvent: (event: DebateEventV1, session: DebateSessionV1) => Promise<void>;
  onSessionChange: (session: DebateSessionV1) => void;
  onExit: () => void;
}

type FlytingSetupStep = "summon" | "cast" | "forge" | "review";
type FlytingPlayerRole = "participant" | "judge" | "spectator";

const FLYTING_SETUP_STEPS: ReadonlyArray<{
  id: FlytingSetupStep;
  label: string;
  detail: string;
}> = [
  { id: "summon", label: "Summon", detail: "Choose your place in the Hall" },
  { id: "cast", label: "Cast", detail: "Seat the flyters and witnesses" },
  { id: "forge", label: "Forge", detail: "Shape the legends and stakes" },
  { id: "review", label: "Review", detail: "Consent, privacy, and Start" },
];

const CHALLENGE_LENSES: ReadonlyArray<{
  id: DebateFlytingChargeKindV1;
  label: string;
  detail: string;
}> = [
  { id: "doubt", label: "Doubt", detail: "Question its truth or scale" },
  { id: "expose", label: "Expose", detail: "Reveal contradiction or hypocrisy" },
  { id: "belittle", label: "Belittle", detail: "Make the strength look small" },
  { id: "outdo", label: "Outdo", detail: "Answer with a greater boast" },
];

const REJOINDER_MANEUVERS: ReadonlyArray<{
  id: DebateFlytingManeuverV1;
  label: string;
  detail: string;
}> = [
  { id: "stand", label: "Stand", detail: "Defend the claim directly" },
  { id: "own", label: "Own", detail: "Accept it and make it strength" },
  { id: "turn", label: "Turn", detail: "Reverse the charge" },
  { id: "return", label: "Return", detail: "Answer and strike another claim" },
];

function jsonBody(value: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

let flytingMutationSerial = 0;
function flytingMutationKey(label: string): string {
  flytingMutationSerial += 1;
  return `flyting:${label}:${Date.now().toString(36)}:${flytingMutationSerial.toString(36)}`;
}

function flytingMotion(bout: DebateFlytingBoutV1) {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: bout.id,
    title: bout.title,
    motion: bout.stakes,
    forSide: {
      label: bout.flyters[0].epithet,
      brief: bout.flyters[0].legend.map((facet) => facet.claim).join(" "),
    },
    againstSide: {
      label: bout.flyters[1].epithet,
      brief: bout.flyters[1].legend.map((facet) => facet.claim).join(" "),
    },
  };
}

function botColor(bot: FlytingBotSummary | undefined, fallback: string): string {
  return bot?.color?.trim() || fallback;
}

function FlytingBotMark(props: {
  bot: FlytingBotSummary | undefined;
  fallback: string;
  renderBotGlyph: DebateFlytingSetupProps["renderBotGlyph"];
  size?: number;
}): React.JSX.Element {
  const color = botColor(props.bot, props.fallback);
  return (
    <span
      className={styles.botMark}
      style={{ "--flyting-bot-color": color } as CSSProperties}
      aria-hidden="true"
    >
      {props.bot
        ? props.renderBotGlyph(props.bot.glyph, {
            size: props.size ?? 38,
            strokeWidth: 1.25,
          })
        : "◇"}
    </span>
  );
}

function selectableBotIds(
  bots: readonly FlytingBotSummary[],
  excluded: readonly string[],
): FlytingBotSummary[] {
  const blocked = new Set(excluded.filter(Boolean));
  return bots.filter((bot) => !blocked.has(bot.id));
}

export function DebateFlytingSetup(
  props: DebateFlytingSetupProps,
): React.JSX.Element {
  const defaultJudge = props.bots.length < 3;
  const [step, setStep] = useState<FlytingSetupStep>("summon");
  const [playerRole, setPlayerRole] = useState<FlytingPlayerRole>(
    defaultJudge ? "judge" : "participant",
  );
  const [playerSideId, setPlayerSideId] = useState<DebateSideId>("for");
  const [rivalrySpark, setRivalrySpark] = useState("");
  const [forbiddenTopics, setForbiddenTopics] = useState("");
  const [forBotId, setForBotId] = useState(props.bots[0]?.id ?? "");
  const [againstBotId, setAgainstBotId] = useState(props.bots[1]?.id ?? "");
  const [hostBotId, setHostBotId] = useState(props.bots[2]?.id ?? "");
  const [jurorBotIds, setJurorBotIds] = useState<Array<string | null>>(() => {
    const excluded = new Set(
      [props.bots[0]?.id, props.bots[1]?.id, props.bots[2]?.id].filter(Boolean),
    );
    const available = props.bots.filter((bot) => !excluded.has(bot.id));
    return Array.from({ length: DEBATE_JURY_SIZE }, (_, index) =>
      available[index]?.id ?? null,
    );
  });
  const [bout, setBout] = useState<DebateFlytingBoutV1 | null>(null);
  const [checks, setChecks] = useState<DebateAdvocacyConsent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const forBot = props.bots.find((bot) => bot.id === forBotId);
  const againstBot = props.bots.find((bot) => bot.id === againstBotId);
  const hostBot = props.bots.find((bot) => bot.id === hostBotId);
  const needsBotHost = playerRole !== "judge";
  const castReady = Boolean(
    forBot &&
    againstBot &&
    forBot.id !== againstBot.id &&
    (!needsBotHost ||
      (hostBot && hostBot.id !== forBot.id && hostBot.id !== againstBot.id)),
  );
  const consentReady = checks.length === 2 && checks.every((check) =>
    check.status === "accept" || check.status === "devils_advocate",
  );

  const invalidateForge = useCallback(() => {
    setBout(null);
    setChecks([]);
    setSavedNotice(null);
  }, []);

  const chooseStep = (next: FlytingSetupStep): void => {
    const index = FLYTING_SETUP_STEPS.findIndex((candidate) => candidate.id === next);
    const current = FLYTING_SETUP_STEPS.findIndex((candidate) => candidate.id === step);
    if (index <= current ||
      (next === "cast") ||
      (next === "forge" && castReady) ||
      (next === "review" && bout)) {
      setStep(next);
    }
  };

  const forgeBout = async (): Promise<void> => {
    if (!castReady || busy) return;
    setBusy(true);
    setError(null);
    setChecks([]);
    try {
      const result = await props.request<{
        bout: DebateFlytingBoutV1;
      }>(
        "/api/debates/flyting/forge",
        jsonBody({
          forAdvocateBotId: forBotId,
          againstAdvocateBotId: againstBotId,
          rivalrySpark,
          forbiddenTopics: forbiddenTopics
            .split(/[\n,]/gu)
            .map((topic) => topic.trim())
            .filter(Boolean),
          preferredProvider:
            props.modelOverride?.provider ?? props.preferredProvider,
          modelOverride: props.modelOverride?.model ?? null,
          responseMode: props.responseMode,
          reasoningEffort: props.reasoningEffort,
          turbo: props.turbo,
        }),
      );
      setBout(result.bout);
      setStep("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Bout Forge could not temper this contest.");
    } finally {
      setBusy(false);
    }
  };

  const updateBout = (next: DebateFlytingBoutV1): void => {
    setBout(next);
    setChecks([]);
    setSavedNotice(null);
  };

  const secureConsent = async (): Promise<DebateAdvocacyConsent[] | null> => {
    if (!bout || busy) return null;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ checks: DebateAdvocacyConsent[] }>(
        "/api/debates/role-checks",
        jsonBody({
          format: "flyting",
          formality: "free_for_all",
          motion: flytingMotion(bout),
          playerRole,
          playerSideId: playerRole === "participant" ? playerSideId : null,
          forAdvocateBotId: forBotId,
          againstAdvocateBotId: againstBotId,
          preferredProvider:
            props.modelOverride?.provider ?? props.preferredProvider,
          modelOverride: props.modelOverride?.model ?? null,
          responseMode: props.responseMode,
          reasoningEffort: props.reasoningEffort,
          turbo: props.turbo,
        }),
      );
      setChecks(result.checks);
      return result.checks;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The flyters could not review their roles.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const createBout = async (deferStart: boolean): Promise<void> => {
    if (!bout || busy) return;
    let acceptedChecks = checks;
    if (!consentReady) {
      const refreshed = await secureConsent();
      if (!refreshed || !refreshed.every((check) =>
        check.status === "accept" || check.status === "devils_advocate",
      )) return;
      acceptedChecks = refreshed;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        "/api/debates",
        jsonBody({
          format: "flyting",
          flyting: { version: 1, bout },
          formality: "free_for_all",
          presetId: "custom",
          motion: flytingMotion(bout),
          evidence: {
            version: DEBATE_SCHEMA_VERSION,
            notes: "",
            sources: [],
            exhibits: [],
            frozenAt: null,
          },
          moderatorTitle: "Host of the Hall",
          moderatorBotId: needsBotHost ? hostBotId : "",
          playerJudgeUsesPrism: playerRole === "judge",
          forAdvocateBotId: forBotId,
          againstAdvocateBotId: againstBotId,
          playerRole,
          playerSideId: playerRole === "participant" ? playerSideId : null,
          jury: {
            enabled: true,
            cadence: "four-plus-moderator",
            jurorBotIds,
          },
          advocacyConsent: acceptedChecks,
          preferredProvider:
            props.modelOverride?.provider ?? props.preferredProvider,
          modelOverride: props.modelOverride?.model ?? null,
          responseMode: props.responseMode,
          reasoningEffort: props.reasoningEffort,
          turbo: props.turbo,
          theme: props.theme,
          ...(deferStart ? { deferStart: true } : {}),
          idempotencyKey: flytingMutationKey(deferStart ? "save" : "create"),
        }),
      );
      if (deferStart) {
        setSavedNotice("Saved to Archive · Open. The approved legends and Hall cast are frozen.");
        props.onSaved(result.session);
      } else {
        props.onStart(result.session);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Hall doors would not open.");
    } finally {
      setBusy(false);
    }
  };

  const castOption = (
    bot: FlytingBotSummary,
    excluded: readonly string[],
  ): React.JSX.Element => (
    <option key={bot.id} value={bot.id} disabled={excluded.includes(bot.id)}>
      {bot.name}
    </option>
  );

  return (
    <main
      className={styles.setupShell}
      data-theme={props.theme}
      data-tutorial-target="debate-flyting-setup"
    >
      <header className={styles.setupHeader}>
        <button type="button" onClick={props.onExit}>← Exit</button>
        <div>
          <p>PRISM / Debate / Mead Hall</p>
          <h1>Flyting</h1>
          <span>A contest of answering—not merely insult, rhyme, or volume.</span>
        </div>
        <button type="button" onClick={props.onBackToFormats}>Change format</button>
      </header>

      <div className={styles.setupLayout}>
        <nav className={styles.riteNav} aria-label="Flyting setup rite">
          {FLYTING_SETUP_STEPS.map((item, index) => (
            <button
              type="button"
              key={item.id}
              data-active={step === item.id ? "true" : undefined}
              disabled={
                item.id === "forge" && !castReady ||
                item.id === "review" && !bout
              }
              onClick={() => chooseStep(item.id)}
            >
              <small>0{index + 1}</small>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </button>
          ))}
        </nav>

        <section className={styles.setupPanel}>
          {step === "summon" ? (
            <>
              <header className={styles.panelHeading}>
                <div><small>Summon</small><h2>Choose your place in the Hall</h2></div>
                <span>No timer · four exchanges</span>
              </header>
              <div className={styles.roleCards} role="radiogroup" aria-label="Flyting role">
                {([
                  ["participant", "Coach a flyter", "Choose tactics, author or Wield a line, and hear your bot perform it."],
                  ["judge", "Host the contest", "Hear four Hall votes, then crown the winner yourself."],
                  ["spectator", "Watch the rite", "Let both flyters and the Host carry the full contest."],
                ] as const).map(([id, label, detail]) => (
                  <label key={id} data-selected={playerRole === id ? "true" : undefined}>
                    <input
                      type="radio"
                      name="flyting-role"
                      value={id}
                      checked={playerRole === id}
                      onChange={() => {
                        setPlayerRole(id);
                        invalidateForge();
                      }}
                    />
                    <strong>{label}</strong>
                    <span>{detail}</span>
                  </label>
                ))}
              </div>
              {playerRole === "participant" ? (
                <fieldset className={styles.sideChoice}>
                  <legend>Which flyter will you coach?</legend>
                  <label><input type="radio" checked={playerSideId === "for"} onChange={() => { setPlayerSideId("for"); setChecks([]); }} />First flyter</label>
                  <label><input type="radio" checked={playerSideId === "against"} onChange={() => { setPlayerSideId("against"); setChecks([]); }} />Second flyter</label>
                </fieldset>
              ) : null}
              <label className={styles.field}>
                <span><strong>Rivalry Spark</strong><em>Optional</em></span>
                <textarea
                  rows={4}
                  value={rivalrySpark}
                  maxLength={800}
                  placeholder="Leave blank for Surprise me—or name the absurd grudge, disputed glory, or impossible pairing."
                  onChange={(event) => { setRivalrySpark(event.currentTarget.value); invalidateForge(); }}
                />
              </label>
              <label className={styles.field}>
                <span><strong>Subjects the Hall must avoid</strong><em>Optional · one per line</em></span>
                <textarea
                  rows={3}
                  value={forbiddenTopics}
                  maxLength={900}
                  placeholder="Add boundaries beyond PRISM’s permanent sporting-but-cutting rules."
                  onChange={(event) => { setForbiddenTopics(event.currentTarget.value); invalidateForge(); }}
                />
              </label>
              <footer className={styles.panelActions}>
                <button type="button" className={styles.primaryAction} onClick={() => setStep("cast")}>Enter the Cast</button>
              </footer>
            </>
          ) : null}

          {step === "cast" ? (
            <>
              <header className={styles.panelHeading}>
                <div><small>Cast</small><h2>Seat the contest</h2></div>
                <span>Any two bots may enter</span>
              </header>
              <div className={styles.flyterCast}>
                <label>
                  <FlytingBotMark bot={forBot} fallback="#d8b25d" renderBotGlyph={props.renderBotGlyph} />
                  <span><strong>First flyter</strong><select value={forBotId} onChange={(event) => { setForBotId(event.currentTarget.value); invalidateForge(); }}>{props.bots.map((bot) => castOption(bot, [againstBotId, needsBotHost ? hostBotId : ""]))}</select></span>
                </label>
                <span className={styles.versus}>ᚦ</span>
                <label>
                  <FlytingBotMark bot={againstBot} fallback="#c56b53" renderBotGlyph={props.renderBotGlyph} />
                  <span><strong>Second flyter</strong><select value={againstBotId} onChange={(event) => { setAgainstBotId(event.currentTarget.value); invalidateForge(); }}>{props.bots.map((bot) => castOption(bot, [forBotId, needsBotHost ? hostBotId : ""]))}</select></span>
                </label>
              </div>
              {needsBotHost ? (
                <label className={styles.field}>
                  <span><strong>Host of the Hall</strong><em>Casts the fifth vote</em></span>
                  <select value={hostBotId} onChange={(event) => { setHostBotId(event.currentTarget.value); invalidateForge(); }}>
                    <option value="">Choose a Host</option>
                    {props.bots.map((bot) => castOption(bot, [forBotId, againstBotId]))}
                  </select>
                </label>
              ) : (
                <div className={styles.prismHost}><span>◇</span><div><strong>You hold the staff.</strong><small>Four Hall votes advise you; your ruling is final.</small></div></div>
              )}
              <fieldset className={styles.hallSeats}>
                <legend>Four Hall members</legend>
                {jurorBotIds.map((botId, index) => {
                  const otherJurors = jurorBotIds.filter((_, candidate) => candidate !== index).filter((id): id is string => Boolean(id));
                  const exclusions = [forBotId, againstBotId, needsBotHost ? hostBotId : "", ...otherJurors];
                  return (
                    <label key={index}>
                      <span>Seat {index + 1}</span>
                      <select value={botId ?? ""} onChange={(event) => {
                        const value = event.currentTarget.value || null;
                        setJurorBotIds((current) => current.map((candidate, seat) => seat === index ? value : candidate));
                        setChecks([]);
                      }}>
                        <option value="">Surprise me</option>
                        {selectableBotIds(props.bots, exclusions).concat(
                          botId ? props.bots.filter((bot) => bot.id === botId) : [],
                        ).filter((bot, candidate, all) => all.findIndex((entry) => entry.id === bot.id) === candidate).map((bot) => (
                          <option key={bot.id} value={bot.id}>{bot.name}</option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </fieldset>
              <footer className={styles.panelActions}>
                <button type="button" onClick={() => setStep("summon")}>Back</button>
                <button type="button" className={styles.primaryAction} disabled={!castReady} onClick={() => setStep("forge")}>Approach the Forge</button>
              </footer>
            </>
          ) : null}

          {step === "forge" ? (
            <>
              <header className={styles.panelHeading}>
                <div><small>Forge</small><h2>Temper the bout</h2></div>
                <span>Editable before Start</span>
              </header>
              <div className={styles.forgePreview}>
                <div><FlytingBotMark bot={forBot} fallback="#d8b25d" renderBotGlyph={props.renderBotGlyph} size={56} /><strong>{forBot?.name}</strong></div>
                <span>Boast · Flyte · Rejoinder · Acclamation</span>
                <div><FlytingBotMark bot={againstBot} fallback="#c56b53" renderBotGlyph={props.renderBotGlyph} size={56} /><strong>{againstBot?.name}</strong></div>
              </div>
              <p className={styles.forgeCopy}>PRISM will forge one title, one set of stakes, an epithet, and three boastable Legend facets for each flyter. No private relationship memory or live research enters the Hall.</p>
              <footer className={styles.panelActions}>
                <button type="button" onClick={() => setStep("cast")}>Back</button>
                <button type="button" className={styles.primaryAction} disabled={!castReady || busy} onClick={() => void forgeBout()}>{busy ? "Forging…" : bout ? "Reforge the bout" : "Forge the bout"}</button>
              </footer>
            </>
          ) : null}

          {step === "review" && bout ? (
            <>
              <header className={styles.panelHeading}>
                <div><small>Review</small><h2>{bout.title}</h2></div>
                <span>Fictional · non-canonical</span>
              </header>
              <label className={styles.field}>
                <span><strong>Bout title</strong><em>Public</em></span>
                <input value={bout.title} maxLength={120} onChange={(event) => updateBout({ ...bout, title: event.currentTarget.value })} />
              </label>
              <label className={styles.field}>
                <span><strong>Stakes</strong><em>What the Hall will decide</em></span>
                <textarea rows={3} value={bout.stakes} maxLength={600} onChange={(event) => updateBout({ ...bout, stakes: event.currentTarget.value })} />
              </label>
              <div className={styles.legendColumns}>
                {bout.flyters.map((flyter, flyterIndex) => (
                  <section key={flyter.botId} style={{ "--flyting-bot-color": botColor(props.bots.find((bot) => bot.id === flyter.botId), flyterIndex === 0 ? "#d8b25d" : "#c56b53") } as CSSProperties}>
                    <header><strong>{flyter.name}</strong><input value={flyter.epithet} maxLength={96} aria-label={`${flyter.name} epithet`} onChange={(event) => {
                      const flyters = [...bout.flyters] as DebateFlytingBoutV1["flyters"];
                      flyters[flyterIndex] = { ...flyter, epithet: event.currentTarget.value };
                      updateBout({ ...bout, flyters });
                    }} /></header>
                    {flyter.legend.map((facet, facetIndex) => (
                      <div key={facet.id}>
                        <input value={facet.title} maxLength={80} aria-label={`${flyter.name} Legend ${facetIndex + 1} title`} onChange={(event) => {
                          const flyters = [...bout.flyters] as DebateFlytingBoutV1["flyters"];
                          const legend = flyter.legend.map((candidate, index) => index === facetIndex ? { ...candidate, title: event.currentTarget.value } : candidate);
                          flyters[flyterIndex] = { ...flyter, legend };
                          updateBout({ ...bout, flyters });
                        }} />
                        <textarea value={facet.claim} rows={2} maxLength={280} aria-label={`${flyter.name} Legend ${facetIndex + 1} claim`} onChange={(event) => {
                          const flyters = [...bout.flyters] as DebateFlytingBoutV1["flyters"];
                          const legend = flyter.legend.map((candidate, index) => index === facetIndex ? { ...candidate, claim: event.currentTarget.value } : candidate);
                          flyters[flyterIndex] = { ...flyter, legend };
                          updateBout({ ...bout, flyters });
                        }} />
                      </div>
                    ))}
                  </section>
                ))}
              </div>
              <div className={styles.reviewLock}>
                <div><span>Privacy</span><strong>{props.responseMode === "local" ? "LOCAL · never leaves this device" : "ONLINE · approved provider"}</strong></div>
                <div><span>Delivery</span><strong>Cadenced · no timer · no required rhyme</strong></div>
                <div><span>Record</span><strong>Four exchanges · one decisive winner</strong></div>
              </div>
              <section className={styles.consentPanel}>
                <header><div><strong>Flyter consent</strong><small>Each bot privately reviews its role and frozen legends.</small></div><button type="button" disabled={busy} onClick={() => void secureConsent()}>{busy ? "Asking…" : checks.length ? "Ask again" : "Secure consent"}</button></header>
                {checks.length ? (
                  <ul>{checks.map((check) => <li key={check.botId} data-status={check.status}><span>{props.bots.find((bot) => bot.id === check.botId)?.name ?? check.botId}</span><strong>{check.status === "accept" ? "Accepts" : check.status === "devils_advocate" ? "Accepts as Devil’s Advocate" : "Declines"}</strong><small>{check.reason}</small></li>)}</ul>
                ) : <p>Start will remain sealed until both flyters answer.</p>}
              </section>
              <footer className={styles.panelActions}>
                <button type="button" onClick={() => setStep("forge")}>Back</button>
                <button type="button" disabled={busy || !consentReady} onClick={() => void createBout(true)}>Save for later</button>
                <button type="button" className={styles.primaryAction} disabled={busy || !consentReady} onClick={() => void createBout(false)}>Open the Hall</button>
              </footer>
            </>
          ) : null}

          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {savedNotice ? <p className={styles.notice} role="status">{savedNotice}</p> : null}
        </section>
      </div>
    </main>
  );
}

function flytingState(session: DebateSessionV1): DebateFlytingFormatStateV1 {
  if (session.formatState.format !== "flyting") {
    throw new Error("Expected a Flyting session.");
  }
  return session.formatState;
}

function sideName(session: DebateSessionV1, sideId: DebateSideId): string {
  return sideId === "for" ? session.forAdvocate.name : session.againstAdvocate.name;
}

function resolutionLabel(value: string | null): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Awaiting answer";
}

export function DebateFlytingLive(
  props: DebateFlytingLiveProps,
): React.JSX.Element {
  const state = flytingState(props.session);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [authoredMode, setAuthoredMode] = useState<Exclude<DebateFlytingAuthoredModeV1, "bot">>("custom");
  const [facetId, setFacetId] = useState("");
  const [targetClaimId, setTargetClaimId] = useState("");
  const [lens, setLens] = useState<DebateFlytingChargeKindV1>("doubt");
  const [maneuver, setManeuver] = useState<DebateFlytingManeuverV1>("stand");
  const [returnClaimId, setReturnClaimId] = useState("");
  const [winnerSideId, setWinnerSideId] = useState<DebateSideId>("for");
  const autoTimerRef = useRef<number | null>(null);
  const mutateRef = useRef<(
    body: Record<string, unknown>,
    label: string,
  ) => Promise<void>>(async () => undefined);

  const activeExchange = state.exchanges[state.activeExchangeIndex];
  const floorFlyter = state.floorSideId
    ? state.bout?.flyters.find((flyter) => flyter.sideId === state.floorSideId)
    : null;
  const unusedFacets = floorFlyter?.legend.filter((facet) =>
    !state.exchanges.some((exchange) => exchange.boast?.legendFacetId === facet.id),
  ) ?? [];
  const opponentClaims = state.exchanges
    .map((exchange) => exchange.boast)
    .filter((boast): boast is NonNullable<typeof boast> =>
      Boolean(boast && boast.sideId !== state.floorSideId),
    );

  useEffect(() => {
    setDraft("");
    setAuthoredMode("custom");
    setFacetId(unusedFacets[0]?.id ?? "");
    setTargetClaimId(activeExchange?.boast?.id ?? opponentClaims[0]?.id ?? "");
    setLens("doubt");
    setManeuver("stand");
    setReturnClaimId(opponentClaims[0]?.id ?? "");
    setWinnerSideId(state.hallVotes.filter((vote) => vote.sideId === "for").length >= state.hallVotes.filter((vote) => vote.sideId === "against").length ? "for" : "against");
  }, [props.session.revision]);

  const adoptWithPresentation = useCallback(async (
    next: DebateSessionV1,
    priorSequence: number,
  ): Promise<void> => {
    props.onSessionChange(next);
    const events = next.events.filter((event) => event.sequence > priorSequence);
    for (const event of events) {
      const cue = debateFlytingRitualCueForEvent(event);
      if (cue && props.audioEnabled) {
        playDebateFlytingRitualCue(cue, props.audioVolume);
      }
      await props.playEvent(event, next);
    }
  }, [props.audioEnabled, props.audioVolume, props.onSessionChange, props.playEvent]);

  const mutate = useCallback(async (
    body: Record<string, unknown>,
    label: string,
  ): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const priorSequence = props.session.events.at(-1)?.sequence ?? 0;
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(props.session.id)}/flyting-action`,
        jsonBody({
          ...body,
          expectedRevision: props.session.revision,
          idempotencyKey: flytingMutationKey(label),
        }),
      );
      await adoptWithPresentation(result.session, priorSequence);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Hall could not record that action.");
    } finally {
      setBusy(false);
    }
  }, [adoptWithPresentation, busy, props.request, props.session]);

  useEffect(() => {
    mutateRef.current = mutate;
  }, [mutate]);

  useEffect(() => {
    if (
      busy ||
      props.session.status !== "live" ||
      state.expectedAction !== "advance"
    ) return;
    autoTimerRef.current = window.setTimeout(() => {
      autoTimerRef.current = null;
      void mutateRef.current({ action: "advance" }, "advance");
    }, 720);
    return () => {
      if (autoTimerRef.current !== null) window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    };
  }, [busy, props.session.status, props.session.revision, state.expectedAction]);

  const wield = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ content: string }>(
        `/api/debates/${encodeURIComponent(props.session.id)}/flyting-wield`,
        jsonBody({
          expectedRevision: props.session.revision,
          action: state.expectedAction,
          legendFacetId: facetId || null,
          targetClaimId: targetClaimId || null,
          lens,
          targetChallengeId: activeExchange?.challenge?.id ?? null,
          maneuver,
          returnClaimId: maneuver === "return" ? returnClaimId || null : null,
          winnerSideId: state.expectedAction === "host_verdict" ? winnerSideId : null,
        }),
      );
      setDraft(result.content);
      setAuthoredMode("wielded");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PRISM could not shape a draft.");
    } finally {
      setBusy(false);
    }
  };

  const submitPlayerAction = (): void => {
    if (state.expectedAction === "boast") {
      void mutate({ action: "boast", legendFacetId: facetId, content: draft, authoredMode }, "boast");
    } else if (state.expectedAction === "challenge") {
      void mutate({ action: "challenge", targetClaimId, lens, content: draft, authoredMode }, "challenge");
    } else if (state.expectedAction === "rejoinder") {
      void mutate({
        action: "rejoinder",
        targetChallengeId: activeExchange?.challenge?.id ?? null,
        maneuver,
        returnClaimId: maneuver === "return" ? returnClaimId : null,
        content: draft,
        authoredMode,
      }, "rejoinder");
    } else if (state.expectedAction === "host_verdict") {
      void mutate({ action: "host_verdict", winnerSideId, content: draft, authoredMode }, "host-verdict");
    }
  };

  const pauseOrResume = async (): Promise<void> => {
    if (busy || props.session.status === "completed") return;
    setBusy(true);
    setError(null);
    try {
      const action = props.session.status === "paused" ? "resume" : "pause";
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(props.session.id)}/${action}`,
        jsonBody({
          expectedRevision: props.session.revision,
          idempotencyKey: flytingMutationKey(action),
          presentationEventId: props.session.events.at(-1)?.id ?? null,
          quietSave: true,
        }),
      );
      props.onSessionChange(result.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Hall could not change its pace.");
    } finally {
      setBusy(false);
    }
  };

  const leaveHall = async (): Promise<void> => {
    if (props.session.status === "live" || props.session.status === "waiting_for_player") {
      try {
        const result = await props.request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(props.session.id)}/pause`,
          jsonBody({
            expectedRevision: props.session.revision,
            idempotencyKey: flytingMutationKey("leave"),
            presentationEventId: props.session.events.at(-1)?.id ?? null,
            quietSave: true,
          }),
        );
        props.onSessionChange(result.session);
      } catch {
        // The session is already durable; leaving must never trap the player.
      }
    }
    props.onExit();
  };

  const forColor = props.session.forAdvocate.color || "#d8b25d";
  const againstColor = props.session.againstAdvocate.color || "#c56b53";
  const exchangeProgress = state.phase === "final_acclamation" || state.phase === "verdict" || state.phase === "complete"
    ? 4
    : state.activeExchangeIndex + 1;

  return (
    <main
      className={styles.liveShell}
      data-theme={props.theme}
      data-status={props.session.status}
      data-tutorial-target="debate-flyting-live"
      style={{
        "--flyting-for": forColor,
        "--flyting-against": againstColor,
      } as CSSProperties}
    >
      <header className={styles.liveHeader}>
        <button type="button" onClick={() => void leaveHall()}>← Leave Hall</button>
        <div><p>Flyting · Mead Hall</p><h1>{state.bout?.title ?? props.session.motion.title}</h1><span>{state.bout?.stakes}</span></div>
        <div className={styles.liveHeaderActions}>
          <span>Exchange {exchangeProgress} / 4</span>
          {props.session.status !== "completed" ? <button type="button" onClick={() => void pauseOrResume()} disabled={busy}>{props.session.status === "paused" ? "Resume" : "Pause"}</button> : <strong>Recorded</strong>}
        </div>
      </header>

      <section className={styles.hallStage} aria-label="Mead Hall stage">
        <div className={styles.hallRoof} aria-hidden="true"><span /><span /><span /></div>
        <div className={styles.hallFire} aria-hidden="true"><i /><b /></div>
        <div className={styles.hallHost}>
          <span className={styles.hostStaff} aria-hidden="true">ᛉ</span>
          <strong>{props.session.playerRole === "judge" ? "You hold the Hall" : props.session.moderator.name}</strong>
          <small>{state.phase === "complete" ? "The word is given" : "Host of the Hall"}</small>
        </div>
        {([
          ["for", props.session.forAdvocate, forColor],
          ["against", props.session.againstAdvocate, againstColor],
        ] as const).map(([sideId, bot, color]) => {
          const flyter = state.bout?.flyters.find((candidate) => candidate.sideId === sideId);
          const speaking = state.floorSideId === sideId || props.session.events.at(-1)?.speakerBotId === bot.id;
          return (
            <article key={sideId} className={styles.flyterPodium} data-side={sideId} data-speaking={speaking ? "true" : undefined} style={{ "--flyting-bot-color": color } as CSSProperties}>
              <div className={styles.banner}><span>{props.renderBotGlyph(bot.glyph, { size: 84, strokeWidth: 1.15 })}</span></div>
              <div><small>{flyter?.epithet}</small><strong>{bot.name}</strong></div>
            </article>
          );
        })}
        <div className={styles.hallGallery} aria-label="Hall members">
          {props.session.jury.jurors.map((juror, index) => (
            <span key={juror.id} data-voted={state.hallVotes[index] ? "true" : undefined} style={{ "--flyting-bot-color": juror.color || "#9f8a68" } as CSSProperties} title={juror.name}>{props.renderBotGlyph(juror.glyph, { size: 25, strokeWidth: 1.2 })}</span>
          ))}
        </div>
      </section>

      <div className={styles.liveLayout}>
        <section className={styles.hallRecord} data-tutorial-target="debate-flyting-record">
          <header><div><small>Carved before the Hall</small><h2>Hall Record</h2></div><span>{state.exchanges.filter((exchange) => exchange.resolution).length} answered exchanges</span></header>
          <div className={styles.exchangeTrack}>
            {state.exchanges.map((exchange) => (
              <article key={exchange.id} data-active={exchange.index === state.activeExchangeIndex && state.phase !== "complete" ? "true" : undefined} data-resolution={exchange.resolution ?? undefined}>
                <header><span>Rune {exchange.index + 1}</span><strong>{sideName(props.session, exchange.boastingSideId)} boasts</strong><em>{resolutionLabel(exchange.resolution)}</em></header>
                {exchange.boast ? <p><b>Boast</b>{exchange.boast.content}</p> : <p className={styles.emptyRune}>The wood is unmarked.</p>}
                {exchange.challenge ? <p><b>{CHALLENGE_LENSES.find((candidate) => candidate.id === exchange.challenge?.lens)?.label ?? "Challenge"}</b>{exchange.challenge.content}</p> : null}
                {exchange.yielded ? <p className={styles.yieldRune}><b>Yield</b>The charge stands unanswered.</p> : exchange.rejoinder ? <p><b>{REJOINDER_MANEUVERS.find((candidate) => candidate.id === exchange.rejoinder?.maneuver)?.label ?? "Rejoinder"}</b>{exchange.rejoinder.content}</p> : null}
                {exchange.acclamation ? <blockquote>{exchange.acclamation}</blockquote> : null}
              </article>
            ))}
          </div>
          {state.hallVotes.length ? (
            <section className={styles.voteRecord}>
              <h3>Final Acclamation</h3>
              {state.hallVotes.map((vote) => <p key={vote.voterBotId}><strong>{props.session.jury.jurors.find((juror) => juror.id === vote.voterBotId)?.name ?? "Hall member"} · {sideName(props.session, vote.sideId)}</strong><span>{vote.acclaim}</span></p>)}
            </section>
          ) : null}
          {state.hostVerdict ? (
            <section className={styles.finalVerdict}><small>The Host gives the word</small><h3>{sideName(props.session, state.hostVerdict.sideId)} prevails</h3><p>{state.hostVerdict.ruling}</p></section>
          ) : null}
        </section>

        <aside className={styles.floorPanel} data-tutorial-target="debate-flyting-actions">
          {props.session.status === "paused" ? (
            <div className={styles.waitingPanel}><span>ᛉ</span><h2>The Hall is held.</h2><p>Resume when you are ready. No clock is running.</p></div>
          ) : props.session.status === "completed" ? (
            <div className={styles.waitingPanel}><span>◇</span><h2>The contest is carved.</h2><p>Every claim, answer, vote, and delivered Power remains in the replayable record.</p></div>
          ) : props.session.status === "waiting_for_player" ? (
            <>
              <header className={styles.floorHeading}>
                <small>{state.expectedAction === "challenge" ? "Challenge / Flyte" : state.expectedAction === "rejoinder" ? "Answer / Rejoinder" : state.expectedAction === "host_verdict" ? "Rule / Give the word" : "Claim / Boast"}</small>
                <h2>{state.expectedAction === "host_verdict" ? "The Hall awaits your ruling." : `${floorFlyter?.name ?? "Your flyter"} awaits your direction.`}</h2>
                <p>{state.expectedAction === "challenge" ? "Choose the exact boast and how to attack it." : state.expectedAction === "rejoinder" ? "Meet the charge—or Yield and let it stand." : state.expectedAction === "host_verdict" ? "The four votes advise you. Crown one winner; ties do not leave the Hall." : "Choose an unused Legend facet, then give it voice."}</p>
              </header>
              {state.expectedAction === "boast" ? (
                <div className={styles.tacticGrid}>{unusedFacets.map((facet) => <button type="button" key={facet.id} data-selected={facetId === facet.id ? "true" : undefined} onClick={() => setFacetId(facet.id)}><strong>{facet.title}</strong><span>{facet.claim}</span></button>)}</div>
              ) : null}
              {state.expectedAction === "challenge" ? (
                <>
                  <label className={styles.floorSelect}><span>Targeted claim</span><select value={targetClaimId} onChange={(event) => setTargetClaimId(event.currentTarget.value)}>{opponentClaims.map((claim) => <option key={claim.id} value={claim.id}>{claim.content}</option>)}</select></label>
                  <div className={styles.tacticGrid}>{CHALLENGE_LENSES.map((candidate) => <button type="button" key={candidate.id} data-selected={lens === candidate.id ? "true" : undefined} onClick={() => setLens(candidate.id)}><strong>{candidate.label}</strong><span>{candidate.detail}</span></button>)}</div>
                </>
              ) : null}
              {state.expectedAction === "rejoinder" ? (
                <>
                  <blockquote className={styles.activeCharge}>{activeExchange?.challenge?.content}</blockquote>
                  <div className={styles.tacticGrid}>{REJOINDER_MANEUVERS.map((candidate) => <button type="button" key={candidate.id} data-selected={maneuver === candidate.id ? "true" : undefined} onClick={() => setManeuver(candidate.id)}><strong>{candidate.label}</strong><span>{candidate.detail}</span></button>)}</div>
                  {maneuver === "return" ? <label className={styles.floorSelect}><span>Return against</span><select value={returnClaimId} onChange={(event) => setReturnClaimId(event.currentTarget.value)}>{opponentClaims.map((claim) => <option key={claim.id} value={claim.id}>{claim.content}</option>)}</select></label> : null}
                </>
              ) : null}
              {state.expectedAction === "host_verdict" ? (
                <div className={styles.winnerChoice}>{(["for", "against"] as const).map((sideId) => <button type="button" key={sideId} data-selected={winnerSideId === sideId ? "true" : undefined} onClick={() => setWinnerSideId(sideId)}><strong>{sideName(props.session, sideId)}</strong><span>{state.hallVotes.filter((vote) => vote.sideId === sideId).length} Hall votes</span></button>)}</div>
              ) : null}
              <label className={styles.composer}>
                <span><strong>Your line</strong><em>{draft.length} / {DEBATE_FLYTING_LINE_MAX_LENGTH}</em></span>
                <textarea
                  value={draft}
                  rows={5}
                  maxLength={DEBATE_FLYTING_LINE_MAX_LENGTH}
                  placeholder="The line begins blank. Write it yourself or Wield PRISM once for an editable draft."
                  onChange={(event) => {
                    setDraft(event.currentTarget.value);
                    if (!event.currentTarget.value) setAuthoredMode("custom");
                  }}
                />
              </label>
              <div className={styles.composerActions}>
                {state.expectedAction === "rejoinder" ? <button type="button" className={styles.yieldAction} disabled={busy} onClick={() => void mutate({ action: "yield" }, "yield")}>Yield · leave unanswered</button> : <span />}
                <button type="button" disabled={busy} onClick={() => void wield()}>{busy ? "Wielding…" : "◇ Wield PRISM"}</button>
                <button type="button" className={styles.primaryAction} disabled={busy || !draft.trim() || (state.expectedAction === "boast" && !facetId) || (state.expectedAction === "challenge" && !targetClaimId) || (state.expectedAction === "rejoinder" && maneuver === "return" && !returnClaimId)} onClick={submitPlayerAction}>{state.expectedAction === "host_verdict" ? "Give the word" : "Send to the floor"}</button>
              </div>
            </>
          ) : (
            <div className={styles.waitingPanel}><span>ᚦ</span><h2>{busy ? "The word is taking shape…" : "The Hall listens."}</h2><p>{state.phase === "final_acclamation" ? `Hall vote ${Math.min(DEBATE_JURY_SIZE, state.hallVotes.length + 1)} of ${DEBATE_JURY_SIZE}` : state.phase === "verdict" ? "The Host weighs the full public record." : "Boast, challenge, and answer remain bound to the carved record."}</p></div>
          )}
          {error ? <div className={styles.liveError} role="alert"><p>{error}</p><div><button type="button" disabled={busy} onClick={() => { setError(null); void mutate({ action: "advance" }, "retry"); }}>Retry</button>{state.expectedAction === "advance" ? <button type="button" disabled={busy} onClick={() => { setError(null); void mutate({ action: "advance", skip: true }, "skip"); }}>Skip this beat</button> : null}</div></div> : null}
        </aside>
      </div>
    </main>
  );
}
