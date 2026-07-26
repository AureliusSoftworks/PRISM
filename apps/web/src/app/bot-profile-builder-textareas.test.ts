import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(here, "page.tsx"), "utf8");
const cssSource = readFileSync(join(here, "page.module.css"), "utf8");

describe("bot profile builder textareas", () => {
  it("keeps Bot Profile Builder on plain textareas without composer wildcards", () => {
    const builderStart = pageSource.indexOf("function BotProfileBuilder(");
    assert.ok(builderStart >= 0);
    const builderEnd = pageSource.indexOf(
      "type PrismViewTransitionDocument =",
      builderStart,
    );
    assert.ok(builderEnd > builderStart);
    const builderSource = pageSource.slice(builderStart, builderEnd);

    assert.doesNotMatch(builderSource, /renderPickAwareComposer/u);
    assert.doesNotMatch(builderSource, /expandComposerDraft/u);
    assert.doesNotMatch(builderSource, /expandBotProfileComposerFields/u);
    assert.doesNotMatch(builderSource, /botProfilePickAwareField/u);
    assert.match(builderSource, /const renderProfileTextarea = /u);
    assert.match(builderSource, /<textarea/u);

    assert.doesNotMatch(pageSource, /function expandBotProfileComposerFields\(/u);
    assert.doesNotMatch(
      pageSource,
      /<BotProfileBuilder[\s\S]{0,800}renderPickAwareComposer=/u,
    );
  });

  it("keeps profile textareas a fixed non-resizable size", () => {
    assert.match(
      cssSource,
      /\.botProfileField textarea\s*\{[^}]*resize:\s*none/u,
    );
    assert.match(
      cssSource,
      /\.botProfileField textarea\s*\{[^}]*height:\s*86px/u,
    );
    assert.match(
      cssSource,
      /\.botProfileField textarea\s*\{[^}]*max-height:\s*86px/u,
    );
    assert.doesNotMatch(cssSource, /\.botProfilePickAwareField\s*\{/u);
  });
});
