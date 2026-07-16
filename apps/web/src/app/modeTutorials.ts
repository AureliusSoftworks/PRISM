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
        body: "Choose PRISM or a persona to enter that relationship’s Home. Ready Powers stay active with that persona here and across PRISM. Back or Escape returns you to the wider Library or group room exactly where you left it. Inviting a guest keeps you in the current Home.",
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
        body: "AUTO keeps the current response model as Primary, then quietly tries your two saved fallbacks if a reply fails validation. Image generation keeps its own LOCAL/ONLINE choice in Images. Voices default to System TTS. You can choose an ElevenLabs voice in bot customization from any response mode; Prism uses it only for eligible ONLINE speech.",
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
        body: "Pick a bot, then send your first message. Any ready Powers stay active with that bot across PRISM.",
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
        body: "Choose a Coffee Group here, or arrive from a group waiting room with its Listen up topic and locally ranked table already staged. Each bot brings its ready Powers to the table.",
        clickLabel: "a Coffee Group in the left sidebar",
        targetSelector: '[data-tutorial-target="coffee-groups"]',
      },
      {
        heading: "Set the table",
        body: "Duration, presets, and group settings steer the whole session together. Auto duration is open-ended with no countdown; switch to Timed when you want a 3-30 minute table. Account default uses the model saved in Settings; AUTO is the separate response-routing control and can recover through your saved fallbacks.",
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
        body: "A custom identity is optional. Create this show’s look once to let Signal find a clever name, then keep using PRISM while the activity card tracks its persona-shaped logo and matching Dark-to-Light studio pair in the background. Afterward, open the gear at the bottom-right of the show card to tune the name, logo, linked studio pair, and opening ident, or replace either studio visual with your own image.",
        clickLabel: "Create this show’s look or the show-card gear",
        targetSelector: '[data-tutorial-target="botcast-brand-controls"]',
      },
      {
        heading: "Give it an opening sound",
        body: "Every show has a deterministic, host-persona-led Signal Synth ident made and played locally—no key or network required. Playback stays here in the strip: use Play intro to audition exactly what the next episode will use. Once the show has custom art, open its gear to create or refresh a cached six-second ElevenLabs intro, or switch back to Signal Synth. Until then, those tuning actions stay in this strip. Signal never generates music when an episode begins.",
        clickLabel: "the opening ident controls",
        targetSelector: '[data-tutorial-target="botcast-intro-audio"]',
      },
      {
        heading: "Choose how the bots speak",
        body: "The Voice picker in Signal’s top navbar matches Zen: Mute stays silent, English speaks normally, Babble keeps the selected voice without intelligible words, and Bottish uses Prism’s procedural robot language. The saved choice applies to both host and guest.",
        clickLabel: "the Voice picker in the top navbar",
        targetSelector: '[data-tutorial-target="botcast-voice-mode"]',
      },
      {
        heading: "Book tonight’s episode",
        body: "Choose one guest, set the topic, and write an optional private angle—or use Randomize booking to fill all three locally from PRISM conversation starters, then edit anything you like. Host and guest bring their ready Powers on mic, including cup pace when a Power affects it. Episode length defaults to Auto: no countdown, at least a few real exchanges, then a natural close when the conversation settles; choose a timed target when you want one. Beginning the episode opens a short, skippable show-branded pre-roll while Signal prepares the host’s opening line and paces the next safe handoff ahead. The default stage places both bots in the authored chairs and both cups on the table. If generated studio furniture lands differently, open Align stage and drag them into place; Signal saves that alignment for every episode of the show, and close-up pans center on those saved bot positions. Pick LOCAL, AUTO, or ONLINE. AUTO keeps the account primary and recovers through your configured fallback chain; the other lanes can use the account model or a recording-only override. Signal locks that routing when the episode begins. The brief shapes the host but never goes on mic. Signal Settings can also opt ElevenLabs voices into sparse, saved vocal reactions.",
        clickLabel: "the episode setup desk",
        targetSelector: '[data-tutorial-target="botcast-setup"]',
      },
      {
        heading: "Produce from the control room",
        body: "Signal keeps one speaker on mic at a time: their face comes alive and the transcript follows only the words they have finished saying. Ask about a detail, press harder, move on, or lighten up with a private host cue. Wrap it up is shared episode direction: both bots carry the closing exchange through to a real ending. Cut show immediately cuts away and archives the recording instead; it does not discard the transcript. Natural endings and hard cuts both land on a short, locally synthesized outro. Repeated pressure can earn a warning and, rarely, a walkout.",
        clickLabel: "a producer cue card",
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
        body: "New work starts with one creative spark or pages you already wrote. Wildcard help appears only when you ask for it or type {wildcards}; Slate then suggests a working title and waits for your confirmation before creating anything. Returning work opens with a quiet story-so-far session and one suggested next move.",
        clickLabel: "the project start or return card",
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
        body: "Tell Slate what should change in plain language. It previews one focused replacement and waits for you to accept or reject it. When Continuity notices a source-linked conflict, it asks for one natural-language decision here instead of exposing a wiki or ribbon.",
        clickLabel: "the revision direction",
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
