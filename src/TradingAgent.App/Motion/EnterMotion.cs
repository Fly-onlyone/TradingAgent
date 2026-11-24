using Avalonia.Animation.Easings;

namespace TradingAgent.App.Motion;

/// <summary>The ways a control can come in. Each is one animation of the previous UI.</summary>
public enum EnterKind
{
    None,

    /// <summary>A page: rises 30 px and grows from 98 %.</summary>
    Page,

    /// <summary>A card of a grid: rises 40 px and grows from 95 %.</summary>
    Cascade,

    /// <summary>A row of a list: slides in 20 px from the left.</summary>
    ListRow,

    SlideFromLeft,

    SlideFromRight,

    SlideFromBottom,

    /// <summary>Pops in from 85 % with an overshoot.</summary>
    Scale,

    /// <summary>A heading: fades up 20 px, softly.</summary>
    FadeUp,

    /// <summary>The content of a tab: rises 10 px.</summary>
    Tab,

    /// <summary>Content further down a page: rises 40 px.</summary>
    Reveal,

    /// <summary>A chat message: rises 10 px in a fifth of a second.</summary>
    Message,

    /// <summary>Only fades in: the parent of a staggered group.</summary>
    Fade,
}

/// <summary>
/// Where an entering control starts and how it gets to its place: on a spring, or in a fixed time on
/// an easing curve.
/// </summary>
public sealed record EnterMotion(double X = 0, double Y = 0, double Scale = 1, Spring? Spring = null, double Seconds = 0.3, Easing? Easing = null)
{
    /// <summary>
    /// The curve the previous UI's animation library used when a transition gave only a duration.
    /// </summary>
    private static readonly Easing _tween = new SplineEasing(0.42, 0, 0.58, 1);

    /// <summary>The curve that library used for an opacity nobody gave a transition for.</summary>
    private static readonly Easing _defaultFade = new SplineEasing(0.25, 0.1, 0.35, 1);

    /// <summary>Seconds between two children of a staggered group of this kind.</summary>
    public static double StaggerOf(EnterKind kind) => kind == EnterKind.ListRow ? 0.03 : 0.08;

    public static EnterMotion? Of(EnterKind kind) => kind switch
    {
        EnterKind.Page => new EnterMotion(Y: 30, Scale: 0.98, Spring: Motion.Spring.Page),
        EnterKind.Cascade => new EnterMotion(Y: 40, Scale: 0.95, Spring: Motion.Spring.Snappy),
        EnterKind.ListRow => new EnterMotion(X: -20, Spring: Motion.Spring.Snappy),
        EnterKind.SlideFromLeft => new EnterMotion(X: -60, Spring: Motion.Spring.Snappy),
        EnterKind.SlideFromRight => new EnterMotion(X: 60, Spring: Motion.Spring.Snappy),
        EnterKind.SlideFromBottom => new EnterMotion(Y: 60, Spring: Motion.Spring.Snappy),
        EnterKind.Scale => new EnterMotion(Scale: 0.85, Spring: Motion.Spring.Bouncy),
        EnterKind.FadeUp => new EnterMotion(Y: 20, Spring: Motion.Spring.Gentle),
        EnterKind.Tab => new EnterMotion(Y: 10, Spring: Motion.Spring.Snappy),
        EnterKind.Reveal => new EnterMotion(Y: 40, Spring: Motion.Spring.Page),
        EnterKind.Message => new EnterMotion(Y: 10, Seconds: 0.2, Easing: _tween),
        EnterKind.Fade => new EnterMotion(Seconds: 0.3, Easing: _defaultFade),
        _ => null,
    };

    /// <summary>
    /// How far along the control is after <paramref name="seconds"/>: 0 at the start, 1 in place.
    /// A spring may pass 1 before it settles.
    /// </summary>
    public (double Progress, bool Done) At(double seconds)
    {
        if (double.IsPositiveInfinity(seconds))
        {
            return (1, true);
        }

        if (Spring is { } spring)
        {
            var (position, velocity) = spring.At(seconds, 0, 1);
            return (position, Motion.Spring.IsAtRest(position, velocity, 1, 1));
        }

        var fraction = Seconds <= 0 ? 1 : Math.Clamp(seconds / Seconds, 0, 1);
        return ((Easing ?? _tween).Ease(fraction), fraction >= 1);
    }
}
