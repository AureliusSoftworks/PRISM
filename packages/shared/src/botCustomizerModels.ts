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
    if (!id) continue;
    if (isBotCustomizerModelHiddenByDefault(id)) {
      next.add(id);
    }
  }
  return Array.from(next).sort((a, b) => a.localeCompare(b));
}
