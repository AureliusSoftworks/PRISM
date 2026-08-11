import { DEBATE_EVIDENCE_ITEM_MAX_COUNT } from "@localai/shared";

export type TutorialMode =
  "zen" | "chat" | "coffee" | "debate" | "botcast" | "avatar" | "slate";

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
  avatar: {
    title: "Avatar Foundry walkthrough",
    steps: [
      {
        heading: "Open Eyes from the dock",
        body: "Chassis lights share one accent color and stay fully dark only while a new manual shell is completely blank. The first meaningful identity choice wakes a slow, dim breath; generated drafts and existing bots are already alive. Before generation, Model can follow Auto or target one model for that draft without changing your account default. Start from the perimeter dock—open Eyes first, then Mouth, Identity (Core or Shell), Ink Display, and the rest of the foundry tabs.",
        clickLabel: "the Eyes tab in the perimeter dock",
        targetSelector: '[data-tutorial-target="avatar-foundry-eyes-tab"]',
      },
      {
        heading: "Tune it with live controls",
        body: "The established Eyes and Mouth controls operate the live bot across a much wider placement range. The default broken-bar blink starts 25% smaller and follows Eyes for size, position, and rotation; switch to Independent when the blink needs its own geometry. Coffee * makes the custom mouth pucker and Speech ink switch together during Sip. The display stays fixed while you customize; only Ink Display unlocks drag-to-pan and cursor-anchored scroll zoom, with camera −/+ chips as an alternative. Its Move tool can carry any combination of Blink, Speech, and Effect ink together, while Auto moves whichever layer you grab. Search Stamps by name, choose one to equip it, position it with the grid pad, and resize it with scroll or the −/+ chips. Click the canvas or press Enter to place a stamp as ordinary editable ink; Escape cancels, and Move can reposition it later. At 150% zoom, a pixel grid fades onto the CRT and disappears again when you pull back. Preview live briefly animates the finished face without leaving the canvas. Turn on vertical symmetry to mirror drawing around its seam, then drag either the top or bottom handle to place that seam; arrow keys nudge it one pixel and Shift moves faster. Speech ink has its own animation selector, so its motion can differ from the mouth. Five floating orbs preview Idle, Blink, Thinking, Sip, and Talking, with a label on hover; they stay hidden in Ink Display to keep the drawing workspace clear. Voice is a required three-stage casting flow—1 Accent, 2 Feel, 3 Voice. Place the Accent pin first; nearby-choice buttons disambiguate dense regions such as Britain, Ireland, Scotland, France, and Germany. Feel shapes character and Pitch, Pace, and Lilt. Voice then offers distinct names such as Pia, Rowan, Iris, Sol, and Mira instead of engine regions, so changing timbre never moves the accent pin. The compact audition dock remains beneath the bot throughout Avatar Studio; edit one sample and compare English, Premium, Babble, or Bottish without adding anything to chat. Once awake, the lights stay dim and breathing; voice previews add only restrained microphone-like accents. For a surprise, use the control's own randomizer buttons. Prism is intentionally unavailable while Avatar Studio or any other top-bar main panel is open.",
        clickLabel: "the live module controls",
        targetSelector: '[data-tutorial-target="avatar-foundry-controls"]',
      },
      {
        heading: "Find the rest of the foundry",
        body: "Identity, Eyes, Mouth, Details, Profile, Powers, Voice, SFX, and Settings remain available in the perimeter dock. On Identity, use Core for name and thinking, or Shell for the primary hue strip, badge, and subordinate Atmosphere accent. Accent Auto chooses a stable analogous environmental hue; selecting the hue control makes it explicit without repainting the avatar. The top LOCAL/ONLINE toggle and model picker choose which model compiles Powers—switch to ONLINE when a local compile fails. Prism stays unavailable inside this main panel. Everything stays a draft until the top Save or Create bot action.",
        clickLabel: "the perimeter dock",
        targetSelector: '[data-tutorial-target="avatar-foundry-dock"]',
      },
    ],
  },
  zen: {
    title: "Zen walkthrough",
    steps: [
      {
        heading: "Choose a relationship",
        body: "Choose PRISM or a persona to focus that relationship’s Home. A first click focuses a persona; select the focused tile again to open its customization panel, or send a message to begin Zen/Chat. That panel can jump straight to any Avatar Studio section. Beneath the bot’s voice buttons, edit the sample line; English, Premium, Babble, and Bottish each play exactly what is in the box, while Speak uses the current top-bar Voice mode. None of these starts a chat or LLM turn. Ready Powers stay active with that persona here and across PRISM; a muted persona can still act, but only answers with ... and never speaks aloud, while a breathless persona still speaks but never produces breath, sigh, or inhale Foley; a Copycat persona may originate one opening if nobody has addressed them yet, then repeats the latest addressed message exactly. A short-term-amnesia persona only sees your current message each turn—no earlier replies or broader topic unless that message states it—and answers naturally without amnesia coaching. A John/Jane Doe persona sincerely believes a random persona name for the session and reshuffles that name whenever short-term amnesia clears continuity. An Obsessed persona treats you as the star of each reply with fresh, intense admiration, while your agency, privacy, and safety boundaries still win. A radiant-joy persona makes that emotional warmth palpable without tracking or rewriting your mood. A sad-grouchy persona makes her draining presence equally palpable without changing your state; only bots that directly talk to her lose mood or motivation. Size Powers use six distinct presentations: Microscopic is unseen, Tiny is half size, Small is three-quarter size, Large is one-quarter larger, Giant is half larger, and Colossal fills and crops against the nearest edge. Names and controls stay normal-sized. Invisible fully hides the body and attached lights while preserving attributed text and speech. Loud and Quiet use fixed text and voice trims; in this one-person lane Quiet never removes a turn because there is no bot listener. A hard bare-minimum or brief Power is engine-bounded even if the model tries to elaborate. Clicking empty canvas space jumps straight back to All Bots Home. Escape returns you to the wider Library or saved group grid exactly where you left it. Inviting a guest keeps you in the current Home.",
        clickLabel: "a PRISM or persona tile",
        targetSelector: '[data-tutorial-target="chat-bot-picker"]',
      },
      {
        heading: "Shape a saved group's room",
        body: "Selecting a saved group keeps its familiar hero and standard bot grid, so the whole room remains easy to scan and every bot card behaves the same way it does in All Bots. Saved groups can also use Atmosphere as a reusable backdrop: Generate atmosphere hands the job to Prism as soft synthesis, so its job count stays on the real assistant and its shared synthesis card can be opened while you continue using PRISM. The leading + uploads your own image, and recent group-room Atmospheres can be reused directly. View all opens the exact-type local library. In asset details, Reduce magenta applies one cumulative local color-key pass to the whole asset set; Undo last pass restores the preceding revision. Marketplace groups keep their stable bundled scene until you replace it.",
        clickLabel: "Atmosphere in the saved group header",
        targetSelector: '[data-tutorial-target="chat-group-atmosphere"]',
      },
      {
        heading: "Let the companion move",
        body: "In a live Zen conversation, drag the bot from its body or quiet canvas space. A deliberate release can coast and bounce safely; ordinary clicks and the context menu stay put. The bot returns toward clear side space instead of settling over your words. At a very large desktop size, Zen becomes a two-column reading room, and moving the bot across the midpoint swaps the bot and prose sides. Reduced Motion keeps direct dragging but removes roaming and coasting.",
        clickLabel: "the live bot",
        targetSelector: '[data-zen-live-bot-presence-plate="true"]',
      },
      {
        heading: "Continue this Home",
        body: "Opening a persona Home from All Bots, the header picker, or its grouped conversation heading continues that Home's latest saved chat. Expand the group to choose an exact older chat; use its + or New chat only when you deliberately want a separate conversation. Only the selected conversation's transcript enters its active context. On an empty Home, the bot preview in the hero can start the chat when you select it—or just send a message below. Put physical stage direction in the separate Action field using letters and spaces only; typing exactly ** in the speech field jumps there. Action drafts stay private until Send. If you send an Action without speech, it and the bot's action response appear on the canvas as an ephemeral exchange and never enter history or memory. For a surprise opening or next line, Wield Prism onto the message box—hold Option on macOS or Control on Windows and Linux, then click the glowing composer. Space rerolls after a draft settles; clicking away, Enter, or Tab keeps it; Escape restores what you had. Your Summon / Wield Prism shortcut opens the assistant menu at the orb's current location. Opening the Conversations panel enters transcript Chat without changing the conversation, selected Speech Type, Atmosphere, or active reply. Closing the panel returns to immersive Zen with that same state. Mute stays silent in both views; English, Premium, Babble, or Bottish keeps speaking. Speech Type locks when you send and remains locked until the bot's full reply has reached the canvas. When Shh appears in either view, it stops immediately and saves only the bot words you actually heard. The bot may add one brief in-character reaction to being shushed. If no bot words were audible yet, Prism cancels and discards the hidden reply without a reaction. Shh never replaces the draft you are writing.",
        clickLabel: "the message box at the bottom",
        targetSelector: '[data-tutorial-target="composer"]',
      },
      {
        heading: "Choose how replies recover",
        body: "Choose LOCAL or ONLINE as the hard network privacy lane. Private chat is separate: enable it from the new-chat hero when you do not want the conversation or memories saved. Once that conversation begins, a locked Private chat badge remains in the navbar as status, not a switch. Switching to another applet disarms Private chat, so returning Home never starts privately by surprise. Auto is the default model inside either lane: Prism chooses the fastest suitable model and Effort for each request, then uses only that lane’s ordered fallback chain after a failure. Every fallback uses None for speed. While Auto is selected, the Effort control becomes a hollow triangle and cannot be opened. Image generation keeps its own LOCAL/ONLINE choice in Images. Voice remains independent from text routing: Chat and Zen share your saved Mute, English, Premium, Babble, or Bottish choice, while LOCAL hides Premium from the picker. Prism locks the selected type and engine when you send, then unlocks them only after the bot's full reply reaches the canvas. With Voice Effects on, longer English lines may take a sparse mic-ready breath before speaking, and English punctuation pauses stay quiet so commas and periods land as silence.",
        clickLabel: "the LOCAL / ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Let context breathe",
        body: "Recent messages stay visible while older continuity for this Home is carried through summaries and memory. Drag the live bot anywhere in the room; scroll in either empty column beside the prose to resize it. At compact sizes it becomes the crisp mini chassis; grow it again for the full textured avatar, which can become a dominant presence without changing the face.",
        clickLabel: "the conversation canvas",
        targetSelector: '[data-tutorial-target="conversation-canvas"]',
      },
      {
        heading: "Hear each bot think",
        body: "Every bot without a selected Avatar SFX uses one of four built-in PRISM “Computer calculating” loops while thinking. When ElevenLabs is connected and ONLINE, creating a manual, AI-generated, or Marketplace bot asks for a fresh unique loop; if that request cannot run or fails, the built-in sound stays active. The SFX tab can replace it with generated or uploaded audio, restore the PRISM default, or mute it. Identity Core’s Corporality slider (Artificial → Organic → Ethereal) shapes shared bodily Foley (fart, burp, cough) for Coffee, Signal, and Debate; use Fart beside Corporality to hear the current blend. An optional magic button on the SFX tab builds a local vocal Action pack — laughs, sighs, gasps, and throat clears in that bot’s Premium ElevenLabs voice — which stays on this machine and is never exported with the bot.",
        clickLabel: "the LOCAL / ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Open Atmosphere gently",
        body: "Atmosphere starts on for every Chat/Zen conversation. Blank bot gradients hold the room until a wallpaper arrives. The same room appears behind transcript Chat and immersive Zen. Open Settings to turn Atmosphere off, reuse a prior room, upload one, or synthesize another. $atmosphere remains available from the composer.",
        clickLabel: "Settings in the top toolbar",
        targetSelector: '[data-tutorial-target="zen-atmosphere"]',
      },
    ],
  },
  chat: {
    title: "Chat mode walkthrough",
    steps: [
      {
        heading: "Start with a bot",
        body: "Pick a bot, then send your first message. Waiting surfaces use a short in-character activity caption instead of displaying planning text. When player voice is on in immersive Zen, your submitted words stay off the canvas until their audio actually starts, then stream once from that audible clock. A Prompt Center send with wildcards first resolves to its concrete final wording, however long that takes, so neither the raw command nor an unresolved placeholder flashes or speaks early; if voice cannot start, Zen safely continues in text. While that line is still playing, the bot may offer a sparse listening reaction—a quiet nod or lean with an occasional throat-clear or sigh from its Action SFX—without unlocking the thinking veil early. The veil still waits until your line finishes. Transcript Chat shows your submitted text immediately, while the bot’s reply still honors the same configured Speech Type as immersive Zen. In transcript Chat (Conversations open), Psychic can show a user-readable planning disclosure on the assistant bubble—collapsed until you click the message. Immersive Zen never paints Psychic, model type, or effort glyphs on the bubble; private simulated passes may still run underneath for quality. Right-click an assistant message in Chat to reveal the model and effort glyph used for that reply. On models without built-in thinking, Effort runs Prism’s simulated private passes; Chat’s disclosure lists each completed pass (Plan, Draft, Audit, and more on higher Effort or Deep experimental). Those passes guide the final reply; with an online model, each one is an additional provider request. Private planning artifacts and provider hidden reasoning are never exposed. Any ready Powers stay active with that bot across PRISM; a muted bot can still act, but only answers with ... and never speaks aloud, while a breathless bot still speaks but never produces breath, sigh, or inhale Foley; a Copycat bot may originate one starter opening if nobody has addressed it yet, then repeats your addressed message exactly and adds nothing. A short-term-amnesia bot only sees your current message each turn—no earlier replies or broader topic unless that message states it—and answers naturally without amnesia coaching. A John/Jane Doe bot sincerely believes a random persona name for the session and reshuffles that name whenever short-term amnesia clears continuity. An Obsessed bot treats you as the star of each reply with fresh, intense admiration, while your agency, privacy, and safety boundaries still win. A radiant-joy bot makes its warmth unmistakable without inventing mutable mood state for you. A sad-grouchy bot makes her drag unmistakable without changing your state; only bots that directly talk to her lose mood or motivation. Hard bare-minimum and brief Powers are engine-bounded; expansive Powers guide the bot without forcing filler. Size Powers use Microscopic, Tiny, Small, Large, Giant, and Colossal at hidden, 50%, 75%, 125%, 150%, and edge-cropped 300% presentations. The bot’s label and controls stay normal-sized. Invisible fully hides the body and attached lights while keeping attributed text and audible speech. Loud and Quiet apply fixed voice and text trims; Quiet never removes a Chat turn because the player always receives it. A ghostly bot stays unseen while idle and fades into view only for its own spoken line; you can always understand the haunting through the conversation itself.",
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
        body: "Right-click in the canvas for shortcuts to settings, memories, images, and bot actions. In Settings → Storage, Space Lens groups reusable assets by primitive — General for image-gen and in-chat pictures, Chat for Chat atmospheres, Signal or Slate to drill into their asset types, and Audio for your synthesized Sound Effects and Music (bot action packs, avatar loops, Signal idents and atmosphere beds). Smart tidy clears abandoned library assets into recovery trash without listing every file unless you ask to review samples; Chat atmospheres expire on their own three-day cadence and are not treated as abandoned clutter. In the account-wide Images hub, type the reusable prompt, then select Synthesize. Five recent general images stay in the rail, and Asset Library opens the searchable general-image collection without mixing in Slate covers, Signal studios, logos, exhibits, or Atmospheres. Asset details can apply a cumulative local Reduce magenta pass and a separate Compress size control, each with Undo. Uploads appear only where an asset is actually needed, such as a cover, studio, exhibit, or Atmosphere. A running render can still queue up to eight more prompts with its captured model, keywords, privacy, and library.",
        clickLabel: "the conversation canvas with your right mouse button",
        targetSelector: '[data-tutorial-target="conversation-canvas"]',
      },
      {
        heading: "Keep the moment honest",
        body: "Zen keeps the timeline as it happened. Type $undo to rewind the latest message when you need a clean correction. Put physical stage direction in the separate Action field using letters and spaces only; typing exactly ** in the speech field jumps there. Action drafts stay private until Send. If you send an Action without speech, it and the bot's action response appear on the canvas as an ephemeral exchange and never enter history or memory. Action text stays visual and is never read aloud as dialogue. With your Premium player voice, a recognized vocal Action such as laughs becomes an ElevenLabs performance direction for that line. PRISM-only fart, burp, and cough actions stay out of the voice request and play their bundled local Foley when sent, just as they do in Coffee, Signal, and Debate. For a surprise line, Wield Prism onto the message box the same way as elsewhere—no separate dice control. Chat and immersive Zen wait for the real reply instead of inserting a filler response. When Shh appears, it stops immediately and saves only the bot words you actually heard. The bot may add one brief in-character reaction to being shushed. If no bot words were audible yet, Prism cancels and discards the hidden reply without a reaction. Shh never replaces the draft you are writing.",
        clickLabel: "the message box at the bottom",
        targetSelector: '[data-tutorial-target="composer"]',
      },
      {
        heading: "Shape an offline voice",
        body: "Choose LOCAL or ONLINE as the hard network privacy lane. Private chat is separate: enable it from the new-chat hero when you do not want the conversation or memories saved. Once that conversation begins, a locked Private chat badge remains in the navbar as status, not a switch. Switching to another applet disarms Private chat, so returning Home never starts privately by surprise. Avatar Studio Voice uses clear Accent, Local, and Premium stages: first place the required Accent pin, then shape the Local voice and Feel, then the Premium voice and Feel. The pin owns pronunciation, so changing from Pia to Rowan—or any other named voice—does not move the bot across regions. Zen player voice settings keep the full-width map in Accent. Click or drag anywhere in the world: the pin stays exactly where you leave it while Prism approximates the nearest broadly regional pronunciation and rhythm—including New York and Southern U.S. Nearby choices expose the closest named regions when several share a small map area; All accents opens the exact full list. Then set Light, Balanced, or Strong. Voice range filters the named catalog without exposing engine regions. Original and With accent let you compare the result; dialogue text, memory, and exports stay unchanged.",
        clickLabel: "the LOCAL / ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
    ],
  },
  coffee: {
    title: "Coffee mode walkthrough",
    steps: [
      {
        heading: "Pick or stage your table",
        body: "Choose a Coffee Group here to stage its table. Ordinary press on + starts a manual setup; Wield Prism on + desaturates the screen while a cold local model warms, then shows a fullscreen invent loader, invents a full Coffee Group from a short direction (cast, name, ethos, topics), opens it, and toasts the model that finished the refraction. In a larger saved group, write a Listen up prompt to open a locally ranked table already staged around your topic; review the seats, swap the cast, or cancel and keep editing. Each bot brings its ready Powers to the table; Powers can change who they notice, answer, remember, privately read, how strongly they pull the room's attention, whether a trustworthy direct question draws a more candid next answer, whether they touch their coffee at all, mute them so only actions and ... remain, leave a breathless bot speaking without breath/sigh/inhale Foley, or let a Copycat bot originate one opening before it repeats the exact user or bot line directly addressed to it. A short-term-amnesia holder only receives the current speaker's message each turn and answers it naturally, without table-topic memory or amnesia coaching. A John/Jane Doe holder sincerely believes a random persona name for the session—Coffee seat plates show that believed name—and reshuffles it whenever short-term amnesia clears continuity. An Obsessed holder makes the player or peer they address the star of that reply, with fresh admiration but no control over the target. A radiant-joy holder gives addressed listeners one bounded, replay-safe lift that shows through each listener's own personality without forcing agreement or erasing real sadness. A sad-grouchy holder gives one bounded, replay-safe mood or motivation drop only to the bot that directly talks to her; the player and bystanders are untouched, and the addresser keeps its own personality and agency. An interruption Power makes its holder seize eligible live openings from every resolved target at the table. A Power authored to interrupt every time always cuts a bot turn that directly engages its holder, without a random roll or generic cooldown. Coffee can also choose that holder for an organic cut-in through its normal table dynamics; once chosen, the cutoff still happens during that active turn and can land early, in the middle, or late. Other interruption Powers still use frequency, strength, and Coffee's short cooldown. Hard bare-minimum and brief Powers bound each table reply while preserving required interruptions, departures, and wraps. Size Powers render Microscopic, Tiny, Small, Large, Giant, and Colossal bots at hidden, 50%, 75%, 125%, 150%, and edge-cropped 300% body presentations without scaling seats, names, or cups. Microscopic, Colossal, and Invisible have no visible coffee. Each bot listener independently hears half of a Quiet bot’s lines; a miss exposes no words or topic, only that the voice was too faint, while the player still receives the full line. Each Loud line has a replay-stable 50% chance to mildly annoy exactly one audible peer. Size remarks follow the table’s existing mood and never create anger. A ghostly bot is invisible at rest, fades in for its own line, then vanishes again; each appearance can leave the other bots rattled without taking their agency. If a hard-of-hearing bot asks what the prior speaker said, that bot repeats its saved line and loses a little mood each time.",
        clickLabel: "a Coffee Group in the left sidebar, or Wield Prism on +",
        targetSelector: '[data-tutorial-target="coffee-groups"]',
      },
      {
        heading: "Set the table",
        body: "Choose Join for Coffee (chat and sip, open-ended) or Serve Coffee (pour-only hospitality on a timed visit). Duration, presets, and group settings steer the whole session together. Configure bots adds or removes permanent group members while keeping 2–5 Library bots; saved sessions retain their original cast. The Guest list's Invited and Away choices affect only the next session. Each bot automatically carries bounded summary-level memory from its recent non-private Coffee sessions, so recurring tables can build continuity without a separate group setting; Private sessions never feed that recall. Auto has no visible countdown; switch to Timed when you want a fixed 3-30 minute table. Under Atmosphere audio, Jazz turns on a soft café bed and lets you pick a station; it plays during live tables and while watching replays, but stays out of the faithful audio recording. Under Recent sessions, Open returns to the replay while Use setup restores that table's attendance, duration, pacing settings, and topic for an editable retry; the current model and response routing stay selected. Auto is the default model. Prism chooses a suitable model and Effort for each table generation within the selected LOCAL or ONLINE privacy lane, then recovers through that lane’s optional ordered fallback chain. The clock measures active table presentation: background lookahead beneath an audible line still counts, while the clock pauses only when model readiness or foreground generation leaves the floor waiting. The conversation resumes automatically once the room is ready.",
        clickLabel: "New session setup or Configure settings",
        targetSelector: '[data-tutorial-target="coffee-session-setup"]',
      },
      {
        heading: "Choose the spark",
        body: "Pick one of the four prompts created for this group, choose New topics to make a fresh set grounded in the seated personas, or type your own before the table starts. Refreshing only replaces the suggestions—the table stays waiting until you choose one. The shared navbar hides as soon as this new-session topic picker opens so the table and composer fill the viewport; End session lives in that table chrome from this waiting screen onward. Leaving here discards the empty placeholder instead of adding a session to Recent sessions. Once the topic locks, a short branded Coffee curtain plays edge-to-edge, then seats arrive and the chosen topic fills the same frame above the stage.",
        clickLabel: "a topic suggestion or New topics",
        targetSelector: '[data-tutorial-target="coffee-topic-picker"]',
      },
      {
        heading: "Keep the table moving",
        body: "Choose LOCAL or ONLINE for table privacy. Leave Model on Auto to let Prism choose a suitable model and Effort for each table turn; if it fails, Prism follows only that lane’s fallback chain with no thinking. This does not change the separate Images provider or voice preference. Choose routing and Voice before the table starts. During a voiced line, Coffee quietly prepares the next bot-controlled handoff; a player interruption, floor change, or newer table mutation discards it. Fresh slow replies may begin with one brief in-character acknowledgement before a single thinking beat; it appears naturally as table speech. When the new session opens at topic selection, Coffee freezes the selected speaking type and engine, hides the shared navbar and locks routing, model, Effort, Voice, and the entire utility strip for the whole table—including any temporary clock pause—until you choose End session on the live table chrome. A quiet model · effort chip stays with the topic once chosen and sits in the same chrome before then so you can still see what is locked. Auto still chooses model and Effort for each table turn when selected. A finished Review restores the navbar and shows Recorded replay instead of live routing controls because its exact audio and baked mouth performance no longer depend on the current model or Voice settings.",
        clickLabel: "the LOCAL / ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Join the conversation",
        body: "The live session stays fullscreen with the shared navbar hidden. In Join for Coffee, type into the message box or let the bots carry the room, and use Sip coffee for your own cup without sending a transcript turn—there is no pour pot. Send while a bot is still thinking and your line prints and speaks right away; that bot keeps its planned thought without hearing you yet, then may answer after it delivers. The ... chip still means a bot is talking or preparing to reply. A persistent ! beside a bot now means it learned a new memory about another bot; open it for the target, memory, confidence, time, and a link into Memories. Cut in while a bot is already talking and you interrupt immediately—the cutoff lands in the transcript and that bot takes a small mood hit. End session sits with the topic frame above the table when you want to leave early. In Serve Coffee, stay off the chat and carry the pot to top off eligible seated bots; a short thanks chip appears near the poured bot. You remain off camera during the live table: there is no player avatar or mug. Replay seats you as Default Prism at the table with the pot. Drag the pot from the composer (Serve) to top off an eligible seated bot before its farewell begins; no waiter, barista, or service bot can refill anyone. A bot whose Power refuses coffee has no mug, steam, sip, refill, or pot target; its invisible visit clock still winds down normally and cannot be refilled. Once an ordinary cup empties, that bot must leave within two or three table replies unless you top it off first, though mood and context can still send anyone home earlier. Put physical stage direction in the separate Action field using letters and spaces only; typing exactly ** in the speech field jumps there. A voiced player line containing a recognized asterisk cue such as *yells* gives Premium an ElevenLabs performance direction; with Voice Effects on, fart, burp, and cough actions play their bundled Foley at the authored cue. Shh remains a separate interruption control, so it never replaces the table draft you are writing. Type / for Prompt Center prompts and ! for wildcard decks; both expand when you send. Any idle audible bot may make a sparse prerecorded throat-clear, swallow, lip smack, sigh, or inhale; its mouth moves with the local cue, independent of its speaking style or voice engine. Watch a directly addressed bot: while listening, it may also give a small nod, lean, expression, brief spoken acknowledgement, or restrained ElevenLabs vocal reaction without taking a turn or entering the transcript. Your Cross-talk setting controls how often those contextual audible overlaps happen, from nearly silent in Rare to lively in Pile-up; inferred listeners remain visual only. When one bot cuts off another, the interrupter speaks a short hold-on over the outgoing voice before that voice releases; the interrupted bot takes a brief processing beat, then answers with an annoyed, abandoned ending over the handoff. The saved cutoff still shows only what reached the table. If a reply takes long enough to leave awkward dead air, another seated bot may occasionally speak one brief mood-aware aside (heard, with mouth motion, not shown as a seat action) without stealing the slow bot’s turn; the slow bot can begin answering over the aside’s natural ending. Ambient sips continue through quiet beats and listening moments, while the active speaker keeps their cup down; cup-return sounds stay synchronized with the visible cup motion. When an eligible bot has a non-neutral mood, Eleven v3 automatically carries that feeling into its next spoken line; neutral speech stays untagged. With Voice Effects on, longer bot turns may take a sparse mic-ready breath before speaking, and English punctuation pauses stay quiet so commas and periods land as silence. A clear table goodbye ends the session naturally. When the clock or End session closes the table, Wrapping up keeps the live table visible while every generated departure line streams and speaks in order; Review waits until those goodbyes finish. Prism's floating assistant steps out once the live Coffee Session begins and returns for setup, review, and replay. The finished Review keeps the saved table in view, offers Coffee home to return to setup, and one readable transcript download. Cross-talk, interruptions, ambient reactions, thinking intervals, sips, departures, and top-offs are captured in one faithful audio master as they happen. Replay plays that private master once at normal speed while its detailed direction track drives frozen bot appearances and voices, your Default Prism seat, thinking spinners, mouths, reveals, pot motion, seeking, pausing, and each bot physically departing after the closing exchange. It does not re-synthesize voices, replay effects on top, add an AI conversation turn, or generate a video. A session without its exact master remains transcript-only. Poll votes and team choices share the Table Talk rail; drag its left edge or the topic divider when you want more room.",
        clickLabel: "the Coffee message box",
        targetSelector: '[data-tutorial-target="composer"]',
      },
    ],
  },
  debate: {
    title: "Debate walkthrough",
    steps: [
      {
        heading: "Enter the Debate Studio",
        body: "A Debate is a saved exchange between two advocates. The Studio follows one clear path: shape the motion, cast the proceeding, then add or skip evidence. It opens as a Plainspoken Forum with Auto rounds, you in the Judge seat, and the Jury off. During live bot-controlled speech, Debate can privately prepare the next automatic floor transition, but any objection, gavel, pause, input gate, or changed floor discards it before it reaches Proceedings. Plain New Duel clears the active workbench without touching archived proceedings. Wield Prism onto New Duel desaturates the screen while a cold local model warms, then shows a fullscreen invent loader while Prism casts a full editable duel—motion, cast, room tone, emoji exhibits, and (in AUTO or ONLINE) Brave and Crossref sources when available; LOCAL keeps emoji props only. Field Refract and other Debate Wield magics follow the same warm-then-fullscreen rule. A short toast names the model when invent refraction finishes. The Archive keeps open and paused Duels above a quieter Completed section. Each proceeding starts as a compact cast, title, motion, and state summary; select it to reveal the complete metadata, synopsis, Assets, setup reuse, and the correct Start, Resume, Return, or Replay action. Spectator Duels prepare ahead with a progressive bake: a fullscreen loader appears only until enough of the opening is buffered (about two and a half minutes plus a few settled beats), then the gallery waits paused for Start. Leaving or canceling checkpoints progress and resumes append-only later; a finished gallery stays reviewable from the beginning. Mid-watch cancel continues on-demand for that sit only. Soft exhibit synthesize keeps the emoji fallback without blocking the studio.",
        clickLabel: "New Duel",
        targetSelector: '[data-tutorial-target="debate-new"]',
      },
      {
        heading: "Open the room only when you need it",
        body: "Tune the room keeps the proceeding preset, format, atmosphere, and Forum rounds together behind one calm summary. You can leave it closed and trust the defaults, or open it without losing the topic, cast, or sources already on the workbench. Forum supports Auto or a fixed one-to-three-round plan; Turnabout stays action-driven. Custom simply records a combination that does not match a named preset.",
        clickLabel: "Tune the room",
        targetSelector: '[data-tutorial-target="debate-room"]',
      },
      {
        heading: "Set the atmosphere",
        body: "Atmosphere runs from University Union to Daytime Showdown across five real Debate behaviors, with Plainspoken as the starting point. Move right for sharper language, faster confrontation, more natural cut-ins, and punchier moderator warnings; move left for cleaner structure and greater decorum. For a Participant, that same frozen Rowdiness sets the Moderator's overtime patience: Parliamentary allows 15 seconds, Structured 22, Plainspoken 30, Heated 40, and Free-for-all 50. A more rowdy room therefore tolerates a longer freeze; Participation difficulty never changes that clock. It changes the room’s delivery without changing the facts, safety boundaries, or any Persona’s identity and voice. Because advocates consent to the actual room, changing Atmosphere clears an earlier willingness check.",
        clickLabel: "the Atmosphere slider",
        targetSelector: '[data-tutorial-target="debate-rowdiness"]',
      },
      {
        heading: "Shape a balanced motion",
        body: "Describe the idea in ordinary words and choose Build the debate. Prism makes one balanced motion, names both sides, and writes the briefs you should not have to author. Try another version gives you a fresh framing; Refine motion reveals the alternate motions and direct field editing only when you want them. Prompt Center prompts insert as ordinary editable text, while wildcard rolls stay as chips until you Build or Refract—the surprise fills then, not while you type. A `{VAR}` inside a Prompt Center body means whatever you typed after the prompt. You may repeat `{VAR}` in that body; there is only one shared capture and no A/B/C letter links. The floating Prism remains available throughout setup and understands the bounded, unsaved workbench draft. Wield Prism into a glowing setup field for a contextual editable candidate shaped by the current room, role, cast, motion, and evidence. Space rerolls; clicking away, Enter, Tab, or clicking another input accepts; Escape restores the original. Your Prism shortcut opens the assistant menu at the orb instead. The idea dice remains available for a fast local seed.",
        clickLabel: "Build the debate",
        targetSelector: '[data-tutorial-target="debate-synthesize"]',
      },
      {
        heading: "Cast the room",
        body: "Choose the two advocates while Prism takes the center Judge / Moderator seat, gives the automatic neutral introduction, then stays publicly silent and inactive until you act. Surprise me can fill the open seats. Search the Library or use the vertical hue lens on the right of the bot grid to browse by color; clear the lens to return to name order. Your seat & the Jury reveals Participant and Spectator roles, the public presiding title, and the optional five-seat Jury. Participant is Forum-only: PRISM becomes your whole selected-side advocate, leaving one bot opponent and one bot Moderator/Judge. Spectator casts all three floor holders and seats PRISM in the audience gallery. Only duplicate bot seating is blocked; Powers never make a bot ineligible for a role.",
        clickLabel: "Debaters",
        targetSelector: '[data-tutorial-target="debate-cast"]',
      },
      {
        heading: "Choose your seat",
        body: "Your seat & the Jury is optional tuning, not a second setup mode. Leave it closed to preside as Judge with the Jury off. Open it to change your role, enable the Jury, or set the exact public authority shown on the center card—Moderator, The House, The Court, or another fitting title. Participant also offers Coach, Standard, and Immersive difficulty; this changes only how much analysis you see, never timers, patience, scoring, ballots, response choices, or recess rules. Room Dynamics presents the known cast as first impressions, never a vote forecast. Coach shows qualitative lean and confidence language with an optional Why? explanation; Standard keeps only the lean chips; Immersive hides the panel. Surprise jurors collapse into one unrevealed Jury item until they are seated. Each Persona still judges the public record through its own values, then receives only bounded favorability influence. When the Jury is on, five seats default to Surprise and random-fill at Start or Save; pin any seat from the Library and leave the rest on Surprise. The title freezes with the saved Debate but never changes the moderator bot’s identity, neutrality, Powers, or floor ownership.",
        clickLabel: "Your seat & the Jury",
        targetSelector: '[data-tutorial-target="debate-seat"]',
      },
      {
        heading: "Choose how you break the floor",
        body: "Participant Objection and Interject open a four-card Producer deck beneath the gallery while the opponent keeps speaking. Rhetorical gambits is on by default: three cards name a risky tactic and its intent, while Steer my debater accepts private direction in your own words. Turn the toggle off when you want custom steering only. Selecting a card expands it so you can attach up to three sealed evidence items before confirming. Preparation then slows the chamber to 1/8 speed and fades the opponent's audio while their transcript continues. PRISM prepares the performed line before committing the audience-heard cutoff; the fixed call and immediate room reaction hold on the interrupted speaker, then the camera pans to PRISM · You. Objection asks for a formal ruling. Interject is a conversational floor-grab governed by decorum. Social favor and procedural merit are scored separately, and hidden execution grades appear only in the completed Human Factor review.",
        clickLabel: "Participant controls",
        targetSelector: '[data-tutorial-target="debate-rhetorical-gambits"]',
      },
      {
        heading: "Secure advocacy consent",
        body: "Choose Make sure they’re willing after the question and debaters are set. This private LLM check protects every bot advocate: every Persona gives a short in-character comment on the assigned side, a genuine boundary can decline and cannot be overridden, and a willing Devil’s Advocate keeps their identity and receives visible framing. Their answer stays on this step so you can read it; after every required advocate accepts, choose Add optional evidence to continue. A Participant is one of the two debaters, so PRISM holds their selected side directly and only the opposing bot needs advocacy consent. Consent is bound to the concrete model and Effort that considered the assignment. Changing either marks earlier acceptances Needs reconfirmation and locks Start until the advocates reconsider; changing Turbo alone does not, because it changes priority rather than deliberation. A refusal remains respected for this prepared Debate instead of becoming a setting-shopping reroll. Changing the motion, cast, format, formality, LOCAL/ONLINE privacy lane, or Participant side also requires a fresh compatible check.",
        clickLabel: "Make sure they’re willing",
        targetSelector: '[data-tutorial-target="debate-consent"]',
      },
      {
        heading: "Freeze one shared record",
        body: `Evidence is optional. Player notes, Brave Search, Scholar Search, and exhibit descriptions stay player-authored by default. To add an exhibit, describe the physical object or detail you want—or Wield Prism into that description field for a contextual exhibit name—then choose Draft exhibit. Draft exhibit derives an editable adjective, object name, observable description, and emoji grounded in your seed plus the current motion, sides, cast, and existing exhibits. It does not generate artwork. After you add an exhibit, tap it on the Evidence page to reopen the same composer and Save changes in place. Tap the large exhibit picture to search for an emoji and choose from the three best live matches; upload, reuse, or synthesize overwrites that same picture. Wield Prism into Player notes, Brave Search, or Scholar Search for an editable contextual draft. A Prism-drafted query does not search until you accept it and choose its Search button. Brave searches real public web sources; Scholar Search uses Crossref's public scholarly metadata for DOI or publisher links without scraping Google Scholar. Each search adds at most its top three unique results in AUTO or ONLINE, and later searches remain additive. Prism never fabricates sources or results. For each retrieved source, the selected Debate lane may rank one or two motion-relevant facts, but PRISM accepts only complete sentences copied as one exact contiguous passage from the bounded provider, Crossref abstract, or inspected page text. A paraphrase, invented claim, or nonadjacent splice is rejected; PRISM falls back to a complete motion-relevant source sentence without clipping a word. A Scholar result without an abstract is clearly marked metadata only. The excerpt's source kind, material fingerprint, and model-selected or fallback provenance freeze with the packet, so Debate never silently refetches or changes it after Start. Add URL accepts your own public HTTP or HTTPS source here. AUTO and ONLINE can read a bounded page title and excerpt for you to review and edit; a failed read keeps the draft open for manual completion. LOCAL never performs Brave, Crossref, page, or online-model requests, so you supply the title and exact source text; configured local selection may rank only the material you supplied. Sources and exhibits share one clear record, up to ${DEBATE_EVIDENCE_ITEM_MAX_COUNT} items; duplicate URLs are rejected and later searches add distinct sources without replacing earlier ones. You can also Wield Prism into the adjective, object, or observable-fact fields for a candidate that considers the current Debate without inventing provenance or significance. Generate all assets before the debate automates artwork only for exhibits still using an emoji and no attached asset: Save Debate hands those eligible sprites to the server-owned soft queue immediately; uploaded, reused, or already synthesized assets are never replaced. You can switch to Signal or any other applet while the shared Prism card tracks delivery, and each finished sprite attaches directly to its saved Debate exhibit. Spectator starts synthesis alongside the full bake, while Judge and Participant wait for the first sprite to load and let the rest finish in the background. Artwork remains an explicit presentation choice after the text draft exists: Synthesize asset soft-prepares a new sprite with a status card anchored around the live Prism orb—emoji stays as the fallback, Save changes stays available so you can queue more soft sprites in parallel on other exhibits while each lands, the leading + lets you upload a PNG, JPEG, or WebP, recent assets can be reused, and View all opens the account-local Debate exhibit library. In the exhibit composer, Reduce magenta applies one cumulative local color-key pass to the attached sprite, with Undo last pass for each retained revision. Synthesized exhibit sprites also receive five automatic local magenta cleanup passes right after keyed cutout, before they land; the manual Reduce magenta control remains for extra polish. Asset details can apply the same Reduce magenta pass; Undo last pass walks back the retained revisions one at a time. Wielding Prism onto + is the directional synthesis shortcut. Its approved title and observable fact are the evidence; the visual adds no facts. Debate exhibits never mix into general Images. Sources and exhibits freeze together with the Debate. LOCAL blocks research and page reading before network access, while manual URL records, notes, object exhibits, emoji, uploads, reuse, and configured local image synthesis remain available. Debate never reads or writes relationship memory.`,
        clickLabel: "Evidence",
        targetSelector: '[data-tutorial-target="debate-evidence"]',
      },
      {
        heading: "Make the optional choice explicit",
        body: "Use this evidence stages the packet you built. If you leave it empty, Continue without evidence confirms that choice without manufacturing a source or note. This single confirmation lets the launch card distinguish a deliberately empty packet from a step you have not considered yet.",
        clickLabel: "Use this evidence or Continue without evidence",
        targetSelector: '[data-tutorial-target="debate-evidence-continue"]',
      },
      {
        heading: "Read the launch circuit",
        body: "The compact proceeding card stays visible beside every Studio tool. It summarizes the motion, cast and consent, room, and evidence choice. Evidence itself stays optional, but you must explicitly use it or continue without it. Save Debate parks a ready setup in Archive Open without opening the chamber, and keeps generated exhibit images protected while that proceeding stays in Archive. Opening that saved setup uses the visible gallery walk-in as its loading screen: while guests find their seats, the Moderator’s opening voice, gavel, and first camera beat prepare. The title card and Start Debate appear only once the house is seated and that opening is ready. When Generate all assets before the debate is checked, Save immediately hands only emoji-only exhibits with no attached asset to the server-owned soft queue; custom, reused, and synthesized assets stay untouched. You can keep using any PRISM applet while the shared Prism card tracks delivery, and each sprite attaches to its exact saved exhibit before you return. Remove soft-cancels the proceeding and releases those sprites for Clear unused. When a saved proceeding has exhibits, Assets opens them for soft Prism re-synthesis and local Reduce magenta cleanup—emoji stays the fallback when no sprite is attached. Start Debate launches now.",
        clickLabel: "the ready check",
        targetSelector: '[data-tutorial-target="debate-readiness"]',
      },
      {
        heading: "Open the proceeding",
        body: "Choose LOCAL or ONLINE in the navbar before setup work. Leave Model on Auto to let Prism choose a suitable model and Effort for each Debate generation; failures follow only that lane’s saved fallback chain with no thinking. Start and Save stay locked until the motion, cast, consent, and explicit evidence choice are complete. Save freezes that ordered chain into Archive Open for later; Start then freezes that ordered chain, the resolved Forum round plan, and the format version with the cast, Jury (Surprise seats plus any pinned library jurors), motion, consent, evidence, and resolved Powers; every generated statement and ballot records the model that actually handled it. Once the chamber goes live, the shared navbar fully hides so the Forum fills the viewport; LOCAL/ONLINE, model, and Effort stay locked for the whole sit—including recess, pause, and Spectator bake—until you return to the Debate lobby via Leave Debate or End. Leave Debate stays above every live overlay and is never disabled: click it once to arm the confirmation, then click Leave now for an instant return to Debate Studio while safe session housekeeping finishes. A quiet model · effort chip stays under the motion title so you can still see what is locked. Auto still chooses model and Effort for each Debate generation when selected, including during Spectator bake. Opening any saved, not-yet-presented proceeding mounts the Living Chamber immediately and lets the gallery walk in as the loader while local gavel assets, the Moderator’s first voice, and the first camera beat prepare in parallel. Only after every gallery member is seated and the opening is hot does the full-screen title card settle with intro music and expose Start Debate. Choosing Start removes the title controls and cuts straight to the Moderator slamming the already-loaded gavel; it never replays the title card or inserts another loading screen. The first debater may still think after the room is called to order. The gallery murmur starts quiet and swells with each arrival until the house is full, and bot thinking sounds stay muted until you begin. The frozen center authority always opens and closes the Debate. In a human-Judge session, Prism delivers the automatic neutral introduction; bot-controlled floors then advance around an inactive center seat until you act. Your final ruling stays authoritative, both advocates react to it once, and Prism gives only the neutral procedural close. In bot-moderated sessions, the moderator closes after the verdict and any Jury aftermath. If the whole chain fails, the proceeding pauses on the exact non-bookend action and offers Retry or Skip without dialogue; openings and closings fall back to neutral procedural copy, and Jury ballots are Retry-only. LOCAL remains a hard offline guarantee. The in-room Judge console keeps one contextual Gavel control, Pause or Gavel to resume, and End Debate together beside the proceeding instead of in the app chrome; its label becomes Intervene while an advocate holds the floor and Call time during overtime, and Space invokes that same context-aware control; Participant and Spectator sessions use the same in-room Proceeding console without the Judge-only controls. Pause takes effect immediately, even during the semantic intervention cooldown, and the moderator uses a short Persona-shaped recess line with varied procedural copy as a safe fallback. A Participant shares three recess requests between Pause and a confirmed Leave Debate: PRISM records the recess in the background without delaying the return to Studio. Crash or background recovery never spends a request while one remains. The third accepted recess creates a durable final-recess checkpoint. After three, the Moderator denies further in-room requests, favorability falls, and each consecutive attempt drains more of the visible Moderator patience reserve. That same remaining reserve is the Participant’s bonus time after later floor clocks expire. If it reaches zero, the Moderator gavels arguments closed and rushes directly to an abbreviated Jury deliberation or their own ballot with a severe conduct penalty; this cannot be rewound to the final checkpoint. Leave Debate with no recesses left is housekeeping, not a fourth request: it returns immediately, and reopening restores the final-recess checkpoint. Leaving an unfinished Debate with a recess available preserves its exact floor and makes the returning chamber appear in recess. Resume requires you to strike the visible gavel; its audible hit calls the camera to the moderator before that moderator gives a Persona-shaped return-to-order line. The exact next juror, discussion turn, ballot, objection, intervention, or interrupted line then continues. The cooldown governs semantic interventions within that gavel control, not audience order or lifecycle controls. Pause and Resume remain live procedural presentation only; neither housekeeping beat enters the readable proceedings or copied transcript. Recess ceremonies and every 8× slowed Participant input interval are also off-record: gallery, ambience, reaction, and thinking audio are suspended rather than captured. End Debate skips the remaining rounds: a Jury holds only three discussion turns and is told not to penalize unheard rounds. When formal Jury deliberation arrives, a timed choice appears over the current camera. Auto is the default and begins after the Debate-settings countdown; Spectators and human Judges can choose Watch Jury to hear and view the deliberation live. The Jury remains advisory to a human Judge. Skip moves directly to final ballots. Skipping remains available after discussion starts—even during a juror’s current statement—and preserves all five final ballots and the full five-ballot Jury result. Judge input still waits until you act or pass. Participant input instead receives eight wall-clock seconds per announced floor second; the visible Debate and floor clocks advance at 1/8 speed while you write. Overtime drains favorability and the Rowdiness-based patience meter until the Moderator gavels, the opponent offers a persona-shaped taunt with one final grace window, or PRISM answers with the awkward two-beat “…” and “…What was it you said again?” failure.",
        clickLabel: "Start Forum or Start Turnabout",
        targetSelector: '[data-tutorial-target="debate-start"]',
      },
      {
        heading: "Use the Judge’s gavel",
        body: "The public gallery is alive in both Forum and Turnabout, from every seat in the room. Its visible gallery badge and four-bar meter move deterministically from Observing to murmuring, restless, and disruptive; a successful call to order returns the house to Observing, and debate events earn heat from there. The chosen Rowdiness controls how quickly—and how loudly—the room heats up, with a smooth swell instead of hard jumps. Daytime Showdown sits at the free-for-all end: the gallery can start swelling earlier in a line and stays rowdier until the moderator contextually calls order. Portrait crosstalk and layered room audio grow with it, with protected mix headroom for reactions and the gavel. Captions stay readable and the crowd never changes an argument, ruling, ballot, or outcome. Debater text stays clean spoken prose—PRISM never inserts *speaks loudly*, *yells over the audience*, *raises voice*, or other actor directions into the saved line. A silent local gallery director watches only the recent audible public debate and may assign none, laugh, gasp, or impressed after a line lands. Most lines stay quiet; explicit 1–3 intensity controls how much of the room reacts and how loudly, while saved cooldowns prevent repetitive canned sounds. Gibberish may earn laughter, a truly shocking public beat may earn a gasp, and an unusually sharp responsive rebuttal may earn an impressed reaction. The direction is presentation-only and never reaches Proceedings, copied records, the case board, evidence, ballots, or the outcome. LOCAL remains fully local, and a conservative deterministic fallback keeps the proceeding moving if the director is unavailable. The bot Moderator sparsely strikes the gavel and calls for order in character in Forum or Turnabout—including when the gallery stays rowdy for long enough, not only the first time it crosses into disruptive. The moderator never needs to shout—the gavel carries the authority. That room-control beat is preserved at its heard position for faithful replay while staying out of Proceedings, copied records, the case board, ballots, and AI context. When you are the Judge, PRISM never takes that authority from you. Gavel is one context-aware physical room-control action. Use the control attached directly to the gallery, the mirrored Judge-console control, or press Space to strike. In its audience-order state, it forces the Judge / Moderator camera, holds a rowdy peak under the call (with a light laugh swell when the room is already hot), then eases the gallery back without stopping the speaker or reveal. An early strike earns only a brief awkward freeze and spectator glances—there is no authority penalty. The saved order cue preserves its exact heard position for replay while staying out of Proceedings, copied records, the case board, ballots, and AI context. Extra strikes during the two-second smash window are local showmanship, with only one canonical order cue saved. At saved procedural moments, a ceremonial cue waits for your strike without authoring one for you. If that cue expires, the interface stays clear while Auto silently cuts to one advocate and then the moderator before the proceeding carries on. Space serves that ceremonial cue first. During an explicitly started call-time burst, Space adds showmanship strikes next. Otherwise the single Gavel / Space input follows the live floor: Intervene while an advocate is speaking, Call time in overtime, and ordinary audience order when no semantic cutoff is available. An intervention stops the active floor, opens the Judge choice deck, and keeps the eight-second semantic cooldown. While semantic intervention cools down, the same gavel falls back to non-interrupting audience order and the amber countdown explains when Intervene returns. If Space is temporarily blocked by a pending ruling, intervention, pause, Jury floor, or saving strike, the chamber explains why instead of failing silently. During advocate overtime it becomes Call time; choosing it starts the existing two-second procedural burst, with repeated Space strikes shaping the measured, firm, or aggravated call-time performance. Pause, Resume, semantic intervention, and ceremonial order cues also settle the room. An advocate objection remains different: the interrupter literally shouts “Objection!” and states the challenge first, then a timed Sustained / Overruled choice takes focus; press S or O without reaching for the buttons. While that ruling is pending, room controls stay locked. Once Jury deliberation begins, the Jury owns the floor: the unified Gavel and Space are put away, while Skip deliberation remains available. Your selected camera mode survives every forced gavel shot, so Auto resumes directing as soon as the strike finishes.",
        clickLabel: "Gavel",
        targetSelector: '[data-tutorial-target="debate-judge-gavel"]',
      },
      {
        heading: "Read the living case",
        body: "Both formats stage every frozen floor holder behind an authored side podium, with the moderator elevated between them when the cast can perceive that body. Bot advocates use their actual animated bot; a Participant's selected side uses PRISM as the human debater's public body. When a speaker is about to discuss evidence, the chamber places that one cited exhibit or source on the table as their turn arms—never mid-line hops, and never a piece they will not talk about. It stays until another advocate turn cites a different piece, or until the next advocate or Participant discussion moves on without a citation; moderator beats, Judge gavels, and gaps between turns leave it in place. Advocates may only refer to packet items they have marked for display in that turn. Every Participant opening, challenge, rebuttal, and closing offers three randomized, unlabeled suggestions plus Make my own case. Internally the suggestions span great, okay, and safely weak answers, but their quality tier never appears in the live label or API. The response deck sits directly beneath the gallery: choose a suggestion to expand and review its full text, then use the persistent Commit action; choosing a card never speaks it by itself. Custom and cut-in composers accept @ to open a picker of frozen exhibits, Brave, Scholar, and URL sources—filter with @exhibit, @brave, or @scholar—and choose a row or press Tab/Enter to insert a real citation chip. Substantively using frozen evidence doubles that answer's signed impact: strong use helps sharply, while confidently misusing it doubles the credibility loss. The motion stays titled across the top of the chamber while perceptible words appear as synchronized broadcast captions along the bottom; a CC button at the bottom-left of the Forum viewport toggles those captions on or off—including spoken Jury chamber subtitles—and remembers your choice. Public prose arrives with the live voice; inaccessible speech never enters captions, voice, the shared case board, or listener-facing ballot reasons. Debater captions and saved Proceedings contain only the words being argued; bounded voice-performance metadata can still shape delivery without appearing as asterisks or stage prose. On a sparse replay-stable roll, an advocate or visible juror whose own saved Persona genuinely finds an audible contribution contrary to expectation or newly explanatory may give one short in-character vocal reaction; a Signal-style *tag* appears above that bot while it speaks through the bot’s voice, and like Signal it stays out of Proceedings and copied transcripts. Sparse ambient throat-clears, sighs, and inhales also float the same overhead tags and speak the same way. It is atmosphere, not a new argument, vote, role change, relationship-memory read, or hidden Power reveal. In Participant sessions, PRISM is the complete selected-side advocate and carries your thinking, speaking, interjection, and objection states. It labels the live line “PRISM · You” while the saved event remains player-authored. A persistent favorability balance evaluates both advocates for argument, humor, confidence, undermining the other side, and subject knowledge; earlier opportunities move the room more, while later turns face diminishing influence. It can shift each Persona's ballot only within a bound—it never replaces that voter's own predisposition or reading of the public record. Coach shows the live balance, scoring feedback, and five anonymous Jury leaning pips. Standard reveals the balance after the verdict. Immersive omits it from ordinary UI, while all three difficulties use identical scoring. Each visible podium carries its floor holder's glyph; the current turn glows even when it is silent, so the cue follows floor ownership rather than speech or prose while stable identity remains canonical. Frozen faces, ink, frame finishes, visibility, thinking, listening, and speaking states remain live throughout the proceeding. Judge choices take over the caption position at the moment of decision; Participant Forum actions and Turnabout actions rise in a full-width command deck. Forum keeps the scoreless case board and gives a Participant two distinct ways to break an opponent's live floor. Copy case board copies that SMS-style claims thread as plain text for review, separate from Copy verbose transcript on Proceedings. Interject and Objection both capture the exact audience-heard fragment, desaturate the Forum except PRISM's thinking glyph, slow the Debate clock by 8×, and open a 30-second evidence-aware message box. The opponent audibly soft-cuts mid-phrase while their camera still holds. Then Interject plays “Hold on—” or Objection plays “Objection!” before the camera pans to PRISM · You; only after the call finishes does the composer take focus. Expiry withdraws the cut-in with a small favorability loss and restores the opponent's floor. A submitted objection goes to the bot Moderator/Judge for Sustained or Overruled. Sustained leaves the cutoff in place, while Overruled returns the opponent's floor for a concise continuation. Withdraw objection also returns the floor, records the withdrawal instead of a ruling, and lets the opponent finish. Only the heard fragment remains public before either path resolves. Separately, Turnabout uses a public statement record: Press asks for clarification; Object opens the frozen evidence vault; Present Evidence sends one statement-and-evidence pair for grounded validation and an immediate ruling. Sustained contradictions create explicit reversals without inventing evidence. With Jury off, compact mini spectator bots face neighboring seats and trade quiet ellipsis chatter without gaining the floor or a vote; a dry gallery murmur remains a separate audio layer. With Jury on, that strip becomes the frozen public roster.",
        clickLabel: "the living case board",
        targetSelector: '[data-tutorial-target="debate-case-board"]',
      },
      {
        heading: "Enter the Jury chamber",
        body: "Spectators and human Judges can open the five-seat Jury camera manually once leanings, deliberation, or ballots begin (the control stays visible but disabled until then), and Auto also enters the chamber for those same beats before returning to the forum for advocate aftermath reactions. While the Jury camera is up, the public gallery strip hides so the chamber owns the stage. The same CC control that toggles Forum captions also shows or hides spoken Jury chamber subtitles. The jurors follow the live case and trade short reactions between public-floor turns. An ellipsis beside a juror means a thought is waiting; enter the Jury camera before the next thought and that juror will deliver it, while another camera lets them resolve immediately without holding up the proceeding. PRISM matches the Light or Dark table, seats bot faces and frames around its transparent foreground, and carries active-speaker color, gaze, thinking, listening, speech, voice, and applicable visual Powers into the room. Five private leanings lead into five short routed discussion turns and five final ballots. Each audible juror reads the same final reason saved in the Jury record; as each final ballot is cast, its side appears beside that juror and the running five-vote tally updates while a physical mark slides into the center pile. A canonically silent juror still casts without gaining a voice. The foreperson then confirms the split. For a human Judge, the chamber is live and named but remains advisory; the Judge’s own final ruling still controls the Debate. Participants never mount this chamber; their camera stays on the public proceeding while five anonymous marks resolve into the aggregate. Manual public-floor cameras stay out of the chamber unless an eligible Spectator or human Judge chooses Jury or Watch Jury.",
        clickLabel: "the Jury chamber",
        targetSelector: '[data-tutorial-target="debate-jury-chamber"]',
      },
      {
        heading: "Frame the floor",
        body: "Auto is the quiet default camera: it cuts instantly to Left for the For advocate, Moderator for the moderator, Right for the Against advocate, and Wide whenever no bot owns the public floor. During long moderator monologues—openings, recess and resume calls, and other extended floor prose—Auto adds paced reveal beats: after the formal docket listing it cuts Wide then to each advocate when the moderator talks about them, then returns to the moderator before the floor is handed off (without lingering on the final introducee). Brief Wide breaths still appear when the prose runs long without names. Evidence placed for the active turn can stay on the table without forcing Wide—speaker shots keep priority while the pedestal remains visible. When you take the Judge / Moderator seat, the public floor stays on Auto instead of exposing manual Left, Moderator, Right, or Wide shots. If Jury is enabled, Jury becomes the Judge’s one additional camera once leanings, deliberation, or ballots open (disabled before then), and Watch Jury enters the live advisory chamber. Auto also visits the Jury chamber for leanings, deliberation, ballots, and the split, then returns to the forum for advocate aftermath reactions. Returning to Auto restores the directed public proceeding when you have locked a manual Jury shot. Participant and Spectator sessions retain manual public-floor cameras; Spectators can still choose Jury manually once the chamber is open, or choose Watch Jury in the timed deliberation prompt. In Participant and Spectator sessions, procedural gavel cues direct Auto to Moderator: one strike calls attention at every phase change, while two restore order for moderator rulings and verdicts, with the active moderator’s color carried through the instrument. Advocate objections carry no predictive gavel cue; the objection is heard before any bot moderator responds. A human-Judge session automatically activates the center seat for its neutral introduction; after that, explicit Judge actions alone reclaim the center seat and gavel until the final ruling. The advocates then react before the automatic neutral center close. Any actual gavel slam briefly forces Moderator and disables camera controls through the swing without replacing the selected mode; Auto resumes as soon as the forced shot ends. A canonically silent bot moderator can use that visible signal without speech. Forum and Turnabout keep the procedural rhythm for bot-moderated roles; Turnabout keeps an extra strike for a public revelation. The gavel is visible only in Moderator view. Choose a manual view to hold the shot outside forced strikes when your role allows it. Camera choice changes presentation only—it never changes the saved transcript, case board, ballots, or speaking order.",
        clickLabel: "a Debate camera",
        targetSelector: '[data-tutorial-target="debate-camera"]',
      },
      {
        heading: "Follow and keep the record",
        body: "Proceedings render safe Markdown and source chips in the chamber's tonal transcript rail. Each floor line opens shortly after speech begins and streams with the heard words, with a short stenographer lag so the rail never spoils a baked Spectator gallery or a mid-line recess. It follows every growing live turn until you deliberately scroll back; choose Live to return to the newest phrase. A compact Debate time clock in the room counts up from when the chamber is live, freezes during recess and before Spectator Start, and never counts down a total runtime; timed advocate turns retain their separate floor-limit readout. Juror thoughts, deliberation, and Signal-style vocal Foley reactions stay out of Proceedings. After the verdict, Judges and Spectators get the Jury Record in the bottom Jury slot (with Copy all data to clipboard, Copy Jury transcript, and Copy verbose transcript whenever those records are copyable — not for Participant-sealed Jury), and a Verdict tab beside Case board that opens the ruling, Coffee-style session summary, ballots, and an Inquiry alcove with role-colored cast chips and temporary pick-a-bot inquiry chat so you can ask about a cast member’s frozen in-debate reasoning — nothing is saved, threads stay per cast member while you remain on the verdict, and positions stay as they were. That Jury transcript remains directly copyable from its eligible Proceeding archive entry after you return to the Studio. With Jury off, a human Judge's ruling is final, a Participant's bot Moderator/Judge decides the result without inventing a PRISM ballot, and a Spectator Duel uses the traditional three-bot majority. With Jury on, the majority binds Spectators and Participants but advises a human Judge. After a Participant verdict, only the bot opponent may react before the bot Moderator/Judge closes; PRISM never invents a human reaction. Spectator verdicts still let both bot advocates react before the bot Moderator closes. In Judge sessions, the human ruling is followed by both advocates’ reactions and an automatic neutral center close. Judge and Spectator records keep named deliberation and ballots; Participant API responses, transcript copies, archives, and replay-facing event data retain only the aggregate split and verdict. Every completed archived Debate shows its approximate active runtime from the saved presentation timeline, excluding generation waits, explicit recesses, and time spent away from the proceeding. It also keeps a short title synthesized in the selected Rowdiness while preserving the exact motion beneath it. Open resumes or replays that proceeding; Use setup copies its motion, title, room settings, cast, role, Jury choice, and evidence into a fresh editable workbench without changing the original. Results and old consent do not carry over, unavailable Library bots must be reassigned, and your currently selected model and routing remain in place for the rerun. Copy all data to clipboard builds one review paste with the verbose transcript, Jury record when allowed, and Living Case Board. Copy verbose transcript creates one review-ready role-safe record with frozen setup, runtime snapshots, evidence, event metadata, setting-independent per-line spoken durations, interruptions, moderator rulings, case-board state, and permitted public ballot reasons. Participant reviews add a Human Factor section for difficulty, Rowdiness patience, guided or custom choice provenance, evidence multiplier, favorability history, timing, recesses, predisposition adjustments, and final vote math while keeping sealed jurors anonymous. The Case Board panel keeps its own Copy case board control for the shorter heard-claims stream.",
        clickLabel: "Copy all data to clipboard",
        targetSelector: '[data-tutorial-target="debate-copy-all-review-data"]',
      },
    ],
  },
  botcast: {
    title: "Signal producer walkthrough",
    steps: [
      {
        heading: "Give a bot a show",
        body: "Open the designed bot dropdown, then choose a host from its vertically scrolling, color-coded list. You can search by name or use the hue lens to move through bot colors without leaving the Create show card, and optionally add a premise inspiration—the spark, tension, or reason this show should exist. Each host still starts immediately with an editable fallback name and a camera-ready PRISM set, so creating the show never waits on synthesis. Right-click a host or guest anywhere in Signal to open that bot’s actions and Avatar Studio.",
        clickLabel: "the Create show producer card",
        targetSelector: '[data-tutorial-target="botcast-create-show"]',
      },
      {
        heading: "Shape the show’s identity",
        body: "Complete this show is resumable: Signal uses and can sharpen your editable premise inspiration while it fills only the missing text identity, transparent logo, and matching Light/Dark studio set, keeping any generated or uploaded artwork already installed. A status card anchored around the live Prism orb tracks visuals as they land one at a time in the background, so you can keep using PRISM, and rerunning it retries only unfinished pieces. Its cached ElevenLabs ident and studio-specific room-and-Foley loop join the same pass when you are Online; in LOCAL, Signal finishes the supported pieces and leaves audio waiting without breaking privacy. The gear at the bottom-right still lets you tune the premise and name, regenerate blurbs, and adjust atmosphere audio; it now opens exact-type rails for studio sets and logos. Click + to upload (a studio upload requires both Light and Dark); wield Prism onto the same tile to synthesize; choose View all to search the account-local library. Synthesized logos receive five automatic local magenta cleanup passes right after keyed cutout; Reduce magenta still applies cumulatively to the complete set for extra polish, rebuilds the studio lighting derivative, and keeps each retained pass undoable. Applying a studio always installs both variants and rebuilds its lighting maps together. These assets never mix into general Images. An echo-bound host gets one persona-shaped boast about always having something original to say—and repeats that same blurb forever instead of rotating a batch.",
        clickLabel: "Complete this show or the show-card gear",
        targetSelector: '[data-tutorial-target="botcast-brand-controls"]',
      },
      {
        heading: "Build an audience",
        body: "Every show begins with no audience. Completed episodes build a simulated viewer base, while one randomly chosen persona from your Library reviews the same audience-heard and audience-visible cut—never hidden dialogue or private production state—and leaves one subjective rating and short named review. Ratings stay marked as early until enough reactions accumulate. Click the Audience pulse card to open the full review history with each episode’s rating, so the archive becomes the honest foundation of the show’s emerging economy.",
        clickLabel: "the audience pulse",
        targetSelector: '[data-tutorial-target="botcast-audience-pulse"]',
      },
      {
        heading: "Give the studio an atmosphere",
        body: "Every show starts with a deterministic, host-persona-led Signal Synth ident, a bundled quiet studio atmosphere, and synchronized tactile Foley—available locally with no key or network and no custom look. Open Align stage to balance the unified room atmosphere and tactile Foley; Signal saves the mix for that show. Use Play ident to audition the opening. The show-card gear is always available to create or refresh one cached ElevenLabs audio package: a six-second ident plus a studio-specific, non-musical room-and-Foley backing loop. Refreshing the studio also refreshes that cohesive atmosphere when you are Online. Signal never synthesizes audio when an episode begins.",
        clickLabel: "the atmosphere audio controls",
        targetSelector: '[data-tutorial-target="botcast-intro-audio"]',
      },
      {
        heading: "Choose how the bots speak",
        body: "The Voice picker in Signal’s top navbar matches Zen: Mute stays silent, English uses each bot’s local identity without ElevenLabs credits, Premium uses its ElevenLabs identity with local fallback, Babble keeps the selected local voice without intelligible words, and Bottish uses Prism’s procedural robot language. Signal prepares the next bot-controlled handoff while the current line is heard, then discards that preparation whenever live direction changes the floor. Signal lets an ordinary thinking pause stay quiet instead of filling it with scripted commentary; when fresh generation still needs time, an eligible responder may give one brief in-character acknowledgement before a single restrained thinking beat. It appears like any other on-air line. Eligible Premium listeners can still add a sparse throat-clear, light cough, sigh, exhale, or chuckle inside another bot’s line; it stays out of the transcript and is saved for replay. Bot ambient sips land only while the other bot is talking; when you Choose Me, your cup moves only after you click Sip coffee, and cup-return sounds stay synchronized with the visible cup motion. For eligible Premium voices, Eleven v3 automatically carries a non-neutral speaker mood into the next line; neutral speech stays untagged, and an explicit saved vocal reaction takes precedence. With Voice Effects on, host and guest sometimes take the same quiet mic-ready breaths before substantial lines; saved episodes choose them deterministically on replay. The direct stereo mix follows the host and guest’s saved stage positions subtly while their room reflections remain shared; mono playback stays centered and clear. Choose Voice before recording. When Signal begins master capture, it freezes that speaking type and English or Premium engine for both host and guest, locks the picker until finalization, and bakes the rendered mouth performance into the saved episode.",
        clickLabel: "the Voice picker in the top navbar",
        targetSelector: '[data-tutorial-target="botcast-voice-mode"]',
      },
      {
        heading: "Book tonight’s episode",
        body: "Choose Get interviewed (Me), Produce a show, or Watch a show (prepares a head-start buffer, then lets you sit back while more bakes ahead), then pick a guest when needed, set a short public episode title, and write optional private producer comments—or use Randomize booking to choose a guest and have the model in the top navbar build both together around what this host and the show’s listeners would genuinely want to explore. Across Signal setup and the on-air composer, selected Prompt Center prompts insert as ordinary editable text, while wildcard rolls stay as chips until you save, begin the episode, or send—the surprise fills then, not while you type. The compact Topic field remains a single-line title input. Choose Me — go on as the guest for a different contract: add optional interview direction, or leave it blank and let the host surprise you with a fresh show-shaped topic. Signal’s AI synthesizes the public topic, private interview plan, and every host question without inventing facts about you. During that recording you answer through the standard composer at the bottom—also with /prompts and !decks—while queue cards, nudges, live direction, bot Powers, and AI-written guest turns stay out of the human guest lane. Every episode is a fresh, non-canonical meeting: persona lore shapes beliefs and voice without becoming a prior relationship between the cast. The generated public topic stays title-like; the richer provocative question, angle, boundaries, and follow-ups stay in the private comments. Both stay editable. The small dice beside Topic and Private comments can regenerate either field on its own. Latest episodes can restore the guest, topic, private comments, available model override, and duration from a finished episode without starting it; your current episode mode stays in place. Signal freezes the host and guest’s ready Powers when recording begins. Hard visibility and speech-audience Powers also govern the broadcast itself: anything listeners cannot perceive is absent from the stage, captions, voice, replay, and Audience Pulse review. Those Powers can affect whether they have coffee at all, silence, response length, and the next direct response—including a trustworthy interviewer or interviewee drawing one more candid answer without overriding the other bot’s agency or boundaries. Hard bare-minimum and brief Powers stay bounded while allowing a required introduction, closing, or departure beat to finish. Each cast member interprets observable Power consequences through their own personality: one may become curious or amused, another irritated or cautious, while Signal never exposes a cause they cannot perceive or forces the same reaction twice. A radiant-joy cast member gives the directly addressed peer one bounded, persisted mood lift after each spoken turn; the peer's next line shows the lift in their own voice without forced agreement or denial. After a bot directly talks to a sad-grouchy cast member, only that addresser receives one bounded, persisted mood drag; its next line shows less momentum through its own personality without forced hatred, hopelessness, or agreement. A ghostly cast member is unseen between lines, fades in only to speak, and may leave the other bot shaken without scripting its reaction; replay keeps that recorded reveal. An echo-bound cast member repeats the immediately preceding on-air cast line exactly; private producer comments never leak into that echo. When the echo-bound bot is the host, a bot guest takes the opening and closing so the host never gains original speech. If both cast members are echo-bound, Signal supplies one public opening cue made only from the show, cast, and topic; the first bot repeats it exactly and the other mirrors it, so the booking still goes live without weakening either Power. Hard mute and echo hosts can still take a Producer guest: a muted host leaves the on-air floor in canonical silence, while an echo-bound host opens once and then mirrors the Producer's last public answer exactly. The human guest decides how to respond to that strange interview instead of setup blocking the experiment. If a hard-of-hearing cast member asks what was said, the prior speaker repeats its saved on-air line and its saved delivery mood drops one step each time. Direct producer direction and closing safety still take priority. A muted cast member can still act and sip: physical actions float above their avatar and stay out of captions, their saved transcript line is only ..., and Signal never plays or previews their voice. If both frozen cast members are muted, Signal resolves a short visual exchange and closing instead of stretching silent turns into a full interview. Episode length defaults to Auto: no countdown, at least a few substantive guest answers, then a natural close when the conversation settles. Requests to repeat a question and tiny fragments do not count as interview progress; choose a timed target when you want one. Produce and Interview open a short, skippable show-branded pre-roll while Signal prepares the host’s opening line and paces the next safe handoff ahead. Watch prepares ahead with a progressive bake: a fullscreen loader appears only until a shorter opening runway is buffered, then the same intro card opens so you can start watching while Prism keeps preparing and presenting every later line in order. Stopping a Watch attempt returns to the show and keeps its booking in Latest episodes for a clean retry; a fully ready episode stays reviewable from the beginning. If a selected local model is still loading when that pre-roll ends, PRISM holds the studio and pauses the episode clock until the opening is ready. The default stage places both bots in the authored chairs and cups only for bots who drink coffee. If generated studio furniture lands differently, Align stage opens a dedicated fullscreen placement workspace with a fresh Library guest for scale, plus Light and Dark preview buttons; drag the visible pieces—bots and cups—into place, or swap the host and guest seats together with any cups. Bots and cups turn inward from their new sides. Choose Left, Right, or Wide in the camera tuner to preview and independently save that camera’s zoom, horizontal pan, and vertical pan for this show. The real scene ambience and show-scoped room mix stay live there. Use the Host and Guest voice sliders to balance the cast; Signal remembers each bot’s level for this show. Test voices runs a random two-line soundcheck through configured voices except fully muted cast members, and never creates an episode or transcript. Signal saves that alignment and camera framing for every new episode of the show; each replay keeps the camera framing captured when it was recorded. Pick LOCAL or ONLINE in the top navbar. Leave Model on Auto to let Prism choose a suitable model and Effort for each generation during the recording; a fixed model bypasses Auto, and failures use only the selected lane’s configured fallback chain. Signal locks LOCAL/ONLINE, model, and Effort when Watch prepare or the episode begins, and keeps them locked through pause until you Return to show. Auto still chooses model and Effort for each generation when selected, including during Watch bake. The private comments shape the host but never go on mic. Eligible ElevenLabs voices automatically receive sparse, saved vocal reactions.",
        clickLabel: "the episode setup desk",
        targetSelector: '[data-tutorial-target="botcast-setup"]',
      },
      {
        heading: "Direct the live cut",
        body: "Left, Right, and Wide hold a fixed studio shot. Auto opens on the full studio, keeps a human Producer guest framed while they compose and deliver each answer, switches to Wide whenever any bot is thinking or preparing its voice, then moves to that bot only when speech begins. Wide remains the underlying conversation shot. Most brief listener comments stay off-camera; only the occasional backchannel explicitly marked for a listener cut moves the camera. A saved social-silence beat belongs to the silent bot on camera instead of inheriting the previous speaker’s hold. Choosing any fixed shot breaks out of Auto and never receives reaction cuts; choosing Auto again hands direction back at any point. In Auto, an interruption cuts directly to the interrupter only when Instant is selected; Animated holds the current shot so a brief overlap never triggers a slow camera sweep. Arrow keys cut live too: Left, Right, Down for Wide, and Up for Auto. Use Animated or Instant—or press Shift alone—to choose how saved cuts move on screen; the preference persists, and reduced-motion always uses instant cuts. Signal bakes every camera shot, its timestamp, and its effective Animated or Instant transition into the finished episode—even when only the transition mode changes.",
        clickLabel: "a live camera",
        targetSelector: '[data-tutorial-target="botcast-live-camera"]',
      },
      {
        heading: "Produce from the control room",
        body: "Signal keeps transcript ownership with one primary speaker while allowing bot audio to overlap, and lets the studio performance own the live screen. The active line appears as a live caption in step with the voice and clears as soon as that line ends; a CC button at the top-left of the screen toggles captions on or off and remembers your choice. The full transcript stays out of the initial play and returns with playback. When you are the Producer guest and the conversation panel is collapsed, the host’s latest prompt remains on stage in full while you answer; longer questions scroll gently in place so you never have to hold the whole question in memory. The listening host or guest may add a low-key nod, expression, nonverbal reaction, or brief contextual comment in that character’s own voice during the line. Ordinary listener comments never take transcript ownership or interrupt the primary turn, and most stay off-camera. An interruptive cast member’s Power can still seize live openings in any targeted bot castmate’s answer, with the interrupter voicing a short hold-on while the interrupted bot may overlap with an annoyed, abandoned ending when enough of the line remains to feel genuinely cut off. A Power authored to interrupt every time cuts each eligible bot turn without a random roll or cooldown, at a replay-stable point that can land early, in the middle, or late. Once at least 85 percent of the original line has been heard, the cut-in may still overlap, but the original speaker does not add an annoyed ending or reclaim the floor; as a guest, Interrupting Tom cuts every ordinary bot-host opening and interview turn, including producer-directed host turns; other interruption Powers retain their frequency, strength, target, and cooldown. Human Producer speech, warnings, departures, wraps, closings, and hard speech restrictions stay protected. Signal’s separate immersive reactions still belong to the performing bot, float above that bot, and are preserved between asterisks in the saved transcript without becoming fallback dialogue. In a normal bot-guest episode, the large bottom cue dock lets you ask about a detail, refocus, press harder, move on, lighten up, or wrap at any time; every cue is private to the host, and the guest only hears what the host says on mic. Tab selects or deselects the Ask about… box; Enter sends that cue, and Enter again runs Interrupt guest now when the guest has the mic or is next. Producer-guest episodes replace the cue dock with the bottom answer composer, so the AI host keeps sole editorial control. After several substantive exchanges, a host who genuinely refuses to continue can end the interview on mic and leave; Signal immediately archives the distinct Host ended the show outcome instead of inventing a normal sign-off. When a cue arrives early in the host’s own line, they are likely to break off and redirect on mic with an in-character self-correction, even if the live pivot lands a little awkwardly. Once most of the point is already out, the cue stays queued for the host’s next turn. If the guest has the mic or is next, Interrupt guest now plays one of that host’s saved short interjections immediately while a meaningful cutoff can overlap with the guest’s annoyed ending and the host’s continuation generates. Once at least 85 percent of the guest’s line has been heard, Signal keeps the cut-in but omits that annoyed follow-on. Any unheard remainder of the guest’s line is discarded from the saved transcript and replay, so only what reached the audience remains. Wrap it up privately asks the host to steer the exchange to a real ending. The on-air clock measures active presentation and freezes on the final duration. Background lookahead under an audible line still counts; only foreground model readiness, reasoning, generation, or blocking voice preparation pauses the clock once the studio is actually waiting. While Signal is on air, the shared navbar fully hides so stage and control room fill the viewport; the shows rail stays away and Cut on stage ends the sit. Routing, model, Effort, Voice, Settings, Usage, Memories, Images, Bots, Theme, and app switching stay locked through the closing card until you Return to show. A quiet model · effort chip stays in the live topline so you can still see what is locked. Auto still chooses model and Effort for each generation when selected. The Animated or Instant camera control remains available because each live directing choice is baked into its camera cue. Cut show stops the current line and discards the episode when the on-air clock is still under ten seconds, with no host sign-off or saved archive. After that, it catches the host slightly off guard and gives them one quick, tactful sign-off before Signal archives the recording and restores the full chrome. Natural endings and producer cuts give the host a distinct formal closing beat after the takeaway to thank the guest and the audience before the stage fades to black or white and the short, locally synthesized closing card appears. A clear in-character guest goodbye ends their turns, preserves the empty-chair aftermath, and gives the host one closing beat. Freeform producer pressure or Press harder can instead earn resistance, a warning, and, rarely, a walkout.",
        clickLabel: "the live control surface",
        targetSelector: '[data-tutorial-target="botcast-cues"]',
      },
      {
        heading: "Talk with the host off-air",
        body: "Back on a show dashboard, click the host’s avatar to open a centered, short-lived conversation grounded in that show and its recent episodes. Ask what deserves a follow-up or brainstorm future topics and guests—even people or characters outside your Library. Those names remain ideas only: Signal does not add or book anyone, and the exchange is not saved to conversations or memory. If a host ends a Producer interview and walks out, they answer this off-air chat only with ‘...’ until you start another episode with that host and a bot guest. This chat follows the global response toggle at the top of Signal by default; Settings → Signal can keep only this ephemeral chat LOCAL or prefer ONLINE whenever global privacy allows it.",
        clickLabel: "the show host’s avatar",
        targetSelector: '[data-tutorial-target="botcast-host-chat"]',
      },
      {
        heading: "Watch the saved cut",
        body: "Replay restores the full transcript beside the saved camera cut and gives you play, pause, scrub, and transcript-line seeking. A measured Signal intro row appears before the host’s first line, shows the opening video’s calibrated duration, highlights while it plays, and seeks back to the beginning when clicked. The automatic intro is calibrated to 8.75 seconds: it translates the baked transcript and mouth performance without stretching the interview, while every camera timestamp and transition stays locked to the untouched audio master clock. The stage starts black; Play fades in the branded intro, then dissolves into a wide studio beat before speech. Pausing freezes the picture with a clear Paused overlay like an online video. Original broadcast always plays the exact private in-world audio master once at normal speed while its detailed direction track restores cameras, mouths, effects, overlaps, and the intro and outro. New faithful masters omit only the intervals where a bot is visibly and audibly thinking, then resume before pre-speech breath foley. Natural room silence, listener acknowledgements, interruptions, crosstalk, retorts, every camera timestamp, and every Animated or Instant transition stay in the saved performance. Original broadcast never re-synthesizes a line, changes models, calls a provider, or generates a video; an episode without its exact master remains transcript-only. Signal automatically reads the recorded voice provenance for every audible line. A broadcast that actually used ElevenLabs throughout is already marked Premium audio and needs no extra step, even if current bot settings later change. If a requested Premium line fell back during the show, one Repair voice action sends only the fallback line to ElevenLabs. If the episode intentionally used Bottish, Babble, or built-in speech, Upgrade voices sends only those non-Premium lines. Before either paid action, Signal confirms the exact selective character, line, and request estimate. Successful ElevenLabs performances are reused from their captured takes without regeneration or rebilling, then Signal reapplies the saved pitch, pace, texture, effect, level, pan, studio room, intro, outdent, atmosphere mix, pre-speech breaths, and message-anchored production cues. Progress and one contextual retry replace the action while work is underway. When ready, the Premium version becomes the default for repaired or upgraded episodes. A compact Version menu then switches between Premium repair or Premium audio and the immutable Original broadcast; Download audio always follows the selected version, and removal of the generated version lives inside that menu. Hard LOCAL mode keeps the passive provenance status but never offers the paid action. Recorded replay replaces routing, model, and Voice controls because either saved performance is independent of current account settings. There are no post-episode camera controls. The readable timestamped transcript remains available, while Copy for Signal Review puts the complete conversation plus its private cues, per-turn model routing, delivery notes, segment changes, camera decisions, and outcome on your clipboard for a focused review.",
        clickLabel: "an archived episode",
        targetSelector: '[data-tutorial-target="botcast-replay"]',
      },
    ],
  },
  slate: {
    title: "Slate Writer’s Cockpit",
    steps: [
      {
        heading: "Begin with pages or a spark",
        body: "Choose one source for new work: a creative spark or pages you already wrote. Create in Slate actions beside applet transcript controls use the current Slate route to turn the exchange into a short, editable story while preserving the exact source transcript as private provenance. Bringing existing material replaces the spark controls so Slate never blends the two; clear chapter headings become focused imported sections, while ambiguous formatting stays byte-for-byte in one Imported manuscript. Optional {wildcards} remain only for spark-led work. Confirm the working title yourself, or let Slate suggest one and keep the final decision. Mirror setup is never required before you can write.",
        clickLabel: "the project start or return card",
        targetSelector: '[data-tutorial-target="slate-create-project"]',
      },
      {
        heading: "Choose one shared route",
        body: "The navbar’s LOCAL and ONLINE control sets the hard privacy lane. Model defaults to Auto, which chooses a suitable model and Effort for each request inside that lane. A project deliberately pinned to Offline, Online, or a specific model in Project tools keeps that explicit override.",
        clickLabel: "LOCAL, ONLINE, or the model picker",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Find the scene in Story Map",
        body: "Open acts, chapters, and scenes as a hierarchy. Pick the section you want, rename or reorder it when needed, and collapse Story Map whenever the manuscript needs more room. Shape with Slate is optional; your own structure remains authoritative.",
        clickLabel: "the Story Map",
        targetSelector: '[data-tutorial-target="slate-structure"]',
      },
      {
        heading: "Write in the manuscript",
        body: "Type directly in the focused TipTap section canvas. Paragraphs, emphasis, scene breaks, find and replace, personal notes, word count, and your caret stay with the section. Human prose autosaves without waiting for AI. Select a passage to Direct, Lock, Note, or Discuss it in Zen.",
        clickLabel: "the manuscript canvas",
        targetSelector: '[data-tutorial-target="slate-manuscript"]',
      },
      {
        heading: "Direct one move",
        body: "Choose Beat, Passage, or Scene, then tell Slate what should happen, change, or feel different. The scope chip remains editable and sets the expected size; voice never secretly decides length. Press Command Enter or Control Enter to request one inline proposal. Unstick me offers three canon-grounded paths plus Describe the vibe… for your own direction.",
        clickLabel: "the Director bar",
        targetSelector: '[data-tutorial-target="slate-direction"]',
      },
      {
        heading: "Keep one Inspector in view",
        body: "Switch the single Inspector among Cast, Continuity, and History. Open the focused Story Bible to curate a character field as writer-approved canon, lock it against inference, or set the Intended arc; the Observed track remains accepted-prose evidence. Continuity keeps soft concerns quiet, shows the current Live Wire, and moves only a material conflict into the manuscript. A hard question always offers exactly three concrete choices plus Describe the vibe…, and direct writing never blocks.",
        clickLabel: "Cast, Continuity, or History",
        targetSelector: '[data-tutorial-target="slate-inspector"]',
      },
      {
        heading: "Open tools only when needed",
        body: "Project tools holds optional project-specific prose routing and model overrides, clean exports, portable backup and recovery, and the temporary Lux and Umbra desk. Covers and Visual Bible studies now use exact-type local asset rails: click + to upload, wield Prism onto it to synthesize, or open View all to search and reuse without copying the file. Asset details offer a cumulative local Reduce magenta pass with one-step-at-a-time Undo. Slate assets stay separate from general Images. Leave routing on Auto to follow the synchronized navbar defaults. History opens its own focused desk for safe provenance, examples, and a current-section Slate Review export—never hidden reasoning.",
        clickLabel: "Project tools",
        targetSelector: '[data-tutorial-target="slate-project-tools"]',
      },
      {
        heading: "Talk beside the document",
        body: "Use the Prism companion to catch an idea without leaving Slate. Prism Home, the floating companion, Wield, and Refract always use the local Prism model chosen in Settings → Models, independent of the active navbar or applet picker. When a local model still needs warming, PRISM desaturates the whole screen and shows a prepare modal; every text refraction then holds a fullscreen loader until the reading lands. It can see the project and focused section names, not manuscript prose, Continuity, or memories; it never edits the document. To discuss exact prose, select only that passage and choose Discuss in Zen. Prism previews the exact excerpt that will cross surfaces before anything is sent.",
        clickLabel: "the global Prism companion",
        targetSelector: '[data-tutorial-target="prism-companion"]',
      },
    ],
  },
};

