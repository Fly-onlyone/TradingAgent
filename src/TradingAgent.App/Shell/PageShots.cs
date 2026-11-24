using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using TradingAgent.App.Motion;
using TradingAgent.App.ViewModels;

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

    public static void Configure(string[] args)
    {
        var index = Array.IndexOf(args, Argument);
        _folder = index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
        if (_folder is not null)
        {
            FrameDriver.IsInstant = true;
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

            var size = window.ClientSize;
            using var bitmap = new RenderTargetBitmap(new PixelSize((int)Math.Ceiling(size.Width), (int)Math.Ceiling(size.Height)), new Vector(96, 96));
            bitmap.Render(window);
            var name = string.Create(CultureInfo.InvariantCulture, $"{index + 1:00}-{page.Title.ToLowerInvariant().Replace(' ', '-')}.png");
            bitmap.Save(Path.Combine(folder, name), PngBitmapEncoderOptions.Default);
        }

        exit();
    }
}
