import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil {
            return true
        }
        return false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        NotificationCenter.default.post(name: .showPrismServerWindow, object: nil)
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        NotificationCenter.default.post(name: .prismServerWillTerminate, object: nil)
    }
}

extension Notification.Name {
    static let showPrismServerWindow = Notification.Name("showPrismServerWindow")
    static let prismServerWillTerminate = Notification.Name("prismServerWillTerminate")
}
