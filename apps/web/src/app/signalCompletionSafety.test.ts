import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BotIdentityMirrorStateV1 } from "@localai/shared";
import {
  boundedSignalReplayFinalization,
  signalMessageRequestsResponseCue,
  signalResponseCueBotIsMuted,
} from "./signalCompletionSafety.ts";

describe("Signal completion safety", () => {
  it("suppresses response cues for Identity Crisis holders borrowing Mute", () => {
    const holder = { id: "identity-holder", muted: false };
    const mutedTarget = { id: "muted-target", muted: true };
    const mirrorState = {
      holderBotId: holder.id,
      targetBotId: mutedTarget.id,
    } as BotIdentityMirrorStateV1;

    assert.equal(
      signalResponseCueBotIsMuted(
        holder,
        new Map([[holder.id, mirrorState]]),
        new Map([
          [holder.id, holder],
          [mutedTarget.id, mutedTarget],
        ]),
      ),
      true,
    );
    assert.equal(
      signalResponseCueBotIsMuted(
        holder,
        new Map(),
        new Map([
          [holder.id, holder],
          [mutedTarget.id, mutedTarget],
        ]),
        true,
      ),
      true,
      "a raw Identity Crisis responder waits for the server to resolve the borrowed Mute turn",
    );
  });

  it("never requests a response cue for an inaudible Mute performance", () => {
    assert.equal(
      signalMessageRequestsResponseCue({
        audienceDelivery: {
          v: 1,
          audible: true,
          speakerVisible: true,
          visibility: "visible",
          spectral: false,
        },
        mutePerformance: {
          v: 1,
          name: "mutePerformance",
          durationMs: 9_000,
          periodCount: 9,
          interrupted: false,
          elapsedCue: "Any day now.",
          reactionBeats: [],
        },
      }),
      false,
    );
  });

  it("bounds a replay finalizer that never settles", async () => {
    await assert.rejects(
      boundedSignalReplayFinalization(new Promise<never>(() => undefined), 5),
      /timed out/u,
    );
  });
});
