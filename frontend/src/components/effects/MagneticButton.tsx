/**
 * Button that magnetically attracts toward cursor on hover.
 */

import type { ButtonProps } from "@mui/material";
import { Button } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import { forwardRef, useRef } from "react";
import { useMagneticHover } from "@/hooks/useMagneticHover";

type MagneticButtonProps = ButtonProps & {
	strength?: number;
	radius?: number;
};

export const MagneticButton = forwardRef<
	HTMLButtonElement,
	MagneticButtonProps
>(function MagneticButton({ strength, radius, ...buttonProps }, _ref) {
	const innerRef = useRef<HTMLDivElement>(null);
	const prefersReduced = useReducedMotion();
	const { style, onMouseMove, onMouseLeave } = useMagneticHover(innerRef, {
		strength,
		radius,
	});

	if (prefersReduced) {
		return <Button {...buttonProps} />;
	}

	return (
		<motion.div
			ref={innerRef}
			style={{ ...style, display: "inline-block" }}
			onMouseMove={onMouseMove}
			onMouseLeave={onMouseLeave}
		>
			<Button {...buttonProps} />
		</motion.div>
	);
});
