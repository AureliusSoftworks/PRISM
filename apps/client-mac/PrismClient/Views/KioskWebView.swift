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
                    DispatchQueue.main.async {
                        webView.load(request)
                    }
                }
            } else {
                DispatchQueue.main.async {
                    webView.load(request)
                }
            }
        }
    }

    private func clientAccessCookie(for url: URL) -> HTTPCookie? {
        guard let clientAccessToken = pairedServer.clientAccessToken else {
            return nil
        }
        return HTTPCookie(properties: [
            .originURL: url.absoluteString,
            .path: "/",
            .name: "prism_client_access",
            .value: clientAccessToken,
            .secure: url.scheme == "https",
            .expires: pairedServer.expiresAt,
            .sameSitePolicy: HTTPCookieStringPolicy.sameSiteLax.rawValue
        ])
    }

    private var clientAccessScript: WKUserScript? {
        guard let clientAccessToken = pairedServer.clientAccessToken else {
            return nil
        }
        let escapedToken = clientAccessToken
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        let source = "window.localStorage.setItem('prism_client_access_token', '\(escapedToken)');"
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    private func removeNativeSessionCookie(from webView: WKWebView, completion: @escaping () -> Void) {
        let store = webView.configuration.websiteDataStore.httpCookieStore
        store.getAllCookies { cookies in
            let nativeSessionCookies = cookies.filter {
                $0.name == "localai_session" && $0.value == pairedServer.token
            }
            guard !nativeSessionCookies.isEmpty else {
                completion()
                return
            }

            var remaining = nativeSessionCookies.count
            for cookie in nativeSessionCookies {
                store.delete(cookie) {
                    remaining -= 1
                    if remaining == 0 {
                        completion()
                    }
                }
            }
        }
    }

    private func nativeSessionCleanupScript() -> WKUserScript {
        let escapedToken = pairedServer.token
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        let source = """
        if (window.localStorage.getItem('prism_native_session_token') === '\(escapedToken)') {
          window.localStorage.removeItem('prism_native_session_token');
        }
        """
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }
}
