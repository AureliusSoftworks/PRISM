import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isZenLiveBotPresenceActionVerbose,
  resolveZenLiveBotPresenceActionText,
  resizeZenLiveBotAvatarFromWheel,
  sanitizeZenLiveBotActionText,
  zenLiveBotCanvasSideFromCenterX,
  zenLiveBotFaceScaleYForCanvasSide,
  zenLiveBotResizeLaneAtClientX,
  zenLiveActionPlateFace,
} from "./zenLiveActions.ts";

describe("sanitizeZenLiveBotActionText", () => {
  it("keeps stage direction text and strips quoted dialogue", () => {
    assert.equal(
      sanitizeZenLiveBotActionText(
        'Smiles warmly, gestures to the dancing, and sings softly "You are a joy to see"'
      ),
      "Smiles warmly"
    );
  });

  it("strips dangling speech bridge words", () => {
    assert.equal(
      sanitizeZenLiveBotActionText("offers a warm smile and a gentle wave back, saying"),
      "Offers a warm smile"
    );
  });

  it("reduces paragraph-like action prose to one physical beat", () => {
    assert.equal(
      sanitizeZenLiveBotActionText(
        "Tilts head slightly, a small, nervous smile flickering across his face, eyes darting around as if expecting something"
      ),
      "Tilts head slightly"
    );
  });

  it("drops chained gestures even without punctuation", () => {
    assert.equal(
      sanitizeZenLiveBotActionText("offers a warm smile and a gentle wave back"),
      "Offers a warm smile"
    );
  });

  it("caps an unpunctuated action at a short readable beat", () => {
    assert.equal(
      sanitizeZenLiveBotActionText(
        "keeps his gaze fixed on the doorway across the silent room"
      ),
      "Keeps his gaze fixed on the doorway"
    );
  });

  it("sentence-cases all-caps action text for the canvas", () => {
    assert.equal(
      sanitizeZenLiveBotActionText("SMILES GENTLY"),
      "Smiles gently",
    );
  });
});

describe("isZenLiveBotPresenceActionVerbose", () => {
  it("keeps short action beats compact", () => {
    assert.equal(isZenLiveBotPresenceActionVerbose("smiles gently"), false);
  });

  it("keeps compacted legacy action beats out of the verbose layout", () => {
    assert.equal(
      isZenLiveBotPresenceActionVerbose(
        "rests one hand over his heart, then offers a small nod toward your courage"
      ),
      false
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
      "Smiles gently"
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
      "Smiles gently"
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
      "Replying"
    );
  });

  it("does not emit idle placeholder text", () => {
    assert.equal(
      resolveZenLiveBotPresenceActionText({
        action: null,
        isTalking: false,
        userActionVisible: false,
        hasBot: false,
      }),
      null
    );
    assert.equal(
      resolveZenLiveBotPresenceActionText({
        action: null,
        isTalking: false,
        userActionVisible: false,
        hasBot: true,
      }),
      null
    );
  });
});

