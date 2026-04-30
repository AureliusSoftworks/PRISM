namespace PrismServer.Core.Services;

public sealed class PrismPaths
{
    public PrismPaths(string? baseDirectory = null, string? localAppData = null)
    {
        BaseDirectory = baseDirectory ?? AppContext.BaseDirectory;
        var appData = localAppData ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        ApplicationSupportDirectory = Path.Combine(appData, "Prism");
        LogDirectory = Path.Combine(ApplicationSupportDirectory, "Logs");
        QdrantDirectory = Path.Combine(ApplicationSupportDirectory, "Qdrant");
        QdrantStorageDirectory = Path.Combine(QdrantDirectory, "storage");
        EnvFilePath = Path.Combine(ApplicationSupportDirectory, ".env");
    }

    public string BaseDirectory { get; }
    public string ApplicationSupportDirectory { get; }
    public string LogDirectory { get; }
    public string QdrantDirectory { get; }
    public string QdrantStorageDirectory { get; }
    public string EnvFilePath { get; }

    public string RuntimeDirectory => Path.Combine(BaseDirectory, "runtime");
    public string BundledNodePath => Path.Combine(BaseDirectory, "node", "node.exe");
    public string BundledQdrantPath => Path.Combine(BaseDirectory, "qdrant", "qdrant.exe");
}
