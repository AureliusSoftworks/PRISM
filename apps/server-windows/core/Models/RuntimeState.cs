namespace PrismServer.Core.Models;

public enum RuntimeStatus
{
    Stopped,
    Starting,
    Running,
    Failed
}

public sealed record RuntimeState(RuntimeStatus Status, string? Message = null)
{
    public static RuntimeState Stopped { get; } = new(RuntimeStatus.Stopped);
    public static RuntimeState Starting { get; } = new(RuntimeStatus.Starting);
    public static RuntimeState Running { get; } = new(RuntimeStatus.Running);

    public static RuntimeState Failed(string message) => new(RuntimeStatus.Failed, message);

    public bool IsRunning => Status == RuntimeStatus.Running;

    public override string ToString() => Status == RuntimeStatus.Failed && !string.IsNullOrWhiteSpace(Message)
        ? $"Stopped: {Message}"
        : Status.ToString();
}
