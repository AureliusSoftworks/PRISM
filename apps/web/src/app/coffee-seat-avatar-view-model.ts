import type { BotFaceGazeDirection } from "./botFaceEyeMovement.ts";

export interface CoffeeSeatAvatarViewModel {
  identityKey: string;
  theme: "light" | "dark";
  quality: string;
  presentation?: "full" | "mini";
  hoverActive: boolean;
  layoutIndex: number;
  glyph: string;
  faceStyle: unknown;
  faceScaleY: string | number;
  voicePreset: string;
  talking: boolean;
  voiceLightLevel?: number;
  avatarSfx: unknown;
  avatarSfxState: string;
  sipMouth: boolean;
  emptyCupFrown: boolean;
  loadShed?: boolean;
  mouthShape: string;
  mood: string;
  plateFace: unknown;
  restingPlateFace: unknown;
  plateFaceRestAfterMs?: number | null;
  thinking: boolean;
  eyeAttentionState: string;
  eyeTargetDirection: BotFaceGazeDirection;
  eyeTimelineMs?: number;
  screenMaterialSeed?: string | null;
  frameMaterialSeed?: string | null;
  avatarDetails: unknown;
  avatarDetailsColor?: string | null;
  leadershipGroupCount: number;
}

export interface CoffeeLiveSeatThinkingState {
  rhythmState: string;
  pendingSpeakerBotId: string | null;
  activeTurnJob: {
    phase: string;
    speakerBotId: string | null;
  } | null;
  responseCuePlaying: boolean;
}

/**
 * Resolves the one seat that owns Coffee's live thinking screen.
 *
 * The pending-speaker state is the presentation authority once orchestration
 * has selected a bot. The active job is a bounded fallback for the render
 * between a job poll landing and React committing the pending speaker. Player
 * line reveal is deliberately absent: a selected bot keeps thinking while the
 * submitted player line finishes printing.
 */
export function coffeeLiveSeatThinkingBotId(
  state: CoffeeLiveSeatThinkingState,
): string | null {
  const thinkingPresentationActive =
    state.rhythmState === "botThinking" ||
    state.rhythmState === "userTableTyping";
  if (!thinkingPresentationActive || state.responseCuePlaying) {
    return null;
  }
  const pendingSpeakerBotId = state.pendingSpeakerBotId?.trim();
  if (pendingSpeakerBotId) return pendingSpeakerBotId;
  if (state.activeTurnJob?.phase !== "thinking") return null;
  return state.activeTurnJob.speakerBotId?.trim() || null;
}

/** Excludes center-transcript/typewriter ticks by construction. */
export function coffeeSeatAvatarViewModelKey(
  viewModel: CoffeeSeatAvatarViewModel,
): string {
  return JSON.stringify([
    viewModel.identityKey,
    viewModel.theme,
    viewModel.quality,
    viewModel.presentation ?? "full",
    viewModel.hoverActive,
    viewModel.layoutIndex,
    viewModel.glyph,
    viewModel.faceStyle,
    viewModel.faceScaleY,
    viewModel.voicePreset,
    viewModel.talking,
    viewModel.voiceLightLevel,
    viewModel.avatarSfx,
    viewModel.avatarSfxState,
    viewModel.sipMouth,
    viewModel.emptyCupFrown,
    viewModel.loadShed === true,
    viewModel.mouthShape,
    viewModel.mood,
    viewModel.plateFace,
    viewModel.restingPlateFace,
    viewModel.plateFaceRestAfterMs,
    viewModel.thinking,
    viewModel.eyeAttentionState,
    viewModel.eyeTargetDirection,
    viewModel.eyeTimelineMs,
    viewModel.screenMaterialSeed,
    viewModel.frameMaterialSeed,
    viewModel.avatarDetails,
    viewModel.avatarDetailsColor,
    viewModel.leadershipGroupCount,
  ]);
}
