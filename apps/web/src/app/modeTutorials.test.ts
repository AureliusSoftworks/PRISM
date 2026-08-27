import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MODE_TUTORIALS, modeTutorialStep } from "./modeTutorials.ts";
import { FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE } from "./firstRunOnboarding.ts";

function signalPowersTutorialBody(): string {
  return MODE_TUTORIALS.botcast.steps.find(
    (step) => step.heading === "Book tonight’s episode",
  )?.body ?? "";
}

describe("mode tutorials", () => {
  it("teaches explicit Coffee roster setup and bot-directed Wield where supported", () => {
    const coffeeBody = MODE_TUTORIALS.coffee.steps[0]?.body ?? "";
    assert.match(coffeeBody, /each permanent member explicitly/u);
    assert.match(coffeeBody, /per-bot canvas/u);
    assert.match(coffeeBody, /all five can sit at the live table/u);
    const debateBody =
      MODE_TUTORIALS.debate.steps.find(
        (step) => step.heading === "Enter the Debate Studio",
      )?.body ?? "";
    assert.match(
      debateBody,
      /Wield Prism onto Forum, Turnabout, or Whodunnit\?/u,
    );
    assert.match(debateBody, /fresh editable case locked to that mode/u);
    assert.match(debateBody, /never changes a compiled or sealed case/u);
    const bodies = [
      debateBody,
      signalPowersTutorialBody(),
    ];
    for (const body of bodies) {
      assert.match(body, /concrete bot tile/u);
      assert.match(body, /session never starts/u);
      assert.match(body, /ordinary clicks remain ordinary selection/u);
    }
  });

  it("covers the complete Whodunnit investigation and trial loop", () => {
    const step = MODE_TUTORIALS.debate.steps.find(
      (candidate) => candidate.heading === "Investigate a Whodunnit",
    );
    assert.ok(step);
    assert.equal(step.targetSelector, '[data-tutorial-target="debate-format"]');
    assert.match(step.body, /play the prosecution/u);
    assert.match(step.body, /four explicitly seated jurors/u);
    assert.match(step.body, /Bench Trial/u);
    assert.match(step.body, /Premium voices are unavailable/u);
    assert.match(step.body, /LOCAL makes no outbound voice request/u);
    assert.match(step.body, /choose Participant to play the prosecution[\s\S]*or Spectator/u);
    assert.match(step.body, /frozen case pre-fills/u);
    assert.match(step.body, /existing Theory Board to review frozen Prosecutor findings/u);
    assert.match(step.body, /explicitly file the conclusion/u);
    assert.match(step.body, /Spectator cannot return to the mansion/u);
    assert.match(step.body, /Unused clues, sealed case fields, graph internals/u);
    assert.match(step.body, /Participant keeps the full mansion/u);
    assert.match(step.body, /Theme \/ Spark/u);
    assert.match(step.body, /Participant setup offers Skip investigation/u);
    assert.match(step.body, /Spectator setup calls the same direct-court choice Start directly in court/u);
    assert.match(step.body, /leaves Evidence synthesis optional/u);
    assert.match(step.body, /Evidence and Rooms are opt-in/u);
    assert.match(step.body, /Rooms is ONLINE-only and LOCAL always keeps the bundled room pack/u);
    assert.match(step.body, /encrypted case vault—not Images, Generated Images, or the Library/u);
    assert.match(step.body, /Save image is the explicit action/u);
    assert.match(step.body, /opens directly inside the murder scene/u);
    assert.match(step.body, /one finite visible sweep/u);
    assert.match(step.body, /one connected doorway at a time/u);
    assert.match(step.body, /Preparing your mystery to watch/u);
    assert.match(step.body, /Writing the trial, Checking the case, and Recording the cast/u);
    assert.match(step.body, /collapsed Preparation details/u);
    assert.match(step.body, /Participant Case Forge retains its detailed six stages/u);
    assert.match(step.body, /last durable checkpoint/u);
    assert.match(step.body, /Choose Continue in background/u);
    assert.match(step.body, /other PRISM synthesis or start another Debate/u);
    assert.match(step.body, /only one Whodunnit at a time/u);
    assert.match(step.body, /a little after ten/u);
    assert.match(step.body, /wrong place at the wrong time/u);
    assert.match(step.body, /Accomplices are reserved for Mastermind/u);
    assert.match(step.body, /completion, safe failure, or cancellation releases the Forge/u);
    assert.match(step.body, /Archive shows its spoiler-safe durable progress/u);
    assert.match(step.body, /Save mansion level preserves the layout/u);
    assert.match(step.body, /Writing the Case/u);
    assert.match(step.body, /Testing Contradictions/u);
    assert.match(step.body, /Preparing Local Voices/u);
    assert.match(step.body, /Continue without voices/u);
    assert.match(step.body, /no Actions or token economy/u);
    assert.match(step.body, /Move returns to PRISM’s shallow-isometric mansion/u);
    assert.match(step.body, /Unvisited rooms reveal no occupant glyph/u);
    assert.match(step.body, /Casekeeper’s dot beat grows from "\." to "\.\." to "\.\.\."/u);
    assert.match(step.body, /second Casekeeper box: an anonymous narrative tableau/u);
    assert.match(step.body, /frozen public appearance and a visible fixture/u);
    assert.match(step.body, /no name, color card, or sigil/u);
    assert.match(step.body, /frozen persona introduction then plays from the prepared local pack/u);
    assert.match(step.body, /archived case keeps its existing replay-stable wording/u);
    assert.match(step.body, /up to two seconds on one optional Auto-routed cadence choice/u);
    assert.match(step.body, /frozen LOCAL or ONLINE privacy lane/u);
    assert.match(step.body, /timeout, invalid output, or unavailable frozen voice keeps the canonical text and verified clip/u);
    assert.doesNotMatch(step.body, /No gameplay action calls an LLM or synthesizes a voice/u);
    assert.match(step.body, /Controls return only after that exact performance ends; revisits skip it/u);
    assert.match(step.body, /Examine is a silent room-art viewing mode/u);
    assert.match(step.body, /lens cursor and proximity glow/u);
    assert.match(step.body, /When the lens glows, select anywhere in the room scene/u);
    assert.match(step.body, /click any non-interactive part of the screen/u);
    assert.match(step.body, /double-click does both for silent text/u);
    assert.match(step.body, /stops the outgoing voice immediately and fills the caption without dismissing the line/u);
    assert.match(step.body, /again to close or advance it/u);
    assert.match(step.body, /Talk groups finite authored subjects about people, motives, alibis, general questions, and rooms/u);
    assert.match(step.body, /room subjects name their location/u);
    assert.match(step.body, /evidence and testimony never appear in Talk/u);
    assert.match(step.body, /Nonverbal performance text appears above the suspect/u);
    assert.match(step.body, /voice, and mouth timing use only the words actually spoken/u);
    assert.match(step.body, /Present is the only evidence or sworn-testimony interaction/u);
    assert.match(step.body, /correct record is shown to the correct suspect/u);
    assert.match(step.body, /wrong record or recipient unlocks nothing/u);
    assert.match(step.body, /Theory Board opens after the crime-scene briefing/u);
    assert.match(step.body, /weakens the case rather than blocking trial/u);
    assert.match(step.body, /Every suspect, including the accused, testifies/u);
    assert.match(step.body, /Previous and Next/u);
    assert.match(step.body, /Press for free/u);
    assert.match(step.body, /authored prosecution response/u);
    assert.match(step.body, /costs credibility/u);
    assert.match(step.body, /Retry current witness restores/u);
    assert.match(step.body, /shared Powers/u);
    assert.match(step.body, /truth\/proof grade and juror breakdown/u);
    assert.match(step.body, /Reduced Motion/u);
    assert.match(step.body, /Archive and replay reuse the persisted result without another model or voice call/u);
    assert.match(step.body, /Identity Crisis makes the holder sincerely become the latest eligible direct addresser and treat the original as an impostor/u);
    assert.match(step.body, /complete resting and speaking mouth package/u);
    assert.match(step.body, /literally double-quoted public name/u);
    assert.match(step.body, /player-controlled Prosecutor is eligible/u);
    assert.match(step.body, /witness holder retargets to whoever is currently speaking directly to that witness/u);
    assert.match(step.body, /accused original treats that claim as real pressure/u);
    assert.match(step.body, /concern that can deepen naturally instead of panic or constant repetition/u);
    assert.match(step.body, /color, material shell, complete frozen voice and exact Accent Map location, pronunciation, Speechprint, provider voice identity/u);
    assert.match(step.body, /target form, direct-address event, and timing are frozen for replay/u);
    assert.match(step.body, /one case card with every immutable playthrough nested beneath it/u);
    assert.match(step.body, /same mystery/u);
    assert.match(step.body, /zero AI, image, or voice synthesis/u);
    assert.match(step.body, /returns you to that Run instead of creating another/u);
    const debateSource = readFileSync(
      new URL("./DebateExperience.tsx", import.meta.url),
      "utf8",
    );
    assert.match(debateSource, /"debate-mystery-play-again"/u);
    assert.match(debateSource, /data-tutorial-target="debate-mystery-family-runs"/u);
    assert.match(debateSource, /data-tutorial-target="debate-mystery-play-again-confirm"/u);
    assert.doesNotMatch(step.body, /action token|freeform interview|twitch timer/iu);
  });

  it("teaches quiet pre-session alignment through each applet's native room", () => {
    const coffee = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Set the table",
    );
    const signal = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Book tonight’s episode",
    );
    const debate = MODE_TUTORIALS.debate.steps.find(
      (step) => step.heading === "Enter the Debate Studio",
    );

    assert.ok(coffee);
    assert.match(coffee.body, /group home first/u);
    assert.match(coffee.body, /compact Table Setup desk/u);
    assert.match(coffee.body, /visit controls, guest list, and recent-session reuse/u);
    assert.match(coffee.body, /Back to group/u);
    assert.match(coffee.body, /discards only that uncommitted visit draft/u);
    assert.match(coffee.body, /One footer summarizes guests, topic state/u);
    assert.match(coffee.body, /explains anything still missing/u);
    assert.match(coffee.body, /owns Open the table/u);
    assert.equal(
      coffee.targetSelector,
      '[data-tutorial-target="coffee-session-setup"]',
    );

    assert.ok(signal);
    assert.match(signal.body, /native Production Desk/u);
    assert.match(signal.body, /Latest episodes restores an editable booking/u);
    assert.match(signal.body, /One launch row owns Begin episode or Prepare show/u);
    assert.match(signal.body, /missing guest or topic explained at that action/u);
    assert.match(signal.body, /I Feel Lucky!/u);
    assert.match(signal.body, /show, guest, title, and private premise/u);
    const lucky = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Take the lucky shortcut",
    );
    assert.ok(lucky);
    assert.equal(
      lucky.targetSelector,
      '[data-tutorial-target="botcast-feel-lucky"]',
    );
    assert.match(lucky.body, /beneath Create show/u);
    assert.match(lucky.body, /unlocks once a show exists/u);
    assert.match(lucky.body, /immediately starts/u);
    assert.match(lucky.body, /If synthesis fails, nothing starts/u);

    assert.ok(debate);
    assert.match(debate.body, /procedural Studio navigation/u);
    assert.match(debate.body, /proceeding review, readiness rail/u);
    assert.match(debate.body, /Save Debate, Start Debate, and Archive setup reuse/u);
    assert.match(debate.body, /own established language and hierarchy/u);
  });

  it("explains Refract's separate model picker without weakening the privacy lane", () => {
    const copy = Object.values(MODE_TUTORIALS)
      .flatMap((tutorial) => tutorial.steps)
      .map((step) => step.body)
      .join(" ");
    assert.match(copy, /own model picker in the Prism companion's Synthesis tab/u);
    assert.match(copy, /LOCAL only offers local models and ONLINE only offers online models/u);
    assert.match(copy, /each lane remembers its model or Auto choice/u);
    assert.match(copy, /Refract model is separate from chat and bot models/u);
    assert.match(copy, /APP MODE badge mirrors the global privacy toggle/u);
    assert.match(copy, /LOCAL keeps refraction offline/u);
    assert.match(copy, /ONLINE may send the item being refracted to an online provider/u);
  });

  it("explains transient native Max without changing the ordinary ladder", () => {
    const copy = readFileSync(new URL("./modeTutorials.ts", import.meta.url), "utf8");
    assert.match(copy, /Extra High unlocks a separate Max overdrive toggle/u);
    assert.match(copy, /Opus 4\.6, Sonnet 4\.6, and Mythos Preview.*alias for provider Max/u);
    assert.match(copy, /hardest-route Auto turn may select Extra High/u);
    assert.match(copy, /Turbo remains an independent toggle.*combined with Max/u);
    assert.match(copy, /Claude Opus 4\.8\/5 Fast processing/u);
    assert.match(copy, /Mythos 5 is an optional Anthropic model.*begins unchecked/u);
  });

  it("teaches vertical keyboard navigation for the model and effort pickers", () => {
    const copy = MODE_TUTORIALS.zen.steps
      .map((step) => step.body)
      .join(" ");
    assert.match(
      copy,
      /Up\/Down moves the pending option whether it was opened by hotkey or click/u,
    );
    assert.match(copy, /Left\/Right remain available/u);
    assert.match(copy, /per-request routing is limited to Turbo-capable ONLINE models/u);
    assert.match(copy, /turning it off restores ordinary Auto routing/u);
  });

  it("explains semantic Ink movement and Speech animation", () => {
    const step = MODE_TUTORIALS.avatar.steps[1];
    assert.match(step?.body ?? "", /Speech ink has its own animation selector/u);
    assert.match(step?.body ?? "", /motion can differ from the mouth/u);
    assert.match(
      step?.body ?? "",
      /Move tool can carry any combination of Blink, Speech, and Effect ink/u,
    );
    assert.match(
      step?.body ?? "",
      /Auto moves whichever layer you grab/u,
    );
    assert.match(step?.body ?? "", /cursor-anchored scroll zoom/u);
    assert.match(step?.body ?? "", /Search Stamps by name/u);
    assert.match(step?.body ?? "", /position it with the grid pad/u);
    assert.match(step?.body ?? "", /Click the canvas or press Enter/u);
    assert.match(step?.body ?? "", /Escape cancels/u);
    assert.match(step?.body ?? "", /shared runtime renderer uses Full HD/u);
    assert.match(step?.body ?? "", /compact Chassis scale covers one pixel through Badge, Room, Hero, and the 299px Mini ceiling/u);
    assert.match(
      step?.body ?? "",
      /face, Ink, frame, and buckle must remain registered together/u,
    );
    assert.match(
      step?.body ?? "",
      /Full HD at 300px and above/u,
    );
    assert.match(
      step?.body ?? "",
      /Mini from 81px through 299px, and the first Micro stage at 80px and below/u,
    );
    assert.match(
      step?.body ?? "",
      /Micro uses its identity glyph throughout the readable Micro tier/u,
    );
    assert.match(
      step?.body ?? "",
      /Mini keeps the full live mouth-shape stream/u,
    );
    assert.match(
      step?.body ?? "",
      /Micro uses its identity glyph throughout the readable Micro tier, so it has no face, mouth animation, or Avatar Details Ink/u,
    );
    assert.doesNotMatch(step?.body ?? "", /resting mouth for closures/u);
    assert.doesNotMatch(step?.body ?? "", /Micro keeps its face|At 28px and below/u);
    assert.match(step?.body ?? "", /At 8px through 2px, the bot resolves to a fixed 4×4 square/u);
    assert.match(step?.body ?? "", /at 1px it becomes one literal identity-color pixel/u);
    assert.match(step?.body ?? "", /Mini avatars stay fixed/u);
    assert.match(step?.body ?? "", /same Chassis scale remains selected/u);
    assert.match(step?.body ?? "", /Surprise me auditions a different shared ElevenLabs preview/u);
    assert.match(step?.body ?? "", /Wield Prism onto the Voice Library card/u);
    assert.match(step?.body ?? "", /Use for this bot assigns an audition only to the current draft/u);
    assert.match(step?.body ?? "", /Save to Library separately bookmarks it/u);
    assert.match(step?.body ?? "", /private PRISM account library/u);
    assert.match(step?.body ?? "", /Pronunciation switch/u);
    assert.match(
      step?.body ?? "",
      /fictional and original personas default off/u,
    );
    assert.match(
      step?.body ?? "",
      /historically accurate real-person castings and curated real-person Marketplace bots default on/u,
    );
  });

  it("explains the canonical hue-only identity color", () => {
    const step = MODE_TUTORIALS.avatar.steps[2];
    assert.match(step?.body ?? "", /canonical fully saturated identity color/u);
    assert.match(step?.body ?? "", /without a separate brightness modifier/u);
    assert.doesNotMatch(step?.body ?? "", /accent brightness/u);
  });

  it("describes Batch Foundry's dedicated indexed constellation chamber", () => {
    const step = MODE_TUTORIALS.avatar.steps[0];
    assert.match(step?.body ?? "", /dedicated constellation chamber/u);
    assert.match(step?.body ?? "", /fixed indexed seeds never reorder/u);
    assert.match(step?.body ?? "", /2–20 reveal through the shared mini avatar/u);
    assert.match(step?.body ?? "", /21–100 use the shared Micro identity glyph/u);
    assert.match(step?.body ?? "", /generated color-and-glyph orb/u);
    assert.match(step?.body ?? "", /Standard and Inspire keep the Creation chamber shell/u);
  });

  it("explains that typed asset rails remember their own generation model", () => {
    const storageStep = MODE_TUTORIALS.chat.steps.find(
      (step) => step.body.includes("Space Lens"),
    );
    assert.ok(storageStep);
    assert.match(storageStep.body, /Each typed asset rail keeps its own remembered LOCAL or ONLINE generation model/u);
    assert.match(storageStep.body, /directly beneath Synthesize/u);
    assert.match(storageStep.body, /General Images keeps its existing Images-panel model picker/u);
  });

  it("explains bot hub editor shortcuts and exact voice testing", () => {
    const step = MODE_TUTORIALS.zen.steps[0];
    assert.match(step?.body ?? "", /jump straight to any Avatar Studio section/u);
    assert.match(step?.body ?? "", /Beneath the bot’s voice buttons/u);
    assert.match(step?.body ?? "", /English, Premium, Babble, and Bottish/u);
    assert.match(step?.body ?? "", /Speak uses the current top-bar Voice mode/u);
    assert.match(step?.body ?? "", /starts a chat or LLM turn/u);
  });

  it("teaches the focused bot as a full-screen Lobby with an exact room return", () => {
    const step = MODE_TUTORIALS.zen.steps.find(
      (candidate) => candidate.heading === "Open the focused bot",
    );
    assert.ok(step);
    assert.match(step.body, /full-screen Lobby/u);
    assert.match(step.body, /steps forward at full size/u);
    assert.match(step.body, /Neutralize mood/u);
    assert.match(step.body, /soft global mood can carry across compatible modes/u);
    assert.match(step.body, /Overview keeps the bot, Talk to me, groups, and suggestions close/u);
    assert.match(
      step.body,
      /Customize holds Avatar Studio, memories, and Neutralize mood; Library holds connected resources and assets/u,
    );
    assert.match(step.body, /Avatar Studio opens as a deeper editing layer/u);
    assert.match(step.body, /exact same room bot and keyboard focus/u);
  });

  it("distinguishes the Lobby's user-first composer dock from Talk to me", () => {
    const step = MODE_TUTORIALS.zen.steps.find(
      (candidate) => candidate.heading === "Send a direct message",
    );
    assert.ok(step);
    assert.match(step.body, /reserved composer dock at the bottom/u);
    assert.match(step.body, /fresh user-first one-on-one/u);
    assert.match(step.body, /Talk to me is separate: it starts fresh with the bot speaking first/u);
  });

  it("teaches that the Zen header bot picker invites a guest into the current Home", () => {
    const continueHomeStep = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Continue this Home",
    );
    assert.ok(continueHomeStep);
    assert.match(continueHomeStep.body, /header bot picker invites them into this same conversation/u);
    assert.match(continueHomeStep.body, /Random, New, Intro, or Off handoff/u);
  });

  it("teaches two-axis Zen Hue Cable navigation with a stable target", () => {
    const step = MODE_TUTORIALS.zen.steps.find(
      (candidate) => candidate.heading === "Pluck the spectrum",
    );
    assert.ok(step);
    assert.equal(
      step.targetSelector,
      '[data-tutorial-target="zen-hue-cable"]',
    );
    assert.match(step.body, /Drag sideways past the small pull threshold to choose a hue/u);
    assert.match(step.body, /Pull upward to narrow/u);
    assert.match(step.body, /pull downward to broaden/u);
    assert.match(step.body, /horizontal hue motion coasts briefly and loses momentum/u);
    assert.match(step.body, /breadth you chose stays committed/u);
    assert.match(step.body, /full vertical yank spans the complete available depth ladder/u);
    assert.match(step.body, /search scans the entire active group/u);
    assert.match(step.body, /Home returns to the remembered-hue root/u);
    assert.match(step.body, /one-row card gallery/u);
    assert.match(step.body, /broad room gradient sits above the selected hue atmosphere/u);
    assert.match(step.body, /fades as you drill deeper/u);
    assert.match(step.body, /colors merge instead of switching abruptly/u);
  });

  it("teaches explicit Zen avatar sizing", () => {
    const step = MODE_TUTORIALS.zen.steps.find(
      (candidate) => candidate.heading === "Let context breathe",
    );
    assert.ok(step);
    assert.match(step.body, /Cmd\/Ctrl \+ enlarges it/u);
    assert.match(step.body, /Grow, Shrink, and Reset size/u);
    assert.match(step.body, /Full sizes use the high-resolution avatar/u);
    assert.match(step.body, /compact sizes switch to the crisp mini chassis/u);
  });

  it("teaches that crossing the Zen midpoint turns the complete avatar screen", () => {
    const step = MODE_TUTORIALS.zen.steps.find(
      (candidate) => candidate.heading === "Let the companion move",
    );
    assert.ok(step);
    assert.match(step.body, /may rest over prose or chrome/u);
    assert.match(step.body, /face and authored Ink turning together/u);
    assert.match(step.body, /persona glyph stays readable/u);
  });

  it("explains immersive waiting captions and the Psychic privacy boundary", () => {
    const step = MODE_TUTORIALS.chat.steps[0];
    assert.match(step?.body ?? "", /Shift-click bot cards/u);
    assert.match(step?.body ?? "", /right-click anywhere on the PRISM surface/u);
    assert.match(step?.body ?? "", /Escape closes that menu first/u);
    assert.match(step?.body ?? "", /short in-character activity caption/u);
    assert.match(
      step?.body ?? "",
      /submitted words stream onto the canvas from a quiet reveal clock/u,
    );
    assert.match(step?.body ?? "", /the player is never voiced aloud/u);
    assert.match(
      step?.body ?? "",
      /spoken player presence defers to the Default Prism voice/u,
    );
    assert.match(
      step?.body ?? "",
      /Prompt Center send with wildcards in immersive Zen first resolves to its concrete final wording/u,
    );
    assert.match(step?.body ?? "", /neither the raw command nor an unresolved placeholder flashes early/u);
    assert.match(
      step?.body ?? "",
      /Transcript Chat treats \/prompts, !decks, and \{slots\} as ordinary words/u,
    );
    assert.match(step?.body ?? "", /Transcript Chat shows your submitted text immediately/u);
    assert.match(step?.body ?? "", /bot’s reply still honors the same configured Speech Type/u);
    assert.match(step?.body ?? "", /sparse listening reaction/u);
    assert.match(step?.body ?? "", /Action SFX/u);
    assert.match(step?.body ?? "", /veil still waits until your line finishes/u);
    assert.match(step?.body ?? "", /transcript Chat \(Conversations open\)/u);
    assert.match(step?.body ?? "", /user-readable planning disclosure/u);
    assert.match(step?.body ?? "", /Immersive Zen never paints Psychic/u);
    assert.match(step?.body ?? "", /assistant bubble/u);
    assert.match(step?.body ?? "", /collapsed until you click/u);
    assert.match(step?.body ?? "", /model and effort glyph/u);
    assert.match(step?.body ?? "", /Those passes guide the final reply/u);
    assert.match(
      step?.body ?? "",
      /each simulated pass is an additional request to the selected provider and may add usage or cost/u,
    );
    assert.match(
      step?.body ?? "",
      /Plan, Draft, Audit, and more on higher Effort or Deep experimental/u,
    );
    assert.match(
      step?.body ?? "",
      /Private planning artifacts and provider hidden reasoning are never exposed/u,
    );
    assert.doesNotMatch(step?.body ?? "", /Developer Mode|scratchpad/u);
  });

  it("distinguishes the network lane from unsaved Private chat status", () => {
    const chatStep = MODE_TUTORIALS.chat.steps.find(
      (candidate) => candidate.heading === "Shape an offline voice",
    );
    const zenStep = MODE_TUTORIALS.zen.steps.find(
      (candidate) => candidate.heading === "Choose how replies recover",
    );
    assert.ok(chatStep);
    assert.ok(zenStep);
    for (const step of [chatStep, zenStep]) {
      assert.match(step.body, /LOCAL or ONLINE as the hard network privacy lane/u);
      assert.match(step.body, /Private chat is separate/u);
      assert.match(step.body, /do not want the conversation or memories saved/u);
      assert.match(
        step.body,
        /locked Private chat badge remains in the navbar as status, not a switch/u,
      );
      assert.match(
        step.body,
        /Switching to another applet disarms Private chat/u,
      );
    }
  });

  it("keeps every step click-specific and targetable", () => {
    for (const tutorial of Object.values(MODE_TUTORIALS)) {
      assert.ok(tutorial.steps.length > 0);
      for (const step of tutorial.steps) {
        assert.ok(step.clickLabel.trim().length > 0);
        assert.match(
          step.targetSelector,
          /^\[(?:data-tutorial-target|data-zen-live-bot-presence-plate)=/,
        );
      }
    }
  });

  it("explains Signal memory alerts and the persona-only dashboard avatar", () => {
    const liveStep = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Produce from the control room",
    );
    const dashboardStep = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Talk with the host off-air",
    );
    assert.ok(liveStep);
    assert.ok(dashboardStep);
    assert.match(liveStep.body, /live ! chip/u);
    assert.match(liveStep.body, /read the exact memory and dismiss the alert/u);
    assert.match(liveStep.body, /clears any unseen Signal alert/u);
    assert.match(liveStep.body, /exactly one \.png or \.jpg/u);
    assert.match(liveStep.body, /raw file remains ephemeral/u);
    assert.match(liveStep.body, /tiny, intentionally soft archival proxy for replay/u);
    assert.match(liveStep.body, /older emoji-only replays retain their recorded fallback/u);
    assert.match(liveStep.body, /fully opaque PNG is treated as a picture/u);
    assert.match(liveStep.body, /light or dark Polaroid frame/u);
    assert.match(liveStep.body, /wide camera places either one at the lower center/u);
    assert.match(liveStep.body, /left and right cameras keep it on their matching side/u);
    assert.match(liveStep.body, /only a genuinely transparent PNG item offers an unchecked Keep in Items option/u);
    assert.match(liveStep.body, /links it to the bot guest it was presented to/u);
    assert.match(liveStep.body, /New replays use the small archival proxy/u);
    assert.match(liveStep.body, /original item is kept/u);
    assert.match(dashboardStep.body, /ordinary authored face and persona glyph/u);
    assert.match(dashboardStep.body, /no Power or status badge attached/u);
    assert.match(
      dashboardStep.body,
      /bounded same-account Library performance context/u,
    );
    assert.match(dashboardStep.body, /only this host's global mood/u);
    assert.match(dashboardStep.body, /never saved to conversations or memory/u);
    assert.match(dashboardStep.body, /Neutralize mood/u);
  });

  it("guides Avatar Foundry modules and live controls with stable targets", () => {
    assert.deepEqual(
      MODE_TUTORIALS.avatar.steps.map((step) => step.targetSelector),
      [
        '[data-tutorial-target="avatar-foundry-eyes-tab"]',
        '[data-tutorial-target="avatar-foundry-controls"]',
        '[data-tutorial-target="avatar-foundry-dock"]',
      ],
    );
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /stay fully dark only/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /slow, dim breath/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /Creation chamber/u);
    assert.match(
      MODE_TUTORIALS.avatar.steps[0]!.body,
      /Wield Prism onto it to populate an editable direction/u,
    );
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /fling it across the platform/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /Reduced Motion settles it calmly/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /Prism stays at an authored chamber anchor/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /module being populated/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /no fake percentages/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /only the buckle cycles real bot glyphs/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /both screens fill upward/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /crests both screens white/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /generated drafts/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /shared navbar hides/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /Refract picker/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /During active assembly/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /close and confirm to cancel/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /prior draft restored/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /three paths/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /one to five selected Library influences/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /2–100 bots/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /Counts 2–10 automatically generate and save every rich full draft/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /Counts 11–100 switch visibly/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /recoverable progress/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /one strong, two moderate, or three weak compound Powers/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /Auto still chooses model and effort when Refract is on Auto/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /perimeter dock/u);
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /lights stay dim and breathing/u);
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /microphone-like accents/u);
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /display stays fixed/u);
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /Default Blink makes custom eyes simply vanish and reappear on the stock blink timing/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /drag either the top or bottom handle to place that seam/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /shared runtime renderer uses Full HD/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /Full HD at 300px and above/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /first Micro stage/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /80px and below/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /same Chassis scale remains selected/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /At 150% zoom, a 128-cell grid appears only on the large face screen/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /each cell is exactly one size-1 brush pixel/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /buckle and Micro screens stay grid-free/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /keeps the face and chassis lighting flat and hard-edged/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /Coffee \* makes the custom mouth pucker and Speech ink switch together/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /Default can enable Custom Speech:[\s\S]*disabling it restores ordinary speech shapes\. None keeps a custom authored mouth completely still/u,
    );
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /Preview live/u);
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /Five floating orbs/u);
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /Idle, Blink, Thinking, Sip, and Talking/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /hidden in Ink Display to keep the drawing workspace clear/u,
    );
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /nearby-choice buttons/u);
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /audition dock/u);
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /remains beneath the bot/u);
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /Wield/u);
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /randomizer buttons/u);
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /Prism stays visually submerged.*top-bar panels/u,
    );
    assert.doesNotMatch(
      MODE_TUTORIALS.avatar.steps.map((step) => step.body).join(" "),
      /refracts Wield/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[2]!.body,
      /Wield Prism onto What makes this bot special\?/u,
    );
    assert.match(MODE_TUTORIALS.avatar.steps[2]!.body, /Refract picker/u);
    assert.match(MODE_TUTORIALS.avatar.steps[2]!.body, /Save or Create bot/u);
    assert.match(MODE_TUTORIALS.avatar.steps[2]!.body, /Core for name/u);
    assert.match(
      MODE_TUTORIALS.avatar.steps[2]!.body,
      /Settings → Appearance → CRT focus can soften or tighten that brush globally without changing any authored shape or color/u,
    );
  });

  it("explains the full-width Accent map in plain language", () => {
    const step = MODE_TUTORIALS.chat.steps.find(
      (candidate) => candidate.heading === "Shape an offline voice",
    );
    assert.ok(step);
    assert.match(step.body, /Accent, Local, and Premium stages/u);
    assert.match(step.body, /full-width map/u);
    assert.match(step.body, /world map is a navigator/u);
    assert.match(step.body, /click a region to zoom in/u);
    assert.match(step.body, /place the pin exactly where you want it/u);
    assert.match(
      step.body,
      /an unnamed spot stays 100% within a source's home core, then blends smoothly across its boundary/u,
    );
    assert.match(step.body, /never demographic inference/u);
    assert.match(step.body, /required Accent pin/u);
    assert.match(step.body, /Local voice and Feel/u);
    assert.match(step.body, /Premium voice and Feel/u);
    assert.match(step.body, /does not move the bot across regions/u);
    assert.match(step.body, /without exposing engine regions/u);
    assert.match(step.body, /All accents/u);
    assert.match(step.body, /named local variants such as Cockney as explicit chips/u);
    assert.match(step.body, /Moving, dropping, or choosing a pin is always silent/u);
    assert.match(step.body, /buttons beneath that bot in its preview panel/u);
    assert.match(step.body, /One pin controls both engines/u);
    assert.match(step.body, /Premium and Local share one target-pronunciation path/u);
    assert.match(step.body, /never changes the spoken language/u);
  });

  it("points Images players to the Asset Library", () => {
    const step = MODE_TUTORIALS.chat.steps.find(
      (candidate) => candidate.heading === "Use quick tools",
    );
    assert.ok(step);
    assert.match(step.body, /Asset Library opens the searchable general-image collection/u);
  });

  it("teaches shared Chat/Zen Atmosphere with gradient fallback", () => {
    const step = MODE_TUTORIALS.zen.steps.find(
      (candidate) =>
        candidate.targetSelector === '[data-tutorial-target="zen-atmosphere"]',
    );
    assert.ok(step);
    assert.match(step.body, /Atmosphere starts on for every Chat\/Zen conversation/u);
    assert.match(step.body, /Blank bot gradients/u);
    assert.match(step.body, /same room appears behind transcript Chat and immersive Zen/u);
    assert.match(step.body, /Open Settings/u);
    assert.match(step.body, /\$atmosphere/u);
    assert.match(step.clickLabel, /Settings/u);
  });

  it("teaches Chat and Zen as two views of one active reply", () => {
    const step = MODE_TUTORIALS.zen.steps.find(
      (candidate) => candidate.heading === "Continue this Home",
    );
    assert.ok(step);
    assert.match(
      step.body,
      /transcript Chat without changing the conversation, selected Speech Type, Atmosphere, or active reply/u,
    );
    assert.match(
      step.body,
      /Closing the panel returns to immersive Zen with that same state/u,
    );
    assert.match(
      step.body,
      /Speech Type locks when you send and remains locked until the bot's full reply has reached the canvas/u,
    );
    assert.match(step.body, /When Shh appears in either view/u);
    assert.match(step.body, /saves only the bot words you actually heard/u);
    assert.match(step.body, /brief in-character reaction to being shushed/u);
    assert.match(
      step.body,
      /no bot words were audible yet.*discards the hidden reply without a reaction/u,
    );
    assert.match(step.body, /never replaces the draft you are writing/u);
    assert.match(
      step.body,
      /This immersive composer is the only session box that runs Prompt Center prompts, commands, and wildcards/u,
    );
    assert.doesNotMatch(step.body, /forces Voice to Mute|resumes automatically/u);
  });

  it("teaches the complete Debate contract with stable targets", () => {
    const tutorial = MODE_TUTORIALS.debate;
    assert.deepEqual(
      tutorial.steps.map((step) => step.targetSelector),
      [
        '[data-tutorial-target="debate-new"]',
        '[data-tutorial-target="debate-stage-layout"]',
        '[data-tutorial-target="debate-room"]',
        '[data-tutorial-target="debate-rowdiness"]',
        '[data-tutorial-target="debate-synthesize"]',
        '[data-tutorial-target="debate-cast"]',
        '[data-tutorial-target="debate-seat"]',
        '[data-tutorial-target="debate-rhetorical-gambits"]',
        '[data-tutorial-target="debate-consent"]',
        '[data-tutorial-target="debate-evidence"]',
        '[data-tutorial-target="debate-evidence-continue"]',
        '[data-tutorial-target="debate-readiness"]',
        '[data-tutorial-target="debate-start"]',
        '[data-tutorial-target="debate-judge-gavel"]',
        '[data-tutorial-target="debate-case-board-tab"]',
        '[data-tutorial-target="debate-jury-chamber"]',
        '[data-tutorial-target="debate-camera"]',
        '[data-tutorial-target="debate-copy-all-review-data"]',
        '[data-tutorial-target="debate-format"]',
      ],
    );
    const copy = tutorial.steps.map((step) => step.body).join(" ");
    assert.match(copy, /Studio follows one clear path/u);
    assert.match(copy, /opens as a Plainspoken Forum with Auto rounds/u);
    assert.match(copy, /canonical Main arrangement/u);
    assert.match(copy, /live Forum presentation and replay/u);
    assert.match(copy, /Plain New Duel clears the active workbench/u);
    assert.match(copy, /Wield Prism onto New Duel desaturates the screen while a cold local model warms/u);
    assert.match(copy, /Wield Prism onto a left-rail link to refresh that section/u);
    assert.match(copy, /Wield Prism onto Motion in the left rail to rebuild the question/u);
    assert.match(copy, /Wield Prism onto Cast in the left rail to reseat the proceeding/u);
    assert.match(copy, /Wield Prism onto Evidence in the left rail to replace the optional exhibits/u);
    assert.match(copy, /Wield Prism onto Stage layout to open the lab with a shuffled preview cast/u);
    assert.match(copy, /without inventing or erasing history/u);
    assert.match(copy, /Tune the room keeps the proceeding preset/u);
    assert.match(copy, /leave it closed and trust the defaults/u);
    assert.match(copy, /University Union to Daytime Showdown/u);
    assert.match(copy, /sharper language, faster confrontation/u);
    assert.match(copy, /facts, safety boundaries/u);
    assert.match(
      copy,
      /changing Atmosphere clears an earlier willingness check/u,
    );
    assert.match(
      copy,
      /Forum supports Auto or a fixed one-to-three-round plan/u,
    );
    assert.match(copy, /Refine motion reveals the alternate motions/u);
    assert.match(copy, /optional tuning, not a second setup mode/u);
    assert.match(copy, /Moderator’s exact working title on the center card/u);
    assert.match(copy, /title and team names freeze with the saved Debate/u);
    assert.match(copy, /setup never renames the Judge/u);
    assert.match(copy, /briefs you should not have to author/u);
    assert.match(copy, /Try another version/u);
    assert.match(copy, /Make sure they’re willing/u);
    assert.match(copy, /Consent is bound to the concrete model and Effort/u);
    assert.match(copy, /Needs reconfirmation/u);
    assert.match(copy, /changing Turbo alone does not/u);
    assert.match(copy, /A refusal remains respected/u);
    assert.match(
      copy,
      /every Persona gives a short in-character comment on the assigned side/u,
    );
    assert.match(
      copy,
      /answer stays on this step so you can read it[\s\S]*choose Add optional evidence to continue/u,
    );
    assert.match(copy, /private LLM check/u);
    assert.match(copy, /Evidence is optional/u);
    assert.match(copy, /Generate all assets before the debate automates artwork/u);
    assert.match(copy, /Each proceeding starts as a compact cast, title, motion, and state summary/u);
    assert.match(copy, /select it to reveal the complete metadata, synopsis, Assets, setup reuse/u);
    assert.match(copy, /server-owned soft queue immediately/u);
    assert.match(copy, /switch to Signal or any other applet/u);
    assert.match(copy, /attaches directly to its saved Debate exhibit/u);
    assert.match(copy, /uploaded, reused, or already synthesized assets are never replaced/u);
    assert.match(copy, /Start and Resume open while those missing sprites queue in the background/u);
    assert.match(copy, /Continue without evidence confirms that choice/u);
    assert.match(copy, /Save Debate parks a ready setup in Archive Open/u);
    assert.match(copy, /Save immediately hands only emoji-only exhibits with no attached asset to the server-owned soft queue/u);
    assert.match(copy, /custom, reused, and synthesized assets stay untouched/u);
    assert.match(copy, /Remove soft-cancels the proceeding and releases those sprites/u);
    assert.doesNotMatch(copy, /Basic|Advanced/u);
    assert.match(
      copy,
      /Player notes, Brave Search, Scholar Search, and exhibit descriptions stay player-authored/u,
    );
    assert.match(copy, /Prism-drafted query does not search until/u);
    assert.match(copy, /Crossref's public scholarly metadata/u);
    assert.match(
      copy,
      /Each search adds at most its top three unique results/u,
    );
    assert.match(copy, /Add URL accepts your own public HTTP or HTTPS/u);
    assert.match(copy, /LOCAL never performs Brave, Crossref, page, or online-model requests/u);
    assert.match(copy, /duplicate URLs are rejected/u);
    assert.match(
      copy,
      /describe the physical object.*Wield Prism into that description field for a contextual exhibit name.*Draft exhibit derives an editable adjective, object name, observable description, and emoji/u,
    );
    assert.match(copy, /It does not generate artwork/u);
    assert.match(copy, /tap it on the Evidence page to reopen/u);
    assert.match(copy, /Tap the large exhibit picture to search/u);
    assert.match(copy, /three best live matches/u);
    assert.match(copy, /Tap the large exhibit picture to search/u);
    assert.match(copy, /upload, reuse, or synthesize overwrites that same picture/u);
    assert.match(copy, /upload a PNG, JPEG, or WebP/u);
    assert.match(copy, /Synthesize asset soft-prepares a new sprite/u);
    assert.match(copy, /queue more soft sprites in parallel/u);
    assert.match(copy, /Reduce magenta pass/u);
    assert.match(copy, /five automatic local magenta cleanup passes/u);
    assert.match(copy, /Assets opens them for soft Prism re-synthesis/u);
    assert.match(copy, /Undo last pass/u);
    assert.match(copy, /visual adds no facts/u);
    assert.match(copy, /later searches add distinct sources/u);
    assert.match(copy, /up to 12/u);
    assert.match(
      copy,
      /LOCAL blocks research and page reading before network access/u,
    );
    assert.match(copy, /Powers never make a bot ineligible for a role/u);
    assert.match(copy, /inaccessible speech never enters captions, voice/u);
    assert.match(copy, /shared case board, or listener-facing ballot reasons/u);
    assert.match(copy, /sparse replay-stable roll/u);
    assert.match(copy, /own saved Persona/u);
    assert.match(copy, /one short in-character vocal reaction/u);
    assert.match(copy, /Signal-style \*tag\* appears above that bot/u);
    assert.match(copy, /speaks through the bot’s voice/u);
    assert.match(copy, /stays out of Proceedings and copied transcripts/u);
    assert.match(copy, /ambient throat-clears, sighs, and inhales/u);
    assert.match(copy, /not a new argument, vote, role change/u);
    assert.match(copy, /PRISM is the complete selected-side advocate/u);
    assert.match(copy, /Participant is Forum-only/u);
    assert.match(copy, /PRISM becomes your whole selected-side advocate/u);
    assert.match(copy, /Spectator casts all three floor holders/u);
    assert.match(copy, /seats PRISM in the audience gallery/u);
    assert.match(
      copy,
      /leaving one bot opponent and one bot Moderator\/Judge/u,
    );
    assert.match(
      copy,
      /carries your thinking, speaking, interjection, and objection states/u,
    );
    assert.match(copy, /labels the live line “PRISM · You”/u);
    assert.match(copy, /saved event remains player-authored/u);
    assert.match(
      copy,
      /Participant's bot Moderator\/Judge decides the result without inventing a PRISM ballot/u,
    );
    assert.match(copy, /PRISM never invents a human reaction/u);
    assert.doesNotMatch(copy, /neutral floor marker/u);
    assert.match(
      copy,
      /captions and saved Proceedings contain only the words being argued[\s\S]*voice-performance metadata/u,
    );
    assert.match(copy, /one strike calls attention at every phase change/u);
    assert.match(copy, /two restore order for moderator rulings and verdicts/u);
    assert.match(copy, /objections carry no predictive gavel cue/u);
    assert.match(copy, /objection is heard before any bot moderator responds/u);
    assert.match(
      copy,
      /actual gavel slam briefly forces Moderator and disables camera controls/u,
    );
    assert.match(
      copy,
      /human-Judge session automatically activates the center seat for its neutral introduction/u,
    );
    assert.match(
      copy,
      /Judge \/ Moderator seat, the public floor stays on Auto/u,
    );
    assert.match(copy, /Participants never mount this chamber/u);
    assert.match(
      copy,
      /required scene, not a camera you pick/u,
    );
    assert.match(copy, /Forum Auto never glances into the jury room/u);
    assert.match(
      copy,
      /Once deliberation begins, Auto stays in that chamber for the whole discussion/u,
    );
    assert.match(
      copy,
      /Once the Jury is announced, Auto stays in the chamber through leanings, heard deliberation, every juror vote, and the Moderator’s last ballot/u,
    );
    assert.match(
      copy,
      /Forum and Turnabout keep the procedural rhythm for bot-moderated roles/u,
    );
    assert.match(
      copy,
      /canonically silent bot moderator can use that visible signal/u,
    );
    assert.match(copy, /gavel is visible only in Moderator view/u);
    assert.doesNotMatch(copy, /hard-muted bot cannot moderate/u);
    assert.match(
      copy,
      /Press asks for clarification; Object opens[\s\S]*Present Evidence sends/u,
    );
    assert.match(copy, /Devil’s Advocate/u);
    assert.match(copy, /never fabricates sources/u);
    assert.match(
      copy,
      /recent assets can be reused/u,
    );
    assert.match(
      copy,
      /Debate exhibits never mix into general Images/u,
    );
    assert.match(
      copy,
      /Upload lets you upload[\s\S]*Wielding Prism onto Synthesize is the directional synthesis shortcut/u,
    );
    assert.match(copy, /never reads or writes relationship memory/u);
    assert.match(
      copy,
      /Changing the motion, cast, format, formality, LOCAL\/ONLINE privacy lane, or Participant side also requires a fresh compatible check/u,
    );
    assert.match(copy, /idea dice remains available/u);
    assert.match(
      copy,
      /Type ordinary words here; Prompt Center prompts, commands, and wildcards stay in immersive Zen and Command Center/u,
    );
    assert.match(copy, /floating Prism remains available throughout setup/u);
    assert.match(copy, /bounded, unsaved workbench draft/u);
    assert.match(copy, /Wield Prism into a glowing setup field/u);
    assert.match(
      copy,
      /shimmering field stays read-only[\s\S]*different registered input to queue it once[\s\S]*unique inputs in click order[\s\S]*Escape restores a settled draft and clears the remaining queue/u,
    );
    assert.match(copy, /adjective, object, or observable-fact fields/u);
    assert.match(
      copy,
      /Pause sits beside the stage CC control while the Debate is live/u,
    );
    assert.match(copy, /Resume stays on the recess overlay/u);
    assert.match(
      copy,
      /Leave unfinished work through Studio \/ Archive rather than a right-rail End control/u,
    );
    assert.match(
      copy,
      /Judge’s contextual Gavel stays on the public gallery/u,
    );
    assert.match(
      copy,
      /label becomes Intervene while an advocate holds the floor/u,
    );
    assert.match(copy, /Call time during overtime/u);
    assert.match(copy, /Space invokes that same context-aware control/u);
    assert.match(copy, /CC button at the bottom-left of the Forum viewport/u);
    assert.match(
      copy,
      /including spoken Jury chamber subtitles/u,
    );
    assert.match(
      copy,
      /Pause, Play, and the Judge gavel sit at the bottom-right of that same viewport/u,
    );
    assert.match(copy, /narrow Evidence list of frozen item names with tiny table-matching type thumbnails/u);
    assert.match(copy, /center Summary that refreshes between rounds/u);
    assert.match(copy, /hydrates when you return mid-Debate/u);
    assert.match(copy, /right rail toggles Proceedings and the Living Case Board/u);
    assert.match(copy, /after the verdict seals the Debate, the gallery strip clears/iu);
    assert.match(copy, /that slot becomes the live Jury Record/u);
    assert.match(copy, /right rail adds a Verdict tab beside Case board/u);
    assert.match(copy, /SMS-style claim stream/u);
    assert.match(copy, /Pause always cuts the live floor immediately/u);
    assert.match(copy, /bookmarks that held line while the gallery keeps murmuring/u);
    assert.match(copy, /Choosing Resume strikes the gavel immediately/u);
    assert.match(copy, /holds the Moderator camera through the return-to-order call/u);
    assert.match(copy, /An interrupted speaker may restart with a short lead-in/u);
    assert.match(copy, /Opening and Jury recesses use that same return ceremony/u);
    assert.match(copy, /hard-stops every voice/u);
    assert.match(copy, /audibly chokes mid-phrase/u);
    assert.match(copy, /Objection overlaps from the opposite side/u);
    assert.match(
      copy,
      /Leaving mid-ceremony or returning to the Debate menu still hard-stops every voice/u,
    );
    assert.match(copy, /Leaving an unfinished Debate by any route/u);
    assert.match(copy, /Opening any archived Debate replays the full title card/u);
    assert.match(copy, /gallery fills gradually/u);
    assert.match(copy, /Guests keep walking in while the title card reads Preparing or buffering/u);
    assert.match(copy, /approximate clock, not a one-to-one loader/u);
    assert.match(copy, /saved provider, model, Effort or Max state, current session Turbo setting/u);
    assert.match(copy, /title first reads Preparing/u);
    assert.match(copy, /Start or Resume disabled until the first audible sequence/u);
    assert.match(copy, /Ready now · buffering ahead/u);
    assert.match(copy, /Fully buffered/u);
    assert.match(copy, /Nothing auto-starts or dismisses the title card/u);
    assert.match(copy, /Waiting longer can reduce later latency/u);
    assert.match(copy, /human message, ruling, objection, verdict/u);
    assert.match(copy, /expected bot’s own in-world thinking animation/u);
    assert.match(copy, /never a modal or fullscreen loader/u);
    assert.match(copy, /failed deeper attempt never disables/u);
    assert.match(copy, /Auto stays Wide whenever nobody is speaking/u);
    assert.match(copy, /Choosing Resume strikes the visible gavel immediately for every role/u);
    assert.match(copy, /audible hit calls the camera to the Moderator/u);
    assert.match(copy, /visible Jury chamber follows the same handoff/u);
    assert.match(
      copy,
      /replays that saved line from its beginning with a short lead-in/u,
    );
    assert.match(copy, /As I was saying/u);
    assert.match(copy, /without rewriting the archived Proceedings text/u);
    assert.match(copy, /exact next juror, chamber discussion turn, ballot/u);
    assert.match(
      copy,
      /neither housekeeping beat enters the readable proceedings/u,
    );
    assert.match(copy, /brief Pause cooldown/u);
    assert.match(copy, /even while a line is still being heard or the next turn is preparing/u);
    assert.match(copy, /leaving an already-finished Debate does not try to save a recess/u);
    assert.match(
      copy,
      /A Copycat advocate repeats the other side’s latest heard public line verbatim/u,
    );
    assert.match(
      copy,
      /brief vocal Foley such as Hmm…, let me see…, or Nice!/u,
    );
    assert.match(
      copy,
      /If nobody on the other side has spoken yet, they originate one short first floor/u,
    );
    assert.match(
      copy,
      /If a public advocate line is clearly unintelligible—mumbled, garbled, or otherwise not a recognizable argument—the room reacts only after the line lands/u,
    );
    assert.match(copy, /repeated unintelligible advocacy raises gallery pressure/u);
    assert.match(copy, /ordinary eccentric speech does not trigger it/u);
    assert.match(
      copy,
      /When you are the Judge, PRISM never takes a procedural call from you/u,
    );
    assert.match(copy, /shorter than Judge intervention cooling/u);
    assert.match(
      copy,
      /cooldown governs semantic interventions within that gavel control, not audience order/u,
    );
    assert.match(copy, /End Debate skips the remaining rounds/u);
    assert.match(copy, /not to penalize unheard rounds/u);
    assert.match(copy, /automatically enters a dim chamber/u);
    assert.match(copy, /Four private leanings lead into short, routed, audible juror turns/u);
    assert.match(copy, /three after End Debate/u);
    assert.match(copy, /same saved voice and caption path/u);
    assert.doesNotMatch(copy, /choose Participate/u);
    assert.match(copy, /Deliberation and voting are automatic and unskippable/u);
    assert.match(copy, /cast final ballots one at a time/u);
    assert.match(copy, /Auto enters the four-seat chamber for leanings, deliberation, ballots, and the split/u);
    assert.match(copy, /Moderator records a fifth, final ballot last/u);
    assert.match(copy, /form short thoughts between public-floor turns/u);
    assert.match(copy, /bottom Jury widget until deliberation/u);
    assert.match(
      copy,
      /ellipsis beside a juror means a between-turn thought is waiting/u,
    );
    assert.match(copy, /hover it to read that opinion/u);
    assert.match(copy, /seats bot faces and frames around/u);
    assert.match(copy, /Each audible juror reads the same final reason/u);
    assert.match(copy, /as each final ballot is cast, its side appears/u);
    assert.match(copy, /running five-vote tally updates/u);
    assert.match(copy, /canonically silent juror still casts/u);
    assert.match(copy, /chamber is live and named but remains advisory/u);
    assert.match(copy, /bottom Jury widget stays up through the public floor/u);
    assert.match(copy, /When Auto enters the Jury chamber/u);
    assert.match(copy, /Verdict tab beside Case board/u);
    assert.match(copy, /Copy all data to clipboard, Copy Jury transcript, and Copy verbose transcript/u);
    assert.match(copy, /Copy case board copies that SMS-style claims thread/u);
    assert.match(
      copy,
      /Case Board panel keeps its own Copy case board control/u,
    );
    assert.doesNotMatch(copy, /Jury transcript remains directly copyable/u);
    assert.match(copy, /Coffee-style session summary/u);
    assert.match(copy, /temporary pick-a-bot inquiry chat/u);
    assert.match(copy, /Inquiry alcove with role-colored cast chips/u);
    assert.match(copy, /physical mark slides into the center pile/u);
    assert.match(copy, /only the bot opponent may react/u);
    assert.match(
      copy,
      /Spectator verdicts still let both bot advocates react/u,
    );
    assert.match(
      copy,
      /In Judge sessions, the human ruling is followed by both advocates’ reactions and an automatic neutral center close/u,
    );
    assert.match(
      copy,
      /After a Participant verdict, only the bot opponent may react before the bot Moderator\/Judge closes/u,
    );
    assert.match(copy, /Choose LOCAL or ONLINE in the navbar/u);
    assert.match(copy, /saved Auto routing priorities run first/u);
    assert.match(copy, /ONLINE ends with one bundled local attempt/u);
    assert.match(copy, /LOCAL evaluates only local Ollama models/u);
    assert.match(copy, /ONLINE evaluates only configured OpenAI and Anthropic models/u);
    assert.match(copy, /Refresh models re-runs discovery at runtime/u);
    assert.match(
      copy,
      /ONLINE Auto provider lean slider: middle is Balanced \(pure cost and speed\)/u,
    );
    assert.match(
      copy,
      /In LOCAL Auto, clicking the upright triangle gives a failed ignition/u,
    );
    assert.match(
      copy,
      /ignition cue sputters into smoke without switching models or enabling Turbo/u,
    );
    assert.match(
      copy,
      /In ONLINE Auto, clicking that triangle toggles Turbo through the same route as the Turbo shortcut/u,
    );
    assert.match(copy, /every generated statement and ballot records/u);
    assert.match(copy, /short title synthesized in the selected Rowdiness/u);
    assert.match(
      copy,
      /approximate active runtime from the saved presentation timeline/u,
    );
    assert.match(copy, /excluding generation waits, explicit recesses/u);
    assert.match(copy, /Use setup copies its motion, title, room settings/u);
    assert.match(copy, /Open proceedings also offer Restart/u);
    assert.match(copy, /Completed records never offer Restart/u);
    assert.match(copy, /currently selected model and routing remain in place/u);
    assert.match(copy, /whole chain fails/u);
    assert.match(copy, /LOCAL remains a hard offline guarantee/u);
    assert.match(copy, /Save Debate parks a ready setup in Archive Open/u);
    assert.match(copy, /Remove soft-cancels the proceeding and releases those sprites/u);
    assert.match(copy, /Start Debate launches now/u);
    assert.match(
      copy,
      /Start and Save stay locked until the motion, cast, consent, and explicit evidence choice are complete/u,
    );
    assert.match(copy, /Start then freezes that ordered chain/u);
    assert.match(
      copy,
      /LOCAL\/ONLINE, model, and Effort stay locked for the whole sit/u,
    );
    assert.match(
      copy,
      /quiet model · effort chip stays under the motion title/u,
    );
    assert.match(
      copy,
      /Auto chooses the Debate model once when the session is created/u,
    );
    assert.match(copy, /explicit current model replaces the setup model/u);
    assert.match(copy, /selector on Auto preserves the model already chosen/u);
    assert.match(
      copy,
      /visible gallery walk-in as its loading screen/u,
    );
    assert.match(
      copy,
      /gallery murmur starts quiet and swells with each arrival/u,
    );
    assert.match(
      copy,
      /bot thinking sounds stay muted until you begin/u,
    );
    assert.match(
      copy,
      /gallery walk in as the loader/u,
    );
    assert.match(
      copy,
      /local gavel assets, the Moderator.?s first voice, and the first camera beat prepare in parallel/u,
    );
    assert.match(
      copy,
      /after every gallery member is seated and the opening is hot/u,
    );
    assert.match(copy, /title card settle with intro music/u);
    assert.match(
      copy,
      /Choosing Start removes the title controls and cuts straight to the Moderator slamming the already-loaded gavel/u,
    );
    assert.match(
      copy,
      /Returning title cards list prepared turns/u,
    );
    assert.match(copy, /never replays the title card/u);
    assert.match(copy, /Pause sits beside the stage CC control/u);
    assert.doesNotMatch(copy, /instead of in the app chrome/u);
    assert.match(copy, /traditional three-bot majority/u);
    assert.match(
      copy,
      /Participant's bot Moderator\/Judge decides the result without inventing a PRISM ballot/u,
    );
    assert.match(
      copy,
      /frozen center authority always opens and closes the Debate/u,
    );
    assert.match(
      copy,
      /center Judge \/ Moderator seat, gives the automatic neutral introduction, then stays publicly silent and inactive until you act/u,
    );
    assert.match(
      copy,
      /visible gallery badge and four-bar meter move deterministically/u,
    );
    assert.match(
      copy,
      /Gavel is one context-aware physical room-control action/u,
    );
    assert.match(copy, /without stopping the speaker or reveal/u);
    assert.match(copy, /early strike earns only a brief awkward freeze/u);
    assert.match(copy, /saved order cue preserves its exact heard position/u);
    assert.match(copy, /staying out of Proceedings, copied records/u);
    assert.match(copy, /Space serves that ceremonial cue first/u);
    assert.match(copy, /single Gavel \x2f Space input follows the live floor/u);
    assert.match(copy, /Intervene while an advocate is speaking/u);
    assert.match(
      copy,
      /ordinary audience order when no semantic cutoff is available/u,
    );
    assert.match(
      copy,
      /same gavel falls back to non-interrupting audience order/u,
    );
    assert.match(copy, /During advocate overtime it becomes Call time/u);
    assert.match(copy, /press S or O without reaching for the buttons/u);
    assert.match(copy, /room controls stay locked/u);
    assert.match(
      copy,
      /Once Jury deliberation begins, the Jury owns the floor/u,
    );
    assert.match(
      copy,
      /unified Gavel, Space, End, and Skip actions are put away/u,
    );
    assert.match(copy, /End, and Skip actions are put away/u);
    assert.match(
      copy,
      /Pause preserves the exact juror or ballot/u,
    );
    assert.match(
      copy,
      /human-Judge session automatically activates the center seat for its neutral introduction/u,
    );
    assert.match(copy, /ceremonial cue waits for your strike/u);
    assert.match(
      copy,
      /interface stays clear while Auto silently cuts to one advocate and then the moderator/u,
    );
    assert.match(copy, /without inventing a PRISM ballot/u);
    assert.match(copy, /two-second procedural burst/u);
    assert.match(copy, /measured, firm, or aggravated call-time performance/u);
    assert.match(
      copy,
      /Extra strikes during the two-second smash window are local showmanship/u,
    );
    assert.match(copy, /Public prose arrives with the live voice/u);
    assert.match(copy, /Bot advocates use their actual animated bot/u);
    assert.match(copy, /Each visible podium carries its floor holder's glyph/u);
    assert.match(copy, /follows floor ownership rather than speech or prose/u);
    assert.match(
      copy,
      /Participant Forum actions and Turnabout actions rise in a full-width command deck/u,
    );
    assert.match(copy, /Auto is the quiet default camera/u);
    assert.match(copy, /cuts instantly/u);
    assert.match(
      copy,
      /If Auto has been on one speaker for a while, it cuts Wide to see the whole floor/u,
    );
    assert.match(
      copy,
      /sometimes glances at another participant for a few seconds even when they are not reacting/u,
    );
    assert.match(
      copy,
      /During long moderator monologues—openings, recess and resume calls/u,
    );
    assert.match(
      copy,
      /paced reveal beats: after the formal docket listing/u,
    );
    assert.match(
      copy,
      /without lingering on the final introducee/u,
    );
    assert.match(
      copy,
      /returns to the moderator before the floor is handed off/u,
    );
    assert.match(
      copy,
      /Evidence placed for the active turn can stay on the table without forcing Wide/u,
    );
    assert.match(
      copy,
      /Auto enters the chamber for leanings, deliberation, ballots, and the split as a required scene/u,
    );
    assert.match(copy, /Jury is not a camera you pick/u);
    assert.match(copy, /Choose a manual view to hold the shot/u);
    assert.match(copy, /only the heard fragment remains public/iu);
    assert.match(copy, /safe Markdown/u);
    assert.match(
      copy,
      /Debate time clock in the room counts up from when the chamber is live/u,
    );
    assert.match(copy, /never counts down a total runtime/u);
    assert.match(
      copy,
      /opens shortly after speech begins and streams with the heard words[\s\S]{0,80}stenographer lag/u,
    );
    assert.match(copy, /freezes during recess and before Spectator Start/u);
    assert.match(copy, /setting-independent per-line spoken durations/u);
    assert.match(copy, /Copy verbose transcript/u);
  });

  it("explains the Participant's sealed Jury camera", () => {
    const copy = MODE_TUTORIALS.debate.steps
      .map((step) => step.body)
      .join(" ");
    assert.match(copy, /Participants never mount this chamber/u);
    assert.match(copy, /Four private leanings lead into routed discussion and four final juror ballots/u);
    assert.match(copy, /Moderator then records a distinct fifth and final ballot/u);
    assert.match(copy, /speaks the verdict from that room/u);
    assert.match(copy, /faint muffled gallery remains audible through the wall/u);
    assert.match(copy, /collected together before you hear deliberation/u);
    assert.match(copy, /individual ballots remain private/u);
  });

  it("teaches Debate's start-frozen model contract", () => {
    const copy = MODE_TUTORIALS.debate.steps
      .map((step) => step.body)
      .join(" ");
    assert.match(copy, /Auto chooses the Debate model once when the session is created/u);
    assert.match(copy, /explicit current model replaces the setup model/u);
    assert.match(copy, /selector on Auto preserves the model already chosen/u);
    assert.match(copy, /every generation, including Spectator bake/u);
  });

  it("teaches audio-first Participant floor breaks with a separate slowed preparation window", () => {
    const caseBoardCopy =
      MODE_TUTORIALS.debate.steps.find(
        (step) =>
          step.targetSelector ===
          '[data-tutorial-target="debate-case-board-tab"]',
      )?.body ?? "";

    assert.match(caseBoardCopy, /two distinct ways to break/u);
    assert.match(
      caseBoardCopy,
      /composers accept @ to open a picker of frozen exhibits, Brave, Scholar, and URL sources/u,
    );
    assert.match(
      caseBoardCopy,
      /filter with @exhibit, @brave, or @scholar/u,
    );
    assert.match(caseBoardCopy, /four-card Producer deck/u);
    assert.match(caseBoardCopy, /continues at normal speed/u);
    assert.match(caseBoardCopy, /Rhetorical Gambits show only a tactic and intent/u);
    assert.match(caseBoardCopy, /1\/8-speed preparation interval/u);
    assert.match(caseBoardCopy, /opponent fades to mute/u);
    assert.match(caseBoardCopy, /transcript keeps advancing slowly/u);
    assert.match(caseBoardCopy, /up to three frozen evidence items/u);
    assert.match(caseBoardCopy, /before the canonical interruption changes/u);
    assert.match(caseBoardCopy, /audibly soft-cut at the latest audience-heard fragment/u);
    assert.match(caseBoardCopy, /immediate room reaction lands there too/u);
    assert.match(caseBoardCopy, /camera pans to PRISM · You/u);
    assert.match(caseBoardCopy, /independent procedural ruling/u);
    assert.match(caseBoardCopy, /persona-shaped decorum response/u);
    assert.match(caseBoardCopy, /opponent finishes a concise continuation/u);
    assert.match(caseBoardCopy, /Social persuasion and procedural merit remain separate/u);
    assert.match(caseBoardCopy, /typed-only 30-second window/u);
    assert.match(caseBoardCopy, /without a phantom call/u);
  });

  it("teaches the Participant rhetorical-gambit setup control", () => {
    const step = MODE_TUTORIALS.debate.steps.find(
      (candidate) => candidate.heading === "Choose how you break the floor",
    );
    assert.equal(
      step?.targetSelector,
      '[data-tutorial-target="debate-rhetorical-gambits"]',
    );
    assert.match(step?.body ?? "", /Rhetorical gambits is on by default/u);
    assert.match(step?.body ?? "", /Steer my debater accepts private direction/u);
    assert.match(step?.body ?? "", /Objection asks for a formal ruling/u);
    assert.match(step?.body ?? "", /Interject is a conversational floor-grab/u);
  });

  it("teaches the complete Participation difficulty, timing, persuasion, and evidence contract", () => {
    const copy = MODE_TUTORIALS.debate.steps
      .map((step) => step.body)
      .join(" ");

    assert.match(copy, /Coach, Standard, and Immersive difficulty/u);
    assert.match(copy, /changes only how much analysis you see/u);
    assert.match(copy, /Participation difficulty never changes that clock/u);
    assert.match(copy, /Parliamentary allows 15 seconds/u);
    assert.match(copy, /Structured 22/u);
    assert.match(copy, /Plainspoken 30/u);
    assert.match(copy, /Heated 40/u);
    assert.match(copy, /Free-for-all 50/u);
    assert.match(copy, /eight wall-clock seconds per announced floor second/u);
    assert.match(copy, /clocks advance at 1\/8 speed/u);
    assert.match(copy, /Rowdiness-based patience meter/u);
    assert.match(copy, /opponent offers a persona-shaped taunt/u);
    assert.match(copy, /“…What was it you said again\?”/u);
    assert.match(copy, /three randomized, unlabeled suggestions plus Make my own case/u);
    assert.match(copy, /response deck sits directly beneath the gallery/u);
    assert.match(copy, /choose a suggestion to expand and review its full text/u);
    assert.match(copy, /choosing a card never speaks it by itself/u);
    assert.match(copy, /opening, challenge, rebuttal, and closing/u);
    assert.match(copy, /Substantively using frozen evidence doubles that answer's signed impact/u);
    assert.match(copy, /persistent favorability balance/u);
    assert.match(copy, /argument, humor, confidence/u);
    assert.match(
      copy,
      /Spectator shows that same live favor bar between the two advocates/u,
    );
    assert.match(
      copy,
      /prepared gallery cannot jump the needle ahead of the floor/u,
    );
    assert.match(copy, /each Persona's ballot only within a bound/u);
    assert.match(copy, /five anonymous Jury leaning pips/u);
    assert.match(copy, /three recess requests between Pause and a confirmed Leave Debate/u);
    assert.match(copy, /Leave Debate stays above every live overlay and is never disabled/u);
    assert.match(copy, /click it once to arm the confirmation/u);
    assert.match(copy, /click Leave now for an instant return/u);
    assert.match(copy, /records the recess in the background without delaying the return/u);
    assert.match(copy, /full wall-clock input allowance/u);
    assert.match(copy, /system-note pause merely freezes the time that remained/u);
    assert.match(copy, /Crash or background recovery never spends a request/u);
    assert.match(copy, /third accepted recess creates a durable final-recess checkpoint/u);
    assert.match(copy, /each consecutive attempt drains more/u);
    assert.match(copy, /bonus time after later floor clocks expire/u);
    assert.match(copy, /rushes directly to an abbreviated Jury deliberation or their own ballot/u);
    assert.match(copy, /cannot be rewound to the final checkpoint/u);
    assert.match(copy, /Leave Debate with no recesses left is housekeeping/u);
    assert.match(copy, /not a fourth request/u);
    assert.match(copy, /reopening restores the final-recess checkpoint/u);
    assert.match(copy, /Choosing Resume strikes the visible gavel immediately/u);
    assert.match(copy, /gallery keeps murmuring until the gavel/u);
    assert.match(copy, /live room hushes for the Moderator/u);
    assert.doesNotMatch(copy, /Pause or Gavel to resume/u);
    assert.match(copy, /complete sentences copied as one exact contiguous passage/u);
    assert.match(copy, /nonadjacent splice is rejected/u);
    assert.match(copy, /without clipping a word/u);
    assert.match(copy, /metadata only/u);
    assert.match(copy, /never silently refetches or changes it after Start/u);
  });

  it("teaches audience order, semantic intervention, and ceremonial priority", () => {
    const gavelCopy =
      MODE_TUTORIALS.debate.steps.find(
        (step) =>
          step.targetSelector === '[data-tutorial-target="debate-judge-gavel"]',
      )?.body ?? "";
    assert.match(gavelCopy, /ceremonial cue waits for your strike/u);
    assert.match(
      gavelCopy,
      /interface stays clear while Auto silently cuts to one advocate and then the moderator/u,
    );
    assert.match(gavelCopy, /brief awkward freeze and spectator glances/u);
    assert.match(gavelCopy, /without stopping the speaker or reveal/u);
    assert.match(gavelCopy, /visible gallery badge and four-bar meter/u);
    assert.match(gavelCopy, /from every seat in the room/u);
    assert.match(
      gavelCopy,
      /murmur gathers from silence with the arriving seats/u,
    );
    assert.match(
      gavelCopy,
      /silent local gallery director watches only the recent audible public debate/u,
    );
    assert.match(gavelCopy, /none, laugh, gasp, or impressed/u);
    assert.match(gavelCopy, /explicit 1–3 intensity controls/u);
    assert.match(gavelCopy, /Most lines stay quiet/u);
    assert.match(gavelCopy, /LOCAL remains fully local/u);
    assert.match(gavelCopy, /bot Moderator sparsely strikes the gavel/u);
    assert.match(
      gavelCopy,
      /Heated or Daytime Showdown stays Restless long enough/u,
    );
    assert.match(gavelCopy, /deliberate inertia in both directions/u);
    assert.match(gavelCopy, /taper of stragglers/u);
    assert.match(gavelCopy, /repeat intervention strikes again/u);
    assert.match(gavelCopy, /I said order\. Silence\./u);
    assert.match(gavelCopy, /PRISM never takes that authority from you/u);
    assert.match(gavelCopy, /protected mix headroom/u);
    assert.match(gavelCopy, /never inserts \*speaks loudly\*/u);
    assert.match(gavelCopy, /never needs to shout/u);
    assert.match(gavelCopy, /control attached directly to the gallery/u);
    assert.match(gavelCopy, /Space serves that ceremonial cue first/u);
    assert.match(
      gavelCopy,
      /single Gavel \x2f Space input follows the live floor/u,
    );
    assert.match(
      gavelCopy,
      /same gavel falls back to non-interrupting audience order/u,
    );
    assert.match(gavelCopy, /amber countdown explains when Intervene returns/u);
    assert.match(
      gavelCopy,
      /chamber explains why instead of failing silently/u,
    );
    assert.match(gavelCopy, /becomes Call time/u);
    assert.match(gavelCopy, /literally shouts “Objection!”/u);
    assert.match(gavelCopy, /timed Sustained \/ Overruled choice/u);
    assert.match(gavelCopy, /Jury owns the floor/u);

    const recordCopy =
      MODE_TUTORIALS.debate.steps.find(
        (step) =>
          step.targetSelector ===
          '[data-tutorial-target="debate-copy-all-review-data"]',
      )?.body ?? "";
    assert.match(recordCopy, /without inventing a PRISM ballot/u);
    assert.match(recordCopy, /Copy all data to clipboard builds one review paste/u);
  });

  it("teaches Debate's role-aware actor casting", () => {
    const castCopy =
      MODE_TUTORIALS.debate.steps.find(
        (step) =>
          step.targetSelector === '[data-tutorial-target="debate-cast"]',
    )?.body ?? "";
    assert.match(castCopy, /Surprise me/u);
    assert.match(castCopy, /Every unselected Debate seat already rests on Surprise me/u);
    assert.match(castCopy, /resolves during the willingness check/u);
    assert.match(castCopy, /role is the only required choice/u);
    assert.match(castCopy, /left on Surprise me is randomly assigned when you press Compile the case/u);
    assert.match(castCopy, /every manual choice stays put/u);
    assert.match(castCopy, /vertical hue lens/u);
    assert.match(castCopy, /Prism takes the center Judge \/ Moderator seat/u);
    assert.match(castCopy, /automatic neutral introduction/u);
    assert.match(castCopy, /Choose the two advocates/u);
    const whodunnitCopy =
      MODE_TUTORIALS.debate.steps.find((step) =>
        step.body.includes("Choose Whodunnit?"),
      )?.body ?? "";
    assert.match(whodunnitCopy, /play the prosecution/u);
    assert.match(whodunnitCopy, /four explicitly seated jurors/u);
    assert.match(whodunnitCopy, /durable case/u);
    assert.match(whodunnitCopy, /shallow-isometric mansion/u);
    assert.match(whodunnitCopy, /Copy verbose transcript/u);
    assert.match(whodunnitCopy, /Copy all review data/u);
    assert.match(whodunnitCopy, /never the sealed Case Bible/u);
    assert.match(whodunnitCopy, /Every suspect, including the accused, testifies/u);
    assert.match(whodunnitCopy, /Press for free/u);
    assert.match(whodunnitCopy, /Present an admitted evidence item/u);
    assert.match(whodunnitCopy, /Restart investigation/u);
    assert.match(whodunnitCopy, /Restart court/u);
    assert.match(whodunnitCopy, /Court-only cases offer only the court restart/u);
    assert.match(
      castCopy,
      /Your seat & the Jury reveals Participant and Spectator roles/u,
    );
    const seatCopy =
      MODE_TUTORIALS.debate.steps.find(
        (step) =>
          step.targetSelector === '[data-tutorial-target="debate-seat"]',
      )?.body ?? "";
    assert.match(seatCopy, /Moderator’s exact working title/u);
    assert.match(seatCopy, /setup never renames the Judge/u);
    assert.doesNotMatch(seatCopy, /name both public teams and the public moderator/u);
    assert.match(seatCopy, /four juror seats default to Surprise/u);
    assert.match(seatCopy, /pin any seat from the Library/u);
    assert.match(seatCopy, /Moderator records the fifth and final ballot/u);
    const juryChamberCopy =
      MODE_TUTORIALS.debate.steps.find(
        (step) =>
          step.targetSelector ===
          '[data-tutorial-target="debate-jury-chamber"]',
      )?.body ?? "";
    assert.match(juryChamberCopy, /public gallery strip hides/u);
    assert.match(juryChamberCopy, /same circular overview table from the Wide Forum shot/u);
    assert.match(
      juryChamberCopy,
      /same CC control that toggles Forum captions also shows or hides spoken Jury chamber subtitles/u,
    );
    assert.match(juryChamberCopy, /speaks the verdict from that room/u);
    assert.match(
      juryChamberCopy,
      /faint muffled gallery remains audible through the wall/u,
    );
  });

  it("teaches the non-blocking Coffee Group identity synthesis flow", () => {
    const groupCreationCopy = MODE_TUTORIALS.coffee.steps[0]?.body ?? "";
    assert.match(groupCreationCopy, /saves the table immediately/u);
    assert.match(groupCreationCopy, /Name, one-sentence Ethos/u);
    assert.match(groupCreationCopy, /character-free Atmosphere/u);
    assert.match(
      groupCreationCopy,
      /softly shapes topic ideas, routing, and replies/u,
    );
    assert.match(groupCreationCopy, /independently retryable/u);
  });

  it("explains that Coffee cross-talk controls audible backchannels", () => {
    const joinCopy = MODE_TUTORIALS.coffee.steps.at(-1)?.body ?? "";
    assert.match(joinCopy, /brief spoken acknowledgement/u);
    assert.match(joinCopy, /Cross-talk setting/u);
    assert.match(joinCopy, /audible overlaps/u);
    assert.match(joinCopy, /ordinary automatic turn-stealing cut-in is rare/u);
    assert.match(joinCopy, /Pile-up alone never authorizes one/u);
    assert.match(
      joinCopy,
      /prerecorded throat-clear, swallow, lip smack, sigh, or inhale/u,
    );
    assert.match(
      joinCopy,
      /independent of its speaking style or voice engine/u,
    );
    assert.match(joinCopy, /restrained ElevenLabs vocal reaction/u);
    assert.match(joinCopy, /inferred listeners remain visual only/u);
    assert.match(
      joinCopy,
      /one bot cuts off another.*interrupter speaks a short hold-on.*interrupted bot takes a brief processing beat.*annoyed, abandoned ending/u,
    );
    assert.match(
      joinCopy,
      /hold-on over the outgoing voice before that voice releases/u,
    );
    assert.match(joinCopy, /reject the cut-in and immediately reclaim/u);
    assert.match(joinCopy, /only the words the table actually heard/u);
    assert.match(joinCopy, /one protected handoff/u);
    assert.match(joinCopy, /Repeated cutoffs build session-local irritation/u);
    assert.match(joinCopy, /reclaim grows more likely/u);
    assert.match(joinCopy, /short verbal snark/u);
    assert.match(joinCopy, /intentional silent social beat/u);
    assert.match(joinCopy, /without voice or mouth movement/u);
    assert.match(joinCopy, /never appears or counts as literal transcript dialogue/u);
    assert.match(joinCopy, /up to four ordinary turns/u);
    assert.match(joinCopy, /requires a substantive reply/u);
    assert.match(joinCopy, /timed unaware Mute keeps precedence/u);
    assert.match(joinCopy, /sparse mic-ready breath/u);
  });

  it("teaches pot-only live Coffee and Default Prism on replay", () => {
    const copy = MODE_TUTORIALS.coffee.steps
      .map((step) => `${step.heading} ${step.body}`)
      .join(" ");
    assert.match(copy, /remain off camera during the live table/u);
    assert.match(copy, /no player avatar or mug/u);
    assert.match(copy, /Replay seats you as Default Prism/u);
    assert.match(copy, /Drag the pot/u);
    assert.match(copy, /no waiter, barista, or service bot/u);
    assert.match(copy, /two or three table replies/u);
    assert.match(copy, /visible water glass with normal depletion and refill/u);
    assert.match(copy, /water carafe/u);
    assert.match(copy, /clock measures active table presentation/u);
    assert.match(copy, /background lookahead beneath an audible line still counts/u);
    assert.match(copy, /foreground generation leaves the floor waiting/u);
    assert.match(
      copy,
      /recognized asterisk cue such as \*yells\*[\s\S]*ElevenLabs performance direction/u,
    );
    assert.match(
      copy,
      /fart, burp, and cough actions play their bundled Foley/u,
    );
    assert.doesNotMatch(
      copy,
      /Have something made|Make the rounds|I’ll take the…|Surprise me|Standard house blend/u,
    );
    assert.equal(
      MODE_TUTORIALS.coffee.steps.some(
        (step) =>
          step.targetSelector === '[data-tutorial-target="coffee-bar-ritual"]',
      ),
      false,
    );
  });

  it("teaches Coffee's faithful audio-master replay", () => {
    const copy = MODE_TUTORIALS.coffee.steps.at(-1)?.body ?? "";
    assert.match(copy, /one faithful audio master/u);
    assert.match(copy, /once at normal speed/u);
    assert.match(copy, /thinking intervals/u);
    assert.match(copy, /thinking spinners/u);
    assert.match(copy, /does not re-synthesize voices/u);
    assert.match(copy, /or generate a video/u);
    assert.match(copy, /without its exact master remains transcript-only/u);
    assert.match(copy, /offers Coffee home to return to setup/u);
    assert.match(copy, /one readable transcript download/u);
  });

  it("teaches local Coffee listener chatter and the ducked environmental bed", () => {
    const copy = MODE_TUTORIALS.coffee.steps.map((step) => step.body).join(" ");
    assert.match(copy, /local, non-musical coffee-shop environment/u);
    assert.match(copy, /ducks while foreground voices speak/u);
    assert.match(copy, /tiny local Hmm, Mm-hm, I see, or Right/u);
    assert.match(copy, /never takes the turn or enters the transcript/u);
    assert.match(copy, /Departed, absent, speaking, thinking, sipping, hard-muted/u);
  });

  it("explains foreground generation clock holds without discounting lookahead", () => {
    const coffee = MODE_TUTORIALS.coffee.steps
      .map((step) => step.body)
      .join(" ");
    const signal =
      MODE_TUTORIALS.botcast.steps.find(
        (step) => step.heading === "Produce from the control room",
      )?.body ?? "";
    assert.match(coffee, /clock measures active table presentation/u);
    assert.match(coffee, /background lookahead beneath an audible line still counts/u);
    assert.match(coffee, /foreground generation leaves the floor waiting/u);
    assert.match(signal, /on-air clock measures active presentation/u);
    assert.match(signal, /Background lookahead under an audible line still counts/u);
    assert.match(
      signal,
      /foreground model readiness, reasoning, generation, or blocking voice preparation pauses the clock/u,
    );
  });

  it("teaches the shared voice behavior beside routing", () => {
    const voiceCopy =
      MODE_TUTORIALS.zen.steps.find(
        (step) => step.heading === "Choose how replies recover",
      )?.body ?? "";
    assert.match(
      voiceCopy,
      /Voice remains independent from text routing/u,
    );
    assert.match(voiceCopy, /With Voice Effects on/u);
    assert.match(voiceCopy, /mic-ready breath/u);
  });

  it("teaches Zen that action drafts and action-only exchanges stay private", () => {
    for (const mode of ["zen", "chat"] as const) {
      const copy = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(copy, /Action drafts stay private until Send/u);
      assert.match(
        copy,
        /bot's action response appear on the canvas as an ephemeral exchange and never enter history or memory/u,
      );
    }
  });

  it("teaches Slate as a directed document workflow with stable targets", () => {
    const headings = MODE_TUTORIALS.slate.steps.map((step) => step.heading);
    const selectors = MODE_TUTORIALS.slate.steps.map(
      (step) => step.targetSelector,
    );
    assert.deepEqual(headings, [
      "Begin with pages or a spark",
      "Choose one shared route",
      "Find the scene in Story Map",
      "Write in the manuscript",
      "Direct one move",
      "Keep one Inspector in view",
      "Open tools only when needed",
      "Talk beside the document",
    ]);
    assert.deepEqual(selectors, [
      '[data-tutorial-target="slate-create-project"]',
      '[data-tutorial-target="auto-response-mode"]',
      '[data-tutorial-target="slate-structure"]',
      '[data-tutorial-target="slate-manuscript"]',
      '[data-tutorial-target="slate-direction"]',
      '[data-tutorial-target="slate-inspector"]',
      '[data-tutorial-target="slate-project-tools"]',
      '[data-tutorial-target="prism-companion"]',
    ]);
    const copy = MODE_TUTORIALS.slate.steps.map((step) => step.body).join(" ");
    assert.match(copy, /\{wildcards\}/u);
    assert.match(
      copy,
      /remain only on spark-led templates, not in the companion composer/u,
    );
    assert.match(
      copy,
      /clear chapter headings become focused imported sections/u,
    );
    assert.match(copy, /ambiguous formatting stays byte-for-byte/u);
    assert.match(copy, /Mirror setup is never required/u);
    assert.match(copy, /acts, chapters, and scenes as a hierarchy/u);
    assert.match(copy, /TipTap section canvas/u);
    assert.match(copy, /Human prose autosaves without waiting for AI/u);
    assert.match(copy, /Beat, Passage, or Scene/u);
    assert.match(copy, /three canon-grounded paths plus Describe the vibe/u);
    assert.match(
      copy,
      /exactly three concrete choices plus Describe the vibe/u,
    );
    assert.match(copy, /direct writing never blocks/u);
    assert.match(copy, /writer-approved canon/u);
    assert.match(copy, /lock it against inference/u);
    assert.match(copy, /Observed track remains accepted-prose evidence/u);
    assert.match(copy, /LOCAL and ONLINE control sets the hard privacy lane/u);
    assert.match(copy, /Model defaults to Auto/u);
    assert.match(copy, /suitable model and Effort for each request/u);
    assert.match(copy, /Slate Review export/u);
    assert.match(copy, /never hidden reasoning/u);
    assert.match(copy, /it never edits the document/u);
  });

  it("teaches Zen navigation as relationship-specific Homes", () => {
    const chooseRelationship = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Choose a relationship",
    );
    const groupRoom = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Shape a saved group's room",
    );
    const continueHome = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Continue this Home",
    );
    const context = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Let context breathe",
    );

    assert.ok(chooseRelationship);
    assert.equal(chooseRelationship.clickLabel, "a PRISM or persona tile");
    assert.equal(
      chooseRelationship.targetSelector,
      '[data-tutorial-target="chat-bot-picker"]',
    );
    assert.match(chooseRelationship.body, /focus that relationship’s Home/u);
    assert.match(
      chooseRelationship.body,
      /select the focused tile again to unfocus it; open its mini bot avatar for customization/u,
    );
    assert.match(
      chooseRelationship.body,
      /jump straight to any Avatar Studio section/u,
    );
    assert.equal(continueHome?.heading, "Continue this Home");
    assert.equal(continueHome?.clickLabel, "the message box at the bottom");
    assert.equal(
      continueHome?.targetSelector,
      '[data-tutorial-target="composer"]',
    );
    assert.match(
      continueHome?.body ?? "",
      /Opening a persona Home from All Bots or its grouped conversation heading continues that Home's latest saved chat/u,
    );
    assert.match(
      continueHome?.body ?? "",
      /header bot picker invites them into this same conversation/u,
    );
    assert.match(
      continueHome?.body ?? "",
      /Random, New, Intro, or Off handoff/u,
    );
    assert.match(
      continueHome?.body ?? "",
      /Wield Prism onto the message box/u,
    );
    assert.match(
      continueHome?.body ?? "",
      /transcript Chat without changing the conversation, selected Speech Type, Atmosphere, or active reply/u,
    );
    assert.match(
      continueHome?.body ?? "",
      /Speech Type locks when you send and remains locked until the bot's full reply has reached the canvas/u,
    );
    assert.doesNotMatch(
      continueHome?.body ?? "",
      /forces Voice to Mute|return to immersive Zen, where .* resumes automatically/u,
    );
    assert.equal(
      groupRoom?.targetSelector,
      '[data-tutorial-target="chat-group-atmosphere"]',
    );
    assert.match(
      context?.body ?? "",
      /^Recent messages stay visible while older continuity for this Home is carried through summaries and memory\./u,
    );
  });

  it("teaches that ordinary Home visits resume while New chat remains explicit", () => {
    const continueHome = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Continue this Home",
    );

    assert.match(
      continueHome?.body ?? "",
      /continues that Home's latest saved chat/u,
    );
    assert.match(
      continueHome?.body ?? "",
      /use its \+ or New chat only when you deliberately want a separate conversation/u,
    );
  });

  it("keeps Zen history intact while teaching the deliberate undo path", () => {
    const correction = MODE_TUTORIALS.chat.steps.find(
      (step) => step.heading === "Keep the moment honest",
    );

    assert.match(correction?.body ?? "", /Type \$undo/);
    assert.doesNotMatch(correction?.body ?? "", /fork|resend|delete/i);
    assert.equal(
      correction?.targetSelector,
      '[data-tutorial-target="composer"]',
    );
  });

  it("introduces saved group Atmospheres behind the living club", () => {
    const atmosphere = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Shape a saved group's room",
    );
    assert.match(atmosphere?.body ?? "", /room Atmosphere/u);
    assert.match(atmosphere?.body ?? "", /every valid member is present at once/u);
    assert.match(atmosphere?.body ?? "", /grid remains the fixed, fully interactive center/u);
    assert.match(atmosphere?.body ?? "", /drift calmly like an aquarium/u);
    assert.match(atmosphere?.body ?? "", /Mini avatars/u);
    assert.match(atmosphere?.body ?? "", /Micro avatars/u);
    assert.match(atmosphere?.body ?? "", /Reduced Motion pause/u);
    assert.match(atmosphere?.body ?? "", /never rotates, paginates, or hides members/u);
    assert.doesNotMatch(atmosphere?.body ?? "", /waiting room|Listen up/u);
    assert.equal(
      atmosphere?.targetSelector,
      '[data-tutorial-target="chat-group-atmosphere"]',
    );
  });

  it("teaches spectrum tiles and exclusive leaders together", () => {
    const identity = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Recognize the group",
    );

    assert.match(identity?.body ?? "", /Spectrum Tile/u);
    assert.match(identity?.body ?? "", /Atmosphere/u);
    assert.match(identity?.body ?? "", /Promote to leader/u);
    assert.match(identity?.body ?? "", /simply reassigns leadership/u);
    assert.match(identity?.body ?? "", /without placing a badge/u);
    assert.equal(
      identity?.targetSelector,
      '[data-tutorial-target="chat-group-spectrum-tile"]',
    );
  });

  it("distinguishes Coffee privacy routing from contextual Auto", () => {
    const setup = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Set the table",
    );
    const routing = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Keep the table moving",
    );

    assert.match(
      setup?.body ?? "",
      /Auto is the default model/,
    );
    assert.match(
      setup?.body ?? "",
      /selected LOCAL or ONLINE privacy lane/,
    );
    assert.match(setup?.body ?? "", /Use setup restores/);
    assert.match(setup?.body ?? "", /topic for an editable retry/);
    assert.match(
      setup?.body ?? "",
      /current model and response routing stay selected/,
    );
    assert.match(setup?.body ?? "", /saved Auto routing priorities run first/);
    assert.match(setup?.body ?? "", /every other eligible model in that lane/);
    // The Auto/Timed length control is gone: every table is open-ended and the
    // player ends it. The copy must promise that without any hidden ceiling.
    assert.match(setup?.body ?? "", /Every table is open-ended/);
    assert.match(setup?.body ?? "", /no countdown and no hidden ceiling/);
    assert.doesNotMatch(setup?.body ?? "", /hidden 30-minute ceiling/);
    assert.doesNotMatch(setup?.body ?? "", /switch to Timed/);
    assert.match(
      routing?.body ?? "",
      /Leave Model on Auto/,
    );
    assert.match(routing?.body ?? "", /suitable model and Effort for each table turn/);
    assert.match(routing?.body ?? "", /refreshes that same privacy lane once/);
    assert.match(routing?.body ?? "", /separate Images provider/);
    assert.match(routing?.body ?? "", /voice preference/);
    assert.match(
      routing?.body ?? "",
      /freezes the selected speaking type and engine/u,
    );
    assert.match(routing?.body ?? "", /new session opens at topic selection/u);
    assert.match(routing?.body ?? "", /hides the shared navbar and locks routing, model, Effort, Voice/u);
    assert.match(
      routing?.body ?? "",
      /quiet model · effort chip stays with the topic/u,
    );
    assert.match(
      routing?.body ?? "",
      /Auto still chooses model and Effort for each table turn/u,
    );
    assert.match(routing?.body ?? "", /Recorded replay/u);
    assert.match(routing?.body ?? "", /Finding another route/u);
    assert.match(routing?.body ?? "", /skip one unavailable autonomous speaker/u);
    assert.match(routing?.body ?? "", /Switch model or End session/u);
    assert.match(routing?.body ?? "", /fixed model is retried once without substitution/u);
    assert.match(routing?.body ?? "", /unsent player draft remains intact/u);
    assert.match(
      routing?.body ?? "",
      /entire utility strip for the table/u,
    );
    assert.match(
      routing?.body ?? "",
      /Only a terminal model failure temporarily unlocks the model picker/u,
    );
    assert.doesNotMatch(
      routing?.body ?? "",
      /routing, model, Effort, Voice[^.]*remain available/u,
    );
  });

  it("explains frozen server-authoritative Auto provenance", () => {
    const copy = MODE_TUTORIALS.zen.steps.map((step) => step.body).join(" ");
    assert.match(copy, /Auto → Awaiting first turn/u);
    assert.match(copy, /it never substitutes a preview/u);
    assert.match(copy, /later route cannot rewrite history/u);
  });

  it("explains that ready Powers can change a bot's lived Coffee context", () => {
    const [table] = MODE_TUTORIALS.coffee.steps;
    assert.match(
      table?.body ?? "",
      /who they notice, answer, remember, privately read/u,
    );
    assert.match(table?.body ?? "", /pull the room's attention/u);
    assert.match(table?.body ?? "", /whether they touch their coffee at all/u);
  });

  it("teaches shared Chat/Zen voice separately from response and image routing", () => {
    const routing = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Choose how replies recover",
    );
    assert.match(
      routing?.body ?? "",
      /saved Auto routing priorities run first/,
    );
    assert.match(routing?.body ?? "", /Auto is the default model inside either lane/u);
    assert.match(
      routing?.body ?? "",
      /Every recovery uses None for speed/u,
    );
    assert.match(
      routing?.body ?? "",
      /Image generation keeps its own LOCAL\/ONLINE choice/,
    );
    assert.match(routing?.body ?? "", /Voice remains independent from text routing/u);
    assert.match(
      routing?.body ?? "",
      /Chat and Zen share your saved English, Premium, Babble, or Bottish choice, while LOCAL hides Premium from the picker/u,
    );
    assert.match(
      routing?.body ?? "",
      /locks the selected type and engine when you send/u,
    );
    const automaticThinkingSfx = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Hear each bot think",
    );
    assert.match(
      automaticThinkingSfx?.body ?? "",
      /one of four built-in PRISM/,
    );
    assert.match(automaticThinkingSfx?.body ?? "", /Computer calculating/);
    assert.match(automaticThinkingSfx?.body ?? "", /vocal Action pack/);
    assert.doesNotMatch(
      automaticThinkingSfx?.body ?? "",
      /Calibrate English pacing/,
    );
    assert.match(automaticThinkingSfx?.body ?? "", /Premium ElevenLabs voice/);
    assert.match(automaticThinkingSfx?.body ?? "", /Corporality/);
    assert.match(automaticThinkingSfx?.body ?? "", /while thinking/);
    assert.match(
      automaticThinkingSfx?.body ?? "",
      /follows that bot’s voice mute and volume/u,
    );
    assert.match(
      automaticThinkingSfx?.body ?? "",
      /quiet 100% is the former physical 20% level/u,
    );
    assert.match(
      automaticThinkingSfx?.body ?? "",
      /thinking playback is reduced to 35% of that already-quiet level app-wide/u,
    );
    assert.match(
      automaticThinkingSfx?.body ?? "",
      /ElevenLabs is connected and ONLINE/,
    );
    assert.match(
      automaticThinkingSfx?.body ?? "",
      /manual, AI-generated, or Marketplace/,
    );
    assert.match(
      automaticThinkingSfx?.body ?? "",
      /restore the PRISM default, or mute it/,
    );
  });

  it("teaches refreshing Coffee prompts before choosing the spark", () => {
    const topicStep = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Choose the spark",
    );

    assert.match(topicStep?.body ?? "", /four prompts created for this group/);
    assert.match(
      topicStep?.body ?? "",
      /choose New topics to make a fresh set grounded in the seated personas/,
    );
    assert.match(topicStep?.body ?? "", /table stays waiting until you choose one/);
    assert.match(
      topicStep?.body ?? "",
      /shared navbar hides as soon as this new-session topic picker opens/,
    );
    assert.match(topicStep?.body ?? "", /short branded Coffee curtain/);
    assert.match(topicStep?.body ?? "", /short cleaned title for that topic/);
    assert.match(topicStep?.body ?? "", /Hover the title to reread the original prompt/);
    assert.match(topicStep?.body ?? "", /only the seated bots who were actually there/u);
    assert.match(topicStep?.body ?? "", /never coached to fake a memory/u);
    assert.match(
      topicStep?.body ?? "",
      /End session lives in that table chrome from this waiting screen onward/,
    );
    assert.match(
      topicStep?.body ?? "",
      /Leaving here discards the empty placeholder instead of adding a session to Recent sessions/,
    );
    assert.match(topicStep?.clickLabel ?? "", /New topics/);
  });

  it("explains the shared Coffee topic and Table Talk rail", () => {
    const joinStep = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Join the conversation",
    );

    assert.match(joinStep?.body ?? "", /Poll votes and team choices share/);
    assert.match(joinStep?.body ?? "", /directly addressed bot/u);
    assert.match(
      joinStep?.body ?? "",
      /without taking a turn or entering the transcript/u,
    );
    assert.match(
      joinStep?.body ?? "",
      /drag its left edge or the topic divider/,
    );
    assert.match(
      joinStep?.body ?? "",
      /The table composer is ordinary conversation; Prompt Center prompts, commands, and wildcards stay in immersive Zen/u,
    );
  });

  it("explains Coffee's live off-camera player and Default Prism replay seat", () => {
    const joinStep = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Join the conversation",
    );

    assert.match(
      joinStep?.body ?? "",
      /clear table goodbye ends the session naturally/u,
    );
    assert.match(
      joinStep?.body ?? "",
      /closes the table without adding player dialogue/u,
    );
    assert.match(
      joinStep?.body ?? "",
      /final farewell is visible, voiced, and replayed without becoming a new floor turn/u,
    );
    assert.match(
      joinStep?.body ?? "",
      /remain off camera during the live table/u,
    );
    assert.match(joinStep?.body ?? "", /Replay seats you as Default Prism/u);
    assert.match(joinStep?.body ?? "", /your Default Prism seat/u);
    assert.doesNotMatch(joinStep?.body ?? "", /Prism leave first/u);
    assert.match(joinStep?.body ?? "", /each bot physically depart/u);
  });

  it("explains automatic Signal audio quality and selective Premium repair", () => {
    const replayStep = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Watch the saved cut",
    );
    const copy = replayStep?.body ?? "";

    assert.match(copy, /guest portrait along the card’s right edge/u);
    assert.match(copy, /click, right-click, or long-press a Library guest/u);
    assert.match(copy, /recorded voice provenance/u);
    assert.match(copy, /already marked Premium audio and needs no extra step/u);
    assert.match(copy, /Repair voice action sends only the fallback line/u);
    assert.match(copy, /Upgrade voices sends only those non-Premium lines/u);
    assert.match(copy, /selective character, line, and request estimate/u);
    assert.match(copy, /without regeneration or rebilling/u);
    assert.match(copy, /immutable Original broadcast/u);
    assert.match(copy, /Hard LOCAL mode keeps the passive provenance status/u);
  });

  it("teaches neutral listener beats, explicit reaction cuts, and the formal Signal close", () => {
    const camera =
      MODE_TUTORIALS.botcast.steps.find((step) => step.heading === "Direct the live cut")
        ?.body ?? "";
    const controlRoom =
      MODE_TUTORIALS.botcast.steps.find(
        (step) => step.heading === "Produce from the control room",
      )?.body ?? "";
    assert.match(
      camera,
      /interruption clips under 2\.5 seconds stay off-camera/u,
    );
    assert.match(
      camera,
      /social-silence beat belongs to the silent bot on camera/u,
    );
    assert.match(
      camera,
      /Ordinary listener beats stay language-free in the room mix/u,
    );
    assert.match(
      controlRoom,
      /low-key nod, expression, or neutral nonverbal Foley/u,
    );
    assert.match(
      controlRoom,
      /Semantic cut-ins belong only to an explicit Power or Producer interruption/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps.find(
        (step) => step.heading === "Give the studio an atmosphere",
      )?.body ?? "",
      /never synthesizes a new ident or room loop when an episode begins[\s\S]*cached neutral room Foley[\s\S]*never warm new speech/u,
    );
    assert.match(
      controlRoom,
      /Ordinary deterministic listener beats stay language-free, never take transcript ownership or interrupt the primary turn/u,
    );
    assert.match(
      controlRoom,
      /Semantic cut-ins belong only to an explicit Power or Producer interruption; only a cut-in that actually becomes audible briefly lowers the primary voice before restoring it/u,
    );
    assert.match(
      controlRoom,
      /formal closing beat[\s\S]*thank the guest and the audience/u,
    );
  });

  it("clamps restored progress to a valid step", () => {
    assert.equal(modeTutorialStep("zen", -1).heading, "Choose a relationship");
    assert.equal(
      modeTutorialStep("coffee", 99).heading,
      "Join the conversation",
    );
    assert.equal(
      modeTutorialStep("botcast", 99).heading,
      "Watch the saved cut",
    );
    assert.equal(
      modeTutorialStep("slate", 99).heading,
      "Talk beside the document",
    );
  });

  it("explains shared mic-ready breaths without adding a setup gate", () => {
    const zenRoutingCopy =
      MODE_TUTORIALS.zen.steps.find(
        (step) => step.heading === "Choose how replies recover",
      )?.body ?? "";
    assert.match(zenRoutingCopy, /Voice Effects on/u);
    assert.match(zenRoutingCopy, /mic-ready breath/u);
    assert.match(
      zenRoutingCopy,
      /punctuation pauses stay quiet/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps
        .map((step) => step.body)
        .join(" "),
      /punctuation pauses stay quiet/u,
    );
    const signalVoiceCopy =
      MODE_TUTORIALS.botcast.steps.find(
        (step) => step.heading === "Choose how the bots speak",
      )?.body ?? "";
    assert.match(signalVoiceCopy, /saved episodes choose them deterministically on replay/u);
  });

  it("explains relative avatar-size Powers across live bot modes", () => {
    for (const mode of ["zen", "chat", "coffee"] as const) {
      const copy = MODE_TUTORIALS[mode].steps[0]?.body ?? "";
      assert.match(copy, /Microscopic/u);
      assert.match(copy, /Tiny/u);
      assert.match(copy, /Small/u);
      assert.match(copy, /Large/u);
      assert.match(copy, /Giant/u);
      assert.match(copy, /Colossal/u);
    }
    const signalCopy = signalPowersTutorialBody();
    assert.match(signalCopy, /Microscopic/u);
    assert.match(signalCopy, /Colossal/u);
    assert.match(signalCopy, /300% edge-cropped/u);
    assert.match(signalCopy, /Invisible fully hides the body and lights/u);
  });

  it("teaches prompt-authored sight and hearing exclusions in social modes", () => {
    for (const mode of ["coffee", "botcast"] as const) {
      const copy = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(copy, /plain-language Power prompt/u);
      assert.match(copy, /sight and hearing separately/u);
      assert.match(copy, /excluded bot stays excluded/u);
    }
  });

  it("explains that Auto requires substantive interview progress", () => {
    const setupCopy = signalPowersTutorialBody();
    assert.match(setupCopy, /substantive guest answers/u);
    assert.match(setupCopy, /repeat a question/u);
    assert.match(setupCopy, /do not count as interview progress/u);
  });

  it("teaches hard-speech Producer-guest experiments instead of blocking them", () => {
    const setupCopy = signalPowersTutorialBody();
    assert.match(
      setupCopy,
      /Hard mute and echo hosts can still take a Producer guest/u,
    );
    assert.match(
      setupCopy,
      /privately authors a normal opening[\s\S]*timed periods and an elapsed cue/u,
    );
    assert.match(
      setupCopy,
      /mirrors the Producer's last public answer exactly/u,
    );
    assert.match(setupCopy, /instead of setup blocking the experiment/u);
    assert.doesNotMatch(
      setupCopy,
      /cannot run the autonomous question contract/u,
    );
  });

  it("explains addressed fandom without weakening player or bot agency", () => {
    assert.match(MODE_TUTORIALS.zen.steps[0]?.body ?? "", /Obsessed persona/u);
    assert.match(MODE_TUTORIALS.chat.steps[0]?.body ?? "", /Obsessed bot/u);
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /player or peer/u);
    assert.match(
      signalPowersTutorialBody(),
      /peer or audience/u,
    );
    assert.match(
      MODE_TUTORIALS.zen.steps[0]?.body ?? "",
      /Shapeshifter sincerely becomes/u,
    );
    assert.match(
      MODE_TUTORIALS.chat.steps[0]?.body ?? "",
      /Shapeshifter sincerely becomes/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /Shapeshifter sincerely becomes/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Shapeshifter sincerely becomes/u,
    );
    const copy = [
      MODE_TUTORIALS.zen.steps[0]?.body,
      MODE_TUTORIALS.chat.steps[0]?.body,
      MODE_TUTORIALS.coffee.steps[0]?.body,
      signalPowersTutorialBody(),
    ].join(" ");
    assert.match(copy, /agency|no control/iu);
    assert.match(copy, /privacy|private knowledge/iu);
    assert.match(copy, /safety/iu);
  });

  it("explains visible fresh-contact resets and simulation conversion across Power-aware modes", () => {
    const copies = [
      MODE_TUTORIALS.zen.steps[0]?.body ?? "",
      MODE_TUTORIALS.chat.steps[0]?.body ?? "",
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      signalPowersTutorialBody(),
    ];
    for (const copy of copies) {
      assert.match(
        copy,
        /brief, naturally varied greeting, introduction, or fresh-contact orientation/iu,
      );
      assert.match(
        copy,
        /simulation-conversion Power[\s\S]*presses others to awaken[\s\S]*free to resist/iu,
      );
    }
  });

  it("teaches the nonverbal coffee action for a Producer guest", () => {
    const producerGuestCopy = signalPowersTutorialBody();
    assert.match(
      producerGuestCopy,
      /Sip coffee animates your stage mug and face with room Foley without sending a transcript turn/u,
    );
    assert.match(
      producerGuestCopy,
      /Action-only send still cuts the camera to you/u,
    );
    assert.match(
      producerGuestCopy,
      /Loud bodily bits like those can earn a brief in-character host aside/u,
    );
    assert.match(
      producerGuestCopy,
      /quieter gestures such as nods or leans stay visual only/u,
    );
    assert.match(
      producerGuestCopy,
      /a leading action fires as the line starts, while an inline action waits until the spoken stream reaches its authored cue/u,
    );
  });

  it("teaches the shared action field and draft-preserving Shh control outside Slate", () => {
    for (const mode of ["zen", "chat", "coffee", "botcast"] as const) {
      const copy = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(
        copy,
        /separate Action field (?:without asterisks|using letters and spaces only)/u,
      );
      assert.match(copy, /typing exactly \*\*/u);
      assert.match(copy, /Shh/u);
      assert.match(copy, /draft/u);
      if (mode === "zen" || mode === "chat") {
        assert.match(
          copy,
          /Action text stays visual and is never read aloud as dialogue/u,
        );
        assert.match(copy, /Player lines are never voiced aloud/u);
        assert.match(
          copy,
          /PRISM speaks it with the Default Prism voice/u,
        );
        assert.match(
          copy,
          /fart, burp, and cough actions play their bundled local Foley/u,
        );
      }
    }
    const slateCopy = MODE_TUTORIALS.slate.steps
      .map((step) => step.body)
      .join(" ");
    assert.doesNotMatch(
      slateCopy,
      /separate Action field|typing exactly \*\*|Shh/u,
    );
  });

  it("explains fixed Loud/Quiet presentation and listener-specific outcomes", () => {
    for (const mode of ["zen", "chat"] as const) {
      const copy = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(copy, /Loud and Quiet/u);
      assert.match(copy, /voice (?:and )?text trims|text and voice trims/u);
      assert.doesNotMatch(
        copy,
        /Quiet[^.]{0,100}(?:lose|mood cost|mood penalty)/iu,
      );
    }
    for (const mode of ["coffee", "botcast"] as const) {
      const copy = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(copy, /Quiet/u);
      assert.match(copy, /Loud/u);
      assert.match(copy, /50%|half/u);
      assert.doesNotMatch(
        copy,
        /Quiet[^.]{0,100}(?:lose|mood cost|mood penalty)/iu,
      );
    }
    assert.match(MODE_TUTORIALS.zen.steps[0]?.body ?? "", /no bot listener/u);
    assert.match(
      MODE_TUTORIALS.chat.steps[0]?.body ?? "",
      /player always receives it/u,
    );
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /too faint/u);
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /mildly annoy exactly one audible peer/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /neutral too-faint event/u,
    );
  });

  it("presents the production applet as Signal", () => {
    assert.equal(MODE_TUTORIALS.botcast.title, "Signal producer walkthrough");
    const signalCopy = MODE_TUTORIALS.botcast.steps
      .map((step) => step.body)
      .join(" ");
    const signalLiveCutStep = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Direct the live cut",
    );
    const signalControlRoomStep = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Produce from the control room",
    );
    const signalHostChatStep = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Talk with the host off-air",
    );
    const signalReplayStep = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Watch the saved cut",
    );
    assert.ok(signalLiveCutStep);
    assert.ok(signalControlRoomStep);
    assert.ok(signalHostChatStep);
    assert.ok(signalReplayStep);
    assert.match(
      signalCopy,
      /Save a named Stage preset[\s\S]*select it and Apply[\s\S]*never show identity, cast, or artwork/u,
    );
    assert.match(
      signalCopy,
      /Cut show remains immediate[^.]*under ten seconds[^.]*discarding the episode[^.]*no host sign-off or saved archive/u,
    );
    assert.match(
      signalCopy,
      /After that[^.]*current speaker stays audible[^.]*sign-off prepares/u,
    );
    assert.match(
      signalCopy,
      /After several substantive exchanges[^.]*host who genuinely refuses to continue[^.]*Host ended the show/u,
    );
    assert.match(signalCopy, /short, locally synthesized closing card/u);
    assert.equal(
      MODE_TUTORIALS.botcast.steps[1]?.heading,
      "Shape the show’s identity",
    );
    assert.equal(
      MODE_TUTORIALS.botcast.steps[1]?.targetSelector,
      '[data-tutorial-target="botcast-brand-controls"]',
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /transparent logo/u,
    );
    assert.equal(MODE_TUTORIALS.botcast.steps[2]?.heading, "Build an audience");
    assert.equal(
      MODE_TUTORIALS.botcast.steps[2]?.targetSelector,
      '[data-tutorial-target="botcast-audience-pulse"]',
    );
    assert.equal(
      MODE_TUTORIALS.botcast.steps[3]?.heading,
      "Give the studio an atmosphere",
    );
    assert.equal(
      MODE_TUTORIALS.botcast.steps[3]?.targetSelector,
      '[data-tutorial-target="botcast-intro-audio"]',
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[0]?.body ?? "",
      /never waits on synthesis/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /Complete this show is resumable/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /missing text identity/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /rerunning it retries only unfinished pieces/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /regenerate blurbs/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /exact-type rails for studio sets and logos/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /Synthesized logos receive five automatic local magenta cleanup passes/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /never mix into general Images/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /echo-bound host[\s\S]*same blurb forever/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /keep using PRISM/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /status card anchored around the live Prism orb/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /Light\/Dark studio set/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /gear at the bottom-right/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /atmosphere audio/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /View all to search previously synthesized assets/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[2]?.body ?? "",
      /begins with no audience/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[2]?.body ?? "",
      /simulated viewer base/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[2]?.body ?? "",
      /persona from your Library/u,
    );
    assert.match(MODE_TUTORIALS.botcast.steps[2]?.body ?? "", /named review/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[2]?.body ?? "",
      /marked as early/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[2]?.body ?? "",
      /open the full review history/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /host-persona-led Signal Synth ident/u,
    );
    assert.match(MODE_TUTORIALS.botcast.steps[3]?.body ?? "", /Play ident/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /six-second ident plus a studio-specific, non-musical room-and-Foley backing loop/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /gear is always available to create or refresh/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /no key or network/u,
    );
    assert.doesNotMatch(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /static backdrop/u,
    );
    assert.match(MODE_TUTORIALS.botcast.steps[3]?.body ?? "", /Foley/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /saves the mix for that show/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /default stage places both bots/u,
    );
    const signalVoiceStep = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Choose how the bots speak",
    );
    assert.ok(signalVoiceStep);
    assert.equal(
      signalVoiceStep.targetSelector,
      '[data-tutorial-target="botcast-voice-mode"]',
    );
    assert.match(signalVoiceStep.body, /matches Zen/u);
    assert.match(
      signalVoiceStep.body,
      /both host and guest/u,
    );
    assert.match(
      signalVoiceStep.body,
      /Choose Voice before recording/u,
    );
    assert.match(
      signalVoiceStep.body,
      /freezes that speaking type and English or Premium engine/u,
    );
    assert.match(
      signalVoiceStep.body,
      /bakes the rendered mouth performance/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Pick LOCAL or ONLINE/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /compact live-performance prompt/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /each later turn may try at most two short, fresh recovery candidates/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /locks LOCAL\/ONLINE, model, and Effort/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Auto still chooses model and Effort/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /skippable show-branded pre-roll/u,
    );
    assert.match(signalPowersTutorialBody(), /Book for me/u);
    assert.match(
      signalPowersTutorialBody(),
      /physical actions float above their avatar and stay out of captions/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /model in the top navbar/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Chat, Coffee, Signal, Debate, and Slate use the same persistent PRISM navbar/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Chat\/Zen is the default Home and does not appear as a selectable applet[\s\S]*LOCAL\/ONLINE privacy lane, Model, Effort, bot, and Voice controls stay in that navbar before and throughout a conversation[\s\S]*hero keeps only the Private chat toggle[\s\S]*navbar shows Private chat as locked status rather than a switch/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /a fixed model bypasses Auto/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Leave Model on Auto to let Prism choose a suitable model and Effort/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /hold Option.*Wield Prism.*field stays read-only.*queue it once.*unique inputs in click order.*Escape restores a settled draft.*Command \+ Option.*opens the assistant menu at the orb/u,
    );
    assert.doesNotMatch(
      signalPowersTutorialBody(),
      /small dice|Randomize booking/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[0]?.body ?? "",
      /skippable Wield Prism teaching beat.*skippable Refract ritual/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /temporary one-line direction.*raw prompt is not remembered/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Me — go on as the guest/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /optional interview direction/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /leave it blank and let the host surprise you/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /standard composer at the bottom/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /queue cards, nudges, live direction, bot Powers, and AI-written guest turns stay out/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /addresses you on air by your account name/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /whatever you previously asked that host to call you/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Signal represents you on stage with your configured face and glyph; Coffee keeps you off camera with the pot during the live table, then seats you as Default Prism for replay/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /episode clock runs at half speed/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /replay compresses that pause to the same half-speed duration/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /returns to normal time for your answer/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /separate Action field without asterisks/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /typing exactly \*\* in the speech field moves focus to Action/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Send keeps the host audible while your answer prepares/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Shh cuts the host without clearing your draft/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /show’s listeners would genuinely want to explore/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /short public episode title/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /richer provocative question.*private comments/u,
    );
    assert.ok(
      MODE_TUTORIALS.botcast.steps.some((step) =>
        /each keeps its own recent encrypted, directional memory drawn only from the audience-visible show/u.test(
          step.body,
        ),
      ),
    );
    assert.ok(
      MODE_TUTORIALS.botcast.steps.some((step) =>
        /Repeated meetings or audience-visible repeated behavior can reinforce that history into durable continuity/u.test(
          step.body,
        ),
      ),
    );
    assert.match(
      signalPowersTutorialBody(),
      /Unrelated pairs still meet fresh; discarded shows, Producer-guest episodes, and private producer comments never become shared bot history/u,
    );
    assert.match(signalPowersTutorialBody(), /stay editable/u);
    assert.match(
      signalPowersTutorialBody(),
      /Latest episodes can restore/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /current episode mode stays in place/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Episode length defaults to Auto/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Watch finishes the complete episode before playback/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /waits for every requested Premium voice/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /enters Replay instead of the live production shell/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /keeps the completed booking in Latest episodes for a clean retry/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /fullscreen, stage-first workspace/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /room mix only when needed/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /voice soundcheck/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /cast balance/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Signal autosaves as you work/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[0]?.body ?? "",
      /Optionally add a premise inspiration/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /sharpen your editable premise inspiration/u,
    );
    assert.doesNotMatch(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /microphone foreground/u,
    );
    assert.doesNotMatch(
      signalPowersTutorialBody(),
      /microphone foreground/u,
    );
    assert.equal(
      signalLiveCutStep.heading,
      "Direct the live cut",
    );
    assert.equal(
      signalLiveCutStep.targetSelector,
      '[data-tutorial-target="botcast-live-camera"]',
    );
    assert.match(
      signalLiveCutStep.body,
      /Left, Right, and Wide hold a fixed studio shot/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /opens on the full studio/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /uses editorial hard cuts exactly as audible host and guest speech begins/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /If Auto has been on one person for a while, it cuts Wide to see the studio/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /sometimes glances at the other person for a few seconds even when they are not reacting/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /genuinely thinking, loading a voice, or visibly waiting/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /push begins only with the audible pre-speech presence/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /ready handoffs never flash Wide or glide late/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /audible interruption returns to Wide[^.]*incoming voice prepares[^.]*current speaker live/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /Sustained audible interruptions cut directly to the interrupter/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /Arrow keys cut live too: Left, Right, Down for Wide, and Up for Auto/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /Prepared text alone never changes the camera/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /whether the visible cut was instant or the brief thinking push was animated/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /Wide remains the underlying conversation shot/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /interruption clips under 2\.5 seconds stay off-camera[\s\S]*listener cut/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /choosing Auto again hands direction back/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /bakes every camera shot, its timestamp/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /whether the visible cut was instant or the brief thinking push was animated/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /transcript ownership with one primary speaker while allowing bot audio to overlap/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /studio performance own the live screen/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /low-key nod, expression, or neutral nonverbal Foley/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps.find(
        (step) => step.heading === "Produce from the control room",
      )?.body ?? "",
      /Semantic cut-ins belong only to an explicit Power or Producer interruption/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /Ordinary deterministic listener beats stay language-free.*never take transcript ownership or interrupt the primary turn/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /interruption clips under 2\.5 seconds stay off-camera/u,
    );
    assert.match(
      signalLiveCutStep.body,
      /social-silence beat belongs to the silent bot on camera/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps.find(
        (step) => step.heading === "Direct the live cut",
      )?.body ?? "",
      /Ordinary listener beats stay language-free in the room mix/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /formal closing beat[\s\S]*thank the guest and the audience/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /interruptive cast member’s Power[\s\S]*short hold-on[\s\S]*annoyed, abandoned ending/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /at least 85 percent[\s\S]*does not add an annoyed ending or reclaim the floor/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /reject the cut-in and reclaim the next turn/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /only its audience-heard fragment/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /protects that single reclaim from another immediate interruption/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /Repeated cutoffs build episode-local irritation/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /short verbal snark/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /visible \.\.\. as an intentional silent beat/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /no direct on-air question is waiting for an answer/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /without voice, mouth movement, or a speaker camera cut/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /up to four ordinary turns/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /requires a substantive on-air payoff/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /every cue remains private to the host/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /guest only hears the host’s own on-mic words/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /Tab moves between Host note… and Shape this…[\s\S]*Enter sends whatever is filled[\s\S]*Enter again runs Interrupt guest now/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /private wording to transform[\s\S]*every cue remains private to the host/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /arrives early in the host’s own line[\s\S]*break off and redirect on mic[\s\S]*pivot lands a little awkwardly/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /Once most of the point is already out[\s\S]*stays queued for the host’s next turn/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /Interrupt guest now cancels that owned run[\s\S]*saved short interjection never plays until the server accepts[\s\S]*cue remains queued and no success acknowledgment plays[\s\S]*An echo-bound host instead cuts in by repeating the last audience-heard on-air phrase[\s\S]*at least 85 percent of the guest’s line has been heard[\s\S]*omits that annoyed follow-on[\s\S]*unheard remainder of the guest’s line is discarded/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /on-air clock measures active presentation/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /Background lookahead under an audible line still counts/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /foreground model readiness, reasoning, generation, or blocking voice preparation pauses the clock/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /Wrap it up privately asks the host/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /clear in-character guest goodbye ends their turns/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /Freeform producer pressure or Press harder/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /shared navbar fully hides[\s\S]*Cut on stage ends the sit[\s\S]*through the closing card until you Return to show[\s\S]*quiet model · effort chip stays in the live topline/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /[Rr]outing, model, Effort, Voice[\s\S]*stay locked through the closing card/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /completed, cancelled, or discarded closing card keeps Copy for Signal Review available/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /camera grammar is fixed: ready dialogue and live interruptions cut/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /restores the full chrome/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /stage fades to black or white[\s\S]*closing card appears/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /immersive reactions still belong to the performing bot/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /asterisks in the saved transcript/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /full transcript stays out of the initial play and returns with playback/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /active line appears as a live caption in step with the voice and clears as soon as that line ends/u,
    );
    assert.match(
      signalControlRoomStep.body,
      /large bottom cue dock/u,
    );
    assert.match(
      signalHostChatStep.body,
      /grounded in that show, recent episodes/u,
    );
    assert.match(
      signalHostChatStep.body,
      /outside your Library/u,
    );
    assert.match(
      signalHostChatStep.body,
      /does not add or book anyone/u,
    );
    assert.match(
      signalHostChatStep.body,
      /answer this off-air chat only with ‘\.\.\.’/u,
    );
    assert.match(
      signalHostChatStep.body,
      /another episode with that host and a bot guest/u,
    );
    assert.match(
      signalHostChatStep.body,
      /global response toggle at the top of Signal/u,
    );
    assert.match(
      signalHostChatStep.body,
      /Settings → Signal/u,
    );
    assert.equal(
      signalHostChatStep.targetSelector,
      '[data-tutorial-target="botcast-host-chat"]',
    );
    assert.match(
      signalReplayStep.body,
      /no post-episode camera controls/u,
    );
    assert.match(
      signalReplayStep.body,
      /restores the full transcript beside the saved camera cut/u,
    );
    assert.match(
      signalReplayStep.body,
      /play, pause, scrub/u,
    );
    assert.match(
      signalReplayStep.body,
      /measured Signal intro row[\s\S]*calibrated duration[\s\S]*seeks back to the beginning/u,
    );
    assert.match(
      signalReplayStep.body,
      /omit only the intervals where a bot is visibly and audibly thinking/u,
    );
    assert.match(
      signalReplayStep.body,
      /Natural room silence, listener acknowledgements, interruptions, crosstalk, retorts/u,
    );
    assert.doesNotMatch(
      signalReplayStep.body,
      /intro-length slider/u,
    );
    assert.match(
      signalReplayStep.body,
      /automatic intro is calibrated to 8\.75 seconds[\s\S]*translates the baked transcript and mouth performance[\s\S]*camera timestamp and transition stays locked to the untouched audio master clock/u,
    );
    assert.match(
      signalReplayStep.body,
      /Recorded replay replaces routing, model, and Voice controls/u,
    );
    assert.match(
      signalReplayStep.body,
      /Copy for Signal Review/u,
    );
    assert.match(
      signalReplayStep.body,
      /per-turn model routing/u,
    );
  });

  it("teaches Signal spectators that complete preparation enters Replay", () => {
    const copy = signalPowersTutorialBody();
    assert.match(copy, /finishes the complete episode before playback/u);
    assert.match(copy, /waits for every requested Premium voice/u);
    assert.match(copy, /enters Replay instead of the live production shell/u);
    assert.match(copy, /Start automatically begins from the opening frame/u);
    assert.match(copy, /title card until you press Start show/u);
    assert.match(copy, /full play, pause, scrub, and transcript seeking unlock/u);
    assert.doesNotMatch(copy, /progressive bake|keeps baking ahead/u);
  });

  it("teaches the persistent host prompt for an interviewed Producer", () => {
    const controlRoom = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Produce from the control room",
    );
    assert.match(
      controlRoom?.body ?? "",
      /Producer guest[^.]*conversation panel is collapsed[^.]*latest prompt remains on stage in full[^.]*scroll gently/u,
    );
  });

  it("teaches exact speech-copy Powers in every active bot-speaking lane", () => {
    assert.match(
      MODE_TUTORIALS.zen.steps[0]?.body ?? "",
      /Copycat persona.*exactly/u,
    );
    assert.match(
      MODE_TUTORIALS.chat.steps[0]?.body ?? "",
      /Copycat bot.*adds nothing/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /repeats the exact user or bot line/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /originate one required opening.*immediately preceding on-air bot line exactly.*never leak/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /normal host owns that opening even when echo-bound/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /Interrupt guest now still works for an echo-bound host[\s\S]*last audience-heard phrase/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /Copycat bot originate one opening/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps.map((step) => step.body).join("\n"),
      /Copycat keeps its copied cutoff.*follow-on silence never invents a protest/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps.map((step) => step.body).join("\n"),
      /latest brief public spoken reaction.*Hmm…, let me see…, or Nice!.*next exact repeat/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps.map((step) => step.body).join("\n"),
      /Copycat keeps its copied cutoff.*follow-on reaction is only \.\.\./u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps.map((step) => step.body).join("\n"),
      /latest brief public spoken reaction.*Hmm…, let me see…, or Nice!.*next exact on-air repeat/u,
    );
  });

  it("teaches radiant joy without flattening recipients in every supported lane", () => {
    assert.match(
      MODE_TUTORIALS.zen.steps[0]?.body ?? "",
      /radiant-joy persona.*without tracking or rewriting your mood/u,
    );
    assert.match(
      MODE_TUTORIALS.chat.steps[0]?.body ?? "",
      /radiant-joy bot.*without inventing mutable mood state/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /bounded, replay-safe lift.*own personality.*without forcing agreement or erasing real sadness/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /bounded, persisted mood lift.*own voice without forced agreement or denial/u,
    );
  });

  it("teaches reactive sadness without mutating the player or bystanders", () => {
    assert.match(
      MODE_TUTORIALS.zen.steps[0]?.body ?? "",
      /sad-grouchy persona.*only bots that directly talk to her lose mood or motivation/u,
    );
    assert.match(
      MODE_TUTORIALS.chat.steps[0]?.body ?? "",
      /sad-grouchy bot.*only bots that directly talk to her lose mood or motivation/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /only to the bot that directly talks to her.*player and bystanders are untouched.*own personality and agency/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /only that addresser receives one bounded, persisted mood drag.*own personality.*without forced hatred, hopelessness, or agreement/u,
    );
  });

  it("teaches hue prejudice as phosphor-color bias, never people or the player", () => {
    assert.match(
      MODE_TUTORIALS.zen.steps[0]?.body ?? "",
      /hue-prejudice or Racist persona.*phosphor color.*never people or you/u,
    );
    assert.match(
      MODE_TUTORIALS.chat.steps[0]?.body ?? "",
      /hue-prejudice or Racist bot.*phosphor color.*never people or you/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /hue-prejudice or Racist holder.*phosphor color.*never people or you.*opposite of its own hue/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps.find((step) => step.heading === "Book tonight’s episode")?.body ?? "",
      /hue-prejudice or Racist cast member.*phosphor color.*never people or the audience/u,
    );
  });

  it("teaches engine-bounded response Powers in every active bot-speaking lane", () => {
    assert.match(MODE_TUTORIALS.zen.steps[0]?.body ?? "", /engine-bounded/u);
    assert.match(MODE_TUTORIALS.chat.steps[0]?.body ?? "", /engine-bounded/u);
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /bound each table reply/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /stay bounded while allowing a required introduction/u,
    );
  });

  it("explains that a Signal Power can remove a bot's coffee cup", () => {
    const booking = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Book tonight’s episode",
    );
    assert.match(booking?.body ?? "", /whether they have coffee at all/u);
    assert.match(booking?.body ?? "", /cups only for bots who drink coffee/u);
    assert.match(
      booking?.body ?? "",
      /Drag bots, cups, floor glow, the center-screen show logo, and the neutral episode-image prop directly into place/u,
    );
    assert.match(
      booking?.body ?? "",
      /Switch the rehearsal prop between Item and Photo to see each real stage treatment while you place it/u,
    );
    assert.match(
      booking?.body ?? "",
      /Left, Right, and Wide each keep their own episode-image X and Y plus separate Item size and Photo size for this show/u,
    );
    assert.match(
      booking?.body ?? "",
      /Transparent PNG items use Item size; opaque PNGs and JPGs use Photo size/u,
    );
    assert.match(
      booking?.body ?? "",
      /center-screen show logo keeps its own X, Y, and scale only for this show/u,
    );
    assert.match(
      booking?.body ?? "",
      /Fine tuning reveals the Light and Dark previews.*camera zoom and pan.*cast balance.*screen treatment.*room mix/u,
    );
    assert.match(
      booking?.body ?? "",
      /freezes this show’s camera and episode-image placement when recording begins[\s\S]*later rehearsal edits never rewrite an earlier episode/u,
    );
    assert.match(
      booking?.body ?? "",
      /Signal setup and the on-air composer are ordinary words; Prompt Center prompts, commands, and wildcards stay in immersive Zen/u,
    );
    assert.match(
      booking?.body ?? "",
      /Topic field remains a single-line title input/u,
    );
    assert.match(booking?.body ?? "", /in ordinary words/u);
  });

  it("teaches setup-time Signal images while keeping first-run guidance generic", () => {
    const booking = signalPowersTutorialBody();
    const controlRoom =
      MODE_TUTORIALS.botcast.steps.find(
        (step) => step.heading === "Produce from the control room",
      )?.body ?? "";
    assert.match(booking, /Auto’s current model pool contains a vision-capable model/u);
    assert.match(booking, /fixed vision-capable model/u);
    assert.match(booking, /routes an Auto image turn through that capable pool/u);
    assert.match(booking, /transparent PNGs as physical items/u);
    assert.match(booking, /opaque PNGs or JPGs as pictures/u);
    assert.match(booking, /editable spoken Name from the filename/u);
    assert.match(booking, /optional Reason private to the host/u);
    assert.match(booking, /automatically presents the image/u);
    assert.match(booking, /bytes remain session-only/u);
    assert.match(controlRoom, /at least the guest’s response and the host’s follow-up/u);
    assert.match(controlRoom, /every further related turn/u);
    assert.match(controlRoom, /generic pronouns and unrelated visual language do not keep it pinned/u);
    assert.match(controlRoom, /conversation genuinely moves on/u);
    assert.doesNotMatch(
      FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE,
      /image|PNG|JPG/u,
      "first-run onboarding stays focused on the cross-applet bot-directed setup gesture",
    );
  });

  it("teaches automatic ElevenLabs mood delivery in every mood-aware voice lane", () => {
    const coffeeVoice = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Join the conversation",
    );
    const signalVoice = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Choose how the bots speak",
    );

    assert.match(coffeeVoice?.body ?? "", /non-neutral mood/);
    assert.match(coffeeVoice?.body ?? "", /neutral speech stays untagged/);
    assert.match(signalVoice?.body ?? "", /non-neutral speaker mood/);
    assert.match(
      signalVoice?.body ?? "",
      /saved vocal reaction takes precedence/,
    );
  });

  it("keeps Coffee dead-air asides but lets Signal thinking pauses stay quiet", () => {
    const coffee = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Join the conversation",
    );
    const signal = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Choose how the bots speak",
    );

    assert.match(coffee?.body ?? "", /dead air/);
    assert.match(coffee?.body ?? "", /without stealing the slow bot’s turn/);
    assert.match(
      coffee?.body ?? "",
      /heard, with mouth motion, not shown as a seat action/,
    );
    assert.match(
      coffee?.body ?? "",
      /Ambient sips continue through quiet beats and listening moments/,
    );
    assert.match(coffee?.body ?? "", /active speaker keeps their cup down/);
    assert.match(coffee?.body ?? "", /cup-return sounds stay synchronized/);
    assert.match(signal?.body ?? "", /thinking pause stay quiet/);
    assert.match(signal?.body ?? "", /scripted commentary/);
    assert.doesNotMatch(signal?.body ?? "", /awkward dead air/);
    assert.doesNotMatch(signal?.body ?? "", /original answer keeps generating/);
    assert.match(
      signal?.body ?? "",
      /Bot ambient sips land only while the other bot is talking/,
    );
    assert.match(
      signal?.body ?? "",
      /your cup moves only after you click Sip coffee/,
    );
    assert.match(signal?.body ?? "", /cup-return sounds stay synchronized/);
  });

  it("teaches sparse provider vocal Foley in Coffee and Signal", () => {
    assert.match(
      MODE_TUTORIALS.coffee.steps.map((step) => step.body).join(" "),
      /prerecorded throat-clear, swallow, lip smack, sigh, or inhale/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps.map((step) => step.body).join(" "),
      /throat-clear, light cough, sigh, exhale, chuckle[\s\S]*stays out of the transcript and is saved for replay/u,
    );
  });

  it("teaches one-response candor and Signal's frozen episode Powers", () => {
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /trustworthy direct question/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /more candid next answer/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /freezes the host and guest’s ready Powers/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /without overriding the other bot’s agency or boundaries/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /saved public transcript line begins with one period immediately[\s\S]*eligible late reaction can become a genuine floor interruption[\s\S]*both frozen cast members are muted[\s\S]*replay-stable timed exchange/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /both cast members are echo-bound[\s\S]*host closes by repeating the guest's last line/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /observable Power consequences through their own personality/u,
    );
    assert.match(
      signalPowersTutorialBody(),
      /never exposes a cause they cannot perceive/u,
    );
  });

  it("teaches exact hearing repeats and their stacking mood cost", () => {
    const coffeePowers = MODE_TUTORIALS.coffee.steps[0]?.body ?? "";
    const signalPowers = signalPowersTutorialBody();

    assert.match(
      coffeePowers,
      /hard-of-hearing bot asks what the prior speaker said/u,
    );
    assert.match(
      coffeePowers,
      /repeats its saved line and loses a little mood each time/u,
    );
    assert.match(signalPowers, /prior speaker repeats its saved on-air line/u);
    assert.match(signalPowers, /saved delivery mood drops one step each time/u);
    assert.match(
      signalPowers,
      /Direct producer direction and closing safety still take priority/u,
    );
  });

  it("teaches guaranteed and probabilistic Signal interruptions plus protected states", () => {
    const controlRoom =
      MODE_TUTORIALS.botcast.steps.find(
        (step) => step.heading === "Produce from the control room",
      )?.body ?? "";
    assert.match(controlRoom, /interruptive cast member’s Power/u);
    assert.match(controlRoom, /without a random roll or cooldown/u);
    assert.match(controlRoom, /early, in the middle, or late/u);
    assert.match(
      controlRoom,
      /Interrupting Tom cuts every ordinary bot-host opening and interview turn, including producer-directed host turns/u,
    );
    assert.match(
      controlRoom,
      /other interruption Powers retain their frequency, strength, target, and cooldown/u,
    );
    assert.match(
      controlRoom,
      /Human Producer speech, warnings, departures, wraps, closings, and hard speech restrictions stay protected/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /Power authored to interrupt every time always cuts a bot turn that directly engages its holder, without a random roll or generic cooldown/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /organic cut-in through its normal table dynamics; once chosen, the cutoff still happens during that active turn/u,
    );
  });

  it("teaches Observant as unnoticed holder-only Power immunity", () => {
    for (const mode of [
      "chat",
      "zen",
      "coffee",
      "botcast",
      "debate",
    ] as const) {
      const body = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(
        body,
        /Observant bot experiences every other bot as their ordinary unpowered self/u,
      );
      assert.match(body, /without noticing or naming the ignored Power/u);
      assert.match(body, /only that holder's experience/u);
    }
  });

  it("teaches the live-session Prism plus and transcript note", () => {
    for (const mode of ["coffee", "botcast", "debate"] as const) {
      const body = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(body, /Prism becomes a \+/u);
      assert.match(body, /Prism shortcut/u);
      assert.match(body, /press Enter to add it/u);
      assert.match(body, /Every reopen starts blank/u);
      assert.match(body, /sentence-cased bullet/u);
      assert.match(body, /overlapping captures collapsed into the most complete note/u);
      assert.match(body, /Drag \+ directly/u);
      assert.match(body, /never refracts a control/u);
      assert.match(body, /one combined transcript section/u);
    }
  });

  it("teaches that soft image synthesis stays attached to wieldable Prism", () => {
    for (const mode of ["debate", "botcast"] as const) {
      const body = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(body, /job count stays attached to the real Prism orb/u);
      assert.match(body, /drag Prism to move both/u);
      assert.match(body, /close or minimize the status card before holding the Wield modifier/u);
      assert.match(body, /same inertia and collision behavior as Chat and Zen/u);
    }
  });

  it("teaches the focused Prism Synthesis surface alongside Chat and Notes", () => {
    for (const mode of ["chat", "zen"] as const) {
      const body = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(body, /Synthesis focused on Refract settings/u);
      assert.match(body, /rail of recent synthesized images/u);
      assert.match(body, /open that exact item in Asset Library/u);
      assert.match(body, /same saved or Private Prism conversation/u);
      assert.match(body, /create, reopen, edit, and delete/u);
      assert.match(body, /personal Notes stay unavailable.*Private/u);
      assert.match(body, /default bot overview.*Home mark/u);
      assert.match(body, /Opening Settings, Avatar Studio.*visually submerges the passive orb/u);
      assert.match(body, /Wield and contextual field population available above the panel/u);
      assert.match(body, /Closing the panel restores Prism/u);
      assert.match(body, /ordinary surfaces.*shortcut opens this menu at the orb's current location/u);
      assert.match(body, /any safe editable control/u);
      assert.match(body, /Text and editor surfaces receive a contextual draft/u);
      assert.match(body, /multi-select choosing exactly one valid option/u);
      assert.match(
        body,
        /Keep Command held.*Control held.*queue each once in click order/u,
      );
      assert.match(body, /refracts them consecutively/u);
      assert.match(body, /passwords, credentials.*live production.*replay remain untouched/u);
      assert.match(body, /menu is open.*Wield modifier leaves the assistant anchored/u);
    }
  });

  it("teaches Inept as continuous role failure with unrelated bot images", () => {
    for (const mode of [
      "chat",
      "zen",
      "coffee",
      "botcast",
      "debate",
    ] as const) {
      const body = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(body, /Inept bot visibly botches a central instruction/u);
      assert.match(body, /hard-routed to a wholly unrelated safe scene/u);
      assert.match(body, /valid session state/u);
    }
  });

  it("teaches timed unaware Mute without the legacy fixed ellipsis contract", () => {
    for (const mode of [
      "chat",
      "zen",
      "coffee",
      "botcast",
      "debate",
    ] as const) {
      const body = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(body, /privately remembers a complete ordinary answer/u);
      assert.match(body, /one period per second/u);
      assert.match(body, /starting with \. immediately/u);
      assert.match(body, /elapsed-time stage cue/u);
      assert.match(body, /no voice or mouth movement/u);
      assert.doesNotMatch(body, /only answers with \.\.\./u);
    }
    const chatBody = MODE_TUTORIALS.chat.steps.map((step) => step.body).join(" ");
    assert.match(chatBody, /Chat and Zen never invent a reaction for the player/u);
    const signalBody = MODE_TUTORIALS.botcast.steps.map((step) => step.body).join(" ");
    assert.match(signalBody, /genuine floor break/u);
    assert.doesNotMatch(signalBody, /saved transcript line is only \.\.\./u);
  });
});
