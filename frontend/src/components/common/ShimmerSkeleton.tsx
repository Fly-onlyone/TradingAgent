/**
 * Shimmer loading skeleton with diagonal gradient sweep.
 */

import {Skeleton, type SkeletonProps} from "@mui/material";
import {keyframes, type SxProps, type Theme} from "@mui/material/styles";

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const shimmerSx: SxProps<Theme> = {
    background:
        "linear-gradient(90deg, rgba(51,65,85,0.2) 25%, rgba(51,65,85,0.5) 50%, rgba(51,65,85,0.2) 75%)",
    backgroundSize: "200% 100%",
    animation: `${shimmer} 1.5s infinite ease-in-out`,
};

const variantMap: Record<string, SkeletonProps & { sx?: SxProps<Theme> }> = {
    card: {
        variant: "rounded",
        sx: {width: "100%", height: 160, borderRadius: 2, ...shimmerSx},
    },
    stat: {
        variant: "rounded",
        sx: {width: "100%", height: 100, borderRadius: 2, ...shimmerSx},
    },
    "table-row": {
        variant: "rounded",
        sx: {width: "100%", height: 40, borderRadius: 1, mb: 0.5, ...shimmerSx},
    },
    chart: {
        variant: "rounded",
        sx: {width: "100%", height: 300, borderRadius: 2, ...shimmerSx},
    },
};

interface ShimmerSkeletonProps extends SkeletonProps {
    shimmerVariant?: "card" | "stat" | "table-row" | "chart";
}

export function ShimmerSkeleton({
                                    shimmerVariant,
                                    sx,
                                    ...rest
                                }: ShimmerSkeletonProps) {
    if (shimmerVariant && variantMap[shimmerVariant]) {
        const preset = variantMap[shimmerVariant];
        return (
            <Skeleton
                {...preset}
                {...rest}
                sx={{...preset.sx, ...sx} as SxProps<Theme>}
            />
        );
    }

    return <Skeleton {...rest} sx={{...shimmerSx, ...sx} as SxProps<Theme>}/>;
}

export default ShimmerSkeleton;
