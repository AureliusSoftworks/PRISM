import type { BotFaceEyeMovement } from "@localai/shared";
import { botFaceEyeMovementIsActive } from "@localai/shared";

export type BotFaceAttentionState =
  | "idle"
  | "listening"
  | "speaking"
  | "thinking";

export type BotFaceGazeDirection = -1 | 0 | 1;

export interface BotFaceGazeFrame {
  xPx: number;
  yPx: number;
  transitionMs: number;
}

/**
 * Eye movement selects *cadence only* — how often the eye moves and how
 * quickly it gets there. How far it travels is identical across every mode and
 * comes from eye size alone (see `botFaceGazeTravel`), so Paranoid is a
 * restless Natural rather than a wider-roaming one.
 *
 * `idleCenterChance` and `speakingGlanceChance` belong here rather than with
 * travel: they set how often a fixation is a glance instead of a rest, which
 * is frequency, not distance.
 */
type BotFaceGazeProfile = {
  holdMinMs: number;
  holdSpanMs: number;
  transitionMinMs: number;
  transitionSpanMs: number;
  /** Chance idle gazes rest on center instead of glancing. */
  idleCenterChance: number;
  /** Chance speaking eyes glance away from dead-center. */
  speakingGlanceChance: number;
};

const BOT_FACE_GAZE_PROFILES: Record<
  Exclude<BotFaceEyeMovement, "still">,
  BotFaceGazeProfile
> = {
  natural: {
    holdMinMs: 3_000,
    holdSpanMs: 4_000,
    transitionMinMs: 180,
    transitionSpanMs: 80,
    idleCenterChance: 0.42,
    speakingGlanceChance: 0.24,
  },
  nervous: {
    holdMinMs: 900,
    holdSpanMs: 1_300,
    transitionMinMs: 90,
    transitionSpanMs: 70,
    idleCenterChance: 0.2,
    speakingGlanceChance: 0.48,
  },
  frantic: {
    holdMinMs: 280,
    holdSpanMs: 620,
    transitionMinMs: 48,
    transitionSpanMs: 55,
    idleCenterChance: 0.07,
    speakingGlanceChance: 0.72,
  },
  paranoid: {
    holdMinMs: 140,
    holdSpanMs: 520,
    transitionMinMs: 28,
    transitionSpanMs: 48,
    idleCenterChance: 0.02,
    speakingGlanceChance: 0.9,
  },
};

/** Gaze travel at the default eye scale, shared by every movement mode. */
const BOT_FACE_GAZE_BASE_MAX_X = 5;
const BOT_FACE_GAZE_BASE_MAX_Y = 2.5;

/**
 * Travel envelope for an eye, derived from its size alone.
 *
 * A bigger eye has more socket to cross, so it should sweep proportionally
 * further; the arc reads the same at every size. Movement mode is deliberately
 * not an input here.
 */
export function botFaceGazeTravel(eyeScale?: number | null): {
  maxX: number;
  maxY: number;
} {
  const scale =
    typeof eyeScale === "number" && Number.isFinite(eyeScale) && eyeScale > 0
      ? eyeScale
      : 1;
  return {
    maxX: BOT_FACE_GAZE_BASE_MAX_X * scale,
    maxY: BOT_FACE_GAZE_BASE_MAX_Y * scale,
  };
}

/**
 * Authored screen Ink is registered against the centered face canvas. Keep
 * that registration intact while the bot is off-mic, then restore its chosen
 * eye choreography when it speaks.
 */
export function botFaceEyeMovementPreservingInkRegistration(args: {
  movement: BotFaceEyeMovement;
  hasVisibleInk: boolean;
  talking: boolean;
}): BotFaceEyeMovement {
  return args.hasVisibleInk && !args.talking ? "still" : args.movement;
}

/** Live eye-timeline tick rate — busier modes refresh more often. */
export function botFaceEyeMovementLiveIntervalMs(
  movement: BotFaceEyeMovement | null | undefined,
): number {
  switch (movement) {
    case "nervous":
      return 180;
    case "frantic":
      return 110;
    case "paranoid":
      return 80;
    case "natural":
      return 250;
    case "still":
    case null:
    case undefined:
      return 250;
    default: {
      const _exhaustive: never = movement;
      return _exhaustive;
    }
  }
}

