---
title: "apps/api/src/settings.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/settings.ts"
status: "active"
---

# apps/api/src/settings.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/model-routing.ts]]

## Referenced by
- [[02-apps/api/src/__tests__/settings.test.ts]]
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/settings.ts`

## Import references
- `./model-routing.ts`

## Source preview
```text
import { sanitizeHiddenModelIds } from "./model-routing.ts";

/**
 * Pure validation + merge logic for PATCH /api/settings.
 *
 * Extracted from `server.ts` so the theme/provider/lock/openAiKey semantics
 * can be unit-tested without standing up an HTTP server. This file intentionally
 * has zero runtime dependencies beyond types — every branch is a plain function
 * of `body` and `current`, which is what makes it safe to pin in tests and
 * cheap to reason about when adding new fields.
 *
 * Any future setting added to the PATCH handler should be plumbed through
 * `resolveNextSettings` with a matching test case in
 * `__tests__/settings.test.ts` so the exact "I wiped but still logged in"
 * class of regression (server silently dropping a valid value from a new
 * client) cannot happen again.
 */
export type Theme = "light" | "dark" | "system";
export type Provider = "local" | "openai";

const LOOPBACK_OLLAMA_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "::ffff:127.0.0.1",
  "host.docker.internal",
]);

/** Current persisted settings loaded from the users table. */
export interface CurrentSettings {
  theme: Theme;
  preferredProvider: Provider;
  providerLocked: number;
  autoMemory: number;
  hiddenBotModelIds: string;
  secondaryOllamaHost: string | null;
  primaryOllamaHost: string;
}

/** Shape of the next-settings result, with OpenAI key in

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
