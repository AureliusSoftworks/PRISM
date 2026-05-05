---
title: "packages/shared/package.json"
type: "note"
domain: "packages"
tags:
  - prism
  - packages
source: "packages/shared/package.json"
status: "active"
---

# packages/shared/package.json

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- _No backlinks yet_

## Source path
- `packages/shared/package.json`

## Import references
- _No imports detected_

## Source preview
```text
{
  "name": "@localai/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types src/*.test.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
