---
title: "apps/web/src/app/layout.tsx"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/web/src/app/layout.tsx"
status: "active"
---

# apps/web/src/app/layout.tsx

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/web/src/app/DisableNativeTooltips.tsx]]

## Referenced by
- [[02-apps/server-mac/DerivedData/Build/Products/Debug/Prism Server.app/Contents/Resources/runtime/apps/web/.next/standalone/apps/web/.next/server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_0bevyts.js]]
- [[02-apps/server-mac/DerivedData/Build/Products/Debug/Prism Server.app/Contents/Resources/runtime/apps/web/.next/standalone/apps/web/.next/server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_0gnerfm.js]]
- [[02-apps/server-mac/DerivedData/Build/Products/Debug/Prism Server.app/Contents/Resources/runtime/apps/web/.next/standalone/apps/web/.next/server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_11sua-7.js]]
- [[02-apps/web/.next/dev/server/app/_not-found/page.js]]
- [[02-apps/web/.next/dev/server/app/page.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/[root-of-the-server]__0nx7dj7._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/[root-of-the-server]__0ucu--7._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/node_modules_0ay7~57._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/node_modules_0g4r0kb._.js]]
- [[02-apps/web/.next/server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_0bevyts.js]]
- [[02-apps/web/.next/server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_0gnerfm.js]]
- [[02-apps/web/.next/server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_11sua-7.js]]
- [[02-apps/web/.next/standalone/apps/web/.next/server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_0bevyts.js]]
- [[02-apps/web/.next/standalone/apps/web/.next/server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_0gnerfm.js]]
- [[02-apps/web/.next/standalone/apps/web/.next/server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_11sua-7.js]]

## Source path
- `apps/web/src/app/layout.tsx`

## Import references
- `next`
- `next/font/google`
- `./DisableNativeTooltips`
- `./globals.css`

## Source preview
```text
import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans, Raleway } from "next/font/google";
import { DisableNativeTooltips } from "./DisableNativeTooltips";
import "./globals.css";

const uiSans = Instrument_Sans({
  variable: "--font-ui-sans",
  subsets: ["latin"],
});

const titleSans = Raleway({
  variable: "--font-title-sans",
  subsets: ["latin"],
  weight: ["300"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prism",
  description: "Local-first AI playground with per-account isolation.",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Prism",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${uiSans.variable} ${titleSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <DisableNativeT

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
