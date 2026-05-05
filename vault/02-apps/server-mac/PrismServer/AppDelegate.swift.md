---
title: "apps/server-mac/PrismServer/AppDelegate.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/AppDelegate.swift"
status: "active"
---

# apps/server-mac/PrismServer/AppDelegate.swift

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
- `apps/server-mac/PrismServer/AppDelegate.swift`

## Import references
- _No imports detected_

## Source preview
```text
import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        guard ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil else {
            return
        }
        guard let duplicate = existingAppInstance() else {
            return
        }

        duplicate.activate(options: [.activateIgnoringOtherApps])
        NSApplication.shared.terminate(nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil {
            return true
        }
        return false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        NotificationCenter.default.post(name: .showPrismServerWindow, object: nil)
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        NotificationCenter.default.post(name: .prismServerWillTerminate, object: nil)
    }

    private func existingAppInstance() -> NSRunningApplication? {
        guard let bundleIdentifier = Bundle.main.bundleIdentifier else {
            return nil
        }

        let currentProcessIdentifier = NSRunningApplication.current.processIdentifier
        return NSRunningApplication
            .ru

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
