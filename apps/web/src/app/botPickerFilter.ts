export interface FilterableBotPickerItem {
  id: string;
  name: string;
}

export interface BotPickerFilterGroup {
  id: string;
  botIds: readonly string[];
}

export function filterBotPickerItems<T extends FilterableBotPickerItem>(
  items: readonly T[],
  searchValue: string,
  groupId: string,
  groups: readonly BotPickerFilterGroup[],
): T[] {
  const normalizedSearch = searchValue.trim().toLocaleLowerCase();
  const group =
    groupId === "all"
      ? null
      : (groups.find((candidate) => candidate.id === groupId) ?? null);
  const groupIds = group ? new Set(group.botIds) : null;
  return items.filter(
    (item) =>
      (!groupIds || groupIds.has(item.id)) &&
      (!normalizedSearch ||
        item.name.toLocaleLowerCase().includes(normalizedSearch)),
  );
}
