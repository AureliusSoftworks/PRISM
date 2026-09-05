import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coffeeReplyBreaksCharacterImmersion } from "../coffee.ts";

/**
 * Both lines below were said at real tables. A bot that cannot make out a
 * neighbour has in-character ways to say so; addressing whoever assembled the
 * transcript is not one of them, and it ends the session for the player
 * watching it.
 */
describe("Coffee fourth-wall breaks", () => {
  it("rejects a bot asking the operator to paste a missing line", () => {
    const harry =
      "I'm ready to respond, but I don't see [Professor McGonagall](prism-bot://295797ff140dcf2751eda3da)'s actual line in your message—it shows as `...` both times. Could you paste what she just said? Once I see her words, I'll answer with a concrete reply that ties back to the muggle restaurant topic or whatever she's brought up.";
    assert.equal(coffeeReplyBreaksCharacterImmersion(harry), true);

    const washington =
      "I notice the transcript shows Thomas Jefferson has just spoken, but the actual content of his statement isn't included in your message—it appears as ellipsis only. To respond authentically as George Washington to Jefferson's point about fascism, I'd need to see what he actually said. Could you share Jefferson's line?";
    assert.equal(coffeeReplyBreaksCharacterImmersion(washington), true);
  });

  it("still rejects the assistant-disclaimer family", () => {
    assert.equal(
      coffeeReplyBreaksCharacterImmersion("As an AI assistant, I can't do that."),
      true,
    );
    assert.equal(
      coffeeReplyBreaksCharacterImmersion(
        "I wish I could send you a photo of the chippy.",
      ),
      true,
    );
  });

  it("leaves in-character table talk alone", () => {
    const inCharacter = [
      "I didn't catch that — the room's gone loud. Say it again?",
      "Sorry, what was that? You'll have to speak up over the kettle.",
      "I can't see the menu from here, Ron. Read it out.",
      "I don't see the point of a fork you can't eat with.",
      "Could you pass the vinegar? The chips are dry.",
      "Once I see the bill I'll know whether it was worth it.",
      "She said nothing at all, which is rather her way of answering.",
      "I'm ready to order, if anyone's listening.",
    ];
    for (const line of inCharacter) {
      assert.equal(
        coffeeReplyBreaksCharacterImmersion(line),
        false,
        `flagged in-character line: ${line}`,
      );
    }
  });
});
