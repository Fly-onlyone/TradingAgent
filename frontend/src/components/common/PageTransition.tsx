/**
 * Page Transition Component using Framer Motion
 */

import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode } from 'react';
import { useUIStore } from '@/store/uiStore';

interface PageTransitionProps {
  children: ReactNode;
  pageKey?: string;
}

const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.15,
      ease: 'easeIn',
    },
  },
};

const reducedMotionVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.1 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

export function PageTransition({ children, pageKey }: PageTransitionProps) {
  const reducedMotion = useUIStore((state) => state.reducedMotion);
  const variants = reducedMotion ? reducedMotionVariants : pageVariants;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={variants}
        style={{ height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Animation variants for reuse
export const fadeInVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
};

export const slideUpVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export const scaleVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
};

export const staggerContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const staggerItemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

// Card hover animation
export const cardHoverVariants = {
  rest: { scale: 1, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)' },
  hover: {
    scale: 1.02,
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)',
    transition: { duration: 0.2 },
  },
};

// Price flash animation (for price changes)
export const priceFlashVariants = (isUp: boolean) => ({
  flash: {
    backgroundColor: isUp
      ? ['rgba(16, 185, 129, 0)', 'rgba(16, 185, 129, 0.3)', 'rgba(16, 185, 129, 0)']
      : ['rgba(239, 68, 68, 0)', 'rgba(239, 68, 68, 0.3)', 'rgba(239, 68, 68, 0)'],
    transition: { duration: 0.5 },
  },
});

export default PageTransition;
