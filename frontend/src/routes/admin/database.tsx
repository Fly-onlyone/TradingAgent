/**
 * Database Admin Page
 * View all collections and documents (superuser only)
 */

import {useState} from 'react';
import {createFileRoute, Navigate} from '@tanstack/react-router';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Grid2 as Grid,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    Paper,
    TextField,
    InputAdornment,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Skeleton,
    Alert,
    Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import StorageIcon from '@mui/icons-material/Storage';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {PageTransition} from '@/components/common/PageTransition';
import {useAuthStore} from '@/store/authStore';
import {adminApi} from '@/api/endpoints/admin';
import type {CollectionInfo, DatabaseInfo} from '@/types';

export const Route = createFileRoute('/admin/database')({
    component: DatabaseAdminPage,
});

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function DatabaseAdminPage() {
    const {user} = useAuthStore();
    const queryClient = useQueryClient();
    const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [search, setSearch] = useState('');
    const [viewDocument, setViewDocument] = useState<Record<string, unknown> | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editJson, setEditJson] = useState('');
    const [editError, setEditError] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ collection: string; id: string } | null>(null);

    // Check if user is superuser
    if (!user?.isSuperuser && !import.meta.env.DEV) {
        return <Navigate to="/"/>;
    }

    // Fetch database info
    const dbInfoQuery = useQuery({
        queryKey: ['admin-db-info'],
        queryFn: () => adminApi.getDatabaseInfo(),
        staleTime: 120_000,
    });

    // Fetch collections
    const collectionsQuery = useQuery({
        queryKey: ['admin-collections'],
        queryFn: () => adminApi.getCollections(),
        staleTime: 60_000,
    });

    // Fetch documents for selected collection
    const documentsQuery = useQuery({
        queryKey: ['admin-documents', selectedCollection, page, pageSize, search],
        queryFn: () =>
            selectedCollection
                ? adminApi.getCollectionDocuments(selectedCollection, {page, pageSize, search})
                : Promise.resolve(null),
        enabled: !!selectedCollection,
        staleTime: 30_000,
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: ({collection, id}: { collection: string; id: string }) =>
            adminApi.deleteDocument(collection, id),
        onSuccess: () => {
            setDeleteConfirm(null);
            queryClient.invalidateQueries({queryKey: ['admin-documents']});
            queryClient.invalidateQueries({queryKey: ['admin-collections']});
            queryClient.invalidateQueries({queryKey: ['admin-db-info']});
        },
    });

    // Update mutation
    const updateMutation = useMutation({
        mutationFn: ({collection, id, document}: {
            collection: string;
            id: string;
            document: Record<string, unknown>;
        }) => adminApi.updateDocument(collection, id, document),
        onSuccess: (updatedDoc) => {
            setViewDocument(updatedDoc);
            setIsEditing(false);
            setEditError(null);
            queryClient.invalidateQueries({queryKey: ['admin-documents']});
        },
    });

    const handleCollectionClick = (collectionName: string) => {
        setSelectedCollection(collectionName);
        setPage(1);
        setSearch('');
    };

    const handleSearch = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            setPage(1);
        }
    };

    const handleViewDocument = (doc: Record<string, unknown>) => {
        setViewDocument(doc);
        setIsEditing(false);
        setEditError(null);
    };

    const handleStartEdit = () => {
        setEditJson(JSON.stringify(viewDocument, null, 2));
        setIsEditing(true);
        setEditError(null);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditError(null);
    };

    const handleSaveEdit = () => {
        try {
            const parsed = JSON.parse(editJson);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                setEditError('Document must be a JSON object');
                return;
            }
            const docId = viewDocument?._id as string;
            if (!docId || !selectedCollection) return;
            updateMutation.mutate({collection: selectedCollection, id: docId, document: parsed});
        } catch {
            setEditError('Invalid JSON syntax');
        }
    };

    const handleDeleteClick = (doc: Record<string, unknown>) => {
        const id = doc._id as string;
        if (!id || !selectedCollection) return;
        setDeleteConfirm({collection: selectedCollection, id});
    };

    const formatValue = (value: unknown): string => {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    const truncate = (str: string, maxLength: number = 50): string => {
        if (str.length <= maxLength) return str;
        return str.slice(0, maxLength) + '...';
    };

    const dbInfo: DatabaseInfo | undefined = dbInfoQuery.data;

    return (
        <PageTransition pageKey="admin-database">
            <Box>
                <Typography variant="h4" fontWeight={700} gutterBottom>
                    Database Admin
                </Typography>

                {collectionsQuery.error && (
                    <Alert severity="error" sx={{mb: 3}}>
                        Failed to load collections. You may not have admin privileges.
                    </Alert>
                )}

                {/* Database Info Header */}
                {dbInfoQuery.isLoading ? (
                    <Skeleton variant="rounded" height={72} sx={{mb: 3}}/>
                ) : dbInfo ? (
                    <Paper sx={{p: 2, mb: 3}}>
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1.5}}>
                            <InfoOutlinedIcon fontSize="small" color="primary"/>
                            <Typography variant="subtitle2" fontWeight={600}>
                                Connection Info
                            </Typography>
                        </Box>
                        <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 1}}>
                            <Chip label={`DB: ${dbInfo.databaseName}`} size="small" variant="outlined"/>
                            <Chip label={`Host: ${dbInfo.host}`} size="small" variant="outlined"/>
                            <Chip label={`MongoDB ${dbInfo.serverVersion}`} size="small" variant="outlined"/>
                            <Chip label={`Uptime: ${formatUptime(dbInfo.uptimeSeconds)}`} size="small"
                                  variant="outlined"/>
                            <Chip
                                label={`${dbInfo.totalDocuments.toLocaleString()} docs`}
                                size="small"
                                color="primary"
                                variant="outlined"
                            />
                            <Chip
                                label={`Storage: ${formatBytes(dbInfo.totalStorageSize)}`}
                                size="small"
                                color="primary"
                                variant="outlined"
                            />
                            <Chip
                                label={`Indexes: ${formatBytes(dbInfo.totalIndexSize)}`}
                                size="small"
                                variant="outlined"
                            />
                        </Box>
                    </Paper>
                ) : null}

                {/* Collection Cards */}
                <Grid container spacing={2} sx={{mb: 4}}>
                    {collectionsQuery.isLoading
                        ? [...Array(8)].map((_, i) => (
                            <Grid size={{xs: 6, sm: 4, md: 3, lg: 2}} key={i}>
                                <Skeleton variant="rounded" height={80}/>
                            </Grid>
                        ))
                        : collectionsQuery.data?.map((collection: CollectionInfo) => (
                            <Grid size={{xs: 6, sm: 4, md: 3, lg: 2}} key={collection.name}>
                                <Card
                                    sx={{
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        border: selectedCollection === collection.name ? 2 : 1,
                                        borderColor:
                                            selectedCollection === collection.name
                                                ? 'primary.main'
                                                : 'divider',
                                        '&:hover': {
                                            borderColor: 'primary.main',
                                            transform: 'translateY(-2px)',
                                        },
                                    }}
                                    onClick={() => handleCollectionClick(collection.name)}
                                >
                                    <CardContent sx={{py: 1.5, px: 2, '&:last-child': {pb: 1.5}}}>
                                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                            <StorageIcon fontSize="small" color="primary"/>
                                            <Box>
                                                <Typography variant="body2" fontWeight={600} noWrap>
                                                    {collection.displayName}
                                                </Typography>
                                                <Box sx={{display: 'flex', gap: 0.5, flexWrap: 'wrap'}}>
                                                    <Chip
                                                        label={collection.documentCount.toLocaleString()}
                                                        size="small"
                                                        variant="outlined"
                                                    />
                                                    {collection.storageSize > 0 && (
                                                        <Chip
                                                            label={formatBytes(collection.storageSize)}
                                                            size="small"
                                                            variant="outlined"
                                                            color="default"
                                                        />
                                                    )}
                                                </Box>
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                </Grid>

                {/* Document Table */}
                {selectedCollection && (
                    <Paper>
                        <Box sx={{p: 2, borderBottom: 1, borderColor: 'divider'}}>
                            <Box
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <Typography variant="h6">
                                    {collectionsQuery.data?.find((c) => c.name === selectedCollection)
                                        ?.displayName || selectedCollection}
                                </Typography>
                                <TextField
                                    size="small"
                                    placeholder="Search by ID or text..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
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
                                    sx={{width: 250}}
                                />
                            </Box>
                        </Box>

                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>ID</TableCell>
                                        <TableCell>Data Preview</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {documentsQuery.isLoading
                                        ? [...Array(5)].map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell>
                                                    <Skeleton/>
                                                </TableCell>
                                                <TableCell>
                                                    <Skeleton/>
                                                </TableCell>
                                                <TableCell>
                                                    <Skeleton width={40}/>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                        : documentsQuery.data?.documents.map((doc) => {
                                            const id = doc._id as string;
                                            const preview = Object.entries(doc)
                                                .filter(([key]) => key !== '_id')
                                                .slice(0, 3)
                                                .map(([key, value]) => `${key}: ${truncate(formatValue(value), 30)}`)
                                                .join(' | ');

                                            return (
                                                <TableRow key={id} hover>
                                                    <TableCell>
                                                        <Typography
                                                            variant="body2"
                                                            fontFamily="monospace"
                                                            fontSize="0.75rem"
                                                        >
                                                            {id}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" color="text.secondary" noWrap>
                                                            {truncate(preview, 80)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Tooltip title="View">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleViewDocument(doc)}
                                                            >
                                                                <VisibilityIcon fontSize="small"/>
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Delete">
                                                            <IconButton
                                                                size="small"
                                                                color="error"
                                                                onClick={() => handleDeleteClick(doc)}
                                                            >
                                                                <DeleteIcon fontSize="small"/>
                                                            </IconButton>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        {documentsQuery.data && (
                            <TablePagination
                                component="div"
                                count={documentsQuery.data.total}
                                page={page - 1}
                                onPageChange={(_, newPage) => setPage(newPage + 1)}
                                rowsPerPage={pageSize}
                                onRowsPerPageChange={(e) => {
                                    setPageSize(parseInt(e.target.value, 10));
                                    setPage(1);
                                }}
                                rowsPerPageOptions={[10, 20, 50, 100]}
                            />
                        )}
                    </Paper>
                )}

                {!selectedCollection && !collectionsQuery.isLoading && (
                    <Paper sx={{p: 4, textAlign: 'center'}}>
                        <StorageIcon sx={{fontSize: 48, color: 'text.secondary', mb: 2}}/>
                        <Typography color="text.secondary">
                            Select a collection to view documents
                        </Typography>
                    </Paper>
                )}

                {/* Document View/Edit Dialog */}
                <Dialog
                    open={!!viewDocument}
                    onClose={() => {
                        setViewDocument(null);
                        setIsEditing(false);
                        setEditError(null);
                    }}
                    maxWidth="md"
                    fullWidth
                >
                    <DialogTitle sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                            Document Details
                            {!isEditing && (
                                <Tooltip title="Edit document">
                                    <IconButton size="small" onClick={handleStartEdit}>
                                        <EditIcon fontSize="small"/>
                                    </IconButton>
                                </Tooltip>
                            )}
                        </Box>
                        <IconButton size="small" onClick={() => {
                            setViewDocument(null);
                            setIsEditing(false);
                            setEditError(null);
                        }}>
                            <CloseIcon/>
                        </IconButton>
                    </DialogTitle>
                    <DialogContent dividers>
                        {editError && (
                            <Alert severity="error" sx={{mb: 2}}>{editError}</Alert>
                        )}
                        {updateMutation.error && (
                            <Alert severity="error" sx={{mb: 2}}>Failed to update document</Alert>
                        )}
                        {isEditing ? (
                            <TextField
                                multiline
                                fullWidth
                                minRows={15}
                                maxRows={25}
                                value={editJson}
                                onChange={(e) => setEditJson(e.target.value)}
                                slotProps={{
                                    input: {
                                        sx: {
                                            fontFamily: 'monospace',
                                            fontSize: '0.75rem',
                                        },
                                    },
                                }}
                            />
                        ) : (
                            <Box
                                component="pre"
                                sx={{
                                    bgcolor: 'background.default',
                                    p: 2,
                                    borderRadius: 1,
                                    overflow: 'auto',
                                    fontSize: '0.75rem',
                                    fontFamily: 'monospace',
                                    maxHeight: 500,
                                }}
                            >
                                {JSON.stringify(viewDocument, null, 2)}
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions>
                        {isEditing ? (
                            <>
                                <Button onClick={handleCancelEdit}>Cancel</Button>
                                <Button
                                    variant="contained"
                                    startIcon={<SaveIcon/>}
                                    onClick={handleSaveEdit}
                                    disabled={updateMutation.isPending}
                                >
                                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                                </Button>
                            </>
                        ) : (
                            <Button onClick={() => {
                                setViewDocument(null);
                                setIsEditing(false);
                            }}>
                                Close
                            </Button>
                        )}
                    </DialogActions>
                </Dialog>

                {/* Delete Confirmation Dialog */}
                <Dialog
                    open={!!deleteConfirm}
                    onClose={() => setDeleteConfirm(null)}
                    maxWidth="xs"
                    fullWidth
                >
                    <DialogTitle>Confirm Delete</DialogTitle>
                    <DialogContent>
                        <Typography>
                            Are you sure you want to delete this document? This action cannot be undone.
                        </Typography>
                        {deleteConfirm && (
                            <Typography variant="body2" color="text.secondary" sx={{mt: 1, fontFamily: 'monospace'}}>
                                {deleteConfirm.collection} / {deleteConfirm.id}
                            </Typography>
                        )}
                        {deleteMutation.error && (
                            <Alert severity="error" sx={{mt: 2}}>Failed to delete document</Alert>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                        <Button
                            variant="contained"
                            color="error"
                            onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </PageTransition>
    );
}
