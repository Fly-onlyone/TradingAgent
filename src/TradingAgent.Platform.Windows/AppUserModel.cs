using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Microsoft.Win32;

namespace TradingAgent.Platform.Windows;

/// <summary>Gives the process a Windows application identity (an "AppUserModelID").</summary>
/// <remarks>
/// Windows attributes notifications and taskbar entries to this identity. Without the registry entry a
/// notification from an app that was not installed from the Store shows no name and a generic icon.
/// </remarks>
[SupportedOSPlatform("windows")]
public static partial class AppUserModel
{
    /// <summary>Registers the identity for the current user and assigns it to this process.</summary>
    /// <param name="iconFile">Full path of a PNG shown next to notifications.</param>
    public static void Register(string appUserModelId, string displayName, string iconFile)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(appUserModelId);
        using (var key = Registry.CurrentUser.CreateSubKey($@"Software\Classes\AppUserModelId\{appUserModelId}"))
        {
            key.SetValue("DisplayName", displayName, RegistryValueKind.String);
            key.SetValue("IconUri", iconFile, RegistryValueKind.String);
        }

        Marshal.ThrowExceptionForHR(SetCurrentProcessExplicitAppUserModelID(appUserModelId));
    }

    /// <summary>Removes the registration made by <see cref="Register"/>. Used when the app is uninstalled.</summary>
    public static void Unregister(string appUserModelId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(appUserModelId);
        Registry.CurrentUser.DeleteSubKeyTree($@"Software\Classes\AppUserModelId\{appUserModelId}", throwOnMissingSubKey: false);
    }

    /// <summary>
    /// Lets the already running instance bring its window to the front. Windows only allows the process
    /// that received the last input to do that, which here is the second launch that is about to exit.
    /// </summary>
    public static void AllowAnyProcessToTakeForeground()
    {
        const int AnyProcess = -1; // ASFW_ANY
        _ = AllowSetForegroundWindow(AnyProcess);
    }

    [LibraryImport("shell32.dll", StringMarshalling = StringMarshalling.Utf16)]
    private static partial int SetCurrentProcessExplicitAppUserModelID(string appId);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool AllowSetForegroundWindow(int processId);
}
