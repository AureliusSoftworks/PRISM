import SwiftUI

struct LogsWindowView: View {
    @EnvironmentObject private var model: AppModel
    @State private var logText = "Logs will appear after Prism Server starts."

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Runtime Logs")
                    .font(.title3)
                    .fontWeight(.semibold)
                Spacer()
                Button("Refresh") {
                    refresh()
                }
            }

            ScrollView {
                Text(logText)
                    .font(.system(.body, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
                    .padding(12)
            }
            .background(.quaternary)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .padding()
        .onAppear(perform: refresh)
    }

    private func refresh() {
        logText = model.logTailer.readCombinedLog()
    }
}
