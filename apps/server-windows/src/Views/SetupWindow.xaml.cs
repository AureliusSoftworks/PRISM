using System.Windows;
using PrismServer.ViewModels;

namespace PrismServer.Views;

public partial class SetupWindow : Window
{
    public SetupWindow(AppViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
    }
}
