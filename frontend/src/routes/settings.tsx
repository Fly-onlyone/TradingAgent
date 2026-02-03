/**
 * Settings Page
 */

import { createFileRoute } from '@tanstack/react-router'
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Divider,
  Grid2 as Grid,
  Alert,
} from '@mui/material'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { PageTransition } from '@/components/common/PageTransition'
import { settingsSchema, type SettingsInput } from '@/utils/validators'
import { useAuth } from '@/hooks/useAuth'
import { notify } from '@/store/uiStore'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { user } = useAuth()

  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      email: user?.email || '',
      username: user?.username || '',
      defaultSymbol: 'BTC-USDT',
      defaultTimeframe: '1h',
      notifications: {
        email: true,
        push: false,
        orderFilled: true,
        priceAlerts: true,
        newsAlerts: false,
      },
    },
  })

  const onSubmit = async (data: SettingsInput) => {
    try {
      // Would call API here
      console.log('Saving settings:', data)
      notify.success('Settings saved')
    } catch (error) {
      notify.error('Failed to save settings')
    }
  }

  return (
    <PageTransition pageKey="settings">
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Settings
        </Typography>

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Profile Settings */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Profile
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Controller
                    name="email"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Email"
                        fullWidth
                        error={!!errors.email}
                        helperText={errors.email?.message}
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Controller
                    name="username"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Username"
                        fullWidth
                        error={!!errors.username}
                        helperText={errors.username?.message}
                      />
                    )}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Trading Preferences */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Trading Preferences
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Controller
                    name="defaultSymbol"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Default Symbol"
                        fullWidth
                        helperText="Default trading pair to load"
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Controller
                    name="defaultTimeframe"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Default Timeframe"
                        fullWidth
                        helperText="Default chart timeframe"
                      />
                    )}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Notifications
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Controller
                  name="notifications.email"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch {...field} checked={field.value} />}
                      label="Email notifications"
                    />
                  )}
                />
                <Controller
                  name="notifications.push"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch {...field} checked={field.value} />}
                      label="Push notifications"
                    />
                  )}
                />
                <Divider sx={{ my: 1 }} />
                <Controller
                  name="notifications.orderFilled"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch {...field} checked={field.value} />}
                      label="Order filled alerts"
                    />
                  )}
                />
                <Controller
                  name="notifications.priceAlerts"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch {...field} checked={field.value} />}
                      label="Price alerts"
                    />
                  )}
                />
                <Controller
                  name="notifications.newsAlerts"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch {...field} checked={field.value} />}
                      label="News alerts"
                    />
                  )}
                />
              </Box>
            </CardContent>
          </Card>

          {/* API Keys */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                API Keys
              </Typography>
              <Alert severity="info" sx={{ mb: 2 }}>
                API keys are managed server-side for security. Contact support to update your exchange credentials.
              </Alert>
              <Typography variant="body2" color="text.secondary">
                Exchange: OKX (Configured)
              </Typography>
            </CardContent>
          </Card>

          {/* Save Button */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={!isDirty}
            >
              Save Changes
            </Button>
          </Box>
        </form>
      </Box>
    </PageTransition>
  )
}
