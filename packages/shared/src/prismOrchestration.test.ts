import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRISM_ORCHESTRATION_VERSION,
  normalizePrismExecuteProposalRequestV1,
  normalizePrismIntentPlanV1,
  normalizePrismJsonObject,
} from "./prismOrchestration.ts";

describe("Prism orchestration contracts", () => {
  it("accepts only narrowed capabilities", () => {
    const plan = normalizePrismIntentPlanV1(
      {
        kind: "action",
        confidence: 0.98,
        capabilityId: "settings.online-model.update",
        input: { model: "claude-opus-4-6" },
      },
      ["settings.online-model.update"],
    );
    assert.equal(plan.schemaVersion, PRISM_ORCHESTRATION_VERSION);
    assert.equal(plan.capabilityId, "settings.online-model.update");
    assert.deepEqual(plan.input, { model: "claude-opus-4-6" });
    assert.throws(
      () =>
        normalizePrismIntentPlanV1(
          {
            kind: "action",
            capabilityId: "admin.steal-secrets",
          },
          ["settings.online-model.update"],
        ),
      /unavailable capability/u,
    );
  });

  it("rejects malformed or empty structured plans", () => {
    assert.throws(
      () => normalizePrismIntentPlanV1({ kind: "workflow" }, []),
      /empty workflow/u,
    );
    assert.throws(
      () => normalizePrismIntentPlanV1({ kind: "clarification" }, []),
      /empty clarification/u,
    );
  });

  it("bounds JSON and proposal execution input", () => {
    assert.deepEqual(
      normalizePrismJsonObject({
        okay: 1,
        invalid: Number.NaN,
        nested: { yes: true },
      }),
      { okay: 1, nested: { yes: true } },
    );
    assert.deepEqual(
      normalizePrismExecuteProposalRequestV1({
        proposalId: "proposal-1",
        confirmation: true,
        idempotencyKey: "request-1",
      }),
      {
        proposalId: "proposal-1",
        confirmation: true,
        idempotencyKey: "request-1",
      },
    );
  });
});
