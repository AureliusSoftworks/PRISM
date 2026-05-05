---
title: "apps/api/src/bots.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/bots.ts"
status: "active"
---

# apps/api/src/bots.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/security.ts]]

## Referenced by
- [[02-apps/api/src/__tests__/bots.test.ts]]
- [[02-apps/api/src/server.ts]]
- [[05-lessons/2026-04-30-2026-04-30-architecture-lesson-22]]

## Source path
- `apps/api/src/bots.ts`

## Import references
- `node:sqlite`
- `@localai/shared`
- `./security.ts`

## Source preview
```text
import type { DatabaseSync } from "node:sqlite";
import { stripBotProfileMetaSuffix } from "@localai/shared";
import { randomId } from "./security.ts";

const BOT_EXPORT_HASH_PATTERN = /^[a-f0-9]{32}$/i;

/**
 * Build the system-prompt string sent to the model for a selected bot.
 *
 * Why this exists: the bot's *name* is meaningful context the user picked
 * deliberately ("Tim", "Frank", a custom persona) — but without this
 * helper, only the user-authored `system_prompt` is ever forwarded to the
 * model. That meant a bot named "Tim" with an empty prompt would introduce
 * itself as a generic "assistant" and deny being Tim, which reads as a bug.
 *
 * Behaviour:
 *   - With a non-empty name, we always prepend a short identity preamble
 *     ("You are <name>...") so the model adopts the persona even when the
 *     user didn't write a prompt.
 *   - If a system prompt is present, it follows the preamble. Because the
 *     user's prompt comes last, it still wins when it contradicts the
 *     preamble (e.g. "Respond as a pirate" overrides the identity tone).
 *   - Structured bot-editor metadata (`<<<PRISM_BOT_META>>>` …), when present,
 *     is stripped before this helper runs so providers never see JSON tails.
 *   - Returns undefined when neither a usable name nor prompt is present,
 *     so callers pass no bot-owned persona; `buildPromptMessages` still ships
 *     the

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