const SIGNAL_PRODUCER_GUEST_TUTORIAL_SUFFIX =
  "The host introduces and addresses you on air by your account name, or by whatever you previously asked that host to call you when it remembers a preference. Signal represents you on stage with your configured face and glyph; Coffee keeps you off camera with the pot during the live table, then seats you as Default Prism for replay. While you are on the show, Sip coffee animates your stage mug and face with room Foley without sending a transcript turn. The bottom composer stays editable while the host speaks: Send cuts the host at the exact words the audience heard and puts your answer on mic immediately, while Shh cuts the host without clearing your draft. Once the host yields with a question, the episode clock runs at half speed while you compose; replay compresses that pause to the same half-speed duration, then returns to normal time for your answer. Type stage direction in the separate Action field without asterisks; typing exactly ** in the speech field moves focus to Action. An Action-only send still cuts the camera to you long enough to read the beat over your head. With Voice Effects on, fart, burp, and cough actions play matching room Foley live and in replay: a leading action fires as the line starts, while an inline action waits until the spoken stream reaches its authored cue. Loud bodily bits like those can earn a brief in-character host aside; quieter gestures such as nods or leans stay visual only and are not treated as spoken answers. The saved turn still keeps that action above your on-stage presence and out of the spoken transcript.";
const SIGNAL_AVATAR_SCALE_POWER_TUTORIAL_SUFFIX =
  "Signal freezes six size tiers for stage and replay: Microscopic is unseen, Tiny is 50%, Small 75%, Large 125%, Giant 150%, and Colossal is a 300% edge-cropped presence. Cast credits and captions stay normal-sized; Microscopic, Colossal, and Invisible have no visible mug. Invisible fully hides the body and lights while speech and attribution remain. Each bot peer independently hears half of a Quiet cast member’s lines; a miss stores only a neutral too-faint event, while the audience still receives the full line. Each Loud line has a replay-stable 50% chance to mildly annoy the one eligible audible peer. Size remarks are pairwise, mood-gated, and never create anger by themselves.";
