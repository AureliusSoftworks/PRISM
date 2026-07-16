export type TutorialMode = "zen" | "chat" | "coffee" | "botcast" | "slate";

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
        heading: "Choose a relationship",
        body: "Choose PRISM or a persona to enter that relationship’s Home. Back or Escape returns you to the wider Library or group room exactly where you left it. Inviting a guest keeps you in the current Home.",
        clickLabel: "a PRISM or persona tile",
        targetSelector: '[data-tutorial-target="chat-bot-picker"]',
      },
      {
        heading: "Shape a saved group's room",
        body: "When a saved group is selected, Atmosphere keeps its reusable room backdrop. In a larger waiting room, a Listen up prompt stages 2-5 bots with that exact Coffee topic.",
        clickLabel: "Atmosphere in the saved group header",
        targetSelector: '[data-tutorial-target="chat-group-atmosphere"]',
      },
      {
        heading: "Continue this Home",
        body: "Each Home keeps its own Zen relationship and episodes. Type here to continue the one you are visiting.",
        clickLabel: "the message box at the bottom",
        targetSelector: '[data-tutorial-target="composer"]',
      },
      {
        heading: "Choose how replies recover",
        body: "AUTO keeps the current response model as Primary, then quietly tries your two saved fallbacks if a reply fails validation. Image generation keeps its own LOCAL/ONLINE choice in Images. Voices default to System TTS; selecting an ElevenLabs voice in Prism or bot customization overrides it only for eligible ONLINE speech.",
        clickLabel: "the LOCAL, AUTO, ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Let context breathe",
        body: "Recent messages stay visible while older continuity for this Home is carried through summaries and memory.",
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
        body: "Pick a bot, then send your first message.",
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
        heading: "Keep the moment honest",
        body: "Zen keeps the timeline as it happened. Type /undo to rewind the latest message when you need a clean correction.",
        clickLabel: "the message box at the bottom",
        targetSelector: '[data-tutorial-target="composer"]',
      },
    ],
  },
  coffee: {
    title: "Coffee mode walkthrough",
    steps: [
      {
        heading: "Pick or stage your table",
        body: "Choose a Coffee Group here, or arrive from a group waiting room with its Listen up topic and locally ranked table already staged.",
        clickLabel: "a Coffee Group in the left sidebar",
        targetSelector: '[data-tutorial-target="coffee-groups"]',
      },
      {
        heading: "Set the table",
        body: "Duration, presets, and group settings steer the whole session together. Account default uses the model saved in Settings; AUTO is the separate response-routing control and can recover through your saved fallbacks.",
        clickLabel: "New session setup or Configure settings",
        targetSelector: '[data-tutorial-target="coffee-session-setup"]',
      },
      {
        heading: "Choose the spark",
        body: "Pick one of the four prompts created for this group, or type your own before the table starts.",
        clickLabel: "a topic suggestion",
        targetSelector: '[data-tutorial-target="coffee-topic-picker"]',
      },
      {
        heading: "Keep the table moving",
        body: "Choose AUTO in the LOCAL, AUTO, ONLINE control to retry failed or malformed table turns. It changes response routing, not the Account default model choice, separate Images provider, or English voice preference.",
        clickLabel: "the LOCAL, AUTO, ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Join the conversation",
        body: "Once the table starts, type into the message box or let the bots carry the room. Poll votes and team choices share the Table Talk rail; drag its left edge or the topic divider when you want more room.",
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
        body: "Each host starts with an editable fallback name and a camera-ready PRISM set, so creating the show never waits on synthesis.",
        clickLabel: "a show or the Create show producer card",
        targetSelector: '[data-tutorial-target="botcast-shows"]',
      },
      {
        heading: "Shape the show’s identity",
        body: "A custom identity is optional. Create this show’s look once to let Signal find a clever name, then keep using PRISM while the activity card tracks its persona-shaped logo and matching Dark-to-Light studio pair in the background. Afterward, refresh the name, either studio, or the logo independently—or replace any visual with your own image.",
        clickLabel: "Create this show’s look or an independent refresh or replace control",
        targetSelector: '[data-tutorial-target="botcast-brand-controls"]',
      },
      {
        heading: "Book tonight’s episode",
        body: "Choose one guest, set the topic, and write an optional private angle. Pick LOCAL, AUTO, or ONLINE. AUTO keeps the account primary and recovers through your configured fallback chain; the other lanes can use the account model or a recording-only override. Signal locks that routing when the episode begins. The brief shapes the host but never goes on mic. Signal Settings can also opt ElevenLabs voices into sparse, saved vocal reactions.",
        clickLabel: "the episode setup desk",
        targetSelector: '[data-tutorial-target="botcast-setup"]',
      },
      {
        heading: "Produce from the control room",
        body: "Signal keeps one speaker on mic at a time: their face comes alive and the transcript follows only the words they have finished saying. Ask about a detail, press harder, move on, or lighten up. Repeated pressure can earn a warning and, rarely, a walkout.",
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
  slate: {
    title: "Slate writing desk walkthrough",
    steps: [
      {
        heading: "Start from a spark",
        body: "Name the prose project, give Slate the creative spark, optionally roll {wildcards}, and bring material you already wrote if you have it.",
        clickLabel: "the Create project card",
        targetSelector: '[data-tutorial-target="slate-create-project"]',
      },
      {
        heading: "Shape before drafting",
        body: "Ask Slate for a premise, cast, unresolved threads, and a practical scene plan. You remain free to redirect every part.",
        clickLabel: "Shape with Slate",
        targetSelector: '[data-tutorial-target="slate-shape"]',
      },
      {
        heading: "Direct the structure",
        body: "Select, edit, rearrange, remove, add, or lock structural cards. A lock tells Slate not to rewrite that approved material.",
        clickLabel: "a structure card",
        targetSelector: '[data-tutorial-target="slate-structure"]',
      },
      {
        heading: "Let Slate carry the draft",
        body: "Select a planned section, add one concise instruction, and generate manuscript prose without repeating a chat prompt.",
        clickLabel: "Draft selected section",
        targetSelector: '[data-tutorial-target="slate-draft"]',
      },
      {
        heading: "Keep your hands on the prose",
        body: "Edit the manuscript directly. Human edits autosave and remain authoritative over older AI proposals.",
        clickLabel: "the manuscript canvas",
        targetSelector: '[data-tutorial-target="slate-manuscript"]',
      },
      {
        heading: "Approve revisions deliberately",
        body: "Choose Deepen, Condense, Rewrite, Reframe, or Cut. Slate previews the replacement; you decide whether to accept or reject it.",
        clickLabel: "a Refine action",
        targetSelector: '[data-tutorial-target="slate-revision"]',
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
