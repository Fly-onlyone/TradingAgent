/**
 * Create Strategy Page — Manual, URL Import, or File Upload
 */

import * as Sentry from "@sentry/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Link, Loader2, Sparkles, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { strategiesApi } from "@/api/endpoints/strategies";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
};

function CreateStrategyPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	return (
		<PageTransition pageKey="strategies-create">
			<div>
				<div className="mb-2 flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => navigate({ to: "/strategies" })}
					>
						<ArrowLeft className="size-4" />
					</Button>
					<SectionHeader
						title="Import Strategy"
						subtitle="Add a trading strategy for the agent via URL, file upload, or manual entry"
						sx={{ mb: 0 }}
					/>
				</div>

				<Tabs defaultValue="manual">
					<TabsList className="mb-6">
						<TabsTrigger value="manual">Manual</TabsTrigger>
						<TabsTrigger value="url">
							<Link className="size-4" />
							URL Import
						</TabsTrigger>
						<TabsTrigger value="file">
							<Upload className="size-4" />
							File Upload
						</TabsTrigger>
					</TabsList>

					<TabsContent value="manual">
						<ManualTab
							queryClient={queryClient}
							onSuccess={() => navigate({ to: "/strategies" })}
						/>
					</TabsContent>
					<TabsContent value="url">
						<UrlImportTab
							queryClient={queryClient}
							onSuccess={() => navigate({ to: "/strategies" })}
						/>
					</TabsContent>
					<TabsContent value="file">
						<FileUploadTab
							queryClient={queryClient}
							onSuccess={() => navigate({ to: "/strategies" })}
						/>
					</TabsContent>
				</Tabs>
			</div>
		</PageTransition>
	);
}

// -- Manual Tab --

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

// -- URL Import Tab --

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
			Sentry.startSpan(
				{ name: "strategy.extract.url", op: "ui.action" },
				() => strategiesApi.extractFromUrl(u),
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
			<Card className="mt-6 border border-[var(--border-medium)] p-6">
				<h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
					<Sparkles className="size-5 text-primary" />
					AI Extraction Preview
				</h3>
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
			<CardContent className="flex flex-col gap-4">
				<p className="text-sm text-muted-foreground">
					Enter a URL to a trading strategy article, blog post, or research
					paper. AI will extract the strategy details.
				</p>
				<div>
					<label
						htmlFor="url-input"
						className="mb-1.5 block text-sm font-medium"
					>
						URL
					</label>
					<Input
						id="url-input"
						placeholder="https://example.com/strategy-article"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
					/>
				</div>
				<Button
					className="self-start"
					onClick={() => extractMutation.mutate(url)}
					disabled={!url.trim() || extractMutation.isPending}
				>
					{extractMutation.isPending ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Link className="size-4" />
					)}
					{extractMutation.isPending ? "Extracting..." : "Extract Strategy"}
				</Button>
				{extractMutation.isError && (
					<Alert variant="destructive">
						<AlertDescription>
							Failed to extract strategy. Check the URL and try again.
						</AlertDescription>
					</Alert>
				)}
			</CardContent>
		</Card>
	);
}

// -- File Upload Tab --

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
			Sentry.startSpan(
				{ name: "strategy.extract.file", op: "ui.action" },
				() => strategiesApi.extractFromFile(file),
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
			<Card className="mt-6 border border-[var(--border-medium)] p-6">
				<h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
					<Sparkles className="size-5 text-primary" />
					AI Extraction Preview
				</h3>
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
			<CardContent className="flex flex-col gap-4">
				<p className="text-sm text-muted-foreground">
					Upload a strategy file (.txt, .json, .yaml, .pdf). AI will extract the
					strategy details.
				</p>
				<input
					ref={fileInputRef}
					type="file"
					accept={ALLOWED_EXTENSIONS}
					onChange={handleFileSelect}
					className="hidden"
				/>
				<div
					onClick={() => fileInputRef.current?.click()}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ")
							fileInputRef.current?.click();
					}}
					role="button"
					tabIndex={0}
					className="cursor-pointer rounded-lg border-2 border-dashed border-[var(--border-medium)] p-8 text-center transition-colors hover:border-primary hover:bg-primary/5"
				>
					<Upload className="mx-auto mb-4 size-12 text-muted-foreground" />
					<p className="font-medium">
						Drop a file here or click to browse
					</p>
					<p className="text-xs text-muted-foreground">
						Supports PDF, TXT, MD files
					</p>
					{selectedFile && (
						<p className="mt-2 text-sm text-muted-foreground">
							{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)}{" "}
							KB)
						</p>
					)}
				</div>
				<Button
					className="self-start"
					onClick={() => selectedFile && extractMutation.mutate(selectedFile)}
					disabled={!selectedFile || extractMutation.isPending}
				>
					{extractMutation.isPending ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Upload className="size-4" />
					)}
					{extractMutation.isPending ? "Extracting..." : "Extract Strategy"}
				</Button>
				{extractMutation.isError && (
					<Alert variant="destructive">
						<AlertDescription>
							Failed to extract strategy. Check the file format and try again.
						</AlertDescription>
					</Alert>
				)}
			</CardContent>
		</Card>
	);
}

