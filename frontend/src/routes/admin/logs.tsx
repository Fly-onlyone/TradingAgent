/**
 * Log Viewer Page (admin only)
 */

import {useEffect} from 'react';
import type {KeyboardEvent, ReactElement, ReactNode} from 'react';
import {createFileRoute, Navigate} from '@tanstack/react-router';
import {keepPreviousData, useQuery} from '@tanstack/react-query';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    TextField,
    MenuItem,
    InputAdornment,
    IconButton,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Skeleton,
    Alert,
    Card,
    CardContent,
    Grid2 as Grid,
    Switch,
    FormControlLabel,
    Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import BugReportIcon from '@mui/icons-material/BugReport';
import {format} from 'date-fns';
import {PageTransition} from '@/components/common/PageTransition';
import {useAuthStore} from '@/store/authStore';
import {useLogStore} from '@/store/logStore';
import {adminLogStatsQueryOptions, adminLogsQueryOptions} from '@/api/queryOptions/admin';
import type {LogEntry} from '@/types/log';

export const Route = createFileRoute('/admin/logs')({
    component: LogViewerPage,
});

const LEVEL_OPTIONS = ['', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];

const LEVEL_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'error',
    DEBUG: 'default',
};

const LEVEL_ICONS: Record<string, ReactNode> = {
    INFO: <InfoOutlinedIcon fontSize="small"/>,
    WARNING: <WarningAmberIcon fontSize="small"/>,
    ERROR: <ErrorOutlineIcon fontSize="small"/>,
    CRITICAL: <BugReportIcon fontSize="small"/>,
};

function StatCard({label, value, color}: { label: string; value: number; color?: string }) {
    return (
        <Card variant="outlined">
            <CardContent sx={{py: 1.5, px: 2, '&:last-child': {pb: 1.5}}}>
                <Typography variant="body2" color="text.secondary">
                    {label}
                </Typography>
                <Typography variant="h5" fontWeight={700} color={color || 'text.primary'}>
                    {value.toLocaleString()}
                </Typography>
            </CardContent>
        </Card>
    );
}

