/**
 * Trade History Component
 */

import { Box, Typography } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { formatPrice, formatNumber, formatTime } from '@/utils/formatters';
import type { Trade } from '@/types';

interface TradeHistoryProps {
  trades: Trade[];
  maxRows?: number;
}

export function TradeHistory({ trades, maxRows = 20 }: TradeHistoryProps) {
  const displayedTrades = trades.slice(0, maxRows);

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Recent Trades
      </Typography>

      {/* Header */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 1,
          px: 1,
          py: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Price
        </Typography>
        <Typography variant="caption" color="text.secondary" align="right">
          Amount
        </Typography>
        <Typography variant="caption" color="text.secondary" align="right">
          Time
        </Typography>
      </Box>

      {/* Trades */}
      <Box sx={{ maxHeight: maxRows * 24, overflow: 'auto' }}>
        <AnimatePresence initial={false}>
          {displayedTrades.map((trade) => (
            <motion.div
              key={trade.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
            >
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 1,
                  px: 1,
                  py: 0.25,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: (theme) => theme.trading.mono,
                    color: trade.side === 'buy' ? 'success.main' : 'error.main',
                  }}
                >
                  {formatPrice(trade.price)}
                </Typography>
                <Typography
                  variant="caption"
                  align="right"
                  sx={{ fontFamily: (theme) => theme.trading.mono }}
                >
                  {formatNumber(trade.quantity, { maximumFractionDigits: 4 })}
                </Typography>
                <Typography
                  variant="caption"
                  align="right"
                  color="text.secondary"
                  sx={{ fontFamily: (theme) => theme.trading.mono }}
                >
                  {formatTime(new Date(trade.timestamp))}
                </Typography>
              </Box>
            </motion.div>
          ))}
        </AnimatePresence>
      </Box>
    </Box>
  );
}

export default TradeHistory;
