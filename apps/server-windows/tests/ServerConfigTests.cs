using PrismServer.Core.Models;

namespace PrismServer.Tests;

public sealed class ServerConfigTests
{
    [Fact]
    public void BuildEnvironment_UsesWindowsAppDataAndServerPorts()
    {
        var config = ServerConfig.Defaults with
        {
            ServerName = "Office Prism",
            ApiPort = 18787,
            WebPort = 18788,
            OpenAiApiKey = "sk-test"
        };

        var env = config.BuildEnvironment("C:\\Users\\Jared\\AppData\\Local\\Prism");

        Assert.Equal("18787", env["API_PORT"]);
        Assert.Equal("18788", env["PORT"]);
        // Private by default: the web server binds to loopback unless LAN access is on.
        Assert.Equal("127.0.0.1", env["HOSTNAME"]);
        Assert.Equal("false", env["PRISM_LAN_ACCESS"]);
        Assert.Equal("http://127.0.0.1:18787", env["LOCALAI_API_ORIGIN"]);
        Assert.Equal("Office Prism", env["PRISM_SERVER_NAME"]);
        Assert.Equal("llama3.2", env["OLLAMA_AUXILIARY_MODEL"]);
        Assert.Equal("nomic-embed-text", env["OLLAMA_EMBEDDING_MODEL"]);
        Assert.Equal("C:\\Users\\Jared\\AppData\\Local\\Prism" + Path.DirectorySeparatorChar + "Data", env["LOCALAI_DATA_DIR"]);
        Assert.Equal("sk-test", env["OPENAI_API_KEY"]);
    }

    [Fact]
    public void BuildEnvironment_BindsAllInterfacesWhenLanAccessEnabled()
    {
        var config = ServerConfig.Defaults with { LanAccessEnabled = true };

        var env = config.BuildEnvironment("C:\\Users\\Jared\\AppData\\Local\\Prism");

        Assert.Equal("0.0.0.0", env["HOSTNAME"]);
        Assert.Equal("true", env["PRISM_LAN_ACCESS"]);
        Assert.Equal("1", env["PRISM_WEB_LAN"]);
    }
}
