/**
 * Chat Input Component — Claude.ai-style unified input card
 * Model/thinking config inline, quick actions as pills below.
 */

import AddIcon from "@mui/icons-material/Add";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import SendIcon from "@mui/icons-material/Send";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import StopIcon from "@mui/icons-material/Stop";
import TuneIcon from "@mui/icons-material/Tune";
import {
	Box,
	Button,
	CircularProgress,
	Divider,
	IconButton,
	LinearProgress,
	Menu,
	MenuItem,
	Tooltip,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type ChangeEvent,
	type KeyboardEvent,
	useCallback,
	useState,
} from "react";
import type { AgentConfig, AgentConfigUpdate } from "@/api/endpoints/settings";
import { settingsApi } from "@/api/endpoints/settings";
import { agentConfigQueryOptions } from "@/api/queryOptions/agent";
import { useZoomAwareMenu } from "@/hooks/useZoomAwareMenu";

/** Capitalize first letter for display */
function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Map model value to short display label */
function modelDisplayLabel(model: string): string {
	if (model.includes("opus")) return "Opus";
	if (model.includes("sonnet")) return "Sonnet";
	if (model.includes("haiku")) return "Haiku";
	return capitalize(model);
}

/** Dot color per model family */
function modelDotColor(model: string): string {
	if (model.includes("opus")) return "#c084fc";
	if (model.includes("sonnet")) return "#f59e0b";
	if (model.includes("haiku")) return "#22d3ee";
	return "#a78bfa";
}

/** Dot color per thinking mode */
function thinkingDotColor(mode: string): string {
	if (mode === "adaptive") return "#34d399";
	if (mode === "enabled") return "#60a5fa";
	return "#94a3b8";
}

/** Dot color per effort level */
function effortDotColor(effort: string): string {
	if (effort === "max") return "#f43f5e";
	if (effort === "high") return "#f59e0b";
	if (effort === "medium") return "#3b82f6";
	return "#94a3b8";
}

/** Context window size per model family (approximate) */
function contextWindowSize(model: string): number {
	if (model.includes("opus")) return 200_000;
	if (model.includes("sonnet")) return 200_000;
	if (model.includes("haiku")) return 200_000;
	return 200_000;
}

interface ChatInputProps {
	onSendMessage: (message: string) => void;
	onRequestAnalysis?: (symbol?: string) => void;
	onRequestRecommendation?: () => void;
	onRequestStrategyReview?: () => void;
	onCancel?: () => void;
	isThinking?: boolean;
	isCancelling?: boolean;
	disabled?: boolean;
	/** Total tokens used in the current session (for context bar) */
	totalTokens?: number;
}

