namespace PrismServer.Core.Models;

public enum QdrantOwnership
{
    ManagedByPrism,
    ExternalUserManaged
}

public sealed record QdrantResolution(QdrantOwnership Ownership, string EffectiveQdrantUrl);
