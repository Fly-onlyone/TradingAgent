"""Scan Windows registry and Steam libraries for installed applications."""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import re
import sys
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)

CACHE_TTL = 60  # seconds
_cache: tuple[float, list[InstalledApp]] | None = None


@dataclass
class InstalledApp:
    display_name: str
    exe_name: str | None = None
    publisher: str | None = None
    install_location: str | None = None
    source: str = "registry"  # "registry" | "steam"
    icon_base64: str | None = None
    install_size_mb: int | None = None


# ---------------------------------------------------------------------------
# Registry scanning
# ---------------------------------------------------------------------------

REGISTRY_UNINSTALL_PATHS = [
    (0x80000002, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),  # HKLM
    (0x80000002, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),  # HKLM 32-bit
    (0x80000001, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),  # HKCU
]

# Publishers whose entries are almost always non-application system components
_SYSTEM_PUBLISHER_PREFIXES = ("microsoft", "windows", "nvidia", "intel", "amd", "realtek")

# DisplayName patterns that indicate non-application entries
_SKIP_NAME_PATTERNS = re.compile(
    r"(visual c\+\+|\.net |redistribut|sdk |driver |update for|hotfix|"
    r"security update|service pack|runtime|vulkan|directx|msvc|oem)",
    re.IGNORECASE,
)


def _read_reg_value(key, name: str):
    """Read a single registry value, returning None on failure."""
    import winreg

    try:
        value, _ = winreg.QueryValueEx(key, name)
        return value
    except OSError:
        return None


_UNINSTALLER_EXE_NAMES = {
    "uninstall.exe",
    "unins000.exe",
    "unins001.exe",
    "uninst.exe",
    "setup.exe",
    "installer.exe",
    "install.exe",
    "update.exe",
    "updater.exe",
    "nssm.exe",
    "msiexec.exe",
}

_UNINSTALLER_EXE_PATTERNS = re.compile(
    r"(uninstall|uninst|setup|installer|updater|helper|crash|vc_redist|vcredist|dxsetup)",
    re.IGNORECASE,
)


def _is_uninstaller_exe(name: str) -> bool:
    """Check if an exe name looks like an uninstaller or setup utility."""
    return name.lower() in _UNINSTALLER_EXE_NAMES or bool(_UNINSTALLER_EXE_PATTERNS.search(name))


def _extract_exe_from_display_icon(display_icon: str | None) -> str | None:
    """Parse the exe path from a DisplayIcon registry value like 'C:\\path\\app.exe,0'."""
    if not display_icon:
        return None
    # Strip icon index suffix (e.g. ",0")
    path = re.sub(r",\d+$", "", display_icon.strip().strip('"'))
    if path.lower().endswith(".exe") and os.path.isfile(path):
        basename = os.path.basename(path)
        if _is_uninstaller_exe(basename):
            return None
        return basename
    return None


def _find_exe_in_dir(install_dir: str | None) -> str | None:
    """Look for a prominent .exe in an install directory (checks one level of subdirs too)."""
    if not install_dir or not os.path.isdir(install_dir):
        return None

    def _scan(directory: str) -> list[str]:
        try:
            return [
                f
                for f in os.listdir(directory)
                if f.lower().endswith(".exe") and not _is_uninstaller_exe(f)
            ]
        except OSError:
            return []

    # Check top-level first
    candidates = _scan(install_dir)
    if len(candidates) == 1:
        return candidates[0]

    # If no unique exe at top level, walk subdirectories up to 2 levels deep
    # (handles launchers like HoYoPlay that nest games in games/<game>/)
    if len(candidates) != 1:
        for root_dir, dirs, _files in os.walk(install_dir):
            # Limit depth to 2 levels below install_dir
            depth = root_dir.replace(install_dir, "").count(os.sep)
            if depth >= 3:
                dirs.clear()
                continue
            if root_dir == install_dir:
                continue
            sub_candidates = _scan(root_dir)
            if len(sub_candidates) == 1:
                return sub_candidates[0]

    return None


