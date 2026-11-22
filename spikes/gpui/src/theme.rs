//! The "Solar" preset from SPEC.md: JSON theme for the library's components plus direct colors
//! for the parts we draw ourselves.

use gpui_kit::component::{Theme, ThemeRegistry};
use gpui_kit::{App, Hsla, rgba};

pub const WINDOW_BG: u32 = 0x211b14ff;
pub const CARD_BG: u32 = 0x332818ff;
/// rgba(52, 40, 24, 0.72)
pub const HEADER_BG: u32 = 0x342818b8;
pub const ACCENT_HEX: u32 = 0xf97316ff;
pub const TEXT_PRIMARY: u32 = 0xf8fafcff;
/// rgba(249, 115, 22, 0.08)
pub const BORDER_SUBTLE: u32 = 0xf9731614;
/// rgba(249, 115, 22, 0.15)
pub const BORDER_MEDIUM: u32 = 0xf9731626;

pub fn color(hex: u32) -> Hsla {
    rgba(hex).into()
}

pub fn accent() -> Hsla {
    color(ACCENT_HEX)
}

pub fn bullish() -> Hsla {
    color(0x10b981ff)
}

pub fn bearish() -> Hsla {
    color(0xef4444ff)
}

pub fn init(cx: &mut App) {
    let json = include_str!("solar.json");
    if let Err(error) = ThemeRegistry::global_mut(cx).load_themes_from_str(json) {
        eprintln!("solar theme not loaded: {error}");
        return;
    }
    let Some(config) = ThemeRegistry::global(cx).themes().get("Solar").cloned() else {
        return;
    };
    Theme::update(cx, |theme| theme.apply_config(&config));
}
