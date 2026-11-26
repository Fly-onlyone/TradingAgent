namespace TradingAgent.App.Effects;

/// <summary>
/// The dots of the particle network behind the window: where they are and how they drift.
/// </summary>
/// <remarks>
/// The numbers are those of the particle engine of the previous UI, including its quirk: a dot loses
/// one hundredth of its speed every frame, so the network drifts for a few seconds after it is made
/// and then stands still. That is why a frame loop can stop asking for frames once
/// <see cref="IsStill"/> is true.
/// </remarks>
public sealed class ParticleField
{
    public const int Count = 130;
    public const double LineDistance = 180;
    public const double LineOpacity = 0.28;
    public const double DotRadius = 2.5;

    private const double Speed = 0.3;

    private readonly double[] _x = new double[Count];
    private readonly double[] _y = new double[Count];
    private readonly double[] _vx = new double[Count];
    private readonly double[] _vy = new double[Count];
    private readonly double[] _opacity = new double[Count];

    public ParticleField(double width, double height, Random? random = null)
    {
        random ??= Random.Shared;
        Width = width;
        Height = height;
        for (var index = 0; index < Count; index++)
        {
            _x[index] = random.NextDouble() * width;
            _y[index] = random.NextDouble() * height;
            _vx[index] = (random.NextDouble() - 0.5) * Speed;
            _vy[index] = (random.NextDouble() - 0.5) * Speed;
            _opacity[index] = 0.4 + (random.NextDouble() * 0.5);
        }
    }

    public double Width { get; }

    public double Height { get; }

    /// <summary>True once no dot moves any more.</summary>
    public bool IsStill { get; private set; }

    public ReadOnlySpan<double> X => _x;

    public ReadOnlySpan<double> Y => _y;

    /// <summary>How opaque each dot is, 0.4 to 0.9.</summary>
    public ReadOnlySpan<double> Opacity => _opacity;

    /// <summary>
    /// Moves the dots by one frame that took <paramref name="milliseconds"/>. A frame longer than
    /// 32 ms is left out, as the previous engine left it out: after a pause the dots do not jump.
    /// </summary>
    public void Step(double milliseconds)
    {
        if (IsStill || milliseconds > 32 || milliseconds <= 0)
        {
            return;
        }

        var factor = Math.Min(milliseconds / 16, 2);
        var fastest = 0d;
        for (var index = 0; index < Count; index++)
        {
            _x[index] += _vx[index] * factor;
            _y[index] += _vy[index] * factor;
            _vx[index] *= 0.99;
            _vy[index] *= 0.99;
            if (_x[index] < 0)
            {
                _x[index] = Width;
            }
            else if (_x[index] > Width)
            {
                _x[index] = 0;
            }

            if (_y[index] < 0)
            {
                _y[index] = Height;
            }
            else if (_y[index] > Height)
            {
                _y[index] = 0;
            }

            fastest = Math.Max(fastest, Math.Max(Math.Abs(_vx[index]), Math.Abs(_vy[index])));
        }

        // Less than a hundredth of a pixel per frame cannot be seen.
        IsStill = fastest < 0.01;
    }
}
