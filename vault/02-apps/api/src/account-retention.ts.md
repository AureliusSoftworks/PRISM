---
title: "apps/api/src/account-retention.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/account-retention.ts"
status: "active"
---

# apps/api/src/account-retention.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/api/src/__tests__/account-retention.test.ts]]
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/account-retention.ts`

## Import references
- _No imports detected_

## Source preview
```text
export const INACTIVE_ACCOUNT_RETENTION_DAYS = 60;
export const INACTIVE_ACCOUNT_CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;

export function getInactiveAccountCutoff(now = new Date()): Date {
  return new Date(
    now.getTime() - INACTIVE_ACCOUNT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
}

export function isInactiveAccount(
  lastActiveAt: string,
  now = new Date()
): boolean {
  return new Date(lastActiveAt).getTime() < getInactiveAccountCutoff(now).getTime();
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
