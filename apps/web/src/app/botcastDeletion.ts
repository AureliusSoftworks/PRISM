export function nextBotcastShowIdAfterDeletion(
  shows: readonly { id: string }[],
  deletedShowId: string,
): string | null {
  const deletedIndex = shows.findIndex((show) => show.id === deletedShowId);
  if (deletedIndex < 0) return shows[0]?.id ?? null;
  return shows[deletedIndex + 1]?.id ?? shows[deletedIndex - 1]?.id ?? null;
}
