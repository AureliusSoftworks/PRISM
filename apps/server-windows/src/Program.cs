using System.Windows;
using PrismServer.Core.Services;

namespace PrismServer;

public static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        WindowsAppLog.Write("Program.Main entered.");
        AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
        {
            if (eventArgs.ExceptionObject is Exception ex)
            {
                WindowsAppLog.WriteException("Program-level unhandled exception", ex);
            }
            else
            {
                WindowsAppLog.Write($"Program-level unhandled exception: {eventArgs.ExceptionObject}");
            }
        };

        try
        {
            var app = new App();
            app.InitializeComponent();
            WindowsAppLog.Write("WPF App initialized; entering Run().");
            app.Run();
            WindowsAppLog.Write("WPF App.Run() returned normally.");
            return 0;
        }
        catch (Exception ex)
        {
            WindowsAppLog.WriteException("Program.Main fatal exception", ex);
            try
            {
                System.Windows.MessageBox.Show(
                    $"Prism Server crashed before the app could start. Details were written to:{Environment.NewLine}{WindowsAppLog.LogPath}{Environment.NewLine}{WindowsAppLog.FallbackLogPath}{Environment.NewLine}{Environment.NewLine}{ex.Message}",
                    "Prism Server Crash",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }
            catch
            {
                // If WPF cannot show a dialog, rely on the file logs.
            }
            return 1;
        }
    }
}
