import SwiftUI

struct SetupWindowView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showAdvanced = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Welcome to Prism Server")
                    .font(.title2.weight(.semibold))

                Text("Everything runs on your Mac. Prism only talks to services you start or approve—your data stays local under your control.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                if let msg = model.setupMessage {
                    Text(msg)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                }

                Button {
                    model.setUpPrismTapped()
                } label: {
                    Text(primaryActionTitle)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(model.runtimeState == .starting || model.runtimeState.isRunning)

                VStack(alignment: .leading, spacing: 12) {
                    Text("Readiness")
                        .font(.headline)

                    ReadinessPillarView(status: model.dependencyStatus.serverRuntime)
                    ReadinessPillarView(status: model.dependencyStatus.memoryEngine)
                    if model.canStartManagedMemoryEngine {
                        Button(model.isStartingMemoryEngine ? "Starting Memory Engine…" : "Start Memory Engine") {
                            model.startMemoryEngineTapped()
                        }
                        .disabled(model.isStartingMemoryEngine)
                    }
                    ReadinessPillarView(status: model.dependencyStatus.localAI.ollama)
                    if model.canInstallOllama {
                        Button(model.isInstallingOllama ? "Installing Ollama…" : "Install Ollama") {
                            model.installOllamaTapped()
                        }
                        .disabled(model.isInstallingOllama)
                    }
                    ModelSubstatusView(status: model.dependencyStatus.localAI.defaultModel)
                    ModelSubstatusView(status: model.dependencyStatus.localAI.embeddingModel)
                    if model.canDownloadDefaultModel {
                        Button(model.isDownloadingModel ? "Downloading Models…" : "Download \(model.requiredModelDownloadLabel)") {
                            model.downloadDefaultModelTapped()
                        }
                        .disabled(model.isDownloadingModel)
                    }
                }
                .padding()
                .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .controlBackgroundColor)))

                HStack(spacing: 12) {
                    Button("Restart Server") {
                        model.restart()
                    }
                    .disabled(!model.runtimeState.isRunning)

                    Spacer()

                    Button("Refresh status") {
                        Task { await model.refreshDependencies() }
                    }
                }

                DisclosureGroup("Advanced", isExpanded: $showAdvanced) {
                    Form {
                        Section("Server") {
                            TextField("Server name", text: $model.config.serverName)
                            TextField("API port", value: $model.config.apiPort, format: .number)
                            TextField("Web port", value: $model.config.webPort, format: .number)
                            Toggle("Advertise on local network", isOn: $model.config.discoveryEnabled)
                        }
                        Section("AI runtime") {
                            TextField("Ollama host", text: $model.config.ollamaHost)
                            TextField("Ollama model", text: $model.config.ollamaModel)
                            TextField("Auxiliary model", text: $model.config.ollamaAuxiliaryModel)
                            TextField("Embedding model", text: $model.config.ollamaEmbeddingModel)
                            TextField("Qdrant URL", text: $model.config.qdrantURL)
                            Text("If this URL points at a running Qdrant, Prism will use it and will not start a sidecar.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Section("Security") {
                            SecureField("Encryption master key", text: $model.config.encryptionMasterKey)
                            TextField("Session cookie name", text: $model.config.sessionCookieName)
                            TextField("Session TTL hours", value: $model.config.sessionTtlHours, format: .number)
                            SecureField("OpenAI API key (optional)", text: $model.config.openAIAPIKey)
                        }
                        Section {
                            HStack {
                                Button("Save") { model.saveConfig() }
                                Button("Save & refresh") {
                                    model.saveConfig()
                                    Task { await model.refreshDependencies() }
                                }
                            }
                        } footer: {
                            Text("Settings are stored at ~/Library/Application Support/Prism/.env.")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .formStyle(.grouped)
                }

                Text(ownershipFootnote)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)

                if model.runtimeState.isRunning {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Pair a Client App")
                            .font(.headline)

                        Text("Generate a short code, then type it into Prism Client on your device.")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        if let pairingCode = model.pairingCode {
                            Text(pairingCode.code)
                                .font(.system(.title2, design: .monospaced).weight(.semibold))
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .textBackgroundColor)))

                            Text("Expires at \(pairingCode.expirationSummary).")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }

                        Button(model.isGeneratingPairingCode ? "Generating Code…" : "Generate Pairing Code") {
                            model.generatePairingCodeTapped()
                        }
                        .disabled(model.isGeneratingPairingCode)
                    }
                    .padding()
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .controlBackgroundColor)))

                    Text("Server-only mode: Prism Server is ready for a client app to pair. The bundled web dashboard is not part of the user-facing flow.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(20)
        }
    }

    private var primaryActionTitle: String {
        if model.runtimeState.isRunning {
            return "Server Ready"
        }
        if model.runtimeState == .starting {
            return "Starting Prism…"
        }
        return "Set Up Prism"
    }

    private var ownershipFootnote: String {
        guard let r = model.qdrantResolution else {
            return ""
        }
        switch r.ownership {
        case .managedByPrism:
            return "Memory Engine: Prism manages local memory storage for this server."
        case .externalUserManaged:
            return "Memory Engine: Prism is using the Qdrant service already running on this Mac."
        }
    }
}

private struct ReadinessPillarView: View {
    let status: PillarStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(status.name, systemImage: status.systemImage)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(status.isReady ? .green : .orange)
            Text(status.detail)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private struct ModelSubstatusView: View {
    let status: ModelSubstatus

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: status.isReady ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(status.isReady ? .green : .orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(status.name)
                    .font(.subheadline.weight(.medium))
                Text(status.detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
