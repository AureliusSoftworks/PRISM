import SwiftUI
import WebKit

struct KioskWebView: NSViewRepresentable {
    let pairedServer: PairedServer

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(nativeSessionScript())
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
        request.setValue("Bearer \(pairedServer.token)", forHTTPHeaderField: "authorization")
        if let cookie = sessionCookie(for: url) {
            webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) {
                webView.load(request)
            }
        } else {
            webView.load(request)
        }
    }

    private func sessionCookie(for url: URL) -> HTTPCookie? {
        guard let host = url.host else { return nil }
        return HTTPCookie(properties: [
            .domain: host,
            .path: "/",
            .name: "localai_session",
            .value: pairedServer.token,
            .secure: url.scheme == "https",
            .expires: pairedServer.expiresAt,
            .sameSitePolicy: HTTPCookieStringPolicy.sameSiteLax.rawValue
        ])
    }

    private func nativeSessionScript() -> WKUserScript {
        let escapedToken = pairedServer.token
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        let source = "window.localStorage.setItem('prism_native_session_token', '\(escapedToken)');"
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }
}
