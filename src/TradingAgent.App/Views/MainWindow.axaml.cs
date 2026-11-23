using Avalonia.Controls;

namespace TradingAgent.App.Views;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Opened += async (_, _) => await StartupProbe.ReportFirstFrameAsync(this);
    }
}
