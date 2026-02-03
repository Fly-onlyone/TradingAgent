/**
 * Trend Indicator Component
 */

import { Box, Typography } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';

interface TrendIndicatorProps {
  value: number;
  showIcon?: boolean;
  showValue?: boolean;
  size?: 'small' | 'medium' | 'large';
  format?: 'percent' | 'number' | 'currency';
  animated?: boolean;
}

export function TrendIndicator({
  value,
  showIcon = true,
  showValue = true,
  size = 'medium',
  format = 'percent',
  animated = true,
}: TrendIndicatorProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;

  const color = isPositive ? 'success.main' : isNegative ? 'error.main' : 'text.secondary';
  const bgColor = isPositive ? 'rgba(16, 185, 129, 0.1)' : isNegative ? 'rgba(239, 68, 68, 0.1)' : 'rgba(148, 163, 184, 0.1)';

  const Icon = isPositive ? TrendingUpIcon : isNegative ? TrendingDownIcon : TrendingFlatIcon;

  const sizeMap = {
    small: { fontSize: 12, iconSize: 14, py: 0.25, px: 0.75 },
    medium: { fontSize: 14, iconSize: 18, py: 0.5, px: 1 },
    large: { fontSize: 16, iconSize: 22, py: 0.75, px: 1.5 },
  };

  const { fontSize, iconSize, py, px } = sizeMap[size];

  const formatValue = (val: number): string => {
    const absVal = Math.abs(val);
    const sign = val >= 0 ? '+' : '-';

    switch (format) {
      case 'percent':
        return `${sign}${absVal.toFixed(2)}%`;
      case 'currency':
        return `${sign}$${absVal.toLocaleString()}`;
      case 'number':
      default:
        return `${sign}${absVal.toFixed(2)}`;
    }
  };

  const content = (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        py,
        px,
        borderRadius: 1,
        bgcolor: bgColor,
      }}
    >
      {showIcon && <Icon sx={{ fontSize: iconSize, color }} />}
      {showValue && (
        <Typography
          sx={{
            fontSize,
            fontWeight: 600,
            color,
            fontFamily: (theme) => theme.trading.mono,
          }}
        >
          {formatValue(value)}
        </Typography>
      )}
    </Box>
  );

  if (!animated) {
    return content;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={value}
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        transition={{ duration: 0.2 }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}

export default TrendIndicator;
