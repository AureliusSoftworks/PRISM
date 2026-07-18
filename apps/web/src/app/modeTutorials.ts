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
        body: "AUTO keeps the current response model as Primary, then quietly tries your ordered chain of one to five saved local or online fallbacks if a reply fails validation. Image generation keeps its own LOCAL/ONLINE choice in Images. Voices default to System TTS. In bot customization, choose an ElevenLabs voice from the list or open “Use an exact Voice ID” for a portable override; Prism uses it only for eligible ONLINE speech. Voice Settings can narrow those bot menus to one ElevenLabs voice collection. With Voice Effects on, longer spoken replies may take a quiet mic-ready breath before the line.",
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
        body: "Choose a Coffee Group here, or arrive from a group waiting room with its Listen up topic and locally ranked table already staged. Each bot brings its ready Powers to the table; Powers can change who they notice, answer, remember, privately read, how strongly they pull the room's attention, or whether they touch their coffee at all.",
        clickLabel: "a Coffee Group in the left sidebar",
        targetSelector: '[data-tutorial-target="coffee-groups"]',
      },
      {
        heading: "Set the table",
        body: "Duration, presets, and group settings steer the whole session together. Auto duration is open-ended with no countdown; switch to Timed when you want a 3-30 minute table. Under Recent sessions, Open returns to the replay while Use setup restores that table's attendance, duration, pacing settings, and topic for an editable retry; the current model and response routing stay selected. Account default uses the model saved in Settings; AUTO is the separate response-routing control and can recover through your ordered chain of one to five local or online fallbacks. When a selected local model needs a first load, PRISM may briefly hold the table and pause its clock; the conversation resumes automatically once the room is ready.",
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
        body: "Choose AUTO in the LOCAL, AUTO, ONLINE control to retry failed or malformed table turns. It changes response routing, not the Account default model choice, separate Images provider, or English voice preference. Choose routing and voice before the table starts: once the session is live, those controls and session-changing navbar tools stay locked until you choose End session. Read-only Usage and Memories plus the Theme control remain available.",
        clickLabel: "the LOCAL, AUTO, ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Join the conversation",
        body: "Once the table starts, type into the message box or let the bots carry the room. Watch a directly addressed bot: while listening, it may give a small nod, lean, expression, or brief spoken acknowledgement without taking a turn or entering the transcript. Your Cross-talk setting now controls how often those audible overlaps happen, from nearly silent in Rare to lively in Pile-up; inferred listeners remain visual only. With Voice Effects on, longer bot turns may take a sparse mic-ready breath before speaking. Poll votes and team choices share the Table Talk rail; drag its left edge or the topic divider when you want more room.",
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
        body: "Each host starts with an editable fallback name and a camera-ready PRISM set, so creating the show never waits on synthesis. Right-click a host or guest anywhere in Signal to open that bot’s actions and Avatar Studio.",
        clickLabel: "a show or the Create show producer card",
        targetSelector: '[data-tutorial-target="botcast-shows"]',
      },
      {
        heading: "Shape the show’s identity",
        body: "A custom identity is optional. Create this show’s look once to let Signal find a clever name and a large rotation of funny, host-shaped dashboard blurbs, then keep using PRISM while the activity card tracks its transparent, theme-ready logo and matching Dark-to-Light studio pair in the background. Afterward, open the gear at the bottom-right of the show card to tune the name, regenerate just those blurbs, adjust the logo, linked studio pair, and atmosphere audio, or replace either studio visual with your own image.",
        clickLabel: "Create this show’s look or the show-card gear",
        targetSelector: '[data-tutorial-target="botcast-brand-controls"]',
      },
      {
        heading: "Build an audience",
        body: "Every show begins with no audience. Completed episodes build a simulated viewer base, while one randomly chosen persona from your Library listens back and leaves a candid rating and short named review. Ratings stay marked as early until enough reactions accumulate. Click the Audience pulse card to open the full review history with each episode’s rating, so the archive becomes the honest foundation of the show’s emerging economy.",
        clickLabel: "the audience pulse",
        targetSelector: '[data-tutorial-target="botcast-audience-pulse"]',
      },
      {
        heading: "Give the studio an atmosphere",
        body: "Every show starts with a deterministic, host-persona-led Signal Synth ident, a bundled quiet studio room tone, a subtle static backdrop, and tactile Foley—available locally with no key or network and no custom look. Open Align stage to balance those three room layers; Signal saves the mix for that show. Use Play ident to audition the opening. Once the show has custom art, its gear can create or refresh one cached ElevenLabs audio package: a six-second ident plus a looping, non-musical ambience shaped for that studio. Signal never synthesizes audio when an episode begins.",
        clickLabel: "the atmosphere audio controls",
        targetSelector: '[data-tutorial-target="botcast-intro-audio"]',
      },
      {
        heading: "Choose how the bots speak",
        body: "The Voice picker in Signal’s top navbar matches Zen: Mute stays silent, English speaks normally, Babble keeps the selected voice without intelligible words, and Bottish uses Prism’s procedural robot language. With Voice Effects on, host and guest sometimes take the same quiet mic-ready breaths before substantial lines; saved episodes choose them deterministically on replay. The saved choice applies to both host and guest, and you can change it before or during an episode. An on-air switch starts with the next line instead of cutting off the bot already on mic.",
        clickLabel: "the Voice picker in the top navbar",
        targetSelector: '[data-tutorial-target="botcast-voice-mode"]',
      },
      {
        heading: "Book tonight’s episode",
        body: "Choose one guest, set the topic, and write an optional private angle—or use Randomize booking to choose a guest and have the selected episode model build a coherent booking around what this host and the show’s listeners would genuinely want to ask them. The guest-specific topic and private angle always stay editable. The small dice beside Topic and Private brief can regenerate either field on its own. Latest episodes can restore the guest, topic, private brief, available model override, and duration from a finished episode without starting it; your current episode mode stays in place. Host and guest bring their ready Powers on mic, including whether they have coffee at all or how quickly they drink it. Episode length defaults to Auto: no countdown, at least a few real exchanges, then a natural close when the conversation settles; choose a timed target when you want one. Beginning the episode opens a short, skippable show-branded pre-roll while Signal prepares the host’s opening line and paces the next safe handoff ahead. If a selected local model is still loading when that pre-roll ends, PRISM holds the studio and pauses the episode clock until the opening is ready. The default stage places both bots in the authored chairs and cups only for bots who drink coffee. If generated studio furniture lands differently, Align stage opens a dedicated fullscreen placement workspace where you can drag the visible pieces into place or swap the host and guest seats together with any cups; bots and cups turn inward from their new sides. The real scene ambience and show-scoped room mix stay live there. Use the Host and Guest voice sliders to balance the cast; Signal remembers each bot’s level for this show. Test voices runs a random two-line soundcheck through their configured voices and never creates an episode or transcript. Signal saves that alignment for every episode of the show, and close-up pans center on those saved bot positions. Pick LOCAL, AUTO, or ONLINE. AUTO keeps the account primary and recovers through your configured fallback chain; the other lanes can use the account model or a recording-only override. Signal locks that routing when the episode begins. The brief shapes the host but never goes on mic. Eligible ElevenLabs voices automatically receive sparse, saved vocal reactions.",
        clickLabel: "the episode setup desk",
        targetSelector: '[data-tutorial-target="botcast-setup"]',
      },
      {
        heading: "Direct the live cut",
        body: "Left, Right, and Wide hold a fixed studio shot. Auto opens on the full studio, moves to the host for a natural introduction of the show, host, and guest, and keeps Wide as the underlying conversation shot, with an occasional brief listener cut when a saved backchannel lands, before closing on the full set. Choosing any fixed shot breaks out of Auto and never receives reaction cuts; choosing Auto again hands direction back at any point. Signal records every choice and listener reaction into the finished episode.",
        clickLabel: "a live camera",
        targetSelector: '[data-tutorial-target="botcast-live-camera"]',
      },
      {
        heading: "Produce from the control room",
        body: "Signal keeps one primary speaker on mic at a time: their face comes alive and the transcript follows only the words they have finished saying. The listening host or guest may add a low-key nod, expression, or brief conversational acknowledgement during the line; these saved backchannels can overlap naturally but never create a turn or enter the transcript. Signal’s separate immersive reactions still belong to the performing bot, float above that bot, and appear between asterisks in the transcript without becoming fallback dialogue. Ask about a detail, press harder, move on, or lighten up at any time; Signal queues the private cue for the host’s next turn. Wrap it up is shared episode direction: both bots carry the closing exchange through to a real ending. While Signal is on air, app switching and session-changing navbar tools stay locked; Voice remains available for the next line, while read-only Usage and Memories plus Theme remain available. Cut show immediately cuts away and archives the recording, then restores the full chrome; it does not discard the transcript. Choosing any show in the left rail while on air makes the same producer cut before Signal changes shows. Natural endings and hard cuts both land on a short, locally synthesized outro whose end card waits for you to return to the show. Repeated pressure can earn a warning and, rarely, a walkout.",
        clickLabel: "a producer cue card",
        targetSelector: '[data-tutorial-target="botcast-cues"]',
      },
      {
        heading: "Watch the saved cut",
        body: "Replay follows the camera cut recorded while the show was on air. There are no post-episode camera controls: just play, pause, scrub, or choose a transcript line to seek. At the end card or in replay, Copy for Signal Review puts the complete conversation plus its private cues, per-turn model routing, delivery notes, segment changes, camera decisions, and outcome on your clipboard for a focused review.",
        clickLabel: "an archived episode",
        targetSelector: '[data-tutorial-target="botcast-replay"]',
      },
    ],
  },
  slate: {
    title: "Slate writing desk walkthrough",
    steps: [
      {
        heading: "Begin with pages or a spark",
        body: "Choose one source for new work: a creative spark or pages you already wrote. Bringing existing material replaces the spark controls entirely so Slate never blends the two; optional {wildcards} remain available only for spark-led work. Without a supplied name, Slate uses your active prose model to generate a real working title from the story, then waits for your confirmation or another try. You can also ask Slate to create a privacy-matched book cover now or later, and regenerate either title or cover; Slate never renames the work or replaces its cover automatically. Spark-led projects receive a visible title checkpoint after enough prose has accumulated. After this first welcome, the project shelf becomes home; opening returning work leads into a quiet story-so-far session and one suggested next move.",
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
        heading: "Choose the prose engine",
        body: "Set Slate to OFFLINE, AUTO, or ONLINE, then choose the model that will shape prose quality. The project remembers this choice, and every generated draft or revision keeps a private provider-and-model receipt in the backend.",
        clickLabel: "the prose engine controls",
        targetSelector: '[data-tutorial-target="slate-ai-controls"]',
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
        body: "Edit the manuscript directly. Human edits autosave and remain authoritative over older AI proposals. The living Story so far stays at the top of the canvas and follows accepted prose as the project grows.",
        clickLabel: "the manuscript canvas",
        targetSelector: '[data-tutorial-target="slate-manuscript"]',
      },
      {
        heading: "Talk beside the document",
        body: "Click the movable rainbow Prism bubble to catch an idea beside the document. Messages render with Markdown, float for a moment, then fade; only the last three can reappear after an accidental close. This is an ephemeral creative exchange, not remembered history: Prism never brings up an earlier message unless you explicitly ask about one still in that tiny recovery buffer. It can advise and brainstorm, but it never edits prose, changes Continuity, or renames the project for you.",
        clickLabel: "the Prism project companion",
        targetSelector: '[data-tutorial-target="slate-project-chat"]',
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
    Math.min(
      tutorial.steps.length - 1,
      Math.floor(Number.isFinite(index) ? index : 0),
    ),
  );
  return tutorial.steps[safeIndex]!;
}
