"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Decide whether a viewport-unload observer should keep the image `src`.
 * Zero-size leave events must stay loaded — clearing `src` collapses
 * percentage-sized library thumbs and they never intersect again.
 */
export function viewportAssetSrcShouldStayLoaded(args: {
  isIntersecting: boolean;
  width: number;
  height: number;
}): boolean {
  if (args.isIntersecting) return true;
  if (args.width < 1 || args.height < 1) return true;
  return false;
}

/**
 * Keeps decoded image bitmaps out of memory while off-screen.
 *
 * Starts visible so library tiles paint on first mount. Never clears `src`
 * while the observed node has a zero-size box — otherwise removing `src`
 * collapses percentage-sized `<img>`s and IntersectionObserver can never
 * report them intersecting again (permanent blank thumbs).
 */
export function useViewportAssetSrc(
  preferredSrc: string | null | undefined,
  options?: { rootMargin?: string; root?: Element | null },
): {
  src: string | undefined;
  imgRef: (node: HTMLImageElement | null) => void;
  inView: boolean;
} {
  const [inView, setInView] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const imgRef = (node: HTMLImageElement | null): void => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    // Detach only — do not flip inView false here. React Strict Mode and
    // list remounts call ref(null) between commits; clearing src then leaves
    // percentage-height images at 0×0 forever.
    if (!node) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.boundingClientRect;
        setInView(
          viewportAssetSrcShouldStayLoaded({
            isIntersecting: entry.isIntersecting,
            width,
            height,
          }),
        );
      },
      {
        root: options?.root ?? null,
        rootMargin: options?.rootMargin ?? "160px 0px",
        threshold: 0,
      },
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
