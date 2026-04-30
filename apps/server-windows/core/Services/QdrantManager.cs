using System.Diagnostics;
using PrismServer.Core.Models;

namespace PrismServer.Core.Services;

public sealed class QdrantManager : IDisposable
{
    private readonly PrismPaths _paths;
    private readonly QdrantBinaryResolver _resolver;
    private readonly HttpClient _httpClient;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private Process? _process;
    private ProcessJob? _job;
    private bool _weStartedChild;

    public QdrantManager(PrismPaths paths, QdrantBinaryResolver resolver, HttpClient httpClient)
    {
        _paths = paths;
        _resolver = resolver;
        _httpClient = httpClient;
    }

    public async Task StartIfNeededAsync(QdrantResolution resolution, CancellationToken cancellationToken = default)
    {
        if (resolution.Ownership != QdrantOwnership.ManagedByPrism)
        {
            return;
        }

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_weStartedChild && _process is { HasExited: false })
            {
                return;
            }

            if (await IsReadyzUpAsync(resolution.EffectiveQdrantUrl, TimeSpan.FromMilliseconds(1200), cancellationToken).ConfigureAwait(false))
            {
                throw new InvalidOperationException("Qdrant is already responding on port 6333. Stop the other process or set a custom Qdrant URL in Advanced.");
            }

            var binary = _resolver.FindExecutable() ?? throw new InvalidOperationException("Qdrant binary is missing. Reinstall Prism Server or set an external Qdrant URL in Advanced.");
            Directory.CreateDirectory(_paths.LogDirectory);
            Directory.CreateDirectory(_paths.QdrantStorageDirectory);
            Directory.CreateDirectory(_paths.QdrantDirectory);

            StartProcess(binary);
        }
        finally
        {
            _gate.Release();
        }

        var ready = await WaitForReadyAsync(resolution, TimeSpan.FromSeconds(60), cancellationToken).ConfigureAwait(false);
        if (!ready)
        {
            await StopAsync().ConfigureAwait(false);
            throw new InvalidOperationException("Qdrant did not become ready in time. See qdrant.log for details.");
        }
    }

    public async Task StopAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            StopProcessLocked();
        }
        finally
        {
            _gate.Release();
        }
    }

    private void StartProcess(string binary)
    {
        StopProcessLocked();
        var logPath = Path.Combine(_paths.LogDirectory, "qdrant.log");
        File.AppendAllText(logPath, $"{Environment.NewLine}--- Prism Qdrant launch {DateTimeOffset.Now} ---{Environment.NewLine}");

        var startInfo = new ProcessStartInfo
        {
            FileName = binary,
            WorkingDirectory = _paths.QdrantDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        startInfo.Environment["QDRANT__STORAGE__STORAGE_PATH"] = _paths.QdrantStorageDirectory;
        startInfo.Environment["QDRANT__SERVICE__HTTP_PORT"] = "6333";
        startInfo.Environment["QDRANT__SERVICE__GRPC_PORT"] = "6334";

        var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
        process.OutputDataReceived += (_, e) => AppendLog(logPath, e.Data);
        process.ErrorDataReceived += (_, e) => AppendLog(logPath, e.Data);
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        _job = new ProcessJob();
        _job.Add(process);
        _process = process;
        _weStartedChild = true;
    }

    private async Task<bool> WaitForReadyAsync(QdrantResolution resolution, TimeSpan timeout, CancellationToken cancellationToken)
    {
        var deadline = DateTimeOffset.UtcNow.Add(timeout);
        while (DateTimeOffset.UtcNow < deadline)
        {
            if (await IsReadyzUpAsync(resolution.EffectiveQdrantUrl, TimeSpan.FromSeconds(2), cancellationToken).ConfigureAwait(false))
            {
                return true;
            }

            if (!_weStartedChild || _process is null || _process.HasExited)
            {
                return false;
            }

            await Task.Delay(TimeSpan.FromMilliseconds(200), cancellationToken).ConfigureAwait(false);
        }

        return false;
    }

    private async Task<bool> IsReadyzUpAsync(string baseUrl, TimeSpan timeout, CancellationToken cancellationToken)
    {
        var uri = QdrantUrl.ReadyzUri(baseUrl);
        if (uri is null)
        {
            return false;
        }

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(timeout);
            using var response = await _httpClient.GetAsync(uri, cts.Token).ConfigureAwait(false);
            return (int)response.StatusCode == 200;
        }
        catch
        {
            return false;
        }
    }

    private void StopProcessLocked()
    {
        if (!_weStartedChild || _process is null)
        {
            _process = null;
            _weStartedChild = false;
            _job?.Dispose();
            _job = null;
            return;
        }

        try
        {
            if (!_process.HasExited)
            {
                _process.Kill(entireProcessTree: true);
                _process.WaitForExit(5000);
            }
        }
        catch
        {
            // Shutdown is best-effort; the Job Object closes below.
        }
        finally
        {
            _process.Dispose();
            _process = null;
            _weStartedChild = false;
            _job?.Dispose();
            _job = null;
        }
    }

    private static void AppendLog(string logPath, string? line)
    {
        if (line is not null)
        {
            File.AppendAllText(logPath, line + Environment.NewLine);
        }
    }

    public void Dispose()
    {
        StopProcessLocked();
        _gate.Dispose();
    }
}
