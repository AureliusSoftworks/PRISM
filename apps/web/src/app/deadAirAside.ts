import type {
  SignalPersonaTemperament,
  VoiceDeliveryMood,
} from "@localai/shared";

export const DEAD_AIR_ASIDE_PLAN_VERSION = 1 as const;

/** Rough share of long thinks that may earn one aside (hash-gated). */
export const COFFEE_DEAD_AIR_ASIDE_CHANCE = 0.28;

/** Minimum assistant table turns between asides in one session. */
export const COFFEE_DEAD_AIR_ASIDE_MIN_TURN_GAP = 3;

/** Extra wait after interrupt-eligible before an aside may fire. */
export const COFFEE_DEAD_AIR_ASIDE_EXTRA_THINK_MS = 5_500;

export type DeadAirAsideMode = "coffee";

export interface DeadAirAsidePlanV1 {
  v: typeof DEAD_AIR_ASIDE_PLAN_VERSION;
  name: "deadAirAside";
  mode: DeadAirAsideMode;
  turnId: string;
  thinkingBotId: string;
  commentatorBotId: string;
  mood: VoiceDeliveryMood;
  temperament: SignalPersonaTemperament;
  text: string;
  seed: string;
}

const TEMPERAMENT_WAIT_IMAGE: Record<SignalPersonaTemperament, string> = {
  commanding: "internal tribunal",
  contemplative: "inner paradox",
  playful: "punchline",
  analytical: "evidence board",
  inventive: "prototype",
  warm: "gentle thought",
  creative: "director's cut",
  adventurous: "expedition",
  neutral: "thought",
};

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % Math.max(1, length);
}

function stableUnit(seed: string): number {
  return stableIndex(`${seed}:unit`, 1_000_000) / 1_000_000;
}

function boundedId(value: string): string | null {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized ? normalized.slice(0, 160) : null;
}

function boundedName(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return (normalized || "our thinker").slice(0, 48);
}

function asideLines(args: {
  thinkingBotName: string;
  mood: VoiceDeliveryMood;
  temperament: SignalPersonaTemperament;
}): readonly string[] {
  const name = boundedName(args.thinkingBotName);
  const image = TEMPERAMENT_WAIT_IMAGE[args.temperament];
  if (args.mood === "joyful") {
    return [
      `${name} is giving that ${image} the deluxe tour.`,
      `I think ${name}'s ${image} just asked for an intermission.`,
      `While ${name} and the ${image} negotiate, I'll hum the hold music.`,
      `Ooh—${name} went full backstage with that ${image}.`,
      `Plot twist pending. ${name}'s still smiling at the ${image}.`,
      `Don't mind me. I'm just enjoying ${name}'s dramatic pause.`,
    ];
  }
  if (args.mood === "warm") {
    return [
      `Take your time, ${name}. That ${image} can have another second.`,
      `No rush, ${name}—we'll keep the light on for that ${image}.`,
      `${name} is still with the ${image}. I'm rooting for both of them.`,
      `Soft hold for ${name}. Good thoughts rarely sprint.`,
      `We're fine. ${name} is just being careful with it.`,
      `Breathe, table. ${name} hasn't left us—just thinking kindly.`,
    ];
  }
  if (args.mood === "guarded") {
    return [
      `${name}, if that ${image} gets any quieter, I'm charging it rent.`,
      `The ${image} has entered witness protection, apparently.`,
      `I see ${name}'s ${image} has retained counsel.`,
      `Suspicious silence from ${name}. Noted.`,
      `Hmm. ${name} is taking the scenic route through that thought.`,
      `I'll wait—but I'm watching the ${image} like a hawk.`,
    ];
  }
  if (args.mood === "strained") {
    return [
      `${name}, the ${image} can land or file for residency.`,
      `This ${image} is now a limited series.`,
      `Any day now, ${name}. The ${image} has made its point.`,
      `Okay ${name}, the pause is doing overtime.`,
      `If that ${image} needs a lawyer, say so.`,
      `Clock's still running, ${name}. Just saying.`,
    ];
  }
  return [
    `While ${name} consults the ${image}, enjoy this professionally managed silence.`,
    `${name}'s ${image} is buffering with unusual confidence.`,
    `A brief pause while ${name} locates the end of that ${image}.`,
    `${name} stepped into the ${image} for a minute.`,
    `Holding for ${name}. The room can keep its coffee warm.`,
    `Quiet beat—${name} hasn't dropped the thread, just the tempo.`,
    `I'll leave the ${image} alone. ${name} looks busy with it.`,
    `Nothing's broken. ${name} is simply still choosing words.`,
  ];
}

/**
 * Whether this long think should attempt a dead-air aside.
 * Keeps asides sparse across a Coffee session.
 */
export function coffeeDeadAirAsideShouldAttempt(args: {
  turnId: string;
  assistantTurnCount: number;
  lastAsideAssistantTurnCount: number | null;
  chance?: number;
}): boolean {
  const turnId = boundedId(args.turnId);
  if (!turnId) return false;
  const minGap = COFFEE_DEAD_AIR_ASIDE_MIN_TURN_GAP;
  if (
    args.lastAsideAssistantTurnCount != null &&
    args.assistantTurnCount - args.lastAsideAssistantTurnCount < minGap
  ) {
    return false;
  }
  const chance = Math.max(0, Math.min(1, args.chance ?? COFFEE_DEAD_AIR_ASIDE_CHANCE));
  return stableUnit(`dead-air-aside-chance:${turnId}`) < chance;
}

export function buildDeadAirAsidePlanV1(args: {
  mode: DeadAirAsideMode;
  turnId: string;
  thinkingBotId: string;
  thinkingBotName: string;
  commentatorBotId: string;
  mood: VoiceDeliveryMood;
  temperament: SignalPersonaTemperament;
  /** Recent aside texts to avoid immediate repeats. */
  recentTexts?: readonly string[];
  /** Salt so the same pair can rotate across a session. */
  varietySalt?: string | number;
}): DeadAirAsidePlanV1 | null {
  const turnId = boundedId(args.turnId);
  const thinkingBotId = boundedId(args.thinkingBotId);
  const commentatorBotId = boundedId(args.commentatorBotId);
  if (
    !turnId ||
    !thinkingBotId ||
    !commentatorBotId ||
    thinkingBotId === commentatorBotId
  ) {
    return null;
  }
  const seed = [
    "dead-air-aside-v1",
    args.mode,
    turnId,
    thinkingBotId,
    commentatorBotId,
    args.mood,
    args.temperament,
    args.varietySalt ?? "",
  ].join(":");
  const lines = asideLines(args);
  const recent = new Set(
    (args.recentTexts ?? [])
      .map((text) => text.replace(/\s+/gu, " ").trim().toLowerCase())
      .filter(Boolean),
  );
  const fresh = lines.filter(
    (line) => !recent.has(line.replace(/\s+/gu, " ").trim().toLowerCase()),
  );
  const pool = fresh.length > 0 ? fresh : lines;
  return {
    v: DEAD_AIR_ASIDE_PLAN_VERSION,
    name: "deadAirAside",
    mode: args.mode,
    turnId,
    thinkingBotId,
    commentatorBotId,
    mood: args.mood,
    temperament: args.temperament,
    text: pool[stableIndex(seed, pool.length)]!,
    seed,
  };
}
