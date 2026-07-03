import {
  COFFEE_SESSION_DURATION_MINUTES_MAX,
  COFFEE_SESSION_DURATION_MINUTES_MIN,
  DEFAULT_COFFEE_SESSION_DURATION_MINUTES,
  type CoffeeArrivalScenario,
  type CoffeeSessionDurationMinutes,
} from "@localai/shared";

export const COFFEE_ARRIVAL_WINDOW_MS = 180_000;
const COFFEE_SESSION_DURATION_MS = DEFAULT_COFFEE_SESSION_DURATION_MINUTES * 60 * 1000;
const COFFEE_ARRIVAL_SAME_TIME_CHANCE = 0.16;
const COFFEE_ARRIVAL_CLOSE_GAP_CHANCE = 0.34;
const COFFEE_ARRIVAL_NORMAL_GAP_CHANCE = 0.32;
const COFFEE_ARRIVAL_CLOSE_GAP_MIN_MS = 450;
const COFFEE_ARRIVAL_CLOSE_GAP_MAX_MS = 2_400;
const COFFEE_ARRIVAL_NORMAL_GAP_MIN_MS = 3_200;
const COFFEE_ARRIVAL_NORMAL_GAP_MAX_MS = 8_500;
const COFFEE_ARRIVAL_LONG_GAP_MIN_MS = 24_000;
const COFFEE_ARRIVAL_LONG_GAP_MAX_MS = COFFEE_ARRIVAL_WINDOW_MS;
export const COFFEE_ARRIVAL_WALK_MIN_MS = 2_650;
export const COFFEE_ARRIVAL_WALK_MAX_MS = 3_950;
const COFFEE_ARRIVAL_SEAT_OFFSET_MIN_PX = 2.5;
const COFFEE_ARRIVAL_SEAT_OFFSET_MAX_PX = 7.5;
const COFFEE_ARRIVAL_WALK_EASINGS = [
  "cubic-bezier(0.14, 0.78, 0.22, 1)",
  "cubic-bezier(0.18, 0.72, 0.2, 1)",
  "cubic-bezier(0.12, 0.86, 0.3, 1)",
] as const;

export type CoffeeArrivalPlanEntry = {
  botId: string;
  delayMs: number;
};

export type CoffeeArrivalMotionProfile = {
  walkDurationMs: number;
  walkEasing: (typeof COFFEE_ARRIVAL_WALK_EASINGS)[number];
  seatOffsetX: number;
  seatOffsetY: number;
};

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function roundedTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function coffeeArrivalDelayClamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function coffeeSessionDurationMs(
  conversation:
    | Pick<{ coffeeSessionDurationMinutes?: CoffeeSessionDurationMinutes }, "coffeeSessionDurationMinutes">
    | null
    | undefined
): number {
  const minutes = conversation?.coffeeSessionDurationMinutes;
  if (
    typeof minutes === "number" &&
    Number.isInteger(minutes) &&
    minutes >= COFFEE_SESSION_DURATION_MINUTES_MIN &&
    minutes <= COFFEE_SESSION_DURATION_MINUTES_MAX
  ) {
    return minutes * 60 * 1000;
  }
  return COFFEE_SESSION_DURATION_MS;
}

function coffeeArrivalGapMs(seed: string): number {
  const roll = stableUnitValue(`${seed}:kind`);
  if (roll < COFFEE_ARRIVAL_SAME_TIME_CHANCE) return 0;
  const amount = stableUnitValue(`${seed}:amount`);
  if (roll < COFFEE_ARRIVAL_SAME_TIME_CHANCE + COFFEE_ARRIVAL_CLOSE_GAP_CHANCE) {
    return coffeeArrivalDelayClamp(
      COFFEE_ARRIVAL_CLOSE_GAP_MIN_MS +
        amount * (COFFEE_ARRIVAL_CLOSE_GAP_MAX_MS - COFFEE_ARRIVAL_CLOSE_GAP_MIN_MS),
      COFFEE_ARRIVAL_CLOSE_GAP_MIN_MS,
      COFFEE_ARRIVAL_CLOSE_GAP_MAX_MS
    );
  }
  if (
    roll <
    COFFEE_ARRIVAL_SAME_TIME_CHANCE +
      COFFEE_ARRIVAL_CLOSE_GAP_CHANCE +
      COFFEE_ARRIVAL_NORMAL_GAP_CHANCE
  ) {
    return coffeeArrivalDelayClamp(
      COFFEE_ARRIVAL_NORMAL_GAP_MIN_MS +
        amount * (COFFEE_ARRIVAL_NORMAL_GAP_MAX_MS - COFFEE_ARRIVAL_NORMAL_GAP_MIN_MS),
      COFFEE_ARRIVAL_NORMAL_GAP_MIN_MS,
      COFFEE_ARRIVAL_NORMAL_GAP_MAX_MS
    );
  }
  return coffeeArrivalDelayClamp(
    COFFEE_ARRIVAL_LONG_GAP_MIN_MS +
      amount * (COFFEE_ARRIVAL_LONG_GAP_MAX_MS - COFFEE_ARRIVAL_LONG_GAP_MIN_MS),
    COFFEE_ARRIVAL_LONG_GAP_MIN_MS,
    COFFEE_ARRIVAL_LONG_GAP_MAX_MS
  );
}

