/**
 * Dashboard Page
 */

import { createFileRoute } from '@tanstack/react-router'
import { Box, Grid2 as Grid, Typography, Card, CardContent } from '@mui/material'
import { motion } from 'framer-motion'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'

import { PageTransition, staggerContainerVariants, staggerItemVariants } from '@/components/common/PageTransition'
import { StatCard } from '@/components/data-display/StatCard'
import { TickerCard } from '@/components/trading/TickerCard'
import { LineChart } from '@/components/charts/LineChart'
import { useMarketStore } from '@/store/marketStore'
import { useOrderStore } from '@/store/orderStore'
import { formatUSD } from '@/utils/formatters'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  const { watchlist, tickers } = useMarketStore()
  const { positions } = useOrderStore()

  // Calculate portfolio stats
  const totalBalance = 10000 // Placeholder - would come from API
  const totalPnL = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0)
  const totalPnLPercent = totalBalance > 0 ? (totalPnL / totalBalance) * 100 : 0
  const openPositions = positions.length
  const todayTrades = 5 // Placeholder

  // Mock portfolio chart data
  const portfolioData = Array.from({ length: 30 }, (_, i) => ({
    time: Date.now() - (30 - i) * 24 * 60 * 60 * 1000,
    value: 10000 + Math.random() * 2000 - 1000 + i * 50,
  }))

  return (
    <PageTransition pageKey="dashboard">
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Welcome back! Here's an overview of your trading activity.
        </Typography>

        {/* Stats Grid */}
        <motion.div
          variants={staggerContainerVariants}
          initial="hidden"
          animate="visible"
        >
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <motion.div variants={staggerItemVariants}>
                <StatCard
                  title="Total Balance"
                  value={formatUSD(totalBalance)}
                  change={2.5}
                  icon={<AccountBalanceWalletIcon />}
                />
              </motion.div>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <motion.div variants={staggerItemVariants}>
                <StatCard
                  title="Unrealized P&L"
                  value={formatUSD(totalPnL)}
                  change={totalPnLPercent}
                  icon={<TrendingUpIcon />}
                  trend={totalPnL >= 0 ? 'up' : 'down'}
                />
              </motion.div>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <motion.div variants={staggerItemVariants}>
                <StatCard
                  title="Open Positions"
                  value={openPositions}
                  icon={<ShowChartIcon />}
                />
              </motion.div>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <motion.div variants={staggerItemVariants}>
                <StatCard
                  title="Today's Trades"
                  value={todayTrades}
                  icon={<SwapHorizIcon />}
                />
              </motion.div>
            </Grid>
          </Grid>
        </motion.div>

        <Grid container spacing={3}>
          {/* Portfolio Chart */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Portfolio Performance
                </Typography>
                <LineChart
                  data={portfolioData}
                  height={300}
                  showArea
                  title="30 Day Performance"
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Watchlist */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Watchlist
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {watchlist.map((symbol) => (
                    <TickerCard
                      key={symbol}
                      ticker={tickers[symbol]}
                      compact
                      loading={!tickers[symbol]}
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Recent Activity */}
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Recent Activity
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Your recent trading activity will appear here.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </PageTransition>
  )
}