function hash32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(seed: string): number {
  return hash32(seed) / 0xffffffff;
}

function fixationAt(
  seed: string,
  elapsedMs: number,
  profile: BotFaceGazeProfile,
): { index: number; startedAtMs: number } {
  let index = 0;
  let startedAtMs = 0;
  const targetMs = Math.max(0, elapsedMs);
  while (index < 10_000) {
    const durationMs =
      profile.holdMinMs +
      Math.round(unit(`${seed}:hold:${index}`) * profile.holdSpanMs);
    if (startedAtMs + durationMs > targetMs) break;
    startedAtMs += durationMs;
    index += 1;
  }
  return { index, startedAtMs };
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Pure, seek-stable gaze choreography. It owns no timers or experience state. */
export function resolveBotFaceGazeFrame(args: {
  seed: string;
  timelineMs: number;
  stateStartedAtMs?: number;
  state: BotFaceAttentionState;
  targetDirection?: BotFaceGazeDirection;
  movement?: BotFaceEyeMovement | null;
  /** Eye size; the sole input to how far the gaze travels. */
  eyeScale?: number | null;
}): BotFaceGazeFrame {
  const movement = args.movement ?? "natural";
  if (!botFaceEyeMovementIsActive(movement)) {
    return { xPx: 0, yPx: 0, transitionMs: 0 };
  }
  const profile = BOT_FACE_GAZE_PROFILES[movement];
  const stateStartedAtMs = Math.max(0, args.stateStartedAtMs ?? 0);
  const elapsedMs = Math.max(0, args.timelineMs - stateStartedAtMs);
  const stateSeed = `${args.seed}:${movement}:${args.state}:${stateStartedAtMs}`;
  const fixation = fixationAt(stateSeed, elapsedMs, profile);
  const sample = (channel: string) =>
    unit(`${stateSeed}:${fixation.index}:${channel}`);
  const signed = (channel: string) => sample(channel) * 2 - 1;
  const target = args.targetDirection ?? 0;
  const { maxX, maxY } = botFaceGazeTravel(args.eyeScale);

  // Displacements are fractions of the travel envelope, never raw pixels, so
  // the same choreography scales cleanly with eye size and stays identical
  // across movement modes.
  let x = 0;
  let y = 0;
  if (args.state === "thinking") {
    const thinkingSide = sample("side") < 0.5 ? -1 : 1;
    x = thinkingSide * (0.36 + sample("x") * 0.22);
    y = -(0.44 + sample("y") * 0.36);
  } else if (args.state === "listening") {
    x = target * (0.45 + sample("target") * 0.17) + signed("x") * 0.14;
    y = signed("y") * 0.3;
  } else if (args.state === "speaking") {
    if (target === 0) {
      // Room-facing speech: keep natural idle-like wander with frequent
      // left/right glances so faces stay alive while the mouth moves.
      const roomGlanceChance = Math.max(profile.speakingGlanceChance, 0.62);
      const glance = sample("glance") > 1 - roomGlanceChance;
      const side = sample("side") < 0.5 ? -1 : 1;
      x = glance
        ? side * (0.27 + sample("target") * 0.27) + signed("x") * 0.11
        : signed("x") * 0.48;
    } else {
      const glance = sample("glance") > 1 - profile.speakingGlanceChance;
      x = glance
        ? target * (0.24 + sample("target") * 0.16) + signed("x") * 0.2
        : signed("x") * 0.17;
    }
    // Match Avatar Studio's speech simulation: talking can glance sideways,
    // but the eye line remains vertically registered while the mouth moves.
    y = 0;
  } else {
    const restingCentered = sample("center") < profile.idleCenterChance;
    x = restingCentered ? 0 : signed("x") * 0.64;
    y = restingCentered ? 0 : signed("y") * 0.54;
  }

  return {
    xPx: rounded(Math.max(-maxX, Math.min(maxX, x * maxX))),
    yPx: rounded(Math.max(-maxY, Math.min(maxY, y * maxY))),
    transitionMs:
      profile.transitionMinMs +
      Math.round(sample("transition") * profile.transitionSpanMs),
  };
}
