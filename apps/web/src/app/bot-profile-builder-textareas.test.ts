import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(here, "page.tsx"), "utf8");
const cssSource = readFileSync(join(here, "page.module.css"), "utf8");

describe("bot profile builder textareas", () => {
  it("uses pick-aware durable fields with explicit snapshot resolution", () => {
    const builderStart = pageSource.indexOf("function BotProfileBuilder(");
    assert.ok(builderStart >= 0);
    const builderEnd = pageSource.indexOf(
      "type PrismViewTransitionDocument =",
      builderStart,
    );
    assert.ok(builderEnd > builderStart);
    const builderSource = pageSource.slice(builderStart, builderEnd);

    assert.match(builderSource, /renderPickAwareComposer/u);
    assert.match(builderSource, /durableSnapshot: true/u);
    assert.match(builderSource, /botProfilePickAwareField/u);
    assert.match(builderSource, /const renderProfileTextarea = /u);
    assert.match(builderSource, /<textarea/u);

    assert.match(pageSource, /Resolve & Save/u);
    assert.match(
      pageSource,
      /<BotProfileBuilder[\s\S]{0,900}renderPickAwareComposer=\{renderPickAwareComposer\}/u,
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
    assert.match(cssSource, /\.botProfilePickAwareField\s*\{/u);
    assert.match(
      cssSource,
      /\.botProfilePickAwareField \.composeTextareaVisualWrap textarea\s*\{[^}]*height:\s*86px/u,
    );
  });
});
