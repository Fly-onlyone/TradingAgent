/**
 * Empty State Component
 */

import { Box, Typography, Button, type SxProps, type Theme } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  sx?: SxProps<Theme>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  sx,
}: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        px: 3,
        textAlign: 'center',
        ...sx,
      }}
    >
      <Box
        sx={{
          mb: 2,
          color: 'text.disabled',
          '& > svg': {
            fontSize: 64,
          },
        }}
      >
        {icon || <InboxIcon />}
      </Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {description && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 3, maxWidth: 300 }}
        >
          {description}
        </Typography>
      )}
      {action && (
        <Button variant="contained" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </Box>
  );
}

export default EmptyState;
