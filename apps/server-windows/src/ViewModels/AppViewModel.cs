using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Input;
using PrismServer.Core.Models;
using PrismServer.Core.Services;

namespace PrismServer.ViewModels;

public sealed class AppViewModel : INotifyPropertyChanged, IDisposable
{
    private readonly PrismPaths _paths;
    private readonly ConfigStore _configStore;
    private readonly RuntimeManager _runtimeManager;
    private readonly DependencyService _dependencyService;
    private readonly QdrantResolutionService _qdrantResolutionService;
    private readonly OllamaModelInstaller _ollamaModelInstaller;
    private readonly PairingCodeService _pairingCodeService;
    private readonly LogTailer _logTailer;
    private readonly List<ICommand> _commands = new();

    private ServerConfig _config;
    private DependencyStatus _dependencyStatus = DependencyStatus.Unknown;
    private RuntimeState _runtimeState = RuntimeState.Stopped;
    private QdrantResolution? _qdrantResolution;
    private string? _setupMessage;
    private bool _isStartingMemoryEngine;
    private bool _isDownloadingModel;
    private bool _isInstallingOllama;
    private DisplayPairingCode? _pairingCode;
    private bool _isGeneratingPairingCode;

    public AppViewModel(
        PrismPaths paths,
        ConfigStore configStore,
        RuntimeManager runtimeManager,
        DependencyService dependencyService,
        QdrantResolutionService qdrantResolutionService,
        OllamaModelInstaller ollamaModelInstaller,
        PairingCodeService pairingCodeService,
        LogTailer logTailer)
    {
        _paths = paths;
        _configStore = configStore;
        _runtimeManager = runtimeManager;
        _dependencyService = dependencyService;
        _qdrantResolutionService = qdrantResolutionService;
        _ollamaModelInstaller = ollamaModelInstaller;
        _pairingCodeService = pairingCodeService;
        _logTailer = logTailer;
        _config = _configStore.Load();

        SetUpPrismCommand = Track(new AsyncRelayCommand(SetUpPrismAsync, () => RuntimeState.Status is not RuntimeStatus.Starting && !RuntimeState.IsRunning));
        StartCommand = Track(new AsyncRelayCommand(StartNodeStackAsync, () => RuntimeState.Status is not RuntimeStatus.Starting && !RuntimeState.IsRunning));
        StopCommand = Track(new RelayCommand(Stop, () => RuntimeState.IsRunning || RuntimeState.Status == RuntimeStatus.Failed));
        RestartCommand = Track(new AsyncRelayCommand(RestartAsync, () => RuntimeState.IsRunning));
        RefreshCommand = Track(new AsyncRelayCommand(RefreshDependenciesAsync));
        StartMemoryEngineCommand = Track(new AsyncRelayCommand(StartMemoryEngineAsync, () => CanStartManagedMemoryEngine));
        DownloadDefaultModelCommand = Track(new AsyncRelayCommand(DownloadDefaultModelAsync, () => CanDownloadDefaultModel));
        InstallOllamaCommand = Track(new AsyncRelayCommand(InstallOllamaAsync, () => CanInstallOllama));
        GeneratePairingCodeCommand = Track(new AsyncRelayCommand(GeneratePairingCodeAsync, () => RuntimeState.IsRunning && !IsGeneratingPairingCode));
        SaveConfigCommand = Track(new RelayCommand(SaveConfig));
        SaveAndRefreshCommand = Track(new AsyncRelayCommand(async () => { SaveConfig(); await RefreshDependenciesAsync().ConfigureAwait(true); }));

        _runtimeManager.StateChanged += state => System.Windows.Application.Current.Dispatcher.Invoke(() => RuntimeState = state);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public ICommand SetUpPrismCommand { get; }
    public ICommand StartCommand { get; }
    public ICommand StopCommand { get; }
    public ICommand RestartCommand { get; }
    public ICommand RefreshCommand { get; }
    public ICommand StartMemoryEngineCommand { get; }
    public ICommand DownloadDefaultModelCommand { get; }
    public ICommand InstallOllamaCommand { get; }
    public ICommand GeneratePairingCodeCommand { get; }
    public ICommand SaveConfigCommand { get; }
    public ICommand SaveAndRefreshCommand { get; }

    public DependencyStatus DependencyStatus
    {
        get => _dependencyStatus;
        private set => SetField(ref _dependencyStatus, value);
    }

    public RuntimeState RuntimeState
    {
        get => _runtimeState;
        private set
        {
            if (SetField(ref _runtimeState, value))
            {
                OnPropertyChanged(nameof(StatusText));
                OnPropertyChanged(nameof(IsRunning));
                OnPropertyChanged(nameof(PrimaryActionTitle));
                OnPropertyChanged(nameof(CanGeneratePairingCode));
                RaiseCommandStates();
            }
        }
    }

    public string StatusText => RuntimeState.Status switch
    {
        RuntimeStatus.Running => "Running",
        RuntimeStatus.Starting => "Starting...",
        RuntimeStatus.Failed => $"Stopped: {RuntimeState.Message}",
        _ => "Stopped"
    };

    public bool IsRunning => RuntimeState.IsRunning;
    public bool CanGeneratePairingCode => RuntimeState.IsRunning && !IsGeneratingPairingCode;

    public string PrimaryActionTitle => RuntimeState.Status switch
    {
        RuntimeStatus.Running => "Server Ready",
        RuntimeStatus.Starting => "Starting Prism...",
        _ => "Set Up Prism"
    };

    public string? SetupMessage
    {
        get => _setupMessage;
        private set => SetField(ref _setupMessage, value);
    }

    public bool IsStartingMemoryEngine
    {
        get => _isStartingMemoryEngine;
        private set
        {
            if (SetField(ref _isStartingMemoryEngine, value))
            {
                OnPropertyChanged(nameof(CanStartManagedMemoryEngine));
                RaiseCommandStates();
            }
        }
    }

    public bool IsDownloadingModel
    {
        get => _isDownloadingModel;
        private set
        {
            if (SetField(ref _isDownloadingModel, value))
            {
                OnPropertyChanged(nameof(CanDownloadDefaultModel));
                OnPropertyChanged(nameof(RequiredModelDownloadLabel));
                RaiseCommandStates();
            }
        }
    }

    public bool IsInstallingOllama
    {
        get => _isInstallingOllama;
        private set
        {
            if (SetField(ref _isInstallingOllama, value))
            {
                OnPropertyChanged(nameof(CanInstallOllama));
                RaiseCommandStates();
            }
        }
    }

    public DisplayPairingCode? PairingCode
    {
        get => _pairingCode;
        private set
        {
            if (SetField(ref _pairingCode, value))
            {
                OnPropertyChanged(nameof(HasPairingCode));
                OnPropertyChanged(nameof(PairingCodeText));
                OnPropertyChanged(nameof(PairingExpirationText));
            }
        }
    }

    public bool HasPairingCode => PairingCode is not null;
    public string PairingCodeText => PairingCode?.Code ?? string.Empty;
    public string PairingExpirationText => PairingCode is null ? string.Empty : $"Expires at {PairingCode.ExpirationSummary}.";

    public bool IsGeneratingPairingCode
    {
        get => _isGeneratingPairingCode;
        private set
        {
            if (SetField(ref _isGeneratingPairingCode, value))
            {
                OnPropertyChanged(nameof(CanGeneratePairingCode));
                RaiseCommandStates();
            }
        }
    }

    public string ServerName
    {
        get => _config.ServerName;
        set => UpdateConfig(_config with { ServerName = value });
    }

    public int ApiPort
    {
        get => _config.ApiPort;
        set => UpdateConfig(_config with { ApiPort = value });
    }

    public int WebPort
    {
        get => _config.WebPort;
        set => UpdateConfig(_config with { WebPort = value });
    }

    public bool LanAccessEnabled
    {
        get => _config.LanAccessEnabled;
        set => UpdateConfig(_config with { LanAccessEnabled = value });
    }

    public bool DiscoveryEnabled
    {
        get => _config.DiscoveryEnabled;
        set => UpdateConfig(_config with { DiscoveryEnabled = value });
    }

    public string OllamaHost
    {
        get => _config.OllamaHost;
        set => UpdateConfig(_config with { OllamaHost = value });
    }

    public string OllamaModel
    {
        get => _config.OllamaModel;
        set => UpdateConfig(_config with { OllamaModel = value });
    }

    public string OllamaAuxiliaryModel
    {
        get => _config.OllamaAuxiliaryModel;
        set => UpdateConfig(_config with { OllamaAuxiliaryModel = value });
    }

    public string OllamaEmbeddingModel
    {
        get => _config.OllamaEmbeddingModel;
        set => UpdateConfig(_config with { OllamaEmbeddingModel = value });
    }

    public string QdrantUrl
    {
        get => _config.QdrantUrl;
        set => UpdateConfig(_config with { QdrantUrl = value });
    }

    public string EncryptionMasterKey
    {
        get => _config.EncryptionMasterKey;
        set => UpdateConfig(_config with { EncryptionMasterKey = value });
    }

    public string SessionCookieName
    {
        get => _config.SessionCookieName;
        set => UpdateConfig(_config with { SessionCookieName = value });
    }

    public int SessionTtlHours
    {
        get => _config.SessionTtlHours;
        set => UpdateConfig(_config with { SessionTtlHours = value });
    }

    public string OpenAiApiKey
    {
        get => _config.OpenAiApiKey;
        set => UpdateConfig(_config with { OpenAiApiKey = value });
    }

    public bool CanStartManagedMemoryEngine =>
        _qdrantResolution?.Ownership == QdrantOwnership.ManagedByPrism &&
        !DependencyStatus.MemoryEngine.IsReady &&
        !IsStartingMemoryEngine;

    public bool CanDownloadDefaultModel =>
        DependencyStatus.LocalAI.Ollama.IsReady &&
        MissingRequiredModelNames.Count > 0 &&
        !IsDownloadingModel;

    public bool CanInstallOllama =>
        DependencyStatus.LocalAI.CanAutoInstallOllama &&
        !DependencyStatus.LocalAI.Ollama.IsReady &&
        !IsInstallingOllama;

    public bool ShowInstallOllamaAction =>
        !DependencyStatus.LocalAI.Ollama.IsReady && DependencyStatus.LocalAI.CanAutoInstallOllama;

    public string RequiredModelDownloadLabel
    {
        get
        {
            var missing = MissingRequiredModelNames;
            return missing.Count switch
            {
                0 => "Required Models",
                1 => missing[0],
                _ => $"{missing.Count} Required Models"
            };
        }
    }

    private IReadOnlyList<string> MissingRequiredModelNames
    {
        get
        {
            var models = new List<string>();
            if (!DependencyStatus.LocalAI.DefaultModel.IsReady)
            {
                models.Add(OllamaModel);
            }
            if (!DependencyStatus.LocalAI.EmbeddingModel.IsReady)
            {
                models.Add(OllamaEmbeddingModel);
            }
            return models
                .Select(model => model.Trim())
                .Where(model => model.Length > 0)
                .Distinct(StringComparer.Ordinal)
                .ToArray();
        }
    }

    public string OwnershipFootnote => _qdrantResolution?.Ownership switch
    {
        QdrantOwnership.ManagedByPrism => "Memory Engine: Prism manages local memory storage for this server.",
        QdrantOwnership.ExternalUserManaged => "Memory Engine: Prism is using the Qdrant service already running on this PC.",
        _ => string.Empty
    };

    public string ReadLogs() => _logTailer.ReadCombinedLog();

    public async Task BootstrapAsync()
    {
        await RefreshDependenciesAsync().ConfigureAwait(true);
        await StartIfReadyAsync().ConfigureAwait(true);
    }

    public async Task RefreshDependenciesAsync()
    {
        var resolution = await ResolveQdrantForRuntimeAsync().ConfigureAwait(true);
        _qdrantResolution = resolution;
        DependencyStatus = await _dependencyService.CheckAsync(_config, resolution).ConfigureAwait(true);
        OnPropertyChanged(nameof(CanStartManagedMemoryEngine));
        OnPropertyChanged(nameof(CanDownloadDefaultModel));
        OnPropertyChanged(nameof(CanInstallOllama));
        OnPropertyChanged(nameof(ShowInstallOllamaAction));
        OnPropertyChanged(nameof(RequiredModelDownloadLabel));
        OnPropertyChanged(nameof(OwnershipFootnote));
        RaiseCommandStates();
    }

    public async Task StartIfReadyAsync()
    {
        if (DependencyStatus.CanStartNodeRuntime)
        {
            await StartNodeStackAsync().ConfigureAwait(true);
        }
    }

    public async Task SetUpPrismAsync()
    {
        SetupMessage = "Preparing Prism...";
        await RunManagedSetupAndStartAsync().ConfigureAwait(true);
        if (RuntimeState.Status == RuntimeStatus.Failed)
        {
            SetupMessage = RuntimeState.Message;
        }
    }

    public async Task InstallOllamaAsync()
    {
        if (!CanInstallOllama)
        {
            return;
        }

        IsInstallingOllama = true;
        SetupMessage = "Installing Ollama with winget...";
        try
        {
            await InstallOllamaWithWingetAsync().ConfigureAwait(true);
            await RefreshDependenciesAsync().ConfigureAwait(true);
            SetupMessage = DependencyStatus.LocalAI.Ollama.IsReady
                ? "Ollama is ready."
                : "Ollama installed. Open Ollama once, then refresh status.";
        }
        catch (Exception ex)
        {
            RuntimeState = RuntimeState.Failed(ex.Message);
            SetupMessage = ex.Message;
        }
        finally
        {
            IsInstallingOllama = false;
        }
    }

    public async Task StartNodeStackAsync()
    {
        try
        {
            var resolution = await ResolveQdrantForRuntimeAsync().ConfigureAwait(true);
            _qdrantResolution = resolution;
            if (resolution.Ownership == QdrantOwnership.ManagedByPrism)
            {
                await _runtimeManager.StartMemoryEngineAsync(resolution).ConfigureAwait(true);
            }

            DependencyStatus = await _dependencyService.CheckAsync(_config, resolution).ConfigureAwait(true);
            if (!DependencyStatus.CanStartNodeRuntime)
            {
                RuntimeState = RuntimeState.Failed("The Memory Engine and required local models must be ready before Prism can run.");
                return;
            }

            RuntimeState = RuntimeState.Starting;
            _configStore.Save(_config);
            await _runtimeManager.StartAsync(_config, resolution).ConfigureAwait(true);
            SetupMessage = "Prism Server is running. Pairing from the client app is the next step.";
        }
        catch (Exception ex)
        {
            RuntimeState = RuntimeState.Failed(ex.Message);
            SetupMessage = ex.Message;
        }
    }

    private async Task RunManagedSetupAndStartAsync()
    {
        try
        {
            var resolution = await ResolveQdrantForRuntimeAsync().ConfigureAwait(true);
            _qdrantResolution = resolution;

            if (resolution.Ownership == QdrantOwnership.ManagedByPrism)
            {
                SetupMessage = "Starting Memory Engine...";
                await _runtimeManager.StartMemoryEngineAsync(resolution).ConfigureAwait(true);
            }

            DependencyStatus = await _dependencyService.CheckAsync(_config, resolution).ConfigureAwait(true);

            if (!DependencyStatus.LocalAI.Ollama.IsReady && DependencyStatus.LocalAI.CanAutoInstallOllama)
            {
                IsInstallingOllama = true;
                try
                {
                    SetupMessage = "Installing Ollama with winget...";
                    await InstallOllamaWithWingetAsync().ConfigureAwait(true);
                    await WaitForOllamaReachableAsync(TimeSpan.FromSeconds(12)).ConfigureAwait(true);
                    DependencyStatus = await _dependencyService.CheckAsync(_config, resolution).ConfigureAwait(true);
                }
                finally
                {
                    IsInstallingOllama = false;
                }
            }

            if (DependencyStatus.LocalAI.Ollama.IsReady && MissingRequiredModelNames.Count > 0)
            {
                var models = MissingRequiredModelNames;
                IsDownloadingModel = true;
                try
                {
                    foreach (var model in models)
                    {
                        SetupMessage = $"Downloading {model}...";
                        await _ollamaModelInstaller.PullAsync(model).ConfigureAwait(true);
                    }
                }
                finally
                {
                    IsDownloadingModel = false;
                }

                DependencyStatus = await _dependencyService.CheckAsync(_config, resolution).ConfigureAwait(true);
            }
        }
        catch (Exception ex)
        {
            RuntimeState = RuntimeState.Failed(ex.Message);
            SetupMessage = ex.Message;
            return;
        }

        await StartNodeStackAsync().ConfigureAwait(true);
    }

    public async Task StartMemoryEngineAsync()
    {
        if (IsStartingMemoryEngine)
        {
            return;
        }

        IsStartingMemoryEngine = true;
        SetupMessage = "Starting Memory Engine...";
        try
        {
            var resolution = await ResolveQdrantForRuntimeAsync().ConfigureAwait(true);
            _qdrantResolution = resolution;
            await _runtimeManager.StartMemoryEngineAsync(resolution).ConfigureAwait(true);
            DependencyStatus = await _dependencyService.CheckAsync(_config, resolution).ConfigureAwait(true);
            SetupMessage = "Memory Engine is running.";
        }
        catch (Exception ex)
        {
            RuntimeState = RuntimeState.Failed(ex.Message);
            SetupMessage = ex.Message;
        }
        finally
        {
            IsStartingMemoryEngine = false;
        }
    }

    public async Task DownloadDefaultModelAsync()
    {
        if (IsDownloadingModel)
        {
            return;
        }

        IsDownloadingModel = true;
        var models = MissingRequiredModelNames;
        if (models.Count == 0)
        {
            IsDownloadingModel = false;
            return;
        }
        SetupMessage = models.Count == 1
            ? $"Downloading {models[0]}..."
            : $"Downloading {models.Count} required models...";
        try
        {
            foreach (var model in models)
            {
                SetupMessage = $"Downloading {model}...";
                await _ollamaModelInstaller.PullAsync(model).ConfigureAwait(true);
            }
            SetupMessage = models.Count == 1
                ? $"{models[0]} is ready."
                : "Required models are ready.";
            await RefreshDependenciesAsync().ConfigureAwait(true);
        }
        catch (Exception ex)
        {
            RuntimeState = RuntimeState.Failed(ex.Message);
            SetupMessage = ex.Message;
        }
        finally
        {
            IsDownloadingModel = false;
        }
    }

    public async Task GeneratePairingCodeAsync()
    {
        if (!RuntimeState.IsRunning || IsGeneratingPairingCode)
        {
            return;
        }

        IsGeneratingPairingCode = true;
        SetupMessage = "Generating pairing code...";
        try
        {
            PairingCode = await _pairingCodeService.CreatePairingCodeAsync(ApiPort).ConfigureAwait(true);
            SetupMessage = "Enter this code in Prism Client to pair with this server.";
        }
        catch (Exception ex)
        {
            RuntimeState = RuntimeState.Failed(ex.Message);
            SetupMessage = ex.Message;
        }
        finally
        {
            IsGeneratingPairingCode = false;
        }
    }

    public void Stop()
    {
        _runtimeManager.Stop();
        PairingCode = null;
    }

    public async Task RestartAsync()
    {
        _runtimeManager.Stop();
        await StartNodeStackAsync().ConfigureAwait(true);
    }

    public void SaveConfig()
    {
        try
        {
            _configStore.Save(_config);
            SetupMessage = "Settings saved.";
        }
        catch (Exception ex)
        {
            RuntimeState = RuntimeState.Failed(ex.Message);
            SetupMessage = ex.Message;
        }
    }

    private async Task<QdrantResolution> ResolveQdrantForRuntimeAsync()
    {
        if (_qdrantResolution is { Ownership: QdrantOwnership.ManagedByPrism } existing)
        {
            return existing;
        }

        return await _qdrantResolutionService.ResolveAsync(_config).ConfigureAwait(true);
    }

    private static async Task InstallOllamaWithWingetAsync(CancellationToken cancellationToken = default)
    {
        using var process = new Process();
        process.StartInfo = new ProcessStartInfo
        {
            FileName = "winget",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        process.StartInfo.ArgumentList.Add("install");
        process.StartInfo.ArgumentList.Add("-e");
        process.StartInfo.ArgumentList.Add("--id");
        process.StartInfo.ArgumentList.Add("Ollama.Ollama");
        process.StartInfo.ArgumentList.Add("--scope");
        process.StartInfo.ArgumentList.Add("user");
        process.StartInfo.ArgumentList.Add("--accept-source-agreements");
        process.StartInfo.ArgumentList.Add("--accept-package-agreements");

        if (!process.Start())
        {
            throw new InvalidOperationException("Could not start Ollama install with winget.");
        }

        await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException("Ollama install failed. Please check winget and try again.");
        }
    }

    private async Task WaitForOllamaReachableAsync(TimeSpan timeout, CancellationToken cancellationToken = default)
    {
        var deadline = DateTimeOffset.UtcNow.Add(timeout);
        while (DateTimeOffset.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var resolution = await ResolveQdrantForRuntimeAsync().ConfigureAwait(true);
            var status = await _dependencyService.CheckAsync(_config, resolution, cancellationToken).ConfigureAwait(true);
            if (status.LocalAI.Ollama.IsReady)
            {
                DependencyStatus = status;
                return;
            }

            await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken).ConfigureAwait(true);
        }
    }

    private void UpdateConfig(ServerConfig config, [CallerMemberName] string? propertyName = null)
    {
        _config = config;
        OnPropertyChanged(propertyName);
        OnPropertyChanged(nameof(CanDownloadDefaultModel));
        OnPropertyChanged(nameof(RequiredModelDownloadLabel));
        RaiseCommandStates();
    }

    private T Track<T>(T command) where T : ICommand
    {
        _commands.Add(command);
        return command;
    }

    private void RaiseCommandStates()
    {
        foreach (var command in _commands)
        {
            switch (command)
            {
                case RelayCommand relay:
                    relay.RaiseCanExecuteChanged();
                    break;
                case AsyncRelayCommand asyncRelay:
                    asyncRelay.RaiseCanExecuteChanged();
                    break;
            }
        }
    }

    private bool SetField<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
        {
            return false;
        }

        field = value;
        OnPropertyChanged(propertyName);
        return true;
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));

    public void Dispose() => _runtimeManager.Dispose();
}
