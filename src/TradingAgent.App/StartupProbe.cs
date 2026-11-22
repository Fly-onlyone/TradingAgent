using System.Globalization;
using Avalonia.Controls;
using Avalonia.Rendering.Composition;

namespace TradingAgent.App;

/// <summary>
/// Measures start-up time from outside the process: with <c>--startup-marker &lt;file&gt;</c> the app writes the
/// UTC time, in Unix milliseconds, once its first frame has been rendered.
/// </summary>
/// <remarks>
/// Used by the performance checks (start to first frame must stay under one second). Without the argument
/// nothing is written.
/// </remarks>
internal static class StartupProbe
{
    private const string MarkerArgument = "--startup-marker";

    private static string? _markerFile;

    public static void Configure(string[] args)
    {
        var index = Array.IndexOf(args, MarkerArgument);
        _markerFile = index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
    }

    /// <summary>Writes the marker after <paramref name="window"/> has put a frame on screen.</summary>
    public static async Task ReportFirstFrameAsync(TopLevel window)
    {
        var file = _markerFile;
        if (file is null)
        {
            return;
        }

        _markerFile = null;

        // Avalonia has no "frame presented" callback. One animation frame runs layout and render, the
        // commit hands that frame to the render thread, and the second frame proves it was processed.
        await NextFrameAsync(window);
        var compositor = ElementComposition.GetElementVisual(window)?.Compositor;
        if (compositor is not null)
        {
            await compositor.RequestCommitAsync();
        }

        await NextFrameAsync(window);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture);
        await File.WriteAllTextAsync(file, now);
    }

    private static Task NextFrameAsync(TopLevel window)
    {
        var done = new TaskCompletionSource();
        window.RequestAnimationFrame(_ => done.TrySetResult());
        return done.Task;
    }
}
