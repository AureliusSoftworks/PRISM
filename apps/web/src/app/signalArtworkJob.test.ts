import assert from "node:assert/strict";
import test from "node:test";
import {
  signalArtworkAssetLabel,
  signalArtworkJobCompletionNotice,
  signalArtworkJobHeadline,
  type SignalArtworkAssetKind,
  type SignalArtworkJobSnapshot,
} from "./signalArtworkJob.ts";

function activeSingleAssetJob(
  kind: SignalArtworkAssetKind,
): SignalArtworkJobSnapshot {
  return {
    id: `job-${kind}`,
    showId: "show-slate",
    showName: "Slate",
    status: "running",
    currentAsset: kind,
    completedCount: 0,
    totalCount: 1,
    assets: [{
      kind,
      status: "generating",
      error: null,
      imageId: null,
    }],
    errors: [],
    timings: {
      identityMs: null,
      nightStudioMs: null,
      dayRelightMs: null,
      logoMs: null,
      downloadMs: 0,
      localPersistenceMs: 0,
      attachmentMs: 0,
    },
    startedAt: "2026-07-16T07:00:00.000Z",
    updatedAt: "2026-07-16T07:00:00.000Z",
    finishedAt: null,
  };
}

test("specific Signal regenerations describe only their requested asset", () => {
  assert.equal(
    signalArtworkJobHeadline(activeSingleAssetJob("logo")),
    "Generating Logo",
  );
  assert.equal(
    signalArtworkJobHeadline(activeSingleAssetJob("night-studio")),
    "Generating Dark studio",
  );
  assert.equal(
    signalArtworkJobHeadline(activeSingleAssetJob("day-studio")),
    "Relighting the completed Dark studio",
  );
});

test("a completed single regeneration names that asset instead of the whole show look", () => {
  const logo = activeSingleAssetJob("logo");
  logo.status = "completed";
  logo.currentAsset = null;
  logo.completedCount = 1;
  logo.assets[0]!.status = "complete";
  assert.equal(signalArtworkJobHeadline(logo), "Logo ready");
});

test("Studio artwork progress includes its automatic receiver-map pass", () => {
  const lighting = activeSingleAssetJob("studio-lighting");
  assert.equal(signalArtworkAssetLabel("studio-lighting"), "Studio lighting");
  assert.equal(
    signalArtworkJobHeadline(lighting),
    "Building the Studio light map",
  );

  const studio = activeSingleAssetJob("day-studio");
  studio.status = "completed";
  studio.currentAsset = null;
  studio.completedCount = 2;
  studio.totalCount = 2;
  studio.assets[0]!.status = "complete";
  studio.assets.push({
    kind: "studio-lighting",
    status: "complete",
    error: null,
    imageId: "lighting-map",
  });
  assert.equal(signalArtworkJobHeadline(studio), "Studio refresh complete");
  assert.equal(
    signalArtworkJobCompletionNotice(studio),
    "The refreshed Light studio and its Studio lighting are live.",
  );
});
