import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coffeeHeadGazeHorizontalSign,
  coffeeHeadPlateFaceScaleYFromGazeTargetSide,
  coffeeHeadSpeakingGazeTargetBotId,
  coffeePlateFaceScaleYFromSeatHorizontalSide,
  coffeeSeatHorizontalTableSide,
  coffeeSeatIsTopHead,
} from "./coffee-seat-gaze.ts";

describe("coffeeSeatHorizontalTableSide", () => {
  it("classifies compact seats by base left%", () => {
    assert.equal(coffeeSeatHorizontalTableSide(true, 0, 5, 0), 0);
    assert.equal(coffeeSeatHorizontalTableSide(true, 1, 5, 0), -1);
    assert.equal(coffeeSeatHorizontalTableSide(true, 2, 5, 0), 1);
  });

  it("classifies full-stage 5-seat ring", () => {
    assert.equal(coffeeSeatHorizontalTableSide(false, 0, 5, 0), 0);
    assert.equal(coffeeSeatHorizontalTableSide(false, 0, 5, 1), -1);
    assert.equal(coffeeSeatHorizontalTableSide(false, 0, 5, 2), 1);
    assert.equal(coffeeSeatHorizontalTableSide(false, 0, 5, 3), -1);
    assert.equal(coffeeSeatHorizontalTableSide(false, 0, 5, 4), 1);
  });

  it("classifies full-stage 4-seat ring as two left and two right seats", () => {
    assert.equal(coffeeSeatHorizontalTableSide(false, 0, 4, 0), -1);
    assert.equal(coffeeSeatHorizontalTableSide(false, 0, 4, 1), 1);
    assert.equal(coffeeSeatHorizontalTableSide(false, 0, 4, 2), 1);
    assert.equal(coffeeSeatHorizontalTableSide(false, 0, 4, 3), -1);
  });

  it("classifies two-bot layout as left/right", () => {
    assert.equal(coffeeSeatHorizontalTableSide(false, 0, 2, 0), -1);
    assert.equal(coffeeSeatHorizontalTableSide(false, 1, 2, 1), 1);
  });
});

describe("coffeeSeatIsTopHead", () => {
  it("identifies compact top as head", () => {
    assert.equal(coffeeSeatIsTopHead(true, 5, 0, 0), true);
    assert.equal(coffeeSeatIsTopHead(true, 5, 1, 1), false);
  });

  it("identifies only centered full-stage top seats as head", () => {
    assert.equal(coffeeSeatIsTopHead(false, 5, 0, 0), true);
    assert.equal(coffeeSeatIsTopHead(false, 4, 0, 0), false);
    assert.equal(coffeeSeatIsTopHead(false, 5, 1, 0), false);
    assert.equal(coffeeSeatIsTopHead(false, 2, 0, 0), false);
  });
});

describe("coffeePlateFaceScaleYFromSeatHorizontalSide", () => {
  it("flips left-of-center seats on Y after rotate so they face inward", () => {
    assert.equal(coffeePlateFaceScaleYFromSeatHorizontalSide(-1), "-1");
    assert.equal(coffeePlateFaceScaleYFromSeatHorizontalSide(0), "1");
    assert.equal(coffeePlateFaceScaleYFromSeatHorizontalSide(1), "1");
  });
});

describe("coffeeHeadPlateFaceScaleYFromGazeTargetSide", () => {
  it("flips Y when gaze target is on the left half of the ring", () => {
    assert.equal(coffeeHeadPlateFaceScaleYFromGazeTargetSide(-1), "-1");
    assert.equal(coffeeHeadPlateFaceScaleYFromGazeTargetSide(0), "1");
    assert.equal(coffeeHeadPlateFaceScaleYFromGazeTargetSide(1), "1");
  });
});

describe("coffeeHeadSpeakingGazeTargetBotId", () => {
  it("returns last other assistant bot id", () => {
    const map = new Map([
      ["A", "id-a"],
      ["B", "id-b"],
    ]);
    const id = coffeeHeadSpeakingGazeTargetBotId(
      [
        { role: "assistant", botName: "A" },
        { role: "assistant", botName: "B" },
      ],
      "id-b",
      map
    );
    assert.equal(id, "id-a");
  });

  it("returns null when user is encountered first walking back", () => {
    const map = new Map([["A", "id-a"]]);
    const id = coffeeHeadSpeakingGazeTargetBotId(
      [{ role: "assistant", botName: "A" }, { role: "user" }],
      "id-head",
      map
    );
    assert.equal(id, null);
  });
});

describe("coffeeHeadGazeHorizontalSign", () => {
  const seats5 = [
    { botId: "top", seatIndex: 0, layoutIndex: 0 },
    { botId: "left", seatIndex: 0, layoutIndex: 1 },
    { botId: "right", seatIndex: 0, layoutIndex: 2 },
  ] as const;

  it("head looks at pending speaker on the left", () => {
    const map = new Map([
      ["Top", "top"],
      ["Left", "left"],
    ]);
    const sign = coffeeHeadGazeHorizontalSign({
      compact: false,
      seatCount: 5,
      visibleSeats: [
        { botId: "top", seatIndex: 0, layoutIndex: 0 },
        { botId: "left", seatIndex: 0, layoutIndex: 1 },
      ],
      headBotId: "top",
      coffeeTurnRhythmState: "tableTyping",
      coffeePendingSpeakerBotId: "left",
      headIsSpeaking: false,
      messages: [],
      botNameToId: map,
    });
    assert.equal(sign, -1);
  });

  it("uses inferred addressee when head is speaking", () => {
    const map = new Map([
      ["Top", "top"],
      ["Right", "right"],
    ]);
    const sign = coffeeHeadGazeHorizontalSign({
      compact: false,
      seatCount: 5,
      visibleSeats: [...seats5],
      headBotId: "top",
      coffeeTurnRhythmState: "idle",
      coffeePendingSpeakerBotId: null,
      headIsSpeaking: true,
      messages: [{ role: "assistant", botName: "Right" }],
      botNameToId: map,
    });
    assert.equal(sign, 1);
  });
});
