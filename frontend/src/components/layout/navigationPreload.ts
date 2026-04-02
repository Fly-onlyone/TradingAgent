import type { QueryClient } from "@tanstack/react-query";

type RouterPreloader = {
	preloadRoute: (opts: { to: string }) => Promise<unknown>;
};

/**
 * Keep navigation intent preloading limited to route code.
 *
 * Expensive data fetching is deferred to the destination screen so hover/focus
 * preloads do not wake exchange-backed endpoints or inflate memory on routes
 * the user never opens.
 */
export async function preloadNavigationTarget(
	to: string,
	router: RouterPreloader,
	_queryClient: QueryClient,
): Promise<void> {
	await router.preloadRoute({ to });
}
