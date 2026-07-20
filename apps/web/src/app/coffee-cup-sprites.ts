import {
  coffeeCupColdnessForProgress,
  coffeeCupFillRatioForProgress,
  coffeeCupProgressAfterTopOff,
  coffeeCupProgressFromSessionTiming,
  coffeeCupSipCycleMs,
  coffeeCupPacedProgress,
  coffeeCupShouldFinishAfterSip,
  coffeeCupSipLikelihoodForProgress,
  coffeeCupStatusForFillAndTemperatureProgress,
  coffeeCupStatusForProgress,
  hexToHsl,
  type CoffeeCupStatus,
  type CoffeeCupTopOffSnapshot,
} from "@localai/shared";

export {
  coffeeCupConsumptionRate,
  coffeeCupSessionDurationPaceMultiplier,
  coffeeCupSeedWithTempoRole,
  coffeeCupSipMessageGapForDuration,
  coffeeCupSipBias,
  coffeeCupSipCycleMs,
  coffeeCupShouldFinishAfterSip,
  coffeeCupSipLikelihoodForProgress,
  coffeeCupTempoRoleForBot,
  coffeeCupCanTopOff,
  coffeeCupProgressAfterTopOff,
  coffeeCupTopOffSnapshotForProgress,
  type CoffeeCupTopOffSnapshot,
} from "@localai/shared";

export const COFFEE_CUP_SPRITE_COLORS = [
  "red",
  "orange",
  "green",
  "blue",
  "purple",
] as const;

export type CoffeeCupSpriteColor = (typeof COFFEE_CUP_SPRITE_COLORS)[number];
export type CoffeeCupPlacementSide = "left" | "right";
export type CoffeeCupPrismFamily = "p" | "r" | "i" | "s" | "m";
export type CoffeeCupSpriteTheme = "dark" | "light";

export interface CoffeeCupConsumptionTiming {
  sessionStartedAtMs: number | null;
  sessionEndsAtMs: number | null;
}

export function coffeeCupConsumptionTimingForSeat(args: {
  seatActive: boolean;
  seatActivatedAtMs?: number | null;
  fallbackSessionStartedAtMs?: number | null;
  fallbackSessionEndsAtMs?: number | null;
  durationMinutes?: number | null;
}): CoffeeCupConsumptionTiming {
  if (!args.seatActive) {
    return { sessionStartedAtMs: null, sessionEndsAtMs: null };
  }

  const durationMs =
    typeof args.durationMinutes === "number" &&
    Number.isFinite(args.durationMinutes) &&
    args.durationMinutes > 0
      ? args.durationMinutes * 60 * 1000
      : null;
  const seatActivatedAtMs =
    typeof args.seatActivatedAtMs === "number" &&
    Number.isFinite(args.seatActivatedAtMs)
      ? args.seatActivatedAtMs
      : null;
  const fallbackSessionStartedAtMs =
    typeof args.fallbackSessionStartedAtMs === "number" &&
    Number.isFinite(args.fallbackSessionStartedAtMs)
      ? args.fallbackSessionStartedAtMs
      : null;
  const fallbackSessionEndsAtMs =
    typeof args.fallbackSessionEndsAtMs === "number" &&
    Number.isFinite(args.fallbackSessionEndsAtMs)
      ? args.fallbackSessionEndsAtMs
      : null;
  const sessionStartedAtMs =
    seatActivatedAtMs ??
    fallbackSessionStartedAtMs ??
    (fallbackSessionEndsAtMs != null && durationMs != null
      ? fallbackSessionEndsAtMs - durationMs
      : null);

  if (sessionStartedAtMs == null) {
    return { sessionStartedAtMs: null, sessionEndsAtMs: null };
  }

  return {
    sessionStartedAtMs,
    sessionEndsAtMs:
      seatActivatedAtMs != null && durationMs != null
        ? sessionStartedAtMs + durationMs
        : fallbackSessionEndsAtMs ??
          (durationMs != null ? sessionStartedAtMs + durationMs : null),
  };
}

interface CoffeeCupSeatPlacementArgs {
  compact: boolean;
  seatIndex: number;
  seatCount: number;
  layoutIndex: number;
  sessionSeed?: string | null;
}

