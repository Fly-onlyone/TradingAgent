/**
 * Tool call list — expand/collapse controlled by global header toggle.
 */

import { Box, Typography } from "@mui/material";
import type { ToolCall } from "@/api/websocket/useAgentSocket";
import { ToolCallBlock } from "./ToolCallBlock";

interface ToolCallListProps {
	toolCalls: ToolCall[];
	expandAllTools?: boolean;
}

export function ToolCallList({ toolCalls, expandAllTools }: ToolCallListProps) {
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
			</Box>
			<Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
				{toolCalls.map((tool) => (
					<ToolCallBlock
						key={tool.id}
						toolCall={tool}
						forceExpanded={expandAllTools}
					/>
				))}
			</Box>
		</Box>
	);
}

export default ToolCallList;
