---
title: "apps/server-mac/PrismServer/AppModel.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/AppModel.swift"
status: "active"
---

# apps/server-mac/PrismServer/AppModel.swift

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
- `apps/server-mac/PrismServer/AppModel.swift`

## Import references
- _No imports detected_

## Source preview
```text
import AppKit
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published var config: ServerConfig
    @Published var qdrantResolution: QdrantResolution?
    @Published var dependencyStatus = DependencyStatus.unknown
    @Published var runtimeState: RuntimeState = .stopped
    @Published var setupMessage: String?
    @Published var isStartingMemoryEngine = false
    @Published var isDownloadingModel = false
    @Published var pairingCode: DisplayPairingCode?
    @Published var isGeneratingPairingCode = false

    let configStore: ConfigStore
    let dependencyService: DependencyService
    let logTailer: LogTailer

    private let runtimeManager: RuntimeManager
    private let ollamaModelInstaller: OllamaModelInstaller
    private let pairingCodeService = PairingCodeService()
    private var setupWindow: NSWindow?
    private var logsWindow: NSWindow?
    private var notificationObservers: [NSObjectProtocol] = []
    private var isRunningTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }

    init() {
        let configStore = ConfigStore()
        self.configStore = configStore
        self.config = configStore.load()
        self.logTailer = LogTailer(logDirectory: configStore.logDirectory)
        self.dependencyService = DependencyService()
        self.runtimeManager = RuntimeManager(configStore: con

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
