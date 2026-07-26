import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextPrismRefractChoice } from "./prismRefract.ts";

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
});
