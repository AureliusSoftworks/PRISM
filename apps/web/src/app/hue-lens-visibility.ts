import type { PrismSurfaceView } from "./viewRouting";

interface EmptyStateHueLensVisibilityInput {
  view: PrismSurfaceView;
  hueLensAvailable: boolean;
  conversationIsEmpty: boolean;
  privateChatActive: boolean;
  hasSelectedBot: boolean;
}

/**
 * The empty Chat and Sandbox bot browsers both collapse dense libraries into
 * an icon-only color map, so both surfaces need the hue lens for navigation.
 */
export function shouldShowEmptyStateHueLens({
  view,
  hueLensAvailable,
  conversationIsEmpty,
  privateChatActive,
  hasSelectedBot,
}: EmptyStateHueLensVisibilityInput): boolean {
  const hasBotBrowser = view === "chat" || view === "sandbox";
  return (
    hasBotBrowser &&
    hueLensAvailable &&
    conversationIsEmpty &&
    !privateChatActive &&
    !hasSelectedBot
  );
}
