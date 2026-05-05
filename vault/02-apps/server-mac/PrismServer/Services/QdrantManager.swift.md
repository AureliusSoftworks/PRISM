---
title: "apps/server-mac/PrismServer/Services/QdrantManager.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Services/QdrantManager.swift"
status: "active"
---

# apps/server-mac/PrismServer/Services/QdrantManager.swift

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
- `apps/server-mac/PrismServer/Services/QdrantManager.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Darwin
import Foundation

/// Runs a Prism-owned Qdrant sidecar; never used when `QdrantOwnership` is `externalUserManaged`.
final class QdrantManager: @unchecked Sendable {
    private let configStore: ConfigStore
    private var process: Process?
    /// True only if this manager spawned the current sidecar in this app session.
    private var weStartedChild = false
    private var logHandle: FileHandle?
    private let startQueue = DispatchQueue(label: "com.localai.qdrant-manager")

    init(configStore: ConfigStore) {
        self.configStore = configStore
    }

    /// Stops a managed sidecar that we started (no-op for external or when nothing is running).
    func stop() {
        startQueue.sync {
            self.stopProcessLocked()
        }
    }

    private func stopProcessLocked() {
        guard weStartedChild, let running = process, running.isRunning else {
            process = nil
            weStartedChild = false
            return
        }
        weStartedChild = false
        self.process = nil

        running.terminate()
        let deadline = Date().addingTimeInterval(5)
        while running.isRunning, Date() < deadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if running.isRunning {
            _ = kill(running.processIdentifier, SIGKILL)
        }
        closeLogLocked()
    }

    private func closeLogLocked() {

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
