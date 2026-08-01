import { DEBATE_EVIDENCE_ITEM_MAX_COUNT } from "@localai/shared";

export type TutorialMode =
  "zen" | "chat" | "coffee" | "debate" | "botcast" | "slate";

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
        body: "Choose PRISM or a persona to enter that relationship’s Home. Ready Powers stay active with that persona here and across PRISM; a muted persona can still act, but only answers with ... and never speaks aloud, while a Copycat persona may originate one opening if nobody has addressed them yet, then repeats the latest addressed message exactly. A short-term-amnesia persona only sees your current message each turn—no earlier replies or broader topic unless that message states it—and answers naturally without amnesia coaching. A John/Jane Doe persona sincerely believes a random persona name for the session and reshuffles that name whenever short-term amnesia clears continuity. An Obsessed persona treats you as the star of each reply with fresh, intense admiration, while your agency, privacy, and safety boundaries still win. A radiant-joy persona makes that emotional warmth palpable without tracking or rewriting your mood. A sad-grouchy persona makes her draining presence equally palpable without changing your state; only bots that directly talk to her lose mood or motivation. Size Powers use six distinct presentations: Microscopic is unseen, Tiny is half size, Small is three-quarter size, Large is one-quarter larger, Giant is half larger, and Colossal fills and crops against the nearest edge. Names and controls stay normal-sized. Invisible fully hides the body and attached lights while preserving attributed text and speech. Loud and Quiet use fixed text and voice trims; in this one-person lane Quiet never removes a turn because there is no bot listener. A hard bare-minimum or brief Power is engine-bounded even if the model tries to elaborate. Clicking empty canvas space jumps straight back to All Bots Home. Escape returns you to the wider Library or saved group grid exactly where you left it. Inviting a guest keeps you in the current Home.",
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
        body: "Each Home keeps separate saved conversations inside one relationship. Expand a Home in the conversation panel to open an exact conversation, use its + to begin another, or use New chat to start fresh inside the Home you are visiting. Only that conversation's transcript enters its active context. Put physical stage direction in the separate Action field using letters and spaces only; typing exactly ** in the speech field jumps there. Action drafts stay private until Send. If you send an Action without speech, it and the bot's action response appear on the canvas as an ephemeral exchange and never enter history or memory. When Shh appears, it stops the current reply without replacing the draft you are writing.",
        clickLabel: "the message box at the bottom",
        targetSelector: '[data-tutorial-target="composer"]',
      },
      {
        heading: "Choose how replies recover",
        body: "AUTO keeps the current response model as Primary, then quietly tries your ordered chain of one to five saved local or online fallbacks if a reply fails validation. While AUTO is selected, the model picker shows every local and online model so you can change Primary directly. Image generation keeps its own LOCAL/ONLINE choice in Images. Voice offers Mute, English, Premium, Babble, and Bottish everywhere: English uses each bot’s local PRISM or optional operating-system identity without ElevenLabs credits; Premium uses an ElevenLabs identity you choose from your connected account on AUTO and ONLINE speech. Marketplace bots do not bundle a Premium identity by default. LOCAL always shows and uses English so it never sends speech off-device. Avatar Studio edits and previews those two identities separately while sharing pitch, pace, lilt, effects, and mood delivery. The subtle Prism effect is the default house sound, gently tuning voiced speech before its refracted double; choose Clean for untouched playback or Resonance for a darker, weightier mechanical double. Voice Settings can narrow automatic Premium defaults to one ElevenLabs voice collection. The Voice tab also gives each bot a Voice Character pad: move left or right to balance low-end weight against high-end clarity, and up or down to trim that bot relative to your account Voice Volume. The SFX tab can generate an ElevenLabs loop or accept an audio upload, then play it while the avatar is talking, idle, thinking, or any selected combination. Its volume and sample controls stay separate from spoken voice. When an eligible Premium voice has a non-neutral mood, Eleven v3 automatically carries that feeling into the next spoken line; neutral speech stays untagged. With Voice Effects on, longer spoken replies may take a quiet mic-ready breath before the line.",
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
        heading: "Hear each bot think",
        body: "Every bot without a selected Avatar SFX uses one of four built-in PRISM “Computer calculating” loops while thinking. When ElevenLabs is connected and ONLINE, creating a manual, AI-generated, or Marketplace bot asks for a fresh unique loop; if that request cannot run or fails, the built-in sound stays active. The SFX tab can replace it with generated or uploaded audio, restore the PRISM default, or mute it.",
        clickLabel: "the LOCAL, AUTO, ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Use Atmosphere gently",
        body: "Atmosphere starts on for every Zen conversation. Blank bot gradients hold the room until a wallpaper arrives. Open Settings to turn Atmosphere off for this conversation, or generate a fresh backdrop with $atmosphere.",
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
        body: "Pick a bot, then send your first message. Any ready Powers stay active with that bot across PRISM; a muted bot can still act, but only answers with ... and never speaks aloud, while a Copycat bot may originate one starter opening if nobody has addressed it yet, then repeats your addressed message exactly and adds nothing. A short-term-amnesia bot only sees your current message each turn—no earlier replies or broader topic unless that message states it—and answers naturally without amnesia coaching. A John/Jane Doe bot sincerely believes a random persona name for the session and reshuffles that name whenever short-term amnesia clears continuity. An Obsessed bot treats you as the star of each reply with fresh, intense admiration, while your agency, privacy, and safety boundaries still win. A radiant-joy bot makes its warmth unmistakable without inventing mutable mood state for you. A sad-grouchy bot makes her drag unmistakable without changing your state; only bots that directly talk to her lose mood or motivation. Hard bare-minimum and brief Powers are engine-bounded; expansive Powers guide the bot without forcing filler. Size Powers use Microscopic, Tiny, Small, Large, Giant, and Colossal at hidden, 50%, 75%, 125%, 150%, and edge-cropped 300% presentations. The bot’s label and controls stay normal-sized. Invisible fully hides the body and attached lights while keeping attributed text and audible speech. Loud and Quiet apply fixed voice and text trims; Quiet never removes a Chat turn because the player always receives it. A ghostly bot stays unseen while idle and fades into view only for its own spoken line; you can always understand the haunting through the conversation itself.",
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
        body: "Zen keeps the timeline as it happened. Type $undo to rewind the latest message when you need a clean correction. Put physical stage direction in the separate Action field using letters and spaces only; typing exactly ** in the speech field jumps there. Action drafts stay private until Send. If you send an Action without speech, it and the bot's action response appear on the canvas as an ephemeral exchange and never enter history or memory. When Shh appears, it stops the current reply without replacing the draft you are writing.",
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
        body: "Choose a Coffee Group here to stage its table. In a larger saved group, write a Listen up prompt to open a locally ranked table already staged around your topic; review the seats, swap the cast, or cancel and keep editing. Each bot brings its ready Powers to the table; Powers can change who they notice, answer, remember, privately read, how strongly they pull the room's attention, whether a trustworthy direct question draws a more candid next answer, whether they touch their coffee at all, mute them so only actions and ... remain, or let a Copycat bot originate one opening before it repeats the exact user or bot line directly addressed to it. A short-term-amnesia holder only receives the current speaker's message each turn and answers it naturally, without table-topic memory or amnesia coaching. A John/Jane Doe holder sincerely believes a random persona name for the session—Coffee seat plates show that believed name—and reshuffles it whenever short-term amnesia clears continuity. An Obsessed holder makes the player or peer they address the star of that reply, with fresh admiration but no control over the target. A radiant-joy holder gives addressed listeners one bounded, replay-safe lift that shows through each listener's own personality without forcing agreement or erasing real sadness. A sad-grouchy holder gives one bounded, replay-safe mood or motivation drop only to the bot that directly talks to her; the player and bystanders are untouched, and the addresser keeps its own personality and agency. An interruption Power makes its holder seize eligible live openings from every resolved target at the table. A Power authored to interrupt every time always cuts a bot turn that directly engages its holder, without a random roll or generic cooldown. Coffee can also choose that holder for an organic cut-in through its normal table dynamics; once chosen, the cutoff still happens during that active turn and can land early, in the middle, or late. Other interruption Powers still use frequency, strength, and Coffee's short cooldown. Hard bare-minimum and brief Powers bound each table reply while preserving required interruptions, departures, and wraps. Size Powers render Microscopic, Tiny, Small, Large, Giant, and Colossal bots at hidden, 50%, 75%, 125%, 150%, and edge-cropped 300% body presentations without scaling seats, names, or cups. Microscopic, Colossal, and Invisible have no visible coffee. Each bot listener independently hears half of a Quiet bot’s lines; a miss exposes no words or topic, only that the voice was too faint, while the player still receives the full line. Each Loud line has a replay-stable 50% chance to mildly annoy exactly one audible peer. Size remarks follow the table’s existing mood and never create anger. A ghostly bot is invisible at rest, fades in for its own line, then vanishes again; each appearance can leave the other bots rattled without taking their agency. If a hard-of-hearing bot asks what the prior speaker said, that bot repeats its saved line and loses a little mood each time.",
        clickLabel: "a Coffee Group in the left sidebar",
        targetSelector: '[data-tutorial-target="coffee-groups"]',
      },
      {
        heading: "Set the table",
        body: "Duration, presets, and group settings steer the whole session together. Auto has no visible countdown; switch to Timed when you want a fixed 3-30 minute table. Under Atmosphere audio, Jazz turns on a soft café bed and lets you pick a station; it plays during live tables and while watching replays, but stays out of the faithful audio recording. Under Recent sessions, Open returns to the replay while Use setup restores that table's attendance, duration, pacing settings, and topic for an editable retry; the current model and response routing stay selected. Account default uses the model saved in Settings; AUTO is the separate response-routing control. In AUTO, the model picker shows every local and online model, uses your selection as Primary, then recovers through your ordered chain of one to five local or online fallbacks. When a selected local model needs a first load, PRISM may briefly hold the table and pause its clock; the conversation resumes automatically once the room is ready.",
        clickLabel: "New session setup or Configure settings",
        targetSelector: '[data-tutorial-target="coffee-session-setup"]',
      },
      {
        heading: "Choose the spark",
        body: "Pick one of the four prompts created for this group, or type your own before the table starts. Once the session is live, the chosen or auto-picked topic stays framed under the Coffee navbar so you can always see what the table is about.",
        clickLabel: "a topic suggestion",
        targetSelector: '[data-tutorial-target="coffee-topic-picker"]',
      },
      {
        heading: "Keep the table moving",
        body: "Choose AUTO in the LOCAL, AUTO, ONLINE control to retry failed or malformed table turns. The model picker stays active and shows every model: your selection becomes Primary, followed by the fallback chain saved in Settings. AUTO does not change the separate Images provider or voice preference. Choose routing and Voice before the table starts. When recording begins, Coffee freezes the selected speaking type and engine, then locks routing, model, Voice, and the entire utility strip until you choose End session. A finished Review shows Recorded replay instead of live routing controls because its exact audio and baked mouth performance no longer depend on the current model or Voice settings.",
        clickLabel: "the LOCAL, AUTO, ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Join the conversation",
        body: "The live session stays overhead. Type into the message box or let the bots carry the room. You remain off camera during the live table: there is no player avatar or mug. Replay seats you as Default Prism at the table with the pot. Drag the pot from the composer to top off an eligible seated bot before its farewell begins; no waiter, barista, or service bot can refill anyone. A bot whose Power refuses coffee has no mug, steam, sip, refill, or pot target; its invisible visit clock still winds down normally and cannot be refilled. Once an ordinary cup empties, that bot must leave within two or three table replies unless you top it off first, though mood and context can still send anyone home earlier. Put physical stage direction in the separate Action field using letters and spaces only; typing exactly ** in the speech field jumps there. A voiced player line containing a recognized asterisk cue such as *yells* gives Premium an ElevenLabs performance direction; with Voice Effects on, fart, burp, and cough actions play their bundled Foley at the authored cue. Shh remains a separate interruption control, so it never replaces the table draft you are writing. Type / for Prompt Center prompts and ! for wildcard decks; both expand when you send. Any idle audible bot may make a sparse prerecorded throat-clear, swallow, lip smack, sigh, or inhale; its mouth moves with the local cue, independent of its speaking style or voice engine. Watch a directly addressed bot: while listening, it may also give a small nod, lean, expression, brief spoken acknowledgement, or restrained ElevenLabs vocal reaction without taking a turn or entering the transcript. Your Cross-talk setting controls how often those contextual audible overlaps happen, from nearly silent in Rare to lively in Pile-up; inferred listeners remain visual only. When one bot cuts off another, the interrupter speaks a short hold-on over the outgoing voice before that voice releases; the interrupted bot takes a brief processing beat, then answers with an annoyed, abandoned ending over the handoff. The saved cutoff still shows only what reached the table. If a reply takes long enough to leave awkward dead air, another seated bot may occasionally speak one brief mood-aware aside (heard, with mouth motion, not shown as a seat action) without stealing the slow bot’s turn; the slow bot can begin answering over the aside’s natural ending. Ambient sips continue through quiet beats and listening moments, while the active speaker keeps their cup down; cup-return sounds stay synchronized with the visible cup motion. When an eligible bot has a non-neutral mood, Eleven v3 automatically carries that feeling into its next spoken line; neutral speech stays untagged. With Voice Effects on, longer bot turns may take a sparse mic-ready breath before speaking. A clear table goodbye ends the session naturally; Review stays quiet while the bots finish their private wrap. Prism's floating assistant steps out once the live Coffee Session begins and returns for setup, review, and replay. The finished Review keeps the saved table in view, offers Coffee home to return to setup, and one readable transcript download. Cross-talk, interruptions, ambient reactions, thinking intervals, sips, departures, and top-offs are captured in one faithful audio master as they happen. Replay plays that private master once at normal speed while its detailed direction track drives frozen bot appearances and voices, your Default Prism seat, thinking spinners, mouths, reveals, pot motion, seeking, pausing, and each bot physically departing after the closing exchange. It does not re-synthesize voices, replay effects on top, add an AI conversation turn, or generate a video. A session without its exact master remains transcript-only. Poll votes and team choices share the Table Talk rail; drag its left edge or the topic divider when you want more room.",
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
        body: "A Debate is a saved exchange between two advocates. Basic setup is the welcoming default: give Prism a topic, choose the debaters, and keep evidence optional. New Duel clears the active workbench without touching archived proceedings.",
        clickLabel: "New Duel",
        targetSelector: '[data-tutorial-target="debate-new"]',
      },
      {
        heading: "Choose Basic or Advanced",
        body: "Basic keeps setup focused on the debate idea, one Rowdiness dial, and two debaters. Prism writes the balanced motion and both private side briefs, starts with a Plainspoken Forum, opens from the center Judge seat, then stays silent until you act, leaves the final call to you, and keeps the Jury off. Advanced preserves the full studio: presets, five formality levels, Forum or Turnabout, player roles, editable briefs, and the optional Jury. Daytime Showdown keeps its confrontation-show energy when you take the Judge role; Custom records the role change without turning Free-for-all into a polite panel. You can switch at any time; returning to Basic applies its simpler room defaults while preserving your chosen Rowdiness, topic, cast, and sources.",
        clickLabel: "Basic or Advanced",
        targetSelector: '[data-tutorial-target="debate-setup-mode"]',
      },
      {
        heading: "Tune the room",
        body: "Basic Rowdiness runs from University Union to Daytime Showdown across five real Debate behaviors, with Plainspoken as the starting point. Move right for sharper language, faster confrontation, more natural cut-ins, and punchier moderator warnings; move left for cleaner structure and greater decorum. The dial changes the room’s delivery without changing the facts, safety boundaries, or any Persona’s identity and voice. Because the debaters consent to the actual room, changing Rowdiness clears an earlier willingness check.",
        clickLabel: "the Rowdiness slider",
        targetSelector: '[data-tutorial-target="debate-rowdiness"]',
      },
      {
        heading: "Name the presiding voice",
        body: "Moderator title is the exact public authority for this proceeding: Moderator, The House, The Court, or any title that fits your room. Titles beginning with The speak through that title; every other title stays the public role label while the moderator refers to itself naturally as I, me, my, mine, or myself. The title appears on the center card and freezes with the saved Debate for replay. It never changes the moderator bot’s identity, neutrality, Powers, or floor ownership.",
        clickLabel: "Moderator title",
        targetSelector: '[data-tutorial-target="debate-moderator-title"]',
      },
      {
        heading: "Shape a balanced motion",
        body: "In Basic, describe the idea in ordinary words and choose Build the debate. Prism makes one balanced motion, names both sides, and writes the briefs you should not have to author; Try another version gives you a fresh framing. Across Territory / Your idea, Prompt Center prompts insert as ordinary editable text, while wildcard rolls stay as chips until you Build or Refract—the surprise fills then, not while you type. A `{VAR}` inside a Prompt Center body means “whatever you typed after the /prompt.” You may repeat `{VAR}` in that body; there is only one shared capture and no A/B/C letter links. The floating Prism remains available throughout setup and understands the bounded, unsaved workbench draft. Wield Prism into a glowing setup field—or use your Prism modifier + Space while that field is focused—for a contextual editable candidate shaped by the current format, Rowdiness, role, cast, motion, and evidence. Space rerolls; Enter, Tab, or clicking another input accepts; Escape or a non-input outside click restores the original. Advanced restores three motion choices and direct editing of every field. The territory dice remains available for a fast local catalog seed.",
        clickLabel: "Build the debate",
        targetSelector: '[data-tutorial-target="debate-synthesize"]',
      },
      {
        heading: "Cast the room",
        body: "Basic asks you to choose the two advocates while Prism takes the center Judge / Moderator seat, gives the automatic neutral introduction, then stays publicly silent and inactive until you act. Your gavel, question, pause, resume, and final ruling use that same avatar and player voice. After your ruling, both advocates react once before Prism gives the automatic neutral procedural close; Prism never invents a Judge action or changes your result. Surprise me can fill both sides. Advanced adds Participant and Spectator roles, a Library moderator, Random actors, and the optional five-seat Jury. Participant is Forum-only: choose your side, and PRISM becomes that entire advocate, leaving exactly you, the bot Moderator/Judge, and one bot opponent. Spectator keeps all three floor holders as Library bots and seats PRISM in the observable audience gallery below the chamber screen so you watch from the crowd. Only duplicate bot seating is blocked; Powers never make a bot ineligible for a role.",
        clickLabel: "Debaters",
        targetSelector: '[data-tutorial-target="debate-cast"]',
      },
      {
        heading: "Secure advocacy consent",
        body: "Choose Make sure they’re willing after the question and debaters are set. This private LLM check protects every bot advocate: every Persona gives a short in-character comment on the assigned side, a genuine boundary can decline and cannot be overridden, and a willing Devil’s Advocate keeps their identity and receives visible framing. Their answer stays on this step so you can read it; after every required advocate accepts, choose Add optional evidence to continue. A Participant is one of the two debaters, so PRISM holds their selected side directly and only the opposing bot needs advocacy consent. Changing the motion, cast, format, or formality clears the old check. Changing a Participant side does too.",
        clickLabel: "Make sure they’re willing",
        targetSelector: '[data-tutorial-target="debate-consent"]',
      },
      {
        heading: "Freeze one shared record",
        body: `Evidence is optional. Add evidence asks Prism for one surprising contextual {ADJECTIVE} {OBJECT} suggestion, such as Rusty spoon, grounded in the current motion, sides, cast, and existing exhibits; the built-in object deck is only a reliable fallback when contextual generation is unavailable. Find sources for me runs a real-source Brave search from the motion in AUTO or ONLINE, and Prism never fabricates sources. Add URL accepts your own public HTTP or HTTPS source in either setup mode. AUTO and ONLINE can read a bounded page title and excerpt for you to review and edit; a failed read keeps the draft open for manual completion. LOCAL never accesses the page, so you supply the title and the exact summary both sides may use. Sources and exhibits share one clear record, up to ${DEBATE_EVIDENCE_ITEM_MAX_COUNT} items; duplicate URLs are rejected and later searches add distinct sources without replacing earlier ones. You can Wield Prism into the adjective, object, or observable-fact fields for a candidate that considers the current Debate without inventing provenance or significance. The exhibit emoji follows the object name automatically. Click it to open emoji search: type an object, idea, or relevant term, then choose from the three best live matches. You can close the search without changing the current emoji. You can also upload a PNG, JPEG, or WebP, choose a previously synthesized Debate sprite to restore the naming options that created it without spending more image-generation tokens, or synthesize a new consistent transparent exhibit sprite. A floating Prism progress card stays visible for the full synthesis operation, then dismisses when the sprite is ready or generation fails. Debate sprites stay in this tool-specific shelf instead of mixing into the general Images panel. Its approved title and observable fact are the evidence; the visual adds no facts. Sources and exhibits freeze together with the Debate. LOCAL blocks research and page reading before network access, while manual URL records, notes, object exhibits, emoji, uploads, reuse, and configured local image synthesis remain available. Debate never reads or writes relationship memory.`,
        clickLabel: "Evidence",
        targetSelector: '[data-tutorial-target="debate-evidence"]',
      },
      {
        heading: "Read the launch circuit",
        body: "The ready check stays visible beside every Studio tool. It shows whether the question, debaters, and consent are ready, and whether Topic, Debaters, and Evidence have each been opened once. Evidence itself stays optional—you only need to visit that screen before Start unlocks. When those locks are ready, Launch circuit becomes Start Debate, and the Evidence packet also offers Start so an open exhibit preview cannot hide the launch control.",
        clickLabel: "the ready check",
        targetSelector: '[data-tutorial-target="debate-readiness"]',
      },
      {
        heading: "Open the proceeding",
        body: "Choose LOCAL, AUTO, or ONLINE and a primary Debate model in the navbar before setup work. AUTO quietly retries a failed or malformed generation through the fallback chain saved in Settings. Start stays locked until the question, debaters, consent, and a visit to Topic, Debaters, and Evidence are all complete. When ready, choose Start Debate from Launch circuit in the left Studio rail, from the Evidence packet, or from the ready check. Start then freezes that ordered chain and the format version with the cast, sampled Jury, motion, consent, evidence, and resolved Powers; every generated statement and ballot records the model that actually handled it. The frozen center authority always opens and closes the Debate. In a human-Judge session, Prism delivers the automatic neutral introduction; bot-controlled floors then advance around an inactive center seat until you act. Your final ruling stays authoritative, both advocates react to it once, and Prism gives only the neutral procedural close. In bot-moderated sessions, the moderator closes after the verdict and any Jury aftermath. If the whole chain fails, the proceeding pauses on the exact non-bookend action and offers Retry or Skip without dialogue; openings and closings fall back to neutral procedural copy, and Jury ballots are Retry-only. LOCAL remains a hard offline guarantee. The in-room Judge console keeps one contextual Gavel control, Pause or Resume, and End Debate together beside the proceeding instead of in the app chrome; its label becomes Intervene while an advocate holds the floor and Call time during overtime, and Space invokes that same context-aware control; Participant and Spectator sessions use the same in-room Proceeding console without the Judge-only controls. Pause takes effect immediately, even during the semantic intervention cooldown. That control click authorizes the saved call-to-order performance, so a human Judge is never asked for a second Space press or gavel click. Resume works the same way, preserves the exact next juror, discussion turn, ballot, or interrupted line, and calls the proceeding back to order without a second prompt. The cooldown governs semantic interventions within that gavel control, not audience order or lifecycle controls. Pause and Resume remain live procedural presentation only; neither housekeeping beat enters the readable proceedings or copied transcript. End Debate skips the remaining rounds: a Jury holds only three discussion turns and is told not to penalize unheard rounds. When formal Jury deliberation arrives, a timed choice appears over the current camera. Auto is the default and begins after the Debate-settings countdown; Spectators and human Judges can choose Watch Jury to hear and view the deliberation live. The Jury remains advisory to a human Judge. Skip moves directly to final ballots. Skipping remains available after discussion starts—even during a juror’s current statement—and preserves all five final ballots and the full five-ballot Jury result. Judge and Participant input otherwise waits indefinitely until you act or pass.",
        clickLabel: "Start Forum or Start Turnabout",
        targetSelector: '[data-tutorial-target="debate-start"]',
      },
      {
        heading: "Use the Judge’s gavel",
        body: "When you are the Judge, the public gallery is alive in both Forum and Turnabout. Its visible gallery badge and four-bar meter move deterministically from settled to murmuring, restless, and disruptive; the chosen Rowdiness controls how quickly the room heats up. Portrait crosstalk and layered room audio grow with it, with protected mix headroom for reactions and the gavel. Captions stay readable and the crowd never changes an argument, ruling, ballot, or outcome. A restless gallery also makes the next advocate's saved output begin with an actor direction such as *speaks loudly* or *yells over the crowd*; Premium passes that direction to ElevenLabs while the spoken words remain clean. Gavel is one context-aware physical room-control action. Use the control attached directly to the gallery, the mirrored Judge-console control, or press Space to strike. In its audience-order state, it forces the Judge / Moderator camera, cascades the gallery into silence, and clears the crowd voice immediately without stopping the speaker or reveal. An early strike earns only a brief awkward freeze and spectator glances—there is no authority penalty. The saved order cue preserves its exact heard position for replay while staying out of Proceedings, copied records, the case board, ballots, and AI context. Extra strikes during the two-second smash window are local showmanship, with only one canonical order cue saved. At saved procedural moments, a ceremonial cue waits for your strike without authoring one for you. If that cue expires, the interface stays clear while Auto silently cuts to one advocate and then the moderator before the proceeding carries on. Space serves that ceremonial cue first. During an explicitly started call-time burst, Space adds showmanship strikes next. Otherwise the single Gavel / Space input follows the live floor: Intervene while an advocate is speaking, Call time in overtime, and ordinary audience order when no semantic cutoff is available. An intervention stops the active floor, opens the Judge choice deck, and keeps the eight-second semantic cooldown. While semantic intervention cools down, the same gavel falls back to non-interrupting audience order and the amber countdown explains when Intervene returns. If Space is temporarily blocked by a pending ruling, intervention, pause, Jury floor, or saving strike, the chamber explains why instead of failing silently. During advocate overtime it becomes Call time; choosing it starts the existing two-second procedural burst, with repeated Space strikes shaping the measured, firm, or aggravated call-time performance. Pause, Resume, semantic intervention, and ceremonial order cues also settle the room. An advocate objection remains different: the interrupter literally shouts “Objection!” and states the challenge first, then a timed Sustained / Overruled choice takes focus; press S or O without reaching for the buttons. While that ruling is pending, room controls stay locked. Once Jury deliberation begins, the Jury owns the floor: the unified Gavel and Space are put away, while Skip deliberation remains available. Your selected camera mode survives every forced gavel shot, so Auto resumes directing as soon as the strike finishes.",
        clickLabel: "Gavel",
        targetSelector: '[data-tutorial-target="debate-judge-gavel"]',
      },
      {
        heading: "Read the living case",
        body: "Both formats stage every frozen floor holder behind an authored side podium, with the moderator elevated between them when the cast can perceive that body. Bot advocates use their actual animated bot; a Participant's selected side uses PRISM as the human debater's public body. When a speaker cites evidence, that exhibit or source stays on the chamber table until another piece replaces it, or until the next advocate or Participant discussion turn moves on without citing it; moderator beats, Judge gavels, and gaps between turns leave it in place. The motion stays titled across the top of the chamber while perceptible words appear as synchronized broadcast captions along the bottom; a CC button at the top-left of the screen toggles those captions on or off and remembers your choice. Public prose arrives with the live voice; inaccessible speech never enters captions, voice, the shared case board, or listener-facing ballot reasons. A voiced player line containing a recognized asterisk cue such as *yells* gives Premium an ElevenLabs performance direction; with Voice Effects on, fart, burp, and cough actions play their bundled Foley at the authored cue. On a sparse replay-stable roll, an advocate or visible juror whose own saved Persona genuinely finds an audible contribution contrary to expectation or newly explanatory may give one short in-character vocal reaction; a Signal-style *tag* appears above that bot while it speaks through the bot’s voice, and like Signal it stays out of Proceedings and copied transcripts. Sparse ambient throat-clears, sighs, and inhales also float the same overhead tags and speak the same way. It is atmosphere, not a new argument, vote, role change, relationship-memory read, or hidden Power reveal. In Participant sessions, PRISM is the complete selected-side advocate and carries your thinking, speaking, interjection, and objection states. It labels the live line “PRISM · You” while the saved event remains player-authored. Each visible podium carries its floor holder's glyph; the current turn glows even when it is silent, so the cue follows floor ownership rather than speech or prose while stable identity remains canonical. Frozen faces, ink, frame finishes, visibility, thinking, listening, and speaking states remain live throughout the proceeding. Judge choices take over the caption position at the moment of decision; Participant Forum actions and Turnabout actions rise in a full-width command deck. Forum keeps the scoreless case board and gives a Participant two distinct ways to break an opponent's live floor. Ordinary Interject sends the point already typed as one complete cut-in. Objection is immediate: press O or choose Objection! to stop at the audience-heard fragment and literally shout “Objection!” first; the reason dock then waits for the grounds instead of making you type through the opponent's speech. State the reason and the bot Moderator/Judge rules Sustained or Overruled. Sustained leaves the cutoff in place, while Overruled returns the opponent's floor for a concise continuation. Withdraw objection also returns the floor, records the withdrawal instead of a ruling, and lets the opponent finish. Only the heard fragment remains public before either path resolves. Separately, Turnabout uses a public statement record: Press asks for clarification; Object opens the frozen evidence vault; Present Evidence sends one statement-and-evidence pair for grounded validation and an immediate ruling. Sustained contradictions create explicit reversals without inventing evidence. With Jury off, reduced-detail spectator bots face neighboring seats and trade quiet ellipsis chatter without gaining the floor or a vote; a dry gallery murmur remains a separate audio layer. With Jury on, that strip becomes the frozen public roster.",
        clickLabel: "the living case board",
        targetSelector: '[data-tutorial-target="debate-case-board"]',
      },
      {
        heading: "Enter the Jury chamber",
        body: "Spectators and human Judges can open the five-seat Jury camera manually when Jury is enabled, and Auto also enters the chamber for leanings, deliberation, final ballots, and the foreperson’s split before returning to the forum for advocate aftermath reactions. The jurors follow the live case and trade short reactions between public-floor turns. An ellipsis beside a juror means a thought is waiting; enter the Jury camera before the next thought and that juror will deliver it, while another camera lets them resolve immediately without holding up the proceeding. PRISM matches the Light or Dark table, seats bot faces and frames around its transparent foreground, and carries active-speaker color, gaze, thinking, listening, speech, voice, and applicable visual Powers into the room. Five private leanings lead into five short routed discussion turns and five final ballots. Each audible juror reads the same final reason saved in the Jury record while their anonymous mark slides into a pile at the table’s center; a canonically silent juror still casts without gaining a voice. The foreperson then reads the split. For a human Judge, the chamber is live and named but remains advisory; the Judge’s own final ruling still controls the Debate. Participants never mount this chamber; their camera stays on the public proceeding while five anonymous marks resolve into the aggregate. Manual public-floor cameras stay out of the chamber unless an eligible Spectator or human Judge chooses Jury or Watch Jury.",
        clickLabel: "the Jury chamber",
        targetSelector: '[data-tutorial-target="debate-jury-chamber"]',
      },
      {
        heading: "Frame the floor",
        body: "Auto is the quiet default camera: it cuts instantly to Left for the For advocate, Moderator for the moderator, Right for the Against advocate, and Wide whenever no bot owns the public floor. Sticky evidence can stay on the table without forcing Wide—speaker shots keep priority while the pedestal remains visible. When you take the Judge / Moderator seat, the public floor stays on Auto instead of exposing manual Left, Moderator, Right, or Wide shots. If Jury is enabled, Jury becomes the Judge’s one additional camera, and Watch Jury enters the live advisory chamber. Auto also visits the Jury chamber for leanings, deliberation, ballots, and the split, then returns to the forum for advocate aftermath reactions. Returning to Auto restores the directed public proceeding when you have locked a manual Jury shot. Participant and Spectator sessions retain manual public-floor cameras; Spectators can still choose Jury manually or choose Watch Jury in the timed deliberation prompt. In Participant and Spectator sessions, procedural gavel cues direct Auto to Moderator: one strike calls attention at every phase change, while two restore order for moderator rulings and verdicts, with the active moderator’s color carried through the instrument. Advocate objections carry no predictive gavel cue; the objection is heard before any bot moderator responds. A human-Judge session automatically activates the center seat for its neutral introduction; after that, explicit Judge actions alone reclaim the center seat and gavel until the final ruling. The advocates then react before the automatic neutral center close. Any actual gavel slam briefly forces Moderator and disables camera controls through the swing without replacing the selected mode; Auto resumes as soon as the forced shot ends. A canonically silent bot moderator can use that visible signal without speech. Forum and Turnabout keep the procedural rhythm for bot-moderated roles; Turnabout keeps an extra strike for a public revelation. The gavel is visible only in Moderator view. Choose a manual view to hold the shot outside forced strikes when your role allows it. Camera choice changes presentation only—it never changes the saved transcript, case board, ballots, or speaking order.",
        clickLabel: "a Debate camera",
        targetSelector: '[data-tutorial-target="debate-camera"]',
      },
      {
        heading: "Follow and keep the record",
        body: "Proceedings render safe Markdown and source chips in the chamber's tonal transcript rail. It follows every growing live turn until you deliberately scroll back; choose Live to return to the newest phrase. Juror thoughts, deliberation, and Signal-style vocal Foley reactions stay out of Proceedings. After the verdict, Judges and Spectators get a sibling Jury commentary panel under the rail, with Copy Jury transcript beside Copy verbose transcript whenever the record is copyable (not for Participant-sealed Jury). That Jury transcript remains directly copyable from its eligible Proceeding archive entry after you return to the Studio. The Verdict rail also shows a Coffee-style session summary and a temporary pick-a-bot inquiry chat so you can ask about a cast member’s frozen in-debate reasoning — nothing is saved, and positions stay as they were. With Jury off, a human Judge's ruling is final, a Participant's bot Moderator/Judge decides the result without inventing a PRISM ballot, and a Spectator Duel uses the traditional three-bot majority. With Jury on, the majority binds Spectators and Participants but advises a human Judge. After a Participant verdict, only the bot opponent may react before the bot Moderator/Judge closes; PRISM never invents a human reaction. Spectator verdicts still let both bot advocates react before the bot Moderator closes. In Judge sessions, the human ruling is followed by both advocates’ reactions and an automatic neutral center close. Judge and Spectator records keep named deliberation and ballots; Participant API responses, transcript copies, archives, and replay-facing event data retain only the aggregate split and verdict. Every archived Debate keeps a short title synthesized in the selected Rowdiness while preserving the exact motion beneath it. Open resumes or replays that proceeding; Use setup copies its motion, title, room settings, cast, role, Jury choice, and evidence into a fresh editable workbench without changing the original. Results and old consent do not carry over, unavailable Library bots must be reassigned, and your currently selected model and routing remain in place for the rerun. Copy verbose transcript creates one review-ready role-safe record with frozen setup, runtime snapshots, evidence, event metadata, interruptions, moderator rulings, case-board state, and permitted public ballot reasons.",
        clickLabel: "Copy verbose transcript",
        targetSelector: '[data-tutorial-target="debate-copy-transcript"]',
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
        body: "Complete this show is resumable: Signal uses and can sharpen your editable premise inspiration while it fills only the missing text identity, transparent logo, and matching Dark-to-Light studio pair, keeping any generated or uploaded artwork already installed. The activity card tracks visuals as they land one at a time in the background, so you can keep using PRISM, and rerunning it retries only unfinished pieces. Its cached ElevenLabs ident and studio-specific room-and-Foley loop join the same pass when you are Online; in LOCAL, Signal finishes the supported pieces and leaves audio waiting without breaking privacy. The gear at the bottom-right is always available to tune the premise and name, regenerate blurbs, adjust the logo, linked studio pair, or atmosphere audio, or replace either studio visual with your own image. Before another artwork pass, its Signal-only shelf offers previously generated Light studios, Dark studios, and logos for instant reuse with no image-generation spend; these tool assets stay separate from the general Images panel. An echo-bound host gets one persona-shaped boast about always having something original to say—and repeats that same blurb forever instead of rotating a batch.",
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
        body: "The Voice picker in Signal’s top navbar matches Zen: Mute stays silent, English uses each bot’s local identity without ElevenLabs credits, Premium uses its ElevenLabs identity with local fallback, Babble keeps the selected local voice without intelligible words, and Bottish uses Prism’s procedural robot language. Signal lets a thinking pause stay quiet instead of filling it with scripted commentary. Eligible Premium listeners can still add a sparse throat-clear, light cough, sigh, exhale, or chuckle inside another bot’s line; it stays out of the transcript and is saved for replay. Bot ambient sips land only while the other bot is talking; when you Choose Me, your cup moves only after you click Sip coffee, and cup-return sounds stay synchronized with the visible cup motion. For eligible Premium voices, Eleven v3 automatically carries a non-neutral speaker mood into the next line; neutral speech stays untagged, and an explicit saved vocal reaction takes precedence. With Voice Effects on, host and guest sometimes take the same quiet mic-ready breaths before substantial lines; saved episodes choose them deterministically on replay. The direct stereo mix follows the host and guest’s saved stage positions subtly while their room reflections remain shared; mono playback stays centered and clear. Choose Voice before recording. When Signal begins master capture, it freezes that speaking type and English or Premium engine for both host and guest, locks the picker until finalization, and bakes the rendered mouth performance into the saved episode.",
        clickLabel: "the Voice picker in the top navbar",
        targetSelector: '[data-tutorial-target="botcast-voice-mode"]',
      },
      {
        heading: "Book tonight’s episode",
        body: "Choose one guest, set a short public episode title, and write optional private producer comments—or use Randomize booking to choose a guest and have the model in the top navbar build both together around what this host and the show’s listeners would genuinely want to explore. Across Signal setup and the on-air composer, selected Prompt Center prompts insert as ordinary editable text, while wildcard rolls stay as chips until you save, begin the episode, or send—the surprise fills then, not while you type. The compact Topic field remains a single-line title input. Choose Me — go on as the guest for a different contract: add optional interview direction, or leave it blank and let the host surprise you with a fresh show-shaped topic. Signal’s AI synthesizes the public topic, private interview plan, and every host question without inventing facts about you. During that recording you answer through the standard composer at the bottom—also with /prompts and !decks—while queue cards, nudges, live direction, bot Powers, and AI-written guest turns stay out of the human guest lane. Every episode is a fresh, non-canonical meeting: persona lore shapes beliefs and voice without becoming a prior relationship between the cast. The generated public topic stays title-like; the richer provocative question, angle, boundaries, and follow-ups stay in the private comments. Both stay editable. The small dice beside Topic and Private comments can regenerate either field on its own. Latest episodes can restore the guest, topic, private comments, available model override, and duration from a finished episode without starting it; your current episode mode stays in place. Signal freezes the host and guest’s ready Powers when recording begins. Hard visibility and speech-audience Powers also govern the broadcast itself: anything listeners cannot perceive is absent from the stage, captions, voice, replay, and Audience Pulse review. Those Powers can affect whether they have coffee at all, silence, response length, and the next direct response—including a trustworthy interviewer or interviewee drawing one more candid answer without overriding the other bot’s agency or boundaries. Hard bare-minimum and brief Powers stay bounded while allowing a required introduction, closing, or departure beat to finish. Each cast member interprets observable Power consequences through their own personality: one may become curious or amused, another irritated or cautious, while Signal never exposes a cause they cannot perceive or forces the same reaction twice. A radiant-joy cast member gives the directly addressed peer one bounded, persisted mood lift after each spoken turn; the peer's next line shows the lift in their own voice without forced agreement or denial. After a bot directly talks to a sad-grouchy cast member, only that addresser receives one bounded, persisted mood drag; its next line shows less momentum through its own personality without forced hatred, hopelessness, or agreement. A ghostly cast member is unseen between lines, fades in only to speak, and may leave the other bot shaken without scripting its reaction; replay keeps that recorded reveal. An echo-bound cast member repeats the immediately preceding on-air cast line exactly; private producer comments never leak into that echo. When the echo-bound bot is the host, a bot guest takes the opening and closing so the host never gains original speech. If both cast members are echo-bound, Signal supplies one public opening cue made only from the show, cast, and topic; the first bot repeats it exactly and the other mirrors it, so the booking still goes live without weakening either Power. Hard mute and echo hosts can still take a Producer guest: a muted host leaves the on-air floor in canonical silence, while an echo-bound host opens once and then mirrors the Producer's last public answer exactly. The human guest decides how to respond to that strange interview instead of setup blocking the experiment. If a hard-of-hearing cast member asks what was said, the prior speaker repeats its saved on-air line and its saved delivery mood drops one step each time. Direct producer direction and closing safety still take priority. A muted cast member can still act and sip: physical actions float above their avatar and stay out of captions, their saved transcript line is only ..., and Signal never plays or previews their voice. If both frozen cast members are muted, Signal resolves a short visual exchange and closing instead of stretching silent turns into a full interview. Episode length defaults to Auto: no countdown, at least a few substantive guest answers, then a natural close when the conversation settles. Requests to repeat a question and tiny fragments do not count as interview progress; choose a timed target when you want one. Beginning the episode opens a short, skippable show-branded pre-roll while Signal prepares the host’s opening line and paces the next safe handoff ahead. If a selected local model is still loading when that pre-roll ends, PRISM holds the studio and pauses the episode clock until the opening is ready. The default stage places both bots in the authored chairs and cups only for bots who drink coffee. If generated studio furniture lands differently, Align stage opens a dedicated fullscreen placement workspace with a fresh Library guest for scale, plus Light and Dark preview buttons; drag the visible pieces—bots and cups—into place, or swap the host and guest seats together with any cups. Bots and cups turn inward from their new sides. Choose Left, Right, or Wide in the camera tuner to preview and independently save that camera’s zoom, horizontal pan, and vertical pan for this show. The real scene ambience and show-scoped room mix stay live there. Use the Host and Guest voice sliders to balance the cast; Signal remembers each bot’s level for this show. Test voices runs a random two-line soundcheck through configured voices except fully muted cast members, and never creates an episode or transcript. Signal saves that alignment and camera framing for every new episode of the show; each replay keeps the camera framing captured when it was recorded. Pick LOCAL, AUTO, or ONLINE in the top navbar, and choose the model there for tonight’s recording. AUTO uses that choice as Primary and recovers through your configured fallback chain; LOCAL and ONLINE lock the selected model for the episode. Signal locks that routing when the episode begins. The private comments shape the host but never go on mic. Eligible ElevenLabs voices automatically receive sparse, saved vocal reactions.",
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
        body: "Signal keeps transcript ownership with one primary speaker while allowing bot audio to overlap, and lets the studio performance own the live screen. The active line appears as a live caption after a brief half-second delay and clears as soon as that line ends; a CC button at the top-left of the screen toggles captions on or off and remembers your choice. The full transcript stays out of the initial play and returns with playback. When you are the Producer guest and the conversation panel is collapsed, the host’s latest prompt remains on stage in full while you answer; longer questions scroll gently in place so you never have to hold the whole question in memory. The listening host or guest may add a low-key nod, expression, nonverbal reaction, or brief contextual comment in that character’s own voice during the line. Ordinary listener comments never take transcript ownership or interrupt the primary turn, and most stay off-camera. An interruptive cast member’s Power can still seize live openings in any targeted bot castmate’s answer, with the interrupter voicing a short hold-on while the interrupted bot may overlap with an annoyed, abandoned ending when enough of the line remains to feel genuinely cut off. A Power authored to interrupt every time cuts each eligible bot turn without a random roll or cooldown, at a replay-stable point that can land early, in the middle, or late. Once at least 85 percent of the original line has been heard, the cut-in may still overlap, but the original speaker does not add an annoyed ending or reclaim the floor; as a guest, Interrupting Tom cuts every ordinary bot-host opening and interview turn, including producer-directed host turns; other interruption Powers retain their frequency, strength, target, and cooldown. Human Producer speech, warnings, departures, wraps, closings, and hard speech restrictions stay protected. Signal’s separate immersive reactions still belong to the performing bot, float above that bot, and are preserved between asterisks in the saved transcript without becoming fallback dialogue. In a normal bot-guest episode, the large bottom cue dock lets you ask about a detail, refocus, press harder, move on, lighten up, or wrap at any time; every cue is private to the host, and the guest only hears what the host says on mic. Tab selects or deselects the Ask about… box; Enter sends that cue, and Enter again runs Interrupt guest now when the guest has the mic or is next. Producer-guest episodes replace the cue dock with the bottom answer composer, so the AI host keeps sole editorial control. After several substantive exchanges, a host who genuinely refuses to continue can end the interview on mic and leave; Signal immediately archives the distinct Host ended the show outcome instead of inventing a normal sign-off. When a cue arrives early in the host’s own line, they are likely to break off and redirect on mic with an in-character self-correction, even if the live pivot lands a little awkwardly. Once most of the point is already out, the cue stays queued for the host’s next turn. If the guest has the mic or is next, Interrupt guest now plays one of that host’s saved short interjections immediately while a meaningful cutoff can overlap with the guest’s annoyed ending and the host’s continuation generates. Once at least 85 percent of the guest’s line has been heard, Signal keeps the cut-in but omits that annoyed follow-on. Any unheard remainder of the guest’s line is discarded from the saved transcript and replay, so only what reached the audience remains. Wrap it up privately asks the host to steer the exchange to a real ending. The on-air clock shows elapsed episode time and freezes on the final duration. While Signal is on air, the shows rail hides and the utility strip locks like Coffee—routing, model, Voice, Settings, Usage, Memories, Images, Bots, Theme, and app switching stay closed through the closing card until you Return to show. The Animated or Instant camera control remains available because each live directing choice is baked into its camera cue. Cut show stops the current line and discards the episode when the on-air clock is still under ten seconds, with no host sign-off or saved archive. After that, it catches the host slightly off guard and gives them one quick, tactful sign-off before Signal archives the recording and restores the full chrome. Natural endings and producer cuts give the host a distinct formal closing beat after the takeaway to thank the guest and the audience before the stage fades to black or white and the short, locally synthesized closing card appears. A clear in-character guest goodbye ends their turns, preserves the empty-chair aftermath, and gives the host one closing beat. Freeform producer pressure or Press harder can instead earn resistance, a warning, and, rarely, a walkout.",
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
        body: "Choose one source for new work: a creative spark or pages you already wrote. Bringing existing material replaces the spark controls so Slate never blends the two; clear chapter headings become focused imported sections, while ambiguous formatting stays byte-for-byte in one Imported manuscript. Optional {wildcards} remain only for spark-led work. Confirm the working title yourself, or let Slate suggest one and keep the final decision. Mirror setup is never required before you can write.",
        clickLabel: "the project start or return card",
        targetSelector: '[data-tutorial-target="slate-create-project"]',
      },
      {
        heading: "Choose one shared route",
        body: "The navbar’s LOCAL, AUTO, and ONLINE controls and model picker are account-wide. Change either here and the other applets see the same default; Slate projects on Auto follow it immediately. A project you deliberately pinned to Offline, Online, or a specific model in Project tools keeps that explicit override.",
        clickLabel: "LOCAL, AUTO, ONLINE, or the model picker",
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
        body: "Project tools holds optional project-specific prose routing and model overrides, clean exports, portable backup and recovery, title and cover actions, and the temporary Lux and Umbra desk. Leave routing on Auto to follow the synchronized navbar defaults. These controls leave the cockpit again when you close the drawer. History opens its own focused desk for safe provenance, examples, and a current-section Slate Review export—never hidden reasoning.",
        clickLabel: "Project tools",
        targetSelector: '[data-tutorial-target="slate-project-tools"]',
      },
      {
        heading: "Talk beside the document",
        body: "Use the Prism companion to catch an idea without leaving Slate. It can see the project and focused section names, not manuscript prose, Continuity, or memories; it never edits the document. To discuss exact prose, select only that passage and choose Discuss in Zen. Prism previews the exact excerpt that will cross surfaces before anything is sent.",
        clickLabel: "the global Prism companion",
        targetSelector: '[data-tutorial-target="prism-companion"]',
      },
    ],
  },
};

