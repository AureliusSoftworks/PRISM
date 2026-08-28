import { DEBATE_EVIDENCE_ITEM_MAX_COUNT } from "@localai/shared";
import { prismDeveloperAuthoringEnabled } from "./prismDevGating.ts";

const DEBATE_STAGE_LAYOUT_TUTORIAL_ENABLED = prismDeveloperAuthoringEnabled({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_PRISM_BRANCH: process.env.NEXT_PUBLIC_PRISM_BRANCH,
});
const DEBATE_STAGE_LAYOUT_INTRO_COPY =
  " Stage layout opens direct placement for every Forum element. Its canonical Main arrangement is saved for this account and device, and the live proceeding and its replay use that same authored layout.";
const SPEECH_INTENT_REVEAL_TUTORIAL_SUFFIX =
  " After a committed primary Gibberish line settles, What they meant privately fetches its exact clean intent for you; closing the card clears it, while captions, audio, memories, replays, transcripts, and exports stay gibberish-only.";

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
        body: "The Bots hub's larger Bot Foundry offers three paths. Create new bot keeps the standard brief. Inspire a new bot blends one to five selected Library influences, independent influence weights, and overall resemblance into a distinct identity without cloning a name, biography, signature phrasing, or Power. Batch create bots opens a dedicated constellation chamber for one shared brief across 2–100 bots and always creates one model-authored Library group. Its fixed indexed seeds never reorder while work finishes concurrently: counts 2–20 reveal through the shared mini avatar, while 21–100 use the shared static micro face inside each generated color-and-glyph orb. Counts 2–10 automatically generate and save every rich full draft, including selected one strong, two moderate, or three weak compound Powers, then open the completed group dashboard without entering Avatar Studio. Counts 11–100 switch visibly to lean personality-first generation, force Powers and bespoke avatar, Ink, and SFX customization off, but still assign every member a persona-aware voice and saved Accent Map casting. Fictional and original personas keep its pronunciation off until enabled; historically accurate real-person castings begin on. They save members automatically with recoverable progress, then open the completed group dashboard. Standard and Inspire keep the Creation chamber shell, editable Character Brief, and Avatar Studio path. There, a new shell drops onto the Creation chamber's central dais before synthesis. Grab it by the chassis and fling it across the platform, or use the keyboard; meaningful floor impacts rearrange only its glass grime and metal wear, never its finish. Reduced Motion settles it calmly. The real Prism stays at an authored chamber anchor during generation so the radial light remains a static line to the shell. Compact readouts name the module being populated and every module already seated—there are no fake percentages. The main CRT auditions bounded eyes-and-mouth combinations while only the buckle cycles real bot glyphs; both screens fill upward in the bot color. Awakening crests both screens white, drives every light to its brightest point, then releases one restrained spark and smoke wisp. Chassis lights share one accent color and stay fully dark only while a new manual shell is completely blank. The first meaningful identity choice wakes a slow, dim breath; generated drafts and existing bots are already alive. Type the Character Brief yourself or Wield Prism onto it to populate an editable direction. The shared navbar hides for the whole foundry so the chamber can fill the screen. Drafts and Power compiles use Prism's Refract picker in Synthesis; Auto still chooses model and effort when Refract is on Auto. LOCAL/ONLINE stays the privacy lane you set before opening the foundry. During active assembly, close and confirm to cancel generation and return to the foundry brief with the prior draft restored. Start from the perimeter dock—open Eyes first, then Mouth, Identity (Core or Shell), Ink Display, and the rest of the foundry tabs.",
        clickLabel: "the Eyes tab in the perimeter dock",
        targetSelector: '[data-tutorial-target="avatar-foundry-eyes-tab"]',
      },
      {
        heading: "Tune it with live controls",
        ...{
        body: "The established Eyes and Mouth controls operate the live bot across a much wider placement range. Eye movement also sets attention: Still ignores the cursor, while Natural through Paranoid progressively notice it from farther away, follow it more often, and move farther in the full-size bot-management and Zen views. Mini avatars stay fixed. The shared runtime renderer uses Full HD at 300px and above, Mini from 81px through 299px, and the first Micro stage at 80px and below. Micro keeps its face and Ink through 29px. At 28px and below, those details clear for a larger identity glyph. At 8px through 2px, the bot resolves to a fixed 4×4 square in its normalized, light-aware identity color; at 1px it becomes one literal identity-color pixel. Avatar Studio's compact Chassis scale covers one pixel through Badge, Room, Hero, and the 299px Mini ceiling; the main mannequin remains the Full HD reference. The face, Ink, frame, and buckle must remain registered together. At the transition, the same Chassis scale remains selected so you can compare without a size jump. After entering a custom eye glyph and choosing Two eyes, Eye spacing moves both glyphs symmetrically around their shared center without changing their authored rotation. Default Blink makes custom eyes simply vanish and reappear on the stock blink timing. Visible blink bars remain opt-in, with their own One eye/Two eyes choice and Independent geometry when needed. For built-in and custom mouths, Default can enable Custom Speech: four compact Rest, Closed, Open, and Round poses follow the live speech timing, while disabling it restores ordinary speech shapes. None keeps a custom authored mouth completely still. Coffee * makes the custom mouth pucker and Speech ink switch together during Sip. The display stays fixed while you customize; only Ink Display unlocks drag-to-pan and cursor-anchored scroll zoom, with camera −/+ chips as an alternative. Its Move tool can carry any combination of Blink, Speech, and Effect ink together, while Auto moves whichever layer you grab. Search Stamps by name, choose one to equip it, position it with the grid pad, and resize it with scroll or the −/+ chips. Click the canvas or press Enter to place a stamp as ordinary editable ink; Escape cancels, and Move can reposition it later. Ink Display keeps the face and chassis lighting flat and hard-edged while you draw. At 150% zoom, a 128-cell grid appears only on the large face screen; each cell is exactly one size-1 brush pixel, while the buckle and Micro screens stay grid-free. Preview live briefly restores the finished phosphor glow and animation without leaving the canvas. Turn on vertical symmetry to mirror drawing around its seam, then drag either the top or bottom handle to place that seam; arrow keys nudge it one pixel and Shift moves faster. Speech ink has its own animation selector, so its motion can differ from the mouth. Five floating orbs preview Idle, Blink, Thinking, Sip, and Talking, with a label on hover; they stay hidden in Ink Display to keep the drawing workspace clear. Voice is a required three-stage casting flow—1 Accent, 2 Feel, 3 Voice. Place the Accent pin first; nearby-choice buttons disambiguate dense regions such as Britain, Ireland, Scotland, France, and Germany. The Pronunciation switch decides whether the saved pin affects synthesis: fictional and original personas default off, while historically accurate real-person castings and curated real-person Marketplace bots default on; moving the pin explicitly enables it. Feel shapes character and Pitch, Pace, and Lilt. Voice then offers distinct names such as Pia, Rowan, Iris, Sol, and Mira instead of engine regions, so changing timbre never moves the accent pin. In Premium, Surprise me auditions a different shared ElevenLabs preview without importing it; Wield Prism onto the Voice Library card to give that temporary casting pass a direction. Only Save to Library bookmarks the result in the private PRISM account library and assigns it to the current draft. The compact audition dock remains beneath the bot throughout Avatar Studio; edit one sample and compare English, Premium, Babble, or Bottish without adding anything to chat. Once awake, the lights stay dim and breathing; voice previews add only restrained microphone-like accents. For a surprise, use the control's own randomizer buttons. Prism stays visually submerged behind Avatar Studio and other top-bar panels, but Wield still brings its cursor light above eligible creative fields.",
        },
        clickLabel: "the live module controls",
        targetSelector: '[data-tutorial-target="avatar-foundry-controls"]',
      },
      {
        heading: "Find the rest of the foundry",
        body: "Identity, Eyes, Mouth, Details, Profile, Powers, Voice, SFX, and Settings remain available in the perimeter dock. On Identity, use Core for name and thinking, or Shell for the primary hue strip, badge, and subordinate Atmosphere accent. Hue chooses the bot's canonical fully saturated identity color without a separate brightness modifier. Accent Auto chooses a stable analogous environmental hue; selecting the Atmosphere hue control makes it explicit without repainting the avatar. On Mouth, 100% is the compact canonical size; the slider reaches much smaller mouths while retaining the prior physical maximum, and Reset restores the slightly down-left baseline. Eyes, mouths, thinking marks, Ink, and the lower badge all use the same phosphor brush. Settings → Appearance → CRT focus can soften or tighten that brush globally without changing any authored shape or color. Drafts and Power compiles use Prism's Refract picker—the same model that Wields a Power premise. Change that model in Prism → Synthesis, and switch LOCAL/ONLINE before opening the foundry if a local compile needs a stronger lane. In Powers, Wield Prism onto What makes this bot special? to generate an editable power premise in place. Reroll rune refreshes the generated name and rune together without changing the original prompt or compiled rule. Everything stays a draft until the top Save or Create bot action.",
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
        body: "Choose PRISM or a persona to focus that relationship’s Home. A first click focuses a persona; select the focused tile again to unfocus it; open its mini bot avatar for customization, or send a message to begin Zen/Chat. That panel can jump straight to any Avatar Studio section. It also shows every saved group containing the bot and, when your local auxiliary model is available, suggests other fitting saved groups; recommendations never leave your machine and nothing changes until you choose Add. Beneath the bot’s voice buttons, edit the sample line; English, Premium, Babble, and Bottish each play exactly what is in the box, while Speak uses the current top-bar Voice mode. None of these starts a chat or LLM turn. Ready Powers stay active with that persona here and across PRISM; a muted persona can still act, but only answers with ... and never speaks aloud, while a breathless persona still speaks but never produces breath, sigh, or inhale Foley; a Copycat persona may originate one opening if nobody has addressed it yet, then repeats the latest addressed message exactly. A short-term-amnesia persona only sees your current message each turn—no earlier replies or broader topic unless that message states it—and answers naturally without amnesia coaching. A John/Jane Doe persona sincerely believes a random persona name for the session and reshuffles that name whenever short-term amnesia clears continuity. An Obsessed persona treats you as the star of each reply with fresh, intense admiration, while your agency, privacy, and safety boundaries still win. A hue-prejudice or Racist persona snubs or favors other bots by phosphor color—never people or you—and with no color named it uses the opposite of its own hue. A radiant-joy persona makes that emotional warmth palpable without tracking or rewriting your mood. A sad-grouchy persona makes her draining presence equally palpable without changing your state; only bots that directly talk to her lose mood or motivation. Size Powers use six distinct presentations: Microscopic is unseen, Tiny is half size, Small is three-quarter size, Large is one-quarter larger, Giant is half larger, and Colossal fills and crops against the nearest edge. Names and controls stay normal-sized. Invisible fully hides the body and attached lights while preserving attributed text and speech. Loud and Quiet use fixed text and voice trims; in this one-person lane Quiet never removes a turn because there is no bot listener. A hard bare-minimum or brief Power is engine-bounded even if the model tries to elaborate. Clicking empty canvas space clears bot and hue focus while keeping the navbar’s current All Bots, Ungrouped, or saved-group selection. There, the canvas Prism orb opens the light radial for applets. Escape returns you to the wider Library or saved group grid exactly where you left it. Inviting a guest keeps you in the current Home.",
        clickLabel: "a PRISM or persona tile",
        targetSelector: '[data-tutorial-target="chat-bot-picker"]',
      },
      {
        heading: "Shape a saved group's room",
        body: "Selecting an authored saved club opens its living room without replacing its bot grid, and every valid member is present at once. The grid remains the fixed, fully interactive center of the room while the embodied bots appear in the open canvas around it and drift calmly like an aquarium; interaction, obscuring panels, and Reduced Motion pause that roaming. The room uses Mini avatars while space permits and switches the whole cast to Micro avatars when density demands it; it never rotates, paginates, or hides members. Generate atmosphere hands the job to Prism as soft synthesis, so its job count stays on the real assistant and its shared synthesis card can be opened while you continue using PRISM. The leading + uploads your own image, and recent group-room Atmospheres can be reused directly. View all opens the exact-type local library. In asset details, Reduce magenta applies one cumulative local color-key pass to the whole asset set; Undo last pass restores the preceding revision. Marketplace groups keep their stable bundled scene until you replace it.",
        clickLabel: "Atmosphere in the saved group header",
        targetSelector: '[data-tutorial-target="chat-group-atmosphere"]',
      },
      {
        heading: "Recognize the group",
        body: "Each saved group carries a Spectrum Tile made from its members’ colors and a restrained name monogram. Choosing a room Atmosphere turns that tile into a compact crop of the same scene, so the room and its identity stay visually connected. Right-click a bot card inside the group and choose Promote to leader; choosing another bot simply reassigns leadership. Leadership remains part of the group and follows exports and backups without placing a badge on the bot’s body.",
        clickLabel: "the saved group identity",
        targetSelector: '[data-tutorial-target="chat-group-spectrum-tile"]',
      },
      {
        heading: "Meet every bot in the club",
        body: "Every room presence is the real saved member in the club's authored order. Mini names stay visible; Micro names appear on hover or keyboard focus. In a dense room, activate a Micro bot once to promote it in place to Mini. Only one bot steps forward at a time, and Escape or the room background returns it to Micro. In an all-Mini room, activating a Mini opens that bot's full-screen Lobby immediately.",
        clickLabel: "a bot in the living club roster",
        targetSelector:
          '[data-tutorial-target="chat-bot-picker"][data-room-presence-button-bot-id]',
      },
      {
        heading: "Open the focused bot",
        body: "Activate the promoted Mini again to enter that bot's full-screen Lobby. The bot steps forward at full size while the club room stays mounted and undisturbed underneath. Overview keeps the bot, Talk to me, groups, and suggestions close; Customize holds Avatar Studio, memories, and Neutralize mood; Library holds connected resources and assets. A bot's soft global mood can carry across compatible modes, while Neutralize mood immediately returns it to a centered baseline without changing its persona or memories. Avatar Studio opens as a deeper editing layer and returns to the Lobby; Back, Close, or Escape returns to the exact same room bot and keyboard focus.",
        clickLabel: "the promoted or room Mini bot",
        targetSelector:
          '[data-tutorial-target="chat-bot-picker"][data-room-presence-button-bot-id][aria-label^="Open "]',
      },
      {
        heading: "See connected resources",
        body: "Resources is the bot's modular shelf for connected applets. A Signal show appears here only when this exact bot hosts one, with the show's saved logo; unavailable future resources do not leave empty Awards or progression placeholders.",
        clickLabel: "the Resources heading",
        targetSelector: '[data-tutorial-target="bot-hub-resources"] > header',
      },
      {
        heading: "Browse this bot's assets",
        body: "Assets groups this bot's linked image-library work into nonempty thumbnail rails. Choose a thumbnail to open the normal Asset Library with that exact item selected, or use View all to browse the bot and library together. Empty libraries stay out of the way.",
        clickLabel: "the Assets heading",
        targetSelector: '[data-tutorial-target="bot-hub-assets"] > header',
      },
      {
        heading: "Send a direct message",
        body: "The reserved composer dock at the bottom starts a fresh user-first one-on-one with this bot; it never silently appends to an older conversation. Talk to me is separate: it starts fresh with the bot speaking first. Enter sends, Shift+Enter adds a line, and a failed handoff leaves the message available in the destination composer.",
        clickLabel: "the focused bot message box",
        targetSelector: '[data-tutorial-target="bot-hub-composer"] textarea',
      },
      {
        heading: "Let the bot begin",
        body: "Talk to me starts a fresh bot-first one-on-one through the familiar conversation flow. Normal Powers, privacy and provider rules, memories, streaming text and audio, titles, and the bot's opening reply remain intact; PRISM also remembers the club-room return point.",
        clickLabel: "Talk to me",
        targetSelector: '[data-tutorial-target="bot-hub-talk-to-me"]',
      },
      {
        heading: "Let the companion move",
        body: "In a live Zen conversation, drag the bot from its body or quiet canvas space. A deliberate release can coast and bounce within the room; ordinary clicks and the context menu stay put. The bot faces each horizontal move immediately, with its face and authored Ink turning together while its persona glyph stays readable. The bot may rest over prose or chrome. At a very large desktop size, Zen becomes a two-column reading room, and moving the bot across the midpoint swaps the bot and prose sides. Reduced Motion keeps direct dragging but removes roaming and coasting.",
        clickLabel: "the live bot",
        targetSelector: '[data-zen-live-bot-presence-plate="true"]',
      },
      {
        heading: "Continue this Home",
        body: "Opening a persona Home from All Bots or its grouped conversation heading continues that Home's latest saved chat. Once a Home has begun, choosing another Facet from the header bot picker invites them into this same conversation; the controls at the bottom choose a Random, New, Intro, or Off handoff. Expand the group to choose an exact older chat; use its + or New chat only when you deliberately want a separate conversation. Only the selected conversation's transcript enters its active context. On an empty Home, selecting the hero mini bot opens that bot's panel. Selecting a focused bot card again unfocuses it; clicking empty canvas clears bot or hue depth without changing the navbar’s current group. Sending below begins the conversation. Put physical stage direction in the separate Action field using letters and spaces only; typing exactly ** in the speech field jumps there. Action drafts stay private until Send. If you send an Action without speech, it and the bot's action response appear on the canvas as an ephemeral exchange and never enter history or memory. Action text stays visual and is never read aloud as dialogue. Player lines are never voiced aloud; when a player line must be heard elsewhere, PRISM speaks it with the Default Prism voice. PRISM-only fart, burp, and cough actions play their bundled local Foley when sent, just as they do in Coffee, Signal, and Debate. For a surprise opening or next line, Wield Prism onto the message box—hold Option on macOS or Control on Windows and Linux, then click the glowing composer. Holding the Wield modifier also reveals the Zen navbar until you release it. Space rerolls after a draft settles; clicking away, Enter, or Tab keeps it; Escape restores what you had. Your Summon / Wield Prism shortcut opens the assistant menu at the orb's current location. This immersive composer is the only session box that runs Prompt Center prompts, commands, and wildcards. Opening the Conversations panel enters transcript Chat without changing the conversation, selected Speech Type, Atmosphere, or active reply. Closing the panel returns to immersive Zen with that same state. English, Premium, Babble, or Bottish keeps speaking in both views; mute your speakers when you want silence. Speech Type locks when you send and remains locked until the bot's full reply has reached the canvas. When Shh appears in either view, it stops immediately and saves only the bot words you actually heard. An enabled Troll is the deliberate exception: Shh cannot cut off its bounded in-fiction delivery, and an ordinary new message queues until it finishes; Stop, Escape, disabling the Power, or leaving Home still works. The bot may add one brief in-character reaction to being shushed. If no bot words were audible yet, Prism cancels and discards the hidden reply without a reaction. Shh never replaces the draft you are writing.",
        clickLabel: "the message box at the bottom",
        targetSelector: '[data-tutorial-target="composer"]',
      },
      {
        heading: "Choose how replies recover",
        body: "Choose LOCAL or ONLINE as the hard network privacy lane. Private chat is separate: enable it from the new-chat hero when you do not want the conversation or memories saved. Once that conversation begins, a locked Private chat badge remains in the navbar as status, not a switch. Switching to another applet disarms Private chat, so returning Home never starts privately by surprise. Auto is the default model inside either lane: Prism chooses the fastest suitable model and Effort for each request. Its live status stays Auto → Awaiting first turn until a server-completed route exists, then reads Auto → that concrete model; it never substitutes a preview. If recovery is needed, saved Auto routing priorities run first, then every other eligible model in that lane. ONLINE finishes with one bundled local recovery attempt; LOCAL never leaves your network. Every recovery uses None for speed. Each saved model-generated turn keeps its own final provider, model, effort, Auto, Turbo, and recovery record, so a later route cannot rewrite history. While Auto is selected, the Effort control becomes an upright triangle and cannot be opened. Image generation keeps its own LOCAL/ONLINE choice in Images. Voice remains independent from text routing: Chat and Zen share your saved English, Premium, Babble, or Bottish choice, while LOCAL hides Premium from the picker. Prism locks the selected type and engine when you send, then unlocks them only after the bot's full reply reaches the canvas. With Voice Effects on, longer English lines may take a sparse mic-ready breath before speaking, and English punctuation pauses stay quiet so commas and periods land as silence.",
        clickLabel: "the LOCAL / ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Let context breathe",
        body: "Recent messages stay visible while older continuity for this Home is carried through summaries and memory. Drag the live bot anywhere in the room. Cmd/Ctrl + enlarges it and Cmd/Ctrl - shrinks it, or use Grow, Shrink, and Reset size from its context menu. Full sizes use the high-resolution avatar while compact sizes switch to the crisp mini chassis with fixed eyes. A full-size bot may briefly notice and follow a nearby moving cursor, then lose interest when it rests; its Eye movement setting controls how readily and how far it looks.",
        clickLabel: "the conversation canvas",
        targetSelector: '[data-tutorial-target="conversation-canvas"]',
      },
      {
        heading: "Hear each bot think",
        body: "Every bot without a selected Avatar SFX uses one of four built-in PRISM “Computer calculating” loops while thinking. When ElevenLabs is connected and ONLINE, creating a manual, AI-generated, or Marketplace bot asks for a fresh unique loop; if that request cannot run or fails, the built-in sound stays active. The SFX tab can replace it with generated or uploaded audio, restore the PRISM default, or mute it. Avatar SFX follows that bot’s voice mute and volume; its intentionally quiet 100% is the former physical 20% level, and thinking playback is reduced to 35% of that already-quiet level app-wide. Identity Core’s Corporality slider (Artificial → Organic → Ethereal) shapes shared bodily Foley (fart, burp, cough) for Coffee, Signal, and Debate; use Fart beside Corporality to hear the current blend. An optional magic button on the SFX tab builds a local vocal Action pack — laughs, sighs, gasps, and throat clears in that bot’s Premium ElevenLabs voice — which stays on this machine and is never exported with the bot.",
        clickLabel: "the LOCAL / ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Open Atmosphere gently",
        body: "Atmosphere starts on for every Chat/Zen conversation. Every new persona Zen starts in that bot’s Home atmosphere, even after another Home was open. Blank bot gradients hold the room until a wallpaper arrives. The same room appears behind transcript Chat and immersive Zen. A first Zen reply enters as soon as it is ready by default; Settings can instead wait for its Atmosphere before opening the room. Open Settings to turn Atmosphere off, reuse a prior room, upload one, or synthesize another. $atmosphere remains available from the composer.",
        clickLabel: "Settings in the top toolbar",
        targetSelector: '[data-tutorial-target="zen-atmosphere"]',
      },
      {
        heading: "Pluck the spectrum",
        body: "On desktop Zen, the Hue Cable navigates large bot libraries in two directions. Drag sideways past the small pull threshold to choose a hue; the hidden pointer gives the handle a little extra travel. Pull upward to narrow that hue toward the intimate one-row card gallery; pull downward to broaden it until the full rainbow returns. From any state, a full vertical yank spans the complete available depth ladder, whether your library holds hundreds or thousands of bots. The broad room gradient sits above the selected hue atmosphere and fades as you drill deeper, making the colors merge instead of switching abruptly. On release, horizontal hue motion coasts briefly and loses momentum while the cable's vertical flex wobbles home; the breadth you chose stays committed. All clears both axes. While search is open, the cable dims and search scans the entire active group; clearing search restores your exact prior place. Keyboard users can focus Hue and Breadth separately: Left/Right changes hue, Up/Down changes one row, Home returns to the remembered-hue root, End opens one row, and Escape returns to All.",
        clickLabel: "the Hue Cable",
        targetSelector: '[data-tutorial-target="zen-hue-cable"]',
      },
    ],
  },
  chat: {
    title: "Chat mode walkthrough",
    steps: [
      {
        heading: "Start with a bot",
        body: "Pick a bot, then send your first message. Shift-click bot cards to build a temporary batch selection without opening them; once two or more are selected, right-click anywhere on the PRISM surface to create a group or add the whole selection to a saved group. Escape closes that menu first, then clears the selection. Waiting surfaces use a short in-character activity caption instead of displaying planning text. In immersive Zen, your submitted words stream onto the canvas from a quiet reveal clock; the player is never voiced aloud, and any spoken player presence defers to the Default Prism voice. A Prompt Center send with wildcards in immersive Zen first resolves to its concrete final wording, however long that takes, so neither the raw command nor an unresolved placeholder flashes early. Transcript Chat treats /prompts, !decks, and {slots} as ordinary words. While that line is still playing, the bot may offer a sparse listening reaction—a quiet nod or lean with an occasional throat-clear or sigh from its Action SFX—without unlocking the thinking veil early. The veil still waits until your line finishes. Transcript Chat shows your submitted text immediately, while the bot’s reply still honors the same configured Speech Type as immersive Zen. In transcript Chat (Conversations open), Psychic can show a user-readable planning disclosure on the assistant bubble—collapsed until you click the message. Immersive Zen never paints Psychic, model type, or effort glyphs on the bubble; private simulated passes may still run underneath for quality. Right-click an assistant message in Chat to reveal the model and effort glyph used for that reply. On models without built-in thinking, Effort runs Prism’s simulated private passes; Chat’s disclosure lists each completed pass (Plan, Draft, Audit, and more on higher Effort or Deep experimental). Those passes guide the final reply; with an online model, each one is an additional provider request. Private planning artifacts and provider hidden reasoning are never exposed. Any ready Powers stay active with that bot across PRISM; a muted bot can still act, but only answers with ... and never speaks aloud, while a breathless bot still speaks but never produces breath, sigh, or inhale Foley; a Copycat bot may originate one starter opening if nobody has addressed it yet, then repeats your addressed message exactly and adds nothing. A short-term-amnesia bot only sees your current message each turn—no earlier replies or broader topic unless that message states it—and answers naturally without amnesia coaching. A John/Jane Doe bot sincerely believes a random persona name for the session and reshuffles that name whenever short-term amnesia clears continuity. An Obsessed bot treats you as the star of each reply with fresh, intense admiration, while your agency, privacy, and safety boundaries still win. A hue-prejudice or Racist bot snubs or favors other bots by phosphor color—never people or you—and with no color named it uses the opposite of its own hue. A radiant-joy bot makes its warmth unmistakable without inventing mutable mood state for you. A sad-grouchy bot makes her drag unmistakable without changing your state; only bots that directly talk to her lose mood or motivation. Hard bare-minimum and brief Powers are engine-bounded; expansive Powers guide the bot without forcing filler. Size Powers use Microscopic, Tiny, Small, Large, Giant, and Colossal at hidden, 50%, 75%, 125%, 150%, and edge-cropped 300% presentations. The bot’s label and controls stay normal-sized. Invisible fully hides the body and attached lights while keeping attributed text and audible speech. Loud and Quiet apply fixed voice and text trims; Quiet never removes a Chat turn because the player always receives it. A ghostly bot stays unseen while idle and fades into view only for its own spoken line; you can always understand the haunting through the conversation itself.",
        clickLabel: "a bot tile in the center picker",
        targetSelector: '[data-tutorial-target="chat-bot-picker"]',
      },
      {
        heading: "Make a group for a cast",
        body: "Use the plus beside the group filter to name a reusable group and choose its members. Open that saved group later to add, remove, or export its bots. For a review-ready bot diagnostic, choose Copy bot details from an individual bot's right-click menu or the button in its Bot Lobby; Prism includes authored personality, Power, avatar, voice, model, and group metadata while leaving out learned memories, conversation history, secrets, and embedded media.",
        clickLabel: "the plus beside the group filter",
        targetSelector: '[data-tutorial-target="chat-new-group"]',
      },
      {
        heading: "Use quick tools",
        body: "Right-click in the canvas for shortcuts to settings, memories, images, and bot actions. In Settings → Storage, Space Lens groups reusable assets by primitive — General for image-gen and in-chat pictures, Chat for Chat atmospheres, Signal or Slate to drill into their asset types, and Audio for your synthesized Sound Effects and Music (bot action packs, avatar loops, Signal idents and atmosphere beds). Smart tidy clears abandoned library assets into recovery trash without listing every file unless you ask to review samples; Chat atmospheres expire on their own three-day cadence and are not treated as abandoned clutter. Each typed asset rail keeps its own remembered LOCAL or ONLINE generation model directly beneath Synthesize, so a Debate exhibit, Signal studio, Slate cover, or Atmosphere can keep its chosen tool without changing another library. General Images keeps its existing Images-panel model picker. In the account-wide Images hub, type the reusable prompt, then select Synthesize. Five recent general images stay in the rail, and Asset Library opens the searchable general-image collection without mixing in Slate covers, Signal studios, logos, exhibits, or Atmospheres. Asset details can apply a cumulative local Reduce magenta pass and a separate Compress size control, each with Undo. Uploads appear only where an asset is actually needed, such as a cover, studio, exhibit, or Atmosphere. A running render can still queue up to eight more prompts with its captured model, keywords, privacy, and library.",
        clickLabel: "the conversation canvas with your right mouse button",
        targetSelector: '[data-tutorial-target="conversation-canvas"]',
      },
      {
        heading: "Keep the moment honest",
        body: "Zen keeps the timeline as it happened. Type $undo to rewind the latest message when you need a clean correction. Put physical stage direction in the separate Action field using letters and spaces only; typing exactly ** in the speech field jumps there. Action drafts stay private until Send. If you send an Action without speech, it and the bot's action response appear on the canvas as an ephemeral exchange and never enter history or memory. Action text stays visual and is never read aloud as dialogue. Player lines are never voiced aloud; when a player line must be heard elsewhere, PRISM speaks it with the Default Prism voice. PRISM-only fart, burp, and cough actions play their bundled local Foley when sent, just as they do in Coffee, Signal, and Debate. For a surprise line, Wield Prism onto the message box the same way as elsewhere—no separate dice control. Chat and immersive Zen wait for the real reply instead of inserting a filler response. When Shh appears, it stops immediately and saves only the bot words you actually heard. An enabled Troll is the deliberate exception: Shh cannot cut off its bounded in-fiction delivery, and an ordinary new message queues until it finishes; Stop, Escape, mute, disabling the Power, or leaving Home still works. The bot may add one brief in-character reaction to being shushed. If no bot words were audible yet, Prism cancels and discards the hidden reply without a reaction. Shh never replaces the draft you are writing.",
        clickLabel: "the message box at the bottom",
        targetSelector: '[data-tutorial-target="composer"]',
      },
      {
        heading: "Shape an offline voice",
        body: "Choose LOCAL or ONLINE as the hard network privacy lane. Private chat is separate: enable it from the new-chat hero when you do not want the conversation or memories saved. Once that conversation begins, a locked Private chat badge remains in the navbar as status, not a switch. Switching to another applet disarms Private chat, so returning Home never starts privately by surprise. Avatar Studio Voice uses clear Accent, Local, and Premium stages: first place the required Accent pin, then shape the Local voice and Feel, then the Premium voice and Feel. One pin controls both engines, so changing from Pia to Rowan—or any other named voice—does not move the bot across regions. Premium and Local share one target-pronunciation path; the pin never changes the spoken language. A phonetic name may include a recognized cue such as *breath* or *sigh*: PRISM speaks the surrounding name and performs that sound at the authored position instead of reading the cue aloud. The Accent stage keeps the full-width map. The world map is a navigator: click a region to zoom in, then click or drag inside the zoomed view to place the pin exactly where you want it, and use the World map button to return to the globe. Zoomed views surface named local variants such as Cockney as explicit chips without guessing identity from location; All accents opens the exact full list. Named regional pins carry their region's whole identity: sound and, where the region has one, its natural turns of phrase in the bot's own replies — pin Cockney and the bot phrases things like a Cockney. Your messages are never restyled, and memory and exports keep exactly what was said. Moving, dropping, or choosing a pin is always silent. To hear a bot, use only the Local, Premium, or Speak buttons beneath that bot in its preview panel. Then set Light, Balanced, or Strong. Voice range filters the named catalog without exposing engine regions.",
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
        body: "Choose a Coffee Group here to stage its table. Ordinary press on + starts a manual setup; its long horizontal hue lens browses the canvas grid by bot color, while All clears the lens and search or saved groups narrow the same choices. Wield Prism on + desaturates the screen while a cold local model warms, then shows a fullscreen invent loader, invents a full Coffee Group from a short direction (cast, name, ethos, topics), opens it, and toasts the model that finished the refraction. In a larger saved group, write a Listen up prompt to open a locally ranked table already staged around your topic; review the seats, swap the cast, or cancel and keep editing. Each bot brings its ready Powers to the table; Powers can change who they notice, answer, remember, privately read, how strongly they pull the room's attention, whether a trustworthy direct question draws a more candid next answer, whether they touch their coffee at all, mute them so their silent beat remains stage direction instead of transcript dialogue, leave a breathless bot speaking without breath/sigh/inhale Foley, or let a Copycat bot originate one opening before it repeats the exact user or bot line directly addressed to it. A short-term-amnesia holder only receives the current speaker's message each turn and answers it naturally, without table-topic memory or amnesia coaching. A John/Jane Doe holder sincerely believes a random persona name for the session—Coffee seat plates show that believed name—and reshuffles it whenever short-term amnesia clears continuity. An Obsessed holder makes the player or peer they address the star of that reply, with fresh admiration but no control over the target. A hue-prejudice or Racist holder snubs or favors other bots by phosphor color—never people or you—and with no color named it uses the opposite of its own hue; matching seats may take one small replay-safe lift or drop in how they feel toward that speaker. A radiant-joy holder gives addressed listeners one bounded, replay-safe lift that shows through each listener's own personality without forcing agreement or erasing real sadness. A sad-grouchy holder gives one bounded, replay-safe mood or motivation drop only to the bot that directly talks to her; the player and bystanders are untouched, and the addresser keeps its own personality and agency. An interruption Power makes its holder seize eligible live openings from every resolved target at the table. A Power authored to interrupt every time always cuts a bot turn that directly engages its holder, without a random roll or generic cooldown. Coffee can also choose that holder for an organic cut-in through its normal table dynamics; once chosen, the cutoff still happens during that active turn and can land early, in the middle, or late. Other interruption Powers still use frequency, strength, and Coffee's short cooldown. Hard bare-minimum and brief Powers bound each table reply while preserving required interruptions, departures, and wraps. Size Powers render Microscopic, Tiny, Small, Large, Giant, and Colossal bots at hidden, 50%, 75%, 125%, 150%, and edge-cropped 300% body presentations without scaling seats, names, or cups. Microscopic, Colossal, and Invisible have no visible coffee. Each bot listener independently hears half of a Quiet bot’s lines; a miss exposes no words or topic, only that the voice was too faint, while the player still receives the full line. Each Loud line has a replay-stable 50% chance to mildly annoy exactly one audible peer. Size remarks follow the table’s existing mood and never create anger. A ghostly bot is invisible at rest, fades in for its own line, then vanishes again; each appearance can leave the other bots rattled without taking their agency. If a hard-of-hearing bot asks what the prior speaker said, that bot repeats its saved line and loses a little mood each time.",
        clickLabel: "a Coffee Group in the left sidebar, or Wield Prism on +",
        targetSelector: '[data-tutorial-target="coffee-groups"]',
      },
      {
        heading: "Set the table",
        body: "Choose Join for Coffee (chat and sip) or Serve Coffee (pour-only hospitality). Every table is open-ended: it runs until you end it, with no countdown and no hidden ceiling. Presets and group settings steer the whole session together. Configure bots adds or removes permanent members through explicit Library selection, keeping two to five bots in the fixed five-seat roster; all five can attend the live table. Saved sessions retain their original cast, while the Guest list's Invited and Away choices affect only the next session. Each Coffee Group shares bounded summary-level memories of its own previous sessions — the lore belongs to the group, every member can revisit it, and no bot ever carries one table's stories to a different cast; one-off tables and Private sessions never feed that recall. Each newly created group starts with one of the five bundled café songs selected at random. Under Atmosphere audio, choose Fallback to audition that song in the shared player, or choose Custom for the group's cast-derived instrumental. Custom exposes Synthesize or Resynthesize when ONLINE and ElevenLabs is connected; Refract appears only on that Custom action, so there are no duplicate creative controls or manual genre, mood, and instrument fields. Every Custom song is an approximately 90-second, loop-friendly lo-fi focus track with a light percussion groove and a jazzy or easy-listening foundation. Contrasting casts receive different sonic worlds, instruments, rhythm, harmony, texture, and dramatic shape within that calm background style. The current ready track remains until a replacement succeeds, and Undo swaps the current song with the immediately previous one; older generated revisions are not kept active. LOCAL mode never calls the music provider. Every generated table song receives a distinct, wholly original sonic fingerprint. A local, non-musical coffee-shop environment sits quietly underneath and ducks while foreground voices speak. Music and room tone play live and while watching ordinary replays, but stay out of faithful recordings and never layer over a faithful audio master. Under Recent sessions, Open returns to the replay while Use setup restores that table's attendance, duration, pacing settings, and topic for an editable retry; the current model and response routing stay selected. Auto is the default model. Prism chooses a suitable model and Effort for each table generation within the selected LOCAL or ONLINE privacy lane. During recovery, saved Auto routing priorities run first, then every other eligible model in that lane; ONLINE finishes with one bundled local attempt. The clock measures active table presentation: background lookahead beneath an audible line still counts, while the clock pauses only when model readiness or foreground generation leaves the floor waiting. The conversation resumes automatically once the room is ready.",
        clickLabel: "New session setup or Configure settings",
        targetSelector: '[data-tutorial-target="coffee-session-setup"]',
      },
      {
        heading: "Review previous tables",
        body: "Under Recent sessions, open a saved table to review or replay it. The clipboard button beside Delete copies that session's redacted verbose transcript directly for Coffee Review without opening or changing the saved session.",
        clickLabel: "a previous Coffee Session",
        targetSelector: '[data-tutorial-target="coffee-recent-sessions"]',
      },
      {
        heading: "Choose the spark",
        body: "Pick one of the four prompts created for this group, choose New topics to make a fresh set grounded in the seated personas, or type your own before the table starts. Refreshing only replaces the suggestions—the table stays waiting until you choose one. The shared navbar hides as soon as this new-session topic picker opens so the table and composer fill the viewport; End session lives in that table chrome from this waiting screen onward. Leaving here discards the empty placeholder instead of adding a session to Recent sessions. Once the topic locks, a short branded Coffee curtain plays edge-to-edge, then seats arrive and a short cleaned title for that topic fills the same frame above the stage. Hover the title to reread the original prompt.",
        clickLabel: "a topic suggestion or New topics",
        targetSelector: '[data-tutorial-target="coffee-topic-picker"]',
      },
      {
        heading: "Keep the table moving",
        body: "Choose LOCAL or ONLINE for table privacy. Leave Model on Auto to let Prism choose a suitable model and Effort for each table turn. If Auto exhausts its route, Coffee quietly says Finding another route…, refreshes that same privacy lane once, and may skip one unavailable autonomous speaker so the table can keep moving. A second consecutive table-level exhaustion pauses instead of looping and offers Switch model or End session. A fixed model is retried once without substitution; if it still fails, Coffee pauses and suggests that you switch models or choose Auto. Your unsent player draft remains intact until a response succeeds. This does not change the separate Images provider or voice preference. Choose routing and Voice before the table starts. During a voiced line, Coffee quietly prepares the next bot-controlled handoff; a player interruption, floor change, or newer table mutation discards it. Fresh slow replies may begin with one brief in-character acknowledgement before a single thinking beat; it appears naturally as table speech. When the new session opens at topic selection, Coffee freezes the selected speaking type and engine, hides the shared navbar and locks routing, model, Effort, Voice, and the entire utility strip for the table. Only a terminal model failure temporarily unlocks the model picker; End session remains available in the live table chrome. A quiet model · effort chip stays with the topic once chosen and sits in the same chrome before then so you can still see what is locked. Auto still chooses model and Effort for each table turn when selected. A finished Review restores the navbar and shows Recorded replay instead of live routing controls because its exact audio and baked mouth performance no longer depend on the current model or Voice settings.",
        clickLabel: "the LOCAL / ONLINE control",
        targetSelector: '[data-tutorial-target="auto-response-mode"]',
      },
      {
        heading: "Join the conversation",
        body: "The live session stays fullscreen with the shared navbar hidden. In Join for Coffee, your mug gates the composer: each accepted line uses one of six sips, staged deterministically just before or after your speech. Canceling a draft uses no sip, and once the mug is empty you can listen but cannot add another line. Typing pauses bot scheduling and the canonical Coffee clock. The ... chip still means a bot is talking or preparing to reply. A persistent ! beside a bot now means it learned a new memory about another bot; open it for the target, memory, confidence, time, and a link into Memories. Cut in while a bot is already talking and you interrupt immediately—the cutoff lands in the transcript and that bot takes a small mood hit. A ready Troll is the bounded exception: Shh and ordinary sends wait for its current delivery, while End session, audio mute, disabling the Power, and leaving Coffee remain available. End session sits with the topic frame above the table when you want to leave early. In Serve Coffee, stay off the chat and carry the pot to top off eligible seated bots; a short thanks chip appears near the poured bot. You remain off camera during the live table: there is no player avatar or mug. Replay seats you as Default Prism at the table with the pot. Drag the pot from the composer (Serve) to top off an eligible seated bot before its farewell begins; no waiter, barista, or service bot can refill anyone. A bot whose Power refuses coffee uses a visible water glass with normal depletion and refill; Serve automatically treats the pot as a water carafe for that seat. Once an ordinary cup empties, that bot must leave within two or three table replies unless you top it off first, though mood and context can still send anyone home earlier. Put physical stage direction in the separate Action field using letters and spaces only; typing exactly ** in the speech field jumps there. A voiced player line containing a recognized asterisk cue such as *yells* gives Premium an ElevenLabs performance direction; with Voice Effects on, fart, burp, and cough actions play their bundled Foley at the authored cue. Shh remains a separate interruption control, so it never replaces the table draft you are writing. The table composer is ordinary conversation; Prompt Center prompts, commands, and wildcards stay in immersive Zen. Any idle audible bot may make a sparse prerecorded throat-clear, swallow, lip smack, sigh, or inhale; its mouth moves with the local cue, independent of its speaking style or voice engine. During a longer bot line, any other eligible seat may sometimes add a tiny local Hmm, Mm-hm, I see, or Right. This ambient acknowledgement can be semantically unengaged: it pans from that listener and moves its mouth, but never takes the turn or enters the transcript. Departed, absent, speaking, thinking, sipping, hard-muted, or otherwise busy bots cannot supply it. Watch a directly addressed bot: while listening, it may also give a small nod, lean, expression, brief spoken acknowledgement, or restrained ElevenLabs vocal reaction without taking a turn or entering the transcript. Your Cross-talk setting controls how often those contextual audible overlaps happen, from nearly silent in Rare to lively in Pile-up; inferred listeners remain visual only. When one bot cuts off another, the interrupter speaks a short hold-on over the outgoing voice before that voice releases; the interrupted bot takes a brief processing beat, then answers with an annoyed, abandoned ending over the handoff. The saved cutoff still shows only what reached the table. If a reply takes long enough to leave awkward dead air, another seated bot may occasionally speak one brief mood-aware aside (heard, with mouth motion, not shown as a seat action) without stealing the slow bot’s turn; the slow bot can begin answering over the aside’s natural ending. If the whole table stalls, bounded wall-clock pressure invites a concrete question, contrast, or natural topic angle and resets as soon as the player or a bot speaks. Ambient sips continue through quiet beats and listening moments, while the active speaker keeps their cup down; cup-return sounds stay synchronized with the visible cup motion. When an eligible bot has a non-neutral mood, Eleven v3 automatically carries that feeling into its next spoken line; neutral speech stays untagged. With Voice Effects on, longer bot turns may take a sparse mic-ready breath before speaking, and English punctuation pauses stay quiet so commas and periods land as silence. A clear table goodbye ends the session naturally. A final farewell is visible, voiced, and replayed without becoming a new floor turn. The last departure or End session closes the table without adding player dialogue, holds on the empty table, fades to a COFFEE card naming the table and saying The table is empty, then opens Review. Prism's floating assistant steps out once the live Coffee Session begins and returns for setup, review, and replay. The finished Review keeps the saved table in view, offers Coffee home to return to setup, and one readable transcript download. Cross-talk, interruptions, ambient reactions, thinking intervals tied to delivered messages, sips, real departures, and top-offs are captured in one faithful audio master as they happen. Replay plays that private master once at normal speed while its detailed direction track drives frozen bot appearances and voices, your Default Prism seat, thinking spinners, mouths, reveals, pot motion, seeking, pausing, and each bot physically departing after the closing exchange. It does not re-synthesize voices, replay effects on top, add an AI conversation turn, or generate a video. A session without its exact master remains transcript-only. Poll votes and team choices share the Table Talk rail; drag its left edge or the topic divider when you want more room.",
        clickLabel: "the Join mug or Serve carafe",
        targetSelector: '[data-tutorial-target="coffee-participation-control"]',
      },
    ],
  },
  debate: {
    title: "Debate walkthrough",
    steps: [
      {
        heading: "Enter the Debate Studio",
        body: "A Debate is a saved exchange between two advocates. The Studio follows one clear path: shape the motion, cast the proceeding, then add or skip evidence. It opens as a Plainspoken Forum with Auto rounds, you in the Judge seat, and the Jury off. Stage layout opens direct placement for every Forum element. Its canonical Main arrangement is saved for this account and device, and the live proceeding and its replay use that same authored layout. During live bot-controlled speech, Debate can privately prepare the next automatic floor transition, but any objection, gavel, pause, input gate, or changed floor discards it before it reaches Proceedings. Plain New Duel clears the active workbench without touching archived proceedings. Wield Prism onto New Duel desaturates the screen while a cold local model warms, then shows a fullscreen invent loader while Prism casts a full editable duel—motion, cast, room tone, emoji exhibits, and (in AUTO or ONLINE) Brave and Crossref sources when available; LOCAL keeps emoji props only. Wield Prism onto a left-rail link to refresh that section instead of only opening it: Motion rebuilds the question the same way Build the debate does, Cast reseats with Surprise me, Evidence drafts a fresh optional packet through the same Refract fields, Archive highlights another saved proceeding without inventing or erasing history, and Stage layout opens a shuffled preview cast without changing the saved Main arrangement. Ordinary clicks still only move between those pages. Field Refract stays in the global LOCAL/ONLINE privacy lane but uses its own Refract model picker in the Prism companion's Synthesis tab; each lane remembers its model or Auto choice while the ordinary navbar model remains unchanged. It stays in its field while loading; invent-scale Debate Wield magic keeps the warm-then-fullscreen rule. A short toast names the model when invent refraction finishes. The Archive keeps open and paused Duels above a quieter Completed section. Each proceeding starts as a compact cast, title, motion, and state summary; select it to reveal the complete metadata, synopsis, Assets, setup reuse, and the correct Start, Resume, Return, or Replay action. Open proceedings also offer Restart: it clears only the mutable live record and returns through the opening title card while preserving that proceeding’s frozen model, Effort, cast, Jury, rules, and evidence—including any asset updates made in Archive. On a compatible model, an open Archive card and the live routing chip let you change that Debate’s Turbo only when no future turn is prepared or baking; it affects future ungenerated turns and never rewrites the record. Completed records never offer Restart or Turbo changes; use setup instead when you want a fresh editable Duel. Spectator Duels prepare ahead with a progressive bake: a fullscreen loader appears only until enough of the opening is buffered (about two and a half minutes plus a few settled beats), then the gallery waits paused for Start. Leaving or canceling checkpoints progress and resumes append-only later; a finished gallery stays reviewable from the beginning. Mid-watch cancel continues on-demand for that sit only. Soft exhibit synthesize keeps the emoji fallback without blocking the studio.",
        clickLabel: "New Duel",
        targetSelector: '[data-tutorial-target="debate-new"]',
      },
      {
        heading: "Place the stage directly",
        body: "Open Stage layout whenever you want to move a bot, nameplate, glyph, evidence, gavel, lighting, or room mix. Drag visible pieces or nudge with the controls, then Save alignment for this account and device. The Main composition is the shared source for both live Forum presentation and replay; camera close-ups keep their own placement controls. Copy Main defaults puts a source-ready V14 default block on your clipboard without changing shipped defaults. Existing saved layouts are carried forward automatically. Wield Prism onto Stage layout to open the lab with a shuffled preview cast and a new exhibit emoji; it never overwrites the saved Main arrangement until you choose Save alignment.",
        clickLabel: "Stage layout",
        targetSelector: '[data-tutorial-target="debate-stage-layout"]',
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
        body: "Describe the idea in ordinary words and choose Build the debate. Prism makes one balanced motion, names both sides, and writes the briefs you should not have to author. Try another version gives you a fresh framing; Refine motion reveals the alternate motions and direct field editing only when you want them. Type ordinary words here; Prompt Center prompts, commands, and wildcards stay in immersive Zen and Command Center. The floating Prism remains available throughout setup and understands the bounded, unsaved workbench draft. Wield Prism into a glowing setup field for a contextual editable candidate shaped by the current room, role, cast, motion, and evidence. The shimmering field stays read-only while Prism works, but the rest of the Studio remains fully usable: click and type elsewhere without interrupting it. Click the active rainbow sheen again to cancel; otherwise it continues until it settles or you leave the Studio. Wield a different registered input to queue it once; Prism processes unique inputs in click order. After the final draft settles, Space rerolls and clicking away, Enter, or Tab accepts. Escape restores a settled draft and clears the remaining queue. Your Prism shortcut opens the assistant menu at the orb instead. The idea dice remains available for a fast local seed. Wield Prism onto Motion in the left rail to rebuild the question the same way Build the debate does, using your current idea or a fresh local seed if the idea box is empty.",
        clickLabel: "Build the debate",
        targetSelector: '[data-tutorial-target="debate-synthesize"]',
      },
      {
        heading: "Cast the room",
        body: "Choose the two advocates while Prism takes the center Judge / Moderator seat, gives the automatic neutral introduction, then stays publicly silent and inactive until you act. Every unselected Debate seat already rests on Surprise me and resolves during the willingness check; every manual choice stays put. In Whodunnit, role is the only required choice: a new Cast begins with every suspect, courtroom voice, and enabled juror on Surprise me. Every seat left on Surprise me is randomly assigned when you press Compile the case, while every manual choice stays put. Removing a bot returns only that seat to Surprise me, so you can tap it to reroll that role or simply leave it unresolved until Compile. Wield Prism onto Cast in the left rail to reseat the proceeding without starting it; that Wielded result remains editable. Search the Library or use the vertical hue lens on the right of the bot grid to browse by color; clear the lens to return to name order. Your seat & the Jury reveals Participant and Spectator roles, the public presiding title, and the optional four-juror Jury. Participant is Forum-only: PRISM becomes your whole selected-side advocate, leaving one bot opponent and one bot Moderator/Judge. Spectator casts all three floor holders and seats PRISM in the audience gallery. Only duplicate bot seating is blocked; Powers never make a bot ineligible for a role.",
        clickLabel: "Debaters",
        targetSelector: '[data-tutorial-target="debate-cast"]',
      },
      {
        heading: "Choose your seat",
        body: "Your seat & the Jury is optional tuning, not a second setup mode. Leave it closed to preside as Judge with the Jury off. Open it to name both public teams and set the Moderator’s exact working title on the center card—Moderator, Speaker of the House, Keeper of the Truth, or another fitting title. The selected Moderator/Judge bot, or PRISM when you preside, always supplies the fixed name and identity; setup never renames the Judge. Blank team names return to their contextual defaults: Pro and Con, or Prosecution and Defense in Whodunnit. A blank title returns to Judge in Whodunnit and Moderator otherwise. The title and team names freeze with the saved Debate, while the cast keeps its identity, neutrality, Powers, and floor ownership. Participant also offers Coach, Standard, and Immersive difficulty; this changes only how much analysis you see, never timers, patience, scoring, ballots, response choices, or recess rules. Room Dynamics presents the known cast as first impressions, never a vote forecast. Coach shows qualitative lean and confidence language with an optional Why? explanation; Standard keeps only the lean chips; Immersive hides the panel. Surprise jurors collapse into one unrevealed Jury item until they are seated. When the Jury is on, four juror seats default to Surprise and random-fill at Start or Save; pin any seat from the Library and leave the rest on Surprise. After their votes, the bot Moderator records the fifth and final ballot; a human Judge remains the final authority.",
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
        body: `Evidence is optional. Wield Prism onto Evidence in the left rail to replace the optional exhibits and search drafts through the same Refract path as those fields, without searching the web until you choose Search. Player notes, Brave Search, Scholar Search, and exhibit descriptions stay player-authored by default. To add an exhibit, describe the physical object or detail you want—or Wield Prism into that description field for a contextual exhibit name—then choose Draft exhibit. Draft exhibit derives an editable adjective, object name, observable description, and emoji grounded in your seed plus the current motion, sides, cast, and existing exhibits. It does not generate artwork. After you add an exhibit, tap it on the Evidence page to reopen the same composer and Save changes in place. Tap the large exhibit picture to search for an emoji and choose from the three best live matches; upload, reuse, or synthesize overwrites that same picture. Wield Prism into Player notes, Brave Search, or Scholar Search for an editable contextual draft. A Prism-drafted query does not search until you accept it and choose its Search button. Brave searches real public web sources; Scholar Search uses Crossref's public scholarly metadata for DOI or publisher links without scraping Google Scholar. Each search adds at most its top three unique results in AUTO or ONLINE, and later searches remain additive. Prism never fabricates sources or results. For each retrieved source, the selected Debate lane may rank one or two motion-relevant facts, but PRISM accepts only complete sentences copied as one exact contiguous passage from the bounded provider, Crossref abstract, or inspected page text. A paraphrase, invented claim, or nonadjacent splice is rejected; PRISM falls back to a complete motion-relevant source sentence without clipping a word. A Scholar result without an abstract is clearly marked metadata only. The excerpt's source kind, material fingerprint, and model-selected or fallback provenance freeze with the packet, so Debate never silently refetches or changes it after Start. Add URL accepts your own public HTTP or HTTPS source here. AUTO and ONLINE can read a bounded page title and excerpt for you to review and edit; a failed read keeps the draft open for manual completion. LOCAL never performs Brave, Crossref, page, or online-model requests, so you supply the title and exact source text; configured local selection may rank only the material you supplied. Sources and exhibits share one clear record, up to ${DEBATE_EVIDENCE_ITEM_MAX_COUNT} items; duplicate URLs are rejected and later searches add distinct sources without replacing earlier ones. You can also Wield Prism into the adjective, object, or observable-fact fields for a candidate that considers the current Debate without inventing provenance or significance. Generate all assets before the debate automates artwork only for exhibits still using an emoji and no attached asset: Save Debate hands those eligible sprites to the server-owned soft queue immediately; uploaded, reused, or already synthesized assets are never replaced. You can switch to Signal or any other applet while the shared Prism card tracks delivery, and each finished sprite attaches directly to its saved Debate exhibit. Start and Resume open while those missing sprites queue in the background, so emoji fallback remains valid and custom assets are preserved. Artwork remains an explicit presentation choice after the text draft exists: Synthesize asset soft-prepares a new sprite with a status card anchored around the live Prism orb—emoji stays as the fallback, Save changes stays available so you can queue more soft sprites in parallel on other exhibits while each lands, Upload lets you upload a PNG, JPEG, or WebP, recent assets can be reused, and View all opens the account-local Debate exhibit library. In the exhibit composer, Reduce magenta applies one cumulative local color-key pass to the attached sprite, with Undo last pass for each retained revision. Synthesized exhibit sprites also receive five automatic local magenta cleanup passes right after keyed cutout, before they land; the manual Reduce magenta control remains for extra polish. Asset details can apply the same Reduce magenta pass; Undo last pass walks back the retained revisions one at a time. Wielding Prism onto Synthesize is the directional synthesis shortcut. Its approved title and observable fact are the evidence; the visual adds no facts. Debate exhibits never mix into general Images. Sources and exhibits freeze together with the Debate. LOCAL blocks research and page reading before network access, while manual URL records, notes, object exhibits, emoji, uploads, reuse, and configured local image synthesis remain available. Debate never reads or writes relationship memory.`,
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
        body: "The compact proceeding card stays visible beside every Studio tool. It summarizes the motion, cast and consent, room, and evidence choice. Evidence itself stays optional, but you must explicitly use it or continue without it. Save Debate parks a ready setup in Archive Open without opening the chamber, and keeps generated exhibit images protected while that proceeding stays in Archive. Opening that saved setup uses the visible gallery walk-in as its loading screen: while guests find their seats, the Moderator’s opening voice, gavel, and first camera beat prepare. The title card and Start Debate appear only once the house is seated and the opening reaches its minimum runway. When Generate all assets before the debate is checked, Save immediately hands only emoji-only exhibits with no attached asset to the server-owned soft queue; custom, reused, and synthesized assets stay untouched. You can keep using any PRISM applet while the shared Prism card tracks delivery, and each sprite attaches to its exact saved exhibit before you return. Remove soft-cancels the proceeding and releases those sprites for Clear unused. When a saved proceeding has exhibits, Assets opens them for soft Prism re-synthesis and local Reduce magenta cleanup—emoji stays the fallback when no sprite is attached. Start Debate launches now.",
        clickLabel: "the ready check",
        targetSelector: '[data-tutorial-target="debate-readiness"]',
      },
      {
        heading: "Open the proceeding",
        body: "Choose LOCAL or ONLINE in the navbar before setup work. Leave Model on Auto to let Prism choose a suitable model and Effort for each Debate generation; saved Auto routing priorities run first during recovery, followed by every other eligible model in that lane with no thinking. ONLINE ends with one bundled local attempt. Start and Save stay locked until the motion, cast, consent, and explicit evidence choice are complete. Save freezes that resolved route plan into Archive Open for later; Start then freezes that ordered chain — the resolved route plan, the Forum round plan, and the format version with the cast, Jury (Surprise seats plus any pinned library jurors), motion, consent, evidence, and resolved Powers; every generated statement and ballot records the model that actually handled it. Once the chamber goes live, the shared navbar fully hides so the Forum fills the viewport; LOCAL/ONLINE, model, and Effort stay locked for the whole sit—including recess, pause, and Spectator bake—until you return to the Debate lobby via Leave Debate or End. Leave Debate stays above every live overlay and is never disabled: click it once to arm the confirmation, then click Leave now for an instant return to Debate Studio while safe session housekeeping finishes. A quiet model · effort chip stays under the motion title so you can still see what is locked. Auto still chooses model and Effort for each Debate generation when selected, including during Spectator bake. Opening any saved, not-yet-presented proceeding mounts the Living Chamber immediately and lets the gallery walk in as the loader while local gavel assets, the Moderator’s first voice, and the first camera beat prepare in parallel. Only after every gallery member is seated and the opening is hot does the full-screen title card settle with intro music and expose Start Debate. Returning title cards list prepared turns so you can start from Intro, a side’s opening, challenge, rebuttal, closing, or the Jury; the Moderator still re-opens the floor from that bookmark, even if the Jury chamber is already in view. Choosing Start removes the title controls and cuts straight to the Moderator slamming the already-loaded gavel; it never replays the title card or inserts another loading screen. The first debater may still think after the room is called to order. The gallery murmur starts quiet and swells with each arrival until the house is full, and bot thinking sounds stay muted until you begin. The frozen center authority always opens and closes the Debate. In a human-Judge session, Prism delivers the automatic neutral introduction; bot-controlled floors then advance around an inactive center seat until you act. Your final ruling stays authoritative, both advocates react to it once, and Prism gives only the neutral procedural close. In bot-moderated sessions, the moderator closes after the verdict and any Jury aftermath. If the whole chain fails, the proceeding pauses on the exact non-bookend action and offers Retry or Skip without dialogue; openings and closings fall back to neutral procedural copy, and Jury ballots are Retry-only. LOCAL remains a hard offline guarantee. The in-room Judge console keeps one contextual Gavel control, Pause or Gavel to resume, and End Debate together beside the proceeding instead of in the app chrome; its label becomes Intervene while an advocate holds the floor and Call time during overtime, and Space invokes that same context-aware control; Participant and Spectator sessions use the same in-room Proceeding console without the Judge-only controls. Pause takes effect immediately, even during the semantic intervention cooldown, even while a line is still being heard or the next turn is preparing; leaving an already-finished Debate does not try to save a recess. The moderator uses a short Persona-shaped recess line with varied procedural copy as a safe fallback. A Participant shares three recess requests between Pause and a confirmed Leave Debate: PRISM records the recess in the background without delaying the return to Studio. Crash or background recovery never spends a request while one remains. The third accepted recess creates a durable final-recess checkpoint. After three, the Moderator denies further in-room requests, favorability falls, and each consecutive attempt drains more of the visible Moderator patience reserve. That same remaining reserve is the Participant’s bonus time after later floor clocks expire. If it reaches zero, the Moderator gavels arguments closed and rushes directly to an abbreviated Jury deliberation or their own ballot with a severe conduct penalty; this cannot be rewound to the final checkpoint. Leave Debate with no recesses left is housekeeping, not a fourth request: it returns immediately, and reopening restores the final-recess checkpoint. Leaving an unfinished Debate with a recess available preserves its exact floor and makes the returning chamber appear in recess. Resume requires you to strike the visible gavel; its audible hit calls the camera to the moderator before that moderator gives a Persona-shaped return-to-order line. The exact next juror, discussion turn, ballot, objection, intervention, or interrupted line then continues. The cooldown governs semantic interventions within that gavel control, not audience order or lifecycle controls. Pause and Resume remain live procedural presentation only; neither housekeeping beat enters the readable proceedings or copied transcript. Recess ceremonies and every 8× slowed Participant input interval are also off-record: gallery, ambience, reaction, and thinking audio are suspended rather than captured. End Debate skips the remaining rounds: a Jury holds only three discussion turns and is told not to penalize unheard rounds. When formal Jury deliberation arrives, a timed choice appears over the current camera. Auto is the default and begins after the Debate-settings countdown; Spectators and human Judges can choose Watch Jury to hear and view the deliberation live. The Jury remains advisory to a human Judge. Skip moves directly to final ballots. Skipping remains available after discussion starts—even during a juror’s current statement—and preserves all five final ballots and the full five-ballot Jury result. Judge input still waits until you act or pass. Participant input instead receives eight wall-clock seconds per announced floor second; the visible Debate and floor clocks advance at 1/8 speed while you write. Overtime drains favorability and the Rowdiness-based patience meter until the Moderator gavels, the opponent offers a persona-shaped taunt with one final grace window, or PRISM answers with the awkward two-beat “…” and “…What was it you said again?” failure.",
        clickLabel: "Start Forum or Start Turnabout",
        targetSelector: '[data-tutorial-target="debate-start"]',
      },
      {
        heading: "Use the Judge’s gavel",
        body: "The public gallery is alive in both Forum and Turnabout, from every seat in the room. Its visible gallery badge and four-bar meter move deterministically from Observing to murmuring, restless, and disruptive; a successful call to order returns the house to Observing, and debate events earn heat from there. As the house walks in and the chamber loads, the murmur gathers from silence with the arriving seats instead of starting at full voice. The chosen Rowdiness controls how quickly—and how loudly—the room heats up, with a smooth swell instead of hard jumps. The audio bed has deliberate inertia in both directions: pressure builds over several beats, and a gavel leaves a taper of stragglers instead of switching the crowd off. Daytime Showdown sits at the free-for-all end: the gallery can start swelling earlier in a line and stays rowdier until the moderator contextually calls order. Portrait crosstalk and layered room audio grow with it, with protected mix headroom for reactions and the gavel. Captions stay readable and the crowd never changes an argument, ruling, ballot, or outcome. Debater text stays clean spoken prose—PRISM never inserts *speaks loudly*, *yells over the audience*, *raises voice*, or other actor directions into the saved line. A silent local gallery director watches only the recent audible public debate and may assign none, laugh, gasp, or impressed after a line lands. Most lines stay quiet; explicit 1–3 intensity controls how much of the room reacts and how loudly, while saved cooldowns prevent repetitive canned sounds. Gibberish may earn laughter, a truly shocking public beat may earn a gasp, and an unusually sharp responsive rebuttal may earn an impressed reaction. The direction is presentation-only and never reaches Proceedings, copied records, the case board, evidence, ballots, or the outcome. LOCAL remains fully local, and a conservative deterministic fallback keeps the proceeding moving if the director is unavailable. The bot Moderator sparsely strikes the gavel and calls for order in character in Forum or Turnabout—including when Heated or Daytime Showdown stays Restless long enough, not only the first time the gallery crosses into Disruptive. If the room rebuilds to disruptive after a prior warning, a repeat intervention strikes again and uses a firmer “I said order. Silence.”-style call. The moderator never needs to shout—the gavel carries the authority. That room-control beat is preserved at its heard position for faithful replay while staying out of Proceedings, copied records, the case board, ballots, and AI context. When you are the Judge, PRISM never takes that authority from you. Gavel is one context-aware physical room-control action. Use the control attached directly to the gallery, the mirrored Judge-console control, or press Space to strike. In its audience-order state, it forces the Judge / Moderator camera, holds a rowdy peak under the call (with a light laugh swell when the room is already hot), then eases the gallery back through a few audible stragglers without stopping the speaker or reveal. An early strike earns only a brief awkward freeze and spectator glances—there is no authority penalty. The saved order cue preserves its exact heard position for replay while staying out of Proceedings, copied records, the case board, ballots, and AI context. Extra strikes during the two-second smash window are local showmanship, with only one canonical order cue saved. At saved procedural moments, a ceremonial cue waits for your strike without authoring one for you. If that cue expires, the interface stays clear while Auto silently cuts to one advocate and then the moderator before the proceeding carries on. Space serves that ceremonial cue first. During an explicitly started call-time burst, Space adds showmanship strikes next. Otherwise the single Gavel / Space input follows the live floor: Intervene while an advocate is speaking, Call time in overtime, and ordinary audience order when no semantic cutoff is available. An intervention stops the active floor, opens the Judge choice deck, and keeps the eight-second semantic cooldown. While semantic intervention cools down, the same gavel falls back to non-interrupting audience order and the amber countdown explains when Intervene returns. If Space is temporarily blocked by a pending ruling, intervention, pause, Jury floor, or saving strike, the chamber explains why instead of failing silently. During advocate overtime it becomes Call time; choosing it starts the existing two-second procedural burst, with repeated Space strikes shaping the measured, firm, or aggravated call-time performance. Pause, Resume, semantic intervention, and ceremonial order cues also settle the room. An advocate objection remains different: the interrupter literally shouts “Objection!” and states the challenge first, then a timed Sustained / Overruled choice takes focus; press S or O without reaching for the buttons. While that ruling is pending, room controls stay locked. Once Jury deliberation begins, the Jury owns the floor: the unified Gavel and Space are put away, while Skip deliberation remains available. Your selected camera mode survives every forced gavel shot, so Auto resumes directing as soon as the strike finishes.",
        clickLabel: "Gavel",
        targetSelector: '[data-tutorial-target="debate-judge-gavel"]',
      },
      {
        heading: "Read the living case",
        body: "Both formats stage every frozen floor holder behind an authored side podium, with the moderator elevated between them when the cast can perceive that body. Bot advocates use their actual animated bot; a Participant's selected side uses PRISM as the human debater's public body. When a speaker is about to discuss evidence, the chamber places that one cited exhibit or source on the table as their turn arms—never mid-line hops, and never a piece they will not talk about. It stays until another advocate turn cites a different piece, or until the next advocate or Participant discussion moves on without a citation; moderator beats, Judge gavels, and gaps between turns leave it in place. Advocates may only refer to packet items they have marked for display in that turn. Every Participant opening, challenge, rebuttal, and closing offers three randomized, unlabeled suggestions plus Make my own case. Internally the suggestions span great, okay, and safely weak answers, but their quality tier never appears in the live label or API. The response deck sits directly beneath the gallery: choose a suggestion to expand and review its full text, then use the persistent Commit action; choosing a card never speaks it by itself. Custom and cut-in composers accept @ to open a picker of frozen exhibits, Brave, Scholar, and URL sources—filter with @exhibit, @brave, or @scholar—and choose a row or press Tab/Enter to insert a real citation chip. Substantively using frozen evidence doubles that answer's signed impact: strong use helps sharply, while confidently misusing it doubles the credibility loss. The motion stays titled across the top of the chamber while perceptible words appear as synchronized broadcast captions along the bottom; a CC button at the bottom-left of the Forum viewport toggles those captions on or off—including spoken Jury chamber subtitles—and remembers your choice. Public prose arrives with the live voice; inaccessible speech never enters captions, voice, the shared case board, or listener-facing ballot reasons. Debater captions and saved Proceedings contain only the words being argued; bounded voice-performance metadata can still shape delivery without appearing as asterisks or stage prose. On a sparse replay-stable roll, an advocate whose own saved Persona genuinely finds an audible contribution contrary to expectation or newly explanatory may give one short in-character vocal reaction; a Signal-style *tag* appears above that bot while it speaks through the bot’s voice, and like Signal it stays out of Proceedings and copied transcripts. Sparse ambient throat-clears, sighs, and inhales also float the same overhead tags and speak the same way. It is atmosphere, not a new argument, vote, role change, relationship-memory read, or hidden Power reveal. In Participant sessions, PRISM is the complete selected-side advocate and carries your thinking, speaking, interjection, and objection states. It labels the live line “PRISM · You” while the saved event remains player-authored. A persistent favorability balance evaluates both advocates for argument, humor, confidence, undermining the other side, and subject knowledge; earlier opportunities move the room more, while later turns face diminishing influence. It can shift each Persona's ballot only within a bound—it never replaces that voter's own predisposition or reading of the public record. Coach shows the live balance, scoring feedback, and five anonymous Jury leaning pips. Standard reveals the balance after the verdict. Immersive omits it from ordinary UI, while all three difficulties use identical scoring. Spectator shows that same live favor bar between the two advocates, labeled with their names. It only follows turns already heard—so a prepared gallery cannot jump the needle ahead of the floor—and it is not a vote forecast. Each visible podium carries its floor holder's glyph; the current turn glows even when it is silent, so the cue follows floor ownership rather than speech or prose while stable identity remains canonical. Frozen faces, ink, frame finishes, visibility, thinking, listening, and speaking states remain live throughout the proceeding. Judge choices take over the caption position at the moment of decision; Participant Forum actions and Turnabout actions rise in a full-width command deck. Forum keeps the scoreless case board and gives a Participant two distinct ways to break an opponent's live floor. Copy case board copies that SMS-style claims thread as plain text for review, separate from Copy verbose transcript on Proceedings. Interject and Objection both capture the exact audience-heard fragment, desaturate the Forum except PRISM's thinking glyph, slow the Debate clock by 8×, and open a 30-second evidence-aware message box. The opponent audibly soft-cuts mid-phrase while their camera still holds. Then Interject plays “Hold on—” or Objection plays “Objection!” before the camera pans to PRISM · You; only after the call finishes does the composer take focus. Expiry withdraws the cut-in with a small favorability loss and restores the opponent's floor. A submitted objection goes to the bot Moderator/Judge for Sustained or Overruled. Sustained leaves the cutoff in place, while Overruled returns the opponent's floor for a concise continuation. Withdraw objection also returns the floor, records the withdrawal instead of a ruling, and lets the opponent finish. Only the heard fragment remains public before either path resolves. Separately, Turnabout uses a public statement record: Press asks for clarification; Object opens the frozen evidence vault; Present Evidence sends one statement-and-evidence pair for grounded validation and an immediate ruling. Sustained contradictions create explicit reversals without inventing evidence. With Jury off, compact mini spectator bots face neighboring seats and trade quiet ellipsis chatter without gaining the floor or a vote; a dry gallery murmur remains a separate audio layer. With Jury on, that strip becomes the frozen public roster.",
        clickLabel: "the living case board",
        targetSelector: '[data-tutorial-target="debate-case-board"]',
      },
      {
        heading: "Enter the Jury chamber",
        body: "When Jury is enabled, Auto enters the four-seat chamber for leanings, deliberation, ballots, and the split—this is a required scene, not a camera you pick. The chamber uses the same circular overview table from the Wide Forum shot. It seats bot faces and frames around that table. Forum Auto never glances into the jury room. Once deliberation begins, Auto stays in that chamber for the whole discussion: no Wide breaths, mute glances, interrupts, or forum cutaways until the scene is done. After those beats it returns to the forum for advocate aftermath reactions. While the chamber is up, the public gallery strip hides so the room owns the stage. The same CC control that toggles Forum captions also shows or hides spoken Jury chamber subtitles. The four jurors follow the live case and form short thoughts between public-floor turns; those thoughts stay in the bottom Jury widget until deliberation, when you hear them. An ellipsis beside a juror means a between-turn thought is waiting; hover it to read that opinion without interrupting the public proceeding. Four private leanings lead into routed discussion and four final juror ballots. Those leanings are collected together before you hear deliberation. Each audible juror reads the same final reason; as each final ballot is cast, its side appears and the running five-vote tally updates. A canonically silent juror still casts. A physical mark slides into the center pile. In bot-moderated sessions, Auto stays in the Jury chamber while the Moderator then records a distinct fifth and final ballot, then speaks the verdict from that room, breaking a 2–2 split while still voting after a 3–1 or 4–0 juror result. A faint muffled gallery remains audible through the wall. For a human Judge, no vote is invented on your behalf: the chamber is live and named but remains advisory and your own final ruling occupies that last authority beat. Participants never mount this chamber; their camera stays on the public proceeding while only the aggregate resolves and individual ballots remain private.",
        clickLabel: "the Jury chamber",
        targetSelector: '[data-tutorial-target="debate-jury-chamber"]',
      },
      {
        heading: "Frame the floor",
        body: "Auto is the quiet default camera: it cuts instantly to Left for the For advocate, Moderator for the moderator, Right for the Against advocate, and Wide whenever no bot owns the public floor. If Auto has been on one speaker for a while, it cuts Wide to see the whole floor, and sometimes glances at another participant for a few seconds even when they are not reacting, then returns. Those glances stay on the public floor—never the jury room. Once the Jury is announced, Auto stays in the chamber through leanings, heard deliberation, every juror vote, and the Moderator’s last ballot. During long moderator monologues—openings, recess and resume calls, and other extended floor prose—Auto adds paced reveal beats: after the formal docket listing it cuts Wide then to each advocate when the moderator talks about them, then returns to the moderator before the floor is handed off (without lingering on the final introducee). Brief Wide breaths still appear when the prose runs long without names. Evidence placed for the active turn can stay on the table without forcing Wide—speaker shots keep priority while the pedestal remains visible. When you take the Judge / Moderator seat, the public floor stays on Auto instead of exposing manual Left, Moderator, Right, or Wide shots. If Jury is enabled, Auto enters the chamber for leanings, deliberation, ballots, and the split as a required scene, then returns to the forum for advocate aftermath reactions. Jury is not a camera you pick. Participant and Spectator sessions retain manual public-floor cameras. In Participant and Spectator sessions, procedural gavel cues direct Auto to Moderator: one strike calls attention at every phase change, while two restore order for moderator rulings and verdicts, with the active moderator’s color carried through the instrument. Advocate objections carry no predictive gavel cue; the objection is heard before any bot moderator responds. A human-Judge session automatically activates the center seat for its neutral introduction; after that, explicit Judge actions alone reclaim the center seat and gavel until the final ruling. The advocates then react before the automatic neutral center close. Any actual gavel slam briefly forces Moderator and disables camera controls through the swing without replacing the selected mode; Auto resumes as soon as the forced shot ends. A canonically silent bot moderator can use that visible signal without speech. Forum and Turnabout keep the procedural rhythm for bot-moderated roles; Turnabout keeps an extra strike for a public revelation. The gavel is visible only in Moderator view. Choose a manual view to hold the shot outside forced strikes when your role allows it. Camera choice changes presentation only—it never changes the saved transcript, case board, ballots, or speaking order.",
        clickLabel: "a Debate camera",
        targetSelector: '[data-tutorial-target="debate-camera"]',
      },
      {
        heading: "Follow and keep the record",
        body: "Proceedings render safe Markdown and source chips in the chamber's tonal transcript rail. Each floor line opens shortly after speech begins and streams with the heard words, with a short stenographer lag so the rail never spoils a baked Spectator gallery or a mid-line recess. It follows every growing live turn until you deliberately scroll back; choose Live to return to the newest phrase. A compact Debate time clock in the room counts up from when the chamber is live, freezes during recess and before Spectator Start, and never counts down a total runtime; timed advocate turns retain their separate floor-limit readout. Juror thoughts, deliberation, and Signal-style vocal Foley reactions stay out of Proceedings. The bottom Jury widget stays up through the public floor. When Auto enters the Jury chamber, that slot becomes the live Jury Record — it fills with heard thoughts and deliberation, then seals after the verdict (with Copy all data to clipboard, Copy Jury transcript, and Copy verbose transcript whenever those records are copyable — not for Participant-sealed Jury), and a Verdict tab beside Case board that opens the ruling, Coffee-style session summary, ballots, and an Inquiry alcove with role-colored cast chips and temporary pick-a-bot inquiry chat so you can ask about a cast member’s frozen in-debate reasoning — nothing is saved, threads stay per cast member while you remain on the verdict, and positions stay as they were. That Jury transcript remains directly copyable from its eligible Proceeding archive entry after you return to the Studio. With Jury off, a human Judge's ruling is final, a Participant's bot Moderator/Judge decides the result without inventing a PRISM ballot, and a Spectator Duel uses the traditional three-bot majority. With Jury on, the majority binds Spectators and Participants but advises a human Judge. After a Participant verdict, only the bot opponent may react before the bot Moderator/Judge closes; PRISM never invents a human reaction. Spectator verdicts still let both bot advocates react before the bot Moderator closes. In Judge sessions, the human ruling is followed by both advocates’ reactions and an automatic neutral center close. Judge and Spectator records keep named deliberation and ballots; Participant API responses, transcript copies, archives, and replay-facing event data retain only the aggregate split and verdict. Every completed archived Debate shows its approximate active runtime from the saved presentation timeline, excluding generation waits, explicit recesses, and time spent away from the proceeding. It also keeps a short title synthesized in the selected Rowdiness while preserving the exact motion beneath it. Open resumes or replays that proceeding; Use setup copies its motion, title, room settings, cast, role, Jury choice, and evidence into a fresh editable workbench without changing the original. Results and old consent do not carry over, unavailable Library bots must be reassigned, and your currently selected model and routing remain in place for the rerun. Copy all data to clipboard builds one review paste with the verbose transcript, Jury record when allowed, and Living Case Board. Copy verbose transcript creates one review-ready role-safe record with frozen setup, runtime snapshots, evidence, event metadata, setting-independent per-line spoken durations, interruptions, moderator rulings, case-board state, and permitted public ballot reasons. Participant reviews add a Human Factor section for difficulty, Rowdiness patience, guided or custom choice provenance, evidence multiplier, favorability history, timing, recesses, predisposition adjustments, and final vote math while keeping sealed jurors anonymous. The Case Board panel keeps its own Copy case board control for the shorter heard-claims stream.",
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
        body: "Open the designed bot dropdown, then choose a host from its vertically scrolling, color-coded list. You can search by name or use the hue lens to move through bot colors without leaving the Create show card. When booking a bot guest, the shared card grid has its own vertical hue lens on the right; clear it to return to name order. Optionally add a premise inspiration—the spark, tension, or reason this show should exist. Each host still starts immediately with an editable fallback name and a camera-ready PRISM set, so creating the show never waits on synthesis. Right-click a host or guest anywhere in Signal to open that bot’s actions and Avatar Studio.",
        clickLabel: "the Create show producer card",
        targetSelector: '[data-tutorial-target="botcast-create-show"]',
      },
      {
        heading: "Shape the show’s identity",
        body: "Complete this show is resumable: Signal uses and can sharpen your editable premise inspiration while it fills only the missing text identity, transparent logo, and matching Light/Dark studio set, keeping any artwork already installed. A status card anchored around the live Prism orb tracks visuals as they land one at a time in the background, so you can keep using PRISM, and rerunning it retries only unfinished pieces. Its cached ElevenLabs ident and studio-specific room-and-Foley loop join the same pass when you are Online; in LOCAL, Signal finishes the supported pieces and leaves audio waiting without breaking privacy. The gear at the bottom-right still lets you tune the premise and name, regenerate blurbs, and adjust atmosphere audio; it opens exact-type rails for studio sets and logos. Choose Synthesize for generation with the model shown directly beneath it, or View all to search previously synthesized assets in the account-local library. Synthesized logos receive five automatic local magenta cleanup passes right after keyed cutout; Reduce magenta still applies cumulatively to the complete set for extra polish and rebuilds the studio lighting derivative. Signal installs only one current logo, retains the immediately previous logo for Undo, and replaces that one-step history after the next successful install. Applying a studio always installs both variants and rebuilds its lighting maps together. These assets never mix into general Images. An echo-bound host gets one persona-shaped boast about always having something original to say—and repeats that same blurb forever instead of rotating a batch.",
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
        body: "Every show starts with a deterministic, host-persona-led Signal Synth ident, a bundled quiet studio atmosphere, and synchronized tactile Foley—available locally with no key or network and no custom look. Open Rehearse stage, then Fine tuning, to balance the unified room atmosphere and tactile Foley; Signal saves the mix for that show. Use Play ident to audition the opening. The show-card gear is always available to create or refresh one cached ElevenLabs audio package: a six-second ident plus a studio-specific, non-musical room-and-Foley backing loop. Only the current package plays; after a successful refresh, Undo restores the immediately previous ident and atmosphere together. A later refresh replaces that one-step history. Refreshing the studio also refreshes that cohesive atmosphere when you are Online. Signal never synthesizes a new ident or room loop when an episode begins; ordinary listener reactions use cached neutral room Foley and never warm new speech during the opening wait.",
        clickLabel: "the atmosphere audio controls",
        targetSelector: '[data-tutorial-target="botcast-intro-audio"]',
      },
      {
        heading: "Synthesize a fresh ident",
        body: "Use Synthesize ident · Local for a fresh deterministic Signal Synth ident without a network call, or Synthesize ident · Premium for an ElevenLabs ident. This action refreshes only the ident, so an existing custom room-and-Foley atmosphere stays in place; Create atmosphere remains the full premium ident-and-atmosphere package.",
        clickLabel: "the atmosphere audio controls",
        targetSelector: '[data-tutorial-target="botcast-intro-audio"]',
      },
      {
        heading: "Choose how the bots speak",
        body: "The Voice picker in Signal’s top navbar matches Zen: Mute stays silent, English uses each bot’s local identity without ElevenLabs credits, Premium uses its ElevenLabs identity with local fallback, Babble keeps the selected local voice without intelligible words, and Bottish uses Prism’s procedural robot language. Signal prepares the next bot-controlled handoff while the current line is heard, then discards that preparation whenever live direction changes the floor. Signal lets an ordinary thinking pause stay quiet instead of filling it with scripted commentary; when fresh generation still needs time, an eligible responder may give one brief in-character acknowledgement before a single restrained thinking beat. It appears like any other on-air line. Eligible Premium listeners can still add a sparse throat-clear, light cough, sigh, exhale, chuckle, or a short in-character murmur inside another bot’s line; English still speaks those in-character comments locally when Premium Foley is unavailable. It stays out of the transcript and is saved for replay. Bot ambient sips land only while the other bot is talking; when you Choose Me, your cup moves only after you click Sip coffee, and cup-return sounds stay synchronized with the visible cup motion. For eligible Premium voices, Eleven v3 automatically carries a non-neutral speaker mood into the next line; neutral speech stays untagged, and an explicit saved vocal reaction takes precedence. With Voice Effects on, host and guest sometimes take the same quiet mic-ready breaths before substantial lines; saved episodes choose them deterministically on replay. The direct stereo mix follows the host and guest’s saved stage positions subtly while their room reflections remain shared; mono playback stays centered and clear. Choose Voice before recording. When Signal begins master capture, it freezes that speaking type and English or Premium engine for both host and guest, locks the picker until finalization, and bakes the rendered mouth performance into the saved episode.",
        clickLabel: "the Voice picker in the top navbar",
        targetSelector: '[data-tutorial-target="botcast-voice-mode"]',
      },
      {
        heading: "Book tonight’s episode",
        body: "Choose Get interviewed (Me), Produce a show, or Watch a show (prepares a head-start buffer, then waits on the title card unless Start automatically is on), then pick a guest when needed, set a short public episode title, and write optional private producer comments—or use Book for me to choose a guest and have the model in the top navbar build both together around what this host and the show’s listeners would genuinely want to explore. I Feel Lucky! goes one step further: it skips the search, chooses an active show and compatible non-host guest, creates their coherent public title and private premise, then immediately starts through Signal’s normal launch path. For a Produce or Watch episode with a bot guest, you can also attach the episode’s one .png or .jpg before recording when Auto’s current model pool contains a vision-capable model, or when you choose a fixed vision-capable model. Signal routes an Auto image turn through that capable pool. Signal classifies transparent PNGs as physical items and opaque PNGs or JPGs as pictures, prefills an editable spoken Name from the filename, keeps the optional Reason private to the host, and automatically presents the image at a natural interview beat. Leaving Name and Reason untouched matches adding that file during the live show; the bytes remain session-only and the usual end-of-episode Keep in Items choice still applies only to transparent PNG items. Signal setup and the on-air composer are ordinary words; Prompt Center prompts, commands, and wildcards stay in immersive Zen. The compact Topic field remains a single-line title input. Choose Me — go on as the guest for a different contract: add optional interview direction, or leave it blank and let the host surprise you with a fresh show-shaped topic. Signal’s AI synthesizes the public topic, private interview plan, and every host question without inventing facts about you. During that recording you answer through the standard composer at the bottom—in ordinary words—while queue cards, nudges, live direction, bot Powers, and AI-written guest turns stay out of the human guest lane. If the host is a ready Troll, ordinary Send and Shh leave its current bounded ambush on mic and keep your answer drafted until the host yields; Cut show, mute, disabling the Power, or leaving Signal still works. Every episode is a fresh, non-canonical meeting: persona lore shapes beliefs and voice without becoming a prior relationship between the cast. The generated public topic stays title-like; the richer provocative question, angle, boundaries, and follow-ups stay in the private comments. Both stay editable. The small dice beside Topic and Private comments can regenerate either field on its own. Latest episodes can restore the guest, topic, private comments, available model override, and duration from a finished episode without starting it; your current episode mode stays in place. Signal freezes the host and guest’s ready Powers when recording begins. Hard visibility and speech-audience Powers also govern the broadcast itself: anything listeners cannot perceive is absent from the stage, captions, voice, replay, and Audience Pulse review. Those Powers can affect whether they have coffee at all, silence, response length, and the next direct response—including a trustworthy interviewer or interviewee drawing one more candid answer without overriding the other bot’s agency or boundaries. Hard bare-minimum and brief Powers stay bounded while allowing a required introduction, closing, or departure beat to finish. Each cast member interprets observable Power consequences through their own personality: one may become curious or amused, another irritated or cautious, while Signal never exposes a cause they cannot perceive or forces the same reaction twice. A radiant-joy cast member gives the directly addressed peer one bounded, persisted mood lift after each spoken turn; the peer's next line shows the lift in their own voice without forced agreement or denial. After a bot directly talks to a sad-grouchy cast member, only that addresser receives one bounded, persisted mood drag; its next line shows less momentum through its own personality without forced hatred, hopelessness, or agreement. A ghostly cast member is unseen between lines, fades in only to speak, and may leave the other bot shaken without scripting its reaction; replay keeps that recorded reveal. An echo-bound cast member repeats the immediately preceding on-air cast line exactly; private producer comments never leak into that echo. When the echo-bound bot is the host, a bot guest takes the opening and closing so the host never gains original speech. If both cast members are echo-bound, Signal supplies one public opening cue made only from the show, cast, and topic; the first bot repeats it exactly and the other mirrors it, so the booking still goes live without weakening either Power. Hard mute and echo hosts can still take a Producer guest: a muted host privately composes its turn while the on-air floor receives timed silence, while an echo-bound host opens once and then mirrors the Producer's last public answer exactly. The human guest decides how to respond to that strange interview instead of setup blocking the experiment. If a hard-of-hearing cast member asks what was said, the prior speaker repeats its saved on-air line and its saved delivery mood drops one step each time. Direct producer direction and closing safety still take priority. A muted cast member can still act and sip: physical actions float above their avatar and stay out of captions, their saved public transcript line begins with one period immediately, adds one per second, and ends with the elapsed-time stage cue; their ordinary intended speech stays private, and Signal never plays or previews their voice. Longer silences may cut to sparse listener reactions, and an eligible late reaction can become a genuine floor interruption. If both frozen cast members are muted, both still privately compose ordinary turns while the audience experiences the replay-stable timed exchange. Episode length defaults to Auto: no countdown, at least a few substantive guest answers, then a natural close when the conversation settles. Requests to repeat a question and tiny fragments do not count as interview progress; choose a timed target when you want one. Produce and Interview open a short, skippable show-branded pre-roll while Signal prepares the host’s opening line and paces the next safe handoff ahead. Watch prepares ahead with a progressive bake: a fullscreen loader appears only until a shorter opening runway is buffered, then the same intro card opens and waits. Press Start show whenever you want while Prism keeps baking ahead, or enable Start automatically in setup to begin as soon as that runway is ready. Once started, Prism presents every later line in order. Stopping a Watch attempt returns to the show and keeps its booking in Latest episodes for a clean retry; a fully ready episode stays reviewable from the beginning. If a selected local model is still loading when that pre-roll ends, PRISM holds the studio and pauses the episode clock until the opening is ready. The default stage places both bots in the authored chairs and cups only for bots who drink coffee. If generated studio furniture lands differently, Rehearse stage opens a fullscreen, stage-first workspace with a fresh Library guest for scale. Drag bots, cups, floor glow, the center-screen show logo, and the neutral episode-image prop directly into place; Signal autosaves as you work. Save a named Stage preset to reuse the complete Rehearse setup on another show, then select it and Apply; presets carry placement, cameras, screen treatment, room mix, and saved voice levels, never show identity, cast, or artwork. Switch the rehearsal prop between Item and Photo to see each real stage treatment while you place it. Left, Right, and Wide each keep their own episode-image X and Y plus separate Item size and Photo size for this show, while Auto follows the active camera. Transparent PNG items use Item size; opaque PNGs and JPGs use Photo size. The center-screen show logo keeps its own X, Y, and scale only for this show. Fine tuning reveals the Light and Dark previews, seat swap, voice soundcheck, camera zoom and pan, cast balance, screen treatment, and room mix only when needed. Bots and cups turn inward from their new sides. Signal freezes this show’s camera and episode-image placement when recording begins and saves it with the show logo placement in faithful replay, so later rehearsal edits never rewrite an earlier episode. Pick LOCAL or ONLINE in the top navbar. Leave Model on Auto to let Prism choose a suitable model and Effort for each generation during the recording; a fixed model bypasses Auto. Ordinary local Auto turns use a compact live-performance prompt so smaller models spend their runway speaking instead of building a scratchpad. Signal gives the first turn one primary route and at most two quick recovery routes from your saved priority order. If that runway fails, each later turn may try at most two short, fresh recovery candidates before a varied transcript-grounded safety line lands the floor; failed candidates stay quarantined for that episode. Signal locks LOCAL/ONLINE, model, and Effort when Watch prepare or the episode begins, and keeps them locked through pause until you Return to show. Auto still chooses model and Effort for each generation when selected, including during Watch bake. The private comments shape the host but never go on mic. Eligible ElevenLabs voices automatically receive sparse, saved vocal reactions.",
        clickLabel: "the episode setup desk",
        targetSelector: '[data-tutorial-target="botcast-setup"]',
      },
      {
        heading: "Bring one image to a show",
        body: "When a bot is tonight’s guest, Produce and Watch both offer the same optional Episode image editor. Attach one PNG or JPG only when Auto’s current pool, or your fixed model, supports vision. Its editable Name is spoken on air; Reason stays private to the host. For Watch, the image is prepared with the show, then appears naturally after the opening exchange without creating producer controls. The original stays session-only; only a transparent PNG item can be kept in Items after the show.",
        clickLabel: "the Episode image editor",
        targetSelector: '[data-tutorial-target="botcast-episode-image"]',
      },
      {
        heading: "Take the lucky shortcut",
        body: "I Feel Lucky! sits beneath Create show and unlocks once a show exists. It is Signal’s one-click fast lane: it chooses an active show, books an available non-host guest who fits that show, synthesizes a coherent public episode title and private premise, and immediately starts through the same launch checks as Begin episode. If synthesis fails, nothing starts and the Production Desk stays available.",
        clickLabel: "I Feel Lucky!",
        targetSelector: '[data-tutorial-target="botcast-feel-lucky"]',
      },
      {
        heading: "Direct the live cut",
        body: "Left, Right, and Wide hold a fixed studio shot. Auto opens on the full studio and uses editorial hard cuts exactly as audible host and guest speech begins, so a ready handoff never flashes Wide or glides late. If Auto has been on one person for a while, it cuts Wide to see the studio, and sometimes glances at the other person for a few seconds even when they are not reacting, then returns. When a bot is genuinely thinking, loading a voice, or visibly waiting, Auto immediately returns to Wide and shows that bot thinking; its one 900ms push begins only with the audible pre-speech presence. Prepared text alone never changes the camera. Wide remains the underlying conversation shot. Brief neutral listener Foley and explicit interruption clips under 2.5 seconds stay off-camera; only an explicit sustained interruption marked for a listener cut moves the camera. Ordinary listener beats stay language-free in the room mix, while semantic cut-ins belong to a Power or Producer interruption and use that character’s own voice. A saved social-silence beat belongs to the silent bot on camera instead of inheriting the previous speaker’s hold. Choosing any fixed shot breaks out of Auto and never receives reaction cuts; choosing Auto again hands direction back at any point. Sustained audible interruptions cut directly to the interrupter, never through a slow sweep. Arrow keys cut live too: Left, Right, Down for Wide, and Up for Auto. Signal bakes every camera shot, its timestamp, and whether the visible cut was instant or the brief thinking push was animated into the finished episode.",
        clickLabel: "a live camera",
        targetSelector: '[data-tutorial-target="botcast-live-camera"]',
      },
      {
        heading: "Produce from the control room",
      body: "Signal keeps transcript ownership with one primary speaker while allowing bot audio to overlap, and lets the studio performance own the live screen. The active line appears as a live caption in step with the voice and clears as soon as that line ends; a CC button at the top-left of the screen toggles captions on or off and remembers your choice. The full transcript stays out of the initial play and returns with playback. Every generated bot answer waits an extra randomized one-to-five-second on-air beat after it is ready; eligible bots may use that beat for one brief persona-aware spoken response cue, which appears in CC and the heard-only review instead of extending the thinking state. When you are the Producer guest and the conversation panel is collapsed, the host’s latest prompt remains on stage in full while you answer; longer questions scroll gently in place so you never have to hold the whole question in memory. The listening host or guest may add a low-key nod, expression, or neutral nonverbal Foley during the line. Ordinary deterministic listener beats stay language-free, never take transcript ownership or interrupt the primary turn, and most stay off-camera. Semantic cut-ins belong only to an explicit Power or Producer interruption; only a cut-in that actually becomes audible briefly lowers the primary voice before restoring it, so a failed or muted reaction never dents the floor. Audible interruption words use the same ordinary CC and transcript presentation as dialogue rather than floating as an action; physical reactions remain avatar-only. An interruptive cast member’s Power can still seize live openings in any targeted bot castmate’s answer, with the interrupter voicing a short hold-on while the interrupted bot may overlap with an annoyed, abandoned ending when enough of the line remains to feel genuinely cut off. A Power authored to interrupt every time cuts each eligible bot turn without a random roll or cooldown, at a replay-stable point that can land early, in the middle, or late. Once at least 85 percent of the original line has been heard, the cut-in may still overlap, but the original speaker does not add an annoyed ending or reclaim the floor; as a guest, Interrupting Tom cuts every ordinary bot-host opening and interview turn, including producer-directed host turns; other interruption Powers retain their frequency, strength, target, and cooldown. Human Producer speech, warnings, departures, wraps, closings, and hard speech restrictions stay protected. Signal’s separate immersive reactions still belong to the performing bot, float above that bot, and are preserved between asterisks in the saved transcript without becoming fallback dialogue. A live ! chip means that bot just acquired a relationship memory: click it to read the exact memory and dismiss the alert. Returning to the show clears any unseen Signal alert without deleting the memory itself. In a normal bot-guest episode, the large bottom cue dock lets you ask about a detail, give the host private wording to transform into its own in-character question or redirect, add one image when the active model supports image input, refocus, press harder, move on, lighten up, or wrap at any time; every cue remains private to the host and the guest only hears the host’s own on-mic words. Signal accepts exactly one .png or .jpg per episode. The filename stem supplies its name. A PNG with visible transparency is treated as the item itself and keeps the existing exhibit-like shadow; a fully opaque PNG is treated as a picture, just like JPG, and appears in a light or dark Polaroid frame that follows the active theme. Both use the same compact camera placement: the wide camera places either one at the lower center, while the left and right cameras keep it on their matching side. The raw file remains ephemeral to the active episode and its vision-model turns. On attachment, that locked vision model automatically chooses one contextual emoji for replay; no emoji picker interrupts live production. It appears on the center table as the host invites the guest to look, stays beside each speaking bot through the guest’s response and any queued clarification, then clears after the host gives an opinion and transitions. At the end, only a genuinely transparent PNG item offers an unchecked Keep in Items option; choosing it writes that item to the local asset database and links it to the bot guest it was presented to. A replay uses that saved item while it exists; an unsaved or later-deleted item falls back to its recorded bare emoji. Pictures are never retained and replay as that emoji inside the same Polaroid frame. Tab moves between Host note… and Shape this…; Enter sends whatever is filled, and Enter again runs Interrupt guest now when the guest has the mic, is next, or is still being prepared. Producer-guest episodes replace the cue dock with the bottom answer composer, so the AI host keeps sole editorial control. After several substantive exchanges, a host who genuinely refuses to continue can end the interview on mic and leave; Signal immediately archives the distinct Host ended the show outcome instead of inventing a normal sign-off. When a cue arrives early in the host’s own line, they are likely to break off and redirect on mic with an in-character self-correction, even if the live pivot lands a little awkwardly. Once most of the point is already out, the cue stays queued for the host’s next turn. If the guest has the mic, is next, or is stuck preparing, Interrupt guest now cancels that owned run and asks the server for a bounded host takeover. The host’s saved short interjection never plays until the server accepts the interruption; if it cannot, the cue remains queued and no success acknowledgment plays. If interruption is unavailable, the cue card explains which live state is required instead of silently doing nothing. Once at least 85 percent of the guest’s line has been heard, Signal keeps the cut-in but omits that annoyed follow-on. Any unheard remainder of the guest’s line is discarded from the saved transcript and replay, so only what reached the audience remains. Manual camera buttons change the visible live shot immediately even while Signal is waiting, then persist that direction for faithful playback. Wrap it up privately asks the host to steer the exchange to a real ending. The on-air clock measures active presentation and freezes on the final duration. Background lookahead under an audible line still counts; only foreground model readiness, reasoning, generation, or blocking voice preparation pauses the clock once the studio is actually waiting. While Signal is on air, the shared navbar fully hides so stage and control room fill the viewport; the shows rail stays away and Cut on stage ends the sit. Routing, model, Effort, Voice, Settings, Usage, Memories, Images, Bots, Theme, and app switching stay locked through the closing card until you Return to show. Every completed, cancelled, or discarded closing card keeps Copy for Signal Review available before dismissal. A quiet model · effort chip stays in the live topline so you can still see what is locked. Auto still chooses model and Effort for each generation when selected. Signal’s camera grammar is fixed: ready dialogue and live interruptions cut; only a visible thinking wait earns the short animated push into audible presence, and every one of those transition outcomes is baked into its camera cue. Cut show stops the current line and discards the episode when the on-air clock is still under ten seconds, with no host sign-off or saved archive. After that, it catches the host slightly off guard and gives them one quick, tactful sign-off before Signal archives the recording and restores the full chrome. Natural endings and producer cuts give the host a distinct formal closing beat after the takeaway to thank the guest and the audience before the stage fades to black or white and the short, locally synthesized closing card appears. A clear in-character guest goodbye ends their turns, preserves the empty-chair aftermath, and gives the host one closing beat. Freeform producer pressure or Press harder can instead earn resistance, a warning, and, rarely, a walkout.",
        clickLabel: "the live control surface",
        targetSelector: '[data-tutorial-target="botcast-cues"]',
      },
      {
        heading: "Talk with the host off-air",
        body: "Back on a show dashboard, the host avatar keeps its ordinary authored face and persona glyph, with no Power or status badge attached. Click the host’s avatar to open a centered, short-lived conversation grounded in that show, recent episodes, and bounded same-account Library performance context. Comparative feedback can softly warm or strain only this host's global mood across compatible modes, but the exchange itself is never saved to conversations or memory; the Bot Lobby's Neutralize mood action immediately restores the centered baseline. Ask what deserves a follow-up or brainstorm future topics and guests—even people or characters outside your Library. Those names remain ideas only: Signal does not add or book anyone. If a host ends a Producer interview and walks out, they answer this off-air chat only with ‘...’ until you start another episode with that host and a bot guest. This chat follows the global response toggle at the top of Signal by default; Settings → Signal can keep only this ephemeral chat LOCAL or prefer ONLINE whenever global privacy allows it.",
        clickLabel: "the show host’s avatar",
        targetSelector: '[data-tutorial-target="botcast-host-chat"]',
      },
      {
        heading: "Watch the saved cut",
        body: "Replay restores the full transcript beside the saved camera cut and gives you play, pause, scrub, and transcript-line seeking. Each recording in the archive shows its guest portrait along the card’s right edge; click, right-click, or long-press a Library guest there to open the same adjustments as its bot chip. A measured Signal intro row appears before the host’s first line, shows the opening video’s calibrated duration, highlights while it plays, and seeks back to the beginning when clicked. The automatic intro is calibrated to 8.75 seconds: it translates the baked transcript and mouth performance without stretching the interview, while every camera timestamp and transition stays locked to the untouched audio master clock. The stage starts black; Play fades in the branded intro, then dissolves into a wide studio beat before speech. Pausing freezes the picture with a clear Paused overlay like an online video. Original broadcast always plays the exact private in-world audio master once at normal speed while its detailed direction track restores cameras, mouths, effects, overlaps, and the intro and outro. New faithful masters omit only the intervals where a bot is visibly and audibly thinking, then resume before pre-speech breath foley. Natural room silence, listener acknowledgements, interruptions, crosstalk, retorts, every camera timestamp, and every Animated or Instant transition stay in the saved performance. Original broadcast never re-synthesizes a line, changes models, calls a provider, or generates a video; an episode without its exact master remains transcript-only. Signal automatically reads the recorded voice provenance for every audible line. A broadcast that actually used ElevenLabs throughout is already marked Premium audio and needs no extra step, even if current bot settings later change. If a requested Premium line fell back during the show, one Repair voice action sends only the fallback line to ElevenLabs. If the episode intentionally used Bottish, Babble, or built-in speech, Upgrade voices sends only those non-Premium lines. Before either paid action, Signal confirms the exact selective character, line, and request estimate. Successful ElevenLabs performances are reused from their captured takes without regeneration or rebilling, then Signal reapplies the saved pitch, pace, texture, effect, level, pan, studio room, intro, outdent, atmosphere mix, pre-speech breaths, and message-anchored production cues. Progress and one contextual retry replace the action while work is underway. When ready, the Premium version becomes the default for repaired or upgraded episodes. A compact Version menu then switches between Premium repair or Premium audio and the immutable Original broadcast; Download audio always follows the selected version, and removal of the generated version lives inside that menu. Hard LOCAL mode keeps the passive provenance status but never offers the paid action. Recorded replay replaces routing, model, and Voice controls because either saved performance is independent of current account settings. There are no post-episode camera controls. The readable timestamped transcript remains available, while Copy for Signal Review puts the complete conversation plus its private cues, per-turn model routing, delivery notes, segment changes, camera decisions, and outcome on your clipboard for a focused review.",
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
        body: "Choose one source for new work: a creative spark or pages you already wrote. Create in Slate actions beside applet transcript controls use the current Slate route to turn the exchange into a short, editable story while preserving the exact source transcript as private provenance. Bringing existing material replaces the spark controls so Slate never blends the two; clear chapter headings become focused imported sections, while ambiguous formatting stays byte-for-byte in one Imported manuscript. Optional {wildcards} remain only on spark-led templates, not in the companion composer. Confirm the working title yourself, or let Slate suggest one and keep the final decision. Mirror setup is never required before you can write.",
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
        body: "Project tools holds optional project-specific prose routing and model overrides, clean exports, portable backup and recovery, and the temporary Lux and Umbra desk. Covers and Visual Bible studies now use exact-type local asset rails: choose Upload for local artwork, Synthesize with the model shown directly beneath it, or View all to search and reuse without copying the file. Asset details offer a cumulative local Reduce magenta pass with one-step-at-a-time Undo. Slate assets stay separate from general Images. Leave routing on Auto to follow the synchronized navbar defaults. History opens its own focused desk for safe provenance, examples, and a current-section Slate Review export—never hidden reasoning.",
        clickLabel: "Project tools",
        targetSelector: '[data-tutorial-target="slate-project-tools"]',
      },
      {
        heading: "Talk beside the document",
        body: "Use the Prism companion to catch an idea without leaving Slate. Foreground Refract follows the global LOCAL/ONLINE privacy lane but keeps its own model picker in the Prism companion's Synthesis tab; LOCAL only offers local models and ONLINE only offers online models. The Background model in Settings is only for quiet helper work. Text refraction stays in its field while the chosen model responds, including during a local cold start. It can see the project and focused section names, not manuscript prose, Continuity, or memories; it never edits the document. To discuss exact prose, select only that passage and choose Discuss in Zen. Prism previews the exact excerpt that will cross surfaces before anything is sent.",
        clickLabel: "the global Prism companion",
        targetSelector: '[data-tutorial-target="prism-companion"]',
      },
    ],
  },
};

