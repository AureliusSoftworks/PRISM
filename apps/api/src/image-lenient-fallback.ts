/**
 * Heuristic gate for retrying image generation with the user's lenient local
 * image model (mirrors the spirit of chat copyright fallback — strict refusals
 * only, not generic network errors).
 */
export function shouldAttemptLenientLocalImageFallback(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (message.includes("warmup") || message.includes("503")) {
    return false;
  }
  return (
    message.includes("copyright") ||
    message.includes("content_policy") ||
    message.includes("content policy") ||
    message.includes("moderation") ||
    message.includes("moderated") ||
    message.includes("safety") ||
    message.includes("blocked") ||
    message.includes("disallowed") ||
    message.includes("violat") ||
    message.includes("rejected") ||
    message.includes("policy") ||
    message.includes("censored") ||
    message.includes("not allowed")
  );
}
