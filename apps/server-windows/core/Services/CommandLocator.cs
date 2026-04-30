namespace PrismServer.Core.Services;

public interface ICommandLocator
{
    string? FindExecutable(string executableName);
}

public sealed class CommandLocator : ICommandLocator
{
    public string? FindExecutable(string executableName)
    {
        if (Path.IsPathFullyQualified(executableName) && File.Exists(executableName))
        {
            return executableName;
        }

        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        var candidates = pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Select(path => Path.Combine(path.Trim(), executableName));

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }
}
