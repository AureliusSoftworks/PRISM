using PrismServer.Core.Models;
using PrismServer.Core.Services;

namespace PrismServer.Tests;

public sealed class ConfigStoreTests
{
    [Fact]
    public void ParseEnv_SkipsCommentsAndKeepsValuesAfterEquals()
    {
        var env = ConfigStore.ParseEnv("""
            # comment
            API_PORT=18787
            OPENAI_API_KEY=sk-test=value
            BROKEN_LINE
            """);

        Assert.Equal("18787", env["API_PORT"]);
        Assert.Equal("sk-test=value", env["OPENAI_API_KEY"]);
        Assert.False(env.ContainsKey("BROKEN_LINE"));
    }

    [Fact]
    public void Load_MigratesLegacyDefaultPorts()
    {
        var temp = CreateTempRoot();
        var paths = new PrismPaths(baseDirectory: temp, localAppData: temp);
        Directory.CreateDirectory(paths.ApplicationSupportDirectory);
        File.WriteAllText(paths.EnvFilePath, "API_PORT=8787\nWEB_PORT=3000\n");

        var config = new ConfigStore(paths).Load();

        Assert.Equal(ServerConfig.Defaults.ApiPort, config.ApiPort);
        Assert.Equal(ServerConfig.Defaults.WebPort, config.WebPort);
    }

    [Fact]
    public void Save_WritesExpectedEnvFile()
    {
        var temp = CreateTempRoot();
        var paths = new PrismPaths(baseDirectory: temp, localAppData: temp);
        var store = new ConfigStore(paths);

        store.Save(ServerConfig.Defaults with { ServerName = "Kitchen Prism", OpenAiApiKey = "sk-test" });

        var raw = File.ReadAllText(paths.EnvFilePath);
        Assert.Contains("PRISM_SERVER_NAME=Kitchen Prism", raw);
        Assert.Contains("OLLAMA_AUXILIARY_MODEL=llama3.2", raw);
        Assert.Contains("OLLAMA_EMBEDDING_MODEL=nomic-embed-text", raw);
        Assert.Contains("OPENAI_API_KEY=sk-test", raw);
    }

    private static string CreateTempRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "prism-server-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }
}
