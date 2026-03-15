/**
 * MUI Component overrides for Trading App
 * Factory function driven by ThemePreset.
 */

import type {Components, Theme} from "@mui/material/styles";
import type {ThemePreset} from "./presets";

export function createComponents(
    preset: ThemePreset,
    glassStyles: ReturnType<
        typeof import("./palette").createGlassStyles
    >,
): Components<Theme> {
    const {primaryRgb, surface, scrollbar, background, glass, primary} =
        preset;
    const br = glass.borderRadius;

    return {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    scrollbarColor: `${scrollbar.thumb} ${background.default}`,
                    scrollBehavior: "smooth",
                    background: background.default,
                    transition:
                        "background-color 0.3s ease, scrollbar-color 0.3s ease",
                    "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
                        width: 8,
                        height: 8,
                    },
                    "&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track": {
                        background: "transparent",
                    },
                    "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
                        background: scrollbar.thumb,
                        borderRadius: 4,
                    },
                    "&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover":
                        {
                            background: scrollbar.thumbHover,
                        },
                },
                "@keyframes shimmer": {
                    "0%": {backgroundPosition: "-200% 0"},
                    "100%": {backgroundPosition: "200% 0"},
                },
                "@property --gradient-angle": {
                    syntax: "'<angle>'",
                    initialValue: "0deg",
                    inherits: "false",
                },
                "@keyframes gradientBorderSpin": {
                    "0%": {"--gradient-angle": "0deg"},
                    "100%": {"--gradient-angle": "360deg"},
                },
                "@keyframes meshDrift": {
                    "0%": {backgroundPosition: "0% 0%"},
                    "25%": {backgroundPosition: "100% 50%"},
                    "50%": {backgroundPosition: "50% 100%"},
                    "75%": {backgroundPosition: "0% 50%"},
                    "100%": {backgroundPosition: "0% 0%"},
                },
                "@keyframes glowPulse": {
                    "0%, 100%": {
                        boxShadow: `0 0 10px rgba(${primaryRgb}, 0.2)`,
                    },
                    "50%": {
                        boxShadow: `0 0 25px rgba(${primaryRgb}, 0.5), 0 0 50px rgba(${primaryRgb}, 0.2)`,
                    },
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: br,
                    padding: "8px 16px",
                    fontWeight: 600,
                },
                contained: {
                    boxShadow: "none",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    "&:hover": {
                        boxShadow: `0 4px 12px rgba(${primaryRgb}, 0.3)`,
                        transform: "translateY(-2px)",
                    },
                    "&:active": {
                        transform: "translateY(0)",
                    },
                },
                outlined: {
                    borderWidth: 2,
                    "&:hover": {
                        borderWidth: 2,
                    },
                },
            },
            defaultProps: {
                disableElevation: true,
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    ...glassStyles.card,
                    boxShadow:
                        "0 4px 20px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
                    transition:
                        "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
                    "&:hover": {
                        borderColor: `rgba(${primaryRgb}, 0.35)`,
                        background: `rgba(${surface.hoverCard}, 0.75)`,
                        boxShadow:
                            "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: "none",
                    backgroundColor: `rgba(${surface.glass}, 0.7)`,
                    backdropFilter: `blur(${glass.cardBlur}px)`,
                    WebkitBackdropFilter: `blur(${glass.cardBlur}px)`,
                },
                elevation1: {
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    "& .MuiOutlinedInput-root": {
                        borderRadius: br,
                        "& fieldset": {
                            borderColor: `rgba(${surface.muted}, 0.5)`,
                        },
                        "&:hover fieldset": {
                            borderColor: `rgba(${primaryRgb}, 0.5)`,
                        },
                        "&.Mui-focused fieldset": {
                            borderColor: primary.main,
                        },
                    },
                },
            },
        },
        MuiInputBase: {
            styleOverrides: {
                root: {
                    "&.Mui-disabled": {
                        backgroundColor: `rgba(${surface.sidebar}, 0.5)`,
                    },
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: Math.max(br - 2, 4),
                    fontWeight: 500,
                },
                filled: {
                    backgroundColor: `rgba(${primaryRgb}, 0.15)`,
                    color: primary.light,
                    "&:hover": {
                        backgroundColor: `rgba(${primaryRgb}, 0.25)`,
                    },
                },
            },
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    backgroundColor: `rgba(${surface.tooltip}, 0.9)`,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    fontSize: "0.75rem",
                    borderRadius: Math.max(br - 2, 4),
                    padding: "6px 12px",
                    border: `1px solid rgba(${primaryRgb}, 0.12)`,
                },
                arrow: {
                    color: `rgba(${surface.tooltip}, 0.9)`,
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                root: {
                    "& .MuiBackdrop-root": {
                        backgroundColor: `rgba(${surface.sidebar}, 0.6)`,
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                    },
                },
                paper: {
                    ...glassStyles.card,
                    boxShadow: `0 25px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(${primaryRgb}, 0.05)`,
                    animation:
                        "dialogScaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1)",
                    "@keyframes dialogScaleIn": {
                        "0%": {opacity: 0, transform: "scale(0.92)"},
                        "100%": {opacity: 1, transform: "scale(1)"},
                    },
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    ...glassStyles.sidebar,
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    ...glassStyles.header,
                    boxShadow: "none",
                },
            },
        },
        MuiTabs: {
            styleOverrides: {
                indicator: {
                    height: 3,
                    borderRadius: "3px 3px 0 0",
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    textTransform: "none",
                    fontWeight: 500,
                    minHeight: 48,
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    borderBottom: `1px solid rgba(${surface.muted}, 0.3)`,
                },
                head: {
                    fontWeight: 600,
                    backgroundColor: `rgba(${surface.sidebar}, 0.4)`,
                },
            },
        },
        MuiTableRow: {
            styleOverrides: {
                root: {
                    position: "relative" as const,
                    "&::before": {
                        content: '""',
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 3,
                        background: primary.main,
                        borderRadius: "0 2px 2px 0",
                        transform: "scaleY(0)",
                        transition: "transform 0.2s ease",
                    },
                    "&:hover": {
                        backgroundColor: `rgba(${primaryRgb}, 0.05)`,
                        "&::before": {
                            transform: "scaleY(1)",
                        },
                    },
                },
            },
        },
        MuiDivider: {
            styleOverrides: {
                root: {
                    borderColor: `rgba(${surface.muted}, 0.5)`,
                },
            },
        },
        MuiLinearProgress: {
            styleOverrides: {
                root: {
                    borderRadius: 4,
                    backgroundColor: `rgba(${surface.muted}, 0.3)`,
                },
            },
        },
        MuiCircularProgress: {
            defaultProps: {
                thickness: 4,
            },
        },
        MuiAlert: {
            styleOverrides: {
                root: {
                    borderRadius: br,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                },
                standardSuccess: {
                    backgroundColor: `rgba(${preset.semantics.success.main === "#22C55E" ? "34, 197, 94" : "16, 185, 129"}, 0.15)`,
                    color: preset.semantics.success.light,
                },
                standardError: {
                    backgroundColor: `rgba(${preset.semantics.error.main === "#F43F5E" ? "244, 63, 94" : "239, 68, 68"}, 0.15)`,
                    color: preset.semantics.error.light,
                },
                standardWarning: {
                    backgroundColor: `rgba(${preset.semantics.warning.main === "#EAB308" ? "234, 179, 8" : preset.semantics.warning.main === "#FBBF24" ? "251, 191, 36" : "245, 158, 11"}, 0.15)`,
                    color: preset.semantics.warning.light,
                },
                standardInfo: {
                    backgroundColor: `rgba(${preset.semantics.info.main === "#06B6D4" ? "6, 182, 212" : preset.semantics.info.main === "#6366F1" ? "99, 102, 241" : "59, 130, 246"}, 0.15)`,
                    color: preset.semantics.info.light,
                },
            },
        },
        MuiSkeleton: {
            styleOverrides: {
                root: {
                    background: `linear-gradient(90deg, rgba(${surface.muted},0.2) 25%, rgba(${surface.muted},0.5) 50%, rgba(${surface.muted},0.2) 75%)`,
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.5s infinite ease-in-out",
                },
            },
        },
        MuiBackdrop: {
            styleOverrides: {
                root: {
                    backgroundColor: "transparent",
                    backdropFilter: "none",
                    WebkitBackdropFilter: "none",
                },
            },
        },
    };
}
