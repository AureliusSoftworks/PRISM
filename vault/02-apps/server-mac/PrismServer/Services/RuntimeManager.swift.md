---
title: "apps/server-mac/PrismServer/Services/RuntimeManager.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Services/RuntimeManager.swift"
status: "active"
---

# apps/server-mac/PrismServer/Services/RuntimeManager.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/web/.next/standalone/apps/web/server.js]]

## Referenced by
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/PrismServer.build/Debug/PrismServer.build/Objects-normal/arm64/PrismServer-OutputFileMap.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/15d942463412e871a6f6db3384db769c.xcbuilddata/manifest.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/93131244019e5baedc52f075830d2734.xcbuilddata/manifest.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/bce97c8af3125aa1bdfa2b4cd95ca3ca.xcbuilddata/manifest.json]]
- [[02-apps/server-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/c39f50e08ee72329e41a44a60a47f21d.xcbuilddata/manifest.json]]

## Source path
- `apps/server-mac/PrismServer/Services/RuntimeManager.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

final class RuntimeManager {
    var onStateChange: ((RuntimeState) -> Void)?

    private let configStore: ConfigStore
    private let qdrantManager: QdrantManager
    private var apiProcess: Process?
    private var webProcess: Process?
    private var apiLogHandle: FileHandle?
    private var webLogHandle: FileHandle?
    private var apiLogPipe: Pipe?
    private var webLogPipe: Pipe?
    private let startsBundledWebDashboard = true

    init(configStore: ConfigStore) {
        self.configStore = configStore
        self.qdrantManager = QdrantManager(configStore: configStore)
    }

    func startMemoryEngine(resolution: QdrantResolution) async throws {
        try FileManager.default.createDirectory(at: configStore.logDirectory, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: configStore.applicationSupportDirectory, withIntermediateDirectories: true)
        try await qdrantManager.startIfNeeded(resolution: resolution)
    }

    func start(config: ServerConfig, resolution: QdrantResolution) async throws {
        guard apiProcess == nil, webProcess == nil else {
            onStateChange?(.running)
            return
        }

        try FileManager.default.createDirectory(at: configStore.logDirectory, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: configStore.applicationSup

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
