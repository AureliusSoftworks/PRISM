import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  coffeeReplyIsPrismStockFiller,
  coffeeReplyLooksLikePromptLeak,
  sanitizeCoffeeTableReply,
} from "../coffee.ts";

const coffeeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "coffee.ts"),
  "utf8",
);

/**
 * Coffee is a multi-bot table, not a tool surface. Its free text is table
 * talk, so it must never be fed to Chat's image-request intent detector:
 * review f1e340d8 queued a generation job off the narrative aside "He didn't
 * draw a circle", and the table answered with an image-failure notice
 * attributed to a bot with no identity. Per CLAUDE.md the lane split is a
 * server guardrail, so the gate lives here rather than in the detector.
 */
describe("coffee lane guardrails", () => {
  it("never routes a Coffee turn into image generation", () => {
    for (const forbidden of [
      "userMessageSuggestsInChatImageRequest",
      "tryAcquireImageSlot",
      "startChatImageBackgroundJob",
      "maybeQueueCoffeeImageJob",
      "coffee-image-request",
    ]) {
      assert.equal(
        coffeeSource.includes(forbidden),
        false,
        `Coffee must not reference ${forbidden}: image generation is a Chat/Sandbox capability`,
      );
    }
  });

  it("returns the generated turn without decorating it with an image job", () => {
    assert.equal(coffeeSource.includes("pendingImageJob"), false);
  });
});

/**
 * Reviews 8e012a9d and f1e340d8 both surfaced Prism's own emergency-fallback
 * skeleton at the table ("Somewhere in <concept> there is a better answer to
 * this"), under two different providers. The cause was pipeline order, not
 * pattern strictness: a merely hollow draft was replaced with the template
 * *before* the repair pass ran, so the repair then validated Prism's own
 * text, found it acceptable, and passed it straight through to the table.
 *
 * A low-value hit must mean "ask the speaker again", not "speak for them".
 */
