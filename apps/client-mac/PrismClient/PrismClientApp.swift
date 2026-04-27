import SwiftUI

@main
struct PrismClientApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            PairingView()
                .environmentObject(appModel)
        }
        .windowStyle(.titleBar)
    }
}