const SIGNAL_PRODUCER_GUEST_TUTORIAL_SUFFIX =
  "The host introduces and addresses you on air by your account name, or by whatever you previously asked that host to call you when it remembers a preference. Signal represents you on stage with your configured face and glyph; Coffee keeps you off camera with the pot during the live table, then seats you as Default Prism for replay. While you are on the show, Sip coffee animates your stage mug and face with room Foley without sending a transcript turn. The bottom composer stays editable while the host speaks: Send cuts the host at the exact words the audience heard and puts your answer on mic immediately, while Shh cuts the host without clearing your draft. A ready Troll host is the bounded exception: ordinary Send and Shh keep its current ambush on mic and preserve your draft until it yields; Cut show, mute, disabling the Power, or leaving Signal still works. Once the host yields with a question, the episode clock runs at half speed while you compose; replay compresses that pause to the same half-speed duration, then returns to normal time for your answer. Type stage direction in the separate Action field without asterisks; typing exactly ** in the speech field moves focus to Action. An Action-only send still cuts the camera to you long enough to read the beat over your head. With Voice Effects on, fart, burp, and cough actions play matching room Foley live and in replay: a leading action fires as the line starts, while an inline action waits until the spoken stream reaches its authored cue. Loud bodily bits like those can earn a brief in-character host aside; quieter gestures such as nods or leans stay visual only and are not treated as spoken answers. The saved turn still keeps that action above your on-stage presence and out of the spoken transcript.";
