/** Horizontal band of the table oval: left of center, center column, or right. */
export type CoffeeSeatHorizontalSide = -1 | 0 | 1;
export type CoffeeSeatLayoutPhase =
  | "selecting"
  | "preview"
  | "topic"
  | "arriving"
  | "live"
  | "finished";

export interface CoffeeSeatCanvasLeftPercentArgs {
  compact: boolean;
  seatIndex: number;
  seatCount: number;
  layoutIndex: number;
  phase?: CoffeeSeatLayoutPhase;
  groupReady?: boolean;
  autoplayDock?: boolean;
  experimentalTableAngle?: boolean;
  replayActive?: boolean;
}

export interface CoffeeSeatCanvasLighting {
  leftPercent: number;
  metalRotationDeg: number;
  glareXPct: number;
  glareYPct: number;
  glareAngleDeg: number;
}

const COFFEE_SEAT_CENTER_LEFT_PERCENT_TOLERANCE = 4;
const COFFEE_SEAT_LIGHTING_HALF_SPAN_PERCENT = 36;

export function coffeeSeatHorizontalSideFromLeftPercent(
  leftPercent: number
): CoffeeSeatHorizontalSide {
  if (!Number.isFinite(leftPercent)) return 0;
  if (leftPercent < 50 - COFFEE_SEAT_CENTER_LEFT_PERCENT_TOLERANCE) return -1;
  if (leftPercent > 50 + COFFEE_SEAT_CENTER_LEFT_PERCENT_TOLERANCE) return 1;
  return 0;
}

function finiteSeatLeftPercent(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
}

function compactCoffeeSeatCanvasLeftPercent(args: CoffeeSeatCanvasLeftPercentArgs): number {
  if (args.phase === "selecting" && args.groupReady) {
    if (args.seatCount === 5) {
      return ({ 0: 50, 1: 29, 2: 71, 3: 33, 4: 67 } as Record<number, number>)[
        args.layoutIndex
      ] ?? 50;
    }
    if (args.seatCount === 4) {
      return ({ 0: 22, 1: 78, 2: 78, 3: 22 } as Record<number, number>)[
        args.layoutIndex
      ] ?? 50;
    }
  }

  if (args.phase === "selecting" && !args.groupReady && args.seatCount !== 4) {
    return ({ 0: 50, 1: 28, 2: 72, 3: 32, 4: 68 } as Record<number, number>)[
      args.seatIndex
    ] ?? 50;
  }

  if (args.seatCount === 4) {
    return ({ 0: 22, 1: 78, 2: 78, 3: 22 } as Record<number, number>)[
      args.layoutIndex
    ] ?? 50;
  }

  return ({ 0: 50, 1: 21, 2: 79, 3: 28, 4: 72 } as Record<number, number>)[
    args.seatIndex
  ] ?? 50;
}

