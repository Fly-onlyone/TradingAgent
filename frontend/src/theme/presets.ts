/**
 * Theme presets — each defines a full design system:
 * colors, glass/shape parameters, animation characteristics.
 */

export type ThemeId = "solar" | "glacier" | "jade" | "eclipse";

export interface ThemePreset {
    id: ThemeId;
    label: string;
    primary: { main: string; light: string; dark: string; contrastText: string };
    secondary: {
        main: string;
        light: string;
        dark: string;
        contrastText: string;
    };
    accent: { main: string; light: string; dark: string; contrastText: string };
    accentRgb: string;
    background: { default: string; paper: string };
    text: { primary: string; secondary: string; disabled: string };
    primaryRgb: string;
    secondaryRgb: string;
    surface: {
        glass: string;
        elevated: string;
        sidebar: string;
        header: string;
        tooltip: string;
        muted: string;
        hoverCard: string;
    };
    scrollbar: { thumb: string; thumbHover: string; track: string };
    semantics: {
        success: { main: string; light: string; dark: string };
        error: { main: string; light: string; dark: string };
        warning: { main: string; light: string; dark: string };
        info: { main: string; light: string; dark: string };
    };
    semanticRgb: {
        success: string;
        error: string;
        warning: string;
        info: string;
    };
    trading: {
        bullish: string;
        bullishRgb: string;
        bearish: string;
        bearishRgb: string;
        volume: string;
        volumeRgb: string;
        neutral: string;
        neutralRgb: string;
    };
    border: {
        subtle: string;
        medium: string;
        strong: string;
        white: string;
    };
    interactive: {
        hover: string;
        focus: string;
        focusRing: string;
        active: string;
        selected: string;
        selectedBorder: string;
    };
    chart: {
        series: string[];
        annotation: string;
        gridLine: string;
    };
    status: {
        online: string;
        offline: string;
        away: string;
        busy: string;
        onlineRgb: string;
    };
    cardTint: string;
    gradientAccent: string;
    sectionGlow: string;
    glass: {
        borderRadius: number;
        cardBlur: number;
        sidebarBlur: number;
        cardOpacity: number;
        elevatedOpacity: number;
        sidebarOpacity: number;
        headerOpacity: number;
    };
    animations: {
        fast: number;
        normal: number;
        slow: number;
        spring: {
            snappy: { stiffness: number; damping: number };
            bouncy: { stiffness: number; damping: number };
            gentle: { stiffness: number; damping: number };
        };
        easing: { easeOutExpo: string; easeInOutBack: string };
        meshBlobCount: number;
        meshBlobCycleMin: number;
        meshBlobCycleMax: number;
    };
    spacing: {
        page: number;
        sectionGap: number;
        cardPadding: number;
    };
    elevation: {
        surface: string;
        raised: string;
        floating: string;
    };
}