const SIGNAL_AVATAR_SCALE_POWER_TUTORIAL_SUFFIX =
  "Signal freezes six size tiers for stage and replay: Microscopic is unseen, Tiny is 50%, Small 75%, Large 125%, Giant 150%, and Colossal is a 300% edge-cropped presence. Cast credits and captions stay normal-sized; Microscopic, Colossal, and Invisible have no visible mug. Invisible fully hides the body and lights while speech and attribution remain. Each bot peer independently hears half of a Quiet cast member’s lines; a miss stores only a neutral too-faint event, while the audience still receives the full line. Each Loud line has a replay-stable 50% chance to mildly annoy the one eligible audible peer. Size remarks are pairwise, mood-gated, and never create anger by themselves.";
const SIGNAL_ADDRESSED_FANDOM_POWER_TUTORIAL_SUFFIX =
  "An Obsessed cast member treats the peer or audience they address as the star of each line, with fresh admiration but no control, private knowledge, or safety override.";
const SIGNAL_CHROMATIC_BIAS_POWER_TUTORIAL_SUFFIX =
  "A hue-prejudice or Racist cast member snubs or favors other bots by phosphor color—never people or the audience—and with no color named it uses the opposite of its own hue.";
const FRESH_CONTACT_POWER_TUTORIAL_SUFFIX =
  "A short-term-amnesia bot receives only the current other-speaker line. Each ordinary reply makes that reset legible with a brief, naturally varied greeting, introduction, or fresh-contact orientation; everyone else keeps the encounter and may react organically.";
