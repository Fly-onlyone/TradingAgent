import {Box, type SxProps, type Theme, useTheme} from "@mui/material";
import {motion} from "framer-motion";

type StatusType = "online" | "offline" | "away" | "busy" | "loading";

interface StatusDotProps {
    status: StatusType;
    size?: number;
    sx?: SxProps<Theme>;
}

export function StatusDot({status, size = 8, sx}: StatusDotProps) {
    const theme = useTheme();
    const colors: Record<StatusType, string> = {
        online: theme.trading.status.online,
        offline: theme.trading.status.offline,
        away: theme.trading.status.away,
        busy: theme.trading.status.busy,
        loading: theme.palette.primary.main,
    };

    const color = colors[status];
    const isAnimated = status === "online" || status === "loading";

    return (
        <Box
            sx={{
                position: "relative",
                width: size,
                height: size,
                flexShrink: 0,
                ...sx,
            }}
        >
            {isAnimated && (
                <motion.div
                    animate={{
                        scale: [1, 1.8, 1],
                        opacity: [0.6, 0, 0.6],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                    style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        backgroundColor: color,
                    }}
                />
            )}
            <Box
                sx={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    backgroundColor: color,
                }}
            />
        </Box>
    );
}
