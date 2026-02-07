/**
 * Settings Page
 */

import {useState, useEffect} from 'react'
import {createFileRoute} from '@tanstack/react-router'
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
    ToggleButtonGroup,
    ToggleButton,
    MenuItem,
    CircularProgress,
    Chip,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import LoginIcon from '@mui/icons-material/Login'
import LogoutIcon from '@mui/icons-material/Logout'
import {useForm, Controller} from 'react-hook-form'
import {zodResolver} from '@hookform/resolvers/zod'
import {useQuery, useMutation, useQueryClient} from '@tanstack/react-query'

import {PageTransition} from '@/components/common/PageTransition'
import {settingsSchema, type SettingsInput} from '@/utils/validators'
import {useAuth} from '@/hooks/useAuth'
import {useAuthStore} from '@/store/authStore'
import {notify} from '@/store/uiStore'
import {settingsApi} from '@/api/endpoints/settings'
import type {AgentConfig, AgentConfigUpdate} from '@/api/endpoints/settings'

export const Route = createFileRoute('/settings')({
    component: SettingsPage,
})

const MODEL_OPTIONS = [
    {value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4'},
    {value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5'},
    {value: 'claude-opus-4-6', label: 'Claude Opus 4.6'},
]

function AgentConfigCard() {
    const {user} = useAuthStore()
    const isSuperuser = user?.isSuperuser ?? false
    const queryClient = useQueryClient()
    const [apiKeyInput, setApiKeyInput] = useState('')
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
    const [loginResult, setLoginResult] = useState<{ success: boolean; message: string } | null>(null)

    const configQuery = useQuery({
        queryKey: ['agent-config'],
        queryFn: () => settingsApi.getAgentConfig(),
        enabled: isSuperuser || import.meta.env.DEV,
        staleTime: 60_000,
    })

    const updateMutation = useMutation({
        mutationFn: (update: AgentConfigUpdate) => settingsApi.updateAgentConfig(update),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ['agent-config']})
            notify.success('Agent configuration updated')
            setTestResult(null)
        },
        onError: () => {
            notify.error('Failed to update agent configuration')
        },
    })

    const testMutation = useMutation({
        mutationFn: () => settingsApi.testConnection(),
        onSuccess: (result) => {
            setTestResult(result)
            if (result.success) {
                notify.success(result.message)
            } else {
                notify.error(result.message)
            }
        },
        onError: () => {
            setTestResult({success: false, message: 'Test request failed'})
        },
    })

    const [isPollingLogin, setIsPollingLogin] = useState(false)

    const loginMutation = useMutation({
        mutationFn: () => settingsApi.startCLILogin(),
        onSuccess: (result) => {
            setLoginResult(result)
            if (result.success) {
                setIsPollingLogin(true)
            } else {
                notify.error(result.message)
            }
        },
        onError: () => {
            setLoginResult({success: false, message: 'Login request failed'})
        },
    })

    // Poll for CLI login status after browser opens
    useEffect(() => {
        if (!isPollingLogin) return
        const interval = setInterval(async () => {
            try {
                const fresh = await settingsApi.getAgentConfig()
                if (fresh.cliLoggedIn) {
                    setIsPollingLogin(false)
                    setLoginResult({success: true, message: 'Successfully logged in to Claude'})
                    notify.success('Successfully logged in to Claude')
                    queryClient.invalidateQueries({queryKey: ['agent-config']})
                }
            } catch { /* ignore poll errors */
            }
        }, 4000)
        const timeout = setTimeout(() => {
            setIsPollingLogin(false)
            setLoginResult({success: false, message: 'Login timed out. Please try again.'})
        }, 120_000)
        return () => {
            clearInterval(interval);
            clearTimeout(timeout)
        }
    }, [isPollingLogin, queryClient])

    const logoutMutation = useMutation({
        mutationFn: () => settingsApi.cliLogout(),
        onSuccess: (result) => {
            queryClient.invalidateQueries({queryKey: ['agent-config']})
            if (result.success) notify.success(result.message)
            else notify.error(result.message)
            setLoginResult(null)
        },
    })

    if (!isSuperuser && !import.meta.env.DEV) return null

    const config = configQuery.data

    const handleAuthModeChange = (_: React.MouseEvent<HTMLElement>, newMode: string | null) => {
        if (newMode) {
            updateMutation.mutate({authMode: newMode})
        }
    }

    const handleModelChange = (model: string) => {
        updateMutation.mutate({model})
    }

    const handleSaveApiKey = () => {
        if (apiKeyInput.trim()) {
            updateMutation.mutate({apiKey: apiKeyInput.trim()})
            setApiKeyInput('')
        }
    }

    const handleClearApiKey = () => {
        updateMutation.mutate({apiKey: ''})
    }

    return (
        <Card sx={{mb: 3}}>
            <CardContent>
                <Typography variant="h6" gutterBottom>
                    AI Agent Configuration
                </Typography>

                {configQuery.isLoading ? (
                    <Box sx={{display: 'flex', justifyContent: 'center', py: 3}}>
                        <CircularProgress size={24}/>
                    </Box>
                ) : configQuery.error ? (
                    <Alert severity="error">Failed to load agent configuration</Alert>
                ) : config ? (
                    <Box sx={{display: 'flex', flexDirection: 'column', gap: 3}}>
                        {/* Auth Mode Toggle */}
                        <Box>
                            <Typography variant="subtitle2" gutterBottom>
                                Authentication Mode
                            </Typography>
                            <ToggleButtonGroup
                                value={config.authMode}
                                exclusive
                                onChange={handleAuthModeChange}
                                size="small"
                                disabled={updateMutation.isPending}
                            >
                                <ToggleButton value="subscription">Claude Subscription</ToggleButton>
                                <ToggleButton value="api_key">API Key</ToggleButton>
                            </ToggleButtonGroup>
                            <Typography variant="body2" color="text.secondary" sx={{mt: 0.5}}>
                                {config.authMode === 'subscription'
                                    ? 'Uses Claude Pro/Max subscription via CLI login (free with plan)'
                                    : 'Uses a direct Anthropic API key (pay-per-use billing)'}
                            </Typography>
                        </Box>

                        {/* Subscription mode: CLI login */}
                        {config.authMode === 'subscription' && (
                            <Box>
                                <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5}}>
                                    <Typography variant="subtitle2">CLI Login Status</Typography>
                                    <Chip
                                        icon={config.cliLoggedIn ? <CheckCircleIcon/> : <ErrorIcon/>}
                                        label={config.cliLoggedIn ? 'Logged In' : 'Not Logged In'}
                                        color={config.cliLoggedIn ? 'success' : 'warning'}
                                        size="small"
                                        variant="outlined"
                                    />
                                </Box>
                                {config.cliLoggedIn ? (
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        size="small"
                                        startIcon={logoutMutation.isPending ? <CircularProgress size={14}/> :
                                            <LogoutIcon/>}
                                        onClick={() => logoutMutation.mutate()}
                                        disabled={logoutMutation.isPending}
                                    >
                                        Logout
                                    </Button>
                                ) : (
                                    <Box sx={{display: 'flex', flexDirection: 'column', gap: 1.5}}>
                                        <Button
                                            variant="contained"
                                            startIcon={(loginMutation.isPending || isPollingLogin) ?
                                                <CircularProgress size={16} color="inherit"/> : <LoginIcon/>}
                                            onClick={() => loginMutation.mutate()}
                                            disabled={loginMutation.isPending || isPollingLogin}
                                        >
                                            {isPollingLogin ? 'Waiting for login...' : loginMutation.isPending ? 'Opening browser...' : 'Login with Claude'}
                                        </Button>
                                        {isPollingLogin && (
                                            <Alert severity="info">
                                                Complete the login in your browser.
                                                This page will update automatically.
                                            </Alert>
                                        )}
                                        {loginResult && (
                                            <Alert severity={loginResult.success ? 'success' : 'error'}>
                                                {loginResult.message}
                                            </Alert>
                                        )}
                                    </Box>
                                )}
                            </Box>
                        )}

                        {/* API Key mode: key input */}
                        {config.authMode === 'api_key' && (
                            <Box>
                                <Typography variant="subtitle2" gutterBottom>
                                    Anthropic API Key
                                </Typography>
                                {config.hasApiKey && (
                                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1.5}}>
                                        <Typography variant="body2" fontFamily="monospace" color="text.secondary">
                                            {config.maskedApiKey}
                                        </Typography>
                                        <Chip label="Configured" color="success" size="small" variant="outlined"/>
                                        <Button size="small" color="error" onClick={handleClearApiKey}>
                                            Clear
                                        </Button>
                                    </Box>
                                )}
                                <Box sx={{display: 'flex', gap: 1}}>
                                    <TextField
                                        size="small"
                                        type="password"
                                        placeholder="sk-ant-..."
                                        value={apiKeyInput}
                                        onChange={(e) => setApiKeyInput(e.target.value)}
                                        sx={{flex: 1}}
                                    />
                                    <Button
                                        variant="outlined"
                                        onClick={handleSaveApiKey}
                                        disabled={!apiKeyInput.trim() || updateMutation.isPending}
                                    >
                                        {config.hasApiKey ? 'Update' : 'Save'}
                                    </Button>
                                </Box>
                            </Box>
                        )}

                        {/* Model Selector */}
                        <Box>
                            <Typography variant="subtitle2" gutterBottom>
                                Model
                            </Typography>
                            <TextField
                                select
                                size="small"
                                value={config.model}
                                onChange={(e) => handleModelChange(e.target.value)}
                                disabled={updateMutation.isPending}
                                sx={{minWidth: 280}}
                            >
                                {MODEL_OPTIONS.map((opt) => (
                                    <MenuItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Box>

                        {/* Test Connection */}
                        <Box>
                            <Button
                                variant="outlined"
                                startIcon={testMutation.isPending ? <CircularProgress size={16}/> : <PlayArrowIcon/>}
                                onClick={() => testMutation.mutate()}
                                disabled={testMutation.isPending}
                            >
                                Test Connection
                            </Button>
                            {testResult && (
                                <Alert severity={testResult.success ? 'success' : 'error'} sx={{mt: 1}}>
                                    {testResult.message}
                                </Alert>
                            )}
                        </Box>
                    </Box>
                ) : null}
            </CardContent>
        </Card>
    )
}

