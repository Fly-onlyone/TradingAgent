using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Microsoft.Extensions.Logging;
using TradingAgent.Core.Shell;
using TradingAgent.Platform.Windows.Interop;

namespace TradingAgent.Platform.Windows;

/// <summary>Starts the app at sign-in through a shortcut in the user's Startup folder.</summary>
/// <remarks>
/// A shortcut, not the <c>Run</c> registry value: the previous app found the registry entry could vanish
/// after Windows updates and moved to the Startup folder for that reason. The user can also see and remove
/// the shortcut in Task Manager's Startup tab.
/// </remarks>
[SupportedOSPlatform("windows")]
public sealed partial class WindowsAutostart : IAutostart
{
    private readonly string _shortcutFile;
    private readonly string _executable;
    private readonly string _description;
    private readonly ILogger<WindowsAutostart> _logger;

    /// <param name="shortcutName">File name of the shortcut, without extension.</param>
    /// <param name="executable">Full path of the program to start.</param>
    /// <param name="description">Tooltip of the shortcut.</param>
    /// <param name="startupFolder">Folder to write to; the user's Startup folder when null.</param>
    public WindowsAutostart(
        string shortcutName,
        string executable,
        string description,
        ILogger<WindowsAutostart> logger,
        string? startupFolder = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(shortcutName);
        ArgumentException.ThrowIfNullOrWhiteSpace(executable);
        var folder = startupFolder ?? Environment.GetFolderPath(Environment.SpecialFolder.Startup);
        _shortcutFile = Path.Combine(folder, shortcutName + ".lnk");
        _executable = executable;
        _description = description;
        _logger = logger;
    }

    public bool IsEnabled => File.Exists(_shortcutFile);

    public void Enable()
    {
        try
        {
            var link = ShellLinkFactory.Create();
            link.SetPath(_executable);
            link.SetWorkingDirectory(Path.GetDirectoryName(_executable) ?? string.Empty);
            link.SetDescription(_description);
            link.SetIconLocation(_executable, 0);
            ((IPersistFile)link).Save(_shortcutFile, remember: true);
        }
        catch (Exception ex) when (ex is COMException or IOException or UnauthorizedAccessException)
        {
            LogEnableFailed(_logger, ex);
            throw new InvalidOperationException("The start-up shortcut could not be created.", ex);
        }
    }

    public void Disable()
    {
        try
        {
            File.Delete(_shortcutFile);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            LogDisableFailed(_logger, ex);
            throw new InvalidOperationException("The start-up shortcut could not be removed.", ex);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Creating the start-up shortcut failed.")]
    private static partial void LogEnableFailed(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Removing the start-up shortcut failed.")]
    private static partial void LogDisableFailed(ILogger logger, Exception exception);
}