describe("hollow coffee replies get another try before a template", () => {
  const emergencyGuard =
    /\(?\s*coffeeReplyLooksLikePromptLeak\(replyText\)[\s\S]{0,120}?\)\s*\{\s*replyText = buildCoffeeEmergencyFallbackReply/;

  it("does not swap a hollow draft for the template up front", () => {
    const guard = coffeeSource.match(emergencyGuard);
    assert.ok(guard, "expected a prompt-leak guard ahead of the emergency fallback");
    assert.equal(
      guard[0].includes("coffeeReplyIsLowValueTableLine"),
      false,
      "a low-value draft must fall through to the repair pass, not be overwritten here",
    );
  });

  it("runs the model repair before any fresh fallback beat", () => {
    const repairAt = coffeeSource.indexOf("await repairCoffeeRepeatedReply({");
    const freshBeatAt = coffeeSource.indexOf("replyText = buildCoffeeFreshFallbackBeat({");
    assert.notEqual(repairAt, -1);
    assert.notEqual(freshBeatAt, -1);
    assert.ok(
      repairAt < freshBeatAt,
      "the speaker must get a retry before Prism writes the line for them",
    );
  });

  it("tells the speaker which problem it is actually fixing", () => {
    // llama3.2 is the design baseline and answers the nudge it is given;
    // "you repeated the table" is false for "Fair point." and buys a second
    // useless draft.
    assert.match(
      coffeeSource,
      /reason: coffeeReplyNeedsTurnRepair\(replyText\) \? "repeat" : "low-value"/u,
    );
    assert.match(coffeeSource, /only acknowledged the room without saying anything/u);
  });

  it("treats a teardown abort as cancellation, not as a bad draft", () => {
    assert.match(
      coffeeSource,
      /await repairCoffeeRepeatedReply\(\{[\s\S]{0,600}?catch \(error\) \{[\s\S]{0,200}?if \(settings\.signal\?\.aborted\) throw error;/u,
    );
  });
});

/**
 * Reviews 8e012a9d, f1e340d8 and 60ac2faf all put persona templates on the
 * table ("Somewhere in <concept> there is a better answer to this"). The
 * trigger was never the low-value predicate — `buildCoffeeEmergencyFallbackReply`
 * draws from a different pool entirely and none of its lines ever appeared.
 * It was repetition: the repair pass discarded its own second draft on any
 * imperfection, leaving the caller with nothing and forcing the template.
 *
 * Policy: an imperfect line in the speaker's voice beats a polished one in
 * Prism's. The template is the floor for "nothing to say".
 */
describe("the table keeps the speaker's voice over a template", () => {
  it("treats Prism's own filler as replaceable", () => {
    for (const filler of [
      "Somewhere in order there is a better answer to this.",
      "I keep testing this against optimism, and it does not settle.",
      "Put a real case on the table first.",
      "Everything routes back to precision for me — even this.",
    ]) {
      assert.equal(coffeeReplyIsPrismStockFiller(filler), true, filler);
    }
  });

  it("leaves ordinary short human beats alone", () => {
    // These are in character. Replacing them with a persona template is what
    // made three transcripts read like Prism talking to itself.
    for (const beat of [
      "Fair point.",
      "Noted.",
      "That tracks.",
      "Power, Jared, emanates from fear and discipline.",
    ]) {
      assert.equal(coffeeReplyIsPrismStockFiller(beat), false, beat);
    }
  });

  it("keeps a repaired draft that is merely imperfect", () => {
    const repairReturn = coffeeSource.slice(
      coffeeSource.indexOf("async function repairCoffeeRepeatedReply"),
    ).slice(0, 2600);
    assert.match(repairReturn, /!coffeeReplyIsPrismStockFiller\(visible\)/u);
    assert.equal(
      repairReturn.includes("!coffeeReplyRepeatsRecentMotifs(visible, args.history)"),
      false,
      "a motif repeat is not worth discarding the speaker's own second draft",
    );
  });

  it("falls back to the original draft before reaching for a template", () => {
    assert.match(coffeeSource, /const draftBeforeRepair = replyText;/u);
    assert.match(coffeeSource, /if \(draftIsSalvageable\) replyText = draftBeforeRepair;/u);
  });

  it("reserves the fresh fallback beat for having nothing to say", () => {
    assert.match(
      coffeeSource,
      /\(!replyText \|\| coffeeReplyIsPrismStockFiller\(replyText\)\)\s*\)\s*\{\s*replyText = buildCoffeeFreshFallbackBeat/u,
    );
  });
});

/**
 * Review 60ac2faf: Stalin opened with "Elon Musk just said: The fut—" — the
 * literal table-focus string built for the prompt, spoken aloud at the table.
 */
describe("table-focus scaffolding never reaches the table", () => {
  it("catches the focus strings echoed verbatim", () => {
    for (const leak of [
      "Elon Musk just said: The fut—",
      "Donald Trump just said: Count me in.",
      "A brand-new Coffee session is starting around the topic \"pizza\".",
      "The user directly addressed multiple bots with: hello there.",
    ]) {
      assert.equal(coffeeReplyLooksLikePromptLeak(leak), true, leak);
    }
  });

  it("does not flag a speaker referring to their own words", () => {
    for (const line of [
      "What I just said: it matters more than you think.",
      "I just said that, and I meant it.",
      "You just said the quiet part out loud.",
    ]) {
      assert.equal(coffeeReplyLooksLikePromptLeak(line), false, line);
    }
  });
});

/**
 * A memory naming a bot who is not seated is worse than no memory: the
 * speaker refers to somebody nobody at the table can see. Review 60ac2faf
 * surfaced "Donald Trump → Brash Brian" and "→ Vex" with neither present.
 */
describe("memory hints stay inside the roster", () => {
  it("drops hints naming a bot absent from the group", () => {
    assert.match(coffeeSource, /const namesAnAbsentBot = \(text: string\): boolean =>/u);
    assert.match(coffeeSource, /if \(namesAnAbsentBot\(memory\)\) return false;/u);
  });

  it("ignores names too short to match safely", () => {
    assert.match(coffeeSource, /name\.length >= 3 && !seatedNames\.has/u);
  });
});

/**
 * Review 60ac2faf shipped "Elon Musk considers, then nods Action propels the
 * future, a force beyond mere thought." — third-person narration welded to
 * the spoken line. The named-opener normalizer only recognised speech that
 * began with a function word ("Well", "That", "You"…), so a sentence opening
 * on a content word never got split.
 */
describe("third-person narration is split from speech", () => {
  it("splits when the speech opens on a content word", () => {
    assert.equal(
      sanitizeCoffeeTableReply(
        "Elon Musk considers, then nods Action propels the future, a force beyond mere thought.",
        "Elon Musk",
        400,
        ["Elon Musk"],
      ),
      "*considers, then nods* Action propels the future, a force beyond mere thought.",
    );
  });

  it("still splits the function-word openers it always handled", () => {
    assert.equal(
      sanitizeCoffeeTableReply("Elon Musk leans back Well, that settles it.", "Elon Musk", 400, [
        "Elon Musk",
      ]),
      "*leans back* Well, that settles it.",
    );
  });
});
