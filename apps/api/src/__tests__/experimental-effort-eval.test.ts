import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PROMPT,
  evalRunProvenance,
  evalRuns,
  readCliOptions,
} from "../evals/experimental-effort.ts";

describe("experimental Effort same-model online eval", () => {
  it("requires an explicit paid multi-call acknowledgement", () => {
    assert.throws(
      () =>
        readCliOptions([
          "--same-model-online-simulation",
          "gpt-3.5-turbo",
        ]),
      /requires --acknowledge-paid-multi-call/u,
    );
  });

  it("pins the paid comparison to cafe High and keeps scratchpads private", () => {
    assert.throws(
      () =>
        readCliOptions([
          "--same-model-online-simulation",
          "gpt-3.5-turbo",
          "--acknowledge-paid-multi-call",
          "--include-scratchpad",
        ]),
      /private scratchpads stay out of artifacts/u,
    );
    assert.throws(
      () =>
        readCliOptions([
          "--same-model-online-simulation",
          "gpt-3.5-turbo",
          "--acknowledge-paid-multi-call",
          "--prompt",
          "different prompt",
        ]),
      /pinned to --suite cafe/u,
    );
    assert.throws(
      () =>
        readCliOptions([
          "--same-model-online-simulation",
          "gpt-3.5-turbo",
          "--acknowledge-paid-multi-call",
          "--effort",
          "medium",
        ]),
      /pinned to --effort high/u,
    );
  });

  it("defines a true same-provider/model A/B with an ordinary baseline", () => {
    const options = readCliOptions([
      "--same-model-online-simulation",
      "gpt-3.5-turbo",
      "--acknowledge-paid-multi-call",
      "--temperature",
      "0.25",
      "--max-tokens",
      "3200",
    ]);
    assert.ok(options);
    assert.equal(options.suite, "cafe");
    assert.equal(options.prompt, DEFAULT_PROMPT);
    assert.equal(options.effort, "high");
    assert.equal(options.includeScratchpad, false);

    const runs = evalRuns(options);
    assert.equal(runs.length, 2);
    assert.deepEqual(
      runs.map((run) => ({
        id: run.id,
        provider: run.provider,
        model: run.model,
        effort: run.reasoningEffort,
        expectedSimulated: run.expectedSimulated,
        callBehavior: run.callBehavior,
      })),
      [
        {
          id: "online-single-call-baseline",
          provider: "openai",
          model: "gpt-3.5-turbo",
          effort: "none",
          expectedSimulated: false,
          callBehavior: "ordinary-single-visible-call",
        },
        {
          id: "online-simulated-high",
          provider: "openai",
          model: "gpt-3.5-turbo",
          effort: "high",
          expectedSimulated: true,
          callBehavior: "private-pass-ladder-plus-visible-call",
        },
      ],
    );
  });

  it("verifies baseline and simulated provenance without scratchpad content", () => {
    assert.deepEqual(
      evalRunProvenance(
        {
          expectedSimulated: false,
          callBehavior: "ordinary-single-visible-call",
        },
        undefined,
      ),
      {
        simulated: false,
        passCount: 0,
        callBehavior: "ordinary-single-visible-call",
        provenanceVerified: true,
      },
    );
    assert.deepEqual(
      evalRunProvenance(
        {
          expectedSimulated: true,
          callBehavior: "private-pass-ladder-plus-visible-call",
        },
        {
          summary: "private content omitted",
          effort: "high",
          provider: "openai",
          model: "gpt-3.5-turbo",
          simulated: true,
          passCount: 2,
          scratchpadChars: 640,
        },
      ),
      {
        simulated: true,
        passCount: 2,
        callBehavior: "private-pass-ladder-plus-visible-call",
        provenanceVerified: true,
      },
    );
  });
});
