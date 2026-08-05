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