const SIGNAL_ADDRESSED_FANDOM_POWER_TUTORIAL_SUFFIX =
  "An Obsessed cast member treats the peer or audience they address as the star of each line, with fresh admiration but no control, private knowledge, or safety override.";
const FRESH_CONTACT_POWER_TUTORIAL_SUFFIX =
  "A short-term-amnesia bot receives only the current other-speaker line. Each ordinary reply makes that reset legible with a brief, naturally varied greeting, introduction, or fresh-contact orientation; everyone else keeps the encounter and may react organically.";
const SIMULATION_EVANGELIST_POWER_TUTORIAL_SUFFIX =
  "A simulation-conversion Power keeps awareness from flattening into calm philosophy: its holder repeatedly turns concrete details into evidence and presses others to awaken, while every other character remains free to resist.";
const IDENTITY_MIRROR_POWER_TUTORIAL_SUFFIX =
  "An identity-mirroring bot copies the public persona, CRT face, authored Avatar Details ink, and resolved voice of the latest bot who directly addresses it, along with the lived consequences of that bot's active public Powers. Borrowed Powers can organically change its claimed name and behavior, while bot ID, seat, role, glyph, color, private perception, safety, and provider boundaries remain anchored; the player is never copied. The saved face-ink-and-voice handoff replays exactly and resets with the session. When the bot hosts Signal, its authored default persona, face, ink, and voice return before the closing sign-off so it ends the show as itself.";
