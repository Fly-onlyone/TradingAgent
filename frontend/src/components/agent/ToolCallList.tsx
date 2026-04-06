/**
 * Tool call list with individual expand/collapse + "Expand all" toggle.
 */

import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import type { ToolCall } from "@/api/websocket/useAgentSocket";
import { ToolCallBlock } from "./ToolCallBlock";

interface ToolCallListProps {
	toolCalls: ToolCall[];
	defaultExpandAll?: boolean;
}

export function ToolCallList({
	toolCalls,
	defaultExpandAll = false,
}: ToolCallListProps) {
	const [expandAll, setExpandAll] = useState<boolean | null>(
		defaultExpandAll ? true : null,
	);

	return (
		<Box>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					mb: 0.5,
				}}
			>
				<Typography variant="caption" color="text.secondary">
					Tools Used ({toolCalls.length})
				</Typography>
				<Tooltip
					title={expandAll ? "Collapse all" : "Expand all"}
					arrow
					placement="top"
				>
					<IconButton
						size="small"
						onClick={() => setExpandAll((prev) => !prev)}
						sx={{ p: 0.25 }}
					>
						{expandAll ? (
							<UnfoldLessIcon sx={{ fontSize: 18 }} />
						) : (
							<UnfoldMoreIcon sx={{ fontSize: 18 }} />
						)}
					</IconButton>
				</Tooltip>
			</Box>
			<Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
				{toolCalls.map((tool) => (
					<ToolCallBlock
						key={tool.id}
						toolCall={tool}
						forceExpanded={expandAll ?? undefined}
					/>
				))}
			</Box>
		</Box>
	);
}

export default ToolCallList;
