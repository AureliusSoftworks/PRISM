import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  modeAwareModelOptions,
  type ModeAwareModelOption,
} from "./modeAwareModelOptions.ts";

type TestModelOption = ModeAwareModelOption & { id: string };

const local: TestModelOption[] = [{ id: "gemma", provider: "local" }];
const online: TestModelOption[] = [
  { id: "gpt", provider: "openai" },
  { id: "claude", provider: "anthropic" },
];

describe("mode-aware model options", () => {
  it("shows only runnable local models in LOCAL", () => {
    const options = modeAwareModelOptions({
      local,
      online,
      responseMode: "local",
    });
    assert.deepEqual(options.map((option) => option.id), ["gemma"]);
    assert.equal(options[0]?.disabledReason, undefined);
  });

  it("shows only runnable online models in ONLINE", () => {
    const options = modeAwareModelOptions({
      local,
      online,
      responseMode: "online",
    });
    assert.deepEqual(
      options.map((option) => option.id),
      ["gpt", "claude"],
    );
    assert.equal(options[0]?.disabledReason, undefined);
    assert.equal(options[1]?.disabledReason, undefined);
  });

  it("enables every otherwise-runnable model in AUTO", () => {
    const unavailableOnline = [
      online[0]!,
      { ...online[1]!, disabledReason: "Provider unavailable." },
    ];
    const options = modeAwareModelOptions({
      local,
      online: unavailableOnline,
      responseMode: "auto",
    });
    assert.equal(options[0]?.disabledReason, undefined);
    assert.equal(options[1]?.disabledReason, undefined);
    assert.equal(options[2]?.disabledReason, "Provider unavailable.");
  });
});
