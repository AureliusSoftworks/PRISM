import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  autoFallbackAvailableForPrimary,
  autoFallbackModeSelectable,
  autoFallbackChainWithAddedEntry,
  autoFallbackChainWithEntry,
  autoFallbackChainWithMovedEntry,
  autoFallbackChainWithoutEntry,
  autoFallbackPrimaryForSelection,
  autoFallbackResponseModeForSend,
  autoFallbackSelectablePrimary,
  decodeAutoFallbackPickerValue,
  encodeAutoFallbackPickerValue,
} from "./autoFallbackSettings.ts";

const local = { provider: "local" as const, model: "qwen3:8b" };
const openai = { provider: "openai" as const, model: "gpt-5-mini" };
const anthropic = { provider: "anthropic" as const, model: "claude-haiku-4-5" };
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Auto fallback settings", () => {
  const catalog = {
    local: [{ id: "qwen3:8b" }],
    online: [
      { id: "gpt-4o-mini", provider: "openai" as const },
      { id: "gpt-5-mini", provider: "openai" as const },
      { id: "claude-haiku-4-5", provider: "anthropic" as const },
    ],
  };

  it("round-trips combined picker values", () => {
    assert.deepEqual(
      decodeAutoFallbackPickerValue(encodeAutoFallbackPickerValue(openai)),
      openai,
    );
  });

  it("renders separate ordered LOCAL and ONLINE fallback chains", () => {
    assert.match(pageSource, /fallbackRowsForLane/);
    assert.match(pageSource, /\["local", "online"\] as const/);
    assert.match(pageSource, /AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT/);
    assert.match(pageSource, /autoFallbackChainWithAddedEntry/);
    assert.match(pageSource, /autoFallbackChainWithoutEntry/);
    assert.match(pageSource, /autoFallbackChainWithMovedEntry/);
    assert.match(pageSource, /Drag to reorder/u);
    assert.match(pageSource, /event\.key === "ArrowUp"/u);
    assert.match(pageSource, /aria-live="polite"/u);
    assert.match(pageSource, /\+ Add \$\{laneLabel\} fallback/);
  });

  it("keeps Auto inside the selected lane and lets fixed models override it", () => {
    assert.match(
      pageSource,
      /modeAwareModelOptions\(\{[\s\S]{0,260}local: chatModelOptionsForProvider\(catalog, settings, "local"\)[\s\S]{0,320}online: onlineModelOptionsForPicker\(catalog, settings\)[\s\S]{0,80}responseMode/u,
    );
    assert.match(
      pageSource,
      /provider=\{isLocal \? "local" : "online"\}/u,
    );
    assert.match(pageSource, /applyModelChoiceForResponseMode\(\{/u);
    assert.match(pageSource, /Effort chosen automatically/u);
  });

  it("changes a later ONLINE fallback without treating it as a duplicate no-op", () => {
    const available = [openai, anthropic, { provider: "openai" as const, model: "gpt-5.6-terra" }];
    const chain = autoFallbackChainWithAddedEntry({
      chain: autoFallbackChainWithEntry({
        chain: null,
        index: 0,
        next: openai,
        available,
      }),
      available,
    });
    assert.deepEqual(chain?.fallbacks, [openai, anthropic]);
    assert.deepEqual(
      autoFallbackChainWithEntry({
        chain,
        index: 1,
        next: available[2]!,
        available,
      }),
      { v: 1, fallbacks: [openai, available[2]!] },
    );
  });

  it("builds, extends, and trims a customizable fallback chain", () => {
    const first = autoFallbackChainWithEntry({
      chain: null,
      index: 0,
      next: local,
      available: [local, openai, anthropic],
    });
    assert.deepEqual(first, { v: 1, fallbacks: [local] });
    const second = autoFallbackChainWithAddedEntry({
      chain: first,
      available: [local, openai, anthropic],
    });
    assert.deepEqual(second, { v: 1, fallbacks: [local, openai] });
    assert.deepEqual(
      autoFallbackChainWithoutEntry({ chain: second, index: 0 }),
      { v: 1, fallbacks: [openai] },
    );
  });

  it("reorders priority within a lane without moving the other lane", () => {
    const localSecond = { provider: "local" as const, model: "llama3.2" };
    const chain = {
      v: 1 as const,
      fallbacks: [local, openai, localSecond, anthropic],
    };
    assert.deepEqual(
      autoFallbackChainWithMovedEntry({
        chain,
        fromIndex: 2,
        toIndex: 0,
      }),
      {
        v: 1,
        fallbacks: [localSecond, openai, local, anthropic],
      },
    );
    assert.deepEqual(
      autoFallbackChainWithMovedEntry({
        chain,
        fromIndex: 3,
        toIndex: 1,
      }),
      {
        v: 1,
        fallbacks: [local, anthropic, localSecond, openai],
      },
    );
  });

  it("ignores cross-lane and invalid reorder attempts", () => {
    const chain = { v: 1 as const, fallbacks: [local, openai] };
    assert.deepEqual(
      autoFallbackChainWithMovedEntry({ chain, fromIndex: 0, toIndex: 1 }),
      chain,
    );
    assert.deepEqual(
      autoFallbackChainWithMovedEntry({ chain, fromIndex: -1, toIndex: 0 }),
      chain,
    );
  });

  it("rejects duplicate entries and caps the chain at five fallbacks", () => {
    const available = Array.from({ length: 6 }, (_, index) => ({
      provider: "openai" as const,
      model: `model-${index}`,
    }));
    let chain = autoFallbackChainWithEntry({
      chain: null,
      index: 0,
      next: available[0]!,
      available,
    });
    for (let index = 1; index < 6; index += 1) {
      chain = autoFallbackChainWithAddedEntry({ chain, available });
    }
    assert.equal(chain?.fallbacks.length, 5);
    assert.deepEqual(
      autoFallbackChainWithEntry({
        chain,
        index: 1,
        next: available[0]!,
        available,
      }),
      chain,
    );
  });

  it("ignores retired account defaults when resolving contextual Auto", () => {
    assert.deepEqual(
      autoFallbackPrimaryForSelection({
        provider: "openai",
        modelChoice: "auto",
        hiddenModelIds: [],
        catalog,
      }),
      anthropic,
    );
  });

  it("keeps an explicit surface model ahead of contextual Auto", () => {
    assert.deepEqual(
      autoFallbackPrimaryForSelection({
        provider: "openai",
        modelChoice: "gpt-4o-mini",
        hiddenModelIds: [],
        catalog,
      }),
      { provider: "openai", model: "gpt-4o-mini" },
    );
  });

  it("normalizes a legacy disabled text selection to Auto", () => {
    assert.deepEqual(
      autoFallbackPrimaryForSelection({
        provider: "local",
        modelChoice: "disabled",
        hiddenModelIds: [],
        catalog,
      }),
      local,
    );
  });

  it("requires the resolved primary chain to retain at least one runnable backup", () => {
    const chain = {
      v: 1 as const,
      fallbacks: [openai, anthropic] as [typeof openai, typeof anthropic],
    };
    assert.equal(
      autoFallbackAvailableForPrimary({
        primary: local,
        chain,
        runnable: [local, openai, anthropic],
      }),
      false,
    );
    assert.equal(
      autoFallbackAvailableForPrimary({
        primary: openai,
        chain,
        runnable: [local, openai, anthropic],
      }),
      true,
    );
    assert.equal(
      autoFallbackAvailableForPrimary({
        primary: openai,
        chain: { v: 1, fallbacks: [openai] },
        runnable: [openai],
      }),
      false,
    );
  });

  it("does not require a fallback chain in order to use contextual Auto", () => {
    assert.equal(
      autoFallbackModeSelectable({
        chain: { v: 1, fallbacks: [local] },
        runnable: [local, openai],
      }),
      false,
    );
    assert.deepEqual(
      autoFallbackSelectablePrimary({
        chain: { v: 1, fallbacks: [local] },
        runnable: [local, openai],
      }),
      null,
    );
    assert.equal(
      autoFallbackAvailableForPrimary({
        primary: local,
        chain: { v: 1, fallbacks: [local] },
        runnable: [local, openai],
      }),
      false,
    );
  });

  it("keeps AUTO unavailable until at least one configured fallback is runnable", () => {
    assert.equal(
      autoFallbackModeSelectable({ chain: null, runnable: [local, openai] }),
      false,
    );
    assert.equal(
      autoFallbackModeSelectable({
        chain: { v: 1, fallbacks: [anthropic] },
        runnable: [local, openai],
      }),
      false,
    );
  });

  it("sends the binary privacy lane independently of contextual Auto", () => {
    const chain = {
      v: 1 as const,
      fallbacks: [openai, anthropic] as [typeof openai, typeof anthropic],
    };
    const runnable = [local, openai, anthropic];

    assert.equal(
      autoFallbackResponseModeForSend({
        autoEnabled: true,
        primary: local,
        chain,
        runnable,
      }),
      "local",
    );
    assert.equal(
      autoFallbackResponseModeForSend({
        autoEnabled: true,
        primary: openai,
        chain,
        runnable,
      }),
      "online",
    );
  });
});