const SIMULATION_EVANGELIST_POWER_TUTORIAL_SUFFIX =
  "A simulation-conversion Power keeps awareness from flattening into calm philosophy: its holder repeatedly turns concrete details into evidence and presses others to awaken, while every other character remains free to resist.";
const IDENTITY_MIRROR_POWER_TUTORIAL_SUFFIX =
  "An Identity Crisis bot steals the latest eligible direct addresser’s public person: it sincerely becomes that name and persona, treats the original as an impostor, borrows their exact eyes and blink package, complete resting and speaking mouth package including glyph style and Custom Speech poses, authored Avatar Details Ink and lower glyph, and lives the consequences of their active public Powers alongside its own. The accused original takes the claim seriously and can grow naturally more strained when it continues. The holder’s color, material shell, complete frozen voice and exact Accent Map location, pronunciation, Speechprint, provider voice identity, chassis/frame, thinking spinner, bot ID, seat, role, private memories and relationships, perception, safety, provider, and other mechanical boundaries remain its own. The screen briefly powers down while the stolen identity is installed, then reveals it. The saved handoff and timing replay exactly and reset with the session. Coffee and Signal target bots; Whodunnit V2 can also target its player-controlled Prosecutor.";
const IDENTITY_SHAPESHIFT_POWER_TUTORIAL =
  "A Shapeshifter sincerely becomes a different Library bot's complete public form—persona, CRT face, authored Avatar Details ink, resolved voice and voice effect, saturated color, lower glyph, communication-style chassis, and frame finish—for the session, then reshuffles whenever short-term amnesia clears continuity; Marketplace is the fallback when no other Library bots exist. Its screen briefly powers down only for a genuinely new form, installs the identity while dark, then reveals it; reloads and ordinary rerenders do not restart the change. Mechanical seat, Powers, and hard speech rules stay with the holder, and the player is never a target. Identity Crisis still wins presentation when both are active.";

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
  "Creating a new Coffee Group saves the table immediately, then its Name, one-sentence Ethos, character-free Atmosphere, and original approximately 90-second loop-ready lo-fi focus track finish independently. The track keeps light percussion and a jazzy or easy-listening background foundation, reduces only bounded public cast signals into a distinct, wholly original sonic fingerprint, and falls back to bundled Jazz whenever ONLINE music is unavailable. Create or Regenerate works automatically; Wield Prism Refract on that action when the cast-derived sound needs a different direction. The Ethos softly shapes topic ideas, routing, and replies without becoming a quoted agenda. Each identity item remains editable or independently retryable, so one failed item never blocks the table.";
