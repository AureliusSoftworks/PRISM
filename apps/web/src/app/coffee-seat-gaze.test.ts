import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  coffeeGazeDirectionValue,
  coffeeHeadGazeHorizontalSign,
  coffeeHeadPlateFaceScaleYFromGazeTargetSide,
  coffeeHeadSpeakingGazeTargetBotId,
  coffeePlateFaceScaleYFromGazeDirection,
  coffeePlateFaceScaleYFromSeatHorizontalSide,
  coffeeSeatCanvasLeftPercent,
  coffeeSeatCanvasLightingFromLeftPercent,
  coffeeSeatHorizontalSideFromLeftPercent,
  coffeeSeatHorizontalTableSide,
  coffeeSeatIsTopHead,
  coffeeSpeakerGazeHorizontalDirection,
  resolveCoffeeSpeakerGazeTarget,
} from "./coffee-seat-gaze.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8"
);

describe("coffeeSeatHorizontalSideFromLeftPercent", () => {
  it("classifies left percentages into stable horizontal bands", () => {
    assert.equal(coffeeSeatHorizontalSideFromLeftPercent(24.3), -1);
    assert.equal(coffeeSeatHorizontalSideFromLeftPercent(49.5), 0);
    assert.equal(coffeeSeatHorizontalSideFromLeftPercent(50), 0);
    assert.equal(coffeeSeatHorizontalSideFromLeftPercent(53.5), 0);
    assert.equal(coffeeSeatHorizontalSideFromLeftPercent(76.2), 1);
  });
});