export interface CoffeeCupVisualState extends CoffeeCupStatus {
  color: CoffeeCupSpriteColor;
  restImageUrl: string;
  sipImageUrl: string;
  frameX: "0%" | "50%" | "100%";
  frameY: "0%" | "50%" | "100%";
  sipping: boolean;
  sipAnimationMs: number;
  sipHoldMs: number;
  steamAlpha: number;
  steamRateMs: number;
  finished: boolean;
  label: string;
}

const COFFEE_STEAM_GONE_AFTER_MS = 25 * 60 * 1000;
const COFFEE_STEAM_BASE_RATE_MS = 3450;
const COFFEE_STEAM_COOLED_RATE_MS = 6800;
const COFFEE_CUP_SIP_WINDOW_BASE_MS = 1_300;
const COFFEE_CUP_MIN_SIP_WINDOW_MS = 650;
// Coffee's visual clock samples once per second. A sip can be noticed almost
// one sample late, so keep the state alive for one extra tick and let the CSS
// return-to-table keyframes finish before data-cup-sipping is removed.
const COFFEE_CUP_SIP_RENDER_SAMPLE_GRACE_MS = 1_000;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function positiveModulo(value: number, modulo: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(modulo) || modulo <= 0) {
    return 0;
  }
  return ((value % modulo) + modulo) % modulo;
}

function hasSixDigitHexColor(value: string | null | undefined): value is string {
  return /^#[0-9a-f]{6}$/i.test(value?.trim() ?? "");
}

export function coffeeCupPrismFamilyForBotColor(
  botColor: string | null | undefined
): CoffeeCupPrismFamily {
  const raw = botColor?.trim();
  if (!hasSixDigitHexColor(raw)) return "p";
  const { h } = hexToHsl(raw);
  if (h >= 315) return "p";
  if (h < 15) return "p";
  if (h < 75) return "r";
  if (h < 165) return "i";
  if (h < 245) return "s";
  return "m";
}

export function coffeeCupColorForBotColor(
  botColor: string | null | undefined
): CoffeeCupSpriteColor {
  switch (coffeeCupPrismFamilyForBotColor(botColor)) {
    case "p":
      return "red";
    case "r":
      return "orange";
    case "i":
      return "green";
    case "s":
      return "blue";
    case "m":
      return "purple";
  }
}

export function coffeeCupFramePosition(frameIndex: number): Pick<CoffeeCupVisualState, "frameX" | "frameY"> {
  const clamped = Math.max(0, Math.min(6, Math.round(frameIndex)));
  const col = clamped % 3;
  const row = Math.floor(clamped / 3);
  return {
    frameX: col === 0 ? "0%" : col === 1 ? "50%" : "100%",
    frameY: row === 0 ? "0%" : row === 1 ? "50%" : "100%",
  };
}

export function coffeeCupSippingActive(args: {
  seed: string;
  nowMs: number;
  progress: number;
  durationMinutes?: number | null;
  ambientSipAllowed?: boolean;
  speaking?: boolean;
  thinking?: boolean;
}): boolean {
  if (args.progress >= 0.96) return false;
  if (args.ambientSipAllowed === false) return false;
  if (args.speaking === true) return false;
  if (args.thinking === true) return false;
  if (!Number.isFinite(args.nowMs)) return false;
  const sipLikelihood = coffeeCupSipLikelihoodForProgress(args.progress);
  if (sipLikelihood <= 0) return false;
  const cycleMs = coffeeCupSipCycleMs(args.seed, args.durationMinutes);
  const sipAnimationMs = coffeeCupSipAnimationTiming({ seed: args.seed }).durationMs;
  const sipWindowMs = Math.max(
    COFFEE_CUP_MIN_SIP_WINDOW_MS,
    Math.round(COFFEE_CUP_SIP_WINDOW_BASE_MS * sipLikelihood),
    sipAnimationMs + COFFEE_CUP_SIP_RENDER_SAMPLE_GRACE_MS
  );
  const offsetMs = Math.round(stableUnitValue(`${args.seed}:offset`) * cycleMs);
  return positiveModulo(args.nowMs + offsetMs, cycleMs) < sipWindowMs;
}

