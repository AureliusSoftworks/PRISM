import SwiftUI

@main
struct PrismClientApp: App {
    @StateObject private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            PairingView()
                .environmentObject(appModel)
        }
        .windowStyle(.titleBar)
    }
}
