/**
 * MUI Component overrides for Trading App
 * Factory function driven by ThemePreset.
 */

import type {Components, Theme} from "@mui/material/styles";
import type {ThemePreset} from "./presets";

export function createComponents(
    preset: ThemePreset,
    glassStyles: ReturnType<typeof import("./palette").createGlassStyles>,
): Components<Theme> {
    const {primaryRgb, surface, scrollbar, background, glass, primary} = preset;
    const br = glass.borderRadius;

    return {
        MuiCssBaseline: {
            styleOverrides: {
                html: {
                    height: "100%",
                    overflow: "hidden",
                },
                body: {
                    height: "100%",
                    overflow: "hidden",
                    scrollbarColor: `${scrollbar.thumb} ${background.default}`,
                    scrollBehavior: "smooth",
                    background: background.default,
                    transition: "background-color 0.3s ease, scrollbar-color 0.3s ease",
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
                "@keyframes gradientFlow": {
                    "0%": {backgroundPosition: "0% 50%"},
                    "50%": {backgroundPosition: "100% 50%"},
                    "100%": {backgroundPosition: "0% 50%"},
                },
                "@keyframes toastCountdown": {
                    "0%": {transform: "scaleX(1)", transformOrigin: "left"},
                    "100%": {transform: "scaleX(0)", transformOrigin: "left"},
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: br,
                    padding: "8px 16px",
                    fontWeight: 600,
                    "&:focus-visible": {
                        outline: "none",
                        boxShadow: preset.interactive.focusRing,
                    },
                },
                contained: {
                    background: `linear-gradient(135deg, rgba(${primaryRgb}, 0.7), rgba(${primaryRgb}, 0.5))`,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: `1px solid rgba(${primaryRgb}, 0.3)`,
                    boxShadow: `0 2px 8px rgba(${primaryRgb}, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15)`,
                    color: primary.contrastText,
                    cursor: "pointer",
                    transition:
                        "transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease",
                    "&:hover": {
                        background: `linear-gradient(135deg, rgba(${primaryRgb}, 0.85), rgba(${primaryRgb}, 0.65))`,
                        borderColor: `rgba(${primaryRgb}, 0.5)`,
                        boxShadow: `0 4px 16px rgba(${primaryRgb}, 0.4), 0 0 20px rgba(${primaryRgb}, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)`,
                        transform: "translateY(-1px)",
                    },
                    "&:active": {
                        transform: "scale(0.97)",
                        background: `linear-gradient(135deg, rgba(${primaryRgb}, 0.6), rgba(${primaryRgb}, 0.45))`,
                        boxShadow: `0 1px 4px rgba(${primaryRgb}, 0.3), inset 0 2px 4px rgba(0, 0, 0, 0.2)`,
                        transition:
                            "transform 0.1s ease, box-shadow 0.1s ease, background 0.1s ease",
                    },
                    "&.Mui-disabled": {
                        background: `linear-gradient(135deg, rgba(${surface.muted}, 0.25), rgba(${surface.muted}, 0.15))`,
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        border: `1px solid rgba(${surface.muted}, 0.1)`,
                        color: "rgba(255, 255, 255, 0.38)",
                        boxShadow: "none",
                        cursor: "not-allowed",
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
        MuiIconButton: {
            styleOverrides: {
                root: {
                    "&:focus-visible": {
                        outline: "none",
                        boxShadow: preset.interactive.focusRing,
                    },
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    ...glassStyles.card,
                    position: "relative" as const,
                    background: `linear-gradient(${preset.cardTint}, ${preset.cardTint}), rgba(${surface.glass}, ${glass.cardOpacity})`,
                    boxShadow: `0 4px 20px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 0 30px ${preset.sectionGlow}`,
                    transition:
                        "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
                    "&::before": {
                        content: '""',
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 1.5,
                        background: preset.gradientAccent,
                        backgroundSize: "200% 100%",
                        borderRadius: `${br + 4}px ${br + 4}px 0 0`,
                        animation: "none",
                    },
                    "&:hover::before": {
                        animation: "gradientFlow 6s ease infinite",
                    },
                    "&:hover": {
                        borderColor: preset.border.strong,
                        background: `linear-gradient(${preset.cardTint}, ${preset.cardTint}), rgba(${surface.hoverCard}, 0.75)`,
                        boxShadow: `0 0 20px ${preset.sectionGlow}, 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08)`,
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    background: `linear-gradient(${preset.cardTint}, ${preset.cardTint}), rgba(${surface.glass}, 0.7)`,
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
                        "&:focus-visible": {
                            outline: "none",
                            boxShadow: preset.interactive.focusRing,
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
                    "&:focus-visible": {
                        outline: "none",
                        boxShadow: preset.interactive.focusRing,
                    },
                },
                filled: {
                    backgroundColor: `rgba(${primaryRgb}, 0.15)`,
                    color: primary.light,
                    "&:hover": {
                        backgroundColor: `rgba(${primaryRgb}, 0.25)`,
                        boxShadow: `0 0 8px rgba(${primaryRgb}, 0.2)`,
                    },
                },
            },
        },
        MuiTooltip: {
            styleOverrides: {
                popper: {
                    zoom: "var(--ui-zoom-inverse, 1)",
                },
                tooltip: {
                    zoom: "var(--ui-zoom, 1)",
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
        MuiPopper: {
            styleOverrides: {
                root: {
                    zoom: "var(--ui-zoom-inverse, 1)",
                    "& > *": {
                        zoom: "var(--ui-zoom, 1)",
                    },
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
                    animation: "dialogScaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1)",
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
                    display: "none",
                },
                flexContainer: {
                    gap: 4,
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    position: "relative",
                    textTransform: "none",
                    fontWeight: 500,
                    minHeight: 44,
                    paddingLeft: 8,
                    paddingRight: 8,
                    minWidth: "auto",
                    "&::after": {
                        content: '""',
                        position: "absolute",
                        left: "50%",
                        bottom: 0,
                        transform: "translateX(-50%) scaleX(0)",
                        transformOrigin: "center",
                        width: "60%",
                        maxWidth: 88,
                        height: 3,
                        borderRadius: "3px 3px 0 0",
                        backgroundColor: primary.main,
                        transition: "transform 0.2s ease",
                    },
                    "&.Mui-selected::after": {
                        transform: "translateX(-50%) scaleX(1)",
                    },
                    "&:focus-visible": {
                        outline: "none",
                        boxShadow: preset.interactive.focusRing,
                    },
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
                    border: "none",
                    height: 1,
                    background: preset.gradientAccent,
                    backgroundSize: "200% 100%",
                    opacity: 0.5,
                    animation: "gradientFlow 8s ease infinite",
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
                    backgroundColor: `rgba(${preset.semanticRgb.success}, 0.15)`,
                    color: preset.semantics.success.light,
                },
                standardError: {
                    backgroundColor: `rgba(${preset.semanticRgb.error}, 0.15)`,
                    color: preset.semantics.error.light,
                },
                standardWarning: {
                    backgroundColor: `rgba(${preset.semanticRgb.warning}, 0.15)`,
                    color: preset.semantics.warning.light,
                },
                standardInfo: {
                    backgroundColor: `rgba(${preset.semanticRgb.info}, 0.15)`,
                    color: preset.semantics.info.light,
                },
                filledSuccess: {
                    background: `linear-gradient(135deg, rgba(${preset.semanticRgb.success}, 0.55), rgba(${preset.semanticRgb.success}, 0.35))`,
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    color: "#fff",
                    border: `1px solid rgba(${preset.semanticRgb.success}, 0.3)`,
                    borderLeft: `3px solid ${preset.semantics.success.light}`,
                    boxShadow: `0 4px 16px rgba(0, 0, 0, 0.3), 0 0 12px rgba(${preset.semanticRgb.success}, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.12)`,
                    "& .MuiAlert-icon": {color: "#fff"},
                    "& .MuiAlert-action": {color: "#fff"},
                },
                filledError: {
                    background: `linear-gradient(135deg, rgba(${preset.semanticRgb.error}, 0.55), rgba(${preset.semanticRgb.error}, 0.35))`,
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    color: "#fff",
                    border: `1px solid rgba(${preset.semanticRgb.error}, 0.3)`,
                    borderLeft: `3px solid ${preset.semantics.error.light}`,
                    boxShadow: `0 4px 16px rgba(0, 0, 0, 0.3), 0 0 12px rgba(${preset.semanticRgb.error}, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.12)`,
                    "& .MuiAlert-icon": {color: "#fff"},
                    "& .MuiAlert-action": {color: "#fff"},
                },
                filledWarning: {
                    background: `linear-gradient(135deg, rgba(${preset.semanticRgb.warning}, 0.55), rgba(${preset.semanticRgb.warning}, 0.35))`,
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    color: "#fff",
                    border: `1px solid rgba(${preset.semanticRgb.warning}, 0.3)`,
                    borderLeft: `3px solid ${preset.semantics.warning.light}`,
                    boxShadow: `0 4px 16px rgba(0, 0, 0, 0.3), 0 0 12px rgba(${preset.semanticRgb.warning}, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.12)`,
                    "& .MuiAlert-icon": {color: "#fff"},
                    "& .MuiAlert-action": {color: "#fff"},
                },
                filledInfo: {
                    background: `linear-gradient(135deg, rgba(${preset.semanticRgb.info}, 0.55), rgba(${preset.semanticRgb.info}, 0.35))`,
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    color: "#fff",
                    border: `1px solid rgba(${preset.semanticRgb.info}, 0.3)`,
                    borderLeft: `3px solid ${preset.semantics.info.light}`,
                    boxShadow: `0 4px 16px rgba(0, 0, 0, 0.3), 0 0 12px rgba(${preset.semanticRgb.info}, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.12)`,
                    "& .MuiAlert-icon": {color: "#fff"},
                    "& .MuiAlert-action": {color: "#fff"},
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
