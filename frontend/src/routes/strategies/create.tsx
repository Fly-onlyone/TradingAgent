/**
 * Create Strategy Page — Manual, URL Import, or File Upload
 */

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import LinkIcon from "@mui/icons-material/Link";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	IconButton,
	Tab,
	Tabs,
	TextField,
	Typography,
} from "@mui/material";
import * as Sentry from "@sentry/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { strategiesApi } from "@/api/endpoints/strategies";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { notify } from "@/store/uiStore";
import type { ExtractedStrategy, StrategyImportConfirm } from "@/types";
import { requireAuth } from "../-guards";

export const Route = createFileRoute("/strategies/create")({
	beforeLoad: requireAuth,
	component: CreateStrategyPage,
});

const ALLOWED_EXTENSIONS = ".txt,.json,.yaml,.yml,.pdf";

const EMPTY_FORM: StrategyImportConfirm = {
	name: "",
	description: "",
	entryRules: {},
	exitRules: {},
	riskParams: {},
	symbols: [],
	timeframes: [],
	marketConditions: [],
	assetClasses: [],
	extractionMessages: [],
};

function CreateStrategyPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [tab, setTab] = useState(0);

	return (
		<PageTransition pageKey="strategies-create">
			<Box>
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
					<IconButton onClick={() => navigate({ to: "/strategies" })}>
						<ArrowBackIcon />
					</IconButton>
					<SectionHeader
						title="Import Strategy"
						subtitle="Add a trading strategy for the agent via URL, file upload, or manual entry"
						sx={{ mb: 0 }}
					/>
				</Box>

				<Tabs
					value={tab}
					onChange={(_, v) => setTab(v)}
					sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
				>
					<Tab label="Manual" />
					<Tab label="URL Import" icon={<LinkIcon />} iconPosition="start" />
					<Tab
						label="File Upload"
						icon={<CloudUploadIcon />}
						iconPosition="start"
					/>
				</Tabs>

				{tab === 0 && (
					<ManualTab
						queryClient={queryClient}
						onSuccess={() => navigate({ to: "/strategies" })}
					/>
				)}
				{tab === 1 && (
					<UrlImportTab
						queryClient={queryClient}
						onSuccess={() => navigate({ to: "/strategies" })}
					/>
				)}
				{tab === 2 && (
					<FileUploadTab
						queryClient={queryClient}
						onSuccess={() => navigate({ to: "/strategies" })}
					/>
				)}
			</Box>
		</PageTransition>
	);
}

// ── Manual Tab ──────────────────────────────────────────────

function ManualTab({
	queryClient,
	onSuccess,
}: {
	queryClient: ReturnType<typeof useQueryClient>;
	onSuccess: () => void;
}) {
	const [form, setForm] = useState<StrategyImportConfirm>({ ...EMPTY_FORM });

	const confirmMutation = useMutation({
		mutationFn: (data: StrategyImportConfirm) =>
			strategiesApi.confirmImport(data),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["strategies"] });
			notify.success("Strategy created");
			onSuccess();
		},
		onError: () => notify.error("Failed to create strategy"),
	});

	return (
		<StrategyForm
			form={form}
			onChange={setForm}
			onSubmit={() => confirmMutation.mutate(form)}
			submitLabel="Create Strategy"
			isLoading={confirmMutation.isPending}
		/>
	);
}

// ── URL Import Tab ──────────────────────────────────────────

function UrlImportTab({
	queryClient,
	onSuccess,
}: {
	queryClient: ReturnType<typeof useQueryClient>;
	onSuccess: () => void;
}) {
	const [url, setUrl] = useState("");
	const [extracted, setExtracted] = useState<StrategyImportConfirm | null>(
		null,
	);

	const extractMutation = useMutation({
		mutationFn: (u: string) =>
			Sentry.startSpan({ name: "strategy.extract.url", op: "ui.action" }, () =>
				strategiesApi.extractFromUrl(u),
			),
		onSuccess: (data: ExtractedStrategy) => {
			setExtracted({ ...data });
			notify.success("Strategy extracted from URL");
		},
		onError: () => notify.error("Failed to extract strategy from URL"),
	});

	const confirmMutation = useMutation({
		mutationFn: (data: StrategyImportConfirm) =>
			Sentry.startSpan(
				{ name: "strategy.import.confirm", op: "ui.action" },
				() => strategiesApi.confirmImport(data),
			),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["strategies"] });
			notify.success("Strategy imported");
			onSuccess();
		},
		onError: () => notify.error("Failed to save strategy"),
	});

	if (extracted) {
		return (
			<Card
				sx={{
					mt: 3,
					p: 3,
					border: (theme) => `1px solid ${theme.trading.border.medium}`,
				}}
			>
				<Typography
					variant="h6"
					sx={{
						mb: 2,
						display: "flex",
						alignItems: "center",
						gap: 1,
					}}
				>
					<AutoAwesomeIcon color="primary" />
					AI Extraction Preview
				</Typography>
				<SourceChip label={url} type="url" />
				<StrategyForm
					form={extracted}
					onChange={setExtracted}
					onSubmit={() => confirmMutation.mutate(extracted)}
					submitLabel="Save Strategy"
					isLoading={confirmMutation.isPending}
					onBack={() => setExtracted(null)}
				/>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
				<Typography variant="body2" color="text.secondary">
					Enter a URL to a trading strategy article, blog post, or research
					paper. AI will extract the strategy details.
				</Typography>
				<TextField
					label="URL"
					placeholder="https://example.com/strategy-article"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					fullWidth
				/>
				<Button
					variant="contained"
					onClick={() => extractMutation.mutate(url)}
					disabled={!url.trim() || extractMutation.isPending}
					startIcon={
						extractMutation.isPending ? (
							<CircularProgress size={18} />
						) : (
							<LinkIcon />
						)
					}
					sx={{ alignSelf: "flex-start" }}
				>
					{extractMutation.isPending ? "Extracting..." : "Extract Strategy"}
				</Button>
				{extractMutation.isError && (
					<Alert severity="error">
						Failed to extract strategy. Check the URL and try again.
					</Alert>
				)}
			</CardContent>
		</Card>
	);
}

