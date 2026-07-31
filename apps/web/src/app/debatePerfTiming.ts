/**
 * Privacy-safe Debate client timing marks. Durations and audience counts only —
 * never speech content.
 */

import type { PrismSceneQuality } from "./prismSceneRuntime";

export type DebateClientPerfMark =
  | "advance.round_trip"
  | "advance.presenting"
  | "audience.snapshot";

const DEBATE_CLIENT_PERF_ENABLED =
  typeof process !== "undefined"
    ? process.env.NODE_ENV !== "production"
    : true;

export type DebateAudiencePerfSnapshot = {
  materialQuality: PrismSceneQuality;
  pressureBand: string | null;
  reactingSeatCount: number;
  ambientTalkerCount: number;
  reactionFoleyStarts: number;
};

export function debateClientPerfNowMs(): number {
  return performance.now();
}

export function logDebateClientPerf(
  mark: DebateClientPerfMark,
  durationMs: number,
  details: Record<string, string | number | boolean | null | undefined> = {},
): void {
  if (!DEBATE_CLIENT_PERF_ENABLED) return;
  const detailText = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.info(
    `[debate-perf] ${mark} ${Math.round(durationMs)}ms${detailText ? ` ${detailText}` : ""}`,
  );
}

export function logDebateAudiencePerfSnapshot(
  snapshot: DebateAudiencePerfSnapshot,
): void {
  if (!DEBATE_CLIENT_PERF_ENABLED) return;
  console.info(
    `[debate-perf] audience.snapshot quality=${snapshot.materialQuality} pressure=${snapshot.pressureBand ?? "none"} reactors=${snapshot.reactingSeatCount} talkers=${snapshot.ambientTalkerCount} foleyStarts=${snapshot.reactionFoleyStarts}`,
  );
}

/** Auto-advance pause after presentation finishes cleanly. */
export const DEBATE_AUTO_ADVANCE_DELAY_MS = 280;

/** Map adaptive scene quality onto audience visual cost. */
export function debateAudienceEffectTier(
  materialQuality: PrismSceneQuality,
): "full" | "balanced" | "minimal" {
  return materialQuality;
}

export function debateAudienceMaxReactingSeats(
  materialQuality: PrismSceneQuality,
  beatKind: string,
): number {
  if (beatKind === "attentive") return 1;
  if (materialQuality === "full") return 2;
  return 1;
}

export function debateAudienceAllowsFaceOpen(
  materialQuality: PrismSceneQuality,
): boolean {
  return materialQuality === "full";
}

export function debateAudienceAllowsTransformBounce(
  materialQuality: PrismSceneQuality,
): boolean {
  return materialQuality !== "minimal";
}

export function debateAudienceAllowsAttentiveFoley(
  materialQuality: PrismSceneQuality,
): boolean {
  return materialQuality !== "minimal";
}