const SIGNAL_PRODUCER_GUEST_TUTORIAL_SUFFIX =
  "The host introduces and addresses you on air by your account name, or by whatever you previously asked that host to call you when it remembers a preference. Signal represents you on stage with your configured face and glyph; Coffee keeps you off camera with the pot during the live table, then seats you as Default Prism for replay. While you are on the show, Sip coffee animates your stage mug and face with room Foley without sending a transcript turn. The bottom composer stays editable while the host speaks: Send cuts the host at the exact words the audience heard and puts your answer on mic immediately, while Shh cuts the host without clearing your draft. Once the host yields with a question, the episode clock runs at half speed while you compose; replay compresses that pause to the same half-speed duration, then returns to normal time for your answer. Type stage direction in the separate Action field without asterisks; typing exactly ** in the speech field moves focus to Action. With Voice Effects on, fart, burp, and cough actions play matching room Foley live and in replay. The saved turn still keeps that action above your on-stage presence and out of the spoken transcript.";
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
const BOT_NAMING_POWER_TUTORIAL_SUFFIX =
  "A bot-name prefix or suffix changes only how its holder names other bots: the holder keeps their own name, the player and humans are untouched, and other speakers do not copy the habit. A bot who hears its own altered name may comment once, show a small contextual mood, tone, or action reaction, or let it pass; its personality and agency decide how the label lands.";
