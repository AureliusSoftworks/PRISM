---
title: "packages/shared/src/botCustomizerModels.ts"
type: "note"
domain: "packages"
tags:
  - prism
  - packages
source: "packages/shared/src/botCustomizerModels.ts"
status: "active"
---

# packages/shared/src/botCustomizerModels.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[03-packages/shared/src/botCustomizerModels.test.ts]]

## Source path
- `packages/shared/src/botCustomizerModels.ts`

## Import references
- _No imports detected_

## Source preview
```text
/**
 * Bot customizer Settings list includes every hosted model so users can opt in,
 * but embedding-only and vision-heavy stacks are **unchecked by default**.
 */

/**
 * Returns true when a catalog model id should be hidden from the bot composer
 * / customizer by default — embedding models and image/vision stacks.
 *
 * Checked users still appear in Settings; power users enable them explicitly.
 */
export function isBotCustomizerModelHiddenByDefault(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;

  if (/\bembedding\b/.test(id) || /\bembed\b/.test(id)) {
    return true;
  }

  if (
    /\bllava\b/.test(id) ||
    /\bbakllava\b/.test(id) ||
    /\bmoondream\b/.test(id) ||
    /\bminicpm-v\b/.test(id) ||
    /\bqwen[^\w]*(?:2\.?\d*-)?vl\b/.test(id) ||
    /\bllama[^\w]*[^\s]*vision\b/.test(id) ||
    /\b(?:llama|gemma)[^\w]*[^\s:-]*-vision\b/.test(id) ||
    /\bvision\b/.test(id) ||
    /\bvl-?\d/.test(id)
  ) {
    return true;
  }

  return false;
}

/**
 * Deduped, lexicographically sorted ids from merged local + online catalog ids.
 */
export function collectHiddenByDefaultModelIdsFromCatalog(
  localIds: readonly string[],
  onlineIds: readonly string[]
): string[] {
  const merged = [...localIds, ...onlineIds];
  const next = new Set<string>();
  for (const raw of merged) {
    const id = raw.trim();
    if (!id) continue

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
