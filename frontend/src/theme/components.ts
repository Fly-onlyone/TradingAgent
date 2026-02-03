/**
 * MUI Component overrides for Trading App
 * Customizes default component styles for dark theme
 */

import type { Components, Theme } from '@mui/material/styles';
import { glassStyles } from './palette';

export const components: Components<Theme> = {
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        scrollbarColor: '#334155 #0F172A',
        '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
          width: 8,
          height: 8,
        },
        '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
          background: '#0F172A',
        },
        '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
          background: '#334155',
          borderRadius: 4,
        },
        '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover': {
          background: '#475569',
        },
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
        boxShadow: 'none',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)',
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
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
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
        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
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
        '&:hover': {
          backgroundColor: 'rgba(249, 115, 22, 0.05)',
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
        backgroundColor: 'rgba(51, 65, 85, 0.3)',
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
