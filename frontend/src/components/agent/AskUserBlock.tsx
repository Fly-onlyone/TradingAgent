/**
 * Interactive question block — renders option buttons when
 * the agent asks the user a question via the ask_user MCP tool.
 */

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
import { useState } from "react";
import type { PendingQuestion } from "@/api/websocket/useAgentSocket";
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

	const handleSelect = (answer: string) => {
		setAnswered(true);
		onAnswer(answer);
	};

	const handleCustomSubmit = () => {
		const text = customText.trim();
		if (text) {
			handleSelect(text);
		}
	};

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
						{question.options.map((option) => (
							<Button
								key={option}
								variant="outlined"
								size="small"
								onClick={() => handleSelect(option)}
								disabled={answered}
								sx={{
									textTransform: "none",
									borderRadius: 2,
								}}
							>
								{option}
							</Button>
						))}
					</Box>
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