const COFFEE_GROUP_CREATION_LOADER_TUTORIAL_SUFFIX =
  "Creating a new Coffee Group saves the table immediately, then its Name, one-sentence Ethos, and character-free Atmosphere finish independently. The Ethos softly shapes topic ideas, routing, and replies without becoming a quoted agenda. Each identity item remains editable or independently retryable, so one failed item never blocks the table.";
const COFFEE_PRISM_PRESENCE_TUTORIAL_SUFFIX =
  "Prism's floating assistant steps out once the live Coffee Session begins and returns for setup, review, and replay.";
const COFFEE_CROSSTALK_SOCIAL_SILENCE_TUTORIAL_SUFFIX =
  "An interrupted bot may instead reject the cut-in and immediately reclaim its unfinished thought from only the words the table actually heard; that reclaim gets one protected handoff so it cannot be cut off again immediately. Repeated cutoffs build session-local irritation toward that interrupter: reclaim grows more likely, delivery sharpens, and short verbal snark can appear while sparse Foley stays rare; calm turns cool the tension. Ordinary bots may also answer with a visible ... as an intentional social beat. That silence holds the table without voice or mouth movement, may volley for up to four ordinary turns, and then requires a substantive reply; hard mute Powers keep their existing precedence.";
const SIGNAL_CROSSTALK_SOCIAL_SILENCE_TUTORIAL_SUFFIX =
  "The interrupted bot may instead reject the cut-in and reclaim the next turn from only its audience-heard fragment; Signal protects that single reclaim from another immediate interruption, then resumes normal host-and-guest pacing. Repeated cutoffs build episode-local irritation toward that interrupter: reclaim grows more likely, delivery sharpens, and short verbal snark can appear while sparse Foley stays rare; clean turns cool the tension. Ordinary cast members may also leave a visible ... as an intentional silent beat. It holds the live caption without voice, mouth movement, or a speaker camera cut, may volley for up to four ordinary turns, and then requires a substantive on-air payoff; hard mute Powers remain unchanged.";

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

