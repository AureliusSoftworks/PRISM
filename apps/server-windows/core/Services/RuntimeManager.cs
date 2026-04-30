using System.Diagnostics;
using PrismServer.Core.Models;

namespace PrismServer.Core.Services;

public sealed class RuntimeManager : IDisposable
{
    private readonly PrismPaths _paths;
    private readonly ConfigStore _configStore;
    private readonly QdrantManager _qdrantManager;
    private readonly ICommandLocator _commandLocator;
    private Process? _apiProcess;
    private Process? _webProcess;
    private ProcessJob? _job;
    private readonly bool _startsBundledWebDashboard = true;

    public RuntimeManager(PrismPaths paths, ConfigStore configStore, QdrantManager qdrantManager, ICommandLocator commandLocator)
    {
        _paths = paths;
        _configStore = configStore;
        _qdrantManager = qdrantManager;
        _commandLocator = commandLocator;
    }

    public event Action<RuntimeState>? StateChanged;

    public async Task StartMemoryEngineAsync(QdrantResolution resolution, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(_paths.LogDirectory);
        Directory.CreateDirectory(_paths.ApplicationSupportDirectory);
        await _qdrantManager.StartIfNeededAsync(resolution, cancellationToken).ConfigureAwait(false);
    }

    public async Task StartAsync(ServerConfig config, QdrantResolution resolution, CancellationToken cancellationToken = default)
    {
        if (_apiProcess is { HasExited: false } || _webProcess is { HasExited: false })
        {
            StateChanged?.Invoke(RuntimeState.Running);
            return;
        }

        Directory.CreateDirectory(_paths.LogDirectory);
        Directory.CreateDirectory(_paths.ApplicationSupportDirectory);
        await _qdrantManager.StartIfNeededAsync(resolution, cancellationToken).ConfigureAwait(false);

        var runtimeRoot = RuntimeRoot();
        var environment = MergeEnvironment(config, resolution.EffectiveQdrantUrl);
        _job = new ProcessJob();

        _apiProcess = StartNodeProcess(
            "API",
            runtimeRoot,
            "apps/api/dist/server.js",
            ".",
            environment,
            Path.Combine(_paths.LogDirectory, "api.log"));

        if (_startsBundledWebDashboard)
        {
            _webProcess = StartNodeProcess(
                "Web",
                runtimeRoot,
                "apps/web/.next/standalone/apps/web/server.js",
                "apps/web/.next/standalone",
                environment,
                Path.Combine(_paths.LogDirectory, "web.log"));
        }

        StateChanged?.Invoke(RuntimeState.Running);
    }

    public void Stop()
    {
        StopProcess(_webProcess);
        StopProcess(_apiProcess);
        _webProcess = null;
        _apiProcess = null;
        _job?.Dispose();
        _job = null;
        _qdrantManager.StopAsync().GetAwaiter().GetResult();
        StateChanged?.Invoke(RuntimeState.Stopped);
    }

    private string RuntimeRoot()
    {
        if (!Directory.Exists(_paths.RuntimeDirectory))
        {
            throw new InvalidOperationException("Runtime bundle is missing. Reinstall Prism Server.");
        }

        return _paths.RuntimeDirectory;
    }

    private Dictionary<string, string> MergeEnvironment(ServerConfig config, string qdrantUrl)
    {
        var env = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (System.Collections.DictionaryEntry entry in Environment.GetEnvironmentVariables())
        {
            if (entry.Key is string key && entry.Value is string value)
            {
                env[key] = value;
            }
        }

        foreach (var (key, value) in config.BuildEnvironment(_configStore.ApplicationSupportDirectory))
        {
            env[key] = value;
        }

        env["QDRANT_URL"] = qdrantUrl;
        return env;
    }

    private Process StartNodeProcess(
        string name,
        string runtimeRoot,
        string entryRelativePath,
        string workingDirectoryRelativePath,
        IReadOnlyDictionary<string, string> environment,
        string logPath)
    {
        var entryPath = Path.Combine(runtimeRoot, entryRelativePath.Replace('/', Path.DirectorySeparatorChar));
        if (!File.Exists(entryPath))
        {
            throw new InvalidOperationException($"{name} entrypoint is missing at {entryPath}.");
        }

        var node = File.Exists(_paths.BundledNodePath)
            ? _paths.BundledNodePath
            : _commandLocator.FindExecutable("node.exe") ?? _commandLocator.FindExecutable("node") ?? throw new InvalidOperationException("Node.js is missing. Reinstall Prism Server.");

        File.AppendAllText(logPath, $"{Environment.NewLine}--- Prism Server {name} launch {DateTimeOffset.Now} ---{Environment.NewLine}");
        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = node,
                WorkingDirectory = Path.Combine(runtimeRoot, workingDirectoryRelativePath.Replace('/', Path.DirectorySeparatorChar)),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            },
            EnableRaisingEvents = true
        };
        process.StartInfo.ArgumentList.Add(entryPath);
        foreach (var (key, value) in environment)
        {
            process.StartInfo.Environment[key] = value;
        }

        process.OutputDataReceived += (_, e) => AppendLog(logPath, e.Data);
        process.ErrorDataReceived += (_, e) => AppendLog(logPath, e.Data);
        process.Exited += (_, _) =>
        {
            if (process.ExitCode != 0)
            {
                StateChanged?.Invoke(RuntimeState.Failed($"{name} exited with status {process.ExitCode}."));
            }
        };

        process.Start();
        _job?.Add(process);
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private static void StopProcess(Process? process)
    {
        if (process is null)
        {
            return;
        }

        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                process.WaitForExit(5000);
            }
        }
        catch
        {
            // Process may have exited between checks; shutdown stays best-effort.
        }
        finally
        {
            process.Dispose();
        }
    }

    private static void AppendLog(string logPath, string? line)
    {
        if (line is not null)
        {
            File.AppendAllText(logPath, line + Environment.NewLine);
        }
    }

    public void Dispose() => Stop();
}
