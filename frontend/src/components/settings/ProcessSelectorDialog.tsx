/**
 * Dialog for browsing installed applications to select game processes.
 * Used by the embedding config to pick game exe names for deferral.
 */

import SearchIcon from "@mui/icons-material/Search";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
	Avatar,
	Box,
	Button,
	Checkbox,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	InputAdornment,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useMemo, useRef, useState } from "react";
import type { InstalledApp } from "@/api/endpoints/settings";
import { settingsApi } from "@/api/endpoints/settings";
import { useReducedMotion } from "@/utils/animations/hooks";
import { scaleIn } from "@/utils/animations/variants";

interface ProcessSelectorDialogProps {
	open: boolean;
	onClose: () => void;
	onSelect: (processes: string[]) => void;
	currentProcesses: string[];
}

function formatSize(mb: number): string {
	if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
	return `${mb} MB`;
}

function AppIcon({ app }: { app: InstalledApp }) {
	if (app.iconBase64) {
		return (
			<Avatar
				src={`data:image/png;base64,${app.iconBase64}`}
				variant="rounded"
				sx={{ width: 28, height: 28 }}
			/>
		);
	}
	// Fallback: colored initials
	const initials = app.displayName
		.split(/[\s-]+/)
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase();
	return (
		<Avatar
			variant="rounded"
			sx={{
				width: 28,
				height: 28,
				fontSize: 11,
				fontWeight: 700,
				bgcolor: "action.selected",
				color: "text.secondary",
			}}
		>
			{initials}
		</Avatar>
	);
}

