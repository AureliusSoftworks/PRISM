import {
  readLiveCaptionSize,
  writeLiveCaptionSize,
  type LiveCaptionSize,
} from "./liveCaptionSize.ts";

export const DEBATE_LIVE_CAPTIONS_STORAGE_KEY =
  "prism.debate.live-captions.v1";

export const DEBATE_LIVE_CAPTION_SIZE_STORAGE_KEY =
  "prism.debate.live-caption-size.v1";

export const DEFAULT_DEBATE_LIVE_CAPTIONS_ENABLED = true;

type DebateLiveCaptionsStorage = Pick<Storage, "getItem" | "setItem">;

/** Captions stay on unless the player explicitly saved "off". */
export function normalizeDebateLiveCaptionsEnabled(
  value: unknown,
): boolean {
  if (value === "0" || value === "false" || value === false || value === 0) {
    return false;
  }
  if (value === "1" || value === "true" || value === true || value === 1) {
    return true;
  }
  return DEFAULT_DEBATE_LIVE_CAPTIONS_ENABLED;
}

export function readDebateLiveCaptionsEnabled(
  storage: Pick<DebateLiveCaptionsStorage, "getItem"> | null | undefined,
): boolean {
  if (!storage) return DEFAULT_DEBATE_LIVE_CAPTIONS_ENABLED;
  try {
    return normalizeDebateLiveCaptionsEnabled(
      storage.getItem(DEBATE_LIVE_CAPTIONS_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_DEBATE_LIVE_CAPTIONS_ENABLED;
  }
}

export function writeDebateLiveCaptionsEnabled(
  storage: Pick<DebateLiveCaptionsStorage, "setItem"> | null | undefined,
  enabled: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      DEBATE_LIVE_CAPTIONS_STORAGE_KEY,
      enabled ? "1" : "0",
    );
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

export function readDebateLiveCaptionSize(
  storage: Pick<DebateLiveCaptionsStorage, "getItem"> | null | undefined,
): LiveCaptionSize {
  return readLiveCaptionSize(storage, DEBATE_LIVE_CAPTION_SIZE_STORAGE_KEY);
}

export function writeDebateLiveCaptionSize(
  storage: Pick<DebateLiveCaptionsStorage, "setItem"> | null | undefined,
  size: LiveCaptionSize,
): void {
  writeLiveCaptionSize(storage, DEBATE_LIVE_CAPTION_SIZE_STORAGE_KEY, size);
}