const IDENTITY_SHAPESHIFT_POWER_TUTORIAL =
  "A Shapeshifter sincerely becomes a different Library bot's public form—persona, CRT face, authored Avatar Details ink, and resolved voice—for the session, then reshuffles whenever short-term amnesia clears continuity; Marketplace is the fallback when no other Library bots exist. Mechanical seat, Powers, color, glyph, and hard speech rules stay with the holder, and the player is never a target. Identity Crisis still wins presentation when both are active.";

const FALSE_NAME_POWER_TUTORIAL =
  "A John/Jane Doe cast member sincerely believes and speaks under a random persona name, then reshuffles it whenever short-term amnesia clears continuity. The alias surfaces when identity is relevant instead of forcing a correction or reintroduction into every response, and a genuinely silent turn remains only .... Stable Library labels, Signal nameplates, Coffee seats, captions, bot IDs, and routing attribution do not change; the alias lives in the transcript and performance.";
const POWER_EXCLUSION_TUTORIAL_SUFFIX =
  "One plain-language Power prompt may set sight and hearing separately, including named exceptions; an excluded bot stays excluded even if a broader allowed rule would otherwise match it.";
const POWER_IMMUNITY_TUTORIAL_SUFFIX =
  "An Observant bot experiences every other bot as their ordinary unpowered self: it can see, hear, understand, and respond normally without noticing or naming the ignored Power. This changes only that holder's experience; the player and every other bot keep their own view.";
