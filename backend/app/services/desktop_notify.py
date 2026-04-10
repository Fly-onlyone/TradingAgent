"""Desktop toast notifications using winotify (Windows) with app icon.

Same approach as ZZZ bot's NotificationHelper — sends persistent Windows toast
notifications that appear in the Action Center with the app icon.
"""

import logging
import platform
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

IS_WINDOWS = platform.system() == "Windows"

_winotify_available = False
if IS_WINDOWS:
    try:
        from winotify import Notification as WinNotification
        from winotify import audio

        _winotify_available = True
    except ImportError:
        logger.debug("winotify not installed — desktop toasts disabled")

APP_ID = "TradingAgent"


def _resolve_icon_path() -> str:
    """Find the app icon relative to the running executable or source tree."""
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).parent
        for candidate in [
            exe_dir / "icons" / "128x128@2x.png",
            exe_dir / "icons" / "128x128.png",
            exe_dir / "icons" / "icon.ico",
        ]:
            if candidate.exists():
                return str(candidate.resolve())

    project_root = Path(__file__).resolve().parents[3]
    icons_dir = project_root / "frontend" / "src-tauri" / "icons"
    for candidate in [
        icons_dir / "128x128@2x.png",
        icons_dir / "128x128.png",
        icons_dir / "icon.ico",
    ]:
        if candidate.exists():
            return str(candidate.resolve())

    return ""


_icon_path: str | None = None


def _get_icon_path() -> str:
    global _icon_path
    if _icon_path is None:
        _icon_path = _resolve_icon_path()
        if _icon_path:
            logger.info("Desktop notification icon: %s", _icon_path)
        else:
            logger.warning("Desktop notification icon not found")
    return _icon_path


_shortcut_ensured = False


def ensure_notification_shortcut() -> None:
    """Ensure the Start Menu shortcut AUMID matches APP_ID for toast title icons."""
    global _shortcut_ensured
    if _shortcut_ensured or not IS_WINDOWS:
        return
    _shortcut_ensured = True

    try:
        from win32com.propsys import propsys, pscon
        from win32com.shell import shellcon

        shortcut = str(
            Path.home() / "AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Trading agent.lnk"
        )
        if not Path(shortcut).exists():
            return

        store = propsys.SHGetPropertyStoreFromParsingName(
            shortcut, None, shellcon.GPS_READWRITE, propsys.IID_IPropertyStore
        )
        current = store.GetValue(pscon.PKEY_AppUserModel_ID).GetValue()
        if current == APP_ID:
            return

        store.SetValue(pscon.PKEY_AppUserModel_ID, propsys.PROPVARIANTType(APP_ID))
        store.Commit()
        logger.info("Updated Start Menu shortcut AUMID: %s -> %s", current, APP_ID)
    except Exception as e:
        logger.debug("Failed to update shortcut AUMID: %s", e)


def send_desktop_notification(
    title: str,
    body: str,
    duration: str = "short",
) -> None:
    """Send a desktop toast notification with the app icon."""
    if not IS_WINDOWS or not _winotify_available:
        return

    try:
        ensure_notification_shortcut()
        icon = _get_icon_path()
        toast = WinNotification(
            app_id=APP_ID,
            title=title,
            msg=body[:256],
            duration="long" if duration == "long" else "short",
            icon=icon or "",
        )
        try:
            toast.set_audio(audio.Default, loop=False)
        except Exception:
            pass
        toast.show()
    except Exception as e:
        logger.debug("Desktop notification failed: %s", e)
