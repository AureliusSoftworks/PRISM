---
title: "packages/shared/src/prismTool.ts"
type: "note"
domain: "packages"
tags:
  - prism
  - packages
source: "packages/shared/src/prismTool.ts"
status: "active"
---

# packages/shared/src/prismTool.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/web/.next/dev/server/chunks/ssr/[root-of-the-server]__0rip54u._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/packages_shared_src_0k0brk.._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/packages_shared_src_0p14fkf._.js]]
- [[02-apps/web/.next/dev/static/chunks/_0d3xlyf._.js]]
- [[02-apps/web/.next/dev/static/chunks/packages_shared_src_07_jkvv._.js]]
- [[02-apps/web/.next/dev/static/chunks/packages_shared_src_0932f8c._.js]]
- [[03-packages/shared/src/prismTool.test.ts]]

## Source path
- `packages/shared/src/prismTool.ts`

## Import references
- _No imports detected_

## Source preview
```text
/**
 * Inline assistant tool payloads (e.g. AskQuestion chips) appended after prose.
 *
 * Mirrors the BOT_META sentinel pattern: delimited blocks the server strips so
 * `messages.content` stays human-readable while structured UI state lives in
 * `tool_payload` (and is re-attached at read time as `chatMessage.askQuestion`).
 */

export const PRISM_TOOL_START = "<<<PRISM_TOOL>>>";
export const PRISM_TOOL_END = "<<<END_PRISM_TOOL>>>";

// Models often interpolate spaces or odd breaks; anchored patterns keep false positives unlikely.
const PRISM_TOOL_START_PATTERN = /<<<\s*PRISM\s*_?\s*TOOL\s*>>>/gi;
const PRISM_TOOL_END_PATTERN = /<<<\s*END\s*_?\s*PRISM\s*_?\s*TOOL\s*>>>/gi;

export interface AskQuestionOption {
  id: string;
  label: string;
}

export interface AskQuestionPayload {
  v: 1;
  name: "AskQuestion";
  prompt: string;
  options: AskQuestionOption[];
}

/** Narrow storage shape for SQLite `messages.tool_payload` rows. */
export type StoredAssistantToolPayload = AskQuestionPayload;

export interface ParsedAssistantTurn {
  /** Text shown in the transcript and fed back into the LLM prompt. */
  displayContent: string;
  /** Parsed AskQuestion when the envelope was valid and complete. */
  askQuestion?: AskQuestionPayload;
}

/// Many models wrap the envelope in a markdown fence; raw fences make JSON.parse fail
/// while delimiters still match—prose strips but AskQuest

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