function LogViewerPage() {
    const {user} = useAuthStore();
    const store = useLogStore();

    if (!user?.isSuperuser && !import.meta.env.DEV) {
        return <Navigate to="/"/>;
    }

    const logsQuery = useQuery({
        ...adminLogsQueryOptions(store.filters),
        placeholderData: keepPreviousData,
        refetchInterval: store.autoRefresh ? 5000 : false,
    });

    const statsQuery = useQuery({
        ...adminLogStatsQueryOptions(),
        refetchInterval: store.autoRefresh ? 10000 : false,
    });

    // Sync query results to store
    useEffect(() => {
        if (logsQuery.data) {
            store.setLogs(logsQuery.data.logs, logsQuery.data.total);
        }
    }, [logsQuery.data]);

    useEffect(() => {
        if (statsQuery.data) {
            store.setStats(statsQuery.data);
        }
    }, [statsQuery.data]);

    const handleSearch = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            store.setFilters({search: (event.target as HTMLInputElement).value, page: 1});
        }
    };

    const handleLevelChange = (level: string) => {
        store.setFilters({level: level || undefined, page: 1});
    };

    const handleRowClick = (log: LogEntry) => {
        store.setSelectedLog(log);
    };

    const stats = store.stats;

    return (
        <PageTransition pageKey="admin-logs">
            <Box>
                <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3}}>
                    <Typography variant="h4" fontWeight={700}>
                        Logs
                    </Typography>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={store.autoRefresh}
                                    onChange={() => store.toggleAutoRefresh()}
                                />
                            }
                            label="Auto-refresh"
                        />
                        <Tooltip title="Refresh">
                            <IconButton
                                onClick={() => {
                                    void logsQuery.refetch();
                                    void statsQuery.refetch();
                                }}
                                size="small"
                            >
                                <RefreshIcon/>
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {logsQuery.error && (
                    <Alert severity="error" sx={{mb: 3}}>
                        Failed to load logs. You may not have admin privileges.
                    </Alert>
                )}

                {/* Stats Cards */}
                <Grid container spacing={2} sx={{mb: 3}}>
                    <Grid size={{xs: 6, sm: 3}}>
                        <StatCard label="Total" value={stats?.totalCount ?? 0}/>
                    </Grid>
                    <Grid size={{xs: 6, sm: 3}}>
                        <StatCard label="Errors" value={stats?.levelCounts?.ERROR ?? 0} color="error.main"/>
                    </Grid>
                    <Grid size={{xs: 6, sm: 3}}>
                        <StatCard label="Warnings" value={stats?.levelCounts?.WARNING ?? 0} color="warning.main"/>
                    </Grid>
                    <Grid size={{xs: 6, sm: 3}}>
                        <StatCard label="Info" value={stats?.levelCounts?.INFO ?? 0} color="info.main"/>
                    </Grid>
                </Grid>

                {/* Filters */}
                <Paper sx={{p: 2, mb: 2}}>
                    <Box sx={{display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center'}}>
                        <TextField
                            size="small"
                            select
                            label="Level"
                            value={store.filters.level || ''}
                            onChange={(e) => handleLevelChange(e.target.value)}
                            sx={{minWidth: 140}}
                        >
                            <MenuItem value="">All Levels</MenuItem>
                            {LEVEL_OPTIONS.filter(Boolean).map((level) => (
                                <MenuItem key={level} value={level}>
                                    {level}
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            size="small"
                            placeholder="Search messages..."
                            defaultValue={store.filters.search || ''}
                            onKeyDown={handleSearch}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon fontSize="small"/>
                                        </InputAdornment>
                                    ),
                                },
                            }}
                            sx={{minWidth: 250}}
                        />

                        <TextField
                            size="small"
                            placeholder="Module filter..."
                            defaultValue={store.filters.module || ''}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    store.setFilters({
                                        module: (e.target as HTMLInputElement).value || undefined,
                                        page: 1,
                                    });
                                }
                            }}
                            sx={{minWidth: 200}}
                        />

                        {(store.filters.level || store.filters.search || store.filters.module) && (
                            <Button size="small" onClick={() => store.resetFilters()}>
                                Clear Filters
                            </Button>
                        )}
                    </Box>
                </Paper>

                {/* Log Table */}
                <Paper>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell width={160}>Timestamp</TableCell>
                                    <TableCell width={100}>Level</TableCell>
                                    <TableCell width={200}>Logger</TableCell>
                                    <TableCell>Message</TableCell>
                                    <TableCell width={100}>Request ID</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {logsQuery.isLoading
                                    ? [...Array(10)].map((_, i) => (
                                        <TableRow key={i}>
                                            {[...Array(5)].map((_, j) => (
                                                <TableCell key={j}>
                                                    <Skeleton/>
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                    : store.logs.map((log) => (
                                        <TableRow
                                            key={log.id}
                                            hover
                                            sx={{cursor: 'pointer'}}
                                            onClick={() => handleRowClick(log)}
                                        >
                                            <TableCell>
                                                <Typography variant="body2" fontSize="0.75rem" fontFamily="monospace">
                                                    {format(new Date(log.timestamp), 'MMM dd HH:mm:ss')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    icon={LEVEL_ICONS[log.level] as ReactElement}
                                                    label={log.level}
                                                    size="small"
                                                    color={LEVEL_COLORS[log.level] || 'default'}
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography
                                                    variant="body2"
                                                    fontSize="0.75rem"
                                                    color="text.secondary"
                                                    noWrap
                                                    sx={{maxWidth: 200}}
                                                >
                                                    {log.loggerName}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" noWrap sx={{maxWidth: 500}}>
                                                    {log.message}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                {log.requestId && (
                                                    <Typography
                                                        variant="body2"
                                                        fontSize="0.7rem"
                                                        fontFamily="monospace"
                                                        color="text.secondary"
                                                    >
                                                        {log.requestId.slice(0, 8)}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {logsQuery.data && (
                        <TablePagination
                            component="div"
                            count={store.total}
                            page={store.page - 1}
                            onPageChange={(_, newPage) => store.setPage(newPage + 1)}
                            rowsPerPage={store.pageSize}
                            onRowsPerPageChange={(e) => {
                                store.setPageSize(parseInt(e.target.value, 10));
                            }}
                            rowsPerPageOptions={[25, 50, 100, 200]}
                        />
                    )}
                </Paper>

                {/* Log Detail Dialog */}
                <Dialog
                    open={!!store.selectedLog}
                    onClose={() => store.setSelectedLog(null)}
                    maxWidth="md"
                    fullWidth
                >
                    {store.selectedLog && (
                        <>
                            <DialogTitle
                                sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
                            >
                                <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                    Log Detail
                                    <Chip
                                        label={store.selectedLog.level}
                                        size="small"
                                        color={LEVEL_COLORS[store.selectedLog.level] || 'default'}
                                        variant="outlined"
                                    />
                                </Box>
                                <IconButton size="small" onClick={() => store.setSelectedLog(null)}>
                                    <CloseIcon/>
                                </IconButton>
                            </DialogTitle>
                            <DialogContent dividers>
                                <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
                                    <Grid container spacing={2}>
                                        <Grid size={{xs: 6, sm: 4}}>
                                            <Typography variant="caption" color="text.secondary">
                                                Timestamp
                                            </Typography>
                                            <Typography variant="body2" fontFamily="monospace">
                                                {format(new Date(store.selectedLog.timestamp), 'yyyy-MM-dd HH:mm:ss.SSS')}
                                            </Typography>
                                        </Grid>
                                        <Grid size={{xs: 6, sm: 4}}>
                                            <Typography variant="caption" color="text.secondary">
                                                Logger
                                            </Typography>
                                            <Typography variant="body2" fontFamily="monospace">
                                                {store.selectedLog.loggerName}
                                            </Typography>
                                        </Grid>
                                        <Grid size={{xs: 6, sm: 4}}>
                                            <Typography variant="caption" color="text.secondary">
                                                Location
                                            </Typography>
                                            <Typography variant="body2" fontFamily="monospace">
                                                {store.selectedLog.module}:{store.selectedLog.function}:{store.selectedLog.line}
                                            </Typography>
                                        </Grid>
                                        {store.selectedLog.requestId && (
                                            <Grid size={{xs: 6, sm: 4}}>
                                                <Typography variant="caption" color="text.secondary">
                                                    Request ID
                                                </Typography>
                                                <Typography variant="body2" fontFamily="monospace">
                                                    {store.selectedLog.requestId}
                                                </Typography>
                                            </Grid>
                                        )}
                                        {store.selectedLog.userId && (
                                            <Grid size={{xs: 6, sm: 4}}>
                                                <Typography variant="caption" color="text.secondary">
                                                    User ID
                                                </Typography>
                                                <Typography variant="body2" fontFamily="monospace">
                                                    {store.selectedLog.userId}
                                                </Typography>
                                            </Grid>
                                        )}
                                    </Grid>

                                    <Box>
                                        <Typography variant="caption" color="text.secondary">
                                            Message
                                        </Typography>
                                        <Box
                                            sx={{
                                                bgcolor: 'background.default',
                                                p: 2,
                                                borderRadius: 1,
                                                mt: 0.5,
                                            }}
                                        >
                                            <Typography variant="body2" fontFamily="monospace" whiteSpace="pre-wrap">
                                                {store.selectedLog.message}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    {store.selectedLog.traceback && (
                                        <Box>
                                            <Typography variant="caption" color="error.main">
                                                Traceback
                                            </Typography>
                                            <Box
                                                sx={{
                                                    bgcolor: 'error.main',
                                                    color: 'error.contrastText',
                                                    p: 2,
                                                    borderRadius: 1,
                                                    mt: 0.5,
                                                    overflow: 'auto',
                                                    maxHeight: 300,
                                                }}
                                            >
                                                <Typography
                                                    variant="body2"
                                                    fontFamily="monospace"
                                                    fontSize="0.7rem"
                                                    whiteSpace="pre-wrap"
                                                >
                                                    {store.selectedLog.traceback}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    )}

                                    {store.selectedLog.extra && (
                                        <Box>
                                            <Typography variant="caption" color="text.secondary">
                                                Extra Data
                                            </Typography>
                                            <Box
                                                component="pre"
                                                sx={{
                                                    bgcolor: 'background.default',
                                                    p: 2,
                                                    borderRadius: 1,
                                                    mt: 0.5,
                                                    overflow: 'auto',
                                                    fontSize: '0.75rem',
                                                    fontFamily: 'monospace',
                                                    maxHeight: 200,
                                                }}
                                            >
                                                {JSON.stringify(store.selectedLog.extra, null, 2)}
                                            </Box>
                                        </Box>
                                    )}
                                </Box>
                            </DialogContent>
                            <DialogActions>
                                <Button onClick={() => store.setSelectedLog(null)}>Close</Button>
                            </DialogActions>
                        </>
                    )}
                </Dialog>
            </Box>
        </PageTransition>
    );
}
