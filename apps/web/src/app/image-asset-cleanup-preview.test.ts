import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);
const auditSource = readFileSync(
  new URL("../../../api/src/image-asset-cleanup.ts", import.meta.url),
  "utf8",
);

describe("unused image asset preview", () => {
  it("exposes an authenticated read-only audit with no cleanup mutation route", () => {
    assert.match(
      serverSource,
      /route\("GET", "\/api\/images\/cleanup-preview"[\s\S]{0,180}requireAuth\(ctx\)[\s\S]{0,180}previewUnreferencedImageAssets/u,
    );
    assert.doesNotMatch(
      serverSource,
      /route\("(?:POST|DELETE|PATCH)", "\/api\/images\/cleanup/u,
    );
    assert.match(auditSource, /readOnly:\s*true/u);
    assert.doesNotMatch(auditSource, /DELETE FROM|tryUnlink|writeFile|unlinkSync/u);
  });

  it("opens a preview-only account audit and explains every candidate", () => {
    const requestSlice = pageSource.slice(
      pageSource.indexOf("async function previewUnusedImageAssets"),
      pageSource.indexOf("async function deleteGalleryImage"),
    );
    const modalSlice = pageSource.slice(
      pageSource.indexOf("const renderImageCleanupPreviewModal"),
      pageSource.indexOf("const renderSweepConfirmModal"),
    );
    assert.match(requestSlice, /"\/api\/images\/cleanup-preview"/u);
    assert.doesNotMatch(requestSlice, /method:\s*"DELETE"/u);
    assert.match(modalSlice, /Unused asset preview/u);
    assert.match(modalSlice, /Nothing can\s+be deleted from this preview/u);
    assert.match(modalSlice, /candidate\.reason/u);
    assert.match(modalSlice, /What PRISM checked/u);
    assert.match(modalSlice, /Run audit again/u);
    assert.doesNotMatch(modalSlice, /deleteGalleryImage|deleteAllGalleryImages/u);
    assert.match(
      pageSource,
      /imagePanelScope === "all" && view !== "chat"[\s\S]{0,280}aria-label="Preview unused generated assets"/u,
    );
  });

  it("keeps the large preview legible and updates contextual guidance", () => {
    assert.match(
      cssSource,
      /\.imageCleanupPreviewPanel\s*\{[\s\S]*max-width:\s*760px/u,
    );
    assert.match(
      cssSource,
      /\.imageCleanupCandidateList\s*\{[\s\S]*overflow-y:\s*auto/u,
    );
    assert.match(cssSource, /\.imageCleanupReadOnlyBadge/u);
    assert.match(
      tutorialSource,
      /sparkle audit previews generated files[\s\S]*never deletes anything/u,
    );
  });
});
