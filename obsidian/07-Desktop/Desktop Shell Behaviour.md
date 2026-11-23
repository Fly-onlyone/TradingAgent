---
tags: [desktop, shell]
---

# Desktop Shell Behaviour

> What the native app does as a Windows program: one instance, tray icon, close to tray, window
> placement, start with Windows, toasts. Copied from the Tauri shell unless noted.

## What it does

- **Single instance** (`SingleInstanceGuard` in Core): a named mutex plus a named pipe restricted
  to the current user. A second launch tells the first to show its window, then exits.
- **Tray icon** (`DesktopShell`): "Show Window" and "Exit"; a third item, "Restart to update to
  <version>", appears when an update is downloaded. Left click shows the window.
- **Close to tray**: a Release build hides its window on close and keeps running, because
  monitoring must continue. Only "Exit" or the operating system shutting down ends it. A Debug
  build exits on close.
- **Start hidden** when the setting `window.start_open` is false.
- **Window placement** (`WindowPlacementTracker`): position, size, scaling and maximized state are
  saved to the setting `window.placement` 500 ms after a move or resize. On start the placement is
  restored only if it still intersects a monitor's working area; otherwise the window is centred.
- **Start with Windows** (`WindowsAutostart`): a shortcut `TradingAgent.lnk` in the user's Startup
  folder, written through source-generated COM. The setting is `desktop.autostart_enabled`.
- **Toasts** (`WindowsToastNotifier`): WinRT `ToastNotificationManager`, no Windows App SDK.
  Clicking a toast shows the window. The setting is `notifications.native_enabled`.
- **App identity** (`AppUserModel`): the AUMID is `Fly.TradingAgent` (`Fly.TradingAgent.Dev` for
  Debug builds). It is registered under `HKCU\Software\Classes\AppUserModelId\` with a display
  name and icon, and the installer uses the same value, so shortcut, taskbar and toasts agree.

## Gotchas

- **Why a shortcut and not the `Run` registry value**: the old app moved away from the Run value
  because it "can get lost after Windows shutdown/updates" (commit `4375bf6`).
- The uninstaller removes the start-up shortcut and the AUMID registration
  (`Program.RemoveSystemIntegration`). It leaves the data folder.
- Windows decides whether a second launch may take the foreground. The app does what Windows
  allows (`AllowSetForegroundWindow`), but focus is not guaranteed.
- `VelopackApp.Build().Run()` must be the first call in `Main`, before the single-instance check:
  the installer and updater start the exe with special arguments.

## See also

- [[_index]]
- [[Desktop Release Pipeline]]
- [[Windows Toast Notifications]] — the old app's approach (winotify)
- [[AUMID]]
