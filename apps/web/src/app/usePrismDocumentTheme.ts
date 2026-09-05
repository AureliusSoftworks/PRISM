"use client";

import { useEffect, useState } from "react";
import {
  currentPrismDocumentTheme,
  type PrismResolvedDocumentTheme,
} from "./prismDocumentTheme.ts";

/**
 * Follow the canonical pre-painted body theme from independently rendered
 * portal surfaces. The lazy first read is deliberate: these surfaces do not
 * paint on the server, so their first browser render can match the body marker
 * without waiting for an effect and briefly showing the Dark material.
 */
export function usePrismDocumentTheme(): PrismResolvedDocumentTheme {
  const [resolvedTheme, setResolvedTheme] =
    useState<PrismResolvedDocumentTheme>(() => currentPrismDocumentTheme());

  useEffect(() => {
    const updateTheme = (): void => {
      setResolvedTheme(currentPrismDocumentTheme());
    };
    updateTheme();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-prism-theme"],
    });
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateTheme);
    } else {
      media.addListener?.(updateTheme);
    }
    window.addEventListener("storage", updateTheme);

    return () => {
      observer.disconnect();
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", updateTheme);
      } else {
        media.removeListener?.(updateTheme);
      }
      window.removeEventListener("storage", updateTheme);
    };
  }, []);

  return resolvedTheme;
}