export function coffeeCupSipAnimationTiming(args: {
  seed: string;
  sipCount?: number | null;
}): { durationMs: number; holdMs: number } {
  const wholeSipCount =
    typeof args.sipCount === "number" && Number.isFinite(args.sipCount)
      ? Math.max(1, Math.floor(args.sipCount))
      : 1;
  const holdBias = stableUnitValue(`${args.seed}:sip-hold:${wholeSipCount}`);
  const holdMs = Math.round(500 + holdBias * 1_700);
  return {
    holdMs,
    durationMs: 900 + holdMs,
  };
}

const COFFEE_CUP_SIP_POST_FRAME_PROGRESS = 0.82;

export function coffeeCupVisualSipCountForAnimation(args: {
  totalSipCount: number;
  activeSipAnimationCount?: number | null;
  animationAgeMs?: number | null;
  animationDurationMs?: number | null;
}): number {
  const totalSipCount = Number.isFinite(args.totalSipCount)
    ? Math.max(0, Math.floor(args.totalSipCount))
    : 0;
  const activeSipAnimationCount =
    typeof args.activeSipAnimationCount === "number" &&
    Number.isFinite(args.activeSipAnimationCount)
      ? Math.max(0, Math.floor(args.activeSipAnimationCount))
      : null;
  if (activeSipAnimationCount === null) return totalSipCount;
  const durationMs =
    typeof args.animationDurationMs === "number" && Number.isFinite(args.animationDurationMs)
      ? args.animationDurationMs
      : null;
  const ageMs =
    typeof args.animationAgeMs === "number" && Number.isFinite(args.animationAgeMs)
      ? args.animationAgeMs
      : null;
  const revealPostSipFrame =
    durationMs !== null &&
    durationMs > 0 &&
    ageMs !== null &&
    ageMs >= durationMs * COFFEE_CUP_SIP_POST_FRAME_PROGRESS;
  if (revealPostSipFrame) return Math.max(totalSipCount, activeSipAnimationCount);
  return Math.max(0, activeSipAnimationCount - 1);
}

export function coffeeCupProgressForSipCount(
  sipCount: number,
  baseProgress = 0
): number {
  if (!Number.isFinite(sipCount)) return 0;
  const baseline = clampUnit(baseProgress);
  const wholeSips = Math.max(0, Math.floor(sipCount));
  if (wholeSips <= 0) return baseline;
  return Math.min(0.96, baseline + wholeSips * 0.1);
}

function coffeeCupFinishedForSipCount(args: {
  seed: string;
  sipCount?: number | null;
  baseProgress?: number | null;
}): boolean {
  if (typeof args.sipCount !== "number" || !Number.isFinite(args.sipCount)) {
    return false;
  }
  const baseProgress =
    typeof args.baseProgress === "number" && Number.isFinite(args.baseProgress)
      ? clampUnit(args.baseProgress)
      : 0;
  const wholeSips = Math.max(0, Math.floor(args.sipCount));
  if (wholeSips <= 0) return false;
  return coffeeCupShouldFinishAfterSip({
    seed: args.seed,
    previousProgress: coffeeCupProgressForSipCount(wholeSips - 1, baseProgress),
    nextProgress: coffeeCupProgressForSipCount(wholeSips, baseProgress),
    sipCount: wholeSips,
  });
}

export function coffeeCupSipBelongsToCurrentFill(args: {
  messageCreatedAt?: string | null;
  topOff?: CoffeeCupTopOffSnapshot | null;
}): boolean {
  if (!args.topOff) return true;
  const toppedOffAtMs = Date.parse(args.topOff.toppedOffAt);
  if (!Number.isFinite(toppedOffAtMs)) return true;
  const messageCreatedAtMs =
    typeof args.messageCreatedAt === "string" ? Date.parse(args.messageCreatedAt) : Number.NaN;
  if (!Number.isFinite(messageCreatedAtMs)) return true;
  return messageCreatedAtMs > toppedOffAtMs;
}

function coffeeCupSteamBaseAlphaForFrame(frameIndex: number): number {
  if (frameIndex >= 6) return 0;
  if (frameIndex >= 5) return 0.16;
  if (frameIndex >= 4) return 0.28;
  if (frameIndex >= 3) return 0.4;
  return 0.52;
}

