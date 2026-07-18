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

  it("presents the production applet as Signal", () => {
    assert.equal(MODE_TUTORIALS.botcast.title, "Signal producer walkthrough");
    const signalCopy = MODE_TUTORIALS.botcast.steps
      .map((step) => step.body)
      .join(" ");
    assert.match(
      signalCopy,
      /Cut show immediately cuts away[^.]*archives the recording/u,
    );
    assert.match(signalCopy, /short, locally synthesized outro/u);
    assert.equal(
      MODE_TUTORIALS.botcast.steps[1]?.heading,
      "Shape the show’s identity",
    );
    assert.equal(
      MODE_TUTORIALS.botcast.steps[1]?.targetSelector,
      '[data-tutorial-target="botcast-brand-controls"]',
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
      /Create this show’s look once/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /find a clever name/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /host-shaped dashboard blurbs/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /regenerate just those blurbs/u,
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
      /six-second ident plus a looping, non-musical ambience/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /custom art, its gear can create or refresh/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /no key or network/u,
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
      /change it before or during an episode/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[4]?.body ?? "",
      /next line instead of cutting off/u,
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
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Randomize booking/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /fill all three locally/u,
    );
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /small dice/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /guest-aware suggestion/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /stays editable/u,
    );
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
      /only development mix sliders stay live there/u,
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
      /moves to the host/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /keeps Wide as the underlying conversation shot/u,
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
      /records every choice/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /one primary speaker on mic at a time/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /words they have finished saying/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /queues the private cue/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /host’s next turn/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Wrap it up is shared episode direction/u,
    );
    assert.match(MODE_TUTORIALS.botcast.steps[7]?.body ?? "", /both bots/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /session-changing navbar tools stay locked/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /restores the full chrome/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /left rail while on air makes the same producer cut/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /end card waits for you/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /immersive reactions still belong to the performing bot/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /asterisks in the transcript/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /no post-episode camera controls/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /play, pause, scrub/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /Copy for Signal Review/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /per-turn model routing/u,
    );
  });

  it("teaches Slate as a directed document workflow with stable targets", () => {
    const headings = MODE_TUTORIALS.slate.steps.map((step) => step.heading);
    const selectors = MODE_TUTORIALS.slate.steps.map(
      (step) => step.targetSelector,
    );
    assert.deepEqual(headings, [
      "Start from a spark",
      "Shape before drafting",
      "Choose the prose engine",
      "Direct the structure",
      "Let Slate carry the draft",
      "Keep your hands on the prose",
      "Talk beside the document",
      "Approve revisions deliberately",
    ]);
    assert.deepEqual(selectors, [
      '[data-tutorial-target="slate-create-project"]',
      '[data-tutorial-target="slate-shape"]',
      '[data-tutorial-target="slate-ai-controls"]',
      '[data-tutorial-target="slate-structure"]',
      '[data-tutorial-target="slate-draft"]',
      '[data-tutorial-target="slate-manuscript"]',
      '[data-tutorial-target="slate-project-chat"]',
      '[data-tutorial-target="slate-revision"]',
    ]);
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /\{wildcards\}/i);
    assert.match(
      MODE_TUTORIALS.slate.steps[0]?.body ?? "",
      /one creative spark or pages/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps[0]?.body ?? "",
      /waits for your confirmation/i,
    );
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /story-so-far/i);
    assert.match(
      MODE_TUTORIALS.slate.steps[2]?.body ?? "",
      /OFFLINE, AUTO, or ONLINE/,
    );
    assert.match(MODE_TUTORIALS.slate.steps[2]?.body ?? "", /receipt/i);
    assert.match(
      MODE_TUTORIALS.slate.steps.at(-2)?.body ?? "",
      /never edits prose/i,
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

    assert.deepEqual(chooseRelationship, {
      heading: "Choose a relationship",
      body: "Choose PRISM or a persona to enter that relationship’s Home. Ready Powers stay active with that persona here and across PRISM. Back or Escape returns you to the wider Library or group room exactly where you left it. Inviting a guest keeps you in the current Home.",
      clickLabel: "a PRISM or persona tile",
      targetSelector: '[data-tutorial-target="chat-bot-picker"]',
    });
    assert.deepEqual(continueHome, {
      heading: "Continue this Home",
      body: "Each Home keeps its own Zen relationship and episodes. Type here to continue the one you are visiting.",
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

  it("introduces saved room Atmospheres alongside waiting-room Coffee staging", () => {
    const atmosphere = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Shape a saved group's room",
    );
    assert.match(atmosphere?.body ?? "", /reusable room backdrop/);
    assert.match(atmosphere?.body ?? "", /Listen up prompt stages 2-5 bots/);
    assert.equal(
      atmosphere?.targetSelector,
      '[data-tutorial-target="chat-group-atmosphere"]',
    );
  });

  it("distinguishes Coffee response routing from the account default model", () => {
    const [, setup, , routing] = MODE_TUTORIALS.coffee.steps;

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
    assert.match(
      setup?.body ?? "",
      /Auto duration is open-ended with no countdown/,
    );
    assert.match(
      routing?.body ?? "",
      /changes response routing, not the Account default model choice/,
    );
    assert.match(routing?.body ?? "", /separate Images provider/);
    assert.match(routing?.body ?? "", /English voice preference/);
    assert.match(routing?.body ?? "", /locked until you choose End session/);
    assert.match(
      routing?.body ?? "",
      /Usage and Memories plus the Theme control remain available/,
    );
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

  it("explains that a Signal Power can remove a bot's coffee cup", () => {
    const booking = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Book tonight’s episode",
    );
    assert.match(booking?.body ?? "", /whether they have coffee at all/u);
    assert.match(booking?.body ?? "", /cups only for bots who drink coffee/u);
    assert.match(booking?.body ?? "", /drag the visible pieces/u);
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
      /choose an ElevenLabs voice from the list or open “Use an exact Voice ID” for a portable override/,
    );
    assert.match(routing?.body ?? "", /only for eligible ONLINE speech/);
    assert.match(routing?.body ?? "", /Voice Settings can narrow/);
    assert.match(routing?.body ?? "", /one ElevenLabs voice collection/);
  });

  it("teaches canonical Coffee prompts without a regeneration step", () => {
    const topicStep = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Choose the spark",
    );

    assert.match(topicStep?.body ?? "", /four prompts created for this group/);
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
  });
});
