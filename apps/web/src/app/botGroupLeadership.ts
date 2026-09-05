export interface BotGroupLeadershipSource {
  leaderBotId?: string | null;
}

export function botGroupLeadershipCount(
  groups: readonly BotGroupLeadershipSource[],
  botId: string | null | undefined,
): number {
  const normalizedBotId = botId?.trim() ?? "";
  if (!normalizedBotId) return 0;
  return groups.reduce(
    (count, group) => count + (group.leaderBotId === normalizedBotId ? 1 : 0),
    0,
  );
}
