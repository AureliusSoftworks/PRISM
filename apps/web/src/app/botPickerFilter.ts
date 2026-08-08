export interface FilterableBotPickerItem {
  id: string;
  name: string;
}

export interface BotPickerFilterGroup {
  id: string;
  botIds: readonly string[];
}

export interface BotPickerRainbowSortKey extends FilterableBotPickerItem {
  colorClass: number;
  huePosition: number;
  luminance: number;
  saturation: number;
}

/**
 * Linearize the circular hue wheel into one continuous visual axis. The seam
 * sits inside red so red wraps together at the beginning, followed by orange,
 * yellow, green, cyan/blue, indigo, violet, and magenta.
 */
export function botPickerRainbowHuePosition(hue: number): number {
  const wrapped = ((hue % 360) + 360) % 360;
  return wrapped >= 345 ? wrapped - 360 : wrapped;
}

/**
 * A total, transitive ordering for the visual rainbow. Exact hue is primary;
 * luminance and saturation only order bots that share the same hue.
 */
export function compareBotPickerRainbowSortKeys(
  left: BotPickerRainbowSortKey,
  right: BotPickerRainbowSortKey,
): number {
  if (left.colorClass !== right.colorClass) {
    return left.colorClass - right.colorClass;
  }
  if (left.huePosition !== right.huePosition) {
    return left.huePosition - right.huePosition;
  }
  if (left.luminance !== right.luminance) {
    return right.luminance - left.luminance;
  }
  if (left.saturation !== right.saturation) {
    return right.saturation - left.saturation;
  }
  return compareBotPickerItemsByName(left, right);
}

/**
 * Return row-major cells whose source items fill top-to-bottom first. This
 * makes each visual column a tight hue family while the spectrum progresses
 * left-to-right across the picker.
 */
export function arrangeBotPickerItemsInColumnBands<T>(
  items: readonly T[],
  columnCount: number,
  rowCount: number,
): Array<T | null> {
  const columns = Math.max(1, Math.floor(columnCount));
  const rows = Math.max(1, Math.floor(rowCount));
  const cells = Array<T | null>(columns * rows).fill(null);
  const itemCount = Math.min(items.length, cells.length);

  for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
    const column = Math.floor(itemIndex / rows);
    const row = itemIndex % rows;
    cells[row * columns + column] = items[itemIndex] ?? null;
  }

  return cells;
}

export function compareBotPickerItemsByName(
  left: FilterableBotPickerItem,
  right: FilterableBotPickerItem,
): number {
  return (
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
}

export function sortBotPickerItems<T extends FilterableBotPickerItem>(
  items: readonly T[],
  hueLensActive: boolean,
  compareByColor?: (left: T, right: T) => number,
): T[] {
  return [...items].sort(
    hueLensActive && compareByColor
      ? compareByColor
      : compareBotPickerItemsByName,
  );
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
