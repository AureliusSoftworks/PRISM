"use client";

import { useEffect, useState, type CSSProperties } from "react";

import {
  AVATAR_DETAILS_CANVAS_SIZE,
  avatarDetailsHasVisuals,
  avatarDetailsMaskCacheKey,
  normalizeAvatarDetailsColor,
  rasterizeAvatarDetailsAlpha,
  type AvatarDetailsFaceGeometry,
  type AvatarDetailsV1,
} from "./avatar-details";
import styles from "./avatar-details-mask.module.css";

const DERIVED_MASK_SIZE = 512;
const DERIVED_MASK_SCALE = DERIVED_MASK_SIZE / AVATAR_DETAILS_CANVAS_SIZE;
const DERIVED_MASK_CACHE_LIMIT = 128;

interface DerivedMaskCacheEntry {
  promise: Promise<string>;
  url: string | null;
  references: number;
}

const derivedMaskCache = new Map<string, DerivedMaskCacheEntry>();

function buildDerivedMaskUrl(alpha: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = DERIVED_MASK_SIZE;
    canvas.height = DERIVED_MASK_SIZE;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      reject(new Error("Avatar details mask canvas is unavailable."));
      return;
    }
    context.imageSmoothingEnabled = false;
    const pixels = context.createImageData(DERIVED_MASK_SIZE, DERIVED_MASK_SIZE);
    for (let y = 0; y < DERIVED_MASK_SIZE; y += 1) {
      const sourceY = Math.floor(y / DERIVED_MASK_SCALE);
      for (let x = 0; x < DERIVED_MASK_SIZE; x += 1) {
        const sourceX = Math.floor(x / DERIVED_MASK_SCALE);
        const sourceAlpha =
          alpha[sourceY * AVATAR_DETAILS_CANVAS_SIZE + sourceX] ?? 0;
        const index = (y * DERIVED_MASK_SIZE + x) * 4;
        pixels.data[index] = 255;
        pixels.data[index + 1] = 255;
        pixels.data[index + 2] = 255;
        pixels.data[index + 3] = sourceAlpha;
      }
    }
    context.putImageData(pixels, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Avatar details mask could not be encoded."));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

function evictUnusedDerivedMasks(): void {
  if (derivedMaskCache.size <= DERIVED_MASK_CACHE_LIMIT) return;
  for (const [key, entry] of derivedMaskCache) {
    if (derivedMaskCache.size <= DERIVED_MASK_CACHE_LIMIT) break;
    if (entry.references > 0) continue;
    derivedMaskCache.delete(key);
    if (entry.url) URL.revokeObjectURL(entry.url);
    else void entry.promise.then((url) => URL.revokeObjectURL(url), () => undefined);
  }
}

function acquireDerivedMask(key: string, alpha: Uint8Array): DerivedMaskCacheEntry {
  let entry = derivedMaskCache.get(key);
  if (!entry) {
    entry = {
      promise: buildDerivedMaskUrl(alpha),
      url: null,
      references: 0,
    };
    const created = entry;
    void created.promise.then(
      (url) => {
        created.url = url;
        evictUnusedDerivedMasks();
      },
      () => {
        if (derivedMaskCache.get(key) === created) derivedMaskCache.delete(key);
      }
    );
    derivedMaskCache.set(key, created);
  } else {
    derivedMaskCache.delete(key);
    derivedMaskCache.set(key, entry);
  }
  entry.references += 1;
  evictUnusedDerivedMasks();
  return entry;
}

function releaseDerivedMask(key: string, entry: DerivedMaskCacheEntry): void {
  if (derivedMaskCache.get(key) !== entry) return;
  entry.references = Math.max(0, entry.references - 1);
  evictUnusedDerivedMasks();
}

export interface AvatarDetailsMaskProps {
  details: AvatarDetailsV1 | null | undefined;
  color: string | null | undefined;
  faceGeometry?: Partial<AvatarDetailsFaceGeometry> | null;
}

/**
 * Shared color-independent 512px geometry mask for Studio, Zen, and Coffee.
 * Color is a CSS fill, so theme/accent changes do not regenerate the mask.
 */
export function AvatarDetailsMask({
  details,
  color,
  faceGeometry,
}: AvatarDetailsMaskProps): React.JSX.Element | null {
  const hasVisuals = avatarDetailsHasVisuals(details);
  const cacheKey = avatarDetailsMaskCacheKey(details, faceGeometry);
  const alpha = rasterizeAvatarDetailsAlpha(details, faceGeometry);
  const [maskState, setMaskState] = useState<{
    key: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!hasVisuals) return;
    let active = true;
    const entry = acquireDerivedMask(cacheKey, alpha);
    void entry.promise.then(
      (url) => {
        if (active) setMaskState({ key: cacheKey, url });
      },
      () => undefined
    );
    return () => {
      active = false;
      releaseDerivedMask(cacheKey, entry);
    };
  }, [alpha, cacheKey, hasVisuals]);

  const maskUrl = maskState?.key === cacheKey ? maskState.url : null;
  if (!hasVisuals || !maskUrl) return null;

  const normalizedColor = normalizeAvatarDetailsColor(color);
  const style = {
    color: normalizedColor,
    backgroundColor: normalizedColor,
    WebkitMaskImage: `url("${maskUrl}")`,
    maskImage: `url("${maskUrl}")`,
  } as CSSProperties;

  return (
    <span
      className={styles.mask}
      style={style}
      data-avatar-details-mask="true"
      data-avatar-details-rendering="nearest-neighbor"
      data-avatar-details-mask-size={DERIVED_MASK_SIZE}
      aria-hidden="true"
    />
  );
}
