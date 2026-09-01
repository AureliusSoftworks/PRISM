import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  PRISM_LIGHT_MODE_OPEN_EXCEPTIONS,
  PRISM_LIGHT_MODE_PHASE_FOUR_INTERACTION_STATES,
  PRISM_LIGHT_MODE_PHASE_FOUR_SURFACE_FAMILIES,
  PRISM_LIGHT_MODE_STATE_FAMILIES,
} from "./lightModeSurfaceInventory.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const page = read("./page.tsx");
const sharedCss = read("./page.module.css");
const layout = read("./layout.tsx");
const slate = read("./SlateWorkspace.tsx");
const slateCss = read("./slateWorkspace.module.css");
const slateCreativeCss = read("./slateCreativeStudiosDesk.module.css");
const slateBibleCss = read("./slateStoryBibleDesk.module.css");
const assetLibrary = read("./AssetLibrary.tsx");
const assetCss = read("./AssetLibrary.module.css");
const audioCss = read("./AudioLibrary.module.css");
const memoryCss = read("./MemorySettings.module.css");
const storageCss = read("./StorageSettings.module.css");
const eula = read("./EulaAgreement.tsx");
const eulaCss = read("./eula-agreement.module.css");
const publicPrism = read("./prism/page.tsx");
const publicPrismCss = read("./prism/page.module.css");

