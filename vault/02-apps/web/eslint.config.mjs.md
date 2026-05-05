---
title: "apps/web/eslint.config.mjs"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/web/eslint.config.mjs"
status: "active"
---

# apps/web/eslint.config.mjs

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- _No backlinks yet_

## Source path
- `apps/web/eslint.config.mjs`

## Import references
- `eslint/config`
- `eslint-config-next/core-web-vitals`
- `eslint-config-next/typescript`

## Source preview
```text
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
