/**
 * Shimmer loading skeleton with diagonal gradient sweep.
 * Colors are now driven by MuiSkeleton theme overrides.
 */

import { Skeleton, type SkeletonProps } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

const shimmerSx: SxProps<Theme> = {
	backgroundSize: "200% 100%",
};

const variantMap: Record<string, SkeletonProps & { sx?: SxProps<Theme> }> = {
	card: {
		variant: "rounded",
		sx: { width: "100%", height: 160, borderRadius: 2, ...shimmerSx },
	},
	stat: {
		variant: "rounded",
		sx: { width: "100%", height: 100, borderRadius: 2, ...shimmerSx },
	},
	"table-row": {
		variant: "rounded",
		sx: {
			width: "100%",
			height: 40,
			borderRadius: 1,
			mb: 0.5,
			...shimmerSx,
		},
	},
	chart: {
		variant: "rounded",
		sx: { width: "100%", height: 300, borderRadius: 2, ...shimmerSx },
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
				sx={{ ...preset.sx, ...sx } as SxProps<Theme>}
			/>
		);
	}

	return <Skeleton {...rest} sx={{ ...shimmerSx, ...sx } as SxProps<Theme>} />;
}

export default ShimmerSkeleton;
