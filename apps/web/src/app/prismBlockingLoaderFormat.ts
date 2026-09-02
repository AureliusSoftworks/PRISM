/** Format elapsed wait time like Signal’s activity chip (`12m 04s` / `45s`). */
export function formatBlockingLoaderElapsed(
  startedAt: string | number,
  nowMs: number = Date.now(),
): string {
  const startMs =
    typeof startedAt === "number"
      ? startedAt
      : new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return "0s";
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1_000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
}

export const REFRACTION_CANCEL_WARNING =
  "This refraction will stop. You will have to regenerate the interrupted asset. Previously saved assets stay unchanged. Provider cancellation is best-effort; cancelled results will not be applied.";

export function refractionEtaLabel(
  startedAt: string | number | null,
  estimatedDurationMs: number | null | undefined,
  nowMs: number,
): string {
  const start = typeof startedAt === "number" ? startedAt : Date.parse(startedAt ?? "");
  if (!Number.isFinite(start) || !estimatedDurationMs || !Number.isFinite(estimatedDurationMs) || estimatedDurationMs < 0) {
    return "Estimating time — no reliable estimate yet";
  }
  const remaining = estimatedDurationMs - Math.max(0, nowMs - start);
  if (remaining <= 0) return "Taking longer than estimated — time remaining unknown";
  // Rounded up so this never claims zero seconds while work is still pending.
  return `Estimated remaining: ${formatBlockingLoaderElapsed(0, Math.ceil(remaining / 1_000) * 1_000)} · based on similar runs`;
}

export function blockingLoaderCancelAction(
  confirming: boolean,
  action: "request" | "escape" | "keep" | "confirm",
): { confirming: boolean; cancel: boolean } {
  if (action === "confirm") return { confirming: false, cancel: confirming };
  if (action === "keep") return { confirming: false, cancel: false };
  return { confirming: action === "request" || !confirming, cancel: false };
}

export function blockingLoaderFocusIndex(current: number, count: number, backwards: boolean): number {
  if (count === 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? -1 : 1) + count) % count;
}