const solar: ThemePreset = {
    id: "solar",
    label: "Solar",
    primary: {
        main: "#F97316",
        light: "#FB923C",
        dark: "#EA580C",
        contrastText: "#FFFFFF",
    },
    secondary: {
        main: "#8B5CF6",
        light: "#A78BFA",
        dark: "#7C3AED",
        contrastText: "#FFFFFF",
    },
    accent: {
        main: "#FBBF24",
        light: "#FCD34D",
        dark: "#F59E0B",
        contrastText: "#000000",
    },
    accentRgb: "251, 191, 36",
    background: {default: "#1a1410", paper: "#2a1f12"},
    text: {primary: "#F8FAFC", secondary: "#B8A894", disabled: "#7B6B5B"},
    primaryRgb: "249, 115, 22",
    secondaryRgb: "139, 92, 246",
    surface: {
        glass: "55, 40, 20",
        elevated: "70, 52, 28",
        sidebar: "30, 22, 12",
        header: "30, 22, 12",
        tooltip: "70, 52, 28",
        muted: "80, 60, 30",
        hoverCard: "65, 48, 25",
    },
    scrollbar: {thumb: "#7A5533", thumbHover: "#9A7044", track: "transparent"},
    semantics: {
        success: {main: "#10B981", light: "#34D399", dark: "#059669"},
        error: {main: "#EF4444", light: "#F87171", dark: "#DC2626"},
        warning: {main: "#FBBF24", light: "#FCD34D", dark: "#F59E0B"},
        info: {main: "#3B82F6", light: "#60A5FA", dark: "#2563EB"},
    },
    semanticRgb: {
        success: "16, 185, 129",
        error: "239, 68, 68",
        warning: "251, 191, 36",
        info: "59, 130, 246",
    },
    trading: {
        bullish: "#10B981",
        bullishRgb: "16, 185, 129",
        bearish: "#EF4444",
        bearishRgb: "239, 68, 68",
        volume: "#3B82F6",
        volumeRgb: "59, 130, 246",
        neutral: "#94A3B8",
        neutralRgb: "148, 163, 184",
    },
    border: {
        subtle: "rgba(249, 115, 22, 0.08)",
        medium: "rgba(249, 115, 22, 0.15)",
        strong: "rgba(249, 115, 22, 0.35)",
        white: "rgba(255, 255, 255, 0.1)",
    },
    interactive: {
        hover: "rgba(249, 115, 22, 0.08)",
        focus: "rgba(249, 115, 22, 0.4)",
        focusRing: "0 0 0 2px rgba(249, 115, 22, 0.4)",
        active: "rgba(249, 115, 22, 0.15)",
        selected: "rgba(249, 115, 22, 0.12)",
        selectedBorder: "rgba(249, 115, 22, 0.5)",
    },
    chart: {
        series: [
            "#F97316",
            "#FBBF24",
            "#EF4444",
            "#8B5CF6",
            "#10B981",
            "#F43F5E",
            "#3B82F6",
            "#EC4899",
        ],
        annotation: "#FBBF24",
        gridLine: "rgba(80, 60, 30, 0.3)",
    },
    status: {
        online: "#10B981",
        offline: "#6B7280",
        away: "#FBBF24",
        busy: "#EF4444",
        onlineRgb: "16, 185, 129",
    },
    cardTint: "rgba(249, 115, 22, 0.08)",
    gradientAccent: "linear-gradient(90deg, #DC2626 0%, #F97316 25%, #FBBF24 50%, #F97316 75%, #DC2626 100%)",
    sectionGlow: "rgba(249, 115, 22, 0.18)",
    glass: {
        borderRadius: 8,
        cardBlur: 16,
        sidebarBlur: 24,
        cardOpacity: 0.65,
        elevatedOpacity: 0.55,
        sidebarOpacity: 0.8,
        headerOpacity: 0.7,
    },
    animations: {
        fast: 150,
        normal: 250,
        slow: 400,
        spring: {
            snappy: {stiffness: 400, damping: 30},
            bouncy: {stiffness: 300, damping: 20},
            gentle: {stiffness: 200, damping: 25},
        },
        easing: {
            easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
            easeInOutBack: "cubic-bezier(0.68, -0.6, 0.32, 1.6)",
        },
        meshBlobCount: 4,
        meshBlobCycleMin: 18,
        meshBlobCycleMax: 25,
    },
    spacing: {
        page: 24,
        sectionGap: 24,
        cardPadding: 20,
    },
    elevation: {
        surface: "0 1px 3px rgba(0,0,0,0.2)",
        raised: "0 4px 12px rgba(0,0,0,0.25)",
        floating: "0 12px 32px rgba(0,0,0,0.35)",
    },
};

