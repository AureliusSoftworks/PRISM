export const BOT_PICKER_GROUP_MENU_GAP_PX = 6;
export const BOT_PICKER_GROUP_MENU_EDGE_PX = 8;
export const BOT_PICKER_GROUP_MENU_MIN_HEIGHT_PX = 120;
export const BOT_PICKER_GROUP_MENU_FLIP_BELOW_PX = 160;
export const BOT_PICKER_GROUP_MENU_MIN_WIDTH_PX = 240;
export const BOT_PICKER_GROUP_MENU_Z_INDEX = 4200;

export interface BotPickerGroupMenuTriggerRect {
  top: number;
  right: number;
  bottom: number;
  width: number;
}

export interface BotPickerGroupMenuViewport {
  width: number;
  height: number;
}

export interface BotPickerGroupMenuPlacement {
  position: "fixed";
  top: number | "auto";
  /** Must be explicit. Chat's composeBotMenu CSS otherwise keeps `bottom: calc(100% + 6px)`. */
  bottom: number | "auto";
  left: number;
  width: number;
  maxHeight: number;
  zIndex: number;
}

/**
 * Place the shared group menu on `document.body`. Chat's composer menu opens
 * upward with a parent-relative `bottom`; a body portal must override that.
 */
export function placeBotPickerGroupMenu(
  trigger: BotPickerGroupMenuTriggerRect,
  viewport: BotPickerGroupMenuViewport,
): BotPickerGroupMenuPlacement {
  const width = Math.max(BOT_PICKER_GROUP_MENU_MIN_WIDTH_PX, trigger.width);
  const left = Math.max(
    BOT_PICKER_GROUP_MENU_EDGE_PX,
    Math.min(
      trigger.right - width,
      viewport.width - width - BOT_PICKER_GROUP_MENU_EDGE_PX,
    ),
  );
  const spaceBelow =
    viewport.height - trigger.bottom - BOT_PICKER_GROUP_MENU_EDGE_PX;
  const spaceAbove = trigger.top - BOT_PICKER_GROUP_MENU_EDGE_PX;
  const openAbove =
    spaceBelow < BOT_PICKER_GROUP_MENU_FLIP_BELOW_PX &&
    spaceAbove > spaceBelow;

  if (openAbove) {
    return {
      position: "fixed",
      top: "auto",
      bottom:
        viewport.height - trigger.top + BOT_PICKER_GROUP_MENU_GAP_PX,
      left,
      width,
      maxHeight: Math.max(
        BOT_PICKER_GROUP_MENU_MIN_HEIGHT_PX,
        spaceAbove - BOT_PICKER_GROUP_MENU_GAP_PX,
      ),
      zIndex: BOT_PICKER_GROUP_MENU_Z_INDEX,
    };
  }

  return {
    position: "fixed",
    top: trigger.bottom + BOT_PICKER_GROUP_MENU_GAP_PX,
    bottom: "auto",
    left,
    width,
    maxHeight: Math.max(
      BOT_PICKER_GROUP_MENU_MIN_HEIGHT_PX,
      spaceBelow - BOT_PICKER_GROUP_MENU_GAP_PX,
    ),
    zIndex: BOT_PICKER_GROUP_MENU_Z_INDEX,
  };
}
