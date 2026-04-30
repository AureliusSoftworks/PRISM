namespace PrismServer.Core.Services;

public static class WindowsAppLog
{
    public static string LogPath
    {
        get
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(appData, "Prism", "Logs", "windows-app.log");
        }
    }

    public static void Write(string message)
    {
        try
        {
            var path = LogPath;
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.AppendAllText(path, $"[{DateTimeOffset.Now:O}] {message}{Environment.NewLine}");
        }
        catch
        {
            // Logging must never become the reason the app fails to launch.
        }
    }

    public static void WriteException(string context, Exception exception)
    {
        Write($"{context}{Environment.NewLine}{exception}");
    }
}
