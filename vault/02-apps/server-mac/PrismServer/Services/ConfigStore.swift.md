---
title: "apps/server-mac/PrismServer/Services/ConfigStore.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Services/ConfigStore.swift"
status: "active"
---

# apps/server-mac/PrismServer/Services/ConfigStore.swift

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
- `apps/server-mac/PrismServer/Services/ConfigStore.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

final class ConfigStore {
    private static let legacyDefaultAPIPort = 8787
    private static let legacyDefaultWebPort = 3000

    let applicationSupportDirectory: URL
    let logDirectory: URL

    private let envFileURL: URL

    init(fileManager: FileManager = .default) {
        let supportRoot = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        applicationSupportDirectory = supportRoot.appendingPathComponent("Prism", isDirectory: true)
        logDirectory = fileManager.urls(for: .libraryDirectory, in: .userDomainMask).first!
            .appendingPathComponent("Logs", isDirectory: true)
            .appendingPathComponent("Prism", isDirectory: true)
        envFileURL = applicationSupportDirectory.appendingPathComponent(".env")
    }

    func load() -> ServerConfig {
        guard
            let raw = try? String(contentsOf: envFileURL, encoding: .utf8)
        else {
            return .defaults
        }

        let env = Self.parseEnv(raw)
        var config = ServerConfig.defaults
        config.serverName = env["PRISM_SERVER_NAME"] ?? config.serverName
        config.apiPort = Self.readInt(env["API_PORT"], fallback: config.apiPort)
        config.webPort = Self.readInt(env["WEB_PORT"], fallback: config.webPort)
        if config.apiPort == Self.legacyDefaultAPIPort,
           config.webPort == Self.legacy

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
