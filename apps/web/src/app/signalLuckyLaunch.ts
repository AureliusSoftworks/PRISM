export interface SignalLuckyShowCandidate {
  id: string;
  hostBotId: string;
  hasActiveHost: boolean;
}

export interface SignalLuckyBotCandidate {
  id: string;
}

export interface SignalLuckyBookingSuggestion {
  topic: string;
  producerBrief: string;
  guestBrief: string;
  guestBotId?: string;
  generated: boolean;
}

export interface SignalLuckyLaunchSetup<
  Show extends SignalLuckyShowCandidate = SignalLuckyShowCandidate,
> {
  show: Show;
  guestBotId: string;
  topic: string;
  producerBrief: string;
  guestBrief: string;
}

export type SignalLuckyLaunchResult = "launched" | "busy";

function randomChoice<T>(options: readonly T[], random: () => number): T | null {
  if (options.length === 0) return null;
  const sampled = random();
  const unit = Number.isFinite(sampled)
    ? Math.max(0, Math.min(0.999_999, sampled))
    : 0;
  return options[Math.floor(unit * options.length)] ?? options[0] ?? null;
}

export function signalLuckyEligibleShows<Show extends SignalLuckyShowCandidate>(
  shows: readonly Show[],
  bots: readonly SignalLuckyBotCandidate[],
): Show[] {
  const botIds = new Set(bots.map((bot) => bot.id));
  return shows.filter(
    (show) =>
      show.hasActiveHost &&
      botIds.has(show.hostBotId) &&
      bots.some((bot) => bot.id !== show.hostBotId),
  );
}

/**
 * Owns the one-click transaction boundary: a second click cannot start a
 * parallel suggestion, and launch is reached only after one complete,
 * validated show + guest + title + premise setup has been resolved.
 */
export function createSignalLuckyLaunchRunner(): {
  run<Show extends SignalLuckyShowCandidate>(args: {
    shows: readonly Show[];
    bots: readonly SignalLuckyBotCandidate[];
    random?: () => number;
    suggestBooking(input: {
      showId: string;
      guestBotId: string;
    }): Promise<SignalLuckyBookingSuggestion>;
    launch(setup: SignalLuckyLaunchSetup<Show>): Promise<void>;
  }): Promise<SignalLuckyLaunchResult>;
} {
  let inFlight = false;
  return {
    async run<Show extends SignalLuckyShowCandidate>(args: {
      shows: readonly Show[];
      bots: readonly SignalLuckyBotCandidate[];
      random?: () => number;
      suggestBooking(input: {
        showId: string;
        guestBotId: string;
      }): Promise<SignalLuckyBookingSuggestion>;
      launch(setup: SignalLuckyLaunchSetup<Show>): Promise<void>;
    }): Promise<SignalLuckyLaunchResult> {
      if (inFlight) return "busy";
      inFlight = true;
      try {
        const random = args.random ?? Math.random;
        const show = randomChoice(
          signalLuckyEligibleShows(args.shows, args.bots),
          random,
        );
        if (!show) {
          throw new Error(
            "Signal needs an active show and an available non-host guest.",
          );
        }
        const guestBotId = randomChoice(
          args.bots
            .map((bot) => bot.id)
            .filter((botId) => botId !== show.hostBotId),
          random,
        );
        if (!guestBotId) {
          throw new Error("Signal could not find an available guest.");
        }

        const suggestion = await args.suggestBooking({
          showId: show.id,
          guestBotId,
        });
        const topic = suggestion.topic.trim();
        const producerBrief = suggestion.producerBrief.trim();
        const guestBrief = suggestion.guestBrief.trim();
        const eligibleGuestIds = new Set(
          args.bots
            .map((bot) => bot.id)
            .filter((botId) => botId !== show.hostBotId),
        );
        const resolvedGuestBotId = suggestion.guestBotId ?? guestBotId;
        if (
          !suggestion.generated ||
          !topic ||
          !producerBrief ||
          !guestBrief ||
          !eligibleGuestIds.has(resolvedGuestBotId)
        ) {
          throw new Error("Signal could not produce this lucky booking.");
        }

        await args.launch({
          show,
          guestBotId: resolvedGuestBotId,
          topic,
          producerBrief,
          guestBrief,
        });
        return "launched";
      } finally {
        inFlight = false;
      }
    },
  };
}
