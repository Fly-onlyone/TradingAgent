/**
 * Dialog for browsing and selecting running system processes.
 * Used by the embedding config to pick game processes from a live list.
 */

import SearchIcon from "@mui/icons-material/Search";
import {
	Box,
	Button,
	Checkbox,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	InputAdornment,
	TextField,
	Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { settingsApi } from "@/api/endpoints/settings";
import { useReducedMotion } from "@/utils/animations/hooks";
import { listStagger, scaleIn } from "@/utils/animations/variants";

interface ProcessSelectorDialogProps {
	open: boolean;
	onClose: () => void;
	onSelect: (processes: string[]) => void;
	currentProcesses: string[];
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

	const processQuery = useQuery({
		queryKey: ["system-processes"],
		queryFn: () => settingsApi.getSystemProcesses(),
		enabled: open,
		staleTime: 10_000,
	});

	// Sync selection state when dialog opens with current processes
	const handleEntered = useCallback(() => {
		setSelected(new Set(currentProcesses));
		setSearch("");
	}, [currentProcesses]);

	const filtered = useMemo(() => {
		const processes = processQuery.data?.processes ?? [];
		if (!search.trim()) return processes;
		const lower = search.toLowerCase();
		return processes.filter((p) => p.name.toLowerCase().includes(lower));
	}, [processQuery.data, search]);

	const handleToggle = (name: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(name)) {
				next.delete(name);
			} else {
				next.add(name);
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
							<TextField
								size="small"
								placeholder="Filter by name..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
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
								sx={{ mt: 0.5 }}
							/>

							<Box
								sx={{
									maxHeight: 380,
									overflow: "auto",
									border: 1,
									borderColor: "divider",
									borderRadius: 1,
								}}
							>
								{processQuery.isLoading ? (
									<Box
										sx={{
											display: "flex",
											justifyContent: "center",
											py: 4,
										}}
									>
										<CircularProgress size={28} />
									</Box>
								) : processQuery.error ? (
									<Typography
										color="error"
										variant="body2"
										sx={{ p: 2, textAlign: "center" }}
									>
										Failed to load processes
									</Typography>
								) : filtered.length === 0 ? (
									<Typography
										color="text.secondary"
										variant="body2"
										sx={{ p: 2, textAlign: "center", fontStyle: "italic" }}
									>
										{search.trim()
											? "No processes match your filter"
											: "No processes found"}
									</Typography>
								) : (
									<motion.div
										variants={
											prefersReduced ? undefined : listStagger.container
										}
										initial="hidden"
										animate="visible"
									>
										{filtered.map((proc) => {
											const isChecked = selected.has(proc.name);
											return (
												<motion.div
													key={proc.name}
													variants={
														prefersReduced ? undefined : listStagger.item
													}
												>
													<Box
														onClick={() => handleToggle(proc.name)}
														sx={{
															display: "flex",
															alignItems: "center",
															gap: 1,
															px: 1.5,
															py: 0.75,
															cursor: "pointer",
															"&:hover": {
																bgcolor: "action.hover",
															},
															borderBottom: 1,
															borderColor: "divider",
															"&:last-child": { borderBottom: 0 },
														}}
													>
														<Checkbox
															checked={isChecked}
															size="small"
															tabIndex={-1}
															disableRipple
														/>
														<Typography
															variant="body2"
															sx={{
																flex: 1,
																fontWeight: isChecked ? 600 : 400,
															}}
														>
															{proc.name}
														</Typography>
														<Typography
															variant="caption"
															color="text.secondary"
															sx={{ minWidth: 50, textAlign: "right" }}
														>
															PID {proc.pid}
														</Typography>
														<Typography
															variant="caption"
															color="text.secondary"
															sx={{ minWidth: 70, textAlign: "right" }}
														>
															{proc.memoryMb} MB
														</Typography>
													</Box>
												</motion.div>
											);
										})}
									</motion.div>
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
