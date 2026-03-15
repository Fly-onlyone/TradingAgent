/**
 * Slot-machine digit counter animation.
 * Each digit column animates independently with spring physics.
 */

import {
	motion,
	useReducedMotion,
	useSpring,
	useTransform,
} from "framer-motion";
import { useEffect, useMemo } from "react";

interface RollingDigitsProps {
	value: string;
	fontSize?: number;
	fontWeight?: number;
	color?: string;
}

const DIGITS = "0123456789";
const DIGIT_HEIGHT = 1.2; // em units

function DigitColumn({
	digit,
	delay,
	fontSize,
	fontWeight,
	color,
}: {
	digit: string;
	delay: number;
	fontSize: number;
	fontWeight: number;
	color?: string;
}) {
	const prefersReduced = useReducedMotion();
	const targetIndex = DIGITS.indexOf(digit);

	const springY = useSpring(prefersReduced ? targetIndex : 0, {
		stiffness: 200,
		damping: 25,
		mass: 0.8,
	});

	const y = useTransform(springY, (v) => `${-v * DIGIT_HEIGHT}em`);

	useEffect(() => {
		const timeout = setTimeout(
			() => springY.set(targetIndex),
			prefersReduced ? 0 : delay * 1000,
		);
		return () => clearTimeout(timeout);
	}, [targetIndex, springY, delay, prefersReduced]);

	return (
		<span
			style={{
				display: "inline-block",
				height: `${DIGIT_HEIGHT}em`,
				overflow: "hidden",
				verticalAlign: "bottom",
			}}
		>
			<motion.span
				style={{
					display: "block",
					y,
					fontSize,
					fontWeight,
					lineHeight: `${DIGIT_HEIGHT}em`,
					color,
				}}
			>
				{DIGITS.split("").map((d) => (
					<span key={d} style={{ display: "block" }}>
						{d}
					</span>
				))}
			</motion.span>
		</span>
	);
}

export function RollingDigits({
	value,
	fontSize = 28,
	fontWeight = 700,
	color,
}: RollingDigitsProps) {
	const chars = useMemo(() => value.split(""), [value]);

	return (
		<span style={{ display: "inline-flex", whiteSpace: "nowrap" }}>
			{chars.map((char, i) => {
				if (DIGITS.includes(char)) {
					return (
						<DigitColumn
							key={`col-${String(i)}`}
							digit={char}
							delay={i * 0.03}
							fontSize={fontSize}
							fontWeight={fontWeight}
							color={color}
						/>
					);
				}
				return (
					<span
						key={`static-${String(i)}`}
						style={{
							fontSize,
							fontWeight,
							lineHeight: `${DIGIT_HEIGHT}em`,
							color,
						}}
					>
						{char}
					</span>
				);
			})}
		</span>
	);
}
