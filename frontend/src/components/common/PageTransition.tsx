/**
 * Page Transition Component using Framer Motion
 */

import {AnimatePresence, motion} from "framer-motion";
import type {ReactNode} from "react";
import {cardHover, pageEntrance, priceFlash, reducedMotionPage, staggerCascade,} from "@/utils/animations/variants";
import {useReducedMotion} from "@/utils/animations/hooks";

interface PageTransitionProps {
    children: ReactNode;
    pageKey?: string;
}

export function PageTransition({children, pageKey}: PageTransitionProps) {
    const reducedMotion = useReducedMotion();
    const variants = reducedMotion ? reducedMotionPage : pageEntrance;

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={pageKey}
                initial="initial"
                animate="animate"
                exit="exit"
                variants={variants}
                style={{height: "100%"}}
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}

// Re-export animation variants for backward compat
export const fadeInVariants = {
    hidden: {opacity: 0},
    visible: {opacity: 1, transition: {duration: 0.2}},
};

export const slideUpVariants = {
    hidden: {opacity: 0, y: 20},
    visible: {opacity: 1, y: 0, transition: {duration: 0.3}},
};

export const scaleVariants = {
    hidden: {opacity: 0, scale: 0.95},
    visible: {opacity: 1, scale: 1, transition: {duration: 0.2}},
};

export const staggerContainerVariants = staggerCascade.container;
export const staggerItemVariants = staggerCascade.item;

export const cardHoverVariants = cardHover;

export const priceFlashVariants = priceFlash;

export default PageTransition;
