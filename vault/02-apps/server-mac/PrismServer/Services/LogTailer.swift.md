---
title: "apps/server-mac/PrismServer/Services/LogTailer.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Services/LogTailer.swift"
status: "active"
---

# apps/server-mac/PrismServer/Services/LogTailer.swift

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
- `apps/server-mac/PrismServer/Services/LogTailer.swift`

## Import references
- _No imports detected_

## Source preview
```text
import Foundation

final class LogTailer {
    private let logDirectory: URL

    init(logDirectory: URL) {
        self.logDirectory = logDirectory
    }

    var apiLogURL: URL {
        logDirectory.appendingPathComponent("api.log")
    }

    var webLogURL: URL {
        logDirectory.appendingPathComponent("web.log")
    }

    func readCombinedLog(maxBytes: Int = 32_768) -> String {
        let api = readTail(from: apiLogURL, maxBytes: maxBytes / 2)
        let web = readTail(from: webLogURL, maxBytes: maxBytes / 2)
        return """
        === API ===
        \(api)

        === Web ===
        \(web)
        """
    }

    private func readTail(from url: URL, maxBytes: Int) -> String {
        guard
            let handle = try? FileHandle(forReadingFrom: url)
        else {
            return "No log file yet."
        }

        defer {
            try? handle.close()
        }

        do {
            let size = try handle.seekToEnd()
            let offset = size > UInt64(maxBytes) ? size - UInt64(maxBytes) : 0
            try handle.seek(toOffset: offset)
            let data = try handle.readToEnd() ?? Data()
            return String(data: data, encoding: .utf8) ?? "Unable to decode log."
        } catch {
            return "Unable to read log: \(error.localizedDescription)"
        }
    }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
