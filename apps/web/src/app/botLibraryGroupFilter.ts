export interface BotLibraryGroupFilterBot {
  id: string;
}

export interface BotLibraryGroupFilterGroup {
  id: string;
  botIds: readonly string[];
}

export const BOT_LIBRARY_CUSTOM_GROUP_MIN_BOTS = 2;

export interface BotLibraryGroupMaintenanceGroup {
  id: string;
  botIds: string[];
  builtIn?: boolean;
}

export function filterBotsByLibraryGroup<TBot extends BotLibraryGroupFilterBot>(
  bots: readonly TBot[],
  groups: readonly BotLibraryGroupFilterGroup[],
  filterId: string,
  allFilterId = "all"
): TBot[] {
  if (filterId === allFilterId) {
    return [...bots];
  }

  const group = groups.find((candidate) => candidate.id === filterId);
  if (!group) {
    return [...bots];
  }

  const allowedBotIds = new Set(group.botIds);
  return bots.filter((bot) => allowedBotIds.has(bot.id));
}

export function pruneBotLibraryGroupsWithFewBots<
  TGroup extends BotLibraryGroupMaintenanceGroup,
>(
  groups: readonly TGroup[],
  minimumCustomBots = BOT_LIBRARY_CUSTOM_GROUP_MIN_BOTS
): TGroup[] {
  return groups.filter(
    (group) => group.builtIn === true || group.botIds.length >= minimumCustomBots
  );
}

export function pruneBotLibraryGroupsForExistingBots<
  TGroup extends BotLibraryGroupMaintenanceGroup,
>(
  groups: readonly TGroup[],
  existingBotIds: ReadonlySet<string>,
  minimumCustomBots = BOT_LIBRARY_CUSTOM_GROUP_MIN_BOTS
): TGroup[] {
  return pruneBotLibraryGroupsWithFewBots(
    groups.map((group) => {
      const botIds = group.botIds.filter((botId) => existingBotIds.has(botId));
      if (botIds.length === group.botIds.length) return group;
      return {
        ...group,
        botIds,
      } as TGroup;
    }),
    minimumCustomBots
  );
}
