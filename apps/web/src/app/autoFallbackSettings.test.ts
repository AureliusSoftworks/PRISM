import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  autoFallbackAvailableForPrimary,
  autoFallbackChainWithAddedEntry,
  autoFallbackChainWithEntry,
  autoFallbackChainWithoutEntry,
  autoFallbackPrimaryForSelection,
  autoFallbackResponseModeForSend,
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
    assert.deepEqual(decodeAutoFallbackPickerValue(encodeAutoFallbackPickerValue(openai)), openai);
  });

  it("renders an ordered 1–5 slot Settings chain with add and remove controls", () => {
    assert.match(pageSource, /autoFallbackEntries\.map\(\(fallback, index\)/);
    assert.match(pageSource, /AUTO_FALLBACK_CHAIN_MAX_FALLBACK_COUNT/);
    assert.match(pageSource, /autoFallbackChainWithAddedEntry/);
    assert.match(pageSource, /autoFallbackChainWithoutEntry/);
    assert.match(pageSource, /\+ Add fallback/);
  });

  it("keeps Auto pickers active with every model and routes a selection as Primary", () => {
    assert.match(
      pageSource,
      /responseMode === "online"[\s\S]{0,240}chatModelOptionsForProvider\(catalog, settings, "local"\)[\s\S]{0,260}onlineModelOptionsForPicker\(catalog, settings\)/u,
    );
    assert.match(
      pageSource,
      /provider=\{responseMode === "auto" \? "all"/u,
    );
    assert.match(pageSource, /applyModelChoiceForResponseMode\(\{/u);
    assert.match(pageSource, /Primary model for AUTO replies/u);
  });

  it("builds, extends, and trims a customizable fallback chain", () => {
    const first = autoFallbackChainWithEntry({
      chain: null,
      index: 0,
      next: local,
      available: [local, openai, anthropic],
    });
    assert.deepEqual(
      first,
      { v: 1, fallbacks: [local] },
    );
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

  it("resolves Account default to the saved model the server will use", () => {
    assert.deepEqual(
      autoFallbackPrimaryForSelection({
        provider: "openai",
        modelChoice: "auto",
        preferredLocalModel: "qwen3:8b",
        preferredOnlineModel: "claude-haiku-4-5",
        hiddenModelIds: [],
        catalog,
      }),
      anthropic,
    );
  });

  it("keeps an explicit surface model ahead of the account default", () => {
    assert.deepEqual(
      autoFallbackPrimaryForSelection({
        provider: "openai",
        modelChoice: "gpt-4o-mini",
        preferredLocalModel: "qwen3:8b",
        preferredOnlineModel: "claude-haiku-4-5",
        hiddenModelIds: [],
        catalog,
      }),
      { provider: "openai", model: "gpt-4o-mini" },
    );
  });

  it("does not treat a disabled primary lane as Auto-ready", () => {
    assert.equal(
      autoFallbackPrimaryForSelection({
        provider: "local",
        modelChoice: "disabled",
        preferredLocalModel: "qwen3:8b",
        preferredOnlineModel: "gpt-4o-mini",
        hiddenModelIds: [],
        catalog,
      }),
      null,
    );
  });

  it("requires the resolved primary chain to retain at least one runnable backup", () => {
    const chain = { v: 1 as const, fallbacks: [openai, anthropic] as [typeof openai, typeof anthropic] };
    assert.equal(
      autoFallbackAvailableForPrimary({ primary: local, chain, runnable: [local, openai, anthropic] }),
      true
    );
    assert.equal(
      autoFallbackAvailableForPrimary({ primary: openai, chain, runnable: [local, openai, anthropic] }),
      true
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

  it("keeps Auto active by skipping a fallback that duplicates the contextual primary", () => {
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
      "auto",
    );
    assert.equal(
      autoFallbackResponseModeForSend({
        autoEnabled: true,
        primary: openai,
        chain,
        runnable,
      }),
      "auto",
    );
  });
});
