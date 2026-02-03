/**
 * Strategies List Page
 */

import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid2 as Grid,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  Skeleton,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import AddIcon from '@mui/icons-material/Add'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'

import { PageTransition, staggerContainerVariants, staggerItemVariants } from '@/components/common/PageTransition'
import { EmptyState } from '@/components/common/EmptyState'
import { PerformanceGauge } from '@/components/charts/PerformanceGauge'
import { strategiesApi } from '@/api/endpoints/strategies'
import { formatPercent } from '@/utils/formatters'
import { notify } from '@/store/uiStore'
import type { Strategy } from '@/types'
import { motion } from 'framer-motion'

export const Route = createFileRoute('/strategies/')({
  component: StrategiesPage,
})

function StrategiesPage() {
  const { data: strategies, isLoading, refetch } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => strategiesApi.getStrategies(),
  })

  const handleToggleActive = async (strategy: Strategy) => {
    try {
      await strategiesApi.toggleStrategy(strategy.id, !strategy.isActive)
      refetch()
      notify.success(
        strategy.isActive ? 'Strategy deactivated' : 'Strategy activated',
        strategy.name
      )
    } catch (error) {
      notify.error('Failed to update strategy')
    }
  }

  return (
    <PageTransition pageKey="strategies">
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Box>
            <Typography variant="h4" fontWeight={700} gutterBottom>
              Strategies
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage your automated trading strategies
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />}>
            Create Strategy
          </Button>
        </Box>

        {isLoading ? (
          <Grid container spacing={3}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, md: 6, lg: 4 }}>
                <Skeleton variant="rectangular" height={250} sx={{ borderRadius: 2 }} />
              </Grid>
            ))}
          </Grid>
        ) : strategies && strategies.length > 0 ? (
          <motion.div variants={staggerContainerVariants} initial="hidden" animate="visible">
            <Grid container spacing={3}>
              {strategies.map((strategy) => (
                <Grid key={strategy.id} size={{ xs: 12, md: 6, lg: 4 }}>
                  <motion.div variants={staggerItemVariants}>
                    <StrategyCard
                      strategy={strategy}
                      onToggle={() => handleToggleActive(strategy)}
                    />
                  </motion.div>
                </Grid>
              ))}
            </Grid>
          </motion.div>
        ) : (
          <EmptyState
            title="No strategies yet"
            description="Create your first automated trading strategy to get started"
            action={{
              label: 'Create Strategy',
              onClick: () => {},
            }}
          />
        )}
      </Box>
    </PageTransition>
  )
}

function StrategyCard({
  strategy,
  onToggle,
}: {
  strategy: Strategy
  onToggle: () => void
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  const winRate = strategy.backtestResults?.winRate || 0

  return (
    <Card
      component={motion.div}
      whileHover={{ y: -4 }}
      sx={{
        height: '100%',
        border: strategy.isActive ? '1px solid' : 'none',
        borderColor: 'success.main',
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography variant="h6" fontWeight={600}>
                {strategy.name}
              </Typography>
              <Chip
                label={strategy.isActive ? 'Active' : 'Inactive'}
                size="small"
                color={strategy.isActive ? 'success' : 'default'}
              />
            </Box>
            {strategy.symbol && (
              <Typography variant="body2" color="text.secondary">
                {strategy.symbol} | {strategy.timeframe}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)}>
            <MoreVertIcon />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            <MenuItem component={Link} to={`/strategies/${strategy.id}`}>
              <EditIcon sx={{ mr: 1, fontSize: 18 }} /> Edit
            </MenuItem>
            <MenuItem onClick={onToggle}>
              {strategy.isActive ? (
                <>
                  <StopIcon sx={{ mr: 1, fontSize: 18 }} /> Deactivate
                </>
              ) : (
                <>
                  <PlayArrowIcon sx={{ mr: 1, fontSize: 18 }} /> Activate
                </>
              )}
            </MenuItem>
            <MenuItem sx={{ color: 'error.main' }}>
              <DeleteIcon sx={{ mr: 1, fontSize: 18 }} /> Delete
            </MenuItem>
          </Menu>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
          {strategy.description || 'No description'}
        </Typography>

        {/* Performance */}
        <Box sx={{ display: 'flex', justifyContent: 'space-around', mb: 2 }}>
          <PerformanceGauge value={winRate} label="Win Rate" size={80} thickness={6} />
        </Box>

        {/* Stats */}
        {strategy.backtestResults && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 1,
              p: 1.5,
              bgcolor: 'background.default',
              borderRadius: 1,
            }}
          >
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Trades
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {strategy.backtestResults.totalTrades}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                P&L
              </Typography>
              <Typography
                variant="body2"
                fontWeight={600}
                color={strategy.backtestResults.totalPnlPercent >= 0 ? 'success.main' : 'error.main'}
              >
                {formatPercent(strategy.backtestResults.totalPnlPercent)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Max DD
              </Typography>
              <Typography variant="body2" fontWeight={600} color="error.main">
                {formatPercent(-strategy.backtestResults.maxDrawdown)}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Toggle */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Switch
            checked={strategy.isActive}
            onChange={onToggle}
            color="success"
          />
        </Box>
      </CardContent>
    </Card>
  )
}
