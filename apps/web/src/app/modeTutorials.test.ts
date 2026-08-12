import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MODE_TUTORIALS, modeTutorialStep } from "./modeTutorials.ts";

describe("mode tutorials", () => {
  it("explains transient native Max without changing the ordinary ladder", () => {
    const copy = readFileSync(new URL("./modeTutorials.ts", import.meta.url), "utf8");
    assert.match(copy, /Extra High unlocks a separate Max overdrive toggle/u);
    assert.match(copy, /Auto and simulated Effort never use it/u);
    assert.match(copy, /Turbo remains an independent toggle.*combined with Max/u);
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
  });

  it("explains primary accent brightness without conflating Atmosphere", () => {
    const step = MODE_TUTORIALS.avatar.steps[2];
    assert.match(step?.body ?? "", /accent brightness/u);
    assert.match(step?.body ?? "", /only that color darker or brighter/u);
    assert.match(
      step?.body ?? "",
      /without changing the alloy or Atmosphere accent/u,
    );
  });

  it("explains that typed asset rails remember their own generation model", () => {
    const storageStep = MODE_TUTORIALS.chat.steps.find(
      (step) => step.body.includes("Space Lens"),
    );
    assert.ok(storageStep);
    assert.match(storageStep.body, /Each typed asset rail keeps its own remembered LOCAL or ONLINE generation model/u);
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

  it("teaches that the Zen header bot picker invites a guest into the current Home", () => {
    const continueHomeStep = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Continue this Home",
    );
    assert.ok(continueHomeStep);
    assert.match(continueHomeStep.body, /header bot picker invites them into this same conversation/u);
    assert.match(continueHomeStep.body, /Random, New, Intro, or Off handoff/u);
  });

  it("teaches explicit Zen avatar resizing without changing the authored face", () => {
    const step = MODE_TUTORIALS.zen.steps.find(
      (candidate) => candidate.heading === "Let context breathe",
    );
    assert.ok(step);
    assert.match(step.body, /Cmd\/Ctrl \+ enlarges it/u);
    assert.match(step.body, /Cmd\/Ctrl - shrinks it/u);
    assert.match(step.body, /Grow and Shrink from its context menu/u);
    assert.match(step.body, /compact sizes it becomes the crisp mini chassis/u);
    assert.match(step.body, /full textured avatar/u);
    assert.match(step.body, /firm maximum keeps the reading room clear/u);
    assert.match(step.body, /without changing the face/u);
  });

  it("teaches that crossing the Zen midpoint turns the complete avatar screen", () => {
    const step = MODE_TUTORIALS.zen.steps.find(
      (candidate) => candidate.heading === "Let the companion move",
    );
    assert.ok(step);
    assert.match(step.body, /may rest over prose or chrome/u);
    assert.match(step.body, /turns its face and authored Ink toward the room/u);
  });

  it("explains immersive waiting captions and the Psychic privacy boundary", () => {
    const step = MODE_TUTORIALS.chat.steps[0];
    assert.match(step?.body ?? "", /Shift-click bot cards/u);
    assert.match(step?.body ?? "", /right-click anywhere on the PRISM surface/u);
    assert.match(step?.body ?? "", /Escape closes that menu first/u);
    assert.match(step?.body ?? "", /short in-character activity caption/u);
    assert.match(
      step?.body ?? "",
      /submitted words stay off the canvas until their audio actually starts/u,
    );
    assert.match(
      step?.body ?? "",
      /Prompt Center send with wildcards first resolves to its concrete final wording/u,
    );
    assert.match(step?.body ?? "", /neither the raw command nor an unresolved placeholder flashes or speaks early/u);
    assert.match(step?.body ?? "", /if voice cannot start, Zen safely continues in text/u);
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
    assert.match(step?.body ?? "", /every simulated pass stays in the LOCAL lane/u);
    assert.match(step?.body ?? "", /does not simulate thinking for ONLINE models/u);
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
        assert.match(step.targetSelector, /^\[data-tutorial-target=/);
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
    assert.match(dashboardStep.body, /ordinary authored face and persona glyph/u);
    assert.match(dashboardStep.body, /no Power or status badge attached/u);
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
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /shared navbar stays available/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /model, and Effort settings/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /During active assembly/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /Only the PRISM wordmark remains available/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /prior draft restored/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /Auto chooses both model and effort automatically/u);
    assert.match(MODE_TUTORIALS.avatar.steps[0]!.body, /perimeter dock/u);
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /lights stay dim and breathing/u);
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /microphone-like accents/u);
    assert.match(MODE_TUTORIALS.avatar.steps[1]!.body, /display stays fixed/u);
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /default broken-bar blink starts 25% smaller and follows Eyes/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /drag either the top or bottom handle to place that seam/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /At 150% zoom, a pixel grid fades onto the CRT and ink draws as hard blocky cells/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /Coffee \* makes the custom mouth pucker and Speech ink switch together/u,
    );
    assert.match(
      MODE_TUTORIALS.avatar.steps[1]!.body,
      /Default follows ordinary speech shapes while talking; None keeps the authored mouth completely still/u,
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
    assert.match(MODE_TUTORIALS.avatar.steps[2]!.body, /visible shared navbar/u);
    assert.match(MODE_TUTORIALS.avatar.steps[2]!.body, /Save or Create bot/u);
    assert.match(MODE_TUTORIALS.avatar.steps[2]!.body, /Core for name/u);
  });

  it("explains the full-width Accent map in plain language", () => {
    const step = MODE_TUTORIALS.chat.steps.find(
      (candidate) => candidate.heading === "Shape an offline voice",
    );
    assert.ok(step);
    assert.match(step.body, /Accent, Local, and Premium stages/u);
    assert.match(step.body, /full-width map/u);
    assert.match(step.body, /anywhere in the world/u);
    assert.match(step.body, /pin stays exactly where you leave it/u);
    assert.match(step.body, /nearest broadly regional pronunciation/u);
    assert.match(step.body, /required Accent pin/u);
    assert.match(step.body, /Local voice and Feel/u);
    assert.match(step.body, /Premium voice and Feel/u);
    assert.match(step.body, /does not move the bot across regions/u);
    assert.match(step.body, /without exposing engine regions/u);
    assert.match(step.body, /All accents/u);
    assert.match(step.body, /Nearby choices/u);
    assert.match(step.body, /Original and With accent/u);
    assert.match(step.body, /same selected voice/u);
    assert.match(step.body, /One pin controls both engines/u);
    assert.match(step.body, /Premium may use a more specific named accent/u);
    assert.match(step.body, /Local uses the nearest qualified Speechprint approximation/u);
    assert.match(step.body, /same selected voice and engine/u);
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
    assert.doesNotMatch(step.body, /forces Voice to Mute|resumes automatically/u);
  });

  it("teaches the complete Debate contract with stable targets", () => {
    const tutorial = MODE_TUTORIALS.debate;
    assert.deepEqual(
      tutorial.steps.map((step) => step.targetSelector),
      [
        '[data-tutorial-target="debate-new"]',
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
      ],
    );
    const copy = tutorial.steps.map((step) => step.body).join(" ");
    assert.match(copy, /Studio follows one clear path/u);
    assert.match(copy, /opens as a Plainspoken Forum with Auto rounds/u);
    assert.match(copy, /Plain New Duel clears the active workbench/u);
    assert.match(copy, /Wield Prism onto New Duel desaturates the screen while a cold local model warms/u);
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
    assert.match(copy, /exact public authority shown on the center card/u);
    assert.match(copy, /title freezes with the saved Debate/u);
    assert.match(copy, /never changes the moderator bot’s identity/u);
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
      /Spectators and human Judges can open the four-seat Jury camera manually/u,
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
      /leading \+ lets you upload[\s\S]*Wielding Prism onto \+ is the directional synthesis shortcut/u,
    );
    assert.match(copy, /never reads or writes relationship memory/u);
    assert.match(
      copy,
      /Changing the motion, cast, format, formality, LOCAL\/ONLINE privacy lane, or Participant side also requires a fresh compatible check/u,
    );
    assert.match(copy, /idea dice remains available/u);
    assert.match(
      copy,
      /Prompt Center prompts insert as ordinary editable text/u,
    );
    assert.match(
      copy,
      /wildcard rolls stay as chips until you Build or Refract/u,
    );
    assert.match(copy, /A `\{VAR\}` inside a Prompt Center body/u);
    assert.match(copy, /only one shared capture and no A\/B\/C letter links/u);
    assert.match(copy, /floating Prism remains available throughout setup/u);
    assert.match(copy, /bounded, unsaved workbench draft/u);
    assert.match(copy, /Wield Prism into a glowing setup field/u);
    assert.match(
      copy,
      /shimmering field is locked[\s\S]*different registered input to queue it once[\s\S]*unique inputs in click order[\s\S]*repeat clicks[\s\S]*Escape restores the active field and clears the remaining queue/u,
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
    assert.match(copy, /After the verdict seals the Debate, the gallery strip clears/u);
    assert.match(copy, /Jury becomes the Jury Record/u);
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
    assert.match(copy, /saved provider, model, Effort, Turbo or Max state/u);
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
    assert.match(copy, /open the four-seat Jury camera manually once leanings, deliberation, or ballots begin/u);
    assert.match(copy, /Moderator records a fifth, final ballot last/u);
    assert.match(copy, /trade short reactions between public-floor turns/u);
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
    assert.match(copy, /Jury Record in the bottom Jury slot/u);
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
    assert.match(copy, /only that lane’s saved fallback chain/u);
    assert.match(copy, /LOCAL evaluates only local Ollama models/u);
    assert.match(copy, /ONLINE evaluates only configured OpenAI and Anthropic models/u);
    assert.match(
      copy,
      /ONLINE Auto provider lean slider: middle is Balanced \(pure cost and speed\)/u,
    );
    assert.match(
      copy,
      /In LOCAL Auto, clicking the hollow triangle gives a failed ignition/u,
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
      /PRISM automatically visits the chamber for leanings, audible deliberation, ballots, and the split/u,
    );
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
      /silent local gallery director watches only the recent audible public debate/u,
    );
    assert.match(gavelCopy, /none, laugh, gasp, or impressed/u);
    assert.match(gavelCopy, /explicit 1–3 intensity controls/u);
    assert.match(gavelCopy, /Most lines stay quiet/u);
    assert.match(gavelCopy, /LOCAL remains fully local/u);
    assert.match(gavelCopy, /bot Moderator sparsely strikes the gavel/u);
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
    assert.match(castCopy, /vertical hue lens/u);
    assert.match(castCopy, /Prism takes the center Judge \/ Moderator seat/u);
    assert.match(castCopy, /automatic neutral introduction/u);
    assert.match(castCopy, /Choose the two advocates/u);
    assert.match(
      castCopy,
      /Your seat & the Jury reveals Participant and Spectator roles/u,
    );
    const seatCopy =
      MODE_TUTORIALS.debate.steps.find(
        (step) =>
          step.targetSelector === '[data-tutorial-target="debate-seat"]',
      )?.body ?? "";
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
    assert.match(
      juryChamberCopy,
      /same CC control that toggles Forum captions also shows or hides spoken Jury chamber subtitles/u,
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
    assert.match(copy, /invisible visit clock/u);
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
        body: "Choose PRISM or a persona to focus that relationship’s Home. A first click focuses a persona; select the focused tile again to open its customization panel, or send a message to begin Zen/Chat. Ready Powers stay active with that persona here and across PRISM; a muted persona can still act, but only answers with ... and never speaks aloud, while a breathless persona still speaks but never produces breath, sigh, or inhale Foley; a Copycat persona may originate one opening if nobody has addressed them yet, then repeats the latest addressed message exactly. A short-term-amnesia persona only sees your current message each turn—no earlier replies or broader topic unless that message states it—and answers naturally without amnesia coaching. A John/Jane Doe persona sincerely believes a random persona name for the session and reshuffles that name whenever short-term amnesia clears continuity. An Obsessed persona treats you as the star of each reply with fresh, intense admiration, while your agency, privacy, and safety boundaries still win. A radiant-joy persona makes that emotional warmth palpable without tracking or rewriting your mood. A sad-grouchy persona makes her draining presence equally palpable without changing your state; only bots that directly talk to her lose mood or motivation. Physical-size Powers render a persona slightly larger or smaller without changing the room layout. Microscopic stays fully unseen even while speaking, while Invisible stays half-translucent. Loud and Quiet Powers apply a small fixed voice-volume and text-size shift without changing physical size or visibility; Quiet can go unheard on half its turns and lose a little mood. A hard bare-minimum or brief Power is engine-bounded even if the model tries to elaborate. Clicking empty canvas space jumps straight back to All Bots Home. Escape returns you to the wider Library or saved group grid exactly where you left it. Inviting a guest keeps you in the current Home.",
        clickLabel: "a PRISM or persona tile",
        targetSelector: '[data-tutorial-target="chat-bot-picker"]',
      },
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
    assert.equal(
      context?.body,
      "Recent messages stay visible while older continuity for this Home is carried through summaries and memory.",
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
    assert.match(setup?.body ?? "", /that lane’s optional ordered fallback chain/);
    assert.match(setup?.body ?? "", /Auto has no visible countdown/);
    assert.doesNotMatch(setup?.body ?? "", /hidden 30-minute ceiling/);
    assert.match(
      routing?.body ?? "",
      /Leave Model on Auto/,
    );
    assert.match(routing?.body ?? "", /suitable model and Effort for each table turn/);
    assert.match(routing?.body ?? "", /only that lane’s fallback chain/);
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
    assert.match(
      routing?.body ?? "",
      /entire utility strip for the whole table[^.]*until you choose End session on the live table chrome/u,
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

  it("teaches shared Chat/Zen voice separately from response and image routing", () => {
    const routing = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Choose how replies recover",
    );
    assert.match(
      routing?.body ?? "",
      /only that lane’s ordered fallback chain/,
    );
    assert.match(routing?.body ?? "", /Auto is the default model inside either lane/u);
    assert.match(
      routing?.body ?? "",
      /Every fallback uses None for speed/u,
    );
    assert.match(
      routing?.body ?? "",
      /Image generation keeps its own LOCAL\/ONLINE choice/,
    );
    assert.match(routing?.body ?? "", /Voice remains independent from text routing/u);
    assert.match(
      routing?.body ?? "",
      /Chat and Zen share your saved Mute, English, Premium, Babble, or Bottish choice, while LOCAL hides Premium from the picker/u,
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
      /Type \/ for Prompt Center prompts and ! for wildcard decks/u,
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
      /Review waits until those goodbyes finish/u,
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

    assert.match(copy, /compact host and guest portraits/u);
    assert.match(copy, /click, right-click, or long-press a Library bot/u);
    assert.match(copy, /recorded voice provenance/u);
    assert.match(copy, /already marked Premium audio and needs no extra step/u);
    assert.match(copy, /Repair voice action sends only the fallback line/u);
    assert.match(copy, /Upgrade voices sends only those non-Premium lines/u);
    assert.match(copy, /selective character, line, and request estimate/u);
    assert.match(copy, /without regeneration or rebilling/u);
    assert.match(copy, /immutable Original broadcast/u);
    assert.match(copy, /Hard LOCAL mode keeps the passive provenance status/u);
  });

  it("teaches persona comments, intentional reaction cuts, and the formal Signal close", () => {
    const camera = MODE_TUTORIALS.botcast.steps[6]?.body ?? "";
    const controlRoom = MODE_TUTORIALS.botcast.steps[7]?.body ?? "";
    assert.match(
      camera,
      /interruption clips under 2\.5 seconds stay off-camera/u,
    );
    assert.match(
      camera,
      /social-silence beat belongs to the silent bot on camera/u,
    );
    assert.match(
      controlRoom,
      /brief contextual comment in that character’s own voice/u,
    );
    assert.match(
      controlRoom,
      /Ordinary listener comments never take transcript ownership or interrupt the primary turn/u,
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
    assert.match(MODE_TUTORIALS.zen.steps[3]?.body ?? "", /Voice Effects on/u);
    assert.match(MODE_TUTORIALS.zen.steps[3]?.body ?? "", /mic-ready breath/u);
    assert.match(
      MODE_TUTORIALS.zen.steps[3]?.body ?? "",
      /punctuation pauses stay quiet/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps
        .map((step) => step.body)
        .join(" "),
      /punctuation pauses stay quiet/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[4]?.body ?? "",
      /saved episodes choose them deterministically on replay/u,
    );
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
    const signalCopy = MODE_TUTORIALS.botcast.steps[5]?.body ?? "";
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
    const setupCopy = MODE_TUTORIALS.botcast.steps[5]?.body ?? "";
    assert.match(setupCopy, /substantive guest answers/u);
    assert.match(setupCopy, /repeat a question/u);
    assert.match(setupCopy, /do not count as interview progress/u);
  });

  it("teaches hard-speech Producer-guest experiments instead of blocking them", () => {
    const setupCopy = MODE_TUTORIALS.botcast.steps[5]?.body ?? "";
    assert.match(
      setupCopy,
      /Hard mute and echo hosts can still take a Producer guest/u,
    );
    assert.match(setupCopy, /on-air floor in canonical silence/u);
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
        assert.match(
          copy,
          /recognized vocal Action such as laughs becomes an ElevenLabs performance direction/u,
        );
        assert.match(
          copy,
          /fart, burp, and cough actions stay out of the voice request and play their bundled local Foley/u,
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
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /neutral too-faint event/u,
    );
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
      /studio upload requires both Light and Dark/u,
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
      /Pick LOCAL or ONLINE/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /configured fallback chain/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /locks LOCAL\/ONLINE, model, and Effort/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Auto still chooses model and Effort/u,
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
      /Chat, Coffee, Signal, Debate, and Slate use the same persistent PRISM navbar/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Chat\/Zen is the default Home and does not appear as a selectable applet[\s\S]*LOCAL\/ONLINE privacy lane, Model, Effort, bot, and Voice controls stay in that navbar before and throughout a conversation[\s\S]*hero keeps only the Private chat toggle[\s\S]*navbar shows Private chat as locked status rather than a switch/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /a fixed model bypasses Auto/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Leave Model on Auto to let Prism choose a suitable model and Effort/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /hold Option.*Control.*Wield Prism.*active field locks.*queue it once.*unique inputs in click order.*repeat clicks.*Escape restores the active field.*Control \+ Option.*opens the assistant menu at the orb/u,
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
      /Signal represents you on stage with your configured face and glyph; Coffee keeps you off camera with the pot during the live table, then seats you as Default Prism for replay/u,
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
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /each keeps its own encrypted, directional memory drawn only from the audience-visible show/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Unrelated pairs still meet fresh; discarded shows, Producer-guest episodes, and private producer comments never become shared bot history/u,
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
      /Watch prepares ahead with a progressive bake/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /shorter opening runway/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /keeps its booking in Latest episodes for a clean retry/u,
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
      /uses editorial hard cuts exactly as audible host and guest speech begins/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /genuinely thinking, loading a voice, or visibly waiting/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /push begins only with the audible pre-speech presence/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /ready handoff never flashes Wide or glides late/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /Sustained audible interruptions cut directly to the interrupter/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /Arrow keys cut live too: Left, Right, Down for Wide, and Up for Auto/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /Prepared text alone never changes the camera/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /whether the visible cut was instant or the brief thinking push was animated/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /Wide remains the underlying conversation shot/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /interruption clips under 2\.5 seconds stay off-camera[\s\S]*listener cut/u,
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
      /whether the visible cut was instant or the brief thinking push was animated/u,
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
      /brief contextual comment in that character’s own voice/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Ordinary listener comments never take transcript ownership or interrupt the primary turn/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /interruption clips under 2\.5 seconds stay off-camera/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /social-silence beat belongs to the silent bot on camera/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /formal closing beat[\s\S]*thank the guest and the audience/u,
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
      /on-air clock measures active presentation/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Background lookahead under an audible line still counts/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /foreground model readiness, reasoning, generation, or blocking voice preparation pauses the clock/u,
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
      /shared navbar fully hides[\s\S]*Cut on stage ends the sit[\s\S]*through the closing card until you Return to show[\s\S]*quiet model · effort chip stays in the live topline/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /[Rr]outing, model, Effort, Voice[\s\S]*stay locked through the closing card/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /completed, cancelled, or discarded closing card keeps Copy for Signal Review available/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /camera grammar is fixed: ready dialogue and live interruptions cut/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /restores the full chrome/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /stage fades to black or white[\s\S]*closing card appears/u,
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
      /active line appears as a live caption in step with the voice and clears as soon as that line ends/u,
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
    assert.match(
      MODE_TUTORIALS.coffee.steps.map((step) => step.body).join("\n"),
      /Copycat keeps its copied cutoff.*follow-on reaction is only \.\.\./u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps.map((step) => step.body).join("\n"),
      /Copycat keeps its copied cutoff.*follow-on reaction is only \.\.\./u,
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
    assert.match(booking?.body ?? "", /Hard Light, Screen, or Overlay/u);
    assert.match(booking?.body ?? "", /100% Hard Light/u);
    assert.match(booking?.body ?? "", /faithful replay/u);
    assert.match(
      booking?.body ?? "",
      /Across Signal setup and the on-air composer, selected Prompt Center prompts insert as ordinary editable text/u,
    );
    assert.match(
      booking?.body ?? "",
      /wildcard rolls stay as chips until you save, begin the episode, or send/u,
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

  it("teaches the floating Prism Synthesis, Chat, and Notes views", () => {
    for (const mode of ["chat", "zen"] as const) {
      const body = MODE_TUTORIALS[mode].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(body, /switch between Synthesis, Chat, and Notes/u);
      assert.match(body, /opens that prompt in Images without generating/u);
      assert.match(body, /same saved or Private Prism conversation/u);
      assert.match(body, /create, reopen, edit, and delete/u);
      assert.match(body, /personal Notes stay unavailable.*Private/u);
      assert.match(body, /default bot overview.*Home mark/u);
      assert.match(body, /Opening Settings, Avatar Studio.*visually submerges the passive orb/u);
      assert.match(body, /Wield and contextual field population available above the panel/u);
      assert.match(body, /Closing the panel restores Prism/u);
      assert.match(body, /ordinary surfaces.*shortcut opens this menu at the orb's current location/u);
      assert.match(body, /eligible text field.*contextual editable draft/u);
      assert.match(body, /Keep Option held.*queue each once in click order/u);
      assert.match(body, /fills them consecutively/u);
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
});
