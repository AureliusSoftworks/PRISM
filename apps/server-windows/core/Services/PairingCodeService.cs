using System.Net.Http.Json;
using PrismServer.Core.Models;

namespace PrismServer.Core.Services;

public sealed class PairingCodeService
{
    private readonly HttpClient _httpClient;

    public PairingCodeService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<DisplayPairingCode> CreatePairingCodeAsync(int apiPort, CancellationToken cancellationToken = default)
    {
        var uri = new Uri($"http://127.0.0.1:{apiPort}/api/local/pairing/codes");
        using var request = new HttpRequestMessage(HttpMethod.Post, uri);
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(TimeSpan.FromSeconds(5));

        using var response = await _httpClient.SendAsync(request, cts.Token).ConfigureAwait(false);
        if ((int)response.StatusCode != 201)
        {
            throw new InvalidOperationException("Could not generate a pairing code. Make sure Prism Server is running.");
        }

        var decoded = await response.Content.ReadFromJsonAsync<PairingResponse>(cancellationToken: cts.Token).ConfigureAwait(false);
        if (decoded is null || !decoded.Ok || decoded.PairingCode is null)
        {
            throw new InvalidOperationException("Prism Server did not accept the pairing request.");
        }

        return new DisplayPairingCode(decoded.PairingCode.Code, decoded.PairingCode.ExpiresAt);
    }

    private sealed record PairingResponse(bool Ok, PairingCodePayload? PairingCode);
    private sealed record PairingCodePayload(string Code, DateTimeOffset ExpiresAt);
}
