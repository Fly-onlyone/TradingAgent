/**
 * Animated number counter that smoothly transitions between values.
 */

import {useEffect, useRef} from "react";
import {animate as fmAnimate, motion, useMotionValue} from "framer-motion";
import {useReducedMotion} from "@/utils/animations/hooks";

interface AnimatedNumberProps {
    value: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
    duration?: number;
    className?: string;
}

export function AnimatedNumber({
                                   value,
                                   prefix = "",
                                   suffix = "",
                                   decimals = 2,
                                   duration = 0.8,
                                   className,
                               }: AnimatedNumberProps) {
    const motionValue = useMotionValue(value);
    const displayRef = useRef<HTMLSpanElement>(null);
    const prevValue = useRef(value);
    const reduced = useReducedMotion();

    useEffect(() => {
        if (reduced) {
            motionValue.set(value);
            if (displayRef.current) {
                displayRef.current.textContent = `${prefix}${value.toFixed(decimals)}${suffix}`;
            }
            prevValue.current = value;
            return;
        }

        const controls = fmAnimate(prevValue.current, value, {
            duration,
            ease: "easeOut",
            onUpdate: (v) => {
                motionValue.set(v);
                if (displayRef.current) {
                    displayRef.current.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`;
                }
            },
        });
        prevValue.current = value;
        return () => controls.stop();
    }, [value, prefix, suffix, decimals, duration, reduced, motionValue]);

    return (
        <motion.span ref={displayRef} className={className}>
            {prefix}
            {value.toFixed(decimals)}
            {suffix}
        </motion.span>
    );
}

export default AnimatedNumber;
