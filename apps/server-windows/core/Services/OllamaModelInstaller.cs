using System.Diagnostics;
using System.Text.RegularExpressions;

namespace PrismServer.Core.Services;

public sealed partial class OllamaModelInstaller
{
    private readonly PrismPaths _paths;
    private readonly ICommandLocator _commandLocator;

    public OllamaModelInstaller(PrismPaths paths, ICommandLocator commandLocator)
    {
        _paths = paths;
        _commandLocator = commandLocator;
    }

    public async Task PullAsync(string rawModel, CancellationToken cancellationToken = default)
    {
        var model = ValidateModelName(rawModel);
        var executable = _commandLocator.FindExecutable("ollama.exe") ?? _commandLocator.FindExecutable("ollama");
        if (executable is null)
        {
            throw new InvalidOperationException("Ollama is not installed or is not on PATH.");
        }

        Directory.CreateDirectory(_paths.LogDirectory);
        var logPath = Path.Combine(_paths.LogDirectory, "ollama-model.log");
        await File.AppendAllTextAsync(logPath, $"{Environment.NewLine}--- Ollama model download {DateTimeOffset.Now} ---{Environment.NewLine}", cancellationToken).ConfigureAwait(false);

        using var process = new Process();
        process.StartInfo = new ProcessStartInfo
        {
            FileName = executable,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        process.StartInfo.ArgumentList.Add("pull");
        process.StartInfo.ArgumentList.Add(model);
        AttachLog(process, logPath);

        if (!process.Start())
        {
            throw new InvalidOperationException("Could not start Ollama model download.");
        }
        BeginLogPump(process);

        await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"Ollama model download failed with status {process.ExitCode}. See ollama-model.log for details.");
        }
    }

    public static string ValidateModelName(string raw)
    {
        var model = raw.Trim();
        if (model.Length == 0)
        {
            throw new InvalidOperationException("Choose a model before downloading.");
        }

        if (!ModelNameRegex().IsMatch(model))
        {
            throw new InvalidOperationException("Model names can contain letters, numbers, colon, slash, dot, underscore, and hyphen.");
        }

        return model;
    }

    private static void AttachLog(Process process, string logPath)
    {
        process.OutputDataReceived += (_, e) => AppendLine(logPath, e.Data);
        process.ErrorDataReceived += (_, e) => AppendLine(logPath, e.Data);
        process.EnableRaisingEvents = true;
        process.Exited += (_, _) => { };

        process.StartInfo.RedirectStandardOutput = true;
        process.StartInfo.RedirectStandardError = true;
    }

    internal static void BeginLogPump(Process process)
    {
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
    }

    private static void AppendLine(string logPath, string? line)
    {
        if (line is null)
        {
            return;
        }

        File.AppendAllText(logPath, line + Environment.NewLine);
    }

    [GeneratedRegex("^[a-zA-Z0-9:/._-]+$")]
    private static partial Regex ModelNameRegex();
}