function coffeeCupElapsedSessionMs(args: {
  nowMs: number;
  sessionStartedAtMs?: number | null;
  sessionEndsAtMs?: number | null;
  durationMinutes?: number | null;
}): number | null {
  if (!Number.isFinite(args.nowMs)) return null;
  if (
    typeof args.sessionStartedAtMs === "number" &&
    Number.isFinite(args.sessionStartedAtMs)
  ) {
    return Math.max(0, args.nowMs - args.sessionStartedAtMs);
  }
  if (
    typeof args.sessionEndsAtMs === "number" &&
    Number.isFinite(args.sessionEndsAtMs) &&
    typeof args.durationMinutes === "number" &&
    Number.isFinite(args.durationMinutes) &&
    args.durationMinutes > 0
  ) {
    const durationMs = args.durationMinutes * 60 * 1000;
    const remainingMs = Math.max(0, args.sessionEndsAtMs - args.nowMs);
    return Math.max(0, durationMs - remainingMs);
  }
  return null;
}

function coffeeCupTimedProgressAtMs(args: {
  nowMs: number;
  sessionStartedAtMs?: number | null;
  sessionEndsAtMs?: number | null;
  durationMinutes?: number | null;
}): number | null {
  if (!Number.isFinite(args.nowMs)) return null;
  const durationMinutes =
    typeof args.durationMinutes === "number" &&
    Number.isFinite(args.durationMinutes) &&
    args.durationMinutes > 0
      ? args.durationMinutes
      : null;
  if (
    typeof args.sessionEndsAtMs === "number" &&
    Number.isFinite(args.sessionEndsAtMs) &&
    durationMinutes != null
  ) {
    return coffeeCupProgressFromSessionTiming({
      sessionRemainingMs: Math.max(0, args.sessionEndsAtMs - args.nowMs),
      durationMinutes,
    });
  }
  if (
    typeof args.sessionStartedAtMs === "number" &&
    Number.isFinite(args.sessionStartedAtMs) &&
    durationMinutes != null
  ) {
    const durationMs = durationMinutes * 60 * 1000;
    if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
    return clampUnit((args.nowMs - args.sessionStartedAtMs) / durationMs);
  }
  return null;
}

function coffeeCupSipGateTimes(args: {
  seed: string;
  nowMs: number;
  progress: number;
  durationMinutes?: number | null;
  speaking?: boolean | null;
  sessionStartedAtMs?: number | null;
  sessionEndsAtMs?: number | null;
}): { currentGateMs: number; previousGateMs: number } | null {
  if (!Number.isFinite(args.nowMs)) return null;
  const cycleMs = coffeeCupSipCycleMs(args.seed, args.durationMinutes);
  if (!Number.isFinite(cycleMs) || cycleMs <= 0) return null;
  const sipLikelihood = coffeeCupSipLikelihoodForProgress(
    Math.min(clampUnit(args.progress), 0.959)
  );
  if (sipLikelihood <= 0) return null;
  const sipWindowMs = Math.max(
    COFFEE_CUP_MIN_SIP_WINDOW_MS,
    Math.round(COFFEE_CUP_SIP_WINDOW_BASE_MS * sipLikelihood)
  );
  const offsetMs = Math.round(stableUnitValue(`${args.seed}:offset`) * cycleMs);
  const cyclePositionMs = positiveModulo(args.nowMs + offsetMs, cycleMs);
  const currentCycleStartMs = args.nowMs - cyclePositionMs;
  const currentSipVisible =
    args.speaking !== true && cyclePositionMs < sipWindowMs;
  const currentGateMs = currentSipVisible ? args.nowMs : currentCycleStartMs;
  const previousGateMs = currentCycleStartMs - cycleMs;
  const sessionStartedAtMs =
    typeof args.sessionStartedAtMs === "number" &&
    Number.isFinite(args.sessionStartedAtMs)
      ? args.sessionStartedAtMs
      : typeof args.sessionEndsAtMs === "number" &&
          Number.isFinite(args.sessionEndsAtMs) &&
          typeof args.durationMinutes === "number" &&
          Number.isFinite(args.durationMinutes) &&
          args.durationMinutes > 0
        ? args.sessionEndsAtMs - args.durationMinutes * 60 * 1000
        : null;
  return {
    currentGateMs:
      sessionStartedAtMs != null
        ? Math.max(sessionStartedAtMs, currentGateMs)
        : currentGateMs,
    previousGateMs:
      sessionStartedAtMs != null
        ? Math.max(sessionStartedAtMs, previousGateMs)
        : previousGateMs,
  };
}

