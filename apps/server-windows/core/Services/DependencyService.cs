using System.Net.Http.Json;
using PrismServer.Core.Models;

namespace PrismServer.Core.Services;

public sealed class DependencyService
{
    private readonly HttpClient _httpClient;
    private readonly QdrantBinaryResolver _qdrantBinaryResolver;
    private readonly ICommandLocator _commandLocator;

    public DependencyService(HttpClient httpClient, QdrantBinaryResolver qdrantBinaryResolver, ICommandLocator commandLocator)
    {
        _httpClient = httpClient;
        _qdrantBinaryResolver = qdrantBinaryResolver;
        _commandLocator = commandLocator;
    }

    public async Task<DependencyStatus> CheckAsync(ServerConfig config, QdrantResolution resolution, CancellationToken cancellationToken = default)
    {
        var ollamaBase = OllamaUrl.NormalizeBase(config.OllamaHost);
        var (tags, ollamaReachable) = await RequestOllamaModelNamesAsync(ollamaBase, cancellationToken).ConfigureAwait(false);
        var local = LocalAiPillar(config, ollamaBase, tags, ollamaReachable);
        var mem = await MemoryPillarAsync(resolution, cancellationToken).ConfigureAwait(false);
        var server = new PillarStatus(
            "Server Runtime",
            mem.IsReady,
            mem.IsReady
                ? "The local API, discovery, and pairing surface are ready to start."
                : "The Memory Engine must be available before the server can run.");

        return new DependencyStatus(server, mem, local);
    }

    private async Task<PillarStatus> MemoryPillarAsync(QdrantResolution resolution, CancellationToken cancellationToken)
    {
        switch (resolution.Ownership)
        {
            case QdrantOwnership.ExternalUserManaged:
                var externalOk = await IsReadyzReachableAsync(resolution.EffectiveQdrantUrl, cancellationToken).ConfigureAwait(false);
                return new PillarStatus(
                    "Memory Engine",
                    externalOk,
                    externalOk
                        ? "Qdrant is responding at your configured URL."
                        : "Qdrant is not reachable at your configured URL. Check the service or Advanced settings.");

            case QdrantOwnership.ManagedByPrism:
                if (await IsReadyzReachableAsync(resolution.EffectiveQdrantUrl, cancellationToken).ConfigureAwait(false))
                {
                    return new PillarStatus("Memory Engine", true, "Prism-managed Qdrant is running on this PC.");
                }

                return _qdrantBinaryResolver.FindExecutable() is not null
                    ? new PillarStatus("Memory Engine", false, "Prism can start a local Qdrant sidecar for you on this PC.")
                    : new PillarStatus("Memory Engine", false, "Qdrant binary is missing. Reinstall Prism Server or set an external Qdrant URL in Advanced.");

            default:
                throw new InvalidOperationException("Unknown Qdrant ownership.");
        }
    }

    private LocalAIPillarStatus LocalAiPillar(ServerConfig config, string ollamaHost, IReadOnlyCollection<string> tags, bool ollamaReachable)
    {
        var onPath = _commandLocator.FindExecutable("ollama.exe") is not null || _commandLocator.FindExecutable("ollama") is not null;
        var model = config.OllamaModel.Trim();
        var modelOk = ModelPresent(tags, model);

        var ollamaDetail = ollamaReachable
            ? $"Ollama is responding at {ollamaHost}."
            : onPath
                ? "Ollama is installed but not reachable. Start it, then refresh."
                : "Ollama is not installed or not on PATH. Install it when you are ready to use local models.";

        string modelDetail;
        if (model.Length == 0)
        {
            modelDetail = "No default model is configured.";
        }
        else if (!ollamaReachable)
        {
            modelDetail = $"Can't verify \"{model}\" until Ollama is running.";
        }
        else if (modelOk)
        {
            modelDetail = $"The model \"{model}\" is available in Ollama.";
        }
        else
        {
            modelDetail = $"Pull \"{model}\" in Ollama when you are ready, or change the default model in Advanced.";
        }

        return new LocalAIPillarStatus(
            new PillarStatus("Local AI Engine", ollamaReachable, ollamaDetail),
            new ModelSubstatus($"Default model ({(model.Length == 0 ? "-" : model)})", modelOk && ollamaReachable, modelDetail));
    }

    private static bool ModelPresent(IEnumerable<string> tagNames, string configured)
    {
        var c = configured.Trim();
        if (c.Length == 0)
        {
            return false;
        }

        return tagNames.Any(tag => tag == c || tag.StartsWith(c + ":", StringComparison.Ordinal));
    }

    private async Task<(IReadOnlyList<string> Tags, bool Reachable)> RequestOllamaModelNamesAsync(string ollamaBase, CancellationToken cancellationToken)
    {
        var uri = OllamaUrl.TagsUri(ollamaBase);
        if (uri is null)
        {
            return (Array.Empty<string>(), false);
        }

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(2));
            using var response = await _httpClient.GetAsync(uri, cts.Token).ConfigureAwait(false);
            if ((int)response.StatusCode is < 200 or >= 500)
            {
                return (Array.Empty<string>(), false);
            }

            var decoded = await response.Content.ReadFromJsonAsync<TagsResponse>(cancellationToken: cts.Token).ConfigureAwait(false);
            return (decoded?.Models?.Select(model => model.Name).Where(name => !string.IsNullOrWhiteSpace(name)).ToArray() ?? Array.Empty<string>(), true);
        }
        catch
        {
            return (Array.Empty<string>(), false);
        }
    }

    internal async Task<bool> IsReadyzReachableAsync(string baseUrl, CancellationToken cancellationToken = default)
    {
        var uri = QdrantUrl.ReadyzUri(baseUrl);
        if (uri is null)
        {
            return false;
        }

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(2));
            using var response = await _httpClient.GetAsync(uri, cts.Token).ConfigureAwait(false);
            return (int)response.StatusCode is >= 200 and < 300;
        }
        catch
        {
            return false;
        }
    }

    private sealed record TagsResponse(ModelEntry[]? Models);
    private sealed record ModelEntry(string Name);
}