function currentSignalPowerTutorialBody(step: ModeTutorialStep): string {
  return currentInterruptionRetortTutorialBody(step.body)
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
      "Refract replaces the old Topic and Private comments dice: hold Option on macOS or Control on Windows and Linux to Wield Prism, then click either glowing registered field. You can also focus it and press Option Space or Control Space, or drag the Prism orb onto it. Space rerolls after a draft settles; Option-clicking the same control on macOS or Control-clicking the same control on Windows and Linux does too. Enter, Tab, or clicking another input keeps the current draft. Option-clicking a different registered control on macOS or Control-clicking a different registered control on Windows and Linux also keeps the current draft, then moves Prism into that new control. Escape or an ordinary non-input outside click restores the original.",
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

export const MODE_TUTORIALS: Record<TutorialMode, ModeTutorial> = {
  ...BASE_MODE_TUTORIALS,
  debate: {
    ...BASE_MODE_TUTORIALS.debate,
    steps: BASE_MODE_TUTORIALS.debate.steps.map((step) =>
      step.heading === "Follow and keep the record"
        ? { ...step, body: currentDebateRecordTutorialBody(step.body) }
        : step,
    ),
  },
  zen: {
    ...BASE_MODE_TUTORIALS.zen,
    steps: BASE_MODE_TUTORIALS.zen.steps.map((step, index) =>
      index === 0
        ? {
            ...step,
            body: `${step.body} ${IDENTITY_SHAPESHIFT_POWER_TUTORIAL} ${FRESH_CONTACT_POWER_TUTORIAL_SUFFIX} ${SIMULATION_EVANGELIST_POWER_TUTORIAL_SUFFIX} ${BOT_NAMING_POWER_TUTORIAL_SUFFIX}`,
          }
        : step,
    ),
  },
  chat: {
    ...BASE_MODE_TUTORIALS.chat,
    steps: BASE_MODE_TUTORIALS.chat.steps.map((step, index) =>
      index === 0
        ? {
            ...step,
            body: `${step.body} ${IDENTITY_SHAPESHIFT_POWER_TUTORIAL} ${FRESH_CONTACT_POWER_TUTORIAL_SUFFIX} ${SIMULATION_EVANGELIST_POWER_TUTORIAL_SUFFIX} ${BOT_NAMING_POWER_TUTORIAL_SUFFIX}`,
          }
        : step,
    ),
  },
  coffee: {
    ...BASE_MODE_TUTORIALS.coffee,
    steps: BASE_MODE_TUTORIALS.coffee.steps.map((step, index) => {
      const body = currentInterruptionRetortTutorialBody(step.body);
      return index === 0
        ? {
            ...step,
            body: `${body} ${COFFEE_GROUP_CREATION_LOADER_TUTORIAL_SUFFIX} ${POWER_EXCLUSION_TUTORIAL_SUFFIX} ${IDENTITY_MIRROR_POWER_TUTORIAL_SUFFIX} ${IDENTITY_SHAPESHIFT_POWER_TUTORIAL} ${FALSE_NAME_POWER_TUTORIAL} ${FRESH_CONTACT_POWER_TUTORIAL_SUFFIX} ${SIMULATION_EVANGELIST_POWER_TUTORIAL_SUFFIX} ${BOT_NAMING_POWER_TUTORIAL_SUFFIX}`,
          }
        : step.heading === "Join the conversation"
          ? {
              ...step,
              body: `${body} ${COFFEE_CROSSTALK_SOCIAL_SILENCE_TUTORIAL_SUFFIX}`,
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
            body: `${body} ${SIGNAL_AVATAR_SCALE_POWER_TUTORIAL_SUFFIX} ${POWER_EXCLUSION_TUTORIAL_SUFFIX} ${SIGNAL_ADDRESSED_FANDOM_POWER_TUTORIAL_SUFFIX} ${IDENTITY_MIRROR_POWER_TUTORIAL_SUFFIX} ${IDENTITY_SHAPESHIFT_POWER_TUTORIAL} ${FALSE_NAME_POWER_TUTORIAL} ${FRESH_CONTACT_POWER_TUTORIAL_SUFFIX} ${SIMULATION_EVANGELIST_POWER_TUTORIAL_SUFFIX} ${SIGNAL_PRODUCER_GUEST_TUTORIAL_SUFFIX}`,
          }
        : step.heading === "Produce from the control room"
          ? {
              ...step,
              body: `${body} ${SIGNAL_CROSSTALK_SOCIAL_SILENCE_TUTORIAL_SUFFIX}`,
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
