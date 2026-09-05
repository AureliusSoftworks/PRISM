export interface BotLibraryGroupManagerGroup {
  id: string;
  name: string;
  description: string;
  botIds: readonly string[];
  builtIn: boolean;
}

/** A dialog-only copy: callers decide when its changes become persistent. */
export function createBotLibraryGroupManagerDraft<
  TGroup extends BotLibraryGroupManagerGroup,
>(groups: readonly TGroup[]): TGroup[] {
  return groups.map((group) => ({ ...group, botIds: [...group.botIds] }));
}

export function renameBotLibraryGroupManagerDraft<
  TGroup extends BotLibraryGroupManagerGroup,
>(groups: readonly TGroup[], groupId: string, name: string): TGroup[] {
  return groups.map((group) =>
    group.id === groupId ? ({ ...group, name } as TGroup) : group,
  );
}

export function describeBotLibraryGroupManagerDraft<
  TGroup extends BotLibraryGroupManagerGroup,
>(groups: readonly TGroup[], groupId: string, description: string): TGroup[] {
  return groups.map((group) =>
    group.id === groupId ? ({ ...group, description } as TGroup) : group,
  );
}

export function removeBotLibraryGroupManagerDraft<
  TGroup extends BotLibraryGroupManagerGroup,
>(groups: readonly TGroup[], groupId: string): TGroup[] {
  return groups.filter((group) => group.id !== groupId || group.builtIn);
}

export function setBotLibraryGroupManagerMembers<
  TGroup extends BotLibraryGroupManagerGroup,
>(
  groups: readonly TGroup[],
  groupId: string,
  botIds: readonly string[],
): TGroup[] {
  return groups.map((group) =>
    group.id === groupId
      ? ({ ...group, botIds: Array.from(new Set(botIds)) } as TGroup)
      : group,
  );
}

export function botLibraryGroupManagerNameError<
  TGroup extends Pick<BotLibraryGroupManagerGroup, "id" | "name">,
>(groups: readonly TGroup[], groupId: string, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Group name cannot be empty.";
  const duplicate = groups.some(
    (group) =>
      group.id !== groupId && group.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  return duplicate ? `A bot group named "${trimmed}" already exists.` : null;
}
