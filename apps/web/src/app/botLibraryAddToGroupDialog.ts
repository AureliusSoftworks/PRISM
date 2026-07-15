export function selectBotLibraryAddToGroupDialogGroup<
  T extends { groupId: string },
>(current: T | null, groupId: string): T | null {
  return current ? { ...current, groupId } : null;
}

export function selectBotLibraryAddToGroupDialogBot<T extends { botId: string }>(
  current: T | null,
  botId: string,
): T | null {
  return current ? { ...current, botId } : null;
}
