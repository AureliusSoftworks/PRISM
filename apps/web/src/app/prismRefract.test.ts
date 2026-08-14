import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PrismRefractGenerationTimeoutError,
  nextPrismRefractChoice,
  prismRefractModifierClickDecision,
  runPrismRefractGenerationWithTimeout,
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

  it("uses a repeated same-target click as the explicit cancel control", () => {
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
      "cancel",
    );
    assert.equal(
      prismRefractModifierClickDecision({
        ...active,
        clickedTargetId: "private-comments",
      }),
      "accept-and-begin",
    );
  });

  it("never rerolls from modifier-click — the active sheen cancels instead", () => {
    assert.equal(
      prismRefractModifierClickDecision({
        activeTargetId: "topic",
        activeTargetKind: "field",
        clickedTargetId: "topic",
        canAccept: false,
      }),
      "cancel",
    );
  });

  it("queues a distinct target while the active draft is unsettled", () => {
    assert.equal(
      prismRefractModifierClickDecision({
        activeTargetId: "topic",
        activeTargetKind: "field",
        clickedTargetId: "private-comments",
        canAccept: false,
      }),
      "queue",
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

  it("settles stalled generation with a timeout and aborts its work signal", async () => {
    const observed: { signal: AbortSignal | null } = { signal: null };
    await assert.rejects(
      runPrismRefractGenerationWithTimeout({
        signal: new AbortController().signal,
        timeoutMs: 5,
        run: (signal) => {
          observed.signal = signal;
          return new Promise<string>(() => undefined);
        },
      }),
      PrismRefractGenerationTimeoutError,
    );
    assert.equal(observed.signal?.aborted, true);
  });

  it("forwards explicit page-lifecycle cancellation to generation", async () => {
    const parent = new AbortController();
    const generation = runPrismRefractGenerationWithTimeout({
      signal: parent.signal,
      run: (signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(signal.reason),
            { once: true },
          );
        }),
    });
    parent.abort(new DOMException("Page left.", "AbortError"));
    await assert.rejects(generation, { name: "AbortError" });
  });
});
