import Foundation

final class LogTailer {
    private let logDirectory: URL

    init(logDirectory: URL) {
        self.logDirectory = logDirectory
    }

    var apiLogURL: URL {
        logDirectory.appendingPathComponent("api.log")
    }

    var webLogURL: URL {
        logDirectory.appendingPathComponent("web.log")
    }

    func readCombinedLog(maxBytes: Int = 32_768) -> String {
        let api = readTail(from: apiLogURL, maxBytes: maxBytes / 2)
        let web = readTail(from: webLogURL, maxBytes: maxBytes / 2)
        return """
        === API ===
        \(api)

        === Web ===
        \(web)
        """
    }

    private func readTail(from url: URL, maxBytes: Int) -> String {
        guard
            let handle = try? FileHandle(forReadingFrom: url)
        else {
            return "No log file yet."
        }

        defer {
            try? handle.close()
        }

        do {
            let size = try handle.seekToEnd()
            let offset = size > UInt64(maxBytes) ? size - UInt64(maxBytes) : 0
            try handle.seek(toOffset: offset)
            let data = try handle.readToEnd() ?? Data()
            return String(data: data, encoding: .utf8) ?? "Unable to decode log."
        } catch {
            return "Unable to read log: \(error.localizedDescription)"
        }
    }
}
