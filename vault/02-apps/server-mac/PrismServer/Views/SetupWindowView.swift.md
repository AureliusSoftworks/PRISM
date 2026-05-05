---
title: "apps/server-mac/PrismServer/Views/SetupWindowView.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/server-mac/PrismServer/Views/SetupWindowView.swift"
status: "active"
---

# apps/server-mac/PrismServer/Views/SetupWindowView.swift

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
- `apps/server-mac/PrismServer/Views/SetupWindowView.swift`

## Import references
- _No imports detected_

## Source preview
```text
import SwiftUI

struct SetupWindowView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showAdvanced = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Welcome to Prism Server")
                    .font(.title2.weight(.semibold))

                Text("Everything runs on your Mac. Prism only talks to services you start or approve—your data stays local under your control.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                if let msg = model.setupMessage {
                    Text(msg)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                }

                Button {
                    model.setUpPrismTapped()
                } label: {
                    Text(primaryActionTitle)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(model.runtimeState == .starting || model.runtimeState.isRunning)

                VStack(alignment: .leading, spacing: 12) {
                    Text("Readiness")
                        .font(.headline)

                    ReadinessPillarView(status: model.dependencyStatus.serverRu

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
