/**
 * Animation hooks — useCountUp, useReducedMotion, useInViewStagger.
 */

import {useEffect, useRef} from "react";
import {animate as fmAnimate, useInView, useMotionValue,} from "framer-motion";
import {useUIStore} from "@/store/uiStore";

/**
 * Counts from previous value to `target` with deceleration easing.
 * Returns a MotionValue<string> suitable for `<motion.span style={{ ... }}>`
 */
export function useCountUp(target: number, duration = 0.8, decimals = 2) {
    const motionValue = useMotionValue(target);
    const prevTarget = useRef(target);
    const reduced = useReducedMotion();

    useEffect(() => {
        if (reduced) {
            motionValue.set(target);
            prevTarget.current = target;
            return;
        }
        const controls = fmAnimate(prevTarget.current, target, {
            duration,
            ease: "easeOut",
            onUpdate: (v) => motionValue.set(v),
        });
        prevTarget.current = target;
        return () => controls.stop();
    }, [target, duration, reduced, motionValue]);

    return {motionValue, decimals};
}

/**
 * Reads `useUIStore.reducedMotion` AND browser `prefers-reduced-motion`.
 * When true every animation should use duration:0.
 */
export function useReducedMotion(): boolean {
    const storeReduced = useUIStore((s) => s.reducedMotion);
    const mediaReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return storeReduced || mediaReduced;
}

/**
 * Returns a ref + `inView` boolean so stagger only triggers
 * when the container scrolls into view.
 */
export function useInViewStagger() {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, {once: true, margin: "-60px"});
    return {ref, inView};
}
