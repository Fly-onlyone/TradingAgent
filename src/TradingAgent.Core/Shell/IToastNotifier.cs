namespace TradingAgent.Core.Shell;

/// <summary>Shows operating-system notifications ("toasts") under the app's name and icon.</summary>
public interface IToastNotifier
{
    /// <summary>Raised when the user clicks a notification while the app is running.</summary>
    event EventHandler? Activated;

    /// <summary>Shows a notification. Failures are logged, not thrown: a missed toast must not break a feature.</summary>
    void Show(string title, string body);
}

/// <summary>Starts the app when the user signs in to the operating system.</summary>
public interface IAutostart
{
    bool IsEnabled { get; }

    void Enable();

    void Disable();
}
