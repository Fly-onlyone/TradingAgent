import { Chip, Tooltip } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { atkHealthQueryOptions } from "@/api/atkQueries";

/**
 * Compact status chip for the application status bar.
 *
 * Green = ATK child running + accepting writes.
 * Yellow = running but in sandbox-toggle drain (writes denied).
 * Red = process down OR last_list_tools_error.
 *
 * Tooltip surfaces the profile, tool count, and last error text so a
 * user can self-diagnose without opening the backend logs.
 */
export function AtkStatusChip() {
	const { data, isError } = useQuery(atkHealthQueryOptions());

	if (!data && !isError) {
		return (
			<Chip size="small" label="ATK ?" variant="outlined" sx={{ ml: 1 }} />
		);
	}

	const running = data?.running ?? false;
	const accepting = data?.accepting ?? false;
	const profile = data?.profile ?? "?";
	const toolCount = data?.tool_count ?? 0;
	const lastError =
		data?.last_error ?? (isError ? "health endpoint unreachable" : null);

	const color: "success" | "warning" | "error" = !running
		? "error"
		: !accepting
			? "warning"
			: "success";

	const label = !running
		? "ATK off"
		: !accepting
			? `ATK reloading (${profile})`
			: `ATK ${profile} · ${toolCount}`;

	const tip = lastError
		? `Last error: ${lastError}`
		: running && accepting
			? `Profile=${profile}, ${toolCount} tools available`
			: "ATK is not running — install with `npm install -g @okx_ai/okx-trade-mcp@1.3` (dev) or reinstall the app (production)";

	return (
		<Tooltip title={tip} arrow>
			<Chip
				size="small"
				label={label}
				color={color}
				variant="outlined"
				sx={{ ml: 1 }}
			/>
		</Tooltip>
	);
}
