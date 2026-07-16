export type CoffeeShellSessionPhase =
  "selecting" | "preview" | "topic" | "arriving" | "live" | "finished";

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

export type UniversalNavbarTooltipMap = Partial<
  Record<UniversalNavbarAction, string>
>;

export interface CoffeeShellPolicy {
  liveSessionActive: boolean;
  reviewActive: boolean;
  showEndSessionInSwitcher: boolean;
  disabledNavbarActions: UniversalNavbarDisabledMap;
  disabledNavbarActionTooltips: UniversalNavbarTooltipMap;
}

export function coffeeShellPolicy(args: {
  conversationActive: boolean;
  phase: CoffeeShellSessionPhase;
}): CoffeeShellPolicy {
  const liveSessionActive = args.phase === "arriving" || args.phase === "live";
  const reviewActive = args.conversationActive && args.phase === "finished";

  return {
    liveSessionActive,
    reviewActive,
    showEndSessionInSwitcher: liveSessionActive,
    disabledNavbarActions: liveSessionActive
      ? { refresh: true, settings: true, images: true, bots: true }
      : {},
    disabledNavbarActionTooltips: liveSessionActive
      ? {
          refresh: "End the Coffee session before refreshing Prism.",
          settings: "End the Coffee session to open Settings.",
          images: "End the Coffee session to open Images.",
          bots: "End the Coffee session to change bots.",
        }
      : {},
  };
}
