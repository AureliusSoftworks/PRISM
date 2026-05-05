---
title: "docs/mobile-api-contract.md"
type: "note"
domain: "docs"
tags:
  - prism
  - docs
source: "docs/mobile-api-contract.md"
status: "active"
---

# docs/mobile-api-contract.md

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/server.ts]]
- [[02-apps/web/next.config.ts]]
- [[03-packages/shared/src/index.ts]]

## Referenced by
- [[04-docs/DESIGN.md]]
- [[04-docs/README.md]]

## Source path
- `docs/mobile-api-contract.md`

## Body preview
```markdown
# Prism Mobile API Contract

This document defines the server contract for official Prism iOS/Mac clients.
The server remains the source of truth for accounts, memory, provider routing,
chat history, bots, exports, and local-first guarantees.

## Current Boundary

The current backend is `apps/api/src/server.ts`. It exposes a JSON HTTP API
under `/api/*`, backed by SQLite, Qdrant, Ollama, and optional OpenAI access.
The existing web frontend reaches the API through the Next.js rewrite in
`apps/web/next.config.ts`; native clients should call the configured Prism
Server base URL directly.

Example native base URL:

```text
http://prism-server.local:18787/api
```

The current route inventory is:

| Area | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `DELETE /api/account` |
| Pairing | `POST /api/pairing/codes`, `POST /api/pairing/exchange` |
| Conversations | `GET /api/conversations`, `GET /api/conversations/:id`, `DELETE /api/conversations/:id`, `DELETE /api/conversations`, `POST /api/conversations/:id/rewind`, `POST /api/conversations/:id/fork` |
| Chat | `POST /api/chat` |
| Memories | `GET /api/memories`, `DELETE /api/memories/:id` |
| Settings and models | `GET /api/settings`, `PATCH /api/settings`, `GET /api/models` |
| Backup | `GET /api/backup/export`, `POST /api/backup/import`, `GET /api/backup/versions` |
| Images | `POST /api/images/generate`, `GET /api/images` |
| Bots | `POST /api/bots`, `GET /api/bots`, `PATCH /api/bots/:id`, `DELETE /api/bots/:id`, `DELETE /api/bots` |
| Exports | `POST /api/conversations/:id/export`, `GET /api/exports`, `GET /api/exports/:id` |

`packages/shared/src/index.ts` contains the TypeScript DTOs that should anchor
the mobile model layer. The first mobile pass should translate these types into
Swift models rather than duplicating server logic on-device.

## Authentication Model

Today, the web app authenticates with an HttpOnly session cookie. Native clients
can technically use cookie storage, but the official mobile contract should add
a parallel bearer-session path:

```http
Authorization: Bearer <session-token>

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