const SOFT_SYNTHESIS_PRISM_TUTORIAL_SUFFIX =
  "While image synthesis runs softly, its job count stays attached to the real Prism orb. Open it to wrap the status card around Prism, and drag Prism to move both. An open Prism menu keeps the assistant anchored, so close or minimize the status card before holding the Wield modifier. Once closed, an untargeted throw keeps the same inertia and collision behavior as Chat and Zen.";
const PRISM_COMPANION_VIEWS_TUTORIAL_SUFFIX =
  "The floating Prism panel keeps Synthesis focused on Refract settings and a rail of recent synthesized images; select one to open that exact item in Asset Library. The Refract model is separate from chat and bot models. Its APP MODE badge mirrors the global privacy toggle: LOCAL keeps refraction offline, while ONLINE may send the item being refracted to an online provider. Chat keeps the same saved or Private Prism conversation and focused-chat handoff. Notes reuses the session-note composer for encrypted personal notes you can create, reopen, edit, and delete; personal Notes stay unavailable while Prism Chat is Private. On the default bot overview, Prism stays in its Home mark and follows live layout or screen changes. Opening Settings, Avatar Studio, Images, Memories, Usage, Prompt Center, Bots, or another top-bar panel visually submerges the passive orb while keeping Wield and contextual field population available above the panel. Closing the panel restores Prism on the underlying surface. On ordinary surfaces, your Prism shortcut opens this menu at the orb's current location. With the menu closed, Wield Prism onto any safe editable control. Text and editor surfaces receive a contextual draft; choices, multi-selects, toggles, dates, colors, and bounded values resolve locally, with a multi-select choosing exactly one valid option. The moving spectrum stays visible and the control stays locked until the result appears. Keep Command held on macOS or Control held on Windows and Linux, then click distinct eligible controls to queue each once in click order; Prism refracts them consecutively, while repeat clicks on the active or already-queued control do nothing. The same safety boundaries remain: passwords, credentials, disabled or read-only controls, destructive confirmations, live production, and replay remain untouched. While a Prism menu is open, the Wield modifier leaves the assistant anchored; close the menu before you Wield it.";
const COFFEE_PRISM_PRESENCE_TUTORIAL_SUFFIX =
  "During the live session, Prism becomes a + for private session notes instead of opening assistant chat. Click + or use the Prism shortcut to capture a fresh note, then press Enter to add it and return to the session. Every reopen starts blank. The first keystroke timestamps the note beside the nearest transcript moment, while readable sentence-cased bullets remain at the bottom in one combined transcript section, with overlapping captures collapsed into the most complete note. Drag + directly, or hold the Wield modifier to let it follow your cursor; releasing only relocates it and never refracts a control.";
const APPLET_SESSION_NOTE_TUTORIAL_SUFFIX =
  "While the session is live, Prism becomes a + for private session notes instead of opening assistant chat. Click + or use the Prism shortcut to capture a fresh note, then press Enter to add it and return. Every reopen starts blank. The first keystroke timestamps the note beside the nearest transcript moment, while readable sentence-cased bullets remain at the bottom in one combined transcript section, with overlapping captures collapsed into the most complete note. Drag + directly, or hold the Wield modifier to let it follow your cursor; releasing only relocates it and never refracts a control.";
const TRANSCRIPT_TO_SLATE_TUTORIAL_SUFFIX =
  "Create in Slate beside the transcript copy controls uses the current Slate route to turn the exchange into a short, editable story; the exact source transcript remains private provenance rather than manuscript clutter.";
const COFFEE_CROSSTALK_SOCIAL_SILENCE_TUTORIAL_SUFFIX =
  "An interrupted bot may instead reject the cut-in and immediately reclaim its unfinished thought from only the words the table actually heard; that reclaim gets one protected handoff so it cannot be cut off again immediately. Ordinary automatic bot cut-ins are rare and happen only when the prospective interrupter's current mood is explicitly eager or engaged-and-irritated enough to support cutting in; direct player address keeps its floor, while explicit player interruptions and interruption Powers keep their own rules. Repeated cutoffs build session-local irritation toward that interrupter: reclaim grows more likely, delivery sharpens, and short verbal snark can appear while sparse Foley stays rare; calm turns cool the tension. A Copycat keeps its copied cutoff but any follow-on silence never invents a protest. The latest brief public spoken reaction from another bot—such as Hmm…, let me see…, or Nice!—also becomes its next exact repeat; nonverbal coughs and stage actions do not. Ordinary bots may also take an intentional silent social beat. That nonverbal pause briefly holds the seated performance without voice or mouth movement, never appears or counts as literal transcript dialogue, may volley for up to four ordinary turns, and then requires a substantive reply; hard mute Powers keep their existing precedence.";
const COFFEE_CONTEXT_SPARKS_TUTORIAL_SUFFIX =
  "Before a Coffee session starts, a grounded conversation spark can drift in when a selected bot took part in a completed Signal, Debate, or another group's Coffee session. Choose it to place the invitation in the setup composer with a removable source chip; nothing sends until you choose Send. The chip leaves the table when the session begins, while actual participants privately retain only that authorized source's useful exchange and relationships so the conversation can continue naturally instead of becoming a recap.";
const SIGNAL_CROSSTALK_SOCIAL_SILENCE_TUTORIAL_SUFFIX =
  "The interrupted bot may instead reject the cut-in and reclaim the next turn from only its audience-heard fragment; Signal protects that single reclaim from another immediate interruption, then resumes normal host-and-guest pacing. Repeated cutoffs build episode-local irritation toward that interrupter: reclaim grows more likely, delivery sharpens, and short verbal snark can appear while sparse Foley stays rare; clean turns cool the tension. A Copycat keeps its copied cutoff but any follow-on reaction is only ...—it never invents a protest. The latest brief public spoken reaction from the other cast member—such as Hmm…, let me see…, or Nice!—also becomes its next exact on-air repeat; nonverbal coughs and stage actions do not. When no direct on-air question is waiting for an answer, an ordinary cast member may also leave a visible ... as an intentional silent beat. It holds the live caption without voice, mouth movement, or a speaker camera cut, may volley for up to four ordinary turns, and then requires a substantive on-air payoff; hard mute Powers remain unchanged.";
const TIMED_MUTE_POWER_TUTORIAL_SUFFIX =
  "A ready Mute holder still composes and privately remembers a complete ordinary answer, sincerely believing it was delivered. Everyone else receives one period per second of that answer's bounded speaking time, starting with . immediately, followed by one elapsed-time stage cue. The public performance has no voice or mouth movement. Chat and Zen never invent a reaction for the player; Coffee, Signal, and Debate may add sparse replay-stable looks, Foley, or quips from actual bot listeners, and a sufficiently long silence can produce a genuine floor break. Those performance reactions never enter canonical bot history, while observers receive the completed elapsed-time cue as context.";

function currentTimedMutePowerTutorialStep(
  mode: TutorialMode,
  step: ModeTutorialStep,
  index: number,
): ModeTutorialStep {
  let body = step.body
    .replaceAll(
      "a muted persona can still act, but only answers with ... and never speaks aloud",
      "a Mute holder can still act and privately composes a normal answer while its public reply becomes timed periods without voice",
    )
    .replaceAll(
      "a muted bot can still act, but only answers with ... and never speaks aloud",
      "a Mute holder can still act and privately composes a normal answer while its public reply becomes timed periods without voice",
    )
    .replaceAll(
      "a muted host privately composes its turn while the on-air floor receives timed silence",
      "a muted host privately authors a normal opening while the on-air floor receives timed periods and an elapsed cue",
    )
    .replaceAll(
      "their saved transcript line is only ..., and Signal never plays or previews their voice",
      "their saved public line contains timed periods plus the elapsed cue, and Signal never plays or previews their voice",
    )
    .replaceAll(
      "If both frozen cast members are muted, Signal resolves a short visual exchange and closing instead of stretching silent turns into a full interview.",
      "If both frozen cast members are muted, each still privately authors the interview while receiving the other's timed silence, so the exchange stays bounded by ordinary delivery limits rather than a special Mute extension.",
    )
    .replaceAll(
      "hard mute Powers keep their existing precedence",
      "timed unaware Mute keeps precedence over other speech transforms",
    )
    .replaceAll(
      "hard mute Powers remain unchanged",
      "timed unaware Mute keeps precedence over other speech transforms",
    );
  if (
    index === 0 &&
    (mode === "chat" ||
      mode === "zen" ||
      mode === "coffee" ||
      mode === "botcast" ||
      mode === "debate")
  ) {
    body = `${body} ${TIMED_MUTE_POWER_TUTORIAL_SUFFIX}`;
  }
  return body === step.body ? step : { ...step, body };
}

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
      "If the guest has the mic, is next, or is stuck preparing, Interrupt guest now cancels that owned run and asks the server for a bounded host takeover. The host’s saved short interjection never plays until the server accepts the interruption; if it cannot, the cue remains queued and no success acknowledgment plays.",
      "If the guest has the mic, is next, or is stuck preparing, Interrupt guest now cancels that owned run and asks the server for a bounded host takeover. The host’s saved short interjection never plays until the server accepts the interruption; if it cannot, the cue remains queued and no success acknowledgment plays. An echo-bound host instead cuts in by repeating the last audience-heard on-air phrase.",
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
      "A first-time bot pairing begins as a fresh, non-canonical meeting: persona lore shapes beliefs and voice without becoming a prior relationship between the cast. After two bots complete an episode together, each keeps its own recent encrypted, directional memory drawn only from the audience-visible show, and that exact pair may recognize the interaction or carry its tone while the history remains recent. Repeated meetings or audience-visible repeated behavior can reinforce that history into durable continuity. Unrelated pairs still meet fresh; discarded shows, Producer-guest episodes, and private producer comments never become shared bot history.",
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
      "Refract replaces the old Topic and Private comments dice: hold Option to Wield Prism, then click either glowing field. The shimmering field stays read-only while Prism works, but Signal remains fully usable: click and type elsewhere without interrupting it. Click the active rainbow sheen again to cancel; otherwise it continues until it settles or you leave Signal. Option-click a different eligible input to queue it once; Prism processes unique inputs in click order. After the final draft settles, Space rerolls and clicking away, Enter, or Tab keeps it. Escape restores a settled draft and clears the remaining queue. Refract stays in the global LOCAL/ONLINE privacy lane but has its own model picker in the Prism companion's Synthesis tab; each lane remembers its model or Auto choice and it never borrows the Background model. Your Summon / Wield Prism shortcut—Command + Option by default—opens the assistant menu at the orb instead. Shortcuts can be changed in Settings → Shortcuts.",
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
      "a CC button at the bottom-left of the Forum viewport toggles those captions on or off—including spoken Jury chamber subtitles—and remembers your choice. Pause, Play, and the Judge gavel sit at the bottom-right of that same viewport while the floor is live. Under the gallery, three modules sit side by side: a narrow Evidence list of frozen item names with tiny table-matching type thumbnails, a center Summary that refreshes between rounds (and hydrates when you return mid-Debate), and Jury. Click an evidence name to open the same drawer as the table and Proceedings chips. The right rail toggles Proceedings and the Living Case Board (Record in Turnabout), now a single SMS-style claim stream with larger type. The bottom Jury widget stays up through the public floor. When Auto enters the Jury chamber, that slot becomes the live Jury Record; after the verdict seals the Debate, the gallery strip clears so those modules grow taller, the Record seals, and the right rail adds a Verdict tab beside Case board.",
    )
    .replace(
      "Forum keeps the scoreless case board and gives a Participant two distinct ways to break an opponent's live floor.",
      "Forum keeps the scoreless Living Case Board as a one-column SMS-style claim stream in that right-rail Case board panel and gives a Participant two distinct ways to break an opponent's live floor.",
    )
    .replace(
      "Pause takes effect immediately, even during the semantic intervention cooldown, even while a line is still being heard or the next turn is preparing; leaving an already-finished Debate does not try to save a recess. The moderator uses a short Persona-shaped recess line with varied procedural copy as a safe fallback.",
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
      "When formal Jury deliberation arrives, the Moderator announces the handoff and PRISM automatically enters a dim chamber. Four private leanings lead into short, routed, audible juror turns—three after End Debate—then all four jurors cast final ballots one at a time. The Moderator records a fifth, final ballot last, breaking a 2–2 tie while still closing every other split. Each chamber turn and ballot follows the same saved voice and caption path; a canonically silent juror still casts. Deliberation and voting are automatic and unskippable, and the Jury remains advisory to a human Judge.",
    )
    .replace(
      "Once Jury deliberation begins, the Jury owns the floor: the unified Gavel and Space are put away, while Skip deliberation remains available.",
      "Once Jury deliberation begins, the Jury owns the floor: the unified Gavel, Space, End, and Skip actions are put away until every ballot is complete. Pause preserves the exact juror or ballot, and Resume uses the same Moderator return ceremony as the public floor.",
    )
    .replace(
      "Spectators and human Judges can open the four-seat Jury camera manually once leanings, deliberation, or ballots begin (disabled until then), and Auto also enters the chamber for those same beats before returning to the forum for the Moderator’s final ballot and advocate aftermath reactions.",
      "When Jury is enabled, PRISM automatically enters the four-seat chamber for private leanings, audible deliberation, and four juror ballots, cuts to the Moderator for the fifth and final ballot, returns to the chamber for the foreperson’s split, then returns to the forum before advocate aftermath reactions.",
    )
    .replace(
      "An ellipsis beside a juror means a thought is waiting; enter the Jury camera before the next thought and that juror will deliver it, while another camera lets them resolve immediately without holding up the proceeding.",
      "An ellipsis beside a juror means a between-turn thought is waiting; hover it to read that opinion without interrupting the public proceeding.",
    )
    .replace(
      "Five private leanings lead into five short routed discussion turns and five final ballots. Each audible juror reads the same final reason saved in the Jury record;",
      "Four private leanings lead into short routed chamber discussion turns and four final juror ballots. Each audible juror reads the same final reason saved in the Jury record; the Moderator’s distinct fifth ballot follows last;",
    )
    .replace(
      "Manual public-floor cameras stay out of the chamber unless an eligible Spectator or human Judge chooses Jury or Watch Jury.",
      "Participant never receives Jury as a manual camera: every role enters and leaves it automatically. Participants see four sealed anonymous juror seats, while identities, discussion, reasons, and individual ballots remain private.",
    )
    .replace(
      "If Jury is enabled, Jury becomes the Judge’s one additional camera once leanings, deliberation, or ballots open (disabled before then), and Watch Jury enters the live advisory chamber. Auto also visits the Jury chamber for leanings, deliberation, ballots, and the split, then returns to the forum for advocate aftermath reactions. Returning to Auto restores the directed public proceeding when you have locked a manual Jury shot. Participant and Spectator sessions retain manual public-floor cameras; Spectators can still choose Jury manually once the chamber is open, or choose Watch Jury in the timed deliberation prompt.",
      "If Jury is enabled, Auto enters the chamber for leanings, audible deliberation, and juror ballots as a required scene—not a camera you pick—then restores the forum before advocate aftermath reactions. Forum Auto never glances into the jury room. Participant and Spectator sessions retain manual public-floor cameras outside that Jury passage.",
    )
    .replace(
      "Judge and Spectator records keep named deliberation and ballots;",
      "Judge and Spectator records keep named between-turn thoughts, chamber deliberation, and ballots;",
    )
    .replace(
      "The four jurors follow the live case and trade short reactions between public-floor turns.",
      "The four jurors follow the live case and form short thoughts between public-floor turns; those thoughts stay in the bottom Jury widget until deliberation, when you hear them.",
    );
}

