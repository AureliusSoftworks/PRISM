import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BOT_BATCH_MIXED_LABEL,
  BOT_BATCH_MIXED_VALUE,
  batchFieldDisplayLabel,
  batchFieldDisplayValue,
  buildBotBatchEditPatch,
  resolveBotBatchEditState,
  type BotBatchEditValues,
} from "./botBatchEdit.ts";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(appDir, "page.tsx"), "utf8");

const botValues = (
  overrides: Partial<BotBatchEditValues> = {}
): BotBatchEditValues => ({
  color: "#66cc33",
  glyph: "bot",
  localModel: "llama3.2",
  onlineModel: "gpt-4.1-mini",
  localImageModel: "__auto__",
  openaiImageModel: "__auto__",
  ...overrides,
});

describe("bot batch edit helpers", () => {
  it("resolves shared selected values as concrete field states", () => {
    const state = resolveBotBatchEditState([botValues(), botValues()]);

    assert.deepEqual(state.color, { kind: "same", value: "#66cc33" });
    assert.deepEqual(state.localModel, { kind: "same", value: "llama3.2" });
    assert.equal(batchFieldDisplayValue(state.onlineModel, undefined), "gpt-4.1-mini");
  });

  it("resolves conflicting selected values as mixed field states", () => {
    const state = resolveBotBatchEditState([
      botValues({ color: "#66cc33", localModel: "llama3.2" }),
      botValues({ color: "#dd44aa", localModel: "mistral" }),
    ]);

    assert.deepEqual(state.color, { kind: "mixed", value: null });
    assert.deepEqual(state.localModel, { kind: "mixed", value: null });
    assert.equal(batchFieldDisplayValue(state.color, undefined), BOT_BATCH_MIXED_VALUE);
    assert.equal(
      batchFieldDisplayLabel(state.localModel, undefined),
      BOT_BATCH_MIXED_LABEL
    );
  });

  it("omits unchanged mixed fields until a value is chosen", () => {
    const state = resolveBotBatchEditState([
      botValues({ localModel: "llama3.2" }),
      botValues({ localModel: "mistral" }),
    ]);

    assert.deepEqual(buildBotBatchEditPatch(state, {}), {});
    assert.deepEqual(buildBotBatchEditPatch(state, { localModel: "qwen3:14b" }), {
      localModel: "qwen3:14b",
    });
  });

  it("omits concrete fields when the chosen value matches the shared value", () => {
    const state = resolveBotBatchEditState([botValues(), botValues()]);

    assert.deepEqual(buildBotBatchEditPatch(state, { color: "#66cc33" }), {});
    assert.deepEqual(buildBotBatchEditPatch(state, { color: "#112233" }), {
      color: "#112233",
    });
  });

  it("falls back to single-bot patching when the selected-bots route reports bot not found", () => {
    assert.match(pageSource, /function isBotNotFoundError\(err: unknown\): boolean/);
    assert.match(
      pageSource,
      /async function patchSelectedBotsIndividuallyForBatchEdit/
    );
    assert.match(
      pageSource,
      /api<\{ bot\?: Bot \}>\(`\/api\/bots\/\$\{encodeURIComponent\(id\)\}`/
    );
    assert.match(
      pageSource,
      /if \(!isBotNotFoundError\(err\)\) throw err;[\s\S]*result = await patchSelectedBotsIndividuallyForBatchEdit\(ids, patch\);/
    );
  });
});
