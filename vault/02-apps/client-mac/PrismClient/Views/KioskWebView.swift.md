---
title: "apps/client-mac/PrismClient/Views/KioskWebView.swift"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/client-mac/PrismClient/Views/KioskWebView.swift"
status: "active"
---

# apps/client-mac/PrismClient/Views/KioskWebView.swift

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/PrismClient.build/Debug/PrismClient.build/Objects-normal/arm64/PrismClient-OutputFileMap.json]]
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/0a8fe3e451170847a2385a8ed5362452.xcbuilddata/manifest.json]]
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/1c28f9c887f9894a78651475a7b63114.xcbuilddata/manifest.json]]
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/60e558427db1bdac77015dc094c7f897.xcbuilddata/manifest.json]]
- [[02-apps/client-mac/DerivedData/Build/Intermediates.noindex/XCBuildData/b6b5bf691b1edaf107c5d0547f4c5a85.xcbuilddata/manifest.json]]

## Source path
- `apps/client-mac/PrismClient/Views/KioskWebView.swift`

## Import references
- _No imports detected_

## Source preview
```text
import SwiftUI
import WebKit

struct KioskWebView: NSViewRepresentable {
    let pairedServer: PairedServer

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(nativeSessionCleanupScript())
        if let clientAccessScript {
            configuration.userContentController.addUserScript(clientAccessScript)
        }
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        loadKiosk(in: webView)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        guard webView.url == nil else { return }
        loadKiosk(in: webView)
    }

    private func loadKiosk(in webView: WKWebView) {
        guard let url = pairedServer.webAppURL else {
            return
        }

        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let clientAccessToken = pairedServer.clientAccessToken {
            request.setValue("prism_client_access=\(clientAccessToken)", forHTTPHeaderField: "Cookie")
        }
        removeNativeSessionCookie(from: webView) {
            if let cookie = clientAccessCookie(for: url) {
                webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) {

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
