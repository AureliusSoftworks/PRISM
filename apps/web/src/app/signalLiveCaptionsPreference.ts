import {
  readLiveCaptionSize,
  writeLiveCaptionSize,
  type LiveCaptionSize,
} from "./liveCaptionSize.ts";

export const SIGNAL_LIVE_CAPTIONS_STORAGE_KEY =
  "prism.signal.live-captions.v1";

export const SIGNAL_LIVE_CAPTION_SIZE_STORAGE_KEY =
  "prism.signal.live-caption-size.v1";

export const DEFAULT_SIGNAL_LIVE_CAPTIONS_ENABLED = true;

type SignalLiveCaptionsStorage = Pick<Storage, "getItem" | "setItem">;

/** Captions stay on unless the player explicitly saved "off". */
export function normalizeSignalLiveCaptionsEnabled(
  value: unknown,
): boolean {
  if (value === "0" || value === "false" || value === false || value === 0) {
    return false;
  }
  if (value === "1" || value === "true" || value === true || value === 1) {
    return true;
  }
  return DEFAULT_SIGNAL_LIVE_CAPTIONS_ENABLED;
}

export function readSignalLiveCaptionsEnabled(
  storage: Pick<SignalLiveCaptionsStorage, "getItem"> | null | undefined,
): boolean {
  if (!storage) return DEFAULT_SIGNAL_LIVE_CAPTIONS_ENABLED;
  try {
    return normalizeSignalLiveCaptionsEnabled(
      storage.getItem(SIGNAL_LIVE_CAPTIONS_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_SIGNAL_LIVE_CAPTIONS_ENABLED;
  }
}

export function writeSignalLiveCaptionsEnabled(
  storage: Pick<SignalLiveCaptionsStorage, "setItem"> | null | undefined,
  enabled: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      SIGNAL_LIVE_CAPTIONS_STORAGE_KEY,
      enabled ? "1" : "0",
    );
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

export function readSignalLiveCaptionSize(
  storage: Pick<SignalLiveCaptionsStorage, "getItem"> | null | undefined,
): LiveCaptionSize {
  return readLiveCaptionSize(storage, SIGNAL_LIVE_CAPTION_SIZE_STORAGE_KEY);
}

export function writeSignalLiveCaptionSize(
  storage: Pick<SignalLiveCaptionsStorage, "setItem"> | null | undefined,
  size: LiveCaptionSize,
): void {
  writeLiveCaptionSize(storage, SIGNAL_LIVE_CAPTION_SIZE_STORAGE_KEY, size);
}
