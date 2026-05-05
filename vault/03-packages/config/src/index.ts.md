---
title: "packages/config/src/index.ts"
type: "note"
domain: "packages"
tags:
  - prism
  - packages
source: "packages/config/src/index.ts"
status: "active"
---

# packages/config/src/index.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- _No backlinks yet_

## Source path
- `packages/config/src/index.ts`

## Import references
- _No imports detected_

## Source preview
```text
function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";

/**
 * Turn whatever value is in OLLAMA_HOST into a URL that `fetch()` can use.
 *
 * Common real-world inputs we should survive:
 *   - "localhost:11434"        -> "http://localhost:11434"      (no scheme)
 *   - "0.0.0.0:11434"          -> "http://127.0.0.1:11434"      (bind-all is
 *     valid as a listen address for Ollama itself but is not a valid client
 *     target on macOS / Windows; using it trips `fetch()` with
 *     "Failed to parse URL")
 *   - "http://localhost:11434/" -> "http://localhost:11434"     (trailing slash
 *     would produce "//api/chat" once we append paths)
 *   - Anything unparseable falls back to the default to avoid crashing.
 */
function normalizeOllamaHost(value: strin

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