const glacier: ThemePreset = {
    id: "glacier",
    label: "Glacier",
    primary: {
        main: "#00BCD4",
        light: "#26C6DA",
        dark: "#0097A7",
        contrastText: "#FFFFFF",
    },
    secondary: {
        main: "#0EA5E9",
        light: "#38BDF8",
        dark: "#0284C7",
        contrastText: "#FFFFFF",
    },
    accent: {
        main: "#818CF8",
        light: "#A5B4FC",
        dark: "#6366F1",
        contrastText: "#FFFFFF",
    },
    accentRgb: "129, 140, 248",
    background: {default: "#0B1120", paper: "#111827"},
    text: {primary: "#F0F6FF", secondary: "#94A8B8", disabled: "#5B6B7B"},
    primaryRgb: "0, 188, 212",
    secondaryRgb: "14, 165, 233",
    surface: {
        glass: "20, 30, 50",
        elevated: "28, 40, 65",
        sidebar: "11, 17, 32",
        header: "11, 17, 32",
        tooltip: "28, 40, 65",
        muted: "30, 50, 80",
        hoverCard: "25, 38, 60",
    },
    scrollbar: {thumb: "#2D4A6A", thumbHover: "#3D5A7A", track: "transparent"},
    semantics: {
        success: {main: "#10B981", light: "#34D399", dark: "#059669"},
        error: {main: "#F43F5E", light: "#FB7185", dark: "#E11D48"},
        warning: {main: "#F59E0B", light: "#FBBF24", dark: "#D97706"},
        info: {main: "#06B6D4", light: "#22D3EE", dark: "#0891B2"},
    },
    semanticRgb: {
        success: "16, 185, 129",
        error: "244, 63, 94",
        warning: "245, 158, 11",
        info: "6, 182, 212",
    },
    trading: {
        bullish: "#34D399",
        bullishRgb: "52, 211, 153",
        bearish: "#F43F5E",
        bearishRgb: "244, 63, 94",
        volume: "#38BDF8",
        volumeRgb: "56, 189, 248",
        neutral: "#94A3B8",
        neutralRgb: "148, 163, 184",
    },
    border: {
        subtle: "rgba(0, 188, 212, 0.08)",
        medium: "rgba(0, 188, 212, 0.15)",
        strong: "rgba(0, 188, 212, 0.35)",
        white: "rgba(255, 255, 255, 0.1)",
    },
    interactive: {
        hover: "rgba(0, 188, 212, 0.08)",
        focus: "rgba(0, 188, 212, 0.4)",
        focusRing: "0 0 0 2px rgba(0, 188, 212, 0.4)",
        active: "rgba(0, 188, 212, 0.15)",
        selected: "rgba(0, 188, 212, 0.12)",
        selectedBorder: "rgba(0, 188, 212, 0.5)",
    },
    chart: {
        series: [
            "#00BCD4",
            "#38BDF8",
            "#818CF8",
            "#06B6D4",
            "#34D399",
            "#F43F5E",
            "#0EA5E9",
            "#A78BFA",
        ],
        annotation: "#38BDF8",
        gridLine: "rgba(30, 50, 80, 0.3)",
    },
    status: {
        online: "#34D399",
        offline: "#6B7280",
        away: "#F59E0B",
        busy: "#F43F5E",
        onlineRgb: "52, 211, 153",
    },
    cardTint: "rgba(0, 188, 212, 0.07)",
    gradientAccent: "linear-gradient(90deg, #0891B2 0%, #06B6D4 20%, #38BDF8 50%, #818CF8 80%, #0891B2 100%)",
    sectionGlow: "rgba(0, 188, 212, 0.18)",
    glass: {
        borderRadius: 6,
        cardBlur: 20,
        sidebarBlur: 28,
        cardOpacity: 0.55,
        elevatedOpacity: 0.45,
        sidebarOpacity: 0.75,
        headerOpacity: 0.65,
    },
    animations: {
        fast: 180,
        normal: 300,
        slow: 500,
        spring: {
            snappy: {stiffness: 300, damping: 35},
            bouncy: {stiffness: 220, damping: 25},
            gentle: {stiffness: 160, damping: 30},
        },
        easing: {
            easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
            easeInOutBack: "cubic-bezier(0.68, -0.6, 0.32, 1.6)",
        },
        meshBlobCount: 3,
        meshBlobCycleMin: 25,
        meshBlobCycleMax: 35,
    },
    spacing: {
        page: 28,
        sectionGap: 28,
        cardPadding: 24,
    },
    elevation: {
        surface: "0 1px 3px rgba(0,0,0,0.25)",
        raised: "0 4px 12px rgba(0,0,0,0.3)",
        floating: "0 12px 32px rgba(0,0,0,0.4)",
    },
};

