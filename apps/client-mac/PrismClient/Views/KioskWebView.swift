import SwiftUI
import WebKit

func prismClientCookie(
    name: String,
    value: String,
    originURL: URL,
    expiresAt: Date
) -> HTTPCookie? {
    HTTPCookie(properties: [
        .originURL: originURL.absoluteString,
        .path: "/",
        .name: name,
        .value: value,
        .secure: originURL.scheme == "https",
        .expires: expiresAt,
        .sameSitePolicy: HTTPCookieStringPolicy.sameSiteLax.rawValue,
        HTTPCookiePropertyKey("HttpOnly"): "TRUE"
    ])
}

struct KioskWebView: NSViewRepresentable {
    let pairedServer: PairedServer

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(legacyBearerCleanupScript())
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
        let cookies = [
            prismClientCookie(
                name: "localai_session",
                value: pairedServer.token,
                originURL: url,
                expiresAt: pairedServer.expiresAt
            ),
            pairedServer.clientAccessToken.flatMap {
                prismClientCookie(
                    name: "prism_client_access",
                    value: $0,
                    originURL: url,
                    expiresAt: pairedServer.expiresAt
                )
            }
        ].compactMap { $0 }
        let group = DispatchGroup()
        for cookie in cookies {
            group.enter()
            webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) {
                group.leave()
            }
        }
        group.notify(queue: .main) {
            webView.load(request)
        }
    }

    private func legacyBearerCleanupScript() -> WKUserScript {
        let source = """
        for (const key of ['prism_native_session_token', 'prism_client_access_token']) {
          window.localStorage.removeItem(key);
          window.sessionStorage.removeItem(key);
        }
        """
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }
}
