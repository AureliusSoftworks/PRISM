export interface ChoiceChipRailViewportState {
  chatSurface: boolean;
  anchorMessageId: string | null;
  latestAssistantMessageId: string | null;
}

export function shouldChoiceChipRailControlViewport({
  chatSurface,
  anchorMessageId,
  latestAssistantMessageId,
}: ChoiceChipRailViewportState): boolean {
  if (anchorMessageId === null) return false;
  if (!chatSurface) return true;
  return latestAssistantMessageId !== null && anchorMessageId === latestAssistantMessageId;
}
