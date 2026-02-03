/**
 * Trades Page - P&L Tracking (Placeholder)
 * TODO: Implement in Phase 3
 */

import { createFileRoute } from '@tanstack/react-router';
import { Box, Typography, Card, CardContent, Alert } from '@mui/material';
import TimelineIcon from '@mui/icons-material/Timeline';
import { PageTransition } from '@/components/common/PageTransition';

export const Route = createFileRoute('/trades/')({
  component: TradesPage,
});

function TradesPage() {
  return (
    <PageTransition pageKey="trades">
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Trade History
        </Typography>

        <Alert severity="info" sx={{ mb: 3 }}>
          This page is under construction. P&L tracking will be available in Phase 3.
        </Alert>

        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <TimelineIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Coming Soon
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Track your trade history with profit/loss analysis, grouped by coin.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </PageTransition>
  );
}
