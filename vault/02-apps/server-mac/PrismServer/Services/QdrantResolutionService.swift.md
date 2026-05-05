---
title: "apps/server-mac/PrismServer/Services/QdrantResolutionService.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Services/QdrantResolutionService.swift"
status: "active"
---

# apps/server-mac/PrismServer/Services/QdrantResolutionService.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/PrismServer.build/Debug/PrismServer.build/Objects-normal/arm64/PrismServer-OutputFileMap.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/15d942463412e871a6f6db3384db769c.xcbuilddata/manifest.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/93131244019e5baedc52f075830d2734.xcbuilddata/manifest.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/bce97c8af3125aa1bdfa2b4cd95ca3ca.xcbuilddata/manifest.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/c39f50e08ee72329e41a44a60a47f21d.xcbuilddata/manifest.json]]

## Source path
- `apps/server-mac/PrismServer/Services/QdrantResolutionService.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

/// How Prism should treat the Qdrant process for start/stop and UI copy.
enum QdrantOwnership: String, Equatable, Sendable {
    case managedByPrism
    case externalUserManaged
}

/// Resolved at runtime so UI, Node `QDRANT_URL`, and lifecycle agree (single source of truth).
struct QdrantResolution: Equatable, Sendable {
    let ownership: QdrantOwnership
    /// Value passed to child processes as `QDRANT_URL` (may differ from `ServerConfig` when Prism manages a sidecar).
    let effectiveQdrantURL: String
}

enum QdrantResolutionService {
    /// Prism `external` if Qdrant is already up at the effective URL; otherwise Prism will spawn a **managed** sidecar on the default local port.
    static func resolve(config: ServerConfig) async -> QdrantResolution {
        let nConfig = QdrantURL.normalize(config.qdrantURL)
        let nDefault = QdrantURL.normalize(ServerConfig.defaults.qdrantURL)
        if nConfig != nDefault, await isReadyzReachable(base: nConfig) {
            return QdrantResolution(ownership: .externalUserManaged, effectiveQdrantURL: nConfig)
        }
        // Pre-existing Qdrant on the default address (Docker, another install): use it; do not start a second.
        if nConfig == nDefault, await isReadyzReachable(base: nDefault) {
            return QdrantResolution(ownership: .externalUserManaged, effectiveQdrantURL: nDefault)
        }

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
