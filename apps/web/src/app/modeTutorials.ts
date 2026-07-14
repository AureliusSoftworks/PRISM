export type TutorialMode = "zen" | "chat" | "coffee";

export interface ModeTutorialStep {
  heading: string;
  body: string;
  clickLabel: string;
  targetSelector: string;
}

export interface ModeTutorial {
  title: string;
  steps: readonly ModeTutorialStep[];
}

export const MODE_TUTORIALS: Record<TutorialMode, ModeTutorial> = {
  zen: {
    title: "Zen walkthrough",
    steps: [
      {
        heading: "Stay with PRISM",
        body: "Zen is one continuous PRISM-only conversation. There are no bot or model pickers here.",
        clickLabel: "the message box at the bottom",
        targetSelector: '[data-tutorial-target="composer"]',
      },
      {
        heading: "Let context breathe",
        body: "Recent messages stay visible while older continuity is carried through summaries and memory.",
        clickLabel: "the conversation canvas",
        targetSelector: '[data-tutorial-target="conversation-canvas"]',
      },
      {
        heading: "Use Atmosphere gently",
        body: "Turn Atmosphere on from the header when you want the conversation backdrop to evolve.",
        clickLabel: "the horizon icon in the top toolbar",
        targetSelector: '[data-tutorial-target="zen-atmosphere"]',
      },
    ],
  },
  chat: {
    title: "Chat mode walkthrough",
    steps: [
      {
        heading: "Start with a bot",
        body: "Pick a bot, then send your first message. Bots inherit your account model defaults unless you choose a temporary workspace override.",
        clickLabel: "a bot tile in the center picker",
        targetSelector: '[data-tutorial-target="chat-bot-picker"]',
      },
      {
        heading: "Use quick tools",
        body: "Right-click in the canvas for shortcuts to settings, memories, images, and bot actions.",
        clickLabel: "the conversation canvas with your right mouse button",
        targetSelector: '[data-tutorial-target="conversation-canvas"]',
      },
      {
        heading: "Fix and refine",
        body: "Message actions let you copy, edit, fork, and resend without losing your flow.",
        clickLabel: "the action row beneath a message",
        targetSelector: '[data-tutorial-target="chat-message-actions"]',
      },
    ],
  },
  coffee: {
    title: "Coffee mode walkthrough",
    steps: [
      {
        heading: "Pick your table",
        body: "Choose a Coffee Group and seat bots to set the conversation vibe before starting.",
        clickLabel: "a Coffee Group in the left sidebar",
        targetSelector: '[data-tutorial-target="coffee-groups"]',
      },
      {
        heading: "Set the table",
        body: "Duration, presets, and group settings steer the whole session together. The table model picker is a temporary session choice.",
        clickLabel: "New session setup or Configure settings",
        targetSelector: '[data-tutorial-target="coffee-session-setup"]',
      },
      {
        heading: "Join the conversation",
        body: "Once the table starts, type into the message box or let the bots carry the room for a while.",
        clickLabel: "the Coffee message box",
        targetSelector: '[data-tutorial-target="composer"]',
      },
    ],
  },
};

export function modeTutorialStep(
  mode: TutorialMode,
  index: number,
): ModeTutorialStep {
  const tutorial = MODE_TUTORIALS[mode];
  const safeIndex = Math.max(
    0,
    Math.min(tutorial.steps.length - 1, Math.floor(Number.isFinite(index) ? index : 0)),
  );
  return tutorial.steps[safeIndex]!;
}