describe("zenLiveActionPlateFace", () => {
  it("maps closed Zen action moods to Coffee-style plate faces", () => {
    const cases = [
      ["amused", ":)"],
      ["warm", ":]"],
      ["attentive", ":]"],
      ["confused", ":?"],
      ["stern", ":["],
      ["strained", ":("],
      ["waiting", ":|"],
      ["neutral", ":|"],
    ] as const;

    for (const [moodHint, text] of cases) {
      assert.deepEqual(zenLiveActionPlateFace(moodHint, "closed"), {
        text,
        rotateDeg: 90,
      });
    }
  });

  it("supports open-mouth shapes for Zen speech", () => {
    assert.deepEqual(zenLiveActionPlateFace("warm", "speech-closed"), {
      text: ":|",
      rotateDeg: 90,
    });
    assert.deepEqual(zenLiveActionPlateFace("warm", "dot"), {
      text: ":.",
      rotateDeg: 90,
    });
    assert.deepEqual(zenLiveActionPlateFace("warm", "at"), {
      text: ":@",
      rotateDeg: 90,
    });
    assert.deepEqual(zenLiveActionPlateFace("warm", "click"), {
      text: ":ʘ",
      rotateDeg: 90,
    });
    assert.deepEqual(zenLiveActionPlateFace("warm", "narrow"), {
      text: ":ɵ",
      rotateDeg: 90,
    });
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

describe("zenLiveBotCanvasSideFromCenterX", () => {
  it("classifies the live avatar by screen half", () => {
    assert.equal(zenLiveBotCanvasSideFromCenterX(240, 1000), "left");
    assert.equal(zenLiveBotCanvasSideFromCenterX(760, 1000), "right");
    assert.equal(zenLiveBotCanvasSideFromCenterX(500, 1000), "right");
  });

  it("falls back to left when geometry is unavailable", () => {
    assert.equal(zenLiveBotCanvasSideFromCenterX(Number.NaN, 1000), "left");
    assert.equal(zenLiveBotCanvasSideFromCenterX(240, 0), "left");
  });
});

describe("zenLiveBotResizeLaneAtClientX", () => {
  it("reserves only the empty columns beside centered Zen prose", () => {
    const geometry = {
      surfaceLeft: 100,
      surfaceWidth: 1200,
      proseWidth: 800,
    };
    assert.equal(
      zenLiveBotResizeLaneAtClientX({ ...geometry, clientX: 180 }),
      "left",
    );
    assert.equal(
      zenLiveBotResizeLaneAtClientX({ ...geometry, clientX: 1220 }),
      "right",
    );
    assert.equal(
      zenLiveBotResizeLaneAtClientX({ ...geometry, clientX: 700 }),
      null,
    );
  });

  it("keeps the full surface as prose when no side column exists", () => {
    assert.equal(
      zenLiveBotResizeLaneAtClientX({
        clientX: 10,
        surfaceLeft: 0,
        surfaceWidth: 1000,
        proseWidth: 1200,
      }),
      null,
    );
  });
});

describe("resizeZenLiveBotAvatarFromWheel", () => {
  it("grows upward scrolls and shrinks downward scrolls smoothly", () => {
    assert.ok(
      resizeZenLiveBotAvatarFromWheel({
        currentSizePx: 360,
        wheelDeltaY: -80,
        minSizePx: 94,
        maxSizePx: 840,
      }) > 360,
    );
    assert.ok(
      resizeZenLiveBotAvatarFromWheel({
        currentSizePx: 360,
        wheelDeltaY: 80,
        minSizePx: 94,
        maxSizePx: 840,
      }) < 360,
    );
  });

  it("clamps inertial wheel motion to the authored size range", () => {
    assert.equal(
      resizeZenLiveBotAvatarFromWheel({
        currentSizePx: 839,
        wheelDeltaY: -10_000,
        minSizePx: 94,
        maxSizePx: 840,
      }),
      840,
    );
    assert.equal(
      resizeZenLiveBotAvatarFromWheel({
        currentSizePx: 95,
        wheelDeltaY: 10_000,
        minSizePx: 94,
        maxSizePx: 840,
      }),
      94,
    );
  });

  it("jumps across the protected gap between compact and full renderers", () => {
    const geometry = {
      minSizePx: 94,
      maxSizePx: 840,
      compactMaxSizePx: 184,
      fullMinSizePx: 240,
    };
    assert.equal(
      resizeZenLiveBotAvatarFromWheel({
        ...geometry,
        currentSizePx: 184,
        wheelDeltaY: -80,
      }),
      240,
    );
    assert.equal(
      resizeZenLiveBotAvatarFromWheel({
        ...geometry,
        currentSizePx: 240,
        wheelDeltaY: 80,
      }),
      184,
    );
  });
});

describe("zenLiveBotFaceScaleYForCanvasSide", () => {
  it("flips left-side Zen bots to face right and leaves right-side bots facing left", () => {
    assert.equal(zenLiveBotFaceScaleYForCanvasSide("left"), "-1");
    assert.equal(zenLiveBotFaceScaleYForCanvasSide("right"), "1");
  });
});
