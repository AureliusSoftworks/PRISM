export type CoffeeShellSessionPhase =
  "selecting" | "preview" | "barista" | "topic" | "arriving" | "live" | "finished";

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

export type LiveSessionChromeName = "Coffee" | "Debate" | "Signal";

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
      : sessionName === "Debate"
        ? "Return to the Debate lobby"
      : "Cut or finish the Signal session";
  return {
    lockMessage: `${exitInstruction} before changing LOCAL/ONLINE, model, Effort, or other session chrome. Auto still picks model and Effort for each generation when selected.`,
    disabledNavbarActions: {
      promptCenter: true,
      refresh: true,
      settings: true,
      voice: true,
      usage: true,
      memories: true,
      images: true,
      bots: true,
      theme: true,
    },
    disabledNavbarActionTooltips: {
      promptCenter: `${exitInstruction} before opening Prompt Center.`,
      refresh: `${exitInstruction} before refreshing Prism.`,
      settings: `${exitInstruction} before opening Settings.`,
      voice:
        sessionName === "Debate"
          ? `${exitInstruction} before changing Voice. The speaking type is frozen for this Duel.`
          : `${exitInstruction} before changing Voice. The recorded speaking type is baked for the session.`,
      usage: `${exitInstruction} before opening Usage.`,
      memories: `${exitInstruction} before opening Memories.`,
      images: `${exitInstruction} before opening Images.`,
      bots: `${exitInstruction} before changing bots.`,
      theme: `${exitInstruction} before changing Theme.`,
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
  const liveSessionActive =
    args.conversationActive &&
    (args.phase === "topic" ||
      args.phase === "arriving" ||
      args.phase === "live");
  const reviewActive = args.conversationActive && args.phase === "finished";
  const liveChromePolicy = liveSessionActive
    ? liveSessionChromePolicy("Coffee")
    : null;

  return {
    liveSessionActive,
    reviewActive,
    /* End lives on the live table chrome so the shared navbar can fully hide. */
    showEndSessionInSwitcher: false,
    disabledNavbarActions: liveChromePolicy?.disabledNavbarActions ?? {},
    disabledNavbarActionTooltips:
      liveChromePolicy?.disabledNavbarActionTooltips ?? {},
  };
}
