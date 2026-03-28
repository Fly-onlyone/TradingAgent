import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { SymbolOption } from "@/api/endpoints/market";
import { marketSymbolsQueryOptions } from "@/api/queryOptions/market";
import { POPULAR_PAIRS } from "@/utils/constants";

/** Fetches OKX symbols and returns them grouped as "Popular" + "All Instruments". */
export function useSymbolOptions() {
	const symbolsQuery = useQuery({
		...marketSymbolsQueryOptions(),
	});

	const symbolOptions = useMemo<SymbolOption[]>(() => {
		const raw = symbolsQuery.data ?? [];
		const popularSet = new Set(POPULAR_PAIRS);
		const popular: SymbolOption[] = [];
		const rest: SymbolOption[] = [];

		for (const s of raw) {
			if (popularSet.has(s.symbol)) {
				popular.push({ ...s, group: "Popular" });
			}
			rest.push({ ...s, group: "All Instruments" });
		}

		// Ensure popular pairs show even if not in API response (fallback)
		for (const pair of POPULAR_PAIRS) {
			if (!popular.some((p) => p.symbol === pair)) {
				const [base, quote] = pair.split("-");
				popular.push({
					symbol: pair,
					base: base ?? pair,
					quote: quote ?? "USDT",
					group: "Popular",
				});
			}
		}

		return [...popular, ...rest];
	}, [symbolsQuery.data]);

	return { symbolOptions, isLoading: symbolsQuery.isLoading };
}
