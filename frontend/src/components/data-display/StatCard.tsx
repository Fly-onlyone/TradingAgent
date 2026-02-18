/**
 * Stat Card Component for displaying metrics
 */

import { Box, Card, CardContent, Typography } from "@mui/material";
import { motion } from 'framer-motion';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import type { ReactNode } from "react";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";

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
      whileHover={{
        y: -6,
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.35), 0 0 20px rgba(249, 115, 22, 0.15)",
        transition: { type: "spring", stiffness: 400, damping: 30 },
      }}
      whileTap={{ scale: 0.98 }}
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
            <Box
              sx={{
                color: "primary.contrastText",
                width: 40,
                height: 40,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: effectiveTrend === "up"
                  ? "linear-gradient(135deg, #10B981, #34D399)"
                  : effectiveTrend === "down"
                    ? "linear-gradient(135deg, #EF4444, #F87171)"
                    : "linear-gradient(135deg, #F97316, #FB923C)",
                "& svg": { fontSize: 20 },
              }}
            >
              {icon}
            </Box>
          )}
        </Box>

        {loading ? (
          <>
            <ShimmerSkeleton variant="text" width="60%" height={40} />
            <ShimmerSkeleton variant="text" width="40%" height={24} />
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
