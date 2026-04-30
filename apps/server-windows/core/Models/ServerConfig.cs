namespace PrismServer.Core.Models;

public sealed record ServerConfig
{
    private const string LanWebBindHost = "0.0.0.0";
    private const string LocalApiOriginHost = "127.0.0.1";

    public string ServerName { get; init; } = "Prism Server";
    public int ApiPort { get; init; } = 18_787;
    public int WebPort { get; init; } = 18_788;
    public bool DiscoveryEnabled { get; init; } = true;
    public string SessionCookieName { get; init; } = "localai_session";
    public int SessionTtlHours { get; init; } = 24;
    public string EncryptionMasterKey { get; init; } = "change-me-to-a-long-random-secret";
    public string OllamaHost { get; init; } = "http://localhost:11434";
    public string OllamaModel { get; init; } = "llama3.2";
    public string QdrantUrl { get; init; } = "http://127.0.0.1:6333";
    public string OpenAiApiKey { get; init; } = string.Empty;

    public static ServerConfig Defaults { get; } = new();

    public Dictionary<string, string> BuildEnvironment(string applicationSupportDirectory)
    {
        var dataDirectory = Path.Combine(applicationSupportDirectory, "Data");
        var env = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["API_PORT"] = ApiPort.ToString(),
            ["PORT"] = WebPort.ToString(),
            ["WEB_PORT"] = WebPort.ToString(),
            ["HOSTNAME"] = LanWebBindHost,
            ["LOCALAI_API_ORIGIN"] = $"http://{LocalApiOriginHost}:{ApiPort}",
            ["PRISM_SERVER_NAME"] = ServerName,
            ["PRISM_DISCOVERY_ENABLED"] = DiscoveryEnabled ? "true" : "false",
            ["SESSION_COOKIE_NAME"] = SessionCookieName,
            ["SESSION_TTL_HOURS"] = SessionTtlHours.ToString(),
            ["ENCRYPTION_MASTER_KEY"] = EncryptionMasterKey,
            ["OLLAMA_HOST"] = OllamaHost,
            ["OLLAMA_MODEL"] = OllamaModel,
            ["QDRANT_URL"] = QdrantUrl,
            ["LOCALAI_DATA_DIR"] = dataDirectory,
            ["NEXT_TELEMETRY_DISABLED"] = "1",
            ["NODE_ENV"] = "production"
        };

        if (!string.IsNullOrWhiteSpace(OpenAiApiKey))
        {
            env["OPENAI_API_KEY"] = OpenAiApiKey;
        }

        return env;
    }
}
