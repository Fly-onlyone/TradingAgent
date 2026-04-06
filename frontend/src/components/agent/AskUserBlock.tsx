/**
 * Interactive question block — renders option buttons when
 * the agent asks the user a question via the ask_user MCP tool.
 *
 * Supports single-select (click to answer) and multi-select
 * (toggle options, then submit).
 */

import CheckIcon from "@mui/icons-material/Check";
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";
import SendIcon from "@mui/icons-material/Send";
import {
	Box,
	Button,
	Chip,
	IconButton,
	InputAdornment,
	TextField,
	Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import type { PendingQuestion } from "@/types/session";
import { spring } from "@/utils/animations/variants";

interface AskUserBlockProps {
	question: PendingQuestion;
	onAnswer: (answer: string) => void;
}

const containerVariants = {
	hidden: { opacity: 0, y: 20, scale: 0.97 },
	visible: {
		opacity: 1,
		y: 0,
		scale: 1,
		transition: spring.bouncy,
	},
};

export function AskUserBlock({ question, onAnswer }: AskUserBlockProps) {
	const [customText, setCustomText] = useState("");
	const [answered, setAnswered] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const isMulti = question.multiSelect && question.options.length > 0;

	const handleSubmit = useCallback(
		(answer: string) => {
			setAnswered(true);
			onAnswer(answer);
		},
		[onAnswer],
	);

	const handleOptionClick = useCallback(
		(option: string) => {
			if (isMulti) {
				setSelected((prev) => {
					const next = new Set(prev);
					if (next.has(option)) next.delete(option);
					else next.add(option);
					return next;
				});
			} else {
				handleSubmit(option);
			}
		},
		[isMulti, handleSubmit],
	);

	const handleMultiSubmit = useCallback(() => {
		if (selected.size > 0) {
			handleSubmit(Array.from(selected).join(", "));
		}
	}, [selected, handleSubmit]);

	const handleCustomSubmit = useCallback(() => {
		const text = customText.trim();
		if (text) {
			handleSubmit(text);
		}
	}, [customText, handleSubmit]);

	return (
		<motion.div variants={containerVariants} initial="hidden" animate="visible">
			<Box
				sx={{
					border: "1px solid",
					borderColor: "primary.main",
					borderRadius: 2,
					p: 2,
					mx: 2,
					mb: 1,
					bgcolor: "background.paper",
					opacity: answered ? 0.6 : 1,
					pointerEvents: answered ? "none" : "auto",
					transition: "opacity 0.2s",
				}}
			>
				{/* Question header */}
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
					<Chip
						icon={<QuestionMarkIcon />}
						label="Agent Question"
						size="small"
						color="primary"
						variant="outlined"
					/>
					{isMulti && (
						<Typography variant="caption" color="text.secondary">
							Select multiple
						</Typography>
					)}
				</Box>

				{/* Question text */}
				<Typography variant="body1" sx={{ mb: 2, fontWeight: 500 }}>
					{question.question}
				</Typography>

				{/* Option buttons */}
				{question.options.length > 0 && (
					<Box
						sx={{
							display: "flex",
							flexWrap: "wrap",
							gap: 1,
							mb: 1.5,
						}}
					>
						{question.options.map((option) => {
							const isSelected = selected.has(option);
							return (
								<Button
									key={option}
									variant={isSelected ? "contained" : "outlined"}
									size="small"
									onClick={() => handleOptionClick(option)}
									disabled={answered}
									startIcon={
										isMulti && isSelected ? (
											<CheckIcon fontSize="small" />
										) : undefined
									}
									sx={{
										textTransform: "none",
										borderRadius: 2,
									}}
								>
									{option}
								</Button>
							);
						})}
					</Box>
				)}

				{/* Multi-select submit button */}
				{isMulti && (
					<Button
						variant="contained"
						size="small"
						onClick={handleMultiSubmit}
						disabled={answered || selected.size === 0}
						sx={{ mb: 1.5, textTransform: "none", borderRadius: 2 }}
					>
						Submit {selected.size > 0 ? `(${selected.size})` : ""}
					</Button>
				)}

				{/* Custom text input */}
				<TextField
					fullWidth
					size="small"
					placeholder={
						question.options.length > 0
							? "Or type a custom answer..."
							: "Type your answer..."
					}
					value={customText}
					onChange={(e) => setCustomText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleCustomSubmit();
						}
					}}
					disabled={answered}
					slotProps={{
						input: {
							endAdornment: (
								<InputAdornment position="end">
									<IconButton
										size="small"
										onClick={handleCustomSubmit}
										disabled={answered || !customText.trim()}
										color="primary"
									>
										<SendIcon fontSize="small" />
									</IconButton>
								</InputAdornment>
							),
						},
					}}
					sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
				/>
			</Box>
		</motion.div>
	);
}

export default AskUserBlock;
