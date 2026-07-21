import type {
  SignalPersonaTemperament,
  VoiceDeliveryMood,
} from "@localai/shared";

export const DEAD_AIR_ASIDE_PLAN_VERSION = 1 as const;

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
    ];
  }
  if (args.mood === "warm") {
    return [
      `Take your time, ${name}. That ${image} can have another second.`,
      `No rush, ${name}—we'll keep the light on for that ${image}.`,
      `${name} is still with the ${image}. I'm rooting for both of them.`,
    ];
  }
  if (args.mood === "guarded") {
    return [
      `${name}, if that ${image} gets any quieter, I'm charging it rent.`,
      `The ${image} has entered witness protection, apparently.`,
      `I see ${name}'s ${image} has retained counsel.`,
    ];
  }
  if (args.mood === "strained") {
    return [
      `${name}, the ${image} can land or file for residency.`,
      `This ${image} is now a limited series.`,
      `Any day now, ${name}. The ${image} has made its point.`,
    ];
  }
  return [
    `While ${name} consults the ${image}, enjoy this professionally managed silence.`,
    `${name}'s ${image} is buffering with unusual confidence.`,
    `A brief pause while ${name} locates the end of that ${image}.`,
  ];
}

export function buildDeadAirAsidePlanV1(args: {
  mode: DeadAirAsideMode;
  turnId: string;
  thinkingBotId: string;
  thinkingBotName: string;
  commentatorBotId: string;
  mood: VoiceDeliveryMood;
  temperament: SignalPersonaTemperament;
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
  ].join(":");
  const lines = asideLines(args);
  return {
    v: DEAD_AIR_ASIDE_PLAN_VERSION,
    name: "deadAirAside",
    mode: args.mode,
    turnId,
    thinkingBotId,
    commentatorBotId,
    mood: args.mood,
    temperament: args.temperament,
    text: lines[stableIndex(seed, lines.length)]!,
    seed,
  };
}
