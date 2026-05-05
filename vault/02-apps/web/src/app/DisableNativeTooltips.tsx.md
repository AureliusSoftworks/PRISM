---
title: "apps/web/src/app/DisableNativeTooltips.tsx"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/web/src/app/DisableNativeTooltips.tsx"
status: "active"
---

# apps/web/src/app/DisableNativeTooltips.tsx

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/server-mac/DerivedData/Build/Products/Debug/Prism Server.app/Contents/Resources/runtime/apps/web/.next/standalone/apps/web/.next/server/app/_not-found/page_client-reference-manifest.js]]
- [[02-apps/server-mac/DerivedData/Build/Products/Debug/Prism Server.app/Contents/Resources/runtime/apps/web/.next/standalone/apps/web/.next/server/app/page_client-reference-manifest.js]]
- [[02-apps/server-mac/DerivedData/Build/Products/Debug/Prism Server.app/Contents/Resources/runtime/apps/web/.next/standalone/apps/web/.next/server/app/prism/page_client-reference-manifest.js]]
- [[02-apps/server-mac/DerivedData/Build/Products/Debug/Prism Server.app/Contents/Resources/runtime/apps/web/.next/standalone/apps/web/.next/server/chunks/ssr/[root-of-the-server]__09px0e-._.js]]
- [[02-apps/web/.next/dev/server/app/_not-found/page_client-reference-manifest.js]]
- [[02-apps/web/.next/dev/server/app/page_client-reference-manifest.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/[root-of-the-server]__0i-fp1c._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/[root-of-the-server]__0nx7dj7._.js]]
- [[02-apps/web/.next/dev/static/chunks/apps_web_src_app_DisableNativeTooltips_tsx_0b4vfpw._.js]]
- [[02-apps/web/.next/server/app/_not-found/page_client-reference-manifest.js]]
- [[02-apps/web/.next/server/app/page_client-reference-manifest.js]]
- [[02-apps/web/.next/server/app/prism/page_client-reference-manifest.js]]
- [[02-apps/web/.next/server/chunks/ssr/[root-of-the-server]__09px0e-._.js]]
- [[02-apps/web/.next/standalone/apps/web/.next/server/app/_not-found/page_client-reference-manifest.js]]
- [[02-apps/web/.next/standalone/apps/web/.next/server/app/page_client-reference-manifest.js]]
- [[02-apps/web/.next/standalone/apps/web/.next/server/app/prism/page_client-reference-manifest.js]]
- [[02-apps/web/.next/standalone/apps/web/.next/server/chunks/ssr/[root-of-the-server]__09px0e-._.js]]
- [[02-apps/web/src/app/layout.tsx]]

## Source path
- `apps/web/src/app/DisableNativeTooltips.tsx`

## Import references
- `react`

## Source preview
```text
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

    return () => observer.d

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
