/**
 * Decision Card Component
 */

import {Box, Button, Card, CardContent, Chip, Divider, LinearProgress, Typography,} from '@mui/material';
import {motion} from 'framer-motion';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import type {AgentDecision} from '@/api/websocket/useAgentSocket';

interface DecisionCardProps {
    decision: AgentDecision;
    onExecute?: () => void;
    isExecuting?: boolean;
}

const actionConfig = {
    buy: {
        label: 'BUY',
        color: 'success' as const,
        semanticKey: 'success' as const,
        icon: TrendingUpIcon,
    },
    sell: {
        label: 'SELL',
        color: 'error' as const,
        semanticKey: 'error' as const,
        icon: TrendingDownIcon,
    },
    hold: {
        label: 'HOLD',
        color: 'info' as const,
        semanticKey: 'info' as const,
        icon: PauseCircleIcon,
    },
    wait: {
        label: 'WAIT',
        color: 'warning' as const,
        semanticKey: 'warning' as const,
        icon: HourglassEmptyIcon,
    },
};

export function DecisionCard({decision, onExecute, isExecuting = false}: DecisionCardProps) {
    const config = actionConfig[decision.action];
    const Icon = config.icon;

    const confidenceColor =
        decision.confidence >= 0.7
            ? 'success'
            : decision.confidence >= 0.4
                ? 'warning'
                : 'error';

    return (
        <Card
            component={motion.div}
            initial={{opacity: 0, scale: 0.95}}
            animate={{opacity: 1, scale: 1}}
            sx={{
                bgcolor: (theme) => `rgba(${theme.trading.semanticRgb[config.semanticKey]}, 0.15)`,
                border: '1px solid',
                borderColor: `${config.color}.main`,
            }}
        >
            <CardContent>
                {/* Header */}
                <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2}}>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                        <Icon sx={{color: `${config.color}.main`, fontSize: 28}}/>
                        <Typography variant="h6" fontWeight={700} color={`${config.color}.main`}>
                            {config.label}
                        </Typography>
                        {decision.symbol && (
                            <Chip label={decision.symbol} size="small" variant="outlined"/>
                        )}
                    </Box>
                </Box>

                {/* Confidence */}
                <Box sx={{mb: 2}}>
                    <Box sx={{display: 'flex', justifyContent: 'space-between', mb: 0.5}}>
                        <Typography variant="body2" color="text.secondary">
                            Confidence
                        </Typography>
                        <Typography variant="body2" fontWeight={600} color={`${confidenceColor}.main`}>
                            {(decision.confidence * 100).toFixed(0)}%
                        </Typography>
                    </Box>
                    <LinearProgress
                        variant="determinate"
                        value={decision.confidence * 100}
                        color={confidenceColor}
                        sx={{height: 8, borderRadius: 4}}
                    />
                </Box>

                <Divider sx={{my: 2}}/>

                {/* Reasoning */}
                <Box sx={{mb: 2}}>
                    <Typography variant="subtitle2" gutterBottom>
                        Reasoning
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {decision.reasoning}
                    </Typography>
                </Box>

                {/* Risk Assessment */}
                {decision.riskAssessment && (
                    <Box sx={{mb: 2}}>
                        <Typography variant="subtitle2" gutterBottom>
                            Risk Assessment
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {decision.riskAssessment}
                        </Typography>
                    </Box>
                )}

                {/* Execute Button */}
                {onExecute && (decision.action === 'buy' || decision.action === 'sell') && (
                    <Button
                        variant="contained"
                        fullWidth
                        color={config.color}
                        onClick={onExecute}
                        disabled={isExecuting}
                        sx={{mt: 1}}
                    >
                        {isExecuting ? 'Executing...' : `Execute ${config.label}`}
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

export default DecisionCard;
