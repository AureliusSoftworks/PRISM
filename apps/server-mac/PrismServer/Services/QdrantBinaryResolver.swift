import Foundation

/// Resolves a usable Qdrant server binary (bundle first, then Homebrew/PATH) without starting a process.
enum QdrantBinaryResolver {
    static func findExecutable() -> URL? {
        if let r = Bundle.main.resourceURL {
            let bundled = r.appendingPathComponent("qdrant")
            if FileManager.default.isExecutableFile(atPath: bundled.path) {
                return bundled
            }
        }
        return which("qdrant")
    }

    private static func which(_ name: String) -> URL? {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        p.arguments = [name]
        let out = Pipe()
        p.standardOutput = out
        p.standardError = Pipe()
        do {
            try p.run()
            p.waitUntilExit()
            guard p.terminationStatus == 0 else { return nil }
            let data = out.fileHandleForReading.readDataToEndOfFile()
            guard var path = String(data: data, encoding: .utf8) else { return nil }
            path = path.trimmingCharacters(in: .whitespacesAndNewlines)
            let url = URL(fileURLWithPath: path)
            return FileManager.default.isExecutableFile(atPath: url.path) ? url : nil
        } catch {
            return nil
        }
    }
}
