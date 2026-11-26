using System.Windows.Input;
using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Data;
using Avalonia.Input;
using Avalonia.Media;
using TradingAgent.App.Motion;

namespace TradingAgent.App.Controls;

/// <summary>
/// A question in the middle of the window, over a dimmed and blurred page: the second step of
/// something that cannot be taken back, or a short form.
/// </summary>
/// <remarks>
/// <para>
/// It lies over the whole window and is unseen until <see cref="IsOpen"/> is true. The paper scales
/// in from 92 % in a fifth of a second with a small overshoot, as the dialogs of the previous UI.
/// </para>
/// <para>
/// A press beside the paper, or Escape, runs <see cref="CloseCommand"/>: the dialog never closes
/// itself, the view model that opened it does. Without a close command it stays until answered.
/// </para>
/// </remarks>
public sealed class Dialog : ContentControl
{
    public static readonly StyledProperty<bool> IsOpenProperty =
        AvaloniaProperty.Register<Dialog, bool>(nameof(IsOpen));

    public static readonly StyledProperty<string?> TitleProperty =
        AvaloniaProperty.Register<Dialog, string?>(nameof(Title));

    /// <summary>The buttons at the bottom right.</summary>
    public static readonly StyledProperty<object?> ActionsProperty =
        AvaloniaProperty.Register<Dialog, object?>(nameof(Actions));

    public static readonly StyledProperty<ICommand?> CloseCommandProperty =
        AvaloniaProperty.Register<Dialog, ICommand?>(nameof(CloseCommand));

    private const double Seconds = 0.2;

    private static readonly Easing _overshoot = new SplineEasing(0.34, 1.56, 0.64, 1);
    private static readonly Easing _fade = new SplineEasing(0.4, 0, 0.2, 1);

    private Control? _paper;
    private Control? _scrim;

    static Dialog()
    {
        IsVisibleProperty.OverrideDefaultValue<Dialog>(false);
        FocusableProperty.OverrideDefaultValue<Dialog>(true);
        IsOpenProperty.Changed.AddClassHandler<Dialog>((dialog, change) => dialog.OnOpenChanged(change.GetNewValue<bool>()));
    }

    public bool IsOpen
    {
        get => GetValue(IsOpenProperty);
        set => SetValue(IsOpenProperty, value);
    }

    public string? Title
    {
        get => GetValue(TitleProperty);
        set => SetValue(TitleProperty, value);
    }

    public object? Actions
    {
        get => GetValue(ActionsProperty);
        set => SetValue(ActionsProperty, value);
    }

    public ICommand? CloseCommand
    {
        get => GetValue(CloseCommandProperty);
        set => SetValue(CloseCommandProperty, value);
    }

    protected override void OnApplyTemplate(TemplateAppliedEventArgs e)
    {
        base.OnApplyTemplate(e);
        if (_scrim is not null)
        {
            _scrim.PointerPressed -= OnScrimPressed;
        }

        _paper = e.NameScope.Find<Control>("PART_Paper");
        _scrim = e.NameScope.Find<Control>("PART_Scrim");
        if (_scrim is not null)
        {
            _scrim.PointerPressed += OnScrimPressed;
        }
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (e.Key == Key.Escape && IsOpen)
        {
            Close();
            e.Handled = true;
        }
    }

    private void OnScrimPressed(object? sender, PointerPressedEventArgs e) => Close();

    private void Close()
    {
        if (CloseCommand is { } command && command.CanExecute(null))
        {
            command.Execute(null);
        }
    }

    private void OnOpenChanged(bool open)
    {
        IsVisible = open;
        if (!open)
        {
            return;
        }

        // Keys go to the dialog while it is open, not to the page under it.
        Focus();
        ApplyTemplate();
        if (_paper is not { } paper)
        {
            return;
        }

        var opacity = new ValueStream<double>(0);
        var transform = new MatrixTransform(Matrix.CreateScale(0.92, 0.92));
        var holdOpacity = paper.Bind(OpacityProperty, opacity, BindingPriority.Animation);
        var holdTransform = paper.SetValue(RenderTransformProperty, transform, BindingPriority.Animation);
        var dim = new ValueStream<double>(0);
        var holdDim = _scrim?.Bind(OpacityProperty, dim, BindingPriority.Animation);
        FrameDriver.Run(paper, seconds =>
        {
            if (seconds >= Seconds)
            {
                holdOpacity.Dispose();
                holdTransform?.Dispose();
                holdDim?.Dispose();
                return false;
            }

            var share = seconds / Seconds;
            var scale = 0.92 + (0.08 * _overshoot.Ease(share));
            opacity.Set(Math.Clamp(_overshoot.Ease(share), 0, 1));
            transform.Matrix = Matrix.CreateScale(scale, scale);
            dim.Set(_fade.Ease(share));
            return true;
        });
    }
}
