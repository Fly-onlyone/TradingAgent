/**
 * Select wrapper that compensates for the app-wide CSS zoom when positioning menus.
 *
 * With shadcn/base-ui Select the positioner handles anchor alignment natively,
 * so the zoom compensation is lighter than the old MUI approach.
 */

import type { ComponentProps } from "react";
import {
	Select,
	SelectContent,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type SelectRootProps = ComponentProps<typeof Select>;
type SelectTriggerProps = ComponentProps<typeof SelectTrigger>;

interface ZoomAwareSelectProps extends SelectRootProps {
	/** Props forwarded to the SelectTrigger */
	triggerProps?: Omit<SelectTriggerProps, "children">;
	/** Placeholder text for SelectValue */
	placeholder?: string;
	/** Content (SelectItems) */
	children: React.ReactNode;
	fullWidth?: boolean;
}

export function ZoomAwareSelect({
	triggerProps,
	placeholder,
	children,
	fullWidth = true,
	...rootProps
}: ZoomAwareSelectProps) {
	return (
		<div className={fullWidth ? "w-full" : undefined}>
			<Select {...rootProps}>
				<SelectTrigger
					{...triggerProps}
					className={fullWidth ? "w-full" : triggerProps?.className}
				>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>{children}</SelectContent>
			</Select>
		</div>
	);
}

export default ZoomAwareSelect;
