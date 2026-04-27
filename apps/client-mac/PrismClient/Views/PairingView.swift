import SwiftUI

struct PairingView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if let paired = model.pairedServer {
                pairedKiosk(paired)
            } else {
                pairingForm
            }
        }
        .frame(minWidth: 720, minHeight: 560)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Prism")
                .font(.largeTitle.weight(.semibold))
            Text("Pair this app with your Prism Server.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var pairingForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            header

            Text("Enter the code shown in Prism Server.app.")
                .font(.headline)

            TextField("Server address", text: $model.serverURL)
                .textFieldStyle(.roundedBorder)

            TextField("Pairing code", text: $model.pairingCode)
                .textFieldStyle(.roundedBorder)
                .font(.system(.title3, design: .monospaced))

            Button(model.isPairing ? "Pairing..." : "Pair with Server") {
                model.pair()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(model.isPairing)

            Text("Example: ABCD-EFGH-JKLM. Codes expire quickly and can only be used once.")
                .font(.caption)
                .foregroundStyle(.secondary)

            if let message = model.statusMessage {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(24)
    }

    private func pairedKiosk(_ paired: PairedServer) -> some View {
        KioskWebView(pairedServer: paired)
    }
}
