using Avalonia;
using Avalonia.Controls;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using TradingAgent.App.Theme;

namespace TradingAgent.App.Views;

/// <summary>
/// Every control of the kit on one page, in the chosen preset. Opened with <c>--gallery</c> instead
/// of the app, to compare the look with the previous UI side by side.
/// </summary>
public sealed partial class GalleryWindow : Window
{
    private const string Argument = "--gallery";

    public GalleryWindow()
    {
        InitializeComponent();
    }

    /// <summary>True when the command line asks for the gallery instead of the app.</summary>
    public static bool IsRequested(string[] args) => Array.IndexOf(args, Argument) >= 0;

    /// <summary>
    /// Reads <c>--theme &lt;id&gt;</c> and <c>--shot &lt;file&gt;</c>. With a shot file the gallery saves its
    /// picture there and the process ends.
    /// </summary>
    public static (ThemePreset Preset, string? ShotFile) Options(string[] args)
    {
        string? Value(string name)
        {
            var index = Array.IndexOf(args, name);
            return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
        }

        return (ThemePreset.ById(Value("--theme")), Value("--shot"));
    }

    /// <summary>Saves a picture of the whole gallery, however long it is, as a PNG file.</summary>
    /// <remarks>
    /// Drawn into a bitmap, not grabbed from the screen: the picture is the same whether or not the
    /// window is visible. What the render thread draws on its own (ripples, moving backgrounds) is
    /// not in it.
    /// </remarks>
    public async Task SaveAsync(string file)
    {
        // Let transitions that start with the first layout come to rest.
        await Task.Delay(TimeSpan.FromMilliseconds(400));
        await Dispatcher.UIThread.InvokeAsync(() => { }, DispatcherPriority.Background);

        var size = Page.Bounds.Size;
        using var bitmap = new RenderTargetBitmap(new PixelSize((int)Math.Ceiling(size.Width), (int)Math.Ceiling(size.Height)), new Vector(96, 96));
        bitmap.Render(Page);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(file))!);
        bitmap.Save(file, PngBitmapEncoderOptions.Default);
    }
}
