export const COMPOSER_CHIP_ACTIVATION_WINDOW_MS = 1200;

export type ComposerChipActivationSurface = "editor" | "textarea";

export type ComposerChipActivationKind =
  | "command"
  | "prompt"
  | "wildcard"
  | "wildcard-slot";

export interface ComposerChipActivationTarget {
  surface: ComposerChipActivationSurface;
  kind: ComposerChipActivationKind;
  start: number;
  end: number;
  text: string;
}

export interface PendingComposerChipActivation extends ComposerChipActivationTarget {
  armedAtMs: number;
}

export function armComposerChipActivation(
  target: ComposerChipActivationTarget,
  nowMs: number
): PendingComposerChipActivation {
  return {
    ...target,
    armedAtMs: nowMs,
  };
}

export function sameComposerChipActivationTarget(
  pending: PendingComposerChipActivation | null,
  target: ComposerChipActivationTarget
): boolean {
  return (
    pending !== null &&
    pending.surface === target.surface &&
    pending.kind === target.kind &&
    pending.start === target.start &&
    pending.end === target.end &&
    pending.text === target.text
  );
}

export function shouldResolveComposerChipActivation(
  pending: PendingComposerChipActivation | null,
  target: ComposerChipActivationTarget,
  nowMs: number,
  windowMs = COMPOSER_CHIP_ACTIVATION_WINDOW_MS
): boolean {
  if (pending === null) return false;
  if (
    target.kind === "command" ||
    target.kind === "wildcard" ||
    target.kind === "wildcard-slot"
  ) {
    return false;
  }
  if (!sameComposerChipActivationTarget(pending, target)) return false;
  const elapsed = nowMs - pending.armedAtMs;
  return elapsed >= 0 && elapsed <= windowMs;
}

export function replaceComposerChipText(
  source: string,
  target: ComposerChipActivationTarget,
  replacement: string
): { value: string; caret: number } | null {
  if (target.start < 0 || target.end < target.start || target.end > source.length) {
    return null;
  }
  if (source.slice(target.start, target.end) !== target.text) return null;
  const value = `${source.slice(0, target.start)}${replacement}${source.slice(target.end)}`;
  return {
    value,
    caret: target.start + replacement.length,
  };
}