describe("creator, library, administration, legal, and utility Light parity", () => {
  it("keeps the PRISM-biijf.4 matrix exhaustive", () => {
    assert.equal(
      PRISM_LIGHT_MODE_OPEN_EXCEPTIONS.some(
        (exception) => String(exception.followup) === "PRISM-biijf.4",
      ),
      false,
    );
    for (const family of PRISM_LIGHT_MODE_PHASE_FOUR_SURFACE_FAMILIES) {
      assert.deepEqual(Object.keys(family.states), [
        ...PRISM_LIGHT_MODE_STATE_FAMILIES,
      ]);
      assert.deepEqual(Object.keys(family.interactions), [
        ...PRISM_LIGHT_MODE_PHASE_FOUR_INTERACTION_STATES,
      ]);
    }
  });

  it("propagates the saved or system theme before legal and public routes paint", () => {
    assert.ok(
      layout.indexOf('id="prism-document-theme-bootstrap"') <
        layout.indexOf("<PrismMenuProvider>"),
    );
    assert.match(publicPrism, /data-prism-public-handoff="true"/u);
    assert.match(publicPrism, /data-prism-document-theme-surface="true"/u);
    assert.match(
      publicPrismCss,
      /:global\(body\[data-prism-theme="light"\]\) \.pageShell/u,
    );
    assert.match(publicPrismCss, /--public-page-background:/u);
    assert.match(publicPrismCss, /color-scheme:\s*light/u);
    assert.match(publicPrismCss, /\.primaryAction:focus-visible/u);
    assert.match(publicPrismCss, /\.secondaryAction:active/u);

    assert.match(eula, /data-prism-legal-surface="eula"/u);
    assert.match(eula, /data-prism-document-theme-surface="true"/u);
    assert.match(
      eulaCss,
      /:global\(body\[data-prism-theme="light"\]\) \.standalonePage/u,
    );
    assert.match(eulaCss, /--legal-page-background:/u);
    assert.match(eulaCss, /var\(--prism-document-modal-backdrop/u);
    assert.match(eulaCss, /\.primaryButton:disabled/u);
    assert.match(eulaCss, /\.standaloneActions button:hover/u);
    assert.match(eulaCss, /@media print/u);
  });

  it("themes every Slate lifecycle from one root while isolating paper semantics", () => {
    assert.equal(slate.match(/data-theme=\{theme\}/gu)?.length, 2);
    assert.match(
      slateCss,
      /\.shell\[data-theme="light"\]\s*\{[\s\S]*color-scheme:\s*light;/u,
    );
    assert.match(slateCss, /--slate-paper-surface:/u);
    assert.match(slateCss, /:where\(button, a\[href\], input, textarea, select, summary, \[tabindex\]\):focus-visible/u);
    assert.match(
      slateCss,
      /:where\(button, input, textarea, select\):disabled/u,
    );
    assert.match(slateCss, /\.loading\s*\{/u);
    assert.match(slateCss, /\.error\s*\{/u);
    assert.match(slateCss, /\.returnBackdrop\s*\{/u);
    assert.match(slateCss, /\.emptyInspector\s*\{/u);
    assert.match(slateCss, /\.cockpitDrawerBackdrop\s*\{/u);
    assert.match(slateCss, /@media \(max-width:/u);

    for (const css of [slateCreativeCss, slateBibleCss]) {
      assert.match(css, /--surface:\s*var\(--slate-paper-surface/u);
      assert.match(css, /--text:\s*var\(--slate-paper-ink/u);
      assert.match(css, /:focus-visible/u);
      assert.match(css, /:disabled/u);
    }

    for (const path of [
      "./slateDirectionQuestion.module.css",
      "./slateDirectorBar.module.css",
      "./slateFullBookReader.module.css",
      "./slateManuscriptCanvas.module.css",
      "./slateMirrorDesk.module.css",
      "./slateStoryMap.module.css",
    ]) {
      const css = read(path);
      assert.match(css, /var\(--(?:fg|bg|line|slate-)/u, `${path} must use Slate tokens`);
      assert.doesNotMatch(css, /data-theme="dark"/u);
    }
  });

  it("authors image, asset, audio, and storage interaction states in Light", () => {
    assert.match(assetLibrary, /data-theme=\{theme\}/u);
    assert.match(
      assetCss,
      /\.modalBackdrop\[data-theme="light"\]\s*\{[\s\S]*--bg:\s*#edf5fc;[\s\S]*color-scheme:\s*light;/u,
    );
    assert.match(assetCss, /\.modalBackdrop :is\([^)]+\):focus-visible/u);
    assert.match(assetCss, /\.modalBackdrop :is\([^)]+\):disabled/u);
    assert.match(assetCss, /\.assetCard\[data-selected="true"\]/u);
    assert.match(assetCss, /\.assetCard\[data-active="true"\]/u);
    assert.match(assetCss, /\.cleanupConfirmation/u);

    assert.match(audioCss, /var\(--prism-document-modal-backdrop-strong/u);
    assert.match(audioCss, /color-scheme:\s*var\(--prism-document-color-scheme/u);
    assert.match(audioCss, /\.modal :is\([^)]+\):focus-visible/u);
    assert.match(audioCss, /\.modal :is\([^)]+\):disabled/u);
    assert.match(audioCss, /\.clipRow\[data-active="true"\]/u);
    assert.match(audioCss, /\.error\s*\{/u);

    assert.match(memoryCss, /\.state\[data-state="error"\]/u);
    assert.match(memoryCss, /\.confirmBackdrop\s*\{/u);
    assert.match(memoryCss, /\.confirmActions button:focus-visible/u);
    assert.match(storageCss, /\.spaceLensRow\[data-active="true"\]/u);
    assert.match(storageCss, /\.spaceLensRow:focus-visible/u);
    assert.match(storageCss, /\.actionTidy:disabled/u);
  });

  it("keeps Avatar Studio, bot/library/history, settings, and placeholders on shared theme semantics", () => {
    assert.match(page, /data-avatar-studio-theme=\{resolvedTheme\}/u);
    assert.match(page, /themeMode=\{effectiveThemeMode\}/u);
    assert.match(
      sharedCss,
      /\/\* Avatar Studio Light Mode[\s\S]*button\[data-active="true"\][\s\S]*:focus-visible[\s\S]*:disabled/u,
    );
    assert.match(sharedCss, /\.themeLight \.conversationDelete/u);
    assert.match(sharedCss, /\.conversationDelete:focus-visible/u);
    assert.match(sharedCss, /\.settingsNavItem\[data-active="true"\]/u);
    assert.match(sharedCss, /\.settingsHubCard:hover:not\(:disabled\)/u);
    assert.match(sharedCss, /\.settingsHubCard:disabled/u);
    assert.match(sharedCss, /\.imageGrid/u);
    assert.match(sharedCss, /\.imageThumbWrap/u);
    assert.match(sharedCss, /\.botLibraryGroupTrigger/u);
    assert.match(sharedCss, /\.botLibraryGroupCreate:focus-visible/u);
    assert.match(page, /prismPlannedRoadmapApplets\(\)/u);
    assert.match(page, /description:\s*"Planned for future PRISM releases\."/u);
  });
});
