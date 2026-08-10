export const PRISM_WIELD_ARM_DELAY_MS = 150;
export const PRISM_WIELD_MOVE_THRESHOLD_PX = 4;

export interface PrismWieldPoint {
  x: number;
  y: number;
}

export type PrismWieldPhase =
  | "idle"
  | "pending"
  | "following"
  | "captured"
  | "returning";

export interface PrismWieldState {
  phase: PrismWieldPhase;
  epoch: number;
  startedAt: PrismWieldPoint | null;
  pointer: PrismWieldPoint | null;
}

export interface PrismWieldAvailability {
  companionMenuOpen: boolean;
  softSynthesisMenuOpen: boolean;
  homeDocked: boolean;
}

/** Prism stays anchored while Home or an open Prism-owned menu owns it. */
export function prismWieldCanArm({
  companionMenuOpen,
  softSynthesisMenuOpen,
  homeDocked,
}: PrismWieldAvailability): boolean {
  return !companionMenuOpen && !softSynthesisMenuOpen && !homeDocked;
}

export type PrismWieldEvent =
  | { type: "modifier-down"; pointer: PrismWieldPoint }
  | { type: "arm"; epoch: number }
  | { type: "pointer-move"; epoch: number; pointer: PrismWieldPoint }
  | { type: "capture"; epoch: number; pointer: PrismWieldPoint }
  | { type: "return"; epoch: number }
  | { type: "finish"; epoch: number };

export function createPrismWieldState(): PrismWieldState {
  return {
    phase: "idle",
    epoch: 0,
    startedAt: null,
    pointer: null,
  };
}

function movedEnough(
  startedAt: PrismWieldPoint | null,
  pointer: PrismWieldPoint,
): boolean {
  if (!startedAt) return false;
  return (
    Math.hypot(pointer.x - startedAt.x, pointer.y - startedAt.y) >=
    PRISM_WIELD_MOVE_THRESHOLD_PX
  );
}

export function transitionPrismWield(
  state: PrismWieldState,
  event: PrismWieldEvent,
): PrismWieldState {
  if (event.type === "modifier-down") {
    if (state.phase !== "idle") return state;
    return {
      phase: "pending",
      epoch: state.epoch + 1,
      startedAt: event.pointer,
      pointer: event.pointer,
    };
  }
  if (event.epoch !== state.epoch) return state;

  if (event.type === "arm") {
    if (state.phase !== "pending" || !state.pointer) return state;
    return { ...state, phase: "following" };
  }
  if (event.type === "pointer-move") {
    if (state.phase === "pending") {
      return {
        ...state,
        phase: movedEnough(state.startedAt, event.pointer)
          ? "following"
          : "pending",
        pointer: event.pointer,
      };
    }
    if (state.phase === "following") {
      return { ...state, pointer: event.pointer };
    }
    return state;
  }
  if (event.type === "capture") {
    if (state.phase !== "following") return state;
    return { ...state, phase: "captured", pointer: event.pointer };
  }
  if (event.type === "return") {
    if (state.phase === "idle") return state;
    return { ...state, phase: "returning" };
  }
  if (event.type === "finish") {
    if (state.phase !== "returning" && state.phase !== "captured") return state;
    return {
      phase: "idle",
      epoch: state.epoch,
      startedAt: null,
      pointer: null,
    };
  }
  return state;
}
