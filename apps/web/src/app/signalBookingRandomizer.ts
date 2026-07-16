export const SIGNAL_RANDOM_BOOKING_TOPICS = [
  // Coffee's canonical fallback starters also work well as interview premises.
  "Which rule deserves breaking?",
  "When does loyalty become a liability?",
  "What should success cost?",
  "Who gets to define good work?",
  "What changes when nobody is keeping score?",
  "Which useful belief has outlived its purpose?",
  "When is certainty more dangerous than doubt?",
  "What do people protect when they say they’re being practical?",
  "Which compromise becomes identity?",
  "When does being helpful become control?",
  "What is worth doing badly at first?",
  "Who benefits from the obvious answer?",
] as const;

export const SIGNAL_RANDOM_PRODUCER_BRIEFS = [
  "Ask for the moment their answer changed, not just the opinion they hold now.",
  "Press gently for a concrete example whenever the conversation becomes abstract.",
  "Look for the exception that complicates their first answer.",
  "Keep the disagreement warm, but do not let either speaker hide behind generalities.",
  "Follow the detail that surprises the host, even if it changes the planned shape.",
  "End by asking what they would risk to act on the answer.",
  "Let the guest define the terms before the host tests them.",
  "Make room for one story before asking for the lesson.",
] as const;

export type SignalRandomBooking = {
  guestId: string;
  topic: string;
  producerBrief: string;
};

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

export function randomSignalEpisodeBooking(args: {
  candidateGuestIds: readonly string[];
  hostBotId: string;
  currentGuestId: string;
  currentTopic: string;
  currentProducerBrief: string;
  random?: () => number;
}): SignalRandomBooking | null {
  const eligibleGuestIds = [...new Set(args.candidateGuestIds)]
    .filter((guestId) => guestId && guestId !== args.hostBotId);
  if (eligibleGuestIds.length === 0) return null;
  const random = args.random ?? Math.random;
  return {
    guestId: randomChoiceAvoiding(
      eligibleGuestIds,
      args.currentGuestId,
      random,
    ),
    topic: randomChoiceAvoiding(
      SIGNAL_RANDOM_BOOKING_TOPICS,
      args.currentTopic,
      random,
    ),
    producerBrief: randomChoiceAvoiding(
      SIGNAL_RANDOM_PRODUCER_BRIEFS,
      args.currentProducerBrief,
      random,
    ),
  };
}
