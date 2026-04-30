namespace PrismServer.Core.Services;

public sealed class QdrantBinaryResolver
{
    private readonly PrismPaths _paths;
    private readonly ICommandLocator _commandLocator;

    public QdrantBinaryResolver(PrismPaths paths, ICommandLocator commandLocator)
    {
        _paths = paths;
        _commandLocator = commandLocator;
    }

    public string? FindExecutable()
    {
        if (File.Exists(_paths.BundledQdrantPath))
        {
            return _paths.BundledQdrantPath;
        }

        return _commandLocator.FindExecutable("qdrant.exe") ?? _commandLocator.FindExecutable("qdrant");
    }
}
