/**
 * Database Admin Page
 * View all collections and documents (superuser only)
 */

import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
	Database,
	Eye,
	Info,
	Pencil,
	Save,
	Search,
	Trash2,
	X,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import { useState } from "react";
import { adminApi } from "@/api/endpoints/admin";
import {
	adminCollectionsQueryOptions,
	adminDbInfoQueryOptions,
	adminDocumentsQueryOptions,
} from "@/api/queryOptions/admin";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CollectionInfo, DatabaseInfo } from "@/types";
import { spring } from "@/utils/animations/variants";
import { formatBytes, formatUptime } from "@/utils/formatters";
import { requireAdmin } from "../-guards";

export const Route = createFileRoute("/admin/database")({
	beforeLoad: requireAdmin,
	component: DatabaseAdminPage,
});

function DatabaseAdminPage() {
	const queryClient = useQueryClient();
	const [selectedCollection, setSelectedCollection] = useState<string | null>(
		null,
	);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [search, setSearch] = useState("");
	const [viewDocument, setViewDocument] = useState<Record<
		string,
		unknown
	> | null>(null);
	const [isEditing, setIsEditing] = useState(false);
	const [editJson, setEditJson] = useState("");
	const [editError, setEditError] = useState<string | null>(null);
	const [deleteConfirm, setDeleteConfirm] = useState<{
		collection: string;
		id: string;
	} | null>(null);

	// Fetch database info
	const dbInfoQuery = useQuery(adminDbInfoQueryOptions());

	// Fetch collections
	const collectionsQuery = useQuery(adminCollectionsQueryOptions());

	// Fetch documents for selected collection
	const documentsQuery = useQuery({
		...adminDocumentsQueryOptions(selectedCollection, {
			page,
			pageSize,
			search,
		}),
		enabled: !!selectedCollection,
		placeholderData: keepPreviousData,
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationFn: ({ collection, id }: { collection: string; id: string }) =>
			adminApi.deleteDocument(collection, id),
		onSuccess: () => {
			setDeleteConfirm(null);
			void queryClient.invalidateQueries({
				queryKey: ["admin-documents"],
			});
			void queryClient.invalidateQueries({
				queryKey: ["admin-collections"],
			});
			void queryClient.invalidateQueries({ queryKey: ["admin-db-info"] });
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationFn: ({
			collection,
			id,
			document,
		}: {
			collection: string;
			id: string;
			document: Record<string, unknown>;
		}) => adminApi.updateDocument(collection, id, document),
		onSuccess: (updatedDoc) => {
			setViewDocument(updatedDoc);
			setIsEditing(false);
			setEditError(null);
			void queryClient.invalidateQueries({
				queryKey: ["admin-documents"],
			});
		},
	});

	const handleCollectionClick = (collectionName: string) => {
		setSelectedCollection(collectionName);
		setPage(1);
		setSearch("");
	};

	const handleSearch = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			setPage(1);
		}
	};

	const handleViewDocument = (doc: Record<string, unknown>) => {
		setViewDocument(doc);
		setIsEditing(false);
		setEditError(null);
	};

	const handleStartEdit = () => {
		setEditJson(JSON.stringify(viewDocument, null, 2));
		setIsEditing(true);
		setEditError(null);
	};

	const handleCancelEdit = () => {
		setIsEditing(false);
		setEditError(null);
	};

	const handleSaveEdit = () => {
		try {
			const parsed = JSON.parse(editJson);
			if (
				typeof parsed !== "object" ||
				parsed === null ||
				Array.isArray(parsed)
			) {
				setEditError("Document must be a JSON object");
				return;
			}
			const docId = viewDocument?._id as string;
			if (!docId || !selectedCollection) return;
			updateMutation.mutate({
				collection: selectedCollection,
				id: docId,
				document: parsed,
			});
		} catch {
			setEditError("Invalid JSON syntax");
		}
	};

	const handleDeleteClick = (doc: Record<string, unknown>) => {
		const id = doc._id as string;
		if (!id || !selectedCollection) return;
		setDeleteConfirm({ collection: selectedCollection, id });
	};

	const formatValue = (value: unknown): string => {
		if (value === null || value === undefined) return "-";
		if (typeof value === "object") return JSON.stringify(value);
		return String(value);
	};

	const truncate = (str: string, maxLength: number = 50): string => {
		if (str.length <= maxLength) return str;
		return `${str.slice(0, maxLength)}...`;
	};

	const dbInfo: DatabaseInfo | undefined = dbInfoQuery.data;
	const totalDocs = documentsQuery.data?.total ?? 0;
	const totalPages = Math.ceil(totalDocs / pageSize);

	return (
		<PageTransition pageKey="admin-database">
			<div>
				<SectionHeader
					title="Database"
					subtitle="Manage MongoDB collections and documents"
				/>

				{collectionsQuery.error && (
					<Alert variant="destructive" className="mb-6">
						<AlertDescription>
							Failed to load collections. You may not have admin
							privileges.
						</AlertDescription>
					</Alert>
				)}

				{/* Database Info Header */}
				{dbInfoQuery.isLoading ? (
					<ShimmerSkeleton variant="rounded" height={72} sx={{ mb: 3 }} />
				) : dbInfo ? (
					<div className="glass-card p-4 mb-6">
						<div className="flex items-center gap-2 mb-3">
							<Info className="h-4 w-4 text-[var(--primary)]" />
							<span className="text-sm font-semibold text-[var(--text-primary)]">
								Connection Info
							</span>
						</div>
						<div className="flex flex-wrap gap-1.5">
							<Badge variant="outline">
								DB: {dbInfo.databaseName}
							</Badge>
							<Badge variant="outline">Host: {dbInfo.host}</Badge>
							<Badge variant="outline">
								MongoDB {dbInfo.serverVersion}
							</Badge>
							<Badge variant="outline">
								Uptime: {formatUptime(dbInfo.uptimeSeconds)}
							</Badge>
							<Badge variant="outline" className="text-[var(--primary)]">
								{dbInfo.totalDocuments.toLocaleString()} docs
							</Badge>
							<Badge variant="outline" className="text-[var(--primary)]">
								Storage: {formatBytes(dbInfo.totalStorageSize)}
							</Badge>
							<Badge variant="outline">
								Indexes: {formatBytes(dbInfo.totalIndexSize)}
							</Badge>
						</div>
					</div>
				) : null}

				{/* Collection Cards */}
				<div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
					{collectionsQuery.isLoading
						? [...Array(8)].map((_, i) => (
								<ShimmerSkeleton
									key={i}
									variant="rounded"
									height={80}
								/>
							))
						: collectionsQuery.data?.map(
								(collection: CollectionInfo, index: number) => (
									<motion.div
										key={collection.name}
										initial={{ opacity: 0, y: 30, scale: 0.95 }}
										animate={{ opacity: 1, y: 0, scale: 1 }}
										transition={{
											...spring.snappy,
											delay: index * 0.04,
										}}
									>
										<button
											type="button"
											className={cn(
												"glass-card w-full cursor-pointer transition-all duration-200 py-3 px-4 text-left hover:-translate-y-0.5",
												selectedCollection === collection.name
													? "ring-2 ring-[var(--primary)]"
													: "ring-1 ring-[var(--border-subtle)] hover:ring-[var(--primary)]",
											)}
											onClick={() =>
												handleCollectionClick(collection.name)
											}
										>
											<div className="flex items-center gap-2">
												<Database className="h-4 w-4 text-[var(--primary)] shrink-0" />
												<div className="min-w-0">
													<p className="text-sm font-semibold text-[var(--text-primary)] truncate">
														{collection.displayName}
													</p>
													<div className="flex gap-1 flex-wrap mt-1">
														<Badge
															variant="outline"
															className="text-xs"
														>
															{collection.documentCount.toLocaleString()}
														</Badge>
														{collection.storageSize > 0 && (
															<Badge
																variant="outline"
																className="text-xs"
															>
																{formatBytes(
																	collection.storageSize,
																)}
															</Badge>
														)}
													</div>
												</div>
											</div>
										</button>
									</motion.div>
								),
							)}
				</div>

				{/* Document Table */}
				{selectedCollection && (
					<div className="glass-card overflow-hidden">
						<div className="p-4 border-b border-[var(--border-subtle)]">
							<div className="flex justify-between items-center">
								<h6 className="text-lg font-semibold text-[var(--text-primary)]">
									{collectionsQuery.data?.find(
										(c) => c.name === selectedCollection,
									)?.displayName || selectedCollection}
								</h6>
								<div className="relative w-[250px]">
									<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
									<Input
										placeholder="Search by ID or text..."
										value={search}
										onChange={(e) => setSearch(e.target.value)}
										onKeyDown={handleSearch}
										className="pl-10"
									/>
								</div>
							</div>
						</div>

						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>ID</TableHead>
									<TableHead>Data Preview</TableHead>
									<TableHead className="text-right">
										Actions
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{documentsQuery.isLoading
									? [...Array(5)].map((_, i) => (
											<TableRow key={i}>
												<TableCell>
													<ShimmerSkeleton />
												</TableCell>
												<TableCell>
													<ShimmerSkeleton />
												</TableCell>
												<TableCell>
													<ShimmerSkeleton width={40} />
												</TableCell>
											</TableRow>
										))
									: documentsQuery.data?.documents.map((doc) => {
											const id = doc._id as string;
											const preview = Object.entries(doc)
												.filter(([key]) => key !== "_id")
												.slice(0, 3)
												.map(
													([key, value]) =>
														`${key}: ${truncate(formatValue(value), 30)}`,
												)
												.join(" | ");

											return (
												<TableRow
													key={id}
													className="hover:bg-[var(--interactive-hover)]"
												>
													<TableCell>
														<span className="font-mono text-xs">
															{id}
														</span>
													</TableCell>
													<TableCell>
														<span className="text-sm text-[var(--text-secondary)] truncate block max-w-[500px]">
															{truncate(preview, 80)}
														</span>
													</TableCell>
													<TableCell className="text-right">
														<TooltipProvider>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon-sm"
																		onClick={() =>
																			handleViewDocument(
																				doc,
																			)
																		}
																	>
																		<Eye className="h-4 w-4" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>
																	View
																</TooltipContent>
															</Tooltip>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="destructive"
																		size="icon-sm"
																		onClick={() =>
																			handleDeleteClick(
																				doc,
																			)
																		}
																	>
																		<Trash2 className="h-4 w-4" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>
																	Delete
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>
													</TableCell>
												</TableRow>
											);
										})}
							</TableBody>
						</Table>

						{/* Pagination */}
						{documentsQuery.data && (
							<div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)]">
								<div className="flex items-center gap-2">
									<span className="text-sm text-[var(--text-secondary)]">
										Rows per page:
									</span>
									<select
										value={pageSize}
										onChange={(e) => {
											setPageSize(
												Number.parseInt(e.target.value, 10),
											);
											setPage(1);
										}}
										className="bg-transparent text-sm text-[var(--text-primary)] border border-[var(--border-subtle)] rounded px-2 py-1"
									>
										{[10, 20, 50, 100].map((opt) => (
											<option key={opt} value={opt}>
												{opt}
											</option>
										))}
									</select>
								</div>
								<div className="flex items-center gap-3">
									<span className="text-sm text-[var(--text-secondary)]">
										{(page - 1) * pageSize + 1}–
										{Math.min(page * pageSize, totalDocs)} of{" "}
										{totalDocs}
									</span>
									<div className="flex gap-1">
										<Button
											variant="ghost"
											size="sm"
											disabled={page <= 1}
											onClick={() => setPage(page - 1)}
										>
											Prev
										</Button>
										<Button
											variant="ghost"
											size="sm"
											disabled={page >= totalPages}
											onClick={() => setPage(page + 1)}
										>
											Next
										</Button>
									</div>
								</div>
							</div>
						)}
					</div>
				)}

				{!selectedCollection && !collectionsQuery.isLoading && (
					<div className="glass-card p-8 text-center">
						<Database className="h-12 w-12 text-[var(--text-secondary)] mx-auto mb-4" />
						<p className="text-[var(--text-secondary)]">
							Select a collection to view documents
						</p>
					</div>
				)}

				{/* Document View/Edit Dialog */}
				<Dialog
					open={!!viewDocument}
					onOpenChange={(open) => {
						if (!open) {
							setViewDocument(null);
							setIsEditing(false);
							setEditError(null);
						}
					}}
				>
					<DialogContent
						className="sm:max-w-2xl max-h-[85vh] flex flex-col"
						showCloseButton={false}
					>
						<DialogHeader>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<DialogTitle>Document Details</DialogTitle>
									{!isEditing && (
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="ghost"
														size="icon-sm"
														onClick={handleStartEdit}
													>
														<Pencil className="h-4 w-4" />
													</Button>
												</TooltipTrigger>
												<TooltipContent>
													Edit document
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									)}
								</div>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => {
										setViewDocument(null);
										setIsEditing(false);
										setEditError(null);
									}}
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						</DialogHeader>

						<div className="flex-1 overflow-y-auto py-4 border-t border-b border-[var(--border-subtle)]">
							{editError && (
								<Alert variant="destructive" className="mb-4">
									<AlertDescription>{editError}</AlertDescription>
								</Alert>
							)}
							{updateMutation.error && (
								<Alert variant="destructive" className="mb-4">
									<AlertDescription>
										Failed to update document
									</AlertDescription>
								</Alert>
							)}
							{isEditing ? (
								<Textarea
									value={editJson}
									onChange={(e) => setEditJson(e.target.value)}
									className="min-h-[360px] max-h-[500px] font-mono text-xs"
								/>
							) : (
								<pre className="bg-[var(--bg-default)] p-4 rounded-lg overflow-auto text-xs font-mono max-h-[500px]">
									{JSON.stringify(viewDocument, null, 2)}
								</pre>
							)}
						</div>

						<DialogFooter>
							{isEditing ? (
								<>
									<Button
										variant="outline"
										onClick={handleCancelEdit}
									>
										Cancel
									</Button>
									<Button
										onClick={handleSaveEdit}
										disabled={updateMutation.isPending}
									>
										<Save className="h-4 w-4 mr-2" />
										{updateMutation.isPending
											? "Saving..."
											: "Save"}
									</Button>
								</>
							) : (
								<Button
									variant="outline"
									onClick={() => {
										setViewDocument(null);
										setIsEditing(false);
									}}
								>
									Close
								</Button>
							)}
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Delete Confirmation Dialog */}
				<ConfirmDialog
					open={!!deleteConfirm}
					title="Confirm Delete"
					message={`Are you sure you want to delete this document? This action cannot be undone.${deleteConfirm ? `\n\n${deleteConfirm.collection} / ${deleteConfirm.id}` : ""}`}
					confirmLabel="Delete"
					destructive
					loading={deleteMutation.isPending}
					onConfirm={() =>
						deleteConfirm && deleteMutation.mutate(deleteConfirm)
					}
					onCancel={() => setDeleteConfirm(null)}
				/>
			</div>
		</PageTransition>
	);
}
