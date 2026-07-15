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

describe("saved group room atmosphere integration", () => {
  it("normalizes optional atmosphere metadata without changing the storage key", () => {
    assert.match(pageSource, /roomAtmosphere\?: BotGroupRoomAtmosphere/u);
    assert.match(
      pageSource,
      /const roomAtmosphere = normalizeBotGroupRoomAtmosphere\([\s\S]*?record\.roomAtmosphere/u,
    );
    assert.match(
      pageSource,
      /window\.localStorage\.setItem\([\s\S]*?botLibraryGroupsStorageKey\(user\.id\)[\s\S]*?JSON\.stringify\(botLibraryGroups\)/u,
    );
    assert.match(
      pageSource,
      /const BOT_LIBRARY_GROUPS_STORAGE_KEY = "prism_bot_library_groups"/u,
    );
  });

  it("round-trips atmosphere metadata and PNG assets through v1 account backups but omits account-local ids from .bots manifests", () => {
    assert.match(
      pageSource,
      /schema: "prism-account-backup-v1"[\s\S]*?botLibraryGroups: normalizeBotLibraryGroups\(botLibraryGroups\)/u,
    );
    assert.match(
      pageSource,
      /record\.schema === "prism-account-backup-v1"[\s\S]*?botLibraryGroups: normalizeBotLibraryGroups\([\s\S]*?record\.botLibraryGroups/u,
    );
    assert.match(
      pageSource,
      /collectBotGroupRoomAtmosphereBackupAssets\(botLibraryGroups\)[\s\S]*?botGroupRoomAtmosphereAssets/u,
    );
    assert.match(
      pageSource,
      /normalizeBotGroupRoomAtmosphereBackupAssets\([\s\S]*?record\.botGroupRoomAtmosphereAssets/u,
    );
    assert.match(
      pageSource,
      /\/api\/images\/group-room-wallpaper\/upload[\s\S]*?remapBotGroupRoomAtmosphereBackupImageIds/u,
    );
    assert.match(
      pageSource,
      /refreshAll\(\{ includeModels: false \}\)/u,
    );
    assert.match(
      pageSource,
      /omittedRoomAtmosphereAssetCount[\s\S]*?unavailable or too large to include/u,
    );
    assert.match(
      pageSource,
      /failedAtmosphereAssetCount[\s\S]*?those rooms will use their member gradients/u,
    );
    const manifestInterface = pageSource.match(
      /interface BotGroupManifestV1 \{[\s\S]*?\n\}/u,
    )?.[0];
    assert.ok(manifestInterface);
    assert.doesNotMatch(manifestInterface, /roomAtmosphere|imageId/u);
  });

  it("offers local selection, clear, and purpose-scoped generation from the group hero", () => {
    assert.match(pageSource, /data-tutorial-target="chat-group-atmosphere"/u);
    assert.match(pageSource, /data-room-atmosphere-dialog="true"/u);
    assert.match(
      pageSource,
      /eligibleBotGroupRoomAtmosphereImages\([\s\S]*?imageBotDirectorySnapshot,[\s\S]*?imagePrivateGeneratedIds/u,
    );
    assert.match(pageSource, /clearBotGroupRoomAtmosphere\(current/u);
    assert.match(
      pageSource,
      /purpose: "group-room-wallpaper",[\s\S]*?groupName: target\.name,[\s\S]*?groupDescription: target\.description,[\s\S]*?memberBotIds/u,
    );
    assert.match(pageSource, /resolveZenWallpaperImageModels\(\)/u);
    assert.match(
      pageSource,
      /ONLINE[\s\S]*?sends those cues to the selected image provider; LOCAL keeps[\s\S]*?on your network/u,
    );
  });

  it("traps focus, makes the background inert, and restores the opener", () => {
    assert.match(
      pageSource,
      /ref=\{botGroupRoomAtmosphereDialogPanelRef\}[\s\S]{0,180}role="dialog"/u,
    );
    const focusEffectStart = pageSource.indexOf(
      "if (!botGroupRoomAtmosphereDialog?.groupId) return;",
    );
    const focusEffectEnd = pageSource.indexOf(
      "\n\n  useEffect(() => {",
      focusEffectStart,
    );
    assert.ok(focusEffectStart >= 0 && focusEffectEnd > focusEffectStart);
    const focusEffectSource = pageSource.slice(
      focusEffectStart,
      focusEffectEnd,
    );
    assert.match(
      focusEffectSource,
      /const handleAtmosphereDialogKeyDown = \(event: KeyboardEvent\): void => \{/u,
    );
    assert.match(
      focusEffectSource,
      /event\.key === "Escape"[\s\S]{0,220}botGroupRoomAtmosphereDialogBusyRef\.current[\s\S]{0,220}closeBotGroupRoomAtmosphereDialog\(\)/u,
    );
    assert.match(focusEffectSource, /event\.key !== "Tab"/u);
    assert.match(
      focusEffectSource,
      /panelFocusableElements\(panelNode\)[\s\S]{0,900}last\.focus/u,
    );
    assert.match(
      focusEffectSource,
      /node\.setAttribute\("aria-hidden", "true"\)/u,
    );
    assert.match(focusEffectSource, /node\.setAttribute\("inert", ""\)/u);
    assert.match(focusEffectSource, /node\.removeAttribute\("inert"\)/u);
    assert.match(
      focusEffectSource,
      /document\.addEventListener\("keydown", handleAtmosphereDialogKeyDown, true\)/u,
    );
    assert.match(
      focusEffectSource,
      /document\.removeEventListener\([\s\S]{0,120}handleAtmosphereDialogKeyDown/u,
    );
    assert.match(
      focusEffectSource,
      /const opener = botGroupRoomAtmosphereDialogOpenerRef\.current[\s\S]{0,240}document\.contains\(opener\)[\s\S]{0,240}opener\.focus/u,
    );
  });

  it("closes and releases the modal if its backing group stops being eligible", () => {
    assert.match(
      pageSource,
      /const groupId = botGroupRoomAtmosphereDialog\?\.groupId[\s\S]{0,520}validMemberCount[\s\S]{0,520}closeBotGroupRoomAtmosphereDialog\(\)/u,
    );
  });

  it("renders selected ids from authenticated file routes with independent stale fallback", () => {
    assert.match(
      pageSource,
      /botGroupRoomAtmosphereImageFileUrl\([\s\S]*?botGroupRoomAtmosphereImageId/u,
    );
    assert.match(pageSource, /botGroupFailedWallpaperImageIds/u);
    assert.match(pageSource, /data-room-atmosphere-image-id=/u);
    assert.match(
      pageSource,
      /onError=\{\(\) =>[\s\S]*?next\.add\(botGroupRoomAtmosphereImageId\)/u,
    );
    assert.match(
      pageSource,
      /botGroupRoomAtmosphereImageUrl[\s\S]*?botGroupRoomAtmosphereImageFileUrl/u,
    );
    assert.match(
      pageSource,
      /deleteGalleryImage[\s\S]*?setBotGroupFailedWallpaperImageIds[\s\S]*?next\.add\(img\.id\)/u,
    );
    assert.match(
      pageSource,
      /deleteAllGalleryImages[\s\S]*?deletedImageIds[\s\S]*?setBotGroupFailedWallpaperImageIds/u,
    );
  });

  it("reuses Zen display settings and keeps the room below compact and waiting content", () => {
    assert.match(
      pageSource,
      /--bot-group-room-atmosphere-opacity[\s\S]*?normalizeZenWallpaperOpacitySetting/u,
    );
    const groupAtmosphereStyleSource = pageSource.slice(
      pageSource.indexOf("const botGroupRoomAtmosphereStyle ="),
      pageSource.indexOf("const botGroupRoomAtmosphereBlurredEdges ="),
    );
    assert.doesNotMatch(
      groupAtmosphereStyleSource,
      /zenWallpaperGrayscaleEnabled|normalizeZenWallpaperGrayscaleSetting/u,
    );
    assert.match(
      pageSource,
      /botGroupRoomAtmosphereBlurredEdges[\s\S]*?normalizeZenWallpaperBlurredEdgesSetting/u,
    );
    assert.match(cssSource, /\.botGroupRoomAtmosphereBackdrop\s*\{/u);
    assert.match(cssSource, /\.botGroupRoomAtmosphereBackdrop[\s\S]*?z-index: 0/u);
    assert.match(cssSource, /\.botGroupHeroStage[\s\S]*?z-index: 2/u);
    assert.match(
      cssSource,
      /data-relationship-depth-transition="source-beat"\] \.messagesFrame/u,
    );
    assert.match(tutorialSource, /Shape a saved group's room/u);
    assert.match(tutorialSource, /chat-group-atmosphere/u);
  });
});
