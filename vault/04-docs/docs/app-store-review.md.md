---
title: "docs/app-store-review.md"
type: "note"
domain: "docs"
tags:
  - prism
  - docs
source: "docs/app-store-review.md"
status: "active"
---

# docs/app-store-review.md

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[04-docs/DESIGN.md]]
- [[04-docs/README.md]]

## Source path
- `docs/app-store-review.md`

## Body preview
```markdown
# Prism App Store Review Checklist

This checklist prepares the official Prism iOS/Mac client for App Store review.
The app should be submitted as a native companion client for a required
user-controlled Prism Server.

## App Metadata

Required positioning:

- Prism is a private AI client for a user-controlled Prism Server.
- Prism Server is required for normal use.
- The server may run on Mac, Windows, or Linux.
- The official Apple client is the paid, polished native frontend.
- User chat data and memory live on the user's server unless the user configures
  optional online provider features.

Avoid implying:

- The iOS app runs local LLMs on-device.
- The app is a standalone cloud AI service.
- The app can function fully without Prism Server.

## Notes For Review

Review notes should include:

- A live demo Prism Server URL or a built-in full-feature demo mode.
- Demo credentials or pairing instructions.
- A short explanation of why Local Network permission is requested.
- Steps for manual host entry if discovery is not available in the review
  environment.
- A description of what data is stored on-device versus on the Prism Server.
- A note that LOCAL provider mode routes through the user's configured local
  provider and ONLINE mode may use OpenAI only when configured server-side.

## Demo Access

App Review must be able to test without building the whole self-hosted stack.
Provide one of:

1. **Hosted demo server**: a temporary Prism Server instance reachable from
   Apple review devices.
2. **Demo mode**: an in-app mode that exercises the full UI with bundled or
   mock data and clearly indicates that it is a demo.

The hosted demo server is closer to production behavior because it validates
pairing, auth, and API calls. Demo mode is useful if external server access is
unreliable during review.

## Native Differentiators

To avoid looking like a repackaged website, the client should visibly include
native Apple-platform behavior:

- SwiftUI navigation and native list/detail layouts.
- Keychain-backed session storage.
- Face ID/Touch ID app lock.
- Local Network discovery UI.
- QR-code or pairing-code flow.
- Native error states for offline server, expire

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
