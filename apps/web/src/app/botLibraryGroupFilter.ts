export interface BotLibraryGroupFilterBot {
  id: string;
}

export interface BotLibraryGroupFilterGroup {
  id: string;
  botIds: readonly string[];
}

export type BotLibrarySearchTextForBot<TBot> = (
  bot: TBot
) => readonly (string | null | undefined)[];

export const BOT_LIBRARY_CUSTOM_GROUP_MIN_BOTS = 2;

export interface BotLibraryGroupMaintenanceGroup {
  id: string;
  botIds: string[];
  builtIn?: boolean;
  marketplaceThemeId?: string | null;
  updatedAt?: string;
}

export interface BotLibraryGroupUpsertGroup extends BotLibraryGroupMaintenanceGroup {
  name: string;
  description: string;
  deleteProtected: boolean;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BotLibraryGroupSelectionGroup {
  id: string;
  botIds: readonly string[];
  builtIn?: boolean;
}

export interface BotLibraryMultiSelectionActions {
  canCreateGroup: boolean;
}

export interface UpsertBotLibraryGroupOptions {
  name: string;
  description?: string;
  botIds: readonly string[];
  marketplaceThemeId?: string | null;
  now?: string;
  createGroupId: () => string;
}

export type AddBotToLibraryGroupStatus =
  | "added"
  | "missing-bot"
  | "missing-group"
  | "built-in-group"
  | "already-in-group"
  | "group-full";

export interface AddBotToLibraryGroupOptions {
  groupId: string;
  botId: string;
  existingBotIds?: ReadonlySet<string>;
  maxBots?: number;
  now?: string;
}

export interface AddBotToLibraryGroupResult<
  TGroup extends BotLibraryGroupMaintenanceGroup,
> {
  groups: TGroup[];
  status: AddBotToLibraryGroupStatus;
}

export function filterBotsByLibraryGroup<TBot extends BotLibraryGroupFilterBot>(
  bots: readonly TBot[],
  groups: readonly BotLibraryGroupFilterGroup[],
  filterId: string,
  allFilterId = "all",
  ungroupedFilterId = "ungrouped"
): TBot[] {
  if (filterId === allFilterId) {
    return [...bots];
  }

  if (filterId === ungroupedFilterId) {
    return filterUngroupedBotsByLibraryGroups(bots, groups);
  }

  const group = groups.find((candidate) => candidate.id === filterId);
  if (!group) {
    return [...bots];
  }

  const allowedBotIds = new Set(group.botIds);
  return bots.filter((bot) => allowedBotIds.has(bot.id));
}

export function filterBotsByLibrarySearch<TBot>(
  bots: readonly TBot[],
  query: string,
  searchTextForBot: BotLibrarySearchTextForBot<TBot>
): TBot[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...bots];

  return bots.filter((bot) =>
    searchTextForBot(bot).some(
      (value) =>
        typeof value === "string" &&
        value.toLocaleLowerCase().includes(normalizedQuery)
    )
  );
}

export function groupedBotIdsForLibraryGroups(
  groups: readonly BotLibraryGroupFilterGroup[]
): Set<string> {
  const groupedBotIds = new Set<string>();
  for (const group of groups) {
    for (const botId of group.botIds) {
      groupedBotIds.add(botId);
    }
  }
  return groupedBotIds;
}

export function filterUngroupedBotsByLibraryGroups<
  TBot extends BotLibraryGroupFilterBot,
>(
  bots: readonly TBot[],
  groups: readonly BotLibraryGroupFilterGroup[]
): TBot[] {
  const groupedBotIds = groupedBotIdsForLibraryGroups(groups);
  return bots.filter((bot) => !groupedBotIds.has(bot.id));
}

export function pruneBotLibraryGroupsWithFewBots<
  TGroup extends BotLibraryGroupMaintenanceGroup,
