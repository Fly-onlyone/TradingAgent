/**
 * MUI Component overrides for Trading App
 * Customizes default component styles for dark theme
 */

import type {Components, Theme} from '@mui/material/styles';
import {glassStyles} from './palette';

export const components: Components<Theme> = {
    MuiCssBaseline: {
        styleOverrides: {
            body: {
                scrollbarColor: "#334155 #0F172A",
                scrollBehavior: "smooth",
                background: "#0F172A",
                backgroundImage:
                    "radial-gradient(at 20% 80%, rgba(249,115,22,0.08) 0%, transparent 50%), radial-gradient(at 80% 20%, rgba(139,92,246,0.06) 0%, transparent 50%)",
                backgroundAttachment: "fixed",
                "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
                    width: 8,
                    height: 8,
                },
                "&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track": {
                    background: "#0F172A",
                },
                "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
                    background: "#334155",
                    borderRadius: 4,
                },
                "&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover": {
                    background: "#475569",
                },
            },
            "@keyframes shimmer": {
                "0%": {backgroundPosition: "-200% 0"},
                "100%": {backgroundPosition: "200% 0"},
            },
        },
    },
    MuiButton: {
        styleOverrides: {
            root: {
                borderRadius: 8,
                padding: '8px 16px',
                fontWeight: 600,
            },
            contained: {
                boxShadow: "none",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
                "&:hover": {
                    boxShadow: "0 4px 12px rgba(249, 115, 22, 0.3)",
                    transform: "translateY(-2px)",
                },
                "&:active": {
                    transform: "translateY(0)",
                },
            },
            outlined: {
                borderWidth: 2,
                '&:hover': {
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
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
                position: "relative" as const,
                overflow: "hidden",
                "&::before": {
                    content: '""',
                    position: "absolute",
                    inset: 0,
                    background:
                        "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 50%)",
                    opacity: 0,
                    transition: "opacity 0.25s ease",
                    pointerEvents: "none",
                    zIndex: 0,
                },
                "&:hover::before": {
                    opacity: 0.5,
                },
            },
        },
    },
    MuiPaper: {
        styleOverrides: {
            root: {
                backgroundImage: 'none',
            },
            elevation1: {
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
            },
        },
    },
    MuiTextField: {
        styleOverrides: {
            root: {
                '& .MuiOutlinedInput-root': {
                    borderRadius: 8,
                    '& fieldset': {
                        borderColor: 'rgba(51, 65, 85, 0.5)',
                    },
                    '&:hover fieldset': {
                        borderColor: 'rgba(249, 115, 22, 0.5)',
                    },
                    '&.Mui-focused fieldset': {
                        borderColor: '#F97316',
                    },
                },
            },
        },
    },
    MuiInputBase: {
        styleOverrides: {
            root: {
                '&.Mui-disabled': {
                    backgroundColor: 'rgba(15, 23, 42, 0.5)',
                },
            },
        },
    },
    MuiChip: {
        styleOverrides: {
            root: {
                borderRadius: 6,
                fontWeight: 500,
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
            },
            filled: {
                backgroundColor: 'rgba(249, 115, 22, 0.15)',
                color: '#FB923C',
                '&:hover': {
                    backgroundColor: 'rgba(249, 115, 22, 0.25)',
                },
            },
        },
    },
    MuiTooltip: {
        styleOverrides: {
            tooltip: {
                backgroundColor: '#334155',
                fontSize: '0.75rem',
                borderRadius: 6,
                padding: '6px 12px',
            },
            arrow: {
                color: '#334155',
            },
        },
    },
    MuiDialog: {
        styleOverrides: {
            paper: {
                ...glassStyles.card,
                boxShadow: "0 25px 50px rgba(0, 0, 0, 0.5)",
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
                backgroundColor: '#1E293B',
                borderRight: '1px solid rgba(51, 65, 85, 0.5)',
            },
        },
    },
    MuiAppBar: {
        styleOverrides: {
            root: {
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
                boxShadow: 'none',
            },
        },
    },
    MuiTabs: {
        styleOverrides: {
            indicator: {
                height: 3,
                borderRadius: '3px 3px 0 0',
            },
        },
    },
    MuiTab: {
        styleOverrides: {
            root: {
                textTransform: 'none',
                fontWeight: 500,
                minHeight: 48,
            },
        },
    },
    MuiTableCell: {
        styleOverrides: {
            root: {
                borderBottom: '1px solid rgba(51, 65, 85, 0.3)',
            },
            head: {
                fontWeight: 600,
                backgroundColor: 'rgba(15, 23, 42, 0.5)',
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
                    background: "#F97316",
                    borderRadius: "0 2px 2px 0",
                    transform: "scaleY(0)",
                    transition: "transform 0.2s ease",
                },
                "&:hover": {
                    backgroundColor: "rgba(249, 115, 22, 0.05)",
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
                borderColor: 'rgba(51, 65, 85, 0.5)',
            },
        },
    },
    MuiLinearProgress: {
        styleOverrides: {
            root: {
                borderRadius: 4,
                backgroundColor: 'rgba(51, 65, 85, 0.3)',
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
                borderRadius: 8,
            },
            standardSuccess: {
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34D399',
            },
            standardError: {
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#F87171',
            },
            standardWarning: {
                backgroundColor: 'rgba(251, 191, 36, 0.15)',
                color: '#FCD34D',
            },
            standardInfo: {
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: '#60A5FA',
            },
        },
    },
    MuiSkeleton: {
        styleOverrides: {
            root: {
                background:
                    "linear-gradient(90deg, rgba(51,65,85,0.2) 25%, rgba(51,65,85,0.5) 50%, rgba(51,65,85,0.2) 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite ease-in-out",
            },
        },
    },
    MuiBackdrop: {
        styleOverrides: {
            root: {
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(4px)',
            },
        },
    },
};
