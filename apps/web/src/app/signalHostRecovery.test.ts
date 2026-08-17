import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  signalHostRecoveryCandidateEnabled,
  signalHostRecoveryCandidateLabel,
} from "./signalHostRecovery.ts";

describe("Signal host recovery candidate helpers", () => {
  it("only enables compatible candidates and gives every disabled state a clear label", () => {
    assert.equal(signalHostRecoveryCandidateEnabled({ status: "compatible" }), true);
    assert.equal(signalHostRecoveryCandidateEnabled({ status: "incompatible" }), false);
    assert.equal(signalHostRecoveryCandidateEnabled({ status: "refused" }), false);
    assert.equal(signalHostRecoveryCandidateLabel({ status: "compatible" }, false), "Ask to host");
    assert.equal(signalHostRecoveryCandidateLabel({ status: "compatible" }, true), "Checking…");
    assert.equal(signalHostRecoveryCandidateLabel({ status: "refused" }, false), "Declined");
    assert.equal(signalHostRecoveryCandidateLabel({ status: "unavailable" }, false), "Unavailable");
  });
});