def _get_icon_path(display_icon: str | None, install_location: str | None) -> str | None:
    """Resolve the file path from which to extract an icon."""
    if display_icon:
        path = re.sub(r",\d+$", "", display_icon.strip().strip('"'))
        if os.path.isfile(path):
            return path
    if install_location and os.path.isdir(install_location):
        for f in os.listdir(install_location):
            if f.lower().endswith(".exe") and f.lower() not in {
                "uninstall.exe",
                "unins000.exe",
            }:
                full = os.path.join(install_location, f)
                if os.path.isfile(full):
                    return full
    return None


def _scan_registry() -> list[InstalledApp]:
    """Scan Windows registry for installed applications (blocking)."""
    if sys.platform != "win32":
        return []

    import winreg

    apps: dict[str, InstalledApp] = {}

    for hive, subkey_path in REGISTRY_UNINSTALL_PATHS:
        try:
            root = winreg.OpenKey(hive, subkey_path)
        except OSError:
            continue

        try:
            i = 0
            while True:
                try:
                    subkey_name = winreg.EnumKey(root, i)
                    i += 1
                except OSError:
                    break

                try:
                    subkey = winreg.OpenKey(root, subkey_name)
                except OSError:
                    continue

                try:
                    display_name = _read_reg_value(subkey, "DisplayName")
                    if not display_name or not display_name.strip():
                        continue

                    # Skip system components
                    if _read_reg_value(subkey, "SystemComponent") == 1:
                        continue
                    if _read_reg_value(subkey, "ParentKeyName"):
                        continue
                    release_type = _read_reg_value(subkey, "ReleaseType") or ""
                    if release_type.lower() in ("update", "hotfix"):
                        continue

                    display_name = display_name.strip()

                    # Skip system packages by name pattern
                    if _SKIP_NAME_PATTERNS.search(display_name):
                        continue

                    publisher = _read_reg_value(subkey, "Publisher")
                    install_location = _read_reg_value(subkey, "InstallLocation")
                    display_icon = _read_reg_value(subkey, "DisplayIcon")
                    estimated_size = _read_reg_value(subkey, "EstimatedSize")  # in KB

                    # Extract exe name
                    exe_name = _extract_exe_from_display_icon(display_icon)
                    if not exe_name and install_location:
                        exe_name = _find_exe_in_dir(install_location)

                    # Deduplicate by display_name
                    key = display_name.lower()
                    if key in apps:
                        # Prefer entry with exe_name
                        if not apps[key].exe_name and exe_name:
                            apps[key].exe_name = exe_name
                        continue

                    # Extract icon
                    icon_path = _get_icon_path(display_icon, install_location)
                    icon_b64 = _extract_icon_base64(icon_path) if icon_path else None

                    size_mb = None
                    if estimated_size and isinstance(estimated_size, int) and estimated_size > 0:
                        size_mb = max(1, estimated_size // 1024)

                    apps[key] = InstalledApp(
                        display_name=display_name,
                        exe_name=exe_name,
                        publisher=publisher.strip() if publisher else None,
                        install_location=install_location,
                        source="registry",
                        icon_base64=icon_b64,
                        install_size_mb=size_mb,
                    )
                except Exception:
                    continue
                finally:
                    winreg.CloseKey(subkey)
        finally:
            winreg.CloseKey(root)

    return list(apps.values())


# ---------------------------------------------------------------------------
# Steam scanning
# ---------------------------------------------------------------------------


def _get_steam_path() -> str | None:
    """Read Steam install path from the registry."""
    if sys.platform != "win32":
        return None
    import winreg

    try:
        key = winreg.OpenKey(0x80000001, r"Software\Valve\Steam")  # HKCU
        val, _ = winreg.QueryValueEx(key, "SteamPath")
        winreg.CloseKey(key)
        return val
    except OSError:
        return None


def _parse_vdf_value(text: str, key: str) -> str | None:
    """Extract a simple string value from a VDF text block."""
    m = re.search(rf'"{re.escape(key)}"\s+"([^"]*)"', text, re.IGNORECASE)
    return m.group(1) if m else None


def _scan_steam(existing_names: set[str]) -> list[InstalledApp]:
    """Scan Steam library folders for installed games (blocking)."""
    steam_path = _get_steam_path()
    if not steam_path:
        return []

    library_vdf = os.path.join(steam_path, "steamapps", "libraryfolders.vdf")
    if not os.path.isfile(library_vdf):
        return []

    try:
        with open(library_vdf, encoding="utf-8") as f:
            vdf_text = f.read()
    except OSError:
        return []

    # Extract library paths from VDF
    lib_paths = re.findall(r'"path"\s+"([^"]+)"', vdf_text)
    if not lib_paths:
        lib_paths = [steam_path]

    apps: list[InstalledApp] = []
    for lib_path in lib_paths:
        steamapps = os.path.join(lib_path, "steamapps")
        if not os.path.isdir(steamapps):
            continue

        for fname in os.listdir(steamapps):
            if not fname.startswith("appmanifest_") or not fname.endswith(".acf"):
                continue
            acf_path = os.path.join(steamapps, fname)
            try:
                with open(acf_path, encoding="utf-8") as f:
                    acf = f.read()
            except OSError:
                continue

            name = _parse_vdf_value(acf, "name")
            installdir = _parse_vdf_value(acf, "installdir")
            size_str = _parse_vdf_value(acf, "SizeOnDisk")

            if not name or not installdir:
                continue

            # Skip if already found via registry
            if name.lower() in existing_names:
                continue

            game_dir = os.path.join(steamapps, "common", installdir)
            exe_name = _find_exe_in_dir(game_dir) if os.path.isdir(game_dir) else None

            # Try to find icon from game directory
            icon_path = None
            if game_dir and os.path.isdir(game_dir):
                for f in os.listdir(game_dir):
                    if f.lower().endswith(".exe") and f.lower() not in {
                        "uninstall.exe",
                        "unins000.exe",
                    }:
                        icon_path = os.path.join(game_dir, f)
                        break

            icon_b64 = _extract_icon_base64(icon_path) if icon_path else None

            size_mb = None
            if size_str and size_str.isdigit():
                size_bytes = int(size_str)
                if size_bytes > 0:
                    size_mb = max(1, size_bytes // (1024 * 1024))

            apps.append(
                InstalledApp(
                    display_name=name,
                    exe_name=exe_name,
                    publisher=None,
                    install_location=game_dir if os.path.isdir(game_dir) else None,
                    source="steam",
                    icon_base64=icon_b64,
                    install_size_mb=size_mb,
                )
            )

    return apps


# ---------------------------------------------------------------------------
# Icon extraction (Windows only, via ctypes + Pillow)
# ---------------------------------------------------------------------------


def _extract_icon_base64(exe_path: str, size: int = 32) -> str | None:
    """Extract the first icon from an exe/ico file and return as base64 PNG."""
    if sys.platform != "win32" or not exe_path or not os.path.isfile(exe_path):
        return None

    try:
        import ctypes
        import ctypes.wintypes

        from PIL import Image

        shell32 = ctypes.windll.shell32
        user32 = ctypes.windll.user32
        gdi32 = ctypes.windll.gdi32

        class ICONINFO(ctypes.Structure):
            _fields_ = [
                ("fIcon", ctypes.wintypes.BOOL),
                ("xHotspot", ctypes.wintypes.DWORD),
                ("yHotspot", ctypes.wintypes.DWORD),
                ("hbmMask", ctypes.c_void_p),
                ("hbmColor", ctypes.c_void_p),
            ]

        class BITMAP(ctypes.Structure):
            _fields_ = [
                ("bmType", ctypes.c_long),
                ("bmWidth", ctypes.c_long),
                ("bmHeight", ctypes.c_long),
                ("bmWidthBytes", ctypes.c_long),
                ("bmPlanes", ctypes.c_ushort),
                ("bmBitsPixel", ctypes.c_ushort),
                ("bmBits", ctypes.c_void_p),
            ]

        class BITMAPINFOHEADER(ctypes.Structure):
            _fields_ = [
                ("biSize", ctypes.wintypes.DWORD),
                ("biWidth", ctypes.c_long),
                ("biHeight", ctypes.c_long),
                ("biPlanes", ctypes.c_ushort),
                ("biBitCount", ctypes.c_ushort),
                ("biCompression", ctypes.wintypes.DWORD),
                ("biSizeImage", ctypes.wintypes.DWORD),
                ("biXPelsPerMeter", ctypes.c_long),
                ("biYPelsPerMeter", ctypes.c_long),
                ("biClrUsed", ctypes.wintypes.DWORD),
                ("biClrImportant", ctypes.wintypes.DWORD),
            ]

        # Set proper arg/return types for 64-bit handle safety
        user32.GetIconInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(ICONINFO)]
        user32.GetIconInfo.restype = ctypes.wintypes.BOOL
        user32.GetDC.restype = ctypes.c_void_p
        user32.ReleaseDC.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        user32.DestroyIcon.argtypes = [ctypes.c_void_p]
        gdi32.GetObjectW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]
        gdi32.GetObjectW.restype = ctypes.c_int
        gdi32.GetDIBits.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_uint,
            ctypes.c_uint,
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_uint,
        ]
        gdi32.GetDIBits.restype = ctypes.c_int
        gdi32.DeleteObject.argtypes = [ctypes.c_void_p]

        hicons = (ctypes.c_void_p * 1)()
        smalls = (ctypes.c_void_p * 1)()
        count = shell32.ExtractIconExW(exe_path, 0, hicons, smalls, 1)
        if count == 0 or not hicons[0]:
            return None

        try:
            ii = ICONINFO()
            if not user32.GetIconInfo(hicons[0], ctypes.byref(ii)):
                return None
            try:
                bmp = BITMAP()
                gdi32.GetObjectW(ii.hbmColor, ctypes.sizeof(BITMAP), ctypes.byref(bmp))
                w, h = bmp.bmWidth, bmp.bmHeight
                if w <= 0 or h <= 0:
                    return None

                bmi = BITMAPINFOHEADER()
                bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
                bmi.biWidth = w
                bmi.biHeight = -h  # top-down
                bmi.biPlanes = 1
                bmi.biBitCount = 32

                buf = ctypes.create_string_buffer(w * h * 4)
                hdc = user32.GetDC(None)
                gdi32.GetDIBits(hdc, ii.hbmColor, 0, h, buf, ctypes.byref(bmi), 0)
                user32.ReleaseDC(None, hdc)

                # Convert BGRA → RGBA
                data = bytearray(buf.raw)
                for i in range(0, len(data), 4):
                    data[i], data[i + 2] = data[i + 2], data[i]

                img = Image.frombytes("RGBA", (w, h), bytes(data))
                if (w, h) != (size, size):
                    img = img.resize((size, size), Image.Resampling.LANCZOS)

                buf_io = io.BytesIO()
                img.save(buf_io, format="PNG", optimize=True)
                return base64.b64encode(buf_io.getvalue()).decode()
            finally:
                gdi32.DeleteObject(ii.hbmMask)
                gdi32.DeleteObject(ii.hbmColor)
        finally:
            user32.DestroyIcon(hicons[0])
            if smalls[0]:
                user32.DestroyIcon(smalls[0])
    except Exception:
        logger.debug("Icon extraction failed for %s", exe_path, exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def _scan_all() -> list[InstalledApp]:
    """Scan registry + Steam and return deduplicated, sorted list (blocking)."""
    registry_apps = _scan_registry()
    existing_names = {a.display_name.lower() for a in registry_apps}
    steam_apps = _scan_steam(existing_names)

    all_apps = registry_apps + steam_apps
    # Sort: apps with exe_name first, then by name
    all_apps.sort(key=lambda a: (a.exe_name is None, a.display_name.lower()))
    return all_apps


async def scan_installed_apps() -> list[InstalledApp]:
    """Async wrapper — scans in a thread to avoid blocking the event loop."""
    global _cache
    now = time.monotonic()
    if _cache and (now - _cache[0]) < CACHE_TTL:
        return _cache[1]

    apps = await asyncio.to_thread(_scan_all)
    _cache = (now, apps)
    logger.info("Scanned %d installed applications", len(apps))
    return apps
