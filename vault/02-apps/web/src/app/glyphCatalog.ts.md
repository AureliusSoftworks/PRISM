---
title: "apps/web/src/app/glyphCatalog.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/web/src/app/glyphCatalog.ts"
status: "active"
---

# apps/web/src/app/glyphCatalog.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/web/.next/dev/server/chunks/ssr/[root-of-the-server]__0-qb1if._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/[root-of-the-server]__0rip54u._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/apps_web_src_app_0e7n9on._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/apps_web_src_app_0q.i~oz._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/apps_web_src_app_page_tsx_0kq.zh9._.js]]
- [[02-apps/web/.next/dev/static/chunks/_0d3xlyf._.js]]
- [[02-apps/web/.next/dev/static/chunks/_0is1kd_._.js]]
- [[02-apps/web/.next/dev/static/chunks/apps_web_src_app_074-8yu._.js]]
- [[02-apps/web/.next/dev/static/chunks/apps_web_src_app_0pbeu2t._.js]]
- [[02-apps/web/.next/dev/static/chunks/apps_web_src_app_page_tsx_0c644d_._.js]]
- [[02-apps/web/src/app/page.tsx]]

## Source path
- `apps/web/src/app/glyphCatalog.ts`

## Import references
- `lucide-react`

## Source preview
```text
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type BotGlyphCategoryId =
  | "original"
  | "core"
  | "tools"
  | "tech"
  | "nature"
  | "animals"
  | "celestial"
  | "food"
  | "travel"
  | "shapes"
  | "sports"
  | "music"
  | "objects"
  | "symbols"
  | "time";

interface LucideGlyphGroup {
  id: Exclude<BotGlyphCategoryId, "original">;
  label: string;
  icons: readonly string[];
}

export interface LucideBotGlyphDefinition {
  label: string;
  category: BotGlyphCategoryId;
  icon: LucideIcon;
}

const iconComponents = LucideIcons as unknown as Record<string, LucideIcon | undefined>;
const fallbackIcon = LucideIcons.CircleHelp as LucideIcon;

function icons(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function glyphIdForIcon(iconName: string): string {
  return `lucide${iconName}`;
}

function labelForIcon(iconName: string): string {
  return iconName
    // Strip trailing variant digits (Clock1-12, Music2-4, Volume1-2, Dice1-6,
    // etc.) so tooltips don't surface internal Lucide variant suffixes; the
    // visual glyph still distinguishes variants in the picker.
    .replace(/(\D)\d+$/, "$1")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\bXml\b/g, "XML")
    .replace(/\bCpu\b/g, "CPU")
    .replace(/\bUsb\b/g, "USB")

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
