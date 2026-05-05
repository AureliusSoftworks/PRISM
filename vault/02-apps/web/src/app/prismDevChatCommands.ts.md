---
title: "apps/web/src/app/prismDevChatCommands.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/web/src/app/prismDevChatCommands.ts"
status: "active"
---

# apps/web/src/app/prismDevChatCommands.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/web/.next/dev/server/chunks/ssr/[root-of-the-server]__0rip54u._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/apps_web_src_app_0q.i~oz._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/apps_web_src_app_page_tsx_0kq.zh9._.js]]
- [[02-apps/web/.next/dev/static/chunks/_0d3xlyf._.js]]
- [[02-apps/web/.next/dev/static/chunks/apps_web_src_app_074-8yu._.js]]
- [[02-apps/web/.next/dev/static/chunks/apps_web_src_app_page_tsx_0c644d_._.js]]
- [[02-apps/web/src/app/page.tsx]]

## Source path
- `apps/web/src/app/prismDevChatCommands.ts`

## Import references
- _No imports detected_

## Source preview
```text
/**
 * Prism web composer commands: lines starting with `/dev` are intercepted
 * client-side only (never POSTed to `/api/chat`).
 */

/** True in `next dev` / non-production builds, or when explicitly opted in via env. */
export const PRISM_WEB_DEV_CHAT_COMMANDS_ENABLED =
  process.env.NODE_ENV !== "production" ||
  (typeof process.env.NEXT_PUBLIC_PRISM_DEV_COMMANDS === "string" &&
    (process.env.NEXT_PUBLIC_PRISM_DEV_COMMANDS === "1" ||
      process.env.NEXT_PUBLIC_PRISM_DEV_COMMANDS.toLowerCase() === "true"));

export function isPrismDevChatCommandLine(line: string): boolean {
  if (!PRISM_WEB_DEV_CHAT_COMMANDS_ENABLED) return false;
  return looksLikePrismDevComposerCommand(line);
}

/** True for `/dev` + space or EOS — ignores the env toggle (caller decides how to react). */
export function looksLikePrismDevComposerCommand(line: string): boolean {
  const t = line.trimStart();
  return /^\/dev(?:\s|$)/i.test(t);
}

export type ParsedPrismDevChatCommand =
  | { kind: "help" }
  | { kind: "askquestion" }
  | { kind: "unknown"; token: string };

export function parsePrismDevChatCommand(trimmedLine: string): ParsedPrismDevChatCommand | null {
  if (!PRISM_WEB_DEV_CHAT_COMMANDS_ENABLED) return null;
  const t = trimmedLine.trimStart();
  if (!/^\/dev(?:\s|$)/i.test(t)) return null;
  const rest = t.slice(4).trim();
  if (rest.length === 0) return { kind: "help" };
  const he

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
