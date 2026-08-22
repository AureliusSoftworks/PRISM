"use client";

import { useEffect } from "react";

const TITLE_SWEEP_CHUNK_SIZE = 4;

// Strip native browser tooltips after hydration. Running this before React
// hydrates mutates SSR HTML (`title` -> `data-title`) and triggers warnings.
export function DisableNativeTooltips(): null {
  useEffect(() => {
    const pendingTitles = new Set<Element>();
    let sweepFrame: number | null = null;

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

    function flushPendingTitles(): void {
      sweepFrame = null;
      let processed = 0;
      for (const element of pendingTitles) {
        pendingTitles.delete(element);
        stripTitle(element);
        processed += 1;
        if (processed >= TITLE_SWEEP_CHUNK_SIZE) break;
      }
      if (pendingTitles.size > 0) {
        sweepFrame = window.requestAnimationFrame(flushPendingTitles);
      }
    }

    function schedulePendingTitleSweep(): void {
      if (sweepFrame !== null || pendingTitles.size === 0) return;
      sweepFrame = window.requestAnimationFrame(flushPendingTitles);
    }

    function queueTitle(element: Element | null): void {
      if (!element?.hasAttribute("title")) return;
      pendingTitles.add(element);
      schedulePendingTitleSweep();
    }

    function queueTitleTree(root: Element): void {
      if (root.hasAttribute("title")) pendingTitles.add(root);
      root
        .querySelectorAll("[title]")
        .forEach((element) => pendingTitles.add(element));
      schedulePendingTitleSweep();
    }

    sweep(document.documentElement);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "title"
        ) {
          queueTitle(
            mutation.target instanceof Element ? mutation.target : null,
          );
        } else if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) queueTitleTree(node);
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

    return () => {
      observer.disconnect();
      pendingTitles.clear();
      if (sweepFrame !== null) window.cancelAnimationFrame(sweepFrame);
    };
  }, []);

  return null;
}
