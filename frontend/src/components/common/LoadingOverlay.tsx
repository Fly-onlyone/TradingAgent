import {Box, CircularProgress, Typography} from "@mui/material";

interface LoadingOverlayProps {
    message?: string;
}

export function LoadingOverlay({message}: LoadingOverlayProps) {
    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                py: 6,
                gap: 2,
            }}
        >
            <CircularProgress size={36}/>
            {message && (
                <Typography variant="body2" color="text.secondary">
                    {message}
                </Typography>
            )}
        </Box>
    );
}
