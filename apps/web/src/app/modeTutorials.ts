export type TutorialMode = "zen" | "chat" | "coffee" | "botcast";

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
        body: "Zen is one continuous PRISM conversation. Choose LOCAL, AUTO, or ONLINE from the header; Auto uses the recovery chain you set in Settings.",
        clickLabel: "the message box at the bottom",
        targetSelector: '[data-tutorial-target="composer"]',
      },
      {
        heading: "Choose how replies recover",
        body: "AUTO keeps the current model as Primary, then quietly tries your two saved fallbacks if a reply fails validation.",
        clickLabel: "the LOCAL, AUTO, ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
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
        body: "Duration, presets, and group settings steer the whole session together. The table model is Primary; AUTO can recover through your two saved fallbacks.",
        clickLabel: "New session setup or Configure settings",
        targetSelector: '[data-tutorial-target="coffee-session-setup"]',
      },
      {
        heading: "Choose the spark",
        body: "Pick a topic tailored to this group, type your own, or regenerate the ideas before the table starts.",
        clickLabel: "a topic suggestion or Regenerate ideas",
        targetSelector: '[data-tutorial-target="coffee-topic-picker"]',
      },
      {
        heading: "Keep the table moving",
        body: "Choose AUTO to retry failed or malformed table turns without adding error dialogue to the transcript.",
        clickLabel: "the LOCAL, AUTO, ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Join the conversation",
        body: "Once the table starts, type into the message box or let the bots carry the room for a while.",
        clickLabel: "the Coffee message box",
        targetSelector: '[data-tutorial-target="composer"]',
      },
    ],
  },
  botcast: {
    title: "Signal producer walkthrough",
    steps: [
      {
        heading: "Give a bot a show",
        body: "Each host owns one persistent show with its own name, premise, studio identity, and episode shelf.",
        clickLabel: "a show or the Create show producer card",
        targetSelector: '[data-tutorial-target="botcast-shows"]',
      },
      {
        heading: "Book tonight’s episode",
        body: "Choose one guest, set the topic, and write an optional private angle. The brief shapes the host but never goes on mic.",
        clickLabel: "the episode setup desk",
        targetSelector: '[data-tutorial-target="botcast-setup"]',
      },
      {
        heading: "Produce from the control room",
        body: "Ask about a detail, press harder, move on, or lighten up. Repeated pressure can earn a warning and, rarely, a walkout.",
        clickLabel: "a private producer cue",
        targetSelector: '[data-tutorial-target="botcast-cues"]',
      },
      {
        heading: "Direct the replay",
        body: "Replay defaults to Auto. Left, Right, and Wide lock the viewer’s camera without rewriting the saved director track.",
        clickLabel: "an archived episode",
        targetSelector: '[data-tutorial-target="botcast-replay"]',
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
