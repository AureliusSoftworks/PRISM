---
title: "apps/api/package.json"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/package.json"
status: "active"
---

# apps/api/package.json

## AI Summary
<!-- kb:summary:start -->
This note is crucial in PRISM as it outlines the configuration and dependencies for the local API package, ensuring that the project can be properly set up and managed with the correct scripts and versions of required libraries. Understanding this note is essential to ensure the API package functions correctly within the larger PRISM ecosystem.
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/package.json`

## Import references
- _No imports detected_

## Source preview
```text
{
  "name": "@localai/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --env-file-if-exists=../../.env --watch --experimental-strip-types src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node --env-file-if-exists=../../.env dist/server.js",
    "test": "node --test --experimental-strip-types src/__tests__/*.test.ts",
    "lint": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@localai/config": "file:../../packages/config",
    "@localai/shared": "file:../../packages/shared",
    "dnssd-advertise": "^1.1.4"
  },
  "devDependencies": {
    "@types/node": "^24.8.1",
    "typescript": "^5.9.3"
  }
}

```

## Related (semantic)
<!-- kb:related:start -->
_No semantic related links yet._
<!-- kb:related:end -->