const jade: ThemePreset = {
    id: "jade",
    label: "Jade",
    primary: {
        main: "#10B981",
        light: "#34D399",
        dark: "#059669",
        contrastText: "#FFFFFF",
    },
    secondary: {
        main: "#14B8A6",
        light: "#2DD4BF",
        dark: "#0D9488",
        contrastText: "#FFFFFF",
    },
    accent: {
        main: "#F59E0B",
        light: "#FBBF24",
        dark: "#D97706",
        contrastText: "#000000",
    },
    accentRgb: "245, 158, 11",
    background: {default: "#0A1210", paper: "#111C18"},
    text: {primary: "#F0FFF8", secondary: "#94B8A8", disabled: "#5B7B6B"},
    primaryRgb: "16, 185, 129",
    secondaryRgb: "20, 184, 166",
    surface: {
        glass: "18, 40, 32",
        elevated: "25, 55, 44",
        sidebar: "10, 18, 16",
        header: "10, 18, 16",
        tooltip: "25, 55, 44",
        muted: "30, 60, 50",
        hoverCard: "22, 48, 38",
    },
    scrollbar: {thumb: "#2D6A4A", thumbHover: "#3D7A5A", track: "transparent"},
    semantics: {
        success: {main: "#22C55E", light: "#4ADE80", dark: "#16A34A"},
        error: {main: "#EF4444", light: "#F87171", dark: "#DC2626"},
        warning: {main: "#EAB308", light: "#FACC15", dark: "#CA8A04"},
        info: {main: "#06B6D4", light: "#22D3EE", dark: "#0891B2"},
    },
    semanticRgb: {
        success: "34, 197, 94",
        error: "239, 68, 68",
        warning: "234, 179, 8",
        info: "6, 182, 212",
    },
    trading: {
        bullish: "#22C55E",
        bullishRgb: "34, 197, 94",
        bearish: "#EF4444",
        bearishRgb: "239, 68, 68",
        volume: "#3B82F6",
        volumeRgb: "59, 130, 246",
        neutral: "#94A3B8",
        neutralRgb: "148, 163, 184",
    },
    border: {
        subtle: "rgba(16, 185, 129, 0.08)",
        medium: "rgba(16, 185, 129, 0.15)",
        strong: "rgba(16, 185, 129, 0.35)",
        white: "rgba(255, 255, 255, 0.1)",
    },
    interactive: {
        hover: "rgba(16, 185, 129, 0.08)",
        focus: "rgba(16, 185, 129, 0.4)",
        focusRing: "0 0 0 2px rgba(16, 185, 129, 0.4)",
        active: "rgba(16, 185, 129, 0.15)",
        selected: "rgba(16, 185, 129, 0.12)",
        selectedBorder: "rgba(16, 185, 129, 0.5)",
    },
    chart: {
        series: [
            "#10B981",
            "#22C55E",
            "#14B8A6",
            "#F59E0B",
            "#3B82F6",
            "#EF4444",
            "#06B6D4",
            "#8B5CF6",
        ],
        annotation: "#F59E0B",
        gridLine: "rgba(30, 60, 50, 0.3)",
    },
    status: {
        online: "#22C55E",
        offline: "#6B7280",
        away: "#EAB308",
        busy: "#EF4444",
        onlineRgb: "34, 197, 94",
    },
    cardTint: "rgba(16, 185, 129, 0.07)",
    gradientAccent: "linear-gradient(90deg, #047857 0%, #10B981 25%, #34D399 50%, #2DD4BF 75%, #047857 100%)",
    sectionGlow: "rgba(16, 185, 129, 0.18)",
    glass: {
        borderRadius: 10,
        cardBlur: 14,
        sidebarBlur: 22,
        cardOpacity: 0.6,
        elevatedOpacity: 0.5,
        sidebarOpacity: 0.78,
        headerOpacity: 0.68,
    },
    animations: {
        fast: 140,
        normal: 230,
        slow: 380,
        spring: {
            snappy: {stiffness: 350, damping: 28},
            bouncy: {stiffness: 280, damping: 18},
            gentle: {stiffness: 190, damping: 23},
        },
        easing: {
            easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
            easeInOutBack: "cubic-bezier(0.68, -0.6, 0.32, 1.6)",
        },
        meshBlobCount: 5,
        meshBlobCycleMin: 20,
        meshBlobCycleMax: 28,
    },
    spacing: {
        page: 24,
        sectionGap: 24,
        cardPadding: 20,
    },
    elevation: {
        surface: "0 1px 3px rgba(0,0,0,0.2)",
        raised: "0 4px 12px rgba(0,0,0,0.25)",
        floating: "0 12px 32px rgba(0,0,0,0.35)",
    },
};

