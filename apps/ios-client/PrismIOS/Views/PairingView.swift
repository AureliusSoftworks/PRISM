import SwiftUI

struct PairingView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Connect to Prism Server")
                            .font(.title2.bold())
                        Text("Prism looks for your server on this Wi-Fi network. Enter the short code shown in Prism Server.app.")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 8)
                }

                Section("Server") {
                    if let server = model.discoveredServers.first {
                        LabeledContent("Found", value: server.name)
                        LabeledContent("Address", value: server.url)
                    } else {
                        Text(model.isDiscoveringServer ? "Searching local network..." : "No Prism Server found yet.")
                            .foregroundStyle(.secondary)
                    }

                    DisclosureGroup("Manual address") {
                        TextField("http://192.168.1.20:18787", text: $model.serverURL)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                            .autocorrectionDisabled()
                        Text("Only use this if local discovery cannot find your Mac.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Pairing Code") {
                    TextField("ABCD-EFGH-JKLM", text: $model.pairingCode)
                        .textInputAutocapitalization(.characters)
                        .font(.system(.title3, design: .monospaced))
                        .autocorrectionDisabled()
                    Button(model.isPairing ? "Pairing..." : "Pair with Server") {
                        model.pair()
                    }
                    .disabled(model.isPairing)
                }

                if let message = model.statusMessage {
                    Section {
                        Text(message)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Why Local Network?") {
                    Text("The code proves trust. Local Network discovery tells Prism which Mac on your Wi-Fi is running the server.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Prism")
        }
    }
}
