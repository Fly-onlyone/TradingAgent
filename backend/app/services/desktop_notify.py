"""Desktop toast notifications with app icon in the header.

Uses WinRT toast XML directly via PowerShell with the ToastGeneric template
and appLogoOverride so the icon appears next to the app name in the header.
"""

import logging
import platform
import re
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

logger = logging.getLogger(__name__)

IS_WINDOWS = platform.system() == "Windows"

APP_ID = "TradingAgent"

# ToastGeneric template with appLogoOverride — puts icon in the header
_PS_TEMPLATE = r"""
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$Template = @"
<toast duration="{duration}">
    <visual>
        <binding template="ToastGeneric">
            {icon_xml}
            <text><![CDATA[{title}]]></text>
            <text><![CDATA[{body}]]></text>
        </binding>
    </visual>
    <audio silent="true" />
</toast>
"@

$SerializedXml = New-Object Windows.Data.Xml.Dom.XmlDocument
$SerializedXml.LoadXml($Template)

$Toast = [Windows.UI.Notifications.ToastNotification]::new($SerializedXml)
$Notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("{app_id}")
$Notifier.Show($Toast)
"""


def _sanitize_for_toast(text: str) -> str:
    """Sanitize text for embedding in PowerShell here-string XML CDATA."""
    text = text.replace("]]>", "]]&gt;")  # CDATA breakout
    text = re.sub(r'^"@', ' "@', text, flags=re.MULTILINE)  # here-string breakout
    return text


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
    """Send a desktop toast notification with the app icon in the header."""
    if not IS_WINDOWS:
        return

    try:
        ensure_notification_shortcut()
        icon = _get_icon_path()
        icon_xml = ""
        if icon:
            icon_uri = "file:///" + icon.replace("\\", "/")
            icon_xml = (
                f'<image placement="appLogoOverride" src="{xml_escape(icon_uri)}"'
                ' hint-crop="circle" />'
            )

        duration = "long" if duration == "long" else "short"

        script = _PS_TEMPLATE.format(
            duration=duration,
            title=_sanitize_for_toast(title),
            body=_sanitize_for_toast(body[:256]),
            icon_xml=icon_xml,
            app_id=APP_ID,
        )

        si = subprocess.STARTUPINFO()
        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        subprocess.Popen(
            ["powershell.exe", "-ExecutionPolicy", "Bypass", "-Command", script],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            startupinfo=si,
        )
    except Exception as e:
        logger.debug("Desktop notification failed: %s", e)
