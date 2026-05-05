---
title: "apps/api/src/__tests__/account-retention.test.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/__tests__/account-retention.test.ts"
status: "active"
---

# apps/api/src/__tests__/account-retention.test.ts

## AI Summary
<!-- kb:summary:start -->
This note is crucial in PRISM because it ensures that the account retention functionality correctly calculates the inactive cutoff date based on the configured retention window, and flags accounts as inactive only after this cutoff date has been reached. This helps maintain data accuracy and prevent incorrect account statuses from being reported.
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/account-retention.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/src/__tests__/account-retention.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `../account-retention.ts`

## Source preview
```text
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

```

## Related (semantic)
<!-- kb:related:start -->
_No semantic related links yet._
<!-- kb:related:end -->
