import {
  normalizeBotcastStudioLayout,
  type BotcastStudioLayout,
  type BotcastStudioLayoutItem,
} from "@localai/shared";

export function signalStudioPlacementStyle(
  layout: BotcastStudioLayout | null | undefined,
  item: BotcastStudioLayoutItem,
): { left: string; top: string } {
  const point = normalizeBotcastStudioLayout(layout)[item];
  return {
    left: `${point.x}%`,
    top: `${point.y}%`,
  };
}
