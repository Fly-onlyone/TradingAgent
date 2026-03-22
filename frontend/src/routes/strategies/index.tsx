/**
 * Strategies List Page
 */

import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import InfoIcon from "@mui/icons-material/Info";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Dialog,
    DialogContent,
    DialogTitle,
    Grid2 as Grid,
    IconButton,
    Menu,
    MenuItem,
    Switch,
    Typography,
} from "@mui/material";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {createFileRoute, Link, useNavigate} from "@tanstack/react-router";
import {motion} from "framer-motion";
import {useMemo, useState} from "react";
import {strategiesApi} from "@/api/endpoints/strategies";
import {PerformanceGauge} from "@/components/charts/PerformanceGauge";
import {ConfirmDialog} from "@/components/common/ConfirmDialog";
import {EmptyState} from "@/components/common/EmptyState";
import {PageTransition} from "@/components/common/PageTransition";
import {SectionHeader} from "@/components/common/SectionHeader";
import {ShimmerSkeleton} from "@/components/common/ShimmerSkeleton";
import {notify} from "@/store/uiStore";
import type {Strategy} from "@/types";
import {staggerCascade} from "@/utils/animations/variants";
import {formatPercent} from "@/utils/formatters";
import {requireAuth} from "../-guards";

export const Route = createFileRoute("/strategies/")({
    beforeLoad: requireAuth,
    component: StrategiesPage,
});

function StrategiesPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const {
        data: strategies,
        isLoading,
        refetch,
    } = useQuery({
        queryKey: ["strategies"],
        queryFn: () => strategiesApi.getStrategies(),
    });

    const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [detailsTarget, setDetailsTarget] = useState<Strategy | null>(null);

    const deleteMutation = useMutation({
        mutationFn: (strategyId: string) =>
            strategiesApi.deleteStrategy(strategyId),
        onSuccess: async () => {
            notify.success("Strategy deleted");
            await queryClient.invalidateQueries({queryKey: ["strategies"]});
        },
        onError: () => {
            notify.error("Failed to delete strategy");
        },
    });

    const filteredStrategies = useMemo(() => {
        if (!strategies) return [];
        if (filter === "active") return strategies.filter((s) => s.isActive);
        if (filter === "inactive") return strategies.filter((s) => !s.isActive);
        return strategies;
    }, [strategies, filter]);

    const handleToggleActive = async (strategy: Strategy) => {
        try {
            await strategiesApi.toggleStrategy(strategy.id, !strategy.isActive);
            void refetch();
            notify.success(
                strategy.isActive ? "Strategy deactivated" : "Strategy activated",
                strategy.name,
            );
        } catch (_error) {
            notify.error("Failed to update strategy");
        }
    };

    return (
        <PageTransition pageKey="strategies">
            <Box>
                <SectionHeader
                    title="Strategies"
                    subtitle="Manage automated trading strategies for the agent"
                    action={
                        <Button
                            component={Link}
                            to="/strategies/create"
                            variant="contained"
                            startIcon={<AddIcon/>}
                        >
                            Import Strategy
                        </Button>
                    }
                />

                <Box
                    sx={{
                        display: "flex",
                        gap: 2,
                        mb: 3,
                        flexWrap: "wrap",
                        alignItems: "center",
                    }}
                >
                    <Chip
                        label="All"
                        variant={filter === "all" ? "filled" : "outlined"}
                        onClick={() => setFilter("all")}
                    />
                    <Chip
                        label="Active"
                        color="success"
                        variant={filter === "active" ? "filled" : "outlined"}
                        onClick={() => setFilter("active")}
                    />
                    <Chip
                        label="Inactive"
                        variant={filter === "inactive" ? "filled" : "outlined"}
                        onClick={() => setFilter("inactive")}
                    />
                </Box>

                {isLoading ? (
                    <Grid container spacing={3}>
                        {Array.from({length: 3}).map((_, i) => (
                            <Grid key={i} size={{xs: 12, md: 6, lg: 4}}>
                                <ShimmerSkeleton shimmerVariant="card" sx={{height: 250}}/>
                            </Grid>
                        ))}
                    </Grid>
                ) : filteredStrategies.length > 0 ? (
                    <motion.div
                        variants={staggerCascade.container}
                        initial="hidden"
                        animate="visible"
                    >
                        <Grid container spacing={3}>
                            {filteredStrategies.map((strategy) => (
                                <Grid key={strategy.id} size={{xs: 12, md: 6, lg: 4}}>
                                    <motion.div variants={staggerCascade.item}>
                                        <StrategyCard
                                            strategy={strategy}
                                            onToggle={() => handleToggleActive(strategy)}
                                            onDelete={() => setDeleteTarget(strategy.id)}
                                            onViewDetails={() => setDetailsTarget(strategy)}
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
                            label: "Import Strategy",
                            onClick: () => navigate({to: "/strategies/create"}),
                        }}
                    />
                )}

                <ConfirmDialog
                    open={!!deleteTarget}
                    title="Delete Strategy"
                    message="Are you sure you want to delete this strategy? This action cannot be undone."
                    confirmLabel="Delete"
                    destructive
                    loading={deleteMutation.isPending}
                    onConfirm={() => {
                        if (deleteTarget) {
                            deleteMutation.mutate(deleteTarget);
                            setDeleteTarget(null);
                        }
                    }}
                    onCancel={() => setDeleteTarget(null)}
                />

                <Dialog
                    open={!!detailsTarget}
                    onClose={() => setDetailsTarget(null)}
                    maxWidth="sm"
                    fullWidth
                >
                    {detailsTarget && (
                        <>
                            <DialogTitle>{detailsTarget.name}</DialogTitle>
                            <DialogContent>
                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                    {detailsTarget.description || "No description"}
                                </Typography>
                                {detailsTarget.symbol && (
                                    <Typography variant="body2" sx={{mt: 1}}>
                                        <strong>Symbol:</strong> {detailsTarget.symbol}
                                    </Typography>
                                )}
                                {detailsTarget.timeframe && (
                                    <Typography variant="body2">
                                        <strong>Timeframe:</strong> {detailsTarget.timeframe}
                                    </Typography>
                                )}
                                <Typography variant="body2">
                                    <strong>Status:</strong>{" "}
                                    {detailsTarget.isActive ? "Active" : "Inactive"}
                                </Typography>
                                {detailsTarget.backtestResults && (
                                    <Box sx={{mt: 2}}>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Backtest Results
                                        </Typography>
                                        <Typography variant="body2">
                                            Win Rate:{" "}
                                            {formatPercent(detailsTarget.backtestResults.winRate)}
                                        </Typography>
                                        <Typography variant="body2">
                                            Total Trades: {detailsTarget.backtestResults.totalTrades}
                                        </Typography>
                                        <Typography variant="body2">
                                            P&L:{" "}
                                            {formatPercent(
                                                detailsTarget.backtestResults.totalPnlPercent,
                                            )}
                                        </Typography>
                                        <Typography variant="body2">
                                            Max Drawdown:{" "}
                                            {formatPercent(
                                                -detailsTarget.backtestResults.maxDrawdown,
                                            )}
                                        </Typography>
                                    </Box>
                                )}
                            </DialogContent>
                        </>
                    )}
                </Dialog>
            </Box>
        </PageTransition>
    );
}

