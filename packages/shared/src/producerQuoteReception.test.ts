import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOTCAST_PRODUCER_QUOTE_OVERLONG_CHARS,
  botcastProducerQuoteProvokesObjectionV1,
  botcastProducerQuoteReceptionV1,
  botcastProducerQuoteStanceDirectiveV1,
  botcastProducerQuoteTwistStrengthV1,
} from "./producerQuoteReception.ts";
import { BOTCAST_PRODUCER_DIRECT_QUOTE_MAX } from "./botcast.ts";

const PETER = "Peter Griffin, crude Rhode Island dad.";
const JESUS = "You are Jesus of Nazareth, gentle and holy.";

describe("Signal producer quote reception", () => {
  it("reads a quote that sits fine with the persona verbatim", () => {
    const reception = botcastProducerQuoteReceptionV1({
      quote: "Don't forget to check out our sponsor.",
      peerName: "Racist Randy",
      personaPrompt: PETER,
    });
    assert.equal(reception.stance, "verbatim");
    assert.equal(reception.frictions.length, 0);
    assert.equal(botcastProducerQuoteTwistStrengthV1(reception), 0);
    assert.equal(
      botcastProducerQuoteStanceDirectiveV1({
        quote: "Don't forget to check out our sponsor.",
        reception,
      }),
      null,
    );
  });

  it("keeps profanity verbatim for a persona that already curses", () => {
    const reception = botcastProducerQuoteReceptionV1({
      quote: "Ah, screw it, this show is bullshit.",
      peerName: "Racist Randy",
      personaPrompt: PETER,
      speakerCurses: true,
    });
    assert.equal(reception.stance, "verbatim");
  });

  it("refuses words that cut against a gentle persona", () => {
    const quote = "Fuck you, Randy.";
    const reception = botcastProducerQuoteReceptionV1({
      quote,
      peerName: "Racist Randy",
      personaPrompt: JESUS,
    });
    assert.equal(reception.stance, "refused");
    assert.ok(reception.frictions.includes("profanity"));
    assert.ok(reception.frictions.includes("persona_gentle"));
    const directive = botcastProducerQuoteStanceDirectiveV1({
      quote,
      reception,
    });
    assert.ok(directive);
    assert.match(directive, /will not say it/iu);
    assert.match(directive, /without repeating the words/iu);
  });

  it("bends a quote the persona half-agrees with, harder nearer the refusal line", () => {
    const quote = "I'm a worthless fraud and everyone knows it.";
    const reception = botcastProducerQuoteReceptionV1({
      quote,
      peerName: "Racist Randy",
      personaPrompt: "A proud news anchor.",
    });
    assert.equal(reception.stance, "twisted");
    assert.ok(reception.frictions.includes("self_humiliation"));
    const twist = botcastProducerQuoteTwistStrengthV1(reception);
    assert.ok(twist > 0 && twist < 1);
    const directive = botcastProducerQuoteStanceDirectiveV1({
      quote,
      reception,
    });
    assert.ok(directive);
    assert.match(directive, /not as written/iu);
  });

  it("never lets a bend or refusal be mistaken for full agreement", () => {
    for (const quote of ["Fuck you, Randy.", "I'm a worthless fraud."]) {
      const reception = botcastProducerQuoteReceptionV1({
        quote,
        peerName: "Racist Randy",
        personaPrompt: JESUS,
      });
      assert.notEqual(reception.stance, "verbatim");
      assert.ok(reception.agreement < 1);
    }
  });

  it("lets length provoke the guest even when the host would read it happily", () => {
    // Review 2fcad998: the guest waited 46 seconds through queued lyrics.
    const wall = "We're no strangers to love. ".repeat(20);
    const reception = botcastProducerQuoteReceptionV1({
      quote: wall,
      peerName: "Racist Randy",
      personaPrompt: PETER,
    });
    assert.equal(reception.stance, "verbatim");
    assert.ok(reception.frictions.includes("overlong"));
    assert.equal(botcastProducerQuoteProvokesObjectionV1(reception), true);
  });

  it("leaves a short harmless line unobjectionable from either chair", () => {
    const reception = botcastProducerQuoteReceptionV1({
      quote: "*farts*",
      peerName: "Racist Randy",
      personaPrompt: PETER,
    });
    assert.equal(reception.stance, "verbatim");
    assert.equal(botcastProducerQuoteProvokesObjectionV1(reception), false);
  });

  it("keeps the length threshold reachable inside the composer's own cap", () => {
    // If this ever inverts, length friction becomes unreachable and the guest
    // can never object on length at all.
    assert.ok(
      BOTCAST_PRODUCER_QUOTE_OVERLONG_CHARS < BOTCAST_PRODUCER_DIRECT_QUOTE_MAX,
    );
  });

  it("treats an empty quote as nothing to weigh", () => {
    const reception = botcastProducerQuoteReceptionV1({ quote: "   " });
    assert.equal(reception.stance, "verbatim");
    assert.equal(reception.agreement, 1);
    assert.equal(botcastProducerQuoteProvokesObjectionV1(reception), false);
  });
});