const eclipse: ThemePreset = {
    id: "eclipse",
    label: "Eclipse",
    primary: {
        main: "#8B5CF6",
        light: "#A78BFA",
        dark: "#7C3AED",
        contrastText: "#FFFFFF",
    },
    secondary: {
        main: "#EC4899",
        light: "#F472B6",
        dark: "#DB2777",
        contrastText: "#FFFFFF",
    },
    accent: {
        main: "#06B6D4",
        light: "#22D3EE",
        dark: "#0891B2",
        contrastText: "#FFFFFF",
    },
    accentRgb: "6, 182, 212",
    background: {default: "#0F0B1A", paper: "#1A1525"},
    text: {primary: "#F5F0FF", secondary: "#A894B8", disabled: "#6B5B7B"},
    primaryRgb: "139, 92, 246",
    secondaryRgb: "236, 72, 153",
    surface: {
        glass: "30, 22, 50",
        elevated: "42, 30, 68",
        sidebar: "15, 11, 26",
        header: "15, 11, 26",
        tooltip: "42, 30, 68",
        muted: "50, 40, 70",
        hoverCard: "38, 28, 58",
    },
    scrollbar: {thumb: "#5A3D7A", thumbHover: "#6A4D8A", track: "transparent"},
    semantics: {
        success: {main: "#10B981", light: "#34D399", dark: "#059669"},
        error: {main: "#F43F5E", light: "#FB7185", dark: "#E11D48"},
        warning: {main: "#F59E0B", light: "#FBBF24", dark: "#D97706"},
        info: {main: "#6366F1", light: "#818CF8", dark: "#4F46E5"},
    },
    semanticRgb: {
        success: "16, 185, 129",
        error: "244, 63, 94",
        warning: "245, 158, 11",
        info: "99, 102, 241",
    },
    trading: {
        bullish: "#10B981",
        bullishRgb: "16, 185, 129",
        bearish: "#F43F5E",
        bearishRgb: "244, 63, 94",
        volume: "#A78BFA",
        volumeRgb: "167, 139, 250",
        neutral: "#94A3B8",
        neutralRgb: "148, 163, 184",
    },
    border: {
        subtle: "rgba(139, 92, 246, 0.08)",
        medium: "rgba(139, 92, 246, 0.15)",
        strong: "rgba(139, 92, 246, 0.35)",
        white: "rgba(255, 255, 255, 0.1)",
    },
    interactive: {
        hover: "rgba(139, 92, 246, 0.08)",
        focus: "rgba(139, 92, 246, 0.4)",
        focusRing: "0 0 0 2px rgba(139, 92, 246, 0.4)",
        active: "rgba(139, 92, 246, 0.15)",
        selected: "rgba(139, 92, 246, 0.12)",
        selectedBorder: "rgba(139, 92, 246, 0.5)",
    },
    chart: {
        series: [
            "#8B5CF6",
            "#EC4899",
            "#06B6D4",
            "#A78BFA",
            "#10B981",
            "#F43F5E",
            "#6366F1",
            "#F472B6",
        ],
        annotation: "#06B6D4",
        gridLine: "rgba(50, 40, 70, 0.3)",
    },
    status: {
        online: "#10B981",
        offline: "#6B7280",
        away: "#F59E0B",
        busy: "#F43F5E",
        onlineRgb: "16, 185, 129",
    },
    cardTint: "rgba(139, 92, 246, 0.08)",
    gradientAccent: "linear-gradient(90deg, #6D28D9 0%, #8B5CF6 20%, #EC4899 50%, #F472B6 80%, #6D28D9 100%)",
    sectionGlow: "rgba(139, 92, 246, 0.20)",
    glass: {
        borderRadius: 14,
        cardBlur: 20,
        sidebarBlur: 30,
        cardOpacity: 0.5,
        elevatedOpacity: 0.4,
        sidebarOpacity: 0.7,
        headerOpacity: 0.6,
    },
    animations: {
        fast: 160,
        normal: 280,
        slow: 450,
        spring: {
            snappy: {stiffness: 250, damping: 25},
            bouncy: {stiffness: 200, damping: 15},
            gentle: {stiffness: 150, damping: 20},
        },
        easing: {
            easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
            easeInOutBack: "cubic-bezier(0.68, -0.6, 0.32, 1.6)",
        },
        meshBlobCount: 4,
        meshBlobCycleMin: 22,
        meshBlobCycleMax: 30,
    },
    spacing: {
        page: 32,
        sectionGap: 32,
        cardPadding: 28,
    },
    elevation: {
        surface: "0 1px 3px rgba(0,0,0,0.3)",
        raised: "0 4px 12px rgba(0,0,0,0.35)",
        floating: "0 12px 32px rgba(0,0,0,0.45)",
    },
};

export const themePresets: Record<ThemeId, ThemePreset> = {
    solar,
    glacier,
    jade,
    eclipse,
};

export function getPreset(id: ThemeId): ThemePreset {
    return themePresets[id];
}

export const themeList: ThemePreset[] = [solar, glacier, jade, eclipse];
