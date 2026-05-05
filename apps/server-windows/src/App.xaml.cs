using System.ComponentModel;
using System.Drawing;
using System.IO.Pipes;
using System.Net.Http;
using System.Windows;
using System.Windows.Threading;
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
    private bool _ownsSingleInstanceMutex;
    private bool _isHandlingFatalException;
    private CancellationTokenSource? _pipeCancellation;
    private WinForms.NotifyIcon? _notifyIcon;
    private SetupWindow? _setupWindow;
    private LogsWindow? _logsWindow;
    private bool _isQuitting;

    public AppViewModel Model { get; private set; } = null!;

    public App()
    {
        ConfigureExceptionLogging();
    }

    protected override async void OnStartup(StartupEventArgs e)
    {
        try
        {
            WindowsAppLog.Write("Prism Server launch starting.");
            base.OnStartup(e);

            _singleInstanceMutex = new Mutex(initiallyOwned: true, MutexName, out var createdNew);
            _ownsSingleInstanceMutex = createdNew;
            if (!createdNew)
            {
                WindowsAppLog.Write("Duplicate launch detected; signaling existing Prism Server instance.");
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
            WindowsAppLog.Write("Prism Server launch completed.");
        }
        catch (Exception ex)
        {
            HandleFatalException("Fatal startup crash", ex);
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        WindowsAppLog.Write($"Prism Server exiting with code {e.ApplicationExitCode}.");
        _pipeCancellation?.Cancel();
        _notifyIcon?.Dispose();
        Model?.Dispose();
        if (_ownsSingleInstanceMutex)
        {
            try
            {
                _singleInstanceMutex?.ReleaseMutex();
            }
            catch (Exception ex)
            {
                WindowsAppLog.WriteException("Failed to release single-instance mutex", ex);
            }
        }
        _singleInstanceMutex?.Dispose();
        base.OnExit(e);
    }

    /// <summary>
    /// Prefer the Prism Server.ico embedded on the exe (utility mark: white field, black triangle).
    /// </summary>
    private static Icon? TrayIconFromExecutable()
    {
        try
        {
            var path = Environment.ProcessPath;
            if (string.IsNullOrEmpty(path))
            {
                return null;
            }

            return Icon.ExtractAssociatedIcon(path);
        }
        catch
        {
            return null;
        }
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
        var trayIcon = TrayIconFromExecutable();
        _notifyIcon = new WinForms.NotifyIcon
        {
            Icon = trayIcon ?? SystemIcons.Application,
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

    private WinForms.ToolStripMenuItem MenuItem(string text, Action action, bool enabled = true)
    {
        var item = new WinForms.ToolStripMenuItem(text) { Enabled = enabled };
        item.Click += (_, _) => RunLoggedAction($"Tray menu: {text}", action);
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
                catch (Exception ex)
                {
                    WindowsAppLog.WriteException("Named pipe listener error", ex);
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
        catch (Exception ex)
        {
            WindowsAppLog.WriteException("Could not signal existing Prism Server instance", ex);
            // If the pipe is not ready, just exit; the existing tray app stays authoritative.
        }
    }

    private void ConfigureExceptionLogging()
    {
        DispatcherUnhandledException += (_, args) =>
        {
            WindowsAppLog.WriteException("Unhandled dispatcher exception", args.Exception);
            args.Handled = true;
            HandleFatalException("Unhandled dispatcher exception", args.Exception);
        };

        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            if (args.ExceptionObject is Exception ex)
            {
                WindowsAppLog.WriteException("Unhandled AppDomain exception", ex);
            }
            else
            {
                WindowsAppLog.Write($"Unhandled AppDomain exception: {args.ExceptionObject}");
            }
        };

        TaskScheduler.UnobservedTaskException += (_, args) =>
        {
            WindowsAppLog.WriteException("Unobserved task exception", args.Exception);
            args.SetObserved();
        };
    }

    private void RunLoggedAction(string context, Action action)
    {
        try
        {
            WindowsAppLog.Write(context);
            action();
        }
        catch (Exception ex)
        {
            WindowsAppLog.WriteException(context + " failed", ex);
            System.Windows.MessageBox.Show(
                $"Prism Server hit an error. Details were written to:{Environment.NewLine}{WindowsAppLog.LogPath}{Environment.NewLine}{Environment.NewLine}{ex.Message}",
                "Prism Server Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void HandleFatalException(string context, Exception exception)
    {
        if (_isHandlingFatalException)
        {
            return;
        }

        _isHandlingFatalException = true;
        WindowsAppLog.WriteException(context, exception);
        try
        {
            System.Windows.MessageBox.Show(
                $"Prism Server crashed during launch. Details were written to:{Environment.NewLine}{WindowsAppLog.LogPath}{Environment.NewLine}{Environment.NewLine}{exception.Message}",
                "Prism Server Crash",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
        catch
        {
            // If WPF cannot display a dialog, the file log is still the source of truth.
        }

        Shutdown(1);
    }
}