export function coffeeCupSipGatedTimedProgress(args: {
  seed: string;
  nowMs: number;
  progress: number;
  sipProgress?: number | null;
  sessionStartedAtMs?: number | null;
  sessionEndsAtMs?: number | null;
  durationMinutes?: number | null;
  speaking?: boolean | null;
}): number {
  const rawProgress = clampUnit(args.progress);
  if (rawProgress <= 0) return 0;
  if (!Number.isFinite(args.nowMs)) return rawProgress;
  const progressForSip =
    typeof args.sipProgress === "number" && Number.isFinite(args.sipProgress)
      ? clampUnit(args.sipProgress)
      : rawProgress;
  const gateTimes = coffeeCupSipGateTimes({
    seed: args.seed,
    nowMs: args.nowMs,
    progress: progressForSip,
    durationMinutes: args.durationMinutes,
    speaking: args.speaking,
    sessionStartedAtMs: args.sessionStartedAtMs,
    sessionEndsAtMs: args.sessionEndsAtMs,
  });
  if (!gateTimes) return rawProgress;
  const gatedProgress = coffeeCupTimedProgressAtMs({
    nowMs: gateTimes.currentGateMs,
    sessionStartedAtMs: args.sessionStartedAtMs,
    sessionEndsAtMs: args.sessionEndsAtMs,
    durationMinutes: args.durationMinutes,
  });
  return Math.min(rawProgress, gatedProgress ?? rawProgress);
}

export function coffeeCupSteamVisualState(args: {
  nowMs: number;
  frameIndex: number;
  progress: number;
  sessionStartedAtMs?: number | null;
  sessionEndsAtMs?: number | null;
  durationMinutes?: number | null;
  forceEmpty?: boolean;
}): Pick<CoffeeCupVisualState, "steamAlpha" | "steamRateMs"> {
  const baseAlpha =
    args.forceEmpty === true ? 0 : coffeeCupSteamBaseAlphaForFrame(args.frameIndex);
  if (baseAlpha <= 0) {
    return { steamAlpha: 0, steamRateMs: COFFEE_STEAM_COOLED_RATE_MS };
  }
  const fillRatio = coffeeCupFillRatioForProgress(args.progress);
  const coldness = coffeeCupColdnessForProgress(args.progress);
  if (fillRatio <= 0.12 || coldness >= 0.9) {
    return { steamAlpha: 0, steamRateMs: COFFEE_STEAM_COOLED_RATE_MS };
  }
  const fillAlpha = Math.max(0, Math.min(1, (fillRatio - 0.12) / 0.38));
  const temperatureAlpha = Math.max(0, Math.min(1, (0.9 - coldness) / 0.9));
  const elapsedMs = coffeeCupElapsedSessionMs(args);
  if (elapsedMs == null) {
    return {
      steamAlpha: baseAlpha * fillAlpha * temperatureAlpha,
      steamRateMs: COFFEE_STEAM_BASE_RATE_MS,
    };
  }
  const coolingProgress = Math.max(
    0,
    Math.min(1, elapsedMs / COFFEE_STEAM_GONE_AFTER_MS)
  );
  const remainingHeat = 1 - coolingProgress;
  const sessionAlpha = Math.pow(remainingHeat, 1.45);
  return {
    steamAlpha: baseAlpha * fillAlpha * temperatureAlpha * sessionAlpha,
    steamRateMs: Math.round(
      COFFEE_STEAM_BASE_RATE_MS +
        (COFFEE_STEAM_COOLED_RATE_MS - COFFEE_STEAM_BASE_RATE_MS) * coolingProgress
    ),
  };
}

function coffeeCupSeatLeftPercent(args: CoffeeCupSeatPlacementArgs): number {
  return args.compact
    ? ({ 0: 50, 1: 21, 2: 79, 3: 28, 4: 72 } as Record<number, number>)[
        args.seatIndex
      ] ?? 50
    : args.seatCount === 2
      ? args.layoutIndex === 0
        ? 25
        : 75
      : ({
          "3:0": 50,
          "3:1": 26,
          "3:2": 74,
          "4:0": 24,
          "4:1": 76,
          "4:2": 76,
          "4:3": 24,
          "5:0": 50,
          "5:1": 21,
          "5:2": 79,
          "5:3": 29,
          "5:4": 71,
        } as Record<string, number>)[`${args.seatCount}:${args.layoutIndex}`] ?? 50;
}

