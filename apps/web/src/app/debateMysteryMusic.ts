import type { DebateMysteryPlayPhase } from "@localai/shared";
import type { SessionAtmosphereMix } from "./session-atmosphere-audio.ts";

export const WHODUNNIT_INVESTIGATION_MUSIC_URL =
  "/audio/debate/whodunnit/the-midnight-clue.mp3";

export const WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS = 720;
export const WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS = 260;

export const WHODUNNIT_INVESTIGATION_MUSIC_MIX = {
  background: 0.07,
  grain: 0,
  foley: 0,
} as const satisfies SessionAtmosphereMix;

export const WHODUNNIT_INVESTIGATION_MUSIC_SILENT_MIX = {
  ...WHODUNNIT_INVESTIGATION_MUSIC_MIX,
  background: 0,
} as const satisfies SessionAtmosphereMix;

export type MysteryInvestigationMusicProgramPhaseV1 = "cell" | "rest" | "accent";

export interface MysteryInvestigationMusicProgramV1 {
  phase: MysteryInvestigationMusicProgramPhaseV1;
  audible: boolean;
  cellDurationMs: number;
  restDurationMs: number;
  positionMs: number;
}

function musicProgramHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * The track itself keeps advancing under silence, so each return reveals a
 * different musical region instead of restarting the same opening bar.
 */
export function mysteryInvestigationMusicProgramV1(args: {
  seed: string;
  elapsedMs: number;
  accentActive?: boolean;
}): MysteryInvestigationMusicProgramV1 {
  const cellDurationMs = 8_000 + musicProgramHash(`${args.seed}:cell`) % 8_001;
  const restDurationMs = 45_000 + musicProgramHash(`${args.seed}:rest`) % 40_001;
  const cycleMs = cellDurationMs + restDurationMs;
  const positionMs = Math.max(0, Math.floor(args.elapsedMs)) % cycleMs;
  if (args.accentActive) {
    return { phase: "accent", audible: true, cellDurationMs, restDurationMs, positionMs };
  }
  const audible = positionMs < cellDurationMs;
  return {
    phase: audible ? "cell" : "rest",
    audible,
    cellDurationMs,
    restDurationMs,
    positionMs,
  };
}

export function mysteryInvestigationMusicSessionActive(
  playPhase: DebateMysteryPlayPhase,
): boolean {
  return playPhase === "investigation";
}

export function mysteryInvestigationMusicMix(args: {
  theoryBoardOpen: boolean;
  roomIntroductionActive?: boolean;
  programAudible?: boolean;
  accentActive?: boolean;
}): SessionAtmosphereMix {
  if (args.theoryBoardOpen || args.roomIntroductionActive || args.programAudible === false) {
    return WHODUNNIT_INVESTIGATION_MUSIC_SILENT_MIX;
  }
  return args.accentActive
    ? { ...WHODUNNIT_INVESTIGATION_MUSIC_MIX, background: 0.09 }
    : WHODUNNIT_INVESTIGATION_MUSIC_MIX;
}
