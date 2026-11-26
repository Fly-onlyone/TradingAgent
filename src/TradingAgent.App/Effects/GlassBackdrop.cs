using Avalonia;
using Avalonia.Media;
using Avalonia.Skia;
using SkiaSharp;

namespace TradingAgent.App.Effects;

/// <summary>
/// One blurred picture of the window's background, which every sheet of glass draws its part of.
/// </summary>
/// <remarks>
/// <para>
/// A sheet of glass must show what is behind the whole window at its place, blurred. Asking the
/// canvas for "what is already there" (a backdrop filter) is only right in a frame that draws the
/// whole window anew. Most frames redraw a small part: a line that moves, a card under the pointer.
/// In such a frame the pixels around that part are still those of the frame before, with cards and
/// text on them, and a blur of them is a different picture. Glass drawn that way changed its look
/// from frame to frame: lines on glass flickered and a card flashed around its edges when the
/// pointer came over it.
/// </para>
/// <para>
/// So the background is taken once, right after it was drawn in a frame that redraws everything
/// (<see cref="Capture"/>), blurred at a quarter of its size, and kept. A sheet of glass draws from
/// that (<see cref="TryDraw"/>), whatever part of the window the frame redraws. It is one blur
/// for each frame of the background instead of one for each sheet of glass in each frame.
/// </para>
/// <para>Everything here runs on the render thread.</para>
/// </remarks>
internal static class GlassBackdrop
{
    /// <summary>The blur of the kept picture, as a CSS blur radius. The background is soft already; this takes the dots and lines out.</summary>
    private const float Blur = 16;

    /// <summary>The kept picture is this many times smaller than the window, each way.</summary>
    private const int Shrink = 4;

    private static readonly SKSamplingOptions _smooth = new(SKFilterMode.Linear);

    private static SKImage? _picture;
    private static SKSurface? _surface;
    private static int _width;
    private static int _height;

    /// <summary>
    /// Takes the picture, when the frame being drawn redraws the whole window. Call it right after the
    /// background was drawn and before anything that lies on it.
    /// </summary>
    /// <param name="context">The context the background was just drawn with.</param>
    /// <param name="size">The size of the window's content, in the units of the layout.</param>
    public static void Capture(ImmediateDrawingContext context, Vector size)
    {
        if (!BackdropBlur.IsOn || size.X <= 0 || size.Y <= 0 || context.TryGetFeature<ISkiaSharpApiLeaseFeature>() is not { } feature)
        {
            return;
        }

        using var lease = feature.Lease();
        if (lease.SkSurface is not { } surface)
        {
            return;
        }

        var canvas = lease.SkCanvas;
        var scale = canvas.TotalMatrix.ScaleX;
        if (scale <= 0)
        {
            return;
        }

        var width = (int)Math.Round(size.X * scale);
        var height = (int)Math.Round(size.Y * scale);
        var clip = canvas.DeviceClipBounds;
        // Only a frame that redraws everything has nothing but the background on it at this moment.
        // The clip of a frame that redraws two far corners has the same bounds, so its shape counts too.
        if (!canvas.IsClipRect || clip.Left > 1 || clip.Top > 1 || clip.Right < width - 1 || clip.Bottom < height - 1)
        {
            return;
        }

        var info = new SKImageInfo(Math.Max(1, width / Shrink), Math.Max(1, height / Shrink), SKColorType.Rgba8888, SKAlphaType.Premul);
        using var small = lease.GrContext is { } gpu ? SKSurface.Create(gpu, false, info) : SKSurface.Create(info);
        if (small is null)
        {
            return;
        }

        using var frame = surface.Snapshot(SKRectI.Create(width, height));
        var sigma = Blur * scale / Shrink;
        using var blur = SKImageFilter.CreateBlur(sigma, sigma, SKShaderTileMode.Clamp);
        using var paint = new SKPaint { ImageFilter = blur };
        small.Canvas.DrawImage(frame, new SKRect(0, 0, info.Width, info.Height), _smooth, paint);

        _picture?.Dispose();
        _picture = small.Snapshot();
        _surface = surface;
        _width = width;
        _height = height;
    }

    /// <summary>
    /// Draws the kept picture inside <paramref name="shape"/>, which is given in the units the canvas
    /// is in now. False when there is no picture for this window yet; the caller then blurs what is
    /// on the canvas, as before.
    /// </summary>
    public static bool TryDraw(ISkiaSharpApiLease lease, SKRoundRect shape)
    {
        // The picture belongs to one window and one size of it: another window, or this one after a
        // resize, draws on another surface.
        if (_picture is null || !ReferenceEquals(lease.SkSurface, _surface))
        {
            return false;
        }

        var canvas = lease.SkCanvas;
        canvas.Save();
        canvas.ClipRoundRect(shape, SKClipOperation.Intersect, antialias: true);
        // The picture is of the whole window, so it is drawn in the window's own pixels: the glass may
        // be moved or scaled, what is behind it is not.
        canvas.ResetMatrix();
        canvas.DrawImage(_picture, new SKRect(0, 0, _width, _height), _smooth, null);
        canvas.Restore();
        return true;
    }

    /// <summary>Forgets the picture: the background it shows is no longer the one on the screen.</summary>
    public static void Drop()
    {
        _picture?.Dispose();
        _picture = null;
        _surface = null;
    }
}