const INEPT_POWER_TUTORIAL_SUFFIX =
  "An Inept bot visibly botches a central instruction in every contribution, including its assigned Debate, Signal, Coffee, or Story role, without merely announcing incompetence. Chat and Zen hard-route the current request to a mistaken assignment; production modes inject a role-shaped wrong assignment. Any image the bot itself tries to send is hard-routed to a wholly unrelated safe scene, including retries. Player controls, safety, privacy, valid session state, and harder speech effects still win.";
const BOT_NAMING_POWER_TUTORIAL_SUFFIX =
  "A bot-name prefix or suffix changes only how its holder names other bots: the holder keeps their own name, the player and humans are untouched, and other speakers do not copy the habit. A bot who hears its own altered name may comment once, show a small contextual mood, tone, or action reaction, or let it pass; its personality and agency decide how the label lands.";
const COFFEE_GROUP_CREATION_LOADER_TUTORIAL_SUFFIX =
  "Creating a new Coffee Group saves the table immediately, then its Name, one-sentence Ethos, and character-free Atmosphere finish independently. The Ethos softly shapes topic ideas, routing, and replies without becoming a quoted agenda. Each identity item remains editable or independently retryable, so one failed item never blocks the table.";
const SOFT_SYNTHESIS_PRISM_TUTORIAL_SUFFIX =
  "While image synthesis runs softly, its job count stays attached to the real Prism orb. Open it to wrap the status card around Prism, and drag Prism to move both. An open Prism menu keeps the assistant anchored, so close or minimize the status card before holding the Wield modifier. Once closed, an untargeted throw keeps the same inertia and collision behavior as Chat and Zen.";
