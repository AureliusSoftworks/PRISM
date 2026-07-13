import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const pagePath = join(dirname(fileURLToPath(import.meta.url)), "page.tsx");
const pageSource = readFileSync(pagePath, "utf8");

describe("Psychic Chat surface wiring", () => {
  it("requests Psychic on the product Chat surface even though it uses the Zen pipeline", () => {
    assert.match(
      pageSource,
      /psychicModeEnabled:\s*mode === "chat" \|\| view === "chat"/
    );
  });

  it("does not render visible Psychic lines from the Zen surface", () => {
    const renderSource = pageSource.match(
      /function renderPsychicThoughtLine[\s\S]*?\n  }/
    )?.[0];

    assert.ok(renderSource);
    assert.match(renderSource, /if \(isZenSurfaceView\(view\)\) \{\s*return null;\s*\}/);
    assert.match(
      renderSource,
      /psychicTextEnabledForConversation\(detail,\s*\{\s*productChatSurface:\s*view === "chat",?\s*\}\)/
    );
  });

  it("does not show the delayed Psychic thinking indicator on the Zen surface", () => {
    const thinkingTargetSource = pageSource.match(
      /const psychicThinkingTargetMessageId = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[/
    )?.[0];

    assert.ok(thinkingTargetSource);
    assert.match(thinkingTargetSource, /if \(isZenSurfaceView\(view\)\) return null;/);
  });

  it("does not render Psychic lines from Zen conversation mode alone", () => {
    const gateSource = pageSource.match(
      /function psychicTextEnabledForConversation[\s\S]*?\n}/
    )?.[0];

    assert.ok(gateSource);
    assert.match(gateSource, /return options\.productChatSurface === true;/);
    assert.doesNotMatch(gateSource, /conversation\?\.mode === "chat"/);
  });
});
