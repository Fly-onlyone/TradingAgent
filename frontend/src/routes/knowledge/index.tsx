/**
 * Knowledge Base Page
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Grid2 as Grid,
  Chip,
  Skeleton,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import SearchIcon from '@mui/icons-material/Search'
import SchoolIcon from '@mui/icons-material/School'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import PatternIcon from '@mui/icons-material/AutoGraph'

import { PageTransition, staggerContainerVariants, staggerItemVariants } from '@/components/common/PageTransition'
import { EmptyState } from '@/components/common/EmptyState'
import { knowledgeApi } from '@/api/endpoints/knowledge'
import { useDebounce } from '@/hooks/useDebounce'
import { formatRelativeTime, formatPercent } from '@/utils/formatters'
import type { StrategyKnowledge, TradeLesson, TradingPattern } from '@/types'
import { motion } from 'framer-motion'

export const Route = createFileRoute('/knowledge/')({
  component: KnowledgePage,
})

function KnowledgePage() {
  const [tabValue, setTabValue] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedQuery = useDebounce(searchQuery, 300)

  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['knowledge-search', debouncedQuery],
    queryFn: () => knowledgeApi.search({ query: debouncedQuery, limitPerType: 10 }),
    enabled: debouncedQuery.length > 0,
  })

  const { data: strategies, isLoading: loadingStrategies } = useQuery({
    queryKey: ['knowledge-strategies'],
    queryFn: () => knowledgeApi.getStrategies(20),
    enabled: tabValue === 0 && !debouncedQuery,
  })

  const { data: lessons, isLoading: loadingLessons } = useQuery({
    queryKey: ['knowledge-lessons'],
    queryFn: () => knowledgeApi.getLessons({ limit: 20 }),
    enabled: tabValue === 1 && !debouncedQuery,
  })

  const { data: patterns, isLoading: loadingPatterns } = useQuery({
    queryKey: ['knowledge-patterns'],
    queryFn: () => knowledgeApi.getPatterns({ limit: 20 }),
    enabled: tabValue === 2 && !debouncedQuery,
  })

  const isLoading = searching || loadingStrategies || loadingLessons || loadingPatterns

  // Determine what to display
  const displayStrategies = debouncedQuery ? searchResults?.strategies : strategies
  const displayLessons = debouncedQuery ? searchResults?.lessons : lessons
  const displayPatterns = debouncedQuery ? searchResults?.patterns : patterns

  return (
    <PageTransition pageKey="knowledge">
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Knowledge Base
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Trading strategies, lessons learned, and discovered patterns
        </Typography>

        {/* Search */}
        <TextField
          fullWidth
          placeholder="Search knowledge base..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 3 }}
        />

        {/* Tabs */}
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 3 }}>
          <Tab
            icon={<SchoolIcon />}
            iconPosition="start"
            label={`Strategies (${displayStrategies?.length || 0})`}
          />
          <Tab
            icon={<TrendingUpIcon />}
            iconPosition="start"
            label={`Lessons (${displayLessons?.length || 0})`}
          />
          <Tab
            icon={<PatternIcon />}
            iconPosition="start"
            label={`Patterns (${displayPatterns?.length || 0})`}
          />
        </Tabs>

        {/* Content */}
        {isLoading ? (
          <Grid container spacing={2}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, md: 6, lg: 4 }}>
                <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2 }} />
              </Grid>
            ))}
          </Grid>
        ) : (
          <motion.div variants={staggerContainerVariants} initial="hidden" animate="visible">
            <Grid container spacing={2}>
              {/* Strategies Tab */}
              {tabValue === 0 && (
                displayStrategies && displayStrategies.length > 0 ? (
                  displayStrategies.map((strategy) => (
                    <Grid key={strategy.id} size={{ xs: 12, md: 6, lg: 4 }}>
                      <motion.div variants={staggerItemVariants}>
                        <StrategyCard strategy={strategy} />
                      </motion.div>
                    </Grid>
                  ))
                ) : (
                  <Grid size={{ xs: 12 }}>
                    <EmptyState
                      icon={<SchoolIcon />}
                      title="No strategies found"
                      description={debouncedQuery ? 'Try a different search term' : 'Add strategies to your knowledge base'}
                    />
                  </Grid>
                )
              )}

              {/* Lessons Tab */}
              {tabValue === 1 && (
                displayLessons && displayLessons.length > 0 ? (
                  displayLessons.map((lesson) => (
                    <Grid key={lesson.id} size={{ xs: 12, md: 6 }}>
                      <motion.div variants={staggerItemVariants}>
                        <LessonCard lesson={lesson} />
                      </motion.div>
                    </Grid>
                  ))
                ) : (
                  <Grid size={{ xs: 12 }}>
                    <EmptyState
                      icon={<TrendingUpIcon />}
                      title="No lessons found"
                      description="Trade lessons will appear here after completing trades"
                    />
                  </Grid>
                )
              )}

              {/* Patterns Tab */}
              {tabValue === 2 && (
                displayPatterns && displayPatterns.length > 0 ? (
                  displayPatterns.map((pattern) => (
                    <Grid key={pattern.id} size={{ xs: 12, md: 6, lg: 4 }}>
                      <motion.div variants={staggerItemVariants}>
                        <PatternCard pattern={pattern} />
                      </motion.div>
                    </Grid>
                  ))
                ) : (
                  <Grid size={{ xs: 12 }}>
                    <EmptyState
                      icon={<PatternIcon />}
                      title="No patterns found"
                      description="Trading patterns will be discovered as you trade"
                    />
                  </Grid>
                )
              )}
            </Grid>
          </motion.div>
        )}
      </Box>
    </PageTransition>
  )
}

function StrategyCard({ strategy }: { strategy: StrategyKnowledge }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          {strategy.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 48 }}>
          {strategy.description?.slice(0, 100) || 'No description'}...
        </Typography>
        {strategy.winRate && (
          <Chip
            label={`Win Rate: ${strategy.winRate.toFixed(1)}%`}
            size="small"
            color={strategy.winRate >= 50 ? 'success' : 'error'}
          />
        )}
      </CardContent>
    </Card>
  )
}

function LessonCard({ lesson }: { lesson: TradeLesson }) {
  const outcomeColor =
    lesson.outcome === 'profit' ? 'success' : lesson.outcome === 'loss' ? 'error' : 'default'

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip label={lesson.symbol} size="small" />
            <Chip
              label={lesson.side.toUpperCase()}
              size="small"
              color={lesson.side === 'buy' ? 'success' : 'error'}
            />
          </Box>
          <Chip
            label={`${lesson.outcome} ${formatPercent(lesson.profitPercent)}`}
            size="small"
            color={outcomeColor}
          />
        </Box>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {lesson.lessonSummary}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatRelativeTime(lesson.createdAt)}
        </Typography>
      </CardContent>
    </Card>
  )
}

function PatternCard({ pattern }: { pattern: TradingPattern }) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            {pattern.patternName}
          </Typography>
          <Chip label={pattern.patternType} size="small" variant="outlined" />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 48 }}>
          {pattern.description?.slice(0, 100) || 'No description'}...
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip
            label={`Success: ${pattern.successRate.toFixed(1)}%`}
            size="small"
            color={pattern.successRate >= 60 ? 'success' : pattern.successRate >= 40 ? 'warning' : 'error'}
          />
          <Chip
            label={`Avg Return: ${formatPercent(pattern.avgReturn)}`}
            size="small"
            variant="outlined"
          />
        </Box>
      </CardContent>
    </Card>
  )
}