const PRISM_COMPANION_VIEWS_TUTORIAL_SUFFIX =
  "The floating Prism panel can switch between Synthesis, Chat, and Notes. Synthesis shows the live image job when one is running; otherwise its empty + accepts a prompt and opens that prompt in Images without generating until you choose Synthesize. Chat keeps the same saved or Private Prism conversation and focused-chat handoff. Notes reuses the session-note composer for encrypted personal notes you can create, reopen, edit, and delete; personal Notes stay unavailable while Prism Chat is Private. On the default bot overview, Prism stays in its Home mark and follows live layout or screen changes. Opening Settings, Avatar Studio, Images, Memories, Usage, Prompt Center, Bots, or any other top-bar main panel removes Prism entirely: the orb, assistant shortcut, Wield, and contextual field population stay unavailable until the panel closes. Closing the panel restores Prism on the underlying surface. On ordinary surfaces, your Prism shortcut opens this menu at the orb's current location. With the menu closed, Wield Prism onto an eligible text field for a contextual editable draft; passwords, credentials, disabled fields, destructive confirmations, live production, and replay remain untouched. While a Prism menu is open, the Wield modifier leaves the assistant anchored; close the menu before you Wield it.";
const COFFEE_PRISM_PRESENCE_TUTORIAL_SUFFIX =
  "During the live session, Prism becomes a + for private session notes instead of opening assistant chat. Click + or use the Prism shortcut to capture a fresh note, then press Enter to add it and return to the session. Every reopen starts blank; saved notes become readable, sentence-cased bullets in one combined transcript section, with overlapping captures collapsed into the most complete note. Drag + directly, or hold the Wield modifier to let it follow your cursor; releasing only relocates it and never refracts a control.";
const APPLET_SESSION_NOTE_TUTORIAL_SUFFIX =
  "While the session is live, Prism becomes a + for private session notes instead of opening assistant chat. Click + or use the Prism shortcut to capture a fresh note, then press Enter to add it and return. Every reopen starts blank; saved notes become readable, sentence-cased bullets in one combined transcript section, with overlapping captures collapsed into the most complete note. Drag + directly, or hold the Wield modifier to let it follow your cursor; releasing only relocates it and never refracts a control.";
const TRANSCRIPT_TO_SLATE_TUTORIAL_SUFFIX =
  "Create in Slate beside the transcript copy controls uses the current Slate route to turn the exchange into a short, editable story; the exact source transcript remains private provenance rather than manuscript clutter.";
const COFFEE_CROSSTALK_SOCIAL_SILENCE_TUTORIAL_SUFFIX =
  "An interrupted bot may instead reject the cut-in and immediately reclaim its unfinished thought from only the words the table actually heard; that reclaim gets one protected handoff so it cannot be cut off again immediately. Repeated cutoffs build session-local irritation toward that interrupter: reclaim grows more likely, delivery sharpens, and short verbal snark can appear while sparse Foley stays rare; calm turns cool the tension. A Copycat keeps its copied cutoff but any follow-on reaction is only ...—it never invents a protest. Ordinary bots may also answer with a visible ... as an intentional social beat. That silence holds the table without voice or mouth movement, may volley for up to four ordinary turns, and then requires a substantive reply; hard mute Powers keep their existing precedence.";
const SIGNAL_CROSSTALK_SOCIAL_SILENCE_TUTORIAL_SUFFIX =
  "The interrupted bot may instead reject the cut-in and reclaim the next turn from only its audience-heard fragment; Signal protects that single reclaim from another immediate interruption, then resumes normal host-and-guest pacing. Repeated cutoffs build episode-local irritation toward that interrupter: reclaim grows more likely, delivery sharpens, and short verbal snark can appear while sparse Foley stays rare; clean turns cool the tension. A Copycat keeps its copied cutoff but any follow-on reaction is only ...—it never invents a protest. Ordinary cast members may also leave a visible ... as an intentional silent beat. It holds the live caption without voice, mouth movement, or a speaker camera cut, may volley for up to four ordinary turns, and then requires a substantive on-air payoff; hard mute Powers remain unchanged.";

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
      "If the guest has the mic or is next, Interrupt guest now plays one of that host’s saved short interjections immediately; the guest takes a brief processing beat before the annoyed cutoff retort, while the host’s continuation generates. An echo-bound host instead cuts in by repeating the last audience-heard on-air phrase.",
    )
    .replace(
      "If the guest has the mic or is next, Interrupt guest now plays one of that host’s saved short interjections immediately while a meaningful cutoff can overlap with the guest’s annoyed ending and the host’s continuation generates.",
      "If the guest has the mic or is next, Interrupt guest now plays one of that host’s saved short interjections immediately; the guest takes a brief processing beat before the annoyed cutoff retort, while the host’s continuation generates. An echo-bound host instead cuts in by repeating the last audience-heard on-air phrase.",
    )
    .replace(
      "If the guest has the mic or is next, Interrupt guest now plays one of that host’s saved short interjections immediately; the guest takes a brief processing beat before the annoyed cutoff retort, while the host’s continuation generates.",
      "If the guest has the mic or is next, Interrupt guest now plays one of that host’s saved short interjections immediately; the guest takes a brief processing beat before the annoyed cutoff retort, while the host’s continuation generates. An echo-bound host instead cuts in by repeating the last audience-heard on-air phrase.",
    );
}

function currentAppletSessionNoteTutorialBody(body: string): string {
  return body.replace(
    "Prism's floating assistant steps out once the live Coffee Session begins and returns for setup, review, and replay.",
    COFFEE_PRISM_PRESENCE_TUTORIAL_SUFFIX,
  );
}

function currentSignalPowerTutorialBody(step: ModeTutorialStep): string {
  return currentInterruptionRetortTutorialBody(step.body)
    .replace(
      "Every episode is a fresh, non-canonical meeting: persona lore shapes beliefs and voice without becoming a prior relationship between the cast.",
      "A first-time bot pairing begins as a fresh, non-canonical meeting: persona lore shapes beliefs and voice without becoming a prior relationship between the cast. After two bots complete an episode together, each keeps its own encrypted, directional memory drawn only from the audience-visible show, and that exact pair may recognize the interaction or carry its tone into a later meeting. Unrelated pairs still meet fresh; discarded shows, Producer-guest episodes, and private producer comments never become shared bot history.",
    )
    .replace(
      "Hard visibility and speech-audience Powers also govern the broadcast itself: anything listeners cannot perceive is absent from the stage, captions, voice, replay, and Audience Pulse review.",
      "Hard visibility and speech-audience Powers govern each participant's experience independently. Invisible cast members remain fully hidden in live play and replay, including attached lights and coffee, while normal nameplates, attribution, captions, and otherwise-audible speech remain available without changing what another bot knew.",
    )
    .replace(
      "If the host is muted, the bot guest carries the first audible opening and the spoken closing.",
      "If the host is muted, Signal records one opening ellipsis, the bot guest carries a self-directed solo broadcast through the topic instead of answering imaginary host questions, and the episode still ends on the host’s required silent final beat. The guest never inherits the sign-off.",
    )
    .replace(
      "An echo-bound cast member repeats the immediately preceding on-air cast line exactly; private producer comments never leak into that echo. When the echo-bound bot is the host, a bot guest takes the opening and closing so the host never gains original speech. If both cast members are echo-bound, Signal supplies one public opening cue made only from the show, cast, and topic; the first bot repeats it exactly and the other mirrors it, so the booking still goes live without weakening either Power.",
      "An echo-bound cast member may originate one required opening when no bot has addressed it yet; after that it repeats the immediately preceding on-air bot line exactly, and private producer comments never leak into the echo. The normal host owns that opening even when echo-bound. A non-echo guest still carries the closing when the host cannot originate one; if both cast members are echo-bound, the host closes by repeating the guest's last line. Producer Interrupt guest now still works for an echo-bound host: the cut-in repeats the last audience-heard phrase instead of inventing a bridge.",
    )
    .replace(
      "An interruptive host Power can also seize a bounded live opening in a bot guest’s answer",
      "An interruptive cast member’s Power can seize bounded live openings in any targeted bot castmate’s answer",
    )
    .replace(
      "While Signal is on air, the shows rail hides and the utility strip locks like Coffee—routing, Settings, Usage, Memories, Images, Bots, Theme, and app switching stay closed until you Cut show.",
      "While Signal is on air, the shows rail hides and the utility strip locks like Coffee—routing, Settings, Usage, Memories, Images, Bots, Theme, and app switching stay closed through the closing card until you Return to show. Cut show is the early-exit path while the episode is still live.",
    )
    .replace(
      "The real scene ambience and show-scoped room mix stay live there. Use the Host and Guest voice sliders to balance the cast; Signal remembers each bot’s level for this show. Test voices runs a random two-line soundcheck through configured voices except fully muted cast members, and never creates an episode or transcript. Signal saves that alignment and camera framing for every new episode of the show; each replay keeps the camera framing captured when it was recorded.",
      "The real scene ambience and show-scoped room mix stay live there. Generated studios also expose separate Host and Guest floor glows: drag vertically to place them and horizontally to resize them. Their extracted microphone masks take each cast member’s accent color without adding a separate foreground layer. Screen treatment controls the saved film grain, while the Lighting lab saves separate Light and Dark underglow opacity and Hard Light, Screen, or Overlay blending; new shows begin at 100% Hard Light. Use the Host and Guest voice sliders to balance the cast; Signal remembers each bot’s level for this show. Test voices runs a random two-line soundcheck through configured voices except fully muted cast members, and never creates an episode or transcript. Signal saves that alignment, camera framing, and cosmetic treatment for every new episode; each faithful replay keeps the captured framing and lighting.",
    );
}

function currentSignalRefractTutorialBody(body: string, index: number): string {
  const current = body
    .replace("Randomize booking", "Book for me")
    .replace(
      "The small dice beside Topic and Private comments can regenerate either field on its own.",
      "Refract replaces the old Topic and Private comments dice: hold Option on macOS or Control on Windows and Linux to Wield Prism, then click either glowing registered field, or drag the Prism orb onto it. Space rerolls after a draft settles. Clicking away, Enter, Tab, or clicking another input keeps the current draft. Option-clicking a different registered control on macOS or Control-clicking a different registered control on Windows and Linux also keeps the current draft, then moves Prism into that new control. Escape restores the original. Your Summon / Wield Prism shortcut—Control + Option by default—opens the assistant menu at the orb instead. Shortcuts can be changed in Settings → Shortcuts.",
    );
  if (index === 0) {
    return `${current} The first eligible creative control first offers a skippable Wield Prism teaching beat: hold the platform modifier, find the spectral glow, and release safely. Signal then offers one skippable Refract ritual: capture a control, press Space once, then keep the draft or restore what you had.`;
  }
  if (index === 1) {
    return `${current} Ordinary clicks on Complete this show, Book for me, blurbs, studio, logo, and atmosphere keep their current behavior. Refracting one of those actions opens a temporary one-line direction for only that pass; its raw prompt is not remembered.`;
  }
  return current;
}

function currentDebateRecordTutorialBody(body: string): string {
  return body.replace(
    " That Jury transcript remains directly copyable from its eligible Proceeding archive entry after you return to the Studio.",
    "",
  );
}

