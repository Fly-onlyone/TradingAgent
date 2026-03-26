/**
 * Settings Page
 */

import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertCircle,
	CheckCircle,
	Eye,
	EyeOff,
	Loader2,
	MinusCircle,
	Play,
	PlusCircle,
} from "lucide-react";
import * as Sentry from "@sentry/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { authApi } from "@/api/endpoints/auth";
import type {
	AuthConfigUpdate,
	EmbeddingConfigUpdate,
	ExchangeConfigUpdate,
	SessionRetentionConfigUpdate,
} from "@/api/endpoints/settings";
import { settingsApi } from "@/api/endpoints/settings";
import { AgentConfigPanel } from "@/components/agent/AgentConfigPanel";
import { MetricRow } from "@/components/common/MetricRow";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ThemeSelector } from "@/components/common/ThemeSelector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { notify, useUIStore } from "@/store/uiStore";
import { getErrorMessage } from "@/utils/errors";
import {
	type ChangePasswordInput,
	changePasswordSchema,
	type SettingsInput,
	settingsSchema,
} from "@/utils/validators";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/settings")({
	beforeLoad: requireAuth,
	component: SettingsPage,
});

function EmbeddingConfigCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [newProcess, setNewProcess] = useState("");

	const configQuery = useQuery({
		queryKey: ["embedding-config"],
		queryFn: () => settingsApi.getEmbeddingConfig(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: EmbeddingConfigUpdate) =>
			settingsApi.updateEmbeddingConfig(update),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["embedding-config"] });
			notify.success("Embedding configuration updated");
		},
		onError: (error) => {
			notify.error(
				"Failed to update embedding configuration",
				getErrorMessage(error),
			);
		},
	});

	if (!isSuperuser && !import.meta.env.DEV) return null;

	const config = configQuery.data;

	const handleAddProcess = () => {
		const trimmed = newProcess.trim();
		if (!trimmed || !config) return;
		const updated = [...config.gamingProcessList, trimmed];
		updateMutation.mutate({ gamingProcessList: updated });
		setNewProcess("");
	};

	const handleRemoveProcess = (process: string) => {
		if (!config) return;
		const updated = config.gamingProcessList.filter((p) => p !== process);
		updateMutation.mutate({ gamingProcessList: updated });
	};

	return (
		<Card className="mb-6">
			<CardContent>
				<h6 className="mb-4 text-base font-semibold">
					Embedding Configuration
				</h6>

				{configQuery.isLoading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-6 animate-spin" />
					</div>
				) : configQuery.error ? (
					<Alert variant="destructive">
						<AlertDescription>
							Failed to load embedding configuration
						</AlertDescription>
					</Alert>
				) : config ? (
					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-3">
							<Switch
								checked={config.deferEmbeddingWhenGaming}
								onCheckedChange={(checked) =>
									updateMutation.mutate({
										deferEmbeddingWhenGaming: checked,
									})
								}
								disabled={updateMutation.isPending}
							/>
							<Label>Defer embedding tasks when gaming</Label>
						</div>
						<p className="-mt-2 text-sm text-[var(--text-secondary)]">
							Pauses CPU-heavy embedding generation while a game is running,
							then resumes automatically when the game exits.
						</p>

						{config.deferEmbeddingWhenGaming && (
							<>
								<Separator />

								<div>
									<h6 className="mb-2 text-sm font-medium">Game Processes</h6>
									<div className="mb-2 flex flex-wrap gap-1">
										{config.gamingProcessList.length === 0 ? (
											<p className="text-sm italic text-[var(--text-secondary)]">
												No processes configured
											</p>
										) : (
											config.gamingProcessList.map((process) => (
												<Badge
													key={process}
													variant="outline"
													className="gap-1"
												>
													{process}
													<button
														type="button"
														onClick={() => handleRemoveProcess(process)}
														className="ml-1 inline-flex items-center"
													>
														<MinusCircle className="size-3" />
													</button>
												</Badge>
											))
										)}
									</div>
									<div className="flex items-center gap-2">
										<Input
											placeholder="e.g. cs2.exe"
											value={newProcess}
											onChange={(e) => setNewProcess(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													handleAddProcess();
												}
											}}
											className="w-[200px]"
										/>
										<Button
											size="sm"
											variant="outline"
											onClick={handleAddProcess}
											disabled={
												!newProcess.trim() || updateMutation.isPending
											}
										>
											<PlusCircle className="size-4" />
											Add
										</Button>
									</div>
								</div>

								<div>
									<h6 className="mb-2 text-sm font-medium">
										Check Interval (minutes)
									</h6>
									<Input
										type="number"
										value={config.gamingCheckIntervalMinutes}
										onChange={(e) => {
											const val = Number.parseInt(e.target.value, 10);
											if (val >= 1) {
												updateMutation.mutate({
													gamingCheckIntervalMinutes: val,
												});
											}
										}}
										min={1}
										max={60}
										className="w-[120px]"
									/>
									<p className="mt-1 text-sm text-[var(--text-secondary)]">
										How often to check if the game has exited
									</p>
								</div>
							</>
						)}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function EmbeddingModelCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();

	const configQuery = useQuery({
		queryKey: ["embedding-model-config"],
		queryFn: () => settingsApi.getEmbeddingModelConfig(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (modelName: string) =>
			settingsApi.updateEmbeddingModelConfig(modelName),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["embedding-model-config"] });
			notify.success("Embedding model updated — will load on next use");
		},
		onError: (error) => {
			notify.error("Failed to update embedding model", getErrorMessage(error));
		},
	});

	if (!isSuperuser && !import.meta.env.DEV) return null;

	const config = configQuery.data;

	return (
		<Card className="mb-6">
			<CardContent>
				<h6 className="mb-4 text-base font-semibold">Embedding Model</h6>
				<p className="mb-4 text-sm text-[var(--text-secondary)]">
					Select the local embedding model for RAG search. All models produce
					768-dim vectors.
				</p>

				{configQuery.isLoading ? (
					<Loader2 className="size-5 animate-spin" />
				) : config ? (
					<div className="flex flex-col gap-3">
						{config.availableModels.map((model) => {
							const isActive = model.hfId === config.currentModel;
							return (
								<div
									key={model.hfId}
									className={`flex cursor-pointer items-center justify-between rounded p-3 transition-colors hover:bg-muted ${
										isActive
											? "border-[1.5px] border-[var(--primary)] bg-muted/50"
											: "border border-border"
									}`}
									onClick={() => {
										if (!isActive) updateMutation.mutate(model.hfId);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !isActive)
											updateMutation.mutate(model.hfId);
									}}
									role="button"
									tabIndex={0}
								>
									<div>
										<span className="text-sm font-medium">
											{model.label}
											{isActive && (
												<Badge className="ml-2">Active</Badge>
											)}
										</span>
										<p className="text-xs text-[var(--text-secondary)]">
											{model.description}
										</p>
									</div>
								</div>
							);
						})}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function ChangePasswordCard() {
	const {
		control,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<ChangePasswordInput>({
		resolver: zodResolver(changePasswordSchema),
		defaultValues: {
			currentPassword: "",
			newPassword: "",
			confirmNewPassword: "",
		},
	});

	const mutation = useMutation({
		mutationFn: (data: ChangePasswordInput) =>
			authApi.changePassword(data.currentPassword, data.newPassword),
		onSuccess: (tokens) => {
			useAuthStore.getState().updateToken(tokens.access_token);
			notify.success("Password changed successfully");
			reset();
		},
		onError: (error) => {
			notify.error("Failed to change password", getErrorMessage(error));
		},
	});

	return (
		<Card className="mb-6">
			<CardContent>
				<h6 className="mb-4 text-base font-semibold">Change Password</h6>

				<div className="flex flex-col gap-4">
					<Controller
						name="currentPassword"
						control={control}
						render={({ field }) => (
							<div className="flex flex-col gap-1">
								<Label htmlFor="currentPassword">Current Password</Label>
								<Input
									{...field}
									id="currentPassword"
									type="password"
									aria-invalid={!!errors.currentPassword}
								/>
								{errors.currentPassword && (
									<p className="text-xs text-destructive">
										{errors.currentPassword.message}
									</p>
								)}
							</div>
						)}
					/>
					<Controller
						name="newPassword"
						control={control}
						render={({ field }) => (
							<div className="flex flex-col gap-1">
								<Label htmlFor="newPassword">New Password</Label>
								<Input
									{...field}
									id="newPassword"
									type="password"
									aria-invalid={!!errors.newPassword}
								/>
								{errors.newPassword && (
									<p className="text-xs text-destructive">
										{errors.newPassword.message}
									</p>
								)}
							</div>
						)}
					/>
					<Controller
						name="confirmNewPassword"
						control={control}
						render={({ field }) => (
							<div className="flex flex-col gap-1">
								<Label htmlFor="confirmNewPassword">
									Confirm New Password
								</Label>
								<Input
									{...field}
									id="confirmNewPassword"
									type="password"
									aria-invalid={!!errors.confirmNewPassword}
								/>
								{errors.confirmNewPassword && (
									<p className="text-xs text-destructive">
										{errors.confirmNewPassword.message}
									</p>
								)}
							</div>
						)}
					/>
					<Button
						variant="outline"
						disabled={mutation.isPending}
						className="self-start"
						onClick={handleSubmit((data) => mutation.mutate(data))}
					>
						{mutation.isPending ? "Changing..." : "Change Password"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function AuthConfigCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [expireInput, setExpireInput] = useState<number | "">("");

	const configQuery = useQuery({
		queryKey: ["auth-config"],
		queryFn: () => settingsApi.getAuthConfig(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: AuthConfigUpdate) =>
			settingsApi.updateAuthConfig(update),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["auth-config"] });
			notify.success("Token expiry updated");
			setExpireInput("");
		},
		onError: (error) => {
			notify.error("Failed to update token expiry", getErrorMessage(error));
		},
	});

	if (!isSuperuser && !import.meta.env.DEV) return null;

	const config = configQuery.data;

	const handleSave = () => {
		if (expireInput === "") return;
		updateMutation.mutate({ accessTokenExpireMinutes: expireInput });
	};

	const formatExpiry = (minutes: number): string => {
		if (minutes === 0) return "Never (no expiry)";
		if (minutes < 60) return `${minutes} minutes`;
		if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hours`;
		return `${(minutes / 1440).toFixed(1)} days`;
	};

	return (
		<Card className="mb-6">
			<CardContent>
				<h6 className="mb-4 text-base font-semibold">Token Expiry</h6>

				{configQuery.isLoading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-6 animate-spin" />
					</div>
				) : configQuery.error ? (
					<Alert variant="destructive">
						<AlertDescription>
							Failed to load auth configuration
						</AlertDescription>
					</Alert>
				) : config ? (
					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-3">
							<span className="text-sm font-medium">Current:</span>
							<Badge
								variant={
									config.accessTokenExpireMinutes > 0 ? "default" : "outline"
								}
								className={
									config.accessTokenExpireMinutes > 0
										? "bg-green-500/10 text-green-500"
										: ""
								}
							>
								{formatExpiry(config.accessTokenExpireMinutes)}
							</Badge>
						</div>

						<div className="flex items-center gap-3">
							<div className="flex flex-col gap-1">
								<Label>Expire after (minutes)</Label>
								<Input
									type="number"
									value={expireInput}
									onChange={(e) => {
										const val = e.target.value;
										setExpireInput(val === "" ? "" : Number(val));
									}}
									min={0}
									className="w-[200px]"
								/>
							</div>
							<Button
								variant="outline"
								onClick={handleSave}
								disabled={expireInput === "" || updateMutation.isPending}
								className="mt-auto"
							>
								Save
							</Button>
						</div>

						<p className="text-sm text-[var(--text-secondary)]">
							0 = never expire. Common values: 60 (1h), 1440 (1 day), 10080 (7
							days)
						</p>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function SessionRetentionCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [daysInput, setDaysInput] = useState<number | "">("");

	const configQuery = useQuery({
		queryKey: ["session-retention-config"],
		queryFn: () => settingsApi.getSessionRetentionConfig(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: SessionRetentionConfigUpdate) =>
			settingsApi.updateSessionRetentionConfig(update),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["session-retention-config"],
			});
			notify.success("Session retention updated");
			setDaysInput("");
		},
		onError: (error) => {
			notify.error(
				"Failed to update session retention",
				getErrorMessage(error),
			);
		},
	});

	if (!isSuperuser && !import.meta.env.DEV) return null;

	const config = configQuery.data;

	const handleSave = () => {
		if (daysInput === "") return;
		updateMutation.mutate({ sessionRetentionDays: daysInput });
	};

	const formatRetention = (days: number): string => {
		if (days === 0) return "Keep forever";
		if (days === 1) return "1 day";
		return `${days} days`;
	};

	return (
		<Card className="mb-6">
			<CardContent>
				<h6 className="mb-4 text-base font-semibold">Session Retention</h6>

				{configQuery.isLoading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-6 animate-spin" />
					</div>
				) : configQuery.error ? (
					<Alert variant="destructive">
						<AlertDescription>
							Failed to load session retention config
						</AlertDescription>
					</Alert>
				) : config ? (
					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-3">
							<span className="text-sm font-medium">Current:</span>
							<Badge
								variant={
									config.sessionRetentionDays > 0 ? "default" : "outline"
								}
								className={
									config.sessionRetentionDays > 0
										? "bg-green-500/10 text-green-500"
										: ""
								}
							>
								{formatRetention(config.sessionRetentionDays)}
							</Badge>
						</div>

						<div className="flex items-center gap-3">
							<div className="flex flex-col gap-1">
								<Label>Retention (days)</Label>
								<Input
									type="number"
									value={daysInput}
									onChange={(e) => {
										const val = e.target.value;
										setDaysInput(val === "" ? "" : Number(val));
									}}
									min={0}
									className="w-[200px]"
								/>
							</div>
							<Button
								variant="outline"
								onClick={handleSave}
								disabled={daysInput === "" || updateMutation.isPending}
								className="mt-auto"
							>
								Save
							</Button>
						</div>

						<p className="text-sm text-[var(--text-secondary)]">
							0 = keep forever. Chat sessions older than this will be
							automatically deleted.
						</p>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function ExchangeConfigCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [apiKeyInput, setApiKeyInput] = useState("");
	const [secretKeyInput, setSecretKeyInput] = useState("");
	const [passphraseInput, setPassphraseInput] = useState("");
	const [showCredentials, setShowCredentials] = useState(false);
	const [credentialsLoaded, setCredentialsLoaded] = useState(false);
	const [testResult, setTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);

	const configQuery = useQuery({
		queryKey: ["exchange-config"],
		queryFn: () => settingsApi.getExchangeConfig(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: ExchangeConfigUpdate) =>
			settingsApi.updateExchangeConfig(update),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["exchange-config"] });
			queryClient.resetQueries({ queryKey: ["market"] });
			notify.success("Exchange configuration updated");
			setTestResult(null);

			if (
				variables.apiKey !== undefined ||
				variables.secretKey !== undefined ||
				variables.passphrase !== undefined
			) {
				setCredentialsLoaded(false);
				setShowCredentials(false);
				setApiKeyInput("");
				setSecretKeyInput("");
				setPassphraseInput("");
			}
		},
		onError: (error) => {
			notify.error(
				"Failed to update exchange configuration",
				getErrorMessage(error),
			);
		},
	});

	const revealMutation = useMutation({
		mutationFn: () => settingsApi.revealExchangeCredentials(),
		onSuccess: (data) => {
			setApiKeyInput(data.apiKey);
			setSecretKeyInput(data.secretKey);
			setPassphraseInput(data.passphrase);
			setCredentialsLoaded(true);
			setShowCredentials(true);
		},
		onError: (error) => {
			notify.error("Failed to reveal credentials", getErrorMessage(error));
		},
	});

	const handleToggleVisibility = () => {
		if (showCredentials) {
			setShowCredentials(false);
			setCredentialsLoaded(false);
			setApiKeyInput("");
			setSecretKeyInput("");
			setPassphraseInput("");
		} else if (!credentialsLoaded && config?.hasApiKey) {
			revealMutation.mutate();
		} else {
			setShowCredentials(true);
		}
	};

	const testMutation = useMutation({
		mutationFn: () =>
			Sentry.startSpan(
				{ name: "exchange.test_connection", op: "ui.action" },
				() => settingsApi.testExchangeConnection(),
			),
		onSuccess: (result) => {
			setTestResult(result);
			if (result.success) {
				notify.success(result.message);
			} else {
				notify.error(result.message);
			}
		},
		onError: () => {
			setTestResult({ success: false, message: "Test request failed" });
		},
	});

	if (!isSuperuser && !import.meta.env.DEV) return null;

	const config = configQuery.data;

	const handleSaveCredentials = () => {
		const update: ExchangeConfigUpdate = {};
		if (apiKeyInput.trim()) update.apiKey = apiKeyInput.trim();
		if (secretKeyInput.trim()) update.secretKey = secretKeyInput.trim();
		if (passphraseInput.trim()) update.passphrase = passphraseInput.trim();
		if (Object.keys(update).length > 0) {
			updateMutation.mutate(update);
		}
	};

	const handleClearCredentials = () => {
		updateMutation.mutate({ apiKey: "", secretKey: "", passphrase: "" });
		setApiKeyInput("");
		setSecretKeyInput("");
		setPassphraseInput("");
		setCredentialsLoaded(false);
		setShowCredentials(false);
	};

	const handleSandboxChange = (checked: boolean) => {
		updateMutation.mutate({ sandbox: checked });
	};

	return (
		<Card className="mb-6">
			<CardContent>
				<h6 className="mb-4 text-base font-semibold">
					OKX Exchange Configuration
				</h6>

				{configQuery.isLoading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-6 animate-spin" />
					</div>
				) : configQuery.error ? (
					<Alert variant="destructive">
						<AlertDescription>
							Failed to load exchange configuration
						</AlertDescription>
					</Alert>
				) : config ? (
					<div className="flex flex-col gap-6">
						{/* Current Status */}
						<div className="flex items-center gap-3">
							<span className="text-sm font-medium">Status</span>
							<Badge
								variant="outline"
								className={
									config.hasApiKey &&
									config.hasSecretKey &&
									config.hasPassphrase
										? "border-green-500/50 text-green-500"
										: "border-yellow-500/50 text-yellow-500"
								}
							>
								{config.hasApiKey &&
								config.hasSecretKey &&
								config.hasPassphrase ? (
									<>
										<CheckCircle className="mr-1 size-3" />
										Configured
									</>
								) : (
									<>
										<AlertCircle className="mr-1 size-3" />
										Not Configured
									</>
								)}
							</Badge>
						</div>

						{/* API Credentials */}
						<div>
							<h6 className="mb-2 text-sm font-medium">API Credentials</h6>
							<div className="flex flex-col gap-3">
								<div className="relative">
									<Input
										type="text"
										placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
										value={
											apiKeyInput ||
											(!credentialsLoaded && config.hasApiKey
												? config.maskedApiKey
												: "")
										}
										onChange={(e) => setApiKeyInput(e.target.value)}
										onFocus={() => {
											if (
												!credentialsLoaded &&
												config.hasApiKey &&
												!apiKeyInput
											) {
												revealMutation.mutate();
											}
										}}
									/>
									<button
										type="button"
										className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-secondary)] hover:text-foreground"
										aria-label="Toggle credential visibility"
										onClick={handleToggleVisibility}
										disabled={revealMutation.isPending}
									>
										{revealMutation.isPending ? (
											<Loader2 className="size-4 animate-spin" />
										) : showCredentials ? (
											<EyeOff className="size-4" />
										) : (
											<Eye className="size-4" />
										)}
									</button>
								</div>
								<Input
									type="text"
									placeholder="Your OKX secret key"
									value={
										secretKeyInput ||
										(!credentialsLoaded && config.hasSecretKey
											? config.maskedSecretKey
											: "")
									}
									onChange={(e) => setSecretKeyInput(e.target.value)}
									onFocus={() => {
										if (
											!credentialsLoaded &&
											config.hasSecretKey &&
											!secretKeyInput
										) {
											revealMutation.mutate();
										}
									}}
								/>
								<Input
									type="text"
									placeholder="Your OKX passphrase"
									value={
										passphraseInput ||
										(!credentialsLoaded && config.hasPassphrase
											? "••••••••"
											: "")
									}
									onChange={(e) => setPassphraseInput(e.target.value)}
									onFocus={() => {
										if (
											!credentialsLoaded &&
											config.hasPassphrase &&
											!passphraseInput
										) {
											revealMutation.mutate();
										}
									}}
								/>
								<div className="flex gap-2">
									<Button
										variant="outline"
										onClick={handleSaveCredentials}
										disabled={
											(!apiKeyInput.trim() &&
												!secretKeyInput.trim() &&
												!passphraseInput.trim()) ||
											updateMutation.isPending
										}
									>
										Save
									</Button>
									{config.hasApiKey && (
										<Button
											size="sm"
											variant="destructive"
											onClick={handleClearCredentials}
										>
											Clear All
										</Button>
									)}
								</div>
							</div>
						</div>

						{/* Sandbox Toggle */}
						<div>
							<div className="flex items-center gap-3">
								<Switch
									checked={config.sandbox}
									onCheckedChange={handleSandboxChange}
									disabled={updateMutation.isPending}
								/>
								<Label>Sandbox Mode (Read-Only)</Label>
							</div>
							<p className="mt-1 text-sm text-[var(--text-secondary)]">
								{config.sandbox
									? "Trading is disabled — agent can only track and suggest"
									: "Trading is enabled — agent can execute real orders"}
							</p>
						</div>

						{/* Test Connection */}
						<div>
							<Button
								variant="outline"
								onClick={() => testMutation.mutate()}
								disabled={testMutation.isPending}
							>
								{testMutation.isPending ? (
									<Loader2 className="mr-2 size-4 animate-spin" />
								) : (
									<Play className="mr-2 size-4" />
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
									<AlertDescription>{testResult.message}</AlertDescription>
								</Alert>
							)}
						</div>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function SettingsPage() {
	const { user } = useAuth();
	const isSuperuser = user?.isSuperuser ?? false;
	const [settingsTab, setSettingsTab] = useState(0);
	const { reducedMotion, setReducedMotion, effectsEnabled, setEffectsEnabled } =
		useUIStore();

	const {
		control,
		handleSubmit,
		formState: { errors, isDirty },
	} = useForm<SettingsInput>({
		resolver: zodResolver(settingsSchema),
		defaultValues: {
			email: user?.email || "",
			username: user?.username || "",
			defaultSymbol: "BTC-USDT",
			defaultTimeframe: "1h",
			notifications: {
				email: true,
				push: false,
				orderFilled: true,
				priceAlerts: true,
				newsAlerts: false,
			},
		},
	});

	const onSubmit = async (data: SettingsInput) => {
		try {
			console.log("Saving settings:", data);
			notify.success("Settings saved");
		} catch {
			notify.error("Failed to save settings");
		}
	};

	return (
		<PageTransition pageKey="settings">
			<div className="mx-auto max-w-[800px]">
				<SectionHeader
					title="Settings"
					subtitle="Configure your account, agent, and application preferences"
				/>

				<Tabs
					value={settingsTab}
					onValueChange={(v) => setSettingsTab(v as number)}
					className="mb-6"
				>
					<TabsList variant="line" className="border-b border-border">
						<TabsTrigger value={0}>Profile</TabsTrigger>
						<TabsTrigger value={1}>Agent & Exchange</TabsTrigger>
						<TabsTrigger value={2}>Appearance</TabsTrigger>
						{isSuperuser && <TabsTrigger value={3}>Admin</TabsTrigger>}
					</TabsList>

					{/* Tab 0: Profile */}
					<TabsContent value={0}>
						<form onSubmit={handleSubmit(onSubmit)}>
							{/* Profile Settings */}
							<Card className="mb-6">
								<CardContent>
									<h6 className="mb-4 text-base font-semibold">Profile</h6>

									<div className="grid grid-cols-12 gap-6">
										<div className="col-span-12 sm:col-span-6">
											<Controller
												name="email"
												control={control}
												render={({ field }) => (
													<div className="flex flex-col gap-1">
														<Label htmlFor="email">Email</Label>
														<Input
															{...field}
															id="email"
															aria-invalid={!!errors.email}
														/>
														{errors.email && (
															<p className="text-xs text-destructive">
																{errors.email.message}
															</p>
														)}
													</div>
												)}
											/>
										</div>
										<div className="col-span-12 sm:col-span-6">
											<Controller
												name="username"
												control={control}
												render={({ field }) => (
													<div className="flex flex-col gap-1">
														<Label htmlFor="username">Username</Label>
														<Input
															{...field}
															id="username"
															aria-invalid={!!errors.username}
														/>
														{errors.username && (
															<p className="text-xs text-destructive">
																{errors.username.message}
															</p>
														)}
													</div>
												)}
											/>
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Trading Preferences */}
							<Card className="mb-6">
								<CardContent>
									<h6 className="mb-4 text-base font-semibold">
										Trading Preferences
									</h6>

									<div className="grid grid-cols-12 gap-6">
										<div className="col-span-12 sm:col-span-6">
											<Controller
												name="defaultSymbol"
												control={control}
												render={({ field }) => (
													<div className="flex flex-col gap-1">
														<Label htmlFor="defaultSymbol">
															Default Symbol
														</Label>
														<Input {...field} id="defaultSymbol" />
														<p className="text-xs text-[var(--text-secondary)]">
															Default trading pair to load
														</p>
													</div>
												)}
											/>
										</div>
										<div className="col-span-12 sm:col-span-6">
											<Controller
												name="defaultTimeframe"
												control={control}
												render={({ field }) => (
													<div className="flex flex-col gap-1">
														<Label htmlFor="defaultTimeframe">
															Default Timeframe
														</Label>
														<Input {...field} id="defaultTimeframe" />
														<p className="text-xs text-[var(--text-secondary)]">
															Default chart timeframe
														</p>
													</div>
												)}
											/>
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Notification Settings */}
							<Card className="mb-6">
								<CardContent>
									<h6 className="mb-4 text-base font-semibold">
										Notifications
									</h6>

									<div className="flex flex-col gap-2">
										<Controller
											name="notifications.email"
											control={control}
											render={({ field }) => (
												<div className="flex items-center gap-3">
													<Switch
														checked={field.value}
														onCheckedChange={field.onChange}
													/>
													<Label>Email notifications</Label>
												</div>
											)}
										/>
										<Controller
											name="notifications.push"
											control={control}
											render={({ field }) => (
												<div className="flex items-center gap-3">
													<Switch
														checked={field.value}
														onCheckedChange={field.onChange}
													/>
													<Label>Push notifications</Label>
												</div>
											)}
										/>
										<Separator className="my-2" />
										<Controller
											name="notifications.orderFilled"
											control={control}
											render={({ field }) => (
												<div className="flex items-center gap-3">
													<Switch
														checked={field.value}
														onCheckedChange={field.onChange}
													/>
													<Label>Order filled alerts</Label>
												</div>
											)}
										/>
										<Controller
											name="notifications.priceAlerts"
											control={control}
											render={({ field }) => (
												<div className="flex items-center gap-3">
													<Switch
														checked={field.value}
														onCheckedChange={field.onChange}
													/>
													<Label>Price alerts</Label>
												</div>
											)}
										/>
										<Controller
											name="notifications.newsAlerts"
											control={control}
											render={({ field }) => (
												<div className="flex items-center gap-3">
													<Switch
														checked={field.value}
														onCheckedChange={field.onChange}
													/>
													<Label>News alerts</Label>
												</div>
											)}
										/>
									</div>
								</CardContent>
							</Card>

							{/* Change Password */}
							<ChangePasswordCard />

							{/* Save Button */}
							<div className="flex justify-end">
								<Button type="submit" size="lg" disabled={!isDirty}>
									Save Changes
								</Button>
							</div>
						</form>
					</TabsContent>

					{/* Tab 1: Agent & Exchange */}
					<TabsContent value={1}>
						<AgentConfigPanel variant="card" showThinkingBudget={true} />
						<ExchangeConfigCard />
						<AuthConfigCard />
						<SessionRetentionCard />
					</TabsContent>

					{/* Tab 2: Appearance */}
					<TabsContent value={2}>
						<Card>
							<CardContent>
								<h6 className="mb-4 text-base font-semibold">Appearance</h6>

								{/* Theme Selector */}
								<div className="mb-6">
									<span className="mb-2 block text-sm font-medium">
										Theme
									</span>
									<ThemeSelector />
								</div>

								{/* Reduced Motion */}
								<div className="mb-4 flex items-center justify-between">
									<div>
										<p className="text-sm">Reduced Motion</p>
										<p className="text-xs text-[var(--text-secondary)]">
											Minimize animations for accessibility
										</p>
									</div>
									<Switch
										checked={reducedMotion}
										onCheckedChange={setReducedMotion}
									/>
								</div>

								{/* Effects */}
								<div className="mb-4 flex items-center justify-between">
									<div>
										<p className="text-sm">Background Effects</p>
										<p className="text-xs text-[var(--text-secondary)]">
											Mesh blobs, particle grid, cursor glow
										</p>
									</div>
									<Switch
										checked={effectsEnabled}
										onCheckedChange={setEffectsEnabled}
									/>
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					{/* Tab 3: Admin (superuser only) */}
					{isSuperuser && (
						<TabsContent value={3}>
							<EmbeddingModelCard />
							<EmbeddingConfigCard />
						</TabsContent>
					)}
				</Tabs>
			</div>
		</PageTransition>
	);
}
