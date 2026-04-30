using System.ComponentModel;
using System.Drawing;
using System.IO.Pipes;
using System.Net.Http;
using System.Windows;
using PrismServer.Core.Services;
using PrismServer.ViewModels;
using PrismServer.Views;
using WinForms = System.Windows.Forms;

namespace PrismServer;

public partial class App : System.Windows.Application
{
    private const string MutexName = "Local\\com.localai.prism-server";
    private const string PipeName = "com.localai.prism-server.show";

    private Mutex? _singleInstanceMutex;
    private CancellationTokenSource? _pipeCancellation;
    private WinForms.NotifyIcon? _notifyIcon;
    private SetupWindow? _setupWindow;
    private LogsWindow? _logsWindow;
    private bool _isQuitting;

    public AppViewModel Model { get; private set; } = null!;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _singleInstanceMutex = new Mutex(initiallyOwned: true, MutexName, out var createdNew);
        if (!createdNew)
        {
            await SignalExistingInstanceAsync().ConfigureAwait(true);
            Shutdown();
            return;
        }

        Model = CreateViewModel();
        Model.PropertyChanged += ModelOnPropertyChanged;
        CreateTrayIcon();
        StartPipeListener();
        ShowSetupWindow();

        await Model.BootstrapAsync().ConfigureAwait(true);
        RefreshTrayMenu();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _pipeCancellation?.Cancel();
        _notifyIcon?.Dispose();
        Model?.Dispose();
        _singleInstanceMutex?.ReleaseMutex();
        _singleInstanceMutex?.Dispose();
        base.OnExit(e);
    }

    private static AppViewModel CreateViewModel()
    {
        var paths = new PrismPaths();
        var httpClient = new HttpClient();
        var commandLocator = new CommandLocator();
        var configStore = new ConfigStore(paths);
        var qdrantBinaryResolver = new QdrantBinaryResolver(paths, commandLocator);
        var qdrantManager = new QdrantManager(paths, qdrantBinaryResolver, httpClient);
        var runtimeManager = new RuntimeManager(paths, configStore, qdrantManager, commandLocator);
        var dependencyService = new DependencyService(httpClient, qdrantBinaryResolver, commandLocator);
        var qdrantResolutionService = new QdrantResolutionService(httpClient);
        var ollamaModelInstaller = new OllamaModelInstaller(paths, commandLocator);
        var pairingCodeService = new PairingCodeService(httpClient);
        var logTailer = new LogTailer(paths);

        return new AppViewModel(
            paths,
            configStore,
            runtimeManager,
            dependencyService,
            qdrantResolutionService,
            ollamaModelInstaller,
            pairingCodeService,
            logTailer);
    }

    private void CreateTrayIcon()
    {
        _notifyIcon = new WinForms.NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Prism Server",
            Visible = true
        };
        _notifyIcon.DoubleClick += (_, _) => Dispatcher.Invoke(ShowSetupWindow);
        RefreshTrayMenu();
    }

    private void RefreshTrayMenu()
    {
        if (_notifyIcon is null)
        {
            return;
        }

        var menu = new WinForms.ContextMenuStrip();
        var status = new WinForms.ToolStripMenuItem($"Prism Server - {Model.StatusText}") { Enabled = false };
        menu.Items.Add(status);
        menu.Items.Add(new WinForms.ToolStripSeparator());
        menu.Items.Add(MenuItem("Setup...", ShowSetupWindow));
        menu.Items.Add(MenuItem("Logs...", ShowLogsWindow));
        menu.Items.Add(new WinForms.ToolStripSeparator());

        if (Model.IsRunning)
        {
            menu.Items.Add(MenuItem("Restart Server", () => Model.RestartCommand.Execute(null)));
            menu.Items.Add(MenuItem("Stop", () => Model.StopCommand.Execute(null)));
        }
        else
        {
            menu.Items.Add(MenuItem("Start Server", () => Model.StartCommand.Execute(null), Model.StartCommand.CanExecute(null)));
        }

        menu.Items.Add(new WinForms.ToolStripSeparator());
        menu.Items.Add(MenuItem("Quit Prism Server", Quit));
        _notifyIcon.ContextMenuStrip = menu;
    }

    private static WinForms.ToolStripMenuItem MenuItem(string text, Action action, bool enabled = true)
    {
        var item = new WinForms.ToolStripMenuItem(text) { Enabled = enabled };
        item.Click += (_, _) => action();
        return item;
    }

    private void ShowSetupWindow()
    {
        if (_setupWindow is null)
        {
            _setupWindow = new SetupWindow(Model);
            _setupWindow.Closing += HideInsteadOfClose;
        }

        _setupWindow.Show();
        _setupWindow.Activate();
    }

    private void ShowLogsWindow()
    {
        if (_logsWindow is null)
        {
            _logsWindow = new LogsWindow(Model);
            _logsWindow.Closing += HideInsteadOfClose;
        }

        _logsWindow.RefreshLog();
        _logsWindow.Show();
        _logsWindow.Activate();
    }

    private void HideInsteadOfClose(object? sender, CancelEventArgs e)
    {
        if (_isQuitting)
        {
            return;
        }

        if (sender is Window window)
        {
            e.Cancel = true;
            window.Hide();
        }
    }

    private void Quit()
    {
        _isQuitting = true;
        Shutdown();
    }

    private void ModelOnPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName is nameof(AppViewModel.StatusText) or nameof(AppViewModel.IsRunning))
        {
            Dispatcher.Invoke(RefreshTrayMenu);
        }
    }

    private void StartPipeListener()
    {
        _pipeCancellation = new CancellationTokenSource();
        _ = Task.Run(async () =>
        {
            while (!_pipeCancellation.IsCancellationRequested)
            {
                try
                {
                    await using var server = new NamedPipeServerStream(PipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
                    await server.WaitForConnectionAsync(_pipeCancellation.Token).ConfigureAwait(false);
                    await Dispatcher.InvokeAsync(ShowSetupWindow);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch
                {
                    await Task.Delay(500, _pipeCancellation.Token).ConfigureAwait(false);
                }
            }
        }, _pipeCancellation.Token);
    }

    private static async Task SignalExistingInstanceAsync()
    {
        try
        {
            await using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
            await client.ConnectAsync(1000).ConfigureAwait(false);
        }
        catch
        {
            // If the pipe is not ready, just exit; the existing tray app stays authoritative.
        }
    }
}
