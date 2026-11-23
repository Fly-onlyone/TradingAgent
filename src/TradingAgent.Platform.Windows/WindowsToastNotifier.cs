using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Security;
using Microsoft.Extensions.Logging;
using TradingAgent.Core.Shell;
using Windows.Data.Xml.Dom;
using Windows.UI.Notifications;

namespace TradingAgent.Platform.Windows;

/// <summary>Shows Windows toast notifications under the app's registered identity.</summary>
/// <remarks>
/// Uses the WinRT notification API directly. The identity must have been registered with
/// <see cref="AppUserModel.Register"/> first, or the toast appears without the app's name and icon.
/// Windows does not show toasts from elevated (administrator) processes.
/// </remarks>
[SupportedOSPlatform("windows10.0.19041.0")]
public sealed partial class WindowsToastNotifier(string appUserModelId, ILogger<WindowsToastNotifier> logger)
    : IToastNotifier
{
    /// <summary>Windows truncates long bodies itself, but unevenly; cut where the old app did.</summary>
    private const int MaximumBodyLength = 256;

    public event EventHandler? Activated;

    public void Show(string title, string body)
    {
        ArgumentNullException.ThrowIfNull(title);
        ArgumentNullException.ThrowIfNull(body);
        if (body.Length > MaximumBodyLength)
        {
            body = body[..MaximumBodyLength];
        }

        try
        {
            var document = new XmlDocument();
            document.LoadXml(
                "<toast><visual><binding template=\"ToastGeneric\">"
                + $"<text>{SecurityElement.Escape(title)}</text><text>{SecurityElement.Escape(body)}</text>"
                + "</binding></visual></toast>");

            var toast = new ToastNotification(document);
            toast.Activated += (_, _) => Activated?.Invoke(this, EventArgs.Empty);
            ToastNotificationManager.CreateToastNotifier(appUserModelId).Show(toast);
        }
        catch (Exception ex) when (ex is COMException or InvalidOperationException or UnauthorizedAccessException)
        {
            LogShowFailed(logger, ex);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "A desktop notification could not be shown.")]
    private static partial void LogShowFailed(ILogger logger, Exception exception);
}
