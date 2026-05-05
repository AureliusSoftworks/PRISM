---
title: "apps/web/package.json"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/web/package.json"
status: "active"
---

# apps/web/package.json

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- _No backlinks yet_

## Source path
- `apps/web/package.json`

## Import references
- _No imports detected_

## Source preview
```text
{
  "name": "@localai/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "predev": "npm --prefix ../../packages/shared run build",
    "prebuild": "npm --prefix ../../packages/shared run build",
    "dev": "next dev -p 18788",
    "build": "next build",
    "start": "PORT=18788 node .next/standalone/apps/web/server.js",
    "lint": "eslint",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@localai/shared": "file:../../packages/shared",
    "@tiptap/extension-link": "^3.22.4",
    "@tiptap/extension-placeholder": "^3.22.4",
    "@tiptap/markdown": "^3.22.4",
    "@tiptap/react": "^3.22.4",
    "@tiptap/starter-kit": "^3.22.4",
    "lucide-react": "^1.12.0",
    "next": "16.2.3",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.3",
    "typescript": "^5"
  }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
