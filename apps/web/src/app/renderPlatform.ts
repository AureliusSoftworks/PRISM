export type PrismRenderPlatform = "windows" | "macos" | "other";

export function prismRenderPlatformForUserAgent(
  userAgent: string,
): PrismRenderPlatform {
  const normalized = userAgent.toLowerCase();
  if (normalized.includes("windows")) return "windows";
  if (normalized.includes("macintosh") || normalized.includes("mac os x")) {
    return "macos";
  }
  return "other";
}
