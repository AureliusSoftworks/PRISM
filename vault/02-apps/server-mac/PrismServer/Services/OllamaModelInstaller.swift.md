---
title: "apps/server-mac/PrismServer/Services/OllamaModelInstaller.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Services/OllamaModelInstaller.swift"
status: "active"
---

# apps/server-mac/PrismServer/Services/OllamaModelInstaller.swift

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
- `apps/server-mac/PrismServer/Services/OllamaModelInstaller.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

/// Runs user-approved Ollama model downloads using fixed Process arguments, never shell strings.
final class OllamaModelInstaller {
    private let configStore: ConfigStore

    init(configStore: ConfigStore) {
        self.configStore = configStore
    }

    func pull(model rawModel: String) async throws {
        let model = try Self.validatedModelName(rawModel)
        try FileManager.default.createDirectory(at: configStore.logDirectory, withIntermediateDirectories: true)

        let logHandle = try makeLogHandle()
        defer {
            try? logHandle.close()
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["ollama", "pull", model]
        process.standardOutput = makeLogPipe(handle: logHandle)
        process.standardError = makeLogPipe(handle: logHandle)

        try await runAndWait(process)
    }

    static func validatedModelName(_ raw: String) throws -> String {
        let model = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !model.isEmpty else {
            throw OllamaModelInstallerError.invalidModelName("Choose a model before downloading.")
        }

        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:/._-")
        guard model.unicodeScalars.allSatisfy({ allowed.c

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
