export interface CommandCenterOrderedItem {
  id: string;
}

export type CommandCenterDropPlacement = "before" | "after";

export function moveCommandCenterItemToTarget<T extends CommandCenterOrderedItem>(
  items: T[],
  itemId: string,
  targetId: string,
  placement: CommandCenterDropPlacement,
  canMoveItem: (item: T) => boolean = () => true
): T[] {
  if (itemId === targetId) return items;

  const movableIndexes: number[] = [];
  items.forEach((item, index) => {
    if (canMoveItem(item)) movableIndexes.push(index);
  });

  const movableItems = movableIndexes.map((index) => items[index]!);
  const sourceIndex = movableItems.findIndex((item) => item.id === itemId);
  const targetIndex = movableItems.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return items;

  const movingItem = movableItems[sourceIndex]!;
  const remainingItems = movableItems.filter((item) => item.id !== itemId);
  const targetIndexAfterRemoval = remainingItems.findIndex((item) => item.id === targetId);
  if (targetIndexAfterRemoval < 0) return items;

  const insertIndex =
    targetIndexAfterRemoval + (placement === "after" ? 1 : 0);
  remainingItems.splice(insertIndex, 0, movingItem);

  const originalOrder = movableItems.map((item) => item.id).join("\n");
  const nextOrder = remainingItems.map((item) => item.id).join("\n");
  if (originalOrder === nextOrder) return items;

  const next = [...items];
  movableIndexes.forEach((itemIndex, slotIndex) => {
    next[itemIndex] = remainingItems[slotIndex]!;
  });
  return next;
}
