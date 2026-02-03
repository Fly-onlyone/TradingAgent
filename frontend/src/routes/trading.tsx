/**
 * Trading Page
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Box,
  Grid2 as Grid,
  Card,
  CardContent,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Tabs,
  Tab,
} from '@mui/material'

import { PageTransition } from '@/components/common/PageTransition'
import { CandlestickChart } from '@/components/charts/CandlestickChart'
import { OrderForm } from '@/components/trading/OrderForm'
import { OrderBook } from '@/components/trading/OrderBook'
import { TradeHistory } from '@/components/trading/TradeHistory'
import { PositionCard } from '@/components/trading/PositionCard'
import { useMarketStore } from '@/store/marketStore'
import { useOrderStore } from '@/store/orderStore'
import { TIMEFRAMES } from '@/utils/constants'
import type { Candle } from '@/types'

export const Route = createFileRoute('/trading')({
  component: TradingPage,
})

function TradingPage() {
  const {
    selectedSymbol,
    selectedTimeframe,
    setSelectedTimeframe,
    tickers,
    orderBooks,
    recentTrades,
    candles,
  } = useMarketStore()

  const { positions } = useOrderStore()
  const [rightPanelTab, setRightPanelTab] = useState(0)

  const currentTicker = tickers[selectedSymbol]
  const currentOrderBook = orderBooks[selectedSymbol]
  const currentTrades = recentTrades[selectedSymbol] || []
  const currentCandles = candles[`${selectedSymbol}-${selectedTimeframe}`] || []
  const currentPosition = positions.find((p) => p.symbol === selectedSymbol)

  // Mock candles if none available
  const displayCandles: Candle[] = currentCandles.length > 0
    ? currentCandles
    : Array.from({ length: 100 }, (_, i) => ({
        symbol: selectedSymbol,
        timeframe: selectedTimeframe,
        timestamp: Date.now() - (100 - i) * 60 * 60 * 1000,
        open: 40000 + Math.random() * 5000,
        high: 40000 + Math.random() * 6000,
        low: 39000 + Math.random() * 4000,
        close: 40000 + Math.random() * 5000,
        volume: Math.random() * 1000,
      }))

  return (
    <PageTransition pageKey="trading">
      <Box sx={{ height: 'calc(100vh - 100px)' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h5" fontWeight={700}>
              {selectedSymbol.replace('-', '/')}
            </Typography>
            {currentTicker && (
              <Typography
                variant="h5"
                sx={{
                  color: currentTicker.priceChangePercent >= 0 ? 'success.main' : 'error.main',
                  fontFamily: (theme) => theme.trading.mono,
                }}
              >
                ${currentTicker.lastPrice.toLocaleString()}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <ToggleButtonGroup
              value={selectedTimeframe}
              exclusive
              onChange={(_, value) => value && setSelectedTimeframe(value)}
              size="small"
            >
              {TIMEFRAMES.slice(0, 6).map((tf) => (
                <ToggleButton key={tf.value} value={tf.value}>
                  {tf.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </Box>

        <Grid container spacing={2} sx={{ height: 'calc(100% - 60px)' }}>
          {/* Main Chart Area */}
          <Grid size={{ xs: 12, lg: 8 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ height: '100%', p: 1 }}>
                <CandlestickChart data={displayCandles} height={500} showVolume />
              </CardContent>
            </Card>
          </Grid>

          {/* Right Panel */}
          <Grid size={{ xs: 12, lg: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
              {/* Order Form */}
              <OrderForm
                symbol={selectedSymbol}
                currentPrice={currentTicker?.lastPrice || 40000}
                balance={10000}
              />

              {/* Order Book / Trade History Tabs */}
              <Card sx={{ flex: 1, overflow: 'hidden' }}>
                <Tabs
                  value={rightPanelTab}
                  onChange={(_, v) => setRightPanelTab(v)}
                  sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                  <Tab label="Order Book" />
                  <Tab label="Trades" />
                </Tabs>
                <CardContent sx={{ overflow: 'auto', maxHeight: 300 }}>
                  {rightPanelTab === 0 && (
                    <OrderBook orderBook={currentOrderBook} maxRows={8} />
                  )}
                  {rightPanelTab === 1 && (
                    <TradeHistory trades={currentTrades} maxRows={15} />
                  )}
                </CardContent>
              </Card>

              {/* Current Position */}
              {currentPosition && (
                <PositionCard position={currentPosition} />
              )}
            </Box>
          </Grid>
        </Grid>
      </Box>
    </PageTransition>
  )
}
