import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        if let session = model.session {
            KioskWebView(session: session)
                .background(Color(red: 0.04, green: 0.05, blue: 0.07))
                .ignoresSafeArea(.all)
                .ignoresSafeArea(.keyboard)
        } else {
            PairingView()
        }
    }
}
