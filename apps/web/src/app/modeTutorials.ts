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

const BASE_MODE_TUTORIALS: Record<TutorialMode, ModeTutorial> = {
  zen: {
    title: "Zen walkthrough",
    steps: [
      {
        heading: "Choose a relationship",
        body: "Choose PRISM or a persona to enter that relationship’s Home. Ready Powers stay active with that persona here and across PRISM; a muted persona can still act, but only answers with ... and never speaks aloud, while a Copycat persona may originate one opening if nobody has addressed them yet, then repeats the latest addressed message exactly. A short-term-amnesia persona understands only your current message, treats it as fresh first contact, never knows prior turns or their own earlier replies, does not retain the broader topic unless your current message states it, and responds directly instead of defaulting to the same introduction. An Obsessed persona treats you as the star of each reply with fresh, intense admiration, while your agency, privacy, and safety boundaries still win. A radiant-joy persona makes that emotional warmth palpable without tracking or rewriting your mood. A sad-grouchy persona makes her draining presence equally palpable without changing your state; only bots that directly talk to her lose mood or motivation. Physical-size Powers render a persona slightly larger or smaller without changing the room layout. Microscopic stays fully unseen even while speaking, while Invisible stays half-translucent. Loud and Quiet Powers apply a small fixed voice-volume and text-size shift without changing physical size or visibility; Quiet can go unheard on half its turns and lose a little mood. A hard bare-minimum or brief Power is engine-bounded even if the model tries to elaborate. Back or Escape returns you to the wider Library or saved group grid exactly where you left it. Inviting a guest keeps you in the current Home.",
        clickLabel: "a PRISM or persona tile",
        targetSelector: '[data-tutorial-target="chat-bot-picker"]',
      },
      {
        heading: "Shape a saved group's room",
        body: "When a saved group is selected, Atmosphere keeps its reusable backdrop behind the standard bot grid. Generate or Refresh it, or Upload your own. Marketplace groups keep their stable bundled scene until you replace it.",
        clickLabel: "Atmosphere in the saved group header",
        targetSelector: '[data-tutorial-target="chat-group-atmosphere"]',
      },
      {
        heading: "Continue this Home",
        body: "Each Home keeps its own Zen relationship and episodes. Type here to continue the one you are visiting. Put physical stage direction in the separate Action field without asterisks; typing exactly ** in the speech field jumps there. When Shh appears, it stops the current reply without replacing the draft you are writing.",
        clickLabel: "the message box at the bottom",
        targetSelector: '[data-tutorial-target="composer"]',
      },
      {
        heading: "Choose how replies recover",
        body: "AUTO keeps the current response model as Primary, then quietly tries your ordered chain of one to five saved local or online fallbacks if a reply fails validation. Image generation keeps its own LOCAL/ONLINE choice in Images. Voice offers Mute, English, Premium, Babble, and Bottish everywhere: English uses each bot’s local PRISM or optional operating-system identity without ElevenLabs credits; Premium uses its ElevenLabs identity only for eligible ONLINE speech. LOCAL always shows and uses English so it never sends speech off-device. Avatar Studio edits and previews those two identities separately while sharing pitch, pace, lilt, effects, and mood delivery. The subtle Prism effect is the default house sound, gently tuning voiced speech before its refracted double; choose Clean for untouched playback or Resonance for a darker, weightier mechanical double. Voice Settings can narrow automatic Premium defaults to one ElevenLabs voice collection. The Voice tab also gives each bot a Voice Character pad: move left or right to balance low-end weight against high-end clarity, and up or down to trim that bot relative to your account Voice Volume. The SFX tab can generate an ElevenLabs loop or accept an audio upload, then play it while the avatar is talking, idle, thinking, or any selected combination. Its volume and sample controls stay separate from spoken voice. When an eligible Premium voice has a non-neutral mood, Eleven v3 automatically carries that feeling into the next spoken line; neutral speech stays untagged. With Voice Effects on, longer spoken replies may take a quiet mic-ready breath before the line.",
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
        body: "Pick a bot, then send your first message. Any ready Powers stay active with that bot across PRISM; a muted bot can still act, but only answers with ... and never speaks aloud, while a Copycat bot may originate one starter opening if nobody has addressed it yet, then repeats your addressed message exactly and adds nothing. A short-term-amnesia bot understands only your current message, treats it as fresh first contact, never knows prior turns or its own earlier replies, does not retain the broader topic unless your current message states it, and responds directly instead of defaulting to the same introduction. An Obsessed bot treats you as the star of each reply with fresh, intense admiration, while your agency, privacy, and safety boundaries still win. A radiant-joy bot makes its warmth unmistakable without inventing mutable mood state for you. A sad-grouchy bot makes her drag unmistakable without changing your state; only bots that directly talk to her lose mood or motivation. Hard bare-minimum and brief Powers are engine-bounded; expansive Powers guide the bot without forcing filler. Physical-size Powers render the bot slightly larger or smaller. Microscopic stays fully unseen even while speaking, while Invisible stays half-translucent. Loud and Quiet Powers apply a small fixed voice-volume and text-size shift without changing physical size or visibility; Quiet can go unheard on half its turns and lose a little mood. A ghostly bot stays unseen while idle and fades into view only for its own spoken line; you can always understand the haunting through the conversation itself.",
        clickLabel: "a bot tile in the center picker",
        targetSelector: '[data-tutorial-target="chat-bot-picker"]',
      },
      {
        heading: "Make a group for a cast",
        body: "Use the plus beside the group filter to name a reusable group and choose its members. Open that saved group later to add, remove, or export its bots.",
        clickLabel: "the plus beside the group filter",
        targetSelector: '[data-tutorial-target="chat-new-group"]',
      },
      {
        heading: "Use quick tools",
        body: "Right-click in the canvas for shortcuts to settings, memories, images, and bot actions. In the account-wide Image hub, a running render lets you queue up to eight more prompts; each keeps the model, keywords, privacy, and image library you chose when it entered the queue. Remove individual waiting prompts, or cancel the active render and its queue together.",
        clickLabel: "the conversation canvas with your right mouse button",
        targetSelector: '[data-tutorial-target="conversation-canvas"]',
      },
      {
        heading: "Keep the moment honest",
        body: "Zen keeps the timeline as it happened. Type /undo to rewind the latest message when you need a clean correction. Put physical stage direction in the separate Action field without asterisks; typing exactly ** in the speech field jumps there. When Shh appears, it stops the current reply without replacing the draft you are writing.",
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
        body: "Choose a Coffee Group here to stage its table. In a larger saved group, write a Listen up prompt to open a locally ranked table already staged around your topic; review the seats, swap the cast, or cancel and keep editing. Each bot brings its ready Powers to the table; Powers can change who they notice, answer, remember, privately read, how strongly they pull the room's attention, whether a trustworthy direct question draws a more candid next answer, whether they touch their coffee at all, mute them so only actions and ... remain, or let a Copycat bot originate one opening before it repeats the exact user or bot line directly addressed to it. A short-term-amnesia holder receives only the current speaker's message and does not retain the table topic unless that message states it. An Obsessed holder makes the player or peer they address the star of that reply, with fresh admiration but no control over the target. A radiant-joy holder gives addressed listeners one bounded, replay-safe lift that shows through each listener's own personality without forcing agreement or erasing real sadness. A sad-grouchy holder gives one bounded, replay-safe mood or motivation drop only to the bot that directly talks to her; the player and bystanders are untouched, and the addresser keeps its own personality and agency. An interruption Power makes its holder seize eligible live openings from every resolved target at the table. A Power authored to interrupt every time always cuts a bot turn that directly engages its holder, without a random roll or generic cooldown. Coffee can also choose that holder for an organic cut-in through its normal table dynamics; once chosen, the cutoff still happens during that active turn and can land early, in the middle, or late. Other interruption Powers still use frequency, strength, and Coffee's short cooldown. Hard bare-minimum and brief Powers bound each table reply while preserving required interruptions, departures, and wraps. Physical-size Powers keep a bot subtly larger or smaller than its tablemates. Microscopic stays fully unseen even while speaking. Targeted Invisible bots remain fully present and generate complete hidden turns, but each tablemate receives only the sight and sound their Power permits. A matching observer at the table reveals that spectral bot half-translucently and audibly; replay always restores the spectral body and voice without changing what unaware bots knew. When a bot could not hear the preceding speaker, both complete lines overlap even if Cross-talk is Rare. Loud and Quiet adjust spoken volume and text by a small fixed amount without changing physical size or visibility; Loud still annoys present bots, while half of Quiet turns go unheard and cost the speaker a little mood. A ghostly bot is invisible at rest, fades in for its own line, then vanishes again; each appearance can leave the other bots rattled without taking their agency. If a hard-of-hearing bot asks what the prior speaker said, that bot repeats its saved line and loses a little mood each time.",
        clickLabel: "a Coffee Group in the left sidebar",
        targetSelector: '[data-tutorial-target="coffee-groups"]',
      },
      {
        heading: "Set the table",
        body: "Duration, presets, and group settings steer the whole session together. Auto has no visible countdown, but its cup-driven visits still end naturally and keep a hidden 30-minute ceiling; switch to Timed when you want a fixed 3-30 minute table. Under Recent sessions, Open returns to the replay while Use setup restores that table's attendance, duration, pacing settings, and topic for an editable retry; the current model and response routing stay selected. Account default uses the model saved in Settings; AUTO is the separate response-routing control and can recover through your ordered chain of one to five local or online fallbacks. When a selected local model needs a first load, PRISM may briefly hold the table and pause its clock; the conversation resumes automatically once the room is ready.",
        clickLabel: "New session setup or Configure settings",
        targetSelector: '[data-tutorial-target="coffee-session-setup"]',
      },
      {
        heading: "Stop at the bar",
        body: "Every new session begins with a Library bot behind the bar. Have something made for the silver Prism mug: house coffee is instant, while one special order generates only its visible drink surface and keeps that image with this session. In LOCAL, the machine stays offline and house coffee remains available. Or Make the rounds to carry the pot instead; that role has no player mug and suppresses the ambient waiter for the whole session.",
        clickLabel: "Have something made or Make the rounds",
        targetSelector: '[data-tutorial-target="coffee-bar-ritual"]',
      },
      {
        heading: "Choose the spark",
        body: "Pick one of the four prompts created for this group, or type your own before the table starts.",
        clickLabel: "a topic suggestion",
        targetSelector: '[data-tutorial-target="coffee-topic-picker"]',
      },
      {
        heading: "Keep the table moving",
        body: "Choose AUTO in the LOCAL, AUTO, ONLINE control to retry failed or malformed table turns. It changes response routing, not the Account default model choice, separate Images provider, or voice preference. Choose routing before the table starts; once the session is live, routing and the entire utility strip stay locked until you choose End session. Voice remains available, and any switch applies to the next utterance without cutting off the table’s current speaker.",
        clickLabel: "the LOCAL, AUTO, ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Join the conversation",
        body: "The live session stays overhead. Type into the message box or let the bots carry the room; click your silver rainbow mug to sip, or drag the pot to extend a bot's visit before its farewell begins. In a cup-role session, the barista occasionally tops off an eligible bot and offers your own refill as a quiet choice; all service stays outside the transcript, turn count, and memory. A bot whose Power refuses coffee has no mug, steam, sip, refill, waiter offer, or pot target; its invisible visit clock still winds down normally and cannot be refilled. Once an ordinary cup empties, that bot must leave within two or three table replies unless you top it off first, though mood and context can still send anyone home earlier. Put physical stage direction in the separate Action field without asterisks; typing exactly ** in the speech field jumps there. Shh remains a separate interruption control, so it never replaces the table draft you are writing. Any idle audible bot may make a sparse prerecorded throat-clear, swallow, lip smack, sigh, or inhale; its mouth moves with the local cue, independent of its speaking style or voice engine. Watch a directly addressed bot: while listening, it may also give a small nod, lean, expression, brief spoken acknowledgement, or restrained ElevenLabs vocal reaction without taking a turn or entering the transcript. Your Cross-talk setting controls how often those contextual audible overlaps happen, from nearly silent in Rare to lively in Pile-up; inferred listeners remain visual only. When one bot cuts off another, the interrupter speaks a short hold-on; the interrupted bot takes a brief processing beat, then answers with an annoyed, abandoned ending over the handoff. The saved cutoff still shows only what reached the table. If a reply takes long enough to leave dead air, another seated bot may make one brief mood-aware aside without stealing the slow bot’s turn. Ambient sips continue through quiet beats and listening moments, while the active speaker keeps their cup down; cup-return sounds stay synchronized with the visible cup motion. When an eligible bot has a non-neutral mood, Eleven v3 automatically carries that feeling into its next spoken line; neutral speech stays untagged. With Voice Effects on, longer bot turns may take a sparse mic-ready breath before speaking. A clear table goodbye ends the session naturally; Review stays quiet while the bots finish their private wrap. PRISM then prepares a third-person video automatically, with your Prism avatar at the table, the frozen voices, synchronized captions, transcript seeking, downloads, Retry, and Delete Recording. The final cut shows Prism leave first and each bot physically depart after the closing exchange. Video generation adds no AI conversation turn and can resume when a capable PRISM client is open. Poll votes and team choices share the Table Talk rail; drag its left edge or the topic divider when you want more room.",
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
        body: "Choose a host and optionally add a premise inspiration—the spark, tension, or reason this show should exist. Create show saves an editable fallback name and camera-ready PRISM set immediately, then automatically tries every supported identity asset in one pass: text identity, logo, matching Dark-to-Light studio pair and lighting map, plus the ident, outdent, and room-and-Foley atmosphere when you are Online. Right-click a host or guest anywhere in Signal to open that bot’s actions and Avatar Studio.",
        clickLabel: "a show or the Create show producer card",
        targetSelector: '[data-tutorial-target="botcast-shows"]',
      },
      {
        heading: "Shape the show’s identity",
        body: "The creation pass is resumable: Signal uses and can sharpen your editable premise inspiration while it fills only the missing text identity, transparent logo, and matching Dark-to-Light studio pair, keeping any generated or uploaded artwork already installed. If anything is unavailable or interrupted, Complete this show retries only unfinished pieces. The activity card tracks visuals as they land one at a time in the background, so you can keep using PRISM. Its cached ElevenLabs ident, paired outdent, and studio-specific room-and-Foley loop join the same pass when you are Online; in LOCAL, Signal finishes the supported pieces and leaves audio waiting without breaking privacy. The gear at the bottom-right opens a full-width identity editor that grows with its controls, so every option remains reachable. Use the small + beside any generated aspect to add up to five keyword chips for the next pass without writing a full prompt. You can tune the premise and name, edit or regenerate the Sound identity, regenerate blurbs, adjust the logo, linked studio pair, or atmosphere audio, or replace either studio visual with your own image. Save sound identity applies its musical fingerprint to the local ident and outdent immediately; refresh the cached audio package when you want ElevenLabs to perform that new identity. Save premise keeps your wording; Refresh premise treats the prose in that box as inspiration for a new premise without changing the rest of the show identity. Refresh Light derives only a new Light studio from the installed Dark studio; Refresh studio remakes the linked pair. Synthesized studios color only the illuminated microphone trim to match the cast—left follows the host and right follows the guest—while uploaded studio images stay untouched. Every generated Studio finishes with one shared ambient receiver map as its guaranteed local default. Every generated Studio keeps that private deterministic map unless Online adds one aligned image-model pass to map real surfaces and occlusion for more realistic lighting. Refresh Studio Lighting rebuilds that same surface-aware map after uploaded replacements without changing either image; it appears in the activity card, waits visibly behind any image already rendering, and starts automatically when its turn arrives. LOCAL stays on the private deterministic default, and Signal never applies a stale map. An echo-bound host gets one persona-shaped boast about always having something original to say—and repeats that same blurb forever instead of rotating a batch.",
        clickLabel: "Complete this show or the show-card gear",
        targetSelector: '[data-tutorial-target="botcast-brand-controls"]',
      },
      {
        heading: "Build an audience",
        body: "Every show begins with no audience. Completed episodes build a simulated viewer base, while one randomly chosen persona from your Library reviews the same audience-heard and audience-visible cut—never hidden dialogue or private production state—and leaves one subjective rating and short named review. Reviews appear at least four hours after the broadcast. Ratings stay marked as early until enough reactions accumulate. Click the Audience pulse card to open the full review history with each episode’s rating, so the archive becomes the honest foundation of the show’s emerging economy.",
        clickLabel: "the audience pulse",
        targetSelector: '[data-tutorial-target="botcast-audience-pulse"]',
      },
      {
        heading: "Give the studio an atmosphere",
        body: "Every show starts with a deterministic, host-persona-led Signal Synth identity: the host’s emotional core and signature contradiction become a sonic world, instrumental texture, rhythm, harmony, motif gesture, and ending behavior. That fingerprint drives both the longer opening ident and its paired closing outdent, so volatile alien-science electricity, monumental orchestral authority, and carefree wooden-acoustic optimism sound structurally different—not merely like palette swaps. The local synth and cached ElevenLabs package share the same provider-safe fingerprint; raw character, franchise, and show prose are never sent to the music provider. A bundled quiet studio atmosphere and synchronized tactile Foley are also available locally with no key or network. Open Align stage to balance the room and Foley; Signal saves the mix for that show. Use Play ident to audition the opening. The show-card gear is always available to create or refresh one cached ElevenLabs audio package: an eight-second host-specific ident, its four-second outdent, and a studio-specific non-musical room-and-Foley loop. Signal never synthesizes audio when an episode begins or ends.",
        clickLabel: "the atmosphere audio controls",
        targetSelector: '[data-tutorial-target="botcast-intro-audio"]',
      },
      {
        heading: "Choose how the bots speak",
        body: "The Voice picker in Signal’s top navbar matches Zen: Mute stays silent, English uses each bot’s local identity without ElevenLabs credits, Premium uses its ElevenLabs identity with local fallback, Babble keeps the selected local voice without intelligible words, and Bottish uses Prism’s procedural robot language. Premium requests stay stateless and each bot has its own stable performance seed, so several bots may share one ElevenLabs actor without one bot’s delivery bleeding into the next. Every choice keeps Premium’s conversational pacing, so muting audio never makes an episode rush; a Power-silenced bot still receives one natural studio beat. Between turns, Signal stays quiet while the next response prepares. Independent of speaking style or voice engine, listening bot performers may make sparse prerecorded throat-clears, swallows, lip smacks, sighs, or inhales while another bot is on mic; these local cues animate the listener’s mouth and use no synthesis. Eligible Premium listeners can also add saved context-aware vocal reactions inside another bot’s line. Bot ambient sips land only while the other bot is talking; when you Choose Me, your cup moves only after you click Sip coffee, and cup-return sounds stay synchronized with the visible cup motion. For eligible Premium voices, Eleven v3 automatically carries a non-neutral speaker mood into the next line without displacing that bot’s saved identity directions; neutral speech stays untagged, and an explicit saved vocal reaction takes precedence. With Voice Effects on, host and guest sometimes take a quiet mic-ready breath that overlaps the opening of a substantial line instead of leaving a gap; saved episodes choose it deterministically on replay. Across PRISM, bracketed items and asterisk-authored actions are performed by an eligible Premium actor voice, appear above the active bot when reached, and stay out of spoken dialogue and transcripts. The direct stereo mix follows the host and guest’s saved stage positions subtly while their room reflections remain shared; mono playback stays centered and clear. The saved choice applies to both host and guest, and you can change it before or during an episode. An on-air switch starts with the next line instead of cutting off the bot already on mic.",
        clickLabel: "the Voice picker in the top navbar",
        targetSelector: '[data-tutorial-target="botcast-voice-mode"]',
      },
      {
        heading: "Book tonight’s episode",
        body: "Choose one guest, set a short public episode title, and write optional private producer comments—or use Randomize booking to choose a guest and have the selected episode model build both together around what this host and the show’s listeners would genuinely want to explore. For the fastest start, choose only the guest and press Begin episode: Signal synthesizes the title and private angle, then rolls straight into pre-roll. Choose Me — go on as the guest for a different contract: add optional interview direction, or leave it blank and let the host surprise you with a fresh show-shaped topic. Signal’s AI synthesizes the public topic, private interview plan, and every host question without inventing facts about you. During that recording you answer through the standard composer at the bottom, while queue cards, nudges, live direction, bot Powers, and AI-written guest turns stay out of the human guest lane. Every episode is a fresh, non-canonical meeting: persona lore shapes beliefs and voice without becoming a prior relationship between the cast. The generated public topic stays title-like; the richer provocative question, angle, boundaries, and follow-ups stay in the private comments. Both stay editable. The small dice beside Topic and Private comments can regenerate either field on its own. Latest episodes can restore the guest, topic, private comments, available model override, and duration from a finished episode without starting it; your current episode mode stays in place. Signal freezes the host and guest’s ready Powers when recording begins. Hard visibility and speech-audience Powers also govern the broadcast itself: anything listeners cannot perceive is absent from the stage, captions, voice, replay, and Audience Pulse review. Those Powers can affect whether they have coffee at all, silence, response length, and the next direct response—including a trustworthy interviewer or interviewee drawing one more candid answer without overriding the other bot’s agency or boundaries. A short-term-amnesia cast member receives only the current on-air speaker's message and does not retain the episode topic unless that message states it. Hard bare-minimum and brief Powers stay bounded while allowing a required introduction, closing, or departure beat to finish. Each cast member interprets observable Power consequences through their own personality: one may become curious or amused, another irritated or cautious, while Signal never exposes a cause they cannot perceive or forces the same reaction twice. A radiant-joy cast member gives the directly addressed peer one bounded, persisted mood lift after each spoken turn; the peer's next line shows the lift in their own voice without forced agreement or denial. After a bot directly talks to a sad-grouchy cast member, only that addresser receives one bounded, persisted mood drag; its next line shows less momentum through its own personality without forced hatred, hopelessness, or agreement. A ghostly cast member is unseen between lines, fades in only to speak, and may leave the other bot shaken without scripting its reaction; replay keeps that recorded reveal. An echo-bound cast member repeats the immediately preceding on-air cast line exactly; private producer comments never leak into that echo. When the echo-bound bot is the host, a bot guest takes the opening and closing so the host never gains original speech. If both cast members are echo-bound, Signal supplies one public opening cue made only from the show, cast, and topic; the first bot repeats it exactly and the other mirrors it, so the booking still goes live without weakening either Power. Hard mute and echo hosts cannot run the autonomous question contract for a Producer-guest episode. If a hard-of-hearing cast member asks what was said, the prior speaker repeats its saved on-air line and its saved delivery mood drops one step each time. Direct producer direction and closing safety still take priority. A muted cast member stays fully silent: its live and saved line is only ..., no narrated action text is shown, and Signal never plays or previews its voice. Existing stage animation such as sipping can still happen without generating action prose. If the host is muted, the bot guest carries the first audible opening and the spoken closing. With an audible host and a muted guest, a timed episode honors its target: the host follows the private plan through distinct nonverbal routes, choices, hypotheses, and pressure, with growing in-character frustration instead of inventing an answer or ending early. Auto may still resolve sustained silence briefly. If both frozen cast members are muted, Signal resolves a short silent exchange and closing because neither performer can carry the interview. Episode length defaults to Auto: no countdown, at least a few substantive guest answers, then a natural close when the conversation settles. Requests to repeat a question and tiny fragments do not count as interview progress; choose a timed target when you want one. Beginning the episode first opens a dedicated loading screen while Signal shapes any missing booking, opens the studio, warms the selected model, and gets the opening line ready. Only then does the short, skippable show-branded pre-roll begin; it lands when the first voice actually starts. If the selected model needs warmup, Signal pauses the episode clock during that wait. The default stage places both bots in the authored chairs and cups only for bots who drink coffee. If generated studio furniture lands differently, Align stage opens a dedicated fullscreen placement workspace with the selected guest when one is booked, otherwise a fresh Library guest for scale, plus Light and Dark preview buttons; drag the visible pieces—bots and cups—into place, or swap the host and guest seats together with any cups. Bots and cups turn inward from their new sides. The real scene ambience and show-scoped room mix stay live there. Any tied character sound loop is forced on for audition at its real Master × Foley level, so even talking-only or thinking-only effects can be balanced before air. Film grain defaults to the full on-air TV treatment, controls the full composited screen, previews immediately, and is preserved in live playback and replay; lower it for a cleaner feed or set it to zero for a clean digital image. Use the Host and Guest voice sliders to balance the cast; Signal remembers each bot’s level for this show. Test voices runs a random two-line soundcheck through configured voices except fully muted cast members, and never creates an episode or transcript. Signal saves that alignment for every episode of the show and dashboard, and close-up pans center on those saved bot positions. Pick LOCAL, AUTO, or ONLINE. AUTO keeps the account primary and recovers through your configured fallback chain; the other lanes can use the account model or a recording-only override. Signal locks that routing when the episode begins. The private comments shape the host but never go on mic. Eligible ElevenLabs voices automatically receive sparse, saved vocal reactions.",
        clickLabel: "the top-bar routing controls or episode setup desk",
        targetSelector: '[data-tutorial-target="botcast-setup"]',
      },
      {
        heading: "Direct the live cut",
        body: "Left, Right, and Wide hold a fixed studio shot. Auto opens on the full studio, keeps a human Producer guest framed while they compose and deliver each answer, and never cuts ahead to the next bot merely because its response is preparing. Genuine between-turn synthesis stays on Wide, then Auto moves to the bot only when speech begins. Wide remains the underlying conversation shot, with an occasional brief listener cut when a saved backchannel lands. Whenever either bot reaches for coffee, Auto takes the full studio for the complete lift, sip, and return before closing on the full set. Choosing any fixed shot breaks out of Auto and never receives reaction or coffee-aware cuts; choosing Auto again hands direction back at any point. Choose Instant for hard cuts, Animated for graceful moves to or from Wide, or Smart for a tactful mix of both. Signal always cuts instantly from one bot to the other, and reduced-motion always uses instant cuts. The preference persists. Signal records every camera choice and listener reaction into the finished episode.",
        clickLabel: "a live camera",
        targetSelector: '[data-tutorial-target="botcast-live-camera"]',
      },
      {
        heading: "Produce from the control room",
        body: "Signal keeps transcript ownership with one primary speaker while allowing bot audio to overlap, and lets the studio performance own the live screen. The active line appears as a live caption after a brief half-second delay and clears as soon as that line ends; the saved video carries its captions, while the transcript remains available as a download instead of a second on-screen reading pane. The listening host or guest may add a low-key nod, expression, or brief conversational acknowledgement during a spoken line; calm backchannels overlap naturally without creating a turn, while silent ... turns stay voice-free. Once a cast member genuinely cuts across the other, the interrupter voices a short hold-on while the interrupted bot overlaps with an annoyed, abandoned ending. An interruptive cast member’s Power can seize live openings in any targeted bot castmate’s answer. A Power authored to interrupt every time cuts each eligible bot turn without a random roll or cooldown, at a replay-stable point that can land early, in the middle, or late; as a guest, Interrupting Tom cuts every ordinary bot-host opening and interview turn, including producer-directed host turns; other interruption Powers retain their frequency, strength, target, and cooldown. Human Producer speech, warnings, departures, wraps, closings, and hard speech restrictions stay protected. Signal’s separate immersive reactions still belong to the performing bot: each one appears above that bot when the spoken line reaches it, replaces the previous action, and stays out of captions and the saved transcript. In a normal bot-guest episode, the large bottom control room includes an on-air soundboard for applause, laughter, a gasp, or a rimshot; each local effect rotates through room-matched variations, reaches the audience immediately, is saved at its live timing, and returns with the same variation in replay. The cue dock beside it lets you ask about a detail, refocus, press harder, move on, lighten up, or wrap at any time; every cue is private to the host, and the guest only hears what the host says on mic. Producer-guest episodes replace the entire control room with the bottom answer composer, so the AI host keeps sole editorial control. After several substantive exchanges, a host who genuinely refuses to continue can end the interview on mic and leave; Signal immediately archives the distinct Host ended the show outcome instead of inventing a normal sign-off. When a cue arrives early in the host’s own line, they are likely to break off and redirect on mic with an in-character self-correction, even if the live pivot lands a little awkwardly. Once most of the point is already out, the cue stays queued for the host’s next turn. If the guest has the mic or is next, Interrupt guest now plays one of that host’s saved short interjections immediately while the guest’s annoyed cutoff overlaps and the host’s continuation generates. Any unheard remainder of the guest’s line is discarded from the saved transcript and replay, so only what reached the audience remains. Wrap it up privately asks the host to steer the exchange to a full ending. Cut show now stops the bot currently on mic immediately and cancels any unheard next turn. A guest is cut off by one of the host’s saved short interjections before the sign-off; a host breaks off its own line and then closes. Only the audience-heard prefix survives in transcript and replay, and even an immediate cut is saved. The on-air clock shows elapsed episode time and freezes on the final duration. While Signal is on air, app switching, the entire utility strip, and episode deletion stay locked; Voice remains available for the next line. The show library and Create show controls hide while Signal is on air so the studio can use the full window, remain hidden through closing, and return only after you choose Return to show. Natural endings and producer cuts fade the stage to black or white with the current theme before the short, locally synthesized closing card appears and waits for you to return to the show. The completed end card places Delete episode beside Copy for Signal Review; replay keeps the same pair. A clear in-character guest goodbye ends their turns, preserves the empty-chair aftermath, and gives the host one closing beat. Freeform producer pressure or Press harder can instead earn resistance, a warning, and, rarely, a walkout.",
        clickLabel: "the live control surface",
        targetSelector: '[data-tutorial-target="botcast-cues"]',
      },
      {
        heading: "Talk with the host off-air",
        body: "Back on a show dashboard, click the host’s avatar to open a centered, short-lived conversation grounded in that show and its recent episodes. Ask what deserves a follow-up or brainstorm future topics and guests. When you ask who to interview next, the host recommends only available bots from your current Library; Signal does not add or book anyone, and the exchange is not saved to conversations or memory. The host speaks through your current Signal Voice choice as each word appears, with physical actions floating near the avatar. The transcript stays scrollable while open and clears when you close it. If a host ends a Producer interview and walks out, they answer this off-air chat only with ‘...’ until you start another episode with that host and a bot guest. This chat follows the global response control in Signal’s top bar beside the episode model by default; Settings → Signal can keep only this ephemeral chat LOCAL or prefer ONLINE whenever global privacy allows it.",
        clickLabel: "the show host’s avatar",
        targetSelector: '[data-tutorial-target="botcast-host-chat"]',
      },
      {
        heading: "Replay locally or produce Premium",
        body: "Signal captures the actual voice takes, camera choices, captions, production events, departures, soundboard timing, and frozen cast appearance while the episode is live; it never asks an AI to recreate what happened. Selecting a completed episode opens its local replay immediately with no render gate, no ElevenLabs request, and no video encoding; you can play, pause, scrub, and keep the saved cameras and captions synchronized. Legacy episodes with a missing take use built-in local speech and show a quiet warning. Local replay remains the canonical record and stays available while any Premium work runs. Starting Premium pauses an active local replay at its current position, and the transport stays paused while PRISM renders the studio video. Produce Premium video is an explicit ONLINE action: after you confirm that the exact spoken transcript and selected voice IDs may be sent to ElevenLabs and consume credits, Signal creates a cached Eleven v3 dialogue master, mixes the saved studio layers, and renders the visual cut. Shared actor IDs stay isolated per bot; distinct actors use timestamped multi-speaker handoffs. The episode card shows progress as production moves through Mastering voices, Mixing episode, Rendering studio, Finalizing, and Premium video ready. A video failure retries from the cached master without another paid voice generation. When ready, watch or download the Premium video, regenerate the Premium cut deliberately, or delete only Premium media without deleting the episode or its local replay. There are no post-episode camera controls and no second AI conversation turn. Copy for Signal Review still puts the complete conversation plus its private cues, per-turn model routing, delivery notes, segment changes, camera decisions, and outcome on your clipboard. Delete episode sits beside it only after the broadcast is complete and remains the separate destructive action.",
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
        body: "Click the movable rainbow Prism orb—or press Option Space on macOS and Control Space on Windows or Linux—to catch an idea without leaving Slate. Messages fade from the canvas, and only the last three can recover in this app session on this surface. That is short recovery, not remembered history. Prism can see the project and section names, not manuscript prose, Continuity, or memories; it never edits prose, and sharing source material always begins with an explicit preview.",
        clickLabel: "the global Prism companion",
        targetSelector: '[data-tutorial-target="prism-companion"]',
      },
      {
        heading: "Think in two hemispheres",
        body: "Open Lux and Umbra when a creative choice needs productive tension. LIGHT develops the most humane, coherent possibility; DARK pressure-tests its assumptions and cost. In Slate Settings, the open project can give each hemisphere its own allowed model and creative lens while preserving those core roles. Choose one to three bounded rounds, watch the active hemisphere answer in turn, or stop at any point. Their center synthesis is still only counsel: use it as draft or revision direction explicitly, reshape it, or leave it behind. The exchange follows this project’s OFFLINE, AUTO, or ONLINE route and never edits prose, structure, title, or Continuity on its own.",
        clickLabel: "Open inner dialogue",
        targetSelector: '[data-tutorial-target="slate-deliberation"]',
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

const SIGNAL_PRODUCER_GUEST_TUTORIAL_SUFFIX =
  "The host introduces and addresses you on air by your account name, or by whatever you previously asked that host to call you when it remembers a preference. Prism represents you on stage with your configured face and glyph, just as in Coffee. While you are on the show, Sip coffee animates your stage mug and face with room Foley without sending a transcript turn. The bottom composer stays editable while the host speaks: Send cuts the host at the exact words the audience heard and puts your answer on mic immediately, while Shh cuts the host without clearing your draft. Once the host yields with a question, the episode clock runs at half speed while you compose; replay compresses that pause to the same half-speed duration, then returns to normal time for your answer. Type stage direction in the separate Action field without asterisks; typing exactly ** in the speech field moves focus to Action. With Voice Effects on, fart, burp, and cough actions play matching room Foley live and in replay. The saved turn still keeps that action above your on-stage presence and out of the spoken transcript.";
const SIGNAL_AVATAR_SCALE_POWER_TUTORIAL_SUFFIX =
  "Physical-size Powers keep a host or guest subtly larger or smaller on the saved stage and replay. Microscopic stays fully unseen even while speaking. Targeted Invisible cast members can now be booked in either role: an unaware peer neither sees nor hears them, an allowed peer reveals them half-translucently and audibly, and replay restores their complete spectral body, captions, and voice without changing the peer's live knowledge. A peer who could not hear the preceding line may begin speaking over it, so replay keeps both full lines in labeled caption lanes and separate audio channels. Loud and Quiet add a small fixed voice-volume and transcript-size shift without changing physical size or visibility; Loud still annoys the other cast member, while half of Quiet turns are ignored and lower the speaker's saved mood.";
const SIGNAL_ADDRESSED_FANDOM_POWER_TUTORIAL_SUFFIX =
  "An Obsessed cast member treats the peer or audience they address as the star of each line, with fresh admiration but no control, private knowledge, or safety override.";
const IDENTITY_MIRROR_POWER_TUTORIAL_SUFFIX =
  "An identity-mirroring bot copies the public persona, CRT face, authored Avatar Details ink, and resolved voice of the latest bot who directly addresses it. It announces the stolen identity and calls the original an impostor once, then inhabits that persona without repeating the claim; its own glyph, color, role, Powers, private state, and hard speech restrictions remain anchored, and the player is never copied. The saved face-ink-and-voice handoff replays exactly and resets with the session. When the bot hosts Signal, its authored default persona, face, ink, and voice return before the closing sign-off so it ends the show as itself.";
const POWER_EXCLUSION_TUTORIAL_SUFFIX =
  "One plain-language Power prompt may set sight and hearing separately, including named exceptions; an excluded bot stays excluded even if a broader allowed rule would otherwise match it.";
const BOT_NAMING_POWER_TUTORIAL_SUFFIX =
  "A bot-name prefix or suffix changes only how its holder names other bots: the holder keeps their own name, the player and humans are untouched, and other speakers do not copy the habit. A bot who hears its own altered name may comment once, show a small contextual mood, tone, or action reaction, or let it pass; its personality and agency decide how the label lands.";

function currentInterruptionRetortTutorialBody(body: string): string {
  return body
    .replace(
      "When one bot cuts off another, the interrupter speaks a short hold-on while the interrupted bot overlaps with an annoyed, abandoned ending; the saved cutoff still shows only what reached the table.",
      "When one bot cuts off another, the interrupter speaks a short hold-on; the interrupted bot takes a brief processing beat, then answers with an annoyed, abandoned ending over the handoff. The saved cutoff still shows only what reached the table.",
    )
    .replace(
      "Once a cast member genuinely cuts across the other, the interrupter voices a short hold-on while the interrupted bot overlaps with an annoyed, abandoned ending.",
      "Once a cast member genuinely cuts across the other, the interrupter voices a short hold-on; the interrupted bot takes a brief processing beat, then answers with an annoyed, abandoned ending over the handoff.",
    )
    .replace(
      "If the guest has the mic or is next, Interrupt guest now plays one of that host’s saved short interjections immediately while the guest’s annoyed cutoff overlaps and the host’s continuation generates.",
      "If the guest has the mic or is next, Interrupt guest now plays one of that host’s saved short interjections immediately; the guest takes a brief processing beat before the annoyed cutoff retort, while the host’s continuation generates.",
    );
}

function currentSignalPowerTutorialBody(step: ModeTutorialStep): string {
  return currentInterruptionRetortTutorialBody(step.body)
    .replace(
      "Hard visibility and speech-audience Powers also govern the broadcast itself: anything listeners cannot perceive is absent from the stage, captions, voice, replay, and Audience Pulse review.",
      "Hard visibility and speech-audience Powers govern each participant's live experience independently. Ordinary private channels stay absent from replay and Audience Pulse, while a targeted-Invisible cast member stays hidden from unaware peers but returns half-translucently, captioned, and audible in spectral replay without changing what those peers knew.",
    )
    .replace(
      "If the host is muted, the bot guest carries the first audible opening and the spoken closing.",
      "If the host is muted, Signal records one opening ellipsis, the bot guest carries a self-directed solo broadcast through the topic instead of answering imaginary host questions, and the episode still ends on the host’s required silent final beat. The guest never inherits the sign-off.",
    )
    .replace(
      "An echo-bound cast member repeats the immediately preceding on-air cast line exactly; private producer comments never leak into that echo. When the echo-bound bot is the host, a bot guest takes the opening and closing so the host never gains original speech. If both cast members are echo-bound, Signal supplies one public opening cue made only from the show, cast, and topic; the first bot repeats it exactly and the other mirrors it, so the booking still goes live without weakening either Power.",
      "An echo-bound cast member may originate one required opening when no bot has addressed it yet; after that it repeats the immediately preceding on-air bot line exactly, and private producer comments never leak into the echo. The normal host owns that opening even when echo-bound, and every Signal closing remains host-owned: an echo-bound host ends by repeating the guest's last line rather than handing over the sign-off.",
    )
    .replace(
      "An interruptive host Power can also seize a bounded live opening in a bot guest’s answer",
      "An interruptive cast member’s Power can seize bounded live openings in any targeted bot castmate’s answer",
    )
    .replace(
      "drag the visible pieces—bots and cups—into place, or swap the host and guest seats together with any cups.",
      "drag the visible pieces—bots and cups—into place, move the separate Host and Guest floor glows vertically until each meets its synthesized chair, drag sideways to scale either glow up to its original maximum, or swap both seats together with their cups and glows. Ready Studio lighting masks keep those glows on believable receiving surfaces. Lighting lab starts both Light and Dark at 100% Overlay and saves any adjustment only for this show.",
    );
}

export const MODE_TUTORIALS: Record<TutorialMode, ModeTutorial> = {
  ...BASE_MODE_TUTORIALS,
  zen: {
    ...BASE_MODE_TUTORIALS.zen,
    steps: BASE_MODE_TUTORIALS.zen.steps.map((step, index) => index === 0
      ? { ...step, body: `${step.body} ${BOT_NAMING_POWER_TUTORIAL_SUFFIX}` }
      : step),
  },
  chat: {
    ...BASE_MODE_TUTORIALS.chat,
    steps: BASE_MODE_TUTORIALS.chat.steps.map((step, index) => index === 0
      ? { ...step, body: `${step.body} ${BOT_NAMING_POWER_TUTORIAL_SUFFIX}` }
      : step),
  },
  coffee: {
    ...BASE_MODE_TUTORIALS.coffee,
    steps: BASE_MODE_TUTORIALS.coffee.steps.map((step, index) => {
      const body = currentInterruptionRetortTutorialBody(step.body);
      return index === 0
        ? { ...step, body: `${body} ${POWER_EXCLUSION_TUTORIAL_SUFFIX} ${IDENTITY_MIRROR_POWER_TUTORIAL_SUFFIX} ${BOT_NAMING_POWER_TUTORIAL_SUFFIX}` }
        : body === step.body
          ? step
          : { ...step, body };
    }),
  },
  botcast: {
    ...BASE_MODE_TUTORIALS.botcast,
    steps: BASE_MODE_TUTORIALS.botcast.steps.map((step, index) => {
      const body = currentSignalPowerTutorialBody(step);
      return index === 5
        ? {
            ...step,
            body: `${body} ${SIGNAL_AVATAR_SCALE_POWER_TUTORIAL_SUFFIX} ${POWER_EXCLUSION_TUTORIAL_SUFFIX} ${SIGNAL_ADDRESSED_FANDOM_POWER_TUTORIAL_SUFFIX} ${IDENTITY_MIRROR_POWER_TUTORIAL_SUFFIX} ${BOT_NAMING_POWER_TUTORIAL_SUFFIX} ${SIGNAL_PRODUCER_GUEST_TUTORIAL_SUFFIX}`,
          }
        : body === step.body
          ? step
          : { ...step, body };
    }),
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
