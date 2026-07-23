import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MODE_TUTORIALS, modeTutorialStep } from "./modeTutorials.ts";

describe("mode tutorials", () => {
  it("teaches that the selected Signal Auto model is Primary", () => {
    const setup = MODE_TUTORIALS.botcast.steps[5]?.body ?? "";
    assert.match(setup, /model picker shows every local and online model/u);
    assert.match(setup, /choice is Primary/u);
    assert.match(setup, /configured fallback chain/u);
  });

  it("explains holder-scoped bot-name prefixes and suffixes", () => {
    for (const mode of ["zen", "chat", "coffee", "botcast"] as const) {
      const copy = MODE_TUTORIALS[mode].steps.map((step) => step.body).join(" ");
      assert.match(copy, /changes only how its holder names other bots/u);
      assert.match(copy, /holder keeps their own name/u);
      assert.match(copy, /other speakers do not copy/u);
      assert.match(copy, /may comment once, show a small contextual mood, tone, or action reaction, or let it pass/u);
      assert.match(copy, /personality and agency decide/u);
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

  it("teaches Signal host search and saved-group filtering", () => {
    const createShowStep = MODE_TUTORIALS.botcast.steps[0];
    assert.match(createShowStep?.body ?? "", /Search by bot name/u);
    assert.match(createShowStep?.body ?? "", /saved bot groups/u);
    assert.equal(
      createShowStep?.targetSelector,
      '[data-tutorial-target="botcast-create-show"]',
    );
  });

  it("teaches the generated Studio lighting map and its private default", () => {
    const atmosphereCopy = MODE_TUTORIALS.botcast.steps[3]?.body ?? "";
    assert.match(atmosphereCopy, /coordinates the show’s studio and sound/u);
    assert.match(atmosphereCopy, /source-linked Light studio/u);
    assert.match(atmosphereCopy, /lighting map in the background/u);
    assert.match(atmosphereCopy, /LOCAL stays private/u);
    assert.match(atmosphereCopy, /Signal Synth/u);
    assert.match(atmosphereCopy, /skips ElevenLabs/u);
    assert.match(atmosphereCopy, /rebuild stale lighting/u);
    assert.match(atmosphereCopy, /current artwork stay in place/u);
    assert.doesNotMatch(atmosphereCopy, /Sound identity|Studio pair/u);
  });

  it("clamps restored progress to a valid step", () => {
    assert.equal(modeTutorialStep("zen", -1).heading, "Choose a relationship");
    assert.equal(
      modeTutorialStep("coffee", 99).heading,
      "Join the conversation",
    );
    assert.equal(
      modeTutorialStep("botcast", 99).heading,
      "Replay or enhance audio",
    );
    assert.equal(
      modeTutorialStep("slate", 99).heading,
      "Approve revisions deliberately",
    );
  });

  it("teaches that Prism steps out during live Signal and Coffee sessions", () => {
    const coffeeLiveCopy = MODE_TUTORIALS.coffee.steps.at(-1)?.body ?? "";
    const signalLiveCopy = MODE_TUTORIALS.botcast.steps[7]?.body ?? "";
    assert.match(
      coffeeLiveCopy,
      /Prism's floating assistant steps out once the live Coffee Session begins/u,
    );
    assert.match(coffeeLiveCopy, /returns for setup, review, and replay/u);
    assert.match(
      signalLiveCopy,
      /Prism's floating assistant steps out for the full live episode/u,
    );
    assert.match(signalLiveCopy, /returns on the show dashboard and in replay/u);
  });

  it("teaches the full-screen Coffee Group creation handoff", () => {
    const groupCreationCopy = MODE_TUTORIALS.coffee.steps[0]?.body ?? "";
    assert.match(
      groupCreationCopy,
      /Creating a new Coffee Group opens a full-screen PRISM handoff/u,
    );
    assert.match(groupCreationCopy, /name and conversation starters take shape/u);
  });

  it("teaches faithful audio replay and separate Eleven v3 enhancement", () => {
    const coffeeCopy = MODE_TUTORIALS.coffee.steps.at(-1)?.body ?? "";
    const signalCopy = MODE_TUTORIALS.botcast.steps.at(-1)?.body ?? "";
    assert.match(coffeeCopy, /faithful third-person cut of the saved Coffee table automatically/u);
    assert.match(coffeeCopy, /frozen bot appearances and voices/u);
    assert.match(coffeeCopy, /isolated background renderer/u);
    assert.match(coffeeCopy, /adds no AI conversation turn/u);
    assert.match(coffeeCopy, /Signal-like header/u);
    assert.match(coffeeCopy, /copies the full transcript to your clipboard/u);
    assert.match(coffeeCopy, /instead of exporting a transcript file/u);
    assert.match(signalCopy, /flattened live master/u);
    assert.match(signalCopy, /verbatim instead of being reconstructed/u);
    assert.match(signalCopy, /same branded intro/u);
    assert.match(signalCopy, /opens its replay immediately/u);
    assert.match(signalCopy, /with honest loading feedback/u);
    assert.match(signalCopy, /Video export is disabled/u);
    assert.match(signalCopy, /compatibility fallback/u);
    assert.match(signalCopy, /explicit ONLINE action/u);
    assert.match(signalCopy, /may be sent to ElevenLabs and consume credits/u);
    assert.match(signalCopy, /Eleven v3 Text to Dialogue/u);
    assert.match(signalCopy, /never overwrites the faithful recording/u);
  });

  it("explains that Coffee cross-talk controls audible backchannels", () => {
    const joinCopy = MODE_TUTORIALS.coffee.steps.at(-1)?.body ?? "";
    assert.match(joinCopy, /brief spoken acknowledgement/u);
    assert.match(joinCopy, /Cross-talk setting/u);
    assert.match(joinCopy, /audible overlaps/u);
    assert.match(joinCopy, /prerecorded throat-clear, swallow, lip smack, sigh, or inhale/u);
    assert.match(joinCopy, /independent of its speaking style or voice engine/u);
    assert.match(joinCopy, /restrained ElevenLabs vocal reaction/u);
    assert.match(joinCopy, /inferred listeners remain visual only/u);
    assert.match(
      joinCopy,
      /one bot cuts off another.*interrupter speaks a short hold-on.*interrupted bot takes a brief processing beat.*annoyed, abandoned ending/u,
    );
    assert.match(joinCopy, /hold-on over the outgoing voice before that voice releases/u);
    assert.match(joinCopy, /sparse mic-ready breath/u);
  });

  it("teaches the Coffee bar roles and cup-driven Auto pacing", () => {
    const copy = MODE_TUTORIALS.coffee.steps.map((step) => step.body).join(" ");
    assert.match(copy, /Have something made/u);
    assert.match(copy, /Make the rounds/u);
    assert.match(copy, /persona-shaped greeting asks whether you'd like coffee/u);
    assert.match(copy, /LOCAL/u);
    assert.match(copy, /hidden 30-minute ceiling/u);
    assert.match(copy, /two or three table replies/u);
    assert.match(copy, /invisible visit clock/u);
    assert.match(copy, /tops off an eligible bot/u);
    assert.match(copy, /outside the transcript, turn count, and memory/u);
    assert.match(copy, /two distinct Library bots as staff/u);
    assert.match(copy, /I’ll take the…/u);
    assert.match(copy, /Surprise me/u);
    assert.match(copy, /Standard house blend/u);
    assert.match(copy, /prepares them in the background/u);
    assert.match(copy, /first sip.*real, replayable response/u);
    assert.match(copy, /ten quiet seconds/u);
  });

  it("explains shared mic-ready breaths without adding a setup gate", () => {
    assert.match(MODE_TUTORIALS.zen.steps[3]?.body ?? "", /Voice Effects on/u);
    assert.match(MODE_TUTORIALS.zen.steps[3]?.body ?? "", /mic-ready breath/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[4]?.body ?? "",
      /saved episodes choose it deterministically on replay/u,
    );
  });

  it("teaches the Prism house sound and its character alternatives", () => {
    const voiceCopy = MODE_TUTORIALS.zen.steps[3]?.body ?? "";
    assert.match(
      voiceCopy,
      /subtle Prism effect is the default house sound, gently tuning voiced speech/u,
    );
    assert.match(voiceCopy, /Clean for untouched playback/u);
    assert.match(voiceCopy, /Resonance for a darker, weightier mechanical double/u);
  });

  it("explains relative avatar-size Powers across live bot modes", () => {
    assert.match(MODE_TUTORIALS.zen.steps[0]?.body ?? "", /larger or smaller/u);
    assert.match(MODE_TUTORIALS.chat.steps[0]?.body ?? "", /larger or smaller/u);
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /larger or smaller/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /larger or smaller/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /Microscopic/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /fully unseen even while speaking/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /half-translucent/u);
  });

  it("teaches prompt-authored sight and hearing exclusions in social modes", () => {
    for (const mode of ["coffee", "botcast"] as const) {
      const copy = MODE_TUTORIALS[mode].steps.map((step) => step.body).join(" ");
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

  it("explains addressed fandom without weakening player or bot agency", () => {
    assert.match(MODE_TUTORIALS.zen.steps[0]?.body ?? "", /Obsessed persona/u);
    assert.match(MODE_TUTORIALS.chat.steps[0]?.body ?? "", /Obsessed bot/u);
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /player or peer/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /peer or audience/u);
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
      const copy = MODE_TUTORIALS[mode].steps.map((step) => step.body).join(" ");
      assert.match(copy, /separate Action field using letters and spaces only/u);
      assert.match(copy, /typing exactly \*\*/u);
      assert.match(copy, /Shh/u);
      assert.match(copy, /draft/u);
    }
    const slateCopy = MODE_TUTORIALS.slate.steps
      .map((step) => step.body)
      .join(" ");
    assert.doesNotMatch(slateCopy, /separate Action field|typing exactly \*\*|Shh/u);
  });

  it("teaches Zen that action drafts and action-only exchanges stay private", () => {
    for (const mode of ["zen", "chat"] as const) {
      const copy = MODE_TUTORIALS[mode].steps.map((step) => step.body).join(" ");
      assert.match(copy, /Action drafts stay private until Send/u);
      assert.match(
        copy,
        /bot's action response appear on the canvas as an ephemeral exchange and never enter history or memory/u,
      );
    }
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

  it("explains that short-term amnesia also forgets the standing topic", () => {
    const expectedCopy = {
      chat: /does not retain the broader topic unless your current message states it/u,
      zen: /does not retain the broader topic unless your current message states it/u,
      coffee: /does not retain the table topic unless that message states it/u,
      botcast: /does not retain the episode topic unless that message states it/u,
    } as const;

    for (const [mode, pattern] of Object.entries(expectedCopy)) {
      const copy = MODE_TUTORIALS[mode as keyof typeof expectedCopy].steps
        .map((step) => step.body)
        .join(" ");
      assert.match(copy, pattern);
    }
  });

  it("presents the production applet as Signal", () => {
    assert.equal(MODE_TUTORIALS.botcast.title, "Signal producer walkthrough");
    const signalCopy = MODE_TUTORIALS.botcast.steps
      .map((step) => step.body)
      .join(" ");
    assert.match(
      signalCopy,
      /Cut show now stops the bot currently on mic immediately[^.]*cancels any unheard next turn/u,
    );
    assert.match(signalCopy, /guest is cut off by one of the host’s saved short interjections/u);
    assert.match(signalCopy, /host breaks off its own line and then closes/u);
    assert.match(signalCopy, /even an immediate cut is saved/u);
    assert.match(
      signalCopy,
      /After several substantive exchanges[^.]*host who genuinely refuses to continue[^.]*Host ended the show/u,
    );
    assert.match(signalCopy, /short, locally synthesized closing card/u);
    assert.match(signalCopy, /Reviews appear at least four hours after the broadcast/u);
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
      /one identity row/u,
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
      '[data-tutorial-target="botcast-atmosphere-control"]',
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[0]?.body ?? "",
      /automatically tries every supported identity asset in one pass/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /creation pass is resumable/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /fills only missing pieces/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /click the logo for Generate or Upload/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /blank Premise roll invents a fresh host-shaped show/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /successful Premise roll also refreshes the dashboard blurbs automatically/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /Manual premise edits leave those blurbs alone/u,
    );
    assert.match(MODE_TUTORIALS.botcast.steps[1]?.body ?? "", /activity card/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /specific[\s\S]*preserves its subjects, stakes, and intent/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /echo-bound host[\s\S]*repeats it forever/u,
    );
    assert.doesNotMatch(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /keyword|Sound identity|Studio pair|atmosphere audio/u,
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
      /coordinates the show’s studio and sound in one roll/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /Dark studio, its source-linked Light studio, and the lighting map/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /LOCAL stays private[\s\S]*skips ElevenLabs/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /Raw persona prose never goes to image or music providers/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /upload either studio, rebuild stale lighting/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /Completed pieces and current artwork stay in place/u,
    );
    assert.doesNotMatch(
      MODE_TUTORIALS.botcast.steps[3]?.body ?? "",
      /static backdrop/u,
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
      /model picker shows every local and online model/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /choice is Primary/u,
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
      /first opens a dedicated loading screen/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Only then does the short, skippable show-branded pre-roll begin/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Randomize booking/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /choose only the guest and press Begin episode/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /no narrated action text is shown/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /one opening ellipsis[\s\S]*bot guest carries a self-directed solo broadcast[\s\S]*host’s required silent final beat/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /calls the original an impostor once, then inhabits that persona without repeating the claim/u,
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
      /Prism represents you on stage with your configured face and glyph, just as in Coffee/u,
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
      /separate Action field using letters and spaces only/u,
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
      /Film grain defaults to the full on-air TV treatment[\s\S]*preserved in live playback and replay[\s\S]*zero for a clean digital image/u,
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
      /selected guest when one is booked/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /sound loops respect their saved Play when checkboxes at the real Master × Foley level/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /always-on layers remain audible while thinking-only loops stay quiet until the bot thinks/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /Opening another show clears tonight’s guest, topic, private comments, model override, and duration/u,
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
      MODE_TUTORIALS.botcast.steps[5]?.clickLabel ?? "",
      /top-bar routing controls/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[0]?.body ?? "",
      /optionally add a premise inspiration/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /Existing prose becomes source material/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[1]?.body ?? "",
      /preserves its subjects, stakes, and intent/u,
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
      /Wide most often, sometimes the thinking bot, and sometimes the other bot/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /Once speech begins, Auto prioritizes the speaker/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /Instant for hard cuts, Animated for graceful moves to or from Wide, or Smart for a tactful mix/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /always cuts instantly from one bot to the other/u,
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
      /Cup motion never steers or overrides Auto/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[6]?.body ?? "",
      /random off-turn sip simply plays in whichever shot the director already chose/u,
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
      /transcript ownership with one primary speaker while allowing bot audio to overlap/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /studio performance own the live screen/u,
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
      /genuinely cuts across[\s\S]*short hold-on[\s\S]*brief processing beat[\s\S]*annoyed, abandoned ending/u,
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
      /Producer cues always wait for the host’s next turn[\s\S]*never cut off whoever is speaking on their own/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Interrupt now is the only cue action that cuts in[\s\S]*during a host line[\s\S]*audience-heard prefix[\s\S]*redirects immediately/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /guest has the mic or is next[\s\S]*saved short interjections[\s\S]*brief processing beat before the annoyed cutoff retort[\s\S]*unheard remainder of an interrupted line is discarded/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /on-air clock shows elapsed episode time/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /Wrap it up privately asks the host to steer the exchange to a full ending/u,
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
      /entire utility strip, and episode deletion stay locked/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /completed end card places Delete episode beside Copy for Signal Review/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /show library and Create show controls hide while Signal is on air[\s\S]*remain hidden through closing[\s\S]*Return to show/u,
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
      /stays out of captions and the saved transcript/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /transcript remains available as a download instead of a second on-screen reading pane/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /active line appears as a live caption after a brief half-second delay and clears as soon as that line ends/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /on-air soundboard for applause, laughter, a gasp, or a rimshot/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[7]?.body ?? "",
      /rotates through room-matched variations[\s\S]*returns with the same variation in replay/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /grounded in that show and its recent episodes/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /recommends only available bots from your current Library/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /does not add or book anyone/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /speaks through your current Signal Voice choice as each word appears/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[8]?.body ?? "",
      /transcript stays scrollable while open and clears when you close it/u,
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
      /global response control in Signal’s top bar beside the episode model/u,
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
      /Video export is disabled/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /same saved effects and transcript timing/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /Copy for Signal Review/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /per-turn model routing/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[9]?.body ?? "",
      /Delete episode remains a separate destructive action/u,
    );
  });

  it("teaches the live Signal closed-caption control", () => {
    const controlRoom = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Produce from the control room",
    )?.body ?? "";
    assert.match(
      controlRoom,
      /CC button in the live top line[\s\S]*without changing the saved transcript or replay captions/u,
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
      '[data-tutorial-target="prism-companion"]',
      '[data-tutorial-target="slate-deliberation"]',
      '[data-tutorial-target="slate-revision"]',
    ]);
    assert.match(
      MODE_TUTORIALS.slate.steps[6]?.body ?? "",
      /Voice on[\s\S]*pace of its voice[\s\S]*mute the widget/i,
    );
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

    assert.deepEqual({
      ...chooseRelationship,
      body: chooseRelationship?.body.replace(/ A bot-name prefix or suffix changes only how its holder names other bots:.*$/u, ""),
    }, {
      heading: "Choose a relationship",
      body: "Choose PRISM or a persona to enter that relationship’s Home. Ready Powers stay active with that persona here and across PRISM; a muted persona can still act, but only answers with ... and never speaks aloud, while a Copycat persona may originate one opening if nobody has addressed them yet, then repeats the latest addressed message exactly. A short-term-amnesia persona understands only your current message, treats it as fresh first contact, never knows prior turns or their own earlier replies, does not retain the broader topic unless your current message states it, and responds directly instead of defaulting to the same introduction. An Obsessed persona treats you as the star of each reply with fresh, intense admiration, while your agency, privacy, and safety boundaries still win. A radiant-joy persona makes that emotional warmth palpable without tracking or rewriting your mood. A sad-grouchy persona makes her draining presence equally palpable without changing your state; only bots that directly talk to her lose mood or motivation. Physical-size Powers render a persona slightly larger or smaller without changing the room layout. Microscopic stays fully unseen even while speaking, while Invisible stays half-translucent. Loud and Quiet Powers apply a small fixed voice-volume and text-size shift without changing physical size or visibility; Quiet can go unheard on half its turns and lose a little mood. A hard bare-minimum or brief Power is engine-bounded even if the model tries to elaborate. Clicking empty canvas space jumps straight back to All Bots Home. Escape returns you to the wider Library or saved group grid exactly where you left it. Inviting a guest keeps you in the current Home.",
      clickLabel: "a PRISM or persona tile",
      targetSelector: '[data-tutorial-target="chat-bot-picker"]',
    });
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

  it("teaches exact speech-copy Powers in every active bot-speaking lane", () => {
    assert.match(MODE_TUTORIALS.zen.steps[0]?.body ?? "", /Copycat persona.*exactly/u);
    assert.match(MODE_TUTORIALS.chat.steps[0]?.body ?? "", /Copycat bot.*adds nothing/u);
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /repeats the exact user or bot line/u);
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /originate one required opening.*immediately preceding on-air bot line exactly.*never leak/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /normal host owns that opening even when echo-bound/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps[0]?.body ?? "",
      /Copycat bot originate one opening/u,
    );
  });

  it("teaches radiant joy without flattening recipients in every supported lane", () => {
    assert.match(MODE_TUTORIALS.zen.steps[0]?.body ?? "", /radiant-joy persona.*without tracking or rewriting your mood/u);
    assert.match(MODE_TUTORIALS.chat.steps[0]?.body ?? "", /radiant-joy bot.*without inventing mutable mood state/u);
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /bounded, replay-safe lift.*own personality.*without forcing agreement or erasing real sadness/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /bounded, persisted mood lift.*own voice without forced agreement or denial/u);
  });

  it("teaches reactive sadness without mutating the player or bystanders", () => {
    assert.match(MODE_TUTORIALS.zen.steps[0]?.body ?? "", /sad-grouchy persona.*only bots that directly talk to her lose mood or motivation/u);
    assert.match(MODE_TUTORIALS.chat.steps[0]?.body ?? "", /sad-grouchy bot.*only bots that directly talk to her lose mood or motivation/u);
    assert.match(MODE_TUTORIALS.coffee.steps[0]?.body ?? "", /only to the bot that directly talks to her.*player and bystanders are untouched.*own personality and agency/u);
    assert.match(MODE_TUTORIALS.botcast.steps[5]?.body ?? "", /only that addresser receives one bounded, persisted mood drag.*own personality.*without forced hatred, hopelessness, or agreement/u);
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
    const [, setup, , , routing] = MODE_TUTORIALS.coffee.steps;

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
      /Auto has no visible countdown/,
    );
    assert.match(setup?.body ?? "", /hidden 30-minute ceiling/);
    assert.match(
      routing?.body ?? "",
      /model picker stays active and shows every model/,
    );
    assert.match(routing?.body ?? "", /selection becomes Primary/);
    assert.match(routing?.body ?? "", /fallback chain saved in Settings/);
    assert.match(routing?.body ?? "", /separate Images provider/);
    assert.match(routing?.body ?? "", /voice preference/);
    assert.match(routing?.body ?? "", /Voice remains available/);
    assert.match(routing?.body ?? "", /next utterance without cutting off/);
    assert.match(
      routing?.body ?? "",
      /entire utility strip stay locked until you choose End session/,
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

  it("explains that a Signal Power can remove a bot's coffee cup", () => {
    const booking = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Book tonight’s episode",
    );
    assert.match(booking?.body ?? "", /whether they have coffee at all/u);
    assert.match(booking?.body ?? "", /cups only for bots who drink coffee/u);
    assert.match(booking?.body ?? "", /drag the visible pieces/u);
    assert.match(
      booking?.body ?? "",
      /Host and Guest floor glows vertically.*synthesized chair.*sideways.*original maximum/u,
    );
    assert.match(booking?.body ?? "", /lighting masks.*receiving surfaces/u);
    assert.match(
      booking?.body ?? "",
      /Lighting lab starts both Light and Dark at 100% Overlay.*saves any adjustment only for this show/u,
    );
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
    assert.match(routing?.body ?? "", /Mute, English, Premium, Babble, and Bottish/);
    assert.match(routing?.body ?? "", /optional operating-system identity/);
    assert.match(
      routing?.body ?? "",
      /Avatar Studio edits and previews those two identities separately/,
    );
    assert.match(routing?.body ?? "", /on AUTO and ONLINE speech/);
    assert.match(routing?.body ?? "", /Voice Settings can narrow/);
    assert.match(routing?.body ?? "", /one ElevenLabs voice collection/);
    assert.match(routing?.body ?? "", /Voice tab also gives each bot a Voice Character pad/);
    assert.match(routing?.body ?? "", /relative to your account Voice Volume/);
    assert.match(routing?.body ?? "", /SFX tab can generate an ElevenLabs loop/);
    assert.match(routing?.body ?? "", /talking, idle, thinking/);
    const automaticThinkingSfx = MODE_TUTORIALS.zen.steps.find(
      (step) => step.heading === "Hear each bot think",
    );
    assert.match(automaticThinkingSfx?.body ?? "", /one of four built-in PRISM/);
    assert.match(automaticThinkingSfx?.body ?? "", /Computer calculating/);
    assert.match(automaticThinkingSfx?.body ?? "", /while thinking/);
    assert.match(automaticThinkingSfx?.body ?? "", /ElevenLabs is connected and ONLINE/);
    assert.match(automaticThinkingSfx?.body ?? "", /manual, AI-generated, or Marketplace/);
    assert.match(automaticThinkingSfx?.body ?? "", /restore the PRISM default, or mute it/);
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
    assert.match(signalVoice?.body ?? "", /requests stay stateless/);
    assert.match(signalVoice?.body ?? "", /own stable performance seed/);
    assert.match(signalVoice?.body ?? "", /without displacing that bot’s saved identity directions/);
  });

  it("teaches Coffee dead-air asides, Signal quiet, and each ambient sip contract", () => {
    const coffee = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Join the conversation",
    );
    const signal = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Choose how the bots speak",
    );

    assert.match(coffee?.body ?? "", /dead air/);
    assert.match(coffee?.body ?? "", /without stealing the slow bot’s turn/);
    assert.match(coffee?.body ?? "", /begin answering over the aside’s natural ending/);
    assert.match(coffee?.body ?? "", /Ambient sips continue through quiet beats and listening moments/);
    assert.match(coffee?.body ?? "", /active speaker keeps their cup down/);
    assert.match(coffee?.body ?? "", /cup-return sounds stay synchronized/);
    assert.match(signal?.body ?? "", /Between turns, Signal stays quiet/u);
    assert.doesNotMatch(
      signal?.body ?? "",
      /awkward dead air|brief mood-aware aside/u,
    );
    assert.match(signal?.body ?? "", /Bot ambient sips happen randomly in any camera shot while that bot is off-turn/);
    assert.match(signal?.body ?? "", /keeps its cup down while speaking, preparing, or holding the next turn/);
    assert.match(signal?.body ?? "", /standalone magic word PICKLES/);
    assert.match(signal?.body ?? "", /the other bot comments on the strange pause/);
    assert.match(signal?.body ?? "", /your cup moves only after you click Sip coffee/);
    assert.match(signal?.body ?? "", /cup-return sounds stay synchronized/);
  });

  it("separates local ambient vocalizations from provider reactions", () => {
    assert.match(
      MODE_TUTORIALS.coffee.steps.map((step) => step.body).join(" "),
      /prerecorded throat-clear, swallow, lip smack, sigh, or inhale/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps.map((step) => step.body).join(" "),
      /speaking style or voice engine/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps.map((step) => step.body).join(" "),
      /local cues animate the listener’s mouth and use no synthesis/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps.map((step) => step.body).join(" "),
      /saved context-aware vocal reactions/u,
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
      /audible host and a muted guest[\s\S]*timed episode honors its target/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /distinct nonverbal routes, choices, hypotheses, and pressure[\s\S]*growing in-character frustration/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /both frozen cast members are muted[\s\S]*neither performer can carry the interview/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /every Signal closing remains host-owned[\s\S]*echo-bound host ends by repeating the guest's last line/u,
    );
    assert.match(
      MODE_TUTORIALS.botcast.steps[5]?.body ?? "",
      /host is muted[\s\S]*host’s required silent final beat[\s\S]*never inherits the sign-off/u,
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

  it("teaches guaranteed and probabilistic Signal interruptions plus protected states", () => {
    const controlRoom = MODE_TUTORIALS.botcast.steps.find(
      (step) => step.heading === "Produce from the control room",
    )?.body ?? "";
    assert.match(controlRoom, /interruptive cast member’s Power/u);
    assert.match(controlRoom, /without a random roll or cooldown/u);
    assert.match(controlRoom, /early, in the middle, or late/u);
    assert.match(
      controlRoom,
      /Interrupting Tom cuts every ordinary bot-host opening and interview turn, including producer-directed host turns/u,
    );
    assert.match(controlRoom, /other interruption Powers retain their frequency, strength, target, and cooldown/u);
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
