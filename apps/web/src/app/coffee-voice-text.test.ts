import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  coffeeBotVoiceSynthesisSource,
  coffeeVoiceSpokenText,
  normalizeCoffeeMessageDelivery,
} from "./coffee-voice-text.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8").replace(
  /\s+/gu,
  " "
);

describe("Coffee voice text", () => {
  it("keeps stage directions out of mixed spoken dialogue", () => {
    assert.equal(
      coffeeVoiceSpokenText(
        "*straightens the napkin edge* And the fair test is who can absorb it."
      ),
      "And the fair test is who can absorb it."
    );
    assert.equal(
      coffeeVoiceSpokenText(
        "[Plankton](prism-bot://15abcff04cbb78591bab82fd), *slaps a claw on the table* Aye, it has!"
      ),
      "Plankton, Aye, it has!"
    );
  });

  it("returns no synthesis source for action-only turns", () => {
    assert.equal(
      coffeeBotVoiceSynthesisSource({
        id: "rowan-action",
        content: "*straightens the napkin edge*",
      }),
      null
    );
  });

  it("keeps the canonical mute ellipsis visible without giving it a voice", () => {
    assert.deepEqual(normalizeCoffeeMessageDelivery(" … "), {
      displayText: "",
      spokenText: "",
      hasDialogue: false,
    });
    assert.equal(
      coffeeBotVoiceSynthesisSource({ id: "pause", content: "..." }),
      null,
    );
    assert.deepEqual(normalizeCoffeeMessageDelivery("*nods* ..."), {
      displayText: "...",
      spokenText: "",
      hasDialogue: false,
    });
  });

  it("keeps the message id for privacy provenance beside clean spoken text", () => {
    assert.deepEqual(
      coffeeBotVoiceSynthesisSource({
        id: "rowan-mixed",
        content: "*straightens the napkin edge* The bill still comes due.",
      }),
      {
        messageId: "rowan-mixed",
        spokenText: "The bill still comes due.",
      }
    );
  });

  it("uses the shared synthesis source for resumed, replayed, and live Coffee", () => {
    assert.match(
      pageSource,
      /const synthesisSource = coffeeBotVoiceSynthesisSource\(message\);[\s\S]*?if \(!synthesisSource\) continue;/
    );
    assert.match(
      pageSource,
      /const botSynthesisSource = playerMessage[\s\S]*?coffeeBotVoiceSynthesisSource\(message\);/
    );
    assert.match(
      pageSource,
      /const synthesisSource = coffeeBotVoiceSynthesisSource\(message\);[\s\S]*?coffeeVoiceSeenMessageIdsRef\.current\.add\(message\.id\);[\s\S]*?if \(!synthesisSource\) return null;/
    );
    assert.ok(
      pageSource.match(/\.\.\.synthesisSource,/g)?.length === 2,
      "Expected resumed and live synthesis to use the clean source"
    );
    assert.ok(
      pageSource.match(/\.\.\.botSynthesisSource/g)?.length === 1,
      "Expected replay synthesis to use the clean source"
    );
  });

  it("keeps muted Coffee mouths closed while preserving sip presentation", () => {
    assert.match(
      pageSource,
      /const tableTypingAssistantIsSilent = botPowerResponseIsSilentV1\( tableTypingAssistantRawText,/u,
    );
    assert.match(
      pageSource,
      /const isTableTypingThisSeat = !seatPowerMuted && !tableTypingAssistantIsSilent/u,
    );
    assert.match(
      pageSource,
      /isTalking=\{isTableTypingThisSeat\}[\s\S]{0,420}seatSipPresentation\.active/u,
    );
    assert.match(
      pageSource,
      /const seatSipInProgress = seatIsFirmlySeated && !isTableTypingThisSeat && seatSipActionInProgress/u,
    );
  });
});
