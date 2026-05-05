---
title: "apps/web/src/app/manifest.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/web/src/app/manifest.ts"
status: "active"
---

# apps/web/src/app/manifest.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/web/.next/dev/server/chunks/[root-of-the-server]__0d6k.ok._.js]]

## Source path
- `apps/web/src/app/manifest.ts`

## Import references
- `next`

## Source preview
```text
import type { MetadataRoute } from "next";

/**
 * Web app manifest so “Install app” / Add to Home Screen picks up Prism client artwork.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prism",
    short_name: "Prism",
    description: "Local-first AI playground with per-account isolation.",
    start_url: "/",
    display: "standalone",
    background_color: "#111827",
    theme_color: "#111827",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
