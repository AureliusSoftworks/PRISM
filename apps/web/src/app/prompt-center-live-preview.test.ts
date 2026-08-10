import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

describe("Prompt Studio live preview", () => {
  it("uses the wide three-stage workspace and restores the last selection", () => {
    assert.match(
      cssSource,
      /\.panelPromptCenter\s*\{[\s\S]{0,180}--panel-width: min\(1240px, calc\(100vw - 32px\)\)/u,
    );
    assert.match(
      pageSource,
      /className=\{styles\.promptCenterPreviewPane\}[\s\S]{0,120}renderCommandCenterPreview/u,
    );
    assert.match(pageSource, /commandCenterSelectionStorageKey/u);
    assert.match(pageSource, /previewPromptRuntimeName/u);
    assert.match(pageSource, /Untitled prompt/u);
  });

  it("previews built-in wildcard samples on fresh hover and rerolls stable recipe paths", () => {
    assert.match(
      pageSource,
      /promptCenterWildcardDockItemCount\s*=\s*BUILT_IN_WILDCARD_SLOT_PICKS\.length/u,
    );
    assert.match(
      pageSource,
      /styles\.promptCenterPromptWildcardGrid[\s\S]{0,220}BUILT_IN_WILDCARD_SLOT_PICKS\.map/u,
    );
    assert.match(
      cssSource,
      /\.promptCenterPromptWildcardGrid\s*\{[\s\S]{0,220}max-height:\s*min\(268px, 36vh\)/u,
    );
    assert.match(pageSource, /function PromptCenterWildcardHoverButton/u);
    assert.match(pageSource, /onPointerEnter=\{\(event\) => \{/u);
    assert.match(pageSource, /onPointerLeave=\{\(event\) => \{/u);
    assert.match(pageSource, /setPreview\(\{ status: "loading" \}\)/u);
    assert.match(pageSource, /requestGenerationRef\.current \+= 1/u);
    assert.match(pageSource, /aria-live="polite"/u);
    assert.match(pageSource, /\? preview\.value/u);
    assert.doesNotMatch(pageSource, /resolves to \$\{preview\.value\}/u);
    assert.match(
      cssSource,
      /\.promptCenterPromptWildcardTooltip\s*\{[\s\S]{0,320}background:\s*var\(--bg-surface\)/u,
    );
    assert.doesNotMatch(pageSource, /PromptCenterWildcardSampleChip/u);
    assert.doesNotMatch(
      cssSource,
      /\.promptCenterPromptWildcardPreviewButton/u,
    );
    assert.match(pageSource, /function PromptCenterWildcardAutoResolver/u);
    assert.match(
      pageSource,
      /rerollCommandCenterPreviewOccurrence\(trace\.path\)/u,
    );
    assert.match(
      pageSource,
      /aria-label=\{`Reroll \$\{trace\.invocation\}; current value/u,
    );
    assert.doesNotMatch(
      pageSource.slice(
        pageSource.indexOf("const renderCommandCenterPreview"),
        pageSource.indexOf("const promptCenterDropPlacementFromDragEvent"),
      ),
      />\s*Roll again\s*</u,
    );
    assert.match(
      cssSource,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,120}\.promptCenterPreviewCard/u,
    );
  });

  it("allows full multiplex authoring while rejecting imported cycles", () => {
    assert.match(pageSource, /promptPicks=\{commandCenterPromptPicks\}/u);
    assert.match(pageSource, /Insert a nested expression/u);
    assert.match(pageSource, /That Command Center bundle contains a cycle:/u);
    assert.match(pageSource, /data-cycle=\{promptHasCycle/u);
    assert.match(pageSource, /data-cycle=\{deckHasCycle/u);
  });

  it("stores and displays the same final prompt sent to chat", () => {
    assert.match(serverSource, /\/api\/composer\/wildcards\/scripted/u);
    assert.match(
      serverSource,
      /withPromptShortcutResolvedPrompt\([\s\S]{0,320}messageForChat/u,
    );
    assert.match(
      serverSource,
      /refreshPromptShortcutRunsFromResolvedPrompt\([\s\S]{0,180}messageForChat/u,
    );
    assert.match(
      serverSource,
      /messageForChat !== message[\s\S]{0,100}promptInputOverride: messageForChat/u,
    );
  });
});
