import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INACTIVE_ACCOUNT_RETENTION_DAYS,
  getInactiveAccountCutoff,
  isInactiveAccount
} from "../account-retention.ts";

describe("account retention", () => {
  it("computes the inactive cutoff from the configured retention window", () => {
    const now = new Date("2026-04-22T00:00:00.000Z");
    const cutoff = getInactiveAccountCutoff(now);
    assert.equal(
      cutoff.toISOString(),
      "2026-02-21T00:00:00.000Z"
    );
    assert.equal(INACTIVE_ACCOUNT_RETENTION_DAYS, 60);
  });

  it("flags accounts inactive only after the cutoff", () => {
    const now = new Date("2026-04-22T00:00:00.000Z");
    assert.equal(isInactiveAccount("2026-02-20T23:59:59.000Z", now), true);
    assert.equal(isInactiveAccount("2026-02-21T00:00:01.000Z", now), false);
  });
});
