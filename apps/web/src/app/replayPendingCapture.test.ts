import assert from "node:assert/strict";
import test from "node:test";
import type { ReplayManifestV2 } from "@localai/shared";
import {
  discardPendingFaithfulReplayCapture,
  pendingFaithfulReplayCaptures,
  purgePendingFaithfulReplayCapturesForOwner,
  retainPendingFaithfulReplayCapture,
} from "./replayPendingCapture.ts";

function manifest(ownerCanary: string): ReplayManifestV2 {
  return {
    v: 2,
    surface: "signal",
    sourceId: "shared-source",
    title: ownerCanary,
    createdAt: "2026-09-02T00:00:00.000Z",
    completedAt: "2026-09-02T00:01:00.000Z",
    privacyMode: "local",
    participants: [],
    utterances: [],
    initialScene: {
      camera: null,
      segment: null,
      introActive: false,
      outroActive: false,
      activeAction: null,
      activeReaction: null,
      overlapMessageIds: [],
      studioMix: {},
      participants: {},
    },
    direction: [],
    visual: {} as ReplayManifestV2["visual"],
  };
}

test("pending faithful replay captures remain isolated for identical owner-local IDs", async () => {
  await retainPendingFaithfulReplayCapture({
    ownerId: "replay-owner-a",
    surface: "signal",
    sourceId: "shared-source",
    recordingId: null,
    bytes: Uint8Array.from([1, 2, 3]).buffer,
    contentType: "audio/webm",
    durationMs: 1200,
    manifest: manifest("owner-a private title"),
  });
  await retainPendingFaithfulReplayCapture({
    ownerId: "replay-owner-b",
    surface: "signal",
    sourceId: "shared-source",
    recordingId: null,
    bytes: Uint8Array.from([9, 8, 7]).buffer,
    contentType: "audio/webm",
    durationMs: 2400,
    manifest: manifest("owner-b private title"),
  });

  const ownerA = await pendingFaithfulReplayCaptures("replay-owner-a");
  const ownerB = await pendingFaithfulReplayCaptures("replay-owner-b");
  assert.equal(ownerA.length, 1);
  assert.equal(ownerB.length, 1);
  assert.equal(ownerA[0]?.manifest.title, "owner-a private title");
  assert.equal(ownerB[0]?.manifest.title, "owner-b private title");
  assert.deepEqual([...new Uint8Array(ownerA[0]!.bytes!)], [1, 2, 3]);
  assert.deepEqual([...new Uint8Array(ownerB[0]!.bytes!)], [9, 8, 7]);

  await discardPendingFaithfulReplayCapture(
    "replay-owner-a",
    "signal",
    "shared-source",
  );
  assert.equal(
    (await pendingFaithfulReplayCaptures("replay-owner-a")).length,
    0,
  );
  assert.equal(
    (await pendingFaithfulReplayCaptures("replay-owner-b")).length,
    1,
  );

  await retainPendingFaithfulReplayCapture({
    ownerId: "replay-owner-a",
    surface: "signal",
    sourceId: "shared-source",
    recordingId: null,
    bytes: Uint8Array.from([4, 5, 6]).buffer,
    contentType: "audio/webm",
    durationMs: 1800,
    manifest: manifest("owner-a second private title"),
  });
  await purgePendingFaithfulReplayCapturesForOwner("replay-owner-a");
  assert.equal(
    (await pendingFaithfulReplayCaptures("replay-owner-a")).length,
    0,
  );
  assert.equal(
    (await pendingFaithfulReplayCaptures("replay-owner-b")).length,
    1,
  );
});