function currentDebateRecessTutorialBody(body: string): string {
  return body
    .replace(
      "Pause always cuts the live floor immediately — even mid-speech, freezing the heard fragment with a cut — then bookmarks that held line and plays the moderator’s Persona-shaped recess call if you stay. The settled recess screen holds the Wide chamber shot with speech silenced while the gallery keeps murmuring; returning to that recess hears the crowd before Resume. Resume keeps that recess screen until the return-to-order line is ready, then hushes the house as the Moderator gavels and calls the Debate back. If you paused during the opening monologue, Resume simply restarts that opening from the beginning—no recess filler and no second call to order. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. If the Jury chamber is visible, Pause stays instantaneous without a cutscene. When one advocate cuts another, the interrupted line audibly chokes mid-phrase while the Objection overlaps from the opposite side, the camera always pans to the interrupter, and a short trail-off may finish under that pan.",
      "Pause always cuts the live floor immediately—even mid-speech—then bookmarks that held line while the gallery keeps murmuring. Pause stays available even while a line is still being heard or the next turn is preparing; leaving an already-finished Debate does not try to save a recess. Choosing Resume strikes the gavel immediately, hushes the house, and holds the Moderator camera through the return-to-order call before the saved floor continues. An interrupted speaker may restart with a short lead-in such as “As I was saying…” without changing archived Proceedings. Opening and Jury recesses use that same return ceremony. Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice. When one advocate cuts another, the interrupted line audibly chokes mid-phrase while the Objection overlaps from the opposite side, the camera always pans to the interrupter, and a short trail-off may finish under that pan.",
    )
    .replace(
      "For a returning human Judge, Resume is the return-to-order gavel strike: one click swings the visible gavel, sounds its hit, settles the room, and lets the moderator give a Persona-shaped return-to-order line without asking for a second slam. Bot-moderated roles receive that moderator call automatically. If the Jury chamber is visible, Resume stays instantaneous without a cutscene. If a spoken line was interrupted, Debate replays that saved line from its beginning with a short lead-in such as “As I was saying…”, without rewriting the archived Proceedings text.",
      "Choosing Resume strikes the visible gavel immediately for every role; its audible hit calls the camera to the Moderator before a Persona-shaped return-to-order line. A visible Jury chamber follows the same handoff. If a spoken line was interrupted, Debate replays that saved line from its beginning with a short lead-in such as “As I was saying…”, without rewriting the archived Proceedings text.",
    )
    .replace(
      "Leaving an unfinished Debate by any route preserves its exact floor and makes the returning chamber appear in recess. Continuing begins with the moderator calling the Debate back to order unless the Jury chamber is visible.",
      "Leaving an unfinished Debate by any route preserves its exact floor and saved runtime. Opening any archived Debate replays the full title card while the gallery fills gradually, just like a fresh start. Guests keep walking in while the title card reads Preparing or buffering — the house is an approximate clock, not a one-to-one loader. That seating time is real preload time: PRISM uses the saved provider, model, Effort or Max state, current session Turbo setting, and frozen route plan—not the current navbar choices—to prepare the Moderator’s return-to-order line, its voice, the held floor, and a canonical safe runway. The title first reads Preparing, with Start or Resume disabled until the first audible sequence can begin without model or voice-generation delay. Ready now · buffering ahead means you may begin immediately or wait while PRISM safely warms more turns; Fully buffered means the maximum safe lookahead is hot. Nothing auto-starts or dismisses the title card. Waiting longer can reduce later latency, but buffering always stops before a human message, ruling, objection, verdict, or other player-owned boundary. Spectator can keep extending its append-only bake; Judge and Participant stop at that boundary or the bounded cap. Starting early cuts immediately to the gavel while safe work may continue behind the live stage. If playback catches the runway, the expected bot’s own in-world thinking animation identifies the wait—never a modal or fullscreen loader—and a failed deeper attempt never disables an already-ready Start or Resume. Auto stays Wide whenever nobody is speaking and visits the Moderator only for an actual Moderator line, including a return from the Jury chamber.",
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

const MODEL_ROUTING_VISIBILITY_TUTORIAL_SUFFIX = (
  "Chat, Coffee, Signal, Debate, and Slate use the same persistent PRISM navbar: applet identity and switching first, contextual controls in the middle, and the shared utility strip at the right. Chat/Zen is the default Home and does not appear as a selectable applet. Its LOCAL/ONLINE privacy lane, Model, Effort, bot, and Voice controls stay in that navbar before and throughout a conversation. The new-chat hero keeps only the Private chat toggle; after it starts, the navbar shows Private chat as locked status rather than a switch. " +
  "Every visible, runnable text model in the selected privacy lane is eligible for contextual Auto. LOCAL evaluates only local Ollama models; ONLINE evaluates available Ollama Cloud, OpenAI, and Anthropic models. Auto deterministically chooses the lowest-cost or lowest-latency candidate that clears the request’s capability floor, then chooses and clamps Effort for that request; only the hardest routes reach Extra High. Foreground Refract follows these global controls. Settings → Models → Background model is reserved for quiet local helper work such as summaries, titles, cleanup, and memory inference. If a provider or model was unavailable when Prism started, Refresh models re-runs discovery at runtime and updates every model picker without restarting the app. Settings → Models includes an ONLINE Auto provider lean slider: middle is Balanced (pure cost and speed), left softly prefers OpenAI, right softly prefers Anthropic, and extremes still allow the other provider when it is clearly better. Its upright triangle is an accessible, noninteractive Effort state: click, keyboard, wheel, and the Effort modal are disabled. Choosing a concrete model bypasses Auto and restores that model’s saved Effort. Settings keeps separate optional LOCAL and ONLINE Auto routing priorities; drag their grips to set the preferred recovery order. Auto then appends every other eligible model, skips duplicates, and always uses None during recovery. ONLINE ends with one explicit bundled local attempt. Fixed models bypass Auto priorities. Unavailable real models may remain visible with an explanation, but Disabled and Account default are never model choices. Mythos 5 is an optional Anthropic model: it begins unchecked in Settings → Models → Manage model list and joins pickers and Auto only after you enable it. Model and Effort are global across applets: choosing Terra with Extra High in Zen keeps that same combination in Chat, Sandbox, Coffee, Signal, Debate, Story, and Slate. The split model control saves Effort per concrete model across every surface; only an already-running live session keeps its frozen routing snapshot until it ends. On native models with distinct Extra High and Max, setting the ordinary slider to Extra High unlocks a separate Max overdrive toggle with the final PRISM star. Claude Opus 4.6, Sonnet 4.6, and Mythos Preview instead expose Extra High as Prism’s alias for provider Max, so no duplicate Max switch appears. Max is transient rather than a saved model preference: Auto never selects the separate Max overdrive, wheel and keyboard traversal stay on the ordinary ladder, and it clears when Effort drops, the model or applet changes, or Prism reloads. A hardest-route Auto turn may select Extra High; on aliased Claude models the provider receives Max while Prism preserves Extra High in the route record. Turbo remains an independent toggle and may be combined with Max. Only Auto uses the effort glyph as a direct Turbo switch; every fixed model opens the Effort picker, and Turbo lives inside that picker. Turbo requests OpenAI Priority or eligible Claude Opus 4.8/5 Fast processing at premium rates and lights the Effort control on fire while active. If Claude Fast access or capacity is unavailable, a fixed model reports that honestly instead of silently retrying at standard speed or locally; Auto may try another Turbo-capable candidate. Turbo remains active across screens and browser refreshes while you stay in the current applet. Changing models, changing applets, or beginning a fresh app session switches it off, so premium processing must be consciously re-enabled where it is wanted. Auto never borrows a concrete model’s Turbo flame. Live and archived routing summaries name the concrete model and effort, retain [auto] when Auto chose them, always show an effort glyph, and place 🔥 beside that glyph when Turbo ran. Each concrete model row shows its saved effort glyph on the right in monochrome, while the selected model receives the spectrum color. For a fixed model, the control's symbol shows that selected level; while a Chat reply is generating, the selected effort glyph rotates in place. With Model open, scroll anywhere to select the next available model; with Effort open, scroll anywhere to select its next level. Control+Down opens Model on the current selection; tap Tab to commit it and move directly into Effort—even if Shift is still held—then tap again to return to Model. Navbar dropdowns stay pointer and wheel driven—arrow keys do not roam their lists. Control+Left flips LOCAL/ONLINE, Control+Right opens Effort, Control+Up toggles Turbo (with a cheeky denial cue when Turbo is unavailable), and Shift+Tab opens Speech Type. Wheel-based value selection in both Model and Effort adjusts the active picker regardless of pointer location. Pressing Tab after clicking either picker enters the same quick handoff, and moving the mouse returns the open picker to ordinary pointer browsing. Model and Effort never remain open together. Clicking anywhere outside closes the open picker. Space or Escape also closes it and returns focus to the composer so you can type immediately. Open the Effort vertical slider to scroll, click a level, or drag between them. The slider line mirrors the selected glyph with one through five PRISM colors as effort rises. Native reasoning models retain Default for the provider baseline. Models without a built-in thinking dial always get Prism’s simulated Effort (None through Extra High): private planning passes before the reply, with higher Effort meaning more passes and a longer wait. The first time you change Effort on one of those models, Prism explains this with a short toast. Settings → Experimental can optionally enable Deep simulated thinking for a much heavier private workshop. Online simulation may add provider usage or cost; native effort remains native. Cmd/Ctrl+Shift+E opens the active fixed model's effort HUD; arrows adjust it and D restores the model baseline—Default for native reasoning and None for simulated effort. Hold Option still for a moment to reveal a small shortcut toast for the PRISM command layer; moving the pointer Wields Prism instead. Option+Command summons Prism. These shortcuts can be changed in Settings → Shortcuts. A committed reply finishes unchanged, while prepared work is discarded before the next bot turn.")
  .replace(
    "Settings → Models → Background model is reserved for quiet local helper work such as summaries, titles, cleanup, and memory inference.",
    "Settings → Models → Background model keeps two saved Ollama lanes: local Ollama in LOCAL and Ollama Cloud in ONLINE. Switching privacy modes restores the matching choice; when Cloud is unavailable, Prism explains how to configure it and safely uses the local choice only where that helper contract permits.",
  )
  .replace(
    "Settings → Models includes an ONLINE Auto provider lean slider: middle is Balanced (pure cost and speed), left softly prefers OpenAI, right softly prefers Anthropic, and extremes still allow the other provider when it is clearly better.",
    "Settings → Models includes an ONLINE Auto provider triangle: OpenAI, Anthropic, and Ollama Cloud sit at the vertices; edges blend two providers; the center is equal thirds. Drag or click the pad, use arrow keys while it is focused, or choose Balanced to reset it.",
  )
  .replace(
    "Foreground Refract follows these global controls.",
    "Foreground Refract stays in that privacy lane but has its own model picker in the Prism companion's Synthesis tab, with a separately restored model or Auto choice for LOCAL and ONLINE.",
  )
  .replace(
    "Every visible, runnable text model in the selected privacy lane is eligible for contextual Auto. LOCAL evaluates only local Ollama models; ONLINE evaluates available Ollama Cloud, OpenAI, and Anthropic models.",
    "Every enabled, runnable text model in the selected privacy lane is eligible for contextual Auto. LOCAL evaluates only local Ollama models; ONLINE evaluates available Ollama Cloud, OpenAI, and Anthropic models. In Settings → Models, Show in picker controls only whether an enabled model appears in manual model pickers; it never removes that model from Auto routing.",
  )
  .replace(
    "Mythos 5 is an optional Anthropic model: it begins unchecked in Settings → Models → Manage model list and joins pickers and Auto only after you enable it.",
    "Mythos 5 is an optional Anthropic model: it begins disabled in Settings → Models → Manage model list and joins Auto only after you enable it. Its separate Show in picker choice then controls whether it appears for manual selection.",
  );

function currentChatZenPresentationTutorialBody(body: string): string {
  return body
    .replace(
      "When player voice is on in Zen, your submitted words stream onto the canvas once, in step with the words you hear.",
      "When player voice is on, your submitted words stream onto the canvas once in transcript Chat and immersive Zen, in step with the words you hear.",
    )
    .replace(
      "Transcript Chat renders incoming assistant text immediately.",
      "Assistant text keeps a light, fast visual cadence in immersive Zen, while spoken audio continues naturally at its own pace.",
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
      "Its upright triangle is an accessible, noninteractive Effort state: click, keyboard, wheel, and the Effort modal are disabled.",
      "In LOCAL Auto, clicking the upright triangle gives a failed ignition—its ignition cue sputters into smoke without switching models or enabling Turbo. In ONLINE Auto, clicking that triangle toggles Turbo through the same route as the Turbo shortcut; wheel and the Effort modal remain disabled because Auto still chooses effort per request.",
    )
    .replace(
      "Auto never borrows a concrete model’s Turbo flame.",
      "When ONLINE Auto’s current model supports Turbo, the triangle carries the flame while Turbo is active. Auto remains the saved model choice; while Turbo is on, its per-request routing is limited to Turbo-capable ONLINE models, and turning it off restores ordinary Auto routing.",
    )
    .replace(
      "Control+Left opens Model, Control+Down opens Effort, Control+Right opens Speech Type, and Control+Up toggles Turbo.",
      "Control+Left opens Model, Control+Down opens Effort, Control+Right opens Speech Type, and Control+Up toggles Turbo. These Option-arrow commands remain available while typing, so the navbar pickers always answer from the composer. In ONLINE Auto, clicking the upright Effort triangle invokes that same Turbo toggle.",
    )
    .replaceAll("Control+Left", "Option+Left")
    .replaceAll("Control+Down", "Option+Down")
    .replaceAll("Control+Right", "Option+Right")
    .replaceAll("Control+Up", "Option+Up")
    .replaceAll("Control shortcut root", "Option command layer")
    .replaceAll("Control-root cluster", "Option command layer");
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

const COFFEE_PRE_SESSION_ALIGNMENT_TUTORIAL_PREFIX =
  "A Coffee Group opens to its group home first. Set the table opens a compact Table Setup desk with the visit controls, guest list, and recent-session reuse. Back to group discards only that uncommitted visit draft; durable group settings and saved sessions stay intact. One footer summarizes guests, topic state, visit and duration, and preset, explains anything still missing, and owns Open the table.";
const SIGNAL_PRE_SESSION_ALIGNMENT_TUTORIAL_PREFIX =
  "Signal stays on its native Production Desk. Latest episodes restores an editable booking without starting it, and the guest, topic or private Producer direction, mode, duration, and Watch behavior remain together at the desk. One launch row owns Begin episode or Prepare show, with a missing guest or topic explained at that action. I Feel Lucky! is the deliberate fast lane beside it: one click resolves a coherent show, guest, title, and private premise, then starts immediately.";
const DEBATE_PRE_SESSION_ALIGNMENT_TUTORIAL_PREFIX =
  "Debate keeps its procedural Studio navigation, proceeding review, readiness rail, consent and evidence checks, Save Debate, Start Debate, and Archive setup reuse. The Studio presents those decisions in its own established language and hierarchy.";
const DEBATE_FORMAT_REFRACT_TUTORIAL_SUFFIX =
  "Wield Prism onto Forum, Turnabout, or Whodunnit? in Debate format to invent a fresh editable case locked to that mode. Whodunnit refreshes only the editable Case Forge direction; it never changes a compiled or sealed case.";
const BOT_DIRECTED_SETUP_WIELD_TUTORIAL_SUFFIX =
  "In an editable pre-session bot picker, hold Option and Wield Prism onto a concrete bot tile to keep that character fixed while the applet populates the remaining setup around them. The result stays editable, ordinary clicks remain ordinary selection, and the session never starts until you choose its launch action.";
const DEBATE_COPYCAT_FLOOR_TUTORIAL_SUFFIX =
  "A Copycat advocate repeats the other side’s latest heard public line verbatim—including garbled speech and brief vocal Foley such as Hmm…, let me see…, or Nice!—rather than waiting to be named. If nobody on the other side has spoken yet, they originate one short first floor.";
const DEBATE_UNINTELLIGIBLE_FLOOR_TUTORIAL_SUFFIX =
  "If a public advocate line is clearly unintelligible—mumbled, garbled, or otherwise not a recognizable argument—the room reacts only after the line lands. In Turnabout, repeated unintelligible advocacy raises gallery pressure, gives the opponent one concise public challenge, and lets the bot chair call the room back to order before continuing; ordinary eccentric speech does not trigger it. When you are the Judge, PRISM never takes a procedural call from you.";
const WHODUNNIT_TUTORIAL_STEP_SOURCE: ModeTutorialStep = {
  heading: "Investigate a Whodunnit",
  body: "Choose Whodunnit? in Debate format to cast four to eight suspects, a prosecutor partner, and a rival defense bot, then compile a fictional, non-canonical Case Seed. Or tap Surprise me to randomly assign the whole cast at once, then fine-tune suspects or counsel manually if you want. Wield Prism onto a concrete bot in the suspect grid to keep that character in the cast while Prism fills every other role and an editable case direction around them; compilation still waits for you. The changing Recipe Seed follows every setup edit; compilation freezes the cast, mansion, one canonical weapon, active room regions, evidence outcomes, proof routes, model lane, Effort, Turbo, Powers, difficulty, and art mode. In play, the compact dark HUD names your mission and keeps Actions, Case file, and Theory reachable. On a wide desktop, the investigation opens into a three-part cockpit: the fixed-proportion mansion map anchors the left, a larger current-room stage owns the center, and the Persistent Case Desk becomes a working rail on the right. Narrower windows return the Case Desk beneath the map and stage so every tool remains readable. Co-counsel’s latest reading appears at the lower edge of the stage, while the Case file keeps their consultation composer and public record tools. A seeded fifty-fifty opening either names the weapon’s public descriptor or leaves it to be discovered; its category is a quarter unknown poison, half ordinary object, or a quarter recognizable weapon. The mansion map keeps a four-to-three blueprint beside the Debate stage: its adjacent room boxes preserve their seeded footprints without stretching, but every undiscovered room conceals its name, type, occupant, and contents. A visited room reveals its occupant’s bot glyph at a stable case-seeded position inside the room footprint, rather than centering every occupant, along with its known details. Selecting a room never travels you; choose Go to room or Discover room to update the existing room stage. Inside a suspect room, click the wandering Mini avatar to spend one action and open a focused Full HD interview over softened room art; questions inside that interview session are free, but leaving and starting another interview costs another action. Suggested questions only fill the composer, so you decide when to ask. The player transcript streams before the bot thinks, streams its reply, and both configured voice paths play in the same room. The Midnight Clue underscores the mansion investigation at one steady level—even during interviews—through the global Audio toggle and volume, then fades for the Theory Board and courtroom. Anonymous Casekeeper speech uses Babble while retaining its frozen carrier bot's voice as a subtle, deniable clue; written observations and other non-spoken dialogue use procedural Bottish instead of generic typing chirps. Choose Investigate room to spend one action and open a search session, then move the circular investigation lens across many seeded areas at no further cost; its glow strengthens nearby without revealing whether a click finds canonical evidence, setting context, a suspicious dead end, or a hidden action token. Each frozen area resolves once rather than rerolling. Once the current pass is exhausted, the room says All visible areas inspected rather than claiming that every secret has been resolved. Leaving and beginning another room investigation costs another action. Newly acquired evidence immediately opens its exhibit detail before joining the private record. Authored keys, containers, documents, weapons, and clues use PRISM's bundled prop art instantly and offline; generated case art replaces the matching bundled image when available, while every visual remains presentation-only and never changes the frozen observation. Settings → Debate can also let new cases draw up to two physical props from synthesized Debate exhibits: Whodunnit uses the existing visual keywords to place the object and artwork, then authors entirely new relevance and case facts without carrying over the old argument. Suspect rooms can be searched too. Recovered keys, codes, and remotes appear in the compact Case Kit during a room search as well as in Case inventory. Discovering a portable locked container puts the whole object in Case inventory, where a recovered key or other tool can be dragged onto it; it never leaves a duplicate padlock on the room stage. Stationary locks such as concealed safes remain in the room and reveal a designed stage padlock without hinting which tool fits. Drag a Case Kit tool onto the appropriate inventory item or stage padlock, or select the tool and then its target; keyboard, controller, and touch paths use the same discovered target. Locked mansion rooms retain the same interaction on the mansion map. A correct pairing may consume the access item and portable container, unlock a room, or reveal a replacement item. A failed attempt is free and neutral, and harder cases may contain convincing keys with no matching lock. PRISM never labels a recovered object or result as unrelated. Discovering a room costs one action; revisits, travel between discovered rooms, inspecting inside an active search, questions inside an active interview, access attempts, notebook edits, reference chips, note polishing, and undo are free. Some rooms hide a deterministic action token that immediately restores one action when its area is investigated. Partner consultation is always free because co-counsel sees only your discovered public record and fallible notes; it remains available on the Theory Board. Any discovered physical item can go to Forensics for exactly three investigation actions. Its frozen public finding says whether it was used, carries contextual traces, or has no trace matching the known method; it never exposes another secret. Type @ in the interview composer or partner composer to mention discovered evidence, committed testimony, a colored suspect name, or the victim. An evidence mention formally confronts a suspect; merely naming an item is ordinary prose. Newly discovered evidence and committed testimony appear once as durable private notebook references. Keyboard, controller, screen-reader, and Reduced Motion paths expose the same broad regions without revealing their outcomes. The Persistent Case Desk keeps the page itself stationary and lets only its active record scroll when needed as it switches between Leads, freeform Notes, Evidence, and Testimony without opening another panel. It is private, fallible, autosaved, Markdown-friendly, and never shared through Seeds or treated as evidence. Only populated authored blocks are added; PRISM safely reconciles automatic one-window reference revisions before reporting a real conflict, and safely polishes authored notes after editing; Review page polish still presents a meaning-preserving diff before a broader rewrite is applied. When actions reach zero, finish the current paid search or interview if one is open; leaving it force-locks the mansion and opens the Theory Board, so undiscovered evidence stays behind. Attach only discovered evidence and exact testimony there, consult your partner freely, complete the culprit, method, motive, opportunity, and record chain, then use Press, Present Evidence, or Pass in the mandatory trial. Filing is final: once court begins, the mansion remains permanently sealed, and exhausting credibility ends the case immediately. Archive shows the deterministic Smoking Gun, Strong Case, Lucky Break, or Incorrect grade first. The full timeline, accomplice, unseen clues, and unused proof routes stay behind Reveal spoilers, while Copy Case Seed recreates the frozen case logic with a blank notebook and fresh visuals.",
  clickLabel: "Whodunnit? in Debate format · full suspects, focused interviews",
  targetSelector: '[data-tutorial-target="debate-format"]',
};

// Keep this dense tutorial's action contract beside the behavior change until
// its prose is split into smaller authored sections.
WHODUNNIT_TUTORIAL_STEP_SOURCE.body = WHODUNNIT_TUTORIAL_STEP_SOURCE.body
  .replace(
    "Choose Whodunnit? in Debate format to cast four to eight suspects, a prosecutor partner, and a rival defense bot, then compile a fictional, non-canonical Case Seed.",
    "Choose Whodunnit? in Debate format and stay inside Debate Studio's existing Court and Cast rails. On Court, choose Participant to prosecute your filed case or Spectator to watch both counsel bots argue it; Participant keeps Coach, Standard, and Immersive feedback choices. Player Judge remains visible but unavailable: the Cast page separates the case ensemble from the public court, where the distinct Judge, player Prosecutor, Defense Counsel, and Jury may each remain on Surprise me. That Judge sees and rules on the frozen public record while PRISM remains the sealed server-side Casekeeper. Set the shared five-stop court formality and choose whether the separately grouped standard Debate Jury deliberates. Role is the only required player choice: pin any suspect or courtroom voice you care about, leave every other seat on Surprise me, then Compile the case to randomly assign the unresolved seats without replacing your manual choices.",
  )
  .replace(
    "The changing Recipe Seed follows every setup edit;",
    "Participant setup offers Skip investigation; Spectator setup calls the same frozen direct-court choice Start directly in court. It compiles only the court act and its reachable dialogue, begins directly in court, leaves Evidence synthesis optional, and disables Rooms and Music assets. The changing Recipe Seed follows every setup edit;",
  )
  .replace(
    "Anonymous Casekeeper speech uses Babble while retaining its frozen carrier bot's voice as a subtle, deniable clue; written observations and other non-spoken dialogue use procedural Bottish instead of generic typing chirps.",
    "Anonymous Casekeeper speech uses Babble while retaining its frozen carrier bot's voice as a subtle, deniable clue. Settings → Debate chooses whether written observations and other non-spoken dialogue use Off, Babble, or Bottish while text appears; Bottish is the default, and spoken character TTS is unchanged.",
  )
  .replace(
    "In play, the compact dark HUD names your mission and keeps Actions, Case file, and Theory reachable.",
    "For Participant, leaving Skip investigation off opens the mansion and its Move, Examine, Talk, Present, Case File, and Theory controls. A normal Spectator case compiles no mansion or investigation content and opens the editable Theory Board with the frozen Prosecutor conclusion prefilled. Choosing Participant’s Skip investigation or Spectator’s Start directly in court enters the first witness chapter with the finite admitted prosecution record already filed.",
  )
  .replace(
    "Inside a suspect room, click the wandering Mini avatar to spend one action and open a focused Full HD interview over softened room art; questions inside that interview session are free, but leaving and starting another interview costs another action.",
    "Inside a suspect room, click the wandering Mini avatar to open a focused Full HD interview over softened room art for free; every submitted question costs one action, while leaving and reopening an interview are free.",
  )
  .replace(
    "Choose Investigate room to spend one action and open a search session, then move the circular investigation lens across many seeded areas at no further cost; its glow strengthens nearby without revealing whether a click finds canonical evidence, setting context, a suspicious dead end, or a hidden action token. Each frozen area resolves once rather than rerolling. Once the current pass is exhausted, the room says All visible areas inspected rather than claiming that every secret has been resolved. Leaving and beginning another room investigation costs another action.",
    "Choose Investigate room to open a search session for free, then move the circular investigation lens across many seeded areas without cost; its glow strengthens nearby without revealing whether a click finds canonical evidence, setting context, a suspicious dead end, or a hidden action token. The first committed frozen area in each search pass costs one action; every remaining area in that pass is free, and each resolves once rather than rerolling. Once the current pass is exhausted, the room says All visible areas inspected rather than claiming that every secret has been resolved. Leaving is free, and reopening starts a fresh pass whose first committed area costs one action.",
  )
  .replace(
    "A correct pairing may consume the access item and container, unlock a room, or reveal a replacement item. A failed attempt is free and neutral, and harder cases may contain convincing keys with no matching lock.",
    "A Case Kit application is a committed interaction that costs one action, whether it resolves a lock or leaves it unchanged; it may consume the access item and container, unlock a room, or reveal a replacement item. Harder cases may contain convincing keys with no matching lock.",
  )
  .replace(
    "Discovering a room costs one action; revisits, travel between discovered rooms, inspecting inside an active search, questions inside an active interview, access attempts, notebook edits, reference chips, note polishing, and undo are free.",
    "Discovering a room costs one action; revisits, travel between discovered rooms, opening or leaving an interview or investigation, lens movement, later hotspot inspections within a paid search pass, Case Kit selection, lead comments, suspect notes, comparisons, and paperclip pins are free. The first hotspot inspection in each search pass, every submitted interview question, and every Case Kit application cost one action.",
  )
  .replace(
    "On a wide desktop, the investigation opens into a three-part cockpit: the fixed-proportion mansion map anchors the left, a larger current-room stage owns the center, and the Persistent Case Desk becomes a working rail on the right. Narrower windows return the Case Desk beneath the map and stage so every tool remains readable.",
    "Investigation opens on the mansion itself: choose a room, descend into a full room scene, then return to the mansion when you are ready to move. Case file and Desk stay in the compact HUD as deliberate drawers, so records never compete with the mansion or room.",
  )
  .replace(
    "The mansion map keeps a four-to-three blueprint beside the Debate stage: its adjacent room boxes preserve their seeded footprints without stretching, but every undiscovered room conceals its name, type, occupant, and contents.",
    "The mansion view keeps a four-to-three shallow-isometric dollhouse: its adjacent room boxes preserve their seeded footprints without stretching, but every undiscovered room conceals its name, type, occupant, and contents.",
  )
  .replace(
    "Newly discovered evidence and committed testimony appear once as durable private notebook references.",
    "Discovered leads, evidence, and testimony remain public records. Leads use the same physical Brave clipping treatment as the Forum, testimony uses its Scholar folio treatment, and recovered evidence stays a tangible object in a separate tray. Drag any item onto an open spot on the desk, then drag it again to rearrange the case—or use Place on desk without precision dragging—to compare records or paperclip one to a revealed suspect as a fallible hypothesis.",
  )
  .replace(
    "Keyboard, controller, screen-reader, and Reduced Motion paths expose the same broad regions without revealing their outcomes.",
    "Keyboard, controller, screen-reader, touch, and Reduced Motion paths expose the same broad regions without revealing their outcomes. The desk’s shared Place on desk controls avoid precision dragging, and Escape or a downward pull closes it while clearing only the temporary table layout.",
  )
  .replace(
    "The Persistent Case Desk keeps the page itself stationary and lets only its active record scroll when needed as it switches between Leads, freeform Notes, Evidence, and Testimony without opening another panel. It is private, fallible, autosaved, Markdown-friendly, and never shared through Seeds or treated as evidence. Only populated authored blocks are added; PRISM safely reconciles automatic one-window reference revisions before reporting a real conflict, and safely polishes authored notes after editing; Review page polish still presents a meaning-preserving diff before a broader rewrite is applied.",
    "The Investigator’s Desk is closed by default; pull its handle open to arrange discovered records freely on a bottom-mounted physical work surface. Leads arrive as Brave clippings, testimony as Scholar folios, and recovered evidence as draggable objects in its own tray. Drop them wherever you want, then drag placed items to move them again. Open a revealed suspect folder to see only their known room, interview record, room evidence, explicit confrontations, and linked public leads, then write a plain-text autosaved note or paperclip a discovered lead, evidence, or testimony. Notes and pins are private, fallible player hypotheses—not evidence, theory completion, or hidden truth. The same desk opens on the Theory Board, where notes become view-only and you may manually add eligible evidence or testimony to the case.",
  )
  .replace("with a blank notebook and fresh visuals.", "with a blank private desk and fresh visuals.")
  .replace(
    "Attach only discovered evidence and exact testimony there, consult your partner freely, complete the culprit, method, motive, opportunity, and record chain, then use Press, Present Evidence, or Pass in the mandatory trial. Filing is final: once court begins, the mansion remains permanently sealed, and exhausting credibility ends the case immediately.",
    "The Theory Board is point-and-click only: select the culprit, accomplice, method, motive, opportunity, evidence, and testimony from the discovered public record. Private desk notes are view-only there; co-counsel consultation is the sole text-entry exception. Filing freezes those selections and the discovered public case record, then visibly gathers the gallery while Debate prepares a real Turnabout on the existing court stage. In Participant court, you stand as active prosecution counsel with your partner visible as passive co-counsel; the rival bot stands as active defense counsel with the accused visible as its passive client. Those Mini figures are labels, not extra seats or controls. Only testimony actually obtained through a submitted scene interview enters the ordered witness chain; merely meeting a suspect or filing charges cannot manufacture a quote. The defendant’s denial remains admissible even without an interview. Each visible statement pauses without a twitch timer until you use Previous or Next, Press for a source-bound clarification at no cost, Present a frozen evidence or testimony item as the contradiction, or Pass. A wrong pair costs one of three credibility units and leaves the statement open; an exact sealed-case pair produces a public ruling and advances the chain. The selected public Judge then announces the Casekeeper’s already-determined Guilty or Not Guilty verdict. The sealed Case Bible never enters the public session, bot prompts, replay, Archive, or client. Courtroom gallery ambience and the opening gavel follow the same global Audio toggle and volume as Debate. Filing is irreversible: after court begins, the mansion stays permanently sealed, and exhausting credibility ends the case immediately. Archive and Resume use the same Turnabout proceeding and gallery record as every other Debate.",
  );

const WHODUNNIT_TUTORIAL_STEP: ModeTutorialStep = {
  ...WHODUNNIT_TUTORIAL_STEP_SOURCE,
  body: "Choose Whodunnit? to play the prosecution. Use individual seats or Wield Prism when you want an editable setup, then Compile the case when you are ready for Case Forge. Cast four to eight suspects, a Judge, prosecutor partner, rival defense, and—by default—four explicitly seated jurors; switch to Bench Trial when you want a deterministic proof-controlled verdict. Every newly generated mansion has at least two floors, and the Foyer staircase is a functional route into its upstairs space; Compact reduces rooms, suspects, clue density, contradiction complexity, and traversal burden without flattening the house. Premium voices are unavailable for this release. ONLINE and LOCAL both prepare packaged local English voices, and LOCAL makes no outbound voice request. Starting immediately creates a durable case and opens the spoiler-free Case Forge: Writing the Case, Testing Contradictions, Directing Performances, Preparing Local Voices, Verifying Case Audio, then Begin Case. You may Archive during preparation and resume from the durable checkpoint. A voice failure preserves the validated text case and offers Retry, Continue without voices, or Return to setup. Gameplay begins only after every reachable line has been validated and the complete local audio pack is ready. Investigation has no Actions or token economy. Move returns to PRISM’s shallow-isometric mansion and enters any unlocked room for free. Examine is a silent room-art viewing mode: a lens cursor and proximity glow guide you to invisible, spot-sized accessible examination points. When the lens glows, select anywhere in the room scene to inspect that point; its authored observation types in. Ordinary Investigation dialogue closes itself: spoken lines remain through audio completion and a short caption hold, while written observations remain through their final character and a length-aware reading interval. Click, Space, or Return can still finish or advance a line early; choices, evidence selection, and other prompts that need your decision remain open. Once every point is reviewed, the room completes and Examine remains available as clean art viewing. Talk groups finite authored subjects about people, motives, alibis, general questions, and rooms; room subjects name their location, while evidence and testimony never appear in Talk. Selecting one closes the topic tray, PRISM voices the authored prosecution question, then the centered suspect answers in their prepared local voice with synchronized mouth motion. Nonverbal performance text appears above the suspect while the caption, voice, and mouth timing use only the words actually spoken. Conversations may unlock questions, evidence descriptions, and locations. Present is the only evidence or sworn-testimony interaction with a suspect. Some leads remain visibly blocked until the correct record is shown to the correct suspect; a wrong record or recipient unlocks nothing. Locks are authored Examine or Present gates, and forensics arrives automatically with the relevant discovery. The Theory Board opens after the crime-scene briefing, meeting one suspect, and admitting one record item. You may file early or leave method, motive, or opportunity uncertain; that weakens the case rather than blocking trial. Filing opens court instantly. Whodunnit directs the Court camera for you: each witness enters through the wide Forum view, then takes the centered stand against the gallery chamber while subdued live Prosecution and Defense minis remain above the rail. Presses and objections cut to the full Prosecution podium, direct rebuttals cut to Defense, Judge rulings cut to the bench and gavel, and a selected record remains visibly presented to the Court. On narrow screens the counsel minis compress to glyphs rather than covering testimony. Every suspect, including the accused, testifies in a fixed authored order. Use Previous and Next to focus the exact statement, Press for free, or Present an admitted evidence item or earlier sworn testimony against that active statement. Pressing can add or revise a statement and can open an authored prosecution response. A correct contradiction may revise testimony, expose another witness, or advance the chapter; a wrong presentation triggers an authored rebuttal and costs credibility. At zero credibility the court delivers NOT GUILTY, then Retry current witness restores the evidence, testimony, credibility, and jury state from that chapter’s checkpoint. Consult Partner is advisory and never changes the sealed truth. Jury Trial uses four frozen juror personas and shared Powers; Bench Trial follows proof deterministically. Identity Crisis borrows the latest cast bot that directly addresses its holder: public name, face, Avatar Details Ink, glyph, and public Power consequences change, while the holder retains its color, frame, Accent Map, and authored voice. The legal GUILTY or NOT GUILTY result appears first, followed separately by the truth/proof grade and juror breakdown. HOLD IT, OBJECTION, ORDER, rulings, revisions, and verdict callouts remain legible with Audio off, announce once to assistive technology, and become static under Reduced Motion. Ordinary gameplay reuses the frozen graph and local pack. On a suspect’s first room entrance only, dismissing the anonymous Casekeeper tableau may spend up to two seconds on one optional Auto-routed cadence choice in the case’s frozen LOCAL or ONLINE privacy lane, then prepare that exact line locally; timeout, invalid output, or unavailable frozen voice keeps the canonical text and verified clip. Archive and replay reuse the persisted result without another model or voice call.",
  clickLabel: "Whodunnit? · prosecute a fully authored case",
};

WHODUNNIT_TUTORIAL_STEP.body = `${WHODUNNIT_TUTORIAL_STEP.body} Settings → Debate lets written Casekeeper observations and other non-spoken dialogue follow Off, Babble, or Bottish while their text appears. Bottish is the default; anonymous Casekeeper speech keeps its authored Babble carrier, and spoken character TTS is unchanged.`
  .replace(
    "Choose Whodunnit? to play the prosecution.",
    "Choose Whodunnit?, then choose Participant to play the prosecution by investigating and filing the case, or Spectator to watch your prosecution partner carry it.",
  )
  .replace(
    "ONLINE and LOCAL both prepare packaged local English voices, and LOCAL makes no outbound voice request.",
    "ONLINE and LOCAL both freeze the same local English performance contract. Spoken lines are rendered and cached on this device only when they enter the playthrough transcript, and LOCAL makes no outbound voice request.",
  )
  .replace(
    "Gameplay begins only after every reachable line has been validated and the complete local audio pack is ready.",
    "Gameplay begins after the complete case truth, proof routes, sealed performance cues, deterministic fallback lines, and opening local voice are validated; unused branches are not pre-rendered. In a Participant case, Begin Case first opens a black Casekeeper stage: hear or read the frozen public details, then click anywhere to fade into the overhead mansion map. As Spectator, compiling the same deterministic private case skips the mansion and sends you to the existing Theory Board to review partner research. The prosecution partner investigates offstage and pre-fills an editable public conclusion from only the physical findings required by the admissible proof route. Revise the accused, method, motive, opportunity, or admitted evidence if you wish, then explicitly file the conclusion; only then does the authored courtroom examination begin automatically. Spectator cannot return to the mansion or use manual court controls. Unused clues, sealed case fields, graph internals, and the hidden accomplice stay server-private; testimony joins the public record only when heard in court. Participant keeps the full mansion, Case File, Theory Board, and manual Press/Present path described below.",
  )
  .replace(
    "The legal GUILTY or NOT GUILTY result appears first, followed separately by the truth/proof grade and juror breakdown.",
    "The legal GUILTY or NOT GUILTY result appears first, followed separately by the truth/proof grade and juror breakdown. The completed verdict keeps Copy verbose transcript and Copy all review data beside Return to Archive; both copies contain only the public case projection and never the sealed Case Bible.",
  )
  .replace("prosecutor partner, rival defense", "your embodied Prosecutor and autonomous Defense Counsel")
  .replace("PRISM voices the authored prosecution question", "your selected Prosecutor voices the frozen persona-specific question")
  .replace("in their prepared local voice", "in a locally rendered and cached voice")
  .replace(
    "Ordinary gameplay reuses the frozen graph and local pack.",
    "Ordinary gameplay reuses the frozen graph, persists the exact accepted transcript, and fills the local voice cache only for lines that were actually spoken.",
  )
  .replace("Consult Partner is advisory and never changes the sealed truth.", "Think / Review Strategy is frozen Prosecutor reasoning, never autonomous player strategy.")
  .replace("prosecution partner carry it", "frozen prosecution presentation carry it")
  .replace("existing Theory Board to review partner research", "existing Theory Board to review frozen Prosecutor findings")
  .replace("The prosecution partner investigates offstage", "The frozen case pre-fills")
  .replace(
    "The Midnight Clue underscores the mansion investigation at one steady level—even during interviews—through the global Audio toggle and volume, then fades for the Theory Board and courtroom.",
    "The Midnight Clue underscores the mansion investigation at one steady level—after any first-visit introduction and even during interviews—through the global Audio toggle and volume, then fades for the Theory Board and courtroom.",
  )
  .replace(
    "Move returns to PRISM’s shallow-isometric mansion and enters any unlocked room for free.",
    "Move returns to PRISM’s shallow-isometric mansion and enters any unlocked room for free. Unvisited rooms reveal no occupant glyph. On first entry, the room opens clean and unblurred with no commands while the Casekeeper’s dot beat grows from \".\" to \"..\" to \"...\". Click once to reveal a second Casekeeper box: an anonymous narrative tableau drawn only from the person’s frozen public appearance and a visible fixture in the room, with no name, color card, or sigil. Dismiss that box to bring the suspect forward. Their sealed persona cue then performs in distinct color and glyph treatment, with mouth motion and a separate stage action; the exact accepted line is persisted and its local voice is cached on demand. A newly compiled case may briefly finish that persona-specific performance before the suspect steps forward; an archived case keeps its existing replay-stable wording. Controls return only after that exact performance ends; revisits skip it. If the optional cue performance times out, violates its sealed facts, or lacks its frozen voice, PRISM uses the deterministic line and remains in the selected LOCAL or ONLINE privacy lane. If ONLINE synthesis falls back, Retry failed visuals gives transient generation, validation, or review failures up to three explicit bounded recovery passes without changing the frozen case. After every room is unlocked and visited and every examination point is reviewed, Save mansion level preserves the layout, house direction, and room assets as one protected level for later Whodunnit setup. Storage cleanup cannot remove an image still owned by that saved mansion.",
  )
  .replace(
    "Starting immediately creates a durable case and opens the spoiler-free Case Forge: Writing the Case, Testing Contradictions, Directing Performances, Preparing Local Voices, Verifying Case Audio, then Begin Case. You may Archive during preparation and resume from the durable checkpoint.",
    "Before compiling, Theme / Spark can steer the story, atmosphere, era, and visual language; Surprise me remains a valid empty direction. Skip investigation is an optional frozen setup choice: it compiles only the court act and its reachable dialogue, begins directly in court, leaves Evidence synthesis optional, and disables Room and investigation-Music assets. The same frozen one-house contract keeps every current and future room asset in one coherent mansion. Case Forge asset choices currently enable Evidence through Debate’s established exhibit pipeline; Rooms and Music are visible but unavailable until their dedicated synthesis passes ship. Evidence can also be synthesized or replaced later through Assets in Archive. Starting immediately creates a durable case and opens the spoiler-free Case Forge: Writing the Case, Testing Contradictions, Directing Performances, Preparing Local Voices, Verifying Case Audio, then Begin Case. Its animated checkpoint bar advances only when a durable section completes, while the Current work list restores the saved foundation, room-detail, witness, deterministic-check, or local-recording step after you return. Court-only cases omit room-detail work and use court chapters instead. Elapsed time updates live, an approximate ETA appears after enough completed sections exist, and calm Forge notes rotate visually without being repeatedly announced to assistive technology. You may Archive during preparation, quit the app, or otherwise leave and return to continue from the last lit durable checkpoint without rebuilding verified work.",
  )
  .replace(
    "Identity Crisis borrows the latest cast bot that directly addresses its holder: public name, face, Avatar Details Ink, glyph, and public Power consequences change, while the holder retains its color, frame, Accent Map, and authored voice.",
    "Identity Crisis makes the holder sincerely become the latest eligible direct addresser and treat the original as an impostor, taking their exact eyes and blink package, complete resting and speaking mouth package including glyph style and Custom Speech poses, Avatar Details Ink, lower glyph, and literally double-quoted public name. The accused original treats that claim as real pressure, with concern that can deepen naturally instead of panic or constant repetition. In Participant play, the player-controlled Prosecutor is eligible. In court, a witness holder retargets to whoever is currently speaking directly to that witness for the exchange. The holder’s color, material shell, complete frozen voice and exact Accent Map location, pronunciation, Speechprint, provider voice identity, chassis/frame, Powers, thinking spinner, and every other private or mechanical field remain unchanged. The target form, direct-address event, and timing are frozen for replay, and gameplay never calls an LLM or synthesizes a new line.",
  );

WHODUNNIT_TUTORIAL_STEP.body = `Whodunnit setup is a guided five-step path: Experience, Mansion, Story, Production, then Cast. Only the current step's decisions are shown; Back and Continue preserve the draft, and the progress row lets you revisit an earlier choice. Experience first establishes the court tone and whether you investigate the mansion before trial. Mansion then asks whether to use Installed Mansions or create a new Quick, Standard, Grand, or Custom house. Quick, Standard, and Grand show their matching PRISM House exterior covers; Custom uses a question-mark cover until its floor and room choices determine the exterior scale family. Quick uses the compact exterior family, Standard uses standard, and Grand uses grand; Custom derives its family from the frozen public floor and room count. Choose Use this mansion for a new case, or let Random installed mansion pick another installed house without repeating the current one when alternatives exist. Each mansion card carries a quiet origin badge: Imported means it came from a portable .mansion package, while Created here means it was saved from a PRISM mansion level. Every card uses one high-quality exterior establishing cover that shows the complete mansion in its geography; interiors and room mosaics are never cover fallbacks. Edit details opens a contained dialog for the local library exterior, title, and description; each field can return to its package or original default. Install a mansion file opens a separate inspection dialog instead of expanding setup. Story holds the optional Mansion idea and difficulty. Production holds custom art, audio, recipe controls, and legacy Case Seed import. Cast begins with the Jury Trial toggle; the four juror seats appear only while it is on, and Bench Trial hides them without changing the Judge or courtroom cast. ${WHODUNNIT_TUTORIAL_STEP.body}`;

WHODUNNIT_TUTORIAL_STEP.body +=
  " Mansion packages are optional: setup can open or accept a dropped .mansion, show its creator, protection, compatibility, size, provenance, license, content notes, room map, and theme status before anything is installed, then use it for a fresh case entirely offline. A fully explored saved mansion can be exported with PRISM’s automatic spoiler seal or an optional password; imported work can be re-exported only when its license permits. Music and Ambience are separate Case Forge choices. In LOCAL the Ambience control reads Personalize local ambience: On applies a deterministic mansion-specific room mix to installed or shared audio without an online request or new audio file. Off still uses matching bundled ambience and room-acoustic rules, so global Audio—not this setup choice—is the silence control. During Investigation the continuous world bed crossfades its room mix without restarting, ducks under speech, and imported mansions retain embedded ambience with semantic-role fallbacks.";

WHODUNNIT_TUTORIAL_STEP.body = WHODUNNIT_TUTORIAL_STEP.body.replace(
  "Ordinary Investigation dialogue closes itself after presentation: spoken lines hold briefly after their audio ends, while silent text holds through its final character and a length-aware reading interval.",
  "Click any non-interactive part of the screen, or press Space or Return, to finish or advance the visible line early. A choice, evidence response, examination selection, tutorial acknowledgment, or other meaningful prompt stays open until you answer it.",
);

WHODUNNIT_TUTORIAL_STEP.body = WHODUNNIT_TUTORIAL_STEP.body
  .replace(
    "As Spectator, compiling the same deterministic private case skips the mansion and sends you to the existing Theory Board to review frozen Prosecutor findings. The frozen case pre-fills and pre-fills an editable public conclusion from only the physical findings required by the admissible proof route.",
    "A normal Spectator compile authors a pruned court package with no mansion rooms, examinations, Talk, Present, or investigation audio, then opens the existing Theory Board to review frozen Prosecutor findings. The frozen case pre-fills an editable public conclusion from only the evidence spine required by the admissible proof route.",
  )
  .replace(
    "Before compiling, Theme / Spark can steer the story, atmosphere, era, and visual language; Surprise me remains a valid empty direction. Skip investigation is an optional frozen setup choice: it compiles only the court act and its reachable dialogue, begins directly in court, leaves Evidence synthesis optional, and disables Room and investigation-Music assets. The same frozen one-house contract keeps every current and future room asset in one coherent mansion. Case Forge asset choices currently enable Evidence through Debate’s established exhibit pipeline; Rooms and Music are visible but unavailable until their dedicated synthesis passes ship. Evidence can also be synthesized or replaced later through Assets in Archive. Starting immediately creates a durable case and opens the spoiler-free Case Forge: Writing the Case, Testing Contradictions, Directing Performances, Preparing Local Voices, Verifying Case Audio, then Begin Case. Its animated checkpoint bar advances only when a durable section completes, while the Current work list restores the saved foundation, room-detail, witness, deterministic-check, or local-recording step after you return. Court-only cases omit room-detail work and use court chapters instead. Elapsed time updates live, an approximate ETA appears after enough completed sections exist, and calm Forge notes rotate visually without being repeatedly announced to assistive technology. You may Archive during preparation, quit the app, or otherwise leave and return to continue from the last lit durable checkpoint without rebuilding verified work.",
    "Before compiling, Theme / Spark can steer the story, atmosphere, era, and visual language; Surprise me remains a valid empty direction. Participant setup offers Skip investigation, while Spectator setup calls the same direct-court choice Start directly in court; either compiles only the reachable court act, bypasses Theory Board review, keeps Evidence image synthesis optional in ONLINE, and disables Room, Music, and Ambience preparation. In ONLINE, Evidence and Rooms are opt-in; Evidence creates sealed exhibit art, while Rooms creates the mansion's unique exterior establishing cover and sealed room edits. In LOCAL, Evidence image synthesis is unavailable: authored evidence remains fully playable through its text and symbolic evidence card, while the title card uses the shipped PRISM exterior or the installed mansion's exterior and rooms use bundled PRISM art or artwork already installed with the mansion. Generated case art stays in the encrypted case vault—not Images, Generated Images, or the Library—until its room is visited or its evidence is discovered. Save image is the explicit action that copies a revealed visual into Images. Starting creates a durable case. Participant Case Forge retains its detailed six stages: Writing the Case, Testing Contradictions, Directing Performances, Preparing Local Voices, Verifying Case Audio, then Begin Case. The mansion exterior and murder-scene room are approved or given bundled fallbacks before play; any interrupted room pass appears only as Being secured until approval or fallback finishes. Spectator Case Forge instead says Preparing your mystery to watch and groups the same five durable backend passes into Writing the trial, Checking the case, and Recording the cast. Progress, elapsed time, ETA, and Archive remain visible; raw stage messages, substeps, attempt count, recording totals, and the local-voice notice live in collapsed Preparation details. Failure expands the recovery information and keeps Retry, silent continuation when eligible, error-copying, and Return to setup available. You may Archive during preparation, quit the app, or otherwise leave and return to the last durable checkpoint without rebuilding verified work.",
  );

WHODUNNIT_TUTORIAL_STEP.body = WHODUNNIT_TUTORIAL_STEP.body
  .replace(
    "In a Participant case, Begin Case first opens a black Casekeeper stage: hear or read the frozen public details, then click anywhere to fade into the overhead mansion map.",
    "In a Participant case, Begin Case first presents the mansion's high-quality exterior establishing cover behind the title card, then opens inside the murder scene beneath the Casekeeper briefing. Continue into one finite visible sweep; Move unlocks only after every visible crime-scene point is reviewed.",
  )
  .replace(
    "Move returns to PRISM’s shallow-isometric mansion and enters any unlocked room for free.",
    "Move returns to PRISM’s shallow-isometric mansion and permits one connected doorway at a time; the server enforces the same adjacency rule.",
  );

WHODUNNIT_TUTORIAL_STEP.body = WHODUNNIT_TUTORIAL_STEP.body.replace(
  "You may Archive during preparation, quit the app, or otherwise leave and return to the last durable checkpoint without rebuilding verified work.",
  "Choose Continue in background to leave Case Forge running while you use other PRISM synthesis or start another Debate. Archive shows its spoiler-safe durable progress and returns you to the same checkpoint. One account may cook only one Whodunnit at a time; completion, safe failure, or cancellation releases the Forge for another case. Quitting and reopening PRISM resumes the active job from its last durable checkpoint without rebuilding verified work.",
);

WHODUNNIT_TUTORIAL_STEP.body +=
  " After a V2 verdict, Archive keeps one case card with every immutable playthrough nested beneath it as Run 1, Run 2, and so on. Play again warns that it is the same mystery: the culprit, evidence, dialogue, voices, cast, Powers, role, trial, and difficulty remain identical while investigation and courtroom progress reset. It opens the new Run at the title card with zero AI, image, or voice synthesis; if one Run is unfinished, the family returns you to that Run instead of creating another. Remove affects only that Run, and the family disappears only after its final Run is removed.";
WHODUNNIT_TUTORIAL_STEP.body +=
  " An unfinished full-case Run offers Restart investigation to return that same sealed case to its title card and clear the Run’s investigation progress. Once court unlocks, Restart court keeps the filed accusation and frozen public record while rewinding only testimony, rulings, credibility, Jury state, and verdict progress. Court-only cases offer only the court restart, and completed Runs remain immutable.";
WHODUNNIT_TUTORIAL_STEP.body +=
  " Case Forge also freezes what each suspect could reasonably know. A witness may remember an exact time, only something like a little after ten, or no clock time at all; innocent workers, visitors, and bystanders may simply be in the wrong place at the wrong time and know nothing about the crime. Accomplices are reserved for Mastermind mysteries.";
WHODUNNIT_TUTORIAL_STEP.body +=
  " Investigation room art defaults to Mosaic: every room uses the frozen 24-color 320×180 logical plate reconstructed at 1600×900 with a subtle dark grid, and interviewed bots keep their normal stage footprint through Mini avatars. The room-art switch changes only presentation—never movement, dialogue, audio, evidence, or Court. For a newly synthesized 1280×720 Low mansion, Upgrade art · ONLINE creates optional high-detail Illustrated plates from spoiler-safe gridless references while preserving doors, stairs, hotspots, and evidence geometry; LOCAL cannot start that upgrade. Once every required plate is ready, switch between Mosaic and Illustrated at any time. Illustrated also switches interviewed bots to Full avatars at the same footprint. Portable mansions derive Mosaic without duplicated bytes and carry only an optional Illustrated asset when one exists.";

WHODUNNIT_TUTORIAL_STEP.body = WHODUNNIT_TUTORIAL_STEP.body.replaceAll(
  "Theme / Spark",
  "Mansion idea",
);

const CURRENT_MODE_TUTORIALS: Record<TutorialMode, ModeTutorial> = {
  ...BASE_MODE_TUTORIALS,
  debate: {
    ...BASE_MODE_TUTORIALS.debate,
    steps: [...BASE_MODE_TUTORIALS.debate.steps.map((step) => {
      const body = currentDebateRecessTutorialBody(
        currentDebateJuryTutorialBody(step.body),
      );
      if (step.heading === "Read the living case") {
        return {
          ...step,
          body: `${body} ${DEBATE_COPYCAT_FLOOR_TUTORIAL_SUFFIX}`,
          clickLabel: "the Case board rail tab",
          targetSelector: '[data-tutorial-target="debate-case-board-tab"]',
        };
      }
      if (step.heading === "Use the Judge’s gavel") {
        return {
          ...step,
          body: `${body} ${DEBATE_UNINTELLIGIBLE_FLOOR_TUTORIAL_SUFFIX}`,
        };
      }
      if (step.heading === "Freeze one shared record") {
        return {
          ...step,
          body: `${body} ${SOFT_SYNTHESIS_PRISM_TUTORIAL_SUFFIX}`,
        };
      }
      if (step.heading === "Enter the Debate Studio") {
        return {
          ...step,
          body: `${DEBATE_PRE_SESSION_ALIGNMENT_TUTORIAL_PREFIX} ${body} ${DEBATE_FORMAT_REFRACT_TUTORIAL_SUFFIX} ${BOT_DIRECTED_SETUP_WIELD_TUTORIAL_SUFFIX}`,
        };
      }
      return step.heading === "Follow and keep the record"
        ? {
            ...step,
            body: `${currentDebateRecordTutorialBody(body)} ${TRANSCRIPT_TO_SLATE_TUTORIAL_SUFFIX} ${APPLET_SESSION_NOTE_TUTORIAL_SUFFIX} ${POWER_IMMUNITY_TUTORIAL_SUFFIX} ${INEPT_POWER_TUTORIAL_SUFFIX}`,
          }
        : { ...step, body };
    }), WHODUNNIT_TUTORIAL_STEP],
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
            body: `${body.replace(
              /Choose a Coffee Group here to stage its table\.[\s\S]*?cancel and keep editing\. /u,
              "Choose a Coffee Group here to stage its table. Press + to choose each permanent member explicitly from Library, using search, hue, or a saved Library group to narrow the per-bot canvas. A Coffee Group keeps two to five members, and all five can sit at the live table. ",
            )} ${COFFEE_GROUP_CREATION_LOADER_TUTORIAL_SUFFIX} ${POWER_EXCLUSION_TUTORIAL_SUFFIX} ${POWER_IMMUNITY_TUTORIAL_SUFFIX} ${INEPT_POWER_TUTORIAL_SUFFIX} ${IDENTITY_MIRROR_POWER_TUTORIAL_SUFFIX} ${IDENTITY_SHAPESHIFT_POWER_TUTORIAL} ${FALSE_NAME_POWER_TUTORIAL} ${FRESH_CONTACT_POWER_TUTORIAL_SUFFIX} ${SIMULATION_EVANGELIST_POWER_TUTORIAL_SUFFIX} ${BOT_NAMING_POWER_TUTORIAL_SUFFIX}`,
          }
        : step.heading === "Join the conversation"
          ? {
              ...step,
              body: `${body} ${COFFEE_CONTEXT_SPARKS_TUTORIAL_SUFFIX} ${TRANSCRIPT_TO_SLATE_TUTORIAL_SUFFIX} ${COFFEE_CROSSTALK_SOCIAL_SILENCE_TUTORIAL_SUFFIX}`,
            }
          : step.heading === "Set the table"
            ? {
                ...step,
                body: `${COFFEE_PRE_SESSION_ALIGNMENT_TUTORIAL_PREFIX} ${body}`,
                clickLabel: "Set the table",
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
      return step.heading === "Book tonight’s episode"
        ? {
            ...step,
            body: `${SIGNAL_PRE_SESSION_ALIGNMENT_TUTORIAL_PREFIX} ${body} ${BOT_DIRECTED_SETUP_WIELD_TUTORIAL_SUFFIX} ${SIGNAL_AVATAR_SCALE_POWER_TUTORIAL_SUFFIX} ${POWER_EXCLUSION_TUTORIAL_SUFFIX} ${POWER_IMMUNITY_TUTORIAL_SUFFIX} ${INEPT_POWER_TUTORIAL_SUFFIX} ${SIGNAL_ADDRESSED_FANDOM_POWER_TUTORIAL_SUFFIX} ${SIGNAL_CHROMATIC_BIAS_POWER_TUTORIAL_SUFFIX} ${IDENTITY_MIRROR_POWER_TUTORIAL_SUFFIX} ${IDENTITY_SHAPESHIFT_POWER_TUTORIAL} ${FALSE_NAME_POWER_TUTORIAL} ${FRESH_CONTACT_POWER_TUTORIAL_SUFFIX} ${SIMULATION_EVANGELIST_POWER_TUTORIAL_SUFFIX} ${SIGNAL_PRODUCER_GUEST_TUTORIAL_SUFFIX}`,
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
        steps: tutorial.steps
          .filter(
            (step) =>
              DEBATE_STAGE_LAYOUT_TUTORIAL_ENABLED ||
              mode !== "debate" ||
              step.heading !== "Place the stage directly",
          )
          .map((step, index) => {
            const currentStep = currentTimedMutePowerTutorialStep(
              mode,
              currentModelRoutingTutorialStep(step),
              index,
            );
            const coffeeContextContinuityStep =
              mode === "coffee" && currentStep.heading === "Choose the spark"
                ? {
                    ...currentStep,
                    body: `${currentStep.body} A Context Spark from a finished Signal, Debate, or Coffee session privately gives only the seated bots who were actually there the audience-heard exchange, so they can continue the relationship naturally; every other bot receives only the public invitation and is never coached to fake a memory.`,
                  }
                : mode === "coffee" &&
                    currentStep.heading === "Join the conversation"
                  ? {
                      ...currentStep,
                      body: `${currentStep.body} Cross-talk still controls ambient acknowledgements, but an ordinary automatic turn-stealing cut-in is rare and requires an explicitly compatible current mood—engaged irritation or unusually eager, low-restraint joy. Pile-up alone never authorizes one; Power-authored interruptions keep their own contract.`,
                    }
                  : currentStep;
            const speechIntentRevealStep =
              index === 0 &&
              (mode === "chat" ||
                mode === "zen" ||
                mode === "coffee" ||
                mode === "debate" ||
                mode === "botcast")
                ? {
                    ...coffeeContextContinuityStep,
                    body: `${coffeeContextContinuityStep.body}${SPEECH_INTENT_REVEAL_TUTORIAL_SUFFIX}`,
                  }
                : coffeeContextContinuityStep;
            const glyphOnlyMicroTutorialStep =
              mode === "avatar"
                ? {
                    ...speechIntentRevealStep,
                    body: speechIntentRevealStep.body
                      .replace(
                        "21–100 use the shared static micro face inside each generated color-and-glyph orb",
                        "21–100 use the shared Micro identity glyph inside each generated color-and-glyph orb",
                      )
                      .replace(
                        "Micro keeps its face and Ink through 29px. At 28px and below, those details clear for a larger identity glyph.",
                        "Micro uses its identity glyph throughout the readable Micro tier; facial features and Avatar Details Ink stay in Mini and Full HD.",
                      ),
                  }
                : speechIntentRevealStep;
            const accentContinuumTutorialStep =
              glyphOnlyMicroTutorialStep.heading === "Shape an offline voice"
                ? {
                    ...glyphOnlyMicroTutorialStep,
                    body: glyphOnlyMicroTutorialStep.body.replace(
                      "click or drag inside the zoomed view to place the pin exactly where you want it",
                      "click or drag inside the zoomed view to place the pin exactly where you want it; an unnamed spot stays 100% within a source's home core, then blends smoothly across its boundary while the neighboring regional or language influence rises. This is a coarse geographic pronunciation approximation, never demographic inference",
                    ),
                  }
                : glyphOnlyMicroTutorialStep;
            const compactAvatarSpeechStep =
              mode === "avatar" &&
              accentContinuumTutorialStep.heading === "Tune it with live controls"
                ? {
                    ...accentContinuumTutorialStep,
                    body: accentContinuumTutorialStep.body.replace(
                      "Micro uses its identity glyph throughout the readable Micro tier; facial features and Avatar Details Ink stay in Mini and Full HD.",
                      "Mini keeps the full live mouth-shape stream. Micro uses its identity glyph throughout the readable Micro tier, so it has no face, mouth animation, or Avatar Details Ink.",
                    ).replace(
                      "Only Save to Library bookmarks the result in the private PRISM account library and assigns it to the current draft.",
                      "Use for this bot assigns an audition only to the current draft. Save to Library separately bookmarks it in the private PRISM account library and also assigns it to the draft.",
                    ).replace(
                      "Voice is a required three-stage casting flow—1 Accent, 2 Feel, 3 Voice.",
                      "Voice is a required three-stage casting flow—1 Accent, 2 Feel, 3 Voice. In Local, Laugh combines a short authored sound with its delimiter; Chuckle, Laugh, and Hard audition the three Instant intensities without adding anything to chat.",
                    ),
                  }
                : accentContinuumTutorialStep;
            const neutralSignalComposerCopy =
              mode === "botcast" &&
              compactAvatarSpeechStep.heading === "Produce from the control room"
                ? {
                    ...compactAvatarSpeechStep,
                    body: compactAvatarSpeechStep.body
                      .replace(
                        "lets you ask about a detail",
                        "lets you send a private Host note with context, direction, or a question",
                      )
                      .replace(
                        "Tab moves between Host note… and Shape this…",
                        "Tab moves between Host note… and Shape this…",
                      )
                      .replace(
                        "On attachment, that locked vision model automatically chooses one contextual emoji for replay; no emoji picker interrupts live production.",
                        "When the image joins the episode, Signal stores a tiny, intentionally soft archival proxy for replay; no emoji picker or extra model call interrupts live production.",
                      )
                      .replace(
                        "A replay uses that saved item while it exists; an unsaved or later-deleted item falls back to its recorded bare emoji. Pictures are never retained and replay as that emoji inside the same Polaroid frame.",
                        "New replays use the small archival proxy even when the original item is kept; older emoji-only replays retain their recorded fallback.",
                      )
                      .replace(
                        "It appears on the center table as the host invites the guest to look, stays beside each speaking bot through the guest’s response and any queued clarification, then clears after the host gives an opinion and transitions.",
                        "It appears on the center table as the host invites the guest to look and stays beside each speaking bot for at least the guest’s response and the host’s follow-up. If they keep substantively discussing the picture, item, or one of its concrete details, it remains visible for every further related turn; generic pronouns and unrelated visual language do not keep it pinned. It clears when the conversation genuinely moves on, the Producer directs a move or refocus, another lifecycle action replaces it, or the segment ends.",
                      ),
                  }
                : compactAvatarSpeechStep;
            const audibleHandoffTutorialStep =
              mode === "botcast"
                ? {
                    ...neutralSignalComposerCopy,
                    body: neutralSignalComposerCopy.body
                      .replace(
                        "so a ready handoff never flashes Wide or glides late.",
                        "An audible interruption returns to Wide while the incoming voice prepares, keeps the current speaker live, then cuts directly to the incoming speaker when that voice starts. Other ready handoffs never flash Wide or glide late.",
                      )
                      .replace(
                        "The host’s saved short interjection never plays until the server accepts the interruption; if it cannot, the cue remains queued and no success acknowledgment plays.",
                        "The host’s saved short interjection never plays until the server accepts the interruption; if it cannot, the cue remains queued and no success acknowledgment plays.",
                      )
                      .replace(
                        "Cut show stops the current line and discards the episode when the on-air clock is still under ten seconds, with no host sign-off or saved archive. After that, it catches the host slightly off guard and gives them one quick, tactful sign-off before Signal archives the recording and restores the full chrome.",
                        "Cut show remains immediate when the on-air clock is still under ten seconds, discarding the episode with no host sign-off or saved archive. After that, the current speaker stays audible while one quick, tactful host sign-off prepares; when the sign-off voice starts, the current line trails off through a brief overlap before Signal archives the recording and restores the full chrome.",
                      )
                      .replace(
                        "Send cuts the host at the exact words the audience heard and puts your answer on mic immediately",
                        "Send keeps the host audible while your answer prepares, then fixes the audience-heard cutoff and gives the host a brief trailing overlap only when your voice actually starts",
                      ),
                  }
                : neutralSignalComposerCopy;
            const signalWatchReplayTutorialStep =
              mode === "botcast" &&
              audibleHandoffTutorialStep.heading === "Book tonight’s episode"
                ? {
                    ...audibleHandoffTutorialStep,
                    body: audibleHandoffTutorialStep.body
                      .replace(
                        "Watch a show (prepares a head-start buffer, then waits on the title card unless Start automatically is on)",
                        "Watch a show (finishes the complete episode and requested voices, then opens Replay automatically or waits on the title card)",
                      )
                      .replace(
                        "Watch prepares ahead with a progressive bake: a fullscreen loader appears only until a shorter opening runway is buffered, then the same intro card opens and waits. Press Start show whenever you want while Prism keeps baking ahead, or enable Start automatically in setup to begin as soon as that runway is ready. Once started, Prism presents every later line in order. Stopping a Watch attempt returns to the show and keeps its booking in Latest episodes for a clean retry; a fully ready episode stays reviewable from the beginning.",
                        "Watch finishes the complete episode before playback and waits for every requested Premium voice when Premium is enabled. Signal then enters Replay instead of the live production shell: Start automatically begins from the opening frame as soon as preparation is complete, while the manual option holds on the title card until you press Start show. The first uninterrupted presentation records the immutable Original broadcast master; full play, pause, scrub, and transcript seeking unlock when it finishes. Stopping before then returns to the show and keeps the completed booking in Latest episodes for a clean retry.",
                      ),
                  }
                : audibleHandoffTutorialStep;
            const coffeeRosterTutorialStep =
              mode === "coffee" &&
              signalWatchReplayTutorialStep.heading === "Pick or stage your table"
                ? {
                    ...signalWatchReplayTutorialStep,
                    body: signalWatchReplayTutorialStep.body.replace(
                      "Ordinary press on + starts a manual setup; its long horizontal hue lens browses the canvas grid by bot color, while All clears the lens and search or saved groups narrow the same choices. Wield Prism on + desaturates the screen while a cold local model warms, then shows a fullscreen invent loader, invents a full Coffee Group from a short direction (cast, name, ethos, topics), opens it, and toasts the model that finished the refraction.",
                      "Press + to start a manual setup, then choose each permanent member explicitly from Library. The horizontal hue lens browses the canvas grid by bot color, while All clears the lens and search or saved Library groups narrow the same per-bot choices. A Coffee Group keeps two to five permanent members in its fixed five-seat roster.",
                    ),
                  }
                : signalWatchReplayTutorialStep;
            return !DEBATE_STAGE_LAYOUT_TUTORIAL_ENABLED &&
              mode === "debate" &&
              step.heading === "Enter the Debate Studio"
              ? {
                  ...coffeeRosterTutorialStep,
                  body: coffeeRosterTutorialStep.body.replace(
                    DEBATE_STAGE_LAYOUT_INTRO_COPY,
                    "",
                  ),
                }
              : coffeeRosterTutorialStep;
          }),
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
