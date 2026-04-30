using PrismServer.Core.Services;

namespace PrismServer.Tests;

public sealed class UrlHelperTests
{
    [Theory]
    [InlineData("127.0.0.1:6333/", "http://127.0.0.1:6333")]
    [InlineData("http://0.0.0.0:6333", "http://127.0.0.1:6333")]
    [InlineData("", "http://127.0.0.1:6333")]
    [InlineData("not a url", "http://127.0.0.1:6333")]
    public void QdrantNormalize_MatchesMacRules(string raw, string expected)
    {
        Assert.Equal(expected, QdrantUrl.Normalize(raw));
    }

    [Theory]
    [InlineData("localhost:11434/", "http://localhost:11434")]
    [InlineData("http://0.0.0.0:11434", "http://127.0.0.1:11434")]
    [InlineData("", "http://127.0.0.1:11434")]
    public void OllamaNormalize_MatchesMacRules(string raw, string expected)
    {
        Assert.Equal(expected, OllamaUrl.NormalizeBase(raw));
    }
}
