import {
  normalizeCoffeeSessionSettings,
  type CoffeeSessionDurationMinutes,
  type CoffeeSessionSettings,
} from "@localai/shared";

interface CoffeeSessionRetrySource {
  botGroupIds?: string[];
  coffeeAbsentBotIds?: string[];
  coffeeSettings?: unknown;
  coffeeSessionDurationMinutes?: CoffeeSessionDurationMinutes | null;
  coffeeTopic?: string | null;
}

export interface CoffeeSessionRetryDraft {
  durationMinutes: CoffeeSessionDurationMinutes | null;
  excludedBotIds: string[];
  missingBotIds: string[];
  settings: CoffeeSessionSettings;
  topic: string;
}

export function coffeeSessionRetryDraft(args: {
  availableBotIds: Iterable<string>;
  groupBotIds: string[];
  session: CoffeeSessionRetrySource;
}): CoffeeSessionRetryDraft {
  const availableBotIds = new Set(args.availableBotIds);
  const currentGroupBotIds = Array.from(new Set(args.groupBotIds)).filter(
    (botId) => availableBotIds.has(botId),
  );
  const sessionBotIds = new Set(args.session.botGroupIds ?? []);
  const absentBotIds = new Set(args.session.coffeeAbsentBotIds ?? []);

  return {
    durationMinutes: args.session.coffeeSessionDurationMinutes ?? null,
    excludedBotIds: currentGroupBotIds.filter(
      (botId) => absentBotIds.has(botId) || !sessionBotIds.has(botId),
    ),
    missingBotIds: Array.from(sessionBotIds).filter(
      (botId) => !currentGroupBotIds.includes(botId),
    ),
    settings: normalizeCoffeeSessionSettings(args.session.coffeeSettings),
    topic: args.session.coffeeTopic?.trim() ?? "",
  };
}
