---
title: "docs/licensing-and-brand.md"
type: "note"
domain: "docs"
tags:
  - prism
  - docs
source: "docs/licensing-and-brand.md"
status: "active"
---

# docs/licensing-and-brand.md

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
- `docs/licensing-and-brand.md`

## Body preview
```markdown
# Prism Licensing And Brand Model

Prism should separate source transparency from the paid official Apple client.
The goal is to make the server auditable and community-friendly without giving
up the business model for the official frontend.

## Recommended Licensing Split

| Component | Recommended stance | Rationale |
| --- | --- | --- |
| Prism Server | Open source, likely AGPLv3 | The server is the trust anchor and contains the local-first data/runtime guarantees. AGPLv3 preserves reciprocity for networked modifications. |
| Existing web UI | Ship with the server unless later split | It is currently part of the self-hosted server experience and useful for setup/admin. |
| Official Prism iOS/Mac | Proprietary paid App Store app | This is the polished native frontend and primary commercial product. |
| Prism name, logos, icons, App Store copy | Protected brand assets | Forks and third-party clients should not appear official or reuse protected branding. |

This is not a full legal policy. Before public launch, the exact license files,
trademark notice, contributor terms, and App Store EULA should be reviewed by a
qualified attorney.

## Why Not Fully Open Source Everything

A true open-source license cannot reliably stop someone from building or
shipping a custom frontend that avoids paying for the official app. Open-source
licenses generally allow modification, redistribution, and commercial use.

If preventing competing frontends is more important than open-source status, the
project would need a source-available license instead. That is a valid strategy,
but it should not be described as open source.

## Why Not Block Third-Party Clients

Avoid server-side checks that only permit the official frontend.

Reasons:

- The server is local and source-visible, so lockout checks are easy to remove.
- DRM-style checks undermine the local-first trust story.
- They create support burden for legitimate self-hosted setups.
- They conflict with the product's privacy and user-agency posture.

The better moat is the official client experience: App Store convenience,
native polish, secure storage, pairing flow, updates, support, and brand trust.

## Brand Boundary

Allowed

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
