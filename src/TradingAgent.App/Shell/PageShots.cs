using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using TradingAgent.App.Effects;
using TradingAgent.App.Motion;
using TradingAgent.App.ViewModels;
using TradingAgent.Data.Notifications;

namespace TradingAgent.App.Shell;

/// <summary>
/// Saves a picture of every page of the running app: with <c>--page-shots &lt;folder&gt;</c> the app opens
/// each page in turn, writes one PNG file per page into the folder, and exits.
/// </summary>
/// <remarks>
/// For the checks of the real app: the pictures show what the pages look like with the data of this
/// installation, without anyone driving the window. They are drawn into a bitmap, so they are the
/// same whether or not the window can be seen. Animations are off while it runs.
/// </remarks>
internal static class PageShots
{
    private const string Argument = "--page-shots";

    /// <summary>How long a page gets to load its data before its picture is taken.</summary>
    private static readonly TimeSpan _settle = TimeSpan.FromMilliseconds(900);

    private static string? _folder;

    /// <summary>True when the command line asked for pictures of the pages.</summary>
    public static bool IsRequested => _folder is not null;

    public static void Configure(string[] args)
    {
        var index = Array.IndexOf(args, Argument);
        _folder = index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
        if (_folder is not null)
        {
            FrameDriver.IsInstant = true;
            // The moving background is drawn by the compositor and would be missing from a picture.
            EffectsLayer.DrawStill = true;
        }
    }

    /// <summary>Takes the pictures when the command line asked for them, then calls <paramref name="exit"/>.</summary>
    public static async Task RunAsync(Window window, MainViewModel main, Action exit)
    {
        if (_folder is not { } folder)
        {
            return;
        }

        Directory.CreateDirectory(folder);
        for (var index = 0; index < main.Pages.Count; index++)
        {
            var page = main.Pages[index];
            main.SelectedPage = page;
            await Task.Delay(_settle);
            await Dispatcher.UIThread.InvokeAsync(() => { }, DispatcherPriority.Background);

            var name = string.Create(CultureInfo.InvariantCulture, $"{index + 1:00}-{page.Title.ToLowerInvariant().Replace(' ', '-')}");
            Save(window, Path.Combine(folder, name + ".png"));

            // The chat page opens on an empty chat; a second picture shows the newest chat there is.
            if (page is ChatViewModel { Sessions.Count: > 0, SelectedSession: null } chat)
            {
                chat.SelectedSession = chat.Sessions[0];
                await Task.Delay(_settle);
                await Dispatcher.UIThread.InvokeAsync(() => { }, DispatcherPriority.Background);
                Save(window, Path.Combine(folder, name + "-open.png"));
                chat.SelectedSession = null;
            }
        }

        await BellAsync(window, main, folder);
        exit();
    }

    /// <summary>
    /// A last picture with the list under the bell open and a message in the corner. The message is a
    /// sample that is only shown, never stored; the list is what this installation holds.
    /// </summary>
    private static async Task BellAsync(Window window, MainViewModel main, string folder)
    {
        if (main.Header.Notifications is not { } notifications || window.FindControl<Button>("BellButton") is not { Flyout: { } list } bell)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        notifications.Toasts.Add(new ToastViewModel(new StoredNotification("sample-1", "risk_alert", "Risk check", "The order was held back: it would take the position above the limit.", now, false)));
        notifications.Toasts.Add(new ToastViewModel(new StoredNotification("sample-2", "trade_executed", "Order filled", "Bought 0.05 BTC-USDT at 97,412.50.", now, false)));
        list.ShowAt(bell);
        await Task.Delay(_settle);
        await Dispatcher.UIThread.InvokeAsync(() => { }, DispatcherPriority.Background);
        Save(window, Path.Combine(folder, string.Create(CultureInfo.InvariantCulture, $"{main.Pages.Count + 1:00}-bell.png")));
        list.Hide();
        notifications.Toasts.Clear();
    }

    private static void Save(Window window, string file)
    {
        var size = window.ClientSize;
        using var bitmap = new RenderTargetBitmap(new PixelSize((int)Math.Ceiling(size.Width), (int)Math.Ceiling(size.Height)), new Vector(96, 96));
        bitmap.Render(window);
        bitmap.Save(file, PngBitmapEncoderOptions.Default);
    }
}
