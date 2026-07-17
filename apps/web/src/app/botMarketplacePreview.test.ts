import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("bot marketplace previews", () => {
  it("loads an uninstalled bot bundle into a read-only showcase identity", () => {
    assert.match(
      pageSource,
      /function marketplacePreviewBotFromArchive\([\s\S]*?prepareBotArchivePayload\(parsed\)/,
    );
    assert.match(
      pageSource,
      /prepared\.importedBotHash !== entry\.botHash/,
    );
    assert.match(
      pageSource,
      /id: `marketplace-preview:\$\{entry\.id\}:\$\{entry\.botHash\}`/,
    );
    assert.match(pageSource, /avatarDetails: body\.avatarDetails/);
    assert.match(
      pageSource,
      /authored_audio_voice_profile:[\s\S]*?body\.authoredAudioVoiceProfile/,
    );
    assert.match(
      pageSource,
      /fetchMarketplaceBotBundle\(entry, controller\.signal\)[\s\S]*?parsePrismBotArchive\(bytes\)/,
    );
  });

  it("waits for explicit selection before reusing an installed bot", () => {
    assert.doesNotMatch(pageSource, /botMarketplaceSelectedEntries\[0\]/);
    assert.match(
      pageSource,
      /setBotMarketplaceSelectedBotEntryId\(\(current\) =>[\s\S]*?\? current[\s\S]*?: null/,
    );
    assert.match(
      pageSource,
      /function openBotMarketplace\(\): void \{[\s\S]*?setBotMarketplaceSelectedBotEntryId\(null\)/,
    );
    assert.match(
      pageSource,
      /setBotMarketplaceSelectedThemeId\(theme\.id\);[\s\S]*?setBotMarketplaceSelectedBotEntryId\(null\)/,
    );
    assert.match(
      pageSource,
      /botMarketplaceInstalledBotIdByHash\.get\([\s\S]*?setBotMarketplacePreviewBot\(installedBot\)/,
    );
    assert.match(
      pageSource,
      /botPanelView === "marketplace"[\s\S]*?return botMarketplacePreviewBot/,
    );
  });

  it("selects the card before showing its actions or preview", () => {
    assert.match(pageSource, /data-marketplace-bot-card="true"/);
    assert.match(pageSource, /styles\.botMarketplaceCardSelectButton/);
    assert.match(pageSource, /data-preview-selected=/);
    assert.match(pageSource, /aria-pressed=\{previewSelected\}/);
    assert.match(
      pageSource,
      /current === entry\.id \? null : entry\.id/,
    );
    assert.match(
      pageSource,
      /\{previewSelected \? \([\s\S]*?styles\.botMarketplaceCardActions/,
    );
    assert.match(
      pageSource,
      /!botMarketplaceSelectedBotEntry[\s\S]*?setBotMarketplacePreviewBot\(null\)/,
    );
    assert.match(
      cssSource,
      /\.botMarketplaceCard\[data-preview-selected="true"\]/,
    );
  });

  it("hides the underlying Prism bot for the entire Marketplace view", () => {
    assert.match(
      pageSource,
      /const botMarketplaceCanvasBotSuppressed =\s*panel === "bots" && botPanelView === "marketplace"/,
    );
    assert.match(
      pageSource,
      /const zenCanvasBotSuppressedForPanel =\s*botPanelShowcaseIsDefaultPrism \|\|\s*botMarketplaceCanvasBotSuppressed/,
    );
  });

  it("gates installed-bot management behind selection and confirms uninstall", () => {
    assert.match(
      pageSource,
      /\{installedBot \? \([\s\S]*?updateMarketplaceBot\(entry\)[\s\S]*?openBotCustomizer\(installedBot\)[\s\S]*?marketplaceUninstall: true/,
    );
    assert.match(pageSource, />Uninstall<\/span>/);
    assert.match(
      pageSource,
      /keepBotPanelOpen: marketplaceUninstall/,
    );
    assert.match(
      pageSource,
      /panelRef\.current === "bots" && !options\?\.keepBotPanelOpen/,
    );
  });

  it("plays all three authored samples without mutating Marketplace bots", () => {
    const showcaseSource = pageSource.slice(
      pageSource.indexOf("const renderBotHubShowcase"),
      pageSource.indexOf("const renderSharedPanels"),
    );
    assert.match(
      showcaseSource,
      /isMarketplacePreview[\s\S]*?playBotHubVoicePreview\(bot, "english"\)[\s\S]*?regenerateBotHubAudioSample\(bot\)/,
    );
    assert.match(showcaseSource, /playBotHubVoicePreview\(bot, "babble"\)/);
    assert.match(showcaseSource, /playBotHubVoicePreview\(bot, "bottish"\)/);
    assert.match(
      showcaseSource,
      /if \(isMarketplacePreview \|\| !bot\) return;/,
    );
  });

  it("reserves desktop space for the full mannequin preview", () => {
    assert.match(
      cssSource,
      /\.panelBots\[data-bot-panel-view="marketplace"\][\s\S]*?calc\(100vw - 440px\)/,
    );
    assert.match(
      cssSource,
      /\.botPanelHubShowcase\[data-panel="bots"\]\[data-bot-view="marketplace"\]/,
    );
    assert.match(pageSource, /"min\(420px, 32vw, 62vmin\)"/);
  });
});
