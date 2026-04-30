namespace PrismServer.Core.Services;

public static class OllamaUrl
{
    public const string DefaultBase = "http://127.0.0.1:11434";

    public static string NormalizeBase(string? raw)
    {
        var trimmed = (raw ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            return DefaultBase;
        }

        if (!trimmed.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !trimmed.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = "http://" + trimmed;
        }

        trimmed = trimmed.Replace("//0.0.0.0", "//127.0.0.1", StringComparison.OrdinalIgnoreCase);
        while (trimmed.EndsWith('/'))
        {
            trimmed = trimmed[..^1];
        }

        return Uri.TryCreate(trimmed, UriKind.Absolute, out _) ? trimmed : DefaultBase;
    }

    public static Uri? TagsUri(string ollamaBase)
    {
        var normalized = NormalizeBase(ollamaBase);
        return Uri.TryCreate(normalized.TrimEnd('/') + "/api/tags", UriKind.Absolute, out var uri) ? uri : null;
    }
}