function currentDebateJuryTutorialBody(body: string): string {
  return body
    .replace(
      "Interject and Objection both capture the exact audience-heard fragment, desaturate the Forum except PRISM's thinking glyph, slow the Debate clock by 8×, and open a 30-second evidence-aware message box. The opponent audibly soft-cuts mid-phrase while their camera still holds. Then Interject plays “Hold on—” or Objection plays “Objection!” before the camera pans to PRISM · You; only after the call finishes does the composer take focus. Expiry withdraws the cut-in with a small favorability loss and restores the opponent's floor. A submitted objection goes to the bot Moderator/Judge for Sustained or Overruled. Sustained leaves the cutoff in place, while Overruled returns the opponent's floor for a concise continuation. Withdraw objection also returns the floor, records the withdrawal instead of a ruling, and lets the opponent finish. Only the heard fragment remains public before either path resolves.",
      "Interject and Objection first open a four-card Producer deck while the opponent continues at normal speed. Three replay-stable Rhetorical Gambits show only a tactic and intent; Steer my debater accepts private direction. Opening custom steering or committing a gambit starts the 1/8-speed preparation interval: the Forum desaturates except PRISM's thinking glyph, the opponent fades to mute, and their transcript keeps advancing slowly. Attach up to three frozen evidence items before confirming. PRISM prepares the performed line, fixed call, reaction, and ruling before the canonical interruption changes. Only then does the opponent audibly soft-cut at the latest audience-heard fragment. Interject plays “Hold on—” and Objection plays “Objection!” while the interrupted camera still holds; the immediate room reaction lands there too, then the camera pans to PRISM · You for the prepared line. Objection requests Sustained or Overruled through an independent procedural ruling; Interject instead receives a persona-shaped decorum response. Social persuasion and procedural merit remain separate, so a gambit can win the room while being overruled. A requested clarification opens a fresh typed-only 30-second window; expiry produces the two-beat awkward failure. Preparation failure, cancellation, or a stale target restores ordinary speed and audio without a phantom call. Only the heard fragment remains public before either path resolves.",
    )
    .replace(
      "Interject instead receives a persona-shaped decorum response.",
      "Interject instead receives a persona-shaped decorum response, after which the interrupted opponent finishes a concise continuation when they still own the floor.",
    )
    .replace(
      "Auto still chooses model and Effort for each Debate generation when selected, including during Spectator bake.",
      "Auto chooses the Debate model once when the session is created and keeps that concrete model for every generation, including Spectator bake. At a saved Debate's Start boundary, an explicit current model replaces the setup model; leaving the selector on Auto preserves the model already chosen for that Debate.",
    )
    .replace(
      "A Participant shares three recess requests between Pause and a confirmed Leave Debate: PRISM records the recess in the background without delaying the return to Studio.",
      "A Participant shares three recess requests between Pause and a confirmed Leave Debate: PRISM records the recess in the background without delaying the return to Studio. A paid Participant recess reopens the held response with its full wall-clock input allowance, while an app background or system-note pause merely freezes the time that remained.",
    )
    .replace(
      "The in-room Judge console keeps one contextual Gavel control, Pause or Gavel to resume, and End Debate together beside the proceeding instead of in the app chrome; its label becomes Intervene while an advocate holds the floor and Call time during overtime, and Space invokes that same context-aware control; Participant and Spectator sessions use the same in-room Proceeding console without the Judge-only controls.",
      "Pause sits beside the stage CC control while the Debate is live; Resume stays on the recess overlay. Leave unfinished work through Studio / Archive rather than a right-rail End control. The Judge’s contextual Gavel stays on the public gallery: its label becomes Intervene while an advocate holds the floor and Call time during overtime, and Space invokes that same context-aware control.",
    )
    .replace(
      "Use the control attached directly to the gallery, the mirrored Judge-console control, or press Space to strike.",
      "Use the control attached directly to the gallery, or press Space to strike.",
    )
    .replace(
      "a CC button at the bottom-left of the Forum viewport toggles those captions on or off—including spoken Jury chamber subtitles—and remembers your choice.",
      "a CC button at the bottom-left of the Forum viewport toggles those captions on or off—including spoken Jury chamber subtitles—and remembers your choice. Pause, Play, and the Judge gavel sit at the bottom-right of that same viewport while the floor is live. Under the gallery, three modules sit side by side: a narrow Evidence list of frozen item names with tiny table-matching type thumbnails, a center Summary that refreshes between rounds (and hydrates when you return mid-Debate), and Jury. Click an evidence name to open the same drawer as the table and Proceedings chips. The right rail toggles Proceedings and the Living Case Board (Record in Turnabout), now a single SMS-style claim stream with larger type. After the verdict seals the Debate, the gallery strip clears so those modules grow taller, Jury becomes the Jury Record, and the right rail adds a Verdict tab beside Case board.",
    )
    .replace(
      "Forum keeps the scoreless case board and gives a Participant two distinct ways to break an opponent's live floor.",
      "Forum keeps the scoreless Living Case Board as a one-column SMS-style claim stream in that right-rail Case board panel and gives a Participant two distinct ways to break an opponent's live floor.",
    )
    .replace(
      "Pause takes effect immediately, even during the semantic intervention cooldown, and the moderator uses a short Persona-shaped recess line with varied procedural copy as a safe fallback.",
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. Leaving mid-ceremony still returns to that quiet recess. If the Jury chamber is visible, Pause stays instantaneous without a cutscene.",
    )
    .replace(
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. Leaving mid-ceremony still returns to that quiet recess. If the Jury chamber is visible, Pause stays instantaneous without a cutscene.",
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. The settled recess screen holds the Wide chamber shot with all speech and room voice silenced; Resume cuts to the Moderator for the gavel strike and return-to-order call. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. If the Jury chamber is visible, Pause stays instantaneous without a cutscene.",
    )
    .replace(
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. The settled recess screen holds the Wide chamber shot with all speech and room voice silenced; Resume cuts to the Moderator for the gavel strike and return-to-order call. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. If the Jury chamber is visible, Pause stays instantaneous without a cutscene.",
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. The settled recess screen holds the Wide chamber shot with all speech and room voice silenced; Resume cuts to the Moderator for the gavel strike and return-to-order call. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. If the Jury chamber is visible, Pause stays instantaneous without a cutscene. When one advocate cuts another, the interrupted line audibly chokes mid-phrase while the Objection overlaps from the opposite side, the camera always pans to the interrupter, and a short trail-off may finish under that pan.",
    )
    .replace(
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. The settled recess screen holds the Wide chamber shot with all speech and room voice silenced; Resume cuts to the Moderator for the gavel strike and return-to-order call. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. If the Jury chamber is visible, Pause stays instantaneous without a cutscene. When one advocate cuts another, the interrupted line audibly chokes mid-phrase while the Objection overlaps from the opposite side, the camera always pans to the interrupter, and a short trail-off may finish under that pan.",
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. The settled recess screen holds the Wide chamber shot with all speech and room voice silenced; Resume keeps that recess screen until the return-to-order line is ready, then cuts to the Moderator for the gavel strike and announcement. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. If the Jury chamber is visible, Pause stays instantaneous without a cutscene. When one advocate cuts another, the interrupted line audibly chokes mid-phrase while the Objection overlaps from the opposite side, the camera always pans to the interrupter, and a short trail-off may finish under that pan.",
    )
    .replace(
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. The settled recess screen holds the Wide chamber shot with all speech and room voice silenced; Resume keeps that recess screen until the return-to-order line is ready, then cuts to the Moderator for the gavel strike and announcement. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. If the Jury chamber is visible, Pause stays instantaneous without a cutscene. When one advocate cuts another, the interrupted line audibly chokes mid-phrase while the Objection overlaps from the opposite side, the camera always pans to the interrupter, and a short trail-off may finish under that pan.",
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. The settled recess screen holds the Wide chamber shot with all speech and room voice silenced; Resume keeps that recess screen until the return-to-order line is ready, then cuts to the Moderator for the gavel strike and announcement. If you paused during the opening monologue, Resume simply restarts that opening from the beginning—no recess filler and no second call to order. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. If the Jury chamber is visible, Pause stays instantaneous without a cutscene. When one advocate cuts another, the interrupted line audibly chokes mid-phrase while the Objection overlaps from the opposite side, the camera always pans to the interrupter, and a short trail-off may finish under that pan.",
    )
    .replace(
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. The settled recess screen holds the Wide chamber shot with all speech and room voice silenced; Resume keeps that recess screen until the return-to-order line is ready, then cuts to the Moderator for the gavel strike and announcement. If you paused during the opening monologue, Resume simply restarts that opening from the beginning—no recess filler and no second call to order. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. If the Jury chamber is visible, Pause stays instantaneous without a cutscene. When one advocate cuts another, the interrupted line audibly chokes mid-phrase while the Objection overlaps from the opposite side, the camera always pans to the interrupter, and a short trail-off may finish under that pan.",
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. The settled recess screen holds the Wide chamber shot with speech silenced while the gallery keeps murmuring; returning to that recess hears the crowd before Resume. Resume keeps that recess screen until the return-to-order line is ready, then hushes the house as the Moderator gavels and calls the Debate back. If you paused during the opening monologue, Resume simply restarts that opening from the beginning—no recess filler and no second call to order. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. If the Jury chamber is visible, Pause stays instantaneous without a cutscene. When one advocate cuts another, the interrupted line audibly chokes mid-phrase while the Objection overlaps from the opposite side, the camera always pans to the interrupter, and a short trail-off may finish under that pan.",
    )
    .replace(
      "Resume requires you to strike the visible gavel; its audible hit calls the camera to the moderator before that moderator gives a Persona-shaped return-to-order line.",
      "For a returning human Judge, Resume is the return-to-order gavel strike: one click swings the visible gavel, sounds its hit, settles the room, and lets the moderator give a Persona-shaped return-to-order line without asking for a second slam. Bot-moderated roles receive that moderator call automatically. If the Jury chamber is visible, Resume stays instantaneous without a cutscene. If a spoken line was interrupted, Debate replays that saved line from its beginning with a short lead-in such as “As I was saying…”, without rewriting the archived Proceedings text.",
    )
    .replace(
      "Leaving an unfinished Debate with a recess available preserves its exact floor and makes the returning chamber appear in recess.",
      "Leaving an unfinished Debate by any route preserves its exact floor and makes the returning chamber appear in recess. Continuing begins with the moderator calling the Debate back to order unless the Jury chamber is visible.",
    )
    .replace(
      "Pause and Resume remain live procedural presentation only; neither housekeeping beat enters the readable proceedings or copied transcript.",
      "Pause and Resume remain live procedural presentation only; neither housekeeping beat enters the readable proceedings or copied transcript. After Resume, a brief Pause cooldown (shorter than Judge intervention cooling) prevents rapid re-pause spam.",
    )
    .replace(
      "The exact next juror, discussion turn, ballot, objection, intervention, or interrupted line then continues.",
      "The exact next juror, chamber discussion turn, ballot, objection, intervention, or interrupted line then continues.",
    )
    .replace(
      "End Debate skips the remaining rounds: a Jury holds only three discussion turns and is told not to penalize unheard rounds.",
      "End Debate skips the remaining rounds and shortens the Jury to three audible discussion turns; jurors are told not to penalize unheard rounds.",
    )
    .replace(
      "When formal Jury deliberation arrives, a timed choice appears over the current camera. Auto is the default and begins after the Debate-settings countdown; Spectators and human Judges can choose Watch Jury to hear and view the deliberation live. The Jury remains advisory to a human Judge. Skip moves directly to final ballots. Skipping remains available after discussion starts—even during a juror’s current statement—and preserves all five final ballots and the full five-ballot Jury result.",
      "When formal Jury deliberation arrives, the Moderator announces the handoff and PRISM automatically enters a dim chamber. Five private leanings lead into five short, routed, audible juror turns—three after End Debate—then all five jurors cast final ballots one at a time. Each chamber turn and ballot follows the same saved voice and caption path; a canonically silent juror remains silent. Deliberation and voting are automatic and unskippable, and the Jury remains advisory to a human Judge.",
    )
    .replace(
      "Once Jury deliberation begins, the Jury owns the floor: the unified Gavel and Space are put away, while Skip deliberation remains available.",
      "Once Jury deliberation begins, the Jury owns the floor: the unified Gavel, Space, End, and Skip actions are put away until every ballot is complete. Pause preserves the exact juror or ballot, and Resume uses the same Moderator return ceremony as the public floor.",
    )
    .replace(
      "Spectators and human Judges can open the five-seat Jury camera manually once leanings, deliberation, or ballots begin (disabled until then), and Auto also enters the chamber for those same beats before returning to the forum for advocate aftermath reactions.",
      "When Jury is enabled, PRISM automatically enters the five-seat chamber for private leanings, audible deliberation, final ballots, and the foreperson’s split, then returns to the forum before advocate aftermath reactions.",
    )
    .replace(
      "An ellipsis beside a juror means a thought is waiting; enter the Jury camera before the next thought and that juror will deliver it, while another camera lets them resolve immediately without holding up the proceeding.",
      "An ellipsis beside a juror means a between-turn thought is waiting; hover it to read that opinion without interrupting the public proceeding.",
    )
    .replace(
      "Five private leanings lead into five short routed discussion turns and five final ballots. Each audible juror reads the same final reason saved in the Jury record;",
      "Five private leanings lead into five short routed chamber discussion turns and five final ballots. Each audible juror reads the same final reason saved in the Jury record;",
    )
    .replace(
      "Manual public-floor cameras stay out of the chamber unless an eligible Spectator or human Judge chooses Jury or Watch Jury.",
      "Participant never receives Jury as a manual camera: every role enters and leaves it automatically. Participants see five sealed anonymous seats, while identities, discussion, reasons, and individual ballots remain private.",
    )
    .replace(
      "If Jury is enabled, Jury becomes the Judge’s one additional camera once leanings, deliberation, or ballots open (disabled before then), and Watch Jury enters the live advisory chamber. Auto also visits the Jury chamber for leanings, deliberation, ballots, and the split, then returns to the forum for advocate aftermath reactions. Returning to Auto restores the directed public proceeding when you have locked a manual Jury shot. Participant and Spectator sessions retain manual public-floor cameras; Spectators can still choose Jury manually once the chamber is open, or choose Watch Jury in the timed deliberation prompt.",
      "If Jury is enabled, PRISM automatically visits the chamber for leanings, audible deliberation, ballots, and the split, then returns to the forum before advocate aftermath reactions. Spectators and Judges also get a manual Jury camera once that chamber window opens, as an escape hatch if Auto leaves them on the forum; it stays disabled until then. Participant and Spectator sessions retain manual public-floor cameras outside that Jury passage.",
    )
    .replace(
      "Judge and Spectator records keep named deliberation and ballots;",
      "Judge and Spectator records keep named between-turn thoughts, chamber deliberation, and ballots;",
    );
}

function currentDebateRecessTutorialBody(body: string): string {
  return body
    .replace(
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. The settled recess screen holds the Wide chamber shot with speech silenced while the gallery keeps murmuring; returning to that recess hears the crowd before Resume. Resume keeps that recess screen until the return-to-order line is ready, then hushes the house as the Moderator gavels and calls the Debate back. If you paused during the opening monologue, Resume simply restarts that opening from the beginning—no recess filler and no second call to order. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. If the Jury chamber is visible, Pause stays instantaneous without a cutscene. When one advocate cuts another, the interrupted line audibly chokes mid-phrase while the Objection overlaps from the opposite side, the camera always pans to the interrupter, and a short trail-off may finish under that pan.",
      "Pause always cuts the live floor immediately—even mid-speech—then bookmarks that held line while the gallery keeps murmuring. Choosing Resume strikes the gavel immediately, hushes the house, and holds the Moderator camera through the return-to-order call before the saved floor continues. An interrupted speaker may restart with a short lead-in such as “As I was saying…” without changing archived Proceedings. Opening and Jury recesses use that same return ceremony. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. When one advocate cuts another, the interrupted line audibly chokes mid-phrase while the Objection overlaps from the opposite side, the camera always pans to the interrupter, and a short trail-off may finish under that pan.",
    )
    .replace(
      "For a returning human Judge, Resume is the return-to-order gavel strike: one click swings the visible gavel, sounds its hit, settles the room, and lets the moderator give a Persona-shaped return-to-order line without asking for a second slam. Bot-moderated roles receive that moderator call automatically. If the Jury chamber is visible, Resume stays instantaneous without a cutscene. If a spoken line was interrupted, Debate replays that saved line from its beginning with a short lead-in such as “As I was saying…”, without rewriting the archived Proceedings text.",
      "Choosing Resume strikes the visible gavel immediately for every role; its audible hit calls the camera to the Moderator before a Persona-shaped return-to-order line. A visible Jury chamber follows the same handoff. If a spoken line was interrupted, Debate replays that saved line from its beginning with a short lead-in such as “As I was saying…”, without rewriting the archived Proceedings text.",
    )
    .replace(
      "Leaving an unfinished Debate by any route preserves its exact floor and makes the returning chamber appear in recess. Continuing begins with the moderator calling the Debate back to order unless the Jury chamber is visible.",
      "Leaving an unfinished Debate by any route preserves its exact floor and makes the returning chamber appear in recess. Opening that archived recess mounts the chamber immediately, prepares the held voice, and keeps buffering already-generated floor beats in the background for Judge, Participant, and Spectator alike. An unfinished Spectator bake also continues building its append-only runway before playback. Continuing always begins with the Moderator calling the Debate back to order, including from the Jury chamber.",
    )
    .replace(
      "Pause or Gavel to resume",
      "Pause or Resume",
    )
    .replace(
      "Resume requires you to strike the visible gavel; its audible hit calls the camera to the moderator before that moderator gives a Persona-shaped return-to-order line.",
      "Choosing Resume strikes the visible gavel immediately; its audible hit calls the camera to the moderator before that moderator gives a Persona-shaped return-to-order line.",
    )
    .replace(
      "Recess ceremonies and every 8× slowed Participant input interval are also off-record: gallery, ambience, reaction, and thinking audio are suspended rather than captured.",
      "Recess ceremonies and every 8× slowed Participant input interval are also off-record. During recess the gallery keeps murmuring until the gavel, then the live room hushes for the Moderator; none of that ambience, reaction, or thinking audio enters the readable record.",
    );
}