describe("coffeeSeatHorizontalTableSide", () => {
  it("classifies compact seats by base left%", () => {
    assert.equal(coffeeSeatHorizontalTableSide(true, 0, 5, 0), 0);
    assert.equal(coffeeSeatHorizontalTableSide(true, 1, 5, 0), -1);
    assert.equal(coffeeSeatHorizontalTableSide(true, 2, 5, 0), 1);
  });

  it("classifies compact 4-seat preview by visual layout slot", () => {
    assert.equal(coffeeSeatHorizontalTableSide(true, 0, 4, 0), -1);
    assert.equal(coffeeSeatHorizontalTableSide(true, 1, 4, 1), 1);
    assert.equal(coffeeSeatHorizontalTableSide(true, 2, 4, 2), 1);
    assert.equal(coffeeSeatHorizontalTableSide(true, 3, 4, 3), -1);
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

describe("coffeeSeatCanvasLeftPercent", () => {
  it("returns continuous authored left coordinates for live docked seats", () => {
    assert.equal(
      coffeeSeatCanvasLeftPercent({
        compact: false,
        seatIndex: 1,
        seatCount: 5,
        layoutIndex: 1,
        phase: "live",
        autoplayDock: true,
      }),
      22
    );
    assert.equal(
      coffeeSeatCanvasLeftPercent({
        compact: false,
        seatIndex: 4,
        seatCount: 5,
        layoutIndex: 4,
        phase: "live",
        autoplayDock: true,
      }),
      74
    );
  });

  it("uses the wider x coordinates from the experimental table angle layout", () => {
    assert.equal(
      coffeeSeatCanvasLeftPercent({
        compact: false,
        seatIndex: 1,
        seatCount: 5,
        layoutIndex: 1,
        phase: "live",
        autoplayDock: true,
        experimentalTableAngle: true,
      }),
      14
    );
    assert.equal(
      coffeeSeatCanvasLeftPercent({
        compact: false,
        seatIndex: 2,
        seatCount: 5,
        layoutIndex: 2,
        phase: "live",
        autoplayDock: true,
        experimentalTableAngle: true,
      }),
      86
    );
  });
});

describe("coffeeSeatCanvasLightingFromLeftPercent", () => {
  it("derives metal rotation and glare from x-axis placement", () => {
    assert.deepEqual(coffeeSeatCanvasLightingFromLeftPercent(14), {
      leftPercent: 14,
      metalRotationDeg: -42,
      glareXPct: 62,
      glareYPct: 22,
      glareAngleDeg: -42,
    });
    assert.deepEqual(coffeeSeatCanvasLightingFromLeftPercent(50, { topHead: true }), {
      leftPercent: 50,
      metalRotationDeg: 0,
      glareXPct: 48,
      glareYPct: 34,
      glareAngleDeg: -16,
    });
    assert.deepEqual(coffeeSeatCanvasLightingFromLeftPercent(86), {
      leftPercent: 86,
      metalRotationDeg: 42,
      glareXPct: 38,
      glareYPct: 22,
      glareAngleDeg: 34,
    });
  });

  it("keeps roster preview glare lower while still following x placement", () => {
    assert.equal(coffeeSeatCanvasLightingFromLeftPercent(22, { rosterPreview: true }).glareYPct, 24);
    assert.ok(coffeeSeatCanvasLightingFromLeftPercent(22, { rosterPreview: true }).glareXPct > 48);
  });
});

describe("coffeeSeatIsTopHead", () => {
  it("identifies compact top as head", () => {
    assert.equal(coffeeSeatIsTopHead(true, 5, 0, 0), true);
    assert.equal(coffeeSeatIsTopHead(true, 5, 1, 1), false);
    assert.equal(coffeeSeatIsTopHead(true, 4, 0, 0), false);
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
  it("flips Y only when a top head target is on the right half of the ring", () => {
    assert.equal(coffeeHeadPlateFaceScaleYFromGazeTargetSide(-1), "1");
    assert.equal(coffeeHeadPlateFaceScaleYFromGazeTargetSide(0), "1");
    assert.equal(coffeeHeadPlateFaceScaleYFromGazeTargetSide(1), "-1");
  });
});

describe("resolveCoffeeSpeakerGazeTarget", () => {
  const seatedBotIds = new Set(["left", "top", "right"]);
  const botNameToId = new Map([
    ["Left", "left"],
    ["Top", "top"],
    ["Right", "right"],
  ]);

  it("gives the player's last explicit mention precedence over the prior speaker", () => {
    assert.deepEqual(
      resolveCoffeeSpeakerGazeTarget({
        speaker: { kind: "player" },
        explicitMentionBotIds: ["left", "right"],
        previousMessages: [
          { role: "assistant", botId: "top", botName: "Top" },
        ],
        seatedBotIds,
        botNameToId,
      }),
      {
        participant: { kind: "bot", botId: "right" },
        source: "explicit",
      }
    );
  });

  it("gives a bot's explicit mention precedence over the player it is answering", () => {
    assert.deepEqual(
      resolveCoffeeSpeakerGazeTarget({
        speaker: { kind: "bot", botId: "top" },
        explicitMentionBotIds: ["left"],
        previousMessages: [{ role: "user" }],
        seatedBotIds,
        botNameToId,
      }),
      {
        participant: { kind: "bot", botId: "left" },
        source: "explicit",
      }
    );
  });

  it("infers that a bot is answering the player", () => {
    assert.deepEqual(
      resolveCoffeeSpeakerGazeTarget({
        speaker: { kind: "bot", botId: "right" },
        explicitMentionBotIds: [],
        previousMessages: [{ role: "user" }],
        seatedBotIds,
        botNameToId,
      }),
      { participant: { kind: "player" }, source: "inferred" }
    );
  });

  it("infers the last other bot and ignores self or unavailable mentions", () => {
    assert.deepEqual(
      resolveCoffeeSpeakerGazeTarget({
        speaker: { kind: "bot", botId: "right" },
        explicitMentionBotIds: ["missing", "right"],
        previousMessages: [
          { role: "assistant", botName: "Left" },
          { role: "assistant", botId: "right", botName: "Right" },
        ],
        seatedBotIds,
        botNameToId,
      }),
      {
        participant: { kind: "bot", botId: "left" },
        source: "inferred",
      }
    );
  });
});

describe("coffeeSpeakerGazeHorizontalDirection", () => {
  const visibleSeats = [
    { botId: "top", seatIndex: 0, layoutIndex: 0, leftPercent: 50 },
    { botId: "left", seatIndex: 1, layoutIndex: 1, leftPercent: 21 },
    { botId: "right", seatIndex: 2, layoutIndex: 2, leftPercent: 79 },
  ] as const;

  it("turns the player left or right toward an explicitly addressed bot", () => {
    assert.equal(
      coffeeSpeakerGazeHorizontalDirection({
        speaker: { kind: "player" },
        target: { kind: "bot", botId: "left" },
        compact: false,
        seatCount: 5,
        visibleSeats,
      }),
      -1
    );
    assert.equal(
      coffeeSpeakerGazeHorizontalDirection({
        speaker: { kind: "player" },
        target: { kind: "bot", botId: "right" },
        compact: false,
        seatCount: 5,
        visibleSeats,
      }),
      1
    );
  });

  it("lets the top speaker face either side and side bots face the player", () => {
    assert.equal(
      coffeeSpeakerGazeHorizontalDirection({
        speaker: { kind: "bot", botId: "top" },
        target: { kind: "bot", botId: "left" },
        compact: false,
        seatCount: 5,
        visibleSeats,
      }),
      -1
    );
    assert.equal(
      coffeeSpeakerGazeHorizontalDirection({
        speaker: { kind: "bot", botId: "top" },
        target: { kind: "bot", botId: "right" },
        compact: false,
        seatCount: 5,
        visibleSeats,
      }),
      1
    );
    assert.equal(
      coffeeSpeakerGazeHorizontalDirection({
        speaker: { kind: "bot", botId: "left" },
        target: { kind: "player" },
        compact: false,
        seatCount: 5,
        visibleSeats,
      }),
      1
    );
    assert.equal(
      coffeeSpeakerGazeHorizontalDirection({
        speaker: { kind: "bot", botId: "right" },
        target: { kind: "player" },
        compact: false,
        seatCount: 5,
        visibleSeats,
      }),
      -1
    );
  });

  it("keeps centered participants neutral and maps directions to render values", () => {
    assert.equal(
      coffeeSpeakerGazeHorizontalDirection({
        speaker: { kind: "player" },
        target: { kind: "bot", botId: "top" },
        compact: false,
        seatCount: 5,
        visibleSeats,
      }),
      0
    );
    assert.equal(coffeeGazeDirectionValue(-1), "left");
    assert.equal(coffeeGazeDirectionValue(0), "center");
    assert.equal(coffeeGazeDirectionValue(1), "right");
    assert.equal(coffeePlateFaceScaleYFromGazeDirection(-1), "1");
    assert.equal(coffeePlateFaceScaleYFromGazeDirection(1), "-1");
    assert.equal(coffeePlateFaceScaleYFromGazeDirection(0, "-1"), "-1");
  });

  it("orients the player toward every authored two-to-five-bot seat", () => {
    for (const seatCount of [2, 3, 4, 5]) {
      const seats = Array.from({ length: seatCount }, (_, layoutIndex) => ({
        botId: `bot-${seatCount}-${layoutIndex}`,
        seatIndex: layoutIndex,
        layoutIndex,
        leftPercent: coffeeSeatCanvasLeftPercent({
          compact: false,
          seatIndex: layoutIndex,
          seatCount,
          layoutIndex,
        }),
      }));
      for (const seat of seats) {
        const direction = coffeeSpeakerGazeHorizontalDirection({
          speaker: { kind: "player" },
          target: { kind: "bot", botId: seat.botId },
          compact: false,
          seatCount,
          visibleSeats: seats,
        });
        assert.equal(
          direction,
          seat.leftPercent < 49 ? -1 : seat.leftPercent > 51 ? 1 : 0,
        );
      }
    }
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

  it("ignores pending speaker before table typing begins", () => {
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
      coffeeTurnRhythmState: "botThinking",
      coffeePendingSpeakerBotId: "left",
      headIsSpeaking: false,
      messages: [],
      botNameToId: map,
    });
    assert.equal(sign, 0);
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

describe("Coffee speaker gaze wiring", () => {
  it("uses currently revealed explicit mentions before conversational inference", () => {
    assert.match(
      pageSource,
      /coffeeVisibleDirectedMentionBotIds\([\s\S]*?resolveCoffeeSpeakerGazeTarget\([\s\S]*?explicitMentionBotIds:/,
    );
    assert.match(
      pageSource,
      /coffeeSpeakerGazeParticipant\?\.kind === "player"[\s\S]*?replayPlayerGazeDirection/,
    );
    assert.match(
      pageSource,
      /coffeeSpeakerGazeParticipant\?\.kind === "bot"[\s\S]*?coffeePlateFaceScaleYFromGazeDirection/,
    );
  });

  it("labels both bot and player avatars with one active gaze direction", () => {
    assert.ok(
      (pageSource.match(/data-gaze-direction=/g)?.length ?? 0) >= 2,
      "expected bot-seat and player-avatar gaze attributes",
    );
    assert.match(pageSource, /data-gaze-target-source=/);
  });

  it("turns and resets the body subtly with a reduced-motion fallback", () => {
    assert.match(
      cssSource,
      /\.coffeeSeat,\s*\.coffeeReplayPlayerAvatar\s*\{[\s\S]*?--coffee-speaker-gaze-body-shift-x:\s*0px;[\s\S]*?--coffee-speaker-gaze-body-rotation:\s*0deg/,
    );
    assert.match(
      cssSource,
      /\.coffeeSeat\[data-gaze-direction="left"\][\s\S]*?--coffee-speaker-gaze-body-rotation:\s*-1\.4deg/,
    );
    assert.match(
      cssSource,
      /\.coffeeSeat\[data-gaze-direction="right"\][\s\S]*?--coffee-speaker-gaze-body-rotation:\s*1\.4deg/,
    );
    assert.match(
      cssSource,
      /\.coffeeSeat \.zenLiveBotPresenceBody,[\s\S]*?transition:\s*transform 380ms/,
    );
    assert.match(
      cssSource,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.coffeeReplayPlayerAvatar \.zenLiveBotPresenceBody[\s\S]*?transition:\s*none/,
    );
  });
});
