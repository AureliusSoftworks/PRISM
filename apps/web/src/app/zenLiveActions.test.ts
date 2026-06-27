import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isZenLiveBotPresenceActionVerbose,
  resolveZenLiveBotPresenceActionText,
  sanitizeZenLiveBotActionText,
  zenLiveActionPlateFace,
} from "./zenLiveActions.ts";

describe("sanitizeZenLiveBotActionText", () => {
  it("keeps stage direction text and strips quoted dialogue", () => {
    assert.equal(
      sanitizeZenLiveBotActionText(
        'Smiles warmly, gestures to the dancing, and sings softly "You are a joy to see"'
      ),
      "Smiles warmly, gestures to the dancing"
    );
  });

  it("strips dangling speech bridge words", () => {
    assert.equal(
      sanitizeZenLiveBotActionText("offers a warm smile and a gentle wave back, saying"),
      "offers a warm smile and a gentle wave back"
    );
  });
});

describe("isZenLiveBotPresenceActionVerbose", () => {
  it("keeps short action beats compact", () => {
    assert.equal(isZenLiveBotPresenceActionVerbose("smiles gently"), false);
  });

  it("expands fuller or phrase-like action beats", () => {
    assert.equal(
      isZenLiveBotPresenceActionVerbose(
        "rests one hand over his heart, then offers a small nod toward your courage"
      ),
      true
    );
  });
});

describe("resolveZenLiveBotPresenceActionText", () => {
  it("uses the current reply action while the bot is talking", () => {
    assert.equal(
      resolveZenLiveBotPresenceActionText({
        action: null,
        replyAction: "smiles gently",
        isTalking: true,
        userActionVisible: false,
        hasBot: true,
      }),
      "smiles gently"
    );
  });

  it("keeps the specific live action while the bot is talking", () => {
    assert.equal(
      resolveZenLiveBotPresenceActionText({
        action: "smiles gently",
        isTalking: true,
        userActionVisible: false,
        hasBot: true,
      }),
      "smiles gently"
    );
  });

  it("falls back to replying only when talking has no action text", () => {
    assert.equal(
      resolveZenLiveBotPresenceActionText({
        action: null,
        isTalking: true,
        userActionVisible: false,
        hasBot: true,
      }),
      "replying"
    );
  });
});

describe("zenLiveActionPlateFace", () => {
  it("supports open-mouth shapes for Zen speech", () => {
    assert.deepEqual(zenLiveActionPlateFace("warm", "open-wide"), {
      text: ":0",
      rotateDeg: 90,
    });
    assert.deepEqual(zenLiveActionPlateFace("warm", "open-small"), {
      text: ":o",
      rotateDeg: 90,
    });
    assert.deepEqual(zenLiveActionPlateFace("warm", "open-round"), {
      text: ":O",
      rotateDeg: 90,
    });
    assert.deepEqual(zenLiveActionPlateFace("warm", "closed"), {
      text: ":]",
      rotateDeg: 90,
    });
  });
});
