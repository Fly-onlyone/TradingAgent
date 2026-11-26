using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Immutable;
using Avalonia.Rendering.Composition;
using Avalonia.Threading;
using TradingAgent.App.Motion;
using TradingAgent.App.Theme;

namespace TradingAgent.App.Effects;

/// <summary>
/// The moving background of the window: drifting colour blobs and, over them, a network of dots
/// joined by lines. Everything else is drawn on top of it, much of it through glass.
/// </summary>
/// <remarks>
/// <para>
/// It is drawn by the compositor, on the render thread, 15 times a second (see <see cref="Endless"/>
/// for why not at the rate of the display). It starts only after the window has shown its first
/// frame and the UI thread is idle, so it costs nothing at start-up, and it stops while the window
/// is hidden or minimized.
/// </para>
/// <para>
/// With animations off it shows nothing, as in the previous UI. <see cref="DrawStill"/> makes it
/// draw one still frame instead, for a picture of a page.
/// </para>
/// </remarks>
public sealed class EffectsLayer : Control
{
    /// <summary>The preset whose blobs and colours are shown.</summary>
    public static readonly StyledProperty<ThemePreset?> PresetProperty =
        AvaloniaProperty.Register<EffectsLayer, ThemePreset?>(nameof(Preset));

    /// <summary>False shows nothing: the "Background Effects" setting.</summary>
    public static readonly StyledProperty<bool> IsOnProperty =
        AvaloniaProperty.Register<EffectsLayer, bool>(nameof(IsOn), true);

    private static readonly object _tick = new();

    private CompositionCustomVisual? _visual;
    private Window? _window;
    private IDisposable? _ticks;
    private bool _ready;

    static EffectsLayer()
    {
        IsHitTestVisibleProperty.OverrideDefaultValue<EffectsLayer>(false);
        PresetProperty.Changed.AddClassHandler<EffectsLayer>((layer, _) => layer.Refresh());
        IsOnProperty.Changed.AddClassHandler<EffectsLayer>((layer, _) => layer.Refresh());
    }

    /// <summary>True draws one still frame on the UI thread instead of the moving one: a picture of a page.</summary>
    public static bool DrawStill { get; set; }

    public ThemePreset? Preset
    {
        get => GetValue(PresetProperty);
        set => SetValue(PresetProperty, value);
    }

    public bool IsOn
    {
        get => GetValue(IsOnProperty);
        set => SetValue(IsOnProperty, value);
    }

    public override void Render(DrawingContext context)
    {
        if (!DrawStill || !IsOn || Preset is not { } preset || Bounds.Width <= 0)
        {
            return;
        }

        var size = Bounds.Size;
        foreach (var blob in BlobField.For(preset))
        {
            var (centre, scale) = BlobField.At(blob, 0, size);
            context.DrawEllipse(blob.Brush, null, centre, blob.Reach * scale, blob.Reach * scale);
        }

        // The same dots every time, so two pictures of one page are the same picture.
        var field = new ParticleField(size.Width, size.Height, new Random(7));
        var dot = new ImmutableSolidColorBrush(preset.Primary.Main, 0.65);
        for (var index = 0; index < ParticleField.Count; index++)
        {
            context.DrawEllipse(dot, null, new Point(field.X[index], field.Y[index]), ParticleField.DotRadius, ParticleField.DotRadius);
        }
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        _window = TopLevel.GetTopLevel(this) as Window;
        if (_window is not null)
        {
            _window.PropertyChanged += OnWindowChanged;
        }

        if (ElementComposition.GetElementVisual(this) is { } own)
        {
            _visual = own.Compositor.CreateCustomVisual(new Painter());
            ElementComposition.SetElementChildVisual(this, _visual);
            _visual.Size = new Vector(Bounds.Width, Bounds.Height);
        }

        // Not during start-up: the first frame of the window comes first.
        Dispatcher.UIThread.Post(
            () =>
            {
                _ready = true;
                Refresh();
            },
            DispatcherPriority.ApplicationIdle);
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        if (_window is not null)
        {
            _window.PropertyChanged -= OnWindowChanged;
            _window = null;
        }

        _ticks?.Dispose();
        _ticks = null;
        _visual?.SendHandlerMessage(Scene.Nothing);
        ElementComposition.SetElementChildVisual(this, null);
        _visual = null;
        _ready = false;
    }

    protected override void OnSizeChanged(SizeChangedEventArgs e)
    {
        base.OnSizeChanged(e);
        if (_visual is not null)
        {
            _visual.Size = new Vector(e.NewSize.Width, e.NewSize.Height);
        }

        Refresh();
    }

    private void OnWindowChanged(object? sender, AvaloniaPropertyChangedEventArgs change)
    {
        if (change.Property == Window.WindowStateProperty || change.Property == IsVisibleProperty)
        {
            Refresh();
        }
    }

