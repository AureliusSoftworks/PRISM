export function debateMysteryForgeAuthoritativePercent(
  completedPasses: number,
  totalPasses: number,
): number {
  if (!Number.isFinite(totalPasses) || totalPasses <= 0) return 0;
  const completed = Number.isFinite(completedPasses)
    ? Math.min(totalPasses, Math.max(0, completedPasses))
    : 0;
  return Math.round((completed / totalPasses) * 100);
}

export function formatDebateMysteryForgeElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDebateMysteryForgeEta(remainingMs: number): string {
  const roundedMinutes = Math.max(1, Math.round(remainingMs / 60_000));
  return `Approx. ${roundedMinutes} min remaining`;
}
