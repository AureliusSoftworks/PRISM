import assert from "node:assert/strict";
import test from "node:test";
import {
  signalArtworkJobHeadline,
  signalArtworkJobSoftSynthesisCount,
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

test("completed terminal jobs keep zero soft synthesis count regardless of stale asset status hints", () => {
  const logo = activeSingleAssetJob("logo");
  logo.status = "completed";
  logo.currentAsset = null;
  logo.completedCount = 1;
  logo.assets[0]!.status = "complete";
  assert.equal(
    signalArtworkJobSoftSynthesisCount(logo, 1, 2),
    0,
    "completed jobs should still be suppressed from soft queue",
  );
});

test("active and queued asset counts remain visible for running Signal artwork jobs", () => {
  const logo = activeSingleAssetJob("logo");
  logo.status = "running";
  logo.currentAsset = "logo";
  logo.completedCount = 0;
  logo.assets[0]!.status = "generating";

  assert.equal(
    signalArtworkJobSoftSynthesisCount(logo, 1, 2),
    3,
    "running jobs should reflect active and queued work",
  );
});

test("terminal non-complete jobs still occupy one soft synthesis queue slot", () => {
  const logo = activeSingleAssetJob("logo");
  logo.status = "failed";
  logo.completedCount = 0;
  logo.assets[0]!.status = "failed";
  logo.errors = [{ asset: "logo", message: "Renderer unavailable" }];

  assert.equal(signalArtworkJobSoftSynthesisCount(logo, 0, 0), 1);
});
