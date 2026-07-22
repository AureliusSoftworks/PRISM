import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const settingsPanelSource = readFileSync(
  new URL("./SettingsPanel.tsx", import.meta.url),
  "utf8",
);
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
const storageSource = readFileSync(
  new URL("../../../api/src/image-storage.ts", import.meta.url),
  "utf8",
);

describe("unused image asset cleanup", () => {
  it("exposes an authenticated audit and a revalidated transactional mutation", () => {
    assert.match(
      serverSource,
      /route\("GET", "\/api\/images\/cleanup-preview"[\s\S]{0,500}requireAuth\(ctx\)[\s\S]{0,500}previewUnreferencedImageAssets/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/images\/cleanup"[\s\S]{0,240}requireAuth\(ctx\)/u,
    );
    assert.match(auditSource, /readOnly:\s*true/u);
    assert.match(auditSource, /IMAGE_ASSET_CLEANUP_PREVIEW_VERSION = 3/u);
    assert.match(auditSource, /SYSTEM_MANAGED_IMAGE_ORIGINS/u);
    assert.match(auditSource, /candidateStorageBytes/u);
    assert.match(auditSource, /BEGIN IMMEDIATE/u);
    assert.match(auditSource, /graph\.preview\.snapshot !== validated\.snapshot/u);
    assert.match(auditSource, /DELETE FROM images WHERE id = \? AND user_id = \? AND local_rel_path = \?/u);
    assert.match(storageSource, /asset-cleanup-trash/u);
    assert.match(storageSource, /manifest\.json/u);
    assert.match(storageSource, /state: "prepared"/u);
    assert.match(storageSource, /restoreQuarantinedGeneratedImageFiles/u);
    assert.match(storageSource, /generatedImageStorageSizeBytes/u);
    assert.match(storageSource, /purgeGeneratedImageQuarantine/u);
    assert.match(serverSource, /"\/api\/images\/cleanup-recovery"/u);
    assert.match(serverSource, /cleanup-recovery\/:id\/restore/u);
  });

  it("sends the snapshot and exact selected ids only after confirmation", () => {
    const requestSlice = pageSource.slice(
      pageSource.indexOf("async function previewUnusedImageAssets"),
      pageSource.indexOf("async function deleteGalleryImage"),
    );
    const modalSlice = pageSource.slice(
      pageSource.indexOf("const renderImageCleanupPreviewModal"),
      pageSource.indexOf("const renderSweepConfirmModal"),
    );
    assert.match(requestSlice, /"\/api\/images\/cleanup-preview"/u);
    assert.match(requestSlice, /"\/api\/images\/cleanup"[\s\S]*method:\s*"POST"/u);
    assert.match(
      requestSlice,
      /JSON\.stringify\(\{[\s\S]*snapshot: preview\.snapshot,[\s\S]*imageIds,[\s\S]*permanent: true/u,
    );
    assert.match(
      requestSlice,
      /new Set\(result\.preview\.candidates\.map\(\(candidate\) => candidate\.id\)\)/u,
    );
    assert.match(modalSlice, /Unused asset preview/u);
    assert.match(
      modalSlice,
      /createPortal\([\s\S]*data-asset-cleanup-preview="true"[\s\S]*document\.body/u,
    );
    assert.match(modalSlice, /role="alertdialog"/u);
    assert.match(modalSlice, /ref=\{imageCleanupConfirmCancelRef\}/u);
    assert.match(
      pageSource,
      /event\.key === "Escape"[\s\S]*imageCleanupConfirmOpen[\s\S]*setImageCleanupConfirmOpen\(false\)/u,
    );
    assert.match(
      pageSource,
      /event\.key !== "Tab"[\s\S]*panelFocusableElements\(modal\)[\s\S]*last\.focus/u,
    );
    assert.match(
      pageSource,
      /\[role="dialog"\]\[aria-modal="true"\], \[role="alertdialog"\]\[aria-modal="true"\]/u,
    );
    assert.match(modalSlice, /Permanently delete selected/u);
    assert.match(modalSlice, /This cannot be undone/u);
    assert.match(modalSlice, /candidateStorageBytes/u);
    assert.match(modalSlice, /candidate\.storageBytes/u);
    assert.match(modalSlice, /Source: \{candidate\.modeLabel\}/u);
    assert.match(modalSlice, /formatAssetAge\(candidate\.createdAt\)/u);
    assert.match(modalSlice, /Recovery trash/u);
    assert.match(modalSlice, /Account backups do not include/u);
    assert.match(modalSlice, /resetting or deleting the account clears/u);
    assert.match(modalSlice, /Permanently delete/u);
    assert.match(modalSlice, /restoreImageCleanupRecovery/u);
    assert.match(modalSlice, /imageCleanupSelectedIds\.has\(candidate\.id\)/u);
    assert.match(modalSlice, /candidate\.reason/u);
    assert.match(modalSlice, /What PRISM checked/u);
    assert.match(modalSlice, /Run audit again/u);
    assert.match(
      pageSource,
      /activeSettingsScope === "help"[\s\S]{0,6000}data-settings-action="clean-unused-assets"/u,
    );
    assert.match(settingsPanelSource, /\| "help"/u);
    assert.match(
      settingsPanelSource,
      /label: "Info"[\s\S]{0,300}scope: "help",[\s\S]{0,80}title: "Help"/u,
    );
    assert.match(pageSource, /data-settings-section="help"/u);
    assert.equal(
      [...pageSource.matchAll(/data-settings-action="clean-unused-assets"/gu)]
        .length,
      1,
    );
    assert.match(pageSource, /<strong>Clean unused assets<\/strong>/u);
    assert.match(
      pageSource,
      /Intentional Image[\s\S]{0,120}chat images, uploads, and[\s\S]{0,50}imports are never included/u,
    );
    assert.doesNotMatch(
      pageSource,
      /aria-label="Preview unused generated assets"/u,
    );
    assert.match(
      modalSlice,
      /if \(checked\) next\.add\(candidate\.id\);[\s\S]{0,80}else next\.delete\(candidate\.id\);/u,
    );
  });

  it("keeps the selectable audit legible and updates contextual guidance", () => {
    assert.match(
      cssSource,
      /\.imageCleanupPreviewPanel\s*\{[\s\S]*max-width:\s*760px/u,
    );
    assert.match(
      cssSource,
      /\.imageCleanupCandidateList\s*\{[\s\S]*overflow-y:\s*auto/u,
    );
    assert.match(cssSource, /\.imageCleanupRecoveryBadge/u);
    assert.match(cssSource, /\.imageCleanupCandidateSelect/u);
    assert.doesNotMatch(tutorialSource, /sparkle audit finds generated files/u);
  });
});
