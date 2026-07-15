import type {
  SlateRevision,
  SlateRevisionScope,
  SlateStructureItem,
} from "@localai/shared";

export function reorderSlateStructure(
  structure: readonly SlateStructureItem[],
  itemId: string,
  direction: -1 | 1,
): SlateStructureItem[] {
  const index = structure.findIndex((item) => item.id === itemId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= structure.length) return [...structure];
  const next = [...structure];
  const [item] = next.splice(index, 1);
  if (!item) return [...structure];
  next.splice(target, 0, item);
  return next;
}

export function latestPendingSlateRevision(
  revisions: readonly SlateRevision[],
): SlateRevision | null {
  return revisions.find((revision) => revision.status === "pending") ?? null;
}

export function slateRevisionScopeForWorkspace({
  selectionStart,
  selectionEnd,
  selectedStructureItem,
}: {
  selectionStart: number;
  selectionEnd: number;
  selectedStructureItem: SlateStructureItem | null;
}): SlateRevisionScope {
  if (selectionEnd > selectionStart) return "selection";
  if (selectedStructureItem?.status === "drafted") return "scene";
  return "project";
}
