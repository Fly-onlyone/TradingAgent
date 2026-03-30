/**
 * Central animation variant library — spring-physics based.
 * Reuse these named configs everywhere; avoid ad-hoc spring values.
 */

import type { Transition, Variants } from "framer-motion";

// ============ Spring Configs ============

export const spring = {
	snappy: { type: "spring", stiffness: 400, damping: 30 } as Transition,
	bouncy: {
		type: "spring",
		stiffness: 300,
		damping: 20,
		mass: 0.8,
	} as Transition,
	gentle: { type: "spring", stiffness: 200, damping: 25 } as Transition,
};

// ============ Page Instant (near-instant opacity fade) ============

export const pageInstant: Variants = {
	initial: { opacity: 0 },
	animate: {
		opacity: 1,
		transition: { duration: 0.1, ease: "easeOut" },
	},
};

// ============ Page Entrance ============

export const pageEntrance: Variants = {
	initial: { opacity: 0, y: 30, scale: 0.98 },
	animate: {
		opacity: 1,
		y: 0,
		scale: 1,
		transition: { type: "spring", stiffness: 300, damping: 30 },
	},
	exit: {
		opacity: 0,
		y: -20,
		transition: { duration: 0.15, ease: "easeIn" },
	},
};

// ============ Stagger Cascade ============

export const staggerCascade = {
	container: {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: { staggerChildren: 0.08 },
		},
	} as Variants,
	item: {
		hidden: { opacity: 0, y: 40, scale: 0.95 },
		visible: {
			opacity: 1,
			y: 0,
			scale: 1,
			transition: { type: "spring", stiffness: 400, damping: 30 },
		},
	} as Variants,
};

// ============ Slide In ============

export const slideIn = {
	left: {
		initial: { opacity: 0, x: -60 },
		animate: {
			opacity: 1,
			x: 0,
			transition: { type: "spring", stiffness: 400, damping: 30 },
		},
	} as Variants,
	right: {
		initial: { opacity: 0, x: 60 },
		animate: {
			opacity: 1,
			x: 0,
			transition: { type: "spring", stiffness: 400, damping: 30 },
		},
	} as Variants,
	bottom: {
		initial: { opacity: 0, y: 60 },
		animate: {
			opacity: 1,
			y: 0,
			transition: { type: "spring", stiffness: 400, damping: 30 },
		},
	} as Variants,
};

// ============ Scale In (dialogs/modals) ============

export const scaleIn: Variants = {
	initial: { opacity: 0, scale: 0.85 },
	animate: {
		opacity: 1,
		scale: 1,
		transition: { type: "spring", stiffness: 300, damping: 20, mass: 0.8 },
	},
	exit: { opacity: 0, scale: 0.9, transition: { duration: 0.12 } },
};

// ============ Card Hover ============

export const createCardHover = (primaryRgb = "249, 115, 22") => ({
	rest: {
		y: 0,
		scale: 1,
		boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
	},
	hover: {
		y: -8,
		scale: 1.03,
		boxShadow: `0 20px 40px rgba(0, 0, 0, 0.35), 0 0 20px rgba(${primaryRgb}, 0.15)`,
		transition: { type: "spring", stiffness: 400, damping: 30 },
	},
	tap: {
		scale: 0.98,
		transition: { type: "spring", stiffness: 400, damping: 30 },
	},
});

// ============ List Stagger (table rows) ============

export const listStagger = {
	container: {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: { staggerChildren: 0.03 },
		},
	} as Variants,
	item: {
		hidden: { opacity: 0, x: -20 },
		visible: {
			opacity: 1,
			x: 0,
			transition: { type: "spring", stiffness: 400, damping: 30 },
		},
	} as Variants,
};

// ============ Scroll Reveal (directional) ============

export const scrollReveal = {
	up: {
		hidden: { opacity: 0, y: 40 },
		visible: {
			opacity: 1,
			y: 0,
			transition: { type: "spring", stiffness: 300, damping: 30 },
		},
	} as Variants,
	down: {
		hidden: { opacity: 0, y: -40 },
		visible: {
			opacity: 1,
			y: 0,
			transition: { type: "spring", stiffness: 300, damping: 30 },
		},
	} as Variants,
	left: {
		hidden: { opacity: 0, x: -40 },
		visible: {
			opacity: 1,
			x: 0,
			transition: { type: "spring", stiffness: 300, damping: 30 },
		},
	} as Variants,
	right: {
		hidden: { opacity: 0, x: 40 },
		visible: {
			opacity: 1,
			x: 0,
			transition: { type: "spring", stiffness: 300, damping: 30 },
		},
	} as Variants,
};

// ============ Fade In Up (single-element entry) ============

export const fadeInUp: Variants = {
	hidden: { opacity: 0, y: 20 },
	visible: {
		opacity: 1,
		y: 0,
		transition: spring.gentle,
	},
};

// ============ Tab Switch (AnimatePresence between tab panels) ============

export const tabSwitch: Variants = {
	initial: { opacity: 0, y: 10 },
	animate: {
		opacity: 1,
		y: 0,
		transition: { type: "spring", ...spring.snappy, duration: 0.2 },
	},
	exit: {
		opacity: 0,
		y: -10,
		transition: { duration: 0.15 },
	},
};

// ============ Reduced motion variants ============

export const reducedMotionPage: Variants = {
	initial: { opacity: 0 },
	animate: { opacity: 1, transition: { duration: 0 } },
	exit: { opacity: 0, transition: { duration: 0 } },
};
