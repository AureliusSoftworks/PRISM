import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(root, "page.tsx"), "utf8");
const cssSource = readFileSync(join(root, "page.module.css"), "utf8");
const tutorialsSource = readFileSync(join(root, "modeTutorials.ts"), "utf8");

describe("composer Prism field refract", () => {
  it("registers the Zen/Chat composer as a Prism field refract target", () => {
    assert.match(pageSource, /CHAT_COMPOSER_REFRACT_ID = "chat-composer-prompt"/u);
    assert.match(
      pageSource,
      /function renderChatComposerWithPrismRefract\([\s\S]*?kind: "field"/u,
    );
    assert.match(
      pageSource,
      /generate: generateComposerRefractPrompt/u,
    );
    assert.match(
      pageSource,
      /\/api\/composer\/random-prompt/u,
    );
  });

  it("sunsets the empty-composer dice submit shortcut", () => {
    assert.doesNotMatch(pageSource, /composerSubmitUsesRandomNudge/u);
    assert.doesNotMatch(pageSource, /sendRandomConversationNudge/u);
    assert.doesNotMatch(
      pageSource,
      /Send random suggested prompt/u,
    );
    assert.doesNotMatch(
      pageSource,
      /composerSubmitUsesRandomNudge\(value\)[\s\S]{0,80}BotGlyph name="dice"/u,
    );
  });

  it("styles composer refract host states", () => {
    assert.match(cssSource, /\.chatComposerRefractHost\b/u);
    assert.match(
      cssSource,
      /\.chatComposerRefractHost\[data-prism-refract-state="generating"\]/u,
    );
    assert.match(
      cssSource,
      /\.chatComposerRefractHost\[data-prism-refract-state="ready"\]/u,
    );
  });

  it("teaches Wield Prism on the composer instead of dice", () => {
    assert.match(
      tutorialsSource,
      /Wield Prism onto the message box/u,
    );
    assert.match(
      tutorialsSource,
      /no separate dice control/u,
    );
  });
});
