using PrismServer.Core.Services;

namespace PrismServer.Tests;

public sealed class OllamaModelInstallerTests
{
    [Theory]
    [InlineData("llama3.2")]
    [InlineData("hf.co/example/model:Q4_K_M")]
    [InlineData("namespace/model-name_1.0")]
    public void ValidateModelName_AcceptsOllamaNames(string model)
    {
        Assert.Equal(model, OllamaModelInstaller.ValidateModelName(model));
    }

    [Theory]
    [InlineData("")]
    [InlineData("bad model")]
    [InlineData("model;rm")]
    public void ValidateModelName_RejectsUnsafeNames(string model)
    {
        Assert.Throws<InvalidOperationException>(() => OllamaModelInstaller.ValidateModelName(model));
    }
}
