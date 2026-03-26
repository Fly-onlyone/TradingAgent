/**
 * Shimmer loading skeleton with diagonal gradient sweep.
 * Uses shadcn Skeleton with shimmer animation via Tailwind.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const variantMap: Record<string, string> = {
	card: "w-full h-40 rounded-lg",
	stat: "w-full h-[100px] rounded-lg",
	"table-row": "w-full h-10 rounded mb-1",
	chart: "w-full h-[300px] rounded-lg",
};

interface ShimmerSkeletonProps extends React.ComponentProps<"div"> {
	shimmerVariant?: "card" | "stat" | "table-row" | "chart";
}

export function ShimmerSkeleton({
	shimmerVariant,
	className,
	...rest
}: ShimmerSkeletonProps) {
	if (shimmerVariant && variantMap[shimmerVariant]) {
		return (
			<Skeleton
				className={cn(variantMap[shimmerVariant], className)}
				{...rest}
			/>
		);
	}

	return <Skeleton className={className} {...rest} />;
}

export default ShimmerSkeleton;