function SettingsPage() {
    const {user} = useAuth()

    const {
        control,
        handleSubmit,
        formState: {errors, isDirty},
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
            console.log('Saving settings:', data)
            notify.success('Settings saved')
        } catch {
            notify.error('Failed to save settings')
        }
    }

    return (
        <PageTransition pageKey="settings">
            <Box sx={{maxWidth: 800, mx: 'auto'}}>
                <Typography variant="h4" fontWeight={700} gutterBottom>
                    Settings
                </Typography>

                <form onSubmit={handleSubmit(onSubmit)}>
                    {/* Profile Settings */}
                    <Card sx={{mb: 3}}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Profile
                            </Typography>

                            <Grid container spacing={3}>
                                <Grid size={{xs: 12, sm: 6}}>
                                    <Controller
                                        name="email"
                                        control={control}
                                        render={({field}) => (
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
                                <Grid size={{xs: 12, sm: 6}}>
                                    <Controller
                                        name="username"
                                        control={control}
                                        render={({field}) => (
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
                    <Card sx={{mb: 3}}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Trading Preferences
                            </Typography>

                            <Grid container spacing={3}>
                                <Grid size={{xs: 12, sm: 6}}>
                                    <Controller
                                        name="defaultSymbol"
                                        control={control}
                                        render={({field}) => (
                                            <TextField
                                                {...field}
                                                label="Default Symbol"
                                                fullWidth
                                                helperText="Default trading pair to load"
                                            />
                                        )}
                                    />
                                </Grid>
                                <Grid size={{xs: 12, sm: 6}}>
                                    <Controller
                                        name="defaultTimeframe"
                                        control={control}
                                        render={({field}) => (
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
                    <Card sx={{mb: 3}}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Notifications
                            </Typography>

                            <Box sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
                                <Controller
                                    name="notifications.email"
                                    control={control}
                                    render={({field}) => (
                                        <FormControlLabel
                                            control={<Switch {...field} checked={field.value}/>}
                                            label="Email notifications"
                                        />
                                    )}
                                />
                                <Controller
                                    name="notifications.push"
                                    control={control}
                                    render={({field}) => (
                                        <FormControlLabel
                                            control={<Switch {...field} checked={field.value}/>}
                                            label="Push notifications"
                                        />
                                    )}
                                />
                                <Divider sx={{my: 1}}/>
                                <Controller
                                    name="notifications.orderFilled"
                                    control={control}
                                    render={({field}) => (
                                        <FormControlLabel
                                            control={<Switch {...field} checked={field.value}/>}
                                            label="Order filled alerts"
                                        />
                                    )}
                                />
                                <Controller
                                    name="notifications.priceAlerts"
                                    control={control}
                                    render={({field}) => (
                                        <FormControlLabel
                                            control={<Switch {...field} checked={field.value}/>}
                                            label="Price alerts"
                                        />
                                    )}
                                />
                                <Controller
                                    name="notifications.newsAlerts"
                                    control={control}
                                    render={({field}) => (
                                        <FormControlLabel
                                            control={<Switch {...field} checked={field.value}/>}
                                            label="News alerts"
                                        />
                                    )}
                                />
                            </Box>
                        </CardContent>
                    </Card>

                    {/* AI Agent Configuration (superuser only) */}
                    <AgentConfigCard/>

                    {/* Save Button */}
                    <Box sx={{display: 'flex', justifyContent: 'flex-end'}}>
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