export function ChatInput({
	onSendMessage,
	onRequestAnalysis,
	onRequestRecommendation,
	onRequestStrategyReview,
	onCancel,
	isThinking = false,
	isCancelling = false,
	disabled = false,
	totalTokens = 0,
}: ChatInputProps) {
	const [message, setMessage] = useState("");
	const queryClient = useQueryClient();

	// Fetch agent config for model/thinking selectors
	const configQuery = useQuery(agentConfigQueryOptions());
	const config = configQuery.data;

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
			const prev = queryClient.getQueryData<AgentConfig>(["agent-config"]);
			if (prev) {
				queryClient.setQueryData<AgentConfig>(["agent-config"], {
					...prev,
					...(update.model !== undefined ? { model: update.model } : {}),
					...(update.thinkingMode !== undefined
						? { thinkingMode: update.thinkingMode }
						: {}),
					...(update.effort !== undefined ? { effort: update.effort } : {}),
				});
			}
			return { prev };
		},
		onSuccess: (data) => {
			queryClient.setQueryData<AgentConfig>(["agent-config"], data);
		},
		onError: (_, __, ctx) => {
			if (ctx?.prev) {
				queryClient.setQueryData(["agent-config"], ctx.prev);
			}
		},
	});

	// Model menu (zoom-aware)
	const {
		anchorRef: modelRef,
		open: modelOpen,
		handleOpen: handleModelOpen,
		handleClose: handleModelClose,
		menuProps: modelMenuProps,
	} = useZoomAwareMenu();

	// Thinking mode menu (zoom-aware)
	const {
		anchorRef: thinkingRef,
		open: thinkingOpen,
		handleOpen: handleThinkingOpen,
		handleClose: handleThinkingClose,
		menuProps: thinkingMenuProps,
	} = useZoomAwareMenu();

	// Effort level menu (zoom-aware)
	const {
		anchorRef: effortRef,
		open: effortOpen,
		handleOpen: handleEffortOpen,
		handleClose: handleEffortClose,
		menuProps: effortMenuProps,
	} = useZoomAwareMenu();

	const handleSend = useCallback(() => {
		if (message.trim() && !isThinking && !disabled) {
			onSendMessage(message.trim());
			setMessage("");
		}
	}, [message, isThinking, disabled, onSendMessage]);

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleModelSelect = (value: string) => {
		updateMutation.mutate({ model: value });
		handleModelClose();
	};

	const handleThinkingSelect = (value: string) => {
		updateMutation.mutate({ thinkingMode: value });
		handleThinkingClose();
	};

	const handleEffortSelect = (value: string) => {
		updateMutation.mutate({ effort: value });
		handleEffortClose();
	};

	// Derived display values
	const currentModel = config?.model ?? "sonnet";
	const currentThinking = config?.thinkingMode ?? "adaptive";
	const currentEffort = config?.effort ?? "high";
	const contextMax = contextWindowSize(currentModel);
	const contextUsed = totalTokens;
	const contextPercent = contextMax > 0 ? (contextUsed / contextMax) * 100 : 0;

	const resolvedModelOptions = (() => {
		const fetched = modelOptionsQuery.data ?? [];
		if (config && !fetched.some((opt) => opt.value === config.model)) {
			return [{ value: config.model, label: config.model }, ...fetched];
		}
		return fetched;
	})();

	const thinkingOptions = [
		{ value: "adaptive", label: "Adaptive" },
		{ value: "enabled", label: "Enabled" },
		{ value: "disabled", label: "Disabled" },
	];

	const effortOptions = [
		{ value: "low", label: "Low" },
		{ value: "medium", label: "Medium" },
		{ value: "high", label: "High" },
		{ value: "max", label: "Max" },
	];

	return (
		<Box>
			{/* Glassmorphic input card */}
			<Box
				sx={{
					bgcolor: "rgba(255,255,255,0.05)",
					border: "1px solid rgba(255,255,255,0.1)",
					borderRadius: "16px",
					overflow: "hidden",
					transition: "border-color 0.2s",
					"&:focus-within": {
						borderColor: "primary.main",
					},
				}}
			>
				{/* Text input area */}
				<Box
					component="textarea"
					value={message}
					onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
						setMessage(e.target.value)
					}
					onKeyDown={handleKeyDown}
					disabled={isThinking || disabled}
					placeholder={
						isThinking ? "Agent is thinking..." : "Ask the trading agent..."
					}
					rows={1}
					sx={{
						width: "100%",
						border: "none",
						outline: "none",
						bgcolor: "transparent",
						color: "text.primary",
						fontSize: "0.95rem",
						fontFamily: "inherit",
						resize: "none",
						p: 2,
						pb: 1,
						minHeight: 44,
						maxHeight: 120,
						overflow: "auto",
						"&::placeholder": {
							color: "text.secondary",
							opacity: 0.7,
						},
						"&:disabled": {
							opacity: 0.5,
						},
					}}
				/>

				{/* Bottom toolbar row */}
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						px: 1.5,
						pb: 1.5,
						pt: 0.5,
						gap: 1,
					}}
				>
					{/* Left side: attach + separators + model + thinking */}
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 0.5,
							minWidth: 0,
							overflow: "hidden",
						}}
					>
						{/* + attach placeholder */}
						<Tooltip title="Attach (coming soon)">
							<span>
								<IconButton
									size="small"
									disabled
									sx={{
										width: 32,
										height: 32,
										color: "text.secondary",
									}}
								>
									<AddIcon fontSize="small" />
								</IconButton>
							</span>
						</Tooltip>

						<Divider
							orientation="vertical"
							flexItem
							sx={{ mx: 0.25, height: 20, alignSelf: "center" }}
						/>

						{/* Model selector */}
						<Box ref={modelRef}>
							<Button
								size="small"
								onClick={handleModelOpen}
								disabled={updateMutation.isPending}
								sx={{
									textTransform: "none",
									color: "text.primary",
									minWidth: 0,
									px: 1,
									py: 0.5,
									borderRadius: "8px",
									fontSize: "0.8rem",
									fontWeight: 500,
									gap: 0.75,
									"&:hover": {
										bgcolor: "action.hover",
									},
								}}
							>
								<Box
									sx={{
										width: 8,
										height: 8,
										borderRadius: "50%",
										bgcolor: modelDotColor(currentModel),
										flexShrink: 0,
									}}
								/>
								{modelDisplayLabel(currentModel)}
							</Button>
						</Box>

						<Menu
							open={modelOpen}
							onClose={handleModelClose}
							{...modelMenuProps}
						>
							{resolvedModelOptions.map((opt) => (
								<MenuItem
									key={opt.value}
									selected={opt.value === currentModel}
									onClick={() => handleModelSelect(opt.value)}
								>
									<Box
										sx={{
											display: "flex",
											alignItems: "center",
											gap: 1,
										}}
									>
										<Box
											sx={{
												width: 8,
												height: 8,
												borderRadius: "50%",
												bgcolor: modelDotColor(opt.value),
												flexShrink: 0,
											}}
										/>
										{opt.label}
									</Box>
								</MenuItem>
							))}
						</Menu>

						{/* Thinking mode selector */}
						<Box ref={thinkingRef}>
							<Button
								size="small"
								onClick={handleThinkingOpen}
								disabled={updateMutation.isPending}
								endIcon={
									<KeyboardArrowDownIcon sx={{ fontSize: "16px !important" }} />
								}
								sx={{
									textTransform: "none",
									color: "text.primary",
									minWidth: 0,
									px: 1,
									py: 0.5,
									borderRadius: "8px",
									fontSize: "0.8rem",
									fontWeight: 500,
									gap: 0.75,
									"&:hover": {
										bgcolor: "action.hover",
									},
								}}
							>
								<Box
									sx={{
										width: 8,
										height: 8,
										borderRadius: "50%",
										bgcolor: thinkingDotColor(currentThinking),
										flexShrink: 0,
									}}
								/>
								{capitalize(currentThinking)}
							</Button>
						</Box>

						<Menu
							open={thinkingOpen}
							onClose={handleThinkingClose}
							{...thinkingMenuProps}
						>
							{thinkingOptions.map((opt) => (
								<MenuItem
									key={opt.value}
									selected={opt.value === currentThinking}
									onClick={() => handleThinkingSelect(opt.value)}
								>
									<Box
										sx={{
											display: "flex",
											alignItems: "center",
											gap: 1,
										}}
									>
										<Box
											sx={{
												width: 8,
												height: 8,
												borderRadius: "50%",
												bgcolor: thinkingDotColor(opt.value),
												flexShrink: 0,
											}}
										/>
										{opt.label}
									</Box>
								</MenuItem>
							))}
						</Menu>

						{/* Effort level selector */}
						<Box ref={effortRef}>
							<Button
								size="small"
								onClick={handleEffortOpen}
								disabled={updateMutation.isPending}
								sx={{
									textTransform: "none",
									color: "text.primary",
									minWidth: 0,
									px: 1,
									py: 0.5,
									borderRadius: "8px",
									fontSize: "0.8rem",
									fontWeight: 500,
									gap: 0.75,
									"&:hover": {
										bgcolor: "action.hover",
									},
								}}
							>
								<Box
									sx={{
										width: 8,
										height: 8,
										borderRadius: "50%",
										bgcolor: effortDotColor(currentEffort),
										flexShrink: 0,
									}}
								/>
								{capitalize(currentEffort)}
							</Button>
						</Box>

						<Menu
							open={effortOpen}
							onClose={handleEffortClose}
							{...effortMenuProps}
						>
							{effortOptions.map((opt) => (
								<MenuItem
									key={opt.value}
									selected={opt.value === currentEffort}
									onClick={() => handleEffortSelect(opt.value)}
								>
									<Box
										sx={{
											display: "flex",
											alignItems: "center",
											gap: 1,
										}}
									>
										<Box
											sx={{
												width: 8,
												height: 8,
												borderRadius: "50%",
												bgcolor: effortDotColor(opt.value),
												flexShrink: 0,
											}}
										/>
										{opt.label}
									</Box>
								</MenuItem>
							))}
						</Menu>
					</Box>

					{/* Right side: context bar + send */}
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 1,
							flexShrink: 0,
						}}
					>
						{/* Context usage bar */}
						{contextUsed > 0 && (
							<Tooltip
								title={`${contextUsed.toLocaleString()} / ${contextMax.toLocaleString()} tokens used`}
							>
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 0.75,
										mr: 0.5,
									}}
								>
									<LinearProgress
										variant="determinate"
										value={Math.min(contextPercent, 100)}
										sx={{
											width: 48,
											height: 4,
											borderRadius: 2,
											bgcolor: "rgba(255,255,255,0.08)",
											"& .MuiLinearProgress-bar": {
												borderRadius: 2,
												bgcolor:
													contextPercent > 80 ? "warning.main" : "primary.main",
											},
										}}
									/>
									<Typography
										variant="caption"
										color="text.secondary"
										sx={{
											fontSize: "0.8rem",
											whiteSpace: "nowrap",
										}}
									>
										{contextUsed >= 1000
											? `${Math.round(contextUsed / 1000)}k`
											: contextUsed}
										{" / "}
										{`${Math.round(contextMax / 1000)}k`}
									</Typography>
								</Box>
							</Tooltip>
						)}

						{/* Send / Cancel button */}
						{isThinking ? (
							<Tooltip
								title={isCancelling ? "Cancelling..." : "Stop generation"}
							>
								<span>
									<IconButton
										color="error"
										onClick={onCancel}
										disabled={isCancelling || !onCancel}
										size="small"
										sx={{
											bgcolor: "error.main",
											color: "white",
											width: 34,
											height: 34,
											"&:hover": { bgcolor: "error.dark" },
											"&.Mui-disabled": {
												bgcolor: "action.disabledBackground",
											},
										}}
									>
										{isCancelling ? (
											<CircularProgress size={18} color="inherit" />
										) : (
											<StopIcon fontSize="small" />
										)}
									</IconButton>
								</span>
							</Tooltip>
						) : (
							<IconButton
								color="primary"
								onClick={handleSend}
								disabled={!message.trim() || disabled}
								size="small"
								sx={{
									bgcolor: "primary.main",
									color: "white",
									width: 34,
									height: 34,
									"&:hover": { bgcolor: "primary.dark" },
									"&.Mui-disabled": {
										bgcolor: "action.disabledBackground",
									},
								}}
							>
								<SendIcon sx={{ fontSize: 18 }} />
							</IconButton>
						)}
					</Box>
				</Box>
			</Box>

			{/* Quick action pills — below the card */}
			<Box
				sx={{
					display: "flex",
					gap: 1,
					mt: 1.5,
					flexWrap: "wrap",
				}}
			>
				{onRequestAnalysis && (
					<Button
						size="small"
						variant="outlined"
						startIcon={<ShowChartIcon sx={{ fontSize: "16px !important" }} />}
						onClick={() => onRequestAnalysis()}
						disabled={isThinking || disabled}
						sx={{
							borderRadius: 999,
							textTransform: "none",
							fontSize: "0.75rem",
							px: 1.5,
							py: 0.25,
							borderColor: "divider",
							color: "text.secondary",
							"&:hover": {
								borderColor: "primary.main",
								color: "primary.main",
								bgcolor: "action.hover",
							},
						}}
					>
						Analyze
					</Button>
				)}
				{onRequestRecommendation && (
					<Button
						size="small"
						variant="outlined"
						startIcon={<LightbulbIcon sx={{ fontSize: "16px !important" }} />}
						onClick={onRequestRecommendation}
						disabled={isThinking || disabled}
						sx={{
							borderRadius: 999,
							textTransform: "none",
							fontSize: "0.75rem",
							px: 1.5,
							py: 0.25,
							borderColor: "divider",
							color: "text.secondary",
							"&:hover": {
								borderColor: "primary.main",
								color: "primary.main",
								bgcolor: "action.hover",
							},
						}}
					>
						Recommend
					</Button>
				)}
				{onRequestStrategyReview && (
					<Button
						size="small"
						variant="outlined"
						startIcon={<TuneIcon sx={{ fontSize: "16px !important" }} />}
						onClick={onRequestStrategyReview}
						disabled={isThinking || disabled}
						sx={{
							borderRadius: 999,
							textTransform: "none",
							fontSize: "0.75rem",
							px: 1.5,
							py: 0.25,
							borderColor: "divider",
							color: "text.secondary",
							"&:hover": {
								borderColor: "primary.main",
								color: "primary.main",
								bgcolor: "action.hover",
							},
						}}
					>
						Strategies
					</Button>
				)}
			</Box>
		</Box>
	);
}

export default ChatInput;
