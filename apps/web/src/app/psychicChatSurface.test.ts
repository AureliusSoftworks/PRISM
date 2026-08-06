import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const pagePath = join(dirname(fileURLToPath(import.meta.url)), "page.tsx");
const pageSource = readFileSync(pagePath, "utf8");
const serverPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../api/src/server.ts"
);
const serverSource = readFileSync(serverPath, "utf8");

describe("Psychic Chat surface wiring", () => {
  it("requests live Psychic progress on both Zen and Chat surfaces", () => {
    assert.match(
      pageSource,
      /psychicModeEnabled:\s*isZenSurfaceView\(view\) \|\| isChatSurfaceView\(view\)/,
    );
  });

  it("shows settled Psychic only in transcript Chat, never immersive Zen", () => {
    assert.match(
      pageSource,
      /function isPsychicPresentationSurfaceView\(\s*view: View,\s*presentation: ChatPresentation \| null,\s*\): boolean \{\s*if \(isChatSurfaceView\(view\)\) return true;\s*return isZenSurfaceView\(view\) && presentation === "chat";\s*\}/u,
    );
  });

  it("renders settled Psychic only as a collapsed assistant disclosure on Psychic surfaces", () => {
    const renderSource = pageSource.match(
      /function renderAssistantPsychicDisclosure[\s\S]*?\n  }/,
    )?.[0];

    assert.ok(renderSource);
    assert.match(
      renderSource,
      /!isPsychicPresentationSurfaceView\(view, chatPresentation\)\s*\|\|\s*msg\.role !== "assistant"/u,
    );
    assert.match(renderSource, /expandedPsychicAssistantMessageId === msg\.id/u);
    assert.match(renderSource, /data-expanded=\{expanded/u);
    assert.match(renderSource, /Click the message to expand/u);
    assert.match(renderSource, /psychicLine\.meta/u);
    assert.match(renderSource, /psychicLine\.passes/u);
    assert.match(renderSource, /data-psychic-pass=\{pass\.stage\}/u);
    assert.doesNotMatch(pageSource, /renderPsychicThoughtLine/u);
  });

  it("targets delayed live Psychic progress on both approved surfaces", () => {
    const thinkingTargetSource = pageSource.match(
      /const psychicThinkingTargetMessageId = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[/,
    )?.[0];

    assert.ok(thinkingTargetSource);
    assert.match(
      thinkingTargetSource,
      /!isZenSurfaceView\(view\) && !isChatSurfaceView\(view\)/,
    );
    assert.match(
      thinkingTargetSource,
      /if \(!psychicThinkingDelayElapsed\) return null;/,
    );
  });

  it("keeps live Psychic provenance out of the immersive pending chip", () => {
    assert.match(pageSource, /psychicProgressStream:\s*true/u);
    assert.match(pageSource, /onPsychic:\s*applyLivePsychicProgress/u);
    assert.match(pageSource, /const thinkingCaption = immersiveThinkingCaption/u);
    assert.doesNotMatch(pageSource, /data-psychic-live=\{livePsychicSummary/u);
    assert.doesNotMatch(pageSource, /livePsychicVisiblePasses\.map/u);
    assert.doesNotMatch(pageSource, /Psychic · \{livePsychicStageLabel\}/u);
    assert.match(
      serverSource,
      /psychicModeRequested && body\.psychicProgressStream === true/u,
    );
    assert.match(
      serverSource,
      /onPsychicProgress:[\s\S]{0,180}type: "psychic"/u,
    );
  });

  it("uses one short persona activity caption in Zen's loading chip", () => {
    const zenSource = pageSource.match(
      /const zenInitialThinkingNode = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[/,
    )?.[0];

    assert.ok(zenSource);
    assert.match(zenSource, /zenInitialThinkingButton/u);
    assert.match(zenSource, /immersiveThinkingCaption/u);
    assert.match(
      zenSource,
      /<span className=\{styles\.zenInitialThinkingLabel\}>\{label\}<\/span>/u,
    );
    assert.doesNotMatch(zenSource, /livePsychicSummary/u);
    assert.doesNotMatch(zenSource, /Psychic/u);
  });

  it("reveals model and effort glyph metadata only in transcript Chat while focused", () => {
    const metadataSource = pageSource.match(
      /function renderMessageGenerationMetadata[\s\S]*?\n  }/,
    )?.[0];

    assert.ok(metadataSource);
    assert.match(
      metadataSource,
      /!isPsychicPresentationSurfaceView\(view, chatPresentation\)/u,
    );
    assert.match(metadataSource, /contextFocusedMessageId !== msg\.id/u);
    assert.match(metadataSource, /assistantGenerationMetadata/u);
    assert.match(metadataSource, /<ModelEffortIcon/u);
    assert.match(metadataSource, /REASONING_EFFORT_LABELS\[metadata\.effort\]/u);
  });

  it("resolves Psychic source messages only on transcript Chat presentation", () => {
    assert.match(
      pageSource,
      /const psychicSourceMessage = isPsychicPresentationSurfaceView\(\s*view,\s*chatPresentation,\s*\)\s*\?\s*psychicSourceForAssistantMessage/u,
    );
    assert.doesNotMatch(
      pageSource,
      /const psychicSourceMessage = isChatSurfaceView\(view\)/u,
    );
  });
});
