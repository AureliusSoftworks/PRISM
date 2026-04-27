import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        guard ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil else {
            return
        }
        guard let duplicate = existingAppInstance() else {
            return
        }

        duplicate.activate(options: [.activateIgnoringOtherApps])
        NSApplication.shared.terminate(nil)
    }

    private func existingAppInstance() -> NSRunningApplication? {
        guard let bundleIdentifier = Bundle.main.bundleIdentifier else {
            return nil
        }

        let currentProcessIdentifier = NSRunningApplication.current.processIdentifier
        return NSRunningApplication
            .runningApplications(withBundleIdentifier: bundleIdentifier)
            .first {
                !$0.isTerminated &&
                $0.processIdentifier != currentProcessIdentifier
            }
    }
}
