export type ZenHomeDockState = "docked" | "roaming";

export type ZenHomeDropRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function zenHomeDockState(
  preMessageConversationActive: boolean,
): ZenHomeDockState {
  return preMessageConversationActive ? "roaming" : "docked";
}

export function zenHomeDirectSelectionVisible({
  dockState,
  botCardsVisible,
  hueLensVisible,
}: {
  dockState: ZenHomeDockState;
  botCardsVisible: boolean;
  hueLensVisible: boolean;
}): boolean {
  return dockState === "docked" && (botCardsVisible || hueLensVisible);
}

/** True only for a release over the explicit retained Home-card target. */
export function zenHomeDropTargetContainsPoint(
  rect: ZenHomeDropRect,
  point: { x: number; y: number },
): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}
