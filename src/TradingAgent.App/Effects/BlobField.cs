using Avalonia;
using Avalonia.Media;
using Avalonia.Media.Immutable;
using TradingAgent.App.Theme;

namespace TradingAgent.App.Effects;

/// <summary>One soft colour blob: its brush, its size and the path it drifts along.</summary>
public sealed record Blob(IImmutableBrush Brush, double Size, double[] X, double[] Y, double Seconds)
{
    /// <summary>How far past its edge a blurred blob still shows: three standard deviations.</summary>
    public double Reach => (Size / 2) + (BlobField.Blur * 3);
}

/// <summary>
/// The colour blobs that drift behind the window, as the previous UI had them: large circles of the
/// primary colour (every third one of the secondary), blurred by 100 px, each wandering through
/// three places and back in its own time.
/// </summary>
/// <remarks>
/// A circle blurred by 100 px is costly to draw every frame. The result of that blur is the same
/// picture every time, only moved, so it is worked out once as a radial gradient and drawn as a
/// plain ellipse.
/// </remarks>
public static class BlobField
{
    /// <summary>The standard deviation of the blur, in pixels.</summary>
    public const double Blur = 100;

    private const int Stops = 28;

    // Where each blob goes, in shares of the window: from the first place to the others and back.
    private static readonly (double[] X, double[] Y)[] _waypoints =
    [
        ([0.10, 0.40, 0.15, 0.10], [0.08, 0.35, 0.55, 0.08]),
        ([0.80, 0.50, 0.70, 0.80], [0.05, 0.30, 0.15, 0.05]),
        ([0.05, 0.35, 0.20, 0.05], [0.45, 0.70, 0.35, 0.45]),
        ([0.85, 0.55, 0.75, 0.85], [0.50, 0.35, 0.65, 0.50]),
        ([0.15, 0.45, 0.25, 0.15], [0.80, 0.55, 0.90, 0.80]),
        ([0.80, 0.55, 0.90, 0.80], [0.85, 0.60, 0.75, 0.85]),
        ([0.45, 0.70, 0.30, 0.45], [0.20, 0.10, 0.30, 0.20]),
        ([0.50, 0.35, 0.65, 0.50], [0.70, 0.45, 0.80, 0.70]),
    ];

    private static readonly double[] _sizes = [700, 600, 650, 550, 620];
    private static readonly double[] _alphas = [0.4, 0.25, 0.2, 0.18, 0.22];
    private static readonly double[] _scales = [1, 1.2, 0.9, 1];

    // Coefficients of the Bessel approximation, lowest power first: for small and for large arguments.
    private static readonly double[] _small = [1, 3.5156229, 3.0899424, 1.2067492, 0.2659732, 0.0360768, 0.0045813];
    private static readonly double[] _large = [0.39894228, 0.01328592, 0.00225319, -0.00157565, 0.00916281, -0.02057706, 0.02635537, -0.01647633, 0.00392377];

    /// <summary>The blobs of a preset.</summary>
    public static IReadOnlyList<Blob> For(ThemePreset preset)
    {
        ArgumentNullException.ThrowIfNull(preset);
        var count = preset.Blobs.Count;
        var blobs = new Blob[count];
        for (var index = 0; index < count; index++)
        {
            var (x, y) = _waypoints[index % _waypoints.Length];
            var share = count > 1 ? (double)index / (count - 1) : 0;
            var color = index % 3 == 2 ? preset.Secondary.Main : preset.Primary.Main;
            var size = _sizes[index % _sizes.Length];
            blobs[index] = new Blob(
                Brush(color, _alphas[index % _alphas.Length], size / 2),
                size,
                x,
                y,
                preset.Blobs.CycleMin + (share * (preset.Blobs.CycleMax - preset.Blobs.CycleMin)));
        }

        return blobs;
    }

    /// <summary>
    /// Where the middle of a blob is, and how much it is scaled, <paramref name="seconds"/> after
    /// the start, in a window of the given size.
    /// </summary>
    /// <remarks>
    /// The previous UI placed a blob by its top left corner: the animation that scaled it replaced
    /// the style that would have centred it on the place. The middle is therefore half a blob to the
    /// right of and below the place.
    /// </remarks>
    public static (Point Centre, double Scale) At(Blob blob, double seconds, Size window)
    {
        ArgumentNullException.ThrowIfNull(blob);
        var phase = seconds % blob.Seconds / blob.Seconds * 3;
        var segment = Math.Min((int)phase, 2);
        var within = phase - segment;
        var x = blob.X[segment] + ((blob.X[segment + 1] - blob.X[segment]) * within);
        var y = blob.Y[segment] + ((blob.Y[segment + 1] - blob.Y[segment]) * within);
        var scale = _scales[segment] + ((_scales[segment + 1] - _scales[segment]) * within);
        return (new Point((x * window.Width) + (blob.Size / 2), (y * window.Height) + (blob.Size / 2)), scale);
    }

    /// <summary>
    /// How much of a disc of the given radius shows at a distance from its middle after a Gaussian
    /// blur: 1 well inside, 0 well outside.
    /// </summary>
    public static double Coverage(double distance, double radius, double blur)
    {
        // The blurred disc at distance r is the integral over the disc's rings of a Gaussian times a
        // Bessel function; the scaled Bessel function keeps the numbers small.
        const int Steps = 240;
        var variance = blur * blur;
        var step = radius / Steps;
        var sum = 0d;
        for (var index = 0; index <= Steps; index++)
        {
            var ring = index * step;
            var value = ring / variance
                * Math.Exp(-((distance - ring) * (distance - ring)) / (2 * variance))
                * ScaledBessel(distance * ring / variance);
            sum += index is 0 or Steps ? value / 2 : value;
        }

        return Math.Clamp(sum * step, 0, 1);
    }

    private static ImmutableRadialGradientBrush Brush(Color color, double alpha, double radius)
    {
        var reach = radius + (Blur * 3);
        var stops = new ImmutableGradientStop[Stops + 1];
        for (var index = 0; index <= Stops; index++)
        {
            var share = (double)index / Stops;
            // The last stop is fully clear, so the ellipse has no edge.
            var coverage = index == Stops ? 0 : Coverage(share * reach, radius, Blur);
            stops[index] = new ImmutableGradientStop(share, ThemeBuilder.Alpha(color, alpha * coverage));
        }

        // From the middle of the ellipse it fills to its edge.
        var half = new RelativeScalar(0.5, RelativeUnit.Relative);
        return new ImmutableRadialGradientBrush(stops, 1, null, null, GradientSpreadMethod.Pad, null, null, half, half);
    }

    /// <summary>The modified Bessel function of the first kind and order zero, times e to the minus x.</summary>
    private static double ScaledBessel(double x)
    {
        // The polynomial approximations of Abramowitz and Stegun, 9.8.1 and 9.8.2.
        if (x < 3.75)
        {
            var square = x / 3.75 * (x / 3.75);
            return Math.Exp(-x) * Polynomial(square, _small);
        }

        return Polynomial(3.75 / x, _large) / Math.Sqrt(x);
    }

    private static double Polynomial(double x, double[] coefficients)
    {
        var sum = 0d;
        for (var index = coefficients.Length - 1; index >= 0; index--)
        {
            sum = (sum * x) + coefficients[index];
        }

        return sum;
    }
}
