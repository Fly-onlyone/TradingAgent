/**
 * Database Admin Page (Placeholder)
 * TODO: Implement in Phase 4
 */

import { createFileRoute } from '@tanstack/react-router';
import { Box, Typography, Card, CardContent, Alert } from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import { PageTransition } from '@/components/common/PageTransition';

export const Route = createFileRoute('/admin/database')({
  component: DatabasePage,
});

function DatabasePage() {
  return (
    <PageTransition pageKey="database">
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Database Admin
        </Typography>

        <Alert severity="info" sx={{ mb: 3 }}>
          This page is under construction. Database viewer will be available in Phase 4.
        </Alert>

        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <StorageIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Coming Soon
            </Typography>
            <Typography variant="body2" color="text.secondary">
              View and search all database collections for debugging.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </PageTransition>
  );
}
