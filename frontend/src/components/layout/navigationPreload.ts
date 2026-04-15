type ChunkRoute = {
	parentRoute?: ChunkRoute;
};

type RouterPreloader = {
	routesByPath: unknown;
	loadRouteChunk: unknown;
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
): Promise<void> {
	const routesByPath = router.routesByPath as Record<
		string,
		ChunkRoute | undefined
	>;
	const loadRouteChunk = router.loadRouteChunk as (
		route: ChunkRoute & Record<string, unknown>,
	) => Promise<unknown>;
	const route = routesByPath[to];
	if (!route) {
		return;
	}

	const chunkChain: ChunkRoute[] = [];
	let currentRoute: ChunkRoute | undefined = route;
	while (currentRoute) {
		chunkChain.push(currentRoute);
		currentRoute = currentRoute.parentRoute;
	}

	await Promise.all(
		chunkChain.map((chunkRoute) =>
			loadRouteChunk(chunkRoute as ChunkRoute & Record<string, unknown>),
		),
	);
}
