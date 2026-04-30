using System.Windows;
using PrismServer.ViewModels;

namespace PrismServer.Views;

public partial class LogsWindow : Window
{
    private readonly AppViewModel _viewModel;

    public LogsWindow(AppViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        DataContext = viewModel;
    }

    public void RefreshLog()
    {
        LogTextBox.Text = _viewModel.ReadLogs();
    }

    private void RefreshClicked(object sender, RoutedEventArgs e) => RefreshLog();
}
