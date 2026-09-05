function randomChoiceAvoiding(
  options: readonly string[],
  current: string,
  random: () => number,
): string {
  const normalizedCurrent = current.trim();
  const alternatives = options.filter((option) => option !== normalizedCurrent);
  const pool = alternatives.length > 0 ? alternatives : options;
  const sampled = random();
  const unit = Number.isFinite(sampled)
    ? Math.max(0, Math.min(0.999_999, sampled))
    : 0;
  return pool[Math.floor(unit * pool.length)] ?? pool[0] ?? "";
}

export function randomSignalEpisodeGuestId(args: {
  candidateGuestIds: readonly string[];
  hostBotId: string;
  currentGuestId: string;
  random?: () => number;
}): string | null {
  const eligibleGuestIds = [...new Set(args.candidateGuestIds)]
    .filter((guestId) => guestId && guestId !== args.hostBotId);
  if (eligibleGuestIds.length === 0) return null;
  const random = args.random ?? Math.random;
  return randomChoiceAvoiding(
    eligibleGuestIds,
    args.currentGuestId,
    random,
  );
}

/**
 * A bot captured directly with Wield remains the booking anchor even when the
 * suggestion response proposes a different guest. Ordinary random bookings
 * still accept the provider's coherent guest choice.
 */
export function resolvedSignalBookingGuestId(args: {
  anchoredGuestId?: string;
  suggestedGuestId?: string;
  requestedGuestId: string;
}): string {
  return (
    args.anchoredGuestId ?? args.suggestedGuestId ?? args.requestedGuestId
  );
}
