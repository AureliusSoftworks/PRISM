"use client";

import { useEffect } from "react";

// Strip native browser tooltips after hydration. Running this before React
// hydrates mutates SSR HTML (`title` -> `data-title`) and triggers warnings.
export function DisableNativeTooltips(): null {
  useEffect(() => {
    function stripTitle(el: Element | null): void {
      if (!el || !el.hasAttribute("title")) return;
      const value = el.getAttribute("title");
      if (value) el.setAttribute("data-title", value);
      el.removeAttribute("title");
    }

    function sweep(root: Element | Document): void {
      if (root instanceof Element) {
        stripTitle(root);
      }
      root.querySelectorAll("[title]").forEach(stripTitle);
    }

    sweep(document.documentElement);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "title") {
          stripTitle(mutation.target instanceof Element ? mutation.target : null);
        } else if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) sweep(node);
          });
        }
      }
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["title"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
