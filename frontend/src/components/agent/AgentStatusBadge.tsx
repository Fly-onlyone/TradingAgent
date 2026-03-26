/**
 * Agent Status Badge Component
 */

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import SyncIcon from "@mui/icons-material/Sync";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import {Chip} from "@mui/material";
import {AnimatePresence, motion} from "framer-motion";
import type {AgentStatus} from "@/types/session";

interface AgentStatusBadgeProps {
    status: AgentStatus;
    showLabel?: boolean;
}

const statusConfig: Record<
    AgentStatus,
    {
        label: string;
        color: "default" | "success" | "warning" | "error" | "info";
        icon: typeof CheckCircleIcon;
        animate?: boolean;
    }
> = {
    disconnected: {
        label: "Disconnected",
        color: "default",
        icon: WifiOffIcon,
    },
    connected: {
        label: "Online",
        color: "success",
        icon: CheckCircleIcon,
    },
    thinking: {
        label: "Thinking...",
        color: "info",
        icon: SyncIcon,
        animate: true,
    },
    analyzing: {
        label: "Analyzing...",
        color: "warning",
        icon: SyncIcon,
        animate: true,
    },
    error: {
        label: "Error",
        color: "error",
        icon: ErrorIcon,
    },
    auth_required: {
        label: "Auth Required",
        color: "warning",
        icon: ErrorIcon,
    },
};

export function AgentStatusBadge({
                                     status,
                                     showLabel = true,
                                 }: AgentStatusBadgeProps) {
    const config = statusConfig[status];
    const Icon = config.icon;

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={status}
                initial={{opacity: 0, scale: 0.8}}
                animate={{opacity: 1, scale: 1}}
                exit={{opacity: 0, scale: 0.8}}
                transition={{duration: 0.15}}
                style={{display: "inline-flex"}}
            >
                <Chip
                    icon={
                        config.animate ? (
                            <motion.div
                                animate={{rotate: 360}}
                                transition={{duration: 1, repeat: Infinity, ease: "linear"}}
                                style={{display: "flex"}}
                            >
                                <Icon sx={{fontSize: 16}}/>
                            </motion.div>
                        ) : (
                            <Icon sx={{fontSize: 16}}/>
                        )
                    }
                    label={showLabel ? config.label : undefined}
                    color={config.color}
                    size="small"
                    variant="outlined"
                    sx={{
                        "& .MuiChip-icon": {
                            ml: showLabel ? undefined : 0,
                            mr: showLabel ? undefined : 0,
                        },
                        minWidth: showLabel ? undefined : 32,
                    }}
                />
            </motion.div>
        </AnimatePresence>
    );
}

export default AgentStatusBadge;
