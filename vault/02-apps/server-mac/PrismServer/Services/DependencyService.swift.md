---
title: "apps/server-mac/PrismServer/Services/DependencyService.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Services/DependencyService.swift"
status: "active"
---

# apps/server-mac/PrismServer/Services/DependencyService.swift

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
- `apps/server-mac/PrismServer/Services/DependencyService.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

/// Checks product-facing readiness: Memory Engine (Qdrant), then Local AI (Ollama + default model).
final class DependencyService {
    private struct TagsResponse: Decodable {
        var models: [ModelEntry]
    }
    private struct ModelEntry: Decodable {
        var name: String
    }

    func check(config: ServerConfig, resolution: QdrantResolution) async -> DependencyStatus {
        let ollamaBase = OllamaURL.normalizeBase(config.ollamaHost)
        let (tags, ollamaReachable) = await requestOllamaModelNames(ollamaBase: ollamaBase)
        let local = localAIPillar(
            config: config,
            ollamaHost: ollamaBase,
            tags: tags,
            ollamaReachable: ollamaReachable
        )
        let mem = await memoryPillar(resolution: resolution)
        let server = PillarStatus(
            name: "Server Runtime",
            isReady: mem.isReady,
            detail: mem.isReady
                ? "The local API, discovery, and pairing surface are ready to start."
                : "The Memory Engine must be available before the server can run."
        )
        return DependencyStatus(
            serverRuntime: server,
            memoryEngine: mem,
            localAI: local
        )
    }

    private func memoryPillar(resolution: QdrantResolution) async -> PillarStatus {
        switch resolution.ownership {
        case .

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
