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

  it("explains that Coffee cross-talk controls audible backchannels", () => {
    const joinCopy = MODE_TUTORIALS.coffee.steps[4]?.body ?? "";
    assert.match(joinCopy, /brief spoken acknowledgement/u);
    assert.match(joinCopy, /Cross-talk setting/u);
    assert.match(joinCopy, /audible overlaps/u);
    assert.match(joinCopy, /ElevenLabs throat-clear, light cough/u);
    assert.match(joinCopy, /inferred listeners remain visual only/u);
    assert.match(joinCopy, /sparse mic-ready breath/u);
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
    assert.match(MODE_TUTORIALS.chat.steps[0]?.body ?? "", /larger or smaller/u);
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /larger or smaller/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /larger or smaller/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /Microscopic/u);
  });

  it("explains fixed Loud/Quiet presentation and Quiet's mood cost", () => {
    for (const mode of ["zen", "chat", "coffee", "botcast"] as const) {
      const copy = MODE_TUTORIALS[mode].steps.map((step) => step.body).join(" ");
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
      /Cut show stops the current line[^.]*quick, tactful sign-off[^.]*archives the recording/u,
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
      /physical actions float above their avatar and stay out of captions/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /selected episode model/u,
    );
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /small dice/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Me — go on as the guest/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /supply only source context/u,
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
      /addresses you on air as the Producer/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /episode clock runs at half speed/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /visible thinking beat/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /leading \*action\*/u,
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
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /stay editable/u,
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
      /moves to the host/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /Animated or Instant/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /reduced-motion always uses instant cuts/u,
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
      /records every camera choice/u,
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
      /brief conversational acknowledgement/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /calm backchannels overlap naturally without creating a turn/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /genuinely annoyed[\s\S]*brief audible interjection/u,
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
      /arrives early in the host’s own line[\s\S]*break off and redirect on mic[\s\S]*pivot lands a little awkwardly/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Once most of the point is already out[\s\S]*stays queued for the host’s next turn/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Interrupt guest now plays one of that host’s saved short interjections immediately[\s\S]*unheard remainder of the guest’s line is discarded/u,
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
      /play, pause, scrub/u,
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
      '[data-tutorial-target="slate-project-chat"]',
      '[data-tutorial-target="slate-deliberation"]',
      '[data-tutorial-target="slate-revision"]',
    ]);
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /\{wildcards\}/i);
    assert.match(
      MODE_TUTORIALS.slate.steps[0]?.body ?? "",
      /creative spark or pages/i,
    );
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /replaces the spark controls/i);
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /prose model to generate/i);
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /visible title checkpoint/i);
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /never renames/i);
    assert.match(
      MODE_TUTORIALS.slate.steps[0]?.body ?? "",
      /waits for your confirmation or another try/i,
    );
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /privacy-matched book cover/i);
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /regenerate either title or cover/i);
    assert.match(MODE_TUTORIALS.slate.steps[0]?.body ?? "", /project shelf becomes home/i);
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
    assert.match(MODE_TUTORIALS.slate.steps[7]?.body ?? "", /stop at any point/u);
    assert.match(MODE_TUTORIALS.slate.steps[7]?.body ?? "", /never edits prose/u);
    assert.match(MODE_TUTORIALS.slate.steps[2]?.body ?? "", /receipt/i);
    assert.match(
      MODE_TUTORIALS.slate.steps.at(-3)?.body ?? "",
      /never edits prose/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps.at(-3)?.body ?? "",
      /last three/i,
    );
    assert.match(
      MODE_TUTORIALS.slate.steps.at(-3)?.body ?? "",
      /fade/i,
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

    assert.deepEqual(chooseRelationship, {
      heading: "Choose a relationship",
      body: "Choose PRISM or a persona to enter that relationship’s Home. Ready Powers stay active with that persona here and across PRISM; a muted persona can still act, but only answers with ... and never speaks aloud, while an echo-bound persona repeats the latest message addressed to them exactly. Physical-size Powers render a persona slightly larger or smaller without changing the room layout, and Microscopic combines the smaller form with an unseen idle presence. Loud and Quiet Powers apply a small fixed voice-volume and text-size shift; Quiet can go unheard on half its turns and lose a little mood, while Loud overrides small, Microscopic, and invisible presentation. A hard bare-minimum or brief Power is engine-bounded even if the model tries to elaborate. Back or Escape returns you to the wider Library or saved group grid exactly where you left it. Inviting a guest keeps you in the current Home.",
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

  it("teaches exact echo Powers in every active bot-speaking lane", () => {
    assert.match(MODE_TUTORIALS.zen.steps[0]?.body ?? "", /echo-bound persona.*exactly/u);
    assert.match(MODE_TUTORIALS.chat.steps[0]?.body ?? "", /echo-bound bot.*adds nothing/u);
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /repeat the exact user or bot line/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /immediately preceding on-air cast line exactly.*never leak/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /echo-bound bot is the host.*bot guest takes the opening and closing/u,
    );
  });

  it("teaches engine-bounded response Powers in every active bot-speaking lane", () => {
    assert.match(MODE_TUTORIALS.zen.steps[0]?.body ?? "", /engine-bounded/u);
    assert.match(MODE_TUTORIALS.chat.steps[0]?.body ?? "", /engine-bounded/u);
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /bound each table reply/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /stay bounded while allowing a required introduction/u);
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
    assert.match(routing?.body ?? "", /five included PRISM voices/);
    assert.match(routing?.body ?? "", /operating-system voices are optional/);
    assert.match(
      routing?.body ?? "",
      /choose an ElevenLabs voice from the list or open “Use an exact Voice ID” for a portable override/,
    );
    assert.match(routing?.body ?? "", /only for eligible ONLINE speech/);
    assert.match(routing?.body ?? "", /Voice Settings can narrow/);
    assert.match(routing?.body ?? "", /one ElevenLabs voice collection/);
    assert.match(routing?.body ?? "", /Tone tab gives each bot a Voice Character pad/);
    assert.match(routing?.body ?? "", /relative to your account Voice Volume/);
    assert.match(routing?.body ?? "", /non-neutral mood/);
    assert.match(routing?.body ?? "", /neutral speech stays untagged/);
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
    assert.match(signalVoice?.body ?? "", /saved vocal reaction takes precedence/);
  });

  it("teaches dead-air asides and each mode's ambient sip contract", () => {
    const coffee = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Join the conversation",
    );
    const signal = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Choose how the bots speak",
    );

    assert.match(coffee?.body ?? "", /dead air/);
    assert.match(coffee?.body ?? "", /without stealing the slow bot’s turn/);
    assert.match(coffee?.body ?? "", /Ambient sips continue through quiet beats and listening moments/);
    assert.match(coffee?.body ?? "", /active speaker keeps their cup down/);
    assert.match(coffee?.body ?? "", /cup-return sounds stay synchronized/);
    assert.match(signal?.body ?? "", /awkward dead air/);
    assert.match(signal?.body ?? "", /original answer keeps generating/);
    assert.match(signal?.body ?? "", /Ambient sips land only while the other bot is talking/);
    assert.match(signal?.body ?? "", /cup-return sounds stay synchronized/);
  });

  it("teaches sparse provider vocal Foley in Coffee and Signal", () => {
    assert.match(
      MODE_TUTORIALS.coffee.steps.map((step) => step.body).join(" "),
      /throat-clear, light cough, sigh, exhale, or chuckle/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps.map((step) => step.body).join(" "),
      /stays out of the transcript and is saved for replay/u,
    );
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

  it("explains Coffee's player-first replay departure sequence", () => {
    const joinStep = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Join the conversation",
    );

    assert.match(
      joinStep?.body ?? "",
      /clear table goodbye ends the session naturally/u,
    );
    assert.match(joinStep?.body ?? "", /Review stays quiet/u);
    assert.match(joinStep?.body ?? "", /Prism leave first/u);
    assert.match(joinStep?.body ?? "", /each bot physically depart/u);
  });

  it("teaches one-response candor and Signal's frozen episode Powers", () => {
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /trustworthy direct question/u);
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /more candid next answer/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /freezes the host and guest’s ready Powers/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /without overriding the other bot’s agency or boundaries/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /both frozen cast members are muted[\s\S]*short visual exchange and closing/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /two echo-bound bots cannot be booked together because neither can originate that opening/u,
    );
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /observable Power consequences through their own personality/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /never exposes a cause they cannot perceive/u);
  });

  it("teaches exact hearing repeats and their stacking mood cost", () => {
    const coffeePowers = MODE_TUTORIALS.coffee.steps[0]?.body ?? "";
    const signalPowers = MODE_TUTORIALS.botcast.steps[5]?.body ?? "";

    assert.match(coffeePowers, /hard-of-hearing bot asks what the prior speaker said/u);
    assert.match(coffeePowers, /repeats its saved line and loses a little mood each time/u);
    assert.match(signalPowers, /prior speaker repeats its saved on-air line/u);
    assert.match(signalPowers, /saved delivery mood drops one step each time/u);
    assert.match(signalPowers, /Direct producer direction and closing safety still take priority/u);
  });

  it("teaches bounded automatic Signal interruptions and protected states", () => {
    const controlRoom = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Produce from the control room",
    )?.body ?? "";
    assert.match(controlRoom, /interruptive host Power/u);
    assert.match(controlRoom, /frequency, strength, target, and cooldown/u);
    assert.match(
      controlRoom,
      /human Producer speech, warnings, departures, wraps, closings, and hard speech restrictions stay protected/u,
    );
  });
});
