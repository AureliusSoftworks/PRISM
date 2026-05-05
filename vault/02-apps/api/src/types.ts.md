---
title: "apps/api/src/types.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/types.ts"
status: "active"
---

# apps/api/src/types.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/types.ts`

## Import references
- `node:http`

## Source preview
```text
import type { IncomingMessage, ServerResponse } from "node:http";

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse<IncomingMessage>;
  body: unknown;
  params: Record<string, string>;
  query: URLSearchParams;
  userId?: string;
  sessionToken?: string;
}

export interface RouteDefinition {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: (ctx: RequestContext) => Promise<void>;
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
