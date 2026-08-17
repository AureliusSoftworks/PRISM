import type { CoffeeGroupSoundtrack } from "@localai/shared";

export const COFFEE_SOUNDTRACK_SAMPLE_RELEASE_MS = 320;

export function coffeeGroupSoundtrackAudioUrl(
  groupId: string,
  soundtrack: CoffeeGroupSoundtrack | null | undefined,
): string | null {
  if (soundtrack?.status !== "ready" || soundtrack.revision < 1) return null;
  return `/api/coffee/groups/${encodeURIComponent(groupId)}/soundtrack/audio?revision=${soundtrack.revision}`;
}

export function coffeeGroupSoundtrackPlaybackUrl(args: {
  groupId: string | null | undefined;
  soundtrack: CoffeeGroupSoundtrack | null | undefined;
  fallbackUrl: string | null;
  source?: "fallback" | "custom";
}): string | null {
  if (args.source !== "custom") return args.fallbackUrl;
  return args.groupId
    ? coffeeGroupSoundtrackAudioUrl(args.groupId, args.soundtrack) ??
        args.fallbackUrl
    : args.fallbackUrl;
}

export function coffeeGroupSoundtrackStatusLabel(
  soundtrack: CoffeeGroupSoundtrack | null | undefined,
): string {
  if (soundtrack?.generating) return soundtrack.revision > 0 ? "Regenerating" : "Generating";
  if (soundtrack?.status === "ready") return "Custom track ready";
  if (soundtrack?.status === "preparing") return "Preparing";
  return "Bundled Jazz fallback";
}
