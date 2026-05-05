---
title: "apps/server-mac/PrismServer/Models/ServerConfig.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Models/ServerConfig.swift"
status: "active"
---

# apps/server-mac/PrismServer/Models/ServerConfig.swift

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
- `apps/server-mac/PrismServer/Models/ServerConfig.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

struct ServerConfig: Equatable {
    private static let lanWebBindHost = "0.0.0.0"
    private static let localAPIOriginHost = "127.0.0.1"

    var serverName: String
    var apiPort: Int
    var webPort: Int
    var discoveryEnabled: Bool
    var sessionCookieName: String
    var sessionTtlHours: Int
    var encryptionMasterKey: String
    var ollamaHost: String
    var ollamaModel: String
    var ollamaAuxiliaryModel: String
    var ollamaEmbeddingModel: String
    var qdrantURL: String
    var openAIAPIKey: String

    static let requiredLocalModels = RequiredLocalModels(
        chat: "llama3.2",
        auxiliary: "llama3.2",
        embedding: "nomic-embed-text"
    )

    static let defaults = ServerConfig(
        serverName: "Prism Server",
        apiPort: 18_787,
        webPort: 18_788,
        discoveryEnabled: true,
        sessionCookieName: "localai_session",
        sessionTtlHours: 24,
        encryptionMasterKey: "change-me-to-a-long-random-secret",
        ollamaHost: "http://localhost:11434",
        ollamaModel: "llama3.2",
        ollamaAuxiliaryModel: "llama3.2",
        ollamaEmbeddingModel: "nomic-embed-text",
        qdrantURL: "http://127.0.0.1:6333",
        openAIAPIKey: ""
    )

    func environment(applicationSupportDirectory: URL) -> [String: String] {
        var env: [String: String] = [
            "API_PORT": String(apiPo

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
