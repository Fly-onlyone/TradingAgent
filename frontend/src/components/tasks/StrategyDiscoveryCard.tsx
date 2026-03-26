/**
 * Strategy Auto-Discovery configuration card for the Tasks page.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Search } from "lucide-react";
import { useState } from "react";
import {
	type StrategyDiscoveryConfig,
	settingsApi,
} from "@/api/endpoints/settings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/store/authStore";
import { notify } from "@/store/uiStore";

const INTERVAL_OPTIONS = [
	{ value: 1, label: "Every hour" },
	{ value: 3, label: "Every 3 hours" },
	{ value: 6, label: "Every 6 hours" },
	{ value: 12, label: "Every 12 hours" },
	{ value: 24, label: "Every 24 hours" },
];

export function StrategyDiscoveryCard() {
	const isSuperuser = useAuthStore((s) => s.user?.isSuperuser);
	const queryClient = useQueryClient();
	const [runResult, setRunResult] = useState<string | null>(null);

	const configQuery = useQuery({
		queryKey: ["strategy-discovery-config"],
		queryFn: () => settingsApi.getStrategyDiscoveryConfig(),
		enabled: !!isSuperuser,
	});

	const updateMutation = useMutation({
		mutationFn: (update: Partial<StrategyDiscoveryConfig>) =>
			settingsApi.updateStrategyDiscoveryConfig(update),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["strategy-discovery-config"],
			});
		},
		onError: () => notify.error("Failed to update discovery settings"),
	});

	const runNowMutation = useMutation({
		mutationFn: () => settingsApi.runStrategyDiscoveryNow(),
		onSuccess: (result) => {
			setRunResult(
				`Crawled ${result.sourcesCrawled} sources, processed ${result.articlesProcessed} articles, found ${result.strategiesFound} strategies`,
			);
			if (result.strategiesFound > 0) {
				notify.success(`Discovered ${result.strategiesFound} new strategies`);
			} else {
				notify.info("No new strategies found");
			}
		},
		onError: () => notify.error("Discovery run failed"),
	});

	if (!isSuperuser) return null;

	const config = configQuery.data;

	return (
		<Card className="mb-6">
			<CardContent>
				<div className="mb-4 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Search className="size-5 text-primary" />
						<h3 className="text-base font-semibold">
							Strategy Auto-Discovery
						</h3>
					</div>
					{config && (
						<div className="flex items-center gap-2">
							<Switch
								checked={config.enabled}
								onCheckedChange={(checked) =>
									updateMutation.mutate({ enabled: checked })
								}
							/>
							<Label>{config.enabled ? "Enabled" : "Disabled"}</Label>
						</div>
					)}
				</div>

				<p className="mb-4 text-sm text-muted-foreground">
					Automatically crawl news sources and extract trading strategies using
					AI. Discovered strategies are saved to the knowledge base (RAG).
				</p>

				{configQuery.isLoading && (
					<Loader2 className="size-5 animate-spin text-muted-foreground" />
				)}

				{config && (
					<div className="flex flex-col gap-5">
						<div className="max-w-[250px] space-y-1.5">
							<Label>Check Interval</Label>
							<Select
								value={String(config.intervalHours)}
								onValueChange={(val) =>
									updateMutation.mutate({
										intervalHours: Number(val),
									})
								}
								disabled={!config.enabled}
							>
								<SelectTrigger size="sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{INTERVAL_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={String(opt.value)}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="max-w-[350px]">
							<p className="mb-2 text-sm">
								Min. Extraction Confidence:{" "}
								{(config.minConfidence * 100).toFixed(0)}%
							</p>
							<Slider
								value={config.minConfidence * 100}
								onValueChange={(val) =>
									updateMutation.mutate({
										minConfidence: (val as number) / 100,
									})
								}
								min={10}
								max={100}
								step={5}
								disabled={!config.enabled}
							/>
						</div>

						{/* Sources with strategy extraction enabled */}
						<div>
							<p className="mb-2 text-sm font-semibold">
								Sources ({config.sources.length})
							</p>
							{config.sources.length > 0 ? (
								<div className="flex flex-wrap gap-1.5">
									{config.sources.map((source) => (
										<Badge key={source.id} variant="outline">
											{source.name}
										</Badge>
									))}
								</div>
							) : (
								<p className="text-sm text-muted-foreground">
									No sources have strategy extraction enabled. Enable it on news
									sources in the News page.
								</p>
							)}
						</div>

						{/* Run Now button */}
						<div className="flex items-center gap-3">
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setRunResult(null);
									runNowMutation.mutate();
								}}
								disabled={
									runNowMutation.isPending || config.sources.length === 0
								}
							>
								{runNowMutation.isPending ? (
									<Loader2 className="size-3.5 animate-spin" />
								) : (
									<Play className="size-3.5" />
								)}
								{runNowMutation.isPending ? "Running..." : "Run Now"}
							</Button>
							{runResult && (
								<Alert className="py-1">
									<AlertDescription>{runResult}</AlertDescription>
								</Alert>
							)}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
