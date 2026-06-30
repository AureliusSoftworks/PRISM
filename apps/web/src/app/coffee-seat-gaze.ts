/** Horizontal band of the table oval: left of center, center column, or right. */
export type CoffeeSeatHorizontalSide = -1 | 0 | 1;

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
 * Top seat faces a target on the left half of the table with the same flip as
 * left-side seats; targets on the right stay unflipped.
 */
export function coffeeHeadPlateFaceScaleYFromGazeTargetSide(
  targetSide: CoffeeSeatHorizontalSide
): string {
  return targetSide === -1 ? "-1" : "1";
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
  if (compact) {
    const leftBySeat: Record<number, number> = {
      0: 50,
      1: 21,
      2: 79,
      3: 28,
      4: 72,
    };
    const left = leftBySeat[seatIndex] ?? 50;
    if (left < 50) return -1;
    if (left > 50) return 1;
    return 0;
  }
  if (seatCount === 2) {
    const left = layoutIndex === 0 ? 25 : 75;
    return left < 50 ? -1 : 1;
  }
  const key = `${seatCount}:${layoutIndex}`;
  const leftByLayout: Record<string, number> = {
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
  };
  const left = leftByLayout[key] ?? 50;
  if (left < 50) return -1;
  if (left > 50) return 1;
  return 0;
}

/** Top-of-table head seat: compact `seatIndex === 0`, or the centered full-ring top seat. */
export function coffeeSeatIsTopHead(
  compact: boolean,
  seatCount: number,
  layoutIndex: number,
  seatIndex: number
): boolean {
  if (compact) return seatIndex === 0;
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
