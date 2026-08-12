import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  confirmationAffordanceFor,
  reversibilityFromCapability,
  validateConfirmationActions,
  type ConfirmationAction,
} from "./confirmationPolicy.ts";

function action(overrides: Partial<ConfirmationAction>): ConfirmationAction {
  return {
    id: "test-action",
    label: "Test action",
    leavesDevice: false,
    deferrable: false,
    reversible: false,
    bulk: false,
    soft: false,
    ...overrides,
  };
}

describe("confirmation affordance rules", () => {
  it("holds a deferrable send that leaves the device", () => {
    assert.equal(
      confirmationAffordanceFor(action({ leavesDevice: true, deferrable: true })),
      "hold-undo",
    );
  });

  it("confirms a send that leaves the device and cannot be held", () => {
    assert.equal(
      confirmationAffordanceFor(action({ leavesDevice: true })),
      "confirm",
    );
  });

  it("confirms an action with no inverse and no soft delete", () => {
    assert.equal(confirmationAffordanceFor(action({})), "confirm");
  });

  it("confirms a bulk action", () => {
    assert.equal(
      confirmationAffordanceFor(action({ reversible: true, bulk: true })),
      "confirm",
    );
  });

  it("offers undo when an inverse exists", () => {
    assert.equal(
      confirmationAffordanceFor(action({ reversible: true })),
      "undo",
    );
  });

  it("asks for nothing when the data model already holds the recovery", () => {
    assert.equal(confirmationAffordanceFor(action({ soft: true })), "none");
  });
});

describe("confirmation affordance precedence", () => {
  // Rule 2 must not swallow rule 5. Soft deletion is itself a recovery path,
  // so "no inverse operation or snapshot" does not fire for a soft action —
  // this is the case that breaks if the gate is ever simplified back to a
  // bare !reversible check, and it would silently take `none` out of service.
  it("keeps `none` reachable for a soft action with no explicit inverse", () => {
    assert.equal(
      confirmationAffordanceFor(
        action({ soft: true, reversible: false, bulk: false }),
      ),
      "none",
    );
  });

  // Conversation sweep: POST /api/conversations/sweep/undo genuinely exists,
  // and the action still confirms, because per-item undo is not recovery when
  // the blast radius is every conversation at once.
  it("confirms a bulk action even when an inverse exists", () => {
    assert.equal(
      confirmationAffordanceFor(action({ bulk: true, reversible: true })),
      "confirm",
    );
  });

  // delete-all-title: backed by conversations.quarantine, still bulk.
  it("confirms a bulk action even when it is only soft-deleted", () => {
    assert.equal(
      confirmationAffordanceFor(action({ bulk: true, soft: true })),
      "confirm",
    );
  });

  it("confirms across the online boundary even when an inverse exists", () => {
    assert.equal(
      confirmationAffordanceFor(
        action({ leavesDevice: true, reversible: true, deferrable: false }),
      ),
      "confirm",
    );
  });

  // The only path where `bulk` is true and the result is not `confirm`.
  // Rule 1 outranks rule 3; reorder the gates and this is the first to break.
  it("holds a deferrable bulk send rather than confirming it", () => {
    assert.equal(
      confirmationAffordanceFor(
        action({ leavesDevice: true, deferrable: true, bulk: true }),
      ),
      "hold-undo",
    );
  });

  it("ignores deferrable for actions that stay on the device", () => {
    assert.equal(
      confirmationAffordanceFor(action({ deferrable: true, reversible: true })),
      "undo",
    );
  });
});

describe("confirmation policy validation", () => {
  it("requires a written reason for confirm-tier actions", () => {
    const violations = validateConfirmationActions([
      action({ id: "bots.delete-selected", bulk: true }),
    ]);
    assert.equal(violations.length, 1);
    assert.match(violations[0]!.problem, /cannot be undone/u);
  });

  it("accepts a confirm-tier action that explains itself", () => {
    const violations = validateConfirmationActions([
      action({
        id: "bots.delete-selected",
        bulk: true,
        irreversibleReason:
          "DELETE /api/bots/selected runs raw SQL with no quarantine, " +
          "unlike the single-bot route.",
      }),
    ]);
    assert.deepEqual(violations, []);
  });

  it("does not require a reason below the confirm tier", () => {
    const violations = validateConfirmationActions([
      action({ id: "assets.compress", reversible: true }),
      action({ id: "conversations.archive", soft: true }),
    ]);
    assert.deepEqual(violations, []);
  });

  it("rejects duplicate action ids", () => {
    const violations = validateConfirmationActions([
      action({ id: "same", soft: true }),
      action({ id: "same", soft: true }),
    ]);
    assert.deepEqual(
      violations.map((violation) => violation.problem),
      ["duplicate action id"],
    );
  });
});

describe("capability descriptor mapping", () => {
  // The 30-day journal is a real inverse, but it is a hidden store rather than
  // a browsable archive. Treating it as `soft` would resolve a destructive
  // delete to `none` and leave the person no way to reach the recovery.
  it("treats quarantine undo as reversible, not as a soft delete", () => {
    const facts = reversibilityFromCapability({
      undo: "quarantine",
      provider: "none",
    });
    assert.deepEqual(facts, { leavesDevice: false, reversible: true });
    assert.equal(confirmationAffordanceFor({ ...action({}), ...facts }), "undo");
  });

  it("reads inverse undo as reversible", () => {
    const facts = reversibilityFromCapability({
      undo: "inverse",
      provider: "none",
    });
    assert.equal(facts.reversible, true);
    assert.equal(confirmationAffordanceFor({ ...action({}), ...facts }), "undo");
  });

  it("reads absent undo as irreversible", () => {
    const facts = reversibilityFromCapability({
      undo: "none",
      provider: "none",
    });
    assert.equal(facts.reversible, false);
    assert.equal(
      confirmationAffordanceFor({ ...action({}), ...facts }),
      "confirm",
    );
  });

  it("carries an online-required provider across the device boundary", () => {
    assert.equal(
      reversibilityFromCapability({ undo: "none", provider: "online-required" })
        .leavesDevice,
      true,
    );
  });

  // bots.delete is undo:"quarantine" while DELETE /api/bots/selected is raw
  // SQL with no journal entry at all. Same-looking modals, different guarantees.
  it("separates a quarantine-backed single delete from a raw bulk delete", () => {
    const single = {
      ...action({ id: "bots.delete" }),
      ...reversibilityFromCapability({ undo: "quarantine", provider: "none" }),
    };
    const bulk = action({ id: "bots.delete-selected", bulk: true });
    assert.equal(confirmationAffordanceFor(single), "undo");
    assert.equal(confirmationAffordanceFor(bulk), "confirm");
  });

  // `bulk` is a property of the invocation: conversations.quarantine serves
  // both a single id and {all:true} from one descriptor.
  it("lets the call site raise a reversible capability to confirm when bulk", () => {
    const facts = reversibilityFromCapability({
      undo: "quarantine",
      provider: "none",
    });
    assert.equal(
      confirmationAffordanceFor({ ...action({}), ...facts, bulk: true }),
      "confirm",
    );
  });
});
