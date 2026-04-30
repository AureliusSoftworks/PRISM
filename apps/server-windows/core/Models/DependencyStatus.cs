namespace PrismServer.Core.Models;

public sealed record PillarStatus(string Name, bool IsReady, string Detail);

public sealed record ModelSubstatus(string Name, bool IsReady, string Detail);

public sealed record LocalAIPillarStatus(PillarStatus Ollama, ModelSubstatus DefaultModel);

public sealed record DependencyStatus(
    PillarStatus ServerRuntime,
    PillarStatus MemoryEngine,
    LocalAIPillarStatus LocalAI)
{
    public static DependencyStatus Unknown { get; } = new(
        new PillarStatus("Server Runtime", false, "Not checked yet."),
        new PillarStatus("Memory Engine", false, "Not checked yet."),
        new LocalAIPillarStatus(
            new PillarStatus("Local AI Engine", false, "Not checked yet."),
            new ModelSubstatus("Default model", false, "Not checked yet.")));

    /// <summary>
    /// Ollama is not a hard gate for running the local Node services; the Memory Engine is.
    /// </summary>
    public bool CanStartNodeRuntime => MemoryEngine.IsReady;
}
