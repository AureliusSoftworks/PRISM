"use client";

import {
  DEBATE_FLYTING_LINE_MAX_LENGTH,
  DEBATE_FORMAT_CATALOG,
  DEBATE_FORMALITY_SPECTRUM,
  DEBATE_FORMAT_VISUAL_THEMES,
  DEBATE_JURY_SIZE,
  DEBATE_SCHEMA_VERSION,
  debateSpokenText,
  hexToHsl,
  normalizeBotIdentityColor,
  DEBATE_SETUP_PRESETS,
  type DebateAdvocacyConsent,
  type DebateBotSnapshotV1,
  type DebateEventV1,
  type DebateFormatId,
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
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import styles from "./DebateFlyting.module.css";
import studioStyles from "./DebateExperience.module.css";
import {
  BotPickerGrid,
  BotPickerTile,
  BotPickerToolbar,
  filterBotPickerItems,
  sortBotPickerItems,
  type BotPickerGroup,
} from "./BotPicker";
import {
  debateCastHueFromLensSliderInput,
  debateCastLensSliderInputValue,
} from "./debateCastHueLens";
import {
  debateFlytingRitualCueForEvent,
  playDebateFlytingRitualCue,
} from "./debateFlytingAudio";
import { debateFlytingHallPresentation } from "./debateFlytingHallPresentation";
import type { DebateBotAvatarState } from "./DebateExperience";
import type { VoicePlaybackCharacterAlignment } from "./voiceEffects";

export interface FlytingBotSummary {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  hardMuted: boolean;
}

interface FlytingRuntimeProps {
  bots: FlytingBotSummary[];
  botGroups?: readonly BotPickerGroup[];
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
  renderBotAvatar?: (
    bot: DebateBotSnapshotV1,
    state: DebateBotAvatarState,
  ) => ReactNode;
  onBotContextMenu?: (botId: string, x: number, y: number) => void;
  onBotContextLongPressStart?: (
    event: ReactPointerEvent<HTMLElement>,
    botId: string,
  ) => void;
  onBotContextLongPressMove?: (event: ReactPointerEvent<HTMLElement>) => void;
  onBotContextLongPressEnd?: (event: ReactPointerEvent<HTMLElement>) => void;
}

export interface DebateFlytingSetupProps extends FlytingRuntimeProps {
  archiveCount: number;
  onBackToFormats: () => void;
  onFormatChange: (format: DebateFormatId) => void;
  onExit: () => void;
  onOpenArchive: () => void;
  onResetTutorial?: () => void;
  onStart: (session: DebateSessionV1) => void;
  onSaved: (session: DebateSessionV1) => void;
}

export interface DebateFlytingLiveProps extends FlytingRuntimeProps {
  session: DebateSessionV1;
  audioEnabled: boolean;
  audioVolume: number;
  playEvent: (
    event: DebateEventV1,
    session: DebateSessionV1,
    lifecycle?: FlytingVoiceLifecycle,
  ) => Promise<void>;
  onSessionChange: (session: DebateSessionV1) => void;
  onExit: () => void;
}

interface FlytingVoiceLifecycle {
  onStart?: (
    durationMs: number | null,
    alignment?: VoicePlaybackCharacterAlignment | null,
  ) => void;
  onProgress?: (elapsedMs: number, durationMs: number) => void;
  onEnd?: () => void;
  onCancel?: () => void;
}

type FlytingSetupStep = "summon" | "cast" | "forge" | "review";
type FlytingPlayerRole = "participant" | "judge" | "spectator";
type FlytingCastSeat = "for" | "against" | "host";

const FLYTING_SETUP_STEPS: ReadonlyArray<{
  id: FlytingSetupStep;
  label: string;
  detail: string;
}> = [
  { id: "summon", label: "Summon", detail: "Choose your place in the Hall" },
  { id: "cast", label: "Cast", detail: "Seat Pro, Con, and the Host" },
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

function botColor(
  bot: { color: string | null } | undefined,
  fallback: string,
): string {
  return normalizeBotIdentityColor(bot?.color) ?? normalizeBotIdentityColor(fallback) ?? fallback;
}

function flytingCastBotHue(bot: { color: string | null }): number | null {
  const normalized = normalizeBotIdentityColor(bot.color);
  if (!normalized) return null;
  const { h, s } = hexToHsl(normalized);
  return s < 8 ? null : h;
}

function circularHueDistance(left: number, right: number): number {
  const delta = Math.abs(left - right) % 360;
  return Math.min(delta, 360 - delta);
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

function FlytingStudioSeat(props: {
  bot: FlytingBotSummary | undefined;
  fallback: string;
  label: string;
  name: string;
  renderBotGlyph: DebateFlytingSetupProps["renderBotGlyph"];
  symbol?: string;
}): React.JSX.Element {
  const color = botColor(props.bot, props.fallback);
  return (
    <div
      className={styles.studioCircuitSeat}
      style={{ "--flyting-bot-color": color } as CSSProperties}
    >
      <span aria-hidden="true">
        {props.symbol ?? (props.bot
          ? props.renderBotGlyph(props.bot.glyph, { size: 25, strokeWidth: 1.2 })
          : "◇")}
      </span>
      <small>{props.label}</small>
      <strong>{props.name}</strong>
    </div>
  );
}

function FlytingAtmosphereControl(): React.JSX.Element {
  const lastAtmosphereIndex = DEBATE_FORMALITY_SPECTRUM.length - 1;
  return (
    <div
      className={`${studioStyles.rowdinessControl} ${styles.flytingAtmosphereDisabled}`}
      data-rowdiness="free_for_all"
      data-disabled="true"
      data-tutorial-target="debate-rowdiness"
      aria-disabled="true"
      style={{
        "--debate-rowdiness-accent": "var(--debate-studio-accent)",
        "--debate-rowdiness-progress": "100%",
      } as CSSProperties}
    >
      <div className={studioStyles.rowdinessReadout}>
        <span>Atmosphere</span>
        <strong>Mead Hall</strong>
        <small>Locked to the Hall. It is already atmospheric enough.</small>
      </div>
      <div className={studioStyles.rowdinessInstrument}>
        <div className={studioStyles.rowdinessEndpoints} aria-hidden="true">
          <span>University Union</span>
          <span>Daytime Showdown</span>
        </div>
        <div className={studioStyles.rowdinessRange}>
          <div className={studioStyles.rowdinessTrack} aria-hidden="true">
            <span>
              {DEBATE_FORMALITY_SPECTRUM.map((level, index) => (
                <i
                  key={level.id}
                  data-reached="true"
                  data-current={index === lastAtmosphereIndex ? "true" : undefined}
                />
              ))}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={lastAtmosphereIndex}
            value={lastAtmosphereIndex}
            disabled
            readOnly
            aria-label="Debate atmosphere (disabled for Flyting)"
            aria-valuetext="Locked at maximum: Mead Hall"
          />
        </div>
        <p>Flyting carries its own heat, pacing, and ritual pressure.</p>
      </div>
    </div>
  );
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
  const [activeCastSeat, setActiveCastSeat] =
    useState<FlytingCastSeat>("for");
  const [castPickerSearch, setCastPickerSearch] = useState("");
  const [castPickerGroupId, setCastPickerGroupId] = useState("all");
  const [castHueLensCenter, setCastHueLensCenter] = useState<number | null>(
    null,
  );
  const [bout, setBout] = useState<DebateFlytingBoutV1 | null>(null);
  const [checks, setChecks] = useState<DebateAdvocacyConsent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const castPickerGridShellRef = useRef<HTMLDivElement | null>(null);

  const botById = useMemo(
    () => new Map(props.bots.map((bot) => [bot.id, bot] as const)),
    [props.bots],
  );
  const forBot = botById.get(forBotId);
  const againstBot = botById.get(againstBotId);
  const hostBot = botById.get(hostBotId);
  const needsBotHost = playerRole !== "judge";
  const effectiveActiveCastSeat =
    !needsBotHost && activeCastSeat === "host" ? "for" : activeCastSeat;
  const activeCastBotId =
    effectiveActiveCastSeat === "for"
      ? forBotId
      : effectiveActiveCastSeat === "against"
        ? againstBotId
        : hostBotId;
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
  const stepReady: Record<FlytingSetupStep, boolean> = {
    summon: true,
    cast: castReady,
    forge: Boolean(bout),
    review: consentReady,
  };
  const readinessCount = Object.values(stepReady).filter(Boolean).length;
  const roleLabel = playerRole === "participant"
    ? `Coach · ${playerSideId === "for" ? "Pro" : "Con"}`
    : playerRole === "judge"
      ? "Host of the Hall"
      : "Spectator";
  const hostName = playerRole === "judge"
    ? "You"
    : hostBot?.name ?? "Surprise";
  const flytingTheme = DEBATE_FORMAT_VISUAL_THEMES.flyting;
  const setupAccent = props.theme === "light"
    ? flytingTheme.accentLight
    : flytingTheme.accentDark;
  const proceedingTitle = consentReady
    ? "Ready to open"
    : bout
      ? "Awaiting consent"
      : step === "summon"
        ? "Choose your place"
        : step === "cast"
          ? "Seat the Hall"
          : "Forge the bout";
  const flytingPickerGroups = useMemo<BotPickerGroup[]>(() => {
    const availableIds = new Set(props.bots.map((bot) => bot.id));
    return [
      {
        id: "all",
        name: "All bots",
        botIds: props.bots.map((bot) => bot.id),
        count: props.bots.length,
      },
      ...(props.botGroups ?? [])
        .map((group) => {
          const botIds = group.botIds.filter((botId) =>
            availableIds.has(botId),
          );
          return { ...group, botIds, count: botIds.length };
        })
        .filter((group) => group.botIds.length > 0),
    ];
  }, [props.botGroups, props.bots]);
  const effectiveCastPickerGroupId = flytingPickerGroups.some(
    (group) => group.id === castPickerGroupId,
  )
    ? castPickerGroupId
    : "all";
  const castHueLensAvailable = useMemo(() => {
    let chromatic = 0;
    for (const bot of props.bots) {
      if (flytingCastBotHue(bot) !== null) {
        chromatic += 1;
        if (chromatic >= 2) return true;
      }
    }
    return false;
  }, [props.bots]);
  const visibleCastBots = useMemo(() => {
    const filtered = filterBotPickerItems(
      props.bots,
      castPickerSearch,
      effectiveCastPickerGroupId,
      flytingPickerGroups,
    );
    return sortBotPickerItems(
      filtered,
      castHueLensCenter !== null,
      (left, right) => {
        const leftHue = flytingCastBotHue(left);
        const rightHue = flytingCastBotHue(right);
        if (leftHue === null && rightHue !== null) return 1;
        if (leftHue !== null && rightHue === null) return -1;
        if (
          leftHue !== null &&
          rightHue !== null &&
          castHueLensCenter !== null
        ) {
          const leftDistance = circularHueDistance(
            leftHue,
            castHueLensCenter,
          );
          const rightDistance = circularHueDistance(
            rightHue,
            castHueLensCenter,
          );
          if (leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
          }
          if (leftHue !== rightHue) return leftHue - rightHue;
        }
        return left.name.localeCompare(right.name, undefined, {
          sensitivity: "base",
        });
      },
    );
  }, [
    castHueLensCenter,
    castPickerSearch,
    effectiveCastPickerGroupId,
    flytingPickerGroups,
    props.bots,
  ]);

  useEffect(() => {
    if (needsBotHost || activeCastSeat !== "host") return;
    setActiveCastSeat("for");
  }, [activeCastSeat, needsBotHost]);

  useEffect(() => {
    if (castHueLensCenter === null || !castPickerGridShellRef.current) return;
    let closestBotId: string | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const bot of visibleCastBots) {
      const hue = flytingCastBotHue(bot);
      if (hue === null) continue;
      const distance = circularHueDistance(hue, castHueLensCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestBotId = bot.id;
      }
    }
    if (!closestBotId) return;
    const tile = castPickerGridShellRef.current.querySelector<HTMLElement>(
      `button[data-bot-id="${CSS.escape(closestBotId)}"]`,
    );
    tile?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [castHueLensCenter, visibleCastBots]);

  const invalidateForge = useCallback(() => {
    setBout(null);
    setChecks([]);
    setSavedNotice(null);
  }, []);

  const occupiedCastSeats: Array<readonly [FlytingCastSeat, string]> = [
    ["for", forBotId],
    ["against", againstBotId],
    ...(needsBotHost ? ([["host", hostBotId]] as const) : []),
  ];
  const castPickerBotUnavailableReason = (
    bot: FlytingBotSummary,
  ): string | null =>
    occupiedCastSeats.some(
      ([seat, botId]) =>
        seat !== effectiveActiveCastSeat && botId === bot.id,
    )
      ? "Already seated in the contest"
      : null;
  const singleActionableCastPickerBot =
    castPickerSearch.trim() &&
    visibleCastBots.filter(
      (bot) => castPickerBotUnavailableReason(bot) === null,
    ).length === 1
      ? (visibleCastBots.find(
          (bot) => castPickerBotUnavailableReason(bot) === null,
        ) ?? null)
      : null;
  const activeCastSeatLabel =
    effectiveActiveCastSeat === "for"
      ? "Pro flyter"
      : effectiveActiveCastSeat === "against"
        ? "Con flyter"
        : "Host of the Hall";

  const assignBotToCastSeat = (
    seat: FlytingCastSeat,
    botId: string,
  ): void => {
    const bot = botById.get(botId);
    if (!bot || castPickerBotUnavailableReason(bot)) return;
    if (seat === "for") setForBotId(bot.id);
    else if (seat === "against") setAgainstBotId(bot.id);
    else setHostBotId(bot.id);
    invalidateForge();
  };

  const chooseCastPickerBot = (botId: string): void =>
    assignBotToCastSeat(effectiveActiveCastSeat, botId);

  const clearCastSeat = (seat: FlytingCastSeat): void => {
    if (seat === "for") setForBotId("");
    else if (seat === "against") setAgainstBotId("");
    else setHostBotId("");
    setActiveCastSeat(seat);
    invalidateForge();
  };

  const choosePlayerRole = (nextRole: FlytingPlayerRole): void => {
    if (nextRole === "judge" && activeCastSeat === "host") {
      setActiveCastSeat("for");
    }
    setPlayerRole(nextRole);
    invalidateForge();
  };

  const renderFlytingCastSeat = ({
    seat,
    label,
    fallback,
  }: {
    seat: FlytingCastSeat;
    label: string;
    fallback: string;
  }): React.JSX.Element => {
    const fixedPlayerHost = seat === "host" && !needsBotHost;
    const botId =
      seat === "for"
        ? forBotId
        : seat === "against"
          ? againstBotId
          : hostBotId;
    const bot = fixedPlayerHost ? undefined : botById.get(botId);
    const active = !fixedPlayerHost && effectiveActiveCastSeat === seat;
    const emptyName = seat === "host" ? "Choose a Host" : "Choose a flyter";
    const accent = bot?.color ?? fallback;
    return (
      <article
        key={seat}
        className={`${studioStyles.castSlot} ${styles.flytingCastSeat}`}
        data-active={active ? "true" : undefined}
        data-filled={bot || fixedPlayerHost ? "true" : undefined}
        data-fixed={fixedPlayerHost ? "player-judge" : undefined}
        style={{ "--debate-cast-color": accent } as CSSProperties}
      >
        <button
          type="button"
          className={`${studioStyles.castSlotSelect} ${styles.flytingCastSeatButton}`}
          aria-pressed={active}
          disabled={fixedPlayerHost}
          data-bot-id={bot?.id}
          onClick={() => setActiveCastSeat(seat)}
        >
          <span className={studioStyles.castSlotGlyph} aria-hidden="true">
            {fixedPlayerHost
              ? "◇"
              : props.renderBotGlyph(bot?.glyph ?? "dice", {
                  size: 30,
                  strokeWidth: 1.65,
                })}
          </span>
          <span>
            <small>{label}</small>
            <strong>{fixedPlayerHost ? "You" : bot?.name ?? emptyName}</strong>
            {fixedPlayerHost ? <em>Final ruling · Fixed</em> : null}
            {bot?.hardMuted ? <em>Hard-muted</em> : null}
          </span>
        </button>
        {bot ? (
          <button
            type="button"
            className={`${studioStyles.castSlotClear} ${styles.flytingCastSeatClear}`}
            aria-label={`Remove ${bot.name} from ${label}`}
            onClick={() => clearCastSeat(seat)}
          >
            ×
          </button>
        ) : null}
      </article>
    );
  };

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

  return (
    <main
      className={`${studioStyles.lobby} ${studioStyles.dashboard} ${styles.setupShell}`}
      data-theme={props.theme}
      data-debate-surface="dashboard"
      data-debate-format="flyting"
      data-tutorial-target="debate-flyting-setup"
      style={{ "--debate-studio-accent": setupAccent } as CSSProperties}
    >
      <header className={studioStyles.lobbyHeader}>
        <button
          type="button"
          className={studioStyles.exitButton}
          onClick={props.onExit}
        >
          ← Exit
        </button>
        <div className={studioStyles.studioIdentity}>
          <p className={studioStyles.eyebrow}>PRISM / Debate</p>
          <h1>Debate Studio</h1>
          <span>Flyting · Mead Hall · Prism fills the bout</span>
        </div>
        <div className={studioStyles.lobbyActions}>
          <button
            type="button"
            className={`${studioStyles.primaryButton} ${styles.changeFormatAction}`}
            onClick={props.onBackToFormats}
          >
            Change format
          </button>
          {props.onResetTutorial ? (
            <button
              type="button"
              className={studioStyles.tutorialButton}
              onClick={props.onResetTutorial}
            >
              Replay walkthrough
            </button>
          ) : null}
        </div>
      </header>

      <div className={studioStyles.dashboardLayout}>
        <nav className={studioStyles.studioNav} aria-label="Debate Studio">
          <p>Shape the Debate</p>
          {FLYTING_SETUP_STEPS.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={studioStyles.studioNavButton}
              data-active={step === item.id ? "true" : undefined}
              data-complete={stepReady[item.id] ? "true" : undefined}
              aria-pressed={step === item.id}
              disabled={
                item.id === "forge" && !castReady ||
                item.id === "review" && !bout
              }
              onClick={() => chooseStep(item.id)}
            >
              <span>0{index + 1}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
              <i aria-hidden="true">{stepReady[item.id] ? "✓" : "·"}</i>
            </button>
          ))}
          <span className={studioStyles.studioNavRule} />
          <button
            type="button"
            className={studioStyles.studioNavButton}
            aria-label="Open proceeding archive"
            onClick={props.onOpenArchive}
          >
            <span>↳</span>
            <strong>Archive</strong>
            <small>
              {props.archiveCount} proceeding{props.archiveCount === 1 ? "" : "s"}
            </small>
            <i aria-hidden="true">›</i>
          </button>
          <div
            className={studioStyles.studioNavStatus}
            data-ready={consentReady ? "true" : undefined}
          >
            <span>Proceeding</span>
            <strong>
              {consentReady ? "Ready" : `${readinessCount} of 4 ready`}
            </strong>
            <div aria-hidden="true">
              <i
                style={{
                  "--debate-readiness": `${readinessCount / 4}`,
                } as CSSProperties}
              />
            </div>
          </div>
        </nav>

        <div className={studioStyles.dashboardDesk}>
          <section
            className={`${studioStyles.setupPanel} ${studioStyles.dashboardPanel} ${styles.setupPanel}`}
            data-debate-dashboard-section={step}
          >
          {step === "summon" ? (
            <>
              <header className={styles.panelHeading}>
                <div>
                  <small>01 / Summon</small>
                  <h2>Choose your place in the Hall</h2>
                  <p>Choose whether you coach a voice, hold the final word, or watch the contest unfold.</p>
                </div>
                <span>No timer · four exchanges</span>
              </header>
              <section
                className={studioStyles.roomTuning}
                data-tutorial-target="debate-room"
                data-flyting-selector="true"
              >
                <header>
                  <span aria-hidden="true">◇</span>
                  <span>
                    <strong>Tune the Hall</strong>
                    <small>Flyting · Mead Hall · Four exchanges</small>
                  </span>
                  <em>Always visible</em>
                </header>
                <div className={studioStyles.roomTuningBody}>
                  <div
                    className={studioStyles.proceedingPresets}
                    data-tutorial-target="debate-presets"
                  >
                    <div>
                      <span>Proceeding preset</span>
                      <strong>Custom</strong>
                    </div>
                    <div role="group" aria-label="Debate proceeding presets">
                      {DEBATE_SETUP_PRESETS.map((preset) => (
                        <button
                          type="button"
                          key={preset.id}
                          className={styles.flytingPresetControl}
                          disabled
                          title="Presets tune Forum and Turnabout; Flyting keeps its own Hall rules."
                        >
                          {preset.name}
                        </button>
                      ))}
                      <span className={studioStyles.customPresetChip}>Custom</span>
                    </div>
                  </div>
                  <FlytingAtmosphereControl />
                  <fieldset
                    className={`${studioStyles.formatPicker} ${styles.flytingFormatPicker}`}
                    data-tutorial-target="debate-format"
                  >
                    <legend>Debate format</legend>
                    {DEBATE_FORMAT_CATALOG.filter(
                      (option) => option.availability === "available",
                    ).map((option) => (
                      <label
                        key={option.id}
                        data-selected={option.id === "flyting" ? "true" : undefined}
                        data-tutorial-target={
                          option.id === "flyting" ? "debate-format-flyting" : undefined
                        }
                      >
                        <input
                          type="radio"
                          name="flyting-debate-format"
                          value={option.id}
                          checked={option.id === "flyting"}
                          onChange={() => {
                            if (option.id !== "flyting") {
                              props.onFormatChange(option.id as DebateFormatId);
                            }
                          }}
                        />
                        <strong>
                          {option.name}
                          <em>{option.productionName}</em>
                        </strong>
                        <span>{option.summary}</span>
                        <small>{option.cadence}</small>
                      </label>
                    ))}
                  </fieldset>
                  <div
                    className={`${studioStyles.proceedingPresets} ${styles.flytingCoachChoice}`}
                    data-tutorial-target="debate-flyting-side"
                  >
                    <div>
                      <span>Which flyter will you coach?</span>
                      <strong>
                        {playerRole === "participant"
                          ? playerSideId === "for" ? "Pro · left" : "Con · right"
                          : "Not assigned"}
                      </strong>
                    </div>
                    {playerRole === "participant" ? (
                      <div
                        className={styles.flytingCoachChoiceControls}
                        role="radiogroup"
                        aria-label="Which flyter will you coach"
                      >
                        <label data-selected={playerSideId === "for" ? "true" : undefined}>
                          <input
                            type="radio"
                            name="flyting-side-selector"
                            value="for"
                            checked={playerSideId === "for"}
                            onChange={() => { setPlayerSideId("for"); setChecks([]); }}
                          />
                          Pro · left
                        </label>
                        <label data-selected={playerSideId === "against" ? "true" : undefined}>
                          <input
                            type="radio"
                            name="flyting-side-selector"
                            value="against"
                            checked={playerSideId === "against"}
                            onChange={() => { setPlayerSideId("against"); setChecks([]); }}
                          />
                          Con · right
                        </label>
                      </div>
                    ) : (
                      <span className={styles.flytingCoachChoiceUnavailable}>
                        Host or watch the rite
                      </span>
                    )}
                  </div>
                </div>
              </section>
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
                      onChange={() => choosePlayerRole(id)}
                    />
                    <strong>{label}</strong>
                    <span>{detail}</span>
                  </label>
                ))}
              </div>
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
                <div>
                  <small>02 / Cast</small>
                  <h2>Seat the contest</h2>
                  <p>Select Pro, Con, or the Host, then choose that voice from the Library. PRISM fills the gallery automatically.</p>
                </div>
                <span>{activeCastSeatLabel} · Active seat</span>
              </header>
              <div
                className={styles.flytingCastRoster}
                data-tutorial-target="debate-flyting-cast"
              >
                <div
                  className={`${studioStyles.castSlotGrid} ${styles.flytingPrincipalCast}`}
                  data-seat-count="3"
                >
                  {renderFlytingCastSeat({
                    seat: "for",
                    label: "Pro · left",
                    fallback: "#d8b25d",
                  })}
                  {renderFlytingCastSeat({
                    seat: "against",
                    label: "Con · right",
                    fallback: "#c56b53",
                  })}
                  {renderFlytingCastSeat({
                    seat: "host",
                    label: "Host · fifth vote",
                    fallback: "#78c8b2",
                  })}
                </div>
                <div className={styles.gallerySeed}>
                  <span aria-hidden="true">᛫ ᛫</span>
                  <div>
                    <strong>PRISM fills the gallery.</strong>
                    <small>Four distinct eligible library bots are drawn when you Save or open the Hall, then frozen with the proceeding.</small>
                  </div>
                </div>
              </div>
              <div className={`${studioStyles.castPicker} ${styles.flytingCastPicker}`}>
                <BotPickerToolbar
                  searchValue={castPickerSearch}
                  onSearchChange={setCastPickerSearch}
                  searchAriaLabel="Search bots for Flyting"
                  searchPlaceholder="Search the Library…"
                  groups={flytingPickerGroups}
                  groupItems={props.bots}
                  groupValue={effectiveCastPickerGroupId}
                  onGroupChange={setCastPickerGroupId}
                  groupTheme={props.theme}
                  resultLabel={`${visibleCastBots.length} bot${visibleCastBots.length === 1 ? "" : "s"}`}
                  singleActionableResult={singleActionableCastPickerBot}
                  onSingleActionableResultSelect={chooseCastPickerBot}
                />
                <div
                  className={studioStyles.castPickerBody}
                  data-hue-lens={castHueLensAvailable ? "true" : undefined}
                >
                  {visibleCastBots.length > 0 ? (
                    <div
                      ref={castPickerGridShellRef}
                      className={studioStyles.castPickerGridShell}
                    >
                      <BotPickerGrid
                        className={`${studioStyles.castPickerGrid} ${styles.flytingCastPickerGrid}`}
                        role="radiogroup"
                        ariaLabel={`Bot for ${activeCastSeatLabel}`}
                        style={
                          {
                            "--tile-size": "82px",
                            "--tile-gap": "9px",
                            "--tile-hover-scale": "1.055",
                          } as CSSProperties
                        }
                      >
                        {visibleCastBots.map((bot) => {
                          const selected = activeCastBotId === bot.id;
                          const unavailableReason =
                            castPickerBotUnavailableReason(bot);
                          return (
                            <BotPickerTile
                              key={bot.id}
                              item={bot}
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
                              className={`${studioStyles.castPickerTile} ${styles.flytingCastPickerTile}`}
                              buttonProps={{
                                role: "radio",
                                "aria-checked": selected,
                                "aria-disabled": unavailableReason
                                  ? true
                                  : undefined,
                                "aria-label": unavailableReason
                                  ? `${bot.name}, ${unavailableReason}`
                                  : `${bot.name}${selected ? ", selected" : ""}`,
                                title: unavailableReason ?? undefined,
                                onPointerDown: (event) =>
                                  props.onBotContextLongPressStart?.(
                                    event,
                                    bot.id,
                                  ),
                                onPointerUp: props.onBotContextLongPressEnd,
                                onPointerCancel: props.onBotContextLongPressEnd,
                                onPointerMove: props.onBotContextLongPressMove,
                                onContextMenu: (event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  props.onBotContextMenu?.(
                                    bot.id,
                                    event.clientX,
                                    event.clientY,
                                  );
                                },
                                onClick: () => {
                                  if (unavailableReason) return;
                                  chooseCastPickerBot(bot.id);
                                },
                              }}
                            />
                          );
                        })}
                      </BotPickerGrid>
                    </div>
                  ) : (
                    <p className={studioStyles.castPickerEmpty}>
                      No bots match this view.
                    </p>
                  )}
                  {castHueLensAvailable ? (
                    <div
                      className={studioStyles.castPickerHueLens}
                      data-active={
                        castHueLensCenter !== null ? "true" : undefined
                      }
                      data-tutorial-target="debate-flyting-cast-hue-lens"
                    >
                      <span aria-hidden="true">Hue</span>
                      <input
                        type="range"
                        min={0}
                        max={359}
                        step={1}
                        value={debateCastLensSliderInputValue(
                          castHueLensCenter,
                        )}
                        onChange={(event) =>
                          setCastHueLensCenter(
                            debateCastHueFromLensSliderInput(
                              Number(event.currentTarget.value),
                            ),
                          )
                        }
                        aria-label="Browse Flyting cast bots by hue"
                      />
                      <button
                        type="button"
                        onClick={() => setCastHueLensCenter(null)}
                        disabled={castHueLensCenter === null}
                        aria-label="Clear Flyting cast hue lens"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <footer className={styles.panelActions}>
                <button type="button" onClick={() => setStep("summon")}>Back</button>
                <button type="button" className={styles.primaryAction} disabled={!castReady} onClick={() => setStep("forge")}>Approach the Forge</button>
              </footer>
            </>
          ) : null}

          {step === "forge" ? (
            <>
              <header className={styles.panelHeading}>
                <div>
                  <small>03 / Forge</small>
                  <h2>Temper the bout</h2>
                  <p>PRISM shapes public legends and stakes around this frozen cast; everything remains editable before consent.</p>
                </div>
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
                <div>
                  <small>04 / Review</small>
                  <h2>{bout.title}</h2>
                  <p>Review the public record, secure both flyters’ consent, then open the Mead Hall.</p>
                </div>
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
                <span>Save and Start are waiting in the Proceeding Card.</span>
                <button
                  type="button"
                  className={styles.mobileReviewAction}
                  disabled={busy || !consentReady}
                  onClick={() => void createBout(true)}
                >
                  Save for later
                </button>
                <button
                  type="button"
                  className={`${styles.primaryAction} ${styles.mobileReviewAction}`}
                  disabled={busy || !consentReady}
                  onClick={() => void createBout(false)}
                >
                  Open the Hall
                </button>
              </footer>
            </>
          ) : null}

          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {savedNotice ? <p className={styles.notice} role="status">{savedNotice}</p> : null}
          </section>
        </div>

        <aside className={studioStyles.dashboardRail}>
          <section className={styles.studioReadout} aria-label="Mead Hall schematic">
            <header>
              <span>Mead Hall floor</span>
              <strong>Flyting</strong>
            </header>
            <div className={styles.studioCircuit}>
              <span className={styles.studioBeam} aria-hidden="true" />
              <FlytingStudioSeat
                bot={forBot}
                fallback="#2fd3e3"
                label="Pro · left"
                name={forBot?.name ?? "Uncast Pro"}
                renderBotGlyph={props.renderBotGlyph}
              />
              <FlytingStudioSeat
                bot={playerRole === "judge" ? undefined : hostBot}
                fallback={setupAccent}
                label="Host"
                name={hostName}
                renderBotGlyph={props.renderBotGlyph}
                symbol="ᛉ"
              />
              <FlytingStudioSeat
                bot={againstBot}
                fallback="#ff5f8f"
                label="Con · right"
                name={againstBot?.name ?? "Uncast Con"}
                renderBotGlyph={props.renderBotGlyph}
              />
            </div>
            <p>{bout?.stakes || "The bout has not been forged yet."}</p>
            <small>Sporting · cutting · four exchanges · one decisive winner</small>
          </section>

          <section className={`${studioStyles.readinessPanel} ${styles.proceedingCard}`}>
            <div className={studioStyles.setupCopy}>
              <p className={studioStyles.eyebrow}>Proceeding card</p>
              <h2>{proceedingTitle}</h2>
              <p>Summon, Cast, Forge, and Review form one editable Flyting contest. Start freezes the Hall and its public record.</p>
            </div>
            <div className={studioStyles.reviewGrid}>
              <article>
                <span>Role</span>
                <strong>{roleLabel}</strong>
                <p>{playerRole === "judge" ? "Your ruling is the fifth word" : playerRole === "participant" ? "Write through a bot body and voice" : "The cast carries every exchange"}</p>
              </article>
              <article>
                <span>Cast</span>
                <strong>{castReady ? "Duel cast ready" : "Choose Pro and Con"}</strong>
                <p>Pro · {forBot?.name ?? "Uncast"} · Con · {againstBot?.name ?? "Uncast"}</p>
              </article>
              <article>
                <span>Bout</span>
                <strong>{bout?.title || "Not yet forged"}</strong>
                <p>{bout ? "Editable legends and stakes" : "PRISM will shape the public record"}</p>
              </article>
              <article>
                <span>Room</span>
                <strong>Flyting · Mead Hall</strong>
                <p>No timer · four exchanges · four Hall votes</p>
              </article>
            </div>
            <div className={studioStyles.setupActions}>
              <span className={studioStyles.launchThreshold}>
                {consentReady
                  ? "Both flyters consent. The Hall can open."
                  : bout
                    ? "Secure both flyters’ consent to continue."
                    : "Forge the bout to prepare consent and Start."}
              </span>
              <button
                type="button"
                className={studioStyles.secondaryButton}
                disabled={busy || !consentReady}
                onClick={() => void createBout(true)}
              >
                Save for later
              </button>
              <button
                type="button"
                className={`${studioStyles.primaryButton} ${styles.openHallAction}`}
                disabled={busy || !consentReady}
                onClick={() => void createBout(false)}
              >
                Open the Hall
              </button>
            </div>
          </section>
        </aside>
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
  const [presentingEvent, setPresentingEvent] = useState<DebateEventV1 | null>(
    null,
  );
  const [speechTiming, setSpeechTiming] = useState<
    DebateBotAvatarState["speechTiming"]
  >(null);
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
      const spokenText = debateSpokenText(event.content).trim();
      if (event.speakerBotId && spokenText) {
        setPresentingEvent(event);
        setSpeechTiming(null);
      }
      const clearPresentation = (): void => {
        setPresentingEvent((current) => current?.id === event.id ? null : current);
        setSpeechTiming(null);
      };
      try {
        await props.playEvent(event, next, {
          onStart: (durationMs, alignment) => {
            if (!event.speakerBotId || !spokenText || durationMs === null) return;
            setSpeechTiming({
              text: spokenText,
              elapsedMs: 0,
              durationMs,
              alignment: alignment ?? null,
            });
          },
          onProgress: (elapsedMs, durationMs) => {
            if (!event.speakerBotId || !spokenText) return;
            setSpeechTiming((current) => ({
              text: spokenText,
              elapsedMs,
              durationMs,
              alignment: current?.alignment ?? null,
            }));
          },
          onEnd: clearPresentation,
          onCancel: clearPresentation,
        });
      } finally {
        clearPresentation();
      }
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

  const forColor = botColor(props.session.forAdvocate, "#d8b25d");
  const againstColor = botColor(props.session.againstAdvocate, "#c56b53");
  const hostColor = botColor(props.session.moderator, "#9f8a68");
  const hallPresentation = debateFlytingHallPresentation(state, props.session.status);
  const fireColor = hallPresentation.fireSeatId === "host"
    ? hostColor
    : hallPresentation.fireSeatId === "for"
      ? forColor
      : againstColor;
  const fireSeatName = hallPresentation.fireSeatId === "host"
    ? props.session.moderator.name
    : sideName(props.session, hallPresentation.fireSeatId);
  const exchangeProgress = state.phase === "final_acclamation" || state.phase === "verdict" || state.phase === "complete"
    ? 4
    : state.activeExchangeIndex + 1;
  const renderHallAvatar = (
    bot: DebateBotSnapshotV1,
    role: "for" | "against" | "moderator" | "audience",
    options: {
      presentation: "full" | "mini";
      talking?: boolean;
      thinking?: boolean;
      foleyMouthShape?: DebateBotAvatarState["foleyMouthShape"];
      facing?: DebateBotAvatarState["facing"];
      listenerReaction?: DebateBotAvatarState["listenerReaction"];
    },
  ): ReactNode => props.renderBotAvatar?.(bot, {
    role,
    lookAtRole:
      role === "for"
        ? "against"
        : role === "against"
          ? "for"
          : role === "moderator"
            ? state.floorSideId
            : null,
    consumer: role === "audience" ? "gallery" : "forum",
    presentation: options.presentation,
    talking: options.talking === true,
    thinking: options.thinking === true,
    voiceLevel: 1,
    colorCycle: false,
    speechTiming: options.talking ? speechTiming : null,
    foleyMouthShape: options.foleyMouthShape ?? null,
    listenerReaction: options.listenerReaction ?? null,
    blinkEnabled: true,
    facing: options.facing,
    speechInkVisible: options.talking === true,
  }) ?? props.renderBotGlyph(bot.glyph, {
    size: options.presentation === "full" ? 84 : 21,
    strokeWidth: 1.2,
  });

  return (
    <main
      className={styles.liveShell}
      data-theme={props.theme}
      data-status={props.session.status}
      data-tutorial-target="debate-flyting-live"
      style={{
        "--flyting-for": forColor,
        "--flyting-against": againstColor,
        // The RGB authoring keys resolve here, before anything reaches the
        // playable Hall: left → Pro, host → Host, right → Con.
        "--flyting-lane-left": forColor,
        "--flyting-lane-host": hostColor,
        "--flyting-lane-right": againstColor,
        "--flyting-fire-color": fireColor,
        "--flyting-prism-for": `${hallPresentation.prism.forPercent}%`,
        "--flyting-prism-against": `${hallPresentation.prism.againstPercent}%`,
        "--flyting-prism-against-start": `${100 - hallPresentation.prism.againstPercent}%`,
        "--flyting-prism-dominance": `${hallPresentation.prism.dominance}%`,
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
        <div className={styles.hallAccentKeys} aria-hidden="true">
          <span data-key="left" />
          <span data-key="host" />
          <span data-key="right" />
        </div>
        <div className={styles.hallRoof} aria-hidden="true"><span /><span /><span /></div>
        <div
          className={styles.hallFire}
          data-intensity={hallPresentation.fireIntensity}
          data-side={hallPresentation.fireSeatId}
          aria-label={`${hallPresentation.fireIntensity} hearth, held by ${fireSeatName}`}
          role="img"
        ><i /><b /><em /></div>
        <div
          className={styles.hallPrism}
          data-leading={hallPresentation.prism.leadingSideId}
          role="img"
          aria-label={`Hall prism: ${hallPresentation.prism.forPercent}% ${sideName(props.session, "for")} contribution and ${hallPresentation.prism.againstPercent}% ${sideName(props.session, "against")} contribution. ${sideName(props.session, hallPresentation.prism.leadingSideId)} currently holds the stronger record.`}
        >
          <span className={styles.prismCore} aria-hidden="true" />
          <span className={styles.prismMeasure} aria-hidden="true"><i /><b /></span>
        </div>
        <div className={styles.hallHost} style={{ "--flyting-bot-color": hostColor } as CSSProperties}>
          <div className={styles.hostAvatarPresence} data-flyting-bot-avatar="host">
            {renderHallAvatar(props.session.moderator, "moderator", {
              presentation: "full",
              talking:
                presentingEvent?.speakerBotId === props.session.moderator.id &&
                speechTiming !== null,
              thinking:
                busy &&
                presentingEvent === null &&
                state.expectedAction === "host_verdict",
            })}
          </div>
          <span className={styles.hostShield} data-flyting-hall-asset="shield" aria-hidden="true">{props.renderBotGlyph(props.session.moderator.glyph, { size: 31, strokeWidth: 1.3 })}</span>
          <strong>{props.session.playerRole === "judge" ? "You hold the Hall" : props.session.moderator.name}</strong>
          <small>{state.phase === "complete" ? "The word is given" : "Host of the Hall"}</small>
        </div>
        {([
          ["for", props.session.forAdvocate, forColor],
          ["against", props.session.againstAdvocate, againstColor],
        ] as const).map(([sideId, bot, color]) => {
          const flyter = state.bout?.flyters.find((candidate) => candidate.sideId === sideId);
          const speaking = state.floorSideId === sideId || props.session.events.at(-1)?.speakerBotId === bot.id;
          const talking = presentingEvent?.speakerBotId === bot.id && speechTiming !== null;
          return (
            <article key={sideId} className={styles.flyterPodium} data-side={sideId} data-speaking={speaking ? "true" : undefined} style={{ "--flyting-bot-color": color, "--flyting-lane-color": color } as CSSProperties}>
              <div className={styles.flyterAvatarPresence} data-flyting-bot-avatar={sideId}>
                {renderHallAvatar(bot, sideId, {
                  presentation: "full",
                  talking,
                  thinking:
                    busy &&
                    presentingEvent === null &&
                    state.floorSideId === sideId,
                })}
              </div>
              <div className={styles.banner} data-flyting-hall-asset="banner"><span>{props.renderBotGlyph(bot.glyph, { size: 84, strokeWidth: 1.15 })}</span></div>
              <div>
                <small>{sideId === "for" ? "Pro" : "Con"}{flyter?.epithet ? ` · ${flyter.epithet}` : ""}</small>
                <strong>{bot.name}</strong>
              </div>
            </article>
          );
        })}
      </section>
      <section className={styles.hallGallery} data-quiet={hallPresentation.galleryIsQuiet ? "true" : undefined} aria-label="Hall members beneath the stage">
        <p><span>Hall gallery</span><strong>{hallPresentation.galleryIsQuiet ? "Listening" : "Rowdy"}</strong></p>
        <div>
          {props.session.jury.jurors.map((juror, index) => (
            <span key={juror.id} data-voted={state.hallVotes[index] ? "true" : undefined} style={{ "--flyting-bot-color": botColor(juror, "#9f8a68"), "--flyting-gallery-index": index } as CSSProperties} title={juror.name} aria-label={`${juror.name}${state.hallVotes[index] ? ", vote carved" : ", in the Hall"}`}>
              <i data-flyting-hall-asset="helmet" aria-hidden="true" />
              <b data-flyting-gallery-avatar="true" aria-hidden="true">
                {renderHallAvatar(juror, "audience", {
                  presentation: "mini",
                  talking: !hallPresentation.galleryIsQuiet,
                  foleyMouthShape: hallPresentation.galleryIsQuiet
                    ? null
                    : index % 2 === 0
                      ? "open-small"
                      : "speech-closed",
                  facing: index % 2 === 0 ? "right" : "left",
                  listenerReaction: "attentive",
                })}
              </b>
            </span>
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
