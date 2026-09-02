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

final class PrismWKWebView: WKWebView {
    override var inputAccessoryView: UIView? {
        nil
    }
}

struct KioskWebView: UIViewRepresentable {
    let session: PairedSession

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(legacyBearerCleanupScript())
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
        let cookies = [
            prismClientCookie(
                name: "localai_session",
                value: session.token,
                originURL: url,
                expiresAt: session.server.expiresAt
            ),
            prismClientCookie(
                name: "prism_client_access",
                value: session.clientAccessToken,
                originURL: url,
                expiresAt: session.server.expiresAt
            )
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
