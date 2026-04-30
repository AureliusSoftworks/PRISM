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
        Assert.Equal("0.0.0.0", env["HOSTNAME"]);
        Assert.Equal("http://127.0.0.1:18787", env["LOCALAI_API_ORIGIN"]);
        Assert.Equal("Office Prism", env["PRISM_SERVER_NAME"]);
        Assert.Equal("C:\\Users\\Jared\\AppData\\Local\\Prism" + Path.DirectorySeparatorChar + "Data", env["LOCALAI_DATA_DIR"]);
        Assert.Equal("sk-test", env["OPENAI_API_KEY"]);
    }
}
