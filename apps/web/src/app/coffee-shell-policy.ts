export type CoffeeShellSessionPhase =
  | "selecting"
  | "preview"
  | "topic"
  | "arriving"
  | "live"
  | "finished";

export type UniversalNavbarAction =
  | "promptCenter"
  | "refresh"
  | "settings"
  | "voice"
  | "usage"
  | "memories"
  | "atmosphere"
  | "images"
  | "bots"
  | "theme"
  | "hub";

export type UniversalNavbarDisabledMap = Partial<
  Record<UniversalNavbarAction, boolean>
>;

export interface CoffeeShellPolicy {
  liveSessionActive: boolean;
  reviewActive: boolean;
  showEndSessionInSwitcher: boolean;
  disabledNavbarActions: UniversalNavbarDisabledMap;
}

export function coffeeShellPolicy(args: {
  conversationActive: boolean;
  phase: CoffeeShellSessionPhase;
}): CoffeeShellPolicy {
  const liveSessionActive =
    args.phase === "arriving" || args.phase === "live";
  const reviewActive = args.conversationActive && args.phase === "finished";

  return {
    liveSessionActive,
    reviewActive,
    showEndSessionInSwitcher: liveSessionActive,
    disabledNavbarActions: liveSessionActive
      ? { refresh: true, images: true, bots: true }
      : {},
  };
}
