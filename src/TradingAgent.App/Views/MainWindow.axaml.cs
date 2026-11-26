using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using TradingAgent.App.Motion;
using TradingAgent.App.ViewModels;

namespace TradingAgent.App.Views;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Opened += (_, _) => _ = StartupProbe.ReportFirstFrameAsync(this);

        // A folded sidebar opens while the pointer is over it.
        Sidebar.PointerEntered += (_, _) => SetSidebarHovered(true);
        Sidebar.PointerExited += (_, _) => SetSidebarHovered(false);
        Brand.PointerPressed += OnBrandPressed;
        Activated += (_, _) => (DataContext as MainViewModel)?.Header.RefreshStatus();
        PropertyChanged += (_, change) =>
        {
            if (change.Property == IsVisibleProperty || change.Property == WindowStateProperty)
            {
                Endless.IsSuspended = !IsVisible || WindowState == WindowState.Minimized;
            }
        };
    }

    private void SetSidebarHovered(bool hovered)
    {
        if (DataContext is MainViewModel main)
        {
            main.IsSidebarHovered = hovered;
        }
    }

    private void OnBrandPressed(object? sender, PointerPressedEventArgs e)
    {
        if (DataContext is MainViewModel main && e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
        {
            main.OpenDashboardCommand.Execute(null);
        }
    }

    /// <summary>Closes the theme selector once a theme is chosen; a flyout does not close on a press inside it.</summary>
    /// <summary>The list under the bell is read anew each time it opens.</summary>
    private void OnNotificationsOpened(object? sender, EventArgs e) => (DataContext as MainViewModel)?.Header.Notifications?.Open();

    private void OnThemeChosen(object? sender, RoutedEventArgs e) => ThemeButton.Flyout?.Hide();
}