export function buildCoffeeArrivalMotionProfile(seed: string): CoffeeArrivalMotionProfile {
  const normalizedSeed = seed.trim() || "coffee-arrival";
  const walkDurationMs = coffeeArrivalDelayClamp(
    COFFEE_ARRIVAL_WALK_MIN_MS +
      stableUnitValue(`${normalizedSeed}:walk-duration`) *
        (COFFEE_ARRIVAL_WALK_MAX_MS - COFFEE_ARRIVAL_WALK_MIN_MS),
    COFFEE_ARRIVAL_WALK_MIN_MS,
    COFFEE_ARRIVAL_WALK_MAX_MS
  );
  const easingIndex = Math.min(
    COFFEE_ARRIVAL_WALK_EASINGS.length - 1,
    Math.floor(stableUnitValue(`${normalizedSeed}:walk-easing`) * COFFEE_ARRIVAL_WALK_EASINGS.length)
  );
  const radius =
    COFFEE_ARRIVAL_SEAT_OFFSET_MIN_PX +
    stableUnitValue(`${normalizedSeed}:seat-offset-radius`) *
      (COFFEE_ARRIVAL_SEAT_OFFSET_MAX_PX - COFFEE_ARRIVAL_SEAT_OFFSET_MIN_PX);
  const angle = stableUnitValue(`${normalizedSeed}:seat-offset-angle`) * Math.PI * 2;

  return {
    walkDurationMs,
    walkEasing: COFFEE_ARRIVAL_WALK_EASINGS[easingIndex]!,
    seatOffsetX: roundedTenth(Math.cos(angle) * radius),
    seatOffsetY: roundedTenth(Math.sin(angle) * radius * 0.72),
  };
}

export function buildCoffeeArrivalPlan(
  conversation: Pick<
    {
      id: string;
      botGroupIds?: string[];
      coffeeSessionDurationMinutes?: CoffeeSessionDurationMinutes;
    },
    "id" | "botGroupIds" | "coffeeSessionDurationMinutes"
  >,
  scenario: CoffeeArrivalScenario
): CoffeeArrivalPlanEntry[] {
  const botIds = (conversation.botGroupIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0
  );
  if (botIds.length === 0) return [];
  const seeded = botIds.map((botId, index) => ({
    botId,
    index,
    rank: stableUnitValue(`${conversation.id}:${scenario}:arrival:${botId}`),
  }));
  seeded.sort((a, b) => a.rank - b.rank || a.index - b.index);
  const windowMs = Math.min(
    COFFEE_ARRIVAL_WINDOW_MS,
    Math.max(COFFEE_ARRIVAL_NORMAL_GAP_MIN_MS, coffeeSessionDurationMs(conversation) - 30_000)
  );
  let elapsedMs = 0;
  const rawPlan = seeded.map(({ botId }, index) => {
    if (index > 0) {
      elapsedMs += coffeeArrivalGapMs(
        `${conversation.id}:${scenario}:arrival-gap:${index}:${botId}`
      );
    }
    return {
      botId,
      delayMs: elapsedMs,
    };
  });
  const lastDelayMs = rawPlan[rawPlan.length - 1]?.delayMs ?? 0;
  const scale = lastDelayMs > windowMs && lastDelayMs > 0 ? windowMs / lastDelayMs : 1;
  return rawPlan.map(({ botId, delayMs }) => ({
    botId,
    delayMs: coffeeArrivalDelayClamp(delayMs * scale, 0, windowMs),
  }));
}
