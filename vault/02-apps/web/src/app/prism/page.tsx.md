---
title: "apps/web/src/app/prism/page.tsx"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/web/src/app/prism/page.tsx"
status: "active"
---

# apps/web/src/app/prism/page.tsx

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/server-mac/DerivedData/Build/Products/Debug/Prism Server.app/Contents/Resources/runtime/apps/web/.next/standalone/apps/web/.next/server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_11sua-7.js]]
- [[02-apps/web/.next/server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_11sua-7.js]]
- [[02-apps/web/.next/standalone/apps/web/.next/server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_11sua-7.js]]

## Source path
- `apps/web/src/app/prism/page.tsx`

## Import references
- `next`
- `next/link`
- `./page.module.css`

## Source preview
```text
import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "PRISM | Local-first AI, softly held",
  description:
    "A calm landing page for PRISM, the local-first AI workspace built around privacy, clarity, and human-paced interaction.",
};

const pillars = [
  {
    eyebrow: "Local by default",
    title: "Your thinking stays close.",
    body: "PRISM treats private work as something to shelter, not something to harvest.",
  },
  {
    eyebrow: "Many voices",
    title: "Bots become lenses.",
    body: "Switch perspectives without losing the thread. Each assistant refracts the same work differently.",
  },
  {
    eyebrow: "Human pace",
    title: "Calm beats novelty.",
    body: "The interface favors legibility, small rituals, and decisions you can understand later.",
  },
] as const;

const workflow = [
  "Choose a lens",
  "Ask the room",
  "Compare the light",
  "Keep what helps",
] as const;

export default function PrismPage() {
  return (
    <main className={styles.pageShell}>
      <section className={styles.hero} aria-labelledby="prism-title">
        <div className={styles.orb} aria-hidden="true">
          <span />
        </div>

        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Local-first AI workspace</p>
          <h1 id="prism-title">

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
