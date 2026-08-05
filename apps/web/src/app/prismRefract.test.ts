import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextPrismRefractChoice,
  prismRefractModifierClickDecision,
} from "./prismRefract.ts";

describe("Prism Refract helpers", () => {
  it("uses every unrejected valid choice before resetting the shuffle bag", () => {
    const choices = [
      { value: "", label: "Choose…" },
      { value: "a", label: "A" },
      { value: "b", label: "B" },
      { value: "c", label: "C", disabled: true },
    ];
    assert.deepEqual(nextPrismRefractChoice(choices, "a", ["b"], () => 0), {
      value: "b",
      label: "B",
    });
    assert.deepEqual(nextPrismRefractChoice(choices, "a", [], () => 0), {
      value: "b",
      label: "B",
    });
  });

  it("never returns placeholders, disabled options, or the current choice", () => {
    assert.equal(
      nextPrismRefractChoice(
        [
          { value: "", label: "Choose…" },
          { value: "a", label: "A" },
          { value: "b", label: "B", disabled: true },
        ],
        "a",
        [],
      ),
      null,
    );
  });

  it("uses modifier-click to accept in place or accept and continue", () => {
    const active = {
      activeTargetId: "topic",
      activeTargetKind: "field" as const,
      canAccept: true,
    };
    assert.equal(
      prismRefractModifierClickDecision({
        ...active,
        clickedTargetId: "topic",
      }),
      "accept",
    );
    assert.equal(
      prismRefractModifierClickDecision({
        ...active,
        clickedTargetId: "private-comments",
      }),
      "accept-and-begin",
    );
  });

  it("never rerolls from modifier-click — Spacebar owns reroll", () => {
    assert.equal(
      prismRefractModifierClickDecision({
        activeTargetId: "topic",
        activeTargetKind: "field",
        clickedTargetId: "topic",
        canAccept: false,
      }),
      "wait",
    );
  });

  it("waits for an unsettled draft before modifier-click chaining", () => {
    assert.equal(
      prismRefractModifierClickDecision({
        activeTargetId: "topic",
        activeTargetKind: "field",
        clickedTargetId: "private-comments",
        canAccept: false,
      }),
      "wait",
    );
    assert.equal(
      prismRefractModifierClickDecision({
        activeTargetId: null,
        activeTargetKind: null,
        clickedTargetId: "topic",
        canAccept: false,
      }),
      "begin",
    );
  });
});
