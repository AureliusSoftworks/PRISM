import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coffeeSipTalkDelayMs,
  type CoffeeSipElement,
  waitForActiveCoffeeSipBeforeTalk,
} from "./coffee-sip-talk-gate.ts";

describe("Coffee sip-to-talk gate", () => {
  it("waits for the unfinished part of a visible sip", () => {
    assert.equal(
      coffeeSipTalkDelayMs({
        sipping: true,
        animationDurationMs: 2_400,
        animations: [
          {
            animationName: "page_coffeeCupSip__hash",
            currentTime: 900,
            playState: "running",
          },
        ],
      }),
      1_550,
    );
  });

  it("does not delay speech for an idle or already-finished cup", () => {
    assert.equal(
      coffeeSipTalkDelayMs({ sipping: false, animationDurationMs: 2_400 }),
      0,
    );
    assert.equal(
      coffeeSipTalkDelayMs({
        sipping: true,
        animationDurationMs: 2_400,
        animations: [
          {
            animationName: "page_coffeeCupSip__hash",
            currentTime: 2_400,
            playState: "finished",
          },
        ],
      }),
      0,
    );
  });

  it("holds the reveal when the rendered cup is mid-sip", async () => {
    const delays: number[] = [];
    const element: CoffeeSipElement = {
      isConnected: true,
      dataset: {
        cupSipping: "true",
        cupSipDurationMs: "2100",
      },
      getAnimations: () => [
        {
          animationName: "page_coffeeCupRestDuringSip__hash",
          currentTime: 600,
          playState: "running",
        },
      ],
    };

    const waitedMs = await waitForActiveCoffeeSipBeforeTalk(
      element,
      async (delayMs) => {
        delays.push(delayMs);
      },
    );

    assert.equal(waitedMs, 1_550);
    assert.deepEqual(delays, [1_550]);
  });
});