function coffeeCupTopSideForSeed(args: CoffeeCupSeatPlacementArgs): CoffeeCupPlacementSide {
  const seed =
    typeof args.sessionSeed === "string" && args.sessionSeed.trim().length > 0
      ? args.sessionSeed.trim()
      : "draft";
  return stableUnitValue(`${seed}:coffee-cup-top-side`) < 0.5 ? "left" : "right";
}

export function coffeeCupSideForSeat(args: CoffeeCupSeatPlacementArgs): CoffeeCupPlacementSide {
  const leftPercent = coffeeCupSeatLeftPercent(args);
  if (leftPercent === 50) return coffeeCupTopSideForSeed(args);
  return leftPercent > 50 ? "left" : "right";
}

export function coffeeCupShouldMirrorForSeat(args: CoffeeCupSeatPlacementArgs): boolean {
  const leftPercent = coffeeCupSeatLeftPercent(args);
  if (leftPercent === 50) return coffeeCupSideForSeat(args) === "right";
  return leftPercent < 50;
}

function coffeeCupSpritePath(args: {
  color: CoffeeCupSpriteColor;
  sip?: boolean;
  theme?: CoffeeCupSpriteTheme | null;
}): string {
  const themePrefix = args.theme === "light" ? "coffee_light" : "coffee";
  const sipSuffix = args.sip === true ? "_sip" : "";
  return `/coffee-cups/${themePrefix}_${args.color}${sipSuffix}.png`;
}

