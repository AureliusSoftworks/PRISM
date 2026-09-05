export const PRISM_STARTUP_WORKSPACE_BASE_PROGRESS = 0.72;
export const PRISM_STARTUP_REFRACTION_CONTACT_PROGRESS =
  PRISM_STARTUP_WORKSPACE_BASE_PROGRESS;
export const PRISM_STARTUP_COMPLETION_HOLD_MS = 2200;
export const PRISM_STARTUP_CROSSFADE_MS = 800;

const PRISM_STARTUP_SESSION_PROGRESS = 0.05;
const PRISM_STARTUP_RESOURCE_PROGRESS = 0.035;

const PRISM_STARTUP_RESOURCE_READY_MARKERS = [
  "Account settings ready.",
  "Conversations ready.",
  "Private memories ready.",
  "Bot library ready",
  "Account asset library ready.",
  "Model catalog ready.",
] as const;

export interface PrismStartupProgressLog {
  readonly text: string;
  readonly kind?: "status" | "flavor";
}

export interface PrismStartupOpticsProgress {
  readonly total: number;
  readonly beam: number;
  readonly spectrum: number;
}

export function appendPrismStartupLogWithStatusRetention<
  T extends PrismStartupProgressLog,
>(current: readonly T[], line: T, maxLines = 48): T[] {
  if (maxLines <= 0) return [];
  const next = [...current, line];
  while (next.length > maxLines) {
    const oldestFlavorIndex = next.findIndex(
      (candidate) => candidate.kind === "flavor",
    );
    next.splice(oldestFlavorIndex >= 0 ? oldestFlavorIndex : 0, 1);
  }
  return next;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Derives workspace progress only from authoritative completion logs. Ambient
 * flavor copy never advances the beam, and every retained milestone is worth a
 * fixed share so completion order cannot make the presentation move backward.
 */
export function prismStartupProgressFromLogs(
  logs: readonly PrismStartupProgressLog[],
): number {
  const statusText = logs
    .filter((line) => line.kind !== "flavor")
    .map((line) => line.text);
  if (statusText.some((text) => text.includes("Private workspace ready."))) {
    return 1;
  }

  const sessionReady = statusText.some((text) =>
    text.includes("Saved account session verified."),
  );
  const readyResources = PRISM_STARTUP_RESOURCE_READY_MARKERS.filter((marker) =>
    statusText.some((text) => text.includes(marker)),
  ).length;

  const progress = clampProgress(
    PRISM_STARTUP_WORKSPACE_BASE_PROGRESS +
      (sessionReady ? PRISM_STARTUP_SESSION_PROGRESS : 0) +
      readyResources * PRISM_STARTUP_RESOURCE_PROGRESS,
  );
  return Math.round(progress * 1000) / 1000;
}

export function prismStartupOpticsProgress(
  totalProgress: number,
): PrismStartupOpticsProgress {
  const total = clampProgress(totalProgress);
  return {
    total,
    beam: clampProgress(total / PRISM_STARTUP_REFRACTION_CONTACT_PROGRESS),
    spectrum: clampProgress(
      (total - PRISM_STARTUP_REFRACTION_CONTACT_PROGRESS) /
        (1 - PRISM_STARTUP_REFRACTION_CONTACT_PROGRESS),
    ),
  };
}