>(
  groups: readonly TGroup[],
  minimumCustomBots = BOT_LIBRARY_CUSTOM_GROUP_MIN_BOTS
): TGroup[] {
  return groups.filter(
    (group) =>
      group.builtIn === true ||
      group.botIds.length >= minimumCustomBots ||
      (typeof group.marketplaceThemeId === "string" &&
        group.marketplaceThemeId.trim().length > 0 &&
        group.botIds.length > 0)
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

export function resolveBotLibraryMultiSelectionActions(
  selectedBotIds: readonly string[]
): BotLibraryMultiSelectionActions {
  const selectedSet = new Set(selectedBotIds);
  return {
    canCreateGroup: selectedSet.size >= BOT_LIBRARY_CUSTOM_GROUP_MIN_BOTS,
  };
}

export function addBotToLibraryGroup<
  TGroup extends BotLibraryGroupMaintenanceGroup,
>(
  groups: readonly TGroup[],
  options: AddBotToLibraryGroupOptions
): AddBotToLibraryGroupResult<TGroup> {
  const botId = options.botId.trim();
  if (!botId || (options.existingBotIds && !options.existingBotIds.has(botId))) {
    return { groups: [...groups], status: "missing-bot" };
  }

  const targetIndex = groups.findIndex((group) => group.id === options.groupId);
  if (targetIndex < 0) {
    return { groups: [...groups], status: "missing-group" };
  }

  const target = groups[targetIndex]!;
  if (target.builtIn === true) {
    return { groups: [...groups], status: "built-in-group" };
  }

  const existingTargetBotIds = target.botIds.filter(
    (candidateBotId) =>
      !options.existingBotIds || options.existingBotIds.has(candidateBotId)
  );
  if (existingTargetBotIds.includes(botId)) {
    return { groups: [...groups], status: "already-in-group" };
  }

  const mergedBotIds = Array.from(new Set([...existingTargetBotIds, botId]));
  if (options.maxBots !== undefined && mergedBotIds.length > options.maxBots) {
    return { groups: [...groups], status: "group-full" };
  }

  const next = [...groups];
  next[targetIndex] = {
    ...target,
    botIds: mergedBotIds,
    updatedAt: options.now ?? new Date().toISOString(),
  } as TGroup;
  return { groups: next, status: "added" };
}

export function upsertBotLibraryGroup<
  TGroup extends BotLibraryGroupUpsertGroup,
>(
  groups: readonly TGroup[],
  options: UpsertBotLibraryGroupOptions
): TGroup[] {
  const name = options.name.trim();
  if (!name) return [...groups];

  const botIds = Array.from(
    new Set(options.botIds.filter((botId) => typeof botId === "string" && botId.trim().length > 0))
  );
  if (botIds.length === 0) return [...groups];

  const now = options.now ?? new Date().toISOString();
  const description = options.description?.trim() ?? "";
  const marketplaceThemeId = options.marketplaceThemeId?.trim().toLowerCase() || null;
  const normalizedName = name.toLowerCase();
  const existingIndex = groups.findIndex((group) => {
    const groupMarketplaceThemeId = group.marketplaceThemeId?.trim().toLowerCase() || null;
    if (marketplaceThemeId && groupMarketplaceThemeId === marketplaceThemeId) return true;
    return group.name.trim().toLowerCase() === normalizedName;
  });

  if (existingIndex >= 0) {
    const existing = groups[existingIndex]!;
    const next = [...groups];
    next[existingIndex] = {
      ...existing,
      description: description || existing.description,
      botIds: Array.from(new Set([...existing.botIds, ...botIds])),
      marketplaceThemeId: marketplaceThemeId ?? existing.marketplaceThemeId ?? null,
      updatedAt: now,
    };
    return next;
  }

  return [
    ...groups,
    {
      id: options.createGroupId(),
      name,
      description,
      botIds,
      deleteProtected: false,
      builtIn: false,
      marketplaceThemeId,
      createdAt: now,
      updatedAt: now,
    } as TGroup,
  ];
}
