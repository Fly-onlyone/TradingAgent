/**
 * Order Book Component
 */

import { Box, Typography } from '@mui/material';
import { useMemo } from 'react';
import { formatPrice, formatNumber } from '@/utils/formatters';
import type { OrderBook as OrderBookType } from '@/types';

interface OrderBookProps {
  orderBook?: OrderBookType;
  maxRows?: number;
  onPriceClick?: (price: number) => void;
}

export function OrderBook({ orderBook, maxRows = 10, onPriceClick }: OrderBookProps) {
  const { asks, bids, spread, spreadPercent } = useMemo(() => {
    if (!orderBook) return { asks: [], bids: [], spread: 0, spreadPercent: 0 };

    const asks = orderBook.asks.slice(0, maxRows).reverse();
    const bids = orderBook.bids.slice(0, maxRows);

    const bestAsk = orderBook.asks[0]?.price || 0;
    const bestBid = orderBook.bids[0]?.price || 0;
    const spread = bestAsk - bestBid;
    const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;

    // Calculate cumulative totals
    let askTotal = 0;
    const asksWithTotal = asks.map((a) => {
      askTotal += a.quantity;
      return { ...a, total: askTotal };
    }).reverse();

    let bidTotal = 0;
    const bidsWithTotal = bids.map((b) => {
      bidTotal += b.quantity;
      return { ...b, total: bidTotal };
    });

    const maxTotal = Math.max(askTotal, bidTotal);

    return {
      asks: asksWithTotal.map((a) => ({ ...a, percent: (a.total / maxTotal) * 100 })),
      bids: bidsWithTotal.map((b) => ({ ...b, percent: (b.total / maxTotal) * 100 })),
      spread,
      spreadPercent,
    };
  }, [orderBook, maxRows]);

  const handlePriceClick = (price: number) => {
    onPriceClick?.(price);
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Order Book
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
          Total
        </Typography>
      </Box>

      {/* Asks (Sells) */}
      <Box sx={{ maxHeight: maxRows * 24, overflow: 'hidden' }}>
        {asks.map((ask, index) => (
          <Box
            key={`ask-${index}`}
            onClick={() => handlePriceClick(ask.price)}
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 1,
              px: 1,
              py: 0.25,
              position: 'relative',
              cursor: 'pointer',
              '&:hover': {
                bgcolor: 'rgba(239, 68, 68, 0.1)',
              },
              '&::before': {
                content: '""',
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: `${ask.percent}%`,
                bgcolor: 'rgba(239, 68, 68, 0.1)',
                zIndex: 0,
              },
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontFamily: (theme) => theme.trading.mono,
                color: 'error.main',
                zIndex: 1,
              }}
            >
              {formatPrice(ask.price)}
            </Typography>
            <Typography
              variant="caption"
              align="right"
              sx={{ fontFamily: (theme) => theme.trading.mono, zIndex: 1 }}
            >
              {formatNumber(ask.quantity, { maximumFractionDigits: 4 })}
            </Typography>
            <Typography
              variant="caption"
              align="right"
              color="text.secondary"
              sx={{ fontFamily: (theme) => theme.trading.mono, zIndex: 1 }}
            >
              {formatNumber(ask.total, { maximumFractionDigits: 4 })}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Spread */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 1,
          py: 1,
          bgcolor: 'background.default',
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Spread:
        </Typography>
        <Typography variant="caption" fontWeight={600}>
          ${formatPrice(spread)} ({spreadPercent.toFixed(2)}%)
        </Typography>
      </Box>

      {/* Bids (Buys) */}
      <Box sx={{ maxHeight: maxRows * 24, overflow: 'hidden' }}>
        {bids.map((bid, index) => (
          <Box
            key={`bid-${index}`}
            onClick={() => handlePriceClick(bid.price)}
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 1,
              px: 1,
              py: 0.25,
              position: 'relative',
              cursor: 'pointer',
              '&:hover': {
                bgcolor: 'rgba(16, 185, 129, 0.1)',
              },
              '&::before': {
                content: '""',
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: `${bid.percent}%`,
                bgcolor: 'rgba(16, 185, 129, 0.1)',
                zIndex: 0,
              },
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontFamily: (theme) => theme.trading.mono,
                color: 'success.main',
                zIndex: 1,
              }}
            >
              {formatPrice(bid.price)}
            </Typography>
            <Typography
              variant="caption"
              align="right"
              sx={{ fontFamily: (theme) => theme.trading.mono, zIndex: 1 }}
            >
              {formatNumber(bid.quantity, { maximumFractionDigits: 4 })}
            </Typography>
            <Typography
              variant="caption"
              align="right"
              color="text.secondary"
              sx={{ fontFamily: (theme) => theme.trading.mono, zIndex: 1 }}
            >
              {formatNumber(bid.total, { maximumFractionDigits: 4 })}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default OrderBook;
