import { type QueryKey, queryOptions } from "@tanstack/react-query";

type Defaults = {
	staleTime: number;
	gcTime: number;
	refetchOnMount?: boolean;
};

type QueryOpts<TKey extends QueryKey, TData> = {
	queryKey: TKey;
	queryFn: () => Promise<TData>;
	staleTime?: number;
	gcTime?: number;
	refetchOnMount?: boolean;
};

export function createQueryOptionsFactory(defaults: Defaults) {
	return <TKey extends QueryKey, TData>(opts: QueryOpts<TKey, TData>) =>
		queryOptions({
			queryKey: opts.queryKey,
			queryFn: opts.queryFn,
			staleTime: opts.staleTime ?? defaults.staleTime,
			gcTime: opts.gcTime ?? defaults.gcTime,
			refetchOnMount: opts.refetchOnMount ?? defaults.refetchOnMount,
		});
}
