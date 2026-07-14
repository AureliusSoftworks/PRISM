"use client";

import { useEffect } from "react";
import { prismRenderPlatformForUserAgent } from "./renderPlatform";

export function RenderPlatformAttribute(): null {
  useEffect(() => {
    const root = document.documentElement;
    const platform = prismRenderPlatformForUserAgent(
      window.navigator.userAgent,
    );
    root.dataset.prismRenderPlatform = platform;

    return () => {
      if (root.dataset.prismRenderPlatform === platform) {
        delete root.dataset.prismRenderPlatform;
      }
    };
  }, []);

  return null;
}
