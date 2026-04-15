/**
 * Database Backup Admin Page
 * Export and import full database backups (superuser only)
 */

import BackupIcon from "@mui/icons-material/Backup";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import StorageIcon from "@mui/icons-material/Storage";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	Grid2 as Grid,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import { backupApi } from "@/api/endpoints/backup";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { useBackupDrop } from "@/hooks/useBackupDrop";
import { spring, staggerCascade } from "@/utils/animations/variants";
import { formatBytes } from "@/utils/formatters";
import { isTauri } from "@/utils/tauriEnv";
import { requireAdmin } from "../-guards";

const BACKUP_STALE_TIME = 60_000;

export const Route = createFileRoute("/admin/backup")({
	beforeLoad: requireAdmin,
	component: BackupAdminPage,
});

function BackupAdminPage() {
	const queryClient = useQueryClient();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [confirmImportOpen, setConfirmImportOpen] = useState(false);
	const [importResult, setImportResult] = useState<{
		collectionsRestored: number;
		totalDocuments: number;
	} | null>(null);
	const [exportedPath, setExportedPath] = useState<string | null>(null);

	const infoQuery = useQuery({
		queryKey: ["admin-backup-info"] as const,
		queryFn: () => backupApi.getBackupInfo(),
		staleTime: BACKUP_STALE_TIME,
		refetchOnMount: false,
	});

	const exportMutation = useMutation({
		mutationFn: async (): Promise<{ path: string | null }> => {
			if (!isTauri()) {
				await backupApi.exportBackup();
				return { path: null };
			}
			const { blob, filename } = await backupApi.fetchBackupBlob();
			const [{ save }, { writeFile }] = await Promise.all([
				import("@tauri-apps/plugin-dialog"),
				import("@tauri-apps/plugin-fs"),
			]);
			const chosen = await save({
				defaultPath: filename,
				filters: [{ name: "JSON", extensions: ["json"] }],
			});
			if (!chosen) return { path: null };
			const bytes = new Uint8Array(await blob.arrayBuffer());
			await writeFile(chosen, bytes);
			return { path: chosen };
		},
		onSuccess: ({ path }) => {
			setExportedPath(path);
		},
	});

	const importMutation = useMutation({
		mutationFn: (file: File) => backupApi.importBackup(file),
		onSuccess: (result) => {
			setImportResult({
				collectionsRestored: result.collectionsRestored,
				totalDocuments: result.totalDocuments,
			});
			setSelectedFile(null);
			setConfirmImportOpen(false);
			// Invalidate all admin queries since DB was replaced
			void queryClient.invalidateQueries({ queryKey: ["admin-backup-info"] });
			void queryClient.invalidateQueries({ queryKey: ["admin-db-info"] });
			void queryClient.invalidateQueries({ queryKey: ["admin-collections"] });
			void queryClient.invalidateQueries({ queryKey: ["admin-documents"] });
		},
		onError: () => {
			setConfirmImportOpen(false);
		},
	});

	const applySelectedFile = useCallback((file: File) => {
		setSelectedFile(file);
		setImportResult(null);
	}, []);

	const handleFileSelect = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (file) {
				applySelectedFile(file);
			}
			// Reset so the same file can be re-selected
			event.target.value = "";
		},
		[applySelectedFile],
	);

	const { isDragging, dndHandlers } = useBackupDrop(applySelectedFile);

	const handleImportConfirm = useCallback(() => {
		if (selectedFile) {
			importMutation.mutate(selectedFile);
		}
	}, [selectedFile, importMutation]);

	const info = infoQuery.data;

	return (
		<PageTransition pageKey="admin-backup">
			<Box>
				<SectionHeader
					title="Database Backup"
					subtitle="Export and import full database backups"
				/>

				{infoQuery.error && (
					<Alert severity="error" sx={{ mb: 3 }}>
						Failed to load backup info. You may not have admin privileges.
					</Alert>
				)}

				<motion.div
					variants={staggerCascade.container}
					initial="hidden"
					animate="visible"
				>
					<Grid container spacing={3}>
						{/* Export Card */}
						<Grid size={{ xs: 12, md: 6 }}>
							<motion.div variants={staggerCascade.item}>
								<Card sx={{ height: "100%" }}>
									<CardContent sx={{ p: 3 }}>
										<Box
											sx={{
												display: "flex",
												alignItems: "center",
												gap: 1.5,
												mb: 2.5,
											}}
										>
											<CloudDownloadIcon
												color="primary"
												sx={{ fontSize: 28 }}
											/>
											<Typography variant="h6" fontWeight={600}>
												Export Backup
											</Typography>
										</Box>

										{infoQuery.isLoading ? (
											<Box sx={{ mb: 3 }}>
												<ShimmerSkeleton
													variant="rounded"
													height={24}
													sx={{ mb: 1 }}
												/>
												<ShimmerSkeleton variant="rounded" height={24} />
											</Box>
										) : info ? (
											<Box sx={{ mb: 3 }}>
												<Box
													sx={{
														display: "flex",
														alignItems: "center",
														gap: 1,
														mb: 1.5,
													}}
												>
													<StorageIcon fontSize="small" color="action" />
													<Typography variant="body2" color="text.secondary">
														Database Overview
													</Typography>
												</Box>
												<Box
													sx={{
														display: "flex",
														flexWrap: "wrap",
														gap: 1,
														mb: 2,
													}}
												>
													<Chip
														label={`${info.collections.length} collections`}
														size="small"
														variant="outlined"
													/>
													<Chip
														label={`${info.totalDocuments.toLocaleString()} documents`}
														size="small"
														variant="outlined"
														color="primary"
													/>
													<Chip
														label={formatBytes(info.totalSizeBytes)}
														size="small"
														variant="outlined"
														color="primary"
													/>
												</Box>

												{/* Per-collection breakdown */}
												<Box
													sx={{
														maxHeight: 200,
														overflow: "auto",
														border: 1,
														borderColor: "divider",
														borderRadius: 1,
														p: 1.5,
													}}
												>
													{info.collections.map((col, index) => (
														<motion.div
															key={col.name}
															initial={{ opacity: 0, x: -10 }}
															animate={{ opacity: 1, x: 0 }}
															transition={{
																...spring.snappy,
																delay: index * 0.03,
															}}
														>
															<Box
																sx={{
																	display: "flex",
																	justifyContent: "space-between",
																	alignItems: "center",
																	py: 0.5,
																	"&:not(:last-child)": {
																		borderBottom: 1,
																		borderColor: "divider",
																	},
																}}
															>
																<Typography
																	variant="body2"
																	fontFamily="monospace"
																	fontSize="0.75rem"
																>
																	{col.name}
																</Typography>
																<Box
																	sx={{
																		display: "flex",
																		gap: 1,
																		alignItems: "center",
																	}}
																>
																	<Typography
																		variant="caption"
																		color="text.secondary"
																	>
																		{col.documentCount.toLocaleString()} docs
																	</Typography>
																	<Typography
																		variant="caption"
																		color="text.disabled"
																	>
																		{formatBytes(col.sizeBytes)}
																	</Typography>
																</Box>
															</Box>
														</motion.div>
													))}
												</Box>
											</Box>
										) : null}

										<Typography
											variant="body2"
											color="text.secondary"
											sx={{ mb: 2 }}
										>
											{isTauri()
												? "Save a full JSON backup to a location of your choice. The native file picker lets you browse folders or type a full path."
												: "Download a full JSON backup of all collections. The file uses MongoDB-safe serialisation for ObjectId, dates, and other BSON types."}
										</Typography>

										<Button
											variant="contained"
											startIcon={<CloudDownloadIcon />}
											onClick={() => {
												setExportedPath(null);
												exportMutation.mutate();
											}}
											disabled={exportMutation.isPending}
											fullWidth
										>
											{exportMutation.isPending
												? "Exporting..."
												: isTauri()
													? "Choose Location & Export"
													: "Export Backup"}
										</Button>

										{exportMutation.isSuccess && (
											<Alert severity="success" sx={{ mt: 2 }}>
												{exportedPath
													? `Backup saved to ${exportedPath}`
													: isTauri()
														? "Export cancelled."
														: "Backup downloaded successfully."}
											</Alert>
										)}
										{exportMutation.error && (
											<Alert severity="error" sx={{ mt: 2 }}>
												Export failed. Please try again.
											</Alert>
										)}
									</CardContent>
								</Card>
							</motion.div>
						</Grid>

						{/* Import Card */}
						<Grid size={{ xs: 12, md: 6 }}>
							<motion.div variants={staggerCascade.item}>
								<Card sx={{ height: "100%" }}>
									<CardContent sx={{ p: 3 }}>
										<Box
											sx={{
												display: "flex",
												alignItems: "center",
												gap: 1.5,
												mb: 2.5,
											}}
										>
											<CloudUploadIcon color="warning" sx={{ fontSize: 28 }} />
											<Typography variant="h6" fontWeight={600}>
												Import Backup
											</Typography>
										</Box>

										<Alert
											severity="warning"
											icon={<WarningAmberIcon />}
											sx={{ mb: 2.5 }}
										>
											<Typography variant="body2" fontWeight={600}>
												Destructive Operation
											</Typography>
											<Typography variant="body2">
												Importing a backup will drop all existing collections
												and replace them with the backup data. This cannot be
												undone.
											</Typography>
										</Alert>

										{/* Hidden file input */}
										<input
											ref={fileInputRef}
											type="file"
											accept=".json"
											style={{ display: "none" }}
											onChange={handleFileSelect}
										/>

										{/* Upload drop zone */}
										<Box
											onClick={() => fileInputRef.current?.click()}
											{...dndHandlers}
											sx={{
												border: 2,
												borderStyle: "dashed",
												borderColor:
													isDragging || selectedFile
														? "primary.main"
														: "divider",
												borderRadius: 2,
												p: 3,
												textAlign: "center",
												cursor: "pointer",
												transition: "all 0.2s",
												bgcolor: isDragging
													? "action.hover"
													: selectedFile
														? "action.selected"
														: "transparent",
												"&:hover": {
													borderColor: "primary.main",
													bgcolor: "action.hover",
												},
											}}
										>
											<BackupIcon
												sx={{
													fontSize: 40,
													color:
														isDragging || selectedFile
															? "primary.main"
															: "text.disabled",
													mb: 1,
												}}
											/>
											{selectedFile ? (
												<>
													<Typography variant="body2" fontWeight={600}>
														{selectedFile.name}
													</Typography>
													<Typography variant="caption" color="text.secondary">
														{formatBytes(selectedFile.size)} — Click or drop to
														change
													</Typography>
												</>
											) : (
												<>
													<Typography variant="body2" color="text.secondary">
														{isDragging
															? "Release to load backup file"
															: "Click or drop a backup file here"}
													</Typography>
													<Typography variant="caption" color="text.disabled">
														Only .json files are accepted
													</Typography>
												</>
											)}
										</Box>

										<Button
											variant="contained"
											color="warning"
											startIcon={<CloudUploadIcon />}
											onClick={() => setConfirmImportOpen(true)}
											disabled={!selectedFile || importMutation.isPending}
											fullWidth
											sx={{ mt: 2 }}
										>
											{importMutation.isPending
												? "Importing..."
												: "Import Backup"}
										</Button>

										{importResult && (
											<Alert severity="success" sx={{ mt: 2 }}>
												Import complete: {importResult.collectionsRestored}{" "}
												collections,{" "}
												{importResult.totalDocuments.toLocaleString()} documents
												restored.
											</Alert>
										)}
										{importMutation.error && (
											<Alert severity="error" sx={{ mt: 2 }}>
												Import failed. The backup file may be invalid or
												corrupted.
											</Alert>
										)}
									</CardContent>
								</Card>
							</motion.div>
						</Grid>
					</Grid>
				</motion.div>

				{/* Import Confirmation Dialog */}
				<ConfirmDialog
					open={confirmImportOpen}
					title="Confirm Database Import"
					message={`This will DROP all existing collections and replace them with the data from "${selectedFile?.name ?? "backup"}". This action cannot be undone. Are you sure you want to proceed?`}
					confirmLabel="Import & Overwrite"
					destructive
					loading={importMutation.isPending}
					onConfirm={handleImportConfirm}
					onCancel={() => setConfirmImportOpen(false)}
				/>
			</Box>
		</PageTransition>
	);
}
