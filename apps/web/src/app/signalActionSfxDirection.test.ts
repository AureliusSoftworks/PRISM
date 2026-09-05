import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ReplayManifestV2, ReplayUtteranceV1 } from "@localai/shared";
import {
  synthesizeSignalActionSfxDirection,
  signalActionSfxCueTextForUtterance,
} from "./signalActionSfxDirection.ts";

function utterance(
  partial: Partial<ReplayUtteranceV1> &
    Pick<ReplayUtteranceV1, "id" | "sourceMessageId" | "text">,
): ReplayUtteranceV1 {
  return {
    speakerId: "prism-player",
    speakerRole: "guest",
    spokenText: partial.text,
    moodKey: "neutral",
    audible: true,
    visible: true,
    createdAt: "2026-08-04T00:00:00.000Z",
    metadata: { stageActionText: "farts softly" },
    ...partial,
  };
}

describe("signalActionSfxDirection", () => {
  it("builds cue text from stageActionText metadata", () => {
    assert.equal(
      signalActionSfxCueTextForUtterance(
        utterance({
          id: "m1",
          sourceMessageId: "m1",
          text: "...",
          metadata: { stageActionText: "farts" },
        }),
      ),
      "*farts*",
    );
  });

  it("synthesizes missing action Foley for Upgrade voices", () => {
    const manifest = {
      utterances: [
        utterance({
          id: "m-fart",
          sourceMessageId: "m-fart",
          text: "...",
          metadata: { stageActionText: "farts" },
        }),
        utterance({
          id: "m-talk",
          sourceMessageId: "m-talk",
          text: "Hello from the booth.",
          metadata: { stageActionText: null },
        }),
      ],
      direction: [
        {
          sequence: 1,
          atMs: 1_200,
          kind: "speech" as const,
          sourceMessageId: "m-fart",
          payload: { active: true, speakerId: "prism-player" },
        },
        {
          sequence: 2,
          atMs: 2_000,
          kind: "speech" as const,
          sourceMessageId: "m-talk",
          payload: { active: true, speakerId: "prism-player" },
        },
      ],
    } satisfies Pick<ReplayManifestV2, "utterances" | "direction">;

    const synthesized = synthesizeSignalActionSfxDirection(manifest);
    assert.equal(synthesized.length, 1);
    assert.equal(synthesized[0]?.kind, "action");
    assert.equal(synthesized[0]?.sourceMessageId, "m-fart");
    assert.equal(synthesized[0]?.atMs, 1_200);
    assert.equal(synthesized[0]?.payload.kind, "action_sfx");
    assert.equal(synthesized[0]?.payload.actionKind, "fart");
    assert.equal(synthesized[0]?.payload.packOwnerKind, "player");
  });

  it("does not duplicate an existing action_sfx direction row", () => {
    const manifest = {
      utterances: [
        utterance({
          id: "m-fart",
          sourceMessageId: "m-fart",
          text: "...",
          metadata: { stageActionText: "farts" },
        }),
      ],
      direction: [
        {
          sequence: 1,
          atMs: 900,
          kind: "action" as const,
          sourceMessageId: "m-fart",
          payload: {
            kind: "action_sfx",
            actionKind: "fart",
            seed: "existing",
            packOwnerKind: "player",
          },
        },
      ],
    } satisfies Pick<ReplayManifestV2, "utterances" | "direction">;
    assert.deepEqual(synthesizeSignalActionSfxDirection(manifest), []);
  });

  it("wires live capture and studio-cut synthesis into Signal upgrade path", () => {
    const page = readFileSync(
      fileURLToPath(new URL("./page.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(page, /buildSignalActionSfxDirectionPayload/u);
    assert.match(
      page,
      /markReplayDirectionEvent\(\{[\s\S]{0,220}kind: "action"[\s\S]{0,160}payload: \{ \.\.\.directionPayload \}/u,
    );
    assert.match(page, /\/audio-cue/u);

    const mixer = readFileSync(
      fileURLToPath(new URL("./signalStudioCutAudio.ts", import.meta.url)),
      "utf8",
    );
    assert.match(mixer, /synthesizeSignalActionSfxDirection/u);
    assert.match(mixer, /directionWithActionFoley/u);

    const replayManifest = readFileSync(
      fileURLToPath(new URL("./replayManifest.ts", import.meta.url)),
      "utf8",
    );
    assert.match(replayManifest, /normalized === "audiocue"/u);
  });
});
