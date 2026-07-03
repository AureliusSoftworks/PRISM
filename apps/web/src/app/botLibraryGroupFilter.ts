export interface BotLibraryGroupFilterBot {
  id: string;
}

export interface BotLibraryGroupFilterGroup {
  id: string;
  botIds: readonly string[];
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