    /// <summary>Tells the painter what to draw now, or to stop.</summary>
    private void Refresh()
    {
        InvalidateVisual();
        if (_visual is null)
        {
            return;
        }

        var shown = _window is null or { IsVisible: true, WindowState: not WindowState.Minimized };
        var moving = _ready && IsOn && shown && !FrameDriver.IsInstant && Preset is not null && Bounds.Width > 0;
        _visual.SendHandlerMessage(moving
            ? new Scene(Bounds.Size, BlobField.For(Preset!), Preset!.Primary.Main)
            : Scene.Nothing);
        if (moving)
        {
            // Every second tick: the blobs and dots move a few pixels a second, and a frame of them
            // redraws the whole window and every sheet of glass on it.
            var count = 0;
            _ticks ??= Endless.Every(_ =>
            {
                if (count++ % 2 == 0)
                {
                    _visual?.SendHandlerMessage(_tick);
                }
            });
        }
        else
        {
            _ticks?.Dispose();
            _ticks = null;
        }
    }

    /// <summary>What the painter draws: the blobs, the colour of the network and the size of the window.</summary>
    private sealed record Scene(Size Size, IReadOnlyList<Blob> Blobs, Color Network)
    {
        public static Scene Nothing { get; } = new(default, [], default);

        public bool IsNothing => Blobs.Count == 0;
    }

    /// <summary>Draws the scene on the render thread, a new frame for every tick it is sent.</summary>
    private sealed class Painter : CompositionCustomVisualHandler
    {
        private const int Shades = 16;
        private const double FrameMilliseconds = 1000.0 / 60;

        private readonly ImmutablePen[] _lines = new ImmutablePen[Shades];
        private readonly ImmutableSolidColorBrush[] _dots = new ImmutableSolidColorBrush[Shades];
        private Scene _scene = Scene.Nothing;
        private ParticleField? _field;
        private Color _network;
        private TimeSpan? _start;
        private TimeSpan _last;

        public override void OnMessage(object message)
        {
            if (ReferenceEquals(message, _tick))
            {
                if (!_scene.IsNothing)
                {
                    Invalidate();
                }

                return;
            }

            if (message is not Scene scene)
            {
                return;
            }

            // Another size or another theme: the picture the glass draws from is of the old one.
            GlassBackdrop.Drop();
            _scene = scene;
            if (scene.IsNothing)
            {
                _field = null;
                Invalidate();
                return;
            }

            if (_field is null || _field.Width != scene.Size.Width || _field.Height != scene.Size.Height)
            {
                // New dots for a new size, as the previous engine made them on a resize.
                _field = new ParticleField(scene.Size.Width, scene.Size.Height);
            }

            if (_network != scene.Network || _lines[0] is null)
            {
                _network = scene.Network;
                for (var shade = 0; shade < Shades; shade++)
                {
                    var share = (shade + 1d) / Shades;
                    _lines[shade] = new ImmutablePen(new ImmutableSolidColorBrush(scene.Network, ParticleField.LineOpacity * share), 1);
                    _dots[shade] = new ImmutableSolidColorBrush(scene.Network, 0.4 + (0.5 * share));
                }
            }

            Invalidate();
        }

        public override void OnRender(ImmediateDrawingContext drawingContext)
        {
            if (!_scene.IsNothing && _field is { } field)
            {
                Draw(drawingContext, field);
            }

            // This is the last thing drawn under the pages, so now the canvas holds the background and
            // nothing else. With nothing to draw that still holds: the plain background is one too.
            GlassBackdrop.Capture(drawingContext, EffectiveSize);
        }

        private void Draw(ImmediateDrawingContext drawingContext, ParticleField field)
        {

            var now = CompositionNow;
            _start ??= now;
            // The dots move as the previous engine moved them, in frames of a sixtieth of a second,
            // however far apart the ticks are. Nothing is made up for a pause.
            var passed = (now - _last).TotalMilliseconds;
            _last = now;
            if (passed < 500)
            {
                for (var frames = Math.Clamp((int)Math.Round(passed / FrameMilliseconds), 1, 4); frames > 0; frames--)
                {
                    field.Step(FrameMilliseconds);
                }
            }

            var seconds = (now - _start.Value).TotalSeconds;
            foreach (var blob in _scene.Blobs)
            {
                var (centre, scale) = BlobField.At(blob, seconds, _scene.Size);
                drawingContext.DrawEllipse(blob.Brush, null, centre, blob.Reach * scale, blob.Reach * scale);
            }

            var x = field.X;
            var y = field.Y;
            const double Reach = ParticleField.LineDistance * ParticleField.LineDistance;
            for (var first = 0; first < ParticleField.Count; first++)
            {
                for (var second = first + 1; second < ParticleField.Count; second++)
                {
                    var dx = x[first] - x[second];
                    var dy = y[first] - y[second];
                    var squared = (dx * dx) + (dy * dy);
                    if (squared < Reach)
                    {
                        // The closer two dots are, the stronger the line between them.
                        var strength = 1 - (Math.Sqrt(squared) / ParticleField.LineDistance);
                        var shade = Math.Clamp((int)(strength * Shades), 0, Shades - 1);
                        drawingContext.DrawLine(_lines[shade], new Point(x[first], y[first]), new Point(x[second], y[second]));
                    }
                }
            }

            var opacity = field.Opacity;
            for (var index = 0; index < ParticleField.Count; index++)
            {
                var shade = Math.Clamp((int)((opacity[index] - 0.4) / 0.5 * Shades), 0, Shades - 1);
                drawingContext.DrawEllipse(_dots[shade], null, new Point(x[index], y[index]), ParticleField.DotRadius, ParticleField.DotRadius);
            }
        }
    }
}
