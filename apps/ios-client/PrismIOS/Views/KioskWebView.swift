import SwiftUI
import WebKit

final class PrismWKWebView: WKWebView {
    override var inputAccessoryView: UIView? {
        nil
    }
}

struct KioskWebView: UIViewRepresentable {
    let session: PairedSession

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(nativeSessionCleanupScript())
        configuration.userContentController.addUserScript(clientAccessScript())
        let webView = PrismWKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        configureChrome(for: webView)
        loadKiosk(in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        configureChrome(for: webView)
        guard webView.url == nil else { return }
        loadKiosk(in: webView)
    }

    private func configureChrome(for webView: WKWebView) {
        let background = UIColor(red: 0.04, green: 0.05, blue: 0.07, alpha: 1)
        webView.isOpaque = false
        webView.backgroundColor = background
        webView.scrollView.backgroundColor = background
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
    }

    private func loadKiosk(in webView: WKWebView) {
        guard let url = session.server.webAppURL else {
            return
        }

        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("prism_client_access=\(session.clientAccessToken)", forHTTPHeaderField: "Cookie")
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
        return HTTPCookie(properties: [
            .originURL: url.absoluteString,
            .path: "/",
            .name: "prism_client_access",
            .value: session.clientAccessToken,
            .secure: url.scheme == "https",
            .expires: session.server.expiresAt,
            .sameSitePolicy: HTTPCookieStringPolicy.sameSiteLax.rawValue
        ])
    }

    private func clientAccessScript() -> WKUserScript {
        let escapedToken = session.clientAccessToken
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        let source = "window.localStorage.setItem('prism_client_access_token', '\(escapedToken)');"
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    private func removeNativeSessionCookie(from webView: WKWebView, completion: @escaping () -> Void) {
        let store = webView.configuration.websiteDataStore.httpCookieStore
        store.getAllCookies { cookies in
            let nativeSessionCookies = cookies.filter {
                $0.name == "localai_session" && $0.value == session.token
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
        let escapedToken = session.token
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
