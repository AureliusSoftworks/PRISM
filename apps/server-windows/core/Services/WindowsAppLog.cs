namespace PrismServer.Core.Services;

public static class WindowsAppLog
{
    public static string LogPath
    {
        get
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (string.IsNullOrWhiteSpace(appData))
            {
                appData = Path.GetTempPath();
            }
            return Path.Combine(appData, "Prism", "Logs", "windows-app.log");
        }
    }

    public static string FallbackLogPath => Path.Combine(Path.GetTempPath(), "Prism", "Logs", "windows-app.log");

    public static void Write(string message)
    {
        var line = $"[{DateTimeOffset.Now:O}] {message}{Environment.NewLine}";
        if (TryAppend(LogPath, line))
        {
            return;
        }

        TryAppend(FallbackLogPath, line);
    }

    public static void WriteException(string context, Exception exception)
    {
        Write($"{context}{Environment.NewLine}{exception}");
    }

    private static bool TryAppend(string path, string line)
    {
        try
        {
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }
            File.AppendAllText(path, line);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
