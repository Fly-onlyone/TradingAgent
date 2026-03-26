/**
 * Shared Agent Configuration Panel
 * Used on both the Agent page (standalone) and Settings page (card variant).
 */

import {
	Bot,
	CheckCircle,
	AlertCircle,
	Loader2,
	LogIn,
	LogOut,
	Play,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { AgentConfig, AgentConfigUpdate } from "@/api/endpoints/settings";
import { settingsApi } from "@/api/endpoints/settings";
import { agentConfigQueryOptions } from "@/api/queryOptions/agent";
import { usePollingLogin } from "@/hooks/usePollingLogin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { notify } from "@/store/uiStore";

interface AgentConfigPanelProps {
	/** "card" wraps in Card with title header; "standalone" is bare. */
	variant?: "card" | "standalone";
	/** Show the thinking budget slider (agent page only). */
	showThinkingBudget?: boolean;
}

export function AgentConfigPanel({
	variant = "standalone",
	showThinkingBudget = false,
}: AgentConfigPanelProps) {
	const queryClient = useQueryClient();
	const [apiKeyInput, setApiKeyInput] = useState("");
	const [testResult, setTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);
	const [loginResult, setLoginResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);

	const configQuery = useQuery(agentConfigQueryOptions());

	const modelOptionsQuery = useQuery({
		queryKey: ["agent-model-options"],
		queryFn: () => settingsApi.getAgentModels(),
		enabled: configQuery.isSuccess,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: AgentConfigUpdate) =>
			settingsApi.updateAgentConfig(update),
		onMutate: async (update) => {
			await queryClient.cancelQueries({ queryKey: ["agent-config"] });
			const previousConfig = queryClient.getQueryData<AgentConfig>([
				"agent-config",
			]);

			if (previousConfig) {
				queryClient.setQueryData<AgentConfig>(["agent-config"], {
					...previousConfig,
					...(update.authMode !== undefined
						? { authMode: update.authMode }
						: {}),
					...(update.model !== undefined
						? { model: update.model }
						: {}),
					...(update.thinkingMode !== undefined
						? { thinkingMode: update.thinkingMode }
						: {}),
					...(update.thinkingBudget !== undefined
						? { thinkingBudget: update.thinkingBudget }
						: {}),
					...(update.effort !== undefined
						? { effort: update.effort }
						: {}),
					...(update.apiKey !== undefined
						? {
								hasApiKey: update.apiKey.trim().length > 0,
								maskedApiKey:
									update.apiKey.trim().length > 0
										? previousConfig.maskedApiKey ||
											"Configured"
										: "",
							}
						: {}),
				});
			}

			return { previousConfig };
		},
		onSuccess: (updatedConfig, variables) => {
			queryClient.setQueryData<AgentConfig>(["agent-config"], {
				...updatedConfig,
				...(variables.authMode !== undefined
					? { authMode: variables.authMode }
					: {}),
				...(variables.model !== undefined
					? { model: variables.model }
					: {}),
				...(variables.thinkingMode !== undefined
					? { thinkingMode: variables.thinkingMode }
					: {}),
				...(variables.thinkingBudget !== undefined
					? { thinkingBudget: variables.thinkingBudget }
					: {}),
				...(variables.effort !== undefined
					? { effort: variables.effort }
					: {}),
			});
			notify.success("Agent configuration updated");
			setTestResult(null);
			if (variables.apiKey !== undefined) {
				setApiKeyInput("");
			}
		},
		onError: (_, __, context) => {
			if (context?.previousConfig) {
				queryClient.setQueryData(
					["agent-config"],
					context.previousConfig,
				);
			}
			notify.error("Failed to update agent configuration");
		},
	});

	const testMutation = useMutation({
		mutationFn: () => settingsApi.testConnection(),
		onSuccess: (result) => {
			setTestResult(result);
			if (result.success) notify.success(result.message);
			else notify.error(result.message);
		},
		onError: () => {
			setTestResult({
				success: false,
				message: "Test request failed",
			});
		},
	});

	const loginMutation = useMutation({
		mutationFn: () => settingsApi.startCLILogin(),
		onSuccess: (result) => {
			setLoginResult(result);
			if (result.success) {
				startPolling();
			} else {
				notify.error(result.message);
			}
		},
		onError: () => {
			setLoginResult({
				success: false,
				message: "Login request failed",
			});
		},
	});

	const logoutMutation = useMutation({
		mutationFn: () => settingsApi.cliLogout(),
		onSuccess: (result) => {
			void queryClient.invalidateQueries({
				queryKey: ["agent-config"],
			});
			if (result.success) notify.success(result.message);
			else notify.error(result.message);
			setLoginResult(null);
		},
	});

	const { isPolling, startPolling } = usePollingLogin({
		pollFn: useCallback(async () => {
			const fresh = await settingsApi.getAgentConfig();
			return fresh.cliLoggedIn;
		}, []),
		onSuccess: useCallback(() => {
			setLoginResult({
				success: true,
				message: "Successfully logged in to Claude",
			});
			notify.success("Successfully logged in to Claude");
			void queryClient.invalidateQueries({
				queryKey: ["agent-config"],
			});
		}, [queryClient]),
		onTimeout: useCallback(() => {
			setLoginResult({
				success: false,
				message: "Login timed out. Please try again.",
			});
		}, []),
	});

	const config = configQuery.data;
	const resolvedModelOptions = config
		? (() => {
				const fetched = modelOptionsQuery.data ?? [];
				if (fetched.some((opt) => opt.value === config.model))
					return fetched;
				return [
					{ value: config.model, label: config.model },
					...fetched,
				];
			})()
		: [];

	const handleSaveApiKey = () => {
		if (apiKeyInput.trim())
			updateMutation.mutate({ apiKey: apiKeyInput.trim() });
	};

	const handleClearApiKey = () => {
		updateMutation.mutate({ apiKey: "" });
	};

	const body = configQuery.isLoading ? (
		<div className="flex justify-center py-6">
			<Loader2 className="size-6 animate-spin text-muted-foreground" />
		</div>
	) : configQuery.error ? (
		<Alert variant="destructive">
			<AlertCircle className="size-4" />
			<AlertDescription>
				Failed to load agent configuration
			</AlertDescription>
		</Alert>
	) : config ? (
		<div
			className={cn(
				"flex flex-col",
				variant === "standalone" ? "gap-5" : "gap-6",
			)}
		>
			{/* Auth Mode Toggle */}
			<div>
				<h4 className="mb-2 text-sm font-semibold">
					Authentication Mode
				</h4>
				<ToggleGroup
					type="single"
					value={config.authMode}
					onValueChange={(value) => {
						if (value) updateMutation.mutate({ authMode: value });
					}}
					disabled={updateMutation.isPending}
					className={cn(
						variant === "standalone" && "w-full",
					)}
				>
					<ToggleGroupItem
						value="subscription"
						variant="outline"
						size="sm"
						className={cn(variant === "standalone" && "flex-1")}
					>
						Claude Subscription
					</ToggleGroupItem>
					<ToggleGroupItem
						value="api_key"
						variant="outline"
						size="sm"
						className={cn(variant === "standalone" && "flex-1")}
					>
						API Key
					</ToggleGroupItem>
				</ToggleGroup>
				<p
					className={cn(
						"mt-1",
						variant === "standalone"
							? "text-xs text-muted-foreground"
							: "text-sm text-muted-foreground",
					)}
				>
					{config.authMode === "subscription"
						? "Uses Claude Pro/Max subscription via CLI login (free with plan)"
						: "Uses a direct Anthropic API key (pay-per-use billing)"}
				</p>
			</div>

			{/* Subscription: CLI login */}
			{config.authMode === "subscription" && (
				<div>
					<div className="mb-3 flex items-center gap-3">
						<h4 className="text-sm font-semibold">
							CLI Login Status
						</h4>
						<Badge
							variant="outline"
							className={cn(
								"gap-1.5",
								config.cliLoggedIn
									? "border-emerald-500/50 text-emerald-500"
									: "border-amber-500/50 text-amber-500",
							)}
						>
							{config.cliLoggedIn ? (
								<CheckCircle className="size-3" />
							) : (
								<AlertCircle className="size-3" />
							)}
							{config.cliLoggedIn ? "Logged In" : "Not Logged In"}
						</Badge>
					</div>
					{config.cliLoggedIn ? (
						<Button
							variant="destructive"
							size="sm"
							onClick={() => logoutMutation.mutate()}
							disabled={logoutMutation.isPending}
						>
							{logoutMutation.isPending ? (
								<Loader2 className="mr-1.5 size-3.5 animate-spin" />
							) : (
								<LogOut
									className="mr-1.5 size-3.5"
									data-icon="inline-start"
								/>
							)}
							Logout
						</Button>
					) : (
						<div className="flex flex-col gap-3">
							<Button
								className={cn(
									variant === "standalone" && "w-full",
								)}
								onClick={() => loginMutation.mutate()}
								disabled={
									loginMutation.isPending || isPolling
								}
							>
								{loginMutation.isPending || isPolling ? (
									<Loader2 className="mr-1.5 size-4 animate-spin" />
								) : (
									<LogIn
										className="mr-1.5 size-4"
										data-icon="inline-start"
									/>
								)}
								{isPolling
									? "Waiting for login..."
									: loginMutation.isPending
										? "Opening browser..."
										: "Login with Claude"}
							</Button>
							{isPolling && (
								<Alert>
									<AlertDescription
										className={cn(
											variant === "standalone" &&
												"text-xs",
										)}
									>
										Complete the login in your browser. This
										page will update automatically.
									</AlertDescription>
								</Alert>
							)}
							{loginResult && (
								<Alert
									variant={
										loginResult.success
											? "default"
											: "destructive"
									}
								>
									<AlertDescription>
										{loginResult.message}
									</AlertDescription>
								</Alert>
							)}
						</div>
					)}
				</div>
			)}

			{/* API Key mode */}
			{config.authMode === "api_key" && (
				<div>
					<h4 className="mb-2 text-sm font-semibold">
						Anthropic API Key
					</h4>
					{config.hasApiKey && (
						<div className="mb-3 flex items-center gap-2">
							{variant === "card" ? (
								<span className="font-mono text-sm text-muted-foreground">
									{config.maskedApiKey}
								</span>
							) : (
								<Badge
									variant="outline"
									className="border-emerald-500/50 font-mono text-emerald-500"
								>
									{config.maskedApiKey}
								</Badge>
							)}
							<Badge
								variant="outline"
								className="border-emerald-500/50 text-emerald-500"
							>
								Configured
							</Badge>
							<Button
								variant="destructive"
								size="xs"
								onClick={handleClearApiKey}
							>
								Clear
							</Button>
						</div>
					)}
					<div className="flex gap-2">
						<Input
							type="password"
							placeholder="sk-ant-..."
							value={apiKeyInput}
							onChange={(e) => setApiKeyInput(e.target.value)}
							className={cn(
								"flex-1",
								variant === "standalone" && "w-full",
							)}
						/>
						<Button
							variant="outline"
							onClick={handleSaveApiKey}
							disabled={
								!apiKeyInput.trim() ||
								updateMutation.isPending
							}
						>
							{config.hasApiKey ? "Update" : "Save"}
						</Button>
					</div>
				</div>
			)}

			{/* Model Selector */}
			<div>
				<h4 className="mb-2 text-sm font-semibold">Model</h4>
				<Select
					value={config.model}
					onValueChange={(value) =>
						updateMutation.mutate({ model: value })
					}
					disabled={updateMutation.isPending}
				>
					<SelectTrigger
						className={cn(
							"min-w-[280px]",
							variant === "standalone" && "w-full",
						)}
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{resolvedModelOptions.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Thinking Mode (agent page only) */}
			{showThinkingBudget && (
				<div className="flex flex-col gap-3">
					<div>
						<h4 className="mb-2 text-sm font-semibold">
							Thinking Mode
						</h4>
						<ToggleGroup
							type="single"
							value={config.thinkingMode}
							onValueChange={(value) => {
								if (value)
									updateMutation.mutate({
										thinkingMode: value,
									});
							}}
							disabled={updateMutation.isPending}
							className="w-full"
						>
							<ToggleGroupItem
								value="adaptive"
								variant="outline"
								size="sm"
								className="flex-1"
							>
								Adaptive
							</ToggleGroupItem>
							<ToggleGroupItem
								value="enabled"
								variant="outline"
								size="sm"
								className="flex-1"
							>
								Budget
							</ToggleGroupItem>
							<ToggleGroupItem
								value="disabled"
								variant="outline"
								size="sm"
								className="flex-1"
							>
								Off
							</ToggleGroupItem>
						</ToggleGroup>
						<p className="mt-1 text-xs text-muted-foreground">
							{config.thinkingMode === "adaptive" &&
								"Claude decides when and how much to think (recommended)."}
							{config.thinkingMode === "enabled" &&
								"Fixed token budget for reasoning."}
							{config.thinkingMode === "disabled" &&
								"Extended thinking is disabled."}
						</p>
					</div>
					{config.thinkingMode === "enabled" && (
						<div>
							<h4 className="mb-2 text-sm font-semibold">
								Thinking Budget:{" "}
								{`${config.thinkingBudget.toLocaleString()} tokens`}
							</h4>
							<Slider
								value={[config.thinkingBudget]}
								onValueChange={(value) =>
									updateMutation.mutate({
										thinkingBudget: value[0],
									})
								}
								min={1000}
								max={50000}
								step={1000}
								disabled={updateMutation.isPending}
							/>
							<div className="mt-1 flex justify-between text-xs text-muted-foreground">
								<span>1k</span>
								<span>10k</span>
								<span>25k</span>
								<span>50k</span>
							</div>
						</div>
					)}
					{/* Effort Level */}
					<div>
						<h4 className="mb-2 text-sm font-semibold">
							Effort Level
						</h4>
						<ToggleGroup
							type="single"
							value={config.effort}
							onValueChange={(value) => {
								if (value)
									updateMutation.mutate({ effort: value });
							}}
							disabled={updateMutation.isPending}
							className="w-full"
						>
							<ToggleGroupItem
								value="low"
								variant="outline"
								size="sm"
								className="flex-1"
							>
								Low
							</ToggleGroupItem>
							<ToggleGroupItem
								value="medium"
								variant="outline"
								size="sm"
								className="flex-1"
							>
								Medium
							</ToggleGroupItem>
							<ToggleGroupItem
								value="high"
								variant="outline"
								size="sm"
								className="flex-1"
							>
								High
							</ToggleGroupItem>
							<ToggleGroupItem
								value="max"
								variant="outline"
								size="sm"
								className="flex-1"
							>
								Max
							</ToggleGroupItem>
						</ToggleGroup>
						<p className="mt-1 text-xs text-muted-foreground">
							Controls the depth and intensity of reasoning.
						</p>
					</div>
				</div>
			)}

			{/* Test Connection */}
			<div>
				<Button
					variant={
						variant === "standalone" ? "default" : "outline"
					}
					className={cn(variant === "standalone" && "w-full")}
					onClick={() => testMutation.mutate()}
					disabled={testMutation.isPending}
				>
					{testMutation.isPending ? (
						<Loader2 className="mr-1.5 size-4 animate-spin" />
					) : (
						<Play
							className="mr-1.5 size-4"
							data-icon="inline-start"
						/>
					)}
					Test Connection
				</Button>
				{testResult && (
					<Alert
						variant={
							testResult.success ? "default" : "destructive"
						}
						className="mt-2"
					>
						<AlertDescription>
							{testResult.message}
						</AlertDescription>
					</Alert>
				)}
			</div>
		</div>
	) : null;

	if (variant === "card") {
		return (
			<Card className="mb-6">
				<CardHeader>
					<CardTitle>AI Agent Configuration</CardTitle>
				</CardHeader>
				<CardContent>{body}</CardContent>
			</Card>
		);
	}

	// standalone variant -- shown inside the agent config drawer
	return (
		<div className="mx-auto flex max-w-[480px] flex-col items-center gap-6 px-6 py-8">
			<Bot className="size-14 text-muted-foreground" />
			<div className="text-center">
				<h3 className="mb-1 text-lg font-semibold">
					Configure AI Agent
				</h3>
				<p className="text-sm text-muted-foreground">
					Set up authentication to start chatting with the trading
					agent.
				</p>
			</div>
			<div className="w-full">{body}</div>
		</div>
	);
}

export default AgentConfigPanel;