export function ProcessSelectorDialog({
	open,
	onClose,
	onSelect,
	currentProcesses,
}: ProcessSelectorDialogProps) {
	const prefersReduced = useReducedMotion();
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const listRef = useRef<HTMLDivElement | null>(null);

	const appsQuery = useQuery({
		queryKey: ["installed-apps"],
		queryFn: () => settingsApi.getInstalledApps(),
		enabled: open,
		staleTime: 120_000,
	});

	const handleEntered = useCallback(() => {
		setSelected(new Set(currentProcesses));
		setSearch("");
		listRef.current?.scrollTo({ top: 0 });
	}, [currentProcesses]);

	const handleSearchChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const nextSearch = event.target.value;
			if (search.trim() && !nextSearch.trim()) {
				listRef.current?.scrollTo({ top: 0 });
			}
			setSearch(nextSearch);
		},
		[search],
	);

	const filtered = useMemo(() => {
		const apps = appsQuery.data?.apps ?? [];
		if (!search.trim()) return apps;
		const lower = search.toLowerCase();
		return apps.filter(
			(a) =>
				a.displayName.toLowerCase().includes(lower) ||
				a.exeName?.toLowerCase().includes(lower),
		);
	}, [appsQuery.data, search]);

	const handleToggle = (exeName: string | null) => {
		if (!exeName) return;
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(exeName)) {
				next.delete(exeName);
			} else {
				next.add(exeName);
			}
			return next;
		});
	};

	const handleConfirm = () => {
		onSelect(Array.from(selected));
		onClose();
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="sm"
			fullWidth
			TransitionProps={{ onEntered: handleEntered }}
		>
			<AnimatePresence>
				{open && (
					<motion.div
						variants={prefersReduced ? undefined : scaleIn}
						initial="initial"
						animate="animate"
						exit="exit"
					>
						<DialogTitle>Select Processes</DialogTitle>
						<DialogContent
							sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
						>
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ mt: -0.5 }}
							>
								Browse installed applications to select game processes
							</Typography>

							<TextField
								size="small"
								placeholder="Search applications..."
								value={search}
								onChange={handleSearchChange}
								fullWidth
								autoFocus
								slotProps={{
									input: {
										startAdornment: (
											<InputAdornment position="start">
												<SearchIcon fontSize="small" />
											</InputAdornment>
										),
									},
								}}
							/>

							<Box
								ref={listRef}
								sx={{
									maxHeight: 400,
									overflow: "auto",
									border: 1,
									borderColor: "divider",
									borderRadius: 1,
								}}
							>
								{appsQuery.isLoading ? (
									<Box
										sx={{
											display: "flex",
											justifyContent: "center",
											py: 4,
										}}
									>
										<CircularProgress size={28} />
									</Box>
								) : appsQuery.error ? (
									<Typography
										color="error"
										variant="body2"
										sx={{ p: 2, textAlign: "center" }}
									>
										Failed to load installed applications
									</Typography>
								) : filtered.length === 0 ? (
									<Typography
										color="text.secondary"
										variant="body2"
										sx={{ p: 2, textAlign: "center", fontStyle: "italic" }}
									>
										{search.trim()
											? "No applications match your search"
											: "No installed applications found"}
									</Typography>
								) : (
									filtered.map((app) => {
										const isChecked = app.exeName
											? selected.has(app.exeName)
											: false;
										const isDisabled = !app.exeName;

										return (
											<Tooltip
												key={`${app.displayName}-${app.source}`}
												title={
													isDisabled
														? "Executable not detected — cannot select"
														: ""
												}
												placement="left"
												disableHoverListener={!isDisabled}
											>
												<Box
													onClick={() => handleToggle(app.exeName)}
													sx={{
														display: "flex",
														alignItems: "center",
														gap: 1.5,
														px: 1.5,
														py: 1,
														cursor: isDisabled ? "default" : "pointer",
														opacity: isDisabled ? 0.45 : 1,
														"&:hover": isDisabled
															? {}
															: { bgcolor: "action.hover" },
														borderBottom: 1,
														borderColor: "divider",
														"&:last-child": { borderBottom: 0 },
													}}
												>
													<Checkbox
														checked={isChecked}
														disabled={isDisabled}
														size="small"
														tabIndex={-1}
														disableRipple
													/>

													<AppIcon app={app} />

													<Box sx={{ flex: 1, minWidth: 0 }}>
														<Box
															sx={{
																display: "flex",
																alignItems: "center",
																gap: 0.75,
															}}
														>
															<Typography
																variant="body2"
																noWrap
																sx={{
																	fontWeight: isChecked ? 600 : 400,
																}}
															>
																{app.displayName}
															</Typography>
															{app.source === "steam" && (
																<Chip
																	label="Steam"
																	size="small"
																	sx={{
																		height: 18,
																		fontSize: 10,
																		fontWeight: 600,
																		bgcolor: "info.dark",
																		color: "info.light",
																	}}
																/>
															)}
														</Box>
														<Typography
															variant="caption"
															sx={{
																display: "flex",
																alignItems: "center",
																gap: 0.5,
															}}
														>
															{app.exeName ? (
																<>
																	<Box
																		component="span"
																		sx={{
																			color: isChecked
																				? "primary.main"
																				: "text.secondary",
																			fontFamily: "monospace",
																			fontSize: 11,
																		}}
																	>
																		{app.exeName}
																	</Box>
																	{app.publisher && (
																		<Box
																			component="span"
																			sx={{ color: "text.secondary" }}
																		>
																			&middot; {app.publisher}
																		</Box>
																	)}
																</>
															) : (
																<Box
																	component="span"
																	sx={{
																		display: "flex",
																		alignItems: "center",
																		gap: 0.5,
																		color: "warning.main",
																	}}
																>
																	<WarningAmberIcon sx={{ fontSize: 12 }} />
																	exe not detected
																	{app.publisher && (
																		<Box
																			component="span"
																			sx={{ color: "text.secondary" }}
																		>
																			&middot; {app.publisher}
																		</Box>
																	)}
																</Box>
															)}
														</Typography>
													</Box>

													{app.installSizeMb != null && (
														<Typography
															variant="caption"
															color="text.secondary"
															sx={{
																minWidth: 55,
																textAlign: "right",
																flexShrink: 0,
															}}
														>
															{formatSize(app.installSizeMb)}
														</Typography>
													)}
												</Box>
											</Tooltip>
										);
									})
								)}
							</Box>

							<Typography variant="body2" color="text.secondary">
								{selected.size} process{selected.size !== 1 ? "es" : ""}{" "}
								selected
							</Typography>
						</DialogContent>
						<DialogActions sx={{ px: 3, pb: 2 }}>
							<Button onClick={onClose}>Cancel</Button>
							<Button variant="contained" onClick={handleConfirm}>
								Confirm Selection
							</Button>
						</DialogActions>
					</motion.div>
				)}
			</AnimatePresence>
		</Dialog>
	);
}