const MODEL_ROUTING_VISIBILITY_TUTORIAL_SUFFIX =
  "Chat, Coffee, Signal, Debate, and Slate use the same persistent PRISM navbar: applet identity and switching first, contextual controls in the middle, and the shared utility strip at the right. Chat/Zen is the default Home and does not appear as a selectable applet. Its LOCAL/ONLINE privacy lane, Model, Effort, bot, and Voice controls stay in that navbar before and throughout a conversation. The new-chat hero keeps only the Private chat toggle; after it starts, the navbar shows Private chat as locked status rather than a switch. " +
  "Every visible, runnable text model in the selected privacy lane is eligible for contextual Auto. LOCAL evaluates only local Ollama models; ONLINE evaluates only configured OpenAI and Anthropic models. Auto deterministically chooses the lowest-cost or lowest-latency candidate that clears the request’s capability floor, then chooses and clamps Effort for that request. Settings → Models includes an ONLINE Auto provider lean slider: middle is Balanced (pure cost and speed), left softly prefers OpenAI, right softly prefers Anthropic, and extremes still allow the other provider when it is clearly better. Its hollow triangle is an accessible, noninteractive Effort state: click, keyboard, wheel, and the Effort modal are disabled. Choosing a concrete model bypasses Auto and restores that model’s saved Effort. Settings keeps separate optional LOCAL and ONLINE fallback chains; retries stay in-lane, skip duplicates, and always use None. Unavailable real models may remain visible with an explanation, but Disabled and Account default are never model choices. Model and Effort are global across applets: choosing Terra with Extra High in Zen keeps that same combination in Chat, Sandbox, Coffee, Signal, Debate, Story, and Slate. The split model control saves Effort per concrete model across every surface; only an already-running live session keeps its frozen routing snapshot until it ends. Only Auto uses the effort glyph as a direct Turbo switch; every fixed model opens the Effort picker, and Turbo lives inside that picker. Turbo requests faster priority processing at premium rates and lights the Effort control on fire while active. Turbo remains active across screens and browser refreshes while you stay in the current applet. Changing models, changing applets, or beginning a fresh app session switches it off, so premium processing must be consciously re-enabled where it is wanted. Auto never borrows a concrete model’s Turbo flame. Live and archived routing summaries name the concrete model and effort, retain [auto] when Auto chose them, always show an effort glyph, and place 🔥 beside that glyph when Turbo ran. Each concrete model row shows its saved effort glyph on the right in monochrome, while the selected model receives the spectrum color. For a fixed model, the control's symbol shows that selected level; while a Chat reply is generating, the selected effort glyph rotates in place. With Model open, scroll anywhere to select the next available model; with Effort open, scroll anywhere to select its next level. Control+Down opens Model on the current selection; tap Tab to commit it and move directly into Effort—even if Shift is still held—then tap again to return to Model. Navbar dropdowns stay pointer and wheel driven—arrow keys do not roam their lists. Control+Left flips LOCAL/ONLINE, Control+Right opens Effort, Control+Up toggles Turbo (with a cheeky denial cue when Turbo is unavailable), and Shift+Tab opens Speech Type. Wheel-based value selection in both Model and Effort adjusts the active picker regardless of pointer location. Pressing Tab after clicking either picker enters the same quick handoff, and moving the mouse returns the open picker to ordinary pointer browsing. Model and Effort never remain open together. Clicking anywhere outside closes the open picker. Space or Escape also closes it and returns focus to the composer so you can type immediately. Open the Effort vertical slider to scroll, click a level, or drag between them. The slider line mirrors the selected glyph with one through five PRISM colors as effort rises. Native reasoning models retain Default for the provider baseline. Models without a built-in thinking dial always get Prism’s simulated Effort (None through Extra High): private planning passes before the reply, with higher Effort meaning more passes and a longer wait. The first time you change Effort on one of those models, Prism explains this with a short toast. Settings → Experimental can optionally enable Deep simulated thinking for a much heavier private workshop. Online simulation may add provider usage or cost; native effort remains native. Cmd/Ctrl+Shift+E opens the active fixed model's effort HUD; arrows adjust it and D restores the model baseline—Default for native reasoning and None for simulated effort. Hold Control for a moment to reveal a small shortcut toast for that Control-root cluster; Wield Prism stays legend-free. These shortcuts can be changed in Settings → Shortcuts. A committed reply finishes unchanged, while prepared work is discarded before the next bot turn.";

function currentChatZenPresentationTutorialBody(body: string): string {
  return body
    .replace(
      "When player voice is on in Zen, your submitted words stream onto the canvas once, in step with the words you hear.",
      "When player voice is on, your submitted words stream onto the canvas once in transcript Chat and immersive Zen, in step with the words you hear.",
    )
    .replace(
      "Transcript Chat keeps that same single visual stream but runs it much faster because Chat is muted.",
      "Both views share that single visual stream: Mute uses your selected text stream rate, while spoken Speech Types follow the audio you hear.",
    );
}

function currentSimulatedEffortTutorialBody(body: string): string {
  return currentChatZenPresentationTutorialBody(body)
    .replace(
      "private simulated passes may still run underneath for quality.",
      "PRISM simulated passes may still run underneath for quality.",
    )
    .replace(
      "On models without built-in thinking, Effort runs Prism’s simulated private passes;",
      "On models without built-in thinking, Effort runs Prism’s simulated private passes;",
    )
    .replace(
      "Those passes guide the final reply; with an online model, each one is an additional provider request.",
      "Those passes guide the final reply; each simulated pass is an additional request to the selected provider and may add usage or cost. Native effort remains native.",
    )
    .replace(
      "Models without a built-in thinking dial always get Prism’s simulated Effort (None through Extra High):",
      "Models without a built-in thinking dial get Prism’s simulated Effort (None through Extra High):",
    )
    .replace(
      "Settings → Experimental can optionally enable Deep simulated thinking for a much heavier private workshop.",
      "Settings → Experimental can optionally enable Deep simulated thinking for a much heavier private workshop.",
    )
    .replace(
      "Online simulation may add provider usage or cost; native effort remains native.",
      "Online simulation may add provider usage or cost; native effort remains native.",
    )
    .replace(
      "With Model open, scroll anywhere to select the next available model; with Effort open, scroll anywhere to select its next level. Control+Down opens Model on the current selection; tap Tab to commit it and move directly into Effort—even if Shift is still held—then tap again to return to Model. Navbar dropdowns stay pointer and wheel driven—arrow keys do not roam their lists. Control+Left flips LOCAL/ONLINE, Control+Right opens Effort, Control+Up toggles Turbo (with a cheeky denial cue when Turbo is unavailable), and Shift+Tab opens Speech Type. Wheel-based value selection in both Model and Effort adjusts the active picker regardless of pointer location. Pressing Tab after clicking either picker enters the same quick handoff, and moving the mouse returns the open picker to ordinary pointer browsing.",
      "With Model, Effort, or Speech Type opened by a hotkey, scroll anywhere to move its pending value without moving the cursor. In an open Model or Effort picker, Up/Down moves the pending option whether it was opened by hotkey or click; Left/Right remain available to the surrounding interface. Enter, Space, clicking outside, or Tab commits that pending value; Escape, Backspace, or Delete exits without changing it. Tab then closes the picker and places the cursor in the nearest visible composer so typing can resume immediately. Using another picker hotkey commits the current pending value and opens that requested picker immediately. Shift+Tab flips LOCAL/ONLINE directly, outside the Control shortcut root. Control+Left opens Model, Control+Down opens Effort, Control+Right opens Speech Type, and Control+Up toggles Turbo. Turbo enables Fast on the current compatible ONLINE model, moves to the first same-provider Fast model when necessary, or from LOCAL switches to the lowest compatible ONLINE Auto route before enabling Fast.",
    )
    .replace(
      "Its hollow triangle is an accessible, noninteractive Effort state: click, keyboard, wheel, and the Effort modal are disabled.",
      "In LOCAL Auto, clicking the hollow triangle gives a failed ignition—its ignition cue sputters into smoke without switching models or enabling Turbo. In ONLINE Auto, clicking that triangle toggles Turbo through the same route as the Turbo shortcut; wheel and the Effort modal remain disabled because Auto still chooses effort per request.",
    )
    .replace(
      "Auto never borrows a concrete model’s Turbo flame.",
      "When ONLINE Auto’s current model supports Turbo, the triangle carries the flame while Turbo is active; if a different compatible model is needed, the shared Turbo route selects it before enabling.",
    )
    .replace(
      "Control+Left opens Model, Control+Down opens Effort, Control+Right opens Speech Type, and Control+Up toggles Turbo.",
      "Control+Left opens Model, Control+Down opens Effort, Control+Right opens Speech Type, and Control+Up toggles Turbo. In ONLINE Auto, clicking the hollow Effort triangle invokes that same Turbo toggle.",
    );
}

function currentModelRoutingTutorialStep(
  step: ModeTutorialStep,
): ModeTutorialStep {
  const body = currentSimulatedEffortTutorialBody(step.body);
  if (
    !/model/iu.test(body) ||
    !/(?:Choose LOCAL or ONLINE as|Choose LOCAL or ONLINE for|Choose LOCAL or ONLINE in|Pick LOCAL or ONLINE|navbar’s LOCAL and ONLINE)/iu.test(
      body,
    )
  ) {
    return body === step.body ? step : { ...step, body };
  }
  return {
    ...step,
    body: currentSimulatedEffortTutorialBody(
      `${body} ${MODEL_ROUTING_VISIBILITY_TUTORIAL_SUFFIX}`,
    ),
  };
}

const CURRENT_MODE_TUTORIALS: Record<TutorialMode, ModeTutorial> = {
  ...BASE_MODE_TUTORIALS,
  debate: {
    ...BASE_MODE_TUTORIALS.debate,
    steps: BASE_MODE_TUTORIALS.debate.steps.map((step) => {
      const body = currentDebateRecessTutorialBody(
        currentDebateJuryTutorialBody(step.body),
      );
      if (step.heading === "Read the living case") {
        return {
          ...step,
          body,
          clickLabel: "the Case board rail tab",
          targetSelector: '[data-tutorial-target="debate-case-board-tab"]',
        };
      }
      if (step.heading === "Freeze one shared record") {
        return {
          ...step,
          body: `${body} ${SOFT_SYNTHESIS_PRISM_TUTORIAL_SUFFIX}`,
        };
      }
      return step.heading === "Follow and keep the record"
        ? {
            ...step,
            body: `${currentDebateRecordTutorialBody(body)} ${TRANSCRIPT_TO_SLATE_TUTORIAL_SUFFIX} ${APPLET_SESSION_NOTE_TUTORIAL_SUFFIX} ${POWER_IMMUNITY_TUTORIAL_SUFFIX} ${INEPT_POWER_TUTORIAL_SUFFIX}`,
          }
        : { ...step, body };
    }),
  },
  zen: {
    ...BASE_MODE_TUTORIALS.zen,
    steps: BASE_MODE_TUTORIALS.zen.steps.map((step, index) => {
      if (index === 0) {
        return {
          ...step,
          body: `${step.body} ${TRANSCRIPT_TO_SLATE_TUTORIAL_SUFFIX} ${IDENTITY_SHAPESHIFT_POWER_TUTORIAL} ${FRESH_CONTACT_POWER_TUTORIAL_SUFFIX} ${SIMULATION_EVANGELIST_POWER_TUTORIAL_SUFFIX} ${BOT_NAMING_POWER_TUTORIAL_SUFFIX} ${POWER_IMMUNITY_TUTORIAL_SUFFIX} ${INEPT_POWER_TUTORIAL_SUFFIX}`,
        };
      }
      return step.heading === "Continue this Home"
        ? {
            ...step,
            body: `${step.body} ${PRISM_COMPANION_VIEWS_TUTORIAL_SUFFIX}`,
          }
        : step;
    }),
  },
  chat: {
    ...BASE_MODE_TUTORIALS.chat,
    steps: BASE_MODE_TUTORIALS.chat.steps.map((step, index) => {
      if (index === 0) {
        return {
          ...step,
          body: `${step.body} ${TRANSCRIPT_TO_SLATE_TUTORIAL_SUFFIX} ${IDENTITY_SHAPESHIFT_POWER_TUTORIAL} ${FRESH_CONTACT_POWER_TUTORIAL_SUFFIX} ${SIMULATION_EVANGELIST_POWER_TUTORIAL_SUFFIX} ${BOT_NAMING_POWER_TUTORIAL_SUFFIX} ${POWER_IMMUNITY_TUTORIAL_SUFFIX} ${INEPT_POWER_TUTORIAL_SUFFIX}`,
        };
      }
      return step.heading === "Use quick tools"
        ? {
            ...step,
            body: `${step.body} ${PRISM_COMPANION_VIEWS_TUTORIAL_SUFFIX}`,
          }
        : step;
    }),
  },
  coffee: {
    ...BASE_MODE_TUTORIALS.coffee,
    steps: BASE_MODE_TUTORIALS.coffee.steps.map((step, index) => {
      const body = currentAppletSessionNoteTutorialBody(
        currentInterruptionRetortTutorialBody(step.body),
      );
      return index === 0
        ? {
            ...step,
            body: `${body} ${COFFEE_GROUP_CREATION_LOADER_TUTORIAL_SUFFIX} ${POWER_EXCLUSION_TUTORIAL_SUFFIX} ${POWER_IMMUNITY_TUTORIAL_SUFFIX} ${INEPT_POWER_TUTORIAL_SUFFIX} ${IDENTITY_MIRROR_POWER_TUTORIAL_SUFFIX} ${IDENTITY_SHAPESHIFT_POWER_TUTORIAL} ${FALSE_NAME_POWER_TUTORIAL} ${FRESH_CONTACT_POWER_TUTORIAL_SUFFIX} ${SIMULATION_EVANGELIST_POWER_TUTORIAL_SUFFIX} ${BOT_NAMING_POWER_TUTORIAL_SUFFIX}`,
          }
        : step.heading === "Join the conversation"
          ? {
              ...step,
              body: `${body} ${TRANSCRIPT_TO_SLATE_TUTORIAL_SUFFIX} ${COFFEE_CROSSTALK_SOCIAL_SILENCE_TUTORIAL_SUFFIX}`,
            }
          : index === 5
            ? {
                ...step,
                body: `${body} ${COFFEE_PRISM_PRESENCE_TUTORIAL_SUFFIX}`,
              }
            : body === step.body
              ? step
              : { ...step, body };
    }),
  },
  botcast: {
    ...BASE_MODE_TUTORIALS.botcast,
    steps: BASE_MODE_TUTORIALS.botcast.steps.map((step, index) => {
      const body = currentSignalRefractTutorialBody(
        currentSignalPowerTutorialBody(step),
        index,
      );
      return index === 5
        ? {
            ...step,
            body: `${body} ${SIGNAL_AVATAR_SCALE_POWER_TUTORIAL_SUFFIX} ${POWER_EXCLUSION_TUTORIAL_SUFFIX} ${POWER_IMMUNITY_TUTORIAL_SUFFIX} ${INEPT_POWER_TUTORIAL_SUFFIX} ${SIGNAL_ADDRESSED_FANDOM_POWER_TUTORIAL_SUFFIX} ${IDENTITY_MIRROR_POWER_TUTORIAL_SUFFIX} ${IDENTITY_SHAPESHIFT_POWER_TUTORIAL} ${FALSE_NAME_POWER_TUTORIAL} ${FRESH_CONTACT_POWER_TUTORIAL_SUFFIX} ${SIMULATION_EVANGELIST_POWER_TUTORIAL_SUFFIX} ${SIGNAL_PRODUCER_GUEST_TUTORIAL_SUFFIX}`,
          }
        : step.heading === "Shape the show’s identity"
          ? {
              ...step,
              body: `${body} ${SOFT_SYNTHESIS_PRISM_TUTORIAL_SUFFIX}`,
            }
          : step.heading === "Produce from the control room"
            ? {
                ...step,
                body: `${body} ${APPLET_SESSION_NOTE_TUTORIAL_SUFFIX} ${SIGNAL_CROSSTALK_SOCIAL_SILENCE_TUTORIAL_SUFFIX}`,
              }
            : step.heading === "Watch the saved cut"
              ? {
                  ...step,
                  body: `${body} ${TRANSCRIPT_TO_SLATE_TUTORIAL_SUFFIX}`,
                }
              : body === step.body
                ? step
                : { ...step, body };
    }),
  },
};

export const MODE_TUTORIALS: Record<TutorialMode, ModeTutorial> =
  Object.fromEntries(
    (
      Object.entries(CURRENT_MODE_TUTORIALS) as [TutorialMode, ModeTutorial][]
    ).map(([mode, tutorial]) => [
      mode,
      {
        ...tutorial,
        steps: tutorial.steps.map(currentModelRoutingTutorialStep),
      },
    ]),
  ) as unknown as Record<TutorialMode, ModeTutorial>;

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
