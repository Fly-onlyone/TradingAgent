/**
 * Stat Card Component for displaying metrics
 */

import { Box, Card, CardContent, Typography, Skeleton } from '@mui/material';
import { motion } from 'framer-motion';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: ReactNode;
  loading?: boolean;
  trend?: 'up' | 'down' | 'neutral';
  prefix?: string;
  suffix?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  loading = false,
  trend,
  prefix,
  suffix,
}: StatCardProps) {
  // Determine trend from change if not provided
  const effectiveTrend = trend || (change !== undefined ? (change > 0 ? 'up' : change < 0 ? 'down' : 'neutral') : undefined);

  const trendColors = {
    up: 'success.main',
    down: 'error.main',
    neutral: 'text.secondary',
  };

  const TrendIcon = effectiveTrend === 'up' ? TrendingUpIcon : effectiveTrend === 'down' ? TrendingDownIcon : TrendingFlatIcon;

  return (
    <Card
      component={motion.div}
      whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)' }}
      transition={{ duration: 0.2 }}
      sx={{
        height: '100%',
        background: (theme) => theme.trading.glass.card.background,
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            {title}
          </Typography>
          {icon && (
            <Box sx={{ color: 'primary.main', opacity: 0.8 }}>
              {icon}
            </Box>
          )}
        </Box>

        {loading ? (
          <>
            <Skeleton variant="text" width="60%" height={40} />
            <Skeleton variant="text" width="40%" height={24} />
          </>
        ) : (
          <>
            <Typography
              variant="h4"
              fontWeight={700}
              sx={{
                fontFamily: (theme) => theme.trading.mono,
                mb: 1,
              }}
            >
              {prefix}
              {value}
              {suffix}
            </Typography>

            {(change !== undefined || changeLabel) && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {effectiveTrend && <TrendIcon sx={{ fontSize: 18, color: trendColors[effectiveTrend] }} />}
                {change !== undefined && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: trendColors[effectiveTrend || 'neutral'],
                      fontWeight: 500,
                    }}
                  >
                    {change > 0 ? '+' : ''}{change.toFixed(2)}%
                  </Typography>
                )}
                {changeLabel && (
                  <Typography variant="body2" color="text.secondary">
                    {changeLabel}
                  </Typography>
                )}
              </Box>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default StatCard;
