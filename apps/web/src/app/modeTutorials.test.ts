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
    assert.equal(modeTutorialStep("coffee", 99).heading, "Join the conversation");
    assert.equal(modeTutorialStep("botcast", 99).heading, "Direct the replay");
    assert.equal(modeTutorialStep("slate", 99).heading, "Approve revisions deliberately");
  });

  it("presents the production applet as Signal", () => {
    assert.equal(MODE_TUTORIALS.botcast.title, "Signal producer walkthrough");
    assert.equal(MODE_TUTORIALS.botcast.steps[1]?.heading, "Shape the show’s identity");
    assert.equal(
      MODE_TUTORIALS.botcast.steps[1]?.targetSelector,
      '[data-tutorial-target="botcast-brand-controls"]',
    );
    assert.match(MODE_TUTORIALS.botcast.steps[0]?.body ?? "", /never waits on synthesis/u);
    assert.match(MODE_TUTORIALS.botcast.steps[1]?.body ?? "", /Create this show’s look once/u);
    assert.match(MODE_TUTORIALS.botcast.steps[1]?.body ?? "", /find a clever name/u);
    assert.match(MODE_TUTORIALS.botcast.steps[1]?.body ?? "", /matching Light and Dark studios/u);
    assert.match(MODE_TUTORIALS.botcast.steps[1]?.body ?? "", /refresh the name, either studio, or the logo independently/u);
    assert.match(MODE_TUTORIALS.botcast.steps[1]?.body ?? "", /replace any visual/u);
    assert.match(MODE_TUTORIALS.botcast.steps[2]?.body ?? "", /Pick LOCAL or ONLINE/u);
    assert.match(MODE_TUTORIALS.botcast.steps[2]?.body ?? "", /locks that lane and choice/u);
  });

  it("teaches Slate as a directed document workflow with stable targets", () => {
    const headings = MODE_TUTORIALS.slate.steps.map((step) => step.heading);
    const selectors = MODE_TUTORIALS.slate.steps.map((step) => step.targetSelector);
    assert.deepEqual(headings, [
      "Start from a spark",
      "Shape before drafting",
      "Direct the structure",
      "Let Slate carry the draft",
      "Keep your hands on the prose",
      "Approve revisions deliberately",
    ]);
    assert.deepEqual(selectors, [
      '[data-tutorial-target="slate-create-project"]',
      '[data-tutorial-target="slate-shape"]',
      '[data-tutorial-target="slate-structure"]',
      '[data-tutorial-target="slate-draft"]',
      '[data-tutorial-target="slate-manuscript"]',
      '[data-tutorial-target="slate-revision"]',
    ]);
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /\{wildcards\}/i);
    assert.match(MODE_TUTORIALS.slate.steps.at(-1)?.body ?? "", /accept or reject/i);
  });

  it("teaches Zen navigation as relationship-specific Homes", () => {
    const [chooseRelationship, groupRoom, continueHome, , context] =
      MODE_TUTORIALS.zen.steps;

    assert.deepEqual(chooseRelationship, {
      heading: "Choose a relationship",
      body: "Choose PRISM or a persona to enter that relationship’s Home. Back or Escape returns you to the wider Library or group room exactly where you left it. Inviting a guest keeps you in the current Home.",
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
    assert.match(
      routing?.body ?? "",
      /changes response routing, not the Account default model choice/,
    );
    assert.match(routing?.body ?? "", /separate Images provider/);
  });

  it("teaches that Zen response and image routing are separate", () => {
    const routing = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Choose how replies recover",
    );
    assert.match(routing?.body ?? "", /Image generation keeps its own LOCAL\/ONLINE choice/);
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
    assert.match(joinStep?.body ?? "", /drag its left edge or the topic divider/);
  });
});
