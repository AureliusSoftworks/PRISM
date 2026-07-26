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
): { index: number; startedAtMs: number } {
  let index = 0;
  let startedAtMs = 0;
  const targetMs = Math.max(0, elapsedMs);
  while (index < 10_000) {
    const durationMs = 3_000 + Math.round(unit(`${seed}:hold:${index}`) * 4_000);
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
}): BotFaceGazeFrame {
  const stateStartedAtMs = Math.max(0, args.stateStartedAtMs ?? 0);
  const elapsedMs = Math.max(0, args.timelineMs - stateStartedAtMs);
  const stateSeed = `${args.seed}:${args.state}:${stateStartedAtMs}`;
  const fixation = fixationAt(stateSeed, elapsedMs);
  const sample = (channel: string) =>
    unit(`${stateSeed}:${fixation.index}:${channel}`);
  const signed = (channel: string) => sample(channel) * 2 - 1;
  const target = args.targetDirection ?? 0;

  let xPx = 0;
  let yPx = 0;
  if (args.state === "thinking") {
    const thinkingSide = sample("side") < 0.5 ? -1 : 1;
    xPx = thinkingSide * (1.8 + sample("x") * 1.1);
    yPx = -(1.1 + sample("y") * 0.9);
  } else if (args.state === "listening") {
    xPx = target * (2.25 + sample("target") * 0.85) + signed("x") * 0.7;
    yPx = signed("y") * 0.75;
  } else if (args.state === "speaking") {
    const glance = sample("glance") > 0.76;
    xPx = glance ? target * (1.2 + sample("target") * 0.8) + signed("x") : 0;
    yPx = glance ? signed("y") * 0.65 : 0;
  } else {
    const restingCentered = sample("center") < 0.42;
    xPx = restingCentered ? 0 : signed("x") * 3.2;
    yPx = restingCentered ? 0 : signed("y") * 1.35;
  }

  return {
    xPx: rounded(Math.max(-4, Math.min(4, xPx))),
    yPx: rounded(Math.max(-2, Math.min(2, yPx))),
    transitionMs: 180 + Math.round(sample("transition") * 80),
  };
}
