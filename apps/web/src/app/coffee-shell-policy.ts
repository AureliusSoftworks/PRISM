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

export type LiveSessionChromeName = "Coffee" | "Signal";

export interface LiveSessionChromePolicy {
  lockMessage: string;
  disabledNavbarActions: UniversalNavbarDisabledMap;
  disabledNavbarActionTooltips: UniversalNavbarTooltipMap;
}

export function liveSessionChromePolicy(
  sessionName: LiveSessionChromeName,
): LiveSessionChromePolicy {
  const exitInstruction =
    sessionName === "Coffee"
      ? "End the Coffee session"
      : "Cut or finish the Signal session";
  return {
    lockMessage: `${exitInstruction} before changing session chrome.`,
    disabledNavbarActions: {
      promptCenter: true,
      refresh: true,
      settings: true,
      voice: true,
      images: true,
      bots: true,
    },
    disabledNavbarActionTooltips: {
      promptCenter: `${exitInstruction} before opening Prompt Center.`,
      refresh: `${exitInstruction} before refreshing Prism.`,
      settings: `${exitInstruction} before opening Settings.`,
      voice: `${exitInstruction} before changing Voice mode.`,
      images: `${exitInstruction} before opening Images.`,
      bots: `${exitInstruction} before changing bots.`,
    },
  };
}

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
  const liveChromePolicy = liveSessionActive
    ? liveSessionChromePolicy("Coffee")
    : null;

  return {
    liveSessionActive,
    reviewActive,
    showEndSessionInSwitcher: liveSessionActive,
    disabledNavbarActions: liveChromePolicy?.disabledNavbarActions ?? {},
    disabledNavbarActionTooltips:
      liveChromePolicy?.disabledNavbarActionTooltips ?? {},
  };
}
