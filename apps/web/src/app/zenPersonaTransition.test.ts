import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveZenPersonaTransitionStyle,
} from "./zenPersonaTransition.ts";

describe("resolveZenPersonaTransitionStyle", () => {
  it("passes explicit spoken styles through", () => {
    assert.equal(
      resolveZenPersonaTransitionStyle("new-speaks", {
        fromBotId: "bot-a",
        toBotId: "bot-b",
        random: () => 0.99,
      }),
      "new-speaks"
    );
    assert.equal(
      resolveZenPersonaTransitionStyle("previous-introduces", {
        fromBotId: null,
        toBotId: "bot-b",
        random: () => 0,
      }),
      "previous-introduces"
    );
  });

  it("resolves Auto deterministically with injected random", () => {
    assert.equal(
      resolveZenPersonaTransitionStyle("auto", {
        fromBotId: "bot-a",
        toBotId: "bot-b",
        random: () => 0.1,
      }),
      "new-speaks"
    );
    assert.equal(
      resolveZenPersonaTransitionStyle("auto", {
        fromBotId: "bot-a",
        toBotId: "bot-b",
        random: () => 0.9,
      }),
      "previous-introduces"
    );
  });

  it("never resolves Auto to a quiet or off state", () => {
    const seen = new Set<string>();
    for (const value of [0, 0.25, 0.5, 0.75, 0.999]) {
      seen.add(
        resolveZenPersonaTransitionStyle("auto", {
          fromBotId: "bot-a",
          toBotId: "bot-b",
          random: () => value,
        })
      );
    }
    assert.deepEqual([...seen].sort(), ["new-speaks", "previous-introduces"]);
  });

  it("lets Auto choose PRISM introduces when Default is the current persona", () => {
    assert.equal(
      resolveZenPersonaTransitionStyle("auto", {
        fromBotId: null,
        toBotId: "bot-b",
        random: () => 0.99,
      }),
      "previous-introduces"
    );
  });
});
