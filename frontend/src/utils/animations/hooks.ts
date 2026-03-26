/**
 * Animation hooks — useReducedMotion.
 */

import {useUIStore} from "@/store/uiStore";

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
