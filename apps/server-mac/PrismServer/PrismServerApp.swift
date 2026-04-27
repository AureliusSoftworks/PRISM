import SwiftUI

@main
struct PrismServerApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var appModel = AppModel()

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

enum AppWindow: String {
    case setup
    case logs
}
