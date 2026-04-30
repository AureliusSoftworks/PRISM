namespace PrismServer.Core.Models;

public sealed record DisplayPairingCode(string Code, DateTimeOffset ExpiresAt)
{
    public string ExpirationSummary => ExpiresAt.ToLocalTime().ToString("t");
}