// ── File Upload Tab ─────────────────────────────────────────

function FileUploadTab({
	queryClient,
	onSuccess,
}: {
	queryClient: ReturnType<typeof useQueryClient>;
	onSuccess: () => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [extracted, setExtracted] = useState<StrategyImportConfirm | null>(
		null,
	);

	const extractMutation = useMutation({
		mutationFn: (file: File) =>
			Sentry.startSpan({ name: "strategy.extract.file", op: "ui.action" }, () =>
				strategiesApi.extractFromFile(file),
			),
		onSuccess: (data: ExtractedStrategy) => {
			setExtracted({ ...data });
			notify.success("Strategy extracted from file");
		},
		onError: () => notify.error("Failed to extract strategy from file"),
	});

	const confirmMutation = useMutation({
		mutationFn: (data: StrategyImportConfirm) =>
			Sentry.startSpan(
				{ name: "strategy.import.confirm", op: "ui.action" },
				() => strategiesApi.confirmImport(data),
			),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["strategies"] });
			notify.success("Strategy imported");
			onSuccess();
		},
		onError: () => notify.error("Failed to save strategy"),
	});

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			setSelectedFile(file);
		}
	};

	if (extracted) {
		return (
			<Card
				sx={{
					mt: 3,
					p: 3,
					border: (theme) => `1px solid ${theme.trading.border.medium}`,
				}}
			>
				<Typography
					variant="h6"
					sx={{
						mb: 2,
						display: "flex",
						alignItems: "center",
						gap: 1,
					}}
				>
					<AutoAwesomeIcon color="primary" />
					AI Extraction Preview
				</Typography>
				<SourceChip label={selectedFile?.name || "file"} type="file" />
				<StrategyForm
					form={extracted}
					onChange={setExtracted}
					onSubmit={() => confirmMutation.mutate(extracted)}
					submitLabel="Save Strategy"
					isLoading={confirmMutation.isPending}
					onBack={() => setExtracted(null)}
				/>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
				<Typography variant="body2" color="text.secondary">
					Upload a strategy file (.txt, .json, .yaml, .pdf). AI will extract the
					strategy details.
				</Typography>
				<input
					ref={fileInputRef}
					type="file"
					accept={ALLOWED_EXTENSIONS}
					onChange={handleFileSelect}
					style={{ display: "none" }}
				/>
				<Box
					onClick={() => fileInputRef.current?.click()}
					sx={{
						border: (theme) => `2px dashed ${theme.trading.border.medium}`,
						borderRadius: 2,
						p: 4,
						textAlign: "center",
						cursor: "pointer",
						transition: "border-color 0.2s, background-color 0.2s",
						"&:hover": {
							borderColor: "primary.main",
							backgroundColor: (theme) =>
								`rgba(${theme.trading.primaryRgb}, 0.05)`,
						},
					}}
				>
					<CloudUploadIcon
						sx={{ fontSize: 48, color: "text.secondary", mb: 2 }}
					/>
					<Typography variant="body1" fontWeight={500}>
						Drop a file here or click to browse
					</Typography>
					<Typography variant="caption" color="text.secondary">
						Supports TXT, JSON, YAML, PDF files
					</Typography>
					{selectedFile && (
						<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
							{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
						</Typography>
					)}
				</Box>
				<Button
					variant="contained"
					onClick={() => selectedFile && extractMutation.mutate(selectedFile)}
					disabled={!selectedFile || extractMutation.isPending}
					startIcon={
						extractMutation.isPending ? (
							<CircularProgress size={18} />
						) : (
							<CloudUploadIcon />
						)
					}
					sx={{ alignSelf: "flex-start" }}
				>
					{extractMutation.isPending ? "Extracting..." : "Extract Strategy"}
				</Button>
				{extractMutation.isError && (
					<Alert severity="error">
						Failed to extract strategy. Check the file format and try again.
					</Alert>
				)}
			</CardContent>
		</Card>
	);
}

// ── Shared Strategy Form ────────────────────────────────────

function StrategyForm({
	form,
	onChange,
	onSubmit,
	submitLabel,
	isLoading,
	onBack,
}: {
	form: StrategyImportConfirm;
	onChange: (form: StrategyImportConfirm) => void;
	onSubmit: () => void;
	submitLabel: string;
	isLoading: boolean;
	onBack?: () => void;
}) {
	const updateField = <K extends keyof StrategyImportConfirm>(
		key: K,
		value: StrategyImportConfirm[K],
	) => {
		onChange({ ...form, [key]: value });
	};

	return (
		<Card>
			<CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
				<TextField
					label="Name"
					value={form.name}
					onChange={(e) => updateField("name", e.target.value)}
					required
					fullWidth
				/>
				<TextField
					label="Description"
					value={form.description}
					onChange={(e) => updateField("description", e.target.value)}
					multiline
					rows={3}
					fullWidth
				/>
				<TextField
					label="Entry Rules (JSON)"
					value={JSON.stringify(form.entryRules, null, 2)}
					onChange={(e) => {
						try {
							updateField("entryRules", JSON.parse(e.target.value));
						} catch {
							/* let user keep typing */
						}
					}}
					multiline
					rows={4}
					fullWidth
					slotProps={{
						input: { sx: { fontFamily: "monospace", fontSize: 13 } },
					}}
				/>
				<TextField
					label="Exit Rules (JSON)"
					value={JSON.stringify(form.exitRules, null, 2)}
					onChange={(e) => {
						try {
							updateField("exitRules", JSON.parse(e.target.value));
						} catch {
							/* let user keep typing */
						}
					}}
					multiline
					rows={4}
					fullWidth
					slotProps={{
						input: { sx: { fontFamily: "monospace", fontSize: 13 } },
					}}
				/>
				<TextField
					label="Risk Parameters (JSON)"
					value={JSON.stringify(form.riskParams, null, 2)}
					onChange={(e) => {
						try {
							updateField("riskParams", JSON.parse(e.target.value));
						} catch {
							/* let user keep typing */
						}
					}}
					multiline
					rows={3}
					fullWidth
					slotProps={{
						input: { sx: { fontFamily: "monospace", fontSize: 13 } },
					}}
				/>
				<TextField
					label="Symbols (comma-separated)"
					value={form.symbols.join(", ")}
					onChange={(e) =>
						updateField(
							"symbols",
							e.target.value
								.split(",")
								.map((s) => s.trim())
								.filter(Boolean),
						)
					}
					placeholder="BTC-USDT, ETH-USDT"
					fullWidth
				/>
				<TextField
					label="Timeframes (comma-separated)"
					value={form.timeframes.join(", ")}
					onChange={(e) =>
						updateField(
							"timeframes",
							e.target.value
								.split(",")
								.map((s) => s.trim())
								.filter(Boolean),
						)
					}
					placeholder="1H, 4H, 1D"
					fullWidth
				/>
				<TextField
					label="Market Conditions (comma-separated)"
					value={form.marketConditions.join(", ")}
					onChange={(e) =>
						updateField(
							"marketConditions",
							e.target.value
								.split(",")
								.map((s) => s.trim())
								.filter(Boolean),
						)
					}
					placeholder="trending, high_volatility"
					fullWidth
				/>
				<TextField
					label="Asset Classes (comma-separated)"
					value={form.assetClasses.join(", ")}
					onChange={(e) =>
						updateField(
							"assetClasses",
							e.target.value
								.split(",")
								.map((s) => s.trim())
								.filter(Boolean),
						)
					}
					placeholder="crypto, major_pairs"
					fullWidth
				/>

				<Box sx={{ display: "flex", gap: 2, mt: 1 }}>
					{onBack && (
						<Button variant="outlined" onClick={onBack}>
							Back
						</Button>
					)}
					<Button
						variant="contained"
						onClick={onSubmit}
						disabled={!form.name.trim() || isLoading}
						startIcon={isLoading ? <CircularProgress size={18} /> : undefined}
					>
						{isLoading ? "Saving..." : submitLabel}
					</Button>
				</Box>
			</CardContent>
		</Card>
	);
}

// ── Source Indicator ─────────────────────────────────────────

function SourceChip({ label, type }: { label: string; type: "url" | "file" }) {
	return (
		<Box sx={{ mb: 2 }}>
			<Chip
				icon={type === "url" ? <LinkIcon /> : <CloudUploadIcon />}
				label={`Imported from: ${label}`}
				variant="outlined"
				size="small"
			/>
		</Box>
	);
}
