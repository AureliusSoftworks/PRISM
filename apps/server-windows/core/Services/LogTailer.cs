using System.Text;

namespace PrismServer.Core.Services;

public sealed class LogTailer
{
    private readonly PrismPaths _paths;

    public LogTailer(PrismPaths paths)
    {
        _paths = paths;
    }

    public string ApiLogPath => Path.Combine(_paths.LogDirectory, "api.log");
    public string WebLogPath => Path.Combine(_paths.LogDirectory, "web.log");
    public string QdrantLogPath => Path.Combine(_paths.LogDirectory, "qdrant.log");

    public string ReadCombinedLog(int maxBytes = 32_768)
    {
        var api = ReadTail(ApiLogPath, maxBytes / 2);
        var web = ReadTail(WebLogPath, maxBytes / 2);
        return $"""
            === API ===
            {api}

            === Web ===
            {web}
            """;
    }

    private static string ReadTail(string path, int maxBytes)
    {
        if (!File.Exists(path))
        {
            return "No log file yet.";
        }

        try
        {
            using var stream = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            var offset = stream.Length > maxBytes ? stream.Length - maxBytes : 0;
            stream.Seek(offset, SeekOrigin.Begin);
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
            return reader.ReadToEnd();
        }
        catch (Exception ex)
        {
            return $"Unable to read log: {ex.Message}";
        }
    }
}
