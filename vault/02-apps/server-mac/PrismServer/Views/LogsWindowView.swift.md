---
title: "apps/server-mac/PrismServer/Views/LogsWindowView.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Views/LogsWindowView.swift"
status: "active"
---

# apps/server-mac/PrismServer/Views/LogsWindowView.swift

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
- `apps/server-mac/PrismServer/Views/LogsWindowView.swift`

## Import references
- _No imports detected_

## Source preview
```text
import SwiftUI

struct LogsWindowView: View {
    @EnvironmentObject private var model: AppModel
    @State private var logText = "Logs will appear after Prism Server starts."

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Runtime Logs")
                    .font(.title3)
                    .fontWeight(.semibold)
                Spacer()
                Button("Refresh") {
                    refresh()
                }
            }

            ScrollView {
                Text(logText)
                    .font(.system(.body, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
                    .padding(12)
            }
            .background(.quaternary)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .padding()
        .onAppear(perform: refresh)
    }

    private func refresh() {
        logText = model.logTailer.readCombinedLog()
    }
}

```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
