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
const pageCss = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

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

  it("renders separate ordered LOCAL and ONLINE Auto priorities", () => {
    assert.match(pageSource, /fallbackRowsForLane/);
    assert.match(pageSource, /\["local", "online"\] as const/);
    assert.match(pageSource, /AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT/);
    assert.match(pageSource, /autoFallbackChainWithAddedEntry/);
    assert.match(pageSource, /autoFallbackChainWithoutEntry/);
    assert.match(pageSource, /autoFallbackChainWithMovedEntry/);
    assert.match(pageSource, /Drag chip to reorder/u);
    assert.match(pageSource, /onPointerDown=/u);
    assert.match(pageSource, /setPointerCapture\(event\.pointerId\)/u);
    assert.match(pageSource, /onPointerMove=/u);
    assert.match(pageSource, /autoFallbackDragTargetAtPoint/u);
    assert.match(pageSource, /onPointerUp=/u);
    assert.match(pageSource, /onPointerCancel=/u);
    assert.match(pageSource, /onLostPointerCapture=/u);
    assert.doesNotMatch(pageSource, /draggable=\{rows\.length > 1\}/u);
    assert.match(pageSource, /event\.key === "ArrowUp"/u);
    assert.match(pageSource, /aria-live="polite"/u);
    assert.match(pageSource, /\+ Add \$\{laneLabel\} priority/);
    assert.match(pageSource, /appends every other eligible model in the lane/u);
    assert.match(pageSource, /ONLINE ends with one bundled local attempt/u);
  });

  it("presents Offline and Online priorities as draggable chip columns", () => {
    assert.match(pageSource, /className=\{styles\.settingsFallbackLaneColumns\}/u);
    assert.match(pageSource, /data-auto-fallback-lane=\{lane\}/u);
    assert.match(pageSource, /lane === "local" \? "OFFLINE" : "ONLINE"/u);
    assert.match(
      pageCss,
      /\.settingsFallbackLaneColumns \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/u,
    );
    assert.match(
      pageCss,
      /\.settingsFallbackEntry \{[\s\S]*?grid-template-columns: 30px minmax\(0, 1fr\) 30px;[\s\S]*?border-radius: 14px;/u,
    );
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
      true,
    );
    assert.deepEqual(
      autoFallbackSelectablePrimary({
        chain: { v: 1, fallbacks: [local] },
        runnable: [local, openai],
      }),
      local,
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

  it("keeps Auto available without configured priorities when the lane can run", () => {
    assert.equal(
      autoFallbackModeSelectable({ chain: null, runnable: [local, openai] }),
      true,
    );
    assert.equal(
      autoFallbackModeSelectable({
        chain: { v: 1, fallbacks: [anthropic] },
        runnable: [local, openai],
      }),
      true,
    );
    assert.equal(autoFallbackModeSelectable({ chain: null, runnable: [] }), false);
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
