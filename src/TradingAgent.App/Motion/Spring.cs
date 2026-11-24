namespace TradingAgent.App.Motion;

/// <summary>
/// A damped spring, as the animations of the previous UI described them: stiffness, damping, mass.
/// </summary>
/// <remarks>
/// The position is worked out exactly for any moment, not stepped frame by frame, so the motion is
/// the same at every frame rate and a test can ask for a moment directly.
/// </remarks>
public readonly record struct Spring(double Stiffness, double Damping, double Mass = 1)
{
    /// <summary>Fast with almost no overshoot: cards, list rows and panels coming in.</summary>
    public static Spring Snappy { get; } = new(400, 30);

    /// <summary>Overshoots visibly: things that pop in.</summary>
    public static Spring Bouncy { get; } = new(300, 20, 0.8);

    /// <summary>Slow and soft: headings fading up.</summary>
    public static Spring Gentle { get; } = new(200, 25);

    /// <summary>A page coming in, and content revealed by scrolling.</summary>
    public static Spring Page { get; } = new(300, 30);

    /// <summary>A notification sliding in.</summary>
    public static Spring Toast { get; } = new(500, 35);

    /// <summary>A button following the pointer, and digits rolling to a new value.</summary>
    public static Spring Soft { get; } = new(200, 20);

    /// <summary>
    /// Where a value is, and how fast it moves, <paramref name="seconds"/> after it left
    /// <paramref name="from"/> for <paramref name="to"/> with the speed <paramref name="velocity"/>
    /// (units per second).
    /// </summary>
    public (double Position, double Velocity) At(double seconds, double from, double to, double velocity = 0)
    {
        if (double.IsPositiveInfinity(seconds))
        {
            return (to, 0);
        }

        var time = Math.Max(0, seconds);
        var displacement = from - to;
        var natural = Math.Sqrt(Stiffness / Mass);
        var ratio = Damping / (2 * Math.Sqrt(Stiffness * Mass));

        if (ratio < 1)
        {
            var decay = ratio * natural;
            var damped = natural * Math.Sqrt(1 - (ratio * ratio));
            var sine = (velocity + (decay * displacement)) / damped;
            var envelope = Math.Exp(-decay * time);
            var cos = Math.Cos(damped * time);
            var sin = Math.Sin(damped * time);
            return (
                to + (envelope * ((displacement * cos) + (sine * sin))),
                envelope * ((((sine * damped) - (decay * displacement)) * cos) - (((decay * sine) + (displacement * damped)) * sin)));
        }

        if (ratio == 1)
        {
            var slope = velocity + (natural * displacement);
            var envelope = Math.Exp(-natural * time);
            return (to + (envelope * (displacement + (slope * time))), envelope * (velocity - (natural * slope * time)));
        }

        var root = Math.Sqrt((ratio * ratio) - 1);
        var slow = -natural * (ratio - root);
        var fast = -natural * (ratio + root);
        var first = (velocity - (fast * displacement)) / (slow - fast);
        var second = displacement - first;
        var slowPart = first * Math.Exp(slow * time);
        var fastPart = second * Math.Exp(fast * time);
        return (to + slowPart + fastPart, (slowPart * slow) + (fastPart * fast));
    }

    /// <summary>
    /// True once a value moving over <paramref name="distance"/> has come to rest, by the rule of the
    /// animation library the previous UI used: closer than a small step and slower than a small speed.
    /// </summary>
    /// <remarks>
    /// The limits are finer for a short distance (an opacity or a scale, below 5) than for a long one
    /// (pixels), as in that library.
    /// </remarks>
    public static bool IsAtRest(double position, double velocity, double to, double distance)
    {
        var granular = Math.Abs(distance) < 5;
        return Math.Abs(velocity) <= (granular ? 0.01 : 2) && Math.Abs(to - position) <= (granular ? 0.005 : 0.5);
    }
}