function StrategyCard({
                          strategy,
                          onToggle,
                          onDelete,
                          onViewDetails,
                      }: {
    strategy: Strategy;
    onToggle: () => void;
    onDelete: () => void;
    onViewDetails: () => void;
}) {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    const winRate = strategy.backtestResults?.winRate || 0;

    return (
        <Card
            component={motion.div}
            whileHover={{
                y: -6,
                transition: {type: "spring", stiffness: 400, damping: 30},
            }}
            whileTap={{scale: 0.98}}
            sx={{
                height: "100%",
                border: strategy.isActive ? "1px solid" : "none",
                borderColor: "success.main",
                boxShadow: strategy.isActive
                    ? (theme) =>
                        `0 0 12px rgba(${theme.trading.semanticRgb.success}, 0.2)`
                    : "none",
            }}
        >
            <CardContent>
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        mb: 2,
                    }}
                >
                    <Box>
                        <Box
                            sx={{display: "flex", alignItems: "center", gap: 1, mb: 0.5}}
                        >
                            <Typography variant="h6" fontWeight={600}>
                                {strategy.name}
                            </Typography>
                            <Chip
                                label={strategy.isActive ? "Active" : "Inactive"}
                                size="small"
                                color={strategy.isActive ? "success" : "default"}
                            />
                        </Box>
                        {strategy.symbol && (
                            <Typography variant="body2" color="text.secondary">
                                {strategy.symbol} | {strategy.timeframe}
                            </Typography>
                        )}
                    </Box>
                    <IconButton
                        size="small"
                        onClick={(e) => setAnchorEl(e.currentTarget)}
                    >
                        <MoreVertIcon/>
                    </IconButton>
                    <Menu
                        anchorEl={anchorEl}
                        open={Boolean(anchorEl)}
                        onClose={() => setAnchorEl(null)}
                    >
                        <MenuItem
                            onClick={() => {
                                setAnchorEl(null);
                                onViewDetails();
                            }}
                        >
                            <InfoIcon sx={{mr: 1, fontSize: 18}}/> View Details
                        </MenuItem>
                        <MenuItem
                            onClick={() => {
                                setAnchorEl(null);
                                onToggle();
                            }}
                        >
                            {strategy.isActive ? (
                                <>
                                    <StopIcon sx={{mr: 1, fontSize: 18}}/> Deactivate
                                </>
                            ) : (
                                <>
                                    <PlayArrowIcon sx={{mr: 1, fontSize: 18}}/> Activate
                                </>
                            )}
                        </MenuItem>
                        <MenuItem
                            sx={{color: "error.main"}}
                            onClick={() => {
                                setAnchorEl(null);
                                onDelete();
                            }}
                        >
                            <DeleteIcon sx={{mr: 1, fontSize: 18}}/> Delete
                        </MenuItem>
                    </Menu>
                </Box>

                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{mb: 2, minHeight: 40}}
                >
                    {strategy.description || "No description"}
                </Typography>

                {/* Performance */}
                <Box sx={{display: "flex", justifyContent: "space-around", mb: 2}}>
                    <PerformanceGauge
                        value={winRate}
                        label="Win Rate"
                        size={80}
                        thickness={6}
                    />
                </Box>

                {/* Stats */}
                {strategy.backtestResults && (
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, 1fr)",
                            gap: 1,
                            p: 1.5,
                            bgcolor: "background.default",
                            borderRadius: 1,
                        }}
                    >
                        <Box sx={{textAlign: "center"}}>
                            <Typography variant="caption" color="text.secondary">
                                Trades
                            </Typography>
                            <Typography variant="body2" fontWeight={600}>
                                {strategy.backtestResults.totalTrades}
                            </Typography>
                        </Box>
                        <Box sx={{textAlign: "center"}}>
                            <Typography variant="caption" color="text.secondary">
                                P&L
                            </Typography>
                            <Typography
                                variant="body2"
                                fontWeight={600}
                                color={
                                    strategy.backtestResults.totalPnlPercent >= 0
                                        ? "success.main"
                                        : "error.main"
                                }
                            >
                                {formatPercent(strategy.backtestResults.totalPnlPercent)}
                            </Typography>
                        </Box>
                        <Box sx={{textAlign: "center"}}>
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
                <Box sx={{display: "flex", justifyContent: "flex-end", mt: 2}}>
                    <Switch
                        checked={strategy.isActive}
                        onChange={onToggle}
                        color="success"
                    />
                </Box>
            </CardContent>
        </Card>
    );
}
