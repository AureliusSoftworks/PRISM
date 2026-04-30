using PrismServer.Core.Models;

namespace PrismServer.Core.Services;

public sealed class QdrantResolutionService
{
    private readonly HttpClient _httpClient;

    public QdrantResolutionService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<QdrantResolution> ResolveAsync(ServerConfig config, CancellationToken cancellationToken = default)
    {
        var configured = QdrantUrl.Normalize(config.QdrantUrl);
        var defaults = QdrantUrl.Normalize(ServerConfig.Defaults.QdrantUrl);

        if (configured != defaults && await IsReadyzReachableAsync(configured, cancellationToken).ConfigureAwait(false))
        {
            return new QdrantResolution(QdrantOwnership.ExternalUserManaged, configured);
        }

        if (configured == defaults && await IsReadyzReachableAsync(defaults, cancellationToken).ConfigureAwait(false))
        {
            return new QdrantResolution(QdrantOwnership.ExternalUserManaged, defaults);
        }

        return new QdrantResolution(QdrantOwnership.ManagedByPrism, defaults);
    }

    private async Task<bool> IsReadyzReachableAsync(string baseUrl, CancellationToken cancellationToken)
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
}
