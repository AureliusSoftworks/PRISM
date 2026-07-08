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

  it("renders Psychic lines from the active product Chat surface", () => {
    assert.match(
      pageSource,
      /psychicTextEnabledForConversation\(detail,\s*\{\s*productChatSurface:\s*view === "chat",?\s*\}\)/
    );
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
