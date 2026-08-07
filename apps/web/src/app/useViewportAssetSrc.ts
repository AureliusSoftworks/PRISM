"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps decoded image bitmaps out of memory while off-screen.
 * On-screen: returns the preferred src (usually a thumb URL).
 * Off-screen: returns null so the browser can drop the decode.
 */
export function useViewportAssetSrc(
  preferredSrc: string | null | undefined,
  options?: { rootMargin?: string },
): {
  src: string | undefined;
  imgRef: (node: HTMLImageElement | null) => void;
  inView: boolean;
} {
  const [inView, setInView] = useState(false);
  const nodeRef = useRef<HTMLImageElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const imgRef = (node: HTMLImageElement | null): void => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    nodeRef.current = node;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(Boolean(node));
      return;
    }
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setInView(Boolean(entry?.isIntersecting));
      },
      { root: null, rootMargin: options?.rootMargin ?? "120px 0px", threshold: 0.01 },
    );
    observerRef.current.observe(node);
  };

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  const trimmed = preferredSrc?.trim() || undefined;
  return {
    src: inView ? trimmed : undefined,
    imgRef,
    inView,
  };
}
