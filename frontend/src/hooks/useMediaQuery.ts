import { useEffect, useState } from "react";

/**
 * Standalone media query hook replacing MUI's useMediaQuery.
 * Usage: const isMobile = useMediaQuery("(max-width: 767px)");
 */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => {
		if (typeof window === "undefined") return false;
		return window.matchMedia(query).matches;
	});

	useEffect(() => {
		const mql = window.matchMedia(query);
		const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
		mql.addEventListener("change", handler);
		setMatches(mql.matches);
		return () => mql.removeEventListener("change", handler);
	}, [query]);

	return matches;
}

export const useIsMobile = () => useMediaQuery("(max-width: 767px)");
export const useIsTablet = () => useMediaQuery("(max-width: 1023px)");
