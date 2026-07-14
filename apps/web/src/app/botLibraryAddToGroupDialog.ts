export function selectBotLibraryAddToGroupDialogGroup<
  T extends { groupId: string },
>(current: T | null, groupId: string): T | null {
  return current ? { ...current, groupId } : null;
}
