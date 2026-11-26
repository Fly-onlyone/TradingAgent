using Avalonia;
using Avalonia.Animation;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Data;
using Avalonia.Media;
using Avalonia.Threading;

namespace TradingAgent.App.Motion;

/// <summary>
/// How the content of a tab gives way to the next: the old content fades out while it rises 10 px,
/// and only then the new content comes in from 10 px below on a spring.
/// </summary>
/// <remarks>
/// One after the other, not both at once, as the previous UI did it: two contents of different
/// heights crossing each other would make the page jump.
/// </remarks>
public sealed class TabSwitchTransition : IPageTransition
{
    private const double LeaveSeconds = 0.15;

    private static readonly Easing _tween = new SplineEasing(0.42, 0, 0.58, 1);

    public Task Start(Visual? from, Visual? to, bool forward, CancellationToken cancellationToken)
    {
        if (from is not Control leaving || FrameDriver.IsInstant)
        {
            Enter(to);
            return Task.CompletedTask;
        }

        // The new content is already in place under the old one; keep it unseen until its turn.
        var holdEntering = to?.SetValue(Visual.OpacityProperty, 0d, BindingPriority.Animation);
        var opacity = new ValueStream<double>(1);
        var transform = new MatrixTransform();
        var holdOpacity = leaving.Bind(Visual.OpacityProperty, opacity, BindingPriority.Animation);
        var holdTransform = leaving.SetValue(Visual.RenderTransformProperty, transform, BindingPriority.Animation);
        var done = new TaskCompletionSource();

        FrameDriver.Run(leaving, seconds =>
        {
            var finished = seconds >= LeaveSeconds || cancellationToken.IsCancellationRequested;
            var progress = finished ? 1 : _tween.Ease(seconds / LeaveSeconds);
            opacity.Set(1 - progress);
            transform.Matrix = Matrix.CreateTranslation(0, -10 * progress);
            if (!finished)
            {
                return true;
            }

            holdEntering?.Dispose();
            Enter(to);
            done.TrySetResult();
            // The tab control hides the old content when this method's task ends; let go of it only
            // after that, or it would show for one frame.
            Dispatcher.UIThread.Post(
                () =>
                {
                    holdOpacity.Dispose();
                    holdTransform?.Dispose();
                },
                DispatcherPriority.Background);
            return false;
        });
        return done.Task;
    }

    private static void Enter(Visual? to)
    {
        if (to is Control entering && EnterMotion.Of(EnterKind.Tab) is { } motion)
        {
            Motion.Enter.Play(entering, motion);
        }
    }
}
