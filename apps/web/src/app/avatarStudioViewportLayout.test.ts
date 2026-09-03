import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AVATAR_STUDIO_VIEWPORT_LAYOUT,
  avatarStudioViewportMetrics,
} from "./avatarStudioViewportLayout.ts";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(appDir, "page.tsx"), "utf8").replace(
  /\s+/gu,
  " ",
);
const cssSource = readFileSync(resolve(appDir, "page.module.css"), "utf8");

function cssRuleBody(selector: string, bodyPattern?: RegExp): string {
  const escaped = selector
    .trim()
    .split(/\s+/gu)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("\\s+");
  const matches = cssSource.matchAll(
    new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, "g"),
  );
  for (const match of matches) {
    const body = (match[1] ?? "").replace(/\s+/gu, " ").trim();
    if (!bodyPattern || bodyPattern.test(body)) return body;
  }
  assert.fail(`Expected CSS rule for ${selector}`);
}

test("Avatar Studio desktop height model keeps its scrollport and bottom regions inside the viewport", () => {
  // 1117 CSS px is the supplied 2234 px-tall screenshot at 2x scale. The
  // desktop app's supported floor is 900 px; both must retain the same edge.
  for (const viewportHeight of [1117, 900]) {
    const layout = avatarStudioViewportMetrics({
      viewportHeight,
      appNavbarHeight: 60,
      studioHeaderHeight: 72,
    });

    assert.equal(layout.workspaceHeight, viewportHeight - 60);
    assert.equal(
      layout.inspectorBottomClearance,
      AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationBottomPx +
        AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationHeightPx +
        AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationGapPx,
    );
    assert.equal(
      layout.navigationViewportTop - layout.inspectorViewportBottom,
      AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationGapPx,
    );
    assert.equal(
      layout.inspectorViewportBottom - layout.voicePreviewViewportBottom,
      AVATAR_STUDIO_VIEWPORT_LAYOUT.voiceGapPx,
    );
    assert.ok(layout.inspectorHeight > 0, "scrollport has a definite height");
    assert.ok(layout.inspectorViewportBottom < viewportHeight);
    assert.ok(layout.navigationViewportBottom < viewportHeight);
    assert.ok(layout.voicePreviewViewportBottom < viewportHeight);
  }
});

test("Avatar Studio DOM and CSS give one owner to viewport height and reserve navigation from the inspector", () => {
  const backdrop = cssRuleBody(
    '.botAvatarCustomizerBackdrop[data-avatar-foundry="true"]',
  );
  const modal = cssRuleBody(
    '.botProfileBuilder.botAvatarCustomizer[data-foundry="true"]',
  );
  const body = cssRuleBody(
    '.botAvatarCustomizer[data-foundry="true"] .botAvatarCustomizerBody',
  );
  const navigation = cssRuleBody(
    '.botAvatarCustomizer[data-foundry="true"] .botAvatarControlTabs',
  );
  const inspector = cssRuleBody(
    '.botAvatarCustomizer[data-foundry="true"] .botAvatarControlStack',
  );
  const voicePreview = cssRuleBody(".botAvatarVoiceTestDock");
  const lightFoundryBackdrop = cssRuleBody(
    '.themeLight.botAvatarStudioThemeScope .botAvatarCustomizerBackdrop[data-avatar-foundry="true"]',
  );

  assert.match(
    backdrop,
    /inset:\s*var\(--app-shell-top-nav-height, var\(--app-navbar-height, 66px\)\) 0 0;/,
  );
  assert.match(modal, /position:\s*absolute;/u);
  assert.match(modal, /inset:\s*0;/u);
  assert.match(modal, /height:\s*100%;/u);
  assert.doesNotMatch(modal, /app-shell-top-nav-height/u);
  assert.match(modal, /grid-template-rows:\s*auto minmax\(0, 1fr\);/u);
  assert.match(body, /height:\s*100%;/u);
  assert.match(body, /min-height:\s*0;/u);
  assert.match(body, /overflow:\s*hidden;/u);

  assert.match(
    navigation,
    /bottom:\s*var\(--avatar-foundry-navigation-bottom, 22px\);/u,
  );
  assert.match(
    navigation,
    /min-height:\s*var\(--avatar-foundry-navigation-height, 44px\);/u,
  );
  assert.match(
    inspector,
    /bottom:\s*calc\([\s\S]*--avatar-foundry-navigation-bottom[\s\S]*--avatar-foundry-navigation-height[\s\S]*--avatar-foundry-navigation-gap[\s\S]*\);/u,
  );
  assert.match(inspector, /height:\s*auto;/u);
  assert.match(inspector, /max-height:\s*none;/u);
  assert.match(inspector, /overflow:\s*auto;/u);
  assert.match(inspector, /scrollbar-gutter:\s*stable;/u);
  assert.match(
    voicePreview,
    /bottom:\s*calc\([\s\S]*--avatar-foundry-navigation-bottom[\s\S]*--avatar-foundry-navigation-height[\s\S]*--avatar-foundry-navigation-gap[\s\S]*--avatar-foundry-voice-gap[\s\S]*\);/u,
  );
  assert.match(lightFoundryBackdrop, /backdrop-filter:\s*none;/u);
  assert.match(lightFoundryBackdrop, /-webkit-backdrop-filter:\s*none;/u);

  assert.match(pageSource, /data-avatar-foundry-height-owner="true"/u);
  assert.match(
    pageSource,
    /data-avatar-foundry-region="voice-preview"[\s\S]*data-avatar-foundry-region="navigation"[\s\S]*data-avatar-foundry-region="inspector-scrollport"/u,
  );
  assert.match(pageSource, /\.\.\.AVATAR_STUDIO_VIEWPORT_CSS_PROPERTIES/u);
  assert.doesNotMatch(backdrop, /overflow-y:\s*auto/u);
});

test("Avatar Studio navigation height matches its rendered button box", () => {
  const navigation = cssRuleBody(".botAvatarControlTabs", /padding:\s*4px/u);
  const button = cssRuleBody(
    ".botAvatarControlTabs button, .form .botAvatarControlTabs button",
  );
  const minButtonHeight = Number(button.match(/min-height:\s*(\d+)px/u)?.[1]);
  const navigationPadding = Number(navigation.match(/padding:\s*(\d+)px/u)?.[1]);
  const navigationBorder = Number(
    navigation.match(/border:\s*(\d+)px\s+solid/u)?.[1],
  );

  assert.equal(
    minButtonHeight + navigationPadding * 2 + navigationBorder * 2,
    AVATAR_STUDIO_VIEWPORT_LAYOUT.navigationHeightPx,
  );
});
