/**
 * Position Card Component
 */

import {
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  Chip,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import { motion } from 'framer-motion';
import { formatPrice, formatPercent, formatUSD } from '@/utils/formatters';
import type { Position } from '@/types';

interface PositionCardProps {
  position: Position;
  onClose?: () => void;
  isClosing?: boolean;
}

export function PositionCard({ position, onClose, isClosing = false }: PositionCardProps) {
  const isLong = position.side === 'long';
  const isProfitable = position.unrealizedPnl >= 0;

  // Calculate percentage to liquidation
  const liquidationDistance = position.liquidationPrice
    ? Math.abs((position.currentPrice - position.liquidationPrice) / position.currentPrice) * 100
    : 100;

  return (
    <Card
      component={motion.div}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      sx={{
        background: (theme) => theme.trading.glass.card.background,
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <CardContent>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" fontWeight={600}>
              {position.symbol.replace('-', '/')}
            </Typography>
            <Chip
              label={`${isLong ? 'Long' : 'Short'} ${position.leverage}x`}
              size="small"
              color={isLong ? 'success' : 'error'}
              variant="outlined"
            />
          </Box>
          <Box
            sx={{
              textAlign: 'right',
              p: 1,
              borderRadius: 1,
              bgcolor: isProfitable ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            }}
          >
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{
                fontFamily: (theme) => theme.trading.mono,
                color: isProfitable ? 'success.main' : 'error.main',
              }}
            >
              {formatUSD(position.unrealizedPnl)}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: isProfitable ? 'success.main' : 'error.main' }}
            >
              {formatPercent(position.unrealizedPnlPercent)}
            </Typography>
          </Box>
        </Box>

        {/* Position Details */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Entry Price
            </Typography>
            <Typography variant="body2" fontWeight={500} sx={{ fontFamily: (theme) => theme.trading.mono }}>
              ${formatPrice(position.entryPrice)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Current Price
            </Typography>
            <Typography variant="body2" fontWeight={500} sx={{ fontFamily: (theme) => theme.trading.mono }}>
              ${formatPrice(position.currentPrice)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Quantity
            </Typography>
            <Typography variant="body2" fontWeight={500}>
              {position.quantity}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Margin
            </Typography>
            <Typography variant="body2" fontWeight={500}>
              {formatUSD(position.margin)}
            </Typography>
          </Box>
        </Box>

        {/* Liquidation Warning */}
        {position.liquidationPrice && liquidationDistance < 50 && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Distance to Liquidation
              </Typography>
              <Typography
                variant="caption"
                color={liquidationDistance < 20 ? 'error.main' : 'warning.main'}
              >
                {liquidationDistance.toFixed(1)}%
              </Typography>
            </Box>
            <Tooltip title={`Liquidation at $${formatPrice(position.liquidationPrice)}`}>
              <LinearProgress
                variant="determinate"
                value={100 - liquidationDistance}
                color={liquidationDistance < 20 ? 'error' : 'warning'}
                sx={{ height: 6, borderRadius: 1 }}
              />
            </Tooltip>
          </Box>
        )}

        {/* Close Button */}
        {onClose && (
          <Button
            variant="outlined"
            color="error"
            fullWidth
            onClick={onClose}
            disabled={isClosing}
          >
            {isClosing ? 'Closing...' : 'Close Position'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default PositionCard;
