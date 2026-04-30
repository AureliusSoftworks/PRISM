namespace PrismServer.Core.Services;

public static class QdrantUrl
{
    public const string DefaultManagedBase = "http://127.0.0.1:6333";

    public static string Normalize(string? raw)
    {
        var trimmed = (raw ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            return DefaultManagedBase;
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

        return Uri.TryCreate(trimmed, UriKind.Absolute, out _) ? trimmed : DefaultManagedBase;
    }

    public static Uri? ReadyzUri(string baseUrl)
    {
        var normalized = Normalize(baseUrl);
        if (normalized.EndsWith("/readyz", StringComparison.OrdinalIgnoreCase))
        {
            return Uri.TryCreate(normalized, UriKind.Absolute, out var readyz) ? readyz : null;
        }

        return Uri.TryCreate(normalized.TrimEnd('/') + "/readyz", UriKind.Absolute, out var uri) ? uri : null;
    }
}