// -- Shared Strategy Form --

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
			<CardContent className="flex flex-col gap-5">
				<div>
					<label
						htmlFor="strategy-name"
						className="mb-1.5 block text-sm font-medium"
					>
						Name *
					</label>
					<Input
						id="strategy-name"
						value={form.name}
						onChange={(e) => updateField("name", e.target.value)}
						required
					/>
				</div>
				<div>
					<label
						htmlFor="strategy-description"
						className="mb-1.5 block text-sm font-medium"
					>
						Description
					</label>
					<Textarea
						id="strategy-description"
						value={form.description}
						onChange={(e) => updateField("description", e.target.value)}
						rows={3}
					/>
				</div>
				<div>
					<label
						htmlFor="entry-rules"
						className="mb-1.5 block text-sm font-medium"
					>
						Entry Rules (JSON)
					</label>
					<Textarea
						id="entry-rules"
						className="font-mono text-[13px]"
						value={JSON.stringify(form.entryRules, null, 2)}
						onChange={(e) => {
							try {
								updateField("entryRules", JSON.parse(e.target.value));
							} catch {
								/* let user keep typing */
							}
						}}
						rows={4}
					/>
				</div>
				<div>
					<label
						htmlFor="exit-rules"
						className="mb-1.5 block text-sm font-medium"
					>
						Exit Rules (JSON)
					</label>
					<Textarea
						id="exit-rules"
						className="font-mono text-[13px]"
						value={JSON.stringify(form.exitRules, null, 2)}
						onChange={(e) => {
							try {
								updateField("exitRules", JSON.parse(e.target.value));
							} catch {
								/* let user keep typing */
							}
						}}
						rows={4}
					/>
				</div>
				<div>
					<label
						htmlFor="risk-params"
						className="mb-1.5 block text-sm font-medium"
					>
						Risk Parameters (JSON)
					</label>
					<Textarea
						id="risk-params"
						className="font-mono text-[13px]"
						value={JSON.stringify(form.riskParams, null, 2)}
						onChange={(e) => {
							try {
								updateField("riskParams", JSON.parse(e.target.value));
							} catch {
								/* let user keep typing */
							}
						}}
						rows={3}
					/>
				</div>
				<div>
					<label
						htmlFor="symbols"
						className="mb-1.5 block text-sm font-medium"
					>
						Symbols (comma-separated)
					</label>
					<Input
						id="symbols"
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
					/>
				</div>
				<div>
					<label
						htmlFor="timeframes"
						className="mb-1.5 block text-sm font-medium"
					>
						Timeframes (comma-separated)
					</label>
					<Input
						id="timeframes"
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
					/>
				</div>
				<div>
					<label
						htmlFor="market-conditions"
						className="mb-1.5 block text-sm font-medium"
					>
						Market Conditions (comma-separated)
					</label>
					<Input
						id="market-conditions"
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
					/>
				</div>
				<div>
					<label
						htmlFor="asset-classes"
						className="mb-1.5 block text-sm font-medium"
					>
						Asset Classes (comma-separated)
					</label>
					<Input
						id="asset-classes"
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
					/>
				</div>

				<div className="mt-2 flex gap-4">
					{onBack && (
						<Button variant="outline" onClick={onBack}>
							Back
						</Button>
					)}
					<Button
						onClick={onSubmit}
						disabled={!form.name.trim() || isLoading}
					>
						{isLoading && <Loader2 className="size-4 animate-spin" />}
						{isLoading ? "Saving..." : submitLabel}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

// -- Source Indicator --

function SourceChip({ label, type }: { label: string; type: "url" | "file" }) {
	return (
		<div className="mb-4">
			<Badge variant="outline">
				{type === "url" ? (
					<Link className="size-3" />
				) : (
					<Upload className="size-3" />
				)}
				Imported from: {label}
			</Badge>
		</div>
	);
}
