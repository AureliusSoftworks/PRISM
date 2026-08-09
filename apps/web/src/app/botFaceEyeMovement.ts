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

type BotFaceGazeProfile = {
  holdMinMs: number;
  holdSpanMs: number;
  maxX: number;
  maxY: number;
  transitionMinMs: number;
  transitionSpanMs: number;
  /** Chance idle gazes rest on center instead of glancing. */
  idleCenterChance: number;
  /** Scales state-authored amplitudes before clamping. */
  amplitudeScale: number;
  /** Chance speaking eyes glance away from dead-center. */
  speakingGlanceChance: number;
  /**
   * Extra bias toward extreme left/right for paranoid scanning.
   * 0 = none; 1 = almost always pinned near the edges.
   */
  extremeBias: number;
};

const BOT_FACE_GAZE_PROFILES: Record<
  Exclude<BotFaceEyeMovement, "still">,
  BotFaceGazeProfile
> = {
  natural: {
    holdMinMs: 3_000,
    holdSpanMs: 4_000,
    maxX: 4,
    maxY: 2,
    transitionMinMs: 180,
    transitionSpanMs: 80,
    idleCenterChance: 0.42,
    amplitudeScale: 1,
    speakingGlanceChance: 0.24,
    extremeBias: 0,
  },
  nervous: {
    holdMinMs: 900,
    holdSpanMs: 1_300,
    maxX: 5,
    maxY: 2.5,
    transitionMinMs: 90,
    transitionSpanMs: 70,
    idleCenterChance: 0.2,
    amplitudeScale: 1.18,
    speakingGlanceChance: 0.48,
    extremeBias: 0.12,
  },
  frantic: {
    holdMinMs: 280,
    holdSpanMs: 620,
    maxX: 6.2,
    maxY: 3.1,
    transitionMinMs: 48,
    transitionSpanMs: 55,
    idleCenterChance: 0.07,
    amplitudeScale: 1.38,
    speakingGlanceChance: 0.72,
    extremeBias: 0.28,
  },
  paranoid: {
    holdMinMs: 140,
    holdSpanMs: 520,
    maxX: 7.2,
    maxY: 3.6,
    transitionMinMs: 28,
    transitionSpanMs: 48,
    idleCenterChance: 0.02,
    amplitudeScale: 1.62,
    speakingGlanceChance: 0.9,
    extremeBias: 0.72,
  },
};

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

function applyExtremeBias(
  xPx: number,
  sample: (channel: string) => number,
  extremeBias: number,
  maxX: number,
): number {
  if (extremeBias <= 0) return xPx;
  if (sample("extreme") >= extremeBias) return xPx;
  const side = sample("extreme-side") < 0.5 ? -1 : 1;
  const edge = maxX * (0.72 + sample("extreme-depth") * 0.28);
  return side * edge;
}

/** Pure, seek-stable gaze choreography. It owns no timers or experience state. */
export function resolveBotFaceGazeFrame(args: {
  seed: string;
  timelineMs: number;
  stateStartedAtMs?: number;
  state: BotFaceAttentionState;
  targetDirection?: BotFaceGazeDirection;
  movement?: BotFaceEyeMovement | null;
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
  const amp = profile.amplitudeScale;

  let xPx = 0;
  let yPx = 0;
  if (args.state === "thinking") {
    const thinkingSide = sample("side") < 0.5 ? -1 : 1;
    xPx = thinkingSide * (1.8 + sample("x") * 1.1) * amp;
    yPx = -(1.1 + sample("y") * 0.9) * amp;
  } else if (args.state === "listening") {
    xPx =
      target * (2.25 + sample("target") * 0.85) * amp + signed("x") * 0.7 * amp;
    yPx = signed("y") * 0.75 * amp;
  } else if (args.state === "speaking") {
    if (target === 0) {
      // Room-facing speech: keep natural idle-like wander with frequent
      // left/right glances so faces stay alive while the mouth moves.
      const roomGlanceChance = Math.max(profile.speakingGlanceChance, 0.62);
      const glance = sample("glance") > 1 - roomGlanceChance;
      const side = sample("side") < 0.5 ? -1 : 1;
      xPx = glance
        ? side * (1.35 + sample("target") * 1.35) * amp + signed("x") * 0.55 * amp
        : signed("x") * 2.4 * amp;
    } else {
      const glance = sample("glance") > 1 - profile.speakingGlanceChance;
      xPx = glance
        ? target * (1.2 + sample("target") * 0.8) * amp + signed("x") * amp
        : signed("x") * 0.85 * amp;
    }
    // Match Avatar Studio's speech simulation: talking can glance sideways,
    // but the eye line remains vertically registered while the mouth moves.
    yPx = 0;
  } else {
    const restingCentered = sample("center") < profile.idleCenterChance;
    xPx = restingCentered ? 0 : signed("x") * 3.2 * amp;
    yPx = restingCentered ? 0 : signed("y") * 1.35 * amp;
  }

  xPx = applyExtremeBias(xPx, sample, profile.extremeBias, profile.maxX);

  return {
    xPx: rounded(Math.max(-profile.maxX, Math.min(profile.maxX, xPx))),
    yPx: rounded(Math.max(-profile.maxY, Math.min(profile.maxY, yPx))),
    transitionMs:
      profile.transitionMinMs +
      Math.round(sample("transition") * profile.transitionSpanMs),
  };
}
