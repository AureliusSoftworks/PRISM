import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOCAL_MODE_ONLINE_MODEL_DISABLED_REASON,
  ONLINE_MODE_LOCAL_MODEL_DISABLED_REASON,
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
  it("shows every model in LOCAL while disabling online choices", () => {
    const options = modeAwareModelOptions({
      local,
      online,
      responseMode: "local",
    });
    assert.deepEqual(
      options.map((option) => option.id),
      ["gemma", "gpt", "claude"],
    );
    assert.equal(options[0]?.disabledReason, undefined);
    assert.equal(
      options[1]?.disabledReason,
      LOCAL_MODE_ONLINE_MODEL_DISABLED_REASON,
    );
    assert.equal(
      options[2]?.disabledReason,
      LOCAL_MODE_ONLINE_MODEL_DISABLED_REASON,
    );
  });

  it("shows every model in ONLINE while disabling local choices", () => {
    const options = modeAwareModelOptions({
      local,
      online,
      responseMode: "online",
    });
    assert.equal(
      options[0]?.disabledReason,
      ONLINE_MODE_LOCAL_MODEL_DISABLED_REASON,
    );
    assert.equal(options[1]?.disabledReason, undefined);
    assert.equal(options[2]?.disabledReason, undefined);
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
