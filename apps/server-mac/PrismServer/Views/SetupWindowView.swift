import SwiftUI

struct SetupWindowView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Form {
            Section("Server") {
                TextField("Server name", text: $model.config.serverName)
                TextField("API port", value: $model.config.apiPort, format: .number)
                TextField("Web port", value: $model.config.webPort, format: .number)
                Toggle("Advertise on local network", isOn: $model.config.discoveryEnabled)
            }

            Section("AI Runtime") {
                TextField("Ollama host", text: $model.config.ollamaHost)
                TextField("Ollama model", text: $model.config.ollamaModel)
                TextField("Qdrant URL", text: $model.config.qdrantURL)
            }

            Section("Install Guidance") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Prism Server expects Ollama and Qdrant to be installed and running on this Mac.")
                        .foregroundStyle(.secondary)
                    Text("Ollama: brew install ollama")
                        .font(.system(.body, design: .monospaced))
                    Text("Qdrant: brew install qdrant/tap/qdrant")
                        .font(.system(.body, design: .monospaced))
                    HStack {
                        Link("Get Ollama", destination: URL(string: "https://ollama.com/download/mac")!)
                        Link("Get Qdrant", destination: URL(string: "https://qdrant.tech/documentation/guides/installation/")!)
                    }
                    Button("Refresh Dependency Status") {
                        Task {
                            await model.refreshDependencies()
                        }
                    }
                }
            }

            Section("Security") {
                SecureField("Encryption master key", text: $model.config.encryptionMasterKey)
                TextField("Session cookie name", text: $model.config.sessionCookieName)
                TextField("Session TTL hours", value: $model.config.sessionTtlHours, format: .number)
                SecureField("OpenAI API key (optional)", text: $model.config.openAIAPIKey)
            }

            Section {
                HStack {
                    Button("Save") {
                        model.saveConfig()
                    }
                    Button("Save & Restart") {
                        model.saveConfig()
                        model.restart()
                    }
                }
            } footer: {
                Text("Prism Server stores this file at ~/Library/Application Support/Prism/.env.")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .padding()
    }
}
