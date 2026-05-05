---
title: "packages/shared/src/botProfile.ts"
type: "note"
domain: "packages"
tags:
  - prism
  - packages
source: "packages/shared/src/botProfile.ts"
status: "active"
---

# packages/shared/src/botProfile.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/web/.next/dev/server/chunks/ssr/[root-of-the-server]__0rip54u._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/packages_shared_src_0k0brk.._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/packages_shared_src_0om.wby._.js]]
- [[02-apps/web/.next/dev/static/chunks/_0d3xlyf._.js]]
- [[02-apps/web/.next/dev/static/chunks/packages_shared_src_07_jkvv._.js]]
- [[02-apps/web/.next/dev/static/chunks/packages_shared_src_0p__g8u._.js]]
- [[03-packages/shared/src/botProfile.test.ts]]

## Source path
- `packages/shared/src/botProfile.ts`

## Import references
- _No imports detected_

## Source preview
```text
/**
 * Structured bot profile fields composed into `bots.system_prompt`.
 *
 * Machine-readable metadata is appended after natural-language prose so the UI
 * can round-trip edits without exposing a raw system prompt. The chat pipeline
 * strips the suffix before building provider prompts.
 */

/// Sentinel block embedded at the end of `system_prompt` for structured bots.
export const BOT_PROFILE_META_START = "<<<PRISM_BOT_META>>>";
export const BOT_PROFILE_META_END = "<<<END_PRISM_BOT_META>>>";

export type BotProfileCategoryId =
  | "purpose"
  | "core"
  | "identity"
  | "worldview"
  | "appearance";

export const BOT_PROFILE_CATEGORY_ORDER: readonly BotProfileCategoryId[] = [
  "purpose",
  "core",
  "identity",
  "worldview",
  "appearance",
] as const;

export const BOT_PROFILE_CATEGORY_LABELS: Record<BotProfileCategoryId, string> = {
  purpose: "Purpose",
  core: "Core",
  identity: "Identity",
  worldview: "Worldview",
  appearance: "Appearance",
};

export type BotVoicePreset =
  | "neutral"
  | "warm"
  | "concise"
  | "playful"
  | "formal";

export type BotProfileScaleValue = -2 | -1 | 0 | 1 | 2;

export interface BotPurposeProfile {
  /** The user's answer to "What is my purpose?" Blank falls back to the bot name. */
  statement: string;
  /** Raw legacy prompt text or any advanced notes that do not fit elsewhere. */
  legacyNotes: string;
}

export interface BotCo

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
