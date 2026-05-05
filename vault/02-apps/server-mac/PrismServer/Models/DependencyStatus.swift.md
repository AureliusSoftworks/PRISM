---
title: "apps/server-mac/PrismServer/Models/DependencyStatus.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Models/DependencyStatus.swift"
status: "active"
---

# apps/server-mac/PrismServer/Models/DependencyStatus.swift

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
- `apps/server-mac/PrismServer/Models/DependencyStatus.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

struct DependencyStatus: Equatable {
    var serverRuntime: PillarStatus
    var memoryEngine: PillarStatus
    var localAI: LocalAIPillarStatus

    static let unknown = DependencyStatus(
        serverRuntime: PillarStatus(
            name: "Server Runtime",
            isReady: false,
            detail: "Not checked yet."
        ),
        memoryEngine: PillarStatus(
            name: "Memory Engine",
            isReady: false,
            detail: "Not checked yet."
        ),
        localAI: LocalAIPillarStatus(
            ollama: PillarStatus(
                name: "Local AI Engine",
                isReady: false,
                detail: "Not checked yet."
            ),
            defaultModel: ModelSubstatus(
                name: "Default model",
                isReady: false,
                detail: "Not checked yet."
            ),
            embeddingModel: ModelSubstatus(
                name: "Embedding model",
                isReady: false,
                detail: "Not checked yet."
            )
        )
    )

    /// Prism's app plumbing requires the local chat and embedding models to be present.
    var canStartNodeRuntime: Bool {
        memoryEngine.isReady && localAI.isReady
    }
}

struct PillarStatus: Equatable, Identifiable {
    var id: String { name }
    let name: String
    let isReady: Bool
    let detail: String

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
