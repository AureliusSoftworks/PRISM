using PrismServer.Core.Models;

namespace PrismServer.Core.Services;

public sealed class ConfigStore
{
    private const int LegacyDefaultApiPort = 8787;
    private const int LegacyDefaultWebPort = 3000;

    private readonly PrismPaths _paths;

    public ConfigStore(PrismPaths paths)
    {
        _paths = paths;
    }

    public string ApplicationSupportDirectory => _paths.ApplicationSupportDirectory;
    public string LogDirectory => _paths.LogDirectory;
    public string EnvFilePath => _paths.EnvFilePath;

    public ServerConfig Load()
    {
        if (!File.Exists(_paths.EnvFilePath))
        {
            return ServerConfig.Defaults;
        }

        var env = ParseEnv(File.ReadAllText(_paths.EnvFilePath));
        var defaults = ServerConfig.Defaults;
        var config = defaults with
        {
            ServerName = ReadString(env, "PRISM_SERVER_NAME", defaults.ServerName),
            ApiPort = ReadInt(env, "API_PORT", defaults.ApiPort),
            WebPort = ReadInt(env, "WEB_PORT", defaults.WebPort),
            DiscoveryEnabled = ReadBool(env, "PRISM_DISCOVERY_ENABLED", defaults.DiscoveryEnabled),
            SessionCookieName = ReadString(env, "SESSION_COOKIE_NAME", defaults.SessionCookieName),
            SessionTtlHours = ReadInt(env, "SESSION_TTL_HOURS", defaults.SessionTtlHours),
            EncryptionMasterKey = ReadString(env, "ENCRYPTION_MASTER_KEY", defaults.EncryptionMasterKey),
            OllamaHost = ReadString(env, "OLLAMA_HOST", defaults.OllamaHost),
            OllamaModel = ReadString(env, "OLLAMA_MODEL", defaults.OllamaModel),
            QdrantUrl = ReadString(env, "QDRANT_URL", defaults.QdrantUrl),
            OpenAiApiKey = ReadString(env, "OPENAI_API_KEY", defaults.OpenAiApiKey)
        };

        if (config.ApiPort == LegacyDefaultApiPort && config.WebPort == LegacyDefaultWebPort)
        {
            config = config with
            {
                ApiPort = defaults.ApiPort,
                WebPort = defaults.WebPort
            };
        }

        return config;
    }

    public void Save(ServerConfig config)
    {
        Directory.CreateDirectory(_paths.ApplicationSupportDirectory);
        Directory.CreateDirectory(_paths.LogDirectory);

        var lines = new[]
        {
            $"API_PORT={config.ApiPort}",
            $"WEB_PORT={config.WebPort}",
            $"PRISM_SERVER_NAME={config.ServerName}",
            $"PRISM_DISCOVERY_ENABLED={(config.DiscoveryEnabled ? "true" : "false")}",
            $"SESSION_COOKIE_NAME={config.SessionCookieName}",
            $"SESSION_TTL_HOURS={config.SessionTtlHours}",
            $"ENCRYPTION_MASTER_KEY={config.EncryptionMasterKey}",
            $"OLLAMA_HOST={config.OllamaHost}",
            $"OLLAMA_MODEL={config.OllamaModel}",
            $"QDRANT_URL={config.QdrantUrl}",
            $"OPENAI_API_KEY={config.OpenAiApiKey}",
            "NEXT_TELEMETRY_DISABLED=1"
        };

        File.WriteAllText(_paths.EnvFilePath, string.Join(Environment.NewLine, lines) + Environment.NewLine);
    }

    public static Dictionary<string, string> ParseEnv(string raw)
    {
        var env = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        using var reader = new StringReader(raw);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var trimmed = line.Trim();
            if (trimmed.Length == 0 || trimmed.StartsWith('#'))
            {
                continue;
            }

            var index = trimmed.IndexOf('=');
            if (index <= 0)
            {
                continue;
            }

            env[trimmed[..index]] = trimmed[(index + 1)..];
        }

        return env;
    }

    private static string ReadString(Dictionary<string, string> env, string key, string fallback) =>
        env.TryGetValue(key, out var value) ? value : fallback;

    private static int ReadInt(Dictionary<string, string> env, string key, int fallback) =>
        env.TryGetValue(key, out var value) && int.TryParse(value, out var parsed) ? parsed : fallback;

    private static bool ReadBool(Dictionary<string, string> env, string key, bool fallback)
    {
        if (!env.TryGetValue(key, out var value))
        {
            return fallback;
        }

        return value.Trim().ToLowerInvariant() switch
        {
            "1" or "true" or "yes" or "on" => true,
            "0" or "false" or "no" or "off" => false,
            _ => fallback
        };
    }
}
