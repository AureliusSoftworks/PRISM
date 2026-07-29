import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MODE_TUTORIALS, modeTutorialStep } from "./modeTutorials.ts";

describe("mode tutorials", () => {
  it("keeps every step click-specific and targetable", () => {
    for (const tutorial of Object.values(MODE_TUTORIALS)) {
      assert.ok(tutorial.steps.length > 0);
      for (const step of tutorial.steps) {
        assert.ok(step.clickLabel.trim().length > 0);
        assert.match(step.targetSelector, /^\[data-tutorial-target=/);
      }
    }
  });

  it("teaches the complete Debate contract with stable targets", () => {
    const tutorial = MODE_TUTORIALS.debate;
    assert.deepEqual(
      tutorial.steps.map((step) => step.targetSelector),
      [
        '[data-tutorial-target="debate-new"]',
        '[data-tutorial-target="debate-synthesize"]',
        '[data-tutorial-target="debate-cast"]',
        '[data-tutorial-target="debate-consent"]',
        '[data-tutorial-target="debate-evidence"]',
        '[data-tutorial-target="debate-readiness"]',
        '[data-tutorial-target="debate-start"]',
        '[data-tutorial-target="debate-case-board"]',
        '[data-tutorial-target="debate-camera"]',
        '[data-tutorial-target="debate-copy-transcript"]',
        '[data-tutorial-target="debate-align-stage"]',
      ],
    );
    const copy = tutorial.steps.map((step) => step.body).join(" ");
    assert.match(copy, /one non-gated console/u);
    assert.match(copy, /without turning setup into a wizard/u);
    assert.match(copy, /Devil’s Advocate/u);
    assert.match(copy, /immutable prep packet/u);
    assert.match(copy, /never reads or writes relationship memory/u);
    assert.match(copy, /pause and resume the exact next action/u);
    assert.match(copy, /Choose one Debate model in the navbar/u);
    assert.match(copy, /Account default uses the model saved in Settings/u);
    assert.match(copy, /every moderator and advocate turn/u);
    assert.match(copy, /every bot ballot/u);
    assert.match(copy, /Start freezes that complete contract/u);
    assert.match(copy, /three-bot majority/u);
    assert.match(copy, /Public prose arrives with the live voice/u);
    assert.match(copy, /actual animated bot behind an authored side podium/u);
    assert.match(copy, /Each podium carries its bot's glyph/u);
    assert.match(copy, /follows floor ownership rather than speech or prose/u);
    assert.match(copy, /full-width command deck rises/u);
    assert.match(copy, /Auto is the quiet default camera/u);
    assert.match(copy, /cuts instantly/u);
    assert.match(copy, /advanced production control/u);
    assert.match(copy, /temporary unique Library stand-ins/u);
    assert.match(copy, /Wide and Moderator/u);
    assert.match(
      copy,
      /independent Bot, Nameplate, and Glyph plate placement/u,
    );
    assert.match(copy, /Drag the visible item/u);
    assert.match(copy, /account and device/u);
    assert.match(copy, /Copy alignment data/u);
    assert.match(copy, /paste-ready JSON/u);
    assert.match(copy, /Choose a manual view to hold the shot/u);
    assert.match(copy, /only the heard fragment remains public/u);
    assert.match(copy, /safe Markdown/u);
    assert.match(copy, /Copy verbose transcript/u);
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
    assert.match(joinCopy, /visible \.\.\. as an intentional social beat/u);
    assert.match(joinCopy, /without voice or mouth movement/u);
    assert.match(joinCopy, /up to four ordinary turns/u);
    assert.match(joinCopy, /requires a substantive reply/u);
    assert.match(joinCopy, /hard mute Powers keep their existing precedence/u);
    assert.match(joinCopy, /sparse mic-ready breath/u);
  });

  it("teaches pot-only Coffee without retired service or a player mug", () => {
    const copy = MODE_TUTORIALS.coffee.steps
      .map((step) => `${step.heading} ${step.body}`)
      .join(" ");
    assert.match(copy, /remain off camera/u);
    assert.match(copy, /no player avatar or mug/u);
    assert.match(copy, /Drag the pot/u);
    assert.match(copy, /no waiter, barista, or service bot/u);
    assert.match(copy, /two or three table replies/u);
    assert.match(copy, /invisible visit clock/u);
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

  it("teaches the Prism house sound and its character alternatives", () => {
    const voiceCopy = MODE_TUTORIALS.zen.steps[3]?.body ?? "";
    assert.match(
      voiceCopy,
      /subtle Prism effect is the default house sound, gently tuning voiced speech/u,
    );
    assert.match(voiceCopy, /Clean for untouched playback/u);
    assert.match(
      voiceCopy,
      /Resonance for a darker, weightier mechanical double/u,
    );
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
      "Shape before drafting",
      "Choose the prose engine",
      "Direct the structure",
      "Let Slate carry the draft",
      "Keep your hands on the prose",
      "Talk beside the document",
      "Think in two hemispheres",
      "Approve revisions deliberately",
    ]);
    assert.deepEqual(selectors, [
      '[data-tutorial-target="slate-create-project"]',
      '[data-tutorial-target="slate-shape"]',
      '[data-tutorial-target="slate-ai-controls"]',
      '[data-tutorial-target="slate-structure"]',
      '[data-tutorial-target="slate-draft"]',
      '[data-tutorial-target="slate-manuscript"]',
      '[data-tutorial-target="prism-companion"]',
      '[data-tutorial-target="slate-deliberation"]',
      '[data-tutorial-target="slate-revision"]',
    ]);
    assert.match(
      MODE_TUTORIALS.slate.steps[6]?.body ?? "",
      /Voice on[\s\S]*pace of its voice[\s\S]*mute the widget/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps[6]?.body ?? "",
      /Type \/ for Prompt Center prompts and ! for wildcard decks in the companion composer/u,
    );
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /\{wildcards\}/i);
    assert.match(
      MODE_TUTORIALS.slate.steps[0]?.body ?? "",
      /creative spark or pages/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps[0]?.body ?? "",
      /replaces the spark controls/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps[0]?.body ?? "",
      /prose model to generate/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps[0]?.body ?? "",
      /visible title checkpoint/i,
    );
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /never renames/i);
    assert.match(
      MODE_TUTORIALS.slate.steps[0]?.body ?? "",
      /waits for your confirmation or another try/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps[0]?.body ?? "",
      /privacy-matched book cover/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps[0]?.body ?? "",
      /regenerate either title or cover/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps[0]?.body ?? "",
      /project shelf becomes home/i,
    );
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /story-so-far/i);
    assert.match(
      MODE_TUTORIALS.slate.steps[2]?.body ?? "",
      /OFFLINE, AUTO, or ONLINE/,
    );
    assert.match(MODE_TUTORIALS.slate.steps[7]?.body ?? "", /Lux and Umbra/u);
    assert.match(MODE_TUTORIALS.slate.steps[7]?.body ?? "", /Slate Settings/u);
    assert.match(
      MODE_TUTORIALS.slate.steps[7]?.body ?? "",
      /own allowed model and creative lens/u,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps[7]?.body ?? "",
      /stop at any point/u,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps[7]?.body ?? "",
      /never edits prose/u,
    );
    assert.match(MODE_TUTORIALS.slate.steps[2]?.body ?? "", /receipt/i);
    assert.match(
      MODE_TUTORIALS.slate.steps.at(-3)?.body ?? "",
      /never edits prose/i,
    );
    assert.match(MODE_TUTORIALS.slate.steps.at(-3)?.body ?? "", /last three/i);
    assert.match(
      MODE_TUTORIALS.slate.steps.at(-3)?.body ?? "",
      /newest two messages remain readable/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps.at(-3)?.body ?? "",
      /app softens behind the open panel/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps.at(-3)?.body ?? "",
      /glides to a stop/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps.at(-3)?.body ?? "",
      /not remembered history/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps.at(-1)?.body ?? "",
      /accept or reject/i,
    );
    assert.match(MODE_TUTORIALS.slate.steps.at(-1)?.body ?? "", /Continuity/i);
  });

  it("teaches Zen navigation as relationship-specific Homes", () => {
    const [chooseRelationship, groupRoom, continueHome, , context] =
      MODE_TUTORIALS.zen.steps;

    assert.deepEqual(
      {
        ...chooseRelationship,
        body: chooseRelationship?.body
          .replace(/ A Shapeshifter sincerely becomes.*$/u, "")
          .replace(
            / A bot-name prefix or suffix changes only how its holder names other bots:.*$/u,
            "",
          ),
      },
      {
        heading: "Choose a relationship",
        body: "Choose PRISM or a persona to enter that relationship’s Home. Ready Powers stay active with that persona here and across PRISM; a muted persona can still act, but only answers with ... and never speaks aloud, while a Copycat persona may originate one opening if nobody has addressed them yet, then repeats the latest addressed message exactly. A short-term-amnesia persona only sees your current message each turn—no earlier replies or broader topic unless that message states it—and answers naturally without amnesia coaching. A John/Jane Doe persona sincerely believes a random persona name for the session and reshuffles that name whenever short-term amnesia clears continuity. An Obsessed persona treats you as the star of each reply with fresh, intense admiration, while your agency, privacy, and safety boundaries still win. A radiant-joy persona makes that emotional warmth palpable without tracking or rewriting your mood. A sad-grouchy persona makes her draining presence equally palpable without changing your state; only bots that directly talk to her lose mood or motivation. Physical-size Powers render a persona slightly larger or smaller without changing the room layout. Microscopic stays fully unseen even while speaking, while Invisible stays half-translucent. Loud and Quiet Powers apply a small fixed voice-volume and text-size shift without changing physical size or visibility; Quiet can go unheard on half its turns and lose a little mood. A hard bare-minimum or brief Power is engine-bounded even if the model tries to elaborate. Clicking empty canvas space jumps straight back to All Bots Home. Escape returns you to the wider Library or saved group grid exactly where you left it. Inviting a guest keeps you in the current Home.",
        clickLabel: "a PRISM or persona tile",
        targetSelector: '[data-tutorial-target="chat-bot-picker"]',
      },
    );
    assert.deepEqual(continueHome, {
      heading: "Continue this Home",
      body: "Each Home keeps separate saved conversations inside one relationship. Expand a Home in the conversation panel to open an exact conversation, use its + to begin another, or use New chat to start fresh inside the Home you are visiting. Only that conversation's transcript enters its active context. Put physical stage direction in the separate Action field using letters and spaces only; typing exactly ** in the speech field jumps there. Action drafts stay private until Send. If you send an Action without speech, it and the bot's action response appear on the canvas as an ephemeral exchange and never enter history or memory. When Shh appears, it stops the current reply without replacing the draft you are writing.",
      clickLabel: "the message box at the bottom",
      targetSelector: '[data-tutorial-target="composer"]',
    });
    assert.equal(
      groupRoom?.targetSelector,
      '[data-tutorial-target="chat-group-atmosphere"]',
    );
    assert.equal(
      context?.body,
      "Recent messages stay visible while older continuity for this Home is carried through summaries and memory.",
    );
  });

  it("keeps Zen history intact while teaching the deliberate undo path", () => {
    const correction = MODE_TUTORIALS.chat.steps.find(
      (step) => step.heading === "Keep the moment honest",
    );

    assert.match(correction?.body ?? "", /Type \/undo/);
    assert.doesNotMatch(correction?.body ?? "", /fork|resend|delete/i);
    assert.equal(
      correction?.targetSelector,
      '[data-tutorial-target="composer"]',
    );
  });

  it("introduces saved group Atmospheres behind the standard grid", () => {
    const atmosphere = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Shape a saved group's room",
    );
    assert.match(atmosphere?.body ?? "", /reusable backdrop/);
    assert.match(atmosphere?.body ?? "", /standard bot grid/);
    assert.doesNotMatch(atmosphere?.body ?? "", /waiting room|Listen up/u);
    assert.equal(
      atmosphere?.targetSelector,
      '[data-tutorial-target="chat-group-atmosphere"]',
    );
  });

  it("distinguishes Coffee response routing from the account default model", () => {
    const setup = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Set the table",
    );
    const routing = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Keep the table moving",
    );

    assert.match(
      setup?.body ?? "",
      /Account default uses the model saved in Settings/,
    );
    assert.match(
      setup?.body ?? "",
      /AUTO is the separate response-routing control/,
    );
    assert.match(setup?.body ?? "", /Use setup restores/);
    assert.match(setup?.body ?? "", /topic for an editable retry/);
    assert.match(
      setup?.body ?? "",
      /current model and response routing stay selected/,
    );
    assert.match(setup?.body ?? "", /one to five local or online fallbacks/);
    assert.match(setup?.body ?? "", /Auto has no visible countdown/);
    assert.doesNotMatch(setup?.body ?? "", /hidden 30-minute ceiling/);
    assert.match(
      routing?.body ?? "",
      /model picker stays active and shows every model/,
    );
    assert.match(routing?.body ?? "", /selection becomes Primary/);
    assert.match(routing?.body ?? "", /fallback chain saved in Settings/);
    assert.match(routing?.body ?? "", /separate Images provider/);
    assert.match(routing?.body ?? "", /voice preference/);
    assert.match(
      routing?.body ?? "",
      /freezes the selected speaking type and engine/u,
    );
    assert.match(routing?.body ?? "", /locks routing, model, Voice/u);
    assert.match(routing?.body ?? "", /Recorded replay/u);
    assert.match(
      routing?.body ?? "",
      /entire utility strip until you choose End session/,
    );
    assert.doesNotMatch(routing?.body ?? "", /remain available/u);
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

  it("teaches that Zen response, image, and voice routing are separate", () => {
    const routing = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Choose how replies recover",
    );
    assert.match(
      routing?.body ?? "",
      /one to five saved local or online fallbacks/,
    );
    assert.match(
      routing?.body ?? "",
      /Image generation keeps its own LOCAL\/ONLINE choice/,
    );
    assert.match(
      routing?.body ?? "",
      /Mute, English, Premium, Babble, and Bottish/,
    );
    assert.match(routing?.body ?? "", /optional operating-system identity/);
    assert.match(
      routing?.body ?? "",
      /Avatar Studio edits and previews those two identities separately/,
    );
    assert.match(routing?.body ?? "", /on AUTO and ONLINE speech/);
    assert.match(routing?.body ?? "", /Voice Settings can narrow/);
    assert.match(routing?.body ?? "", /one ElevenLabs voice collection/);
    assert.match(
      routing?.body ?? "",
      /Voice tab also gives each bot a Voice Character pad/,
    );
    assert.match(routing?.body ?? "", /relative to your account Voice Volume/);
    assert.match(
      routing?.body ?? "",
      /SFX tab can generate an ElevenLabs loop/,
    );
    assert.match(routing?.body ?? "", /talking, idle, thinking/);
    const automaticThinkingSfx = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Hear each bot think",
    );
    assert.match(
      automaticThinkingSfx?.body ?? "",
      /one of four built-in PRISM/,
    );
    assert.match(automaticThinkingSfx?.body ?? "", /Computer calculating/);
    assert.match(automaticThinkingSfx?.body ?? "", /while thinking/);
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
    assert.match(routing?.body ?? "", /non-neutral mood/);
    assert.match(routing?.body ?? "", /neutral speech stays untagged/);
  });

  it("teaches canonical Coffee prompts without a regeneration step", () => {
    const topicStep = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Choose the spark",
    );

    assert.match(topicStep?.body ?? "", /four prompts created for this group/);
    assert.match(topicStep?.body ?? "", /framed under the Coffee navbar/);
    assert.doesNotMatch(topicStep?.body ?? "", /regenerate/i);
    assert.doesNotMatch(topicStep?.clickLabel ?? "", /regenerate/i);
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
      /Type \/ for Prompt Center prompts and ! for wildcard decks/u,
    );
  });

  it("explains Coffee's off-camera player and bot-only replay departures", () => {
    const joinStep = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Join the conversation",
    );

    assert.match(
      joinStep?.body ?? "",
      /clear table goodbye ends the session naturally/u,
    );
    assert.match(joinStep?.body ?? "", /Review stays quiet/u);
    assert.match(joinStep?.body ?? "", /remain off camera/u);
    assert.doesNotMatch(joinStep?.body ?? "", /Prism leave first/u);
    assert.match(joinStep?.body ?? "", /each bot physically depart/u);
  });

  it("explains automatic Signal audio quality and selective Premium repair", () => {
    const replayStep = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Watch the saved cut",
    );
    const copy = replayStep?.body ?? "";

    assert.match(copy, /recorded voice provenance/u);
    assert.match(copy, /already marked Premium audio and needs no extra step/u);
    assert.match(copy, /Repair voice action sends only the fallback line/u);
    assert.match(copy, /Upgrade voices sends only those non-Premium lines/u);
    assert.match(copy, /selective character, line, and request estimate/u);
    assert.match(copy, /without regeneration or rebilling/u);
    assert.match(copy, /immutable Original broadcast/u);
    assert.match(copy, /Hard LOCAL mode keeps the passive provenance status/u);
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
      "Approve revisions deliberately",
    );
  });

  it("explains shared mic-ready breaths without adding a setup gate", () => {
    assert.match(MODE_TUTORIALS.zen.steps[3]?.body ?? "", /Voice Effects on/u);
    assert.match(MODE_TUTORIALS.zen.steps[3]?.body ?? "", /mic-ready breath/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[4]?.body ?? "",
      /saved episodes choose them deterministically on replay/u,
    );
  });

  it("explains relative avatar-size Powers across live bot modes", () => {
    assert.match(MODE_TUTORIALS.zen.steps[0]?.body ?? "", /larger or smaller/u);
    assert.match(
      MODE_TUTORIALS.chat.steps[0]?.body ?? "",
      /larger or smaller/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /larger or smaller/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /larger or smaller/u,
    );
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /Microscopic/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /fully unseen even while speaking/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /half-translucent/u,
    );
  });

  it("explains that Auto requires substantive interview progress", () => {
    const setupCopy = MODE_TUTORIALS.botcast.steps[5]?.body ?? "";
    assert.match(setupCopy, /substantive guest answers/u);
    assert.match(setupCopy, /repeat a question/u);
    assert.match(setupCopy, /do not count as interview progress/u);
  });

  it("explains addressed fandom without weakening player or bot agency", () => {
    assert.match(MODE_TUTORIALS.zen.steps[0]?.body ?? "", /Obsessed persona/u);
    assert.match(MODE_TUTORIALS.chat.steps[0]?.body ?? "", /Obsessed bot/u);
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /player or peer/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
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
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Shapeshifter sincerely becomes/u,
    );
    const copy = [
      MODE_TUTORIALS.zen.steps[0]?.body,
      MODE_TUTORIALS.chat.steps[0]?.body,
      MODE_TUTORIALS.coffee.steps[0]?.body,
      MODE_TUTORIALS.botcast.steps[5]?.body,
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
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
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
    const producerGuestCopy = MODE_TUTORIALS.botcast.steps[5]?.body ?? "";
    assert.match(
      producerGuestCopy,
      /Sip coffee animates your stage mug and face with room Foley without sending a transcript turn/u,
    );
    assert.match(
      producerGuestCopy,
      /With Voice Effects on, fart, burp, and cough actions play matching room Foley live and in replay/u,
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
    }
    const slateCopy = MODE_TUTORIALS.slate.steps
      .map((step) => step.body)
      .join(" ");
    assert.doesNotMatch(
      slateCopy,
      /separate Action field|typing exactly \*\*|Shh/u,
    );
  });

  it("explains fixed Loud/Quiet presentation and Quiet's mood cost", () => {
    for (const mode of ["zen", "chat", "coffee", "botcast"] as const) {
      const copy = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(copy, /Loud and Quiet/u);
      assert.match(copy, /voice-volume|spoken volume/u);
      assert.match(copy, /half/u);
      assert.match(copy, /mood/u);
    }
  });

  it("presents the production applet as Signal", () => {
    assert.equal(MODE_TUTORIALS.botcast.title, "Signal producer walkthrough");
    const signalCopy = MODE_TUTORIALS.botcast.steps
      .map((step) => step.body)
      .join(" ");
    assert.match(
      signalCopy,
      /Cut show stops the current line[^.]*discards the episode[^.]*under ten seconds[^.]*no host sign-off or saved archive/u,
    );
    assert.match(signalCopy, /After that[^.]*quick, tactful sign-off/u);
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
      /echo-bound host[\s\S]*same blurb forever/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /keep using PRISM/u,
    );
    assert.match(MODE_TUTORIALS.botcast.steps[1]?.body ?? "", /activity card/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /Dark-to-Light studio pair/u,
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
      /replace either studio visual/u,
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
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /default stage places both bots/u,
    );
    assert.equal(
      MODE_TUTORIALS.botcast.steps[4]?.heading,
      "Choose how the bots speak",
    );
    assert.equal(
      MODE_TUTORIALS.botcast.steps[4]?.targetSelector,
      '[data-tutorial-target="botcast-voice-mode"]',
    );
    assert.match(MODE_TUTORIALS.botcast.steps[4]?.body ?? "", /matches Zen/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[4]?.body ?? "",
      /both host and guest/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[4]?.body ?? "",
      /Choose Voice before recording/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[4]?.body ?? "",
      /freezes that speaking type and English or Premium engine/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[4]?.body ?? "",
      /bakes the rendered mouth performance/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Pick LOCAL, AUTO, or ONLINE/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /configured fallback chain/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /locks that routing/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /skippable show-branded pre-roll/u,
    );
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /Book for me/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /physical actions float above their avatar and stay out of captions/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /model in the top navbar/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /choose the model there for tonight’s recording/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /AUTO uses that choice as Primary/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /hold Option.*Control.*Wield Prism.*Option Space.*Control Space.*Space rerolls.*Escape.*restores/u,
    );
    assert.doesNotMatch(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
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
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Me — go on as the guest/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /optional interview direction/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /leave it blank and let the host surprise you/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /standard composer at the bottom/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /queue cards, nudges, live direction, bot Powers, and AI-written guest turns stay out/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /addresses you on air by your account name/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /whatever you previously asked that host to call you/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Signal represents you on stage with your configured face and glyph; Coffee keeps you off camera with the pot/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /episode clock runs at half speed/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /replay compresses that pause to the same half-speed duration/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /returns to normal time for your answer/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /separate Action field without asterisks/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /typing exactly \*\* in the speech field moves focus to Action/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Send cuts the host at the exact words the audience heard/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Shh cuts the host without clearing your draft/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /show’s listeners would genuinely want to explore/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /short public episode title/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /richer provocative question.*private comments/u,
    );
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /stay editable/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Latest episodes can restore/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /current episode mode stays in place/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Episode length defaults to Auto/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /close-up pans center/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /dedicated fullscreen placement workspace/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /show-scoped room mix stay live there/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Host and Guest voice sliders to balance the cast/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /remembers each bot’s level for this show/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Test voices runs a random two-line soundcheck/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /never creates an episode or transcript/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[0]?.body ?? "",
      /optionally add a premise inspiration/u,
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
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /microphone foreground/u,
    );
    assert.equal(
      MODE_TUTORIALS.botcast.steps[6]?.heading,
      "Direct the live cut",
    );
    assert.equal(
      MODE_TUTORIALS.botcast.steps[6]?.targetSelector,
      '[data-tutorial-target="botcast-live-camera"]',
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /Left, Right, and Wide hold a fixed studio shot/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /opens on the full studio/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /keeps a human Producer guest framed while they compose and deliver each answer/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /switches to Wide whenever any bot is thinking or preparing its voice/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /moves to that bot only when speech begins/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /Animated or Instant/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /interruption cuts directly to the interrupter only when Instant is selected[\s\S]*Animated holds the current shot/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /Arrow keys cut live too: Left, Right, Down for Wide, and Up for Auto/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /press Shift alone/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /reduced-motion always uses instant cuts/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /Wide remains the underlying conversation shot/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /brief listener cut/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /choosing Auto again hands direction back/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /bakes every camera shot, its timestamp/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /effective Animated or Instant transition/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /transcript ownership with one primary speaker while allowing bot audio to overlap/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /studio performance own the live screen/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /restrained nonverbal reaction/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Ordinary listener reactions never inject scripted speech or cut the primary turn/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /interruptive cast member’s Power[\s\S]*short hold-on[\s\S]*annoyed, abandoned ending/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /at least 85 percent[\s\S]*does not add an annoyed ending or reclaim the floor/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /reject the cut-in and reclaim the next turn/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /only its audience-heard fragment/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /protects that single reclaim from another immediate interruption/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Repeated cutoffs build episode-local irritation/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /short verbal snark/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /visible \.\.\. as an intentional silent beat/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /without voice, mouth movement, or a speaker camera cut/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /up to four ordinary turns/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /requires a substantive on-air payoff/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /every cue is private to the host/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /guest only hears what the host says on mic/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Tab selects or deselects the Ask about… box[\s\S]*Enter sends that cue[\s\S]*Enter again runs Interrupt guest now/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /arrives early in the host’s own line[\s\S]*break off and redirect on mic[\s\S]*pivot lands a little awkwardly/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Once most of the point is already out[\s\S]*stays queued for the host’s next turn/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Interrupt guest now plays one of that host’s saved short interjections immediately[\s\S]*An echo-bound host instead cuts in by repeating the last audience-heard on-air phrase[\s\S]*at least 85 percent of the guest’s line has been heard[\s\S]*omits that annoyed follow-on[\s\S]*unheard remainder of the guest’s line is discarded/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /on-air clock shows elapsed episode time/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Wrap it up privately asks the host/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /clear in-character guest goodbye ends their turns/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Freeform producer pressure or Press harder/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /shows rail hides and the utility strip locks like Coffee[\s\S]*through the closing card until you Return to show/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /routing, model, Voice[\s\S]*stay closed through the closing card/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Animated or Instant camera control remains available/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /restores the full chrome/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /fade the stage to black or white[\s\S]*closing card appears and waits for you/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /immersive reactions still belong to the performing bot/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /asterisks in the saved transcript/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /full transcript stays out of the initial play and returns with playback/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /active line appears as a live caption after a brief half-second delay and clears as soon as that line ends/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /large bottom cue dock/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /grounded in that show and its recent episodes/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /outside your Library/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /does not add or book anyone/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /answer this off-air chat only with ‘\.\.\.’/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /another episode with that host and a bot guest/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /global response toggle at the top of Signal/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /Settings → Signal/u,
    );
    assert.equal(
      MODE_TUTORIALS.botcast.steps[8]?.targetSelector,
      '[data-tutorial-target="botcast-host-chat"]',
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /no post-episode camera controls/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /restores the full transcript beside the saved camera cut/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /play, pause, scrub/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /measured Signal intro row[\s\S]*calibrated duration[\s\S]*seeks back to the beginning/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /omit only the intervals where a bot is visibly and audibly thinking/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /Natural room silence, listener acknowledgements, interruptions, crosstalk, retorts/u,
    );
    assert.doesNotMatch(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /intro-length slider/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /automatic intro is calibrated to 8\.75 seconds[\s\S]*translates the baked transcript and mouth performance[\s\S]*camera timestamp and transition stays locked to the untouched audio master clock/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /Recorded replay replaces routing, model, and Voice controls/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /Copy for Signal Review/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /per-turn model routing/u,
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
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /originate one required opening.*immediately preceding on-air bot line exactly.*never leak/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /normal host owns that opening even when echo-bound/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Interrupt guest now still works for an echo-bound host[\s\S]*last audience-heard phrase/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /Copycat bot originate one opening/u,
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
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
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
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /only that addresser receives one bounded, persisted mood drag.*own personality.*without forced hatred, hopelessness, or agreement/u,
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
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /stay bounded while allowing a required introduction/u,
    );
  });

  it("explains that a Signal Power can remove a bot's coffee cup", () => {
    const booking = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Book tonight’s episode",
    );
    assert.match(booking?.body ?? "", /whether they have coffee at all/u);
    assert.match(booking?.body ?? "", /cups only for bots who drink coffee/u);
    assert.match(booking?.body ?? "", /drag the visible pieces/u);
    assert.match(booking?.body ?? "", /separate Host and Guest floor glows/u);
    assert.match(booking?.body ?? "", /extracted microphone masks/u);
    assert.match(booking?.body ?? "", /saved film grain/u);
    assert.match(booking?.body ?? "", /100% Overlay/u);
    assert.match(booking?.body ?? "", /faithful replay/u);
    assert.match(
      booking?.body ?? "",
      /Across Signal setup and the on-air composer, selected Prompt Center prompts and wildcard rolls insert as ordinary editable text/u,
    );
    assert.match(
      booking?.body ?? "",
      /Signal never renders those shortcuts as chips/u,
    );
    assert.match(
      booking?.body ?? "",
      /Topic field remains a single-line title input/u,
    );
    assert.match(booking?.body ?? "", /also with \/prompts and !decks/u);
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
      /throat-clear, light cough, sigh, exhale, or chuckle[\s\S]*stays out of the transcript and is saved for replay/u,
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
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /freezes the host and guest’s ready Powers/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /without overriding the other bot’s agency or boundaries/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /both frozen cast members are muted[\s\S]*short visual exchange and closing/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /both cast members are echo-bound[\s\S]*host closes by repeating the guest's last line/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /observable Power consequences through their own personality/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /never exposes a cause they cannot perceive/u,
    );
  });

  it("teaches exact hearing repeats and their stacking mood cost", () => {
    const coffeePowers = MODE_TUTORIALS.coffee.steps[0]?.body ?? "";
    const signalPowers = MODE_TUTORIALS.botcast.steps[5]?.body ?? "";

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
});
