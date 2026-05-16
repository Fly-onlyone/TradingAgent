import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";

export type AtkHealth = {
	running: boolean;
	accepting: boolean;
	profile: "demo" | "live" | string;
	tool_count: number;
	last_error: string | null;
};

export const atkHealthQueryOptions = () =>
	queryOptions({
		queryKey: ["atk", "health"],
		queryFn: () => apiClient.get<AtkHealth>("/api/v1/atk/health").then((r) => r.data),
		refetchInterval: 15_000,
		staleTime: 10_000,
	});

/**
 * Cancel-only ATK proxy. The backend enforces a strict allowlist of
 * cancellable tools — placing orders MUST go through the agent so the
 * full RiskManager context applies.
 */
export const useAtkProxy = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (vars: { toolName: string; args: Record<string, unknown> }) => {
			const res = await apiClient.post<Record<string, unknown>>(
				`/api/v1/atk/proxy/${encodeURIComponent(vars.toolName)}`,
				vars.args,
			);
			return res.data;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["orders"] });
			qc.invalidateQueries({ queryKey: ["atk", "health"] });
		},
	});
};
