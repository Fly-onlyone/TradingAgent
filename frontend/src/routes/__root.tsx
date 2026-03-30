import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { AppShell } from "../components/layout/AppShell";

export const Route = createRootRoute({
	component: () => (
		<ErrorBoundary>
			<AppShell>
				<Outlet />
			</AppShell>
		</ErrorBoundary>
	),
});