function defaultCoffeeSeatCanvasLeftPercent(args: CoffeeSeatCanvasLeftPercentArgs): number {
  if (args.seatCount === 2) return args.layoutIndex === 0 ? 25 : 75;
  return ({
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

function dockedCoffeeSeatCanvasLeftPercent(args: CoffeeSeatCanvasLeftPercentArgs): number {
  return ({
    "2:0": 28,
    "2:1": 72,
    "3:0": 50,
    "3:1": 30,
    "3:2": 70,
    "4:0": 27,
    "4:1": 73,
    "4:2": 73,
    "4:3": 27,
    "5:0": 50,
    "5:1": 25,
    "5:2": 75,
    "5:3": 29,
    "5:4": 71,
  } as Record<string, number>)[`${args.seatCount}:${args.layoutIndex}`] ??
    defaultCoffeeSeatCanvasLeftPercent(args);
}

function experimentalCoffeeSeatCanvasLeftPercent(args: CoffeeSeatCanvasLeftPercentArgs): number {
  return ({
    "2:0": 18,
    "2:1": 82,
    "3:0": 50,
    "3:1": 22,
    "3:2": 78,
    "4:0": 18,
    "4:1": 82,
    "4:2": 78,
    "4:3": 22,
    "5:0": 50,
    "5:1": 14,
    "5:2": 86,
    "5:3": 16,
    "5:4": 84,
  } as Record<string, number>)[`${args.seatCount}:${args.layoutIndex}`] ??
    dockedCoffeeSeatCanvasLeftPercent(args);
}

/**
 * Returns the authored x-coordinate for a Coffee seat, matching the CSS table
 * geometry closely enough to drive spatial lighting and gaze decisions.
 */
export function coffeeSeatCanvasLeftPercent(args: CoffeeSeatCanvasLeftPercentArgs): number {
  if (args.compact) return finiteSeatLeftPercent(compactCoffeeSeatCanvasLeftPercent(args));

  const experimentalActive =
    args.experimentalTableAngle === true &&
    (args.phase === "live" || (args.phase === "finished" && args.replayActive === true));
  if (experimentalActive) {
    return finiteSeatLeftPercent(experimentalCoffeeSeatCanvasLeftPercent(args));
  }

  if (
    args.autoplayDock === true &&
    (args.phase === "arriving" || args.phase === "live")
  ) {
    return finiteSeatLeftPercent(dockedCoffeeSeatCanvasLeftPercent(args));
  }

  if (args.phase === "selecting" && args.groupReady === true && args.seatCount === 5) {
    return finiteSeatLeftPercent(
      ({ 0: 50, 1: 29, 2: 71, 3: 33, 4: 67 } as Record<number, number>)[
        args.layoutIndex
      ] ?? defaultCoffeeSeatCanvasLeftPercent(args)
    );
  }

  return finiteSeatLeftPercent(defaultCoffeeSeatCanvasLeftPercent(args));
}

export function coffeeSeatCanvasLightingFromLeftPercent(
  leftPercent: number,
  options: { topHead?: boolean; rosterPreview?: boolean } = {}
): CoffeeSeatCanvasLighting {
  const safeLeftPercent = finiteSeatLeftPercent(leftPercent);
  const xBalance = Math.max(
    -1,
    Math.min(1, (safeLeftPercent - 50) / COFFEE_SEAT_LIGHTING_HALF_SPAN_PERCENT)
  );
  const leftBias = Math.max(0, -xBalance);
  const rightBias = Math.max(0, xBalance);
  return {
    leftPercent: safeLeftPercent,
    metalRotationDeg: xBalance * 42,
    glareXPct: 48 + leftBias * 14 - rightBias * 10,
    glareYPct: options.rosterPreview ? 24 : options.topHead ? 34 : 22,
    glareAngleDeg: -16 - leftBias * 26 + rightBias * 50,
  };
}

/**
 * `scaleY` for a seat on the oval: after the 90° plate rotation, `scaleY`
 * controls the face's screen-horizontal direction. Left-side seats flip so
 * they read toward the table; right-side seats stay normal.
 */
export function coffeePlateFaceScaleYFromSeatHorizontalSide(
  side: CoffeeSeatHorizontalSide
): string {
  return side === -1 ? "-1" : "1";
}

/**
 * Top seat reads from the opposite side of the table. A left-side target should
 * keep the head unflipped; a right-side target should flip it toward the speaker.
 */
export function coffeeHeadPlateFaceScaleYFromGazeTargetSide(
  targetSide: CoffeeSeatHorizontalSide
): string {
  return targetSide === 1 ? "-1" : "1";
}

/**
 * Maps each seat to -1 / 0 / +1 from `left` vs 50%, matching
 * [`page.module.css`](page.module.css) `.coffeeSeat` layout rules.
 */
export function coffeeSeatHorizontalTableSide(
  compact: boolean,
  seatIndex: number,
  seatCount: number,
  layoutIndex: number
): CoffeeSeatHorizontalSide {
  return coffeeSeatHorizontalSideFromLeftPercent(
    coffeeSeatCanvasLeftPercent({ compact, seatIndex, seatCount, layoutIndex })
  );
}

/** Top-of-table head seat: compact `seatIndex === 0`, or the centered full-ring top seat. */
export function coffeeSeatIsTopHead(
  compact: boolean,
  seatCount: number,
  layoutIndex: number,
  seatIndex: number
): boolean {
  if (compact) return seatCount !== 4 && seatIndex === 0;
  return (seatCount === 3 || seatCount === 5) && layoutIndex === 0;
}

export interface CoffeeGazeMessage {
  role: string;
  botName?: string;
}

/**
 * When the head bot is speaking, infer who they are "facing" from the last committed
 * assistant turn that is not the head (walk backward). User turn → center (null).
 */
export function coffeeHeadSpeakingGazeTargetBotId(
  messages: readonly CoffeeGazeMessage[],
  headBotId: string,
  botNameToId: ReadonlyMap<string, string>
): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role === "assistant" && m.botName) {
      const id = botNameToId.get(m.botName);
      if (id && id !== headBotId) return id;
      continue;
    }
    if (m.role === "user") return null;
  }
  return null;
}

export type CoffeeTurnRhythmForGaze =
  | "idle"
  | "botThinking"
  | "playerComposing"
  | "userTableTyping"
  | "tableTyping"
  | "cooldown";

export interface CoffeeVisibleSeatForGaze {
  botId: string;
  seatIndex: number;
  layoutIndex: number;
}

/**
 * Horizontal target band for the top seat: which side of the ring the active speaker
 * (or inferred addressee) sits on — drives `coffeeHeadPlateFaceScaleYFromGazeTargetSide`.
 */
export function coffeeHeadGazeHorizontalSign(args: {
  compact: boolean;
  seatCount: number;
  visibleSeats: readonly CoffeeVisibleSeatForGaze[];
  headBotId: string;
  coffeeTurnRhythmState: CoffeeTurnRhythmForGaze;
  coffeePendingSpeakerBotId: string | null;
  headIsSpeaking: boolean;
  messages: readonly CoffeeGazeMessage[];
  botNameToId: ReadonlyMap<string, string>;
}): CoffeeSeatHorizontalSide {
  let targetBotId: string | null = null;
  if (
    args.coffeeTurnRhythmState === "tableTyping" &&
    args.coffeePendingSpeakerBotId &&
    args.coffeePendingSpeakerBotId !== args.headBotId
  ) {
    targetBotId = args.coffeePendingSpeakerBotId;
  } else if (args.headIsSpeaking) {
    targetBotId = coffeeHeadSpeakingGazeTargetBotId(
      args.messages,
      args.headBotId,
      args.botNameToId
    );
  }

  if (!targetBotId) return 0;

  const entry = args.visibleSeats.find((s) => s.botId === targetBotId);
  if (!entry) return 0;

  return coffeeSeatHorizontalTableSide(
    args.compact,
    entry.seatIndex,
    args.seatCount,
    entry.layoutIndex
  );
}
