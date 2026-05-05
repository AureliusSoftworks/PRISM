---
title: "docs/production-readiness-gate.md"
type: "note"
domain: "docs"
tags:
  - prism
  - docs
source: "docs/production-readiness-gate.md"
status: "active"
---

# docs/production-readiness-gate.md

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[04-docs/README.md]]
- [[04-docs/docs/release-process.md]]

## Source path
- `docs/production-readiness-gate.md`

## Body preview
```markdown
# Prism Production Readiness Gate

This gate defines the minimum bar before promoting the recent pairing and LAN
discovery work beyond local validation.

Current scope covered by this gate:

- Bearer + cookie session compatibility
- Pairing code generation/exchange
- LAN discovery (`_prism._tcp`) advertisement
- Server readiness metadata (`GET /api/health`)

## Why this gate exists

Local smoke tests already passed. Production-like environments can still fail
for reasons that do not appear locally (network topology, proxying, mDNS
behavior, configuration drift, and rollback readiness).

This document is the required checkpoint before broad rollout.

## Exit Criteria

All items below must be satisfied.

### 1) Configuration and topology

- `PRISM_SERVER_NAME`, `PRISM_DISCOVERY_ENABLED`, and `API_PORT` are explicitly
  set and documented in the deployment target.
- Deployment path is identified as one of:
  - Native/bare-metal host where mDNS is expected to work
  - Docker/bridge where mDNS may not propagate and manual URL fallback is the
    expected path
- Reverse proxy and CORS behavior are verified for direct native API access.

### 2) Security and pairing invariants

- Pairing code is confirmed short-lived and single-use in the target runtime.
- Pairing exchange rejects reused and expired codes.
- Session token behavior is validated for both:
  - `Authorization: Bearer <token>`
  - Existing web cookie session
- Logs and release notes avoid exposing pairing codes or session tokens.

### 3) Discovery behavior and privacy

- Discovery can be disabled via `PRISM_DISCOVERY_ENABLED=false`.
- Advertised service shape is verified:
  - service type `_prism._tcp`
  - expected server name
  - expected API port
  - expected TXT records (`api`, `version`, `pairing`, `tls`)
- Manual URL entry fallback is documented for mDNS-hostile networks (VPN,
  captive portals, isolated VLANs, Docker bridge-only exposure).

### 4) Operational safety

- Startup and shutdown behavior is verified: discovery starts with API listen
  and unregisters on shutdown.
- Health endpoint is reachable and returns expected readiness metadata.
- A rollback path is written down and tested:
  - disable

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
