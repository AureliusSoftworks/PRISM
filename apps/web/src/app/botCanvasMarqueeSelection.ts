export type CanvasBotMarqueeSelectionMode = "replace" | "toggle";

export type CanvasBotDirectoryView = "chat" | "sandbox" | "coffee" | "other";

export type CanvasBotTileActivation = "focus" | "unfocus";

export const BOT_BATCH_MENU_MIN_SELECTION = 2;

export function focusedCanvasBotId(args: {
  view: CanvasBotDirectoryView;
  sandboxGridSelectedBotId: string | null;
  zenPersonaBotId: string | null;
}): string | null {
  return args.view === "chat"
    ? args.zenPersonaBotId
    : args.sandboxGridSelectedBotId;
}

export function resolveCanvasBotTileActivation(args: {
  view: CanvasBotDirectoryView;
  conversationMessageCount: number | null;
  focusedBotId: string | null;
  botId: string;
}): CanvasBotTileActivation {
  return args.view === "chat" &&
    (args.conversationMessageCount === null ||
      args.conversationMessageCount === 0) &&
    args.focusedBotId === args.botId
    ? "unfocus"
    : "focus";
}

export function canvasBotDirectoryIsInteractive(args: {
  view: CanvasBotDirectoryView;
  conversationMessageCount: number | null;
  pendingReplyVisible: boolean;
}): boolean {
  if (args.pendingReplyVisible) return false;
  if (args.view === "chat") {
    return args.conversationMessageCount === null || args.conversationMessageCount === 0;
  }
  if (args.view === "sandbox") {
    return args.conversationMessageCount === null;
  }
  return false;
}

export interface CanvasBotMarqueeSelectionInput {
  mode: CanvasBotMarqueeSelectionMode;
  baseSelectedBotIds: ReadonlySet<string>;
  hitBotIds: Iterable<string>;
}

export function resolveCanvasBotMarqueeSelection({
  mode,
  baseSelectedBotIds,
  hitBotIds,
}: CanvasBotMarqueeSelectionInput): Set<string> {
  const uniqueHitBotIds = new Set(hitBotIds);
  if (mode === "replace") {
    return uniqueHitBotIds;
  }

  const nextSelectedBotIds = new Set(baseSelectedBotIds);
  for (const botId of uniqueHitBotIds) {
    if (baseSelectedBotIds.has(botId)) {
      nextSelectedBotIds.delete(botId);
    } else {
      nextSelectedBotIds.add(botId);
    }
  }
  return nextSelectedBotIds;
}

export function resolveInactiveCanvasBotMarqueeSelection(
  mode: CanvasBotMarqueeSelectionMode,
  baseSelectedBotIds: ReadonlySet<string>,
  pressedBotId?: string | null
): Set<string> {
  if (mode === "replace") return new Set();
  const nextSelectedBotIds = new Set(baseSelectedBotIds);
  if (!pressedBotId) return nextSelectedBotIds;
  if (baseSelectedBotIds.has(pressedBotId)) {
    nextSelectedBotIds.delete(pressedBotId);
  } else {
    nextSelectedBotIds.add(pressedBotId);
  }
  return nextSelectedBotIds;
}

/** A modified card press only changes the durable batch selection. */
export function canvasBotClickTogglesBatchSelection(args: {
  shiftKey: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): boolean {
  return args.shiftKey || args.ctrlKey === true || args.metaKey === true;
}

/** A normal card activation leaves the transient batch mode. */
export function canvasBotSelectionAfterPlainActivation(): Set<string> {
  return new Set();
}

/**
 * When a menu is dismissed by pressing another bot card, consume that same
 * activation so closing the menu never also opens or focuses a bot.
 */
export function canvasBotMenuDismissalSuppressesCardActivation(
  eventTargetIsCanvasBotCard: boolean,
): boolean {
  return eventTargetIsCanvasBotCard;
}

/**
 * Keeps batch actions constrained to bots still available in the current
 * library surface, and refuses to create a batch menu for a singleton.
 */
export function resolveCanvasBotBatchMenuSelection(args: {
  selectedBotIds: Iterable<string>;
  availableBotIds: Iterable<string>;
}): string[] {
  const available = new Set(args.availableBotIds);
  const selection = Array.from(new Set(args.selectedBotIds)).filter((botId) =>
    available.has(botId),
  );
  return selection.length >= BOT_BATCH_MENU_MIN_SELECTION ? selection : [];
}

/** Preserve the pointer anchor while guarding against an off-viewport event. */
export function clampCanvasBotBatchMenuAnchor(args: {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
}): { x: number; y: number } {
  const width = Math.max(0, args.viewportWidth);
  const height = Math.max(0, args.viewportHeight);
  return {
    x: Math.max(0, Math.min(width, args.x)),
    y: Math.max(0, Math.min(height, args.y)),
  };
}