export function buildCoffeeCupVisualState(args: {
  seed: string;
  botColor?: string | null;
  theme?: CoffeeCupSpriteTheme | null;
  nowMs: number;
  sessionStartedAtMs?: number | null;
  sessionEndsAtMs?: number | null;
  durationMinutes?: number | null;
  powerRateMultiplier?: number;
  progressOverride?: number | null;
  topOff?: CoffeeCupTopOffSnapshot | null;
  sipCount?: number | null;
  sippingOverride?: boolean | null;
  sipLockedUntilMs?: number | null;
  ambientSipAllowed?: boolean;
  speaking?: boolean;
  thinking?: boolean;
  forceEmpty?: boolean;
  finished?: boolean;
  finishSeed?: string | null;
}): CoffeeCupVisualState {
  const color = coffeeCupColorForBotColor(args.botColor);
  if (args.powerRateMultiplier === 0) {
    const temperatureProgress =
      typeof args.progressOverride === "number" &&
      Number.isFinite(args.progressOverride)
        ? clampUnit(args.progressOverride)
        : (coffeeCupTimedProgressAtMs({
            nowMs: args.nowMs,
            sessionStartedAtMs: args.sessionStartedAtMs,
            sessionEndsAtMs: args.sessionEndsAtMs,
            durationMinutes: args.durationMinutes,
          }) ?? 0);
    const status = coffeeCupStatusForFillAndTemperatureProgress(
      0,
      temperatureProgress,
      args.seed,
    );
    const position = coffeeCupFramePosition(status.frameIndex);
    const sipTiming = coffeeCupSipAnimationTiming({ seed: args.seed });
    const steam = coffeeCupSteamVisualState({
      nowMs: args.nowMs,
      frameIndex: status.frameIndex,
      progress: temperatureProgress,
      sessionStartedAtMs: args.sessionStartedAtMs,
      sessionEndsAtMs: args.sessionEndsAtMs,
      durationMinutes: args.durationMinutes,
    });
    return {
      ...status,
      ...position,
      color,
      restImageUrl: coffeeCupSpritePath({ color, theme: args.theme }),
      sipImageUrl: coffeeCupSpritePath({
        color,
        theme: args.theme,
        sip: true,
      }),
      sipping: false,
      sipAnimationMs: sipTiming.durationMs,
      sipHoldMs: sipTiming.holdMs,
      steamAlpha: steam.steamAlpha,
      steamRateMs: steam.steamRateMs,
      finished: false,
      label: `${color} coffee cup, ${status.amountLabel}, ${status.temperatureLabel}`,
    };
  }
  const finishSeed = args.finishSeed?.trim() || args.seed;
  const sipLocked =
    typeof args.sipLockedUntilMs === "number" &&
    Number.isFinite(args.sipLockedUntilMs) &&
    Number.isFinite(args.nowMs) &&
    args.nowMs < args.sipLockedUntilMs;
  const sippingOverride =
    sipLocked || args.speaking === true || args.thinking === true
      ? false
      : args.sippingOverride;
  const sipBaseProgress =
    args.topOff && Number.isFinite(args.topOff.progressAfter)
      ? clampUnit(args.topOff.progressAfter)
      : 0;
  const finishedBySip =
    args.forceEmpty !== true &&
    coffeeCupFinishedForSipCount({
      seed: finishSeed,
      sipCount: args.sipCount,
      baseProgress: sipBaseProgress,
    });
  const finished = args.finished === true || finishedBySip;
  const finishingSipActive =
    finishedBySip && sippingOverride === true && args.finished !== true && args.forceEmpty !== true;
  const explicitSipProgress =
    args.forceEmpty === true || (finished && !finishingSipActive)
      ? 1
      : typeof args.sipCount === "number" &&
          Number.isFinite(args.sipCount) &&
          args.sipCount > 0
        ? coffeeCupProgressForSipCount(args.sipCount, sipBaseProgress)
        : null;
  const timedProgress =
    args.forceEmpty === true || (finished && !finishingSipActive)
      ? 1
      : typeof args.progressOverride === "number" &&
          Number.isFinite(args.progressOverride)
        ? args.progressOverride
      : coffeeCupTimedProgressAtMs({
          nowMs: args.nowMs,
          sessionStartedAtMs: args.sessionStartedAtMs,
          sessionEndsAtMs: args.sessionEndsAtMs,
          durationMinutes: args.durationMinutes,
        });
  const explicitProgress =
    typeof args.progressOverride === "number" && Number.isFinite(args.progressOverride)
      ? args.progressOverride
      : null;
  const rawPacedProgress =
    args.forceEmpty === true || (finished && !finishingSipActive)
      ? 1
      : coffeeCupPacedProgress(
          timedProgress ?? 0,
          args.seed,
          args.durationMinutes,
          args.powerRateMultiplier
        );
  const gatedTimedProgress =
    explicitProgress == null && timedProgress != null
      ? coffeeCupSipGatedTimedProgress({
          seed: args.seed,
          nowMs: args.nowMs,
          progress: timedProgress,
          sipProgress: rawPacedProgress,
          sessionStartedAtMs: args.sessionStartedAtMs,
          sessionEndsAtMs: args.sessionEndsAtMs,
          durationMinutes: args.durationMinutes,
          speaking: args.speaking,
        })
      : timedProgress;
  const previousTimedSipGateProgress =
    explicitProgress == null && timedProgress != null
      ? (() => {
          const gateTimes = coffeeCupSipGateTimes({
            seed: args.seed,
            nowMs: args.nowMs,
            progress: rawPacedProgress,
            durationMinutes: args.durationMinutes,
            speaking: args.speaking,
            sessionStartedAtMs: args.sessionStartedAtMs,
            sessionEndsAtMs: args.sessionEndsAtMs,
          });
          return gateTimes
            ? coffeeCupTimedProgressAtMs({
                nowMs: gateTimes.previousGateMs,
                sessionStartedAtMs: args.sessionStartedAtMs,
                sessionEndsAtMs: args.sessionEndsAtMs,
                durationMinutes: args.durationMinutes,
            })
            : null;
        })()
      : null;
  const pacedProgress =
    args.forceEmpty === true || (finished && !finishingSipActive)
      ? 1
      : coffeeCupPacedProgress(
          gatedTimedProgress ?? 0,
          args.seed,
          args.durationMinutes,
          args.powerRateMultiplier
        );
  const topOffBaseProgress =
    args.topOff && explicitProgress != null ? explicitProgress : pacedProgress;
  const ambientVisibleProgress = coffeeCupProgressAfterTopOff({
    progress: topOffBaseProgress,
    topOff: args.topOff,
    nowMs: args.nowMs,
    durationMinutes: args.durationMinutes,
    seed: args.seed,
    lowerProgressMeansConsumption: false,
  });
  const rawTopOffBaseProgress =
    args.topOff && explicitProgress != null ? explicitProgress : rawPacedProgress;
  const ambientSipTriggerProgress = coffeeCupProgressAfterTopOff({
    progress: rawTopOffBaseProgress,
    topOff: args.topOff,
    nowMs: args.nowMs,
    durationMinutes: args.durationMinutes,
    seed: args.seed,
    lowerProgressMeansConsumption: false,
  });
  const visibleProgress =
    args.forceEmpty === true || (finished && !finishingSipActive)
      ? 1
      : explicitSipProgress != null
        ? Math.max(ambientVisibleProgress, explicitSipProgress)
        : ambientVisibleProgress;
  const sipTriggerProgress =
    explicitSipProgress != null
      ? Math.max(ambientSipTriggerProgress, explicitSipProgress)
      : ambientSipTriggerProgress;
  const status = coffeeCupStatusForProgress(visibleProgress, args.seed);
  const previousAmbientSipGateProgress =
    previousTimedSipGateProgress != null
      ? coffeeCupProgressAfterTopOff({
          progress: coffeeCupPacedProgress(
            previousTimedSipGateProgress,
            args.seed,
            args.durationMinutes,
            args.powerRateMultiplier
          ),
        topOff: args.topOff,
        nowMs: args.nowMs,
        durationMinutes: args.durationMinutes,
        seed: args.seed,
        lowerProgressMeansConsumption: false,
      })
      : null;
  const previousExplicitSipProgress =
    typeof args.sipCount === "number" &&
    Number.isFinite(args.sipCount) &&
    args.sipCount > 0
      ? coffeeCupProgressForSipCount(args.sipCount - 1, sipBaseProgress)
      : null;
  const previousSipGateProgress =
    previousExplicitSipProgress != null
      ? Math.max(
          previousAmbientSipGateProgress ?? 0,
          previousExplicitSipProgress,
        )
      : previousAmbientSipGateProgress;
  const previousSipGateFrameIndex =
    previousSipGateProgress != null
      ? coffeeCupStatusForProgress(previousSipGateProgress, args.seed).frameIndex
      : null;
  const finalFrameReachedByThisSip =
    status.frameIndex >= 6 &&
    previousSipGateFrameIndex !== null &&
    previousSipGateFrameIndex < 6;
  const position = coffeeCupFramePosition(status.frameIndex);
  const topOffHeatStartedAtMs =
    args.topOff && Number.isFinite(Date.parse(args.topOff.toppedOffAt))
      ? Date.parse(args.topOff.toppedOffAt)
      : null;
  const sipTiming = coffeeCupSipAnimationTiming({
    seed: args.seed,
    sipCount: args.sipCount,
  });
  const sipping =
    args.forceEmpty === true || args.finished === true
      ? false
      : typeof sippingOverride === "boolean"
      ? sippingOverride && (status.progress < 0.96 || finishingSipActive)
      : coffeeCupSippingActive({
          seed: args.seed,
          nowMs: args.nowMs,
          progress: finalFrameReachedByThisSip
            ? Math.min(sipTriggerProgress, 0.959)
            : sipTriggerProgress,
          durationMinutes: args.durationMinutes,
          ambientSipAllowed: args.ambientSipAllowed,
          speaking: args.speaking === true,
          thinking: args.thinking === true,
        });
  const steam = coffeeCupSteamVisualState({
    nowMs: args.nowMs,
    frameIndex: status.frameIndex,
    progress: status.progress,
    sessionStartedAtMs:
      topOffHeatStartedAtMs != null &&
      Number.isFinite(args.nowMs) &&
      args.nowMs >= topOffHeatStartedAtMs
        ? topOffHeatStartedAtMs
        : args.sessionStartedAtMs,
    sessionEndsAtMs: args.sessionEndsAtMs,
    durationMinutes: args.durationMinutes,
    forceEmpty: args.forceEmpty || finished,
  });
  return {
    ...status,
    ...position,
    color,
    restImageUrl: coffeeCupSpritePath({ color, theme: args.theme }),
    sipImageUrl: coffeeCupSpritePath({ color, theme: args.theme, sip: true }),
    sipping,
    sipAnimationMs: sipTiming.durationMs,
    sipHoldMs: sipTiming.holdMs,
    steamAlpha: steam.steamAlpha,
    steamRateMs: steam.steamRateMs,
    finished,
    label: `${color} coffee cup, ${status.amountLabel}, ${status.temperatureLabel}`,
  };
}
