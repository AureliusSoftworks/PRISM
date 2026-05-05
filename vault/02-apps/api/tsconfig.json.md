---
title: "apps/api/tsconfig.json"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/tsconfig.json"
status: "active"
---

# apps/api/tsconfig.json

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- _No backlinks yet_

## Source path
- `apps/api/tsconfig.json`

## Import references
- _No imports detected_

## Source preview
```text
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "types": [
      "node"
    ],
    "baseUrl": ".",
    "paths": {
      "@localai/shared": [
        "../../packages/shared/src"
      ],
      "@localai/config": [
        "../../packages/config/src"
      ]
    }
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "src/__tests__/**/*"
  ]
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
